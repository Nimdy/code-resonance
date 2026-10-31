'use strict';
// Package manifests: no code symbols, but the names under which the project's own packages are imported, so those
// imports resolve to the folder that declares them, as each toolchain does:
//   package.json   `name` (`@scope/core`, `@scope/core/utils`), a JS/TS workspace package (no kind);
//   go.mod         `module github.com/acme/app`: Go import paths under it name directories of the module (kind 'go');
//   Cargo.toml     the crate name ([lib] name, else [package] name, `-` read as `_`), for `use other_crate::..` in a
//                  Cargo workspace (kind 'rust');
//   composer.json  PSR-4 autoload prefixes (`"App\\": "app/"`), so `use App\Models\User` is app/Models/User.php
//                  (kind 'php', one manifest per prefix and folder).
// engine/languages/index.js packageTargets() says how each kind's packages map to files.
const path=require('node:path').posix;
const MANIFEST=/(?:^|\/)(?:package\.json|go\.mod|Cargo\.toml|composer\.json)$/;
function npm(source){
  try{const json=JSON.parse(source);if(typeof json.name==='string'&&/^(?:@[\w.-]+\/)?[\w.-]{1,120}$/.test(json.name))return json.name;}catch{}
  return null;
}
function goMod(source){
  const m=/^[ \t]*module[ \t]+"?([^\s"]+)"?/m.exec(source.replace(/\/\/.*$/gm,''));
  return m&&/^[\w.~-]+(?:\/[\w.~-]+)*$/.test(m[1])&&m[1].length<=200?m[1]:null;
}
function cargo(source){
  let section='',pkg=null,lib=null;
  for(const raw of source.split('\n')){
    const line=raw.replace(/\s#.*$|^#.*$/,'').trim(),s=/^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if(s){section=s[1];continue;}
    const m=/^name\s*=\s*["']([A-Za-z0-9_-]{1,64})["']/.exec(line);
    if(m){if(section==='package')pkg=m[1];else if(section==='lib')lib=m[1];}
  }
  const name=lib||pkg;return name?name.replace(/-/g,'_'):null;
}
function composer(source,dir){
  let json;try{json=JSON.parse(source);}catch{return [];}
  const out=[];
  for(const section of [json?.autoload,json?.['autoload-dev']]){
    const map=section&&typeof section==='object'?section['psr-4']:null;if(!map||typeof map!=='object')continue;
    for(const [prefix,dirs] of Object.entries(map)){
      const name=prefix.replace(/\\+$/,'').split('\\').filter(Boolean).join('/');
      if(!name||!/^[A-Za-z_][\w/]{0,160}$/.test(name))continue;
      for(const d of [].concat(dirs)){if(typeof d!=='string')continue;
        const target=path.normalize(path.join(dir,d)).replace(/\/+$/,'');
        if(target.startsWith('..')||target.startsWith('/'))continue;out.push({name,dir:target,kind:'php'});}
    }
  }
  return out.slice(0,32);
}
function analyze(file,source){
  const dir=path.dirname(file),base=path.basename(file);let manifest=null;
  if(base==='package.json'){const name=npm(source);if(name)manifest={name,dir};}
  else if(base==='go.mod'){const name=goMod(source);if(name)manifest={name,dir,kind:'go'};}
  else if(base==='Cargo.toml'){const name=cargo(source);if(name)manifest={name,dir,kind:'rust'};}
  else if(base==='composer.json'){const list=composer(source,dir);if(list.length)manifest=list;}
  return {symbols:[],imports:[],errors:0,lines:source.split('\n').length,...(manifest?{manifest}:{})};
}
module.exports={id:'manifest',test:file=>MANIFEST.test(file),analyze};

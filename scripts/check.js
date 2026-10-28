#!/usr/bin/env node
'use strict';
// npm run check: a syntax check of every first-party JavaScript file under ROOTS, found by directory (nothing runs). Each
// file is parsed by this Node the way it is loaded: as an ES module (`node --input-type=module --check`, the source on
// stdin) or as a script (`node --check <file>`). A syntax error, a missing root or no files at all fails.
//   node scripts/check.js [--list]
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const REPO=path.resolve(__dirname,'..');
const ROOTS=['public','engine','receiver','extension','scripts','sdk','packs/examples','packs/template'];
// Not ours, or not source: the vendored three.js build, installed dependencies, tool and editor folders.
const skip=(name,rel)=>name==='node_modules'||name.startsWith('.')||rel==='public/vendor';
// What the browser loads as ES modules (public/worlds also says so in its package.json). The rest are scripts: the
// classic browser scripts (app, score, music, recording), the UMD composition files and everything Node requires.
const MODULES=['public/construct.js','public/providers.js','public/ui/','public/worlds/','packs/'];
const isModule=f=>f.endsWith('.mjs')||!f.endsWith('.cjs')&&MODULES.some(m=>m.endsWith('/')?f.startsWith(m):f===m);
// Node 22 quietly reads a script that has import or export as a module; the browser would not, so neither does this.
const NO_DETECT=process.allowedNodeEnvironmentFlags.has('--no-experimental-detect-module')?['--no-experimental-detect-module']:[];
function files(){
  const out=[],walk=dir=>{
    for(const e of fs.readdirSync(path.join(REPO,dir),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
      const rel=`${dir}/${e.name}`;
      if(e.isDirectory()){if(!skip(e.name,rel))walk(rel);}else if(e.isFile()&&/\.[cm]?js$/.test(e.name))out.push(rel);
    }};
  for(const root of ROOTS){if(!fs.statSync(path.join(REPO,root),{throwIfNoEntry:false})?.isDirectory())throw new Error(`check: ${root}/ is missing`);walk(root);}
  return out;
}
const checkFile=(file,module)=>module?spawnSync(process.execPath,['--input-type=module','--check'],{input:fs.readFileSync(file),encoding:'utf8'})
  :spawnSync(process.execPath,[...NO_DETECT,'--check',file],{encoding:'utf8'});
if(require.main===module){
  let list=[],failed=0;try{list=files();}catch(e){console.error(e.message);process.exit(1);}
  if(process.argv.includes('--list'))for(const f of list)console.log(`${isModule(f)?'module':'script'}  ${f}`);
  else{
    for(const f of list){const mod=isModule(f),r=checkFile(path.join(REPO,f),mod);
      if(r.status!==0){failed++;console.error(`\n✗ ${f} (${mod?'ES module':'script'})\n${(r.stderr||String(r.error||'')).trim()}`);}}
    const m=list.filter(isModule).length;
    console.log(`check: ${list.length} files (${list.length-m} scripts, ${m} ES modules), ${failed?`${failed} with syntax errors`:'no syntax errors'}`);
    process.exitCode=failed||!list.length?1:0;
  }
}
module.exports={ROOTS,files,isModule,checkFile};

'use strict';
// The documentation stays reachable: the Control Center's documents (public/ui/markdown.js DOCS) are exactly the
// receiver's fixed list and each is served; every openDoc() and documentation list in the interface names one of them;
// and every relative link in the repository's Markdown, with its #section, leads somewhere. Text parsing only.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {tempDir,startService}=require('./helpers');
const REPO=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(REPO,f),'utf8');
const names=text=>new Set([...text.matchAll(/'([\w./-]+\.md)'/g)].map(m=>m[1]));
// A statement's text, from its start to its first semicolon (these lists hold none).
const statement=(text,start)=>{const i=text.indexOf(start);assert(i>=0,`${start} not found`);return text.slice(i,text.indexOf(';',i));};
function walk(dir,keep,out=[]){
  for(const e of fs.readdirSync(path.join(REPO,dir),{withFileTypes:true})){const rel=path.posix.join(dir,e.name);
    if(e.isDirectory()){if(!e.name.startsWith('.')&&e.name!=='node_modules'&&rel!=='qualification/results')walk(rel,keep,out);}
    else if(keep(e.name))out.push(rel);}
  return out;
}
const DOCS=names(statement(read('public/ui/markdown.js'),'export const DOCS='));
test('the interface opens only documents the receiver serves',async t=>{
  assert.deepEqual([...names(statement(read('receiver/server.js'),'const DOCS='))].sort(),[...DOCS].sort());
  for(const f of walk('public/ui',n=>n.endsWith('.js'))){const text=read(f);
    for(const m of text.matchAll(/openDoc\('([^']+)'\)/g))assert(DOCS.has(m[1]),`${f}: openDoc('${m[1]}')`);
    for(const m of text.matchAll(/\b[A-Z_]+_DOCS=\[[^\]]*\]/g))for(const n of names(m[0]))assert(DOCS.has(n),`${f}: ${n}`);}
  const svc=await startService(t,{port:0,dataDir:tempDir(t,'cr-docs-'),quiet:true});
  for(const n of DOCS)assert.equal((await fetch(`http://127.0.0.1:${svc.port}/docs/${n}`)).status,200,n);
});
// GitHub's heading anchors: lower case, punctuation dropped, spaces as hyphens, repeats numbered.
const unfenced=md=>md.replace(/^```[\s\S]*?^```/gm,''),prose=md=>unfenced(md).replace(/`[^`\n]*`/g,'');
function anchors(md){
  const seen=new Map(),out=new Set();
  for(const m of unfenced(md).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)){
    const s=m[1].replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-');
    const n=seen.get(s)||0;seen.set(s,n+1);out.add(n?`${s}-${n}`:s);}
  return out;
}
test('every relative link in the Markdown leads to a file and section that exist',()=>{
  const broken=[];
  for(const f of walk('.',n=>n.endsWith('.md'))){const own=read(f);
    for(const [,target] of prose(own).matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)){
      if(/^[a-z][a-z0-9+.-]*:/i.test(target))continue;
      const [file,anchor]=decodeURI(target).split('#'),abs=file?path.join(REPO,path.dirname(f),file):path.join(REPO,f);
      if(!fs.existsSync(abs))broken.push(`${f}: ${target}`);
      else if(anchor&&abs.endsWith('.md')&&!anchors(fs.readFileSync(abs,'utf8')).has(anchor))broken.push(`${f}: ${target} (no such section)`);}}
  assert.deepEqual(broken,[]);
});

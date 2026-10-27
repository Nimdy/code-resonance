'use strict';
// Builds the receiver data directories used for films and world qualification. Real data only; anything altered is
// labelled as a supplemental fixture in its own README (and in its project name) so it can never pass for a recording.
//
// node visual/datasets.js <out-dir> [--excalidraw <repo>] [--self <repo>]
//   lumen          the committed Lumen Recipes recording (raw journal, copied so derived files stay out of git)
//   lumen-pause    SUPPLEMENTAL: the same events with a 100 s pause inserted after the first commit (timestamps after
//                  it shifted by +100 s; nothing else changed), to show inactivity and resumption mid-project
//   excalidraw     the first 450 source files of an Excalidraw checkout, indexed as an existing project (baseline)
//   self           Code Resonance's own first-parent git history, replayed as a 20 minute session (history-session.js)
const path=require('node:path');
const fs=require('node:fs');
const REPO=path.resolve(__dirname,'../..');
const {validateEvent,sha}=require(path.join(REPO,'receiver/protocol'));
const {isFileEligible}=require(path.join(REPO,'extension/filters'));
const {projectIdForRoot}=require(path.join(REPO,'sdk/project-id'));
const {build:buildHistory}=require('../session/history-session');
const zlib=require('node:zlib');
const LUMEN=path.join(__dirname,'..','recordings','lumen-recipes');
const RAW=['id','salt','events.jsonl','blobs'];
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
function copyRaw(from,to){
  fs.rmSync(to,{recursive:true,force:true});
  for(const p of fs.readdirSync(path.join(from,'projects'))){
    const src=path.join(from,'projects',p),dst=path.join(to,'projects',p);fs.mkdirSync(dst,{recursive:true});
    for(const f of RAW)if(fs.existsSync(path.join(src,f)))fs.cpSync(path.join(src,f),path.join(dst,f),{recursive:true});
  }
}
function lumen(out){copyRaw(LUMEN,path.join(out,'lumen'));return 'lumen';}
function lumenPause(out,pauseMs=100000){
  const dir=path.join(out,'lumen-pause');copyRaw(LUMEN,dir);
  const p=fs.readdirSync(path.join(dir,'projects'))[0],file=path.join(dir,'projects',p,'events.jsonl');
  const events=fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
  const commit=events.find(e=>e.kind==='repository.commit.observed');
  // The pause begins 12 s after the first commit so its effects finish first.
  const at=commit.receivedAt+12000;let shifted=0;
  for(const e of events){if(e.receivedAt>at){e.ts+=pauseMs;e.receivedAt+=pauseMs;shifted++;}if(e.kind==='workspace.started')e.name='lumen-recipes (supplemental: 100 s pause)';}
  fs.writeFileSync(file,events.map(e=>JSON.stringify(e)).join('\n')+'\n');
  fs.writeFileSync(path.join(dir,'README.md'),`# Supplemental fixture: Lumen Recipes with an inserted pause\n\nDerived from qualification/recordings/lumen-recipes by visual/datasets.js. Every event is the real recorded event;\nthe ${shifted} events after ${new Date(at).toISOString()} (12 s after the first commit) are shifted by +${pauseMs/1000} s to create a period of\ninactivity followed by resumed development. No events were added or removed.\n`);
  return 'lumen-pause';
}
const SOURCE=/\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|py)$/;const SKIP=new Set(['node_modules','.git','dist','build','.vscode']);
function walk(d,root,acc=[]){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(SKIP.has(e.name))continue;const f=path.join(d,e.name);
  if(e.isDirectory())walk(f,root,acc);else{const rel=path.relative(root,f).split(path.sep).join('/');if(SOURCE.test(e.name)&&isFileEligible(rel)&&fs.statSync(f).size<=150*1024)acc.push(rel);}}return acc;}
// An existing project as the extension indexes it on first capture: one baseline snapshot per source file.
function snapshotProject(repo,out,name,limit=450,start=Date.UTC(2026,9,23,12,0,0)){
  const projectId=projectIdForRoot(`/workspace/${name}`),dir=path.join(out,name,'projects',sha(projectId));
  fs.rmSync(path.join(out,name),{recursive:true,force:true});fs.mkdirSync(path.join(dir,'blobs'),{recursive:true});fs.writeFileSync(path.join(dir,'id'),projectId);
  const files=walk(repo,repo).slice(0,limit);let seq=0,received=start;const lines=[];
  const add=(ts,kind,fields={})=>{const e=validateEvent({v:1,id:`snap-${String(++seq).padStart(6,'0')}`,ts,kind,projectId,sessionId:'snapshot',origin:'unknown',...fields});
    received=Math.max(received,ts+400);e.receivedAt=received;
    if(typeof e.content==='string'){const blob=sha(e.content),f=path.join(dir,'blobs',blob+'.gz');if(!fs.existsSync(f))fs.writeFileSync(f,zlib.gzipSync(Buffer.from(e.content)));const {content,...rest}=e;lines.push({...rest,contentHash:blob});}
    else lines.push(e);};
  add(start,'workspace.started',{name});add(start+300,'project.baseline',{meta:{count:files.length,truncated:files.length>=limit}});
  files.forEach((f,i)=>add(start+600+i*4,'document.snapshot',{file:f,content:fs.readFileSync(path.join(repo,f),'utf8'),meta:{reason:'baseline'}}));
  add(start+600+files.length*4+2000,'workspace.stopped');
  fs.writeFileSync(path.join(dir,'events.jsonl'),lines.map(l=>JSON.stringify(l)).join('\n')+'\n');
  return name;
}
if(require.main===module){
  const out=path.resolve(process.argv[2]||path.join(__dirname,'..','results','datasets'));fs.mkdirSync(out,{recursive:true});
  const built=[lumen(out),lumenPause(out)];
  if(arg('excalidraw'))built.push(snapshotProject(path.resolve(arg('excalidraw')),out,'excalidraw'));
  if(arg('self')){fs.rmSync(path.join(out,'self'),{recursive:true,force:true});buildHistory({repo:path.resolve(arg('self')),out:path.join(out,'self'),commits:Number(arg('commits',60)),minutes:Number(arg('minutes',20))});built.push('self');}
  console.log(JSON.stringify({out,built}));
}
module.exports={lumen,lumenPause,snapshotProject};

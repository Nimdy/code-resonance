#!/usr/bin/env node
'use strict';
// Thin wrapper around qualification/visual/film.js: pick the highlight, gate on a public title, always --copy.
// Playwright and ffmpeg-static stay in qualification/; the product has no runtime deps.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {sha}=require('../receiver/protocol');
const highlight=require('../engine/highlight');
const REPO=path.resolve(__dirname,'..');
const DEMO_ID=sha('CODE RESONANCE — FICTIONAL DEMO');
const DEFAULT_OUT=path.join(REPO,'qualification','results','films','last-night.webm');
const TITLE_MSG='This night has no public title. Set one in Visual Studio, or pass --allow-untitled.';
const CI_HINT='cd qualification && npm ci';
const GPUS=['auto','amd','nvidia','off'];
const GPU_MSG=`--gpu takes ${GPUS.join(', ')} (or nothing, which is auto).`;
function flag(argv,k){const i=argv.indexOf(`--${k}`);return i<0?undefined:argv[i+1];}
function has(argv,k){return argv.includes(`--${k}`);}
function gpuArg(argv){
  const i=argv.indexOf('--gpu');
  if(i<0)return {set:false,value:undefined};
  const v=argv[i+1];
  if(v==null||String(v).startsWith('--'))return {set:true,value:'auto'};
  return {set:true,value:v};
}
function wslNvidiaUserspace(fsApi){
  for(const p of ['/usr/lib/wsl/lib/libcuda.so','/usr/lib/wsl/lib/libcuda.so.1','/usr/lib/wsl/lib/libnvidia-ml.so.1']){
    try{if(fsApi.existsSync(p))return true;}catch{}
  }
  return false;
}
function gpuLooksPresent(fsApi){
  try{
    if(fsApi.existsSync('/dev/dxg'))return wslNvidiaUserspace(fsApi)?'nvidia':'auto';
  }catch{}
  try{if(fsApi.existsSync('/sys/module/amdgpu'))return 'amd';}catch{}
  try{if(fsApi.existsSync('/sys/module/nvidia'))return 'nvidia';}catch{}
  try{
    const drm=fsApi.readdirSync('/sys/class/drm');
    if(drm.some(n=>n!=='version'&&/amdgpu/i.test(n)))return 'amd';
    if(drm.some(n=>n!=='version'&&/nvidia/i.test(n)))return 'nvidia';
  }catch{}
  return null;
}
function listProjects(dataDir,fsApi){
  const base=path.join(dataDir,'projects');let dir=[];
  try{dir=fsApi.readdirSync(base,{withFileTypes:true});}catch{return [];}
  const items=[];
  for(const e of dir){
    if(!e.isDirectory()||!/^[0-9a-f]{64}$/.test(e.name))continue;
    try{
      const id=String(fsApi.readFileSync(path.join(base,e.name,'id'),'utf8')).trim();
      if(sha(id)!==e.name)continue;
      let demonstration=id===DEMO_ID;
      try{const ev=JSON.parse(fsApi.readFileSync(path.join(base,e.name,'evidence.json'),'utf8'));if(ev.demonstration)demonstration=true;}catch{}
      items.push({id,dir:path.join(base,e.name),demonstration});
    }catch{}
  }
  return items;
}
function readWindows(file,fsApi){
  let text;try{text=fsApi.readFileSync(file,'utf8');}catch{return [];}
  const windows=[];
  for(const line of text.split('\n')){
    if(!line)continue;
    try{windows.push(JSON.parse(line));}catch{}
  }
  return windows;
}
// The renderer holds a copy of the data directory until it exits: a signal to this wrapper is passed on, and the wrapper
// waits for the renderer to remove its copy. Ctrl-C reaches both; the renderer ignores the second signal.
function runChild(spawnFn,cmd,args,opts){
  const child=spawnFn(cmd,args,opts);
  if(typeof child==='number')return Promise.resolve(child);
  if(child&&typeof child.then==='function')return child;
  const forward=signal=>{try{child.kill(signal);}catch{}};
  for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.on(s,forward);
  return new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('close',(c,signal)=>resolve(c??(signal?128+(os.constants.signals[signal]||1):1)));
  }).finally(()=>{for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.off(s,forward);});
}
async function main(argv,opts={}){
  const fsApi=opts.fs||fs;
  const spawnFn=opts.spawn||spawn;
  const log=opts.log||console.log;
  const err=opts.err||console.error;
  const exists=opts.exists||(p=>fsApi.existsSync(p));
  const probe=opts.probe||(()=>gpuLooksPresent(fsApi));
  const qualDir=opts.qualDir||path.join(REPO,'qualification');
  const dataDir=path.resolve(flag(argv,'data')||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
  if(!exists(path.join(qualDir,'node_modules','playwright-core'))||!exists(path.join(qualDir,'node_modules','ffmpeg-static'))){
    err(CI_HINT);return 1;
  }
  const asked=gpuArg(argv);
  if(asked.set&&!GPUS.includes(asked.value)){err(GPU_MSG);return 1;}
  const projects=listProjects(dataDir,fsApi);
  let projectId=flag(argv,'project');
  if(projectId){
    const hit=projects.find(p=>p.id===projectId);
    if(!hit){err('Project not found.');return 1;}
  }else{
    const real=projects.filter(p=>!p.demonstration);
    if(!real.length){err('No recorded project. Pass --project <id>.');return 1;}
    if(real.length>1){err('Several projects are recorded; pass --project <id>.');return 1;}
    projectId=real[0].id;
  }
  const project=projects.find(p=>p.id===projectId);
  let title=null;
  try{title=JSON.parse(fsApi.readFileSync(path.join(project.dir,'recipe.json'),'utf8')).title;}catch{}
  if((title==null||title==='')&&!has(argv,'allow-untitled')){err(TITLE_MSG);return 1;}
  let from=flag(argv,'from'),to=flag(argv,'to'),speed=flag(argv,'speed');
  if((from==null)!==(to==null)){err('Pass both --from and --to, or neither.');return 1;}
  let picked=null;
  if(from==null){
    picked=highlight.fromWindows(readWindows(path.join(project.dir,'performance.jsonl'),fsApi));
    if(!picked){err('Nothing in this recording scores as a highlight.');return 1;}
    from=picked.from;to=picked.to;if(speed==null)speed=picked.speed;
    log(`highlight ${from}..${to} @ ${picked.speed}x score ${picked.score} ${picked.reasons.join(', ')}`);
  }
  from=Number(from);to=Number(to);speed=Number(speed==null?4:speed);
  if(!Number.isFinite(from)||!Number.isFinite(to)||!(to>from)){err('Invalid --from/--to.');return 1;}
  if(!Number.isFinite(speed)||speed<=0){err('Invalid --speed.');return 1;}
  const labels=flag(argv,'labels')||'cinematic';
  if(!['cinematic','stream','explorer','off'].includes(labels)){err('Invalid --labels.');return 1;}
  const out=path.resolve(flag(argv,'out')||DEFAULT_OUT);
  let gpu=null;
  if(asked.set){
    if(asked.value==='off')gpu=null;
    else gpu=asked.value;
  }else{
    const found=probe();
    if(found===true)gpu='amd';
    else if(found)gpu=found;
  }
  const filmJs=path.join(qualDir,'visual','film.js');
  const args=[filmJs,'--data',dataDir,'--project',projectId,'--copy','--labels',labels,
    '--speed',String(speed),'--from',String(from),'--to',String(to),'--out',out];
  // A GPU this wrapper found itself (not one --gpu asked for): a browser that cannot use it renders in software.
  if(gpu)args.push('--gpu',gpu,...(asked.set?[]:['--gpu-fallback']));
  const code=await runChild(spawnFn,process.execPath,args,{stdio:'inherit'});
  return code||0;
}
if(require.main===module)main(process.argv.slice(2)).then(c=>{if(c)process.exitCode=c;},e=>{console.error(e);process.exitCode=1;});
module.exports={main,DEFAULT_OUT,TITLE_MSG,CI_HINT,GPU_MSG,gpuLooksPresent,runChild};

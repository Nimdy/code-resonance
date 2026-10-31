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
// Vertical clips (--vertical or --aspect 9:16) for Reels, Shorts and TikTok: 1080 × 1920, 30 s by default, H.264 and AAC
// in MP4 (the bundled ffmpeg has both; --format webm for VP9 and Opus).
const VERTICAL_OUT={mp4:path.join(REPO,'qualification','results','films','last-night-vertical.mp4'),webm:path.join(REPO,'qualification','results','films','last-night-vertical.webm')};
const VERTICAL_SIZE=[1080,1920],VERTICAL_S=30,END_CARD_S=3,FADE_IN_S=1,FADE_OUT_S=2.5;
const ASPECT_MSG='--aspect takes 16:9 (a film) or 9:16 (a vertical clip).';
function flag(argv,k){const i=argv.indexOf(`--${k}`);return i<0?undefined:argv[i+1];}
function has(argv,k){return argv.includes(`--${k}`);}
// The film's shape from the arguments: a landscape film (the default, exactly as before), or a vertical clip.
function clipShape(argv){
  const aspect=flag(argv,'aspect');
  if(aspect!==undefined&&aspect!=='16:9'&&aspect!=='9:16')return {error:ASPECT_MSG};
  const vertical=has(argv,'vertical')||aspect==='9:16';
  if(has(argv,'vertical')&&aspect==='16:9')return {error:'--vertical is 9:16: leave out --aspect 16:9.'};
  if(!vertical){
    for(const k of ['duration','size','format'])if(has(argv,k))return {error:`--${k} is for vertical clips (--vertical).`};
    return {vertical:false};
  }
  let duration=VERTICAL_S;
  if(has(argv,'duration')){duration=Number(flag(argv,'duration'));if(!Number.isFinite(duration)||duration<3||duration>180)return {error:'--duration takes seconds, from 3 to 180.'};}
  let [width,height]=VERTICAL_SIZE;
  if(has(argv,'size')){const m=/^(\d{3,4})x(\d{3,4})$/.exec(String(flag(argv,'size')||''));
    if(!m||+m[1]%2||+m[2]%2||!(+m[2]>+m[1]))return {error:'--size takes an even portrait size such as 1080x1920 or 540x960.'};width=+m[1];height=+m[2];}
  const out=flag(argv,'out'),format=has(argv,'format')?flag(argv,'format'):out&&/\.webm$/i.test(out)?'webm':'mp4';
  if(!['mp4','webm'].includes(format))return {error:'--format takes mp4 or webm.'};
  if(out&&!new RegExp(`\\.${format}$`,'i').test(out))return {error:`--out must end in .${format}.`};
  return {vertical:true,duration,width,height,format};
}
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
  const shape=clipShape(argv);
  if(shape.error){err(shape.error);return 1;}
  let from=flag(argv,'from'),to=flag(argv,'to'),speed=flag(argv,'speed');
  if((from==null)!==(to==null)){err('Pass both --from and --to, or neither.');return 1;}
  let picked=null;
  if(from==null){
    const windows=readWindows(path.join(project.dir,'performance.jsonl'),fsApi);
    picked=highlight.fromWindows(windows);
    if(!picked){err('Nothing in this recording scores as a highlight.');return 1;}
    from=picked.from;to=picked.to;if(speed==null)speed=picked.speed;
    log(`highlight ${from}..${to} @ ${picked.speed}x score ${picked.score} ${picked.reasons.join(', ')}`);
    // A vertical clip: --duration seconds of the highlight at its speed, centred on its key moment.
    if(shape.vertical){
      const {start,end}=highlight.bounds(windows);
      const c=highlight.clip(highlight.intentsOf(windows),{...picked,speed:Number(speed)},{seconds:shape.duration,start,end});
      from=c.from;to=c.to;
      log(`clip ${from}..${to} (${c.seconds.toFixed(1)} s) centred on ${c.keyType||'the window'} at ${Math.round(c.key)}`);
    }
  }
  from=Number(from);to=Number(to);speed=Number(speed==null?4:speed);
  if(!Number.isFinite(from)||!Number.isFinite(to)||!(to>from)){err('Invalid --from/--to.');return 1;}
  if(!Number.isFinite(speed)||speed<=0){err('Invalid --speed.');return 1;}
  const labels=flag(argv,'labels')||'cinematic';
  if(!['cinematic','stream','explorer','off'].includes(labels)){err('Invalid --labels.');return 1;}
  const out=path.resolve(flag(argv,'out')||(shape.vertical?VERTICAL_OUT[shape.format]:DEFAULT_OUT));
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
  // A vertical clip: its size, the title card at its start, the end card (the public title and Code Resonance) and the
  // music faded in and out.
  if(shape.vertical)args.push('--width',String(shape.width),'--height',String(shape.height),'--title-card','--end-card',String(END_CARD_S),
    '--fade-in',String(FADE_IN_S),'--fade-out',String(FADE_OUT_S));
  const world=flag(argv,'world');
  if(world!=null){if(!['living','construct','city'].includes(world)){err('--world takes living, construct or city.');return 1;}args.push('--world',world);}
  const family=flag(argv,'family');
  if(family!=null){if(!/^[a-z][a-z0-9-]{1,40}$/.test(family)){err('Invalid --family.');return 1;}args.push('--family',family);}
  // A GPU this wrapper found itself (not one --gpu asked for): a browser that cannot use it renders in software.
  if(gpu)args.push('--gpu',gpu,...(asked.set?[]:['--gpu-fallback']));
  const code=await runChild(spawnFn,process.execPath,args,{stdio:'inherit'});
  return code||0;
}
if(require.main===module)main(process.argv.slice(2)).then(c=>{if(c)process.exitCode=c;},e=>{console.error(e);process.exitCode=1;});
module.exports={main,DEFAULT_OUT,VERTICAL_OUT,TITLE_MSG,CI_HINT,GPU_MSG,ASPECT_MSG,clipShape,gpuLooksPresent,runChild};

'use strict';
// Shared browser harness for the visual qualifications: a receiver on a dataset, a headless Chromium (SwiftShader by
// default, or the AMD integrated GPU under WSL2), the film page and frame-exact rendering.
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const projectOf=dir=>fs.readFileSync(path.join(dir,'projects',fs.readdirSync(path.join(dir,'projects'))[0],'id'),'utf8');
// The NVIDIA GPU is never used: callers abort when the renderer string is not the requested adapter.
// Audio may start without a user gesture (recordings and the audio qualification need the music running).
const AUTOPLAY='--autoplay-policy=no-user-gesture-required';
function launch(gpu=null){
  if(gpu==='amd')return chromium.launch({args:['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu',AUTOPLAY],
    env:{...process.env,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}});
  return chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist',AUTOPLAY]});
}
async function rendererOf(browser){const probe=await browser.newPage();await probe.goto('about:blank');
  const r=await probe.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),d=gl&&gl.getExtension('WEBGL_debug_renderer_info');return gl?gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER):'none';});
  await probe.close();return r;}
async function withService(dir,fn,options={}){const svc=await createService({port:0,dataDir:dir,...options}).start();try{await svc.flush();return await fn(svc);}finally{await svc.stop();}}
async function recipeAction(svc,project,action){
  const r=await fetch(`http://127.0.0.1:${svc.port}/api/recipe?id=${project}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`http://127.0.0.1:${svc.port}`},body:JSON.stringify({action})});
  if(!r.ok)throw new Error(await r.text());return r.json();
}
const setFamily=(svc,project,family)=>recipeAction(svc,project,{type:'family',family});
async function filmPage(browser,svc,project,{width=1280,height=720,query=''}={}){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${svc.port}/?film=1&world=living&project=${project}${query}`);await page.waitForFunction(()=>!!window.__film);
  const info=await page.evaluate(p=>window.__film.open({project:p,speed:1}),project);
  return {page,info,errors};
}
// Renders from `from` to `to` (performance ms) at `fps`, returning the last frame (JPEG data URL).
async function renderTo(page,from,to,fps=15){await page.evaluate(x=>window.__film.seek(x),from);let img;for(let t=from;t<=to;t+=1000/fps)img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/fps]);return img;}
// A small luminance thumbnail of a frame, to compare motion between moments.
async function thumb(page,dataUrl){return page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=96;c.height=54;const g=c.getContext('2d');g.drawImage(img,0,0,96,54);
  const d=g.getImageData(0,0,96,54).data;const out=[];for(let i=0;i<d.length;i+=4)out.push(Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]));return out;},dataUrl);}
const diff=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);
// The live player (?qual=1 test hooks), replaying the recorded performance at `speed` so the picture and the music
// have real events. `init` runs before the page's own scripts (e.g. to remove a browser feature).
async function playerPage(browser,svc,project,{speed=4,init=null,width=1280,height=720}={}){
  const page=await browser.newPage({viewport:{width,height},acceptDownloads:true});const errors=[];
  if(init)await page.addInitScript(init);
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
  await page.goto(`http://127.0.0.1:${svc.port}/?world=living&project=${project}&qual=1`);await page.waitForFunction(()=>!!window.__qual);
  await page.evaluate(()=>document.getElementById('replayBtn').click());
  await page.waitForFunction(()=>!document.getElementById('playBtn').disabled,null,{timeout:30000});
  await page.evaluate(s=>{const sel=document.getElementById('speedSelect');sel.value=String(s);sel.dispatchEvent(new Event('change'));document.getElementById('playBtn').click();},speed);
  return {page,errors};
}
// Waits until the living world shows w ({remote, family} or {remote, look}) and has delivered statistics.
async function worldReady(page,w,timeout=60000){
  await page.waitForFunction(w=>{const s=window.__qual.world();if(s.selectedWorld!=='living'||s.remote!==w.remote||!window.__qual.stats())return false;
    return w.family?s.family===w.family:w.look?s.look===w.look:true;},w,{timeout});
}
// Memory (resident, MB) of this process and every process it started (Chromium's browser, GPU and renderer
// processes), from /proc; null elsewhere.
function processMemory(){
  if(process.platform!=='linux')return null;
  const kids=new Map();
  for(const p of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const ppid=+fs.readFileSync(`/proc/${p}/stat`,'utf8').split(') ')[1].split(' ')[1];if(!kids.has(ppid))kids.set(ppid,[]);kids.get(ppid).push(+p);}catch{}}
  const out={node:0,browser:0,gpu:0,renderer:0,other:0};const visit=pid=>{for(const k of kids.get(pid)||[]){try{
    const rss=+((/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${k}/status`,'utf8'))||[])[1]||0)/1024,cmd=fs.readFileSync(`/proc/${k}/cmdline`,'utf8');
    const type=/--type=renderer/.test(cmd)?'renderer':/--type=gpu-process/.test(cmd)?'gpu':/--type=/.test(cmd)?'other':/chrom|headless_shell/i.test(cmd)?'browser':'other';out[type]+=rss;}catch{}visit(k);}};
  out.node=+((/VmRSS:\s+(\d+)/.exec(fs.readFileSync('/proc/self/status','utf8'))||[])[1]||0)/1024;visit(process.pid);
  return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,Math.round(v)]));
}
function checker(){const checks=[];return {checks,check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}};}
module.exports={REPO,projectOf,launch,rendererOf,withService,recipeAction,setFamily,filmPage,playerPage,worldReady,processMemory,renderTo,thumb,diff,sha,checker};

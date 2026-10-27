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
function launch(gpu=null){
  if(gpu==='amd')return chromium.launch({args:['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu'],
    env:{...process.env,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}});
  return chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
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
function checker(){const checks=[];return {checks,check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}};}
module.exports={REPO,projectOf,launch,rendererOf,withService,recipeAction,setFamily,filmPage,renderTo,thumb,diff,sha,checker};

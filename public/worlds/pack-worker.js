// The visual pack worker: where a pack's code runs. It lives inside the isolated pack frame (sandbox="allow-scripts",
// opaque origin), as a dedicated worker created from a blob URL, so it inherits the frame's content policy (no
// connections at all) and has no DOM, no access to the frame's document, no navigation and no WebRTC. A pack that hangs
// blocks only this thread: the frame and the player stay responsive, and removing the frame terminates the worker.
//
// It runs the same world host as the player on the frame's canvases (transferred as OffscreenCanvas), fed only with the
// privacy-safe performance view (view.js). Every render request is acknowledged with its cost and the depth of the
// message queue, so the player can bound the frames in flight; films and recordings also get the composited bitmap.
import {createWorld} from './host.js';
import {SDK_VERSION} from './sdk.js';
import {rng,hash} from './core.js';
const send=(message,transfer=[])=>self.postMessage(message,transfer);
// Determinism guard: pack code that reaches for Math.random or Date.now gets values derived from the performance time
// of the frame being rendered (the API offers sdk.random(key) and the frame clock; these only stop accidents).
let frameTime=0,seed=1,random=rng(1);
Math.random=()=>random();
Date.now=()=>Math.floor(frameTime);
let host=null,canvas=null,overlay=null,rendered=0,skipped=0,semantic=0,lastRenderMs=0,lastStats=0,disposing=false,out=null,outG=null;
const fail=(e,kind='exception')=>send({type:'error',kind,message:String(e?.message||e||'error').slice(0,300)});
self.addEventListener('error',e=>{e.preventDefault?.();fail(e.error||e.message);});
self.addEventListener('unhandledrejection',e=>fail(e.reason));
async function moduleFrom(source){
  if(typeof source!=='string')throw new Error('Pack module missing');
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{return await import(url);}finally{URL.revokeObjectURL(url);}
}
async function init(m){
  canvas=m.canvas;overlay=m.overlay;seed=hash(`${m.recipe.projectSeed}/${m.recipe.variant}`);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(!disposing)fail('the GPU context was lost','context-lost');});
  const assets={};for(const [p,v] of Object.entries(m.files||{}))assets[p]=typeof v==='string'?v:new Blob([v]);
  const families={};let extension=null;
  if(m.pack.kind==='world')families[m.recipe.family]=await moduleFrom(m.files[m.pack.entry]);
  if(m.pack.kind==='shader')extension={background:m.pack.background?m.files[m.pack.background]:null,post:(m.pack.post||[]).map(p=>m.files[p]),
    effects:m.pack.effects?await moduleFrom(m.files[m.pack.effects]):null};
  host=await createWorld(canvas,{overlayCanvas:m.film?null:overlay,film:!!m.film,speed:m.speed,recipe:m.recipe,labels:m.labels,quality:m.quality,adaptive:m.adaptive,families,extension,assets});
  if(Number.isFinite(m.epoch))host.setEpoch(m.epoch);
  send({type:'loaded',sdk:SDK_VERSION});
}
// Films and recordings: the world and its labels composited into one bitmap (transferred, never copied twice).
// One compositing canvas, reused (a new canvas and context per frame left their memory to the garbage collector).
function composite(film){
  if(!out||out.width!==canvas.width||out.height!==canvas.height){out=new OffscreenCanvas(canvas.width,canvas.height);outG=out.getContext('2d');}
  outG.clearRect(0,0,out.width,out.height);outG.drawImage(canvas,0,0);if(film)host.drawOverlay(outG,out.width,out.height);else if(overlay.width)outG.drawImage(overlay,0,0);
  return out.transferToImageBitmap();
}
const queue=[];let running=false;
const SEMANTIC=new Set(['reset','delta','cue','intent','prime','mood','speed','epoch','recipe','labels','quality','resize']);
function handle(m){
  if(!host)return;
  if(SEMANTIC.has(m.type))semantic++;
  switch(m.type){
    case 'reset':host.reset(m.graph,m.t);break;
    case 'delta':host.applyDelta(m.delta,m.start,m.end);break;
    case 'cue':host.cue(m.cue,m.t);break;
    case 'intent':host.intent(m.intent,m.t);break;
    case 'prime':host.prime(m.entries,m.t);break;
    case 'mood':host.setMood(m.mood);break;
    case 'speed':host.setSpeed(m.k);break;
    case 'epoch':host.setEpoch(m.t);break;
    case 'labels':host.setLabels(m.mode);break;
    case 'quality':host.setQuality(m.level,m.adapt);break;
    case 'resize':host.resize(m.w,m.h,m.dpr);break;
    case 'pick':send({type:'picked',id:m.id,result:host.pick(m.x,m.y)});break;
    case 'peek':send({type:'picked',id:m.id,result:host.peek(m.x,m.y)});break;
    case 'render':{
      // A newer live render already waiting makes this one obsolete: skip it (presentation only, never events).
      if(m.mode==='live'&&queue.some(x=>x.type==='render'&&x.mode==='live')){skipped++;send({type:'rendered',id:m.id,skipped:true,queue:queue.length});break;}
      frameTime=m.t;random=rng(seed^hash(String(Math.round(m.t))));
      const began=performance.now();host.render(m.t,m.dt,{phase:m.phase});rendered++;
      const bitmap=m.mode==='film'||m.mode==='record'?composite(m.mode==='film'):null;
      lastRenderMs=performance.now()-began;
      send({type:'rendered',id:m.id,ms:+lastRenderMs.toFixed(2),queue:queue.length,bitmap},bitmap?[bitmap]:[]);
      if(m.mode==='film'||rendered%15===1||began-lastStats>1000){lastStats=began;send({type:'stats',stats:{...host.stats(),rendered,skipped,semantic,renderMs:+lastRenderMs.toFixed(2),now:performance.now()},labels:host.labels()});}
      break;}
    case 'dispose':disposing=true;host.dispose();host=null;out=null;outG=null;break;
  }
}
// Messages are handled strictly in order; an await (init, a recipe switch) never lets a later message overtake.
async function drain(){
  if(running)return;running=true;
  try{while(queue.length){const m=queue.shift();if(m.type==='init')await init(m);else if(m.type==='recipe'){if(host){semantic++;await host.setRecipe(m.recipe);}}else handle(m);}}
  catch(e){fail(e);}
  finally{running=false;}
}
self.addEventListener('message',e=>{queue.push(e.data||{});drain();});
send({type:'ready',sdk:SDK_VERSION});

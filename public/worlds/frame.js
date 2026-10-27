// The isolated visual pack frame (/pack-frame.html, embedded with sandbox="allow-scripts": an opaque origin with no
// network, no storage and no access to the player). It runs the same world host as the player, fed only with the
// privacy-safe performance view the player posts (view.js), and the pack's code (a world module, or shader slots and
// effects), which the player fetched only after the user approved those exact files. The frame's content policy blocks
// every connection, so nothing here can reach the receiver, the user's files or recordings.
import {createWorld} from './host.js';
import {SDK_VERSION} from './sdk.js';
import {rng,hash} from './core.js';
const send=(message,transfer=[])=>window.parent.postMessage(message,'*',transfer);
// Determinism guard: pack code that reaches for Math.random or Date.now gets values derived from the performance time
// of the frame being rendered (the API offers sdk.random(key) and the frame clock; these only stop accidents).
let frameTime=0,seed=1,random=rng(1);
Math.random=()=>random();
Date.now=()=>Math.floor(frameTime);
// WebRTC is outside the content policy's reach in Chromium: remove it before any pack code exists.
for(const k of ['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel','RTCSessionDescription','RTCIceCandidate','RTCRtpSender','RTCRtpReceiver']){
  try{delete window[k];Object.defineProperty(window,k,{value:undefined,writable:false,configurable:false});}catch{}}
const canvas=document.getElementById('world'),overlay=document.getElementById('overlay');
let host=null,film=false,rendered=0,mode='cinematic';
function fail(e){send({type:'error',message:String(e?.message||e||'error').slice(0,300)});}
window.addEventListener('error',e=>fail(e.error||e.message));
window.addEventListener('unhandledrejection',e=>fail(e.reason));
async function moduleFrom(source){
  if(typeof source!=='string')throw new Error('Pack module missing');
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{return await import(url);}finally{URL.revokeObjectURL(url);}
}
async function init(m){
  film=!!m.film;mode=m.labels;seed=hash(`${m.recipe.projectSeed}/${m.recipe.variant}`);
  const assets={};for(const [p,v] of Object.entries(m.files||{}))assets[p]=typeof v==='string'?v:new Blob([v]);
  const families={};let extension=null;
  if(m.pack.kind==='world')families[m.recipe.family]=await moduleFrom(m.files[m.pack.entry]);
  if(m.pack.kind==='shader')extension={background:m.pack.background?m.files[m.pack.background]:null,post:(m.pack.post||[]).map(p=>m.files[p]),
    effects:m.pack.effects?await moduleFrom(m.files[m.pack.effects]):null};
  host=await createWorld(canvas,{overlayCanvas:film?null:overlay,film,speed:m.speed,recipe:m.recipe,labels:m.labels,quality:m.quality,adaptive:m.adaptive,families,extension,assets});
  if(Number.isFinite(m.epoch))host.setEpoch(m.epoch);
  send({type:'loaded',sdk:SDK_VERSION});
}
// Films: the world and its labels composited into one bitmap, transferred to the player.
function capture(id){
  const out=new OffscreenCanvas(canvas.width,canvas.height),g=out.getContext('2d');
  g.drawImage(canvas,0,0);host.drawOverlay(g,out.width,out.height);
  const bitmap=out.transferToImageBitmap();send({type:'frame',id,bitmap},[bitmap]);
}
async function handle(m){
  if(m.type==='init')return init(m);
  if(!host)return;
  switch(m.type){
    case 'reset':host.reset(m.graph,m.t);break;
    case 'delta':host.applyDelta(m.delta,m.start,m.end);break;
    case 'cue':host.cue(m.cue,m.t);break;
    case 'intent':host.intent(m.intent,m.t);break;
    case 'prime':host.prime(m.entries,m.t);break;
    case 'mood':host.setMood(m.mood);break;
    case 'speed':host.setSpeed(m.k);break;
    case 'epoch':host.setEpoch(m.t);break;
    case 'recipe':await host.setRecipe(m.recipe);break;
    case 'labels':mode=m.mode;host.setLabels(m.mode);break;
    case 'resize':host.resize(m.w,m.h,m.dpr);break;
    case 'render':
      frameTime=m.t;random=rng(seed^hash(String(Math.round(m.t))));
      host.render(m.t,m.dt,{phase:m.phase});rendered++;
      if(m.capture)capture(m.id);
      if(m.capture||rendered%15===1)send({type:'stats',stats:{...host.stats(),rendered,now:performance.now()},labels:host.labels()});
      break;
    case 'pick':send({type:'picked',id:m.id,result:host.pick(m.x,m.y)});break;
    case 'dispose':host.dispose();host=null;break;
  }
}
// Messages are handled strictly in order (an await never lets a later message overtake an earlier one).
let queue=Promise.resolve();
window.addEventListener('message',e=>{if(e.source!==window.parent)return;const m=e.data||{};queue=queue.then(()=>handle(m)).catch(fail);});
// Explorer mode: clicks select a structure inside the frame (labels are drawn here too).
canvas.addEventListener('click',e=>{if(host&&mode==='explorer'){const r=canvas.getBoundingClientRect();host.pick(e.clientX-r.left,e.clientY-r.top);}});
send({type:'ready',sdk:SDK_VERSION});

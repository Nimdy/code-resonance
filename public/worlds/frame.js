// The isolated visual pack frame (/pack-frame.html, embedded with sandbox="allow-scripts": an opaque origin with no
// network, no storage and no access to the player). This page runs no pack code: it starts the pack worker
// (pack-worker.js) from a blob URL, so the worker inherits this page's content policy, hands it the canvases as
// OffscreenCanvas, and relays messages between the player and the worker. A pack that hangs blocks only its worker;
// this page keeps relaying, so the player's watchdog sees the silence and removes the frame (which ends the worker).
const send=(message,transfer=[])=>window.parent.postMessage(message,'*',transfer);
// WebRTC is outside the content policy's reach in Chromium. Pack code runs in the worker, which has none; this page
// removes it as well (defence in depth), before anything else runs.
for(const k of ['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel','RTCSessionDescription','RTCIceCandidate','RTCRtpSender','RTCRtpReceiver']){
  try{delete window[k];Object.defineProperty(window,k,{value:undefined,writable:false,configurable:false});}catch{}}
const canvas=document.getElementById('world'),overlay=document.getElementById('overlay');
let worker=null;
const fail=(message,kind='exception')=>send({type:'error',kind,message:String(message||'error').slice(0,300)});
window.addEventListener('error',e=>fail(e.message));
// Messages the player may send, and what the worker may answer.
const TO_WORKER=new Set(['init','reset','delta','cue','intent','prime','mood','speed','epoch','recipe','labels','quality','resize','render','pick','peek','dispose']);
const TO_PLAYER=new Set(['ready','loaded','rendered','stats','picked','error']);
const FLOOD=1000;
function start(){
  // A worker from a blob URL created here: same (opaque) origin, so it inherits this frame's policy. It loads the
  // runtime with a dynamic import, so a failure to load reports its reason.
  const entry=new URL('/worlds/pack-worker.js',location.href).href;
  const boot=`import(${JSON.stringify(entry)}).catch(e=>postMessage({type:'error',kind:'exception',message:'the pack runtime failed to load: '+(e&&e.message||e)}));`;
  worker=new Worker(URL.createObjectURL(new Blob([boot],{type:'text/javascript'})));
  // A worker posting far more than the runtime ever does (acknowledgements, a few statistics a second) is flooding:
  // it is terminated and the player is told.
  let second=0,count=0;
  worker.addEventListener('message',e=>{
    const now=Math.floor(performance.now()/1000);if(now!==second){second=now;count=0;}
    if(++count>FLOOD){worker.terminate();worker=null;return fail('the pack flooded the player with messages','flooding');}
    const m=e.data||{};if(!TO_PLAYER.has(m.type))return;
    if(m.type==='ready')return send({type:'ready',sdk:m.sdk});
    send(m,m.bitmap instanceof ImageBitmap?[m.bitmap]:[]);});
  worker.addEventListener('error',e=>{e.preventDefault();fail(e.message||'the pack worker failed to start');});
}
window.addEventListener('message',e=>{
  if(e.source!==window.parent)return;const m=e.data||{};if(!TO_WORKER.has(m.type))return;
  if(m.type==='init'){
    // The canvases move to the worker once; it renders into them from then on.
    const world=canvas.transferControlToOffscreen(),labels=overlay.transferControlToOffscreen();
    worker.postMessage({...m,canvas:world,overlay:labels},[world,labels]);return;
  }
  worker?.postMessage(m);
});
// The frame takes no pointer input: explorer clicks and the Control Center's hover reach the worker from the player
// ('pick', 'peek'), in the world's own coordinates, as they do for the built-in worlds.
start();

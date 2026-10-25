// The player's side of an executable visual pack: the world host's interface (host.js), backed by the isolated pack
// frame (frame.js), whose worker runs the pack (pack-worker.js). Everything sent passes through the privacy-safe view
// (view.js); what comes back is only pixels (films, recordings), label strings and statistics, all validated here.
//
// Delivery is bounded:
//  - live playback keeps at most MAX_IN_FLIGHT render requests outstanding; when the pack falls behind, presentation
//    frames are skipped (counted), never queued. Semantic messages (structure, cues, intents, priming) are always sent,
//    in order: a dropped frame never loses engineering history;
//  - films await every frame at its exact time; a frame that does not arrive within FILM_TIMEOUT is an error;
//  - recordings use the live path, and each acknowledgement carries the composited bitmap.
// A watchdog stops a pack that stops answering (LIVE_TIMEOUT) or delivers almost no frames (SLOW_*), unless the page is
// hidden. The frame is created per world and removed on dispose, which ends its worker and releases its GPU context.
import * as view from './view.js';
const MAX_IN_FLIGHT=1,LIVE_TIMEOUT=6000,FILM_TIMEOUT=60000,SLOW_WINDOW=20000,SLOW_FPS=1;
// A frame bitmap larger than any stage (a pack inflating its canvas) is refused, so memory stays bounded.
const MAX_PIXELS=4096*4096;
const MESSAGES=new Set(['ready','loaded','rendered','stats','picked','error']);
// Statistics from the frame: plain numbers, short strings and booleans, one level of nesting, nothing else.
function cleanStats(s,depth=0){
  if(!s||typeof s!=='object'||Array.isArray(s))return null;const out={};
  for(const [k,v] of Object.entries(s).slice(0,96)){if(!/^[A-Za-z0-9_.-]{1,40}$/.test(k))continue;
    if(typeof v==='number'&&Number.isFinite(v))out[k]=v;else if(typeof v==='boolean')out[k]=v;else if(typeof v==='string')out[k]=v.slice(0,80);
    else if(v===null)out[k]=null;else if(Array.isArray(v))out[k]=v.filter(x=>typeof x==='number').slice(0,64);else if(depth<1)out[k]=cleanStats(v,depth+1);}
  return out;
}
export async function createRemoteWorld(container,{pack,files,recipe,film=false,speed=1,labels='cinematic',quality=0,adaptive=true,epoch=null,timeout=30000}){
  const frame=document.createElement('iframe');
  frame.className='pack-frame';frame.title=`Visual pack: ${pack.name}`;
  frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('allow','');frame.referrerPolicy='no-referrer';
  frame.src='/pack-frame.html';container.append(frame);
  let last={stats:null,labels:[]},lastMood='',nextId=1,current=recipe,failed=null,disposed=false,onFrame=null,lastSent=0;
  const inFlight=new Map(),waiting=new Map(),errorListeners=[],once=new Map(),delivered=[];
  const transport={semantic:0,sent:0,acknowledged:0,skippedHere:0,skippedInFrame:0,latencyMs:0,maxLatencyMs:0,renderMs:0,maxRenderMs:0,queue:0,maxQueue:0,films:0};
  const post=(message,transfer=[])=>{if(!disposed)frame.contentWindow?.postMessage(message,'*',transfer);};
  // Semantic messages (everything but render requests): always sent, in order, and counted (the worker counts what it
  // handled, so a lost event would show).
  const tell=message=>{if(failed||disposed)return;transport.semantic++;post(message);};
  // A frame that navigates itself away is stopped at once (pack code runs in a worker and cannot, but the frame is
  // still watched).
  let loads=0;frame.addEventListener('load',()=>{if(++loads>1)stop('the pack frame navigated away','navigation');});
  function stop(message,kind='exception'){
    if(failed||disposed)return;failed=String(message).slice(0,300);
    for(const f of errorListeners)f(failed,kind);
    for(const w of waiting.values())w.reject(new Error(failed));waiting.clear();inFlight.clear();
  }
  function onMessage(e){
    if(e.source!==frame.contentWindow)return;const m=e.data||{};if(!MESSAGES.has(m.type))return;
    if(once.has(m.type)){once.get(m.type)(m);once.delete(m.type);}
    if(m.type==='rendered'){
      let bitmap=m.bitmap instanceof ImageBitmap?m.bitmap:null;const oversized=!!bitmap&&bitmap.width*bitmap.height>MAX_PIXELS;
      if(oversized){bitmap.close();bitmap=null;}
      // Only answers to requests this player made count (a pack posting its own messages cannot fake progress).
      const sent=inFlight.get(m.id);if(sent===undefined){bitmap?.close();return;}inFlight.delete(m.id);
      transport.acknowledged++;const latency=performance.now()-sent;transport.latencyMs+=(latency-transport.latencyMs)*.1;transport.maxLatencyMs=Math.max(transport.maxLatencyMs,latency);
      if(m.skipped)transport.skippedInFrame++;else delivered.push(performance.now());
      if(Number.isFinite(m.ms)){transport.renderMs+=(m.ms-transport.renderMs)*.1;transport.maxRenderMs=Math.max(transport.maxRenderMs,m.ms);}
      if(Number.isInteger(m.queue)){transport.queue=m.queue;transport.maxQueue=Math.max(transport.maxQueue,m.queue);}
      const w=waiting.get(m.id);
      if(w){waiting.delete(m.id);oversized?w.reject(new Error(`Visual pack ${pack.id} returned an oversized frame`)):w.resolve(bitmap);}
      else if(bitmap){if(onFrame&&!failed)onFrame(bitmap);else bitmap.close();}
    }
    else if(m.type==='stats')last={stats:cleanStats(m.stats),labels:Array.isArray(m.labels)?m.labels.filter(x=>typeof x==='string').map(x=>x.slice(0,200)).slice(0,128):[]};
    else if(m.type==='picked'){const w=waiting.get(m.id);if(w){waiting.delete(m.id);w.resolve(m.result&&typeof m.result==='object'?{text:String(m.result.text||'').slice(0,200),sub:String(m.result.sub||'').slice(0,200)}:null);}}
    else if(m.type==='error')stop(String(m.message||'error'),['context-lost','exception','flooding'].includes(m.kind)?m.kind:'exception');
  }
  window.addEventListener('message',onMessage);
  // Watchdog: a render unanswered for LIVE_TIMEOUT, or almost no frames delivered for SLOW_WINDOW, stops the pack.
  // Hidden pages are exempt (browsers throttle them); becoming visible again restarts the clocks.
  // The player pauses drawing while no view shows the stage (setPaused): the same exemption, the same restart.
  let watchedSince=performance.now(),paused=false;
  const restartClocks=()=>{const now=performance.now();watchedSince=now;for(const k of inFlight.keys())inFlight.set(k,now);delivered.length=0;};
  const onVisibility=()=>{if(!document.hidden&&!paused)restartClocks();};
  document.addEventListener('visibilitychange',onVisibility);
  const watchdog=setInterval(()=>{
    if(disposed||failed||film||document.hidden||paused)return;const now=performance.now();
    for(const sent of inFlight.values())if(now-sent>LIVE_TIMEOUT){stop(`the pack stopped answering (no frame for ${Math.round((now-sent)/1000)} s)`,'unresponsive');return;}
    while(delivered.length&&delivered[0]<now-SLOW_WINDOW)delivered.shift();
    if(now-watchedSince>SLOW_WINDOW&&transport.sent>0&&delivered.length<SLOW_FPS*SLOW_WINDOW/1000)stop(`the pack is too slow for live playback (${(delivered.length/(SLOW_WINDOW/1000)).toFixed(1)} frames per second)`,'slow');
  },500);
  const expect=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Visual pack ${pack.id} did not answer (${type})`)),timeout);
    once.set(type,m=>{clearTimeout(timer);resolve(m);});errorListeners.push(message=>{clearTimeout(timer);reject(new Error(message));});});
  const request=(message,limit)=>{const id=nextId++;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});inFlight.set(id,performance.now());transport.sent++;post({...message,id});
    setTimeout(()=>{if(waiting.delete(id)){inFlight.delete(id);reject(new Error(`Visual pack ${pack.id} did not answer within ${limit/1000} s`));}},limit);});};
  function dispose(){
    if(disposed)return;post({type:'dispose'});disposed=true;clearInterval(watchdog);
    window.removeEventListener('message',onMessage);document.removeEventListener('visibilitychange',onVisibility);
    // Removing the frame ends its worker (Chromium force-terminates a worker stuck in a loop about 2 s later).
    for(const w of waiting.values())w.reject(new Error('Visual pack closed'));waiting.clear();inFlight.clear();frame.remove();
  }
  try{
    await expect('ready');
    post({type:'init',pack:{id:pack.id,kind:pack.kind,entry:pack.entry,background:pack.background,post:pack.post,effects:pack.effects},files,
      recipe:view.recipe(recipe),film,speed,labels,quality,adaptive,epoch});
    await expect('loaded');
  }catch(e){dispose();throw e;}
  return {
    remote:true,pack,frame,
    get world(){return null;},get recipe(){return current;},get failed(){return failed;},
    onError(f){errorListeners.push(f);},
    reset(graph,t){tell({type:'reset',graph:view.graph(graph),t});},
    applyDelta(delta,start,end){tell({type:'delta',delta:view.graph(delta),start,end});},
    cue(c,t){const v=view.cue(c);if(v)tell({type:'cue',cue:v,t});},
    intent(i,t){const v=view.intent(i);if(v)tell({type:'intent',intent:v,t});},
    prime(entries,t){tell({type:'prime',entries:entries.map(view.primeEntry),t});},
    // The player reports the mood every frame; it is sent when it changes.
    setMood(m){const v=view.mood(m),k=JSON.stringify(v);if(k===lastMood)return;lastMood=k;tell({type:'mood',mood:v});},
    setSpeed(k){tell({type:'speed',k:Number(k)||1});},
    setEpoch(t){tell({type:'epoch',t:Number(t)});},
    async setRecipe(r){current=r;tell({type:'recipe',recipe:view.recipe(r)});},
    setLabels(mode){tell({type:'labels',mode});},
    setQuality(level,adapt){tell({type:'quality',level,adapt});},
    pick(x,y){return request({type:'pick',x,y},5000).catch(()=>null);},
    // Live presentation: skipped (counted) when MAX_IN_FLIGHT frames are already outstanding. With a recording sink set
    // (record), each acknowledgement brings the composited bitmap to it.
    render(t,dt,{phase=0}={}){
      if(failed||disposed)return false;
      if(inFlight.size>=MAX_IN_FLIGHT){transport.skippedHere++;return false;}
      const now=performance.now(),elapsed=lastSent?Math.min(.25,(now-lastSent)/1000):dt;lastSent=now;
      const id=nextId++;inFlight.set(id,now);transport.sent++;post({type:'render',id,t,dt:elapsed,phase,mode:onFrame?'record':'live'});return true;
    },
    record(sink){onFrame=sink||null;},
    setPaused(p){p=!!p;if(p===paused)return;paused=p;if(!p&&!document.hidden)restartClocks();},
    // Films: one exact frame at time t, composited with its labels in the worker; never skipped.
    capture(t,dt,{phase=0}={}){transport.films++;return request({type:'render',t,dt,phase,mode:'film'},FILM_TIMEOUT);},
    drawOverlay(){},
    labels(){return last.labels;},
    resize(w,h,dpr=1){tell({type:'resize',w,h,dpr});},
    stats(){return last.stats?{...last.stats,remote:true,pack:pack.id,transport:{...transport,inFlight:inFlight.size,latencyMs:+transport.latencyMs.toFixed(1),maxLatencyMs:+transport.maxLatencyMs.toFixed(1),renderMs:+transport.renderMs.toFixed(2)}}:null;},
    dispose
  };
}

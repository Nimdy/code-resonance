// The player's side of an executable visual pack: the world host's interface (host.js), backed by the isolated pack
// frame (frame.js). Everything sent passes through the privacy-safe view (view.js); what comes back is only pixels
// (films), label strings and statistics. The frame is created per world and removed on dispose, which releases its
// WebGL context and everything the pack allocated, whatever the pack's own dispose() did.
import * as view from './view.js';
export async function createRemoteWorld(container,{pack,files,recipe,film=false,speed=1,labels='cinematic',quality=0,adaptive=true,epoch=null,timeout=30000}){
  const frame=document.createElement('iframe');
  frame.className='pack-frame';frame.title=`Visual pack: ${pack.name}`;
  frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('allow','');frame.referrerPolicy='no-referrer';
  frame.src='/pack-frame.html';container.append(frame);
  // A frame that navigates itself away (the one way out the browser cannot close) is stopped at once.
  let loads=0;frame.addEventListener('load',()=>{if(++loads>1)stop('the pack navigated its frame away');});
  let last={stats:null,labels:[]},nextId=1,current=recipe,failed=null;
  const waiting=new Map(),errorListeners=[],once=new Map();
  const post=(message,transfer=[])=>frame.contentWindow?.postMessage(message,'*',transfer);
  function onMessage(e){
    if(e.source!==frame.contentWindow)return;const m=e.data||{};
    if(once.has(m.type)){once.get(m.type)(m);once.delete(m.type);}
    if(m.type==='stats')last={stats:m.stats&&typeof m.stats==='object'?m.stats:null,labels:Array.isArray(m.labels)?m.labels.filter(x=>typeof x==='string').slice(0,128):[]};
    else if(m.type==='frame'||m.type==='picked'){const w=waiting.get(m.id);if(w){waiting.delete(m.id);w.resolve(m);}}
    else if(m.type==='error')stop(String(m.message||'error'));
  }
  function stop(message){if(failed)return;failed=message.slice(0,300);for(const f of errorListeners)f(failed);for(const w of waiting.values())w.reject(new Error(failed));waiting.clear();}
  window.addEventListener('message',onMessage);
  const expect=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Visual pack ${pack.id} did not answer (${type})`)),timeout);
    once.set(type,m=>{clearTimeout(timer);resolve(m);});errorListeners.push(message=>{clearTimeout(timer);reject(new Error(message));});});
  const request=(message,transfer)=>{const id=nextId++;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});post({...message,id},transfer);
    setTimeout(()=>{if(waiting.delete(id))reject(new Error(`Visual pack ${pack.id} did not answer`));},timeout);});};
  try{
    await expect('ready');
    post({type:'init',pack:{id:pack.id,kind:pack.kind,entry:pack.entry,background:pack.background,post:pack.post,effects:pack.effects},files,
      recipe:view.recipe(recipe),film,speed,labels,quality,adaptive,epoch});
    await expect('loaded');
  }catch(e){window.removeEventListener('message',onMessage);frame.remove();throw e;}
  return {
    remote:true,pack,frame,
    get world(){return null;},get recipe(){return current;},get failed(){return failed;},
    onError(f){errorListeners.push(f);},
    reset(graph,t){post({type:'reset',graph:view.graph(graph),t});},
    applyDelta(delta,start,end){post({type:'delta',delta:view.graph(delta),start,end});},
    cue(c,t){const v=view.cue(c);if(v)post({type:'cue',cue:v,t});},
    intent(i,t){const v=view.intent(i);if(v)post({type:'intent',intent:v,t});},
    prime(entries,t){post({type:'prime',entries:entries.map(view.primeEntry),t});},
    setMood(m){post({type:'mood',mood:view.mood(m)});},
    setSpeed(k){post({type:'speed',k:Number(k)||1});},
    setEpoch(t){post({type:'epoch',t:Number(t)});},
    async setRecipe(r){current=r;post({type:'recipe',recipe:view.recipe(r)});},
    setLabels(mode){post({type:'labels',mode});},
    pick(x,y){return request({type:'pick',x,y}).then(m=>m.result).catch(()=>null);},
    render(t,dt,{phase=0}={}){post({type:'render',t,dt,phase});},
    // Films: one exact frame, composited with its labels inside the frame, returned as an ImageBitmap.
    capture(t,dt,{phase=0}={}){return request({type:'render',t,dt,phase,capture:true}).then(m=>m.bitmap);},
    drawOverlay(){},
    labels(){return last.labels;},
    resize(w,h,dpr=1){post({type:'resize',w,h,dpr});},
    stats(){return last.stats?{...last.stats,remote:true,pack:pack.id}:null;},
    dispose(){post({type:'dispose'});window.removeEventListener('message',onMessage);frame.remove();}
  };
}

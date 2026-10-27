// The digital-life timeline: the canonical inputs of the ecosystem, in canonical order, whatever path playback took.
// Pure (no rendering), tested in Node.
//
// Three kinds of input, all from the recorded performance (never from the audio device, the frame rate or the clock):
//  - structure: each recorded window's graph delta at its start (the world's habitat is derived from it);
//  - frames: each window's controls (energy, tension) at its start (the musical climate is derived from them);
//  - intents: the canonical intents (engine/intents.js) at their timestamps, by id.
// Items are kept sorted by (time, kind, recorded order, id); the same item delivered twice (a seek re-schedules the
// window it lands in, a replay is primed with its whole timeline) is kept once. A prefix fingerprint (a rolling hash of
// the items in order) names exactly which inputs lead to a moment: a checkpoint of the ecosystem is valid only while
// the fingerprint of the inputs before it is unchanged.
//
// The structure is replayed into a model of its own (the "shadow" model, created with the same rules as the world's):
// after a seek the world's model knows the structure only as it is now (everything born at -Infinity), while the
// ecosystem's past needs the structure as it was at each moment.
import {createModel} from '../model.js';
export const KIND={structure:0,frame:1,intent:2};
const idHash=s=>{let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
const extend=(p,x)=>[(Math.imul(p[0],31)+x)>>>0,(Math.imul(p[1]^x,2654435761)+0x9e3779b9)>>>0];
export function compareItems(a,b){return a.t-b.t||a.kind-b.kind||a.ord-b.ord||(a.key<b.key?-1:a.key>b.key?1:0);}
export function createLifeTimeline(){
  let items=[],keys=new Set(),prints=[[0,0]],version=0,earliestChange=Infinity;
  const listeners=new Set();
  function printFrom(k){prints.length=k+1;for(let i=k;i<items.length;i++)prints.push(extend(prints[i],items[i].h));}
  // Inserts an item in canonical order. Returns false for a duplicate.
  function insert(item){
    if(keys.has(item.key))return false;keys.add(item.key);
    let p=items.length;while(p>0&&compareItems(items[p-1],item)>0)p--;
    items.splice(p,0,item);printFrom(p);version++;earliestChange=Math.min(earliestChange,item.t);
    return true;
  }
  const structureItem=(delta,start,end,seq)=>({kind:KIND.structure,t:start,end,ord:Number.isFinite(seq)?seq:0,key:`s:${start}`,delta,h:idHash(`s:${start}:${delta.keyframe?'k':'d'}:${(delta.nodes||delta.add||[]).length}:${(delta.remove||[]).length}`)});
  const frameItem=(f,start)=>({kind:KIND.frame,t:start,end:f.end??start,ord:0,key:`f:${start}`,energy:+(f.controls?.energy||0),tension:+(f.controls?.tension||0),chapter:f.chapter||1,
    h:idHash(`f:${start}:${(+(f.controls?.energy||0)).toFixed(4)}:${(+(f.controls?.tension||0)).toFixed(4)}`)});
  const intentItem=i=>({kind:KIND.intent,t:i.ts,ord:i.ord??0,key:`i:${i.id}`,intent:i,h:idHash(i.id)});
  function structure(delta,start,end,seq){return delta&&Number.isFinite(start)?insert(structureItem(delta,start,end,seq)):false;}
  function frame(f,start){return f&&Number.isFinite(start)?insert(frameItem(f,start)):false;}
  function intent(i){return i&&i.id&&Number.isFinite(i.ts)?insert(intentItem(i)):false;}
  // A replay's whole timeline (entries: the recorded windows). Everything is taken, also what lies after the playhead:
  // the ecosystem consumes an input only once simulated time reaches it, so knowing the future changes nothing before it.
  function prime(entries){
    for(const e of entries||[]){
      if(e.graph)structure(e.graph,e.start,e.end,e.seq);
      if(e.frame)frame(e.frame,e.start);
      (e.intents||[]).forEach((i,k)=>{if(i.ord===undefined&&Number.isInteger(e.seq))i.ord=e.seq*65536+k;intent(i);});
    }
  }
  // Index of the first item after time t (items at t are consumed by a tick at t).
  function upto(t){let lo=0,hi=items.length;while(lo<hi){const m=(lo+hi)>>1;if(items[m].t<=t)lo=m+1;else hi=m;}return lo;}
  return {structure,frame,intent,prime,upto,
    get items(){return items;},get version(){return version;},
    print:k=>prints[k],
    // The earliest time an input was added since the last call (a checkpoint after it may no longer be valid).
    takeChange(){const t=earliestChange;earliestChange=Infinity;return t;},
    clear(){items=[];keys=new Set();prints=[[0,0]];version++;earliestChange=-Infinity;},
    stats(){let s=0,f=0,n=0;for(const x of items)x.kind===0?s++:x.kind===1?f++:n++;return {items:items.length,structure:s,frames:f,intents:n};}};
}
// The structure as it was: a model of its own, created with the world model's rules (speed and tempo snap births to
// the music's step grid), fed the timeline's structure items in order by the driver.
export function createShadow({speed=1,tempo=92}={}){
  let model=createModel({speed,tempo});
  return {
    get model(){return model;},
    configure({speed:s=speed,tempo:t=tempo}){speed=s;tempo=t;model=createModel({speed,tempo});},
    reset(){model=createModel({speed,tempo});}
  };
}

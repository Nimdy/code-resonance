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
  let items=[],keys=new Set(),prints=[[0,0]],version=0,earliestChange=Infinity,floor=-Infinity,compactions=0;
  const listeners=new Set();
  function printFrom(k){prints.length=k+1;for(let i=k;i<items.length;i++)prints.push(extend(prints[i],items[i].h));}
  // Inserts an item in canonical order. Returns false for a duplicate, or for an input at or before the floor (a live
  // session's inputs older than its last compaction are history).
  function insert(item){
    if(keys.has(item.key)||item.t<=floor)return false;keys.add(item.key);
    let p=items.length;while(p>0&&compareItems(items[p-1],item)>0)p--;
    items.splice(p,0,item);printFrom(p);version++;earliestChange=Math.min(earliestChange,item.t);
    return true;
  }
  const structureItem=(delta,start,end,seq)=>({kind:KIND.structure,t:start,end,ord:Number.isFinite(seq)?seq:0,key:`s:${start}`,delta,h:idHash(`s:${start}:${delta.keyframe?'k':'d'}:${(delta.nodes||delta.add||[]).length}:${(delta.remove||[]).length}`)});
  // A frame's verified successes ride along for the musical conductor (score v3); a recorded window never changes, so
  // they need not enter the fingerprint.
  const frameItem=(f,start)=>({kind:KIND.frame,t:start,end:f.end??start,ord:0,key:`f:${start}`,energy:+(f.controls?.energy||0),tension:+(f.controls?.tension||0),chapter:f.chapter||1,
    milestone:!!f.milestones?.some(t=>/^milestone\./.test(t)||/^validation\.[a-z.]*passed$/.test(t)),
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
    clear(){items=[];keys=new Set();prints=[[0,0]];version++;earliestChange=-Infinity;floor=-Infinity;},
    // A live session's bounded memory (life/driver.js rebase): drops the first n items (already consumed, all at or
    // before time t) except those `keep` names, and from now on refuses inputs at or before t. Not an input change:
    // the ecosystem that consumed them continues. Returns how many were kept (they stay first).
    compact(n,t,keep=()=>false){
      const head=items.slice(0,n),kept=head.filter(keep);
      for(const x of head)if(!kept.includes(x))keys.delete(x.key);
      items=[...kept,...items.slice(n)];prints=[[0,0]];printFrom(0);version++;floor=Math.max(floor,t);compactions++;
      return kept.length;
    },
    get floor(){return floor;},
    stats(){let s=0,f=0,n=0;for(const x of items)x.kind===0?s++:x.kind===1?f++:n++;return {items:items.length,structure:s,frames:f,intents:n,compactions};}};
}
// The structure as it was: a model of its own, created with the world model's rules (speed and tempo snap births to
// the music's step grid), fed the timeline's structure items in order by the driver.
export function createShadow({speed=1,tempo=92}={}){
  let model=createModel({speed,tempo});
  return {
    get model(){return model;},
    configure({speed:s=speed,tempo:t=tempo}){speed=s;tempo=t;model=createModel({speed,tempo});},
    // A live tempo change: the structure applied so far stays, later births snap to the new grid.
    retune(t){if(t>0){tempo=t;model.setTempo(t);}},
    reset(){model=createModel({speed,tempo});}
  };
}
// The structure a model holds at time t as a graph (the shape a world model is reset with): what exists at t, in the
// model's own order. A live session's rebase keeps it as the base a new world (or a rebuilt shadow) starts from. It
// is the structure, not its history: births before t become -Infinity and module order is renumbered, so a habitat
// derived from it can differ slightly from the one the running ecosystem had (which keeps its own shadow).
export function graphOf(model,t){
  const nodes=[],edges=[],here=x=>model.bornAt(x)<=t&&(x.removed===null||x.removed>t);
  for(const d of [...model.districts.values()].sort((a,b)=>a.order-b.order))
    nodes.push({id:d.id,type:'group',core:d.core,order:d.order,q:d.q,r:d.r,angle:d.angle,counts:d.counts,test:d.test,modules:d.modules});
  for(const m of [...model.modules.values()].sort((a,b)=>a.order-b.order)){if(!here(m))continue;
    nodes.push({id:m.id,type:'module',group:m.group,dir:m.dir,q:m.q,r:m.r,lang:m.lang,test:m.test,counts:m.counts,weight:m.weight,state:model.stateAt(m,t)});
    edges.push({a:m.group,b:m.id,kind:'contains'});}
  const mods=new Set(nodes.filter(n=>n.type==='module').map(n=>n.id));
  for(const s of model.symbols.values())if(here(s)&&mods.has(s.parent))nodes.push({id:s.id,type:s.kind,parent:s.parent,slot:s.slot,weight:s.weight});
  for(const l of model.links.values())if(here(l)&&mods.has(l.a)&&mods.has(l.b))edges.push({a:l.a,b:l.b,kind:'depends',cross:l.cross});
  return {nodes,edges};
}

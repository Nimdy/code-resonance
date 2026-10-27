// Long histories. The director and the agent presences are folds over intents in canonical order (timestamp, then
// recorded position in the timeline), so their state at any moment is a pure function of the intents before it.
// This module keeps that state exact with bounded memory however long a project runs:
//  - a window of at most `maxRaw` raw intents (the most recent), always folded;
//  - a checkpoint (an exact snapshot of the fold) every `every` intents inside the window, and at most `maxSparse`
//    older checkpoints spread evenly over the rest of the history;
//  - an intent that arrives late (earlier than intents already folded) re-folds from the nearest earlier checkpoint;
//  - a seek forgets the intents at or after the seek point and restores the fold just before it, from the nearest
//    checkpoint plus the intents the caller supplies (a replay holds its whole timeline; live priming reads it).
//    Checkpoints beyond a seek point are parked rather than discarded. Every checkpoint carries a fingerprint of the
//    exact sequence of intents it summarizes (a rolling hash of their ids), so a later seek forward reuses a parked
//    one only when the intents leading to it are the same; far seeks then cost a window, not the whole history.
// An intent at or before the window's start is already part of the fold (a duplicate) or arrived later than the whole
// window, which a live session cannot produce in practice; either way it is counted in `stats().covered`, never
// folded out of order.
export function compare(a,b){return a.ts-b.ts||(a.ord??Infinity)-(b.ord??Infinity)||(a.id<b.id?-1:a.id>b.id?1:0);}
// Rolling 64-bit fingerprint (two 32-bit lanes) of a sequence of intent ids.
function idHash(id){let h=2166136261;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
const extend=([a,b],id)=>{const x=idHash(id);return [(Math.imul(a,31)+x)>>>0,(Math.imul(b^x,2654435761)+0x9e3779b9)>>>0];};
const same=(p,q)=>p[0]===q[0]&&p[1]===q[1];
export function createHistory({step,snapshot,restore,every=2000,maxRaw=30000,maxSparse=24}){
  let raw=[],ids=new Set(),checkpoints=[],ahead=[],print=[0,0],covered=0,late=0,refolded=0,jumps=0;
  // The fold before raw[0]: a checkpoint (absolute index = number of intents folded before the window).
  const initial={index:0,key:null,print:[0,0],snap:snapshot()};let base=initial;
  const total=()=>base.index+raw.length;
  function fold(x){const r=step(x);print=extend(print,x.id);return r;}
  function record(abs){if(abs%every===0)checkpoints.push({index:abs,key:raw[abs-base.index-1],print,snap:snapshot()});}
  function resume(c){restore(c.snap);print=c.print;}
  // Restore the latest valid checkpoint at or before absolute index `upTo`, then fold raw[...] to the end.
  // Returns the command produced for `target` (an intent id), if any.
  function rebuild(upTo,target=null){
    checkpoints=checkpoints.filter(c=>c.index<=upTo);
    const c=checkpoints.filter(c=>c.index>=base.index).at(-1)||base;
    resume(c);let cmd=null;
    for(let k=c.index-base.index;k<raw.length;k++){const r=fold(raw[k]);refolded++;if(raw[k].id===target)cmd=r;record(base.index+k+1);}
    return cmd;
  }
  // Thin a sorted list of checkpoints to `cap`, keeping an even spread: drop the one whose neighbours are closest.
  function thin(list,cap){
    while(list.length>cap){let best=1,gap=Infinity;for(let i=1;i<list.length-1;i++){const g=list[i+1].index-list[i-1].index;if(g<gap){gap=g;best=i;}}list.splice(best,1);}
    return list;
  }
  // Park checkpoints beyond the current fold (only far seeks use them; at most 2 x maxSparse are kept).
  function park(list){
    const byIndex=new Map(ahead.map(c=>[c.index,c]));for(const c of list)if(c!==initial)byIndex.set(c.index,c);
    ahead=thin([...byIndex.values()].sort((a,b)=>a.index-b.index),2*maxSparse);
  }
  // Keep the window bounded: move the base to the latest checkpoint that leaves at least half the window.
  function bound(){
    if(raw.length<=maxRaw)return;
    const c=checkpoints.filter(c=>c.index>base.index&&c.index<=total()-(maxRaw>>1)).at(-1);if(!c)return;
    for(const x of raw.splice(0,c.index-base.index))ids.delete(x.id);
    base=c;
    // Older checkpoints thin out to an even spread over the whole history (they only make far seeks faster).
    checkpoints=[...thin(checkpoints.filter(x=>x.index<base.index),maxSparse),...checkpoints.filter(x=>x.index>=base.index)];
  }
  // A new intent: folded at once when it is the newest; otherwise placed and re-folded exactly.
  function add(intent){
    if(ids.has(intent.id))return {status:'duplicate',cmd:null};
    if(base.key&&compare(intent,base.key)<=0){covered++;return {status:'covered',cmd:null};}
    let p=raw.length;while(p>0&&compare(raw[p-1],intent)>0)p--;
    raw.splice(p,0,intent);ids.add(intent.id);
    const appended=p===raw.length-1;let cmd;
    if(appended){cmd=fold(intent);record(total());}
    else{late++;cmd=rebuild(base.index+p,intent.id);}
    bound();
    return {status:appended?'appended':'late',cmd};
  }
  // Before a seek to t: forget everything at or after t, and fold every supplied intent before t (any order).
  function prime(t,list=[]){
    let q=raw.findIndex(x=>x.ts>=t);if(q<0)q=raw.length;
    const removed=q<raw.length;
    if(removed){park(checkpoints.filter(c=>c.index>base.index+q));for(const x of raw.splice(q))ids.delete(x.id);}
    // The window began after t: fall back to the latest older checkpoint (or the start) and fold from there.
    const rewound=!!(base.key&&base.key.ts>=t);
    if(rewound){
      const c=checkpoints.filter(x=>x.index<base.index&&x.key.ts<t).at(-1)||initial;
      park([base,...checkpoints.filter(x=>x.index>c.index)]);
      for(const x of raw)ids.delete(x.id);raw=[];base=c;checkpoints=checkpoints.filter(x=>x.index<=c.index);
    }
    const sorted=list.filter(x=>x.ts<t&&!ids.has(x.id)&&!(base.key&&compare(x,base.key)<=0)).sort(compare);
    // Deduplicate within the supplied list too.
    const add=[];for(const x of sorted)if(!add.length||add.at(-1).id!==x.id)add.push(x);
    if(add.length&&(!raw.length||compare(add[0],raw.at(-1))>0)){
      // Appending in order (the common case, also the far-seek case): fold as a stream with bounded memory.
      if(removed||rewound)rebuild(total());
      // The latest parked checkpoint reached by exactly these intents: jump there instead of folding up to it.
      const n=total(),byIndex=new Map(ahead.map(c=>[c.index,c]));let p=print,jump=null,at=0;
      for(let k=0;k<add.length;k++){p=extend(p,add[k].id);const c=byIndex.get(n+k+1);if(c&&same(c.print,p)){jump=c;at=k+1;}}
      let from=0;
      if(jump){jumps++;for(const x of raw)ids.delete(x.id);
        checkpoints=[...checkpoints,...ahead.filter(c=>c.index<=jump.index)].sort((a,b)=>a.index-b.index);ahead=ahead.filter(c=>c.index>jump.index);
        raw=[];base=jump;resume(jump);from=at;}
      for(let k=from;k<add.length;k++){const x=add[k];raw.push(x);ids.add(x.id);fold(x);record(total());bound();}
      return;
    }
    if(!add.length&&!removed&&!rewound)return;
    let first=raw.length;
    if(add.length){
      const merged=[];let i=0,j=0;
      while(i<raw.length||j<add.length){if(j>=add.length||(i<raw.length&&compare(raw[i],add[j])<=0))merged.push(raw[i++]);else{if(first===raw.length)first=merged.length;merged.push(add[j++]);}}
      for(const x of add)ids.add(x.id);raw=merged;
    }
    rebuild(base.index+Math.min(first,q));bound();
  }
  return {add,prime,
    get count(){return total();},
    stats(){return {folded:total(),raw:raw.length,checkpoints:checkpoints.length,parked:ahead.length,base:base.index,late,covered,refolded,jumps};}};
}

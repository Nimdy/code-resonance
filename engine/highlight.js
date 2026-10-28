'use strict';
// Deterministic highlight window for Home Last night and npm run film. Same module both call, so they cannot disagree.
const catalog=require('./providers');
const SCHEMA='code-resonance.highlight.v1';
const VIEW_MS=90_000,FALLBACK_MS=60_000,LEAD=35;
// Last night is the last 24 hours of the project's own recording (the windows that end inside them); the whole history
// is read and scored only when nothing there scores.
const RECENT_MS=24*3600_000;
const ANCHORS=new Set(['validation.failed','validation.recovered','milestone.achieved','refactor.validated',
  'subsystem.connected','structure.created','agent.collision','repository.checkpoint']);
function demonstration(id){
  const s=String(id||'').trim().toLowerCase();
  return s==='demo'||s.startsWith('demo ')||s.startsWith('demo(')||s.startsWith('demo-')||s.startsWith('demo_')||
    s.includes('fictional')||s.includes('demonstration');
}
// The provider ids one intent contributes (demonstrations never count).
function providersOf(i){
  const out=[];const add=p=>{if(p==null||p==='')return;if(demonstration(p))return;out.push(catalog.presence(p).id);};
  if(i.type==='agent.state')add(i.detail?.provider);
  if(i.type==='agent.collision'&&Array.isArray(i.detail?.providers))for(const p of i.detail.providers)add(p);
  return out;
}
function providersIn(intents){
  const ids=new Set();
  for(const i of intents)for(const id of providersOf(i))ids.add(id);
  return [...ids].sort();
}
function isAnchor(i){return ANCHORS.has(i.type)&&(i.type==='agent.collision'||(i.tier|0)>=2);}
function pairRecovered(fail,recovered){
  const cat=fail.detail?.category;
  for(const r of recovered){
    if(r.ts<=fail.ts)continue;
    const rc=r.detail?.category;
    if(cat&&rc&&cat!==rc)continue;
    return r;
  }
  return null;
}
// intents must already be sorted by ts. Binary search the first index at `from`, then scan until `to`.
function firstAtOrAfter(intents,t){
  let lo=0,hi=intents.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(intents[mid].ts<t)lo=mid+1;else hi=mid;}
  return lo;
}
function firstAfter(intents,t){
  let lo=0,hi=intents.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(intents[mid].ts<=t)lo=mid+1;else hi=mid;}
  return lo;
}
function inWindow(intents,from,to){
  const out=[];
  for(let i=firstAtOrAfter(intents,from);i<intents.length;i++){
    const x=intents[i];if(x.ts>to)break;out.push(x);
  }
  return out;
}
function scoreWindow(W){
  let score=0;const reasons=[];
  const has=t=>W.some(i=>i.type===t);
  const failed=W.filter(i=>i.type==='validation.failed'),recovered=W.filter(i=>i.type==='validation.recovered');
  const pair=failed.some(f=>pairRecovered(f,recovered));
  if(pair){score+=40;reasons.push('validation.failed+recovered');}
  if(has('milestone.achieved')){score+=30;reasons.push('milestone.achieved');}
  else if(has('refactor.validated')){score+=30;reasons.push('refactor.validated');}
  if(has('agent.collision')){score+=24;reasons.push('agent.collision');}
  const providers=providersIn(W);
  if(providers.length>=2){score+=20;reasons.push('providers>=2');score+=Math.min(15,5*(providers.length-2));}
  if(W.some(i=>i.type==='structure.created'&&(i.tier|0)>=2)){score+=15;reasons.push('structure.created');}
  else if(W.some(i=>i.type==='subsystem.connected'&&i.detail?.first)){score+=15;reasons.push('subsystem.connected');}
  if(has('repository.checkpoint')){score+=10;reasons.push('repository.checkpoint');}
  if(!W.some(i=>(i.tier|0)>=2))score-=10;
  if(providers.length===1&&!has('validation.failed')&&!has('validation.recovered')&&!has('milestone.achieved'))score-=8;
  return {score,reasons,providers};
}
// scoreWindow's score for any window [from, to] of the sorted intents, kept up to date as the window moves: each step
// adds or removes one intent, so a run of windows in increasing order costs one pass over the intents, not one scan per
// window. A failure pairs with a later compatible recovery (as pairRecovered: a missing category matches any) when the
// earliest compatible failure in the window precedes the latest recovery of a category.
const CODE={'milestone.achieved':1,'refactor.validated':2,'agent.collision':3,'repository.checkpoint':4,'validation.failed':5,
  'validation.recovered':6,'structure.created':7,'subsystem.connected':8};
function createSweep(all){
  const n=all.length,code=new Uint8Array(n),tier2=new Uint8Array(n),provs=new Array(n),failCls=new Int32Array(n),recCls=new Int32Array(n);
  const classes=(kind,i)=>{const c=all[i].detail?.category,key=c?c:null;let k=kind.index.get(key);
    if(k===undefined){k=kind.members.length;kind.index.set(key,k);kind.members.push([]);kind.keys.push(key);}kind.members[k].push(i);return k;};
  const F={index:new Map(),members:[],keys:[]},R={index:new Map(),members:[],keys:[]};
  for(let i=0;i<n;i++){
    const x=all[i];code[i]=CODE[x.type]||0;tier2[i]=(x.tier|0)>=2?1:0;failCls[i]=recCls[i]=-1;
    if(code[i]===7&&!tier2[i])code[i]=0;
    if(code[i]===8&&!x.detail?.first)code[i]=0;
    if(code[i]===5)failCls[i]=classes(F,i);
    if(code[i]===6)recCls[i]=classes(R,i);
    const p=x.type==='agent.state'||x.type==='agent.collision'?providersOf(x):null;provs[i]=p&&p.length?p:null;
  }
  const fHead=new Int32Array(F.members.length),fTail=new Int32Array(F.members.length),rHead=new Int32Array(R.members.length),rTail=new Int32Array(R.members.length);
  const count=new Int32Array(9),seen=new Map();let distinct=0,tiers=0,L=0,H=0;
  const touch=(i,d)=>{count[code[i]]+=d;tiers+=tier2[i]*d;
    if(provs[i])for(const id of provs[i]){const v=(seen.get(id)||0)+d;if(v===0){seen.delete(id);distinct--;}else{if(v===1&&d>0)distinct++;seen.set(id,v);}}};
  const enter=(i,tail)=>{touch(i,1);
    if(failCls[i]>=0){if(tail)fTail[failCls[i]]++;else fHead[failCls[i]]--;}
    if(recCls[i]>=0){if(tail)rTail[recCls[i]]++;else rHead[recCls[i]]--;}};
  const leave=(i,head)=>{touch(i,-1);
    if(failCls[i]>=0){if(head)fHead[failCls[i]]++;else fTail[failCls[i]]--;}
    if(recCls[i]>=0){if(head)rHead[recCls[i]]++;else rTail[recCls[i]]--;}};
  const earliest=k=>fHead[k]<fTail[k]?all[F.members[k][fHead[k]]].ts:Infinity;
  function pair(){
    if(!count[5]||!count[6])return false;
    let any=Infinity;for(let k=0;k<F.members.length;k++){const t=earliest(k);if(t<any)any=t;}
    const wild=F.index.has(null)?earliest(F.index.get(null)):Infinity;
    for(let k=0;k<R.members.length;k++){
      if(rHead[k]>=rTail[k])continue;
      const latest=all[R.members[k][rTail[k]-1]].ts,key=R.keys[k];
      if(key===null){if(latest>any)return true;continue;}
      const same=F.index.has(key)?earliest(F.index.get(key)):Infinity;
      if(latest>Math.min(same,wild))return true;
    }
    return false;
  }
  return function score(from,to){
    const lo=firstAtOrAfter(all,from),hi=Math.max(lo,firstAfter(all,to));
    while(H<hi)enter(H++,true);
    while(L>lo)enter(--L,false);
    while(L<lo)leave(L++,true);
    while(H>hi)leave(--H,false);
    let s=0;
    if(pair())s+=40;
    if(count[1]||count[2])s+=30;
    if(count[3])s+=24;
    if(distinct>=2)s+=20+Math.min(15,5*(distinct-2));
    if(count[7]||count[8])s+=15;
    if(count[4])s+=10;
    if(!tiers)s-=10;
    if(distinct===1&&!count[5]&&!count[6]&&!count[1])s-=8;
    return s;
  };
}
// The first recovery strictly after a failure that pairRecovered would return, by binary search.
function recoveries(recovered){
  const wild=[],by=new Map();
  for(const r of recovered){const c=r.detail?.category;if(!c){wild.push(r);continue;}let l=by.get(c);if(!l)by.set(c,l=[]);l.push(r);}
  const after=(list,t)=>{if(!list)return null;let lo=0,hi=list.length;while(lo<hi){const m=(lo+hi)>>1;if(list[m].ts<=t)lo=m+1;else hi=m;}return lo<list.length?list[lo]:null;};
  return fail=>{
    const c=fail.detail?.category;if(!c)return after(recovered,fail.ts);
    const a=after(by.get(c),fail.ts),b=after(wild,fail.ts);
    return !a?b:!b?a:b.ts<a.ts?b:a;
  };
}
function clampWindow(from,to,start,end){
  let a=from,b=to;
  if(a<start){b+=start-a;a=start;}
  if(b>end){a-=b-end;b=end;}
  if(a<start)a=start;if(b>end)b=end;
  if(!(b>a))return null;
  return {from:a,to:b};
}
function cmp(a,b){
  if(b.score!==a.score)return b.score-a.score;
  if(b.from!==a.from)return b.from-a.from;
  if(a.speed!==b.speed)return a.speed-b.speed;
  return a.to-b.to;
}
// The candidates are those of the exhaustive scan of 0.7.1: every anchor placed with its lead at 4x and 16x; every
// verified failure from its own time, at 4x when its recovery follows within a 4x view and 16x within a 16x view; and a
// failure recovered later than one 16x view, every 16x window inside the red period that starts at an intent or ends
// at the recovery. Failures recovered by the same run share those windows (a later failure's are a subset of the
// earliest's), so each red period is walked once. Candidates go to the sweep in increasing order, one run per kind.
function pick(intents,recordingStart,recordingEnd){
  const start=Number(recordingStart),end=Number(recordingEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!(end>start))return null;
  const all=(intents||[]).filter(i=>i&&Number.isFinite(i.ts)).slice().sort((a,b)=>a.ts-b.ts||String(a.id||'').localeCompare(String(b.id||'')));
  const rec=end-start;
  const V=rec<VIEW_MS?FALLBACK_MS:VIEW_MS;
  const score=createSweep(all);
  let best=null;
  const add=(from,to,speed)=>{
    const w=clampWindow(from,to,start,end);if(!w)return;
    const c={from:w.from,to:w.to,speed,score:score(w.from,w.to)};
    if(!best||cmp(c,best)<0)best=c;
  };
  const anchors=all.filter(isAnchor);
  for(const speed of [4,16]){
    const S=V*speed,lead=(S*LEAD)/100;
    for(const i of anchors)add(i.ts-lead,i.ts-lead+S,speed);
  }
  const next=recoveries(all.filter(i=>i.type==='validation.recovered'));
  const short={4:[],16:[]},red=new Map(),S16=V*16;
  for(const fail of all){
    if(fail.type!=='validation.failed'||(fail.tier|0)<2)continue;
    const recov=next(fail);if(!recov)continue;
    const A=recov.ts-fail.ts;if(!(A>0))continue;
    if(A>S16){if(!red.has(recov.ts))red.set(recov.ts,fail.ts);}
    else short[A>V*4?16:4].push(fail.ts);
  }
  for(const speed of [4,16])for(const t of short[speed])add(t,t+V*speed,speed);
  if(red.size){
    // Each red period [first failure, recovery]: a window from every intent in it that leaves a full 16x view before
    // the recovery (some period that began by then reaches that far), and the one that ends at the recovery.
    const periods=[...red].map(([hi,lo])=>({lo,hi})).sort((a,b)=>a.lo-b.lo);
    let k=0,reach=-Infinity;
    for(const i of all){
      while(k<periods.length&&periods[k].lo<=i.ts)reach=Math.max(reach,periods[k++].hi);
      if(!(i.ts+S16>reach))add(i.ts,i.ts+S16,16);
      else if(k>=periods.length)break;
    }
    for(const from of periods.map(p=>Math.max(p.lo,p.hi-S16)).sort((a,b)=>a-b))add(from,from+S16,16);
  }
  if(!best||best.score<=0)return null;
  const s=scoreWindow(inWindow(all,best.from,best.to));
  return {from:best.from,to:best.to,speed:best.speed,viewMs:V,score:s.score,reasons:s.reasons,providers:s.providers};
}
function bounds(windows){
  let start=Infinity,end=-Infinity;
  for(const w of windows||[]){
    if(Number.isFinite(w.start)&&w.start<start)start=w.start;
    if(Number.isFinite(w.end)&&w.end>end)end=w.end;
  }
  return {start,end};
}
// The intents of the windows, or, with `since`, those at or after it in the windows that end at or after it.
function intentsOf(windows,since=null){
  const out=[];
  for(const w of windows||[]){
    if(!w.intents||(since!==null&&!(w.end>=since)))continue;
    for(const i of w.intents)if(since===null||i?.ts>=since)out.push(i);
  }
  return out;
}
function recent(windows,end){const since=end-RECENT_MS;return pick(intentsOf(windows,since),since,end);}
function fromWindows(windows){
  if(!windows||!windows.length)return null;
  const {start,end}=bounds(windows);
  if(!(end>start))return null;
  if(end-start>RECENT_MS){const hit=recent(windows,end);if(hit)return hit;}
  return pick(intentsOf(windows),start,end);
}
// The same choice as fromWindows for a reader that loads windows on demand (the receiver, from its timeline index):
// windowsSince(t) returns at least every window that ends at or after t, and every window for -Infinity.
async function lastNight({start,end,windowsSince}){
  if(!(end>start))return null;
  if(end-start>RECENT_MS){const hit=recent(await windowsSince(end-RECENT_MS),end);if(hit)return hit;}
  return pick(intentsOf(await windowsSince(-Infinity)),start,end);
}
function publicView(projectId,picked){
  if(!picked)return {schema:SCHEMA,projectId,from:null,to:null,speed:null,viewMs:null,score:null,reasons:[],providers:[]};
  return {schema:SCHEMA,projectId,from:picked.from,to:picked.to,speed:picked.speed,viewMs:picked.viewMs,
    score:picked.score,reasons:picked.reasons,providers:picked.providers};
}
module.exports={RECENT_MS,pick,fromWindows,lastNight,publicView,inWindow,scoreWindow};

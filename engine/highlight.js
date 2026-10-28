'use strict';
// Deterministic highlight window for Home Last night and npm run film. Same module both call, so they cannot disagree.
const catalog=require('./providers');
const SCHEMA='code-resonance.highlight.v1';
const VIEW_MS=90_000,FALLBACK_MS=60_000,LEAD=35;
const ANCHORS=new Set(['validation.failed','validation.recovered','milestone.achieved','refactor.validated',
  'subsystem.connected','structure.created','agent.collision','repository.checkpoint']);
function demonstration(id){
  const s=String(id||'').trim().toLowerCase();
  return s==='demo'||s.startsWith('demo ')||s.startsWith('demo(')||s.startsWith('demo-')||s.startsWith('demo_')||
    s.includes('fictional')||s.includes('demonstration');
}
function providersIn(intents){
  const ids=new Set();
  const add=p=>{if(p==null||p==='')return;if(demonstration(p))return;ids.add(catalog.presence(p).id);};
  for(const i of intents){
    if(i.type==='agent.state')add(i.detail?.provider);
    if(i.type==='agent.collision'&&Array.isArray(i.detail?.providers))for(const p of i.detail.providers)add(p);
  }
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
function inWindow(intents,from,to){return intents.filter(i=>i.ts>=from&&i.ts<=to);}
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
function pick(intents,recordingStart,recordingEnd){
  const start=Number(recordingStart),end=Number(recordingEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!(end>start))return null;
  const all=(intents||[]).filter(i=>i&&Number.isFinite(i.ts)).slice().sort((a,b)=>a.ts-b.ts||String(a.id||'').localeCompare(String(b.id||'')));
  const rec=end-start;
  const V=rec<VIEW_MS?FALLBACK_MS:VIEW_MS;
  const seen=new Set(),cands=[];
  const add=(from,to,speed)=>{
    const w=clampWindow(from,to,start,end);if(!w)return;
    const key=`${w.from}:${w.to}:${speed}`;if(seen.has(key))return;seen.add(key);
    const s=scoreWindow(inWindow(all,w.from,w.to));
    cands.push({from:w.from,to:w.to,speed,viewMs:V,score:s.score,reasons:s.reasons,providers:s.providers});
  };
  const addPlaced=(desired,S,speed)=>add(desired,desired+S,speed);
  for(const speed of [4,16]){
    const S=V*speed,lead=(S*LEAD)/100;
    for(const i of all)if(isAnchor(i))addPlaced(i.ts-lead,S,speed);
  }
  const recovered=all.filter(i=>i.type==='validation.recovered');
  for(const fail of all){
    if(fail.type!=='validation.failed'||(fail.tier|0)<2)continue;
    const recov=pairRecovered(fail,recovered);if(!recov)continue;
    const A=recov.ts-fail.ts;if(!(A>0))continue;
    if(A>V*16){
      const S=V*16,lo=fail.ts,hi=recov.ts,starts=new Set([lo,hi-S]);
      for(const i of all)if(i.ts>=lo&&i.ts<=hi)starts.add(i.ts);
      for(const s of starts){
        let from=s;if(from+S>hi)from=hi-S;if(from<lo)from=lo;
        add(from,from+S,16);
      }
    }else{
      const speed=A>V*4?16:4;
      addPlaced(fail.ts,V*speed,speed);
    }
  }
  if(!cands.length)return null;
  cands.sort(cmp);
  const best=cands[0];
  if(best.score<=0)return null;
  return best;
}
function fromWindows(windows){
  if(!windows||!windows.length)return null;
  let start=Infinity,end=-Infinity;const intents=[];
  for(const w of windows){
    if(Number.isFinite(w.start)&&w.start<start)start=w.start;
    if(Number.isFinite(w.end)&&w.end>end)end=w.end;
    if(w.intents)for(const i of w.intents)intents.push(i);
  }
  if(!(end>start))return null;
  return pick(intents,start,end);
}
function publicView(projectId,picked){
  if(!picked)return {schema:SCHEMA,projectId,from:null,to:null,speed:null,viewMs:null,score:null,reasons:[],providers:[]};
  return {schema:SCHEMA,projectId,from:picked.from,to:picked.to,speed:picked.speed,viewMs:picked.viewMs,
    score:picked.score,reasons:picked.reasons,providers:picked.providers};
}
module.exports={pick,fromWindows,publicView};

'use strict';
// Long histories: the bounded, checkpointed fold (public/worlds/history.js) must equal a plain fold of every intent,
// whatever the arrival order, seeks or recipe switches, while memory stays bounded.
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const load=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000;
const proj={projectId:'history-test',graph:{nodes:[],edges:[]},stats:{}};
const STELLAR=recipe.generate(proj,{family:'stellar-forge',now:0}),CATHEDRAL=recipe.generate(proj,{family:'machine-cathedral',now:0});
// A deterministic synthetic project history: agent sessions (each a new id), edits, structure, validations, verified
// milestones (some early, so a bounded window must still remember them), commits; about 1 in 40 intents arrives late.
function synthetic(n,seed=7){
  let s=seed;const r=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};
  const out=[];let ts=T0,session=0,agent=null,state=null;
  const files=Array.from({length:60},(_,i)=>`f${String(i).padStart(13,'0')}`),groups=Array.from({length:8},(_,i)=>`g${String(i).padStart(13,'0')}`);
  for(let k=0;k<n;k++){
    ts+=Math.floor(r()*4000);
    let i;const x=r();
    if(!agent||x<.45){
      if(!agent||state==='disconnected'){agent=`agent-${++session}`;state='connected';}
      else{const next={connected:'processing',processing:'tool',tool:r()<.5?'processing':'tool',waiting:r()<.3?'disconnected':'processing'}[state]||'waiting';state=r()<.12?'waiting':next;}
      i={type:'agent.state',tier:0,magnitude:.2,evidence:'observed',subject:{agentId:agent,voice:session%8,fileId:state==='tool'?files[Math.floor(r()*60)]:undefined},detail:{state,activity:state==='tool'?['reading','editing','testing'][Math.floor(r()*3)]:null,provider:'claude-code'}};
    }else if(x<.75)i={type:'structure.created',tier:r()<.7?0:1,magnitude:r(),evidence:'derived',subject:{fileId:files[Math.floor(r()*60)]}};
    else if(x<.85)i={type:'module.created',tier:r()<.5?1:2,magnitude:r(),evidence:'derived',subject:{fileId:files[Math.floor(r()*60)],groupId:groups[Math.floor(r()*8)]}};
    else if(x<.93)i={type:r()<.7?'validation.passed':'validation.failed',tier:2,magnitude:r(),evidence:'verified',subject:{fileIds:files.slice(0,1+Math.floor(r()*6))}};
    else if(x<.96)i={type:'subsystem.connected',tier:2,magnitude:r(),evidence:'derived',subject:{fileId:files[Math.floor(r()*60)],targetId:files[Math.floor(r()*60)]}};
    else if(x<.985)i={type:'repository.checkpoint',tier:2,magnitude:r(),evidence:'observed',subject:{fileIds:files.slice(0,3)}};
    else i={type:'milestone.achieved',tier:r()<.2?4:3,magnitude:.6+.4*r(),evidence:'verified',subject:{fileIds:files.slice(Math.floor(r()*4),6)},detail:{kinds:['integration']}};
    const late=r()<.025;
    out.push({v:1,id:`e${k}:${i.type}:0`,ts:late?ts-Math.floor(r()*20000):ts,ord:k,...i,subject:i.subject||{},detail:i.detail||{}});
  }
  return out;
}
const cmp=(a,b)=>a.ts-b.ts||a.ord-b.ord;
async function fold(list,r=STELLAR){
  const {createDirector}=await load('director'),{createAgents}=await load('agents');
  const director=createDirector({recipe:r}),agents=createAgents();
  for(const i of list.slice().sort(cmp)){agents.record(i);director.process(i);}
  return {director,agents};
}
async function bounded(r=STELLAR,opts={every:100,maxRaw:1000,maxSparse:6}){
  const {createDirector}=await load('director'),{createAgents}=await load('agents'),{createHistory}=await load('history');
  const director=createDirector({recipe:r}),agents=createAgents();
  const history=createHistory({step:i=>{agents.record(i);return director.process(i);},snapshot:()=>({d:director.snapshot(),a:agents.snapshot()}),restore:x=>{director.restore(x.d);agents.restore(x.a);},...opts});
  return {director,agents,history};
}
// Everything a world or a label can observe at time t.
function observe({director,agents},t){
  return JSON.stringify({unlocks:director.unlockedAt(t).map(u=>+u.level.toFixed(4)),lasting:director.lasting().map(l=>[l.type,l.effect,l.count,l.first,l.times]),
    attention:director.attentionAt(t,2)?.id||null,activity:+director.activityAt(t).toFixed(6),phase:director.phaseAt(t),tokens:director.tokens,
    recent:director.commands.filter(c=>c.at>t-60000).map(c=>[c.id,c.tier,c.effect,+c.scale.toFixed(6),c.count]),
    agents:agents.list(t).map(a=>[a.id,a.number,a.display,a.label,a.home,a.arrived,+a.alpha.toFixed(4)])});
}
test('Streaming a long history with late arrivals equals a plain fold, with bounded memory',async()=>{
  const all=synthetic(20000);
  const b=await bounded();
  let maxRaw=0,maxCk=0,latest=0;
  for(let k=0;k<all.length;k++){const i=all[k];b.history.add(i);latest=Math.max(latest,i.ts);const s=b.history.stats();maxRaw=Math.max(maxRaw,s.raw);maxCk=Math.max(maxCk,s.checkpoints);
    // Mid-stream too (transient decisions such as tokens and cooldowns must match, not only the end state).
    if(k%500===499)assert.equal(observe(b,latest+1),observe(await fold(all.slice(0,k+1)),latest+1),`after ${k+1} intents`);}
  const end=Math.max(...all.map(i=>i.ts))+1;
  assert.equal(observe(b,end),observe(await fold(all),end));
  const s=b.history.stats();
  assert(s.late>100,`late arrivals were exercised (${s.late})`);
  assert(s.base>15000,'the window moved far beyond its start');
  assert(maxRaw<=1000,`raw intents stay bounded (${maxRaw})`);
  assert(maxCk<=6+1000/100+1,`checkpoints stay bounded (${maxCk})`);
  assert.equal(s.covered,0,'no live intent fell before the window');
  const ref=await fold(all);
  assert(ref.director.unlockedAt(end).filter(u=>u.level>0).length===4,'early milestones unlocked every ambient layer');
  assert(ref.director.lasting().length>0);
});
test('Seeks forward and back, before the window and inside it, restore exactly the fold before the seek point',async()=>{
  const all=synthetic(12000,11),sorted=all.slice().sort(cmp);
  const b=await bounded();for(const i of all)b.history.add(i);
  let s=1;const r=()=>{s=(s*48271)%2147483647;return s/2147483647;};
  const span=[sorted[0].ts,sorted.at(-1).ts];
  // Inside the window (the last ~8 % of this history), before it, and random points.
  const at=[.999,.97,.985,.995,.02,.5,.991,.3,.975,.7,.998,.96].concat(Array.from({length:6},r));
  for(let k=0;k<at.length;k++){
    const t=Math.round(span[0]+(span[1]-span[0])*at[k]);
    b.history.prime(t,all);
    assert.equal(observe(b,t),observe(await fold(sorted.filter(i=>i.ts<t)),t),`seek ${k} to ${t-T0}`);
    // Playback resumes: the schedule delivers what follows, in recorded order (late ones included).
    const t2=t+600000;for(const i of all)if(i.ts>=t&&i.ts<t2)b.history.add(i);
    assert.equal(observe(b,t2),observe(await fold(sorted.filter(i=>i.ts<t2)),t2),`playback after seek ${k}`);
  }
  assert(b.history.stats().jumps>0,'far seeks forward reused parked checkpoints');
});
test('A parked checkpoint is reused only when the intents leading to it are exactly the same',async()=>{
  const all=synthetic(6000,13),sorted=all.slice().sort(cmp),span=[sorted[0].ts,sorted.at(-1).ts],at=f=>Math.round(span[0]+(span[1]-span[0])*f);
  const b=await bounded();for(const i of all)b.history.add(i);
  b.history.prime(at(.1),all);
  // The supplied history now lacks one intent from the middle: every parked checkpoint after it is stale.
  // (a verified milestone: its lasting record and unlock make a stale checkpoint visible long after).
  const missing=sorted.find((i,k)=>i.type==='milestone.achieved'&&k>sorted.length*.3&&k<sorted.length*.6),changed=all.filter(i=>i!==missing);
  assert(missing);
  b.history.prime(at(.95),changed);
  assert.equal(observe(b,at(.95)),observe(await fold(changed.filter(i=>i.ts<at(.95))),at(.95)));
  // With the same history again, a far seek forward jumps.
  const c=await bounded();for(const i of all)c.history.add(i);c.history.prime(at(.1),all);c.history.prime(at(.95),all);
  assert(c.history.stats().jumps>0);assert.equal(observe(c,at(.95)),observe(await fold(all.filter(i=>i.ts<at(.95))),at(.95)));
});
test('Decisions do not depend on the world drawing them; a recipe switch relabels effects without replaying history',async()=>{
  const all=synthetic(4000,3),end=Math.max(...all.map(i=>i.ts))+1;
  const a=await fold(all,STELLAR),c=await fold(all,CATHEDRAL);
  const decisions=d=>JSON.stringify({c:d.commands.map(x=>[x.id,x.tier,x.at,+x.scale.toFixed(6)]),u:d.unlockedAt(end).map(u=>u.level),t:d.tokens,l:d.lasting().map(l=>[l.type,l.count])});
  assert.equal(decisions(a.director),decisions(c.director));
  assert.notEqual(JSON.stringify(a.director.commands.map(x=>x.effect)),JSON.stringify(c.director.commands.map(x=>x.effect)));
  a.director.setRecipe(CATHEDRAL);
  assert.equal(JSON.stringify(a.director.commands.map(x=>x.effect)),JSON.stringify(c.director.commands.map(x=>x.effect)));
  assert.deepEqual(a.director.unlockedAt(end).map(u=>u.name),CATHEDRAL.genome.ambient.unlocks);
});
test('Agent numbers survive any history length; departed agents are forgotten and never renumber the others',async()=>{
  const all=synthetic(15000,5),end=Math.max(...all.map(i=>i.ts))+1;
  const ref=await fold(all);
  const sessions=new Set(all.filter(i=>i.type==='agent.state').map(i=>i.subject.agentId)).size;
  const present=ref.agents.list(end);
  assert(present.length>=1);
  for(const p of present)assert.equal(p.number,Number(p.id.split('-')[1]),'Agent N is the Nth session ever seen, even thousands of intents later');
  assert(ref.agents.stats().agents<=3,`only present agents are kept (${ref.agents.stats().agents} of ${sessions} sessions)`);
  assert(ref.agents.stats().events<=400,'event history per agent is bounded');
});

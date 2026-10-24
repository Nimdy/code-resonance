'use strict';
// Long-history qualification (Node, the real public/worlds modules): what the PR #3 host lost beyond 30,000 intents,
// and whether the checkpointed history (public/worlds/history.js) reproduces a plain fold exactly at much larger
// sizes, with bounded memory and acceptable seek times.
//
// node visual/history.qual.js [--sizes 30000,100000,300000,1000000] [--baseline <git ref of the PR #3 host>]
// The history is synthetic (labelled as such in the results): agent sessions, edits, structure, validations, commits
// and verified milestones in proportions taken from the Lumen Recipes recording (142 of 205 intents are agent states),
// spread over simulated working days, with ~2.5 % of intents arriving late. Two profiles: "active" (verified milestones
// throughout) and "mature" (milestones only in the first tenth of the history, as when a project settles).
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const REPO=path.resolve(__dirname,'../..');
const recipes=require(path.join(REPO,'engine/recipe'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const SIZES=arg('sizes','30000,100000,300000,1000000').split(',').map(Number);
const BASELINE=arg('baseline','06dd680');
const OUT=path.join(__dirname,'..','results','visual');
const T0=1790000000000;
const RECIPE=recipes.generate({projectId:'long-history',graph:{nodes:[],edges:[]},stats:{}},{family:'fractal-biosphere',now:0});
function synthetic(n,{seed=20261024,earlyMilestones=false}={}){
  let s=seed>>>0;const r=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};
  const files=Array.from({length:400},(_,i)=>`f${i.toString(16).padStart(13,'0')}`),groups=Array.from({length:24},(_,i)=>`g${i.toString(16).padStart(13,'0')}`);
  const out=[];let ts=T0,session=0,agents=new Map();
  for(let k=0;k<n;k++){
    // Working days: bursts of activity, nights of silence.
    ts+=r()<.0005?8*3600000:Math.floor(r()*3000);
    let i;const x=r();
    if(x<.69){
      if(!agents.size||r()<.004){const id=`session-${++session}`;agents.set(id,'connected');}
      const ids=[...agents.keys()],id=ids[Math.floor(r()*ids.length)],cur=agents.get(id);
      const next=r()<.02?'disconnected':{connected:'processing',processing:'tool',tool:r()<.5?'processing':'tool',waiting:'processing'}[cur]||(r()<.2?'waiting':'processing');
      if(next==='disconnected')agents.delete(id);else agents.set(id,next);
      i={type:'agent.state',tier:0,magnitude:.2,evidence:'observed',subject:{agentId:id,voice:session%8,...(next==='tool'?{fileId:files[Math.floor(r()*400)]}:{})},detail:{state:next,activity:next==='tool'?'editing':null,provider:'claude-code'}};
    }else if(x<.86)i={type:'structure.created',tier:r()<.7?0:1,magnitude:r(),evidence:'derived',subject:{fileId:files[Math.floor(r()*400)]}};
    else if(x<.92)i={type:'module.created',tier:1,magnitude:r(),evidence:'derived',subject:{fileId:files[Math.floor(r()*400)],groupId:groups[Math.floor(r()*24)]}};
    else if(x<.97)i={type:r()<.75?'validation.passed':'validation.failed',tier:2,magnitude:r(),evidence:'verified',subject:{fileIds:files.slice(0,1+Math.floor(r()*8))}};
    else if(x<.985)i={type:'repository.checkpoint',tier:2,magnitude:r(),evidence:'observed',subject:{fileIds:files.slice(0,4)}};
    else if(x<.9985)i={type:'subsystem.connected',tier:2,magnitude:r(),evidence:'derived',subject:{fileId:files[Math.floor(r()*400)],targetId:files[Math.floor(r()*400)]}};
    // Verified milestones are rare (about one in 700 intents), so the earliest ones fall far outside any recent window.
    // A mature project (earlyMilestones): verified milestones only in the first tenth of its history.
    else if(earlyMilestones&&k>n/10)i={type:'validation.passed',tier:2,magnitude:r(),evidence:'verified',subject:{fileIds:files.slice(0,3)}};
    else i={type:'milestone.achieved',tier:3,magnitude:.7,evidence:'verified',subject:{fileIds:[files[Math.floor(r()*24)*16]]},detail:{kinds:['integration']}};
    const late=r()<.025;
    out.push({v:1,id:`e${k}:${i.type}:0`,ts:late?ts-Math.floor(r()*15000):ts,ord:k,subject:{},detail:{},...i});
  }
  return out;
}
const cmp=(a,b)=>a.ts-b.ts||a.ord-b.ord;
// PR #3's director, agents and host intent store, extracted from git so the comparison runs the code as it was.
function baselineModules(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-baseline-'));fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
  for(const f of ['director','agents'])fs.writeFileSync(path.join(dir,`${f}.js`),cp.execFileSync('git',['show',`${BASELINE}:public/worlds/${f}.js`],{cwd:REPO}));
  return dir;
}
async function main(){
  const {createDirector}=await import(path.join(REPO,'public/worlds/director.js'));
  const {createAgents}=await import(path.join(REPO,'public/worlds/agents.js'));
  const {createHistory}=await import(path.join(REPO,'public/worlds/history.js'));
  const base=baselineModules();
  const old={director:(await import(path.join(base,'director.js'))).createDirector,agents:(await import(path.join(base,'agents.js'))).createAgents};
  const results={at:new Date().toISOString(),synthetic:true,baseline:BASELINE,node:process.version,cpu:os.cpus()[0]?.model,sizes:[]};
  const fold=list=>{const director=createDirector({recipe:RECIPE}),agents=createAgents();for(const i of list.slice().sort(cmp)){agents.record(i);director.process(i);}return {director,agents};};
  const view=({director,agents},t)=>({unlocked:director.unlockedAt(t).filter(u=>u.level>0).length,
    blooms:director.lasting().filter(l=>l.effect==='fractal-bloom').reduce((n,l)=>n+l.count,0),
    agents:agents.list(t).map(a=>`${a.number}:${a.display}`).sort(),tokens:director.tokens,attention:director.attentionAt(t,2)?.id||null,
    phase:director.phaseAt(t),activity:+director.activityAt(t).toFixed(5)});
  for(const n of SIZES)for(const profile of ['active','mature']){
    const all=synthetic(n,{earlyMilestones:profile==='mature'}),sorted=all.slice().sort(cmp),end=sorted.at(-1).ts+1;
    const row={profile,intents:n,milestones:all.filter(i=>i.type==='milestone.achieved').length,sessions:new Set(all.filter(i=>i.type==='agent.state').map(i=>i.subject.agentId)).size,
      hours:+((end-T0)/3600000).toFixed(1)};
    // ---- PR #3: 30,000 newest intents kept; after a seek or recipe switch the director and agents re-fold from them.
    {
      const kept=sorted.slice(-30000);const director=old.director({recipe:RECIPE}),agents=old.agents();
      for(const i of kept){agents.record(i);director.process(i);}
      const blooms=director.commands.filter(c=>c.effect==='fractal-bloom').length;
      const ref=view(fold(all),end);
      const present=agents.list(end).map(a=>`${a.number}:${a.display}`).sort();
      row.pr3={unlocked:director.unlockedAt(end).filter(u=>u.level>0).length,unlockedExpected:ref.unlocked,blooms,bloomsExpected:ref.blooms,
        agentLabelsDiffer:JSON.stringify(present)!==JSON.stringify(ref.agents),agents:present.slice(0,6),agentsExpected:ref.agents.slice(0,6),
        intentsForgotten:Math.max(0,n-30000)};
    }
    // ---- Checkpointed history: stream everything (late arrivals included), then seek around.
    const director=createDirector({recipe:RECIPE}),agents=createAgents();
    const history=createHistory({step:i=>{agents.record(i);return director.process(i);},snapshot:()=>({d:director.snapshot(),a:agents.snapshot()}),restore:x=>{director.restore(x.d);agents.restore(x.a);}});
    let t=process.hrtime.bigint();
    for(const i of all)history.add(i);
    const streamMs=Number(process.hrtime.bigint()-t)/1e6;
    const h=history.stats();
        // Memory held by the history: the raw window plus the checkpoints (serialized size; heap deltas are too noisy).
    const intentBytes=JSON.stringify(all.slice(0,2000)).length/2000;
    row.history={streamMs:Math.round(streamMs),usPerIntent:+(streamMs*1000/n).toFixed(2),...h,
      payloadMB:0,checkpointKB:Math.round(JSON.stringify(director.snapshot(),(k,v)=>v instanceof Map?[...v]:v).length/1024+JSON.stringify(agents.snapshot(),(k,v)=>v instanceof Map?[...v]:v).length/1024)};
    row.history.payloadMB=+((h.raw*intentBytes+(h.checkpoints+h.parked)*row.history.checkpointKB*1024)/1048576).toFixed(1);
    const exactEnd=JSON.stringify(view({director,agents},end))===JSON.stringify(view(fold(all),end));
    const seeks=[];
    for(const f of [.9995,.995,.5,.02,.999]){
      const at=Math.round(T0+(end-T0)*f);t=process.hrtime.bigint();history.prime(at,all);const ms=Number(process.hrtime.bigint()-t)/1e6;
      const exact=JSON.stringify(view({director,agents},at))===JSON.stringify(view(fold(sorted.filter(i=>i.ts<at)),at));
      seeks.push({at:f,ms:Math.round(ms),exact,jumps:history.stats().jumps});
    }
    row.history.exactAtEnd=exactEnd;row.history.seeks=seeks;
    results.sizes.push(row);
    console.log(JSON.stringify(row));
  }
  fs.rmSync(base,{recursive:true,force:true});
  fs.writeFileSync(path.join(OUT,'history-qualification.json'),JSON.stringify(results,null,2));
  const pass=results.sizes.every(r=>r.history.exactAtEnd&&r.history.seeks.every(s=>s.exact)&&r.history.raw<=30000);
  console.log(pass?'PASS  checkpointed history equals a plain fold at every size and seek, raw window bounded':'FAIL  see history-qualification.json');
  process.exitCode=pass?0:1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});

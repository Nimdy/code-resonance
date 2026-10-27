'use strict';
// Fractal Biosphere's digital life (public/worlds/life/biosphere.js), continued from tests/life-biosphere.test.js:
// disturbances scatter (and make the whole water flinch) and recoveries bring them back, one organism at a time draws a
// gathering that moves on, a verified milestone makes a lasting hotspot, a young habitat keeps the pollinators it cannot
// feed dormant, and the ecosystem is deterministic across snapshots (the grammar's derived caches included) and on the
// performance timeline.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,RECIPE,graph,setup,ecosystemOf,run}=require('./life-biosphere-fixture.js');
// A larger project: ten subsystems (ten crowns) for the gatherings.
function graph10(){
  const nodes=[],at=[[0,0],[1,0],[0,1],[-1,1],[-1,0],[1,-1],[2,-1],[-2,1],[0,2],[0,-2]];
  at.forEach(([q,r],g)=>{nodes.push({id:`g${g}`,type:'group',order:g,q,r,angle:g,counts:{function:4+g,class:g%2}});
    for(let m=0;m<2+g;m++)nodes.push({id:`g${g}/m${m}`,type:'module',group:`g${g}`,dir:`d${m%2}`,q,r,state:m%3?'committed':'validated',counts:{function:2}});});
  return {nodes,edges:[]};
}
// Visits per organism (its one or two heads together), by the organism's id.
const byOrg=eco=>{const m=new Map(),S=eco.sites;for(let k=0;k<S.count;k++)if(S.kind[k]===0){const id=S.ids[k].split('#')[0];m.set(id,(m.get(id)||0)+S.visits[k]);}return m;};
test('A failure scatters the gathering at its organism; after the recovery pollinators return',async()=>{
  const ctx=await setup(),h=ctx.bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000),sites=h.sites;
  const {eco}=ecosystemOf(ctx,h);
  run(eco,90*20);
  // The most visited organism (its heads together).
  const at=id=>byOrg(eco).get(id)||0,busy=[...byOrg(eco)].sort((a,b)=>b[1]-a[1])[0],id=busy[0];
  const before=busy[1];assert(before>2,`a gathering (${before.toFixed(1)})`);
  eco.influence({kind:'disturb',site:id,amount:.9});
  let fled=Infinity;run(eco,20*20,t=>{if(fled===Infinity&&at(id)<before*.25)fled=t/20;});
  assert(fled<15,`scattered within ${fled}s`);
  const during=at(id);assert(during<before*.3,`stays unwelcome while strained (${during.toFixed(1)})`);
  eco.influence({kind:'recover',site:id,amount:.9});
  let back=0,returned=Infinity;run(eco,60*20,t=>{const v=at(id);back=Math.max(back,v);if(returned===Infinity&&v>=Math.max(3,before*.5))returned=t/20;});
  assert(back>Math.max(1,during*2),`they return (${back.toFixed(1)})`);
  assert(returned<30,`a recovered crown draws them back within half a minute (${returned}s)`);
});
test('Deterministic: the same inputs give the same ecosystem, and a snapshot restored into a fresh one continues exactly',async()=>{
  const ctx=await setup(),h=ctx.bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000),sites=h.sites;
  const a=ecosystemOf(ctx,h).eco,b=ecosystemOf(ctx,h).eco;
  run(a,400);run(b,400);assert.equal(a.digest(),b.digest());
  const snap=a.snapshot();run(a,600);
  const c=ecosystemOf(ctx,[],{}).eco;c.setSiteData(h.data);c.restore(snap);run(c,600);
  assert.equal(c.digest(),a.digest(),'restored (the grammar\'s caches are derived from the restored state)');
});
test('On the performance timeline (driver, shadow model): the same moment after continuous play or a fresh restore',async()=>{
  const {bio,drv}=await setup(),{createLifeTimeline}=await import('../public/worlds/life/timeline.js');const score=require('../public/score.js');
  const g0=graph(),entries=[];
  for(let k=0;k<12;k++){const start=T0+k*10000,keep=new Set(g0.nodes.filter(n=>n.type==='group'||+n.id.split('/')[0].slice(1)<=k/2).map(n=>n.id));
    const nodes=g0.nodes.filter(n=>keep.has(n.id)||keep.has(n.group)&&n.type==='module'&&+n.id.split('/m')[1]<=k||n.parent&&keep.has(n.parent.split('#')[0]));
    const intents=k===6?[{v:1,id:`f${k}`,type:'validation.failed',ts:start+2000,tier:2,magnitude:.6,evidence:'verified',subject:{groupId:'g0'},detail:{}}]:
      k===9?[{v:1,id:`r${k}`,type:'validation.recovered',ts:start+2000,tier:3,magnitude:.6,evidence:'verified',subject:{groupId:'g0'},detail:{}}]:[];
    entries.push({seq:k,start,end:start+10000,frame:{start,end:start+10000,controls:{energy:.4,tension:.2}},graph:{keyframe:true,nodes:nodes.filter(n=>n.type!=='group'||nodes.some(m=>m.group===n.id)).concat(g0.nodes.filter(n=>n.type==='group')),edges:[]},intents});}
  const make=()=>{const tl=createLifeTimeline();tl.prime(entries);return drv.createLifeDriver({grammar:bio.biosphereGrammar(RECIPE),timeline:tl,seed:5,config:()=>({speed:1,tempo:92,epoch:T0,params:{},film:true,live:false}),score});};
  const a=make();for(let v=0;v<=115;v+=1/15)a.update({tview:v});
  const b=make();b.update({tview:115});
  assert.equal(a.digest(),b.digest());
  const st=a.stats();assert(st.ecosystem.sites>=6&&st.habitats>1,'the habitat followed the structure');
});
// Pollinators visiting each organism (orbiting one of its heads), by the organism's id.
const visitors=(eco,POLL,MODE)=>{const n=new Map();for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&eco.sp[i]===POLL&&eco.mode[i]===MODE.orbit){const id=eco.sites.ids[eco.tgt[i]].split('#')[0];n.set(id,(n.get(id)||0)+1);}return n;};
test('Gatherings: one organism draws clearly more pollinators than the others, and over minutes the concentration moves on',async()=>{
  const ctx=await setup(),{bio,sim,mdl}={...ctx,mdl:await import('../public/worlds/model.js')};
  const model=mdl.createModel();model.applyDelta({keyframe:true,...graph10()},T0,T0+10000);
  const h=bio.biosphereGrammar(RECIPE).habitat(model,T0+20000),{eco}=ecosystemOf(ctx,h);
  const crowns=[];for(let k=0;k<eco.sites.count;k++)if(eco.sites.kind[k]===0)crowns.push(k);const orgs=[...new Set(crowns.map(k=>eco.sites.ids[k].split('#')[0]))];assert.equal(orgs.length,10);
  const ratios=[],hot=[];let acc=new Map(),n=0;
  run(eco,330*20,t=>{if(t<30*20||t%20)return;for(const [k,v] of visitors(eco,bio.POLLINATOR,sim.MODE))acc.set(k,(acc.get(k)||0)+v);n++;
    if(n===30){const avg=orgs.map(k=>(acc.get(k)||0)/n),best=Math.max(...avg),o=avg.indexOf(best),rest=avg.filter((_,q)=>q!==o);
      ratios.push(best/Math.max(.2,rest.reduce((a,b)=>a+b,0)/rest.length));hot.push(o);acc=new Map();n=0;}});
  const median=ratios.slice().sort((a,b)=>a-b)[ratios.length>>1];
  assert(median>2.2,`the busiest organism holds ${median.toFixed(1)}x the others (windows of 30 s: ${ratios.map(r=>r.toFixed(1))})`);
  assert(new Set(hot).size>=3,`the hotspot moves (${hot})`);
  // Nectar and glow are bounded conditions of the crowns; the glow follows the visitors.
  for(const k of crowns){const st=eco.sites.state(k);assert(st.nectar>=0&&st.nectar<=1&&st.glow>=0&&st.glow<=1);}
  const vs=crowns.map(k=>eco.sites.visits[k]),gs=crowns.map(k=>eco.sites.state(k).glow);
  assert(gs[vs.indexOf(Math.max(...vs))]>gs[vs.indexOf(Math.min(...vs))],'the busiest crown glows more than the emptiest');
});
test('A verified milestone makes a lasting hotspot; a small habitat is not swamped (pollinators it cannot feed rest)',async()=>{
  const ctx=await setup(),{bio,sim}=ctx,mdl=await import('../public/worlds/model.js');
  const model=mdl.createModel();model.applyDelta({keyframe:true,...graph10()},T0,T0+10000);
  const h=bio.biosphereGrammar(RECIPE).habitat(model,T0+20000),{eco}=ecosystemOf(ctx,h);
  run(eco,60*20);
  // The least visited organism becomes a lasting attractor.
  const k=[...byOrg(eco)].sort((a,b)=>a[1]-b[1])[0][0];
  eco.influence({kind:'lasting',site:k,amount:.9});
  let mine=0,others=0,n=0;run(eco,180*20,t=>{if(t<20*20||t%20)return;const v=visitors(eco,bio.POLLINATOR,sim.MODE);for(const [q,c] of v){if(q===k)mine+=c;else others+=c;}n++;});
  assert(mine/n>2*(others/n)/9,`the lasting attractor keeps its visitors (${(mine/n).toFixed(1)} vs ${(others/n/9).toFixed(1)} per other organism)`);
  // One organism only: about as many orbit it as it carries; the rest explore or rest.
  const one=[{id:'solo',x:0,y:3,z:0,r:1.2,w:2,kind:0},{id:'solo#root',x:0,y:.5,z:0,r:.3,w:.5,kind:1}];
  const e2=ecosystemOf(ctx,one).eco;let worst=0,rest=0,awake=0;
  run(e2,120*20,t=>{if(t<30*20||t%20)return;const v=visitors(e2,bio.POLLINATOR,sim.MODE).get('solo')||0;worst=Math.max(worst,v);let a=0;
    for(let i=0;i<e2.capacity;i++)if(e2.alive[i]&&e2.sp[i]===bio.POLLINATOR){if(e2.mode[i]===sim.MODE.rest)rest++;else a++;}awake=Math.max(awake,a);});
  // Only as many are awake as the crown can feed (1.3 times what it carries); the others stay dormant.
  assert(awake<=Math.round(1.3*Math.min(26,Math.max(12,8+8*1.2)))+1,`a young habitat is not sprinkled with pollinators (${awake} awake)`);
  assert(worst<=30,`a single small crown is never swamped (${worst} orbiting at most)`);
  assert(rest>0,'pollinators the habitat cannot feed rest a while');
});
test('A failure anywhere makes the whole water flinch (gatherings everywhere scatter, colonies part, drifters stir), then life gathers again',async()=>{
  const ctx=await setup(),{bio,sim}=ctx,h=bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000),{eco}=ecosystemOf(ctx,h);
  run(eco,90*20);
  const orbiting=()=>{let n=0;for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&eco.sp[i]===bio.POLLINATOR&&eco.mode[i]===sim.MODE.orbit)n++;return n;};
  const share=(k,m)=>{let a=0,n=0;for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&eco.sp[i]===k){n++;if(eco.mode[i]===m)a++;}return a/n;};
  const arousal=()=>{let s=0,n=0;for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&eco.sp[i]===bio.DRIFTER){s+=eco.fa[i*2+1];n++;}return s/n;};
  // The failing organism: the least visited one (so the scattering elsewhere is the flinch, not its own void).
  const quiet=[...byOrg(eco)].sort((a,b)=>a[1]-b[1])[0][0],busy=[...byOrg(eco)].sort((a,b)=>b[1]-a[1])[0][0];
  const before=orbiting(),busyBefore=byOrg(eco).get(busy),calm=arousal();assert(before>10&&busyBefore>3,`gatherings before (${before})`);
  eco.influence({kind:'disturb',site:quiet,amount:.6});
  run(eco,2*20);
  assert(orbiting()<before*.25,`every gathering scatters (${orbiting()} of ${before} still orbiting)`);
  assert(share(bio.PLANKTON,sim.MODE.disperse)>.5,`colonies part (${share(bio.PLANKTON,sim.MODE.disperse).toFixed(2)})`);
  assert(arousal()>calm+.2,`drifters stir (${calm.toFixed(2)} → ${arousal().toFixed(2)})`);
  // It passes: the pollinators come back over the next seconds (a re-gathering, not a jump).
  const back=[];run(eco,28*20,t=>{if(t%(4*20)===0)back.push(orbiting());});
  assert(back[0]<before*.5&&back.at(-1)>before*.6,`they gather again gradually (${back})`);
});

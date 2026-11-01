'use strict';
// Temporal Terrain, the idle flight over history: once nothing has happened for a while and the director's activity is
// idle, the camera's goal travels back along the time axis over the land's history to where it began and returns, then
// rests; later flights on a lattice of view time. Any happening (an effect, an event of the land, an edit, an agent's
// state) ends it at once, an agent at work holds it, and it only flies where there is history to fly over. The goal is a
// pure function of the performance and the moment; portrait keeps its steep view; the haze counts from the camera.
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,ID='temporal-terrain',LAST=T0+360000;
// (sixty files at generation: the identity's spacing lays the land out about a hundred units wide)
function project(){const nodes=[{id:'g0',type:'group'},{id:'g1',type:'group'},{id:'g2',type:'group'}];
  for(let i=0;i<60;i++)nodes.push({id:`m${i}`,type:'module',group:`g${i%3}`,dir:`d${i%3}`,lang:'ts',counts:{function:3}});
  return {projectId:sha('terrain-flight'),graph:{nodes,edges:[]},stats:{raw:100},agents:[]};}
// A land laid down over six minutes: one file stood before time, then a file every 15 s across three ranges (the last at
// LAST); `intents` go to the director and the agents' lifecycle at their times; `aspect` the camera's.
async function scene({intents=[],aspect=16/9,history=true}={}){
  const {THREE}=await load('core'),{createFamily}=await load('terrain'),{createDirector}=await load('director'),{createAgents}=await load('agents'),{createModel}=await load('model');
  const m=createModel(),g=id=>({id,type:'group',q:0,r:0,order:0,counts:{}}),mod=(id,G)=>({id,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  m.reset({nodes:[g('G0'),g('G1'),g('G2'),mod('f0','G0'),...(history?[]:[mod('f1','G1'),mod('f2','G2')])],edges:[]},T0);
  if(history)for(let k=1;k<=24;k++)m.applyDelta({add:[mod(`f${k}`,`G${k%3}`)],remove:[],addEdges:k>2?[{a:`f${k}`,b:`f${k-1}`,kind:'depends',cross:true}]:[],removeEdges:[]},T0+15000*k,T0+15000*k+1000);
  const r=recipe.generate(project(),{family:ID,now:0}),director=createDirector({recipe:r}),agents=createAgents();
  for(const i of intents){agents.record(i);director.process(i);}
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,aspect,.1,4000);camera.position.set(0,120,200);
  const w=createFamily({scene,camera,model:m,recipe:r,speed:()=>1,name:id=>id,director,agents,pipeline:{size:aspect<1?[720,1280]:[1280,720]}});w.rebuild();
  const frame=(t,o={})=>({t,tsec:(t-T0)/1000,tview:(t-T0)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:director.activityAt(t),phase:director.phaseAt(t),
    unlocks:[],agents:agents.list(t),overrides:o,quality:0,music:null});
  let U=null;scene.traverse(o=>{if(o.userData?.terrain)U=o.userData.terrain;});
  const goal=(t,o)=>{const f=frame(t,o);w.update(f);const g=w.cameraGoal(f);return {target:g.target.toArray(),distance:g.distance,azimuth:g.azimuth,elevation:g.elevation,omega:g.omega,flight:w.stats().flight,phase:w.stats().flightPhase};};
  return {w,goal,camera,U,frame,r,m};
}
const state=(id,ts,st,extra={})=>({type:'agent.state',ts,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:id,voice:1,...extra},detail:{state:st,provider:'claude-code',...(st==='tool'?{activity:'editing'}:{})}});
const S1=LAST+24000;   // the first flight: the quiet has lasted FLIGHT.wait (the director saw nothing, so its activity is idle)
test('Idle: the camera flies back over the land\'s history to just short of where it began, and returns; then rests; later flights on a lattice',async()=>{
  const {FLIGHT}=await load('terrain'),{depthOf,layoutConfig}=await load('terrain-layout');const A=await scene(),cfg=layoutConfig(A.r);
  assert.equal(A.goal(S1-500).flight,0,'not before the quiet has lasted');
  const before=A.goal(S1-100),far=A.goal(S1+(FLIGHT.out+2)*1000),end=A.goal(S1+(FLIGHT.out+FLIGHT.hold+FLIGHT.back)*1000+100);
  assert.equal(far.flight,1,'out at the far point after `out`');
  // the far point: the land's first change (in the window from T0 + 15 s) lies 12 units beyond the target, then
  const zb=depthOf(S1+(FLIGHT.out+2)*1000-(T0+15000),cfg);assert(Math.abs(-far.target[2]-(zb-12))<.5,`target at depth ${-far.target[2]}, the beginning at ${zb}`);
  assert(-far.target[2]>-before.target[2]+40,'far behind where the camera looks at the present');
  assert(far.elevation>=.56&&far.distance<before.distance,'higher, looking down on the old land, a little closer');
  assert.equal(end.flight,0,'back after out, hold and back');
  // later: rest, then the next flight starts on the lattice of view time (a whole period after the first)
  const P=(FLIGHT.out+FLIGHT.hold+FLIGHT.back+FLIGHT.rest)*1000,s1v=(S1-T0)/1000,k=Math.ceil((s1v+P/1000)/(P/1000)),next=T0+k*P;
  assert.equal(A.goal(next-200).flight,0,'resting before the next');assert(A.goal(next+6000).flight>0,'the next flight on its lattice');
  // the flight is as deep as the history: the rise and return are continuous, nothing jumps
  let prev=null;for(let t=S1-1000;t<S1+(FLIGHT.out+FLIGHT.hold+FLIGHT.back)*1000+1000;t+=250){const g=A.goal(t);if(prev)assert(Math.abs(g.target[2]-prev)<1.6,`continuous at ${t-S1} ms`);prev=g.target[2];}
});
test('It yields at once: an effect, an agent\'s state or edit ends the flight, the goal is the present\'s and the camera returns quickly',async()=>{
  const {FLIGHT}=await load('terrain'),TE=S1+(FLIGHT.out+8)*1000;
  const fail={type:'validation.failed',ts:TE,tier:2,magnitude:.7,evidence:'observed',subject:{fileIds:['f24']},detail:{}};
  // the same land where an agent held the flight all along (so it never flew): the present's goal at the same moments
  const hold=state('h',LAST-1000,'processing');
  const C=await scene({intents:[fail]}),D=await scene({intents:[hold,fail]});
  assert.equal(C.goal(TE-100).flight,1,'out over the history just before');assert.equal(D.goal(TE-100).flight,0,'an agent at work holds it');
  for(const d of [0,100,1500]){const c=C.goal(TE+d),e=D.goal(TE+d);assert.equal(c.flight,0,`${d} ms after the failure: no flight`);
    assert.deepEqual(c.target,e.target,`${d} ms: the present's goal`);assert.equal(c.distance,e.distance);assert(c.omega>e.omega,`${d} ms: the camera returns faster (${c.omega} > ${e.omega})`);}
  assert.equal(C.goal(TE+8000).omega,D.goal(TE+8000).omega,'the quick return lasts a few seconds');
  // an agent's tool state on a file (its close-up) and a new state alone end it too
  for(const i of [state('x',TE,'tool',{fileId:'f20'}),state('x',TE,'waiting')]){const E=await scene({intents:[i]});assert.equal(E.goal(TE-100).flight,1);assert.equal(E.goal(TE).flight,0,i.detail.state);}
  // a human's edit (the model's edit cue, at its time on the score's step grid)
  const E=await scene();assert.equal(E.goal(TE-100).flight,1);E.m.cue({type:'editor.change.observed',detail:{fileId:'f20'}},TE);const at=E.m.modules.get('f20').lastHuman;
  assert(at>=TE&&at<TE+400);assert.equal(E.goal(at-1).flight,1);assert.equal(E.goal(at).flight,0,'an edit');
  // an agent at work holds it until its state is unknown (three minutes without an observation): then the quiet starts
  const H=await scene({intents:[hold]});assert.equal(H.goal(LAST-1000+180000+23000).flight,0);assert(H.goal(LAST-1000+180000+24000+15000).flight>0,'flies once the state is unknown and the quiet has lasted');
});
test('The goal is a pure function of the performance and the moment (whatever was drawn before, at any frame rate)',async()=>{
  const {FLIGHT}=await load('terrain'),T=S1+(FLIGHT.out/2)*1000,A=await scene(),B=await scene(),C=await scene();
  for(const t of [T+60000,S1-30000,T-5000,T])A.goal(t);for(let t=T-3000;t<T;t+=1000/60)C.goal(t);
  const a=A.goal(T),b=B.goal(T),c=C.goal(T);assert(a.flight>0&&a.flight<1);assert.deepEqual(a,b);assert.deepEqual(c,b);
  // the viewer's motion at 0: no flight
  assert.equal(B.goal(T,{motion:0}).flight,0);
});
test('Portrait keeps its steep view while it flies; with no history to fly over it never flies; the haze counts from the camera',async()=>{
  const {FLIGHT}=await load('terrain'),T=S1+(FLIGHT.out+4)*1000;
  const P=await scene({aspect:9/16});const g=P.goal(T);assert.equal(g.flight,1);assert(g.elevation>=.74,`portrait ${g.elevation}`);
  // a land whose structure all stood before time (nothing changed): no flight, however long the quiet
  const N=await scene({history:false});for(let t=T0+30000;t<T0+900000;t+=7000)assert.equal(N.goal(t).flight,0,`${t-T0} ms`);
  // the land's haze and mist count from the depth the camera has flown back to (0 at the present: as always)
  const A=await scene(),f=A.frame(T);A.w.update(f);A.camera.position.set(0,60,-150);A.w.afterCamera(f);assert.equal(A.U.uFlyZ.value,140);
  A.camera.position.set(0,120,200);A.w.afterCamera(f);assert.equal(A.U.uFlyZ.value,0);
  const {LAND_VS}=await load('terrain-glsl');assert.match(LAND_VS,/dz=max\(depth-uFlyZ,0\.\)/);
});

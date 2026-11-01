'use strict';
// Aurora draws its digital life (public/worlds/aurora.js, headless, behind the recipe's life values): a recipe without
// life draws exactly what it drew before Aurora had digital life (every shader's text, every uniform, texture, buffer
// and draw range, the grade and the camera, pinned on fe95cc0, 0.9.0); with life on, the world creates the ecosystem
// with the Aurora grammar and draws it, at any quality without changing it, nothing while it is restoring, and never a
// label for an inhabitant; a fox turns to watch an agent's wisp passing low. The grammar is in tests/life-aurora.test.js.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {load,loadWorld,T0,identity,network,recording,world,fingerprint,score}=require('./life-aurora-fixture');
// The scene of the pin: four subsystems, a failing run on two files and its pass, an agent at work, the storm and the
// corona as effects; landscape and portrait.
async function pinned(size){
  const {createAgents}=await loadWorld('agents');const model=await network();
  model.cue({type:'validation.test.failed',detail:{fileIds:['m1_0','m1_1']}},T0+12000);model.cue({type:'validation.test.passed',detail:{fileIds:['m1_0','m1_1']}},T0+30000);
  const agents=createAgents();agents.record({type:'agent.state',ts:T0+11000,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:'m2_1'},detail:{state:'tool',activity:'editing',provider:'cursor'}});
  const W=await world({model,size,agents});
  W.w.effect({effect:'storm',intent:'validation.failed',tier:2,scale:1,at:T0+12000,subject:{fileIds:['m1_0','m1_1']}},W.frame(T0+12000));
  W.w.effect({effect:'corona',intent:'validation.recovered',tier:2,scale:1,at:T0+30000,subject:{fileIds:['m1_0']}},W.frame(T0+30000));
  return W;
}
test('Life off: a stored Aurora recipe without life draws exactly what it drew before digital life (pinned on fe95cc0)',async()=>{
  for(const [size,state] of [[[1280,720],'dc675579069b4746'],[[720,1280],'4cc42e3112c83196']]){
    const W=await pinned(size);assert.deepEqual(fingerprint(W,[T0+11500,T0+14000,T0+33000,T0+60000]),{objects:8,shader:'ba2c7c3cc0048950',state},`${size.join('x')}`);
    assert.equal(W.w.lifeStats,undefined,'no life interface either');W.w.dispose();}
  // and the source keeps every life addition behind LIFE
  const src=fs.readFileSync(path.join(__dirname,'../public/worlds/aurora.js'),'utf8');
  assert.match(src,/const LIFE=ctx\.life\|\|null;/);assert.match(src,/if\(LIFE\)Object\.assign\(U,/);assert.match(src,/const lifePart=LIFE\?\(\(\)=>\{/);
  assert.match(src,/mat\(LAND_VS,LIFE\?withLife\(LAND_FS,'land'\):LAND_FS\)/);assert.match(src,/mat\(ICE_VS,LIFE\?withLife\(ICE_FS,'ice'\):ICE_FS\)/);
});
// Life on: the world's model and the driver's timeline hold the same recorded performance.
async function living({quality=0,size=[1280,720],agents=null}={}){
  const [{createModel},,,,{createLifeDriver},{createLifeTimeline}]=await load();
  const entries=recording(),model=createModel({speed:1,tempo:96});for(const e of entries)model.applyDelta(e.graph,e.start,e.end);
  const timeline=createLifeTimeline();timeline.prime(entries);const params={enabled:true,ecology:2,music:1};let driver=null,grammar=null;
  const life={params,create(g){grammar=g;driver=createLifeDriver({grammar:g,timeline,seed:42,config:()=>({speed:1,tempo:96,epoch:T0,params,film:true,live:false,music:{version:3,style:'ambient',seed:5,profile:null}}),score,background:false});return driver;}};
  const W=await world({model,rec:identity({life:params}),life,size,agents});
  const at=(t,q=quality,extra={})=>{const f=W.frame(t,q,extra);f.life=driver.update({tview:f.tview},{budgetMs:Infinity});W.w.update(f);const g=W.w.cameraGoal(f);W.place(g);W.w.afterCamera(f);return f;};
  return {W,at,get driver(){return driver;},get grammar(){return grammar;}};
}
const geomOf=(W,pred)=>{let g=null;W.scene.traverse(o=>{if(pred(o))g=o;});return g;};
test('Life on: the world creates the ecosystem and draws it; drawing, at any quality, never changes the state',async()=>{
  const A=await living(),B=await living({quality:3});
  assert.equal(A.grammar.id,'aurora');
  let ice=null,land=null;A.W.scene.traverse(o=>{if(o.material?.fragmentShader?.includes('uRefl'))ice=o;if(o.geometry?.attributes?.aN)land=o;});
  assert.match(ice.material.fragmentShader,/uLifeG/);assert.match(ice.material.fragmentShader,/uLifeF/);assert.match(land.material.fragmentShader,/uLifeF/);
  assert.equal(A.W.objects().length,10,'two more draw calls in the scene (the animals, the glimmers; the animals also in the reflection)');
  for(let t=T0;t<=T0+60000;t+=1000/10){A.at(t,0);B.at(t,3);}
  assert.equal(A.driver.digest(),B.driver.digest(),'quality never changes the state');
  const a=A.W.w.lifeStats(),b=B.W.w.lifeStats();
  assert(a.animals>=10&&a.animals===b.animals&&a.glimmers===b.glimmers&&a.glimmers>60,`the same inhabitants drawn (${a.animals} animals, ${a.glimmers} glimmers)`);
  assert(a.followers>b.followers&&b.followers===0,'quality decides only how many motes follow each glimmer');
  // presentation only reads: drawing the same moment again, at another quality, leaves the state as it was
  const f=A.at(T0+60000,0),before=A.driver.digest();A.W.w.update(f);A.W.w.update({...f,quality:3});A.W.w.update(f);assert.equal(A.driver.digest(),before);
  // where they are drawn: the animals on the land or the ice (the owl may fly), the glimmers at the ice's surface
  const beasts=geomOf(A.W,o=>o.geometry?.attributes?.bP),P=beasts.geometry.attributes.bP.array,F=beasts.geometry.attributes.bF.array,N=beasts.geometry.instanceCount;
  for(let k=0;k<N;k++){assert(Number.isFinite(P[k*4])&&P[k*4+1]>-.5&&P[k*4+3]>0&&P[k*4+3]<1.2,'an animal on the ground, its own size');if(F[k*4+3]!==2)assert(P[k*4+1]<6,'a fox or a hare stands on the land or the ice');}
  const glim=geomOf(A.W,o=>o.geometry?.attributes?.gC),G=glim.geometry.attributes.position.array;for(let k=0;k<glim.geometry.drawRange.count;k++)assert(Math.abs(G[k*3+1]-.03)<1e-6);
  // restoring: nothing is drawn, the ice and the land show no life
  const v=A.driver.update({tview:60},{budgetMs:Infinity});A.W.w.update({...f,life:{...v,restoring:true}});
  assert.equal(A.W.w.lifeStats().drawn,0);assert.equal(beasts.geometry.instanceCount,0);let U=null;A.W.scene.traverse(o=>{if(o.material?.uniforms?.uLifeX)U=o.material.uniforms;});assert.equal(U.uLifeX.value.x,0);
  // the crossfade at a generation's anchor scales what the life draws (the view's fadeIn)
  A.W.w.update({...f,life:{...v,fadeIn:.25}});assert(U.uLifeX.value.y<.25*1.6&&U.uLifeX.value.z<.25*1.7);
  A.W.w.dispose();B.W.w.dispose();
});
test('Inhabitants are never labelled; the words are the world\'s own; life off and on give the same labels',async()=>{
  const A=await living(),{createModel}=await loadWorld('model'),entries=recording(),model=createModel({speed:1,tempo:96});for(const e of entries)model.applyDelta(e.graph,e.start,e.end);
  const B=await world({model});const f=A.at(T0+90000),g=B.frame(T0+90000);B.w.update(g);
  const la=A.W.w.subsystemLabels(f),lb=B.w.subsystemLabels(g);assert.deepEqual(la.map(l=>[l.text,l.sub]),lb.map(l=>[l.text,l.sub]),'the same labels');assert.equal(la.length,2,'one per curtain (two by 90 s)');
  for(const l of la)assert(!/fox|hare|owl|glimmer|m\d_\d/i.test(`${l.text} ${l.sub}`));
  assert.equal(A.W.w.status(f),B.w.status(g));A.W.w.dispose();B.w.dispose();
});
test('A fox turns to watch an agent\'s wisp passing low (drawn: the ecosystem never reads agents)',async()=>{
  const {createAgents}=await loadWorld('agents'),ag=createAgents();
  ag.record({type:'agent.state',ts:T0+500,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'w',voice:2},detail:{state:'waiting',provider:'codex'}});
  const A=await living({agents:ag}),B=await living();
  // at every frame: a fox within reach of the wisp hovering low over the ice is drawn facing it rather than where it runs
  const beasts=geomOf(A.W,o=>o.geometry?.attributes?.bP),gap=x=>Math.abs(Math.atan2(Math.sin(x),Math.cos(x)));let turned=0,near=0,low=0;
  for(let t=T0;t<=T0+120000;t+=1000/5){A.at(t);B.at(t);const e=A.driver.ecosystem,wisp=A.W.w.agentPosition('w');if(!wisp)continue;if(wisp.y<10)low++;
    const P=beasts.geometry.attributes.bP.array,F=beasts.geometry.attributes.bF.array;
    for(let k=0;k<beasts.geometry.instanceCount;k++){if(F[k*4+3]!==0)continue;const dx=wisp.x-P[k*4],dz=wisp.z-P[k*4+2];if(Math.hypot(dx,dz)>18)continue;
      let i=-1;for(let j=0;j<e.capacity;j++)if(e.alive[j]&&e.sp[j]===0&&Math.abs(e.px[j]-P[k*4])<1.5&&Math.abs(e.pz[j]-P[k*4+2])<1.5)i=j;if(i<0||Math.hypot(e.vx[i],e.vz[i])<.05)continue;
      near++;const face=Math.atan2(dz,dx);if(gap(F[k*4]-face)<gap(Math.atan2(e.vz[i],e.vx[i])-face)-.05)turned++;}}
  console.log(`# frames with a fox near the low wisp ${near}, drawn turned toward it ${turned}`);
  assert(low>0,'the waiting wisp hovers low');assert(near>0&&turned>=near*.8,'a fox near the wisp turns to watch it');
  assert.equal(A.driver.digest(),B.driver.digest(),'the wisp never changes the ecosystem');
  A.W.w.dispose();B.W.w.dispose();
});

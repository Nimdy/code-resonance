'use strict';
// Fractal Continuum (public/worlds/fractal.js): the frame at a moment is a pure function of the inputs, whatever was
// played before a seek. A mini host drives the world as public/worlds/host.js does (update, camera goal, the camera rig,
// afterCamera; a seek rebuilds the world, snaps the rig and refolds the director), and two sessions that differ only in
// what they played before the same seek must reach the same state: the camera, the shader's uniforms, the sites, the
// threads and (life on) the inhabitants. qualification/visual/worlds.qual.js checks the same in a browser (determinism).
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,recording}=require('./life-driver-fixture.js');
const recipe=require('../engine/recipe');
const score=require('../public/score.js');
const load=name=>import(`../public/worlds/${name}.js`);
async function session({prior=null,at,size=[960,540],life=false}){
  const [{THREE,createCameraRig},{createModel},{createDirector},{createAgents},{createFamily},frc,{createLifeDriver},{createLifeTimeline}]=await Promise.all(
    ['core','model','director','agents','fractal','life/fractal','life/driver','life/timeline'].map(load));
  const entries=recording(40),intents=entries.flatMap(e=>e.intents).sort((a,b)=>a.ts-b.ts);
  const r0=recipe.generate({projectId:'fractal-seek',graph:{nodes:[],edges:[]},stats:{}},{family:'fractal-continuum',now:0}),r=life?{...r0,genome:{...r0.genome,life:{enabled:true}}}:r0;
  const model=createModel({speed:1,tempo:96});for(const e of entries)model.applyDelta(e.graph,e.start,e.end);model.setEpoch(T0);
  let director=createDirector({recipe:r}),fed=0,snap=true,driver=null;const agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,16/9,.1,4000),rig=createCameraRig(camera);
  const ctx={scene,camera,model,recipe:r,speed:()=>1,name:id=>id,get director(){return director;},agents,pipeline:{size}};
  if(life){const tl=createLifeTimeline();tl.prime(entries);ctx.life={params:r.genome.life,create:g=>driver=createLifeDriver({grammar:g,timeline:tl,seed:77,config:()=>({speed:1,tempo:96,epoch:T0,params:r.genome.life,live:false,film:true}),score,background:false})};}
  const w=createFamily(ctx);w.rebuild();void frc;
  const frame=t=>({t,tsec:(t-T0)/1000,tview:(t-T0)/1000,dt:1/15,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:director.activityAt(t),phase:director.phaseAt(t),
    unlocks:director.unlockedAt(t),agents:agents.list(t),overrides:{},quality:0,music:null});
  const states=[];
  const play=(t0,t1)=>{for(let t=t0;t<=t1;t+=1000/15){while(fed<intents.length&&intents[fed].ts<=t){const x=director.process(intents[fed++]);if(x?.cmd?.effect)w.effect(x.cmd,frame(t));}
    const i=frame(t);if(driver)i.life=driver.update(i,{budgetMs:Infinity});w.update(i);const g=w.cameraGoal(i);rig.update(1/15,g,{snap,omega:g.omega||.9});snap=false;w.afterCamera(i);states.push(state());}};
  const seek=t=>{director=createDirector({recipe:r});fed=0;while(fed<intents.length&&intents[fed].ts<t)director.process(intents[fed++]);w.rebuild();w.onPrime();snap=true;states.length=0;};
  let R=null;scene.traverse(o=>{if(o.userData?.fractal)R=o.userData.fractal;});
  const v=x=>x?.toArray?x.toArray():Array.isArray(x)?x.map(v):x?.isTexture?null:x;
  function state(){const geo={};scene.traverse(o=>{if(!o.geometry||o.userData?.fractal)return;for(const [k,a] of Object.entries(o.geometry.attributes)){const n=(o.geometry.instanceCount??o.geometry.drawRange.count)*a.itemSize;if(n>0&&Number.isFinite(n))geo[`${o.renderOrder}/${k}`]=Array.from(a.array.slice(0,n));}});
    return JSON.stringify({camera:camera.position.toArray(),fov:camera.fov,u:Object.fromEntries(Object.entries(R).map(([k,x])=>[k,v(x.value)])),geo});}
  if(prior!==null){seek(prior-1500);play(prior-1500,prior);}
  seek(at-3000);play(at-3000,at);w.dispose();return states;
}
const same=(a,b,what)=>{assert.equal(a.length,b.length);const k=a.findIndex((x,i)=>x!==b[i]);assert.equal(k,-1,`${what}: frame ${k} after the seek differs`);};
test('After a seek the frame at a moment does not depend on what was played before: a close-up\'s dolly (the camera faced the event before)',async()=>{
  // a failing run at 123 s gets a close-up; the seek lands 2 s into it. One session comes fresh, the other has just
  // played the same close-up (its camera faced the event's site), a third the recording's end.
  const at=T0+128000,a=await session({at}),b=await session({at,prior:T0+128000}),c=await session({at,prior:T0+395000});
  same(a,b,'after playing the same close-up');same(a,c,'after playing the end');
});
test('After a seek the level of detail of the first frame does not depend on where the camera was (the detail limited by the pixels)',async()=>{
  // a small target: the recursions the pixels can hold depend on the camera's distance
  const at=T0+100000,a=await session({at,size:[96,54]}),b=await session({at,size:[96,54],prior:T0+300000});
  same(a,b,'a small target');
});
test('With digital life on, the same: the inhabitants and the light they pool are a function of the moment',async()=>{
  const at=T0+128000,a=await session({at,life:true}),b=await session({at,life:true,prior:T0+128000});
  assert(a.at(-1).includes('"2/aL"'),'the life is drawn');same(a,b,'life on');
});

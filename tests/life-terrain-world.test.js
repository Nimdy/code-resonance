'use strict';
// Temporal Terrain draws its digital life (public/worlds/terrain.js, behind the recipe's life values): off, the world is
// exactly as it was (no driver, resource, uniform, draw call or shader text); on, it creates the ecosystem with the
// terrain grammar and draws it, and drawing (at any quality) never changes the state. The layout's one-pass ground
// lookups (what the inhabitants stand on) are the same as the land's own sampling.
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {T0,graph,CFG}=require('./life-terrain-fixture');
const load=name=>import(`../public/worlds/${name}.js`);
// A headless world on the fixture's land (as the host drives it), with life on or off; with life on, the host's
// ctx.life (life/driver.js on a timeline holding the land's recorded window).
async function headless({life=false,ecology=2}={}){
  const {THREE}=await load('core'),{createFamily}=await load('terrain'),{createDirector}=await load('director'),{createAgents}=await load('agents'),{createModel}=await load('model');
  const {createLifeDriver}=await load('life/driver'),{createLifeTimeline}=await load('life/timeline');const score=require('../public/score.js');
  const g=graph();let r=recipe.generate({projectId:'terrain-life-world',graph:g,stats:{}},{family:'temporal-terrain',now:0});
  r={...r,genome:{...r.genome,relief:{...r.genome.relief,spacing:5},...(life?{life:{enabled:true,ecology}}:{})}};
  const model=createModel({speed:1,tempo:92});model.reset(g,T0);
  const tl=createLifeTimeline();tl.prime([{seq:0,start:T0,end:T0+10000,graph:{keyframe:true,...g},frame:{start:T0,end:T0+10000,chapter:1,controls:{energy:.4,tension:.1}},intents:[]}]);
  let driver=null,grammar=null;
  const ctxLife=life?{params:r.genome.life,create(gr){grammar=gr;driver=createLifeDriver({grammar:gr,timeline:tl,seed:42,config:()=>({speed:1,tempo:92,epoch:T0,params:r.genome.life,film:true,live:false,music:{version:3,style:'ambient',seed:9,profile:null}}),score,background:false});return driver;}}:null;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);camera.position.set(0,120,200);camera.lookAt(0,0,-60);
  const director=createDirector({recipe:r}),agents=createAgents();
  const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>id,director,agents,pipeline:{size:[1280,720]},...(life?{life:ctxLife}:{})});w.rebuild();
  const frame=(t,q=0)=>({t,tsec:(t-T0)/1000,tview:(t-T0)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:92},energy:.4,activity:0,phase:'idle',
    unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:agents.list(t),overrides:{},quality:q,music:null});
  const at=(t,q=0)=>{const f=frame(t,q);if(driver)f.life=driver.update(f,{budgetMs:Infinity});w.update(f);w.cameraGoal(f);w.afterCamera(f);return f;};
  return {w,scene,at,get driver(){return driver;},get grammar(){return grammar;},THREE};
}
const landOf=scene=>{let m=null;scene.traverse(o=>{if(o.userData?.terrain)m=o;});return m;};
test('Life off: the world is exactly as it was (no driver, resource, uniform, draw call or shader text)',async()=>{
  const {LAND_VS,LAND_FS}=await load('terrain-glsl');const A=await headless();A.at(T0+20000);
  const land=landOf(A.scene);assert.equal(land.material.vertexShader,LAND_VS);assert.equal(land.material.fragmentShader,LAND_FS);
  assert(!Object.keys(land.material.uniforms).some(k=>k.startsWith('uLife')),'no life uniform');
  let n=0;A.scene.traverse(o=>{if(o!==A.scene)n++;});assert.equal(n,3,'the land, its lights and its ribbons only');
  assert.equal(A.w.lifeStats,undefined);assert.equal(A.driver,null);
  // and the source keeps every life addition behind LIFE
  const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/worlds/terrain.js'),'utf8');
  assert.match(src,/const LIFE=ctx\.life\|\|null;/);assert.match(src,/if\(LIFE\)Object\.assign\(U,/);assert.match(src,/vertexShader:LIFE\?withLife\(LAND_VS,'vs'\):LAND_VS,fragmentShader:LIFE\?withLife\(LAND_FS,'fs'\):LAND_FS/);
  assert.match(src,/const lifePart=LIFE\?\(\(\)=>\{\s*LIFE\.create\(createTerrainGrammar\(\{cfg\}\)\);/);
  A.w.dispose();
});
test('Life on: the world creates the ecosystem and draws it; drawing, at any quality, never changes the state',async()=>{
  const A=await headless({life:true}),B=await headless({life:true});
  assert.equal(A.grammar.id,'temporal-terrain');const land=landOf(A.scene);assert.match(land.material.fragmentShader,/uLifeF/);assert.match(land.material.vertexShader,/vLx=xs;/);
  let n=0;A.scene.traverse(o=>{if(o!==A.scene)n++;});assert.equal(n,5,'two more draw calls: the inhabitants and their streaks');
  // A draws every frame at quality 0, B at quality 3: the ecosystem is the same; B draws fewer followers and streaks
  for(let t=T0;t<=T0+30000;t+=1000/15){A.at(t,0);B.at(t,3);}
  assert.equal(A.driver.digest(),B.driver.digest(),'quality never changes the state');
  const a=A.w.lifeStats(),b=B.w.lifeStats();assert(a.drawn>200&&a.drawn===b.drawn,`the same inhabitants drawn (${a.drawn}, ${b.drawn})`);
  assert(a.followers>b.followers&&b.followers===0&&a.trailSegments>b.trailSegments,'quality decides the followers and streaks');
  assert(a.awake>0&&a.grazing>0,'grazers awake and grazing');
  // presentation only reads: drawing the same moment again leaves the state as it was
  const f=A.at(T0+30000,0),before=A.driver.digest();A.w.update(f);A.w.update({...f,quality:3});A.w.update(f);assert.equal(A.driver.digest(),before);
  // restoring: nothing is drawn, the land shows no life light
  const v=A.driver.update({tview:30},{budgetMs:Infinity});A.w.update({...f,life:{...v,restoring:true}});
  assert.equal(A.w.lifeStats().drawn,0);assert.equal(land.material.uniforms.uLifeX.value.y,0);
  // the points stand in the frame of the land: in front of the camera's far plane, above the ground's lowest level
  let pts=null;A.scene.traverse(o=>{if(o.isPoints)pts=o;});const P=pts.geometry.attributes.position.array,N=pts.geometry.drawRange.count;
  for(let k=0;k<N;k++){assert(Number.isFinite(P[k*3])&&P[k*3+1]>-.5&&P[k*3+2]<=8,'drawn on or over the land');}
  A.w.dispose();B.w.dispose();
});
test('The ground lookups are the land\'s own: land.height, meanderAt and reliefHeight equal sample and reliefAt',async()=>{
  const L=await load('terrain-layout'),{createModel}=await load('model');const m=createModel({speed:1,tempo:92});m.reset(graph(),T0);
  const cfg=L.layoutConfig(CFG),land=L.createLand(cfg,{colorOf:()=>[1,1,1],plain:[.1,.1,.1]});land.update(m,T0+30000,T0);const out=[0,0];
  for(const [x,age] of [[0,0],[12.5,800],[-40,9000],[61,42000],[3.3,400000]]){const tp=T0+30000-age;land.height(x,tp,T0+30000,T0,out);
    assert(Math.abs(out[0]-land.sample(x,tp,T0+30000,T0,0))<1e-9&&Math.abs(out[1]-land.sample(x,tp,T0+30000,T0,1))<1e-9,`height at ${x}, ${age}`);}
  for(const [x,z] of [[1,2],[-77.7,40],[130,125]]){assert.equal(L.meanderAt(x,z,3),L.reliefAt(x,z,0,0,3)[3]);assert.equal(L.reliefHeight(x,z,.6),L.reliefAt(x,z,.6,0,0)[0]);}
});

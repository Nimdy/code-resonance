'use strict';
// Synaptic Storm's presentation of its digital life (public/worlds/synaptic.js, headless): a recipe without life draws
// exactly what it drew before life existed (every shader's text, every uniform, buffer and state texture, pinned on the
// code before life, 1226b8a); with life on, two draw calls, the quality decides only how much is drawn (never the
// ecosystem), dormant inhabitants are never drawn, a restoring view draws none, and the neurons answer the life gathered
// at them. The grammar is in tests/life-synaptic.test.js.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const {T0,T1,graph,score}=require('./life-synaptic-fixture.js');
const load=n=>import(`../public/worlds/${n}.js`);
const ID='synaptic-storm';
function project(){const nodes=[{id:'g1',type:'group'},{id:'g2',type:'group'},{id:'g3',type:'group'}];
  for(let i=0;i<10;i++)nodes.push({id:`m${i}`,type:'module',group:`g${1+i%3}`,dir:`d${i%3}`,lang:'ts',counts:{function:3}});
  return {projectId:sha('world'),graph:{nodes,edges:[]},stats:{raw:100},agents:[]};}
async function world({model,life=null,size=[1920,1080]}){
  const {THREE}=await load('core');const {createFamily}=await load('synaptic');const {createDirector}=await load('director');const {createAgents}=await load('agents');
  const r=recipe.generate(project(),{family:ID,now:0}),director=createDirector({recipe:r}),agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);
  agents.record({type:'agent.state',ts:T0+500,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:'b1'},detail:{state:'tool',activity:'editing',provider:'cursor'}});
  const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director,agents,pipeline:{size},life});w.rebuild();
  const frame=(t,quality=0,extra={})=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',unlocks:[],
    agents:agents.list(t),overrides:{},quality,music:null,...extra});
  const objects=()=>{const out=[];scene.traverse(o=>{if(o!==scene)out.push(o);});return out;};
  return {w,frame,scene,camera,objects,THREE};
}
// The model of tests/synaptic.test.js (three subsystems, dependencies inside and across them, a failing run).
async function smallModel(){const {createModel}=await load('model');const m=createModel();
  const g=(id,q,r)=>({id,type:'group',q,r,order:0,counts:{}}),mod=(id,G)=>({id,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A',0,0),g('B',7,0),g('C',0,7)];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<(p==='a'?7:3);k++)nodes.push(mod(`${p}${k}`,G));
  for(let k=0;k<4;k++)nodes.push({id:`s${k}`,type:'function',parent:'a0',slot:k});
  m.reset({nodes,edges:[['a2','b0'],['b1','c0'],['a0','a1'],['c1','b0']].map(([a,b])=>({a,b,kind:'depends',cross:a[0]!==b[0]}))},T0);
  m.cue({type:'validation.test.failed',detail:{fileIds:['a0','a1']}},T0+2000);return m;}
// Everything the GPU would be given: per object its kind, order, shader text, uniform names and blending; per moment
// every uniform value, texture, buffer, draw range, the grade and the camera goal.
function fingerprint(W,moments){
  const h=crypto.createHash('sha256'),objs=W.objects();
  for(const o of objs){h.update(`${o.type}|${o.renderOrder}|${o.frustumCulled}`);const M=o.material;if(M){h.update(M.vertexShader||'');h.update(M.fragmentShader||'');h.update(Object.keys(M.uniforms||{}).sort().join(','));h.update(`${M.blending}|${M.transparent}|${M.depthTest}|${M.depthWrite}`);}}
  const shader=h.digest('hex').slice(0,16),h2=crypto.createHash('sha256');
  for(const t of moments){const f=W.frame(t);W.w.update(f);W.camera.position.set(30,10,40);W.camera.lookAt(0,0,0);W.w.afterCamera(f);h2.update(JSON.stringify(W.w.grade(f)));h2.update(JSON.stringify(W.w.cameraGoal(f)));
    for(const o of objs){const M=o.material;if(!M)continue;for(const u of Object.values(M.uniforms||{})){const v=u.value;if(v&&v.isTexture&&v.image?.data)h2.update(Buffer.from(v.image.data.buffer));else if(v&&typeof v==='object'&&!v.isTexture)h2.update(JSON.stringify(v));else if(typeof v==='number')h2.update(String(v));}
      const G=o.geometry;h2.update(String(G.instanceCount??'')+'|'+JSON.stringify(G.drawRange));
      for(const [k,a] of Object.entries(G.attributes)){const b=Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);h2.update(`${k}:${b.toString('base64').length}:${crypto.createHash('sha1').update(b).digest('hex')}`);}}}
  return {objects:objs.length,shader,state:h2.digest('hex').slice(0,16)};
}
test('Life off: the world draws exactly what it drew before digital life existed (pinned on 1226b8a)',async()=>{
  const W=await world({model:await smallModel()});
  assert.deepEqual(fingerprint(W,[T0+1000,T0+4000,T0+9000]),{objects:7,shader:'da367f1aa40c4141',state:'055f69ba0740840f'});
  assert.equal(W.w.lifeStats,undefined,'no life interface either');W.w.dispose();
});
// Life on: the world's model and the driver's timeline hold the same structure (one recorded window).
async function living({quality=0,size}={}){
  const [{createModel},{createLifeDriver},{createLifeTimeline}]=await Promise.all([load('model'),load('life/driver'),load('life/timeline')]);
  const g=graph(5,6),model=createModel();model.applyDelta({keyframe:true,nodes:g.nodes,edges:g.edges},T0,T1);
  const timeline=createLifeTimeline();timeline.structure({keyframe:true,nodes:g.nodes,edges:g.edges},T0,T1,0);
  for(let k=0;k<8;k++)timeline.frame({end:T0+(k+1)*10000,chapter:1,controls:{energy:.4,tension:.1}},T0+k*10000);
  const cfg={speed:1,tempo:96,epoch:T0,params:{enabled:true},live:false,film:true};let driver=null;
  const life={params:cfg.params,create(grammar){driver=createLifeDriver({grammar,timeline,seed:77,config:()=>cfg,score,background:false});return driver;}};
  const W=await world({model,life,size});
  const at=(t,q=quality,extra={})=>{const f=W.frame(t,q,extra);f.life=driver.update({tview:f.tview},{budgetMs:Infinity});W.w.update(f);return f;};
  return {...W,at,driver:()=>driver,model};
}
const geomOf=(W,type)=>W.objects().filter(o=>o.type===type&&/cP|pC/.test(Object.keys(o.geometry.attributes).join(',')))[0]?.geometry;
test('Life on: two draw calls; the quality decides only how much is drawn, never the ecosystem; dormant inhabitants are never drawn',async()=>{
  const A=await living({quality:0}),B=await living({quality:3});
  assert.equal(A.objects().length,9,'the cells and the points of the inhabitants');
  for(const t of [T0+5000,T0+30000,T0+60000+333]){A.at(t,0);B.at(t,3);}
  assert.equal(A.driver().digest(),B.driver().digest(),'the same ecosystem at quality 0 and 3');
  const e=A.driver().ecosystem,{dormant,GLIA,MICROGLIA,VESICLE}=await load('life/synaptic');let cellsWant=0,vesicles=0,asleep=0;
  for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;if(dormant(e,i)){asleep++;continue;}if(e.fade[i]<=.003)continue;if(e.sp[i]===VESICLE)vesicles++;else if(e.sp[i]===GLIA||e.sp[i]===MICROGLIA)cellsWant++;}
  const a=A.w.lifeStats(),b=B.w.lifeStats();
  assert(asleep>0,'some are dormant in this network');assert.equal(a.cells,cellsWant,'one cell per awake glial cell or microglia');
  assert.equal(a.drawn,cellsWant+vesicles,'every awake inhabitant drawn once, no dormant one');
  assert(a.followers>0&&b.followers===0,`followers by quality (${a.followers}, ${b.followers})`);assert.equal(b.drawn,a.drawn,'at every quality, every inhabitant');
  assert.equal(geomOf(A,'Mesh').instanceCount,a.cells);
  // a view that is restoring draws no inhabitant
  const f=A.frame(T0+61000);f.life={...A.driver().view,restoring:true};A.w.update(f);assert.equal(A.w.lifeStats().drawn,0);assert.equal(geomOf(A,'Mesh').instanceCount,0);
  A.w.dispose();B.w.dispose();
});
test('Life on: the neurons answer the life gathered at them (membrane, inner light, synaptic clefts); shaders gain only that',async()=>{
  const A=await living();A.at(T0+40000);
  const NS=A.objects().find(o=>o.material?.uniforms?.uN).material.uniforms.uN.value.image.data;
  const e=A.driver().ecosystem;let lit=0;for(let k=0;k<e.sites.count;k++)if(e.sites.visits[k]>1)lit++;
  // row 4 of the neuron state (z): the life gathered there, 0..1
  let z=0;for(let i=0;i<NS.length/4;i++){const row=Math.floor(i/128)%5;if(row===4&&NS[i*4+2]>0)z++;}
  assert(lit>0&&z>0,`neurons with life gathered: ${lit} sites, ${z} neurons lit`);
  const text=A.objects().map(o=>(o.material?.vertexShader||'')+(o.material?.fragmentShader||'')).join('\n');
  assert.match(text,/\*\(1\.\+\.6\*NE\.z\)/);assert.match(text,/\*\(1\.\+3\.\*vLg\)/);
  A.w.dispose();
});

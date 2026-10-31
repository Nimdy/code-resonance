'use strict';
// Synaptic Storm: graduated with generator 5 (scored from its own stream, so no existing identity changes); its layout, dendrites and firing
// schedule are pure functions of the model and the time; the world runs headless and keeps the failure language honest.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const recipe=require('../engine/recipe');
const catalog=require('../engine/catalog');
const {tempDir,startService}=require('./helpers');
const {sha}=require('../receiver/protocol');
const load=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000;
const ID='synaptic-storm';
function project(id,{modules=10,ui=0,classes=0,fns=3,tests=0,dirs=3,hub=0,cross=0,agents=0,agentEvents=0}={}){
  const nodes=[{id:'g1',type:'group'},{id:'g2',type:'group'},{id:'g3',type:'group'}],edges=[];
  for(let i=0;i<modules;i++){const counts={function:fns};if(i<ui)counts['ui.component']=2;if(i<classes){counts.class=2;counts.interface=2;}
    nodes.push({id:`m${i}`,type:'module',group:`g${1+i%3}`,dir:`d${i%dirs}`,lang:i<ui?'tsx':'ts',test:i>=modules-tests,counts});}
  for(let i=1;i<=hub;i++)edges.push({a:`m${i}`,b:'m0',kind:'depends',cross:false});
  for(let i=0;i<cross;i++)edges.push({a:`m${i%modules}`,b:`m${(i+1)%modules}`,kind:'depends',cross:true});
  return {projectId:sha(id),graph:{nodes,edges},stats:{raw:100,agentEvents,testsPassed:0,testsFailed:0},agents:Array.from({length:agents},(_,i)=>({id:`a${i}`}))};
}
test('Synaptic Storm is scored from generator 5 on (never by generator 4); choosing it is a lasting, living identity',()=>{
  assert.deepEqual(recipe.FLAGSHIPS,['stellar-forge','fractal-biosphere','machine-cathedral']);assert(recipe.GRADUATED.includes(ID)&&recipe.FAMILIES.includes(ID));
  const shapes=[{modules:120,ui:70,dirs:40},{modules:12,hub:10,agents:5,agentEvents:80},{modules:60,classes:40,tests:20,cross:50},{modules:3},{modules:400,cross:300,agents:8,agentEvents:90}];
  for(let k=0;k<300;k++){const p=project(`scored-${k}`,shapes[k%shapes.length]),r=recipe.generate(p,{variant:k%4,now:0,version:4});
    assert(recipe.FLAGSHIPS.includes(r.family),`${k}: ${r.family}`);assert.deepEqual(Object.keys(r.familyScores),recipe.FLAGSHIPS);
    assert.deepEqual(Object.keys(recipe.generate(p,{variant:k%4,now:0}).familyScores),recipe.FAMILIES);}
  const p=project('chosen',{modules:30,ui:10});
  const chosen=recipe.update(recipe.generate(p,{now:0}),{type:'family',family:ID},p,0);
  assert.equal(chosen.family,ID);assert.equal(chosen.familyName,'Synaptic Storm');assert.equal(chosen.familyKind,'builtin');
  assert.equal(chosen.source,'user');assert.equal(chosen.locked,true);assert.equal(chosen.founded,true);
  assert.equal(chosen.genome.life.enabled,true,'a new identity lives (generator 5)');assert.equal(chosen.genome.technique.finish,'cinematic');assert.equal(chosen.genome.music.score,3);
  // A stored choice is served as stored; automatic and a plain regenerate go back to the scored families.
  assert.equal(recipe.resolve(chosen,p,5).recipe,chosen);
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'automatic'},p,0).family));
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'regenerate'},p,0).family));
  const again=recipe.update(chosen,{type:'regenerate',keepFamily:true},p,0);assert.equal(again.family,ID);assert.notDeepEqual(again.genome,chosen.genome);
  // The render lab's --family path, and the same choice twice, give the same identity.
  assert.deepEqual({...recipe.generate(p,{family:ID,now:1})},{...recipe.generate(p,{family:ID,now:1})});
});
test('Graduating it changes no existing identity (the generator fingerprints of tests/recipe.test.js still hold)',()=>{
  const p={projectId:'pal-test-1234567',graph:{nodes:[],edges:[]},stats:{}},h=x=>require('node:crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16);
  // Drawing it first shares no state with the flagships.
  recipe.generate(p,{family:ID,now:0});
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(p,{family:f,now:0}).genome)),'d27fb424f09b9362');
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(p,{family:f,now:0,version:3}).genome)),'ccb6221a53e0c619');
  const q=project('scores',{modules:40,classes:30,tests:10});assert.deepEqual(recipe.generate(q,{now:0}).familyScores,recipe.familyScores(recipe.traitsOf(q),recipe.generate(q,{now:0}).projectSeed,0));
});
test('Its catalogue covers every value its generator draws; tuning offers it (no digital life parameters yet)',()=>{
  const cat=catalog.FAMILIES[ID];assert(cat&&!cat.preview,'a family of the catalogue: a base for declarative packs');assert.equal(catalog.PREVIEWS[ID],undefined);
  for(let seed=1;seed<=200;seed++){
    const r=recipe.generate(project(`cat-${seed}`,{modules:seed*3,classes:seed%7,tests:seed%5,cross:seed%11}),{family:ID,seed:seed*7919,variant:seed%3,now:0});
    for(const [p,spec] of Object.entries(cat.parameters)){if(p.startsWith('technique.')&&p!=='technique.finish')continue;const v=catalog.get(r.genome,p);
      assert(v!==undefined,`${p} missing`);assert(catalog.accepts(spec,v),`${p}=${JSON.stringify(v)}`);}
    assert.deepEqual(Object.values(r.genome.effects),cat.effects);assert.deepEqual(r.genome.ambient.unlocks,cat.unlocks);}
  const r=recipe.generate(project('tune'),{family:ID,now:0}),spec=recipe.tunable(r);
  assert.deepEqual(Object.keys(spec).sort(),Object.keys(cat.parameters).sort());assert(!Object.keys(spec).some(k=>k.startsWith('life.')));
  const tuned=recipe.update(r,{type:'tune',values:{'geometry.filesPerNeuron':7,'motion.sync':.9}},project('tune'),0);
  assert.deepEqual([tuned.genome.geometry.filesPerNeuron,tuned.genome.motion.sync],[7,.9]);
  assert.throws(()=>recipe.update(r,{type:'tune',values:{'geometry.filesPerNeuron':12}},project('tune'),0),/filesPerNeuron/);
});
// A model with three subsystems, files in creation order, and dependencies inside and across them.
async function network({extra=false,links=[['a2','b0'],['b1','c0'],['a0','a1'],['c1','b0']]}={}){
  const {createModel}=await load('model');const m=createModel();
  const g=(id,q,r)=>({id,type:'group',q,r,order:0,counts:{}});
  const mod=(id,group)=>({id,type:'module',group,dir:group,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A',0,0),g('B',7,0),g('C',0,7)];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<(p==='a'?7:3);k++)nodes.push(mod(`${p}${k}`,G));
  for(let k=0;k<4;k++)nodes.push({id:`s${k}`,type:'function',parent:'a0',slot:k});
  m.reset({nodes,edges:links.map(([a,b])=>({a,b,kind:'depends',cross:a[0]!==b[0]}))},T0);
  if(extra)m.applyDelta({add:[mod('a7','A')],remove:[],addEdges:[],removeEdges:[]},T0+60000,T0+65000);
  return m;
}
test('The network is a pure function of the model and the time: clusters from the dependencies, neurons that never reshuffle',async()=>{
  const {layoutConfig,createLayout}=await load('synaptic-layout');
  const cfg=layoutConfig(recipe.generate(project('layout'),{family:ID,now:0})),L=()=>createLayout({...cfg,K:3});
  const strip=n=>({clusters:n.clusters.map(c=>({id:c.id,pos:c.pos,R:c.R})),neurons:n.neurons.map(x=>({id:x.id,pos:x.pos,files:x.files,slots:x.slots})),center:n.center,radius:n.radius});
  const a=strip(L().networkAt(await network(),T0+1000)),b=strip(L().networkAt(await network(),T0+1000));
  assert.deepEqual(a,b,'same model, same moment: the same network');
  assert.deepEqual(a.neurons.map(n=>n.id),['A#0','A#1','A#2','B#0','C#0']);
  assert.deepEqual(a.neurons[0].files,['a0','a1','a2']);assert.deepEqual(a.neurons[2].files,['a6']);
  for(const n of a.neurons)for(const p of n.pos)assert(Number.isFinite(p));
  // Other dependencies pull the clusters into another arrangement.
  const c=strip(L().networkAt(await network({links:[['a0','c0'],['a1','c1'],['a2','c2'],['a3','c0']]}),T0+1000));
  assert.notDeepEqual(c.clusters.map(x=>x.pos),a.clusters.map(x=>x.pos));
  // A new file joins the last neuron; every earlier file keeps its neuron and its branch; the network eases to its new
  // layout and settles exactly where a fresh layout of the grown model is.
  const grown=await network({extra:true}),later=L(),before=later.networkAt(grown,T0+59000),after=later.networkAt(grown,T0+80000);
  for(const n of before.neurons){const m=after.neurons.find(x=>x.id===n.id);assert.deepEqual(m.files.slice(0,n.files.length),n.files);assert.deepEqual(m.slots.slice(0,n.slots.length),n.slots);}
  assert.deepEqual(after.neurons.find(n=>n.id==='A#2').files,['a6','a7']);
  assert.deepEqual(strip(after),strip(L().networkAt(await network({extra:true}),T0+80000)));
});
test('Dendrite trees and the spontaneous firing schedule are seeded, never random',async()=>{
  const {layoutConfig,dendriteTree,slotDirection,spontaneous}=await load('synaptic-layout');
  const cfg=layoutConfig(recipe.generate(project('trees'),{family:ID,now:0}));
  const t1=dendriteTree('file-1',slotDirection('A#0',0,cfg.K),cfg),t2=dendriteTree('file-1',slotDirection('A#0',0,cfg.K),cfg),t3=dendriteTree('file-2',slotDirection('A#0',0,cfg.K),cfg);
  assert.deepEqual(t1,t2);assert.notDeepEqual(t1.segs,t3.segs);
  assert(t1.segs.length>=20&&t1.sites.length>=8&&t1.reach>2);
  for(const s of t1.segs)assert(s.d1>s.d0&&s.d1<=t1.reach+1e-9&&s.rb<=s.ra);
  for(let k=1;k<t1.sites.length;k++)assert(t1.sites[k].d>=t1.sites[k-1].d,'boutons nearest first');
  const [a,b]=spontaneous(12345,2_700_000_000,.1),[c,d]=spontaneous(12345,2_700_000_000,.1);
  assert.deepEqual([a,b],[c,d]);assert(a!==null&&b!==null&&b<a&&a<=2_700_000_000);
  assert.deepEqual(spontaneous(1,1000,0),[null,null]);
});
test('The world runs headless: its state at a moment is the same whatever was drawn before, and failure never looks like success',async()=>{
  const {THREE}=await load('core');const {createFamily}=await load('synaptic');const {createDirector}=await load('director');const {createAgents}=await load('agents');
  const r=recipe.generate(project('world'),{family:ID,now:0});
  const make=async()=>{const model=await network();model.cue({type:'validation.test.failed',detail:{fileIds:['a0','a1']}},T0+2000);
    const director=createDirector({recipe:r}),agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);
    agents.record({type:'agent.state',ts:T0+500,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:'b1'},detail:{state:'tool',activity:'editing',provider:'cursor'}});
    const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director,agents,pipeline:{size:[640,360]}});w.rebuild();
    const frame=t=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',unlocks:[],
      agents:agents.list(t),overrides:{},quality:0,music:null});
    const state=()=>{let out=null;scene.traverse(o=>{if(!out&&o.material?.uniforms?.uN)out=[o.material.uniforms.uN.value.image.data.slice(0),o.material.uniforms.uF.value.image.data.slice(0)];});return out;};
    return {w,frame,state,scene};};
  const A=await make(),B=await make();
  for(const t of [T0+9000,T0+1200,T0+4000])A.w.update(A.frame(t));B.w.update(B.frame(T0+4000));
  assert.deepEqual(A.state(),B.state(),'the state at a moment does not depend on the path to it');
  const s=A.w.stats();assert.equal(s.clusters,3);assert.equal(s.neurons,Math.ceil(7/r.genome.geometry.filesPerNeuron)+2);assert.equal(s.files,13);assert(s.axons>=3&&s.segments>200);
  assert.equal(A.w.status(A.frame(T0+4000)),'2 branches misfiring');
  const fail=A.w.describe({intent:'validation.failed',subject:{fileIds:['a0','a1']},detail:{}},A.frame(T0+4000)),pass=A.w.describe({intent:'validation.passed',subject:{fileIds:['a0']},detail:{}},A.frame(T0+4000));
  assert.match(fail.text,/misfire/);assert.notEqual(fail.color,pass.color);assert.doesNotMatch(fail.text,/storm|wave|pass/i);
  // Words are generic or public names: no file id ever appears.
  for(const intent of ['subsystem.created','structure.created','subsystem.connected','validation.recovered','milestone.achieved','repository.checkpoint','world.expanded','agent.collision']){
    const d=A.w.describe({intent,subject:{groupId:'A',fileId:'a2',targetId:'b0',fileIds:['a2']},detail:{providers:['claude-code','cursor'],kinds:['recovery'],chapter:2}},A.frame(T0+4000));
    assert(d&&!/\b[abc]\d\b/.test(`${d.text} ${d.sub||''} ${d.banner||''}`),intent);}
  // Each CAST provider its own colour; the agent at work is placed by its branch.
  const colors=['claude-code','cursor','codex','grok','qwen','kimi'].map(p=>A.w.agentColor({provider:p}));assert.equal(new Set(colors).size,6);
  assert(A.w.agentPosition('x'),'the editing agent has a position for its chip');
  A.w.dispose();B.w.dispose();
});
test('A project with no dependencies yet (or no files at all) is drawn: no axon is not an error',async()=>{
  const {THREE}=await load('core');const {createFamily}=await load('synaptic');const {createDirector}=await load('director');const {createAgents}=await load('agents');
  const {createModel}=await load('model'),r=recipe.generate(project('unlinked'),{family:ID,now:0});
  for(const model of [await network({links:[]}),(()=>{const m=createModel();m.reset({nodes:[],edges:[]},T0);return m;})()]){
    const agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);
    const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:createDirector({recipe:r}),agents,pipeline:{size:[640,360]}});w.rebuild();
    const frame=t=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',unlocks:[],
      agents:agents.list(t),overrides:{},quality:0,music:null});
    for(const t of [T0+1000,T0+4000])w.update(frame(t));
    assert(w.stats().neurons>=0);w.dispose();
  }
});
test('The player and the receiver know it: the host loads it, /api/catalog lists it with the families',async t=>{
  assert.match(fs.readFileSync(path.join(__dirname,'../public/worlds/host.js'),'utf8'),/'synaptic-storm':'\.\/synaptic\.js'/);
  const svc=await startService(t,{port:0,dataDir:tempDir(t,'cr-synaptic-'),quiet:true});
  const c=await (await fetch(`http://127.0.0.1:${svc.port}/api/catalog`)).json();
  assert.deepEqual(Object.keys(c.families),recipe.FAMILIES);assert.deepEqual(c.previews,{},'no preview is left');
  assert.equal(c.families[ID].builtin,true);assert.equal(c.families[ID].name,'Synaptic Storm');assert(c.families[ID].parameters['motion.firingRate']);
});

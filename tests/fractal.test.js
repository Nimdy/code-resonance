'use strict';
// Fractal Continuum (preview): chosen only explicitly, so no existing identity changes; each project draws its own
// universe (formula and parameters, not only colours); the formulas, the unfolding and the layout on the surface are pure
// functions of the recipe, the model and the time; the world runs headless and keeps the failure language honest.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const recipe=require('../engine/recipe');
const catalog=require('../engine/catalog');
const {tempDir,startService}=require('./helpers');
const {sha}=require('../receiver/protocol');
const load=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000;
const ID='fractal-continuum';
function project(id,{modules=10,ui=0,classes=0,fns=3,tests=0,dirs=3,hub=0,cross=0,agents=0,agentEvents=0,groups=3}={}){
  const nodes=Array.from({length:groups},(_,k)=>({id:`g${k+1}`,type:'group'})),edges=[];
  for(let i=0;i<modules;i++){const counts={function:fns};if(i<ui)counts['ui.component']=2;if(i<classes){counts.class=2;counts.interface=2;}
    nodes.push({id:`m${i}`,type:'module',group:`g${1+i%groups}`,dir:`d${i%dirs}`,lang:i<ui?'tsx':'ts',test:i>=modules-tests,counts});}
  for(let i=1;i<=hub;i++)edges.push({a:`m${i}`,b:'m0',kind:'depends',cross:false});
  for(let i=0;i<cross;i++)edges.push({a:`m${i%modules}`,b:`m${(i+1)%modules}`,kind:'depends',cross:true});
  return {projectId:sha(id),graph:{nodes,edges},stats:{raw:100,agentEvents,testsPassed:0,testsFailed:0},agents:Array.from({length:agents},(_,i)=>({id:`a${i}`}))};
}
test('Fractal Continuum is chosen only explicitly: never by the family scores, automatic or a plain regenerate',()=>{
  assert.deepEqual(recipe.FAMILIES,['stellar-forge','fractal-biosphere','machine-cathedral']);assert(recipe.PREVIEWS.includes(ID));
  const shapes=[{modules:120,ui:70,dirs:40},{modules:12,hub:10,agents:5,agentEvents:80},{modules:60,classes:40,tests:20,cross:50},{modules:3},{modules:400,cross:300,agents:8,agentEvents:90}];
  for(let k=0;k<300;k++){const p=project(`scored-${k}`,shapes[k%shapes.length]),r=recipe.generate(p,{variant:k%4,now:0});
    assert(recipe.FAMILIES.includes(r.family),`${k}: ${r.family}`);assert.deepEqual(Object.keys(r.familyScores),recipe.FAMILIES);}
  const p=project('chosen',{modules:30,ui:10});
  const chosen=recipe.update(recipe.generate(p,{now:0}),{type:'family',family:ID},p,0);
  assert.equal(chosen.family,ID);assert.equal(chosen.familyName,'Fractal Continuum (preview)');assert.equal(chosen.familyKind,'builtin');
  assert.equal(chosen.source,'user');assert.equal(chosen.locked,true);assert.equal(chosen.founded,true);
  assert.equal(chosen.genome.life,undefined,'no digital life for the preview yet');assert.equal(chosen.genome.technique.finish,'cinematic');assert.equal(chosen.genome.music.score,3);
  assert.equal(recipe.resolve(chosen,p,5).recipe,chosen);
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'automatic'},p,0).family));
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'regenerate'},p,0).family));
  const again=recipe.update(chosen,{type:'regenerate',keepFamily:true},p,0);assert.equal(again.family,ID);assert.notDeepEqual(again.genome,chosen.genome);
  assert.deepEqual({...recipe.generate(p,{family:ID,now:1})},{...recipe.generate(p,{family:ID,now:1})});
});
test('Adding the preview changes no existing identity (the generator fingerprints of tests/recipe.test.js still hold)',()=>{
  const p={projectId:'pal-test-1234567',graph:{nodes:[],edges:[]},stats:{}},h=x=>require('node:crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16);
  recipe.generate(p,{family:ID,now:0});recipe.generate(p,{family:'synaptic-storm',now:0});
  assert.equal(h(recipe.FAMILIES.map(f=>recipe.generate(p,{family:f,now:0}).genome)),'d27fb424f09b9362');
  assert.equal(h(recipe.FAMILIES.map(f=>recipe.generate(p,{family:f,now:0,version:3}).genome)),'ccb6221a53e0c619');
  const q=project('scores',{modules:40,classes:30,tests:10});assert.deepEqual(recipe.generate(q,{now:0}).familyScores,recipe.familyScores(recipe.traitsOf(q),recipe.generate(q,{now:0}).projectSeed,0));
});
test('The preview\'s catalogue covers every value its generator draws; tuning offers it without digital life',()=>{
  const cat=catalog.PREVIEWS[ID];assert(cat&&cat.preview);assert.equal(catalog.FAMILIES[ID],undefined,'not a base for declarative packs');
  for(let seed=1;seed<=200;seed++){
    const r=recipe.generate(project(`cat-${seed}`,{modules:seed*3,classes:seed%7,tests:seed%5,cross:seed%11,ui:seed%4,groups:1+seed%9}),{family:ID,seed:seed*7919,variant:seed%3,now:0});
    for(const [p,spec] of Object.entries(cat.parameters)){if(p.startsWith('technique.')&&p!=='technique.finish')continue;const v=catalog.get(r.genome,p);
      assert(v!==undefined,`${p} missing`);assert(catalog.accepts(spec,v),`${p}=${JSON.stringify(v)}`);}
    assert.deepEqual(Object.values(r.genome.effects),cat.effects);assert.deepEqual(r.genome.ambient.unlocks,cat.unlocks);}
  const r=recipe.generate(project('tune'),{family:ID,now:0}),spec=recipe.tunable(r);
  assert.deepEqual(Object.keys(spec).sort(),Object.keys(cat.parameters).sort());assert(!Object.keys(spec).some(k=>k.startsWith('life.')));
  const tuned=recipe.update(r,{type:'tune',values:{'fractal.form':'box','fractal.power':6}},project('tune'),0);
  assert.deepEqual([tuned.genome.fractal.form,tuned.genome.fractal.power],['box',6]);
  assert.throws(()=>recipe.update(r,{type:'tune',values:{'fractal.power':13}},project('tune'),0),/power/);
});
test('Each project draws its own universe: the formula and its parameters, not only the colours, from its own stream',async()=>{
  const {createFormula}=await load('fractal-forms');
  const forms={},powers=new Set(),shapes=new Set();
  const kinds=[{modules:80,ui:60,dirs:20},{modules:60,classes:50,cross:40},{modules:40,tests:30,dirs:30},{modules:30,fns:12},{modules:12}];
  for(let k=0;k<160;k++){const g=recipe.generate(project(`u-${k}`,{...kinds[k%kinds.length],groups:1+k%8}),{family:ID,now:0}).genome.fractal;
    forms[g.form]=(forms[g.form]||0)+1;powers.add(g.power);shapes.add(Math.round(g.shape*10));}
  assert.deepEqual(Object.keys(forms).sort(),['box','bulb','julia','kifs'],JSON.stringify(forms));
  assert(powers.size>=4&&shapes.size>=8,'branching and shape vary between projects');
  // The code's character weighs the choice: interface-heavy code draws bulbs most, class-heavy code boxes more often.
  const count=(opts,form)=>Array.from({length:120},(_,k)=>recipe.generate(project(`w-${form}-${k}`,opts),{family:ID,now:0}).genome.fractal.form).filter(f=>f===form).length;
  assert(count({modules:80,ui:80},'bulb')>count({modules:80,classes:80,cross:80},'bulb'));
  assert(count({modules:80,classes:80,cross:80},'box')>count({modules:80,ui:80},'box'));
  // Different formulas are different shapes: the estimators disagree at the same points.
  const at=f=>{const r={projectSeed:7,genome:{fractal:{form:f,power:8,twist:0,shape:.5,julia:2,detail:1}}},F=createFormula(r);return [[.5,.2,.1],[.1,.7,.3],[.6,-.4,.2]].map(p=>+F.de(...p,8).toFixed(4));};
  const all=['bulb','julia','box','kifs'].map(at);for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)assert.notDeepEqual(all[i],all[j]);
});
test('The formulas: a bounded form normalized to its radius, its JS twin consistent, its GLSL written for the same constants',async()=>{
  const {createFormula,R0,MIN_IT,MAX_IT,unfoldAt,detailCap}=await load('fractal-forms');
  for(const form of ['bulb','julia','box','kifs'])for(const twist of [0,.6])for(const shape of [0,.5,1]){
    const F=createFormula({projectSeed:11,genome:{fractal:{form,power:7,twist,shape,julia:4,detail:1}}});
    assert(F.de(R0*2.5,0,0,8)>R0*.8,`${form}: far outside is far`);
    // the surface along a direction lies inside the bounding radius; a step past it is inside the form
    let hits=0;for(let k=0;k<24;k++){const y=1-2*(k+.5)/24,s=Math.sqrt(1-y*y),a=k*2.4,u=[Math.cos(a)*s,y,Math.sin(a)*s],r=F.radial(u,8);
      if(r===null)continue;hits++;assert(r>.05&&r<=R0*1.05,`${form} r=${r}`);assert(Math.abs(F.de(u[0]*r,u[1]*r,u[2]*r,8))<.02);}
    assert(hits>=12,`${form}: the rays meet the form`);
    assert.match(F.glsl,/float fde\(vec3 p,float it\)/);assert.match(F.glsl,/float fdeT\(vec3 p,float it,out vec4 trap\)/);
    assert.equal((F.glsl.match(/\{/g)||[]).length,(F.glsl.match(/\}/g)||[]).length);
    assert(!/NaN|Infinity/.test(F.glsl));}
  // Unfolding: a seed when empty, more recursions as code arrives, never beyond the most the shader runs.
  const cfg=createFormula({projectSeed:1,genome:{fractal:{form:'bulb',power:8,detail:1}}}).cfg;
  assert.equal(unfoldAt(cfg,0),MIN_IT);let last=0;for(const m of [1,5,20,80,400,5000]){const it=unfoldAt(cfg,m);assert(it>last&&it<MAX_IT);last=it;}
  // The level of detail: fewer recursions where a pixel covers more of the form.
  assert(detailCap(cfg,.001)>detailCap(cfg,.01)&&detailCap(cfg,.1)>=MIN_IT);
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
test('The project on the surface is a pure function of the model and the time: regions keep their slot, files their site',async()=>{
  const {layoutConfig,layoutAt,regionSlots,regionWeights,swellAt,massAt}=await load('fractal-forms');
  const r=recipe.generate(project('layout'),{family:ID,now:0}),cfg=layoutConfig(r),slots=regionSlots(cfg.seed);
  assert.deepEqual(slots,regionSlots(cfg.seed));assert.notDeepEqual(slots,regionSlots(cfg.seed+1),'each identity turns its own');
  // the first slots stand far apart
  for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){const c=slots[i][0]*slots[j][0]+slots[i][1]*slots[j][1]+slots[i][2]*slots[j][2];assert(c<.5,`slots ${i},${j}`);}
  const a=layoutAt(await network(),T0+1000,cfg,slots),b=layoutAt(await network(),T0+1000,cfg,slots);
  assert.deepEqual(a,b,'same model, same moment: the same layout');
  assert.deepEqual(a.regions.map(x=>x.id),['A','B','C']);assert.deepEqual(a.regions[0].files,['a0','a1','a2','a3','a4','a5','a6']);
  // a new file joins its region; every earlier file keeps its direction
  const grown=await network({extra:true}),before=layoutAt(grown,T0+59000,cfg,slots),after=layoutAt(grown,T0+80000,cfg,slots);
  for(const s of before.sites){const t=after.sites.find(x=>x.id===s.id);assert.deepEqual(t.dir,s.dir);assert.equal(t.region,s.region);}
  assert(after.sites.some(s=>s.id==='a7')&&!before.sites.some(s=>s.id==='a7'));
  // the largest region swells the most; growth (mass) eases in as files are born
  const m=await network(),w=regionWeights(m,T0+5000,a.regions);assert.equal(Math.max(...w),w[0]);assert(w[1]<w[0]);
  assert(swellAt(a.regions[0].dir,a.regions,w,cfg.swell)>swellAt(a.regions[1].dir,a.regions,w,cfg.swell));
  assert(massAt(grown,T0+59000)<massAt(grown,T0+80000));
});
test('More than 24 subsystems: every region keeps a direction of its own, and the first 24 stay where they were',async()=>{
  const {layoutConfig,layoutAt,regionSlots}=await load('fractal-forms'),{createModel}=await load('model');
  const cfg=layoutConfig(recipe.generate(project('wide'),{family:ID,now:0})),m=createModel(),nodes=[];
  for(let k=0;k<49;k++){nodes.push({id:`G${k}`,type:'group',q:k,r:0,order:k,counts:{}});for(let j=0;j<2;j++)nodes.push({id:`G${k}m${j}`,type:'module',group:`G${k}`,dir:`G${k}`,q:0,r:0,state:'committed',counts:{function:3}});}
  m.reset({nodes,edges:[]},T0);
  const first=regionSlots(cfg.seed),more=regionSlots(cfg.seed,49);
  assert.deepEqual(more.slice(0,24),first,'the sequence continues: the first 24 slots are unchanged');
  const {regions}=layoutAt(m,T0+1000,cfg,more),key=d=>d.map(x=>x.toFixed(9)).join(',');
  assert.equal(regions.length,49);assert.equal(new Set(regions.map(r=>key(r.dir))).size,49,'no two regions share a direction');
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  for(let i=0;i<49;i++)for(let j=i+1;j<49;j++)assert(dot(regions[i].dir,regions[j].dir)<Math.cos(10*Math.PI/180),`regions ${i} and ${j} at least 10 degrees apart`);
  // The world itself: no two subsystems are drawn (or named) at the same place, seen from any side.
  const {THREE}=await load('core'),{createFamily}=await load('fractal'),{createDirector}=await load('director'),{createAgents}=await load('agents');
  const r=recipe.generate(project('wide'),{family:ID,now:0}),agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);
  const w=createFamily({scene,camera,model:m,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:createDirector({recipe:r}),agents,pipeline:{size:[640,360]}});w.rebuild();
  const frame=t=>({t,tsec:(t-m.epoch)/1000,tview:(t-m.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',
    unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:agents.list(t),overrides:{},quality:0,music:null});
  w.update(frame(T0+6000));assert.equal(w.stats().regions,49);const seen=new Map();
  for(const [x,y,z] of [[0,8,60],[60,8,0],[0,8,-60],[-60,8,0],[0,50,20]]){camera.position.set(x,y,z);camera.lookAt(0,0,0);
    for(const l of w.subsystemLabels(frame(T0+6000)))seen.set(l.text,l.position.toArray().map(v=>v.toFixed(4)).join(','));}
  assert.equal(seen.size,49,'every subsystem is labelled from some side');assert.equal(new Set(seen.values()).size,49,'no two labels at the same place');
  w.dispose();
});
// A headless world on a model (as the host drives it), for the tests below.
async function headless(model,name='headless'){
  const {THREE}=await load('core'),{createFamily}=await load('fractal'),{createDirector}=await load('director'),{createAgents}=await load('agents');
  const r=recipe.generate(project(name),{family:ID,now:0}),agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);camera.position.set(0,8,60);camera.lookAt(0,0,0);
  const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:createDirector({recipe:r}),agents,pipeline:{size:[640,360]}});w.rebuild();
  const frame=t=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',
    unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:agents.list(t),overrides:{},quality:0,music:null});
  return {w,scene,frame,at:t=>w.update(frame(t))};
}
test('A file born between two whole seconds is on the surface from its birth, whether the moment is played through or sought',async()=>{
  const grow=async start=>{const m=await network();m.applyDelta({add:[{id:'a8',type:'module',group:'A',dir:'A',q:0,r:0,state:'committed',counts:{function:3}}],remove:[],addEdges:[],removeEdges:[]},start,start+100);return m;};
  // a birth well inside a second (births are snapped to the score's step grid)
  let start=T0+20000,m=await grow(start);for(let k=0;k<40&&!(m.bornAt(m.modules.get('a8'))%1000>=100&&m.bornAt(m.modules.get('a8'))%1000<=600);k++)m=await grow(start+=37);
  const born=m.bornAt(m.modules.get('a8')),from=Math.floor(born/1000)*1000+1,to=born+300;assert(born>from&&Math.floor(to/1000)===Math.floor(from/1000));
  const A=await headless(m),B=await headless(await grow(start));
  A.at(from);A.at(to);B.at(to);
  assert.deepEqual(snapshot(A.scene),snapshot(B.scene),'played through or sought, the same state');
  A.w.dispose();B.w.dispose();
});
test('An effect stays on its own file when the layout reorders: a wave started before a new file arrives ends where one started after does',async()=>{
  const at=T0+59000,wave={effect:'coherence-wave',intent:'validation.passed',tier:2,scale:1,at,subject:{fileIds:['b0']}};
  // a7 joins subsystem A at T0+60000: every site of B and C moves one place on in the layout
  const A=await headless(await network({extra:true})),C=await headless(await network({extra:true}));
  A.at(at);A.w.effect(wave,A.frame(at));A.at(T0+61000);
  C.at(T0+61000);C.w.effect(wave,C.frame(T0+61000));C.at(T0+61000);
  const a=snapshot(A.scene).u,c=snapshot(C.scene).u;assert(a.uWavK.some(x=>x[1]>0),'the wave is on');
  assert.deepEqual(a.uWav,c.uWav,'the wave front starts from b0 in both');
  A.w.dispose();C.w.dispose();
});
function snapshot(scene){
  let R=null,sites=null;scene.traverse(o=>{if(o.userData?.fractal)R=o.userData.fractal;if(o.isPoints&&o.geometry.attributes.sS)sites=o;});
  const v=x=>x?.toArray?x.toArray():Array.isArray(x)?x.map(y=>y.toArray()):x;
  const n=sites.geometry.drawRange.count;
  return {u:Object.fromEntries(['uIt','uWSg','uTch','uTchC','uWav','uWavC','uWavK','uDec','uDecA','uLast','uDecOn','TWC','SPC','uInner'].map(k=>[k,v(R[k].value)])),
    sites:[...sites.geometry.attributes.position.array.slice(0,n*3),...sites.geometry.attributes.sC.array.slice(0,n*4)]};
}
test('The world runs headless: its state at a moment is the same whatever was drawn before, and failure never looks like success',async()=>{
  const {THREE}=await load('core');const {createFamily}=await load('fractal');const {createDirector}=await load('director');const {createAgents}=await load('agents');
  const r=recipe.generate(project('world'),{family:ID,now:0});
  const make=async()=>{const model=await network();model.cue({type:'validation.test.failed',detail:{fileIds:['a0','a1']}},T0+2000);
    const director=createDirector({recipe:r}),agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);camera.position.set(0,8,60);camera.lookAt(0,0,0);
    agents.record({type:'agent.state',ts:T0+500,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:'b1'},detail:{state:'tool',activity:'editing',provider:'cursor'}});
    const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director,agents,pipeline:{size:[640,360]}});w.rebuild();
    const frame=t=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',
      unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:agents.list(t),overrides:{},quality:0,music:null});
    return {w,frame,scene,camera};};
  const A=await make(),B=await make();
  for(const t of [T0+9000,T0+1200,T0+4000])A.w.update(A.frame(t));B.w.update(B.frame(T0+4000));
  assert.deepEqual(snapshot(A.scene),snapshot(B.scene),'the state at a moment does not depend on the path to it');
  const s=A.w.stats();assert.equal(s.regions,3);assert.equal(s.sites,13);assert(s.threads>=3);assert(s.iterations>2.5&&s.iterations<14);
  assert.equal(A.w.status(A.frame(T0+4000)),'2 sites decohering');
  // failure: the decoherence field is on, in the warning colour; the words say so and never borrow success's
  const st=snapshot(A.scene);assert.equal(st.u.uDecOn,1);assert(st.u.uDecA[0][0]>0&&st.u.uDecA[0][2]>0);
  const fail=A.w.describe({intent:'validation.failed',subject:{fileIds:['a0','a1']},detail:{}},A.frame(T0+4000)),pass=A.w.describe({intent:'validation.passed',subject:{fileIds:['a0']},detail:{}},A.frame(T0+4000));
  assert.match(fail.text,/decohere/);assert.notEqual(fail.color,pass.color);assert.doesNotMatch(fail.text,/bloom|wave|pass|coheren/i);
  // a passing run is a coherence wave in the valid colour, never the warning colour
  A.w.effect({effect:'coherence-wave',intent:'validation.passed',tier:2,scale:1,at:T0+4500,subject:{fileIds:['b0','b1']}},A.frame(T0+4500));A.w.update(A.frame(T0+5500));
  const wave=snapshot(A.scene).u,k=wave.uWavK.findIndex(x=>x[1]>0&&x[0]===0);assert(k>=0,'a wave slot');
  const P=r.genome.palette,lin=c=>{const x=new THREE.Color(c);return [x.r*1.3,x.g*1.3,x.b*1.3];},near=(a,b)=>a.every((x,i)=>Math.abs(x-b[i])<.01);
  assert(near(wave.uWavC[k].slice(0,3),lin(P.valid)),'the wave is the valid colour');
  assert(!near(wave.uWavC[k].slice(0,3),lin(P.warning)),'the wave is not the warning colour');
  // Words are generic or public names: no file id ever appears.
  for(const intent of ['subsystem.created','structure.created','subsystem.connected','validation.recovered','milestone.achieved','repository.checkpoint','world.expanded','agent.collision']){
    const d=A.w.describe({intent,subject:{groupId:'A',fileId:'a2',targetId:'b0',fileIds:['a2']},detail:{providers:['claude-code','cursor'],kinds:['recovery'],chapter:2}},A.frame(T0+4000));
    assert(d&&!/\b[abc]\d\b/.test(`${d.text} ${d.sub||''} ${d.banner||''}`),intent);}
  for(const l of A.w.subsystemLabels(A.frame(T0+4000)))assert(!/\b[abc]\d\b/.test(`${l.text} ${l.sub}`));
  // Each CAST provider its own colour; the editing agent is placed by its site.
  const colors=['claude-code','cursor','codex','grok','qwen','kimi'].map(p=>A.w.agentColor({provider:p}));assert.equal(new Set(colors).size,6);
  assert(A.w.agentPosition('x'),'the editing agent has a position for its chip');
  A.w.dispose();B.w.dispose();
});
test('The earned bloom is rare: the director\'s token and a four-minute gap; otherwise a local unfolding',async()=>{
  const {THREE}=await load('core');const {createFamily}=await load('fractal');const {createAgents}=await load('agents');
  const r=recipe.generate(project('bloom'),{family:ID,now:0}),model=await network(),lasting=[];
  const director={lasting:()=>lasting,attentionAt:()=>null,activityAt:()=>0,unlockedAt:()=>[]};
  const w=createFamily({scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(34,16/9,.1,4000),model,recipe:r,speed:()=>1,name:id=>id,director,agents:createAgents(),pipeline:{size:[640,360]}});
  const frame=t=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:0,barPhase:0,mood:{tempo:96},energy:0,activity:0,unlocks:[],agents:[],overrides:{},quality:0,music:null});
  w.update(frame(T0+1000));
  const milestone=(at,tier)=>{const l=lasting[0]||{type:'milestone.achieved',subject:{fileIds:['a0']},first:at,count:0,times:[]};if(!lasting.length)lasting.push(l);l.count++;l.times.push(at);
    w.effect({effect:'bloom',intent:'milestone.achieved',tier,scale:1,at,subject:{fileIds:['a0']},detail:{kinds:['recovery']}},frame(at));w.update(frame(at+100));return w.stats().lastBloom;};
  assert.equal(milestone(T0+10000,3),'bloom','the first verified milestone with a token blooms');
  assert.equal(milestone(T0+70000,3),'local','one minute later: a local unfolding');
  assert.equal(milestone(T0+10000+240000,2),'local','without the token (tier 2): a local unfolding');
  // (known approximation, as in Synaptic Storm: the gap reads every milestone time in the lasting record, so the
  // downgraded one above still holds the gap)
  assert.equal(milestone(T0+10000+250000,3),'local','ten seconds after a milestone that held the gap: a local unfolding');
  assert.equal(milestone(T0+10000+500000,3),'bloom','four minutes after it, with the token: blooms again');
  w.dispose();
});
test('The player and the receiver know the preview: the host loads it, /api/catalog lists it apart from the three',async t=>{
  assert.match(fs.readFileSync(path.join(__dirname,'../public/worlds/host.js'),'utf8'),/'fractal-continuum':'\.\/fractal\.js'/);
  const svc=await startService(t,{port:0,dataDir:tempDir(t,'cr-fractal-'),quiet:true});
  const c=await (await fetch(`http://127.0.0.1:${svc.port}/api/catalog`)).json();
  assert.deepEqual(Object.keys(c.families).sort(),['fractal-biosphere','machine-cathedral','stellar-forge']);
  assert.equal(c.previews[ID].preview,true);assert.equal(c.previews[ID].name,'Fractal Continuum (preview)');assert(c.previews[ID].parameters['fractal.form']);
  assert(c.previews['synaptic-storm'],'the other preview stays listed');
});

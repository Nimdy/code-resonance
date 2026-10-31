'use strict';
// Temporal Terrain: graduated with generator 5 (scored from its own stream, so no existing identity changes); the land (time to depth, the rows of
// the history pyramid, the ranges and ridges across it) is a pure function of the model and the time; a replay's land is
// its whole recorded history whether played through or sought; the world runs headless, keeps its effects on their own
// files and the failure language honest, and never draws a path or an identifier.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const recipe=require('../engine/recipe');
const catalog=require('../engine/catalog');
const {tempDir,startService}=require('./helpers');
const {sha}=require('../receiver/protocol');
const load=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000;
const ID='temporal-terrain';
function project(id,{modules=10,ui=0,classes=0,fns=3,tests=0,dirs=3,hub=0,cross=0,agents=0,agentEvents=0,groups=3}={}){
  const nodes=Array.from({length:groups},(_,k)=>({id:`g${k+1}`,type:'group'})),edges=[];
  for(let i=0;i<modules;i++){const counts={function:fns};if(i<ui)counts['ui.component']=2;if(i<classes){counts.class=2;counts.interface=2;}
    nodes.push({id:`m${i}`,type:'module',group:`g${1+i%groups}`,dir:`d${i%dirs}`,lang:i<ui?'tsx':'ts',test:i>=modules-tests,counts});}
  for(let i=1;i<=hub;i++)edges.push({a:`m${i}`,b:'m0',kind:'depends',cross:false});
  for(let i=0;i<cross;i++)edges.push({a:`m${i%modules}`,b:`m${(i+1)%modules}`,kind:'depends',cross:true});
  return {projectId:sha(id),graph:{nodes,edges},stats:{raw:100,agentEvents,testsPassed:0,testsFailed:0},agents:Array.from({length:agents},(_,i)=>({id:`a${i}`}))};
}
test('Temporal Terrain is scored from generator 5 on (never by generator 4); choosing it is a lasting, living identity',()=>{
  assert.deepEqual(recipe.FLAGSHIPS,['stellar-forge','fractal-biosphere','machine-cathedral']);assert(recipe.GRADUATED.includes(ID)&&recipe.FAMILIES.includes(ID));
  const shapes=[{modules:120,ui:70,dirs:40},{modules:12,hub:10,agents:5,agentEvents:80},{modules:60,classes:40,tests:20,cross:50},{modules:3},{modules:400,cross:300,agents:8,agentEvents:90}];
  for(let k=0;k<300;k++){const p=project(`scored-${k}`,shapes[k%shapes.length]),r=recipe.generate(p,{variant:k%4,now:0,version:4});
    assert(recipe.FLAGSHIPS.includes(r.family),`${k}: ${r.family}`);assert.deepEqual(Object.keys(r.familyScores),recipe.FLAGSHIPS);
    assert.deepEqual(Object.keys(recipe.generate(p,{variant:k%4,now:0}).familyScores),recipe.FAMILIES);}
  const p=project('chosen',{modules:30,ui:10});
  const chosen=recipe.update(recipe.generate(p,{now:0}),{type:'family',family:ID},p,0);
  assert.equal(chosen.family,ID);assert.equal(chosen.familyName,'Temporal Terrain');assert.equal(chosen.familyKind,'builtin');
  assert.equal(chosen.source,'user');assert.equal(chosen.locked,true);assert.equal(chosen.founded,true);
  assert.equal(chosen.genome.life.enabled,true,'a new identity lives (generator 5)');assert.equal(chosen.genome.technique.finish,'cinematic');assert.equal(chosen.genome.music.score,3);
  assert.equal(recipe.resolve(chosen,p,5).recipe,chosen);
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'automatic'},p,0).family));
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'regenerate'},p,0).family));
  const again=recipe.update(chosen,{type:'regenerate',keepFamily:true},p,0);assert.equal(again.family,ID);assert.notDeepEqual(again.genome,chosen.genome);
  assert.deepEqual({...recipe.generate(p,{family:ID,now:1})},{...recipe.generate(p,{family:ID,now:1})});
});
test('Graduating it changes no existing identity (the generator fingerprints of tests/recipe.test.js still hold)',()=>{
  const p={projectId:'pal-test-1234567',graph:{nodes:[],edges:[]},stats:{}},h=x=>require('node:crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16);
  for(const f of recipe.GRADUATED)recipe.generate(p,{family:f,now:0});
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(p,{family:f,now:0}).genome)),'d27fb424f09b9362');
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(p,{family:f,now:0,version:3}).genome)),'ccb6221a53e0c619');
  assert.equal(recipe.RECIPE_VERSION,5);
  const q=project('scores',{modules:40,classes:30,tests:10});assert.deepEqual(recipe.generate(q,{now:0}).familyScores,recipe.familyScores(recipe.traitsOf(q),recipe.generate(q,{now:0}).projectSeed,0));
});
test('Its catalogue covers every value its generator draws; the palette keeps a fault away from the lamps\' colour',()=>{
  const cat=catalog.FAMILIES[ID];assert(cat&&!cat.preview,'a family of the catalogue: a base for declarative packs');assert.equal(catalog.PREVIEWS[ID],undefined);
  const hue=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;
    const h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return (h*60+360)%360;};
  const dh=(a,b)=>{const d=Math.abs(a-b)%360;return Math.min(d,360-d);};
  const spacing=[];
  for(let seed=1;seed<=200;seed++){
    const r=recipe.generate(project(`cat-${seed}`,{modules:seed*3,classes:seed%7,tests:seed%5,cross:seed%11,ui:seed%4,groups:1+seed%9}),{family:ID,seed:seed*7919,variant:seed%3,now:0});
    for(const [p,spec] of Object.entries(cat.parameters)){if(p.startsWith('technique.')&&p!=='technique.finish')continue;const v=catalog.get(r.genome,p);
      assert(v!==undefined,`${p} missing`);assert(catalog.accepts(spec,v),`${p}=${JSON.stringify(v)}`);}
    assert.deepEqual(Object.values(r.genome.effects),cat.effects);assert.deepEqual(r.genome.ambient.unlocks,cat.unlocks);
    const P=r.genome.palette;assert(dh(hue(P.warning),hue(P.accent))>=35,`seed ${seed}: the fault ${P.warning} stays away from the lamps ${P.accent}`);
    const h0=hue(P.primary);assert(!(h0>48&&h0<100),`seed ${seed}: the first contour hue is never olive (${h0.toFixed(0)})`);
    spacing.push([seed*3,r.genome.relief.spacing]);}
  // the files' spacing follows the project's size at generation: a large project's files stand closer
  const at=n=>spacing.filter(([m])=>Math.abs(m-n)<10).map(x=>x[1]);assert(Math.max(...at(450))<Math.min(...at(30)));
  const r=recipe.generate(project('tune'),{family:ID,now:0}),spec=recipe.tunable(r);
  assert.deepEqual(Object.keys(spec).sort(),Object.keys(cat.parameters).sort());assert(!Object.keys(spec).some(k=>k.startsWith('life.')));
  const tuned=recipe.update(r,{type:'tune',values:{'camera.personality':'map','contour.interval':1.2}},project('tune'),0);
  assert.deepEqual([tuned.genome.camera.personality,tuned.genome.contour.interval],['map',1.2]);
  assert.throws(()=>recipe.update(r,{type:'tune',values:{'contour.index':9}},project('tune'),0),/index/);
});
test('Time is the land: depth from age on a logarithmic scale, a pyramid of rows whose moments sit on fixed lattices',async()=>{
  const L=await load('terrain-layout');const cfg=L.layoutConfig(recipe.generate(project('time'),{family:ID,now:0}));
  assert.equal(L.depthOf(0,cfg),0);let last=-1;for(const a of [1,1000,10000,60000,600000,3600000]){const d=L.depthOf(a,cfg);assert(d>last);last=d;assert(Math.abs(L.ageOf(d,cfg)-a)<1e-6*Math.max(1,a));}
  // the recent past is wide, the old past compressed: a minute now is deeper than a minute an hour ago
  assert(L.depthOf(60000,cfg)>L.depthOf(3660000,cfg)-L.depthOf(3600000,cfg)+20);
  // rows: each level's 24 rows cover its ages exactly, one texture slot each; ordinals map moments back and forth
  for(const t of [T0+1234,T0+987654,T0+3600000+17]){const lat=L.latticeAt(t,T0),slots=new Set([0]);
    for(let l=0;l<L.LEVELS;l++)for(let k=0;k<L.PER;k++){const m=lat[l]-k,age=t-(T0+m*L.levelBin(l));assert(age>=L.levelStart(l)&&age<L.levelStart(l+1),`level ${l} row ${k}`);slots.add(L.rowSlot(l,m));}
    assert.equal(slots.size,L.ROWS,'every row its own slot');
    let prev=-1;for(let o=0;o<L.ROWS;o++){const tp=L.ordinalTime(o,t,T0,lat),nu=L.ordinalOf(tp,t,T0,lat);assert(Math.abs(nu-o)<1e-6,`ordinal ${o}: ${nu}`);assert(nu>prev);prev=nu;}}
});
// A model with three subsystems, files in creation order, symbols, and dependencies inside and across them.
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
test('The land is a pure function of the model and the time: ranges in order of birth from the middle out, files at fixed slots',async()=>{
  const L=await load('terrain-layout');const cfg=L.layoutConfig(recipe.generate(project('layout'),{family:ID,now:0}));
  const a=L.rangesAt(L.prepare(await network()),T0+1000,L.EASE,cfg),b=L.rangesAt(L.prepare(await network()),T0+1000,L.EASE,cfg);
  assert.deepEqual(a,b,'same model, same moment: the same land');
  assert.deepEqual(a.ranges.map(r=>r.id),['A','B','C']);assert.equal(a.ranges[0].c,0,'the first range in the middle');
  assert(a.ranges[1].c>0&&a.ranges[2].c<0,'then right, then left');
  const A=a.ranges[0];assert.deepEqual(A.files.map(f=>f.id),['a0','a1','a2','a3','a4','a5','a6']);
  assert.deepEqual(A.files.map(f=>Math.round((f.x-A.c)/cfg.sp)),[0,1,-1,2,-2,3,-3],'alternately right and left of the first file');
  // a symbol-rich file is a higher ridge
  assert(A.files[0].h>A.files[1].h&&A.files[0].n===4);
  // a new file joins its range at the next slot; every earlier file keeps its slot, ranges outside move out
  const grown=L.prepare(await network({extra:true})),before=L.rangesAt(grown,T0+59000,L.EASE,cfg),after=L.rangesAt(grown,T0+90000,L.EASE,cfg);
  const slot=(R,id)=>{for(const r of R.ranges)for(const f of r.files)if(f.id===id)return [r.id,Math.round((f.x-r.c)/cfg.sp)];return null;};
  for(const id of ['a0','a6','b0','b2','c1'])assert.deepEqual(slot(after,id),slot(before,id));
  assert.deepEqual(slot(after,'a7'),['A',4]);assert.equal(slot(before,'a7'),null);
  assert(after.ranges[1].c>before.ranges[1].c&&after.ranges[2].c<before.ranges[2].c,'the wider middle range pushes the others out');
  // the rows: a constant stretch of history is one row's content; the land's texture at t does not depend on the path to it
  const colorOf=(id,k)=>[.1*k,.5,.6],m1=await network({extra:true}),m2=await network({extra:true});
  const l1=L.createLand(cfg,{colorOf}),l2=L.createLand(cfg,{colorOf});
  for(const t of [T0+200000,T0+30000,T0+61000,T0+75000])l1.update(m1,t,T0);l2.update(m2,T0+75000,T0);
  assert.deepEqual([...l1.data],[...l2.data],'the same land at T0+75 s, reached directly or after other moments');
  assert.deepEqual(l1.extent,l2.extent);
  // the history behind a7's birth has no a7 ridge; the present has it
  const x7=after.ranges[0].c+4*cfg.sp;assert(l2.sample(x7,T0+75000,T0+75000,T0)>l2.sample(x7,T0+40000,T0+75000,T0)+.5);
});
test('The mapping: symbols raise a ridge, a removal erodes it, a failure is a fault for exactly as long as it lasted, a pass a sheen',async()=>{
  const L=await load('terrain-layout');const cfg=L.layoutConfig(recipe.generate(project('mapping'),{family:ID,now:0})),m=await network();
  m.applyDelta({add:Array.from({length:12},(_,k)=>({id:`t${k}`,type:'function',parent:'b1',slot:k})),remove:[],addEdges:[],removeEdges:[]},T0+20000,T0+21000);
  m.cue({type:'validation.test.failed',detail:{fileIds:['c0']}},T0+40000);m.cue({type:'validation.test.passed',detail:{fileIds:['c0']}},T0+70000);
  m.applyDelta({add:[],remove:['c2'],addEdges:[],removeEdges:[]},T0+90000,T0+91000);
  const P=L.prepare(m),f=(t,id)=>{for(const r of L.rangesAt(P,t,L.EASE,cfg).ranges)for(const x of r.files)if(x.id===id)return x;return null;};
  assert(f(T0+60000,'b1').h>f(T0+10000,'b1').h*1.5,'twelve symbols raise b1');assert(f(T0+60000,'b1').detail>f(T0+10000,'b1').detail,'and make it more rugged');
  assert.equal(f(T0+30000,'c0').stress,0);assert(f(T0+55000,'c0').stress>.99,'stressed between the failure and the pass');assert.equal(f(T0+80000,'c0').stress,0);
  assert(f(T0+80000,'c0').valid>.99&&f(T0+55000,'c0').valid===0,'validated after the pass');
  assert(f(T0+85000,'c2').alive>.99&&f(T0+120000,'c2')===null,'c2 erodes after its removal');
  // the texture: the fault channel along c0's ridge exactly in that stretch of history
  const land=L.createLand(cfg,{colorOf:()=>[.3,.3,.3]});land.update(m,T0+130000,T0);const xc0=f(T0+130000,'c0').x;
  assert(land.sample(xc0,T0+55000,T0+130000,T0,2)>.4&&land.sample(xc0,T0+20000,T0+130000,T0,2)<.05&&land.sample(xc0,T0+110000,T0+130000,T0,2)<.05);
  assert(land.sample(xc0,T0+110000,T0+130000,T0,3)>.4,'the sheen after the pass');
});
test('A replay\'s land is its whole recorded history: rebuilt from the recorded windows, as when it is played from the start',async()=>{
  const {historyFrom}=await load('terrain-layout'),{createModel}=await load('model');
  const mod=(id,group)=>({id,type:'module',group,dir:group,state:'draft',counts:{function:2}});
  const entries=[{seq:0,start:T0,end:T0+5000,graph:{add:[{id:'G',type:'group'},mod('x0','G')],remove:[],addEdges:[],removeEdges:[]},cues:[]},
    {seq:1,start:T0+5000,end:T0+10000,graph:{add:[mod('x1','G'),{id:'y0',type:'function',parent:'x1',slot:0}],remove:[],addEdges:[{a:'x1',b:'x0',kind:'depends'}],removeEdges:[]},
      cues:[{type:'symbol.created',ts:T0+7000,detail:{symbolId:'y0',fileId:'x1'}},{type:'repository.commit.observed',ts:T0+9000,detail:{fileIds:['x1']}}]},
    {seq:2,start:T0+10000,end:T0+15000,graph:{add:[mod('x2','G')],remove:[],addEdges:[],removeEdges:[]},cues:[{type:'validation.test.failed',ts:T0+12000,detail:{fileIds:['x2']}}]}];
  const h=historyFrom(entries,T0+14000);
  // as played from the start: the first window before time, then each window and its cues in order
  const p=createModel({speed:1,tempo:92});p.reset({nodes:entries[0].graph.add,edges:[]},T0);
  for(const e of entries){p.applyDelta(e.graph,e.start,e.end);for(const c of e.cues)if(c.ts<T0+14000)p.cue(c,c.ts);}
  for(const id of ['x0','x1','x2'])assert.equal(h.bornAt(h.modules.get(id)),p.bornAt(p.modules.get(id)),id);
  assert.equal(h.bornAt(h.modules.get('x0')),-Infinity,'the first window stood before time');assert(Number.isFinite(h.bornAt(h.modules.get('x1'))));
  assert.equal(h.bornAt(h.symbols.get('y0')),p.bornAt(p.symbols.get('y0')));assert.equal(h.stateAt(h.modules.get('x2'),T0+13000),'stressed');
  assert.deepEqual(h.commitLog,[{at:T0+9000,files:['x1']}],'commits are kept with their files');
  assert.equal(historyFrom(entries,T0+6000).modules.has('x2'),false,'nothing after the moment');
  assert.equal(historyFrom([{start:T0,intents:[]}],T0),null,'a live history (intents only) has no recorded structure');
});
// A headless world on a model (as the host drives it), for the tests below.
async function headless(model,{name='headless',director=null,agents=null,quality=0}={}){
  const {THREE}=await load('core'),{createFamily}=await load('terrain'),{createDirector}=await load('director'),{createAgents}=await load('agents');
  const r=recipe.generate(project(name),{family:ID,now:0}),ag=agents||createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);camera.position.set(0,120,200);camera.lookAt(0,0,-60);
  const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:director||createDirector({recipe:r}),agents:ag,pipeline:{size:[640,360]}});w.rebuild();
  const frame=(t,q=quality)=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',
    unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:ag.list(t),overrides:{},quality:q,music:null});
  return {w,scene,frame,r,camera,at:(t,q)=>{const f=frame(t,q);w.update(f);w.cameraGoal(f);w.afterCamera(f);return f;}};
}
function snapshot(scene){
  let U=null,fx=null,rib=null;scene.traverse(o=>{if(o.userData?.terrain)U=o.userData.terrain;if(o.isPoints&&o.geometry.attributes.fS)fx=o;if(o.geometry?.attributes?.rA)rib=o;});
  const v=x=>x?.toArray?x.toArray():Array.isArray(x)?x.map(y=>y.toArray?y.toArray():y):x;
  const n=fx.geometry.drawRange.count,nr=rib.geometry.instanceCount;
  return {u:Object.fromEntries(['uXc','uXh','uNow','uLv','uTch','uTchC','uFx','uFxB','uFxC','uCm','uMn','uSv','uNFx','uNMn','uNCm','uNTch','uSun','uStress','uKey'].map(k=>[k,v(U[k].value)])),
    land:[...U.uLand.value.image.data],fx:[...fx.geometry.attributes.position.array.slice(0,n*3),...fx.geometry.attributes.fC.array.slice(0,n*4)],rib:[...rib.geometry.attributes.rA.array.slice(0,nr*4)]};
}
test('The world runs headless: its state at a moment is the same whatever was drawn before, and failure never looks like success',async()=>{
  const {createDirector}=await load('director'),{createAgents}=await load('agents');
  const make=async()=>{const model=await network();model.cue({type:'validation.test.failed',detail:{fileIds:['a0','a1']}},T0+2000);
    // live (no recorded history): a commit is the director's checkpoint (b0 was already committed, so the model marks nothing)
    const r=recipe.generate(project('world'),{family:ID,now:0}),director=createDirector({recipe:r});
    director.process({type:'repository.checkpoint',ts:T0+2500,tier:1,magnitude:.5,evidence:'observed',subject:{fileIds:['b0']},detail:{}});
    const agents=createAgents();agents.record({type:'agent.state',ts:T0+500,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:'b1'},detail:{state:'tool',activity:'editing',provider:'cursor'}});
    return headless(model,{name:'world',agents,director});};
  const A=await make(),B=await make();
  for(const t of [T0+9000,T0+1200,T0+4000])A.at(t);B.at(T0+4000);
  assert.deepEqual(snapshot(A.scene),snapshot(B.scene),'the state at a moment does not depend on the path to it');
  const s=A.w.stats();assert.equal(s.ranges,3);assert.equal(s.files,13);assert(s.roads>=2,'the cross-subsystem dependencies are roads');assert.equal(s.history,false);
  assert.equal(A.w.status(A.frame(T0+4000)),'2 peaks on a fault');
  // failure: the fault channel is on in the land; the words say so and never borrow success's
  assert(s.fault>.3,`the fault is laid down (${s.fault})`);
  const fail=A.w.describe({intent:'validation.failed',subject:{fileIds:['a0','a1']},detail:{}},A.frame(T0+4000)),pass=A.w.describe({intent:'validation.passed',subject:{fileIds:['a0']},detail:{}},A.frame(T0+4000));
  assert.match(fail.text,/fault/);assert.notEqual(fail.color,pass.color);assert.doesNotMatch(fail.text,/sunrise|scan|pass|heal/i);
  // a fault's slot is the warning colour, a passing run's scan the valid colour, each on its own files
  A.w.effect({effect:'fault',intent:'validation.failed',tier:2,scale:1,at:T0+4100,subject:{fileIds:['a0','a1']}},A.frame(T0+4100));
  A.w.effect({effect:'scan',intent:'validation.passed',tier:2,scale:1,at:T0+4200,subject:{fileIds:['b0','b1']}},A.frame(T0+4200));A.at(T0+5000);
  const u=snapshot(A.scene).u,P=A.r.genome.palette;const {THREE}=await load('core'),lin=(c,k)=>{const x=new THREE.Color(c);return [x.r*k,x.g*k,x.b*k];},near=(a,b)=>a.every((x,i)=>Math.abs(x-b[i])<.01);
  const kf=u.uFx.findIndex(x=>x[0]===1),ks=u.uFx.findIndex(x=>x[0]===0);assert(kf>=0&&ks>=0&&u.uNFx>=2);
  assert(near(u.uFxC[kf].slice(0,3),lin(P.warning,1.3))&&near(u.uFxC[ks].slice(0,3),lin(P.valid,1.4)));assert(!near(u.uFxC[ks].slice(0,3),lin(P.warning,1.3)));
  // Words are generic or public names: no file id ever appears.
  for(const intent of ['subsystem.created','module.created','structure.created','structure.removed','subsystem.connected','validation.recovered','milestone.achieved','repository.checkpoint','world.expanded','agent.collision']){
    const d=A.w.describe({intent,subject:{groupId:'A',fileId:'a2',targetId:'b0',fileIds:['a2']},detail:{providers:['claude-code','cursor'],kinds:['recovery'],chapter:2}},A.frame(T0+4000));
    assert(d&&!/\b[abc]\d\b/.test(`${d.text} ${d.sub||''} ${d.banner||''}`),intent);}
  for(const l of A.w.subsystemLabels(A.frame(T0+4000)))assert(!/\b[abc]\d\b/.test(`${l.text} ${l.sub}`));
  const peek=A.w.inspect('a0',A.frame(T0+4000));assert(peek&&!/\ba0\b/.test(`${peek.text} ${peek.sub}`)&&/A peak of Name A/.test(peek.text));
  // Each CAST provider its own colour; the editing agent is placed for its chip; the commit is a survey line
  const colors=['claude-code','cursor','codex','grok','qwen','kimi'].map(p=>A.w.agentColor({provider:p}));assert.equal(new Set(colors).size,6);
  assert(A.w.agentPosition('x'),'the editing agent has a position for its chip');
  assert(u.uNCm>=1,'the commit draws a survey line');
  A.w.dispose();B.w.dispose();
});
test('An effect stays on its own files when the land moves: a fault started before a new file arrives covers what one started after does',async()=>{
  const at=T0+59000,fault={effect:'fault',intent:'validation.failed',tier:2,scale:1,at,subject:{fileIds:['b0','b1']}};
  // a7 joins subsystem A (the middle range) at T0+60000: range B moves outward
  const A=await headless(await network({extra:true})),C=await headless(await network({extra:true}));
  A.at(at);A.w.effect(fault,A.frame(at));A.at(T0+63000);
  C.at(T0+63000);C.w.effect({...fault,at},C.frame(T0+63000));C.at(T0+63000);
  const a=snapshot(A.scene).u,c=snapshot(C.scene).u,k=a.uFx.findIndex(x=>x[0]===1);assert(k>=0,'the fault is on');
  assert.deepEqual(a.uFx[k],c.uFx[c.uFx.findIndex(x=>x[0]===1)],'the fault covers b0 and b1 where they are now in both');
  A.w.dispose();C.w.dispose();
});
test('No dependencies, an empty project, every quality: nothing throws; the grid follows the quality table',async()=>{
  const {QUALITY}=await load('terrain'),{createModel}=await load('model');
  assert.equal(QUALITY.length,4);for(let q=1;q<4;q++){assert(QUALITY[q].nx*QUALITY[q].nz<QUALITY[q-1].nx*QUALITY[q-1].nz);assert(QUALITY[q].oct<=QUALITY[q-1].oct);}
  const empty=createModel();empty.reset({nodes:[],edges:[]},T0);const E=await headless(empty,{name:'empty'});
  for(const t of [T0,T0+1000,T0+60000])E.at(t);assert.equal(E.w.stats().ranges,0);assert.deepEqual(E.w.subsystemLabels(E.frame(T0+60000)),[]);
  assert.equal(E.w.pick(0,0,E.camera,E.frame(T0+60000)),null);E.w.dispose();
  const W=await headless(await network({links:[]}),{name:'nolinks'});
  for(let q=0;q<4;q++){W.at(T0+5000+q*100,q);assert.equal(W.w.stats().grid,QUALITY[q].nx*QUALITY[q].nz,`quality ${q}`);}
  assert.equal(W.w.stats().roads,0);W.w.effect({effect:'road',intent:'subsystem.connected',tier:2,scale:1,at:T0+5500,subject:{fileId:'a0',targetId:'b0'}},W.frame(T0+5500));W.at(T0+6000);
  W.w.dispose();
});
test('More than 24 subsystems: every range keeps its own place across the land, and is labelled apart',async()=>{
  const L=await load('terrain-layout'),{createModel}=await load('model');
  const m=createModel(),nodes=[];
  for(let k=0;k<49;k++){nodes.push({id:`G${k}`,type:'group',order:k,counts:{}});for(let j=0;j<2;j++)nodes.push({id:`G${k}m${j}`,type:'module',group:`G${k}`,dir:`G${k}`,state:'committed',counts:{function:3}});}
  m.reset({nodes,edges:[]},T0);
  const cfg=L.layoutConfig(recipe.generate(project('wide',{modules:98,groups:49}),{family:ID,now:0})),{ranges}=L.rangesAt(L.prepare(m),T0+1000,L.EASE,cfg);
  assert.equal(ranges.length,49);const span=ranges.map(r=>[r.c-r.w/2,r.c+r.w/2]).sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<span.length;i++)assert(span[i][0]>=span[i-1][1]-1e-9,`ranges ${i-1} and ${i} do not overlap`);
  const W=await headless(m,{name:'wide'});W.at(T0+6000);assert.equal(W.w.stats().ranges,49);
  const labels=W.w.subsystemLabels(W.frame(T0+6000));assert.equal(new Set(labels.map(l=>l.text)).size,49);
  assert.equal(new Set(labels.map(l=>l.position.x.toFixed(3))).size,49,'no two labels at the same place');W.w.dispose();
});
test('The earned sunrise is rare: the director\'s token and a four-minute gap; otherwise a local glow; monuments stay',async()=>{
  const {THREE}=await load('core');const {createFamily}=await load('terrain');const {createAgents}=await load('agents');
  const r=recipe.generate(project('sunrise'),{family:ID,now:0}),model=await network(),lasting=[];
  const director={lasting:()=>lasting,attentionAt:()=>null,activityAt:()=>0,unlockedAt:()=>[],commands:[]};
  const w=createFamily({scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(34,16/9,.1,4000),model,recipe:r,speed:()=>1,name:id=>id,director,agents:createAgents(),pipeline:{size:[640,360]}});
  const frame=t=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:0,barPhase:0,mood:{tempo:96},energy:0,activity:0,unlocks:[],agents:[],overrides:{},quality:0,music:null});
  w.update(frame(T0+1000));
  const milestone=(at,tier)=>{const l=lasting[0]||{type:'milestone.achieved',subject:{fileIds:['a0']},first:at,count:0,times:[]};if(!lasting.length)lasting.push(l);l.count++;l.times.push(at);
    w.effect({effect:'sunrise',intent:'milestone.achieved',tier,scale:1,at,subject:{fileIds:['a0']},detail:{kinds:['recovery']}},frame(at));w.update(frame(at+100));return w.stats().lastSunrise;};
  assert.equal(milestone(T0+10000,3),'sunrise','the first verified milestone with a token: a sunrise');
  assert.equal(milestone(T0+70000,3),'local','one minute later: a local glow');
  assert.equal(milestone(T0+10000+240000,2),'local','without the token (tier 2): a local glow');
  assert.equal(milestone(T0+10000+250000,3),'local','ten seconds after a milestone that held the gap: a local glow');
  assert.equal(milestone(T0+10000+500000,3),'sunrise','four minutes after it, with the token: a sunrise again');
  assert(w.stats().monuments>=4,'a monument for each verified milestone, from the director\'s record');
  w.onPrime();w.update(frame(T0+10000+500200));assert.equal(w.stats().lastSunrise,null,'after a seek no transient survives');assert(w.stats().monuments>=4,'the monuments do');
  w.dispose();
});
test('The player and the receiver know it: the host loads it and hands it a replay\'s history, /api/catalog lists it with the families',async t=>{
  const host=fs.readFileSync(path.join(__dirname,'../public/worlds/host.js'),'utf8');
  assert.match(host,/'temporal-terrain':'\.\/terrain\.js'/);assert.match(host,/onHistory\(recorded,t\)/);
  assert.match(fs.readFileSync(path.join(__dirname,'../public/ui/workspaces/visual.js'),'utf8'),/id:'temporal-terrain'/);
  assert.match(fs.readFileSync(path.join(__dirname,'../public/web-demo/demo.js'),'utf8'),/'temporal-terrain':'Temporal Terrain'/);
  const svc=await startService(t,{port:0,dataDir:tempDir(t,'cr-terrain-'),quiet:true});
  const c=await (await fetch(`http://127.0.0.1:${svc.port}/api/catalog`)).json();
  assert.deepEqual(Object.keys(c.families),recipe.FAMILIES);assert.deepEqual(c.previews,{},'no preview is left');
  assert.equal(c.families[ID].builtin,true);assert.equal(c.families[ID].name,'Temporal Terrain');assert(c.families[ID].parameters['contour.interval']);
});

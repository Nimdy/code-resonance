'use strict';
// Aurora (preview): chosen only explicitly, so no existing identity changes; the sky (the curtains, their places, their
// rays) is a pure function of the model and the time; a replay's sky is its whole recorded history whether played
// through or sought; the world runs headless, keeps its effects on their own curtains and the failure language honest,
// rebuilds its lanterns from the director's record after a seek, earns its breakup rarely, follows the musical clock per
// bar, and never draws a path or an identifier.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const recipe=require('../engine/recipe');
const catalog=require('../engine/catalog');
const {tempDir,startService}=require('./helpers');
const {sha}=require('../receiver/protocol');
const load=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000;
const ID='aurora';
const h=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16);
function project(id,{modules=10,ui=0,classes=0,fns=3,tests=0,dirs=3,hub=0,cross=0,agents=0,agentEvents=0,groups=3}={}){
  const nodes=Array.from({length:groups},(_,k)=>({id:`g${k+1}`,type:'group'})),edges=[];
  for(let i=0;i<modules;i++){const counts={function:fns};if(i<ui)counts['ui.component']=2;if(i<classes){counts.class=2;counts.interface=2;}
    nodes.push({id:`m${i}`,type:'module',group:`g${1+i%groups}`,dir:`d${i%dirs}`,lang:i<ui?'tsx':'ts',test:i>=modules-tests,counts});}
  for(let i=1;i<=hub;i++)edges.push({a:`m${i}`,b:'m0',kind:'depends',cross:false});
  for(let i=0;i<cross;i++)edges.push({a:`m${i%modules}`,b:`m${(i+1)%modules}`,kind:'depends',cross:true});
  return {projectId:sha(id),graph:{nodes,edges},stats:{raw:100,agentEvents,testsPassed:0,testsFailed:0,created:modules},agents:Array.from({length:agents},(_,i)=>({id:`a${i}`}))};
}
test('Aurora is chosen only explicitly: never by the family scores, automatic or a plain regenerate',()=>{
  assert(recipe.PREVIEWS.includes(ID));assert(!recipe.FAMILIES.includes(ID));
  const shapes=[{modules:120,ui:70,dirs:40},{modules:12,hub:10,agents:5,agentEvents:80},{modules:60,classes:40,tests:20,cross:50},{modules:3},{modules:400,cross:300,agents:8,agentEvents:90}];
  for(let k=0;k<300;k++){const p=project(`scored-${k}`,shapes[k%shapes.length]),r=recipe.generate(p,{variant:k%4,now:0});
    assert(recipe.FAMILIES.includes(r.family),`${k}: ${r.family}`);assert.deepEqual(Object.keys(r.familyScores),recipe.FAMILIES);}
  const p=project('chosen',{modules:30,ui:10});
  const chosen=recipe.update(recipe.generate(p,{now:0}),{type:'family',family:ID},p,0);
  assert.equal(chosen.family,ID);assert.equal(chosen.familyName,'Aurora (preview)');assert.equal(chosen.familyKind,'builtin');
  assert.equal(chosen.source,'user');assert.equal(chosen.locked,true);assert.equal(chosen.founded,true);
  // (a new Aurora identity lives, as the graduated worlds' do: generator 5 draws its life from its own stream; a stored one
  // keeps what it had, tests/life-aurora.test.js)
  assert.equal(chosen.genome.life.enabled,true,'digital life for a new identity');assert.equal(chosen.genome.life.ecology,2);assert.equal(chosen.genome.technique.finish,'cinematic');assert.equal(chosen.genome.music.score,3);
  assert.equal(recipe.resolve(chosen,p,5).recipe,chosen);
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'automatic'},p,0).family));
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'regenerate'},p,0).family));
  const again=recipe.update(chosen,{type:'regenerate',keepFamily:true},p,0);assert.equal(again.family,ID);assert.notDeepEqual(again.genome,chosen.genome);
  assert.deepEqual({...recipe.generate(p,{family:ID,now:1})},{...recipe.generate(p,{family:ID,now:1})});
});
test('Adding the preview changes no existing identity (the fingerprints of tests/recipe.test.js and tests/generator-v5.test.js hold)',()=>{
  const EMPTY={projectId:'pal-test-1234567',graph:{nodes:[],edges:[]},stats:{}};
  recipe.generate(EMPTY,{family:ID,now:0});
  assert.equal(recipe.RECIPE_VERSION,5);
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(EMPTY,{family:f,now:0}).genome)),'d27fb424f09b9362');
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(EMPTY,{family:f,now:0,version:4}).genome)),'d27fb424f09b9362');
  assert.equal(h(recipe.GRADUATED.map(f=>recipe.generate(EMPTY,{family:f,now:0,version:4}).genome)),'c447ad761dabd75a');
  assert.equal(h(recipe.GRADUATED.map(f=>recipe.generate(EMPTY,{family:f,now:0,version:3}).genome)),'25d6c4e4a07ef49d');
  const q=project('scores',{modules:40,classes:30,tests:10});assert.deepEqual(recipe.generate(q,{now:0}).familyScores,recipe.familyScores(recipe.traitsOf(q),recipe.generate(q,{now:0}).projectSeed,0));
});
test('The preview\'s catalogue covers every value its generator draws; the palette is a believable aurora and a storm stays red',()=>{
  const cat=catalog.PREVIEWS[ID];assert(cat&&cat.preview);assert.equal(catalog.FAMILIES[ID],undefined,'not a base for declarative packs');
  const hue=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;
    const x=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return (x*60+360)%360;};
  const dh=(a,b)=>{const d=Math.abs(a-b)%360;return Math.min(d,360-d);};
  const spacing=[];
  for(let seed=1;seed<=200;seed++){
    const r=recipe.generate(project(`cat-${seed}`,{modules:seed*3,classes:seed%7,tests:seed%5,cross:seed%11,ui:seed%4,groups:1+seed%9}),{family:ID,seed:seed*7919,variant:seed%3,now:0});
    for(const [p,spec] of Object.entries(cat.parameters)){if(p.startsWith('technique.')&&p!=='technique.finish')continue;const v=catalog.get(r.genome,p);
      assert(v!==undefined,`${p} missing`);assert(catalog.accepts(spec,v),`${p}=${JSON.stringify(v)}`);}
    assert.deepEqual(Object.values(r.genome.effects),cat.effects);assert.deepEqual(r.genome.ambient.unlocks,cat.unlocks);
    const P=r.genome.palette,h0=hue(P.primary),hf=hue(P.secondary),hw=hue(P.warning);
    assert(h0>=118&&h0<=186,`seed ${seed}: the curtains' foot is green to teal (${h0.toFixed(0)})`);
    assert(hf>=262&&hf<=336,`seed ${seed}: the fringe is violet to magenta (${hf.toFixed(0)})`);
    assert(dh(hw,hue(P.accent))>=35,`seed ${seed}: a storm ${P.warning} stays away from the warm light ${P.accent}`);
    assert(hw>=340||hw<=8,`seed ${seed}: a storm is red (${hw.toFixed(0)})`);
    spacing.push([seed*3,r.genome.aurora.spacing]);}
  // the rays' spacing follows the project's size at generation: a large project's rays stand closer
  const at=n=>spacing.filter(([m])=>Math.abs(m-n)<10).map(x=>x[1]);assert(Math.max(...at(450))<Math.min(...at(30)));
  const r=recipe.generate(project('tune'),{family:ID,now:0}),spec=recipe.tunable(r);
  assert.deepEqual(Object.keys(spec).sort(),Object.keys(cat.parameters).sort());
  // the standard digital-life group (its grammar: public/worlds/life/aurora.js)
  assert.deepEqual(Object.keys(spec).filter(k=>k.startsWith('life.')).sort(),Object.keys(catalog.LIFE).sort());
  const tuned=recipe.update(r,{type:'tune',values:{'camera.personality':'wide','aurora.folds':1.4}},project('tune'),0);
  assert.deepEqual([tuned.genome.camera.personality,tuned.genome.aurora.folds],['wide',1.4]);
  assert.throws(()=>recipe.update(r,{type:'tune',values:{'land.layers':9}},project('tune'),0),/layers/);
});
// A model with three subsystems, files in creation order, symbols, and dependencies inside and across them.
async function network({extra=false,links=[['a2','b0'],['b1','c0'],['a0','a1'],['c1','b0']]}={}){
  const {createModel}=await load('model');const m=createModel();
  const g=(id,q,r)=>({id,type:'group',q,r,order:0,counts:{}});
  const mod=(id,group)=>({id,type:'module',group,dir:group,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A',0,0),g('B',7,0),g('C',0,7)];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<(p==='a'?7:3);k++)nodes.push(mod(`${p}${k}`,G));
  for(let k=0;k<4;k++)nodes.push({id:`s${k}`,type:'function',parent:'a0',slot:k});
  m.reset({nodes,edges:links.map(([a,b])=>({a,b,kind:'depends',cross:a[0]!==b[0]}))},T0);
  if(extra)m.applyDelta({add:[mod('a7','A'),{id:'G4',type:'group'},mod('d0','G4')],remove:[],addEdges:[],removeEdges:[]},T0+60000,T0+65000);
  return m;
}
test('The sky is a pure function of the model and the time: curtains by order of birth, rays at fixed slots, an older curtain never moves',async()=>{
  const L=await load('aurora-layout');const cfg=L.layoutConfig(recipe.generate(project('layout'),{family:ID,now:0}));
  const a=L.curtainsAt(L.prepare(await network()),T0+1000,cfg),b=L.curtainsAt(L.prepare(await network()),T0+1000,cfg);
  assert.deepEqual(a,b,'same model, same moment: the same sky');
  assert.deepEqual(a.map(c=>c.id),['A','B','C']);assert.equal(a[0].az,0,'the first curtain in the middle');
  assert(a[1].az>0&&a[2].az<0,'then right, then left');
  const A=a[0];assert.deepEqual(A.files.map(f=>f.id),['a0','a1','a2','a3','a4','a5','a6']);
  assert.deepEqual(A.files.map(f=>Math.round(f.s/cfg.sp)),[0,1,-1,2,-2,3,-3],'alternately right and left of the first ray');
  // a symbol-rich file is a taller ray; every ray within the curtain
  assert(A.files[0].h>A.files[1].h&&A.files[0].n===4);for(const f of A.files)assert(Math.abs(f.s)<A.len);
  // a new file joins its curtain at the next slot and a new subsystem is a new curtain: every earlier ray keeps its slot,
  // every earlier curtain its place; the curtain grows longer with its files
  const grown=L.prepare(await network({extra:true})),before=L.curtainsAt(grown,T0+59000,cfg),after=L.curtainsAt(grown,T0+90000,cfg);
  const slot=(R,id)=>{for(const c of R)for(const f of c.files)if(f.id===id)return [c.id,Math.round(f.s/cfg.sp)];return null;};
  for(const id of ['a0','a6','b0','b2','c1'])assert.deepEqual(slot(after,id),slot(before,id));
  assert.deepEqual(slot(after,'a7'),['A',4]);assert.equal(slot(before,'a7'),null);
  for(const k of [0,1,2])for(const p of ['x','z','az','tilt','alt','H','seed'])assert.equal(after[k][p],before[k][p],`${after[k].id}.${p}`);
  assert(after[0].len>before[0].len,'the curtain is longer with its eighth file');assert.equal(after.length,4);assert.equal(after[3].id,'G4');
  // a new ray rises over EASE; a removed one fades
  const mid=L.curtainsAt(grown,T0+60000+L.EASE*.4,cfg);const f7=mid[0].files.find(f=>f.id==='a7');assert(f7&&f7.alive>0&&f7.alive<1,'a7 still rising');
  const m=await network();m.applyDelta({add:[],remove:['c2'],addEdges:[],removeEdges:[]},T0+30000,T0+31000);
  const P=L.prepare(m);assert(L.curtainsAt(P,T0+29000,cfg)[2].files.some(f=>f.id==='c2'));assert(!L.curtainsAt(P,T0+40000,cfg)[2].files.some(f=>f.id==='c2'));
  // the folds: the JS twin is continuous, eases toward the ends and bows the trace away from the shore at them
  const fA=[48,30,6];assert(Math.abs(L.foldAt(0,0,0,.3,10,fA,[],1)-L.foldAt(.001,0,0,.3,10,fA,[],1))<.01);
  assert(Math.abs(L.foldAt(600,1,0,.3,10,fA,[],1)-600*600*L.BOW)<=.4*(48+30+6)+1e-9,'the folds ease toward the ends');
});
test('The mapping: symbols raise a ray, a failure is a storm for as long as it lasts, a pass leaves a validated share',async()=>{
  const L=await load('aurora-layout');const cfg=L.layoutConfig(recipe.generate(project('mapping'),{family:ID,now:0})),m=await network();
  m.applyDelta({add:Array.from({length:12},(_,k)=>({id:`t${k}`,type:'function',parent:'b1',slot:k})),remove:[],addEdges:[],removeEdges:[]},T0+20000,T0+21000);
  m.cue({type:'validation.test.failed',detail:{fileIds:['c0']}},T0+40000);m.cue({type:'validation.test.passed',detail:{fileIds:['c0']}},T0+70000);
  const P=L.prepare(m),f=(t,id)=>{for(const c of L.curtainsAt(P,t,cfg))for(const x of c.files)if(x.id===id)return x;return null;};
  assert(f(T0+60000,'b1').h>f(T0+10000,'b1').h*1.3,'twelve symbols raise b1\'s ray');
  assert.equal(f(T0+30000,'c0').storm,0);assert(f(T0+55000,'c0').storm>.99,'storm-red between the failure and the pass');
  assert(f(T0+70000+L.STORM_OUT+100,'c0').storm===0,'clear after the pass');assert(f(T0+80000,'c0').valid>.99&&f(T0+55000,'c0').valid===0,'validated after the pass');
});
test('A replay\'s sky is its whole recorded history: rebuilt from the recorded windows, as when it is played from the start',async()=>{
  const L=await load('aurora-layout'),{createModel}=await load('model');const cfg=L.layoutConfig(recipe.generate(project('hist'),{family:ID,now:0}));
  const mod=(id,group)=>({id,type:'module',group,dir:group,state:'draft',counts:{function:2}});
  const entries=[{seq:0,start:T0,end:T0+5000,graph:{add:[{id:'G',type:'group'},mod('x0','G')],remove:[],addEdges:[],removeEdges:[]},cues:[]},
    {seq:1,start:T0+5000,end:T0+10000,graph:{add:[{id:'H',type:'group'},mod('x1','H'),{id:'y0',type:'function',parent:'x1',slot:0}],remove:[],addEdges:[{a:'x1',b:'x0',kind:'depends'}],removeEdges:[]},
      cues:[{type:'symbol.created',ts:T0+7000,detail:{symbolId:'y0',fileId:'x1'}}]},
    {seq:2,start:T0+10000,end:T0+15000,graph:{add:[mod('x2','G')],remove:[],addEdges:[],removeEdges:[]},cues:[{type:'validation.test.failed',ts:T0+12000,detail:{fileIds:['x2']}}]}];
  const hm=L.historyFrom(entries,T0+14000);
  const p=createModel({speed:1,tempo:92});p.reset({nodes:entries[0].graph.add,edges:[]},T0);
  for(const e of entries){p.applyDelta(e.graph,e.start,e.end);for(const c of e.cues)if(c.ts<T0+14000)p.cue(c,c.ts);}
  assert.deepEqual(L.curtainsAt(L.prepare(hm),T0+14000,cfg),L.curtainsAt(L.prepare(p),T0+14000,cfg),'the same sky as when played from the start');
});
// A headless world on a model (as the host drives it), for the tests below.
async function headless(model,{name='headless',director=null,agents=null,quality=0,musicAt=null,family=null}={}){
  const {THREE}=await load('core'),{createFamily}=await load('aurora'),{createDirector}=await load('director'),{createAgents}=await load('agents');
  const r=family||recipe.generate(project(name),{family:ID,now:0}),ag=agents||createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,16/9,.1,4000);
  const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:director||createDirector({recipe:r}),agents:ag,pipeline:{size:[640,360]},...(musicAt?{musicAt}:{})});w.rebuild();
  const frame=(t,q=quality,extra={})=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',
    unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:ag.list(t),overrides:{},quality:q,music:null,...extra});
  const place=goal=>{const e=goal.elevation,a=goal.azimuth;camera.position.set(goal.target.x+Math.cos(a)*Math.cos(e)*goal.distance,goal.target.y+Math.sin(e)*goal.distance,goal.target.z+Math.sin(a)*Math.cos(e)*goal.distance);camera.lookAt(goal.target);};
  return {w,scene,frame,r,camera,at:(t,q,extra)=>{const f=frame(t,q,extra);w.update(f);place(w.cameraGoal(f));w.afterCamera(f);return f;}};
}
function snapshot(scene){
  let U=null,fx=null,rib=null;scene.traverse(o=>{if(o.userData?.aurora)U=o.userData.aurora;if(o.isPoints&&o.geometry.attributes.fS)fx=o;if(o.geometry?.attributes?.rA)rib=o;});
  const v=x=>x?.toArray?x.toArray():Array.isArray(x)?x.map(y=>y.toArray?y.toArray():y):x;
  const n=fx.geometry.drawRange.count,nr=rib.geometry.instanceCount;
  return {u:Object.fromEntries(['uA','uRip','uE','uEF','uNE','uSurge','uEighth','uFast','uFlash','uAurL','uNG','uGlow','uWin'].map(k=>[k,v(U[k].value)])),
    cp:[...U.uCP.value.image.data],ra:[...U.uRay.value.image.data],rb:[...U.uRayB.value.image.data],
    fx:[...fx.geometry.attributes.position.array.slice(0,n*3),...fx.geometry.attributes.fC.array.slice(0,n*4)],rib:[...rib.geometry.attributes.rA.array.slice(0,nr*4)]};
}
test('The world runs headless: its state at a moment is the same whatever was drawn before, and failure never looks like success',async()=>{
  const {createDirector}=await load('director'),{createAgents}=await load('agents');
  const make=async()=>{const model=await network();model.cue({type:'validation.test.failed',detail:{fileIds:['a0','a1']}},T0+2000);
    const r=recipe.generate(project('world'),{family:ID,now:0}),director=createDirector({recipe:r});
    const agents=createAgents();agents.record({type:'agent.state',ts:T0+500,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:'b1'},detail:{state:'tool',activity:'editing',provider:'cursor'}});
    return headless(model,{name:'world',agents,director});};
  const A=await make(),B=await make();
  for(const t of [T0+9000,T0+1200,T0+4000])A.at(t);B.at(T0+4000);
  assert.deepEqual(snapshot(A.scene),snapshot(B.scene),'the state at a moment does not depend on the path to it');
  const s=A.w.stats();assert.equal(s.curtains,3);assert.equal(s.rays,13);assert(s.arcs>=2,'the cross-subsystem dependencies are field lines');assert.equal(s.history,false);
  assert.equal(A.w.status(A.frame(T0+4000)),'2 rays in a storm');assert(s.storm>.5,`the storm is on (${s.storm})`);
  // failure: the words say so and never borrow success's
  const fail=A.w.describe({intent:'validation.failed',subject:{fileIds:['a0','a1']},detail:{}},A.frame(T0+4000)),pass=A.w.describe({intent:'validation.passed',subject:{fileIds:['a0']},detail:{}},A.frame(T0+4000));
  assert.match(fail.text,/storm-red/);assert.notEqual(fail.color,pass.color);assert.doesNotMatch(fail.text,/corona|pulsat|pass|lantern/i);
  // the storm's rays: the stressed files' columns carry it in their curtain's ray texture, no other curtain's
  const snap=snapshot(A.scene),RAYW=512,storm=k=>{let m=0;for(let j=0;j<RAYW;j++)m=Math.max(m,snap.ra[(k*RAYW+j)*4+2]);return m;};
  assert(storm(0)>128&&storm(1)===0&&storm(2)===0,'the storm lies on curtain A alone');
  // a passing run's pulsating patches cover the curtain of its files
  A.w.effect({effect:'pulsate',intent:'validation.passed',tier:2,scale:1,at:T0+4200,subject:{fileIds:['b0','b1']},id:7},A.frame(T0+4200));A.at(T0+5000);
  const u=snapshot(A.scene).u;assert(u.uNE>=1);const k=u.uE.findIndex(e=>e[0]===0);assert(k>=0&&u.uE[k][1]===1,'the patches sweep curtain B');
  // Words are generic or public names: no file id ever appears.
  for(const intent of ['subsystem.created','module.created','structure.created','structure.removed','subsystem.connected','validation.recovered','refactor.validated','milestone.achieved','repository.checkpoint','world.expanded','agent.collision']){
    const d=A.w.describe({intent,subject:{groupId:'A',fileId:'a2',targetId:'b0',fileIds:['a2']},detail:{providers:['claude-code','cursor'],kinds:['recovery'],chapter:2}},A.frame(T0+4000));
    assert(d&&!/\b[abc]\d\b/.test(`${d.text} ${d.sub||''} ${d.banner||''}`),intent);}
  for(const l of A.w.subsystemLabels(A.frame(T0+4000)))assert(!/\b[abc]\d\b/.test(`${l.text} ${l.sub}`));
  const peek=A.w.inspect('a0',A.frame(T0+4000));assert(peek&&!/\ba0\b/.test(`${peek.text} ${peek.sub}`)&&/A ray of Name A/.test(peek.text));
  // Each CAST provider its own colour; the editing agent is placed for its chip
  const colors=['claude-code','cursor','codex','grok','qwen','kimi'].map(p=>A.w.agentColor({provider:p}));assert.equal(new Set(colors).size,6);
  assert(A.w.agentPosition('x'),'the editing agent has a position for its chip');
  A.w.dispose();B.w.dispose();
});
test('The corona gathers on a recovery and settles; after a seek no transient survives',async()=>{
  const W=await headless(await network(),{name:'corona'});W.at(T0+3000);assert.equal(W.w.stats().corona,0);
  W.w.effect({effect:'corona',intent:'validation.recovered',tier:2,scale:1,at:T0+3100,subject:{fileIds:['a0']}},W.frame(T0+3100));
  W.at(T0+6000);assert(W.w.stats().corona>.9,'the corona overhead');const goal=W.w.cameraGoal(W.frame(T0+6000));assert(goal.elevation<-.5,'the camera looks up toward it');
  W.at(T0+3100+20000);assert.equal(W.w.stats().corona,0,'then it settles');
  W.w.effect({effect:'corona',intent:'validation.recovered',tier:2,scale:1,at:T0+30000,subject:{fileIds:['a0']}},W.frame(T0+30000));W.w.onPrime();W.at(T0+31000);assert.equal(W.w.stats().corona,0);
  W.w.dispose();
});
test('No dependencies, an empty project, every quality: nothing throws; the curtains\' geometry follows the quality table',async()=>{
  const {QUALITY}=await load('aurora'),{createModel}=await load('model');
  assert.equal(QUALITY.length,4);for(let q=1;q<4;q++){assert(QUALITY[q].cols<=QUALITY[q-1].cols&&QUALITY[q].rows<QUALITY[q-1].rows&&QUALITY[q].refl>=QUALITY[q-1].refl);}
  const empty=createModel();empty.reset({nodes:[],edges:[]},T0);const E=await headless(empty,{name:'empty'});
  for(const t of [T0,T0+1000,T0+60000])E.at(t);assert.equal(E.w.stats().curtains,0);assert.deepEqual(E.w.subsystemLabels(E.frame(T0+60000)),[]);
  assert.equal(E.w.pick(0,0,E.camera,E.frame(T0+60000)),null);E.w.dispose();
  const W=await headless(await network({links:[]}),{name:'nolinks'});const verts=[];
  for(let q=0;q<4;q++){W.at(T0+5000+q*100,q);verts.push(W.w.stats().vertices);}
  for(let q=1;q<4;q++)assert(verts[q]<verts[q-1],`quality ${q} draws fewer vertices (${verts.join(', ')})`);
  assert.equal(W.w.stats().arcs,0);W.w.dispose();
});
test('More than 24 subsystems: every curtain keeps a place of its own across the sky, and is labelled apart',async()=>{
  const L=await load('aurora-layout'),{createModel}=await load('model');
  const m=createModel(),nodes=[];
  for(let k=0;k<49;k++){nodes.push({id:`G${k}`,type:'group',order:k,counts:{}});for(let j=0;j<2;j++)nodes.push({id:`G${k}m${j}`,type:'module',group:`G${k}`,dir:`G${k}`,state:'committed',counts:{function:3}});}
  m.reset({nodes,edges:[]},T0);
  const cfg=L.layoutConfig(recipe.generate(project('wide',{modules:98,groups:49}),{family:ID,now:0})),cs=L.curtainsAt(L.prepare(m),T0+1000,cfg);
  assert.equal(cs.length,49);assert.equal(new Set(cs.map(c=>`${c.x.toFixed(2)},${c.z.toFixed(2)}`)).size,49,'no two curtains at the same place');
  const W=await headless(m,{name:'wide'});W.at(T0+6000);assert.equal(W.w.stats().curtains,48,'at most 48 curtains are drawn');
  const labels=W.w.subsystemLabels(W.frame(T0+6000));assert.equal(new Set(labels.map(l=>l.text)).size,48);
  assert.equal(new Set(labels.map(l=>l.position.x.toFixed(3)+','+l.position.z.toFixed(3))).size,48,'no two labels at the same place');W.w.dispose();
});
test('The earned breakup is rare: the director\'s token and a four-minute gap; otherwise a glow; lanterns stay, also after a seek',async()=>{
  const {THREE}=await load('core');const {createFamily}=await load('aurora');const {createAgents}=await load('agents');
  const r=recipe.generate(project('breakup'),{family:ID,now:0}),model=await network(),lasting=[];
  const director={lasting:()=>lasting,attentionAt:()=>null,activityAt:()=>0,unlockedAt:()=>[],commands:[]};
  const w=createFamily({scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(36,16/9,.1,4000),model,recipe:r,speed:()=>1,name:id=>id,director,agents:createAgents(),pipeline:{size:[640,360]}});
  const frame=t=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:0,barPhase:0,mood:{tempo:96},energy:0,activity:0,unlocks:[],agents:[],overrides:{},quality:0,music:null});
  w.update(frame(T0+1000));
  const milestone=(at,tier)=>{const l=lasting[0]||{type:'milestone.achieved',subject:{fileIds:['a0']},first:at,count:0,times:[]};if(!lasting.length)lasting.push(l);l.count++;l.times.push(at);
    w.effect({effect:'breakup',intent:'milestone.achieved',tier,scale:1,at,subject:{fileIds:['a0']},detail:{kinds:['recovery']}},frame(at));w.update(frame(at+100));return w.stats().lastBreakup;};
  assert.equal(milestone(T0+10000,3),'breakup','the first verified milestone with a token: an auroral breakup');
  assert.equal(milestone(T0+70000,3),'local','one minute later: a glow on its curtain');
  assert.equal(milestone(T0+10000+240000,2),'local','without the token (tier 2): a glow');
  assert.equal(milestone(T0+10000+250000,3),'local','ten seconds after a milestone that held the gap: a glow');
  assert.equal(milestone(T0+10000+500000,3),'breakup','four minutes after it, with the token: a breakup again');
  w.update(frame(T0+10000+500000+4000));assert(w.stats().breakup>.5,'the sky erupts');
  lasting.push({type:'refactor.validated',subject:{fileIds:['b0']},first:T0+20000,count:1,times:[T0+20000]});w.update(frame(T0+10000+500200));
  assert.equal(w.stats().lanterns,2,'a lantern for the milestone, a candle for the refactor, from the director\'s record');
  w.onPrime();w.update(frame(T0+10000+500300));assert.equal(w.stats().lastBreakup,null,'after a seek no transient survives');assert.equal(w.stats().lanterns,2,'the lanterns do');
  w.dispose();
});
test('Agents: a subagent is tethered to its parent; two agents on one file are two wisps meeting at its ray',async()=>{
  const {createAgents}=await load('agents');const ag=createAgents();
  ag.record({type:'agent.state',ts:T0+500,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'p',voice:0,fileId:'a1'},detail:{state:'tool',activity:'editing',provider:'claude-code'}});
  ag.record({type:'agent.state',ts:T0+600,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'s',voice:0,fileId:'b1',parentAgentId:'p'},detail:{state:'tool',activity:'reading',provider:'claude-code',subagent:true}});
  const W=await headless(await network(),{name:'agents',agents:ag});W.at(T0+1500);const s=W.w.stats();
  assert.equal(s.tethers,1,'the subagent\'s filament to its parent');assert(W.w.agentPosition('p')&&W.w.agentPosition('s'));
  const before=snapshot(W.scene).fx.length;
  W.w.effect({effect:'field-line',intent:'agent.collision',tier:1,scale:1,at:T0+1600,subject:{fileId:'a1'},detail:{providers:['claude-code','cursor']}},W.frame(T0+1600));
  W.at(T0+2400);assert(snapshot(W.scene).fx.length>before,'the meeting draws its wisps');W.w.dispose();
});
test('A wisp\'s move begins where it is: a change that interrupts it (a 40 ms tool, then work) never makes it jump',async()=>{
  const {createAgents}=await load('agents');const ag=createAgents(),rec=(ts,state,fileId,activity)=>ag.record({type:'agent.state',ts,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'w',voice:2,fileId},detail:{state,activity,provider:'codex'}});
  rec(T0+500,'tool','a1','editing');rec(T0+540,'processing',null);rec(T0+3000,'tool','b1','editing');rec(T0+3040,'processing',null);rec(T0+4200,'tool','c1','editing');rec(T0+4240,'processing',null);
  const W=await headless(await network(),{name:'moves',agents:ag});let prev=null,worst=0;
  for(let t=T0+2600;t<=T0+9000;t+=50){W.at(t);const p=W.w.agentPosition('w');assert(p,`a position at ${t-T0}`);if(prev)worst=Math.max(worst,p.distanceTo(prev));prev=p.clone();}
  assert(worst<120,`the largest step in 50 ms is ${worst.toFixed(1)} units (a jump would cross the sky)`);W.w.dispose();
});
test('Field lines are long, gentle arcs, barely there at rest; they light behind a wisp that flies along them, then fade',async()=>{
  const {fieldLine}=await load('aurora-layout');
  for(const [a,b,ha,hb] of [[[0,235,-1300],[400,235,-1500],60,60],[[-900,220,-1100],[1200,250,-2800],40,120],[[0,240,-1000],[0,240,-1300],80,20]]){
    const P=fieldLine(a,b,ha,hb,24,[]),A=P[0],B=P.at(-1),L=Math.hypot(B[0]-A[0],B[1]-A[1],B[2]-A[2]);let rise=0;
    for(const p of P){const u=((p[0]-A[0])*(B[0]-A[0])+(p[1]-A[1])*(B[1]-A[1])+(p[2]-A[2])*(B[2]-A[2]))/(L*L),q=[0,1,2].map(i=>A[i]+(B[i]-A[i])*u);rise=Math.max(rise,Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]));}
    assert(rise<=.2*L+25,`an arc rises ${rise.toFixed(0)} over a span of ${L.toFixed(0)} (a loop would read as a circle)`);}
  // at rest (old links, no file firing): every field-line segment is a trace
  const alphas=(scene,width)=>{let rib=null;scene.traverse(o=>{if(o.geometry?.attributes?.rA)rib=o;});const n=rib.geometry.instanceCount,A=rib.geometry.attributes.rA.array,C=rib.geometry.attributes.rC.array,out=[];
    for(let k=0;k<n;k++)if(Math.abs(A[k*4+3]-width)<1e-6)out.push(C[k*4+3]);return out;};
  const R=await headless(await network(),{name:'lines'});R.at(T0+30000);
  assert(alphas(R.scene,8).every(a=>a<=.006),'field lines at rest are barely there');assert.equal(R.w.stats().wakes,0);R.w.dispose();
  // a wisp's move between two curtains a field line joins lights the line behind it, and the light fades
  const {createAgents}=await load('agents');const ag=createAgents(),rec=(ts,state,fileId,activity)=>ag.record({type:'agent.state',ts,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'w',voice:2,fileId},detail:{state,activity,provider:'codex'}});
  rec(T0+500,'tool','a2','editing');rec(T0+540,'processing',null);rec(T0+6000,'tool','b0','editing');rec(T0+6040,'processing',null);
  const W=await headless(await network(),{name:'lines',agents:ag});let lit=0,line=0;
  for(let t=T0+5000;t<=T0+16000;t+=250){W.at(t);const s=W.w.stats();if(s.fieldTravel)line++;if(s.wakes&&alphas(W.scene,6).some(a=>a>.01))lit++;}
  assert(line>0&&lit>line,`the wisp flew along the line (${line} samples) and its wake outlasted the flight (${lit})`);
  W.at(T0+30000);assert.equal(W.w.stats().wakes,0,'and faded');assert(alphas(W.scene,6).length===0);W.w.dispose();
});
test('The music, read per bar: the rays shimmer on the eighths the arrangement plays, a section\'s onset surges along the curtains',async()=>{
  // a stub clock: rhythm in odd bars, a new section from bar 20
  const bar=4*60000/96,calls=[];const musicAt=T=>{const b=Math.floor(T/bar);calls.push(b);return {rhythm:b%2?1:0,energy:.6,dynamics:.7,section:b>=20?'lift':'home'};};
  const W=await headless(await network(),{name:'music',musicAt});const music={energy:.5};
  const eighth=bar/8,inOdd=21*bar+eighth*1.1,inEven=22*bar+eighth*1.1;
  W.at(inOdd,0,{music});const a=snapshot(W.scene).u.uEighth;W.at(inEven,0,{music});const b=snapshot(W.scene).u.uEighth;
  assert(a>0&&b===0,`an eighth shimmers only where the arrangement plays rhythm (${a}, ${b})`);
  W.at(20*bar+1500,0,{music});assert(snapshot(W.scene).u.uSurge[1]>0,'the section\'s onset surges');
  W.at(20*bar+9000,0,{music});assert.equal(snapshot(W.scene).u.uSurge[1],0,'and passes');
  const rip=snapshot(W.scene).u.uRip;assert(rip.some(r=>r[1]>0),'the bars send ripples along the curtains');
  // without the clock: none of it
  const N=await headless(await network(),{name:'music'});N.at(inOdd);const u=snapshot(N.scene).u;assert.equal(u.uEighth,0);assert.equal(u.uSurge[1],0);assert(u.uRip.every(r=>r[1]===0));
  W.w.dispose();N.w.dispose();
});
test('Idle is never frozen: the folds, the stars and the meteors move with the moment while nothing else changes',async()=>{
  const L=await load('aurora-layout');
  const m=L.idleMeteors(7,1000),again=L.idleMeteors(7,1000);assert.deepEqual(m,again,'meteors are a pure function of the view time');
  let seen=0;for(let tv=0;tv<1900;tv+=1)seen+=L.idleMeteors(7,tv,1).length?1:0;assert(seen>20&&seen<400,`an occasional meteor (${seen} s of 1900 with one)`);
  const W=await headless(await network(),{name:'idle'});W.at(T0+60000);const a=snapshot(W.scene),sa=JSON.stringify(W.w.stats());W.at(T0+75000);const b=snapshot(W.scene);
  assert.notDeepEqual(a.cp,b.cp,'the curtains drift and fold');
  const sb=JSON.stringify(W.w.stats());const pick=x=>{const o=JSON.parse(x);return [o.curtains,o.rays,o.arcs,o.lanterns,o.breakups];};assert.deepEqual(pick(sa),pick(sb),'no new structure while idle');
  W.w.dispose();
});
test('The player and the receiver know the preview: the host loads it and hands it a replay\'s history, /api/catalog lists it',async t=>{
  const host=fs.readFileSync(path.join(__dirname,'../public/worlds/host.js'),'utf8');
  assert.match(host,/'aurora':'\.\/aurora\.js'/);assert.match(host,/onHistory\(recorded,t\)/);
  assert.match(fs.readFileSync(path.join(__dirname,'../public/ui/workspaces/visual.js'),'utf8'),/id:'aurora'/);
  assert.match(fs.readFileSync(path.join(__dirname,'../public/web-demo/demo.js'),'utf8'),/'aurora':'Aurora'/);
  const svc=await startService(t,{port:0,dataDir:tempDir(t,'cr-aurora-'),quiet:true});
  const c=await (await fetch(`http://127.0.0.1:${svc.port}/api/catalog`)).json();
  assert.deepEqual(Object.keys(c.families),recipe.FAMILIES);
  assert.equal(c.previews[ID].preview,true);assert.equal(c.previews[ID].name,'Aurora (preview)');assert(c.previews[ID].parameters['aurora.folds']);
});

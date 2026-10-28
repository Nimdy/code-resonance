'use strict';
// The pure parts of the generative worlds (public/worlds): the world model, the effect director and agent presences.
// Rendering is qualified in a real browser (qualification/visual/worlds.qual.js); these tests pin the meaning.
const test=require('node:test'),assert=require('node:assert/strict');
const load=name=>import(`../public/worlds/${name}.js`);
const recipe=require('../engine/recipe');
const T0=1750000000000;
const group=(id,extra={})=>({id,type:'group',order:0,q:0,r:0,angle:1,counts:{},...extra});
const mod=(id,g,extra={})=>({id,type:'module',group:g,dir:'d',q:1,r:0,state:'draft',counts:{function:1},...extra});
const sym=(id,parent,slot=0)=>({id,type:'function',parent,slot});
const intent=(type,ts,extra={})=>({v:1,id:`${type}-${ts}`,type,ts,tier:2,magnitude:.6,evidence:'derived',subject:{},detail:{},...extra});
const stellar=recipe.generate({projectId:'x',graph:{nodes:[],edges:[]},stats:{}},{family:'stellar-forge',now:0});
const biosphere=recipe.generate({projectId:'x',graph:{nodes:[],edges:[]},stats:{}},{family:'fractal-biosphere',now:0});
test('A new subsystem appears from its data: a district, a module on the step grid, symbols at their own cues',async()=>{
  const {createModel}=await load('model');const m=createModel({tempo:120});
  m.reset({nodes:[],edges:[]},T0);
  m.applyDelta({add:[group('g1'),mod('m1','g1'),sym('s1','m1'),sym('s2','m1',1)],remove:[],addEdges:[],removeEdges:[]},T0,T0+5000);
  const d=m.districts.get('g1'),x=m.modules.get('m1');
  assert(d&&x);assert.equal(m.districtBorn(d),x.born);
  assert(x.born>=T0&&x.born<T0+1000&&x.born%125===0,'module born early in the window, on the 16th-note grid at 120 bpm');
  assert.equal(m.alive(m.symbols.get('s1'),T0+2000),false,'a symbol waits for its own cue');
  m.cue({type:'symbol.created',detail:{symbolId:'s1',fileId:'m1'}},T0+2100);
  assert.equal(m.alive(m.symbols.get('s1'),T0+2300),true);assert.equal(m.alive(m.symbols.get('s2'),T0+4900),false);
  assert.equal(m.alive(m.symbols.get('s2'),T0+5000),true,'without a cue it rises at the window end');
});
test('Material state follows validation cues for exactly the modules they cover',async()=>{
  const {createModel}=await load('model');const m=createModel();
  m.reset({nodes:[group('g'),mod('a','g'),mod('b','g'),mod('c','g',{state:'committed'})],edges:[]},T0);
  m.cue({type:'validation.test.failed',detail:{fileIds:['a','b']}},T0+1000);
  assert.deepEqual(['a','b','c'].map(id=>m.stateAt(m.modules.get(id),T0+2000)),['stressed','stressed','committed']);
  m.cue({type:'validation.test.passed',detail:{fileIds:['a','b']}},T0+3000);
  assert.deepEqual(['a','b'].map(id=>m.stateAt(m.modules.get(id),T0+4000)),['validated','validated']);
  assert.equal(m.stateAt(m.modules.get('a'),T0+1500),'stressed','state history is kept, so a replay at any moment is exact');
});
test('The director never shows success for a failure, and the same intents always give the same effects',async()=>{
  const {createDirector}=await load('director');
  const run=()=>{const d=createDirector({recipe:stellar});return [intent('validation.failed',T0,{evidence:'verified'}),intent('validation.recovered',T0+9000,{tier:3,evidence:'verified'})].map(i=>d.process(i)?.effect);};
  assert.deepEqual(run(),['stellar-storm','calm-pulse']);assert.deepEqual(run(),run());
  const bio=createDirector({recipe:biosphere});
  assert.equal(bio.process(intent('validation.failed',T0,{evidence:'verified'})).effect,'blight','each family has its own vocabulary for the same intent');
  assert.equal(stellar.genome.effects['agent.collision'],undefined);
  assert.equal(createDirector({recipe:stellar}).process(intent('agent.collision',T0,{tier:2})).effect,'flare-bridge');
  assert.equal(createDirector({recipe:biosphere}).process(intent('agent.collision',T0,{tier:2})).effect,'mycelium-bridge');
  const cathedral=recipe.generate({projectId:'x',graph:{nodes:[],edges:[]},stats:{}},{family:'machine-cathedral',now:0});
  assert.equal(createDirector({recipe:cathedral}).process(intent('agent.collision',T0,{tier:2})).effect,'lock-mechanism');
});
test('Cathedral collision callout uses catalog names and does not throw',async()=>{
  const {THREE}=await import('../public/worlds/core.js');
  const {createFamily}=await load('cathedral');
  const {createModel}=await load('model');
  const r=recipe.generate({projectId:'x',graph:{nodes:[],edges:[]},stats:{}},{family:'machine-cathedral',now:0});
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,16/9,.1,4000),model=createModel();
  const world=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>id,director:{lasting:()=>[],attentionAt:()=>null},pipeline:{size:[64,64]}});
  let d;
  try{d=world.describe({intent:'agent.collision',detail:{providers:['claude-code','cursor']}});}
  finally{world.dispose();}
  assert.equal(d.text,'Two agents meet in the nave');
  assert.equal(d.sub,'Claude · Cursor');
});
test('An uncatalogued agent is "Agent" on chips and in every family\'s collision callout',async()=>{
  const {THREE}=await import('../public/worlds/core.js');
  const {createModel}=await load('model');
  for(const [file,family] of [['cathedral','machine-cathedral'],['biosphere','biosphere'],['stellar','stellar-forge']]){
    const {createFamily}=await load(file);
    const r=recipe.generate({projectId:'x',graph:{nodes:[],edges:[]},stats:{}},{family,now:0});
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,16/9,.1,4000),model=createModel();
    const world=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>id,director:{lasting:()=>[],attentionAt:()=>null,commands:[]},pipeline:{size:[64,64]},agents:{presence:()=>null}});
    let d;
    try{d=world.describe({intent:'agent.collision',detail:{providers:['claude-code','acme-client-portal']}});}
    finally{world.dispose();}
    assert.equal(d.sub,'Claude · Agent',file);
    assert(!/acme|client|portal/i.test(JSON.stringify(d)),file);
  }
  const {createAgents}=await load('agents');const a=createAgents();
  a.record({type:'agent.state',ts:T0,subject:{agentId:'U',voice:6},detail:{state:'connected',provider:'acme-client-portal'}});
  a.record({type:'agent.state',ts:T0,subject:{agentId:'V',voice:7},detail:{state:'connected',provider:'external-agent',subagent:true}});
  assert.equal(a.name(a.presence('U',T0+1)),'Agent');
  assert.equal(a.name(a.presence('V',T0+1)),'Agent · subagent');
});
test('Spectacle is rare: milestones spend tokens, rare effects need a long gap, routine bursts coalesce',async()=>{
  const {createDirector}=await load('director');const d=createDirector({recipe:stellar});
  const tiers=[0,1,2,3].map(k=>d.process(intent('milestone.achieved',T0+k*1000,{id:`m${k}`,tier:3,evidence:'verified',subject:{fileIds:[`f${k}`]}})).tier);
  assert.deepEqual(tiers,[3,3,3,2],'a fourth milestone in four seconds plays at structural scale');
  assert.equal(d.process(intent('milestone.achieved',T0+300000,{id:'later',tier:4,evidence:'verified'})).tier,4,'after tokens regenerate a rare event may be spectacular');
  assert.equal(d.process(intent('milestone.achieved',T0+600000,{id:'soon',tier:4,evidence:'verified'})).tier,3,'but not twice within ten minutes');
  const e=createDirector({recipe:stellar});
  const first=e.process(intent('structure.created',T0,{id:'a',tier:1,subject:{fileId:'f'}}));
  assert.equal(e.process(intent('structure.created',T0+800,{id:'b',tier:1,subject:{fileId:'f'}})),null,'a burst of edits in one file is one gesture');
  assert.equal(first.count,2);
  const quiet=createDirector({recipe:stellar,intensity:0});
  assert.equal(quiet.process(intent('structure.created',T0,{tier:1,subject:{fileId:'f'}})),null,'intensity 0 keeps only lasting transformations');
});
test('Idle is quiet, not dead: activity decays without events and no effect is ever generated by time alone',async()=>{
  const {createDirector}=await load('director');const d=createDirector({recipe:stellar});
  d.process(intent('subsystem.created',T0,{tier:2}));
  assert.equal(d.phaseAt(T0+1000),'active');assert.equal(d.phaseAt(T0+120000),'idle');
  const before=d.commands.length;for(let t=T0;t<T0+600000;t+=1000){d.activityAt(t);d.phaseAt(t);d.unlockedAt(t);}
  assert.equal(d.commands.length,before,'querying time never creates effects');
  // A verified milestone permanently unlocks the next ambient layer (lasting change); an observed one cannot.
  d.process(intent('milestone.achieved',T0+200000,{id:'m',tier:3,evidence:'verified'}));
  assert.equal(d.unlockedAt(T0+210000)[0].level,1);assert.equal(d.unlockedAt(T0+199000)[0].level,0);
  const e=createDirector({recipe:stellar});e.process(intent('milestone.achieved',T0,{tier:3,evidence:'observed'}));assert.equal(e.unlockedAt(T0+60000)[0].level,0);
});
test('Agent presences follow observed lifecycles and never linger or claim work after silence',async()=>{
  const {createAgents}=await load('agents');const a=createAgents();
  const st=(ts,state,activity=null,fileId=null)=>a.record({type:'agent.state',ts,subject:{agentId:'A',voice:2,...(fileId?{fileId}:{})},detail:{state,activity,provider:'claude-code'}});
  st(T0,'connected');st(T0+1000,'processing');st(T0+2000,'tool','reading','m1');
  const reading=a.presence('A',T0+2500);assert.deepEqual([reading.display,reading.label,reading.fileId],['tool','reading','m1']);
  assert.equal(a.presence('A',T0+2000+200000).display,'unknown','three silent minutes in a tool: status unknown, not working');
  st(T0+5000,'waiting');assert.equal(a.presence('A',T0+6000).label,'waiting for the next prompt');assert.equal(a.presence('A',T0+5000+130000).display,'dormant');
  st(T0+9000,'disconnected');assert(a.presence('A',T0+10000).alpha<1);assert.equal(a.presence('A',T0+13000),null,'a disconnected agent departs');
  assert.equal(a.name(reading),'Claude');
  a.record({type:'agent.state',ts:T0+400,subject:{agentId:'B',voice:0},detail:{state:'connected',provider:'claude-code',subagent:true}});
  assert.equal(a.name(a.presence('B',T0+500)),'Claude · subagent');
  const view=await import('../public/worlds/view.js');
  const packed=view.intent({type:'agent.state',id:'p:agent.state:0',ts:T0,subject:{agentId:'C',voice:1},detail:{state:'connected',provider:'claude-code'}});
  const chips=createAgents();chips.record(packed);
  assert.equal(chips.name(chips.presence('C',T0+1)),'Claude');
  // Labels are categories: nothing an agent wrote, read or ran appears in them.
  for(const p of [reading,a.presence('A',T0+6000)])assert(!/[\/\\.]/.test(p.label));
});
test('Generated subsystem names are stable and reveal nothing; user aliases replace them',async()=>{
  const {generatedName}=await import('../public/worlds/host.js').catch(()=>({}));
  if(!generatedName)return; // host.js imports three; Node can still evaluate it (no WebGL at import time).
  assert.equal(generatedName('0123456789abcd'),generatedName('0123456789abcd'));
  assert.notEqual(generatedName('0123456789abcd'),generatedName('fedcba98765432'));
  assert.match(generatedName('0123456789abcd'),/^[A-Z][a-z]+$/);
  // They live in labels.js (pure, so Monolith can name districts without three.js): the same names as before the move.
  const labels=await import('../public/worlds/labels.js');assert.equal(labels.generatedName,generatedName);
  const pinned={'0123456789abcd':'Hyaneth',fedcba98765432:'Lyeonon','404470372c88a3':'Deen','6d5cffc3e589d9':'Zaulel','80f461e0771437':'Laera','142d798637357e':'Vauos'};
  for(const [id,name] of Object.entries(pinned))assert.equal(generatedName(id),name,id);
});
test('The shader time origin is a real timestamp, never the replay\'s initial reset at time 0',async()=>{
  const {createModel}=await load('model');const m=createModel();
  m.reset({nodes:[],edges:[]},0);
  m.applyDelta({add:[group('g'),mod('m','g')],remove:[],addEdges:[],removeEdges:[]},T0,T0+5000);
  assert.equal(m.epoch,T0,'seconds since the origin stay small, so float32 shader time keeps its precision');
});

'use strict';
// The privacy-safe performance view (public/worlds/view.js): everything an executable visual pack can receive.
// Secrets planted in every field must never come out; unknown fields are dropped; client-chosen ids are replaced.
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const load=()=>import('../public/worlds/view.js');
const SECRETS=['src/secret/keys.ts','acme-client-portal','sk-ant-SECRET','/home/someone','session-1234-abcd','password=hunter2','raw source text'];
const planted=JSON.stringify(SECRETS);
const clean=out=>{const s=JSON.stringify(out);for(const x of SECRETS)assert(!s.includes(x),`leaked ${x} in ${s.slice(0,200)}`);return out;};
test('Graph nodes and edges keep only typed public fields; anything path-like is dropped',async()=>{
  const v=await load();
  const g=clean(v.graph({keyframe:true,nodes:[
    {id:'1db0005537a90f',type:'module',group:'80f461e0771437',dir:'738fa546b262a6',q:1,r:2,state:'draft',lang:'ts',counts:{function:2,'src/secret/keys.ts':9},weight:1,file:'src/secret/keys.ts',name:'acme-client-portal'},
    {id:'src/secret/keys.ts',type:'module',group:'g'},
    {id:'80f461e0771437',type:'group',order:1,q:0,r:0,angle:.5,counts:{class:1},label:'acme-client-portal',path:'/home/someone'},
    {id:'aa00000000000b',type:'function',parent:'1db0005537a90f',slot:2,name:'password=hunter2',text:'raw source text'},
    {id:'zz',type:'secretType',parent:'1db0005537a90f'}],
    edges:[{a:'1db0005537a90f',b:'80f461e0771437',kind:'depends',cross:true,via:'src/secret/keys.ts'},{a:'../x',b:'y',kind:'depends'},{a:'a',b:'b',kind:'telemetry'}]}));
  assert.equal(g.nodes.length,3);assert.deepEqual(Object.keys(g.nodes[0]).sort(),['counts','dir','group','id','lang','q','r','state','type','weight']);
  assert.deepEqual(g.nodes[0].counts,{function:2});assert.equal(g.edges.length,1);assert.deepEqual(Object.keys(g.edges[0]).sort(),['a','b','cross','kind']);
  const d=clean(v.graph({add:[{id:'aa00000000000c',type:'class',parent:'1db0005537a90f',slot:0}],remove:['1db0005537a90f','src/secret/keys.ts'],addEdges:[],removeEdges:[]}));
  assert.deepEqual(d.remove,['1db0005537a90f']);
});
test('Cues lose project, session, tool and any unknown detail; intents get opaque ids and whitelisted subject and detail',async()=>{
  const v=await load();
  const c=clean(v.cue({v:1,id:'cc-session-1234-abcd',type:'validation.test.failed',ts:1,projectId:'acme-client-portal',sessionId:'session-1234-abcd',category:'validation',weight:1,
    detail:{fileIds:['1db0005537a90f','src/secret/keys.ts'],tool:'Bash',command:'password=hunter2',source:'/home/someone',provider:'sk-ant-SECRET',errors:2}}));
  assert.deepEqual(Object.keys(c).sort(),['category','detail','ts','type','weight']);assert.deepEqual(c.detail,{fileIds:['1db0005537a90f'],errors:2});
  assert.equal(v.cue({type:'Not A Type',ts:1}),null);
  const i=clean(v.intent({v:1,id:'session-1234-abcd:agent.state:0',type:'agent.state',ts:5,ord:7,tier:0,magnitude:.2,evidence:'observed',
    subject:{agentId:'a1b2c3d4e5',voice:1,fileId:'1db0005537a90f',prompt:'raw source text'},detail:{state:'tool',activity:'editing',provider:'claude-code',thought:'password=hunter2',file:'src/secret/keys.ts'}}));
  assert.match(i.id,/^[0-9a-f]{16}$/);assert.notEqual(i.id,'session-1234-abcd:agent.state:0');
  assert.deepEqual(i.subject,{fileId:'1db0005537a90f',agentId:'a1b2c3d4e5',voice:1});assert.deepEqual(i.detail,{state:'tool',activity:'editing'});
  // The same id always maps to the same opaque id (deduplication across priming and playback still works).
  assert.equal(v.intent({id:'x:milestone.achieved:0',type:'milestone.achieved',ts:1}).id,v.intent({id:'x:milestone.achieved:0',type:'milestone.achieved',ts:2}).id);
  const m=clean(v.intent({id:'e:milestone.achieved:0',type:'milestone.achieved',ts:1,tier:3,detail:{kinds:['integration-validated','src/secret/keys.ts','raw source text']}}));
  assert.deepEqual(m.detail.kinds,['integration-validated']);
  const e=v.primeEntry({seq:3,intents:[{id:'q:module.created:0',type:'module.created',ts:9},{id:'q:module.created:1',type:'module.created',ts:9}]});
  assert.deepEqual(e.intents.map(x=>x.ord),[3*65536,3*65536+1]);
});
test('Collision providers and seats survive; planted paths and out-of-range voices drop',async()=>{
  const v=await load();
  const i=clean(v.intent({v:1,id:'e:agent.collision:0',type:'agent.collision',ts:1,tier:2,magnitude:.4,evidence:'derived',
    subject:{fileId:'1db0005537a90f',groupId:'80f461e0771437',file:'src/secret/keys.ts'},
    detail:{providers:['claude-code','cursor','src/secret/keys.ts','sk-ant-SECRET'],scope:'file',file:'src/secret/keys.ts',path:'/home/someone'}}));
  assert.deepEqual(i.detail,{providers:['claude-code','cursor'],scope:'file'});
  assert.deepEqual(i.subject,{fileId:'1db0005537a90f',groupId:'80f461e0771437'});
  const c=clean(v.cue({type:'agent.collision',ts:1,weight:.4,category:'observed',
    detail:{fileId:'1db0005537a90f',voices:[0,1,99,-1],providers:['claude-code','cursor','src/secret/keys.ts'],file:'src/secret/keys.ts'}}));
  assert.deepEqual(c.detail.voices,[0,1]);
  assert.deepEqual(c.detail.providers,['claude-code','cursor']);
  assert.equal(c.detail.file,undefined);
  assert.equal(v.intent({id:'e:agent.collision:1',type:'agent.collision',ts:1,detail:{scope:'secret',providers:['Claude']}}).detail.scope,undefined);
});
test('Recipes keep the genome, traits, settings and only the public strings the user approved',async()=>{
  const v=await load();
  const project={projectId:'p-view-000000001',name:'acme-client-portal',graph:{nodes:[],edges:[]},stats:{}};
  let r=recipe.generate(project,{family:'machine-cathedral',now:0});
  r={...r,title:'Night Build',aliases:{'80f461e0771437':'North Wing','src/secret':'acme-client-portal',aa00000000000b:'password=hunter2'},secret:'sk-ant-SECRET',genome:{...r.genome,note:'/home/someone',palette:{...r.genome.palette,trap:'src/secret/keys.ts'}}};
  const out=clean(v.recipe(r));
  assert.equal(out.title,'Night Build');assert.deepEqual(out.aliases,{'80f461e0771437':'North Wing'});
  assert.equal(out.family,'machine-cathedral');assert.equal(out.genome.palette.primary,r.genome.palette.primary);assert.equal(out.genome.geometry.architecture,r.genome.geometry.architecture);
  assert.equal(out.secret,undefined);assert.equal(out.genome.note,undefined);assert.equal(out.genome.palette.trap,undefined);
  assert.equal(v.recipe({...r,title:'acme/client'}).title,null);
  assert.deepEqual(clean(v.mood({section:'lift',energy:.4,tempo:96,extra:'sk-ant-SECRET'})),{section:'lift',energy:.4,tempo:96});
  assert(!JSON.stringify(out).includes(planted));
});

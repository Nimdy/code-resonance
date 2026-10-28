'use strict';
// Stage / OBS / film labels: the project folder name (shared by the extension for the player's project list) never
// appears; a title appears only when the user explicitly set the recipe's public title.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const {tempDir,startService}=require('./helpers');
const load=()=>import('../public/worlds/labels.js');
const FOLDER='acme-secret-client-portal';
const T0=1750000000000;
const project={projectId:'p-123456789012',name:FOLDER,graph:{nodes:[],edges:[]},stats:{}};
const world={
  describe:c=>({text:'A new star ignites',sub:'subsystem',banner:c.tier>=3?'Integration validated':null,bannerSub:'verified',position:{x:0,y:0,z:0}}),
  agentPosition:()=>({x:0,y:0,z:0}),agentColor:()=>'#fff',subsystemLabels:()=>[{position:{x:0,y:0,z:0},text:'Vauos',sub:'logic'}],status:()=>'2 validated'
};
function frame(r,mode,t=T0+2000,agentName=a=>'Claude'){
  return {mode,recipe:r,info:{t,phase:'active',agents:[{id:'a',number:1,provider:'claude-code',label:'editing',busy:true,alpha:1,arrived:T0,since:100,display:'tool'}]},
    commands:[{at:T0+1500,tier:3,subject:{fileId:'f1'}},{at:T0+1800,tier:2,subject:{groupId:'g1'}}],
    agentName,world,toScreen:()=>({x:600,y:400,visible:true}),size:[1920,1080],origin:T0};
}
test('No label in any mode contains the project folder name; without a public title the text is generic',async()=>{
  const {composeLabels,labelStrings,LABEL_MODES,titleCard,lowerThirdTitle}=await load();
  const r=recipe.generate(project,{family:'stellar-forge',now:0});
  assert.equal(r.title,null,'a generated recipe has no title');
  for(const mode of LABEL_MODES){
    const text=labelStrings(composeLabels(frame(r,mode))).join(' | ');
    assert(!text.toLowerCase().includes(FOLDER),`${mode}: ${text}`);
    assert(!/acme|portal/i.test(text),`${mode}: ${text}`);
  }
  assert.equal(titleCard(r).text,'Stellar Forge');
  assert.equal(lowerThirdTitle(r),'Code Resonance · Stellar Forge');
  const stream=composeLabels(frame(r,'stream'));
  assert.equal(stream.find(x=>x.kind==='lower-third').text,'Code Resonance · Stellar Forge');
  const cinematic=composeLabels(frame(r,'cinematic'));
  assert.equal(cinematic.find(x=>x.kind==='title').text,'Stellar Forge');
  const chips=labelStrings(composeLabels(frame(r,'explorer'))).join(' | ');
  assert.match(chips,/Claude/);
  assert(!/Agent 1/.test(chips));
});
test('chips and explorer labels stay inside the frame or are omitted',async()=>{
  const {composeLabels,clampBox,fitChip}=await load();
  const r=recipe.generate(project,{family:'stellar-forge',now:0});
  const cinematic=composeLabels(frame(r,'cinematic'));
  for(const it of cinematic.filter(x=>x.kind==='chip')){
    assert(it.x+it.dx>8&&it.x+it.dx<1920-8,JSON.stringify(it));
    assert(it.y+it.dy>8&&it.y+it.dy<1080-8,JSON.stringify(it));
  }
  const edge=frame(r,'cinematic');edge.toScreen=()=>({x:1910,y:20,visible:true});
  assert.equal(composeLabels(edge).filter(x=>x.kind==='chip').length,0);
  const gone=frame(r,'cinematic');gone.toScreen=()=>({x:4000,y:400,visible:true});
  assert.equal(composeLabels(gone).filter(x=>x.kind==='chip').length,0);
  const right=fitChip({x:1740,y:400,visible:true},1920,1080,'Claude · editing');
  assert(right&&right.dx<0,'flip toward the left near the right edge');
  const box=clampBox(1900,10,200,22,1920,1080,8);
  assert(box.x+200<=1920-8);assert(box.y>=8);
  const explorer=frame(r,'explorer');explorer.toScreen=()=>({x:1910,y:1070,visible:true});
  assert.equal(composeLabels(explorer).filter(x=>x.kind==='label'||x.kind==='chip').length,0);
});
test('An explicitly approved public title is the only project name the Stage shows',async()=>{
  const {composeLabels,labelStrings}=await load();
  const r=recipe.update(recipe.generate(project,{family:'machine-cathedral',now:0}),{type:'title',title:'Night Build'},project);
  const stream=composeLabels(frame(r,'stream'));
  assert.equal(stream.find(x=>x.kind==='lower-third').text,'Night Build · Machine Cathedral');
  assert.equal(composeLabels(frame(r,'cinematic')).find(x=>x.kind==='title').text,'Night Build');
  assert(!labelStrings(stream).join(' ').includes(FOLDER));
  // Clearing the title returns to generic text.
  const cleared=recipe.update(r,{type:'title',title:null},project);
  assert.equal(composeLabels(frame(cleared,'stream')).find(x=>x.kind==='lower-third').text,'Code Resonance · Machine Cathedral');
  assert.throws(()=>recipe.update(r,{type:'title',title:'x'.repeat(41)},project));
  assert.throws(()=>recipe.update(r,{type:'title',title:'<script>'},project));
});
test('Resolving a stored recipe never adopts the folder name, and the world host has no input for it',()=>{
  const {recipe:resolved}=recipe.resolve(null,project,0);assert.equal(resolved.title,null);
  const {recipe:again}=recipe.resolve({...resolved,founded:false,locked:false},{...project,name:'another-folder'},0);assert.equal(again.title,null);
  const host=fs.readFileSync(path.join(__dirname,'../public/worlds/host.js'),'utf8');
  assert(!/project\s*[:=]|setProject|\.name\s*\|\|/.test(host),'host.js takes no project name');
  const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const call=app.slice(app.indexOf('createWorld('),app.indexOf('createWorld(')+400);
  assert(!/name/.test(call.split(');')[0]),'the player passes no project name to the world');
});
test('GET /api/highlight never includes the project folder name or a file path',async t=>{
  const dir=tempDir(t,'cr-hl-priv-');
  const projectId=sha('highlight-privacy');
  const pdir=path.join(dir,'projects',sha(projectId));
  fs.mkdirSync(pdir,{recursive:true});
  fs.writeFileSync(path.join(pdir,'id'),projectId);
  const T0=1700000000000;
  const I=(type,dt,extra={})=>({v:1,id:`p:${type}:${dt}`,type,ts:T0+dt,tier:2,magnitude:.5,evidence:'observed',subject:{},detail:{},...extra,type,ts:T0+dt});
  const intents=[
    I('agent.state',200000,{tier:0,detail:{provider:'claude-code'}}),
    I('agent.state',210000,{tier:0,detail:{provider:'cursor'}}),
    I('structure.created',220000,{tier:2,subject:{fileId:'f1'},detail:{path:`src/${FOLDER}/hidden.ts`}}),
    I('validation.failed',230000,{detail:{category:'test'}}),
    I('validation.recovered',250000,{detail:{category:'test'}})
  ];
  fs.writeFileSync(path.join(pdir,'performance.jsonl'),JSON.stringify({seq:0,start:T0,end:T0+1_200_000,intents,name:FOLDER})+'\n');
  const svc=await startService(t,{port:0,dataDir:dir,sortIntervalMs:600000});
  const r=await fetch(`http://127.0.0.1:${svc.port}/api/highlight?id=${projectId}`);
  assert.equal(r.status,200);
  const text=await r.text();
  assert(!text.toLowerCase().includes(FOLDER),text);
  assert(!/acme|portal|hidden\.ts|src\//i.test(text),text);
  const doc=JSON.parse(text);
  assert.equal(doc.schema,'code-resonance.highlight.v1');
  assert.equal(doc.projectId,projectId);
});

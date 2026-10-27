'use strict';
// Visual recipes: a persistent, deterministic artistic identity per project, distinct in structure (not just colour),
// provisional while a project is tiny, permanent once founded or chosen, and editable only from the player's origin.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const recipe=require('../engine/recipe');
const {createService}=require('../receiver/server');
const {sha}=require('../receiver/protocol');
// A public projection with the given shape: modules (counts of symbol kinds), dependency edges, test modules.
function project(id,{modules=10,ui=0,routes=0,classes=0,fns=3,tests=0,dirs=3,hub=0,cross=0,agents=0,agentEvents=0}={}){
  const nodes=[{id:'g1',type:'group'},{id:'g2',type:'group'},{id:'g3',type:'group'}],edges=[];
  for(let i=0;i<modules;i++){const counts={function:fns};if(i<ui)counts['ui.component']=2;if(i<routes)counts['api.route']=1;if(i<classes){counts.class=2;counts.interface=2;}
    nodes.push({id:`m${i}`,type:'module',group:`g${1+i%3}`,dir:`d${i%dirs}`,lang:i<ui?'tsx':'ts',test:i>=modules-tests,counts});}
  for(let i=1;i<=hub;i++)edges.push({a:`m${i}`,b:'m0',kind:'depends',cross:false});
  for(let i=0;i<cross;i++)edges.push({a:`m${i%modules}`,b:`m${(i+1)%modules}`,kind:'depends',cross:true});
  return {projectId:sha(id),graph:{nodes,edges},stats:{raw:100,agentEvents,testsPassed:0,testsFailed:0},agents:Array.from({length:agents},(_,i)=>({id:`a${i}`}))};
}
const same=(a,b)=>assert.deepEqual({...a,createdAt:0},{...b,createdAt:0});
test('Recipes are deterministic: same project and traits, same identity, regardless of wall-clock',()=>{
  const p=project('det',{modules:20,ui:8});
  same(recipe.generate(p,{now:1}),recipe.generate(p,{now:999999}));
  assert.equal(recipe.generate(p).projectSeed,parseInt(sha(p.projectId).slice(0,8),16));
});
test('Different projects become structurally different worlds, not recoloured ones',()=>{
  const ui=recipe.generate(project('ui-app',{modules:120,ui:70,dirs:40}));
  const hub=recipe.generate(project('agent-service',{modules:12,routes:6,hub:10,agents:5,agentEvents:80}));
  const engineered=recipe.generate(project('typed-core',{modules:60,classes:40,tests:20,cross:50}));
  assert.deepEqual([ui.family,hub.family,engineered.family],['fractal-biosphere','stellar-forge','machine-cathedral']);
  for(const [a,b] of [[ui,hub],[hub,engineered],[ui,engineered]]){
    const d=recipe.structuralDifferences(a,b);
    assert(d.includes('family'));assert(d.some(x=>x.startsWith('geometry.')));assert(d.some(x=>x.startsWith('motion.')));assert(d.some(x=>x.startsWith('camera.')));
  }
  // Within one family, two projects still differ in how they are built, move and are filmed, beyond palette.
  const a=recipe.generate(project('alpha',{modules:40,classes:30,tests:10}),{family:'stellar-forge'});
  const b=recipe.generate(project('beta',{modules:40,classes:30,tests:10}),{family:'stellar-forge'});
  const d=recipe.structuralDifferences(a,b);
  assert(d.length>=12,`only ${d.length} structural differences: ${d.join(', ')}`);
  assert(d.some(x=>x.startsWith('geometry.'))&&d.some(x=>x.startsWith('atmosphere.'))&&d.some(x=>x.startsWith('motion.')));
});
test('A tiny project stays provisional; once founded its identity never re-derives as the code changes',()=>{
  const tiny=project('growing',{modules:3,ui:3});
  const first=recipe.generate(tiny);assert.equal(first.founded,false);
  const grown=project('growing',{modules:30,classes:25,tests:10,cross:20});
  const second=recipe.resolve(first,grown);assert.equal(second.changed,true);assert.equal(second.recipe.founded,true);
  const later=recipe.resolve(second.recipe,project('growing',{modules:200,ui:150,dirs:80}));
  assert.equal(later.changed,false);assert.equal(later.recipe,second.recipe);
});
test('Artist control: choose a family, regenerate, lock, adjust and name; inputs are validated',()=>{
  const p=project('control',{modules:30,ui:10});let r=recipe.generate(p);
  const chosen=recipe.update(r,{type:'family',family:'machine-cathedral'},p);
  assert.equal(chosen.family,'machine-cathedral');assert.equal(chosen.source,'user');assert.equal(chosen.locked,true);
  same(chosen,recipe.update(r,{type:'family',family:'machine-cathedral'},p));
  const again=recipe.update(r,{type:'regenerate'},p);assert.equal(again.variant,1);assert.notDeepEqual(again.genome,r.genome);
  r=recipe.update(r,{type:'overrides',intensity:5,motion:.5,labels:'stream'},p);assert.deepEqual([r.overrides.intensity,r.overrides.motion,r.overrides.labels],[2,.5,'stream']);
  r=recipe.update(r,{type:'alias',id:'0123456789abcd',name:'Recipe Book'},p);assert.equal(r.aliases['0123456789abcd'],'Recipe Book');
  assert.throws(()=>recipe.update(r,{type:'alias',id:'0123456789abcd',name:'<script>'},p));
  assert.throws(()=>recipe.update(r,{type:'alias',id:'../../etc',name:'x'},p));
  assert.throws(()=>recipe.update(r,{type:'family',family:'neon-city'},p));
  assert.throws(()=>recipe.update(r,{type:'overrides',labels:'dashboard'},p));
  // Overrides and names survive a family change.
  assert.equal(recipe.update(r,{type:'family',family:'stellar-forge'},p).aliases['0123456789abcd'],'Recipe Book');
});
test('The receiver persists the recipe across restarts and accepts edits only from its own origin',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-recipe-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let svc=await createService({port:0,dataDir:dir}).start();
  const projectId=sha('recipe-http');let seq=0;
  const ev=(file,content)=>({v:1,id:`rh-${++seq}-xxxxxxxx`,ts:Date.now(),kind:'document.snapshot',projectId,sessionId:'s',origin:'test',file,content,meta:{reason:'edit'}});
  const events=Array.from({length:8},(_,i)=>ev(`src/part${i%3}/m${i}.tsx`,`export function C${i}(){return <div/>}`));
  await fetch(`http://127.0.0.1:${svc.port}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events})});
  await svc.flush(projectId);
  const url=()=>`http://127.0.0.1:${svc.port}/api/recipe?id=${projectId}`;
  const first=await (await fetch(url())).json();assert.equal(first.schema,'code-resonance.recipe.v1');assert.equal(first.founded,true);
  assert(!/src\/|part\d|C\d/.test(JSON.stringify(first)),'no paths or identifiers in the recipe');
  const post=(headers,action)=>fetch(url(),{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action})});
  assert.equal((await post({},{type:'family',family:'stellar-forge'})).status,403,'no Origin: refused');
  assert.equal((await post({Origin:'http://evil.example'},{type:'family',family:'stellar-forge'})).status,403,'foreign origin: refused');
  const ok=await post({Origin:`http://127.0.0.1:${svc.port}`},{type:'family',family:'stellar-forge'});
  assert.equal(ok.status,200);assert.equal((await ok.json()).family,'stellar-forge');
  await svc.stop();svc=await createService({port:0,dataDir:dir}).start();t.after(()=>svc.stop());
  const after=await (await fetch(url())).json();assert.equal(after.family,'stellar-forge');assert.equal(after.source,'user');
});
test('Choosing "automatic" returns to the identity the code would generate, keeping the viewer\'s settings',()=>{
  const p=project('auto',{modules:30,ui:20,dirs:20});const generated=recipe.generate(p);
  const chosen=recipe.update(recipe.update(generated,{type:'family',family:'machine-cathedral'},p),{type:'overrides',intensity:.4},p);
  const back=recipe.update(chosen,{type:'automatic'},p);
  assert.equal(back.family,generated.family);assert.equal(back.source,'generated');assert.equal(back.overrides.intensity,.4);
});

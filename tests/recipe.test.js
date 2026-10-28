'use strict';
// Visual recipes: a persistent, deterministic artistic identity per project, distinct in structure (not just colour),
// provisional while a project is tiny, permanent once founded or chosen, and editable only from the player's origin.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const recipe=require('../engine/recipe');
const {tempDir,startService}=require('./helpers');
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
  assert.throws(()=>recipe.update(r,{type:'propose',names:{'0123456789abcd':'Heart'}},p),'propose is not a recipe action');
});
test('Propose public names is client-only; alias still requires an explicit action',()=>{
  const visual=fs.readFileSync(path.join(__dirname,'../public/ui/workspaces/visual.js'),'utf8');
  const engine=fs.readFileSync(path.join(__dirname,'../engine/recipe.js'),'utf8');
  assert.match(visual,/Propose public names/);
  assert.match(visual,/type:'alias'/);
  assert(!/type:\s*['"]propose['"]/.test(visual));
  assert(!/case ['"]propose['"]/.test(engine));
  const p=project('propose',{modules:12,ui:4});
  const r=recipe.generate(p);
  assert.equal(r.aliases['0123456789abcd'],undefined);
  const named=recipe.update(r,{type:'alias',id:'0123456789abcd',name:'Heart'},p);
  assert.equal(named.aliases['0123456789abcd'],'Heart');
});
test('The receiver persists the recipe across restarts and accepts edits only from its own page (origin and control capability)',async t=>{
  const dir=tempDir(t,'cr-recipe-');
  let svc=await startService(t,{port:0,dataDir:dir});
  const projectId=sha('recipe-http');let seq=0;
  const ev=(file,content)=>({v:1,id:`rh-${++seq}-xxxxxxxx`,ts:Date.now(),kind:'document.snapshot',projectId,sessionId:'s',origin:'test',file,content,meta:{reason:'edit'}});
  const events=Array.from({length:8},(_,i)=>ev(`src/part${i%3}/m${i}.tsx`,`export function C${i}(){return <div/>}`));
  await fetch(`http://127.0.0.1:${svc.port}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events})});
  await svc.flush(projectId);
  const url=()=>`http://127.0.0.1:${svc.port}/api/recipe?id=${projectId}`;
  const first=await (await fetch(url())).json();assert.equal(first.schema,'code-resonance.recipe.v1');assert.equal(first.founded,true);
  assert(!/src\/|part\d|C\d/.test(JSON.stringify(first)),'no paths or identifiers in the recipe');
  const post=(headers,action)=>fetch(url(),{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action})});
  assert.equal((await post({},{type:'family',family:'stellar-forge'})).status,401,'no Origin: refused');
  assert.equal((await post({Origin:'http://evil.example'},{type:'family',family:'stellar-forge'})).status,403,'foreign origin: refused');
  const origin=`http://127.0.0.1:${svc.port}`;
  assert.equal((await post({Origin:origin},{type:'family',family:'stellar-forge'})).status,401,'same origin without a control capability: refused');
  const {capability}=await (await fetch(`${origin}/api/session`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({pairing:svc.pairing})})).json();
  const ok=await post({Origin:origin,'X-Resonance-Capability':capability},{type:'family',family:'stellar-forge'});
  assert.equal(ok.status,200);assert.equal((await ok.json()).family,'stellar-forge');
  await svc.stop();svc=await startService(t,{port:0,dataDir:dir});
  const after=await (await fetch(url())).json();assert.equal(after.family,'stellar-forge');assert.equal(after.source,'user');
});
test('Choosing "automatic" returns to the identity the code would generate, keeping the viewer\'s settings',()=>{
  const p=project('auto',{modules:30,ui:20,dirs:20});const generated=recipe.generate(p);
  const chosen=recipe.update(recipe.update(generated,{type:'family',family:'machine-cathedral'},p),{type:'overrides',intensity:.4},p);
  const back=recipe.update(chosen,{type:'automatic'},p);
  assert.equal(back.family,generated.family);assert.equal(back.source,'generated');assert.equal(back.overrides.intensity,.4);
});
test('Generated identities are pinned: generator v4, what v4 keeps from v3, what v3 keeps from v2, and what v2 keeps from v1 (genome fingerprints)',()=>{
  const p={projectId:'pal-test-1234567',graph:{nodes:[],edges:[]},stats:{}},h=x=>require('node:crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16);
  assert.equal(recipe.RECIPE_VERSION,4);
  const v4=['stellar-forge','fractal-biosphere','machine-cathedral'].map(f=>recipe.generate(p,{family:f,now:0}).genome);
  assert.equal(h(v4),'d27fb424f09b9362');
  // v4 only added three values, drawn from no random stream: without them every genome is exactly v3's (key order too).
  assert(v4.every(g=>g.technique?.finish==='cinematic'&&g.music.score===3&&g.life.ecology===2));
  const v3=v4.map(g=>{const c=JSON.parse(JSON.stringify(g));delete c.technique.finish;if(!Object.keys(c.technique).length)delete c.technique;delete c.music.score;delete c.life.ecology;return c;});
  assert.equal(h(v3),'ccb6221a53e0c619');
  assert.equal(h(['stellar-forge','fractal-biosphere','machine-cathedral'].map(f=>recipe.generate(p,{family:f,now:0,version:3}).genome)),'ccb6221a53e0c619','the v3 generator is kept for older identities');
  // v3 only added digital life (its own random stream): without `life` every genome is exactly v2's.
  assert(v3.every(g=>g.life?.enabled===true));
  assert.equal(h(v3.map(g=>{const c={...g};delete c.life;return c;})),'96bd1fb42ab0c111');
  const strip=g=>{const c=JSON.parse(JSON.stringify(g));delete c.life;return c;};
  // v2 changed only what it meant to: Stellar Forge is identical to v1, Machine Cathedral keeps every v1 value (its two
  // added values come from their own stream), Fractal Biosphere chooses its species from the data. Stored recipes are
  // never re-derived once founded, so existing projects keep their identity whatever the generator does.
  assert.equal(h(strip(recipe.generate(p,{family:'stellar-forge',now:0,version:3}).genome)),'024d658c1eb3fc83');
  const c=strip(recipe.generate(p,{family:'machine-cathedral',now:0,version:3}).genome);delete c.atmosphere.shafts;delete c.material.wetness;
  assert.equal(h(c),'51647ee6517edb4c');
});
test('Generator v4: new identities get the cinematic finish, the composed score and the musical ecology; stored older identities never gain them by themselves',()=>{
  const tiny={projectId:'v4-tiny-00000001',graph:{nodes:[{id:'m',type:'module',counts:{}}],edges:[]},stats:{}};
  const grown={...tiny,graph:{nodes:Array.from({length:30},(_,i)=>({id:`m${i}`,type:'module',counts:{class:3}})),edges:[]}};
  const fresh=recipe.generate(tiny,{now:0});
  assert.equal(fresh.recipeVersion,4);assert.equal(fresh.genome.technique.finish,'cinematic');assert.equal(fresh.genome.music.score,3);assert.equal(fresh.genome.life.ecology,2);
  // A provisional identity saved by generator v3 is redrawn as v3: it stays without the v4 values (and says so).
  const v3=recipe.generate(tiny,{now:0,version:3});
  assert.equal(v3.recipeVersion,3);assert.equal(v3.genome.technique,undefined);assert.equal(v3.genome.music.score,undefined);assert.equal(v3.genome.life.ecology,undefined);
  for(const project of [tiny,grown]){const r=recipe.resolve(v3,project,5).recipe;
    assert.equal(r.recipeVersion,3);assert.equal(r.genome.technique?.finish,undefined);assert.equal(r.genome.music.score,undefined);assert.equal(r.genome.life.ecology,undefined);}
  // So does one from before digital life (v2: no life); it is redrawn exactly as it was before v4 existed.
  const {life,...v2genome}=v3.genome,v2={...v3,recipeVersion:2,genome:v2genome};
  const again=recipe.resolve(v2,tiny,5).recipe;assert.equal(again.recipeVersion,3);assert.equal(again.genome.technique,undefined);assert.equal(again.genome.music.score,undefined);
  // Founded or locked older identities are served as stored.
  const founded={...v3,founded:true};assert.equal(recipe.resolve(founded,grown,5).recipe,founded);
  // A look over an older identity keeps its generator; a new identity (family, regenerate, automatic) is drawn with v4.
  assert.equal(recipe.update(v3,{type:'pack',pack:null},tiny,0).genome.technique,undefined);
  for(const a of [{type:'family',family:'machine-cathedral'},{type:'regenerate'},{type:'regenerate',keepFamily:true},{type:'automatic'}]){
    const r=recipe.update(v3,a,tiny,0);assert.equal(r.recipeVersion,4,a.type);assert.equal(r.genome.technique.finish,'cinematic',a.type);assert.equal(r.genome.music.score,3,a.type);}
  // The deliberate upgrade is a tune: exact values, locked, and the older generator stays on record.
  const up=recipe.update(v3,{type:'tune',values:{'technique.finish':'cinematic','life.ecology':2,'music.score':3}},tiny,0);
  assert.deepEqual([up.genome.technique.finish,up.genome.life.ecology,up.genome.music.score,up.recipeVersion,up.locked],['cinematic',2,3,3,true]);
  assert.deepEqual(up.tuning.base,{'life.ecology':null,'music.score':null,'technique.finish':null});
  // Reset returns it to exactly what it was.
  assert.equal(JSON.stringify(recipe.update(up,{type:'tune-reset'},tiny,0).genome),JSON.stringify(v3.genome));
  for(const [path,bad] of [['technique.finish','filmic'],['music.score',4],['life.ecology',3]])assert.throws(()=>recipe.update(v3,{type:'tune',values:{[path]:bad}},tiny,0),new RegExp(path.replace('.','\\.')));
});

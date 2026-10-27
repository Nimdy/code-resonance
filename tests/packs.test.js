'use strict';
// Visual Pack SDK: manifest validation, compatibility, static checks, installation lifecycle, trust, recipes.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const packs=require('../engine/packs');
const catalog=require('../engine/catalog');
const recipe=require('../engine/recipe');
const EXAMPLES=path.join(__dirname,'../packs/examples'),TEMPLATES=path.join(__dirname,'../packs/template'),TESTING=path.join(__dirname,'../packs/testing');
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'cr-packs-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
function pack(t,manifest,files={}){const d=tmp(t);fs.writeFileSync(path.join(d,'pack.json'),JSON.stringify(manifest));
  for(const [f,c] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(d,f)),{recursive:true});fs.writeFileSync(path.join(d,f),c);}return d;}
const base={schema:'code-resonance.pack.v1',id:'test.sample',name:'Sample',version:'1.0.0',sdk:'^1.0'};
const declarative=(d={})=>({...base,kind:'declarative',declarative:{base:'stellar-forge',...d}});
const errorsOf=(t,m,files)=>packs.inspect(pack(t,m,files)).errors.map(e=>`${e.at}: ${e.message}`);
const WORLD_JS='export function createWorld(sdk){return {rebuild(){},update(){},cameraGoal(){return {target:new sdk.THREE.Vector3(),distance:10,azimuth:0,elevation:.5};},effect(){},dispose(){}};}';
const world=(w={})=>({...base,kind:'world',world:{entry:'world.js',effects:{'validation.failed':'storm','milestone.achieved':'bloom'},ambient:{unlocks:['halo']},...w}});
test('The examples, the starter templates and the testing fixtures are valid packs',()=>{
  for(const dir of [EXAMPLES,TEMPLATES,TESTING].flatMap(root=>fs.readdirSync(root).map(d=>path.join(root,d)))){
    const r=packs.inspect(dir);assert.deepEqual(r.errors,[],dir);assert(r.digest&&r.files.length);}
});
test('The manifest schema rejects malformed packs with precise locations',t=>{
  assert.deepEqual(errorsOf(t,declarative({overrides:{'light.bloom':1.2}})),[]);
  assert(errorsOf(t,{...declarative(),id:'NoNamespace'}).some(e=>e.startsWith('pack.json/id')));
  assert(errorsOf(t,{...declarative(),extra:1}).some(e=>/extra: is not a known field/.test(e)));
  assert(errorsOf(t,{...base,kind:'declarative'}).some(e=>/must have "declarative"/.test(e)));
  assert(errorsOf(t,{...declarative(),world:world().world}).length,'one kind section only');
  assert(errorsOf(t,{...declarative(),sdk:'1.0'}).some(e=>e.startsWith('pack.json/sdk')));
  assert(errorsOf(t,world({entry:'../escape.js'})).some(e=>e.includes('/world/entry')));
  assert(errorsOf(t,world({entry:'World.js'})).some(e=>e.includes('/world/entry')));
  assert(errorsOf(t,{...declarative(),name:'<script>'}).some(e=>e.startsWith('pack.json/name')));
});
test('Compatibility: a pack runs on the SDK major it names, at or above the minor it needs',()=>{
  assert.equal(packs.compatible({sdk:'^1.0'},'1.0.0').ok,true);
  assert.equal(packs.compatible({sdk:'^1.0'},'1.4.2').ok,true);
  assert.equal(packs.compatible({sdk:'^1.2'},'1.0.0').ok,false);
  assert.equal(packs.compatible({sdk:'^2.0'},'1.9.0').ok,false);
  assert.equal(packs.compatible({},'1.0.0').ok,false);
  // SDK 1.1 (pack code in a worker, sdk.util.canvas), 1.2 (declarative compositions, technique.finish): packs written
  // for 1.0 keep running; the examples declare ^1.0.
  assert.equal(packs.SDK_VERSION,'1.2.0');assert.equal(packs.compatible({sdk:'^1.1'},'1.0.0').ok,false);assert.equal(packs.compatible({sdk:'^1.2'},packs.SDK_VERSION).ok,true);
  for(const d of fs.readdirSync(EXAMPLES))assert.equal(packs.compatible(JSON.parse(fs.readFileSync(path.join(EXAMPLES,d,'pack.json'),'utf8'))).ok,true,d);
});
test('Declarative packs are checked against their base family: parameters, ranges, effect polarity, ambient layers',t=>{
  assert(errorsOf(t,declarative({overrides:{'geometry.nonsense':1}})).some(e=>/not a parameter/.test(e)));
  assert(errorsOf(t,declarative({overrides:{'geometry.spiralArms':40}})).some(e=>/integer in \[1, 6\]/.test(e)));
  assert(errorsOf(t,declarative({overrides:{'palette.primary':'red'}})).some(e=>/colour/.test(e)));
  assert.deepEqual(errorsOf(t,declarative({overrides:{'geometry.spiralArms':[2,4],'technique.tint':[1,.9,1.1]}})),[]);
  // A failure can never look like a success, a removal never like growth.
  assert(errorsOf(t,declarative({effects:{'validation.failed':'nova'}})).some(e=>/cannot show a failure/.test(e)));
  assert(errorsOf(t,declarative({effects:{'structure.removed':'planet-birth'}})).some(e=>/cannot show a removal/.test(e)));
  assert.deepEqual(errorsOf(t,declarative({effects:{'milestone.achieved':'aurora'}})),[]);
  assert(errorsOf(t,declarative({unlocks:['fireflies']})).some(e=>/not an ambient layer/.test(e)));
  assert(errorsOf(t,{...declarative(),declarative:{base:'nobody.unknown'}}).some(e=>/unknown family/.test(e)));
  // A base is a family's own name: an inherited one is unknown, with or without overrides and ambient layers.
  for(const d of [{},{overrides:{'palette.hue':1}},{unlocks:['halo']}])
    assert(errorsOf(t,{...declarative(),declarative:{base:'constructor',...d}}).some(e=>/unknown family "constructor"/.test(e)),JSON.stringify(d));
});
test('Code packs: one self-contained module with the right export; data packs contain no code',t=>{
  assert.deepEqual(errorsOf(t,world(),{'world.js':WORLD_JS}),[]);
  assert(errorsOf(t,world(),{'world.js':"import * as THREE from 'three';\n"+WORLD_JS}).some(e=>/imports are not allowed/.test(e)));
  assert(errorsOf(t,world(),{'world.js':WORLD_JS+"\nconst x=import('./other.js');"}).some(e=>/imports are not allowed/.test(e)));
  assert(errorsOf(t,world(),{'world.js':'export function make(){}'}).some(e=>/must export createWorld/.test(e)));
  assert(errorsOf(t,world(),{'world.js':WORLD_JS,'helper.js':'export const x=1;'}).some(e=>/declared entry/.test(e)));
  assert(errorsOf(t,world(),{}).some(e=>/missing/.test(e)));
  assert(errorsOf(t,declarative(),{'sneaky.js':'alert(1)'}).some(e=>/contain no code/.test(e)));
  assert(errorsOf(t,world({effects:{'milestone.achieved':'bloom'}}),{'world.js':WORLD_JS}).some(e=>/must express "validation.failed"/.test(e)));
  assert(errorsOf(t,world(),{'world.js':WORLD_JS,'big.txt':'x'.repeat(packs.LIMITS.fileBytes+1)}).some(e=>/larger than/.test(e)));
  const d=pack(t,world(),{'world.js':WORLD_JS,'target.txt':'x'});
  // Windows allows symbolic links only with Developer Mode or administrator rights.
  let linked=true;try{fs.symlinkSync(path.join(d,'target.txt'),path.join(d,'link.txt'));}catch(e){if(process.platform==='win32'&&e.code==='EPERM')linked=false;else throw e;}
  if(linked)assert(packs.inspect(d).errors.some(e=>/symbolic links/.test(e.message)));
});
test('Installation lifecycle: install, approve the exact files, tampering revokes, reinstall and removal',t=>{
  const data=tmp(t),src=pack(t,world(),{'world.js':WORLD_JS,'README.md':'# x'});
  const r=packs.install(src,data);
  assert.equal(r.executable,true);assert.equal(r.trusted,false,'code packs start unapproved');
  const registry=packs.createRegistry(data);
  assert.equal(registry.get('test.sample').trusted,false);assert.equal(registry.get('test.sample').family.name,'Sample');
  assert.throws(()=>packs.setTrust('test.sample',data,{digest:'0'.repeat(64)}),/changed/);
  packs.setTrust('test.sample',data,{digest:r.digest});assert.equal(registry.get('test.sample').trusted,true);
  if(process.platform!=='win32')assert.equal((fs.statSync(path.join(data,'packs','trust.json')).mode&0o777),0o600); // POSIX permissions only
  assert.equal(String(registry.read('test.sample','world.js')),WORLD_JS);assert.equal(registry.read('test.sample','../trust.json'),null);
  // Changing an installed file after approval: problems are reported and it no longer counts as approved.
  fs.appendFileSync(path.join(data,'packs','test.sample','world.js'),'\n// changed');
  // The registry the receiver keeps notices too (the change is in its cache key), so a running pack is stopped.
  assert.equal(registry.get('test.sample').ok,false);assert.equal(registry.get('test.sample').trusted,false);
  const tampered=packs.createRegistry(data).get('test.sample');
  assert.equal(tampered.trusted,false);assert(tampered.problems.some(p=>/differ/.test(p)));assert.equal(packs.createRegistry(data).read('test.sample','world.js'),null);
  // Reinstalling the same files keeps the approval; different files drop it.
  packs.install(src,data);assert.equal(packs.createRegistry(data).get('test.sample').trusted,true);
  fs.appendFileSync(path.join(src,'world.js'),'\n// v2');const r2=packs.install(src,data);assert.equal(r2.trusted,false);
  packs.remove('test.sample',data);assert.equal(packs.createRegistry(data).get('test.sample'),null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'packs','trust.json'),'utf8')).approvals['test.sample'],undefined);
  assert.throws(()=>packs.install(pack(t,{...declarative(),id:'BAD'}),data),/invalid/i);
});
test('Recipes: a world pack is a family with seeded, trait-derived parameters; overlays tune their base; missing packs fall back without rewriting',t=>{
  const data=tmp(t);
  packs.install(path.join(EXAMPLES,'cymatic-field'),data);packs.install(path.join(EXAMPLES,'ember-observatory'),data);
  const reg=packs.createRegistry(data).snapshot();
  const small={projectId:'p-small-0000001',graph:{nodes:[],edges:[]},stats:{}};
  const a=recipe.generate(small,{family:'halcyon.cymatic-field',registry:reg,now:0}),again=recipe.generate(small,{family:'halcyon.cymatic-field',registry:reg,now:0});
  assert.equal(a.familyKind,'pack');assert.equal(a.familyName,'Cymatic Field');assert.deepEqual(a,again,'deterministic');
  const spec=reg.families['halcyon.cymatic-field'].parameters;
  for(const [k,p] of Object.entries(spec)){const v=a.genome.params[k];
    if(p.type==='enum')assert(p.values.includes(v),k);else assert(v>=p.min&&v<=p.max&&(p.type!=='integer'||Number.isInteger(v)),`${k}=${v}`);}
  // A trait-derived parameter follows the project's traits.
  const dense=recipe.generate(small,{family:'halcyon.cymatic-field',registry:reg,now:0,traits:{...a.traits,depth:40,crossDensity:0}});
  assert(dense.genome.params.baseOrder>a.genome.params.baseOrder||dense.genome.params.plateSpacing!==a.genome.params.plateSpacing);
  // Automatic generation never picks a pack; choosing one needs the registry.
  assert(recipe.FAMILIES.includes(recipe.generate(small,{registry:reg,now:0}).family));
  assert.throws(()=>recipe.update(a,{type:'family',family:'halcyon.cymatic-field'},small,0,null),/Unknown family/);
  // An overlay: choosing a look chooses its base family; values, ranges, effects, unlocks and technique apply.
  const look=recipe.update(recipe.generate(small,{now:0}),{type:'pack',pack:'northlight.ember-observatory'},small,0,reg);
  assert.equal(look.family,'stellar-forge');assert.deepEqual(look.pack,{id:'northlight.ember-observatory',version:'1.1.0',kind:'declarative'});
  assert.equal(look.genome.geometry.arrangement,'binary-core');assert(look.genome.geometry.spiralArms>=2&&look.genome.geometry.spiralArms<=3);
  assert.equal(look.genome.effects['milestone.achieved'],'aurora');assert.equal(look.genome.ambient.unlocks[0],'galactic-halo');assert.equal(look.genome.technique.saturation,.82);
  // The pack disappears: served without it, flagged, and not rewritten (reinstalling restores the stored recipe).
  const gone=recipe.resolve(look,small,0,{byId:{},families:{}});
  assert.equal(gone.changed,false);assert.deepEqual(gone.recipe.unavailable,{pack:'northlight.ember-observatory'});assert.equal(gone.recipe.pack,null);
  assert.equal(recipe.resolve(look,small,0,reg).recipe,look);
  const lostWorld=recipe.resolve(a,small,0,{byId:{},families:{}});
  assert.equal(lostWorld.changed,false);assert(recipe.FAMILIES.includes(lostWorld.recipe.family));assert.equal(lostWorld.recipe.unavailable.family,'halcyon.cymatic-field');
  // An updated overlay pack redraws the genome.
  const older={...look,pack:{...look.pack,version:'0.9.0'}};assert.equal(recipe.resolve(older,small,0,reg).changed,true);
});
test('Catalogues cover every value the built-in generator produces, and the effect intents match the director',async()=>{
  for(const [family,cat] of Object.entries(catalog.FAMILIES)){
    for(let seed=1;seed<=200;seed++){
      const r=recipe.generate({projectId:`cat-${seed}-000000000`,graph:{nodes:[],edges:[]},stats:{}},{family,seed:seed*7919,variant:seed%3,now:0});
      for(const [p,spec] of Object.entries(cat.parameters)){if(p.startsWith('technique.'))continue;const v=catalog.get(r.genome,p);
        assert(v!==undefined,`${family}: ${p} missing`);assert(catalog.accepts(spec,v),`${family}: ${p}=${JSON.stringify(v)}`);}
      assert.deepEqual(Object.values(r.genome.effects),cat.effects);assert.deepEqual(r.genome.ambient.unlocks,cat.unlocks);
    }
  }
  const {EFFECT_TYPES}=await import('../public/worlds/director.js');
  assert.deepEqual(EFFECT_TYPES,catalog.EFFECT_TYPES);
});
test('The registry answers only for installed pack ids, never for object built-ins',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'resonance-registry-'));
  try{const r=packs.createRegistry(dir);for(const id of ['constructor','toString','__proto__','hasOwnProperty']){assert.equal(r.get(id),null,id);assert.equal(r.read(id,'pack.json'),null,id);}}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('A code pack whose files changed after installation can be revoked but never approved',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'resonance-trust-'));
  try{
    const r=packs.install(path.join(__dirname,'../packs/examples/cymatic-field'),dir);
    fs.appendFileSync(path.join(packs.packsDir(dir),r.id,'world.js'),'\n// changed\n');
    assert.throws(()=>packs.setTrust(r.id,dir,{trusted:true}),/has problems/);
    assert.equal(packs.createRegistry(dir).get(r.id).trusted,false);
    assert.equal(packs.setTrust(r.id,dir,{trusted:false}).trusted,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('A generated recipe follows the global information mode until one is chosen',()=>{
  const g=recipe.generate({projectId:'labels-default',graph:{nodes:[],edges:[]}},{seed:7});
  assert.equal(g.overrides.labels,null);
  const chosen=recipe.update(g,{type:'overrides',labels:'stream'},{projectId:'labels-default',graph:{nodes:[],edges:[]}});
  assert.equal(chosen.overrides.labels,'stream');
  assert.equal(recipe.update(chosen,{type:'overrides',labels:null},{projectId:'labels-default',graph:{nodes:[],edges:[]}}).overrides.labels,null);
  assert.throws(()=>recipe.update(g,{type:'overrides',labels:'loud'},{projectId:'labels-default',graph:{nodes:[],edges:[]}}),/Invalid labels/);
});

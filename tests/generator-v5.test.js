'use strict';
// Generator v5: Synaptic Storm, Fractal Continuum and Temporal Terrain graduate. The family scores can choose them, each
// from its own random stream and its own signals, after the flagships' scores are drawn exactly as before; their new
// identities get digital life (its own stream); every identity of generator 4 or earlier keeps its scores, family and
// values; stored identities never switch by themselves. Over a spread of projects each of the six families is chosen
// and none dominates.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const recipe=require('../engine/recipe');
const catalog=require('../engine/catalog');
const {syntheticProject}=require('./synthetic-projects');
const h=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16);
const EMPTY={projectId:'pal-test-1234567',graph:{nodes:[],edges:[]},stats:{}};
const corpus=(n,from=0)=>Array.from({length:n},(_,k)=>syntheticProject(from+k));
// Traits of the three qualification datasets at the end of their recordings (engine/recipe.js traitsOf, generator 5):
// Excalidraw indexed whole by its first scan, Lumen Recipes and Code Resonance itself recorded from their first file.
const DATASETS={
  excalidraw:{seed:2269940080,traits:{modules:450,districts:9,symbols:3073,ui:.085,uiModules:.349,routes:0,model:.168,functions:.471,languages:{js:.024,tsx:.53,ts:.447},dependencyDensity:3.522,crossDensity:1.004,hubness:.486,branching:.113,depth:6.829,tests:.127,agents:0,agentShare:0,validations:{passed:0,failed:0},grown:0}},
  lumen:{seed:3034007758,traits:{modules:17,districts:5,symbols:31,ui:.161,uiModules:.294,routes:0,model:0,functions:.516,languages:{js:.667,jsx:.333},dependencyDensity:.706,crossDensity:.176,hubness:.125,branching:.353,depth:1.824,tests:.059,agents:6,agentShare:.713,validations:{passed:4,failed:1},grown:1}},
  self:{seed:64406152,traits:{modules:92,districts:9,symbols:597,ui:.003,uiModules:.022,routes:0,model:.008,functions:.456,languages:{js:.895,ts:.07,tsx:.035},dependencyDensity:.685,crossDensity:.478,hubness:.198,branching:.326,depth:6.489,tests:.185,agents:0,agentShare:0,validations:{passed:0,failed:0},grown:1}}};
const withoutGrown=t=>{const {grown:_g,...rest}=t;return rest;};
test('Generator 5: six families, the flagships first in their order; generator 4 and earlier score the flagships alone',()=>{
  assert.equal(recipe.RECIPE_VERSION,5);
  assert.deepEqual(recipe.FLAGSHIPS,['stellar-forge','fractal-biosphere','machine-cathedral']);
  assert.deepEqual(recipe.GRADUATED,['synaptic-storm','fractal-continuum','temporal-terrain']);
  assert.deepEqual(recipe.FAMILIES,[...recipe.FLAGSHIPS,...recipe.GRADUATED]);assert.deepEqual(recipe.PREVIEWS,['aurora'],'Aurora waits as a preview (tests/aurora.test.js)');
  for(const v of [1,2,3,4])assert.deepEqual(recipe.familiesOf(v),recipe.FLAGSHIPS);assert.deepEqual(recipe.familiesOf(5),recipe.FAMILIES);
  assert.deepEqual(Object.keys(catalog.FAMILIES),recipe.FAMILIES,'the catalogue lists the six in the same order');assert.deepEqual(Object.keys(catalog.PREVIEWS),recipe.PREVIEWS);
  for(const f of recipe.GRADUATED)assert.equal(recipe.FAMILY_NAMES[f],catalog.FAMILIES[f].name);
});
test('Generator 4 and 3 are unchanged: the same recipes, bit for bit, as the generator before graduation (1226b8a)',()=>{
  // Fingerprints computed with engine/recipe.js at 1226b8a (the last commit before generator 5) over the same corpus:
  // automatic identities (whole recipes: family, scores, traits, genome), the flagships chosen (whole recipes), and the
  // graduated worlds chosen explicitly (their genomes: their display name lost "(preview)", nothing else changed).
  const run=version=>{const auto=[],graduated=[],flagships=[];
    for(const {project} of corpus(300))for(const variant of [0,1]){auto.push(recipe.generate(project,{now:0,variant,version}));
      for(const f of recipe.GRADUATED)graduated.push(recipe.generate(project,{now:0,variant,version,family:f}).genome);
      for(const f of recipe.FLAGSHIPS)flagships.push(recipe.generate(project,{now:0,variant,version,family:f}));}
    return {auto:h(auto),graduated:h(graduated),flagships:h(flagships)};};
  assert.deepEqual(run(4),{auto:'ce465331166baffb',graduated:'26ef26515800819a',flagships:'f59939fb65f65057'});
  assert.deepEqual(run(3),{auto:'351cdddd56316701',graduated:'0a0c18dd7fd78381',flagships:'93799b8ebe249897'});
  // The fingerprints of tests/recipe.test.js and of the preview tests, with the generator named.
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(EMPTY,{family:f,now:0,version:4}).genome)),'d27fb424f09b9362');
  assert.equal(h(recipe.GRADUATED.map(f=>recipe.generate(EMPTY,{family:f,now:0,version:4}).genome)),'c447ad761dabd75a');
  assert.equal(h(recipe.GRADUATED.map(f=>recipe.generate(EMPTY,{family:f,now:0,version:3}).genome)),'25d6c4e4a07ef49d');
  const v4=recipe.generate(EMPTY,{now:0,version:4});assert.deepEqual(Object.keys(v4.familyScores),recipe.FLAGSHIPS);assert.equal(v4.traits.grown,undefined);
});
test('Generator 5 keeps every flagship value: their genomes, and their scores (drawn first, from the same stream)',()=>{
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(EMPTY,{family:f,now:0}).genome)),'d27fb424f09b9362','v5 adds nothing to a flagship genome');
  for(const {project} of corpus(400))for(const variant of [0,3]){
    const a=recipe.generate(project,{now:0,variant,version:4}),b=recipe.generate(project,{now:0,variant});
    for(const f of recipe.FLAGSHIPS)assert.equal(b.familyScores[f],a.familyScores[f],f);
    assert.deepEqual(Object.keys(b.familyScores),recipe.FAMILIES);
    // v5 traits are v4's plus `grown`, after them.
    assert.deepEqual(withoutGrown(b.traits),a.traits);assert.deepEqual(Object.keys(b.traits),[...Object.keys(a.traits),'grown']);
    assert(b.traits.grown>=0&&b.traits.grown<=1);
    // A flagship v5 identity is the v4 identity exactly, but for the generator number, the scores and the trait it adds.
    if(recipe.FLAGSHIPS.includes(b.family)&&b.family===a.family)assert.equal(JSON.stringify(b.genome),JSON.stringify(a.genome));
  }
});
test('Generator 5 pinned: the graduated genomes, digital life for their new identities, the automatic choice over the corpus',()=>{
  assert.equal(h(recipe.FAMILIES.map(f=>recipe.generate(EMPTY,{family:f,now:0}).genome)),'839d397f7c5bc48c');
  assert.equal(h(recipe.GRADUATED.map(f=>recipe.generate(EMPTY,{family:f,now:0}).genome)),'c6157e056db7f994');
  const auto=[];for(const {project} of corpus(300))for(const variant of [0,1])auto.push(recipe.generate(project,{now:0,variant}));
  assert.equal(h(auto),'c87df341ec66a507');
  // Digital life from its own stream: without `life`, a graduated v5 genome is its v4 genome exactly (key order too).
  for(const {project} of corpus(60))for(const f of recipe.GRADUATED){
    const g5=recipe.generate(project,{family:f,now:0}).genome,g4=recipe.generate(project,{family:f,now:0,version:4}).genome;
    assert.equal(g5.life.enabled,true);assert.equal(g5.life.ecology,2);assert.equal(g4.life,undefined);
    const {life:_l,...rest}=g5;assert.equal(JSON.stringify(rest),JSON.stringify(g4),f);
    for(const [k,v] of Object.entries(g5.life))assert(catalog.accepts(catalog.LIFE[`life.${k}`],v),`${f} life.${k}=${v}`);
  }
  // Each world's life is its own draw (the stream is keyed by the family), not one shared set of values.
  const lives=recipe.GRADUATED.map(f=>JSON.stringify(recipe.generate(EMPTY,{family:f,now:0}).genome.life));assert.equal(new Set(lives).size,3);
  // A look over a graduated family never gets it (the last test below); the finish and the composed score are the v4
  // defaults, as for the flagships.
  const ss=recipe.generate(EMPTY,{family:'synaptic-storm',now:0});assert.equal(ss.genome.technique.finish,'cinematic');assert.equal(ss.genome.music.score,3);
  assert.equal(ss.familyName,'Synaptic Storm');assert.equal(ss.familyKind,'builtin');assert.equal(ss.recipeVersion,5);
});
test('The graduated families are chosen by their own signals: the three datasets, and each signal on its own',()=>{
  const at=(name,version=5)=>{const d=DATASETS[name];const traits=version>=5?d.traits:withoutGrown(d.traits);return recipe.generate({projectId:name},{seed:d.seed,traits,now:0,version});};
  // Generator 4 chose Machine Cathedral, Stellar Forge, Machine Cathedral (and the identities stored for them stay).
  assert.deepEqual(['excalidraw','lumen','self'].map(n=>at(n,4).family),['machine-cathedral','stellar-forge','machine-cathedral']);
  // Generator 5: Excalidraw's dense, coupled 450 files are a network; Lumen and Code Resonance were recorded from their
  // first file, so their whole history is there to lay down as land.
  assert.deepEqual(['excalidraw','lumen','self'].map(n=>at(n).family),['synaptic-storm','temporal-terrain','temporal-terrain']);
  // Each family's own signals raise its score and leave the other graduated families' as they were (a flagship may read
  // the same trait: Machine Cathedral coupling and symbols per file, Stellar Forge function share); history is read by
  // Temporal Terrain alone.
  const base={...DATASETS.self.traits,grown:0,agentShare:0,crossDensity:.2,dependencyDensity:.8,depth:3,functions:.4,districts:5};
  const score=(t,f)=>recipe.familyScores(t,7,0)[f];
  const raised=(change,family,alone=false)=>{const t={...base,...change};
    for(const f of recipe.FAMILIES){const d=score(t,f)-score(base,f);
      if(f===family)assert(d>.3,`${JSON.stringify(change)} raises ${f} (${d})`);
      else if(alone||recipe.GRADUATED.includes(f))assert.equal(d,0,`${JSON.stringify(change)} leaves ${f}`);}};
  raised({grown:1},'temporal-terrain',true);
  raised({depth:12,functions:.85},'fractal-continuum');
  raised({dependencyDensity:3.5,crossDensity:1.5},'synaptic-storm');
  raised({agentShare:.7},'synaptic-storm');
  // The seeded share of each graduated family comes from its own stream: changing the variant moves each by its own draw.
  const a=recipe.familyScores(base,7,0),b=recipe.familyScores(base,7,1);
  assert.equal(new Set(recipe.GRADUATED.map(f=>(b[f]-a[f]).toFixed(3))).size,3);
});
test('Stored identities never switch by themselves; choosing, regenerating and automatic are new identities on generator 5',()=>{
  const tiny={projectId:'v5-tiny-00000001',graph:{nodes:[{id:'g',type:'group'},{id:'m',type:'module',group:'g',counts:{function:2}}],edges:[]},stats:{raw:20,created:2}};
  const grown={...tiny,graph:{nodes:[{id:'g',type:'group'},...Array.from({length:30},(_,i)=>({id:`m${i}`,type:'module',group:'g',counts:{function:4}}))],edges:[]},stats:{raw:300,created:120}};
  assert.deepEqual([undefined,{recipeVersion:1},{recipeVersion:2},{},{recipeVersion:3},{recipeVersion:4},{recipeVersion:5}].map(s=>recipe.generatorOf(s)),[5,3,3,3,3,4,5]);
  // A provisional identity saved by generator 4 is redrawn with 4: among the flagships, without v5's trait.
  const v4=recipe.generate(tiny,{now:0,version:4});assert.equal(v4.founded,false);
  for(const p of [tiny,grown]){const r=recipe.resolve(v4,p,5).recipe;assert.equal(r.recipeVersion,4);assert(recipe.FLAGSHIPS.includes(r.family));
    assert.deepEqual(Object.keys(r.familyScores),recipe.FLAGSHIPS);assert.equal(r.traits.grown,undefined);}
  // A provisional identity saved by generator 5 is redrawn with 5; a founded or locked one is served as stored.
  const v5=recipe.generate(tiny,{now:0});assert.equal(v5.recipeVersion,5);assert.equal(recipe.resolve(v5,grown,5).recipe.recipeVersion,5);
  for(const stored of [{...v4,founded:true},{...v4,locked:true}])assert.equal(recipe.resolve(stored,grown,5).recipe,stored);
  // A stored choice of a graduated world made before graduation (generator 4: no digital life) is served as stored, and a
  // look withdrawn over it keeps its generator.
  const chosen4=recipe.generate(grown,{family:'temporal-terrain',now:0,version:4,source:'user',locked:true});
  assert.equal(recipe.resolve(chosen4,grown,5).recipe,chosen4);
  const same=recipe.update(chosen4,{type:'pack',pack:null},grown,0);assert.equal(same.recipeVersion,4);assert.equal(same.genome.life,undefined);
  assert.equal(JSON.stringify(same.genome),JSON.stringify(chosen4.genome));
  // New identities are drawn with generator 5 (family, regenerate, automatic), as generator 4 did before it.
  for(const a of [{type:'family',family:'synaptic-storm'},{type:'regenerate'},{type:'regenerate',keepFamily:true},{type:'automatic'}]){
    const r=recipe.update(chosen4,a,grown,0);assert.equal(r.recipeVersion,5,a.type);assert.deepEqual(Object.keys(r.familyScores),recipe.FAMILIES,a.type);}
  assert.equal(recipe.update(chosen4,{type:'regenerate',keepFamily:true},grown,0).genome.life.enabled,true,'a new identity of a graduated family lives');
  // Regenerating an identity founded before generator 5 scores its unknown history as halfway.
  const founded4={...recipe.generate(grown,{now:0,version:4}),founded:true};
  const again=recipe.update(founded4,{type:'regenerate'},grown,0);assert.equal(again.traits.grown,undefined);
  assert.equal(again.familyScores['temporal-terrain'],recipe.familyScores({...founded4.traits,grown:.5},founded4.projectSeed,1)['temporal-terrain']);
});
test('Over a spread of projects each of the six families is chosen and none dominates (synthetic corpus)',t=>{
  const N=2000,count=v=>{const c=Object.fromEntries(recipe.familiesOf(v).map(f=>[f,0]));for(const {project} of corpus(N))c[recipe.generate(project,{now:0,version:v}).family]++;return c;};
  const v4=count(4),v5=count(5),pct=c=>Object.entries(c).map(([f,n])=>`${f} ${(100*n/N).toFixed(1)} %`).join(', ');
  t.diagnostic(`generator 4: ${pct(v4)}`);t.diagnostic(`generator 5: ${pct(v5)}`);
  for(const [f,n] of Object.entries(v5)){assert(n/N>=.08,`${f} is chosen (${n} of ${N})`);assert(n/N<=.35,`${f} does not dominate (${n} of ${N})`);}
  // Generator 4 over the same corpus, for comparison: Stellar Forge more than half.
  assert.deepEqual(v4,{'stellar-forge':1067,'fractal-biosphere':414,'machine-cathedral':519});
  assert.deepEqual(v5,{'stellar-forge':585,'fractal-biosphere':312,'machine-cathedral':265,'synaptic-storm':317,'fractal-continuum':278,'temporal-terrain':243});
  // The same holds on a second, disjoint stretch of the corpus (no tuning was done on it).
  const other={};for(const {project} of corpus(1000,5000)){const f=recipe.generate(project,{now:0}).family;other[f]=(other[f]||0)+1;}
  t.diagnostic(`generator 5, projects 5000-5999: ${pct(Object.fromEntries(Object.entries(other).map(([f,n])=>[f,n*2])))}`);
  for(const f of recipe.FAMILIES){const n=other[f]||0;assert(n/1000>=.06&&n/1000<=.37,`${f}: ${n} of 1000`);}
});
test('Graduated worlds work as the flagships do: curated looks apply, declarative and shader looks are drawn over them, compositions take them as a base',t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const packs=require('../engine/packs'),Composition=require('../public/composition.js');
  const {project}=syntheticProject(3),r0=recipe.generate(project,{now:0});
  // The Visual Studio's curated looks (two per world): the family, then the tuning, as a preview applies them.
  const src=fs.readFileSync(path.join(__dirname,'../public/ui/workspaces/visual.js'),'utf8');
  const curated=Function(`return ${src.match(/const CURATED=([\s\S]*?);\n/)[1]}`)();
  const perFamily={};for(const c of curated)perFamily[c.payload.family]=(perFamily[c.payload.family]||0)+1;
  assert.deepEqual(perFamily,Object.fromEntries(recipe.FAMILIES.map(f=>[f,2])),'two curated looks per built-in world');
  for(const c of curated.filter(x=>recipe.GRADUATED.includes(x.payload.family))){
    const r=recipe.applyActions(r0,[{type:'family',family:c.payload.family},{type:'pack',pack:null},{type:'tune',values:c.payload.tuning}],project,0);
    assert.equal(r.family,c.payload.family);for(const [k,v] of Object.entries(c.payload.tuning))assert.deepEqual(catalog.get(r.genome,k),v,`${c.name}: ${k}`);}
  // A declarative look and a shader look over each graduated world (installed in a temporary data directory).
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-graduated-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const write=(name,manifest,files={})=>{const d=path.join(dir,'src',name);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'pack.json'),JSON.stringify(manifest));
    for(const [f,c] of Object.entries(files))fs.writeFileSync(path.join(d,f),c);return d;};
  const OVERRIDES={'synaptic-storm':{'material.glow':[1.2,1.5],'atmosphere.haze':.4},'fractal-continuum':{'fractal.form':'kifs','material.rim':1.3},'temporal-terrain':{'contour.interval':[.5,.7],'camera.personality':'map'}};
  for(const f of recipe.GRADUATED){
    const id=`test.${f}-look`;
    packs.install(write(id,{schema:'code-resonance.pack.v1',id,name:`${f} look`,version:'1.0.0',kind:'declarative',sdk:'^1.0',declarative:{base:f,overrides:OVERRIDES[f]}}),dir);
    const sid=`test.${f}-shader`;
    packs.install(write(sid,{schema:'code-resonance.pack.v1',id:sid,name:`${f} shader`,version:'1.0.0',kind:'shader',sdk:'^1.0',shader:{base:f,background:'bg.frag',uniforms:{uInk:{type:'number',min:0,max:1}}}},
      {'bg.frag':'precision highp float;uniform float uInk;out vec4 o;void main(){o=vec4(vec3(uInk*.1),1.);}'}),dir);
  }
  const reg=packs.createRegistry(dir).snapshot();
  for(const f of recipe.GRADUATED){
    const look=recipe.update(r0,{type:'pack',pack:`test.${f}-look`},project,0,reg);
    assert.equal(look.family,f);assert.equal(look.pack.id,`test.${f}-look`);
    for(const [k,v] of Object.entries(OVERRIDES[f])){const x=catalog.get(look.genome,k);Array.isArray(v)?assert(x>=v[0]&&x<=v[1],`${f} ${k}=${x}`):assert.equal(x,v);}
    assert.equal(look.genome.life,undefined,'a look is its author\'s: no digital life added');assert.equal(look.genome.technique?.finish,undefined);
    // Its shader look is drawn over the same family and offers its uniforms for tuning.
    const sh=recipe.update(r0,{type:'pack',pack:`test.${f}-shader`},project,0,reg);
    assert.equal(sh.family,f);assert.equal(sh.pack.kind,'shader');assert(Object.hasOwn(recipe.tunable(sh,reg),'uniforms.uInk'));
  }
  // An Artist Studio composition over each graduated world: valid, and applying it moves the project to that world.
  for(const f of recipe.GRADUATED){
    assert.deepEqual(Composition.validate({name:'Over it',base:f,finish:'cinematic',layers:[]}),[],f);
    const r=recipe.update(r0,{type:'composition',composition:{name:'Over it',base:f,finish:'clean',layers:[]}},project,0);
    assert.equal(r.family,f);assert.equal(r.composition.base,f);assert.equal(r.genome.technique.finish,'clean');
  }
});

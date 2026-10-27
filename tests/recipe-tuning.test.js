'use strict';
// Visual Recipe tuning: exact user values for the genome parameters a family (or a shader look) declares, validated
// against the catalogue / manifest, recorded with the generated value they replaced, kept while the family stays.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const recipe=require('../engine/recipe');
const packs=require('../engine/packs');
const catalog=require('../engine/catalog');
const EXAMPLES=path.join(__dirname,'../packs/examples');
const P={projectId:'tune-test-000001',graph:{nodes:[],edges:[]},stats:{}};
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'cr-tune-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const tune=(r,values,reg=null)=>recipe.update(r,{type:'tune',values},P,0,reg);
const stellar=()=>recipe.generate(P,{family:'stellar-forge',now:0});
// A registry with the cymatic-field world pack and the blueprint-cathedral shader look (installed, not approved:
// recipes may name them before the user approves their code).
function registry(t){const data=tmp(t);for(const d of ['cymatic-field','blueprint-cathedral'])packs.install(path.join(EXAMPLES,d),data);return packs.createRegistry(data).snapshot();}
test('Every value type of a built-in family can be tuned; the genome takes the exact value and the base is recorded',()=>{
  const r=stellar(),spec=recipe.tunable(r);
  assert.deepEqual(spec['geometry.spiralArms'],{type:'integer',min:1,max:6,doc:'spiral arms',group:'geometry'});
  assert.equal(spec['palette.primary'].group,'palette');assert.equal(spec['technique.tint'].type,'vec3');
  assert.deepEqual(Object.keys(spec),Object.keys(catalog.FAMILIES['stellar-forge'].parameters));
  const values={'light.bloom':1.7,'geometry.spiralArms':5,'geometry.arrangement':'cluster','secondary.moonsAsRings':!r.genome.secondary.moonsAsRings,
    'palette.primary':'#12AB9f','technique.tint':[1.2,.9,1.1]};
  const t=tune(r,values);
  assert.equal(t.genome.light.bloom,1.7);assert.equal(t.genome.geometry.spiralArms,5);assert.equal(t.genome.geometry.arrangement,'cluster');
  assert.equal(t.genome.secondary.moonsAsRings,values['secondary.moonsAsRings']);assert.equal(t.genome.palette.primary,'#12ab9f','colours stored canonical');
  assert.deepEqual(t.genome.technique,{finish:'cinematic',tint:[1.2,.9,1.1]});
  assert.equal(t.tuning.family,'stellar-forge');
  assert.deepEqual(t.tuning.base,{'geometry.arrangement':r.genome.geometry.arrangement,'geometry.spiralArms':r.genome.geometry.spiralArms,'light.bloom':r.genome.light.bloom,
    'palette.primary':r.genome.palette.primary,'secondary.moonsAsRings':r.genome.secondary.moonsAsRings,'technique.tint':null});
  assert.deepEqual(Object.keys(t.tuning.values),Object.keys(values).sort());
  assert.deepEqual(r,stellar(),'the input recipe is not modified');
  assert.equal(recipe.baseValues(t)['light.bloom'],r.genome.light.bloom);assert.equal(recipe.baseValues(t)['camera.fov'],r.genome.camera.fov);
  // Tuning again keeps the first base (the generated value), not the previous tuned value.
  assert.equal(tune(t,{'light.bloom':.4}).tuning.base['light.bloom'],r.genome.light.bloom);
});
test('Invalid tuning is rejected naming the path, and nothing is applied',()=>{
  const r=stellar();
  for(const [values,re] of [
    [{'light.bloom':9},/"light\.bloom".*\[0, 2\.5\]/],[{'geometry.spiralArms':2.5},/"geometry\.spiralArms".*integer/],[{'geometry.spiralArms':[2,4]},/"geometry\.spiralArms"/],
    [{'light.bloom':[.5,1]},/"light\.bloom".*single number/],[{'light.bloom':'1'},/"light\.bloom"/],[{'geometry.arrangement':'helix'},/"geometry\.arrangement".*one of/],
    [{'motion.breath':'4'},/"motion\.breath"/],[{'secondary.moonsAsRings':1},/"secondary\.moonsAsRings".*true or false/],[{'palette.primary':'red'},/"palette\.primary".*colour/],
    [{'technique.tint':[1,1]},/"technique\.tint".*three numbers/],[{'technique.tint':[1,1,3]},/"technique\.tint"/],[{'geometry.species':'fern'},/Unknown tunable parameter "geometry\.species"/],
    [{'params.drift':.5},/Unknown tunable parameter "params\.drift"/],[{'uniforms.uInk':.8},/Unknown tunable parameter "uniforms\.uInk"/],[{'genome':1},/"genome"/],
    // One bad value in a batch: the valid ones are not applied either.
    [{'light.bloom':1.1,'light.grain':5},/"light\.grain"/],
    // Names every object has are not parameters, whatever the value.
    ...['constructor','toString','hasOwnProperty','__proto__'].flatMap(k=>[1,null].map(v=>[JSON.parse(`{${JSON.stringify(k)}:${v}}`),new RegExp(`Unknown tunable parameter "${k}"`)]))]){
    assert.throws(()=>tune(r,values),re,JSON.stringify(values));}
  assert.throws(()=>tune(r,null),/Invalid tuning/);assert.throws(()=>tune(r,[1]),/Invalid tuning/);
  const before=JSON.stringify(r);assert.throws(()=>recipe.applyActions(r,[{type:'tune',values:{'light.bloom':1.1}},{type:'tune',values:{'light.bloom':-1}}],P,0));
  assert.equal(JSON.stringify(r),before);
});
test('null removes a tuned value and restores its base; tune-reset restores the generated genome exactly',()=>{
  const r=stellar();
  const t=tune(r,{'light.bloom':1.7,'technique.tint':[1.2,.9,1.1],'geometry.arrangement':'cluster'});
  const less=tune(t,{'light.bloom':null,'technique.tint':null});
  assert.equal(less.genome.light.bloom,r.genome.light.bloom);assert.deepEqual(less.genome.technique,{finish:'cinematic'},'a path the genome lacked is removed again');
  // ...and the object it leaves empty (an identity from before generator v4 has no technique at all).
  const v3=recipe.generate(P,{family:'stellar-forge',now:0,version:3});
  assert.equal(tune(tune(v3,{'technique.tint':[1.2,.9,1.1]}),{'technique.tint':null}).genome.technique,undefined);
  assert.deepEqual(Object.keys(less.tuning.values),['geometry.arrangement']);assert.deepEqual(Object.keys(less.tuning.base),['geometry.arrangement']);
  // Removing a value that is not tuned is a no-op; removing the last value leaves no tuning.
  assert.deepEqual(tune(less,{'camera.fov':null}).tuning,less.tuning);
  const none=tune(less,{'geometry.arrangement':null});assert.equal(none.tuning,null);assert.deepEqual(none.genome,r.genome);
  const reset=recipe.update(t,{type:'tune-reset'},P,0);
  assert.equal(reset.tuning,null);assert.deepEqual(reset.genome,r.genome);assert.equal(JSON.stringify(reset.genome),JSON.stringify(r.genome),'same key order too');
  assert.equal(recipe.update(r,{type:'tune-reset'},P,0).tuning,null);
});
test('Tuning locks and founds the identity and keeps its source',()=>{
  const tiny={projectId:'tune-tiny-0000001',graph:{nodes:[{id:'m',type:'module',counts:{}}],edges:[]},stats:{}};
  const r=recipe.generate(tiny,{now:0});assert.equal(r.founded,false);assert.equal(r.locked,false);assert.equal(r.source,'generated');
  const t=recipe.update(r,{type:'tune',values:{'light.exposure':1.4}},tiny,0);
  assert.equal(t.locked,true);assert.equal(t.founded,true);assert.equal(t.source,'generated');
  // A founded recipe is served as stored: the tuning is never re-derived away.
  const later=recipe.resolve(t,{...tiny,graph:{nodes:Array.from({length:30},(_,i)=>({id:`m${i}`,type:'module',counts:{class:3}})),edges:[]}},5);
  assert.equal(later.changed,false);assert.equal(later.recipe.genome.light.exposure,1.4);
  // An empty tune changes nothing: it does not make a provisional identity permanent.
  assert.equal(recipe.update(r,{type:'tune',values:{}},tiny,0),r);
  assert.equal(recipe.applyActions(r,[{type:'tune',values:{}}],tiny,0).locked,false);
});
test('Same family: overrides, names, lock and regenerate keepFamily keep the tuning; a family change drops it',()=>{
  const r=tune(stellar(),{'light.bloom':1.7,'geometry.spiralArms':6});
  let x=r;for(const a of [{type:'overrides',intensity:.5},{type:'alias',id:'0123456789abcd',name:'Core'},{type:'title',title:'Night'},{type:'lock',locked:false}])x=recipe.update(x,a,P,0);
  assert.deepEqual(x.tuning,r.tuning);assert.deepEqual(x.genome,r.genome);
  const again=recipe.update(r,{type:'regenerate',keepFamily:true},P,0);
  const plain=recipe.update(stellar(),{type:'regenerate',keepFamily:true},P,0);
  assert.equal(again.variant,1);assert.equal(again.family,'stellar-forge');
  assert.deepEqual(again.tuning.values,r.tuning.values);assert.equal(again.genome.light.bloom,1.7);assert.equal(again.genome.geometry.spiralArms,6);
  // The base is the new draw's value, and the rest of the genome is the new draw.
  assert.deepEqual(again.tuning.base,{'geometry.spiralArms':plain.genome.geometry.spiralArms,'light.bloom':plain.genome.light.bloom});
  assert.deepEqual(recipe.update(again,{type:'tune-reset'},P,0).genome,plain.genome);
  // Choosing the family it already has is no family change.
  assert.deepEqual(recipe.update(r,{type:'family',family:'stellar-forge'},P,0).tuning,r.tuning);
  for(const a of [{type:'family',family:'machine-cathedral'},{type:'regenerate'},{type:'automatic'}]){
    const y=recipe.update(r,a,P,0);assert.equal(y.tuning,null,a.type);
    if(y.family!=='stellar-forge'||a.type!=='automatic')assert.notEqual(y.genome.light.bloom,1.7);}
  // A recipe that was never tuned keeps its exact shape (no tuning key appears).
  assert.equal('tuning' in recipe.update(stellar(),{type:'family',family:'machine-cathedral'},P,0),false);
  assert.equal('tuning' in recipe.update(stellar(),{type:'regenerate'},P,0),false);
});
test('A world-pack family tunes params.<name> (manifest specs and docs) and the shared paths',t=>{
  const reg=registry(t);
  const r=recipe.generate(P,{family:'halcyon.cymatic-field',registry:reg,now:0}),spec=recipe.tunable(r,reg);
  assert.deepEqual(spec['params.plateSpacing'],{type:'number',min:.9,max:1.3,doc:'subsystems coupled to each other stand closer',group:'params'});
  assert.deepEqual(spec['params.morphBars'],{type:'enum',values:[8,16,32],doc:'bars between modes while idle',group:'params'});
  assert.equal(spec['params.sandTone'].doc,'sandTone','no description: the name');assert.equal(spec['params.baseOrder'].type,'integer');
  assert(spec['light.bloom']&&spec['palette.accent']&&!spec['geometry.spiralArms']);
  assert.deepEqual(recipe.tunable(r,null),{},'without the pack nothing about its parameters is known');
  const x=tune(r,{'params.plateSpacing':1.25,'params.baseOrder':5,'params.symmetry':'radial','light.bloom':.8},reg);
  assert.deepEqual([x.genome.params.plateSpacing,x.genome.params.baseOrder,x.genome.params.symmetry,x.genome.light.bloom],[1.25,5,'radial',.8]);
  assert.throws(()=>tune(r,{'params.baseOrder':6},reg),/"params\.baseOrder"/);assert.throws(()=>tune(r,{'params.sandTone':'green'},reg),/"params\.sandTone"/);
  assert.throws(()=>tune(r,{'params.nothing':1},reg),/Unknown tunable parameter "params\.nothing"/);
  const again=recipe.update(x,{type:'regenerate',keepFamily:true},P,0,reg);
  assert.equal(again.family,'halcyon.cymatic-field');assert.equal(again.genome.params.baseOrder,5);assert.deepEqual(again.tuning.values,x.tuning.values);
  assert.deepEqual(recipe.update(x,{type:'tune-reset'},P,0,reg).genome,r.genome);
  // The pack disappears: served on a fallback family without its tuning, and not rewritten.
  const gone=recipe.resolve(x,P,0,{byId:{},families:{}});
  assert.equal(gone.changed,false);assert.equal(gone.recipe.tuning,null);assert.deepEqual(recipe.resolve(x,P,0,reg).recipe,x);
});
test('A shader look tunes uniforms.<name>; dropping the look drops those values and keeps the rest',t=>{
  const reg=registry(t);
  const look=recipe.update(recipe.generate(P,{family:'machine-cathedral',now:0}),{type:'pack',pack:'northlight.blueprint-cathedral'},P,0,reg);
  assert.equal(look.pack.kind,'shader');const spec=recipe.tunable(look,reg);
  assert.deepEqual(spec['uniforms.uInk'],{type:'number',min:.65,max:1,doc:'how much of the image becomes ink lines',group:'uniforms'});
  assert(spec['uniforms.uGrid']&&spec['geometry.architecture']);
  assert.equal(recipe.tunable({...look,pack:{...look.pack,id:'nobody.gone'}},reg)['uniforms.uInk'],undefined);
  const x=tune(look,{'uniforms.uInk':.7,'atmosphere.fog':1.2},reg);
  assert.equal(x.genome.uniforms.uInk,.7);assert.equal(x.tuning.base['atmosphere.fog'],.85,'the base under a look is the look\'s value');
  assert.throws(()=>tune(look,{'uniforms.uInk':1.5},reg),/"uniforms\.uInk"/);
  // Regenerating on the same family with the look keeps both; removing the look keeps the family's values only.
  const again=recipe.update(x,{type:'regenerate',keepFamily:true},P,0,reg);
  assert.equal(again.pack.id,'northlight.blueprint-cathedral');assert.deepEqual(again.tuning.values,x.tuning.values);assert.equal(again.genome.uniforms.uInk,.7);
  const bare=recipe.update(x,{type:'pack',pack:null},P,0,reg);
  assert.equal(bare.pack,null);assert.deepEqual(bare.tuning.values,{'atmosphere.fog':1.2});assert.equal(bare.genome.uniforms,undefined);
  // The look goes missing: served on the same family, its tuning kept except the look's uniforms.
  const missing=recipe.resolve(x,P,0,{byId:{},families:{}});
  assert.equal(missing.changed,false);assert.deepEqual(missing.recipe.tuning.values,{'atmosphere.fog':1.2});assert.equal(missing.recipe.genome.atmosphere.fog,1.2);
  // A look on another family changes the family: tuning dropped.
  assert.equal(recipe.update(tune(stellar(),{'light.bloom':1.7}),{type:'pack',pack:'northlight.blueprint-cathedral'},P,0,reg).tuning,null);
});
test('applyActions applies a batch in order; the same actions on the same recipe give identical JSON',t=>{
  const reg=registry(t);
  const actions=[{type:'pack',pack:'northlight.blueprint-cathedral'},{type:'tune',values:{'uniforms.uGrid':30,'light.vignette':.6}},
    {type:'overrides',motion:.7},{type:'tune',values:{'light.vignette':null,'geometry.architecture':'deco'}},{type:'title',title:'Blueprint'}];
  const r=recipe.generate(P,{now:0});
  const a=recipe.applyActions(r,actions,P,0,reg),b=recipe.applyActions(JSON.parse(JSON.stringify(r)),JSON.parse(JSON.stringify(actions)),P,0,reg);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.equal(JSON.stringify(a),JSON.stringify(actions.reduce((x,y)=>recipe.update(x,y,P,0,reg),r)));
  assert.deepEqual(a.tuning.values,{'geometry.architecture':'deco','uniforms.uGrid':30});assert.equal(a.overrides.motion,.7);assert.equal(a.title,'Blueprint');
  // Key order of the input does not change the stored JSON.
  assert.equal(JSON.stringify(tune(stellar(),{'light.bloom':1,'camera.fov':30})),JSON.stringify(tune(stellar(),{'camera.fov':30,'light.bloom':1})));
  assert.equal(recipe.applyActions(r,[],P,0,reg),r);
  assert.throws(()=>recipe.applyActions(r,{type:'tune'},P,0,reg),/Invalid actions/);
  assert.throws(()=>recipe.applyActions(r,Array.from({length:17},()=>({type:'lock'})),P,0,reg),/Invalid actions/);
});
test('The Visual Studio\'s curated presets and Essentials name real parameters of their families, within range',()=>{
  const {FAMILIES:F,COMMON}=require('../engine/catalog');
  const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/ui/workspaces/visual.js'),'utf8');
  const constant=name=>Function(`return ${src.match(new RegExp(`const ${name}=([\\s\\S]*?);\\n`))[1]}`)();
  const params=f=>({...COMMON,...F[f].parameters});
  const curated=constant('CURATED');
  assert.ok(curated.length>=6);
  for(const p of curated){
    assert.ok(F[p.payload.family],`${p.name}: family ${p.payload.family}`);
    for(const [path,v] of Object.entries(p.payload.tuning)){
      const s=params(p.payload.family)[path];assert.ok(s,`${p.name}: ${path} is a parameter of ${p.payload.family}`);
      if(s.type==='enum')assert.ok(s.values.includes(v),`${p.name}: ${path}=${v}`);
      else for(const x of [v].flat())assert.ok(x>=s.min&&x<=s.max,`${p.name}: ${path}=${v} within ${s.min}..${s.max}`);
    }
  }
  const essentials=constant('ESSENTIALS');
  for(const [f,paths] of Object.entries(essentials))for(const path of paths){
    if(f==='common')assert.ok(COMMON[path],`common essential ${path}`);else assert.ok(params(f)[path],`${f} essential ${path}`);
  }
});

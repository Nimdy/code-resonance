'use strict';
// Artist compositions: the receiver's store (actions, versions, limits, revisions), its routes and change feed, and the
// recipe action that applies a composition to a project (validated, previewed without being stored, withdrawn cleanly).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {sha}=require('../receiver/protocol');
const {compositions,view}=require('../receiver/compositions');
const recipe=require('../engine/recipe');
const C=require('../public/composition.js');
const {tempDir,startService}=require('./helpers');
const rejects=(p,code,key)=>assert.rejects(p,e=>{assert.equal(e.code,code);if(key!==undefined)assert.equal(e.key,key);return true;});
const starter=id=>C.STARTERS.find(s=>s.id===id);
function counter(){let n=0;return ()=>`c-${(++n).toString(16).padStart(12,'0')}`;}
test('Compositions: create from a starter, the blank canvas or a full composition; every one is stored normalised under its own id',async t=>{
  const dir=tempDir(t,'cr-comp-'),doc=compositions(dir,{now:()=>1000,newId:counter()});
  assert.deepEqual(await doc.read(),{schema:'code-resonance.compositions.v1',revision:0,compositions:[]});
  let d=await doc.update({patch:{action:'create',starter:'starter-celestial-motion'}});
  const a=d.compositions[0];
  assert.equal(a.id,'c-000000000001');assert.equal(a.version,1);assert.deepEqual(a.origin,{kind:'starter',ref:'starter-celestial-motion'});
  assert.deepEqual(a.composition,{...starter('starter-celestial-motion'),id:a.id},'the starter, under the new id');
  d=await doc.update({patch:{action:'create'}});
  assert.equal(d.compositions[1].composition.base,'canvas');assert.deepEqual(d.compositions[1].composition.layers,[]);assert.equal(d.compositions[1].origin.kind,'blank');
  // A full composition: clamped and defaulted; names lose markup characters.
  d=await doc.update({patch:{action:'create',origin:{kind:'world',ref:'machine-cathedral'},composition:{name:'<script>Neon</script>',base:'machine-cathedral',
    layers:[{type:'particles',params:{count:99999,color:'red'},mappings:[{signal:'music.energy',target:'glow',amount:5}]}]}}});
  const c=d.compositions[2].composition;
  assert.equal(c.name,'scriptNeon/script');assert.equal(c.layers[0].params.count,6000);assert.equal(c.layers[0].params.color,'#9fe8ff');assert.equal(c.layers[0].mappings[0].amount,1);
  assert.deepEqual(d.compositions[2].origin,{kind:'world',ref:'machine-cathedral'});
  assert.deepEqual(c,C.normalize(c),'stored normalised (idempotent)');
  // Refused, naming what: unknown layer types and signals, an unknown starter, both sources at once, unknown keys.
  await rejects(doc.update({patch:{action:'create',composition:{layers:[{type:'shader'}]}}}),'invalid','composition.layers.0.type');
  await rejects(doc.update({patch:{action:'create',composition:{layers:[{type:'light',mappings:[{signal:'eng.secret',target:'glow'}]}]}}}),'invalid');
  await rejects(doc.update({patch:{action:'create',starter:'starter-nope'}}),'invalid','starter');
  await rejects(doc.update({patch:{action:'create',starter:'starter-blank',composition:{}}}),'invalid','starter');
  await rejects(doc.update({patch:{action:'create',code:'alert(1)'}}),'invalid','code');
  await rejects(doc.update({patch:{action:'run'}}),'invalid','action');
  // The file holds exactly what reads back, private to this account.
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'compositions.json'),'utf8')),await doc.read());
  if(process.platform!=='win32')assert.equal((await fs.stat(path.join(dir,'compositions.json'))).mode&0o777,0o600);
});
test('Compositions: a save keeps the five previous versions; restore brings one back without losing the current one',async t=>{
  let clock=0;const dir=tempDir(t,'cr-comp-'),doc=compositions(dir,{now:()=>++clock,newId:counter()});
  let d=await doc.update({patch:{action:'create',starter:'starter-abstract-resonance'}});const id=d.compositions[0].id;
  const edit=(n)=>{const c=structuredClone(d.compositions[0].composition);c.layers[0].params.intensity=n/10;return c;};
  for(let n=1;n<=7;n++)d=await doc.update({patch:{action:'update',id,composition:edit(n),ifVersion:n}});
  let e=d.compositions[0];
  assert.equal(e.version,8);assert.equal(e.composition.layers[0].params.intensity,.7);
  assert.deepEqual(e.history.map(h=>h.version),[7,6,5,4,3],'newest first, five kept');
  assert.equal(e.history[0].composition.layers[0].params.intensity,.6);
  // An identical save is no new version.
  d=await doc.update({patch:{action:'update',id,composition:e.composition}});assert.equal(d.compositions[0].version,8);
  // A stale editor is refused, and told nothing was written.
  await rejects(doc.update({patch:{action:'update',id,composition:edit(9),ifVersion:7}}),'stale','ifVersion');
  d=await doc.update({patch:{action:'restore',id,version:5}});e=d.compositions[0];
  assert.equal(e.version,9);assert.equal(e.composition.layers[0].params.intensity,.4,'version 5 is current again');
  assert.deepEqual(e.history.map(h=>h.version),[8,7,6,4,3],'the replaced version is kept; the restored one is not listed twice');
  await rejects(doc.update({patch:{action:'restore',id,version:1}}),'not-found','version');
  // Rename is a new version of the name only; duplicate starts a new history; delete removes one.
  d=await doc.update({patch:{action:'rename',id,name:'  Night Lattice  '}});assert.equal(d.compositions[0].composition.name,'Night Lattice');assert.equal(d.compositions[0].version,10);
  await rejects(doc.update({patch:{action:'rename',id,name:'<>'}}),'invalid','name');
  d=await doc.update({patch:{action:'duplicate',id}});
  const copy=d.compositions[1];
  assert.equal(copy.composition.name,'Night Lattice copy');assert.equal(copy.composition.id,copy.id);assert.deepEqual(copy.history,[]);assert.deepEqual(copy.origin,{kind:'copy',ref:id});
  assert.deepEqual({...copy.composition,id:null,name:null},{...d.compositions[0].composition,id:null,name:null});
  d=await doc.update({patch:{action:'delete',id}});assert.deepEqual(d.compositions.map(x=>x.id),[copy.id]);
  await rejects(doc.update({patch:{action:'delete',id}}),'not-found','id');
  // The listing summarises the history (restored by number on the receiver).
  const v=view(await doc.read());assert.deepEqual(Object.keys(v),['schema','revision','limit','compositions']);
});
test('Compositions: at most 100; the document revision guards against another window’s writes',async t=>{
  const dir=tempDir(t,'cr-comp-'),doc=compositions(dir,{newId:counter()});
  // 100 entries written at once (the limit is the document's), then one more is refused.
  const list=Array.from({length:100},(_,i)=>({id:`c-${(i+1).toString(16).padStart(12,'0')}`,version:1,createdAt:1,updatedAt:1,origin:{kind:'blank',ref:null},
    composition:{...C.normalize({name:`N${i}`}),id:`c-${(i+1).toString(16).padStart(12,'0')}`},history:[]}));
  await fs.writeFile(path.join(dir,'compositions.json'),JSON.stringify({schema:'code-resonance.compositions.v1',revision:4,compositions:list}));
  const d=await doc.read();assert.equal(d.compositions.length,100);assert.equal(d.revision,4);
  await rejects(doc.update({patch:{action:'create'}}),'invalid','compositions');
  await rejects(doc.update({patch:{action:'duplicate',id:list[0].id}}),'invalid','compositions');
  await rejects(doc.update({patch:{action:'rename',id:list[0].id,name:'Late'},ifRevision:3}),'stale');
  assert.equal((await doc.update({patch:{action:'rename',id:list[0].id,name:'On time'},ifRevision:4})).revision,5);
});
// A receiver with one sorted project and a paired window.
async function start(t){
  const dir=tempDir(t,'cr-comp-http-'),svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  const base=`http://127.0.0.1:${svc.port}`,projectId=sha('compositions-http');let seq=0;
  const ev=i=>({v:1,id:`ch-${String(++seq).padStart(6,'0')}-xxxxxxxx`,ts:Date.now(),kind:'document.snapshot',projectId,sessionId:'s',origin:'test',file:`src/p${i%3}/m${i}.ts`,content:`export function f${i}(){ return ${i}; }\n`,meta:{reason:'edit'}});
  await fetch(`${base}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events:Array.from({length:8},(_,i)=>ev(i))})});
  await svc.flush(projectId);
  const {capability}=await (await fetch(`${base}/api/session`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({pairing:svc.pairing})})).json();
  const send=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Resonance-Capability':capability},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const get=async route=>{const r=await fetch(base+route);assert.equal(r.status,200,route);return r.json();};
  return {svc,dir,base,projectId,send,get};
}
test('The compositions routes: listing, actions with the id the receiver chose, revisions, and the hello revision',async t=>{
  const {base,send,get}=await start(t);
  assert.deepEqual((await get('/api/compositions')).compositions,[]);
  // Without a control capability nothing is written.
  assert.equal((await fetch(`${base}/api/compositions`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{"action":"create"}'})).status,401);
  let r=await send('/api/compositions',{action:'create',starter:'starter-signal-architecture',newId:'c-ffffffffffff'});
  assert.equal(r.status,200);assert.match(r.body.created,/^c-[0-9a-f]{12}$/);assert.notEqual(r.body.created,'c-ffffffffffff','the receiver chooses the id');
  const id=r.body.created,rev=r.body.revision;
  assert.equal(r.body.compositions.find(e=>e.id===id).composition.name,'Signal Architecture');
  r=await send('/api/compositions',{action:'update',id,composition:{...starter('starter-signal-architecture'),name:'Late'},ifVersion:7});
  assert.equal(r.status,409);assert.equal(r.body.code,'stale');assert.equal(r.body.current.compositions[0].version,1,'the current state comes back');
  r=await send('/api/compositions',{action:'rename',id,name:'Mine',ifRevision:rev-1});assert.equal(r.status,409);assert.equal(r.body.current.revision,rev);
  r=await send('/api/compositions',{action:'create',composition:{layers:Array.from({length:9},()=>({type:'light'}))}});assert.equal(r.status,400);assert.match(r.body.error,/at most 8 layers/);
  const big=await fetch(`${base}/api/compositions`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'x'.repeat(70*1024)});assert.notEqual(big.status,200);
  // The change feed's hello carries the compositions' revision.
  const ac=new AbortController(),es=await fetch(`${base}/api/changes`,{signal:ac.signal}),reader=es.body.getReader();let text='';
  while(!/event: hello\ndata: .*\n\n/.test(text)){const {value}=await reader.read();text+=Buffer.from(value).toString();}
  ac.abort();
  assert.equal(JSON.parse(/event: hello\ndata: (.*)\n/.exec(text)[1]).revision.compositions,rev);
});
test('The composition recipe action: switches to its base, tunes what it carries, previews without storing, and is withdrawn cleanly',async t=>{
  const {projectId,send,get}=await start(t);
  const saved=await get(`/api/recipe?id=${projectId}`);
  const dream=starter('starter-bioluminescent-dream');
  // A preview is computed, never stored.
  let r=await send(`/api/recipe/preview?id=${projectId}`,{actions:[{type:'composition',composition:dream}]});
  assert.equal(r.status,200);assert.equal(r.body.recipe.family,'fractal-biosphere');assert.equal(r.body.recipe.composition.name,'Bioluminescent Dream');
  assert.equal((await get(`/api/recipe?id=${projectId}`)).revision,saved.revision);
  // Refused, with nothing written: unknown layers, over the budget, not an object.
  for(const composition of [{layers:[{type:'script',params:{src:'x'}}]},{layers:Array.from({length:8},()=>({type:'particles',params:{count:6000,trail:1}}))},'canvas',[]]){
    r=await send(`/api/recipe?id=${projectId}`,{action:{type:'composition',composition}});assert.equal(r.status,400,JSON.stringify(composition).slice(0,40));assert.match(r.body.error,/Invalid composition/);}
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'composition',composition:dream},ifRevision:saved.revision});
  assert.equal(r.status,200);const applied=r.body;
  assert.equal(applied.family,'fractal-biosphere');assert.equal(applied.locked,true);assert.equal(applied.founded,true);
  assert.deepEqual(applied.composition,dream,'the normalised composition is part of the identity');
  assert.equal(applied.genome.palette.hue,172);assert.equal(applied.tuning.values['palette.hue'],172);assert.equal(applied.genome.technique.finish,'dreamlike');
  assert.equal(applied.genome.life?.enabled,true,'the world keeps its digital life');
  // Stale: another window applied something since.
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'composition',composition:null},ifRevision:saved.revision});assert.equal(r.status,409);
  // A tuned value the user changed afterwards is theirs: removing the composition leaves it; its own values go.
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'tune',values:{'light.bloom':1.1}}});assert.equal(r.status,200);
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'composition',composition:null}});assert.equal(r.status,200);
  assert.equal(r.body.composition,undefined);assert.equal(r.body.family,'fractal-biosphere');
  assert.equal(r.body.tuning.values['palette.hue'],undefined,'the composition’s palette is withdrawn');assert.equal(r.body.tuning.values['light.bloom'],1.1);
  // A canvas composition keeps the family; another family's composition switches to it and the canvas goes with it.
  const canvas=starter('starter-abstract-resonance');
  r=await send(`/api/recipe?id=${projectId}`,{actions:[{type:'composition',composition:canvas},{type:'regenerate',keepFamily:true}]});
  assert.equal(r.body.family,'fractal-biosphere');assert.equal(r.body.composition.base,'canvas','kept by a new draw of the same family');
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'family',family:'stellar-forge'}});assert.equal(r.body.composition,undefined,'another world is another identity');
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'composition',composition:starter('starter-signal-architecture')}});
  assert.equal(r.body.family,'machine-cathedral');assert.equal(r.body.genome.technique.finish,'clean');
  // The pure action, directly: a stored identity with no composition is unchanged by removing none.
  const p={projectId:'compositions-pure',graph:{nodes:[],edges:[]},stats:{}},g=recipe.generate(p,{now:0});
  assert.equal(recipe.update(g,{type:'composition',composition:null},p,0),g);
  assert.throws(()=>recipe.update(g,{type:'composition'},p,0),/Invalid composition/);
});
test('A composition carries every style, profile key and voice group the score has, and nothing else',()=>{
  const S=require('../public/score.js');
  for(const style of S.STYLES)assert.equal(C.normalize({music:{style}}).music.style,style);
  const music=C.normalize({music:{profile:{...S.PROFILE,extra:.5,mix:{...Object.fromEntries(S.GROUPS.map(g=>[g,1])),drums:1}}}}).music;
  assert.deepEqual(Object.keys(music.profile).filter(k=>k!=='mix'),Object.keys(S.PROFILE));assert.deepEqual(Object.keys(music.profile.mix),S.GROUPS);
});

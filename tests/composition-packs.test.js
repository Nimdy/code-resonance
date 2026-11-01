'use strict';
// A composition shared as a file: exported as a data-only visual pack (SDK ^1.2), imported and installed in another
// installation through the ordinary Visual Packs import, used on a project there as its composition (life kept), and
// everything unsafe refused on the way in.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {sha}=require('../receiver/protocol');
const packs=require('../engine/packs');
const C=require('../public/composition.js');
const {tempDir,startService}=require('./helpers');
const starter=id=>C.STARTERS.find(s=>s.id===id);
async function start(t,name){
  const dir=tempDir(t,`cr-comp-pack-${name}-`),svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  const base=`http://127.0.0.1:${svc.port}`,projectId=sha(`composition-packs-${name}`);let seq=0;
  const ev=i=>({v:1,id:`cp-${String(++seq).padStart(6,'0')}-xxxxxxxx`,ts:Date.now(),kind:'document.snapshot',projectId,sessionId:'s',origin:'test',file:`src/secret-dir/p${i%3}/m${i}.ts`,content:`export function f${i}(){}\n`,meta:{reason:'edit'}});
  await fetch(`${base}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events:Array.from({length:8},(_,i)=>ev(i))})});
  await svc.flush(projectId);
  const {capability}=await (await fetch(`${base}/api/session`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({pairing:svc.pairing})})).json();
  const send=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Resonance-Capability':capability},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const get=async route=>{const r=await fetch(base+route);return {status:r.status,body:await r.json()};};
  return {svc,dir,base,projectId,send,get};
}
const decode=f=>Buffer.from(f.data,'base64').toString('utf8');
test('Export asks for SDK 1.2, or 1.3 over a family that graduated in 0.8.1 (an older receiver then says which SDK it needs)',()=>{
  const {exportPack}=require('../receiver/compositions');
  const over=b=>exportPack({id:'c-0123456789',version:1,composition:C.normalize({...starter('starter-blank'),base:b})}).manifest;
  for(const b of ['stellar-forge','fractal-biosphere','machine-cathedral','canvas'])assert.equal(over(b).sdk,'^1.2',b);
  for(const b of ['synaptic-storm','fractal-continuum','temporal-terrain']){const m=over(b);assert.equal(m.sdk,'^1.3',b);assert.equal(m.declarative.base,b);
    assert.equal(packs.compatible(m,'1.2.0').ok,false);assert.equal(packs.compatible(m).ok,true);}
});
test('Export → import → install: another installation gets the identical composition and uses it on its own project',async t=>{
  const a=await start(t,'a'),b=await start(t,'b');
  // A composition made from a starter, edited, applied to a project (so a recipe and private paths exist to leak).
  let r=await a.send('/api/compositions',{action:'create',starter:'starter-bioluminescent-dream',name:'Neon Mycelium'});const id=r.body.created;
  const c=structuredClone(r.body.compositions[0].composition);c.layers[0].params.color='#40ffd0';c.description='Teal and violet, slow and communal.';
  r=await a.send('/api/compositions',{action:'update',id,composition:c,ifVersion:1});assert.equal(r.status,200);
  const stored=r.body.compositions[0];
  await a.send(`/api/recipe?id=${a.projectId}`,{action:{type:'composition',composition:stored.composition}});
  const ex=await a.get(`/api/compositions/export?id=${id}&author=${encodeURIComponent('Ada <Lovelace>')}&license=CC0-1.0`);
  assert.equal(ex.status,200);const pack=ex.body;
  assert.deepEqual(pack.files.map(f=>f.path),['pack.json','README.md']);
  const manifest=JSON.parse(decode(pack.files[0]));
  assert.deepEqual(manifest,pack.manifest);
  assert.equal(manifest.kind,'declarative');assert.equal(manifest.sdk,'^1.2');assert.match(manifest.id,/^creator\.neon-mycelium-[0-9a-f]{6}$/);
  assert.equal(manifest.name,'Neon Mycelium');assert.deepEqual(manifest.author,{name:'Ada Lovelace'});assert.equal(manifest.license,'CC0-1.0');assert.equal(manifest.version,'1.0.2');
  assert.equal(manifest.declarative.base,'fractal-biosphere');assert.deepEqual(manifest.declarative.composition,C.exportable(stored.composition));
  // No project, path, recipe identity, composition id or secret anywhere in what leaves.
  const all=pack.files.map(decode).join('\n')+JSON.stringify(pack);
  for(const secret of [a.projectId,'secret-dir',a.dir,a.svc.token,a.svc.pairing,id,'projectSeed','genome'])assert(!all.includes(secret),`export contains ${String(secret).slice(0,20)}`);
  assert.match(decode(pack.files[1]),/^# Neon Mycelium\n/);assert.match(decode(pack.files[1]),/Glow rises with the music’s dynamics/);
  // The other installation imports it as any pack (a folder, here), sees no code, installs it.
  r=await b.send('/api/packs/import',{files:pack.files.map(f=>({path:`${pack.folder}/${f.path}`,data:f.data}))});
  assert.equal(r.status,200);const report=r.body;
  assert.deepEqual(report.errors,[]);assert.equal(report.executable,false);assert.equal(report.manifest.id,manifest.id);
  r=await b.send('/api/packs/install',{importId:report.importId,digest:report.digest});assert.equal(r.status,200);
  const listed=(await b.get('/api/packs')).body.packs.find(p=>p.id===manifest.id);
  assert.equal(listed.kind,'declarative');assert.equal(listed.trusted,true);assert.equal(listed.executable,false);
  assert.deepEqual(listed.composition,C.exportable(stored.composition),'the installed pack exposes the identical normalised composition');
  assert.equal((await b.get('/api/catalog')).body.looks[manifest.id],undefined,'a creation is not offered as a look');
  // Used on the other project: applied as its composition (not an overlay), so its own structure and life remain.
  const before=(await b.get(`/api/recipe?id=${b.projectId}`)).body;
  r=await b.send(`/api/recipe?id=${b.projectId}`,{action:{type:'pack',pack:manifest.id}});assert.equal(r.status,200);
  assert.equal(r.body.pack,null);assert.deepEqual(r.body.composition,{...C.exportable(stored.composition),id:null});
  assert.equal(r.body.family,'fractal-biosphere');assert.equal(r.body.genome.life?.enabled,true);assert.equal(r.body.projectSeed,before.projectSeed,'the project keeps its own seed');
  r=await b.send(`/api/recipe?id=${b.projectId}`,{action:{type:'composition',composition:listed.composition}});assert.equal(r.status,200);
  assert.equal((await b.get('/api/packs')).body.packs.find(p=>p.id===manifest.id).usedBy,1,'the creation counts the project that carries its composition');
  // The same composition on two projects: the same layers, each on its own world.
  const ra=(await a.get(`/api/recipe?id=${a.projectId}`)).body,rb=r.body;
  assert.deepEqual({...ra.composition,id:null},rb.composition);assert.notEqual(ra.projectSeed,rb.projectSeed);
  // Opened in the Artist Studio there: a copy in that installation's own creations.
  r=await b.send('/api/compositions',{action:'create',composition:listed.composition,origin:{kind:'pack',ref:manifest.id}});
  assert.equal(r.status,200);assert.deepEqual({...r.body.compositions[0].composition,id:null},{...listed.composition,id:null});
  assert.equal((await a.get('/api/compositions/export?id=c-000000000000')).status,404);
});
test('Unsafe content is refused: code in a data pack, unknown layer types or signals, an oversized budget; names are sanitised',async t=>{
  const dir=tempDir(t,'cr-comp-unsafe-');
  const write=(name,manifest,extra={})=>{const d=path.join(dir,name);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'pack.json'),JSON.stringify(manifest));
    for(const [f,v] of Object.entries(extra))fs.writeFileSync(path.join(d,f),v);return packs.inspect(d).errors.map(e=>`${e.at}: ${e.message}`);};
  const m=(composition,over={})=>({schema:'code-resonance.pack.v1',id:'creator.test',name:'Test',version:'1.0.0',kind:'declarative',sdk:'^1.2',
    declarative:{base:'fractal-biosphere',composition},...over});
  assert.deepEqual(write('ok',m(C.exportable(starter('starter-bioluminescent-dream')))),[]);
  assert.deepEqual(write('canvas',m(C.exportable(starter('starter-abstract-resonance')))),[],'a canvas composition travels on a built-in family');
  assert(write('code',m(C.exportable(starter('starter-bioluminescent-dream'))),{'layers.js':'export const x=1;'}).some(e=>/declarative packs contain no code/.test(e)));
  assert(write('type',m({layers:[{type:'webgl-shader',params:{source:'void main(){}'}}]})).some(e=>/composition\/layers\/0\/type: unknown layer type/.test(e)));
  assert(write('signal',m({layers:[{type:'light',mappings:[{signal:'net.fetch',target:'glow'}]}]})).some(e=>/unknown signal/.test(e)));
  assert(write('budget',m({layers:Array.from({length:6},()=>({type:'particles',params:{count:6000,trail:1}}))})).some(e=>/over the rendering budget/.test(e)));
  assert(write('count',m({layers:Array.from({length:9},()=>({type:'light'}))})).some(e=>/at most 8 layers/.test(e)));
  // A layer type is one of the model's own names, as a string: an inherited name or a list is unknown, never a crash.
  for(const type of ['constructor','__proto__','toString'])assert(write(`proto-${type}`,m({layers:[{type}]})).some(e=>/composition\/layers\/0\/type: unknown layer type/.test(e)),type);
  assert.equal(C.validate({layers:[{type:['light']}]}).length,1,'a list is not a layer type');
  assert.equal(C.validate({layers:Array.from({length:1000},()=>({}))}).length,24,'the first 24 problems only');
  // A value with no primitive form ({"toString":1}) is a bad value like any other, never a crash.
  const odd={toString:1};
  assert(write('object',m({layers:[{type:'light',seed:odd,params:{intensity:odd},anchor:{kind:'point',x:odd},mappings:[{signal:odd}]},{type:odd}],music:{profile:{mood:odd}}})).some(e=>/unknown signal/.test(e)));
  assert.equal(C.normalize({layers:[{type:'light',params:{intensity:odd}}]}).layers[0].params.intensity,C.specOf('light').find(p=>p.key==='intensity').default);
  assert(write('base',m(C.exportable(starter('starter-celestial-motion')))).some(e=>/must be the composition's base, "stellar-forge"/.test(e)));
  assert(write('old-sdk',m(C.exportable(starter('starter-bioluminescent-dream')),{sdk:'^1.4'})).some(e=>/needs SDK 1\.4/.test(e)));
  assert(write('shape',m('layers')).some(e=>/composition: must be object/.test(e)));
  // A finish in a data pack's technique (SDK 1.2) is accepted; an unknown one is not.
  assert.deepEqual(write('finish',{...m(undefined),declarative:{base:'stellar-forge',technique:{finish:'dreamlike'}}}),[]);
  assert(write('finish-bad',{...m(undefined),declarative:{base:'stellar-forge',technique:{finish:'neon'}}}).some(e=>/technique\/finish/.test(e)));
  // Script-like names are data: the composition keeps them as text without markup characters; the manifest never.
  const registry=packs.createRegistry(dir);
  assert(write('name',m(C.exportable(starter('starter-bioluminescent-dream'))),{}).length===0);
  const named=C.normalize({name:'<img src=x onerror=alert(1)>',layers:[{type:'light',name:'<script>alert(1)</script>'}]});
  assert.equal(named.name,'img src=x onerror=alert(1)');assert.equal(named.layers[0].name,'scriptalert(1)/script');
  assert(write('label',m(named,{name:'<b>Bold</b>'})).some(e=>e.startsWith('pack.json/name')),'a manifest name with markup is refused');
  assert.equal(registry.list().length,0,'nothing was installed by inspecting');
});
test('The Control Center’s ZIP writer makes archives the importer accepts, byte for byte the same each time',async t=>{
  const {zipStored,crc32}=await import(require('node:url').pathToFileURL(path.join(__dirname,'../public/ui/zip.js')).href);
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xCBF43926,'the standard check value');
  const a=await start(t,'zip');
  const id=(await a.send('/api/compositions',{action:'create',starter:'starter-signal-architecture'})).body.created;
  const pack=(await a.get(`/api/compositions/export?id=${id}`)).body;
  const entries=pack.files.map(f=>({name:`${pack.folder}/${f.path}`,data:new Uint8Array(Buffer.from(f.data,'base64'))}));
  const zip=zipStored(entries);assert.deepEqual(zipStored(entries),zip,'deterministic');
  const {capability}=await (await fetch(`${a.base}/api/session`,{method:'POST',headers:{Origin:a.base,'Content-Type':'application/json'},body:JSON.stringify({pairing:a.svc.pairing})})).json();
  const r=await fetch(`${a.base}/api/packs/import`,{method:'POST',headers:{'Content-Type':'application/zip',Origin:a.base,'X-Resonance-Capability':capability},body:zip});
  assert.equal(r.status,200);const report=await r.json();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.files.map(f=>f.path).sort(),['README.md','pack.json']);assert.equal(report.manifest.name,'Signal Architecture');
});

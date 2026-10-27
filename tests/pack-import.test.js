'use strict';
// Safe local pack import: the bounded ZIP reader, folder imports, quarantine, review report, installation and expiry.
// Archives are built here by a tiny writer (no binary fixtures in the repository).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const packs=require('../engine/packs');
const {createImports,crc32,RECORDS}=require('../receiver/pack-import');
const {tempDir}=require('./helpers');
const EXAMPLES=path.join(__dirname,'../packs/examples');
const {LIMITS}=packs;
// entries: [{name, data, method?, packed?, crc?, size?, csize?, flags?, mode?, madeBy?}] (overrides make broken archives).
function zip(entries,{eocd={}}={}){
  const parts=[],central=[];let offset=0;
  for(const e of entries){
    const name=Buffer.isBuffer(e.name)?e.name:Buffer.from(e.name,'utf8'),data=Buffer.from(e.data??''),dir=String(e.name).endsWith('/');
    const method=e.method??(data.length>32?8:0),packed=e.packed??(method===8?zlib.deflateRawSync(data):data);
    const crc=e.crc??crc32(data),size=e.size??data.length,flags=e.flags??0x800;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(size,22);local.writeUInt16LE(name.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(e.madeBy??(3<<8|20),4);c.writeUInt16LE(20,6);c.writeUInt16LE(flags,8);c.writeUInt16LE(method,10);
    c.writeUInt32LE(crc,16);c.writeUInt32LE(e.csize??packed.length,20);c.writeUInt32LE(size,24);c.writeUInt16LE(name.length,28);
    c.writeUInt32LE(((e.mode??(dir?0o40755:0o100644))<<16)>>>0,38);c.writeUInt32LE(offset,42);
    parts.push(local,name,packed);central.push(c,name);offset+=30+name.length+packed.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(eocd.onDisk??entries.length,8);end.writeUInt16LE(eocd.total??entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(eocd.cdOffset??offset,16);
  return Buffer.concat([...parts,cd,end]);
}
// A pack directory's files as [{name, data}] (posix names), optionally under a top-level folder.
function filesOf(dir,prefix=''){const out=[];
  const walk=rel=>{for(const d of fs.readdirSync(path.join(dir,rel),{withFileTypes:true})){const r=rel?`${rel}/${d.name}`:d.name;
    if(d.isDirectory())walk(r);else out.push({name:prefix+r,data:fs.readFileSync(path.join(dir,r))});}};
  walk('');return out;}
const asFolder=files=>files.map(f=>({path:f.name,data:Buffer.from(f.data).toString('base64')}));
function setup(t,options={}){
  const data=tempDir(t,'cr-import-');const registry=packs.createRegistry(data);
  const imports=createImports({dataDir:data,registry,...options});t.after(()=>imports.close());
  const quarantine=path.join(data,'packs','.quarantine');
  const left=()=>{try{return fs.readdirSync(quarantine);}catch{return [];}};
  return {data,registry,imports,quarantine,left};
}
function rejects(s,fn,code,pattern){
  assert.throws(fn,e=>{assert.equal(e.code,code,`${e.message} (expected ${code})`);if(pattern)assert.match(e.message,pattern);return true;});
  assert.deepEqual(s.left(),[],'nothing stays in quarantine');
}
test('CRC-32 matches the standard check value',()=>{
  assert.equal(crc32(Buffer.from('123456789')),0xCBF43926);assert.equal(crc32(Buffer.alloc(0)),0);
  if(zlib.crc32)assert.equal(crc32(Buffer.alloc(70000,7)),zlib.crc32(Buffer.alloc(70000,7)));
});
test('A declarative pack imports into quarantine with the same digest as its source, and installs at once',t=>{
  const s=setup(t),src=path.join(EXAMPLES,'ember-observatory');
  const r=s.imports.fromZip(zip(filesOf(src)));
  assert.match(r.importId,/^[0-9a-f]{16}$/);assert.deepEqual(r.errors,[]);
  assert.equal(r.digest,packs.inspect(src).digest);assert.equal(r.manifest.id,'northlight.ember-observatory');assert.equal(r.manifest.kind,'declarative');
  assert.equal(r.executable,false);assert.equal(r.access.code,false);assert.equal(r.installed,null);
  assert.deepEqual(r.files.map(f=>f.path).sort(),['README.md','pack.json']);
  assert(!JSON.stringify(r).includes(s.data),'no location on disk in the report');
  const dir=path.join(s.quarantine,r.importId);assert(fs.existsSync(path.join(dir,'pack.json')));
  if(process.platform!=='win32')assert.equal(fs.statSync(dir).mode&0o777,0o700); // POSIX permissions only
  assert.deepEqual(s.imports.get(r.importId).digest,r.digest);assert.equal(s.imports.get('0'.repeat(16)),null);
  const out=s.imports.install(r.importId,r.digest);
  assert.equal(out.id,'northlight.ember-observatory');assert.equal(s.registry.get(out.id).trusted,true,'data packs need no approval');
  assert.equal(fs.existsSync(dir),false,'quarantine removed after installation');assert.equal(s.imports.get(r.importId),null);
});
test('A world pack zipped as its folder is stripped; installs executable and unapproved; reinstall keeps approval only for identical files',t=>{
  const s=setup(t),src=path.join(EXAMPLES,'cymatic-field');
  const entries=[{name:'cymatic-field/'},{name:'cymatic-field/shaders/'},...filesOf(src,'cymatic-field/')];
  const r=s.imports.fromZip(zip(entries));
  assert.deepEqual(r.errors,[]);assert.equal(r.digest,packs.inspect(src).digest);
  assert(r.files.every(f=>!f.path.startsWith('cymatic-field/')));assert(r.files.some(f=>f.path==='shaders/sand.frag'));
  assert.equal(r.executable,true);assert.equal(r.access.code,true);assert.equal(r.access.network,false);assert.equal(r.access.gpuSandboxed,false);
  const first=s.imports.install(r.importId,r.digest);
  assert.equal(first.trusted,false);const p=s.registry.get(r.manifest.id);
  assert.equal(p.executable,true);assert.equal(p.trusted,false,'an import never approves code');
  packs.setTrust(p.id,s.data,{digest:p.digest});assert.equal(s.registry.get(p.id).trusted,true);
  // The same files again: the approval stays (it is bound to the digest), and the report says what is installed.
  const again=s.imports.fromZip(zip(entries));assert.deepEqual(again.installed,{version:p.version,digest:p.digest,trusted:true});
  assert.equal(s.imports.install(again.importId,again.digest).trusted,true);assert.equal(s.registry.get(p.id).trusted,true);
  // One changed file: installed, but unapproved.
  const changed=entries.map(e=>e.name==='cymatic-field/world.js'?{...e,data:Buffer.concat([e.data,Buffer.from('\n// changed\n')])}:e);
  const c=s.imports.fromZip(zip(changed));assert.deepEqual(c.errors,[]);assert.notEqual(c.digest,p.digest);
  assert.equal(s.imports.install(c.importId,c.digest).trusted,false);assert.equal(s.registry.get(p.id).trusted,false);
  assert.deepEqual(s.left(),[]);
});
test('Unsafe names are refused, in archives and folder imports, before anything is written',t=>{
  const s=setup(t);
  for(const name of ['../x.txt','a/../../x.txt','/abs.txt','C:/x.txt','c:x.txt','a\\b.txt','a//b.txt','./a.txt','a\0b.txt','a/b:stream.txt','con.txt','a /b.txt',
    'COM\u00b9.txt','lpt\u00b3','conin$','CONOUT$.log','a/aux/b.txt','x'.repeat(129)+'.txt',`${'abcdefgh/'.repeat(27)}x.txt`]){
    rejects(s,()=>s.imports.fromZip(zip([{name:'pack.json',data:'{}'},{name,data:'x'}])),'unsafe-path');
    rejects(s,()=>s.imports.fromFiles([{path:'pack.json',data:''},{path:name,data:'eA=='}]),'unsafe-path');
  }
  rejects(s,()=>s.imports.fromFiles([{path:'a/',data:''}]),'unsafe-path',/empty path segment/);
  rejects(s,()=>s.imports.fromZip(zip([{name:Buffer.from([0x70,0xff,0xfe]),data:'x'}])),'unsafe-path',/UTF-8/);
  rejects(s,()=>s.imports.fromZip(zip([{name:'link.txt',data:'/etc/passwd',mode:0o120777}])),'unsafe-path',/symbolic links/);
  rejects(s,()=>s.imports.fromZip(zip([{name:'fifo.txt',data:'',mode:0o010644}])),'unsafe-path',/regular files/);
  // Names are compared without case (they would be one file on Windows and macOS); a file may not also be a directory.
  rejects(s,()=>s.imports.fromZip(zip([{name:'README.md',data:'a'},{name:'readme.MD',data:'b'}])),'unsafe-path',/duplicate/);
  rejects(s,()=>s.imports.fromFiles([{path:'README.md',data:'YQ=='},{path:'readme.md',data:'Yg=='}]),'unsafe-path',/duplicate/);
  rejects(s,()=>s.imports.fromZip(zip([{name:'a',data:'a'},{name:'A/b.txt',data:'b'}])),'unsafe-path',/both a file and a directory/);
});
test('Archive integrity: encryption, ZIP64, methods, CRC and size lies (zip bombs) are refused',t=>{
  const s=setup(t),one=e=>()=>s.imports.fromZip(zip([{name:'pack.json',data:'{}'},{name:'a.txt',data:'hello',...e}]));
  rejects(s,one({flags:0x801}),'invalid-archive',/encrypted/);
  rejects(s,one({csize:0xFFFFFFFF}),'invalid-archive',/ZIP64/);
  rejects(s,()=>s.imports.fromZip(zip([{name:'a.txt',data:'x'}],{eocd:{total:0xFFFF,onDisk:0xFFFF}})),'invalid-archive',/ZIP64/);
  rejects(s,one({method:12}),'invalid-archive',/compression method 12/);
  rejects(s,one({crc:12345}),'invalid-archive',/CRC/);
  rejects(s,one({size:4}),'invalid-archive',/size differs/);
  // A few kilobytes that inflate to 2 MB while declaring 100 bytes: inflation stops at the declared size.
  const bomb=Buffer.alloc(2<<20);
  rejects(s,one({data:bomb,method:8,size:100,crc:crc32(bomb.subarray(0,100))}),'invalid-archive',/beyond its declared size/);
  rejects(s,one({method:8,packed:Buffer.from([1,2,3])}),'invalid-archive');
  rejects(s,()=>s.imports.fromZip(Buffer.from('not a zip at all, just some text')),'invalid-archive',/not a ZIP/);
  rejects(s,()=>s.imports.fromZip(zip([{name:'a.txt',data:'x'}]).subarray(0,-1)),'invalid-archive');
  rejects(s,()=>s.imports.fromZip(zip([{name:'a.txt',data:'x'}],{eocd:{cdOffset:9999}})),'invalid-archive');
  rejects(s,()=>s.imports.fromZip('PK'),'invalid-archive');
});
test('Limits: file count, file size, total size and directory records',t=>{
  const s=setup(t),many=n=>Array.from({length:n},(_,i)=>({name:`f${i}.txt`,data:'x'}));
  rejects(s,()=>s.imports.fromZip(zip(many(LIMITS.files+1))),'too-many-files');
  rejects(s,()=>s.imports.fromFiles(many(LIMITS.files+1).map(f=>({path:f.name,data:'eA=='}))),'too-many-files');
  // Directories do not count as files, but every central-directory record counts towards the record limit.
  assert.deepEqual(s.imports.fromZip(zip([...many(LIMITS.files),...Array.from({length:100},(_,i)=>({name:`d${i}/`}))])).errors.map(e=>e.at),['pack.json']);
  s.imports.clear();
  rejects(s,()=>s.imports.fromZip(zip(Array.from({length:RECORDS+1},(_,i)=>({name:`d${i}/`})))),'too-many-files');
  const big=Buffer.alloc(LIMITS.fileBytes+1,97);
  rejects(s,()=>s.imports.fromZip(zip([{name:'big.txt',data:big}])),'too-large',/larger than 1 MB/);
  rejects(s,()=>s.imports.fromFiles([{path:'big.txt',data:big.toString('base64')}]),'too-large');
  const full=Array.from({length:9},(_,i)=>({name:`f${i}.txt`,data:Buffer.alloc(LIMITS.fileBytes,97)}));
  rejects(s,()=>s.imports.fromZip(zip(full)),'too-large',/in total/);
  rejects(s,()=>s.imports.fromFiles(asFolder(full)),'too-large',/in total/);
});
test('Folder imports: the picked folder is stripped, metadata skipped with a warning, bad input refused',t=>{
  const s=setup(t),src=path.join(EXAMPLES,'ember-observatory');
  const r=s.imports.fromFiles({name:'ember-observatory',files:asFolder([...filesOf(src,'ember-observatory/'),{name:'ember-observatory/.DS_Store',data:'x'},{name:'__MACOSX/ember-observatory/._pack.json',data:'x'}])});
  assert.deepEqual(r.errors,[]);assert.equal(r.digest,packs.inspect(src).digest);
  assert(r.warnings.some(w=>/2 macOS metadata entries/.test(w)),r.warnings.join('; '));
  const z=s.imports.fromZip(zip([...filesOf(src),{name:'__MACOSX/._pack.json',data:'x'}]));
  assert.equal(z.digest,r.digest);assert(z.warnings.some(w=>/1 macOS metadata entry/.test(w)));s.imports.clear();
  rejects(s,()=>s.imports.fromFiles([{path:'pack.json',data:'not base64!'}]),'invalid-archive',/base64/);
  rejects(s,()=>s.imports.fromFiles([{path:'pack.json'}]),'invalid-archive');
  rejects(s,()=>s.imports.fromFiles('pack.json'),'invalid-archive');
  rejects(s,()=>s.imports.fromFiles(Array.from({length:RECORDS+1},()=>({path:'a.txt',data:''}))),'too-many-files');
});
test('An invalid pack gets a report with errors (not a transport error) and cannot be installed; a changed pack is refused',t=>{
  const s=setup(t);
  const bad=s.imports.fromZip(zip([{name:'pack.json',data:JSON.stringify({schema:'code-resonance.pack.v1',id:'test.bad',name:'Bad',version:'1.0.0',sdk:'^1.0',kind:'declarative',declarative:{base:'stellar-forge',overrides:{'geometry.nonsense':1}}})}]));
  assert(bad.errors.some(e=>/not a parameter/.test(e.message)));assert.equal(bad.manifest.id,'test.bad');
  assert.throws(()=>s.imports.install(bad.importId,bad.digest),e=>e.code==='invalid-pack'&&e.report.errors.length>0);
  assert.equal(s.registry.get('test.bad'),null);
  // No pack.json: the report says so without quoting where the quarantine is.
  const none=s.imports.fromZip(zip([{name:'notes.txt',data:'x'}]));
  assert.equal(none.manifest,null);assert.equal(none.errors[0].at,'pack.json');assert(!JSON.stringify(none).includes(s.data),JSON.stringify(none.errors));
  s.imports.discard(none.importId);assert.throws(()=>s.imports.discard(none.importId),e=>e.code==='not-found');
  const src=path.join(EXAMPLES,'ember-observatory'),ok=s.imports.fromZip(zip(filesOf(src)));
  assert.throws(()=>s.imports.install(ok.importId,'0'.repeat(64)),e=>e.code==='changed');
  assert.throws(()=>s.imports.install(ok.importId),e=>e.code==='changed');
  fs.appendFileSync(path.join(s.quarantine,ok.importId,'README.md'),'\nchanged');
  assert.throws(()=>s.imports.install(ok.importId,ok.digest),e=>e.code==='changed');
  assert.equal(s.registry.get('northlight.ember-observatory'),null);
  assert.throws(()=>s.imports.install('nope',ok.digest),e=>e.code==='not-found');
  assert.throws(()=>s.imports.install('f'.repeat(16),ok.digest),e=>e.code==='not-found');
});
test('A pack id that names the approval store or a Windows device is refused before anything is installed',t=>{
  const s=setup(t);
  // An approved pack first: the approval store must survive the attempts.
  packs.install(path.join(EXAMPLES,'cymatic-field'),s.data);
  const world=packs.createRegistry(s.data).get('halcyon.cymatic-field');packs.setTrust(world.id,s.data,{digest:world.digest});
  const trust=fs.readFileSync(path.join(s.data,'packs','trust.json'));
  const manifest=JSON.parse(fs.readFileSync(path.join(EXAMPLES,'ember-observatory','pack.json'),'utf8'));
  for(const id of ['trust.json','trust.json.backup','con.pack','com1.x','lpt9.y','nul.z']){
    const files=filesOf(path.join(EXAMPLES,'ember-observatory')).map(f=>f.name==='pack.json'?{...f,data:JSON.stringify({...manifest,id})}:f);
    const r=s.imports.fromFiles(asFolder(files));
    assert(r.errors.some(e=>e.at==='pack.json/id'&&/reserved/.test(e.message)),`${id}: ${JSON.stringify(r.errors)}`);
    assert.throws(()=>s.imports.install(r.importId,r.digest),e=>e.code==='invalid-pack',id);
    assert.throws(()=>packs.install(path.join(s.quarantine,r.importId),s.data),/reserved/,`${id}: the command line refuses it too`);
    s.imports.discard(r.importId);
  }
  assert(fs.statSync(path.join(s.data,'packs','trust.json')).isFile());assert.deepEqual(fs.readFileSync(path.join(s.data,'packs','trust.json')),trust);
  assert.equal(packs.createRegistry(s.data).get('halcyon.cymatic-field').trusted,true);
  // Ids that only contain such a word stay valid.
  assert.equal(packs.inspect(path.join(EXAMPLES,'ember-observatory')).errors.length,0);
  assert(!/reserved/.test(JSON.stringify(s.imports.fromFiles(asFolder(filesOf(path.join(EXAMPLES,'ember-observatory')).map(f=>f.name==='pack.json'?{...f,data:JSON.stringify({...manifest,id:'console.trust'})}:f))).errors)));
});
test('Quarantine: entries expire, at most 8 wait, leftovers are swept and clear() empties it',async t=>{
  let clock=1_000_000;const s=setup(t,{now:()=>clock});const src=zip(filesOf(path.join(EXAMPLES,'ember-observatory')));
  const ids=[];for(let i=0;i<8;i++)ids.push(s.imports.fromZip(src).importId);
  assert.throws(()=>s.imports.fromZip(src),e=>e.code==='pending-limit');assert.equal(s.left().length,8);
  s.imports.discard(ids.shift());ids.push(s.imports.fromZip(src).importId);assert.equal(s.imports.pending(),8);
  clock+=30*60*1000-1;assert.equal(s.imports.sweep(),0);
  clock+=1;assert.equal(s.imports.get(ids[0]),null,'expired');assert.equal(s.imports.sweep(),7);assert.deepEqual(s.left(),[]);
  const r=s.imports.fromZip(src);assert.equal(r.expiresAt,clock+30*60*1000);
  fs.mkdirSync(path.join(s.quarantine,'leftover'));assert.equal(s.imports.sweep(),1);assert.deepEqual(s.left(),[r.importId]);
  s.imports.clear();assert.equal(fs.existsSync(s.quarantine),false);assert.equal(s.imports.pending(),0);
  // The expiry timer removes an entry on its own.
  const quick=setup(t,{ttlMs:40});const q=quick.imports.fromZip(src);
  await new Promise(r=>setTimeout(r,150));assert.equal(quick.imports.get(q.importId),null);assert.deepEqual(quick.left(),[]);
});

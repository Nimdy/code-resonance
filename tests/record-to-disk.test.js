'use strict';
// Record to a file on disk, the page's side (public/recording.js `disk`), on stand-ins for the browser: what this browser
// is said to offer and why not; which working files are offered as interrupted recordings (never one a window holds,
// empty ones removed); an interrupted recording saved into the chosen file (made seekable up to its last complete block,
// then deleted) and never while another window holds it. The real APIs are exercised in a browser by
// qualification/ui/workspaces/output.qual.js and qualification/visual/record-disk.qual.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {runInNewContext}=require('node:vm');const {join}=require('node:path');
const W=require('../public/webm.js');
function recordingModule(globals={}){
  const win={ResonanceWebm:W,isSecureContext:true,...globals.window};
  runInNewContext(readFileSync(join(__dirname,'../public/recording.js'),'utf8'),{window:win,console,Promise,setTimeout,clearTimeout,Blob,URL,...globals,window:win},{filename:'recording.js'});
  return win.ResonanceRecording;
}
// Web Locks for exclusive, ifAvailable requests (as recording-lock.test.js), with query().
function lockManager(){
  const held=new Map();
  return {held,request(name,options,callback){return Promise.resolve().then(async()=>{
      if(held.has(name))return callback(null);held.set(name,{name});try{return await callback({name});}finally{held.delete(name);}});},
    async query(){return {held:[...held.values()],pending:[]};}};
}
// The origin private file system: one directory of files (Blobs), as navigator.storage.getDirectory() gives it.
function storage(files={}){
  const dir={files:new Map(Object.entries(files)),
    async getFileHandle(name){if(!dir.files.has(name)){const e=new Error('not found');e.name='NotFoundError';throw e;}return {kind:'file',name,getFile:async()=>Object.assign(dir.files.get(name),{lastModified:1})};},
    async removeEntry(name){if(!dir.files.delete(name)){const e=new Error('not found');e.name='NotFoundError';throw e;}},
    async *entries(){for(const name of [...dir.files.keys()])yield [name,{kind:'file',name,getFile:async()=>Object.assign(dir.files.get(name),{lastModified:1})}];}};
  const root={async getDirectoryHandle(name,{create=false}={}){if(name!=='code-resonance-recordings'){throw new Error('unexpected directory');}if(!create&&!dir.files.size&&!dir.exists){const e=new Error('none');e.name='NotFoundError';throw e;}dir.exists=true;return dir;}};
  return {dir,storage:{getDirectory:async()=>root,estimate:async()=>({quota:10e9,usage:1e9})}};
}
// Values made in the module's own realm (the vm), compared as plain data.
const plain=v=>JSON.parse(JSON.stringify(v));
// A chosen file: what createWritable() receives.
function destination(){const parts=[];let closed=false,aborted=false;
  return {parts,get closed(){return closed;},get aborted(){return aborted;},bytes:()=>Buffer.concat(parts.map(p=>Buffer.from(p))),
    name:'chosen.webm',async createWritable(){return {write:async b=>{parts.push(Uint8Array.from(b));},close:async()=>{closed=true;},abort:async()=>{aborted=true;}};}};}
// A live WebM in the recorder's layout (see tests/webm.test.js), cut off as a crash leaves it.
function liveWebm(){
  const el=(id,...p)=>W.element(id,...p),u=W.uintBytes,U=Uint8Array.from([1,255,255,255,255,255,255,255]),live=(id,...c)=>W.concat([W.idBytes(id),U,...c]);
  const block=(track,rel,key,n)=>{const p=new Uint8Array(n);p[0]=0x80|track;p[1]=rel>>8;p[2]=rel&255;p[3]=key?0x80:0;return el(W.ID.SIMPLEBLOCK,p);};
  const clusters=[0,1,2].map(c=>live(W.ID.CLUSTER,el(W.ID.TIMECODE,u(c*1000)),...Array.from({length:30},(_,i)=>block(i%3?1:2,i*33,i===0,i===0?3000:400))));
  return W.concat([el(W.ID.EBML,el(0x4282,Uint8Array.from(Buffer.from('webm')))),live(W.ID.SEGMENT,el(W.ID.INFO,el(W.ID.SCALE,u(1000000))),
    el(W.ID.TRACKS,el(W.ID.TRACK,el(W.ID.TRACKNUMBER,u(1)),el(W.ID.TRACKTYPE,u(2))),el(W.ID.TRACK,el(W.ID.TRACKNUMBER,u(2)),el(W.ID.TRACKTYPE,u(1)))),...clusters)]);
}
const FileHandle=class{};FileHandle.prototype.createWritable=function(){};

test('what this browser offers for recording to disk, and the honest reason when it does not',()=>{
  const {storage:st}=storage();
  const full={navigator:{storage:st,locks:lockManager()},Worker:function(){},FileSystemFileHandle:FileHandle,window:{showSaveFilePicker(){}}};
  assert.deepEqual(plain(recordingModule(full).disk.offered()),{ok:true});
  const insecure=recordingModule({...full,window:{showSaveFilePicker(){},isSecureContext:false}}).disk.offered();
  assert.equal(insecure.ok,false);assert.match(insecure.reason,/localhost or 127\.0\.0\.1/);assert.match(insecure.reason,/kept in memory until you stop/);
  for(const without of [{window:{}},{Worker:undefined},{FileSystemFileHandle:undefined},{navigator:{locks:lockManager()}}]){
    const r=recordingModule({...full,...without}).disk.offered();
    assert.equal(r.ok,false);assert.match(r.reason,/no File System Access API/);assert.match(r.reason,/Chrome or Edge/);assert.match(r.reason,/kept in memory until you stop/);
  }
  // No navigator at all (the vm of recording-lock.test.js): not offered, and nothing throws.
  assert.equal(recordingModule().disk.offered().ok,false);
});

test('interrupted recordings: working files no window holds; empty ones removed; never one being written',async()=>{
  const locks=lockManager();
  const {dir,storage:st}=storage({'code-resonance-ab-1793000000002.webm':new Blob([new Uint8Array(500)]),'code-resonance-ab-1793000000001.webm':new Blob([new Uint8Array(900)]),
    'code-resonance-ab-1793000000003.webm':new Blob([]),'code-resonance-ab-1793000000004.webm':new Blob([new Uint8Array(10)]),'notes.txt':new Blob(['x'])});
  const R=recordingModule({navigator:{storage:st,locks},Worker:function(){},FileSystemFileHandle:FileHandle,window:{showSaveFilePicker(){}}});
  // A window is writing the fourth one: it holds that file's lock.
  let release;const holding=new Promise(r=>{release=r;});
  void locks.request(R.disk.FILE_LOCK+'code-resonance-ab-1793000000004.webm',{mode:'exclusive',ifAvailable:true},()=>holding);await new Promise(r=>setTimeout(r,0));
  const kept=await R.disk.list();
  assert.deepEqual(plain(kept.map(k=>[k.name,k.bytes,k.startedAt])),[['code-resonance-ab-1793000000001.webm',900,1793000000001],['code-resonance-ab-1793000000002.webm',500,1793000000002]]);
  assert.equal(dir.files.has('code-resonance-ab-1793000000003.webm'),false,'the empty working file is removed');
  assert.equal(dir.files.has('code-resonance-ab-1793000000004.webm'),true,'the one being written stays, unlisted');
  release();await new Promise(r=>setTimeout(r,0));
  assert.equal((await R.disk.list()).length,3,'once its window lets go (a crash releases at once), it is offered too');
  // No directory yet (nothing ever recorded to disk here): none, and no directory created.
  const empty=storage();const R2=recordingModule({navigator:{storage:empty.storage,locks:lockManager()},window:{}});
  assert.deepEqual(plain(await R2.disk.list()),[]);assert.equal(empty.dir.exists,undefined);
});

test('an interrupted recording is saved into the chosen file, seekable up to its last complete block, then deleted',async()=>{
  const bytes=liveWebm(),cut=bytes.subarray(0,bytes.length-1234),name='code-resonance-ab-1793000000001.webm';
  const locks=lockManager(),{dir,storage:st}=storage({[name]:new Blob([cut])});
  const R=recordingModule({navigator:{storage:st,locks},Worker:function(){},FileSystemFileHandle:FileHandle,window:{showSaveFilePicker(){}}});
  const dest=destination(),progress=[];
  const r=await R.disk.save(name,dest,(d,t)=>progress.push([d,t]));
  const want=(await W.seekable(cut)).bytes;
  assert.deepEqual(dest.bytes(),Buffer.from(want));assert.equal(dest.closed,true);
  assert.equal(r.seekable,true);assert.equal(r.bytes,want.length);assert.ok(r.durationMs>1000&&r.durationMs<3000,`${r.durationMs}`);assert.ok(r.cut>0);
  assert.equal(dir.files.has(name),false,'the working file is deleted once saved');assert.equal(locks.held.size,0,'its lock released');
  assert.deepEqual(progress.at(-1),[want.length,want.length]);
});

test('a working file another window holds is neither saved nor discarded; a failed save keeps it',async()=>{
  const name='code-resonance-ab-1793000000001.webm',locks=lockManager(),{dir,storage:st}=storage({[name]:new Blob([liveWebm()])});
  const R=recordingModule({navigator:{storage:st,locks},Worker:function(){},FileSystemFileHandle:FileHandle,window:{showSaveFilePicker(){}}});
  let release;void locks.request(R.disk.FILE_LOCK+name,{mode:'exclusive',ifAvailable:true},()=>new Promise(r=>{release=r;}));await new Promise(r=>setTimeout(r,0));
  await assert.rejects(()=>R.disk.save(name,destination()),/another window/);
  await assert.rejects(()=>R.disk.discard(name),/another window/);
  assert.equal(dir.files.has(name),true);
  release();await new Promise(r=>setTimeout(r,0));
  // The chosen file cannot be written (a disk full, a folder gone): aborted, and the recording stays in the browser.
  const broken={name:'x.webm',aborted:false,async createWritable(){const d=this;return {write:async()=>{throw new Error('disk full');},close:async()=>{},abort:async()=>{d.aborted=true;}};}};
  await assert.rejects(()=>R.disk.save(name,broken),/disk full/);
  assert.equal(broken.aborted,true);assert.equal(dir.files.has(name),true);assert.equal(locks.held.size,0);
  await R.disk.discard(name);assert.equal(dir.files.has(name),false);
});

test('the Save dialog: a cancel records nothing and says so; another failure says why',async()=>{
  const base={navigator:{storage:storage().storage,locks:lockManager()},Worker:function(){},FileSystemFileHandle:FileHandle};
  const abort=Object.assign(new Error('The user aborted a request.'),{name:'AbortError'});
  let asked=null;
  const ok=await recordingModule({...base,window:{showSaveFilePicker:async o=>{asked=o;return {name:o.suggestedName};}}}).disk.choose('code-resonance-x-1.webm');
  assert.equal(ok.ok,true);assert.equal(ok.handle.name,'code-resonance-x-1.webm');assert.deepEqual(plain(asked.types[0].accept),{'video/webm':['.webm']});
  const cancelled=await recordingModule({...base,window:{showSaveFilePicker:async()=>{throw abort;}}}).disk.choose('a.webm');
  assert.equal(cancelled.ok,false);assert.equal(cancelled.cancelled,true);assert.match(cancelled.reason,/nothing was recorded/);
  const refused=await recordingModule({...base,window:{showSaveFilePicker:async()=>{throw Object.assign(new Error('Must be handling a user gesture'),{name:'SecurityError'});}}}).disk.choose('a.webm');
  assert.equal(refused.ok,false);assert.equal(refused.cancelled,undefined);assert.match(refused.reason,/only when a button is pressed/);
});

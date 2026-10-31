'use strict';
// Record to a file on disk: the worker that writes a recording as it is recorded, and copies it into the chosen file.
// Each chunk the browser's recorder delivers (one a second) is written at once, in place, to a file in this browser's own
// storage for the page (the origin private file system) through a synchronous access handle, the only browser file API
// that writes into the file itself: a FileSystemWritableFileStream writes to a temporary copy that Chromium discards
// when the page crashes or closes before the stream is closed, so a crash would lose the whole recording. Written here,
// a crash or a closed tab keeps everything up to the last chunk. The chunks are indexed as they pass (webm.js), so the
// file is made seekable when it is copied into the chosen file, here too, off the page's main thread (which is busy
// drawing the world). Nothing of the recording stays in memory: a chunk is read, written and dropped; the copy goes in
// pieces. The page (recording.js) owns the file's lock; this worker only writes and copies.
importScripts('webm.js');
const DIR='code-resonance-recordings',PIECE=8<<20;
let handle=null,name='',size=0,scan=null,queue=Promise.resolve(),failed=null,lastFlush=0;
const message=e=>String(e?.name&&e.name!=='Error'?`${e.name}: ${e.message}`:e?.message||e);
async function directory(){return (await navigator.storage.getDirectory()).getDirectoryHandle(DIR,{create:true});}
function closeHandle(){try{handle?.flush();handle?.close();}catch{}handle=null;}
// The working file copied into `dest` (made seekable when it can be indexed), then deleted. A destination this worker
// may not write (createWritable() refused here) is left to the page: {fallback:true}, nothing written, the file kept.
async function save(dest){
  const W=self.ResonanceWebm,index=scan?.index()||null,p=index&&W.plan(index);
  let w;
  try{w=await dest.createWritable();}catch(err){closeHandle();return {fallback:true,error:message(err),index};}
  try{
    const read=(at,n)=>{const b=new Uint8Array(n),r=handle.read(b,{at});return r===n?b:b.subarray(0,r);};
    let done=0,told=0;const progress=(d,t)=>{if(d-told>=PIECE||d===t){told=d;postMessage({op:'progress',done:d,total:t});}};
    if(p)done=await W.copy(p,read,b=>w.write(b),{piece:PIECE,progress});
    else for(let at=0;at<size;at+=PIECE){const b=read(at,Math.min(PIECE,size-at));await w.write(b);done+=b.length;progress(done,size);}
    await w.close();
    closeHandle();
    await (await directory()).removeEntry(name);
    return {saved:{bytes:done,seekable:!!p,durationMs:p?p.durationMs:null,width:index?.width||null,height:index?.height||null,cut:p?p.cut:0}};
  }catch(err){try{await w.abort();}catch{}closeHandle();return {error:message(err),index};}
}
self.onmessage=async e=>{
  const m=e.data||{};
  if(m.op==='probe'){
    // What this browser offers a worker: the private file system and synchronous access handles.
    try{
      if(typeof FileSystemFileHandle==='undefined'||!('createSyncAccessHandle' in FileSystemFileHandle.prototype))throw new Error('no synchronous file access in workers');
      await directory();
      postMessage({op:'probe',ok:true});
    }catch(err){postMessage({op:'probe',ok:false,error:message(err)});}
    return;
  }
  if(m.op==='open'){
    try{
      const d=await directory(),f=await d.getFileHandle(m.name,{create:true});
      handle=await f.createSyncAccessHandle();name=m.name;size=handle.getSize();scan=self.ResonanceWebm.scanner();lastFlush=Date.now();
      postMessage({op:'open',ok:true});
    }catch(err){postMessage({op:'open',ok:false,error:message(err)});}
    return;
  }
  if(m.op==='write'){
    // In order, one at a time; a failed write (the disk or the browser's storage full) stops the recording.
    queue=queue.then(async()=>{
      if(failed||!handle)return;
      const bytes=new Uint8Array(await m.blob.arrayBuffer());
      const n=handle.write(bytes,{at:size});
      if(n!==bytes.length){size+=n;throw new Error(`only ${n} of ${bytes.length} bytes could be written: the disk or this browser's storage is full`);}
      size+=n;scan.feed(bytes);
      // On disk for the operating system too (a power cut), every few seconds.
      if(Date.now()-lastFlush>4000){handle.flush();lastFlush=Date.now();}
      postMessage({op:'written',bytes:size});
    }).catch(err=>{if(!failed){failed=err;postMessage({op:'failed',error:message(err),bytes:size});}});
    return;
  }
  if(m.op==='close'){
    // After the last chunk: on disk, then copied into the chosen file (`dest`) or closed and kept.
    await queue;
    try{handle?.flush();}catch{}
    const r=m.dest&&handle&&size>0?await save(m.dest):(closeHandle(),{index:scan?.index()||null,empty:!size});
    postMessage({op:'closed',bytes:size,writeError:failed?message(failed):null,...r});
    return;
  }
  if(m.op==='save'){
    // An interrupted recording (the page holds its lock): indexed up to its last complete block, then copied.
    try{
      const d=await directory(),f=await d.getFileHandle(m.name);
      handle=await f.createSyncAccessHandle();name=m.name;size=handle.getSize();scan=self.ResonanceWebm.scanner();
      const buf=new Uint8Array(PIECE);
      for(let at=0;at<size;){const n=handle.read(buf,{at});if(!n)break;scan.feed(buf.subarray(0,n));at+=n;postMessage({op:'progress',phase:'reading',done:at,total:size});}
      postMessage({op:'saved',...await save(m.dest)});
    }catch(err){closeHandle();postMessage({op:'saved',error:message(err),open:true});}
  }
};

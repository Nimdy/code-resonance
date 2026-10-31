'use strict';
// Record to a file on disk: the worker that writes a recording as it is recorded. Each chunk the browser's recorder
// delivers (one a second) is written at once, in place, to a file in this browser's own storage for the page (the
// origin private file system) through a synchronous access handle, the only browser file API that writes into the file
// itself: a FileSystemWritableFileStream writes to a temporary copy that Chromium discards when the page crashes or
// closes before the stream is closed, so a crash would lose the whole recording. Written here, a crash or a closed tab
// keeps everything up to the last chunk. The chunks are indexed as they pass (webm.js), so the file can be made seekable
// when it is saved. Nothing of the recording stays in memory: a chunk is read, written and dropped.
// The page (recording.js) owns the file's lock and saves the file where the user chose; this worker only writes.
importScripts('webm.js');
const DIR='code-resonance-recordings';
let handle=null,size=0,scan=null,queue=Promise.resolve(),failed=null,lastFlush=0;
const message=e=>String(e?.name&&e.name!=='Error'?`${e.name}: ${e.message}`:e?.message||e);
async function directory(){return (await navigator.storage.getDirectory()).getDirectoryHandle(DIR,{create:true});}
self.onmessage=async e=>{
  const m=e.data||{};
  if(m.op==='probe'){
    // What this browser offers a worker: the private file system and synchronous access handles.
    try{
      if(typeof FileSystemFileHandle==='undefined'||!('createSyncAccessHandle' in FileSystemFileHandle.prototype))throw new Error('no synchronous file access in workers');
      await directory();
      const est=await navigator.storage.estimate?.().catch(()=>null);
      postMessage({op:'probe',ok:true,quota:est?.quota??null,usage:est?.usage??null});
    }catch(err){postMessage({op:'probe',ok:false,error:message(err)});}
    return;
  }
  if(m.op==='open'){
    try{
      const d=await directory(),f=await d.getFileHandle(m.name,{create:true});
      handle=await f.createSyncAccessHandle();size=handle.getSize();scan=self.ResonanceWebm.scanner();lastFlush=Date.now();
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
    // After the last chunk: on disk, the file closed (the page reads it to save it), and the index of what was written.
    await queue;
    let index=null;
    try{index=scan?.index()||null;}catch{}
    try{handle?.flush();handle?.close();}catch{}
    handle=null;
    postMessage({op:'closed',bytes:size,index,error:failed?message(failed):null});
  }
};

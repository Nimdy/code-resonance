'use strict';
// Safe local import of visual packs: a ZIP archive, or the files of a folder the browser picked ([{path, data(base64)}]).
// Nothing in an import is trusted. The archive is parsed by the bounded reader below (no dependency); every name is
// checked before anything touches the disk; sizes are limited before decompression (declared) and during it
// (maxOutputLength), then checked again with the CRC. Accepted files land in a private quarantine directory
// <data>/packs/.quarantine/<importId>/ (the registry ignores dot-directories) and packs.inspect, the one validator,
// reports on them. Installation goes through packs.install, which copies, verifies and keeps an approval only for
// identical files: this module never approves anything.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const packs=require('../engine/packs');
const {LIMITS}=packs;
const RECORDS=4096,TTL_MS=30*60*1000,PENDING=8,SEGMENT=128,PATH_LENGTH=240;
const ID=/^[0-9a-f]{16}$/;
const UTF8=new TextDecoder('utf-8',{fatal:true});
const fail=(code,message,extra)=>Object.assign(new Error(message),{code},extra);
const show=name=>JSON.stringify(String(name).slice(0,80));
// CRC-32 (IEEE, the ZIP polynomial): Node 20 has no zlib.crc32.
const CRC_TABLE=new Int32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c;});
function crc32(buf){let c=-1;for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&255]^(c>>>8);return (c^-1)>>>0;}
// ---- Names --------------------------------------------------------------------------------------------------------
// Beyond traversal, names must be writable unchanged on Windows too: no ':' (a drive, or an NTFS alternate data
// stream), no reserved characters or device names, no trailing dot or space (Windows silently drops them, which would
// make two different names one file).
const RESERVED=/^(?:con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3]|conin\$|conout\$)(?:\..*)?$/i;
function segmentsOf(name){
  if(typeof name!=='string'||!name)throw fail('unsafe-path','an entry has no name');
  if(/[\u0000-\u001f\u007f]/.test(name))throw fail('unsafe-path',`${show(name)}: control characters (NUL included) are not allowed in names`);
  if(name.includes('\\'))throw fail('unsafe-path',`${show(name)}: backslashes are not allowed in names (use /)`);
  if(name.startsWith('/')||/^[A-Za-z]:/.test(name))throw fail('unsafe-path',`${show(name)}: absolute paths are not allowed`);
  if(name.length>PATH_LENGTH)throw fail('unsafe-path',`${show(name)}: paths are limited to ${PATH_LENGTH} characters`);
  const segs=name.split('/');
  for(const s of segs){
    if(!s)throw fail('unsafe-path',`${show(name)}: empty path segment`);
    if(s==='.'||s==='..')throw fail('unsafe-path',`${show(name)}: "." and ".." are not allowed in paths`);
    if(s.length>SEGMENT)throw fail('unsafe-path',`${show(name)}: path segments are limited to ${SEGMENT} characters`);
    if(/[<>:"|?*]/.test(s)||/[. ]$/.test(s)||RESERVED.test(s))throw fail('unsafe-path',`${show(name)}: not a portable file name`);
  }
  return segs;
}
// ---- ZIP ----------------------------------------------------------------------------------------------------------
const bad=message=>fail('invalid-archive',message);
// A ZIP64 extended-information extra field (id 0x0001) means sizes or offsets live elsewhere: refused, like the markers.
function zip64Extra(extra){for(let p=0;p+4<=extra.length;p+=4+extra.readUInt16LE(p+2))if(extra.readUInt16LE(p)===1)return true;return false;}
// The central directory: the only source of names, sizes, CRCs and types (local headers are checked against it).
function centralDirectory(buf){
  if(buf.length<22)throw bad('not a ZIP archive');
  // The end record must end the file exactly (with its comment): a signature inside a comment never matches.
  let eocd=-1;
  for(let i=buf.length-22;i>=Math.max(0,buf.length-22-0xFFFF);i--)if(buf.readUInt32LE(i)===0x06054b50&&i+22+buf.readUInt16LE(i+20)===buf.length){eocd=i;break;}
  if(eocd<0)throw bad('not a ZIP archive (no end of central directory)');
  const disk=buf.readUInt16LE(eocd+4),cdDisk=buf.readUInt16LE(eocd+6),onDisk=buf.readUInt16LE(eocd+8),total=buf.readUInt16LE(eocd+10),cdSize=buf.readUInt32LE(eocd+12),cdOffset=buf.readUInt32LE(eocd+16);
  if([disk,cdDisk,onDisk,total].includes(0xFFFF)||cdSize===0xFFFFFFFF||cdOffset===0xFFFFFFFF||(eocd>=20&&buf.readUInt32LE(eocd-20)===0x07064b50))throw bad('ZIP64 archives are not supported');
  if(disk||cdDisk||onDisk!==total)throw bad('multi-part archives are not supported');
  if(total>RECORDS)throw fail('too-many-files',`more than ${RECORDS} entries in the archive`);
  const end=cdOffset+cdSize;if(end>eocd)throw bad('corrupt archive (central directory out of bounds)');
  const entries=[];let p=cdOffset;
  for(let n=0;n<total;n++){
    if(p+46>end||buf.readUInt32LE(p)!==0x02014b50)throw bad('corrupt archive (central directory)');
    const nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),next=p+46+nameLen+extraLen+buf.readUInt16LE(p+32);
    if(next>end)throw bad('corrupt archive (central directory)');
    const raw=buf.subarray(p+46,p+46+nameLen);let name;
    try{name=UTF8.decode(raw);}catch{throw fail('unsafe-path','an entry name is not valid UTF-8');}
    const e={name,raw,flags:buf.readUInt16LE(p+8),method:buf.readUInt16LE(p+10),crc:buf.readUInt32LE(p+16),csize:buf.readUInt32LE(p+20),usize:buf.readUInt32LE(p+24),
      diskStart:buf.readUInt16LE(p+34),mode:buf.readUInt32LE(p+38)>>>16,offset:buf.readUInt32LE(p+42)};
    if(e.csize===0xFFFFFFFF||e.usize===0xFFFFFFFF||e.offset===0xFFFFFFFF||e.diskStart===0xFFFF||zip64Extra(buf.subarray(p+46+nameLen,p+46+nameLen+extraLen)))throw bad(`${show(name)}: ZIP64 entries are not supported`);
    entries.push(e);p=next;
  }
  if(p!==end)throw bad('corrupt archive (central directory size)');
  return {entries,cdOffset};
}
// Entries as names + checks, before any data is read: types, encryption, methods.
function zipEntries(buf){
  const {entries,cdOffset}=centralDirectory(buf);
  return entries.map(e=>{
    // Unix permission bits in the high half of the external attributes (zero for archives made on Windows).
    const type=e.mode&0o170000,dir=e.name.endsWith('/')||type===0o040000;
    const segs=segmentsOf(e.name.endsWith('/')?e.name.slice(0,-1):e.name);
    if(type===0o120000)throw fail('unsafe-path',`${show(e.name)}: symbolic links are not allowed`);
    if(type&&type!==0o100000&&type!==0o040000)throw fail('unsafe-path',`${show(e.name)}: only regular files and directories are allowed`);
    if(e.flags&0x41)throw bad(`${show(e.name)}: encrypted entries are not supported`);
    if(dir){if(e.usize)throw bad(`${show(e.name)}: a directory entry with content`);return {segs,dir:true};}
    if(e.method!==0&&e.method!==8)throw bad(`${show(e.name)}: unsupported compression method ${e.method} (only stored and deflate)`);
    return {segs,dir:false,size:e.usize,read:()=>entryData(buf,e,cdOffset)};
  });
}
// One file's bytes: the local header must agree with the central directory, the output may never exceed the declared
// size (a lying archive stops at the limit, it is never inflated fully), and the CRC must match.
function entryData(buf,e,cdOffset){
  const p=e.offset;
  if(p+30>cdOffset||buf.readUInt32LE(p)!==0x04034b50)throw bad(`${show(e.name)}: corrupt local header`);
  const flags=buf.readUInt16LE(p+6),method=buf.readUInt16LE(p+8),nameLen=buf.readUInt16LE(p+26),extraLen=buf.readUInt16LE(p+28),start=p+30+nameLen+extraLen,end=start+e.csize;
  if(end>cdOffset)throw bad(`${show(e.name)}: data out of bounds`);
  if(flags&0x41)throw bad(`${show(e.name)}: encrypted entries are not supported`);
  if(method!==e.method||!buf.subarray(p+30,p+30+nameLen).equals(e.raw))throw bad(`${show(e.name)}: local header differs from the central directory`);
  if(zip64Extra(buf.subarray(p+30+nameLen,start)))throw bad(`${show(e.name)}: ZIP64 entries are not supported`);
  const packed=buf.subarray(start,end);let data;
  if(method===0){if(e.csize!==e.usize)throw bad(`${show(e.name)}: size differs from the central directory`);data=packed;}
  else try{data=zlib.inflateRawSync(packed,{maxOutputLength:Math.max(1,e.usize)});}
  catch(err){throw bad(err.code==='ERR_BUFFER_TOO_LARGE'?`${show(e.name)}: expands beyond its declared size`:`${show(e.name)}: corrupt compressed data`);}
  if(data.length!==e.usize)throw bad(`${show(e.name)}: size differs from the central directory`);
  if(crc32(data)!==e.crc)throw bad(`${show(e.name)}: CRC-32 mismatch`);
  return data;
}
// ---- Folder imports -----------------------------------------------------------------------------------------------
const BASE64=/^[A-Za-z0-9+/]*={0,2}$/;
function folderEntries(list){
  if(list&&!Array.isArray(list)&&Array.isArray(list.files))list=list.files;
  if(!Array.isArray(list))throw bad('expected a list of files');
  if(list.length>RECORDS)throw fail('too-many-files',`more than ${RECORDS} files`);
  return list.map(f=>{
    if(!f||typeof f!=='object'||typeof f.data!=='string')throw bad('every file needs a path and base64 data');
    const segs=segmentsOf(f.path),s=f.data;
    if(s.length%4||!BASE64.test(s))throw bad(`${show(f.path)}: data is not valid base64`);
    // The decoded size is known from the text: limits apply before anything is decoded.
    return {segs,dir:false,size:s.length/4*3-(s.endsWith('==')?2:s.endsWith('=')?1:0),read:()=>Buffer.from(s,'base64')};
  });
}
// ---- Common rules (both formats) ----------------------------------------------------------------------------------
function accept(items){
  const warnings=[];let skipped=0;
  // macOS archive metadata (resource forks, Finder state) is dropped, not installed.
  items=items.filter(i=>(i.segs[0]==='__MACOSX'||i.segs[i.segs.length-1]==='.DS_Store')?(skipped++,false):true);
  if(skipped)warnings.push(`${skipped} macOS metadata ${skipped===1?'entry':'entries'} (__MACOSX/, .DS_Store) skipped`);
  // A pack zipped (or picked) as its folder: one shared top-level directory and no root pack.json → strip it.
  const files=items.filter(i=>!i.dir),top=files[0]?.segs[0];
  if(files.length&&files.every(f=>f.segs.length>1&&f.segs[0]===top)&&items.every(i=>i.segs[0]===top))
    items=items.map(i=>({...i,segs:i.segs.slice(1)})).filter(i=>i.segs.length);
  // Case-insensitive names (Windows and macOS file systems), and no file where another entry needs a directory.
  const names=new Set(),dirs=new Set();
  for(const i of items){const key=i.segs.join('/').toLowerCase();
    if(!i.dir){if(names.has(key))throw fail('unsafe-path',`${show(i.segs.join('/'))}: duplicate name (names are compared without case)`);names.add(key);}
    for(let n=1;n<(i.dir?i.segs.length+1:i.segs.length);n++)dirs.add(i.segs.slice(0,n).join('/').toLowerCase());}
  for(const d of dirs)if(names.has(d))throw fail('unsafe-path',`${show(d)}: is both a file and a directory`);
  const kept=items.filter(i=>!i.dir);
  if(kept.length>LIMITS.files)throw fail('too-many-files',`at most ${LIMITS.files} files`);
  for(const f of kept)if(f.size>LIMITS.fileBytes)throw fail('too-large',`${show(f.segs.join('/'))}: larger than ${LIMITS.fileBytes>>20} MB`);
  if(kept.reduce((n,f)=>n+f.size,0)>LIMITS.totalBytes)throw fail('too-large',`larger than ${LIMITS.totalBytes>>20} MB in total`);
  // Everything is read (and verified) in memory, bounded by the declared sizes just checked, before the disk is touched.
  return {files:kept.map(f=>{const data=f.read();if(data.length!==f.size)throw bad(`${show(f.segs.join('/'))}: size differs`);return {segs:f.segs,data};}),warnings};
}
// What a pack of each kind can do once installed, for the review screen (kept in step with docs/packs/security.md).
function access(kind){
  if(kind==='declarative')return {kind,code:false,approval:false,network:false,data:'none',
    summary:'Data only: parameter values, palette, light, technique and effect mapping for an existing world. It contains no code and can be used at once.'};
  if(!packs.executable(kind))return null;
  return {kind,code:true,approval:true,network:false,data:'performance-view',isolation:'worker',gpuSandboxed:false,
    summary:`Contains code (${kind==='world'?'a JavaScript world module and GLSL shaders':'GLSL shaders, optionally a JavaScript effects module'}) that runs only after you approve these exact files.`,
    notes:['Runs in a worker inside an isolated frame: no network access, no access to the receiver, your files, your recordings or the player.',
      'Receives only the privacy-safe performance view (salted ids, counts, timings).',
      'Browsers cannot fully sandbox GPU shaders: a hostile or buggy shader can freeze or crash the browser tab or the graphics driver, and GPU timing can leak coarse information between pages.',
      'A pack that hangs is stopped after 6 s but can keep a processor core busy a few seconds longer.',
      'Any change to any file of the pack needs a new approval.']};
}
const text=v=>typeof v==='string'?v:null;
function createImports({dataDir,registry=null,now=Date.now,ttlMs=TTL_MS,maxPending=PENDING}={}){
  if(!dataDir)throw new Error('createImports needs a dataDir');
  dataDir=path.resolve(dataDir);
  const reg=registry||packs.createRegistry(dataDir),root=path.join(packs.packsDir(dataDir),'.quarantine');
  const pending=new Map();
  const rm=dir=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:50});
  function drop(id){const e=pending.get(id);if(e){clearTimeout(e.timer);pending.delete(id);}rm(path.join(root,id));}
  function sweep(){
    const t=now();let removed=0;
    for(const [id,e] of pending)if(t-e.createdAt>=ttlMs){drop(id);removed++;}
    // Directories no pending import owns (a crash, an earlier receiver) go too.
    let names=[];try{names=fs.readdirSync(root);}catch{}
    for(const n of names)if(!pending.has(n)){rm(path.join(root,n));removed++;}
    return removed;
  }
  function lookup(id){
    const e=typeof id==='string'&&ID.test(id)?pending.get(id):null;
    if(e&&now()-e.createdAt>=ttlMs){drop(id);return null;}
    return e||null;
  }
  // The review report: inspect's findings, without the quarantine location (inspect messages may quote it).
  function report(e){
    const r=packs.inspect(e.dir,reg.snapshot());
    const clean=s=>String(s).split(e.dir+path.sep).join('').split(e.dir).join('.');
    const m=r.manifest&&typeof r.manifest==='object'&&!Array.isArray(r.manifest)?r.manifest:null;
    const installed=m&&typeof m.id==='string'?reg.get(m.id):null;
    return {importId:e.id,
      manifest:m&&{id:text(m.id),name:text(m.name),version:text(m.version),kind:text(m.kind),sdk:text(m.sdk),
        author:m.author&&typeof m.author==='object'?{name:text(m.author.name),...(typeof m.author.url==='string'?{url:m.author.url}:{})}:null,
        description:text(m.description),license:text(m.license)},
      executable:!!m&&packs.executable(m.kind),files:r.files.map(f=>({path:f.path,size:f.size,sha256:f.sha256})),digest:r.digest,
      errors:r.errors.map(x=>({at:clean(x.at),message:clean(x.message)})),warnings:[...e.warnings,...r.warnings.map(clean)],
      // registry.get looks ids up in a plain object: the id check keeps "constructor" and friends out.
      installed:installed&&installed.id===m.id?{version:installed.version,digest:installed.digest,trusted:installed.trusted}:null,
      access:m?access(m.kind):null,expiresAt:e.createdAt+ttlMs};
  }
  function admit(parse){
    sweep();
    if(pending.size>=maxPending)throw fail('pending-limit',`at most ${maxPending} imports can wait for review: install or discard one first`);
    const {files,warnings}=accept(parse());
    const id=crypto.randomBytes(8).toString('hex'),dir=path.join(root,id);
    try{
      fs.mkdirSync(root,{recursive:true,mode:0o700});fs.mkdirSync(dir,{mode:0o700});
      for(const f of files){
        const to=path.join(dir,...f.segs);if(!to.startsWith(dir+path.sep))throw fail('unsafe-path',`${show(f.segs.join('/'))}: outside the pack`);
        fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});
        // 'wx': a name the checks above missed but the file system folds onto another fails instead of overwriting.
        try{fs.writeFileSync(to,f.data,{mode:0o600,flag:'wx'});}
        catch(err){if(['EEXIST','ENOTDIR','EISDIR'].includes(err.code))throw fail('unsafe-path',`${show(f.segs.join('/'))}: conflicts with another entry`);throw err;}
      }
    }catch(err){rm(dir);throw err;}
    const e={id,dir,createdAt:now(),warnings,timer:setTimeout(()=>{try{drop(id);}catch{}},ttlMs)};e.timer.unref?.();
    pending.set(id,e);
    try{return report(e);}catch(err){drop(id);throw err;}
  }
  return {
    fromZip:buffer=>admit(()=>{
      if(!(buffer instanceof Uint8Array))throw bad('expected the bytes of a ZIP archive');
      return zipEntries(Buffer.from(buffer.buffer,buffer.byteOffset,buffer.byteLength));}),
    fromFiles:list=>admit(()=>folderEntries(list)),
    get(id){const e=lookup(id);return e?report(e):null;},
    install(id,digest){
      const e=lookup(id);if(!e)throw fail('not-found','No such import (it may have expired): import the pack again');
      // Inspected again: the review must be of exactly the files that get installed. Inspection and installation run
      // in one synchronous turn on a directory only this user can reach.
      const r=report(e);
      if(r.errors.length)throw fail('invalid-pack','The pack has errors and cannot be installed',{report:r});
      if(typeof digest!=='string'||digest!==r.digest)throw fail('changed','The pack changed since it was shown; review it again',{report:r});
      let out;
      try{out=packs.install(e.dir,dataDir,{registry:reg.snapshot(),now:now()});}
      catch(err){if(err.report)throw fail('invalid-pack','The pack has errors and cannot be installed',{report:r});
        if(/changed during installation/.test(err.message))throw fail('changed',err.message);throw err;}
      drop(id);
      return out;
    },
    discard(id){if(!lookup(id))throw fail('not-found','No such import (it may have expired)');drop(id);return {importId:id,discarded:true};},
    sweep,
    pending:()=>pending.size,
    // Receiver start (and stop): nothing waits in quarantine across runs.
    clear(){for(const e of pending.values())clearTimeout(e.timer);pending.clear();rm(root);},
    close(){for(const e of pending.values())clearTimeout(e.timer);}
  };
}
module.exports={createImports,crc32,LIMITS,RECORDS,TTL_MS,PENDING};

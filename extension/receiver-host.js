'use strict';
// The receiver bundled with the extension: where its files are, whether a receiver already answers, and starting,
// reusing and stopping one. No `vscode` import (tests/receiver-host.test.js); extension.js is the interface.
//
// A port has at most one receiver, and a data directory at most one receiver. A receiver that proves it holds this data
// directory's token (./proof.js) is reused, whoever started it: `npm start` or `npm run up` in a checkout, another
// window, another VS Code. One the extension started (it is named in <data>/bundled-receiver.json) is replaced only by a
// newer extension, or when its own files are gone. Anything else on the port is left alone and is sent nothing. Starting
// is serialised across windows by a lock file in the data directory, and everything is checked again under the lock.
// The receiver runs detached in VS Code's own runtime (runtimeCommand) through ./launcher.js, which logs to
// <data>/logs/receiver.log and stops when asked through <data>/bundled-receiver.stop (no signal, so Windows too).
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {verifyServer}=require('./proof');
const STATE='bundled-receiver.json',STOP='bundled-receiver.stop',LOCK='bundled-receiver.lock';
const LOG_LIMIT=5*1024*1024;
const LOCK_STALE_MS=90000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const validPort=p=>Number.isInteger(p)&&p>=1&&p<=65535;
// The data directory the receiver, the hooks and the command-line tools share: RESONANCE_DATA, else ~/.code-resonance.
function dataDir(env=process.env){return path.resolve(env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));}
function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function readAuth(dir){const a=readJSON(path.join(dir,'receiver-auth.json'));return a&&typeof a.token==='string'&&a.token.length>=40?a:null;}
function logFile(dir){return path.join(dir,'logs','receiver.log');}
// Numeric comparison of "major.minor.patch" (a pre-release suffix is ignored): 1, 0 or -1.
function compareVersions(a,b){
  const parts=v=>String(v||'').split('-')[0].split('.').map(n=>parseInt(n,10)||0);
  const x=parts(a),y=parts(b);
  for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return Math.sign(d);}
  return 0;
}
// The receiver's files: runtime/ inside an installed extension (the VSIX), else the checkout the extension folder sits in
// (development, the qualification). null when neither is there.
function findRuntime(extensionDir){
  const bundled=path.join(extensionDir,'runtime');
  if(fs.existsSync(path.join(bundled,'receiver','server.js')))return {root:bundled,kind:'bundled'};
  const checkout=path.dirname(extensionDir);
  if(fs.existsSync(path.join(checkout,'receiver','server.js'))&&readJSON(path.join(checkout,'package.json'))?.name==='code-resonance')return {root:checkout,kind:'checkout'};
  return null;
}
// VS Code's own runtime runs the receiver. On the desktop, process.execPath is VS Code's Electron, which
// ELECTRON_RUN_AS_NODE=1 turns into plain Node (as VS Code's own `code` CLI and TypeScript server use it); in a WSL, SSH
// or container window it is the VS Code server's node. Either is always present and as recent as the engine VS Code
// requires (Node 20 or later since VS Code 1.99), and it runs where the extension host runs, unlike a `node` on PATH.
function runtimeCommand(proc=process){return {command:proc.execPath,electron:!!proc.versions?.electron,node:proc.versions?.node||''};}
// What the receiver process inherits: not VS Code's own variables (they would make it talk to this VS Code), not
// NODE_OPTIONS (an --inspect there would collide with the extension host's), never RESONANCE_ALLOW_REMOTE (loopback only).
function childEnv(base,{dataDir:dir,port,electron}){
  const env={};
  for(const [k,v] of Object.entries(base||{}))if(!/^(ELECTRON_|VSCODE_)/i.test(k)&&!/^(NODE_OPTIONS|RESONANCE_ALLOW_REMOTE)$/i.test(k))env[k]=v;
  if(electron)env.ELECTRON_RUN_AS_NODE='1';
  env.RESONANCE_DATA=dir;env.RESONANCE_PORT=String(port);
  return env;
}
// 'free' when nothing listens on 127.0.0.1:<port> (connection refused), 'open' otherwise (accepted, or anything else
// that does not prove the port is free).
function portState(port,timeoutMs=1500){
  return new Promise(resolve=>{
    const s=net.connect({host:'127.0.0.1',port});
    const done=v=>{s.destroy();resolve(v);};
    s.setTimeout(timeoutMs,()=>done('open'));
    s.once('connect',()=>done('open'));
    s.once('error',e=>done(e.code==='ECONNREFUSED'?'free':'open'));
  });
}
// A Code Resonance /health document (no secret is sent): tells "another program" from "a receiver with another token".
function health(port,timeoutMs=1500){
  return new Promise(resolve=>{
    const req=http.get({hostname:'127.0.0.1',port,path:'/health',timeout:timeoutMs,headers:{Accept:'application/json'}},res=>{
      let body='';res.setEncoding('utf8');res.on('data',c=>{body+=c;if(body.length>4096)req.destroy();});
      res.on('end',()=>{try{const d=JSON.parse(body);resolve(res.statusCode===200&&d&&d.ok===true&&typeof d.version==='string'?d:null);}catch{resolve(null);}});
      res.on('error',()=>resolve(null));
    });
    req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(null));
  });
}
// Who is on the port: 'free'; 'verified' (it proved it holds this data directory's token); or 'foreign' with a reason:
// 'receiver' (a Code Resonance receiver of another data directory or token), 'program' (anything else).
async function occupant(port,dir,{timeoutMs=3000}={}){
  if(!validPort(port))return {state:'foreign',reason:'program'};
  if(await portState(port)==='free')return {state:'free'};
  const auth=readAuth(dir);
  if(auth)try{await verifyServer(port,auth.token,timeoutMs);return {state:'verified',auth};}catch{}
  const h=await health(port);
  return {state:'foreign',reason:h?'receiver':'program',version:h?.version};
}
function readState(dir){const s=readJSON(path.join(dir,STATE));return s&&Number.isInteger(s.pid)&&validPort(s.port)&&typeof s.instance==='string'?s:null;}
function alive(pid){if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}
// The receiver the extension started, if it is still running (on this port, when one is given).
function bundled(dir,port){const s=readState(dir);return s&&alive(s.pid)&&(port===undefined||s.port===port)?s:null;}
function replaceable(state,{version,runtime}){
  if(compareVersions(version,state.version)>0)return true;
  // Started from files that are gone (an older extension folder VS Code removed): its pages would no longer load.
  return !!(state.runtime&&runtime&&path.resolve(state.runtime)!==path.resolve(runtime.root)&&!fs.existsSync(path.join(state.runtime,'receiver','server.js')));
}
// A verified receiver of this data directory on another port (the last port in receiver-auth.json, or the one the
// extension started): starting a second one would have two receivers interpret the same journals.
async function elsewhere(dir,port){
  const candidates=[...new Set([readAuth(dir)?.port,readState(dir)?.port])].filter(p=>validPort(p)&&p!==port);
  for(const p of candidates)if((await occupant(p,dir)).state==='verified')return p;
  return null;
}
// An exclusive lock file (created with O_EXCL) naming its holder. A holder that is not running any more, or a lock older
// than LOCK_STALE_MS, is stale and taken over. `ready` is asked while waiting: true ends the wait without the lock.
async function acquireLock(dir,{timeoutMs=45000,ready}={}){
  const file=path.join(dir,LOCK),t0=Date.now();
  await fsp.mkdir(dir,{recursive:true,mode:0o700});
  for(;;){
    try{
      const fd=await fsp.open(file,'wx',0o600);
      try{await fd.writeFile(JSON.stringify({pid:process.pid,at:Date.now()}));}finally{await fd.close();}
      return {release:async()=>{if(readJSON(file)?.pid===process.pid)await fsp.rm(file,{force:true});}};
    }catch(e){if(e.code!=='EEXIST')throw e;}
    const held=readJSON(file);let age=0;try{age=Date.now()-fs.statSync(file).mtimeMs;}catch{continue;}
    // An unreadable lock is one being written: stale only once it is old.
    const stale=held?held.pid===process.pid||!alive(held.pid)||age>LOCK_STALE_MS:age>5000;
    if(stale){await fsp.rm(file,{force:true});continue;}
    if(ready&&await ready())return 'ready';
    if(Date.now()-t0>timeoutMs)return null;
    await sleep(250);
  }
}
// The log the receiver writes (stdout and stderr), kept to two files of at most 5 MB.
function openLog(dir,header){
  const file=logFile(dir);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  try{if(fs.statSync(file).size>LOG_LIMIT)fs.renameSync(file,`${file}.1`);}catch{}
  const fd=fs.openSync(file,'a',0o600);
  fs.writeSync(fd,`\n--- ${new Date().toISOString()} ${header}\n`);
  return {file,fd};
}
function logTail(dir,bytes=1600){try{const b=fs.readFileSync(logFile(dir));return b.subarray(Math.max(0,b.length-bytes)).toString('utf8').trim();}catch{return '';}}
// Asks the receiver the extension started to stop (the launcher polls for this file every second), and waits until it
// has. As a last resort, outside Windows, SIGTERM to that process (the launcher stops cleanly on it too).
async function requestStop(dir,state,{timeoutMs=20000,log=()=>{}}={}){
  const stopFile=path.join(dir,STOP);
  await fsp.writeFile(stopFile,JSON.stringify({instance:state.instance,at:Date.now()}),{mode:0o600});
  const gone=()=>!alive(state.pid)||readState(dir)?.instance!==state.instance;
  const wait=async ms=>{const t0=Date.now();while(Date.now()-t0<ms){if(gone()&&await portState(state.port)==='free')return true;await sleep(200);}return false;};
  let stopped=await wait(timeoutMs);
  if(!stopped&&process.platform!=='win32'&&alive(state.pid)&&readState(dir)?.instance===state.instance){
    log(`The receiver (process ${state.pid}) did not stop within ${Math.round(timeoutMs/1000)} s; sending it SIGTERM.`);
    try{process.kill(state.pid,'SIGTERM');}catch{}
    stopped=await wait(10000);
  }
  if(readJSON(stopFile)?.instance===state.instance)await fsp.rm(stopFile,{force:true}).catch(()=>{});
  return stopped;
}
async function spawnReceiver(o){
  const {port,dir,runtime,launcher,version,log=()=>{},spawnImpl=spawn,proc=process,readyMs=45000}=o;
  const instance=crypto.randomBytes(12).toString('hex'),rt=runtimeCommand(proc);
  const out=openLog(dir,`extension ${version} starts the receiver on 127.0.0.1:${port} (runtime ${runtime.root})`);
  log(`Starting the bundled receiver on 127.0.0.1:${port} with ${rt.electron?`VS Code's runtime (${rt.command}, ELECTRON_RUN_AS_NODE=1, Node ${rt.node})`:`Node ${rt.node} (${rt.command})`}. Data: ${dir}. Log: ${out.file}`);
  let child;
  try{
    // Detached, so it keeps running when this window or VS Code closes; its working directory is the data directory, so
    // it never holds an extension folder VS Code wants to remove after an update.
    child=spawnImpl(rt.command,[launcher,'--runtime',runtime.root,'--data',dir,'--port',String(port),'--instance',instance,'--version',version],
      {cwd:dir,env:childEnv(proc.env,{dataDir:dir,port,electron:rt.electron}),detached:true,stdio:['ignore',out.fd,out.fd],windowsHide:true});
  }catch(e){return {status:'failed',port,message:`The receiver could not be started: ${e.message}`,log:out.file};}
  finally{fs.closeSync(out.fd);}
  let exited=null;
  child.once('exit',(code,signal)=>{exited={code,signal};});child.once('error',e=>{exited={error:e};});
  child.unref();
  const t0=Date.now();
  while(Date.now()-t0<readyMs){
    const occ=await occupant(port,dir,{timeoutMs:1000});
    const state=readState(dir);
    if(occ.state==='verified'&&state?.instance===instance){log(`The receiver is running: process ${state.pid}, http://127.0.0.1:${port}/`);return {status:'started',owner:'bundled',port,state,log:out.file};}
    if(exited){
      // Exit code 3: the port was taken between the check and the start. If that is a receiver of this data directory
      // (another window won the race outside the lock, a checkout's npm start), it is reused.
      if(exited.code===3){
        const now=await occupant(port,dir);
        if(now.state==='verified')return {status:'reused',owner:bundled(dir,port)?'bundled':'external',port,state:bundled(dir,port),log:out.file};
        return {status:'occupied',port,reason:now.reason||'program',log:out.file};
      }
      const why=exited.error?exited.error.message:`exit ${exited.code??exited.signal}`;
      return {status:'failed',port,message:`The receiver stopped before it was ready (${why}).`,detail:logTail(dir),log:out.file};
    }
    await sleep(200);
  }
  // Never ready: stop what was started rather than leave a half-started process behind.
  try{child.kill();}catch{}
  return {status:'failed',port,message:`The receiver did not answer on 127.0.0.1:${port} within ${Math.round(readyMs/1000)} s.`,detail:logTail(dir),log:out.file};
}
const reused=(dir,port)=>{const s=bundled(dir,port);return {status:'reused',owner:s?'bundled':'external',port,state:s};};
async function ensureOnce(o){
  const {port,dir,runtime,version,start=true,log=()=>{}}=o;
  if(!validPort(port))return {status:'failed',port,message:`resonance.receiverPort ${port} is not a valid port`};
  let occ=await occupant(port,dir);
  if(occ.state==='verified'){
    const mine=bundled(dir,port);
    if(!(mine&&start&&runtime&&replaceable(mine,o)))return reused(dir,port);
    // An older extension's receiver: replaced by this one (an older window keeps using a newer receiver instead).
    const lock=await acquireLock(dir);
    if(!lock||lock==='ready')return reused(dir,port);
    try{
      const again=bundled(dir,port);
      if(!again||again.instance!==mine.instance||(await occupant(port,dir)).state!=='verified')return reused(dir,port);
      log(`The receiver on port ${port} was started by Code Resonance ${mine.version||'(unknown)'}; replacing it with ${version}.`);
      if(!await requestStop(dir,mine,{log})){log('It did not stop; it stays in use.');return reused(dir,port);}
      occ=await occupant(port,dir);
      if(occ.state!=='free')return occ.state==='verified'?reused(dir,port):{status:'occupied',port,reason:occ.reason};
      return await spawnReceiver(o);
    }finally{await lock.release();}
  }
  if(occ.state==='foreign')return {status:'occupied',port,reason:occ.reason,version:occ.version};
  const other=await elsewhere(dir,port);
  if(other)return {status:'elsewhere',port,other};
  if(!start)return {status:'absent',port};
  if(!runtime)return {status:'unavailable',port,message:'This copy of the extension carries no receiver.'};
  const lock=await acquireLock(dir,{ready:async()=>(await occupant(port,dir,{timeoutMs:1000})).state==='verified'});
  if(lock==='ready')return reused(dir,port);
  if(!lock)return {status:'failed',port,message:'Another window has been starting the receiver for 45 s without finishing.'};
  try{
    occ=await occupant(port,dir);
    if(occ.state==='verified')return reused(dir,port);
    if(occ.state==='foreign')return {status:'occupied',port,reason:occ.reason,version:occ.version};
    return await spawnReceiver(o);
  }finally{await lock.release();}
}
// One check at a time per data directory and port in this process (capture starting while the Stage opens share it).
const inflight=new Map();
function ensureReceiver(o){
  const key=`${o.dir}\0${o.port}`;
  if(inflight.has(key))return inflight.get(key);
  const p=ensureOnce(o).finally(()=>inflight.delete(key));
  inflight.set(key,p);return p;
}
// Stops the receiver the extension started (on whichever port). One it did not start is never stopped.
async function stopReceiver({port,dir,log=()=>{}}){
  const s=bundled(dir);
  if(!s){const occ=await occupant(port,dir);return {status:occ.state==='free'?'not-running':'not-ours',port,occupant:occ.state,reason:occ.reason};}
  log(`Stopping the bundled receiver (process ${s.pid}, port ${s.port}).`);
  const stopped=await requestStop(dir,s,{log});
  log(stopped?'The bundled receiver stopped.':'The bundled receiver did not stop.');
  return {status:stopped?'stopped':'failed',port:s.port,state:s};
}
async function receiverStatus({port,dir}){
  const occ=await occupant(port,dir),s=bundled(dir);
  return {port,dir,occupant:occ.state,reason:occ.reason,version:occ.version,bundled:s,ours:!!(s&&s.port===port&&occ.state==='verified'),log:logFile(dir),
    elsewhere:occ.state==='free'?await elsewhere(dir,port):null};
}
module.exports={STATE,STOP,LOCK,dataDir,readAuth,readState,logFile,compareVersions,findRuntime,runtimeCommand,childEnv,portState,occupant,
  alive,bundled,acquireLock,requestStop,ensureReceiver,stopReceiver,receiverStatus};

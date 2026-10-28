#!/usr/bin/env node
'use strict';
// ~60 s first-run: start or reuse the loopback receiver, print a pairing link, build the VSIX, optionally sideload it,
// open the player, and show a visible world. Reuses only a Code Resonance /health document; any other occupant is
// refused — no auth write, no pairing, no browser. The token and pairing key are never printed; the link carries a
// single-use code. The child must not inherit RESONANCE_ALLOW_REMOTE (loopback only).
//   node scripts/up.js [--data <dir>] [--port <port>] [--no-demo] [--no-install] [--no-open]
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
const {once}=require('node:events');
const {build}=require('./package-vsix');
const ROOT=path.resolve(__dirname,'..');
const DEFAULT_PORT=4174;
const args=process.argv.slice(2);
const flag=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
const has=k=>args.includes(`--${k}`);
function isCrHealth(x){
  return !!x && typeof x==='object' && x.ok===true && typeof x.version==='string' && x.version.length>0
    && Number.isFinite(x.windowMs) && Number.isFinite(x.graceMs);
}
async function probe(port, timeoutMs=2000){
  try{
    const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(timeoutMs)});
    let body=null;const text=await r.text();
    try{body=JSON.parse(text);}catch{}
    if(r.status===200 && isCrHealth(body)) return {status:'cr', health:body};
    return {status:'foreign', reason:r.status!==200?`HTTP ${r.status}`:'not a Code Resonance health document'};
  }catch(e){
    const code=e.cause?.code||e.code;
    if(code==='ECONNREFUSED') return {status:'free'};
    if(e.name==='TimeoutError'||e.name==='AbortError'||code==='UND_ERR_CONNECT_TIMEOUT'||code==='ETIMEDOUT')
      return {status:'foreign', reason:'TCP open without CR health'};
    return {status:'foreign', reason:code||e.message||'not a Code Resonance health document'};
  }
}
function readAuth(dir){
  try{return JSON.parse(fs.readFileSync(path.join(dir,'receiver-auth.json'),'utf8'));}catch{return null;}
}
function wsl(){try{return /microsoft/i.test(fs.readFileSync('/proc/version','utf8'));}catch{return false;}}
function openUrl(url){
  try{
    const plat=process.platform;
    const child=plat==='darwin'?spawn('open',[url],{stdio:'ignore',detached:true})
      :plat==='win32'?spawn('cmd',['/c','start','',url],{stdio:'ignore',detached:true,windowsHide:true})
      :spawn('xdg-open',[url],{stdio:'ignore',detached:true});
    child.on('error',()=>{});child.unref();
  }catch{}
}
function refuse(port, reason){
  console.error(`Port ${port} is already in use (${reason}). Free http://127.0.0.1:${port} and run this again.`);
  console.error('This command will not write a token, mint a pairing link, or open a browser for a process it does not recognise.');
  process.exitCode=1;
}
function printPairing(url, port, code){
  console.log(`Open this link in the browser you use for Code Resonance (it works once, within 15 minutes):\n\n  ${url}\n`);
  if(wsl()) console.log(`From Windows (WSL): http://localhost:${port}/#pair=${code}\n`);
  console.log('Watching, the Stage, sound and recording need no pairing.');
}
function printHuman(vsix, installed){
  console.log('\nStill yours to do:');
  if(!installed) console.log(`  • Install the extension: code --install-extension ${vsix}`);
  console.log('  • Open a trusted workspace in VS Code');
  console.log('  • Click CR (or CODE RESONANCE: Start Code Performance) and accept local capture');
  console.log('  • Click Enable sound in the Control Center');
}
async function waitForCr(port, timeoutMs=20000, signal){
  const start=Date.now();
  let last='';
  while(!signal?.aborted && Date.now()-start<timeoutMs){
    const p=await probe(port, 400);
    if(signal?.aborted) break;
    if(p.status==='cr') return p;
    last=p.status==='foreign'?p.reason:p.status;
    await new Promise(resolve=>{
      if(signal?.aborted) return resolve();
      const t=setTimeout(resolve,100);
      signal?.addEventListener('abort',()=>{clearTimeout(t);resolve();},{once:true});
    });
  }
  if(signal?.aborted){const e=new Error('aborted');e.name='AbortError';throw e;}
  throw new Error(`The receiver did not become ready on http://127.0.0.1:${port} (${last||'no answer'}).`);
}
async function mintPairing(port, token){
  const r=await fetch(`http://127.0.0.1:${port}/v1/pairing-code`,{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(3000)});
  if(!r.ok) throw new Error(`The receiver refused a pairing code (HTTP ${r.status}): is it a receiver from before 0.5, or another program on port ${port}?`);
  const {code}=await r.json();
  if(typeof code!=='string'||!/^[0-9a-f]{32}$/.test(code)) throw new Error('The receiver did not return a pairing code.');
  return {code, url:`http://127.0.0.1:${port}/#pair=${code}`};
}
async function shouldDemo(port){
  try{
    const r=await fetch(`http://127.0.0.1:${port}/api/projects`,{signal:AbortSignal.timeout(3000)});
    if(!r.ok) return false;
    const list=(await r.json()).projects||[];
    return list.length===0 || list.every(p=>p.evidence && p.evidence.demonstration===true);
  }catch{return false;}
}
function childEnv(data, port){
  const env={...process.env, RESONANCE_DATA:data, RESONANCE_PORT:String(port)};
  delete env.RESONANCE_ALLOW_REMOTE;
  return env;
}
async function main(){
  const major=+process.versions.node.split('.')[0];
  if(major<20){console.error(`Code Resonance needs Node.js 20 or later (this is ${process.version}).`);process.exitCode=1;return;}
  const DATA=path.resolve(flag('data')||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
  const port=Number(flag('port')||process.env.RESONANCE_PORT||DEFAULT_PORT);
  if(!Number.isInteger(port)||port<1||port>65535){console.error('Port must be an integer 1–65535.');process.exitCode=1;return;}
  const noDemo=has('no-demo'), noInstall=has('no-install'), noOpen=has('no-open');
  const found=await probe(port);
  let child=null, spawned=false, exited=null;
  const stop=()=>{if(child && child.exitCode==null && child.signalCode==null) try{child.kill('SIGTERM');}catch{};};
  const release=()=>{stop();process.off('SIGINT',stop);process.off('SIGTERM',stop);};
  if(found.status==='foreign'){refuse(port, found.reason);return;}
  if(found.status==='cr'){
    const auth=readAuth(DATA);
    if(!auth?.token){refuse(port, `no receiver token in ${DATA} (leftover on the port, or a receiver using another data directory)`);return;}
    console.log(`Reusing the Code Resonance receiver on http://127.0.0.1:${port}`);
  }else{
    const env=childEnv(DATA, port);
    child=spawn(process.execPath,[path.join(ROOT,'receiver/server.js'),'--data',DATA,'--port',String(port)],{stdio:'inherit',cwd:ROOT,env});
    spawned=true;
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
    const ac=new AbortController();
    exited=once(child,'exit').finally(()=>ac.abort());
    const failed=new Promise(resolve=>child.once('error',e=>resolve({error:e})));
    failed.then(()=>ac.abort(),()=>{});
    const waiting=waitForCr(port,20000,ac.signal).then(()=>'ok',e=>e.name==='AbortError'?{aborted:true}:{error:e});
    const ready=await Promise.race([waiting, exited.then(([code,sig])=>['dead',code,sig]), failed]);
    if(ready!=='ok'){
      release();
      if(Array.isArray(ready)&&ready[0]==='dead') console.error(`The receiver exited before it was ready (${ready[1]??ready[2]}).`);
      else if(ready?.error) console.error(ready.error.message||ready.error);
      else console.error('The receiver did not start.');
      process.exitCode=1;return;
    }
  }
  let vsix;
  try{vsix=build();console.log(`Created ${vsix}`);}
  catch(e){release();console.error(`Could not build the VSIX: ${e.message}`);process.exitCode=1;return;}
  let installed=false;
  if(!noInstall){
    const r=spawnSync('code',['--install-extension',vsix],{stdio:'inherit',env:process.env});
    if(r.error?.code==='ENOENT') console.log(`VS Code CLI (code) is not on PATH. Install the extension with:\n  code --install-extension ${vsix}`);
    else if(r.status===0) installed=true;
    else console.error('code --install-extension did not succeed; install the VSIX from VS Code if you need capture.');
  }
  const still=await probe(port);
  if(still.status!=='cr'){release();refuse(port, still.status==='foreign'?still.reason:'the receiver stopped answering');return;}
  const auth=readAuth(DATA);
  if(!auth?.token){release();refuse(port, `no receiver token in ${DATA} after the receiver answered`);return;}
  let pairing;
  try{pairing=await mintPairing(port, auth.token);}
  catch(e){release();console.error(e.message);process.exitCode=1;return;}
  printPairing(pairing.url, port, pairing.code);
  if(!noOpen) openUrl(pairing.url);
  if(!noDemo && await shouldDemo(port)){
    const r=spawnSync(process.execPath,[path.join(ROOT,'scripts/demo.js'),'--fast'],{stdio:'inherit',cwd:ROOT,env:childEnv(DATA, port)});
    if(r.status!==0) console.error('The fictional demonstration did not run; the Stage will wait for a real project.');
  }
  printHuman(vsix, installed);
  if(!spawned) return;
  console.log('\nReceiver is running in the foreground. Ctrl+C stops it.');
  const [code,sig]=await exited;
  release();
  if(process.exitCode==null) process.exitCode=sig?1:(code??0);
}
if(require.main===module) main().catch(e=>{console.error(e.message||e);process.exitCode=1;});
module.exports={isCrHealth, probe};

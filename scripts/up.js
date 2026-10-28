#!/usr/bin/env node
'use strict';
// ~60 s first-run: start or reuse the loopback receiver, print a pairing link, build the VSIX, optionally sideload it,
// open the player, and show a visible world. Reuses only a Code Resonance /health document; any other occupant of the
// port is leftover-on-port (SECURITY.md) — no auth write, no pairing, no browser. The token and pairing key are never
// printed; the link carries a single-use code. Does not set RESONANCE_ALLOW_REMOTE (the child binds loopback only).
//   node scripts/up.js [--data <dir>] [--port <port>] [--no-demo] [--no-install] [--no-open]
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
const {once}=require('node:events');
const {build}=require('./package-vsix');
const ROOT=path.resolve(__dirname,'..');
const DEFAULT_PORT=4174;
const flag=(args,k)=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
const has=(args,k)=>args.includes(`--${k}`);
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
function onPath(cmd){
  const exts=process.platform==='win32'?(process.env.PATHEXT||'.EXE;.CMD;.BAT').split(';'):[''];
  for(const dir of (process.env.PATH||'').split(path.delimiter)){
    if(!dir) continue;
    for(const ext of exts){try{fs.accessSync(path.join(dir,cmd+ext),fs.constants.X_OK);return true;}catch{}}
  }
  return false;
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
async function waitForCr(port, timeoutMs=20000){
  const start=Date.now();
  let last='';
  while(Date.now()-start<timeoutMs){
    const p=await probe(port, 400);
    if(p.status==='cr') return p;
    last=p.status==='foreign'?p.reason:p.status;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error(`The receiver did not become ready on http://127.0.0.1:${port} (${last||'no answer'}).`);
}
async function mintPairing(port, token){
  const r=await fetch(`http://127.0.0.1:${port}/v1/pairing-code`,{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(3000)});
  if(!r.ok) throw new Error(`The receiver refused a pairing code (HTTP ${r.status}): is it a receiver from before 0.5, or another program on port ${port}?`);
  const {code}=await r.json();
  if(typeof code!=='string'||!code) throw new Error('The receiver did not return a pairing code.');
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
async function main(argv=process.argv.slice(2)){
  const major=+process.versions.node.split('.')[0];
  if(major<20){console.error(`Code Resonance needs Node.js 20 or later (this is ${process.version}).`);process.exitCode=1;return;}
  const DATA=path.resolve(flag(argv,'data')||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
  const port=Number(flag(argv,'port')||process.env.RESONANCE_PORT||DEFAULT_PORT);
  if(!Number.isInteger(port)||port<1||port>65535){console.error('Port must be an integer 1–65535.');process.exitCode=1;return;}
  const noDemo=has(argv,'no-demo'), noInstall=has(argv,'no-install'), noOpen=has(argv,'no-open');
  const found=await probe(port);
  let child=null, spawned=false, exited=null;
  const stop=()=>{if(child && child.exitCode==null && child.signalCode==null) try{child.kill('SIGTERM');}catch{};};
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
    exited=once(child,'exit');
    const failed=new Promise((_,reject)=>child.once('error',reject));
    try{
      const ready=await Promise.race([waitForCr(port).then(()=>'ok'), exited.then(([code,sig])=>['dead',code,sig]), failed]);
      if(ready!=='ok'){
        process.off('SIGINT',stop);process.off('SIGTERM',stop);
        console.error(`The receiver exited before it was ready (${ready[1]??ready[2]}).`);process.exitCode=1;return;
      }
    }catch(e){
      stop();process.off('SIGINT',stop);process.off('SIGTERM',stop);
      console.error(e.message);process.exitCode=1;return;
    }
  }
  let vsix;
  try{vsix=build();console.log(`Created ${vsix}`);}
  catch(e){stop();process.off('SIGINT',stop);process.off('SIGTERM',stop);console.error(`Could not build the VSIX: ${e.message}`);process.exitCode=1;return;}
  let installed=false;
  if(!noInstall && onPath('code')){
    const r=spawnSync('code',['--install-extension',vsix],{stdio:'inherit',env:process.env});
    installed=r.status===0;
    if(!installed) console.error('code --install-extension did not succeed; install the VSIX from VS Code if you need capture.');
  }else if(!noInstall){
    console.log(`VS Code CLI (code) is not on PATH. Install the extension with:\n  code --install-extension ${vsix}`);
  }
  const auth=readAuth(DATA);
  if(!auth?.token){
    stop();process.off('SIGINT',stop);process.off('SIGTERM',stop);
    refuse(port, `no receiver token in ${DATA} after the receiver answered`);
    return;
  }
  let pairing;
  try{pairing=await mintPairing(port, auth.token);}
  catch(e){
    stop();process.off('SIGINT',stop);process.off('SIGTERM',stop);
    console.error(e.message);process.exitCode=1;return;
  }
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
  process.off('SIGINT',stop);process.off('SIGTERM',stop);
  if(process.exitCode==null) process.exitCode=sig?1:(code??0);
}
if(require.main===module) main().catch(e=>{console.error(e.message||e);process.exitCode=1;});
module.exports={isCrHealth, probe, main};

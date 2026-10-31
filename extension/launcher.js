'use strict';
// The bundled receiver's process. ./receiver-host.js starts it detached, in VS Code's own runtime, with its output
// going to <data>/logs/receiver.log:
//   <runtime> launcher.js --runtime <dir> --data <dir> --port <port> --instance <24 hex> --version <extension version>
// It keeps the agent hook adapters at their stable path (./agent-hooks.js), runs the receiver from the runtime folder
// (runtime/ in the VSIX, the checkout in development) on loopback, quietly (the pairing link is never written to the
// log), records itself in <data>/bundled-receiver.json and stops cleanly when the extension asks
// (<data>/bundled-receiver.stop naming this instance, checked every second) or on SIGTERM, SIGINT or SIGHUP.
// Exit codes: 0 stopped, 1 failed, 2 bad arguments, 3 the port is already in use.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const hooks=require('./agent-hooks');
const args=process.argv.slice(2);
const arg=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
const log=(...a)=>console.log(`[${new Date().toISOString()}] [launcher]`,...a);
function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function writeJSON(file,doc){const tmp=`${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;fs.writeFileSync(tmp,JSON.stringify(doc,null,1)+'\n',{mode:0o600});fs.renameSync(tmp,file);}
async function main(){
  const runtime=arg('runtime')&&path.resolve(arg('runtime')),data=arg('data')&&path.resolve(arg('data')),port=Number(arg('port'));
  const instance=arg('instance')||'',version=arg('version')||'';
  if(!runtime||!data||!Number.isInteger(port)||port<1||port>65535||!/^[0-9a-f]{24}$/.test(instance)){log('usage: launcher.js --runtime <dir> --data <dir> --port <port> --instance <24 hex> --version <v>');process.exit(2);}
  // The title names the instance: where the system shows command lines, the extension checks it before any signal.
  process.title=`code-resonance-receiver ${instance}`;
  delete process.env.RESONANCE_ALLOW_REMOTE;
  // A stop request names one instance; one naming another (older) instance is not this process's business.
  const STATE=path.join(data,'bundled-receiver.json'),STOP=path.join(data,'bundled-receiver.stop');
  try{
    const r=hooks.syncStableHooks({runtime,dataDir:data,version});
    const aliased=hooks.aliasInstallers({runtime,stable:r.root});
    log(`agent hook adapters: ${r.root} (${r.changed?'updated':r.kept?`kept, written by ${r.kept}`:'current'}); installers: ${aliased.join(', ')||'none'}`);
  }catch(e){log(`agent hook adapters could not be prepared: ${e.message}`);}
  const {createService}=require(path.join(runtime,'receiver','server.js'));
  const svc=createService({dataDir:data,port,quiet:true});
  // The receiver's sorter worker starts before the port is bound: exit explicitly, or a failed start would linger.
  try{await svc.start();}
  catch(e){log(e.code==='EADDRINUSE'?`port ${port} is already in use`:`the receiver could not start: ${e.stack||e}`);process.exit(e.code==='EADDRINUSE'?3:1);}
  writeJSON(STATE,{pid:process.pid,port:svc.port,instance,version,runtime,data,execPath:process.execPath,electron:process.versions.electron||null,
    node:process.version,platform:process.platform,startedAt:new Date().toISOString()});
  log(`started: process ${process.pid}, http://127.0.0.1:${svc.port}/, data ${data}, runtime ${runtime}, ${process.versions.electron?`VS Code's Electron ${process.versions.electron} as Node ${process.version}`:`Node ${process.version}`}`);
  let stopping=false;
  const cleanup=()=>{for(const f of [STATE,STOP])if(readJSON(f)?.instance===instance)fs.rmSync(f,{force:true});};
  async function shutdown(why){
    if(stopping)return;stopping=true;clearInterval(watch);
    log(`stopping (${why})`);
    const cap=setTimeout(()=>{log('the receiver did not stop within 20 s');cleanup();process.exit(1);},20000);
    try{await svc.stop();}catch(e){log(`stop: ${e.message}`);}
    clearTimeout(cap);cleanup();log('stopped');process.exit(0);
  }
  const watch=setInterval(()=>{if(readJSON(STOP)?.instance===instance)void shutdown('asked by the extension');},1000);
  for(const sig of ['SIGTERM','SIGINT','SIGHUP'])process.on(sig,()=>void shutdown(sig));
}
main().catch(e=>{log(e.stack||String(e));process.exit(1);});

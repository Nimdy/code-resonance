'use strict';
// The receiver the extension carries (extension/receiver-host.js, extension/launcher.js): when one is started, reused,
// replaced or left alone, that two windows starting at once start one, and that it stops when asked. Real processes on
// free loopback ports with temporary data directories (never 4174, never ~/.code-resonance); every receiver a test
// starts is stopped when it ends.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const host=require('../extension/receiver-host');
const {startService,tempDir,freePort}=require('./helpers');
const REPO=path.join(__dirname,'..');
const RUNTIME={root:REPO,kind:'checkout'},LAUNCHER=path.join(REPO,'extension','launcher.js');
const VERSION=require('../extension/package.json').version;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// A data directory whose bundled receiver (if any) is stopped, then removed, when the test ends. On Windows a process's
// open files (its log in the data directory) keep the directory busy until the process has exited, so the removal waits
// for the exit and retries for a few seconds (EBUSY on a CI runner otherwise).
async function stopBundled(dir){
  const s=host.readState(dir);if(!s||!host.alive(s.pid))return;
  if(!await host.requestStop(dir,s,{timeoutMs:15000})&&host.alive(s.pid))try{process.kill(s.pid,'SIGKILL');}catch{}
  for(let i=0;i<100&&host.alive(s.pid);i++)await sleep(100);
}
function dataDir(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-host-'));
  t.after(async()=>{await stopBundled(dir);fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});});
  return dir;
}
function counting(){const calls=[];const spawnImpl=(...a)=>{calls.push(a);return cp.spawn(...a);};return {calls,spawnImpl};}
const options=(dir,port,extra={})=>({port,dir,runtime:RUNTIME,launcher:LAUNCHER,version:VERSION,...extra});
const healthOf=async port=>(await fetch(`http://127.0.0.1:${port}/health`)).json();
function launcherStarts(dir){try{return (fs.readFileSync(host.logFile(dir),'utf8').match(/\[launcher\] started:/g)||[]).length;}catch{return 0;}}

test('VS Code\'s own runtime runs the receiver, without VS Code\'s variables, NODE_OPTIONS or RESONANCE_ALLOW_REMOTE',()=>{
  assert.deepEqual(host.runtimeCommand({execPath:'/opt/code/code',versions:{electron:'37.2.0',node:'22.17.0'}}),{command:'/opt/code/code',electron:true,node:'22.17.0'});
  assert.deepEqual(host.runtimeCommand({execPath:'/home/a/.vscode-server/bin/x/node',versions:{node:'22.17.0'}}),{command:'/home/a/.vscode-server/bin/x/node',electron:false,node:'22.17.0'});
  const base={PATH:'/usr/bin',HOME:'/home/a',VSCODE_IPC_HOOK:'/run/x.sock',VSCODE_PID:'1',ELECTRON_NO_ATTACH_CONSOLE:'1',ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'--inspect=9229',RESONANCE_ALLOW_REMOTE:'1',RESONANCE_DATA:'/elsewhere',LANG:'C'};
  assert.deepEqual(host.childEnv(base,{dataDir:'/d',port:5000,electron:true}),{PATH:'/usr/bin',HOME:'/home/a',LANG:'C',ELECTRON_RUN_AS_NODE:'1',RESONANCE_DATA:'/d',RESONANCE_PORT:'5000'});
  assert.deepEqual(host.childEnv(base,{dataDir:'/d',port:5000,electron:false}),{PATH:'/usr/bin',HOME:'/home/a',LANG:'C',RESONANCE_DATA:'/d',RESONANCE_PORT:'5000'});
  assert.equal(host.dataDir({RESONANCE_DATA:'/tmp/x'}),path.resolve('/tmp/x'));
  assert.equal(host.dataDir({}),path.join(os.homedir(),'.code-resonance'));
});
test('Versions compare numerically; the receiver\'s files are found in the VSIX layout or the checkout',t=>{
  assert.equal(host.compareVersions('0.8.0','0.7.12'),1);assert.equal(host.compareVersions('0.7.2','0.7.2'),0);
  assert.equal(host.compareVersions('0.7.2','0.10.0'),-1);assert.equal(host.compareVersions('1.0.0-beta.1','1.0.0'),0);assert.equal(host.compareVersions('','0.0.1'),-1);
  assert.deepEqual(host.findRuntime(path.join(REPO,'extension')),{root:REPO,kind:'checkout'});
  const dir=dataDir(t),ext=path.join(dir,'zerobandwidth.code-resonance-9.9.9');
  fs.mkdirSync(path.join(ext,'runtime','receiver'),{recursive:true});
  assert.equal(host.findRuntime(ext),null,'no server.js: nothing');
  fs.writeFileSync(path.join(ext,'runtime','receiver','server.js'),'');
  assert.deepEqual(host.findRuntime(ext),{root:path.join(ext,'runtime'),kind:'bundled'});
  // A folder next to some other project's receiver/ is not a checkout of this one.
  fs.mkdirSync(path.join(dir,'receiver'));fs.writeFileSync(path.join(dir,'receiver','server.js'),'');fs.writeFileSync(path.join(dir,'package.json'),'{"name":"other"}');
  assert.equal(host.findRuntime(path.join(dir,'extension')),null);
});
test('occupant: a free port, a receiver holding this data directory\'s token, one of another data directory, another program (sent nothing)',async t=>{
  const dir=tempDir(t,'cr-host-'),other=tempDir(t,'cr-host-');
  assert.deepEqual(await host.occupant(await freePort(),dir),{state:'free'});
  const svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  assert.equal((await host.occupant(svc.port,dir)).state,'verified');
  // Another data directory's token does not verify; the health document says it is a receiver.
  fs.writeFileSync(path.join(other,'receiver-auth.json'),JSON.stringify({token:'a'.repeat(64),pairing:'b'.repeat(64),port:svc.port}));
  assert.deepEqual(await host.occupant(svc.port,other),{state:'foreign',reason:'receiver',version:require('../package.json').version});
  const seen=[];const foreign=http.createServer((req,res)=>{seen.push(req.headers.authorization||null);res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');});
  await new Promise(r=>foreign.listen(0,'127.0.0.1',r));t.after(()=>foreign.close());
  assert.deepEqual(await host.occupant(foreign.address().port,other),{state:'foreign',reason:'program',version:undefined});
  assert(seen.length>0&&seen.every(a=>a===null),'the token is never sent to it');
});
test('The bundled receiver starts once, detached, in its own process, and is reused; it stops when asked',async t=>{
  const dir=dataDir(t),port=await freePort(),{calls,spawnImpl}=counting(),lines=[];
  const r=await host.ensureReceiver(options(dir,port,{spawnImpl,log:l=>lines.push(l)}));
  assert.equal(r.status,'started',JSON.stringify(r));assert.equal(r.owner,'bundled');assert.equal(calls.length,1);
  const [command,args,opts]=calls[0];
  assert.equal(command,process.execPath);assert.equal(args[0],LAUNCHER);assert.equal(opts.detached,true);assert.equal(opts.cwd,dir,'never inside an extension folder');
  assert.equal(opts.env.RESONANCE_DATA,dir);assert.equal(opts.env.RESONANCE_PORT,String(port));assert.equal(opts.env.RESONANCE_ALLOW_REMOTE,undefined);
  const state=host.readState(dir);
  assert.notEqual(state.pid,process.pid);assert(host.alive(state.pid));assert.equal(state.port,port);assert.equal(state.version,VERSION);
  assert.equal(state.runtime,REPO);assert.equal(state.execPath,process.execPath);assert.match(state.instance,/^[0-9a-f]{24}$/);
  assert.equal((await healthOf(port)).ok,true);
  assert.match(lines.join('\n'),new RegExp(`Log: ${host.logFile(dir).replace(/[\\.]/g,'\\$&')}`));
  const log=fs.readFileSync(host.logFile(dir),'utf8');
  assert.match(log,/\[launcher\] started: process \d+/);assert.match(log,/Receiver listening/);
  assert.doesNotMatch(log,/#pair=/,'no pairing link in the log');
  assert(!fs.existsSync(path.join(dir,host.LOCK)),'the lock is released');
  // Another window (or this one again): the proof says it holds the token; nothing new is started.
  const again=await host.ensureReceiver(options(dir,port,{spawnImpl}));
  assert.deepEqual({status:again.status,owner:again.owner,pid:again.state.pid},{status:'reused',owner:'bundled',pid:state.pid});
  assert.equal(calls.length,1);assert.equal(launcherStarts(dir),1);
  const status=await host.receiverStatus({port,dir});
  assert.equal(status.occupant,'verified');assert.equal(status.ours,true);assert.equal(status.bundled.pid,state.pid);
  // Stop: the launcher stops the receiver cleanly and removes its state; the port is free.
  const stopped=await host.stopReceiver({port,dir});
  // 'stopped' means the port is free and the state is gone; the process exits a moment later (and this test, its
  // parent, reaps it on its own event loop), so its end is awaited rather than sampled at once.
  assert.equal(stopped.status,'stopped');
  for(const t0=Date.now();host.alive(state.pid)&&Date.now()-t0<5000;)await new Promise(r=>setTimeout(r,50));
  assert.equal(host.alive(state.pid),false);
  assert.equal(await host.portState(port),'free');assert.equal(host.readState(dir),null);assert(!fs.existsSync(path.join(dir,host.STOP)));
  assert.match(fs.readFileSync(host.logFile(dir),'utf8'),/\[launcher\] stopping \(asked by the extension\)[\s\S]*\[launcher\] stopped/);
  assert.equal((await host.stopReceiver({port,dir})).status,'not-running');
});
test('Two windows starting at once (two processes) start exactly one receiver and share it',async t=>{
  const dir=dataDir(t),port=await freePort();
  const script=`const h=require(${JSON.stringify(path.join(REPO,'extension','receiver-host.js'))});
    h.ensureReceiver({port:${port},dir:${JSON.stringify(dir)},runtime:${JSON.stringify(RUNTIME)},launcher:${JSON.stringify(LAUNCHER)},version:${JSON.stringify(VERSION)}})
      .then(r=>{console.log(JSON.stringify({status:r.status,pid:r.state&&r.state.pid}));});`;
  const run=()=>new Promise((resolve,reject)=>cp.execFile(process.execPath,['-e',script],{timeout:60000},(err,out)=>err?reject(err):resolve(JSON.parse(out.trim().split('\n').pop()))));
  const results=await Promise.all([run(),run()]);
  assert.deepEqual(results.map(r=>r.status).sort(),['reused','started'],JSON.stringify(results));
  assert.equal(results[0].pid,results[1].pid,'both use the same receiver');
  assert.equal(launcherStarts(dir),1,'one launcher ever started');
  assert.equal(host.readState(dir).pid,results[0].pid);
});
test('A receiver the extension did not start (npm start in a checkout) is reused, never replaced and never stopped',async t=>{
  const dir=tempDir(t,'cr-host-'),port=await freePort(),{calls,spawnImpl}=counting();
  const svc=await startService(t,{port,dataDir:dir,quiet:true});
  const r=await host.ensureReceiver(options(dir,port,{spawnImpl,version:'99.0.0'}));
  assert.deepEqual({status:r.status,owner:r.owner,state:r.state},{status:'reused',owner:'external',state:null});
  assert.equal(calls.length,0);
  assert.deepEqual(await host.stopReceiver({port,dir}),{status:'not-ours',port,occupant:'verified',reason:undefined});
  assert.equal((await healthOf(svc.port)).ok,true,'still running');
});
test('Another program on the port: nothing is started and the token is never sent',async t=>{
  const dir=dataDir(t),{calls,spawnImpl}=counting(),seen=[];
  fs.writeFileSync(path.join(dir,'receiver-auth.json'),JSON.stringify({token:'c'.repeat(64),pairing:'d'.repeat(64)}));
  const foreign=http.createServer((req,res)=>{seen.push(req.headers.authorization||null);res.writeHead(404);res.end();});
  await new Promise(r=>foreign.listen(0,'127.0.0.1',r));t.after(()=>foreign.close());
  const r=await host.ensureReceiver(options(dir,foreign.address().port,{spawnImpl}));
  assert.deepEqual({status:r.status,reason:r.reason},{status:'occupied',reason:'program'});
  assert.equal(calls.length,0);assert(seen.every(a=>a===null));
  assert.equal(host.readState(dir),null);
});
test('A receiver of this data directory on another port: a second one is not started on the same journals',async t=>{
  const dir=tempDir(t,'cr-host-'),{calls,spawnImpl}=counting();
  const svc=await startService(t,{port:0,dataDir:dir,quiet:true}),port=await freePort();
  const r=await host.ensureReceiver(options(dir,port,{spawnImpl}));
  assert.deepEqual(r,{status:'elsewhere',port,other:svc.port});
  assert.equal(calls.length,0);assert.equal(await host.portState(port),'free');
});
test('An older extension\'s receiver is replaced by a newer extension; an older extension keeps using a newer one',async t=>{
  const dir=dataDir(t),port=await freePort(),lines=[];
  const old=await host.ensureReceiver(options(dir,port,{version:'0.0.1'}));
  assert.equal(old.status,'started');const oldPid=old.state.pid;
  const r=await host.ensureReceiver(options(dir,port,{log:l=>lines.push(l)}));
  assert.equal(r.status,'started',JSON.stringify(r));assert.notEqual(r.state.pid,oldPid);assert.equal(r.state.version,VERSION);
  assert.equal(host.alive(oldPid),false,'the old one stopped first: never two on the port');
  assert.match(lines.join('\n'),new RegExp(`started by Code Resonance 0\\.0\\.1; replacing it with ${VERSION.replace(/\./g,'\\.')}`));
  const back=await host.ensureReceiver(options(dir,port,{version:'0.0.1'}));
  assert.deepEqual({status:back.status,owner:back.owner,pid:back.state.pid},{status:'reused',owner:'bundled',pid:r.state.pid});
  assert.equal(launcherStarts(dir),2);
});
test('start:false starts nothing; a stale lock (its holder is gone) is taken over',async t=>{
  const dir=dataDir(t),port=await freePort(),{calls,spawnImpl}=counting();
  assert.deepEqual(await host.ensureReceiver(options(dir,port,{spawnImpl,start:false})),{status:'absent',port});
  assert.deepEqual(await host.ensureReceiver(options(dir,port,{spawnImpl,runtime:null})),{status:'unavailable',port,message:'This copy of the extension carries no receiver.'});
  assert.equal(calls.length,0);
  const gone=cp.spawn(process.execPath,['-e','']);await new Promise(r=>gone.once('exit',r));
  fs.writeFileSync(path.join(dir,host.LOCK),JSON.stringify({pid:gone.pid,at:Date.now()}));
  const r=await host.ensureReceiver(options(dir,port,{spawnImpl}));
  assert.equal(r.status,'started');assert.equal(calls.length,1);
});
test('A receiver that fails to start is reported with its log; a port taken during the start is reported, not fought over',async t=>{
  const dir=dataDir(t),port=await freePort();
  const broken=fs.mkdtempSync(path.join(os.tmpdir(),'cr-host-runtime-'));t.after(()=>fs.rmSync(broken,{recursive:true,force:true}));
  fs.mkdirSync(path.join(broken,'receiver'));fs.mkdirSync(path.join(broken,'scripts','hooks'),{recursive:true});
  fs.writeFileSync(path.join(broken,'receiver','server.js'),"throw new Error('receiver module failed to load: boom');\n");
  const r=await host.ensureReceiver(options(dir,port,{runtime:{root:broken,kind:'bundled'}}));
  assert.equal(r.status,'failed');assert.match(r.message,/stopped before it was ready \(exit 1\)/);assert.match(r.detail,/boom/);assert.equal(r.log,host.logFile(dir));
  // Something takes the port just as the launcher starts: the launcher exits with code 3 and the port is reported busy.
  const dir2=dataDir(t),port2=await freePort();let squatter=null;
  t.after(()=>squatter&&squatter.close());
  const spawnImpl=(...a)=>{squatter=http.createServer((req,res)=>{res.writeHead(404);res.end();}).listen(port2,'127.0.0.1');return cp.spawn(...a);};
  const taken=await host.ensureReceiver(options(dir2,port2,{spawnImpl}));
  assert.deepEqual({status:taken.status,reason:taken.reason},{status:'occupied',reason:'program'});
  assert.match(fs.readFileSync(host.logFile(dir2),'utf8'),/port \d+ is already in use/);
  await sleep(100);assert.equal(host.readState(dir2),null);
});

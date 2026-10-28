'use strict';
// scripts/up.js: first-run starts or reuses a CR receiver, refuses a foreign occupant, never prints the token.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),cp=require('node:child_process');
const {tempDir,startService}=require('./helpers');
const {isCrHealth,probe}=require('../scripts/up');
const UP=path.join(__dirname,'../scripts/up.js');
const PAIR=/http:\/\/127\.0\.0\.1:\d+\/#pair=[0-9a-f]{32}/;
const FLAGS=['--no-open','--no-install','--no-demo'];
function freePort(){
  return new Promise((resolve,reject)=>{
    const s=net.createServer();
    s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(err=>err?reject(err):resolve(p));});
    s.on('error',reject);
  });
}
function occupyHttp(t, handler){
  const server=http.createServer(handler);
  t.after(()=>new Promise(r=>server.close(()=>r())));
  return new Promise((resolve,reject)=>{
    server.listen(0,'127.0.0.1',()=>resolve({port:server.address().port,server}));
    server.on('error',reject);
  });
}
function trap(t){
  const dir=tempDir(t,'cr-up-bin-'), marker=path.join(dir,'called.txt');
  const body='#!/bin/sh\nprintf "%s %s\\n" "$(basename "$0")" "$*" >> "$CR_UP_TRAP"\nexit 0\n';
  for(const name of ['xdg-open','open','code']){const p=path.join(dir,name);fs.writeFileSync(p,body,{mode:0o755});}
  return {marker, env:{PATH:dir+path.delimiter+(process.env.PATH||''), CR_UP_TRAP:marker}};
}
function runUp(args, env={}, timeoutMs=30000){
  return new Promise((resolve,reject)=>{
    const c=cp.spawn(process.execPath,[UP,...args],{env:{...process.env,...env}});
    let out='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>out+=d);
    let done=false;
    const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(tmo);fn(v);};
    const tmo=setTimeout(()=>{try{c.kill('SIGTERM');}catch{};finish(reject,new Error(`up.js timed out: ${out}`));},timeoutMs);
    c.on('close',code=>finish(resolve,{code,out}));
    c.on('error',e=>finish(reject,e));
  });
}
function spawnUp(t, args, env={}){
  const c=cp.spawn(process.execPath,[UP,...args],{
    env:{...process.env,...env}, stdio:['ignore','pipe','pipe'], detached:process.platform!=='win32'
  });
  let out='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>out+=d);
  const kill=()=>new Promise(r=>{
    if(c.exitCode!=null||c.signalCode!=null) return r();
    try{if(process.platform!=='win32') process.kill(-c.pid,'SIGTERM'); else c.kill('SIGTERM');}catch{try{c.kill('SIGTERM');}catch{}}
    const tmo=setTimeout(()=>{try{if(process.platform!=='win32') process.kill(-c.pid,'SIGKILL'); else c.kill('SIGKILL');}catch{} r();},4000);
    c.on('exit',()=>{clearTimeout(tmo);r();});
  });
  t.after(kill);
  return {
    proc:c, output:()=>out, kill,
    waitFor(re, ms=25000){
      return new Promise((resolve,reject)=>{
        let done=false;
        const finish=(fn,v)=>{if(done)return;done=true;clearInterval(iv);clearTimeout(tmo);fn(v);};
        const check=()=>{
          if(re.test(out)) return finish(resolve,out);
          if(c.exitCode!=null||c.signalCode!=null) return finish(reject,new Error(`up.js exited ${c.exitCode??c.signalCode} before ${re}: ${out}`));
        };
        const iv=setInterval(check,50);
        const tmo=setTimeout(()=>finish(reject,new Error(`timeout waiting for ${re}: ${out}`)),ms);
        c.stdout.on('data',check);c.stderr.on('data',check);check();
      });
    }
  };
}
function crHealth(req,res){
  if((req.url||'').split('?')[0]==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,version:'0.6.0',sortIntervalMs:1000,windowMs:5000,graceMs:1500}));}
  else{res.writeHead(404);res.end();}
}

test('isCrHealth: only the CR /health document',()=>{
  assert.equal(isCrHealth({ok:true,version:'0.6.0',windowMs:5000,graceMs:1500}),true);
  assert.equal(isCrHealth({ok:true,version:'0.6.0',sortIntervalMs:1000,windowMs:5000,graceMs:1500}),true);
  assert.equal(isCrHealth({ok:true,version:'0.6.0'}),false);
  assert.equal(isCrHealth({ok:true,version:'0.6.0',windowMs:5000}),false);
  assert.equal(isCrHealth({ok:1,version:'0.6.0',windowMs:5000,graceMs:1500}),false);
  assert.equal(isCrHealth({version:'0.6.0',windowMs:5000,graceMs:1500}),false);
  assert.equal(isCrHealth({ok:true,version:'',windowMs:5000,graceMs:1500}),false);
  assert.equal(isCrHealth('{"ok":true}'),false);
  assert.equal(isCrHealth(null),false);
});

test('probe: free, CR, and foreign',async t=>{
  const unused=await freePort();
  assert.equal((await probe(unused)).status,'free');
  const svc=await startService(t,{port:0,dataDir:tempDir(t,'cr-up-probe-'),quiet:true});
  const cr=await probe(svc.port);
  assert.equal(cr.status,'cr');
  assert.equal(cr.health.version,require('../package.json').version);
  assert.equal(typeof cr.health.windowMs,'number');
  const {port:fp}=await occupyHttp(t,(req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');});
  const foreign=await probe(fp);
  assert.equal(foreign.status,'foreign');
});

test('up: refuses a non-CR occupant and does not write auth or mint pairing',async t=>{
  const dir=tempDir(t,'cr-up-refuse-'), {env}=trap(t);
  const {port}=await occupyHttp(t,(req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,status:'fine'}));});
  const r=await runUp(['--data',dir,'--port',String(port),...FLAGS],env);
  assert.equal(r.code,1,r.out);
  assert.match(r.out,/not a Code Resonance health document|already in use/);
  assert(!PAIR.test(r.out),'no pairing link');
  assert(!fs.existsSync(path.join(dir,'receiver-auth.json')));
});

test('up: leftover-on-port (CR health, no auth file) refuses',async t=>{
  const dir=tempDir(t,'cr-up-left-'), {env}=trap(t);
  const {port}=await occupyHttp(t,crHealth);
  const r=await runUp(['--data',dir,'--port',String(port),...FLAGS],env);
  assert.equal(r.code,1,r.out);
  assert.match(r.out,/leftover|no receiver token|already in use/);
  assert(!PAIR.test(r.out),'no pairing link');
  assert(!fs.existsSync(path.join(dir,'receiver-auth.json')));
});

test('up: reuses a running CR, prints pairing, does not stay in the foreground',async t=>{
  const dir=tempDir(t,'cr-up-reuse-'), {marker,env}=trap(t);
  const svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  const r=await runUp(['--data',dir,'--port',String(svc.port),...FLAGS],env);
  assert.equal(r.code,0,r.out);
  assert.match(r.out,/Reusing the Code Resonance receiver/);
  assert.match(r.out,PAIR);
  assert.match(r.out,new RegExp(`http://127\\.0\\.0\\.1:${svc.port}/#pair=[0-9a-f]{32}`));
  assert(!/Receiver is running in the foreground/.test(r.out));
  assert(!r.out.includes(svc.token),'the token is never printed');
  assert(!r.out.includes(svc.pairing),'the pairing key is never printed');
  assert.equal((await probe(svc.port)).status,'cr');
  assert(!fs.existsSync(marker),'--no-open/--no-install did not spawn a browser or code');
});

test('up: starts on a free port with --data',async t=>{
  const dir=tempDir(t,'cr-up-start-'), {marker,env}=trap(t), port=await freePort();
  const up=spawnUp(t,['--data',dir,'--port',String(port),...FLAGS],env);
  const out=await up.waitFor(/Receiver is running in the foreground/);
  assert.match(out,new RegExp(`http://127\\.0\\.0\\.1:${port}/#pair=[0-9a-f]{32}`));
  assert.doesNotMatch(out,/Reusing the Code Resonance receiver/);
  const health=await probe(port);
  assert.equal(health.status,'cr');
  const auth=JSON.parse(fs.readFileSync(path.join(dir,'receiver-auth.json'),'utf8'));
  assert(auth.token && auth.pairing);
  assert(!out.includes(auth.token),'the token is never printed');
  assert(!out.includes(auth.pairing),'the pairing key is never printed');
  assert.equal(up.proc.exitCode,null);
  await up.kill();
  const t0=Date.now();
  while(Date.now()-t0<8000){if((await probe(port,300)).status==='free') break; await new Promise(r=>setTimeout(r,50));}
  assert.equal((await probe(port,300)).status,'free');
  assert(!fs.existsSync(marker));
});

test('up: --no-open --no-install --no-demo does not spawn a browser',async t=>{
  const dir=tempDir(t,'cr-up-flags-'), {marker,env}=trap(t);
  const svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  const r=await runUp(['--data',dir,'--port',String(svc.port),...FLAGS],env);
  assert.equal(r.code,0,r.out);
  assert.match(r.out,PAIR);
  assert(!fs.existsSync(marker),'xdg-open / open / code were not invoked');
  const projects=(await (await fetch(`http://127.0.0.1:${svc.port}/api/projects`)).json()).projects||[];
  assert.equal(projects.length,0,'--no-demo did not post a demonstration');
});

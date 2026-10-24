'use strict';
// scripts/doctor.js: read-only first-run checks against a real receiver.
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),cp=require('node:child_process');
const {tempDir,startService}=require('./helpers');
const packs=require('../engine/packs');
const doctor=(...a)=>new Promise(resolve=>{const c=cp.spawn(process.execPath,[path.join(__dirname,'../scripts/doctor.js'),...a]);let out='';c.stdout.on('data',d=>out+=d);c.on('close',code=>resolve({code,out}));});
test('doctor: reports a running receiver, its token and packs waiting for approval; problems when nothing runs',async t=>{
  const dir=tempDir(t,'cr-doctor-');
  const svc=await startService(t,{port:0,dataDir:dir});
  packs.install(path.join(__dirname,'../packs/examples/cymatic-field'),dir);
  const ok=await doctor('--data',dir,'--port',String(svc.port),'--json'),r=JSON.parse(ok.out);
  assert.equal(ok.code,0,ok.out);
  assert(r.results.some(x=>x.topic==='Receiver'&&x.status==='ok'&&x.message.includes(String(svc.port))));
  assert(r.results.some(x=>x.topic==='Receiver token'&&x.status==='ok'));
  assert(r.results.some(x=>x.topic==='Visual pack'&&x.status==='note'&&/not approved/.test(x.message)));
  assert(!ok.out.includes(svc.token),'the token is never printed');
  await svc.stop();
  const down=await doctor('--data',dir,'--port',String(svc.port),'--json');
  assert.equal(down.code,1);assert(JSON.parse(down.out).results.some(x=>x.topic==='Receiver'&&x.status==='problem'));
});

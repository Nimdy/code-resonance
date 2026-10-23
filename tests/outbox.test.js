'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {DurableOutbox}=require('../extension/outbox');
const {createService}=require('../receiver/server');const {sha}=require('../receiver/protocol');
const projectId=sha('outbox-test');
test('Outbox persists while offline, then replays without blocking event handlers',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'s3-outbox-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  let service=createService({port:0,dataDir:path.join(dir,'receiver'),sortIntervalMs:200000});
  const outbox=new DurableOutbox({directory:path.join(dir,'outbox'),port:41888,authFile:path.join(dir,'receiver','receiver-auth.json')});
  outbox.enqueue({v:1,id:'outbox-event-01',ts:1750000000000,projectId,sessionId:'outbox-test',kind:'workspace.started'});
  await outbox.persist();
  assert.equal((await fs.readdir(path.join(dir,'outbox'))).length,1);
  // A restarted extension must find the disk batch and deliver it unchanged.
  service=await service.start();
  outbox.port=service.port;
  await outbox.deliver();
  assert.equal((await fs.readdir(path.join(dir,'outbox'))).length,0);
  await service.flush(projectId);
  const raw=await fs.readFile(path.join(dir,'receiver','projects',sha(projectId),'events.jsonl'),'utf8');
  assert(raw.includes('outbox-event-01'));
  await service.stop();
});
async function harness(t,opts={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cr-outbox-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const service=await createService({port:0,dataDir:path.join(dir,'receiver'),sortIntervalMs:600000}).start();t.after(()=>service.stop());
  const outbox=new DurableOutbox({directory:path.join(dir,'outbox'),port:service.port,authFile:path.join(dir,'receiver','receiver-auth.json'),...opts});
  const journal=async()=>fs.readFile(path.join(dir,'receiver','projects',sha(projectId),'events.jsonl'),'utf8').catch(()=>'');
  return {dir,service,outbox,journal};
}
const ev=(id,extra={})=>({v:1,id,ts:Date.now(),projectId,sessionId:'outbox-test',kind:'document.saved',file:'src/ok.ts',...extra});
test('A permanently rejected batch is quarantined and no longer blocks later events',async t=>{
  const {dir,outbox,journal}=await harness(t);
  outbox.enqueue(ev('poison-event-01',{ts:Date.now()+3*86400000})); // receiver rejects timestamps >1 day ahead
  await outbox.persist();
  outbox.enqueue(ev('after-poison-01'));
  await outbox.deliver();
  assert.match(await journal(),/after-poison-01/);
  assert.equal((await fs.readdir(path.join(dir,'outbox'))).filter(n=>n.endsWith('.json')).length,0);
  const rejected=await fs.readdir(path.join(dir,'outbox','rejected'));
  assert.equal(rejected.filter(n=>n.endsWith('.json')).length,1);
  assert.match(await fs.readFile(path.join(dir,'outbox','rejected',rejected.find(n=>n.endsWith('.reason'))),'utf8'),/HTTP 422/);
});
test('Concurrent deliveries share one in-flight attempt and close() flushes what is pending',async t=>{
  const {outbox,journal}=await harness(t);
  outbox.enqueue(ev('concurrent-01'));
  const a=outbox.deliver(),b=outbox.deliver();assert.equal(a,b);await a;
  outbox.enqueue(ev('pending-at-close-01'));
  await outbox.close();
  assert.match(await journal(),/pending-at-close-01/);
  assert.equal(outbox.enqueue(ev('after-close-01')),false);
});
test('Outbox refuses new content snapshots over its disk budget but keeps lightweight events',async t=>{
  const {outbox}=await harness(t,{maxBytes:1000,port:1});
  outbox.enqueue(ev('budget-snap-01',{kind:'document.snapshot',content:'x'.repeat(2000)}));
  await outbox.persist();
  assert(outbox.queuedBytes>1000);
  assert.equal(outbox.enqueue(ev('budget-snap-02',{kind:'document.snapshot',content:'y'})),false);
  assert.equal(outbox.enqueue(ev('budget-light-01')),true);
});
test('whenOnline resolves only after a successful delivery',async t=>{
  const {outbox}=await harness(t);
  let online=false;const waiting=outbox.whenOnline().then(()=>{online=true;});
  await new Promise(r=>setImmediate(r));assert.equal(online,false);
  outbox.enqueue(ev('online-01'));await outbox.deliver();await waiting;assert.equal(online,true);
});

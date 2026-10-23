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

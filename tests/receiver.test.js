'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {sha}=require('../receiver/protocol');
const {tempDir,startService}=require('./helpers');
const projectId=sha('receiver-test');
async function start(t){
  const dir=tempDir(t,'cr-receiver-');
  const service=await startService(t,{port:0,dataDir:dir,sortIntervalMs:600000});
  const post=events=>fetch(`http://127.0.0.1:${service.port}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${service.token}`},body:JSON.stringify({events})});
  return {dir,service,post,journal:path.join(dir,'projects',sha(projectId),'events.jsonl')};
}
const ev=(id,extra={})=>({v:1,id,ts:Date.now(),projectId,sessionId:'rx',kind:'document.saved',file:'src/a.ts',...extra});
test('One invalid event does not discard the valid events in its batch',async t=>{
  const {post,journal}=await start(t);
  const r=await post([ev('valid-event-01'),ev('invalid-event-01',{file:'../../etc/passwd'}),ev('valid-event-02')]);
  assert.equal(r.status,202);const body=await r.json();
  assert.equal(body.accepted,2);assert.deepEqual(body.rejected.map(x=>x.id),['invalid-event-01']);
  const text=await fs.readFile(journal,'utf8');
  assert.match(text,/valid-event-01/);assert.match(text,/valid-event-02/);assert.doesNotMatch(text,/invalid-event-01/);
  assert.equal((await post([ev('invalid-event-02',{kind:'not.a.kind'})])).status,422);
});
test('A journal truncated mid-line by a crash is terminated before new records are appended',async t=>{
  const {dir,post,journal,service}=await start(t);
  await post([ev('before-crash-01')]);
  await service.stop();
  await fs.appendFile(journal,'{"v":1,"id":"torn-rec');
  const again=await startService(t,{port:0,dataDir:dir,sortIntervalMs:600000});
  const r=await fetch(`http://127.0.0.1:${again.port}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${again.token}`},body:JSON.stringify({events:[ev('after-crash-01')]})});
  assert.equal(r.status,202);
  const lines=(await fs.readFile(journal,'utf8')).split('\n').filter(Boolean);
  assert.equal(JSON.parse(lines.at(-1)).id,'after-crash-01');
  assert.equal(lines.at(-2),'{"v":1,"id":"torn-rec');
});
test('Write endpoints reject wrong or missing tokens',async t=>{
  const {service}=await start(t);
  for(const auth of [undefined,'Bearer nope',`Bearer ${service.token}x`]){
    const r=await fetch(`http://127.0.0.1:${service.port}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},body:JSON.stringify({events:[ev('auth-01')]})});
    assert.equal(r.status,401);
  }
});

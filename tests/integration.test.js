'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createService}=require('../receiver/server');const {sha}=require('../receiver/protocol');
const {tempDir,track}=require('./helpers');
const id=sha('server-integration');
function event(i,kind,more={}){return {v:1,id:`integration-event-${i}`,ts:1750000000000+i*1000,kind,projectId:id,sessionId:'test-run',...more};}
test('End-to-end receiver -> durable journal -> AST sorter -> versioned performance frames -> restart',async(t)=>{
  const dataDir=tempDir(t,'s3code-');
  let service=track(t,createService({port:0,dataDir,sortIntervalMs:100000}));await service.start();
  const url=`http://127.0.0.1:${service.port}`;
  async function req(method,route,body,auth=true){return fetch(url+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:`Bearer ${service.token}`}:{})},body:body?JSON.stringify(body):undefined});}
  let r=await req('POST','/v1/events',{events:[event(1,'document.snapshot',{file:'src/Main.tsx',content:'export function Main(){return <h1>HELLO</h1>}',meta:{reason:'edit'}})]},false);
  assert.equal(r.status,401);
  r=await req('POST','/v1/events',{events:[event(2,'document.snapshot',{file:'../etc/passwd',content:'not allowed'})]});assert.equal(r.status,422);
  r=await req('POST','/v1/events',{events:[event(3,'document.snapshot',{file:'src/Main.tsx',content:'export function Main(){return <h1>HELLO</h1>}',meta:{reason:'edit'}}),event(4,'task.finished',{meta:{taskName:'npm test',exitCode:0}})]});
  assert.equal(r.status,202);
  r=await req('POST',`/v1/flush?id=${id}`);assert.equal(r.status,200);const flush=await r.json();assert(flush.events===0||flush.events===2); // startup scan may have already sorted the journal
  r=await req('GET',`/api/project?id=${id}`);assert.equal(r.status,200);const projection=await r.json();
  assert(projection.stats.symbols>0);assert.equal(projection.stats.testsPassed,1);
  assert(projection.graph.nodes.some(n=>n.type==='ui.component'));
  assert(!JSON.stringify(projection).includes('HELLO'));
  r=await req('GET',`/v1/performance/frames?id=${id}`);let bridge=await r.json();
  assert.equal(bridge.schema,'code-resonance.performance.v1');assert(bridge.frames.length>0);
  const oldCount=projection.stats.raw;
  await service.stop();
  service=track(t,createService({port:0,dataDir,sortIntervalMs:100000}));await service.start();
  r=await fetch(`http://127.0.0.1:${service.port}/api/project?id=${id}`);assert.equal(r.status,200);
  assert.equal((await r.json()).stats.raw,oldCount);
  r=await fetch(`http://127.0.0.1:${service.port}/`);assert.equal(r.status,200);
  assert((await r.text()).includes('CODE'));
});

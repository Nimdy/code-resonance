'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createService}=require('../receiver/server');const {sha}=require('../receiver/protocol');
const projectId=sha('timeline-test');
async function start(t,dir,extra={}){
  const service=await createService({port:0,dataDir:dir,sortIntervalMs:600000,windowMs:300,graceMs:50,...extra}).start();t.after(()=>service.stop());
  const url=`http://127.0.0.1:${service.port}`;
  const auth={Authorization:`Bearer ${service.token}`};
  return {service,url,
    post:async events=>{const r=await fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({events})});assert.equal(r.status,202);},
    flush:async(id=projectId)=>(await fetch(url+`/v1/flush${id?`?id=${id}`:''}`,{method:'POST',headers:auth})).json(),
    rebuild:async()=>(await fetch(url+`/v1/rebuild?id=${projectId}`,{method:'POST',headers:auth})).json(),
    get:async route=>(await fetch(url+route)).json()};
}
let n=0;const ev=(kind,extra={})=>({v:1,id:`timeline-ev-${String(++n).padStart(5,'0')}`,ts:Date.now(),kind,projectId,sessionId:'tl',...extra});
const snap=(file,content)=>ev('document.snapshot',{file,content,meta:{reason:'edit'}});
const perfFile=dir=>path.join(dir,'projects',sha(projectId),'performance.jsonl');
async function session(s){
  await s.post([snap('src/a.ts','export function a(){ return 1; }')]);await s.flush();
  await s.post([snap('src/ui/App.tsx',"import {a} from '../a';\nexport function App(){ return <main>{a()}</main>; }"),ev('task.finished',{meta:{taskName:'npm test',category:'test',exitCode:1}})]);await s.flush();
  await s.post([snap('src/b.ts','export class B { run(){ return 2; } }'),ev('task.finished',{meta:{taskName:'npm test',category:'test',exitCode:0}})]);
  // This window closes by the wall clock rather than by a recorded flush.
  await new Promise(r=>setTimeout(r,450));await s.flush(null);
  await s.post([ev('agent.tool.completed',{file:'src/c.ts',meta:{provider:'claude-code',agent:'s1',tool:'Write'}}),snap('src/c.ts','export const c = () => 3;')]);await s.flush();
}
test('Re-interpreting the journal reproduces the recorded performance exactly',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cr-timeline-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const s=await start(t,dir);
  await session(s);
  const live=await fs.readFile(perfFile(dir),'utf8');
  const frames=live.trim().split('\n').map(l=>JSON.parse(l));
  assert(frames.length>=4,`frames: ${frames.length}`);
  assert.deepEqual(frames.map(f=>f.seq),frames.map((_,i)=>i));
  for(const f of frames)assert(f.start<=f.end&&f.frame.createdAt===f.end);
  await s.rebuild();
  assert.equal(await fs.readFile(perfFile(dir),'utf8'),live);
});
test('Graph deltas replayed from the timeline reconstruct the live graph',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cr-timeline-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const s=await start(t,dir);
  await session(s);
  const nodes=new Map(),edges=new Map();const key=e=>`${e.a}>${e.b}>${e.kind}`;
  let after=-1,total=0;
  for(;;){
    const page=await s.get(`/api/timeline?id=${projectId}&after=${after}&limit=2`);total=page.total;
    if(!page.entries.length)break;
    for(const {graph} of page.entries){
      if(graph.keyframe){nodes.clear();edges.clear();for(const x of graph.nodes)nodes.set(x.id,x);for(const e of graph.edges)edges.set(key(e),e);continue;}
      for(const x of graph.add)nodes.set(x.id,x);for(const id of graph.remove)nodes.delete(id);
      for(const e of graph.addEdges)edges.set(key(e),e);for(const e of graph.removeEdges)edges.delete(key(e));
    }
    after=page.entries.at(-1).seq;
  }
  assert.equal(after,total-1);
  const live=await s.get(`/api/project?id=${projectId}`);
  assert.deepEqual([...nodes.values()].sort((a,b)=>a.id.localeCompare(b.id)),[...live.graph.nodes].sort((a,b)=>a.id.localeCompare(b.id)));
  assert.deepEqual([...edges.keys()].sort(),live.graph.edges.map(key).sort());
});
test('An older interpretation is rebuilt from the journal on start; frames after the last checkpoint are regenerated',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cr-timeline-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  let s=await start(t,dir);
  await session(s);
  const live=await fs.readFile(perfFile(dir),'utf8');
  await s.service.stop();
  // Simulate a crash after appending frames but before the checkpoint.
  await fs.appendFile(perfFile(dir),'{"seq":999,"start":0,"end":0,"frame":{}}\n');
  s=await start(t,dir);await s.flush(null);
  assert.equal(await fs.readFile(perfFile(dir),'utf8'),live);
  await s.service.stop();
  const stateFile=path.join(dir,'projects',sha(projectId),'state.json');
  const state=JSON.parse(await fs.readFile(stateFile,'utf8'));state.interpretationVersion=1;await fs.writeFile(stateFile,JSON.stringify(state));
  await fs.rm(perfFile(dir));
  s=await start(t,dir);await s.flush(null);
  assert.equal(await fs.readFile(perfFile(dir),'utf8'),live);
  assert.equal((await s.get(`/api/project?id=${projectId}`)).interpretationVersion,2);
});
test('Project view supports conditional requests',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cr-timeline-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const s=await start(t,dir);
  await s.post([snap('src/a.ts','export function a(){}')]);await s.flush();
  const first=await fetch(`${s.url}/api/project?id=${projectId}`);const etag=first.headers.get('etag');
  assert(etag);assert.equal((await fetch(`${s.url}/api/project?id=${projectId}`,{headers:{'If-None-Match':etag}})).status,304);
});

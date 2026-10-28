'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {newState,apply,closeBatch,publicProjection,drainIntents,INTERPRETATION_VERSION}=require('../engine/reducer');
const {sha,validateEvent,safeRelative}=require('../receiver/protocol');
const {toPerformanceIntent}=require('../sdk/performance');
const projectId=sha('test-project');let seq=0;
function e(kind,extras={}){return {v:1,kind,id:`test-event-${++seq}`,ts:1740000000000+seq*1000,projectId,sessionId:'session1',origin:'test',...extras};}
test('Baseline is not credited as newly created work; later changes are',()=>{
  const state=newState(projectId);
  apply(state,e('document.snapshot',{file:'src/a.ts',content:'export function foo(){return 1}',meta:{reason:'baseline'}}));
  assert.equal(state.stats.created,0);
  assert.equal(state.stats.symbols,1);
  let cues=apply(state,e('document.snapshot',{file:'src/a.ts',content:'export function foo(){return 2}\nexport const name = "world";',meta:{reason:'edit'}}));
  assert(cues.some(c=>c.type==='symbol.modified'));
  assert(cues.some(c=>c.type==='symbol.created'&&c.detail.symbolType==='variable'));
  assert(state.performance.progress>0);
  assert(!publicProjection(state).graph.nodes.some(n=>JSON.stringify(n).includes('foo')));
});
test('AI visible thinking is not hidden reasoning; prompt does not count as validated progress',()=>{
  const state=newState(projectId);
  apply(state,e('agent.prompt.submitted',{meta:{provider:'test',source:'explicit-hook'}}));
  apply(state,e('agent.thinking.visible',{meta:{provider:'test',source:'explicit-hook',thinkingExposed:true}}));
  assert.equal(state.stats.agentEvents,2);
  assert.equal(state.performance.progress,0);
});
test('Failing test increases tension, passing test resolves and contributes growth',()=>{
  const state=newState(projectId);
  apply(state,e('task.finished',{meta:{taskName:'npm test',exitCode:1}}));
  assert.equal(state.stats.testsFailed,1);assert(state.performance.tension>=.35);
  apply(state,e('task.finished',{meta:{taskName:'npm test',exitCode:0}}));
  assert.equal(state.stats.testsPassed,1);assert(state.performance.tension<.35);
  assert(state.performance.progress>=3);
});
test('Journal event IDs are idempotent and 10-second output is contract bounded',()=>{
  const state=newState(projectId),evt=e('document.change',{file:'src/a.ts',changes:[{insertedLines:2}]});
  const cues=apply(state,evt);
  apply(state,evt);
  assert.equal(state.stats.raw,1);
  assert.equal(state.stats.newlines,2);
  const frame=closeBatch(state,cues);
  assert.equal(frame.schema,'code-resonance.frame.v1');
  const result=toPerformanceIntent(frame);
  assert.equal(result.authority,'advisory-only');
  assert.equal(result.requestedTransition,'next-musical-boundary');
  for(const value of Object.values(result.parameters))assert(value>=0&&value<=1);
});
test('Path traversal and secret filenames rejected at ingestion',()=>{
  assert.equal(safeRelative('../etc/passwd'),null);
  assert.equal(safeRelative('src/.env.production'),null);
  assert.equal(safeRelative('node_modules/lib/a.ts'),null);
  assert.equal(safeRelative('src/index.ts'),'src/index.ts');
  assert.throws(()=>validateEvent(e('document.snapshot',{file:'../../secret',content:'anything'})));
});
test('Deterministic interpretations from identical journal inputs',()=>{
  const evt=e('document.snapshot',{file:'src/a.ts',content:'export function foo(){return 2}',meta:{reason:'edit'}});
  function run(){const state=newState(projectId);const cues=apply(state,evt);return {cues,frame:closeBatch(state,cues)};}
  assert.deepEqual(run(),run());
});
test('Meaningful activity outweighs volume: line shifts earn nothing, components do, re-running green tests earns nothing',()=>{
  const state=newState(projectId);
  const body=Array.from({length:6},(_,i)=>`export function h${i}(req){\n  const u=getUser(req.id);\n  log.info(u);\n  return respond(u);\n}`).join('\n');
  apply(state,e('document.snapshot',{file:'src/svc.ts',content:body,meta:{reason:'baseline'}}));
  apply(state,e('document.snapshot',{file:'src/svc.ts',content:'\n// moved\n'+body,meta:{reason:'edit'}}));
  assert.equal(state.performance.progress,0);
  apply(state,e('document.snapshot',{file:'src/Card.tsx',content:'export function Card(){return <div/>}',meta:{reason:'edit'}}));
  const afterComponent=state.performance.progress;assert(afterComponent>1);
  apply(state,e('task.finished',{meta:{taskName:'npm test',category:'test',exitCode:0}}));
  const afterFirstPass=state.performance.progress;assert(afterFirstPass>afterComponent);
  apply(state,e('task.finished',{meta:{taskName:'npm test',category:'test',exitCode:0}}));
  assert.equal(state.performance.progress,afterFirstPass);
});
test('A huge generated file saturates; a validated refactor that removes code is credited',()=>{
  const state=newState(projectId);
  const huge=Array.from({length:400},(_,i)=>`export function gen${i}(){ return ${i}; }`).join('\n');
  apply(state,e('document.snapshot',{file:'src/gen.ts',content:huge,meta:{reason:'edit'}}));
  assert(state.performance.progress<=6.0001,`progress ${state.performance.progress}`);
  const before=state.performance.progress;
  apply(state,e('document.snapshot',{file:'src/gen.ts',content:'export function gen0(){ return 0; }',meta:{reason:'edit'}}));
  assert.equal(state.performance.progress,before,'removal alone is not progress');
  const cues=apply(state,e('terminal.command.finished',{meta:{category:'test',exitCode:0}}));
  assert(cues.some(c=>c.type==='milestone.refactor.validated'&&c.weight>=4));
});
test('Tension reflects current state: open errors and failing validations, not accumulated nudges',()=>{
  const state=newState(projectId);
  for(let i=0;i<40;i++)apply(state,e('diagnostics.updated',{file:'src/a.ts',meta:{errors:1,warnings:0}}));
  const oneError=state.performance.tension;assert(oneError>0&&oneError<0.1,`one open error gives mild tension (${oneError})`);
  apply(state,e('diagnostics.updated',{file:'src/a.ts',meta:{errors:0,warnings:0}}));
  assert.equal(state.performance.tension,0);
  apply(state,e('terminal.command.finished',{meta:{category:'build',exitCode:2}}));
  assert(state.performance.tension>=0.4);
});
test('Agents get stable catalog seats; file changes are attributed only when correlated with that agent',()=>{
  const state=newState(projectId);
  apply(state,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'session-A',tool:'Edit'}}));
  apply(state,e('agent.tool.completed',{file:'src/b.ts',meta:{provider:'claude-code',agent:'session-B',tool:'Write'}}));
  const a=apply(state,e('document.snapshot',{file:'src/a.ts',content:'export function fromAgentA(){}',meta:{reason:'external'}}));
  const human=apply(state,e('document.snapshot',{file:'src/c.ts',content:'export function byUnknown(){}',meta:{reason:'edit'}}));
  const agents=Object.values(state.agents);
  assert.equal(agents.length,2);
  assert.notEqual(agents[0].id,agents[1].id);
  assert.deepEqual(agents.map(x=>x.voice).sort(),[0,0],'subagents of one provider share the catalog seat');
  assert(a.some(c=>c.type==='symbol.created'&&c.detail.attribution==='correlated'&&c.detail.agentId===agents[0].id));
  assert(human.every(c=>!c.detail.agentId));
});
test('Two providers on one file emit one collision; two Claude subagents do not',()=>{
  const collide=newState(projectId);collide.salt='cast-salt';
  apply(collide,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'session-A',tool:'Edit'}}));
  const second=apply(collide,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'cursor',agent:'session-B',tool:'Edit'}}));
  apply(collide,e('document.snapshot',{file:'src/a.ts',content:'export function fromBoth(){}',meta:{reason:'edit'}}));
  const intents=drainIntents(collide).filter(i=>i.type==='agent.collision');
  const cues=[...second,...collide.timeline].filter(c=>c.type==='agent.collision');
  const uniqueCues=[...new Map(cues.map(c=>[c.id,c])).values()];
  assert.equal(intents.length,1);
  assert.equal(uniqueCues.length,1);
  assert.equal(intents[0].tier,2);assert.equal(intents[0].evidence,'derived');assert.equal(intents[0].magnitude,0.4);
  assert.deepEqual(intents[0].detail,{providers:['claude-code','cursor'],scope:'file'});
  assert.equal(uniqueCues[0].category,'observed');
  assert.deepEqual(uniqueCues[0].detail.providers,['claude-code','cursor']);
  assert.deepEqual(uniqueCues[0].detail.voices,[0,1]);
  const json=JSON.stringify({intents,cues:uniqueCues,subject:intents[0].subject});
  assert(!/src\/|a\.ts/.test(json),'collision JSON has no paths');
  const cursor=Object.values(collide.agents).find(a=>a.provider==='cursor');
  const snap=collide.timeline.filter(c=>c.detail?.attribution==='correlated'&&c.detail?.agentId);
  assert(snap.some(c=>c.detail.agentId===cursor.id),'last writer still attributes the snapshot');

  const same=newState(projectId);same.salt='cast-salt';
  apply(same,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'sub-A',tool:'Edit'}}));
  apply(same,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'sub-B',tool:'Write'}}));
  apply(same,e('document.snapshot',{file:'src/a.ts',content:'export function fromClaude(){}',meta:{reason:'edit'}}));
  assert.equal(drainIntents(same).filter(i=>i.type==='agent.collision').length,0);
  assert.equal(same.timeline.filter(c=>c.type==='agent.collision').length,0);
  const voices=Object.values(same.agents).map(x=>x.voice);
  assert.deepEqual(voices,[0,0]);
  assert.equal(new Set(Object.values(same.agents).map(x=>x.id)).size,2);
});
test('Two providers on different files in one district emit one subsystem collision',()=>{
  const state=newState(projectId);state.salt='cast-salt';
  apply(state,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'A',tool:'Edit'}}));
  apply(state,e('agent.tool.completed',{file:'src/b.ts',meta:{provider:'cursor',agent:'B',tool:'Edit'}}));
  const first=drainIntents(state).filter(i=>i.type==='agent.collision');
  assert.equal(first.length,1);
  assert.equal(first[0].detail.scope,'subsystem');
  assert.deepEqual(first[0].detail.providers,['claude-code','cursor']);
  assert(!/src\/|a\.ts|b\.ts/.test(JSON.stringify({intents:first,subject:first[0].subject})),'subsystem collision has no paths');
  apply(state,e('document.snapshot',{file:'src/a.ts',content:'export function a(){}',meta:{reason:'edit'}}));
  assert.equal(drainIntents(state).filter(i=>i.type==='agent.collision').length,0,'snapshot after a subsystem collision is not a second');

  const after=newState(projectId);after.salt='cast-salt';
  apply(after,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'A',tool:'Edit'}}));
  apply(after,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'cursor',agent:'B',tool:'Edit'}}));
  drainIntents(after);
  apply(after,e('agent.tool.completed',{file:'src/b.ts',meta:{provider:'cursor',agent:'B',tool:'Edit'}}));
  const sibling=drainIntents(after).filter(i=>i.type==='agent.collision');
  assert.equal(sibling.length,1);
  assert.equal(sibling[0].detail.scope,'subsystem','a later sibling write is a distinct district meeting');
});
test('Interpretation v8 is current; two apply() runs of a collision journal match',()=>{
  assert.equal(INTERPRETATION_VERSION,8);
  function run(){
    let n=0;const ev=(kind,extras={})=>({v:1,kind,id:`det-event-${++n}`,ts:1741100000000+n*1000,projectId,sessionId:'session1',origin:'test',...extras});
    const state=newState(projectId);state.salt='det-salt';state.createdAt=0;
    apply(state,ev('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'A',tool:'Edit'}}));
    apply(state,ev('agent.tool.completed',{file:'src/a.ts',meta:{provider:'cursor',agent:'B',tool:'Edit'}}));
    apply(state,ev('document.snapshot',{file:'src/a.ts',content:'export function x(){}',meta:{reason:'edit'}}));
    return {intents:drainIntents(state).filter(i=>i.type==='agent.collision'),cues:state.timeline.filter(c=>c.type==='agent.collision')};
  }
  assert.deepEqual(run(),run());
  assert.equal(run().intents.length,1);
});
test('Public graph shows every module and fills its budget with the most meaningful symbols first',()=>{
  const state=newState(projectId);
  for(let i=0;i<30;i++)apply(state,e('document.snapshot',{file:`src/m${i}.tsx`,content:`import {x} from './m${(i+1)%30}';\nexport const v${i} = 1;\nexport function helper${i}(){ const local = 2; return local; }\nexport function View${i}(){ return <div/>; }`,meta:{reason:'baseline'}}));
  const {graph}=publicProjection(state);
  assert.equal(graph.nodes.filter(n=>n.type==='module').length,30);
  // Group nodes (architectural districts, added in interpretation v5) come first; symbols follow.
  const order=graph.nodes.filter(n=>n.type!=='module'&&n.type!=='group').map(n=>n.type);
  assert.equal(order[0],'ui.component');assert(order.indexOf('variable')>order.lastIndexOf('ui.component'));
  assert(!graph.nodes.some(n=>n.type==='callsite'));
  assert(graph.nodes.filter(n=>n.parent).every(n=>graph.nodes.some(m=>m.id===n.parent)));
  assert.equal(graph.edges.filter(x=>x.kind==='depends').length,30);
});
test('Project name labels the local project list but never enters the recorded performance',()=>{
  const state=newState(projectId);
  const cues=apply(state,e('workspace.started',{name:'my-app'}));
  assert.equal(publicProjection(state).name,'my-app');
  const frame=closeBatch(state,cues);
  assert(!JSON.stringify(frame).includes('my-app')&&!JSON.stringify(cues).includes('my-app'));
  apply(state,e('workspace.started',{}));
  assert.equal(publicProjection(state).name,'my-app','an unnamed restart keeps the known name');
});
test('Rebuild v7 to v8 from a journal is byte-stable on the second run',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path');
  const {tempDir,startService}=require('./helpers');
  const dir=tempDir(t,'cr-cast-rebuild-');
  const id=sha('cast-rebuild');
  async function start(){
    const service=await startService(t,{port:0,dataDir:dir,sortIntervalMs:600000,windowMs:300,graceMs:50,quiet:true});
    const url=`http://127.0.0.1:${service.port}`;
    const auth={Authorization:`Bearer ${service.token}`};
    return {service,
      post:async events=>{const r=await fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({events})});assert.equal(r.status,202);},
      flush:async()=>(await fetch(url+`/v1/flush?id=${id}`,{method:'POST',headers:auth})).json(),
      rebuild:async()=>(await fetch(url+`/v1/rebuild?id=${id}`,{method:'POST',headers:auth})).json()};
  }
  let n=0;const ev=(kind,extra)=>({v:1,id:`cast-rb-${++n}`,ts:1760000000000+n*1000,kind,projectId:id,sessionId:'s',origin:'test',...extra});
  let s=await start();
  await s.post([ev('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'A',tool:'Edit'}})]);
  await s.post([ev('agent.tool.completed',{file:'src/a.ts',meta:{provider:'cursor',agent:'B',tool:'Edit'}})]);
  await s.post([ev('document.snapshot',{file:'src/a.ts',content:'export function a(){return 1}',meta:{reason:'edit'}})]);
  await s.flush();
  const perf=path.join(dir,'projects',sha(id),'performance.jsonl');
  const live=await fs.readFile(perf,'utf8');
  assert.match(live,/agent\.collision/);
  await s.service.stop();
  const stateFile=path.join(dir,'projects',sha(id),'state.json');
  const state=JSON.parse(await fs.readFile(stateFile,'utf8'));
  assert.equal(state.interpretationVersion,8);
  state.interpretationVersion=7;await fs.writeFile(stateFile,JSON.stringify(state));
  await fs.rm(perf,{force:true});
  s=await start();await s.flush();
  assert.equal(await fs.readFile(perf,'utf8'),live);
  await s.rebuild();
  assert.equal(await fs.readFile(perf,'utf8'),live);
});

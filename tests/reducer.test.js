'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {newState,apply,closeBatch,publicProjection}=require('../engine/reducer');
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
test('Agents get stable distinct voices; file changes are attributed only when correlated with that agent',()=>{
  const state=newState(projectId);
  apply(state,e('agent.tool.completed',{file:'src/a.ts',meta:{provider:'claude-code',agent:'session-A',tool:'Edit'}}));
  apply(state,e('agent.tool.completed',{file:'src/b.ts',meta:{provider:'claude-code',agent:'session-B',tool:'Write'}}));
  const a=apply(state,e('document.snapshot',{file:'src/a.ts',content:'export function fromAgentA(){}',meta:{reason:'external'}}));
  const human=apply(state,e('document.snapshot',{file:'src/c.ts',content:'export function byUnknown(){}',meta:{reason:'edit'}}));
  const voices=Object.values(state.agents).map(x=>x.voice).sort();
  assert.deepEqual(voices,[0,1]);
  assert(a.some(c=>c.type==='symbol.created'&&c.detail.attribution==='correlated'&&c.detail.agentId===Object.values(state.agents)[0].id));
  assert(human.every(c=>!c.detail.agentId));
});

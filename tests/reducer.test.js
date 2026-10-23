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

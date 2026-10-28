'use strict';
// Interpretation v8: canonical performance intents, CAST seats, and agent.collision. Worlds express intents; they never
// decide whether something happened, so these rules are the honesty boundary of every visual effect.
const test=require('node:test'),assert=require('node:assert/strict');
const {newState,apply,closeBatch,drainIntents}=require('../engine/reducer');
const {sha}=require('../receiver/protocol');
const projectId=sha('intents-test');let seq=0;
const e=(kind,extra={})=>({v:1,kind,id:`intent-${++seq}`,ts:1750000000000+seq*1000,projectId,sessionId:'s',origin:'test',...extra});
const snap=(file,content,reason='edit')=>e('document.snapshot',{file,content,meta:{reason}});
const fresh=()=>{const s=newState(projectId);s.salt='intent-salt';return s;};
const run=(s,events)=>{for(const ev of events)apply(s,ev);return drainIntents(s);};
const types=list=>list.map(i=>i.type);
const agent=(kind,meta={},extra={})=>e(kind,{origin:'hook',meta:{provider:'claude-code',source:'claude-code-hook',agent:'session-a',...meta},...extra});

test('A failing run is a verified failure, never a success; recovery needs an observed pass',()=>{
  const s=fresh();
  run(s,[snap('src/lib/a.ts','export function a(){}'),snap('src/lib/b.ts','export function b(){}')]);
  const failed=run(s,[e('terminal.command.finished',{meta:{category:'test',exitCode:1}})]);
  assert.deepEqual(types(failed),['validation.failed']);
  assert.equal(failed[0].evidence,'verified');assert.equal(failed[0].subject.fileIds.length,2);
  assert(!failed.some(i=>/passed|recovered|milestone/.test(i.type)));
  // A repair edit is not a recovery.
  assert(!types(run(s,[snap('src/lib/a.ts','export function a(){return 1}')])).some(t=>t.startsWith('validation')));
  const passed=run(s,[e('terminal.command.finished',{meta:{category:'test',exitCode:0}})]);
  const recovered=passed.find(i=>i.type==='validation.recovered');
  assert(recovered);assert.equal(recovered.tier,3);assert.equal(recovered.detail.repaired,2);assert.equal(recovered.evidence,'verified');
});

test('Unverified AI events cannot claim validated work',()=>{
  const s=fresh();run(s,[snap('src/lib/a.ts','export function a(){}')]);
  const out=run(s,[agent('agent.prompt.submitted',{length:30}),agent('agent.thinking.visible',{thinkingExposed:true}),agent('agent.message.visible',{length:80}),
    agent('agent.plan.visible',{length:10}),agent('agent.response.completed',{length:200})]);
  assert(out.every(i=>i.type==='agent.state'),types(out).join());
  assert(!out.some(i=>i.evidence==='verified'));
  // Thinking is shown only as the provider exposed it, and labelled as such.
  assert.equal(out.find(i=>i.detail.state==='thinking').detail.activity,'reasoning (visible)');
});

test('Volume is not significance: typing and newlines make no structure; re-running green tests is micro',()=>{
  const s=fresh();run(s,[snap('src/lib/a.ts','export function a(){}')]);
  const typing=run(s,[e('document.edits',{file:'src/lib/a.ts',meta:{edits:400,insertedLines:100}}),e('document.saved',{file:'src/lib/a.ts'})]);
  assert.deepEqual(typing,[]);
  run(s,[e('terminal.command.finished',{meta:{category:'test',exitCode:0}})]);
  const rerun=run(s,[e('terminal.command.finished',{meta:{category:'test',exitCode:0}})]);
  assert.deepEqual(rerun.map(i=>[i.type,i.tier]),[['validation.passed',0]]);
  // A huge generated file saturates: its structure intent cannot exceed magnitude 1, and it is not a milestone.
  const big=run(s,[snap('src/gen/huge.ts',Array.from({length:600},(_,i)=>`export function g${i}(){}`).join('\n'))]);
  assert(big.every(i=>i.tier<=2&&i.magnitude<=1));assert(!big.some(i=>i.type==='milestone.achieved'));
});

test('New subsystems and the first connection between two subsystems are structural; repeats are routine',()=>{
  const s=fresh();
  const first=run(s,[snap('src/data/store.ts','export function load(){}')]);
  assert(types(first).includes('subsystem.created'));assert(types(first).includes('module.created'));
  const second=run(s,[snap('src/data/cache.ts','export function cache(){}')]);
  assert(!types(second).includes('subsystem.created'),'a second file in the same district is not a new subsystem');
  run(s,[snap('src/ui/List.tsx','export function List(){return <ul/>}')]);
  const link=run(s,[snap('src/ui/List.tsx',"import {load} from '../data/store';\nexport function List(){return <ul/>}")]);
  const connected=link.find(i=>i.type==='subsystem.connected');
  assert(connected);assert.equal(connected.tier,2);assert.equal(connected.detail.first,true);assert(connected.subject.targetGroupId);
  const again=run(s,[snap('src/ui/Row.tsx',"import {cache} from '../data/cache';\nexport function Row(){return <li/>}")]);
  const repeat=again.find(i=>i.type==='subsystem.connected');
  assert.equal(repeat.tier,1);assert.equal(repeat.detail.first,false);
  const inside=run(s,[snap('src/data/cache.ts',"import {load} from './store';\nexport function cache(){}")]);
  assert(types(inside).includes('structure.linked'));assert(!types(inside).includes('subsystem.connected'));
});

test('Milestones need a verified run plus a structural reason; several reasons together are rare',()=>{
  const s=fresh();
  for(const f of ['src/data/a.ts','src/ui/B.tsx','src/api/c.ts'])run(s,[snap(f,'export function x(){}')]);
  // First validation of new structure is a milestone (tier 3), not a spectacle.
  const first=run(s,[e('terminal.command.finished',{meta:{category:'test',exitCode:0}})]).find(i=>i.type==='milestone.achieved');
  assert(first);assert.deepEqual(first.detail.kinds,['first-validation']);assert.equal(first.tier,3);
  // Integration (a cross-district link) validated after a failure that the run repairs: rare.
  run(s,[snap('src/ui/B.tsx',"import {x} from '../data/a';\nexport function x(){}")]);
  run(s,[e('terminal.command.finished',{meta:{category:'test',exitCode:1}})]);
  const both=run(s,[e('terminal.command.finished',{meta:{category:'test',exitCode:0}})]).find(i=>i.type==='milestone.achieved');
  assert.deepEqual(both.detail.kinds.sort(),['integration-validated','recovery']);
  // Without a structural reason a pass is no milestone.
  assert(!run(s,[e('terminal.command.finished',{meta:{category:'test',exitCode:0}})]).some(i=>i.type==='milestone.achieved'));
  // Builds and type checks validate, but only test runs make milestones.
  run(s,[snap('src/api/c.ts','export function x(){}\nexport function y(){}')]);
  const build=run(s,[e('terminal.command.finished',{meta:{category:'build',exitCode:0}})]);
  assert.deepEqual(types(build),['validation.passed']);
});

test('Agent lifecycle follows hook events; reading is activity, not authorship',()=>{
  const s=fresh();run(s,[snap('src/ui/App.tsx','export function App(){return <main/>}')]);
  const states=run(s,[agent('agent.session.started'),agent('agent.prompt.submitted',{length:12}),
    agent('agent.tool.started',{tool:'Read'},{file:'src/ui/App.tsx'}),agent('agent.tool.completed',{tool:'Read',result:'succeeded'},{file:'src/ui/App.tsx'}),
    agent('agent.tool.started',{tool:'Bash',category:'test'}),agent('agent.tool.completed',{tool:'Bash',category:'test',exitCode:1,result:'failed'}),
    agent('agent.response.completed',{length:40}),agent('agent.session.ended')]).filter(i=>i.type==='agent.state');
  assert.deepEqual(states.map(i=>[i.detail.state,i.detail.activity]),[['connected',null],['processing',null],['tool','reading'],['processing',null],['tool','testing'],['processing',null],['waiting',null],['disconnected',null]]);
  assert(states[2].subject.fileId,'a read shows where the agent looks');
  // The read does not make the next human edit the agent's.
  const edit=apply(s,snap('src/ui/App.tsx','export function App(){return <main><h1/></main>}'));
  assert(!edit.some(c=>c.detail.attribution==='correlated'));
  // An edit tool does.
  apply(s,agent('agent.tool.completed',{tool:'Edit',result:'succeeded'},{file:'src/ui/App.tsx'}));
  const attributed=apply(s,snap('src/ui/App.tsx','export function App(){return <main><h1/><p/></main>}\nexport const X=1;'));
  assert(attributed.some(c=>c.detail.attribution==='correlated'));
  drainIntents(s);
});

test('Intents carry salted ids only, and a chapter change enlarges the world without claiming completion',()=>{
  const s=fresh();const cues=[];
  for(let i=0;i<14;i++)cues.push(...apply(s,snap(`src/feature${i%3}/mod${i}.tsx`,`export function Screen${i}(){return <div/>}\nexport class Model${i}{}`)));
  closeBatch(s,cues);
  const all=drainIntents(s);
  const json=JSON.stringify(all);
  assert(!/src\/|feature|mod\d|Screen|Model/.test(json),'no paths or identifiers');
  const grown=all.find(i=>i.type==='world.expanded');
  assert(grown);assert.equal(grown.evidence,'derived');assert(grown.tier<3);
});

test('Two providers on one file emit one collision intent; two Claude subagents do not',()=>{
  const s=fresh();
  const collisions=run(s,[agent('agent.tool.completed',{tool:'Edit'},{file:'src/lib/a.ts'}),
    e('agent.tool.completed',{origin:'hook',file:'src/lib/a.ts',meta:{provider:'cursor',source:'generic',agent:'cursor-1',tool:'Edit'}})]).filter(i=>i.type==='agent.collision');
  assert.equal(collisions.length,1);
  assert.equal(collisions[0].evidence,'derived');assert.equal(collisions[0].tier,2);
  assert.deepEqual(collisions[0].detail.providers,['claude-code','cursor']);
  assert.equal(collisions[0].detail.scope,'file');
  const json=JSON.stringify(collisions);
  assert(!/src\/|lib\/|a\.ts/.test(json),'collision intent has no paths');
  assert.equal(run(s,[e('document.snapshot',{file:'src/lib/a.ts',content:'export function a(){return 1}',meta:{reason:'edit'}})]).filter(i=>i.type==='agent.collision').length,0,'tool then snapshot is one collision');

  const same=fresh();
  assert.equal(run(same,[agent('agent.tool.completed',{tool:'Edit',agent:'session-a'},{file:'src/lib/a.ts'}),
    agent('agent.tool.completed',{tool:'Write',agent:'session-b'},{file:'src/lib/a.ts'})]).filter(i=>i.type==='agent.collision').length,0);
});

test('Two providers on different files in one district emit one subsystem collision',()=>{
  const s=fresh();
  const collisions=run(s,[agent('agent.tool.completed',{tool:'Edit'},{file:'src/lib/a.ts'}),
    e('agent.tool.completed',{origin:'hook',file:'src/lib/b.ts',meta:{provider:'cursor',source:'generic',agent:'cursor-1',tool:'Edit'}})]).filter(i=>i.type==='agent.collision');
  assert.equal(collisions.length,1);
  assert.equal(collisions[0].detail.scope,'subsystem');
  assert.deepEqual(collisions[0].detail.providers,['claude-code','cursor']);
  assert(!/src\/|lib\/|a\.ts|b\.ts/.test(JSON.stringify(collisions)),'subsystem collision has no paths');
  assert.equal(run(s,[e('document.snapshot',{file:'src/lib/a.ts',content:'export function a(){return 1}',meta:{reason:'edit'}})]).filter(i=>i.type==='agent.collision').length,0);
});

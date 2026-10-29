'use strict';
// Several agents at once (public/worlds/agents.js): two Claude Code terminals, a Cursor chat and a Codex session on the
// same project are separate presences, and sessions of the same tool are told apart by number in public labels.
const test=require('node:test'),assert=require('node:assert/strict');
const T0=1750000000000;
const state=(ts,agentId,provider,detail={})=>({v:1,id:`a-${agentId}-${ts}`,type:'agent.state',ts,tier:0,magnitude:.2,evidence:'observed',
  subject:{agentId,voice:0},detail:{provider,state:'processing',...detail}});
const names=(agents,t)=>agents.list(t).map(p=>agents.name(p)).sort();
test('Sessions of the same tool at the same time are numbered; a lone session is just its name',async()=>{
  const {createAgents}=await import('../public/worlds/agents.js');const a=createAgents();
  a.record(state(T0,'c1','claude-code'));
  assert.deepEqual(names(a,T0+10),['Claude'],'one session: no number');
  a.record(state(T0+1000,'c2','claude-code'));a.record(state(T0+1500,'u1','cursor'));a.record(state(T0+2000,'x1','codex'));
  a.record(state(T0+2500,'c3','claude-code'));a.record(state(T0+3000,'u2','cursor'));
  assert.deepEqual(names(a,T0+3100),['Claude','Claude 2','Claude 3','Codex','Cursor','Cursor 2']);
  // A subagent is shown as its tool's subagent, never numbered, and takes no number from a session.
  a.record(state(T0+3500,'s1','claude-code',{subagent:true}));
  assert(names(a,T0+3600).includes('Claude · subagent'));
  // The first terminal closes; a session opened afterwards takes the lowest number free, so the names stay small.
  a.record(state(T0+4000,'c1','claude-code',{state:'disconnected'}));
  a.record(state(T0+12000,'c4','claude-code'));
  assert.deepEqual(names(a,T0+12100).filter(n=>n.startsWith('Claude')&&!n.includes('subagent')),['Claude','Claude 2','Claude 3']);
  assert.equal(a.name(a.presence('c4',T0+12100)),'Claude','the new session took the freed first place');
  // The same session keeps its name for as long as it is present.
  assert.equal(a.name(a.presence('c3',T0+12100)),'Claude 3');
});
test('Numbering is part of the fold: replaying the same intents gives the same names',async()=>{
  const {createAgents}=await import('../public/worlds/agents.js');
  const run=()=>{const a=createAgents();for(const [i,id] of ['c1','c2','u1','c3'].entries())a.record(state(T0+i*500,id,id.startsWith('u')?'cursor':'claude-code'));return names(a,T0+2000);};
  assert.deepEqual(run(),run());
  const a=createAgents();a.record(state(T0,'c1','claude-code'));a.record(state(T0+500,'c2','claude-code'));
  const snap=a.snapshot();const b=createAgents();b.restore(snap);
  assert.deepEqual(names(b,T0+600),['Claude','Claude 2'],'a snapshot keeps the numbers');
});

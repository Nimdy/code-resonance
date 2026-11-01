'use strict';
// Subagents and their parents (interpretation 11). Every adapter that observes subagents keys one as its session's key,
// a '/' and its own id, name, type or task, in the same session; the reducer names the parent (subject.parentAgentId,
// the public id of that session's agent) once it has observed that session, never a guess. The agents fold carries it
// (`parent`) and the pack view keeps it as an opaque token only. Worlds may draw the relation (Synaptic Storm's
// tether: tests/synaptic-subagents.test.js).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sha}=require('../receiver/protocol');
const {newState,apply,drainIntents}=require('../engine/reducer');
const claude=require('../scripts/hooks/claude-code'),codex=require('../scripts/hooks/codex'),qwen=require('../scripts/hooks/qwen');
const copilot=require('../scripts/hooks/copilot'),cursor=require('../scripts/hooks/cursor'),droid=require('../scripts/hooks/droid');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000;
function root(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-subagent-hook-'));fs.mkdirSync(path.join(dir,'.git'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function reduce(events){const s=newState(sha('subagents'));s.salt='subagent-salt';for(const e of events)apply(s,e);return {s,intents:drainIntents(s).filter(i=>i.type==='agent.state')};}
// Each adapter's documented payloads: a session, then one of its subagents (start, a tool call where the tool gives one, stop).
function sessions(dir){let now=T0;const at=()=>(now+=1000);
  return {
    'claude-code':()=>{const c={session_id:'sess-1',transcript_path:'/tmp/t.jsonl',cwd:dir};return [
      ...claude.translate({...c,hook_event_name:'SessionStart',source:'startup'},at()),
      ...claude.translate({...c,hook_event_name:'PreToolUse',tool_name:'Agent',tool_input:{description:'look around',prompt:'secret prompt'},tool_use_id:'tu-1'},at()),
      ...claude.translate({...c,hook_event_name:'SubagentStart',agent_id:'agent-9',agent_type:'Explore'},at()),
      ...claude.translate({...c,hook_event_name:'PreToolUse',agent_id:'agent-9',agent_type:'Explore',tool_name:'Read',tool_input:{file_path:path.join(dir,'src/a.ts')},tool_use_id:'tu-2'},at()),
      ...claude.translate({...c,hook_event_name:'SubagentStop',agent_id:'agent-9',agent_type:'Explore',last_assistant_message:'done'},at())];},
    codex:()=>{const c={session_id:'cx-1',cwd:dir};return [
      ...codex.translate({...c,hook_event_name:'SessionStart',source:'startup'},at()),
      ...codex.translate({...c,hook_event_name:'SubagentStart',agent_id:'agent-3',agent_type:'explorer'},at()),
      ...codex.translate({...c,hook_event_name:'SubagentStop',agent_id:'agent-3',agent_type:'explorer',last_assistant_message:'done'},at())];},
    qwen:()=>{const c={session_id:'q-1',transcript_path:'/tmp/q.json',cwd:dir};return [
      ...qwen.translate({...c,hook_event_name:'SessionStart',source:'startup'},at()),
      ...qwen.translate({...c,hook_event_name:'SubagentStart',agent_id:'a-7',agent_type:'Explorer'},at()),
      ...qwen.translate({...c,agent_id:'a-7',hook_event_name:'PostToolUse',tool_name:'read_file',tool_input:{file_path:'README.md'},tool_response:{}},at()),
      ...qwen.translate({...c,hook_event_name:'SubagentStop',agent_id:'a-7',agent_type:'Explorer',last_assistant_message:'done',stop_hook_active:false},at())];},
    copilot:()=>{const c={sessionId:'c-1',timestamp:T0,cwd:dir};return [
      ...copilot.translate({...c,source:'new'},at(),['sessionStart']),
      ...copilot.translate({...c,transcriptPath:'/tmp/t',agentName:'explore',agentDescription:'x'},at(),['subagentStart']),
      ...copilot.translate({...c,transcriptPath:'/tmp/t',agentId:'s-9',agentType:'explore',agentName:'explore',response:'done',stopReason:'end_turn'},at(),['subagentStop'])];},
    cursor:()=>{const c={conversation_id:'conv-123',generation_id:'gen-1',workspace_roots:[dir],cwd:dir};return [
      ...cursor.translate({...c,hook_event_name:'sessionStart',composer_mode:'agent'},at()),
      ...cursor.translate({...c,hook_event_name:'subagentStop',subagent_type:'explore',status:'completed',summary:'done'},at())];},
    droid:()=>{const c={session_id:'d-1',transcript_path:'/tmp/s.jsonl',cwd:dir,permission_mode:'off'};return [
      ...droid.translate({...c,hook_event_name:'SessionStart',source:'startup'},at()),
      ...droid.translate({...c,hook_event_name:'SubagentStop',task_name:'review',task_result:'done',task_error:null,stop_hook_active:false},at())];}};
}
test('Every adapter that observes subagents ties one to its session: its agent.state intents name the parent agent',t=>{
  const dir=root(t);
  for(const [provider,events] of Object.entries(sessions(dir))){
    const evs=events();assert(evs.some(e=>e.kind.startsWith('agent.subagent')),`${provider} reports a subagent`);
    const {s,intents}=reduce(evs);
    const agents=Object.values(s.agents);assert.equal(agents.length,2,`${provider}: the session and its subagent`);
    const parent=agents.find(a=>!a.parent),child=agents.find(a=>a.parent);
    assert(parent&&child,`${provider}: one parent, one subagent`);assert.equal(child.parent,parent.id,provider);
    const mine=intents.filter(i=>i.subject.agentId===child.id),theirs=intents.filter(i=>i.subject.agentId===parent.id);
    assert(mine.length>=1&&mine.every(i=>i.subject.parentAgentId===parent.id),`${provider}: every intent of the subagent names its parent`);
    assert(mine.some(i=>i.detail.subagent===true),`${provider}: a subagent intent`);
    assert(theirs.length>=1&&theirs.every(i=>i.subject.parentAgentId===undefined),`${provider}: the session names no parent`);
    assert.match(child.parent,/^[0-9a-f]{10}$/,'an opaque public id');
    // only intents carry it: the agent cues are as before
    assert(s.timeline.every(c=>!JSON.stringify(c.detail).includes(child.parent)||c.detail.agentId===child.parent),`${provider}: no cue names the parent`);
    // (intent ids embed event ids, which the pack view replaces; subjects and details carry public ids only)
    const said=JSON.stringify(intents.map(i=>({subject:i.subject,detail:i.detail})));
    for(const raw of ['sess-1','cx-1','q-1','c-1','conv-123','d-1','agent-9','agent-3','a-7','explore','review'])assert(!said.includes(raw),`${provider}: no raw id (${raw}) in an intent`);
  }
});
test('No parent without an observed session, across providers, or for a session reporting its own subagent event',t=>{
  const dir=root(t),c={session_id:'sess-1',transcript_path:'/tmp/t.jsonl',cwd:dir};
  // the subagent's session was never observed (hooks installed mid-session): no parent, so no tether
  const orphan=reduce([...claude.translate({...c,hook_event_name:'SubagentStart',agent_id:'agent-9',agent_type:'Explore'},T0+1000),
    ...claude.translate({...c,hook_event_name:'SubagentStop',agent_id:'agent-9',agent_type:'Explore'},T0+2000)]);
  assert(Object.values(orphan.s.agents).every(a=>!a.parent));assert(orphan.intents.every(i=>i.subject.parentAgentId===undefined));
  // the same session key under another provider is another agent: never a parent across providers
  const other=reduce([...claude.translate({...c,hook_event_name:'SessionStart',source:'startup'},T0+1000),
    ...cursor.translate({conversation_id:'sess-1',workspace_roots:[dir],cwd:dir,hook_event_name:'subagentStop',subagent_type:'explore',status:'completed'},T0+2000)]);
  assert(other.intents.every(i=>i.subject.parentAgentId===undefined),'no parent across providers');
  // a subagent's tool call that arrives before its start: named from the start on (its earlier intent stays as it was)
  const early=reduce([...claude.translate({...c,hook_event_name:'SessionStart',source:'startup'},T0+1000),
    ...claude.translate({...c,hook_event_name:'PreToolUse',agent_id:'agent-9',tool_name:'Read',tool_input:{file_path:path.join(dir,'a.ts')},tool_use_id:'x'},T0+2000),
    ...claude.translate({...c,hook_event_name:'SubagentStart',agent_id:'agent-9',agent_type:'Explore'},T0+3000),
    ...claude.translate({...c,hook_event_name:'PreToolUse',agent_id:'agent-9',tool_name:'Grep',tool_input:{pattern:'x'},tool_use_id:'y'},T0+4000)]);
  const sub=Object.values(early.s.agents).find(a=>a.parent),mine=early.intents.filter(i=>i.subject.agentId===sub.id);
  assert.deepEqual(mine.map(i=>!!i.subject.parentAgentId),[false,true,true]);
  // Codex's SubagentStart may come without an agent id: then it is the session's own event, with no parent
  const self=reduce([...codex.translate({session_id:'cx-1',cwd:dir,hook_event_name:'SessionStart',source:'startup'},T0+1000),
    ...codex.translate({session_id:'cx-1',cwd:dir,hook_event_name:'SubagentStart',agent_type:'explorer'},T0+2000)]);
  assert.equal(Object.keys(self.s.agents).length,1);assert(self.intents.every(i=>i.subject.parentAgentId===undefined));
});
test('The pack view keeps parentAgentId as an opaque token only; the agents fold carries it as `parent`',async()=>{
  const v=await import('../public/worlds/view.js');
  const keep=v.intent({id:'e:agent.state:0',type:'agent.state',ts:1,subject:{agentId:'a1b2c3d4e5',parentAgentId:'f6e5d4c3b2',voice:0},detail:{state:'processing',subagent:true,provider:'claude-code'}});
  assert.equal(keep.subject.parentAgentId,'f6e5d4c3b2');
  for(const bad of ['src/secret/keys.ts','/home/someone','a b',{id:'x'},'x'.repeat(65)])
    assert.equal(v.intent({id:'e:agent.state:1',type:'agent.state',ts:1,subject:{agentId:'a1b2c3d4e5',parentAgentId:bad}}).subject.parentAgentId,undefined,String(bad));
  const {createAgents}=await load('agents'),a=createAgents();
  const st=(ts,id,extra={},detail={})=>a.record({type:'agent.state',ts,subject:{agentId:id,voice:0,...extra},detail:{state:'processing',provider:'claude-code',...detail}});
  st(T0,'P');st(T0+100,'S',{parentAgentId:'P'},{subagent:true});st(T0+200,'Q',{parentAgentId:'Q'},{subagent:true});st(T0+300,'R',{},{subagent:true});
  const by=t=>Object.fromEntries(a.list(t).map(p=>[p.id,p.parent]));
  assert.deepEqual(by(T0+400),{P:null,S:'P',Q:null,R:null},'only a named parent, never itself');
  st(T0+500,'R',{parentAgentId:'P'});st(T0+600,'S',{parentAgentId:'Z'});
  assert.deepEqual(by(T0+700),{P:null,S:'P',Q:null,R:'P'},'named from the first intent that names it, then kept');
  const b=createAgents();b.restore(a.snapshot());assert.deepEqual(Object.fromEntries(b.list(T0+700).map(p=>[p.id,p.parent])),by(T0+700),'kept through a snapshot');
  assert.equal(a.name(a.presence('S',T0+700)),'Claude · subagent','names unchanged');
});

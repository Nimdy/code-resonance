'use strict';
// Canonical performance intents: what should visibly (and audibly) change, independent of any artistic world.
//
// The reducer emits intents next to the facts that justify them. Each intent carries:
//  - type: a stable vocabulary (below); worlds decide how to express it, never whether it happened;
//  - tier: 0 micro (texture), 1 routine, 2 structural, 3 milestone, 4 rare (spectacle-worthy);
//  - magnitude 0..1: significance within its tier, from evidence (structure validated, modules repaired, ...);
//  - evidence: 'observed' (a raw observation), 'derived' (a deterministic structural fact, e.g. an AST diff),
//    'inferred' (an interpretation with confidence < 1), 'verified' (an observed validation result: exit code 0
//    or non-zero). Nothing is 'verified' unless a command or task outcome was observed;
//  - subject: salted public ids only (fileId, groupId, targetId, targetGroupId, agentId, voice, fileIds).
// Intents are recorded with the timeline (performance.jsonl), so replay and films see exactly what live saw.
const INTENT_SCHEMA='code-resonance.intent.v1';
const TYPES=new Set([
  'module.created','module.removed','module.renamed','subsystem.created','subsystem.connected',
  'structure.created','structure.modified','structure.removed','structure.linked',
  'validation.failed','validation.passed','validation.recovered','refactor.validated','milestone.achieved',
  'repository.checkpoint','agent.state','world.expanded'
]);
const EVIDENCE=new Set(['observed','derived','inferred','verified']);
const round=x=>Math.round(Math.max(0,Math.min(1,x))*1000)/1000;
function makeIntent(event,type,{tier=0,magnitude=0,evidence='observed',subject={},detail={}},ordinal){
  if(!TYPES.has(type))throw new Error(`Unknown intent ${type}`);
  if(!EVIDENCE.has(evidence))throw new Error(`Unknown evidence ${evidence}`);
  return {v:1,id:`${event.id}:${type}:${ordinal}`,type,ts:event.ts,tier:Math.max(0,Math.min(4,tier|0)),magnitude:round(magnitude),evidence,subject,detail};
}
// Agent activity from the tool a provider reported: a category, never the tool's arguments.
const ACTIVITY={Read:'reading',NotebookRead:'reading',Grep:'searching',Glob:'searching',LS:'searching',
  Edit:'editing',Write:'editing',MultiEdit:'editing',NotebookEdit:'editing',WebFetch:'researching',WebSearch:'researching',
  Task:'delegating',Agent:'delegating',TodoWrite:'planning'};
const COMMAND_ACTIVITY={test:'testing',build:'building',typecheck:'checking',lint:'checking',install:'installing',git:'versioning',format:'formatting',run:'running'};
function activityOf(tool,category){
  if(tool==='Bash')return COMMAND_ACTIVITY[category]||'running';
  return ACTIVITY[tool]||'using a tool';
}
// Lifecycle of an observed agent. Only hook-reported events move it; time-based fading (unknown, dormant) is applied
// by the player from the time of the last observation, so a silent agent never appears to keep working.
const AGENT_STATES=['connected','processing','tool','thinking','waiting','completed','disconnected'];
function nextAgentState(kind,current){
  switch(kind){
    case 'agent.session.started':return current&&current!=='disconnected'?current:'connected';
    case 'agent.prompt.submitted':case 'agent.subagent.started':case 'agent.plan.visible':return 'processing';
    case 'agent.thinking.visible':return 'thinking';
    case 'agent.tool.started':return 'tool';
    case 'agent.tool.completed':return current==='tool'||current==='thinking'||!current?'processing':current;
    case 'agent.response.completed':return 'waiting';
    case 'agent.subagent.stopped':return 'completed';
    case 'agent.session.ended':return 'disconnected';
    default:return current||'connected';
  }
}
module.exports={INTENT_SCHEMA,TYPES,makeIntent,activityOf,nextAgentState,AGENT_STATES};

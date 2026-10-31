#!/usr/bin/env node
'use strict';
// GitHub Copilot hook adapter (https://docs.github.com/en/copilot/reference/hooks-reference): Copilot CLI and the
// Copilot harness of VS Code and the Copilot app share this format. The installer registers the camelCase events,
// whose payloads do not name their event, so each command passes it: `node "<this file>" postToolUse`.
// Observe-only: it never prints to stdout and always exits 0. preToolUse and permissionRequest are never installed
// (a crashed or non-zero preToolUse hook denies the tool call); on every installed event empty output decides nothing.
// The documented payloads name no file for create or edit and carry no shell exit code: Copilot is seen by its tools
// and their categories, failures from postToolUseFailure. Payloads that are not this shape become no events.
// toolArgs (a JSON string or an object) is read only for bash's documented `command`, to classify it; it never leaves.
const {isPlain,isStr,textMeta,promptExtra,scope,toolEvents,rootOf,run}=require('./shared');
const PROVIDER='copilot';
const KNOWN=new Set(['sessionStart','sessionEnd','userPromptSubmitted','postToolUse','postToolUseFailure','agentStop','subagentStart','subagentStop']);
// Tool names for hook matching (the reference's table), onto the player's vocabulary.
const TOOLS={bash:'Bash',powershell:'Bash',create:'Write',edit:'Edit',view:'Read',grep:'Grep',glob:'Glob',web_fetch:'WebFetch',task:'Task'};
function argsOf(raw){
  if(isPlain(raw))return raw;
  if(!isStr(raw))return {};
  try{const v=JSON.parse(raw);return isPlain(v)?v:{};}catch{return {};}
}
function matches(event,input){
  if(!isStr(input.sessionId))return false;
  if(event==='userPromptSubmitted')return isStr(input.prompt);
  if(event==='postToolUse'||event==='postToolUseFailure')return isStr(input.toolName);
  if(event==='subagentStart'||event==='subagentStop')return isStr(input.agentName);
  return true;
}
// Maps one documented Copilot hook payload (camelCase format) and the event the command named to zero or more events.
function translate(input,now=Date.now(),argv=[]){
  if(!isPlain(input))return [];
  const event=isStr(argv[0])?argv[0]:'';
  if(!KNOWN.has(event)||!matches(event,input))return [];
  const root=rootOf(input.cwd),session=input.sessionId;
  // subagentStart names the subagent only by agentName (no id), so both ends of a subagent use it; a subagent's tool calls
  // stay with the session (the start event cannot be tied to their agentId).
  const sub=event==='subagentStart'||event==='subagentStop';
  const agent=sub?`${session}/${input.agentName}`:session;
  const base=scope({provider:PROVIDER,prefix:'gh',event,session,agent,root,now});
  switch(event){
    case 'sessionStart':return [base('agent.session.started',{reason:String(input.source||'').slice(0,40)})];
    case 'sessionEnd':return [base('agent.session.ended',{reason:String(input.reason||'').slice(0,40)})];
    case 'userPromptSubmitted':return [base('agent.prompt.submitted',textMeta(input.prompt),promptExtra(input.prompt))];
    case 'postToolUse':case 'postToolUseFailure':{
      const as=TOOLS[input.toolName],failed=event==='postToolUseFailure';
      const command=input.toolName==='bash'?argsOf(input.toolArgs).command:undefined;
      // postToolUse fires after a tool completes successfully; for a shell that is not an exit code, so it stays unknown.
      return toolEvents(base,root,{as,name:input.toolName,command,result:failed?'failed':as==='Bash'?undefined:'succeeded'});
    }
    case 'subagentStart':return [base('agent.subagent.started',{tool:String(input.agentName).slice(0,40)})];
    case 'subagentStop':return [base('agent.subagent.stopped',{tool:String(input.agentName).slice(0,40),...textMeta(input.response)})];
    case 'agentStop':return [base('agent.response.completed')];
    default:return [];
  }
}
if(require.main===module)run(translate);
module.exports={translate};

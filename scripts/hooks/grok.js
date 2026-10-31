#!/usr/bin/env node
'use strict';
// Grok Build hook adapter (xAI's grok CLI; https://docs.x.ai/build/features/hooks). Observe-only: it never prints to
// stdout and always exits 0. PreToolUse is "the only blocking event" and is never installed; for every installed
// (passive) event Grok ignores stdout.
// The documented payload is camelCase: hookEventName, sessionId, cwd, workspaceRoot and, for tool events, toolName and
// toolInput. Grok's own tool names and toolInput fields are not documented, so tools are seen by name only (no file, no
// command category), and prompts and replies by their occurrence only. Subagent events carry no documented identity and
// are not installed. Payloads that are not this documented shape become no events; toolInput never leaves.
const {isPlain,isStr,scope,toolEvents,rootOf,run}=require('./shared');
const PROVIDER='grok';
const KNOWN=new Set(['SessionStart','SessionEnd','UserPromptSubmit','PostToolUse','PostToolUseFailure','Stop']);
function matches(event,input){
  if(!isStr(input.sessionId))return false;
  if(event==='PostToolUse'||event==='PostToolUseFailure')return isStr(input.toolName);
  return true;
}
// Maps one documented Grok Build hook payload to zero or more Code Resonance events. Unknown or ill-shaped stdin → [].
function translate(input,now=Date.now()){
  if(!isPlain(input))return [];
  const event=isStr(input.hookEventName)?input.hookEventName:'';
  if(!KNOWN.has(event)||!matches(event,input))return [];
  const root=rootOf(isStr(input.workspaceRoot)&&input.workspaceRoot?input.workspaceRoot:input.cwd);
  const base=scope({provider:PROVIDER,prefix:'gk',event,session:input.sessionId,root,now});
  switch(event){
    case 'SessionStart':return [base('agent.session.started')];
    case 'SessionEnd':return [base('agent.session.ended')];
    case 'UserPromptSubmit':return [base('agent.prompt.submitted')];
    case 'PostToolUse':case 'PostToolUseFailure':return toolEvents(base,root,{name:input.toolName,result:event==='PostToolUse'?'succeeded':'failed'});
    case 'Stop':return [base('agent.response.completed')];
    default:return [];
  }
}
if(require.main===module)run(translate);
module.exports={translate};

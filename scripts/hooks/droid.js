#!/usr/bin/env node
'use strict';
// Factory Droid hook adapter (https://docs.factory.com/reference/hooks-reference). Observe-only: it never prints to
// stdout and always exits 0; on exit 0 Droid only shows stdout (or adds it as context on SessionStart and
// UserPromptSubmit), so empty output decides nothing. PreToolUse is never installed.
// The reference documents tool_input for Create (file_path) and Execute (command) only: Edit and ApplyPatch are seen as
// edits without a file, and no tool_response field (no exit code) is read.
// Payloads that are not this documented shape become no events. File contents and command text never leave.
const {isPlain,isStr,textMeta,promptExtra,scope,toolEvents,rootOf,run}=require('./shared');
const PROVIDER='droid';
const KNOWN=new Set(['SessionStart','SessionEnd','UserPromptSubmit','PostToolUse','Stop','SubagentStop']);
const TOOLS={Create:{as:'Write',path:'file_path'},Edit:{as:'Edit'},ApplyPatch:{as:'apply_patch'},Read:{as:'Read'},Execute:{as:'Bash',command:'command'},
  LS:{as:'LS'},Glob:{as:'Glob'},Grep:{as:'Grep'},Task:{as:'Task'},FetchUrl:{as:'WebFetch'},WebSearch:{as:'WebSearch'}};
function matches(event,input){
  if(!isStr(input.session_id))return false;
  if(event==='UserPromptSubmit')return isStr(input.prompt);
  if(event==='PostToolUse')return isStr(input.tool_name)&&isPlain(input.tool_input);
  if(event==='SubagentStop')return isStr(input.task_name);
  return true;
}
// Maps one documented Droid hook payload to zero or more Code Resonance events. Unknown or ill-shaped stdin → [].
function translate(input,now=Date.now()){
  if(!isPlain(input))return [];
  const event=isStr(input.hook_event_name)?input.hook_event_name:'';
  if(!KNOWN.has(event)||!matches(event,input))return [];
  const root=rootOf(input.cwd),session=input.session_id;
  // SubagentStop names the sub-droid by its task only: two of the same task share a voice.
  const agent=event==='SubagentStop'?`${session}/${input.task_name}`:session;
  const base=scope({provider:PROVIDER,prefix:'fd',event,session,agent,root,now});
  switch(event){
    case 'SessionStart':return [base('agent.session.started',{reason:String(input.source||'').slice(0,40)})];
    case 'SessionEnd':return [base('agent.session.ended',{reason:String(input.reason||'').slice(0,40)})];
    case 'UserPromptSubmit':return [base('agent.prompt.submitted',textMeta(input.prompt),promptExtra(input.prompt))];
    case 'PostToolUse':{
      const spec=TOOLS[input.tool_name]||{},args=input.tool_input;
      return toolEvents(base,root,{as:spec.as,name:input.tool_name,file:spec.path?args[spec.path]:undefined,command:spec.command?args[spec.command]:undefined,
        result:spec.as==='Bash'?undefined:'succeeded'});
    }
    case 'SubagentStop':return [base('agent.subagent.stopped',{tool:String(input.task_name).slice(0,40)})];
    case 'Stop':return [base('agent.response.completed')];
    default:return [];
  }
}
if(require.main===module)run(translate);
module.exports={translate};

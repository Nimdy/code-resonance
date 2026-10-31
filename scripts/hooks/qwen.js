#!/usr/bin/env node
'use strict';
// Qwen Code hook adapter (https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/, tools:
// https://qwenlm.github.io/qwen-code-docs/en/developers/tools/file-system/ and …/tools/shell/). Qwen Code forked Gemini
// CLI, but its hooks follow Claude Code's event names and fields (PreToolUse, PostToolUse, …; tool ids write_file, edit,
// read_file, run_shell_command). Observe-only: it never prints to stdout and always exits 0. Qwen Code reads a JSON
// object on stdout for decisions, so empty output decides nothing; PreToolUse and PermissionRequest are not installed.
// The documented payload has no shell exit code: a command's result is known only from PostToolUseFailure.
// Payloads that are not this documented shape become no events. File contents, edit strings and command text never leave.
const {isPlain,isStr,isNum,textMeta,promptExtra,scope,toolEvents,rootOf,run}=require('./shared');
const PROVIDER='qwen';
const KNOWN=new Set(['SessionStart','SessionEnd','UserPromptSubmit','PostToolUse','PostToolUseFailure','Stop','SubagentStart','SubagentStop']);
const TOOLS={write_file:{as:'Write',path:'file_path'},edit:{as:'Edit',path:'file_path'},read_file:{as:'Read',path:'file_path'},
  run_shell_command:{as:'Bash',command:'command'}};
function matches(event,input){
  if(!isStr(input.session_id))return false;
  if(event==='UserPromptSubmit')return isStr(input.prompt)||isStr(input.submitted_prompt);
  if(event==='PostToolUse'||event==='PostToolUseFailure')return isStr(input.tool_name)&&isPlain(input.tool_input);
  if(event==='SubagentStart'||event==='SubagentStop')return isStr(input.agent_id)||isStr(input.agent_type);
  return true;
}
// Maps one documented Qwen Code hook payload to zero or more Code Resonance events. Unknown or ill-shaped stdin → [].
function translate(input,now=Date.now()){
  if(!isPlain(input))return [];
  const event=isStr(input.hook_event_name)?input.hook_event_name:'';
  if(!KNOWN.has(event)||!matches(event,input))return [];
  const root=rootOf(input.cwd),session=input.session_id;
  // agent_id is present only inside a subagent: each subagent is its own voice.
  const agent=isStr(input.agent_id)&&input.agent_id?`${session}/${input.agent_id}`:session;
  const base=scope({provider:PROVIDER,prefix:'qw',event,session,agent,root,salt:`${input.tool_use_id||''}:${input.agent_id||''}`,now});
  switch(event){
    case 'SessionStart':return [base('agent.session.started',{reason:String(input.source||'').slice(0,40)})];
    case 'SessionEnd':return [base('agent.session.ended',{reason:String(input.reason||'').slice(0,40)})];
    case 'UserPromptSubmit':{
      // The user's own text when Qwen Code captured it at submission; otherwise the documented legacy prompt.
      const text=isStr(input.submitted_prompt)?input.submitted_prompt:input.prompt;
      return [base('agent.prompt.submitted',textMeta(text),promptExtra(text))];
    }
    case 'PostToolUse':case 'PostToolUseFailure':{
      const spec=TOOLS[input.tool_name]||{},args=input.tool_input,failed=event==='PostToolUseFailure';
      const result=failed?(input.is_interrupt===true?'interrupted':'failed'):spec.as==='Bash'?undefined:'succeeded';
      return toolEvents(base,root,{as:spec.as,name:input.tool_name,file:spec.path?args[spec.path]:undefined,command:spec.command?args[spec.command]:undefined,
        result,durationMs:isNum(input.duration_ms)?input.duration_ms:undefined});
    }
    case 'SubagentStart':return [base('agent.subagent.started',{tool:String(input.agent_type||'').slice(0,40)})];
    case 'SubagentStop':return [base('agent.subagent.stopped',{tool:String(input.agent_type||'').slice(0,40),...textMeta(input.last_assistant_message)})];
    case 'Stop':return [base('agent.response.completed',textMeta(input.last_assistant_message))];
    default:return [];
  }
}
if(require.main===module)run(translate);
module.exports={translate};

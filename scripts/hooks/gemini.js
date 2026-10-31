#!/usr/bin/env node
'use strict';
// Gemini CLI hook adapter (https://geminicli.com/docs/hooks/reference/, tools: https://geminicli.com/docs/reference/tools/).
// Observe-only: it reads the documented hook JSON from stdin and forwards only what Code Resonance needs. It never
// prints to stdout and always exits 0. Gemini CLI parses stdout on exit 0 and documents that output which is not JSON
// "will default to Allow"; the installer registers only events where an absent decision changes nothing (SessionStart,
// SessionEnd, BeforeAgent, AfterAgent, AfterTool), never BeforeTool, BeforeModel or BeforeToolSelection.
// The hook payload documents no shell exit code: a command's result is known only when the tool reports an error.
// Payloads that are not this documented shape become no events. File contents, edit strings and command text never leave.
const {isPlain,isStr,textMeta,promptExtra,scope,toolEvents,rootOf,run}=require('./shared');
const PROVIDER='gemini';
const KNOWN=new Set(['SessionStart','SessionEnd','BeforeAgent','AfterAgent','AfterTool']);
// Built-in tool names and the argument that names the file or the command (the Tools reference).
const TOOLS={write_file:{as:'Write',path:'file_path'},replace:{as:'Edit',path:'file_path'},read_file:{as:'Read',path:'file_path'},
  run_shell_command:{as:'Bash',command:'command'}};
function matches(event,input){
  if(!isStr(input.session_id))return false;
  if(event==='BeforeAgent')return isStr(input.prompt);
  if(event==='AfterTool')return isStr(input.tool_name)&&isPlain(input.tool_input);
  return true;
}
// Maps one documented Gemini CLI hook payload to zero or more Code Resonance events. Unknown or ill-shaped stdin → [].
function translate(input,now=Date.now()){
  if(!isPlain(input))return [];
  const event=isStr(input.hook_event_name)?input.hook_event_name:'';
  if(!KNOWN.has(event)||!matches(event,input))return [];
  const root=rootOf(input.cwd);
  const base=scope({provider:PROVIDER,prefix:'gm',event,session:input.session_id,root,now});
  switch(event){
    case 'SessionStart':return [base('agent.session.started',{reason:String(input.source||'').slice(0,40)})];
    case 'SessionEnd':return [base('agent.session.ended',{reason:String(input.reason||'').slice(0,40)})];
    case 'BeforeAgent':return [base('agent.prompt.submitted',textMeta(input.prompt),promptExtra(input.prompt))];
    case 'AfterAgent':return [base('agent.response.completed',textMeta(input.prompt_response))];
    case 'AfterTool':{
      const spec=TOOLS[input.tool_name]||{},args=input.tool_input,response=isPlain(input.tool_response)?input.tool_response:{};
      // tool_response carries an optional `error`: a tool that reports one failed. Without it an edit succeeded; a shell
      // command's outcome stays unknown (its exit code is not in the documented payload).
      const failed=response.error!==undefined&&response.error!==null&&response.error!==false&&response.error!=='';
      const result=failed?'failed':spec.as==='Bash'?undefined:'succeeded';
      return toolEvents(base,root,{as:spec.as,name:input.tool_name,file:spec.path?args[spec.path]:undefined,command:spec.command?args[spec.command]:undefined,result});
    }
    default:return [];
  }
}
if(require.main===module)run(translate);
module.exports={translate};

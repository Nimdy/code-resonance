#!/usr/bin/env node
'use strict';
// goose hook adapter (https://goose-docs.ai/docs/guides/context-engineering/hooks/; goose follows the Open Plugins hooks
// specification). Installed as a hook-only project plugin. Observe-only: it never prints to stdout and always exits 0
// ("exit 0 with empty stdout allows"); only PreToolUse and Stop can block, and PreToolUse is never installed.
// Documented payload: event, session_id, and on tool events tool_name, tool_input and working_dir; tool_input keys are
// documented for shell (command), write and edit (path). No exit code is documented: a shell command is known to have
// failed only from PostToolUseFailure. Payloads that are not this shape become no events. Contents never leave.
const path=require('node:path');
const {isPlain,isStr,textMeta,promptExtra,scope,toolEvents,rootOf,run}=require('./shared');
const PROVIDER='goose';
const KNOWN=new Set(['SessionStart','SessionEnd','UserPromptSubmit','PostToolUse','PostToolUseFailure','Stop']);
const TOOLS={shell:{as:'Bash',command:'command'},write:{as:'Write',path:'path'},edit:{as:'Edit',path:'path'}};
function matches(event,input){
  if(!isStr(input.session_id))return false;
  if(event==='UserPromptSubmit')return isStr(input.message);
  if(event==='PostToolUse'||event==='PostToolUseFailure')return isStr(input.tool_name)&&isPlain(input.tool_input);
  return true;
}
// Session events carry no directory: the plugin's own folder (<project>/.agents/plugins/<name>, PLUGIN_ROOT) names the
// project it was installed in.
function projectStart(input){
  if(isStr(input.working_dir)&&input.working_dir)return input.working_dir;
  const plugin=process.env.PLUGIN_ROOT;
  if(isStr(plugin)&&plugin){const up=path.resolve(plugin,'..','..');if(path.basename(up)==='.agents')return path.dirname(up);return plugin;}
  return undefined;
}
// Maps one documented goose hook payload to zero or more Code Resonance events. Unknown or ill-shaped stdin → [].
function translate(input,now=Date.now()){
  if(!isPlain(input))return [];
  const event=isStr(input.event)?input.event:'';
  if(!KNOWN.has(event)||!matches(event,input))return [];
  const root=rootOf(projectStart(input));
  const base=scope({provider:PROVIDER,prefix:'gs',event,session:input.session_id,root,salt:String(input.tool_call_id||''),now});
  switch(event){
    case 'SessionStart':return [base('agent.session.started')];
    case 'SessionEnd':return [base('agent.session.ended')];
    case 'UserPromptSubmit':return [base('agent.prompt.submitted',textMeta(input.message),promptExtra(input.message))];
    case 'PostToolUse':case 'PostToolUseFailure':{
      const spec=TOOLS[input.tool_name]||{},args=input.tool_input,failed=event==='PostToolUseFailure';
      return toolEvents(base,root,{as:spec.as,name:input.tool_name,file:spec.path?args[spec.path]:undefined,command:spec.command?args[spec.command]:undefined,
        result:failed?'failed':spec.as==='Bash'?undefined:'succeeded'});
    }
    case 'Stop':return [base('agent.response.completed',textMeta(input.last_assistant_message))];
    default:return [];
  }
}
if(require.main===module)run(translate);
module.exports={translate};

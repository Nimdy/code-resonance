#!/usr/bin/env node
'use strict';
// Claude Code hook adapter (https://code.claude.com/docs/en/hooks). Configure it as a `command` hook; it reads the
// documented hook JSON from stdin and forwards only what Code Resonance needs:
//  - prompts and assistant messages: length + fingerprint only (text only with RESONANCE_CAPTURE_PROMPT_TEXT=1);
//  - tool use: tool name, project-relative file path, and for Bash a command *category* and exit code;
//  - subagents: their own agent id, so each subagent is a distinct, attributable voice.
// It never prints to stdout and always exits 0, so it cannot block or alter Claude's behaviour.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {projectIdForRoot,findProjectRoot}=require('../../sdk/project-id');
const {isFileEligible,classifyCommand}=require('../../extension/filters');
const DATA=process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance');
const PROVIDER='claude-code';
const FILE_TOOLS=new Set(['Edit','Write','MultiEdit','NotebookEdit']);
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
function relativeFile(root,file){
  if(typeof file!=='string'||!file)return undefined;
  const rel=path.relative(root,path.resolve(root,file)).replace(/\\/g,'/');
  return isFileEligible(rel,{includeHidden:true})?rel:undefined;
}
function textMeta(text){return typeof text==='string'&&text?{length:text.length,fingerprint:sha(text).slice(0,20)}:{};}
// Maps one documented hook payload to zero or more Code Resonance events.
function translate(input,now=Date.now()){
  const root=findProjectRoot(input.cwd||process.cwd());
  const projectId=projectIdForRoot(root);
  const agent=input.agent_id?`${input.session_id}/${input.agent_id}`:String(input.session_id||'unknown');
  const base=(kind,meta={},extra={})=>({v:1,id:`cc-${sha(`${input.session_id}:${input.hook_event_name}:${input.tool_use_id||''}:${input.agent_id||''}:${kind}:${now}:${crypto.randomUUID()}`).slice(0,32)}`,ts:now,kind,projectId,
    sessionId:`claude-code-${String(input.session_id||'unknown').slice(0,60)}`,origin:'hook',
    meta:{provider:PROVIDER,source:'claude-code-hook',agent:agent.slice(0,120),...meta},...extra});
  const tool=typeof input.tool_name==='string'?input.tool_name.slice(0,40):'';
  const toolInput=input.tool_input&&typeof input.tool_input==='object'?input.tool_input:{};
  const file=FILE_TOOLS.has(tool)?relativeFile(root,toolInput.file_path||toolInput.notebook_path):undefined;
  const category=tool==='Bash'?classifyCommand(toolInput.command):undefined;
  const toolMeta={tool,...(category?{category}:{})};
  const withFile=file?{file}:{};
  const capture=process.env.RESONANCE_CAPTURE_PROMPT_TEXT==='1';
  switch(input.hook_event_name){
    case 'SessionStart':return [base('agent.session.started',{reason:String(input.source||'')})];
    case 'SessionEnd':return [base('agent.session.ended',{reason:String(input.reason||'')})];
    case 'UserPromptSubmit':return [base('agent.prompt.submitted',textMeta(input.prompt),capture&&input.prompt?{text:String(input.prompt)}:{})];
    case 'PreToolUse':return [base('agent.tool.started',toolMeta,withFile)];
    case 'PostToolUse':{
      const out=[base('agent.tool.completed',{...toolMeta,result:'succeeded',...(tool==='Bash'?{exitCode:0}:{})},withFile)];
      if(file)out.push(base('agent.file.modified',{tool},withFile));
      return out;
    }
    case 'PostToolUseFailure':{
      const exit=/^Exit code (\d+)/.exec(String(input.error||''));
      return [base('agent.tool.completed',{...toolMeta,result:input.is_interrupt?'interrupted':'failed',...(exit?{exitCode:Number(exit[1])}:{})},withFile)];
    }
    case 'SubagentStart':return [base('agent.subagent.started',{tool:String(input.agent_type||'').slice(0,40)})];
    case 'SubagentStop':return [base('agent.subagent.stopped',{tool:String(input.agent_type||'').slice(0,40),...textMeta(input.last_assistant_message)})];
    case 'Stop':return [base('agent.response.completed',textMeta(input.last_assistant_message))];
    default:return [];
  }
}
function post(port,token,events,timeout=1500){
  return new Promise((resolve,reject)=>{
    const body=Buffer.from(JSON.stringify({events}));
    const req=http.request({hostname:'127.0.0.1',port,method:'POST',path:'/v1/events',timeout,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':body.length}},res=>{
      res.resume();res.on('end',()=>res.statusCode===202||res.statusCode===422?resolve(res.statusCode):reject(new Error(`HTTP ${res.statusCode}`)));
    });
    req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',reject);req.end(body);
  });
}
// Undeliverable events wait in a small spool and are retried by the next hook invocation.
async function deliver(events){
  const spool=path.join(DATA,'spool');
  let auth;try{auth=JSON.parse(fs.readFileSync(path.join(DATA,'receiver-auth.json'),'utf8'));}catch{auth=null;}
  const pending=[];
  try{for(const name of fs.readdirSync(spool).filter(n=>n.endsWith('.json')).sort().slice(0,20))pending.push({name,events:JSON.parse(fs.readFileSync(path.join(spool,name),'utf8'))});}catch{}
  const port=Number(process.env.RESONANCE_PORT||auth?.port||4174);
  for(const item of pending){
    try{if(!auth)throw Error('no receiver');await post(port,auth.token,item.events);fs.rmSync(path.join(spool,item.name),{force:true});}catch{break;}
  }
  if(!events.length)return;
  try{if(!auth)throw Error('no receiver');await post(port,auth.token,events);}
  catch{
    fs.mkdirSync(spool,{recursive:true,mode:0o700});
    const names=fs.readdirSync(spool).filter(n=>n.endsWith('.json'));
    if(names.length<2000)fs.writeFileSync(path.join(spool,`${String(Date.now()).padStart(14,'0')}-${crypto.randomBytes(4).toString('hex')}.json`),JSON.stringify(events),{mode:0o600});
  }
}
async function main(){
  let raw='';for await(const chunk of process.stdin)raw+=chunk;
  let input;try{input=JSON.parse(raw);}catch{return;}
  await deliver(translate(input));
}
if(require.main===module)main().catch(()=>{}).finally(()=>{process.exitCode=0;});
module.exports={translate};

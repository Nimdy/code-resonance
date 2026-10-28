#!/usr/bin/env node
'use strict';
// Codex hook adapter (https://developers.openai.com/codex/hooks). Observe-only: it reads documented hook JSON from
// stdin and forwards only what Code Resonance needs. It never prints to stdout and always exits 0, so it cannot deny,
// block or alter Codex. PreToolUse / PermissionRequest are not installed (empty stdout can deny on those events).
// Payloads that are not this harness's documented shape become no events. Patch hunks and command text never leave.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {projectIdForRoot,findProjectRoot}=require('../../sdk/project-id');
const {isFileEligible,classifyCommand}=require('../../extension/filters');
const DATA=process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance');
const PROVIDER='codex';
const KNOWN=new Set(['SessionStart','SessionEnd','UserPromptSubmit','PostToolUse','Stop','SubagentStart','SubagentStop']);
const PATCH_TOOLS=new Set(['apply_patch','Edit','Write']);
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isStr=v=>typeof v==='string';
function relativeFile(root,file){
  if(!isStr(file)||!file)return undefined;
  const rel=path.relative(root,path.resolve(root,file)).replace(/\\/g,'/');
  return isFileEligible(rel,{includeHidden:true})?rel:undefined;
}
// Paths only: unified-diff a/ b/ headers, Codex *** File headers, path lists. Never hunk bodies or +/- lines.
function patchPaths(text,root){
  if(!isStr(text)||!text)return [];
  const files=[];
  const add=raw=>{
    const p=String(raw||'').trim().replace(/^["']|["']$/g,'');
    if(!p||p==='/dev/null')return;
    const file=relativeFile(root,p);
    if(file&&!files.includes(file))files.push(file);
  };
  for(const line of text.split(/\r?\n/)){
    const star=/^\*\*\* (?:Add File|Delete File|Update File|Move to): (.+)$/.exec(line);
    if(star){add(star[1]);continue;}
    const git=/^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if(git){add(git[1]);add(git[2]);continue;}
    const uni=/^(?:---|\+\+\+) [ab]\/(.+)$/.exec(line);
    if(uni)add(uni[1]);
  }
  return files.slice(0,40);
}
function patchText(toolInput,raw){
  // Empty raw is the documented object shape; the patch lives on command (never treat '' as the patch).
  if(isStr(raw)&&raw)return raw;
  if(isStr(toolInput)&&toolInput)return toolInput;
  if(!isPlain(toolInput))return '';
  for(const k of ['command','input','patch'])if(isStr(toolInput[k])&&toolInput[k])return toolInput[k];
  return '';
}
function listedPaths(toolInput,root){
  if(!isPlain(toolInput))return [];
  const files=[];
  const add=p=>{const file=relativeFile(root,p);if(file&&!files.includes(file))files.push(file);};
  if(isStr(toolInput.file_path))add(toolInput.file_path);
  if(isStr(toolInput.path))add(toolInput.path);
  if(Array.isArray(toolInput.paths))for(const p of toolInput.paths)if(isStr(p))add(p);
  return files;
}
function exitCodeOf(response){
  if(typeof response==='number'&&Number.isFinite(response))return response;
  if(!isPlain(response))return undefined;
  for(const k of ['exit_code','exitCode'])if(typeof response[k]==='number'&&Number.isFinite(response[k]))return response[k];
  const meta=response.metadata;
  if(isPlain(meta))for(const k of ['exit_code','exitCode'])if(typeof meta[k]==='number'&&Number.isFinite(meta[k]))return meta[k];
  return undefined;
}
function textMeta(text){return isStr(text)&&text?{length:text.length,fingerprint:sha(text).slice(0,20)}:{};}
function matches(event,input){
  if(event==='UserPromptSubmit')return isStr(input.prompt);
  if(event==='PostToolUse')return isStr(input.tool_name);
  if(event==='SubagentStart'||event==='SubagentStop')return isStr(input.agent_id)||isStr(input.agent_type)||isStr(input.session_id);
  if(event==='SessionStart'||event==='SessionEnd'||event==='Stop')return isStr(input.session_id)||isStr(input.cwd);
  return false;
}
// Maps one documented Codex hook payload to zero or more Code Resonance events. Unknown or ill-shaped stdin → [].
function translate(input,now=Date.now()){
  if(!isPlain(input))return [];
  const event=isStr(input.hook_event_name)?input.hook_event_name:'';
  if(!KNOWN.has(event)||!matches(event,input))return [];
  const root=findProjectRoot(input.cwd||process.cwd());
  const projectId=projectIdForRoot(root);
  const session=String(input.session_id||'unknown');
  const agent=input.agent_id?`${session}/${input.agent_id}`:session;
  const base=(kind,meta={},extra={})=>({v:1,id:`cx-${sha(`${session}:${event}:${input.tool_use_id||''}:${input.agent_id||''}:${kind}:${now}:${crypto.randomUUID()}`).slice(0,32)}`,ts:now,kind,projectId,
    sessionId:`codex-${session.slice(0,60)}`,origin:'hook',
    meta:{provider:PROVIDER,source:'codex-hook',agent:agent.slice(0,120),...meta},...extra});
  const capture=process.env.RESONANCE_CAPTURE_PROMPT_TEXT==='1';
  switch(event){
    case 'SessionStart':return [base('agent.session.started',{reason:String(input.source||'')})];
    case 'SessionEnd':return [base('agent.session.ended',{reason:String(input.reason||'')})];
    case 'UserPromptSubmit':return [base('agent.prompt.submitted',textMeta(input.prompt),capture&&input.prompt?{text:String(input.prompt)}:{})];
    case 'PostToolUse':{
      const toolName=input.tool_name.slice(0,40);
      const toolInput=isPlain(input.tool_input)?input.tool_input:{};
      if(toolName==='Bash'){
        const category=classifyCommand(isStr(toolInput.command)?toolInput.command:isStr(input.tool_input)?input.tool_input:'');
        const exitCode=exitCodeOf(input.tool_response);
        const result=typeof exitCode==='number'?(exitCode===0?'succeeded':'failed'):'succeeded';
        return [base('agent.tool.completed',{tool:'Bash',category,result,...(typeof exitCode==='number'?{exitCode}:{})})];
      }
      if(PATCH_TOOLS.has(toolName)){
        const files=[...listedPaths(toolInput,root)];
        for(const p of patchPaths(patchText(toolInput,isStr(input.tool_input)?input.tool_input:''),root))if(!files.includes(p))files.push(p);
        const out=[base('agent.tool.completed',{tool:'apply_patch',result:'succeeded'},files[0]?{file:files[0]}:{})];
        for(const file of files)out.push(base('agent.file.modified',{tool:'apply_patch'},{file}));
        return out;
      }
      return [base('agent.tool.completed',{tool:toolName,result:'succeeded'})];
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

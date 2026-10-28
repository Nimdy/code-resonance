#!/usr/bin/env node
'use strict';
// Cursor hook adapter (https://cursor.com/docs/agent/hooks). Observe-only after-hooks: it reads documented hook JSON
// from stdin and forwards only what Code Resonance needs. It never prints to stdout and always exits 0, so it cannot
// block or alter Cursor. Payloads that are not this harness's documented shape (K14) become no events.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {projectIdForRoot,findProjectRoot}=require('../../sdk/project-id');
const {isFileEligible,classifyCommand}=require('../../extension/filters');
const DATA=process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance');
const PROVIDER='cursor';
const KNOWN=new Set(['afterFileEdit','afterShellExecution','stop','subagentStart','subagentStop','sessionStart','sessionEnd']);
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isStr=v=>typeof v==='string';
const isNum=v=>typeof v==='number'&&Number.isFinite(v);
function relativeFile(root,file){
  if(!isStr(file)||!file)return undefined;
  const rel=path.relative(root,path.resolve(root,file)).replace(/\\/g,'/');
  return isFileEligible(rel,{includeHidden:true})?rel:undefined;
}
function matches(event,input){
  if(event==='afterFileEdit')return isStr(input.file_path)&&Array.isArray(input.edits);
  if(event==='afterShellExecution')return isStr(input.command)&&(input.output===undefined||isStr(input.output))&&(input.duration===undefined||(isNum(input.duration)&&input.duration>=0));
  if(event==='stop')return true;
  if(event==='subagentStart')return isStr(input.subagent_id)&&isStr(input.subagent_type);
  if(event==='subagentStop')return isStr(input.subagent_type);
  if(event==='sessionStart'||event==='sessionEnd')return isStr(input.session_id)||isStr(input.conversation_id);
  return false;
}
function sessionOf(input){return String(input.session_id||input.conversation_id||'unknown');}
function agentOf(input,event){
  const session=sessionOf(input);
  if(event==='subagentStart')return `${session}/${input.subagent_id}`;
  if(event==='subagentStop')return `${session}/${input.subagent_id||input.subagent_type}`;
  return session;
}
function rootOf(input){
  const start=input.cwd||(Array.isArray(input.workspace_roots)&&input.workspace_roots[0])||(isStr(input.file_path)&&input.file_path)||process.cwd();
  return findProjectRoot(start);
}
// Maps one documented Cursor hook payload to zero or more Code Resonance events. Unknown or ill-shaped stdin → [].
function translate(input,now=Date.now()){
  if(!isPlain(input))return [];
  const event=isStr(input.hook_event_name)?input.hook_event_name:'';
  if(!KNOWN.has(event)||!matches(event,input))return [];
  const root=rootOf(input),projectId=projectIdForRoot(root),session=sessionOf(input),agent=agentOf(input,event);
  const base=(kind,meta={},extra={},ts=now)=>({v:1,id:`cu-${sha(`${session}:${event}:${input.subagent_id||''}:${kind}:${ts}:${crypto.randomUUID()}`).slice(0,32)}`,ts,kind,projectId,
    sessionId:`cursor-${session.slice(0,60)}`,origin:'hook',
    meta:{provider:PROVIDER,source:'cursor-hook',agent:agent.slice(0,120),...meta},...extra});
  switch(event){
    case 'afterFileEdit':{
      const file=relativeFile(root,input.file_path);
      const out=[base('agent.tool.completed',{tool:'Edit',result:'succeeded'},file?{file}:{})];
      if(file)out.push(base('agent.file.modified',{tool:'Edit'},{file}));
      return out;
    }
    case 'afterShellExecution':{
      const toolMeta={tool:'Bash',category:classifyCommand(input.command)};
      const out=[];
      if(isNum(input.duration)){const startTs=now-input.duration;if(startTs>=0)out.push(base('agent.tool.started',toolMeta,{},startTs));}
      out.push(base('agent.tool.completed',{...toolMeta,result:'succeeded'}));
      return out;
    }
    case 'stop':return [base('agent.response.completed')];
    case 'subagentStart':return [base('agent.subagent.started',{tool:String(input.subagent_type).slice(0,40)})];
    case 'subagentStop':return [base('agent.subagent.stopped',{tool:String(input.subagent_type).slice(0,40)})];
    case 'sessionStart':return [base('agent.session.started',{reason:String(input.composer_mode||input.source||'')})];
    case 'sessionEnd':return [base('agent.session.ended',{reason:String(input.reason||'')})];
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

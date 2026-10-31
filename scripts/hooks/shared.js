'use strict';
// What the observe-only hook adapters added after Claude Code, Cursor and Codex share (gemini.js, qwen.js, copilot.js,
// droid.js, grok.js, goose.js): the same privacy rules, event shape, token proof and spool as those three, in one place.
//  - files: project-relative paths that pass the extension's filters, never contents;
//  - commands: a category (classifyCommand), never the command line; exit codes only when a payload documents them;
//  - prompts and replies: length and fingerprint only (text only with RESONANCE_CAPTURE_PROMPT_TEXT=1);
//  - never a byte on stdout, always exit 0: nothing an adapter does can allow, deny, block or alter the agent.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {projectIdForRoot,findProjectRoot}=require('../../sdk/project-id');
const {isFileEligible,classifyCommand}=require('../../extension/filters');
const {verifyServer}=require('../../receiver/proof');
const DATA=process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isStr=v=>typeof v==='string';
const isNum=v=>typeof v==='number'&&Number.isFinite(v);
// The tool vocabulary the reducer reads (engine/intents.js ACTIVITY, READ_ONLY_TOOLS): each adapter maps the tool names
// its agent documents onto it. Edit and Write modify the file they name; Read only looks at it.
const MODIFY=new Set(['Edit','Write']);
const NAMED=new Set(['Edit','Write','Read']);
function relativeFile(root,file){
  if(!isStr(file)||!file)return undefined;
  const rel=path.relative(root,path.resolve(root,file)).replace(/\\/g,'/');
  return isFileEligible(rel,{includeHidden:true})?rel:undefined;
}
function textMeta(text){return isStr(text)&&text?{length:text.length,fingerprint:sha(text).slice(0,20)}:{};}
const capture=()=>process.env.RESONANCE_CAPTURE_PROMPT_TEXT==='1';
// The prompt as an event: its length and fingerprint, its text only when the person opted in.
const promptExtra=text=>capture()&&isStr(text)&&text?{text}:{};
// One payload's event factory: every event of an invocation shares its project, session, agent and provenance.
function scope({provider,prefix,event,session,agent,root,salt='',now}){
  const projectId=projectIdForRoot(root),sid=String(session||'unknown'),who=String(agent||sid);
  const base=(kind,meta={},extra={},ts=now)=>({v:1,id:`${prefix}-${sha(`${sid}:${event}:${salt}:${kind}:${ts}:${crypto.randomUUID()}`).slice(0,32)}`,ts,kind,projectId,
    sessionId:`${provider}-${sid.slice(0,60)}`,origin:'hook',meta:{provider,source:`${provider}-hook`,agent:who.slice(0,120),...meta},...extra});
  base.now=now;return base;
}
// A finished tool call. `as` is the vocabulary name (Edit, Write, Read, Bash, ...) when the agent's documentation says
// what the tool is; `file` and `command` only when the documented payload carries them. A failed edit names no file:
// nothing was modified.
function toolEvents(base,root,{as,name,file,command,result,exitCode,durationMs}){
  const tool=as||String(name||'tool').slice(0,40);
  const meta={tool,...(tool==='Bash'?{category:classifyCommand(isStr(command)?command:'')}:{})};
  if(isNum(exitCode))Object.assign(meta,{exitCode,result:exitCode===0?'succeeded':'failed'});else if(result)meta.result=result;
  const rel=NAMED.has(tool)&&meta.result!=='failed'&&meta.result!=='interrupted'?relativeFile(root,file):undefined;
  const out=[];
  // A documented duration places the call's start, as the Cursor adapter does for shell commands.
  if(isNum(durationMs)&&durationMs>=0&&base.now-durationMs>=0)out.push(base('agent.tool.started',meta,{},base.now-durationMs));
  out.push(base('agent.tool.completed',meta,rel?{file:rel}:{}));
  if(rel&&MODIFY.has(tool))out.push(base('agent.file.modified',{tool},{file:rel}));
  return out;
}
const rootOf=start=>findProjectRoot(isStr(start)&&start?start:process.cwd());
function post(port,token,events,timeout=1500){
  return new Promise((resolve,reject)=>{
    const body=Buffer.from(JSON.stringify({events}));
    const req=http.request({hostname:'127.0.0.1',port,method:'POST',path:'/v1/events',timeout,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':body.length}},res=>{
      res.resume();res.on('end',()=>res.statusCode===202||res.statusCode===422?resolve(res.statusCode):reject(new Error(`HTTP ${res.statusCode}`)));
    });
    req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',reject);req.end(body);
  });
}
// Undeliverable events wait in a small spool and are retried by the next hook invocation (any adapter's).
async function deliver(events){
  const spool=path.join(DATA,'spool');
  let auth;try{auth=JSON.parse(fs.readFileSync(path.join(DATA,'receiver-auth.json'),'utf8'));}catch{auth=null;}
  const pending=[];
  try{for(const name of fs.readdirSync(spool).filter(n=>n.endsWith('.json')).sort().slice(0,20))pending.push({name,events:JSON.parse(fs.readFileSync(path.join(spool,name),'utf8'))});}catch{}
  const port=Number(process.env.RESONANCE_PORT||auth?.port||4174);
  // The token goes only to an occupant that proves it holds it (one loopback GET); otherwise events spool as when the
  // receiver is down.
  const proven=!!auth&&(pending.length>0||events.length>0)&&await verifyServer(port,auth.token,1500).then(()=>true,()=>false);
  for(const item of pending){
    try{if(!proven)throw Error('no receiver');await post(port,auth.token,item.events);fs.rmSync(path.join(spool,item.name),{force:true});}catch{break;}
  }
  if(!events.length)return;
  try{if(!proven)throw Error('no receiver');await post(port,auth.token,events);}
  catch{
    fs.mkdirSync(spool,{recursive:true,mode:0o700});
    const names=fs.readdirSync(spool).filter(n=>n.endsWith('.json'));
    if(names.length<2000)fs.writeFileSync(path.join(spool,`${String(Date.now()).padStart(14,'0')}-${crypto.randomBytes(4).toString('hex')}.json`),JSON.stringify(events),{mode:0o600});
  }
}
// An adapter's entry point: documented JSON on stdin (and, where the agent's payload does not name its event, the event
// name the installer put in the command line), translated, delivered; nothing on stdout, exit code 0 whatever happens.
function run(translate){
  (async()=>{
    let raw='';for await(const chunk of process.stdin)raw+=chunk;
    let input;try{input=JSON.parse(raw);}catch{return;}
    await deliver(translate(input,Date.now(),process.argv.slice(2)));
  })().catch(()=>{}).finally(()=>{process.exitCode=0;});
}
module.exports={sha,isPlain,isStr,isNum,relativeFile,textMeta,promptExtra,scope,toolEvents,rootOf,deliver,run};

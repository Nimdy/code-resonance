#!/usr/bin/env node
'use strict';
// Opt-in agent hook/CLI gateway. Can be called from an AI coding agent's documented lifecycle hooks.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {VALID_KINDS,sha}=require('../receiver/protocol');
function arg(k){const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];}
function request(port,token,events){
  return new Promise((resolve,reject)=>{
    const body=Buffer.from(JSON.stringify({events}));
    const req=http.request({hostname:'127.0.0.1',port,method:'POST',path:'/v1/events',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':body.length}},res=>{
      let text='';res.on('data',x=>text+=x);res.on('end',()=>res.statusCode===202?resolve(text):reject(Error(`HTTP ${res.statusCode}: ${text}`)));
    });req.on('error',reject);req.end(body);
  });
}
async function main(){
  const kind=arg('--kind');
  if(!VALID_KINDS.has(kind)){console.error('Use --kind with a supported kind (agent.prompt.submitted, agent.thinking.visible, agent.tool.started, etc.)');process.exitCode=2;return;}
  const dir=arg('--data')||path.join(os.homedir(),'.code-resonance');
  const auth=JSON.parse(fs.readFileSync(path.join(dir,'receiver-auth.json'),'utf8'));
  const root=path.resolve(arg('--root')||process.cwd());
  // file URI equivalent of a local POSIX VS Code workspace URI; override for other URI schemes.
  const rootUri=process.platform==='win32'?'file:///'+root.replace(/\\/g,'/').replace(/^[A-Z]:/,x=>x.toLowerCase()):'file://'+root;
  const projectId=arg('--project-id')||process.env.RESONANCE_PROJECT_ID||sha(rootUri);
  const explicitText=arg('--text');
  const bodyText=process.argv.includes('--stdin')?fs.readFileSync(0,'utf8').slice(0,12000):explicitText;
  const event={v:1,id:crypto.randomUUID(),ts:Date.now(),kind,projectId,
    sessionId:process.env.RESONANCE_SESSION_ID||'cli-'+new Date().toISOString().slice(0,10),origin:'hook',
    meta:{provider:arg('--provider')||'external-agent',source:'explicit-hook',tool:arg('--tool')||'',
      ...(bodyText?{length:bodyText.length,fingerprint:sha(bodyText).slice(0,20)}:{})},
    ...(process.argv.includes('--include-text')&&bodyText?{text:bodyText}: {})};
  const result=await request(Number(arg('--port')||auth.port||4174),auth.token,[event]);
  console.log(`CODE RESONANCE event recorded: ${kind} (${JSON.parse(result).accepted})`);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

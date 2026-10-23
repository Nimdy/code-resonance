#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {sha}=require('../receiver/protocol');
const projectId=sha('CODE RESONANCE — FICTIONAL DEMO');
const authPath=path.join(process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'),'receiver-auth.json');
const auth=JSON.parse(fs.readFileSync(authPath,'utf8'));
const port=Number(process.env.RESONANCE_PORT||auth.port||4174);
const now=Date.now()-7*60*1000,sessionId=`demo-${Date.now()}`;
const events=[];let idx=0;
function add(kind,fields={},offsetSeconds){events.push({v:1,id:crypto.randomUUID(),ts:now+((offsetSeconds??idx*13)*1000),projectId,sessionId,kind,origin:'demo',...fields});idx++;}
add('workspace.started');
add('project.baseline',{meta:{count:1,truncated:false}});
add('document.snapshot',{file:'src/index.ts',content:'export const hello = (name: string) => `Hello ${name}`;\n',meta:{reason:'baseline'}});
add('document.change',{file:'src/index.ts',changes:[{start:0,end:0,text:'\n',insertedLines:1,removedLines:0}]});
add('document.snapshot',{file:'src/index.ts',content:'export const hello = (name: string) => `Hello ${name}`;\nexport function boot(){ return hello("Code Resonance"); }\n',meta:{reason:'edit'}});
add('document.snapshot',{file:'src/api.ts',content:'import { boot } from "./index";\nexport function authorize(user: string){return Boolean(user && boot());}\n',meta:{reason:'external'}});
add('agent.prompt.submitted',{meta:{provider:'DEMO (synthetic)',source:'demonstration',length:83,fingerprint:'demo-no-raw-prompt'}});
add('agent.plan.visible',{meta:{provider:'DEMO (synthetic)',source:'demonstration',thinkingExposed:true}});
add('agent.tool.started',{meta:{provider:'DEMO (synthetic)',source:'demonstration',tool:'Edit'}});
add('document.snapshot',{file:'src/ui/App.tsx',content:'import React from "react";\nexport function App(){ return <main><h1>Code Resonance</h1><p>Software has a rhythm.</p></main> }\n',meta:{reason:'external'}});
add('agent.tool.completed',{meta:{provider:'DEMO (synthetic)',source:'demonstration',tool:'Edit'}});
add('task.started',{meta:{taskName:'npm test'}});
add('task.finished',{meta:{taskName:'npm test',exitCode:1}});
add('diagnostics.updated',{file:'src/api.ts',meta:{errors:2,warnings:1}});
add('document.snapshot',{file:'src/api.ts',content:'import { boot } from "./index";\nexport function authorize(user: string){ return user.length>0 && boot().length>0; }\nexport const getUser = (id: string) => ({ id, active: true });\n',meta:{reason:'edit'}});
add('task.started',{meta:{taskName:'npm test'}});
add('task.finished',{meta:{taskName:'npm test',exitCode:0}});
add('document.snapshot',{file:'app/api/users/route.ts',content:'import { getUser } from "../../../src/api";\nexport const GET = async () => Response.json(getUser("visitor"));\n',meta:{reason:'edit'}});
add('repository.commit.observed',{meta:{commit:'abcdef0123456789',parent:'0123456789abcdef'}});
add('agent.response.completed',{meta:{provider:'DEMO (synthetic)',source:'demonstration'}});
function get(route){return new Promise((resolve,reject)=>{
  http.get({hostname:'127.0.0.1',port,path:route},res=>{
    let s='';res.on('data',x=>s+=x);res.on('end',()=>res.statusCode===200?resolve(JSON.parse(s)):reject(Error('HTTP '+res.statusCode)));
  }).on('error',reject);
});}
function post(route,body){return new Promise((resolve,reject)=>{
  const text=Buffer.from(JSON.stringify(body||{}));const req=http.request({hostname:'127.0.0.1',port,method:'POST',path:route,headers:{'Content-Type':'application/json','Content-Length':text.length,Authorization:`Bearer ${auth.token}`}},res=>{
    let s='';res.on('data',x=>s+=x);res.on('end',()=>res.statusCode<300?resolve(JSON.parse(s)):reject(Error(`HTTP ${res.statusCode}: ${s}`)));
  });req.on('error',reject);req.end(text);
});}
(async()=>{
  for(let i=0;i<events.length;i+=8)await post('/v1/events',{events:events.slice(i,i+8)});
  await post(`/v1/flush?id=${projectId}`);
  const state=await get(`/api/project?id=${projectId}`);
  const bridge=await get(`/v1/performance/frames?id=${projectId}`);
  console.log(`Sent ${events.length} fictional demo events; project now has ${state.stats.raw} recorded events and ${bridge.frames.length} musical control frames.`);
  console.log(`Open http://127.0.0.1:${port}/ and select PROJECT ${projectId.slice(0,8).toUpperCase()}`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});

'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises');
const path=require('node:path');
const {newState,apply,closeBatch,publicProjection}=require('./reducer');
const {sha}=require('../receiver/protocol');
const zlib=require('node:zlib');
const {promisify}=require('node:util');
const gunzip=promisify(zlib.gunzip);
const states=new Map();
const dataDir=workerData.dataDir;
let running=null;
async function writeAtomic(file,data){const tmp=`${file}.${process.pid}.tmp`;await fs.writeFile(tmp,data,{mode:0o600});await fs.rename(tmp,file);}
async function ids(){
  const projectsDir=path.join(dataDir,'projects');
  await fs.mkdir(projectsDir,{recursive:true,mode:0o700});
  const entries=await fs.readdir(projectsDir,{withFileTypes:true});
  const all=[];
  for(const d of entries){
    if(!d.isDirectory()||!/^[a-f0-9]{64}$/.test(d.name))continue;
    try{const id=await fs.readFile(path.join(projectsDir,d.name,'id'),'utf8');if(sha(id)===d.name)all.push(id);}catch{}
  }
  return all;
}
async function load(id){
  if(states.has(id))return states.get(id);
  const dir=path.join(dataDir,'projects',sha(id));
  let state;
  try{const parsed=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));state=parsed.v===1&&parsed.projectId===id?parsed:newState(id);}catch{state=newState(id);}
  states.set(id,state);return state;
}
async function runProject(id){
  const dir=path.join(dataDir,'projects',sha(id));
  const state=await load(id);
  const file=path.join(dir,'events.jsonl');
  let fd;
  try{fd=await fs.open(file,'r');}catch(e){if(e.code==='ENOENT')return {events:0,frames:0};throw e;}
  let cues=[];let events=0,frames=0;let bucket=null;
  function commitWindow(){
    if(!cues.length)return;
    const frame=closeBatch(state,cues);
    if(frame){
      if(!state.replayGraphs)state.replayGraphs=[];
      state.replayGraphs.push({id:frame.id,ts:frame.createdAt,graph:publicProjection(state).graph});
      if(state.replayGraphs.length>160)state.replayGraphs.splice(0,state.replayGraphs.length-160);
      frames++;
    }
    cues=[];
  }
  try{
    const stat=await fd.stat();let pos=state.processedOffset||0;
    // Any interrupted append ending in an incomplete JSONL line is left untouched until complete.
    const MAX=16*1024*1024;
    let n=0;
    while(pos<stat.size&&n<MAX){
      const size=Math.min(stat.size-pos,Math.min(512*1024,MAX-n));
      // Read from the current committed byte boundary; include a tail as needed.
      const buf=Buffer.alloc(size);
      const {bytesRead}=await fd.read(buf,0,size,pos);if(!bytesRead)break;
      const piece=buf.subarray(0,bytesRead);
      const cut=piece.lastIndexOf(10);if(cut<0)break;
      const lines=piece.subarray(0,cut+1).toString('utf8').split('\n');
      for(const line of lines) {
        if(!line)continue;
        try{const event=JSON.parse(line);
          if(event.contentHash&&event.kind==='document.snapshot'){
            if(!/^[a-f0-9]{64}$/.test(event.contentHash))throw Error('Invalid content hash');
            const compressed=await fs.readFile(path.join(dir,'blobs',event.contentHash+'.gz'));
            if(compressed.length>170*1024)throw Error('Oversize compressed blob');
            const expanded=await gunzip(compressed,{maxOutputLength:160*1024});
            if(sha(expanded)!==event.contentHash)throw Error('Content checksum mismatch');
            event.content=expanded.toString('utf8');
          }
          const nextBucket=Math.floor(event.ts/10000);
          if(bucket!==null&&bucket!==nextBucket)commitWindow();
          bucket=nextBucket;cues.push(...apply(state,event));events++;}
        catch(err){parentPort.postMessage({type:'log',message:'Invalid journal record skipped: '+err.message});}
      }
      const consumed=cut+1;pos+=consumed;n+=consumed;
    }
    if(!events)return {events:0,frames:0};
    state.processedOffset=pos;
    commitWindow();
    await writeAtomic(path.join(dir,'state.json'),JSON.stringify(state));
  }finally{await fd.close();}
  return {events,frames};
}
async function scan(target){
  if(running){await running;return scan(target);}
  running=(async()=>{
    const projectIds=target?[target]:await ids();
    let events=0,frames=0;
    for(const id of projectIds){const r=await runProject(id);events+=r.events;frames+=r.frames;}
    return {events,frames};
  })();
  try{return await running;}finally{running=null;}
}
parentPort.on('message',async m=>{
  if(m.type!=='flush')return;
  try{const result=await scan(m.projectId);parentPort.postMessage({type:'flushed',requestId:m.requestId,...result});}
  catch(e){parentPort.postMessage({type:'flushed',requestId:m.requestId,error:e.message});}
});
setInterval(()=>scan().catch(e=>parentPort.postMessage({type:'log',message:e.message})),workerData.intervalMs).unref();
scan().catch(e=>parentPort.postMessage({type:'log',message:e.message}));

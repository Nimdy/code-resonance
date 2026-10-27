'use strict';
// Background interpreter. Reads the append-only journal, closes deterministic time windows, and appends the
// recorded performance timeline (frames + cues + graph deltas) to performance.jsonl.
//
// Determinism: windows are assigned from `receivedAt`, which the receiver stamps monotonically at append time.
// A window closes when a later window's event appears, a control.window.close record is reached, or (live only)
// the wall clock passes its end plus a grace period. Re-interpreting the same journal therefore yields the same
// frames, and the recorded performance replays exactly what was performed live.
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises');
const path=require('node:path');
const {INTERPRETATION_VERSION,newState,apply,closeBatch,publicProjection}=require('./reducer');
const {sha}=require('../receiver/protocol');
const zlib=require('node:zlib');
const {promisify}=require('node:util');
const gunzip=promisify(zlib.gunzip);
const WINDOW_MS=workerData.windowMs||5000;
const GRACE_MS=workerData.graceMs??1500;
// Checkpoints are throttled: frames appended after the last checkpoint are regenerated identically on restart.
const CHECKPOINT_MS=30000;
const KEYFRAME_EVERY=60;
const MAX_SCAN_BYTES=64*1024*1024;
const TIMELINE_CUES=400;
const states=new Map();
const dataDir=workerData.dataDir;
let running=null;
async function writeAtomic(file,data){const tmp=`${file}.${process.pid}.tmp`;await fs.writeFile(tmp,data,{mode:0o600});await fs.rename(tmp,file);}
const projectDir=id=>path.join(dataDir,'projects',sha(id));
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
function fresh(id){const s=newState(id);s.window={lastIndex:-1,lastEnd:0,seq:0};s.graph={nodes:{},edges:{}};s.performanceBytes=0;delete s.replayGraphs;return s;}
async function load(id){
  if(states.has(id))return states.get(id);
  const dir=projectDir(id),perf=path.join(dir,'performance.jsonl');
  let state=null;
  try{const parsed=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));if(parsed.v===1&&parsed.projectId===id)state=parsed;}catch{}
  let size=0;try{size=(await fs.stat(perf)).size;}catch{}
  // Older interpretations (or a missing/short timeline) are rebuilt from the journal; raw events are never rewritten.
  if(!state||state.interpretationVersion!==INTERPRETATION_VERSION||!state.window||size<(state.performanceBytes||0)){
    if(state)parentPort.postMessage({type:'log',message:`Rebuilding ${id.slice(0,8)} interpretation v${state.interpretationVersion||1} -> v${INTERPRETATION_VERSION}`});
    state=fresh(id);state.resetPending=true;await fs.rm(perf,{force:true});
  }else if(size>state.performanceBytes){
    // Frames appended after the last checkpoint are regenerated identically, so drop them.
    await fs.truncate(perf,state.performanceBytes);
  }
  state.seenSet=new Set(state.seen);
  states.set(id,state);return state;
}
async function readEvent(dir,line){
  const event=JSON.parse(line);
  if(event.contentHash&&event.kind==='document.snapshot'){
    if(!/^[a-f0-9]{64}$/.test(event.contentHash))throw Error('Invalid content hash');
    const compressed=await fs.readFile(path.join(dir,'blobs',event.contentHash+'.gz'));
    if(compressed.length>170*1024)throw Error('Oversize compressed blob');
    const expanded=await gunzip(compressed,{maxOutputLength:160*1024});
    if(sha(expanded)!==event.contentHash)throw Error('Content checksum mismatch');
    event.content=expanded.toString('utf8');
  }
  return event;
}
function graphDelta(state,graph,keyframe){
  const nodes={},edges={};
  for(const n of graph.nodes)nodes[n.id]=n;
  for(const e of graph.edges)edges[`${e.a}>${e.b}>${e.kind}`]=e;
  const prev=state.graph;
  const delta=keyframe?{keyframe:true,nodes:graph.nodes,edges:graph.edges}:{
    add:graph.nodes.filter(n=>!prev.nodes[n.id]||prev.nodes[n.id].weight!==n.weight||prev.nodes[n.id].type!==n.type),
    remove:Object.keys(prev.nodes).filter(id=>!nodes[id]),
    addEdges:graph.edges.filter(e=>!prev.edges[`${e.a}>${e.b}>${e.kind}`]),
    removeEdges:Object.keys(prev.edges).filter(k=>!edges[k]).map(k=>{const [a,b,kind]=k.split('>');return {a,b,kind};})
  };
  state.graph={nodes,edges};
  return delta;
}
async function checkpoint(id,state){
  state.seen=[...state.seenSet].slice(-12000);
  const {seenSet,...persisted}=state;
  await writeAtomic(path.join(projectDir(id),'state.json'),JSON.stringify(persisted));
  state.lastCheckpoint=Date.now();state.dirty=false;
}
async function runProject(id,now,force){
  const dir=projectDir(id);
  const state=await load(id);
  const file=path.join(dir,'events.jsonl');
  let fd;
  try{fd=await fs.open(file,'r');}catch(e){if(e.code==='ENOENT')return {events:0,frames:0,more:false};throw e;}
  let events=0,frames=0,more=false;
  const timeline=[];
  try{
    const {size}=await fd.stat();const start=state.processedOffset||0;
    const length=Math.min(size-start,MAX_SCAN_BYTES);
    if(length<=0)return {events:0,frames:0,more:false};
    const buf=Buffer.alloc(length);const {bytesRead}=await fd.read(buf,0,length,start);
    // Only complete lines; an interrupted append stays unread until its newline arrives.
    const lines=[];let at=0;
    while(at<bytesRead){const nl=buf.indexOf(10,at);if(nl<0||nl>=bytesRead)break;lines.push({offset:start+at,end:start+nl+1,text:buf.subarray(at,nl).toString('utf8')});at=nl+1;}
    more=start+at<size;
    // Group consecutive lines into windows.
    // Window indices never decrease, so legacy journals (ordered by arrival, stamped by event time) stay deterministic.
    const groups=[];let group=null,lastIndex=state.window.lastIndex;
    for(const line of lines){
      let head=null;try{head=JSON.parse(line.text);}catch{}
      const received=head?(Number.isFinite(head.receivedAt)?head.receivedAt:Number(head.ts)||0):null;
      const index=received===null?lastIndex:Math.max(Math.floor(received/WINDOW_MS),lastIndex);
      lastIndex=index;
      if(!group||index!==group.index){group={index,lines:[],control:null};groups.push(group);}
      group.lines.push(line);
      if(head&&head.kind==='control.window.close'){group.control=head;group=null;}
    }
    for(let g=0;g<groups.length;g++){
      const w=groups[g];
      const closed=!!w.control||g<groups.length-1||more||now>=(w.index+1)*WINDOW_MS+GRACE_MS;
      if(!closed)break;
      const cues=[];
      for(const line of w.lines){
        if(w.control&&line===w.lines.at(-1))continue;
        try{
          const event=await readEvent(dir,line.text);
          cues.push(...apply(state,event));events++;
        }catch(err){parentPort.postMessage({type:'log',message:'Invalid journal record skipped: '+err.message});}
      }
      const startTime=Math.max(w.index*WINDOW_MS,state.window.lastEnd);
      const endTime=w.control?Math.max(startTime,w.control.receivedAt):(w.index+1)*WINDOW_MS;
      state.window.lastIndex=w.index;state.window.lastEnd=endTime;
      state.processedOffset=w.lines.at(-1).end;
      if(!cues.length)continue;
      const frame=closeBatch(state,cues,endTime);
      const seq=state.window.seq++;
      Object.assign(frame,{seq,window:w.index,start:startTime,end:endTime});
      const graph=publicProjection(state).graph;
      const shown=cues.filter(c=>c.type!=='document.baseline.indexed');
      timeline.push({seq,start:startTime,end:endTime,frame,cues:shown.slice(-TIMELINE_CUES),omittedCues:Math.max(0,shown.length-TIMELINE_CUES),graph:graphDelta(state,graph,seq%KEYFRAME_EVERY===0)});
      frames++;
    }
    if(!events&&!frames&&state.processedOffset===start)return {events:0,frames:0,more};
    const perf=path.join(dir,'performance.jsonl');
    const appended=[];
    if(timeline.length){
      let offset=state.performanceBytes;
      const text=timeline.map(entry=>{const line=JSON.stringify(entry)+'\n';appended.push({seq:entry.seq,offset,length:Buffer.byteLength(line),start:entry.start,end:entry.end});offset+=Buffer.byteLength(line);return line;}).join('');
      await fs.appendFile(perf,text,{mode:0o600});
      state.performanceBytes=offset;
    }
    const reset=!!state.resetPending;delete state.resetPending;
    state.dirty=true;
    if(force||Date.now()-(state.lastCheckpoint||0)>=CHECKPOINT_MS)await checkpoint(id,state);
    const projection=JSON.stringify({...publicProjection(state),interpretationVersion:INTERPRETATION_VERSION,timelineFrames:state.window.seq});
    await writeAtomic(path.join(dir,'public.json'),projection);
    parentPort.postMessage({type:'projection',projectId:id,json:projection,appended,reset,summary:{id,updatedAt:state.frames.at(-1)?.createdAt||null,events:state.stats.raw,chapter:state.performance.chapter,frames:state.window.seq,name:state.name||null}});
  }finally{await fd.close();}
  return {events,frames,more};
}
async function scan(target,now=Date.now(),force=false){
  if(running){await running;return scan(target,now,force);}
  running=(async()=>{
    const projectIds=target?[target]:await ids();
    let events=0,frames=0;
    for(const id of projectIds){
      // Catch up fully (e.g. after a rebuild), one bounded chunk at a time.
      for(let i=0;i<10000;i++){const r=await runProject(id,now,force);events+=r.events;frames+=r.frames;if(!r.more)break;}
      const state=states.get(id);if(force&&state?.dirty)await checkpoint(id,state);
    }
    return {events,frames};
  })();
  try{return await running;}finally{running=null;}
}
async function rebuild(id){
  if(running)await running;
  states.delete(id);
  const dir=projectDir(id);
  for(const f of ['state.json','performance.jsonl','public.json'])await fs.rm(path.join(dir,f),{force:true});
  return scan(id,Date.now(),true);
}
async function checkpointAll(){if(running)await running;for(const [id,state] of states)if(state.dirty)await checkpoint(id,state);return {events:0,frames:0};}
parentPort.on('message',async m=>{
  if(!['flush','rebuild','shutdown'].includes(m.type))return;
  try{const result=await (m.type==='rebuild'?rebuild(m.projectId):m.type==='shutdown'?checkpointAll():scan(m.projectId,Date.now(),true));parentPort.postMessage({type:'flushed',requestId:m.requestId,...result});}
  catch(e){parentPort.postMessage({type:'flushed',requestId:m.requestId,error:e.message});}
});
setInterval(()=>scan().catch(e=>parentPort.postMessage({type:'log',message:e.message})),workerData.intervalMs).unref();
scan().catch(e=>parentPort.postMessage({type:'log',message:e.message}));

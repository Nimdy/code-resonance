'use strict';
const {sha} = require('../receiver/protocol');
const {analyze,diff} = require('./semantic');
function newState(projectId) {
  const seed=parseInt(sha(projectId).slice(0,8),16);
  return {
    v:1, projectId, seed, createdAt:Date.now(), processedOffset:0,
    docs:{}, seen:[], stats:{raw:0,files:0,symbols:0,created:0,modified:0,removed:0,imports:0,commands:0,testsPassed:0,testsFailed:0,agentEvents:0,newlines:0,baselines:0},
    performance:{identity:{scale:['D','E','F#','G','A','B','C#'][seed%7],motif:[seed%7,(seed>>>3)%7,(seed>>>9)%7,(seed>>>15)%7]},
      progress:0,tension:0,energy:0,chapter:1,version:0},
    timeline:[],frames:[],replayGraphs:[],sessions:{}
  };
}
function bounded(value,min=0,max=1){return Math.min(max,Math.max(min,value));}
function makeCue(event,kind,category,weight=0,detail={}) {
  return {v:1,id:`${event.id}:${kind}:${sha(JSON.stringify(detail)).slice(0,8)}`,projectId:event.projectId,
    sessionId:event.sessionId||'',ts:event.ts,observedAt:event.ts,type:kind,category,weight,
    confidence:category==='inferred'?0.7:1,detail};
}
function describeSymbol(s) {
  return {symbolId:sha(`${s.kind}:${s.name}:${s.owner}`).slice(0,14),symbolType:s.kind, size:s.size};
}
function apply(state,event) {
  if (!state.seen) state.seen=[];
  if(state.seen.includes(event.id)) return [];
  state.seen.push(event.id); if(state.seen.length>12000) state.seen.splice(0,state.seen.length-12000);
  const cues=[];
  const c=(kind,cat,w,details={})=>cues.push(makeCue(event,kind,cat,w,details));
  state.stats.raw++;
  if(event.sessionId){const session=state.sessions[event.sessionId]||{id:event.sessionId,start:event.ts,end:event.ts,events:0};session.start=Math.min(session.start,event.ts);session.end=Math.max(session.end,event.ts);session.events++;state.sessions[event.sessionId]=session;}
  switch(event.kind) {
    case 'project.baseline':state.stats.baselines++;c('project.baseline','observed',0,{count:event.meta?.count||0,truncated:!!event.meta?.truncated});break;
    case 'document.snapshot': {
      if(!event.file||typeof event.content!=='string') break;
      const file=event.file;
      const before=state.docs[file];
      const analysis=analyze(file,event.content);
      const hash=sha(event.content);
      if(before?.hash===hash) break;
      const isBaseline=event.meta?.reason==='baseline';
      const differences=diff(before?.analysis||{symbols:[],imports:[]},analysis);
      state.docs[file]={hash,analysis};
      state.stats.files=Object.keys(state.docs).length;
      state.stats.symbols=Object.values(state.docs).reduce((n,d)=>n+d.analysis.symbols.length,0);
      state.stats.imports=Object.values(state.docs).reduce((n,d)=>n+d.analysis.imports.length,0);
      if(isBaseline){c('document.baseline.indexed','observed',0,{symbols:analysis.symbols.length,imports:analysis.imports.length,parseErrors:analysis.errors});break;}
      const max=160;
      for(const change of differences.slice(0,max)) {
        const isCreated=change.kind==='symbol.created',isRemoved=change.kind==='symbol.removed';
        const type=change.symbol?.kind || 'dependency';
        let weight=isCreated?({"ui.component":2,'api.route':2.2,'function':0.9,'class':1.4,'method':0.7,'variable':0.12,'callsite':0.08}[type]??0.15):isRemoved?0.15:0.12;
        if(change.kind==='dependency.added') weight=.4;
        const details=change.symbol?describeSymbol(change.symbol):{dependencyId:sha(change.import.spec).slice(0,12)};
        c(change.kind,'inferred',weight,{...details,fileId:sha(file).slice(0,14)});
        if(isCreated)state.stats.created++;
        else if(isRemoved)state.stats.removed++;
        else state.stats.modified++;
      }
      if(differences.length>max) c('document.change.overflow','observed',0,{omitted:differences.length-max});
      if(analysis.errors) c('source.parse.diagnostics','observed',0,{errors:analysis.errors});
      break;
    }
    case 'document.change': case 'document.edits': {
      // v0.2 extensions sent one document.change per keystroke; newer ones send a per-second document.edits summary.
      const edits=event.kind==='document.edits'?(event.meta?.edits||0):(event.changes?.length||0);
      const enters=event.kind==='document.edits'?(event.meta?.insertedLines||0):(event.changes||[]).reduce((n,x)=>n+(x.insertedLines||0),0);
      state.stats.newlines+=enters;
      c('editor.change.observed','observed',0,{edits,insertedNewlines:enters});
      if(enters)c('editor.newline.inserted','observed',0,{count:enters});
      break;
    }
    case 'document.saved':c('document.saved','observed',0);break;
    case 'file.created':c('file.created','observed',.25);break;
    case 'file.deleted': {
      if(event.file){delete state.docs[event.file];state.stats.files=Object.keys(state.docs).length;}
      c('file.deleted','observed',0);break;
    }
    case 'file.renamed':c('file.renamed','observed',0);break;
    case 'task.started':c('execution.task.started','observed',0);break;
    case 'task.finished': {
      const name=event.meta?.taskName||'';const test=/\b(test|spec|jest|vitest|playwright|pytest|mocha)\b/i.test(name);
      const exit=event.meta?.exitCode;
      if(test&&exit===0){state.stats.testsPassed++;c('validation.test.passed','observed',3);}
      else if(test&&typeof exit==='number'&&exit!==0){state.stats.testsFailed++;c('validation.test.failed','observed',0);}
      else c(exit===0?'execution.task.succeeded':exit==null?'execution.task.unknown':'execution.task.failed','observed',exit===0?.25:0);
      break;
    }
    case 'terminal.command.started': state.stats.commands++;c('execution.command.started','observed',0,{commandKnown:!!event.meta?.command});break;
    case 'terminal.command.finished': c('execution.command.finished','observed',0,{exitCode:event.meta?.exitCode??null});break;
    case 'diagnostics.updated': c('validation.diagnostics','observed',0,{errors:event.meta?.errors||0,warnings:event.meta?.warnings||0});break;
    case 'repository.commit.observed':c('repository.commit.observed','observed',1);break;
    case 'agent.prompt.submitted':case 'agent.thinking.visible':case 'agent.tool.started':case 'agent.tool.completed':case 'agent.response.completed':case 'agent.plan.visible':case 'agent.message.visible':case 'agent.file.modified':
      state.stats.agentEvents++;
      c(event.kind,'observed',event.kind==='agent.file.modified'?.3:0,{provider:event.meta?.provider||'unspecified',source:event.meta?.source||'hook'});
      break;
    case 'workspace.started':case 'workspace.stopped':c(event.kind,'observed',0);break;
    case 'instrument.note':c('instrument.note','observed',0);break;
    default:break;
  }
  // Significant changes drive project evolution. Editing/typing events are not progress.
  const growth=cues.reduce((a,x)=>a+x.weight,0);
  if(growth)state.performance.progress+=growth;
  if(cues.some(x=>x.type==='validation.test.failed'))state.performance.tension=bounded(state.performance.tension+.35);
  if(cues.some(x=>x.type==='validation.test.passed'))state.performance.tension=bounded(state.performance.tension-.30);
  if(event.kind==='diagnostics.updated')state.performance.tension=bounded(state.performance.tension+(event.meta?.errors?0.05:-0.02));
  state.timeline.push(...cues);
  // Full evidence is retained in raw JSONL. The checkpoint keeps a bounded view only.
  if(state.timeline.length>3500)state.timeline.splice(0,state.timeline.length-3500);
  return cues;
}
function closeBatch(state,cues,clock=Math.max(0,...cues.map(c=>c.ts))) {
  if(!cues.length)return null;
  const observable=cues.filter(x=>!['editor.change.observed','editor.newline.inserted','document.baseline.indexed'].includes(x.type));
  const diversity=new Set(observable.map(x=>x.type)).size;
  const action=observable.length;
  const latestFailure=observable.some(x=>x.type==='validation.test.failed');
  const latestPass=observable.some(x=>x.type==='validation.test.passed');
  state.performance.energy=bounded(Math.sqrt(action)*.1 + diversity*.045);
  if(!latestFailure&&!latestPass)state.performance.tension=bounded(state.performance.tension*.97);
  const p=state.performance;
  p.chapter=1+Math.floor(Math.log2(1+p.progress/5));p.version++;
  const weighted=observable.reduce((tot,x)=>tot+x.weight,0);
  const frame={
    schema:'code-resonance.frame.v1',id:`${state.projectId}:${p.version}`,projectId:state.projectId,
    createdAt:clock,projectSeed:state.seed,sessionIds:[...new Set(cues.map(c=>c.sessionId).filter(Boolean))],
    chapter:p.chapter,controls:{energy:p.energy,tension:p.tension,density:bounded(action/50),growth:bounded(weighted/10),complexity:bounded(Math.log2(1+state.stats.symbols)/12),agentActivity:bounded(cues.filter(x=>x.type.startsWith('agent.')).length/15)},
    motif:p.identity.motif.slice(),scaleRoot:p.identity.scale,
    eventCounts:cues.reduce((a,x)=>((a[x.type]=(a[x.type]||0)+1),a),{}),
    evidence:{received:cues.length,observed:cues.filter(x=>x.category==='observed').length,inferred:cues.filter(x=>x.category==='inferred').length},
    interpretationVersion:1
  };
  state.frames.push(frame);
  if(state.frames.length>800)state.frames.splice(0,state.frames.length-800);
  return frame;
}
function publicProjection(state) {
  const nodes=[];const edges=[];
  for (const [file,entry] of Object.entries(state.docs)) {
    const fileId=sha(file).slice(0,14);
    nodes.push({id:fileId,type:'module',weight:Math.min(6,Math.max(1,Math.sqrt(entry.analysis.symbols.length)))});
    for(const s of entry.analysis.symbols.filter(x=>x.kind!=='callsite').slice(0,36)) {
      const id=sha(`${file}:${s.key}`).slice(0,14);
      nodes.push({id,type:s.kind,weight:Math.min(4,Math.max(.5,Math.log2(2+s.size)/3))});
      edges.push({a:fileId,b:id,kind:'contains'});
    }
    for(const imp of entry.analysis.imports.filter(x=>x.target).slice(0,24)) {
      // Graph edges only when target is a known module, without leaking paths.
      const f=Object.keys(state.docs).find(k=>k.replace(/\.[^.]+$/,'')===imp.target || k.replace(/\/(?:index\.[^.]+)?$/,'')===imp.target);
      if(f) edges.push({a:fileId,b:sha(f).slice(0,14),kind:'depends'});
    }
  }
  return {projectId:state.projectId,stats:state.stats,performance:state.performance,
    graph:{nodes:nodes.slice(0,900),edges:edges.slice(0,2200)},
    frames:state.frames.slice(-100),timeline:state.timeline.slice(-500),
    sessions:Object.values(state.sessions).sort((a,b)=>b.end-a.end).slice(0,40),updatedAt:state.frames.at(-1)?.createdAt||null};
}
module.exports={newState,apply,closeBatch,publicProjection};

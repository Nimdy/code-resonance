'use strict';
const {sha} = require('../receiver/protocol');
const {analyze,diff} = require('./semantic');
// Bump whenever interpretation of the same journal would change; derived state is then rebuilt from the journal.
const INTERPRETATION_VERSION=3;
const SNAPSHOT_CREDIT_CAP=6;
const AGENT_ATTRIBUTION_MS=60000;
const AGENT_VOICES=8;
// Credit for structure that appears, by symbol kind. Local variables and call sites are facts, not progress.
const CREATED={'ui.component':2,'api.route':2.2,'class':1.4,'function':0.9,'method':0.6,'interface':0.5,'type':0.35,'property':0.12,'variable':0.15,'callsite':0};
const MODIFIED={'ui.component':0.15,'api.route':0.15,'function':0.12,'method':0.1,'class':0.03,'interface':0.05,'type':0.05,'property':0.02,'variable':0,'callsite':0};
const LEGACY_TEST_TASK=/\b(test|spec|jest|vitest|playwright|pytest|mocha)\b/i;
const VALIDATIONS=['test','build','typecheck','lint'];
function newState(projectId) {
  const seed=parseInt(sha(projectId).slice(0,8),16);
  return {
    v:1, interpretationVersion:INTERPRETATION_VERSION, projectId, seed, createdAt:Date.now(), processedOffset:0,
    docs:{}, seen:[], stats:{raw:0,files:0,symbols:0,created:0,modified:0,removed:0,imports:0,commands:0,testsPassed:0,testsFailed:0,agentEvents:0,newlines:0,baselines:0,milestones:0,agents:0},
    performance:{identity:{scale:['D','E','F#','G','A','B','C#'][seed%7],motif:[seed%7,(seed>>>3)%7,(seed>>>9)%7,(seed>>>15)%7]},
      progress:0,tension:0,energy:0,chapter:1,version:0},
    validation:{},pending:{structure:0,removedSymbols:0,removedLines:0,sinceCommit:0},
    diagnostics:{},agents:{},agentFiles:{},
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
const meaningful=s=>s.kind!=='callsite'&&!s.local;
function agentFor(state,event){
  const provider=String(event.meta?.provider||'unspecified').slice(0,40);
  const id=sha(`${provider}/${event.meta?.agent||event.sessionId||''}`).slice(0,10);
  if(!state.agents[id]){state.agents[id]={id,provider,voice:Object.keys(state.agents).length%AGENT_VOICES,first:event.ts,last:event.ts,events:0};state.stats.agents=Object.keys(state.agents).length;}
  const a=state.agents[id];a.last=Math.max(a.last,event.ts);a.events++;
  return a;
}
function computeTension(state){
  const v=state.validation;
  const failing=(v.test==='fail'?0.6:0)+(v.build==='fail'?0.4:0)+(v.typecheck==='fail'?0.25:0)+(v.lint==='fail'?0.1:0);
  const errors=Object.values(state.diagnostics).reduce((n,x)=>n+x,0);
  return bounded(failing+0.35*(1-Math.exp(-errors/10)));
}
function categoryOf(event){
  const c=event.meta?.category;
  if(typeof c==='string')return c;
  return event.kind==='task.finished'&&LEGACY_TEST_TASK.test(event.meta?.taskName||'')?'test':'other';
}
// Duplicate deliveries (outbox retries) are dropped. The worker supplies an insertion-ordered Set for O(1) checks.
function alreadySeen(state,id){
  if(state.seenSet){
    if(state.seenSet.has(id))return true;
    state.seenSet.add(id);
    if(state.seenSet.size>24000){const oldest=state.seenSet.values();for(let i=0;i<12000;i++)state.seenSet.delete(oldest.next().value);}
    return false;
  }
  if(!state.seen)state.seen=[];
  if(state.seen.includes(id))return true;
  state.seen.push(id);if(state.seen.length>12000)state.seen.splice(0,state.seen.length-12000);
  return false;
}
function apply(state,event) {
  if(alreadySeen(state,event.id)) return [];
  const cues=[];
  const c=(kind,cat,w,details={})=>{const cue=makeCue(event,kind,cat,w,details);cues.push(cue);return cue;};
  state.stats.raw++;
  if(event.sessionId){const session=state.sessions[event.sessionId]||{id:event.sessionId,start:event.ts,end:event.ts,events:0};session.start=Math.min(session.start,event.ts);session.end=Math.max(session.end,event.ts);session.events++;state.sessions[event.sessionId]=session;}
  function validation(category,passed){
    if(!VALIDATIONS.includes(category))return false;
    const previous=state.validation[category],p=state.pending;
    if(!passed){
      if(category==='test')state.stats.testsFailed++;
      state.validation[category]='fail';c(`validation.${category}.failed`,'observed',0);return true;
    }
    // A green run only counts when it validates something new or recovers a failure; re-running is not progress.
    let weight=previous==='fail'?(category==='test'?3:1):0;
    if(category==='test'){
      state.stats.testsPassed++;
      if(p.structure>0)weight+=0.5+Math.min(2,p.structure*0.25);
      if(p.removedSymbols>=3){state.stats.milestones++;c('milestone.refactor.validated','inferred',Math.min(4,1+Math.log2(1+p.removedSymbols)),{removedSymbols:p.removedSymbols,removedLines:p.removedLines});}
      p.structure=0;p.removedSymbols=0;p.removedLines=0;
    }else if(p.structure>0)weight+=category==='build'?0.4:0.2;
    state.validation[category]='pass';c(`validation.${category}.passed`,'observed',weight);return true;
  }
  switch(event.kind) {
    case 'project.baseline':state.stats.baselines++;c('project.baseline','observed',0,{count:event.meta?.count||0,truncated:!!event.meta?.truncated});break;
    case 'document.snapshot': {
      if(!event.file||typeof event.content!=='string') break;
      const file=event.file;
      const before=state.docs[file];
      const hash=sha(event.content);
      if(before?.hash===hash) break;
      const analysis=analyze(file,event.content);
      const isBaseline=event.meta?.reason==='baseline';
      const differences=diff(before?.analysis||{symbols:[],imports:[]},analysis);
      state.docs[file]={hash,analysis};
      state.stats.files=Object.keys(state.docs).length;
      state.stats.symbols=Object.values(state.docs).reduce((n,d)=>n+d.analysis.symbols.filter(meaningful).length,0);
      state.stats.imports=Object.values(state.docs).reduce((n,d)=>n+d.analysis.imports.length,0);
      if(isBaseline){c('document.baseline.indexed','observed',0,{symbols:analysis.symbols.length,imports:analysis.imports.length,parseErrors:analysis.errors});break;}
      const recent=state.agentFiles[file];
      const attribution=recent&&event.ts-recent.ts>=0&&event.ts-recent.ts<=AGENT_ATTRIBUTION_MS?{agentId:recent.agentId,voice:state.agents[recent.agentId]?.voice??0,attribution:'correlated'}:{};
      const fileId=sha(file).slice(0,14);
      const changes=[];let raw=0;
      for(const change of differences){
        if(change.symbol&&!meaningful(change.symbol))continue;
        let weight=0;
        if(change.kind==='symbol.created'){weight=CREATED[change.symbol.kind]??0.15;state.stats.created++;}
        else if(change.kind==='symbol.modified'){weight=MODIFIED[change.symbol.kind]??0.05;state.stats.modified++;}
        else if(change.kind==='symbol.removed'){state.stats.removed++;state.pending.removedSymbols++;}
        else if(change.kind==='dependency.added')weight=change.import.target?0.35:0.5;
        raw+=weight;changes.push({change,weight});
      }
      // Diminishing returns: a huge generated file cannot outscore careful work.
      const credit=raw>0?SNAPSHOT_CREDIT_CAP*(1-Math.exp(-raw/SNAPSHOT_CREDIT_CAP)):0,scale=raw>0?credit/raw:0;
      const max=160;
      for(const {change,weight} of changes.slice(0,max)) {
        const details=change.symbol?describeSymbol(change.symbol):{dependencyId:sha(change.import.spec).slice(0,12),internal:!!change.import.target};
        c(change.kind,'inferred',+(weight*scale).toFixed(4),{...details,fileId,...attribution});
      }
      if(changes.length>max) c('document.change.overflow','observed',0,{omitted:changes.length-max});
      if(analysis.errors) c('source.parse.diagnostics','observed',0,{errors:analysis.errors});
      state.pending.structure+=credit;state.pending.sinceCommit+=credit;
      if(before)state.pending.removedLines+=Math.max(0,(before.analysis.lines||0)-(analysis.lines||0));
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
      if(event.file&&state.docs[event.file]){
        state.pending.removedSymbols+=state.docs[event.file].analysis.symbols.filter(meaningful).length;
        state.pending.removedLines+=state.docs[event.file].analysis.lines||0;
        delete state.docs[event.file];state.stats.files=Object.keys(state.docs).length;
      }
      c('file.deleted','observed',0);break;
    }
    case 'file.renamed':c('file.renamed','observed',0);break;
    case 'task.started':c('execution.task.started','observed',0,{category:categoryOf(event)});break;
    case 'task.finished': {
      const exit=event.meta?.exitCode;
      if(typeof exit==='number'&&validation(categoryOf(event),exit===0))break;
      c(exit===0?'execution.task.succeeded':exit==null?'execution.task.unknown':'execution.task.failed','observed',exit===0?.25:0);
      break;
    }
    case 'terminal.command.started': state.stats.commands++;c('execution.command.started','observed',0,{commandKnown:!!event.meta?.command,category:categoryOf(event)});break;
    case 'terminal.command.finished': {
      const exit=event.meta?.exitCode;
      if(typeof exit==='number'&&validation(categoryOf(event),exit===0))break;
      c('execution.command.finished','observed',0,{exitCode:exit??null,category:categoryOf(event)});break;
    }
    case 'diagnostics.updated': {
      const errors=event.meta?.errors||0;
      if(event.file){if(errors)state.diagnostics[event.file]=errors;else delete state.diagnostics[event.file];}
      c('validation.diagnostics','observed',0,{errors,warnings:event.meta?.warnings||0});break;
    }
    case 'repository.commit.observed':c('repository.commit.observed','observed',0.6+Math.min(1.4,state.pending.sinceCommit*0.2));state.pending.sinceCommit=0;break;
    case 'repository.head.changed':c('repository.head.changed','observed',0);break;
    case 'agent.prompt.submitted':case 'agent.thinking.visible':case 'agent.tool.started':case 'agent.tool.completed':case 'agent.response.completed':case 'agent.plan.visible':case 'agent.message.visible':case 'agent.file.modified':
    case 'agent.session.started':case 'agent.session.ended':case 'agent.subagent.started':case 'agent.subagent.stopped': {
      state.stats.agentEvents++;
      const agent=agentFor(state,event);
      if(event.file&&(event.kind==='agent.file.modified'||event.kind==='agent.tool.completed'))state.agentFiles[event.file]={agentId:agent.id,ts:event.ts};
      c(event.kind,'observed',0,{provider:event.meta?.provider||'unspecified',source:event.meta?.source||'hook',agentId:agent.id,voice:agent.voice,...(event.meta?.tool?{tool:String(event.meta.tool).slice(0,40)}:{})});
      if(event.kind==='agent.tool.completed'&&typeof event.meta?.exitCode==='number')validation(categoryOf(event),event.meta.exitCode===0);
      break;
    }
    case 'workspace.started':case 'workspace.stopped':c(event.kind,'observed',0);break;
    case 'instrument.note':c('instrument.note','observed',0);break;
    default:break;
  }
  const growth=cues.reduce((a,x)=>a+x.weight,0);
  if(growth)state.performance.progress+=growth;
  state.performance.tension=computeTension(state);
  state.timeline.push(...cues);
  // Full evidence is retained in raw JSONL. The checkpoint keeps a bounded view only.
  if(state.timeline.length>3500)state.timeline.splice(0,state.timeline.length-3500);
  return cues;
}
function closeBatch(state,cues,clock=Math.max(0,...cues.map(c=>c.ts))) {
  if(!cues.length)return null;
  const observable=cues.filter(x=>!['editor.change.observed','editor.newline.inserted','document.baseline.indexed'].includes(x.type));
  const diversity=new Set(observable.map(x=>x.type)).size;
  const typing=cues.filter(x=>x.type==='editor.change.observed').reduce((n,x)=>n+(x.detail.edits||0),0);
  const weighted=observable.reduce((tot,x)=>tot+x.weight,0);
  // Current activity (typing, structural change, variety) drives energy; long-term progress drives the chapter.
  state.performance.energy=bounded(0.4*(1-Math.exp(-typing/60))+0.4*(1-Math.exp(-weighted/3))+0.2*Math.min(1,diversity/8));
  const p=state.performance;
  p.chapter=1+Math.floor(Math.log2(1+p.progress/6));p.version++;
  const agents=new Map();
  for(const x of cues)if(x.detail?.agentId){const a=agents.get(x.detail.agentId)||{id:x.detail.agentId,voice:x.detail.voice??0,events:0};a.events++;agents.set(a.id,a);}
  const frame={
    schema:'code-resonance.frame.v1',id:`${state.projectId}:${p.version}`,projectId:state.projectId,
    createdAt:clock,projectSeed:state.seed,sessionIds:[...new Set(cues.map(c=>c.sessionId).filter(Boolean))],
    chapter:p.chapter,controls:{energy:p.energy,tension:p.tension,density:bounded(observable.length/50),growth:bounded(weighted/10),complexity:bounded(Math.log2(1+state.stats.symbols)/12),agentActivity:bounded(cues.filter(x=>x.type.startsWith('agent.')).length/15)},
    motif:p.identity.motif.slice(),scaleRoot:p.identity.scale,
    eventCounts:cues.reduce((a,x)=>((a[x.type]=(a[x.type]||0)+1),a),{}),
    evidence:{received:cues.length,observed:cues.filter(x=>x.category==='observed').length,inferred:cues.filter(x=>x.category==='inferred').length},
    agents:[...agents.values()],milestones:observable.filter(x=>x.type.startsWith('milestone.')||(x.type.startsWith('validation.')&&x.weight>=1)).map(x=>x.type),
    interpretationVersion:INTERPRETATION_VERSION
  };
  state.frames.push(frame);
  if(state.frames.length>800)state.frames.splice(0,state.frames.length-800);
  return frame;
}
// Every module is shown; the remaining budget goes to the most architecturally meaningful symbols, spread
// round-robin across modules so large projects are represented evenly rather than by whichever files came first.
const KIND_RANK={'api.route':0,'ui.component':1,'class':2,'interface':3,'function':4,'method':5,'type':6,'variable':7};
const GRAPH_NODES=1400,MODULE_NODES=700,SYMBOLS_PER_MODULE=24;
function publicProjection(state) {
  const files=Object.keys(state.docs).sort();
  const modules=new Map();
  for(const file of files){const id=sha(file).slice(0,14);modules.set(file.replace(/\.[^.]+$/,''),id);const index=file.match(/^(.*)\/index\.[^.]+$/);if(index)modules.set(index[1],id);}
  const symbolCount=file=>state.docs[file].analysis.symbols.filter(meaningful).length;
  const shown=files.length>MODULE_NODES?files.slice().sort((a,b)=>symbolCount(b)-symbolCount(a)||a.localeCompare(b)).slice(0,MODULE_NODES).sort():files;
  const nodes=[],edges=[],queues=[];
  for(const file of shown){
    const fileId=sha(file).slice(0,14),symbols=state.docs[file].analysis.symbols.filter(s=>meaningful(s)&&s.kind!=='property');
    nodes.push({id:fileId,type:'module',weight:Math.min(6,Math.max(1,Math.sqrt(symbols.length)))});
    queues.push(symbols.sort((a,b)=>(KIND_RANK[a.kind]??9)-(KIND_RANK[b.kind]??9)).slice(0,SYMBOLS_PER_MODULE).map(s=>({file,fileId,s})));
  }
  for(let rank=0,budget=GRAPH_NODES-nodes.length;rank<SYMBOLS_PER_MODULE&&budget>0;rank++)for(const q of queues){
    if(budget<=0)break;const item=q[rank];if(!item)continue;
    const id=sha(`${item.file}:${item.s.key}`).slice(0,14);
    nodes.push({id,type:item.s.kind,weight:Math.min(4,Math.max(.5,Math.log2(2+item.s.size)/3)),parent:item.fileId});
    edges.push({a:item.fileId,b:id,kind:'contains'});budget--;
  }
  const linked=new Set();
  for(const file of shown){
    const fileId=sha(file).slice(0,14);
    for(const imp of state.docs[file].analysis.imports.filter(x=>x.target)) {
      // Graph edges only when target is a known module, without leaking paths.
      const target=modules.get(imp.target);
      if(target&&target!==fileId&&!linked.has(fileId+target)){linked.add(fileId+target);edges.push({a:fileId,b:target,kind:'depends'});}
    }
  }
  return {projectId:state.projectId,stats:state.stats,performance:state.performance,
    graph:{nodes,edges:edges.slice(0,4000)},
    frames:state.frames.slice(-100),timeline:state.timeline.slice(-500),
    sessions:Object.values(state.sessions).sort((a,b)=>b.end-a.end).slice(0,40),updatedAt:state.frames.at(-1)?.createdAt||null};
}
module.exports={INTERPRETATION_VERSION,newState,apply,closeBatch,publicProjection};

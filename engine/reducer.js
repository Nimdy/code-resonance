'use strict';
const {sha} = require('../receiver/protocol');
const {analyze,diff} = require('./semantic');
const {languageOf} = require('./languages');
const {makeIntent,activityOf,nextAgentState} = require('./intents');
const {groupOf,dirOf,newLayout,placeModule,removeModule} = require('./layout');
const {presence,catalogued} = require('./providers');
// Bump whenever interpretation of the same journal would change; derived state is then rebuilt from the journal.
// v7: canonical performance intents, agent lifecycle, language adapters (Python), module language categories.
// v8: CAST seats from the provider catalog; writer rings; agent.collision when two providers share a file or district.
// v9: agent.collision only between catalogued providers, and its cue adds no progress (weight 0, like every agent cue).
const INTERPRETATION_VERSION=9;
const RENAME_WINDOW_MS=60000;
const TEST_FILE=/(?:^|\/)(?:test|tests|__tests__|spec|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SNAPSHOT_CREDIT_CAP=6;
const CHAPTER_UNIT=12;
const AGENT_ATTRIBUTION_MS=60000;
// Credit for structure that appears, by symbol kind. Local variables and call sites are facts, not progress.
const CREATED={'ui.component':2,'api.route':2.2,'class':1.4,'function':0.9,'method':0.6,'interface':0.5,'type':0.35,'property':0.12,'variable':0.15,'callsite':0};
const MODIFIED={'ui.component':0.15,'api.route':0.15,'function':0.12,'method':0.1,'class':0.03,'interface':0.05,'type':0.05,'property':0.02,'variable':0,'callsite':0};
const LEGACY_TEST_TASK=/\b(test|spec|jest|vitest|playwright|pytest|mocha)\b/i;
const VALIDATIONS=['test','build','typecheck','lint'];
// Tools that only look: an agent reading a file is activity, not authorship of the next change to it.
const READ_ONLY_TOOLS=new Set(['Read','NotebookRead','Grep','Glob','LS','WebFetch','WebSearch','TodoWrite']);
const BIG_KINDS=new Set(['ui.component','api.route','class']);
function newState(projectId) {
  const seed=parseInt(sha(projectId).slice(0,8),16);
  return {
    v:1, interpretationVersion:INTERPRETATION_VERSION, projectId, seed, createdAt:Date.now(), processedOffset:0,
    docs:{}, seen:[], stats:{raw:0,files:0,symbols:0,created:0,modified:0,removed:0,imports:0,commands:0,testsPassed:0,testsFailed:0,agentEvents:0,newlines:0,baselines:0,milestones:0,agents:0},
    performance:{identity:{scale:['D','E','F#','G','A','B','C#'][seed%7],motif:[seed%7,(seed>>>3)%7,(seed>>>9)%7,(seed>>>15)%7]},
      progress:0,tension:0,energy:0,chapter:1,version:0},
    validation:{},pending:{structure:0,removedSymbols:0,removedLines:0,sinceCommit:0,files:{},crossLinks:0,crossFiles:{}},connections:{},intents:[],
    diagnostics:{},agents:{},agentFiles:{},agentGroups:{},collisionAt:{},
    // Construct: stable identities (survive renames), site plan, tier order and material state per module.
    salt:'',identity:{},layout:newLayout(),slots:{},moduleState:{},recentlyDeleted:[],
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
const tier=s=>meaningful(s)&&s.kind!=='property';
// Public ids are salted per project (the salt never leaves the receiver), so exported or displayed ids cannot be
// matched against guessed paths such as src/index.ts.
function pid(state,kind,key){return sha(`${state.salt||''}:${kind}:${key}`).slice(0,14);}
function originOf(state,file){if(!state.identity)state.identity={};return state.identity[file]||file;}
function moduleId(state,file){return pid(state,'m',originOf(state,file));}
function groupKey(file){const g=groupOf(file);return g==='.'?'.':g;}
function placeFile(state,file){
  const g=groupKey(file);
  return placeModule(state.layout,{id:moduleId(state,file),group:pid(state,'g',g),core:g==='.',dir:pid(state,'d',dirOf(file))});
}
// Tier slots keep their order as symbols come and go: new symbols stack on top, removed ones let the rest settle.
function updateSlots(state,file,analysis,differences,isNew){
  const mid=moduleId(state,file);const keys=analysis.symbols.filter(tier).map(x=>x.key);
  if(isNew||!state.slots[mid]){state.slots[mid]=keys;return;}
  const removed=new Set(differences.filter(d=>d.kind==='symbol.removed').map(d=>d.symbol.key));
  const present=new Set(keys);
  const kept=state.slots[mid].filter(k=>!removed.has(k)&&present.has(k));const known=new Set(kept);
  state.slots[mid]=[...kept,...keys.filter(k=>!known.has(k))];
}
function expireDeleted(state,now){
  if(!state.recentlyDeleted)state.recentlyDeleted=[];
  state.recentlyDeleted=state.recentlyDeleted.filter(d=>{
    if(now-d.ts<=RENAME_WINDOW_MS)return true;
    removeModule(state.layout,d.mid);delete state.slots[d.mid];delete state.moduleState[d.mid];return false;
  });
}
// Identity moves with a file on rename, so its building transforms in place instead of being demolished and rebuilt.
function transferIdentity(state,from,to){
  const origin=originOf(state,from);
  state.identity[to]=origin;delete state.identity[from];
  if(state.docs[from]&&!state.docs[to])state.docs[to]=state.docs[from];
  delete state.docs[from];
  state.recentlyDeleted=(state.recentlyDeleted||[]).filter(d=>d.origin!==origin);
}
function agentFor(state,event){
  const p=presence(event.meta?.provider),provider=p.id;
  const id=sha(`${provider}/${event.meta?.agent||event.sessionId||''}`).slice(0,10);
  if(!state.agents[id]){state.agents[id]={id,provider,voice:p.seat,first:event.ts,last:event.ts,events:0};state.stats.agents=Object.keys(state.agents).length;}
  const a=state.agents[id];a.last=Math.max(a.last,event.ts);a.events++;
  return a;
}
function pruneRing(ring,now){
  return (Array.isArray(ring)?ring:[]).filter(x=>now-x.ts>=0&&now-x.ts<=AGENT_ATTRIBUTION_MS);
}
function setRing(map,key,ring){if(!map)return;if(ring.length)map[key]=ring;else delete map[key];}
function writersOf(state,file,now){
  if(!state.agentFiles)state.agentFiles={};
  const ring=pruneRing(state.agentFiles[file],now);setRing(state.agentFiles,file,ring);return ring;
}
function groupWritersOf(state,file,now){
  if(!state.agentGroups)state.agentGroups={};
  const gk=groupKey(file),ring=pruneRing(state.agentGroups[gk],now);setRing(state.agentGroups,gk,ring);return ring;
}
function rememberWriter(state,file,agent,ts){
  if(!state.agentFiles)state.agentFiles={};if(!state.agentGroups)state.agentGroups={};
  const rec={agentId:agent.id,provider:agent.provider,ts};
  setRing(state.agentFiles,file,pruneRing([...(state.agentFiles[file]||[]),rec],ts));
  const gk=groupKey(file);
  setRing(state.agentGroups,gk,pruneRing([...(state.agentGroups[gk]||[]),{...rec,file}],ts));
}
function providerIds(ring){const out=[];for(const x of ring)if(x.provider&&!out.includes(x.provider))out.push(x.provider);return out.sort();}
// Collisions are between catalogued providers (engine/providers.js): 'unspecified', 'external-agent' or any other
// uncatalogued id still attributes its edits, but is not a second provider.
function castOf(ring){return (ring||[]).filter(x=>catalogued(x.provider));}
function lastWriter(ring){let best=null;for(const x of ring)if(!best||x.ts>=best.ts)best=x;return best;}
function noteCollision(state,key,ts){
  if(!state.collisionAt)state.collisionAt={};
  const prev=state.collisionAt[key];
  if(Number.isFinite(prev)&&ts-prev>=0&&ts-prev<=AGENT_ATTRIBUTION_MS)return false;
  state.collisionAt[key]=ts;
  for(const [k,t] of Object.entries(state.collisionAt))if(!Number.isFinite(t)||ts-t>AGENT_ATTRIBUTION_MS||t>ts)delete state.collisionAt[k];
  return true;
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
  // Intents are buffered on the state and collected per window by the worker (see drainIntents).
  if(!state.intents)state.intents=[];let ordinal=0;
  const intent=(type,spec)=>{state.intents.push(makeIntent(event,type,spec,ordinal++));};
  state.stats.raw++;
  if(event.sessionId){const session=state.sessions[event.sessionId]||{id:event.sessionId,start:event.ts,end:event.ts,events:0};session.start=Math.min(session.start,event.ts);session.end=Math.max(session.end,event.ts);session.events++;state.sessions[event.sessionId]=session;}
  function validation(category,passed){
    if(!VALIDATIONS.includes(category))return false;
    const previous=state.validation[category],p=state.pending;
    // Results are localized to the modules changed since the last test run: those are the ones the run speaks for.
    const covered=Object.keys(p.files||{}).slice(0,64);
    if(!passed){
      if(category==='test'){state.stats.testsFailed++;for(const mid of covered)state.moduleState[mid]='stressed';}
      state.validation[category]='fail';c(`validation.${category}.failed`,'observed',0,{fileIds:category==='test'?covered:[]});
      intent('validation.failed',{tier:2,magnitude:category==='test'?.35+.45*Math.min(1,covered.length/10):.3,evidence:'verified',subject:{fileIds:category==='test'?covered:[]},detail:{category}});
      return true;
    }
    // A green run only counts when it validates something new or recovers a failure; re-running is not progress.
    let weight=previous==='fail'?(category==='test'?3:1):0;
    if(category==='test'){
      const repaired=covered.filter(mid=>state.moduleState[mid]==='stressed').length,firstPass=state.stats.testsPassed===0;
      // Integration is validated when this run covers modules joined across districts since the previous run.
      const integrated=p.crossLinks>0&&Object.keys(p.crossFiles||{}).some(id=>p.files[id]);
      state.stats.testsPassed++;
      if(p.structure>0)weight+=0.5+Math.min(2,p.structure*0.25);
      const refactor=p.removedSymbols>=3;
      if(refactor){state.stats.milestones++;c('milestone.refactor.validated','inferred',Math.min(4,1+Math.log2(1+p.removedSymbols)),{removedSymbols:p.removedSymbols,removedLines:p.removedLines,fileIds:covered});}
      for(const mid of covered)if(state.moduleState[mid])state.moduleState[mid]='validated';
      if(previous==='fail')intent('validation.recovered',{tier:3,magnitude:.5+.4*Math.min(1,repaired/8)+(p.structure>0?.1:0),evidence:'verified',subject:{fileIds:covered},detail:{category,repaired}});
      else intent('validation.passed',{tier:p.structure>0?2:0,magnitude:p.structure>0?.25+.5*Math.min(1,p.structure/6):.05,evidence:'verified',subject:{fileIds:covered},detail:{category}});
      if(refactor)intent('refactor.validated',{tier:3,magnitude:.4+.12*Math.log2(1+p.removedSymbols),evidence:'inferred',subject:{fileIds:covered},detail:{removedSymbols:p.removedSymbols,verifiedBy:'test'}});
      // A milestone needs a verified run plus a structural reason; several reasons together are rare (tier 4).
      const kinds=[];let score=0;
      if(firstPass&&p.structure>0){kinds.push('first-validation');score+=.45;}
      if(integrated){kinds.push('integration-validated');score+=.5;}
      if(previous==='fail'&&repaired>0){kinds.push('recovery');score+=.3;}
      if(refactor){kinds.push('refactor');score+=.35;}
      if(kinds.length&&Object.keys(state.layout?.districts||{}).length>=3)score+=.15;
      if(score>=.45)intent('milestone.achieved',{tier:score>=1?4:3,magnitude:score,evidence:'verified',subject:{fileIds:covered},detail:{kinds}});
      p.structure=0;p.removedSymbols=0;p.removedLines=0;p.files={};p.crossLinks=0;p.crossFiles={};
    }else{
      if(p.structure>0)weight+=category==='build'?0.4:0.2;
      intent(previous==='fail'?'validation.recovered':'validation.passed',{tier:previous==='fail'?2:p.structure>0?1:0,magnitude:previous==='fail'?.4:p.structure>0?.2:.05,evidence:'verified',subject:{fileIds:[]},detail:{category}});
    }
    state.validation[category]='pass';c(`validation.${category}.passed`,'observed',weight,{fileIds:category==='test'?covered:[]});return true;
  }
  function emitCollision(file,fileRing){
    if(!file)return;
    let scope,ring=castOf(fileRing);
    if(providerIds(ring).length>=2)scope='file';
    else{
      ring=castOf(groupWritersOf(state,file,event.ts));
      const files=new Set(ring.map(x=>x.file).filter(Boolean));
      if(providerIds(ring).length<2||files.size<2)return;
      scope='subsystem';
    }
    const providers=providerIds(ring);
    const key=`${scope}:${scope==='file'?file:groupKey(file)}:${providers.join(',')}`;
    if(!noteCollision(state,key,event.ts))return;
    const fileId=moduleId(state,file),groupId=pid(state,'g',groupKey(file));
    const magnitude=0.4+0.2*Math.min(1,providers.length-2);
    intent('agent.collision',{tier:2,magnitude,evidence:'derived',subject:{fileId,groupId},detail:{providers,scope}});
    // An expression, not progress: like every agent cue it weighs nothing, so two agents never raise the chapter.
    c('agent.collision','observed',0,{fileId,voices:providers.map(p=>presence(p).seat),providers});
  }
  expireDeleted(state,event.ts);
  switch(event.kind) {
    case 'project.baseline':state.stats.baselines++;c('project.baseline','observed',0,{count:event.meta?.count||0,truncated:!!event.meta?.truncated});break;
    case 'document.snapshot': {
      if(!event.file||typeof event.content!=='string') break;
      const file=event.file;
      const hash=sha(event.content);
      if(state.docs[file]?.hash===hash) break;
      const analysis=analyze(file,event.content);
      const isBaseline=event.meta?.reason==='baseline';
      // A new file that closely matches one deleted moments ago is that file, renamed.
      if(!state.docs[file]&&!isBaseline){
        const keys=new Set(analysis.symbols.filter(tier).map(x=>x.key));
        const match=(state.recentlyDeleted||[]).find(d=>{if(keys.size<3||!d.keys.length)return false;const shared=d.keys.filter(k=>keys.has(k)).length;return shared/(keys.size+d.keys.length-shared)>=0.6;});
        if(match){state.identity[file]=match.origin;state.docs[file]=match.doc;state.recentlyDeleted=state.recentlyDeleted.filter(d=>d!==match);c('module.renamed','inferred',0,{fileId:moduleId(state,file)});
          intent('module.renamed',{tier:0,magnitude:.1,evidence:'inferred',subject:{fileId:moduleId(state,file)}});}
      }
      const before=state.docs[file];
      const differences=diff(before?.analysis||{symbols:[],imports:[]},analysis);
      state.docs[file]={hash,analysis};
      const newDistrict=!isBaseline&&!state.layout.districts[pid(state,'g',groupKey(file))];
      placeFile(state,file);updateSlots(state,file,analysis,differences,!before);
      const mid=moduleId(state,file);
      state.stats.files=Object.keys(state.docs).length;
      state.stats.symbols=Object.values(state.docs).reduce((n,d)=>n+d.analysis.symbols.filter(meaningful).length,0);
      state.stats.imports=Object.values(state.docs).reduce((n,d)=>n+d.analysis.imports.length,0);
      if(isBaseline){if(!state.moduleState[mid])state.moduleState[mid]='committed';c('document.baseline.indexed','observed',0,{symbols:analysis.symbols.length,imports:analysis.imports.length,parseErrors:analysis.errors});break;}
      const ring=writersOf(state,file,event.ts);
      const recent=lastWriter(ring);
      const attribution=recent?{agentId:recent.agentId,voice:state.agents[recent.agentId]?.voice??presence(recent.provider).seat,attribution:'correlated'}:{};
      const fileId=mid;
      const group=pid(state,'g',groupKey(file));const links=[];
      const changes=[];let raw=0;const created={},counts={created:0,modified:0,removed:0};
      for(const change of differences){
        if(change.symbol&&!meaningful(change.symbol))continue;
        let weight=0;
        if(change.kind==='symbol.created'){weight=CREATED[change.symbol.kind]??0.15;state.stats.created++;counts.created++;created[change.symbol.kind]=(created[change.symbol.kind]||0)+1;}
        else if(change.kind==='symbol.modified'){weight=MODIFIED[change.symbol.kind]??0.05;state.stats.modified++;counts.modified++;}
        else if(change.kind==='symbol.removed'){state.stats.removed++;state.pending.removedSymbols++;counts.removed++;}
        else if(change.kind==='dependency.added')weight=change.import.target?0.35:0.5;
        raw+=weight;changes.push({change,weight});
      }
      // Diminishing returns: a huge generated file cannot outscore careful work.
      const credit=raw>0?SNAPSHOT_CREDIT_CAP*(1-Math.exp(-raw/SNAPSHOT_CREDIT_CAP)):0,scale=raw>0?credit/raw:0;
      const max=160;
      for(const {change,weight} of changes.slice(0,max)) {
        let details;
        if(change.symbol)details={...describeSymbol(change.symbol),symbolId:pid(state,'s',`${originOf(state,file)}:${change.symbol.key}`)};
        else{
          // Internal dependencies name the module they connect to; crossing districts is integration.
          const target=resolveImport(state,change.import);
          details={dependencyId:pid(state,'p',change.import.spec),internal:!!(change.import.target||target),...(target?{targetId:moduleId(state,target),cross:groupKey(target)!==groupKey(file)}:{})};
          if(target&&change.kind==='dependency.added')links.push({targetId:details.targetId,targetGroupId:pid(state,'g',groupKey(target)),cross:details.cross});
        }
        c(change.kind,'inferred',+(weight*scale).toFixed(4),{...details,fileId,...attribution});
      }
      if(changes.length>max){for(const {change} of changes.slice(max))if(change.kind==='dependency.added'){const target=resolveImport(state,change.import);if(target)links.push({targetId:moduleId(state,target),targetGroupId:pid(state,'g',groupKey(target)),cross:groupKey(target)!==groupKey(file)});}}
      // Intents: what this snapshot changed, at what significance. Attributed only when correlated with an agent.
      const who=attribution.agentId?{agentId:attribution.agentId,voice:attribution.voice,provenance:'correlated'}:{};
      const share=credit/SNAPSHOT_CREDIT_CAP;
      if(!before&&!isBaseline)intent('module.created',{tier:1,magnitude:.3+.4*share,evidence:'observed',subject:{fileId,groupId:group,...who}});
      if(newDistrict)intent('subsystem.created',{tier:2,magnitude:.55+.25*Math.min(1,counts.created/8),evidence:'derived',subject:{groupId:group,fileId,...who}});
      if(counts.created)intent('structure.created',{tier:Object.keys(created).some(k=>BIG_KINDS.has(k))?2:1,magnitude:share,evidence:'derived',subject:{fileId,groupId:group,...who},detail:{count:counts.created,kinds:created}});
      if(counts.modified)intent('structure.modified',{tier:0,magnitude:.3*Math.min(1,counts.modified/10),evidence:'derived',subject:{fileId,groupId:group,...who},detail:{count:counts.modified}});
      if(counts.removed)intent('structure.removed',{tier:1,magnitude:.5*Math.min(1,counts.removed/6),evidence:'derived',subject:{fileId,groupId:group,...who},detail:{count:counts.removed}});
      for(const l of links){
        if(!l.cross){intent('structure.linked',{tier:0,magnitude:.15,evidence:'derived',subject:{fileId,targetId:l.targetId,groupId:group}});continue;}
        // The first connection between two districts is integration; later ones strengthen an existing route.
        const pair=[group,l.targetGroupId].sort().join('>');const first=!state.connections[pair];
        state.connections[pair]=(state.connections[pair]||0)+1;state.pending.crossLinks=(state.pending.crossLinks||0)+1;
        if(!state.pending.crossFiles)state.pending.crossFiles={};state.pending.crossFiles[fileId]=true;state.pending.crossFiles[l.targetId]=true;
        intent('subsystem.connected',{tier:first?2:1,magnitude:first?.65:.25,evidence:'derived',subject:{fileId,groupId:group,targetId:l.targetId,targetGroupId:l.targetGroupId,...who},detail:{first}});
      }
      if(changes.length>max) c('document.change.overflow','observed',0,{omitted:changes.length-max});
      if(analysis.errors) c('source.parse.diagnostics','observed',0,{errors:analysis.errors});
      state.pending.structure+=credit;state.pending.sinceCommit+=credit;
      if(changes.length){if(!state.pending.files)state.pending.files={};state.pending.files[mid]=true;
        // Editing a stressed building is a repair in progress; anything else changed is a fresh draft.
        state.moduleState[mid]=state.moduleState[mid]==='stressed'?'stressed':'draft';}
      else if(!before)state.moduleState[mid]='draft';
      if(before)state.pending.removedLines+=Math.max(0,(before.analysis.lines||0)-(analysis.lines||0));
      emitCollision(file,ring);
      break;
    }
    case 'document.change': case 'document.edits': {
      // v0.2 extensions sent one document.change per keystroke; newer ones send a per-second document.edits summary.
      const edits=event.kind==='document.edits'?(event.meta?.edits||0):(event.changes?.length||0);
      const enters=event.kind==='document.edits'?(event.meta?.insertedLines||0):(event.changes||[]).reduce((n,x)=>n+(x.insertedLines||0),0);
      state.stats.newlines+=enters;
      c('editor.change.observed','observed',0,{edits,insertedNewlines:enters,...(event.file&&state.docs[event.file]?{fileId:moduleId(state,event.file)}:{})});
      if(enters)c('editor.newline.inserted','observed',0,{count:enters});
      break;
    }
    case 'document.saved':c('document.saved','observed',0);break;
    case 'file.created':c('file.created','observed',.25);break;
    case 'file.deleted': {
      let fileId;
      if(event.file&&state.docs[event.file]){
        const doc=state.docs[event.file];fileId=moduleId(state,event.file);
        state.pending.removedSymbols+=doc.analysis.symbols.filter(meaningful).length;
        state.pending.removedLines+=doc.analysis.lines||0;
        // The building's plot is held briefly in case this is the first half of a rename.
        if(!state.recentlyDeleted)state.recentlyDeleted=[];
        state.recentlyDeleted.push({mid:fileId,origin:originOf(state,event.file),keys:doc.analysis.symbols.filter(tier).map(x=>x.key),doc,ts:event.ts});
        if(state.recentlyDeleted.length>40)state.recentlyDeleted.shift();
        delete state.docs[event.file];delete state.identity[event.file];state.stats.files=Object.keys(state.docs).length;
        if(state.pending.files)delete state.pending.files[fileId];
      }
      c('file.deleted','observed',0,fileId?{fileId}:{});
      if(fileId)intent('module.removed',{tier:1,magnitude:.3,evidence:'observed',subject:{fileId}});break;
    }
    case 'file.renamed': {
      if(event.from&&event.file&&event.from!==event.file&&(state.docs[event.from]||state.identity[event.from])){
        transferIdentity(state,event.from,event.file);
        if(state.docs[event.file])placeFile(state,event.file);
        c('module.renamed','observed',0,{fileId:moduleId(state,event.file)});
        intent('module.renamed',{tier:0,magnitude:.1,evidence:'observed',subject:{fileId:moduleId(state,event.file)}});
      }else c('file.renamed','observed',0);
      break;
    }
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
    // A commit is a checkpoint: worth little by itself, more when it captures substantial new structure.
    case 'repository.commit.observed': {
      const committed=Object.keys(state.moduleState).filter(m=>state.moduleState[m]==='draft');
      for(const m of committed)state.moduleState[m]='committed';
      c('repository.commit.observed','observed',0.2+Math.min(0.8,state.pending.sinceCommit*0.1),{fileIds:committed.slice(0,64)});
      intent('repository.checkpoint',{tier:2,magnitude:.2+.6*Math.min(1,state.pending.sinceCommit/6),evidence:'observed',subject:{fileIds:committed.slice(0,64)}});
      state.pending.sinceCommit=0;break;
    }
    case 'repository.head.changed':c('repository.head.changed','observed',0);break;
    case 'agent.prompt.submitted':case 'agent.thinking.visible':case 'agent.tool.started':case 'agent.tool.completed':case 'agent.response.completed':case 'agent.plan.visible':case 'agent.message.visible':case 'agent.file.modified':
    case 'agent.session.started':case 'agent.session.ended':case 'agent.subagent.started':case 'agent.subagent.stopped': {
      state.stats.agentEvents++;
      const agent=agentFor(state,event);
      const tool=typeof event.meta?.tool==='string'?event.meta.tool:'';
      if(event.file&&(event.kind==='agent.file.modified'||(event.kind==='agent.tool.completed'&&!READ_ONLY_TOOLS.has(tool)))){
        rememberWriter(state,event.file,agent,event.ts);
        emitCollision(event.file,writersOf(state,event.file,event.ts));
      }
      // Lifecycle from hook-reported events only; what an agent is doing is a tool category, never its arguments.
      const before={state:agent.state||null,activity:agent.activity||null};
      agent.state=nextAgentState(event.kind,agent.state);
      if(event.kind==='agent.tool.started')agent.activity=activityOf(tool,event.meta?.category);
      else if(event.kind==='agent.thinking.visible')agent.activity='reasoning (visible)';
      else if(event.kind==='agent.plan.visible')agent.activity='planning (visible)';
      else if(agent.state!=='tool')agent.activity=null;
      const touched=event.file&&state.docs[event.file]?moduleId(state,event.file):undefined;
      if(agent.state!==before.state||agent.activity!==before.activity||(touched&&event.kind==='agent.tool.started'))
        intent('agent.state',{tier:0,magnitude:event.kind==='agent.tool.started'?.2:.1,evidence:'observed',subject:{agentId:agent.id,voice:agent.voice,...(touched?{fileId:touched}:{})},
          detail:{state:agent.state,activity:agent.activity,provider:agent.provider,...(event.kind.startsWith('agent.subagent')?{subagent:true}:{})}});
      c(event.kind,'observed',0,{provider:event.meta?.provider||'unspecified',source:event.meta?.source||'hook',agentId:agent.id,voice:agent.voice,...(event.meta?.tool?{tool:String(event.meta.tool).slice(0,40)}:{}),
        ...(event.file&&state.docs[event.file]?{fileId:moduleId(state,event.file)}:{})});
      if(event.kind==='agent.tool.completed'&&typeof event.meta?.exitCode==='number')validation(categoryOf(event),event.meta.exitCode===0);
      break;
    }
    case 'workspace.started':case 'workspace.stopped':if(event.name)state.name=event.name;c(event.kind,'observed',0);break;
    case 'instrument.note':c('instrument.note','observed',0);break;
    // Reported capture settings are facts about the editor, not development activity: no cue, no intent, no growth
    // (the receiver's evidence records them). Still counted in stats.raw and in its session, like any accepted event.
    case 'workspace.settings':break;
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
  // Chapters double in cost: an intense session reaches about 4, multi-hour work 5-6, a project built over weeks 7-8.
  const previousChapter=p.chapter;
  p.chapter=1+Math.floor(Math.log2(1+p.progress/CHAPTER_UNIT));p.version++;
  // Growth into a new chapter enlarges the world; it is accumulated structure, not a claim of completion.
  if(p.chapter>previousChapter&&previousChapter>=1){if(!state.intents)state.intents=[];state.intents.push(makeIntent({id:`chapter-${p.chapter}`,ts:clock},'world.expanded',{tier:2,magnitude:.5,evidence:'derived',detail:{chapter:p.chapter}},0));}
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
// Relative imports resolve to a known file (with or without extension, or a folder's index file).
// The index is cached outside the persisted state and rebuilt when the set of files changes.
const moduleIndexes=new WeakMap();
function resolveModule(state,target){
  const files=Object.keys(state.docs);let cached=moduleIndexes.get(state);
  if(!cached||cached.docs!==state.docs||cached.size!==files.length){
    const index=new Map();for(const file of files){index.set(file.replace(/\.[^.]+$/,''),file);const m=file.match(/^(.*)\/(?:index\.[^.]+|__init__\.pyi?)$/);if(m&&!index.has(m[1]))index.set(m[1],file);}
    cached={index,docs:state.docs,size:files.length};moduleIndexes.set(state,cached);
  }
  return cached.index.get(target)||null;
}
// Workspace packages declared by package.json files in the project (monorepos), cached like the module index.
const packageIndexes=new WeakMap();
function workspacePackages(state){
  const files=Object.keys(state.docs);let cached=packageIndexes.get(state);
  if(!cached||cached.docs!==state.docs||cached.size!==files.length||cached.version!==state.stats.raw){
    const list=[];for(const f of files){const m=state.docs[f].analysis.manifest;if(m)list.push(m);}
    list.sort((a,b)=>b.name.length-a.name.length);cached={list,docs:state.docs,size:files.length,version:state.stats.raw};packageIndexes.set(state,cached);
  }
  return cached.list;
}
// An import's project file: its target, else an adapter's fallback, else a candidate path that exists in the project,
// else (for a bare specifier) the workspace package that declares that name.
function resolveImport(state,imp){
  for(const t of [imp.target,imp.alt,imp.candidate])if(t){const file=resolveModule(state,t);if(file)return file;}
  if(!imp.target&&imp.spec&&!imp.spec.startsWith('.')){
    for(const p of workspacePackages(state)){
      if(imp.spec!==p.name&&!imp.spec.startsWith(p.name+'/'))continue;
      const sub=imp.spec.slice(p.name.length+1),base=p.dir==='.'?'':p.dir+'/';
      const tries=sub?[base+sub,base+'src/'+sub]:[base+'src/index',base+'index',base+'src/main',base+'main'];
      for(const t of tries){const file=resolveModule(state,t);if(file)return file;}
      return null;
    }
  }
  return null;
}
// The worker collects the intents emitted since the last window.
function drainIntents(state){const out=state.intents||[];state.intents=[];return out;}
// Every module is shown; the remaining budget goes to the most architecturally meaningful symbols, spread
// round-robin across modules so large projects are represented evenly rather than by whichever files came first.
const KIND_RANK={'api.route':0,'ui.component':1,'class':2,'interface':3,'function':4,'method':5,'type':6,'variable':7};
const GRAPH_NODES=1400,MODULE_NODES=700,TIER_BUDGET=2400;
function publicProjection(state) {
  const files=Object.keys(state.docs).sort();
  const symbolCount=file=>state.docs[file].analysis.symbols.filter(meaningful).length;
  const shown=files.length>MODULE_NODES?files.slice().sort((a,b)=>symbolCount(b)-symbolCount(a)||a.localeCompare(b)).slice(0,MODULE_NODES).sort():files;
  const nodes=[],edges=[],queues=[],groups=new Map();
  // Tiers per building shrink as the project grows, so thousands of symbols stay legible (counts keep the totals).
  const tierCap=Math.max(3,Math.min(16,Math.floor(TIER_BUDGET/Math.max(1,shown.length))));
  for(const file of shown){
    const fileId=moduleId(state,file),symbols=state.docs[file].analysis.symbols.filter(tier);
    const placed=state.layout?.modules?.[fileId]||placeFile(state,file);
    const counts={};for(const x of symbols)counts[x.kind]=(counts[x.kind]||0)+1;
    const g=groupKey(file),gid=pid(state,'g',g);
    const group=groups.get(gid)||{id:gid,type:'group',core:g==='.',modules:0,tests:0,counts:{}};group.modules++;if(TEST_FILE.test(file))group.tests++;
    for(const [k,n] of Object.entries(counts))group.counts[k]=(group.counts[k]||0)+n;groups.set(gid,group);
    nodes.push({id:fileId,type:'module',weight:Math.min(6,Math.max(1,Math.sqrt(symbols.length))),group:gid,dir:pid(state,'d',dirOf(file)),q:placed.q,r:placed.r,
      state:state.moduleState?.[fileId]||'committed',test:TEST_FILE.test(file),lang:languageOf(file),counts});
    // Which symbols are shown is decided by importance; where each one sits in the building is its stable slot.
    const byKey=new Map(symbols.map(x=>[x.key,x]));
    const order=(state.slots?.[fileId]||symbols.map(x=>x.key)).filter(k=>byKey.has(k));
    queues.push(order.map((k,slot)=>({fileId,s:byKey.get(k),slot,origin:originOf(state,file)})).sort((a,b)=>(KIND_RANK[a.s.kind]??9)-(KIND_RANK[b.s.kind]??9)||a.slot-b.slot));
  }
  for(const g of groups.values()){const d=state.layout?.districts?.[g.id];if(d)Object.assign(g,{q:d.q,r:d.r,angle:d.angle,order:d.order});g.test=g.tests===g.modules;nodes.unshift(g);}
  // Most important symbols first, capped per building; the remaining budget is spread round-robin.
  for(let rank=0,budget=GRAPH_NODES-nodes.length;rank<tierCap&&budget>0;rank++)for(const q of queues){
    if(budget<=0)break;const item=q[rank];if(!item)continue;
    const id=pid(state,'s',`${item.origin}:${item.s.key}`);
    nodes.push({id,type:item.s.kind,weight:Math.min(4,Math.max(.5,Math.log2(2+item.s.size)/3)),parent:item.fileId,slot:item.slot});
    edges.push({a:item.fileId,b:id,kind:'contains'});budget--;
  }
  const linked=new Set(),visible=new Set(shown);
  for(const file of shown){
    const fileId=moduleId(state,file);
    for(const imp of state.docs[file].analysis.imports) {
      // Graph edges only when target is a known module, without leaking paths.
      const target=resolveImport(state,imp);
      if(!target||!visible.has(target))continue;
      const targetId=moduleId(state,target);
      if(targetId!==fileId&&!linked.has(fileId+targetId)){linked.add(fileId+targetId);edges.push({a:fileId,b:targetId,kind:'depends',cross:groupKey(target)!==groupKey(file)});}
    }
  }
  return {projectId:state.projectId,name:state.name||null,stats:state.stats,performance:state.performance,
    graph:{nodes,edges:edges.slice(0,4000)},
    frames:state.frames.slice(-100),timeline:state.timeline.slice(-500),
    sessions:Object.values(state.sessions).sort((a,b)=>b.end-a.end).slice(0,40),
    agents:Object.values(state.agents||{}).map(a=>({id:a.id,voice:a.voice,provider:a.provider,state:a.state||null,activity:a.activity||null,first:a.first,last:a.last,events:a.events})),
    updatedAt:state.frames.at(-1)?.createdAt||null};
}
module.exports={INTERPRETATION_VERSION,CHAPTER_UNIT,newState,apply,closeBatch,publicProjection,drainIntents};

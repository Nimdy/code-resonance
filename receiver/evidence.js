'use strict';
// Capture evidence: what the receiver has actually seen from each source of a project (the VS Code extension, agent
// hooks, anything else), so the Control Center states facts instead of guessing whether capture is running. Kept in the
// receiver's main thread from every accepted batch (after its journal append), persisted to <project dir>/evidence.json,
// at most one write per project every 2 s (and on stop). Existing installations have no evidence file: it is built once,
// in the background and one project at a time, by streaming events.jsonl.
// The extension does not report VS Code closing, so "started long ago, quiet since" is for the reader to treat as unknown:
// this module only records what arrived and when.
const fs=require('node:fs/promises');
const fss=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {writeAtomic}=require('./store');
const SCHEMA='code-resonance.evidence.v1';
// What extension 0.5+ reports about its own capture settings (workspace.started / workspace.settings meta).
const REPORTED_BOOLEANS=['includeHidden','captureDocumentContents','captureTerminalCommands','capturePromptText','shareProjectName'];
const REPORTED_NUMBERS=['baselineFileLimit','receiverPort'];
const REPORTED=['extensionVersion','remote',...REPORTED_BOOLEANS,...REPORTED_NUMBERS];
const MAX_PROVIDERS=32,MAX_EDITOR_SESSIONS=32;
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const label=(v,max=40)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
const time=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const count=v=>Number.isInteger(v)&&v>=0?v:0;
function emptyDoc(projectId){
  return {schema:SCHEMA,projectId,firstReceivedAt:null,lastReceivedAt:null,lastEventTs:null,events:0,
    editor:{events:0,lastAt:null,sessions:0,capture:{state:null,startedAt:null,stoppedAt:null,sessionId:null},reported:null,sessionIds:[]},
    agents:Object.create(null),other:{events:0,lastAt:null},demonstration:false};
}
function reportedOf(meta,receivedAt,kind){
  if(!isPlain(meta)||!REPORTED.some(k=>Object.hasOwn(meta,k)))return null;
  const settings={};
  for(const k of REPORTED_BOOLEANS)settings[k]=typeof meta[k]==='boolean'?meta[k]:null;
  for(const k of REPORTED_NUMBERS)settings[k]=typeof meta[k]==='number'&&Number.isFinite(meta[k])?meta[k]:null;
  return {extensionVersion:typeof meta.extensionVersion==='string'?label(meta.extensionVersion):null,remote:typeof meta.remote==='string'?label(meta.remote):null,settings,at:receivedAt,kind};
}
// One rule for live batches and for the journal rebuild, so both produce the same document. Returns whether anything a
// status display shows (capture state, reported settings, the set of agents, demonstration) changed.
function apply(doc,events,receivedAt){
  let changed=false;
  for(const e of events){
    // control.* records are the receiver's own bookkeeping (window cuts), not captured activity.
    if(!isPlain(e)||typeof e.kind!=='string'||e.kind.startsWith('control.'))continue;
    const ts=time(e.ts),sid=typeof e.sessionId==='string'?e.sessionId:'',meta=isPlain(e.meta)?e.meta:{},ed=doc.editor;
    doc.events++;
    if(doc.firstReceivedAt===null)doc.firstReceivedAt=receivedAt;
    doc.lastReceivedAt=Math.max(doc.lastReceivedAt??receivedAt,receivedAt);
    if(ts!==null)doc.lastEventTs=Math.max(doc.lastEventTs??ts,ts);
    if(!doc.demonstration&&(sid.startsWith('demo-')||meta.source==='demonstration'))doc.demonstration=changed=true;
    // A session is an editor session once it has a workspace.started: the extension sends one at capture start.
    if(e.kind==='workspace.started'){
      if(sid&&!ed.sessionIds.includes(sid)){ed.sessionIds.push(sid);if(ed.sessionIds.length>MAX_EDITOR_SESSIONS)ed.sessionIds.shift();ed.sessions++;}
      ed.capture={state:'started',startedAt:ts,stoppedAt:null,sessionId:sid||null};changed=true;
    }
    // Only the session that started the current capture can stop it (two windows may capture the same project).
    if(e.kind==='workspace.stopped'&&ed.capture.state==='started'&&ed.capture.sessionId===(sid||null)){ed.capture={...ed.capture,state:'stopped',stoppedAt:ts};changed=true;}
    if(e.kind==='workspace.started'||e.kind==='workspace.settings'){const r=reportedOf(meta,receivedAt,e.kind);if(r){ed.reported=r;changed=true;}}
    const provider=e.kind.startsWith('agent.')?label(meta.provider):'';
    if(provider&&(doc.agents[provider]||Object.keys(doc.agents).length<MAX_PROVIDERS)){
      const a=doc.agents[provider]||(changed=true,doc.agents[provider]={events:0,lastAt:receivedAt,firstAt:receivedAt,source:null});
      a.events++;a.lastAt=Math.max(a.lastAt,receivedAt);if(typeof meta.source==='string'&&meta.source)a.source=label(meta.source);
    }else if(e.kind==='workspace.started'||(sid&&ed.sessionIds.includes(sid))){ed.events++;ed.lastAt=Math.max(ed.lastAt??receivedAt,receivedAt);}
    else{doc.other.events++;doc.other.lastAt=Math.max(doc.other.lastAt??receivedAt,receivedAt);}
  }
  return changed;
}
// A stored document, checked field by field; anything structurally wrong means rebuilding from the journal instead.
function revive(raw,projectId){
  if(!isPlain(raw)||raw.schema!==SCHEMA||raw.projectId!==projectId||!isPlain(raw.editor)||!isPlain(raw.editor.capture)||!isPlain(raw.agents)||!isPlain(raw.other))return null;
  const doc=emptyDoc(projectId),ed=raw.editor,c=ed.capture;
  Object.assign(doc,{firstReceivedAt:time(raw.firstReceivedAt),lastReceivedAt:time(raw.lastReceivedAt),lastEventTs:time(raw.lastEventTs),events:count(raw.events),demonstration:raw.demonstration===true});
  doc.editor={events:count(ed.events),lastAt:time(ed.lastAt),sessions:count(ed.sessions),
    capture:{state:['started','stopped'].includes(c.state)?c.state:null,startedAt:time(c.startedAt),stoppedAt:time(c.stoppedAt),sessionId:typeof c.sessionId==='string'?c.sessionId:null},
    reported:isPlain(ed.reported)?reportedOf({...ed.reported,...(isPlain(ed.reported.settings)?ed.reported.settings:{})},time(ed.reported.at),ed.reported.kind==='workspace.settings'?'workspace.settings':'workspace.started'):null,
    sessionIds:Array.isArray(ed.sessionIds)?ed.sessionIds.filter(s=>typeof s==='string'&&s).slice(-MAX_EDITOR_SESSIONS):[]};
  for(const [k,a] of Object.entries(raw.agents).slice(0,MAX_PROVIDERS))if(label(k)===k&&k&&isPlain(a))
    doc.agents[k]={events:count(a.events),lastAt:time(a.lastAt),firstAt:time(a.firstAt),source:typeof a.source==='string'?label(a.source):null};
  doc.other={events:count(raw.other.events),lastAt:time(raw.other.lastAt)};
  return doc;
}
// The status a project list shows: when anything last arrived, the editor's capture state and version, which agents.
function compact(doc){
  if(!doc)return null;
  if(doc.building)return {building:true};
  return {lastReceivedAt:doc.lastReceivedAt,editor:{state:doc.editor.capture.state,at:doc.editor.lastAt,version:doc.editor.reported?.extensionVersion??null},
    agents:Object.entries(doc.agents).map(([provider,a])=>({provider,lastAt:a.lastAt})).sort((a,b)=>(b.lastAt||0)-(a.lastAt||0)),demonstration:doc.demonstration};
}
function createEvidence({projectDir,now=Date.now,throttleMs=2000,onChange=()=>{}}={}){
  if(typeof projectDir!=='function')throw new Error('createEvidence needs projectDir(id)');
  // projectId → {status:'loading'|'building'|'ready', doc, pending:[{events, receivedAt}], loaded, built, timer, dirty,
  // lastWriteAt, writing}. Batches that arrive while a document is loading or being built wait in `pending`.
  const entries=new Map();let stopped=false,queue=Promise.resolve();const aborts=new Set();
  const fileOf=id=>path.join(projectDir(id),'evidence.json'),journalOf=id=>path.join(projectDir(id),'events.jsonl');
  const changedSafe=id=>{try{onChange(id);}catch(e){console.warn('[resonance evidence]',e.message);}};
  function persist(id,entry){
    if(!entry.dirty||!entry.doc)return entry.writing;
    entry.dirty=false;entry.lastWriteAt=now();const text=JSON.stringify(entry.doc);
    entry.writing=(entry.writing||Promise.resolve()).then(()=>writeAtomic(fileOf(id),text)).catch(e=>console.warn('[resonance evidence] write failed:',e.message));
    return entry.writing;
  }
  function schedule(id,entry){
    entry.dirty=true;if(entry.timer||stopped)return;
    entry.timer=setTimeout(()=>{entry.timer=null;persist(id,entry);},Math.max(0,entry.lastWriteAt+throttleMs-now()));
    entry.timer.unref?.();
  }
  function ready(id,entry,doc,write=true){
    entry.doc=doc;entry.status='ready';entry.built=null;
    for(const b of entry.pending.splice(0))apply(doc,b.events,b.receivedAt);
    if(write){schedule(id,entry);changedSafe(id);}
  }
  function load(id){
    const entry={status:'loading',doc:null,pending:[],timer:null,dirty:false,lastWriteAt:0,writing:null};
    entries.set(id,entry);
    entry.loaded=(async()=>{
      let raw=null,present=false;
      try{raw=JSON.parse(await fs.readFile(fileOf(id),'utf8'));present=true;}catch(e){if(e.code!=='ENOENT'){present=true;}}
      const doc=raw&&revive(raw,id);
      if(doc){const waiting=entry.pending.length;ready(id,entry,doc,waiting>0);return;}
      if(present)console.warn(`[resonance evidence] ${id.slice(0,12)}: evidence.json is invalid; rebuilding it from the journal`);
      if(await fs.access(journalOf(id)).then(()=>true,()=>false)){entry.status='building';enqueue(id,entry);return;}
      if(entry.pending.length)ready(id,entry,emptyDoc(id));else entries.delete(id);
    })().catch(e=>{console.warn('[resonance evidence] load failed:',e.message);if(entries.get(id)===entry)entries.delete(id);});
    return entry;
  }
  // Rebuilds one project's document from its journal. Batches observed meanwhile wait in `pending`; the journal append
  // precedes observe, so the stream may already have read some of them: those are recognised by event id and not counted
  // twice. Only ids that can still belong to a pending batch are remembered: lines stamped within a minute of the newest
  // stamp read (in the journal's own clock), or at or after the oldest pending batch's stamp.
  async function build(id,entry){
    const doc=emptyDoc(id),seen=new Map();
    let input,rl,failed=null,newest=0,lines=0;
    const abort=()=>{rl?.close();input?.destroy();};aborts.add(abort);
    try{
      // A read error (the journal missing, unreadable) ends the iteration by throwing; the listeners keep it from also
      // surfacing as an unhandled 'error' event.
      input=fss.createReadStream(journalOf(id));input.on('error',e=>{failed=failed||e;});
      rl=readline.createInterface({input,crlfDelay:Infinity});rl.on('error',e=>{failed=failed||e;});
      for await(const line of rl){
        if(stopped)break;if(!line)continue;
        let e;try{e=JSON.parse(line);}catch{continue;} // a line torn by a crash
        if(!isPlain(e))continue;
        const at=time(e.receivedAt)??0;
        apply(doc,[e],at);newest=Math.max(newest,at);
        if(typeof e.id==='string'){const s=seen.get(e.id);if(s)s.n++;else seen.set(e.id,{n:1,at});}
        if(++lines%4096===0){
          const keep=entry.pending.reduce((m,b)=>Math.min(m,b.receivedAt),newest-60000);
          for(const [k,v] of seen)if(v.at<keep)seen.delete(k);
        }
      }
    }catch(e){failed=failed||e;}
    finally{aborts.delete(abort);}
    if(stopped)return;
    // No journal and nothing waiting: there is nothing to know (and no project directory to create).
    if(failed?.code==='ENOENT'&&!entry.pending.length){if(entries.get(id)===entry)entries.delete(id);entry.status='none';entry.built=null;return;}
    if(failed&&failed.code!=='ENOENT')console.warn(`[resonance evidence] ${id.slice(0,12)}: journal read failed (${failed.message}); evidence is partial`);
    for(const b of entry.pending)b.events=b.events.filter(e=>{const s=seen.get(e?.id);if(!s?.n)return true;s.n--;return false;});
    ready(id,entry,doc);
    await persist(id,entry);
  }
  function enqueue(id,entry){
    entry.built=queue=queue.then(()=>stopped?undefined:build(id,entry)).catch(e=>console.warn('[resonance evidence] rebuild failed:',e.message));
    return entry.built;
  }
  async function flush(){
    for(const [id,entry] of entries){if(entry.timer){clearTimeout(entry.timer);entry.timer=null;}persist(id,entry);}
    await Promise.all([...entries.values()].map(e=>e.writing));
  }
  return {
    // After a batch was appended to the journal; receivedAt is the stamp the batch was journaled with.
    observe(projectId,events,receivedAt){
      if(!Array.isArray(events)||!events.length||stopped)return;
      receivedAt=time(receivedAt)??now();
      const entry=entries.get(projectId)||load(projectId);
      if(entry.status!=='ready'){entry.pending.push({events,receivedAt});return;}
      if(apply(entry.doc,events,receivedAt))changedSafe(projectId);
      schedule(projectId,entry);
    },
    // The full document, {building:true} while it is being rebuilt from the journal, or null when nothing was received.
    async get(projectId){
      const entry=entries.get(projectId)||load(projectId);
      await entry.loaded;
      if(entries.get(projectId)!==entry)return null;
      return entry.status==='ready'?entry.doc:{building:true};
    },
    compact,
    // Rebuilds from events.jsonl (also used directly to recompute a document); resolves with the result.
    async backfill(projectId){
      let entry=entries.get(projectId);
      if(entry)await entry.loaded;
      entry=entries.get(projectId);
      if(!entry){entry={status:'building',doc:null,pending:[],timer:null,dirty:false,lastWriteAt:0,writing:null,loaded:Promise.resolve()};entries.set(projectId,entry);}
      else if(entry.status==='ready')entry.status='building';
      await (entry.built||enqueue(projectId,entry));
      return entry.status==='ready'?entry.doc:null;
    },
    flush,
    // Call after the last journal append has settled: later batches are no longer observed.
    async stop(){
      stopped=true;for(const abort of aborts)abort();
      await queue;await flush();
    }
  };
}
module.exports={createEvidence,compact,apply,emptyDoc,revive,SCHEMA,REPORTED};

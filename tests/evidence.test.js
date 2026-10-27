'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {sha,validateEvent}=require('../receiver/protocol');
const {translate}=require('../scripts/hooks/claude-code');
const {createEvidence,compact,SCHEMA}=require('../receiver/evidence');
const {createChanges}=require('../receiver/changes');
const {tempDir,track}=require('./helpers');
const projectId=sha('evidence-test');
const T0=Date.parse('2026-10-20T10:00:00Z');
let seq=0;
// Events as receiver/protocol.js leaves them after validation (the shape appendEvents journals).
const ev=(sessionId,kind,fields={})=>({v:1,id:`ev-${String(++seq).padStart(8,'0')}`,ts:T0+seq*1000,kind,projectId,sessionId,origin:'unknown',...fields});
// Extension 0.5 reports its capture settings in workspace.started / workspace.settings (protocol.js allowlists them).
const REPORTED={extensionVersion:'0.5.0',remote:'',includeHidden:false,captureDocumentContents:true,captureTerminalCommands:false,capturePromptText:false,shareProjectName:true,baselineFileLimit:2000,receiverPort:4174};
function extensionSession(sessionId,{reported=true}={}){
  return [
    [ev(sessionId,'workspace.started',{name:'my-app',...(reported?{meta:REPORTED}:{})}),ev(sessionId,'project.baseline',{meta:{count:2,truncated:false}}),
      ev(sessionId,'document.snapshot',{file:'src/a.ts',contentHash:'a'.repeat(64),meta:{reason:'baseline'}})],
    [ev(sessionId,'document.edits',{file:'src/a.ts',meta:{edits:3,insertedChars:20,removedChars:0,insertedLines:1,removedLines:0,windowMs:900}}),
      ev(sessionId,'terminal.command.finished',{meta:{category:'test',exitCode:0}}),
      // A manual prompt recorded through the extension's command has no provider: it is editor activity.
      ev(sessionId,'agent.prompt.submitted',{meta:{fingerprint:'f'.repeat(20),length:12,source:'manual'}})],
    ...(reported?[[ev(sessionId,'workspace.settings',{meta:{...REPORTED,captureTerminalCommands:true}})]]:[]),
    [ev(sessionId,'workspace.stopped')]
  ];
}
function claudeBatches(cwd){
  const inputs=[{hook_event_name:'SessionStart',session_id:'s1',source:'startup',cwd},{hook_event_name:'UserPromptSubmit',session_id:'s1',prompt:'secret prompt',cwd},
    {hook_event_name:'PreToolUse',session_id:'s1',tool_name:'Edit',tool_use_id:'t1',tool_input:{file_path:path.join(cwd,'src/a.ts')},cwd},
    {hook_event_name:'PostToolUse',session_id:'s1',tool_name:'Edit',tool_use_id:'t1',tool_input:{file_path:path.join(cwd,'src/a.ts')},cwd},
    {hook_event_name:'SubagentStart',session_id:'s1',agent_id:'sub1',agent_type:'Explore',cwd},{hook_event_name:'Stop',session_id:'s1',last_assistant_message:'done',cwd}];
  return inputs.map((input,i)=>translate(input,T0+i*500).map(e=>validateEvent({...e,id:`cc-${String(++seq).padStart(12,'0')}`,projectId})));
}
// scripts/demo.js: a demo-<time> session with fictional agents marked as a demonstration.
function demoBatches(){
  const sid=`demo-${T0}`,AGENT={provider:'demo (fictional)',source:'demonstration',agent:'demo-agent-a'};
  return [[ev(sid,'workspace.started',{name:'demo-orbit-notes'}),ev(sid,'project.baseline',{meta:{count:0,truncated:false}})],
    [ev(sid,'agent.prompt.submitted',{origin:'hook',meta:{...AGENT,length:64,fingerprint:'demo-no-raw-prompt'}}),ev(sid,'agent.tool.started',{origin:'hook',file:'src/a.ts',meta:{...AGENT,tool:'Edit'}})],
    [ev(sid,'document.snapshot',{file:'src/a.ts',contentHash:'b'.repeat(64),meta:{reason:'external',source:'filesystem-watcher'}}),ev(sid,'workspace.stopped')]];
}
// Test harnesses and scripts/event.js: no workspace.started, no provider.
const harnessBatches=()=>[[ev('rx','document.saved',{file:'src/a.ts'}),ev('rx','workspace.stopped'),ev('rx','agent.tool.started',{meta:{tool:'Edit'}})],[ev('','document.saved',{file:'src/b.ts'})]];
async function setup(t,options={}){
  const dataDir=tempDir(t,'cr-evidence-');
  const projectDir=id=>path.join(dataDir,'projects',sha(id));
  const changes=[];
  const evidence=createEvidence({projectDir,onChange:id=>changes.push(id),...options});
  // Stopped before its directory is removed: stop() writes the evidence out (and would recreate the directory).
  track(t,evidence);
  const dir=projectDir(projectId);await fs.mkdir(dir,{recursive:true});
  let receivedAt=T0+10_000_000;
  // What appendEvents does: journal first (content already replaced by its hash), then observe.
  async function append(events,{observe=true}={}){
    receivedAt+=250;
    await fs.appendFile(path.join(dir,'events.jsonl'),events.map(e=>JSON.stringify({...e,receivedAt})).join('\n')+'\n');
    if(observe)evidence.observe(projectId,events,receivedAt);
    return receivedAt;
  }
  return {dataDir,dir,evidence,append,changes,file:path.join(dir,'evidence.json')};
}
const plain=v=>JSON.parse(JSON.stringify(v));
async function ready(evidence,id=projectId){for(let i=0;i<500;i++){const d=await evidence.get(id);if(d&&!d.building)return d;await new Promise(r=>setTimeout(r,10));}throw new Error('evidence never became ready');}
test('An extension session with reported settings: editor events, capture state and the reported settings',async t=>{
  const {evidence,append,changes}=await setup(t);
  const batches=extensionSession('11111111-2222-4333-8444-555555555555');
  // The first batch makes the receiver load (or build) this project's document; batches arriving during that wait and are
  // announced once with it. Waiting for the document first makes the later capture changes arrive one by one.
  const stamps=[await append(batches[0])];await ready(evidence);const before=changes.length;
  for(const b of batches.slice(1))stamps.push(await append(b));
  const doc=await ready(evidence);
  const started=batches[0][0],stopped=batches.at(-1)[0];
  // The shape the receiver journals: protocol.js keeps every reported key on workspace.started.
  assert.deepEqual(validateEvent(started).meta,REPORTED);
  assert.equal(doc.schema,SCHEMA);assert.equal(doc.projectId,projectId);
  assert.equal(doc.events,8);assert.equal(doc.editor.events,8);assert.equal(doc.other.events,0);assert.deepEqual(plain(doc.agents),{});
  assert.equal(doc.firstReceivedAt,stamps[0]);assert.equal(doc.lastReceivedAt,stamps.at(-1));assert.equal(doc.lastEventTs,stopped.ts);
  assert.equal(doc.editor.sessions,1);assert.equal(doc.editor.lastAt,stamps.at(-1));
  assert.deepEqual(doc.editor.capture,{state:'stopped',startedAt:started.ts,stoppedAt:stopped.ts,sessionId:started.sessionId});
  assert.deepEqual(doc.editor.reported,{extensionVersion:'0.5.0',remote:'',settings:{includeHidden:false,captureDocumentContents:true,captureTerminalCommands:true,
    capturePromptText:false,shareProjectName:true,baselineFileLimit:2000,receiverPort:4174},at:stamps[2],kind:'workspace.settings'});
  assert.equal(doc.demonstration,false);
  assert.deepEqual(compact(doc),{lastReceivedAt:stamps.at(-1),editor:{state:'stopped',at:stamps.at(-1),version:'0.5.0'},agents:[],demonstration:false});
  assert.ok(before>=1,'the first document is announced');assert.ok(changes.length-before>=2,`each later capture change is announced (settings reported, stopped): ${changes.length-before}`);
  // Nothing private: no file names, folder names or prompt text in the document.
  assert.doesNotMatch(JSON.stringify(doc),/src\/a\.ts|my-app|secret/);
});
test('An extension without reported settings, and two windows capturing the same project',async t=>{
  const {evidence,append}=await setup(t);
  const [first,second]=extensionSession('aaaaaaaa-0000-4000-8000-000000000001',{reported:false});
  await append(first);await append(second);
  let doc=await ready(evidence);
  assert.equal(doc.editor.reported,null);assert.equal(doc.editor.capture.state,'started');assert.equal(compact(doc).editor.version,null);
  // A second window starts its own session; the first one stopping does not stop the capture that is running.
  const other='bbbbbbbb-0000-4000-8000-000000000002';
  await append([ev(other,'workspace.started',{name:'my-app'})]);await append([ev('aaaaaaaa-0000-4000-8000-000000000001','workspace.stopped')]);
  doc=await evidence.get(projectId);
  assert.equal(doc.editor.sessions,2);assert.equal(doc.editor.capture.state,'started');assert.equal(doc.editor.capture.sessionId,other);assert.equal(doc.editor.events,8);
  await append([ev(other,'workspace.stopped')]);
  assert.equal((await evidence.get(projectId)).editor.capture.state,'stopped');
});
test('Claude Code hook events count under their provider; harness events with no workspace.started are "other"',async t=>{
  const {evidence,append,dataDir}=await setup(t);
  const hooks=claudeBatches(dataDir);for(const b of hooks)await append(b);
  for(const b of harnessBatches())await append(b);
  const doc=await ready(evidence);
  const hookEvents=hooks.flat().length;
  assert.equal(hookEvents,7);
  assert.deepEqual(Object.keys(doc.agents),['claude-code']);
  assert.equal(doc.agents['claude-code'].events,hookEvents);assert.equal(doc.agents['claude-code'].source,'claude-code-hook');
  assert.ok(doc.agents['claude-code'].firstAt<doc.agents['claude-code'].lastAt);
  // The harness's workspace.stopped (no started) and its provider-less agent event are neither editor nor agent.
  assert.equal(doc.other.events,4);assert.equal(doc.editor.events,0);assert.equal(doc.editor.capture.state,null);
  assert.equal(doc.events,hookEvents+4);assert.equal(doc.demonstration,false);
  assert.deepEqual(compact(doc).agents,[{provider:'claude-code',lastAt:doc.agents['claude-code'].lastAt}]);
  assert.doesNotMatch(JSON.stringify(doc),/secret prompt|src\/a\.ts/);
});
test('Demonstration events are flagged; their fictional agents keep their provider',async t=>{
  const {evidence,append}=await setup(t);
  for(const b of demoBatches())await append(b);
  const doc=await ready(evidence);
  assert.equal(doc.demonstration,true);
  assert.deepEqual(plain(doc.agents),{'demo (fictional)':{events:2,lastAt:doc.agents['demo (fictional)'].lastAt,firstAt:doc.agents['demo (fictional)'].firstAt,source:'demonstration'}});
  assert.equal(doc.editor.events,4);assert.equal(doc.editor.capture.state,'stopped');assert.equal(compact(doc).demonstration,true);
  // meta.source alone marks a demonstration too.
  const second=await setup(t);await second.append([ev('x1','document.saved',{meta:{source:'demonstration'}})]);
  assert.equal((await ready(second.evidence)).demonstration,true);
});
test('A rebuild from events.jsonl equals incremental observation (torn lines and receiver records ignored)',async t=>{
  const live=await setup(t);
  const all=[...extensionSession('cccccccc-0000-4000-8000-000000000003'),...claudeBatches(live.dataDir),...demoBatches(),...harnessBatches()];
  for(const b of all)await live.append(b);
  // The receiver's own window-cut record and a line torn by a crash are in real journals too.
  await fs.appendFile(path.join(live.dir,'events.jsonl'),JSON.stringify({v:1,id:'control-x',ts:T0,kind:'control.window.close',projectId,receivedAt:T0+20_000_000})+'\n{"v":1,"id":"torn\n');
  live.evidence.observe(projectId,[{v:1,id:'control-x',ts:T0,kind:'control.window.close',projectId}],T0+20_000_000);
  const incremental=plain(await ready(live.evidence));
  await live.evidence.flush();
  // A second receiver on a copy of the journal without evidence.json (an existing installation) rebuilds it.
  const copy=await setup(t);
  await fs.copyFile(path.join(live.dir,'events.jsonl'),path.join(copy.dir,'events.jsonl'));
  assert.deepEqual(await copy.evidence.get(projectId),{building:true});
  assert.deepEqual(compact({building:true}),{building:true});
  const rebuilt=plain(await ready(copy.evidence));
  assert.deepEqual(rebuilt,incremental);
  assert.equal(rebuilt.events,all.flat().length);
  // The rebuilt document is persisted once built, and the explicit backfill() recomputes the same thing.
  await copy.evidence.flush();
  assert.deepEqual(JSON.parse(await fs.readFile(copy.file,'utf8')),incremental);
  assert.deepEqual(plain(await copy.evidence.backfill(projectId)),incremental);
  assert.deepEqual(JSON.parse(await fs.readFile(live.file,'utf8')),incremental);
});
test('Batches that arrive while the journal is being rebuilt are counted exactly once',async t=>{
  const {evidence,append}=await setup(t);
  const sid='dddddddd-0000-4000-8000-000000000004';
  // A large existing journal (no evidence.json), written without observing: the receiver predates evidence.
  await append([ev(sid,'workspace.started',{meta:REPORTED})],{observe:false});
  for(let i=0;i<40;i++)await append(Array.from({length:100},()=>ev(sid,'document.edits',{file:'src/a.ts',meta:{edits:1}})),{observe:false});
  assert.deepEqual(await evidence.get(projectId),{building:true});
  // Live batches while the rebuild streams: journaled, then observed (the stream may or may not have read them).
  for(let i=0;i<5;i++)await append([ev(sid,'document.saved',{file:'src/a.ts'}),ev(sid,'document.saved',{file:'src/b.ts'})]);
  const doc=await ready(evidence);
  assert.equal(doc.events,1+4000+10);assert.equal(doc.editor.events,4011);assert.equal(doc.other.events,0);
});
test('Persistence is throttled per project, flushed on demand and on stop; an invalid file is rebuilt',async t=>{
  const warn=console.warn;console.warn=()=>{};t.after(()=>{console.warn=warn;});
  const {evidence,append,file,dataDir,dir}=await setup(t,{throttleMs:400});
  const read=async()=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}};
  const sid='eeeeeeee-0000-4000-8000-000000000005';
  await append([ev(sid,'workspace.started')]);
  await ready(evidence);
  for(let i=0;i<50&&!(await read());i++)await new Promise(r=>setTimeout(r,10));
  assert.equal((await read()).events,1); // the first write is immediate
  await append([ev(sid,'document.saved',{file:'src/a.ts'})]);await append([ev(sid,'document.saved',{file:'src/a.ts'})]);
  assert.equal((await read()).events,1); // within the 400 ms window: not yet written
  await new Promise(r=>setTimeout(r,600));
  assert.equal((await read()).events,3); // one trailing write carries both batches
  await append([ev(sid,'workspace.stopped')]);
  await evidence.flush();
  assert.equal((await read()).events,4);
  assert.deepEqual((await fs.readdir(dir)).filter(n=>n.endsWith('.tmp')),[]);
  await append([ev(sid,'document.saved',{file:'src/a.ts'})]);
  await evidence.stop();
  assert.equal((await read()).events,5);
  // A restarted receiver continues from the stored document.
  const again=createEvidence({projectDir:id=>path.join(dataDir,'projects',sha(id))});t.after(()=>again.stop());
  const late=ev(sid,'document.saved',{file:'src/a.ts'});
  await fs.appendFile(path.join(dir,'events.jsonl'),JSON.stringify({...late,receivedAt:T0+30_000_000})+'\n');
  again.observe(projectId,[late],T0+30_000_000);
  const doc=await ready(again);assert.equal(doc.events,6);assert.equal(doc.editor.events,6);assert.equal(doc.editor.capture.state,'stopped');
  await again.flush();
  // A corrupted evidence.json is rebuilt from the journal rather than trusted.
  await fs.writeFile(file,'{"schema":"code-resonance.evidence.v1","projectId":"x"');
  const third=createEvidence({projectDir:id=>path.join(dataDir,'projects',sha(id))});t.after(()=>third.stop());
  assert.deepEqual(await third.get(projectId),{building:true});
  const rebuilt=await ready(third);assert.equal(rebuilt.events,6);
  // A project nothing was received for has no evidence.
  assert.equal(await third.get(sha('never-seen')),null);
  assert.equal(await third.backfill(sha('never-seen')),null);
  await assert.rejects(fs.access(path.join(dataDir,'projects',sha(sha('never-seen')))));
});
// ---- GET /api/changes (receiver/changes.js), over a real HTTP server.
async function sse(t,options){
  const changes=createChanges(options);
  const server=http.createServer((req,res)=>changes.handle(req,res,{revision:{settings:3,presets:1}}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{changes.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
  function connect(){
    return new Promise((resolve,reject)=>{
      const req=http.get({host:'127.0.0.1',port:server.address().port,path:'/api/changes'},res=>{
        const client={res,req,status:res.statusCode,headers:res.headers,text:'',waiters:[]};
        res.setEncoding('utf8');res.on('data',s=>{client.text+=s;for(const w of client.waiters.splice(0))w();});
        client.until=async(fn,ms=3000)=>{const end=Date.now()+ms;while(!fn(client.text)){if(Date.now()>end)throw new Error('timeout: '+client.text);await new Promise(r=>{client.waiters.push(r);setTimeout(r,20);});}};
        client.messages=()=>client.text.split('\n\n').filter(m=>/^data: /m.test(m)&&!/^event:/m.test(m)).map(m=>JSON.parse(/^data: (.*)$/m.exec(m)[1]));
        client.close=()=>{req.destroy();};
        resolve(client);
      });req.on('error',reject);
    });
  }
  return {changes,connect};
}
const until=async(fn,ms=3000)=>{const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw new Error('timeout');await new Promise(r=>setTimeout(r,10));}};
test('Change stream: hello on connect, no-store event-stream headers, then every emitted change',async t=>{
  const {changes,connect}=await sse(t,{});
  const a=await connect(),b=await connect();
  assert.equal(a.status,200);assert.match(a.headers['content-type'],/^text\/event-stream/);assert.equal(a.headers['cache-control'],'no-store');
  await a.until(s=>s.includes('event: hello'));
  const hello=JSON.parse(/event: hello\ndata: (.*)\n/.exec(a.text)[1]);
  assert.deepEqual(hello.revision,{settings:3,presets:1});assert.ok(Math.abs(hello.at-Date.now())<5000);
  await until(()=>changes.count()===2);
  changes.emit('settings',{revision:4});changes.emit('recipe',{projectId,revision:7});changes.emit('packs');
  for(const c of [a,b]){
    await c.until(s=>s.includes('"packs"'));
    assert.deepEqual(c.messages(),[{revision:4,type:'settings'},{projectId,revision:7,type:'recipe'},{type:'packs'}]);
  }
  // A message cannot change its own type.
  changes.emit('presets',{type:'settings',revision:2});await a.until(s=>s.includes('"type":"presets"'));assert.equal(a.messages().at(-1).type,'presets');
});
test('Change stream: at most max clients, heartbeat comments, closed clients removed',async t=>{
  const {changes,connect}=await sse(t,{max:2,heartbeatMs:50});
  const a=await connect(),b=await connect();
  const refused=await connect();
  assert.equal(refused.status,503);await refused.until(s=>s.includes('}'));assert.equal(JSON.parse(refused.text).code,'too-many-clients');
  await until(()=>changes.count()===2);
  await a.until(s=>s.includes(':\n\n'));await b.until(s=>s.includes(':\n\n'));
  a.close();
  await until(()=>changes.count()===1);
  const c=await connect();assert.equal(c.status,200);await until(()=>changes.count()===2);
  changes.emit('settings',{revision:9});await c.until(s=>s.includes('"revision":9'));
  // close() ends every stream and refuses new listeners.
  changes.close();await until(()=>changes.count()===0);
  if(!b.res.readableEnded)await new Promise(r=>b.res.once('end',r));
  assert.equal((await connect()).status,503);
});
test('Change stream: activity is limited to one message per second per project, ending with the latest stamp',async t=>{
  const {changes,connect}=await sse(t,{activityMs:200});
  changes.throttledActivity(projectId,1); // nobody listening: nothing is kept
  const a=await connect();await until(()=>changes.count()===1);
  const other=sha('other-project');
  for(let i=1;i<=10;i++)changes.throttledActivity(projectId,1000+i);
  changes.throttledActivity(other,5000);
  await a.until(s=>s.includes('1010'),2000);
  const activity=()=>a.messages().filter(m=>m.type==='activity');
  assert.deepEqual(activity(),[{projectId,receivedAt:1001,type:'activity'},{projectId:other,receivedAt:5000,type:'activity'},{projectId,receivedAt:1010,type:'activity'}]);
  await new Promise(r=>setTimeout(r,300));
  assert.equal(activity().length,3);
  changes.throttledActivity(projectId,2000);await a.until(s=>s.includes('2000'));
});

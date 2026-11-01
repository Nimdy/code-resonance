'use strict';
// Extension 0.5: capture settings reported in workspace events, the settings URI handler, and what the receiver and the
// reducer do with them. The extension runs against a minimal in-process fake of the `vscode` API and a recording outbox
// (no network, no ~/.code-resonance); the receiver part posts the extension's real events to a temporary receiver.
const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module'),fs=require('node:fs/promises'),path=require('node:path');
const {validateEvent,sha,VALID_KINDS}=require('../receiver/protocol');
const {newState,apply,closeBatch}=require('../engine/reducer');
const {tempDir,startService}=require('./helpers');
const EXTENSION=require.resolve('../extension/extension');
const VERSION=require('../extension/package.json').version;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function emitter(){const fns=new Set();const on=fn=>{fns.add(fn);return {dispose:()=>fns.delete(fn)};};on.fire=x=>{for(const fn of [...fns])fn(x);};on.size=()=>fns.size;return on;}
function fakeVscode(dir,{remoteName,settings={}}={}){
  const config={receiverPort:4174,baselineFileLimit:450,includeHidden:false,captureDocumentContents:true,captureTerminalCommands:false,capturePromptText:false,shareProjectName:true,...settings};
  const folderUri={scheme:'file',fsPath:path.join(dir,'my-secret-folder'),toString:()=>'file:///work/my-secret-folder'};
  const executed=[],uriHandlers=[],commands=new Map(),onConfig=emitter(),none=()=>({dispose(){}});
  const vscode={
    version:'1.99.0',env:{remoteName,openExternal:async()=>true},Uri:{parse:s=>({toString:()=>s})},
    StatusBarAlignment:{Left:1},DiagnosticSeverity:{Error:0,Warning:1},RelativePattern:class{constructor(b,p){this.base=b;this.pattern=p;}},
    ProgressLocation:{Window:10,Notification:15},
    window:{createStatusBarItem:()=>({show(){},dispose(){}}),showWarningMessage:async()=>'Start Capture',showInformationMessage:async()=>{},showQuickPick:async()=>null,
      createOutputChannel:()=>({appendLine(){},dispose(){}}),withProgress:async(o,fn)=>fn(),
      registerUriHandler:h=>{uriHandlers.push(h);return {dispose(){}};}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return {dispose(){}};},executeCommand:async(...args)=>{executed.push(args);}},
    workspace:{isTrusted:true,workspaceFolders:[{uri:folderUri,name:'my-secret-folder',index:0}],
      getConfiguration:section=>{assert.equal(section,'resonance');return {get:(k,d)=>Object.hasOwn(config,k)?config[k]:d};},
      onDidChangeConfiguration:onConfig,onDidChangeTextDocument:none,onDidSaveTextDocument:none,onDidCreateFiles:none,onDidDeleteFiles:none,onDidRenameFiles:none,
      createFileSystemWatcher:()=>({onDidChange:none,onDidCreate:none,onDidDelete:none,dispose(){}}),findFiles:async()=>[],getWorkspaceFolder:()=>null,fs:{readFile:async()=>Buffer.alloc(0)},
      registerTextDocumentContentProvider:()=>({dispose(){}})},
    tasks:{onDidStartTask:none,onDidEndTaskProcess:none},languages:{onDidChangeDiagnostics:none,getDiagnostics:()=>[]},extensions:{getExtension:()=>undefined}
  };
  // A configuration change event as VS Code delivers it: the listener asks which sections it touched.
  const change=(patch,section='resonance')=>{Object.assign(config,patch);onConfig.fire({affectsConfiguration:s=>s===section||section.startsWith(`${s}.`)});};
  return {vscode,config,change,executed,uriHandlers,commands,onConfig};
}
// Loads a fresh copy of extension.js wired to the fake API; the outbox records instead of delivering, and the receiver
// host only records what it was asked (no port is probed, no receiver started, no data directory read).
function loadExtension(t,dir,opts){
  const fake=fakeVscode(dir,opts),sent=[],outboxes=[],ensured=[];
  class RecordingOutbox{constructor(o){this.port=o.port;this.authFile=o.authFile;this.online=true;outboxes.push(this);}async start(){}enqueue(e){sent.push(JSON.parse(JSON.stringify(e)));return true;}async close(){this.closed=true;}}
  const realHost=require('../extension/receiver-host');
  const fakeHost={...realHost,dataDir:()=>path.join(dir,'data'),findRuntime:()=>null,bundled:()=>null,
    ensureReceiver:async o=>{ensured.push({port:o.port,dir:o.dir,start:o.start});return {status:'absent',port:o.port};}};
  const load=Module._load;
  Module._load=function(request,parent,isMain){
    if(request==='vscode')return fake.vscode;
    if(request==='./outbox'&&parent?.filename===EXTENSION)return {DurableOutbox:RecordingOutbox};
    if(request==='./receiver-host'&&parent?.filename===EXTENSION)return fakeHost;
    return load.call(this,request,parent,isMain);
  };
  delete require.cache[EXTENSION];
  let ext;try{ext=require(EXTENSION);}finally{Module._load=load;}
  delete require.cache[EXTENSION];
  const state=new Map();
  const context={subscriptions:[],globalStorageUri:{fsPath:path.join(dir,'storage')},workspaceState:{get:(k,d)=>state.has(k)?state.get(k):d,update:async(k,v)=>{state.set(k,v);}}};
  ext.activate(context);
  t.after(()=>ext.deactivate());
  const run=id=>fake.commands.get(id)();
  return {...fake,ext,context,sent,outboxes,ensured,run,kinds:()=>sent.map(e=>e.kind)};
}
const REPORTED=['extensionVersion','remote','includeHidden','captureDocumentContents','captureTerminalCommands','capturePromptText','shareProjectName','baselineFileLimit','receiverPort'];
test('workspace.started reports the extension version, remote and every capture setting (values only, no paths)',async t=>{
  const dir=tempDir(t,'cr-ext-settings-');
  const x=loadExtension(t,dir,{remoteName:'wsl',settings:{includeHidden:true,captureTerminalCommands:true,baselineFileLimit:120,receiverPort:4199}});
  await x.run('resonance.start');
  const started=x.sent.find(e=>e.kind==='workspace.started');assert(started,x.kinds().join(','));
  assert.deepEqual(started.meta,{extensionVersion:VERSION,remote:'wsl',includeHidden:true,captureDocumentContents:true,captureTerminalCommands:true,
    capturePromptText:false,shareProjectName:true,baselineFileLimit:120,receiverPort:4199});
  assert.equal(VERSION,'0.8.1');assert.equal(started.name,'my-secret-folder');
  assert.equal(x.outboxes[0].port,4199,'the reported port is the one the capture delivers to');
  assert.deepEqual(x.ensured,[{port:4199,dir:path.join(dir,'data'),start:true}],'starting capture looks for (or starts) a receiver on that port, in the data directory');
  assert.equal(x.outboxes[0].authFile,path.join(dir,'data','receiver-auth.json'),'the outbox reads the token of that data directory');
  const meta=JSON.stringify(started.meta);assert(!meta.includes('my-secret-folder')&&!meta.includes(dir),'no folder name or path in the reported settings');
});
test('Local window: remote is an empty string; shareProjectName off drops the name but still reports the setting',async t=>{
  const x=loadExtension(t,tempDir(t,'cr-ext-settings-'),{settings:{shareProjectName:false}});
  await x.run('resonance.start');
  const started=x.sent.find(e=>e.kind==='workspace.started');
  assert.equal(started.meta.remote,'');assert.equal(started.meta.shareProjectName,false);assert.equal(started.name,undefined);
});
test('A settings change while capturing sends one debounced workspace.settings event; unrelated or no-op changes send none',async t=>{
  const x=loadExtension(t,tempDir(t,'cr-ext-settings-'));
  assert.equal(x.onConfig.size(),0,'nothing listens before capture starts');
  await x.run('resonance.start');
  const settings=()=>x.sent.filter(e=>e.kind==='workspace.settings');
  // A burst (one event per key, as VS Code fires them) collapses into one event carrying the final values.
  x.change({includeHidden:true});await sleep(200);x.change({capturePromptText:true});await sleep(200);x.change({baselineFileLimit:50});
  await sleep(300);assert.equal(settings().length,0,'still inside the 500 ms quiet period');
  await sleep(450);assert.equal(settings().length,1);
  const ev=settings()[0];
  assert.deepEqual(Object.keys(ev.meta).sort(),[...REPORTED].sort());
  assert.equal(ev.meta.includeHidden,true);assert.equal(ev.meta.capturePromptText,true);assert.equal(ev.meta.baselineFileLimit,50);
  assert.equal(ev.sessionId,x.sent.find(e=>e.kind==='workspace.started').sessionId,'same capture session');
  x.change({},'editor');await sleep(650);assert.equal(settings().length,1,'another extension\'s settings are not reported');
  x.change({includeHidden:true});await sleep(650);assert.equal(settings().length,1,'unchanged values are not re-sent');
  // The receiver port is reported as delivered-to, so changing it mid-capture changes nothing that is reported.
  x.change({receiverPort:5000});await sleep(650);assert.equal(settings().length,1);
  // A change pending at stop is dropped with the capture; after stop nothing listens.
  x.change({captureDocumentContents:false});await x.run('resonance.stop');
  await sleep(650);assert.equal(settings().length,1);assert.equal(x.onConfig.size(),0);
  assert.equal(x.kinds().at(-1),'workspace.stopped');
});
test('The settings URI only opens this extension\'s settings; any other path does nothing',async t=>{
  const x=loadExtension(t,tempDir(t,'cr-ext-settings-'));
  assert.equal(x.uriHandlers.length,1);
  await x.uriHandlers[0].handleUri({scheme:'vscode',authority:'zerobandwidth.code-resonance',path:'/settings',query:''});
  assert.deepEqual(x.executed,[['workbench.action.openSettings','@ext:zerobandwidth.code-resonance']]);
  for(const p of ['/start','/settings/x','/','']) await x.uriHandlers[0].handleUri({path:p,query:'start=1'});
  assert.equal(x.executed.length,1);assert.equal(x.sent.length,0,'a link never starts capture');
  const pkg=require('../extension/package.json');assert(pkg.activationEvents.includes('onUri'));assert.equal(pkg.publisher+'.'+pkg.name,'zerobandwidth.code-resonance');
});
const projectId=sha('extension-settings');
const base=(kind,meta,i=1)=>({v:1,id:`ext-settings-${kind}-${i}`,ts:1750000000000+i,kind,projectId,sessionId:'s1',meta});
test('validateEvent keeps the reported keys with their declared types, only on workspace events, and drops everything else',()=>{
  assert(VALID_KINDS.has('workspace.settings'));
  const good={extensionVersion:'0.5.0',remote:'ssh-remote',includeHidden:false,captureDocumentContents:true,captureTerminalCommands:false,capturePromptText:false,shareProjectName:true,baselineFileLimit:450,receiverPort:4174};
  for(const kind of ['workspace.started','workspace.settings'])assert.deepEqual(validateEvent(base(kind,{...good,folder:'/home/ana/x',token:'abc',nested:{a:1}})).meta,good);
  const bad=validateEvent(base('workspace.settings',{extensionVersion:5,remote:true,includeHidden:'true',captureDocumentContents:1,captureTerminalCommands:null,
    capturePromptText:[true],shareProjectName:{},baselineFileLimit:'450',receiverPort:Infinity}));
  assert.deepEqual(bad.meta,{},'a wrongly typed setting is dropped, never coerced');
  assert.equal(validateEvent(base('workspace.settings',{extensionVersion:'x'.repeat(500),remote:'a\0b'})).meta.extensionVersion.length,64);
  assert.equal(validateEvent(base('workspace.settings',{remote:'a\0b'})).meta.remote,'ab');
  assert.deepEqual(validateEvent(base('document.saved',{...good,reason:'x'})).meta,{reason:'x'},'settings keys are not accepted on other kinds');
  // Pre-0.5 events validate exactly as before.
  assert.deepEqual(validateEvent(base('workspace.started',{count:1})),{v:1,id:'ext-settings-workspace.started-1',ts:1750000000001,kind:'workspace.started',projectId,sessionId:'s1',origin:'unknown',meta:{count:1}});
});
test('workspace.settings produces no cue, intent or growth, and leaves the interpretation of the rest unchanged',()=>{
  const evts=[base('workspace.started',{extensionVersion:'0.5.0'},1),
    {...base('document.snapshot',{reason:'edit'},2),file:'src/a.ts',content:'export function a(){return 1}'},
    base('task.finished',{taskName:'npm test',category:'test',exitCode:0},4)];
  const settings=base('workspace.settings',{includeHidden:true,receiverPort:4174},3);
  const run=list=>{const state=newState(projectId);const cues=list.flatMap(e=>apply(state,validateEvent(e)));return {state,cues,frame:closeBatch(state,cues),intents:state.intents.length};};
  const state=newState(projectId);
  assert.deepEqual(apply(state,validateEvent(settings)),[]);assert.equal(state.intents.length,0);assert.equal(state.performance.progress,0);
  const without=run(evts),withSettings=run([evts[0],evts[1],settings,evts[2]]);
  assert.deepEqual(withSettings.cues.map(c=>c.type),without.cues.map(c=>c.type));
  assert.equal(withSettings.intents,without.intents);assert.equal(withSettings.state.performance.progress,without.state.performance.progress);
  assert.equal(withSettings.state.stats.raw,without.state.stats.raw+1,'still an accepted, counted event');
  assert.deepEqual(run([evts[0],evts[1],settings,evts[2]]).cues,withSettings.cues,'deterministic');
});
test('The receiver accepts the extension\'s real workspace events and journals the reported settings',async t=>{
  const dir=tempDir(t,'cr-ext-settings-');
  const x=loadExtension(t,dir,{remoteName:'wsl'});
  await x.run('resonance.start');x.change({captureTerminalCommands:true});await sleep(650);await x.run('resonance.stop');
  const events=x.sent.filter(e=>e.kind.startsWith('workspace.'));
  assert.deepEqual(events.map(e=>e.kind),['workspace.started','workspace.settings','workspace.stopped']);
  const service=await startService(t,{port:0,dataDir:path.join(dir,'receiver'),sortIntervalMs:600000});
  const r=await fetch(`http://127.0.0.1:${service.port}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${service.token}`},body:JSON.stringify({events})});
  assert.equal(r.status,202,await r.text());
  await service.flush(events[0].projectId);
  const journal=(await fs.readFile(path.join(dir,'receiver','projects',sha(events[0].projectId),'events.jsonl'),'utf8')).trim().split('\n').map(l=>JSON.parse(l)).filter(e=>e.kind?.startsWith('workspace.'));
  assert.deepEqual(journal.map(e=>e.kind),['workspace.started','workspace.settings','workspace.stopped']);
  assert.deepEqual(journal[0].meta,events[0].meta);assert.equal(journal[1].meta.captureTerminalCommands,true);assert.equal(journal[1].meta.remote,'wsl');
});

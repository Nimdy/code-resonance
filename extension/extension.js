'use strict';
const vscode=require('vscode');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {DurableOutbox}=require('./outbox');
const {verifyServer}=require('./proof');
const {SOURCE_GLOB,EXCLUDE_GLOB,isFileEligible,countNewlines,classifyCommand}=require('./filters');
const host=require('./receiver-host');
const agentHooks=require('./agent-hooks');
const VERSION=require('./package.json').version;
const SETTINGS_QUERY='@ext:zerobandwidth.code-resonance';
// The receiver's data directory (RESONANCE_DATA, else ~/.code-resonance), where its token is; the receiver this
// extension carries (runtime/ in the VSIX, the checkout in development; null in a copy without one).
const DATA=host.dataDir();
const RUNTIME=host.findRuntime(__dirname);
const LAUNCHER=path.join(__dirname,'launcher.js');
const PLAN_SCHEME='code-resonance-plan';
let recording=null;
let statusBar=null;
let output=null;
const planDocs=new Map();
const EDIT_WINDOW_MS=1000;
const SETTINGS_DEBOUNCE_MS=500;
function hash(s){return crypto.createHash('sha256').update(String(s)).digest('hex');}
function conf(){return vscode.workspace.getConfiguration('resonance');}
function port(){return conf().get('receiverPort',4174);}
function say(line){output?.appendLine(`[${new Date().toISOString().slice(11,19)}] ${line}`);}
function decorateStatus(text){if(statusBar){statusBar.text=`$(pulse) CR ${text}`;statusBar.tooltip='Code Resonance';statusBar.show();}}
function createEvent(rec,kind,fields={}){return {v:1,id:crypto.randomUUID(),ts:Date.now(),kind,projectId:rec.projectId,sessionId:rec.sessionId,origin:fields.origin||'unknown',...fields};}
// What this capture is configured to do, reported in workspace events so the Control Center can show facts instead of
// guessing. Values only, never paths or names. receiverPort is the port this capture delivers to (a changed setting
// applies at the next start); the other settings are read live by the handlers, so the current value is the effective one.
function settingsMeta(rec){
  const c=conf(),num=v=>typeof v==='number'&&Number.isFinite(v)?v:undefined;
  return {extensionVersion:VERSION,remote:vscode.env.remoteName||'',includeHidden:!!c.get('includeHidden',false),
    captureDocumentContents:!!c.get('captureDocumentContents',true),captureTerminalCommands:!!c.get('captureTerminalCommands',false),
    capturePromptText:!!c.get('capturePromptText',false),shareProjectName:!!c.get('shareProjectName',true),
    baselineFileLimit:num(c.get('baselineFileLimit',450)),receiverPort:num(rec.outbox?.port??c.get('receiverPort',4174))};
}
// A settings edit fires once per changed key (and settings.json saves can fire in bursts): one event per quiet 500 ms,
// and none when the reported values end up unchanged.
function watchSettings(rec){
  let timer=null;
  rec.listeners.push(vscode.workspace.onDidChangeConfiguration(e=>{
    if(!e.affectsConfiguration('resonance'))return;
    clearTimeout(timer);
    timer=setTimeout(()=>{
      timer=null;if(!rec.active)return;
      const meta=settingsMeta(rec),key=JSON.stringify(meta);
      if(key===rec.reported)return;
      rec.reported=key;send(rec,'workspace.settings',{meta});
    },SETTINGS_DEBOUNCE_MS);
  }));
  rec.listeners.push({dispose:()=>clearTimeout(timer)});
}
function relative(rec,uri){
  if(!uri||uri.scheme!=='file')return null;
  const folder=vscode.workspace.getWorkspaceFolder(uri);
  if(!folder||folder.uri.toString()!==rec.folder.uri.toString())return null;
  const file=path.relative(rec.folder.uri.fsPath,uri.fsPath).replace(/\\/g,'/');
  return isFileEligible(file,{includeHidden:conf().get('includeHidden',false)})?file:null;
}
function send(rec,kind,fields={}){rec.outbox.enqueue(createEvent(rec,kind,fields));}
async function snapshot(rec,doc,reason){
  if(!rec.active)return;
  const file=relative(rec,doc.uri);if(!file)return;
  if(!conf().get('captureDocumentContents',true))return;
  const content=doc.getText();
  if(Buffer.byteLength(content,'utf8')>150*1024)return;
  send(rec,'document.snapshot',{file,content,meta:{reason,language:doc.languageId}});
}
function debounceSnapshot(rec,doc){
  const uri=doc.uri.toString();clearTimeout(rec.documentTimers.get(uri));
  rec.documentTimers.set(uri,setTimeout(()=>{
    rec.documentTimers.delete(uri);snapshot(rec,doc,'edit').catch(()=>{});
  },1200));
}
function watchExternalFiles(rec){
  // Essential for Codex/Claude/CLI agents writing files outside open VS Code documents.
  const pattern=new vscode.RelativePattern(rec.folder,SOURCE_GLOB);
  const watcher=vscode.workspace.createFileSystemWatcher(pattern,false,false,false);
  const pending=new Map();
  function queue(uri,reason){
    const file=relative(rec,uri);if(!file)return;
    clearTimeout(pending.get(file));
    pending.set(file,setTimeout(async()=>{
      pending.delete(file);if(!rec.active)return;
      try{
        if(!conf().get('captureDocumentContents',true))return;
        const bytes=await vscode.workspace.fs.readFile(uri);
        if(bytes.length>150*1024)return;
        send(rec,'document.snapshot',{file,content:Buffer.from(bytes).toString('utf8'),meta:{reason,source:'filesystem-watcher'}});
      }catch{}
    },1200));
  }
  rec.listeners.push(watcher);
  rec.listeners.push(watcher.onDidChange(uri=>queue(uri,'external')));
  rec.listeners.push(watcher.onDidCreate(uri=>{const file=relative(rec,uri);if(file)send(rec,'file.created',{file});queue(uri,'external');}));
  rec.listeners.push(watcher.onDidDelete(uri=>{const file=relative(rec,uri);if(file)send(rec,'file.deleted',{file});}));
  rec.listeners.push({dispose:()=>{for(const id of pending.values())clearTimeout(id);}});
}
// Typing is summarised per file per second. Only counts leave the handler, never the inserted text.
function recordEdits(rec,file,changes){
  let w=rec.editWindows.get(file);
  if(!w){w={edits:0,insertedChars:0,removedChars:0,insertedLines:0,removedLines:0,start:Date.now(),timer:null};rec.editWindows.set(file,w);
    w.timer=setTimeout(()=>flushEdits(rec,file),EDIT_WINDOW_MS);}
  for(const c of changes){w.edits++;w.insertedChars+=c.text.length;w.removedChars+=c.rangeLength;w.insertedLines+=countNewlines(c.text);w.removedLines+=c.range.end.line-c.range.start.line;}
}
function flushEdits(rec,file){
  const w=rec.editWindows.get(file);if(!w)return;
  rec.editWindows.delete(file);clearTimeout(w.timer);
  send(rec,'document.edits',{file,meta:{edits:w.edits,insertedChars:w.insertedChars,removedChars:w.removedChars,insertedLines:w.insertedLines,removedLines:w.removedLines,windowMs:Date.now()-w.start}});
}
function flushAllEdits(rec){for(const file of [...rec.editWindows.keys()])flushEdits(rec,file);}
function listen(rec){
  watchExternalFiles(rec);watchSettings(rec);
  const attach=(disposable)=>rec.listeners.push(disposable);
  attach(vscode.workspace.onDidChangeTextDocument(event=>{
    const file=relative(rec,event.document.uri);if(!file||event.contentChanges.length===0)return;
    recordEdits(rec,file,event.contentChanges);
    debounceSnapshot(rec,event.document);
  }));
  attach(vscode.workspace.onDidSaveTextDocument(doc=>{
    const file=relative(rec,doc.uri);if(!file)return;
    send(rec,'document.saved',{file});debounceSnapshot(rec,doc);
  }));
  attach(vscode.workspace.onDidCreateFiles(e=>{for(const uri of e.files){const file=relative(rec,uri);if(file)send(rec,'file.created',{file});}}));
  attach(vscode.workspace.onDidDeleteFiles(e=>{for(const uri of e.files){const file=relative(rec,uri);if(file)send(rec,'file.deleted',{file});}}));
  // The rename source lets the receiver keep the file's identity (its building transforms instead of being rebuilt).
  attach(vscode.workspace.onDidRenameFiles(e=>{for(const f of e.files){const file=relative(rec,f.newUri);const from=relative(rec,f.oldUri);if(file)send(rec,'file.renamed',{file,...(from?{from}:{}),meta:{source:hash(f.oldUri.toString()).slice(0,12)}});}}));
  // Commands are classified here (test, build, lint, ...) so the category can be shared without the command text.
  if(vscode.window.onDidStartTerminalShellExecution)attach(vscode.window.onDidStartTerminalShellExecution(e=>{
    const captureCommand=conf().get('captureTerminalCommands',false);
    const command=String(e.execution?.commandLine?.value||'');
    send(rec,'terminal.command.started',{meta:{command:captureCommand?command.slice(0,500):'',fingerprint:command?hash(command).slice(0,12):'',category:classifyCommand(command)}});
  }));
  if(vscode.window.onDidEndTerminalShellExecution)attach(vscode.window.onDidEndTerminalShellExecution(e=>{
    const exit=Number.isInteger(e.exitCode)?e.exitCode:undefined;
    const command=String(e.execution?.commandLine?.value||'');
    send(rec,'terminal.command.finished',{meta:{category:classifyCommand(command),...(exit===undefined?{}:{exitCode:exit})}});
  }));
  const taskCategory=task=>{const x=task.execution;const line=x&&typeof x.commandLine==='string'?x.commandLine:x&&x.command?[typeof x.command==='string'?x.command:x.command.value,...(x.args||[]).map(a=>typeof a==='string'?a:a.value)].join(' '):'';
    const byName=classifyCommand(task.name);return byName!=='other'?byName:classifyCommand(line);};
  attach(vscode.tasks.onDidStartTask(e=>send(rec,'task.started',{meta:{taskName:e.execution.task.name,category:taskCategory(e.execution.task)}})));
  attach(vscode.tasks.onDidEndTaskProcess(e=>send(rec,'task.finished',{meta:{taskName:e.execution.task.name,category:taskCategory(e.execution.task),...(Number.isInteger(e.exitCode)?{exitCode:e.exitCode}:{})}})));
  let diagnosticTimer=null;const diagnosticUris=new Map();
  attach(vscode.languages.onDidChangeDiagnostics(e=>{
    for(const uri of e.uris)if(diagnosticUris.size<200)diagnosticUris.set(uri.toString(),uri);
    clearTimeout(diagnosticTimer);
    diagnosticTimer=setTimeout(()=>{
      const uris=[...diagnosticUris.values()];diagnosticUris.clear();
      for(const uri of uris.slice(0,60)){
        const file=relative(rec,uri);if(!file)continue;
        const diags=vscode.languages.getDiagnostics(uri);
        send(rec,'diagnostics.updated',{file,meta:{errors:diags.filter(x=>x.severity===vscode.DiagnosticSeverity.Error).length,
          warnings:diags.filter(x=>x.severity===vscode.DiagnosticSeverity.Warning).length}});
      }
    },700);
  }));
  rec.listeners.push({dispose:()=>clearTimeout(diagnosticTimer)});
  // Optional built-in Git extension integration. A HEAD change is observable, not proof of a successful deployment.
  void observeGit(rec);
}
async function observeGit(rec){
  try{
    const ext=vscode.extensions.getExtension('vscode.git');if(!ext)return;
    const api=(ext.isActive?ext.exports:await ext.activate())?.getAPI?.(1);
    if(!api||!rec.active)return;
    const subscriptions=new Map();
    function attach(repo){
      const key=repo.rootUri?.toString();if(!key||subscriptions.has(key))return;
      if(!key.startsWith(rec.folder.uri.toString()))return;
      let last=repo.state.HEAD?.commit||null;
      const d=repo.state.onDidChange(()=>{
        const head=repo.state.HEAD?.commit||null;
        if(head&&last&&head!==last){
          const previous=last;
          // A new commit has the previous HEAD as a parent; checkouts, resets and rebases do not.
          Promise.resolve(repo.getCommit?.(head)).then(c=>c?.parents?.includes(previous)).catch(()=>false).then(isCommit=>{
            if(rec.active)send(rec,isCommit?'repository.commit.observed':'repository.head.changed',{meta:{commit:head.slice(0,40),parent:previous.slice(0,40)}});
          });
        }
        last=head;
      });subscriptions.set(key,d);rec.listeners.push(d);
    }
    api.repositories.forEach(attach);
    if(api.onDidOpenRepository)rec.listeners.push(api.onDidOpenRepository(attach));
  }catch{/* Git API not required; other observation remains available. */}
}
async function baseline(rec){
  const limit=conf().get('baselineFileLimit',450);
  if(limit===0)return;
  // Indexing queues up to tens of MB; wait for a reachable receiver instead of piling it up on disk.
  if(!rec.outbox.online)decorateStatus('waiting for receiver');
  while(!rec.outbox.online){if(!rec.active)return;await new Promise(r=>setTimeout(r,1000));}
  decorateStatus('indexing');
  const pattern=new vscode.RelativePattern(rec.folder,SOURCE_GLOB);
  const found=await vscode.workspace.findFiles(pattern,EXCLUDE_GLOB,limit);
  send(rec,'project.baseline',{meta:{count:found.length,truncated:found.length>=limit}});
  for(let i=0;i<found.length;i++){
    if(!rec.active)break;
    const uri=found[i];if(!relative(rec,uri))continue;
    try{
      const data=await vscode.workspace.fs.readFile(uri);
      if(data.length>150*1024||!conf().get('captureDocumentContents',true))continue;
      const content=Buffer.from(data).toString('utf8');
      const file=relative(rec,uri);
      if(file)send(rec,'document.snapshot',{file,content,meta:{reason:'baseline'}});
    }catch{/* Files can vanish while indexing. */}
    if(i%8===0)await new Promise(r=>setTimeout(r,12));
  }
}
async function start(context,showConsent=true){
  if(recording)return;
  if(!vscode.workspace.isTrusted){vscode.window.showWarningMessage('CODE RESONANCE requires a trusted workspace.');return;}
  const folder=vscode.workspace.workspaceFolders?.[0];
  if(!folder){vscode.window.showWarningMessage('Open a folder before starting CODE RESONANCE capture.');return;}
  if(showConsent){
    const answer=await vscode.window.showWarningMessage('Capture this workspace locally? Source snapshots are saved on disk for semantic analysis. Prompts and command text are opt-in; nothing is sent to a cloud service.',{modal:true},'Start Capture');
    if(answer!=='Start Capture')return;
  }
  const projectId=hash(folder.uri.toString());
  const directory=path.join(context.globalStorageUri.fsPath,'outbox',projectId);
  const rec={folder,projectId,sessionId:crypto.randomUUID(),active:true,documentTimers:new Map(),editWindows:new Map(),listeners:[],outbox:null,reported:null};
  rec.outbox=new DurableOutbox({directory,port:port(),authFile:path.join(DATA,'receiver-auth.json'),onStatus:(kind)=>{
    if(recording!==rec)return;
    decorateStatus({online:'recording',offline:'queued offline',unverified:'queued (receiver not verified)','disk-error':'storage error','queue-full':'queue full','rejected':'recording (events rejected)'}[kind]||'recording');
  }});
  await rec.outbox.start().catch(()=>{});
  recording=rec;
  // The outbox queues on disk until a receiver answers: starting one (or finding one) need not hold capture up.
  void ensureReceiver({interactive:showConsent});
  listen(rec);
  // The folder name labels the project in the local player's project list; it is never drawn on the Stage.
  const meta=settingsMeta(rec);rec.reported=JSON.stringify(meta);
  send(rec,'workspace.started',{...(conf().get('shareProjectName',true)?{name:folder.name.slice(0,100)}:{}),meta});
  await context.workspaceState.update('resonanceRecording',true);
  decorateStatus('indexing');
  void baseline(rec).then(()=>{if(recording===rec)decorateStatus('recording');}).catch(e=>vscode.window.showWarningMessage(`CODE RESONANCE indexing limited: ${e.message}`));
}
async function stop(context){
  if(!recording)return;
  const rec=recording;flushAllEdits(rec);rec.active=false;
  for(const t of rec.documentTimers.values())clearTimeout(t);
  for(const d of rec.listeners)d.dispose();
  send(rec,'workspace.stopped');
  await rec.outbox.close();
  recording=null;
  await context.workspaceState.update('resonanceRecording',false);
  decorateStatus('stopped');
}
async function recordPrompt(){
  if(!recording){vscode.window.showInformationMessage('Start CODE RESONANCE capture first.');return;}
  const content=await vscode.window.showInputBox({title:'Record visible AI prompt',prompt:'Records only a fingerprint and length unless prompt text capture is explicitly enabled.',ignoreFocusOut:true});
  if(!content)return;
  const meta={fingerprint:hash(content).slice(0,20),length:content.length,source:'manual'};
  send(recording,'agent.prompt.submitted',{meta,...(conf().get('capturePromptText',false)?{text:content}:{})});
}
// ---- The receiver. One that proves it holds the token in DATA is used whoever started it; when none answers on
// resonance.receiverPort, the receiver this extension carries is started, detached, and every window shares it
// (./receiver-host.js). Problems are explained once per session and kind unless the user asked; the Output channel
// "Code Resonance" keeps every decision and where the receiver's log is.
const told=new Set();
let lastReceiver='';
function receiverProblem(r){
  const settings=['Open Settings',()=>vscode.commands.executeCommand('workbench.action.openSettings',SETTINGS_QUERY)];
  switch(r.status){
    case 'occupied':return {text:r.reason==='receiver'?`Port ${r.port} is used by a Code Resonance receiver that does not hold the token in ${DATA} (another data directory). Capture waits, queued on disk. Stop that receiver, or choose another resonance.receiverPort.`
      :`Port ${r.port} is used by another program, so Code Resonance cannot start its receiver there. Capture waits, queued on disk. Free the port, or choose another resonance.receiverPort.`,actions:[settings]};
    case 'elsewhere':return {text:`A receiver using ${DATA} is running on port ${r.other}, but resonance.receiverPort is ${r.port}. Set resonance.receiverPort to ${r.other}, or stop that receiver.`,actions:[settings]};
    case 'absent':return {text:`No receiver answers on 127.0.0.1:${r.port}, and resonance.startReceiver is off. Start one (for example npm start in a Code Resonance checkout), or turn the setting on.`,actions:[settings]};
    case 'unavailable':return {text:`No receiver answers on 127.0.0.1:${r.port}, and this copy of the extension carries none. Start one (npm start in a Code Resonance checkout).`,actions:[]};
    case 'failed':return {text:`Code Resonance could not start its receiver: ${r.message}`,actions:[['Show Log',showReceiverLog]],error:true};
    default:return null;
  }
}
async function ensureReceiver({interactive=false}={}){
  let r;
  try{r=await host.ensureReceiver({port:port(),dir:DATA,runtime:RUNTIME,launcher:LAUNCHER,version:VERSION,start:conf().get('startReceiver',true),log:say});}
  catch(e){r={status:'failed',port:port(),message:e.message};}
  const key=`${r.status}:${r.port}:${r.owner||''}:${r.state?.instance||''}`;
  if(key!==lastReceiver){
    lastReceiver=key;
    if(r.status==='reused')say(r.owner==='bundled'?`Using the receiver Code Resonance ${r.state.version} started on 127.0.0.1:${r.port} (process ${r.state.pid}). Log: ${host.logFile(DATA)}`
      :`Using the receiver on 127.0.0.1:${r.port}, which this extension did not start (for example npm start in a checkout). Data: ${DATA}`);
    if(r.status==='started')say(`Receiver log: ${r.log}. It keeps running when VS Code closes; the CR menu stops it.`);
  }
  const problem=receiverProblem(r);
  if(problem){
    say(problem.text);if(r.detail)say(`Last lines of the receiver's log:\n${r.detail}`);
    if(interactive||!told.has(key)){
      told.add(key);
      const show=problem.error?vscode.window.showErrorMessage:vscode.window.showWarningMessage;
      void Promise.resolve(show.call(vscode.window,problem.text,...problem.actions.map(([label])=>label))).then(pick=>problem.actions.find(([label])=>label===pick)?.[1]()).catch(()=>{});
    }
  }
  return r;
}
async function showReceiverLog(){
  const file=host.logFile(DATA);
  if(!require('node:fs').existsSync(file)){void vscode.window.showInformationMessage(`Code Resonance has not started a receiver here yet (its log would be ${file}).`);return;}
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(file)),{preview:true});
}
async function showReceiverStatus(){
  const s=await host.receiverStatus({port:port(),dir:DATA}),actions=[];
  const since=s.bundled?` since ${new Date(s.bundled.startedAt).toLocaleString()}`:'';
  let text;
  if(s.occupant==='verified'){
    text=s.ours?`The receiver on 127.0.0.1:${s.port} was started by Code Resonance ${s.bundled.version} (process ${s.bundled.pid}${since}, ${s.bundled.electron?'in VS Code\'s runtime':`Node ${s.bundled.node}`}). Data: ${DATA}.`
      :`A receiver runs on 127.0.0.1:${s.port} that this extension did not start (for example npm start in a checkout); it is used as it is. Data: ${DATA}.`;
    actions.push('Open Control Center');if(s.ours)actions.push('Stop Receiver');
  }else if(s.occupant==='foreign')text=receiverProblem({status:'occupied',port:s.port,reason:s.reason}).text;
  else if(s.elsewhere)text=receiverProblem({status:'elsewhere',port:s.port,other:s.elsewhere}).text;
  else{
    const auto=conf().get('startReceiver',true)&&RUNTIME;
    text=`No receiver is running on 127.0.0.1:${s.port}.${auto?' Starting capture or opening the Stage starts the one Code Resonance carries.':''}`;
    if(auto)actions.push('Start Receiver');
  }
  if(s.bundled&&!s.ours){text+=` The receiver Code Resonance started runs on port ${s.bundled.port} (process ${s.bundled.pid}).`;actions.push('Stop Receiver');}
  if(require('node:fs').existsSync(s.log))actions.push('Show Log');
  say(text);
  const pick=await vscode.window.showInformationMessage(text,...actions);
  if(pick==='Open Control Center')await openStage(false,{withProject:false});
  else if(pick==='Stop Receiver')await stopReceiver();
  else if(pick==='Start Receiver')await ensureReceiver({interactive:true});
  else if(pick==='Show Log')await showReceiverLog();
}
async function stopReceiver(){
  const s=host.bundled(DATA);
  if(!s){
    const st=await host.receiverStatus({port:port(),dir:DATA});
    void vscode.window.showInformationMessage(st.occupant==='verified'?`The receiver on port ${st.port} was not started by this extension: stop it where it runs (Ctrl+C in its terminal).`:'No receiver started by Code Resonance is running.');
    return;
  }
  const answer=await vscode.window.showWarningMessage(`Stop the receiver Code Resonance started on port ${s.port}?`,
    {modal:true,detail:'Capture in every window keeps its events on disk until a receiver runs again. Starting capture or opening the Stage starts it again.'},'Stop Receiver');
  if(answer!=='Stop Receiver')return;
  const r=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Code Resonance: stopping the receiver…'},()=>host.stopReceiver({port:port(),dir:DATA,log:say}));
  lastReceiver='';
  if(r.status==='stopped')void vscode.window.showInformationMessage('Code Resonance: the receiver stopped.');
  else void vscode.window.showWarningMessage(`Code Resonance: the receiver (process ${s.pid}) did not stop. Its log: ${host.logFile(DATA)}`);
}
// The Control Center opens paired: the receiver (asked with this account's ingestion token) gives a single-use code,
// valid minutes, which the page exchanges for the pairing key. The key itself never appears in a link or a command line.
async function pairingFragment(port){try{
  const a=JSON.parse(await fs.readFile(path.join(DATA,'receiver-auth.json'),'utf8'));if(!a.token)return '';
  // The occupant proves it holds the token for this port before it is sent (./proof.js, shared with the receiver).
  await verifyServer(port,a.token,2000);
  const r=await fetch(`http://127.0.0.1:${port}/v1/pairing-code`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${a.token}`},signal:AbortSignal.timeout(2000)});
  if(!r.ok)return '';const {code}=await r.json();return /^[0-9a-f]{32}$/.test(code||'')?`#pair=${code}`:'';}catch{return '';}}
async function openStage(overlay=false,{withProject=true}={}){
  const r=await vscode.window.withProgress({location:vscode.ProgressLocation.Window,title:'Code Resonance receiver'},()=>ensureReceiver({interactive:true}));
  // Nothing of ours to open: the notification says why (another program on the port, a failed start).
  if(r.status==='occupied'||r.status==='elsewhere'||r.status==='failed')return;
  const port=r.port,id=withProject&&recording?recording.projectId:null;
  await vscode.env.openExternal(vscode.Uri.parse(overlay?`http://127.0.0.1:${port}/?overlay=1&sound=1${id?`&project=${id}`:''}`:`http://127.0.0.1:${port}/${id?`?project=${id}`:''}${await pairingFragment(port)}`));
}
// ---- Agent hooks for this workspace, through the receiver's own plan and apply (./agent-hooks.js): the exact change
// is shown in a diff editor first and written only after the user confirms, and only if the file did not change since.
// The hook commands in a hooks file (the planned one or the current one): every string under a "command" key.
function hookCommands(text){
  const out=[];const walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(k==='command'&&typeof x==='string')out.push(x);else walk(x);}};
  try{walk(JSON.parse(text||'{}'));}catch{}
  return out;
}
function hasNode(){
  return new Promise(resolve=>{try{require('node:child_process').execFile('node',['--version'],{timeout:5000,windowsHide:true},(err,out)=>resolve(!err&&/^v\d+/.test(String(out).trim())));}catch{resolve(false);}});
}
async function showPlan(agent,plan,action){
  const id=crypto.randomBytes(4).toString('hex');
  const left=vscode.Uri.parse(`${PLAN_SCHEME}:/${id}/now/${agent.file}`),right=vscode.Uri.parse(`${PLAN_SCHEME}:/${id}/planned/${agent.file}`);
  planDocs.set(left.toString(),plan.current??'');planDocs.set(right.toString(),plan.next);
  while(planDocs.size>20)planDocs.delete(planDocs.keys().next().value);
  await vscode.commands.executeCommand('vscode.diff',left,right,`${agent.file}: ${plan.exists?'now':'new file'} ↔ ${action==='install'?'with':'without'} Code Resonance's hooks`,{preview:true});
}
async function connectAgent(){
  const folder=vscode.workspace.workspaceFolders?.[0];
  if(!folder||folder.uri.scheme!=='file'){void vscode.window.showWarningMessage('Open a folder on this computer (or in this WSL/SSH host) before connecting an AI agent.');return;}
  if(!vscode.workspace.isTrusted){void vscode.window.showWarningMessage('Connecting an AI agent requires a trusted workspace.');return;}
  const r=await vscode.window.withProgress({location:vscode.ProgressLocation.Window,title:'Code Resonance receiver'},()=>ensureReceiver({interactive:true}));
  if(r.status!=='started'&&r.status!=='reused')return;
  const projectPath=folder.uri.fsPath,p=r.port;
  const agents=await Promise.all(Object.entries(agentHooks.AGENTS).map(async([id,a])=>{
    try{const plan=await agentHooks.planHooks({port:p,dataDir:DATA,agent:id,projectPath,action:'install'});return {id,...a,installed:plan.exists&&!plan.changed,plan};}
    catch(e){return {id,...a,error:e.message};}
  }));
  const pick=await vscode.window.showQuickPick(agents.map(a=>({label:a.label,description:a.error?'unavailable':a.installed?'connected':'',
    detail:a.error?a.error:a.installed?`Remove Code Resonance's hooks from ${a.file}`:`Add observe-only hooks to ${a.file}`,agent:a})),
    {title:'Code Resonance: connect an AI agent to this workspace',placeHolder:'The agent then joins the performance: sessions, tools and files, never its prompts or code unless you opt in'});
  if(!pick)return;
  const a=pick.agent;if(a.error){void vscode.window.showWarningMessage(`Code Resonance cannot plan the ${a.label} hooks: ${a.error}`);return;}
  const action=a.installed?'remove':'install';
  let plan=a.plan;
  try{if(action==='remove')plan=await agentHooks.planHooks({port:p,dataDir:DATA,agent:a.id,projectPath,action});}
  catch(e){void vscode.window.showWarningMessage(`Code Resonance cannot plan the ${a.label} hooks: ${e.message}`);return;}
  if(!plan.changed){void vscode.window.showInformationMessage(`Nothing to change in ${a.file}.`);return;}
  await showPlan(a,plan,action);
  // The command the receiver planned (its adapter path), and Code Resonance entries already there for another path (for
  // example installed from a checkout): both would run, and the agent would be reported twice.
  const adapter=/^(?:claude|cursor|codex)$/.test(a.id)?{claude:'claude-code.js',cursor:'cursor.js',codex:'codex.js'}[a.id]:'';
  const before=new Set(hookCommands(plan.current));
  const planned=new Set(hookCommands(plan.next).filter(c=>c.startsWith('node ')&&c.includes(adapter)&&!before.has(c)));
  const command=[...planned][0]||'';
  const others=[...new Set(hookCommands(plan.current).filter(c=>c.startsWith('node ')&&/scripts[\\/]+hooks[\\/]+/.test(c)&&c.includes(adapter)&&!planned.has(c)))];
  const stable=command.includes(agentHooks.stableRoot(DATA))||command.includes(JSON.stringify(agentHooks.stableRoot(DATA)).slice(1,-1));
  const detail=action==='install'?[`The diff shows the whole change to ${plan.file}: only the adapter's observe-only entries are added, nothing else in the file changes.`,
    `Each entry runs ${command||'node with the receiver\'s adapter'}${stable?' (a copy Code Resonance keeps in the data directory, at the same path across updates)':''}. It never prints and always exits 0, so it cannot block or change ${a.label}.`,
    ...(others.length?[`This file already has Code Resonance hooks running ${others.join(', ')} (for example installed from a checkout). Remove those entries first, or ${a.label} is reported twice.`]:[]),
    ...(a.id==='claude'?[]:[`${a.file} may be committed with the project: the command is a path on this computer, so gitignore it or leave that entry out of commits.`]),
    ...(await hasNode()?[]:['Node.js was not found on the PATH here: the agent needs node on its PATH to run the hook.'])].join('\n\n')
    :`The diff shows the whole change to ${plan.file}: only Code Resonance's entries are removed.`;
  const confirm=action==='install'?'Add Hooks':'Remove Hooks';
  const answer=await vscode.window.showWarningMessage(`${action==='install'?'Add':'Remove'} Code Resonance's ${a.label} hooks ${action==='install'?'in':'from'} ${a.file}?`,{modal:true,detail},confirm);
  if(answer!==confirm)return;
  try{
    const res=await agentHooks.applyHooks({port:p,dataDir:DATA,agent:a.id,projectPath,action,expectHash:plan.currentHash});
    say(`${a.label} hooks ${action==='install'?'added to':'removed from'} ${res.file} (${res.written?'written':'unchanged'}).`);
    void vscode.window.showInformationMessage(!res.written?`Nothing changed in ${a.file}.`:action==='install'
      ?`${a.label} hooks added to ${a.file}. Start a new ${a.label} session in this folder: sessions already running do not pick up new hooks.${a.id==='codex'?' Codex asks you to review and trust them first (/hooks).':''}`
      :`${a.label} hooks removed from ${a.file}.`);
  }catch(e){void vscode.window.showWarningMessage(`Code Resonance could not ${action==='install'?'add':'remove'} the ${a.label} hooks: ${e.message}`);}
}
// One click from the status bar to everything a performer needs while coding.
async function menu(context){
  const items=recording?[{label:'$(debug-stop) Stop capture',run:()=>stop(context)},{label:'$(globe) Open Stage',run:()=>openStage(false)},
    {label:'$(device-camera-video) Open OBS view',detail:'Clean browser-source view with sound',run:()=>openStage(true)},{label:'$(comment) Record AI prompt (explicit)',run:recordPrompt}]
    :[{label:'$(record) Start capture',detail:'Asks for consent before recording this workspace locally',run:()=>start(context,true)},{label:'$(globe) Open Stage',run:()=>openStage(false)}];
  if(vscode.QuickPickItemKind)items.push({label:'Receiver and agents',kind:vscode.QuickPickItemKind.Separator});
  items.push({label:'$(server) Receiver status',detail:'Where it runs, who started it, its log; open the Control Center (pairing link)',run:showReceiverStatus},
    {label:'$(plug) Connect an AI agent…',detail:'Observe-only hooks for Claude Code, Cursor or Codex in this workspace',run:connectAgent});
  const mine=host.bundled(DATA);
  if(mine)items.push({label:'$(circle-slash) Stop receiver',description:`started by Code Resonance on port ${mine.port}`,run:stopReceiver});
  const pick=await vscode.window.showQuickPick(items,{title:'Code Resonance'});
  if(pick)await pick.run();
}
// vscode://zerobandwidth.code-resonance/settings (linked from the Control Center) only opens this extension's settings:
// a link from a web page must never start capture or change anything.
function handleUri(uri){
  if(uri?.path==='/settings')return vscode.commands.executeCommand('workbench.action.openSettings',SETTINGS_QUERY);
}
function activate(context){
  statusBar=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,45);
  statusBar.command='resonance.menu';context.subscriptions.push(statusBar);
  decorateStatus('stopped');
  output=vscode.window.createOutputChannel('Code Resonance');context.subscriptions.push(output);
  say(`Code Resonance ${VERSION}. Receiver data: ${DATA}. ${RUNTIME?`Bundled receiver: ${RUNTIME.root}${RUNTIME.kind==='checkout'?' (a checkout)':''}; its log: ${host.logFile(DATA)}.`:'No bundled receiver in this copy.'}`);
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(PLAN_SCHEME,{provideTextDocumentContent:uri=>planDocs.get(uri.toString())??''}));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.start',()=>start(context,true)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.stop',()=>stop(context)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.openStage',()=>openStage(false)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.openOverlay',()=>openStage(true)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.openControlCenter',()=>openStage(false,{withProject:false})));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.receiverStatus',showReceiverStatus));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.stopReceiver',stopReceiver));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.showReceiverLog',showReceiverLog));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.connectAgent',connectAgent));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.menu',()=>menu(context)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.recordPrompt',recordPrompt));
  context.subscriptions.push(vscode.window.registerUriHandler({handleUri}));
  if(context.workspaceState.get('resonanceRecording',false))void start(context,false);
}
async function deactivate(){if(recording){const rec=recording;flushAllEdits(rec);rec.active=false;for(const t of rec.documentTimers.values())clearTimeout(t);for(const d of rec.listeners)d.dispose();await rec.outbox.close();recording=null;}}
module.exports={activate,deactivate};

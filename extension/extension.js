'use strict';
const vscode=require('vscode');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {DurableOutbox}=require('./outbox');
const {SOURCE_GLOB,EXCLUDE_GLOB,isFileEligible,countNewlines,classifyCommand}=require('./filters');
const VERSION=require('./package.json').version;
const SETTINGS_QUERY='@ext:zerobandwidth.code-resonance';
let recording=null;
let statusBar=null;
const EDIT_WINDOW_MS=1000;
const SETTINGS_DEBOUNCE_MS=500;
function hash(s){return crypto.createHash('sha256').update(String(s)).digest('hex');}
function conf(){return vscode.workspace.getConfiguration('resonance');}
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
  rec.outbox=new DurableOutbox({directory,port:conf().get('receiverPort',4174),onStatus:(kind)=>{
    if(recording!==rec)return;
    decorateStatus({online:'recording',offline:'queued offline','disk-error':'storage error','queue-full':'queue full','rejected':'recording (events rejected)'}[kind]||'recording');
  }});
  await rec.outbox.start().catch(()=>{});
  recording=rec;
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
// The Control Center opens paired: the receiver (asked with this account's ingestion token) gives a single-use code,
// valid minutes, which the page exchanges for the pairing key. The key itself never appears in a link or a command line.
async function pairingFragment(port){try{
  const a=JSON.parse(await fs.readFile(path.join(require('node:os').homedir(),'.code-resonance','receiver-auth.json'),'utf8'));if(!a.token)return '';
  // Same HMAC as receiver/proof.js; inlined so the VSIX stays self-contained (it does not ship receiver/).
  const nonce=crypto.randomBytes(16).toString('hex');
  const ch=await fetch(`http://127.0.0.1:${port}/v1/challenge?nonce=${nonce}`,{signal:AbortSignal.timeout(2000)});
  if(!ch.ok)return '';
  const body=await ch.json();
  const expected=crypto.createHmac('sha256',String(a.token)).update(nonce).digest('hex');
  const x=Buffer.from(String(body?.proof||'')),y=Buffer.from(expected);
  if(x.length!==y.length||!crypto.timingSafeEqual(x,y))return '';
  const r=await fetch(`http://127.0.0.1:${port}/v1/pairing-code`,{method:'POST',headers:{Authorization:`Bearer ${a.token}`},signal:AbortSignal.timeout(2000)});
  if(!r.ok)return '';const {code}=await r.json();return /^[0-9a-f]{32}$/.test(code||'')?`#pair=${code}`:'';}catch{return '';}}
async function openStage(overlay=false){
  const port=conf().get('receiverPort',4174);
  const project=recording?`?project=${recording.projectId}`:'';
  await vscode.env.openExternal(vscode.Uri.parse(overlay?`http://127.0.0.1:${port}/?overlay=1&sound=1${project?`&project=${recording.projectId}`:''}`:`http://127.0.0.1:${port}/${project}${await pairingFragment(port)}`));
}
// One click from the status bar to everything a performer needs while coding.
async function menu(context){
  const items=recording?[{label:'$(debug-stop) Stop capture',run:()=>stop(context)},{label:'$(globe) Open Stage',run:()=>openStage(false)},
    {label:'$(device-camera-video) Open OBS view',detail:'Clean browser-source view with sound',run:()=>openStage(true)},{label:'$(comment) Record AI prompt (explicit)',run:recordPrompt}]
    :[{label:'$(record) Start capture',detail:'Asks for consent before recording this workspace locally',run:()=>start(context,true)},{label:'$(globe) Open Stage',run:()=>openStage(false)}];
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
  context.subscriptions.push(vscode.commands.registerCommand('resonance.start',()=>start(context,true)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.stop',()=>stop(context)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.openStage',()=>openStage(false)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.openOverlay',()=>openStage(true)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.menu',()=>menu(context)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.recordPrompt',recordPrompt));
  context.subscriptions.push(vscode.window.registerUriHandler({handleUri}));
  if(context.workspaceState.get('resonanceRecording',false))void start(context,false);
}
async function deactivate(){if(recording){const rec=recording;flushAllEdits(rec);rec.active=false;for(const t of rec.documentTimers.values())clearTimeout(t);for(const d of rec.listeners)d.dispose();await rec.outbox.close();recording=null;}}
module.exports={activate,deactivate};

'use strict';
const vscode=require('vscode');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {DurableOutbox}=require('./outbox');
let recording=null;
let statusBar=null;
const EXCLUDE='**/{node_modules,.git,.next,dist,build,out,coverage,.venv,venv,__pycache__,.cache,.turbo}/**';
const SKIP=/(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|kdbx|sqlite|db)|credentials(?:\..+)?|secrets?(?:\..+)?|.*\.min\.(?:js|css))$/i;
function hash(s){return crypto.createHash('sha256').update(String(s)).digest('hex');}
function conf(){return vscode.workspace.getConfiguration('resonance');}
function isFileEligible(file){
  if(!file||file.startsWith('../')||file.startsWith('/')||file.includes('\\')||SKIP.test(file))return false;
  return !file.split('/').some(seg=>['node_modules','.git','.next','dist','build','out','coverage','.venv','venv','__pycache__','.cache','.turbo'].includes(seg));
}
function decorateStatus(text){if(statusBar){statusBar.text=`$(pulse) CR ${text}`;statusBar.tooltip='Code Resonance';statusBar.show();}}
function createEvent(rec,kind,fields={}){return {v:1,id:crypto.randomUUID(),ts:Date.now(),kind,projectId:rec.projectId,sessionId:rec.sessionId,origin:fields.origin||'unknown',...fields};}
function relative(rec,uri){
  if(!uri||uri.scheme!=='file')return null;
  const folder=vscode.workspace.getWorkspaceFolder(uri);
  if(!folder||folder.uri.toString()!==rec.folder.uri.toString())return null;
  const file=path.relative(rec.folder.uri.fsPath,uri.fsPath).replace(/\\/g,'/');
  return isFileEligible(file)?file:null;
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
  const pattern=new vscode.RelativePattern(rec.folder,'**/*.{ts,tsx,js,jsx,mjs,cjs,json,css,html,py,go,rs,md}');
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
function listen(rec){
  watchExternalFiles(rec);
  const attach=(disposable)=>rec.listeners.push(disposable);
  attach(vscode.workspace.onDidChangeTextDocument(event=>{
    const file=relative(rec,event.document.uri);if(!file||event.contentChanges.length===0)return;
    send(rec,'document.change',{file,origin:'unknown',changes:event.contentChanges.slice(0,120).map(c=>({
      start:c.rangeOffset,end:c.rangeOffset+c.rangeLength,text:c.text.slice(0,8000),
      insertedLines:(c.text.match(/\n/g)||[]).length,removedLines:c.range.end.line-c.range.start.line
    }))});
    debounceSnapshot(rec,event.document);
  }));
  attach(vscode.workspace.onDidSaveTextDocument(doc=>{
    const file=relative(rec,doc.uri);if(!file)return;
    send(rec,'document.saved',{file});debounceSnapshot(rec,doc);
  }));
  attach(vscode.workspace.onDidCreateFiles(e=>{for(const uri of e.files){const file=relative(rec,uri);if(file)send(rec,'file.created',{file});}}));
  attach(vscode.workspace.onDidDeleteFiles(e=>{for(const uri of e.files){const file=relative(rec,uri);if(file)send(rec,'file.deleted',{file});}}));
  attach(vscode.workspace.onDidRenameFiles(e=>{for(const f of e.files){const file=relative(rec,f.newUri);if(file)send(rec,'file.renamed',{file,meta:{source:hash(f.oldUri.toString()).slice(0,12)}});}}));
  if(vscode.window.onDidStartTerminalShellExecution)attach(vscode.window.onDidStartTerminalShellExecution(e=>{
    const captureCommand=conf().get('captureTerminalCommands',false);
    const command=String(e.execution?.commandLine?.value||'');
    send(rec,'terminal.command.started',{meta:{command:captureCommand?command.slice(0,500):'',fingerprint:command?hash(command).slice(0,12):''}});
  }));
  if(vscode.window.onDidEndTerminalShellExecution)attach(vscode.window.onDidEndTerminalShellExecution(e=>{
    const exit=Number.isInteger(e.exitCode)?e.exitCode:undefined;
    send(rec,'terminal.command.finished',{meta:{...(exit===undefined?{}:{exitCode:exit})}});
  }));
  attach(vscode.tasks.onDidStartTask(e=>send(rec,'task.started',{meta:{taskName:e.execution.task.name}})));
  attach(vscode.tasks.onDidEndTaskProcess(e=>send(rec,'task.finished',{meta:{taskName:e.execution.task.name, ...(Number.isInteger(e.exitCode)?{exitCode:e.exitCode}:{})}})));
  let diagnosticTimer=null;
  attach(vscode.languages.onDidChangeDiagnostics(e=>{
    clearTimeout(diagnosticTimer);
    diagnosticTimer=setTimeout(()=>{
      for(const uri of e.uris.slice(0,60)){
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
        if(head&&last&&head!==last){send(rec,'repository.commit.observed',{meta:{commit:head.slice(0,40),parent:last.slice(0,40)}});}
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
  const pattern=new vscode.RelativePattern(rec.folder,'**/*.{ts,tsx,js,jsx,mjs,cjs,json,css,html,py,go,rs,md}');
  const found=await vscode.workspace.findFiles(pattern,EXCLUDE,limit);
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
  const rec={folder,projectId,sessionId:crypto.randomUUID(),active:true,documentTimers:new Map(),listeners:[],outbox:null};
  rec.outbox=new DurableOutbox({directory,port:conf().get('receiverPort',4174),onStatus:(kind)=>{
    if(recording!==rec)return;
    decorateStatus(kind==='online'?'recording':kind==='offline'?'queued offline':kind==='disk-error'?'storage error':'recording');
  }});
  await rec.outbox.start().catch(()=>{});
  recording=rec;
  listen(rec);
  send(rec,'workspace.started');
  await context.workspaceState.update('resonanceRecording',true);
  decorateStatus('indexing');
  void baseline(rec).then(()=>{if(recording===rec)decorateStatus('recording');}).catch(e=>vscode.window.showWarningMessage(`CODE RESONANCE indexing limited: ${e.message}`));
}
async function stop(context){
  if(!recording)return;
  const rec=recording;rec.active=false;
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
async function openStage(){
  const port=conf().get('receiverPort',4174);
  await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${port}/`));
}
function activate(context){
  statusBar=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,45);
  statusBar.command='resonance.openStage';context.subscriptions.push(statusBar);
  decorateStatus('stopped');
  context.subscriptions.push(vscode.commands.registerCommand('resonance.start',()=>start(context,true)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.stop',()=>stop(context)));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.openStage',openStage));
  context.subscriptions.push(vscode.commands.registerCommand('resonance.recordPrompt',recordPrompt));
  if(context.workspaceState.get('resonanceRecording',false))void start(context,false);
}
async function deactivate(){if(recording){const rec=recording;rec.active=false;for(const t of rec.documentTimers.values())clearTimeout(t);for(const d of rec.listeners)d.dispose();await rec.outbox.close();recording=null;}}
module.exports={activate,deactivate};

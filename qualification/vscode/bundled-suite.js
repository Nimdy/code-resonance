'use strict';
// Runs inside a real VS Code extension host, from the VSIX's own extension folder (copied there by bundled.js as
// qualification-suite/index.js, so it shares the extension's `vscode` API instance and can answer its dialogs). Two
// phases, one window each: "first" (no receiver runs; capture starts the bundled one; capture and an agent hook reach
// it) and "second" (another folder: the receiver is reused, then stopped, started again, and a checkout's receiver is
// reused). Checks what the receiver recorded, read from RESONANCE_DATA, never from the extension's own state.
const vscode=require('vscode');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const E=process.env;
const PORT=Number(E.CR_QUAL_PORT),DATA=E.RESONANCE_DATA,PHASE=E.CR_QUAL_PHASE,WS=E.CR_QUAL_WORKSPACE,REPO=E.CR_QUAL_REPO;
const EXT=path.resolve(__dirname,'..');
const {verifyServer}=require(path.join(EXT,'proof.js'));
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results={phase:PHASE,vscodeVersion:vscode.version,electron:process.versions.electron||null,node:process.version,extensionHostExecPath:process.execPath,checks:[],notes:[]};
function check(name,pass,detail=''){results.checks.push({name,pass:!!pass,detail:String(detail)});console.log(`[bundled-suite] ${pass?'PASS':'FAIL'} ${name} ${detail}`);}
async function waitFor(fn,timeout,interval=250){const end=Date.now()+timeout;let last;while(Date.now()<end){try{last=await fn();if(last)return last;}catch{}await sleep(interval);}return last;}
const STATE=path.join(DATA,'bundled-receiver.json'),LOG=path.join(DATA,'logs','receiver.log');
function readJSON(f){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}}
const state=()=>readJSON(STATE);
const token=()=>readJSON(path.join(DATA,'receiver-auth.json'))?.token;
async function verified(){try{await verifyServer(PORT,token(),2000);return true;}catch{return false;}}
function portFree(){return new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port:PORT});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',e=>resolve(e.code==='ECONNREFUSED'));});}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}
function launcherStarts(){try{return (fs.readFileSync(LOG,'utf8').match(/\[launcher\] started:/g)||[]).length;}catch{return 0;}}
function journal(pid){try{return fs.readFileSync(path.join(DATA,'projects',sha(pid),'events.jsonl'),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));}catch{return [];}}
async function getJSON(route){const r=await fetch(`http://127.0.0.1:${PORT}${route}`);return r.ok?r.json():null;}
async function flush(pid){await fetch(`http://127.0.0.1:${PORT}/v1/flush?id=${pid}`,{method:'POST',headers:{Authorization:`Bearer ${token()}`}}).catch(()=>{});}
// The extension's dialogs, answered as a user would; everything it says is recorded. Links are recorded, never opened.
const said=[],opened=[];let patchedLinks=false;
function patchUi(){
  const w=vscode.window;
  w.showWarningMessage=function(message){said.push(['warning',String(message)]);
    if(/Capture this workspace locally/.test(message))return Promise.resolve('Start Capture');
    if(/^Add Code Resonance's Claude Code hooks/.test(message))return Promise.resolve('Add Hooks');
    if(/^Stop the receiver Code Resonance started/.test(message))return Promise.resolve('Stop Receiver');
    return Promise.resolve(undefined);};
  w.showInformationMessage=function(message){said.push(['info',String(message)]);return Promise.resolve(undefined);};
  w.showErrorMessage=function(message){said.push(['error',String(message)]);return Promise.resolve(undefined);};
  w.showQuickPick=async items=>{const list=await items;said.push(['quickpick',list.map(i=>`${i.label}${i.description?` (${i.description})`:''}`).join(', ')]);return list.find(i=>i.label==='Claude Code');};
  // Recorded as VS Code's opener hands a Uri to the browser: encodeURI(uri.toString(true)) (OpenerService in 1.143.1),
  // which keeps the fragment's `pair=` as it is (uri.toString() alone would encode it as pair%3D).
  try{const fake=async uri=>{opened.push(encodeURI(uri.toString(true)));return true;};vscode.env.openExternal=fake;patchedLinks=vscode.env.openExternal===fake;}catch{patchedLinks=false;}
}
async function startCapture(){
  const ext=vscode.extensions.getExtension('zerobandwidth.code-resonance');
  check('the extension is the VSIX\'s own folder',!!ext&&ext.extensionPath===EXT&&fs.existsSync(path.join(EXT,'runtime','receiver','server.js')),ext?.extensionPath);
  await ext.activate();patchUi();
  await vscode.commands.executeCommand('resonance.start');
  const pid=sha(vscode.workspace.workspaceFolders[0].uri.toString());results.projectId=pid;
  return pid;
}
async function editAndSave(rel,text){
  const doc=await vscode.workspace.openTextDocument(path.join(WS,rel));const editor=await vscode.window.showTextDocument(doc,{preview:false});
  const end=doc.lineAt(doc.lineCount-1).range.end;await editor.edit(b=>b.insert(end,text));await doc.save();
}
async function first(){
  check('before capture: nothing listens on the port and no receiver was started',await portFree()&&!state()&&launcherStarts()===0,`port ${PORT}`);
  const pid=await startCapture();
  const s=await waitFor(async()=>{const x=state();return x&&await verified()?x:null;},60000,500);
  check('starting capture started the receiver the extension carries',!!s&&launcherStarts()===1,s?`process ${s.pid}`:'no receiver within 60 s');
  if(!s)return;
  results.receiverPid=s.pid;results.receiver=s;
  check('it is a separate process, in VS Code\'s own runtime',s.pid!==process.pid&&s.execPath===process.execPath&&(process.versions.electron?s.electron===process.versions.electron:s.electron===null),
    `${s.execPath}${s.electron?` (Electron ${s.electron} as Node ${s.node})`:` (Node ${s.node})`}; extension host ${process.pid}`);
  check('it runs the runtime folder inside the extension',s.runtime===path.join(EXT,'runtime'),s.runtime);
  check('it listens on the configured port, with the data directory from RESONANCE_DATA',s.port===PORT&&s.data===DATA&&await verified(),`${s.port} ${s.data}`);
  const log=fs.readFileSync(LOG,'utf8');
  check('its log is in the data directory, without a pairing link',/Receiver listening/.test(log)&&!/#pair=/.test(log),LOG);
  // Capture end to end: the workspace, its baseline, then an edit saved in the editor.
  const base=await waitFor(()=>{const j=journal(pid);return j.some(e=>e.kind==='workspace.started')&&j.some(e=>e.kind==='project.baseline');},60000,500);
  check('capture reaches the receiver (workspace.started and the baseline journaled)',base,`${journal(pid).length} events`);
  await editAndSave('src/api/server.ts','\nexport function bundledCheck(value: string) {\n  return value.trim();\n}\n');
  const saved=await waitFor(()=>{const j=journal(pid);return j.some(e=>e.kind==='document.saved'&&e.file==='src/api/server.ts')&&j.some(e=>e.kind==='document.snapshot'&&e.file==='src/api/server.ts'&&e.meta?.reason!=='baseline');},20000,500);
  check('an edit saved in the editor reaches the receiver',saved);
  const project=await waitFor(async()=>{await flush(pid);const p=await getJSON(`/api/project?id=${pid}`);return p&&p.stats.files>=8?p:null;},30000,1000);
  check('the receiver interprets it (the project has its files)',!!project,project?`files=${project.stats.files} symbols=${project.stats.symbols}`:'');
  // An agent, connected from the CR menu: the receiver plans the entries, the diff is shown, the dialog is answered.
  await vscode.commands.executeCommand('resonance.connectAgent');
  const settingsFile=path.join(WS,'.claude','settings.local.json'),adapter=path.join(DATA,'hooks','scripts','hooks','claude-code.js');
  const written=await waitFor(()=>readJSON(settingsFile),10000);
  const commands=written?Object.values(written.hooks||{}).flat().flatMap(g=>(g.hooks||[]).map(h=>h.command)):[];
  check('Connect an AI agent writes Claude Code hooks naming the stable adapter in the data directory',commands.length>=9&&commands.every(c=>c===`node ${JSON.stringify(adapter)}`)&&fs.existsSync(adapter),
    `${commands.length} entries; ${[...new Set(commands)].join(' | ')}`);
  check('nothing in the hook entries points into the extension folder',!!written&&!JSON.stringify(written).includes(EXT));
  const run=cp.spawnSync(E.CR_QUAL_NODE,[adapter],{input:JSON.stringify({hook_event_name:'SessionStart',session_id:'bundled-qual',source:'startup',cwd:WS}),env:{...process.env,RESONANCE_DATA:DATA},encoding:'utf8',timeout:20000});
  const hooked=await waitFor(()=>journal(pid).find(e=>e.kind==='agent.session.started'&&e.meta?.provider==='claude-code'),10000);
  check('the stable adapter reaches the receiver (agent session journaled for this project)',run.status===0&&!!hooked,`exit ${run.status}`);
  await vscode.commands.executeCommand('resonance.receiverStatus');
  const status=said.filter(x=>x[0]==='info').map(x=>x[1]).find(m=>/was started by Code Resonance/.test(m));
  check('Receiver Status says who started it and where',!!status&&status.includes(`127.0.0.1:${PORT}`)&&status.includes(String(s.pid)),status);
  results.notes.push(...said.map(([k,m])=>`${k}: ${m.slice(0,300)}`));
  // The window closes with capture on: VS Code ends the extension host; the receiver must outlive it.
}
async function second(){
  const firstPid=Number(E.CR_QUAL_FIRST_PID);
  const before=state();
  check('before capture: the receiver window 1 started is still running',!!before&&before.pid===firstPid&&alive(firstPid)&&await verified(),before?`process ${before.pid}`:'none');
  const pid=await startCapture();
  const base=await waitFor(()=>{const j=journal(pid);return j.some(e=>e.kind==='workspace.started')&&j.some(e=>e.kind==='project.baseline');},60000,500);
  check('capture in a second window reaches the same receiver',base,`${journal(pid).length} events for the second project`);
  check('the second window reused it: same process, no second start, no lock left',state()?.pid===firstPid&&launcherStarts()===1&&!fs.existsSync(path.join(DATA,'bundled-receiver.lock')),
    `process ${state()?.pid}, starts ${launcherStarts()}`);
  if(patchedLinks){
    await vscode.commands.executeCommand('resonance.openControlCenter');
    check('Open Control Center opens a pairing link to this receiver',opened.length===1&&new RegExp(`^http://127\\.0\\.0\\.1:${PORT}/#pair=[0-9a-f]{32}$`).test(opened[0]),opened[0]);
  }else results.checks.push({name:'Open Control Center opens a pairing link to this receiver',pass:false,unverified:true,detail:'vscode.env.openExternal could not be replaced; not opened'});
  // Stop: the dialog is answered; the launcher stops the receiver; the port is free.
  await vscode.commands.executeCommand('resonance.stopReceiver');
  const stopped=await waitFor(async()=>!state()&&!alive(firstPid)&&await portFree(),25000,250);
  check('Stop Receiver stops the receiver the extension started',stopped,`process ${firstPid} alive=${alive(firstPid)}`);
  // While capture runs, edits wait in the outbox; opening the Stage starts the receiver again and they arrive.
  await editAndSave('src/lib/format.js','\nexport const bundledAgain = true;\n');
  if(patchedLinks){
    await vscode.commands.executeCommand('resonance.openStage');
    const again=await waitFor(async()=>{const x=state();return x&&await verified()?x:null;},45000,500);
    check('opening the Stage starts it again (a new process)',!!again&&again.pid!==firstPid&&launcherStarts()===2&&opened.length===2,again?`process ${again.pid}`:'');
    const queued=await waitFor(()=>journal(pid).some(e=>e.kind==='document.saved'&&e.file==='src/lib/format.js'),20000,500);
    check('the edit queued while it was stopped arrives',queued);
    await vscode.commands.executeCommand('resonance.stopReceiver');
    await waitFor(async()=>!state()&&await portFree(),25000,250);
  }
  // A receiver started from the checkout (as npm start) is reused, and never stopped by the extension.
  const repo=cp.spawn(E.CR_QUAL_NODE,[path.join(REPO,'receiver','server.js')],{env:{...process.env,RESONANCE_DATA:DATA,RESONANCE_PORT:String(PORT)},stdio:'ignore'});
  try{
    check('a checkout\'s receiver starts on the port',await waitFor(verified,20000));
    const startsBefore=launcherStarts(),openedBefore=opened.length;
    if(patchedLinks)await vscode.commands.executeCommand('resonance.openStage');
    else await vscode.commands.executeCommand('resonance.receiverStatus');
    await sleep(1500);
    check('it is reused: nothing is started by the extension',!state()&&launcherStarts()===startsBefore&&(!patchedLinks||opened.length===openedBefore+1),`starts ${launcherStarts()}`);
    const count=said.length;
    await vscode.commands.executeCommand('resonance.stopReceiver');
    const reply=said.slice(count).map(x=>x[1]).join(' | ');
    check('Stop Receiver leaves it alone and says so',/was not started by this extension/.test(reply)&&await verified()&&repo.exitCode===null,reply);
  }finally{repo.kill('SIGTERM');await new Promise(r=>{if(repo.exitCode!==null)return r();repo.once('exit',r);setTimeout(r,10000);});}
  await vscode.commands.executeCommand('resonance.stop');
  results.notes.push(...said.map(([k,m])=>`${k}: ${m.slice(0,300)}`));
}
async function run(){
  try{if(PHASE==='first')await first();else await second();}
  catch(e){results.checks.push({name:'suite completed without exceptions',pass:false,detail:String(e&&e.stack||e).slice(0,1500)});}
  finally{fs.writeFileSync(E.CR_QUAL_RESULT,JSON.stringify(results,null,2));}
}
module.exports={run};

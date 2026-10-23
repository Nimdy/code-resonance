'use strict';
// Runs inside a real VS Code extension host. Drives the editor like a user, writes files like an agent,
// and checks what the receiver actually recorded. Results are written as JSON for run.js to report.
const vscode=require('vscode');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const {monitorEventLoopDelay,performance}=require('node:perf_hooks');
const E=process.env;
const REPO=E.CR_QUAL_REPO,PORT=Number(E.CR_QUAL_PORT),WS=E.CR_QUAL_WORKSPACE,PHASE=E.CR_QUAL_PHASE;
const DATA=path.join(E.HOME,'.code-resonance');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results={phase:PHASE,vscodeVersion:vscode.version,remoteName:vscode.env.remoteName||null,platform:process.platform,checks:[],measurements:{},notes:[]};
const step=label=>console.log(`[suite ${PHASE} ${new Date().toISOString().slice(11,19)}] ${label}`);
function check(name,pass,detail='',extra={}){results.checks.push({name,pass:!!pass,detail:String(detail),...extra});console.log(`[suite] ${pass?'PASS':'FAIL'} ${name} ${detail}`);}
function unverified(name,detail){results.checks.push({name,pass:false,unverified:true,detail});}
async function waitFor(fn,timeout,interval=250){const end=Date.now()+timeout;let last;while(Date.now()<end){try{last=await fn();if(last)return last;}catch{}await sleep(interval);}return last;}

let receiver=null;
async function startReceiver(){
  receiver=cp.spawn(E.CR_QUAL_NODE,[path.join(REPO,'receiver','server.js')],{env:{...process.env,RESONANCE_DATA:DATA,RESONANCE_PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
  receiver.stdout.on('data',()=>{});receiver.stderr.on('data',d=>results.notes.push('receiver stderr: '+String(d).slice(0,300)));
  const ok=await waitFor(async()=>(await fetch(`http://127.0.0.1:${PORT}/health`)).ok,15000);
  if(!ok)throw new Error('receiver did not start');
}
async function stopReceiver(){if(!receiver)return;const r=receiver;receiver=null;r.kill('SIGTERM');await new Promise(res=>{if(r.exitCode!==null)return res();r.once('exit',res);});}
function token(){return JSON.parse(fs.readFileSync(path.join(DATA,'receiver-auth.json'),'utf8')).token;}
async function flush(pid){await fetch(`http://127.0.0.1:${PORT}/v1/flush?id=${pid}`,{method:'POST',headers:{Authorization:`Bearer ${token()}`}});}
async function getJSON(route){const r=await fetch(`http://127.0.0.1:${PORT}${route}`);return r.ok?r.json():null;}
async function getText(route){const r=await fetch(`http://127.0.0.1:${PORT}${route}`);return r.text();}
function journal(pid){try{return fs.readFileSync(path.join(DATA,'projects',sha(pid),'events.jsonl'),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));}catch{return [];}}
function journalText(pid){try{return fs.readFileSync(path.join(DATA,'projects',sha(pid),'events.jsonl'),'utf8');}catch{return '';}}
// The export's timeline is the recorded performance: one entry per window, each carrying its cues.
async function cues(pid){await flush(pid);const x=await getJSON(`/api/export?id=${pid}`);return x?x.timeline.flatMap(e=>e.cues):[];}
const fileId=f=>sha(f).slice(0,14);

let consentPrompts=0;
function patchConsent(){
  // Same API instance as the extension (suite lives in the extension folder), so this answers its modal.
  const original=vscode.window.showWarningMessage;
  vscode.window.showWarningMessage=function(message,...rest){
    if(/Capture this workspace locally/.test(String(message))){consentPrompts++;return Promise.resolve('Start Capture');}
    return original.call(this,message,...rest);
  };
}
async function editorFor(rel){const doc=await vscode.workspace.openTextDocument(path.join(WS,rel));return vscode.window.showTextDocument(doc,{preview:false});}
function moveToEnd(editor){const end=editor.document.lineAt(editor.document.lineCount-1).range.end;editor.selection=new vscode.Selection(end,end);}
async function typeText(editor,text){
  const latencies=[];
  for(const ch of text){
    const t0=performance.now();
    const changed=new Promise(res=>{const d=vscode.workspace.onDidChangeTextDocument(e=>{if(e.document===editor.document&&e.contentChanges.length){d.dispose();res();}});setTimeout(()=>{d.dispose();res();},2000);});
    await vscode.commands.executeCommand('type',{text:ch});
    await changed;latencies.push(performance.now()-t0);
  }
  return latencies;
}
function pct(values,p){const s=[...values].sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.floor(p/100*s.length))]:0;}
function summarize(lat){return {n:lat.length,p50:+pct(lat,50).toFixed(2),p95:+pct(lat,95).toFixed(2),p99:+pct(lat,99).toFixed(2),max:+Math.max(...lat).toFixed(2)};}
function outboxDir(pid){return path.join(E.CR_QUAL_ROOT,'user-data','User','globalStorage','zerobandwidth.code-resonance','outbox',pid);}
function outboxFiles(pid){try{return fs.readdirSync(outboxDir(pid)).filter(n=>n.endsWith('.json'));}catch{return [];}}
async function measureTyping(editor,text,pid){
  const h=monitorEventLoopDelay({resolution:1});const seen=new Set();let watcher=null;
  try{watcher=fs.watch(outboxDir(pid),(_,name)=>{if(name&&name.endsWith('.json'))seen.add(name);});}catch{}
  const cpu0=process.cpuUsage();h.enable();
  const lat=await typeText(editor,text);
  h.disable();const cpu=process.cpuUsage(cpu0);watcher?.close();
  return {keystroke:summarize(lat),eventLoopDelayMs:{p50:+(h.percentile(50)/1e6).toFixed(2),p99:+(h.percentile(99)/1e6).toFixed(2),max:+(h.max/1e6).toFixed(2)},
    cpuMsPerKeystroke:+((cpu.user+cpu.system)/1000/lat.length).toFixed(3),outboxBatchFilesWritten:seen.size};
}
function rssMB(pid){try{const m=fs.readFileSync(`/proc/${pid}/status`,'utf8').match(/VmRSS:\s+(\d+)/);return m?+(Number(m[1])/1024).toFixed(1):null;}catch{return null;}}

async function mainPhase(){
  const folder=vscode.workspace.workspaceFolders[0];const pid=sha(folder.uri.toString());results.projectId=pid;
  results.measurements.workspaceUri=folder.uri.toString();
  patchConsent();
  const ext=vscode.extensions.getExtension('zerobandwidth.code-resonance');
  check('extension present in extension host',!!ext);await ext.activate();
  step('receiver + editor warm-up');
  await startReceiver();
  const app=await editorFor('src/ui/App.tsx');moveToEnd(app);
  await typeText(app,'\n// warm up the editor and language service before measuring\n');
  const marker='QUAL_PRIVACY_MARKER_'+crypto.randomBytes(4).toString('hex');
  const sample=`\n// ${marker} measuring keystroke overhead while typing ordinary code comments\n`.repeat(3);
  results.measurements.captureOff=await measureTyping(app,sample.replace(marker,'offmarker'),pid);
  await vscode.commands.executeCommand('workbench.action.files.revert');

  step('start capture');
  await vscode.commands.executeCommand('resonance.start');
  check('consent prompt shown once and accepted',consentPrompts===1,`prompts=${consentPrompts}`);
  const baseline=await waitFor(async()=>{await flush(pid);const p=await getJSON(`/api/project?id=${pid}`);return p&&p.stats.baselines>=1&&p.stats.files>=8?p:null;},60000,1000);
  check('baseline indexed the workspace',!!baseline,baseline?`files=${baseline.stats.files} symbols=${baseline.stats.symbols}`:'timed out');
  check('baseline not credited as new work',baseline&&baseline.stats.created===0,baseline?`created=${baseline.stats.created}`:'');
  await sleep(1500);
  const app2=await editorFor('src/ui/App.tsx');moveToEnd(app2);
  results.measurements.captureOn=await measureTyping(app2,sample,pid);
  results.measurements.extensionHostRssMB=+(process.memoryUsage().rss/1e6).toFixed(1);
  await app2.document.save();

  step('human editor typing');
  // Human editor path: real keystrokes through the `type` command.
  const list=await editorFor('src/ui/TodoList.tsx');moveToEnd(list);
  await typeText(list,'\nexport function TodoCount({ count }: { count: number }) {\n  return <span>{count}</span>;\n}\n');
  await list.document.save();
  const server=await editorFor('src/api/server.ts');server.selection=new vscode.Selection(0,0,0,0);
  await typeText(server,"import { formatTitle } from '../lib/format.js';\n");moveToEnd(server);
  await typeText(server,'\nexport const MAX_TITLE = 80;\nexport function normalize(title: string) {\n  const clean = formatTitle(title);\n  return clean.slice(0, MAX_TITLE);\n}\n');
  await server.document.save();
  // Snapshot debounce (1.2 s) + outbox persist/delivery (up to ~2.5 s): wait for the outcome rather than a fixed time.
  const typed=(tl)=>({component:tl.some(c=>c.type==='symbol.created'&&c.detail.symbolType==='ui.component'&&c.detail.fileId===fileId('src/ui/TodoList.tsx')),
    fn:tl.some(c=>c.type==='symbol.created'&&c.detail.symbolType==='function'&&c.detail.fileId===fileId('src/api/server.ts')),
    dep:tl.some(c=>c.type==='dependency.added'&&c.detail.fileId===fileId('src/api/server.ts')),
    variables:tl.filter(c=>c.type==='symbol.created'&&c.detail.symbolType==='variable'&&c.detail.fileId===fileId('src/api/server.ts')).length});
  let tl=[];const seen=await waitFor(async()=>{tl=await cues(pid);const t=typed(tl);return t.component&&t.fn&&t.dep&&t.variables?t:null;},20000,1000)||typed(tl);
  check('typed React component classified as ui.component (human editor)',seen.component);
  check('typed function classified as function',seen.fn);
  check('typed import classified as dependency.added',seen.dep);
  // Module-level constants are structure; locals inside a function are recorded but earn no cue (interpretation v2+).
  check('typed module-level variable classified as variable; local variable not credited',seen.variables===1,`variable cues=${seen.variables}`);
  const raw=journal(pid);
  // v0.2 sent one document.change per keystroke (with text); newer extensions send per-second document.edits counts.
  const edits=raw.filter(e=>e.kind==='document.change'||e.kind==='document.edits');
  check('editor keystrokes are observed (document.change or document.edits)',edits.length>0,`document.change=${raw.filter(e=>e.kind==='document.change').length} document.edits=${raw.filter(e=>e.kind==='document.edits').length}`);

  step('agent-like external writes');
  // Agent-like path: files written outside the editor (not open in VS Code).
  fs.writeFileSync(path.join(WS,'src/api/stats.ts'),"import { listTodos } from './todos';\n\nexport function countDone() {\n  return listTodos().filter(t => t.done).length;\n}\n");
  fs.appendFileSync(path.join(WS,'src/lib/format.js'),"\nexport function slugify(text) {\n  return formatTitle(text).toLowerCase().replace(/ /g, '-');\n}\n");
  const external=await waitFor(()=>{const j=journal(pid);const a=j.find(e=>e.kind==='document.snapshot'&&e.file==='src/api/stats.ts'&&e.meta?.source==='filesystem-watcher');const b=j.find(e=>e.kind==='document.snapshot'&&e.file==='src/lib/format.js'&&e.meta?.reason==='external');return a&&b?{a,b}:null;},20000);
  check('file written outside the editor is observed (watcher snapshot)',!!external,external?'stats.ts created + format.js modified':'not observed within 20s');
  check('external file creation emits file.created',journal(pid).some(e=>e.kind==='file.created'&&e.file==='src/api/stats.ts'));
  tl=await cues(pid);
  check('external write classified (function created in stats.ts)',tl.some(c=>c.type==='symbol.created'&&c.detail.symbolType==='function'&&c.detail.fileId===fileId('src/api/stats.ts')));
  check('external change attributed origin unknown, not AI',journal(pid).filter(e=>e.file==='src/api/stats.ts').every(e=>e.origin==='unknown'));

  step('file operations');
  // VS Code file operations.
  const we=new vscode.WorkspaceEdit();const created=vscode.Uri.file(path.join(WS,'src/lib/tmp-note.md'));
  we.createFile(created,{ignoreIfExists:true});await vscode.workspace.applyEdit(we);
  const we2=new vscode.WorkspaceEdit();const renamed=vscode.Uri.file(path.join(WS,'src/lib/tmp-renamed.md'));we2.renameFile(created,renamed);await vscode.workspace.applyEdit(we2);
  const we3=new vscode.WorkspaceEdit();we3.deleteFile(renamed);await vscode.workspace.applyEdit(we3);
  const fileOps=await waitFor(()=>{const j=journal(pid);return j.some(e=>e.kind==='file.renamed'&&e.file==='src/lib/tmp-renamed.md')&&j.some(e=>e.kind==='file.deleted'&&e.file==='src/lib/tmp-renamed.md');},10000);
  check('workspace create/rename/delete observed',!!fileOps);

  step('tasks');
  // Tasks: real npm test, passing then failing.
  const tasks=await vscode.tasks.fetchTasks();const testTask=tasks.find(t=>t.name==='npm test');
  async function runTask(t){const exec=await vscode.tasks.executeTask(t);return new Promise(res=>{const d=vscode.tasks.onDidEndTaskProcess(e=>{if(e.execution===exec){d.dispose();res(e.exitCode);}});setTimeout(()=>res('timeout'),60000);});}
  if(!testTask)check('npm test task available',false,'task not found');
  else{
    const ok=await runTask(testTask);
    const formatPath=path.join(WS,'src/lib/format.js');const good=fs.readFileSync(formatPath,'utf8');
    fs.writeFileSync(formatPath,good.replace("count === 1 ? '' : 's'","count === 1 ? 's' : ''"));
    const bad=await runTask(testTask);fs.writeFileSync(formatPath,good);
    await waitFor(async()=>{tl=await cues(pid);return tl.some(c=>c.type==='validation.test.failed');},15000,1000);
    check('task npm test exit codes observed (pass then fail)',ok===0&&bad===1,`exit=${ok},${bad}`);
    check('passing task classified validation.test.passed',tl.some(c=>c.type==='validation.test.passed'));
    check('failing task classified validation.test.failed',tl.some(c=>c.type==='validation.test.failed'));
  }

  step('terminal');
  // Integrated terminal with shell integration.
  const term=vscode.window.createTerminal({name:'qualification',cwd:WS});term.show();
  const si=await new Promise(res=>{if(term.shellIntegration)return res(term.shellIntegration);const d=vscode.window.onDidChangeTerminalShellIntegration(e=>{if(e.terminal===term){d.dispose();res(e.shellIntegration);}});setTimeout(()=>{d.dispose();res(null);},25000);});
  if(!si)unverified('terminal command lifecycle via shell integration','shell integration did not activate in this headless instance');
  else{
    const exec=si.executeCommand('npm test');
    const exit=await new Promise(res=>{const d=vscode.window.onDidEndTerminalShellExecution(e=>{if(e.execution===exec){d.dispose();res(e.exitCode);}});setTimeout(()=>res('timeout'),60000);});
    await sleep(1500);const j=journal(pid);
    const started=j.filter(e=>e.kind==='terminal.command.started'),finished=j.filter(e=>e.kind==='terminal.command.finished');
    check('terminal command start/finish observed',started.length>0&&finished.length>0,`exit=${exit} started=${started.length} finished=${finished.length}`);
    check('terminal command text NOT recorded by default',started.every(e=>!e.meta?.command));
    tl=await cues(pid);
    check('terminal `npm test` recognized as a test run',tl.filter(c=>c.type==='validation.test.passed').length>=2,'v0.2 classifies tests from task names only');
  }
  term.dispose();

  step('diagnostics');
  // Diagnostics from the built-in TypeScript service.
  const todos=await editorFor('src/api/todos.ts');moveToEnd(todos);
  await typeText(todos,"\nconst broken: number = 'text';\n");await todos.document.save();
  const diag=await waitFor(()=>vscode.languages.getDiagnostics(todos.document.uri).some(d=>d.severity===vscode.DiagnosticSeverity.Error),45000,500);
  if(!diag)unverified('diagnostics observed','TypeScript service reported no error within 45s');
  else check('diagnostics with errors recorded',!!await waitFor(()=>journal(pid).some(e=>e.kind==='diagnostics.updated'&&e.file==='src/api/todos.ts'&&e.meta?.errors>0),15000,500));
  await vscode.commands.executeCommand('undo');await vscode.commands.executeCommand('undo');await todos.document.save();

  step('git');
  // Git: commit from the command line, observed through the built-in Git extension.
  cp.execFileSync('git',['add','-A'],{cwd:WS});
  cp.execFileSync('git',['-c','user.name=Q','-c','user.email=q@example.invalid','commit','-qm','qualification commit'],{cwd:WS});
  const head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:WS,encoding:'utf8'}).trim();
  const commit=await waitFor(()=>journal(pid).find(e=>e.kind==='repository.commit.observed'&&e.meta?.commit===head),30000,500);
  check('git commit observed with matching hash',!!commit);

  // Project identity used by agent hooks must equal the extension's (real vscode.Uri vs our encoder).
  const {vscodeFileUri,projectIdForRoot}=require(path.join(REPO,'sdk','project-id.js'));
  const samples=[WS,'/tmp/with space/a','/tmp/a+b(c)/ü#x',"/tmp/it's/[x]"];
  const mismatches=samples.filter(p=>vscodeFileUri(p)!==vscode.Uri.file(p).toString());
  check('hook project id encoding equals vscode.Uri.file().toString()',!mismatches.length&&projectIdForRoot(WS)===pid,mismatches.map(p=>`${p}: ${vscodeFileUri(p)} vs ${vscode.Uri.file(p).toString()}`).join('; '));
  if(E.CR_QUAL_AGENT==='claude')await agentScenario(pid);
  else unverified('real AI agent (Claude Code hooks) observed alongside the extension','set CR_QUAL_AGENT=claude to run a real, budget-capped Claude Code session');

  step('receiver outage');
  // Receiver outage: events must queue on disk and arrive after restart.
  await stopReceiver();
  fs.writeFileSync(path.join(WS,'src/lib/offline.js'),'export function whileOffline() {\n  return true;\n}\n');
  const fmt=await editorFor('src/lib/format.js');moveToEnd(fmt);await typeText(fmt,'\n// edited while receiver offline\n');await fmt.document.save();
  const queued=await waitFor(()=>outboxFiles(pid).length>0?outboxFiles(pid).length:0,10000);
  check('events queue on disk while receiver is offline',queued>0,`outbox batch files=${queued}`);
  await startReceiver();
  const drained=await waitFor(()=>outboxFiles(pid).length===0,30000,500);
  check('outbox drains after receiver restart',!!drained);
  check('offline-period events delivered after restart',journal(pid).some(e=>e.kind==='document.snapshot'&&e.file==='src/lib/offline.js'));

  step('ordering + privacy');
  // Ordering, duplicates and privacy of what was persisted.
  const all=journal(pid).filter(e=>e.sessionId&&e.origin==='unknown');let inversions=0;const bySession=new Map();
  for(const e of all){const last=bySession.get(e.sessionId);if(last!==undefined&&e.ts<last)inversions++;bySession.set(e.sessionId,e.ts);}
  const ids=journal(pid).map(e=>e.id);
  check('journal preserves per-session event order',inversions===0,`inversions=${inversions} of ${all.length}`);
  results.measurements.journal={events:ids.length,duplicates:ids.length-new Set(ids).size,bytes:journalText(pid).length};
  const publicText=(await Promise.all([`/api/project?id=${pid}`,`/api/replay?id=${pid}`,`/v1/performance/frames?id=${pid}`,`/api/export?id=${pid}`,'/api/projects'].map(getText))).join('\n');
  check('public Stage APIs never contain typed text or file paths',!publicText.includes(marker)&&!publicText.includes('TodoList')&&!publicText.includes('src/'));
  check('raw typed text not persisted in the event journal',!journalText(pid).includes(marker));
  const cfg=vscode.workspace.getConfiguration('resonance');await cfg.update('captureDocumentContents',false,vscode.ConfigurationTarget.Global);
  const marker2='QUAL_CONTENT_OFF_'+crypto.randomBytes(4).toString('hex');
  const app3=await editorFor('src/ui/App.tsx');moveToEnd(app3);await typeText(app3,`\n// ${marker2}\n`);await app3.document.save();await sleep(4000);
  check('captureDocumentContents=false keeps typed text out of the journal',!journalText(pid).includes(marker2));
  await cfg.update('captureDocumentContents',true,vscode.ConfigurationTarget.Global);
  results.measurements.receiverRssMB=rssMB(receiver.pid);
  // Leave capture running so the restart phase can verify auto-resume.
  await stopReceiver();
}

// A real Claude Code session edits the workspace while the extension watches; hooks report what the agent did.
async function agentScenario(pid){
  step('real Claude Code agent session');
  cp.execFileSync(E.CR_QUAL_NODE,[path.join(REPO,'scripts','hooks','install-claude-code.js'),WS]);
  const prompt='In this repository, add an exported function countOpen() to src/api/todos.ts that returns how many todos are not done. '+
    "Then add one test to test/format.test.mjs asserting pluralize(0, 'task') equals '0 tasks'. Finally run `npm test` once. Keep changes minimal.";
  const env={...process.env,HOME:E.CR_QUAL_REAL_HOME,RESONANCE_DATA:DATA,RESONANCE_PORT:String(PORT)};
  for(const k of Object.keys(env))if(/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_AGENT_SDK|CLAUDE_EFFORT|ELECTRON_|VSCODE_)/.test(k))delete env[k];
  const started=Date.now();
  const run=cp.spawnSync(E.CR_QUAL_CLAUDE||'claude',['-p',prompt,'--model','haiku','--max-budget-usd','0.50','--permission-mode','acceptEdits',
    '--allowedTools','Read','Edit','Write','Glob','Grep','Bash(npm test)','--output-format','json'],{cwd:WS,env,encoding:'utf8',timeout:300000});
  let summary={};try{summary=JSON.parse(run.stdout);}catch{}
  results.measurements.agentRun={exitCode:run.status,seconds:Math.round((Date.now()-started)/1000),turns:summary.num_turns??null,costUsd:summary.total_cost_usd??null,error:run.error?.message||null,stderr:(run.stderr||'').slice(0,300)};
  check('Claude Code session completed',run.status===0,JSON.stringify(results.measurements.agentRun));
  await sleep(4000);
  const j=journal(pid).filter(e=>e.origin==='hook');
  const kinds=[...new Set(j.map(e=>e.kind))].sort();
  results.measurements.agentHookKinds=kinds;
  check('hook events reach the same project as the extension',j.some(e=>e.kind==='agent.prompt.submitted'&&e.meta?.provider==='claude-code'),kinds.join(','));
  check('agent prompt text is not persisted (length + fingerprint only)',!journalText(pid).includes('Keep changes minimal'));
  const touched=j.filter(e=>e.kind==='agent.file.modified').map(e=>e.file);
  check('agent file modifications reported with project-relative paths',touched.includes('src/api/todos.ts'),touched.join(','));
  const watcher=journal(pid).find(e=>e.kind==='document.snapshot'&&e.file==='src/api/todos.ts'&&e.ts>=started&&e.origin==='unknown');
  check('extension independently observed the agent-written file',!!watcher,watcher?`via ${watcher.meta?.source||watcher.meta?.reason}`:'no snapshot');
  const tl=await cues(pid);
  const attributed=tl.filter(c=>c.ts>=started&&c.detail?.attribution==='correlated'&&c.detail.fileId===fileId('src/api/todos.ts'));
  check('agent change attributed by correlation (not assumed)',attributed.some(c=>c.type==='symbol.created'),attributed.map(c=>c.type+':'+c.detail.symbolType).join(','));
  const bash=j.filter(e=>e.kind==='agent.tool.completed'&&e.meta?.tool==='Bash');
  check('agent test run classified as test with exit code',bash.some(e=>e.meta.category==='test'&&typeof e.meta.exitCode==='number'),bash.map(e=>`${e.meta.category}:${e.meta.exitCode}`).join(','));
  check('agent test run contributes a validation cue',tl.some(c=>c.ts>=started&&/^validation\.test\.(passed|failed)$/.test(c.type)));
}

async function restartPhase(){
  const folder=vscode.workspace.workspaceFolders[0];const pid=sha(folder.uri.toString());
  patchConsent();
  const before=new Set(journal(pid).map(e=>e.sessionId));
  await startReceiver();
  const ext=vscode.extensions.getExtension('zerobandwidth.code-resonance');await ext.activate();
  const resumed=await waitFor(()=>journal(pid).find(e=>e.kind==='workspace.started'&&!before.has(e.sessionId)),30000,500);
  const fresh=journal(pid).filter(e=>!before.has(e.sessionId));
  results.measurements.restart={extensionActive:ext.isActive,newSessions:[...new Set(fresh.map(e=>e.sessionId))].length,newKinds:[...new Set(fresh.map(e=>e.kind))],outboxBacklog:outboxFiles(pid).length};
  check('capture auto-resumes after VS Code restart without a new prompt',!!resumed&&consentPrompts===0,`prompts=${consentPrompts} ${JSON.stringify(results.measurements.restart)}`);
  const ed=await editorFor('src/index.ts');moveToEnd(ed);await typeText(ed,'\nexport const resumed = true;\n');await ed.document.save();
  const after=await waitFor(()=>journal(pid).find(e=>e.kind==='document.snapshot'&&e.file==='src/index.ts'&&e.sessionId===resumed?.sessionId&&e.meta?.reason==='edit'),15000);
  check('edits after restart are captured in the new session',!!after);
  await vscode.commands.executeCommand('resonance.stop');
  const stopped=await waitFor(()=>journal(pid).find(e=>e.kind==='workspace.stopped'&&e.sessionId===resumed?.sessionId),15000);
  check('stop command delivers workspace.stopped',!!stopped);
  await stopReceiver();
}

async function run(){
  try{if(PHASE==='main')await mainPhase();else await restartPhase();}
  catch(e){results.checks.push({name:'suite completed without exceptions',pass:false,detail:String(e&&e.stack||e).slice(0,1500)});}
  finally{await stopReceiver().catch(()=>{});fs.writeFileSync(E.CR_QUAL_RESULT,JSON.stringify(results,null,2));}
}
module.exports={run};

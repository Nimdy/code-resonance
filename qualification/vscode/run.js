'use strict';
// Real VS Code extension-host qualification. Run under a display (e.g. `xvfb-run -a npm run vscode`).
// Everything is isolated in a temp root: HOME, receiver data, VS Code user-data and extensions directories.
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const net=require('node:net');
const cp=require('node:child_process');
const {downloadAndUnzipVSCode,resolveCliArgsFromVSCodeExecutablePath,runTests}=require('@vscode/test-electron');
const REPO=path.resolve(__dirname,'../..');
const VERSION=process.env.CR_QUAL_VSCODE_VERSION||'stable';
// When launched from a VS Code terminal or extension, these variables make the test instance run as plain Node
// (ELECTRON_RUN_AS_NODE) or forward CLI commands into the *user's* running VS Code (VSCODE_IPC_HOOK_CLI).
for(const key of Object.keys(process.env))if(/^(ELECTRON_|VSCODE_)/.test(key))delete process.env[key];
process.env.DONT_PROMPT_WSL_INSTALL='1'; // the Linux `code` launcher otherwise blocks on an interactive WSL prompt
// Under WSLg, XDG_RUNTIME_DIR (/run/user/<uid>) stalls VS Code's main process before it opens a window (found by
// bisecting the environment); without it VS Code keeps its IPC socket in the short user-data path. WAYLAND_DISPLAY
// is removed so the test window renders on Xvfb and never on the user's desktop.
delete process.env.XDG_RUNTIME_DIR;delete process.env.WAYLAND_DISPLAY;

const log=(...a)=>console.log(`[qual ${new Date().toISOString().slice(11,19)}]`,...a);
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});s.on('error',reject);});}
function git(cwd,...args){cp.execFileSync('git',args,{cwd,stdio:'pipe',env:{...process.env,GIT_AUTHOR_NAME:'Qualification',GIT_AUTHOR_EMAIL:'qual@example.invalid',GIT_COMMITTER_NAME:'Qualification',GIT_COMMITTER_EMAIL:'qual@example.invalid'}});}

// What the extension persisted in VS Code's workspace storage (SQLite), read between phases as evidence.
function readWorkspaceState(userData){
  const root=path.join(userData,'User','workspaceStorage');const out={};
  try{for(const dir of fs.readdirSync(root)){
    const db=path.join(root,dir,'state.vscdb');if(!fs.existsSync(db))continue;
    const r=cp.spawnSync('python3',['-c','import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);r=c.execute("select value from ItemTable where key=?",("zerobandwidth.code-resonance",)).fetchone();print(r[0] if r else "")',db],{encoding:'utf8',timeout:10000});
    out[dir]=r.stdout.trim()||null;
  }}catch(e){out.error=e.message;}
  return out;
}
// VS Code keeps workspace storage in memory while extension tests run, so "resume after restart" cannot be observed
// from a test run. This phase seeds the extension's persisted flag into the real state.vscdb and launches VS Code
// normally (no test runner), then checks that capture resumes on its own, without a consent prompt.
async function resumePhase({dirs,port,vscodePath}){
  const sha=s=>require('node:crypto').createHash('sha256').update(String(s)).digest('hex');
  const result={checks:[],notes:[]};
  const check=(name,pass,detail='')=>result.checks.push({name,pass:!!pass,detail:String(detail)});
  const storage=path.join(dirs.userData,'User','workspaceStorage');
  const id=fs.readdirSync(storage).find(d=>{try{return JSON.parse(fs.readFileSync(path.join(storage,d,'meta.json'),'utf8')).name===path.basename(dirs.workspace);}catch{return false;}});
  if(!id){check('workspace storage located',false);return result;}
  const seeded=cp.spawnSync('python3',['-c','import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("create table if not exists ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");c.execute("insert into ItemTable values(?,?)",("zerobandwidth.code-resonance",\'{"resonanceRecording":true}\'));c.commit()',path.join(storage,id,'state.vscdb')],{encoding:'utf8'});
  check('persisted resume flag seeded in state.vscdb',seeded.status===0,seeded.stderr);
  const data=path.join(dirs.home,'.code-resonance');
  const receiver=cp.spawn(process.execPath,[path.join(REPO,'receiver','server.js')],{env:{...process.env,RESONANCE_DATA:data,RESONANCE_PORT:String(port)},stdio:'ignore'});
  const journalFile=fs.readdirSync(path.join(data,'projects')).map(d=>path.join(data,'projects',d,'events.jsonl')).find(f=>fs.existsSync(f));
  const sessionsBefore=new Set(fs.readFileSync(journalFile,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l).sessionId));
  const code=cp.spawn(vscodePath,[dirs.workspace,`--user-data-dir=${dirs.userData}`,`--extensions-dir=${dirs.extensions}`,`--extensionDevelopmentPath=${dirs.ext}`,'--no-sandbox','--disable-gpu','--skip-welcome','--skip-release-notes','--disable-workspace-trust'],
    {env:{...process.env,HOME:dirs.home},stdio:'ignore',detached:true});
  let resumed=null;const deadline=Date.now()+90000;
  while(Date.now()<deadline&&!resumed){
    await new Promise(r=>setTimeout(r,1000));
    const events=fs.readFileSync(journalFile,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(e=>!sessionsBefore.has(e.sessionId));
    const started=events.find(e=>e.kind==='workspace.started');
    if(started&&events.some(e=>e.kind==='project.baseline'))resumed={session:started.sessionId,kinds:[...new Set(events.map(e=>e.kind))]};
  }
  check('capture resumes after a normal VS Code restart, with no prompt (new session + baseline)',!!resumed,JSON.stringify(resumed));
  try{process.kill(-code.pid,'SIGTERM');}catch{}
  await new Promise(r=>setTimeout(r,2000));try{process.kill(-code.pid,'SIGKILL');}catch{}
  receiver.kill('SIGTERM');
  return result;
}
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-vscode-qual-'));
  const dirs={home:path.join(root,'home'),userData:path.join(root,'user-data'),extensions:path.join(root,'extensions'),workspace:path.join(root,'workspace','sample-app'),ext:path.join(root,'ext')};
  for(const d of Object.values(dirs))fs.mkdirSync(d,{recursive:true});
  const scenario=process.env.CR_QUAL_SCENARIO;
  if(scenario==='construct'){
    // An almost empty repository: the recorded project starts from nothing.
    dirs.workspace=path.join(root,'workspace','lumen-recipes');fs.mkdirSync(dirs.workspace,{recursive:true});
    fs.writeFileSync(path.join(dirs.workspace,'package.json'),JSON.stringify({name:'lumen-recipes',private:true,type:'module',scripts:{test:'node --test'}},null,2)+'\n');
    fs.writeFileSync(path.join(dirs.workspace,'README.md'),'# Lumen Recipes\n\nA small recipe collection app.\n');
    fs.writeFileSync(path.join(dirs.workspace,'.gitignore'),'node_modules/\n');
  }else fs.cpSync(path.join(__dirname,'../fixtures/sample-app'),dirs.workspace,{recursive:true});
  git(dirs.workspace,'init','-q','-b','main');git(dirs.workspace,'add','-A');git(dirs.workspace,'commit','-q','-m','initial sample');
  // The suite must live inside the extension folder so VS Code hands it the same `vscode` API instance as the
  // extension (needed to answer the modal consent prompt). Extension sources are copied byte-for-byte.
  // CR_QUAL_EXTENSION_REF qualifies the extension exactly as committed at a git revision (e.g. a release baseline).
  const ref=process.env.CR_QUAL_EXTENSION_REF;
  const files=ref?cp.execFileSync('git',['ls-tree','--name-only',`${ref}:extension`],{cwd:REPO,encoding:'utf8'}).split('\n').filter(f=>/\.(js|json|md)$/.test(f)):fs.readdirSync(path.join(REPO,'extension')).filter(f=>/\.(js|json|md)$/.test(f));
  for(const f of files)fs.writeFileSync(path.join(dirs.ext,f),ref?cp.execFileSync('git',['show',`${ref}:extension/${f}`],{cwd:REPO}):fs.readFileSync(path.join(REPO,'extension',f)));
  log(`extension under test: ${ref?`git ${ref}`:'working tree'} (${files.join(', ')})`);
  fs.cpSync(path.join(__dirname,'suite'),path.join(dirs.ext,'qualification-suite'),{recursive:true});
  const port=await freePort();
  fs.mkdirSync(path.join(dirs.userData,'User'),{recursive:true});
  fs.writeFileSync(path.join(dirs.userData,'User','settings.json'),JSON.stringify({
    'resonance.receiverPort':port,'security.workspace.trust.enabled':false,'telemetry.telemetryLevel':'off',
    'extensions.autoUpdate':false,'update.mode':'none','workbench.startupEditor':'none','git.autofetch':false,
    'terminal.integrated.shellIntegration.enabled':true,'editor.autoClosingBrackets':'never','editor.autoClosingQuotes':'never',
    'editor.autoIndent':'none','editor.formatOnType':false,'editor.quickSuggestions':{other:false,comments:false,strings:false},'editor.suggestOnTriggerCharacters':false,
    'editor.acceptSuggestionOnEnter':'off','editor.autoClosingOvertype':'never','editor.autoSurround':'never','files.autoSave':'off','terminal.integrated.defaultProfile.linux':'bash'
  },null,2));

  const vscodePath=await downloadAndUnzipVSCode(VERSION);
  const [cli,...defaults]=resolveCliArgsFromVSCodeExecutablePath(vscodePath);
  const cliArgs=defaults.filter(a=>!/^--(extensions-dir|user-data-dir)=/.test(a));
  const report={startedAt:new Date().toISOString(),extensionRef:process.env.CR_QUAL_EXTENSION_REF||'working-tree',vscode:{executable:vscodePath},root,port,phases:{}};
  report.vscode.version=cp.execFileSync(cli,[...cliArgs,'--version'],{encoding:'utf8',timeout:60000}).split('\n')[0];
  log(`VS Code ${report.vscode.version} at ${vscodePath}; workspace ${dirs.workspace}`);

  // 1) The packaged VSIX installs through the real VS Code CLI.
  const vsix=path.join(root,'code-resonance.vsix');
  cp.execFileSync(process.execPath,[path.join(REPO,'scripts/package-vsix.js'),vsix],{stdio:'pipe'});
  const vsixExtDir=path.join(root,'vsix-install-check');
  log('installing packaged VSIX through the VS Code CLI');
  const install=cp.spawnSync(cli,[...cliArgs,'--extensions-dir',vsixExtDir,'--user-data-dir',path.join(root,'vsix-user'),'--install-extension',vsix],{encoding:'utf8',timeout:120000});
  const listed=cp.spawnSync(cli,[...cliArgs,'--extensions-dir',vsixExtDir,'--user-data-dir',path.join(root,'vsix-user'),'--list-extensions','--show-versions'],{encoding:'utf8',timeout:60000});
  log(`VSIX install exit ${install.status}${install.error?` (${install.error.message})`:''}; listed ${listed.stdout.trim()||'(none)'}`);
  report.vsixInstall={exitCode:install.status,output:(install.stdout+install.stderr).trim(),listed:listed.stdout.trim()};

  const env={HOME:dirs.home,CR_QUAL_REAL_HOME:os.homedir(),...(process.env.CR_QUAL_AGENT?{CR_QUAL_AGENT:process.env.CR_QUAL_AGENT}:{}),CR_QUAL_REPO:REPO,CR_QUAL_PORT:String(port),CR_QUAL_NODE:process.execPath,CR_QUAL_ROOT:root,CR_QUAL_WORKSPACE:dirs.workspace};
  // runTests moves every argument not starting with `--` to the end, so options must use --flag=value.
  const launchArgs=[dirs.workspace,`--user-data-dir=${dirs.userData}`,`--extensions-dir=${dirs.extensions}`,'--skip-welcome','--skip-release-notes','--disable-gpu','--disable-workspace-trust'];
  for(const phase of scenario==='construct'?['construct']:['main']){
    const resultFile=path.join(root,`result-${phase}.json`);
    let error=null;
    log(`phase ${phase}: launching VS Code`);
    // A hung VS Code must not hang the harness: kill everything using this phase's user-data-dir after the deadline.
    const deadline=setTimeout(()=>{log(`phase ${phase}: deadline reached, killing VS Code`);try{cp.execFileSync('pkill',['-f',dirs.userData]);}catch{}},Number(process.env.CR_QUAL_PHASE_TIMEOUT_MS)||420000);
    try{
      await runTests({vscodeExecutablePath:vscodePath,extensionDevelopmentPath:dirs.ext,extensionTestsPath:path.join(dirs.ext,'qualification-suite','index.js'),
        launchArgs,extensionTestsEnv:{...env,CR_QUAL_PHASE:phase,CR_QUAL_RESULT:resultFile}});
    }catch(e){error=e.message;}
    clearTimeout(deadline);
    log(`phase ${phase}: finished${error?` with runner error: ${error}`:''}`);
    report.phases[phase]=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):{error:'no result written'};
    report.phases[phase].persistedWorkspaceState=readWorkspaceState(dirs.userData);
    if(error)report.phases[phase].runnerError=error;
  }
  if(scenario!=='construct')report.phases.resume=await resumePhase({dirs,port,vscodePath});
  // Keep the recorded project (receiver data) for rendering, e.g. the Construct film.
  if(process.env.CR_QUAL_EXPORT_DATA){fs.cpSync(path.join(dirs.home,'.code-resonance'),process.env.CR_QUAL_EXPORT_DATA,{recursive:true});log(`receiver data exported to ${process.env.CR_QUAL_EXPORT_DATA}`);}
  const out=process.env.CR_QUAL_REPORT||path.join(__dirname,'..','results','vscode-qualification.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  const checks=Object.entries(report.phases).flatMap(([p,r])=>(r.checks||[]).map(c=>({...c,phase:p})));
  for(const c of checks)console.log(`${c.pass?'PASS':c.unverified?'UNVERIFIED':'FAIL'}  [${c.phase}] ${c.name}${c.detail?` — ${c.detail}`:''}`);
  console.log(`VSIX install via VS Code CLI: exit ${report.vsixInstall.exitCode}; listed: ${report.vsixInstall.listed||'(none)'}`);
  console.log(`VS Code ${report.vscode.version}; report: ${out}`);
  const failed=checks.filter(c=>!c.pass&&!c.unverified).length+(report.vsixInstall.exitCode===0?0:1)+Object.values(report.phases).filter(r=>r.runnerError&&!(r.checks||[]).length).length;
  if(!process.env.CR_QUAL_KEEP)fs.rmSync(root,{recursive:true,force:true});
  process.exitCode=failed?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});

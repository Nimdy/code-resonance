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

const log=(...a)=>console.log(`[qual ${new Date().toISOString().slice(11,19)}]`,...a);
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});s.on('error',reject);});}
function git(cwd,...args){cp.execFileSync('git',args,{cwd,stdio:'pipe',env:{...process.env,GIT_AUTHOR_NAME:'Qualification',GIT_AUTHOR_EMAIL:'qual@example.invalid',GIT_COMMITTER_NAME:'Qualification',GIT_COMMITTER_EMAIL:'qual@example.invalid'}});}

async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-vscode-qual-'));
  const dirs={home:path.join(root,'home'),userData:path.join(root,'user-data'),extensions:path.join(root,'extensions'),workspace:path.join(root,'workspace','sample-app'),ext:path.join(root,'ext')};
  for(const d of Object.values(dirs))fs.mkdirSync(d,{recursive:true});
  fs.cpSync(path.join(__dirname,'../fixtures/sample-app'),dirs.workspace,{recursive:true});
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
  for(const phase of ['main','restart']){
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
    if(error)report.phases[phase].runnerError=error;
  }
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

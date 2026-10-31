'use strict';
// The extension as installed from its VSIX alone, with no receiver running: real VS Code, two windows one after the
// other on the same isolated profile. Run under a display (e.g. `xvfb-run -a node qualification/vscode/bundled.js`).
//
//  1. The VSIX is built and installed through the VS Code CLI into an isolated extensions folder (the installed folder
//     must hold runtime/receiver/server.js and launcher.js).
//  2. Window 1 (bundled-suite.js, phase "first"): nothing listens on the port; Start capture makes the extension start
//     the receiver it carries (a separate process in VS Code's runtime); capture reaches it end to end; an agent is
//     connected from the CR menu and its stable adapter reaches the receiver.
//  3. Between windows: the receiver is still running after VS Code closed.
//  4. Window 2 (phase "second", another folder): the running receiver is reused (no second start), the Control Center
//     opens with a pairing link, Stop receiver stops it, opening the Stage starts it again, and a receiver started from
//     the checkout (as `npm start`) is reused and never stopped.
//
// Everything lives in a temporary root: HOME, RESONANCE_DATA (a folder of its own, to show the extension honours it),
// VS Code's user-data and extensions folders, the workspaces. The port is a free one, never 4174. The extension under
// test is the VSIX's own extension/ folder, unpacked byte for byte (the suite must live inside it to share its `vscode`
// API instance and answer its dialogs). Nothing is installed into any other VS Code profile.
//   CR_QUAL_VSCODE_VERSION (default 1.143.1)   CR_QUAL_VSCODE_CACHE (default qualification/.vscode-test)
//   CR_QUAL_REPORT (default qualification/results/vscode-bundled-qualification.json)   CR_QUAL_KEEP=1 keeps the root
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const net=require('node:net');
const zlib=require('node:zlib');
const cp=require('node:child_process');
const {downloadAndUnzipVSCode,resolveCliArgsFromVSCodeExecutablePath,runTests}=require('@vscode/test-electron');
const REPO=path.resolve(__dirname,'../..');
const host=require(path.join(REPO,'extension','receiver-host.js'));
const {verifyServer}=require(path.join(REPO,'extension','proof.js'));
// Variables that make the test instance run as plain Node or talk to the user's own VS Code (see run.js).
for(const key of Object.keys(process.env))if(/^(ELECTRON_|VSCODE_)/.test(key))delete process.env[key];
process.env.DONT_PROMPT_WSL_INSTALL='1';
delete process.env.XDG_RUNTIME_DIR;delete process.env.WAYLAND_DISPLAY;delete process.env.RESONANCE_DATA;delete process.env.RESONANCE_PORT;
const WIN=process.platform==='win32';
const cliRun=(cli,args,opts)=>WIN?cp.spawnSync(`"${cli}"`,args.map(a=>`"${a}"`),{...opts,shell:true}):cp.spawnSync(cli,args,opts);
const log=(...a)=>console.log(`[bundled ${new Date().toISOString().slice(11,19)}]`,...a);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});s.on('error',reject);});}
function git(cwd,...args){cp.execFileSync('git',args,{cwd,stdio:'pipe',env:{...process.env,GIT_AUTHOR_NAME:'Qualification',GIT_AUTHOR_EMAIL:'qual@example.invalid',GIT_COMMITTER_NAME:'Qualification',GIT_COMMITTER_EMAIL:'qual@example.invalid'}});}
// The VSIX's entries (the package is written by scripts/package-vsix.js: deflate, no zip64).
function unzip(buf){
  const end=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06])),count=buf.readUInt16LE(end+10);let at=buf.readUInt32LE(end+16);const out=new Map();
  for(let i=0;i<count;i++){
    const method=buf.readUInt16LE(at+10),size=buf.readUInt32LE(at+20),nameLen=buf.readUInt16LE(at+28),extra=buf.readUInt16LE(at+30),comment=buf.readUInt16LE(at+32),local=buf.readUInt32LE(at+42);
    const name=buf.subarray(at+46,at+46+nameLen).toString('utf8'),dataAt=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);
    out.set(name,method===8?zlib.inflateRawSync(buf.subarray(dataAt,dataAt+size)):buf.subarray(dataAt,dataAt+size));at+=46+nameLen+extra+comment;
  }
  return out;
}
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-vscode-bundled-'));
  const dirs={home:path.join(root,'home'),data:path.join(root,'data'),userData:path.join(root,'user-data'),extensions:path.join(root,'extensions'),ext:path.join(root,'ext'),
    first:path.join(root,'workspace','sample-app'),second:path.join(root,'workspace','second-app')};
  for(const d of [dirs.home,dirs.userData,dirs.extensions,dirs.ext])fs.mkdirSync(d,{recursive:true});
  for(const ws of [dirs.first,dirs.second]){fs.cpSync(path.join(__dirname,'../fixtures/sample-app'),ws,{recursive:true});git(ws,'init','-q','-b','main');git(ws,'add','-A');git(ws,'commit','-q','-m','initial sample');}
  const port=await freePort();if(port===4174)throw new Error('refusing port 4174');
  const report={startedAt:new Date().toISOString(),root,port,data:dirs.data,checks:[],phases:{}};
  const check=(name,pass,detail='')=>{report.checks.push({name,pass:!!pass,detail:String(detail)});log(`${pass?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`);};
  try{
    // 1) The VSIX: built, installed through the VS Code CLI (isolated folders), and unpacked as the extension under test.
    const vsix=path.join(root,'code-resonance.vsix');
    cp.execFileSync(process.execPath,[path.join(REPO,'scripts','package-vsix.js'),vsix],{stdio:'pipe'});
    const entries=unzip(fs.readFileSync(vsix));
    report.vsix={bytes:fs.statSync(vsix).size,files:entries.size};
    for(const [name,data] of entries)if(name.startsWith('extension/')){const f=path.join(dirs.ext,...name.slice('extension/'.length).split('/'));fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}
    fs.mkdirSync(path.join(dirs.ext,'qualification-suite'));fs.copyFileSync(path.join(__dirname,'bundled-suite.js'),path.join(dirs.ext,'qualification-suite','index.js'));
    const version=process.env.CR_QUAL_VSCODE_VERSION||'1.143.1';
    const vscodePath=await downloadAndUnzipVSCode({version,cachePath:process.env.CR_QUAL_VSCODE_CACHE||path.join(__dirname,'..','.vscode-test')});
    const [cli,...defaults]=resolveCliArgsFromVSCodeExecutablePath(vscodePath);
    const cliArgs=defaults.filter(a=>!/^--(extensions-dir|user-data-dir)=/.test(a));
    report.vscode={version:cliRun(cli,[...cliArgs,'--version'],{encoding:'utf8',timeout:60000}).stdout.split('\n')[0],executable:vscodePath};
    log(`VS Code ${report.vscode.version}; VSIX ${report.vsix.files} files, ${(report.vsix.bytes/1024/1024).toFixed(2)} MB; port ${port}; root ${root}`);
    const installDir=path.join(root,'vsix-install-check'),installUser=path.join(root,'vsix-user');
    const install=cliRun(cli,[...cliArgs,'--extensions-dir',installDir,'--user-data-dir',installUser,'--install-extension',vsix],{encoding:'utf8',timeout:120000});
    const listed=cliRun(cli,[...cliArgs,'--extensions-dir',installDir,'--user-data-dir',installUser,'--list-extensions','--show-versions'],{encoding:'utf8',timeout:60000}).stdout.trim();
    const installed=fs.readdirSync(installDir).find(d=>d.startsWith('zerobandwidth.code-resonance-'));
    report.vsixInstall={exitCode:install.status,listed,folder:installed||null};
    check('the VSIX installs through the VS Code CLI into an isolated extensions folder',install.status===0&&/zerobandwidth\.code-resonance@/.test(listed),`exit ${install.status}; ${listed}`);
    check('the installed extension folder holds the receiver and its launcher',!!installed&&['runtime/receiver/server.js','runtime/engine/worker.js','runtime/public/index.html','runtime/vendor/typescript.js','launcher.js']
      .every(f=>fs.existsSync(path.join(installDir,installed,...f.split('/')))),installed);
    // 2) and 4) Two windows of one profile, one after the other.
    fs.mkdirSync(path.join(dirs.userData,'User'),{recursive:true});
    fs.writeFileSync(path.join(dirs.userData,'User','settings.json'),JSON.stringify({'resonance.receiverPort':port,'security.workspace.trust.enabled':false,'telemetry.telemetryLevel':'off',
      'extensions.autoUpdate':false,'update.mode':'none','workbench.startupEditor':'none','git.autofetch':false,'files.autoSave':'off'},null,2));
    const env={HOME:dirs.home,...(WIN?{USERPROFILE:dirs.home}:{}),RESONANCE_DATA:dirs.data,CR_QUAL_PORT:String(port),CR_QUAL_NODE:process.execPath,CR_QUAL_REPO:REPO};
    const phase=async(name,workspace,extra={})=>{
      const resultFile=path.join(root,`result-${name}.json`);let error=null;
      log(`window ${name}: ${workspace}`);
      const deadline=setTimeout(()=>{log(`window ${name}: deadline, closing VS Code`);try{if(!WIN)cp.execFileSync('pkill',['-f',`[u]ser-data-dir=${dirs.userData}`]);}catch{}},Number(process.env.CR_QUAL_PHASE_TIMEOUT_MS)||300000);
      try{await runTests({vscodeExecutablePath:vscodePath,extensionDevelopmentPath:dirs.ext,extensionTestsPath:path.join(dirs.ext,'qualification-suite','index.js'),
        launchArgs:[workspace,`--user-data-dir=${dirs.userData}`,`--extensions-dir=${dirs.extensions}`,'--skip-welcome','--skip-release-notes','--disable-gpu','--disable-workspace-trust'],
        extensionTestsEnv:{...env,...extra,CR_QUAL_PHASE:name,CR_QUAL_RESULT:resultFile,CR_QUAL_WORKSPACE:workspace}});}catch(e){error=e.message;}
      clearTimeout(deadline);
      const result=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):{checks:[],error:'no result written'};
      if(error)result.runnerError=error;
      report.phases[name]=result;
      for(const c of result.checks||[])log(`${c.pass?'PASS':'FAIL'} [${name}] ${c.name}${c.detail?` — ${c.detail}`:''}`);
      return result;
    };
    const first=await phase('first',dirs.first);
    // 3) VS Code has exited: the receiver it started keeps running (detached), still proving it holds the token.
    await sleep(2000);
    const state=host.readState(dirs.data);
    let proven=false;try{await verifyServer(port,host.readAuth(dirs.data).token,3000);proven=true;}catch{}
    check('the receiver keeps running after the window that started it closed',!!state&&state.pid===first.receiverPid&&host.alive(state.pid)&&proven,
      state?`process ${state.pid} alive=${host.alive(state.pid)}, proof ${proven}`:'no state');
    await phase('second',dirs.second,{CR_QUAL_FIRST_PID:String(first.receiverPid||'')});
  }catch(e){check('harness completed without exceptions',false,String(e&&e.stack||e).slice(0,1500));}
  finally{
    // Whatever the outcome, no receiver from this run is left behind (the processes this run's VS Code started).
    const left=host.readState(dirs.data);
    if(left&&host.alive(left.pid)){
      report.leftRunning=left.pid;
      if(!await host.requestStop(dirs.data,left,{timeoutMs:15000})&&host.alive(left.pid))try{process.kill(left.pid,'SIGKILL');}catch{}
    }
    const all=[...report.checks,...Object.entries(report.phases).flatMap(([p,r])=>(r.checks||[]).map(c=>({...c,phase:p})))];
    report.summary={checks:all.length,passed:all.filter(c=>c.pass).length,failed:all.filter(c=>!c.pass).map(c=>`${c.phase?`[${c.phase}] `:''}${c.name}`)};
    const out=process.env.CR_QUAL_REPORT||path.join(__dirname,'..','results','vscode-bundled-qualification.json');
    fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
    log(`${report.summary.passed}/${report.summary.checks} checks pass; report: ${out}`);
    if(!process.env.CR_QUAL_KEEP)try{fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:500});}catch(e){log(`temporary directory left behind: ${e.code}`);}
    process.exitCode=report.summary.failed.length?1:0;
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

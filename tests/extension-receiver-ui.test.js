'use strict';
// The extension's side of the receiver it carries and of agent hooks (extension/extension.js), against a minimal fake of
// the `vscode` API, a fake receiver host and a fake hook client: what opens, what is refused, what the user is asked and
// what is applied. No port is probed and no process started (tests/receiver-host.test.js covers those).
const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const EXTENSION=require.resolve('../extension/extension');
function load(t,{ensure={status:'reused',owner:'external',port:4321},bundled=null,status=null,plans={},answers={},pick='Claude Code'}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-ext-ui-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const data=path.join(dir,'data'),said=[],opened=[],executed=[],applied=[],ensured=[],stopped=[],commands=new Map(),none=()=>({dispose(){}});
  const project=path.join(dir,'project');fs.mkdirSync(project);
  const vscode={
    version:'1.99.0',env:{remoteName:'',openExternal:async uri=>{opened.push(uri.toString());return true;}},
    Uri:{parse:s=>({toString:()=>s}),file:f=>({fsPath:f,toString:()=>`file://${f}`})},
    StatusBarAlignment:{Left:1},ProgressLocation:{Window:10,Notification:15},QuickPickItemKind:{Separator:-1},DiagnosticSeverity:{Error:0,Warning:1},
    window:{createStatusBarItem:()=>({show(){},dispose(){}}),createOutputChannel:()=>({appendLine:l=>said.push(['output',l]),dispose(){}}),withProgress:async(o,fn)=>fn(),
      showWarningMessage:async(m,...rest)=>{said.push(['warning',m,rest[0]?.detail]);for(const [re,a] of Object.entries(answers))if(new RegExp(re).test(m))return a;return undefined;},
      showInformationMessage:async m=>{said.push(['info',m]);return undefined;},showErrorMessage:async m=>{said.push(['error',m]);return undefined;},
      showQuickPick:async items=>{const list=await items;said.push(['quickpick',list.map(i=>i.label)]);return list.find(i=>i.label===pick);},
      registerUriHandler:none,showTextDocument:async()=>{}},
    commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return {dispose(){}};},executeCommand:async(...a)=>{executed.push(a);}},
    workspace:{isTrusted:true,workspaceFolders:[{uri:{scheme:'file',fsPath:project,toString:()=>`file://${project}`},name:'project',index:0}],
      getConfiguration:()=>({get:(k,d)=>d}),registerTextDocumentContentProvider:none,onDidChangeConfiguration:none},
    extensions:{getExtension:()=>undefined}
  };
  const realHost=require('../extension/receiver-host');
  const host={...realHost,dataDir:()=>data,findRuntime:()=>({root:'/runtime',kind:'bundled'}),bundled:()=>bundled,
    ensureReceiver:async o=>{ensured.push(o);return {port:o.port,...ensure};},
    receiverStatus:async o=>status||{port:o.port,dir:data,occupant:'verified',bundled,ours:!!bundled,log:path.join(data,'logs','receiver.log'),elsewhere:null},
    stopReceiver:async o=>{stopped.push(o);return {status:'stopped',port:o.port};}};
  const hooks={...require('../extension/agent-hooks'),
    planHooks:async o=>{const p=plans[`${o.agent}:${o.action}`];if(!p)throw new Error(`no plan for ${o.agent}:${o.action}`);return {file:path.join(project,'.claude','settings.local.json'),...p};},
    applyHooks:async o=>{applied.push(o);return {file:path.join(project,'.claude','settings.local.json'),written:true};}};
  const original=Module._load;
  Module._load=function(request,parent,isMain){
    if(request==='vscode')return vscode;
    if(parent?.filename===EXTENSION&&request==='./receiver-host')return host;
    if(parent?.filename===EXTENSION&&request==='./agent-hooks')return hooks;
    return original.call(this,request,parent,isMain);
  };
  delete require.cache[EXTENSION];
  let ext;try{ext=require(EXTENSION);}finally{Module._load=original;}
  delete require.cache[EXTENSION];
  const state=new Map();
  ext.activate({subscriptions:[],globalStorageUri:{fsPath:path.join(dir,'storage')},workspaceState:{get:(k,d)=>state.has(k)?state.get(k):d,update:async(k,v)=>state.set(k,v)}});
  t.after(()=>ext.deactivate());
  return {run:id=>commands.get(id)(),said,opened,executed,applied,ensured,stopped,data,project,commands};
}
const settings=commands=>JSON.stringify({hooks:{SessionStart:commands.map(command=>({hooks:[{type:'command',command,timeout:5}]}))}},null,2)+'\n';
test('Open Stage looks for (or starts) the receiver first and opens nothing when another program holds the port',async t=>{
  const ok=load(t);
  await ok.run('resonance.openControlCenter');
  assert.equal(ok.ensured.length,1);assert.equal(ok.ensured[0].port,4174);assert.equal(ok.ensured[0].dir,ok.data);assert.equal(ok.ensured[0].start,true);
  assert.deepEqual(ok.opened,['http://127.0.0.1:4321/'],'no token in this data directory: no pairing code, the page opens view-only');
  for(const status of ['occupied','elsewhere','failed']){
    const x=load(t,{ensure:{status,port:4174,other:4999,reason:'program',message:'boom'}});
    await x.run('resonance.openStage');
    assert.deepEqual(x.opened,[],status);
    assert(x.said.some(([k])=>k==='warning'||k==='error'),`${status} is explained`);
  }
});
test('Stop Receiver stops only the receiver the extension started, after asking',async t=>{
  const external=load(t);
  await external.run('resonance.stopReceiver');
  assert.deepEqual(external.stopped,[]);
  assert(external.said.some(([k,m])=>k==='info'&&/was not started by this extension/.test(m)));
  const mine=load(t,{bundled:{pid:999999,port:4174,instance:'a'.repeat(24),version:'0.7.2'},answers:{'^Stop the receiver':'Stop Receiver'}});
  await mine.run('resonance.stopReceiver');
  assert.equal(mine.stopped.length,1);assert.equal(mine.stopped[0].dir,mine.data);
  assert(mine.said.some(([k,m])=>k==='info'&&/the receiver stopped/.test(m)));
  const declined=load(t,{bundled:{pid:999999,port:4174,instance:'a'.repeat(24),version:'0.7.2'}});
  await declined.run('resonance.stopReceiver');
  assert.deepEqual(declined.stopped,[],'nothing happens without the confirmation');
});
test('Connect an AI agent: the receiver\'s plan is shown in a diff, confirmed, then applied for the reviewed file only',async t=>{
  const stableCmd=data=>`node ${JSON.stringify(path.join(data,'hooks','scripts','hooks','claude-code.js'))}`;
  let x=load(t,{answers:{'^Add Code Resonance\'s Claude Code hooks':'Add Hooks'},plans:{}});
  // The plan names the stable adapter of this data directory.
  const plan={exists:false,current:null,changed:true,currentHash:'',next:settings([stableCmd(x.data)])};
  x=load(t,{answers:{'^Add Code Resonance\'s Claude Code hooks':'Add Hooks'},plans:{'claude:install':plan,'cursor:install':{...plan},'codex:install':{...plan}}});
  plan.next=settings([stableCmd(x.data)]);
  await x.run('resonance.connectAgent');
  assert.deepEqual(x.said.find(([k])=>k==='quickpick')[1],['Claude Code','Cursor','Codex','Gemini CLI','Qwen Code','GitHub Copilot','Factory Droid','Grok Build','goose']);
  const diff=x.executed.find(([id])=>id==='vscode.diff');assert(diff,'the change is shown in a diff editor first');
  const modal=x.said.find(([k,m])=>k==='warning'&&/^Add Code Resonance's Claude Code hooks/.test(m));
  assert.match(modal[2],/the same path across updates/);assert.doesNotMatch(modal[2],/reported twice/);
  assert.equal(x.applied.length,1);
  assert.deepEqual({agent:x.applied[0].agent,action:x.applied[0].action,projectPath:x.applied[0].projectPath,expectHash:x.applied[0].expectHash},{agent:'claude',action:'install',projectPath:x.project,expectHash:''});
  assert(x.said.some(([k,m])=>k==='info'&&/Start a new Claude Code session/.test(m)));
});
test('Connect an AI agent warns when the file already runs another Code Resonance adapter, and applies nothing unconfirmed',async t=>{
  const checkout='node "/home/someone/code-resonance/scripts/hooks/claude-code.js"';
  const x=load(t,{plans:{}});
  const current=settings([checkout]);
  const plan={exists:true,current,changed:true,currentHash:'abc',next:settings([checkout,`node ${JSON.stringify(path.join(x.data,'hooks','scripts','hooks','claude-code.js'))}`])};
  const y=load(t,{plans:{'claude:install':plan,'cursor:install':plan,'codex:install':plan}});
  plan.next=settings([checkout,`node ${JSON.stringify(path.join(y.data,'hooks','scripts','hooks','claude-code.js'))}`]);
  await y.run('resonance.connectAgent');
  const modal=y.said.find(([k,m])=>k==='warning'&&/^Add Code Resonance's Claude Code hooks/.test(m));
  assert.match(modal[2],/already has Code Resonance hooks running node "\/home\/someone\/code-resonance\/scripts\/hooks\/claude-code\.js"/);
  assert.match(modal[2],/reported twice/);
  assert.deepEqual(y.applied,[],'not confirmed: nothing written');
});
test('Connect an AI agent removes connected hooks the same way, and refuses an untrusted or missing folder',async t=>{
  const cmd='node "/data/hooks/scripts/hooks/claude-code.js"';
  const installed={exists:true,current:settings([cmd]),changed:false,currentHash:'h1',next:settings([cmd])};
  const removal={exists:true,current:settings([cmd]),changed:true,currentHash:'h1',next:'{}\n'};
  const x=load(t,{answers:{'^Remove Code Resonance\'s Claude Code hooks':'Remove Hooks'},plans:{'claude:install':installed,'claude:remove':removal,'cursor:install':removal,'codex:install':removal}});
  await x.run('resonance.connectAgent');
  assert.deepEqual(x.applied.map(a=>[a.action,a.expectHash]),[['remove','h1']]);
  const y=load(t,{ensure:{status:'occupied',port:4174,reason:'program'}});
  await y.run('resonance.connectAgent');
  assert.equal(y.said.some(([k])=>k==='quickpick'),false,'no receiver of ours: nothing to plan with');
});

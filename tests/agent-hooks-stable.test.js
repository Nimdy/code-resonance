'use strict';
// Agent hooks from an installed extension (extension/agent-hooks.js): the adapters live at a stable path in the data
// directory, so entries written once survive extension updates; the bundled receiver plans and writes entries naming
// that path; and the extension installs and removes them through the receiver's own plan/apply, sending the pairing key
// only to a receiver that proved itself. Temporary data directories and free ports only.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),http=require('node:http'),cp=require('node:child_process');
const hooks=require('../extension/agent-hooks');
const host=require('../extension/receiver-host');
const REPO=path.join(__dirname,'..');
const VERSION=require('../extension/package.json').version;
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});s.on('error',reject);});
function temp(t,prefix='cr-hooks-'){
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),prefix)));
  t.after(async()=>{
    const s=host.readState(dir);
    if(s&&host.alive(s.pid)&&!await host.requestStop(dir,s,{timeoutMs:15000})&&host.alive(s.pid))try{process.kill(s.pid,'SIGKILL');}catch{}
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  });
  return dir;
}
const TOOLS=['claude-code','codex','copilot','cursor','droid','gemini','goose','grok','qwen'];
const EXPECTED=['extension/filters.js','extension/proof.js','receiver/proof.js',...[...TOOLS.map(n=>`${n}.js`),
  ...TOOLS.map(n=>`install-${n}.js`),'install-shared.js','registry.js','shared.js'].sort().map(n=>`scripts/hooks/${n}`),'sdk/project-id.js'];
test('The hook files are the adapters, their installers and everything they require, found by following requires',()=>{
  assert.deepEqual(hooks.hookFiles(REPO),EXPECTED);
});
test('The stable copy is written once, repaired when it differs, refreshed by a newer extension and kept from an older one',t=>{
  const data=temp(t),root=hooks.stableRoot(data);
  const first=hooks.syncStableHooks({runtime:REPO,dataDir:data,version:VERSION});
  assert.deepEqual({root:first.root,changed:first.changed},{root:path.join(data,'hooks'),changed:true});
  for(const f of EXPECTED)assert.deepEqual(fs.readFileSync(path.join(root,f)),fs.readFileSync(path.join(REPO,f)),f);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,hooks.MANIFEST),'utf8'));
  assert.equal(manifest.version,VERSION);assert.deepEqual(Object.keys(manifest.files).sort(),EXPECTED);
  if(process.platform!=='win32')assert.equal(fs.statSync(path.join(root,'scripts','hooks','claude-code.js')).mode&0o077,0,'private to this account');
  assert.equal(hooks.syncStableHooks({runtime:REPO,dataDir:data,version:VERSION}).changed,false,'nothing to do');
  fs.writeFileSync(path.join(root,'sdk','project-id.js'),'// damaged\n');
  assert.equal(hooks.syncStableHooks({runtime:REPO,dataDir:data,version:VERSION}).changed,true,'a file that differs is restored');
  assert.deepEqual(fs.readFileSync(path.join(root,'sdk','project-id.js')),fs.readFileSync(path.join(REPO,'sdk','project-id.js')));
  // A newer extension's copy stays when an older extension's receiver starts (no ping-pong between windows).
  fs.writeFileSync(path.join(root,hooks.MANIFEST),JSON.stringify({...manifest,version:'99.0.0'}));
  fs.writeFileSync(path.join(root,'scripts','hooks','cursor.js'),'// newer\n');
  const kept=hooks.syncStableHooks({runtime:REPO,dataDir:data,version:VERSION});
  assert.deepEqual({changed:kept.changed,kept:kept.kept},{changed:false,kept:'99.0.0'});
  assert.equal(fs.readFileSync(path.join(root,'scripts','hooks','cursor.js'),'utf8'),'// newer\n');
  // An older copy is replaced by a newer extension.
  fs.writeFileSync(path.join(root,hooks.MANIFEST),JSON.stringify({...manifest,version:'0.0.1'}));
  assert.equal(hooks.syncStableHooks({runtime:REPO,dataDir:data,version:VERSION}).changed,true);
  assert.deepEqual(fs.readFileSync(path.join(root,'scripts','hooks','cursor.js')),fs.readFileSync(path.join(REPO,'scripts','hooks','cursor.js')));
});
test('The stable adapter runs on its own after the extension folder it came from is gone (an update)',async t=>{
  const data=temp(t),ext=temp(t,'cr-hooks-ext-'),project=temp(t,'cr-hooks-project-');
  // An "installed extension" holding only the hook files, removed after the copy as VS Code removes an old version.
  for(const f of EXPECTED){fs.mkdirSync(path.dirname(path.join(ext,'runtime',f)),{recursive:true});fs.copyFileSync(path.join(REPO,f),path.join(ext,'runtime',f));}
  hooks.syncStableHooks({runtime:path.join(ext,'runtime'),dataDir:data,version:VERSION});
  fs.rmSync(ext,{recursive:true,force:true});
  fs.writeFileSync(path.join(data,'receiver-auth.json'),JSON.stringify({token:'e'.repeat(64),pairing:'f'.repeat(64),port:await freePort()}));
  const adapter=path.join(hooks.stableRoot(data),'scripts','hooks','claude-code.js');
  const r=cp.spawnSync(process.execPath,[adapter],{input:JSON.stringify({hook_event_name:'SessionStart',session_id:'stable-1',source:'startup',cwd:project}),
    env:{...process.env,RESONANCE_DATA:data,RESONANCE_PORT:''},encoding:'utf8',timeout:20000});
  assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'','an adapter never prints');
  const spooled=fs.readdirSync(path.join(data,'spool')).filter(n=>n.endsWith('.json'));
  assert.equal(spooled.length,1,'no receiver: the event waits in the spool');
  const [event]=JSON.parse(fs.readFileSync(path.join(data,'spool',spooled[0]),'utf8'));
  assert.equal(event.kind,'agent.session.started');assert.equal(event.meta.provider,'claude-code');
});
// A started bundled receiver (checkout runtime, plain Node) in a temporary data directory.
async function bundledReceiver(t){
  const data=temp(t),port=await freePort();
  const r=await host.ensureReceiver({port,dir:data,runtime:{root:REPO,kind:'checkout'},launcher:path.join(REPO,'extension','launcher.js'),version:VERSION});
  assert.equal(r.status,'started',JSON.stringify(r));
  return {data,port};
}
test('The bundled receiver writes hook entries naming the stable path; the extension adds and removes them through its plan and apply',async t=>{
  const {data,port}=await bundledReceiver(t),project=temp(t,'cr-hooks-project-');
  const stableAdapter=path.join(data,'hooks','scripts','hooks','claude-code.js'),command=`node ${JSON.stringify(stableAdapter)}`;
  assert(fs.existsSync(stableAdapter),'the launcher prepared the stable copy');
  const file=path.join(project,'.claude','settings.local.json');
  fs.mkdirSync(path.dirname(file));fs.writeFileSync(file,JSON.stringify({permissions:{allow:['Bash(npm test)']}},null,2)+'\n');
  const plan=await hooks.planHooks({port,dataDir:data,agent:'claude',projectPath:project,action:'install'});
  assert.equal(plan.file,file);assert.equal(plan.changed,true);assert.equal(plan.exists,true);
  const next=JSON.parse(plan.next);
  assert.deepEqual(next.permissions,{allow:['Bash(npm test)']},'the user\'s settings stay');
  const commands=Object.values(next.hooks).flat().flatMap(g=>g.hooks.map(h=>h.command));
  assert(commands.length>=9&&commands.every(c=>c===command),`every entry runs the stable adapter: ${[...new Set(commands)]}`);
  assert(!plan.next.includes(REPO),'no path inside the extension folder');
  assert.equal(fs.readFileSync(file,'utf8'),plan.current,'a plan writes nothing');
  // Written only for the file as reviewed.
  await assert.rejects(hooks.applyHooks({port,dataDir:data,agent:'claude',projectPath:project,action:'install',expectHash:'0'.repeat(64)}),e=>e.status===409&&e.code==='changed');
  const applied=await hooks.applyHooks({port,dataDir:data,agent:'claude',projectPath:project,action:'install',expectHash:plan.currentHash});
  assert.deepEqual(applied,{file,written:true});
  assert.equal(fs.readFileSync(file,'utf8'),plan.next);
  assert.equal((await hooks.planHooks({port,dataDir:data,agent:'claude',projectPath:project,action:'install'})).changed,false,'installed: nothing more to add');
  const removal=await hooks.planHooks({port,dataDir:data,agent:'claude',projectPath:project,action:'remove'});
  assert.equal((await hooks.applyHooks({port,dataDir:data,agent:'claude',projectPath:project,action:'remove',expectHash:removal.currentHash})).written,true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{permissions:{allow:['Bash(npm test)']}});
  // Cursor, Codex and the registry's tools (Gemini here) go the same way, to their own files, naming their stable adapters.
  for(const [agent,rel,adapter] of [['cursor','.cursor/hooks.json','cursor.js'],['codex','.codex/hooks.json','codex.js'],['gemini','.gemini/settings.json','gemini.js']]){
    const p=await hooks.planHooks({port,dataDir:data,agent,projectPath:project,action:'install'});
    assert.equal(p.file,path.join(project,...rel.split('/')));assert.equal(p.exists,false);
    assert(p.next.includes(JSON.stringify(`node ${JSON.stringify(path.join(data,'hooks','scripts','hooks',adapter))}`).slice(1,-1)),`${agent} names its stable adapter`);
  }
  // The receiver's rules apply: never the home directory, never inside the data directory.
  await assert.rejects(hooks.planHooks({port,dataDir:data,agent:'claude',projectPath:os.homedir(),action:'install'}),e=>e.status===400&&/home directory/.test(e.message));
  await assert.rejects(hooks.planHooks({port,dataDir:data,agent:'claude',projectPath:path.join(data,'hooks'),action:'install'}),e=>e.status===400&&/data directory/.test(e.message));
  await assert.rejects(hooks.planHooks({port,dataDir:data,agent:'kimi',projectPath:project,action:'install'}),/Unknown agent/);
});
test('The pairing key goes only to a receiver that proved it holds the token',async t=>{
  const data=temp(t),seen=[];
  fs.writeFileSync(path.join(data,'receiver-auth.json'),JSON.stringify({token:'1'.repeat(64),pairing:'2'.repeat(64)}));
  const foreign=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{seen.push({method:req.method,url:req.url,body});
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,v:2,proof:'0'.repeat(64),capability:'3'.repeat(64)}));});});
  await new Promise(r=>foreign.listen(0,'127.0.0.1',r));t.after(()=>foreign.close());
  await assert.rejects(hooks.planHooks({port:foreign.address().port,dataDir:data,agent:'claude',projectPath:data,action:'install'}),e=>e.code==='challenge-mismatch');
  assert.deepEqual(seen.map(s=>s.method),['GET'],'only the challenge was asked');
  assert(!JSON.stringify(seen).includes('2'.repeat(64))&&!JSON.stringify(seen).includes('1'.repeat(64)),'neither the pairing key nor the token was sent');
});
test('The receiver\'s installers are the stable copies once aliased (what the launcher does before loading the receiver)',t=>{
  const data=temp(t);
  const script=`const h=require(${JSON.stringify(path.join(REPO,'extension','agent-hooks.js'))});
    const r=h.syncStableHooks({runtime:${JSON.stringify(REPO)},dataDir:${JSON.stringify(data)},version:${JSON.stringify(VERSION)}});
    const aliased=h.aliasInstallers({runtime:${JSON.stringify(REPO)},stable:r.root});
    const claude=require(${JSON.stringify(path.join(REPO,'scripts','hooks','install-claude-code.js'))});
    console.log(JSON.stringify({aliased,adapter:claude.adapter,command:claude.command}));`;
  const out=JSON.parse(cp.execFileSync(process.execPath,['-e',script],{encoding:'utf8'}).trim());
  assert.deepEqual(out.aliased,[...TOOLS.map(n=>`install-${n}.js`),'install-shared.js'].sort());
  assert.equal(out.adapter,path.join(data,'hooks','scripts','hooks','claude-code.js'));
  assert.equal(out.command,`node ${JSON.stringify(out.adapter)}`);
  // Without the alias (npm start in a checkout), the checkout's own adapters, as before.
  assert.equal(require('../scripts/hooks/install-claude-code').adapter,path.join(REPO,'scripts','hooks','claude-code.js'));
});

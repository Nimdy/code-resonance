'use strict';
// Agent hooks (Claude Code, Cursor, Codex) for an installed extension. No `vscode` import (tests/agent-hooks-stable.test.js).
//
// A hook entry names an absolute adapter path (`node "<…>/scripts/hooks/claude-code.js"`), and an installed extension's
// folder changes with every version: entries pointing there would break at the next update. So the bundled receiver
// never hands out a path inside it. Its launcher copies the adapters (scripts/hooks/*.js) and every file they require
// into <data>/hooks/, a path that stays the same across updates (syncStableHooks), and makes the receiver use the copies'
// installers (aliasInstallers), whose `adapter` and `command` therefore name that path. A newer extension refreshes the
// copy in place, dependencies before adapters; an older one leaves a newer copy alone. Entries written once keep working.
//
// The extension installs or removes hooks for its workspace through the receiver's own plan and apply routes, the
// Control Center's code path with its rules (the project's own file only, never the home directory, links or the data
// directory; only the adapter's observe-only entries; written only if the file is still the one reviewed). It asks for
// a control capability with the pairing key from receiver-auth.json, which, like the token, goes only to a receiver
// that first proved it holds this data directory's token.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {verifyServer}=require('./proof');
const {compareVersions,readAuth}=require('./receiver-host');
const MANIFEST='manifest.json';
const REQUIRE=/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function stableRoot(dataDir){return path.join(dataDir,'hooks');}
// The adapters and installers, and every file they require, transitively (relative requires only; Node built-ins need
// nothing). Paths relative to the runtime root, with forward slashes; a require leaving the root is refused.
function hookFiles(runtime){
  const queue=fs.readdirSync(path.join(runtime,'scripts','hooks')).filter(n=>n.endsWith('.js')).sort().map(n=>`scripts/hooks/${n}`);
  const seen=new Set();
  while(queue.length){
    const rel=queue.shift();if(seen.has(rel))continue;seen.add(rel);
    if(!rel.endsWith('.js'))continue;
    for(const m of fs.readFileSync(path.join(runtime,rel),'utf8').matchAll(REQUIRE)){
      const base=path.posix.normalize(path.posix.join(path.posix.dirname(rel),m[2]));
      if(base.startsWith('../')||path.posix.isAbsolute(base))throw new Error(`${rel} requires ${m[2]}, outside the runtime`);
      const target=[base,`${base}.js`,`${base}.json`,`${base}/index.js`].find(c=>fs.existsSync(path.join(runtime,c))&&fs.statSync(path.join(runtime,c)).isFile());
      if(!target)throw new Error(`${rel} requires ${m[2]}, which is missing`);
      queue.push(target);
    }
  }
  return [...seen].sort();
}
function writeAtomic(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=`${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp,data,{mode:0o600});
  // Windows refuses to replace a file another process has open for a moment (a hook starting): retry briefly.
  for(let i=0;;i++){try{fs.renameSync(tmp,file);return;}catch(e){if(i>=20||!['EPERM','EBUSY','EACCES'].includes(e.code)){fs.rmSync(tmp,{force:true});throw e;}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}}
}
// Copies the hook files into <data>/hooks/ when they are missing or differ, unless a newer extension wrote them.
function syncStableHooks({runtime,dataDir,version}){
  const root=stableRoot(dataDir),files=hookFiles(runtime);
  const want=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(runtime,f)))]));
  const have=readJSON(path.join(root,MANIFEST));
  if(have&&compareVersions(have.version,version)>0)return {root,changed:false,kept:have.version,files};
  // The files themselves are compared (a few tens of KB), not the manifest: a damaged or missing copy is restored.
  const onDisk=f=>{try{return sha(fs.readFileSync(path.join(root,...f.split('/'))));}catch{return null;}};
  const current=have&&compareVersions(have.version,version)===0&&files.every(f=>onDisk(f)===want[f]);
  if(current)return {root,changed:false,files};
  // Dependencies first, the adapters and installers last: a hook starting meanwhile finds what it requires.
  const order=[...files.filter(f=>!f.startsWith('scripts/hooks/')),...files.filter(f=>f.startsWith('scripts/hooks/'))];
  for(const f of order)writeAtomic(path.join(root,...f.split('/')),fs.readFileSync(path.join(runtime,f)));
  writeAtomic(path.join(root,MANIFEST),JSON.stringify({version,files:want,updatedAt:new Date().toISOString()},null,1)+'\n');
  return {root,changed:true,files};
}
// Makes `require('<runtime>/scripts/hooks/install-<agent>.js')` (what the receiver loads) return the stable copy's module,
// so the receiver plans and writes hook entries naming <data>/hooks/. Node's module cache is keyed by resolved file
// name; an entry placed there is returned for that file (documented: require.cache entries may be added or replaced).
// Call before the receiver is loaded.
function aliasInstallers({runtime,stable}){
  const aliased=[];
  for(const name of fs.readdirSync(path.join(runtime,'scripts','hooks')).filter(n=>/^install-[a-z0-9-]+\.js$/.test(n)).sort()){
    const to=path.join(stable,'scripts','hooks',name);if(!fs.existsSync(to))continue;
    const from=require.resolve(path.join(runtime,'scripts','hooks',name)),target=require.resolve(to);
    require(target);
    require.cache[from]=require.cache[target];
    aliased.push(name);
  }
  return aliased;
}
// ---- The extension's side: the receiver's plan/apply routes, after the proof.
function request(port,method,route,headers,body){
  return new Promise((resolve,reject)=>{
    const data=body===undefined?null:Buffer.from(JSON.stringify(body));
    const req=http.request({hostname:'127.0.0.1',port,method,path:route,timeout:10000,
      headers:{Accept:'application/json',...headers,...(data?{'Content-Type':'application/json','Content-Length':data.length}:{})}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',c=>{text+=c;if(text.length>2*1024*1024)req.destroy(new Error('Answer too large'));});
      res.on('end',()=>{let doc=null;try{doc=JSON.parse(text);}catch{}resolve({status:res.statusCode,doc});});
    });
    req.on('timeout',()=>req.destroy(new Error('The receiver did not answer in time')));
    req.on('error',reject);req.end(data||undefined);
  });
}
const failure=(message,extra)=>Object.assign(new Error(message),extra);
async function controlSession(port,dataDir){
  const auth=readAuth(dataDir);
  if(!auth||!/^[0-9a-f]{64}$/.test(auth.pairing||''))throw failure(`No receiver pairing key in ${dataDir}`,{code:'no-auth'});
  // The pairing key goes only to the occupant that proved it holds this data directory's token, as the token does.
  await verifyServer(port,auth.token,3000);
  const origin=`http://127.0.0.1:${port}`;
  const r=await request(port,'POST','/api/session',{Origin:origin},{pairing:auth.pairing});
  if(r.status!==200||!/^[0-9a-f]{64}$/.test(r.doc?.capability||''))throw failure(r.doc?.error||`The receiver refused a control session (HTTP ${r.status})`,{status:r.status,code:r.doc?.code});
  return {origin,capability:r.doc.capability};
}
// The tools with an observe-only adapter (scripts/hooks/registry.js names the same files for the six after Codex); the
// adapter each entry runs is scripts/hooks/<adapter>.
const AGENTS=Object.freeze({
  claude:{label:'Claude Code',file:'.claude/settings.local.json',adapter:'claude-code.js'},
  cursor:{label:'Cursor',file:'.cursor/hooks.json',adapter:'cursor.js'},
  codex:{label:'Codex',file:'.codex/hooks.json',adapter:'codex.js'},
  gemini:{label:'Gemini CLI',file:'.gemini/settings.json',adapter:'gemini.js'},
  qwen:{label:'Qwen Code',file:'.qwen/settings.json',adapter:'qwen.js'},
  copilot:{label:'GitHub Copilot',file:'.github/copilot/settings.local.json',adapter:'copilot.js'},
  droid:{label:'Factory Droid',file:'.factory/hooks.json',adapter:'droid.js'},
  grok:{label:'Grok Build',file:'.grok/hooks/code-resonance.json',adapter:'grok.js'},
  goose:{label:'goose',file:'.agents/plugins/code-resonance/hooks/hooks.json',adapter:'goose.js'}
});
async function hookCall(step,{port,dataDir,agent,body}){
  if(!Object.hasOwn(AGENTS,agent))throw failure(`Unknown agent ${agent}`,{code:'invalid'});
  const s=await controlSession(port,dataDir);
  const r=await request(port,'POST',`/api/integrations/${agent}/${step}`,{Origin:s.origin,'X-Resonance-Capability':s.capability},body);
  if(r.status!==200)throw failure(r.doc?.error||`The receiver answered HTTP ${r.status}`,{status:r.status,code:r.doc?.code});
  return r.doc;
}
// {file, exists, current, next, changed, currentHash}: what install or remove would write, computed by the receiver.
function planHooks({port,dataDir,agent,projectPath,action}){return hookCall('plan',{port,dataDir,agent,body:{projectPath,action}});}
// {file, written}: written only if the file still has the hash the user reviewed.
function applyHooks({port,dataDir,agent,projectPath,action,expectHash}){return hookCall('apply',{port,dataDir,agent,body:{projectPath,action,expectHash}});}
module.exports={MANIFEST,AGENTS,stableRoot,hookFiles,syncStableHooks,aliasInstallers,controlSession,planHooks,applyHooks};

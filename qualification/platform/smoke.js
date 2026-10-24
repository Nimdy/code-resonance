'use strict';
// Platform smoke test, the product as real processes (no test harness inside the receiver): written for the native
// Windows CI runner, runs anywhere. A data directory whose path has spaces; the receiver started with `node
// receiver/server.js`; its token read from the auth file; events posted with and without it; the project identity a
// VS Code workspace on this platform would get; flush and projection; the receiver stopped and started again on the
// same data (journal and token kept); the pack CLI (validate, install, approve, list) and integrity (a file changed
// after approval is reported and never served); the player page and its scripts served.
//
// node platform/smoke.js [--out results/platform]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const REPO=path.resolve(__dirname,'../..');
const {projectIdForRoot,vscodeFileUri}=require(path.join(REPO,'sdk/project-id'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','platform')));
const checks=[];const check=(name,pass,detail='')=>{checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);};
function startReceiver(data){
  return new Promise((resolve,reject)=>{
    const began=Date.now(),child=cp.spawn(process.execPath,[path.join(REPO,'receiver/server.js'),'--port','0','--data',data],{cwd:REPO,stdio:['ignore','pipe','pipe']});
    let out='';const timer=setTimeout(()=>reject(new Error(`receiver did not start: ${out}`)),20000);
    child.stdout.on('data',d=>{out+=d;const m=/Receiver listening: (http:\/\/[^\s]+)/.exec(out);if(m){clearTimeout(timer);resolve({child,url:m[1],startMs:Date.now()-began});}});
    child.stderr.on('data',d=>out+=d);child.on('exit',code=>{clearTimeout(timer);reject(new Error(`receiver exited (${code}): ${out}`));});
  });
}
function stop(child){return new Promise(resolve=>{child.removeAllListeners('exit');child.on('exit',()=>resolve());child.kill();});}
const pack=(...a)=>cp.spawnSync(process.execPath,[path.join(REPO,'scripts/pack.js'),...a],{cwd:REPO,encoding:'utf8'});
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr smoke '));const data=path.join(root,'receiver data');
  const workspace=path.join(root,'My Project (Ünïcode)');fs.mkdirSync(workspace,{recursive:true});
  let receiver=null;
  try{
    check('platform',true,`${process.platform} ${os.release()} · Node ${process.version} · data directory “${data}”`);
    receiver=await startReceiver(data);
    check('receiver: starts as a process on loopback and announces its address',/^http:\/\/127\.0\.0\.1:\d+$/.test(receiver.url),`${receiver.url} in ${receiver.startMs} ms`);
    const health=await (await fetch(`${receiver.url}/health`)).json();
    check('receiver: health endpoint answers',health.ok===true,`version ${health.version}`);
    const authFile=fs.readdirSync(data).find(f=>/auth/i.test(f));const auth=authFile&&JSON.parse(fs.readFileSync(path.join(data,authFile),'utf8'));
    check('receiver: token written to the data directory',auth&&auth.token?.length>=40,`${authFile}${process.platform!=='win32'?` mode ${(fs.statSync(path.join(data,authFile)).mode&0o777).toString(8)}`:''}`);
    // Project identity: the id the extension would compute for this workspace folder on this platform.
    const projectId=projectIdForRoot(workspace);
    check('project identity: the VS Code file URI of a workspace with spaces and non-ASCII characters',/^file:\/\//.test(vscodeFileUri(workspace))&&/^[0-9a-f]{64}$/.test(projectId),
      `${vscodeFileUri(workspace)} → ${projectId.slice(0,16)}`);
    const ev=(id,kind,x={})=>({v:1,id,ts:Date.now(),kind,projectId,sessionId:'smoke',origin:'unknown',...x});
    const post=(events,token)=>fetch(`${receiver.url}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({events})});
    const refused=await post([ev('smoke-0000-unauth','workspace.started',{name:'smoke'})],null);
    check('ingestion: events without the token are refused',refused.status===401||refused.status===403,`HTTP ${refused.status}`);
    const accepted=await post([ev('smoke-0001-start','workspace.started',{name:'smoke'}),ev('smoke-0002-snap','document.snapshot',{file:'src\\app.ts'.replace(/\\/g,'/'),content:'export const a = 1;\n',meta:{reason:'edit'}})],auth.token);
    check('ingestion: events with the token are accepted',accepted.status===202,`HTTP ${accepted.status}`);
    await fetch(`${receiver.url}/v1/flush?id=${projectId}`,{method:'POST',headers:{Authorization:`Bearer ${auth.token}`}});
    const project=await (await fetch(`${receiver.url}/api/project?id=${projectId}`)).json();
    check('projection: the project appears with its structure',project&&project.graph&&project.graph.nodes.length>0,`${project?.graph?.nodes.length} nodes`);
    const home=await fetch(receiver.url+'/'),app=await fetch(receiver.url+'/app.js'),worker=await fetch(receiver.url+'/worlds/pack-worker.js');
    check('player: page and scripts served',home.status===200&&app.status===200&&worker.status===200,`/ ${home.status}, /app.js ${app.status}, /worlds/pack-worker.js ${worker.status}`);
    // Restart on the same data: journal and token kept.
    await stop(receiver.child);receiver=await startReceiver(data);
    const again=await (await fetch(`${receiver.url}/api/project?id=${projectId}`)).json(),auth2=JSON.parse(fs.readFileSync(path.join(data,authFile),'utf8'));
    check('receiver lifecycle: stopped and started again, the project and the token are kept',again?.graph?.nodes.length===project.graph.nodes.length&&auth2.token===auth.token,`${again?.graph?.nodes.length} nodes after restart`);
    // Pack CLI and integrity.
    const src=path.join(REPO,'packs','examples','cymatic-field');
    const v=pack('validate',src),i=pack('install',src,'--data',data),a=pack('approve','halcyon.cymatic-field','--yes','--data',data),l=pack('list','--data',data);
    check('pack CLI: validate, install, approve, list',v.status===0&&i.status===0&&a.status===0&&/halcyon\.cymatic-field/.test(l.stdout)&&/approved|trusted/i.test(l.stdout),
      [v,i,a,l].map(r=>r.status).join('/')+` · ${l.stdout.trim().split('\n').find(x=>/cymatic/.test(x))||l.stderr.trim()}`);
    const listed=(await (await fetch(`${receiver.url}/api/packs`)).json()).packs.find(p=>p.id==='halcyon.cymatic-field');
    const served=await fetch(`${receiver.url}/api/packs/file?id=halcyon.cymatic-field&path=world.js`);
    check('packs: the approved pack is listed and its files served',listed?.trusted&&served.status===200,`trusted ${listed?.trusted}, world.js HTTP ${served.status}`);
    fs.appendFileSync(path.join(data,'packs','halcyon.cymatic-field','world.js'),'\n// changed after approval\n');
    const after=(await (await fetch(`${receiver.url}/api/packs`)).json()).packs.find(p=>p.id==='halcyon.cymatic-field');
    const blocked=await fetch(`${receiver.url}/api/packs/file?id=halcyon.cymatic-field&path=world.js`);
    check('packs: a file changed after approval is reported and never served',after&&!after.ok&&!after.trusted&&blocked.status!==200,`ok ${after?.ok}, trusted ${after?.trusted}, world.js HTTP ${blocked.status}`);
    // Loopback only, unless explicitly allowed.
    const remote=cp.spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(REPO,'receiver/server.js'))}).createService({host:'0.0.0.0',port:0,dataDir:${JSON.stringify(path.join(root,'other'))}})`],{encoding:'utf8'});
    check('receiver: refuses a non-loopback bind unless explicitly allowed',remote.status!==0&&/non-loopback/.test(remote.stderr),remote.stderr.trim().split('\n').find(x=>/^Error: /.test(x))||remote.stderr.slice(0,120));
  }catch(e){check('smoke test completed',false,String(e.stack||e).slice(0,400));}
  finally{if(receiver)await stop(receiver.child);fs.rmSync(root,{recursive:true,force:true});}
  fs.mkdirSync(OUT,{recursive:true});
  fs.writeFileSync(path.join(OUT,`smoke-${process.platform}.json`),JSON.stringify({at:new Date().toISOString(),platform:process.platform,release:os.release(),node:process.version,checks},null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
})();

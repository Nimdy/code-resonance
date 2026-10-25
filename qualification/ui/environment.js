'use strict';
// An isolated Code Resonance installation for interface qualification and review: a receiver on a temporary data
// directory (never ~/.code-resonance) with three explicitly identified projects:
//   lumen     a real recorded VS Code session (qualification/recordings/lumen-recipes), copied in;
//   sample    a TEST project built now from qualification/fixtures/sample-app through the real ingestion API, in the
//             shape the 0.5 extension sends (capture start with its reported settings, edits, a failing then passing
//             test run) plus Claude Code hook events — labelled as a test project by its name;
//   demo      the fictional demonstration (scripts/demo.js --fast), which the receiver marks as a demonstration.
// Usage: node qualification/ui/serve.js [--port 4180] [--data <dir>] [--empty]
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const cp=require('node:child_process');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const SAMPLE=path.join(REPO,'qualification/fixtures/sample-app');
const LUMEN=path.join(REPO,'qualification/recordings/lumen-recipes/projects');
// Pairing: a receiver issues control capabilities only to a browser that holds its pairing key (receiver-auth.json),
// which a user gives their browser once through the private link. The qualification's browsers are paired the same
// way: every browser launched by a script that loads this module stores the key of each environment's origin before a
// page runs (pages created afterwards; the key never leaves this process otherwise).
const pairings=new Map();
{const pw=require('playwright-core'),launch=pw.chromium.launch.bind(pw.chromium);
  // A page that sets sessionStorage 'qual-unpaired' stays unpaired (to test what an unpaired browser sees).
  const seed=keys=>{try{if(sessionStorage.getItem('qual-unpaired'))return;const k=keys[location.origin];if(k)localStorage.setItem('code-resonance-pairing',k);}catch{}};
  pw.chromium.launch=async(...a)=>{const b=await launch(...a),newContext=b.newContext.bind(b),newPage=b.newPage.bind(b);
    b.newContext=async(...o)=>{const c=await newContext(...o);await c.addInitScript(seed,Object.fromEntries(pairings));return c;};
    b.newPage=async(...o)=>{const p=await newPage(...o);await p.addInitScript(seed,Object.fromEntries(pairings));return p;};
    return b;};}
const EXT=/\.(ts|tsx|js|jsx|mjs|cjs|json|css|md)$/;
function walk(d,acc=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.git','dist'].includes(e.name))continue;const f=path.join(d,e.name);if(e.isDirectory())walk(f,acc);else if(EXT.test(e.name))acc.push(f);}return acc;}
async function createEnvironment({dataDir=null,port=0,empty=false,demo=true}={}){
  const dir=dataDir||await fsp.mkdtemp(path.join(os.tmpdir(),'cr-ui-'));
  if(!empty&&fs.existsSync(LUMEN))await fsp.cp(LUMEN,path.join(dir,'projects'),{recursive:true,force:false,errorOnExist:false});
  const svc=await createService({port,dataDir:dir}).start();
  const url=`http://127.0.0.1:${svc.port}`,auth={Authorization:`Bearer ${svc.token}`};
  pairings.set(url,svc.pairing);pairings.set(`http://localhost:${svc.port}`,svc.pairing);
  const post=async events=>{const r=await fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({events})});if(r.status!==202)throw new Error(await r.text());};
  const flush=id=>fetch(url+`/v1/flush${id?`?id=${id}`:''}`,{method:'POST',headers:auth});
  const projects={};
  if(!empty){
    projects.lumen=fs.existsSync(LUMEN)?fs.readFileSync(path.join(LUMEN,fs.readdirSync(LUMEN)[0],'id'),'utf8'):null;
    // The sample test project, as the 0.5 extension would capture it.
    const id=projects.sample=sha('code-resonance-ui-qualification/sample-app');let n=0,t=Date.now()-6*60000;
    const session=`ui-qual-${Date.now()}`,ev=(kind,x={})=>({v:1,id:`ui-qual-${String(++n).padStart(6,'0')}`,ts:(t+=1500),kind,projectId:id,sessionId:session,origin:'unknown',...x});
    await post([ev('workspace.started',{name:'sample-app (test project)',meta:{extensionVersion:'0.5.0',remote:'',includeHidden:false,captureDocumentContents:true,captureTerminalCommands:false,capturePromptText:false,shareProjectName:true,baselineFileLimit:450,receiverPort:svc.port}}),
      ev('project.baseline',{meta:{count:walk(SAMPLE).length,truncated:false}})]);
    let batch=[];for(const f of walk(SAMPLE)){batch.push(ev('document.snapshot',{file:path.relative(SAMPLE,f).replace(/\\/g,'/'),content:fs.readFileSync(f,'utf8'),meta:{reason:'baseline'}}));if(batch.length===20){await post(batch);batch=[];}}
    if(batch.length)await post(batch);await flush(id);
    const tsx=walk(SAMPLE).filter(f=>/\.(tsx|ts)$/.test(f));
    const claude=(kind,meta={})=>ev(kind,{sessionId:'claude-code-ui-qual',origin:'hook',meta:{provider:'claude-code',source:'claude-code-hook',agent:'main',...meta}});
    for(let i=0;i<tsx.length;i++){
      const rel=path.relative(SAMPLE,tsx[i]).replace(/\\/g,'/');
      await post([ev('document.edits',{file:rel,meta:{edits:24+i,insertedChars:180,removedChars:5,insertedLines:5,removedLines:0,windowMs:1000}}),
        ev('document.snapshot',{file:rel,content:fs.readFileSync(tsx[i],'utf8')+`\nexport function Panel${i}(){ return ${i}; }\n`,meta:{reason:'edit'}}),
        ...(i===1?[claude('agent.session.started'),claude('agent.tool.started',{tool:'Edit'}),claude('agent.tool.completed',{tool:'Edit'})]:[]),
        ...(i===2?[ev('terminal.command.finished',{meta:{category:'test',exitCode:1}})]:[]),
        ...(i===3?[ev('terminal.command.finished',{meta:{category:'test',exitCode:0}}),claude('agent.session.ended')]:[])]);
      await flush(id);
    }
    if(demo){
      // The fictional demonstration posts to the receiver recorded in this data directory's auth file.
      await new Promise((resolve,reject)=>{const c=cp.spawn(process.execPath,[path.join(REPO,'scripts/demo.js'),'--fast'],{env:{...process.env,RESONANCE_DATA:dir,RESONANCE_PORT:String(svc.port)},stdio:'ignore'});
        c.on('exit',code=>code===0?resolve():reject(new Error(`demo exited ${code}`)));c.on('error',reject);});
      projects.demo=sha('CODE RESONANCE — FICTIONAL DEMO');
    }
    await flush();
  }
  return {svc,url,dir,projects,pairing:svc.pairing,pairUrl:`${url}/#pair=${svc.pairing}`,async stop({keep=!!dataDir}={}){await svc.stop();if(!keep)await fsp.rm(dir,{recursive:true,force:true});}};
}
module.exports={createEnvironment};
if(require.main===module||require.main?.filename===require("node:path").join(__dirname,"serve.js")){
  const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
  createEnvironment({port:Number(flag('port')||0),dataDir:flag('data')?path.resolve(flag('data')):null,empty:args.includes('--empty'),demo:!args.includes('--no-demo')}).then(env=>{
    console.log(`Control Center (private link, pairs your browser): ${env.pairUrl}\nData (isolated): ${env.dir}\nProjects: ${JSON.stringify(env.projects)}\nCtrl+C stops it${flag('data')?'':' and deletes the data directory'}.`);
    const stop=async()=>{await env.stop();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
  }).catch(e=>{console.error(e);process.exitCode=1;});
}

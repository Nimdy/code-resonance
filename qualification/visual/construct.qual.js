'use strict';
// Technical qualification of the Construct (artistic acceptance is a separate, human judgement):
// WebGL renders, frame rate and draw calls at scale, no page errors, no file paths in the page.
// node visual/construct.qual.js [path-to-a-real-repo]
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const SAMPLE=process.argv[2]||path.join(__dirname,'../fixtures/sample-app');
const OUT=path.join(__dirname,'..','results','visual');
const EXT=/\.(ts|tsx|js|jsx|mjs|cjs|json|css|md)$/;const SKIP=new Set(['node_modules','.git','dist','build','.vscode']);
function walk(d,acc=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(SKIP.has(e.name))continue;const f=path.join(d,e.name);if(e.isDirectory())walk(f,acc);else if(EXT.test(e.name)&&fs.statSync(f).size<=150*1024)acc.push(f);}return acc;}
const checks=[],measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'cr-construct-qual-'));
  const svc=await createService({port:0,dataDir:dir}).start();
  const url=`http://127.0.0.1:${svc.port}`,projectId=sha('file://'+SAMPLE);let seq=0;
  const post=async evs=>{const r=await fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events:evs})});if(r.status!==202)throw Error(await r.text());};
  const ev=(kind,x)=>({v:1,id:`construct-qual-${String(++seq).padStart(6,'0')}`,ts:Date.now(),kind,projectId,sessionId:'construct-qual',origin:'unknown',...x});
  const files=walk(SAMPLE).slice(0,450);const secretPath=path.relative(SAMPLE,files.find(f=>/\.(ts|tsx)$/.test(f))||files[0]);
  let batch=[];for(const f of files){batch.push(ev('document.snapshot',{file:path.relative(SAMPLE,f),content:fs.readFileSync(f,'utf8'),meta:{reason:'baseline'}}));if(batch.length===24){await post(batch);batch=[];}}
  if(batch.length)await post(batch);
  await fetch(url+`/v1/flush?id=${projectId}`,{method:'POST',headers:{Authorization:`Bearer ${svc.token}`}});
  const project=await (await fetch(`${url}/api/project?id=${projectId}`)).json();
  measurements.project={files:project.stats.files,symbols:project.stats.symbols,districts:project.graph.nodes.filter(n=>n.type==='group').length,modules:project.graph.nodes.filter(n=>n.type==='module').length,tiers:project.graph.nodes.filter(n=>n.parent).length};
  const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`${url}/?project=${projectId}&world=construct`);
    await page.waitForFunction(()=>document.getElementById('connection').textContent==='SESSION CONNECTED',null,{timeout:20000});
    await page.waitForTimeout(6000);
    const visible=await page.$eval('#construct',e=>!e.classList.contains('hidden')&&e.width>0);
    check('the Construct renders with WebGL in the player',visible);
    const fps=await page.evaluate(()=>new Promise(r=>{let n=0;const s=performance.now();const f=()=>{n++;performance.now()-s<5000?requestAnimationFrame(f):r(n/((performance.now()-s)/1000));};requestAnimationFrame(f);}));
    measurements.fps=+fps.toFixed(1);measurements.renderer='SwiftShader (CPU WebGL) in headless Chromium';
    await page.screenshot({path:path.join(OUT,`construct-${path.basename(SAMPLE)}.png`)});
    const text=await page.evaluate(()=>document.body.innerText);
    check('no file paths reach the page',!text.includes(secretPath)&&!text.includes('src/'),secretPath);
    check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
    console.log('fps',measurements.fps,'(software rendering; GPU browsers not measured here)');
  }finally{await browser.close();await svc.stop();await fsp.rm(dir,{recursive:true,force:true});}
  fs.writeFileSync(path.join(OUT,`construct-qualification-${path.basename(SAMPLE)}.json`),JSON.stringify({at:new Date().toISOString(),sample:path.basename(SAMPLE),checks,measurements},null,2));
  console.log(JSON.stringify(measurements));
  process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

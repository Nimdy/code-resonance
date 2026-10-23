'use strict';
// Real-browser qualification of the Stage: live view, audio output, worlds, replay, OBS overlay and recording.
// Usage: node browser/stage.qual.js [path-to-a-real-repo-for-load]   (Chromium from Playwright's cache)
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const OUT=path.join(__dirname,'..','results','browser');
const SAMPLE=process.argv[2]||path.join(__dirname,'../fixtures/sample-app');
const EXT=/\.(ts|tsx|js|jsx|mjs|cjs|json|css|md)$/;const SKIP=new Set(['node_modules','.git','dist','build','.vscode']);
function walk(d,acc=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(SKIP.has(e.name))continue;const f=path.join(d,e.name);if(e.isDirectory())walk(f,acc);else if(EXT.test(e.name)&&fs.statSync(f).size<=150*1024)acc.push(f);}return acc;}
// Analyser taps on every connection to the audio destination measure what is actually output.
const TAP=`(()=>{const orig=AudioNode.prototype.connect;window.__taps=[];
AudioNode.prototype.connect=function(dest,...r){if(dest instanceof AudioDestinationNode){const a=this.context.createAnalyser();a.fftSize=4096;orig.call(this,a);window.__taps.push(a);}return orig.call(this,dest,...r);};
window.__level=()=>{let peak=0,sum=0,n=0;for(const a of window.__taps){const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);for(const v of b){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;}}return {peak,rms:n?Math.sqrt(sum/n):0,state:window.__taps[0]?.context.state||'none'};};})();`;
const checks=[];const measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
async function fps(page,ms=3000){return page.evaluate(ms=>new Promise(res=>{let n=0;const s=performance.now();const f=()=>{n++;if(performance.now()-s<ms)requestAnimationFrame(f);else res(n/((performance.now()-s)/1000));};requestAnimationFrame(f);}),ms);}
async function canvasHash(page){return page.evaluate(()=>{const c=document.getElementById('stage');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let lit=0;for(let i=0;i<d.length;i+=16)if(d[i]+d[i+1]+d[i+2]>180)lit++;return lit;});}
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'cr-browser-qual-'));
  const svc=await createService({port:0,dataDir:dir}).start();
  const url=`http://127.0.0.1:${svc.port}`;const projectId=sha('file://'+SAMPLE);let seq=0;
  const ev=(kind,x)=>({v:1,id:`browser-qual-${String(++seq).padStart(6,'0')}`,ts:Date.now(),kind,projectId,sessionId:'browser-qual',origin:'unknown',...x});
  const auth={Authorization:`Bearer ${svc.token}`};
  const post=async evs=>{const r=await fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({events:evs})});if(r.status!==202)throw Error(await r.text());};
  const flush=()=>fetch(url+`/v1/flush?id=${projectId}`,{method:'POST',headers:auth});
  const files=walk(SAMPLE).slice(0,450);const secretPath=path.relative(SAMPLE,files.find(f=>/\.(ts|tsx)$/.test(f))||files[0]);
  let batch=[];for(const f of files){batch.push(ev('document.snapshot',{file:path.relative(SAMPLE,f),content:fs.readFileSync(f,'utf8'),meta:{reason:'baseline'}}));if(batch.length===24){await post(batch);batch=[];}}
  if(batch.length)await post(batch);await flush();
  // A session with growth, a failing then passing test run and an agent: one recorded frame per step.
  const tsx=files.filter(f=>/\.(tsx|ts)$/.test(f)).slice(0,24);
  for(let i=0;i<tsx.length;i++){
    const rel=path.relative(SAMPLE,tsx[i]);
    await post([ev('document.edits',{file:rel,meta:{edits:30+i,insertedChars:200,removedChars:4,insertedLines:6,removedLines:0,windowMs:1000}}),
      ev('document.snapshot',{file:rel,content:fs.readFileSync(tsx[i],'utf8')+`\nexport function QualPanel${i}(){ return <section>{${i}}</section>; }\nexport const qualLimit${i} = ${i};\n`,meta:{reason:'edit'}}),
      ...(i%6===5?[ev('terminal.command.finished',{meta:{category:'test',exitCode:i%12===5?1:0}})]:[]),
      ...(i%4===2?[ev('agent.tool.completed',{file:rel,meta:{provider:'qualification',agent:`agent-${i%8===2?'a':'b'}`,tool:'Edit'}})]:[])]);
    await flush();
  }
  const project=await (await fetch(url+`/api/project?id=${projectId}`)).json();
  measurements.project={files:project.stats.files,symbols:project.stats.symbols,frames:project.timelineFrames,graphNodes:project.graph.nodes.length};
  const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(TAP);
    await page.goto(url+'/');
    await page.waitForFunction(()=>document.getElementById('connection').textContent==='SESSION CONNECTED',null,{timeout:15000});
    check('live view connects and selects the project',await page.$eval('#projectSelect',e=>e.value)===projectId);
    check('stage shows derived stats',Number(await page.textContent('#symbols'))>0,`symbols=${await page.textContent('#symbols')}`);
    await page.click('#soundBtn');await page.waitForTimeout(3000);
    const levels=[];for(let i=0;i<20;i++){levels.push(await page.evaluate(()=>window.__level()));await page.waitForTimeout(250);}
    const peak=Math.max(...levels.map(l=>l.peak)),rms=levels.reduce((a,l)=>a+l.rms,0)/levels.length;
    measurements.audio={state:levels.at(-1).state,peak:+peak.toFixed(4),meanRms:+rms.toFixed(4),silentSamples:levels.filter(l=>l.rms<1e-4).length};
    check('audio context runs and produces signal',levels.at(-1).state==='running'&&rms>0.002,JSON.stringify(measurements.audio));
    check('audio output does not clip',peak<0.99,`peak=${peak.toFixed(3)}`);
    measurements.fps={};
    for(const world of ['nexus','city','nebula']){
      await page.click(`[data-world="${world}"]`);await page.waitForTimeout(800);
      measurements.fps[world]=+(await fps(page)).toFixed(1);
      await page.screenshot({path:path.join(OUT,`live-${world}.png`)});
    }
    check('all worlds render at >= 30 fps (headless software raster, 1920x1080)',Object.values(measurements.fps).every(x=>x>=30),JSON.stringify(measurements.fps));
    await page.click('[data-world="nexus"]');
    await page.click('#replayBtn');
    await page.waitForFunction(()=>Number(document.getElementById('eventCount').textContent)>0,null,{timeout:15000});
    const replayCues=Number(await page.textContent('#eventCount'));
    const liveCues=project.timeline.filter(c=>c.type!=='document.baseline.indexed').length;
    check('replay loads the full recorded timeline',replayCues>=liveCues,`replay cues=${replayCues}, live projection (excluding baseline indexing)=${liveCues}`);
    await page.$eval('#scrub',e=>{e.value='0';e.dispatchEvent(new Event('input'));});await page.waitForTimeout(1500);
    const early=await canvasHash(page);await page.screenshot({path:path.join(OUT,'replay-start.png')});
    await page.$eval('#scrub',e=>{e.value='1000';e.dispatchEvent(new Event('input'));});await page.waitForTimeout(1500);
    const late=await canvasHash(page);await page.screenshot({path:path.join(OUT,'replay-end.png')});
    check('scrubbing replay changes the rendered architecture',early!==late,`lit samples start=${early} end=${late}`);
    await page.$eval('#scrub',e=>{e.value='0';e.dispatchEvent(new Event('input'));});await page.click('#playBtn');await page.waitForTimeout(2500);
    check('replay playback advances',Number(await page.$eval('#scrub',e=>e.value))>0,`scrub=${await page.$eval('#scrub',e=>e.value)}`);
    await page.click('#liveBtn');
    // Recording: real MediaRecorder output with video and audio tracks.
    const download=page.waitForEvent('download',{timeout:20000}).catch(()=>null);
    await page.click('#recordBtn');await page.waitForTimeout(4000);await page.click('#recordBtn');
    const file=await download;
    if(file){const saved=path.join(OUT,'recording.webm');await file.saveAs(saved);const size=fs.statSync(saved).size;measurements.recordingBytes=size;check('recording produces a WebM file',size>20000,`${size} bytes`);}
    else check('recording produces a WebM file',false,'no download');
    const overlay=await browser.newPage({viewport:{width:1920,height:1080}});
    await overlay.goto(url+'/?overlay=1');await overlay.waitForTimeout(4000);
    check('OBS overlay hides all controls',!(await overlay.isVisible('.toolbar'))&&!(await overlay.isVisible('.panel.left'))&&!(await overlay.isVisible('.transport')));
    const canvasBox=await overlay.$eval('#stage',e=>{const r=e.getBoundingClientRect();return [r.width,r.height];});
    check('OBS overlay canvas fills the frame',canvasBox[0]===1920&&canvasBox[1]===1080,canvasBox.join('x'));
    await overlay.screenshot({path:path.join(OUT,'overlay.png')});
    const text=(await page.evaluate(()=>document.body.innerText))+(await overlay.evaluate(()=>document.body.innerText));
    check('no file paths reach the page',!text.includes(secretPath)&&!text.includes('src/'),secretPath);
    check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
  }finally{await browser.close();await svc.stop();await fsp.rm(dir,{recursive:true,force:true});}
  const report={at:new Date().toISOString(),sample:path.basename(SAMPLE),browser:'chromium (playwright-core 1.62.0, headless)',checks,measurements};
  await fsp.writeFile(path.join(OUT,'stage-qualification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(measurements));
  process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

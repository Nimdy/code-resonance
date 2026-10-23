'use strict';
// Soak: the live Stage plays with sound for CR_SOAK_MINUTES while a synthetic session streams events in real time.
// Samples JS heap, DOM nodes, listeners, fps, audio level and receiver memory to detect leaks or decay.
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const MINUTES=Number(process.env.CR_SOAK_MINUTES||15);
const OUT=path.join(__dirname,'..','results','browser');
const TAP=`(()=>{const orig=AudioNode.prototype.connect;window.__taps=[];
AudioNode.prototype.connect=function(dest,...r){if(dest instanceof AudioDestinationNode){const a=this.context.createAnalyser();a.fftSize=2048;orig.call(this,a);window.__taps.push(a);}return orig.call(this,dest,...r);};
window.__rms=()=>{let s=0,n=0;for(const a of window.__taps){const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);for(const v of b){s+=v*v;n++;}}return n?Math.sqrt(s/n):0;};})();`;
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'cr-soak-'));
  const svc=await createService({port:0,dataDir:dir}).start();
  const url=`http://127.0.0.1:${svc.port}`,projectId=sha('soak');let n=0,file=0;
  const post=events=>fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events})}).catch(()=>{});
  const ev=(kind,x={})=>({v:1,id:`soak-${String(++n).padStart(8,'0')}`,ts:Date.now(),kind,projectId,sessionId:'soak',origin:'unknown',...x});
  await post([ev('workspace.started',{name:'soak'})]);
  // An endlessly growing project: a new module every ~20 s, edits every ~3 s, tests and an agent now and then.
  const modules=[];
  const stream=setInterval(()=>{
    const tick=n;
    if(tick%7===0||!modules.length){modules.push({name:`m${file++}`,lines:[]});}
    const m=modules[tick%modules.length];
    m.lines.push(m.lines.length%3===0?`export function Part${m.lines.length}(){ return <div>${m.lines.length}</div>; }`:`export function step${m.lines.length}(x: number){ return x + ${m.lines.length}; }`);
    if(modules.length>1&&m.lines.length===1)m.lines.unshift(`import { step0 } from './${modules[(tick+1)%modules.length].name}';`);
    const events=[ev('document.edits',{file:`src/${m.name}.tsx`,meta:{edits:25,insertedChars:120,removedChars:4,insertedLines:1,removedLines:0,windowMs:1000}}),
      ev('document.snapshot',{file:`src/${m.name}.tsx`,content:m.lines.join('\n')+'\n',meta:{reason:'edit'}})];
    if(tick%23===0)events.push(ev('terminal.command.finished',{meta:{category:'test',exitCode:tick%46===0?1:0}}));
    if(tick%11===0)events.push(ev('agent.tool.completed',{file:`src/${m.name}.tsx`,meta:{provider:'soak',agent:`agent-${tick%2}`,tool:'Edit'}}));
    void post(events);
  },3000);
  const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  const samples=[];
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(TAP);
    await page.goto(`${url}/?project=${projectId}`);
    await page.waitForTimeout(8000);await page.click('#soundBtn');
    const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
    const worlds=['nexus','city','nebula'],started=Date.now();
    for(let i=0;Date.now()-started<MINUTES*60000;i++){
      if(i%6===0)await page.click(`[data-world="${worlds[(i/6)%3|0]}"]`);
      await page.waitForTimeout(28000);
      const {metrics}=await cdp.send('Performance.getMetrics');const m=Object.fromEntries(metrics.map(x=>[x.name,x.value]));
      const fps=await page.evaluate(()=>new Promise(r=>{let k=0;const s=performance.now();const f=()=>{k++;performance.now()-s<2000?requestAnimationFrame(f):r(k/((performance.now()-s)/1000));};requestAnimationFrame(f);}));
      const rss=Number((fs.readFileSync('/proc/self/status','utf8').match(/VmRSS:\s+(\d+)/)||[])[1]||0)/1024;
      const sample={minute:+((Date.now()-started)/60000).toFixed(1),heapMB:+(m.JSHeapUsedSize/1e6).toFixed(1),nodes:m.Nodes,listeners:m.JSEventListeners,fps:+fps.toFixed(1),rms:+(await page.evaluate(()=>window.__rms())).toFixed(4),receiverProcessRssMB:+rss.toFixed(0),events:n,modules:modules.length};
      samples.push(sample);console.log(JSON.stringify(sample));
    }
    const firstHalf=samples.slice(0,Math.ceil(samples.length/2)),secondHalf=samples.slice(Math.ceil(samples.length/2));
    const avg=(xs,k)=>xs.reduce((a,x)=>a+x[k],0)/xs.length;
    const report={at:new Date().toISOString(),minutes:MINUTES,samples,pageErrors:errors,
      heapMB:{first:samples[0]?.heapMB,last:samples.at(-1)?.heapMB,max:Math.max(...samples.map(s=>s.heapMB))},
      fps:{firstHalf:+avg(firstHalf,'fps').toFixed(1),secondHalf:+avg(secondHalf,'fps').toFixed(1),min:Math.min(...samples.map(s=>s.fps))},
      audioSilentSamples:samples.filter(s=>s.rms<0.001).length};
    fs.writeFileSync(path.join(OUT,'soak-qualification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({heapMB:report.heapMB,fps:report.fps,audioSilentSamples:report.audioSilentSamples,pageErrors:errors.length}));
  }finally{clearInterval(stream);await browser.close();await svc.stop();await fsp.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

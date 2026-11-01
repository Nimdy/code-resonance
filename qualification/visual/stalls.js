'use strict';
// Long frames, diagnosed. The real player (not the film path) replays a recorded performance, then idles in Live, as
// visual/live-demo.js does, while the page records per frame: the requestAnimationFrame timestamp, how long the
// player's own frame callback took, the slowest WebGL call inside it (WebGL getters are synchronous round trips to
// the GPU process: a call that waits shows here), every GPU timer result the player reads (one per frame, in order; not
// the player's moving average) and every time the timer reports a disjoint period. Each frame interval over --long ms
// is reported with that context. Uses the lean driver (visual/lean.js).
//
// node visual/stalls.js --dataset <dir> --family synaptic-storm [--gpu amd] [--size 1920x1080] [--speed 2] [--idle 30]
//        [--quality auto|0-3] [--hide 1,3] [--long 100] [--life] [--sound] [--trace] [--task-ms 40] [--cpu-canvas] [--out dir] [--tag name]
//   --hide   render orders of the world's scene objects to hide (a bisection of the passes; observed, never the world's code)
//   --life   the world's digital life on (a tuning of life.enabled)
//   --sound  the music plays (as in visual/live-demo.js, where every run plays it)
//   --cpu-canvas  every 2D canvas (the label overlay) CPU-backed (willReadFrequently): one GPU context fewer to switch to
//   --trace  a Chrome trace of every process for the run, of which only the long tasks (40 ms or more, any process or
//            thread; --task-ms) are kept, with the page's clock marked every 2 s (to place them against the frame gaps)
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {projectOf,withService,recipeAction,processMemory}=require('./harness');
const {launchLean}=require('./lean');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const SRC=path.resolve(arg('dataset')),FAMILY=arg('family'),GPU=arg('gpu',null),[W,H]=arg('size','1920x1080').split('x').map(Number);
const TASK_MS=Number(arg('task-ms',40)),SPEED=Number(arg('speed',2)),QUALITY=arg('quality','auto'),IDLE=Number(arg('idle',30)),LONG=Number(arg('long',100)),HIDE=(arg('hide','')||'').split(',').filter(Boolean).map(Number);
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','stalls'))),TAG=arg('tag',`${FAMILY}-${W}x${H}-q${QUALITY}${HIDE.length?`-hide${HIDE.join('.')}`:''}`);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Other browsers' hardware GPU processes alive now (ANGLE on GL: the same GPU): GPU timer results include the time the
// GPU spends on their work, so every sample records them (ours excluded).
function otherGpuProcesses(){let n=0;for(const d of fs.readdirSync('/proc')){if(!/^\d+$/.test(d))continue;try{const c=fs.readFileSync(`/proc/${d}/cmdline`,'utf8');if(c.includes('--type=gpu-process')&&c.includes('--use-angle=gl'))n++;}catch{}}return Math.max(0,n-1);}
const pct=(a,p)=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(p*(s.length-1)))].toFixed(2):null;};
// In the page, before any of its code: frame callbacks timed, WebGL calls timed (the slowest per frame; any over 20 ms
// listed), GPU timer results and disjoint flags as the player reads them, the scene the world renders (to hide passes).
const PROBE=`window.__probe={frames:[],calls:[],gpu:[],disjoint:[],cur:null};{const P=window.__probe,now=()=>performance.now(),raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=cb=>raf(ts=>{const a=now();P.cur={max:0,name:''};try{cb(ts);}finally{P.frames.push([+ts.toFixed(2),+(now()-a).toFixed(2),+P.cur.max.toFixed(2),P.cur.name]);P.cur=null;}});
  const proto=window.WebGL2RenderingContext&&WebGL2RenderingContext.prototype;
  if(proto)for(const name of Object.getOwnPropertyNames(proto)){const d=Object.getOwnPropertyDescriptor(proto,name);if(!d||typeof d.value!=='function'||name==='constructor')continue;const f=d.value;
    proto[name]=function(){const a=now(),r=f.apply(this,arguments),t=now()-a;if(P.cur&&t>P.cur.max){P.cur.max=t;P.cur.name=name;}if(t>20&&P.calls.length<500)P.calls.push([+a.toFixed(1),name,+t.toFixed(1)]);
      if(name==='getQueryParameter'&&arguments[1]===0x8866)P.gpu.push([+a.toFixed(1),+(r/1e6).toFixed(3)]);
      if(name==='getParameter'&&arguments[0]===0x8FBB&&r)P.disjoint.push(+a.toFixed(1));return r;};}}
if(location.protocol==='http:')import('/vendor/three.module.min.js').then(T=>{T.Scene.prototype.onBeforeRender=function(r,s,c){if(c&&c.isPerspectiveCamera)window.__view={scene:s,camera:c};};}).catch(()=>{});`;
const TAKE=hide=>{const P=window.__probe,v=window.__view,st=window.ResonancePlayer.state,s=window.__qual.stats();
  if(v&&hide.length)v.scene.traverse(o=>{if(o.material&&hide.includes(o.renderOrder))o.visible=false;});
  const out={perf:st.position.now,end:st.position.end,playing:st.playing,frames:P.frames.splice(0),calls:P.calls.splice(0),gpu:P.gpu.splice(0),disjoint:P.disjoint.splice(0),
    quality:s?.quality??null,gpuMs:s?.gpuMs??null,focus:(()=>{let f=null;if(v)v.scene.traverse(o=>{const u=o.material?.uniforms;if(f===null&&u?.uFocus)f=+u.uFocus.value.toFixed(1);});return f;})(),pageMs:performance.now(),canvas:(c=>c?[c.width,c.height]:null)(document.getElementById('world'))};return out;};
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-stalls-'));fs.cpSync(SRC,dir,{recursive:true});
  const browser=await launchLean(GPU),report={tag:TAG,family:FAMILY,dataset:path.basename(SRC),size:`${W}x${H}`,speed:SPEED,quality:QUALITY,hide:HIDE,life:process.argv.includes('--life'),sound:process.argv.includes('--sound'),at:new Date().toISOString(),loadavg:os.loadavg()};
  const frames=[],calls=[],gpu=[],disjoint=[],samples=[];
  try{
    await withService(dir,async svc=>{
      const project=projectOf(dir);await recipeAction(svc,project,{type:'family',family:FAMILY});
      if(report.life)await recipeAction(svc,project,{type:'tune',values:{'life.enabled':true}});
      const page=await browser.newPage({viewport:{width:W,height:H}});await page.addInitScript(PROBE);
      if(process.argv.includes('--cpu-canvas')){report.cpuCanvas=true;await page.addInitScript(`{const gc=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,opts){if(type==='2d')opts={...(opts||{}),willReadFrequently:true};return gc.call(this,type,opts);};}`);}
      const q=QUALITY==='auto'?'':`&quality=${QUALITY}&adapt=0`;
      await page.goto(`http://127.0.0.1:${svc.port}/?world=living&project=${project}&qual=1${q}#/stage&pair=${svc.pairing}`);
      await page.waitForFunction(()=>!!window.__qual&&!!window.ResonancePlayer);
      report.renderer=await page.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),d=gl&&gl.getExtension('WEBGL_debug_renderer_info');return gl?gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER):'none';});
      if(GPU&&/SwiftShader|llvmpipe/i.test(report.renderer))throw new Error(`asked for the GPU, got ${report.renderer}`);
      await page.evaluate(s=>{window.ResonancePlayer.setMode('replay');window.ResonancePlayer.setSpeed(s);},SPEED);
      await page.waitForFunction(f=>window.ResonancePlayer.state.position.loaded&&window.__qual.world().family===f&&!!window.__qual.stats(),FAMILY,{timeout:90000});
      await wait(3000);if(report.sound)await page.evaluate(()=>window.ResonancePlayer.toggleSound());
      await page.evaluate(()=>window.__qual.replayFromStart());
      const TRACE=process.argv.includes('--trace'),longTasks=[],names={},marks=[];let cdp=null,traceDone=null;
      if(TRACE){cdp=await browser.newBrowserCDPSession();let resolve;traceDone=new Promise(r=>{resolve=r;});
        cdp.on(m=>{if(m.method==='Tracing.dataCollected'){for(const e of m.params.value){
            if(e.ph==='M'&&(e.name==='process_name'||e.name==='thread_name'))names[`${e.pid}${e.name==='thread_name'?`/${e.tid}`:''}`]=e.args?.name;
            else if(typeof e.name==='string'&&e.name.startsWith('probe:'))marks.push([e.ts,+e.name.slice(6)]);
            else if(e.ph==='X'&&e.dur>=TASK_MS*1000)longTasks.push({ts:e.ts,dur:+(e.dur/1000).toFixed(1),name:e.name,cat:e.cat,pid:e.pid,tid:e.tid,args:JSON.stringify(e.args||{}).slice(0,300)});}}
          else if(m.method==='Tracing.tracingComplete')resolve();});
        await cdp.send('Tracing.start',{transferMode:'ReportEvents',traceConfig:{recordMode:'recordContinuously',includedCategories:['toplevel','gpu','viz','blink.user_timing','disabled-by-default-gpu.service','gpu.angle']}});
        await page.evaluate(()=>{window.__mark=setInterval(()=>performance.mark('probe:'+performance.now().toFixed(1)),2000);});}
      const t0=Date.now();let part='replay',liveAt=null;
      for(;;){await wait(500);const x=await page.evaluate(TAKE,HIDE);x.t=Date.now()-t0;
        for(const f of x.frames)frames.push([...f,part]);calls.push(...x.calls);gpu.push(...x.gpu);disjoint.push(...x.disjoint);
        samples.push({t:x.t,pageMs:x.pageMs,part,perf:x.perf,quality:x.quality,gpuMs:x.gpuMs,focus:x.focus,canvas:x.canvas,mem:processMemory(),otherGpu:otherGpuProcesses()});
        if(part==='replay'&&!x.playing&&x.perf>=x.end&&x.t>5000){part='idle';liveAt=x.t;await page.evaluate(()=>window.ResonancePlayer.setMode('live'));}
        else if(part==='idle'&&x.t-liveAt>=IDLE*1000)break;
        if(x.t>20*60000)throw new Error('the replay did not end in 20 minutes');}
      report.errors=await page.errors();
      if(TRACE){await cdp.send('Tracing.end');await Promise.race([traceDone,wait(60000)]);
        // the page's clock against the trace's (a least-squares line through the marks: ms = a + ts / 1000)
        const off=marks.length?marks.reduce((s,[ts,ms])=>s+(ms-ts/1000),0)/marks.length:null;
        report.trace={marks:marks.length,offsetMs:off,longTasks:longTasks.map(x=>({...x,pageMs:off===null?null:+(x.ts/1000+off).toFixed(1),process:names[x.pid]||x.pid,thread:names[`${x.pid}/${x.tid}`]||x.tid}))};}
    });
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
  // Frame intervals; each long one with what surrounds it: the callbacks before and after it, the slowest WebGL calls,
  // the GPU timer results read within a second after it, disjoint flags within a second.
  // (the page has more than one animation-frame chain: the player's frames are those that make WebGL calls)
  const all=frames.length;frames.splice(0,frames.length,...frames.filter(f=>f[3]!==''));
  const iv=[];for(let i=1;i<frames.length;i++)iv.push(frames[i][0]-frames[i-1][0]);
  const long=[];for(let i=1;i<frames.length;i++){const d=frames[i][0]-frames[i-1][0];if(d<=LONG)continue;const [ts]=frames[i],prev=frames[i-1];
    long.push({at:+(ts/1000).toFixed(2),intervalMs:+d.toFixed(1),part:frames[i][4],callbackBefore:{ms:prev[1],slowestGl:prev[3],glMs:prev[2]},callbackAfter:{ms:frames[i][1],slowestGl:frames[i][3],glMs:frames[i][2]},
      gpuMsAfter:gpu.filter(g=>g[0]>=ts&&g[0]<ts+1000).map(g=>g[1]).slice(0,8),gpuMsBefore:gpu.filter(g=>g[0]<prev[0]&&g[0]>prev[0]-1000).map(g=>g[1]).slice(-6),
      disjointNear:disjoint.filter(t=>Math.abs(t-ts)<1500).length,slowCalls:calls.filter(c=>c[0]>=prev[0]-50&&c[0]<=ts+50),
      tasks:(report.trace?.longTasks||[]).filter(x=>x.pageMs!==null&&x.pageMs+x.dur>=prev[0]-20&&x.pageMs<=ts+20).map(x=>`${x.process}/${x.thread} ${x.name} ${x.dur} ms ${x.args}`)});}
  const cb=frames.map(f=>f[1]),g=gpu.map(x=>x[1]);
  report.summary={callbacks:all,frames:frames.length,fps:+(frames.length/((frames.at(-1)[0]-frames[0][0])/1000)).toFixed(1),intervalMs:{p50:pct(iv,.5),p95:pct(iv,.95),p99:pct(iv,.99),max:pct(iv,1)},
    longFrames:long.length,callbackMs:{p50:pct(cb,.5),p95:pct(cb,.95),max:pct(cb,1)},gpuMs:{n:g.length,p50:pct(g,.5),p95:pct(g,.95),p99:pct(g,.99),max:pct(g,1)},
    disjoint:disjoint.length,slowGlCalls:calls.length,qualityLevels:[...new Set(samples.map(s=>s.quality))],canvas:samples.at(-1)?.canvas,
    memMb:{first:samples[0]?.mem,last:samples.at(-1)?.mem},otherGpuSeconds:samples.filter(x=>x.otherGpu>0).length/2};
  // compact series for correlation: per player frame [ts, callback ms]; per GPU timer result [read at, ms]
  report.series={frames:frames.map(f=>[+f[0].toFixed(1),f[1]]),gpu};
  report.long=long;report.calls=calls;report.gpuTop=gpu.slice().sort((a,b)=>b[1]-a[1]).slice(0,12);report.samples=samples;
  const file=path.join(OUT,`${TAG}.json`);fs.writeFileSync(file,JSON.stringify(report,null,1));
  console.log(JSON.stringify({summary:report.summary,long:long.map(l=>({at:l.at,ms:l.intervalMs,part:l.part,cbBefore:l.callbackBefore,cbAfter:l.callbackAfter,gpuAfter:l.gpuMsAfter,gpuBefore:l.gpuMsBefore,disjoint:l.disjointNear,slow:l.slowCalls,tasks:l.tasks})),longTasks:report.trace?.longTasks?.length,errors:report.errors},null,1));
  console.log('written',file);
})().catch(e=>{console.error(e);process.exitCode=1;});

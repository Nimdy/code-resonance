'use strict';
// A live demonstration of a world, measured. The real player (not the film path) replays a recorded performance in real
// time, then switches to Live for the world's idle life; with --record the player's own RECORD runs for all of it, so the
// file is an uninterrupted capture of what the player drew: camera motion, transitions and pacing as they happened, with
// whatever frames the machine could not draw. Sampled every half second: every frame interval the page presented
// (requestAnimationFrame), the Auto level and its changes, GPU time per frame where the driver measures it, CPU per
// browser process, memory (resident per process type, and the page's JS heap), the agents present, and the camera's
// framing, read without changing anything (Synaptic Storm's focus distance; Fractal Continuum's camera distance over its
// form's scale), to tell close-ups apart. Uses the lean driver (visual/lean.js): Playwright inflates renderer memory.
//
// node visual/live-demo.js --dataset <dir> --family synaptic-storm [--gpu amd] [--size 1920x1080] [--speed 1]
//        [--record 1080p|720p|stage] [--quality auto|0-3] [--overlay] [--idle 60] [--out dir] [--tag name]
//   --overlay  the OBS overlay page (?overlay=1&sound=1), as an OBS Browser Source loads it, instead of the player
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {projectOf,withService,recipeAction,processMemory}=require('./harness');
const {launchLean}=require('./lean');
const media=require('./media');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const SRC=path.resolve(arg('dataset')),FAMILY=arg('family'),GPU=arg('gpu',null),[W,H]=arg('size','1920x1080').split('x').map(Number);
const SPEED=Number(arg('speed',1)),RECORD=arg('record',null),QUALITY=arg('quality','auto'),OVERLAY=process.argv.includes('--overlay'),IDLE=Number(arg('idle',60));
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','live'))),TAG=arg('tag',`${FAMILY}-${OVERLAY?'overlay':'player'}${RECORD?`-${RECORD}`:''}`);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(a,p)=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(p*(s.length-1)))].toFixed(2):null;};
const mean=a=>{const s=a.filter(Number.isFinite);return s.length?+(s.reduce((x,y)=>x+y,0)/s.length).toFixed(2):null;};
// Every frame interval the page presents, and the scene and camera the world last rendered (observed, never changed).
const OBSERVE=`window.__iv=[];{let last=0;const f=t=>{if(last)window.__iv.push(+(t-last).toFixed(2));last=t;requestAnimationFrame(f);};requestAnimationFrame(f);}
if(location.protocol==='http:')import('/vendor/three.module.min.js').then(T=>{T.Scene.prototype.onBeforeRender=function(r,s,c){if(c&&c.isPerspectiveCamera)window.__view={scene:s,camera:c};};}).catch(()=>{});`;
const SAMPLE=()=>{const s=window.__qual.stats(),v=window.__view,st=window.ResonancePlayer.state,m=performance.memory;let focus=null,form=null,camera=null;
  if(v){camera=v.camera.position.length();v.scene.traverse(o=>{const u=o.material?.uniforms;if(focus===null&&u?.uFocus)focus=u.uFocus.value;const F=o.userData?.fractal;if(form===null&&F?.uWSg)form=F.uWSg.value;});}
  return {perf:st.position.now,end:st.position.end,mode:st.mode,playing:st.playing,iv:window.__iv.splice(0),fps:s?.fps??null,quality:s?.quality??null,changes:s?.qualityChanges??null,degraded:!!s?.degraded,
    gpuMs:s?.gpuMs??null,blind:!!s?.gpuTimerBlind,updateMs:s?.updateMs??null,drawMs:s?.drawMs??null,agents:s?.agents??0,phase:s?.phase??null,family:s?.family??null,
    heapMb:m?+(m.usedJSHeapSize/1048576).toFixed(1):null,canvas:(c=>c?[c.width,c.height]:null)(document.getElementById("world")),camera,focus,form,recording:window.__qual.recording()};};
// The camera's framing: a close-up is Synaptic Storm's camera within 26 units of what it frames (its own constants: 14
// for an attention close-up, 23 for a busy agent, 38 or more for the network), or Fractal Continuum's camera nearer than
// 0.7 of its usual framing (attention 0.36, a busy agent 0.64 of the whole form's framing distance).
function closeUps(samples){
  if(FAMILY==='synaptic-storm')return samples.map(s=>Number.isFinite(s.focus)&&s.focus<26);
  const r=samples.map(s=>Number.isFinite(s.camera)&&Number(s.form)>0?s.camera/Number(s.form):null),wide=pct(r,.9);return r.map(x=>x!==null&&wide&&x<.7*wide);
}
function summary(list){
  if(!list.length)return null;const iv=list.flatMap(s=>s.iv),total=iv.reduce((a,b)=>a+b,0),levels={};
  for(const s of list)levels[s.quality]=(levels[s.quality]||0)+.5;
  const busy=list.map(s=>Number.isFinite(s.gpuMs)&&Number.isFinite(s.fps)?s.gpuMs*s.fps/10:null);
  return {seconds:list.length/2,frames:iv.length,fps:total?+(iv.length/(total/1000)).toFixed(1):null,frameMs:{p50:pct(iv,.5),p95:pct(iv,.95),p99:pct(iv,.99),max:pct(iv,1)},
    slowFrames:{over34ms:+(iv.filter(x=>x>34).length/Math.max(1,iv.length)*100).toFixed(1),over50ms:+(iv.filter(x=>x>50).length/Math.max(1,iv.length)*100).toFixed(1)},
    autoFps:{mean:mean(list.map(s=>s.fps)),p05:pct(list.map(s=>s.fps),.05)},qualitySeconds:levels,qualityChanges:list.at(-1).changes-(list[0].changes||0),degraded:list.some(s=>s.degraded),
    gpuMs:{mean:mean(list.map(s=>s.gpuMs)),p95:pct(list.map(s=>s.gpuMs),.95)},gpuBusyPercent:mean(busy),gpuTimerBlind:list.some(s=>s.blind),
    cpuMs:{update:mean(list.map(s=>s.updateMs)),draw:mean(list.map(s=>s.drawMs))},agentsMax:Math.max(...list.map(s=>s.agents))};
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-live-'));fs.cpSync(SRC,dir,{recursive:true});
  const browser=await launchLean(GPU),report={tag:TAG,family:FAMILY,dataset:path.basename(SRC),size:`${W}x${H}`,speed:SPEED,record:RECORD,quality:QUALITY,overlay:OVERLAY,idle:IDLE,at:new Date().toISOString()};
  try{
    await withService(dir,async svc=>{
      const project=projectOf(dir);await recipeAction(svc,project,{type:'family',family:FAMILY});
      const page=await browser.newPage({viewport:{width:W,height:H}});await page.addInitScript(OBSERVE);
      const q=QUALITY==='auto'?'':`&quality=${QUALITY}&adapt=0`;
      await page.goto(OVERLAY?`http://127.0.0.1:${svc.port}/?overlay=1&sound=1&project=${project}&world=living&qual=1${q}`:`http://127.0.0.1:${svc.port}/?world=living&project=${project}&qual=1${q}#/stage&pair=${svc.pairing}`);
      await page.waitForFunction(()=>!!window.__qual&&!!window.ResonancePlayer);
      report.renderer=await page.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),d=gl&&gl.getExtension('WEBGL_debug_renderer_info');return gl?gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER):'none';});
      console.log('renderer',report.renderer);if(GPU&&/SwiftShader|llvmpipe/i.test(report.renderer))throw new Error(`asked for the GPU, got ${report.renderer}`);
      await page.evaluate(s=>{window.ResonancePlayer.setMode('replay');window.ResonancePlayer.setSpeed(s);},SPEED);
      await page.waitForFunction(f=>window.ResonancePlayer.state.position.loaded&&window.__qual.world().family===f&&!!window.__qual.stats(),FAMILY,{timeout:90000});
      await wait(3000);
      const cdp=await browser.newBrowserCDPSession(),cpu=async()=>{const {processInfo}=await cdp.send('SystemInfo.getProcessInfo');const o={};for(const p of processInfo)o[p.type]=(o[p.type]||0)+p.cpuTime;return o;};
      // The music plays in every run (RECORD starts it; the overlay starts it itself with sound=1).
      if(RECORD)report.recordingStarted=await page.evaluate(async size=>{window.__qual.setRecordSize(size);await window.__qual.record();return window.__qual.recording();},RECORD);
      else if(!OVERLAY)await page.evaluate(()=>window.ResonancePlayer.toggleSound());
      await page.evaluate(()=>window.__qual.replayFromStart());
      const t0=Date.now(),cpu0=await cpu(),samples=[];let part='replay',liveAt=null;
      for(;;){
        await wait(500);const x=await page.evaluate(SAMPLE);x.t=Date.now()-t0;x.part=part;x.memMb=processMemory();samples.push(x);
        if(part==='replay'&&!x.playing&&x.perf>=x.end&&x.t>5000){part='idle';liveAt=x.t;await page.evaluate(()=>window.ResonancePlayer.setMode('live'));console.log(`replay ended after ${(x.t/1000).toFixed(1)} s; live (idle) for ${IDLE} s`);}
        else if(part==='idle'&&x.t-liveAt>=IDLE*1000)break;
        if(x.t>30*60000)throw new Error('the replay did not end in 30 minutes');
        if(samples.length%60===0)console.log(`${(x.t/1000).toFixed(0)} s ${part} fps ${x.fps} level ${x.quality} gpu ${x.gpuMs} ms agents ${x.agents} renderer ${x.memMb?.renderer} MB gpu-process ${x.memMb?.gpu} MB`);
      }
      const cpu1=await cpu(),elapsed=(Date.now()-t0)/1000;
      report.cpuPercent=Object.fromEntries(Object.keys(cpu1).map(k=>[k,+(((cpu1[k]-(cpu0[k]||0))/elapsed)*100).toFixed(1)]));
      if(RECORD){
        const file=path.join(OUT,`${TAG}.webm`),stopAt=Date.now();
        const [download,result]=await Promise.all([page.waitForEvent('download',{timeout:600000}),page.evaluate(()=>window.__qual.stop())]);
        await download.saveAs(file);report.recording={file:path.basename(file),finalizeMs:Date.now()-stopAt,result,megabytes:+(fs.statSync(file).size/1048576).toFixed(1),analysis:media.analyse(file)};
      }
      report.errors=await page.errors();
      const close=closeUps(samples),pick=f=>samples.filter((s,i)=>f(s,i));
      report.summary={all:summary(samples),replay:summary(pick(s=>s.part==='replay')),idle:summary(pick(s=>s.part==='idle')),
        multiAgent:summary(pick(s=>s.part==='replay'&&s.agents>=2)),closeUp:summary(pick((s,i)=>close[i])),wide:summary(pick((s,i)=>!close[i]))};
      const mem=samples.map(s=>s.memMb).filter(Boolean),heap=samples.map(s=>s.heapMb).filter(Number.isFinite);
      report.memoryMb={first:mem[0],last:mem.at(-1),max:Object.fromEntries(Object.keys(mem[0]||{}).map(k=>[k,Math.max(...mem.map(m=>m[k]))])),heap:{first:heap[0],last:heap.at(-1),max:Math.max(...heap)}};
      report.samples=samples;
    });
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
  const file=path.join(OUT,`${TAG}.json`);fs.writeFileSync(file,JSON.stringify(report,null,1));
  const s=report.summary;console.log(JSON.stringify({all:s.all,closeUp:s.closeUp,multiAgent:s.multiAgent,idle:s.idle,memoryMb:report.memoryMb,cpuPercent:report.cpuPercent,recording:report.recording&&{...report.recording,analysis:{...report.recording.analysis,gapsAt:undefined}},errors:report.errors},null,1));
  console.log('written',file);
})().catch(e=>{console.error(e);process.exitCode=1;});

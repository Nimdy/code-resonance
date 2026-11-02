// Genesis field proof: the page (loaded by run.js into the receiver's own origin, so it uses the shipped modules and the
// performer). One clock: in real time the audio context's, the score scheduled on it and every fixed-step simulation
// catching up to it; offline, the frame index. Several runs (the comparisons) share one canvas side by side, each with
// its own simulation and view and the same camera. Exposes window.__gf.
import {createField,DT,FIELD_VERSION} from '__ORIGIN__/worlds/genesis-field.js';
import {createFieldView} from '__ORIGIN__/worlds/genesis-field-view.js';
import {degreeOfMidi} from '__ORIGIN__/worlds/genesis-laws.js';
import {createMusical} from '__ORIGIN__/worlds/musical.js';
import {THREE} from '__ORIGIN__/worlds/core.js';
import {createProof,SCHEDULE,IDLE} from '__PROOF__';
let renderer,runs=[],inputs,canvas,recorded=null,W=1920,H=1080,options={};
const gpu={ext:null,queries:[],samples:[]};
function gpuBegin(gl){if(!gpu.ext)return null;gpuPoll(gl);if(gpu.queries.length>6)return null;const q=gl.createQuery();gl.beginQuery(gpu.ext.TIME_ELAPSED_EXT,q);return q;}
function gpuEnd(gl,q){if(q){gl.endQuery(gpu.ext.TIME_ELAPSED_EXT);gpu.queries.push(q);}}
function gpuPoll(gl){while(gpu.queries.length&&gl.getQueryParameter(gpu.queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=gpu.queries.shift(),ns=gl.getQueryParameter(q,gl.QUERY_RESULT);gl.deleteQuery(q);if(!gl.getParameter(gpu.ext.GPU_DISJOINT_EXT))gpu.samples.push(ns/1e6);}}
const pct=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return +s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2);};
// the runs advance together, each keeping the state before its last step so the picture can interpolate
function stepAll(tau){for(const r of runs)while(r.proof.sim.step*DT+1e-9<tau){r.view.capture();r.proof.advanceTo((r.proof.sim.step+1)*DT);}}
function drawAll(tau){
  for(const r of runs)r.view.sync(Math.min(1,Math.max(0,(tau-(r.proof.sim.step-1)*DT)/DT)));
  renderer.setScissorTest(false);renderer.setClearColor(0x000000,1);renderer.clear();
  for(const r of runs)r.view.render(runs.length>1?r.viewport:null);
}
const first=()=>runs[0].proof;
window.__gf={
  version:FIELD_VERSION,
  // variants: one run per entry ({change, music}); idle: the idle experiment; field: simulation options (the interior)
  init({inputs:inp,width=1920,height=1080,R=44,variants=[{}],idle=false,field={},schedule=SCHEDULE,view:viewOpts={}}){
    inputs=inp;W=width;H=height;options={idle,variants,schedule};document.body.innerHTML='';document.body.style.cssText='margin:0;background:#000;overflow:hidden';
    canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.style.cssText=`width:${width}px;height:${height}px;display:block`;document.body.appendChild(canvas);
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=viewOpts.exposure??1.05;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.autoClear=false;
    const gl=renderer.getContext();gpu.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const n=variants.length,cw=Math.floor(width/n);
    runs=variants.map((v,i)=>{
      const proof=createProof({createField,DT,degreeOfMidi,score:window.ResonanceScore,createMusical},inputs,{R,idle,field,schedule,...v});
      const view=createFieldView({renderer,sim:proof.sim,palette:inputs.palette,material:inputs.material,width:n>1?cw:width,height,look:viewOpts.look});
      if(viewOpts.frame)view.frame(viewOpts.frame);if(viewOpts.debug)view.debug(viewOpts.debug);
      return {proof,view,variant:v,viewport:{x:i*cw,y:0,w:cw,h:height}};
    });
    return {N:first().sim.N,K:first().sim.K(),tempo:first().tempo,barMs:first().barMs,passage:first().passage,physics:first().sim.physics,
      gpuTimer:!!gpu.ext,glRenderer:(gl.getExtension('WEBGL_debug_renderer_info')&&gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL))||null};
  },
  // lab: advance to tau as fast as possible and draw (the same states as real time; only the speed differs)
  still(tau,type='image/jpeg'){stepAll(tau);drawAll(tau);
    return {image:canvas.toDataURL(type,.92),metrics:runs.map(r=>r.proof.sim.metrics()),hash:runs.map(r=>r.proof.sim.hash()),step:first().sim.step};},
  // fast-forward without drawing (the idle experiment reaches its tenth minute this way)
  advance(tau){stepAll(tau);return runs.map(r=>({hashes:{...r.proof.hashes},step:r.proof.sim.step}));},
  // offline film: frame i at fps from proof time `from`
  frame(i,fps=60,from=0){const tau=from+i/fps;stepAll(tau);drawAll(tau);return canvas.toDataURL('image/jpeg',.93);},
  // the score from proof time t0 to t1, rendered offline by the performer on the score's bar grid (film.js does the same)
  async scoreAudio(t0,t1){
    const p=first().passage,start=options.idle?0:options.schedule.music;if(!p)return null;
    const from=Math.max(t0,start),perf=p.from+(from-start)*1000,frames=options.idle?inputs.idle.frames:inputs.frames;
    const timeline=frames.map(f=>({atMs:Math.max(perf,f.t),frame:{controls:{energy:f.energy,tension:f.tension},chapter:f.chapter,milestone:f.milestone,end:f.end,projectSeed:inputs.music.seed}})).filter(x=>x.atMs<=perf+(t1-from+4)*1000).sort((a,b)=>a.atMs-b.atMs);
    const buf=await window.ResonanceMusic.renderOffline({timeline,startMs:perf,durationSec:t1-from+1.5,style:inputs.music.style,speed:1,projectId:'genesis-field',scoreVersion:inputs.music.version,profile:inputs.music.profile,projectSeed:inputs.music.seed});
    return {buf,lead:from-t0};
  },
  async scoreWav(t0,t1){
    const a=await this.scoreAudio(t0,t1);if(!a)return null;const buf=a.buf,lead=Math.round(a.lead*buf.sampleRate);
    const n=lead+buf.length,L=buf.getChannelData(0),Rr=buf.getChannelData(1),v=new DataView(new ArrayBuffer(44+n*4));
    const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
    w(0,'RIFF');v.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
    v.setUint32(24,buf.sampleRate,true);v.setUint32(28,buf.sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*4,true);
    for(let i=0;i<buf.length;i++){v.setInt16(44+(lead+i)*4,Math.max(-1,Math.min(1,L[i]))*32767,true);v.setInt16(46+(lead+i)*4,Math.max(-1,Math.min(1,Rr[i]))*32767,true);}
    const bytes=new Uint8Array(v.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin);
  },
  // real time from proof time `from` (reached first as fast as possible) to `to`: the score plays on the audio context
  // and every simulation follows that clock. With record, the canvas and the audio are recorded together.
  async realtime({record=false,fps=60,bitrate=16e6,from=0,to=options.schedule.end}={}){
    stepAll(from);
    const gl=renderer.getContext(),audio=new AudioContext({latencyHint:'playback'}),score=await this.scoreAudio(from,to);
    await audio.resume();
    const dest=audio.createMediaStreamDestination();
    const src=score?audio.createBufferSource():null;if(src){src.buffer=score.buf;src.connect(audio.destination);src.connect(dest);}
    let rec=null,chunks=[];
    if(record){const stream=canvas.captureStream(fps);for(const t of dest.stream.getAudioTracks())stream.addTrack(t);
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
      rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};}
    const A0=audio.currentTime+.25;if(src)src.start(A0+score.lead);
    if(rec)rec.start(1000);
    const frames=[],cpu=[],steps=[];gpu.samples.length=0;let last=performance.now();
    await new Promise(resolve=>{
      const tick=()=>{
        // the audio clock, read through its output timestamp (the context time paired with the moment it is heard), so it
        // advances smoothly between the audio thread's updates; it stays the only clock
        const now=performance.now(),ts=audio.getOutputTimestamp(),ctxNow=ts.contextTime>0?ts.contextTime+(now-ts.performanceTime)/1000:audio.currentTime;
        const tau=from+Math.max(0,ctxNow-A0);
        const c0=performance.now(),s0=first().sim.step;
        stepAll(tau);
        const sim1=performance.now();
        const q=gpuBegin(gl);drawAll(tau);gpuEnd(gl,q);
        const c1=performance.now();
        frames.push(now-last);cpu.push(c1-c0);steps.push({sim:sim1-c0,n:first().sim.step-s0});last=now;
        if(tau>=to)resolve();else requestAnimationFrame(tick);
      };requestAnimationFrame(tick);
    });
    gpuPoll(gl);
    let video=null;
    if(rec){await new Promise(r=>{rec.onstop=r;rec.stop();});const blob=new Blob(chunks,{type:rec.mimeType});recorded=blob;video={mime:rec.mimeType,size:blob.size};}
    await audio.close();
    // simulation cost per step covers every run (a comparison steps two)
    const ft=frames.slice(1),simMs=steps.filter(s=>s.n>0).map(s=>s.sim/s.n);
    return {runs:runs.map(r=>({variant:r.variant,hashes:{...r.proof.hashes}})),frames:ft.length,fps:+(1000*ft.length/ft.reduce((a,b)=>a+b,0)).toFixed(1),
      frameMs:{p50:pct(ft,.5),p95:pct(ft,.95),p99:pct(ft,.99),max:pct(ft,1),over34:+(ft.filter(x=>x>34).length/ft.length*100).toFixed(2)},
      cpuMs:{p50:pct(cpu,.5),p95:pct(cpu,.95),max:pct(cpu,1)},stepMs:{p50:pct(simMs,.5),p95:pct(simMs,.95),max:pct(simMs,1)},
      gpuMs:{n:gpu.samples.length,p50:pct(gpu.samples,.5),p95:pct(gpu.samples,.95),max:pct(gpu.samples,1)},
      heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,video};
  },
  // a recorded video's bytes, base64, in chunks (the driver fetches it piece by piece)
  async chunk(offset,size){const b=recorded;const part=new Uint8Array(await b.slice(offset,offset+size).arrayBuffer());let bin='';for(let i=0;i<part.length;i+=0x8000)bin+=String.fromCharCode(...part.subarray(i,i+0x8000));return {data:btoa(bin),total:b.size};},
  bars(){const p=first().passage,out=[];for(let b=p.bar;b<p.bar+Math.min(p.bars,8);b++){const x=first().musical.bar(b);out.push(x.steps.map(st=>st.map(n=>[n.group,n.midi,n.velocity])));}return out;},
  hashes(){return runs.map(r=>({variant:r.variant,hashes:{...r.proof.hashes}}));},log(){return first().log;},
  // per-step state hashes over a range of steps (determinism diagnosis)
  trace(from,to){const p=first(),out=[];for(let s=p.sim.step+1;s<=to;s++){p.advanceTo(s*DT);if(s>=from)out.push(p.sim.hash());}return {log:p.log,tail:out};}
};

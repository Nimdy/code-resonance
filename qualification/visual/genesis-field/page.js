// Genesis field proof: the page (loaded by run.js into the receiver's own origin, so it uses the shipped modules and the
// performer). One clock: in real time the audio context's, the passage scheduled on it and the fixed-step simulation
// catching up to it; offline, the frame index. Exposes window.__gf.
import {createField,DT,FIELD_VERSION} from '__ORIGIN__/worlds/genesis-field.js';
import {createFieldView} from '__ORIGIN__/worlds/genesis-field-view.js';
import {degreeOfMidi} from '__ORIGIN__/worlds/genesis-laws.js';
import {createMusical} from '__ORIGIN__/worlds/musical.js';
import {THREE} from '__ORIGIN__/worlds/core.js';
import {createProof,SCHEDULE} from '__PROOF__';
let renderer,view,proof,inputs,canvas,recorded=null;
const gpu={ext:null,queries:[],samples:[]};
function gpuBegin(gl){if(!gpu.ext)return null;gpuPoll(gl);if(gpu.queries.length>6)return null;const q=gl.createQuery();gl.beginQuery(gpu.ext.TIME_ELAPSED_EXT,q);return q;}
function gpuEnd(gl,q){if(q){gl.endQuery(gpu.ext.TIME_ELAPSED_EXT);gpu.queries.push(q);}}
function gpuPoll(gl){while(gpu.queries.length&&gl.getQueryParameter(gpu.queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=gpu.queries.shift(),ns=gl.getQueryParameter(q,gl.QUERY_RESULT);gl.deleteQuery(q);if(!gl.getParameter(gpu.ext.GPU_DISJOINT_EXT))gpu.samples.push(ns/1e6);}}
const pct=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return +s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2);};
window.__gf={
  version:FIELD_VERSION,
  init({inputs:inp,width=1920,height=1080,R=44,schedule=SCHEDULE,view:viewOpts={}}){
    inputs=inp;document.body.innerHTML='';document.body.style.cssText='margin:0;background:#000;overflow:hidden';
    canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.style.cssText=`width:${width}px;height:${height}px;display:block`;document.body.appendChild(canvas);
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=viewOpts.exposure??1.05;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const gl=renderer.getContext();gpu.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    proof=createProof({createField,DT,degreeOfMidi,score:window.ResonanceScore,createMusical},inputs,{R,schedule});
    view=createFieldView({renderer,sim:proof.sim,palette:inputs.palette,material:inputs.material,width,height});
    if(viewOpts.frame)view.frame(viewOpts.frame);if(viewOpts.debug)view.debug(viewOpts.debug);
    return {N:proof.sim.N,K:proof.sim.K(),tempo:proof.tempo,barMs:proof.barMs,passage:proof.passage,physics:proof.sim.physics,renderer:gl.getParameter(gl.RENDERER),
      gpuTimer:!!gpu.ext,glRenderer:(gl.getExtension('WEBGL_debug_renderer_info')&&gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL))||null};
  },
  // lab: advance to tau as fast as possible and draw (the same states as real time; only the speed differs)
  still(tau,type='image/jpeg'){proof.advanceTo(tau-DT);view.capture();proof.advanceTo(tau);view.sync(1);view.render();return {image:canvas.toDataURL(type,.92),metrics:proof.sim.metrics(),hash:proof.sim.hash(),step:proof.sim.step};},
  // offline film: frame i at fps (the sim advances by its fixed steps; the picture interpolates between the last two)
  frame(i,fps=60){const tau=i/fps;while(proof.sim.step*DT+1e-9<tau){view.capture();proof.advanceTo((proof.sim.step+1)*DT);}
    view.sync(Math.min(1,Math.max(0,(tau-(proof.sim.step-1)*DT)/DT)));view.render();return canvas.toDataURL('image/jpeg',.93);},
  // the passage's audio, rendered offline by the performer on the score's bar grid (film.js does the same)
  async passageAudio(){
    const p=proof.passage;if(!p)return null;
    const timeline=inputs.frames.map(f=>({atMs:Math.max(p.from,f.t),frame:{controls:{energy:f.energy,tension:f.tension},chapter:f.chapter,milestone:f.milestone,end:f.end,projectSeed:inputs.music.seed}})).filter(x=>x.atMs<=p.from+(SCHEDULE.end-SCHEDULE.music+4)*1000).sort((a,b)=>a.atMs-b.atMs);
    const seconds=SCHEDULE.end-SCHEDULE.music+1.5;
    return window.ResonanceMusic.renderOffline({timeline,startMs:p.from,durationSec:seconds,style:inputs.music.style,speed:1,projectId:'genesis-field',scoreVersion:inputs.music.version,profile:inputs.music.profile,projectSeed:inputs.music.seed});
  },
  async passageWav(){
    const buf=await this.passageAudio();if(!buf)return null;const lead=Math.round(SCHEDULE.music*buf.sampleRate);
    const n=lead+buf.length,L=buf.getChannelData(0),Rr=buf.getChannelData(1),view2=new DataView(new ArrayBuffer(44+n*4));
    const w=(o,s)=>{for(let i=0;i<s.length;i++)view2.setUint8(o+i,s.charCodeAt(i));};
    w(0,'RIFF');view2.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');view2.setUint32(16,16,true);view2.setUint16(20,1,true);view2.setUint16(22,2,true);
    view2.setUint32(24,buf.sampleRate,true);view2.setUint32(28,buf.sampleRate*4,true);view2.setUint16(32,4,true);view2.setUint16(34,16,true);w(36,'data');view2.setUint32(40,n*4,true);
    for(let i=0;i<buf.length;i++){view2.setInt16(44+(lead+i)*4,Math.max(-1,Math.min(1,L[i]))*32767,true);view2.setInt16(46+(lead+i)*4,Math.max(-1,Math.min(1,Rr[i]))*32767,true);}
    const bytes=new Uint8Array(view2.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin);
  },
  // real time: the passage plays on the audio context at SCHEDULE.music; the simulation follows that clock. With
  // record, the canvas and the audio are recorded together (MediaRecorder); otherwise only measured.
  async realtime({record=false,fps=60,bitrate=16e6}={}){
    const gl=renderer.getContext(),audio=new AudioContext({latencyHint:'playback'}),buf=await this.passageAudio();
    await audio.resume();
    const dest=audio.createMediaStreamDestination();
    const src=buf?audio.createBufferSource():null;if(src){src.buffer=buf;src.connect(audio.destination);src.connect(dest);}
    let rec=null,chunks=[];
    if(record){const stream=canvas.captureStream(fps);for(const t of dest.stream.getAudioTracks())stream.addTrack(t);
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
      rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};}
    const A0=audio.currentTime+.25;if(src)src.start(A0+SCHEDULE.music);
    if(rec)rec.start(1000);
    const frames=[],cpu=[],steps=[];gpu.samples.length=0;let last=performance.now();
    await new Promise(resolve=>{
      const tick=()=>{
        // the audio clock, read through its output timestamp (the context time paired with the moment it is heard), so it
        // advances smoothly between the audio thread's updates; it stays the only clock
        const now=performance.now(),ts=audio.getOutputTimestamp(),ctxNow=ts.contextTime>0?ts.contextTime+(now-ts.performanceTime)/1000:audio.currentTime;
        const tau=Math.max(0,ctxNow-A0);
        const c0=performance.now(),s0=proof.sim.step;
        // the fixed steps due by then, keeping the state before the last one; the picture interpolates between the two
        while(proof.sim.step*DT+1e-9<tau){view.capture();proof.advanceTo((proof.sim.step+1)*DT);}
        const sim1=performance.now();
        view.sync(Math.min(1,Math.max(0,(tau-(proof.sim.step-1)*DT)/DT)));const q=gpuBegin(gl);view.render();gpuEnd(gl,q);
        const c1=performance.now();
        frames.push(now-last);cpu.push(c1-c0);steps.push({sim:sim1-c0,n:proof.sim.step-s0});last=now;
        if(tau>=SCHEDULE.end)resolve();else requestAnimationFrame(tick);
      };requestAnimationFrame(tick);
    });
    gpuPoll(gl);
    let video=null;
    if(rec){await new Promise(r=>{rec.onstop=r;rec.stop();});const blob=new Blob(chunks,{type:rec.mimeType});recorded=blob;video={mime:rec.mimeType,size:blob.size};}
    await audio.close();
    const ft=frames.slice(1),simMs=steps.filter(s=>s.n>0).map(s=>s.sim/s.n);
    return {hashes:{...proof.hashes},log:proof.log.slice(0,400),frames:ft.length,fps:+(1000*ft.length/ft.reduce((a,b)=>a+b,0)).toFixed(1),
      frameMs:{p50:pct(ft,.5),p95:pct(ft,.95),p99:pct(ft,.99),max:pct(ft,1),over34:+(ft.filter(x=>x>34).length/ft.length*100).toFixed(2)},
      cpuMs:{p50:pct(cpu,.5),p95:pct(cpu,.95),max:pct(cpu,1)},stepMs:{p50:pct(simMs,.5),p95:pct(simMs,.95),max:pct(simMs,1)},
      gpuMs:{n:gpu.samples.length,p50:pct(gpu.samples,.5),p95:pct(gpu.samples,.95),max:pct(gpu.samples,1)},
      heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,video};
  },
  // a recorded video's bytes, base64, in chunks (the driver fetches it piece by piece)
  async chunk(offset,size){const b=recorded;const part=new Uint8Array(await b.slice(offset,offset+size).arrayBuffer());let bin='';for(let i=0;i<part.length;i+=0x8000)bin+=String.fromCharCode(...part.subarray(i,i+0x8000));return {data:btoa(bin),total:b.size};},
  bars(){const p=proof.passage,out=[];for(let b=p.bar;b<p.bar+p.bars;b++){const x=proof.musical.bar(b);out.push(x.steps.map(st=>st.map(n=>[n.group,n.midi,n.velocity])));}return out;},
  hashes(){return {...proof.hashes};},log(){return proof.log;},
  // per-step state hashes over a range of steps (determinism diagnosis)
  trace(from,to){const out=[];for(let s=proof.sim.step+1;s<=to;s++){proof.advanceTo(s*DT);if(s>=from)out.push(proof.sim.hash());}return {log:proof.log,tail:out};}
};

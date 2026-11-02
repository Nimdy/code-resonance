// Genesis visual identity concepts: the page (loaded by run.js on the receiver's own origin, so it uses the shipped score
// and performer). One animatic at a time: a concept module draws frame t (seconds) from the passage's notes, the
// identity's structure and Lawbook, and a scripted timeline. These are concept animatics, not simulations: nothing
// here is a physical model, and the scripted events demonstrate no engineering causality. Every frame carries a label
// saying so. Exposes window.__gc.
import {THREE} from '__ORIGIN__/worlds/core.js';
import {createMusical} from '__ORIGIN__/worlds/musical.js';
import {degreeOfMidi} from '__ORIGIN__/worlds/genesis-laws.js';
let renderer,concept,canvas,overlay,ctx2,inputs,W=1920,H=1080,opts={},labelScene=null,labelCam=null,scoreBuf=null;
const DEG=[0,4,2,5,3,1,6];
window.__gc={
  // inputs (prep.js format), concept (module name), from (performance ms where the passage starts), seconds
  async init({inputs:inp,concept:name,width=1920,height=1080,from,seconds=40,label,params={}}){
    inputs=inp;W=width;H=height;opts={from,seconds,label};
    document.body.innerHTML='';document.body.style.cssText='margin:0;background:#000;overflow:hidden';
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;document.body.appendChild(canvas);
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(1);renderer.setSize(W,H,false);renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1;
    overlay=document.createElement('canvas');overlay.width=W;overlay.height=H;ctx2=overlay.getContext('2d');
    // the score: the identity's own, the bars from `from` on, every onset with its group, pitch and velocity
    const score=window.ResonanceScore,id=score.createIdentity(inp.music.seed),tempo=id.tempo[inp.music.style]||92,barMs=240000/tempo;
    const musical=createMusical({timeline:{version:1,items:inp.frames},score});
    musical.configure({version:inp.music.version,style:inp.music.style,profile:inp.music.profile,seed:inp.music.seed,tempo});
    const key=musical.key(),subs=inp.after.subsystems,K=subs.length,notes=[];
    const regionFor=(d,low)=>{let best=-1;for(let k=0;k<K;k++)if(DEG[k%7]===d&&(best<0||(low?subs[k].files>subs[best].files:subs[k].files<subs[best].files)))best=k;return best>=0?best:d%K;};
    const b0=Math.floor(from/barMs),b1=Math.ceil((from+seconds*1000)/barMs)+1,step=barMs/16;
    for(let b=b0;b<=b1;b++){const x=musical.bar(b);if(!x?.steps)continue;
      for(let s=0;s<16;s++){const at=b*barMs+s*step+(s%2?(x.swing||0)*step:0);if(at<from||at>from+seconds*1000)continue;
        for(const n of x.steps[s]||[]){const d=degreeOfMidi(n.midi,key),low=n.group==='bass'||n.group==='pad';
          notes.push({t:(at-from)/1000,group:n.group,midi:n.midi,v:Math.min(1,Math.round((n.velocity||.5)*1024)/1024),deg:d,k:regionFor(d,low),instrument:n.instrument||null});}}}
    notes.sort((a,b)=>a.t-b.t||a.midi-b.midi);
    if(label){const s=H/1080,lines=label.split('\n'),c=document.createElement('canvas'),g=c.getContext('2d');g.font=`${Math.round(20*s)}px Helvetica, Arial, sans-serif`;
      const wd=Math.ceil(Math.max(...lines.map(l=>g.measureText(l).width))+28*s),ht=Math.ceil(lines.length*28*s+12*s);c.width=wd;c.height=ht;
      g.font=`${Math.round(20*s)}px Helvetica, Arial, sans-serif`;g.textBaseline='top';g.fillStyle='rgba(0,0,0,.45)';g.fillRect(0,0,wd,ht);g.fillStyle='rgba(255,255,255,.88)';lines.forEach((l,i)=>g.fillText(l,14*s,(8+28*i)*s));
      const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(wd,ht),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
      m.position.set(24*s+wd/2,H-22*s-ht/2,0);labelScene=new THREE.Scene();labelScene.add(m);labelCam=new THREE.OrthographicCamera(0,W,H,0,-1,1);}
    const mod=await import(`/__gc/${name}.js`);
    concept=mod.create({THREE,renderer,width:W,height:H,notes,structure:{before:inp.before,after:inp.after,change:inp.change},laws:inp.laws,key,tempo,barMs,seconds,params});
    return {notes:notes.length,groups:notes.reduce((a,n)=>(a[n.group]=(a[n.group]||0)+1,a),{}),tempo,barMs,K};
  },
  // frame at film time t: the concept's picture with the label over it
  frame(t,type='image/jpeg'){draw(t);return canvas.toDataURL(type,.92);},
  // real time on the audio clock: the score plays, every frame draws film time from it; frame intervals, the CPU of a
  // frame and its GPU time (one timer query around the whole frame), draw calls; with record, a webm of the canvas and
  // the score
  async realtime({record=false,seconds=opts.seconds,fps=60,bitrate=16e6}={}){
    const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if(!scoreBuf)scoreBuf=await renderScore(seconds);
    for(const t of [0,seconds*.62,seconds-.5,0])draw(t);gl.finish();
    const audio=new AudioContext({latencyHint:'playback'});await audio.resume();const dest=audio.createMediaStreamDestination();
    const ab=audio.createBuffer(2,scoreBuf.L.length,scoreBuf.rate);ab.copyToChannel(scoreBuf.L,0);ab.copyToChannel(scoreBuf.R,1);
    const src=audio.createBufferSource();src.buffer=ab;src.connect(audio.destination);src.connect(dest);
    let rec=null,chunks=[];
    if(record){const stream=canvas.captureStream(fps);for(const tr of dest.stream.getAudioTracks())stream.addTrack(tr);
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
      rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};}
    const A0=audio.currentTime+.3;src.start(A0);if(rec)rec.start(1000);
    const frames=[],cpu=[],gpuMs=[],calls=[],pend=[];let last=performance.now(),heap=0;
    const poll=()=>{while(pend.length&&gl.getQueryParameter(pend[0][0],gl.QUERY_RESULT_AVAILABLE)){const [q,t]=pend.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpuMs.push([t,gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6]);gl.deleteQuery(q);}};
    await new Promise(resolve=>{const tick=()=>{const now=performance.now(),ts=audio.getOutputTimestamp(),ctxNow=ts.contextTime>0&&ts.performanceTime>0?ts.contextTime+(now-ts.performanceTime)/1000:audio.currentTime;
      const tau=Math.max(0,ctxNow-A0);if(ext)poll();
      const c0=performance.now();let q=null;if(ext&&pend.length<8){q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);}
      draw(Math.min(tau,seconds));if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);pend.push([q,tau]);}
      cpu.push(performance.now()-c0);frames.push([tau,now-last]);calls.push(renderer.info.render.calls);last=now;
      if(performance.memory)heap=Math.max(heap,performance.memory.usedJSHeapSize);
      if(tau>=seconds)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    for(let k=0;k<60&&pend.length;k++){await new Promise(r=>requestAnimationFrame(r));poll();}
    let video=null;if(rec){await new Promise(r=>{rec.onstop=r;rec.stop();});recorded=new Blob(chunks,{type:rec.mimeType});video={mime:rec.mimeType,size:recorded.size};}
    await audio.close();
    const pct=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return +s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2);};
    const ft=frames.slice(1).map(f=>f[1]),g=gpuMs.map(x=>x[1]);const worst=[...gpuMs].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([t,v])=>({t:+t.toFixed(2),ms:+v.toFixed(2)}));
    return {frames:ft.length,fps:+(1000*ft.length/ft.reduce((a,b)=>a+b,0)).toFixed(1),frameMs:{p50:pct(ft,.5),p95:pct(ft,.95),p99:pct(ft,.99),max:pct(ft,1),over16_7:+(ft.filter(x=>x>16.9).length/ft.length*100).toFixed(2),over34:+(ft.filter(x=>x>34).length/ft.length*100).toFixed(2)},
      cpuMs:{p50:pct(cpu,.5),p95:pct(cpu,.95),max:pct(cpu,1)},gpuMs:{n:g.length,p50:pct(g,.5),p95:pct(g,.95),p99:pct(g,.99),max:pct(g,1),worst},
      drawCalls:{p50:pct(calls,.5),max:pct(calls,1)},heapMB:heap?+(heap/1048576).toFixed(1):null,memory:{...renderer.info.memory},video,stats:concept.stats?.()};
  },
  async chunk(offset,size){const part=new Uint8Array(await recorded.slice(offset,offset+size).arrayBuffer());let bin='';for(let i=0;i<part.length;i+=0x8000)bin+=String.fromCharCode(...part.subarray(i,i+0x8000));return {data:btoa(bin),total:recorded.size};},
  // each pass's GPU time and the CPU's preparation through the whole film (after a warm-up), every `step` seconds
  async timeline(step=.25){const out=[];for(const t of [35,2,25])concept.render(t);await concept.readProfile?.();
    for(let t=0;t<=opts.seconds+1e-9;t+=step){await new Promise(r=>requestAnimationFrame(r));concept.render(t);const p=await concept.readProfile?.();out.push({t:+t.toFixed(2),...p});}
    return {rows:out,heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,memory:{...renderer.info.memory}};},
  // profiling (a concept that supports it): each pass's GPU time and the CPU's preparation, at film times
  async profile(times){const out=[];for(const t of times){await new Promise(r=>requestAnimationFrame(r));concept.render(t);const p=await concept.readProfile?.();out.push({t,...p});}
    return {rows:out,heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,memory:{...renderer.info.memory},programs:renderer.info.programs?.length};},
  // the GPU time of drawing frame t (median of n, timer queries; the concept only, without the label)
  async gpu(t,n=40){const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!ext)return null;const out=[];
    for(let i=0;i<n;i++){await new Promise(r=>requestAnimationFrame(r));const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);concept.render(t);gl.endQuery(ext.TIME_ELAPSED_EXT);
      for(let k=0;k<200&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);k++)await new Promise(r=>requestAnimationFrame(r));
      if(!gl.getParameter(ext.GPU_DISJOINT_EXT))out.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
    out.sort((x,y)=>x-y);return {n:out.length,p50:+out[Math.floor(out.length/2)]?.toFixed(2),p95:+out[Math.floor(out.length*.95)]?.toFixed(2)};},
  // the score from the passage's start, rendered offline by the performer (as the films before)
  async scoreWav(seconds){
    if(!scoreBuf)scoreBuf=await renderScore(seconds);const n=scoreBuf.L.length,L=scoreBuf.L,R=scoreBuf.R,v=new DataView(new ArrayBuffer(44+n*4));const buf={sampleRate:scoreBuf.rate};
    const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
    w(0,'RIFF');v.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
    v.setUint32(24,buf.sampleRate,true);v.setUint32(28,buf.sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*4,true);
    for(let i=0;i<n;i++){v.setInt16(44+i*4,Math.max(-1,Math.min(1,L[i]))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,R[i]))*32767,true);}
    const bytes=new Uint8Array(v.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin);
  }
};
let recorded=null;
// a frame: the concept, then the label over it
function draw(t){concept.render(t);if(labelScene){const ac=renderer.autoClear;renderer.autoClear=false;renderer.setRenderTarget(null);renderer.render(labelScene,labelCam);renderer.autoClear=ac;}}
async function renderScore(seconds){
  const perf=opts.from,frames=inputs.frames;
  const timeline=frames.map(f=>({atMs:Math.max(perf,f.t),frame:{controls:{energy:f.energy,tension:f.tension},chapter:f.chapter,milestone:f.milestone,end:f.end,projectSeed:inputs.music.seed}})).filter(x=>x.atMs<=perf+(seconds+4)*1000).sort((a,b)=>a.atMs-b.atMs);
  const buf=await window.ResonanceMusic.renderOffline({timeline,startMs:perf,durationSec:seconds+1.5,style:inputs.music.style,speed:1,projectId:'genesis-concept',scoreVersion:inputs.music.version,profile:inputs.music.profile,projectSeed:inputs.music.seed});
  return {L:buf.getChannelData(0).slice(),R:buf.getChannelData(1).slice(),rate:buf.sampleRate};
}

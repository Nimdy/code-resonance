// Genesis visual identity concepts: the page (loaded by run.js on the receiver's own origin, so it uses the shipped score
// and performer). One animatic at a time: a concept module draws frame t (seconds) from the passage's notes, the
// identity's structure and Lawbook, and a scripted timeline. These are concept animatics, not simulations: nothing
// here is a physical model, and the scripted events demonstrate no engineering causality. Every frame carries a label
// saying so. Exposes window.__gc.
import {THREE} from '__ORIGIN__/worlds/core.js';
import {createMusical} from '__ORIGIN__/worlds/musical.js';
import {degreeOfMidi} from '__ORIGIN__/worlds/genesis-laws.js';
let renderer,concept,canvas,overlay,ctx2,inputs,W=1920,H=1080,opts={};
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
    const mod=await import(`/__gc/${name}.js`);
    concept=mod.create({THREE,renderer,width:W,height:H,notes,structure:{before:inp.before,after:inp.after,change:inp.change},laws:inp.laws,key,tempo,barMs,seconds,params});
    return {notes:notes.length,groups:notes.reduce((a,n)=>(a[n.group]=(a[n.group]||0)+1,a),{}),tempo,barMs,K};
  },
  // frame at film time t: the concept's picture with the label over it
  frame(t,type='image/jpeg'){
    concept.render(t);
    ctx2.clearRect(0,0,W,H);ctx2.drawImage(canvas,0,0);
    if(opts.label){const s=H/1080;ctx2.font=`${Math.round(20*s)}px Helvetica, Arial, sans-serif`;ctx2.textBaseline='top';
      ctx2.fillStyle='rgba(0,0,0,.45)';const lines=opts.label.split('\n'),wd=Math.max(...lines.map(l=>ctx2.measureText(l).width));
      ctx2.fillRect(24*s,22*s,wd+28*s,lines.length*28*s+12*s);ctx2.fillStyle='rgba(255,255,255,.88)';
      lines.forEach((l,i)=>ctx2.fillText(l,38*s,(30+28*i)*s));}
    return overlay.toDataURL(type,.92);
  },
  // the GPU time of drawing frame t (median of n, timer queries; the concept only, without the label)
  async gpu(t,n=40){const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!ext)return null;const out=[];
    for(let i=0;i<n;i++){await new Promise(r=>requestAnimationFrame(r));const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);concept.render(t);gl.endQuery(ext.TIME_ELAPSED_EXT);
      for(let k=0;k<200&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);k++)await new Promise(r=>requestAnimationFrame(r));
      if(!gl.getParameter(ext.GPU_DISJOINT_EXT))out.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
    out.sort((x,y)=>x-y);return {n:out.length,p50:+out[Math.floor(out.length/2)]?.toFixed(2),p95:+out[Math.floor(out.length*.95)]?.toFixed(2)};},
  // the score from the passage's start, rendered offline by the performer (as the films before)
  async scoreWav(seconds){
    const perf=opts.from,frames=inputs.frames;
    const timeline=frames.map(f=>({atMs:Math.max(perf,f.t),frame:{controls:{energy:f.energy,tension:f.tension},chapter:f.chapter,milestone:f.milestone,end:f.end,projectSeed:inputs.music.seed}})).filter(x=>x.atMs<=perf+(seconds+4)*1000).sort((a,b)=>a.atMs-b.atMs);
    const buf=await window.ResonanceMusic.renderOffline({timeline,startMs:perf,durationSec:seconds+1.5,style:inputs.music.style,speed:1,projectId:'genesis-concept',scoreVersion:inputs.music.version,profile:inputs.music.profile,projectSeed:inputs.music.seed});
    const n=buf.length,L=buf.getChannelData(0),R=buf.getChannelData(1),v=new DataView(new ArrayBuffer(44+n*4));
    const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
    w(0,'RIFF');v.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
    v.setUint32(24,buf.sampleRate,true);v.setUint32(28,buf.sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*4,true);
    for(let i=0;i<n;i++){v.setInt16(44+i*4,Math.max(-1,Math.min(1,L[i]))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,R[i]))*32767,true);}
    const bytes=new Uint8Array(v.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin);
  }
};

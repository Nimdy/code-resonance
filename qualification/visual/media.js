'use strict';
// Media analysis of recordings with ffmpeg (ffmpeg-static): streams, frame timing, luminance (to find flash markers),
// audio level over time (continuity) and click markers (2 kHz bursts), so a recording's picture/sound synchronisation
// can be measured from the file itself.
const cp=require('node:child_process');
const ffmpeg=require('ffmpeg-static');
const run=(args,opts={})=>cp.spawnSync(ffmpeg,['-hide_banner','-nostats',...args],{maxBuffer:1<<30,...opts});
// Streams and container facts from ffmpeg's own description of the file.
function streams(file){
  const out=String(run(['-i',file]).stderr);
  // Codec names may carry a profile in parentheses ("aac (LC), 48000 Hz", "h264 (High), …").
  const video=/Stream #\d+:\d+.*?: Video: (\w+)[^\n]*?, (\d+)x(\d+)/.exec(out),audio=/Stream #\d+:\d+.*?: Audio: (\w+)[^,\n]*, (\d+) Hz, ([\w.]+)/.exec(out);
  return {container:/Input #0, ([\w,]+)/.exec(out)?.[1]||null,video:video?{codec:video[1],width:+video[2],height:+video[3]}:null,
    audio:audio?{codec:audio[1],sampleRate:+audio[2],layout:audio[3]}:null};
}
// Every decoded video frame: presentation time, checksum and mean luma (showinfo), on a small scaled copy.
function frames(file){
  const r=run(['-i',file,'-an','-vf','scale=64:36,showinfo','-f','null','-']);const list=[];
  // mean: the planes' means, [Y U V] for video (u and v find the green marker), or [R G B A] for an RGBA image.
  for(const m of String(r.stderr).matchAll(/pts_time:([\d.]+).*?checksum:([0-9A-F]+).*?mean:\[(\d+)(?: (\d+))?(?: (\d+))?(?: \d+)?\]/g))list.push({t:+m[1],sum:m[2],luma:+m[3],u:+(m[4]??128),v:+(m[5]??128)});
  return list;
}
// A still from the recording (JPEG), for the evidence.
function still(file,t,out,width=640){return run(['-y','-ss',String(t),'-i',file,'-frames:v','1','-vf',`scale=${width}:-2`,'-q:v','4',out]).status===0;}
// Mono PCM samples (Float32) at `rate`, optionally filtered.
function pcm(file,rate=16000,filter=null){
  const r=run(['-i',file,'-vn','-ac','1','-ar',String(rate),...(filter?['-af',filter]:[]),'-f','f32le','-']);
  const b=r.stdout;return new Float32Array(b.buffer,b.byteOffset,Math.floor(b.length/4));
}
function analyse(file,{expectAudio=true}={}){
  const s=streams(file),f=frames(file);
  const out={...s,frames:f.length};
  if(f.length>1){
    const iv=f.slice(1).map((x,i)=>x.t-f[i].t).filter(x=>x>0),sorted=[...iv].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))];
    out.videoDuration=+(f.at(-1).t-f[0].t).toFixed(3);out.fps=+((f.length-1)/out.videoDuration).toFixed(2);
    out.frameInterval={median:+(q(.5)*1000).toFixed(1),p95:+(q(.95)*1000).toFixed(1),max:+(sorted.at(-1)*1000).toFixed(1)};
    out.longGaps=iv.filter(x=>x>.25).length;
    // Where the long gaps are (seconds into the video, and their length), the first ten.
    out.gapsAt=f.slice(1).map((x,i)=>({t:+f[i].t.toFixed(2),ms:Math.round((x.t-f[i].t)*1000)})).filter(g=>g.ms>250).slice(0,10);
    // Start-up (the first second, while the recorder and the first frames get going) apart from the rest.
    const after=f.slice(1).map((x,i)=>({t:f[i].t,d:x.t-f[i].t})).filter(x=>x.t>=f[0].t+1);
    out.startupMaxMs=Math.round(Math.max(0,...f.slice(1).map((x,i)=>({t:f[i].t,d:x.t-f[i].t})).filter(x=>x.t<f[0].t+1).map(x=>x.d))*1000);
    out.maxIntervalAfterStartupMs=after.length?Math.round(Math.max(...after.map(x=>x.d))*1000):null;
    // Share of frames whose picture differs from the previous one (a frozen picture repeats its checksum).
    out.changingFrames=+(f.slice(1).filter((x,i)=>x.sum!==f[i].sum).length/(f.length-1)).toFixed(3);
    out.meanLuma=+(f.reduce((a,x)=>a+x.luma,0)/f.length).toFixed(1);
  }
  if(s.audio){
    const rate=16000,x=pcm(file,rate),win=rate/20,rms=[];
    for(let i=0;i+win<=x.length;i+=win){let e=0;for(let k=i;k<i+win;k++)e+=x[k]*x[k];rms.push(Math.sqrt(e/win));}
    out.audioDuration=+(x.length/rate).toFixed(3);
    const db=rms.map(v=>20*Math.log10(v+1e-9));out.audioMeanDb=+(db.reduce((a,b)=>a+b,0)/Math.max(1,db.length)).toFixed(1);
    // Silence: runs of 50 ms windows below -60 dBFS.
    let run=0,longest=0,silent=0;for(const d of db){if(d<-60){run++;silent++;longest=Math.max(longest,run);}else run=0;}
    out.silentShare=+(silent/Math.max(1,db.length)).toFixed(3);out.longestSilenceMs=longest*50;
  }else if(expectAudio)out.audioMissing=true;
  return out;
}
// Continuity of the audio path from the qualification pilot (a steady 12 kHz tone): 10 ms windows of the band around
// it; a window far below the pilot's median level is a gap. The first and last 300 ms are ignored (start and stop).
function continuity(file){
  const rate=48000,x=pcm(file,rate,'highpass=f=11000,lowpass=f=13000'),win=rate/100,rms=[];
  for(let i=0;i+win<=x.length;i+=win){let e=0;for(let k=i;k<i+win;k++)e+=x[k]*x[k];rms.push(Math.sqrt(e/win));}
  const body=rms.slice(30,Math.max(30,rms.length-30)),median=[...body].sort((a,b)=>a-b)[Math.floor(body.length/2)]||0;
  let run=0,longest=0,gaps=0;for(const v of body){if(v<median*.3){run++;if(run===1)gaps++;longest=Math.max(longest,run);}else run=0;}
  return {pilotDb:+(20*Math.log10(median+1e-12)).toFixed(1),gaps,longestGapMs:longest*10,windows:body.length};
}
// Flash markers in the picture (frames far brighter than their neighbours) and click markers in the sound (2 kHz
// bursts after band-pass filtering); each flash is paired with the nearest click within 0.6 s.
function sync(file){
  const f=frames(file),flashes=[];
  for(let i=0;i<f.length;i++)if(f[i].luma>200&&(i===0||f[i-1].luma<=200))flashes.push(f[i].t);
  const rate=48000,x=pcm(file,rate,'highpass=f=1700,lowpass=f=2300'),win=rate/1000,env=[];
  for(let i=0;i+win<=x.length;i+=win){let e=0;for(let k=i;k<i+win;k++)e=Math.max(e,Math.abs(x[k]));env.push(e);}
  const sorted=[...env].sort((a,b)=>a-b),floor=sorted[Math.floor(sorted.length*.5)]||0,peak=sorted.at(-1)||0,threshold=floor+(peak-floor)*.35;
  const clicks=[];for(let i=1;i<env.length;i++)if(env[i]>threshold&&env[i-1]<=threshold&&(!clicks.length||i/1000-clicks.at(-1)>.3))clicks.push(i/1000);
  const pairs=flashes.map(v=>{const c=clicks.reduce((b,a)=>Math.abs(a-v)<Math.abs(b-v)?a:b,Infinity);return Math.abs(c-v)<.6?{video:+v.toFixed(3),audio:+c.toFixed(3),offsetMs:Math.round((c-v)*1000)}:{video:+v.toFixed(3),audio:null,offsetMs:null};});
  const offsets=pairs.map(p=>p.offsetMs).filter(x=>x!==null);
  return {flashes:flashes.length,clicks:clicks.length,pairs,meanOffsetMs:offsets.length?Math.round(offsets.reduce((a,b)=>a+b,0)/offsets.length):null,
    maxAbsOffsetMs:offsets.length?Math.max(...offsets.map(Math.abs)):null,spreadMs:offsets.length?Math.max(...offsets)-Math.min(...offsets):null};
}
// ---- Marker synchronisation, second method (qualification markers v2) -----------------------------------------
// Picture: a full-frame pure green flash (Y≈145, U≈54, V≈34 in BT.601), found by its colour, so a world's own white
// flashes cannot be mistaken for it. Sound: a 40 ms linear chirp from 3 to 6 kHz (Hann window), found by normalised
// cross-correlation with the same chirp (a matched filter), so musical notes are not mistaken for it, with
// sample-accurate timing. Each marker's offset is an interval: the flash happened after the previous frame and by the
// frame that shows it.
const CHIRP={f0:3000,f1:6000,ms:40};
function chirp(rate=48000){const n=Math.round(rate*CHIRP.ms/1000),out=new Float64Array(n),k=(CHIRP.f1-CHIRP.f0)/(CHIRP.ms/1000);
  for(let i=0;i<n;i++){const t=i/rate;out[i]=Math.sin(2*Math.PI*(CHIRP.f0*t+k*t*t/2))*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));}return out;}
// In-place iterative radix-2 FFT (inverse with inv=true, unscaled).
function fft(re,im,inv=false){
  const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j|=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
  for(let len=2;len<=n;len<<=1){const a=(inv?2:-2)*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);
    for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const ur=re[i+j],ui=im[i+j],k=i+j+len/2,vr=re[k]*cr-im[k]*ci,vi=re[k]*ci+im[k]*cr;
      re[i+j]=ur+vr;im[i+j]=ui+vi;re[k]=ur-vr;im[k]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}
}
// Normalised cross-correlation of x with template h (overlap-save), as a coefficient in [-1, 1] per lag.
function correlate(x,h){
  const N=1<<16,M=h.length,step=N-M+1,out=new Float32Array(Math.max(0,x.length-M+1));
  const hr=new Float64Array(N),hi=new Float64Array(N);for(let i=0;i<M;i++)hr[i]=h[i];fft(hr,hi);
  const he=Math.sqrt(h.reduce((a,v)=>a+v*v,0)),cum=new Float64Array(x.length+1);for(let i=0;i<x.length;i++)cum[i+1]=cum[i]+x[i]*x[i];
  for(let pos=0;pos<out.length;pos+=step){
    const re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<N&&pos+i<x.length;i++)re[i]=x[pos+i];fft(re,im);
    for(let i=0;i<N;i++){const a=re[i],b=im[i],c=hr[i],d=-hi[i];re[i]=a*c-b*d;im[i]=a*d+b*c;}fft(re,im,true);
    for(let k=0;k<step&&pos+k<out.length;k++){const e=Math.sqrt(cum[pos+k+M]-cum[pos+k]);out[pos+k]=e>1e-9?re[k]/N/(e*he):0;}
  }
  return out;
}
function markers(file,{threshold=.6}={}){
  const f=frames(file),green=x=>x.luma>100&&x.luma<190&&x.u<100&&x.v<90;
  const flashes=[];for(let i=1;i<f.length;i++)if(green(f[i])&&!green(f[i-1]))flashes.push({t:f[i].t,prev:f[i-1].t,frame:i});
  const rate=48000,x=pcm(file,rate),c=correlate(x,chirp(rate)),chirps=[];
  for(let i=1;i<c.length-1;i++)if(c[i]>threshold&&c[i]>=c[i-1]&&c[i]>=c[i+1]&&(!chirps.length||i/rate-chirps.at(-1).t>.3))chirps.push({t:i/rate,r:+c[i].toFixed(3)});
  // The flash occurred after the previous captured frame and by the flash frame: a chirp is paired by its distance to
  // that interval (at a few frames a second the flash frame can come long after the chirp).
  const gap=(a,fl)=>a.t<fl.prev?fl.prev-a.t:a.t>fl.t?a.t-fl.t:0;
  const pairs=flashes.map(fl=>{const ch=chirps.reduce((b,a)=>!b||gap(a,fl)<gap(b,fl)?a:b,null);
    if(!ch||gap(ch,fl)>.6)return {flash:+fl.t.toFixed(4),prevFrame:+fl.prev.toFixed(4),chirp:null};
    // offset = sound − picture; the flash occurred in (prev, t]: offset lies in [ch−t, ch−prev].
    return {flash:+fl.t.toFixed(4),prevFrame:+fl.prev.toFixed(4),chirp:+ch.t.toFixed(4),r:ch.r,offsetMs:Math.round((ch.t-fl.t)*1000),offsetRangeMs:[Math.round((ch.t-fl.t)*1000),Math.round((ch.t-fl.prev)*1000)]};});
  const offsets=pairs.filter(p=>p.chirp!==null).map(p=>p.offsetMs);
  return {method:'v2: green flash + 3-6 kHz chirp, matched filter',flashes:flashes.length,chirps:chirps.length,pairs,
    meanOffsetMs:offsets.length?Math.round(offsets.reduce((a,b)=>a+b,0)/offsets.length):null,maxAbsOffsetMs:offsets.length?Math.max(...offsets.map(Math.abs)):null,
    spreadMs:offsets.length?Math.max(...offsets)-Math.min(...offsets):null,unpaired:pairs.filter(p=>p.chirp===null).length,extraChirps:Math.max(0,chirps.length-flashes.length)};
}
module.exports={streams,frames,still,pcm,analyse,continuity,sync,markers,chirp,correlate};

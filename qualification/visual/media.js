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
  const video=/Stream #\d+:\d+.*?: Video: (\w+)[^\n]*?, (\d+)x(\d+)/.exec(out),audio=/Stream #\d+:\d+.*?: Audio: (\w+), (\d+) Hz, (\w+)/.exec(out);
  return {container:/Input #0, ([\w,]+)/.exec(out)?.[1]||null,video:video?{codec:video[1],width:+video[2],height:+video[3]}:null,
    audio:audio?{codec:audio[1],sampleRate:+audio[2],layout:audio[3]}:null};
}
// Every decoded video frame: presentation time, checksum and mean luma (showinfo), on a small scaled copy.
function frames(file){
  const r=run(['-i',file,'-an','-vf','scale=64:36,showinfo','-f','null','-']);const list=[];
  for(const m of String(r.stderr).matchAll(/pts_time:([\d.]+).*?checksum:([0-9A-F]+).*?mean:\[(\d+)/g))list.push({t:+m[1],sum:m[2],luma:+m[3]});
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
module.exports={streams,frames,still,pcm,analyse,continuity,sync};

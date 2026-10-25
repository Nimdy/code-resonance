'use strict';
// Recording memory, isolated from Code Resonance: a blank page with a 2D canvas animated every frame, recorded again and
// again with MediaRecorder (VP9 + Opus from a Web Audio oscillator), in variants that differ in one thing each. After
// every recording a full garbage collection, then the renderer and GPU processes' resident memory (/proc). It tells
// browser behaviour apart from the player's code, and which way of recording releases memory.
//
// node visual/memory-recorder.qual.js [--recordings 20] [--seconds 5] [--gpu amd] [--size 1280x720] [--out results/memory]
//   fresh-stream    a new canvas.captureStream() per recording on the same canvas (what the player did)
//   fresh-canvas    a new canvas (and its captureStream) per recording, the old one dropped
//   reused-track    one captureStream for the page; each recording records a clone of its track
//   no-recorder     captureStream per cycle, no MediaRecorder (is it the capture or the encoder?)
//   download-60s    as the player finished recordings: chunks kept, one Blob, an object URL, a download, revoked after 60 s
//   download-1s     the same, the URL revoked after 1 s
const path=require('node:path');
const fs=require('node:fs');
const {launch,processMemory}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const N=+arg('recordings',20),SECONDS=+arg('seconds',5),GPU=arg('gpu',null),[W,H]=arg('size','1280x720').split('x').map(Number);
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','memory')));
const VARIANTS=arg('variants','fresh-stream,fresh-canvas,reused-track,no-recorder,download-60s,download-1s').split(',');
const PAGE=`(()=>{
  const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();
  let canvas=null,g=null,frame=0,shared=null;
  const make=()=>{canvas=document.createElement('canvas');canvas.width=${W};canvas.height=${H};g=canvas.getContext('2d',{alpha:false});document.body.append(canvas);};
  make();
  const draw=()=>{frame++;g.fillStyle='hsl('+(frame%360)+',70%,40%)';g.fillRect(0,0,canvas.width,canvas.height);g.fillStyle='#fff';g.font='48px sans-serif';g.fillText('frame '+frame,40,80);requestAnimationFrame(draw);};
  requestAnimationFrame(draw);
  window.__record=async(variant,ms)=>{
    if(variant==='fresh-canvas'){canvas.remove();make();}
    let video;
    if(variant==='reused-track'){shared??=canvas.captureStream(30);video=new MediaStream([shared.getVideoTracks()[0].clone()]);}
    else video=canvas.captureStream(30);
    if(variant==='no-recorder'){await new Promise(r=>setTimeout(r,ms));for(const t of video.getTracks())t.stop();return 0;}
    const audio=dest.stream.getAudioTracks()[0].clone(),stream=new MediaStream([...video.getVideoTracks(),audio]);
    const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:5000000});let bytes=0;const chunks=[];
    rec.ondataavailable=e=>{bytes+=e.data.size;if(variant.startsWith('download'))chunks.push(e.data);};
    await new Promise(r=>{rec.onstop=r;rec.start(1000);setTimeout(()=>rec.stop(),ms);});
    for(const t of stream.getTracks())t.stop();for(const t of video.getTracks())t.stop();
    // As the player finishes a recording: one Blob of the chunks, an object URL, a download, the URL revoked later.
    if(variant.startsWith('download')){const blob=new Blob(chunks,{type:'video/webm'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='r.webm';document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),variant==='download-60s'?60000:1000);}
    return bytes;
  };
})();`;
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const results={};
  for(const variant of VARIANTS){
    const browser=await launch(GPU);
    try{
      const page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true});await page.goto('about:blank');await page.evaluate(PAGE);
      const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.enable');
      page.on('download',d=>d.path().then(()=>d.delete()).catch(()=>{}));
      const mem=async()=>{await cdp.send('HeapProfiler.collectGarbage');await new Promise(r=>setTimeout(r,1500));const m=processMemory();return {renderer:m.renderer,gpu:m.gpu,browser:m.browser};};
      const series=[{n:0,...await mem()}];
      for(let i=1;i<=N;i++){const bytes=await page.evaluate(([v,ms])=>window.__record(v,ms),[variant,SECONDS*1000]);series.push({n:i,bytes,...await mem()});}
      const per=(k)=>+((series.at(-1)[k]-series[Math.min(2,series.length-1)][k])/Math.max(1,series.length-1-Math.min(2,series.length-1))).toFixed(2);
      results[variant]={recordings:N,seconds:SECONDS,size:`${W}x${H}`,rendererMB:{start:series[0].renderer,after2:series[2]?.renderer,end:series.at(-1).renderer,perRecordingAfter2:per('renderer')},
        gpuMB:{start:series[0].gpu,after2:series[2]?.gpu,end:series.at(-1).gpu,perRecordingAfter2:per('gpu')},series};
      results[variant].browserMB={start:series[0].browser,end:series.at(-1).browser,perRecordingAfter2:per('browser')};
      const r=results[variant];console.log(`${variant.padEnd(13)} browser ${r.browserMB.start} → ${r.browserMB.end} MB (${r.browserMB.perRecordingAfter2}/recording); renderer ${r.rendererMB.start} → ${r.rendererMB.after2} → ${r.rendererMB.end} MB (${r.rendererMB.perRecordingAfter2} MB per recording after the second); GPU ${r.gpuMB.start} → ${r.gpuMB.after2} → ${r.gpuMB.end} MB (${r.gpuMB.perRecordingAfter2} per recording)`);
    }finally{await browser.close();}
  }
  const file=path.join(OUT,`memory-recorder${GPU?`-${GPU}`:''}.json`);fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),gpu:GPU||'swiftshader',variants:results},null,1));
  console.log(`results: ${path.relative(process.cwd(),file)}`);
})().catch(e=>{console.error(e);process.exitCode=1;});

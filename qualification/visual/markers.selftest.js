'use strict';
// Self-test of the synchronisation markers (media.markers) on a synthetic WebM whose offsets are known: green flashes
// at chosen frames and chirps at chosen sound − picture offsets, with distractors a world and its music produce (white
// full-frame flashes, a bright cyan flash, pure tones at 2, 3, 4.5 and 6 kHz, noise). Each true offset must fall inside
// the interval the method reports, and no distractor may be counted as a marker. Encoded like a recording (VP9 + Opus).
// The same file with the first method's markers (a white flash and a 2 kHz click) shows what that method counts.
//
// node visual/markers.selftest.js [--out results/sync]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const ffmpeg=require('ffmpeg-static');
const media=require('./media');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','sync')));
const FPS=30,RATE=48000,SECONDS=14;
// Flash frames and the chirp's offset from the flash frame's time (ms): early, late, and within a frame.
const MARKERS=[{frame:45,offsetMs:0},{frame:120,offsetMs:-60},{frame:195,offsetMs:40},{frame:270,offsetMs:100},{frame:345,offsetMs:-20}];
const WHITE=[90,240],CYAN=[300];
const TONES=[{t:2.2,f:2000},{t:4.4,f:3000},{t:7.7,f:4500},{t:9.1,f:6000},{t:11.3,f:3500}];
// One synthetic recording: v2 markers (green flash, chirp) or the first method's (white flash, 2 kHz click).
function make(tmp,v1){
  // Sound: low noise, the distractor tones (120 ms, enveloped) and the chirps, as 16-bit PCM.
  const n=RATE*SECONDS,x=new Float32Array(n);let seed=7;const rnd=()=>((seed=(seed*1103515245+12345)>>>0)/4294967296-.5);
  for(let i=0;i<n;i++)x[i]=rnd()*.02;
  for(const t of TONES){const s=Math.round(t.t*RATE),len=Math.round(.12*RATE);for(let i=0;i<len;i++)x[s+i]+=.5*Math.sin(2*Math.PI*t.f*i/RATE)*Math.sin(Math.PI*i/len);}
  const c=v1?Float64Array.from({length:Math.round(.04*RATE)},(_,i)=>Math.sin(2*Math.PI*2000*i/RATE)*Math.exp(-i/RATE/.0087)):media.chirp(RATE);
  for(const m of MARKERS){const s=Math.round((m.frame/FPS+m.offsetMs/1000)*RATE);for(let i=0;i<c.length;i++)x[s+i]+=.8*c[i];}
  const pcmFile=path.join(tmp,`a${v1?1:2}.raw`),buf=Buffer.alloc(n*2);for(let i=0;i<n;i++)buf.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(x[i]*32767))),i*2);fs.writeFileSync(pcmFile,buf);
  // Picture: a dark moving gradient; the flashes are whole frames (as the player draws them), three frames long.
  const box=(frames,color)=>frames.map(f=>`drawbox=x=0:y=0:w=iw:h=ih:color=${color}:t=fill:enable='between(n,${f},${f+2})'`);
  const vf=['format=yuv420p',...box(MARKERS.map(m=>m.frame),v1?'white':'0x00FF00'),...box(WHITE,'white'),...box(CYAN,'0x40E0FF')].join(',');
  const file=path.join(tmp,`synthetic-v${v1?1:2}.webm`);
  const r=cp.spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`gradients=s=640x360:r=${FPS}:d=${SECONDS}:c0=0x101830:c1=0x302010`,
    '-f','s16le','-ar',String(RATE),'-ac','1','-i',pcmFile,'-vf',vf,'-c:v','libvpx-vp9','-b:v','2M','-deadline','realtime','-c:a','libopus','-b:a','160k','-shortest',file]);
  if(r.status!==0)throw new Error(String(r.stderr));
  return file;
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cr-markers-'));
  const file=make(tmp,false),s=media.markers(file),old=media.sync(make(tmp,true));
  const rows=MARKERS.map((m,i)=>{const p=s.pairs[i];return {flashFrame:m.frame,trueOffsetMs:m.offsetMs,reported:p?{offsetMs:p.offsetMs,rangeMs:p.offsetRangeMs,r:p.r}:null,
    inside:!!p&&m.offsetMs>=p.offsetRangeMs[0]-1&&m.offsetMs<=p.offsetRangeMs[1]+1};});
  const result={at:new Date().toISOString(),fps:FPS,markers:rows,flashesFound:s.flashes,chirpsFound:s.chirps,distractors:{white:WHITE.length,cyan:CYAN.length,tones:TONES.length},
    firstMethod:{flashesFound:old.flashes,clicksFound:old.clicks,markers:MARKERS.length,pairs:old.pairs},
    pass:s.flashes===MARKERS.length&&s.chirps===MARKERS.length&&rows.every(r=>r.inside)};
  for(const r of rows)console.log(`flash frame ${r.flashFrame}: true ${r.trueOffsetMs} ms, reported ${r.reported?`${r.reported.offsetMs} ms [${r.reported.rangeMs.join(', ')}] r=${r.reported.r}`:'none'} ${r.inside?'inside':'OUTSIDE'}`);
  console.log(`first method on the same scene with its own markers: ${old.flashes} flashes and ${old.clicks} clicks for ${MARKERS.length} markers; offsets ${old.pairs.map(p=>p.offsetMs).join(', ')} ms`);
  console.log(`${s.flashes} flashes and ${s.chirps} chirps found for ${MARKERS.length} markers (distractors: ${WHITE.length} white flashes, ${CYAN.length} cyan, ${TONES.length} tones): ${result.pass?'PASS':'FAIL'}`);
  fs.writeFileSync(path.join(OUT,'markers-selftest.json'),JSON.stringify(result,null,1));fs.rmSync(tmp,{recursive:true,force:true});
  if(!result.pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});

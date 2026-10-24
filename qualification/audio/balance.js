'use strict';
// Spectral and stereo balance of the score, before and after a synthesis change, on a real recorded performance.
// Renders the same timeline through two versions of public/music.js (the baseline from git, the working copy) with
// the real Web Audio engine (OfflineAudioContext in Chromium), then measures both with ffmpeg: integrated loudness,
// loudness range, true peak, energy below 120 Hz and above 200 Hz / 2 kHz, and stereo phase correlation.
// node audio/balance.js --data <receiver-data> --project <id> [--base <git-rev>] [--seconds 240] [--style ambient]
const path=require('node:path');
const fs=require('node:fs');
const cp=require('node:child_process');
const {chromium}=require('playwright-core');
const ffmpeg=require('ffmpeg-static');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const OUT=path.join(__dirname,'..','results','audio');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const QUIET=new Set(['editor.change.observed','editor.newline.inserted','document.baseline.indexed','validation.diagnostics','execution.command.started','agent.tool.started']);
function measure(wav){
  const run=filters=>{const r=cp.spawnSync(ffmpeg,['-hide_banner','-nostats','-i',wav,'-af',filters,'-f','null','-'],{encoding:'utf8',maxBuffer:256*1024*1024});return r.stderr+r.stdout;};
  const num=(text,re)=>{const m=re.exec(text);return m?Number(m[1]):null;};
  const r128=run('ebur128=peak=true').split('Summary:').pop();
  const rms=f=>num(run(`${f}astats=metadata=0:measure_perchannel=none`),/RMS level dB: (-?[\d.]+|-inf)/);
  const phase=run('aphasemeter=video=0,ametadata=print:key=lavfi.aphasemeter.phase:file=-');
  const values=[...phase.matchAll(/phase=(-?[\d.]+)/g)].map(m=>Number(m[1]));
  const full=rms('');
  return {integratedLufs:num(r128,/I:\s+(-?[\d.]+) LUFS/),loudnessRangeLu:num(r128,/LRA:\s+(-?[\d.]+) LU/),truePeakDbfs:num(r128,/Peak:\s+(-?[\d.]+) dBFS/),
    rmsDb:full,below120HzDb:rms('lowpass=f=120:p=2,'),above200HzDb:rms('highpass=f=200:p=2,'),above2kHzDb:rms('highpass=f=2000:p=2,'),
    stereoPhaseCorrelation:values.length?+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(3):null};
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const svc=await createService({port:0,dataDir:path.resolve(arg('data'))}).start();await svc.flush();
  const project=arg('project'),seconds=Number(arg('seconds',240)),style=arg('style','ambient'),base=arg('base','HEAD');
  const entries=[];let after=-1;
  for(;;){const p=await (await fetch(`http://127.0.0.1:${svc.port}/api/timeline?id=${project}&after=${after}&limit=1000`)).json();entries.push(...p.entries);if(!p.entries.length||entries.length>=p.total)break;after=p.entries.at(-1).seq;}
  await svc.stop();
  const from=entries[0].start,timeline=[];
  for(const e of entries){timeline.push({atMs:e.start,frame:e.frame});for(const c of e.cues)if(!QUIET.has(c.type))timeline.push({atMs:Math.min(Math.max(c.ts,e.start),e.end-1),cue:c});}
  const versions={baseline:cp.execFileSync('git',['show',`${base}:public/music.js`],{cwd:REPO,encoding:'utf8'}),current:fs.readFileSync(path.join(REPO,'public/music.js'),'utf8')};
  const browser=await chromium.launch();const report={at:new Date().toISOString(),project:project.slice(0,12),seconds,style,base,results:{}};
  try{
    for(const [name,source] of Object.entries(versions)){
      const page=await browser.newPage();await page.goto('about:blank');
      await page.addScriptTag({path:path.join(REPO,'public/score.js')});await page.addScriptTag({content:source});
      const wav=await page.evaluate(async({timeline,from,seconds,style})=>{
        const buf=await window.ResonanceMusic.renderOffline({timeline,startMs:from,durationSec:seconds,style,sampleRate:48000,projectId:'balance'});
        const L=buf.getChannelData(0),R=buf.getChannelData(1),n=buf.length,view=new DataView(new ArrayBuffer(44+n*4));
        const w=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
        w(0,'RIFF');view.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
        view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);w(36,'data');view.setUint32(40,n*4,true);
        for(let i=0;i<n;i++){view.setInt16(44+i*4,Math.max(-1,Math.min(1,L[i]))*32767,true);view.setInt16(46+i*4,Math.max(-1,Math.min(1,R[i]))*32767,true);}
        const bytes=new Uint8Array(view.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin);
      },{timeline,from,seconds,style});
      const file=path.join(OUT,`balance-${name}.wav`);fs.writeFileSync(file,Buffer.from(wav,'base64'));await page.close();
      report.results[name]=measure(file);console.log(name.padEnd(9),JSON.stringify(report.results[name]));
    }
  }finally{await browser.close();}
  const b=report.results.baseline,c=report.results.current;
  report.delta={lufs:+(c.integratedLufs-b.integratedLufs).toFixed(1),lowShareDb:+((c.below120HzDb-c.rmsDb)-(b.below120HzDb-b.rmsDb)).toFixed(1),
    above200ShareDb:+((c.above200HzDb-c.rmsDb)-(b.above200HzDb-b.rmsDb)).toFixed(1),above2kShareDb:+((c.above2kHzDb-c.rmsDb)-(b.above2kHzDb-b.rmsDb)).toFixed(1),
    correlation:+(c.stereoPhaseCorrelation-b.stereoPhaseCorrelation).toFixed(3)};
  fs.writeFileSync(path.join(OUT,'balance.json'),JSON.stringify(report,null,2));
  console.log('delta',JSON.stringify(report.delta));
})().catch(e=>{console.error(e);process.exitCode=1;});

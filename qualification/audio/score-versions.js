'use strict';
// The score's versions side by side on a real recorded performance: the same timeline through score v2 (the frozen
// default of existing identities) and score v3 (the composed score), each style, with the real Web Audio engine
// (OfflineAudioContext in Chromium), measured with ffmpeg (balance.js measure): integrated loudness, loudness range,
// true peak, energy below 120 Hz and above 200 Hz / 2 kHz, stereo correlation. The WAVs are kept for listening.
// node audio/score-versions.js --data <receiver-data> --project <id> [--seconds 180] [--styles ambient,pulse] [--profile '{"evolution":.7}']
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const {measure}=require('./balance');
const OUT=path.join(__dirname,'..','results','audio','score-versions');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const QUIET=new Set(['editor.change.observed','editor.newline.inserted','document.baseline.indexed','validation.diagnostics','execution.command.started','agent.tool.started']);
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const svc=await createService({port:0,dataDir:path.resolve(arg('data'))}).start();await svc.flush();
  const project=arg('project'),seconds=Number(arg('seconds',180)),styles=arg('styles','ambient,pulse,cinematic,chip').split(','),versions=arg('versions','2,3').split(',').map(Number);
  const profile=arg('profile')?JSON.parse(arg('profile')):null;
  const entries=[];let after=-1;
  for(;;){const p=await (await fetch(`http://127.0.0.1:${svc.port}/api/timeline?id=${project}&after=${after}&limit=1000`)).json();entries.push(...p.entries);if(!p.entries.length||entries.length>=p.total)break;after=p.entries.at(-1).seq;}
  await svc.stop();
  const from=entries[0].start,timeline=[],seed=entries.find(e=>e.frame?.projectSeed)?.frame.projectSeed;
  for(const e of entries){timeline.push({atMs:e.start,frame:e.frame});for(const c of e.cues)if(!QUIET.has(c.type))timeline.push({atMs:Math.min(Math.max(c.ts,e.start),e.end-1),cue:c});}
  const browser=await chromium.launch();const report={at:new Date().toISOString(),project:project.slice(0,12),seconds,profile,results:{}};
  try{
    for(const style of styles)for(const scoreVersion of versions){
      const page=await browser.newPage();await page.goto('about:blank');
      await page.addScriptTag({path:path.join(REPO,'public/score.js')});await page.addScriptTag({path:path.join(REPO,'public/music.js')});
      const out=await page.evaluate(async({timeline,from,seconds,style,scoreVersion,profile,seed})=>{
        const sections=[];
        const buf=await window.ResonanceMusic.renderOffline({timeline,startMs:from,durationSec:seconds,style,sampleRate:48000,projectId:'score-versions',scoreVersion,profile,projectSeed:seed,
          onBar:b=>{if(!sections.length||sections.at(-1).section!==b.section)sections.push({t:+b.time.toFixed(1),section:b.section,form:b.form?.name});}});
        const L=buf.getChannelData(0),R=buf.getChannelData(1),n=buf.length,view=new DataView(new ArrayBuffer(44+n*4));
        const w=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
        w(0,'RIFF');view.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
        view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);w(36,'data');view.setUint32(40,n*4,true);
        for(let i=0;i<n;i++){view.setInt16(44+i*4,Math.max(-1,Math.min(1,L[i]))*32767,true);view.setInt16(46+i*4,Math.max(-1,Math.min(1,R[i]))*32767,true);}
        const bytes=new Uint8Array(view.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return {wav:btoa(bin),sections};
      },{timeline,from,seconds,style,scoreVersion,profile,seed});
      const file=path.join(OUT,`${style}-v${scoreVersion}.wav`);fs.writeFileSync(file,Buffer.from(out.wav,'base64'));await page.close();
      const m=measure(file);m.lowShareDb=+(m.below120HzDb-m.rmsDb).toFixed(1);m.above2kShareDb=+(m.above2kHzDb-m.rmsDb).toFixed(1);
      report.results[`${style}-v${scoreVersion}`]={...m,sections:out.sections.length,sectionList:out.sections.map(s=>`${s.t}s ${s.section}`).join(', ')};
      console.log(`${style}-v${scoreVersion}`.padEnd(14),JSON.stringify({lufs:m.integratedLufs,lra:m.loudnessRangeLu,peak:m.truePeakDbfs,low:m.lowShareDb,air:m.above2kShareDb,corr:m.stereoPhaseCorrelation,sections:out.sections.length}));
    }
  }finally{await browser.close();}
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

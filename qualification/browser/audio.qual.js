'use strict';
// Renders a scripted performance through the real Web Audio engine (OfflineAudioContext in Chromium) and measures
// the output: peak/clipping, loudness, loudness range over time and silence. Writes WAV files for listening.
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const OUT=path.join(__dirname,'..','results','audio');
const DURATION=Number(process.env.CR_AUDIO_SECONDS||180);
function script(duration){
  // Ten-second frames: chapter rises 1 -> 5, activity breathes, a failing test creates tension that a fix resolves.
  const timeline=[],start=1_700_000_000_000;
  for(let s=0;s<duration;s+=10){
    const chapter=1+Math.min(4,Math.floor(s/(duration/5))),energy=.25+.35*Math.abs(Math.sin(s/47)),tension=s>=60&&s<95?.62:s>=95&&s<110?.2:.05;
    timeline.push({atMs:start+s*1000,frame:{projectSeed:424242,chapter,controls:{energy,tension}}});
  }
  const cue=(s,type,detail={},weight=0)=>timeline.push({atMs:start+s*1000,cue:{id:`${type}-${s}`,type,weight,detail}});
  for(let s=5;s<duration;s+=7)cue(s,'symbol.created',{symbolType:['function','ui.component','class','api.route'][s%4]},.9);
  for(let s=12;s<duration;s+=23)cue(s,'dependency.added',{},.35);
  cue(60,'validation.test.failed');cue(95,'validation.test.passed',{},3);cue(150,'repository.commit.observed',{},1.2);
  for(let s=100;s<140;s+=4)cue(s,'agent.file.modified',{voice:s%8===0?0:1},.3);
  return {timeline,start};
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launch();const report={at:new Date().toISOString(),seconds:DURATION,styles:{}};
  try{
    const page=await browser.newPage();
    await page.goto('about:blank');
    await page.addScriptTag({path:path.join(REPO,'public/score.js')});
    await page.addScriptTag({path:path.join(REPO,'public/music.js')});
    const {timeline,start}=script(DURATION);
    for(const style of ['ambient','pulse','cinematic','chip']){
      const t0=Date.now();
      const result=await page.evaluate(async({timeline,start,duration,style})=>{
        const buf=await window.ResonanceMusic.renderOffline({timeline,startMs:start,durationSec:duration,style,sampleRate:44100,projectId:'audio-qualification'});
        const L=buf.getChannelData(0),R=buf.getChannelData(1),rate=buf.sampleRate;
        let peak=0,clips=0,sum=0;for(let i=0;i<L.length;i++){const a=Math.abs(L[i]),b=Math.abs(R[i]);peak=Math.max(peak,a,b);if(a>.999||b>.999)clips++;sum+=L[i]*L[i]+R[i]*R[i];}
        const db=x=>x>0?20*Math.log10(x):-120;
        const win=rate*3,short=[];
        for(let i=0;i+win<=L.length;i+=win){let s=0;for(let j=i;j<i+win;j++)s+=L[j]*L[j]+R[j]*R[j];short.push(db(Math.sqrt(s/(2*win))));}
        const sorted=short.slice().sort((a,b)=>a-b),pct=p=>sorted[Math.floor(p*(sorted.length-1))];
        // Mean level in the tension episode vs before it, to confirm the score actually responds.
        const seg=(a,b)=>{let s=0,n=0;for(let i=Math.floor(a*rate);i<Math.min(L.length,Math.floor(b*rate));i++){s+=L[i]*L[i];n++;}return db(Math.sqrt(s/n));};
        // 16-bit WAV of the first 60 s for listening.
        const seconds=Math.min(60,duration),frames=seconds*rate,out=new DataView(new ArrayBuffer(44+frames*4));
        const w=(o,s)=>{for(let i=0;i<s.length;i++)out.setUint8(o+i,s.charCodeAt(i));};
        w(0,'RIFF');out.setUint32(4,36+frames*4,true);w(8,'WAVEfmt ');out.setUint32(16,16,true);out.setUint16(20,1,true);out.setUint16(22,2,true);
        out.setUint32(24,rate,true);out.setUint32(28,rate*4,true);out.setUint16(32,4,true);out.setUint16(34,16,true);w(36,'data');out.setUint32(40,frames*4,true);
        for(let i=0;i<frames;i++){out.setInt16(44+i*4,Math.max(-1,Math.min(1,L[i]))*32767,true);out.setInt16(46+i*4,Math.max(-1,Math.min(1,R[i]))*32767,true);}
        const bytes=new Uint8Array(out.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
        return {peak,clips,rmsDb:db(Math.sqrt(sum/(2*L.length))),shortTermDb:{p10:pct(.1),median:pct(.5),p95:pct(.95)},loudnessRangeDb:pct(.95)-pct(.1),
          silentWindows:short.filter(x=>x<-50).length,silentAt:short.map((x,i)=>x<-50?i*3:null).filter(x=>x!==null),windows:short.length,beforeTensionDb:seg(30,60),tensionDb:seg(62,92),wav:btoa(bin)};
      },{timeline,start,duration:DURATION,style});
      fs.writeFileSync(path.join(OUT,`${style}-first-60s.wav`),Buffer.from(result.wav,'base64'));
      delete result.wav;result.renderSeconds=+((Date.now()-t0)/1000).toFixed(1);
      for(const k of ['peak','rmsDb','loudnessRangeDb','beforeTensionDb','tensionDb'])result[k]=+result[k].toFixed(3);
      for(const k of Object.keys(result.shortTermDb))result.shortTermDb[k]=+result.shortTermDb[k].toFixed(1);
      report.styles[style]=result;
      console.log(style.padEnd(9),JSON.stringify(result));
    }
  }finally{await browser.close();}
  // The offline render starts on the first downbeat, so window 0 may hold the lead-in; any later silence is a dropout.
  const checks=Object.entries(report.styles).map(([style,r])=>({style,noClipping:r.clips===0&&r.peak<1,audible:r.rmsDb>-40,noDropouts:r.silentAt.every(t=>t===0),dynamicButStable:r.loudnessRangeDb>1&&r.loudnessRangeDb<20}));
  report.checks=checks;fs.writeFileSync(path.join(OUT,'audio-qualification.json'),JSON.stringify(report,null,2));
  for(const c of checks)console.log(`${Object.entries(c).filter(([k])=>k!=='style').every(([,v])=>v)?'PASS':'FAIL'}  ${c.style}: ${JSON.stringify(c)}`);
  process.exitCode=checks.every(c=>c.noClipping&&c.audible&&c.noDropouts&&c.dynamicButStable)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

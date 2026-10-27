'use strict';
// Renders a recorded 30-minute performance (built by history-session.js) through the real engines and reports how
// it evolves: per-5-minute audio metrics, musical form, listening excerpts and a contact sheet of the Stage.
// Usage: node session/session.qual.js <receiver-data-dir> <projectId> [styles=ambient,pulse]
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const OUT=path.join(__dirname,'..','results','session');
const [dataDir,projectId,stylesArg]=process.argv.slice(2);
const STYLES=stylesArg==='none'?[]:(stylesArg||'ambient,pulse').split(',');
const CHUNK=300,EXCERPTS=[60,600,1200,1740];
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const svc=await createService({port:0,dataDir}).start();
  const url=`http://127.0.0.1:${svc.port}`;
  const entries=[];for(let after=-1;;){const p=await (await fetch(`${url}/api/timeline?id=${projectId}&after=${after}&limit=1000`)).json();entries.push(...p.entries);if(!p.entries.length||entries.length>=p.total)break;after=p.entries.at(-1).seq;}
  const start=entries[0].start,end=entries.at(-1).end,duration=Math.floor((end-start)/1000);
  // The performance as the player schedules it: frames at window start, cues at their time within the window.
  const timeline=[];
  for(const e of entries){timeline.push({atMs:e.start,frame:e.frame});for(const c of e.cues)timeline.push({atMs:Math.min(Math.max(c.ts,e.start),e.end-1),cue:c});}
  const report={at:new Date().toISOString(),projectId,windows:entries.length,durationSec:duration,styles:{},chapters:[]};
  for(let m=0;m<=Math.ceil(duration/60);m+=3)report.chapters.push(entries.filter(x=>x.start<=start+m*60000).at(-1)?.frame.chapter??1);
  const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const page=await browser.newPage();await page.goto('about:blank');
    await page.addScriptTag({path:path.join(REPO,'public/score.js')});await page.addScriptTag({path:path.join(REPO,'public/music.js')});
    for(const style of STYLES){
      const chunks=[];
      for(let s=0;s<duration;s+=CHUNK){
        const len=Math.min(CHUNK,duration-s),from=start+s*1000;
        // Each chunk starts from the frame in force at its start, exactly as a seek would.
        const prior=timeline.filter(x=>x.frame&&x.atMs<=from).at(-1);
        const slice=[...(prior?[{atMs:from,frame:prior.frame}]:[]),...timeline.filter(x=>x.atMs>from&&x.atMs<from+len*1000)];
        const excerpt=EXCERPTS.find(t=>t>=s&&t<s+len);
        const r=await page.evaluate(async({slice,from,len,style,excerptAt})=>{
          const bars=[];
          const buf=await window.ResonanceMusic.renderOffline({timeline:slice,startMs:from,durationSec:len,style,sampleRate:44100,projectId:'session',onBar:b=>bars.push(b)});
          const L=buf.getChannelData(0),R=buf.getChannelData(1),rate=buf.sampleRate;const db=x=>x>0?20*Math.log10(x):-120;
          let peak=0,sum=0;for(let i=0;i<L.length;i++){peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));sum+=L[i]*L[i]+R[i]*R[i];}
          const win=rate*3,short=[];for(let i=0;i+win<=L.length;i+=win){let s=0;for(let j=i;j<i+win;j++)s+=L[j]*L[j];short.push(db(Math.sqrt(s/win)));}
          const sorted=short.slice().sort((a,b)=>a-b);
          const count=k=>bars.reduce((a,b)=>(a[b[k]]=(a[b[k]]||0)+1,a),{});
          let wav=null;
          if(excerptAt!==undefined){
            const off=Math.floor(excerptAt*rate),frames=Math.min(60*rate,L.length-off),dv=new DataView(new ArrayBuffer(44+frames*4));
            const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
            w(0,'RIFF');dv.setUint32(4,36+frames*4,true);w(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,2,true);
            dv.setUint32(24,rate,true);dv.setUint32(28,rate*4,true);dv.setUint16(32,4,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,frames*4,true);
            for(let i=0;i<frames;i++){dv.setInt16(44+i*4,Math.max(-1,Math.min(1,L[off+i]))*32767,true);dv.setInt16(46+i*4,Math.max(-1,Math.min(1,R[off+i]))*32767,true);}
            const bytes=new Uint8Array(dv.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));wav=btoa(bin);
          }
          return {peak,rmsDb:db(Math.sqrt(sum/(2*L.length))),loudnessRangeDb:sorted[Math.floor(.95*(sorted.length-1))]-sorted[Math.floor(.1*(sorted.length-1))],
            silentWindows:short.filter(x=>x<-50).length,bars:bars.length,sections:count('section'),chapters:count('chapter'),
            layerSets:new Set(bars.map(b=>(b.layers||[]).join('+'))).size,chords:new Set(bars.map(b=>b.chord)).size,wav};
        },{slice,from,len,style,excerptAt:excerpt!==undefined?excerpt-s:undefined});
        if(r.wav){fs.writeFileSync(path.join(OUT,`${style}-minute-${String(Math.round(excerpt/60)).padStart(2,'0')}.wav`),Buffer.from(r.wav,'base64'));}
        delete r.wav;for(const k of ['peak','rmsDb','loudnessRangeDb'])r[k]=+r[k].toFixed(2);
        chunks.push({minutes:`${s/60}-${(s+len)/60}`,...r});
        console.log(style,`${s/60}-${(s+len)/60} min`,JSON.stringify(r));
      }
      report.styles[style]=chunks;
    }
    // Visual evolution: seek the replay across the session and compose a contact sheet.
    const stage=await browser.newPage({viewport:{width:1920,height:1080}});
    await stage.goto(`${url}/?project=${projectId}&world=nexus`);
    await stage.waitForFunction(()=>document.getElementById('connection').textContent==='SESSION CONNECTED',null,{timeout:15000});
    await stage.click('#replayBtn');
    await stage.waitForFunction(()=>Number(document.getElementById('eventCount').textContent)>0,null,{timeout:20000});
    const shots=[];
    for(const pos of [40,160,280,400,520,640,760,880,1000]){
      await stage.$eval('#scrub',(e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input'));},pos);
      await stage.waitForTimeout(2200);
      shots.push({pos,image:(await (await stage.$('#stage')).screenshot()).toString('base64'),chapter:await stage.textContent('#chapter')});
    }
    const sheet=await browser.newPage({viewport:{width:1800,height:1050}});
    await sheet.setContent(`<body style="margin:0;background:#05070d;display:grid;grid-template-columns:repeat(3,600px);gap:0">${shots.map(s=>`<div style="position:relative"><img style="width:600px;height:350px;object-fit:cover;display:block" src="data:image/png;base64,${s.image}"><span style="position:absolute;left:10px;top:8px;color:#9fdcf0;font:12px monospace">${Math.round(s.pos/1000*duration/60)} min · chapter ${s.chapter}</span></div>`).join('')}</body>`);
    await sheet.screenshot({path:path.join(OUT,'contact-sheet-nexus.png')});
  }finally{await browser.close();await svc.stop();}
  if(STYLES.length)fs.writeFileSync(path.join(OUT,'session-qualification.json'),JSON.stringify(report,null,2));
  console.log('chapters every 3 minutes:',report.chapters.join(' '));
})().catch(e=>{console.error(e);process.exitCode=1;});

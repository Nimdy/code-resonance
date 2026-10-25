'use strict';
// Soak: the live player, with sound, for hours, while a synthetic session streams events in real time through the
// receiver's real ingestion API. Every hour: the three built-in families, a world pack (Cymatic Field), a shader pack
// (Blueprint Cathedral), a declarative pack (Ember Observatory) and the Construct, a 12-minute pause in the session
// (idle), and three one-minute recordings measured from the files. Once, mid-run, the receiver is stopped for 15 s and
// started again on the same port (events produced meanwhile are retried, as the extension's outbox does).
// Every minute: page heap, DOM nodes, listeners, documents, the player's frame rate, the world's GPU objects and
// timings, the pack transport, the sound level, the CPU of every browser process, the memory of the whole process
// tree, and the events produced, accepted and stored (none may be lost).
//
// node visual/soak.qual.js [--hours 3] [--gpu amd] [--scale 1] [--viewport 1920x1080] [--quality 0-3] [--mechanism]
//                          [--record-size 720p|1080p|stage] [--out results/soak]
// --record-size: the player's recording size for the soak's recordings (default: the player's default, 720p); a
// software-rendered CI machine records the stage (at 720p a shader pack falls under 1 fps there and is stopped).
// --viewport/--quality/--mechanism: for a software-rendered CI machine (a fixed lower rendering level; recordings and
// frame rates held to the mechanism thresholds of visual/recording.qual.js).
// --scale 0.1 runs the programme ten times faster (an hour in 6 minutes; recordings stay one minute): a smoke test.
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {REPO,launch,rendererOf,processMemory,checker,adminPost}=require('./harness');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const packs=require(path.join(REPO,'engine/packs'));
const media=require('./media');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const HOURS=+arg('hours',3),GPU=arg('gpu',null),SCALE=+arg('scale',1),MECH=process.argv.includes('--mechanism'),RECORD_SIZE=arg('record-size',null);
const [VW,VH]=arg('viewport','1920x1080').split('x').map(Number),QUALITY=arg('quality',null);
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','soak')));
const {checks,check}=checker();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// The hour's programme (minutes): what the player shows, when the session pauses, when it records.
const SEGMENTS=[[0,{world:'living',action:{type:'family',family:'stellar-forge'},label:'Stellar Forge'}],[12,{world:'living',action:{type:'family',family:'halcyon.cymatic-field'},label:'Cymatic Field (world pack)',remote:true}],
  [24,{world:'living',action:{type:'pack',pack:'northlight.blueprint-cathedral'},label:'Blueprint Cathedral (shader pack)',remote:true}],[36,{world:'living',action:{type:'family',family:'fractal-biosphere'},label:'Fractal Biosphere'}],
  [48,{world:'construct',label:'Construct'}],[54,{world:'living',action:{type:'pack',pack:'northlight.ember-observatory'},label:'Ember Observatory (declarative)'}]];
const IDLE=[40,52],RECORD_AT=[3,15,27],RESTART_AT=Math.min(90,HOURS*60/2);
const TAP=`(()=>{const orig=AudioNode.prototype.connect;window.__taps=[];
AudioNode.prototype.connect=function(dest,...r){if(dest instanceof AudioDestinationNode){const a=this.context.createAnalyser();a.fftSize=2048;orig.call(this,a);window.__taps.push(a);}return orig.call(this,dest,...r);};
window.__rms=()=>{let s=0,n=0;for(const a of window.__taps){const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);for(const v of b){s+=v*v;n++;}}return n?Math.sqrt(s/n):0;};})();`;
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-soak-')),recDir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-soak-rec-'));
  for(const p of ['cymatic-field','blueprint-cathedral','ember-observatory']){const m=packs.install(path.join(REPO,'packs/examples',p),dir);if(packs.executable(m.kind))packs.setTrust(m.id,dir,{trusted:true});}
  let svc=await createService({port:0,dataDir:dir}).start();const port=svc.port,url=`http://127.0.0.1:${port}`,projectId=sha('soak-session');
  // ---- The session: an endlessly growing project; events wait in an outbox until the receiver accepts them.
  let n=0,file=0,accepted=0,paused=false,receiverDown=false,postFailures=0;const outbox=[],modules=[];
  const ev=(kind,x={})=>({v:1,id:`soak-${String(++n).padStart(8,'0')}`,ts:Date.now(),kind,projectId,sessionId:'soak',origin:'unknown',...x});
  async function deliver(){
    while(outbox.length&&!receiverDown){const batch=outbox.slice(0,50);
      try{const r=await fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events:batch})});
        if(r.status!==202)throw new Error(`HTTP ${r.status}`);outbox.splice(0,batch.length);accepted+=batch.length;}catch{postFailures++;return;}}
  }
  outbox.push(ev('workspace.started',{name:'soak-session'}));await deliver();await svc.flush();
  const produce=setInterval(()=>{
    if(paused)return;const tick=n;
    if(tick%7===0||!modules.length)modules.push({name:`m${file++}`,lines:[]});
    const m=modules[tick%modules.length];
    m.lines.push(m.lines.length%3===0?`export function Part${m.lines.length}(){ return <div>${m.lines.length}</div>; }`:`export function step${m.lines.length}(x: number){ return x + ${m.lines.length}; }`);
    if(modules.length>1&&m.lines.length===1)m.lines.unshift(`import { step0 } from './${modules[(tick+1)%modules.length].name}';`);
    outbox.push(ev('document.edits',{file:`src/${m.name}.tsx`,meta:{edits:25,insertedChars:120,removedChars:4,insertedLines:1,removedLines:0,windowMs:1000}}),
      ev('document.snapshot',{file:`src/${m.name}.tsx`,content:m.lines.join('\n')+'\n',meta:{reason:'edit'}}));
    if(tick%23===0)outbox.push(ev('terminal.command.finished',{meta:{category:'test',exitCode:tick%46===0?1:0}}));
    if(tick%11===0)outbox.push(ev('agent.tool.completed',{file:`src/${m.name}.tsx`,meta:{provider:'soak',agent:`agent-${tick%2}`,tool:'Edit'}}));
    if(tick%97===0)outbox.push(ev('repository.commit.observed',{meta:{files:3}}));
    void deliver();
  },3000);
  const recipe=action=>adminPost(svc,`/api/recipe?id=${projectId}`,{action}).then(r=>r.ok);
  const browser=await launch(GPU);const samples=[],recordings=[],events=[];let restart=null,started=Date.now();
  // Programme time in minutes (real minutes unless --scale).
  const minuteNow=()=>(Date.now()-started)/60000/SCALE;
  try{
    const renderer=await rendererOf(browser);
    if(GPU==='amd'&&!/AMD|Radeon/i.test(renderer))throw new Error(`Requested the AMD GPU but got ${renderer}`);
    const browserCdp=await browser.newBrowserCDPSession();
    const page=await browser.newPage({viewport:{width:VW,height:VH},acceptDownloads:true});const errors=[];
    page.on('pageerror',e=>errors.push({minute:+minuteNow().toFixed(1),error:String(e).slice(0,300)}));
    page.on('console',m=>{if(m.type()==='error')errors.push({minute:+minuteNow().toFixed(1),error:m.text().slice(0,300)});});
    await page.addInitScript(TAP);
    await recipe(SEGMENTS[0][1].action);
    await page.goto(`${url}/?project=${projectId}&world=living&qual=1${QUALITY===null?'':`&quality=${QUALITY}&adapt=0`}`);await page.waitForFunction(()=>!!window.__qual);
    await page.waitForTimeout(5000);await page.evaluate(()=>document.getElementById('soundBtn').click());
    const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
    let segment=-1,cpuBefore=null,lastSample=0,clockBefore=null;started=Date.now();const END=started+HOURS*3600000*SCALE;const done=new Set();
    while(Date.now()<END){
      const minute=minuteNow(),inHour=minute%60,hour=Math.floor(minute/60);
      // Programme.
      const seg=SEGMENTS.reduce((s,[at],i)=>inHour>=at?i:s,0),key=`${hour}:${seg}`;
      if(!done.has(key)){done.add(key);segment=seg;const s=SEGMENTS[seg][1];
        if(s.action)await page.evaluate(a=>window.__qual.action(a),s.action);await page.evaluate(w=>window.__qual.setWorld(w),s.world);
        events.push({minute:+minute.toFixed(1),event:`world: ${s.label}`});}
      const idle=inHour>=IDLE[0]&&inHour<IDLE[1];if(idle!==paused){paused=idle;events.push({minute:+minute.toFixed(1),event:idle?'session paused (idle)':'session resumed'});}
      for(const at of RECORD_AT){const k=`rec:${hour}:${at}`;if(inHour>=at&&!done.has(k)){done.add(k);
        const file=path.join(recDir,`h${hour}-m${at}.webm`),began=Date.now();
        const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}).catch(()=>null),(async()=>{await page.evaluate(async size=>{if(size)window.__qual.setRecordSize(size);await window.__qual.record();window.__qual.pilot(true);},RECORD_SIZE);
          for(let i=0;i<4;i++){await wait(12000);await page.evaluate(()=>window.__qual.marker(300));}await wait(12000);await page.evaluate(()=>window.__qual.stop());})()]);
        const player=await page.evaluate(()=>window.__qual.recording().last);
        if(download)await download.saveAs(file);
        const a=download?media.analyse(file):null,s=download?media.markers(file):null,c=download?media.continuity(file):null;
        recordings.push({minute:+minuteNow().toFixed(1),world:SEGMENTS[segment][1].label,seconds:+((Date.now()-began)/1000).toFixed(1),video:a?.video||null,audio:a?.audio||null,fps:a?.fps,longGaps:a?.longGaps,gapsAt:a?.gapsAt||[],startupMaxMs:a?.startupMaxMs??null,maxIntervalAfterStartupMs:a?.maxIntervalAfterStartupMs??null,frameIntervalMedianMs:a?.frameInterval?.median??null,
          frameIntervalMaxMs:a?.frameInterval?.max,videoDuration:a?.videoDuration,audioDuration:a?.audioDuration,audioMeanDb:a?.audioMeanDb,longestSilenceMs:a?.longestSilenceMs,pilotGapMs:c?.longestGapMs??null,changingFrames:a?.changingFrames,
          sync:s?{markers:s.flashes,chirps:s.chirps,meanOffsetMs:s.meanOffsetMs,maxAbsOffsetMs:s.maxAbsOffsetMs,pairs:s.pairs}:null,bytes:download?fs.statSync(file).size:0,audioLostReported:player?.audioLost??null});
        console.log('recording',JSON.stringify(recordings.at(-1)));if(download)fs.rmSync(file);}}
      // Receiver restart, once.
      if(!restart&&minute>=RESTART_AT&&Date.now()<END){
        const before=await page.evaluate(()=>window.__qual.stats()?.intents??null),shown=await page.evaluate(()=>window.__qual.world());receiverDown=true;const t=Date.now();await svc.stop();
        events.push({minute:+minute.toFixed(1),event:'receiver stopped'});
        // While it is down, the world is rebuilt (as RETRY or a world switch would): it must wait, not give up.
        await wait(7000);await page.evaluate(()=>window.__qual.rebuildWorld());await wait(8000);
        svc=await createService({port,dataDir:dir}).start();receiverDown=false;await deliver();
        events.push({minute:+minuteNow().toFixed(1),event:'receiver started again'});
        await wait(60000);const after=await page.evaluate(()=>window.__qual.stats()?.intents??null),world=await page.evaluate(()=>window.__qual.world());
        restart={downMs:Date.now()-t-60000,intentsBefore:before,intentsAfter:after,outboxAfterRestart:outbox.length,worldBefore:shown,worldAfter:world};}
      // Sample once a minute.
      if(Date.now()-lastSample>=Math.max(10000,60000*SCALE)){lastSample=Date.now();
        const {metrics}=await cdp.send('Performance.getMetrics');const m=Object.fromEntries(metrics.map(x=>[x.name,x.value]));
        const {processInfo}=await browserCdp.send('SystemInfo.getProcessInfo');const cpu={};for(const p of processInfo)cpu[p.type]=(cpu[p.type]||0)+p.cpuTime;
        const cpuPct=cpuBefore?Object.fromEntries(Object.keys(cpu).map(k=>[k,+(((cpu[k]-(cpuBefore.v[k]||0))/((Date.now()-cpuBefore.t)/1000))*100).toFixed(1)])):null;cpuBefore={v:cpu,t:Date.now()};
        const fps=await page.evaluate(()=>new Promise(r=>{let k=0;const s=performance.now();const f=()=>{k++;performance.now()-s<2000?requestAnimationFrame(f):r(k/((performance.now()-s)/1000));};requestAnimationFrame(f);}));
        const w=await page.evaluate(()=>({world:window.__qual.world(),stats:window.__qual.stats(),rms:window.__rms(),clock:window.__qual.audioClock(),selected:document.querySelector('[data-world].active')?.dataset.world||null}));
        // The music's audio clock against the wall clock: about 1 while sound is actually produced (0 when the audio device
        // stalls, which a level probe inside the audio graph does not show).
        const clockRate=clockBefore&&w.clock!==null?+((w.clock-clockBefore.audio)/((Date.now()-clockBefore.wall)/1000)).toFixed(3):null;clockBefore={audio:w.clock,wall:Date.now()};
        const st=w.stats||{},t=st.transport||null;
        const sample={minute:+minuteNow().toFixed(1),segment:SEGMENTS[segment][1].label,shown:w.selected,idle:paused,heapMB:+(m.JSHeapUsedSize/1048576).toFixed(1),nodes:m.Nodes,listeners:m.JSEventListeners,documents:m.Documents,frames:m.Frames,
          playerFps:+fps.toFixed(1),family:st.family||null,remote:w.world.remote,quality:st.quality??null,drawCalls:st.drawCalls??null,geometries:st.geometries??null,textures:st.textures??null,programs:st.programs??null,
          updateMs:st.updateMs??null,gpuMs:st.gpuMs??null,transport:t?{inFlight:t.inFlight,sent:t.sent,acknowledged:t.acknowledged,skippedHere:t.skippedHere,latencyMs:t.latencyMs,maxQueue:t.maxQueue,semantic:t.semantic}:null,
          workerRendered:st.rendered??null,workerSemantic:st.semantic??null,rms:+w.rms.toFixed(4),audioClockRate:clockRate,notice:w.world.notice||'',cpuPercent:cpuPct,rssMB:processMemory(),
          events:{produced:n,accepted,outbox:outbox.length,postFailures}};
        samples.push(sample);console.log(JSON.stringify(sample));
      }
      await wait(1000);
    }
    // ---- Verdict.
    clearInterval(produce);paused=true;await deliver();await svc.flush();
    const journal=fs.readFileSync(path.join(dir,'projects',fs.readdirSync(path.join(dir,'projects')).find(p=>fs.existsSync(path.join(dir,'projects',p,'events.jsonl'))),'events.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l).id);
    const stored=new Set(journal);
    check('events: every event produced was accepted and stored exactly once (including across the receiver restart)',stored.size===n&&journal.length===n&&outbox.length===0,
      `${n} produced, ${accepted} accepted, ${journal.length} stored (${stored.size} distinct), ${postFailures} failed posts retried`);
    const hourly=k=>Array.from({length:HOURS},(_,h)=>samples.filter(s=>s.minute>=h*60&&s.minute<(h+1)*60).map(s=>s[k]).filter(v=>v!==null&&v!==undefined));
    const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null,first=k=>mean(hourly(k)[0]),last=k=>mean(hourly(k).at(-1));
    check('memory: the page heap does not grow hour over hour (last hour within 25 % of the first)',last('heapMB')<=first('heapMB')*1.25+5,hourly('heapMB').map(h=>(mean(h)??0).toFixed(1)).join(' → ')+' MB (hourly means)');
    check('memory: DOM nodes and listeners stay bounded',last('nodes')<=first('nodes')*1.3+300&&last('listeners')<=first('listeners')*1.3+100,
      `nodes ${hourly('nodes').map(h=>Math.round(mean(h)??0)).join(' → ')}; listeners ${hourly('listeners').map(h=>Math.round(mean(h)??0)).join(' → ')}`);
    const rssHour=k=>Array.from({length:HOURS},(_,h)=>mean(samples.filter(s=>s.minute>=h*60&&s.minute<(h+1)*60&&s.rssMB).map(s=>s.rssMB[k]))??0);
    check('memory: the browser and receiver processes do not grow hour over hour (last hour within 25 % of the first)',['node','renderer','gpu'].every(k=>rssHour(k).at(-1)<=rssHour(k)[0]*1.25+50),
      ['node','browser','renderer','gpu'].map(k=>`${k} ${rssHour(k).map(v=>Math.round(v)).join('→')} MB`).join('; '));
    const bySegment={};for(const s of samples){(bySegment[s.segment]??=[]).push(s);}
    // Each world's frame rate in the first and the last hour it was shown (hours without samples of it are skipped).
    const decay=Object.entries(bySegment).map(([seg,xs])=>{const hours=Array.from({length:HOURS},(_,h)=>mean(xs.filter(s=>s.minute>=h*60&&s.minute<(h+1)*60).map(s=>s.playerFps))).filter(v=>v!==null);return {seg,hours};});
    check('frame rate: no decay over time (each world\'s last-hour frame rate at least 80 % of its first-hour rate)',decay.every(d=>d.hours.length<2||d.hours.at(-1)>=d.hours[0]*.8),
      decay.map(d=>`${d.seg} ${d.hours.map(v=>v.toFixed(0)).join('→')}`).join('; '));
    const gpu=Object.entries(bySegment).map(([seg,xs])=>{const g=xs.map(s=>s.geometries).filter(v=>v!==null),t=xs.map(s=>s.textures).filter(v=>v!==null);return {seg,geometries:g.length?[g[0],Math.max(...g),g.at(-1)]:null,textures:t.length?[t[0],Math.max(...t),t.at(-1)]:null};});
    check('GPU objects: geometries and textures stay bounded per world (not growing with time)',gpu.every(x=>!x.geometries||x.geometries[2]<=x.geometries[0]*1.5+50),
      gpu.filter(x=>x.geometries).map(x=>`${x.seg}: geometries ${x.geometries.join('/')} textures ${x.textures?.join('/')} (first/max/last)`).join('; '));
    const silent=samples.filter(s=>s.rms<0.0005),rates=samples.map(s=>s.audioClockRate).filter(v=>v!==null),stalled=samples.filter(s=>s.audioClockRate!==null&&(s.audioClockRate<.95||s.audioClockRate>1.05));
    check('sound: the music keeps playing (its audio clock runs at real time; sampled level above silence)',rates.length>0&&!stalled.length&&silent.length<=samples.length*.05,
      `audio clock ${Math.min(...rates).toFixed(3)}-${Math.max(...rates).toFixed(3)}× real time${stalled.length?`, off at minutes ${stalled.slice(0,6).map(s=>s.minute).join(', ')}`:''}; ${silent.length}/${samples.length} silent samples`);
    const transport=samples.filter(s=>s.transport);
    check('pack transport: never more than one render in flight; no pack stopped during the soak',transport.every(s=>s.transport.inFlight<=1)&&!samples.some(s=>/stopped/.test(s.notice)),
      `${transport.length} samples on packs; max latency ${Math.max(0,...transport.map(s=>s.transport.latencyMs)).toFixed(1)} ms; notices: ${[...new Set(samples.map(s=>s.notice).filter(Boolean))].slice(0,3).join(' | ')||'none'}`);
    // Full: no frame gap over 250 ms anywhere, markers within 125 ms. Mechanism (CI): after start-up no gap over 500 ms or
    // 2.5 frame intervals, markers within 250 ms plus a frame interval.
    // The sound must cover the whole recording (a pilot check over a few hundred milliseconds of sound proves nothing).
    const recOk=r=>r.video&&r.audio&&r.audioDuration>=r.videoDuration-2&&r.pilotGapMs!==null&&r.pilotGapMs<=20&&r.sync&&r.sync.markers>=4&&(MECH?
      r.maxIntervalAfterStartupMs!==null&&r.maxIntervalAfterStartupMs<=Math.max(500,2.5*r.frameIntervalMedianMs)&&r.sync.maxAbsOffsetMs!==null&&r.sync.maxAbsOffsetMs<=250+r.frameIntervalMedianMs:
      r.longGaps===0&&r.sync.maxAbsOffsetMs!==null&&r.sync.maxAbsOffsetMs<=125);
    check('recordings: every one-minute recording has video and sound, no picture or sound gaps, and markers in sync',recordings.length>=3*HOURS&&recordings.every(recOk),
      recordings.map(r=>`${r.world.split(' ')[0]}@${Math.round(r.minute)}m: ${r.fps} fps, sound ${r.audioDuration}/${r.videoDuration} s${r.audioLostReported?' (loss reported to the user)':''}, gaps ${r.longGaps}, pilot gap ${r.pilotGapMs} ms, sync max ${r.sync?.maxAbsOffsetMs} ms`).join('; '));
    check('receiver restart: nothing stopped, the world rebuilt during the outage came back, and new events arrived',restart&&restart.intentsAfter>restart.intentsBefore&&restart.outboxAfterRestart===0&&
      restart.worldAfter.selectedWorld===restart.worldBefore.selectedWorld&&restart.worldAfter.remote===restart.worldBefore.remote&&!/stopped/.test(restart.worldAfter.notice),
      restart?`intents ${restart.intentsBefore} → ${restart.intentsAfter}; down ${Math.round(restart.downMs/1000)} s; world ${restart.worldBefore.selectedWorld}/${restart.worldBefore.family} → ${restart.worldAfter.selectedWorld}/${restart.worldAfter.family}`:'no restart');
    // The browser logs every non-2xx request as a console error (a 404 for the project before its first interpretation,
    // refused requests while the receiver was down): counted, not errors of the player.
    const network=errors.filter(e=>/^Failed to load resource/.test(e.error)),real=errors.filter(e=>!/^Failed to load resource/.test(e.error));
    check('no page errors in the whole soak',!real.length,real.slice(0,3).map(e=>`${e.minute}m ${e.error}`).join(' | ')||`none (${network.length} failed requests logged by the browser)`);
    fs.writeFileSync(path.join(OUT,`soak-${HOURS}h${SCALE!==1?`-scale${SCALE}`:''}${GPU?`-${GPU}`:''}.json`),JSON.stringify({at:new Date().toISOString(),hours:HOURS,scale:SCALE,viewport:`${VW}x${VH}`,quality:QUALITY===null?'auto':Number(QUALITY),thresholds:MECH?'mechanism':'full',gpu:GPU||'swiftshader',renderer,checks,restart,events,recordings,errors,samples},null,1));
  }finally{clearInterval(produce);await browser.close();await svc.stop().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(recDir,{recursive:true,force:true});}
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

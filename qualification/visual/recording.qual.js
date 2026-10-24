'use strict';
// Live recording qualification: the player's RECORD button, in a real browser, for every renderer category (a built-in
// world, a declarative look, a shader pack and an executable world pack, the last two running in the isolated pack
// frame). Each recording is downloaded as the user would get it and measured from the file itself (ffmpeg): streams,
// resolution, frame rate and stability, picture changing, duration, audio presence and continuity, and picture/sound
// synchronisation from flash and click markers scheduled at the same performance time (?qual=1 only). Also measured:
// finalisation time, page memory, CPU per browser process, GPU frame time where the GPU reports it, pack transport.
// Then the lifecycle: stop and restart, world and quality changes while recording, a pack failing mid-recording, a
// browser without recording support, and a multi-minute recording (drift).
//
// node visual/recording.qual.js [--gpu amd] [--seconds 20] [--long 180] [--quick] [--mechanism] [--pack <dir>] [--viewport 1280x720] [--quality 0-3] [--out results/recording]
// --viewport and --quality (a fixed rendering level) let a slow machine (CI's software renderer) render the player fast enough
// for the recording itself to be measured; the report names them.
// --pack: also record that pack (e.g. a world made with `scripts/pack.js new`), installed and approved in the copy.
// --quick: the four worlds at 8 s each, no lifecycle or long recording (CI).
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {REPO,projectOf,launch,rendererOf,withService,recipeAction,playerPage,worldReady,processMemory,checker}=require('./harness');
const packs=require(path.join(REPO,'engine/packs'));
const {lumen}=require('./datasets');
const media=require('./media');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const GPU=arg('gpu',null),QUICK=process.argv.includes('--quick');
// Mechanism thresholds (what a software-rendered CI machine can be held to): implied by --quick; --mechanism applies them
// to a full run (lifecycle and the long recording included).
const MECH=QUICK||process.argv.includes('--mechanism');
const SECONDS=+arg('seconds',QUICK?8:20),LONG=+arg('long',180);
const [VW,VH]=arg('viewport','1280x720').split('x').map(Number),QUALITY=arg('quality',null);
const PAGE={width:VW,height:VH,query:QUALITY===null?'':`&quality=${QUALITY}&adapt=0`};
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','recording')));
const {checks,check}=checker();const measurements={worlds:{},lifecycle:{}};
// ITU-R BT.1359 (offset = sound time - picture time): detectable outside [-45, +125] ms, acceptable within [-90, +185].
const SYNC={detectable:[-45,125],acceptable:[-90,185]};
const WORLDS=[
  {key:'stellar-forge',name:'Stellar Forge (built-in world)',action:{type:'family',family:'stellar-forge'},remote:false,family:'stellar-forge'},
  {key:'ember-observatory',name:'Ember Observatory (declarative pack)',pack:'ember-observatory',action:{type:'pack',pack:'northlight.ember-observatory'},remote:false,look:'northlight.ember-observatory'},
  {key:'blueprint-cathedral',name:'Blueprint Cathedral (shader pack)',pack:'blueprint-cathedral',action:{type:'pack',pack:'northlight.blueprint-cathedral'},remote:true,look:'northlight.blueprint-cathedral'},
  {key:'cymatic-field',name:'Cymatic Field (executable world pack)',pack:'cymatic-field',action:{type:'family',family:'halcyon.cymatic-field'},remote:true,family:'halcyon.cymatic-field'}
];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// An extra pack to record (--pack): its kind decides how it is chosen and whether it runs in the pack frame.
if(arg('pack',null)){const dir=path.resolve(arg('pack')),m=JSON.parse(fs.readFileSync(path.join(dir,'pack.json'),'utf8'));
  WORLDS.push({key:m.id.replace(/[^a-z0-9-]+/gi,'-'),name:`${m.name} (${m.kind} pack, --pack)`,pack:m.id,dir,remote:m.kind!=='declarative',
    action:m.kind==='world'?{type:'family',family:m.id}:{type:'pack',pack:m.id},...(m.kind==='world'?{family:m.id}:{look:m.id})});}
function dataset(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-recording-'));lumen(dir);const data=path.join(dir,'lumen');
  for(const w of WORLDS.filter(w=>w.pack)){const m=packs.install(w.dir||path.join(REPO,'packs/examples',w.pack),data);if(packs.executable(m.kind))packs.setTrust(m.id,data,{trusted:true});}
  // The failing fixture (a testing utility, never a real pack), for the failure-while-recording test.
  const f=packs.install(path.join(REPO,'packs/testing/failing-world'),data);packs.setTrust(f.id,data,{trusted:true});
  return data;
}
// CPU time per browser process type (browser, renderer, GPU, utility), cumulative seconds.
async function cpu(browserCdp){const {processInfo}=await browserCdp.send('SystemInfo.getProcessInfo');const out={};for(const p of processInfo)out[p.type]=(out[p.type]||0)+p.cpuTime;return out;}
const cpuShare=(a,b,seconds)=>Object.fromEntries(Object.keys(b).map(k=>[k,+(((b[k]-(a[k]||0))/seconds)*100).toFixed(1)]));
// Records `seconds` with markers every `every` s (first after 2 s), sampling memory and the pack transport; returns
// the saved file, what the player reported, and the measurements taken during the recording.
async function record(page,browserCdp,file,{seconds,every=5,during=null}){
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const heap=async()=>{const {metrics}=await cdp.send('Performance.getMetrics');return metrics.find(m=>m.name==='JSHeapUsedSize').value/1048576;};
  const cpu0=await cpu(browserCdp),heap0=await heap(),mem0=processMemory(),began=Date.now();
  // The pilot tone (qualification only) measures the continuity of the recorded audio path.
  const started=await page.evaluate(async()=>{await window.__qual.record();window.__qual.pilot(true);return window.__qual.recording();});
  const samples=[];let markers=0,nextMarker=2000;const done=new Set();
  while(Date.now()-began<seconds*1000){
    const t=Date.now()-began;
    if(every&&t>=nextMarker&&t<seconds*1000-1500){if(await page.evaluate(()=>window.__qual.marker(300)))markers++;nextMarker+=every*1000;}
    if(during)for(const [at,f] of during)if(t>=at*1000&&!done.has(at)){done.add(at);await f(page);}
    if(!samples.length||t-samples.at(-1).t>=2000)samples.push({t,heapMb:+(await heap()).toFixed(1),...(await page.evaluate(()=>{const r=window.__qual.recording(),s=window.__qual.stats();
      return {frames:r.frames,bytes:r.bytes,active:r.active,gpuMs:s?.gpuMs??null,quality:s?.quality??null,transport:s?.transport||null};}))});
    await wait(100);
  }
  const elapsed=(Date.now()-began)/1000,cpu1=await cpu(browserCdp),stopAt=Date.now();
  const [download,result]=await Promise.all([page.waitForEvent('download',{timeout:120000}).catch(()=>null),page.evaluate(()=>window.__qual.stop())]);
  const finalizeMs=Date.now()-stopAt;if(download)await download.saveAs(file);
  await cdp.detach();
  return {file:download?file:null,filename:download?.suggestedFilename()||null,started,result,finalizeMs,markers,samples,cpu:cpuShare(cpu0,cpu1,elapsed),heapMb:{start:+heap0.toFixed(1),end:samples.at(-1)?.heapMb??null},processMb:{start:mem0,end:processMemory()},elapsed};
}
// The checks every saved recording must pass; returns the file analysis.
function verify(label,rec,{seconds,sync=true,minChanging=.3}){
  const a=rec.file?media.analyse(rec.file):null;
  check(`${label}: a WebM file with a VP8/VP9 video stream and an Opus audio stream`,a&&/webm|matroska/.test(a.container)&&/vp8|vp9/.test(a.video?.codec)&&a.audio?.codec==='opus',
    a?`${a.container} · ${a.video?.codec} ${a.video?.width}×${a.video?.height} · ${a.audio?.codec||'NO AUDIO'} ${a.audio?.sampleRate||''} Hz · ${(fs.statSync(rec.file).size/1048576).toFixed(2)} MB`:'no file');
  if(!a)return null;
  check(`${label}: resolution is the recording surface's`,a.video.width===rec.started.width&&a.video.height===rec.started.height,`${a.video.width}×${a.video.height}`);
  // Against the player's own measure of the recording (from the recorder's start to its stop). On a slow machine the
  // encoder may drop its last frames at stop (mechanism thresholds allow 2 s).
  const recorded=rec.result.durationMs/1000;
  check(`${label}: duration matches the time recorded`,Math.abs(a.videoDuration-recorded)<=(MECH?2:Math.max(1,recorded*.06))&&Math.abs(a.audioDuration-recorded)<=(MECH?2:Math.max(1,recorded*.06)),
    `video ${a.videoDuration} s, audio ${a.audioDuration} s, recorded ${recorded.toFixed(1)} s by the player (${rec.elapsed.toFixed(1)} s including start-up)`);
  // The file holds what the player presented: its frame rate is the compositor's (one captured frame per frame drawn).
  // Full runs: the file follows what the player presented. Quick runs (CI's software renderer, where copying a
  // main-thread WebGL frame starves the capture) check the mechanism: a steady stream with no long gaps.
  const drawn=rec.result.frames/(rec.result.durationMs/1000);
  // Quick: after the first second, a gap is judged against the stream's own rate (a software renderer may present a few
  // frames a second); a start-up gap is reported, not judged. Full runs allow no gap anywhere.
  // (A broken capture shows gaps of seconds or no frames; a loaded CI machine shows hitches of a few hundred ms.)
  const steady=a.maxIntervalAfterStartupMs!==null&&a.maxIntervalAfterStartupMs<=Math.max(500,a.frameInterval.median*2.5);
  check(MECH?`${label}: a steady video stream after start-up (no interval over 2.5× the median or 500 ms)`:`${label}: frame rate follows the player's presentation rate, without long gaps`,
    MECH?steady&&a.fps>=2:a.fps>=Math.min(25,drawn*.8)&&a.longGaps===0,
    `${a.fps} fps in the file (player drew ${drawn.toFixed(1)}), frame interval median ${a.frameInterval.median} ms, p95 ${a.frameInterval.p95} ms, max ${a.frameInterval.max} ms (start-up ${a.startupMaxMs} ms), ${a.longGaps} gaps > 250 ms${a.gapsAt.length?` (at ${a.gapsAt.map(g=>`${g.t} s: ${g.ms} ms`).slice(0,3).join(', ')})`:''}`);
  check(`${label}: the picture is a living world (not black, not frozen)`,a.meanLuma>4&&a.changingFrames>=minChanging,`mean luma ${a.meanLuma}, ${Math.round(a.changingFrames*100)} % of frames change`);
  // Presence: the music is there (its rests are musical, not dropouts). Continuity: the pilot never drops out.
  const c=media.continuity(rec.file);a.continuity=c;
  // The video's duration runs from its first to its last frame: it may fall short of the sound by two frame intervals.
  const lengthOk=Math.abs(a.audioDuration-a.videoDuration)<=(MECH?2:Math.max(.5,2*a.frameInterval.median/1000));
  check(`${label}: sound is present and continuous for the whole recording (no gap in the qualification pilot)`,lengthOk&&a.audioMeanDb>-70&&c.pilotDb>-80&&c.longestGapMs<=20,
    `sound ${a.audioDuration} s for ${a.videoDuration} s of video; music mean ${a.audioMeanDb} dBFS (rests: ${Math.round(a.silentShare*100)} % below -60 dB, longest ${a.longestSilenceMs} ms); pilot ${c.pilotDb} dBFS, ${c.gaps} gaps, longest ${c.longestGapMs} ms`);
  check(`${label}: finalised promptly and named without project details`,rec.finalizeMs<5000&&/^code-resonance-[0-9a-f]{0,10}-\d+\.webm$/.test(rec.filename||''),`${rec.finalizeMs} ms · ${rec.filename}`);
  if(sync){
    // A flash can only appear on a captured frame: the measurement resolution is the recording's median frame interval.
    const res=Math.round(a.frameInterval?.median||33);
    // Quick runs (CI's loaded software renderer delays canvas capture) check that markers pair within ±250 ms plus the
    // measurement resolution; full runs hold every marker to ITU-R BT.1359 acceptability (± the resolution).
    const range=MECH?[-250-res,250+res]:[SYNC.acceptable[0]-res,SYNC.acceptable[1]+res];
    const s=media.sync(rec.file);a.sync=s;const ok=s.pairs.length>0&&s.pairs.every(p=>p.offsetMs!==null&&p.offsetMs>=range[0]&&p.offsetMs<=range[1]);
    check(MECH?`${label}: picture and sound markers pair up within ±250 ms (± one frame interval)`:`${label}: picture and sound in sync (every marker within ITU-R BT.1359 acceptability, ± one frame interval)`,ok&&s.flashes>=rec.markers&&rec.markers>0,
      `${rec.markers} markers, ${s.flashes} flashes, ${s.clicks} clicks; offset (sound − picture) mean ${s.meanOffsetMs} ms, max |${s.maxAbsOffsetMs}| ms, spread ${s.spreadMs} ms; resolution ${res} ms; ${s.pairs.filter(p=>p.offsetMs!==null&&p.offsetMs>=SYNC.detectable[0]&&p.offsetMs<=SYNC.detectable[1]).length}/${s.pairs.length} within detectability`);
  }
  return a;
}
function stills(file,key,duration){for(const f of [.25,.75]){const t=+(duration*f).toFixed(1);media.still(file,t,path.join(OUT,`${key}-${String(Math.round(t)).padStart(3,'0')}s.jpg`));}}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cr-recordings-'));
  const data=dataset(),project=projectOf(data);
  const browser=await launch(GPU);
  try{
    measurements.renderer=await rendererOf(browser);
    if(GPU==='amd'&&!/AMD|Radeon/i.test(measurements.renderer))throw new Error(`Requested the AMD GPU but got ${measurements.renderer}`);
    const browserCdp=await browser.newBrowserCDPSession();
    await withService(data,async svc=>{
      // ---- The four renderer categories -------------------------------------------------------------------------
      for(const w of WORLDS){
        await recipeAction(svc,project,w.action);
        const {page,errors}=await playerPage(browser,svc,project,PAGE);
        try{
          await worldReady(page,w);await page.evaluate(()=>window.__qual.replayFromStart());await wait(3000);
          const rec=await record(page,browserCdp,path.join(tmp,`${w.key}.webm`),{seconds:SECONDS});
          const a=verify(w.name,rec,{seconds:SECONDS});
          check(`${w.name}: the player stayed on the world, with no page errors`,(await page.evaluate(()=>window.__qual.world())).remote===w.remote&&!errors.length,errors.slice(0,2).join(' | ')||'none');
          measurements.worlds[w.key]={analysis:a,player:rec.result,finalizeMs:rec.finalizeMs,cpuPercent:rec.cpu,heapMb:rec.heapMb,processMb:rec.processMb,samples:rec.samples};
          if(a){stills(rec.file,w.key,a.videoDuration);fs.copyFileSync(rec.file,path.join(OUT,`${w.key}${GPU?`-${GPU}`:''}.webm`));}
        }finally{await page.close();}
      }
      if(QUICK)return;
      // ---- Lifecycle --------------------------------------------------------------------------------------------
      const cymatic=WORLDS[3],forge=WORLDS[0];
      await recipeAction(svc,project,cymatic.action);
      {
        const {page,errors}=await playerPage(browser,svc,project,PAGE);
        try{
          await worldReady(page,cymatic);await page.evaluate(()=>window.__qual.replayFromStart());await wait(2000);
          // Stop and restart: two independent, complete files.
          const first=await record(page,browserCdp,path.join(tmp,'restart-1.webm'),{seconds:5,every:0});
          const second=await record(page,browserCdp,path.join(tmp,'restart-2.webm'),{seconds:5,every:0});
          const a1=first.file&&media.analyse(first.file),a2=second.file&&media.analyse(second.file);
          check('restart: stopping and recording again gives two complete files',[a1,a2].every(a=>a&&a.video&&a.audio&&Math.abs(a.videoDuration-5)<=1&&a.longGaps===0),
            [a1,a2].map(a=>a?`${a.videoDuration} s ${a.fps} fps ${a.audio?.codec}`:'missing').join(' · '));
          measurements.lifecycle.restart=[a1,a2];
          // World and quality changes while recording: the file continues through both switches.
          const switching=await record(page,browserCdp,path.join(tmp,'switching.webm'),{seconds:24,every:0,during:[
            [5,p=>p.evaluate(a=>window.__qual.action(a),forge.action)],
            [12,p=>p.evaluate(a=>window.__qual.action(a),cymatic.action)],
            [18,p=>p.evaluate(()=>{const s=document.getElementById('qualitySelect');s.value='2';s.dispatchEvent(new Event('change'));})]]});
          const as=switching.file&&media.analyse(switching.file),cs=switching.file&&media.continuity(switching.file);
          const after=await page.evaluate(()=>window.__qual.world());
          check('world switches while recording: one continuous file through Cymatic Field → Stellar Forge → Cymatic Field and a quality change',
            as&&as.audio&&Math.abs(as.videoDuration-24)<=1.5&&cs.longestGapMs<=20&&after.family===cymatic.family&&after.remote,
            as?`${as.videoDuration} s, ${as.fps} fps, longest frame gap ${as.frameInterval.max} ms (${as.longGaps} > 250 ms while worlds load), sound pilot longest gap ${cs.longestGapMs} ms; now ${after.family}`:'no file');
          measurements.lifecycle.switching={analysis:as,continuity:cs,player:switching.result};
          check('lifecycle: no page errors',!errors.length,errors.slice(0,2).join(' | ')||'none');
        }finally{await page.close();}
      }
      // A pack that fails while recording: the recording is finished and saved (with its reason), the pack is stopped and
      // the safe built-in world takes over, keeping the recipe.
      await recipeAction(svc,project,{type:'family',family:'testing.failing-world'});
      {
        const {page}=await playerPage(browser,svc,project,PAGE);
        try{
          await worldReady(page,{remote:true,family:'testing.failing-world'});
          const began=Date.now();
          const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}).catch(()=>null),page.evaluate(()=>window.__qual.record())]);
          const file=path.join(tmp,'failure.webm');if(download)await download.saveAs(file);
          const last=await page.evaluate(()=>window.__qual.recording().last),state=await page.evaluate(()=>window.__qual.world());
          await page.waitForFunction(()=>window.__qual.world().selectedWorld==='living'&&!window.__qual.world().remote&&!!window.__qual.stats(),null,{timeout:30000}).catch(()=>{});
          const fallback=await page.evaluate(()=>window.__qual.world());
          const af=download&&media.analyse(file);
          check('pack failure while recording: the recording is finished early, saved, with video and sound',!!af&&!!af.video&&!!af.audio&&/stopped|failure|error/i.test(last?.reason||'')&&af.videoDuration>2,
            af?`${af.videoDuration} s saved after ${((Date.now()-began)/1000).toFixed(1)} s; reason “${last?.reason}”`:'no file');
          check('pack failure while recording: the pack is stopped, the user told, and a built-in world takes over',/stopped/.test(state.notice)&&!fallback.remote&&fallback.frames===0,
            `notice “${state.notice}”; now ${fallback.family} (${fallback.remote?'pack':'built-in'}), ${fallback.frames} pack frames`);
          measurements.lifecycle.failure={analysis:af,player:last,notice:state.notice,fallback};
        }finally{await page.close();}
      }
      // Browsers without recording: the user is told why, nothing breaks.
      await recipeAction(svc,project,forge.action);
      for(const [name,init] of [['no MediaRecorder',()=>{delete window.MediaRecorder;}],['no canvas capture',()=>{delete HTMLCanvasElement.prototype.captureStream;}]]){
        const {page,errors}=await playerPage(browser,svc,project,{...PAGE,init});
        try{
          await worldReady(page,forge);
          await page.evaluate(()=>window.__qual.record());
          const state=await page.evaluate(()=>({world:window.__qual.world(),recording:window.__qual.recording(),button:document.getElementById('recordBtn').textContent}));
          check(`unsupported browser (${name}): recording does not start, the reason is shown, no errors`,!state.recording.active&&/not available|cannot/i.test(state.world.notice)&&!errors.length,
            `“${state.world.notice}” · button ${state.button.trim()}`);
        }finally{await page.close();}
      }
      // ---- A multi-minute recording (replay at 1×, markers every 15 s): drift, memory, continuity ------------------
      await recipeAction(svc,project,cymatic.action);
      {
        const {page,errors}=await playerPage(browser,svc,project,{...PAGE,speed:1});
        try{
          await worldReady(page,cymatic);await page.evaluate(()=>window.__qual.replayFromStart());await wait(2000);
          const rec=await record(page,browserCdp,path.join(tmp,'long.webm'),{seconds:LONG,every:15});
          const a=verify(`long recording (${Math.round(LONG/60)} min, Cymatic Field)`,rec,{seconds:LONG,minChanging:.2});
          // Drift is the trend of the offset over the recording (least squares over every marker), not the difference between
          // two markers: each offset carries up to a frame interval of quantisation (reported as jitter).
          if(a?.sync){const p=a.sync.pairs.filter(x=>x.offsetMs!==null),n=p.length,mx=p.reduce((t,x)=>t+x.video,0)/n,my=p.reduce((t,x)=>t+x.offsetMs,0)/n;
            const slope=n>2?p.reduce((t,x)=>t+(x.video-mx)*(x.offsetMs-my),0)/p.reduce((t,x)=>t+(x.video-mx)**2,0):null;
            const jitter=slope===null?null:Math.sqrt(p.reduce((t,x)=>t+(x.offsetMs-(my+slope*(x.video-mx)))**2,0)/n),drift=slope===null?null:slope*a.videoDuration;
            a.drift={msPerMinute:slope===null?null:+(slope*60).toFixed(1),overRecordingMs:drift===null?null:Math.round(drift),jitterMs:jitter===null?null:+jitter.toFixed(1)};
            const limit=MECH?Math.max(40,2*a.frameInterval.median):40;
            check(`long recording: no picture/sound drift (offset trend over the whole recording within ${limit} ms)`,drift!==null&&Math.abs(drift)<=limit,
              `${n} markers, offsets ${Math.min(...p.map(x=>x.offsetMs))} to ${Math.max(...p.map(x=>x.offsetMs))} ms (mean ${Math.round(my)}); trend ${a.drift.msPerMinute} ms/min = ${a.drift.overRecordingMs} ms over ${a.videoDuration} s; jitter ${a.drift.jitterMs} ms`);}
          const heaps=rec.samples.map(s=>s.heapMb),firstMin=heaps.slice(0,15),lastMin=heaps.slice(-15),avg=x=>x.reduce((s,v)=>s+v,0)/Math.max(1,x.length);
          // The recording itself is held by the browser until it stops: browser and renderer memory may grow by its size.
          const pm=rec.processMb,recordedMb=rec.result.bytes/1048576,held=pm.start?(pm.end.browser+pm.end.renderer)-(pm.start.browser+pm.start.renderer):0;
          check('long recording: memory stays bounded (page heap flat; browser and renderer grow by at most the recording\'s size; GPU process under 25 %)',
            avg(lastMin)<=avg(firstMin)*1.25+8&&(!pm.start||(held<=recordedMb*1.2+100&&pm.end.gpu<=pm.start.gpu*1.25+50)),
            `JS heap ${avg(firstMin).toFixed(1)} → ${avg(lastMin).toFixed(1)} MB${pm.start?`; browser ${pm.start.browser} → ${pm.end.browser} MB, renderers ${pm.start.renderer} → ${pm.end.renderer} MB (growth ${held} MB for a ${recordedMb.toFixed(0)} MB recording), GPU process ${pm.start.gpu} → ${pm.end.gpu} MB`:''}; ${(rec.result.bytes/1048576).toFixed(1)} MB recorded (${(rec.result.bytes*8/LONG/1e6).toFixed(2)} Mbit/s)`);
          check('long recording: no page errors',!errors.length,errors.slice(0,2).join(' | ')||'none');
          measurements.lifecycle.long={analysis:a,player:rec.result,cpuPercent:rec.cpu,heapMb:rec.heapMb,processMb:rec.processMb,samples:rec.samples,finalizeMs:rec.finalizeMs};
          if(a)stills(rec.file,'long',a.videoDuration);
        }finally{await page.close();}
      }
    });
  }finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
  finish();
})().catch(e=>{console.error(e);check('recording qualification completed',false,String(e.message||e).slice(0,300));finish();});
function finish(){
  const file=path.join(OUT,`recording-qualification${GPU?`-${GPU}`:''}${QUICK?'-quick':''}.json`);
  fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),gpu:GPU||'swiftshader',renderer:measurements.renderer,seconds:SECONDS,thresholds:MECH?'mechanism':'full',viewport:`${VW}x${VH}`,quality:QUALITY===null?'auto':Number(QUALITY),checks,measurements},null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed · ${path.relative(process.cwd(),file)}`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
}

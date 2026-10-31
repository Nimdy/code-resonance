'use strict';
// Record & Broadcast through the real interface, on an isolated installation (never ~/.code-resonance): the recording
// profile saved by the receiver and applied by the engine (mouse and keyboard), real recordings started and stopped
// from this page, the top bar and the Stage (one recorder: every control shows the same state, a second window is told
// another one records), the files checked with ffmpeg (WebM, VP9 + Opus, the profile's dimensions, sound present; the
// vertical profile's 1080 × 1920 too, its middle frame saved as output-vertical.jpg to look at), the film and vertical
// clip commands behind the public-title gate,
// the OBS URL options loaded as real overlays (no controls, no private names), the audio and data exports.
// Usage: node qualification/ui/workspaces/output.qual.js        Results: qualification/results/ui/output.json + PNGs
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const cp=require('node:child_process');
const REPO=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(REPO,'qualification/node_modules/playwright-core'));
const {createEnvironment}=require('../environment.js');
const OUT=path.join(REPO,'qualification/results/ui');
let ffmpeg=null;try{ffmpeg=require(path.join(REPO,'qualification/node_modules/ffmpeg-static'));}catch{}
const ARGS=['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'];
const checks=[],measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000,step=200){const t=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t>ms)return v;await wait(step);}}
// The file as a player would see it: container, streams, dimensions and whether the sound carries signal.
function probe(file){
  const head=fs.readFileSync(file).subarray(0,4).toString('hex'),size=fs.statSync(file).size;
  if(!ffmpeg)return {ebml:head==='1a45dfa3',size,tool:'none'};
  const r=cp.spawnSync(ffmpeg,['-hide_banner','-i',file,'-af','volumedetect','-f','null','-'],{encoding:'utf8',timeout:120000});
  const err=r.stderr||'',video=/Stream #\S+.*Video: (\w+).*?, (\d+)x(\d+)/.exec(err),audio=/Stream #\S+.*Audio: (\w+)/.exec(err),max=/max_volume: (-?[\d.]+|-inf) dB/.exec(err);
  return {ebml:head==='1a45dfa3',size,tool:'ffmpeg',video:video?{codec:video[1],width:+video[2],height:+video[3]}:null,audio:audio?{codec:audio[1]}:null,maxVolumeDb:max?(max[1]==='-inf'?-Infinity:+max[1]):null};
}
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const env=await createEnvironment();
  const {url}=env,sample=env.projects.sample;
  const names=((await (await fetch(`${url}/api/projects`)).json()).projects||[]).map(p=>p.name).filter(Boolean);
  const settings=async()=>(await (await fetch(`${url}/api/settings`)).json());
  const browser=await chromium.launch({args:ARGS});
  const errors=[];const watch=(p,label)=>{p.on('console',m=>{if(m.type()==='error')errors.push(`${label}: ${m.text()}`);});p.on('pageerror',e=>errors.push(`${label}: ${e}`));};
  try{
    const ctx=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
    await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:url});
    const page=await ctx.newPage();watch(page,'main');
    await page.goto(`${url}/?project=${sample}#/output`);
    await page.waitForSelector('#outRecordBtn');
    await page.waitForFunction(()=>window.ResonancePlayer.state.model&&window.ResonancePlayer.state.receiver===true,null,{timeout:20000});
    const state=()=>page.evaluate(()=>{const r=window.ResonancePlayer.state.recording;return {active:r.active,size:r.size,supported:r.supported,stats:r.stats,last:r.last};});
    check('recording is supported in this browser',(await state()).supported.ok,JSON.stringify((await state()).supported));
    // ---- Profiles: saved by the receiver, applied by the engine; mouse and keyboard ----------------------------------
    await page.click('[data-profile="1080p"]');
    const s1=await until(async()=>(await settings()).recording.profile==='1080p'&&(await state()).size==='1080p'&&(await page.getAttribute('[data-profile="1080p"]','aria-checked'))==='true');
    check('choosing 1080p saves it (GET /api/settings) and applies it to the engine',s1,`settings=${(await settings()).recording.profile} engine=${(await state()).size}`);
    check('1080p shows its real output dimensions',(await page.textContent('#outDims')).includes('1920 × 1080'),await page.textContent('#outDims'));
    await page.focus('[data-profile="1080p"]');await page.keyboard.press('ArrowUp');
    const s2=await until(async()=>(await settings()).recording.profile==='720p'&&(await state()).size==='720p'&&(await page.getAttribute('[data-profile="720p"]','aria-checked'))==='true');
    check('the arrow keys choose 720p (saved and applied)',s2,`settings=${(await settings()).recording.profile} checked=${await page.getAttribute('[data-profile="720p"]','aria-checked')}`);
    check('720p shows 1280 × 720',(await page.textContent('#outDims')).includes('1280 × 720'));
    const stageDims=await page.textContent('[data-profile="stage"] .out-dims');
    check('Stage size shows the live stage’s pixel size',/^\d+ × \d+$/.test(stageDims),stageDims);
    // The slot's own size (the stage is placed on it), also when arriving from another workspace (the stage moves after mount).
    const slotDims=()=>page.evaluate(()=>{const r=document.querySelector('.out-slot').getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5),e=n=>Math.max(2,Math.round(n/2)*2);
      return `${e(Math.max(320,r.width*d))} × ${e(Math.max(180,r.height*d))}`;});
    await page.evaluate(()=>{location.hash='#/music';});await page.waitForTimeout(800);await page.evaluate(()=>{location.hash='#/output';});await page.waitForSelector('#outRecordBtn');
    const arrived=await until(async()=>(await page.textContent('[data-profile="stage"] .out-dims'))===await slotDims(),3000);
    check('Stage size is the frame on this page, also after arriving from another workspace',arrived,`card=${await page.textContent('[data-profile="stage"] .out-dims')} slot=${await slotDims()}`);
    await page.waitForTimeout(1500);
    await page.screenshot({path:path.join(OUT,'output-idle-1440.png')});
    // ---- A 720p recording through this page; observed on the top bar, the Stage and a second window ---------------
    const download=page.waitForEvent('download',{timeout:60000});
    await page.click('#outRecordBtn');
    check('Record starts the recording',await until(async()=>(await state()).active,10000),'');
    check('the top bar shows the same recording',await until(()=>page.evaluate(()=>document.getElementById('recordBtn').getAttribute('aria-pressed')==='true'&&/Stop/.test(document.getElementById('recordBtn').textContent)),3000));
    check('the profile cannot change while recording',await page.evaluate(()=>[...document.querySelectorAll('[data-profile]')].every(b=>b.disabled)));
    const page2=await ctx.newPage();watch(page2,'second');
    await page2.goto(`${url}/?project=${sample}#/output`);await page2.waitForSelector('#outRecordBtn');
    const other=await until(()=>page2.evaluate(()=>{const b=document.getElementById('outRecordBtn');return b.disabled&&/Recording in another window/.test(b.textContent)&&document.getElementById('recordBtn').disabled;}),8000);
    check('a second window shows “Recording in another window” and cannot start a second recording',other,await page2.textContent('#outRecordBtn'));
    await page.evaluate(()=>{location.hash='#/stage';});
    const onStage=await until(()=>page.evaluate(()=>{const b=document.getElementById('stageRecordBtn');return b&&b.getAttribute('aria-pressed')==='true'&&/Stop/.test(b.textContent);}),5000);
    check('the Stage page shows the same recording',onStage);
    await page.evaluate(()=>{location.hash='#/output';});await page.waitForSelector('#outRecordBtn');
    await until(async()=>(await state()).stats.elapsedMs>=3500,8000);
    const during=await page.evaluate(()=>({pressed:document.getElementById('outRecordBtn').getAttribute('aria-pressed'),label:document.getElementById('outRecordBtn').textContent,
      elapsed:document.getElementById('outElapsed').textContent,size:document.getElementById('outSize').textContent,frames:document.getElementById('outFrames').textContent,bytes:document.getElementById('outBytes').textContent,sound:document.getElementById('outSound').textContent}));
    check('this page shows the live recording state (elapsed, size, frames, data, sound)',during.pressed==='true'&&/Stop/.test(during.label)&&during.elapsed!=='00:00'&&during.size==='1280×720'&&/\d/.test(during.frames)&&/B$/.test(during.bytes)&&during.sound==='Music',JSON.stringify(during));
    await page.screenshot({path:path.join(OUT,'output-recording-1440.png')});
    await until(async()=>(await state()).stats.elapsedMs>=5200,5000);
    await page.click('#outRecordBtn');
    const file=await download.catch(()=>null);
    if(file){const saved=path.join(OUT,'output-720p.webm');await file.saveAs(saved);const p=probe(saved);measurements.rec720=p;measurements.rec720.name=file.suggestedFilename();
      check('the 720p recording is a WebM file with video and sound',p.ebml&&(p.tool==='none'?p.size>50000:p.video&&p.audio),JSON.stringify(p));
      if(p.tool==='ffmpeg'){check('the 720p file is 1280 × 720, VP9 + Opus',p.video?.width===1280&&p.video?.height===720&&/vp9|vp8/.test(p.video?.codec)&&p.audio?.codec==='opus',JSON.stringify(p.video));
        check('the recorded sound carries the music (not silent)',p.maxVolumeDb!==null&&p.maxVolumeDb>-60,`max_volume ${p.maxVolumeDb} dB`);}
      check('the file name carries no private name',!names.some(n=>file.suggestedFilename().includes(n))&&!/sample-app/.test(file.suggestedFilename()),file.suggestedFilename());
    }else check('the 720p recording is a WebM file with video and sound',false,'no download');
    // The file, its size and length are on the line under Record (#outLastLine); the sound and the downloads note in the
    // profile column (#outLast), which no longer repeats the line.
    const lastText=await until(()=>page.evaluate(()=>{const line=document.getElementById('outLastLine').textContent,t=document.getElementById('outLast').textContent;return /code-resonance-.*\.webm/.test(line)&&/music is included/.test(t)?`${line} | ${t}`:'';}),5000);
    check('the last recording is described (file, length, size, sound) with the downloads note',lastText&&/downloads folder/.test(lastText)&&/1280 × 720/.test(lastText),String(lastText).slice(0,200));
    const freed=await until(()=>page2.evaluate(()=>{const b=document.getElementById('outRecordBtn');return !b.disabled&&b.textContent.trim()==='Record';}),5000);
    check('the second window can record again once the first stopped',freed);
    await page2.close();
    // ---- 1080p round trip: saved, still chosen after a reload, recorded from the top bar at 1920 × 1080 -----------
    await page.click('[data-profile="1080p"]');await until(async()=>(await settings()).recording.profile==='1080p');
    await page.reload();await page.waitForSelector('#outRecordBtn');await page.waitForFunction(()=>window.ResonancePlayer.state.model,null,{timeout:20000});
    const after=await until(async()=>(await page.getAttribute('[data-profile="1080p"]','aria-checked'))==='true'&&(await state()).size==='1080p',8000);
    check('1080p is still chosen and applied after a reload',after,`engine=${(await state()).size}`);
    const download2=page.waitForEvent('download',{timeout:60000});
    await page.click('#recordBtn');
    const fromTop=await until(()=>page.evaluate(()=>document.getElementById('outRecordBtn').getAttribute('aria-pressed')==='true'),8000);
    check('a recording started from the top bar shows on this page',fromTop);
    await until(async()=>(await state()).stats.elapsedMs>=3200,8000);
    await page.click('#outRecordBtn');
    const file2=await download2.catch(()=>null);
    if(file2){const saved=path.join(OUT,'output-1080p.webm');await file2.saveAs(saved);const p=probe(saved);measurements.rec1080=p;
      check('the 1080p recording is 1920 × 1080 with video and sound',p.ebml&&(p.tool==='none'?p.size>50000:p.video?.width===1920&&p.video?.height===1080&&p.audio?.codec==='opus'),JSON.stringify(p));}
    else check('the 1080p recording is 1920 × 1080 with video and sound',false,'no download');
    // ---- Vertical (9:16): saved and applied, recorded upright at 1080 × 1920 -----------------------------------------
    await page.click('[data-profile="vertical"]');
    const vert=await until(async()=>(await settings()).recording.profile==='vertical'&&(await state()).size==='vertical'&&(await page.getAttribute('[data-profile="vertical"]','aria-checked'))==='true');
    check('choosing Vertical saves it and applies it to the engine',vert,`settings=${(await settings()).recording.profile} engine=${(await state()).size}`);
    check('Vertical shows its real output dimensions',(await page.textContent('#outDims')).includes('1080 × 1920'),await page.textContent('#outDims'));
    const download4=page.waitForEvent('download',{timeout:60000});
    await page.click('#outRecordBtn');await until(async()=>(await state()).stats.elapsedMs>=3200,10000);
    await page.click('#outRecordBtn');
    const file4=await download4.catch(()=>null);
    if(file4){const saved=path.join(OUT,'output-vertical.webm');await file4.saveAs(saved);const p=probe(saved);measurements.recVertical=p;
      check('the vertical recording is 1080 × 1920 with video and sound',p.ebml&&(p.tool==='none'?p.size>50000:p.video?.width===1080&&p.video?.height===1920&&p.audio?.codec==='opus'),JSON.stringify(p));
      if(ffmpeg)cp.spawnSync(ffmpeg,['-y','-loglevel','error','-ss','2','-i',saved,'-frames:v','1','-q:v','3',path.join(OUT,'output-vertical.jpg')]);}
    else check('the vertical recording is 1080 × 1920 with video and sound',false,'no download');
    await page.click('[data-profile="720p"]');
    check('back to 720p (saved)',await until(async()=>(await settings()).recording.profile==='720p'));
    // ---- The sound lost while recording: the engine finishes and saves the file early; this page says why ------------
    // (?qual=1 exposes the engine's qualification hook that ends the recorded audio track, as a lost device would.)
    await page.goto(`${url}/?qual=1&project=${sample}#/output`);await page.waitForSelector('#outRecordBtn');
    await page.waitForFunction(()=>window.ResonancePlayer.state.model&&window.__qual,null,{timeout:20000});
    const download3=page.waitForEvent('download',{timeout:60000});
    await page.click('#outRecordBtn');await until(async()=>(await state()).stats.elapsedMs>=2500,10000);
    await page.evaluate(()=>window.__qual.breakRecordingAudio());
    const file3=await download3.catch(()=>null);
    const early=await until(()=>page.evaluate(()=>{const t=document.getElementById('outLast').textContent;return /Finished early/.test(t)&&/Recording finished early \(the sound stopped/.test(t)?t:'';}),8000);
    check('when the sound is lost the file is saved early and the page shows the engine\u2019s message',!!file3&&early&&!(await state()).active,String(early).slice(0,160));
    await page.screenshot({path:path.join(OUT,'output-sound-lost-1440.png')});
    // ---- OBS: every option yields a URL that loads an overlay with no controls and no private names ------------------
    const obsUrl=()=>page.textContent('#obsUrl code');
    const world=await page.evaluate(()=>window.ResonancePlayer.state.world),style=await page.evaluate(()=>window.ResonancePlayer.state.sound.options.style);
    const urls=[];
    urls.push({url:await obsUrl(),labels:'stream',world:null,style:null});
    await page.click('#obsLabels [data-value="cinematic"]');await page.click('label:has(#obsPinWorld)');
    urls.push({url:await obsUrl(),labels:'cinematic',world,style:null});
    await page.click('#obsLabels [data-value="off"]');await page.click('label:has(#obsPinStyle)');
    urls.push({url:await obsUrl(),labels:'off',world,style});
    const shape=urls.map(u=>{const q=new URL(u.url).searchParams;return q.get('overlay')==='1'&&q.get('sound')==='1'&&q.get('project')===sample&&(q.get('labels')||'stream')===u.labels&&q.get('world')===u.world&&q.get('style')===u.style;});
    check('the OBS URL carries exactly the chosen options',shape.every(Boolean),urls.map(u=>u.url.replace(url,'')).join(' | '));
    measurements.obs=[];
    for(const u of urls){
      const status=(await fetch(u.url)).status;
      const ov=await ctx.newPage();watch(ov,'overlay');await ov.setViewportSize({width:1280,height:720});
      await ov.goto(u.url);await ov.waitForFunction(()=>window.ResonancePlayer?.state.model,null,{timeout:20000}).catch(()=>{});await ov.waitForTimeout(2500);
      const r=await ov.evaluate(()=>({app:!!document.querySelector('.app')&&getComputedStyle(document.querySelector('.app')).display!=='none',
        chrome:!!document.querySelector('.stage-chrome')&&getComputedStyle(document.querySelector('.stage-chrome')).display!=='none',
        buttons:[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).length,text:document.body.innerText,labels:window.ResonancePlayer.state.labels,world:window.ResonancePlayer.state.world,project:window.ResonancePlayer.state.project}));
      const leaked=names.filter(n=>r.text.includes(n));
      measurements.obs.push({url:u.url.replace(url,''),status,labels:r.labels,world:r.world,visibleButtons:r.buttons});
      check(`OBS view ${u.url.replace(url,'')} loads (200) as the stage alone, with the chosen options and no private name`,
        status===200&&!r.app&&!r.chrome&&r.buttons===0&&!leaked.length&&r.labels===u.labels&&r.project===sample&&(!u.world||r.world===u.world),
        `status=${status} app=${r.app} chrome=${r.chrome} buttons=${r.buttons} labels=${r.labels} world=${r.world} leaked=${JSON.stringify(leaked)}`);
      if(u===urls[0])await ov.screenshot({path:path.join(OUT,'output-obs-view.png')});
      await ov.close();
    }
    await page.click('#obsUrl button');
    const clip=await until(()=>page.evaluate(()=>navigator.clipboard.readText().catch(()=>'')),3000);
    check('Copy URL puts the built URL on the clipboard',clip===urls[2].url,String(clip).replace(url,''));
    const opened=ctx.waitForEvent('page',{timeout:10000});await page.click('#obsOpen');const op=await opened.catch(()=>null);
    if(op){await op.waitForLoadState().catch(()=>{});check('“Open the OBS view” opens the built URL',op.url()===urls[2].url,op.url().replace(url,''));await op.close();}
    else check('“Open the OBS view” opens the built URL',false,'no window');
    await page.click('#outObsProfile');
    const reset=await until(async()=>{const u=new URL(await obsUrl()).searchParams;return !u.has('labels')&&!u.has('world')&&!u.has('style');},3000);
    check('the OBS presentation profile sets up the recommended URL (stream, following the project) and records nothing',reset&&!(await state()).active&&(await settings()).recording.profile==='720p',await obsUrl());
    const seg=await page.evaluate(()=>{const g=document.getElementById('obsLabels');return [g.getBoundingClientRect().width,g.parentElement.getBoundingClientRect().width];});
    check('the OBS information control is as wide as its buttons (not stretched)',seg[0]<seg[1]*0.8,`${Math.round(seg[0])} of ${Math.round(seg[1])} px`);
    // ---- The fictional demonstration is labelled here (the OBS view and recordings cannot say it) -------------------
    if(env.projects.demo){const dp=await ctx.newPage();watch(dp,'demo');await dp.goto(`${url}/?project=${env.projects.demo}#/output`);await dp.waitForSelector('#outRecordBtn');
      const d=await until(()=>dp.evaluate(()=>({obs:[...document.querySelectorAll('#outObs .callout')].some(c=>/Demonstration \(fictional\)/.test(c.textContent)),badge:/Demonstration \(fictional\)/.test(document.querySelector('.out-chrome').textContent)})).then(x=>x.obs&&x.badge&&x),5000);
      check('a demonstration project is labelled fictional beside the OBS builder and over the frame',!!d,JSON.stringify(d));
      const real=await page.evaluate(()=>/Demonstration/.test(document.getElementById('outObs').textContent+document.querySelector('.out-chrome').textContent));
      check('a real project carries no demonstration label',!real);
      await dp.close();}
    // ---- Exports ---------------------------------------------------------------------------------------------------
    const wavP=page.waitForEvent('download',{timeout:180000});await page.click('#exportAudioBtn');
    const busy=await until(()=>page.evaluate(()=>document.getElementById('exportAudioBtn').disabled),3000,50);
    const wav=await wavP.catch(()=>null);
    if(wav){const f=path.join(OUT,'output-export.wav');await wav.saveAs(f);const head=fs.readFileSync(f).subarray(0,12).toString('latin1'),size=fs.statSync(f).size;measurements.wav={size,name:wav.suggestedFilename()};
      check('Export audio renders the recorded performance to a WAV file (the button shows it is working)',busy&&head.startsWith('RIFF')&&head.endsWith('WAVE')&&size>100000&&!names.some(n=>wav.suggestedFilename().includes(n)),`${size} bytes ${wav.suggestedFilename()}`);}
    else check('Export audio renders the recorded performance to a WAV file',false,'no download');
    const jsonP=page.waitForEvent('download',{timeout:30000});await page.click('#exportDataLink');
    const json=await jsonP.catch(()=>null);
    if(json){const f=path.join(OUT,'output-export.json');await json.saveAs(f);const raw=fs.readFileSync(f,'utf8');let doc=null;try{doc=JSON.parse(raw);}catch{}
      check('Download JSON gives the derived history of the selected project, without its private name',doc?.schema==='code-resonance.export.v2'&&doc.projectId===sample&&Array.isArray(doc.timeline)&&!names.some(n=>raw.includes(n)),`${raw.length} bytes, ${doc?.timeline?.length} windows`);}
    else check('Download JSON gives the derived history of the selected project',false,'no download');
    // The publish path (since the reel): npm ci in qualification once (Setup), then `npm run film` for this project, shown
    // only once the project has a public title (otherwise the page asks for one).
    const setup=await page.$$eval('.out-cmds',els=>els.map(e=>e.textContent).join(' | ')),gate=await page.textContent('.out-film-gate');
    check('the film commands are the real ones (npm ci in qualification once, then npm run film for this project, or a request for its public title)',
      /cd qualification && npm ci/.test(setup)&&(gate.includes(`npm run film -- --project ${sample}`)||/public title/i.test(gate)),`${setup.replace(/\s+/g,' ').slice(0,160)} · ${gate.replace(/\s+/g,' ').slice(0,120)}`);
    // The vertical clip of the same night, behind the same gate: its command next to the film's, or the same request.
    check('the vertical clip command sits next to the film command, behind the same public-title gate',
      (gate.includes(`npm run film -- --project ${sample} --vertical`)&&/Vertical clip/.test(gate)&&gate.includes(`npm run film -- --project ${sample}`))||(/public title/i.test(gate)&&!/--vertical/.test(gate)),gate.replace(/\s+/g,' ').slice(0,200));
    // ---- One recorder, atomically: two windows press Record at the same instant, many times -------------------------
    // Both windows' buttons are enabled when pressed (neither has heard the other announce a recording, so the
    // announcements cannot decide); the browser's recorder lock lets exactly one start, and the other says why.
    const ROUNDS=Math.max(1,Number(process.env.CR_RECORD_RACE_ROUNDS)||20);
    const racers=[];for(const label of ['race-a','race-b']){const p=await ctx.newPage();watch(p,label);
      await p.goto(`${url}/?qual=1&project=${sample}#/output`);await p.waitForSelector('#outRecordBtn');
      await p.waitForFunction(()=>window.ResonancePlayer.state.model&&window.__qual,null,{timeout:20000});racers.push(p);}
    const policies=await Promise.all(racers.map(p=>p.evaluate(()=>window.ResonancePlayer.record.lockPolicy)));
    check('the recorder lock is the browser’s Web Locks (not announcements alone)',policies.every(x=>x==='web-locks'),policies.join(','));
    const ready=p=>p.evaluate(()=>{const b=document.getElementById('outRecordBtn');return !b.disabled&&b.textContent.trim()==='Record'&&!window.ResonancePlayer.state.recording.active;});
    const rounds=[];
    for(let i=0;i<ROUNDS;i++){
      const free=await until(async()=>(await ready(racers[0]))&&(await ready(racers[1])),15000,100);
      if(!free){rounds.push({i,error:'a window did not become ready'});break;}
      const before=await Promise.all(racers.map(p=>p.evaluate(()=>({id:window.ResonancePlayer.state.notices.at(-1)?.id||0,sound:window.ResonancePlayer.state.sound.enabled}))));const seen=before.map(b=>b.id);
      // The same wall-clock instant in both windows (one machine, one clock); each reports whether its button was
      // enabled when it pressed it and what Record answered.
      const at=Date.now()+400;
      const presses=await Promise.all(racers.map(p=>p.evaluate(at=>new Promise(resolve=>{
        setTimeout(()=>{const b=document.getElementById('outRecordBtn'),enabled=!b.disabled,t=Date.now();b.click();resolve({enabled,t});},Math.max(0,at-Date.now()));}),at)));
      // Watch both windows for two seconds: how many record at once, at most.
      let maxActive=0,winner=-1;const t0=Date.now();
      while(Date.now()-t0<2000){const act=await Promise.all(racers.map(p=>p.evaluate(()=>window.ResonancePlayer.state.recording.active)));
        maxActive=Math.max(maxActive,act.filter(Boolean).length);if(winner<0)winner=act.indexOf(true);await wait(100);}
      const loser=winner===0?1:0;
      const told=winner>=0?await until(()=>racers[loser].evaluate(seen=>window.ResonancePlayer.state.notices.some(n=>n.id>seen&&/Another window of this browser is already recording/.test(n.text)),seen[loser]),3000):false;
      const loserSound=winner>=0?await racers[loser].evaluate(()=>window.ResonancePlayer.state.sound.enabled):null;
      rounds.push({i,enabled:presses.map(p=>p.enabled),spreadMs:Math.abs(presses[0].t-presses[1].t),maxActive,winner,told:!!told,loserSound,loserSoundBefore:winner>=0?before[loser].sound:null});
      if(winner>=0){const dl=racers[winner].waitForEvent('download',{timeout:30000}).catch(()=>null);await racers[winner].click('#outRecordBtn');await dl;}
    }
    measurements.recordRace={rounds:rounds.length,wins:[rounds.filter(r=>r.winner===0).length,rounds.filter(r=>r.winner===1).length],maxSpreadMs:Math.max(...rounds.map(r=>r.spreadMs||0)),detail:rounds};
    check(`${ROUNDS} rounds of Record pressed in two windows at the same instant (both buttons enabled): exactly one recording each time`,
      rounds.length===ROUNDS&&rounds.every(r=>r.enabled?.every(Boolean)&&r.maxActive===1&&r.winner>=0),
      `wins ${measurements.recordRace.wins.join('/')}, press spread ≤ ${measurements.recordRace.maxSpreadMs} ms, max active ${Math.max(...rounds.map(r=>r.maxActive||0))}`+(rounds.some(r=>r.error)?` ${rounds.find(r=>r.error).error}`:''));
    check('the window that lost the race says another window is recording, and did not start its sound',
      rounds.length===ROUNDS&&rounds.every(r=>r.told&&r.loserSound===r.loserSoundBefore),rounds.filter(r=>!r.told||r.loserSound!==r.loserSoundBefore).map(r=>`${r.i}${r.told?'':' not told'}${r.loserSound!==r.loserSoundBefore?' sound turned on':''}`).join(',')||'every round');
    // The control (a measurement, not a check): the same simultaneous press in two fresh windows with the lock bypassed
    // (their announcements alone) shows whether this race would let two through without it. The windows are closed
    // without saving (two recorders at once is the state the lock exists to prevent).
    {const ctl=[];for(const label of ['control-a','control-b']){const p=await ctx.newPage();watch(p,label);
        await p.goto(`${url}/?qual=1&project=${sample}#/output`);await p.waitForSelector('#outRecordBtn');
        await p.waitForFunction(()=>window.ResonancePlayer.state.model&&window.__qual,null,{timeout:20000});ctl.push(p);}
      const free=await until(async()=>(await ready(ctl[0]))&&(await ready(ctl[1])),15000,100);
      if(free){await Promise.all(ctl.map(p=>p.evaluate(()=>{window.ResonanceRecording.claim=async()=>({ok:true,policy:'announcements',release:()=>Promise.resolve()});})));
        const at=Date.now()+400;
        const enabled=await Promise.all(ctl.map(p=>p.evaluate(at=>new Promise(resolve=>{setTimeout(()=>{const b=document.getElementById('outRecordBtn'),e=!b.disabled;b.click();resolve(e);},Math.max(0,at-Date.now()));}),at)));
        let maxActive=0;const t0=Date.now();
        while(Date.now()-t0<2000){const act=await Promise.all(ctl.map(p=>p.evaluate(()=>window.ResonancePlayer.state.recording.active)));maxActive=Math.max(maxActive,act.filter(Boolean).length);await wait(100);}
        measurements.recordRace.withoutLock={enabled,maxActive};
        console.log(`(control) the same press with the lock bypassed: ${maxActive} window(s) recording at once`);}
      for(const p of ctl)await p.close();}
    // ---- A crashed recorder leaves no stale lock: its renderer is killed while recording, the other window records --
    {const [a,b]=racers;
      await until(async()=>(await ready(a))&&(await ready(b)),15000,100);
      await a.click('#outRecordBtn');
      const recA=await until(()=>a.evaluate(()=>window.ResonancePlayer.state.recording.active),10000);
      const heldBefore=await b.evaluate(()=>window.ResonancePlayer.record.heldElsewhere());
      const refused=await b.evaluate(()=>window.__qual.record());
      // Page.crash never answers (the renderer dies first): the page's crash event is what says it happened.
      const crashed=a.waitForEvent('crash',{timeout:15000}).then(()=>true,()=>false);
      const cdp=await ctx.newCDPSession(a);void cdp.send('Page.crash').catch(()=>{});
      const didCrash=await crashed;
      const freedAfterCrash=await until(async()=>(await b.evaluate(()=>window.ResonancePlayer.record.heldElsewhere()))===false,10000);
      // What b's Record button says now (the windows' announcements: a crashed window never says it stopped).
      measurements.recordCrash={buttonAfterCrash:(await b.textContent('#outRecordBtn')).trim(),disabledAfterCrash:await b.evaluate(()=>document.getElementById('outRecordBtn').disabled)};
      const took=await b.evaluate(()=>window.__qual.record());
      const recB=await until(()=>b.evaluate(()=>window.ResonancePlayer.state.recording.active),10000);
      check('while one window records, the other cannot (its lock is held there)',recA&&heldBefore===true&&refused?.ok===false&&refused?.reason==='elsewhere',JSON.stringify({recA,heldBefore,refused:refused?.reason}));
      check('a window that crashes while recording releases the lock at once: the other window records',didCrash&&freedAfterCrash&&took?.ok===true&&recB,JSON.stringify({didCrash,freedAfterCrash,took}));
      // Stopped without awaiting the page's promise across the evaluate boundary (Playwright reported it garbage
      // collected while the stop itself had settled); the page records when its stop settles and the check reads that.
      await b.evaluate(()=>{window.__stopB={};Promise.resolve(window.__qual.stop()).then(r=>{window.__stopB.settled=true;window.__stopB.result=!!r;},e=>{window.__stopB.error=String(e);});});
      const stopB=await until(()=>b.evaluate(()=>window.__stopB?.settled&&!window.ResonancePlayer.state.recording.active?window.__stopB:null),15000);
      check('the window that took over after the crash stops its recording normally',!!stopB?.result,JSON.stringify(stopB||await b.evaluate(()=>window.__stopB)));
      // A crashed window never announces that it stopped; the recorder lock is the evidence that it did not leave a
      // “Recording in another window” behind in the windows that remain.
      const recovered=await until(()=>page.evaluate(()=>{const x=document.getElementById('outRecordBtn');return !x.disabled&&x.textContent.trim()==='Record';}),8000);
      check('after the crash the remaining windows’ Record controls recover (no stale “recording in another window”)',recovered,(await page.textContent('#outRecordBtn')).trim());
      await a.close().catch(()=>{});await b.close();
      // The crashed renderer's own console noise is not this page's error.
      for(let i=errors.length-1;i>=0;i--)if(/^race-a: .*(crash|Target closed|Target crashed)/i.test(errors[i]))errors.splice(i,1);}
    // ---- Keyboard and screenshots ----------------------------------------------------------------------------------
    await page.evaluate(()=>document.querySelector('.ws-output h1').focus());
    const order=[];for(let i=0;i<8;i++){await page.keyboard.press('Tab');order.push(await page.evaluate(()=>document.activeElement.id||document.activeElement.dataset.profile||document.activeElement.textContent.trim().slice(0,24)));}
    check('the record control and the profile are reachable with Tab',order.includes('outRecordBtn')&&order.some(x=>['720p','1080p','vertical','stage'].includes(x)),order.join(' → '));
    // At 1920 × 1080 (the page's design size) nothing overflows and Record stays in the first view, with four profiles.
    await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>{document.querySelector('.page').scrollTop=0;});await page.waitForTimeout(800);
    await page.screenshot({path:path.join(OUT,'output-idle-1920.png')});
    const wide=await page.evaluate(()=>{const p=document.querySelector('.ws-output'),b=document.getElementById('outRecordBtn').getBoundingClientRect();return {overflow:p.scrollWidth-p.clientWidth,visible:b.bottom<=innerHeight&&b.top>0,cards:document.querySelectorAll('[data-profile]').length};});
    check('at 1920 × 1080 nothing overflows sideways and Record is visible, with the four profiles',wide.overflow<=1&&wide.visible&&wide.cards===4,JSON.stringify(wide));
    await page.evaluate(()=>{document.querySelector('.page').scrollTop=0;});
    await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(800);
    await page.screenshot({path:path.join(OUT,'output-idle-1280.png')});
    const fits=await page.evaluate(()=>{const b=document.getElementById('outRecordBtn').getBoundingClientRect();return b.bottom<=innerHeight&&b.top>0;});
    check('at 1280 × 720 the Record control is visible without scrolling',fits);
    await page.setViewportSize({width:900,height:800});await page.waitForTimeout(800);
    const overflow=await page.evaluate(()=>{const p=document.querySelector('.ws-output');return p.scrollWidth-p.clientWidth;});
    check('at 900 px wide nothing overflows sideways',overflow<=1,`overflow ${overflow}px`);
    await page.screenshot({path:path.join(OUT,'output-900.png')});
    await page.evaluate(()=>document.getElementById('outObs').scrollIntoView());await page.waitForTimeout(400);
    await page.screenshot({path:path.join(OUT,'output-obs-900.png')});
    check('no console or page errors',errors.length===0,errors.slice(0,4).join(' | '));
  }catch(e){check('qualification ran to the end',false,e.stack||e.message);}
  finally{await browser.close();await env.stop();}
  const report={at:new Date().toISOString(),browser:`chromium (playwright-core, headless, ${ARGS.join(' ')})`,ffmpeg:!!ffmpeg,checks,measurements};
  await fsp.writeFile(path.join(OUT,'output.json'),JSON.stringify(report,null,2));
  const failed=checks.filter(c=>!c.pass).length;console.log(`${checks.length-failed}/${checks.length} passed`);
  process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});

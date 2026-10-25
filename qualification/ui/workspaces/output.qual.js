'use strict';
// Record & Broadcast through the real interface, on an isolated installation (never ~/.code-resonance): the recording
// profile saved by the receiver and applied by the engine (mouse and keyboard), real recordings started and stopped
// from this page, the top bar and the Stage (one recorder: every control shows the same state, a second window is told
// another one records), the files checked with ffmpeg (WebM, VP9 + Opus, the profile's dimensions, sound present),
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
    const lastText=await until(()=>page.evaluate(()=>{const t=document.getElementById('outLast').textContent;return /code-resonance-.*\.webm/.test(t)&&/music is included/.test(t)?t:'';}),5000);
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
    const film=await page.textContent('.out-cmds');
    check('the film command is the real one (film.js after npm ci in qualification, with this data folder and project)',/cd qualification && npm ci/.test(film)&&film.includes(`node visual/film.js --data "${env.dir}" --project ${sample}`),film.replace(/\s+/g,' ').slice(0,200));
    // ---- Keyboard and screenshots ----------------------------------------------------------------------------------
    await page.evaluate(()=>document.querySelector('.ws-output h1').focus());
    const order=[];for(let i=0;i<8;i++){await page.keyboard.press('Tab');order.push(await page.evaluate(()=>document.activeElement.id||document.activeElement.dataset.profile||document.activeElement.textContent.trim().slice(0,24)));}
    check('the record control and the profile are reachable with Tab',order.includes('outRecordBtn')&&order.some(x=>['720p','1080p','stage'].includes(x)),order.join(' → '));
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

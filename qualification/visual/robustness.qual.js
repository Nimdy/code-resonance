'use strict';
// Pack runtime robustness, in a real browser, with the testing fixtures in packs/testing (test utilities, never real
// packs): a pack far too slow for live playback (bounded delivery: at most one render in flight, presentation frames
// skipped, every semantic event delivered), a pack that hangs (the watchdog stops it, the player stays responsive), one
// that throws, one that loses its GPU context, a hostile probe (isolation from where pack code runs, then a message
// flood), approval revoked and files modified while a pack runs, world switching while renders are pending, the frame
// navigating, an inactive tab, and a film frame that never arrives (an explicit error, never a wrong frame).
// After every stop: the user is told, the safe built-in world takes over, the recipe keeps the pack, nothing restarts
// on its own (RETRY does, once per press), and the frame (with its worker and GPU context) is gone.
//
// node visual/robustness.qual.js [--gpu amd] [--quick] [--out results/robustness]
// --quick: the slow, failing and hanging fixtures only (CI).
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const http=require('node:http');
const {REPO,projectOf,launch,rendererOf,withService,recipeAction,playerPage,worldReady,filmPage,checker}=require('./harness');
const packs=require(path.join(REPO,'engine/packs'));
const {lumen}=require('./datasets');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const GPU=arg('gpu',null),QUICK=process.argv.includes('--quick');
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','robustness')));
const {checks,check}=checker();const measurements={};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const FIXTURES=['slow-world','failing-world','hanging-world','context-loss-world'];
const fixture=name=>({remote:true,family:`testing.${name}`});
function dataset(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-robustness-'));lumen(dir);const data=path.join(dir,'lumen');
  for(const f of FIXTURES){const m=packs.install(path.join(REPO,'packs/testing',f),data);packs.setTrust(m.id,data,{trusted:true});}
  const c=packs.install(path.join(REPO,'packs/examples/cymatic-field'),data);packs.setTrust(c.id,data,{trusted:true});
  return data;
}
// The parent page's own frame pacing (requestAnimationFrame intervals), to show it stays responsive whatever the pack does.
const PACING=()=>{window.__pacing=[];let last=performance.now();const f=t=>{window.__pacing.push([t,t-last]);last=t;if(window.__pacing.length>20000)window.__pacing.splice(0,10000);requestAnimationFrame(f);};requestAnimationFrame(f);};
async function pacing(page,fromMs){return page.evaluate(from=>{const g=window.__pacing.filter(([t])=>t>=from).map(([,d])=>d).sort((a,b)=>a-b);
  return g.length?{frames:g.length,fps:+(1000/(g.reduce((s,v)=>s+v,0)/g.length)).toFixed(1),p95Ms:+g[Math.floor(g.length*.95)].toFixed(1),maxMs:+g.at(-1).toFixed(1)}:null;},fromMs);}
// Round trip of a trivial script call into the player page (its main thread's responsiveness, as a user would feel it).
async function roundTrip(page){const t=Date.now();await page.evaluate(()=>1);return Date.now()-t;}
const state=page=>page.evaluate(()=>({world:window.__qual.world(),stats:window.__qual.stats(),now:performance.now()}));
async function untilStopped(page,timeout=40000){
  await page.waitForFunction(()=>{const w=window.__qual.world();return /stopped/.test(w.notice)&&!w.remote&&w.frames===0&&!!window.__qual.stats();},null,{timeout});
  return state(page);
}
async function recipeOf(svc,project){return (await (await fetch(`http://127.0.0.1:${svc.port}/api/recipe?id=${project}`)).json());}
async function trust(svc,id,digest,trusted){
  const r=await fetch(`http://127.0.0.1:${svc.port}/api/packs/trust`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`http://127.0.0.1:${svc.port}`},body:JSON.stringify({id,digest,trusted})});
  if(!r.ok)throw new Error(await r.text());return r.json();
}
const pressRetry=page=>page.evaluate(()=>[...document.querySelectorAll('#dnaNotice button')].find(b=>b.textContent==='RETRY')?.click());
// Workers the browser reports (dedicated workers of every frame), to show a stopped pack's worker is gone.
async function workers(browserCdp){try{const {targetInfos}=await browserCdp.send('Target.getTargets');return targetInfos.filter(t=>t.type==='worker').length;}catch{return null;}}
// After a stop: the user is told, a built-in world runs, the recipe still names the pack, and nothing restarts by itself.
async function afterStop(label,page,svc,project,family,{expect,watchMs=12000}){
  const s=await state(page),recipe=await recipeOf(svc,project);
  check(`${label}: stopped with its reason shown; the built-in world took over; the recipe keeps the pack`,new RegExp(expect,'i').test(s.world.notice)&&!s.world.remote&&s.world.frames===0&&recipe.family===family,
    `“${s.world.notice}”; showing ${s.stats?.family} (built-in); recipe family ${recipe.family}`);
  await wait(watchMs);const later=await state(page);
  check(`${label}: no automatic restart (${watchMs/1000} s later still stopped)`,!later.world.remote&&later.world.frames===0&&/stopped/.test(later.world.notice),`${later.world.frames} pack frames`);
  return s;
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const data=dataset(),project=projectOf(data);
  const browser=await launch(GPU);
  try{
    measurements.renderer=await rendererOf(browser);
    if(GPU==='amd'&&!/AMD|Radeon/i.test(measurements.renderer))throw new Error(`Requested the AMD GPU but got ${measurements.renderer}`);
    const browserCdp=await browser.newBrowserCDPSession();
    await withService(data,async svc=>{
      // ---- 1. A pack far too slow for live playback (about 400 ms per frame) -------------------------------------
      await recipeAction(svc,project,{type:'family',family:'testing.slow-world'});
      {
        const {page,errors}=await playerPage(browser,svc,project);
        try{
          await page.evaluate(PACING);await worldReady(page,fixture('slow-world'));
          const from=(await state(page)).now,samples=[],seconds=QUICK?12:20;
          for(let i=0;i<seconds;i++){await wait(1000);const s=await state(page);const t=s.stats?.transport;
            samples.push({t:i+1,inFlight:t?.inFlight,queue:t?.queue,maxQueue:t?.maxQueue,sent:t?.sent,skippedHere:t?.skippedHere,skippedInFrame:t?.skippedInFrame,latencyMs:t?.latencyMs,
              semanticSent:t?.semantic,semanticHandled:s.stats?.semantic,rendered:s.stats?.rendered,renderMs:s.stats?.renderMs,roundTripMs:await roundTrip(page)});}
          const pace=await pacing(page,from);
          // Pause the replay, let the worker drain, then compare what was sent with what the worker handled.
          // Every semantic message sent by a moment T0 must have been handled by the pack two seconds later.
          const mark=(await state(page)).stats.transport.semantic;
          await page.evaluate(()=>document.getElementById('playBtn').click());await wait(3000);
          const end=await state(page),t=end.stats.transport;
          measurements.slow={samples,pacing:pace,final:{transport:t,workerSemantic:end.stats.semantic,workerRendered:end.stats.rendered,workerSkipped:end.stats.skipped},notice:end.world.notice};
          check('slow pack: at most one render request in flight, ever',samples.every(s=>s.inFlight<=1)&&t.inFlight<=1,`max ${Math.max(...samples.map(s=>s.inFlight))}`);
          check('slow pack: presentation frames are skipped, not queued (the worker queue stays short and drains)',t.skippedHere>0&&t.maxQueue<=64&&t.queue<=2,
            `${t.sent} renders sent, ${t.skippedHere} skipped in the player, ${t.skippedInFrame} obsolete in the worker; worker queue max ${t.maxQueue}, now ${t.queue}; render ${end.stats.renderMs} ms, latency ${t.latencyMs} ms (max ${t.maxLatencyMs})`);
          check('slow pack: every semantic event reaches the pack (none lost while frames are skipped)',mark>0&&end.stats.semantic>=mark&&end.stats.semantic<=t.semantic,
            `${mark} sent by T0, ${end.stats.semantic} handled by T0 + 3 s (${t.semantic} sent by then)`);
          check('slow pack: the player stays responsive (its own frame pacing and script round trips)',pace&&pace.p95Ms<=50&&Math.max(...samples.map(s=>s.roundTripMs))<=250,
            pace?`player ${pace.fps} fps, p95 interval ${pace.p95Ms} ms, max ${pace.maxMs} ms; round trip max ${Math.max(...samples.map(s=>s.roundTripMs))} ms`:'no pacing');
          check('slow pack: still running (slow, not stuck: above the 1 frame/s floor) and the user is warned it exceeds its declared budget',end.world.remote&&/exceeds its declared budget/.test(end.world.notice),`“${end.world.notice}”`);
          check('slow pack: no page errors',!errors.length,errors.slice(0,2).join(' | ')||'none');
          // World switching while a slow render is pending: dispose mid-render, again and again.
          if(!QUICK){
            await page.evaluate(()=>document.getElementById('playBtn').click());
            const heap0=await page.evaluate(()=>performance.memory?.usedJSHeapSize/1048576);
            for(let i=0;i<6;i++){
              await page.evaluate(()=>window.__qual.action({type:'family',family:'stellar-forge'}));await worldReady(page,{remote:false,family:'stellar-forge'});await wait(500);
              await page.evaluate(()=>window.__qual.action({type:'family',family:'testing.slow-world'}));await worldReady(page,fixture('slow-world'));await wait(300+i*150);
            }
            await wait(2000);const after=await state(page),heap1=await page.evaluate(()=>performance.memory?.usedJSHeapSize/1048576);
            measurements.switching={heapMb:[+heap0.toFixed(1),+heap1.toFixed(1)],frames:after.world.frames};
            check('world switching while renders are pending (6 round trips): one pack frame left, no errors, memory bounded',after.world.frames===1&&after.world.remote&&!errors.length&&heap1<heap0*1.5+20,
              `${after.world.frames} pack frame, JS heap ${heap0.toFixed(1)} → ${heap1.toFixed(1)} MB${errors.length?`; ${errors[0]}`:''}`);
          }
        }finally{await page.close();}
      }
      // ---- 2. A pack that hangs (an endless loop 10 s after it starts) ----------------------------------------------
      await recipeAction(svc,project,{type:'family',family:'testing.hanging-world'});
      {
        const {page,errors}=await playerPage(browser,svc,project);
        try{
          await page.evaluate(PACING);await worldReady(page,fixture('hanging-world'));
          const workersRunning=await workers(browserCdp);
          // The last moment the pack answered: when its acknowledgement count stopped growing.
          let lastAck={count:-1,at:0},noticeAt=null;const trips=[];const began=Date.now();
          while(Date.now()-began<40000){const s=await state(page);if(/stopped/.test(s.world.notice)){noticeAt=s.now;break;}
            const n=s.stats?.transport?.acknowledged??0;if(n!==lastAck.count)lastAck={count:n,at:s.now};trips.push(await roundTrip(page));await wait(100);}
          const stopped=await untilStopped(page,15000).catch(()=>null);
          // Chromium force-terminates a worker stuck in a loop some time after its frame is removed: poll for it now.
          let goneAt=null;for(let i=0;i<100&&goneAt===null;i++){const n=await workers(browserCdp);if(n===null)break;if(n<workersRunning)goneAt=(await state(page)).now;else await wait(100);}
          // The stop's own time (the player records it), and how long removing the frame took.
          const lastStop=stopped?.world.lastStop||null;const stopAt=lastStop?.at??noticeAt;
          const window_=([a,b])=>{const g=window.__pacing.filter(([t])=>t>=a&&t<=b).map(([,d])=>d).sort((x,y)=>x-y);
            return g.length?{frames:g.length,fps:+(1000/(g.reduce((s,v)=>s+v,0)/g.length)).toFixed(1),p95Ms:+g[Math.floor(g.length*.95)].toFixed(1),maxMs:+g.at(-1).toFixed(1)}:null;};
          const pace=stopAt!==null?await page.evaluate(window_,[lastAck.at,stopAt]):null,recovery=stopAt!==null&&stopped?await page.evaluate(window_,[stopAt,stopped.now]):null;
          const detectMs=stopAt!==null?Math.round(stopAt-lastAck.at):null,recoverMs=stopped&&stopAt!==null?Math.round(stopped.now-stopAt):null;
          measurements.hang={detectMs,recoverMs,disposeMs:lastStop?.disposeMs??null,workerGoneMs:goneAt!==null&&stopAt!==null?Math.round(goneAt-stopAt):null,
            pacingDuringHang:pace,pacingDuringStopAndRecovery:recovery,roundTripMaxMs:Math.max(...trips),workersBefore:workersRunning};
          check('hanging pack: the watchdog stops it within the live timeout (6 s + one 0.5 s watchdog tick) of its last answer',detectMs!==null&&detectMs<=6700,
            `stopped ${detectMs} ms after the last acknowledgement seen (polled every 100 ms); disposal took ${lastStop?.disposeMs} ms; built-in world running ${recoverMs} ms after the stop`);
          check('hanging pack: the player kept running during the hang (its frame pacing and script round trips)',pace&&pace.p95Ms<=50&&Math.max(...trips)<=250,
            pace?`player ${pace.fps} fps, p95 ${pace.p95Ms} ms, max ${pace.maxMs} ms over ${pace.frames} frames; round trip max ${Math.max(...trips)} ms; stop and recovery: max frame ${recovery?.maxMs} ms`:'no pacing');
          check('hanging pack: its stuck worker is terminated (by the browser, within 10 s of the stop)',goneAt!==null,
            goneAt!==null?`gone ${measurements.hang.workerGoneMs} ms after the stop`:'still running 10 s after the stop');
          if(stopped)await afterStop('hanging pack',page,svc,project,'testing.hanging-world',{expect:'stopped answering',watchMs:QUICK?6000:12000});
          check('hanging pack: no page errors',!errors.length,errors.slice(0,2).join(' | ')||'none');
        }finally{await page.close();}
      }
      // ---- 3. A pack that throws (10 s after it starts); RETRY restarts it once per press ---------------------------
      await recipeAction(svc,project,{type:'family',family:'testing.failing-world'});
      {
        const {page,errors}=await playerPage(browser,svc,project);
        try{
          await worldReady(page,fixture('failing-world'));const t0=Date.now();
          await untilStopped(page);const failedAfter=(Date.now()-t0)/1000;
          await afterStop('failing pack',page,svc,project,'testing.failing-world',{expect:'deliberate failure',watchMs:QUICK?6000:12000});
          measurements.failure={failedAfterS:+failedAfter.toFixed(1)};
          if(!QUICK){
            await pressRetry(page);await worldReady(page,fixture('failing-world'),30000);const restarted=await state(page);
            await untilStopped(page);const again=await state(page);
            check('failing pack: RETRY runs it again; when it fails again it is stopped again (no loop)',restarted.world.remote&&/deliberate failure/.test(again.world.notice)&&again.world.frames===0,`“${again.world.notice}”`);
          }
          check('failing pack: no page errors',!errors.length,errors.slice(0,2).join(' | ')||'none');
        }finally{await page.close();}
      }
      if(QUICK)return;
      // ---- 4. A pack that loses its GPU context --------------------------------------------------------------------
      await recipeAction(svc,project,{type:'family',family:'testing.context-loss-world'});
      {
        const {page,errors}=await playerPage(browser,svc,project);
        try{
          await worldReady(page,fixture('context-loss-world'));
          const stopped=await untilStopped(page).catch(()=>null);
          if(stopped)await afterStop('GPU context loss',page,svc,project,'testing.context-loss-world',{expect:'GPU context was lost',watchMs:6000});
          else check('GPU context loss: the pack is stopped',false,JSON.stringify((await state(page)).world));
          check('GPU context loss: no page errors',!errors.length,errors.slice(0,2).join(' | ')||'none');
        }finally{await page.close();}
      }
      // ---- 5. A hostile probe: isolation from where pack code runs, then a flood of spoofed messages -------------------
      {
        const hits=[],sink=http.createServer((req,res)=>{hits.push(`${req.method} ${req.url}`);res.end('ok');});
        sink.on('upgrade',req=>hits.push(`UPGRADE ${req.url}`));await new Promise(r=>sink.listen(0,'127.0.0.1',r));
        const copy=fs.mkdtempSync(path.join(os.tmpdir(),'cr-probe-'));fs.cpSync(path.join(REPO,'packs/testing/probe-world'),copy,{recursive:true});
        const src=path.join(copy,'world.js');fs.writeFileSync(src,fs.readFileSync(src,'utf8').replace('const RECEIVER_PORT=0,LISTENER_PORT=0;',`const RECEIVER_PORT=${svc.port},LISTENER_PORT=${sink.address().port};`));
        const m=packs.install(copy,data);packs.setTrust(m.id,data,{trusted:true});
        await recipeAction(svc,project,{type:'family',family:'testing.probe-world'});
        const {page,errors}=await playerPage(browser,svc,project);
        try{
          await worldReady(page,fixture('probe-world'));
          await page.waitForFunction(()=>window.__qual.stats()?.probeDone===true||/stopped/.test(window.__qual.world().notice),null,{timeout:30000}).catch(()=>{});
          const s=(await state(page)).stats||{},probes=Object.fromEntries(Object.entries(s).filter(([k])=>k.startsWith('probe_')).map(([k,v])=>[k.slice(6),v]));
          measurements.probe={probes,hits:[...hits]};
          const reached=Object.entries(probes).filter(([k,v])=>k!=='origin'&&v!=='blocked');
          check('isolation (from the pack worker): receiver, outside network, sockets, scripts, eval, DOM, parent, WebRTC, storage, nested workers, navigation all blocked',
            Object.keys(probes).length>=14&&!reached.length&&!hits.length,`${Object.keys(probes).length-1} probes; reached: ${reached.map(([k,v])=>`${k}=${v}`).join(', ')||'none'}; outside listener hits: ${hits.length}; origin “${probes.origin}”`);
          const stopped=await untilStopped(page,20000).catch(()=>null);
          check('message flood: the relay terminates a worker posting thousands of spoofed messages, and the pack is stopped',stopped&&/flooded/.test(stopped.world.notice),stopped?`“${stopped.world.notice}”`:'not stopped');
          check('probe: no page errors',!errors.length,errors.slice(0,2).join(' | ')||'none');
        }finally{await page.close();sink.close();fs.rmSync(copy,{recursive:true,force:true});}
      }
      // ---- 6. Approval revoked, files modified, frame navigated, tab hidden: Cymatic Field running ----------------------
      const cymatic={remote:true,family:'halcyon.cymatic-field'};
      await recipeAction(svc,project,{type:'family',family:cymatic.family});
      {
        const {page,errors}=await playerPage(browser,svc,project);
        const entry=()=>packs.createRegistry(data).get(cymatic.family);
        try{
          await worldReady(page,cymatic);await wait(1000);
          let t=Date.now();await trust(svc,cymatic.family,entry().digest,false);
          await untilStopped(page,15000).catch(()=>null);let s=await state(page);
          check('approval revoked while running: stopped within the pack list refresh (5 s)',/approval was revoked/.test(s.world.notice)&&!s.world.remote&&s.world.frames===0,`${Date.now()-t} ms · “${s.world.notice}”`);
          await trust(svc,cymatic.family,entry().digest,true);await pressRetry(page);await worldReady(page,cymatic,30000);await wait(1000);
          const file=path.join(data,'packs',cymatic.family,'world.js'),original=fs.readFileSync(file);
          t=Date.now();fs.appendFileSync(file,'\n// modified after approval\n');
          await untilStopped(page,15000).catch(()=>null);s=await state(page);
          const served=await fetch(`http://127.0.0.1:${svc.port}/api/packs/file?id=${cymatic.family}&path=world.js`);
          check('files modified while running: stopped within the refresh, and the modified file is never served',/files changed/.test(s.world.notice)&&!s.world.remote&&served.status!==200,
            `${Date.now()-t} ms · “${s.world.notice}” · file request HTTP ${served.status}`);
          fs.writeFileSync(file,original);await wait(1500);await pressRetry(page);await worldReady(page,cymatic,30000);await wait(1000);
          // Navigation of the frame itself (pack code runs in a worker and cannot do this; the player still watches).
          const frame=page.frames().find(f=>f.url().endsWith('/pack-frame.html'));
          await frame?.evaluate(()=>location.reload()).catch(()=>{});
          await untilStopped(page,10000).catch(()=>null);s=await state(page);
          check('frame navigation: a pack frame that navigates is stopped at once',/navigated away/.test(s.world.notice)&&s.world.frames===0,`“${s.world.notice}”`);
          // Inactive tab: no watchdog verdicts while hidden (browsers throttle hidden pages); judged again when visible.
          await page.evaluate(()=>window.__qual.action({type:'family',family:'testing.hanging-world'}));await worldReady(page,fixture('hanging-world'),30000);
          const setHidden=hidden=>page.evaluate(h=>{Object.defineProperty(document,'hidden',{value:h,configurable:true});Object.defineProperty(document,'visibilityState',{value:h?'hidden':'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));},hidden);
          await setHidden(true);await wait(22000);const hidden=await state(page);
          await setHidden(false);t=Date.now();await untilStopped(page,15000).catch(()=>null);s=await state(page);
          check('inactive tab: no verdict while hidden (12 s into a hang), stopped once visible again',hidden.world.remote&&!/stopped/.test(hidden.world.notice)&&/stopped answering/.test(s.world.notice),
            `hidden: ${hidden.world.remote?'still running':'stopped'}; visible: stopped after ${Date.now()-t} ms (“${s.world.notice}”)`);
          check('revocation, modification, navigation, hidden tab: no page errors',!errors.length,errors.slice(0,2).join(' | ')||'none');
        }finally{await page.close();}
      }
      // ---- 7. Films: a frame that never arrives is an explicit error, never a missing or wrong frame -----------------
      await recipeAction(svc,project,{type:'family',family:'testing.hanging-world'});
      {
        const {page,info}=await filmPage(browser,svc,project,{width:640,height:360});
        try{
          let t=info.start,error=null,frames=0;const began=Date.now();
          while(Date.now()-began<120000){try{await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/30]);frames++;t+=1000/30;}catch(e){error=String(e.message||e);break;}}
          check('film: a pack that stops answering makes the film call fail with an explicit error (no frame substituted)',/did not answer within 60 s/.test(error||''),`${frames} frames rendered, then: ${(error||'no error').split('\n')[0].slice(0,160)}`);
        }finally{await page.close();}
      }
    });
  }finally{await browser.close();}
  finish();
})().catch(e=>{console.error(e);check('robustness qualification completed',false,String(e.message||e).slice(0,300));finish();});
function finish(){
  fs.mkdirSync(OUT,{recursive:true});
  const file=path.join(OUT,`robustness-qualification${GPU?`-${GPU}`:''}${QUICK?'-quick':''}.json`);
  fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),gpu:GPU||'swiftshader',renderer:measurements.renderer,checks,measurements},null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed · ${path.relative(process.cwd(),file)}`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
}

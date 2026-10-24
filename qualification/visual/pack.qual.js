'use strict';
// Visual pack compatibility tests in a real browser (what `node scripts/pack.js test <dir>` runs).
// The pack is installed into temporary copies of recorded projects (and approved there: you are testing your own
// pack; nothing is installed into your receiver). Checks: manifest and installation; isolation of code packs (the
// pack frame cannot reach the receiver, storage or the player); real semantic events; streamer privacy of every
// label; idle life; music synchronisation; project-specific recipes; deterministic replay; resource release when
// the world is switched away and back; and the performance budget the manifest declares (total rendering cost:
// scene draw calls, all passes, triangles, points, CPU time, frame rate, adaptive quality).
//
// node visual/pack.qual.js <pack dir> [--gpu amd] [--quick] [--datasets results/datasets] [--out results/visual]
// --quick (CI): the session at 2 fps, 30 s of idle, two world switches, no determinism pair, performance at 1280×720 only.
// Datasets: the Lumen Recipes recording (always available: copied from qualification/recordings), plus results/
// datasets/self or excalidraw when built (visual/datasets.js) for a second, structurally different project.
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {REPO,projectOf,launch,rendererOf,withService,recipeAction,filmPage,thumb,diff,sha,checker}=require('./harness');
const packs=require(path.join(REPO,'engine/packs'));
const {lumen}=require('./datasets');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const SOURCE=path.resolve(process.argv[2]||'');
const GPU=arg('gpu',null),QUICK=process.argv.includes('--quick');
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','visual')));
const {checks,check}=checker();const measurements={};
const IDENTIFIER=/\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b|[\\/]|\.(?:[jt]sx?|json|css|md|py)\b/;
function dataset(name){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),`cr-pack-${name}-`));
  if(name==='lumen'){lumen(dir);fs.renameSync(path.join(dir,'lumen'),path.join(dir,'d'));return path.join(dir,'d');}
  fs.cpSync(path.join(DATA,name),path.join(dir,'d'),{recursive:true});return path.join(dir,'d');
}
// How the pack is chosen for a project: as its family (world pack) or as a look on its base family.
const choose=(svc,project,m)=>recipeAction(svc,project,m.kind==='world'?{type:'family',family:m.id}:{type:'pack',pack:m.id});
async function play(page,from,to,fps,each){await page.evaluate(x=>window.__film.seek(x),from);let img;for(let t=from;t<=to;t+=1000/fps){img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/fps]);if(each)await each(t,img);}return img;}
(async()=>{
  if(!fs.existsSync(path.join(SOURCE,'pack.json')))throw new Error('usage: pack.qual.js <pack dir> [--gpu amd]');
  const report=packs.inspect(SOURCE);const m=report.manifest||{};
  measurements.pack={id:m.id,version:m.version,kind:m.kind,digest:report.digest,files:report.files.length};
  check('manifest: valid and compatible with SDK '+packs.SDK_VERSION,!report.errors.length,report.errors.map(e=>`${e.at}: ${e.message}`).slice(0,4).join(' | ')||`${m.id} ${m.version} (${m.kind})`);
  if(report.errors.length){finish();return;}
  const code=packs.executable(m.kind);
  const lumenDir=dataset('lumen');
  const installed=packs.install(SOURCE,lumenDir);
  check('install: files copied and recorded; a pack with code starts unapproved',installed.digest===report.digest&&(!code||!installed.trusted),
    `digest ${installed.digest.slice(0,16)}, ${code?'contains code: not approved until the user allows it':'data only: no approval needed'}`);
  if(code)packs.setTrust(m.id,lumenDir,{trusted:true});
  const browser=await launch(GPU);
  try{
    measurements.renderer=await rendererOf(browser);
    if(GPU==='amd'&&!/AMD|Radeon/i.test(measurements.renderer))throw new Error(`Requested the AMD GPU but got ${measurements.renderer}`);
    await withService(lumenDir,async svc=>{
      const project=projectOf(lumenDir);const recipe=await choose(svc,project,m);
      measurements.recipe={family:recipe.family,pack:recipe.pack,params:recipe.genome.params||null,uniforms:recipe.genome.uniforms||null};
      const unavailable=(await (await fetch(`http://127.0.0.1:${svc.port}/api/recipe?id=${project}&fallback=1`)).json()).family;
      const {page,info,errors}=await filmPage(browser,svc,project,{width:1280,height:720});
      const folder=(await (await fetch(`http://127.0.0.1:${svc.port}/api/projects`)).json()).projects.find(p=>p.id===project)?.name||'lumen-recipes';
      check('runtime: the player runs the pack '+(code?'inside the isolated pack frame':'in the built-in world it tunes'),code?info.recipe&&(await page.evaluate(()=>document.querySelectorAll('iframe.pack-frame').length))===1:!!info.webgl,
        code?`fallback while unapproved: ${unavailable}`:'no frame needed');
      // ---- Isolation (code packs): probes run inside the pack frame (on their own page), aimed at the receiver and at
      // an outside listener; the listener must receive nothing.
      if(code){
        const http=require('node:http'),hits=[];const sink=http.createServer((req,res)=>{hits.push(`${req.method} ${req.url}`);res.end('ok');});
        await new Promise(r=>sink.listen(0,'127.0.0.1',r));const sinkPort=sink.address().port;
        const probe=await filmPage(browser,svc,project,{width:640,height:360});
        const frame=probe.page.frames().find(f=>f.url().endsWith('/pack-frame.html'));
        const probes=frame?await frame.evaluate(async([port,sinkPort])=>{
          const out=`http://127.0.0.1:${sinkPort}`;
          const attempt=async f=>{try{const r=await f();return r===undefined?'reached':`reached: ${String(r).slice(0,40)}`;}catch(e){return 'blocked';}};
          const r={
            fetchReceiver:await attempt(()=>fetch('/api/projects').then(r=>r.status)),
            fetchOutside:await attempt(()=>fetch(`${out}/fetch`).then(r=>r.status)),
            xhr:await attempt(()=>new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('GET',`${out}/xhr`);x.onload=()=>res(x.status);x.onerror=()=>rej(new Error('blocked'));x.send();})),
            websocket:await attempt(()=>new Promise((res,rej)=>{const w=new WebSocket(`ws://127.0.0.1:${sinkPort}/ws`);w.onopen=()=>res('open');w.onerror=()=>rej(new Error('blocked'));setTimeout(()=>rej(new Error('blocked')),1500);})),
            importApi:await attempt(()=>import('/api/projects')),
            importOutside:await attempt(()=>import(`${out}/import.js`)),
            parentDocument:await attempt(()=>window.parent.document.title),
            localStorage:await attempt(()=>window.localStorage.length),
            cookie:await attempt(()=>document.cookie),
            webrtc:typeof RTCPeerConnection==='undefined'?'blocked':'reached',
            // The frame starts workers (that is how packs run); a worker inherits the frame's policy, so it cannot connect.
            workerNetwork:await attempt(()=>new Promise((res,rej)=>{const w=new Worker(URL.createObjectURL(new Blob([`fetch('${out}/nested').then(()=>postMessage('reached'),()=>postMessage('blocked'))`],{type:'text/javascript'})));
              w.onmessage=e=>e.data==='reached'?res('reached'):rej(new Error('blocked'));w.onerror=()=>rej(new Error('blocked'));setTimeout(()=>rej(new Error('blocked')),2000);})),
            popup:window.open(`${out}/popup`)?'reached':'blocked'
          };
          // Fire-and-forget channels: their effect is checked at the listener.
          navigator.sendBeacon(`${out}/beacon`,'x');const img=new Image();img.src=`${out}/image`;
          const link=document.createElement('link');link.rel='prefetch';link.href=`${out}/prefetch`;document.head.append(link);
          await new Promise(res=>setTimeout(res,2000));return r;},[svc.port,sinkPort]):null;
        // Where pack code actually runs: the pack worker (SDK 1.1). The same attempts, from its global scope.
        const worker=probe.page.workers().find(w=>w.url().startsWith('blob:null/'));
        const workerProbes=worker?await worker.evaluate(async([port,sinkPort])=>{
          const out=`http://127.0.0.1:${sinkPort}`;
          const attempt=async f=>{try{const r=await f();return r===undefined?'reached':`reached: ${String(r).slice(0,40)}`;}catch(e){return 'blocked';}};
          return {
            fetchReceiver:await attempt(()=>fetch(`http://127.0.0.1:${port}/api/projects`).then(r=>r.status)),
            fetchOutside:await attempt(()=>fetch(`${out}/worker-fetch`).then(r=>r.status)),
            xhr:await attempt(()=>new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('GET',`${out}/worker-xhr`);x.onload=()=>res(x.status);x.onerror=()=>rej(new Error('blocked'));x.send();})),
            websocket:await attempt(()=>new Promise((res,rej)=>{const w=new WebSocket(`ws://127.0.0.1:${sinkPort}/worker-ws`);w.onopen=()=>res('open');w.onerror=()=>rej(new Error('blocked'));setTimeout(()=>rej(new Error('blocked')),1500);})),
            scriptReceiverApi:await attempt(()=>importScripts(`http://127.0.0.1:${port}/api/projects`)),
            scriptOutside:await attempt(()=>importScripts(`${out}/worker-script.js`)),
            moduleOutside:await attempt(()=>import(`${out}/worker-module.js`)),
            indexedDB:await new Promise(res=>{try{const r=indexedDB.open('probe');r.onsuccess=()=>res('reached');r.onerror=()=>res('blocked');}catch(e){res('blocked');}}),
            cacheStorage:await attempt(()=>caches.open('probe').then(()=>'opened')),
            document:typeof document==='undefined'?'blocked':'reached',
            parentWindow:typeof parent==='undefined'&&typeof window==='undefined'?'blocked':'reached',
            webrtc:typeof RTCPeerConnection==='undefined'?'blocked':'reached',
            navigation:typeof location.assign==='function'?'reached':'blocked',
            nestedWorkerNetwork:await attempt(()=>new Promise((res,rej)=>{const w=new Worker(URL.createObjectURL(new Blob([`fetch('${out}/worker-nested').then(()=>postMessage('reached'),()=>postMessage('blocked'))`],{type:'text/javascript'})));
              w.onmessage=e=>e.data==='reached'?res('reached'):rej(new Error('blocked'));w.onerror=()=>rej(new Error('blocked'));setTimeout(()=>rej(new Error('blocked')),2000);}))
          };},[svc.port,sinkPort]):null;
        await new Promise(r=>setTimeout(r,500));
        measurements.isolation={probes,workerProbes,outsideRequests:[...hits]};
        check('isolation (pack worker, where pack code runs): no receiver, network, sockets, outside scripts, storage, DOM, parent, WebRTC or navigation',
          workerProbes&&Object.values(workerProbes).every(v=>v==='blocked'),workerProbes?JSON.stringify(workerProbes):'pack worker not found');
        check('isolation (pack frame): nothing reaches the receiver or an outside listener; no storage, cookies, player, WebRTC, networked workers or popups',
          probes&&Object.values(probes).every(v=>v==='blocked')&&!hits.length,`${JSON.stringify(probes)} · outside listener received ${hits.length}`);
        const origin=frame?await frame.evaluate(()=>window.origin):null;
        check('isolation: the pack frame has an opaque origin',origin==='null',String(origin));
        // The frame document navigating itself (pack code runs in the worker and cannot; the test does it directly):
        // the player must still stop the pack at once.
        await frame.evaluate(o=>{location.href=o;},`http://127.0.0.1:${sinkPort}/navigate`).catch(()=>{});
        await probe.page.waitForTimeout(1500);
        const stopped=await probe.page.evaluate(()=>document.querySelectorAll('iframe.pack-frame').length===0||!!window.__film.stats()?.remote===false);
        const notice=await probe.page.evaluate(()=>document.getElementById('dnaNotice')?.textContent||'');
        measurements.isolation.selfNavigation={reachedListener:hits.some(h=>h.includes('/navigate')),noticed:notice};
        check('isolation: a pack frame that navigates away is stopped by the player (pack code cannot navigate: it runs in a worker)',/navigated/.test(notice)||stopped,
          `navigation request ${measurements.isolation.selfNavigation.reachedListener?'reached':'did not reach'} the listener; player: ${notice||'(no notice)'}`);
        await probe.page.close();sink.close();
      }
      // ---- The whole recorded session at 4 fps: events, labels, privacy.
      const labels=new Set();let frames=0;
      await play(page,info.start,info.end,QUICK?2:4,async t=>{frames++;if(frames%(QUICK?6:12)===0)for(const s of await page.evaluate(()=>window.__film.labels()))labels.add(s);});
      const stats=await page.evaluate(()=>window.__film.stats());
      measurements.session={frames,effects:stats?.effects||{},world:Object.fromEntries(Object.entries(stats||{}).filter(([k,v])=>typeof v!=='object'))};
      const expressed=Object.keys(stats?.effects||{});
      const vocabulary=m.kind==='world'?m.world.effects:m.kind==='declarative'&&m.declarative.effects?m.declarative.effects:{};
      check('events: the world received and expressed the recording\'s semantic events',expressed.length>=5,`${expressed.length} effects: ${Object.entries(stats?.effects||{}).map(([k,v])=>`${k}×${v}`).join(', ')}`);
      if(m.kind==='world')check('events: failures and verified milestones are expressed with the pack\'s own effects',expressed.includes(vocabulary['validation.failed'])&&expressed.includes(vocabulary['milestone.achieved']),
        `${vocabulary['validation.failed']} / ${vocabulary['milestone.achieved']}`);
      const leaks=[...labels].filter(s=>s.toLowerCase().includes(folder.toLowerCase())||IDENTIFIER.test(s)||/\b[0-9a-f]{12,}\b/.test(s));
      measurements.labels=[...labels].sort();
      check('privacy: no label shows the folder name, a path, a file name, an identifier or a raw id',labels.size>0&&!leaks.length,leaks.slice(0,3).join(' | ')||`${labels.size} label strings`);
      // ---- Idle: after the last event the image keeps changing while structure and history stay the same.
      const end=info.end,samples=[];await page.evaluate(x=>window.__film.seek(x),end+2000);let t=end+2000;
      for(const at of QUICK?[10,25,40]:[10,40,70,100]){let img;for(;t<=end+at*1000;t+=1000/4)img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,.25]);samples.push({img:await thumb(page,img),stats:await page.evaluate(()=>window.__film.stats())});}
      const motion=samples.slice(1).map((s,i)=>+diff(samples[i].img,s.img).toFixed(2));
      measurements.idle={motion,phases:samples.map(s=>s.stats?.phase)};
      check(`idle: the image keeps moving for ${QUICK?30:90} s without events`,motion.every(x=>x>.5),`mean |Δluma| ${motion.join(', ')}`);
      check('idle: nothing new happens (history unchanged, director idle)',samples.every(s=>s.stats?.intents===samples[0].stats?.intents)&&samples.slice(1).every(s=>s.stats?.phase==='idle'),samples.map(s=>`${s.stats?.intents}/${s.stats?.phase}`).join(', '));
      // ---- Music: the same moment rendered on and off the beat.
      const beatAt=info.start+120000;await page.evaluate(x=>window.__film.seek(x),beatAt-1000);
      for(let x=beatAt-1000;x<beatAt;x+=250)await page.evaluate(([x])=>window.__film.frame(x,.25,0),[x]);
      const onBeat=await thumb(page,await page.evaluate(([x])=>window.__film.frame(x,0,0),[beatAt])),offBeat=await thumb(page,await page.evaluate(([x])=>window.__film.frame(x,0,.5),[beatAt]));
      measurements.music={difference:+diff(onBeat,offBeat).toFixed(2)};
      check('music: the image follows the beat (same moment on and off the beat differs)',measurements.music.difference>.15,`mean |Δluma| ${measurements.music.difference}`);
      check('no page errors during the session',!errors.length,errors.slice(0,2).join(' | '));
      // ---- Determinism: two sessions, the second first plays another moment.
      const moment=info.start+150000,shots=[];
      for(let k=0;k<(QUICK?0:2);k++){const f=await filmPage(browser,svc,project,{width:960,height:540});if(k===1)await play(f.page,info.end-4000,info.end,4);
        shots.push(await play(f.page,moment-3000,moment,8));await f.page.close();}
      if(!QUICK)check('determinism: the same moment renders the same frame regardless of seek history',shots[0]===shots[1],`${sha(shots[0])} / ${sha(shots[1])}`);
      // ---- Resources: switch to a built-in family and back, four times.
      const cycles=[];const heap=()=>page.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null);
      const away=m.kind==='world'?{type:'family',family:'stellar-forge'}:{type:'pack',pack:null},back=m.kind==='world'?{type:'family',family:m.id}:{type:'pack',pack:m.id};
      for(let k=0;k<(QUICK?2:4);k++){
        const a=await page.evaluate(x=>window.__film.recipeAction(x),away);await play(page,moment,moment+500,4);
        const b=await page.evaluate(x=>window.__film.recipeAction(x),back);await play(page,moment,moment+500,4);
        const s=await page.evaluate(()=>window.__film.stats());cycles.push({awayFrames:a.frames,backFrames:b.frames,geometries:s?.geometries,textures:s?.textures,programs:s?.programs,heapMB:await heap()});
      }
      measurements.resources=cycles;
      const first=cycles[0],last=cycles.at(-1);
      check('resources: switching away removes the pack frame and switching back creates exactly one',cycles.every(c=>c.awayFrames===0&&c.backFrames===(code?1:0)),cycles.map(c=>`${c.awayFrames}/${c.backFrames}`).join(' '));
      check(`resources: GPU objects return to their level after ${cycles.length} switches`,last.geometries<=first.geometries&&last.textures<=first.textures,`geometries ${first.geometries}->${last.geometries}, textures ${first.textures}->${last.textures}, programs ${first.programs}->${last.programs}`);
      check('resources: the player\'s heap does not grow with switches (within 25 MB)',first.heapMB===null||last.heapMB-first.heapMB<25,`${first.heapMB} -> ${last.heapMB} MB`);
      await page.close();
    });
    // ---- Project-specific recipe: a structurally different project gets a different identity from the same pack.
    const other=['self','excalidraw'].find(n=>fs.existsSync(path.join(DATA,n)));
    if(other){
      const dir=dataset(other);packs.install(SOURCE,dir);if(code)packs.setTrust(m.id,dir,{trusted:true});
      await withService(dir,async svc=>{
        const project=projectOf(dir),r=await choose(svc,project,m);
        const a=JSON.stringify({p:measurements.recipe.params,u:measurements.recipe.uniforms}),b=JSON.stringify({p:r.genome.params||null,u:r.genome.uniforms||null});
        measurements.otherProject={dataset:other,params:r.genome.params||null,uniforms:r.genome.uniforms||null};
        check(`recipe: another project (${other}) gets its own parameters from the same pack`,m.kind==='declarative'?true:a!==b,m.kind==='declarative'?'declarative overrides apply to the base family\'s project-specific genome':`${a.slice(0,120)} / ${b.slice(0,120)}`);
      });
    }
    // ---- Performance: the live player at 1920x1080 on the largest available project.
    const big=['excalidraw','self'].find(n=>fs.existsSync(path.join(DATA,n)));
    const perfDir=big?dataset(big):lumenDir;if(big){packs.install(SOURCE,perfDir);if(code)packs.setTrust(m.id,perfDir,{trusted:true});}
    await withService(perfDir,async svc=>{
      const project=projectOf(perfDir);await choose(svc,project,m);measurements.performance={dataset:big||'lumen'};
      for(const [label,query] of QUICK?[['full','&adapt=0']]:[['full','&adapt=0'],['adaptive','']]){
        const page=await browser.newPage({viewport:QUICK?{width:1280,height:720}:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
        await page.goto(`http://127.0.0.1:${svc.port}/?overlay=1&labels=off&project=${project}&world=living${query}`);
        await page.waitForFunction(()=>window.__worldStats?.()?.drawCalls>0,null,{timeout:90000});
        await page.waitForTimeout(label==='adaptive'?14000:4000);
        const a=await page.evaluate(()=>({s:window.__worldStats(),t:performance.now()}));await page.waitForTimeout(QUICK?4000:8000);const b=await page.evaluate(()=>({s:window.__worldStats(),t:performance.now()}));
        // Frame rate where the world renders: the pack frame counts its frames; the in-page host is measured by rAF.
        const fps=b.s.rendered!==undefined?(b.s.rendered-a.s.rendered)/((b.s.now-a.s.now)/1000):await page.evaluate(()=>new Promise(r=>{let n=0;const s=performance.now();const f=()=>{n++;performance.now()-s<6000?requestAnimationFrame(f):r(n/6);};requestAnimationFrame(f);}));
        const s=b.s;measurements.performance[label]={fps:+fps.toFixed(1),quality:s.quality,drawCalls:s.drawCalls,passes:s.passes,triangles:s.triangles,points:s.points,updateMs:s.updateMs,drawMs:s.drawMs,gpuMs:s.gpuMs??null,geometries:s.geometries,textures:s.textures,programs:s.programs,errors:errors.slice(0,2)};
        await page.close();
      }
      const p=measurements.performance.full,budget=(m.world||m.shader||{}).budget||{drawCalls:40,passes:40,triangles:2000000,points:500000,updateMs:8};
      const over=Object.entries({drawCalls:p.drawCalls,passes:p.passes,triangles:p.triangles,points:p.points,updateMs:p.updateMs}).filter(([k,v])=>budget[k]!==undefined&&v>budget[k]);
      check('performance: within the declared budget (scene draw calls, all passes, triangles, points, CPU update time)',!over.length,
        over.length?over.map(([k,v])=>`${k} ${v} > ${budget[k]}`).join(', '):`${p.drawCalls} draw calls, ${p.passes} passes, ${p.triangles} triangles, ${p.points} points, update ${p.updateMs} ms`);
      const adaptive=measurements.performance.adaptive;
      check('performance: frame rate, GPU time and adaptive quality measured',p.fps>0,`${p.fps} fps full quality (GPU ${p.gpuMs===null?'time not exposed by this driver':`${p.gpuMs} ms per frame`})${adaptive?`, ${adaptive.fps} fps adaptive (level ${adaptive.quality})`:''} on ${measurements.renderer}`);
      check('no page errors in the live player',!p.errors.length&&!adaptive?.errors.length,[...p.errors,...(adaptive?.errors||[])].join(' | '));
    });
  }finally{await browser.close();}
  finish();
})().catch(e=>{console.error(e);process.exitCode=1;});
function finish(){
  fs.mkdirSync(OUT,{recursive:true});
  const id=measurements.pack?.id||'invalid',file=path.join(OUT,`pack-${id}${GPU?`-${GPU}`:''}${QUICK?'-quick':''}.json`);
  fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),sdk:packs.SDK_VERSION,gpu:GPU||'swiftshader',checks,measurements},null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed · ${path.relative(process.cwd(),file)}`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
}

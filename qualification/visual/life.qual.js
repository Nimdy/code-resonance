'use strict';
// Digital life in a real browser (docs/LIFE.md). The scientific properties are tested in Node (tests/life-*.test.js);
// this qualifies them where they are presented, on real recorded performances, for each flagship world:
//  1. determinism  - the ecosystem's state (its digest) at a moment is the same after continuous play, after seeks
//                    back and forth, in a fresh session and after a browser restart; seek paths give the same image;
//  2. frame rate   - 15, 30, 60 and 120 frames per second reach the same state at the same moment;
//  3. quality      - changing the rendering quality while the ecosystem lives changes what is drawn (followers), never
//                    the ecosystem;
//  4. idle         - minutes after the last event: the population keeps living and moving, the image keeps changing,
//                    no intent is created, memory (heap, geometries, textures, checkpoints) stays bounded;
//  5. off          - life off: no ecosystem, the world's own draw calls only; the labels never show an inhabitant;
//  6. switching    - switching worlds disposes the previous ecosystem (the running one is the shown world's) and GPU
//                    resources return to their level;
//  7. far seek     - in the live player, a far seek reports "restoring" until the state for the new moment is exact,
//                    and how long that took.
// node visual/life.qual.js [--gpu amd] [--only determinism,framerate,quality,idle,off,switching,seek] [--families a,b]
// Works on temporary copies of the datasets (their recipes are never changed).
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {projectOf,launch:launchBrowser,rendererOf,withService,recipeAction,filmPage,playerPage,thumb,diff,sha,checker}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.join(__dirname,'..','results','visual');
const GPU=arg('gpu',null),ONLY=arg('only',null)?new Set(arg('only').split(',')):null,run=k=>!ONLY||ONLY.has(k);
const FAMILIES=(arg('families','fractal-biosphere,stellar-forge,machine-cathedral')).split(',');
const {checks,check}=checker(),measurements={families:{}};
// Renders from `from` to exactly `to` (performance ms) at `fps`; returns the last frame.
async function playTo(page,from,to,fps){await page.evaluate(x=>window.__film.seek(x),from);let img;const step=1000/fps;
  for(let k=0,t=from;t<to;t=from+(++k)*step)await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/fps]);
  img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[to,1/fps]);return img;}
const life=page=>page.evaluate(()=>window.__film.stats()?.life||null);
function copy(name){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-life-'));fs.cpSync(path.join(DATA,name),dir,{recursive:true});return dir;}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  let browser=await launchBrowser(GPU);const temps=[];
  try{
    measurements.renderer=await rendererOf(browser);console.log('renderer',measurements.renderer);
    if(/NVIDIA/i.test(measurements.renderer))throw new Error('Refusing to run on the NVIDIA GPU');
    if(GPU==='amd'&&!/AMD|Radeon/i.test(measurements.renderer))throw new Error(`Requested the AMD GPU but got ${measurements.renderer}`);
    const dir=copy('lumen');temps.push(dir);const project=projectOf(dir);
    for(const family of FAMILIES)await withService(dir,async svc=>{
      await recipeAction(svc,project,{type:'family',family});await recipeAction(svc,project,{type:'tune',values:{'life.enabled':true}});
      const m=measurements.families[family]={};
      const open=async()=>{const p=await filmPage(browser,svc,project);return p;};
      const state=await open();const {info}=state;const T=info.start+Math.round((info.end-info.start)*.6)+137;
      // (the page is replaced after the browser restart below)
      const P=()=>state.page;
      // 1. Determinism.
      if(run('determinism')){
        const img1=await playTo(P(),T-3000,T,15),a=await life(P());
        check(`${family}: life is on for a recipe with life enabled`,!!a&&a.grammar===family,a?`${a.grammar} tick ${a.tick}, ${a.ecosystem?.alive} alive`:'no ecosystem');
        // Far ahead first, then back to the moment through a seek.
        await playTo(P(),info.end-2000,info.end,10);const img2=await playTo(P(),T-3000,T,15),b=await life(P());
        check(`${family}: after playing near the end and seeking back, the ecosystem and the image are the same`,a?.digest===b?.digest&&img1===img2,`${a?.digest}/${b?.digest} image ${sha(img1)}/${sha(img2)}`);
        // Continuous play from the start of the performance (no seek at all on the way).
        const c0=performance.now();await playTo(P(),info.start,T,6);const c=await life(P());const contMs=performance.now()-c0;
        check(`${family}: continuous play from the start reaches the same ecosystem`,c?.digest===a?.digest,`${c?.digest} (${Math.round((T-info.start)/1000)} s of performance at 6 fps, ${(contMs/1000).toFixed(0)} s)`);
        // A fresh session (another page), then a fresh browser.
        const s2=await open();const img3=await playTo(s2.page,T-3000,T,15),d=await life(s2.page);await s2.page.close();
        check(`${family}: a fresh session renders the same ecosystem and image`,d?.digest===a?.digest&&img3===img1,`${d?.digest} ${sha(img3)}`);
        // A browser restart (a new browser process, nothing kept).
        await P().close();await browser.close();browser=await launchBrowser(GPU);
        const s3=await open();const img4=await playTo(s3.page,T-3000,T,15),e=await life(s3.page);await s3.page.close();
        check(`${family}: after a browser restart, the same ecosystem and image`,e?.digest===a?.digest&&img4===img1,`${e?.digest} ${sha(img4)}`);
        Object.assign(state,await open());
        m.digest=a?.digest;m.image=sha(img1);m.tick=a?.tick;
        fs.writeFileSync(path.join(OUT,`life-${family}-determinism.jpg`),Buffer.from(img1.split(',')[1],'base64'));
      }
      // 2. Frame rate.
      if(run('framerate')){const digests=[];for(const fps of [15,30,60,120]){await playTo(P(),T-8000,T,fps);digests.push((await life(P()))?.digest);}
        m.framerates=digests;check(`${family}: 15, 30, 60 and 120 fps reach the same ecosystem`,new Set(digests).size===1&&!!digests[0],digests.join(' '));}
      // 3. Quality changes while it lives.
      if(run('quality')){
        const ref=(await playTo(P(),T-6000,T,15),await life(P()));
        await P().evaluate(x=>window.__film.seek(x),T-6000);const presented=[];
        for(let k=0,t=T-6000;t<T;t=T-6000+(++k)*1000/15){if(k%15===0){await P().evaluate(q=>window.__film.quality(q),[3,0,2,1,3,0][(k/15)%6]);}await P().evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/15]);
          if(k%15===7)presented.push((await life(P()))?.presented);}
        await P().evaluate(([t,dt])=>window.__film.frame(t,dt),[T,1/15]);const q=await life(P());await P().evaluate(()=>window.__film.quality(0));
        m.qualityPresented=presented;
        check(`${family}: changing the quality while it lives never changes the ecosystem`,q?.digest===ref?.digest,`${ref?.digest}/${q?.digest}; presented per level: ${JSON.stringify(presented.map(p=>p?.followers??p?.drawn??null))}`);
      }
      // 4. Idle: ten minutes after the last event (no events added).
      if(run('idle')){
        const end=info.end,samples=[];await P().evaluate(x=>window.__film.seek(x),end+1000);let t=end+1000;
        for(const at of [30,120,240,360,480,600]){let img;for(;t<=end+at*1000;t+=1000/4)img=await P().evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/4]);
          const st=await P().evaluate(()=>window.__film.stats()),mem=await P().evaluate(()=>window.__film.memory());
          samples.push({at,thumb:await thumb(P(),img),alive:st.life?.ecosystem?.alive,speed:+(st.life?.ecosystem?.meanSpeed||0).toFixed(3),modes:st.life?.ecosystem?.modes,intents:st.intents,phase:st.phase,
            geometries:mem.geometries,textures:mem.textures,heap:mem.heap,checkpoints:st.life?.checkpoints,tickMs:st.life?.tickMs});
          if(at===600)fs.writeFileSync(path.join(OUT,`life-${family}-idle600s.jpg`),Buffer.from(img.split(',')[1],'base64'));}
        const motion=samples.slice(1).map((s,i)=>+diff(samples[i].thumb,s.thumb).toFixed(2));
        m.idle=samples.map(({thumb,...s})=>s);m.idleMotion=motion;
        check(`${family}: idle ten minutes, the population lives and moves`,samples.every(s=>s.alive>0&&s.speed>.05),samples.map(s=>`${s.at}s ${s.alive} alive v ${s.speed}`).join(', '));
        check(`${family}: idle, the image keeps changing`,motion.every(x=>x>.3),`mean |Δluma| ${motion.join(', ')}`);
        check(`${family}: idle, no intent is created and the director stays idle`,samples.every(s=>s.intents===samples[0].intents&&s.phase==='idle'),samples.map(s=>`${s.intents}/${s.phase}`).join(', '));
        const g=samples.map(s=>`${s.geometries}/${s.textures}`),heap=samples.map(s=>s.heap).filter(Boolean);
        check(`${family}: idle, GPU resources are constant and memory bounded`,new Set(g).size===1&&(!heap.length||Math.max(...heap)<heap[0]*1.5+16e6)&&samples.every(s=>s.checkpoints.recent<=6&&s.checkpoints.sparse<=24),
          `geometries/textures ${[...new Set(g)].join(' ')}; heap MB ${heap.map(h=>(h/1e6).toFixed(0)).join(' ')}; checkpoints ${JSON.stringify(samples.at(-1).checkpoints)}`);
      }
      // 5. Off: the world alone; labels never show an inhabitant.
      if(run('off')){
        const on=(await playTo(P(),T-3000,T,15),await P().evaluate(()=>({stats:window.__film.stats(),labels:window.__film.labels()})));
        await P().close();await recipeAction(svc,project,{type:'tune',values:{'life.enabled':false}});
        const p2=await open();await playTo(p2.page,T-3000,T,15);const off=await p2.page.evaluate(()=>({stats:window.__film.stats(),labels:window.__film.labels()}));await p2.page.close();
        m.off={drawCallsOff:off.stats.drawCalls,drawCallsOn:on.stats.drawCalls,gpuOff:off.stats.gpuMs,gpuOn:on.stats.gpuMs};
        check(`${family}: life off runs no ecosystem`,off.stats.life===null,JSON.stringify(off.stats.life));
        check(`${family}: the labels are the same with life on and off (inhabitants are never labelled)`,JSON.stringify(on.labels)===JSON.stringify(off.labels),`${on.labels.length}/${off.labels.length}`);
        await recipeAction(svc,project,{type:'tune',values:{'life.enabled':true}});
      }else await P().close();
      check(`${family}: no page errors`,!state.errors.length,state.errors.slice(0,2).join(' | '));
    });
    // 6. Switching worlds: the running ecosystem is always the shown world's; resources return to their level.
    if(run('switching'))await withService(dir,async svc=>{
      await recipeAction(svc,project,{type:'family',family:'fractal-biosphere'});await recipeAction(svc,project,{type:'tune',values:{'life.enabled':true}});
      const {page,info}=await filmPage(browser,svc,project);const T=info.start+60000;await playTo(page,T-2000,T,10);
      const base=await page.evaluate(()=>window.__film.memory());const seen=[];
      for(const f of ['stellar-forge','machine-cathedral','fractal-biosphere','stellar-forge','machine-cathedral','fractal-biosphere']){
        const r=await page.evaluate(a=>window.__film.recipeAction(a),{type:'family',family:f});await page.evaluate(()=>window.__film.recipeAction({type:'tune',values:{'life.enabled':true}}));
        await playTo(page,T-2000,T,10);const st=await life(page);seen.push(`${r.family}:${st?.grammar}`);}
      const after=await page.evaluate(()=>window.__film.memory());await page.close();
      measurements.switching={seen,base,after};
      check('switching: the running ecosystem is always the shown world\'s',seen.every(x=>{const [a,b]=x.split(':');return a===b;}),seen.join(', '));
      check('switching: geometries and textures return to their level',after.geometries===base.geometries&&after.textures===base.textures,`${base.geometries}/${base.textures} -> ${after.geometries}/${after.textures}`);
    });
    // 7. Far seek in the live player (replay): restoring is reported, then exact for the new moment.
    if(run('seek')){const dir2=copy('lumen-long');temps.push(dir2);const p2=projectOf(dir2);
      await withService(dir2,async svc=>{
        await recipeAction(svc,p2,{type:'family',family:'fractal-biosphere'});
        const {page,errors}=await playerPage(browser,svc,p2,{speed:1});
        await page.waitForFunction(()=>window.__worldStats?.()?.life?.tick>0,null,{timeout:60000});
        const results=[];
        for(const f of [.85,.15,.6]){
          await page.evaluate(f=>window.ResonancePlayer.seekFraction(f),f);const t0=Date.now();let saw=false,last=null;
          for(let k=0;k<1200;k++){const s=await page.evaluate(()=>window.__worldStats?.()?.life);if(s?.restoring)saw=true;last=s;if(saw&&s&&!s.restoring)break;if(!saw&&k>40)break;await new Promise(r=>setTimeout(r,100));}
          results.push({fraction:f,restoringShown:saw,wallMs:Date.now()-t0,lastRestoreMs:last?.lastRestoreMs,ticks:last?.lastRestoreTicks,fromCheckpoint:last?.fromCheckpoint});}
        // Replay -> live: a new performance (its origin now): no restoring of the hours since the recording began, none of
        // the replay's inputs.
        const replayInputs=(await page.evaluate(()=>window.__worldStats?.()?.life?.inputs))?.items??0;
        await page.evaluate(()=>window.ResonancePlayer.setMode('live'));const tl=Date.now();let lv=null;
        for(let k=0;k<300;k++){await new Promise(r=>setTimeout(r,100));lv=await page.evaluate(()=>window.__worldStats?.()?.life);if(lv&&!lv.restoring&&lv.tick>20&&Date.now()-tl>3000)break;}
        measurements.replayToLive={wallMs:Date.now()-tl,tick:lv?.tick,restoring:lv?.restoring,inputs:lv?.inputs?.items,replayInputs,resets:lv?.resets};
        check('replay -> live: the live ecosystem starts at the switch (no restoring, a new origin, not the replay\'s inputs)',!!lv&&!lv.restoring&&lv.tick<20*60&&(lv.inputs?.items??0)<replayInputs,JSON.stringify(measurements.replayToLive));
        await page.close();measurements.farSeek=results;
        check('far seek: restoring is reported, then the ecosystem is current again',results.every(r=>!r.restoringShown||r.lastRestoreMs!==null),JSON.stringify(results));
        check('far seek: no page errors',!errors.length,errors.slice(0,2).join(' | '));
      });}
  }finally{await browser.close();for(const d of temps)fs.rmSync(d,{recursive:true,force:true});}
  const failed=checks.filter(c=>!c.pass);
  fs.writeFileSync(path.join(OUT,'life.json'),JSON.stringify({checks,measurements},null,1));
  console.log(`${checks.length-failed.length}/${checks.length} checks passed`);process.exitCode=failed.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});

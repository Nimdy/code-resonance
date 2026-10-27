'use strict';
// Long-history replay in the real player. Dataset: the SUPPLEMENTAL lumen-long fixture (visual/datasets.js --long 300):
// the real Lumen Recipes events repeated as 300 sessions an hour apart (12,878 windows, ~49,500 intents; the only
// verified milestones happen in the first session). The player's state is compared with an independent fold of the
// same timeline in Node (the same public/worlds modules), and with what the PR #3 host would have kept.
//
// node visual/long.qual.js [--datasets results/datasets] [--baseline 06dd680]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const {REPO,projectOf,launch,rendererOf,withService,setFamily,filmPage,renderTo,sha,checker}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const DIR=path.join(path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets'))),'lumen-long');
const BASELINE=arg('baseline','06dd680');
const OUT=path.join(__dirname,'..','results','visual');
const {checks,check}=checker();const measurements={};
const clampTime=(i,e)=>Math.min(Math.max(i.ts,e.start),Math.max(e.start,e.end-1));
(async()=>{
  if(!fs.existsSync(DIR))throw new Error(`missing ${DIR} (run: node -e "require('./visual/datasets').lumenLong('results/datasets',300)")`);
  const recipes=require(path.join(REPO,'engine/recipe'));
  const {createDirector}=await import(path.join(REPO,'public/worlds/director.js'));
  const {createAgents}=await import(path.join(REPO,'public/worlds/agents.js'));
  const browser=await launch();
  try{
    measurements.renderer=await rendererOf(browser);
    await withService(DIR,async svc=>{
      const project=projectOf(DIR);const recipe=await setFamily(svc,project,'fractal-biosphere');
      // The timeline as the player reads it, with each intent's canonical position.
      const entries=fs.readFileSync(path.join(DIR,'projects',fs.readdirSync(path.join(DIR,'projects'))[0],'performance.jsonl'),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
      const all=[];for(const e of entries)(e.intents||[]).forEach((i,k)=>{i.ord=e.seq*65536+k;all.push({i,e});});
      const cmp=(a,b)=>a.ts-b.ts||a.ord-b.ord;
      const expect=(set,t)=>{const d=createDirector({recipe}),a=createAgents();for(const i of set.slice().sort(cmp)){a.record(i);d.process(i);}
        return {folded:set.length,unlocked:d.unlockedAt(t).filter(u=>u.level>0).length,lasting:d.lasting().reduce((n,l)=>n+l.count,0),agentNumbers:a.list(t).map(x=>x.number)};};
      const pick=s=>({folded:s.intents,unlocked:s.unlocked,lasting:s.lasting,agentNumbers:s.agentNumbers});
      measurements.dataset={windows:entries.length,intents:all.length,milestones:all.filter(x=>x.i.type==='milestone.achieved').length,
        sessions:new Set(all.filter(x=>x.i.type==='agent.state').map(x=>x.i.subject.agentId)).size};
      // What the PR #3 host keeps at the end of this history (30,000 newest intents; lasting blooms from 400 commands).
      {
        const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-baseline-'));fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
        for(const f of ['director','agents'])fs.writeFileSync(path.join(dir,`${f}.js`),cp.execFileSync('git',['show',`${BASELINE}:public/worlds/${f}.js`],{cwd:REPO}));
        const oldD=(await import(path.join(dir,'director.js'))).createDirector({recipe}),oldA=(await import(path.join(dir,'agents.js'))).createAgents();
        const sorted=all.map(x=>x.i).sort(cmp),end=sorted.at(-1).ts+60000;
        for(const i of sorted.slice(-30000)){oldA.record(i);oldD.process(i);}
        const truth=expect(sorted,end);
        measurements.pr3={unlocked:oldD.unlockedAt(end).filter(u=>u.level>0).length,blooms:oldD.commands.filter(c=>c.effect==='fractal-bloom').length,truth};
        fs.rmSync(dir,{recursive:true,force:true});
        check('PR #3 baseline: with only the newest 30,000 intents, the early verified milestones are lost',measurements.pr3.unlocked<truth.unlocked,
          `PR #3 shows ${measurements.pr3.unlocked} of ${truth.unlocked} ambient unlocks and ${measurements.pr3.blooms} of ${truth.lasting} lasting blooms at the end`);
      }
      // 1. Replay: open, seek into the quiet hour before the last session, then play a minute of it.
      let t0=Date.now();const {page,info,errors}=await filmPage(browser,svc,project);measurements.openMs=Date.now()-t0;
      const sessionStarts=entries.filter((e,k)=>k===0||e.start-entries[k-1].end>1800000).map(e=>e.start);
      const quiet=sessionStarts.at(-1)-1800000,inside=sessionStarts.at(-1)+90000;
      t0=Date.now();await page.evaluate(x=>window.__film.seek(x),quiet);measurements.seekQuietMs=Date.now()-t0;
      await page.evaluate(([t])=>window.__film.frame(t,1/5),[quiet]);
      const atQuiet=pick(await page.evaluate(()=>window.__film.stats()));
      const wantQuiet=expect(all.map(x=>x.i).filter(i=>i.ts<quiet),quiet);
      check('replay: after a seek deep into the history the player folds exactly the intents before it',JSON.stringify(atQuiet)===JSON.stringify(wantQuiet),`player ${JSON.stringify(atQuiet)} / fold ${JSON.stringify(wantQuiet)}`);
      const s=await page.evaluate(()=>window.__film.stats());
      measurements.history=s.history;measurements.crownsAtQuiet=s.crowns;
      check('replay: memory stays bounded (at most 30,000 raw intents however long the history)',s.history.raw<=30000&&s.history.folded>30000,JSON.stringify(s.history));
      check('replay: early verified milestones still unlock ambient layers and keep their lasting blooms',atQuiet.unlocked===wantQuiet.unlocked&&wantQuiet.unlocked>0&&s.crowns>0,`${atQuiet.unlocked} unlocked, ${s.crowns} crown instances`);
      t0=Date.now();await page.evaluate(x=>window.__film.seek(x),inside-60000);measurements.seekInsideMs=Date.now()-t0;
      for(let t=inside-60000;t<=inside;t+=200)await page.evaluate(([t])=>window.__film.frame(t,1/5),[t]);
      const atInside=pick(await page.evaluate(()=>window.__film.stats()));
      const from=inside-60000,delivered=all.filter(({i,e})=>i.ts<from||(clampTime(i,e)>=from&&clampTime(i,e)<=inside)).map(x=>x.i);
      const wantInside=expect(delivered,inside);
      check('replay: a minute of playback inside a session matches the fold (agents present, numbered by session)',JSON.stringify(atInside)===JSON.stringify(wantInside)&&wantInside.agentNumbers.length>0,
        `player ${JSON.stringify(atInside)} / fold ${JSON.stringify(wantInside)}`);
      check('no page errors in the long replay',!errors.length,errors.slice(0,2).join(' | '));
      measurements.heapMB=await page.evaluate(()=>performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null);
      await page.close();
      // 2. Determinism with a different seek history (the second session first plays the middle of the history).
      const frames=[];
      for(let k=0;k<2;k++){const f=await filmPage(browser,svc,project);if(k===1)await renderTo(f.page,info.start+(info.end-info.start)/2,info.start+(info.end-info.start)/2+1000,5);
        frames.push(await renderTo(f.page,inside-3000,inside,10));await f.page.close();}
      check('replay: the same moment renders the same frame regardless of seek history (long history)',frames[0]===frames[1],`${sha(frames[0])} / ${sha(frames[1])}`);
      // 3. Live: the live view primes the whole history's intents.
      const live=await browser.newPage({viewport:{width:1280,height:720}});const liveErrors=[];live.on('pageerror',e=>liveErrors.push(String(e)));
      t0=Date.now();await live.goto(`http://127.0.0.1:${svc.port}/?labels=off&project=${project}&world=living`);
      await live.waitForFunction(n=>window.__worldStats?.()?.intents>=n,all.length,{timeout:180000}).catch(()=>{});measurements.livePrimeMs=Date.now()-t0;
      const ls=await live.evaluate(()=>window.__worldStats?.()||{});await live.close();
      check('live: opening the live view primes all intents of a long history, with its early milestones',ls.intents===all.length&&ls.unlocked===measurements.pr3.truth.unlocked&&ls.history?.raw<=30000,
        `${ls.intents} of ${all.length} intents, ${ls.unlocked} unlocked, raw window ${ls.history?.raw}, ${measurements.livePrimeMs} ms`);
      check('no page errors in the live view (long history)',!liveErrors.length,liveErrors.slice(0,2).join(' | '));
    },{});
  }finally{await browser.close();}
  fs.writeFileSync(path.join(OUT,'long-history-qualification.json'),JSON.stringify({at:new Date().toISOString(),dataset:'lumen-long (supplemental: 300 sessions of the real Lumen events)',checks,measurements},null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

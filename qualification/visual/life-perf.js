'use strict';
// Digital life: what it costs, measured in the live player (Auto quality, the real render loop) on a recorded replay.
// For each flagship world, the same replay with life off and on: presented frame rate, quality level and changes, GPU
// time per frame (where the driver measures it), draw calls, CPU update and draw time, the ecosystem's tick time and
// catch-up per frame, population and what is drawn of it, bytes uploaded per frame, memory and GPU resources.
// node visual/life-perf.js [--gpu amd] [--size 1920x1080] [--seconds 60] [--families a,b] [--dataset lumen]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {projectOf,launch,rendererOf,withService,recipeAction,playerPage}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.join(__dirname,'..','results','visual');
const [W,H]=arg('size','1920x1080').split('x').map(Number),SECONDS=Number(arg('seconds',60));
const FAMILIES=arg('families','fractal-biosphere,stellar-forge,machine-cathedral').split(',');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(a,p)=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(p*(s.length-1)))].toFixed(2):null;};
const mean=a=>{const s=a.filter(Number.isFinite);return s.length?+(s.reduce((x,y)=>x+y,0)/s.length).toFixed(3):null;};
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-lifeperf-'));fs.cpSync(path.join(DATA,arg('dataset','lumen')),dir,{recursive:true});
  const project=projectOf(dir),browser=await launch(arg('gpu',null)),results={size:`${W}x${H}`,seconds:SECONDS,runs:[]};
  try{
    results.renderer=await rendererOf(browser);console.log('renderer',results.renderer);
    if(/NVIDIA/i.test(results.renderer))throw new Error('Refusing to run on the NVIDIA GPU');
    await withService(dir,async svc=>{
      for(const family of FAMILIES)for(const on of [false,true]){
        await recipeAction(svc,project,{type:'family',family});await recipeAction(svc,project,{type:'tune',values:{'life.enabled':on}});
        const {page,errors}=await playerPage(browser,svc,project,{speed:1,width:W,height:H});
        await page.waitForFunction(f=>window.__worldStats?.()?.family===f,family,{timeout:60000});
        await sleep(4000);   // shaders compiled, Auto settled from its start
        const samples=[];const t0=Date.now();
        while(Date.now()-t0<SECONDS*1000){await sleep(500);
          const s=await page.evaluate(()=>{const s=window.__worldStats();const m=performance.memory;return {...s,heap:m?m.usedJSHeapSize:null};});
          samples.push(s);}
        const life=samples.map(s=>s.life).filter(Boolean),eco=life.map(l=>l.ecosystem).filter(Boolean),pres=life.map(l=>l.presented).filter(Boolean);
        const run={family,life:on,
          fps:{mean:mean(samples.map(s=>s.fps)),p05:pct(samples.map(s=>s.fps),.05),p50:pct(samples.map(s=>s.fps),.5)},
          quality:{levels:[...new Set(samples.map(s=>s.quality))],changes:samples.at(-1)?.qualityChanges??null,final:samples.at(-1)?.quality,degraded:samples.some(s=>s.degraded)},
          gpuMs:{mean:mean(samples.map(s=>s.gpuMs)),p95:pct(samples.map(s=>s.gpuMs),.95)},
          drawCalls:{scene:pct(samples.map(s=>s.drawCalls),.5),passes:pct(samples.map(s=>s.passes),.5)},
          cpu:{updateMs:mean(samples.map(s=>s.updateMs)),drawMs:mean(samples.map(s=>s.drawMs))},
          life:on?{tickMs:mean(life.map(l=>l.tickMs)),tickMsP95:pct(life.map(l=>l.tickMs),.95),catchUpMs:mean(life.map(l=>l.catchUpMs)),catchUpMsP95:pct(life.map(l=>l.catchUpMs),.95),
            alive:pct(eco.map(e=>e.alive),.5),capacity:eco[0]?.capacity,field:eco[0]?.field_dims,sites:pct(eco.map(e=>e.sites),.5),
            neighbourPairsPerTick:eco.length>1?+((eco.at(-1).neighbourPairs-eco[0].neighbourPairs)/Math.max(1,eco.at(-1).steps-eco[0].steps)).toFixed(0):null,
            restoring:life.filter(l=>l.restoring).length,presented:pres.at(-1)||null}:null,
          memory:{heapMB:{first:samples[0]?.heap?+(samples[0].heap/1e6).toFixed(1):null,last:samples.at(-1)?.heap?+(samples.at(-1).heap/1e6).toFixed(1):null},
            geometries:[...new Set(samples.map(s=>s.geometries))],textures:[...new Set(samples.map(s=>s.textures))]},
          errors:errors.slice(0,3)};
        results.runs.push(run);console.log(JSON.stringify(run));
        await page.close();
      }
    });
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
  const file=path.join(OUT,`life-perf-${W}x${H}.json`);fs.writeFileSync(file,JSON.stringify(results,null,1));console.log('written',path.relative(process.cwd(),file));
})().catch(e=>{console.error(e);process.exitCode=1;});

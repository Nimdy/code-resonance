'use strict';
// Digital life: the simulation's CPU cost, measured outside the browser on the real recorded performances (the same
// timeline the player receives from the receiver, the same grammars the worlds create). For each flagship world:
//  - continuous play at 30 frames per second over the whole performance and a quiet tail: time per tick (mean, p95,
//    max), split by phase (grid, neighbours and steering; integration and deposits; field update), neighbour pairs
//    evaluated per tick, population, field size, habitat evaluations and their cost;
//  - seeking: a far seek from a fresh session to the end (the whole performance simulated, as "restoring" does in
//    the player without a budget), a seek back to the middle (a checkpoint), and the forward seek again.
// node visual/life-cpu.js [--dataset lumen] [--families a,b] [--tail 60]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {projectOf,withService,recipeAction}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const ROOT=path.join(__dirname,'..','..');
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.join(__dirname,'..','results','visual');
const DATASET=arg('dataset','lumen'),TAIL=Number(arg('tail',60));
const FAMILIES=arg('families','fractal-biosphere,stellar-forge,machine-cathedral').split(',');
const mod=f=>import(pathToFileURL(path.join(ROOT,'public','worlds',f)).href);
const pct=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(p*(s.length-1)))].toFixed(3):null;};
const mean=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(3):null;
async function grammarOf(family,recipe){
  if(family==='stellar-forge'){const [{layoutConfig,createLayout},{createStellarGrammar}]=await Promise.all([mod('stellar-layout.js'),mod('life/stellar.js')]);
    return createStellarGrammar({layout:createLayout(layoutConfig(recipe))});}
  if(family==='fractal-biosphere'){const {biosphereGrammar}=await mod('life/biosphere.js');return biosphereGrammar(recipe);}
  if(family==='machine-cathedral'){const {createCathedralGrammar}=await mod('life/cathedral.js');return createCathedralGrammar({genome:recipe.genome,axisAz:.4});}
  throw new Error(`no grammar for ${family}`);
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const score=require(path.join(ROOT,'public','score.js'));
  const [{createLifeDriver},{createLifeTimeline}]=await Promise.all([mod('life/driver.js'),mod('life/timeline.js')]);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-lifecpu-'));fs.cpSync(path.join(DATA,DATASET),dir,{recursive:true});
  const results={dataset:DATASET,node:process.version,cpu:os.cpus()[0]?.model,loadavg:os.loadavg().map(x=>+x.toFixed(2)),worlds:[]};
  try{
    await withService(dir,async svc=>{
      const project=projectOf(dir),base=`http://127.0.0.1:${svc.port}`;
      const entries=[];let after=-1;
      for(;;){const page=await (await fetch(`${base}/api/timeline?id=${encodeURIComponent(project)}&after=${after}&limit=500`)).json();
        entries.push(...page.entries);if(!page.entries.length||entries.length>=page.total)break;after=page.entries.at(-1).seq;}
      const start=entries[0].start,end=entries.at(-1).end;results.performanceSeconds=+((end-start)/1000).toFixed(1);results.windows=entries.length;
      // Every recipe first: the benchmark blocks this process (and the receiver in it) for minutes at a time.
      const recipes={};for(const family of FAMILIES){const r=await recipeAction(svc,project,{type:'family',family});recipes[family]=r.recipe||r;}
      for(const family of FAMILIES){
        const recipe=recipes[family];
        const g0=await grammarOf(family,recipe);let habitats=0,habitatMs=0;
        // The same grammar, with the ecosystem's per-phase profile on and its habitat timed.
        const grammar={...g0,ecosystem:(p,s)=>({...g0.ecosystem(p,s),profile:true}),habitat:(m,t)=>{const t0=performance.now();const h=g0.habitat(m,t);habitatMs+=performance.now()-t0;habitats++;return h;}};
        const make=()=>{const timeline=createLifeTimeline();timeline.prime(entries);
          return createLifeDriver({grammar,timeline,seed:1234,config:()=>({speed:1,tempo:92,epoch:start,params:{},film:true,live:false}),score});};
        const view=t=>({tview:(t-start)/1000});
        // Continuous play at 30 fps (one or two ticks per frame), every frame timed.
        const d=make(),perTick=[];let prevTicks=0,prevSteps=0,pairs0=null;const t1=end+TAIL*1000;
        for(let t=start;t<=t1;t+=1000/30){const a=performance.now();d.update(view(t),{budgetMs:Infinity});const ms=performance.now()-a;
          const st=d.stats(),n=st.ticks-prevTicks;prevTicks=st.ticks;if(n>0)perTick.push(ms/n);
          if(pairs0===null&&st.ecosystem)pairs0={pairs:st.ecosystem.neighbourPairs,steps:st.ecosystem.steps};prevSteps=st.ecosystem?.steps??prevSteps;}
        const st=d.stats(),e=st.ecosystem;
        const run={family,grammar:{id:g0.id,version:g0.version},capacity:e.capacity,alive:e.alive,field:e.field_dims,sites:e.sites,ticks:st.ticks,
          tickMs:{mean:mean(perTick),p50:pct(perTick,.5),p95:pct(perTick,.95),max:pct(perTick,1)},
          phases:e.profile||null,neighbourPairsPerTick:pairs0?Math.round((e.neighbourPairs-pairs0.pairs)/Math.max(1,e.steps-pairs0.steps)):null,
          habitat:{evaluations:habitats,meanMs:habitats?+(habitatMs/habitats).toFixed(3):null,totalMs:+habitatMs.toFixed(1)},
          checkpoints:st.checkpoints};
        // Seeking: from a fresh session straight to the end, back to the middle, forward to the end again.
        const s=make(),mid=start+(end-start)/2;
        let a=performance.now();s.update(view(end),{budgetMs:Infinity});const farMs=performance.now()-a,farTicks=s.stats().ticks;
        a=performance.now();s.update(view(mid),{budgetMs:Infinity});const backMs=performance.now()-a,back=s.stats();
        a=performance.now();s.update(view(end),{budgetMs:Infinity});const fwdMs=performance.now()-a;
        run.seek={farFromFreshMs:Math.round(farMs),farTicks,msPerSimulatedMinute:+(farMs/((end-start)/60000)).toFixed(0),
          backToMiddleMs:Math.round(backMs),backFromCheckpoint:back.fromCheckpoint>0,forwardAgainMs:Math.round(fwdMs),
          sameStateAsContinuous:null};
        // The far seek reaches the same state as continuous play at the same moment (determinism, at the real scale).
        const c=make();for(let t=start;t<=end;t+=1000/30)c.update(view(t),{budgetMs:Infinity});c.update(view(end),{budgetMs:Infinity});
        run.seek.sameStateAsContinuous=c.digest()===s.digest();
        results.worlds.push(run);console.log(JSON.stringify(run));
      }
    });
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  const file=path.join(OUT,`life-cpu-${DATASET}.json`);fs.writeFileSync(file,JSON.stringify(results,null,1));console.log('written',path.relative(process.cwd(),file));
})().catch(e=>{console.error(e);process.exitCode=1;});

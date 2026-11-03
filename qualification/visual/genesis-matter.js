'use strict';
// Genesis G2 and G3, Metamorphic Matter: the simulation measured outside the browser on the real recorded performances (the
// timeline the player receives from the receiver, the grammar the world creates, the player's score configuration).
//  - cost: continuous play at 30 frames per second over the performance and a quiet tail; time per tick (mean, p95,
//    max), the regimes' shares and what the matter did (monuments, channels, the causal log's kinds);
//  - seeking: a far seek from nothing to the end, back to the middle (a checkpoint), forward again; and that the far
//    seek reaches the state continuous play reaches (determinism at the real scale); the digests every 10 s;
//  - --laws <dataset>: the same recorded events under another project's Lawbook (a controlled comparison: the
//    events are this recording's, the laws another's), with the response measured side by side;
//  - --music-off: the same, the music's forces off from the start (G3: what the phrase logic costs, ticks and seeks).
// node visual/genesis-matter.js --dataset lumen [--tail 20] [--laws excalidraw] [--music-off] [--out results/visual]
//        [--prefix genesis-g3-matter] (the files' name: G2's evidence is genesis-matter-*.json, G3's genesis-g3-matter-*)
// (the tempo is the player's: the score identity's for the style, public/app.js setMood)
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {projectOf,withService,recipeAction}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const ROOT=path.join(__dirname,'..','..'),DATA=path.join(__dirname,'..','results','datasets');
const DATASET=arg('dataset','lumen'),TAIL=Number(arg('tail',20)),OTHER=arg('laws',null),OFF=process.argv.includes('--music-off'),PREFIX=arg('prefix','genesis-g3-matter');
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','visual')));
const mod=f=>import(pathToFileURL(path.join(ROOT,'public','worlds',f)).href);
const pct=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(p*(s.length-1)))].toFixed(3):null;};
const mean=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(3):null;
async function inputsOf(ds){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-gm-'));fs.cpSync(path.join(DATA,ds),dir,{recursive:true});
  try{return await withService(dir,async svc=>{
    const project=projectOf(dir),base=`http://127.0.0.1:${svc.port}`;await recipeAction(svc,project,{type:'family',family:'genesis'});
    const recipe=await (await fetch(`${base}/api/recipe?id=${project}`)).json();const entries=[];let after=-1;
    for(;;){const p=await (await fetch(`${base}/api/timeline?id=${project}&after=${after}&limit=1000`)).json();entries.push(...p.entries);if(!p.entries.length||entries.length>=p.total)break;after=p.entries.at(-1).seq;}
    const seed=entries.find(e=>Number.isFinite(e.frame?.projectSeed))?.frame.projectSeed;
    return {recipe,entries,music:{version:recipe.music?.scoreVersion??3,style:recipe.music?.style||recipe.style||'ambient',profile:recipe.music?.profile||null,seed}};});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const score=require(path.join(ROOT,'public','score.js'));
  const [{createLifeDriver},{createLifeTimeline},M,{hash}]=await Promise.all([mod('life/driver.js'),mod('life/timeline.js'),mod('genesis-matter.js'),mod('genesis-laws.js')]);
  const own=await inputsOf(DATASET),other=OTHER?await inputsOf(OTHER):null;
  const {entries,music}=own,start=entries[0].start,end=entries.at(-1).end,TEMPO=score.createIdentity(music.seed).tempo[music.style]||92;
  const make=recipe=>{const timeline=createLifeTimeline();timeline.prime(entries);
    // (seeded as the host seeds a world's matter: the same states as the player's, digest for digest)
    return createLifeDriver({grammar:M.createMatterGrammar({recipe,silentFrom:OFF?start:Infinity}),timeline,seed:hash(`${recipe.projectSeed}/${recipe.variant||0}/matter`),score,background:false,
      config:()=>({speed:1,tempo:TEMPO,epoch:start,params:{},film:true,live:false,music})});};
  const view=t=>({tview:(t-start)/1000});
  const results={dataset:DATASET,musicForces:!OFF,node:process.version,cpu:os.cpus()[0]?.model,loadavg:os.loadavg().map(x=>+x.toFixed(2)),tempo:TEMPO,
    performanceSeconds:+((end-start)/1000).toFixed(1),windows:entries.length,laws:own.recipe.genome.laws,matterVersion:M.MATTER_VERSION,cells:M.NCELL,hz:M.HZ};
  // continuous play at 30 fps, every frame timed; the digests every 10 s
  function play(recipe){const d=make(recipe),perTick=[],digests=[],series=[];let prev=0;const t1=end+TAIL*1000;
    for(let k=0,t=start;t<=t1;t=start+(++k)*1000/30){const a=performance.now();d.update(view(t),{budgetMs:Infinity});const ms=performance.now()-a,st=d.stats(),n=st.ticks-prev;prev=st.ticks;if(n>0)perTick.push(ms/n);
      if(k%300===0){const e=d.view.eco.stats();digests.push({tick:st.tick,digest:d.digest()});series.push({s:+((t-start)/1000).toFixed(1),crystal:e.crystal,liquid:e.liquid,grains:e.grains,foam:e.foam,molten:e.molten,monuments:e.monuments,channels:e.channels});}}
    return {d,perTick,digests,series};}
  const A=play(own.recipe),eco=A.d.view.eco;
  const kinds={};for(const x of eco.log)kinds[x.kind]=(kinds[x.kind]||0)+1;
  results.continuous={ticks:A.d.stats().ticks,tickMs:{mean:mean(A.perTick),p50:pct(A.perTick,.5),p95:pct(A.perTick,.95),max:pct(A.perTick,1)},digests:A.digests,series:A.series,
    end:eco.stats(),lastCausal:kinds,stages:eco.stages.map(S=>({rank:S.rank,reach:+S.R.toFixed(1),fold:S.fold})),musicLog:eco.musicLog.map(x=>x.kind)};
  // seeking: from nothing to the end, back to the middle, forward again; the far seek against continuous play
  const s=make(own.recipe),mid=start+(end-start)/2;
  let a=performance.now();s.update(view(end),{budgetMs:Infinity});const far=performance.now()-a,farTicks=s.stats().ticks;
  a=performance.now();s.update(view(mid),{budgetMs:Infinity});const back=performance.now()-a,b=s.stats();
  a=performance.now();s.update(view(end),{budgetMs:Infinity});const fwd=performance.now()-a;
  const c=make(own.recipe);for(let t=start;t<=end;t+=1000/30)c.update(view(t),{budgetMs:Infinity});c.update(view(end),{budgetMs:Infinity});
  results.seek={farFromNothingMs:Math.round(far),farTicks,msPerSimulatedMinute:Math.round(far/((end-start)/60000)),backToMiddleMs:Math.round(back),backFromCheckpoint:b.fromCheckpoint>0,
    forwardAgainMs:Math.round(fwd),sameStateAsContinuous:c.digest()===s.digest(),digest:s.digest()};
  console.log(JSON.stringify({tickMs:results.continuous.tickMs,seek:results.seek}));
  // the same events under another project's laws
  if(other){const laws=other.recipe.genome.laws,B=play({...own.recipe,genome:{...own.recipe.genome,laws}});
    results.comparison={otherDataset:OTHER,otherLaws:laws,note:'the same recorded events (this dataset\'s), another project\'s Lawbook: a controlled comparison',
      own:A.series,other:B.series,otherEnd:B.d.view.eco.stats(),
      peakGrains:{own:Math.max(...A.series.map(x=>x.grains)),other:Math.max(...B.series.map(x=>x.grains))},
      meanLiquidShare:{own:+mean(A.series.map(x=>x.liquid/M.NCELL)).toFixed(3),other:+mean(B.series.map(x=>x.liquid/M.NCELL)).toFixed(3)},
      meanMolten:{own:mean(A.series.map(x=>x.molten)),other:mean(B.series.map(x=>x.molten))}};
    console.log(JSON.stringify({peakGrains:results.comparison.peakGrains,meanLiquidShare:results.comparison.meanLiquidShare,meanMolten:results.comparison.meanMolten}));}
  const file=path.join(OUT,`${PREFIX}-${DATASET}${OTHER?`-laws-${OTHER}`:''}${OFF?'-music-off':''}.json`);fs.writeFileSync(file,JSON.stringify(results,null,1));console.log('written',path.relative(process.cwd(),file));
})().catch(e=>{console.error(e);process.exitCode=1;});

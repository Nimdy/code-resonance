'use strict';
// Digital life and the music: the same recorded performance with the recipe's music influence (life.music) at 0, 1
// and 2. The climate comes from the recorded frames on the performance's bar grid (the score's own section rule), so
// it is the same with sound off; this measures what it changes in the ecosystem, per musical section: the conditions
// (current, turbulence, cohesion, activity, attraction), the inhabitants' mean speed and how many are gathered
// (seeking or orbiting a site). Influence 0 must leave the conditions neutral.
// node visual/life-music.js [--dataset lumen] [--families a,b]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {projectOf,withService,recipeAction}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const ROOT=path.join(__dirname,'..','..');
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.join(__dirname,'..','results','visual');
const DATASET=arg('dataset','lumen'),FAMILIES=arg('families','fractal-biosphere,stellar-forge,machine-cathedral').split(',');
const mod=f=>import(pathToFileURL(path.join(ROOT,'public','worlds',f)).href);
async function grammarOf(family,recipe){
  if(family==='stellar-forge'){const [{layoutConfig,createLayout},{createStellarGrammar}]=await Promise.all([mod('stellar-layout.js'),mod('life/stellar.js')]);
    return createStellarGrammar({layout:createLayout(layoutConfig(recipe))});}
  if(family==='fractal-biosphere'){const {biosphereGrammar}=await mod('life/biosphere.js');return biosphereGrammar(recipe);}
  const {createCathedralGrammar}=await mod('life/cathedral.js');return createCathedralGrammar({genome:recipe.genome,axisAz:.4});
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const score=require(path.join(ROOT,'public','score.js'));
  const [{createLifeDriver},{createLifeTimeline}]=await Promise.all([mod('life/driver.js'),mod('life/timeline.js')]);
  const {MODE:M}=await mod('life/sim.js');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-lifemusic-'));fs.cpSync(path.join(DATA,DATASET),dir,{recursive:true});
  const results={dataset:DATASET,worlds:[]};
  try{
    await withService(dir,async svc=>{
      const project=projectOf(dir),base=`http://127.0.0.1:${svc.port}`,entries=[];let after=-1;
      for(;;){const page=await (await fetch(`${base}/api/timeline?id=${encodeURIComponent(project)}&after=${after}&limit=500`)).json();
        entries.push(...page.entries);if(!page.entries.length||entries.length>=page.total)break;after=page.entries.at(-1).seq;}
      const recipes={};for(const f of FAMILIES){const r=await recipeAction(svc,project,{type:'family',family:f});recipes[f]=r.recipe||r;}
      const start=entries[0].start,end=entries.at(-1).end;
      for(const family of FAMILIES){
        const grammar=await grammarOf(family,recipes[family]),world={family,runs:[]};
        for(const music of [0,1,2]){
          const timeline=createLifeTimeline();timeline.prime(entries);
          const d=createLifeDriver({grammar,timeline,seed:1234,config:()=>({speed:1,tempo:92,epoch:start,params:{music},film:true,live:false}),score});
          const per={};
          for(let t=start;t<=end;t+=1000){const v=d.update({tview:(t-start)/1000},{budgetMs:Infinity}),e=v.eco,c=e.cond;
            let n=0,sp=0,gathered=0;for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;n++;sp+=Math.hypot(e.vx[i],e.vy[i],e.vz[i]);if(e.mode[i]===M.seek||e.mode[i]===M.orbit||e.mode[i]===M.route)gathered++;}
            const s=per[v.climate.section]||(per[v.climate.section]={seconds:0,current:0,turb:0,cohesion:0,activity:0,attract:0,speed:0,gathered:0});
            s.seconds++;for(const k of ['current','turb','cohesion','activity','attract'])s[k]+=c[k];s.speed+=n?sp/n:0;s.gathered+=n?gathered/n:0;}
          for(const s of Object.values(per))for(const k of ['current','turb','cohesion','activity','attract','speed','gathered'])s[k]=+(s[k]/s.seconds).toFixed(3);
          world.runs.push({music,sections:per,digest:d.digest()});
        }
        results.worlds.push(world);console.log(JSON.stringify(world));
      }
    });
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  const file=path.join(OUT,`life-music-${DATASET}.json`);fs.writeFileSync(file,JSON.stringify(results,null,1));console.log('written',path.relative(process.cwd(),file));
})().catch(e=>{console.error(e);process.exitCode=1;});

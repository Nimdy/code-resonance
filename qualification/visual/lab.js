'use strict';
// The render lab: stills of a world on real project data, for looking at a world while working on it. Each still is a
// real frame of the film path (deterministic: the same dataset, family, variant and moment give the same image).
//
// node visual/lab.js --dataset lumen [--family fractal-biosphere] [--variant 0] [--at 0.25,0.6,1] [--events]
//        [--idle 20,90] [--warm 4] [--size 1920x1080] [--labels cinematic|off] [--gpu amd] [--out <dir>] [--tag name]
//   --dataset   a receiver data directory under results/datasets/ (or a path): lumen, excalidraw, self, lumen-long, …
//   --at        moments as fractions of the recorded performance (1 = its end: the mature project)
//   --events    stills around real recorded intents: 1 s and 3.5 s after the first validation.failed,
//               validation.recovered / milestone.achieved, subsystem.created and repository.checkpoint found
//   --idle      seconds after the last recorded event (no events added: the world's honest idle life)
//   --warm      seconds rendered before each still, so motion, effects and the camera are in their real state
// Copies the dataset to a temporary directory first: the dataset's own recipes are never changed.
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {launch,rendererOf,withService,recipeAction,filmPage,projectOf}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const has=k=>process.argv.includes(`--${k}`);
const DATASET=arg('dataset','lumen'),FAMILY=arg('family',null),VARIANT=arg('variant',null),WARM=Number(arg('warm',4));
const [W,H]=arg('size','1920x1080').split('x').map(Number),LABELS=arg('labels','cinematic'),FPS=15;
const SRC=fs.existsSync(DATASET)?path.resolve(DATASET):path.join(__dirname,'..','results','datasets',DATASET);
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','lab')));
const TAG=arg('tag',`${path.basename(SRC)}-${FAMILY||'generated'}${VARIANT!==null?`-v${VARIANT}`:''}`);
(async()=>{
  if(!fs.existsSync(path.join(SRC,'projects')))throw new Error(`No dataset at ${SRC} (build them with visual/datasets.js)`);
  fs.mkdirSync(OUT,{recursive:true});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-lab-'));fs.cpSync(SRC,dir,{recursive:true});
  const browser=await launch(arg('gpu',null));const shots=[];
  try{
    const renderer=await rendererOf(browser);
    await withService(dir,async svc=>{
      const project=projectOf(dir);
      if(FAMILY)await recipeAction(svc,project,{type:'family',family:FAMILY});
      if(VARIANT!==null){const want=Number(VARIANT);for(let i=0;i<want;i++)await recipeAction(svc,project,{type:'regenerate',keepFamily:!!FAMILY});}
      const {page,info,errors}=await filmPage(browser,svc,project,{width:W,height:H,query:`&labels=${LABELS}`});
      await page.evaluate(m=>window.__film.setLabels(m),LABELS);
      const span=info.end-info.start,moments=[];
      for(const f of (arg('at','')||'').split(',').filter(Boolean))moments.push({name:`at${f}`,t:info.start+span*Number(f)});
      if(has('events')){
        const r=await (await fetch(`http://127.0.0.1:${svc.port}/api/timeline?id=${project}&fields=intents&limit=2000`)).json();
        const all=r.entries.flatMap(e=>e.intents||[]);
        for(const type of ['validation.failed','validation.recovered','milestone.achieved','subsystem.created','repository.checkpoint']){
          const i=all.find(x=>x.type===type);if(!i)continue;
          for(const d of [1000,3500])moments.push({name:`${type.replace(/\./g,'-')}+${d/1000}s`,t:i.ts+d});
        }
      }
      for(const s of (arg('idle','')||'').split(',').filter(Boolean))moments.push({name:`idle${s}s`,t:info.end+Number(s)*1000});
      if(!moments.length)moments.push({name:'end',t:info.end});
      for(const m of moments){
        const from=m.t-WARM*1000;await page.evaluate(x=>window.__film.seek(x),from);let img;
        for(let t=from;t<=m.t;t+=1000/FPS)img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/FPS]);
        const file=path.join(OUT,`${TAG}-${m.name}.jpg`);fs.writeFileSync(file,Buffer.from(img.split(',')[1],'base64'));shots.push(file);
        const st=await page.evaluate(()=>window.__film.stats());
        console.log(`${path.relative(process.cwd(),file)}  family=${st?.family} drawCalls=${st?.drawCalls} updateMs=${st?.updateMs} drawMs=${st?.drawMs} gpuMs=${st?.gpuMs}`);
      }
      if(errors.length)console.log('PAGE ERRORS:\n'+errors.slice(0,5).join('\n'));
      console.log(`renderer: ${renderer}; recipe: ${info.recipe?.family} v${info.recipe?.variant}; performance ${Math.round(span/1000)} s, ${info.windows} windows`);
    });
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

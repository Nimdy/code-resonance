'use strict';
// The render lab: stills of a world on real project data, for looking at a world while working on it. Each still is a
// real frame of the film path (deterministic: the same dataset, family, variant and moment give the same image).
//
// node visual/lab.js --dataset lumen [--family fractal-biosphere] [--variant 0] [--at 0.25,0.6,1] [--events]
//        [--idle 20,90] [--warm 4] [--size 1920x1080] [--labels cinematic|off] [--gpu amd] [--out <dir>] [--tag name]
//        [--tune '{"atmosphere.fog":0.4}'] (tuned values, as a preset or the Visual Studio would apply them)
//   --dataset   a receiver data directory under results/datasets/ (or a path): lumen, excalidraw, self, lumen-long, …
//   --at        moments as fractions of the recorded performance (1 = its end: the mature project)
//   --events    stills around real recorded intents: 1 s and 3.5 s after the first validation.failed,
//               validation.recovered / milestone.achieved, subsystem.created and repository.checkpoint found
//   --touch     stills during agents' touches: 0.5 s and 1.4 s after the first recorded edit of a file, and of a read
//   --idle      seconds after the last recorded event (no events added: the world's honest idle life)
//   --warm      seconds rendered before each still, so motion, effects and the camera are in their real state
//   --strip     NxS: after each still, N more frames S seconds apart, tiled into one contact sheet (<still>-strip.jpg,
//               three per row, left to right then down): motion read from consecutive real frames
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
const STRIP=arg('strip',null)?.split('x').map(Number)||null;
const ffmpeg=require('ffmpeg-static'),cp=require('node:child_process');
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
      if(arg('tune',null))await recipeAction(svc,project,{type:'tune',values:JSON.parse(arg('tune'))});
      const {page,info,errors}=await filmPage(browser,svc,project,{width:W,height:H,query:`&labels=${LABELS}`});
      await page.evaluate(m=>window.__film.setLabels(m),LABELS);
      const span=info.end-info.start,moments=[];
      for(const f of (arg('at','')||'').split(',').filter(Boolean))moments.push({name:`at${f}`,t:info.start+span*Number(f)});
      const all=has('events')||has('touch')?(await (await fetch(`http://127.0.0.1:${svc.port}/api/timeline?id=${project}&fields=intents&limit=2000`)).json()).entries.flatMap(e=>e.intents||[]):[];
      if(has('touch'))for(const act of ['editing','reading']){const i=all.find(x=>x.type==='agent.state'&&x.detail?.state==='tool'&&x.detail?.activity===act&&x.subject?.fileId);
        if(i)for(const d of [500,1400])moments.push({name:`touch-${act}+${d/1000}s`,t:i.ts+d});}
      if(has('events')){
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
        if(STRIP){const [n,dt]=STRIP,frames=[file];let t=m.t;
          for(let k=1;k<n;k++){const end=t+dt*1000;for(t+=1000/FPS;t<=end+1e-6;t+=1000/FPS)img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/FPS]);t-=1000/FPS;
            const f=file.replace(/\.jpg$/,`-s${k}.jpg`);fs.writeFileSync(f,Buffer.from(img.split(',')[1],'base64'));frames.push(f);}
          const sheet=file.replace(/\.jpg$/,'-strip.jpg'),cols=3,rows=Math.ceil(n/cols);
          cp.execFileSync(ffmpeg,['-y','-loglevel','error',...frames.flatMap(f=>['-i',f]),'-filter_complex',`${frames.map((_,k)=>`[${k}:v]scale=960:-1[v${k}]`).join(';')};${frames.map((_,k)=>`[v${k}]`).join('')}xstack=inputs=${frames.length}:layout=${frames.map((_,k)=>`${(k%cols)?Array.from({length:k%cols},()=>'w0').join('+'):'0'}_${Math.floor(k/cols)?Array.from({length:Math.floor(k/cols)},()=>'h0').join('+'):'0'}`).join('|')}:fill=black`,'-frames:v','1','-q:v','3',sheet]);
          for(const f of frames.slice(1))fs.rmSync(f);console.log(`${path.relative(process.cwd(),sheet)}  ${n} frames ${dt} s apart`);}
        const st=await page.evaluate(()=>window.__film.stats());
        console.log(`${path.relative(process.cwd(),file)}  family=${st?.family} touches=${st?.touches??'-'} drawCalls=${st?.drawCalls} updateMs=${st?.updateMs} drawMs=${st?.drawMs} gpuMs=${st?.gpuMs}${st?.life?` life: tick ${st.life.tick} alive ${st.life.ecosystem?.alive} tickMs ${st.life.tickMs} modes ${JSON.stringify(st.life.ecosystem?.modes)}`:' life: off'}`);
      }
      if(errors.length)console.log('PAGE ERRORS:\n'+errors.slice(0,5).join('\n'));
      console.log(`renderer: ${renderer}; recipe: ${info.recipe?.family} v${info.recipe?.variant}; performance ${Math.round(span/1000)} s, ${info.windows} windows`);
    });
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

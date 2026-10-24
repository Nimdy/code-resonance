'use strict';
// Technical qualification of the living worlds in a real browser (artistic acceptance is a separate, human judgement):
//  1. determinism  - the same recording, recipe and time render the same frame in two independent sessions;
//  2. idle life    - after the last event the image keeps moving while structure and effects stay exactly the same;
//  3. resources    - switching worlds repeatedly returns GPU geometries and textures to their baseline;
//  4. privacy      - no label on screen (cinematic or stream mode) contains a path, file name or source identifier;
//  5. performance  - frame rate, draw calls and frame time of each family on a 450-file project (live player).
// node visual/worlds.qual.js [--datasets results/datasets] [--gpu amd]
// --gpu amd renders on the AMD integrated GPU under WSL2 (ANGLE GL -> Mesa d3d12); the default is SwiftShader (CPU).
// The NVIDIA GPU is never used: the run aborts if the renderer string is not the requested adapter.
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const recipes=require(path.join(REPO,'engine/recipe'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.join(__dirname,'..','results','visual');
const GPU=arg('gpu',null);
const ONLY=arg('only',null)?new Set(arg('only').split(',')):null,run=k=>!ONLY||ONLY.has(k);
const checks=[],measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const projectOf=dir=>fs.readFileSync(path.join(dir,'projects',fs.readdirSync(path.join(dir,'projects'))[0],'id'),'utf8');
function launch(){
  if(GPU==='amd')return chromium.launch({args:['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu'],
    env:{...process.env,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}});
  return chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
}
async function withService(dir,fn){const svc=await createService({port:0,dataDir:dir}).start();try{await svc.flush();return await fn(svc);}finally{await svc.stop();}}
async function setFamily(svc,project,family){
  const r=await fetch(`http://127.0.0.1:${svc.port}/api/recipe?id=${project}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`http://127.0.0.1:${svc.port}`},body:JSON.stringify({action:{type:'family',family}})});
  if(!r.ok)throw new Error(await r.text());return r.json();
}
async function filmPage(browser,svc,project,{width=1280,height=720}={}){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${svc.port}/?film=1&world=living&project=${project}`);await page.waitForFunction(()=>!!window.__film);
  const info=await page.evaluate(p=>window.__film.open({project:p,speed:1}),project);
  return {page,info,errors};
}
// Renders from `from` to `to` (performance ms) at `fps`, returning the last frame (JPEG data URL).
async function renderTo(page,from,to,fps=15){await page.evaluate(x=>window.__film.seek(x),from);let img;for(let t=from;t<=to;t+=1000/fps)img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/fps]);return img;}
// A small luminance thumbnail of a frame, to compare motion between moments.
async function thumb(page,dataUrl){return page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=96;c.height=54;const g=c.getContext('2d');g.drawImage(img,0,0,96,54);
  const d=g.getImageData(0,0,96,54).data;const out=[];for(let i=0;i<d.length;i+=4)out.push(Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]));return out;},dataUrl);}
const diff=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const sets={lumen:{dir:path.join(DATA,'lumen'),family:'stellar-forge',at:160000},excalidraw:{dir:path.join(DATA,'excalidraw'),family:'fractal-biosphere',at:5000},self:{dir:path.join(DATA,'self'),family:'machine-cathedral',at:600000}};
  for(const s of Object.values(sets))if(!fs.existsSync(s.dir))throw new Error(`missing dataset ${s.dir} (run visual/datasets.js)`);
  const browser=await launch();
  try{
    const probe=await browser.newPage();await probe.goto('about:blank');
    measurements.renderer=await probe.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),d=gl&&gl.getExtension('WEBGL_debug_renderer_info');return gl?gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER):'none';});await probe.close();
    console.log('renderer',measurements.renderer);
    if(/NVIDIA/i.test(measurements.renderer))throw new Error('Refusing to run on the NVIDIA GPU');
    if(GPU==='amd'&&!/AMD|Radeon/i.test(measurements.renderer))throw new Error(`Requested the AMD GPU but got ${measurements.renderer}`);
    // 1. Determinism (one dataset per family).
    if(!GPU&&run('determinism'))for(const [name,s] of Object.entries(sets))await withService(s.dir,async svc=>{
      const project=projectOf(s.dir);await setFamily(svc,project,s.family);
      // The second session first plays another moment (near the end), so the result must not depend on seek history.
      const frames=[];for(let k=0;k<2;k++){const {page,info,errors}=await filmPage(browser,svc,project);const t=info.start+s.at;if(k===1)await renderTo(page,info.end-1500,info.end,10);
        frames.push({img:await renderTo(page,t-3000,t),errors});await page.close();}
      check(`determinism: ${name} (${s.family}) renders the same frame in two sessions, regardless of seek history`,frames[0].img===frames[1].img,`${sha(frames[0].img)} / ${sha(frames[1].img)}`);
      check(`no page errors: ${name} (${s.family})`,frames.every(f=>!f.errors.length),frames.flatMap(f=>f.errors).slice(0,2).join(' | '));
    });
    // 2. Idle life: Lumen after its last event (the session ended; nothing more was recorded).
    if(!GPU&&run('idle'))await withService(sets.lumen.dir,async svc=>{
      const project=projectOf(sets.lumen.dir);await setFamily(svc,project,'stellar-forge');
      const {page,info}=await filmPage(browser,svc,project);const end=info.end;const samples=[];
      await page.evaluate(x=>window.__film.seek(x),end+2000);let t=end+2000;
      for(const at of [10,40,70,100]){let img;for(;t<=end+at*1000;t+=1000/15)img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/15]);
        samples.push({at,thumb:await thumb(page,img),stats:await page.evaluate(()=>window.__film.stats())});}
      const motion=samples.slice(1).map((s,i)=>+diff(samples[i].thumb,s.thumb).toFixed(2));
      const structure=samples.map(s=>JSON.stringify({p:s.stats.planets,m:s.stats.moons,l:s.stats.links,sys:s.stats.systems,i:s.stats.intents}));
      measurements.idle={seconds:'10-100 after the last event',meanAbsLumaDiff:motion,structure:structure[0],phases:samples.map(s=>s.stats.phase)};
      check('idle life: the image keeps changing for 90 s with no events',motion.every(m=>m>.8),`mean |Δluma| between samples ${motion.join(', ')} (0-255)`);
      check('idle life: no structure or event appears while idle',structure.every(x=>x===structure[0]),structure[0]);
      check('idle life: the director reports idle',samples.slice(1).every(s=>s.stats.phase==='idle'),samples.map(s=>s.stats.phase).join(','));
      // 4. Privacy: every label during the session (cinematic) and in stream mode.
      // Real paths, file names (with and without extension), distinctive folder names and camelCase or snake_case
      // identifiers; generic words such as "tests" or "src" are also role words in labels and are not secrets.
      const GENERIC=new Set(['src','app','lib','test','tests','api','ui','data','index','main','utils','types','style','styles','public','server','client','components','pages','docs','readme','package','config','scripts']);
      const paths=new Set();for(const l of fs.readFileSync(path.join(sets.lumen.dir,'projects',fs.readdirSync(path.join(sets.lumen.dir,'projects'))[0],'events.jsonl'),'utf8').split('\n').filter(Boolean)){const e=JSON.parse(l);
        if(e.file){paths.add(e.file);for(const part of e.file.split('/')){const base=part.replace(/\.[^.]+$/,'');if(base.length>=4&&!GENERIC.has(base.toLowerCase())){paths.add(part);paths.add(base);}}}}
      const seen=new Set();await page.evaluate(x=>window.__film.seek(x),info.start);
      for(let t=info.start;t<info.end;t+=1000/5){await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/5]);if(Math.round((t-info.start)/1000)%3===0)for(const s of await page.evaluate(()=>window.__film.labels()))seen.add(s);}
      await page.evaluate(()=>window.__film.setLabels('stream'));for(let t=info.start+90000;t<info.start+100000;t+=200){await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,.2]);for(const s of await page.evaluate(()=>window.__film.labels()))seen.add(s);}
      // Whole words only: "searching" and "validated" are label vocabulary, not the files search.js and validate.js.
      const escape=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const pathWords=[...paths].map(p=>new RegExp(`(?:^|[^\\w-])${escape(p)}(?![\\w-])`,'i'));
      const identifier=/\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b/;
      const leaks=[...seen].filter(s=>/[\\/]|\.(?:[jt]sx?|json|css|md|py)\b/.test(s)||identifier.test(s)||pathWords.some(r=>r.test(s)));
      measurements.labels=[...seen].sort();measurements.privacyPatterns=paths.size;
      check('privacy: no label contains a path, file name or source identifier',leaks.length===0,leaks.slice(0,3).join(' | ')||`${seen.size} distinct label strings checked`);
      // 3. Resources: switch worlds repeatedly; geometries and textures must return to their level.
      const project2=await (await fetch(`http://127.0.0.1:${svc.port}/api/project?id=${project}`)).json();
      const mem=[];const t2=info.start+120000;await renderTo(page,t2-1000,t2,10);mem.push(await page.evaluate(()=>window.__film.memory()));
      for(let k=0;k<9;k++){const family=recipes.FAMILIES[k%3];await page.evaluate(r=>window.__film.setRecipe(r),recipes.generate(project2,{family,now:0}));await renderTo(page,t2-1000,t2,10);mem.push({family,...await page.evaluate(()=>window.__film.memory())});}
      measurements.worldSwitching=mem;
      const first=mem.find(m=>m.family==='stellar-forge')||mem[0],last=mem.filter(m=>m.family==='stellar-forge').at(-1)||mem.at(-1);
      check('resources: switching worlds 9 times leaves GPU geometries and textures at their level',last.geometries<=first.geometries&&last.textures<=first.textures,`geometries ${first.geometries}->${last.geometries}, textures ${first.textures}->${last.textures}`);
      await page.close();
    });
    // 5. Performance on the 450-file Excalidraw snapshot, live player at 1920x1080, each family.
    if(run('performance'))await withService(sets.excalidraw.dir,async svc=>{
      const project=projectOf(sets.excalidraw.dir);measurements.performance={};
      const fpsOver=(page,ms)=>page.evaluate(ms=>new Promise(r=>{let n=0;const s=performance.now();const f=()=>{n++;performance.now()-s<ms?requestAnimationFrame(f):r(n/((performance.now()-s)/1000));};requestAnimationFrame(f);}),ms);
      for(const family of recipes.FAMILIES){
        await setFamily(svc,project,family);const result={};
        // Full quality (adaptation off), then the default adaptive player after it has settled.
        for(const [label,query] of [['full','&adapt=0'],['adaptive','']]){
          const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
          await page.goto(`http://127.0.0.1:${svc.port}/?overlay=1&labels=off&project=${project}&world=living${query}`);
          await page.waitForFunction(()=>window.__worldStats&&window.__worldStats()&&window.__worldStats().drawCalls>0,null,{timeout:60000});
          await page.waitForTimeout(label==='adaptive'?14000:3000);
          const fps=await fpsOver(page,8000);const st=await page.evaluate(()=>window.__worldStats());
          result[label]={fps:+fps.toFixed(1),quality:st.quality,drawCalls:st.drawCalls,passes:st.passes,triangles:st.triangles,points:st.points,updateMs:st.updateMs,drawMs:st.drawMs,geometries:st.geometries,textures:st.textures};
          if(errors.length)result[label].errors=errors.slice(0,2);await page.close();
        }
        measurements.performance[family]=result;console.log(family.padEnd(18),JSON.stringify(result));
        check(`performance: ${family} on 450 files uses fewer than 40 scene draw calls`,result.full.drawCalls<40,`${result.full.drawCalls} draw calls; ${result.full.fps} fps full quality, ${result.adaptive.fps} fps adaptive (level ${result.adaptive.quality}) on ${measurements.renderer}`);
        check(`no page errors in the live player: ${family}`,!result.full.errors&&!result.adaptive.errors,[...(result.full.errors||[]),...(result.adaptive.errors||[])].join(' | '));
      }
    });
  }finally{await browser.close();}
  const tag=GPU?`-${GPU}`:'';
  fs.writeFileSync(path.join(OUT,`worlds-qualification${tag}.json`),JSON.stringify({at:new Date().toISOString(),renderer:measurements.renderer,checks,measurements},null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

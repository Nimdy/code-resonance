'use strict';
// Technical qualification of the living worlds in a real browser (artistic acceptance is a separate, human judgement),
// for each of the six built-in families (engine/recipe.js FAMILIES) unless --families names some (which may also name a
// preview, engine/recipe.js PREVIEWS: Aurora):
//  1. determinism  - the same recording, recipe and time render the same frame in two independent sessions, whatever
//                    the second session played before (its seek history);
//  2. idle life    - after the last event the image keeps moving while structure and effects stay exactly the same;
//  3. resources    - switching between all six worlds repeatedly returns GPU geometries and textures to their baseline;
//  4. privacy      - no label on screen (cinematic or stream mode) contains a path, file name or source identifier;
//  5. performance  - frame rate, draw calls and frame time of each family on a 450-file project (live player);
//  6. live         - opening the live view primes the director with the project's whole intent history.
// node visual/worlds.qual.js [--datasets results/datasets] [--gpu amd] [--only determinism,idle,live,performance]
//                            [--families a,b] [--size 1280x720] [--fps 15] [--tag name]
// --only re-runs some sections and replaces their checks in the existing results file (noted under "reruns").
// --families: the families qualified in determinism, idle, privacy and performance (resources always switches all six);
// a preview is qualified only when named.
// --size and --fps: the film page's size and the idle sampling rate (frames per second of view time); a smaller page or
// a lower rate makes a software-rendered run of the raymarched worlds affordable, and the results file records both.
// --tag: results in worlds-qualification-<tag>.json (with --gpu: -<gpu>-<tag>), leaving the main file as it is.
// Run on a copy of the datasets: setting a family writes the dataset's recipe.json.
// --gpu amd renders on the AMD integrated GPU under WSL2 (ANGLE GL -> Mesa d3d12); the default is SwiftShader (CPU).
// The NVIDIA GPU is never used: the run aborts if the renderer string is not the requested adapter.
const path=require('node:path');
const fs=require('node:fs');
const {REPO,projectOf,launch:launchBrowser,withService,setFamily,filmPage,renderTo,thumb,diff,sha,checker}=require('./harness');
const recipes=require(path.join(REPO,'engine/recipe'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.join(__dirname,'..','results','visual');
const GPU=arg('gpu',null);
const ONLY=arg('only',null)?new Set(arg('only').split(',')):null,run=k=>!ONLY||ONLY.has(k);
const FAMILIES=arg('families',null)?arg('families').split(','):recipes.FAMILIES;
for(const f of FAMILIES)if(!recipes.FAMILIES.includes(f)&&!recipes.PREVIEWS.includes(f))throw new Error(`unknown family ${f} (one of ${[...recipes.FAMILIES,...recipes.PREVIEWS].join(', ')})`);
const [W,H]=arg('size','1280x720').split('x').map(Number),FPS=Number(arg('fps',15)),TAG=arg('tag',null);
const {checks,check}=checker(),measurements={};
const launch=()=>launchBrowser(GPU);
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const sets={lumen:{dir:path.join(DATA,'lumen'),at:160000},excalidraw:{dir:path.join(DATA,'excalidraw'),at:5000},self:{dir:path.join(DATA,'self'),at:600000}};
  for(const s of Object.values(sets))if(!fs.existsSync(s.dir))throw new Error(`missing dataset ${s.dir} (run visual/datasets.js)`);
  // Determinism: one dataset per family (the flagships as before; each graduated world on the dataset generator 5 gives
  // it, or on Lumen for Fractal Continuum).
  const DETERMINISM={'stellar-forge':'lumen','fractal-biosphere':'excalidraw','machine-cathedral':'self','synaptic-storm':'excalidraw','fractal-continuum':'lumen','temporal-terrain':'self',
    'aurora':'self'};
  measurements.options={families:FAMILIES,size:`${W}x${H}`,idleFps:FPS};
  const browser=await launch();
  try{
    const probe=await browser.newPage();await probe.goto('about:blank');
    measurements.renderer=await probe.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),d=gl&&gl.getExtension('WEBGL_debug_renderer_info');return gl?gl.getParameter(d?d.UNMASKED_RENDERER_WEBGL:gl.RENDERER):'none';});await probe.close();
    console.log('renderer',measurements.renderer);
    if(/NVIDIA/i.test(measurements.renderer))throw new Error('Refusing to run on the NVIDIA GPU');
    if(GPU==='amd'&&!/AMD|Radeon/i.test(measurements.renderer))throw new Error(`Requested the AMD GPU but got ${measurements.renderer}`);
    // 1. Determinism (one dataset per family).
    if(!GPU&&run('determinism'))for(const family of FAMILIES){const name=DETERMINISM[family],s=sets[name];await withService(s.dir,async svc=>{
      const project=projectOf(s.dir);await setFamily(svc,project,family);
      // The second session first plays another moment (near the end), so the result must not depend on seek history.
      const frames=[];for(let k=0;k<2;k++){const {page,info,errors}=await filmPage(browser,svc,project,{width:W,height:H});const t=info.start+s.at;if(k===1)await renderTo(page,info.end-1500,info.end,10);
        frames.push({img:await renderTo(page,t-3000,t),errors});await page.close();}
      check(`determinism: ${name} (${family}) renders the same frame in two sessions, regardless of seek history`,frames[0].img===frames[1].img,`${sha(frames[0].img)} / ${sha(frames[1].img)}`);
      check(`no page errors: ${name} (${family})`,frames.every(f=>!f.errors.length),frames.flatMap(f=>f.errors).slice(0,2).join(' | '));
    });}
    // 2. Idle life: Lumen after its last event (the session ended; nothing more was recorded), in each family. Structure
    // is what the world reports it has built (its own counts, never what the camera happens to see), plus the intents,
    // the effects expressed and the lasting transformations: none may change while idle.
    const STRUCTURE={'stellar-forge':['planets','moons','links','systems'],'fractal-biosphere':['organisms','segments','crowns','cords','bloomSegments'],
      'machine-cathedral':['districts','towers','stones','pinnacles','naves','spires','bridges','crowns','roses'],'synaptic-storm':['clusters','neurons','files','segments','boutons','axons','storms'],
      'fractal-continuum':['form','power','regions','blooms'],'temporal-terrain':['ranges','files','roads','commits','monuments','sunrises'],
      'aurora':['curtains','rays','arcs','lanterns','breakups']};
    const structureOf=(family,st)=>JSON.stringify({...Object.fromEntries((STRUCTURE[family]||[]).map(k=>[k,st?.[k]])),intents:st?.intents,lasting:st?.lasting,unlocked:st?.unlocked,effects:st?.effects});
    if(!GPU&&run('idle'))for(const family of FAMILIES)await withService(sets.lumen.dir,async svc=>{
      const project=projectOf(sets.lumen.dir);await setFamily(svc,project,family);
      const {page,info,errors}=await filmPage(browser,svc,project,{width:W,height:H});const end=info.end;const samples=[];
      await page.evaluate(x=>window.__film.seek(x),end+2000);let t=end+2000;
      for(const at of [10,40,70,100]){let img;for(;t<=end+at*1000;t+=1000/FPS)img=await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/FPS]);
        samples.push({at,thumb:await thumb(page,img),stats:await page.evaluate(()=>window.__film.stats())});}
      const motion=samples.slice(1).map((s,i)=>+diff(samples[i].thumb,s.thumb).toFixed(2));
      const structure=samples.map(s=>structureOf(family,s.stats));
      const idle={seconds:'10-100 after the last event',fps:FPS,meanAbsLumaDiff:motion,structure:structure[0],phases:samples.map(s=>s.stats.phase)};
      if(family==='stellar-forge')measurements.idle=idle;(measurements.idleByFamily||={})[family]=idle;
      check(`idle life: ${family} keeps changing for 90 s with no events`,motion.every(m=>m>.8),`mean |Δluma| between samples ${motion.join(', ')} (0-255)`);
      check(`idle life: ${family} shows no new structure or event while idle`,structure.every(x=>x===structure[0]),structure[0]);
      check(`idle life: the director reports idle (${family})`,samples.slice(1).every(s=>s.stats.phase==='idle'),samples.map(s=>s.stats.phase).join(','));
      check(`no page errors while idle: ${family}`,!errors.length,errors.slice(0,2).join(' | '));
      // 4. Privacy: every label during the session (cinematic) and in stream mode.
      // Real paths, file names (with and without extension), distinctive folder names and camelCase or snake_case
      // identifiers; generic words such as "tests" or "src" are also role words in labels and are not secrets.
      const GENERIC=new Set(['src','app','lib','test','tests','api','ui','data','index','main','utils','types','style','styles','public','server','client','components','pages','docs','readme','package','config','scripts']);
      const paths=new Set();for(const l of fs.readFileSync(path.join(sets.lumen.dir,'projects',fs.readdirSync(path.join(sets.lumen.dir,'projects'))[0],'events.jsonl'),'utf8').split('\n').filter(Boolean)){const e=JSON.parse(l);
        if(e.file){paths.add(e.file);for(const part of e.file.split('/')){const base=part.replace(/\.[^.]+$/,'');if(base.length>=4&&!GENERIC.has(base.toLowerCase())){paths.add(part);paths.add(base);}}}}
      // The project folder name (the extension shares it for the player's project list) is never a label either.
      const folder=(await (await fetch(`http://127.0.0.1:${svc.port}/api/projects`)).json()).projects.find(p=>p.id===project)?.name;
      if(folder){paths.add(folder);for(const part of folder.split(/[-_ .]+/))if(part.length>=5)paths.add(part);}
      measurements.privacyFolderName=!!folder;
      const seen=new Set();await page.evaluate(x=>window.__film.seek(x),info.start);
      for(let t=info.start;t<info.end;t+=1000/5){await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,1/5]);if(Math.round((t-info.start)/1000)%3===0)for(const s of await page.evaluate(()=>window.__film.labels()))seen.add(s);}
      // Back to 90 s through a seek, as playback always does (the fold answers for times at or after its last intent).
      await page.evaluate(()=>window.__film.setLabels('stream'));await page.evaluate(x=>window.__film.seek(x),info.start+90000);for(let t=info.start+90000;t<info.start+100000;t+=200){await page.evaluate(([t,dt])=>window.__film.frame(t,dt),[t,.2]);for(const s of await page.evaluate(()=>window.__film.labels()))seen.add(s);}
      // Whole words only: "searching" and "validated" are label vocabulary, not the files search.js and validate.js.
      const escape=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const pathWords=[...paths].map(p=>new RegExp(`(?:^|[^\\w-])${escape(p)}(?![\\w-])`,'i'));
      const identifier=/\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b/;
      const leaks=[...seen].filter(s=>/[\\/]|\.(?:[jt]sx?|json|css|md|py)\b/.test(s)||identifier.test(s)||pathWords.some(r=>r.test(s)));
      (measurements.labelsByFamily||={})[family]=[...seen].sort();measurements.privacyPatterns=paths.size;if(family==='stellar-forge')measurements.labels=[...seen].sort();
      check(`privacy: no label of ${family} contains a path, file name, source identifier or the project folder name`,leaks.length===0,leaks.slice(0,3).join(' | ')||`${seen.size} distinct label strings checked`);
      // 3. Resources (once, from the last family's page): switch between all six worlds twice; geometries and textures
      // must return to their level.
      if(family===FAMILIES.at(-1)){
        const project2=await (await fetch(`http://127.0.0.1:${svc.port}/api/project?id=${project}`)).json();
        const order=recipes.FAMILIES,rounds=order.length*2;
        const mem=[];const t2=info.start+120000;await renderTo(page,t2-1000,t2,10);mem.push(await page.evaluate(()=>window.__film.memory()));
        for(let k=0;k<rounds;k++){const f=order[k%order.length];await page.evaluate(r=>window.__film.setRecipe(r),recipes.generate(project2,{family:f,now:0}));await renderTo(page,t2-1000,t2,10);mem.push({family:f,...await page.evaluate(()=>window.__film.memory())});}
        measurements.worldSwitching=mem;
        const first=mem.find(m=>m.family==='stellar-forge')||mem[0],last=mem.filter(m=>m.family==='stellar-forge').at(-1)||mem.at(-1);
        check(`resources: switching between the ${order.length} worlds ${rounds} times leaves GPU geometries and textures at their level`,last.geometries<=first.geometries&&last.textures<=first.textures,`geometries ${first.geometries}->${last.geometries}, textures ${first.textures}->${last.textures}`);
      }
      await page.close();
    });
    // 6. Live priming: the live view (not a replay) must know every recorded intent, however long the history.
    if(!GPU&&run('live'))await withService(sets.lumen.dir,async svc=>{
      const project=projectOf(sets.lumen.dir);await setFamily(svc,project,'stellar-forge');
      let recorded=0;for(let after=-1;;){const r=await (await fetch(`http://127.0.0.1:${svc.port}/api/timeline?id=${project}&after=${after}&limit=2000&fields=intents`)).json();
        if(!r.entries.length)break;for(const e of r.entries)recorded+=e.intents?.length||0;after=r.entries.at(-1).seq;}
      const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${svc.port}/?labels=off&project=${project}&world=living`);
      await page.waitForFunction(()=>window.__worldStats?.()?.intents>0,null,{timeout:60000}).catch(()=>{});await page.waitForTimeout(2000);
      const st=await page.evaluate(()=>window.__worldStats?.()||{});await page.close();
      measurements.live={recorded,primed:st.intents,phase:st.phase};
      check('live: opening the live view primes the whole intent history',recorded>0&&st.intents===recorded,`${st.intents} of ${recorded} recorded intents`);
      check('no page errors in the live view',!errors.length,errors.slice(0,2).join(' | '));
    });
    // 5. Performance on the 450-file Excalidraw snapshot, live player at 1920x1080, each family.
    if(run('performance'))await withService(sets.excalidraw.dir,async svc=>{
      const project=projectOf(sets.excalidraw.dir);measurements.performance={};
      const fpsOver=(page,ms)=>page.evaluate(ms=>new Promise(r=>{let n=0;const s=performance.now();const f=()=>{n++;performance.now()-s<ms?requestAnimationFrame(f):r(n/((performance.now()-s)/1000));};requestAnimationFrame(f);}),ms);
      for(const family of FAMILIES){
        await setFamily(svc,project,family);const result={};
        // Full quality (adaptation off), then the default adaptive player after it has settled.
        for(const [label,query] of [['full','&adapt=0'],['adaptive','']]){
          const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
          await page.goto(`http://127.0.0.1:${svc.port}/?overlay=1&labels=off&project=${project}&world=living${query}`);
          await page.waitForFunction(()=>window.__worldStats&&window.__worldStats()&&window.__worldStats().drawCalls>0,null,{timeout:60000});
          await page.waitForTimeout(label==='adaptive'?14000:3000);
          const fps=await fpsOver(page,8000);const st=await page.evaluate(()=>window.__worldStats());
          result[label]={fps:+fps.toFixed(1),quality:st.quality,drawCalls:st.drawCalls,passes:st.passes,triangles:st.triangles,points:st.points,updateMs:st.updateMs,drawMs:st.drawMs,gpuMs:st.gpuMs??null,geometries:st.geometries,textures:st.textures};
          if(errors.length)result[label].errors=errors.slice(0,2);await page.close();
        }
        measurements.performance[family]=result;console.log(family.padEnd(18),JSON.stringify(result));
        check(`performance: ${family} on 450 files uses fewer than 40 scene draw calls`,result.full.drawCalls<40,`${result.full.drawCalls} draw calls; ${result.full.fps} fps full quality, ${result.adaptive.fps} fps adaptive (level ${result.adaptive.quality}) on ${measurements.renderer}`);
        check(`no page errors in the live player: ${family}`,!result.full.errors&&!result.adaptive.errors,[...(result.full.errors||[]),...(result.adaptive.errors||[])].join(' | '));
      }
    });
  }finally{await browser.close();}
  const tag=`${GPU?`-${GPU}`:''}${TAG?`-${TAG}`:''}`,file=path.join(OUT,`worlds-qualification${tag}.json`);
  let result={at:new Date().toISOString(),renderer:measurements.renderer,checks,measurements};
  if(ONLY&&fs.existsSync(file)){const prev=JSON.parse(fs.readFileSync(file,'utf8')),names=new Set(checks.map(c=>c.name));
    // Per-family measurements are merged family by family (a run of some families keeps the others').
    const merged={...prev.measurements,...measurements};for(const k of Object.keys(measurements))if(k.endsWith('ByFamily')&&prev.measurements?.[k])merged[k]={...prev.measurements[k],...measurements[k]};
    result={...prev,checks:[...prev.checks.filter(c=>!names.has(c.name)),...checks],measurements:merged,
      reruns:[...(prev.reruns||[]),{at:result.at,sections:[...ONLY]}]};}
  fs.writeFileSync(file,JSON.stringify(result,null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed in this run; ${result.checks.filter(c=>c.pass).length}/${result.checks.length} in ${path.basename(file)}`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

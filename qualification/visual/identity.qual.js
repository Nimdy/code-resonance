'use strict';
// Identity of a world across projects, restarts and replays, on the film path (frames at exact performance times):
//  1. two different projects shown in the same world (for Fractal Continuum, with the same fractal form) look
//     structurally different: their frames of the mature project differ far more than one project's frame repeated;
//  2. restart: a new receiver on the same data directory keeps the identity (recipe file unchanged) and renders the
//     same frame;
//  3. replay: with every derived file removed (state, performance windows, public view, evidence), the receiver rebuilds
//     the project from its journal alone and renders the same frame.
// Frames are compared bit for bit (SwiftShader, the default renderer, is deterministic) and as a luminance thumbnail.
// node visual/identity.qual.js --datasets <dir>,<dir> [--family fractal-continuum] [--size 960x540] [--gpu amd] [--out dir]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {projectOf,launch,rendererOf,withService,recipeAction,filmPage,renderTo,thumb,diff,sha,checker}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const SETS=arg('datasets').split(',').map(d=>path.resolve(d)),FAMILY=arg('family','fractal-continuum'),[W,H]=arg('size','960x540').split('x').map(Number);
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','lab','identity'))),RAW=new Set(['id','salt','events.jsonl','blobs','recipe.json']);
const {checks,check}=checker();
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const browser=await launch(arg('gpu',null)),renderer=await rendererOf(browser),runs=[];
  try{
    for(const src of SETS){
      const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-identity-'));fs.cpSync(src,dir,{recursive:true});
      const project=projectOf(dir),pdir=path.join(dir,'projects',fs.readdirSync(path.join(dir,'projects'))[0]),run={dataset:path.basename(src),frames:{}};
      // The frame of the mature project (its last recorded moment), after 6 s of rendering so motion and camera are real.
      const frame=async svc=>{const {page,info,errors}=await filmPage(browser,svc,project,{width:W,height:H,query:'&labels=off'});await page.evaluate(()=>window.__film.setLabels('off'));
        const img=await renderTo(page,info.end-6000,info.end),st=await page.evaluate(()=>window.__film.stats());const t=await thumb(page,img);await page.close();return {img,t,st,errors};};
      const recipeOf=()=>fs.readFileSync(path.join(pdir,'recipe.json'),'utf8');
      await withService(dir,async svc=>{await recipeAction(svc,project,{type:'family',family:FAMILY});run.frames.first=await frame(svc);});
      run.recipe=recipeOf();
      await withService(dir,async svc=>{run.frames.restart=await frame(svc);});
      run.recipeAfterRestart=recipeOf();
      const removed=fs.readdirSync(pdir).filter(f=>!RAW.has(f));for(const f of removed)fs.rmSync(path.join(pdir,f),{recursive:true,force:true});run.removed=removed;
      await withService(dir,async svc=>{run.frames.rebuilt=await frame(svc);});
      run.recipeAfterRebuild=recipeOf();
      fs.writeFileSync(path.join(OUT,`identity-${FAMILY}-${run.dataset}.jpg`),Buffer.from(run.frames.first.img.split(',')[1],'base64'));
      const r=JSON.parse(run.recipe);run.identity={projectSeed:r.projectSeed,family:r.family,variant:r.variant,genome:sha(JSON.stringify(r.genome))};
      check(`${run.dataset}: a restart keeps the identity (recipe file unchanged)`,run.recipe===run.recipeAfterRestart,`seed ${r.projectSeed}, genome ${run.identity.genome}`);
      check(`${run.dataset}: a restart renders the same frame`,run.frames.first.img===run.frames.restart.img,`${sha(run.frames.first.img)} / ${sha(run.frames.restart.img)} (thumbnail difference ${diff(run.frames.first.t,run.frames.restart.t).toFixed(2)})`);
      check(`${run.dataset}: rebuilt from the journal alone (${removed.join(', ')} removed), the identity is the same`,run.recipe===run.recipeAfterRebuild);
      check(`${run.dataset}: rebuilt from the journal alone, the same frame`,run.frames.first.img===run.frames.rebuilt.img,`${sha(run.frames.first.img)} / ${sha(run.frames.rebuilt.img)} (thumbnail difference ${diff(run.frames.first.t,run.frames.rebuilt.t).toFixed(2)})`);
      for(const k of ['first','restart','rebuilt'])if(run.frames[k].errors.length)check(`${run.dataset}: no page errors (${k})`,false,run.frames[k].errors.slice(0,2).join(' | '));
      runs.push(run);fs.rmSync(dir,{recursive:true,force:true});
    }
    // Different projects, the same world: structure, not only colour. The thumbnails are compared in luminance.
    for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++){
      const a=runs[i],b=runs[j],d=diff(a.frames.first.t,b.frames.first.t),pick=s=>Object.fromEntries(Object.entries(s).filter(([k,v])=>typeof v==='number'||typeof v==='string').filter(([k])=>!/Ms$|^draw|^passes|^triangles|^points|^geometries|^textures|^programs|^intents|^activity|^fx$|^firing$/.test(k)));
      const sa=pick(a.frames.first.st),sb=pick(b.frames.first.st),differ=Object.keys(sa).filter(k=>sa[k]!==sb[k]&&k!=='family');
      check(`${a.dataset} and ${b.dataset} in ${FAMILY}: different structures (${differ.join(', ')})`,differ.length>=2&&d>8,`thumbnail difference ${d.toFixed(1)} (a frame against itself after a restart: ${diff(a.frames.first.t,a.frames.restart.t).toFixed(2)}); ${JSON.stringify(sa)} vs ${JSON.stringify(sb)}`);
    }
  }finally{await browser.close();}
  const file=path.join(OUT,`identity-${FAMILY}.json`);
  fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),renderer,family:FAMILY,size:`${W}x${H}`,checks,runs:runs.map(r=>({dataset:r.dataset,identity:r.identity,removed:r.removed,stats:r.frames.first.st,frames:Object.fromEntries(Object.entries(r.frames).map(([k,v])=>[k,sha(v.img)]))}))},null,1));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed · written ${path.relative(process.cwd(),file)}`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

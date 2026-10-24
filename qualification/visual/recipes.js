'use strict';
// Writes the pinned recipes used for the demonstration films, generated from each dataset's own projection
// (deterministic: createdAt is the recording's first timestamp, not the wall clock). A manual family choice is
// written as such (source "user"), so a reader can tell generated identities from overrides.
// node visual/recipes.js [--datasets results/datasets] [--out ../docs/worlds/recipes]
const path=require('node:path');
const fs=require('node:fs');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const recipes=require(path.join(REPO,'engine/recipe'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.resolve(arg('out',path.join(REPO,'docs','worlds','recipes')));
const PLAN=[['lumen','lumen-recipes',null],['excalidraw','excalidraw',null],['excalidraw','excalidraw-biosphere','fractal-biosphere'],['self','code-resonance',null]];
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const summary=[];
  for(const [dataset,name,family] of PLAN){
    const dir=path.join(DATA,dataset);const id=fs.readFileSync(path.join(dir,'projects',fs.readdirSync(path.join(dir,'projects'))[0],'id'),'utf8');
    const svc=await createService({port:0,dataDir:dir}).start();
    try{await svc.flush();
      const project=await (await fetch(`http://127.0.0.1:${svc.port}/api/project?id=${id}`)).json();
      const first=(await (await fetch(`http://127.0.0.1:${svc.port}/api/timeline?id=${id}&limit=1`)).json()).entries[0].start;
      const generated=recipes.generate(project,{now:first});
      const recipe=family?recipes.update(generated,{type:'family',family},project,first):generated;
      fs.writeFileSync(path.join(OUT,`${name}.json`),JSON.stringify(recipe,null,1)+'\n');
      summary.push({name,family:recipe.family,source:recipe.source,generatedFamily:generated.family,scores:generated.familyScores,variant:recipe.variant});
    }finally{await svc.stop();}
  }
  console.log(JSON.stringify(summary,null,1));
})().catch(e=>{console.error(e);process.exitCode=1;});

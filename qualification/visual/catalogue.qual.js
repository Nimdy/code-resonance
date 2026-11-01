'use strict';
// The parameter catalogue's ranges are rendered at both ends: for each built-in family (the six of engine/catalog.js
// FAMILIES), a declarative pack sets every catalogue parameter to its minimum (then its maximum; first / last enum
// value, false / true), and the Lumen Recipes recording is rendered with it. Each must render without page errors and
// without a black or blown-out frame.
//
// A preview family (engine/catalog.js PREVIEWS: Aurora), which no pack may take as its base, is chosen and tuned to every
// parameter's end instead (only when --families names it).
// node visual/catalogue.qual.js [--families a,b] [--tag name]
// --families: some families only; --tag: results in catalogue-qualification-<tag>.json instead of the main file.
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {REPO,projectOf,launch,rendererOf,withService,recipeAction,filmPage,thumb,checker}=require('./harness');
const packs=require(path.join(REPO,'engine/packs'));
const catalog=require(path.join(REPO,'engine/catalog'));
const {lumen}=require('./datasets');
const OUT=path.join(__dirname,'..','results','visual');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const FAMILIES=arg('families',null)?arg('families').split(','):Object.keys(catalog.FAMILIES),TAG=arg('tag',null);
for(const f of FAMILIES)if(!Object.hasOwn(catalog.FAMILIES,f)&&!Object.hasOwn(catalog.PREVIEWS,f))throw new Error(`unknown family ${f}`);
const {checks,check}=checker();const measurements={};
function extreme(spec,end){
  switch(spec.type){case 'number':case 'integer':return end?spec.max:spec.min;case 'enum':return end?spec.values.at(-1):spec.values[0];
    case 'boolean':return !!end;case 'color':return end?'#f0e6ff':'#303848';case 'vec3':return [0,1,2].map(()=>end?spec.max:spec.min);}
}
(async()=>{
  const browser=await launch();
  try{
    measurements.renderer=await rendererOf(browser);
    for(const family of FAMILIES)for(const end of [0,1]){const preview=!Object.hasOwn(catalog.FAMILIES,family),cat=preview?catalog.PREVIEWS[family]:catalog.FAMILIES[family];
      const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cr-catalogue-'));lumen(tmp);const dir=path.join(tmp,'lumen');
      const id=`qual.${family}-${end?'max':'min'}`,src=path.join(tmp,'pack');fs.mkdirSync(src);
      const overrides=Object.fromEntries(Object.entries(cat.parameters).map(([k,s])=>[k,extreme(s,end)]));
      if(!preview){fs.writeFileSync(path.join(src,'pack.json'),JSON.stringify({schema:'code-resonance.pack.v1',id,name:`${family} ${end?'max':'min'}`,version:'1.0.0',kind:'declarative',sdk:'^1.0',declarative:{base:family,overrides}}));
        packs.install(src,dir);}
      await withService(dir,async svc=>{
        const project=projectOf(dir);
        if(preview){await recipeAction(svc,project,{type:'family',family});await recipeAction(svc,project,{type:'tune',values:overrides});}
        else await recipeAction(svc,project,{type:'pack',pack:id});
        const {page,info,errors}=await filmPage(browser,svc,project,{width:960,height:540});
        const lumas=[];
        for(const at of [60000,160000,235000]){const t=info.start+at;await page.evaluate(x=>window.__film.seek(x),t-2000);let img;for(let x=t-2000;x<=t;x+=250)img=await page.evaluate(([x])=>window.__film.frame(x,.25),[x]);
          const th=await thumb(page,img);lumas.push(+(th.reduce((a,b)=>a+b,0)/th.length).toFixed(1));}
        const stats=await page.evaluate(()=>window.__film.stats());await page.close();
        measurements[id]={lumas,drawCalls:stats?.drawCalls,triangles:stats?.triangles,points:stats?.points};
        check(`catalogue: ${family} with every parameter at its ${end?'maximum':'minimum'} renders`,!errors.length&&lumas.every(l=>l>1.5&&l<235),
          `mean luma ${lumas.join(', ')}; ${stats?.drawCalls} draw calls, ${stats?.triangles} triangles${errors.length?` | ${errors[0]}`:''}`);
      });
      fs.rmSync(tmp,{recursive:true,force:true});
    }
  }finally{await browser.close();}
  fs.writeFileSync(path.join(OUT,`catalogue-qualification${TAG?`-${TAG}`:''}.json`),JSON.stringify({at:new Date().toISOString(),renderer:measurements.renderer,families:FAMILIES,checks,measurements},null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

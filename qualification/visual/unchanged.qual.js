'use strict';
// Regression: the three built-in worlds render exactly as before. The same recordings, recipes and moments are
// rendered by a baseline (default: the head of PR #3, checked out into a temporary git worktree) and by the working
// tree, with labels off (public titles changed on purpose), and the frames are compared byte for byte.
//
// node visual/unchanged.qual.js [--baseline a7c8cfe] [--datasets results/datasets]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const {REPO,projectOf,launch,rendererOf,sha,checker,adminPost}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const BASELINE=arg('baseline','a7c8cfe');
const DATA=path.resolve(arg('datasets',path.join(__dirname,'..','results','datasets')));
const OUT=path.join(__dirname,'..','results','visual');
const SETS=[{name:'lumen',family:'stellar-forge',at:[40000,96000,158000,238000]},{name:'excalidraw',family:'fractal-biosphere',at:[5000,30000]},
  {name:'self',family:'machine-cathedral',at:[300000,900000]},{name:'lumen',family:'fractal-biosphere',at:[100000,170000,238000]}];
const {checks,check}=checker();
async function render(root,browser,set){
  const {createService}=require(path.join(root,'receiver/server'));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-unchanged-'));fs.cpSync(path.join(DATA,set.name),dir,{recursive:true});
  const svc=await createService({port:0,dataDir:dir}).start();
  try{
    await svc.flush();const project=projectOf(dir);
    const r=await adminPost(svc,`/api/recipe?id=${project}`,{action:{type:'family',family:set.family}});
    if(!r.ok)throw new Error(await r.text());
    // Generator v3 gives a new built-in identity digital life (docs/LIFE.md) and v4 the cinematic finish; the world itself
    // is compared with life off and the classic finish, which render exactly as before (a tree without them has nothing
    // to turn off).
    const values={...fs.existsSync(path.join(root,'public/worlds/life/driver.js'))?{'life.enabled':false}:{},
      ...fs.readFileSync(path.join(root,'engine/catalog.js'),'utf8').includes("'technique.finish'")?{'technique.finish':'classic'}:{}};
    if(Object.keys(values).length){const t=await adminPost(svc,`/api/recipe?id=${project}`,{action:{type:'tune',values}});if(!t.ok)throw new Error(await t.text());}
    const page=await browser.newPage({viewport:{width:960,height:540}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${svc.port}/?film=1&world=living&labels=off&project=${project}`);await page.waitForFunction(()=>!!window.__film);
    const info=await page.evaluate(p=>window.__film.open({project:p,speed:1}),project);
    const frames=[];
    for(const at of set.at){const t=info.start+at;await page.evaluate(x=>window.__film.seek(x),t-2000);let img;for(let x=t-2000;x<=t;x+=100)img=await page.evaluate(([x])=>window.__film.frame(x,.1),[x]);frames.push(sha(img));}
    await page.close();return {frames,errors};
  }finally{await svc.stop();fs.rmSync(dir,{recursive:true,force:true});}
}
(async()=>{
  const tree=fs.mkdtempSync(path.join(os.tmpdir(),'cr-baseline-tree-'));
  cp.execFileSync('git',['worktree','add','--detach',tree,BASELINE],{cwd:REPO,stdio:'ignore'});
  const browser=await launch();const results=[];
  try{
    const renderer=await rendererOf(browser);
    for(const set of SETS){
      const before=await render(tree,browser,set),after=await render(REPO,browser,set);
      results.push({...set,before:before.frames,after:after.frames});
      check(`unchanged: ${set.name} as ${set.family} renders the same frames as ${BASELINE}`,JSON.stringify(before.frames)===JSON.stringify(after.frames)&&!after.errors.length,
        set.at.map((a,i)=>`${a/1000}s ${before.frames[i]===after.frames[i]?'same':'DIFFERENT'}`).join(', ')+(after.errors.length?` | ${after.errors[0]}`:''));
    }
    fs.writeFileSync(path.join(OUT,'unchanged-qualification.json'),JSON.stringify({at:new Date().toISOString(),baseline:BASELINE,renderer,checks,results},null,2));
  }finally{await browser.close();cp.execFileSync('git',['worktree','remove','--force',tree],{cwd:REPO,stdio:'ignore'});}
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

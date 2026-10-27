'use strict';
// Every Control Center workspace at the desktop sizes the application is designed for, from a real browser on an isolated
// installation (the seeded environment of ui/screenshots.js: the recorded Lumen session, a test project, the fictional
// demo, the three reference packs). The same data, routes and sizes every time, so before/after sets compare directly.
// Usage (from qualification/): node ui/workspace-shots.js [--gpu amd] [--out <dir>] [--sizes 1920x1080,2560x1440,1440x900,1280x720]
//        [--only home,projects,project-detail,visual-studio-saved,visual-studio-preview,music,packs,connections,record,settings,stage]
const path=require('node:path');
const fs=require('node:fs');
const {createEnvironment}=require('./environment');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const packs=require(path.join(REPO,'engine/packs'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const OUT=path.resolve(arg('out',path.join(REPO,'docs','desktop','after')));
const SIZES=arg('sizes','1920x1080,2560x1440,1440x900,1280x720').split(',').map(s=>s.split('x').map(Number));
const GPU=process.argv.includes('--gpu');
const ONLY=arg('only',null)?.split(',');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const env=await createEnvironment();
  try{
    for(const p of ['ember-observatory','blueprint-cathedral','cymatic-field'])packs.install(path.join(REPO,'packs/examples',p),env.dir);
    const cap=(await (await fetch(env.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url},body:JSON.stringify({pairing:env.pairing})})).json()).capability;
    const admin=(route,body)=>fetch(env.url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url,'X-Resonance-Capability':cap},body:JSON.stringify(body)}).then(r=>r.json());
    const {lumen,sample}=env.projects;
    await admin(`/api/recipe?id=${lumen}`,{actions:[{type:'family',family:'fractal-biosphere'},{type:'title',title:'Lumen Recipes'}]});
    const browser=await chromium.launch(GPU?{args:['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu','--autoplay-policy=no-user-gesture-required'],
      env:{...process.env,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}}
      :{args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
    const shots=[];
    async function shoot(name,route,[width,height],{project=lumen,settle=6000,before=null}={}){
      if(ONLY&&!ONLY.some(k=>name.includes(k)))return;
      const page=await (await browser.newContext({viewport:{width,height}})).newPage();
      await page.goto(`${env.url}/?project=${project}#/${route}`);
      await page.waitForFunction(()=>document.body.dataset.receiver==='connected',null,{timeout:30000});
      await wait(settle);if(before)await before(page);
      const file=path.join(OUT,`${name}-${width}x${height}.jpg`);await page.screenshot({path:file,type:'jpeg',quality:84});
      shots.push(path.relative(REPO,file));console.log('saved',path.relative(REPO,file));await page.context().close();
    }
    for(const size of SIZES){
      await shoot('01-home','home',size);
      await shoot('02-projects','projects',size);
      await shoot('03-project-detail',`projects/${lumen}`,size,{settle:7000});
      await shoot('04-visual-studio-saved','visual',size,{settle:14000});
      await shoot('05-visual-studio-preview','visual',size,{settle:12000,before:async p=>{await p.click('.vs-card[data-card="machine-cathedral"] .vs-card-main').catch(()=>{});await wait(9000);}});
      await shoot('06-music-studio','music',size);
      await shoot('07-visual-packs','packs',size);
      await shoot('08-connections','connections',size,{project:sample});
      await shoot('09-record-broadcast','output',size);
      await shoot('10-settings','settings',size);
      await shoot('11-stage-controls','stage',size,{settle:9000,before:async p=>{await p.mouse.move(size[0]/2,size[1]/2);await wait(300);}});
      await shoot('12-stage-clean','stage',size,{settle:9000,before:async p=>{await p.mouse.move(size[0]/2,size[1]/2);await wait(5000);}});
    }
    await browser.close();
    fs.writeFileSync(path.join(OUT,'README.md'),`# Control Center workspaces\n\nReal browser screenshots (headless Chromium, ${GPU?'AMD integrated GPU':'software rendering (SwiftShader)'}) of an isolated installation made by \`qualification/ui/workspace-shots.js\`: the recorded Lumen session (Fractal Biosphere, public title "Lumen Recipes"), the reference packs installed, the same routes and sizes for every set.\n\n${shots.map(s=>`- \`${path.basename(s)}\``).join('\n')}\n`);
  }finally{await env.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});

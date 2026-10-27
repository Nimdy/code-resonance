'use strict';
// Review screenshots of the Control Center and the Stage, from a real browser on an isolated installation (the seeded
// environment: a real recorded session, a test project, the fictional demo; the three reference packs installed, the
// world pack approved through the receiver's approval route). JPEG files in docs/control-center/.
// Usage (from qualification/): node ui/screenshots.js [--gpu amd]
const path=require('node:path');
const fs=require('node:fs');
const {createEnvironment}=require('./environment');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const packs=require(path.join(REPO,'engine/packs'));
const OUT=path.join(REPO,'docs','control-center');
const GPU=process.argv.includes('--gpu');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const env=await createEnvironment();
  try{
    for(const p of ['ember-observatory','blueprint-cathedral','cymatic-field'])packs.install(path.join(REPO,'packs/examples',p),env.dir);
    const cap=(await (await fetch(env.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url},body:JSON.stringify({pairing:env.pairing})})).json()).capability;
    const admin=(route,body)=>fetch(env.url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url,'X-Resonance-Capability':cap},body:JSON.stringify(body)}).then(r=>r.json());
    const list=(await (await fetch(env.url+'/api/packs')).json()).packs,cymatic=list.find(p=>p.id.endsWith('cymatic-field'));
    await admin('/api/packs/trust',{id:cymatic.id,digest:cymatic.digest,trusted:true});
    const {lumen,sample}=env.projects;
    await admin(`/api/recipe?id=${lumen}`,{actions:[{type:'family',family:'stellar-forge'},{type:'title',title:'Lumen Recipes'}]});
    const browser=await chromium.launch(GPU?{args:['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu','--autoplay-policy=no-user-gesture-required'],
      env:{...process.env,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}}
      :{args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
    const shots=[];
    async function shoot(name,route,{width=1440,height=900,project=lumen,settle=5000,before=null,base=env.url}={}){
      const page=await (await browser.newContext({viewport:{width,height}})).newPage();
      await page.goto(`${base}/${project?`?project=${project}`:''}#/${route}`);
      await page.waitForFunction(()=>document.body.dataset.receiver==='connected',null,{timeout:30000});
      await wait(settle);if(before)await before(page);
      const file=path.join(OUT,`${name}-${width}x${height}.jpg`);await page.screenshot({path:file,type:'jpeg',quality:84});
      shots.push(path.relative(REPO,file));console.log('saved',path.relative(REPO,file));await page.context().close();
    }
    await shoot('01-home','home');
    await shoot('02-projects','projects');
    await shoot('03-project-detail',`projects/${lumen}`,{settle:7000});
    await shoot('04-visual-studio','visual',{settle:12000});
    await shoot('05-visual-studio-preview','visual',{settle:12000,before:async p=>{await p.click('text=Machine Cathedral').catch(()=>{});await wait(9000);}});
    await shoot('06-music-studio','music',{before:async p=>{await p.click('#soundBtn');await wait(4000);}});
    await shoot('07-visual-packs',`packs/${cymatic.id}`,{settle:6000});
    await shoot('08-connections','connections',{project:sample});
    await shoot('09-record-broadcast','output');
    await shoot('10-settings','settings');
    await shoot('11-stage','stage',{settle:9000,before:async p=>{await p.mouse.move(700,450);await wait(300);}});
    await shoot('12-stage-clean','stage',{settle:9000,before:async p=>{await p.mouse.move(700,450);await wait(4000);}});
    await shoot('13-obs-view','',{width:1920,height:1080,settle:9000,before:async p=>{await p.goto(`${env.url}/?overlay=1&project=${lumen}`);await wait(9000);}});
    for(const r of ['home','visual','stage'])await shoot(`laptop-${r}`,r,{width:1280,height:720,settle:r==='visual'?12000:6000});
    // A first run: a clean installation of its own (no projects).
    const empty=await createEnvironment({empty:true});
    try{await shoot('first-run-home','home',{project:'',base:empty.url});}finally{await empty.stop();}
    await browser.close();
    fs.writeFileSync(path.join(OUT,'README.md'),`# Control Center screenshots\n\nReal browser screenshots (headless Chromium, ${GPU?'AMD integrated GPU':'software rendering (SwiftShader)'}) of an isolated installation made by \`qualification/ui/screenshots.js\`: a real recorded VS Code session (lumen-recipes, public title "Lumen Recipes"), a test project and the fictional demo, with the three reference packs installed and Cymatic Field approved. Regenerate with \`cd qualification && node ui/screenshots.js\`.\n\n${shots.map(s=>`- \`${path.basename(s)}\``).join('\n')}\n`);
  }finally{await env.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});

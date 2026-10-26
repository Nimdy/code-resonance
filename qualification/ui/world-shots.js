'use strict';
// Screenshots of the flagship worlds where people meet them: the Performance Stage (each built-in family on a real
// recorded session, the entry title card, the four supported resolutions) and the Visual Studio's world browser with
// its rendered thumbnails, curated looks and Essentials. A real browser on an isolated installation (the seeded
// environment of ui/screenshots.js). JPEG files in docs/worlds/spectacle/.
// Usage (from qualification/): node ui/world-shots.js [--gpu amd]
const path=require('node:path');
const fs=require('node:fs');
const {createEnvironment}=require('./environment');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const OUT=path.join(REPO,'docs','worlds','spectacle');
const GPU=process.argv.includes('--gpu');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const FAMILIES=[['fractal-biosphere','biosphere'],['stellar-forge','stellar'],['machine-cathedral','cathedral']];
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const env=await createEnvironment();
  try{
    const cap=(await (await fetch(env.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url},body:JSON.stringify({pairing:env.pairing})})).json()).capability;
    const admin=(route,body)=>fetch(env.url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url,'X-Resonance-Capability':cap},body:JSON.stringify(body)}).then(r=>r.json());
    const {lumen}=env.projects;
    const family=f=>admin(`/api/recipe?id=${lumen}`,{actions:[{type:'family',family:f},{type:'title',title:'Lumen Recipes'}]});
    const browser=await chromium.launch(GPU?{args:['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu','--autoplay-policy=no-user-gesture-required'],
      env:{...process.env,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}}
      :{args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
    const shots=[];
    async function shoot(name,route,{width=1920,height=1080,settle=9000,before=null}={}){
      const page=await (await browser.newContext({viewport:{width,height}})).newPage();
      await page.goto(`${env.url}/?project=${lumen}#/${route}`);
      await page.waitForFunction(()=>document.body.dataset.receiver==='connected',null,{timeout:30000});
      if(before)await before(page);else await wait(settle);
      const file=path.join(OUT,`${name}-${width}x${height}.jpg`);await page.screenshot({path:file,type:'jpeg',quality:86});
      shots.push(path.relative(REPO,file));console.log('saved',path.relative(REPO,file));await page.context().close();
    }
    // The Stage, clean: the pointer rests, the controls and the title card fade.
    const clean=async p=>{await wait(10000);await p.mouse.move(960,540);await wait(6000);};
    for(const [f,short] of FAMILIES){
      await family(f);
      await shoot(`stage-${short}`,'stage',{before:clean});
      if(short==='biosphere')await shoot('stage-entry-card','stage',{before:async p=>{await wait(1800);}});
    }
    // The supported resolutions, on the Machine Cathedral (the last family chosen).
    for(const [w,h] of [[2560,1440],[1440,900],[1280,720]])await shoot('stage-cathedral','stage',{width:w,height:h,before:clean});
    await family('fractal-biosphere');
    // The world browser: thumbnails render one family at a time from this project.
    await shoot('visual-studio-worlds','visual',{settle:30000});
    await shoot('visual-studio-curated','visual',{before:async p=>{await wait(8000);await p.click('.vs-browser-head .segmented button[data-value="presets"]');await wait(1500);
      await p.getByRole('button',{name:'Preview the preset Bioluminescent abyss'}).click();await wait(9000);}});
    await shoot('visual-studio-essentials','visual',{before:async p=>{await wait(10000);await p.locator('.vs-params').scrollIntoViewIfNeeded().catch(()=>{});await wait(1000);}});
    await browser.close();
    fs.writeFileSync(path.join(OUT,'README.md'),`# Flagship worlds: screenshots\n\nReal browser screenshots (headless Chromium, ${GPU?'AMD integrated GPU':'software rendering (SwiftShader)'}) of an isolated installation made by \`qualification/ui/world-shots.js\` on the recorded Lumen session.\n\n${shots.map(s=>`- \`${path.basename(s)}\``).join('\n')}\n`);
  }finally{await env.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});

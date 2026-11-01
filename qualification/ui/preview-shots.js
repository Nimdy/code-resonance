'use strict';
// The preview worlds where people meet them, for a UI/UX review: the Visual Studio with each preview chosen, the Stage at
// rest, the Stage in a replay while two agents work (Explorer labels: agent chips and every subsystem's name), the hover
// card on what the pointer rests on, and Record & Broadcast. A real browser on an isolated installation (the seeded
// environment of ui/screenshots.js: the recorded Lumen session). JPEG files in --out.
// Usage (from qualification/): node ui/preview-shots.js [--gpu] [--out <dir>] [--size 1920x1080]
const path=require('node:path');
const fs=require('node:fs');
const {createEnvironment}=require('./environment');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const OUT=path.resolve(arg('out',path.join(REPO,'qualification','results','lab','ui-previews'))),[W,H]=arg('size','1920x1080').split('x').map(Number);
const GPU=process.argv.includes('--gpu');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const FAMILIES=['fractal-continuum','synaptic-storm','temporal-terrain','aurora'];
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const env=await createEnvironment();
  try{
    const cap=(await (await fetch(env.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url},body:JSON.stringify({pairing:env.pairing})})).json()).capability;
    const admin=(route,body)=>fetch(env.url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url,'X-Resonance-Capability':cap},body:JSON.stringify(body)}).then(r=>r.json());
    const {lumen}=env.projects;
    const browser=await chromium.launch(GPU?{args:['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu','--autoplay-policy=no-user-gesture-required'],
      env:{...process.env,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}}
      :{args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
    const notes=[];
    const open=async route=>{const page=await (await browser.newContext({viewport:{width:W,height:H}})).newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
      await page.goto(`${env.url}/?project=${lumen}#/${route}`);await page.waitForFunction(()=>document.body.dataset.receiver==='connected',null,{timeout:30000});return {page,errors};};
    const save=async(page,name)=>{const file=path.join(OUT,`${name}.jpg`);await page.screenshot({path:file,type:'jpeg',quality:86});console.log('saved',path.relative(process.cwd(),file));};
    // The Visual Studio, the saved identity a flagship world: the strip as it first shows (thumbnails rendering)
    await admin(`/api/recipe?id=${lumen}`,{actions:[{type:'family',family:'fractal-biosphere'},{type:'title',title:'Lumen Recipes'}]});
    {const {page,errors}=await open('visual');await wait(30000);await save(page,'visual-strip');
      const cards=await page.$$eval('.vs-cards .vs-card',els=>els.map(e=>{const r=e.getBoundingClientRect(),s=e.closest('.vs-cards').getBoundingClientRect();return {id:e.dataset.card,img:!!e.querySelector('.vs-thumb img'),visible:Math.max(0,Math.min(r.right,s.right)-Math.max(r.left,s.left))/r.width};}));
      notes.push({view:'visual-strip',cards,errors});
      for(const f of FAMILIES){await page.click(`.vs-card[data-card="${f}"] .vs-card-main`).catch(e=>notes.push({view:'visual-'+f,error:String(e).slice(0,160)}));await wait(12000);await save(page,`visual-${f}`);}
      await page.context().close();}
    for(const f of FAMILIES){
      await admin(`/api/recipe?id=${lumen}`,{actions:[{type:'family',family:f}]});
      {const {page,errors}=await open('stage');await wait(12000);await page.mouse.move(W/2,H/2);await wait(5000);await save(page,`stage-${f}-rest`);
        // the hover card: the pointer rests on the world until it names something
        let named=null;for(let y=.3;y<=.75&&!named;y+=.05)for(let x=.25;x<=.75&&!named;x+=.05){await page.mouse.move(W*x,H*y);await wait(260);
          named=await page.evaluate(()=>{const c=document.getElementById('worldHover');return c&&!c.hidden?c.innerText.slice(0,200):null;});}
        if(named)await save(page,`stage-${f}-hover`);notes.push({view:`stage-${f}`,hover:named,errors});
        // a replay while two agents work, Explorer labels
        await page.evaluate(()=>{const P=window.ResonancePlayer;P.setLabels('explorer');P.setMode('replay');});
        await page.waitForFunction(()=>window.ResonancePlayer.state.position.loaded,null,{timeout:30000});
        await page.evaluate(()=>{const P=window.ResonancePlayer,s=P.state.position;P.setSpeed(1);P.seek(s.start+10500);P.play();});await wait(6500);
        await page.mouse.move(W-4,H/2);await wait(300);await save(page,`stage-${f}-explorer-agents`);
        await page.evaluate(()=>{const P=window.ResonancePlayer,s=P.state.position;P.pause();P.seek(s.end);P.play();});await wait(6000);await save(page,`stage-${f}-explorer-end`);
        await page.context().close();}
      {const {page}=await open('output');await wait(9000);await save(page,`output-${f}`);await page.context().close();}
    }
    fs.writeFileSync(path.join(OUT,'notes.json'),JSON.stringify(notes,null,1));console.log(JSON.stringify(notes,null,1));
    await browser.close();
  }finally{await env.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});

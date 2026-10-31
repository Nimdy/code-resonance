'use strict';
// The web demo (npm run site) as a visitor meets it: the built site served as GitHub Pages serves a project site (under
// /code-resonance/, so every URL it uses must be relative), opened in a real browser, one browser at a time.
// - Desktop: the landing loads with no failed request, no request outside the site and no page error; Start turns the
//   music on (an AudioContext running) and the replay advances; each world (the six families, the Construct,
//   Monolith) is chosen with the landing's own buttons, renders a picture that is not blank (measured on the
//   screenshot) while the replay keeps advancing.
// - Phone (390x844, touch): no horizontal scrolling, the controls fit the screen, Start plays, a world is chosen with
//   the menu that replaces the buttons there.
// JPEG screenshots and notes.json in --out (default qualification/results/lab/web-demo/<gpu|swiftshader>, ignored).
// Usage (from qualification/): node site/web-demo.qual.js [--gpu] [--out <dir>] [--site <built site>] [--settle <ms>]
//   --gpu: the AMD GPU through Mesa's D3D12 driver (WSL), as ui/preview-shots.js; default: SwiftShader.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {buildSite,serve,PREFIX}=require(path.join(REPO,'scripts/build-site.js'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const GPU=process.argv.includes('--gpu');
const OUT=path.resolve(arg('out',path.join(REPO,'qualification','results','lab','web-demo',GPU?'gpu':'swiftshader')));
const SETTLE=Number(arg('settle',GPU?6000:9000));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];let failed=0;
function check(name,ok,detail=''){results.push({name,ok:!!ok,detail});if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?`  (${detail})`:''}`);}
// Brightness and contrast of a screenshot, decoded by the browser on a blank page (luma 0..255).
async function picture(analyser,png){
  return analyser.evaluate(async b64=>{
    const blob=await (await fetch(`data:image/png;base64,${b64}`)).blob(),bmp=await createImageBitmap(blob);
    const c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.drawImage(bmp,0,0);const d=g.getImageData(0,0,bmp.width,bmp.height).data;
    let n=0,sum=0,sq=0,lit=0;const hues=new Set();
    for(let i=0;i<d.length;i+=16){const y=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];n++;sum+=y;sq+=y*y;if(y>40)lit++;hues.add(`${d[i]>>5},${d[i+1]>>5},${d[i+2]>>5}`);}
    const mean=sum/n;return {luma:+mean.toFixed(1),contrast:+Math.sqrt(Math.max(0,sq/n-mean*mean)).toFixed(1),lit:+(lit/n*100).toFixed(2),colours:hues.size,size:`${bmp.width}x${bmp.height}`};
  },png.toString('base64'));
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const prebuilt=arg('site',null);
  const temp=prebuilt?null:fs.mkdtempSync(path.join(os.tmpdir(),'cr-site-qual-'));
  const built=prebuilt?{out:path.resolve(prebuilt),bytes:null,files:null}:await buildSite({out:path.join(temp,'site'),log:m=>console.log(m)});
  const server=await serve(built.out,{port:0});
  console.log(`site ${server.url} (${GPU?'AMD GPU':'SwiftShader'})`);
  const browser=await chromium.launch(GPU?{args:['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu'],
    env:{...process.env,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}}
    :{args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const notes={gpu:GPU,url:server.url,site:{files:built.files,bytes:built.bytes,mb:built.bytes&&+(built.bytes/1048576).toFixed(2)},worlds:[],mobile:null};
  const analyser=await (await browser.newContext()).newPage();
  // The renderer actually used: a GPU run that fell back to SwiftShader is not a GPU result.
  notes.renderer=await analyser.evaluate(()=>{const g=document.createElement('canvas').getContext('webgl2');const e=g?.getExtension('WEBGL_debug_renderer_info');return g?e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'webgl2 (renderer hidden)':'no WebGL2';});
  console.log(`WebGL renderer: ${notes.renderer}`);
  if(GPU)check('the GPU renders (not SwiftShader)',!/swiftshader/i.test(notes.renderer),notes.renderer);
  // Every request a page makes, what failed, what left the site, and the page's errors.
  function watch(page){
    const w={requests:[],failed:[],outside:[],errors:[],console:[]};
    page.on('request',r=>{const u=new URL(r.url());if(u.protocol==='data:'||u.protocol==='blob:')return;w.requests.push(`${r.method()} ${u.pathname}${u.search}`);
      if(u.origin!==new URL(server.url).origin||!u.pathname.startsWith(PREFIX))w.outside.push(r.url());});
    page.on('requestfailed',r=>w.failed.push(`${r.url()} ${r.failure()?.errorText||''}`));
    page.on('response',r=>{if(r.status()>=400)w.failed.push(`${r.url()} HTTP ${r.status()}`);});
    page.on('pageerror',e=>w.errors.push(String(e).slice(0,300)));
    page.on('console',m=>{if(m.type()==='error')w.console.push(m.text().slice(0,300));});
    return w;
  }
  // Count the AudioContexts the page makes and report their state (the music runs in one).
  const audioProbe=()=>{const A=window.AudioContext;if(!A)return;const all=[];window.__audioContexts=all;
    window.AudioContext=class extends A{constructor(...a){super(...a);all.push(this);}};};
  const state=page=>page.evaluate(()=>{const s=window.ResonancePlayer.state;return {mode:s.mode,playing:s.playing,now:s.position.now,start:s.position.start,end:s.position.end,loaded:s.position.loaded,
    world:s.world,family:s.recipe?.family||null,title:s.recipe?.title||null,running:s.worldStatus.running,loading:s.worldStatus.loading,failed:s.worldStatus.failed,sound:s.sound.enabled,
    quality:s.quality,level:s.qualityLevel,rendering:s.rendering,speed:s.speed,
    audio:(window.__audioContexts||[]).map(c=>c.state),notices:s.notices.map(n=>n.text)};});
  try{
    // ---- Desktop ------------------------------------------------------------------------------------------------
    {
      const ctx=await browser.newContext({viewport:{width:1600,height:900}});await ctx.addInitScript(audioProbe);
      const page=await ctx.newPage(),w=watch(page);const t0=Date.now();
      await page.goto(server.url);
      await page.waitForSelector('#wdStart',{state:'visible',timeout:30000});
      await page.waitForFunction(()=>{const s=window.ResonancePlayer?.state;return s&&s.mode==='replay'&&s.position.loaded&&s.worldStatus.running;},null,{timeout:120000});
      const ready=Date.now()-t0;
      await wait(SETTLE);
      const landing=await state(page);
      await page.screenshot({path:path.join(OUT,'desktop-landing.jpg'),type:'jpeg',quality:85});
      // The world is the recording's generated identity (generator 5 may choose any of the six built-in families).
      check('landing: the Stage opens on the replay of the recording in a built-in world family',landing.mode==='replay'&&landing.world==='living'&&['stellar-forge','fractal-biosphere','machine-cathedral','synaptic-storm','fractal-continuum','temporal-terrain'].includes(landing.family)&&landing.title==='Lumen Recipes',
        `${landing.family}, "${landing.title}", ready in ${ready} ms`);
      check('landing: the replay plays silently behind the introduction',landing.playing&&!landing.sound&&landing.now>landing.start,`${Math.round((landing.now-landing.start)/1000)} s in`);
      check('landing: no AudioContext runs before the click',!landing.audio.includes('running'),JSON.stringify(landing.audio));
      await page.click('#wdStart');
      await page.waitForFunction(()=>window.ResonancePlayer.state.sound.enabled,null,{timeout:15000});
      const a=await state(page);await wait(3000);const b=await state(page);
      check('Start: the music starts (an AudioContext is running)',b.sound&&b.audio.includes('running'),JSON.stringify(b.audio));
      check('Start: the introduction closes and the replay starts again from the beginning and advances',await page.$eval('#wdIntro',e=>e.hidden)&&b.playing&&b.now>a.now&&a.now-a.start<30000,
        `${Math.round((a.now-a.start)/1000)} s -> ${Math.round((b.now-b.start)/1000)} s at ${b.speed}x`);
      const controls=await page.evaluate(()=>({live:!!document.querySelector('#liveBtn')?.offsetParent,back:!!document.querySelector('.stage-back')?.offsetParent,
        worlds:[...document.querySelectorAll('[data-wd-world]')].map(b=>b.dataset.wdWorld),brand:!!document.querySelector('.wd-brand'),speed:!!document.querySelector('#speedSelect')?.offsetParent,
        links:[...document.querySelectorAll('.wd-links-top a')].map(a=>a.href)}));
      check('Stage: no Live or Control Center control; a speed menu; eight worlds; links to the repository',!controls.live&&!controls.back&&controls.speed&&controls.worlds.length===8&&controls.brand&&controls.links.length===2,JSON.stringify(controls));
      // Esc never leaves the Stage (there is no Control Center in the site).
      await page.keyboard.press('Escape');await page.keyboard.press('Escape');await wait(400);
      check('Stage: Esc twice stays on the Stage',await page.evaluate(()=>location.hash==='#/stage'&&!!document.querySelector('.stage-chrome-ui')));
      for(const id of ['stellar-forge','fractal-biosphere','machine-cathedral','synaptic-storm','fractal-continuum','temporal-terrain','construct','city']){
        await page.mouse.move(800,450);await page.click(`[data-wd-world="${id}"]`);
        await page.waitForFunction(id=>{const s=window.ResonancePlayer.state;return id==='construct'||id==='city'?s.world===id:s.world==='living'&&s.recipe?.family===id&&s.worldStatus.running&&!s.worldStatus.loading;},id,{timeout:60000});
        const before=await state(page);
        // The pointer rests: the controls fade and the world is seen alone.
        await page.mouse.move(1599,450);await wait(SETTLE);
        const after=await state(page);
        const file=path.join(OUT,`desktop-${id}.jpg`),png=await page.screenshot({type:'png'});fs.writeFileSync(file,await page.screenshot({type:'jpeg',quality:85}));
        const pic=await picture(analyser,png);
        const pressed=await page.$eval(`[data-wd-world="${id}"]`,b=>b.getAttribute('aria-pressed'));
        // Advancing, or played to the end and started again (the landing loops the recording).
        const advanced=after.playing&&after.now!==before.now;
        notes.worlds.push({id,picture:pic,advancedSeconds:Math.round((after.now-before.now)/1000),looped:after.now<before.now,quality:after.level,rendering:after.rendering,file:path.relative(REPO,file)});
        check(`world ${id}: shown, its button pressed, the picture is not blank, the replay advances`,pressed==='true'&&pic.contrast>6&&pic.lit>.5&&pic.colours>12&&advanced,
          `luma ${pic.luma}, contrast ${pic.contrast}, lit ${pic.lit} %, ${pic.colours} colours, ${after.now<before.now?'looped to the start':`+${Math.round((after.now-before.now)/1000)} s`}, level ${after.level}`);
      }
      const last=await state(page);
      notes.desktop={ready,landing,last,requests:[...new Set(w.requests)].sort(),notices:last.notices};
      const resources=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((s,e)=>s+(e.decodedBodySize||0),0)+(performance.getEntriesByType('navigation')[0]?.decodedBodySize||0));
      notes.desktop.loadedBytes=resources;
      check('desktop: zero failed requests',!w.failed.length,w.failed.slice(0,5).join(' | '));
      check('desktop: every request stays under the site path (relative URLs)',!w.outside.length,w.outside.slice(0,5).join(' | '));
      check('desktop: zero page errors and console errors',!w.errors.length&&!w.console.length,[...w.errors,...w.console].slice(0,4).join(' | '));
      console.log(`desktop: ${new Set(w.requests).size} distinct requests, ${(resources/1048576).toFixed(2)} MB loaded`);
      await ctx.close();
    }
    // ---- Phone --------------------------------------------------------------------------------------------------
    {
      const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,
        userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'});
      await ctx.addInitScript(audioProbe);
      const page=await ctx.newPage(),w=watch(page);
      await page.goto(server.url);
      await page.waitForSelector('#wdStart',{state:'visible',timeout:30000});
      await page.waitForFunction(()=>{const s=window.ResonancePlayer?.state;return s&&s.mode==='replay'&&s.position.loaded&&s.worldStatus.running;},null,{timeout:120000});
      await wait(SETTLE);
      await page.screenshot({path:path.join(OUT,'phone-landing.jpg'),type:'jpeg',quality:85});
      const fit=()=>page.evaluate(()=>{const inView=sel=>{const e=document.querySelector(sel);if(!e||!e.offsetParent)return null;const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1;};
        return {scrollWidth:document.documentElement.scrollWidth,bodyScroll:document.body.scrollWidth,width:innerWidth,start:inView('#wdStart'),play:inView('#playBtn'),scrub:inView('#scrub'),speed:inView('#speedSelect'),
          worlds:inView('#wdWorldSelect'),sound:inView('#stageSoundBtn'),buttons:!!document.querySelector('.wd-worlds')?.offsetParent};});
      const f1=await fit();
      check('phone: the landing fits (no horizontal scrolling, Start on screen)',f1.scrollWidth<=f1.width&&f1.bodyScroll<=f1.width&&f1.start,JSON.stringify(f1));
      await page.tap('#wdStart');
      await page.waitForFunction(()=>window.ResonancePlayer.state.sound.enabled,null,{timeout:15000});
      const a=await state(page);await wait(3000);const b=await state(page);
      check('phone: Start plays with sound and the replay advances',b.audio.includes('running')&&b.playing&&b.now>a.now,`${JSON.stringify(b.audio)}, +${Math.round((b.now-a.now)/1000)} s`);
      await page.tap('#stageHost',{position:{x:195,y:400}}).catch(()=>{});await wait(400);
      const f2=await fit();
      check('phone: the transport, the world menu and sound fit the screen; the seven buttons give way to the menu',f2.play&&f2.scrub&&f2.speed&&f2.worlds&&f2.sound&&!f2.buttons&&f2.scrollWidth<=f2.width,JSON.stringify(f2));
      await page.screenshot({path:path.join(OUT,'phone-controls.jpg'),type:'jpeg',quality:85});
      await page.selectOption('#wdWorldSelect','machine-cathedral');
      await page.waitForFunction(()=>{const s=window.ResonancePlayer.state;return s.world==='living'&&s.recipe?.family==='machine-cathedral'&&s.worldStatus.running&&!s.worldStatus.loading;},null,{timeout:60000});
      await wait(SETTLE);
      const png=await page.screenshot({type:'png'});fs.writeFileSync(path.join(OUT,'phone-machine-cathedral.jpg'),await page.screenshot({type:'jpeg',quality:85}));
      const pic=await picture(analyser,png),c=await state(page);
      check('phone: a world chosen from the menu renders (not blank)',pic.contrast>6&&pic.lit>.5,`luma ${pic.luma}, contrast ${pic.contrast}, lit ${pic.lit} %, level ${c.level}, ${JSON.stringify(c.rendering)}`);
      notes.mobile={fit:[f1,f2],picture:pic,state:c};
      check('phone: zero failed requests, none outside the site, zero page errors',!w.failed.length&&!w.outside.length&&!w.errors.length&&!w.console.length,[...w.failed,...w.outside,...w.errors,...w.console].slice(0,4).join(' | '));
      await ctx.close();
    }
  }catch(e){check('the run completed',false,String(e.stack||e).slice(0,600));}
  finally{
    notes.results=results;fs.writeFileSync(path.join(OUT,'notes.json'),JSON.stringify(notes,null,1));
    await browser.close();await server.close();if(temp)fs.rmSync(temp,{recursive:true,force:true});
  }
  console.log(`\n${results.length-failed}/${results.length} checks passed; screenshots and notes in ${path.relative(process.cwd(),OUT)}`);
  process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});

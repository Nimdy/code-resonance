'use strict';
// End-to-end acceptance of the Control Center and the Performance Stage across views (scenarios A, B, G, H, I, J of the
// Phase 6 brief; the workspaces' own suites in qualification/ui/workspaces/ cover C, D, E, F in depth). Real receiver
// on a temporary data directory, real Chromium (SwiftShader by default), the real interface.
// Usage: node ui/acceptance.qual.js [--quick]   (from qualification/)
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../..');
const {createEnvironment}=require('./environment');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const OUT=path.join(__dirname,'..','results','ui');
const QUICK=process.argv.includes('--quick');
const checks=[],measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail).slice(0,400)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${String(detail).slice(0,300)}`:''}`);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const LAUNCH={args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']};
// Pages opened from one browser context are windows of one browser profile (they share BroadcastChannel and storage,
// like a user's windows); a fresh context is a different profile.
async function open(context,url,{width=1440,height=900}={}){
  const page=await context.newPage();await page.setViewportSize({width,height});const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
  page.on('request',r=>requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.goto(url);return {page,errors,requests};
}
const engine=(page,fn,arg)=>page.evaluate(fn,arg);
async function ready(page,timeout=30000){await page.waitForFunction(()=>document.body.dataset.receiver==='connected'&&!!window.ResonancePlayer,null,{timeout});}
async function capability(url,pairing){const r=await fetch(url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({pairing})});if(!r.ok)throw new Error(`session ${r.status}`);return (await r.json()).capability;}
async function admin(url,cap,p,body){const r=await fetch(url+p,{method:'POST',headers:{'Content-Type':'application/json',Origin:url,'X-Resonance-Capability':cap},body:JSON.stringify(body)});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(`${p} ${r.status} ${JSON.stringify(data)}`);return data;}
const getJSON=async u=>(await fetch(u)).json();
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const browser=await chromium.launch(LAUNCH);
  const fresh=()=>browser.newContext({acceptDownloads:true});
  try{
    // ---- Scenario A: first run, a real project appears, the Stage opens --------------------------------------------
    {
      const env=await createEnvironment({empty:true});
      try{
        const {page,errors}=await open(await fresh(),env.url+'/');await ready(page);await wait(1500);
        const before=await engine(page,()=>({projects:document.getElementById('projectTitle').textContent,project:window.ResonancePlayer.state.project}));
        check('A: a clean installation starts with no project and says so',!before.project&&/No project/i.test(before.projects),JSON.stringify(before));
        await page.screenshot({path:path.join(OUT,'acceptance-a-first-run.png')});
        const text=await page.evaluate(()=>document.body.innerText);
        check('A: no demonstration or fabricated activity on a clean installation',!/demo-orbit|fictional demo|Capture running/i.test(text),'');
        // A project captured through the real ingestion API (as the VS Code extension sends it).
        const id=sha('acceptance-first-run'),auth={Authorization:`Bearer ${env.svc.token}`};let n=0;
        const ev=(kind,x={})=>({v:1,id:`acc-a-${++n}`,ts:Date.now(),kind,projectId:id,sessionId:'acc-a',origin:'unknown',...x});
        await fetch(env.url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({events:[ev('workspace.started',{name:'first-run-check',meta:{extensionVersion:'0.5.0'}}),
          ev('document.snapshot',{file:'src/a.ts',content:'export function a(){return 1}\nexport class B {}\n',meta:{reason:'baseline'}}),ev('document.snapshot',{file:'src/c.ts',content:'import {a} from "./a";\nexport const c=a();\n',meta:{reason:'baseline'}})]})});
        await fetch(env.url+`/v1/flush?id=${id}`,{method:'POST',headers:auth});
        const t0=Date.now();
        await page.waitForFunction(id=>window.ResonancePlayer.state.project===id,id,{timeout:20000}).catch(()=>{});
        const appeared=await engine(page,()=>window.ResonancePlayer.state.project);
        measurements.firstProjectMs=Date.now()-t0;
        check('A: the project appears without a reload (change feed)',appeared===id,`after ${measurements.firstProjectMs} ms`);
        await page.goto(env.url+'/#/stage');await ready(page);await page.waitForTimeout(6000);
        const stage=await engine(page,()=>({world:window.ResonancePlayer.state.world,running:window.ResonancePlayer.state.worldStatus.running,title:document.getElementById('stageTitle')?.textContent}));
        check('A: the Stage opens on the project with the living world running',stage.running&&stage.world==='living',JSON.stringify(stage));
        check('A: the Stage does not show the private folder name',!/first-run-check/.test(await page.evaluate(()=>document.body.innerText)),stage.title);
        await page.screenshot({path:path.join(OUT,'acceptance-a-stage.png')});
        check('A: no page errors',errors.length===0,errors.slice(0,3).join(' | '));
        // Pairing: a browser without the receiver's key can watch but not change anything; the dialog pairs it.
        await page.evaluate(()=>{sessionStorage.setItem('qual-unpaired','1');localStorage.removeItem('code-resonance-pairing');});await page.goto(env.url+'/#/settings');await page.reload();await ready(page);await wait(1500);
        const shown=await page.evaluate(()=>!document.getElementById('pairBtn').hidden);
        const refused=await page.evaluate(()=>window.ResonancePlayer.api.post('/api/settings',{patch:{stage:{captions:false}}}).then(()=>'accepted',e=>e.code));
        await page.waitForSelector('.modal-backdrop',{timeout:5000}).catch(()=>{});
        const dialog=await page.evaluate(()=>document.querySelector('.modal h2')?.textContent||'');
        check('A: an unpaired browser is told so and its changes are refused',shown&&refused==='pairing-required'&&/Pair this browser/.test(dialog),JSON.stringify({shown,refused,dialog}));
        await page.fill('.modal input',await env.pairLink());await page.click('.modal .field-row .btn');await wait(1500);
        const paired=await page.evaluate(async()=>({state:window.ResonancePlayer.pairing,button:document.getElementById('pairBtn').hidden,
          saved:await window.ResonancePlayer.api.post('/api/settings',{patch:{stage:{captions:false}}}).then(r=>r.stage.captions,e=>e.code)}));
        check('A: pasting the private link pairs the browser, and changes are accepted',paired.state==='paired'&&paired.button&&paired.saved===false,JSON.stringify(paired));
        await page.evaluate(()=>window.ResonancePlayer.api.post('/api/settings',{patch:{stage:{captions:true}}}));
        // The private link (what npm start / npm run pair print): a fresh browser opening it is paired, and the key leaves
        // the address bar at once.
        const linkCtx=await fresh(),viaLink=await linkCtx.newPage();await viaLink.evaluate(()=>{});
        await viaLink.goto(env.url+'/');await viaLink.evaluate(()=>{sessionStorage.setItem('qual-unpaired','1');localStorage.clear();});
        const link=await env.pairLink();await viaLink.goto('about:blank');await viaLink.goto(link);await ready(viaLink);
        await viaLink.waitForFunction(()=>window.ResonancePlayer.pairing!=='unknown',null,{timeout:8000}).catch(()=>{});
        const linked=await viaLink.evaluate(async()=>({hash:location.hash,stored:/^[0-9a-f]{64}$/.test(localStorage.getItem('code-resonance-pairing')||''),saved:await window.ResonancePlayer.api.post('/api/settings',{patch:{interface:{motion:'system'}}}).then(()=>'saved',e=>e.code),state:window.ResonancePlayer.pairing}));
        check('A: opening a pairing link (single-use code) pairs a fresh browser, removes the code from the address, and the code cannot be used twice',linked.saved==='saved'&&linked.state==='paired'&&linked.stored&&!/pair=/.test(linked.hash)&&(await fetch(env.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.url},body:JSON.stringify({code:link.split('pair=')[1]})})).status===403,JSON.stringify(linked));
        // The same, opened in a tab that already shows the application (only the fragment changes, no reload).
        await viaLink.evaluate(()=>localStorage.removeItem('code-resonance-pairing'));await viaLink.reload();await ready(viaLink);await wait(800);
        const inTab=await env.pairLink();await viaLink.evaluate(h=>{location.hash=h;},'#'+inTab.split('#')[1]);
        await viaLink.waitForFunction(()=>window.ResonancePlayer.pairing==='paired',null,{timeout:8000}).catch(()=>{});
        const tab=await viaLink.evaluate(()=>({state:window.ResonancePlayer.pairing,hash:location.hash,ui:localStorage.getItem('code-resonance-ui-v1')||''}));
        check('A: a pairing link opened in an already open tab pairs it and leaves no code in the address or stored routes',tab.state==='paired'&&!/pair=/.test(tab.hash+tab.ui),JSON.stringify(tab));
        await linkCtx.close();
        await page.close();
      }finally{await env.stop();}
    }
    // ---- Scenarios B, G, H, I on a populated installation ------------------------------------------------------------
    const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'cr-acceptance-'));
    let env=await createEnvironment({dataDir:dir});
    const port=env.svc.port;
    try{
      const {lumen,sample}=env.projects;let url=env.url,cap=await capability(url,env.pairing);
      // B: two projects with independent identities and preferences.
      await admin(url,cap,`/api/recipe?id=${lumen}`,{actions:[{type:'family',family:'machine-cathedral'},{type:'title',title:'Lumen Nights'},{type:'tune',values:{'light.bloom':1.5}}]});
      await admin(url,cap,`/api/recipe?id=${sample}`,{actions:[{type:'family',family:'stellar-forge'},{type:'overrides',intensity:.6}]});
      await admin(url,cap,`/api/preferences?id=${lumen}`,{patch:{music:{style:'cinematic'}}});
      await admin(url,cap,`/api/preferences?id=${sample}`,{patch:{music:{style:'chip',texture:.3},world:'living'}});
      const windows=await fresh();
      const {page:cc,errors:ccErrors}=await open(windows,`${url}/?project=${lumen}#/home`);await ready(cc);
      await cc.waitForFunction(()=>window.ResonancePlayer.state.recipe?.family==='machine-cathedral'&&window.ResonancePlayer.state.sound.options.style==='cinematic',null,{timeout:30000}).catch(()=>{});
      const a1=await engine(cc,()=>({family:window.ResonancePlayer.state.recipe?.family,style:window.ResonancePlayer.state.sound.options.style,title:window.ResonancePlayer.state.recipe?.title}));
      check('B: project one plays its own identity and music',a1.family==='machine-cathedral'&&a1.style==='cinematic'&&a1.title==='Lumen Nights',JSON.stringify(a1));
      // Switch through the project switcher in the top bar.
      await cc.click('.project-switch');await cc.click(`.menu-item:has-text("sample-app")`);
      await cc.waitForFunction(id=>window.ResonancePlayer.state.project===id&&window.ResonancePlayer.state.recipe?.family==='stellar-forge',sample,{timeout:30000}).catch(()=>{});
      const b1=await engine(cc,()=>({project:window.ResonancePlayer.state.project,family:window.ResonancePlayer.state.recipe?.family,style:window.ResonancePlayer.state.sound.options.style,texture:window.ResonancePlayer.state.sound.options.texture,intensity:window.ResonancePlayer.state.recipe?.overrides?.intensity}));
      check('B: switching projects switches identity and music, independently',b1.project===sample&&b1.family==='stellar-forge'&&b1.style==='chip'&&b1.texture===.3&&b1.intensity===.6,JSON.stringify(b1));
      // A project's own information mode applies in every world, also after switching projects (the recipe is read even
      // when no living world loads it).
      await admin(url,cap,`/api/recipe?id=${lumen}`,{action:{type:'overrides',labels:'explorer'}});
      await admin(url,cap,`/api/preferences?id=${lumen}`,{patch:{world:'construct'}});
      await cc.click('.project-switch');await cc.click(`.menu-item:has-text("lumen-recipes")`);
      await cc.waitForFunction(id=>window.ResonancePlayer.state.project===id&&window.ResonancePlayer.state.world==='construct'&&window.ResonancePlayer.state.labels==='explorer',lumen,{timeout:20000}).catch(()=>{});
      const own=await engine(cc,()=>({world:window.ResonancePlayer.state.world,labels:window.ResonancePlayer.state.labels}));
      check('B: a project\'s own information mode applies in a non-living world after switching projects',own.world==='construct'&&own.labels==='explorer',JSON.stringify(own));
      await admin(url,cap,`/api/recipe?id=${lumen}`,{action:{type:'overrides',labels:null}});await admin(url,cap,`/api/preferences?id=${lumen}`,{patch:{world:null}});
      const lumenRecipe=await getJSON(`${url}/api/recipe?id=${lumen}`);
      check('B: the other project was not touched',lumenRecipe.family==='machine-cathedral'&&lumenRecipe.overrides.intensity===1&&lumenRecipe.tuning?.values?.['light.bloom']===1.5,JSON.stringify({family:lumenRecipe.family,intensity:lumenRecipe.overrides.intensity,tuning:lumenRecipe.tuning?.values}));
      await cc.close();
      // Restart the receiver on the same data directory and port: everything persists.
      await env.svc.stop();
      const svc2=await createService({port,dataDir:dir}).start();url=`http://127.0.0.1:${svc2.port}`;cap=await capability(url,svc2.pairing);
      env={...env,svc:svc2,url,async stop(){await svc2.stop();await fsp.rm(dir,{recursive:true,force:true});}};
      const [r1,r2,p1,p2]=await Promise.all([getJSON(`${url}/api/recipe?id=${lumen}`),getJSON(`${url}/api/recipe?id=${sample}`),getJSON(`${url}/api/preferences?id=${lumen}`),getJSON(`${url}/api/preferences?id=${sample}`)]);
      check('B: after a receiver restart both projects keep their configuration',r1.family==='machine-cathedral'&&r1.title==='Lumen Nights'&&r2.family==='stellar-forge'&&p1.music.style==='cinematic'&&p2.music.style==='chip',
        JSON.stringify({r1:r1.family,r2:r2.family,p1:p1.music.style,p2:p2.music.style}));
      const {page:again}=await open(windows,`${url}/?project=${sample}#/stage`);await ready(again);
      await again.waitForFunction(()=>window.ResonancePlayer.state.recipe?.family==='stellar-forge'&&window.ResonancePlayer.state.sound.options.style==='chip',null,{timeout:30000}).catch(()=>{});
      check('B: a reloaded Stage plays the persisted configuration',await engine(again,()=>window.ResonancePlayer.state.recipe?.family==='stellar-forge'&&window.ResonancePlayer.state.sound.options.style==='chip'));
      await again.close();
      // H + I: Control Center, Stage and OBS view open at the same time.
      const {page:control,errors:controlErrors}=await open(windows,`${url}/?project=${sample}#/home`);await ready(control);
      const {page:stage,errors:stageErrors}=await open(windows,`${url}/?project=${sample}#/stage`);await ready(stage);
      const {page:obs,errors:obsErrors,requests:obsRequests}=await open(windows,`${url}/?overlay=1&sound=1&project=${sample}`,{width:1920,height:1080});
      await obs.waitForFunction(()=>window.__worldStats?.()?.family==='stellar-forge',null,{timeout:45000}).catch(()=>{});
      await stage.click('#stageSoundBtn');await wait(2500);
      const barBefore=await engine(stage,()=>window.ResonancePlayer.state.bar);
      // A local preview in the Control Center is never seen by the OBS view or the Stage window.
      const candidate=await control.evaluate(async id=>(await window.ResonancePlayer.api.post(`/api/recipe/preview?id=${id}`,{actions:[{type:'family',family:'fractal-biosphere'}]})).recipe,sample);
      await control.evaluate(c=>window.ResonancePlayer.preview(c),candidate);await wait(4000);
      const during=await Promise.all([engine(control,()=>window.__worldStats?.()?.family),engine(obs,()=>window.__worldStats?.()?.family),engine(stage,()=>window.__worldStats?.()?.family),getJSON(`${url}/api/recipe?id=${sample}`)]);
      check('I: a preview shows only in its own window (OBS view and Stage keep the saved identity, nothing stored)',during[0]==='fractal-biosphere'&&during[1]==='stellar-forge'&&during[2]==='stellar-forge'&&during[3].family==='stellar-forge',JSON.stringify(during.slice(0,3)));
      await control.evaluate(()=>window.ResonancePlayer.preview(null));
      // A saved change reaches every view.
      const t0=Date.now();
      await control.evaluate(async id=>window.ResonancePlayer.recipeAction([{type:'family',family:'machine-cathedral'},{type:'title',title:'Sample Live'}]),sample);
      // Two times: the saved recipe reaching each view (change feed), and the view's new world running (building a world
      // on a software renderer takes most of it).
      await Promise.all([obs,stage].map(p=>p.waitForFunction(()=>window.ResonancePlayer.state.recipe?.family==='machine-cathedral',null,{timeout:45000}).catch(()=>{})));
      measurements.savedChangeReceivedMs=Date.now()-t0;
      await Promise.all([obs,stage].map(p=>p.waitForFunction(()=>window.__worldStats?.()?.family==='machine-cathedral',null,{timeout:45000}).catch(()=>{})));
      measurements.savedChangeToViewsMs=Date.now()-t0;
      const after=await Promise.all([engine(obs,()=>window.__worldStats?.()?.family),engine(stage,()=>window.__worldStats?.()?.family)]);
      check('H: a saved visual change reaches the OBS view and the Stage window',after.every(f=>f==='machine-cathedral'),`${JSON.stringify(after)}: recipe received in ${measurements.savedChangeReceivedMs} ms, new world running in ${measurements.savedChangeToViewsMs} ms`);
      const barAfter=await engine(stage,()=>({bar:window.ResonancePlayer.state.bar,sound:window.ResonancePlayer.state.sound.enabled}));
      check('I: the Stage window kept playing through the change (music not restarted)',barAfter.sound&&barAfter.bar>barBefore,`bar ${barBefore} → ${barAfter.bar}`);
      // Settings converge across windows.
      await control.evaluate(async()=>{await window.ResonancePlayer.api.post('/api/settings',{patch:{stage:{captions:false},music:{volume:.4}}});});
      await stage.waitForFunction(()=>window.ResonancePlayer.state.sound.options.volume===.4&&window.ResonancePlayer.state.captions===false,null,{timeout:15000}).catch(()=>{});
      check('I: a global setting changed in one window reaches the other',await engine(stage,()=>window.ResonancePlayer.state.sound.options.volume===.4&&window.ResonancePlayer.state.captions===false));
      // The OBS view: no interface, no private name, never asks for a control capability.
      const obsText=await obs.evaluate(()=>document.body.innerText);
      const obsUi=await obs.evaluate(()=>['.app','.stage-chrome','.topbar','.rail'].filter(s=>{const e=document.querySelector(s);return e&&e.offsetParent!==null;}));
      check('H: the OBS view shows only the presentation (no interface)',obsUi.length===0,JSON.stringify(obsUi));
      check('H: the OBS view never shows the private project name',!/sample-app/i.test(obsText),obsText.slice(0,120));
      check('H: the OBS view never requests a control capability',!obsRequests.some(r=>r==='POST /api/session'),obsRequests.filter(r=>r.startsWith('POST')).join(','));
      await obs.screenshot({path:path.join(OUT,'acceptance-h-obs.png')});
      // G: recording state is one across the views of a window and announced to other windows.
      await stage.click('#stageRecordBtn');await wait(1500);
      const recState=await Promise.all([engine(stage,()=>({active:window.ResonancePlayer.state.recording.active,topbar:document.getElementById('recordBtn').getAttribute('aria-pressed')})),engine(control,()=>({disabled:document.getElementById('recordBtn').disabled,label:document.getElementById('recordBtn').textContent}))]);
      check('G: one recorder: the Stage and the top bar agree, and another window cannot start a second recording',recState[0].active&&recState[0].topbar==='true'&&recState[1].disabled,JSON.stringify(recState));
      const download=stage.waitForEvent('download',{timeout:20000}).catch(()=>null);
      await wait(QUICK?2500:5000);await stage.click('#stageRecordBtn');
      const file=await download;let size=0;if(file){const p=path.join(OUT,'acceptance-g-recording.webm');await file.saveAs(p);size=fs.statSync(p).size;}
      const last=await engine(stage,()=>window.ResonancePlayer.state.recording.last);
      check('G: the recording finishes as a WebM file with sound',size>20000&&last?.audio===true&&!last?.audioLost,JSON.stringify({size,...(last||{})}));
      await wait(1500);
      check('G: the other window can record again once it stopped',await engine(control,()=>!document.getElementById('recordBtn').disabled));
      for(const [name,errs] of [['Control Center',ccErrors.concat(controlErrors)],['Stage',stageErrors],['OBS view',obsErrors]])check(`no page errors (${name})`,errs.length===0,errs.slice(0,3).join(' | '));
      await Promise.all([control.close(),stage.close(),obs.close()]);
      // J: every workspace at desktop, laptop and narrow widths: no horizontal page overflow, the navigation reachable,
      // the workspace loaded (its heading present), keyboard focus visible on the first control.
      const routes=['home','projects','visual','music','packs','connections','output','settings','stage'];
      for(const [w,h] of QUICK?[[1280,720]]:[[1920,1080],[1440,900],[1280,720],[900,800]]){
        const {page,errors}=await open(await fresh(),`${url}/?project=${sample}#/home`,{width:w,height:h});await ready(page);await wait(1200);
        for(const r of routes){
          await page.evaluate(r=>{location.hash=`#/${r}`;},r);
          await page.waitForFunction(r=>r==='stage'?!!document.querySelector('.stage-chrome-ui'):!!document.querySelector(`.workspace-view[data-ws="${r}"] h1`),r,{timeout:20000}).catch(()=>{});await wait(r==='visual'?2500:800);
          const m=await page.evaluate(r=>{const view=document.querySelector(`.workspace-view[data-ws="${r}"]`);const scrollers=[...document.querySelectorAll('.page,.inspector-body,.workspace-view')];
            return {loaded:r==='stage'?!!document.querySelector('.stage-chrome-ui'):!!view&&!!view.querySelector('h1'),overflowX:document.documentElement.scrollWidth>innerWidth+1,
              clipped:scrollers.some(e=>e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX==='hidden'),nav:r==='stage'||[...document.querySelectorAll('.rail a')].every(a=>{const b=a.getBoundingClientRect();return b.width>0&&b.bottom<=innerHeight+1&&b.right<=innerWidth+1;})};},r);
          check(`J: ${r} at ${w}×${h} loads, fits and keeps navigation reachable`,m.loaded&&!m.overflowX&&!m.clipped&&m.nav,JSON.stringify(m));
          await page.screenshot({path:path.join(OUT,`acceptance-j-${r}-${w}x${h}.png`)});
        }
        // Keyboard: Tab reaches a control with a visible focus ring.
        await page.evaluate(()=>{location.hash='#/home';});await wait(1200);await page.keyboard.press('Tab');await page.keyboard.press('Tab');
        const focus=await page.evaluate(()=>{const e=document.activeElement;const s=getComputedStyle(e);return {tag:e.tagName,outline:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0||s.boxShadow!=='none'};});
        check(`J: keyboard focus is visible at ${w}×${h}`,focus.outline&&focus.tag!=='BODY',JSON.stringify(focus));
        check(`J: no page errors at ${w}×${h}`,errors.length===0,errors.slice(0,3).join(' | '));
        await page.close();
      }
    }finally{await env.stop();await fsp.rm(dir,{recursive:true,force:true});}
  }finally{await browser.close();}
  const report={at:new Date().toISOString(),browser:'chromium (playwright-core, headless, SwiftShader)',quick:QUICK,checks,measurements};
  await fsp.writeFile(path.join(OUT,'acceptance.json'),JSON.stringify(report,null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});

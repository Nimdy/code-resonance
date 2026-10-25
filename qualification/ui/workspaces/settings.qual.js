'use strict';
// Settings through the real interface, on an isolated installation (never ~/.code-resonance): every global setting
// changed with the mouse or the keyboard, verified through the receiver (GET /api/settings), after a reload and in a
// second window (change feed); motion applied to the page at once; this device's quality kept in this browser and
// applied to the engine; diagnostics copied without tokens, paths or project names; storage, diagnostics and the
// documentation as the receiver reports them.
// Usage: node qualification/ui/workspaces/settings.qual.js      Results: qualification/results/ui/settings.json + PNGs
const path=require('node:path');
const fsp=require('node:fs/promises');
const REPO=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(REPO,'qualification/node_modules/playwright-core'));
const {createEnvironment}=require('../environment.js');
const {sha}=require(path.join(REPO,'receiver/protocol'));
const OUT=path.join(REPO,'qualification/results/ui');
const ARGS=['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'];
const checks=[],measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=10000,step=150){const t=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t>ms)return v;await wait(step);}}
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const env=await createEnvironment();
  const {url}=env,sample=env.projects.sample;
  const projects=(await (await fetch(`${url}/api/projects`)).json()).projects||[];
  const names=projects.map(p=>p.name).filter(Boolean),ids=projects.map(p=>p.id);
  const settings=async()=>(await (await fetch(`${url}/api/settings`)).json());
  const browser=await chromium.launch({args:ARGS});
  const errors=[];const watch=(p,label)=>{p.on('console',m=>{if(m.type()==='error')errors.push(`${label}: ${m.text()}`);});p.on('pageerror',e=>errors.push(`${label}: ${e}`));};
  try{
    const ctx=await browser.newContext({viewport:{width:1440,height:900}});
    await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:url});
    const page=await ctx.newPage();watch(page,'main');
    const open=async p=>{await p.goto(`${url}/?project=${sample}#/settings`);await p.waitForSelector('#setWorld:not([disabled])',{timeout:20000});};
    await open(page);
    const page2=await ctx.newPage();watch(page2,'second');await open(page2);
    await page.screenshot({path:path.join(OUT,'settings-global-1440.png')});
    // ---- Global settings: one change each, verified through the receiver --------------------------------------------
    await page.selectOption('#setWorld','nebula');
    check('Default world is saved by the receiver',await until(async()=>(await settings()).stage.world==='nebula'),(await settings()).stage.world);
    await page.focus('#setLabels [aria-checked="true"]');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    check('Information mode (keyboard: arrows) is saved by the receiver',await until(async()=>(await settings()).stage.labels==='stream'),(await settings()).stage.labels);
    // A project follows this default until its identity has an information mode of its own (chosen on the Stage or in
    // Visual Studio); then its own wins. The row says which, and the engine does it.
    const follows=await until(()=>page.evaluate(()=>{const P=window.ResonancePlayer,t=document.querySelector('#rowLabels .field-doc').textContent;
      return !P.state.recipe?.overrides?.labels&&P.state.labels==='stream'&&/follows this default/.test(t)?{engine:P.state.labels,text:t}:null;}),10000);
    check('a project without its own information mode follows the global default (the engine shows Stream)',!!follows,JSON.stringify(follows));
    await page.evaluate(()=>window.ResonancePlayer.recipeAction({type:'overrides',labels:'explorer'}));
    const lab=await until(()=>page.evaluate(()=>{const P=window.ResonancePlayer,o=P.state.recipe?.overrides?.labels,t=document.querySelector('#rowLabels .field-doc').textContent;
      return o&&/identity sets/.test(t)&&/does not change it/.test(t)&&P.state.labels===o?{own:o,engine:P.state.labels,text:t}:null;}),10000);
    check('once the project has its own mode, the row says so and the engine keeps it over the default',lab&&lab.own==='explorer',JSON.stringify(lab));
    await page.click('label:has(#setCaptions)');
    check('Captions off is saved by the receiver',await until(async()=>(await settings()).stage.captions===false));
    await page.click('#setProfile [data-value="1080p"]');
    check('Recording profile is saved and applied to the engine',await until(async()=>(await settings()).recording.profile==='1080p'&&await page.evaluate(()=>window.ResonancePlayer.state.recording.size==='1080p')));
    await page.click('#setMotion [data-value="reduce"]');
    check('Motion: Reduce is saved and applied to the page at once (html[data-motion])',await until(async()=>(await settings()).interface.motion==='reduce'&&await page.evaluate(()=>document.documentElement.dataset.motion==='reduce')));
    const reduced=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--t-3').trim());
    check('Reduce shortens the interface transitions',reduced==='1ms',`--t-3=${reduced}`);
    await page.click('#setMotion [data-value="full"]');
    check('Motion: Full applies (html[data-motion="full"])',await until(async()=>await page.evaluate(()=>document.documentElement.dataset.motion==='full')&&(await settings()).interface.motion==='full'));
    await page.click('#setMotion [data-value="system"]');
    check('Motion: Follow system removes the override',await until(async()=>await page.evaluate(()=>!('motion' in document.documentElement.dataset))&&(await settings()).interface.motion==='system'));
    await page.click('#setMotion [data-value="reduce"]');await until(async()=>(await settings()).interface.motion==='reduce');
    const guideBefore=(await settings()).onboarding.dismissed;
    await page.click('label:has(#setGuide)');
    check('Hiding the setup guide saves onboarding.dismissed = true',guideBefore===false&&await until(async()=>(await settings()).onboarding.dismissed===true));
    const saved=await until(async()=>{const t=await page.textContent('#rowGuide .set-status');return /Saved/.test(t)?t:'';},5000);
    check('a saved change says so next to the control',saved,saved||await page.textContent('#rowGuide .set-status'));
    // ---- A refused change: said next to the control, and the control shows what the receiver still holds -----------
    const before=errors.length;
    await page.route('**/api/settings',r=>r.request().method()==='POST'?r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Invalid value for stage.world',code:'invalid'})}):r.continue());
    await page.selectOption('#setWorld','city');
    const refused=await until(()=>page.evaluate(()=>/Not saved: Invalid value/.test(document.querySelector('#rowWorld .set-status').textContent)&&document.getElementById('setWorld').value==='nebula'),5000);
    check('a refused change is reported and the control returns to the saved value',refused&&(await settings()).stage.world==='nebula',await page.textContent('#rowWorld .set-status'));
    await page.unroute('**/api/settings');
    // The browser logs the deliberately refused request itself; that one line is expected, nothing else is.
    errors.splice(before,errors.length-before,...errors.slice(before).filter(e=>!/status of 400/.test(e)));
    // ---- The second window follows through the change feed --------------------------------------------------------
    const conv=await until(()=>page2.evaluate(()=>document.getElementById('setWorld').value==='nebula'&&document.querySelector('#setLabels [aria-checked="true"]').dataset.value==='stream'&&
      !document.getElementById('setCaptions').checked&&document.querySelector('#setProfile [aria-checked="true"]').dataset.value==='1080p'&&document.documentElement.dataset.motion==='reduce'&&!document.getElementById('setGuide').checked),10000);
    check('a second window shows every change without reloading (and applies the motion)',conv);
    // ---- After a reload ------------------------------------------------------------------------------------------
    await open(page);
    const shown=await page.evaluate(()=>({world:document.getElementById('setWorld').value,labels:document.querySelector('#setLabels [aria-checked="true"]').dataset.value,captions:document.getElementById('setCaptions').checked,
      profile:document.querySelector('#setProfile [aria-checked="true"]').dataset.value,motion:document.querySelector('#setMotion [aria-checked="true"]').dataset.value,html:document.documentElement.dataset.motion||null,guide:document.getElementById('setGuide').checked,
      engine:{world:window.ResonancePlayer.state.world,size:window.ResonancePlayer.state.recording.size,captions:window.ResonancePlayer.state.captions}}));
    measurements.afterReload=shown;
    check('every global setting is shown as saved after a reload',shown.world==='nebula'&&shown.labels==='stream'&&shown.captions===false&&shown.profile==='1080p'&&shown.motion==='reduce'&&shown.html==='reduce'&&shown.guide===false,JSON.stringify(shown));
    check('the engine plays the saved defaults (recording size, captions)',shown.engine.size==='1080p'&&shown.engine.captions===false,JSON.stringify(shown.engine));
    await page.click('label:has(#setGuide)');
    check('Showing the setup guide again saves onboarding.dismissed = false (round trip)',await until(async()=>(await settings()).onboarding.dismissed===false));
    // ---- This device ---------------------------------------------------------------------------------------------
    const rev=(await settings()).revision;
    await page.click('#setQuality [data-value="2"]');
    const dev=await until(()=>page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('code-resonance-device-v1')||'{}');return d.quality==='2'&&window.ResonancePlayer.state.quality==='2'?d:null;}),5000);
    check('Rendering quality is kept in this browser and applied to the engine',dev&&(await settings()).revision===rev,JSON.stringify(dev));
    await open(page);
    check('the quality is still chosen and applied after a reload',await until(()=>page.evaluate(()=>document.querySelector('#setQuality [aria-checked="true"]').dataset.value==='2'&&window.ResonancePlayer.state.quality==='2'),5000));
    await page.click('#setDeviceReset');
    check('Reset this device’s preferences restores Auto (storage and engine)',await until(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('code-resonance-device-v1')).quality==='auto'&&window.ResonancePlayer.state.quality==='auto'&&document.querySelector('#setQuality [aria-checked="true"]').dataset.value==='auto'),5000));
    // ---- Diagnostics ---------------------------------------------------------------------------------------------
    await page.click('#setCopyDiag');
    await until(()=>page.evaluate(()=>/Copied/.test(document.getElementById('setCopyDiag').textContent)),5000);
    const clip=await page.evaluate(()=>navigator.clipboard.readText());let diag=null;try{diag=JSON.parse(clip);}catch{}
    const status=await (await fetch(`${url}/api/status`)).json();
    measurements.diagnosticsBytes=clip.length;
    check('Copy diagnostics puts JSON with the receiver’s version and the browser’s capabilities on the clipboard',diag?.receiver?.version===status.version&&typeof diag?.browser?.capabilities?.webgl2==='boolean',clip.slice(0,120).replace(/\s+/g,' '));
    const leaks=[/[0-9a-f]{64}/i.test(clip)?'64-hex':null,...names.filter(n=>clip.includes(n)),...ids.filter(i=>clip.includes(i.slice(0,16))),clip.includes(env.dir)?'data dir':null,clip.includes(env.svc.token)?'token':null].filter(Boolean);
    check('the diagnostics contain no token, no 64-hex value, no path and no project name or id',!leaks.length,leaks.join(', '));
    const caps=await page.$$eval('#setCaps .set-cap',r=>r.map(x=>x.textContent));
    check('browser capabilities are detected live (8 listed)',caps.length===8&&caps.some(t=>/WebGL 2/.test(t))&&caps.some(t=>/MediaRecorder/.test(t)),caps.map(t=>t.replace(/\s+/g,' ')).join(' | ').slice(0,300));
    check('the change feed state is shown',/Change feed open/.test(await page.textContent('#setFeed')),await page.textContent('#setFeed'));
    check('the receiver status is shown (version, address)',(await page.textContent('#setReceiver')).includes(status.version)&&(await page.textContent('#setReceiver')).includes('this computer only'));
    // ---- Storage & privacy ---------------------------------------------------------------------------------------
    // What the receiver tells this page: dataDir only to a request carrying a control capability AND an Origin.
    const dataShown=await page.textContent('#setDataDir code');
    measurements.dataDirShown=dataShown;
    check('the data folder shown is the one the receiver reports to this page (capability-only)',dataShown===env.dir,dataShown);
    const projectDir=await page.textContent('.set-project-dir');
    check('the selected project’s own folder is named (labelled as its private name)',projectDir.includes(path.join(env.dir,'projects',sha(sample)))&&/private name/.test(projectDir),projectDir);
    const rows=await page.$$eval('.set-table tbody tr',r=>r.length);
    check('the storage table names every authority (10 kinds of configuration)',rows===10,`${rows} rows`);
    check('erasing is explained as steps, with no delete button',await page.$$eval('.set-steps li',l=>l.length)>=4&&!(await page.$$eval('#set-storage button',b=>b.map(x=>x.textContent))).some(t=>/delete|erase/i.test(t)));
    await page.click('#set-storage button:has-text("Security and privacy model")');
    const sec=await until(()=>page.evaluate(()=>document.querySelector('.modal .doc-view')?.textContent.includes('Erasing data')),8000);
    check('SECURITY.md opens in the documentation viewer',sec);
    await page.keyboard.press('Escape');
    check('Escape closes it',await until(()=>page.evaluate(()=>!document.querySelector('.modal-backdrop')),3000));
    // ---- About -----------------------------------------------------------------------------------------------------
    check('About shows the receiver and SDK versions',(await page.textContent('#setAbout')).includes(status.version)&&(await page.textContent('#setAbout')).includes(status.sdk));
    const docs=await page.$$eval('[data-doc]',b=>b.map(x=>x.dataset.doc));
    const docOk=[];for(const d of docs){const r=await fetch(`${url}/docs/${d}`);docOk.push(`${d}:${r.status}`);}
    check('every linked document exists on the receiver',docs.length===7&&docOk.every(x=>x.endsWith(':200')),docOk.join(' '));
    await page.focus('[data-doc="OBS.md"]');await page.keyboard.press('Enter');
    const obs=await until(()=>page.evaluate(()=>document.querySelector('.modal .doc-view')?.textContent.includes('Browser')),8000);
    await page.keyboard.press('Escape');await until(()=>page.evaluate(()=>!document.querySelector('.modal-backdrop')),3000);
    check('a document opens from the keyboard and focus returns to its button',obs&&await page.evaluate(()=>document.activeElement?.dataset?.doc==='OBS.md'));
    // ---- Navigation, layout ----------------------------------------------------------------------------------------
    const motionNow=await page.evaluate(()=>document.documentElement.dataset.motion);
    // Scrolled synchronously (behavior auto): the position read in the same task is already the final one.
    const pageTop=()=>page.evaluate(()=>Math.round(document.querySelector('.ws-settings').scrollTop));
    const top0=await pageTop(),jump=await page.evaluate(()=>{document.querySelector('.set-nav a[data-target="storage"]').click();return Math.round(document.querySelector('.ws-settings').scrollTop);});
    await page.waitForTimeout(800);const settled=await pageTop();
    check('with Motion set to Reduce, the section index jumps at once (no smooth scrolling)',motionNow==='reduce'&&jump!==top0&&Math.abs(settled-jump)<=1,`motion=${motionNow} before=${top0} at once=${jump} settled=${settled}`);
    // Contrast (this page only, nothing saved): with Full the same click animates, so the check above can tell them apart.
    const full=await page.evaluate(async()=>{const pg=document.querySelector('.ws-settings'),h=document.documentElement;h.dataset.motion='full';pg.scrollTop=0;await new Promise(r=>setTimeout(r,100));
      document.querySelector('.set-nav a[data-target="storage"]').click();const once=Math.round(pg.scrollTop);await new Promise(r=>setTimeout(r,900));const end=Math.round(pg.scrollTop);h.dataset.motion='reduce';return {once,end};});
    check('with Motion set to Full, the same jump is animated (contrast)',full.end-full.once>20,JSON.stringify(full));
    await page.focus('.set-link');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
    const ring=await page.evaluate(()=>{const a=document.activeElement;return {link:a.classList.contains('set-link'),visible:a.matches(':focus-visible'),offset:getComputedStyle(a).outlineOffset,style:getComputedStyle(a).outlineStyle};});
    check('a “Set elsewhere” link shows its focus ring inside its clipped list',ring.link&&ring.visible&&ring.offset==='-2px'&&ring.style!=='none',JSON.stringify(ring));
    const titleLeft=async()=>page.evaluate(()=>Math.round(document.querySelector('.workspace-view:not([hidden]) h1, .page h1').getBoundingClientRect().left));
    const leftSettings=await titleLeft();await page.evaluate(()=>{location.hash='#/output';});await page.waitForSelector('.ws-output h1');const leftOutput=await page.evaluate(()=>Math.round(document.querySelector('.ws-output h1').getBoundingClientRect().left));
    await page.evaluate(()=>{location.hash='#/settings';});await page.waitForSelector('#setWorld');
    check('the page title sits where it does on the other workspaces (no narrower page)',leftSettings===leftOutput,`settings ${leftSettings}px, output ${leftOutput}px`);
    await page.click('.set-nav a[data-target="diagnostics"]');
    check('the section index moves to its section',await until(()=>page.evaluate(()=>{const r=document.getElementById('set-diagnostics').getBoundingClientRect();return r.top<300&&r.top>-10;}),3000));
    await page.waitForTimeout(600);await page.screenshot({path:path.join(OUT,'settings-diagnostics-1440.png')});
    await page.evaluate(()=>document.getElementById('set-storage').scrollIntoView());await page.waitForTimeout(300);
    await page.screenshot({path:path.join(OUT,'settings-storage-1440.png')});
    await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>{document.querySelector('.page').scrollTop=0;});await page.waitForTimeout(500);
    await page.screenshot({path:path.join(OUT,'settings-1280.png')});
    await page.setViewportSize({width:900,height:800});await page.waitForTimeout(500);
    const overflow=await page.evaluate(()=>{const p=document.querySelector('.ws-settings');return p.scrollWidth-p.clientWidth;});
    check('at 900 px wide nothing overflows sideways',overflow<=1,`overflow ${overflow}px`);
    await page.screenshot({path:path.join(OUT,'settings-900.png')});
    // Restore the defaults this run changed (the installation is temporary, but the check is cheap).
    await page.evaluate(()=>window.ResonancePlayer.api.post('/api/settings',{patch:{stage:{world:'living',labels:'cinematic',captions:true},recording:{profile:'720p'},interface:{motion:'system'}}}));
    check('no console or page errors',errors.length===0,errors.slice(0,4).join(' | '));
  }catch(e){check('qualification ran to the end',false,e.stack||e.message);}
  finally{await browser.close();await env.stop();}
  await fsp.writeFile(path.join(OUT,'settings.json'),JSON.stringify({at:new Date().toISOString(),browser:`chromium (playwright-core, headless, ${ARGS.join(' ')})`,checks,measurements},null,2));
  const failed=checks.filter(c=>!c.pass).length;console.log(`${checks.length-failed}/${checks.length} passed`);
  process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});

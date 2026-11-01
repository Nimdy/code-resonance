'use strict';
// Real-browser qualification of Home: the first run (the stage first, idle or playing the fictional demo, with a compact
// setup checklist derived from real state, resumable, hidden for good once dismissed), the active project's capture
// status built from evidence, the attention list, recent projects and the way to the Stage. Every check reads the receiver's API or the engine, never the page's own claims alone.
// Usage: node qualification/ui/workspaces/home.qual.js   (Chromium from Playwright's cache; isolated temp data dirs)
const path=require('node:path');
const fsp=require('node:fs/promises');
const cp=require('node:child_process');
const REPO=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(REPO,'qualification/node_modules/playwright-core'));
const {createEnvironment}=require('../environment.js');
const {sha}=require(path.join(REPO,'receiver/protocol'));
const OUT=path.join(REPO,'qualification/results/ui');
const checks=[];
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const ARGS=['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'];
async function open(browser,url,{width=1440,height=900}={}){
  const context=await browser.newContext({viewport:{width,height},acceptDownloads:true});const page=await context.newPage();const errors=[];
  page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  // A failed request is reported with its URL (the console line alone does not name it).
  page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`);});
  await page.goto(url);await page.waitForFunction(()=>!!document.querySelector('.ws-home'),null,{timeout:20000});
  return {page,context,errors};
}
const shot=(page,name)=>page.screenshot({path:path.join(OUT,`home-${name}.png`)});
const stepState=page=>page.$$eval('.home-step',els=>Object.fromEntries(els.map(e=>[e.dataset.step,e.dataset.done==='true'])));
async function post(env,events){const r=await fetch(env.url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.svc.token}`},body:JSON.stringify({events})});if(r.status!==202)throw new Error(await r.text());
  await fetch(env.url+'/v1/flush',{method:'POST',headers:{Authorization:`Bearer ${env.svc.token}`}});}
const json=async(env,u)=>(await fetch(env.url+u)).json();
const firstId=sha('code-resonance-home-qual/first-project');
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const browser=await chromium.launch({args:ARGS});const allErrors=[];
  try{
    // ---- First run: an installation with no project ------------------------------------------------------------
    let env=await createEnvironment({empty:true});
    try{
      const status=await json(env,'/api/status');
      const a=await open(browser,env.url+'/#/home');const {page}=a;
      await page.waitForSelector('#setupGuide',{timeout:15000});
      await page.waitForFunction(()=>document.querySelector('.home-step[data-step="receiver"]')?.dataset.done==='true',null,{timeout:15000});
      let steps=await stepState(page);
      check('first run: the guide shows five steps',Object.keys(steps).join()==='receiver,vscode,project,sound,stage',Object.keys(steps).join());
      check('first run: only "receiver running" is done (derived from /api/status)',steps.receiver&&!steps.vscode&&!steps.project&&!steps.sound&&!steps.stage,JSON.stringify(steps));
      const guide=await page.textContent('#setupGuide');
      check('the receiver step names the real version and port',guide.includes(`Version ${status.version} on port ${status.port}`),`${status.version}:${status.port}`);
      check('the VS Code step gives the exact commands for this version',guide.includes('npm run package:vsix')&&guide.includes(`code --install-extension code-resonance-${status.version}.vsix`)&&guide.includes('CODE RESONANCE: Start Code Performance'));
      // The stage comes first, idle (nothing claims to be live, no demo label), with the one command that makes the demo under it.
      const firstDemo=await page.textContent('.home-first-demo');
      check('the demo is offered under the stage as optional and clearly fictional',firstDemo.includes('npm run demo')&&firstDemo.includes('Demonstration (fictional)')&&firstDemo.includes('Optional')&&await page.isVisible('.home-first-demo .copy'));
      check('nothing claims the page can start the receiver',!/click to start|start the receiver now/i.test(guide+firstDemo));
      const stage=await page.evaluate(()=>{const s=document.querySelector('[data-stage-slot]').getBoundingClientRect(),h=document.getElementById('stageHost').getBoundingClientRect();
        return {hero:!document.querySelector('.home-hero').hidden,placed:Math.abs(s.left-h.left)<2&&Math.abs(s.width-h.width)<2&&!document.getElementById('stageHost').classList.contains('parked'),live:!document.querySelector('.home-chrome .pill.live')?.hidden,demo:!document.getElementById('homeDemoBadge').hidden,idle:!!document.querySelector('#stageEmpty:not(.hidden)')};});
      check('first run: the stage comes first, idle (no Live or demo label without a project)',stage.hero&&stage.placed&&!stage.live&&!stage.demo,JSON.stringify(stage));
      // One line per step with its true status; only the next step is open, the others open on demand.
      const rows=await page.$$eval('.home-step',els=>els.map(e=>({id:e.dataset.step,status:e.querySelector('.home-step-status')?.textContent,open:e.querySelector('details')?e.querySelector('details').open:null})));
      check('first run: the checklist gives each step its status (Done, Next, Listening, To do), only the next step open',
        rows.map(r=>`${r.id}:${r.status}:${r.open}`).join()==='receiver:Done:null,vscode:Next:true,project:Listening:false,sound:To do:false,stage:To do:false',JSON.stringify(rows));
      check('the checklist is beside the stage, the stage and the next step both in the first view at 1440 × 900',await page.evaluate(()=>{const g=document.getElementById('setupGuide'),s=document.querySelector('.home-slot').getBoundingClientRect(),n=document.querySelector('.home-step.current').getBoundingClientRect();
        return !!g.closest('.home-side')&&s.bottom<=innerHeight&&n.top>=0&&n.bottom<=innerHeight;}));
      check('first run: "waiting for the first project" is listening on the change feed',(await page.textContent('.home-step[data-step="project"]')).includes('Listening'));
      await shot(page,'first-run-1440x900');
      await page.setViewportSize({width:1366,height:768});await page.waitForTimeout(400);await shot(page,'first-run-1366x768');
      const fold=await page.evaluate(()=>{const s=document.querySelector('.home-slot').getBoundingClientRect(),n=document.querySelector('.home-step.current').getBoundingClientRect(),p=document.querySelector('.ws-home');
        return {stage:s.top>=0&&s.bottom<=innerHeight,next:n.top>=0&&n.bottom<=innerHeight,overflow:p.scrollWidth-p.clientWidth};});
      check('first run at 1366 × 768: the stage and the next step are both above the fold, nothing overflows',fold.stage&&fold.next&&fold.overflow<=1,JSON.stringify(fold));
      await page.setViewportSize({width:1280,height:720});await shot(page,'first-run-1280x720');
      await page.setViewportSize({width:900,height:800});await shot(page,'first-run-900x800');
      await page.setViewportSize({width:1440,height:900});
      // Sound: the step opens on demand, and a real click starts the engine's music; the step follows the engine's state.
      await page.click('.home-step[data-step="sound"] summary');
      check('a step that is not next opens on demand',await page.$eval('.home-step[data-step="sound"] details',d=>d.open)&&await page.isVisible('#guideSound'));
      await page.click('#guideSound');
      await page.waitForFunction(()=>window.ResonancePlayer.state.sound.enabled,null,{timeout:10000});
      await page.waitForFunction(()=>document.querySelector('.home-step[data-step="sound"]')?.dataset.done==='true',null,{timeout:5000});
      check('"Enable sound" turns on the engine’s sound and completes its step',true);
      // A second window converges when the guide is hidden in the first.
      const b=await open(browser,env.url+'/#/home');await b.page.waitForSelector('#setupGuide',{timeout:15000});
      await page.click('#hideGuide');
      await page.waitForFunction(()=>!document.querySelector('#setupGuide'),null,{timeout:10000});
      const settings=await json(env,'/api/settings');
      check('"Hide this guide" saves onboarding.dismissed on the receiver',settings.onboarding?.dismissed===true,JSON.stringify(settings.onboarding));
      await b.page.waitForFunction(()=>!document.querySelector('#setupGuide'),null,{timeout:10000}).then(()=>check('a second window hides the guide too (change feed)',true),()=>check('a second window hides the guide too (change feed)',false));
      await page.reload();await page.waitForSelector('.ws-home .empty',{timeout:15000});
      check('after a reload the guide stays hidden; the empty state says Settings can show it again',!(await page.$('#setupGuide'))&&(await page.textContent('.ws-home .empty')).includes('Settings can show it again'));
      await shot(page,'first-run-hidden-1440x900');
      // Settings owns the switch back on (here through the same admin API it uses): the guide reappears live.
      await page.evaluate(()=>window.ResonancePlayer.api.post('/api/settings',{patch:{onboarding:{dismissed:false}}}));
      await page.waitForSelector('#setupGuide',{timeout:10000}).then(()=>check('the guide reappears when Settings turns it back on (no reload)',true),()=>check('the guide reappears when Settings turns it back on (no reload)',false));
      // Resumable: the next steps complete from what the receiver observes, without a reload.
      const id=firstId;let n=0;const t=Date.now();
      await post(env,[{v:1,id:`home-qual-${++n}`,ts:t,kind:'workspace.started',projectId:id,sessionId:'home-qual-1',origin:'unknown',name:'first-project (test)',
        meta:{extensionVersion:'0.5.0',remote:'',includeHidden:false,captureDocumentContents:true,captureTerminalCommands:false,capturePromptText:false,shareProjectName:true,baselineFileLimit:450,receiverPort:env.svc.port}},
        {v:1,id:`home-qual-${++n}`,ts:t+500,kind:'document.snapshot',projectId:id,sessionId:'home-qual-1',origin:'unknown',file:'src/index.ts',content:'export function main(){ return 1; }\n',meta:{reason:'baseline'}}]);
      await page.waitForFunction(()=>{const d=s=>document.querySelector(`.home-step[data-step="${s}"]`)?.dataset.done==='true';return d('vscode')&&d('project');},null,{timeout:30000})
        .then(()=>check('steps 2 and 3 complete live when the first project’s capture arrives',true),async()=>check('steps 2 and 3 complete live when the first project’s capture arrives',false,JSON.stringify(await stepState(page))));
      await page.waitForFunction(()=>document.querySelector('#homeProjectName')?.textContent==='first-project (test)',null,{timeout:15000})
        .then(()=>check('the new project becomes the active project on Home',true),async()=>check('the new project becomes the active project on Home',false,await page.textContent('#homeProjectName').catch(()=>'(none)')));
      await shot(page,'first-project-arrived-1440x900');
      allErrors.push(...a.errors,...b.errors);await a.context.close();await b.context.close();
    }finally{await env.stop();}
    // ---- A demo-only installation: still a first run (the fictional demo is not a project of your own) -------------
    env=await createEnvironment({empty:true});
    try{
      await new Promise((resolve,reject)=>{const c=cp.spawn(process.execPath,[path.join(REPO,'scripts/demo.js'),'--fast'],{env:{...process.env,RESONANCE_DATA:env.dir,RESONANCE_PORT:String(env.svc.port)},stdio:'ignore'});
        c.on('exit',code=>code===0?resolve():reject(new Error(`demo exited ${code}`)));c.on('error',reject);});
      await fetch(env.url+'/v1/flush',{method:'POST',headers:{Authorization:`Bearer ${env.svc.token}`}});
      const demoId=sha('CODE RESONANCE — FICTIONAL DEMO');
      const d=await open(browser,env.url+'/#/home',{width:1366,height:768});const {page}=d;
      await page.waitForSelector('#setupGuide',{timeout:15000});
      await page.waitForFunction(id=>window.ResonancePlayer.state.project===id&&!document.getElementById('homeDemoBadge').hidden,demoId,{timeout:20000}).catch(()=>{});
      const ds=await page.evaluate(()=>({project:window.ResonancePlayer.state.project,badge:!document.getElementById('homeDemoBadge').hidden,firstRun:document.querySelector('.home-grid').classList.contains('first-run'),
        guideSide:!!document.getElementById('setupGuide').closest('.home-side'),projectPanel:!document.querySelector('.home-project').hidden,recent:!document.querySelector('.home-recent-sec').hidden,panel:document.querySelector('.home-first-demo').textContent}));
      check('a demo-only install is still a first run: the stage plays the demo with its Demonstration (fictional) label, the checklist beside it',ds.project===demoId&&ds.badge&&ds.firstRun&&ds.guideSide&&!ds.projectPanel&&!ds.recent,JSON.stringify({...ds,panel:undefined}));
      check('under the stage the demo says it is fictional and offers the Stage',/Demonstration \(fictional\)/.test(ds.panel)&&/nothing in it comes from real work/.test(ds.panel)&&await page.isVisible('#homeFirstStage'),ds.panel.slice(0,120));
      const df=await page.evaluate(()=>{const v=s=>{const b=document.querySelector(s).getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;};const p=document.querySelector('.ws-home');return {stage:v('.home-slot'),demo:v('.home-first-demo'),next:v('.home-step.current'),overflow:p.scrollWidth-p.clientWidth};});
      check('demo-only at 1366 × 768: the stage, its demo panel and the next step are all above the fold',df.stage&&df.demo&&df.next&&df.overflow<=1,JSON.stringify(df));
      await shot(page,'first-run-demo-1366x768');
      allErrors.push(...d.errors);await d.context.close();
    }finally{await env.stop();}
    // ---- A populated installation: lumen (real, stopped long ago), sample (0.5 extension + Claude Code), demo -----
    env=await createEnvironment();
    try{
      const {lumen,sample,demo}=env.projects;
      const a=await open(browser,env.url+'/#/home');const {page,context}=a;
      await page.waitForSelector('#homeStatus',{timeout:20000});
      const statusOf=async id=>{await page.click(`.home-recent-row[data-id="${id}"]`);await page.waitForFunction(id=>window.ResonancePlayer.state.project===id&&document.querySelector('.home-recent-row.active')?.dataset.id===id,id,{timeout:10000});
        await page.waitForTimeout(800);return page.textContent('#homeStatus');};
      // lumen: a real session, capture stopped two days before the environment was made.
      const ev1=await json(env,`/api/evidence?id=${lumen}`);let s=await statusOf(lumen);
      check('lumen: "Capture stopped at …" from its evidence (state stopped)',ev1.editor.capture.state==='stopped'&&s.includes('Capture stopped at')&&!s.includes('capture running'),s.slice(0,140));
      check('lumen: old events are shown as idle, never as running',s.includes('Project idle')&&!/Events received just now/.test(s));
      check('lumen: Claude activity is reported as observed',s.includes('Agent activity observed: Claude')&&!s.includes('Claude Code'));
      check('lumen: its extension did not report settings, and Home says so',ev1.editor.reported===null&&s.includes('does not report its settings'));
      // sample: started by the 0.5 extension; running only while editor activity is under 2 minutes old.
      const ev2=await json(env,`/api/evidence?id=${sample}`);s=await statusOf(sample);
      const fresh=Date.now()-ev2.editor.lastAt<120000;
      check('sample: capture state matches the evidence (running only with activity in the last 2 min)',fresh?s.includes('VS Code capture running'):s.includes('no activity since')&&s.includes('the extension does not report closing'),`fresh=${fresh}; ${s.slice(0,160)}`);
      check('sample: extension 0.5.0 reported its settings',s.includes(`extension ${ev2.editor.reported.extensionVersion} reported its settings`));
      check('sample: Claude observed',s.includes('Claude')&&!s.includes('Claude Code'));
      check('sample: the private name is labelled as private',(await page.textContent('.home-private')).includes('Private workspace name'));
      check('sample: no public title is stated honestly',(await page.textContent('#homePublicTitle')).includes('No public title — the Stage shows a generic name'));
      await shot(page,'populated-1440x900');
      // demo: always labelled fictional, in the project area and in the recent list.
      s=await statusOf(demo);
      const hero=await page.textContent('.home-project');
      check('demo: labelled "Demonstration (fictional)" in the project area',hero.includes('Demonstration (fictional)'));
      check('demo: labelled in Recent projects',(await page.textContent(`.home-recent-row[data-id="${demo}"]`)).includes('Demonstration (fictional)'));
      check('Recent projects lists the three projects, most recent first',(await page.$$eval('.home-recent-row',els=>els.map(e=>e.dataset.id))).length===3);
      // Attention items are real: each matches the engine's state and its action works.
      const st=await page.evaluate(()=>{const s=window.ResonancePlayer.state;let gl=false;try{gl=!!document.createElement('canvas').getContext('webgl2');}catch{}return {sound:s.sound.enabled,rec:s.recording.supported.ok,packs:(s.packs||[]).filter(x=>x.executable&&x.ok&&!x.trusted).length,stopped:!!s.worldStatus.stopped,failed:s.world==='living'&&s.worldStatus.failed,gl,receiver:s.receiver};});
      const att=await page.textContent('.home-attention');
      // While the setup guide is shown, its sound step is the one place to turn sound on (no duplicate in the list).
      const guideShown=!!(await page.$('#setupGuide'));
      check('attention: with the guide shown, sound is offered by its step only',st.sound===false&&guideShown&&!att.includes('Sound is off')&&await page.isVisible('#guideSound'),`guide=${guideShown}`);
      check('one primary action on Home: "Open Stage" in the project area',(await page.$$eval('.ws-home .btn.primary',els=>els.map(e=>e.id)))?.join()==='homeOpenStage',(await page.$$eval('.ws-home .btn.primary',els=>els.map(e=>e.textContent))).join(' | '));
      check('empty regions cost no space',await page.$$eval('.ws-home .page-inner>div:empty',els=>els.every(e=>getComputedStyle(e).display==='none')));
      check('attention: no pack item without packs awaiting approval',st.packs===0&&!att.includes('awaits your approval')&&!att.includes('stopped'));
      check('attention: recording item only if recording is unsupported',st.rec?!att.includes('Recording is not available'):att.includes('Recording is not available'),`supported=${st.rec}`);
      check('attention: WebGL item only if WebGL2 is missing or the world failed',(st.gl&&!st.failed)?!att.includes('WebGL2 is unavailable')&&!att.includes('could not start'):att.includes('The Construct'),`webgl2=${st.gl} failed=${st.failed}`);
      check('attention: no receiver item while it answers',st.receiver===true&&!att.includes('not answering'));
      check('attention: the most recent capture uses 0.5, so no extension-update item',!att.includes('does not report its capture settings'));
      // Once the guide is hidden, sound off becomes an attention item with its own action (live, from the change feed).
      await page.click('#hideGuide');
      await page.waitForFunction(()=>document.querySelector('.home-attention').textContent.includes('Sound is off in this window'),null,{timeout:10000})
        .then(()=>check('attention: "sound is off" listed once the guide is hidden',true),()=>check('attention: "sound is off" listed once the guide is hidden',false));
      await page.click('#homeEnableSound');
      await page.waitForFunction(()=>window.ResonancePlayer.state.sound.enabled&&!document.querySelector('.home-attention').textContent.includes('Sound is off'),null,{timeout:10000})
        .then(()=>check('attention: "Enable sound" turns sound on and the item goes away',true),()=>check('attention: "Enable sound" turns sound on and the item goes away',false));
      // A capture from an extension that does not report its settings (before 0.5) becomes an attention item.
      const legacy=sha('code-resonance-home-qual/legacy-extension');
      await post(env,[{v:1,id:'home-qual-legacy-1',ts:Date.now(),kind:'workspace.started',projectId:legacy,sessionId:'home-qual-legacy',origin:'unknown',name:'legacy-extension (test)'},
        {v:1,id:'home-qual-legacy-2',ts:Date.now()+200,kind:'document.snapshot',projectId:legacy,sessionId:'home-qual-legacy',origin:'unknown',file:'a.ts',content:'export const a=1;\n',meta:{reason:'baseline'}}]);
      await page.waitForFunction(()=>document.querySelector('.home-attention').textContent.includes('Update the VS Code extension to 0.5'),null,{timeout:30000})
        .then(()=>check('attention: a capture without reported settings asks to update the extension (live)',true),()=>check('attention: a capture without reported settings asks to update the extension (live)',false));
      await page.click('.home-attention button:has-text("How to update")');
      check('attention: its action opens Connections',(await page.evaluate(()=>location.hash))==='#/connections');
      await page.goto(env.url+'/#/home');await page.waitForSelector('#homeStatus',{timeout:15000});
      // The stage slot carries the live stage (the shell places the stage layer over it).
      const placed=await page.evaluate(()=>{const s=document.querySelector('[data-stage-slot]').getBoundingClientRect(),h=document.getElementById('stageHost').getBoundingClientRect();return Math.abs(s.left-h.left)<2&&Math.abs(s.width-h.width)<2&&!document.getElementById('stageHost').classList.contains('parked');});
      check('the 16:9 stage slot shows the live stage',placed);
      await shot(page,'populated-1440x900');
      await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(400);await shot(page,'populated-1280x720');
      await page.setViewportSize({width:900,height:800});await page.waitForTimeout(400);await shot(page,'populated-900x800');
      const overflow=await page.evaluate(()=>{const p=document.querySelector('.ws-home');return p.scrollWidth-p.clientWidth;});
      check('900 px: no horizontal overflow; Open Stage stays visible',overflow<=1&&await page.isVisible('#homeOpenStage'),`overflow=${overflow}px`);
      await page.setViewportSize({width:1440,height:900});
      // Keyboard: Recent projects rows and the primary action are reachable and work with Enter.
      await page.focus(`.home-recent-row[data-id="${lumen}"]`);await page.keyboard.press('Enter');
      await page.waitForFunction(id=>window.ResonancePlayer.state.project===id,lumen,{timeout:5000}).then(()=>check('keyboard: Enter on a recent project makes it active',true),()=>check('keyboard: Enter on a recent project makes it active',false));
      // Open in new window: a second window on the Stage of the active project.
      const [popup]=await Promise.all([context.waitForEvent('page',{timeout:10000}),page.click('button:has-text("Open in new window")')]);
      await popup.waitForLoadState();const pu=popup.url();
      check('"Open in new window" opens the Stage of the active project',pu.includes(`project=${lumen}`)&&pu.endsWith('#/stage'),pu);await popup.close();
      await page.focus('#homeOpenStage');await page.keyboard.press('Enter');
      await page.waitForFunction(()=>location.hash==='#/stage'&&!!document.getElementById('stageTitle'),null,{timeout:10000}).then(()=>check('"Open Stage" (keyboard) opens the Performance Stage',true),()=>check('"Open Stage" (keyboard) opens the Performance Stage',false));
      allErrors.push(...a.errors);await context.close();
    }finally{await env.stop();}
    // The engine polls /api/project for a project selected before its first window is sorted (about 10 s after its
    // first event): those answers are 404 by design ("not yet sorted") and are reported apart, not hidden.
    const unsorted=allErrors.filter(e=>e===`HTTP 404 /api/project?id=${firstId}`),other=allErrors.filter(e=>!unsorted.includes(e));
    check('no console errors, page errors or failed requests',other.length===0,other.slice(0,5).join(' | ')||(unsorted.length?`(${unsorted.length} expected 404 "not yet sorted" polls by the engine for the brand-new project)`:''));
  }catch(e){check('qualification ran to the end',false,e.stack||e.message);}
  finally{await browser.close();}
  const failed=checks.filter(c=>!c.pass).length;
  await fsp.writeFile(path.join(OUT,'home.json'),JSON.stringify({at:new Date().toISOString(),passed:checks.length-failed,failed,checks},null,2));
  console.log(`\n${checks.length-failed}/${checks.length} passed`);process.exitCode=failed?1:0;
})();

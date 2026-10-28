'use strict';
// Real-browser qualification of Projects: the browser (badges, filter, keyboard), a project's detail (statistics equal
// to /api/project, timeline markers from the real intents, replay from a moment), exports, and that each project keeps
// its own recipe and preferences while a second window converges on changes made in the first.
// Usage: node qualification/ui/workspaces/projects.qual.js   (Chromium from Playwright's cache; isolated temp data dir)
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const REPO=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(REPO,'qualification/node_modules/playwright-core'));
const {createEnvironment}=require('../environment.js');
const OUT=path.join(REPO,'qualification/results/ui');
const checks=[];
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const ARGS=['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'];
const OUTCOME=new Set(['validation.failed','validation.passed','validation.recovered','refactor.validated','milestone.achieved','repository.checkpoint','world.expanded']);
async function open(browser,url,{width=1440,height=900}={}){
  const context=await browser.newContext({viewport:{width,height},acceptDownloads:true});const page=await context.newPage();const errors=[];
  page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});page.on('pageerror',e=>errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`);});
  await page.goto(url);await page.waitForFunction(()=>!!document.querySelector('.ws-projects'),null,{timeout:20000});
  return {page,context,errors};
}
const shot=(page,name)=>page.screenshot({path:path.join(OUT,`projects-${name}.png`)});
const pass=(name,p,detail)=>p.then(()=>check(name,true,detail),e=>check(name,false,e.message.split('\n')[0]));
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const browser=await chromium.launch({args:ARGS});const allErrors=[];
  const env=await createEnvironment();
  const json=async u=>(await fetch(env.url+u)).json();
  try{
    const {lumen,sample,demo}=env.projects;
    const a=await open(browser,env.url+'/#/projects');const {page}=a;
    await page.waitForSelector('a.proj-row',{timeout:20000});await page.waitForTimeout(800);
    // ---- Browser -----------------------------------------------------------------------------------------------
    const rows=await page.$$eval('a.proj-row',els=>els.map(e=>({id:e.dataset.id,text:e.textContent,active:e.classList.contains('active')})));
    check('the list shows the three projects the receiver knows',rows.length===3&&[lumen,sample,demo].every(id=>rows.some(r=>r.id===id)),rows.map(r=>r.id.slice(0,8)).join());
    const byId=Object.fromEntries(rows.map(r=>[r.id,r]));
    check('only the demonstration carries the "Demonstration (fictional)" badge',byId[demo].text.includes('Demonstration (fictional)')&&!byId[lumen].text.includes('Demonstration')&&!byId[sample].text.includes('Demonstration'));
    const selected=await page.evaluate(()=>window.ResonancePlayer.state.project);
    check('the active project is marked Active (and only it)',rows.filter(r=>r.active).length===1&&byId[selected]?.active&&byId[selected].text.includes('Active'));
    const list=(await json('/api/projects')).projects,last=p=>p.evidence?.lastReceivedAt||p.updatedAt||0;
    check('sorted by recent activity',rows.map(r=>r.id).join()===list.slice().sort((x,y)=>last(y)-last(x)).map(p=>p.id).join());
    check('lumen: capture stopped, from its evidence',byId[lumen].text.includes('Capture stopped'));
    check('names are private workspace names or "Project <id8>"',rows.every(r=>{const p=list.find(x=>x.id===r.id);return r.text.includes(p.name||`Project ${p.id.slice(0,8)}`);}));
    await shot(page,'list-1440x900');
    await page.fill('#projectFilter','lumen');await page.waitForTimeout(150);
    check('filter: typing narrows the list',(await page.$$eval('a.proj-row',els=>els.map(e=>e.dataset.id))).join()===lumen);
    await page.fill('#projectFilter','no-such-project-xyz');await page.waitForTimeout(150);
    check('filter: typed text is not kept in browser storage (it may be a private name)',!(await page.evaluate(()=>JSON.stringify({...localStorage}))).includes('no-such-project-xyz'));
    check('filter: no match shows an empty state with a way back',(await page.textContent('.proj-rows')).includes('No project matches')&&await page.isVisible('.proj-rows button:has-text("Clear the filter")'));
    await page.click('.proj-rows button:has-text("Clear the filter")');
    check('filter: clearing shows all projects again',(await page.$$('a.proj-row')).length===3);
    // Keyboard: arrows move between rows, Enter opens the focused one.
    const order=await page.$$eval('a.proj-row',els=>els.map(e=>e.dataset.id));
    await page.focus('a.proj-row');await page.keyboard.press('ArrowDown');
    check('keyboard: ArrowDown moves to the next project',await page.evaluate(()=>document.activeElement.dataset.id)===order[1]);
    await page.keyboard.press('Enter');
    await pass('keyboard: Enter opens the project’s detail',page.waitForFunction(id=>location.hash===`#/projects/${id}`&&document.querySelector('h1')?.textContent,order[1],{timeout:5000}));
    // ---- Detail: lumen ---------------------------------------------------------------------------------------------
    await page.goto(env.url+`/#/projects/${lumen}`);await page.waitForSelector('.proj-stats',{timeout:20000});await page.waitForSelector('.tl-track',{timeout:20000});
    const model=await json(`/api/project?id=${lumen}`);
    const shown=await page.$$eval('.proj-stats .stat',els=>Object.fromEntries(els.map(e=>[e.dataset.stat,Number(e.querySelector('b').textContent.replace(/[^0-9]/g,''))])));
    const MAP={Modules:'files',Symbols:'symbols',Created:'created',Modified:'modified',Removed:'removed',Imports:'imports',Commands:'commands','Tests passed':'testsPassed','Tests failed':'testsFailed','Agent events':'agentEvents',Milestones:'milestones',Agents:'agents'};
    const diffs=Object.entries(MAP).filter(([k,f])=>Number.isFinite(model.stats[f])&&shown[k]!==model.stats[f]).map(([k,f])=>`${k}: ${shown[k]}≠${model.stats[f]}`);
    check('overview statistics equal /api/project',Object.keys(shown).length>=10&&!diffs.length,diffs.join(', ')||JSON.stringify(shown));
    check('chapter equals /api/project',(await page.textContent('.proj-chapter b'))===String(model.performance.chapter));
    check('not active yet: "Make active" offered, music export only for the active project',await page.isVisible('#makeActive')&&!(await page.$('#exportAudio'))&&(await page.textContent('.proj-exports')).includes('Available for the active project'));
    // Timeline: one marker per outcome intent in the receiver's timeline (read like the page: fields=intents).
    let intents=[],after=-1;for(;;){const pg=await json(`/api/timeline?id=${lumen}&fields=intents&after=${after}&limit=500`);for(const e of pg.entries){after=e.seq;intents.push(...(e.intents||[]));}if(!pg.entries.length||after>=pg.total-1)break;}
    const outcomes=intents.filter(i=>OUTCOME.has(i.type));
    const marks=await page.$$eval('.tl-lane[data-lane="outcomes"] .tl-mark',els=>els.map(e=>({kind:e.dataset.kind,ts:Number(e.dataset.ts)})));
    check('timeline: one marker per validation/milestone/commit/chapter intent',marks.length===outcomes.length&&outcomes.every(o=>marks.some(m=>m.ts===o.ts)),`${marks.length} markers, ${outcomes.length} intents`);
    check('timeline: failed, passed, milestone and commit markers present',['failed','passed','milestone','checkpoint'].every(k=>marks.some(m=>m.kind===k)),[...new Set(marks.map(m=>m.kind))].join());
    check('timeline: one session band per session',(await page.$$('.tl-lane[data-lane="sessions"] .tl-band')).length===model.sessions.length,`${model.sessions.length} sessions`);
    // Hover shows the time and meaning.
    const failed=marks.find(m=>m.kind==='failed');
    const fBox=await page.$eval(`.tl-mark.failed`,e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    await page.mouse.move(fBox.x,fBox.y);await page.waitForTimeout(150);
    const tip=await page.textContent('.tl-tip');
    check('timeline: hovering a marker shows its time and meaning',tip.includes('failed'),tip);
    await page.mouse.click(fBox.x,fBox.y);await page.waitForSelector('.tl-menu',{timeout:5000});
    await shot(page,'detail-timeline-menu-1440x900');
    await page.click('.tl-menu .menu-item:has-text("Replay from here")');
    await pass('Replay from here: lands on the Stage in replay mode',page.waitForFunction(()=>location.hash==='#/stage'&&window.ResonancePlayer.state.mode==='replay',null,{timeout:25000}));
    const pos=await page.evaluate(()=>{const s=window.ResonancePlayer.state;return {project:s.project,now:s.position.now,mode:s.mode};});
    check('Replay from here: the lumen project at the marker’s time ±2 s',pos.project===lumen&&Math.abs(pos.now-failed.ts)<=2000,`Δ=${Math.round(pos.now-failed.ts)} ms`);
    await page.screenshot({path:path.join(OUT,'projects-replay-landed-1440x900.png')});
    // Keyboard on the timeline: arrows step between moments, Enter offers the replay.
    await page.evaluate(()=>window.ResonancePlayer.setMode('live'));
    await page.goto(env.url+`/#/projects/${lumen}`);await page.waitForSelector('.tl-track',{timeout:20000});
    await page.focus('.tl-track');await page.keyboard.press('ArrowRight');const vt1=await page.getAttribute('.tl-track','aria-valuetext');
    await page.keyboard.press('ArrowRight');const vt2=await page.getAttribute('.tl-track','aria-valuetext');
    check('keyboard: arrows move the timeline cursor between moments (announced)',!!vt1&&!!vt2&&vt1!==vt2,`${vt1} → ${vt2}`);
    await page.keyboard.press('Enter');
    // The menu takes focus on its first item a moment after opening (as a person sees it); Escape then closes it.
    await pass('keyboard: Enter opens the replay menu with focus on "Replay from here"',page.waitForFunction(()=>document.activeElement?.closest('.tl-menu')&&document.activeElement.textContent.includes('Replay from here'),null,{timeout:5000}));
    await page.keyboard.press('Escape');
    check('Escape closes it',!(await page.isVisible('.tl-menu').catch(()=>false)));
    // Agents and validation outcomes from the projection.
    const agentsText=await page.textContent('.proj-agents-panel');
    check('header: no stray text among the actions',!(await page.textContent('.proj-detail-head')).includes('null'));
    check('agents: providers observed through hooks, with no claim about reasoning',agentsText.includes('Claude')&&!agentsText.includes('Claude Code')&&agentsText.includes('never sees an agent’s hidden reasoning')&&agentsText.includes(`${model.agents.length} agent sessions`));
    const cues=model.timeline.filter(c=>/^(validation|milestone)\./.test(c.type)&&(c.type!=='validation.diagnostics'||c.detail?.errors||c.detail?.warnings));
    check('validation outcomes: the last ones from the projection, newest first',(await page.$$('.proj-outcomes .list-row')).length===Math.min(10,cues.length),`${cues.length} cues`);
    await shot(page,'detail-1440x900');
    // Exports: the JSON download is the receiver's export of this project.
    const [dl]=await Promise.all([page.waitForEvent('download',{timeout:15000}),page.click('#exportJson')]);
    const file=await dl.path(),data=JSON.parse(fs.readFileSync(file,'utf8'));
    check('export: performance data JSON downloads for this project',dl.suggestedFilename()===`code-resonance-${lumen.slice(0,10)}.json`&&data.projectId===lumen&&Array.isArray(data.timeline),dl.suggestedFilename());
    // Replay made lumen the active project: no "Make active" any more, and its music can be rendered.
    check('after Replay from here, lumen is the active project',await page.evaluate(()=>window.ResonancePlayer.state.project)===lumen&&!(await page.$('#makeActive')));
    await page.waitForSelector('#exportAudio:not([disabled])',{timeout:10000});
    const [wav]=await Promise.all([page.waitForEvent('download',{timeout:180000}),page.click('#exportAudio')]);
    const wavPath=await wav.path(),head=fs.readFileSync(wavPath).subarray(0,12).toString('latin1');
    check('export: "Render music (WAV)" downloads a WAV of the active project',wav.suggestedFilename().endsWith('.wav')&&head.startsWith('RIFF')&&head.endsWith('WAVE')&&!wav.suggestedFilename().includes('lumen'),`${wav.suggestedFilename()} (${fs.statSync(wavPath).size} bytes)`);
    // ---- Independence of projects, and a second window converging ----------------------------------------------
    // lumen's world and information mode are changed on the Stage (as a person would), then compared with sample's.
    await page.goto(env.url+'/#/stage');await page.waitForSelector('[data-world="construct"]',{timeout:15000});
    // The Stage's controls fade while the pointer rests; the keyboard reaches them all the same.
    const press=async sel=>{await page.focus(sel);await page.keyboard.press('Enter');};
    await press('[data-world="construct"]');await press('.stage-top [role="radio"]:has-text("Explorer")');
    await page.waitForTimeout(1200);
    const [pl,ps]=await Promise.all([json(`/api/preferences?id=${lumen}`),json(`/api/preferences?id=${sample}`)]);
    const [rl,rs]=await Promise.all([json(`/api/recipe?id=${lumen}`),json(`/api/recipe?id=${sample}`)]);
    check('receiver: lumen’s world preference changed, sample’s did not',pl.world==='construct'&&ps.world===null,`lumen=${pl.world} sample=${ps.world}`);
    check('receiver: lumen’s recipe has its own information mode, sample’s is untouched',rl.overrides?.labels==='explorer'&&rs.overrides?.labels!=='explorer',`lumen=${rl.overrides?.labels} sample=${rs.overrides?.labels}`);
    const cfg=async id=>{await page.goto(env.url+`/#/projects/${id}`);await page.waitForFunction(()=>!document.querySelector('.cfg')?.parentElement?.textContent.includes('Loading this project'),null,{timeout:10000});await page.waitForTimeout(600);
      return page.$$eval('.cfg-row',els=>Object.fromEntries(els.map(e=>[e.children[0].textContent,[...e.children[1].children].filter(c=>c.tagName!=='BUTTON').map(c=>c.textContent).join('')])));};
    const cl=await cfg(lumen),cs=await cfg(sample);
    check('Projects: lumen shows its own world and where it comes from',cl.World==='The ConstructThis project',cl.World);
    check('Projects: sample keeps the global world',cs.World==='Living worldGlobal default',cs.World);
    check('Projects: lumen’s information mode comes from its identity',cl.Information.startsWith('Explorer'),cl.Information);
    check('Projects: sample’s information mode is not lumen’s',!cs.Information.startsWith('Explorer'),cs.Information);
    // A second window on sample's detail converges when the first window changes sample's world.
    const b=await open(browser,env.url+`/#/projects/${sample}`);await b.page.waitForSelector('.cfg-row',{timeout:15000});
    await page.click('#makeActive');
    await pass('"Make active" selects sample (the shell and the engine follow)',page.waitForFunction(id=>window.ResonancePlayer.state.project===id&&!document.querySelector('#makeActive'),sample,{timeout:10000}));
    // Toasts are also shown over the Stage, so they never carry a private name.
    const toasts=await page.$$eval('.toast',els=>els.map(e=>e.textContent).join(' | '));
    check('"Make active" confirms without the private name',toasts.includes('now the active project')&&!toasts.includes('sample-app'),toasts);
    await page.goto(env.url+'/#/stage');await page.waitForSelector('[data-world="city"]',{timeout:15000});await press('[data-world="city"]');
    await pass('a second window converges after a preference change made in the first',b.page.waitForFunction(()=>[...document.querySelectorAll('.cfg-row')].some(r=>r.textContent.startsWith('World')&&r.textContent.includes('Monolith')&&r.textContent.includes('This project')),null,{timeout:15000}));
    check('receiver: sample’s world saved, lumen’s unchanged',(await json(`/api/preferences?id=${sample}`)).world==='city'&&(await json(`/api/preferences?id=${lumen}`)).world==='construct');
    // "Use global" hands sample's world back to the global default; both windows follow.
    await page.goto(env.url+`/#/projects/${sample}`);await page.waitForSelector('#cfgWorldGlobal',{timeout:15000});await page.click('#cfgWorldGlobal');
    await pass('World "Use global": the row shows the global default again',page.waitForFunction(()=>[...document.querySelectorAll('.cfg-row')].some(r=>r.textContent.startsWith('World')&&r.textContent.includes('Global default'))&&!document.querySelector('#cfgWorldGlobal'),null,{timeout:10000}));
    check('receiver: sample’s world preference is cleared, lumen’s kept',(await json(`/api/preferences?id=${sample}`)).world===null&&(await json(`/api/preferences?id=${lumen}`)).world==='construct');
    check('the engine plays the global world for sample again',await page.evaluate(()=>window.ResonancePlayer.state.world)==='living');
    await pass('a second window follows "Use global"',b.page.waitForFunction(()=>[...document.querySelectorAll('.cfg-row')].some(r=>r.textContent.startsWith('World')&&r.textContent.includes('Living')&&r.textContent.includes('Global default')),null,{timeout:15000}));
    allErrors.push(...b.errors);await b.context.close();
    // A demonstration's agent events are fictional: never described as observed.
    await page.goto(env.url+`/#/projects/${demo}`);await page.waitForSelector('.proj-agents-panel .list-row',{timeout:15000});await page.waitForTimeout(400);
    const demoSide=await page.textContent('.proj-agents-panel');
    check('demo: its agents are labelled fictional, not "observed through hooks"',demoSide.includes('Fictional agent events written by the demo')&&!demoSide.includes('Observed through hooks')&&!demoSide.includes('What agent hooks reported'),demoSide.slice(0,160));
    // ---- Layout at the laptop and narrow sizes ------------------------------------------------------------------
    await page.goto(env.url+`/#/projects/${lumen}`);await page.waitForSelector('.tl-track',{timeout:15000});
    await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(400);await shot(page,'detail-1280x720');
    await page.setViewportSize({width:900,height:800});await page.waitForTimeout(400);await shot(page,'detail-900x800');
    const ov=await page.evaluate(()=>{const p=document.querySelector('.ws-projects');return p.scrollWidth-p.clientWidth;});
    check('900 px: the detail has no horizontal overflow',ov<=1,`${ov}px`);
    await page.goto(env.url+'/#/projects');await page.waitForSelector('a.proj-row');await page.waitForTimeout(300);await shot(page,'list-900x800');
    const ov2=await page.evaluate(()=>{const p=document.querySelector('.ws-projects');return p.scrollWidth-p.clientWidth;});
    check('900 px: the list has no horizontal overflow',ov2<=1,`${ov2}px`);
    await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(300);await shot(page,'list-1280x720');
    allErrors.push(...a.errors);await a.context.close();
    check('no console errors or failed requests',allErrors.length===0,allErrors.slice(0,6).join(' | '));
  }catch(e){check('qualification ran to the end',false,e.stack||e.message);}
  finally{await browser.close();await env.stop();}
  const failed=checks.filter(c=>!c.pass).length;
  await fsp.writeFile(path.join(OUT,'projects.json'),JSON.stringify({at:new Date().toISOString(),passed:checks.length-failed,failed,checks},null,2));
  console.log(`\n${checks.length-failed}/${checks.length} passed`);process.exitCode=failed?1:0;
})();

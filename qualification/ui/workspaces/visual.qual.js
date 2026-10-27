'use strict';
// Real-browser qualification of Visual Studio (public/ui/workspaces/visual.js): every control through the real UI, its
// effect checked through the receiver API, after a reload, and in a second window. An isolated installation
// (qualification/ui/environment.js: temporary data directory, never ~/.code-resonance); the edited project is the TEST
// project "sample-app (test project)". Two example packs (packs/examples) are imported through the receiver's own
// import route so the pack cards and the look select have something real to show.
// Usage: node qualification/ui/workspaces/visual.qual.js
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const {chromium}=require('playwright-core');
const {createEnvironment}=require('../environment.js');
const REPO=path.resolve(__dirname,'../../..');
const OUT=path.join(REPO,'qualification/results/ui');
const checks=[],screenshots=[],measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=20000,step=200){const end=Date.now()+ms;let last;for(;;){try{last=await fn();if(last)return last;}catch{}if(Date.now()>end)return last;await sleep(step);}}
function filesOf(dir,rel=''){const out=[];for(const e of fs.readdirSync(path.join(dir,rel),{withFileTypes:true})){const r=rel?`${rel}/${e.name}`:e.name;if(e.isDirectory())out.push(...filesOf(dir,r));else out.push(r);}return out;}
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const env=await createEnvironment({demo:false});
  const id=env.projects.sample,base=`${env.url}/?project=${id}`;
  const get=async p=>{const r=await fetch(env.url+p,{cache:'no-store'});if(!r.ok)throw new Error(`${p}: HTTP ${r.status}`);return r.json();};
  const recipe=()=>get(`/api/recipe?id=${id}`);
  const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  const errors=[];
  const watch=(page,label)=>{page.on('console',m=>{if(m.type()==='error')errors.push(`${label}: ${m.text()}`);});page.on('pageerror',e=>errors.push(`${label}: ${e}`));};
  const shot=async(page,name)=>{const f=path.join(OUT,`visual-${name}.png`);await page.screenshot({path:f});screenshots.push(path.relative(REPO,f));};
  const state=(page,fn)=>page.evaluate(fn);
  const badge=page=>page.locator('#vsBadge').textContent().catch(()=>'');
  const ready=async page=>{await page.waitForSelector('#vsBadge',{timeout:30000});await page.waitForSelector('.vs-card[data-card="stellar-forge"]',{timeout:30000});
    await page.waitForFunction(()=>window.ResonancePlayer.state.recipe&&window.__worldStats?.()?.family,null,{timeout:60000});};
  const previewing=page=>page.waitForFunction(()=>!!window.ResonancePlayer.state.preview&&document.querySelector('#vsApply')&&!document.querySelector('#vsApply').hidden&&!document.querySelector('#vsApply').disabled,null,{timeout:20000});
  const settled=page=>page.waitForFunction(()=>!window.ResonancePlayer.state.preview&&document.querySelector('#vsApply')?.hidden,null,{timeout:20000});
  const card=(page,cid)=>page.click(`.vs-card[data-card="${cid}"] .vs-card-main`);
  const tab=(page,v)=>page.click(`.vs-browser-head .segmented button[data-value="${v}"]`);
  const setParam=async(page,p,value)=>{const f=page.locator(`.field[data-path="${p}"]`);await f.locator('xpath=ancestor::details').evaluate(d=>{d.open=true;});
    const num=f.locator('input.num').first();await num.fill(String(value));await num.press('Tab');};
  let A,B;
  try{
    // ---- Two example packs, imported and installed through the receiver (never approved here) -------------------------
    A=await browser.newPage({viewport:{width:1440,height:900}});watch(A,'page A');
    await A.goto(`${base}#/visual`);await ready(A);
    for(const name of ['ember-observatory','cymatic-field']){
      const dir=path.join(REPO,'packs/examples',name),files=filesOf(dir).map(p=>({path:p,data:fs.readFileSync(path.join(dir,p)).toString('base64')}));
      const out=await A.evaluate(async files=>{const P=window.ResonancePlayer;const r=await P.api.post('/api/packs/import',{files});return P.api.post('/api/packs/install',{importId:r.importId,digest:r.digest});},files);
      check(`example pack ${name} installs through the import route`,!!out?.id,out?.id);
    }
    await A.waitForSelector('.vs-card[data-card="halcyon.cymatic-field"]',{timeout:20000});
    const thumbs=await until(()=>A.evaluate(()=>document.querySelectorAll('.vs-thumb img').length===3),60000,500);
    check('built-in families show thumbnails rendered from this project',thumbs,await A.evaluate(()=>[...document.querySelectorAll('.vs-thumb img')].map(x=>x.alt).slice(0,3).join(' | ')));
    const r0=await recipe();measurements.initial={family:r0.family,revision:r0.revision,source:r0.source};
    check('the page shows the saved identity at first',(await badge(A))==='Saved identity'&&(await A.textContent('.vs-family'))===r0.familyName,`${r0.familyName}, revision ${r0.revision}`);
    await shot(A,'saved-1440');
    // ---- Choose Stellar Forge: a preview only -------------------------------------------------------------------------
    await tab(A,'living');await card(A,'stellar-forge');await previewing(A);
    let r=await recipe();
    check('choosing Stellar Forge shows a preview badge over the stage',(await badge(A))==='Preview · not saved');
    check('the preview saves nothing (revision and family unchanged)',r.revision===r0.revision&&r.family===r0.family,`revision ${r.revision}, ${r.family}`);
    const twist0=await A.evaluate(()=>window.ResonancePlayer.state.preview.recipe.genome.geometry.spiralTwist);
    await setParam(A,'geometry.spiralTwist',1.55);
    await A.waitForFunction(()=>window.ResonancePlayer.state.preview?.recipe.genome.geometry.spiralTwist===1.55,null,{timeout:20000});
    r=await recipe();
    check('a parameter change previews (candidate value 1.55) without saving',r.revision===r0.revision&&JSON.stringify(r.genome)===JSON.stringify(r0.genome),`saved revision ${r.revision}; generated twist ${twist0}`);
    check('the changed parameter is marked as customised in the preview',await A.locator('.field[data-path="geometry.spiralTwist"]').evaluate(e=>e.classList.contains('modified')&&e.classList.contains('pending')));
    // A value the toolkit cannot show (null/undefined appended as text) must never reach the page.
    const stray=await A.evaluate(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),bad=[];while(w.nextNode())if(/\b(null|undefined|NaN)\b/.test(w.currentNode.data))bad.push(w.currentNode.data.trim().slice(0,60));return bad;});
    check('no stray "null"/"undefined" text on the page during a preview',!stray.length,stray.join(' | ')||(await A.textContent('.vs-foot-status')));
    // Every input and select of the inspector has an accessible name (the switches' labels carry no text of their own).
    const unnamed=await A.evaluate(()=>{const els=[...document.querySelectorAll('.vs-inspector input,.vs-inspector select')];
      return {n:els.length,switches:els.filter(e=>e.type==='checkbox').length,bad:els.filter(e=>!(e.getAttribute('aria-label')||[...(e.labels||[])].map(l=>l.textContent).join('')).trim()).map(e=>e.id||e.closest('[data-path]')?.dataset.path||e.className)};});
    check('every inspector input and select has an accessible name',!unnamed.bad.length,unnamed.bad.length?unnamed.bad.join(', '):`${unnamed.n} controls, ${unnamed.switches} on/off switches`);
    await shot(A,'preview-1440');
    await A.setViewportSize({width:1280,height:720});await sleep(800);await shot(A,'preview-1280');await A.setViewportSize({width:1440,height:900});
    await A.click('#vsCancel');await settled(A);
    r=await recipe();
    check('Cancel restores the saved identity and saves nothing',(await badge(A))==='Saved identity'&&r.revision===r0.revision&&r.family===r0.family&&!r.tuning,`revision ${r.revision}`);
    // ---- Again, then Apply; the value survives a reload -------------------------------------------------------------
    await card(A,'stellar-forge');await previewing(A);
    await setParam(A,'geometry.spiralTwist',1.55);
    await A.waitForFunction(()=>window.ResonancePlayer.state.preview?.recipe.genome.geometry.spiralTwist===1.55,null,{timeout:20000});
    await A.waitForFunction(()=>!document.querySelector('#vsApply').disabled,null,{timeout:10000});
    await A.click('#vsApply');await settled(A);
    r=await recipe();
    check('Apply saves the family and the tuned value',r.revision===r0.revision+1&&r.family==='stellar-forge'&&r.source==='user'&&r.tuning?.values?.['geometry.spiralTwist']===1.55&&r.genome.geometry.spiralTwist===1.55,`revision ${r.revision}, tuning ${JSON.stringify(r.tuning?.values)}`);
    check('customising locks the identity',r.locked===true);
    await A.reload();await ready(A);
    await A.waitForFunction(()=>Number(document.querySelector('.field[data-path="geometry.spiralTwist"] input.num')?.value)===1.55,null,{timeout:20000}).catch(()=>{});
    const after=await A.locator('.field[data-path="geometry.spiralTwist"]').evaluate(e=>({v:e.querySelector('input.num').value,mod:e.classList.contains('modified'),read:e.querySelector('.field-value')?.textContent}));
    check('after a reload the control shows the saved value, marked customised',Number(after.v)===1.55&&after.mod,JSON.stringify(after));
    // ---- Switch families: the running world follows (window.__worldStats) ---------------------------------------------
    for(const fam of ['fractal-biosphere','machine-cathedral']){
      await card(A,fam);await previewing(A);
      const live=await until(()=>A.evaluate(f=>window.__worldStats?.()?.family===f,fam),30000);
      check(`previewing ${fam} runs it on the stage (__worldStats().family)`,live,await A.evaluate(()=>window.__worldStats?.()?.family));
      await A.click('#vsApply');await settled(A);
      r=await recipe();
      check(`Apply saves ${fam}`,r.family===fam&&!r.tuning,`revision ${r.revision}, tuning dropped: ${!r.tuning}`);
      await shot(A,`${fam}-1440`);
    }
    // ---- Public title -------------------------------------------------------------------------------------------------
    await A.fill('#vsTitleInput','Bad <title>');
    check('an invalid title is refused before saving',await A.getAttribute('#vsTitleInput','aria-invalid')==='true'&&(await A.textContent('#vsTitleError')).length>0);
    await A.fill('#vsTitleInput','Night Shift & Co.');await A.click('#vsTitleSave');
    await until(async()=>(await recipe()).title==='Night Shift & Co.',10000);
    r=await recipe();check('the public title is saved',r.title==='Night Shift & Co.',r.title);
    await A.reload();await ready(A);
    await A.waitForFunction(()=>document.querySelector('#vsTitleInput')?.value==='Night Shift & Co.',null,{timeout:15000}).catch(()=>{});
    check('after a reload the title field shows it',await A.inputValue('#vsTitleInput')==='Night Shift & Co.');
    await A.fill('#vsTitleInput','');await A.press('#vsTitleInput','Enter');
    check('an empty title removes it (Enter saves)',await until(async()=>(await recipe()).title===null,10000));
    // ---- Subsystem names ----------------------------------------------------------------------------------------------
    await A.waitForSelector('#vsAliases input[data-alias]',{timeout:20000});
    const gid=await A.getAttribute('#vsAliases input[data-alias]','data-alias');
    const generated=await A.getAttribute('#vsAliases input[data-alias]','placeholder');
    await A.fill(`input[data-alias="${gid}"]`,'Core Engine');await A.press(`input[data-alias="${gid}"]`,'Enter');
    check('a subsystem name is saved',await until(async()=>(await recipe()).aliases?.[gid]==='Core Engine',10000),`${generated} → Core Engine`);
    await A.reload();await ready(A);await A.waitForSelector(`input[data-alias="${gid}"]`,{timeout:20000});
    check('after a reload the name is shown',await A.inputValue(`input[data-alias="${gid}"]`)==='Core Engine');
    await A.click(`button[aria-label="Clear the name of ${generated}"]`);
    check('Clear returns to the generated name',await until(async()=>!(await recipe()).aliases?.[gid],10000));
    // ---- Customise, save a preset, reset ------------------------------------------------------------------------------
    const spec=await get(`/api/recipe/tunable?id=${id}`);const windows0=spec.base['secondary.windows'];
    await setParam(A,'secondary.windows',1.5);
    await A.waitForFunction(()=>window.ResonancePlayer.state.preview?.recipe.genome.secondary.windows===1.5,null,{timeout:20000});
    const spectacle=A.locator('.field-row:has(#vsIntensity) input.num');await spectacle.fill('150');await spectacle.press('Tab');
    await A.click('#vsLabels button[data-value="explorer"]');
    await A.waitForFunction(()=>window.ResonancePlayer.state.preview?.recipe.overrides.intensity===1.5&&window.ResonancePlayer.state.preview?.recipe.overrides.labels==='explorer',null,{timeout:20000});
    const spectacleShown=await until(()=>A.evaluate(()=>{const f=document.querySelector('#vsIntensity').closest('.field');return f.querySelector('input.num').value==='150 %'&&!f.querySelector('.field-value');}),10000);
    check('Spectacle shows its value once, with its unit, in the exact-value box',spectacleShown,await A.evaluate(()=>document.querySelector('#vsIntensity').closest('.field').querySelector('.field-head').textContent+' | '+document.querySelector('#vsIntensity').closest('.field').querySelector('input.num').value));
    check('the information mode is tried on the stage during the preview',await state(A,()=>window.ResonancePlayer.state.labels)==='explorer');
    await A.waitForFunction(()=>!document.querySelector('#vsApply').disabled,null,{timeout:10000});
    await A.click('#vsApply');await settled(A);
    r=await recipe();
    check('Apply saves tuning, spectacle and information together',r.tuning?.values?.['secondary.windows']===1.5&&r.overrides.intensity===1.5&&r.overrides.labels==='explorer',JSON.stringify({tuning:r.tuning?.values,overrides:r.overrides}));
    await tab(A,'presets');await A.click('#vsSavePreset');
    await A.fill('#vsPresetName','Bad/Name');await A.click('.modal button:has-text("Save preset")');
    check('an invalid preset name is refused',(await A.locator('.modal').count())===1&&await A.getAttribute('#vsPresetName','aria-invalid')==='true');
    await A.fill('#vsPresetName','Lit Cathedral');await A.click('.modal button:has-text("Save preset")');
    const preset=await until(async()=>(await get('/api/presets')).presets.find(p=>p.name==='Lit Cathedral'),10000);
    check('Save as preset stores the saved identity as a visual preset',preset&&preset.kind==='visual'&&preset.payload.family==='machine-cathedral'&&preset.payload.tuning['secondary.windows']===1.5&&preset.payload.overrides.intensity===1.5,JSON.stringify(preset?.payload));
    await A.waitForSelector(`.vs-card[data-preset="${preset.id}"]`,{timeout:10000});
    await shot(A,'presets-1440');
    await A.click('#vsReset');await previewing(A);
    await A.click('#vsApply');await settled(A);
    r=await recipe();const spec2=await get(`/api/recipe/tunable?id=${id}`);
    check('Reset customisations restores the generated values',!r.tuning&&r.genome.secondary.windows===windows0&&spec2.base['secondary.windows']===windows0&&r.overrides.intensity===1&&r.overrides.motion===1,`windows ${r.genome.secondary.windows} (generated ${windows0})`);
    // A preset previewed from another family, then applied.
    await tab(A,'living');await card(A,'stellar-forge');await previewing(A);await A.click('#vsApply');await settled(A);
    await tab(A,'presets');await A.click(`.vs-card[data-preset="${preset.id}"] button[aria-label^="Preview"]`);await previewing(A);
    const pv=await state(A,()=>{const c=window.ResonancePlayer.state.preview.recipe;return {family:c.family,windows:c.genome.secondary.windows,intensity:c.overrides.intensity};});
    check('previewing a preset shows its family, values and presentation',pv.family==='machine-cathedral'&&pv.windows===1.5&&pv.intensity===1.5,JSON.stringify(pv));
    r=await recipe();check('the preset preview saves nothing',r.family==='stellar-forge',r.family);
    await A.click('#vsApply');await settled(A);
    r=await recipe();check('applying the preset saves it as the identity',r.family==='machine-cathedral'&&r.tuning?.values?.['secondary.windows']===1.5,`revision ${r.revision}`);
    await A.click(`.vs-card[data-preset="${preset.id}"] button[aria-label^="Rename"]`);
    await A.fill('.modal input','Lit Cathedral II');await A.click('.modal button:has-text("Rename")');
    check('Rename renames the preset',await until(async()=>(await get('/api/presets')).presets.some(p=>p.id===preset.id&&p.name==='Lit Cathedral II'),10000));
    await A.click(`.vs-card[data-preset="${preset.id}"] button[aria-label^="Delete"]`);await A.click('.modal button:has-text("Delete preset")');
    check('Delete (after confirmation) removes the preset',await until(async()=>!(await get('/api/presets')).presets.some(p=>p.id===preset.id),10000));
    // The Essentials group: first, open, with the few parameters that change this family the most.
    const ess=await A.evaluate(()=>{const d=document.querySelector('.vs-params details');return {summary:d?.querySelector('summary')?.textContent||'',open:!!d?.open,paths:[...(d?.querySelectorAll('.field[data-path]')||[])].map(f=>f.dataset.path)};});
    check('Essentials come first, open, with the world\'s high-value parameters',/^Essentials/.test(ess.summary.trim())&&ess.open&&ess.paths.includes('atmosphere.shafts')&&ess.paths.includes('technique.exposure'),JSON.stringify(ess));
    // Curated looks: built in, read-only, previewed like any preset and saved only by Apply.
    const curated=await A.$$eval('.vs-card.curated',els=>els.map(e=>({id:e.dataset.preset,rename:!!e.querySelector('button[aria-label^="Rename"]'),del:!!e.querySelector('button[aria-label^="Delete"]')})));
    check('six curated looks are offered, read-only',curated.length===6&&curated.every(c=>!c.rename&&!c.del),JSON.stringify(curated));
    const rc=await recipe();
    await A.click('.vs-card[data-preset="curated:abyss"] button[aria-label^="Preview"]');await previewing(A);
    const cv=await state(A,()=>{const c=window.ResonancePlayer.state.preview.recipe;return {family:c.family,terrain:c.genome.atmosphere.terrain,glow:c.genome.material.bioluminescence};});
    check('previewing a curated look shows its family and values',cv.family==='fractal-biosphere'&&cv.terrain==='abyss'&&cv.glow===1.6,JSON.stringify(cv));
    r=await recipe();check('the curated preview saves nothing',r.revision===rc.revision&&r.family===rc.family,`revision ${r.revision}`);
    await A.click('#vsCancel');await settled(A);
    // A preset that needs a pack which is not installed: honest unavailability, nothing previewed.
    await A.evaluate(()=>window.ResonancePlayer.api.post('/api/presets',{action:'create',kind:'visual',name:'Needs a pack',payload:{family:'someone.missing-world',look:null,tuning:{},overrides:{}}}));
    await A.waitForSelector('.vs-card[data-preset] .vs-card-text strong:text("Needs a pack")',{timeout:10000});
    await A.click('.vs-card[data-preset]:has-text("Needs a pack") button[aria-label^="Preview"]');
    const unavailable=await until(()=>A.locator('.vs-card[data-preset]:has-text("Needs a pack") .vs-error').textContent().catch(()=>''),10000);
    check('a preset whose family is not installed says what it needs',/Unavailable: needs someone\.missing-world/.test(unavailable)&&!(await state(A,()=>!!window.ResonancePlayer.state.preview)),unavailable);
    // ---- Packs: a world pack that is not approved never runs; a look pack over the family ------------------------------
    await tab(A,'living');
    const packCard=await A.textContent('.vs-card[data-card="halcyon.cymatic-field"]');
    check('a world pack card shows author, version, code and approval',/Pack · Halcyon Visuals \(fictional\) · v1\.0\.0 · code/.test(packCard)&&/Needs approval/.test(packCard),packCard.replace(/\s+/g,' ').trim());
    const famBefore=await state(A,()=>window.__worldStats?.()?.family);
    await card(A,'halcyon.cymatic-field');await previewing(A);
    const notice=await until(()=>A.evaluate(()=>window.ResonancePlayer.state.preview?.notice),15000);
    await sleep(1500);
    check('previewing an unapproved pack never runs it (the saved identity is shown, with a notice)',/not approved/.test(notice||'')&&await state(A,()=>window.__worldStats?.()?.family)===famBefore&&await state(A,()=>document.querySelectorAll('iframe.pack-frame').length)===0,notice);
    await shot(A,'unapproved-pack-1440');
    await A.click('#vsCancel');await settled(A);
    await card(A,'stellar-forge');await previewing(A);
    await A.waitForFunction(()=>[...document.querySelectorAll('#vsLook option')].some(o=>o.value==='northlight.ember-observatory'),null,{timeout:15000});
    await A.selectOption('#vsLook','northlight.ember-observatory');
    await A.waitForFunction(()=>window.ResonancePlayer.state.preview?.recipe.pack?.id==='northlight.ember-observatory',null,{timeout:20000});
    check('a look pack over the family is previewed from the Look select',true);
    await A.click('#vsCancel');await settled(A);
    // ---- Stale revision: another window saves between preview and Apply -----------------------------------------------
    B=await browser.newPage({viewport:{width:1280,height:720}});watch(B,'page B');
    await B.goto(`${base}#/visual`);await ready(B);
    await card(A,'fractal-biosphere');await previewing(A);
    await B.fill('#vsTitleInput','From Window Two');await B.click('#vsTitleSave');
    await until(async()=>(await recipe()).title==='From Window Two',10000);
    await A.click('#vsApply');
    await A.waitForSelector('#vsStaleApply',{timeout:15000});
    check('Apply after another window saved shows the stale-revision dialog',await A.isVisible('text=The identity changed in another window'));
    await shot(A,'stale-1440');
    await A.click('#vsStaleApply');await settled(A);
    r=await recipe();
    check('"Apply to the new version" keeps the other window\'s change and adds this one',r.family==='fractal-biosphere'&&r.title==='From Window Two',`${r.family}, title ${r.title}`);
    await card(A,'machine-cathedral');await previewing(A);
    await B.fill('#vsTitleInput','From Window Two Again');await B.click('#vsTitleSave');
    await until(async()=>(await recipe()).title==='From Window Two Again',10000);
    await A.click('#vsApply');await A.waitForSelector('#vsStaleReload',{timeout:15000});await A.click('#vsStaleReload');await settled(A);
    r=await recipe();
    check('"Reload" discards the preview and shows the other window\'s version',r.family==='fractal-biosphere'&&(await A.textContent('.vs-family'))==='Fractal Biosphere',r.family);
    // ---- A second window converges on what is applied ----------------------------------------------------------------
    await card(A,'stellar-forge');await previewing(A);
    check('a preview in one window does not reach the other',(await B.textContent('.vs-family'))==='Fractal Biosphere'&&!(await state(B,()=>!!window.ResonancePlayer.state.preview)));
    await A.click('#vsApply');await settled(A);
    const conv=await until(async()=>(await B.textContent('.vs-family'))==='Stellar Forge'&&await B.evaluate(()=>window.__worldStats?.()?.family)==='stellar-forge',20000);
    r=await recipe();
    check('the second window converges on the applied identity (change feed)',conv&&await B.evaluate(()=>window.ResonancePlayer.state.recipe.revision)===r.revision,`revision ${r.revision}`);
    // ---- Digital life: preview, adjust, cancel, apply, reload; a preview never reaches the other window ---------------
    const lifeOf=page=>page.evaluate(()=>{const l=window.__worldStats?.()?.life;return l?{grammar:l.grammar,alive:l.ecosystem?.alive??0}:null;});
    // (as a person does: the visible switch, whose label toggles the visually hidden input)
    const setSwitch=async(page,p,on)=>{const input=page.locator(`.field[data-path="${p}"] input`).first();if((await input.isChecked())!==on)await page.locator(`.field[data-path="${p}"] .switch`).first().click();};
    r=await recipe();
    check('a new built-in identity has digital life on (generator v4: with the musical ecology)',r.genome.life?.enabled===true&&r.genome.life.ecology===2&&r.recipeVersion===4,JSON.stringify(r.genome.life));
    check('the stage runs the identity\'s ecosystem',!!(await until(async()=>(await lifeOf(A))?.grammar==='stellar-forge',30000)),JSON.stringify(await lifeOf(A)));
    check('the Digital life switch is among the Essentials, named for what it does',await A.locator('.vs-sec-ess .field[data-path="life.enabled"]').count()===1&&(await A.textContent('.vs-sec-ess .field[data-path="life.enabled"]')).includes('Digital life'));
    check('a Digital life group lists the life controls under their purpose',await A.locator('details[data-purpose="life"] .field[data-path="life.density"]').count()===1&&await A.locator('details[data-purpose="life"] .field[data-path="life.alignment"]').count()===1);
    await setSwitch(A,'life.enabled',false);await previewing(A);
    await A.waitForFunction(()=>window.ResonancePlayer.state.preview?.recipe.genome.life?.enabled===false,null,{timeout:20000});
    const offShown=await until(async()=>(await lifeOf(A))===null,30000);
    check('turning life off previews the world without its ecosystem',!!offShown);
    check('the life preview saves nothing and does not reach the other window',(await recipe()).genome.life.enabled===true&&(await lifeOf(B))?.grammar==='stellar-forge',JSON.stringify(await lifeOf(B)));
    await A.click('#vsCancel');await settled(A);
    check('Cancel brings the saved ecosystem back',!!(await until(async()=>(await lifeOf(A))?.grammar==='stellar-forge',30000)));
    await setSwitch(A,'life.enabled',false);await previewing(A);await A.waitForFunction(()=>!document.querySelector('#vsApply').disabled,null,{timeout:10000});
    await A.click('#vsApply');await settled(A);r=await recipe();
    check('Apply saves life off',r.genome.life.enabled===false&&r.tuning?.values?.['life.enabled']===false,JSON.stringify(r.tuning?.values));
    check('the other window follows the applied identity (no ecosystem)',!!(await until(async()=>(await lifeOf(B))===null,30000)));
    await setSwitch(A,'life.enabled',true);await previewing(A);await setParam(A,'life.density',.5);
    await A.waitForFunction(()=>window.ResonancePlayer.state.preview?.recipe.genome.life?.density===.5,null,{timeout:20000});
    check('previewing life on with a lower population runs the ecosystem',!!(await until(async()=>(await lifeOf(A))?.grammar==='stellar-forge',30000)));
    await A.waitForFunction(()=>!document.querySelector('#vsApply').disabled,null,{timeout:10000});
    await A.click('#vsApply');await settled(A);r=await recipe();
    check('Apply saves life on and the population value',r.genome.life.enabled===true&&r.genome.life.density===.5,JSON.stringify(r.genome.life));
    await A.reload();await ready(A);
    check('after a reload the saved ecosystem runs',!!(await until(async()=>(await lifeOf(A))?.grammar==='stellar-forge',30000)));
    await shot(A,'life-1440');
    await B.close();B=null;
    // ---- Classic stages: preview locally, save as the project's stage ------------------------------------------------
    await tab(A,'classic');await card(A,'nexus');
    await A.waitForFunction(()=>window.ResonancePlayer.state.world==='nexus',null,{timeout:10000});
    let prefs=await get(`/api/preferences?id=${id}`);
    check('a classic stage previews in this window only',prefs.world===null&&(await badge(A))==='Preview · not saved');
    await A.click('#vsCancel');await A.waitForFunction(()=>window.ResonancePlayer.state.world==='living',null,{timeout:10000});
    check('Cancel returns to the saved stage',true);
    await card(A,'nexus');await A.click('#vsApply');
    prefs=await until(async()=>{const p=await get(`/api/preferences?id=${id}`);return p.world==='nexus'&&p;},10000);
    check('Apply saves the classic stage for the project',!!prefs);
    await tab(A,'living');await card(A,'machine-cathedral');await previewing(A);
    check('a family preview switches this window to the living world and says so',await until(async()=>await state(A,()=>window.ResonancePlayer.state.world)==='living'&&/Living world shown for the preview/.test(await A.textContent('.vs-badge')),10000));
    await A.click('#vsApply');
    await A.click('.modal button:has-text("Apply and show the living world")');await settled(A);
    prefs=await get(`/api/preferences?id=${id}`);r=await recipe();
    check('applying a family on a classic stage asks, then saves the living world too',prefs.world==='living'&&r.family==='machine-cathedral',`world ${prefs.world}, ${r.family}`);
    // The project's own stage choice can be given up again: it then follows Settings › Default world.
    await tab(A,'classic');await A.waitForSelector('#vsWorldGlobal',{timeout:10000});
    const globalLabel=await A.textContent('#vsWorldGlobal');await A.click('#vsWorldGlobal');
    prefs=await until(async()=>{const p=await get(`/api/preferences?id=${id}`);return p.world===null&&p;},10000);
    await A.waitForSelector('#vsWorldGlobal',{state:'detached',timeout:10000}).catch(()=>{});
    check('"Use the global default" clears the project\'s own stage, and the keyboard stays in the browser',!!prefs&&await A.locator('#vsWorldGlobal').count()===0&&await state(A,()=>!!document.activeElement?.closest('.vs-browser'))&&await state(A,()=>window.ResonancePlayer.state.world)==='living',`${globalLabel.trim()} → preferences.world ${prefs?.world}`);
    await tab(A,'living');
    // ---- Keyboard, quality, route, leaving with a preview ------------------------------------------------------------
    await A.focus('.vs-card[data-card="fractal-biosphere"] .vs-card-main');await A.keyboard.press('Enter');await previewing(A);
    check('a world card works from the keyboard (Enter) and keeps the focus',await state(A,()=>window.ResonancePlayer.state.preview.recipe.family)==='fractal-biosphere'&&await state(A,()=>document.activeElement?.closest('[data-card]')?.dataset.card)==='fractal-biosphere');
    await A.keyboard.press('Tab');
    // The built-in worlds are shown Fractal Biosphere, Stellar Forge, Machine Cathedral.
    check('Tab moves on to the next card',await state(A,()=>document.activeElement?.closest('[data-card]')?.dataset.card)==='stellar-forge');
    await A.click('#vsCancel');await settled(A);
    await A.click('#vsQuality button[data-value="2"]');
    check('quality is set for this device only',await state(A,()=>window.ResonancePlayer.state.quality)==='2'&&await state(A,()=>JSON.parse(localStorage.getItem('code-resonance-device-v1')).quality)==='2');
    await A.reload();await ready(A);
    check('the device quality survives a reload',await A.getAttribute('#vsQuality button[data-value="2"]','aria-checked')==='true');
    await A.click('#vsQuality button[data-value="auto"]');
    await A.goto(`${base}#/visual/family/fractal-biosphere`);await ready(A);await previewing(A);
    check('#/visual/family/<id> starts a preview of that family',await state(A,()=>window.ResonancePlayer.state.preview.recipe.family)==='fractal-biosphere');
    await A.goto(`${base}#/visual/look/northlight.ember-observatory`);await ready(A);await previewing(A);
    check('#/visual/look/<packId> starts a preview of that look',await state(A,()=>window.ResonancePlayer.state.preview.recipe.pack?.id)==='northlight.ember-observatory');
    await A.setViewportSize({width:900,height:800});await sleep(800);await shot(A,'preview-900');
    const overflow=await A.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    const applyBox=await A.locator('#vsApply').boundingBox();
    check('900 px wide: no horizontal page overflow, Apply on screen',!overflow&&!!applyBox&&applyBox.y>=0&&applyBox.y+applyBox.height<=800&&applyBox.x+applyBox.width<=900,JSON.stringify(applyBox));
    await A.setViewportSize({width:1440,height:900});
    const rev=(await recipe()).revision;
    await A.click('.rail a[data-ws="home"]');
    await A.waitForFunction(()=>!window.ResonancePlayer.state.preview,null,{timeout:10000});
    check('leaving with a pending preview discards it, says so and saves nothing',(await recipe()).revision===rev&&await A.isVisible('text=The preview was discarded when you left Visual Studio'));
    // The browser logs every non-2xx response; this run provokes exactly one 400 (the preset that needs a missing
    // family) and two 409 (the two stale applies). Anything else is an error.
    const provoked={400:0,409:0},other=[];
    for(const e of errors){const m=/^page A: Failed to load resource: the server responded with a status of (400|409)/.exec(e);if(m)provoked[m[1]]++;else other.push(e);}
    measurements.provokedHttpErrors=provoked;
    check('no console errors or page errors (besides the provoked 400 and 409 responses)',other.length===0&&provoked[400]===1&&provoked[409]===2,other.slice(0,5).join(' | ')||JSON.stringify(provoked));
  }catch(e){check('qualification ran to the end',false,e.stack||e.message);}
  finally{
    await browser.close().catch(()=>{});await env.stop();
    const failed=checks.filter(c=>!c.pass).length;
    await fsp.writeFile(path.join(OUT,'visual.json'),JSON.stringify({at:new Date().toISOString(),passed:checks.length-failed,failed,checks,measurements,screenshots,errors},null,2));
    console.log(`\n${checks.length-failed}/${checks.length} passed · screenshots: ${screenshots.join(', ')}`);
    process.exitCode=failed?1:0;
  }
})();

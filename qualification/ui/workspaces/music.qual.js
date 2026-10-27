'use strict';
// Real-browser qualification of the Music Studio (#/music): every control through the real interface, its effect checked
// in the engine (what is heard), in the receiver (what is saved), after a reload, and in a second window (the Stage).
// Usage: node qualification/ui/workspaces/music.qual.js   (isolated data directory; port UI_QUAL_PORT, default 4183)
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const REPO=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(REPO,'qualification/node_modules/playwright-core'));
const {createEnvironment}=require('../environment.js');
const OUT=path.join(REPO,'qualification/results/ui');
const PORT=Number(process.env.UI_QUAL_PORT||4183);
// Analyser taps on every connection to the audio destination measure what is actually output (as browser/stage.qual.js).
const TAP=`(()=>{const orig=AudioNode.prototype.connect;window.__taps=[];
AudioNode.prototype.connect=function(dest,...r){if(dest instanceof AudioDestinationNode){const a=this.context.createAnalyser();a.fftSize=4096;orig.call(this,a);window.__taps.push(a);}return orig.call(this,dest,...r);};
window.__level=()=>{let peak=0,sum=0,n=0;for(const a of window.__taps){if(a.context.state==='closed')continue;const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);for(const v of b){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;}}return {peak,rms:n?Math.sqrt(sum/n):0};};})();`;
const checks=[];const measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const until=(page,fn,arg=null,timeout=10000)=>page.waitForFunction(fn,arg,{timeout,polling:100}).then(()=>true,()=>false);
const opts=page=>page.evaluate(()=>window.ResonancePlayer.state.sound.options);
async function rms(page,ms=3000){const l=[];for(let t=0;t<ms;t+=250){l.push(await page.evaluate(()=>window.__level()));await page.waitForTimeout(250);}return {rms:+(l.reduce((a,x)=>a+x.rms,0)/l.length).toFixed(5),peak:+Math.max(...l.map(x=>x.peak)).toFixed(4)};}
async function ready(page){
  await page.waitForSelector('.ws-music .ms-style[aria-checked="true"]',{timeout:20000});
  return until(page,()=>{const P=window.ResonancePlayer,s=document.getElementById('msStyleSource');return !!P.state.model&&!!P.state.frame&&!!P.state.recipe&&!!s&&s.textContent.length>0&&!/Loading/.test(s.textContent)&&!!document.querySelector('#musicIdentity .ms-motif');},null,25000);
}
// The exact-value entry next to a slider (typing a value is how a keyboard user sets one precisely).
async function enter(page,rangeSelector,value){const box=page.locator(`${rangeSelector} + input`);await box.fill(String(value));await box.press('Enter');}
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const env=await createEnvironment({port:PORT});
  const {url}=env,L=env.projects.lumen,SAMPLE=env.projects.sample;
  const api=async p=>(await fetch(url+p,{cache:'no-store'})).json();
  const prefs=id=>api(`/api/preferences?id=${id}`).then(d=>d.music);
  const settings=()=>api('/api/settings').then(d=>d.music);
  const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  const errors=[];
  const newPage=async(viewport={width:1440,height:900})=>{const ctx=browser.contexts()[0]||await browser.newContext({acceptDownloads:true});const p=await ctx.newPage();await p.setViewportSize(viewport);
    p.on('console',m=>{if(m.type()==='error')errors.push(`${m.text()} (${p.url()})`);});p.on('pageerror',e=>errors.push(String(e)));await p.addInitScript(TAP);return p;};
  try{
    await browser.newContext({acceptDownloads:true});
    const A=await newPage();
    await A.goto(`${url}/?project=${L}#/music`);
    check('Music Studio loads for the project',await ready(A));
    // ---- Nothing plays until the person asks -----------------------------------------------------------------
    await A.waitForTimeout(1500);
    const silent=await A.evaluate(()=>({enabled:window.ResonancePlayer.state.sound.enabled,taps:window.__taps.length}));
    check('no audio starts on page load',!silent.enabled&&silent.taps===0,JSON.stringify(silent));
    check('"Enable sound to hear changes" is offered',await A.isVisible('#musicEnableSound'));
    check('scope defaults to this project',await A.getAttribute('#musicScope [data-value="project"]','aria-checked')==='true');
    await A.screenshot({path:path.join(OUT,'music-1440-sound-off.png')});
    // ---- The identity shown is the score's own --------------------------------------------------------------------
    const id=await A.evaluate(()=>{const P=window.ResonancePlayer,S=window.ResonanceScore,seed=P.state.frame?.projectSeed||S.hash(P.state.project),i=S.createIdentity(seed),box=document.getElementById('musicIdentity');
      return {key:`${i.key} ${i.mode[0].toUpperCase()+i.mode.slice(1)}`,tempo:i.tempo,swing:i.swing,notes:i.motif.rhythm.length,text:box.textContent,
        cells:Object.fromEntries([...box.querySelectorAll('.ms-tempo-cell')].map(c=>[c.dataset.style,Number(c.querySelector('b').textContent)])),rects:box.querySelectorAll('.ms-motif rect').length};});
    measurements.identity={key:id.key,tempo:id.tempo,swing:id.swing};
    check('identity: key and mode from ResonanceScore.createIdentity(seed)',id.text.includes(id.key),id.key);
    check('identity: project tempo per style',JSON.stringify(id.cells)===JSON.stringify(id.tempo),JSON.stringify(id.cells));
    check('identity: motif drawn from its rhythm and contour (call and answer)',id.rects===id.notes*2,`${id.rects} blocks for ${id.notes} notes`);
    check('identity: swing shown',id.text.includes(id.swing>0?'Yes':'No'));
    // ---- Enable sound (a click) and hear the music -------------------------------------------------------------------
    await A.click('#musicEnableSound');
    check('sound starts after the click',await until(A,()=>window.ResonancePlayer.state.sound.enabled));
    await A.waitForTimeout(2500);
    const base=await rms(A);measurements.ambient=base;
    check('music is audible',base.rms>0,JSON.stringify(base));
    check('live read-outs follow the engine',await until(A,()=>{const t=document.getElementById('musicLive').textContent,P=window.ResonancePlayer.state;return P.bar>0&&t.includes(`${P.sound.tempo} BPM`)&&/dB/.test(t);},null,8000));
    // ---- Style preview in project scope ------------------------------------------------------------------------------
    const prefs0=await prefs(L);
    await A.click('.ms-style[data-style="pulse"]');
    check('preview: style changes in the engine at once',(await opts(A)).style==='pulse');
    check('preview: "Previewing · not saved" bar and stage badge',await A.isVisible('#musicPreviewBar')&&(await A.textContent('#musicPreviewBar')).includes('Previewing · not saved')&&await A.isVisible('.ms-chrome .slot-badge'));
    check('preview: nothing saved',JSON.stringify(await prefs(L))===JSON.stringify(prefs0)&&(await settings()).style==='ambient');
    check('preview: heard from the next bar (project tempo for Pulse)',await until(A,t=>window.ResonancePlayer.state.sound.tempo===t,id.tempo.pulse,9000),`expected ${id.tempo.pulse} BPM`);
    const pulse=await rms(A);measurements.pulsePreview=pulse;
    check('preview is audible',pulse.rms>0,JSON.stringify(pulse));
    await A.click('#musicCancel');
    check('cancel restores the saved style',(await opts(A)).style==='ambient'&&!(await A.isVisible('#musicPreviewBar')));
    check('cancel saved nothing',(await prefs(L)).style===null);
    // Keyboard: the checked card is the tab stop; arrows move the choice.
    await A.focus('.ms-style[data-style="ambient"]');await A.keyboard.press('ArrowRight');
    check('style cards work with the keyboard',await A.getAttribute('.ms-style[data-style="pulse"]','aria-checked')==='true'&&(await opts(A)).style==='pulse'&&await A.evaluate(()=>document.activeElement.dataset.style)==='pulse');
    // ---- A second window: the Stage, already playing ---------------------------------------------------------------------
    const B=await newPage({width:1280,height:720});
    await B.goto(`${url}/?project=${L}#/stage`);
    await until(B,()=>!!window.ResonancePlayer?.state.model,null,20000);
    await B.click('#stageSoundBtn');
    await until(B,()=>window.ResonancePlayer.state.sound.enabled&&window.ResonancePlayer.state.bar>1,null,15000);
    const b0=await B.evaluate(()=>{window.__ctx0=window.__taps.at(-1)?.context;return {bar:window.ResonancePlayer.state.bar,style:window.ResonancePlayer.state.sound.options.style,taps:window.__taps.length};});
    check('second window plays the saved style (not the preview)',b0.style==='ambient',JSON.stringify(b0));
    // ---- Apply ---------------------------------------------------------------------------------------------------
    await A.click('#musicApply');
    check('apply saves to the project (GET /api/preferences)',await until(A,()=>!document.getElementById('musicPreviewBar').checkVisibility())&&(await prefs(L)).style==='pulse');
    check('apply leaves the global default alone (GET /api/settings)',(await settings()).style==='ambient');
    check('second window converges through the change feed',await until(B,()=>window.ResonancePlayer.state.sound.options.style==='pulse',null,12000));
    await B.waitForTimeout(3000);
    const b1=await B.evaluate(()=>({bar:window.ResonancePlayer.state.bar,enabled:window.ResonancePlayer.state.sound.enabled,sameContext:window.__taps.at(-1)?.context===window.__ctx0,taps:window.__taps.length,tempo:window.ResonancePlayer.state.sound.tempo}));
    measurements.secondWindow={before:b0,after:b1};
    check('second window: the music did not restart (same audio context, bar keeps counting)',b1.enabled&&b1.sameContext&&b1.taps===b0.taps&&b1.bar>b0.bar,JSON.stringify(b1));
    // ---- Reload: the effective style is shown, with its source -------------------------------------------------------
    await A.reload();await ready(A);
    check('after reload: Pulse is selected and marked as this project\'s',await A.getAttribute('.ms-style[data-style="pulse"]','aria-checked')==='true'&&(await A.textContent('#msStyleSource')).includes('This project'));
    check('after reload: sound stays off until a click',!(await A.evaluate(()=>window.ResonancePlayer.state.sound.enabled)));
    await A.click('#musicEnableSound');await until(A,()=>window.ResonancePlayer.state.sound.enabled);
    // ---- Tempo: manual round trip ----------------------------------------------------------------------------------
    await A.click('#musicTempoMode [data-value="manual"]');
    check('tempo: manual mode previews',(await opts(A)).tempoMode==='manual'&&await A.isVisible('#musicTempo'));
    // A value is shown once: in manual mode by the slider's entry box, not again in the field's read-out.
    check('tempo and texture: each value is shown once',!(await A.isVisible('.ms-field:has(#musicTempoMode) .field-value'))&&await A.locator('.ms-field:has(#musicTexture) .field-value').count()===0);
    await enter(A,'#musicTempo',120);
    check('tempo: 120 BPM is heard from the next bar',(await opts(A)).tempo===120&&await until(A,()=>window.ResonancePlayer.state.sound.tempo===120,null,9000));
    await A.click('#musicApply');
    await until(A,()=>!document.getElementById('musicPreviewBar').checkVisibility());
    const pt=await prefs(L);check('tempo: saved to the project',pt.tempoMode==='manual'&&pt.tempo===120,JSON.stringify(pt));
    await A.reload();await ready(A);
    check('tempo: shown after reload',await A.inputValue('#musicTempo')==='120'&&await A.getAttribute('#musicTempoMode [data-value="manual"]','aria-checked')==='true');
    await A.locator('.ms-field:has(#musicTempoMode) .ms-source .link-btn').click();
    check('tempo: "Use global" clears the project value',await until(A,()=>window.ResonancePlayer.state.sound.options.tempoMode==='project')&&JSON.stringify(await prefs(L).then(m=>[m.tempoMode,m.tempo]))==='[null,null]');
    check('tempo: the field now says it inherits',(await A.textContent('.ms-field:has(#musicTempoMode) .ms-source')).includes('Inherits global: From the project'));
    // ---- Texture round trip ------------------------------------------------------------------------------------
    await enter(A,'#musicTexture',15);
    check('texture: previews 15%',Math.abs((await opts(A)).texture-.15)<1e-9);
    check('texture: explains the real effect (arpeggios rest below 20%)',(await A.textContent('.ms-effects')).includes('Resting (below 20%)'));
    await A.click('#musicApply');await until(A,()=>!document.getElementById('musicPreviewBar').checkVisibility());
    check('texture: saved to the project',Math.abs((await prefs(L)).texture-.15)<1e-9);
    await A.reload();await ready(A);
    check('texture: shown after reload',await A.inputValue('#musicTexture')==='15');
    await A.locator('.ms-field:has(#musicTexture) .ms-source .link-btn').click();
    check('texture: "Use global" clears it',await until(A,()=>Math.abs(window.ResonancePlayer.state.sound.options.texture-.58)<1e-9)&&(await prefs(L)).texture===null);
    // ---- Global defaults ------------------------------------------------------------------------------------------
    await A.click('#musicScope [data-value="global"]');
    await A.click('.ms-style[data-style="cinematic"]');
    check('global scope: says the project keeps its own style',(await A.textContent('#msStyleSource')).includes('uses its own: Pulse'));
    check('global scope: Apply names the scope',(await A.textContent('#musicApply')).includes('global default'));
    await A.click('#musicApply');
    check('global scope: saved (GET /api/settings)',await until(A,()=>!document.getElementById('musicPreviewBar').checkVisibility())&&(await settings()).style==='cinematic');
    // Toasts outlive the view and also show over the Stage: the notice about the project's own value names no project.
    const keptToast=await until(A,()=>[...document.querySelectorAll('.toast')].some(t=>/This project keeps its own style/.test(t.textContent)),null,3000);
    const toastText=await A.evaluate(()=>[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' / '));
    check('global scope: the notice names no private project',keptToast&&!/lumen-recipes/i.test(toastText),toastText);
    check('global scope: the project override is kept and heard',(await prefs(L)).style==='pulse'&&(await opts(A)).style==='pulse');
    const C=await newPage({width:1280,height:720});
    await C.goto(`${url}/?project=${SAMPLE}#/music`);await ready(C);
    check('a project without its own style uses the global default',(await opts(C)).style==='cinematic'&&(await C.textContent('#msStyleSource')).includes('Inherits global: Cinematic')&&(await prefs(SAMPLE)).style===null);
    await C.screenshot({path:path.join(OUT,'music-1280-inherits.png')});await C.close();
    // ---- Volume (global only) ------------------------------------------------------------------------------------
    await enter(A,'#musicVolume',40);
    check('volume: saved globally',await until(A,()=>window.ResonancePlayer.state.sound.options.volume===.4)&&(await settings()).volume===.4);
    check('volume: no unsaved preview left behind',!(await A.isVisible('#musicPreviewBar')));
    check('volume: second window follows',await until(B,()=>window.ResonancePlayer.state.sound.options.volume===.4,null,8000));
    // ---- Visual response to the music (recipe tuning) ---------------------------------------------------------------------
    await A.click('#musicAdvanced summary');
    const tunable=await api(`/api/recipe/tunable?id=${L}`);const baseR=tunable.base['music.reactivity'];
    await enter(A,'input[data-path="music.reactivity"]',0.25);
    const saveR=await until(A,()=>window.ResonancePlayer.state.recipe?.genome?.music?.reactivity===.25,null,8000);
    const rec=await api(`/api/recipe?id=${L}`);
    check('reactivity: saved in the project\'s recipe (GET /api/recipe)',saveR&&rec.genome.music.reactivity===.25&&rec.tuning?.values?.['music.reactivity']===.25,`revision ${rec.revision}`);
    check('reactivity: second window follows',await until(B,()=>window.ResonancePlayer.state.recipe?.genome?.music?.reactivity===.25,null,8000));
    await A.screenshot({path:path.join(OUT,'music-1440-advanced.png')});
    await A.locator('.ms-field[data-path="music.reactivity"] button:has-text("Use generated")').click();
    const back=await until(A,b=>window.ResonancePlayer.state.recipe?.genome?.music?.reactivity===b,baseR,8000);const rec2=await api(`/api/recipe?id=${L}`);
    check('reactivity: "Use generated" restores the generated value',back&&rec2.genome.music.reactivity===baseR&&!rec2.tuning?.values?.['music.reactivity'],`${rec2.genome.music.reactivity} vs ${baseR}`);
    // ---- Presets ---------------------------------------------------------------------------------------------------
    await A.click('#musicScope [data-value="project"]');
    await A.fill('#musicPresetName','<bad>');await A.click('#musicPresetSave');
    check('preset: an invalid name is refused with a reason',(await A.textContent('#musicPresetError')).length>0&&(await api('/api/presets')).presets.length===0);
    await A.click('.ms-style[data-style="chip"]');
    await A.fill('#musicPresetName','Chip sketch');await A.press('#musicPresetName','Enter');
    await until(A,()=>!!document.querySelector('.ms-preset'));
    const created=(await api('/api/presets')).presets.find(p=>p.name==='Chip sketch');const heard=await opts(A);
    check('preset: saves what is heard (GET /api/presets)',created?.kind==='music'&&created.payload.style==='chip'&&created.payload.style===heard.style&&created.payload.tempoMode===heard.tempoMode&&Math.abs(created.payload.texture-heard.texture)<1e-9,JSON.stringify(created?.payload));
    await A.click('#musicCancel');
    await A.click(`.ms-preset[data-preset="${created.id}"] [data-act="preview"]`);
    check('preset: preview is heard and labelled',(await opts(A)).style==='chip'&&await A.isVisible('#musicPreviewBar'));
    await A.click('#musicCancel');
    check('preset: cancel restores',(await opts(A)).style==='pulse');
    await A.click(`.ms-preset[data-preset="${created.id}"] [data-act="apply"]`);
    check('preset: applied to the project',await until(A,()=>window.ResonancePlayer.state.sound.options.style==='chip')&&(await prefs(L)).style==='chip');
    check('preset: the identity is untouched',(await A.evaluate(()=>document.getElementById('musicIdentity').textContent)).includes(id.key));
    await A.click(`.ms-preset[data-preset="${created.id}"] [data-act="rename"]`);
    await A.fill('.modal input','Chip sketch two');await A.click('.modal-foot .btn.primary');
    check('preset: renamed',await until(A,()=>[...document.querySelectorAll('.ms-preset strong')].some(e=>e.textContent==='Chip sketch two'))&&(await api('/api/presets')).presets[0].name==='Chip sketch two');
    await A.click(`.ms-preset[data-preset="${created.id}"] [data-act="delete"]`);
    await A.click('.modal-foot .btn.danger');
    check('preset: deleted after confirmation',await until(A,()=>!document.querySelector('.ms-preset'))&&(await api('/api/presets')).presets.length===0);
    // ---- Screenshots with a preview pending -----------------------------------------------------------------------
    await A.click('.ms-style[data-style="ambient"]');await A.waitForTimeout(2600);
    await A.evaluate(()=>document.querySelector('.ws-music .page').scrollTop=0);
    await A.screenshot({path:path.join(OUT,'music-1440-preview.png')});
    await A.setViewportSize({width:1280,height:720});await A.waitForTimeout(600);await A.screenshot({path:path.join(OUT,'music-1280-preview.png')});
    await A.setViewportSize({width:900,height:800});await A.waitForTimeout(600);await A.screenshot({path:path.join(OUT,'music-900-preview.png')});
    const overflow=await A.evaluate(()=>document.querySelector('.ws-music').scrollWidth-document.querySelector('.ws-music').clientWidth);
    check('900 px wide: no horizontal overflow',overflow<=0,`${overflow}px`);
    // At 900 px the monitor leads, so the visuals are seen reacting while the controls are in view.
    await A.evaluate(()=>document.querySelector('.ws-music').scrollTop=0);await A.waitForTimeout(400);
    const narrow=await A.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),slot=r('.ms-slot'),host=r('#stageHost'),styles=r('.ms-styles');
      return {slotTop:Math.round(slot.top),stylesTop:Math.round(styles.top),placed:Math.abs(host.top-slot.top)<2&&Math.abs(host.width-slot.width)<2,inView:slot.bottom<=innerHeight};});
    check('900 px wide: the stage is placed above the controls, in view',narrow.placed&&narrow.inView&&narrow.slotTop<narrow.stylesTop,JSON.stringify(narrow));
    check('900 px wide: the performance monitor is still a landmark',/complementary "Performance monitor"/.test(await A.locator('body').ariaSnapshot()));
    await A.setViewportSize({width:1440,height:900});
    // ---- Keyboard reach --------------------------------------------------------------------------------------------
    await A.focus('.ws-music h1');const reached=new Set();
    for(let i=0;i<60;i++){await A.keyboard.press('Tab');const d=await A.evaluate(()=>{const e=document.activeElement;return e.id||e.dataset.style||e.dataset.act||e.closest('[id]')?.id||e.tagName;});reached.add(d);}
    const need=['musicScope','musicCancel','musicApply','ambient','musicTempoMode','musicTexture','musicVolume','musicExport','musicPresetName','musicPresetSave'];
    check('every control is reachable with Tab',need.every(n=>reached.has(n)),need.filter(n=>!reached.has(n)).join(', ')||'all reached');
    // ---- Leaving with a pending preview cancels it -------------------------------------------------------------------
    await A.click('.rail a[data-ws="home"]');
    check('leaving cancels the preview (with a notice)',await until(A,()=>window.ResonancePlayer.state.sound.options.style==='chip',null,5000)&&await until(A,()=>[...document.querySelectorAll('.toast')].some(t=>/preview cancelled/i.test(t.textContent)),null,3000));
    // ---- Export ------------------------------------------------------------------------------------------------------
    // The offline render competes for the CPU with every open page: the Stage window is closed first.
    await B.close();
    await A.goto(`${url}/?project=${L}#/music`);await ready(A);
    // The export renders up to ten minutes from the replay position (the last ten in live mode): from 30 s before the
    // end, the render is short enough for a two-core machine without a GPU (CI), where four minutes took over eight.
    await A.evaluate(()=>window.ResonancePlayer.setMode('replay'));
    await A.waitForFunction(()=>window.ResonancePlayer.state.position.loaded&&window.ResonancePlayer.state.position.end>0,null,{timeout:60000});
    await A.evaluate(()=>{const p=window.ResonancePlayer.state.position;window.ResonancePlayer.seek(p.end-30000);});
    const t0=Date.now(),download=A.waitForEvent('download',{timeout:480000}).catch(()=>null);
    await A.click('#musicExport');
    check('export: shows that it is rendering',await until(A,()=>/Rendering/.test(document.getElementById('musicExport').textContent),null,3000));
    const file=await download;
    if(file){const saved=path.join(OUT,'music-export.wav');await file.saveAs(saved);const head=fs.readFileSync(saved).subarray(0,12).toString('latin1'),size=fs.statSync(saved).size;
      measurements.export={file:file.suggestedFilename(),bytes:size,renderMs:Date.now()-t0};check('export: a WAV of the recorded performance',head.startsWith('RIFF')&&head.endsWith('WAVE')&&size>1000000,`${file.suggestedFilename()} ${size} bytes in ${Date.now()-t0} ms`);
      await fsp.rm(saved,{force:true});}
    else check('export: a WAV of the recorded performance',false,`no download after ${Date.now()-t0} ms; toasts: ${await A.evaluate(()=>[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' / '))}`);
    check('export: names no private folder',!file||!/lumen-recipes/i.test(file.suggestedFilename()),file?.suggestedFilename()||'');
    await A.evaluate(()=>document.querySelector('.ws-music .page').scrollTop=0);await A.waitForTimeout(300);
    await A.screenshot({path:path.join(OUT,'music-1440.png')});
    // ---- Code hygiene: no markup parsing in this workspace ---------------------------------------------------------------
    const src=fs.readFileSync(path.join(REPO,'public/ui/workspaces/music.js'),'utf8');
    check('no innerHTML/insertAdjacentHTML/outerHTML in the workspace',!/innerHTML|insertAdjacentHTML|outerHTML/.test(src));
    check('no page errors',errors.length===0,errors.slice(0,4).join(' | '));
  }catch(e){check('qualification ran to the end',false,e.stack||e.message);}
  finally{await browser.close();await env.stop();}
  await fsp.writeFile(path.join(OUT,'music.json'),JSON.stringify({at:new Date().toISOString(),browser:'chromium (playwright-core, headless)',checks,measurements},null,2));
  const failed=checks.filter(c=>!c.pass).length;console.log(`${checks.length-failed}/${checks.length} checks passed`);
  process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});

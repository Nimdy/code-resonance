'use strict';
// Phase 11 product qualification: the brief's workflows (§29, scenarios A–F) through the real Control Center at
// 1920×1080 — clicks, typing, real routes, a real receiver on a copy of a recorded project. The script never takes a
// shortcut through the API for a step a person performs; it reads state (the engine, the receiver) only to verify.
//   A  Music Studio: the composed score, Ambient, Evolution, Atmosphere and the balance heard in the engine; Cancel,
//      Apply, a reusable preset; after a reload the saved profile and the preset are back.
//   B  Visual Studio: Fractal Biosphere, Music influence 0 → 1 → 2 previewed (the Phase 11 ecology through the
//      upgrade), applied, and held by the saved recipe.
//   C  Artist Studio from Fractal Biosphere: a fractal layer recoloured, ribbons whose speed follows the music, the
//      Cinematic finish, saved as a named composition and applied to the project.
//   D  Artist Studio from the blank canvas: structure and particles, a palette, a musical and an engineering mapping,
//      saved and previewed on the recorded project (the stage draws the layers, none failed).
//   E  Export of a saved composition (the .zip downloaded through the interface, its pack.json inspected), imported and
//      installed through Visual Packs in a second isolated receiver on another project, used there.
//   F  The Stage with the composition and the composed music applied: a short recording through the interface, its
//      WebM checked with ffprobe (video and audio streams, duration, non-silent audio).
// The AMD integrated GPU (ANGLE/D3D12, harness.launch('amd')); never another adapter. Isolated data only: datasets are
// copied to fresh /tmp/cr-p11-* directories, removed afterwards.
// Usage: node qualification/ui/phase11.qual.js [--only A,B,C,D,E,F] [--keep] [--out <dir>]
//        node qualification/ui/phase11.qual.js --film4 <dir> [--fresh] [--out <dir>]   (Film 4's compositions, below)
// Results: qualification/results/films/phase11/ui/phase11.json and the screenshots beside it (ignored directory).
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const cp=require('node:child_process');
const REPO=path.resolve(__dirname,'../..');
const H=require('../visual/harness.js');
const {createService}=require(path.join(REPO,'receiver/server'));
const FFMPEG=require(path.join(REPO,'qualification/node_modules/ffmpeg-static'));
const DATASETS=path.join(REPO,'qualification/results/datasets');
const argv=process.argv.slice(2),flag=k=>{const i=argv.indexOf(k);return i<0?null:argv[i+1]??'';};
const OUT=path.resolve(flag('--out')||path.join(REPO,'qualification/results/films/phase11/ui'));
const ONLY=new Set((flag('--only')||'A,B,C,D,E,F').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean));
const KEEP=argv.includes('--keep');
const VIEW={width:1920,height:1080};
const checks=[],observed={},screenshots=[],errors=[];
const scenario={id:null};
function check(name,pass,detail=''){checks.push({scenario:scenario.id,name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  [${scenario.id}] ${name}${detail?` — ${detail}`:''}`);return !!pass;}
const note=(k,v)=>{(observed[scenario.id]||(observed[scenario.id]={}))[k]=v;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=(page,fn,arg=null,timeout=15000)=>page.waitForFunction(fn,arg,{timeout,polling:150}).then(()=>true,()=>false);
// Analyser taps on every connection to the audio destination: what is actually output (as music.qual.js).
const TAP=`(()=>{const orig=AudioNode.prototype.connect;window.__taps=[];
AudioNode.prototype.connect=function(dest,...r){if(dest instanceof AudioDestinationNode){const a=this.context.createAnalyser();a.fftSize=4096;orig.call(this,a);window.__taps.push(a);}return orig.call(this,dest,...r);};
window.__level=()=>{let peak=0,sum=0,n=0;for(const a of window.__taps){if(a.context.state==='closed')continue;const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);for(const v of b){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;}}return {peak,rms:n?Math.sqrt(sum/n):0};};})();`;
async function level(page,ms=2500){const l=[];for(let t=0;t<ms;t+=250){l.push(await page.evaluate(()=>window.__level()));await sleep(250);}return {rms:+(l.reduce((a,x)=>a+x.rms,0)/l.length).toFixed(5),peak:+Math.max(...l.map(x=>x.peak)).toFixed(4)};}
// ---- Isolated receivers ---------------------------------------------------------------------------------------------
const made=[];
async function receiver(dataset,dir=null){
  if(!dir){dir=await fsp.mkdtemp(path.join(os.tmpdir(),'cr-p11-'));made.push(dir);await fsp.cp(path.join(DATASETS,dataset),dir,{recursive:true});}
  const svc=await createService({port:0,dataDir:dir}).start();await svc.flush();
  const url=`http://127.0.0.1:${svc.port}`,project=H.projectOf(dir);
  const get=async p=>{const r=await fetch(url+p,{cache:'no-store'});if(!r.ok)throw new Error(`${p}: HTTP ${r.status}`);return r.json();};
  return {svc,dir,url,project,get,recipe:()=>get(`/api/recipe?id=${project}`),async stop(){await svc.stop();}};
}
// ---- Pages ----------------------------------------------------------------------------------------------------------
// A browser paired with the receiver as a person pairs one (the key it keeps from the private link), with the
// qualification hooks (?qual=1) for reading the engine.
async function context(browser,env){
  const ctx=await browser.newContext({viewport:VIEW,acceptDownloads:true});
  await ctx.addInitScript(([k])=>{try{localStorage.setItem('code-resonance-pairing',k);}catch{}},[env.svc.pairing]);
  await ctx.addInitScript(TAP);
  return ctx;
}
async function page(ctx,env,route,label){
  const p=await ctx.newPage();
  p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(`${label}: ${m.text().slice(0,300)}`);});p.on('pageerror',e=>errors.push(`${label}: ${String(e).slice(0,300)}`));
  await p.goto(`${env.url}/?project=${env.project}&qual=1#/${route}`);
  await p.waitForFunction(()=>!!window.ResonancePlayer?.state.recipe&&!!window.ResonancePlayer.state.model,null,{timeout:45000});
  return p;
}
// A screenshot as a person takes one: the notifications dismissed first (their own buttons).
async function shot(p,name){for(const b of await p.locator(".toast button[aria-label=\"Dismiss\"]").all())await b.click().catch(()=>{});await sleep(300);
  const f=path.join(OUT,`${name}.png`);await p.screenshot({path:f});screenshots.push(f);return f;}
const toastText=p=>p.evaluate(()=>[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | '));
// The exact-value entry beside a slider (typing a value, as a keyboard user sets one precisely).
async function enter(loc,value){await loc.fill(String(value));await loc.press('Enter');}
const opts=p=>p.evaluate(()=>window.ResonancePlayer.state.sound.options);
// ======================================================================================================================
// A — Improve a project's music
async function scenarioA(browser,env){
  const ctx=await context(browser,env);let p=await page(ctx,env,'music','A');
  try{
    await p.waitForSelector('.ws-music .ms-style[aria-checked="true"]',{timeout:20000});
    await until(p,()=>!/Reading/.test(document.querySelector('#musicScore .ms-score-title')?.textContent||'Reading'),null,20000);
    const title0=await p.textContent('#musicScore .ms-score-title');
    note('scoreBefore',title0);
    check('the lumen identity plays the classic score (pre-v4)',/Classic/.test(title0),title0);
    await until(p,()=>!document.getElementById('musicScoreUpgrade')?.disabled,null,20000);
    await p.click('#musicScoreUpgrade');
    const upgraded=await until(p,()=>window.ResonancePlayer.state.recipe?.genome?.music?.score===3&&/Composed/.test(document.querySelector('#musicScore .ms-score-title').textContent),null,20000);
    const r1=await env.recipe();
    check('"Use the composed score" saves music.score 3 to the identity',upgraded&&r1.genome?.music?.score===3,`recipe revision ${r1.revision}, music.score ${r1.genome?.music?.score}`);
    await p.click('#musicEnableSound');
    check('sound starts after the click',await until(p,()=>window.ResonancePlayer.state.sound.enabled));
    check('the engine plays score v3 from the next bar',await until(p,()=>window.ResonancePlayer.state.sound.score===3,null,15000));
    const base=await level(p);note('levelBefore',base);
    check('music is audible',base.rms>0,JSON.stringify(base));
    // Ambient (selected in the interface: the card's click, whether or not it is the saved style).
    const saved0=await opts(p);note('savedStyle',saved0.style);
    if(saved0.style==='ambient'){await p.click('.ms-style[data-style="pulse"]');await until(p,()=>window.ResonancePlayer.state.sound.options.style==='pulse');}
    await p.click('.ms-style[data-style="ambient"]');
    check('Ambient is selected (card and engine)',await until(p,()=>window.ResonancePlayer.state.sound.options.style==='ambient'&&document.querySelector('.ms-style[data-style="ambient"]').getAttribute('aria-checked')==='true'));
    // Evolution and Atmosphere: the sliders (the engine's profile follows at once; heard from the next bar).
    await p.fill('#musicProfile-evolution','85');await p.fill('#musicProfile-atmosphere','80');
    let o=await opts(p);
    check('Evolution and Atmosphere reach the engine profile',Math.abs(o.profile.evolution-.85)<1e-9&&Math.abs(o.profile.atmosphere-.8)<1e-9,`evolution ${o.profile.evolution}, atmosphere ${o.profile.atmosphere}`);
    check('the preview bar names the change, nothing saved',await p.isVisible('#musicPreviewBar')&&/Evolution|Character/.test(await p.textContent('#musicPreviewBar')));
    // The balance: the pads lowered, the melody raised, and a voice that is sounding now muted: it leaves the arrangement
    // of the following bars (observed bar by bar; the bar in progress may still hold it).
    const avail=await p.evaluate(()=>[...document.querySelectorAll('#musicMixer .ms-ch')].filter(e=>!e.hidden).map(e=>e.dataset.group));note('mixerGroups',avail);
    check('the mixer shows the groups Ambient can sound (no percussion at this rhythm)',avail.includes('pad')&&avail.includes('melody')&&!avail.includes('perc'),avail.join(','));
    await p.fill('#musicMix-pad','60');await p.fill('#musicMix-melody','130');
    const sounding=await poll(()=>p.evaluate(g=>{const l=window.ResonancePlayer.state.sound.layers||[];return g.find(x=>l.includes(x))||null;},['arp','counter','atmos','bass'].filter(g=>avail.includes(g))),20000);
    const muteGroup=sounding||'arp';
    const layers0=await p.evaluate(()=>window.ResonancePlayer.state.sound.layers);
    await p.click(`#musicMixer .ms-ch[data-group="${muteGroup}"] [data-act="mute"]`);
    o=await opts(p);
    check('the balance reaches the engine (pad 0.6, melody 1.3, one group muted)',o.profile.mix.pad===.6&&o.profile.mix.melody===1.3&&o.profile.mix[muteGroup]===0,JSON.stringify(o.profile.mix));
    const bars=[];{let last=null;const t0=Date.now();while(bars.length<4&&Date.now()-t0<25000){const b=await p.evaluate(()=>({bar:window.ResonancePlayer.state.bar,layers:window.ResonancePlayer.state.sound.layers}));
      if(b.bar!==last){last=b.bar;bars.push(b);}await sleep(150);}}
    const after=bars.slice(1);note('barLayers',{muted:muteGroup,before:layers0,after:after.map(b=>`${b.bar}: ${b.layers?.join(',')}`)});
    check(`the muted ${muteGroup}, sounding before, is out of the next bars' arrangement`,!!sounding&&layers0?.includes(muteGroup)&&after.length===3&&after.every(b=>b.layers?.length&&!b.layers.includes(muteGroup)),
      `before ${JSON.stringify(layers0)} · then ${after.map(b=>`bar ${b.bar} [${b.layers?.join(',')}]`).join(' ')}`);
    const heard=await level(p);note('levelPreview',heard);
    check('the changed performance is audible',heard.rms>0,JSON.stringify(heard));
    // Cancel: the saved performance comes back, nothing was saved.
    await p.click('#musicCancel');
    o=await opts(p);const prefs0=(await env.get(`/api/preferences?id=${env.project}`)).music;
    check('Cancel restores the saved performance in the engine',o.profile.evolution===.5&&o.profile.atmosphere===.5&&o.profile.mix.pad===1&&!(await p.isVisible('#musicPreviewBar')),JSON.stringify(o.profile));
    check('Cancel saved nothing',prefs0.evolution==null&&prefs0.atmosphere==null&&prefs0.mix==null,JSON.stringify({evolution:prefs0.evolution,atmosphere:prefs0.atmosphere,mix:prefs0.mix}));
    // Again, then Apply to this project.
    await p.click('.ms-style[data-style="ambient"]');
    if((await opts(p)).style!=='ambient'){await p.click('.ms-style[data-style="ambient"]');}
    await p.fill('#musicProfile-evolution','85');await p.fill('#musicProfile-atmosphere','80');
    await p.fill('#musicMix-pad','60');await p.fill('#musicMix-melody','130');
    await p.click(`#musicMixer .ms-ch[data-group="${muteGroup}"] [data-act="mute"]`);
    await p.click('#musicApply');
    await until(p,()=>!document.getElementById('musicPreviewBar').checkVisibility());
    const prefs1=(await env.get(`/api/preferences?id=${env.project}`)).music;note('savedPreferences',prefs1);
    // Ambient is also the global default here: the project then inherits it (style null), as the studio says.
    const style1=prefs1.style??(await env.get('/api/settings')).music.style;
    check('Apply saves Ambient, evolution, atmosphere and balance to the project',style1==='ambient'&&prefs1.evolution===.85&&prefs1.atmosphere===.8&&prefs1.mix?.pad===.6&&prefs1.mix?.melody===1.3&&prefs1.mix?.[muteGroup]===0,JSON.stringify(prefs1));
    // A reusable preset, named in the interface.
    await p.fill('#musicPresetName','Lumen night drift');await p.click('#musicPresetSave');
    const preset=await until(p,()=>[...document.querySelectorAll('#musicPresets .ms-preset strong')].some(s=>s.textContent==='Lumen night drift'),null,10000);
    const presets=(await env.get('/api/presets')).presets.filter(x=>x.kind==='music');const mine=presets.find(x=>x.name==='Lumen night drift');note('preset',mine?.payload);
    check('the music preset is saved with its profile and balance',preset&&mine&&mine.payload.style==='ambient'&&mine.payload.profile?.evolution===.85&&mine.payload.mix?.pad===.6,JSON.stringify(mine?.payload));
    // Reload: the saved result is what plays.
    await p.reload();await p.waitForFunction(()=>!!window.ResonancePlayer?.state.recipe,null,{timeout:45000});
    await p.waitForSelector('.ws-music .ms-style[aria-checked="true"]',{timeout:20000});
    await until(p,()=>/Composed/.test(document.querySelector('#musicScore .ms-score-title')?.textContent||''),null,20000);
    o=await opts(p);
    const ui=await p.evaluate(()=>({ambient:document.querySelector('.ms-style[data-style="ambient"]').getAttribute('aria-checked'),evolution:document.getElementById('musicProfile-evolution').value,
      atmosphere:document.getElementById('musicProfile-atmosphere').value,pad:document.getElementById('musicMix-pad').value,preset:[...document.querySelectorAll('#musicPresets .ms-preset strong')].map(s=>s.textContent)}));
    note('afterReload',{engine:o,ui});
    check('after reload: the engine plays the saved profile and balance on score v3',o.style==='ambient'&&o.scoreVersion===3&&o.profile.evolution===.85&&o.profile.atmosphere===.8&&o.profile.mix.pad===.6&&o.profile.mix[muteGroup]===0,JSON.stringify(o));
    check('after reload: the controls show them and the preset is listed',ui.ambient==='true'&&ui.evolution==='85'&&ui.atmosphere==='80'&&ui.pad==='60'&&ui.preset.includes('Lumen night drift'),JSON.stringify(ui));
    await p.click('#musicEnableSound');await until(p,()=>window.ResonancePlayer.state.sound.enabled);
    check('after reload: the saved result is heard (score v3, the muted group stays out)',await until(p,g=>{const s=window.ResonancePlayer.state.sound;return s.score===3&&Array.isArray(s.layers)&&s.layers.length>0&&!s.layers.includes(g);},muteGroup,20000));
    const heardAgain=await level(p);note('levelAfterReload',heardAgain);check('after reload: audible',heardAgain.rms>0,JSON.stringify(heardAgain));
    await until(p,()=>!!document.querySelector('#musicForm:not([hidden])'),null,8000);
    // The evidence: the composed score, its style cards, the character and the balance in one view (scrolled as a
    // person would, the wheel over the desk).
    // The whole balance in view, and as much above it as fits (the style cards with the composed score's words).
    const by=await p.evaluate(()=>Math.round(document.getElementById('musicMixer').getBoundingClientRect().bottom-innerHeight+14));
    await p.mouse.move(700,640);await p.mouse.wheel(0,by);await sleep(800);
    const inView=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect();return {score:r('musicScore').top,character:r('musicCharacter').bottom,mixer:r('musicMixer').bottom,height:innerHeight};});note('screenshotLayout',inView);
    await shot(p,'music-studio');
  }finally{await ctx.close();}
}
// ======================================================================================================================
// B — Make the ecosystem more musical
// The climate the inhabitants live in (sim.js cond), sampled from the running world: its mean, its spread over a few
// seconds, and its departure from the neutral conditions (sim.js COND1 and COND2), which influence 0 must settle on.
const NEUTRAL={current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0,gather:1,explore:1,persist:1,glow:1,pulse:0,shiftX:0,shiftZ:0};
const offNeutral=c=>Math.max(...Object.keys(NEUTRAL).map(k=>Math.abs((c?.[k]??NEUTRAL[k])-NEUTRAL[k])));
const condOf=p=>p.evaluate(()=>window.__worldStats?.()?.life?.ecosystem?.cond||null);
async function climate(p,ms=6000){
  const xs=[];for(let t=0;t<ms;t+=400){const c=await condOf(p);if(c)xs.push(c);await sleep(400);}
  if(!xs.length)return null;const keys=Object.keys(NEUTRAL);
  const mean=Object.fromEntries(keys.map(k=>[k,+(xs.reduce((a,x)=>a+x[k],0)/xs.length).toFixed(4)])),span=Object.fromEntries(keys.map(k=>[k,+(Math.max(...xs.map(x=>x[k]))-Math.min(...xs.map(x=>x[k]))).toFixed(4)]));
  // How far the music moves the conditions: the mean distance from neutral plus how much they move meanwhile.
  return {samples:xs.length,mean,span,departure:+keys.reduce((a,k)=>a+Math.abs(mean[k]-NEUTRAL[k])+span[k],0).toFixed(4),maxOffNeutral:+Math.max(...xs.map(offNeutral)).toFixed(5)};
}
async function setVsParam(p,path,value){
  const f=p.locator(`.ws-visual .field[data-path="${path}"]`);
  await f.evaluate(el=>{const d=el.closest('details');if(d&&!d.open)d.querySelector('summary').click();});
  const num=f.locator('input.num').first();await num.fill(String(value));await num.press('Tab');
}
async function scenarioB(browser,env){
  const ctx=await context(browser,env);const p=await page(ctx,env,'visual','B');
  const prev=()=>p.evaluate(()=>window.ResonancePlayer.state.preview?.recipe||null);
  const worldIs=(family,music)=>until(p,([f,m])=>{const s=window.__worldStats?.(),r=window.ResonancePlayer.state.preview?.recipe;return s?.family===f&&r?.genome?.life?.music===m&&!!s.life&&s.life.restoring===false&&s.life.tick>0;},[family,music],60000);
  try{
    await p.waitForSelector('.vs-card[data-card="fractal-biosphere"] .vs-card-main',{timeout:30000});
    await p.waitForFunction(()=>window.__worldStats?.()?.family,null,{timeout:60000});
    const r0=await env.recipe();note('savedBefore',{family:r0.family,recipeVersion:r0.recipeVersion,revision:r0.revision});
    await p.click('.vs-card[data-card="fractal-biosphere"] .vs-card-main');
    const fam=await until(p,()=>window.ResonancePlayer.state.preview?.recipe?.family==='fractal-biosphere',null,30000);
    check('choosing Fractal Biosphere previews it (nothing saved)',fam&&(await env.recipe()).revision===r0.revision&&(await p.textContent('#vsBadge'))==='Preview · not saved');
    let c=await prev();note('previewIdentity',{recipeVersion:c.recipeVersion,finish:c.genome?.technique?.finish??null,ecology:c.genome?.life?.ecology??null,life:c.genome?.life?{enabled:c.genome.life.enabled,music:c.genome.life.music}:null});
    // The Phase 11 ecology: the upgrade the interface offers to an identity made before it, when this one lacks it.
    if(await p.isVisible('#vsUpgrade')){note('upgradeOffered',await p.textContent('.vs-upgrade'));await p.click('#vsUpgrade');
      check('"Use the Phase 11 finish and ecology" previews ecology 2',await until(p,()=>window.ResonancePlayer.state.preview?.recipe?.genome?.life?.ecology===2,null,20000));}
    c=await prev();
    check('the previewed identity runs the Phase 11 ecology (life.ecology 2)',c.genome?.life?.ecology===2,JSON.stringify(c.genome?.life));
    if(!c.genome?.life?.enabled){await p.locator('.ws-visual .field[data-path="life.enabled"] input[type=checkbox]').evaluate(el=>{const d=el.closest('details');if(d&&!d.open)d.querySelector('summary').click();});
      await p.click('.ws-visual .field[data-path="life.enabled"] .switch');await until(p,()=>window.ResonancePlayer.state.preview?.recipe?.genome?.life?.enabled===true,null,20000);}
    // Each influence is heard on the running population: a live session keeps it through the change, and the conditions
    // move to the new climate with their time constants (sim.js TAU2: 1.5–10 s), never in a jump.
    const runs={};
    for(const v of [0,1,2]){
      await setVsParam(p,'life.music',v);
      const ok=await until(p,m=>window.ResonancePlayer.state.preview?.recipe?.genome?.life?.music===m,v,20000);
      const lit=await p.evaluate(()=>[...document.querySelectorAll('.ws-visual .field[data-path="life.music"] .vs-scale-stop.on')].map(e=>e.textContent));
      check(`Music influence ${v}: the preview recipe holds life.music ${v} and the scale names it`,ok&&lit.length===1&&lit[0].startsWith(`${v} ·`),lit.join(' | '));
      check(`Music influence ${v}: the biosphere's digital life runs`,await worldIs('fractal-biosphere',v));
      if(v===0){
        // Independent: the conditions settle on exactly the neutral ones (from wherever the previous climate left them).
        const t0=Date.now();let off=1;while(Date.now()-t0<70000){off=offNeutral(await condOf(p));if(off<.002)break;await sleep(1000);}
        note('settledOnNeutralSeconds',Math.round((Date.now()-t0)/1000));
        check('influence 0: the conditions settle on the neutral climate',off<.002,`largest offset ${off.toFixed(5)}`);
      }else await sleep(10000);
      runs[v]=await climate(p);
    }
    note('climate',runs);
    check('influence 0: the music moves nothing (still, neutral)',runs[0]&&runs[0].maxOffNeutral<.002&&Object.values(runs[0].span).every(x=>x<.002),JSON.stringify({maxOffNeutral:runs[0]?.maxOffNeutral,span:runs[0]?.span}));
    const d1=runs[1]?.departure,d2=runs[2]?.departure;note('departureFromNeutral',{0:runs[0]?.departure,1:d1,2:d2});
    check('influence 1: the music shapes the conditions (gathering, roaming, light, currents)',d1>.1&&['gather','explore','glow','current'].some(k=>Math.abs(runs[1].mean[k]-NEUTRAL[k])>.02||runs[1].span[k]>.02),`departure ${d1}`);
    check('influence 2: clearly stronger, still bounded',d2>d1*1.3&&Object.values(runs[2].mean).every(x=>Number.isFinite(x)&&Math.abs(x)<4),`departure ${d2} vs ${d1}`);
    // Apply: the influence and the ecology become the project's identity.
    await p.click('#vsApply');
    const choice=await p.waitForSelector('.modal .btn.primary',{timeout:4000}).catch(()=>null);
    if(choice){note('applyDialog',await p.textContent('.modal'));await choice.click();}
    await until(p,()=>!window.ResonancePlayer.state.preview,null,20000);
    const r1=await env.recipe();note('savedAfter',{family:r1.family,revision:r1.revision,life:r1.genome?.life,finish:r1.genome?.technique?.finish,tuning:r1.tuning?.values});
    check('Apply saves Fractal Biosphere with life.music 2 and ecology 2',r1.family==='fractal-biosphere'&&r1.genome?.life?.music===2&&r1.genome?.life?.ecology===2,JSON.stringify({family:r1.family,life:r1.genome?.life}));
    // Recording and replay read the saved identity: a fresh window's Stage, replaying the recorded performance, runs it.
    const s=await page(ctx,env,'stage','B stage');
    await s.click('#replayBtn');await s.waitForFunction(()=>!document.getElementById('playBtn').disabled,null,{timeout:30000});
    await s.click('#playBtn');
    const staged=await until(s,()=>{const w=window.__worldStats?.();return w?.family==='fractal-biosphere'&&w.life?.ecology===2&&window.ResonancePlayer.state.mode==='replay'&&window.ResonancePlayer.state.recipe?.genome?.life?.music===2;},null,60000);
    check('a fresh Stage in replay runs the saved Fractal Biosphere, ecology 2, influence 2',staged,JSON.stringify(await s.evaluate(()=>({family:window.__worldStats?.()?.family,ecology:window.__worldStats?.()?.life?.ecology,mode:window.ResonancePlayer.state.mode}))));
    await s.close();
  }finally{await ctx.close();}
}
// ======================================================================================================================
// The Artist Studio, as a person works it: the library, the Add layer menu, the inspector's controls (found by the
// names they announce), the mapping rows and the composition strip. The working copy is read back from what the stage
// previews (the preview recipe's composition), never from the studio's internals.
const INSP='.ws-artist .ar-insp',COMP='.ws-artist .ar-comp',MAPS='.ws-artist .ar-maps';
async function poll(fn,timeout=20000){const end=Date.now()+timeout;let v;for(;;){try{v=await fn();}catch{v=null;}if(v||Date.now()>end)return v;await sleep(200);}}
const previewComp=p=>p.evaluate(()=>window.ResonancePlayer.state.preview?.recipe?.composition||null);
const previewed=(p,test,timeout=20000)=>poll(async()=>{const c=await previewComp(p);return c&&test(c)?c:null;},timeout);
const layerOf=(c,type,i=0)=>c?.layers.filter(l=>l.type===type)[i]||null;
async function arLibrary(p,tab,key){
  await p.click(`.ws-artist .ar-lib [role=radiogroup] button[data-value="${tab}"]`);
  await p.click(`.ws-artist .ar-lib-item[data-key="${key}"]`);
  // Over unsaved changes the studio asks first.
  const ask=await p.waitForSelector('.modal .modal-foot button:has-text("Discard")',{timeout:800}).catch(()=>null);if(ask)await ask.click();
}
async function arAdd(p,type){
  await p.click('#arAddLayer');await p.click(`.menu .ar-add-item[data-type="${type}"]`);
  await p.waitForFunction(t=>document.querySelector('.ws-artist .ar-stack-list .ar-layer.selected')?.dataset.id?.startsWith(`${t}-`),type,{timeout:8000});
  return p.evaluate(()=>document.querySelector('.ws-artist .ar-stack-list .ar-layer.selected').dataset.id);
}
const arSelect=(p,id)=>p.click(`.ws-artist .ar-stack-list .ar-layer[data-id="${id}"] .ar-layer-main`);
// A control by the name it announces: a colour (its hex entry), a number (its exact entry), a row of choices, a
// list or a switch. One inside a closed "More …" disclosure is opened first, as a person would.
async function arSet(p,label,value,scope=INSP){
  const root=p.locator(scope);
  const kind=await root.evaluate((el,l)=>{const q=s=>el.querySelector(s);const x=q(`input[aria-label="${l} (hex)"]`)?['color',`input[aria-label="${l} (hex)"]`]:q(`input[aria-label="${l} (exact value)"]`)?['number',`input[aria-label="${l} (exact value)"]`]:
    q(`[role=radiogroup][aria-label="${l}"]`)?['seg',`[role=radiogroup][aria-label="${l}"]`]:q(`select[aria-label="${l}"]`)?['select',`select[aria-label="${l}"]`]:q(`input[type=checkbox][aria-label="${l}"]`)?['bool',`input[type=checkbox][aria-label="${l}"]`]:null;
    if(!x)return null;const d=q(x[1]).closest('details');if(d&&!d.open)d.querySelector('summary').dataset.qualOpen='1';return x;},label);
  if(!kind)throw new Error(`no control named "${label}" in ${scope}`);
  const more=root.locator('summary[data-qual-open="1"]');if(await more.count()){await more.first().click();await more.first().evaluate(s=>delete s.dataset.qualOpen);}
  const el=root.locator(kind[1]).first();
  if(kind[0]==='color'||kind[0]==='number'){await el.fill(String(value));await el.press('Enter');}
  else if(kind[0]==='seg')await el.locator(`button[data-value="${value}"]`).click();
  else if(kind[0]==='select')await el.selectOption(String(value));
  else if(await el.isChecked()!==!!value)await el.click({force:true});
}
// A mapping row's response settings (curve, smoothing, range), opened unless they already are.
async function openResponse(row){const b=row.locator('button[aria-label="Response settings"]');if(await b.getAttribute('aria-expanded')!=='true')await b.click();}
// The selected layer's mapping row i (a new one through "Add mapping" when i is past the last).
async function arMap(p,i,{signal,target,amount,curve,smoothing}){
  const rows=p.locator(`${MAPS} .ar-map`);
  if(await rows.count()<=i)await p.click('#arAddMapping');
  const row=()=>p.locator(`${MAPS} .ar-map`).nth(i);
  if(signal)await row().locator('select.ar-signal').selectOption(signal);
  if(target)await row().locator('select[aria-label="Changes"]').selectOption(target);
  if(amount!==undefined){const a=row().locator('input[aria-label="Strength (negative: the other way) (exact value)"]');await a.fill(String(amount));await a.press('Enter');}
  if(curve||smoothing!==undefined){await openResponse(row());
    if(curve)await row().locator(`[role=radiogroup][aria-label="Response curve"] button[data-value="${curve}"]`).click();
    if(smoothing!==undefined){const s=row().locator('input[aria-label="Smoothing (seconds) (exact value)"]');await s.fill(String(smoothing));await s.press('Enter');}}
  return (await row().locator('.ar-map-say').textContent()).trim();
}
async function arSaveAs(p,name,description=''){
  await p.click('#arSaveAs');await p.fill('.modal input[aria-label="Name"]',name);
  if(description)await p.fill('.modal textarea[aria-label="Description"]',description);
  await p.click('.modal .modal-foot button:has-text("Save")');
  return until(p,()=>/Saved · version/.test(document.querySelector('.ws-artist .ar-head-pills')?.textContent||''),null,10000);
}
async function arApply(p){
  await p.click('#arApply');
  const ask=await p.waitForSelector('.modal .modal-foot button:has-text("Apply and show the living world")',{timeout:1500}).catch(()=>null);if(ask)await ask.click();
  return until(p,()=>!window.ResonancePlayer.state.preview&&/On this project/.test(document.querySelector('.ws-artist .ar-head-pills')?.textContent||''),null,20000);
}
// What the stage draws: the living world's family and the composition's layer runtime (layers.js stats).
const stageLayers=p=>p.evaluate(()=>{const s=window.__worldStats?.();return s?{family:s.family,layers:s.layers}:null;});
// ======================================================================================================================
// C — Create an original look from a world
async function scenarioC(browser,env){
  const ctx=await context(browser,env);const p=await page(ctx,env,'artist','C');
  try{
    await p.waitForSelector('#arAddLayer',{timeout:30000});
    await arLibrary(p,'worlds','world:fractal-biosphere');
    let c=await previewed(p,c=>c.base==='fractal-biosphere');
    check('Artist Studio starts from Fractal Biosphere (previewed on this window\'s stage)',!!c&&await until(p,()=>window.__worldStats?.()?.family==='fractal-biosphere',null,60000),c?.name);
    const fid=await arAdd(p,'fractal');
    await arSet(p,'Colour','#ffb347');await arSet(p,'Tip colour','#ff4fd8');await arSet(p,'Material','crystal');
    c=await previewed(p,c=>{const l=layerOf(c,'fractal');return l&&l.params.color==='#ffb347'&&l.params.tip==='#ff4fd8'&&l.params.material==='crystal';});
    check('a fractal layer with a new palette and the crystal material',!!c,JSON.stringify(layerOf(c,'fractal')?.params));
    const rid=await arAdd(p,'ribbons');
    const say=await arMap(p,0,{signal:'music.rhythm',target:'speed',amount:.6,curve:'smooth'});note('ribbonMapping',say);
    c=await previewed(p,c=>{const m=layerOf(c,'ribbons')?.mappings[0];return m&&m.signal==='music.rhythm'&&m.target==='speed'&&m.amount===.6;});
    check('the ribbons\' motion is mapped to the music (rhythm → speed)',!!c,say);
    await p.click(`${COMP} [role=radiogroup][aria-label="Finish"] button[data-value="dreamlike"]`);
    await p.click(`${COMP} [role=radiogroup][aria-label="Finish"] button[data-value="cinematic"]`);
    c=await previewed(p,c=>c.finish==='cinematic');
    check('the Cinematic finish is chosen',!!c&&await p.getAttribute(`${COMP} [role=radiogroup][aria-label="Finish"] button[data-value="cinematic"]`,'aria-checked')==='true');
    const drawn=await poll(async()=>{const s=await stageLayers(p);return s?.layers?.layers===2&&s.layers.points>0&&!s.layers.failed.length?s:null;},30000);
    note('stage',drawn);
    check('the preview draws both layers on the stage, none failed',!!drawn,JSON.stringify(drawn?.layers));
    check('the preview blocks recording (a draft)',await p.evaluate(()=>!!window.ResonancePlayer.state.preview)&&/Preview/.test(await p.textContent('#arBadge')));
    check('Save as names the composition',await arSaveAs(p,'Biosphere Lanterns','Crystal fractals and rhythmic ribbons grown into the biosphere.'));
    const lib=await env.get('/api/compositions');const saved=lib.compositions.find(e=>e.composition.name==='Biosphere Lanterns');note('saved',{id:saved?.id,version:saved?.version});
    check('it is in My creations (receiver)',!!saved&&saved.composition.layers.length===2,saved?.id);
    check('Apply to project',await arApply(p));
    const r=await env.recipe();note('recipe',{revision:r.revision,family:r.family,finish:r.genome?.technique?.finish,composition:{id:r.composition?.id,name:r.composition?.name,layers:r.composition?.layers.map(l=>l.type)}});
    const rl=r.composition?.layers||[];
    check('the project\'s recipe holds the composition',r.composition?.id===saved?.id&&r.composition.name==='Biosphere Lanterns'&&rl.map(l=>l.type).join()==='fractal,ribbons'&&r.composition.finish==='cinematic',JSON.stringify({id:r.composition?.id,layers:rl.map(l=>l.type)}));
    check('…with the recoloured crystal fractal and the rhythm-driven ribbons',rl[0]?.params.material==='crystal'&&rl[0]?.params.color==='#ffb347'&&rl[1]?.mappings[0]?.signal==='music.rhythm',JSON.stringify(rl.map(l=>({p:l.params.color,m:l.mappings.map(m=>`${m.signal}>${m.target}`)}))));
    check('…on Fractal Biosphere with the Cinematic finish',r.family==='fractal-biosphere'&&r.genome?.technique?.finish==='cinematic',`${r.family}, ${r.genome?.technique?.finish}`);
    note("ids",{fractal:fid,ribbons:rid,composition:saved?.id});
  }finally{await ctx.close();}
}
// ======================================================================================================================
// D — Create from a blank canvas
async function scenarioD(browser,env){
  const ctx=await context(browser,env);const p=await page(ctx,env,'artist','D');
  try{
    await p.waitForSelector('#arAddLayer',{timeout:30000});
    await arLibrary(p,'starters','starter-blank');
    let c=await previewed(p,c=>c.base==='canvas'&&c.layers.length===0);
    check('the Blank composition opens on the artist canvas',!!c&&await until(p,()=>!!window.__worldStats?.()?.layers,null,60000),c?.name);
    await p.fill('#arName','Lattice Choir');await p.press('#arName','Enter');
    const sid=await arAdd(p,'structure');
    await arSet(p,'Shape','lattice');await arSet(p,'Colour','#d8e6ff');await arSet(p,'Glow','1.2');
    const say1=await arMap(p,0,{signal:'eng.milestone',target:'glow',amount:.8,curve:'smooth',smoothing:1});
    const pid=await arAdd(p,'particles');
    await arSet(p,'Behaviour','orbit');await arSet(p,'Colour','#ffcf6b');await arSet(p,'Second colour','#ff6b9d');
    const say2=await arMap(p,0,{signal:'music.energy',target:'speed',amount:.7});
    await arSet(p,'Background','#060a14',COMP);await arSet(p,'Horizon','#1b2a44',COMP);
    note('mappings',[say1,say2]);
    c=await previewed(p,c=>{const s=layerOf(c,'structure'),q=layerOf(c,'particles');return s&&q&&s.params.shape==='lattice'&&q.params.behavior==='orbit'&&q.params.colorB==='#ff6b9d'&&c.canvas.background==='#060a14'&&c.canvas.horizon==='#1b2a44'
      &&s.mappings[0]?.signal==='eng.milestone'&&q.mappings[0]?.signal==='music.energy'&&q.mappings[0]?.target==='speed';});
    check('structure (lattice) and particles (orbit) with a palette and canvas colours',!!c,JSON.stringify(c?{canvas:c.canvas,layers:c.layers.map(l=>[l.type,l.params.shape||l.params.behavior,l.params.color,l.params.colorB||''])}:null));
    check('one property follows the music, another a canonical engineering signal',!!c,`${say1} · ${say2}`);
    await p.click('#arSave');
    check('Save keeps it in My creations',await until(p,()=>/Saved · version 1/.test(document.querySelector('.ws-artist .ar-head-pills')?.textContent||''),null,10000));
    const lib=await env.get('/api/compositions');const saved=lib.compositions.find(e=>e.composition.name==='Lattice Choir');
    check('the receiver holds it, normalised',!!saved&&saved.composition.base==='canvas'&&saved.composition.layers.length===2,saved?.id);
    const drawn=await poll(async()=>{const s=await stageLayers(p);return s?.layers?.layers===2&&s.layers.points>0&&s.layers.drawCalls>0&&!s.layers.failed.length?s:null;},30000);
    note('stage',drawn);
    check('previewed on the recorded project: the stage draws both layers, none failed',!!drawn,JSON.stringify(drawn));
    const model=await p.evaluate(()=>window.__qual.structure());note('projectStructure',model);
    check('…anchored on the project\'s real structure',model?.nodes>0,JSON.stringify(model));
    // The preview is left as it was saved: Cancel returns the stage to the project's look.
    await p.click('#arCancel');await until(p,()=>!window.ResonancePlayer.state.preview,null,10000);
  }finally{await ctx.close();}
}
// ======================================================================================================================
// E — Share a custom creation
function unzip(buf){
  const out={};let i=0;const z=require('node:zlib');
  while(i+30<=buf.length&&buf.readUInt32LE(i)===0x04034b50){
    const method=buf.readUInt16LE(i+8),size=buf.readUInt32LE(i+18),nl=buf.readUInt16LE(i+26),xl=buf.readUInt16LE(i+28),name=buf.slice(i+30,i+30+nl).toString('utf8'),at=i+30+nl+xl,data=buf.slice(at,at+size);
    out[name]=method===8?z.inflateRawSync(data):data;i=at+size;}
  return out;
}
async function scenarioE(browser,env,second){
  const ctx=await context(browser,env);const p=await page(ctx,env,'artist','E');
  let ctx2=null;
  try{
    await p.waitForSelector('#arAddLayer',{timeout:30000});
    const lib=await env.get('/api/compositions'),entry=lib.compositions.find(e=>e.composition.name==='Biosphere Lanterns');
    if(!entry)throw new Error('the composition of scenario C is not saved');
    await arLibrary(p,'mine',entry.id);
    check('a saved composition opens from My creations',!!await previewed(p,c=>c.id===entry.id));
    await p.click('#arExport');
    await p.fill('.modal input[aria-label="Author"]','Phase 11 QA');
    await until(p,()=>/creator\./.test(document.querySelector('.modal .ar-export-summary')?.textContent||''),null,10000);
    const summary=await p.textContent('.modal .ar-export-summary');note('exportSummary',summary);
    // Inspect contents (the modal shows exactly what the .zip holds), then download it.
    await p.click('.modal .modal-foot button:has-text("Inspect contents")');
    const inspected=await p.waitForSelector('.modal .ar-inspect-pre',{timeout:5000}).then(e=>e.textContent());
    check('Inspect contents shows pack.json',/"declarative"/.test(inspected)&&/"composition"/.test(inspected));
    await p.locator('.modal').last().locator('.modal-foot button:has-text("Close")').click();
    const [dl]=await Promise.all([p.waitForEvent('download',{timeout:15000}),p.click('#arExportZip')]);
    const zipPath=path.join(OUT,dl.suggestedFilename());await dl.saveAs(zipPath);note('zip',{file:zipPath,bytes:fs.statSync(zipPath).size});
    const files=unzip(fs.readFileSync(zipPath)),names=Object.keys(files);note('zipEntries',names);
    const packJson=names.find(n=>/(^|\/)pack\.json$/.test(n)),manifest=packJson?JSON.parse(files[packJson].toString('utf8')):null;
    check('the downloaded .zip holds pack.json and README.md',!!manifest&&names.some(n=>/README\.md$/.test(n)),names.join(', '));
    check('pack.json: a declarative creator pack carrying the composition',manifest?.kind==='declarative'&&/^creator\./.test(manifest.id)&&manifest.declarative?.composition?.layers?.length===2&&manifest.author?.name==='Phase 11 QA',JSON.stringify({id:manifest?.id,kind:manifest?.kind,sdk:manifest?.sdk,base:manifest?.declarative?.base}));
    const all=names.map(n=>files[n].toString('utf8')).join('\n'),r=await env.recipe();
    const leaks=[[env.project,'project id'],[env.dir,'data directory'],[String(r.projectSeed),'project seed'],[os.homedir(),'home directory'],['/tmp/','temporary path'],['lumen','project name'],['"projectId"','projectId key'],['"recipe','recipe key']]
      .filter(([s])=>s&&all.includes(s)).map(([,w])=>w);
    const hex64=all.match(/[0-9a-f]{64}/g)||[];
    check('no project id, path, seed or recipe identity in the export',!leaks.length&&!hex64.length,leaks.concat(hex64.map(x=>`hex ${x.slice(0,8)}…`)).join(', ')||'clean');
    note('packJson',manifest);
    await p.locator('.modal .modal-foot button:has-text("Close")').first().click().catch(()=>{});
    // ---- A second, isolated installation on another recorded project ------------------------------------------------
    ctx2=await context(browser,second);const q=await page(ctx2,second,'packs','E second');
    await q.click('#pkImportBtn');
    const [chooser]=await Promise.all([q.waitForEvent('filechooser'),q.click('#pkChooseZip')]);
    await chooser.setFiles(zipPath);
    await q.waitForSelector('#pkReport',{timeout:20000});
    const report=await q.textContent('#pkReport');note('importReport',report.slice(0,400));
    check('Visual Packs reads the pack before installing (no errors)',!(await q.$('#pkReportErrors'))&&await q.isEnabled('#pkInstallBtn'));
    await q.click('#pkInstallBtn');await q.waitForSelector('#pkInstalled',{timeout:20000});
    check('installed as data (nothing to approve)',/is installed/.test(await q.textContent('#pkInstalled'))&&/no code/.test(await q.textContent('#pkInstalled')));
    await q.click('#pkInstalledUse');
    await q.click('.modal .modal-foot button:has-text("Use it")');
    const r2=await poll(async()=>{const x=await second.recipe();return x.composition?.name==='Biosphere Lanterns'?x:null;},20000);
    const C=require(path.join(REPO,'public/composition.js'));
    const same=r2&&JSON.stringify(C.normalize({...r2.composition,id:null}).layers)===JSON.stringify(C.normalize({...manifest.declarative.composition,id:null}).layers);
    note('secondProject',{project:second.project.slice(0,12),family:r2?.family,revision:r2?.revision,layers:r2?.composition?.layers.map(l=>l.type)});
    check('"Use" applies the imported creation to the other project (identical layers)',!!same,`${r2?.family} · ${r2?.composition?.layers.map(l=>l.type).join(',')}`);
    // An editable copy in My creations (Open in Artist Studio), then the Visual Packs page with both.
    await q.click('#pkOpenArtist');await q.waitForFunction(()=>location.hash.startsWith('#/artist'),null,{timeout:10000});
    await q.waitForSelector('#arAddLayer',{timeout:20000});await sleep(1500);
    await q.click('nav.rail a[data-ws="packs"]');
    await q.waitForSelector('#pkMine .pk-mine-row',{timeout:15000});
    await q.click('#pkList .pk-row').catch(()=>{});await sleep(1000);
    check('Visual Packs lists the copy under My creations and the import under Imported creations',await q.locator('#pkMine .pk-mine-row').count()>=1&&/Imported creations/.test(await q.textContent('.ws-packs')));
    await shot(q,'visual-packs');
    // The two stages: the same look, each on its own project's structure.
    const stage=async(pg,env_,name)=>{await pg.goto(`${env_.url}/?project=${env_.project}&qual=1#/stage`);
      const ok=await poll(async()=>{const s=await stageLayers(pg);return s?.family==='fractal-biosphere'&&s.layers?.layers===2&&!s.layers.failed.length&&s.layers.points>0?s:null;},60000);
      await sleep(4000);await shot(pg,name);return ok;};
    const s1=await stage(p,env,'stage-e-lumen'),s2=await stage(q,second,'stage-e-second');
    const st=[await p.evaluate(()=>window.__qual.structure()),await q.evaluate(()=>window.__qual.structure())];note('stages',{lumen:{...s1,structure:st[0]},second:{...s2,structure:st[1]}});
    check('both stages draw the creation (2 layers, none failed)',!!s1&&!!s2);
    check('…on different project structures',st[0]&&st[1]&&JSON.stringify(st[0])!==JSON.stringify(st[1]),JSON.stringify(st));
  }finally{await ctx.close();if(ctx2)await ctx2.close();}
}
// ======================================================================================================================
// F — Record the result
function probe(file){
  // A browser's recorder writes no duration in the container: the decoded length (the last progress time) is the duration.
  const r=cp.spawnSync(FFMPEG,['-hide_banner','-i',file,'-af','volumedetect','-f','null','-'],{encoding:'utf8'}),t=r.stderr,input=t.split(/Output #0/)[0];
  const times=[...t.matchAll(/time=(\d+):(\d+):([\d.]+)/g)],last=times.at(-1),dur=/Duration: (\d+):(\d+):([\d.]+)/.exec(input)||last;
  const streams=[...input.matchAll(/Stream #\d+:\d+[^:]*: (Video|Audio): ([^\n]+)/g)].map(m=>({type:m[1],desc:m[2].trim()}));
  const mean=/mean_volume: (-?[\d.]+) dB/.exec(t),max=/max_volume: (-?[\d.]+) dB/.exec(t);
  // A frame from the middle: is the picture really there (not black)?
  const at=dur?Math.max(0,(+dur[1]*3600+ +dur[2]*60+ +dur[3])/2):2;
  const f=cp.spawnSync(FFMPEG,['-hide_banner','-loglevel','error','-ss',String(at),'-i',file,'-frames:v','1','-vf','scale=96:54','-f','rawvideo','-pix_fmt','gray','-'],{maxBuffer:1<<20});
  const px=f.stdout&&f.stdout.length?[...f.stdout]:[],lum=px.length?px.reduce((a,v)=>a+v,0)/px.length:null,sd=px.length?Math.sqrt(px.reduce((a,v)=>a+(v-lum)**2,0)/px.length):null;
  return {duration:dur?(+dur[1]*3600+ +dur[2]*60+ +dur[3]):null,streams,meanVolume:mean?+mean[1]:null,maxVolume:max?+max[1]:null,midFrame:{luma:lum&&+lum.toFixed(1),contrast:sd&&+sd.toFixed(1)}};
}
async function scenarioF(browser,env){
  const ctx=await context(browser,env);const p=await page(ctx,env,'stage','F');
  try{
    const r=await env.recipe(),prefs=(await env.get(`/api/preferences?id=${env.project}`)).music;
    note('applied',{composition:r.composition?.name,family:r.family,finish:r.genome?.technique?.finish,score:r.genome?.music?.score,music:{style:prefs.style,evolution:prefs.evolution,atmosphere:prefs.atmosphere,mix:prefs.mix}});
    check('the project carries the custom composition and the composed score',!!r.composition&&r.genome?.music?.score===3,`${r.composition?.name} · score ${r.genome?.music?.score}`);
    await p.click('#replayBtn');await p.waitForFunction(()=>!document.getElementById('playBtn').disabled,null,{timeout:30000});
    await p.selectOption('#speedSelect','4');await p.click('#playBtn');
    const world=await poll(async()=>{const s=await stageLayers(p);return s?.family===r.family&&s.layers?.layers===r.composition.layers.filter(l=>l.enabled).length&&!s.layers.failed.length&&s.layers.points>0?s:null;},60000);
    check('the Stage replays the recorded performance with the composition\'s layers',!!world&&await p.evaluate(()=>window.ResonancePlayer.state.mode==='replay'&&window.ResonancePlayer.state.playing),JSON.stringify(world?.layers));
    await p.click('#stageSoundBtn');
    check('sound on: the composed score with the saved profile',await until(p,()=>{const s=window.ResonancePlayer.state.sound;return s.enabled&&s.score===3&&s.options.profile.evolution===.85&&s.options.style==='ambient';},null,20000),JSON.stringify(await p.evaluate(()=>({score:window.ResonancePlayer.state.sound.score,style:window.ResonancePlayer.state.sound.options.style,profile:window.ResonancePlayer.state.sound.options.profile}))));
    await sleep(2000);
    await p.click('#stageRecordBtn');
    check('recording starts from the Stage\'s Record button',await until(p,()=>window.ResonancePlayer.state.recording.active,null,15000));
    const during=[];for(let i=0;i<6;i++){await sleep(2000);during.push(await p.evaluate(()=>{const s=window.__worldStats?.(),P=window.ResonancePlayer.state;return {family:s?.family,layers:s?.layers?.layers,points:s?.layers?.points,score:P.sound.score,section:P.sound.form?.role||null,level:+P.sound.level.toFixed(4),frames:P.recording.stats?.frames};}));}
    note('whileRecording',during);
    check('while recording: the composition\'s layers and the composed score are what plays',during.every(d=>d.family===r.family&&d.layers>0&&d.score===3),JSON.stringify(during.at(-1)));
    const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click('#stageRecordBtn')]);
    const file=path.join(OUT,'scenario-f.webm');await dl.saveAs(file);
    const last=await p.evaluate(()=>window.ResonancePlayer.state.recording.last);note('recording',last);
    const pr=probe(file);note('ffprobe',pr);
    check('the WebM has a video stream and an audio stream',pr.streams.some(s=>s.type==='Video')&&pr.streams.some(s=>s.type==='Audio'),pr.streams.map(s=>`${s.type}: ${s.desc.slice(0,60)}`).join(' | '));
    check('its duration matches the recording (about 12 s)',pr.duration>=9&&pr.duration<=20,`${pr.duration} s (recorder: ${last?.durationMs} ms, ${last?.frames} frames)`);
    check('its audio is not silent',pr.meanVolume!==null&&pr.meanVolume>-60&&pr.maxVolume>-40,`mean ${pr.meanVolume} dB, max ${pr.maxVolume} dB`);
    check('its picture is not blank',pr.midFrame.luma>2&&pr.midFrame.contrast>2,JSON.stringify(pr.midFrame));
    return file;
  }finally{await ctx.close();}
}
// ======================================================================================================================
// Film 4's compositions, made in the Artist Studio through its interface only (brief §36: reproducible from the
// application). In a persistent data directory (a fresh copy of the lumen dataset), kept for the film:
//   Aurora Loom      on the artist canvas: an aurora field behind coral fractals grown at every subsystem, curl ribbons
//                    from the centre, a flock that gathers and loosens with the harmony, a beacon on the largest
//                    subsystem for verified milestones; Dreamlike. Saved, reloaded, reopened, changed, saved again
//                    (version 2) and applied to the project, whose music becomes the composed score.
//   Graphite Signal  the contrasting second artist (§41): near-monochrome precise geometry and thin grey wind; Clean.
//                    Saved, not applied.
// Usage: node qualification/ui/phase11.qual.js --film4 <dir> [--fresh] [--out <dir>]
async function film4(browser,env){
  const ctx=await context(browser,env);const p=await page(ctx,env,'artist','Film 4');
  const layerSet=async(id,values)=>{await arSelect(p,id);for(const [k,v] of values)await arSet(p,k,v);};
  try{
    // The composed score for the project's music (Music Studio), so the music the layers answer is the Phase 11 one.
    await p.click('nav.rail a[data-ws="music"]');await p.waitForSelector('#musicScore',{timeout:20000});
    await until(p,()=>!document.getElementById('musicScoreUpgrade')?.disabled||/Composed/.test(document.querySelector('#musicScore .ms-score-title')?.textContent||''),null,20000);
    if(await p.isVisible('#musicScoreUpgrade'))await p.click('#musicScoreUpgrade');
    check('the project plays the composed score',await until(p,()=>window.ResonancePlayer.state.recipe?.genome?.music?.score===3,null,20000));
    // ---- Aurora Loom -----------------------------------------------------------------------------------------------
    await p.click('nav.rail a[data-ws="artist"]');await p.waitForSelector('#arAddLayer',{timeout:20000});
    await arLibrary(p,'starters','starter-blank');
    check('Blank composition on the artist canvas',!!await previewed(p,c=>c.base==='canvas'&&!c.layers.length));
    await p.fill('#arName','Aurora Loom');await p.press('#arName','Enter');
    await arSet(p,'Background','#04070f',COMP);await arSet(p,'Horizon','#10213a',COMP);
    const atm=await arAdd(p,'atmosphere');
    // Judged on the stage: at the brief's 0.9 the dark teal and violet sank into the lifted horizon, and the curtain sat
    // at the frame's top edge (the canvas camera looks nearly level). Lower and brighter, it reads as an aurora.
    await layerSet(atm,[['Style','aurora'],['Colour','#0f5c6e'],['Second colour','#5b2a86'],['Intensity','1.2'],['Height','0.12'],['Texture','0.7'],['Brightness','2.4']]);
    await arMap(p,0,{signal:'music.dynamics',target:'intensity',amount:.3,curve:'smooth',smoothing:2});
    const fr=await arAdd(p,'fractal');
    // Larger and one level deeper than the default (at size 1 the corals were small sprigs); half-grown at rest, so new
    // structure in the project visibly grows them.
    await layerSet(fr,[['Form','coral'],['Anchor','subsystems'],['Colour','#7ef9ff'],['Tip colour','#ffd27f'],['Glow','1.4'],['Size','2.6'],['Recursion','6'],['Growth','0.7']]);
    await arMap(p,0,{signal:'eng.creation',target:'growth',amount:.3,curve:'smooth',smoothing:1.5});
    const rb=await arAdd(p,'ribbons');
    // Finer, longer-reaching threads than the default: at full width the curl knotted into a scribble at the centre.
    await layerSet(rb,[['Flow field','curl'],['Count','28'],['Colour','#8ab4ff'],['Second colour','#ff9ad5'],['Glow','1.4'],['Anchor','center'],['Width','0.45'],['Size','2'],['Length','0.4'],['Turbulence','0.2']]);
    await arMap(p,0,{signal:'music.energy',target:'speed',amount:.4,curve:'smooth',smoothing:1.2});
    const pt=await arAdd(p,'particles');
    await layerSet(pt,[['Behaviour','flock'],['Count','2400'],['Colour','#bff6ff'],['Second colour','#ffc2f0'],['Anchor','subsystems'],['Attraction','0.4']]);
    await arMap(p,0,{signal:'env.coherence',target:'brightness',amount:.25,curve:'smooth',smoothing:1.5});
    await arMap(p,1,{signal:'music.tension',target:'cohesion',amount:-.4,curve:'smooth',smoothing:2});
    const lt=await arAdd(p,'light');
    await layerSet(lt,[['Style','beacon'],['Anchor','largest']]);
    await arMap(p,0,{signal:'eng.milestone',target:'intensity',amount:.5,curve:'smooth',smoothing:1});
    await p.click(`${COMP} [role=radiogroup][aria-label="Finish"] button[data-value="dreamlike"]`);
    let c=await previewed(p,c=>c.layers.length===5&&c.finish==='dreamlike'&&c.canvas.background==='#04070f'&&layerOf(c,'particles')?.mappings.length===2&&layerOf(c,'light')?.mappings[0]?.signal==='eng.milestone');
    note('auroraLoom',c);
    check('Aurora Loom: five layers, its palette, its mappings, Dreamlike',!!c,c?c.layers.map(l=>`${l.type}:${l.params.style||l.params.form||l.params.field||l.params.behavior||''}@${l.anchor.kind}[${l.mappings.map(m=>`${m.signal}>${m.target}`).join(',')}]`).join(' '):'');
    const drawn=await poll(async()=>{const s=await stageLayers(p);return s?.layers?.layers===5&&s.layers.points>0&&!s.layers.failed.length?s:null;},40000);
    note('stageV1',drawn?.layers);check('the stage draws all five layers, none failed',!!drawn,JSON.stringify(drawn?.layers));
    await p.click('#arSave');
    check('saved (version 1)',await until(p,()=>/Saved · version 1/.test(document.querySelector('.ws-artist .ar-head-pills')?.textContent||''),null,10000));
    // Reload, reopen from My creations, change a layer, save again.
    await p.reload();await p.waitForFunction(()=>!!window.ResonancePlayer?.state.recipe,null,{timeout:45000});await p.waitForSelector('#arAddLayer',{timeout:20000});
    const lib=await env.get('/api/compositions'),entry=lib.compositions.find(e=>e.composition.name==='Aurora Loom');
    await arLibrary(p,'mine',entry.id);
    c=await previewed(p,c=>c.id===entry.id&&c.layers.length===5);
    check('after a reload, Aurora Loom reopens from My creations as saved',!!c&&JSON.stringify(c.layers)===JSON.stringify(entry.composition.layers),entry.id);
    const ribbons=c.layers.find(l=>l.type==='ribbons').id;
    await layerSet(ribbons,[['Count','34']]);
    await previewed(p,c=>c.layers.find(l=>l.type==='ribbons')?.params.count===34);
    await p.click('#arSave');
    check('changed (34 ribbons) and saved again: version 2, version 1 kept',await until(p,()=>/Saved · version 2/.test(document.querySelector('.ws-artist .ar-head-pills')?.textContent||''),null,10000)
      &&(await env.get('/api/compositions')).compositions.find(e=>e.id===entry.id)?.history?.some(v=>v.version===1));
    check('applied to the lumen project',await arApply(p));
    const r=await env.recipe();note('recipe',{family:r.family,finish:r.genome?.technique?.finish,score:r.genome?.music?.score,composition:{id:r.composition?.id,name:r.composition?.name,layers:r.composition?.layers.length}});
    check('the recipe holds Aurora Loom version 2',r.composition?.id===entry.id&&r.composition.layers.find(l=>l.type==='ribbons')?.params.count===34,`${r.composition?.name}`);
    // The evidence: the studio with the saved creation (after Apply the stage shows the project's saved look, which is
    // this composition), and the layer editor with the particle population selected and its response settings open.
    await arSelect(p,c.layers.find(l=>l.type==='fractal').id);await sleep(3500);
    await shot(p,'saved-creation');
    await arSelect(p,c.layers.find(l=>l.type==='particles').id);
    await openResponse(p.locator(`${MAPS} .ar-map`).nth(1));await sleep(2500);
    await shot(p,'layer-editor');
    await arSelect(p,c.layers.find(l=>l.type==='ribbons').id);await sleep(1500);
    await shot(p,'artist-studio');
    // ---- Graphite Signal: another artist, the same tools ----------------------------------------------------------------
    await arLibrary(p,'starters','starter-blank');
    await previewed(p,c=>c.base==='canvas'&&!c.layers.length);
    await p.fill('#arName','Graphite Signal');await p.press('#arName','Enter');
    await arSet(p,'Background','#0a0b0d',COMP);await arSet(p,'Horizon','#1c1f24',COMP);
    const lat=await arAdd(p,'structure');
    await layerSet(lat,[['Shape','lattice'],['Count','6'],['Radius','1.4'],['Colour','#e6e8ec'],['Glow','0.5'],['Rotation','0.12']]);
    await arMap(p,0,{signal:'music.bar',target:'glow',amount:.25,curve:'pulse',smoothing:0});
    const poly=await arAdd(p,'structure');
    await layerSet(poly,[['Shape','polyhedron'],['Count','3'],['Radius','0.7'],['Colour','#9aa1ab'],['Glow','0.35'],['Anchor','largest']]);
    await arMap(p,0,{signal:'eng.milestone',target:'glow',amount:.6,curve:'smooth',smoothing:1});
    const wind=await arAdd(p,'ribbons');
    // Thin, but bright and wide enough to be seen crossing the lattice (at glow 0.5 the grey wind vanished on black).
    await layerSet(wind,[['Flow field','wind'],['Count','24'],['Width','0.45'],['Size','1.8'],['Colour','#7d838c'],['Second colour','#c4c8ce'],['Glow','0.9']]);
    await arMap(p,0,{signal:'music.rhythm',target:'speed',amount:.35,curve:'linear',smoothing:.5});
    await p.click(`${COMP} [role=radiogroup][aria-label="Finish"] button[data-value="clean"]`);
    c=await previewed(p,c=>c.layers.length===3&&c.finish==='clean'&&c.layers.filter(l=>l.type==='structure').length===2&&layerOf(c,'ribbons')?.params.field==='wind');
    note('graphiteSignal',c);check('Graphite Signal: lattice and polyhedra, thin grey wind, Clean',!!c);
    await p.click('#arSave');
    check('Graphite Signal saved (not applied)',await until(p,()=>/Saved · version 1/.test(document.querySelector('.ws-artist .ar-head-pills')?.textContent||''),null,10000)&&(await env.recipe()).composition?.name==='Aurora Loom');
    await poll(async()=>{const s=await stageLayers(p);return s?.layers?.layers===3&&!s.layers.failed.length?s:null;},30000);
    await sleep(3500);await shot(p,'graphite-signal-preview');
    // The preview is left; the project keeps Aurora Loom. The applied piece on the Stage (for judging the image).
    await p.click('#arCancel');await until(p,()=>!window.ResonancePlayer.state.preview,null,10000);
    await p.click('nav.rail a.stage-link');
    await poll(async()=>{const s=await stageLayers(p);return s?.layers?.layers===5&&!s.layers.failed.length?s:null;},40000);await sleep(6000);
    await shot(p,'aurora-loom-stage');
  }finally{await ctx.close();}
}
// ======================================================================================================================
// The Artist Studio helpers serve other scripts that drive the studio (a probe, a review), run as a module.
module.exports={receiver,context,page,shot,poll,previewed,previewComp,layerOf,stageLayers,arLibrary,arAdd,arSelect,arSet,arMap,openResponse,arSaveAs,arApply,INSP,COMP,MAPS};
if(require.main===module)(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const browser=await H.launch('amd');
  const renderer=await H.rendererOf(browser);
  console.log(`renderer: ${renderer}`);
  const report={date:new Date().toISOString(),renderer,viewport:VIEW,scenarios:{}};
  let env=null,second=null;
  try{
    if(!/AMD|Radeon/i.test(renderer))throw new Error(`not the AMD adapter: ${renderer}`);
    const f4=flag('--film4');
    if(f4){
      // A persistent copy (kept for the film): made once, or anew with --fresh.
      const dir=path.resolve(f4);
      if(fs.existsSync(path.join(dir,'compositions.json'))&&!argv.includes('--fresh'))throw new Error(`${dir} already holds compositions: pass --fresh to make it again`);
      await fsp.rm(dir,{recursive:true,force:true});await fsp.mkdir(path.dirname(dir),{recursive:true});await fsp.cp(path.join(DATASETS,'lumen'),dir,{recursive:true});
      env=await receiver(null,dir);report.film4={dir,project:env.project};
      scenario.id='Film4';const t0=Date.now();
      try{await film4(browser,env);}catch(e){check('Film 4 completed',false,String(e?.stack||e).slice(0,600));}
      const list=checks.filter(c=>c.scenario==='Film4');report.scenarios.Film4={pass:list.length>0&&list.every(c=>c.pass),checks:list,observed:observed.Film4||{},seconds:Math.round((Date.now()-t0)/1000)};
      return;
    }
    env=await receiver('lumen');report.dataset={name:'lumen',project:env.project};
    const run=async(id,fn,...a)=>{if(!ONLY.has(id))return;scenario.id=id;const t0=Date.now();
      try{await fn(browser,...a);}catch(e){check('scenario completed',false,String(e?.stack||e).slice(0,600));}
      const list=checks.filter(c=>c.scenario===id);report.scenarios[id]={pass:list.length>0&&list.every(c=>c.pass),checks:list,observed:observed[id]||{},seconds:Math.round((Date.now()-t0)/1000)};};
    await run('A',scenarioA,env);
    await run('B',scenarioB,env);
    await run('C',scenarioC,env);
    await run('D',scenarioD,env);
    if(ONLY.has('E')){second=await receiver('self');report.secondDataset={name:'self',project:second.project};}
    await run('E',scenarioE,env,second);
    await run('F',scenarioF,env);
  }finally{
    report.errors=errors;report.screenshots=screenshots;report.pass=Object.values(report.scenarios).every(s=>s.pass);
    await fsp.writeFile(path.join(OUT,flag('--film4')?'film4.json':'phase11.json'),JSON.stringify(report,null,1));
    await browser.close();if(env)await env.stop();if(second)await second.stop();
    if(!KEEP)for(const d of made)await fsp.rm(d,{recursive:true,force:true});
    console.log(`\n${checks.filter(c=>c.pass).length}/${checks.length} checks passed · ${Object.entries(report.scenarios).map(([k,s])=>`${k} ${s.pass?'pass':'FAIL'}`).join(' · ')}`);
    if(errors.length)console.log(`page errors:\n  ${errors.slice(0,20).join('\n  ')}`);
    process.exitCode=report.pass?0:1;
  }
})();

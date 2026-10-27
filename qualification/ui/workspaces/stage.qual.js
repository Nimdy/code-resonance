'use strict';
// The Performance Stage's keyboard, on an isolated installation (never ~/.code-resonance): M sound, I performance
// information, ? the list of keys (closed by Esc), M and I ignored while a control that takes letters has focus, and
// Esc back to the Control Center only when pressed twice, never in the window opened on the Stage alone, never while
// the Stage fills the screen and never with the Esc that ended full screen.
// Usage: node qualification/ui/workspaces/stage.qual.js        Results: qualification/results/ui/stage.json
const path=require('node:path');
const fsp=require('node:fs/promises');
const REPO=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(REPO,'qualification/node_modules/playwright-core'));
const {createEnvironment}=require('../environment.js');
const OUT=path.join(REPO,'qualification/results/ui');
const ARGS=['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'];
const checks=[];
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=8000,step=150){const t=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t>ms)return v;await wait(step);}}
const onStage=page=>page.waitForFunction(()=>location.hash==='#/stage'&&!!document.getElementById('stageTitle')&&!!window.ResonancePlayer,null,{timeout:30000});
const hash=page=>page.evaluate(()=>location.hash);
const hint=page=>page.evaluate(()=>{const e=document.getElementById('stageEscHint');return e&&!e.hidden?e.textContent:'';});
// Focus nothing in particular, as a person watching the world would.
const rest=page=>page.evaluate(()=>{document.activeElement?.blur?.();});
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const env=await createEnvironment();
  const {url}=env,sample=env.projects.sample;
  const browser=await chromium.launch({args:ARGS});
  const errors=[];const watch=(p,label)=>{p.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(`${label}: ${m.text()}`);});p.on('pageerror',e=>errors.push(`${label}: ${e}`));};
  try{
    // A desktop: the screen is larger than the browser's page (Playwright's default screen is the viewport, which reads
    // as a browser in full screen).
    const ctx=await browser.newContext({viewport:{width:1440,height:900},screen:{width:2560,height:1440}});
    const page=await ctx.newPage();watch(page,'main');
    await page.goto(`${url}/?project=${sample}#/home`);
    await page.waitForFunction(()=>!!document.querySelector('.ws-home')&&!!window.ResonancePlayer,null,{timeout:30000});
    // Arrive from the Control Center, as a person does (so this window has somewhere to go back to).
    await page.evaluate(()=>{location.hash='#/stage';});await onStage(page);await wait(1500);
    // ---- M: sound -----------------------------------------------------------------------------------------------
    await rest(page);
    const sound=()=>page.evaluate(()=>window.ResonancePlayer.state.sound.enabled);
    const before=await sound();
    await page.keyboard.press('m');
    const toggled=await until(async()=>(await sound())!==before);
    check('M turns the sound on or off',toggled,`before ${before}, after ${await sound()}`);
    check('the Sound button follows the M key',(await page.getAttribute('#stageSoundBtn','aria-pressed'))===String(await sound()));
    await page.keyboard.press('m');
    check('M again returns the sound to how it was',await until(async()=>(await sound())===before),`now ${await sound()}`);
    // ---- I: performance information -----------------------------------------------------------------------------
    const infoShown=()=>page.evaluate(()=>!!document.querySelector('.stage-info .info-card'));
    const infoBefore=await infoShown();
    await page.keyboard.press('i');
    check('I shows or hides the performance information',await until(async()=>(await infoShown())!==infoBefore));
    await page.keyboard.press('i');
    check('I again restores it',await until(async()=>(await infoShown())===infoBefore));
    // ---- M and I do nothing while the quality select has focus --------------------------------------------------
    const quality=await page.inputValue('#qualitySelect');
    await page.focus('#qualitySelect');
    await page.keyboard.press('m');await page.keyboard.press('i');await wait(600);
    check('M and I are ignored while the quality select has focus',(await sound())===before&&(await infoShown())===infoBefore&&(await page.inputValue('#qualitySelect'))===quality,
      `sound ${await sound()}, info ${await infoShown()}, quality ${await page.inputValue('#qualitySelect')}`);
    await rest(page);
    // ---- ?: the list of keys, closed by Esc (which then does not leave) ------------------------------------------
    await page.keyboard.press('Shift+Slash');
    check('? opens the list of keys',await until(()=>page.evaluate(()=>!document.getElementById('stageKeys').hidden)));
    await page.keyboard.press('Escape');await wait(300);
    check('Esc closes the list of keys and stays on the Stage',await page.evaluate(()=>document.getElementById('stageKeys').hidden)&&(await hash(page))==='#/stage'&&!(await hint(page)),await hash(page));
    await rest(page);
    // ---- Esc once: stays, and says so; a second Esc much later is a first Esc again ---------------------------------
    await wait(2800);
    await page.keyboard.press('Escape');await wait(300);
    const once=await hint(page);
    check('one Esc stays on the Stage and says to press it again',(await hash(page))==='#/stage'&&/again/.test(once),`${await hash(page)}: "${once}"`);
    await wait(3000);
    await page.keyboard.press('Escape');await wait(300);
    check('an Esc long after the first does not leave',(await hash(page))==='#/stage',await hash(page));
    // ---- Esc twice: back to the Control Center ----------------------------------------------------------------------
    await page.keyboard.press('Escape');
    const left=await until(async()=>(await hash(page))!=='#/stage',4000);
    check('Esc twice returns to the Control Center (the page it came from)',left&&(await hash(page))==='#/home',await hash(page));
    // ---- The Esc that ends full screen does not leave -------------------------------------------------------------
    await page.evaluate(()=>{location.hash='#/stage';});await onStage(page);await wait(800);await rest(page);
    await page.keyboard.press('f');
    const full=await until(()=>page.evaluate(()=>!!document.fullscreenElement),4000);
    if(full){
      // The browser ends full screen; a page may then still receive that same Esc.
      await page.evaluate(()=>document.exitFullscreen());
      await page.keyboard.press('Escape');await page.keyboard.press('Escape');await wait(400);
      check('the Esc that ends full screen never leaves the Stage, even pressed twice at once',(await hash(page))==='#/stage',await hash(page));
    }else check('the Esc that ends full screen never leaves the Stage, even pressed twice at once',false,'full screen could not start in this browser');
    // ---- The window opened on the Stage alone (second monitor): Esc never leaves it ----------------------------------
    // The pointer moves first: the controls show (they fade, and stop taking clicks, while it rests).
    await wait(1000);await page.mouse.move(700,420);await page.mouse.move(720,440);await wait(300);
    const [popup]=await Promise.all([ctx.waitForEvent('page',{timeout:10000}),page.click('[aria-label="Open in a new window"]')]);
    watch(popup,'popup');await popup.waitForLoadState();await onStage(popup);await wait(1200);
    await popup.evaluate(()=>{document.activeElement?.blur?.();});
    await popup.keyboard.press('Escape');await wait(300);await popup.keyboard.press('Escape');await wait(400);
    const popHint=await hint(popup);
    check('the second-monitor window keeps the Stage on Esc (twice) and names the way out',(await hash(popup))==='#/stage'&&/Control Center/.test(popHint),`${await hash(popup)}: "${popHint}"`);
    await popup.close();
    // ---- A browser in full screen (F11): the page covers the screen; Esc does not leave ------------------------------
    const f11=await browser.newContext({viewport:{width:1440,height:900},screen:{width:1440,height:900}});
    const fp=await f11.newPage();watch(fp,'f11');
    await fp.goto(`${url}/?project=${sample}#/home`);await fp.waitForFunction(()=>!!document.querySelector('.ws-home'),null,{timeout:30000});
    await fp.evaluate(()=>{location.hash='#/stage';});await onStage(fp);await wait(1200);
    await fp.evaluate(()=>{document.activeElement?.blur?.();});
    await fp.keyboard.press('Escape');await wait(300);await fp.keyboard.press('Escape');await wait(400);
    const f11Hint=await hint(fp);
    check('in browser full screen (F11) Esc twice keeps the Stage and says how to leave',(await hash(fp))==='#/stage'&&/full screen/.test(f11Hint),`${await hash(fp)}: "${f11Hint}"`);
    await f11.close();
    check('no console or page errors',errors.length===0,errors.slice(0,4).join(' | '));
  }catch(e){check('qualification ran to the end',false,e.stack||e.message);}
  finally{await browser.close();await env.stop();}
  const failed=checks.filter(c=>!c.pass).length;
  await fsp.writeFile(path.join(OUT,'stage.json'),JSON.stringify({at:new Date().toISOString(),passed:checks.length-failed,failed,checks},null,2));
  console.log(`${checks.length-failed}/${checks.length} passed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});

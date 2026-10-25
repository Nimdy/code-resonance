'use strict';
// Visual Packs workspace, end to end through the real interface: a real receiver on a temporary data directory, real
// Chromium, the reference packs of packs/examples imported the way a person would (a .zip built here, a folder picked),
// reviewed, approved, run, revoked, modified on disk, refused and removed. No command line in the successful path.
// Every effect is checked through the receiver's API and on the stage (the isolated pack frame), and a second window
// must converge through the change feed.
// Usage: node ui/workspaces/packs.qual.js [--port 4184]   (from qualification/)
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const {chromium}=require('playwright-core');
const REPO=path.resolve(__dirname,'../../..');
const {createEnvironment}=require('../environment');
const OUT=path.join(__dirname,'..','..','results','ui');
const PORT=Number((process.argv.find((a,i)=>process.argv[i-1]==='--port'))||4184);
const EMBER='northlight.ember-observatory',CYMATIC='halcyon.cymatic-field';
const checks=[],measurements={};
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail).slice(0,400)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${String(detail).slice(0,300)}`:''}`);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const LAUNCH={args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']};
// ---- A tiny ZIP writer (stored entries, CRC-32): the test builds its archives in memory, none is ever committed ----
const CRC=new Int32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c;});
const crc32=b=>{let c=-1;for(const x of b)c=CRC[(c^x)&255]^(c>>>8);return (c^-1)>>>0;};
function zip(entries){
  const locals=[],centrals=[];let offset=0;
  for(const {name,data} of entries){
    const n=Buffer.from(name,'utf8'),crc=crc32(data),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(0x031e,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(n.length,28);central.writeUInt32LE((0o100644<<16)>>>0,38);central.writeUInt32LE(offset,42);
    locals.push(local,n,data);centrals.push(central,n);offset+=30+n.length+data.length;
  }
  const cd=Buffer.concat(centrals),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,cd,end]);
}
// A pack folder as archive entries, zipped "with its folder" (the receiver strips one shared top directory).
// edit(name,data) may change an entry's bytes (the test adds content to a README, never to the repository's files).
function folderZip(dir,top,edit=(n,d)=>d){const out=[];const walk=(d,rel)=>{for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const r=rel?`${rel}/${e.name}`:e.name;
  if(e.isDirectory())walk(path.join(d,e.name),r);else out.push({name:`${top}/${r}`,data:edit(r,fs.readFileSync(path.join(d,e.name)))});}};walk(dir,'');return zip(out);}
async function open(context,url,{width=1440,height=900}={}){
  const page=await context.newPage();await page.setViewportSize({width,height});const errors=[],expected=[],requests=[];
  // A refused import, and the deliberate approval request for a tampered pack (refused with 400), are 4xx responses that
  // Chromium also logs: those are expected and counted separately.
  // Errors raised while another workspace is shown (Visual Studio, after "Use it") belong to that workspace's suite: kept
  // apart, and reported.
  const others=[];const where=()=>{try{return new URL(page.url()).hash;}catch{return '';}};
  page.on('console',m=>{if(m.type()!=='error')return;const u=m.location()?.url||'';if(/Failed to load resource/.test(m.text())&&/\/api\/packs\/(?:import|trust)/.test(u))expected.push(m.text());
    else if(!where().startsWith('#/packs')||/\/ui\/(?:css|workspaces)\/(?!packs)/.test(m.text()+u))others.push(`${where()}: ${m.text().slice(0,240)}`);else errors.push(m.text().slice(0,300));});
  page.on('pageerror',e=>(where().startsWith('#/packs')?errors:others).push(String(e)));page.on('request',r=>requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.goto(url);return {page,errors,expected,requests,others};
}
async function ready(page,timeout=30000){await page.waitForFunction(()=>document.body.dataset.receiver==='connected'&&!!window.ResonancePlayer,null,{timeout});}
const rowText=(page,id)=>page.evaluate(id=>document.querySelector(`.pk-row[data-id="${id}"]`)?.innerText||null,id);
const frames=page=>page.evaluate(()=>document.querySelectorAll('iframe.pack-frame').length);
async function until(fn,timeout=20000,step=250){const t0=Date.now();for(;;){const v=await fn();if(v||Date.now()-t0>timeout)return v;await wait(step);}}
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const env=await createEnvironment({port:PORT,demo:false});
  const api=async p=>(await fetch(env.url+p,{cache:'no-store'})).json();
  const pack=async id=>(await api('/api/packs')).packs.find(p=>p.id===id)||null;
  const browser=await chromium.launch(LAUNCH);
  const shots=[];const shot=async(page,name)=>{for(const b of await page.$$('.toast button[aria-label="Dismiss"]'))await b.click().catch(()=>{});const f=path.join(OUT,`packs-${name}.png`);await page.screenshot({path:f});shots.push(path.relative(REPO,f));};
  let w1,w2;
  try{
    const context=await browser.newContext();
    w1=await open(context,env.url+'/#/packs');await ready(w1.page);
    const page=w1.page;
    await page.waitForSelector('.ws-packs .empty',{timeout:15000});
    check('empty installation: the library says so and offers Import and the SDK guide',await page.evaluate(()=>{const e=document.querySelector('.ws-packs .empty');return /No visual packs installed/.test(e.innerText)&&/Import a pack/.test(e.innerText)&&/SDK guide/.test(e.innerText);}));
    await shot(page,'empty-1440x900');
    // A second window of the same browser: it must follow every change through the receiver's change feed.
    w2=await open(context,env.url+'/#/packs',{width:1280,height:720});await ready(w2.page);
    // ---- Creator corner -----------------------------------------------------------------------------------------
    await page.waitForFunction(()=>document.querySelectorAll('.pk-template').length===3,null,{timeout:10000});
    const templates=await page.evaluate(()=>[...document.querySelectorAll('.pk-template code')].map(c=>c.textContent));
    check('creator corner lists the three starter templates with their commands (from GET /api/packs/templates)',templates.length===3&&templates.every(t=>/^npm run pack -- new <dir> --kind (declarative|shader|world) --id <author\.name>$/.test(t)),templates.join(' | '));
    const checksText=await page.evaluate(()=>[...document.querySelectorAll('.pk-check code')].map(c=>c.textContent));
    check('creator corner shows the validate and test commands',checksText.includes('npm run pack -- validate <dir>')&&checksText.includes('npm run pack -- test <dir> --quick'),checksText.join(' | '));
    await page.click('.pk-doc:has-text("World API")');
    await page.waitForFunction(()=>document.querySelector('.modal .doc-view .markdown h2, .modal .doc-view .markdown h3'),null,{timeout:10000}).catch(()=>{});
    const doc=await page.evaluate(()=>({title:document.querySelector('.modal h2')?.textContent,body:document.querySelector('.modal .doc-view')?.innerText.slice(0,200)||''}));
    check('an SDK guide opens in the documentation viewer',doc.title==='World API'&&doc.body.length>80&&!/could not be loaded/.test(doc.body),`${doc.title}: ${doc.body.slice(0,80)}`);
    await page.keyboard.press('Escape');
    // The overview leads and the six references fill whole rows: no guide left alone on a line at 1440.
    const guides=await page.evaluate(()=>{const tops=[...document.querySelectorAll('.pk-docs-ref .pk-doc')].map(b=>Math.round(b.getBoundingClientRect().top));
      const rows=new Map();for(const t of tops)rows.set(t,(rows.get(t)||0)+1);return {lead:document.querySelector('.pk-doc.lead')?.innerText.split('\n')[0]||'',rows:[...rows.values()]};});
    check('SDK guides: the overview leads, the six references fill whole rows (no orphan)',guides.lead==='Visual Pack SDK'&&guides.rows.length>=1&&guides.rows.every(n=>n===guides.rows[0])&&guides.rows.reduce((a,b)=>a+b,0)===6,JSON.stringify(guides));
    // ---- Keyboard: the Import dialog opens with Enter and closes with Escape -------------------------------------------
    await page.focus('#pkImportBtn');await page.keyboard.press('Enter');
    await page.waitForSelector('.modal #pkChooseZip',{timeout:5000});
    // The dialog moves focus in on the next frame.
    const focusInDialog=await until(()=>page.evaluate(()=>!!document.activeElement?.closest('.modal')),2000,50);
    // The "working" pulse follows the app's own motion setting (and the system's when the app says nothing).
    const motion=await page.evaluate(()=>{const el=document.querySelector('.pk-import-status'),root=document.documentElement,was=root.dataset.motion,anim=()=>getComputedStyle(el,'::before').animationName;
      root.dataset.motion='full';const full=anim();root.dataset.motion='reduce';const reduce=anim();if(was===undefined)delete root.dataset.motion;else root.dataset.motion=was;return {full,reduce};});
    check('reduced motion (app setting): the import status does not pulse',motion.full!=='none'&&motion.reduce==='none',JSON.stringify(motion));
    await page.keyboard.press('Escape');await wait(300);
    const back=await page.evaluate(()=>document.activeElement?.id);
    check('keyboard: Enter on Import opens the dialog with focus inside, Escape closes it and focus returns',focusInDialog&&!(await page.$('.modal'))&&back==='pkImportBtn',`focus in dialog: ${focusInDialog}; focus after: ${back}`);
    // Arrow keys move through the library (checked later with packs installed).

    // ---- Import a declarative pack as a .zip ----------------------------------------------------------------------------
    await page.click('#pkImportBtn');await page.waitForSelector('#pkZipInput',{state:'attached'});
    // One web link is added to the README inside the archive: the inspector must show where it leads.
    const emberZip=folderZip(path.join(REPO,'packs/examples/ember-observatory'),'ember-observatory',(n,d)=>n==='README.md'?Buffer.concat([d,Buffer.from('\n\nMore in [the observatory notes](https://northlight.example/notes).\n')]):d);
    await page.setInputFiles('#pkZipInput',{name:'ember-observatory.zip',mimeType:'application/zip',buffer:emberZip});
    await page.waitForSelector('#pkReport',{timeout:15000});
    const report=await page.evaluate(()=>document.getElementById('pkReport').innerText);
    check('zip import: the report shows the manifest, kind, files and digest before anything is installed',/Ember Observatory/.test(report)&&/Declarative · data only/i.test(report)&&/No errors/i.test(report)&&/pack\.json/.test(report)&&/README\.md/.test(report)&&/Data only/i.test(report),report.replace(/\s+/g,' ').slice(0,200));
    check('zip import: nothing is installed while the report is shown',!(await pack(EMBER)),'');
    await shot(page,'import-report-1440x900');
    await page.click('#pkInstallBtn');await page.waitForSelector('#pkInstalled',{timeout:15000});
    const installedText=await page.evaluate(()=>document.getElementById('pkInstalled').innerText);
    const ember=await pack(EMBER);
    check('Install: the pack is installed (GET /api/packs) as data only, usable at once',ember&&ember.ok&&!ember.executable&&ember.trusted&&/is installed/.test(installedText)&&/no code/.test(installedText),JSON.stringify(ember&&{ok:ember.ok,executable:ember.executable,trusted:ember.trusted}));
    await page.keyboard.press('Escape');
    await page.waitForFunction(id=>!!document.querySelector(`.pk-row[data-id="${id}"]`),EMBER,{timeout:10000});
    check('library: listed as "Declarative · data only" and "Data only — no approval needed"',/Declarative · data only/i.test(await rowText(page,EMBER))&&/Data only — no approval needed/.test(await rowText(page,EMBER)),(await rowText(page,EMBER)||'').replace(/\s+/g,' '));
    const converged=await w2.page.waitForFunction(id=>!!document.querySelector(`.pk-row[data-id="${id}"]`),EMBER,{timeout:15000}).then(()=>true,()=>false);
    check('second window: the installed pack appears without a reload (change feed)',converged,'');
    // The same archive again: the report says what it replaces; Discard leaves nothing behind.
    await page.click('#pkImportBtn');await page.waitForSelector('#pkZipInput',{state:'attached'});
    await page.setInputFiles('#pkZipInput',{name:'ember-observatory.zip',mimeType:'application/zip',buffer:emberZip});
    await page.waitForSelector('#pkReport',{timeout:15000});
    const reimport=await page.evaluate(()=>document.getElementById('pkReport').innerText);
    const quarantined=fs.readdirSync(path.join(env.dir,'packs','.quarantine')).length;
    await page.click('#pkDiscardBtn');await wait(600);
    const discarded=await page.evaluate(()=>({choose:!!document.querySelector('#pkChooseZip')&&!document.querySelector('.pk-import-intro').hidden,report:!!document.getElementById('pkReport')}));
    check('re-import: "Replaces the installed version 1.0.0", identical files',/Replaces the installed version 1\.0\.0/.test(reimport)&&/identical/.test(reimport),reimport.match(/Replaces[^\n]*\n?[^\n]*/)?.[0]||'');
    check('Discard: the waiting import is removed on the receiver and the dialog returns to the choice',quarantined===1&&fs.readdirSync(path.join(env.dir,'packs','.quarantine')).length===0&&discarded.choose&&!discarded.report,`${quarantined} waiting before`);
    await page.keyboard.press('Escape');
    await page.click(`.pk-row[data-id="${EMBER}"]`);
    await page.waitForFunction(()=>document.querySelector('.pk-readme .markdown'),null,{timeout:10000}).catch(()=>{});
    const insp=await page.evaluate(()=>({readme:document.querySelector('.pk-readme .markdown')?.innerText||'',files:document.querySelectorAll('.pk-inspector .pk-files tbody tr').length,digest:document.querySelector('.pk-inspector .pk-digest code')?.textContent,hash:location.hash,
      scripts:document.querySelectorAll('.pk-readme script, .pk-readme iframe, .pk-readme img').length}));
    const link=await page.evaluate(()=>{const a=document.querySelector('.pk-readme a[target="_blank"]');return a&&{text:a.textContent,title:a.title,host:a.nextElementSibling?.classList.contains('md-link-host')?a.nextElementSibling.textContent:null};});
    check('inspector: a README web link shows the address it leads to',link&&link.text==='the observatory notes'&&link.host===' (northlight.example)'&&link.title==='https://northlight.example/notes',JSON.stringify(link));
    check('inspector: README rendered as text, files table and the full digest',insp.readme.length>40&&insp.files===ember.files.length&&insp.digest===ember.digest&&insp.scripts===0&&insp.hash===`#/packs/${EMBER}`,JSON.stringify({...insp,readme:insp.readme.slice(0,60)}));
    await page.reload();await ready(page);
    const afterReload=await page.waitForFunction(id=>document.querySelector(`.pk-row[data-id="${id}"]`)?.getAttribute('aria-current')==='true',EMBER,{timeout:15000}).then(()=>true,()=>false);
    check('after a reload: still installed, and the address keeps the chosen pack selected',afterReload,'');
    // "Use it": Visual Studio previews the look.
    await page.click('#pkUseBtn');
    const hash=await until(()=>page.evaluate(()=>location.hash.startsWith('#/visual')&&location.hash),5000);
    check('Use it (look): opens Visual Studio on this look',hash===`#/visual/look/${EMBER}`,String(hash));
    const visualExists=(await fetch(env.url+'/ui/workspaces/visual.js')).status===200;
    if(visualExists){const preview=await until(()=>page.evaluate(id=>window.ResonancePlayer.state.preview?.recipe?.pack?.id===id,EMBER),15000);
      check('Use it (look): Visual Studio starts a preview of the look',preview,'');}
    else check('Use it (look): Visual Studio starts a preview of the look',false,'public/ui/workspaces/visual.js is not present in this tree, so the preview could not be checked');
    await page.evaluate(()=>window.ResonancePlayer.preview?.(null));
    await page.goto(env.url+'/#/packs');await ready(page);await page.waitForSelector('.pk-row');
    // ---- Import a world pack (code) as a folder ---------------------------------------------------------------------------
    await page.click('#pkImportBtn');await page.waitForSelector('#pkFolderInput',{state:'attached'});
    await page.setInputFiles('#pkFolderInput',path.join(REPO,'packs/examples/cymatic-field'));
    await page.waitForSelector('#pkReport',{timeout:20000});
    const r2=await page.evaluate(()=>({text:document.getElementById('pkReport').innerText,files:document.querySelectorAll('#pkReport .pk-files tbody tr').length}));
    check('folder import: the report says it contains code, what it can reach and what the browser cannot sandbox',/World · runs code/i.test(r2.text)&&/Contains code/i.test(r2.text)&&/cannot fully sandbox GPU shaders/.test(r2.text)&&/no network access/i.test(r2.text)&&r2.files>=17,`files=${r2.files}`);
    await shot(page,'import-report-code-1440x900');
    check('folder import: the report says installing does not approve it',/does not approve it/.test(r2.text),'');
    await page.click('#pkInstallBtn');await page.waitForSelector('#pkInstalled',{timeout:15000});
    const notApproved=await page.evaluate(()=>document.getElementById('pkInstalled').innerText);
    let cym=await pack(CYMATIC);
    check('Install (code): installed but NOT approved, and the dialog says so with a Review button',cym&&cym.ok&&cym.executable&&!cym.trusted&&/installed but NOT approved/.test(notApproved)&&!!(await page.$('#pkInstalledReview')),JSON.stringify(cym&&{ok:cym.ok,trusted:cym.trusted}));
    check('library: the code pack is listed "World · runs code" and "Needs approval"',/World · runs code/i.test(await rowText(page,CYMATIC))&&/Needs approval/.test(await rowText(page,CYMATIC)),(await rowText(page,CYMATIC)||'').replace(/\s+/g,' '));
    check('rail badge: one pack awaits approval',await page.evaluate(()=>document.querySelector('.rail [data-ws="packs"] .badge')?.textContent)==='1','');
    await page.click('#pkInstalledReview');await page.waitForSelector('#pkAllowBtn',{timeout:5000});await wait(200);
    const review=await page.evaluate(()=>{const d=document.querySelector('.modal');return {text:d.innerText,digest:document.getElementById('pkReviewDigest')?.textContent,files:d.querySelectorAll('.pk-files tbody tr').length,
      paths:[...d.querySelectorAll('.pk-files tbody tr td:first-child')].map(td=>td.textContent),focus:document.activeElement?.textContent?.trim()};});
    check('review: identity, author, the exact files with sizes and hashes, and the digest',/Cymatic Field/.test(review.text)&&/Halcyon Visuals/.test(review.text)&&review.digest===cym.digest&&review.files===cym.files.length&&cym.files.every(f=>review.paths.includes(f.path)),`files=${review.files}/${cym.files.length}`);
    check('review: access, the GPU sandbox warning, and that any change needs a new approval',/privacy-safe performance view/.test(review.text)&&/cannot fully sandbox GPU shaders/.test(review.text)&&/any change to any of these files needs a new approval/.test(review.text),'');
    check('review: the safe answer (Cancel) has the focus, not Allow',review.focus==='Cancel',review.focus);
    await shot(page,'review-1440x900');
    await page.click('#pkAllowBtn');
    const approved=await until(async()=>(await pack(CYMATIC))?.trusted,10000);
    check('Allow this code: approved for this digest (GET /api/packs trusted)',approved&&(await pack(CYMATIC)).digest===cym.digest,'');
    await page.waitForFunction(id=>/Approved/.test(document.querySelector(`.pk-row[data-id="${id}"]`)?.innerText||''),CYMATIC,{timeout:10000}).catch(()=>{});
    check('library: listed "Approved"; the rail badge is gone',/Approved/.test(await rowText(page,CYMATIC))&&!(await page.$('.rail [data-ws="packs"] .badge')),'');
    // The project's world family through the recipe API (with the page's control capability), then it must run.
    const project=await page.evaluate(()=>window.ResonancePlayer.state.project);
    await page.evaluate(id=>window.ResonancePlayer.recipeAction({type:'family',family:id}),CYMATIC);
    const running=await until(async()=>(await frames(page))>0&&await page.evaluate(()=>!!window.__worldStats?.()?.remote||!!window.ResonancePlayer.state.worldStatus.remote),30000);
    check('the approved world pack runs as the project\'s family (isolated pack frame)',running,`project=${String(project).slice(0,8)} frames=${await frames(page)}`);
    const used=await until(async()=>(await pack(CYMATIC))?.usedBy===1,10000);
    check('usage: GET /api/packs usedBy counts the project, and the library shows it',used&&/Used by 1 project/.test(await until(()=>rowText(page,CYMATIC).then(t=>/Used by 1 project/.test(t||'')&&t),10000)||''),'');
    await page.click(`.pk-row[data-id="${CYMATIC}"]`);await wait(400);
    check('inspector: "On the stage now" while it runs',/On the stage now/.test(await page.evaluate(()=>document.querySelector('.pk-inspector')?.innerText||'')),'');
    await page.focus(`.pk-row[data-id="${CYMATIC}"]`);await page.keyboard.press('ArrowDown');await wait(300);
    const arrow=await page.evaluate(()=>({focus:document.activeElement?.dataset?.id,hash:location.hash}));
    check('keyboard: ArrowDown moves to the next pack in the library and shows it',arrow.focus===EMBER&&arrow.hash===`#/packs/${EMBER}`,JSON.stringify(arrow));
    await page.keyboard.press('ArrowUp');await wait(300);
    for(const [w,h] of [[1440,900],[1280,720],[900,800]]){await page.setViewportSize({width:w,height:h});await wait(400);await shot(page,`library-${w}x${h}`);}
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||[...document.querySelectorAll('.ws-packs .pk-row')].some(r=>r.scrollWidth>r.clientWidth+1));
    check('900 px wide: no horizontal overflow, the inspector stacks below',!overflow&&await page.evaluate(()=>{const a=document.querySelector('.ws-packs .main').getBoundingClientRect(),b=document.querySelector('.pk-inspector').getBoundingClientRect();return b.top>=a.bottom-1;}),'');
    await page.setViewportSize({width:1440,height:900});
    // ---- Revoke: it stops at once, the stage keeps running ------------------------------------------------------------
    await page.click('#pkRevokeBtn');await page.waitForSelector('.modal .modal-foot');
    const revokeText=await page.evaluate(()=>document.querySelector('.modal').innerText);
    await page.click('.modal .modal-foot button:has-text("Revoke")');
    const revoked=await until(async()=>!(await pack(CYMATIC)).trusted,10000);
    const stopped=await until(async()=>(await frames(page))===0,10000);
    await wait(2500);
    const stage=await page.evaluate(()=>({stats:!!window.__worldStats?.(),running:window.ResonancePlayer.state.worldStatus.running,remote:window.ResonancePlayer.state.worldStatus.remote,stopped:window.ResonancePlayer.state.worldStatus.stopped}));
    check('Revoke: the confirmation explains it stops at once and the identity continues without it',/stops at once/.test(revokeText)&&/without the pack/.test(revokeText),'');
    check('Revoke: approval withdrawn, the pack frame is gone, the stage keeps running (built-in world)',revoked&&stopped&&stage.running&&!stage.remote&&stage.stats,JSON.stringify(stage));
    const callout=await page.evaluate(()=>({retry:!!document.getElementById('pkRetry'),text:document.querySelector('.pk-banner')?.innerText||''}));
    check('stopped pack: a callout with the reason and Retry (nothing restarts by itself)',callout.retry&&/approval was revoked/i.test(callout.text),callout.text.replace(/\s+/g,' ').slice(0,160));
    await shot(page,'stopped-1440x900');
    await page.click('.pk-banner #pkRetry');await wait(2500);
    const afterRetry=await page.evaluate(()=>({stopped:window.ResonancePlayer.state.worldStatus.stopped,frames:document.querySelectorAll('iframe.pack-frame').length,notice:window.ResonancePlayer.state.worldStatus.notice}));
    check('Retry: the stop is cleared; an unapproved pack still does not run',!afterRetry.stopped&&afterRetry.frames===0&&/not approved/.test(afterRetry.notice||''),JSON.stringify(afterRetry));
    // ---- Approve again, then modify an installed file: it stops and can no longer be approved ----------------------------
    await page.click(`.pk-row[data-id="${CYMATIC}"]`);await page.click('#pkReviewBtn');await page.waitForSelector('#pkAllowBtn');await page.click('#pkAllowBtn');
    const again=await until(async()=>(await frames(page))>0,30000);
    check('approved again: it runs again',again,'');
    fs.appendFileSync(path.join(env.dir,'packs',CYMATIC,'shaders','sky.frag'),'\n// modified after approval\n');
    const t0=Date.now();
    const problems=await until(async()=>/Has problems/.test(await rowText(page,CYMATIC)||''),25000);
    measurements.modifiedNoticedMs=Date.now()-t0;
    const mod=await pack(CYMATIC);
    const stoppedMod=await until(async()=>(await frames(page))===0,10000);
    check('modified file: listed with problems (GET /api/packs ok:false, trusted:false)',problems&&mod&&!mod.ok&&!mod.trusted&&mod.problems.some(p=>/modified after install/.test(p)),`${measurements.modifiedNoticedMs} ms; ${mod?.problems?.join('; ')}`);
    check('modified file: a running pack stops (no pack frame)',stoppedMod&&await page.evaluate(()=>/files changed/.test(window.ResonancePlayer.state.worldStatus.stopped?.reason||window.ResonancePlayer.state.worldStatus.notice||'')),'');
    await page.click(`.pk-row[data-id="${CYMATIC}"]`);await wait(300);
    const modInsp=await page.evaluate(()=>({review:!!document.getElementById('pkReviewBtn'),use:document.getElementById('pkUseBtn')?.disabled,text:document.querySelector('.pk-inspector').innerText}));
    check('modified file: it cannot be approved or used here, and the inspector says why',!modInsp.review&&modInsp.use===true&&/cannot run or be approved/.test(modInsp.text)&&/modified after install/.test(modInsp.text),'');
    const forced=await page.evaluate(async id=>{const p=window.ResonancePlayer.state.packs.find(x=>x.id===id);try{await window.ResonancePlayer.setTrust(p,true);}catch(e){return 'refused: '+e.message;}return 'accepted';},CYMATIC);
    await wait(500);
    check('modified file: even a direct approval request leaves it unapproved and not running',!(await pack(CYMATIC)).trusted&&(await frames(page))===0,`trust request ${forced}`);
    // ---- Refused imports ------------------------------------------------------------------------------------------------
    await page.click('#pkImportBtn');await page.waitForSelector('#pkZipInput',{state:'attached'});
    const evil=zip([{name:'pack.json',data:fs.readFileSync(path.join(REPO,'packs/examples/ember-observatory/pack.json'))},{name:'../evil.js',data:Buffer.from('export const x=1;\n')}]);
    await page.setInputFiles('#pkZipInput',{name:'traversal.zip',mimeType:'application/zip',buffer:evil});
    await page.waitForSelector('.modal .pk-import-out .callout.danger',{timeout:10000});
    const refused=await page.evaluate(()=>document.querySelector('.modal .pk-import-out').innerText);
    check('path traversal zip: refused with the reason, nothing shown for install',/refused because an entry is unsafe/.test(refused)&&/"\.\." are not allowed/.test(refused)&&!(await page.$('#pkReport')),refused.replace(/\s+/g,' ').slice(0,200));
    const before=w1.requests.filter(r=>r==='POST /api/packs/import').length;
    await page.setInputFiles('#pkZipInput',{name:'huge.zip',mimeType:'application/zip',buffer:Buffer.alloc(13*1024*1024)});
    await page.waitForFunction(()=>/too large/.test(document.querySelector('.modal .pk-import-out')?.innerText||''),null,{timeout:5000}).catch(()=>{});
    check('a 13 MB archive is refused in the page before any upload',/archive is too large/.test(await page.evaluate(()=>document.querySelector('.modal .pk-import-out').innerText))&&w1.requests.filter(r=>r==='POST /api/packs/import').length===before,'');
    await page.keyboard.press('Escape');
    check('no quarantined import is left behind',!fs.existsSync(path.join(env.dir,'packs','.quarantine'))||fs.readdirSync(path.join(env.dir,'packs','.quarantine')).length===0,'');
    // ---- Remove -----------------------------------------------------------------------------------------------------
    await page.click(`.pk-row[data-id="${CYMATIC}"]`);await page.click('#pkRemoveBtn');await page.waitForSelector('.modal .modal-foot');
    const removeText=await page.evaluate(()=>document.querySelector('.modal').innerText);
    await page.click('.modal .modal-foot button:has-text("Remove")');
    const gone=await until(async()=>!(await pack(CYMATIC)),10000);
    check('Remove: the confirmation says how many projects use it and that they keep their identity',/1 project uses it/.test(removeText)&&/keeps its identity/.test(removeText),removeText.replace(/\s+/g,' ').slice(0,200));
    check('Remove: gone from GET /api/packs and from the library',gone&&await until(()=>page.evaluate(id=>!document.querySelector(`.pk-row[data-id="${id}"]`),CYMATIC),5000),'');
    check('second window: the removal reaches it through the change feed',await w2.page.waitForFunction(id=>!document.querySelector(`.pk-row[data-id="${id}"]`),CYMATIC,{timeout:15000}).then(()=>true,()=>false),'');
    await wait(2000);
    check('after removal the stage keeps running without the pack',await page.evaluate(()=>window.ResonancePlayer.state.worldStatus.running&&!document.querySelector('iframe.pack-frame')),'');
    measurements.expectedImportRefusalsLogged=w1.expected.length;
    measurements.otherWorkspaceErrors=w1.others;if(w1.others.length)console.log(`NOTE  ${w1.others.length} error(s) while another workspace was shown (not this suite's): ${w1.others.slice(0,2).join(' | ')}`);
    check('no console or page errors in the Visual Packs workspace (window 1)',!w1.errors.length,w1.errors.slice(0,3).join(' | '));
    check('no console or page errors (window 2)',!w2.errors.length,w2.errors.slice(0,3).join(' | '));
  }catch(e){check('the qualification ran to the end',false,e.stack||e.message);}
  finally{await browser.close().catch(()=>{});await env.stop().catch(()=>{});}
  const failed=checks.filter(c=>!c.pass).length;
  await fsp.writeFile(path.join(OUT,'packs.json'),JSON.stringify({suite:'ui/workspaces/packs',at:new Date().toISOString(),passed:checks.length-failed,failed,checks,measurements,screenshots:shots},null,1));
  console.log(`\n${checks.length-failed}/${checks.length} passed · report: ${path.relative(REPO,path.join(OUT,'packs.json'))}`);
  process.exitCode=failed?1:0;
})();

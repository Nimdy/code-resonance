'use strict';
// Real-browser qualification of the Connections workspace on an isolated installation (never ~/.code-resonance):
// receiver facts equal GET /api/status, capture states follow the real evidence (lumen's recorded journal, the sample
// project's 0.5 report, a project with agent events only), nothing claims to change VS Code, and the Claude Code hook
// flow round-trips on a temporary folder (checked on disk), including the "file changed meanwhile" refusal.
// Usage: node qualification/ui/workspaces/connections.qual.js [--port 4185]
const path=require('node:path');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const REPO=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(REPO,'qualification/node_modules/playwright-core'));
const {createEnvironment}=require('../environment.js');
const {sha}=require(path.join(REPO,'receiver/protocol'));
const {EVENTS}=require(path.join(REPO,'scripts/hooks/install-claude-code.js'));
const OUT=path.join(REPO,'qualification/results/ui');
const args=process.argv.slice(2),PORT=Number(args[args.indexOf('--port')+1]||0)||4185;
const checks=[];const shots=[];
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);}
const until=async(page,fn,arg,timeout=15000)=>{try{await page.waitForFunction(fn,arg,{timeout});return true;}catch{return false;}};
const TOKENISH=/\b[0-9a-f]{64}\b/i;
(async()=>{
  await fsp.mkdir(OUT,{recursive:true});
  const env=await createEnvironment({port:PORT});
  const {url,svc,projects}=env,auth={Authorization:`Bearer ${svc.token}`};
  const post=async events=>{const r=await fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({events})});if(r.status!==202)throw new Error(await r.text());};
  const flush=id=>fetch(url+`/v1/flush?id=${id}`,{method:'POST',headers:auth});
  const json=async u=>(await fetch(url+u)).json();
  // A project with agent events only: no editor session at all.
  const agentOnly=sha('code-resonance-ui-qualification/agent-only');let n=0;
  const agentEv=(kind,provider,meta={})=>({v:1,id:`conn-qual-${String(++n).padStart(6,'0')}`,ts:Date.now(),kind,projectId:agentOnly,sessionId:`qual-${provider}`,origin:'hook',meta:{provider,source:'explicit-hook',...meta}});
  await post([agentEv('agent.session.started','qual-agent'),agentEv('agent.tool.started','qual-agent',{tool:'Edit'}),agentEv('agent.tool.completed','qual-agent',{tool:'Edit'})]);await flush(agentOnly);
  for(let i=0;i<40&&!(await json('/api/projects')).projects.some(p=>p.id===agentOnly);i++)await new Promise(r=>setTimeout(r,250));
  const claudeDir=await fsp.mkdtemp(path.join(os.tmpdir(),'cr-claude-qual-'));
  const settingsFile=path.join(await fsp.realpath(claudeDir),'.claude','settings.local.json');
  const original={permissions:{allow:['Bash(ls:*)'],deny:[]},env:{QUAL_KEEP:'1'},hooks:{PreToolUse:[{matcher:'Bash',hooks:[{type:'command',command:'echo kept'}]}]},model:'kept'};
  await fsp.mkdir(path.dirname(settingsFile),{recursive:true});await fsp.writeFile(settingsFile,JSON.stringify(original,null,2)+'\n');
  const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  // Chrome logs every HTTP refusal as a console error; the refusals this script provokes on purpose (a missing folder:
  // 400, a file changed meanwhile: 409) are expected only while `expecting` is set, and are reported separately.
  const errors=[],expected=[];let expecting=null;
  const open=async(viewport,hash='#/connections')=>{const page=await browser.newPage({viewport});
    page.on('console',m=>{if(m.type()!=='error')return;const t=m.text();if(expecting&&new RegExp(`status of ${expecting} `).test(t))expected.push(t);else errors.push(t);});page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`${url}/${hash}`);await until(page,()=>!!document.querySelector('[data-k="version"]')&&!!document.querySelector('.conn-row'));return page;};
  const shot=async(page,name)=>{const f=path.join(OUT,`connections-${name}.png`);await page.screenshot({path:f});shots.push(path.relative(REPO,f));};
  const pageText=page=>page.evaluate(()=>[document.body.innerText,...[...document.querySelectorAll('input,textarea')].map(i=>i.value)].join('\n'));
  const choose=async(page,id)=>{await page.focus(`.conn-row[data-project="${id}"]`);await page.keyboard.press('Enter');
    return until(page,id=>document.querySelector(`.conn-row[data-project="${id}"]`)?.getAttribute('aria-current')==='true'&&!!document.querySelector('#connEditorState'),id);};
  const stateOf=page=>page.evaluate(()=>({state:document.querySelector('#connEditorState')?.dataset.state,label:document.querySelector('#connEditorState')?.innerText.trim(),
    detail:document.querySelector('#connEditorDetail')?.innerText||'',body:document.querySelector('.conn-detail')?.innerText||''}));
  try{
    const page=await open({width:1440,height:900});
    // ---- Receiver ----
    const status=await json('/api/status');
    const shown=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-k]')].map(e=>[e.dataset.k,e.textContent])));
    check('receiver version equals GET /api/status',shown.version===status.version,`${shown.version} / ${status.version}`);
    check('receiver address is this page’s origin with the status port',shown.address===`http://127.0.0.1:${status.port}`,shown.address);
    check('projects count equals GET /api/status',shown.projects===`${status.projects} project${status.projects===1?'':'s'}`,`${shown.projects} / ${status.projects}`);
    check('visual packs equal GET /api/status',shown.packs===`${status.packs.installed} installed`,shown.packs);
    check('loopback-only stated as in GET /api/status',status.loopbackOnly===true&&shown.network==='This computer only (loopback)',shown.network);
    check('worker errors shown as reported',/no errors/.test(shown.worker)===(status.worker.errors===0),shown.worker);
    // ---- Data location (capability) and no secrets ----
    const dataShown=await page.evaluate(()=>document.querySelector('.conn-data code')?.textContent||null);
    check('data location appears, labelled on this computer',dataShown===svc.dataDir&&(await page.evaluate(()=>document.querySelector('.conn-data')?.innerText.includes('On this computer'))),
      dataShown?dataShown:`not shown: ${await page.evaluate(()=>document.querySelector('.conn-data')?.innerText.replace(/\s+/g,' '))}`);
    let text=await pageText(page);
    check('no token-like string (64 hex) in the page text',!TOKENISH.test(text)&&!text.includes(svc.token),TOKENISH.exec(text)?.[0]||'');
    await shot(page,'overview-1440');
    // ---- VS Code: lumen (a real recorded journal) ----
    const lumenEv=await json(`/api/evidence?id=${projects.lumen}`);
    await choose(page,projects.lumen);let s=await stateOf(page);
    check('lumen: state from its journal (stopped)',lumenEv.editor.capture.state==='stopped'&&s.state==='stopped'&&/Capture stopped at/.test(s.detail),`${s.label}; ${s.detail}`);
    check('lumen: extension version not reported (older than 0.5)',lumenEv.editor.reported===null&&s.body.includes('Not reported (extension older than 0.5)'));
    check('lumen: no reported settings claimed',await page.evaluate(()=>[...document.querySelectorAll('[data-reported]')].every(e=>e.textContent.startsWith('Not reported'))));
    // ---- VS Code: the sample project (extension 0.5 report) ----
    const sampleEv=await json(`/api/evidence?id=${projects.sample}`);
    await choose(page,projects.sample);s=await stateOf(page);
    const expectState=sampleEv.editor.capture.state==='started'?(Date.now()-sampleEv.editor.lastAt<120000?'running':'quiet'):sampleEv.editor.capture.state;
    check('sample: capture state follows the evidence',s.state===expectState||(expectState==='running'&&s.state==='quiet'),`${s.state} (expected ${expectState})`);
    check('sample: extension 0.5.0 reported',s.body.includes('Extension 0.5.0'));
    const reported=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-reported]')].map(e=>[e.dataset.reported,e.firstChild.textContent])));
    const want={captureTerminalCommands:'Off',capturePromptText:'Off',includeHidden:'Off',captureDocumentContents:'On',shareProjectName:'On',baselineFileLimit:'450',receiverPort:String(svc.port)};
    check('sample: reported settings match what the environment posted',Object.entries(want).every(([k,v])=>reported[k]===v),JSON.stringify(reported));
    check('sample: report time and kind shown (at capture start)',/Reported by extension 0\.5\.0 on .* at capture start/.test(await page.textContent('#connReportedAt')));
    check('sample: privacy-sensitive settings explained',await page.evaluate(()=>['captureTerminalCommands','capturePromptText','includeHidden','captureDocumentContents','shareProjectName'].every(k=>document.querySelector(`[data-setting="resonance.${k}"]`)?.classList.contains('private'))));
    check('Claude Code observed for the sample project',(await page.textContent('#connClaudeProjects')).includes('sample-app (test project)'));
    // Nothing that looks like it changes VS Code.
    const vs=await page.evaluate(()=>{const s=document.getElementById('conn-vscode');return {inputs:s.querySelectorAll('input,select,textarea,[role="switch"],[role="checkbox"]').length,
      href:document.getElementById('connOpenVsSettings')?.getAttribute('href'),text:s.innerText};});
    const integ=await json('/api/integrations');
    check('VS Code section has no control that edits a setting',vs.inputs===0,`${vs.inputs} inputs`);
    check('Open settings link is the extension’s URI',vs.href===integ.vscode.openSettingsUri&&vs.href==='vscode://zerobandwidth.code-resonance/settings',vs.href);
    text=await pageText(page);
    check('never claims a change in VS Code',!/(saved|written|applied|changed|updated) (it )?(to|in) VS Code|VS Code (setting )?(was|has been) (changed|updated)/i.test(text)&&/Nothing changes here until VS Code reports it/.test(text));
    await shot(page,'vscode-sample-1440');
    // ---- A project with agent events only ----
    await choose(page,agentOnly);s=await stateOf(page);
    check('agent-only project: "No VS Code capture observed"',s.state==='none'&&s.label==='No VS Code capture observed',`${s.state}: ${s.label}`);
    check('agent-only project: provider listed from evidence',await until(page,()=>!!document.querySelector('#connProviders [data-provider="qual-agent"]')));
    // The fictional demonstration carries the same warning-coloured label as everywhere else in the Control Center.
    await choose(page,projects.demo);
    const demoPills=await page.evaluate(()=>[...document.querySelectorAll('.ws-connections .pill')].filter(e=>e.textContent==='Demonstration (fictional)').map(e=>e.className));
    check('demonstration labelled fictional, in the warning colour',demoPills.length>0&&demoPills.every(c=>/\bwarn\b/.test(c)&&!/\b(accent|live)\b/.test(c)),demoPills.join(' | '));
    await choose(page,agentOnly);
    // ---- Keyboard: the strip jumps to a section ----
    await page.focus('.conn-seg[data-seg="claude"]');await page.keyboard.press('Enter');
    check('overview strip moves focus to the section (keyboard)',await until(page,()=>document.activeElement===document.querySelector('#conn-claude h2'),null,3000));
    // The app's own motion setting wins over the system's: with "Reduce" set, the jump does not animate.
    const behaviors=await page.evaluate(()=>{const seen=[],orig=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(o){seen.push(o?.behavior);};
      const el=document.querySelector('.conn-seg[data-seg="agents"]'),prev=document.documentElement.dataset.motion;
      document.documentElement.dataset.motion='reduce';el.click();document.documentElement.dataset.motion='full';el.click();
      if(prev===undefined)delete document.documentElement.dataset.motion;else document.documentElement.dataset.motion=prev;Element.prototype.scrollIntoView=orig;return seen;});
    check('section jump follows the app’s motion setting',behaviors[0]==='auto'&&behaviors[1]==='smooth',JSON.stringify(behaviors));
    // ---- Second window converges through the change feed ----
    const other=await open({width:1280,height:720},`#/connections/${agentOnly}`);
    await post([agentEv('agent.session.started','qual-agent-two')]);await flush(agentOnly);
    const both=await Promise.all([page,other].map(p=>until(p,()=>!!document.querySelector('#connProviders [data-provider="qual-agent-two"]'),null,20000)));
    check('both windows show a newly observed provider without reload',both.every(Boolean),String(both));
    // A capture starting with a non-default setting reaches the other window as reported (not as a guess).
    const sid=`qual-editor-${Date.now()}`;
    await post([{v:1,id:`conn-qual-${String(++n).padStart(6,'0')}`,ts:Date.now(),kind:'workspace.started',projectId:agentOnly,sessionId:sid,origin:'unknown',name:'agent-only (test project)',
      meta:{extensionVersion:'0.5.0',remote:'wsl',includeHidden:false,captureDocumentContents:true,captureTerminalCommands:true,capturePromptText:false,shareProjectName:true,baselineFileLimit:450,receiverPort:svc.port}}]);await flush(agentOnly);
    const conv=await until(other,()=>document.querySelector('#connEditorState')?.dataset.state==='running'&&document.querySelector('[data-reported="captureTerminalCommands"]')?.firstChild.textContent==='On',null,20000);
    check('second window: capture start and reported setting converge',conv,await other.evaluate(()=>document.querySelector('#connEditorState')?.dataset.state));
    check('second window: remote window kind shown as reported',(await other.textContent('.conn-detail')).includes('Remote: wsl'));
    await shot(other,'vscode-converged-1280');
    // ---- Claude Code hooks: plan, write, remove; the file on disk ----
    await page.fill('#connClaudePath','relative/folder');await page.keyboard.press('Enter');
    check('relative path refused in place',await until(page,()=>document.querySelector('#connClaudePath').getAttribute('aria-invalid')==='true'&&/absolute path/.test(document.querySelector('#connClaudePathError').textContent),null,3000));
    await page.fill('#connClaudePath',path.join(claudeDir,'does-not-exist'));expecting=400;await page.keyboard.press('Enter');
    check('missing folder: the receiver’s refusal shown at the field',await until(page,()=>/This folder does not exist/.test(document.querySelector('#connClaudePathError').textContent),null,8000));
    await page.waitForTimeout(200);expecting=null;
    await page.fill('#connClaudePath',claudeDir);await page.keyboard.press('Enter');
    check('Show the change: file path shown',await until(page,f=>document.querySelector('#connClaudeFile')?.textContent===f,settingsFile,8000));
    const diff=await page.evaluate(()=>({add:document.querySelectorAll('.diff-line.add').length,del:document.querySelectorAll('.diff-line.del').length}));
    check('install diff adds lines and is computed from the real file',diff.add>EVENTS.length&&diff.del>=0,JSON.stringify(diff));
    check('nothing written before "Write this change"',fs.readFileSync(settingsFile,'utf8')===JSON.stringify(original,null,2)+'\n');
    await page.fill('#connClaudePath',claudeDir);await page.keyboard.press('Enter');await until(page,()=>!!document.querySelector('#connClaudeWrite'),null,8000);
    await shot(page,'claude-plan-1440');
    check('plan view renders no stray null/undefined text',!(await page.evaluate(()=>[...document.querySelector('#connClaudePlan').childNodes].some(n=>n.nodeType===3&&/^(null|undefined)$/.test(n.textContent.trim())))));
    await page.click('#connClaudeWrite');
    await until(page,()=>!!document.querySelector('#connClaudeResult'),null,8000);
    let disk=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
    const adapterCmd=`node ${JSON.stringify(path.join(REPO,'scripts','hooks','claude-code.js'))}`;
    const hooked=s=>EVENTS.every(e=>(s.hooks?.[e]||[]).some(g=>(g.hooks||[]).some(x=>x.command===adapterCmd)));
    check('write: hooks for every event on disk',hooked(disk));
    check('write: the file’s other settings untouched',JSON.stringify(disk.permissions)===JSON.stringify(original.permissions)&&disk.env.QUAL_KEEP==='1'&&disk.model==='kept'
      &&disk.hooks.PreToolUse.some(g=>g.matcher==='Bash'&&g.hooks[0].command==='echo kept'));
    check('write: result states the file written',(await page.textContent('#connClaudeResult')).includes(settingsFile));
    // Remove (chosen with the keyboard in the segmented control).
    await page.focus('#connClaudeAction [aria-checked="true"]');await page.keyboard.press('ArrowRight');
    check('action switched to remove with the keyboard',await page.evaluate(()=>document.querySelector('#connClaudeAction').value==='remove'));
    await page.click('#connClaudeShow');await until(page,()=>!!document.querySelector('#connClaudeWrite'),null,8000);
    await page.click('#connClaudeWrite');await until(page,()=>!!document.querySelector('#connClaudeResult'),null,8000);
    disk=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
    check('remove: the file equals the original again',JSON.stringify(disk)===JSON.stringify(original),JSON.stringify(disk).slice(0,160));
    // The file changes between showing and writing: refused, nothing written, shown again on request.
    await page.focus('#connClaudeAction [aria-checked="true"]');await page.keyboard.press('ArrowLeft');
    await page.click('#connClaudeShow');await until(page,()=>!!document.querySelector('#connClaudeWrite'),null,8000);
    const meanwhile={...original,addedMeanwhile:true};fs.writeFileSync(settingsFile,JSON.stringify(meanwhile,null,2)+'\n');
    expecting=409;await page.click('#connClaudeWrite');
    check('changed meanwhile: refused with "show the change again"',await until(page,()=>/The file changed meanwhile/.test(document.querySelector('#connClaudePlan').textContent)&&!!document.querySelector('#connClaudeAgain'),null,8000));
    expecting=null;
    check('changed meanwhile: nothing written',!hooked(JSON.parse(fs.readFileSync(settingsFile,'utf8'))));
    await page.click('#connClaudeAgain');await until(page,()=>!!document.querySelector('#connClaudeWrite'),null,8000);
    await page.click('#connClaudeWrite');await until(page,()=>!!document.querySelector('#connClaudeResult'),null,8000);
    disk=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
    check('after showing again: written, keeping the meanwhile change',hooked(disk)&&disk.addedMeanwhile===true);
    // ---- Browser storage never holds the typed folder (it names a private project); the route survives a reload ----
    const stored=await page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);}for(let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i);o['session:'+k]=sessionStorage.getItem(k);}return JSON.stringify(o);});
    check('the typed project folder is not kept in browser storage',!stored.includes(path.basename(claudeDir))&&!stored.includes('connectionsClaudePath'),stored.includes(path.basename(claudeDir))?'found in storage':'');
    await page.reload();await until(page,()=>!!document.querySelector('#connEditorState'));
    check('after reload: the focused project is kept, the folder field starts empty',await page.evaluate(id=>document.querySelector(`.conn-row[data-project="${id}"]`)?.getAttribute('aria-current')==='true'&&document.querySelector('#connClaudePath').value==='',agentOnly));
    text=await pageText(page);
    // A null or undefined that reached the DOM as text (outside file contents) would be a rendering bug shown to people.
    const stray=await page.evaluate(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const out=[];let n;
      while((n=w.nextNode()))if(/^(null|undefined|NaN|\[object Object\])$/.test(n.textContent.trim())&&!n.parentElement.closest('.diff,pre,code'))out.push(n.textContent.trim());return out;});
    check('no stray null/undefined text rendered',!stray.length,stray.join(','));
    check('no token-like string after all actions',!TOKENISH.test(text),TOKENISH.exec(text)?.[0]||'');
    // ---- Layouts ----
    await page.setViewportSize({width:1280,height:720});await page.goto(`${url}/#/connections/${projects.sample}`);await until(page,()=>!!document.querySelector('#connEditorState'));await page.waitForTimeout(600);
    await shot(page,'overview-1280');
    const narrow=await open({width:900,height:800},`#/connections/${projects.sample}`);await narrow.waitForTimeout(600);
    check('900 px: no horizontal overflow',await narrow.evaluate(()=>{const p=document.querySelector('.page');return p.scrollWidth<=p.clientWidth+1;}));
    await shot(narrow,'overview-900');
    await narrow.evaluate(()=>document.getElementById('conn-vscode').scrollIntoView());await narrow.waitForTimeout(300);await shot(narrow,'vscode-900');
    check('no console or page errors (besides the 2 refusals provoked on purpose)',errors.length===0&&expected.length===2,`${errors.slice(0,3).join(' | ')}${expected.length!==2?` expected refusals logged: ${expected.length}: ${expected.join(' | ')}`:''}`);
  }catch(e){check('qualification ran to the end',false,e.stack||e.message);}
  finally{await browser.close().catch(()=>{});await env.stop();await fsp.rm(claudeDir,{recursive:true,force:true});}
  const failed=checks.filter(c=>!c.pass).length;
  fs.writeFileSync(path.join(OUT,'connections.json'),JSON.stringify({at:new Date().toISOString(),passed:checks.length-failed,failed,checks,screenshots:shots},null,2));
  console.log(`\n${checks.length-failed}/${checks.length} passed · report qualification/results/ui/connections.json`);
  process.exitCode=failed?1:0;
})();

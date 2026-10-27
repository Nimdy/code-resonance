// Home: at a glance, whether Code Resonance is working, which project is active and whether its capture is really
// running, what needs attention, and the way to the Stage. On a first run it is a setup guide derived from what the
// receiver actually observes, so it can be left and resumed at any step. Capture state is built from evidence only:
// a past event is never presented as proof that capture runs now.
import {h,text,button,section,pill,callout,emptyState,copyable,toast,styles} from '../dom.js';
import {icon} from '../icons.js';
import {ago,projectName,timecode,WORLD_NAMES} from '../format.js';
import {capture,when,providerName,lastActivity,isDemo,DEMO_LABEL,familyLine,LIVE_MS,START_CMD} from './projects.js';
// WebGL2 is checked once per page on a throwaway canvas whose context is released at once.
let webgl2=null;
function hasWebgl2(){if(webgl2===null)try{const g=document.createElement('canvas').getContext('webgl2');webgl2=!!g;g?.getExtension('WEBGL_lose_context')?.loseContext();}catch{webgl2=false;}return webgl2;}
// Rebuilding a small region must not lose the keyboard position: the focused control is found again by its key.
function swap(el,nodes){const k=el.contains(document.activeElement)?document.activeElement.closest('[data-fk]')?.dataset.fk:null;el.replaceChildren(...nodes.filter(Boolean));if(k)el.querySelector(`[data-fk="${CSS.escape(k)}"]`)?.focus({preventScroll:true});}
const fk=k=>({'data-fk':k});
export default {mount(view,ctx){
  styles('home');
  const {store:S,player:P,navigate,chrome,stageUrl}=ctx;const offs=[];
  const openStage=()=>{S.setUi({stageOpened:true});navigate('stage');};
  const openWindow=()=>{S.setUi({stageOpened:true});window.open(stageUrl(),'_blank','noopener');};
  // ---- Layout ------------------------------------------------------------------------------------------------
  const sys=h('div',{class:'home-sys','aria-label':'System status'});
  const head=h('div',{class:'page-head home-head'},h('div',{class:'grow'},h('span',{class:'eyebrow',text:'Code Resonance'}),h('h1',{class:'title-l',text:'Home'})),sys);
  // The stage slot exists from the start (the shell finds it once, at mount); it is only hidden on a first run.
  const slot=h('div',{class:'stage-slot home-slot','data-stage-slot':''});
  const projectEl=h('div',{class:'home-project'});
  const hero=h('section',{class:'home-hero','aria-label':'Active project'},h('div',{class:'home-slot-wrap'},slot),projectEl);
  const loading=h('p',{class:'faint small',text:'Connecting to the receiver…'});
  const guideTop=h('div'),guideBottom=h('div'),firstEmpty=h('div');
  const attention=h('div',{class:'home-attention'}),recent=h('div',{class:'home-recent'});
  const lower=h('div',{class:'home-lower'},
    section({title:'Needs attention'},attention),
    section({title:'Recent projects',actions:[button({label:'All projects',icon:'projects',kind:'ghost',size:'sm',onClick:()=>navigate('projects'),attrs:fk('all-projects')})]},recent));
  view.append(h('div',{class:'page ws-home'},h('div',{class:'page-inner'},head,loading,hero,firstEmpty,guideTop,lower,guideBottom)));
  // Over the stage: whether it is live or replaying, and a preview's label (the world stays clickable elsewhere).
  const modeBadge=h('span',{class:'pill plain'}),previewBadge=h('span',{class:'pill accent',text:'Preview · not saved'});
  const overlay=h('div',{class:'chrome-pass home-chrome'},h('div',{class:'slot-badge'},modeBadge,previewBadge));
  chrome.append(overlay);
  // ---- System line: is Code Resonance itself working? ---------------------------------------------------------
  function renderSys(){
    const s=P.state,st=S.state,status=st.status,feed=st.changes,gl=hasWebgl2()&&!(s.world==='living'&&s.worldStatus.failed);
    const item=(tone,label,title)=>h('span',{class:'sys-item',title},h('span',{class:`dot ${tone}`}),label);
    swap(sys,[
      s.receiver===false?item('danger','Receiver offline','The local receiver does not answer. Start it with npm start.'):s.receiver?item('ok',`Receiver${status?.version?` ${status.version}`:''}`,status?`Running on port ${status.port}${status.loopbackOnly?', reachable from this computer only':''}`:'The receiver answers'):item('','Connecting',''),
      s.receiver===false?null:feed==='open'?item('ok','Live updates','Changes made in other windows and by the receiver appear here at once'):item('warn','Reconnecting','The change feed is reconnecting; values refresh every few seconds meanwhile'),
      item(gl?'ok':'warn',gl?'WebGL2':'No living world',gl?'The living world can render in this browser':'The Stage falls back to The Construct in this browser'),
      item(s.sound.enabled?'ok':'',s.sound.enabled?'Sound on':'Sound off',s.sound.enabled?'Music plays in this window':'Browsers start sound only after a click')]);
  }
  // ---- The active project ---------------------------------------------------------------------------------------
  function statusLines(pr){
    const s=P.state,st=S.state,full=st.evidence.get(pr.id),ev=pr.evidence,cap=capture(ev,full),now=Date.now();
    const line=(tone,main,sub=null,key='')=>h('li',{dataset:{status:key}},h('span',{class:`dot ${tone}`}),h('div',{},h('span',{text:main}),sub?h('span',{class:'faint small',text:sub}):null));
    const out=[];
    out.push(s.receiver===false?line('danger','Receiver disconnected','Start it again with npm start. What follows is as of the last answer.','receiver')
      :s.receiver?line(st.changes==='open'?'ok':'warn','Receiver available',st.changes==='open'?'Changes arrive as they happen':'Reconnecting to its change feed','receiver'):line('','Connecting to the receiver…',null,'receiver'));
    const reported=full&&!full.building?full.editor?.reported:null;
    const extension=cap.key==='unknown'||cap.key==='none'?null:isDemo(pr)?'Fictional capture events written by the demo, not by VS Code':reported?`VS Code capture observed · extension ${reported.extensionVersion||'?'} reported its settings ${ago(reported.at)}`:ev?.editor?.version?`VS Code capture observed · extension ${ev.editor.version}`:'VS Code capture observed · this extension version does not report its settings';
    out.push(line(cap.key==='running'?'ok':cap.key==='quiet'?'warn':'',cap.line,extension,`capture-${cap.key}`));
    const last=ev?.lastReceivedAt;
    out.push(last?line(now-last<LIVE_MS?'accent':'',now-last<LIVE_MS?`Events received ${ago(last)}`:`Project idle · last events received ${ago(last)}`,when(last),'events'):line('','No events received yet',null,'events'));
    const agents=[...(ev?.agents||[])].sort((a,b)=>(b.lastAt||0)-(a.lastAt||0));
    out.push(agents.length?line('agent',`Agent activity observed: ${agents.map(a=>`${providerName(a.provider)} ${ago(a.lastAt)}`).join(', ')}`,isDemo(pr)?'Fictional agent events written by the demo':'Through hooks: sessions, tools and files only','agents'):line('','No agent activity observed',null,'agents'));
    return out;
  }
  function renderProject(){
    const pr=S.project();
    if(!pr){swap(projectEl,[h('div',{class:'home-project-empty'},h('span',{class:'eyebrow',text:'Active project'}),h('p',{class:'muted',text:'No project is selected. Choose one from Recent projects or the project menu above.'}))]);return;}
    const r=P.state.project===pr.id&&P.state.recipe?P.state.recipe:pr.recipe,e=S.effective(),world=e.world;
    const visual=world==='living'?`${r?.familyName||r?.family||'Living world'}${r?` · ${familyLine(r)}`:''}`:WORLD_NAMES[world]||world;
    swap(projectEl,[
      h('div',{class:'home-project-top'},h('span',{class:'eyebrow',text:'Active project'}),isDemo(pr)?pill(DEMO_LABEL,'warn'):null),
      h('h2',{class:'title-l home-name',id:'homeProjectName',text:projectName(pr),title:projectName(pr)}),
      h('div',{class:'faint small home-private'},icon('lock'),pr.name?'Private workspace name · never shown on the Stage':'The extension did not share a name: shown by its id'),
      h('dl',{class:'kv home-kv'},h('dt',{text:'Public title'}),h('dd',{class:r?.title?'':'faint',id:'homePublicTitle',text:r?.title?`“${r.title}”`:'No public title — the Stage shows a generic name'}),
        h('dt',{text:world==='living'?'Visual identity':'World'}),h('dd',{text:visual})),
      isDemo(pr)?callout({kind:'warn',icon:'info',body:'Demonstration (fictional): produced by npm run demo on this computer. Nothing in it comes from real work.'}):null,
      h('ul',{class:'home-status',id:'homeStatus','aria-label':'Capture status'},...statusLines(pr)),
      h('div',{class:'home-actions'},
        button({label:'Open Stage',icon:'stage',kind:'primary',size:'lg',id:'homeOpenStage',onClick:openStage,attrs:fk('open-stage')}),
        button({label:'Open in new window',icon:'external',kind:'outline',title:'Open the Stage in a new window (for a second monitor or OBS preview)',onClick:openWindow,attrs:fk('open-window')})),
      h('div',{class:'home-links'},
        button({label:'Visual Studio',icon:'visual',kind:'ghost',size:'sm',onClick:()=>navigate('visual'),attrs:fk('visual')}),
        button({label:'Music Studio',icon:'music',kind:'ghost',size:'sm',onClick:()=>navigate('music'),attrs:fk('music')}),
        button({label:'Project details',icon:'chevron-right',kind:'ghost',size:'sm',onClick:()=>navigate('projects',pr.id),attrs:fk('details')}))]);
  }
  function renderChrome(){
    const s=P.state;text(modeBadge,s.mode==='live'?'Live · about 10 s behind':`Replay ${s.playing?'▶':'❚❚'} ${timecode(s.position.now-s.position.start)}`);
    modeBadge.className=`pill ${s.mode==='live'?'accent live':'plain'}`;previewBadge.hidden=!s.preview;
  }
  // ---- Needs attention: only real conditions, each with something to do -----------------------------------------
  function attentionItems(){
    const s=P.state,st=S.state,items=[];
    if(s.receiver===false)items.push(callout({kind:'danger',icon:'warn',title:'The receiver is not answering',body:'Start it in a terminal, in the Code Resonance folder (a web page cannot start it). This page reconnects by itself.',actions:[copyable('npm start')]}));
    const pending=(s.packs||[]).filter(x=>x.executable&&x.ok&&!x.trusted);
    if(pending.length)items.push(callout({kind:'warn',icon:'shield',title:`${pending.length===1?'A visual pack awaits':`${pending.length} visual packs await`} your approval`,body:`${pending.map(x=>x.name||x.id).join(', ')}: packs with code run only after you review and approve them.`,
      actions:[button({label:'Review in Visual Packs',size:'sm',onClick:()=>navigate('packs'),attrs:fk('att-packs')})]}));
    const stopped=s.worldStatus.stopped;
    if(stopped)items.push(callout({kind:'warn',icon:'warn',title:`${stopped.name} stopped`,body:`${stopped.reason}. The Stage shows the project’s identity without it.`,
      actions:[button({label:'Retry',icon:'refresh',size:'sm',id:'homeRetryPack',onClick:()=>{if(!P.retryPack())toast('The pack is no longer stopped.','info');},attrs:fk('att-retry')}),button({label:'Visual Packs',kind:'ghost',size:'sm',onClick:()=>navigate('packs'),attrs:fk('att-packs2')})]}));
    const noGl=!hasWebgl2(),failed=s.world==='living'&&s.worldStatus.failed;
    if(noGl||failed)items.push(callout({kind:'warn',icon:'cpu',title:noGl?'WebGL2 is unavailable in this browser':'The living world could not start in this window',
      body:`${noGl?'Without WebGL2':'Until it can'}, the Stage shows The Construct instead of the project’s living world. Turning on hardware acceleration in the browser helps; choosing Quality · Low in Settings asks less of the graphics card.`,
      actions:[button({label:'Settings',icon:'settings',size:'sm',onClick:()=>navigate('settings'),attrs:fk('att-gl')})]}));
    if(!s.recording.supported.ok)items.push(callout({kind:'',icon:'record',title:'Recording is not available in this browser',body:s.recording.supported.reason||'This browser cannot record the stage.',
      actions:[button({label:'Record & Broadcast',size:'sm',kind:'ghost',onClick:()=>navigate('output'),attrs:fk('att-rec')})]}));
    // The most recent real VS Code capture tells which extension is in use now.
    const editors=st.projects.filter(p=>!isDemo(p)&&p.evidence?.editor?.state).sort((a,b)=>(b.evidence.editor.at||0)-(a.evidence.editor.at||0));
    if(editors.length&&!editors[0].evidence.editor.version)items.push(callout({kind:'',icon:'code',title:'The VS Code extension does not report its capture settings',
      body:`Update the VS Code extension to 0.5 to see its capture settings here (last capture: ${projectName(editors[0])}, ${ago(editors[0].evidence.editor.at)}).`,
      actions:[button({label:'How to update',size:'sm',kind:'ghost',onClick:()=>navigate('connections'),attrs:fk('att-ext')})]}));
    if(st.selected&&!s.sound.enabled&&!guideShown())items.push(callout({kind:'',icon:'sound-off',title:'Sound is off in this window',body:'Browsers start sound only after a click, once per visit.',
      actions:[button({label:'Enable sound',icon:'sound-on',size:'sm',id:'homeEnableSound',onClick:()=>P.toggleSound().catch(e=>toast(`Sound could not start: ${e.message}`,'error')),attrs:fk('att-sound')})]}));
    return items;
  }
  // Regions with copyable commands are rebuilt only when what they say changes (activity arrives every second).
  let attentionSig=null,guideSig=null;
  function renderAttention(){
    const items=attentionItems(),sig=items.map(x=>x.textContent).join('|');if(sig===attentionSig)return;attentionSig=sig;
    swap(attention,items.length?items:[h('div',{class:'home-calm'},icon('check'),h('span',{text:'Nothing needs attention.'}))]);
  }
  // ---- Recent projects ------------------------------------------------------------------------------------------
  function renderRecent(){
    const list=[...S.state.projects].sort((a,b)=>(lastActivity(b)||0)-(lastActivity(a)||0)).slice(0,6);
    if(!list.length){swap(recent,[h('p',{class:'faint small',text:'No projects yet.'})]);return;}
    swap(recent,list.map(p=>{const active=p.id===S.state.selected,cap=capture(p.evidence,S.state.evidence.get(p.id)),r=p.recipe;
      return h('button',{type:'button',class:['home-recent-row',active?'active':''],'aria-current':active?'true':null,dataset:{id:p.id,fk:`recent-${p.id}`},title:active?'The active project':'Make this the active project',onClick:()=>S.select(p.id)},
        h('span',{class:`dot ${cap.key==='running'?'ok':''}`}),
        h('span',{class:'grow'},h('span',{class:'name-line'},h('strong',{class:'ellipsis',text:projectName(p)}),isDemo(p)?pill(DEMO_LABEL,'warn',{plain:true}):null),
          h('span',{class:'faint small ellipsis',text:[r?.familyName||'Identity not generated yet',cap.label].join(' · ')})),
        h('span',{class:'small muted num',text:ago(lastActivity(p))}));}));
  }
  // ---- Setup guide (first run, resumable) ------------------------------------------------------------------------
  function steps(){
    const st=S.state,s=P.state,status=st.status,real=st.projects.filter(p=>!isDemo(p)).sort((a,b)=>(lastActivity(b)||0)-(lastActivity(a)||0));
    const receiverOk=s.receiver!==false&&!!status;
    const version=st.integrations?.vscode?.latestVersion||status?.version||null,install=st.integrations?.vscode?.install;
    const editor=real.find(p=>p.evidence?.editor?.state);
    return [
      {id:'receiver',title:'Receiver running',done:receiverOk,summary:receiverOk?`Version ${status.version} on port ${status.port}${status.loopbackOnly?' · this computer only':''}`:'',
        body:[h('p',{text:s.receiver===false?'The receiver does not answer. A web page cannot start it: in a terminal, in the Code Resonance folder, run':'Checking the receiver… If it is not running, start it in a terminal in the Code Resonance folder:'}),copyable('npm start')]},
      {id:'vscode',title:'Connect VS Code',done:!!editor,summary:editor?`VS Code capture observed for ${projectName(editor)}`:'',
        body:[h('ol',{class:'home-cmds'},
          h('li',{},h('span',{text:'Build the extension package (in the Code Resonance folder):'}),copyable(install?.package||'npm run package:vsix')),
          h('li',{},h('span',{text:'Install it into VS Code:'}),version?copyable(install?.install||`code --install-extension code-resonance-${version}.vsix`):h('span',{class:'faint',text:'(the exact file name appears once the receiver answers)'})),
          h('li',{},h('span',{},'In VS Code, open the project, press ',h('kbd',{text:'Ctrl+Shift+P'}),' and run ',h('strong',{text:START_CMD}),'.'))),
          button({label:'More ways to connect',icon:'connections',kind:'ghost',size:'sm',onClick:()=>navigate('connections'),attrs:fk('guide-connections')})]},
      {id:'project',title:'Waiting for the first project',done:real.length>0,summary:real.length?`${projectName(real[0])} · first events received`:'',
        body:[h('p',{class:'home-listen'},h('span',{class:`dot ${st.changes==='open'?'ok':'warn'}`}),st.changes==='open'?'Listening. The project appears here within seconds of its first events.':'Not listening right now: the change feed is reconnecting (this page also checks every few seconds).')]},
      {id:'sound',title:'Enable sound',done:s.sound.enabled,summary:'Sound is on in this window',
        body:[h('p',{class:'muted',text:'Browsers start sound only after a click, so this is needed once per visit.'}),button({label:'Enable sound',icon:'sound-on',size:'sm',id:'guideSound',onClick:()=>P.toggleSound().catch(e=>toast(`Sound could not start: ${e.message}`,'error')),attrs:fk('guide-sound')})]},
      {id:'stage',title:'Open the Stage',done:!!st.ui.stageOpened,summary:'Opened on this device',
        body:[h('p',{class:'muted'},'The full-screen performance. Press ',h('kbd',{text:'F'}),' anywhere, or:'),button({label:'Open Stage',icon:'stage',size:'sm',kind:'outline',id:'guideStage',onClick:openStage,attrs:fk('guide-stage')})]}];
  }
  // Shown until dismissed; on a first run also before the settings have loaded (nothing to dismiss it yet).
  function guideShown(){const st=S.state;return !st.settings?.onboarding?.dismissed&&(!!st.settings||!st.projects.length);}
  function renderGuide(){
    const st=S.state,first=!st.projects.length,list=steps(),current=list.findIndex(x=>!x.done),demo=st.projects.find(isDemo);
    const settingsKnown=!!st.settings,show=guideShown();
    const firstReal=!st.projects.some(p=>!isDemo(p));
    const sig=JSON.stringify([show,first,firstReal,st.projectsLoaded,settingsKnown,demo?.id,list.map(x=>[x.done,x.summary]),st.changes,P.state.receiver,st.integrations?.vscode?.latestVersion,st.status?.version]);
    if(sig===guideSig)return;guideSig=sig;
    if(!show){guideTop.replaceChildren();guideBottom.replaceChildren();
      swap(firstEmpty,first&&st.projectsLoaded?[emptyState({icon:'projects',title:'No project yet',body:`Start capture in VS Code (${START_CMD}); the project appears here within seconds. The setup guide is hidden: Settings can show it again.`,
        actions:[button({label:'How to connect',icon:'connections',kind:'primary',onClick:()=>navigate('connections'),attrs:fk('empty-connect')}),button({label:'Settings',icon:'settings',onClick:()=>navigate('settings'),attrs:fk('empty-settings')})]})]:[]);
      return;
    }
    firstEmpty.replaceChildren();
    const done=list.every(x=>x.done);
    const guide=h('section',{class:'home-guide panel',id:'setupGuide','aria-label':'Setup guide'},
      h('div',{class:'home-guide-head'},h('div',{class:'grow'},h('h2',{class:'title-m',text:done?'All set':'Set up Code Resonance'}),
        h('p',{class:'faint small',text:done?'Everything this guide covers has happened. You can hide it.':'Each step follows what actually happens, so you can leave and come back at any point.'})),
        button({label:'Hide this guide',kind:'ghost',size:'sm',id:'hideGuide',disabled:!settingsKnown,onClick:async()=>{
          try{await S.saveSettings({onboarding:{dismissed:true}});toast('Setup guide hidden. Settings can show it again.','ok');}catch(e){toast(`The guide could not be hidden: ${e.message}`,'error');}},attrs:fk('guide-hide')})),
      h('div',{class:'home-guide-body'},
        h('ol',{class:'home-steps'},...list.map((x,i)=>h('li',{class:['home-step',x.done?'done':i===current?'current':''],dataset:{step:x.id,done:String(x.done)}},
          h('span',{class:'home-step-mark','aria-hidden':'true'},x.done?icon('check'):String(i+1)),
          h('div',{class:'home-step-text'},h('strong',{text:x.title}),h('span',{class:'visually-hidden',text:x.done?' (done)':i===current?' (next step)':''}),
            x.done?h('span',{class:'faint small',text:x.summary}):h('div',{class:'home-step-body'},...x.body))))),
        h('aside',{class:'home-demo'},h('span',{class:'eyebrow',text:'Optional'}),h('strong',{text:'Preview with the demo'}),
          h('p',{class:'faint small',text:`A fictional project generated on this computer and always labelled “${DEMO_LABEL}”. It shows what a performance looks like; it is not your work and does not count as a connection.`}),
          demo?button({label:'Show the demo',size:'sm',onClick:()=>S.select(demo.id),attrs:fk('guide-demo')}):copyable('npm run demo'))));
    const target=first||firstReal?guideTop:guideBottom;(target===guideTop?guideBottom:guideTop).replaceChildren();swap(target,[guide]);
  }
  // ---- Updates ---------------------------------------------------------------------------------------------------
  function layout(){
    const st=S.state,first=st.projectsLoaded?!st.projects.length:P.state.receiver===false;
    loading.hidden=st.projectsLoaded||P.state.receiver===false;
    hero.hidden=first||!st.projectsLoaded;lower.hidden=!st.projectsLoaded&&P.state.receiver!==false;
    recent.closest('.section').hidden=first;
  }
  const all=()=>{layout();renderSys();renderProject();renderAttention();renderRecent();renderGuide();renderChrome();};
  all();
  if(!S.state.integrations)void S.loadIntegrations();
  if(!S.state.status)void S.loadStatus();
  if(S.state.selected&&!S.state.evidence.has(S.state.selected))void S.loadEvidence(S.state.selected);
  const T={sys:['status','receiver','changes','sound','world'],project:['projects','selection','evidence','recipe','world','receiver','changes','settings','preferences'],
    attention:['receiver','packs','notice','world','sound','projects','selection','settings'],recent:['projects','selection','evidence'],guide:['status','integrations','projects','sound','settings','changes','receiver','selection'],
    layout:['projects','receiver'],chrome:['mode','position','preview']};
  let wasSupported=P.state.recording.supported.ok;
  offs.push(S.on(t=>{
    const has=k=>T[k].some(x=>t.has(x));
    if(has('layout'))layout();
    if(has('sys'))renderSys();if(has('project'))renderProject();if(has('recent'))renderRecent();if(has('guide'))renderGuide();if(has('chrome'))renderChrome();
    const sup=P.state.recording.supported.ok;if(has('attention')||(t.has('recording')&&sup!==wasSupported)){wasSupported=sup;renderAttention();}
  }));
  // Relative times ("2 min ago") and the 2-minute capture window age without any event arriving.
  const tick=setInterval(()=>{renderProject();renderRecent();},15000);
  return {unmount(){
    for(const f of offs)f();clearInterval(tick);overlay.remove();
    // Leaving Home for the Stage (rail, F, top bar) completes the guide's last step on this device.
    if(location.hash.startsWith('#/stage'))S.setUi({stageOpened:true});
  }};
}};

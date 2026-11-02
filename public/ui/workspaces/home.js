// Home: entering the creative application. The live world of the active project (the stage slot), its identity and
// whether its capture and agents are really active, what needs attention, recent projects, and the way to the Stage
// and the studios. On a first run (no project of your own yet; the fictional demo does not count) the stage still comes
// first, idle or playing the demo, with a compact setup checklist beside it, derived from what the receiver actually
// observes, so it can be left and resumed at any step. Capture state is built from evidence only:
// a past event is never presented as proof that capture runs now.
import {h,text,button,section,pill,callout,emptyState,copyable,toast,styles} from '../dom.js';
import {icon} from '../icons.js';
import {ago,projectName,timecode,WORLD_NAMES} from '../format.js';
import {capture,when,providerName,lastActivity,isDemo,DEMO_LABEL,familyLine,LIVE_MS,START_CMD} from './projects.js';
import {presence} from '../../providers.js';
// WebGL2 is checked once per page on a throwaway canvas whose context is released at once.
let webgl2=null;
function hasWebgl2(){if(webgl2===null)try{const g=document.createElement('canvas').getContext('webgl2');webgl2=!!g;g?.getExtension('WEBGL_lose_context')?.loseContext();}catch{webgl2=false;}return webgl2;}
// Rebuilding a small region must not lose the keyboard position: the focused control is found again by its key.
function swap(el,nodes){const k=el.contains(document.activeElement)?document.activeElement.closest('[data-fk]')?.dataset.fk:null;el.replaceChildren(...nodes.filter(Boolean));if(k)el.querySelector(`[data-fk="${CSS.escape(k)}"]`)?.focus({preventScroll:true});}
const fk=k=>({'data-fk':k});
// A demo's agent is named plainly: the demo label beside it already says it is fictional.
const agentName=(p,a)=>isDemo(p)?'Demo agent':providerName(a.provider);
export default {mount(view,ctx){
  styles('home');
  const {store:S,player:P,navigate,chrome,stageUrl}=ctx;const offs=[];
  const openStage=()=>{S.setUi({stageOpened:true});navigate('stage');};
  const openWindow=()=>{S.setUi({stageOpened:true});window.open(stageUrl(),'_blank','noopener');};
  // ---- Layout ------------------------------------------------------------------------------------------------
  // A workspace grid: the live world (the stage slot) and the recent projects in the wide column; beside it, the active
  // project's identity, its actions and its evidence-based capture and agent status, then what needs attention. The
  // top bar already states the receiver, live mode and sound, so Home does not repeat them as pills.
  // A light, one-line head: the live world below it is what this page is about.
  const head=h('div',{class:'page-head home-head'},h('div',{class:'grow'},h('h1',{class:'title-l',text:'Home'}),h('span',{class:'eyebrow',text:'Code Resonance'})));
  // The stage slot exists from the start (the shell finds it once, at mount) and is always shown, idle until a project
  // exists. Its size follows the column by CSS alone, so a layout change only moves the stage layer over it.
  const slot=h('div',{class:'stage-slot home-slot','data-stage-slot':''});
  const night=h('section',{class:'home-night panel',hidden:true,'aria-label':'Last night'});
  // A first run (no project of your own yet; the fictional demo does not count): under the stage, the demo playing on it
  // and what it is, or the one command that makes it.
  const firstDemo=h('section',{class:'panel home-first-demo',hidden:true,'aria-label':'Demonstration'});
  const hero=h('section',{class:'home-hero','aria-label':'Live world'},slot,firstDemo,night);
  const projectEl=h('section',{class:'panel home-project','aria-label':'Active project'});
  const loading=h('p',{class:'faint small',text:'Connecting to the receiver…'});
  // The guide is a compact checklist beside the stage while no real project exists (guideSide, with the stage first), and
  // below both columns, at the full width, once one does (guideBottom). Only one of them is ever filled. guideBottom is
  // outside the columns, so the side column can end level with the recent projects.
  const guideSide=h('div',{class:'home-guide-slot home-guide-side'}),guideBottom=h('div',{class:'home-guide-slot home-guide-bottom'}),firstEmpty=h('div',{class:'home-first'});
  const attention=h('div',{class:'home-attention'}),recent=h('div',{class:'home-recent'});
  const attentionCount=h('span',{class:'note'});
  const attentionEl=h('section',{class:'panel home-att','aria-label':'Needs attention'},
    h('div',{class:'panel-head'},h('div',{class:'grow'},h('h2',{text:'Needs attention'})),attentionCount),h('div',{class:'panel-body'},attention));
  const recentEl=section({title:'Recent projects',actions:[button({label:'All projects',icon:'projects',kind:'ghost',size:'sm',onClick:()=>navigate('projects'),attrs:fk('all-projects')})]},recent);
  recentEl.classList.add('home-recent-sec');
  const main=h('div',{class:'home-main'},hero,recentEl);
  const side=h('div',{class:'home-side'},guideSide,firstEmpty,projectEl,attentionEl);
  const grid=h('div',{class:'home-grid'},main,side,guideBottom);
  view.append(h('div',{class:'page ws-home'},h('div',{class:'page-inner'},head,loading,grid)));
  // Over the stage: whether it is live or replaying, and a preview's label (the world stays clickable elsewhere).
  const modeBadge=h('span',{class:'pill plain'}),previewBadge=h('span',{class:'pill accent',text:'Preview · not saved'});
  const demoBadge=h('span',{class:'pill warn',id:'homeDemoBadge',text:DEMO_LABEL});
  const overlay=h('div',{class:'chrome-pass home-chrome'},h('div',{class:'slot-badge'},modeBadge,demoBadge,previewBadge));
  chrome.append(overlay);
  // ---- The active project ---------------------------------------------------------------------------------------
  function statusLines(pr){
    const s=P.state,st=S.state,full=st.evidence.get(pr.id),ev=pr.evidence,cap=capture(ev,full),now=Date.now();
    const line=(tone,main,sub=null,key='')=>h('li',{dataset:{status:key}},h('span',{class:`dot ${tone}`}),h('div',{},main instanceof Node?main:h('span',{text:main}),sub?h('span',{class:'faint small',text:sub}):null));
    const out=[];
    // A receiver that answers with its change feed open is already stated by the top bar; only a problem is repeated here,
    // because it qualifies everything below it.
    if(s.receiver===false)out.push(line('danger','Receiver disconnected','Start it again with npm start. What follows is as of the last answer.','receiver'));
    else if(!s.receiver)out.push(line('','Connecting to the receiver…',null,'receiver'));
    else if(st.changes!=='open')out.push(line('warn','Reconnecting to the receiver’s change feed','Values refresh every few seconds meanwhile','receiver'));
    const reported=full&&!full.building?full.editor?.reported:null;
    const extension=cap.key==='unknown'||cap.key==='none'?null:isDemo(pr)?'Fictional capture events written by the demo, not by VS Code':reported?`VS Code capture observed · extension ${reported.extensionVersion||'?'} reported its settings ${ago(reported.at)}`:ev?.editor?.version?`VS Code capture observed · extension ${ev.editor.version}`:'VS Code capture observed · this extension version does not report its settings';
    out.push(line(cap.key==='running'?'ok':cap.key==='quiet'?'warn':'',cap.line,extension,`capture-${cap.key}`));
    const last=ev?.lastReceivedAt;
    // The absolute time is given once: not again when the capture line above already states it (capture stopped at …).
    const abs=last?when(last):null;
    out.push(last?line(now-last<LIVE_MS?'accent':'',now-last<LIVE_MS?`Events received ${ago(last)}`:`Project idle · last events received ${ago(last)}`,cap.line.includes(abs)?null:abs,'events'):line('','No events received yet',null,'events'));
    const agents=[...(ev?.agents||[])].sort((a,b)=>(b.lastAt||0)-(a.lastAt||0));
    // Each time is one unbreakable piece, so a narrow column moves it to the next line whole (never a lone "ago").
    const agentMain=agents.length?h('span',{},'Agent activity observed: ',...agents.flatMap((a,i)=>[i?', ':'',`${agentName(pr,a)} `,h('span',{class:'nowrap',text:ago(a.lastAt)})])):null;
    out.push(agents.length?line('agent',agentMain,isDemo(pr)?'Fictional agent events written by the demo':'Through hooks: sessions, tools and files only','agents'):line('','No agent activity observed',null,'agents'));
    return out;
  }
  // The panel is rebuilt whenever the project's data arrives (recipe, evidence, preferences…), for a second or two after
  // a project is chosen. Its actions keep their elements across rebuilds, so a click that straddles one (pressed on the
  // old button, released on the new) is not lost. Their handlers read the current project when clicked.
  const actions={
    details:button({label:'Project details',icon:'chevron-right',kind:'ghost',size:'sm',title:'Activity, evidence and settings of this project',onClick:()=>{const p=S.project();if(p)navigate('projects',p.id);},attrs:fk('details')}),
    stage:button({label:'Open Stage',icon:'stage',kind:'primary',size:'lg',id:'homeOpenStage',title:'The full-screen performance (F)',onClick:openStage,attrs:fk('open-stage')}),
    window:button({label:'Open in new window',icon:'external',kind:'outline',size:'lg',title:'Open the Stage in a new window (for a second monitor or OBS preview)',onClick:openWindow,attrs:fk('open-window')}),
    visual:button({label:'Visual Studio',icon:'visual',kind:'outline',size:'sm',title:'This project’s visual identity',onClick:()=>navigate('visual'),attrs:fk('visual')}),
    music:button({label:'Music Studio',icon:'music',kind:'outline',size:'sm',title:'This project’s music',onClick:()=>navigate('music'),attrs:fk('music')})};
  function renderProject(){
    const pr=S.project();
    if(!pr){swap(projectEl,[h('div',{class:'home-id home-project-empty'},h('span',{class:'eyebrow',text:'Active project'}),h('p',{class:'muted',text:'No project is selected. Choose one from Recent projects or the project menu above.'}))]);return;}
    const r=P.state.project===pr.id&&P.state.recipe?P.state.recipe:pr.recipe,e=S.effective(),world=e.world;
    // The family, then its state (chosen or generated, locked) as one piece in a quieter tone: a narrow column moves the
    // state to the next line whole.
    const visual=world==='living'?[h('span',{text:r?.familyName||r?.family||'Living world'}),r?h('span',{class:'home-id-state',text:familyLine(r)}):null]:[h('span',{text:WORLD_NAMES[world]||world})];
    swap(projectEl,[
      h('div',{class:'home-id'},
        h('div',{class:'home-project-top'},h('span',{class:'eyebrow',text:'Active project'}),isDemo(pr)?pill(DEMO_LABEL,'warn'):null,h('span',{class:'grow'}),actions.details),
        h('h2',{class:'title-l home-name',id:'homeProjectName',text:projectName(pr),title:projectName(pr)}),
        h('div',{class:'faint small home-private'},icon('lock'),pr.name?'Private workspace name · never on the Stage':'The extension did not share a name: shown by its id'),
        h('dl',{class:'kv home-kv'},h('dt',{text:'Public title'}),h('dd',{class:r?.title?'':'faint',id:'homePublicTitle',text:r?.title?`“${r.title}”`:'No public title — the Stage shows a generic name'}),
          h('dt',{text:world==='living'?'Visual identity':'World'}),h('dd',{class:'home-id-visual'},...visual.filter(Boolean))),
        isDemo(pr)?callout({kind:'warn',icon:'info',body:'Demonstration (fictional): produced by npm run demo on this computer. Nothing in it comes from real work.'}):null),
      h('div',{class:'home-actions'},
        h('div',{class:'home-actions-main'},actions.stage,actions.window),
        h('div',{class:'home-links'},actions.visual,actions.music,...creationLinks(r))),
      h('div',{class:'home-cap'},h('h3',{class:'eyebrow',text:'Capture & agents'}),
        h('ul',{class:'home-status',id:'homeStatus','aria-label':'Capture status'},...statusLines(pr)))]);
  }
  // The way into the Artist Studio: a new composition on this project's world, and the one last worked on.
  function creationLinks(r){
    const last=S.composition?.(S.state.ui.artistLast);
    const from=r?.family&&r.familyKind!=='pack'?r.family:'canvas';
    return [button({label:'Create a composition',icon:'brush',kind:'outline',size:'sm',id:'homeCreate',title:'Artist Studio: procedural layers, your palette, what reacts to the music and to real events',onClick:()=>navigate('artist','from',from),attrs:fk('create')}),
      last?button({label:`Continue ${last.composition.name}`,icon:'chevron-right',kind:'outline',size:'sm',id:'homeContinue',title:`Open ${last.composition.name} in the Artist Studio`,onClick:()=>navigate('artist','edit',last.id),attrs:fk('continue')}):null];
  }
  function renderChrome(){
    const s=P.state,pr=S.project();text(modeBadge,s.mode==='live'?'Live · about 10 s behind':`Replay ${s.playing?'▶':'❚❚'} ${timecode(s.position.now-s.position.start)}`);
    modeBadge.className=`pill ${s.mode==='live'?'accent live':'plain'}`;previewBadge.hidden=!s.preview;
    // With no project the stage is idle: nothing is live. The demonstration says it is fictional over its world too.
    modeBadge.hidden=!pr;demoBadge.hidden=!isDemo(pr);
  }
  // ---- First run: the stage first, and under it the demo or the way to it ----------------------------------------------
  let firstDemoSig=null;
  function renderFirstDemo(){
    const st=S.state,pr=S.project(),demo=st.projects.find(isDemo),show=isFirst();
    const sig=JSON.stringify([show,pr?.id,demo?.id,isDemo(pr)]);if(sig===firstDemoSig)return;firstDemoSig=sig;
    firstDemo.hidden=!show;if(!show){firstDemo.replaceChildren();return;}
    if(isDemo(pr))swap(firstDemo,[h('div',{class:'home-first-demo-text'},h('span',{class:'eyebrow',text:'On the stage'}),
        h('strong',{text:`${DEMO_LABEL}: ${projectName(pr)}`}),
        h('p',{class:'faint small',text:'Produced by npm run demo on this computer: nothing in it comes from real work. Your own project takes its place here when its first events arrive.'})),
      h('div',{class:'home-first-demo-actions'},button({label:'Open Stage',icon:'stage',kind:'outline',id:'homeFirstStage',title:'The full-screen performance (F)',onClick:openStage,attrs:fk('first-stage')}))]);
    else if(demo)swap(firstDemo,[h('div',{class:'home-first-demo-text'},h('span',{class:'eyebrow',text:'Optional'}),h('strong',{text:'See a performance first'}),
        h('p',{class:'faint small',text:`The demonstration is installed: a fictional project, always labelled “${DEMO_LABEL}”.`})),
      h('div',{class:'home-first-demo-actions'},button({label:'Show the demo',size:'sm',kind:'outline',onClick:()=>S.select(demo.id),attrs:fk('first-demo')}))]);
    else swap(firstDemo,[h('div',{class:'home-first-demo-text'},h('span',{class:'eyebrow',text:'Optional'}),h('strong',{text:'See a performance first'}),
        h('p',{class:'faint small',text:`In the Code Resonance folder, this makes a fictional project, always labelled “${DEMO_LABEL}”; it plays here within seconds. It is not your work and does not count as a connection.`})),
      h('div',{class:'home-first-demo-cmd'},copyable('npm run demo'))]);
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
    text(attentionCount,items.length?`${items.length} ${items.length===1?'item':'items'}`:'');attentionEl.classList.toggle('calm',!items.length);
    // On a first run a calm attention panel would be a lone card beside the guide: the grid drops that column (CSS).
    grid.classList.toggle('att-calm',!items.length);
  }
  // ---- Recent projects ------------------------------------------------------------------------------------------
  function renderRecent(){
    const list=[...S.state.projects].sort((a,b)=>(lastActivity(b)||0)-(lastActivity(a)||0)).slice(0,6);
    if(!list.length){swap(recent,[h('p',{class:'faint small',text:'No projects yet.'})]);return;}
    // Each card names the agent seen most recently and when, rather than repeating that some agent activity exists.
    swap(recent,list.map(p=>{const active=p.id===S.state.selected,cap=capture(p.evidence,S.state.evidence.get(p.id)),r=p.recipe;
      const agent=[...(p.evidence?.agents||[])].sort((a,b)=>(b.lastAt||0)-(a.lastAt||0))[0];
      const agentLine=agent?`${agentName(p,agent)}${agent.lastAt?` ${ago(agent.lastAt)}`:''}`:null;
      // One row per project: name, visual identity, capture and agent, then when. Where the list is wide these are
      // columns of one line; where it is narrow (beside the stage on a large screen, or a small window) the identity and
      // the capture line go on a second line (CSS only, by the list's own width).
      return h('button',{type:'button',class:['home-recent-row',active?'active':''],'aria-current':active?'true':null,dataset:{id:p.id,fk:`recent-${p.id}`},title:active?'The active project':'Make this the active project',onClick:()=>S.select(p.id)},
        h('span',{class:`dot ${cap.key==='running'?'ok':''}`}),
        h('span',{class:'rr-name'},h('strong',{class:'ellipsis',text:projectName(p)}),isDemo(p)?pill(DEMO_LABEL,'warn',{plain:true}):null),
        h('span',{class:'rr-sub'},h('span',{class:['rr-id ellipsis',r?.familyName?'':'faint'],text:r?.familyName||'Identity not generated yet'}),
          h('span',{class:'rr-meta ellipsis',text:[cap.label,agentLine].filter(Boolean).join(' · ')})),
        h('span',{class:'rr-end'},active?h('span',{class:'home-active-tag',text:'Active'}):null,h('span',{class:'num home-ago',text:ago(lastActivity(p))})));}));
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
      {id:'project',title:'Waiting for the first project',done:real.length>0,summary:real.length?`${projectName(real[0])} · first events received`:'',status:st.changes==='open'?'Listening':'Not listening',
        body:[h('p',{class:'home-listen'},h('span',{class:`dot ${st.changes==='open'?'ok':'warn'}`}),st.changes==='open'?'Listening. The project appears here within seconds of its first events.':'Not listening right now: the change feed is reconnecting (this page also checks every few seconds).')]},
      {id:'sound',title:'Enable sound',done:s.sound.enabled,summary:'Sound is on in this window',
        body:[h('p',{class:'muted',text:'Browsers start sound only after a click, so this is needed once per visit.'}),button({label:'Enable sound',icon:'sound-on',size:'sm',id:'guideSound',onClick:()=>P.toggleSound().catch(e=>toast(`Sound could not start: ${e.message}`,'error')),attrs:fk('guide-sound')})]},
      {id:'stage',title:'Open the Stage',done:!!st.ui.stageOpened,summary:'Opened on this device',
        body:[h('p',{class:'muted'},'The full-screen performance. Press ',h('kbd',{text:'F'}),' anywhere, or:'),button({label:'Open Stage',icon:'stage',size:'sm',kind:'outline',id:'guideStage',onClick:openStage,attrs:fk('guide-stage')})]}];
  }
  // Shown until dismissed; on a first run also before the settings have loaded (nothing to dismiss it yet).
  function guideShown(){const st=S.state;return !st.settings?.onboarding?.dismissed&&(!!st.settings||!st.projects.length);}
  // No project of your own yet (the fictional demo does not count): Home is a first run, the stage first.
  function isFirst(){const st=S.state;return st.projectsLoaded?!st.projects.some(p=>!isDemo(p)):P.state.receiver===false;}
  // A step the person opened or closed keeps that state across rebuilds; otherwise only the next step is open.
  const stepOpen=new Map();
  function renderGuide(){
    const st=S.state,first=isFirst(),list=steps(),current=list.findIndex(x=>!x.done),demo=st.projects.find(isDemo);
    const settingsKnown=!!st.settings,show=guideShown();
    const sig=JSON.stringify([show,first,st.projectsLoaded,settingsKnown,demo?.id,list.map(x=>[x.done,x.summary,x.status]),st.changes,P.state.receiver,st.integrations?.vscode?.latestVersion,st.status?.version]);
    if(sig===guideSig)return;guideSig=sig;
    if(!show){guideSide.replaceChildren();guideBottom.replaceChildren();
      swap(firstEmpty,first&&st.projectsLoaded?[emptyState({icon:'projects',title:demo?'No project of your own yet':'No project yet',
        body:`Start capture in VS Code (${START_CMD}); the project appears here within seconds${demo?' and takes the demonstration’s place':''}. The setup guide is hidden: Settings can show it again.`,
        actions:[button({label:'How to connect',icon:'connections',kind:'primary',onClick:()=>navigate('connections'),attrs:fk('empty-connect')}),button({label:'Settings',icon:'settings',onClick:()=>navigate('settings'),attrs:fk('empty-settings')})]})]:[]);
      return;
    }
    firstEmpty.replaceChildren();
    const done=list.every(x=>x.done);
    // One line per step with its true status; a step that is not done opens on demand (the next one is open).
    const stepEl=(x,i)=>{
      const cls=x.done?'done':i===current?'current':'',status=x.done?'Done':i===current?'Next':x.status||'To do';
      const mark=h('span',{class:'home-step-mark','aria-hidden':'true'},x.done?icon('check'):String(i+1));
      const line=h('span',{class:'home-step-line'},h('strong',{text:x.title}),h('span',{class:['home-step-status',cls],text:status}));
      if(x.done)return h('li',{class:'home-step done',dataset:{step:x.id,done:'true'}},
        h('div',{class:'home-step-sum'},mark,h('div',{class:'home-step-text'},line,h('span',{class:'faint small home-step-summary',text:x.summary}))));
      const d=h('details',{class:'home-step-d',open:stepOpen.has(x.id)?stepOpen.get(x.id):i===current},
        h('summary',{class:'home-step-sum',...fk(`step-${x.id}`)},mark,h('div',{class:'home-step-text'},line)),h('div',{class:'home-step-body'},...x.body));
      d.addEventListener('toggle',()=>stepOpen.set(x.id,d.open));
      return h('li',{class:['home-step',cls],dataset:{step:x.id,done:'false'}},d);};
    const guide=h('section',{class:['home-guide','panel',first?'compact':''],id:'setupGuide','aria-label':'Setup guide'},
      h('div',{class:'home-guide-head'},h('div',{class:'grow'},h('h2',{class:'title-m',text:done?'All set':'Set up Code Resonance'}),
        h('p',{class:'faint small',text:done?'Everything this guide covers has happened. You can hide it.':first?'Each step follows what actually happens.':'Each step follows what actually happens, so you can leave and come back at any point.'})),
        button({label:'Hide this guide',kind:'ghost',size:'sm',id:'hideGuide',disabled:!settingsKnown,onClick:async()=>{
          try{await S.saveSettings({onboarding:{dismissed:true}});toast('Setup guide hidden. Settings can show it again.','ok');}catch(e){toast(`The guide could not be hidden: ${e.message}`,'error');}},attrs:fk('guide-hide')})),
      h('div',{class:'home-guide-body'},
        h('ol',{class:'home-steps'},...list.map(stepEl)),
        // Beside the stage on a first run the demo is under the stage itself; with projects it stays an optional aside.
        first?null:h('aside',{class:'home-demo'},h('span',{class:'eyebrow',text:'Optional'}),h('strong',{text:'Preview with the demo'}),
          h('p',{class:'faint small',text:`A fictional project generated on this computer and always labelled “${DEMO_LABEL}”. It shows what a performance looks like; it is not your work and does not count as a connection.`}),
          demo?button({label:'Show the demo',size:'sm',onClick:()=>S.select(demo.id),attrs:fk('guide-demo')}):copyable('npm run demo'))));
    const target=first?guideSide:guideBottom;(target===guideSide?guideBottom:guideSide).replaceChildren();swap(target,[guide]);
  }
  // ---- Last night: sped-up replay of the scored highlight (Playwright is not involved) ----------------------------
  const REASON_WORDS={
    'validation.failed+recovered':'failure and recovery','providers>=2':'two agents','structure.created':'a new structure',
    'subsystem.connected':'subsystems joined','agent.collision':'a meeting of agents','milestone.achieved':'a milestone',
    'refactor.validated':'a refactor proved','repository.checkpoint':'a checkpoint'};
  let nightCache=null,nightId='';
  function renderNight(pr,hl){
    if(!pr||isDemo(pr)||!hl||hl.from==null){night.hidden=true;night.replaceChildren();return;}
    const r=P.state.project===pr.id&&P.state.recipe?P.state.recipe:pr.recipe,titled=!!r?.title;
    const reasons=(hl.reasons||[]).map(x=>REASON_WORDS[x]||x).filter(Boolean);
    const cast=[...new Set((hl.providers||[]).map(p=>presence(p).display))];
    night.hidden=false;
    swap(night,[
      h('div',{class:'home-night-head'},h('div',{class:'grow'},h('span',{class:'eyebrow',text:'Last night'}),
        titled?h('strong',{class:'home-night-title',text:`“${r.title}”`}):h('span',{class:'faint small',text:'Set a public title to publish this night'})),
        titled?null:button({label:'Visual Studio',icon:'visual',kind:'ghost',size:'sm',onClick:()=>navigate('visual'),attrs:fk('night-title')})),
      // The night is a film's floor: catalog names only, an uncatalogued agent is "Agent".
      cast.length?h('div',{class:'home-night-cast'},...cast.map(p=>pill(p,'plain'))):null,
      reasons.length?h('p',{class:'faint small home-night-reasons',text:reasons.join(' · ')}):null,
      h('div',{class:'home-night-actions'},
        button({label:'Play last night',icon:'play',kind:'primary',size:'sm',title:'Replay this highlight in the slot',onClick:()=>{
          const go=P.playWindow({from:hl.from,to:hl.to,speed:hl.speed});
          if(go&&typeof go.then==='function')return go.then(ok=>{if(ok===false)toast('The recorded performance could not be played.','error');},()=>toast('The recorded performance could not be played.','error'));
          if(go===false)toast('The recorded performance could not be played.','error');
        },attrs:fk('night-play')}),
        P.state.mode==='replay'?button({label:'Live',kind:'ghost',size:'sm',title:'Return the slot to the live world',onClick:()=>P.setMode('live'),attrs:fk('night-live')}):null,
        titled?copyable(`npm run film -- --project ${pr.id}`):button({label:'Set a public title to publish',kind:'outline',size:'sm',onClick:()=>navigate('visual'),attrs:fk('night-publish')}))]);
  }
  // The receiver is asked at most once per NIGHT_MS per project, and again only once that project's recorded performance
  // has grown (its frames); in between, the last answer (or none) is shown. A grown project waits out the rest.
  const NIGHT_MS=30000,nights=new Map();let nightTimer=null;
  const recorded=pr=>Number.isFinite(pr.frames)?pr.frames:pr.updatedAt||0;
  async function loadNight(){
    const pr=S.project();clearTimeout(nightTimer);nightTimer=null;
    if(!pr||isDemo(pr)){nightCache=null;nightId='';night.hidden=true;night.replaceChildren();return;}
    const known=nights.get(pr.id),size=recorded(pr),now=Date.now();
    if(known&&(known.size===size||now-known.at<NIGHT_MS)){
      if(known.size!==size)nightTimer=setTimeout(()=>void loadNight(),NIGHT_MS-(now-known.at));
      if(!known.pending){nightId=pr.id;nightCache=known.doc;renderNight(pr,known.doc);}
      return;
    }
    const ask={at:now,size,doc:known?.doc??null,pending:true};nights.set(pr.id,ask);
    try{const doc=await S.get(`/api/highlight?id=${encodeURIComponent(pr.id)}`);ask.doc=doc&&doc.from!=null?doc:null;}catch{}
    ask.pending=false;
    // Shown only while that project is still the one on Home.
    const cur=S.project();if(cur?.id!==pr.id)return;
    nightId=pr.id;nightCache=ask.doc;renderNight(cur,ask.doc);
  }
  // ---- Updates ---------------------------------------------------------------------------------------------------
  function layout(){
    const st=S.state,first=isFirst();
    loading.hidden=st.projectsLoaded||P.state.receiver===false;
    grid.hidden=!st.projectsLoaded&&P.state.receiver!==false;
    // The stage is always first, idle until a project exists; a first run has no active project panel or recent list.
    projectEl.hidden=first||!st.projectsLoaded;recentEl.hidden=first;
    grid.classList.toggle('first-run',first);
  }
  const all=()=>{layout();renderProject();renderAttention();renderRecent();renderGuide();renderFirstDemo();renderChrome();void loadNight();};
  all();
  if(!S.state.integrations)void S.loadIntegrations();
  if(!S.state.status)void S.loadStatus();
  if(S.state.selected&&!S.state.evidence.has(S.state.selected))void S.loadEvidence(S.state.selected);
  const T={project:['projects','selection','evidence','recipe','world','receiver','changes','settings','preferences','compositions'],
    attention:['receiver','packs','notice','world','sound','projects','selection','settings'],recent:['projects','selection','evidence'],guide:['status','integrations','projects','sound','settings','changes','receiver','selection'],
    layout:['projects','receiver'],chrome:['mode','position','preview']};
  let wasSupported=P.state.recording.supported.ok;
  offs.push(S.on(t=>{
    const has=k=>T[k].some(x=>t.has(x));
    if(has('layout'))layout();
    if(has('project'))renderProject();if(has('recent'))renderRecent();if(has('guide'))renderGuide();if(has('project'))renderFirstDemo();if(has('chrome')||t.has('selection')||t.has('projects'))renderChrome();
    if(t.has('selection')||t.has('projects'))void loadNight();
    else if((t.has('recipe')||t.has('mode'))&&nightId===S.project()?.id&&nightCache)renderNight(S.project(),nightCache);
    const sup=P.state.recording.supported.ok;if(has('attention')||(t.has('recording')&&sup!==wasSupported)){wasSupported=sup;renderAttention();}
  }));
  // Relative times ("2 min ago") and the 2-minute capture window age without any event arriving.
  const tick=setInterval(()=>{renderProject();renderRecent();},15000);
  return {unmount(){
    for(const f of offs)f();clearInterval(tick);clearTimeout(nightTimer);overlay.remove();
    if(P.state.mode==='replay')P.setMode('live');
    // Leaving Home for the Stage (rail, F, top bar) completes the guide's last step on this device.
    if(location.hash.startsWith('#/stage'))S.setUi({stageOpened:true});
  }};
}};

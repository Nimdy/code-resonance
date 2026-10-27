// Settings: the few choices that are not about one project, each shown where it lives. Global choices are the
// receiver's settings.json (every window and the OBS view follow them); this device's choices stay in this browser;
// music defaults and visual identity have their own studios and are only linked from here (one place for each).
// Storage, diagnostics and the documentation are read-only: erasing data is explained, never a button.
import {h,text,button,select,segmented,toggle,callout,copyable,kv,toast,setLabel,styles,reducedMotion} from '../dom.js';
import {icon} from '../icons.js';
import {duration,clockTime,projectName,WORLD_NAMES,LABEL_NAMES,LABEL_DOCS,QUALITY_NAMES} from '../format.js';
import {openDoc,DOCS} from '../markdown.js';
const QUALITY_DOCS={auto:'Lowers the resolution within about two seconds of slow frames (straight to the lowest level when far too slow) and climbs back only after a stable period. If no level draws smoothly, it says so and offers Monolith, a 2D stage.',0:'Full resolution with 4× anti-aliasing.',1:'Full resolution, no anti-aliasing.',2:'75 % resolution.',3:'55 % resolution: for machines without a capable GPU.'};
const SECTIONS=[['global','Global','All windows and OBS','globe'],['device','This device','This browser only','monitor'],['storage','Storage & privacy','Where everything lives','folder'],
  ['diagnostics','Diagnostics','What this window sees','cpu'],['about','About','Versions and guides','info']];
// A path breaks after its separators (never inside a folder name) when it has to wrap.
const pathCode=p=>{const c=h('code',{class:'set-path'});for(const part of String(p).split(/(?<=[\/\\])/)){c.append(part,h('wbr'));}return c;};
const ABOUT_DOCS=['FIRST-RUN.md','OBS.md','RECORDING.md','WSL.md','OPERATIONS.md','SECURITY.md','packs/README.md'];
export default {mount(view,{store:S,player:P,navigate}){
  styles('settings');
  const offs=[];
  // ---- A setting row: what it is, what it does, the control, and what happened to the last change ---------------
  function row({label,doc,control,id:rowId}){
    const status=h('span',{class:'set-status small',role:'status','aria-live':'polite'});let timer=null;
    const docEl=h('div',{class:'field-doc',text:doc||''});
    const el=h('div',{class:'set-row',id:rowId},h('div',{class:'set-text'},h('div',{class:'set-label',text:label}),docEl),h('div',{class:'set-control'},control,status));
    el.status=(msg,kind='')=>{clearTimeout(timer);text(status,msg);status.className=`set-status small ${kind}`;if(kind==='ok')timer=setTimeout(()=>text(status,''),2400);};
    el.doc=docEl;return el;
  }
  // While a change is on its way, the controls keep showing it (other updates keep arriving); the receiver's answer,
  // or the value it still holds after a refusal, is shown once every pending change has settled.
  let saving=0;
  async function save(patch,r){
    r.status('Saving…','faint');saving++;
    try{await S.saveSettings(patch);r.status('Saved','ok');}
    catch(e){r.status(`Not saved: ${e.message}`,'danger');toast(`The setting was not saved: ${e.message}`,'error');}
    finally{saving--;}
    renderGlobal();
  }
  const st=()=>S.state.settings;
  // ---- Layout helpers: a section (title, scope, rule), a titled panel of rows, a context column -------------------
  // A section says where its choices are kept (the receiver, for every window; or this browser only).
  function sec(id,title,{scope=null,subtitle=null,actions=[]},...children){
    return h('section',{class:'section set-section',id:`set-${id}`},
      h('div',{class:'section-head'},h('h2',{class:'title-m',text:title}),
        scope?h('span',{class:['set-scope',scope[0]]},icon(scope[0]==='device'?'monitor':'globe'),h('span',{text:scope[1]})):null,
        subtitle?h('span',{class:'faint small',text:subtitle}):null,h('span',{class:'rule'}),actions.length?h('div',{class:'actions'},...actions):null),...children);
  }
  const panel=(title,note,...body)=>h('div',{class:'panel set-panel'},h('div',{class:'panel-head'},h('div',{class:'grow'},h('h3',{text:title}),note?h('span',{class:'note',text:note}):null)),...body);
  // ---- Global ------------------------------------------------------------------------------------------------------
  const worldSel=select({id:'setWorld',label:'Default world',options:P.WORLDS.map(w=>({value:w,label:WORLD_NAMES[w]})),value:'living',onChange:v=>save({stage:{world:v}},worldRow)});
  const worldRow=row({id:'rowWorld',label:'Default world',doc:'Shown for projects that have not chosen their own world.',control:worldSel});
  const captions=toggle({id:'setCaptions',onChange:v=>save({stage:{captions:v}},captionsRow)});captions.input.setAttribute('aria-label','Captions');
  const captionsRow=row({id:'rowCaptions',label:'Captions',doc:'A line of narration under the Construct and the 2D worlds when something notable happens (the living worlds carry their own titles).',control:captions});
  const labelsSeg=segmented({id:'setLabels',label:'Default information mode',options:P.LABEL_MODES.map(m=>({value:m,label:LABEL_NAMES[m],title:LABEL_DOCS[m]})),value:'cinematic',onChange:v=>save({stage:{labels:v}},labelsRow)});
  const labelsRow=row({id:'rowLabels',label:'Information on the stage',doc:'',control:labelsSeg});
  const profileSeg=segmented({id:'setProfile',label:'Default recording profile',options:[{value:'720p',label:'720p'},{value:'1080p',label:'1080p'},{value:'stage',label:'Stage size'}],value:'720p',
    onChange:v=>save({recording:{profile:v}},profileRow).then(()=>{if(st()&&!P.record.active)P.record.setSize(st().recording.profile);})});
  const profileRow=row({id:'rowProfile',label:'Recording profile',control:profileSeg}),profileText=h('span');
  profileRow.doc.append(profileText,h('button',{type:'button',class:'link-btn',text:'Record & Broadcast',onClick:()=>navigate('output')}));
  const motionSeg=segmented({id:'setMotion',label:'Interface motion',options:[{value:'system',label:'Follow system'},{value:'reduce',label:'Reduce'},{value:'full',label:'Full'}],value:'system',onChange:v=>save({interface:{motion:v}},motionRow)});
  const motionRow=row({id:'rowMotion',label:'Motion',control:motionSeg});
  const guide=toggle({id:'setGuide',onChange:v=>save({onboarding:{dismissed:!v}},guideRow)});guide.input.setAttribute('aria-label','Show the setup guide on Home');
  const guideRow=row({id:'rowGuide',label:'Setup guide on Home',doc:'The first-run steps (receiver, Connect VS Code, the first project, sound, Open the Stage). Hidden once dismissed; show it again here.',control:guide});
  const globalError=h('div',{class:'set-error'});
  const elsewhere=h('div',{class:'set-elsewhere'},
    ...[['music','Music defaults','Style, tempo, texture and volume for every project: Music Studio, Global scope.'],['visual','Visual identity','A project\u2019s world family, look, tuning and public title: Visual Studio.'],
      ['projects','A project\u2019s world and music','Overrides of these defaults for one project: Projects.'],['connections','Capture settings','What VS Code and agents share is set in VS Code: Connections shows what they report.'],['packs','Visual pack approvals','Visual Packs.']]
      .map(([ws,t,d])=>h('button',{type:'button',class:'set-link',onClick:()=>navigate(ws)},h('span',{class:'grow'},h('strong',{text:t}),h('span',{text:d})),icon('chevron-right'))));
  const globalSection=sec('global','Global',{scope:['global','Saved by the receiver \u00b7 every window and the OBS view follow']},globalError,
    h('div',{class:'set-split'},
      h('div',{class:'set-groups'},
        panel('Stage','What the Stage and the OBS view show unless a project chooses otherwise',h('div',{class:'set-rows'},worldRow,labelsRow,captionsRow)),
        panel('Recording','Record & Broadcast starts from this profile',h('div',{class:'set-rows'},profileRow)),
        panel('Interface','This Control Center, in every window',h('div',{class:'set-rows'},motionRow,guideRow))),
      h('aside',{class:'set-aside','aria-label':'Set elsewhere'},h('div',{class:'set-aside-head'},h('h3',{text:'Set elsewhere'}),h('p',{class:'field-doc',text:'Choices that have their own studio: one place for each.'})),elsewhere)));
  // ---- This device -------------------------------------------------------------------------------------------------
  const qualitySeg=segmented({id:'setQuality',label:'Rendering quality on this device',options:P.QUALITY.map(q=>({value:q,label:QUALITY_NAMES[q],title:QUALITY_DOCS[q]})),value:S.state.device.quality||'auto',
    onChange:q=>{S.unpin('quality');S.setDevice({quality:q});P.setQuality(q);qualityRow.status('Saved in this browser','ok');renderDevice();}});
  const qualityRow=row({id:'rowQuality',label:'Rendering quality',control:qualitySeg});
  const qualityNow=h('div',{class:'set-now'});
  const resetBtn=button({label:'Reset this device\u2019s preferences',icon:'reset',kind:'outline',size:'sm',id:'setDeviceReset',onClick:()=>{S.unpin('quality');S.setDevice({quality:'auto'});P.setQuality('auto');renderDevice();toast('This browser\u2019s preferences are back to their defaults (quality: Auto).','ok');}});
  const deviceSection=sec('device','This device',{scope:['device','Saved in this browser only \u00b7 it describes this machine']},
    h('div',{class:'set-split'},
      h('div',{class:'set-groups'},panel('Rendering','The living worlds and visual packs, on this machine\u2019s GPU',h('div',{class:'set-rows'},qualityRow))),
      h('aside',{class:'set-aside'},h('div',{class:'panel set-panel set-machine'},h('div',{class:'panel-body'},
        h('div',{class:'set-machine-head'},icon('monitor'),h('span',{class:'eyebrow',text:'This machine, now'})),qualityNow,
        h('p',{class:'field-doc',text:'Another computer, or another browser on this one, keeps its own choice. Resetting affects this browser only.'}),
        h('div',{},resetBtn))))));
  // ---- Storage & privacy -------------------------------------------------------------------------------------------
  const dataPath=copyable('…',{label:'Copy'});dataPath.id='setDataDir';
  const projectPath=h('div',{class:'set-project-dir'});
  let dataDir=null,projectHash='',hashFor='';
  const D=()=>dataDir||'<data folder>',sep=()=>dataDir&&dataDir.includes('\\')&&!dataDir.includes('/')?'\\':'/',J=(...p)=>[D(),...p].join(sep());
  const authorities=h('tbody');
  const table=h('div',{class:'set-table-wrap'},h('table',{class:'set-table'},h('thead',{},h('tr',{},...['What','Where it lives','Changed in'].map(t=>h('th',{scope:'col',text:t})))),authorities));
  const erase=h('ol',{class:'set-steps'});
  const storageSection=sec('storage','Storage & privacy',{subtitle:'every kind of configuration has one home, on this computer'},
    h('div',{class:'set-split set-storage'},
      panel('Where each choice lives','One home for every kind of configuration',table),
      h('aside',{class:'set-aside'},
        panel('Data folder','Everything the receiver keeps, on this computer only. No accounts, no cloud, no telemetry.',h('div',{class:'panel-body'},dataPath,projectPath)),
        panel('Erasing data','Nothing is copied anywhere else',h('div',{class:'panel-body'},erase,
          h('p',{class:'field-doc',text:'Recordings and exports are ordinary files in your downloads folder: delete them there.'}),
          h('div',{},button({label:'Security and privacy model',icon:'shield',kind:'ghost',size:'sm',onClick:()=>openDoc('SECURITY.md')})))))));
  // ---- Diagnostics -------------------------------------------------------------------------------------------------
  const caps=detect();
  const receiverKv=h('div',{id:'setReceiver'}),capsList=h('div',{class:'set-caps',id:'setCaps'}),feedEl=h('div');
  const copyBtn=button({label:'Copy diagnostics',icon:'copy',kind:'primary',id:'setCopyDiag',onClick:()=>copyDiagnostics()});
  const diagSection=sec('diagnostics','Diagnostics',{subtitle:'what this window can see, live',actions:[button({label:'Refresh',icon:'refresh',size:'sm',kind:'ghost',onClick:()=>Promise.all([S.loadStatus(),loadDataDir()]).then(renderDiagnostics)})]},
    h('div',{class:'set-diag'},
      panel('Receiver','As it answers this window',h('div',{class:'panel-body'},receiverKv,feedEl)),
      panel('This browser','What this window can do',h('div',{class:'panel-body set-caps-body'},capsList)),
      panel('Report a problem','Facts only: nothing that identifies you or your projects',h('div',{class:'panel-body set-report'},
        h('div',{class:'set-field'},h('div',{class:'set-label',text:'Share a problem report'}),h('p',{class:'field-doc',text:'Copies these facts as JSON: versions, states and capabilities. It contains no token, no paths, no project names or identifiers.'}),h('div',{},copyBtn)),
        h('div',{class:'set-field'},h('div',{class:'set-label',text:'From a terminal'}),h('p',{class:'field-doc',text:'Checks Node, the receiver, its token\u2019s permissions, projects, packs and (on WSL) how to reach the player from Windows. Read-only.'}),copyable('npm run doctor'))))));
  // ---- About -------------------------------------------------------------------------------------------------------
  const aboutKv=h('div',{id:'setAbout'});
  const aboutSection=sec('about','About',{},
    h('div',{class:'set-about'},h('div',{class:'panel set-panel'},h('div',{class:'panel-body'},h('div',{class:'set-brand'},h('div',{class:'glyph'},h('i'),h('i'),h('i')),h('div',{},h('strong',{text:'Code Resonance'}),h('div',{class:'faint small',text:'Your development, performed: local, private, yours.'}))),aboutKv)),
      panel('Documentation','Opens here, from this receiver',h('div',{class:'panel-body'},h('div',{class:'set-docs'},...ABOUT_DOCS.map(d=>h('button',{type:'button',class:'set-doc',dataset:{doc:d},onClick:()=>openDoc(d)},icon('doc'),h('span',{text:DOCS[d]||d}),h('span',{class:'faint tiny num',text:d}))))))));
  // ---- Layout: a section index (with each section's scope) beside the sections ------------------------------------
  const nav=h('nav',{class:'set-nav','aria-label':'Settings sections'},...SECTIONS.map(([id,t,hint,ic])=>h('a',{href:`#set-${id}`,dataset:{target:id},onClick:e=>{e.preventDefault();
    const target=document.getElementById(`set-${id}`);target.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}},
    icon(ic),h('span',{class:'set-nav-text'},h('span',{class:'set-nav-label',text:t}),h('span',{class:'set-nav-hint',text:hint})))));
  const content=h('div',{class:'set-content'},globalSection,deviceSection,storageSection,diagSection,aboutSection);
  const page=h('div',{class:'page ws-settings'},h('div',{class:'page-inner'},
    h('header',{class:'page-head'},h('div',{class:'grow'},h('span',{class:'eyebrow',text:'Control Center'}),h('h1',{class:'title-l',text:'Settings'}),
      h('p',{class:'muted measure',text:'Global choices are kept by the receiver and apply to every window; this device\u2019s choices stay in this browser. Each project\u2019s own choices are made in the studios.'}))),
    h('div',{class:'set-layout'},h('div',{class:'set-nav-col'},nav),content)));
  view.append(page);
  // The index follows the reading position.
  const spy=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){const id=e.target.id.slice(4);for(const a of nav.children)a.toggleAttribute('aria-current',a.dataset.target===id);}},{root:page,rootMargin:'-10% 0px -70% 0px'});
  for(const s of content.children)spy.observe(s);offs.push(()=>spy.disconnect());
  // ---- Rendering ---------------------------------------------------------------------------------------------------
  function renderGlobal(){
    const s=st(),off=!s,rec=P.record.active;
    globalError.replaceChildren(off?callout({kind:'danger',icon:'warn',title:'The settings could not be loaded',body:S.state.errors.settings||'The receiver did not answer.',actions:[button({label:'Try again',size:'sm',onClick:()=>S.loadSettings()})]}):'');
    for(const c of [worldSel,captions.input])c.disabled=off;
    for(const g of [labelsSeg,profileSeg,motionSeg])for(const b of g.querySelectorAll('button'))b.disabled=off||(g===profileSeg&&rec);
    guide.input.disabled=off;
    if(off||saving)return;
    if(document.activeElement!==worldSel)worldSel.value=s.stage.world;
    captions.set(s.stage.captions);labelsSeg.set(s.stage.labels);profileSeg.set(s.recording.profile);motionSeg.set(s.interface.motion);guide.set(!s.onboarding.dismissed);
    const own=S.state.projects.filter(p=>p.preferences?.world).length;
    text(worldRow.doc,`Shown for projects that have not chosen their own world${own?` (${own} of ${S.state.projects.length} ${S.state.projects.length===1?'has':'have'} their own)`:''}.`);
    text(profileText,rec?'A recording is running: the profile can change once it stops. ':'The same profile as Record & Broadcast: 720p holds 30 fps on modest GPUs, 1080p may not on an integrated GPU. ');
    // A project's visual identity may set its own information mode (one chosen on the Stage or in Visual Studio); it wins
    // over this default: say so for the selected project rather than imply this default reaches it.
    const idLabels=P.state.recipe?.overrides?.labels;
    text(labelsRow.doc,`Used where a project\u2019s visual identity sets no information mode of its own. ${idLabels?`The selected project\u2019s identity sets ${LABEL_NAMES[idLabels]||idLabels}, so this default does not change it: change it on the Stage (Information) or in Visual Studio.`:S.state.selected?'The selected project follows this default.':''} The OBS view uses Stream unless its URL says otherwise.`);
    const sys=matchMedia('(prefers-reduced-motion: reduce)').matches;
    text(motionRow.doc,`Interface transitions (views, panels, dialogs). Follow system uses this computer\u2019s setting, now ${sys?'reduced':'full'}. Applied at once. The stage\u2019s own animation is the performance and is not affected.`);
  }
  function renderDevice(){
    const q=S.state.device.quality||'auto',s=P.state;
    qualitySeg.set(q);
    text(qualityRow.doc,`${QUALITY_DOCS[q]} Recordings keep their dimensions whatever the quality.`);
    const level=s.qualityLevel;
    qualityNow.replaceChildren(h('span',{class:'faint small',text:'Now rendering at'}),
      h('strong',{class:['num','set-now-value',level===null||level===undefined?'idle':''],id:'setQualityNow',text:level===null||level===undefined?'— (no living world running)':QUALITY_NAMES[String(level)]}),
      h('span',{class:'faint small',text:`Chosen: ${QUALITY_NAMES[q]||q}${S.pinned('quality')?' · this window’s URL sets the quality until you choose here':''}`}));
  }
  async function loadDataDir(){
    // The data folder is only told to a page holding a control capability (a page of this computer's player).
    try{const r=await P.api.request('GET','/api/status');dataDir=r?.dataDir||null;}catch{dataDir=null;}
    renderStorage();
  }
  async function hashOf(id){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function renderStorage(){
    // Unknown stays unknown: without the receiver's answer, only the documented default is named, as a default.
    dataPath.set(dataDir||'Not reported to this page. By default ~/.code-resonance, or the RESONANCE_DATA folder the receiver was started with.');dataPath.querySelector('button').disabled=!dataDir;
    const p=S.project(),id=p?.id||'';
    if(id&&hashFor!==id){hashFor=id;projectHash='';hashOf(id).then(x=>{if(hashFor===id){projectHash=x;renderStorage();}}).catch(()=>{});}
    projectPath.replaceChildren(p&&projectHash?h('p',{class:'field-doc'},'The selected project, ',h('strong',{text:projectName(p)}),' (private name), is kept in ',pathCode(J('projects',projectHash)),'.'):'');
    const rows=[
      ['Global settings: stage and recording defaults, motion, music defaults, the setup guide',J('settings.json'),'Settings, Music Studio'],
      ['Each project\u2019s visual identity (Visual Recipe: family, look, tuning, public title)',J('projects','<project>','recipe.json'),'Visual Studio'],
      ['Each project\u2019s world and music choices',J('projects','<project>','preferences.json'),'Projects, Music Studio'],
      ['Each project\u2019s recorded history (events, derived performance, source snapshots, capture evidence)',J('projects','<project>',''),'VS Code and agents (by working)'],
      ['Visual and music presets',J('presets.json'),'Visual Studio, Music Studio'],
      ['Visual packs and their approvals',`${J('packs','')} and ${J('packs','trust.json')}`,'Visual Packs'],
      ['The receiver\u2019s token (never shown here)',J('receiver-auth.json'),'npm start creates it'],
      ['What VS Code captures and shares','VS Code settings resonance.* (user or workspace)','VS Code (Connections shows what it reports)'],
      ['This device: rendering quality, last page, remembered project','This browser\u2019s storage for this address','Settings, This device'],
      ['Previews, the playhead, a recording in progress','This window\u2019s memory only (gone when it closes)','—']];
    authorities.replaceChildren(...rows.map(([what,where,how])=>h('tr',{},h('td',{text:what}),h('td',{},pathCode(where)),h('td',{class:'faint',text:how}))));
    erase.replaceChildren(
      h('li',{text:'Stop capture in VS Code (CODE RESONANCE: Stop Code Performance) and stop the receiver (Ctrl+C where npm start runs).'}),
      h('li',{},'One project: delete its folder, ',pathCode(J('projects','<project>','')),p&&projectHash?' (the selected project\u2019s is shown above).':'.'),
      h('li',{},'Everything, including the receiver token: delete ',pathCode(D()),'.'),
      h('li',{},'Also clear the extension\u2019s outbox in VS Code\u2019s global storage (',pathCode('…/globalStorage/zerobandwidth.code-resonance/outbox'),') and any agent spool in ',pathCode(J('spool','')),'.'),
      h('li',{text:'This browser: use Reset this device\u2019s preferences above, or clear this site\u2019s data in the browser.'}));
  }
  function detect(){
    let webgl2=false;try{const g=document.createElement('canvas').getContext('webgl2');webgl2=!!g;g?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
    const rec=window.ResonanceRecording?.supported?.()||P.state.recording.supported;
    return {webgl2,mediaRecorder:!!window.MediaRecorder,webm:rec.ok?rec.mimeType:null,audioContext:!!(window.AudioContext||window.webkitAudioContext),eventSource:'EventSource' in window,
      broadcastChannel:'BroadcastChannel' in window,fullscreen:!!document.fullscreenEnabled,clipboard:!!navigator.clipboard?.writeText};
  }
  const CAP_NAMES=[['webgl2','WebGL 2','the living worlds and the Construct (without it: the 2D worlds)'],['mediaRecorder','MediaRecorder','live recording'],['webm','WebM video','recording format'],
    ['audioContext','Web Audio','the music'],['eventSource','Server-sent events','changes from other windows and the receiver'],['broadcastChannel','BroadcastChannel','one recording across windows'],
    ['fullscreen','Fullscreen','the Stage in full screen'],['clipboard','Clipboard','copy buttons']];
  function renderDiagnostics(){
    const s=S.state.status,feed=S.state.changes,e=S.state.errors.status;
    receiverKv.replaceChildren(s?kv([['Version',h('span',{class:'num',text:s.version})],['Running',`${duration(s.uptimeMs)} (since ${clockTime(s.startedAt)})`],['Address',`port ${s.port} · ${s.loopbackOnly?'this computer only':'open to the network (RESONANCE_ALLOW_REMOTE)'}`],
      ['Platform',`${s.platform}${s.wsl?' (WSL)':''} · Node ${s.node}`],['Interpretation',s.worker.lastProjectionAt?`last ${clockTime(s.worker.lastProjectionAt)}${s.worker.errors?` · ${s.worker.errors} errors`:' · no errors'}`:`nothing interpreted yet${s.worker.errors?` · ${s.worker.errors} errors`:''}`],
      ['Projects',String(s.projects)],['Visual packs',`${s.packs.installed} installed${s.packs.needApproval?` · ${s.packs.needApproval} awaiting approval`:''}${s.packs.problems?` · ${s.packs.problems} with problems`:''}`]])
      :callout({kind:P.state.receiver===false?'danger':'',icon:'warn',body:e?`The receiver did not answer: ${e}`:'Loading…'}));
    feedEl.replaceChildren(h('div',{class:'set-feed'},h('span',{class:`dot ${feed==='open'?'ok':feed==='closed'?'danger':'warn'}`}),h('span',{id:'setFeed',text:feed==='open'?'Change feed open: other windows\u2019 changes arrive at once':feed==='closed'?'Change feed closed: reconnecting (polling meanwhile)':'Change feed connecting…'})));
    capsList.replaceChildren(...CAP_NAMES.map(([k,name,use])=>h('div',{class:'set-cap'},h('span',{class:`dot ${caps[k]?'ok':'danger'}`}),h('span',{class:'grow'},h('strong',{text:name}),h('span',{class:'faint small',text:` ${use}`})),
      h('span',{class:`small ${caps[k]?'ok':'danger'}`,text:caps[k]?(typeof caps[k]==='string'?caps[k].replace('video/',''):'Available'):'Missing'}))));
  }
  function renderAbout(){
    const s=S.state.status,ext=S.state.integrations?.vscode?.latestVersion;
    aboutKv.replaceChildren(kv([['Version',h('span',{class:'num',id:'setVersion',text:s?.version||'—'})],['Visual Pack SDK',h('span',{class:'num',text:s?.sdk||'—'})],['VS Code extension',h('span',{class:'num',text:ext?`${ext} (bundled)`:'—'})]]));
  }
  // Facts only, nothing identifying: no token, data folder, project names or ids (ids are 64-hex hashes too).
  function diagnostics(){
    const s=S.state.status,p=P.state,set=st();
    return {schema:'code-resonance.diagnostics.v1',at:new Date().toISOString(),
      receiver:s?{version:s.version,sdk:s.sdk,node:s.node,platform:s.platform,wsl:s.wsl,uptimeMs:s.uptimeMs,port:s.port,loopbackOnly:s.loopbackOnly,worker:s.worker,projects:s.projects,packs:s.packs,controlSessions:s.capabilities}:{error:S.state.errors.status||'not loaded'},
      changeFeed:S.state.changes,
      browser:{userAgent:navigator.userAgent,devicePixelRatio,viewport:[innerWidth,innerHeight],capabilities:caps},
      engine:{receiver:p.receiver,mode:p.mode,world:p.world,labels:p.labels,captions:p.captions,quality:p.quality,qualityLevel:p.qualityLevel,
        worldStatus:{loading:p.worldStatus.loading,running:p.worldStatus.running,remote:p.worldStatus.remote,failed:p.worldStatus.failed,constructFailed:p.worldStatus.constructFailed},
        sound:{enabled:p.sound.enabled,error:p.sound.error||null},recording:{supported:p.recording.supported.ok,mimeType:p.recording.supported.mimeType||null,reason:p.recording.supported.reason||null,active:p.recording.active,profile:p.recording.size}},
      settings:set?{revision:set.revision,stage:set.stage,recording:set.recording,interface:set.interface,music:set.music,onboarding:set.onboarding}:null,device:{quality:S.state.device.quality||'auto'}};
  }
  async function copyDiagnostics(){
    await S.loadStatus();const json=JSON.stringify(diagnostics(),null,2);
    try{await navigator.clipboard.writeText(json);setLabel(copyBtn,'Copied');toast('Diagnostics copied: paste them into your report.','ok');}
    catch(e){toast(`The clipboard refused (${e.message}). Select and copy the text instead.`,'warning');
      const area=h('textarea',{class:'textarea set-diag-text',readonly:true,rows:12,'aria-label':'Diagnostics'});area.value=json;copyBtn.parentElement.append(area);area.select();}
    setTimeout(()=>setLabel(copyBtn,'Copy diagnostics'),1800);
  }
  renderGlobal();renderDevice();renderStorage();renderDiagnostics();renderAbout();
  void S.loadStatus();void loadDataDir();if(!S.state.integrations)void S.loadIntegrations();
  offs.push(S.on(t=>{
    if(t.has('settings')||t.has('recording')||t.has('projects')||t.has('recipe')||t.has('selection'))renderGlobal();
    if(t.has('device')||t.has('quality')||t.has('world'))renderDevice();
    if(t.has('selection')||t.has('projects'))renderStorage();
    if(t.has('status')||t.has('changes')||t.has('receiver')){renderDiagnostics();renderAbout();}
    if(t.has('integrations'))renderAbout();
  }));
  // While Auto adapts, the level it chose is worth seeing; the engine does not announce it, so it is read now and then.
  const tick=setInterval(()=>{if(!document.hidden)renderDevice();},2000);offs.push(()=>clearInterval(tick));
  return {unmount(){for(const f of offs)f();}};
}};

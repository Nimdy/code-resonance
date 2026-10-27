// The Control Center and the Performance Stage: one page, one engine (app.js), many views.
// Workspaces are modules (public/ui/workspaces/<id>.js) loaded on first visit. A workspace that shows the stage marks an
// element with data-stage-slot; the stage layer (#stageHost, which also holds an isolated pack's frame) is then placed
// over it by position only — it is never moved in the document, so a running pack frame is never reloaded — and
// #stageChrome, a layer above it, carries the view's own controls. The OBS view (?overlay=1) and films (?film=1) show
// the stage alone with no interface at all.
import {h,clear,text,button,popover,menuItem,toast,modal,copyable,callout} from './dom.js';
import {icon} from './icons.js';
import * as store from './store.js';
import {ago,timecode,projectName} from './format.js';
const P=store.player;
const params=new URLSearchParams(location.search);
const host=document.getElementById('stageHost'),chrome=document.getElementById('stageChrome'),root=document.getElementById('app');
export const WORKSPACES=[
  {id:'home',title:'Home',icon:'home'},
  {id:'projects',title:'Projects',icon:'projects'},
  {id:'visual',title:'Visual Studio',short:'Visual',icon:'visual'},
  {id:'music',title:'Music Studio',short:'Music',icon:'music'},
  {id:'packs',title:'Visual Packs',short:'Packs',icon:'packs'},
  {id:'connections',title:'Connections',short:'Connect',icon:'connections'},
  {id:'output',title:'Record & Broadcast',short:'Output',icon:'broadcast'},
  {id:'settings',title:'Settings',icon:'settings'},
  {id:'stage',title:'Performance Stage',short:'Stage',icon:'stage',immersive:true}
];
const byId=Object.fromEntries(WORKSPACES.map(w=>[w.id,w]));
// ---- Routing: #/<workspace>/<param…> ---------------------------------------------------------------------------
export function route(){const parts=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);const id=byId[parts[0]]?parts[0]:'home';return {id,params:parts.slice(1)};}
export function navigate(id,...rest){const next=`#/${[id,...rest].map(encodeURIComponent).join('/')}`;if(location.hash!==next)location.hash=next;else render();}
export function stageUrl(project=store.state.selected){return `/?${project?`project=${encodeURIComponent(project)}`:''}#/stage`;}
// ---- Stage placement --------------------------------------------------------------------------------------------
let slot=null,immersive=false,lastRect='';
function placeStage(){
  if(immersive){setRect(0,0,innerWidth,innerHeight,null,true);return;}
  if(!slot||!slot.isConnected){park();return;}
  const r=slot.getBoundingClientRect(),area=root.querySelector('.workspace')?.getBoundingClientRect();
  if(r.width<2||r.height<2||!area){park();return;}
  // Clipped to the workspace area, so a slot scrolled partly out of view never covers the top bar or the rail.
  const clip=[Math.max(0,area.top-r.top),Math.max(0,r.right-area.right),Math.max(0,r.bottom-area.bottom),Math.max(0,area.left-r.left)];
  if(clip[0]>=r.height||clip[2]>=r.height||clip[1]>=r.width||clip[3]>=r.width){park();return;}
  setRect(r.left,r.top,r.width,r.height,clip,slot.classList.contains('flush'));
}
function setRect(x,y,w,hh,clip,flush){
  const key=[x,y,w,hh,clip,flush].join();if(key===lastRect&&!host.classList.contains('parked'))return;lastRect=key;
  for(const el of [host,chrome]){el.classList.remove('parked');Object.assign(el.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${hh}px`,clipPath:clip&&clip.some(Boolean)?`inset(${clip.map(c=>`${c}px`).join(' ')})`:''});}
  host.classList.toggle('rounded',!flush);P.setVisible(true);
}
function park(){if(host.classList.contains('parked'))return;lastRect='';host.classList.add('parked');chrome.classList.add('parked');P.setVisible(false);}
function trackStage(){placeStage();requestAnimationFrame(trackStage);}
// ---- Shell --------------------------------------------------------------------------------------------------------
let current=null,currentId='',view=null;
const nav=h('nav',{class:'rail','aria-label':'Workspaces'},
  h('div',{class:'rail-brand',title:'Code Resonance'},h('div',{class:'glyph'},h('i'),h('i'),h('i'))),
  ...WORKSPACES.filter(w=>!w.immersive).map(w=>h('a',{href:`#/${w.id}`,dataset:{ws:w.id},title:w.title},icon(w.icon),w.short||w.title)),
  h('div',{class:'spacer'}),
  h('a',{href:'#/stage',class:'stage-link',dataset:{ws:'stage'},title:'Performance Stage (F)'},icon('stage'),'Stage'));
const projectButton=h('button',{type:'button',class:'project-switch','aria-haspopup':'menu','aria-expanded':'false',title:'Choose the project'},
  h('span',{class:'dot',id:'projectDot'}),h('span',{class:'names'},h('strong',{id:'projectTitle',text:'No project'}),h('span',{id:'projectSub',text:'Waiting for the receiver'})),icon('chevron'));
const receiverStatus=h('div',{class:'status',role:'status'},h('span',{class:'dot',id:'receiverDot'}),h('span',{class:'label',id:'receiverText',text:'Connecting…'}));
const modePill=h('span',{class:'pill plain',id:'modePill',text:'Live'});
const soundBtn=button({label:'Enable sound',icon:'sound-off',id:'soundBtn',kind:'outline',attrs:{'aria-pressed':'false'},onClick:()=>P.toggleSound().catch(e=>toast(`Sound could not start: ${e.message}`,'error'))});
const recordBtn=h('button',{type:'button',class:'btn record',id:'recordBtn','aria-pressed':'false',title:'Record the stage and the music to a WebM file'},h('span',{class:'dot'}),h('span',{class:'label',text:'Record'}));
recordBtn.addEventListener('click',()=>toggleRecording());
const stageBtn=button({label:'Stage',icon:'stage',kind:'outline',title:'Enter the Performance Stage (F)',onClick:()=>navigate('stage')});
// Pairing: until this browser is paired, it can watch, play, record and export, but changes nothing on the receiver.
const pairBtn=button({label:'View only · Pair this browser',icon:'key',kind:'ghost',id:'pairBtn',title:'Changes need this browser to be paired with the receiver (once)',onClick:()=>openPairing()});
pairBtn.hidden=true;
export function openPairing(){
  const input=h('input',{class:'input',type:'text',placeholder:'Paste the private link or its key',spellcheck:'false',autocomplete:'off','aria-label':'Private link or key',autofocus:true});
  const status=h('div',{class:'small',role:'status'});
  const dlg=modal({title:'Pair this browser',subtitle:'Once per browser. Watching, the Stage, sound and recording work without it.',
    body:h('div',{class:'section'},
      h('p',{class:'muted',text:'Changing settings, visual identities, music, packs or integrations needs this browser to be paired with your receiver, so that no other program or account on this computer can change them. Pairing uses a single-use link that only your account can create.'}),
      h('div',{class:'field'},h('span',{class:'field-label',text:'Make a pairing link (in the Code Resonance folder)'}),copyable('npm run pair')),
      h('p',{class:'faint small',text:'The link works once, for 15 minutes (npm start prints one too, and VS Code’s CODE RESONANCE: Open Code Stage opens one directly). Open it in this browser, or paste it below.'}),
      h('div',{class:'field-row'},input,button({label:'Pair',kind:'primary',onClick:async()=>{text(status,'Checking…');const r=await P.api.pair(input.value.trim());
        if(r==='paired'){dlg.close();toast('This browser is paired: changes are allowed here.','ok');return;}
        status.className='small danger';text(status,r==='offline'?'The receiver does not answer: start it (npm start) and try again.':'The receiver did not accept this: the link may have been used already or expired. Run npm run pair for a new one.');}})),status),
    actions:[{label:'Close'}]});
  input.addEventListener('keydown',e=>{if(e.key==='Enter')dlg.dialog.querySelector('.field-row .btn').click();});
}
let pairingPrompted=false;
const topbar=h('header',{class:'topbar'},projectButton,h('div',{class:'grow'}),pairBtn,receiverStatus,h('span',{class:'sep'}),modePill,h('span',{class:'sep'}),h('div',{class:'actions'},soundBtn,recordBtn,stageBtn));
const workspace=h('main',{class:'workspace',id:'workspace'});
// Recording is one action whichever control starts it, and only one window records at a time.
export async function toggleRecording(){
  if(!P.record.active&&store.state.others.recording){toast('Another Code Resonance window is recording. Stop it there first.','warning');return;}
  if(!P.record.active&&store.state.draft){toast(`Apply or cancel the ${store.state.draft} first: a recording shows what is saved.`,'warning');return;}
  if(!P.state.recording.supported.ok){toast(P.state.recording.supported.reason,'error');return;}
  try{await P.record.toggle();}catch(e){toast(`Recording failed: ${e.message}`,'error');}
}
projectButton.addEventListener('click',()=>popover(projectButton,close=>{
  const list=store.state.projects;
  return h('div',{},h('div',{class:'menu-label eyebrow',text:list.length?'Projects':'No projects yet'}),
    ...list.map(p=>menuItem({label:projectName(p),sub:projectLine(p),checked:p.id===store.state.selected,onClick:()=>{close();store.select(p.id);}})),
    h('div',{class:'menu-sep'}),menuItem({label:'Manage projects',icon:'projects',onClick:()=>{close();navigate('projects');}}));
},{width:340}));
function projectLine(p){
  if(!p)return '';const e=p.evidence;
  const bits=[];if(e?.demonstration)bits.push('Demonstration (fictional)');
  bits.push(e?.lastReceivedAt?`Activity ${ago(e.lastReceivedAt)}`:p.updatedAt?`Updated ${ago(p.updatedAt)}`:'No activity received');
  return bits.join(' · ');
}
function updateShell(topics){
  const s=P.state,p=store.project();
  if(!topics||topics.has('projects')||topics.has('selection')){
    text(document.getElementById('projectTitle'),p?projectName(p):store.state.projectsLoaded?'No project yet':'Loading…');
    text(document.getElementById('projectSub'),p?projectLine(p):'Open a project in VS Code to begin');
    const live=p?.evidence?.lastReceivedAt&&Date.now()-p.evidence.lastReceivedAt<120000;
    document.getElementById('projectDot').className=`dot ${live?'ok':p?'':'warn'}`;
  }
  if(!topics||topics.has('packs')){const pending=(s.packs||[]).filter(x=>x.executable&&x.ok&&!x.trusted).length;setBadge('packs',pending);}
  if(!topics||topics.has('receiver')||topics.has('changes')){
    const ok=s.receiver===true,feed=store.state.changes;
    document.getElementById('receiverDot').className=`dot ${ok?(feed==='open'?'ok':'warn'):s.receiver===false?'danger':''}`;
    text(document.getElementById('receiverText'),s.receiver===false?'Receiver offline':ok?(feed==='open'?'Receiver connected':'Reconnecting…'):'Connecting…');
    receiverStatus.title=s.receiver===false?'The local receiver does not answer. Start it with: npm start':feed==='open'?'The local receiver answers and announces changes':'Waiting for the receiver';
  }
  if(!topics||topics.has('pairing')||topics.has('pairing-checked')){const unpaired=P.pairing==='unpaired';pairBtn.hidden=!unpaired;
    // The first change refused for want of pairing opens the dialog (once per page); a page that only watches is left alone.
    // On the Stage it is a message with a Pair action instead (a dialog over the performance would be in the way).
    if(unpaired&&topics?.has('pairing')&&!pairingPrompted&&!document.querySelector('.modal-backdrop')){pairingPrompted=true;
      if(route().id==='stage')toast('This browser is not paired: the change is shown here but not saved.','warning',{action:{label:'Pair',onClick:()=>openPairing()}});else openPairing();}}
  if(!topics||topics.has('sound')){const on=s.sound.enabled;soundBtn.setAttribute('aria-pressed',String(on));soundBtn.replaceChildren(icon(on?'sound-on':'sound-off'),h('span',{text:on?'Sound on':'Enable sound'}));soundBtn.classList.toggle('primary',false);}
  if(!topics||topics.has('recording')||topics.has('others')){
    const r=s.recording,active=r.active,other=!active&&!!store.state.others.recording;
    recordBtn.setAttribute('aria-pressed',String(active));
    text(recordBtn.querySelector('.label'),active?`Stop ${timecode(r.stats.elapsedMs)}${r.audio&&!r.audioLost?'':' · no sound'}`:other?'Recording elsewhere':'Record');
    recordBtn.disabled=other;recordBtn.title=other?'Another window of Code Resonance is recording':active?'Stop and save the recording':'Record the stage and the music to a WebM file';
  }
  if(!topics||topics.has('world')||topics.has('recipe')){const s=P.state,name=s.world==='living'?(s.recipe?.familyName||'Living world'):({construct:'The Construct',nexus:'Nexus',city:'Monolith',nebula:'Nebula'})[s.world];
    stageBtn.replaceChildren(icon('stage'),h('span',{text:'Stage'}),h('span',{class:'stage-btn-world',text:name||''}));stageBtn.title=`Enter the Performance Stage: ${name} (F)`;}
  if(!topics||topics.has('mode')||topics.has('position')){
    const live=s.mode==='live';modePill.className=`pill ${live?'accent live':'plain'}`;text(modePill,live?'Live':`Replay ${s.playing?'▶':'❚❚'} ${timecode(s.position.now-s.position.start)}`);
  }
}
function setBadge(ws,n){const a=nav.querySelector(`[data-ws="${ws}"]`);if(!a)return;let b=a.querySelector('.badge');if(!n){b?.remove();return;}if(!b){b=h('span',{class:'badge'});a.append(b);}text(b,n);b.title=`${n} awaiting approval`;}
let seenNotice=0;
function showNotices(){for(const n of P.state.notices){if(n.id<=seenNotice)continue;seenNotice=n.id;toast(n.text,n.kind==='error'?'error':n.kind==='warning'?'warning':'info');}}
// ---- Rendering a route ---------------------------------------------------------------------------------------------
let token=0;
async function render(){
  const r=route(),ws=byId[r.id],mine=++token;
  for(const a of nav.querySelectorAll('a')){if(a.dataset.ws===r.id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  document.title=`${ws.title} · Code Resonance`;if(r.id!=='stage')store.setUi({lastRoute:location.hash});
  if(currentId===r.id&&current?.route){current.route(r.params);return;}
  current?.unmount?.();current=null;clear(chrome);slot=null;
  // Messages from the Control Center (which may name a private project) do not follow onto the Stage.
  if(ws.immersive)for(const t of document.querySelectorAll('.toasts .toast'))t.remove();
  immersive=!!ws.immersive;document.body.classList.toggle('immersive',immersive);root.hidden=immersive;
  view=h('div',{class:'workspace-view',dataset:{ws:r.id}});clear(workspace).append(view);currentId=r.id;
  let mod;
  try{mod=(await import(`./workspaces/${r.id}.js`)).default;}
  catch(e){console.error(e);view.append(h('div',{class:'page'},h('div',{class:'page-inner'},h('h1',{class:'title-l',text:ws.title}),h('p',{class:'muted',text:`This workspace could not be loaded (${e.message}). Reload the page; if it persists, the receiver may be an older version.`}))));return;}
  if(mine!==token)return;
  current=mod.mount(view,{store,player:P,navigate,chrome,params:r.params,stageUrl,toggleRecording})||{};
  slot=view.querySelector('[data-stage-slot]');lastRect='';placeStage();
  // The heading of the new view receives focus for screen readers and keyboard users (not on the Stage).
  if(!immersive)(view.querySelector('h1')||view).setAttribute('tabindex','-1'),requestAnimationFrame(()=>(view.querySelector('h1')||view).focus({preventScroll:true}));
}
// ---- Keyboard ------------------------------------------------------------------------------------------------------
addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
  const typing=/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable;if(typing)return;
  if(document.querySelector('.modal-backdrop,.menu'))return;
  if(e.key==='f'||e.key==='F'){if(route().id!=='stage'){navigate('stage');e.preventDefault();}}
});
// ---- Boot --------------------------------------------------------------------------------------------------------
async function boot(){
  if(P.film)return;
  if(P.overlay){
    // The OBS view: the stage alone; it follows the project's saved settings (and the URL's pins) and never asks for
    // a control capability, so it can change nothing.
    document.body.classList.add('overlay');P.setVisible(true);
    await store.start({presentation:true});
    if(!store.state.selected&&params.get('project'))store.select(params.get('project'));
    store.on(()=>{});return;
  }
  root.append(nav,topbar,workspace);root.hidden=false;
  store.on(t=>{updateShell(t);if(t.has('notice'))showNotices();});
  updateShell(null);
  addEventListener('hashchange',render);
  if(!location.hash)history.replaceState(null,'',`${location.pathname}${location.search}#/home`);
  await render();
  requestAnimationFrame(trackStage);
  // A remembered pairing key is checked once (a receiver whose data was reset has a new key).
  if(P.pairing==='unknown')P.api.session({quiet:true}).catch(()=>{});
  await store.start();
}
boot().catch(e=>{console.error(e);document.body.append(h('div',{class:'callout danger'},h('div',{text:`The interface could not start: ${e.message}`})));});

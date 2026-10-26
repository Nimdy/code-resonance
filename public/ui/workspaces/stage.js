// The Performance Stage: the world fills the screen; controls appear when the pointer moves and fade away after a
// moment. Nothing here is drawn into recordings (they capture the world and its labels only). The title shown is the
// recipe's approved public title, never the project's folder name.
import {h,text,button,select,segmented,toast,styles} from '../dom.js';
import {icon} from '../icons.js';
import {timecode,clockTime,publicName,WORLD_NAMES,LABEL_NAMES,QUALITY_NAMES} from '../format.js';
const IDLE_MS=2600;
export default {mount(view,{store,player:P,navigate,chrome,stageUrl,toggleRecording}){
  styles('stage');
  const offs=[];
  // ---- Top: way back, the public title, presentation options -------------------------------------------------
  const title=h('div',{class:'stage-title'},h('strong',{id:'stageTitle'}),h('span',{id:'stageSub'}));
  const back=button({label:'Control Center',icon:'back',kind:'ghost',title:'Back to the Control Center',onClick:()=>{const r=store.state.ui.lastRoute;if(r&&r!=='#/stage')location.hash=r;else navigate('home');}});
  const labels=segmented({label:'Information on the stage',options:P.LABEL_MODES.map(m=>({value:m,label:LABEL_NAMES[m],title:{cinematic:'Titles and major moments only',explorer:'Click the world to inspect it',stream:'A lower third for streams (no private names)',off:'The world alone'}[m]})),
    value:P.state.labels,onChange:m=>setLabels(m)});
  const quality=select({id:'qualitySelect',label:'Rendering quality on this device',title:'Rendering quality on this device: Auto lowers it only while frames are slow',
    options:P.QUALITY.map(q=>({value:q,label:q==='auto'?'Quality · Auto':`Quality · ${QUALITY_NAMES[q]}`})),value:P.state.quality,onChange:q=>{store.unpin('quality');store.setDevice({quality:q});P.setQuality(q);}});
  const fullBtn=button({icon:'fullscreen',kind:'ghost',title:'Full screen (F)',onClick:()=>toggleFullscreen(),attrs:{'aria-label':'Full screen'}});
  const popBtn=button({icon:'external',kind:'ghost',title:'Open the Stage in a new window (for a second monitor)',onClick:()=>window.open(stageUrl(),'_blank','noopener'),attrs:{'aria-label':'Open in a new window'}});
  const infoBtn=button({icon:'info',kind:'ghost',title:'Show performance information',pressed:!!store.state.ui.stageInfo,onClick:()=>{store.setUi({stageInfo:!store.state.ui.stageInfo});infoBtn.setAttribute('aria-pressed',String(!!store.state.ui.stageInfo));renderInfo();},attrs:{'aria-label':'Performance information'}});
  const top=h('div',{class:'stage-top'},back,title,h('div',{class:'grow'}),labels,quality,infoBtn,popBtn,fullBtn);
  // ---- Bottom: transport, worlds, sound, record ------------------------------------------------------------------
  const liveBtn=h('button',{type:'button',class:'btn sm',id:'liveBtn','aria-pressed':'true',title:'Follow the work as it happens (about 10 s behind)'},icon('live'),h('span',{text:'Live'}));
  const replayBtn=h('button',{type:'button',class:'btn sm',id:'replayBtn','aria-pressed':'false',title:'Replay the recorded performance'},icon('replay'),h('span',{text:'Replay'}));
  liveBtn.addEventListener('click',()=>P.setMode('live'));replayBtn.addEventListener('click',()=>P.setMode('replay'));
  const playBtn=h('button',{type:'button',class:'btn icon play',id:'playBtn',disabled:true,title:'Play / pause (Space)','aria-label':'Play'},icon('play'));
  playBtn.addEventListener('click',()=>{P.togglePlay();});
  const scrub=h('input',{type:'range',class:'range',id:'scrub',min:0,max:1000,value:1000,disabled:true,'aria-label':'Replay position'});
  scrub.addEventListener('input',()=>{P.seekFraction(Number(scrub.value)/1000);});
  const startLabel=h('span',{class:'num tiny',id:'scrubStart'}),endLabel=h('span',{class:'num tiny',id:'scrubEnd'});
  const speed=select({id:'speedSelect',label:'Replay speed',options:[{value:1,label:'1×'},{value:4,label:'4×'},{value:16,label:'16×'}],value:P.state.speed,onChange:v=>P.setSpeed(Number(v))});
  const worlds=h('div',{class:'stage-worlds',role:'group','aria-label':'Visual world'},...P.WORLDS.map(w=>{
    const b=h('button',{type:'button',class:'btn sm world',dataset:{world:w},'aria-pressed':String(P.state.world===w),title:WORLD_NAMES[w]},h('span',{text:w==='living'?'Living':WORLD_NAMES[w].replace('The ','')}));
    b.addEventListener('click',()=>chooseWorld(w));return b;}));
  const soundBtn=button({icon:'sound-off',kind:'ghost',id:'stageSoundBtn',attrs:{'aria-label':'Sound','aria-pressed':'false'},title:'Sound',onClick:()=>P.toggleSound().catch(e=>toast(`Sound could not start: ${e.message}`,'error'))});
  const recBtn=h('button',{type:'button',class:'btn record sm',id:'stageRecordBtn','aria-pressed':'false'},h('span',{class:'dot'}),h('span',{class:'label',text:'Record'}));
  recBtn.addEventListener('click',()=>toggleRecording());
  const bottom=h('div',{class:'stage-bottom'},
    h('div',{class:'transport-row'},h('div',{class:'mode-toggle'},liveBtn,replayBtn),playBtn,h('div',{class:'scrub'},scrub,h('div',{class:'scrub-times'},startLabel,endLabel)),speed),
    h('div',{class:'transport-row second'},worlds,h('div',{class:'grow'}),soundBtn,recBtn));
  // ---- Messages over the stage --------------------------------------------------------------------------------
  const recPill=h('div',{class:'stage-rec',role:'status'});
  const notice=h('div',{class:'stage-notice',role:'status','aria-live':'polite'});
  const picked=h('div',{class:'stage-picked'});
  const info=h('div',{class:'stage-info'});
  const empty=h('div',{class:'stage-empty-msg'});
  // A title card names the world as the Stage opens or the world changes, then fades (the overlay is never recorded).
  const card=h('div',{class:'stage-card',role:'status','aria-live':'polite'},h('span',{class:'eyebrow'}),h('strong'),h('span',{class:'stage-card-sub'}));
  let cardTimer=null,cardKey='';
  function showCard(){const s=P.state;if(!s.project)return;const fam=s.world==='living'?(s.recipe?.familyName||null):WORLD_NAMES[s.world];if(!fam)return;
    const key=`${s.project}|${s.world}|${s.recipe?.family||''}`;if(key===cardKey)return;cardKey=key;
    text(card.children[0],s.world==='living'?'Living world':'Classic stage');text(card.children[1],fam);text(card.children[2],publicName(s.recipe));
    card.classList.remove('show');void card.offsetWidth;card.classList.add('show');clearTimeout(cardTimer);cardTimer=setTimeout(()=>card.classList.remove('show'),4200);}
  const shell=h('div',{class:'stage-chrome-ui chrome-pass',dataset:{idle:'false'}},top,recPill,notice,empty,picked,info,card,bottom);
  chrome.append(shell);
  // ---- Behaviour ---------------------------------------------------------------------------------------------
  // A choice made on the Stage is saved for the project, so every window follows; choosing the global default goes back
  // to following it (null), so a later change in Settings applies to this project again.
  function setLabels(m){P.setLabels(m);if(!store.state.selected)return;store.unpin('labels');
    const value=m===(store.state.settings?.stage?.labels||'cinematic')?null:m;if((P.state.recipe?.overrides?.labels??null)===value)return;
    P.recipeAction({type:'overrides',labels:value}).catch(e=>toast(`Shown here, but not saved for this project: ${e.message}`,'warning'));}
  async function chooseWorld(w){store.unpin('world');P.setWorld(w);if(!store.state.selected)return;
    const value=w===(store.state.settings?.stage?.world||'living')?null:w;if((store.preferences()?.world??null)===value)return;
    try{await store.savePreferences({world:value});}catch(e){toast(`Shown here, but not saved for this project: ${e.message}`,'warning');}}
  function toggleFullscreen(){if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(e=>toast(`Full screen is not available: ${e.message}`,'warning'));}
  const onFull=()=>{const on=!!document.fullscreenElement;fullBtn.replaceChildren(icon(on?'exit-fullscreen':'fullscreen'));fullBtn.title=on?'Leave full screen (F or Esc)':'Full screen (F)';};
  document.addEventListener('fullscreenchange',onFull);offs.push(()=>document.removeEventListener('fullscreenchange',onFull));
  // Controls fade after a moment without movement (never while a control has focus or the pointer is over them).
  let idleTimer=null;
  const wake=()=>{shell.dataset.idle='false';document.body.classList.remove('stage-idle');clearTimeout(idleTimer);
    idleTimer=setTimeout(()=>{if(shell.matches(':hover'))return wake();if(shell.contains(document.activeElement)&&document.activeElement!==document.body&&document.activeElement.matches(':focus-visible'))return wake();
      shell.dataset.idle='true';document.body.classList.add('stage-idle');},IDLE_MS);};
  for(const ev of ['mousemove','pointerdown','keydown','touchstart'])addEventListener(ev,wake,{passive:true}),offs.push(()=>removeEventListener(ev,wake));
  wake();
  const onKey=e=>{
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)&&document.activeElement.type!=='range')return;
    if(document.querySelector('.modal-backdrop'))return;
    if(e.key==='f'||e.key==='F'){e.preventDefault();toggleFullscreen();}
    else if(e.key===' '&&P.state.mode==='replay'&&document.activeElement?.tagName!=='BUTTON'){e.preventDefault();P.togglePlay();}
    else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&P.state.mode==='replay'&&document.activeElement?.id!=='scrub'){e.preventDefault();P.seek(P.state.position.now+(e.key==='ArrowLeft'?-10000:10000)*(P.state.speed||1));}
  };
  addEventListener('keydown',onKey);offs.push(()=>removeEventListener('keydown',onKey));
  // The fictional demonstration says so here too (this layer is never recorded).
  const demoPill=h('span',{class:'pill warn',text:'Demonstration (fictional)'});title.after(demoPill);
  function renderTitle(){const s=P.state;text(document.getElementById('stageTitle'),publicName(s.recipe));demoPill.hidden=!store.project()?.evidence?.demonstration;
    text(document.getElementById('stageSub'),`${s.world==='living'?(s.preview?'Preview · ':'')+(s.recipe?.familyName||'Living world'):WORLD_NAMES[s.world]} · ${s.mode==='live'?'Live':'Replay'}`);}
  function renderTransport(){
    const s=P.state,live=s.mode==='live',pos=s.position;
    liveBtn.setAttribute('aria-pressed',String(live));replayBtn.setAttribute('aria-pressed',String(!live));
    playBtn.disabled=live||!pos.loaded||!pos.events;playBtn.replaceChildren(icon(s.playing?'pause':'play'));playBtn.setAttribute('aria-label',s.playing?'Pause':'Play');
    scrub.disabled=live||!pos.loaded;
    if(document.activeElement!==scrub)scrub.value=String(live?1000:Math.round(((pos.now-pos.start)/((pos.end-pos.start)||1))*1000));
    scrub.style.setProperty('--fill',`${Number(scrub.value)/10}%`);
    text(startLabel,live?'':pos.start?clockTime(pos.start):'');text(endLabel,live?'Now':pos.loaded?`${timecode(pos.now-pos.start)} / ${timecode(pos.end-pos.start)}`:'Loading…');
    speed.value=String(s.speed);speed.disabled=live;
  }
  function renderWorlds(){for(const b of worlds.querySelectorAll('[data-world]'))b.setAttribute('aria-pressed',String(b.dataset.world===P.state.world));}
  function renderSound(){const on=P.state.sound.enabled;soundBtn.setAttribute('aria-pressed',String(on));soundBtn.replaceChildren(icon(on?'sound-on':'sound-off'));soundBtn.title=on?'Sound on (click to mute)':'Enable sound';}
  function renderRecording(){const r=P.state.recording,other=!r.active&&!!store.state.others.recording;
    recBtn.setAttribute('aria-pressed',String(r.active));text(recBtn.querySelector('.label'),r.active?`Stop ${timecode(r.stats.elapsedMs)}`:other?'Recording elsewhere':'Record');recBtn.disabled=other;
    recPill.replaceChildren();if(r.active)recPill.append(h('span',{class:'pill record live',text:`REC ${timecode(r.stats.elapsedMs)} · ${r.size==='stage'?'stage size':r.size}${r.audio&&!r.audioLost?'':' · no sound'}`}));}
  function renderNotice(){
    const s=P.state,w=s.worldStatus;notice.replaceChildren();
    const msg=s.preview?.notice||w.notice;
    if(w.stopped){notice.append(h('div',{class:'callout warn'},icon('warn'),h('div',{class:'callout-body'},h('div',{text:`${w.stopped.name} stopped: ${w.stopped.reason}. Showing the identity without it.`}),
      h('div',{class:'callout-actions'},button({label:'Retry',size:'sm',id:'retryPack',onClick:()=>P.retryPack()}),button({label:'Visual Packs',size:'sm',kind:'ghost',onClick:()=>navigate('packs')})))));}
    else if(msg)notice.append(h('div',{class:'callout'},icon('info'),h('div',{class:'callout-body',text:msg})));
    if(s.preview)notice.prepend(h('div',{class:'pill accent',text:'Preview · not saved'}));
  }
  function renderEmpty(){
    const s=P.state,st=store.state;empty.replaceChildren();
    if(s.receiver===false)empty.append(h('div',{class:'callout danger'},icon('warn'),h('div',{class:'callout-body'},h('strong',{text:'The receiver is not answering'}),h('div',{text:'Start it again with npm start; the Stage reconnects by itself.'}))));
    else if(st.projectsLoaded&&!st.projects.length)empty.append(h('div',{class:'callout'},icon('info'),h('div',{class:'callout-body'},h('strong',{text:'No project yet'}),h('div',{text:'Start capture in VS Code (CODE RESONANCE: Start Code Performance); the project appears here within seconds.'}),
      h('div',{class:'callout-actions'},button({label:'How to connect',size:'sm',onClick:()=>navigate('connections')})))));
  }
  function renderPicked(){picked.replaceChildren();const p=P.state.picked;if(!p||P.state.labels!=='explorer')return;
    picked.append(h('div',{class:'picked-card'},h('strong',{text:p.text||'Selected'}),p.sub?h('span',{text:p.sub}):null));}
  function renderInfo(){info.replaceChildren();if(!store.state.ui.stageInfo)return;const s=P.state,f=s.frame||{},c=f.controls||{};
    info.append(h('div',{class:'info-card'},
      h('div',{class:'info-grid'},...[['Bar',s.bar?String(s.bar).padStart(3,'0'):'—'],['Key',s.key||'—'],['Section',s.sound.enabled&&s.bar?s.section:'—'],['Chapter',f.chapter||'—'],['Energy',`${Math.round((c.energy||0)*100)}`],['Tension',`${Math.round((c.tension||0)*100)}`]]
        .map(([k,v])=>h('div',{},h('span',{class:'eyebrow',text:k}),h('b',{class:'num',text:v})))),
      h('div',{class:'info-feed'},...P.feed(5).map(e=>h('div',{class:['feed-line',e.kind]},h('span',{class:'num faint',text:clockTime(e.ts)}),h('span',{text:e.label})))),
      h('div',{class:'tiny faint',text:'Interpretation is not proof of correctness. Only hashed identities reach the stage.'})));}
  function renderAll(){renderTitle();renderTransport();renderWorlds();renderSound();renderRecording();renderNotice();renderEmpty();renderPicked();renderInfo();labels.set(P.state.labels);quality.value=P.state.quality;}
  renderAll();showCard();
  let infoAt=0;
  offs.push(store.on(t=>{
    if(t.has('recipe')||t.has('world')||t.has('mode')||t.has('preview')||t.has('selection')||t.has('projects'))renderTitle();
    if(t.has('recipe')||t.has('world'))showCard();
    if(t.has('position')||t.has('mode'))renderTransport();
    if(t.has('world'))renderWorlds();
    if(t.has('sound'))renderSound();
    if(t.has('recording')||t.has('others'))renderRecording();
    if(t.has('notice')||t.has('world')||t.has('preview')||t.has('recipe'))renderNotice();
    if(t.has('receiver')||t.has('projects'))renderEmpty();
    if(t.has('picked')||t.has('labels'))renderPicked();
    if(t.has('labels'))labels.set(P.state.labels);
    if(t.has('quality'))quality.value=P.state.quality;
    if(store.state.ui.stageInfo&&(t.has('feed')||t.has('frame'))&&performance.now()-infoAt>500){infoAt=performance.now();renderInfo();}
  }));
  return {unmount(){for(const f of offs)f();clearTimeout(idleTimer);clearTimeout(cardTimer);document.body.classList.remove('stage-idle');if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});}};
}};

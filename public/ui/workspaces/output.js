// Record & Broadcast: everything that leaves Code Resonance, and how. Three different paths, each with its real action:
// a live recording (the browser's MediaRecorder: the world, its labels and the music as they play, downloaded as WebM),
// the OBS view (a URL an OBS Browser Source shows: the stage alone), and exports of the recorded performance (WAV, JSON,
// deterministic films). The slot shows the stage exactly as it is recorded: controls live outside it, never in a file.
import {h,text,button,segmented,toggle,callout,copyable,kv,section,disclosure,toast,pill,setLabel,styles} from '../dom.js';
import {icon} from '../icons.js';
import {timecode,duration,bytes,clockTime,publicName,WORLD_NAMES,STYLE_NAMES} from '../format.js';
import {openDoc} from '../markdown.js';
// The engine's sizes and bitrates (app.js RECORD_SIZES / RECORD_BITRATE; "stage" in proportion, 2.5-8 Mbit/s).
const PROFILES=[
  {id:'720p',name:'Standard',tag:'720p',size:[1280,720],rate:5e6,note:'Holds 30 frames per second on modest GPUs. The default.'},
  {id:'1080p',name:'High quality',tag:'1080p',size:[1920,1080],rate:8e6,note:'Sharper. The built-in worlds may not hold 30 fps on an integrated GPU.'},
  {id:'stage',name:'Stage size',tag:'Stage',size:null,rate:null,note:'The stage as it is on screen when recording starts, any shape.'}];
const even=n=>Math.max(2,Math.round(n/2)*2);
const mbit=n=>`${(n/1e6).toFixed(n%1e6?1:0)} Mbit/s`;
// Scrolling follows the app's Motion setting first, then the system's (html[data-motion] is set only when not "system").
const smooth=()=>{const m=document.documentElement.dataset.motion;return m==='full'||(m!=='reduce'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)?'smooth':'auto';};
const OBS_LABELS=[{value:'stream',label:'Stream',title:'A lower third with the public title (the OBS default)'},{value:'cinematic',label:'Cinematic',title:'Titles and major moments only'},{value:'off',label:'Off',title:'The world alone'}];
export default {mount(view,{store:S,player:P,navigate,chrome,toggleRecording}){
  styles('output');
  const offs=[];
  // ---- The monitor: the stage as recorded, and the one recorder -------------------------------------------------
  const slot=h('div',{class:'stage-slot out-slot','data-stage-slot':'',role:'img','aria-label':'The stage as it will be recorded: the world and its labels'});
  const recBtn=button({label:'Record',kind:'',size:'lg',id:'outRecordBtn',attrs:{class:'btn record lg','aria-pressed':'false'},onClick:()=>toggleRecording().then(renderRecording)});
  // The dot is not a span: setLabel() rewrites the button's first span.
  recBtn.prepend(h('i',{class:'dot','aria-hidden':'true'}));
  const clock=h('span',{class:'out-clock num',id:'outElapsed',text:'00:00'});
  const stateLine=h('span',{class:'out-state small',id:'outState'});
  const readout=(label,id)=>h('div',{class:'out-readout'},h('span',{class:'eyebrow',text:label}),h('b',{class:'num',id}));
  const deck=h('div',{class:'out-deck'},recBtn,h('div',{class:'out-time'},clock,stateLine),
    h('div',{class:'out-readouts'},readout('Size','outSize'),readout('Frames','outFrames'),readout('Data','outBytes'),readout('Sound','outSound')));
  const notice=h('div',{class:'out-notice',role:'status','aria-live':'polite'});
  const last=h('div',{class:'out-last',id:'outLast'});
  // Overlay on the slot (not recorded either): what this window is doing with the stage.
  const badge=h('div',{class:'slot-badge'});chrome.append(h('div',{class:'chrome-pass out-chrome'},badge));
  // ---- Profiles: the recording's dimensions, saved globally (every window records at the same profile) -------------
  const cards=PROFILES.map(p=>{const dims=h('span',{class:'num out-dims'}),rate=h('span',{class:'num faint'});
    const b=h('button',{type:'button',class:'out-profile',role:'radio','aria-checked':'false',dataset:{profile:p.id}},
      h('span',{class:'out-profile-head'},h('strong',{text:p.name}),h('span',{class:'out-tag num',text:p.tag})),h('span',{class:'out-profile-meta'},dims,rate),h('span',{class:'out-profile-note',text:p.note}));
    b.dims=dims;b.rate=rate;b.addEventListener('click',()=>chooseProfile(p.id));
    b.addEventListener('keydown',e=>{const k=e.key==='ArrowDown'||e.key==='ArrowRight'?1:e.key==='ArrowUp'||e.key==='ArrowLeft'?-1:0;if(!k)return;e.preventDefault();
      const i=(PROFILES.indexOf(p)+k+PROFILES.length)%PROFILES.length;cards[i].focus();if(!cards[i].disabled)chooseProfile(PROFILES[i].id);});
    return b;});
  const profiles=h('div',{class:'out-profiles',role:'radiogroup','aria-label':'Recording profile','aria-describedby':'outProfileHelp'},...cards);
  const obsCard=h('button',{type:'button',class:'out-profile obs',id:'outObsProfile'},
    h('span',{class:'out-profile-head'},h('strong',{text:'OBS presentation'}),h('span',{class:'out-tag num',text:'OBS'})),
    h('span',{class:'out-profile-meta'},h('span',{class:'num out-dims',text:'1920 × 1080'}),h('span',{class:'faint',text:'in OBS'})),
    h('span',{class:'out-profile-note',text:'Not a recording: sets up the OBS view below for a Browser Source.'}));
  obsCard.addEventListener('click',()=>presentObs());
  const profileHelp=h('p',{class:'field-doc',id:'outProfileHelp'});
  const facts=h('div',{class:'out-facts'});
  const perf=disclosure({summary:'Performance and limits'},
    h('p',{class:'field-doc',text:'720p is the default because it holds 30 frames per second on modest GPUs. At 1080p the built-in worlds (drawn on this page) may keep only 26-28 frames per second on an integrated GPU; visual packs, drawn in their own worker, usually hold 30. A recording that cannot keep up for ten seconds says so once.'}),
    h('p',{class:'field-doc',text:'The browser keeps the file in memory until you stop: about 60 MB a minute at 720p and 90 MB at 1080p. For sessions longer than half an hour, use OBS.'}));
  const side=h('aside',{class:'out-side panel','aria-labelledby':'outProfileTitle'},
    h('div',{class:'out-side-head'},h('h2',{class:'title-m',id:'outProfileTitle',text:'Recording profile'}),h('span',{class:'faint small',text:'Saved for every window of Code Resonance'})),
    profiles,profileHelp,obsCard,facts,perf,
    h('div',{class:'out-side-foot'},button({label:'How recording works',icon:'doc',kind:'ghost',size:'sm',onClick:()=>openDoc('RECORDING.md')})));
  const monitor=h('div',{class:'out-monitor'},h('div',{class:'out-main'},slot,deck,notice,last),side);
  // ---- OBS -----------------------------------------------------------------------------------------------------------
  const obsPrefs={labels:'stream',world:false,style:false,...(S.state.ui.obs||{})};
  const obsLabels=segmented({label:'Information shown in the OBS view',id:'obsLabels',options:OBS_LABELS,value:obsPrefs.labels,onChange:v=>setObs({labels:v})});
  const pinWorld=toggle({id:'obsPinWorld',checked:obsPrefs.world,onChange:v=>setObs({world:v})}),pinStyle=toggle({id:'obsPinStyle',checked:obsPrefs.style,onChange:v=>setObs({style:v})});
  const pinWorldText=h('span',{class:'small'}),pinStyleText=h('span',{class:'small'});
  pinWorld.append(pinWorldText);pinStyle.append(pinStyleText);
  const follow=h('p',{class:'field-doc',id:'obsFollow'});
  const obsUrl=copyable('',{label:'Copy URL'});obsUrl.id='obsUrl';
  const openBtn=button({label:'Open the OBS view',icon:'external',id:'obsOpen',onClick:()=>{const u=buildObs();if(u)window.open(u,'_blank','noopener');}});
  const obsTitle=h('span',{id:'obsTitle'});
  const obsEmpty=h('div',{class:'out-obs-empty'});
  const builder=h('div',{class:'panel out-obs-builder'},
    h('div',{class:'out-field'},h('span',{class:'field-label',text:'Information on the stage'}),obsLabels,h('p',{class:'field-doc',text:'Stream is the OBS default: a lower third with the public title. Explorer needs a pointer, so it is not offered here.'})),
    h('div',{class:'out-field'},h('span',{class:'field-label',text:'World and music'}),follow,h('div',{class:'out-pins'},pinWorld,pinStyle)),
    h('div',{class:'out-field'},h('span',{class:'field-label',text:'Browser Source URL'}),obsUrl,h('div',{class:'out-row'},openBtn,h('span',{class:'faint small',text:'Opens it here to check it before OBS.'}))),
    obsEmpty);
  const steps=h('ol',{class:'out-steps'},
    h('li',{},h('span',{text:'In OBS: '}),h('strong',{text:'Sources → + → Browser'}),h('span',{text:'.'})),
    h('li',{},h('span',{text:'URL: the Browser Source URL. '}),h('strong',{text:'Width 1920, height 1080'}),h('span',{text:'. Frame rate 30 or 60.'})),
    h('li',{},h('span',{text:'Turn on '}),h('strong',{text:'Control audio via OBS'}),h('span',{text:': the music then reaches OBS’s mixer, its recordings and streams.'})),
    h('li',{},h('span',{text:'Turn off '}),h('strong',{text:'Shutdown source when not visible'}),h('span',{text:': the performance keeps its place while you switch scenes.'})),
    h('li',{},h('span',{text:'Leave the default custom CSS as it is. The music starts by itself (sound=1): OBS allows it without a click.'})));
  const obsInfo=h('div',{class:'out-obs-info'},
    h('div',{class:'out-field'},h('span',{class:'eyebrow',text:'Set up in OBS Studio'}),steps),
    callout({kind:'accent',icon:'shield-check',title:'Nothing private reaches OBS',body:h('div',{},
      h('p',{},'The OBS view shows the stage alone: no controls, no project list, no folder names, paths, prompts or commands. Its only text is the public title: ',obsTitle,'.'),
      h('p',{text:'It holds no control capability, so it cannot change anything. It answers on this computer only: run OBS here, rather than opening the receiver to the network.'})),
      actions:[button({label:'Set the public title',size:'sm',onClick:()=>navigate('visual')}),button({label:'OBS guide',icon:'doc',size:'sm',kind:'ghost',onClick:()=>openDoc('OBS.md')})]}));
  const obsSection=section({title:'Broadcast with OBS',subtitle:'the stage alone, live, for streams and long sessions',id:'outObs'},h('div',{class:'out-obs'},builder,obsInfo));
  // ---- Export and replay ----------------------------------------------------------------------------------------
  const exportBtn=button({label:'Export audio',icon:'wave',id:'exportAudioBtn',onClick:()=>exportAudio()});
  const exportNote=h('p',{class:'field-doc',id:'exportAudioNote'});
  const dataLink=h('a',{class:'btn',id:'exportDataLink',download:''},icon('download'),h('span',{text:'Download JSON'}));
  const filmCmd=copyable('',{label:'Copy'}),filmSetup=copyable('cd qualification && npm ci',{label:'Copy'});
  let dataDir=null;
  const kind=(ic,title,what,body,action)=>h('div',{class:'out-kind'},h('div',{class:'out-kind-icon'},icon(ic)),
    h('div',{class:'out-kind-body'},h('div',{class:'out-kind-head'},h('strong',{text:title}),h('span',{class:'faint small',text:what})),...[].concat(body)),action?h('div',{class:'out-kind-action'},action):null);
  const kinds=h('div',{class:'panel out-kinds'},
    kind('record','Live recording','WebM · picture and music',h('p',{class:'field-doc',text:'What this window shows, as it plays: the world, its labels and the music, at the profile above. Saved by the browser when you stop.'}),
      button({label:'Record above',kind:'ghost',size:'sm',onClick:()=>{slot.scrollIntoView({block:'center',behavior:smooth()});recBtn.focus({preventScroll:true});}})),
    kind('wave','Audio export','WAV · music only',exportNote,exportBtn),
    kind('code','Performance data','JSON · the derived history',h('p',{class:'field-doc',text:'The performance as the receiver interpreted it: statistics, sessions and every timeline window, with hashed identities only (no file names, source or prompts). For analysis or archiving; it is not a video.'}),dataLink),
    kind('film','Deterministic film','WebM · developer tool',[h('p',{class:'field-doc',text:'Renders a recorded performance frame by frame at exact performance times (any length, independent of this machine’s speed), with the music rendered offline and muxed by ffmpeg. It runs from the repository with its own browser and its own receiver on the data folder: stop the receiver first, or point --data at a copy.'}),
      h('div',{class:'out-cmds'},filmSetup,filmCmd)]),
    kind('broadcast','OBS broadcasting','live · no file here',h('p',{class:'field-doc',text:'OBS shows, records and streams the stage itself: nothing is kept in this browser, so length is not limited by memory.'}),
      button({label:'Set up OBS',kind:'ghost',size:'sm',onClick:()=>presentObs(false)})));
  const exportSection=section({title:'Export and replay',subtitle:'different things, each with its own action'},kinds);
  view.append(h('div',{class:'page ws-output'},h('div',{class:'page-inner'},
    h('header',{class:'page-head'},h('div',{class:'grow'},h('span',{class:'eyebrow',text:'Output'}),h('h1',{class:'title-l',text:'Record & Broadcast'}),
      h('p',{class:'muted',text:'Record the stage and its music to a file, or show it live in OBS. The frame below is exactly what is recorded: the world and its labels, never the controls.'}))),
    monitor,obsSection,exportSection)));
  // ---- Behaviour ---------------------------------------------------------------------------------------------
  // A choice being saved stays shown as chosen (other updates arrive meanwhile, four a second while recording).
  let pending=null;
  const saved=()=>pending||S.state.settings?.recording?.profile||'720p';
  async function chooseProfile(id){
    if(P.record.active)return;
    const before=S.state.settings?.recording?.profile||'720p';pending=id;renderProfiles();
    // Applied here at once, then saved: every window records at the same profile, and the receiver's answer wins.
    P.record.setSize(id);
    try{await S.saveSettings({recording:{profile:id}});}
    catch(e){P.record.setSize(before);toast(`The recording profile could not be saved: ${e.message}`,'error');}
    pending=null;renderProfiles();renderFacts();renderRecording();
  }
  function stageSize(){
    // The engine records the stage's canvas area at up to 1.5 device pixels per pixel (app.js toggleRecord). The slot is
    // measured, not #stageHost: the shell places the stage on it only after this view mounts, and it is where it will be.
    const r=slot.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);
    if(!r||r.width<2)return null;return [even(Math.max(320,r.width*dpr)),even(Math.max(180,r.height*dpr))];
  }
  const sizeOf=id=>id==='stage'?stageSize():PROFILES.find(p=>p.id===id).size;
  const rateOf=(id,s)=>id==='stage'?(s?Math.round(Math.min(8e6,Math.max(2.5e6,8e6*s[0]*s[1]/(1920*1080)))):null):PROFILES.find(p=>p.id===id).rate;
  function renderProfiles(){
    const r=P.state.recording,current=saved(),locked=r.active;
    for(const b of cards){const id=b.dataset.profile,on=id===current,s=sizeOf(id);
      b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;b.disabled=locked;
      text(b.dims,s?`${s[0]} × ${s[1]}`:'—');const rate=rateOf(id,s);text(b.rate,rate?mbit(rate):'');}
    text(profileHelp,locked?`Recording at ${r.stats.width} × ${r.stats.height}: the profile can change once this recording stops.`:
      current==='stage'?'Stage size follows the stage where recording starts: here, this frame; on the Performance Stage, the whole window.':'The world renders at exactly this size while recording; the stage shows it letterboxed, so what you see is what is recorded.');
  }
  function renderFacts(){
    const s=P.state,r=s.recording,sup=r.supported,snd=s.sound;
    const dims=r.active?[r.stats.width,r.stats.height]:r.dimensions||stageSize();
    facts.replaceChildren(kv([
      ['Output',h('span',{class:'num',id:'outDims',text:dims?`${dims[0]} × ${dims[1]}${!r.active&&r.size==='stage'?' (now)':''}`:'—'})],
      ['Browser',sup.ok?h('span',{},pill('Supported','ok'),h('span',{class:'faint num small',text:` ${String(sup.mimeType).replace('video/','')}`})):h('span',{class:'danger',id:'outSupport',text:sup.reason})],
      ['Sound',h('span',{id:'outAudio',text:snd.enabled?'On: the recording includes the music':snd.error?`Off (${snd.error}): Record tries to turn it on`:'Off: Record turns it on, so the file includes the music'})]]));
  }
  function renderRecording(){
    const s=P.state,r=s.recording,st=r.stats,other=!r.active&&!!S.state.others.recording,preview=!r.active&&!!s.preview,unsupported=!r.active&&!r.supported.ok;
    recBtn.setAttribute('aria-pressed',String(r.active));
    setLabel(recBtn,r.active?'Stop and save':other?'Recording in another window':unsupported?'Recording unavailable':preview?'Preview open':'Record');
    if(!recBtn.hasAttribute('aria-busy'))recBtn.disabled=other||preview||unsupported;
    recBtn.title=other?'Another Code Resonance window is recording: stop it there first':preview?'Apply or cancel the Visual Studio preview first: a recording shows the saved identity':r.active?'Stop and save the recording':'Record the stage and the music to a WebM file';
    text(clock,timecode(r.active?st.elapsedMs:0));clock.classList.toggle('live',r.active);
    text(stateLine,r.active?`Recording · ${r.size==='stage'?'stage size':r.size}`:other?'Another window is recording (one recording at a time)':preview?'An unsaved preview is open in Visual Studio':unsupported?'This browser cannot record':`Ready · ${saved()==='stage'?'stage size':saved()}`);
    text(document.getElementById('outSize'),r.active?`${st.width}×${st.height}`:'—');
    text(document.getElementById('outFrames'),r.active?st.frames.toLocaleString():'—');
    text(document.getElementById('outBytes'),r.active?bytes(st.bytes):'—');
    const sound=document.getElementById('outSound');text(sound,r.active?(r.audio?(r.audioLost?'Lost':'Music'):'None'):'—');sound.className=`num ${r.active?(r.audio&&!r.audioLost?'ok':'warn'):''}`;
    deck.classList.toggle('active',r.active);
    badge.replaceChildren(...[r.active?pill(`REC ${timecode(st.elapsedMs)}`,'record live'):pill('As recorded','plain'),s.preview?pill('Preview · not saved','accent'):null,demo()?pill('Demonstration (fictional)','warn'):null].filter(Boolean));
    // A live region: rebuilt only when its message changes (this runs four times a second while recording).
    const key=`${r.notice}|${r.active&&!r.audio}`;
    if(key!==noticeKey){noticeKey=key;notice.replaceChildren();
      if(r.notice)notice.append(callout({kind:'warn',icon:'warn',title:'Not keeping up',body:r.notice}));
      if(r.active&&!r.audio)notice.append(callout({kind:'warn',icon:'sound-off',body:'Recording without sound: the music output could not be captured.'}));}
    renderLast();
  }
  let lastAt=-1,noticeKey='';
  const demo=()=>!!S.project()?.evidence?.demonstration;
  function renderLast(){
    const l=P.state.recording.last;if((l?.at||0)===lastAt&&last.childElementCount)return;lastAt=l?.at||0;
    const where=h('p',{class:'field-doc',text:'Recordings are saved by the browser to its downloads folder. Code Resonance keeps no copy and no library.'});
    if(!l){last.replaceChildren(h('div',{class:'out-last-empty'},h('span',{class:'eyebrow',text:'Last recording'}),h('span',{class:'small muted',text:'None in this window yet.'})),where);return;}
    const early=l.reason&&l.reason!=='stopped';
    last.replaceChildren(...[h('div',{class:'out-last-head'},h('span',{class:'eyebrow',text:'Last recording'}),h('span',{class:'faint small',text:clockTime(l.at)})),
      early?callout({kind:'warn',icon:'warn',title:'Finished early',body:`Recording finished early (${l.reason}); ${Math.round(l.durationMs/1000)} s saved.`}):null,
      kv([['File',l.file?h('code',{text:l.file}):h('span',{class:'danger',text:'None: the browser produced no file'})],['Length',duration(l.durationMs)],['Size',l.size.replace('x',' × ')],['Data',bytes(l.bytes)],
        ['Sound',l.audio?(l.audioLost?`Lost during the recording (${duration(l.audioLostMs)} affected)`:'The music is included'):'None: the music output could not be captured'],
        l.slowWarning?['Pace','Did not keep 30 frames per second: choose 720p or a lower Quality']:['Pace',undefined]]),where].filter(Boolean));
  }
  function setObs(patch){Object.assign(obsPrefs,patch);S.setUi({obs:{...obsPrefs}});renderObs();}
  function buildObs(){
    const id=S.state.selected;if(!id)return '';const s=P.state;
    const q=new URLSearchParams({overlay:'1',sound:'1',project:id});
    if(obsPrefs.labels!=='stream')q.set('labels',obsPrefs.labels);
    if(obsPrefs.world)q.set('world',s.world);if(obsPrefs.style)q.set('style',s.sound.options.style);
    return `${location.origin}/?${q.toString()}`;
  }
  function renderObs(){
    const s=P.state,id=S.state.selected,e=S.effective();
    obsLabels.set(obsPrefs.labels);pinWorld.set(obsPrefs.world);pinStyle.set(obsPrefs.style);
    text(pinWorldText,`Pin the world shown here: ${WORLD_NAMES[s.world]||s.world}`);text(pinStyleText,`Pin the music style heard here: ${STYLE_NAMES[s.sound.options.style]||s.sound.options.style}`);
    text(follow,obsPrefs.world||obsPrefs.style?'Pinned choices stay in the URL; anything not pinned follows the project’s saved settings when the source loads.':
      `By default the view follows the project’s saved world and music (now ${WORLD_NAMES[e.world]||e.world}, ${STYLE_NAMES[e.music.style]||e.music.style}), so changing them here changes OBS on its next load.`);
    const u=buildObs();obsUrl.set(u||'Choose a project first');obsUrl.querySelector('button').disabled=!u;openBtn.disabled=!u;
    text(obsTitle,`“${publicName(s.recipe)}”`);
    // The OBS view (like a recording) shows only the public title: nothing in it says the demonstration is fictional.
    obsEmpty.replaceChildren(!id?callout({kind:'warn',icon:'info',body:'No project yet: the OBS view needs a project. Start capture in VS Code, then come back.',actions:[button({label:'Connections',size:'sm',onClick:()=>navigate('connections')})]}):
      demo()?callout({kind:'warn',icon:'warn',title:'Demonstration (fictional)',body:'This project was written by npm run demo: nothing in it comes from real work. The OBS view and recordings show only its public title, with nothing saying it is fictional, so do not present them as real work.'}):'');
  }
  function presentObs(reset=true){
    // The OBS presentation: the recommended Browser Source (stream information, following the project).
    if(reset)setObs({labels:'stream',world:false,style:false});
    document.getElementById('outObs').scrollIntoView({block:'start',behavior:smooth()});
    (obsUrl.querySelector('button:not(:disabled)')||obsLabels.querySelector('[aria-checked="true"]'))?.focus({preventScroll:true});
    if(reset)toast('OBS view set up: copy the URL into a Browser Source of 1920 × 1080. Nothing is recorded here.','info');
  }
  async function exportAudio(){
    try{const r=await P.exportAudio();
      if(r)toast(`Saved ${r.file} (${duration(r.seconds*1000)} of the performance) to your downloads.`,'ok');
      else toast(S.state.selected?'Nothing to export: this project has no recorded performance yet.':'Choose a project first.','warning');}
    catch(e){toast(`The audio export failed: ${e.message}`,'error');}
    renderExport();
  }
  function renderExport(){
    const s=P.state,id=S.state.selected,busy=!!s.exporting;
    exportBtn.disabled=busy||!id;setLabel(exportBtn,busy?'Rendering…':'Export audio');exportBtn.setAttribute('aria-busy',String(busy));
    text(exportNote,`The music of up to 10 minutes of the recorded performance, rendered offline (faster than real time, identical on every machine) in the current style, ${STYLE_NAMES[s.sound.options.style]||s.sound.options.style}. ${s.mode==='replay'?'From the replay’s playhead.':'Live: the last 10 minutes; in Replay it starts at the playhead.'}`);
    if(id){dataLink.href=`/api/export?id=${encodeURIComponent(id)}`;dataLink.removeAttribute('aria-disabled');dataLink.tabIndex=0;}
    else{dataLink.removeAttribute('href');dataLink.setAttribute('aria-disabled','true');dataLink.tabIndex=-1;}
    filmCmd.set(`node visual/film.js --data ${dataDir?`"${dataDir}"`:'<data folder>'} --project ${id||'<project id>'} --out results/visual/film.webm`);
  }
  // The data folder is only told to a page holding a control capability (this one, on this computer).
  P.api.request('GET','/api/status').then(st=>{dataDir=st?.dataDir||null;renderExport();}).catch(()=>{});
  // The Stage size card shows the slot's size whatever the chosen profile, so every resize re-renders it.
  const ro=new ResizeObserver(()=>{renderProfiles();renderFacts();});ro.observe(slot);offs.push(()=>ro.disconnect());
  renderProfiles();renderFacts();renderRecording();renderObs();renderExport();
  offs.push(S.on(t=>{
    if(t.has('recording')||t.has('others')||t.has('preview')||t.has('selection')||t.has('projects'))renderRecording();
    if(t.has('recording')||t.has('settings')){renderProfiles();renderFacts();}
    if(t.has('sound')||t.has('receiver'))renderFacts();
    if(t.has('world')||t.has('sound')||t.has('recipe')||t.has('selection')||t.has('settings')||t.has('preferences')||t.has('projects'))renderObs();
    if(t.has('export')||t.has('selection')||t.has('mode')||t.has('sound'))renderExport();
  }));
  return {unmount(){for(const f of offs)f();}};
}};

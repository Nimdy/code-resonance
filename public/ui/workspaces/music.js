// Music Studio: how the project's generated score is performed. The score itself (key, mode, motif, progressions, the
// project's tempo for each style) is derived from the project's seed and never changes; what a person chooses here is
// the performance: the style (instrument palette and room), where the tempo comes from, the texture and the volume.
// Every edit is a preview first (store.previewMusic: heard from the next bar, in this window only) and is saved to one
// scope on Apply: this project (its preferences; null = inherit) or the global defaults (settings). Volume is a mixing
// level, global only, saved when the slider is released. Nothing here starts audio by itself: browsers need a click.
import {h,text,button,segmented,slider,section,disclosure,pill,callout,emptyState,modal,confirmDialog,toast,styles} from '../dom.js';
import {projectName,STYLE_NAMES} from '../format.js';
const STYLES=['ambient','pulse','cinematic','chip'];
const MUSIC_KEYS=['style','texture','tempoMode','tempo'];
const DEFAULTS={style:'ambient',volume:.55,texture:.58,tempoMode:'project',tempo:92};
const PRESET_NAME=/^[\p{L}\p{N} .,'&()-]{1,40}$/u;
// What each palette really plays (public/music.js PATCH, score.js INSTRUMENT) and its room (music.js REVERB, seconds).
// The engine does not export these, so they are mirrored here: keep them in step with music.js.
const STYLE_INFO={
  ambient:{tag:'Drift',voices:'Sine bass, slow-swelling saw pads, soft triangle arpeggios, shaker. No drums.',room:3.2},
  pulse:{tag:'Synth',voices:'Saw pads and bass, saw arpeggios, kick on every beat, snare and hats.',room:1.6},
  cinematic:{tag:'Score',voices:'Warm three-voice pads with vibrato, triangle bass, taiko, shaker.',room:3.6},
  chip:{tag:'Digital',voices:'Square-wave voices, triangle bass, kick on every beat, snare and hats.',room:.9}
};
const MODE_HINT={ionian:'major',aeolian:'natural minor',dorian:'minor with a bright sixth',lydian:'major with a raised fourth',mixolydian:'major with a flat seventh'};
const SECTION_NAMES={home:'Home',away:'Away',tension:'Tension',resolve:'Resolve',lift:'Lift',breath:'Breath'};
// The genome's music response (engine/catalog.js COMMON): part of the visual identity, tuned through the recipe.
const RESPONSE=[['music.reactivity','Reactivity','How strongly the world follows the music.'],['music.beatPulse','Beat pulse','How much the world pulses on each beat.']];
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const same=(a,b)=>typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<1e-9:a===b;
const pct=v=>`${Math.round(v*100)}%`;
export default {mount(view,{store:S,player:P,chrome}){
  styles('music');
  const offs=[];
  let scope=S.state.selected?'project':'global',scopeChosen=false,identity=null,identitySeed=null,tunable=null,tunableFor='',wasPending=false;
  // ---- The resolved values -------------------------------------------------------------------------------------
  const globalMusic=()=>({...DEFAULTS,...(S.state.settings?.music||{})});
  const prefs=()=>S.state.selected?S.preferences():null;
  const own=k=>{const v=prefs()?.music?.[k];return v===null||v===undefined?null:v;};
  // The preview minus the volume (a mixing level saved on release, never an unsaved creative change).
  const draft=()=>{const d={...(S.state.musicPreview||{})};delete d.volume;return d;};
  const saved=k=>scope==='project'&&own(k)!==null?own(k):globalMusic()[k];
  const shown=k=>draft()[k]??saved(k);
  const heard=()=>{const e=S.effective().music,d=draft();return Object.fromEntries(MUSIC_KEYS.map(k=>[k,d[k]??e[k]]));};
  const projectBpm=style=>identity?identity.tempo[style]:null;
  const tempoText=(mode,bpm,style)=>mode==='manual'?`Manual · ${bpm} BPM`:`From the project${projectBpm(style)?` · ${projectBpm(style)} BPM`:''}`;
  // ---- Preview: one source of truth (store.state.musicPreview); this view only edits it ------------------------------
  function setPreview(next){const p={...next},v=S.state.musicPreview?.volume;if(v!==undefined)p.volume=v;S.previewMusic(null);if(Object.keys(p).length)S.previewMusic(p);}
  function edit(patch){
    const d={...draft(),...patch};
    for(const k of Object.keys(patch))if(same(d[k],saved(k)))delete d[k];
    // The tempo is a pair: a manual tempo means nothing in project mode, and a manual one is always saved with its mode.
    const mode=d.tempoMode??saved('tempoMode');
    if(mode==='project')delete d.tempo;else if('tempo' in d||'tempoMode' in d){d.tempoMode='manual';d.tempo=d.tempo??saved('tempo');}
    setPreview(d);
  }
  function describe(d){
    const out=[];if(d.style)out.push(`Style: ${STYLE_NAMES[d.style]}`);
    if(d.tempoMode||d.tempo!==undefined)out.push(`Tempo: ${tempoText(d.tempoMode??saved('tempoMode'),d.tempo??saved('tempo'),shown('style'))}`);
    if(d.texture!==undefined)out.push(`Texture: ${pct(d.texture)}`);return out.join(' · ');
  }
  const scopeName=()=>scope==='project'?'this project':'the global defaults';
  async function apply(){
    const d=draft();if(!Object.keys(d).length)return;
    try{if(scope==='project')await S.savePreferences({music:d});else await S.saveSettings({music:d});}
    catch(e){toast(`Not saved: ${e.message}`,'error');return;}
    setPreview({});
    // Toasts outlive this view and also show over the Stage (which may be on a stream): never a private name in them.
    const kept=scope==='global'?MUSIC_KEYS.filter(k=>k in d&&own(k)!==null):[];
    toast(`Saved to ${scopeName()}.${kept.length?` This project keeps its own ${[...new Set(kept.map(k=>k.startsWith('tempo')?'tempo':k))].join(' and ')}, so you hear that here.`:''}`,kept.length?'warning':'ok');
  }
  function cancel(){S.previewMusic(null);}
  async function inherit(keys,label){
    try{await S.savePreferences({music:Object.fromEntries(keys.map(k=>[k,null]))});}catch(e){toast(`Not saved: ${e.message}`,'error');return;}
    const d=draft();for(const k of keys)delete d[k];setPreview(d);toast(`${label} now follows the global default for this project.`,'ok');
  }
  // ---- Head and scope --------------------------------------------------------------------------------------------
  const scopeSeg=segmented({label:'Where changes are saved',id:'musicScope',options:[{value:'project',label:'This project'},{value:'global',label:'Global defaults'}],value:scope,onChange:v=>{scope=v;scopeChosen=true;renderAll();}});
  const scopeNote=h('p',{class:'small muted ms-scope-note'});
  // Where a change is saved: beside the title, tinted by scope (this project: the accent; global: neutral), so it is
  // never ambiguous which one an Apply writes to.
  const scopeBar=h('div',{class:'ms-scope'},h('div',{class:'ms-scope-row'},h('span',{class:'eyebrow',text:'Editing'}),scopeSeg),scopeNote);
  const head=h('div',{class:'page-head ms-head'},h('div',{class:'grow'},h('h1',{class:'title-l',text:'Music Studio'}),
    h('p',{class:'muted ms-lede',text:'The score is generated from the project. Choose how it is performed; changes are heard on the next bar.'})),scopeBar);
  // ---- Preview bar and sound -------------------------------------------------------------------------------------
  const applyBtn=button({label:'Apply',icon:'check',kind:'primary',id:'musicApply',onClick:()=>apply()});
  const previewText=h('span',{class:'small ms-preview-what'}),previewWhere=h('span',{class:'small muted'});
  const previewBar=h('div',{class:'ms-preview',id:'musicPreviewBar',role:'status',hidden:true},
    h('div',{class:'ms-preview-text'},h('span',{class:'pill accent',text:'Previewing · not saved'}),previewWhere,previewText),
    h('div',{class:'ms-preview-actions'},button({label:'Cancel',kind:'ghost',id:'musicCancel',onClick:()=>cancel()}),applyBtn));
  const soundNote=h('div',{class:'ms-sound'});
  // ---- Style ---------------------------------------------------------------------------------------------------
  const styleCards=STYLES.map(s=>{const i=STYLE_INFO[s];
    const b=h('button',{type:'button',role:'radio',class:'ms-style',dataset:{style:s},'aria-checked':'false'},
      h('span',{class:'ms-style-head'},h('strong',{text:STYLE_NAMES[s]}),h('span',{class:'ms-style-tag',text:i.tag})),
      h('span',{class:'ms-style-voices',text:i.voices}),
      h('span',{class:'ms-style-meta'},h('span',{text:`Room ${i.room} s`,title:`${i.room>=3?'A long':'A short'} room: ${i.room} s of reverb`}),h('span',{class:'num ms-style-bpm'})));
    b.addEventListener('click',()=>edit({style:s}));
    b.addEventListener('keydown',e=>{const k=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;if(!k)return;e.preventDefault();
      const next=styleCards[(styleCards.indexOf(b)+k+styleCards.length)%styleCards.length];next.focus();next.click();});
    return b;});
  const styleGroup=h('div',{class:'ms-styles',role:'radiogroup','aria-label':'Style','aria-describedby':'msStyleSource'},...styleCards);
  const styleSource=h('div',{class:'ms-source',id:'msStyleSource'});
  const roomNote=h('p',{class:'small faint ms-room'});
  // ---- Tempo and texture -------------------------------------------------------------------------------------------
  const startTempo=()=>{const st=shown('style');return saved('tempoMode')==='manual'?saved('tempo'):Math.min(160,Math.max(58,projectBpm(st)||saved('tempo')));};
  const tempoSeg=segmented({label:'Tempo source',id:'musicTempoMode',options:[{value:'project',label:'From the project'},{value:'manual',label:'Manual'}],value:shown('tempoMode'),
    onChange:v=>v==='manual'?edit({tempoMode:'manual',tempo:startTempo()}):edit({tempoMode:'project'})});
  const tempoSlider=slider({min:58,max:160,integer:true,value:shown('tempo'),label:'Manual tempo in BPM',id:'musicTempo',format:v=>String(v),onInput:v=>edit({tempoMode:'manual',tempo:v})});
  const tempoRead=h('span',{class:'field-value num'});
  const tempoHint=h('div',{class:'field-doc'});
  const timing=h('dl',{class:'ms-timing'});
  const tempoSource=h('div',{class:'ms-source'});
  const tempoField=h('div',{class:'field ms-field'},h('div',{class:'field-head'},h('span',{class:'field-label',text:'Tempo'}),tempoRead),tempoSeg,h('div',{class:'ms-tempo-manual'},tempoSlider),tempoHint,timing,h('div',{class:'ms-foot'},tempoSource));
  const textureSlider=slider({min:0,max:100,integer:true,value:Math.round(shown('texture')*100),label:'Texture in percent',id:'musicTexture',format:v=>`${v}%`,onInput:v=>edit({texture:v/100})});
  const effects=h('dl',{class:'ms-effects'});
  const textureSource=h('div',{class:'ms-source'});
  const textureField=h('div',{class:'field ms-field'},h('div',{class:'field-head'},h('span',{class:'field-label',text:'Texture'})),textureSlider,
    h('div',{class:'field-doc',text:'How full and bright the arrangement is. It scales every voice and filter, and thins the arrangement at the low end:'}),effects,h('div',{class:'ms-foot'},textureSource));
  // ---- Output: volume and audio export -----------------------------------------------------------------------------
  const volumeSlider=slider({min:0,max:100,integer:true,value:Math.round(globalMusic().volume*100),label:'Master volume in percent',id:'musicVolume',format:v=>`${v}%`,
    onInput:v=>S.previewMusic({volume:v/100}),onChange:v=>commitVolume(v/100)});
  const volumeField=h('div',{class:'field ms-out'},h('div',{class:'field-head'},h('span',{class:'field-label',text:'Master volume'}),pill('All projects · this receiver','',{plain:true})),volumeSlider,
    h('div',{class:'field-doc',text:'A listening level, saved when you release the slider. Every window and the OBS view use it.'}));
  async function commitVolume(v){
    try{await S.saveSettings({music:{volume:v}});}catch(e){toast(`Volume not saved: ${e.message}`,'error');}
    setPreview(draft());
  }
  const exportBtn=button({label:'Render audio (WAV)',icon:'download',id:'musicExport',onClick:()=>exportAudio()});
  const exportNote=h('div',{class:'field-doc'}),exportBusy=h('div',{class:'small accent',role:'status'});
  const exportField=h('div',{class:'field ms-out'},h('div',{class:'field-head'},h('span',{class:'field-label',text:'Audio file'})),h('div',{},exportBtn),exportBusy,exportNote);
  // Output is not a creative choice: never previewed, never scoped (the volume is one level for the receiver).
  const outputCard=h('div',{class:'ms-card ms-output'},volumeField,exportField);
  async function exportAudio(){
    try{const r=await P.exportAudio();
      if(!r)toast(P.state.exporting?'A render is already running.':'Nothing to render yet: this project has no recorded performance.','warning');
      else toast(`Rendered ${Math.round(r.seconds/60*10)/10} min of the performance: ${r.file}`,'ok');}
    catch(e){toast(`The audio could not be rendered: ${e.message}`,'error');}
  }
  // ---- Presets -------------------------------------------------------------------------------------------------------
  const nameInput=h('input',{class:'input',type:'text',id:'musicPresetName',maxlength:40,placeholder:'Name this sound','aria-label':'Preset name',autocomplete:'off',spellcheck:'false'});
  const nameError=h('div',{class:'ms-error small',id:'musicPresetError','aria-live':'polite'});
  nameInput.setAttribute('aria-describedby','musicPresetError');
  const savePresetBtn=button({label:'Save as preset',icon:'save',id:'musicPresetSave',onClick:()=>savePreset()});
  nameInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();savePresetBtn.click();}});
  nameInput.addEventListener('input',()=>{nameInput.setAttribute('aria-invalid','false');text(nameError,'');});
  const presetList=h('div',{class:'list ms-presets panel',id:'musicPresets'});
  const musicPresets=()=>(S.state.presets?.presets||[]).filter(p=>p.kind==='music');
  function nameProblem(raw,except=null){
    const s=String(raw||'').trim();
    if(!s)return 'Enter a name.';if(!PRESET_NAME.test(s))return 'Use up to 40 letters, digits, spaces and . , \' & ( ) -';
    if(musicPresets().some(p=>p.id!==except&&p.name.toLowerCase()===s.toLowerCase()))return 'A music preset with this name exists.';return '';
  }
  async function savePreset(){
    const problem=nameProblem(nameInput.value);
    if(problem){nameInput.setAttribute('aria-invalid','true');text(nameError,problem);nameInput.focus();return;}
    try{await S.presetAction({action:'create',kind:'music',name:nameInput.value.trim(),payload:heard()});nameInput.value='';toast('Preset saved (global, usable in every project).','ok');}
    catch(e){nameInput.setAttribute('aria-invalid','true');text(nameError,`Not saved: ${e.message}`);}
  }
  const summary=p=>`${STYLE_NAMES[p.style]} · ${p.tempoMode==='manual'?`${p.tempo} BPM`:'project tempo'} · texture ${pct(p.texture)}`;
  const isPreviewing=p=>{const d=draft();return MUSIC_KEYS.every(k=>k==='tempo'&&p.tempoMode==='project'?true:same(d[k]??saved(k),p[k]))&&Object.keys(d).length>0;};
  async function applyPreset(p){
    try{if(scope==='project')await S.savePreferences({music:p.payload});else await S.saveSettings({music:p.payload});}catch(e){toast(`Not applied: ${e.message}`,'error');return;}
    setPreview({});toast(`“${p.name}” applied to ${scopeName()}.`,'ok');
  }
  function renamePreset(p){
    const input=h('input',{class:'input',type:'text',value:p.name,maxlength:40,'aria-label':'New name',autofocus:true,autocomplete:'off'}),err=h('div',{class:'ms-error small','aria-live':'polite'});
    input.addEventListener('input',()=>{input.setAttribute('aria-invalid','false');text(err,'');});
    modal({title:'Rename preset',body:h('div',{class:'field'},input,err),actions:[{label:'Cancel'},{label:'Rename',kind:'primary',onClick:async()=>{
      const problem=nameProblem(input.value,p.id);if(problem){input.setAttribute('aria-invalid','true');text(err,problem);return false;}
      try{await S.presetAction({action:'rename',id:p.id,name:input.value.trim()});}catch(e){text(err,`Not renamed: ${e.message}`);return false;}}}]});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();input.closest('.modal').querySelector('.modal-foot .btn.primary')?.click();}});
  }
  async function deletePreset(p){
    if(!await confirmDialog({title:`Delete “${p.name}”?`,body:'The preset is removed for every project. Projects that used it keep their saved values.',confirm:'Delete',kind:'danger'}))return;
    try{await S.presetAction({action:'delete',id:p.id});toast(`“${p.name}” deleted.`,'ok');}catch(e){toast(`Not deleted: ${e.message}`,'error');}
  }
  // ---- Advanced: the visual response to the music (recipe genome) ------------------------------------------------
  const responseRows=RESPONSE.map(([path,label,doc])=>{
    const ctl=slider({min:0,max:1,step:.01,value:0,label,format:v=>Number(v).toFixed(2),onChange:v=>tune(path,v)});
    const base=h('span',{class:'faint small num'});
    const reset=button({label:'Use generated',icon:'reset',kind:'ghost',size:'sm',onClick:()=>tune(path,null),attrs:{'aria-label':`Use the generated ${label.toLowerCase()}`}});
    const el=h('div',{class:'field ms-field',dataset:{path}},h('div',{class:'field-head'},h('span',{class:'field-label',text:label}),base,reset),ctl,h('div',{class:'field-doc',text:doc}));
    ctl.range.dataset.path=path;
    return {path,el,ctl,base,reset};});
  const responseNote=h('div',{class:'small faint'});
  const advanced=disclosure({summary:'Visual response to the music'},
    h('p',{class:'small muted',text:'Part of the project\'s visual identity (its Visual Recipe), not of the sound: saved immediately for this project, and every window and the OBS view follow. Tuning a value locks the identity so it is no longer regenerated.'}),
    h('div',{class:'ms-response'},...responseRows.map(r=>r.el)),responseNote);
  advanced.id='musicAdvanced';advanced.classList.add('ms-advanced');
  const advancedHint=h('p',{class:'small faint ms-advanced-hint',text:'How strongly the world follows the music and pulses on each beat. Saved in this project\'s Visual Recipe.'});
  // A large screen has the room to show the two response sliders from the start; elsewhere they stay one click away.
  // The window may cross that size while the studio is open: it follows, until the person opens or closes the section
  // themselves (their choice then stands for this visit).
  let advancedChosen=false,advancedAuto=false;
  advanced.addEventListener('toggle',()=>{advancedHint.hidden=advanced.open;if(advancedAuto)advancedAuto=false;else advancedChosen=true;});
  const roomy=window.matchMedia?.('(min-width:2200px) and (min-height:1300px)');
  const fitAdvanced=()=>{if(advancedChosen||!roomy||advanced.open===roomy.matches)return;advancedAuto=true;advanced.open=roomy.matches;};
  if(roomy){fitAdvanced();roomy.addEventListener('change',fitAdvanced);offs.push(()=>roomy.removeEventListener('change',fitAdvanced));}
  // Edits are queued: one request at a time, always against the revision last seen, latest value wins.
  const tuneQueue=new Map();let tuning=null;
  function tune(path,v){tuneQueue.set(path,v);if(!tuning)tuning=flushTune().finally(()=>{tuning=null;renderTuning();});}
  async function flushTune(){
    while(tuneQueue.size){
      const values=Object.fromEntries(tuneQueue);tuneQueue.clear();
      for(let attempt=0;attempt<2;attempt++){
        try{await P.recipeAction({type:'tune',values},{ifRevision:P.state.recipe?.revision});break;}
        catch(e){
          // Another window saved the recipe meanwhile: these paths are independent of what it changed, so retry once on the new revision.
          if(e.code==='stale'&&attempt===0){await P.reloadRecipe();continue;}
          toast(`Not saved: ${e.message}`,'error');break;
        }
      }
    }
  }
  async function loadTunable(){
    const id=S.state.selected;if(!id){tunable=null;tunableFor='';renderTuning();return;}
    try{const t=await S.get(`/api/recipe/tunable?id=${encodeURIComponent(id)}`);if(id===S.state.selected){tunable=t;tunableFor=id;}}
    catch(e){if(id===S.state.selected){tunable={error:e.message};tunableFor=id;}}
    renderTuning();
  }
  // ---- Inspector: the stage, live read-outs and the musical identity ----------------------------------------------------
  const slot=h('div',{class:'stage-slot ms-slot',dataset:{stageSlot:''}});
  const badge=h('div',{class:'chrome-pass ms-chrome'},h('div',{class:'slot-badge',hidden:true},h('span',{class:'pill accent',text:'Preview · not saved'})));
  chrome.append(badge);
  const live={bar:h('b',{class:'num'}),section:h('b',{}),key:h('b',{}),bpm:h('b',{class:'num'})};
  const meterFill=h('span',{class:'ms-meter-fill'}),meterText=h('span',{class:'num tiny faint ms-meter-db'});
  const meter=h('div',{class:'ms-meter',role:'meter','aria-label':'Output level','aria-valuemin':'-60','aria-valuemax':'0','aria-valuenow':'-60'},meterFill);
  const liveState=h('span',{class:'small faint ms-live-state'});
  // The readouts sit under the picture, as on a hardware monitor; with the sound off they show nothing (—) and the one
  // action that brings them to life (Enable sound) takes the level meter's place.
  const liveBox=h('div',{class:'ms-live',id:'musicLive'},
    h('div',{class:'ms-live-grid'},...[['Bar',live.bar],['Section',live.section],['Key',live.key],['Tempo',live.bpm]].map(([k,v])=>h('div',{class:'ms-readout'},h('span',{class:'eyebrow',text:k}),v))),
    h('div',{class:'ms-meter-row'},h('span',{class:'eyebrow',text:'Level'}),meter,meterText),soundNote,liveState);
  const identityBox=h('div',{class:'ms-identity',id:'musicIdentity'});
  // ---- Layout ------------------------------------------------------------------------------------------------------
  // A performance desk: the controls on the left in a grid that uses the width (style palettes across, the three
  // performance cards side by side, presets beside the visual response); the monitor and the score's fixed identity on
  // the right, always in view while a change is heard.
  const emptyBox=h('div',{class:'ms-empty'});
  const presetsCard=h('section',{class:'ms-card ms-presets-card','aria-labelledby':'msPresetsTitle'},
    h('div',{class:'ms-card-head'},h('h2',{class:'title-m',id:'msPresetsTitle',text:'Music presets'}),h('span',{class:'faint small',text:'Global, reusable in every project'})),
    h('p',{class:'small muted',text:'A preset keeps a style, a tempo source and a texture. It never changes a project\'s key, mode or motif: those come from the project itself.'}),
    h('div',{class:'ms-preset-new'},nameInput,savePresetBtn),nameError,presetList);
  const root=h('div',{class:'split ws-music'},
    h('div',{class:'main'},h('div',{class:'page'},h('div',{class:'page-inner'},head,previewBar,emptyBox,
      h('div',{class:'ms-desk'},
        section({title:'Style',subtitle:'The instruments and the room'},styleGroup,h('div',{class:'ms-style-foot'},styleSource,roomNote)),
        section({title:'Performance',subtitle:'Tempo and texture follow the scope you edit; the output is global'},
          h('div',{class:'ms-perf'},tempoField,textureField,outputCard)),
        h('div',{class:'ms-lower'},presetsCard,h('div',{class:'ms-card ms-advanced-card'},advanced,advancedHint)))))),
    h('aside',{class:'inspector ms-inspector','aria-label':'Performance monitor'},
      h('div',{class:'ms-monitor'},slot,liveBox),
      h('div',{class:'inspector-body'},identityBox)));
  view.append(root);
  // ---- Rendering ---------------------------------------------------------------------------------------------------------
  function sourceLine(el,keys,label,value){
    el.replaceChildren();
    if(scope==='project'){
      if(!S.state.selected)return;
      if(!prefs()){el.append(h('span',{class:'faint',text:'Loading this project\'s preferences…'}));return;}
      const g=globalMusic();
      if(keys.some(k=>own(k)!==null))el.append(pill('This project','accent'),h('button',{type:'button',class:'link-btn small',text:'Use global',title:`Remove this project's ${label.toLowerCase()} so it follows the global default (${value(g)})`,
        onClick:()=>inherit(keys,label)}),h('span',{class:'faint',text:`Global: ${value(g)}`}));
      else el.append(h('span',{class:'faint',text:`Inherits global: ${value(g)}`}));
    }else{
      el.append(pill('Global default','',{plain:true}));
      const p=S.project();
      if(p&&prefs()&&keys.some(k=>own(k)!==null)){const pm={...globalMusic(),...Object.fromEntries(keys.map(k=>[k,own(k)??globalMusic()[k]]))};
        el.append(h('span',{class:'warn',text:`${projectName(p)} uses its own: ${value(pm)} (you hear that here)`}));}
    }
  }
  function renderScope(){
    scopeSeg.set(scope);const p=S.project();
    const projectBtn=scopeSeg.querySelector('[data-value="project"]');projectBtn.disabled=!p;
    text(projectBtn,p?`This project · ${projectName(p)}`:'This project');projectBtn.title=p?`${projectName(p)} (private name, shown only here)`:'No project selected';
    root.dataset.scope=scope;
    text(scopeNote,scope==='project'?'Saved for this project only. A value it does not set inherits the global default.':'Saved as the default for every project that has no value of its own.');
    if(p?.evidence?.demonstration&&scope==='project')scopeNote.append(' ',h('span',{class:'warn',text:'Demonstration (fictional).'}));
    text(applyBtn.querySelector('span'),scope==='project'?'Apply to this project':'Apply as global default');
  }
  function renderValues(){
    const style=shown('style'),mode=shown('tempoMode'),tempo=shown('tempo'),texture=shown('texture'),d=draft();
    for(const b of styleCards){const on=b.dataset.style===style;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;b.classList.toggle('pending',on&&'style' in d);
      text(b.querySelector('.ms-style-bpm'),projectBpm(b.dataset.style)?`${projectBpm(b.dataset.style)} BPM`:'');}
    for(const c of identityBox.querySelectorAll('.ms-tempo-cell'))c.classList.toggle('current',c.dataset.style===style);
    sourceLine(styleSource,['style'],'Style',m=>STYLE_NAMES[m.style]);
    if(S.pinned('style'))styleSource.append(h('span',{class:'warn',text:`This window's address pins the style (?style=); saved choices apply elsewhere.`}));
    const bpm=projectBpm(style),beat=mode==='manual'?tempo:bpm;
    text(roomNote,`${STYLE_NAMES[style]}'s room (${STYLE_INFO[style].room} s) comes with the style; its echo follows the tempo.`);
    // What the tempo means in time: the beat, the 16-step bar and the echo (a dotted eighth, music.js).
    timing.replaceChildren(...[['Beat',beat?`${Math.round(60000/beat)} ms`:'—'],['Bar',beat?`${(240/beat).toFixed(2)} s · 16 steps`:'—'],
      ['Echo',beat?`${Math.round(45000/beat)} ms · dotted eighth`:'—']].flatMap(([k,v])=>[h('dt',{text:k}),h('dd',{text:v})]));
    tempoSeg.set(mode);tempoSlider.set(tempo);tempoField.querySelector('.ms-tempo-manual').hidden=mode!=='manual';
    tempoField.classList.toggle('modified','tempo' in d||'tempoMode' in d);
    // In manual mode the slider's own entry box shows the value; the read-out is for the project tempo only.
    tempoRead.hidden=mode==='manual';text(tempoRead,bpm?`${bpm} BPM`:'—');
    text(tempoHint,mode==='manual'?'A fixed tempo for every style.':`The project's own tempo${bpm?` for ${STYLE_NAMES[style]}`:''}: each style has its own, derived from the project.`);
    sourceLine(tempoSource,['tempoMode','tempo'],'Tempo',m=>m.tempoMode==='manual'?`Manual ${m.tempo} BPM`:'From the project');
    textureSlider.set(Math.round(texture*100));textureField.classList.toggle('modified','texture' in d);
    effects.replaceChildren(...[['Voices',`×${(.6+.8*texture).toFixed(2)} loudness`],['Filters',`×${(.55+.9*texture).toFixed(2)} brightness`],
      ['Arpeggios',texture<.2?'Resting (below 20%)':'Playing'],['Percussion',texture<.12?'Resting (below 12%)':'Playing']].flatMap(([k,v])=>[h('dt',{text:k}),h('dd',{class:v.startsWith('Resting')?'warn':'',text:v})]));
    sourceLine(textureSource,['texture'],'Texture',m=>pct(m.texture));
    if(document.activeElement!==volumeSlider.range)volumeSlider.set(Math.round((S.state.musicPreview?.volume??globalMusic().volume)*100));
    const manual=S.effective().music.tempoMode==='manual'||d.tempoMode==='manual';
    text(exportNote,`Renders up to 10 minutes of the recorded performance (in Replay from the playhead, otherwise the last 10 minutes) with the style and texture you hear now${Object.keys(d).length?', including the unsaved preview':''}.${manual?' A manual tempo is not applied to the file: it uses the project\'s tempo.':''}`);
  }
  function renderPreview(){
    const d=draft(),pending=Object.keys(d).length>0;
    previewBar.hidden=!pending;badge.firstChild.hidden=!pending;text(previewText,pending?describe(d):'');
    text(previewWhere,P.state.sound.enabled?'Heard in this window only.':'This window only · sound is off.');
    applyBtn.disabled=scope==='project'&&(!S.state.selected||!prefs());
    wasPending=pending;
  }
  function renderSound(){
    const s=P.state.sound;soundNote.replaceChildren();
    if(s.error)soundNote.append(callout({kind:'danger',icon:'warn',title:'Sound could not start',body:s.error,actions:[button({label:'Try again',size:'sm',onClick:()=>P.toggleSound().catch(e=>toast(e.message,'error'))})]}));
    else if(!s.enabled)soundNote.append(h('div',{class:'ms-sound-off'},h('div',{class:'grow'},h('strong',{text:'Sound is off in this window'}),
        h('span',{class:'small muted',text:'Browsers start audio only after a click.'})),
      // Secondary here: the top bar's Enable sound is the primary route (and comes first in the Tab order).
      button({label:'Enable sound',icon:'sound-on',size:'sm',id:'musicEnableSound',onClick:()=>P.toggleSound().catch(e=>toast(`Sound could not start: ${e.message}`,'error'))})));
    renderLive();
  }
  function renderLive(){
    const s=P.state,on=s.sound.enabled;
    text(live.bar,on&&s.bar?String(s.bar).padStart(3,'0'):'—');text(live.section,on&&s.section?SECTION_NAMES[s.section]||cap(s.section):'—');
    text(live.key,on&&s.key?cap(s.key.split(' ')[0])+' '+cap(s.key.split(' ')[1]||''):'—');text(live.bpm,on?`${s.sound.tempo} BPM`:'—');
    const db=on&&s.sound.level>0?Math.max(-60,20*Math.log10(s.sound.level)):-60;
    meterFill.style.width=`${((db+60)/60)*100}%`;meter.setAttribute('aria-valuenow',String(Math.round(db)));text(meterText,on&&s.sound.level>0?`${db.toFixed(0)} dB`:'—');
    text(liveState,on?'Live from this window\'s music engine.':'');liveState.hidden=!on;
    // Sound off: the level meter has nothing to show, so the sound panel stands in its place (renderSound).
    liveBox.classList.toggle('is-off',!on);
  }
  function renderIdentity(force=false){
    const s=P.state,id=s.project||S.state.selected,seed=id?(s.frame?.projectSeed||window.ResonanceScore.hash(id)):null;
    if(!force&&seed===identitySeed)return;identitySeed=seed;identity=seed===null?null:window.ResonanceScore.createIdentity(seed);
    identityBox.replaceChildren();
    if(!identity){identityBox.append(h('div',{class:'small faint',text:'No project selected: the identity appears with a project.'}));renderValues();return;}
    const cur=shown('style');
    identityBox.append(h('div',{class:'ms-id-head'},h('h2',{class:'title-m',text:'Musical identity'}),pill('Read-only','',{plain:true})),
      h('p',{class:'small faint',text:'Derived from the project\'s seed; it never changes. Style, tempo and texture change how it is performed, not what it is.'}),
      h('dl',{class:'ms-id-facts'},
        h('div',{class:'ms-fact'},h('dt',{class:'eyebrow',text:'Key'}),h('dd',{},h('strong',{text:`${identity.key} ${cap(identity.mode)}`}),h('span',{class:'small faint',text:MODE_HINT[identity.mode]||''}))),
        h('div',{class:'ms-fact'},h('dt',{class:'eyebrow',text:'Swing'}),h('dd',{},h('strong',{text:identity.swing>0?'Yes':'No'}),
          h('span',{class:'small faint',text:identity.swing>0?`off-beat sixteenths ${Math.round(identity.swing*100)}% late`:'straight sixteenths'})))),
      h('div',{class:'ms-id-tempi'},h('span',{class:'eyebrow',text:'Project tempo per style'}),
        h('div',{class:'ms-tempi'},...STYLES.map(st=>h('div',{class:['ms-tempo-cell',st===cur?'current':''],dataset:{style:st}},h('span',{text:STYLE_NAMES[st]}),h('b',{class:'num',text:String(identity.tempo[st])}))))),
      h('div',{class:'ms-id-motif'},h('span',{class:'eyebrow',text:'Motif · call and answer'}),motifGraphic(identity),
        h('p',{class:'tiny faint',text:'Each block is a note on the 16-step bar grid, its height the scale degree. The motif opens phrases; later chapters transform it.'})));
    renderValues();
  }
  function motifGraphic(idn){
    const {rhythm,contour,answer}=idn.motif,all=[...contour,...answer],lo=Math.min(...all)-1,hi=Math.max(...all)+1,W=18,R=9,H=(hi-lo+1)*R+2;
    const svg=h('svg',{viewBox:`0 0 ${32*W} ${H}`,className:'ms-motif',role:'img','aria-label':`Motif of ${rhythm.length} notes; call degrees ${contour.join(', ')}; answer degrees ${answer.join(', ')}`});
    const el=(tag,a)=>h(tag,{ns:'svg',...Object.fromEntries(Object.entries(a).map(([k,v])=>[k,String(v)]))});
    for(let s=0;s<=32;s+=4)svg.append(el('line',{x1:s*W,x2:s*W,y1:0,y2:H,className:s%16===0?'bar':'beat'}));
    [[contour,0,'call'],[answer,16,'answer']].forEach(([deg,off,cls])=>{
      const pts=[];rhythm.forEach(([step,len],i)=>{const x=(off+step)*W,y=(hi-deg[i])*R;pts.push(`${x+1},${y+R/2}`);svg.append(el('rect',{x:x+1,y:y+1,width:Math.max(3,len*W-3),height:R-2,rx:1.5,className:cls}));});
      svg.append(el('polyline',{points:pts.join(' '),className:`${cls} trace`}));});
    // The halves are named in the page's text (a label drawn in the graphic would scale with the column's width).
    return h('div',{class:'ms-motif-box'},svg,h('div',{class:'ms-motif-legend','aria-hidden':'true'},h('span',{text:'Call'}),h('span',{text:'Answer'})));
  }
  function renderTuning(){
    const r=P.state.recipe,g=r?.genome?.music,t=tunable&&tunableFor===S.state.selected?tunable:null;
    for(const row of responseRows){
      const spec=t?.tunable?.[row.path],v=g?.[row.path.split('.')[1]],modified=r?.tuning?.values&&Object.hasOwn(r.tuning.values,row.path);
      const ok=!!(spec&&Number.isFinite(v)&&!r.unavailable);
      row.ctl.setDisabled(!ok);if(ok&&document.activeElement!==row.ctl.range)row.ctl.set(v);
      row.el.classList.toggle('modified',!!modified);row.reset.hidden=!modified;
      text(row.base,ok&&Number.isFinite(t.base?.[row.path])?`generated ${Number(t.base[row.path]).toFixed(2)}`:'');
    }
    text(responseNote,!S.state.selected?'Select a project to tune its visual response.':!r||!t?'Loading the visual identity…':t.error?`Unavailable: ${t.error}`:r.unavailable?'This project\'s world is unavailable, so its identity cannot be tuned here.'
      :!responseRows.every(x=>t.tunable?.[x.path])?'This world does not declare a music response.':r.locked?'Identity locked: it is kept as it is.':'');
  }
  function renderPresets(){
    const list=musicPresets();presetList.replaceChildren();
    if(!S.state.presets){presetList.append(h('div',{class:'list-row faint small',text:'Loading presets…'}));return;}
    if(!list.length)presetList.append(h('div',{class:'list-row faint small ms-presets-none',text:'No music presets yet. Name the sound you hear to keep it for any project.'}));
    for(const p of list){const previewing=isPreviewing(p.payload);
      presetList.append(h('div',{class:'list-row ms-preset',dataset:{preset:p.id}},
        h('div',{class:'grow'},h('strong',{class:'ellipsis',text:p.name}),h('div',{class:'faint small',text:summary(p.payload)})),
        button({label:previewing?'Previewing':'Preview',icon:'eye',size:'sm',kind:'ghost',pressed:previewing,attrs:{'data-act':'preview','aria-label':`Preview ${p.name}`},onClick:()=>{if(isPreviewing(p.payload))cancel();else{setPreview({});edit({...p.payload});}}}),
        button({label:scope==='project'?'Apply to project':'Apply as default',icon:'check',size:'sm',attrs:{'data-act':'apply'},onClick:()=>applyPreset(p)}),
        button({label:'Rename',size:'sm',kind:'ghost',attrs:{'data-act':'rename','aria-label':`Rename ${p.name}`},onClick:()=>renamePreset(p)}),
        button({icon:'trash',size:'sm',kind:'ghost',title:'Delete',attrs:{'data-act':'delete','aria-label':`Delete ${p.name}`},onClick:()=>deletePreset(p)})));}
  }
  function renderExport(){const busy=!!P.state.exporting;exportBtn.disabled=busy||!S.state.selected;exportBtn.setAttribute('aria-busy',String(busy));text(exportBtn.querySelector('span'),busy?'Rendering…':'Render audio (WAV)');
    text(exportBusy,busy?'Rendering offline: this can take a few minutes. The file downloads when it is ready; you can keep working.':'');}
  function renderEmpty(){emptyBox.replaceChildren();
    if(S.state.projectsLoaded&&!S.state.projects.length)emptyBox.append(emptyState({icon:'music',title:'No project yet',body:'The score is generated from a project. You can still set the global defaults; the identity, preview and export appear once a project is captured.'}));
    if(S.state.errors.settings)emptyBox.append(callout({kind:'warn',icon:'warn',title:'Settings could not be read',body:`${S.state.errors.settings}. Showing the built-in defaults until the receiver answers.`}));}
  function renderAll(){renderScope();renderIdentity(true);renderValues();renderPreview();renderSound();renderTuning();renderPresets();renderExport();renderEmpty();}
  renderAll();void loadTunable();
  offs.push(S.on(t=>{
    if(t.has('selection')){if(wasPending)toast('Music preview cancelled: another project was selected (nothing was saved).','info');if(!S.state.selected)scope='global';else if(!scopeChosen)scope='project';renderAll();void loadTunable();return;}
    if(t.has('projects')||t.has('preferences')||t.has('settings')){renderScope();renderEmpty();}
    if(t.has('settings')||t.has('preferences')||t.has('musicPreview')||t.has('sound')){renderValues();renderPreview();}
    if(t.has('musicPreview')||t.has('presets'))renderPresets();
    if(t.has('frame')||t.has('model'))renderIdentity();
    if(t.has('sound'))renderSound();else if(t.has('position'))renderLive();
    if(t.has('recipe')){renderTuning();if(P.state.recipe?.revision!==tunable?.revision)void loadTunable();}
    if(t.has('export'))renderExport();
  }));
  return {unmount(){
    for(const f of offs)f();badge.remove();
    // A preview is never left behind: leaving the studio restores the saved music (the volume included).
    if(S.state.musicPreview){const pending=Object.keys(draft()).length>0;S.previewMusic(null);if(pending)toast('Music preview cancelled: the changes were not saved.','info');}
  }};
}};

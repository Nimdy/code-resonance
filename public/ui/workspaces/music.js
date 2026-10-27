// Music Studio: how the project's generated score is performed. The score itself (key, mode, motif, progressions, the
// project's tempo for each style) is derived from the project's seed and never changes; what a person chooses here is
// the performance: the style (instrument palette and room), where the tempo comes from, the texture, the volume and,
// for the composed score (v3), its character (eight creative controls) and the balance of its voices.
// Every edit is a preview first (store.previewMusic: heard from the next bar, in this window only) and is saved to one
// scope on Apply: this project (its preferences; null = inherit) or the global defaults (settings). Volume is a mixing
// level, global only, saved when the slider is released. Which score a project plays belongs to its identity (the
// Visual Recipe's music.score): the upgrade to the composed score is a deliberate, saved choice, like the visual
// response below. Nothing here starts audio by itself: browsers need a click.
import {h,text,button,segmented,slider,section,disclosure,pill,callout,emptyState,modal,confirmDialog,toast,styles} from '../dom.js';
import {icon} from '../icons.js';
import {projectName,STYLE_NAMES} from '../format.js';
import {PROFILE_KEYS,GROUPS,MUSIC_KEYS,DEFAULT_MUSIC,DEFAULT_MIX,STARTERS,mixOf,sameMix,scoreOf,soundingGroups,presetPayload,presetValues} from '../music-profile.js';
const STYLES=['ambient','pulse','cinematic','chip'];
const PRESET_NAME=/^[\p{L}\p{N} .,'&()-]{1,40}$/u;
// What each palette really plays (public/music.js PATCH, score.js INSTRUMENT) and its room (music.js REVERB, seconds).
// The engine does not export these, so they are mirrored here: keep them in step with music.js. `composed` is what the
// composed score's roles play in each style (score.js createBarV3).
const STYLE_INFO={
  ambient:{tag:'Drift',voices:'Sine bass, slow-swelling saw pads, soft triangle arpeggios, shaker. No drums.',room:3.2,
    composed:'Warm pads over a held bass, soft arpeggios, glints of glass, harp or breath. A shaker only when Rhythm asks.'},
  pulse:{tag:'Synth',voices:'Saw pads and bass, saw arpeggios, kick on every beat, snare and hats.',room:1.6,
    composed:'Bass grooves, running arpeggios, kick, snare and hats whose patterns change with each section.'},
  cinematic:{tag:'Score',voices:'Warm three-voice pads with vibrato, triangle bass, taiko, shaker.',room:3.6,
    composed:'Voice-led pads, an ostinato, a string counter-melody, taiko at the turns of the form.'},
  chip:{tag:'Digital',voices:'Square-wave voices, triangle bass, kick on every beat, snare and hats.',room:.9,
    composed:'Square-wave lines with an echo, an octave-leaping bass, fast arpeggios, kick, snare and hats.'}
};
const MODE_HINT={ionian:'major',aeolian:'natural minor',dorian:'minor with a bright sixth',lydian:'major with a raised fourth',mixolydian:'major with a flat seventh'};
// Section names of the classic score (v2) and the roles of the composed score's form (v3).
const SECTION_NAMES={home:'Home',away:'Away',tension:'Tension',resolve:'Resolve',lift:'Lift',breath:'Breath',
  statement:'Statement',development:'Development',interlude:'Interlude',return:'Return',release:'Release'};
const FORM_NAMES={drift:'Drift',song:'Song',arch:'Arch',variations:'Variations',journey:'Journey'};
// The composed score's creative controls (public/score.js profile, .5 = as composed), each with what it really changes.
// Evolution is read in three bands by the score (a small move never reshapes the arc being played): so are its words.
const CONTROLS=[
  {key:'mood',label:'Mood',poles:['Calm','Intense'],words:['Still','Calm','Balanced','Lively','Intense'],noun:'',
    doc:()=>'How much is going on. Calm keeps the arrangement sparse and soft-edged; intense brings in voices and motion, not volume.'},
  {key:'evolution',label:'Evolution',poles:['Familiar','Exploratory'],words:['Familiar','Developing','Exploratory'],noun:'',
    doc:()=>'How far the music travels. Familiar keeps returning to the motif; exploratory develops it and brings in a second idea.'},
  {key:'melody',label:'Melody',poles:['Sparse','Leading'],words:['Sparse','Light','Present','Singing','Leading'],noun:'melody',
    doc:s=>`How much the melody leads. Low lets phrases rest and leaves space; high fills the gaps and sings out${s==='chip'?', with an echo above 60%':''}.`},
  {key:'rhythm',label:'Rhythm',poles:['Still','Driving'],words:['Still','Gentle','Moving','Busy','Driving'],noun:'rhythm',
    doc:s=>`The motion underneath: arpeggio rate, bass patterns${s==='ambient'?'. In Ambient a soft shaker joins above 55%':', hats and drums'}.`},
  {key:'atmosphere',label:'Atmosphere',poles:['Bare','Immersive'],words:['Bare','Light','Present','Rich','Immersive'],noun:'atmosphere',
    doc:()=>'Shimmer above the chords and glints of glass, harp or breath, most of all in interludes and releases.'},
  {key:'harmony',label:'Harmony',poles:['Plain','Adventurous'],words:['Plain','Simple','Coloured','Rich','Adventurous'],noun:'harmony',
    doc:s=>`How coloured the chords are, always in the project's key: ninths, sevenths, suspensions, a walking bass.${s==='chip'?' Chip keeps plain triads below 70%.':''}`},
  {key:'dynamics',label:'Dynamics',poles:['Even','Dramatic'],words:['Even','Gentle','Breathing','Swelling','Dramatic'],noun:'',
    doc:()=>'How much the music breathes: swells across phrases, builds through developments, fades in releases.'},
  {key:'space',label:'Space',poles:['Intimate','Vast'],words:['Intimate','Close','Open','Wide','Vast'],noun:'room',
    doc:()=>'The room around the music: dry and close, or wide and distant.'}];
const CONTROL=Object.fromEntries(CONTROLS.map(c=>[c.key,c]));
const wordOf=(k,v)=>{const w=CONTROL[k].words;return k==='evolution'?w[v<.34?0:v<.67?1:2]:w[Math.min(4,Math.floor(v*5))];};
// The voice groups of the composed score (its roles), named for what they do in the music.
const GROUP_INFO={pad:{name:'Pads',role:'Harmony bed'},bass:{name:'Bass',role:'Foundation'},melody:{name:'Melody',role:'Lead line'},counter:{name:'Counter-melody',role:'Answering voice'},
  arp:{name:'Arpeggio',role:'Moving support'},perc:{name:'Percussion',role:''},atmos:{name:'Atmosphere',role:'Shimmer and transitions'}};
const PERC_ROLE={ambient:'Shaker',pulse:'Kick, snare, hats',cinematic:'Taiko',chip:'Kick, snare, hats'};
// The genome's music response (engine/catalog.js COMMON): part of the visual identity, tuned through the recipe.
const RESPONSE=[['music.reactivity','Reactivity','How strongly the world follows the music.'],['music.beatPulse','Beat pulse','How much the world pulses on each beat.']];
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const same=(a,b)=>typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<1e-9:a&&b&&typeof a==='object'&&typeof b==='object'?sameMix(a,b):a===b;
const pct=v=>`${Math.round(v*100)}%`;
// A character in a few words: the controls furthest from as composed ("wide room, gentle rhythm, rich atmosphere").
function profileWords(m){
  const keys=PROFILE_KEYS.filter(k=>Number.isFinite(m?.[k])&&Math.abs(m[k]-.5)>=.15).sort((a,b)=>Math.abs(m[b]-.5)-Math.abs(m[a]-.5)).slice(0,3);
  return keys.length?cap(keys.map(k=>`${wordOf(k,m[k]).toLowerCase()}${CONTROL[k].noun?` ${CONTROL[k].noun}`:''}`).join(', ')):'As composed';
}
function mixWords(mix){
  const m=mixOf(mix)||DEFAULT_MIX,changed=GROUPS.filter(g=>m[g]!==1);
  if(!changed.length)return 'as composed';if(changed.length>3)return `${changed.length} voices adjusted`;
  return changed.map(g=>`${GROUP_INFO[g].name.toLowerCase()} ${m[g]?pct(m[g]):'muted'}`).join(', ');
}
// The shape of a character, as eight bars (one per control, in the order above).
function glyph(profile){
  const g=h('span',{class:'ms-glyph','aria-hidden':'true'});
  for(const k of PROFILE_KEYS){const b=h('i',{});b.style.height=`${Math.round(3+15*(Number.isFinite(profile?.[k])?profile[k]:.5))}px`;g.append(b);}
  return g;
}
export default {mount(view,{store:S,player:P,chrome}){
  styles('music');
  const offs=[];
  let scope=S.state.selected?'project':'global',scopeChosen=false,identity=null,identitySeed=null,tunable=null,tunableFor='',wasPending=false,scoreBusy=false,chosenScore=2,scoreWhy='';
  // ---- The resolved values -------------------------------------------------------------------------------------
  const globalMusic=()=>({...DEFAULT_MUSIC,...(S.state.settings?.music||{})});
  const prefs=()=>S.state.selected?S.preferences():null;
  const own=k=>{const v=prefs()?.music?.[k];return v===null||v===undefined?null:v;};
  // The preview minus the volume (a mixing level saved on release, never an unsaved creative change).
  const draft=()=>{const d={...(S.state.musicPreview||{})};delete d.volume;return d;};
  const saved=k=>scope==='project'&&own(k)!==null?own(k):globalMusic()[k];
  const shown=k=>draft()[k]??saved(k);
  const shownMix=()=>mixOf(shown('mix'))||DEFAULT_MIX;
  const heard=()=>{const e=S.effective().music,d=draft();return Object.fromEntries(MUSIC_KEYS.map(k=>[k,d[k]??e[k]]));};
  // The score the selected project plays: its recipe's music.score (absent = the classic score; null while the recipe
  // loads). With no project, the controls edit the global defaults, which the composed score of any project will use.
  const composed=()=>!S.state.selected||chosenScore!==2;
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
    if(d.texture!==undefined)out.push(`Texture: ${pct(d.texture)}`);
    const ch=PROFILE_KEYS.filter(k=>k in d);
    if(ch.length)out.push(ch.length>3?`Character: ${ch.length} controls`:ch.map(k=>`${CONTROL[k].label}: ${wordOf(k,d[k])}`).join(' · '));
    if(d.mix){const s=mixOf(saved('mix'))||DEFAULT_MIX,diff=GROUPS.filter(g=>!same(d.mix[g],s[g]));
      if(diff.length)out.push(`Balance: ${diff.length>3?`${diff.length} voices`:diff.map(g=>`${GROUP_INFO[g].name} ${d.mix[g]?pct(d.mix[g]):'muted'}`).join(', ')}`);}
    return out.join(' · ');
  }
  const scopeName=()=>scope==='project'?'this project':'the global defaults';
  const keyName=k=>k.startsWith('tempo')?'tempo':PROFILE_KEYS.includes(k)?'character':k==='mix'?'balance':k;
  async function apply(){
    const d=draft();if(!Object.keys(d).length)return;
    try{if(scope==='project')await S.savePreferences({music:d});else await S.saveSettings({music:d});}
    catch(e){toast(`Not saved: ${e.message}`,'error');return;}
    setPreview({});
    // Toasts outlive this view and also show over the Stage (which may be on a stream): never a private name in them.
    const kept=scope==='global'?MUSIC_KEYS.filter(k=>k in d&&own(k)!==null):[];
    toast(`Saved to ${scopeName()}.${kept.length?` This project keeps its own ${[...new Set(kept.map(keyName))].join(' and ')}, so you hear that here.`:''}`,kept.length?'warning':'ok');
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
      h('span',{class:'ms-style-voices'}),
      h('span',{class:'ms-style-meta'},h('span',{text:`Room ${i.room} s`,title:`${i.room>=3?'A long':'A short'} room: ${i.room} s of reverb`}),h('span',{class:'num ms-style-bpm'})));
    b.addEventListener('click',()=>edit({style:s}));
    b.addEventListener('keydown',e=>{const k=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;if(!k)return;e.preventDefault();
      const next=styleCards[(styleCards.indexOf(b)+k+styleCards.length)%styleCards.length];next.focus();next.click();});
    return b;});
  const styleGroup=h('div',{class:'ms-styles',role:'radiogroup','aria-label':'Style','aria-describedby':'msStyleSource'},...styleCards);
  const styleSource=h('div',{class:'ms-source',id:'msStyleSource'});
  const roomNote=h('p',{class:'small faint ms-room'});
  // ---- The score: classic (v2) or composed (v3), part of the project's identity ------------------------------------
  // The upgrade is a tune of the recipe's music.score (saved at once, for every window and the OBS view, against the
  // revision last seen); a project upgraded here can go back. Key, mode and motif never change either way.
  const scoreTitle=h('strong',{class:'ms-score-title'}),scoreTag=h('span',{class:'pill'}),scoreText=h('p',{class:'small muted ms-score-text'});
  const scoreState=h('span',{class:'small ms-score-state',role:'status'});
  const upgradeBtn=button({label:'Use the composed score',icon:'spark',id:'musicScoreUpgrade',onClick:()=>setScore(3)});
  const classicBtn=h('button',{type:'button',class:'link-btn small',id:'musicScoreClassic',text:'Back to the classic score',onClick:()=>setScore(2)});
  const scoreBox=h('section',{class:'ms-score',id:'musicScore','aria-label':'Score'},
    h('div',{class:'ms-score-mark','aria-hidden':'true'},icon('music')),
    h('div',{class:'ms-score-body'},h('div',{class:'ms-score-head'},h('span',{class:'eyebrow',text:'Score'}),scoreTitle,scoreTag,scoreState),scoreText),
    h('div',{class:'ms-score-actions'},upgradeBtn,classicBtn));
  const scoreTunable=()=>{const t=tunable&&tunableFor===S.state.selected?tunable:null;return t&&!t.error&&t.tunable?.['music.score']?t:null;};
  const upgradedHere=()=>Object.hasOwn(P.state.recipe?.tuning?.values||{},'music.score');
  async function setScore(v){
    if(scoreBusy)return;scoreBusy=true;renderScore();
    try{
      for(let attempt=0;attempt<2;attempt++){
        const r=P.state.recipe;if(!r)throw new Error('the identity is still loading');
        if(scoreOf(r)===v)break;
        // Back to the classic score: a tuned upgrade returns to the generated value when that was the classic score.
        const gen=scoreTunable()?.base?.['music.score'],value=v===2&&upgradedHere()&&!(gen===3||gen==='3')?null:v;
        // Another window saved the recipe meanwhile: the score is independent of what it changed, so retry once on the new revision.
        try{await P.recipeAction({type:'tune',values:{'music.score':value}},{ifRevision:r.revision});break;}
        catch(e){if(e.code==='stale'&&attempt===0){await P.reloadRecipe();continue;}throw e;}
      }
      toast(v===3?'This project now plays the composed score, from the next bar. Its key, mode and motif are unchanged.':'This project plays the classic score again, from the next bar.','ok');
    }catch(e){toast(`Not saved: ${e.message}`,'error');}
    finally{scoreBusy=false;renderScore();renderCharacter();}
  }
  // ---- Character: the eight creative controls of the composed score -------------------------------------------------
  const ctlRows=CONTROLS.map(c=>{
    const word=h('b',{}),num=h('span',{class:'num'});
    const ctl=slider({min:0,max:100,integer:true,entry:false,value:50,label:`${c.label}, ${c.poles[0].toLowerCase()} to ${c.poles[1].toLowerCase()}`,id:`musicProfile-${c.key}`,
      format:v=>`${v}%`,onInput:v=>edit({[c.key]:v/100})});
    const doc=h('p',{class:'ms-ctl-doc'});
    const el=h('div',{class:'ms-ctl',dataset:{key:c.key}},h('div',{class:'ms-ctl-head'},h('span',{class:'ms-ctl-label',text:c.label}),h('span',{class:'ms-ctl-value'},word,num)),
      ctl,h('div',{class:'ms-poles','aria-hidden':'true'},h('span',{text:c.poles[0]}),h('span',{text:c.poles[1]})),doc);
    return {...c,el,ctl,word,num,docEl:doc};});
  const charReset=button({label:'As composed',icon:'reset',kind:'ghost',size:'sm',id:'musicProfileReset',title:'Every control back to the middle: the score as composed',
    onClick:()=>edit(Object.fromEntries(PROFILE_KEYS.map(k=>[k,.5])))});
  const charGrid=h('div',{class:'ms-char',id:'musicCharacter'},...ctlRows.map(r=>r.el));
  const charSource=h('div',{class:'ms-source'});
  // The classic score plays as it was composed: the controls show what they would shape, with the way to the score they shape.
  const lockNote=()=>h('div',{class:'ms-lock'},icon('lock'),h('div',{class:'grow'},h('strong',{class:'small',text:'Shaped by the composed score'}),
    h('span',{class:'small muted',text:'This project plays the classic score, which these controls do not change.'})),
    button({label:'Use the composed score',size:'sm',onClick:()=>setScore(3),attrs:{'data-upgrade':''}}));
  const charLock=lockNote();
  // ---- Balance: the level of each voice the style can sound ---------------------------------------------------------
  const unmuteTo={};
  const chRows=GROUPS.map(g=>{
    const info=GROUP_INFO[g],dot=h('span',{class:'ms-ch-dot','aria-hidden':'true'}),role=h('span',{class:'ms-ch-role'}),val=h('span',{class:'ms-ch-value num'});
    const ctl=slider({min:0,max:150,integer:true,entry:false,value:100,label:`${info.name} level`,id:`musicMix-${g}`,format:v=>`${v}%`,onInput:v=>setLevel(g,v/100)});
    const mute=button({icon:'sound-on',kind:'ghost',size:'sm',pressed:false,attrs:{'aria-label':`Mute ${info.name}`,'data-act':'mute'},onClick:()=>toggleMute(g)});
    const el=h('div',{class:'ms-ch',dataset:{group:g}},dot,h('div',{class:'ms-ch-name'},h('span',{text:info.name}),role),ctl,val,mute);
    return {g,el,dot,role,val,ctl,mute,muted:false};});
  function setLevel(g,v){edit({mix:{...shownMix(),[g]:v}});}
  // A muted voice comes back at the level it had (this visit), or as composed.
  function toggleMute(g){const m=shownMix();if(m[g]>0){unmuteTo[g]=m[g];setLevel(g,0);}else setLevel(g,unmuteTo[g]||1);}
  const mixReset=button({label:'As composed',icon:'reset',kind:'ghost',size:'sm',id:'musicMixReset',title:'Every voice back to 100%',onClick:()=>edit({mix:{...DEFAULT_MIX}})});
  const mixer=h('div',{class:'ms-mixer',id:'musicMixer'},...chRows.map(r=>r.el));
  const mixNote=h('p',{class:'small faint ms-mix-note'}),mixSource=h('div',{class:'ms-source'});
  const mixLock=lockNote();
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
    try{await S.presetAction({action:'create',kind:'music',name:nameInput.value.trim(),payload:presetPayload(heard())});nameInput.value='';toast('Preset saved (global, usable in every project).','ok');}
    catch(e){nameInput.setAttribute('aria-invalid','true');text(nameError,`Not saved: ${e.message}`);}
  }
  const summary=p=>[STYLE_NAMES[p.style],p.tempoMode==='manual'?`${p.tempo} BPM`:'project tempo',`texture ${pct(p.texture)}`,p.profile?profileWords(p.profile).toLowerCase():null].filter(Boolean).join(' · ');
  // Previewing a preset: what it sets (a preset from before the composed score sets no character) is what is heard.
  const isPreviewing=p=>{const d=draft();if(!Object.keys(d).length)return false;const v=presetValues(p);
    return Object.keys(v).every(k=>k==='tempo'&&v.tempoMode==='project'?true:same(d[k]??saved(k),v[k]));};
  const previewPreset=p=>{if(isPreviewing(p))cancel();else{setPreview({});edit(presetValues(p));}};
  async function applyPreset(p){
    const music=presetValues(p.payload);
    try{if(scope==='project')await S.savePreferences({music});else await S.saveSettings({music});}catch(e){toast(`Not applied: ${e.message}`,'error');return;}
    setPreview({});toast(`“${p.name}” applied to ${scopeName()}.`,'ok');
  }
  // Curated starting points: one click previews one (heard from the next bar), Apply saves it like any change.
  const starterCards=STARTERS.map(s=>{
    const b=h('button',{type:'button',class:'ms-starter',dataset:{starter:s.id},'aria-pressed':'false'},
      h('span',{class:'ms-starter-head'},h('strong',{text:s.name}),h('span',{class:'ms-style-tag',text:STYLE_NAMES[s.payload.style]})),
      h('span',{class:'ms-starter-line',text:s.line}),h('span',{class:'ms-starter-foot'},glyph(s.payload.profile),h('span',{class:'ms-starter-act'})));
    b.addEventListener('click',()=>previewPreset(s.payload));
    return b;});
  const starters=h('div',{class:'ms-starters',id:'musicStarters'},...starterCards);
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
    renderTuning();renderScore();renderValues();
  }
  // ---- Inspector: the stage, live read-outs and the musical identity ----------------------------------------------------
  const slot=h('div',{class:'stage-slot ms-slot',dataset:{stageSlot:''}});
  const badge=h('div',{class:'chrome-pass ms-chrome'},h('div',{class:'slot-badge',hidden:true},h('span',{class:'pill accent',text:'Preview · not saved'})));
  chrome.append(badge);
  const live={bar:h('b',{class:'num'}),section:h('b',{}),key:h('b',{}),bpm:h('b',{class:'num'})};
  const meterFill=h('span',{class:'ms-meter-fill'}),meterText=h('span',{class:'num tiny faint ms-meter-db'});
  const meter=h('div',{class:'ms-meter',role:'meter','aria-label':'Output level','aria-valuemin':'-60','aria-valuemax':'0','aria-valuenow':'-60'},meterFill);
  const liveState=h('span',{class:'small faint ms-live-state'});
  // The composed score's place in its form (an arc of sections: where it is, and where it goes next).
  const formText=h('span',{class:'ms-form-text'}),formLine=h('div',{class:'ms-form',id:'musicForm',hidden:true},h('span',{class:'eyebrow',text:'Form'}),formText);
  // The readouts sit under the picture, as on a hardware monitor; with the sound off they show nothing (—) and the one
  // action that brings them to life (Enable sound) takes the level meter's place.
  const liveBox=h('div',{class:'ms-live',id:'musicLive'},
    h('div',{class:'ms-live-grid'},...[['Bar',live.bar],['Section',live.section],['Key',live.key],['Tempo',live.bpm]].map(([k,v])=>h('div',{class:'ms-readout'},h('span',{class:'eyebrow',text:k}),v))),
    formLine,h('div',{class:'ms-meter-row'},h('span',{class:'eyebrow',text:'Level'}),meter,meterText),soundNote,liveState);
  const identityBox=h('div',{class:'ms-identity',id:'musicIdentity'});
  // ---- Layout ------------------------------------------------------------------------------------------------------
  // A performance desk: the controls on the left in a grid that uses the width (style palettes across, the three
  // performance cards side by side, presets beside the visual response); the monitor and the score's fixed identity on
  // the right, always in view while a change is heard.
  const emptyBox=h('div',{class:'ms-empty'});
  const presetsCard=h('section',{class:'ms-card ms-presets-card','aria-labelledby':'msPresetsTitle'},
    h('div',{class:'ms-card-head'},h('h2',{class:'title-m',id:'msPresetsTitle',text:'Music presets'}),h('span',{class:'faint small',text:'Global, reusable in every project'})),
    h('p',{class:'small muted',text:'A preset keeps a style, a tempo source, a texture, and the character and balance of the composed score. It never changes a project\'s key, mode or motif: those come from the project itself.'}),
    h('div',{class:'ms-preset-new'},nameInput,savePresetBtn),nameError,presetList,
    h('div',{class:'ms-starters-head'},h('span',{class:'eyebrow',text:'Starting points'}),h('span',{class:'faint small',text:'Curated · click one to hear it, then Apply or Cancel'})),starters);
  const root=h('div',{class:'split ws-music'},
    h('div',{class:'main'},h('div',{class:'page'},h('div',{class:'page-inner'},head,previewBar,emptyBox,
      h('div',{class:'ms-desk'},scoreBox,
        section({title:'Style',subtitle:'The instruments and the room'},styleGroup,h('div',{class:'ms-style-foot'},styleSource,roomNote)),
        section({title:'Character',subtitle:'How the composed score is played; heard from the next bar',actions:[charReset]},charLock,charGrid,h('div',{class:'ms-style-foot'},charSource)),
        section({title:'Balance',subtitle:'The voices of this style: 0 mutes, 100% is as composed',actions:[mixReset]},mixLock,mixer,h('div',{class:'ms-style-foot'},mixSource,mixNote)),
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
    // What each palette plays depends on the score: the classic one's instruments, or the composed one's roles.
    for(const b of styleCards){const on=b.dataset.style===style;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;b.classList.toggle('pending',on&&'style' in d);
      text(b.querySelector('.ms-style-voices'),STYLE_INFO[b.dataset.style][composed()?'composed':'voices']);
      text(b.querySelector('.ms-style-bpm'),projectBpm(b.dataset.style)?`${projectBpm(b.dataset.style)} BPM`:'');}
    for(const c of identityBox.querySelectorAll('.ms-tempo-cell'))c.classList.toggle('current',c.dataset.style===style);
    sourceLine(styleSource,['style'],'Style',m=>STYLE_NAMES[m.style]);
    if(S.pinned('style'))styleSource.append(h('span',{class:'warn',text:`This window's address pins the style (?style=); saved choices apply elsewhere.`}));
    const bpm=projectBpm(style),beat=mode==='manual'?tempo:bpm;
    text(roomNote,`${STYLE_NAMES[style]}'s room (${STYLE_INFO[style].room} s) comes with the style${composed()?', Space opens or closes it':''}; its echo follows the tempo.`);
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
    // The file is rendered by the same score as the live music (app.js exportAudio): what is heard here is what is written.
    const v3=composed()&&!!S.state.selected;
    text(exportNote,`Renders up to 10 minutes of the recorded performance (in Replay from the playhead, otherwise the last 10 minutes) as this window plays it: the ${v3?'composed':'classic'} score with the style, tempo, texture${v3?', character and balance':''} you hear now${Object.keys(d).length?', including the unsaved preview':''}.`);
    renderCharacter();
  }
  // The score strip: which score the project plays, the upgrade (or the way back) and, while sound is on, whether the
  // music has reached it yet (a change is heard from the next bar).
  function renderScore(){
    const has=!!S.state.selected,r=has&&P.state.project===S.state.selected?P.state.recipe:null;
    chosenScore=!has?3:r?S.effective().music.scoreVersion:null;
    const v3=chosenScore===3,known=chosenScore!==null,t=scoreTunable();
    scoreBox.hidden=!has;root.dataset.score=known?String(chosenScore):'';scoreBox.classList.toggle('composed',v3);
    text(scoreTitle,!known?'Reading the identity…':v3?'Composed score':'Classic score');text(scoreTag,!known?'':v3?'v3':'Phase 10');scoreTag.className=v3?'pill accent':'pill plain';
    text(scoreText,!known?'':v3?'Long-form: phrases grow into passages and sections that develop, rest and return. Shaped by the character and balance below.'
      :'The score this project was first heard with, kept until you choose otherwise. The composed score keeps its key, mode and motif and adds long-form development, the character controls and the balance.');
    // Why the upgrade may not be possible right now (the identity is loading, unavailable, or cannot be tuned).
    const why=scoreWhy=!r?'Loading the identity…':r.unavailable?'This project\'s world is unavailable, so its identity cannot be changed here.':!tunable||tunableFor!==S.state.selected?'Loading the identity…'
      :tunable.error?`Unavailable: ${tunable.error}`:!t?'This identity cannot change its score here.':'';
    upgradeBtn.hidden=chosenScore!==2;upgradeBtn.disabled=scoreBusy||!!why;upgradeBtn.title=why||'Saved to this project\'s identity: every window and the OBS view follow.';
    for(const b of root.querySelectorAll('[data-upgrade]')){b.disabled=scoreBusy||!!why;b.title=upgradeBtn.title;}
    classicBtn.hidden=!v3||!upgradedHere()||!t;classicBtn.disabled=scoreBusy;
    renderScoreState();
  }
  function renderScoreState(){
    const s=P.state.sound,playing=s.enabled?s.score:null,moving=!!playing&&chosenScore!==null&&playing!==chosenScore;
    text(scoreState,scoreBusy?'Saving…':moving?'Heard from the next bar':chosenScore===2?scoreWhy:'');
    scoreState.classList.toggle('accent',moving);scoreState.classList.toggle('faint',!moving);
  }
  // Character and balance: live for the composed score; shown, but still, for the classic one.
  function renderCharacter(){
    const on=composed(),d=draft(),style=shown('style');
    charLock.hidden=on;mixLock.hidden=on;charGrid.classList.toggle('locked',!on);mixer.classList.toggle('locked',!on);
    for(const r of ctlRows){const v=shown(r.key),w=wordOf(r.key,v);
      if(document.activeElement!==r.ctl.range)r.ctl.set(Math.round(v*100));r.ctl.setDisabled(!on);r.ctl.range.setAttribute('aria-valuetext',`${w}, ${pct(v)}`);
      text(r.word,w);text(r.num,pct(v));text(r.docEl,r.doc(style));
      r.el.classList.toggle('pending',r.key in d);r.el.classList.toggle('own',scope==='project'&&own(r.key)!==null);}
    charReset.hidden=!on||PROFILE_KEYS.every(k=>same(shown(k),.5));
    sourceLine(charSource,PROFILE_KEYS,'Character',m=>profileWords(m).toLowerCase());
    if(S.pinned('profile'))charSource.append(h('span',{class:'warn',text:`This window's address pins part of the character or balance (?music=); saved choices apply elsewhere.`}));
    // Only the voices this style can sound with this character (score.js orchestrate), whatever their level.
    const avail=soundingGroups(window.ResonanceScore,style,Object.fromEntries(PROFILE_KEYS.map(k=>[k,shown(k)]))),m=shownMix(),base=mixOf(saved('mix'))||DEFAULT_MIX;
    for(const r of chRows){const v=m[r.g],muted=v===0,name=GROUP_INFO[r.g].name;
      r.el.hidden=!avail.includes(r.g);
      if(document.activeElement!==r.ctl.range)r.ctl.set(Math.round(v*100));r.ctl.setDisabled(!on);r.mute.disabled=!on;r.ctl.range.setAttribute('aria-valuetext',muted?'Muted':pct(v));
      text(r.val,muted?'Muted':pct(v));text(r.role,r.g==='perc'?PERC_ROLE[style]:GROUP_INFO[r.g].role);
      r.el.classList.toggle('muted',muted);r.el.classList.toggle('pending','mix' in d&&!same(v,base[r.g]));
      if(r.muted!==muted||!r.mute.firstChild){r.muted=muted;r.mute.replaceChildren(icon(muted?'sound-off':'sound-on'));}
      r.mute.setAttribute('aria-pressed',String(muted));r.mute.setAttribute('aria-label',`${muted?'Unmute':'Mute'} ${name}`);r.mute.title=muted?`Unmute ${name}`:`Mute ${name}`;}
    mixReset.hidden=!on||sameMix(m,DEFAULT_MIX);
    text(mixNote,GROUPS.filter(g=>!avail.includes(g)).map(g=>g==='perc'?(style==='ambient'?'Percussion joins Ambient when Rhythm is above 55%.':'Percussion rests while Rhythm is this low.')
      :`${GROUP_INFO[g].name} rests at this mood and rhythm.`).join(' '));
    sourceLine(mixSource,['mix'],'Balance',x=>mixWords(x.mix));
    for(const b of starterCards){const s=STARTERS.find(x=>x.id===b.dataset.starter),p=isPreviewing(s.payload);b.setAttribute('aria-pressed',String(p));text(b.querySelector('.ms-starter-act'),p?'Previewing':'');}
  }
  function renderPreview(){
    const d=draft(),pending=Object.keys(d).length>0;
    // A preset or starting point being tried is named, so the bar says what is heard before its details.
    const named=pending?STARTERS.find(x=>isPreviewing(x.payload))||musicPresets().find(x=>isPreviewing(x.payload)):null;
    previewBar.hidden=!pending;badge.firstChild.hidden=!pending;text(previewText,pending?`${named?`“${named.name}” · `:''}${describe(d)}`:'');
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
    // The composed score: where the form is, and which voices are in the arrangement now (the balance lights them).
    const f=on&&s.sound.score===3?s.sound.form:null,layers=on&&s.sound.score===3&&s.sound.layers||[];
    formLine.hidden=!f;if(f)text(formText,`${FORM_NAMES[f.name]||cap(String(f.name))} · ${SECTION_NAMES[f.role]||cap(String(f.role))}, passage ${f.passage+1} of ${f.passages}${f.next&&f.next!==f.role?` · next ${SECTION_NAMES[f.next]||cap(String(f.next))}`:''}`);
    for(const r of chRows){const lit=layers.includes(r.g);r.dot.classList.toggle('on',lit);r.dot.title=lit?'In the arrangement now':'';}
    renderScoreState();
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
      h('p',{class:'small faint',text:'Derived from the project\'s seed; it never changes. Style, tempo, texture, character and balance change how it is performed, not what it is.'}),
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
      presetList.append(h('div',{class:'list-row ms-preset',dataset:{preset:p.id}},p.payload.profile?glyph(p.payload.profile):h('span',{class:'ms-glyph none','aria-hidden':'true'}),
        h('div',{class:'grow'},h('strong',{class:'ellipsis',text:p.name}),h('div',{class:'faint small',text:summary(p.payload)})),
        button({label:previewing?'Previewing':'Preview',icon:'eye',size:'sm',kind:'ghost',pressed:previewing,attrs:{'data-act':'preview','aria-label':`Preview ${p.name}`},onClick:()=>previewPreset(p.payload)}),
        button({label:scope==='project'?'Apply to project':'Apply as default',icon:'check',size:'sm',attrs:{'data-act':'apply'},onClick:()=>applyPreset(p)}),
        button({label:'Rename',size:'sm',kind:'ghost',attrs:{'data-act':'rename','aria-label':`Rename ${p.name}`},onClick:()=>renamePreset(p)}),
        button({icon:'trash',size:'sm',kind:'ghost',title:'Delete',attrs:{'data-act':'delete','aria-label':`Delete ${p.name}`},onClick:()=>deletePreset(p)})));}
  }
  function renderExport(){const busy=!!P.state.exporting;exportBtn.disabled=busy||!S.state.selected;exportBtn.setAttribute('aria-busy',String(busy));text(exportBtn.querySelector('span'),busy?'Rendering…':'Render audio (WAV)');
    text(exportBusy,busy?'Rendering offline: this can take a few minutes. The file downloads when it is ready; you can keep working.':'');}
  function renderEmpty(){emptyBox.replaceChildren();
    if(S.state.projectsLoaded&&!S.state.projects.length)emptyBox.append(emptyState({icon:'music',title:'No project yet',body:'The score is generated from a project. You can still set the global defaults; the identity, preview and export appear once a project is captured.'}));
    if(S.state.errors.settings)emptyBox.append(callout({kind:'warn',icon:'warn',title:'Settings could not be read',body:`${S.state.errors.settings}. Showing the built-in defaults until the receiver answers.`}));}
  function renderAll(){renderScope();renderScore();renderIdentity(true);renderValues();renderPreview();renderSound();renderTuning();renderPresets();renderExport();renderEmpty();}
  renderAll();void loadTunable();
  offs.push(S.on(t=>{
    if(t.has('selection')){if(wasPending)toast('Music preview cancelled: another project was selected (nothing was saved).','info');if(!S.state.selected)scope='global';else if(!scopeChosen)scope='project';renderAll();void loadTunable();return;}
    if(t.has('projects')||t.has('preferences')||t.has('settings')){renderScope();renderEmpty();}
    if(t.has('settings')||t.has('preferences')||t.has('musicPreview')||t.has('sound')){renderValues();renderPreview();}
    if(t.has('musicPreview')||t.has('presets'))renderPresets();
    if(t.has('frame')||t.has('model'))renderIdentity();
    if(t.has('sound'))renderSound();else if(t.has('position'))renderLive();
    // The recipe holds the score version: a change (here, in another window, or a Visual Studio preview) re-gates the controls.
    if(t.has('recipe')||t.has('preview')){renderScore();renderValues();}
    if(t.has('recipe')){renderTuning();if(P.state.recipe?.revision!==tunable?.revision)void loadTunable();}
    if(t.has('export'))renderExport();
  }));
  return {unmount(){
    for(const f of offs)f();badge.remove();
    // A preview is never left behind: leaving the studio restores the saved music (the volume included).
    if(S.state.musicPreview){const pending=Object.keys(draft()).length>0;S.previewMusic(null);if(pending)toast('Music preview cancelled: the changes were not saved.','info');}
  }};
}};

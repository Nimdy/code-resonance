// Visual Studio: the project's World DNA (its Visual Recipe) seen on the real stage, changed through a preview, saved
// only by Apply. Four things are kept apart, in the interface and in the code:
//   Project identity  the saved recipe (receiver, recipe.json, revision-numbered): what every window and the OBS view show;
//   Preview           a candidate computed by POST /api/recipe/preview from a list of pending actions, shown on this
//                     window's stage only (P.preview), never stored;
//   Preset            a reusable look (receiver presets.json, all projects), applied through the same preview;
//   Visual pack       installed software (a world family or a look); an unapproved pack with code never runs, even in
//                     a preview — the engine shows the saved identity and says so.
// Pending changes are kept as a small structured draft (identity choices, tuning, presentation, lock) and compiled into
// the action list in a fixed order, so the same draft always means the same candidate; a change that the receiver
// refuses is rolled back and its message shown where it was made.
import {h,text,clear,button,field,select,segmented,slider,parameterControl,humanize,formatParam,disclosure,pill,callout,emptyState,modal,confirmDialog,toast,styles} from '../dom.js';
import {icon} from '../icons.js';
import {WORLD_NAMES,LABEL_NAMES,LABEL_DOCS,QUALITY_NAMES,publicName,count} from '../format.js';
import {roleOf} from '../../worlds/model.js';
// Each built-in family with the reason to choose it: what the code becomes, and what its moments look like.
const FAMILIES=[
  {id:'fractal-biosphere',name:'Fractal Biosphere',line:'A recursive undersea forest grown from the code',
    why:'Each subsystem is an organism whose crown branches with its structure. Passing tests bloom, failures blight the branches until they recover, milestones leave flowers that stay. For code that grows organically.'},
  {id:'stellar-forge',name:'Stellar Forge',line:'A galaxy: subsystems are star systems in its arms',
    why:'Scale and gravity: modules orbit their hubs, agents cross as comets, failures are storms over the affected worlds, milestones are novae that leave remnants. For large projects of many modules.'},
  {id:'machine-cathedral',name:'Machine Cathedral',line:'Needle spires on still water under a moon',
    why:'Order and craft: subsystems are towers, live work lights their windows, links are bridges of light, failures crack the stone and recovery seals it. For tested, engineered code.'},
  {id:'synaptic-storm',name:'Synaptic Storm',line:'A living neural network wired by the real dependencies',
    why:'Subsystems are clusters of glassy neurons, files their dendrite branches, dependencies the axons between them. Agents travel as signals in their own colour and make the neuron they edit fire; tests sweep activation waves, failures misfire, verified milestones earn a rare synaptic storm. For densely wired code and the agents working in it.'},
  {id:'fractal-continuum',name:'Fractal Continuum',line:'An evolving 3D fractal whose recursion is the code',
    why:'The code\'s character picks the universe (a Mandelbulb, a Julia bulb, a Mandelbox or a crystal) and its branching; subsystems are regions of the surface, files sites of light on it. Growth unfolds the recursion, agents touch their files with ripples in their own colour, tests send a coherent wave of light, failures distort the region they cover, verified milestones earn a rare fractal bloom. For intricate, function-heavy code in a few subsystems.'},
  {id:'temporal-terrain',name:'Temporal Terrain',line:'The project\'s history as a contour landscape',
    why:'Time is the land: the present is the lit front edge, the past recedes toward the horizon. Subsystems are ranges in their own hues, files the ridges that run back from the moment they were made, luminous contour lines crowd where code grew fast. Agents survey the land in their own colour and raise the ground where they edit; tests sweep a scan, failures open a fault that stays as a scar, commits leave survey stakes, verified milestones earn a rare sunrise and a beacon. For projects whose history was recorded from the start.'}];
// Curated looks for the built-in worlds, two each: built in, read-only, previewed and applied like a saved preset. Every
// path is a real parameter of its family, within its range (checked in tests/recipe-tuning.test.js).
const CURATED=[
  {id:'curated:abyss',name:'Bioluminescent abyss',line:'Deep teal water, strong inner light, fireflies in the dark.',payload:{family:'fractal-biosphere',tuning:{'atmosphere.terrain':'abyss','material.bioluminescence':1.6,'atmosphere.lightShafts':.35,'atmosphere.fog':.9,'atmosphere.fireflies':1.2,'technique.finish':'dreamlike'}}},
  {id:'curated:reef',name:'Sunlit reef',line:'Bright shafts through violet water, translucent fronds swaying.',payload:{family:'fractal-biosphere',tuning:{'atmosphere.lightShafts':1.35,'material.bioluminescence':.8,'technique.exposure':1.15,'motion.sway':1.2,'material.translucency':.8,'technique.finish':'cinematic'}}},
  {id:'curated:deep-field',name:'Deep field',line:'Seen from farther out: a calm, cool galaxy in a dense starfield.',payload:{family:'stellar-forge',tuning:{'atmosphere.stars':1.5,'atmosphere.nebulaDensity':.5,'motion.orbitSpeed':.5,'camera.distance':1.3,'technique.saturation':.85,'technique.finish':'clean'}}},
  {id:'curated:nursery',name:'Stellar nursery',line:'Warm billowing nebulae, thick dust and bright young plasma.',payload:{family:'stellar-forge',tuning:{'atmosphere.nebula':'billowing','atmosphere.nebulaDensity':1.5,'material.plasma':1.3,'atmosphere.dust':1.4,'technique.saturation':1.3,'technique.tint':[1.12,.94,1.06],'technique.finish':'dreamlike'}}},
  {id:'curated:vigil',name:'Moonlit vigil',line:'Cold blue night, deep fog, moon rays and a mirror of water.',payload:{family:'machine-cathedral',tuning:{'atmosphere.weather':'night-fog','atmosphere.shafts':1.4,'atmosphere.fog':1.2,'material.wetness':1,'secondary.windows':.6,'technique.tint':[.9,.97,1.12],'technique.finish':'cinematic'}}},
  {id:'curated:evensong',name:'Amber evensong',line:'Warm dusk haze, brass and every window glowing amber.',payload:{family:'machine-cathedral',tuning:{'atmosphere.weather':'dusk-haze','secondary.windows':1.6,'material.metal':1,'atmosphere.fog':.5,'atmosphere.shafts':.6,'technique.exposure':1.3,'technique.tint':[1.15,1,.85],'technique.lift':[.02,.01,0],'technique.finish':'cinematic'}}},
  {id:'curated:storm-front',name:'Storm front',line:'Gold fire racing through a deep violet network, locked to the beat.',payload:{family:'synaptic-storm',tuning:{'motion.firingRate':1.6,'motion.sync':.9,'motion.conduction':1.4,'material.glow':1.4,'atmosphere.haze':1.2,'technique.finish':'dreamlike'}}},
  {id:'curated:glass-cortex',name:'Glass cortex',line:'A clear, flat sheet of glassy neurons, sharp from near to far, firing calmly.',payload:{family:'synaptic-storm',tuning:{'space.depth':.35,'material.translucency':.95,'atmosphere.depthOfField':.25,'atmosphere.haze':.4,'motion.firingRate':.7,'technique.finish':'clean'}}},
  {id:'curated:teal-bulb',name:'Teal Mandelbulb',line:'The reference: an eight-fold Mandelbulb in teal, seen down its axis, gold light on its rims.',payload:{family:'fractal-continuum',tuning:{'fractal.form':'bulb','fractal.power':8,'fractal.twist':0,'palette.primary':'#33828e','camera.personality':'pole','technique.finish':'cinematic'}}},
  {id:'curated:kaleidoscope',name:'Kaleidoscope crystal',line:'A faceted crystal of mirrored recursion, glassy rims and a slow circling light.',payload:{family:'fractal-continuum',tuning:{'fractal.form':'kifs','fractal.shape':.7,'material.sheen':.5,'material.rim':1.2,'motion.light':.9,'atmosphere.halo':.6,'technique.finish':'dreamlike'}}},
  {id:'curated:survey-map',name:'Survey map',line:'From high above: fine, bright contours like a lit chart, the mist cleared away.',payload:{family:'temporal-terrain',tuning:{'camera.personality':'map','camera.elevation':1.2,'motion.drift':0,'contour.interval':.65,'contour.glow':1.4,'atmosphere.mist':.3,'atmosphere.haze':.4,'technique.finish':'clean'}}},
  {id:'curated:misty-valley',name:'Misty valley',line:'Low along the land toward a warm horizon, mist pooling in the valleys.',payload:{family:'temporal-terrain',tuning:{'camera.personality':'valley','motion.drift':0,'atmosphere.mist':1.4,'atmosphere.haze':1.1,'relief.height':1.25,'technique.tint':[1.08,1,.92],'technique.finish':'cinematic'}}}];
// The few parameters that change a world the most, shown first; every other one stays under its group.
const ESSENTIALS={
  'fractal-biosphere':['space.canopy','material.bioluminescence','atmosphere.lightShafts','atmosphere.fog','motion.sway','life.enabled','life.music'],
  'stellar-forge':['geometry.arrangement','geometry.spiralArms','atmosphere.nebulaDensity','material.plasma','motion.orbitSpeed','life.enabled','life.music'],
  'machine-cathedral':['geometry.architecture','geometry.spire','atmosphere.shafts','atmosphere.fog','material.wetness','secondary.windows','life.enabled','life.music'],
  'synaptic-storm':['material.glow','motion.firingRate','space.depth','atmosphere.haze','atmosphere.ghosts','geometry.dendrites','life.enabled','life.music'],
  'fractal-continuum':['fractal.form','fractal.power','fractal.twist','material.trap','material.glow','camera.personality','life.enabled','life.music'],
  'temporal-terrain':['relief.height','contour.interval','contour.glow','atmosphere.mist','time.scale','camera.personality','life.enabled','life.music'],
  common:['technique.exposure','music.reactivity']};
const CLASSIC=[
  {id:'construct',icon:'grid',line:'The software as an illuminated architectural model (WebGL)'},
  {id:'city',icon:'layers',line:'The site plan drawn flat, as an architectural elevation (Canvas 2D); the fallback without WebGL'}];
// Parameter groups (the first genome path segment), named for the sub-headings inside a creative purpose.
const GROUPS=[['params','World controls'],['uniforms','Look controls'],['geometry','Geometry'],['secondary','Secondary forms'],['space','Space'],['material','Materials'],['atmosphere','Atmosphere'],
  ['light','Light'],['motion','Motion'],['camera','Camera'],['palette','Palette'],['grade','Grade'],['music','Music response'],['agents','Agents'],['limits','Labels on screen'],['technique','Rendering technique'],['life','Digital life']];
const GROUP_OF={agentProminence:'agents'};
// Every parameter sits under the creative purpose an artist looks for (not under its genome group): the world's own
// controls first (a world pack's parameters, a shader look's uniforms), then form, atmosphere, motion, colour, music
// and rendering. `limits` holds how many callouts the stage shows (not a performance budget), so it sits with the agents
// and the music as what the stage presents. A path no purpose names stays reachable under "Other".
const COLOUR_TECHNIQUE=new Set(['technique.tint','technique.lift','technique.saturation']);
const PURPOSES=[
  {id:'pack',name:'This world\'s own controls',groups:['params']},
  {id:'look',name:'This look\'s own controls',groups:['uniforms']},
  {id:'form',name:'Form and material',groups:['geometry','secondary','space','material']},
  {id:'atmosphere',name:'Atmosphere and light',groups:['atmosphere','light']},
  {id:'motion',name:'Motion and camera',groups:['motion','camera']},
  {id:'life',name:'Digital life',groups:['life'],note:'Autonomous inhabitants simulated in the world: they never stand for agents, files or events. Off shows the world exactly as before.'},
  {id:'colour',name:'Colour',groups:['palette','grade']},
  {id:'music',name:'Music, agents and labels',groups:['music','agents','limits']},
  {id:'rendering',name:'Rendering',groups:['technique'],note:'Multipliers over the world\'s own light (Atmosphere and light) and grade (Colour): 1 leaves it as it is.'}];
const groupOf=(path,sp)=>COLOUR_TECHNIQUE.has(path)?'grade':GROUP_OF[sp.group]||sp.group;
const purposeOf=g=>PURPOSES.find(x=>x.groups.includes(g))?.id||'other';
// Technique values are multipliers the world host applies to the family's own grade (public/worlds/host.js
// withTechnique): absent means identity, so that is what an untouched control shows.
const TECHNIQUE_IDENTITY={'technique.exposure':1,'technique.bloom':1,'technique.contrast':1,'technique.saturation':1,'technique.vignette':1,'technique.grain':1,'technique.aberration':.004,'technique.tint':[1,1,1],'technique.lift':[0,0,0]};
// Values a world renders when an older genome lacks a parameter added later (generator v2 added these to the Machine
// Cathedral; the numbers are its own fallbacks in public/worlds/cathedral.js), so a control starts from what is shown.
// Digital life (generator v3): an older identity has none, so its controls start from off and neutral scales.
const LIFE_OFF={'life.enabled':false,'life.density':1,'life.vitality':1,'life.collective':1,'life.environment':1,'life.trails':1,'life.persistence':1,'life.music':1,
  'life.attraction':1,'life.repulsion':1,'life.separation':1,'life.alignment':1,'life.cohesion':1,'life.current':1,'life.diffusion':1,'life.radius':1,'life.ecology':1};
// The graduated worlds' identities saved before generator 5 have no life either.
const ADDED_DEFAULTS={'machine-cathedral':{'atmosphere.shafts':.8,'material.wetness':.6,...LIFE_OFF},'fractal-biosphere':{...LIFE_OFF},'stellar-forge':{...LIFE_OFF},
  'synaptic-storm':{...LIFE_OFF},'fractal-continuum':{...LIFE_OFF},'temporal-terrain':{...LIFE_OFF}};
// Parameters whose last path segment alone would not say what they are (the Essentials list them out of their group).
const LABEL_OF={'life.enabled':'Digital life','life.music':'Music influence','life.ecology':'Ecology'};
// Where a catalogue description says more than the control needs (the music influence explains its scale itself).
const DOC_OF={'life.music':'How strongly the music shapes the conditions the inhabitants live in: where gathering is easy, how far they roam, the currents and the light. Never where they go.'};
// Choices named for what they are rather than their stored value.
const VALUE_LABELS={'life.ecology':{1:'Earlier climate',2:'Musical ecology'}};
// The music influence scale: what 0, 1 and 2 mean (life.music; docs/LIFE.md).
const INFLUENCE=[[0,'Independent','The ecology lives by itself: the music changes nothing.'],
  [1,'Musical','Sections visibly change how the inhabitants gather, roam and glow. The default.'],
  [2,'Expressive','Unmistakable: each section reshapes the ecosystem, which stays autonomous.']];
// The finish: a lens and colour profile over the world's own grade (public/worlds/host.js FINISHES). Classic is no
// finish: the grade exactly as before Phase 11, what an identity saved before it shows until one is chosen.
const FINISH_LOOKS=[
  {value:'classic',label:'Classic',line:'The world\'s own grade, exactly as it was before finishes.'},
  {value:'clean',label:'Clean',line:'Crisp and high-clarity: restrained bloom, almost no colour fringe, very little grain.'},
  {value:'cinematic',label:'Cinematic',line:'Filmic highlights, a subtle optical fringe toward the edges, warm halation and a gentle vignette. The default for new identities.'},
  {value:'dreamlike',label:'Dreamlike',line:'Luminous and atmospheric: a soft mist around the light, stronger halation, richer colour separation. Forms stay sharp.'}];
// Shown in the Finish section (and the Music Studio's score), not again among all parameters.
const OWN_SECTION=new Set(['technique.finish','technique.aberration','music.score']);
// The chromatic aberration a world draws when the creator has set none (Stellar Forge asks for less: stellar.js grade).
const WORLD_ABERRATION={'stellar-forge':.0022};
const ABERRATION_UNIT=.004;
const NAME=/^[\p{L}\p{N} .,'&()-]{1,40}$/u;
const NAME_RULE='Up to 40 letters, digits, spaces and . , \' & ( ) -';
const ROLE_WORD={tests:'Proof',core:'Heart',interface:'Surface',services:'Gateway',model:'Form',logic:'Craft'};
// Rendered thumbnails, kept across visits: one per (project, saved revision, family).
const THUMBS=new Map();
const enc=encodeURIComponent;
const getPath=(o,p)=>p.split('.').reduce((x,k)=>x?.[k],o);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=x=>JSON.parse(JSON.stringify(x));
const emptyDraft=()=>({identity:[],reset:false,tune:{},overrides:{},lock:null,world:null});
const pct=v=>`${Math.round(Number(v)*100)} %`;
export default {mount(view,{store:S,player:P,navigate,chrome,params}){
  styles('visual');
  const offs=[];let alive=true;
  // ---- State --------------------------------------------------------------------------------------------------------
  let projectId='',saved=null,savedSpec=null,loadError='';
  let draft=emptyDraft(),lastGood=emptyDraft(),baseRevision=null,candidate=null,candidateSpec=null,runtime=null,previewError=null,previewSeq=0,previewTimer=null,busy=false;
  let presetPreview=null,wantedRoute=params?.length?params:null,nameOf=null,thumbRun=0,proposing=false,proposed=null;
  const presetErrors=new Map();
  // Subsystem names come from the same generator the worlds use (loaded with the world host, already cached by the engine).
  import('../../worlds/host.js').then(m=>{nameOf=m.generatedName;if(alive)renderAliases(true);}).catch(e=>console.warn('Generated names unavailable',e));
  const shown=()=>candidate||saved;
  const shownSpec=()=>candidate?candidateSpec:savedSpec?.tunable||null;
  const familyName=id=>S.state.catalog?.families?.[id]?.name||FAMILIES.find(f=>f.id===id)?.name||P.state.packs.find(p=>p.id===id)?.family?.name||P.state.packs.find(p=>p.id===id)?.name||id;
  const packOf=id=>P.state.packs.find(p=>p.id===id)||null;
  const savedWorld=()=>S.effective().world;
  const hasIdentity=d=>d.identity.length>0;
  function recipeActions(d=draft){
    const a=[...d.identity];
    if(d.reset)a.push({type:'tune-reset'});
    if(Object.keys(d.tune).length)a.push({type:'tune',values:{...d.tune}});
    if(Object.keys(d.overrides).length)a.push({type:'overrides',...d.overrides});
    if(d.lock!==null)a.push({type:'lock',locked:d.lock});
    return a;
  }
  const pendingRecipe=()=>recipeActions().length>0;
  const pending=()=>pendingRecipe()||draft.world!==null;
  // A draft that would change nothing is no draft: values equal to the saved ones are dropped as they are set.
  function normalize(){
    if(!saved)return;
    const sameBase=!hasIdentity(draft)&&!draft.reset;
    for(const k of Object.keys(draft.overrides))if(saved.overrides?.[k]===draft.overrides[k])delete draft.overrides[k];
    if(draft.reset&&!hasIdentity(draft)&&!saved.tuning)draft.reset=false;
    if(sameBase)for(const [k,v] of Object.entries(draft.tune)){const tuned=Object.hasOwn(saved.tuning?.values||{},k);if(v===null?!tuned:same(v,getPath(saved.genome,k)))delete draft.tune[k];}
    if(draft.lock!==null&&!hasIdentity(draft)&&!draft.reset&&!Object.keys(draft.tune).length&&draft.lock===!!saved.locked)draft.lock=null;
    if(draft.world!==null&&draft.world===savedWorld()&&!pendingRecipe())draft.world=null;
  }
  // ---- Layout -------------------------------------------------------------------------------------------------------
  const slot=h('div',{class:'stage-slot vs-slot','data-stage-slot':''});
  const legend=h('div',{class:'vs-legend','aria-label':'What the words on this page mean'},
    ...[['saved','Project identity','saved, shown everywhere'],['preview','Preview','this window only, not saved'],['preset','Preset','reusable, all projects'],['pack','Visual pack','installed software']]
      .map(([k,a,b])=>h('span',{class:`vs-term ${k}`,title:`${a}: ${b}`},h('i'),h('strong',{text:a}),h('span',{text:b}))));
  const head=h('div',{class:'vs-head'},h('h1',{class:'title-l',id:'vsTitle',text:'Visual Studio'}),legend);
  const stageBox=h('div',{class:'vs-stage'},slot);
  const tabs=segmented({label:'Browse',value:S.state.ui.visualTab||'living',options:[{value:'living',label:'Living worlds'},{value:'classic',label:'Classic stages'},{value:'presets',label:'Presets'}],
    onChange:v=>{S.setUi({visualTab:v});renderBrowser();}});
  const browserActions=h('div',{class:'vs-browser-actions'});
  const browserNote=h('div',{class:'vs-browser-note faint small'});
  // The strip's note in full, and a shorter form a narrow column shows instead (the full one is its tooltip).
  const note=(t,short=t)=>{clear(browserNote);browserNote.append(h('span',{class:'vs-note-long',text:t}),h('span',{class:'vs-note-short',text:short}));browserNote.title=t;};
  const cards=h('div',{class:'vs-cards scroll',role:'list'});
  // A strip wider than the column fades at the edge it continues past, so a cut card reads as "scroll for more".
  function fadeCards(){const over=cards.scrollWidth-cards.clientWidth;cards.classList.toggle('fade-r',over>2&&cards.scrollLeft<over-2);cards.classList.toggle('fade-l',over>2&&cards.scrollLeft>2);}
  // Why to choose shows on a card only when it fits whole: never a cut sentence (it stays the card's tooltip). The world
  // cards show it on all of them or none, so their names keep one baseline; a preset card (text from the top) on its own.
  function fitWhy(){
    const whys=[...cards.querySelectorAll('.vs-card-why')];
    for(const w of whys)w.classList.remove('cut');
    const isCut=w=>w.clientHeight>0&&w.scrollHeight>w.clientHeight+1;
    const worlds=whys.filter(w=>!w.closest('.preset'));
    if(worlds.some(isCut))for(const w of worlds)w.classList.add('cut');
    for(const w of whys.filter(w=>w.closest('.preset')&&isCut(w)))w.classList.add('cut');
  }
  const layoutCards=()=>{fitWhy();fadeCards();};
  cards.addEventListener('scroll',fadeCards,{passive:true});
  const cardsObserver=new ResizeObserver(()=>layoutCards());cardsObserver.observe(cards);
  const browser=h('section',{class:'vs-browser','aria-label':'World browser'},h('div',{class:'vs-browser-head'},tabs,browserNote,browserActions),cards);
  const main=h('div',{class:'main vs-main'},head,stageBox,browser);
  // Inspector
  const statePill=h('span',{class:'pill plain'});
  const inspTitle=h('h2',{class:'vs-family'});
  const inspSub=h('div',{class:'vs-sub small muted'});
  const inspHead=h('div',{class:'inspector-head'},h('div',{class:'vs-insp-top'},h('span',{class:'eyebrow',text:'World DNA'}),statePill),inspTitle,inspSub);
  const body=h('div',{class:'inspector-body'});
  const footStatus=h('div',{class:'vs-foot-status small',role:'status','aria-live':'polite'});
  const cancelBtn=button({label:'Cancel',kind:'ghost',id:'vsCancel',onClick:()=>discard()});
  const applyBtn=button({label:'Apply',kind:'primary',icon:'check',id:'vsApply',onClick:()=>apply()});
  const foot=h('div',{class:'inspector-foot vs-foot'},footStatus,cancelBtn,applyBtn);
  const inspector=h('aside',{class:'inspector vs-inspector','aria-label':'World DNA'},inspHead,body,foot);
  view.append(h('div',{class:'split ws-visual'},main,inspector));
  // Over the stage: what it shows (saved or preview) and why, when it shows something else than asked.
  const badge=h('div',{class:'vs-badge'}),stageNote=h('div',{class:'vs-stage-note',role:'status','aria-live':'polite'});
  const chromeLayer=h('div',{class:'vs-chrome chrome-pass'},badge,stageNote);
  chrome.append(chromeLayer);offs.push(()=>chromeLayer.remove(),()=>cardsObserver.disconnect());
  // ---- Inspector sections (built once per project; their contents update in place) ---------------------------------
  // Why this family: what the code becomes in it (contextual: the family shown, saved or previewed).
  const whyBox=h('p',{class:'vs-why small muted'});
  const identityBox=h('div',{class:'vs-identity'});
  const actAuto=button({label:'Automatic',icon:'spark',size:'sm',kind:'outline',id:'vsAutomatic',title:'Let the code choose the family again (the generated identity)',onClick:()=>chooseAutomatic()});
  const actRegen=button({label:'Regenerate',icon:'dice',size:'sm',kind:'outline',id:'vsRegenerate',title:'A new seeded draw from the same traits',onClick:()=>regenerate()});
  const actLock=button({label:'Lock',icon:'lock',size:'sm',kind:'outline',id:'vsLock',onClick:()=>toggleLock()});
  const actReset=button({label:'Reset customisations',icon:'reset',size:'sm',kind:'outline',id:'vsReset',title:'Every tuned parameter back to its generated value; spectacle and motion to 100 %',onClick:()=>resetCustom()});
  const identityActions=h('div',{class:'vs-actions'},actAuto,actRegen,actLock,actReset);
  const identityNote=h('div',{class:'vs-identity-note'});
  const lookSelect=select({id:'vsLook',label:'Look pack',options:[{value:'',label:'None'}],value:'',onChange:v=>chooseLook(v||null)});
  const LOOK_DOC='A visual pack drawn over the family: its palette, light and rendering. A look with code runs only once approved.';
  // On a short screen the description is the select's tooltip only (the field's purpose is in its label and options).
  const lookField=field({label:'Look pack',control:lookSelect,doc:LOOK_DOC,labelFor:'vsLook'});lookField.classList.add('stack');lookSelect.title=LOOK_DOC;
  const lookNone=h('p',{class:'small faint'});
  const lookBox=h('div',{class:'vs-look vs-props'},lookField,h('div',{class:'vs-look-empty'},lookNone,h('button',{type:'button',class:'link-btn small',onClick:()=>navigate('packs'),text:'Visual Packs'})));
  // The exact-value box carries the unit (it reads back "150 %" as 150), so the field needs no second read-out.
  const intensity=slider({min:0,max:200,integer:true,value:100,format:v=>`${v} %`,label:'Spectacle (%)',id:'vsIntensity',onInput:v=>setOverride('intensity',v/100,false),onChange:v=>setOverride('intensity',v/100,true)});
  const motion=slider({min:0,max:200,integer:true,value:100,format:v=>`${v} %`,label:'Motion (%)',id:'vsMotion',onInput:v=>setOverride('motion',v/100,false),onChange:v=>setOverride('motion',v/100,true)});
  const labels=segmented({label:'Information on the stage',id:'vsLabels',value:'cinematic',options:P.LABEL_MODES.map(m=>({value:m,label:LABEL_NAMES[m],title:LABEL_DOCS[m]})),onChange:m=>setOverride('labels',m===globalLabels()?null:m,true)});
  // Choosing the global default means following it (null), so a later change in Settings applies to this project again.
  function globalLabels(){return S.state.settings?.stage?.labels||'cinematic';}
  const fIntensity=field({label:'Spectacle',doc:'How strongly events are staged: 100 % is the identity as generated.',control:intensity,onReset:()=>setOverride('intensity',1,true)});
  const fMotion=field({label:'Motion',doc:'Camera and ambient movement.',control:motion,onReset:()=>setOverride('motion',1,true)});
  const fLabels=field({label:'Information',doc:'',control:labels});
  // Sliders and rows of choices take the full width under their label (a long track, the same order as every parameter).
  for(const f of [fIntensity,fMotion,fLabels])f.classList.add('stack');
  // The finish: the lens and colour over the world's grade, previewed at once (the world itself is not rebuilt), with
  // the chromatic aberration's strength; an identity made before Phase 11 is offered the new finish and ecology.
  const finishSeg=segmented({label:'Finish',id:'vsFinish',block:true,value:'classic',options:FINISH_LOOKS.map(f=>({value:f.value,label:f.label,title:f.line})),onChange:v=>chooseFinish(v)});
  const finishLine=h('p',{class:'vs-finish-line small muted',id:'vsFinishLine'});
  const finishErr=h('div',{class:'vs-error small',role:'alert'});
  const abOf=v=>+(v*ABERRATION_UNIT/100).toFixed(6);
  const aberration=slider({min:0,max:500,integer:true,value:100,format:v=>`${v} %`,label:'Chromatic aberration (%)',id:'vsAberration',
    onInput:v=>setTune('technique.aberration',abOf(v),false),onChange:v=>setTune('technique.aberration',abOf(v),true)});
  const fAberration=field({label:'Chromatic aberration',doc:' ',control:aberration,onReset:()=>setTune('technique.aberration',null,true)});fAberration.classList.add('stack');
  const upgradeBox=h('div',{class:'vs-upgrade'});
  // The way on to deeper composition (layers and reactive mappings over this world): the Artist Studio, from this family.
  const artistBtn=button({label:'Open in Artist Studio',icon:'brush',kind:'outline',id:'vsArtist',onClick:()=>openArtist()});
  const COMPOSE_LINE='Layers, reactive mappings and a finish of your own over this world.',composeLine=h('span',{class:'small faint',text:COMPOSE_LINE});
  const compose=h('div',{class:'vs-compose'},h('div',{class:'vs-compose-text'},h('strong',{text:'Make it your own'}),
    composeLine),artistBtn);
  const sectionHead=(title,sub=null,...extra)=>h('div',{class:'vs-sec-head'},h('h3',{class:'eyebrow',text:title}),sub?h('span',{class:'tiny faint',text:sub}):null,h('span',{class:'rule'}),...extra);
  const finishSection=h('section',{class:'vs-sec vs-sec-finish','aria-label':'Finish'},sectionHead('Finish','lens and colour'),finishSeg,finishLine,finishErr,h('div',{class:'vs-props'},fAberration),upgradeBox,compose);
  // The Essentials (first, open) and every other parameter under its creative purpose (folded).
  const essBox=h('div',{class:'vs-params vs-props vs-ess'});
  const paramsBox=h('div',{class:'vs-params vs-props vs-adv'});
  const paramsSummary=h('span',{class:'tiny faint vs-params-count'});
  const essSection=h('section',{class:'vs-sec vs-sec-ess','aria-label':'Essentials'},essBox);
  const titleInput=h('input',{class:'input',id:'vsTitleInput',type:'text',maxlength:40,autocomplete:'off',spellcheck:'false','aria-label':'Public title','aria-describedby':'vsTitleHelp'});
  const titleError=h('div',{class:'vs-error small',id:'vsTitleError',role:'alert'});
  const titleSave=button({label:'Save title',size:'sm',id:'vsTitleSave',onClick:()=>saveTitle()});
  const titleShown=h('div',{class:'small faint',id:'vsTitleHelp'});
  const aliasBox=h('div',{class:'vs-aliases',id:'vsAliases'});
  const quality=segmented({label:'Rendering quality on this device',id:'vsQuality',value:P.state.quality,options:P.QUALITY.map(q=>({value:q,label:QUALITY_NAMES[q]})),
    onChange:q=>{S.unpin('quality');S.setDevice({quality:q});P.setQuality(q);}});
  function buildInspector(){
    clear(body);
    if(!S.state.selected){body.append(emptyState({icon:'visual',title:S.state.projectsLoaded?'No project yet':'Loading projects…',body:S.state.projectsLoaded?'A project appears when capture starts in VS Code. Its world identity is edited here.':null,
      actions:S.state.projectsLoaded?[button({label:'How to connect',onClick:()=>navigate('connections')})]:[]}));return;}
    if(!saved){body.append(loadError?callout({kind:'danger',icon:'warn',title:'The identity could not be loaded',body:loadError,actions:[button({label:'Retry',size:'sm',onClick:()=>loadSaved()})]}):h('div',{class:'faint small',text:'Loading the identity…'}));return;}
    // In the order of creative weight: which world and its state, the few strongest controls, how it is staged, every
    // parameter, then the names the stage shows and this device's rendering quality.
    body.append(
      h('section',{class:'vs-sec vs-sec-identity','aria-label':'Identity'},whyBox,identityBox,lookBox,identityActions,identityNote),
      finishSection,essSection,
      h('section',{class:'vs-sec','aria-label':'Presentation'},sectionHead('Presentation','how events are staged'),h('div',{class:'vs-props'},fIntensity,fMotion,fLabels)),
      h('section',{class:'vs-sec','aria-label':'All parameters'},sectionHead('All parameters',null,paramsSummary),paramsBox),
      h('section',{class:'vs-sec','aria-label':'Names on the stage'},sectionHead('Names on the stage'),
        h('div',{class:'vs-sub-head'},h('label',{class:'field-label',for:'vsTitleInput',text:'Public title'})),
        h('div',{class:'field-row vs-input-row'},titleInput,titleSave),titleError,titleShown,
        h('div',{class:'vs-sub-head'},h('span',{class:'field-label',text:'Subsystem names'}),h('span',{class:'tiny faint',text:'shown in labels on the stage'})),aliasBox),
      h('section',{class:'vs-sec','aria-label':'This device'},sectionHead('Quality','this device only'),quality,h('div',{class:'field-doc',text:'Auto lowers the resolution only while frames are slow. Kept in this browser; other machines keep their own choice.'})));
    paramSig='';aliasSig='';
  }
  titleInput.addEventListener('input',()=>{const v=titleInput.value.trim(),ok=!v||NAME.test(v);titleInput.setAttribute('aria-invalid',String(!ok));text(titleError,ok?'':NAME_RULE);titleInput.dataset.dirty='1';});
  titleInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void saveTitle();}});
  // ---- Loading the saved identity ---------------------------------------------------------------------------------
  async function loadSaved(){
    const id=S.state.selected;if(!id)return;
    try{const r=await S.get(`/api/recipe?id=${enc(id)}`);if(!alive||id!==S.state.selected)return;loadError='';adoptSaved(r);}
    catch(e){if(!alive||id!==S.state.selected)return;loadError=e.message;if(!saved)buildInspector();}
  }
  function adoptSaved(r){
    if(!r||!Number.isInteger(r.revision))return;
    if(saved&&r.revision<saved.revision)return;
    const first=!saved,changed=first||r.revision!==saved.revision;
    saved=r;
    if(!pending())baseRevision=r.revision;
    if(first)buildInspector();
    if(changed){void loadSpec();renderAll();runThumbs();consumeRoute();}
  }
  async function loadSpec(){
    const id=projectId,rev=saved?.revision;
    try{const r=await S.get(`/api/recipe/tunable?id=${enc(id)}`);if(!alive||id!==projectId)return;if(rev!==undefined&&r.revision<rev)return;savedSpec=r;renderFinish();renderParams();}
    catch(e){if(alive)text(paramsSummary,`The parameters could not be loaded: ${e.message}`);}
  }
  function resetProject(){
    const id=S.state.selected||'';if(id===projectId)return;
    if(pending()&&projectId){toast('The preview was discarded: another project was selected. Nothing was saved.','info');draft=emptyDraft();applyLocalStage(true);}
    projectId=id;saved=null;savedSpec=null;loadError='';draft=emptyDraft();lastGood=emptyDraft();candidate=null;candidateSpec=null;runtime=null;previewError=null;presetPreview=null;presetErrors.clear();proposing=false;proposed=null;
    clearTimeout(previewTimer);previewTimer=null;previewSeq++;thumbRun++;
    buildInspector();renderAll();
    if(id)void loadSaved();
  }
  // ---- Preview: compute the candidate, show it on this window's stage ---------------------------------------------
  function schedulePreview(ms){clearTimeout(previewTimer);previewTimer=setTimeout(()=>{previewTimer=null;void runPreview();},ms);renderFoot();}
  async function runPreview(){
    clearTimeout(previewTimer);previewTimer=null;
    normalize();
    const seq=++previewSeq,id=projectId,actions=recipeActions();
    if(!actions.length){candidate=null;candidateSpec=null;runtime=null;previewError=null;busy=false;lastGood=copy(draft);if(!pending())presetPreview=null;await showOnStage();renderAll();return;}
    busy=true;renderFoot();
    try{
      const r=await P.api.post(`/api/recipe/preview?id=${enc(id)}`,{actions});
      if(seq!==previewSeq||!alive||id!==projectId)return;
      candidate=r.recipe;candidateSpec=r.tunable;runtime=r.runtime;previewError=null;lastGood=copy(draft);
      await showOnStage();
    }catch(e){
      if(seq!==previewSeq||!alive)return;
      // The change that was refused is rolled back; the message stays next to the control that made it.
      previewError={message:e.message,path:/"([^"]+)"/.exec(e.message||'')?.[1]||null};
      draft=copy(lastGood);
      if(e.code==='capability-required'||e.status===401)previewError.message='This window may not change the identity (no control capability). Reload the page.';
    }finally{if(seq===previewSeq)busy=false;}
    if(seq===previewSeq&&alive)renderAll();
  }
  // What the stage shows during a preview: the candidate in the living world (switched to it in this window when the
  // project's stage is a classic one), a classic stage being tried, and the information mode being tried.
  async function showOnStage(){
    applyLocalStage();
    if(!candidate&&!P.state.preview)return;
    try{await P.preview(candidate);}
    catch(e){toast(e.message,'warning');draft=emptyDraft();lastGood=emptyDraft();candidate=null;candidateSpec=null;applyLocalStage(true);renderAll();}
  }
  function wantedWorld(){return draft.world!==null?draft.world:candidate?'living':null;}
  // The store pushes only configuration that changed, so a local switch made here is undone here, by forcing the
  // effective configuration back once nothing asks for it any more.
  let local={world:false,labels:false};
  function applyLocalStage(restore=false){
    const w=restore?null:wantedWorld(),l=restore||!Object.hasOwn(draft.overrides,'labels')?null:draft.overrides.labels??globalLabels();
    if(w){if(P.state.world!==w)P.setWorld(w);local.world=true;}
    if(l){if(P.state.labels!==l)P.setLabels(l);local.labels=true;}
    if(!w&&local.world||!l&&local.labels){local={world:!!w,labels:!!l};S.applyEffective({force:true});if(w)P.setWorld(w);if(l)P.setLabels(l);}
  }
  async function discard({quiet=false}={}){
    clearTimeout(previewTimer);previewTimer=null;previewSeq++;
    draft=emptyDraft();lastGood=emptyDraft();candidate=null;candidateSpec=null;runtime=null;previewError=null;presetPreview=null;busy=false;
    if(saved)baseRevision=saved.revision;
    try{if(P.state.preview)await P.preview(null);}catch(e){if(!quiet)toast(e.message,'warning');}
    applyLocalStage(true);
    if(alive){renderAll();if(!quiet)toast('Preview cancelled: the saved identity is shown again.','info');}
  }
  async function apply(){
    if(previewTimer)await runPreview();
    if(previewError||busy)return;
    const actions=recipeActions();let world=draft.world;
    const eff=savedWorld();
    if(actions.length&&world===null&&eff!=='living'&&draft.identity.some(a=>a.type==='family'||a.type==='pack')){
      const choice=await askWorld(eff);if(choice===null)return;if(choice)world='living';}
    try{
      if(actions.length)await P.recipeAction(actions,{ifRevision:baseRevision});
    }catch(e){
      if(e.code==='stale'){staleDialog(actions,world);return;}
      toast(`Not saved: ${e.message}`,'error');return;
    }
    await saveWorld(world,!!actions.length);
    finish(actions.length?`Saved: ${familyName(candidate?.family||saved?.family)} is this project's identity.`:null);
  }
  async function saveWorld(world,recipeSaved){
    if(world===null)return true;
    try{S.unpin('world');await S.savePreferences({world});return true;}
    catch(e){toast(`${recipeSaved?'The identity was saved, but the':'The'} stage could not be saved: ${e.message}`,'error');return false;}
  }
  async function finish(message){
    const world=draft.world;
    draft=emptyDraft();lastGood=emptyDraft();candidate=null;candidateSpec=null;runtime=null;previewError=null;presetPreview=null;
    try{if(P.state.preview)await P.preview(null);}catch{}
    applyLocalStage(true);
    const r=P.state.recipe;if(r)adoptSaved(r);else await loadSaved();
    if(saved)baseRevision=saved.revision;
    void loadSpec();renderAll();
    toast(message||(world?`Saved: this project's stage is ${WORLD_NAMES[world]}.`:'Saved.'),'ok');
  }
  async function followGlobalWorld(){
    try{S.unpin('world');await S.savePreferences({world:null});toast(`This project's stage follows the global default again: ${WORLD_NAMES[savedWorld()]}.`,'ok');}
    catch(e){toast(`Not saved: ${e.message}`,'error');}
    if(!alive)return;renderBrowser();renderIdentity();
    // The button is gone once the project follows the default; the keyboard lands on the stage now shown, or the tabs.
    if(!browser.contains(document.activeElement))(cards.querySelector(`[data-card="${savedWorld()}"] .vs-card-main`)||tabs.querySelector('[aria-checked="true"]'))?.focus();
  }
  function askWorld(eff){
    return new Promise(resolve=>{
      modal({title:'Show the living world for this project?',body:h('p',{class:'muted',text:`This project's stage is ${WORLD_NAMES[eff]}. The identity you are applying is drawn by the living world, which is shown here only for the preview.`}),
        onClose:()=>resolve(null),
        actions:[{label:'Cancel',kind:'ghost',onClick:()=>resolve(null)},{label:`Apply, keep ${WORLD_NAMES[eff]}`,onClick:()=>resolve(false)},{label:'Apply and show the living world',kind:'primary',onClick:()=>resolve(true)}]});
    });
  }
  // Another window saved the identity after this preview started: never overwrite it silently.
  function staleDialog(actions,world){
    const now=P.state.recipe;
    modal({title:'The identity changed in another window',label:'Stale identity',
      body:h('div',{class:'vs-stale'},h('p',{class:'muted',text:`This preview was made from revision ${baseRevision}. The saved identity is now revision ${now&&now.revision>baseRevision?now.revision:'newer'}${now?` (${familyName(now.family)})`:''}.`}),
        h('p',{class:'muted',text:'Reload discards this preview and shows the new version. Apply to the new version replays your changes on top of it.'})),
      actions:[{label:'Reload',id:'vsStaleReload',onClick:async()=>{await discard({quiet:true});await P.reloadRecipe();await loadSaved();toast('Reloaded: showing the identity saved in the other window.','info');}},
        {label:'Apply to the new version',kind:'primary',id:'vsStaleApply',onClick:async()=>{
          try{await P.recipeAction(actions);}catch(e){toast(`Not saved: ${e.message}`,'error');return false;}
          await saveWorld(world,true);finish(`Saved on the new version: ${familyName(P.state.recipe?.family)}.`);}}]});
  }
  // ---- Draft edits -------------------------------------------------------------------------------------------------
  function chooseFamily(id){
    if(!saved)return;
    const sameFamily=id===saved.family;
    if(sameFamily&&!hasIdentity(draft)&&saved.source==='user'){
      // Already the chosen family: the only thing left to choose is to show it, when the project's stage is classic.
      if(savedWorld()!=='living'){draft.world='living';presetPreview=null;void runPreview();}
      else if(draft.world!==null){draft.world=null;void runPreview();}
      else toast(`${familyName(id)} is already this project's identity.`,'info');
      return;
    }
    draft.world=null;presetPreview=null;
    if(sameFamily&&hasIdentity(draft)&&saved.source==='user'){draft.identity=[];draft.tune={};draft.reset=false;draft.lock=null;}
    else{draft.identity=[{type:'family',family:id}];draft.tune={};draft.reset=false;draft.lock=null;}
    void runPreview();
  }
  function chooseLook(id){
    if(!saved)return;presetPreview=null;draft.world=null;
    draft.identity=draft.identity.filter(a=>a.type!=='pack');
    // The saved look over the saved family is no change. "None" after an automatic identity is already true (and a
    // pack action would make the family a choice); a look chooses its own base family.
    const auto=draft.identity.some(a=>a.type==='automatic'||a.type==='regenerate'&&!a.keepFamily);
    if(!draft.identity.length){if(id!==(saved.pack?.id||null))draft.identity.push({type:'pack',pack:id});}
    else if(id!==null||!auto)draft.identity.push({type:'pack',pack:id});
    void runPreview();
  }
  function chooseClassic(w){
    if(pendingRecipe())toast('The identity preview was set aside to try a classic stage. Nothing was saved.','info');
    draft=emptyDraft();candidate=null;candidateSpec=null;presetPreview=null;
    if(w!==savedWorld())draft.world=w;
    lastGood=copy(draft);
    void (async()=>{if(P.state.preview)try{await P.preview(null);}catch{}applyLocalStage(!pending());renderAll();})();
  }
  function chooseAutomatic(){presetPreview=null;draft.identity=[{type:'automatic'}];draft.tune={};draft.reset=false;draft.lock=null;draft.world=null;void runPreview();}
  function regenerate(){
    const s=shown();if(!s)return;
    if(draft.identity.length>=8){toast('Apply or cancel before drawing again.','info');return;}
    const keepFamily=s.source==='user';presetPreview=null;
    draft.identity=[...draft.identity,{type:'regenerate',keepFamily}];
    if(!keepFamily)draft.tune={};
    void runPreview();
  }
  function toggleLock(){const s=shown();if(!s)return;draft.lock=!s.locked;void runPreview();}
  function resetCustom(){draft.reset=true;draft.tune={};draft.overrides={...draft.overrides,intensity:1,motion:1};void runPreview();}
  function setOverride(k,v,now){
    draft.overrides[k]=v;
    if(now)void runPreview();else schedulePreview(250);
    if(k==='labels')applyLocalStage();
  }
  function setTune(path,v,now){
    previewError=null;
    draft.tune[path]=v;
    // Resetting a value tuned only in this preview just forgets it; one the saved identity carries is removed (null).
    const inherited=!draft.reset&&Object.hasOwn(saved?.tuning?.values||{},path)&&(!hasIdentity(draft)||candidate?.family===saved.family);
    if(v===null&&!inherited)delete draft.tune[path];
    if(now)void runPreview();else schedulePreview(250);
  }
  // Classic is the absence of a finish: back to what the saved identity shows needs no value for it.
  function chooseFinish(v){
    if(!saved)return;
    if(!hasIdentity(draft)&&!draft.reset&&v===(getPath(saved.genome,'technique.finish')??'classic')){previewError=null;delete draft.tune['technique.finish'];void runPreview();return;}
    setTune('technique.finish',v,true);
  }
  // An identity made before Phase 11 (generator v4) keeps its classic look and the earlier ecology until it is upgraded
  // here: the values it lacks, previewed at once, kept by Apply (a tune; the identity's own values stay as they are).
  function upgradeValues(){
    const s=saved,spec=savedSpec?.tunable;if(!s||!spec||(Number(s.recipeVersion)||1)>=4)return null;const v={};
    if(getPath(s.genome,'technique.finish')===undefined&&spec['technique.finish'])v['technique.finish']='cinematic';
    if(s.genome?.life&&getPath(s.genome,'life.ecology')===undefined&&spec['life.ecology'])v['life.ecology']=2;
    return Object.keys(v).length?v:null;
  }
  function upgrade(values){presetPreview=null;previewError=null;Object.assign(draft.tune,values);void runPreview();}
  function openArtist(){const s=shown();if(s&&FAMILIES.some(f=>f.id===s.family))navigate('artist','from',s.family);}
  async function previewPreset(p){
    if(!saved)return;
    const x=p.payload||{},identity=x.family?[{type:'family',family:x.family}]:[{type:'automatic'}];
    if(x.look)identity.push({type:'pack',pack:x.look});else if(x.family)identity.push({type:'pack',pack:null});
    // The preset's family (or the automatic one) decides which of its tuned values apply here.
    let first;
    try{first=await P.api.post(`/api/recipe/preview?id=${enc(projectId)}`,{actions:identity});presetErrors.delete(p.id);}
    catch(e){const need=/pack/i.test(e.message)&&x.look?x.look:x.family||x.look;presetErrors.set(p.id,need?`Unavailable: needs ${need}`:`Unavailable: ${e.message}`);renderPresets();return;}
    const tuning=x.tuning||{},keys=Object.keys(tuning),usable=keys.filter(k=>first.tunable?.[k]);
    const o={};for(const k of ['intensity','motion','labels'])if(x.overrides?.[k]!==undefined)o[k]=x.overrides[k];
    draft={identity,reset:!!first.recipe?.tuning,tune:Object.fromEntries(usable.map(k=>[k,tuning[k]])),overrides:o,lock:null,world:null};
    presetPreview=p.id;
    if(usable.length<keys.length)toast(`${keys.length-usable.length} of the preset's parameters do not exist in ${familyName(first.recipe.family)} and are left out.`,'info');
    await runPreview();
  }
  // ---- Saved directly: names (not a visual preview) ---------------------------------------------------------------
  async function afterDirectSave(next){
    // This window's own save moves the base of a pending preview with it (only another window's save is a conflict).
    if(pending()&&baseRevision===next.revision-1)baseRevision=next.revision;
    adoptSaved(next);
    if(pendingRecipe())await runPreview();
  }
  async function saveTitle(){
    const v=titleInput.value.trim();
    if(v&&!NAME.test(v)){titleInput.setAttribute('aria-invalid','true');text(titleError,NAME_RULE);titleInput.focus();return;}
    try{const next=await P.recipeAction({type:'title',title:v||null});delete titleInput.dataset.dirty;text(titleError,'');await afterDirectSave(next);toast(v?`Public title saved: “${v}”.`:'Public title removed.','ok');}
    catch(e){text(titleError,e.message);}
  }
  async function saveAlias(id,input,err){
    if(proposing)return;
    const v=input.value.trim();
    if(v&&!NAME.test(v)){input.setAttribute('aria-invalid','true');text(err,NAME_RULE);input.focus();return;}
    try{const next=await P.recipeAction({type:'alias',id,name:v||null});delete input.dataset.dirty;await afterDirectSave(next);
      // The list is rebuilt with the saved name; the keyboard stays where it was.
      const refocus=aliasBox.contains(document.activeElement);renderAliases(true);if(refocus)aliasBox.querySelector(`[data-alias="${id}"]`)?.focus();
      toast(v?`Subsystem named “${v}”.`:'Name cleared: the generated name is used again.','ok');}
    catch(e){text(err,e.message);}
  }
  function proposeNames(groups){
    const byRole=new Map();
    for(const g of groups){const role=roleOf(g);if(!byRole.has(role))byRole.set(role,[]);byRole.get(role).push(g);}
    const next=new Map();
    for(const [role,list] of byRole){
      list.sort((a,b)=>(b.modules||0)-(a.modules||0)||(a.id<b.id?-1:a.id>b.id?1:0));
      const word=ROLE_WORD[role]||'Craft';
      list.forEach((g,i)=>next.set(g.id,i===0?word:`${word} - ${nameOf?nameOf(g.id):g.id.slice(0,6)}`));
    }
    proposed=next;proposing=true;renderAliases(true);
  }
  async function acceptProposed(){
    const actions=[];
    for(const input of aliasBox.querySelectorAll('input[data-alias]')){
      const name=input.value.trim();if(!name)continue;
      if(!NAME.test(name)){input.setAttribute('aria-invalid','true');input.focus();toast(NAME_RULE,'error');return;}
      actions.push({type:'alias',id:input.dataset.alias,name});
    }
    if(!actions.length){proposing=false;proposed=null;renderAliases(true);return;}
    let next=null;
    try{
      for(let i=0;i<actions.length;i+=16)next=await P.recipeAction(actions.slice(i,i+16));
      proposing=false;proposed=null;if(next)await afterDirectSave(next);else renderAliases(true);
      toast('Public names saved.','ok');
    }catch(e){
      if(next)await afterDirectSave(next);
      toast(next?`Some names saved, then: ${e.message}`:`Not saved: ${e.message}`,'error');
    }
  }
  function cancelProposed(){proposing=false;proposed=null;renderAliases(true);}
  // ---- Presets ------------------------------------------------------------------------------------------------------
  function savePresetDialog(){
    if(!saved)return;
    const s=saved,tuned=Object.keys(s.tuning?.values||{}).length;
    const input=h('input',{class:'input',id:'vsPresetName',type:'text',maxlength:40,autocomplete:'off',autofocus:true,'aria-label':'Preset name'});
    const err=h('div',{class:'vs-error small',role:'alert'});
    const payload={family:s.source==='user'?s.family:null,look:s.pack?.id||null,tuning:s.tuning?.values||{},
      overrides:{intensity:s.overrides?.intensity??1,motion:s.overrides?.motion??1,labels:s.overrides?.labels??null}};
    const save=async()=>{const name=input.value.trim();if(!NAME.test(name)){input.setAttribute('aria-invalid','true');text(err,name?NAME_RULE:'Give the preset a name.');input.focus();return false;}
      try{await S.presetAction({action:'create',kind:'visual',name,payload});toast(`Preset “${name}” saved. It can be previewed on any project.`,'ok');S.setUi({visualTab:'presets'});tabs.set('presets');renderBrowser();}
      catch(e){text(err,e.message);return false;}};
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save().then(r=>{if(r!==false)dlg.close();});}});
    const dlg=modal({title:'Save as preset',subtitle:'A preset is reusable on every project. It records the saved identity, not the preview.',
      body:h('div',{class:'vs-dialog'},h('label',{class:'field-label',for:'vsPresetName',text:'Name'}),input,err,
        h('dl',{class:'kv'},h('dt',{text:'Family'}),h('dd',{text:payload.family?familyName(payload.family):'Automatic (chosen by each project\'s code)'}),
          h('dt',{text:'Look'}),h('dd',{text:payload.look?(packOf(payload.look)?.name||payload.look):'None'}),
          h('dt',{text:'Parameters'}),h('dd',{text:tuned?count(tuned,'tuned value'):'None tuned'}),
          h('dt',{text:'Presentation'}),h('dd',{text:`Spectacle ${pct(payload.overrides.intensity)} · Motion ${pct(payload.overrides.motion)} · ${payload.overrides.labels?LABEL_NAMES[payload.overrides.labels]:'Information: global default'}`}))),
      actions:[{label:'Cancel',kind:'ghost'},{label:'Save preset',kind:'primary',onClick:save}]});
  }
  function renamePreset(p){
    const input=h('input',{class:'input',type:'text',maxlength:40,value:p.name,autofocus:true,'aria-label':'Preset name'});
    const err=h('div',{class:'vs-error small',role:'alert'});
    const save=async()=>{const name=input.value.trim();if(!NAME.test(name)){input.setAttribute('aria-invalid','true');text(err,NAME_RULE);return false;}
      try{await S.presetAction({action:'rename',id:p.id,name});toast(`Renamed to “${name}”.`,'ok');}catch(e){text(err,e.message);return false;}};
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save().then(r=>{if(r!==false)dlg.close();});}});
    const dlg=modal({title:'Rename preset',body:h('div',{class:'vs-dialog'},input,err),actions:[{label:'Cancel',kind:'ghost'},{label:'Rename',kind:'primary',onClick:save}]});
  }
  async function deletePreset(p){
    if(!await confirmDialog({title:`Delete “${p.name}”?`,body:'The preset is removed for every project. Identities already applied from it stay as they are.',confirm:'Delete preset',kind:'danger'}))return;
    try{await S.presetAction({action:'delete',id:p.id});if(presetPreview===p.id)presetPreview=null;toast(`Preset “${p.name}” deleted.`,'ok');}catch(e){toast(`Not deleted: ${e.message}`,'error');}
  }
  // ---- Rendering ----------------------------------------------------------------------------------------------------
  function renderHead(){
    const s=shown(),prev=!!candidate||draft.world!==null;
    statePill.className=`pill ${prev?'accent':'plain'}`;text(statePill,prev?'Preview · not saved':'Saved identity');
    if(!s){text(inspTitle,S.state.selected?'—':'No project');text(inspSub,'');return;}
    text(inspTitle,s.familyName||familyName(s.family));
    const look=s.pack?(packOf(s.pack.id)?.name||s.pack.id):null;
    // One line: the short form shows (the pill above already says preview or saved), the full form is its tooltip.
    const kind=s.familyKind==='pack'?'Pack world':'Built-in',src=s.source==='user'?'chosen by you':'from the code',variant=`variant ${(s.variant||0)+1}`;
    text(inspSub,[kind,src,variant,look?`look ${look}`:null,saved?`rev. ${saved.revision}`:null].filter(Boolean).join(' · '));
    inspSub.title=[s.familyKind==='pack'?'Pack world':'Built-in family',s.source==='user'?'chosen by you':'generated from the code',variant,look?`look ${look}`:null,
      saved?(candidate?`preview of revision ${saved.revision}`:`revision ${saved.revision}`):null].filter(Boolean).join(' · ');
    renderIdentity();renderBadge();renderFoot();
  }
  function renderIdentity(){
    const s=shown();if(!s)return;clear(identityBox);
    const state=s.locked?['Locked','ok','Kept as it is: never re-derived from the code']:s.founded?['Permanent','plain','Founded: the project is large enough that this identity is never re-derived']:['Provisional','warn','Re-derived from the code until the project has 6 modules'];
    const why=FAMILIES.find(f=>f.id===s.family)?.why||packOf(s.family)?.description||'';
    text(whyBox,why);whyBox.title=why;whyBox.hidden=!why;
    const tuned=s.tuning?.values?Object.keys(s.tuning.values).length:0;
    // The family, its source and the revision are in the inspector's heading; this says what can still change it: the
    // state and the customisations on one line, why under it (on a short screen, the pill's tooltip only).
    const lockNote=s.locked?null:'Customising a parameter locks the identity: it is never re-derived from the code afterwards. Reset customisations returns every value to the generated one.';
    identityBox.append(h('div',{class:'vs-status'},pill(state[0],state[1],{title:state[2]}),
        h('span',{class:'vs-custom small',title:[tuned?null:'Every value is as generated.',lockNote].filter(Boolean).join(' ')||null,text:tuned?`${count(tuned,'parameter')} customised${candidate?' (in the preview)':''}`:'Not customised'})),
      h('p',{class:'vs-state-why small faint',text:state[2]}));
    actLock.replaceChildren(icon(s.locked?'unlock':'lock'),h('span',{text:s.locked?'Unlock':'Lock'}));
    actLock.title=s.locked?'Allow the code to re-derive the identity while the project is small':'Keep this identity as it is';
    actRegen.title=s.source==='user'?`A new seeded draw of ${familyName(s.family)} from the same traits`:'A new seeded draw: the family may change';
    actReset.disabled=!(s.tuning&&Object.keys(s.tuning.values||{}).length)&&(s.overrides?.intensity??1)===1&&(s.overrides?.motion??1)===1;
    actAuto.disabled=s.source!=='user'&&!hasIdentity(draft);
    actAuto.title=actAuto.disabled?'The identity is already generated from the code':'Let the code choose the family again (the generated identity)';
    clear(identityNote);
    if(saved?.unavailable){const miss=saved.unavailable.family||saved.unavailable.pack;
      identityNote.append(callout({kind:'warn',icon:'warn',title:`${packOf(miss)?.name||miss} is not installed or not usable`,body:'The stage shows the identity without it. The saved identity still names it, so reinstalling restores it.',actions:[button({label:'Visual Packs',size:'sm',onClick:()=>navigate('packs')})]}));}
    if(runtime&&candidate&&(!runtime.approved||!runtime.available)){const p=packOf(runtime.pack);
      identityNote.append(callout({kind:'warn',icon:'shield',title:runtime.available?`${p?.name||runtime.pack} contains code and is not approved`:`${p?.name||runtime.pack} is not available`,
        body:'An unapproved pack never runs, not even in a preview: the stage keeps showing the saved identity. Applying saves the choice; it runs once approved.',actions:[button({label:'Review in Visual Packs',size:'sm',onClick:()=>navigate('packs')})]}));}
    if(savedWorld()!=='living')identityNote.append(h('p',{class:'small faint',text:`This project's stage is ${WORLD_NAMES[savedWorld()]}${S.effective().sources?.world==='global'?' (the global default)':''}. The World DNA is what the living world draws.`}));
    // Said only while it is news: a locked identity already reads "never re-derived" in its state row.
    if(lockNote)identityNote.append(h('p',{class:'small faint vs-lock-note',text:lockNote}));
  }
  function renderBadge(){
    clear(badge);clear(stageNote);
    const prev=!!candidate||draft.world!==null;
    badge.append(h('span',{class:`pill ${prev?'accent':'plain'} vs-badge-pill`,id:'vsBadge',text:prev?'Preview · not saved':'Saved identity'}));
    if(draft.world!==null)badge.append(h('span',{class:'pill plain',text:WORLD_NAMES[draft.world]}));
    else if(candidate&&savedWorld()!=='living')badge.append(h('span',{class:'pill plain',title:`This project's stage is ${WORLD_NAMES[savedWorld()]}`,text:'Living world shown for the preview'}));
    const msg=P.state.preview?.notice||P.state.worldStatus?.notice;
    if(msg)stageNote.append(h('div',{class:'callout'},icon('info'),h('div',{class:'callout-body',text:msg})));
  }
  function renderFoot(){
    const p=pending();S.setDraft(p?'Visual Studio preview':null);
    cancelBtn.hidden=!p;applyBtn.hidden=!p;
    applyBtn.disabled=!!previewError||busy||!!previewTimer;
    foot.classList.toggle('pending',p);
    clear(footStatus);
    if(previewError)footStatus.append(h('span',{class:'danger',id:'vsPreviewError',text:`Not previewed: ${previewError.message}`}));
    else if(!p)footStatus.append(h('span',{class:'faint',text:saved?`Saved identity · revision ${saved.revision}`:''}));
    else{
      const n=recipeActions().length;
      const stale=saved&&baseRevision!==null&&saved.revision!==baseRevision;
      footStatus.append(h('strong',{class:'accent',text:busy||previewTimer?'Previewing…':draft.world!==null&&!n?`Stage: ${WORLD_NAMES[draft.world]}`:count(n,'change')}),
        stale?h('span',{class:'warn',text:` · changed elsewhere`}):'');
      footStatus.title=stale?`The saved identity changed in another window since this preview started (revision ${baseRevision} → ${saved.revision}). Apply asks what to do.`:'Previewed in this window only, not saved';
    }
  }
  // Updated in place (a rebuilt select would lose the keyboard focus after each choice).
  function renderLook(){
    const s=shown();if(!s)return;
    const looks=Object.entries(S.state.catalog?.looks||{}).filter(([,l])=>l.base===s.family);
    for(const p of P.state.packs)if(p.base===s.family&&p.kind!=='world'&&!looks.some(([id])=>id===p.id))looks.push([p.id,{base:p.base,kind:p.kind}]);
    const cur=s.pack?.id||'';
    if(cur&&!looks.some(([id])=>id===cur))looks.push([cur,{base:s.family,kind:s.pack.kind}]);
    lookField.hidden=!looks.length;lookBox.lastChild.hidden=!!looks.length;
    if(!looks.length){text(lookNone,`No look pack for ${familyName(s.family)} is installed.`);return;}
    lookSelect.setOptions([{value:'',label:'None (the family as generated)'},...looks.map(([id,l])=>{const p=packOf(id);
      return {value:id,label:`${p?.name||id} · ${l.kind==='shader'?'shader, code':'declarative'}${p&&p.executable&&!p.trusted?' · not approved':''}${!p||!p.ok?' · unavailable':''}`};})]);
    lookSelect.value=cur;
  }
  function renderOverrides(){
    const s=shown();if(!s)return;const o={intensity:1,motion:1,...s.overrides,...draft.overrides},ownLabels=o.labels??null,shownLabels=ownLabels??globalLabels();
    if(!fIntensity.contains(document.activeElement))intensity.set(Math.round(o.intensity*100));
    if(!fMotion.contains(document.activeElement))motion.set(Math.round(o.motion*100));
    labels.set(shownLabels);
    fIntensity.setModified(o.intensity!==1);fMotion.setModified(o.motion!==1);
    fIntensity.classList.toggle('pending',Object.hasOwn(draft.overrides,'intensity'));fMotion.classList.toggle('pending',Object.hasOwn(draft.overrides,'motion'));fLabels.classList.toggle('pending',Object.hasOwn(draft.overrides,'labels'));
    text(fLabels.querySelector('.field-doc')||fLabels.appendChild(h('div',{class:'field-doc'})),`${LABEL_DOCS[shownLabels]}${ownLabels?'':' Follows the global default (Settings).'}`);
  }
  function renderFinish(){
    const s=shown(),spec=shownSpec(),builtin=!!s&&FAMILIES.some(f=>f.id===s.family);
    artistBtn.disabled=!builtin;
    artistBtn.title=builtin?`Compose your own layers and reactive mappings over ${familyName(s.family)} in the Artist Studio`:'The Artist Studio composes over the built-in worlds';
    text(composeLine,builtin||!s?COMPOSE_LINE:'The Artist Studio composes over the built-in worlds, not over a world pack.');
    finishSection.hidden=!s||!spec?.['technique.finish'];
    if(finishSection.hidden)return;
    const t=s.genome?.technique||{},finish=FINISH_LOOKS.some(f=>f.value===t.finish)?t.finish:'classic',tuned=s.tuning?.family===s.family?s.tuning.values:{};
    finishSeg.set(finish);text(finishLine,FINISH_LOOKS.find(f=>f.value===finish).line);
    finishSection.classList.toggle('pending',Object.hasOwn(draft.tune,'technique.finish'));
    text(finishErr,['technique.finish','technique.aberration'].includes(previewError?.path)?previewError.message:'');
    // The strength reads in percent of the designed fringe; a world that draws less shows what it draws.
    const own=WORLD_ABERRATION[s.family]??ABERRATION_UNIT,ab=Number.isFinite(t.aberration)?t.aberration:own;
    if(!fAberration.contains(document.activeElement))aberration.set(Math.round(ab/ABERRATION_UNIT*100));
    fAberration.setModified(Object.hasOwn(tuned,'technique.aberration'));fAberration.classList.toggle('pending',Object.hasOwn(draft.tune,'technique.aberration'));
    const ownNote=own!==ABERRATION_UNIT?` ${familyName(s.family)} draws ${Math.round(own/ABERRATION_UNIT*100)} % unless you set it.`:'';
    text(fAberration.querySelector('.field-doc'),finish==='classic'?`A colour offset toward the frame's edges. 0 turns it off.${ownNote}`
      :`An optical fringe: none at the centre, growing toward the corners and strongest on bright light. 100 % is the finish as designed, 0 turns it off. Labels and controls are never affected.${ownNote}`);
    renderUpgrade();
  }
  function renderUpgrade(){
    clear(upgradeBox);const v=upgradeValues();if(!v)return;
    const keys=Object.keys(v),what=keys.length>1?'finish and ecology':keys[0]==='technique.finish'?'finish':'ecology';
    const lacks=[v['technique.finish']?'the classic look':null,v['life.ecology']?'the earlier ecology':null].filter(Boolean).join(' and ');
    if(keys.every(k=>same(draft.tune[k],v[k])))upgradeBox.append(callout({kind:'accent',icon:'eye',title:`Previewing the Phase 11 ${what}`,
      body:`${keys.length>1?'The Cinematic finish and the musical ecology, on':'On'} this window's stage only. Apply keeps ${keys.length>1?'them':'it'} for the project; Cancel returns to ${lacks}.`}));
    else upgradeBox.append(callout({icon:'spark',title:'Made before Phase 11',
      body:`This identity keeps ${lacks} until you choose otherwise.${v['technique.finish']?' New identities get the Cinematic finish':''}${v['life.ecology']?`${v['technique.finish']?' and':' New identities get'} the musical ecology, where the music shapes how the inhabitants gather, roam and glow`:''}.`,
      actions:[button({label:`Use the Phase 11 ${what}`,icon:'spark',size:'sm',id:'vsUpgrade',onClick:()=>upgrade(v)})]}));
  }
  // Parameters are generated from the tunable metadata; rebuilt only when the set of parameters changes.
  let paramSig='',paramFields=new Map();const openGroups=new Set();
  function renderParams(){
    const s=shown(),spec=shownSpec();
    if(!s||!spec){if(saved)text(paramsSummary,'Loading parameters…');return;}
    const sig=`${s.family}|${s.pack?.id||''}|${Object.keys(spec).join(',')}`;
    if(sig!==paramSig){paramSig=sig;paramFields=new Map();purposeParts=new Map();clear(essBox);clear(paramsBox);
      const essential=ESSENTIALS[s.family]?[...ESSENTIALS[s.family],...ESSENTIALS.common].filter(p=>spec[p]):[];
      // Purpose → genome group → parameters, each in catalogue order.
      const purposes=new Map();
      for(const [path,sp] of Object.entries(spec)){if(essential.includes(path)||OWN_SECTION.has(path))continue;const g=groupOf(path,sp),pid=purposeOf(g);
        if(!purposes.has(pid))purposes.set(pid,new Map());const groups=purposes.get(pid);if(!groups.has(g))groups.set(g,[]);groups.get(g).push([path,sp]);}
      const order=[...PURPOSES.map(x=>x.id),'other'].filter(id=>purposes.has(id));
      if(!openGroups.size)(essential.length?['essentials']:order.slice(0,1)).forEach(g=>openGroups.add(g));
      essSection.hidden=!essential.length;
      if(essential.length){
        const d=disclosure({summary:'Essentials',open:openGroups.has('essentials'),onToggle:o=>o?openGroups.add('essentials'):openGroups.delete('essentials')},
          h('p',{class:'faint small vs-essentials-note',text:'The controls that change this world the most.'}),...essential.map(p=>paramField(p,spec[p],s)));
        purposeSummary(d,'Essentials','essentials',essential);essBox.append(d);
      }
      for(const pid of order){
        const groups=purposes.get(pid),paths=[...groups.values()].flat().map(([p])=>p),purpose=PURPOSES.find(x=>x.id===pid),name=purpose?.name||'Other';
        // Inside a purpose, its genome groups are sub-headings (only when there is more than one).
        const children=[purpose?.note?h('p',{class:'faint small vs-purpose-note',text:purpose.note}):null,...[...groups].sort(([a],[b])=>GROUPS.findIndex(([x])=>x===a)-GROUPS.findIndex(([x])=>x===b)).flatMap(([g,list])=>[
          groups.size>1?h('h4',{class:'vs-group-head',text:GROUPS.find(([x])=>x===g)?.[1]||humanize(g)}):null,...list.map(([path,sp])=>paramField(path,sp,s))])];
        const d=disclosure({summary:name,open:openGroups.has(pid),onToggle:o=>o?openGroups.add(pid):openGroups.delete(pid)},...children);
        d.dataset.purpose=pid;purposeSummary(d,name,pid,paths);paramsBox.append(d);
      }
    }
    const tuned=s.tuning?.family===s.family?s.tuning:null;
    // Each folded group says how many of its parameters are customised, so a change is never hidden by a fold.
    for(const [d,{paths,countEl,modEl}] of purposeParts){
      const n=tuned?paths.filter(p=>Object.hasOwn(tuned.values,p)).length:0,pend=paths.filter(p=>Object.hasOwn(draft.tune,p)).length;
      text(countEl,String(paths.length));text(modEl,n?`${n} customised`:'');modEl.hidden=!n;d.classList.toggle('pending',pend>0);
    }
    for(const [path,f] of paramFields){
      const v=valueOf(s,path,f.spec);
      if(!f.el.contains(document.activeElement))setControl(f.ctrl,f.spec,v);
      const mod=!!tuned&&Object.hasOwn(tuned.values,path);
      f.el.setModified(mod);f.el.classList.toggle('pending',Object.hasOwn(draft.tune,path));
      // A value the genome does not carry is rendered from a known default (a technique multiplier's identity, a later
      // generator's fallback): the control shows it, so no read-out contradicts it. "not set" only for a true absence.
      const fb=fallbackOf(s,path),base=mod?tuned.base[path]??fb:undefined;
      f.el.setValue(mod?`generated ${base===undefined?'not set':formatParam(f.spec,base)}`:getPath(s.genome,path)===undefined&&fb===undefined?'not set':'');
      text(f.err,previewError?.path===path?previewError.message:'');
      if(f.scale)for(const st of f.scale.children)st.classList.toggle('on',Math.abs(Number(v)-Number(st.dataset.v))<=.5);
    }
    const n=tuned?Object.keys(tuned.values).length:0;
    text(paramsSummary,`${count(Object.keys(spec).length,'parameter')} · ${n?`${n} customised`:'all as generated'}${candidate?' (in the preview)':''}`);
  }
  // A group's summary: its name, how many parameters it holds, and how many of them are customised.
  let purposeParts=new Map();
  function purposeSummary(d,name,id,paths){
    const countEl=h('span',{class:'vs-sum-count num'}),modEl=h('span',{class:'vs-sum-mod'});
    d.querySelector('summary').replaceChildren(h('span',{class:'vs-sum-name',text:name}),countEl,modEl);
    d.dataset.group=id;purposeParts.set(d,{paths,countEl,modEl});
  }
  function fallbackOf(s,path){if(Object.hasOwn(TECHNIQUE_IDENTITY,path))return TECHNIQUE_IDENTITY[path];
    if(Object.hasOwn(ADDED_DEFAULTS[s.family]||{},path))return ADDED_DEFAULTS[s.family][path];return undefined;}
  function valueOf(s,path,spec){const v=getPath(s.genome,path);if(v!==undefined)return v;const fb=fallbackOf(s,path);if(fb!==undefined)return fb;
    return spec.type==='boolean'?false:spec.type==='enum'?spec.values?.[0]:spec.type==='color'?'#000000':spec.type==='vec3'?[spec.min,spec.min,spec.min]:spec.min;}
  // A catalogue description often starts with the parameter's own name used as a heading ("spire, openwork great
  // spire…", "architecture: gothic…", "bioluminescence (inner light…)"): the label already says it, so the description
  // keeps only what follows. The name is dropped only when a separator follows it, so a word that merely begins with it
  // ("breathing period" under Breath) or a phrase it begins ("bloom strength", "sway in the current") is kept whole.
  // A description that only repeats the label says nothing. Every description starts with a capital.
  const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);
  function docOf(label,doc,path){
    if(!doc||doc===path)return null;
    const name=label.toLowerCase(),d=doc.trim();
    if(d.toLowerCase()===name)return null;
    const m=d.toLowerCase().startsWith(name)?/^\s*(?:[:,;–—]|-\s|\()/.exec(d.slice(name.length)):null;
    if(!m)return cap(d);
    let rest=d.slice(name.length).trim().replace(/^[:,;–—-]\s*/,'');
    if(/^\([^()]*\)$/.test(rest))rest=rest.slice(1,-1);
    rest=rest.trim();
    // A lone word left over is a unit or a qualifier ("orbit tilt (radians)"): it reads only with the name.
    return !rest?null:/\s/.test(rest)?cap(rest):cap(d);
  }
  function paramField(path,spec,s){
    const label=LABEL_OF[path]||humanize(path.split('.').at(-1));
    const ctrl=parameterControl(spec,valueOf(s,path,spec),{label,onInput:v=>setTune(path,v,false),onChange:v=>setTune(path,v,true)});
    // The toolkit builds on/off switches without a visible label (the field shows it), so the input gets its name here.
    if(ctrl.input&&!ctrl.input.hasAttribute('aria-label'))ctrl.input.setAttribute('aria-label',label);
    for(const b of ctrl.querySelectorAll?.('button[data-value]')||[]){const name=VALUE_LABELS[path]?.[b.dataset.value];if(name)text(b,name);}
    const err=h('div',{class:'vs-error small',role:'alert'});
    // The music influence spells out its scale under the slider, the band it is in lit.
    const scale=path==='life.music'?h('div',{class:'vs-scale'},...INFLUENCE.map(([v,name,line])=>h('span',{class:'vs-scale-stop',dataset:{v:String(v)},title:line},
      h('strong',{text:`${v} · ${name}`}),h('span',{text:line})))):null;
    const el=field({label,doc:DOC_OF[path]||docOf(label,spec.doc,path),control:h('div',{class:'vs-param-control'},ctrl,scale,err),value:'',onReset:()=>setTune(path,null,true)});
    // A slider, a row of choices or three channels takes the inspector's full width under its label (a track long
    // enough for precise control); a switch, a colour or a select sits beside it.
    if(ctrl.range||ctrl.classList.contains('segmented')||ctrl.classList.contains('vec3'))el.classList.add('stack');
    el.dataset.path=path;paramFields.set(path,{el,ctrl,spec,err,scale});return el;
  }
  function setControl(ctrl,spec,v){if(typeof ctrl.set==='function')ctrl.set(v);else if(ctrl.tagName==='SELECT')ctrl.value=String(v);}
  function renderTitle(){
    if(!saved)return;
    if(document.activeElement!==titleInput&&!titleInput.dataset.dirty){titleInput.value=saved.title||'';titleInput.setAttribute('aria-invalid','false');}
    titleInput.placeholder='No public title';
    text(titleShown,`The Stage, the OBS view and recordings show “${publicName(saved)}”. The project's folder name is never shown there.`);
  }
  // Subsystems: the project's group nodes (salted ids), named by the generator unless the user named them.
  let aliasSig='';
  function renderAliases(force=false){
    if(!saved)return;
    const model=P.state.model,groups=model&&model.projectId===projectId?(model.graph?.nodes||[]).filter(n=>n.type==='group'&&/^[a-f0-9]{14}$/.test(n.id)).sort((a,b)=>(a.order??0)-(b.order??0)):null;
    const sig=groups?`${groups.map(g=>`${g.id}:${g.modules}`).join(',')}|${JSON.stringify(saved.aliases||{})}|${!!nameOf}|${proposing}`:'none';
    if(sig===aliasSig&&!force)return;
    if(aliasBox.contains(document.activeElement)&&!force)return;
    aliasSig=sig;clear(aliasBox);
    if(!groups){aliasBox.append(h('p',{class:'small faint',text:'Loading the project structure…'}));return;}
    if(!groups.length){aliasBox.append(h('p',{class:'small faint',text:'No subsystems yet: they appear as the project grows.'}));return;}
    aliasBox.append(h('p',{class:'small faint',text:'Each subsystem has a generated name that reveals nothing about the code. A name you give replaces it in the labels.'}));
    aliasBox.append(h('div',{class:'vs-alias-propose'},
      proposing
        ?[button({label:'Accept',kind:'primary',size:'sm',onClick:()=>acceptProposed(),attrs:{id:'vsAliasAccept'}}),
          button({label:'Cancel',kind:'ghost',size:'sm',onClick:()=>cancelProposed(),attrs:{id:'vsAliasCancel'}})]
        :button({label:'Propose public names',kind:'ghost',size:'sm',disabled:!nameOf,title:'Fills the names from each subsystem’s role. Nothing is saved until Accept.',
          onClick:()=>proposeNames(groups),attrs:{id:'vsAliasPropose'}})));
    for(const g of groups){
      const gen=nameOf?nameOf(g.id):'…',alias=saved.aliases?.[g.id]||'',shown=proposed?.get(g.id)??(proposing?'':alias);
      const input=h('input',{class:'input',type:'text',maxlength:40,value:shown,placeholder:gen,autocomplete:'off',spellcheck:'false','aria-label':`Name for ${gen}`,dataset:{alias:g.id}});
      const err=h('div',{class:'vs-error small',role:'alert'});
      if(proposed?.has(g.id))input.dataset.dirty='1';
      input.addEventListener('input',()=>{input.dataset.dirty='1';const v=input.value.trim();input.setAttribute('aria-invalid',String(!!v&&!NAME.test(v)));text(err,v&&!NAME.test(v)?NAME_RULE:'');});
      input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(proposing)void acceptProposed();else void saveAlias(g.id,input,err);}else if(e.key==='Escape'){e.preventDefault();if(proposing)cancelProposed();else if(input.dataset.dirty){input.value=alias;delete input.dataset.dirty;text(err,'');}}});
      aliasBox.append(h('div',{class:'vs-alias'},
        h('div',{class:'vs-alias-head'},h('strong',{text:shown||alias||gen}),alias?h('span',{class:'tiny faint',text:`generated: ${gen}`}):null,h('span',{class:'grow'}),
          h('span',{class:'tiny faint num',text:`${count(g.modules||0,'module')}${g.test?' · tests':''}`})),
        h('div',{class:'field-row vs-input-row'},input,proposing?null:button({icon:'check',size:'sm',attrs:{'aria-label':`Save the name of ${gen}`},title:'Save the name',onClick:()=>saveAlias(g.id,input,err)}),
          proposing?null:button({icon:'close',size:'sm',kind:'ghost',disabled:!alias,attrs:{'aria-label':`Clear the name of ${gen}`},title:'Use the generated name again',onClick:()=>{input.value='';return saveAlias(g.id,input,err);}})),err));
    }
  }
  function renderQuality(){quality.set(P.state.quality);}
  // ---- World browser --------------------------------------------------------------------------------------------------
  function renderBrowser(){
    // The cards are rebuilt with their state; the control that had the keyboard focus gets it back.
    const active=document.activeElement,label=cards.contains(active)||browserActions.contains(active)?active.getAttribute('aria-label')||active.textContent:null;
    const tab=S.state.ui.visualTab||'living';tabs.set(tab);clear(cards);clear(browserActions);clear(browserNote);
    cards.setAttribute('aria-label',tab==='living'?'Living worlds':tab==='classic'?'Classic stages':'Presets');
    if(!S.state.selected)cards.append(h('p',{class:'faint small vs-cards-empty',text:'Select a project to choose its world.'}));
    else if(tab==='living')renderLiving();else if(tab==='classic')renderClassic();else renderPresets();
    if(label)[...browser.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent)===label)?.focus({preventScroll:true});
    layoutCards();
  }
  // A card: the picture, its name and line over it (state chips at the top); the whole card is one button. Why to choose
  // the world shows when the strip is tall enough and it fits whole (fitWhy), on the cards other than the one shown (the
  // inspector tells that one); it is always the card's tooltip.
  function card({id,title,line,why=null,media,pills=[],onChoose,active=false,shown=false,disabled=false,choose='Preview',match=false}){
    const b=h('button',{type:'button',class:'vs-card-main',disabled,'aria-pressed':String(active),'aria-label':`${choose} ${title}`,title:why?`${title}: ${why}`:null,onClick:onChoose},
      h('span',{class:'vs-thumb'},media,pills.length?h('span',{class:'vs-chips'},...pills):null,
        match?h('span',{class:'vs-match',title:'The code\'s match: the family this project\'s code scores highest for (the automatic choice)'},icon('star'),h('span',{class:'visually-hidden',text:'The code\'s match'})):null),
      h('span',{class:'vs-card-text'},h('strong',{text:title}),h('span',{class:'vs-card-line',text:line}),why?h('span',{class:'vs-card-why',text:why}):null));
    return h('div',{class:['vs-card',active?'active':'',shown?'shown':''],role:'listitem',dataset:{card:id}},b);
  }
  // A tile (no picture): the icon and its caption together in the part of the card above the name.
  const tile=(ic,caption,kind='')=>h('span',{class:'vs-thumb-media'},h('span',{class:['vs-thumb-tile',kind]},icon(ic),h('span',{class:'vs-thumb-cap',text:caption})));
  // While a newer revision renders, the previous picture of this project stays (it is real, and says it is updating).
  function thumbMedia(fid){
    const url=THUMBS.get(`${projectId}:${saved?.revision}:${fid}`),older=THUMBS.get(`${projectId}:latest:${fid}`);
    // The strip's note says the pictures are rendered from this project; a card says so itself only while it updates.
    if(url||url!==''&&older)return h('span',{class:'vs-thumb-media',dataset:{thumb:fid}},h('img',{src:url||older,alt:`${familyName(fid)}, rendered from this project`}),
      url?null:h('span',{class:'vs-thumb-cap',text:'Updating…',title:'A newer revision is rendering: this is the previous picture of this project'}));
    const el=tile('visual',url===''?'No thumbnail on this device':'Rendering from this project…');el.dataset.thumb=fid;return el;
  }
  function renderLiving(){
    const s=saved;if(!s){cards.append(h('p',{class:'faint small vs-cards-empty',text:'Loading the identity…'}));return;}
    const previewFam=hasIdentity(draft)?candidate?.family:null,eff=savedWorld();
    const top=s.familyScores?Object.entries(s.familyScores).sort((a,b)=>b[1]-a[1])[0]?.[0]:null;
    if(eff==='living')note('Rendered from this project; Apply saves the choice.','Rendered from this project.');
    else note(`This project's stage is ${WORLD_NAMES[eff]}: choosing a world shows the living world for the preview.`,`This project's stage is ${WORLD_NAMES[eff]}.`);
    browserActions.append(button({label:'Visual Packs',icon:'packs',size:'sm',kind:'ghost',onClick:()=>navigate('packs')}));
    for(const f of FAMILIES){
      const isSaved=s.family===f.id,prev=previewFam===f.id;
      cards.append(card({id:f.id,title:familyName(f.id),line:f.line,why:f.why,media:thumbMedia(f.id),active:prev||(!previewFam&&isSaved&&draft.world==='living'),shown:prev||(!previewFam&&isSaved),
        onChoose:()=>chooseFamily(f.id),choose:'Preview',
        match:top===f.id,pills:[isSaved?pill('Saved','ok',{title:s.source==='user'?'This project\'s identity, chosen by you':'This project\'s identity, generated from the code'}):null,prev?pill('Previewing','accent'):null].filter(Boolean)}));
    }
    for(const p of P.state.packs.filter(x=>x.kind==='world')){
      const usable=p.ok&&p.compatible,approved=!p.executable||p.trusted,isSaved=s.family===p.id,prev=previewFam===p.id;
      const meta=`Pack · ${p.author?.name||'unknown author'} · v${p.version}${p.executable?' · code':''}`;
      cards.append(card({id:p.id,title:p.family?.name||p.name,line:meta,disabled:!usable,active:prev,onChoose:()=>chooseFamily(p.id),
        media:tile('packs',usable?(approved?'Preview on the stage':'Not run until approved'):'Unavailable','pack'),
        pills:[isSaved?pill('Saved','ok'):null,prev?pill('Previewing','accent'):null,!usable?pill('Problem','danger',{title:(p.problems||[]).join('; ')}):approved?pill(p.executable?'Approved':'Data only','plain',{plain:true}):pill('Needs approval','warn',{title:'An unapproved pack can be chosen; the stage shows the saved identity until it is approved'})].filter(Boolean)}));
    }
    if(!P.state.packs.some(x=>x.kind==='world'))cards.append(h('div',{class:'vs-card ghost',role:'listitem'},h('span',{class:'vs-thumb'},tile('packs','No world pack installed')),
      h('span',{class:'vs-card-text'},h('strong',{text:'World packs'}),h('span',{class:'vs-card-line',text:'Installed world packs appear here as families you can choose.'}))));
  }
  function renderClassic(){
    const eff=savedWorld(),src=S.effective().sources?.world;
    note('Fixed stages, no World DNA: the first WebGL world and a lightweight 2D one.','Fixed stages; no World DNA.');
    // A project's own stage choice is the only way out of the global default; this is the way back in.
    if(src==='project'){const g=S.state.settings?.stage?.world||'living';
      browserActions.append(button({label:`Use the global default (${WORLD_NAMES[g]})`,size:'sm',kind:'ghost',id:'vsWorldGlobal',disabled:pending(),
        title:pending()?'Apply or cancel the preview first':'Forget this project\'s own stage: it follows Settings › Default world again',onClick:()=>followGlobalWorld()}));}
    for(const c of CLASSIC){
      const isSaved=eff===c.id,prev=draft.world===c.id;
      cards.append(card({id:c.id,title:WORLD_NAMES[c.id],line:c.line,active:prev,onChoose:()=>chooseClassic(c.id),
        media:tile(c.icon,'Preview on the stage','classic'),
        pills:[isSaved?pill(src==='url'?'Shown (URL pin)':src==='global'?'Saved · global default':'Saved for this project','ok'):null,prev?pill('Previewing','accent'):null].filter(Boolean)}));
    }
  }
  function renderPresets(){
    if((S.state.ui.visualTab||'living')!=='presets')return;
    clear(cards);clear(browserActions);
    const list=(S.state.presets?.presets||[]).filter(p=>p.kind==='visual');
    note('For every project; a preview changes nothing until Apply.','For every project.');
    const saveBtn=button({label:'Save as preset',icon:'save',size:'sm',id:'vsSavePreset',disabled:!saved||pending(),title:pending()?'Apply or cancel the preview first: a preset records the saved identity':'Save this project\'s saved identity as a reusable preset',onClick:()=>savePresetDialog()});
    browserActions.append(saveBtn);
    const presetCard=(p,curated)=>{
      const x=p.payload||{},n=Object.keys(x.tuning||{}).length,err=presetErrors.get(p.id),prev=presetPreview===p.id;
      const summary=[x.family?familyName(x.family):'Automatic family',x.look?(packOf(x.look)?.name||x.look):null,n?count(n,'parameter'):null,x.overrides?.intensity!==undefined&&x.overrides.intensity!==1?`Spectacle ${pct(x.overrides.intensity)}`:null].filter(Boolean).join(' · ');
      cards.append(h('div',{class:['vs-card','preset',curated?'curated':'',prev?'active':''],role:'listitem',dataset:{preset:p.id}},
        h('div',{class:'vs-preset-body'},h('span',{class:'vs-preset-icon'},icon(curated?'spark':'star')),h('span',{class:'vs-card-text'},h('strong',{text:p.name}),h('span',{class:'vs-card-line',text:summary,title:summary}),curated&&p.line?h('span',{class:'vs-card-why',text:p.line}):null)),
        err?h('div',{class:'vs-error small',text:err}):null,
        h('div',{class:'vs-card-foot'},prev?pill('Previewing','accent'):curated?pill('Curated','plain',{plain:true,title:'Built in and read-only: preview it, then apply or save your own'}):null,h('span',{class:'grow'}),
          button({label:'Preview',size:'sm',kind:'outline',icon:'eye',attrs:{'aria-label':`Preview the preset ${p.name}`},onClick:()=>previewPreset(p)}),
          curated?null:button({icon:'doc',size:'sm',kind:'ghost',title:'Rename',attrs:{'aria-label':`Rename the preset ${p.name}`},onClick:()=>renamePreset(p)}),
          curated?null:button({icon:'trash',size:'sm',kind:'ghost',title:'Delete',attrs:{'aria-label':`Delete the preset ${p.name}`},onClick:()=>deletePreset(p)}))));
    };
    for(const p of CURATED)presetCard(p,true);
    if(!S.state.presets){cards.append(h('p',{class:'faint small vs-cards-empty',text:S.state.errors?.presets?`Presets could not be loaded: ${S.state.errors.presets}`:'Loading presets…'}));return;}
    if(!list.length){cards.append(h('div',{class:'vs-cards-empty'},h('p',{class:'small muted',text:'No saved presets yet. Save the identity you like as a preset to reuse it on other projects.'})));return;}
    for(const p of list)presetCard(p,false);
    fadeCards();
  }
  function renderAll(){
    if(!alive)return;
    renderHead();renderBrowser();
    if(!saved)return;
    renderLook();renderOverrides();renderFinish();renderParams();renderTitle();renderAliases();renderQuality();
  }
  // ---- Thumbnails: the built-in families rendered from this project, one at a time ----------------------------------
  async function runThumbs(){
    const run=++thumbRun;
    await new Promise(r=>setTimeout(r,700));
    for(const f of FAMILIES){
      if(!alive||run!==thumbRun||!saved)return;
      const key=`${projectId}:${saved.revision}:${f.id}`;if(THUMBS.has(key))continue;
      // The graph the thumbnail draws is the project's, so it waits for the project to load; nothing renders while recording.
      if(P.state.model?.projectId!==projectId||P.state.recording.active)return;
      try{const r=await P.api.post(`/api/recipe/preview?id=${enc(projectId)}`,{actions:[{type:'family',family:f.id}]});
        if(!alive||run!==thumbRun)return;
        const url=await P.thumbnail(r.recipe)||'';THUMBS.set(key,url);if(url)THUMBS.set(`${projectId}:latest:${f.id}`,url);}
      catch(e){if(!alive||run!==thumbRun)return;console.warn(`Thumbnail of ${f.id} not rendered:`,e.message);if(!(e instanceof TypeError))THUMBS.set(key,'');}
      cards.querySelector(`[data-thumb="${f.id}"]`)?.replaceWith(thumbMedia(f.id));
      await new Promise(r=>setTimeout(r,80));
    }
  }
  const thumbsWaiting=()=>saved&&FAMILIES.some(f=>!THUMBS.has(`${projectId}:${saved.revision}:${f.id}`));
  // ---- Routes: #/visual/family/<id> and #/visual/look/<packId> start a preview ---------------------------------------
  function consumeRoute(){
    if(!wantedRoute||!saved)return;const [kind,id]=wantedRoute;wantedRoute=null;
    if(kind==='family'&&id)chooseFamily(id);else if(kind==='look'&&id)chooseLook(id);
    history.replaceState(null,'',`${location.pathname}${location.search}#/visual`);
  }
  // ---- Subscriptions --------------------------------------------------------------------------------------------------
  offs.push(S.on(t=>{
    if(!alive)return;
    if(t.has('selection')||t.has('project')||(t.has('projects')&&S.state.selected!==projectId)){resetProject();if(!S.state.selected)return;}
    if(t.has('recipe')&&P.state.recipe&&S.state.selected===projectId)adoptSaved(P.state.recipe);
    // The store re-applies the saved stage on many events; a preview in progress keeps its own world and labels.
    if(pending()&&(t.has('world')||t.has('labels')))applyLocalStage();
    if(t.has('preview')||t.has('notice')||t.has('world')||t.has('preferences')||t.has('settings')){renderBadge();if(t.has('world')||t.has('preferences')||t.has('settings'))renderIdentity();}
    if(t.has('packs')||t.has('catalog')){renderBrowser();renderLook();}
    else if(t.has('presets')||t.has('preferences')||t.has('settings'))renderBrowser();
    if(t.has('model')){renderAliases();if(thumbsWaiting())runThumbs();}
    if(t.has('recording')&&!P.state.recording.active&&thumbsWaiting())runThumbs();
    if(t.has('quality')||t.has('device'))renderQuality();
  }));
  if(!S.state.presets)void S.loadPresets();
  if(!S.state.catalog)void S.loadCatalog();
  projectId=null;resetProject();
  return {
    route(next){wantedRoute=next?.length?next:null;consumeRoute();},
    unmount(){
      alive=false;clearTimeout(previewTimer);thumbRun++;S.setDraft(null);
      if(pending()){if(P.state.preview)P.preview(null).catch(()=>{});applyLocalStage(true);toast('The preview was discarded when you left Visual Studio. Nothing was saved.','info');}
      for(const f of offs)f();
    }
  };
}};

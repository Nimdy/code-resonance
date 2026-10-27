// Artist Studio: compositions of procedural layers (public/composition.js) over a flagship world or the artist canvas,
// made on the real stage. Three things are kept apart, as in the Visual Studio:
//   My creations   the receiver's library (compositions.json): saved, versioned (the last five kept), shared by every
//                  window and announced on the change feed;
//   Working copy   what is being edited in this window. It is previewed on this window's stage only (POST
//                  /api/recipe/preview with a composition action, then P.preview) and kept in memory while the page
//                  lives, never in browser storage; Save writes it to the library;
//   Project        Apply makes it part of the selected project's identity (the recipe action, against the revision this
//                  window saw), so every window, the OBS view, recordings and replays show it.
// Composition strings (names, descriptions) are the artist's data: always set as text, never parsed.
import {h,text,clear,button,field,select,segmented,slider,toggle,colorInput,parameterControl,humanize,disclosure,pill,callout,emptyState,modal,confirmDialog,popover,menuItem,toast,styles} from '../dom.js';
import {icon} from '../icons.js';
import {projectName,count,ago,bytes,STYLE_NAMES,WORLD_NAMES} from '../format.js';
import {openDoc} from '../markdown.js';
import {zipStored} from '../zip.js';
// The working copy outlives a visit (leaving the studio stops its preview; coming back resumes it).
const session={work:null,source:null,baseline:'',opened:'',version:null,selected:null,tab:null};
const BASES=[
  {id:'fractal-biosphere',name:'Fractal Biosphere',icon:'fractal',line:'Its living forest, with your layers grown into it'},
  {id:'stellar-forge',name:'Stellar Forge',icon:'spark',line:'Orbits and light at the scale of a galaxy'},
  {id:'machine-cathedral',name:'Machine Cathedral',icon:'structure',line:'Engineered spires, channels and precise light'},
  {id:'canvas',name:'Artist canvas',icon:'canvas',line:'A quiet horizon and nothing else: everything is yours'}];
const baseOf=id=>BASES.find(b=>b.id===id)||BASES[3];
// The few controls of each layer that change it the most; everything else of its group sits under "More".
const ESSENTIAL={fractal:['form','depth','instances','growth','color','tip','glow','sway','speed'],particles:['count','distribution','behavior','color','colorB','size','glow','speed','cohesion','attraction'],
  ribbons:['field','count','length','color','colorB','glow','speed','turbulence'],structure:['shape','count','radius','color','glow','wire','rotation'],
  atmosphere:['style','scale','color','colorB','intensity','speed'],light:['style','count','size','color','intensity','speed']};
const LABEL={depth:'Recursion',colorB:'Second colour',color:'Colour',tip:'Tip colour',wire:'Wireframe',trail:'Trails',field:'Flow field',noise:'Texture',hue:'Hue shift',
  scale:'Size',speed:'Motion speed',instances:'Instances',count:'Count',behavior:'Behaviour',distribution:'Distribution'};
const DOC={growth:'How far the branches have grown: map it to the phrase or to new structure',sway:'How much the forms move in the current',depth:'Levels of branching (detail)',
  attraction:'Pull toward the anchors (negative pushes away)',cohesion:'Staying together as a group',separation:'Personal space between neighbours',alignment:'Matching neighbours’ headings',
  trail:'How long each point leaves a trail',lifetime:'Seconds before a point is reborn',turbulence:'How much the flow curls and breaks',wobble:'Slow irregular motion of the forms',
  glow:'Light the layer gives off (the finish blooms it)',brightness:'Overall brightness of the layer',hue:'Shifts every colour of the layer around the wheel',falloff:'How quickly the light fades from its centre',
  intensity:'How strong the layer is',sparkle:'Points that briefly flare'};
// A new layer of each kind starts placed sensibly and already answering the music (tasteful, editable).
const START={fractal:{anchor:{kind:'subsystems'},mappings:[{signal:'music.phrase',target:'growth',amount:.3,curve:'smooth',smoothing:1.5,min:.3,max:1}]},
  particles:{mappings:[{signal:'music.melody',target:'brightness',amount:.3,curve:'smooth',smoothing:.8,min:0,max:1}]},
  ribbons:{mappings:[{signal:'music.energy',target:'speed',amount:.4,curve:'smooth',smoothing:1.2,min:0,max:1}]},
  structure:{mappings:[{signal:'music.tension',target:'wobble',amount:.3,curve:'smooth',smoothing:1,min:0,max:.8}]},
  atmosphere:{depth:'behind',mappings:[{signal:'music.dynamics',target:'intensity',amount:.25,curve:'smooth',smoothing:2,min:0,max:1}]},
  light:{depth:'front',anchor:{kind:'largest',index:0},mappings:[{signal:'music.beat',target:'intensity',amount:.35,curve:'pulse',smoothing:0,min:0,max:1}]}};
// One-click mappings for a beginner: a musical moment and a real engineering one.
const SUGGEST=[{label:'Pulse on the beat',signal:'music.beat',curve:'pulse',amount:.35,smoothing:0,targets:['glow','intensity','brightness']},
  {label:'Swell with the music',signal:'music.dynamics',curve:'smooth',amount:.45,smoothing:1.2,targets:['scale','glow','intensity']},
  {label:'Answer verified milestones',signal:'eng.milestone',curve:'smooth',amount:.7,smoothing:1,targets:['intensity','glow','brightness']},
  {label:'Follow the activity',signal:'eng.activity',curve:'smooth',amount:.4,smoothing:1.5,targets:['speed','brightness']}];
// The base world's controls the studio shows first; every other tunable value is under "All world values".
const WORLD_FIRST={'fractal-biosphere':['material.bioluminescence','atmosphere.lightShafts','atmosphere.fog','motion.sway','space.canopy'],
  'stellar-forge':['geometry.arrangement','atmosphere.nebulaDensity','material.plasma','motion.orbitSpeed'],
  'machine-cathedral':['geometry.architecture','atmosphere.shafts','atmosphere.fog','material.wetness','secondary.windows']};
const PALETTE=['palette.hue','palette.primary','palette.secondary','palette.accent','palette.highlight','palette.haze'];
const LIFE=['life.enabled','life.density','life.collective','life.music','life.vitality'];
const LIFE_LABEL={'life.enabled':'Digital life','life.density':'Population','life.collective':'Gathering','life.music':'Music influence','life.vitality':'Vitality'};
const LIFE_DOC={'life.music':'0 independent ecology · 1 musical ecology · 2 expressive ecology','life.collective':'How strongly the inhabitants form groups'};
const MUSIC_PROFILE=[['mood','Mood','Darker … brighter'],['evolution','Evolution','How much the music develops over time'],['melody','Melody','How present the melody is'],['rhythm','Rhythm','How rhythmic the parts are'],
  ['atmosphere','Atmosphere','Space and ambient detail'],['dynamics','Dynamics','The size of crescendos']];
const LICENSES=[['CC-BY-4.0','CC BY 4.0 · others may use it, crediting you'],['CC-BY-SA-4.0','CC BY-SA 4.0 · credit, and share alike'],['CC-BY-NC-4.0','CC BY-NC 4.0 · credit, no commercial use'],
  ['CC0-1.0','CC0 1.0 · public domain'],['proprietary','All rights reserved']];
const enc=encodeURIComponent;
const json=x=>JSON.stringify(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const clamp=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
const getPath=(o,p)=>p.split('.').reduce((x,k)=>x?.[k],o);
const ordinal=n=>`${n}${n%10===1&&n!==11?'st':n%10===2&&n!==12?'nd':n%10===3&&n!==13?'rd':'th'}`;
// The composition model's parameter spec, as the shared parameter controls read it.
const asSpec=s=>s.type==='enum'?{type:'enum',values:s.options}:s.type==='int'?{type:'integer',min:s.min,max:s.max}:s.type==='bool'?{type:'boolean'}:s.type==='color'?{type:'color'}:{type:'number',min:s.min,max:s.max};
const fmtAmount=v=>`${v>0?'+':''}${Number(v).toFixed(2)}`;
export default {mount(view,{store:S,player:P,navigate,chrome,params}){
  styles('artist');
  const offs=[];let alive=true;
  let C=globalThis.ResonanceComposition||null,W=globalThis.ResonanceCompositionText||null;
  let candidate=null,previewing=false,previewSeq=0,timer=null,busy=false,previewError=null,baseRevision=null,musicOn=false,localWorld=false,wanted=params?.length?params:['last'];
  let inspSig='',mapSig='',compSig='',libSig='',dragId=null,due=0;
  const stored=()=>session.source?.kind==='stored'?S.composition(session.source.id):null;
  const dirty=()=>!!session.work&&json(session.work)!==session.baseline;
  const unsaved=()=>!!session.work&&session.source?.kind!=='stored';
  const projectRecipe=()=>P.state.project===S.state.selected?P.state.recipe:null;
  // ---- Layout -------------------------------------------------------------------------------------------------------
  const slot=h('div',{class:'stage-slot ar-slot','data-stage-slot':''});
  // Left: the library (my creations, starters, worlds) and the layer stack.
  const libTabs=segmented({label:'Library',value:session.tab||'mine',options:[{value:'mine',label:'My creations'},{value:'starters',label:'Starters'},{value:'worlds',label:'Worlds'}],
    onChange:v=>{session.tab=v;renderLibrary();}});
  const libList=h('div',{class:'ar-lib-list scroll',role:'list'});
  const library=h('section',{class:'ar-lib','aria-label':'Library'},h('div',{class:'ar-sec-head'},h('span',{class:'eyebrow',text:'Library'}),h('span',{class:'grow'}),
    button({icon:'doc',kind:'ghost',size:'sm',title:'How the Artist Studio works',attrs:{'aria-label':'How the Artist Studio works'},onClick:()=>openDoc('ARTIST-STUDIO.md')})),libTabs,libList);
  const stackCount=h('span',{class:'tiny faint num'});
  const addBtn=button({label:'Add layer',icon:'plus',size:'sm',kind:'outline',id:'arAddLayer',onClick:()=>openLibraryMenu(addBtn)});
  const stackList=h('ul',{class:'ar-stack-list scroll',id:'arLayers','aria-label':'Layers, front to back'});
  const stack=h('section',{class:'ar-stack','aria-label':'Layers'},h('div',{class:'ar-sec-head'},h('h2',{class:'ar-h',text:'Layers'}),stackCount,h('span',{class:'grow'}),addBtn),stackList);
  const left=h('aside',{class:'ar-left','aria-label':'Library and layers'},library,stack);
  // Centre: the composition's name and state, the stage, the reactive mappings and composition settings, the actions.
  const nameInput=h('input',{class:'input ar-name',id:'arName',type:'text',maxlength:48,spellcheck:'false',autocomplete:'off','aria-label':'Composition name',placeholder:'Untitled composition'});
  const headPills=h('div',{class:'ar-head-pills'});
  const head=h('div',{class:'ar-head'},h('div',{class:'ar-title'},h('h1',{class:'eyebrow ar-h1',text:'Artist Studio'}),nameInput),headPills);
  const stageBox=h('div',{class:'ar-stage'},slot);
  const mapsBody=h('div',{class:'ar-maps-body scroll'}),mapsTitle=h('h2',{class:'ar-h',text:'Reacts to'}),mapsSub=h('span',{class:'tiny faint ellipsis'});
  const addMapBtn=button({label:'Add mapping',icon:'plus',size:'sm',kind:'ghost',id:'arAddMapping',onClick:()=>addMapping()});
  const maps=h('section',{class:'ar-maps','aria-label':'Reactive mappings'},h('div',{class:'ar-sec-head'},mapsTitle,mapsSub,h('span',{class:'grow'}),addMapBtn),mapsBody);
  const compBody=h('div',{class:'ar-comp-body scroll'});
  const comp=h('section',{class:'ar-comp','aria-label':'Composition'},h('div',{class:'ar-sec-head'},h('h2',{class:'ar-h',text:'Composition'})),compBody);
  const strip=h('div',{class:'ar-strip'},maps,comp);
  const meter=h('div',{class:'ar-budget',role:'meter','aria-label':'Rendering budget','aria-valuemin':'0','aria-valuemax':'100'},h('div',{class:'ar-budget-bar'},h('i')),h('span',{class:'ar-budget-text tiny num'}));
  const status=h('div',{class:'ar-status small',role:'status','aria-live':'polite'});
  const revertBtn=button({label:'Versions',icon:'history',size:'sm',kind:'ghost',id:'arRevert',title:'Bring back one of the last five saved versions',onClick:()=>openVersions(revertBtn)});
  const dupBtn=button({label:'Duplicate',icon:'copy',size:'sm',kind:'ghost',id:'arDuplicate',onClick:()=>duplicate()});
  const exportBtn=button({label:'Export',icon:'download',size:'sm',kind:'ghost',id:'arExport',title:'A data-only pack another Code Resonance can import',onClick:()=>openExport()});
  const saveAsBtn=button({label:'Save as…',size:'sm',kind:'outline',id:'arSaveAs',onClick:()=>saveAs()});
  const cancelBtn=button({label:'Cancel',size:'sm',kind:'ghost',id:'arCancel',title:'Discard the unsaved changes and show the project’s saved look',onClick:()=>cancel()});
  const saveBtn=button({label:'Save',icon:'save',size:'sm',kind:'outline',id:'arSave',onClick:()=>save()});
  const applyBtn=button({label:'Apply to project',icon:'check',kind:'primary',id:'arApply',onClick:()=>apply()});
  const foot=h('div',{class:'ar-foot'},meter,status,h('span',{class:'grow'}),h('div',{class:'ar-foot-more'},revertBtn,dupBtn,exportBtn),saveAsBtn,cancelBtn,saveBtn,applyBtn);
  const main=h('div',{class:'ar-main'},head,stageBox,strip,foot);
  // Right: the selected layer (or the base world) in detail.
  const inspector=h('aside',{class:'inspector ar-insp','aria-label':'Selected layer'});
  view.append(h('div',{class:'ws-artist'},left,main,inspector));
  const badge=h('div',{class:'ar-badge'}),stageNote=h('div',{class:'ar-stage-note',role:'status'});
  const chromeLayer=h('div',{class:'ar-chrome chrome-pass'},badge,stageNote);
  chrome.append(chromeLayer);offs.push(()=>chromeLayer.remove());
  nameInput.addEventListener('input',()=>{if(!session.work)return;edit(d=>{d.name=nameInput.value;});});
  nameInput.addEventListener('blur',()=>{if(session.work&&nameInput.value!==session.work.name)nameInput.value=session.work.name;});
  nameInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nameInput.blur();}});
  // ---- Opening, editing -------------------------------------------------------------------------------------------
  // Open a composition as the working copy: from the library (stored), a starter, a world, the project, or a pack.
  function open(c,source,{version=null,select:sel=null}={}){
    session.work=byDepth(C.normalize(c));session.source=source;session.version=version;
    session.baseline=json(session.work);session.opened=session.baseline;
    session.selected=sel||topLayer()?.id||'@base';
    if(source.kind==='stored')S.setUi({artistLast:source.id});
    inspSig='';mapSig='';compSig='';baseRevision=null;renderAll();schedulePreview(0);
  }
  const topLayer=()=>session.work?.layers.at(-1)||null;
  // The stack is the drawing order: behind the world first, then integrated, then in front (each class keeps its own
  // order). Kept that way, the list shows exactly what is drawn over what.
  const RANK={behind:0,world:1,front:2};
  const byDepth=c=>{c.layers=c.layers.map((l,i)=>[l,i]).sort((a,b)=>RANK[a[0].depth]-RANK[b[0].depth]||a[1]-b[1]).map(([l])=>l);return c;};
  const layerOf=(d,id)=>d.layers.find(l=>l.id===id)||null;
  const selectedLayer=()=>session.work&&session.selected!=='@base'?layerOf(session.work,session.selected):null;
  // Every change goes through the model: validated (a change past the layer count or the budget is refused, never
  // silently dropped), normalised, then previewed.
  function edit(fn,{rebuild=false}={}){
    if(!session.work)return false;
    const draft=copy(session.work);fn(draft);byDepth(draft);
    const problems=C.validate(draft);
    if(problems.length){const p=problems[0],over=/budget/.test(p.message);
      toast(over?`That would go over the rendering budget (${rawCost(draft)} of ${C.LIMITS.budget}). Nothing was changed: lower a count or turn a layer off.`:`Not changed: ${p.message}.`,'warning');
      inspSig='';mapSig='';renderAll();return false;}
    session.work=C.normalize(draft);
    if(rebuild){inspSig='';mapSig='';compSig='';}
    renderAll();schedulePreview();return true;
  }
  const rawCost=d=>Math.round(d.layers.reduce((n,l)=>n+(C.LAYERS[l.type]?C.costOf(C.layer(l.type,{params:l.params})):0),0)*10)/10;
  function uid(type){let i=1;while(session.work.layers.some(l=>l.id===`${type}-${i}`))i++;return `${type}-${i}`;}
  function nextSeed(){const used=new Set(session.work.layers.map(l=>l.seed));let s=(session.work.layers.length*1543+17)%9999;while(used.has(s))s=(s+101)%9999;return s;}
  function addLayer(type){
    if(!session.work)return;
    if(session.work.layers.length>=C.LIMITS.layers){toast(`A composition has at most ${C.LIMITS.layers} layers: remove one first.`,'warning');return;}
    const words=W.LAYER_WORDS[type],same=session.work.layers.filter(l=>l.type===type).length;
    const l=C.layer(type,{id:uid(type),name:same?`${words.name} ${same+1}`:words.name,seed:nextSeed(),...copy(START[type]||{})});
    if(edit(d=>{d.layers.push(l);},{rebuild:true})){session.selected=l.id;inspSig='';renderAll();}
  }
  function removeLayer(id){
    const i=session.work.layers.findIndex(l=>l.id===id);if(i<0)return;
    const name=session.work.layers[i].name;
    if(edit(d=>{d.layers.splice(i,1);},{rebuild:true})){session.selected=session.work.layers[Math.min(i,session.work.layers.length-1)]?.id||'@base';inspSig='';renderAll();
      toast(`${name} removed.`,'info',{action:{label:'Undo',onClick:()=>{const back=JSON.parse(lastBefore);session.work=back;inspSig='';mapSig='';renderAll();schedulePreview();}}});}
  }
  let lastBefore='';
  const remember=()=>{lastBefore=json(session.work);};
  function duplicateLayer(id){
    const l=layerOf(session.work,id);if(!l)return;
    if(session.work.layers.length>=C.LIMITS.layers){toast(`A composition has at most ${C.LIMITS.layers} layers.`,'warning');return;}
    const twin={...copy(l),id:uid(l.type),name:`${l.name.slice(0,42)} copy`,seed:nextSeed(),solo:false};
    if(edit(d=>{d.layers.splice(d.layers.findIndex(x=>x.id===id)+1,0,twin);},{rebuild:true})){session.selected=twin.id;inspSig='';renderAll();}
  }
  // Moves are in drawing order (the list shows the front at the top): +1 is one step toward the front. Past the edge of
  // its depth class a layer moves into the next one (behind → integrated → in front), and says so.
  const DEPTH_ORDER=['behind','world','front'];
  function move(id,step){
    const w=session.work,i=w.layers.findIndex(l=>l.id===id),l=w.layers[i],j=i+step;if(i<0)return;
    const next=w.layers[j];
    if(next&&next.depth===l.depth)edit(d=>{const [x]=d.layers.splice(i,1);d.layers.splice(j,0,x);});
    else{const k=DEPTH_ORDER.indexOf(l.depth)+step;if(k<0||k>2)return;
      if(edit(d=>{layerOf(d,id).depth=DEPTH_ORDER[k];},{rebuild:true}))toast(`${l.name}: now ${W.DEPTH_WORDS[DEPTH_ORDER[k]].line.toLowerCase()}.`,'info');}
    stackList.querySelector(`[data-id="${CSS.escape(id)}"] .ar-layer-main`)?.focus();
  }
  // Drop a layer next to another: it takes that layer's depth class, just in front of it (or just behind it).
  function moveNext(id,targetId,inFront){
    if(id===targetId)return;
    edit(d=>{const i=d.layers.findIndex(l=>l.id===id),t=layerOf(d,targetId);if(i<0||!t)return;const [l]=d.layers.splice(i,1);l.depth=t.depth;
      const k=d.layers.indexOf(t);d.layers.splice(inFront?k+1:k,0,l);},{rebuild:true});
  }
  const setLayer=(id,patch,opts)=>edit(d=>{const l=layerOf(d,id);if(l)Object.assign(l,patch);},opts);
  const setParam=(id,key,v)=>edit(d=>{const l=layerOf(d,id);if(l)l.params[key]=v;});
  // ---- Preview: the working copy on this window's stage only -------------------------------------------------------
  // Edits in a row (a slider being dragged) are gathered: the stage follows about every 150 ms with the latest values.
  function schedulePreview(ms=150){
    const at=performance.now()+ms;if(timer&&due<=at){renderFoot();return;}
    clearTimeout(timer);due=at;timer=setTimeout(()=>{timer=null;void runPreview();},ms);renderFoot();
  }
  async function runPreview(){
    clearTimeout(timer);timer=null;
    const id=S.state.selected,seq=++previewSeq;
    if(!session.work||!id||!alive){renderFoot();return;}
    busy=true;renderFoot();
    try{
      const r=await P.api.post(`/api/recipe/preview?id=${enc(id)}`,{actions:[{type:'composition',composition:session.work}]});
      if(seq!==previewSeq||!alive||id!==S.state.selected)return;
      if(!previewing||baseRevision===null)baseRevision=r.recipe.revision;
      const familyChanged=candidate?.family!==r.recipe.family;
      candidate=r.recipe;previewError=null;
      await show();
      if(familyChanged&&session.selected==='@base')inspSig='';
    }catch(e){
      if(seq!==previewSeq||!alive)return;
      previewError=e.code==='capability-required'||e.status===401?'This window may not preview changes: pair this browser first.':e.message;
    }finally{if(seq===previewSeq)busy=false;}
    if(alive&&seq===previewSeq){renderFoot();renderChrome();renderInspector();renderHead();}
  }
  async function show(){
    // The living world draws compositions: a project shown on a classic stage gets it here, for the preview only.
    if(S.effective().world!=='living'){P.setWorld('living');localWorld=true;}
    try{await P.preview(candidate);previewing=true;S.setDraft('Artist Studio preview');}
    catch(e){toast(e.message,'warning');candidate=null;previewing=false;S.setDraft(null);return;}
    const m=session.work?.music;
    if(m){S.previewMusic({...(m.style?{style:m.style}:{}),...(m.profile?{profile:m.profile}:{})});musicOn=true;}
    else if(musicOn){musicOn=false;S.previewMusic(null);}
  }
  async function stopPreview(){
    clearTimeout(timer);timer=null;previewSeq++;candidate=null;previewError=null;busy=false;baseRevision=null;
    try{if(P.state.preview)await P.preview(null);}catch{}
    previewing=false;S.setDraft(null);
    if(musicOn){musicOn=false;S.previewMusic(null);}
    if(localWorld){localWorld=false;S.applyEffective({force:true});}
  }
  // ---- Save, apply, cancel ----------------------------------------------------------------------------------------
  const originOf=src=>src?.kind==='starter'?{kind:'starter',ref:src.id}:src?.kind==='world'?{kind:'world',ref:src.family}:src?.kind==='pack'?{kind:'pack',ref:src.id}:
    src?.kind==='copy'?{kind:'copy',ref:src.from||null}:src?.kind==='project'?{kind:'composition',ref:null}:{kind:'blank',ref:null};
  async function save({quiet=false}={}){
    if(!session.work)return false;
    if(!unsaved()&&!dirty())return true;
    try{
      if(unsaved()){
        const r=await S.compositionAction({action:'create',composition:session.work,origin:originOf(session.source)});
        adoptSaved(r.created,{toastText:quiet?null:`Saved to My creations: ${session.work.name}.`});return true;}
      const id=session.source.id;
      await S.compositionAction({action:'update',id,composition:session.work,ifVersion:session.version});
      adoptSaved(id,{toastText:quiet?null:`Saved: ${session.work.name} · version ${S.composition(id)?.version}. The previous version is kept.`});return true;
    }catch(e){
      if(e.code==='stale'){await staleSave();return false;}
      toast(`Not saved: ${e.message}`,'error');return false;
    }
  }
  function adoptSaved(id,{toastText=null}={}){
    const e=S.composition(id);if(!e)return;
    session.source={kind:'stored',id};session.version=e.version;session.work=byDepth(C.normalize(e.composition));session.baseline=json(session.work);session.opened=session.baseline;
    S.setUi({artistLast:id});if(toastText)toast(toastText,'ok');renderAll();
  }
  function staleSave(){
    const id=session.source.id,now=S.composition(id);
    return new Promise(resolve=>{modal({title:'This composition was saved in another window',label:'Saved elsewhere',
      body:h('div',{class:'ar-dialog'},h('p',{class:'muted',text:`You opened version ${session.version}; version ${now?.version??'?'} has been saved since${now?` (${now.composition.name})`:''}.`}),
        h('p',{class:'muted',text:'Replacing keeps their version in the history, so nothing is lost either way.'})),onClose:()=>resolve(),
      actions:[{label:'Load theirs',onClick:()=>{if(now)open(now.composition,{kind:'stored',id},{version:now.version});resolve();}},
        {label:'Save mine as a copy',onClick:async()=>{session.source={kind:'copy',from:id};await save();resolve();}},
        {label:'Replace with mine',kind:'primary',onClick:async()=>{session.version=now?.version??null;await save();resolve();}}]});});
  }
  async function saveAs(){
    if(!session.work)return;
    const input=h('input',{class:'input',type:'text',maxlength:48,value:unsaved()?session.work.name:`${session.work.name.slice(0,43)} copy`,'aria-label':'Name',autofocus:true,spellcheck:'false'});
    const desc=h('textarea',{class:'textarea ar-desc',maxlength:240,rows:3,'aria-label':'Description',placeholder:'What it is, in a sentence (shown in the library and in the exported README)'});desc.value=session.work.description||'';
    const err=h('div',{class:'ar-error small'});
    const go=async()=>{const name=input.value.trim();if(!/[\p{L}\p{N}]/u.test(name)){text(err,'A name needs at least one letter or digit.');return false;}
      try{const r=await S.compositionAction({action:'create',composition:{...session.work,name,description:desc.value},origin:originOf(session.source)});
        adoptSaved(r.created,{toastText:`Saved as a new composition: ${name}.`});schedulePreview(0);return true;}
      catch(e){text(err,e.message);return false;}};
    const dlg=modal({title:'Save as a new composition',subtitle:'In My creations; the one you started from stays as it is.',body:h('div',{class:'ar-dialog'},field({label:'Name',control:input}),field({label:'Description',control:desc}),err),
      actions:[{label:'Cancel'},{label:'Save',kind:'primary',onClick:go}]});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void go().then(ok=>{if(ok)dlg.close();});}});
  }
  async function duplicate(){
    const e=stored();if(!e){await saveAs();return;}
    if(dirty()&&!await confirmDialog({title:'Duplicate the saved version?',body:'The copy is made from the last saved version. Your unsaved changes stay here, in this composition.',confirm:'Duplicate'}))return;
    try{const r=await S.compositionAction({action:'duplicate',id:e.id});const c=S.composition(r.created);
      toast(`Duplicated: ${c?.composition.name}. You are now editing the copy.`,'ok');if(c)open(c.composition,{kind:'stored',id:c.id},{version:c.version});}
    catch(err){toast(`Not duplicated: ${err.message}`,'error');}
  }
  async function cancel(){
    if(!session.work)return;
    if(dirty()&&!await confirmDialog({title:'Discard the unsaved changes?',body:unsaved()?'The composition goes back to how it was when you opened it.':'The composition goes back to its last saved version.',confirm:'Discard',kind:'danger'}))return;
    session.work=JSON.parse(session.opened);inspSig='';mapSig='';compSig='';
    await stopPreview();renderAll();
    toast('Cancelled: the stage shows the project’s saved look again. Edit anything to preview.','info');
  }
  async function apply(){
    if(!session.work)return;
    const id=S.state.selected,pr=S.project();if(!id){toast('Select a project to apply the composition to.','warning');return;}
    if(timer)await runPreview();
    if(previewError){toast(`Not applied: ${previewError}`,'error');return;}
    // What a project uses is always in My creations: an unsaved working copy is saved first.
    if((unsaved()||dirty())&&!await save({quiet:true}))return;
    const eff=S.effective().world;let world=null;
    if(eff!=='living'){const choice=await askWorld(eff);if(choice===null)return;if(choice)world='living';}
    const action=[{type:'composition',composition:session.work}];
    try{await P.recipeAction(action,{ifRevision:baseRevision??projectRecipe()?.revision})}
    catch(e){if(e.code==='stale'){staleApply(action,world);return;}toast(`Not applied: ${e.message}`,'error');return;}
    await applied(world,`Applied to ${projectName(pr)}: ${session.work.name}${session.work.music?` with its ${STYLE_NAMES[session.work.music.style]||''} music`:''}. Every window and the OBS view show it now.`);
  }
  async function applied(world,message){
    try{if(world){S.unpin('world');await S.savePreferences({world});}await applyMusicOf(S,session.work);}
    catch(e){toast(`The composition is applied, but the project’s ${world?'stage':'music'} could not be saved: ${e.message}`,'warning');}
    await stopPreview();renderAll();toast(message,'ok');
  }
  function askWorld(eff){
    return new Promise(resolve=>{modal({title:'Show the living world for this project?',body:h('p',{class:'muted',text:`This project’s stage is ${WORLD_NAMES[eff]}. Compositions are drawn by the living world, which is shown here only for the preview.`}),
      onClose:()=>resolve(null),actions:[{label:'Cancel',kind:'ghost',onClick:()=>resolve(null)},{label:`Apply, keep ${WORLD_NAMES[eff]}`,onClick:()=>resolve(false)},{label:'Apply and show the living world',kind:'primary',onClick:()=>resolve(true)}]});});
  }
  function staleApply(action,world){
    const now=P.state.recipe;
    modal({title:'The project’s identity changed in another window',label:'Stale identity',
      body:h('div',{class:'ar-dialog'},h('p',{class:'muted',text:`This preview was made from revision ${baseRevision}; the saved identity is now revision ${now?.revision??'newer'}${now?.familyName?` (${now.familyName})`:''}.`}),
        h('p',{class:'muted',text:'Reload shows the new version and keeps your composition here. Apply to the new version applies it on top of the other window’s change.'})),
      actions:[{label:'Reload',onClick:async()=>{await stopPreview();await P.reloadRecipe();schedulePreview(0);toast('Reloaded: the preview now starts from the identity saved in the other window.','info');}},
        {label:'Apply to the new version',kind:'primary',onClick:async()=>{try{await P.recipeAction(action);}catch(e){toast(`Not applied: ${e.message}`,'error');return false;}
          await applied(world,`Applied on the new version: ${session.work.name}.`);}}]});
  }
  // ---- Versions, export ----------------------------------------------------------------------------------------------
  function openVersions(anchor){
    const e=stored();if(!e?.history.length){toast(e?'No earlier version yet: each Save keeps the one before it (up to five).':'Save the composition first: each save then keeps the one before it.','info');return;}
    popover(anchor,close=>h('div',{},h('div',{class:'menu-label eyebrow',text:`Current: version ${e.version}`}),
      ...e.history.map(v=>menuItem({label:`Version ${v.version} · ${v.name}`,sub:`Saved ${ago(v.savedAt)} · ${count(v.layers,'layer')}`,icon:'history',onClick:async()=>{close();
        if(dirty()&&!await confirmDialog({title:`Bring back version ${v.version}?`,body:'Your unsaved changes are discarded. The current saved version stays in the history.',confirm:'Bring it back'}))return;
        try{await S.compositionAction({action:'restore',id:e.id,version:v.version});const n=S.composition(e.id);open(n.composition,{kind:'stored',id:e.id},{version:n.version,select:session.selected});
          toast(`Version ${v.version} is current again (now version ${n.version}); the one it replaced is kept.`,'ok');}
        catch(err){toast(`Not restored: ${err.message}`,'error');}}})),
      h('div',{class:'menu-sep'}),h('p',{class:'tiny faint ar-menu-note',text:'Bringing one back never deletes the current version: it moves into the history.'})),{width:360});
  }
  async function openExport(entryId=null){
    const id=entryId||session.source?.id;
    if(!entryId&&(unsaved()||dirty())){if(!await confirmDialog({title:'Save before exporting?',body:'An export is made from the saved composition.',confirm:'Save and export'}))return;if(!await save({quiet:true}))return;}
    return exportDialog({S,id:entryId||session.source.id});
  }
  // ---- Library -----------------------------------------------------------------------------------------------------
  const swatches=c=>{const cols=[...new Set(c.layers.flatMap(l=>[l.params.color,l.params.colorB||l.params.tip]).filter(Boolean))].slice(0,5);
    return h('span',{class:'ar-swatches','aria-hidden':'true'},...(cols.length?cols:['#22324a']).map(v=>{const i=h('i');i.style.background=v;return i;}));};
  const libItem=({key,title,sub,glyph,active,onClick,menu=null,pills=[]})=>{
    const b=h('button',{type:'button',class:['ar-lib-item',active?'active':''],dataset:{key},'aria-current':active?'true':null},glyph,h('span',{class:'ar-lib-text'},h('strong',{class:'ellipsis',text:title}),h('span',{class:'tiny faint ellipsis',text:sub})),...pills);
    b.addEventListener('click',onClick);
    return h('div',{class:'ar-lib-row',role:'listitem'},b,menu);};
  function renderLibrary(){
    if(!C)return;
    const tab=session.tab||'mine',r0=projectRecipe();
    // Rebuilt only when what it lists changes (not on every edit of the working copy).
    const sig=json([tab,session.source,S.state.compositions?.revision??null,S.state.errors?.compositions||'',r0?.composition?.id||null,r0?.composition?json(r0.composition).length:0,r0?.revision,
      (P.state.packs||[]).filter(p=>p.composition).map(p=>p.id+p.digest)]);
    if(sig===libSig)return;libSig=sig;libTabs.set(tab);
    const k=libList.contains(document.activeElement)?document.activeElement.closest('[data-key]')?.dataset.key:null;
    clear(libList);
    const cur=session.source,r=projectRecipe();
    if(tab==='mine'){
      const lib=S.state.compositions;
      if(r?.composition&&!(r.composition.id&&S.composition(r.composition.id)))libList.append(libItem({key:'project',title:r.composition.name,sub:'On this project · not in My creations',glyph:swatches(r.composition),active:cur?.kind==='project',
        pills:[pill('Applied','ok',{plain:true})],onClick:()=>guard(()=>open(r.composition,{kind:'project'}))}));
      if(!lib)libList.append(h('p',{class:'tiny faint ar-lib-empty',text:S.state.errors?.compositions?`Not loaded: ${S.state.errors.compositions}`:'Loading…'}));
      else if(!lib.compositions.length)libList.append(h('div',{class:'ar-lib-empty'},h('p',{class:'small muted',text:'Nothing saved yet.'}),h('p',{class:'tiny faint',text:'Start from a starter or a world; Save keeps your composition here, with its previous versions.'})));
      else for(const e of [...lib.compositions].sort((a,b)=>b.updatedAt-a.updatedAt)){
        const onProject=r?.composition?.id===e.id,same=onProject&&json({...r.composition})===json(e.composition);
        libList.append(libItem({key:e.id,title:e.composition.name,sub:`${baseOf(e.composition.base).name} · ${count(e.composition.layers.length,'layer')} · ${ago(e.updatedAt)}`,glyph:swatches(e.composition),
          active:cur?.kind==='stored'&&cur.id===e.id,pills:onProject?[pill(same?'Applied':'Applied · older','ok',{plain:true,title:same?'This project uses this version':'This project uses an earlier version: Apply to update it'})]:[],
          onClick:()=>guard(()=>open(e.composition,{kind:'stored',id:e.id},{version:e.version})),menu:itemMenu(e)}));
      }
      const imported=(P.state.packs||[]).filter(p=>p.composition&&p.ok);
      if(imported.length){libList.append(h('div',{class:'ar-lib-group eyebrow',text:'Imported creations'}));
        for(const p of imported)libList.append(libItem({key:`pack:${p.id}`,title:p.name,sub:`By ${p.author?.name||'unknown'} · opens an editable copy`,glyph:swatches(p.composition),active:cur?.kind==='pack'&&cur.id===p.id,
          onClick:()=>guard(()=>open({...p.composition,id:null},{kind:'pack',id:p.id}))}));}
    }else if(tab==='starters'){
      for(const s of C.STARTERS)libList.append(libItem({key:s.id,title:s.name,sub:s.description,glyph:s.layers.length?swatches(s):h('span',{class:'ar-glyph'},icon('canvas')),active:cur?.kind==='starter'&&cur.id===s.id,
        onClick:()=>guard(()=>open({...copy(s),id:null},{kind:'starter',id:s.id}))}));
    }else{
      for(const b of BASES)libList.append(libItem({key:`world:${b.id}`,title:b.name,sub:b.line,glyph:h('span',{class:'ar-glyph'},icon(b.icon)),active:cur?.kind==='world'&&cur.family===b.id,
        onClick:()=>guard(()=>open(fromWorld(b.id),{kind:'world',family:b.id}))}));
    }
    if(k)libList.querySelector(`[data-key="${CSS.escape(k)}"]`)?.focus({preventScroll:true});
  }
  const fromWorld=base=>({name:base==='canvas'?'Canvas composition':`${baseOf(base).name} composition`,base,finish:'cinematic',layers:[]});
  function itemMenu(e){
    const b=button({icon:'more',kind:'ghost',size:'sm',attrs:{'aria-label':`More for ${e.composition.name}`,'aria-haspopup':'menu'},onClick:()=>popover(b,close=>h('div',{},
      menuItem({label:'Rename',icon:'doc',onClick:()=>{close();rename(e);}}),
      menuItem({label:'Duplicate',icon:'copy',onClick:async()=>{close();try{const r=await S.compositionAction({action:'duplicate',id:e.id});toast(`Duplicated: ${S.composition(r.created)?.composition.name}.`,'ok');}catch(err){toast(err.message,'error');}}}),
      menuItem({label:'Export…',icon:'download',onClick:()=>{close();void exportDialog({S,id:e.id});}}),
      h('div',{class:'menu-sep'}),
      menuItem({label:'Delete',icon:'trash',onClick:async()=>{close();await remove(e);}})),{align:'end',width:220})});
    return b;
  }
  function rename(e){
    const input=h('input',{class:'input',type:'text',maxlength:48,value:e.composition.name,'aria-label':'Name',autofocus:true});const err=h('div',{class:'ar-error small'});
    const go=async()=>{try{await S.compositionAction({action:'rename',id:e.id,name:input.value});if(session.source?.kind==='stored'&&session.source.id===e.id&&!dirty())adoptSaved(e.id);return true;}catch(x){text(err,x.message);return false;}};
    const dlg=modal({title:'Rename',body:h('div',{class:'ar-dialog'},input,err),actions:[{label:'Cancel'},{label:'Rename',kind:'primary',onClick:go}]});
    input.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();void go().then(ok=>{if(ok)dlg.close();});}});
  }
  async function remove(e){
    const onProject=projectRecipe()?.composition?.id===e.id;
    if(!await confirmDialog({title:`Delete ${e.composition.name}?`,body:h('div',{class:'ar-dialog'},h('p',{text:'It is removed from My creations with its previous versions.'}),
      onProject?h('p',{class:'faint',text:'This project keeps showing it (its identity holds a copy) until you apply another composition or remove it.'}):null),confirm:'Delete',kind:'danger'}))return;
    try{await S.compositionAction({action:'delete',id:e.id});toast(`${e.composition.name} was deleted.`,'ok');
      if(session.source?.kind==='stored'&&session.source.id===e.id){session.source={kind:'copy',from:null};renderAll();}}
    catch(x){toast(`Not deleted: ${x.message}`,'error');}
  }
  // Opening something else over unsaved changes asks first.
  async function guard(fn){if(dirty()&&!await confirmDialog({title:'Discard the unsaved changes?',body:`${session.work.name} has changes that are not saved.`,confirm:'Discard',kind:'danger'}))return;fn();}
  function openLibraryMenu(anchor){
    if(!session.work){toast('Open a composition first: a starter, a world or one of yours.','info');return;}
    const spent=rawCost(session.work);
    popover(anchor,close=>h('div',{class:'ar-add'},h('div',{class:'menu-label eyebrow',text:`Add a layer · budget ${spent} / ${C.LIMITS.budget}`}),
      ...Object.keys(C.LAYERS).map(type=>{const cost=C.costOf(C.layer(type,START[type]||{})),fits=spent+cost<=C.LIMITS.budget&&session.work.layers.length<C.LIMITS.layers;
        const b=h('button',{type:'button',class:'menu-item ar-add-item',disabled:!fits,dataset:{type}},h('span',{class:'ar-glyph'},icon(type)),
          h('span',{class:'grow'},h('strong',{text:W.LAYER_WORDS[type].name}),h('span',{text:W.LAYER_WORDS[type].line})),h('span',{class:'tiny faint num ar-add-cost',text:fits?`${Math.round(cost)}`:'over budget'}));
        b.addEventListener('click',()=>{close();addLayer(type);});return b;})),{width:400});
  }
  // ---- Layer stack ---------------------------------------------------------------------------------------------------
  function renderStack(){
    clear(stackList);
    const w=session.work;
    addBtn.disabled=!w;text(stackCount,w?`${w.layers.length} / ${C?.LIMITS.layers??8}`:'');
    if(!w){stackList.append(h('li',{class:'ar-stack-empty tiny faint',text:'Layers appear here once a composition is open.'}));return;}
    const solo=w.layers.some(l=>l.solo&&l.enabled);
    const focused=stackList.contains(document.activeElement)?{id:document.activeElement.closest('[data-id]')?.dataset.id,cls:[...document.activeElement.classList].find(c=>c.startsWith('ar-layer-'))}:null;
    let group=null;
    [...w.layers].reverse().forEach((l,i,list)=>{
      if(l.depth!==group){group=l.depth;stackList.append(h('li',{class:'ar-group',role:'presentation'},h('span',{class:'eyebrow',text:W.DEPTH_WORDS[group].badge}),h('span',{class:'tiny faint',text:W.DEPTH_WORDS[group].line})));}
      const words=W.LAYER_WORDS[l.type],sel=session.selected===l.id,dim=!l.enabled||(solo&&!l.solo);
      const main=h('button',{type:'button',class:'ar-layer-main',title:`${l.name}: ${W.layerLine(l)}`},h('span',{class:'ar-glyph'},icon(l.type)),
        h('span',{class:'ar-layer-text'},h('strong',{class:'ellipsis',text:l.name}),h('span',{class:'tiny faint ellipsis',text:`${words.name}${l.mappings.length?` · reacts to ${count(l.mappings.length,'signal')}`:''}`})));
      main.addEventListener('click',()=>selectLayer(l.id));
      main.addEventListener('keydown',e=>{if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();move(l.id,e.key==='ArrowUp'?1:-1);return;}
        if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const rows=[...stackList.querySelectorAll('.ar-layer-main')],j=rows.indexOf(main)+(e.key==='ArrowUp'?-1:1);rows[j]?.focus();rows[j]?.click();}
        if(e.key==='Delete'){e.preventDefault();remember();removeLayer(l.id);}});
      const depth=h('span',{class:['ar-depth',l.depth],title:W.DEPTH_WORDS[l.depth].line,text:l.type==='atmosphere'?`${W.DEPTH_WORDS[l.depth].badge} · screen`:W.DEPTH_WORDS[l.depth].badge});
      const up=button({icon:'arrow-up',kind:'ghost',size:'sm',disabled:i===0&&l.depth==='front',attrs:{'aria-label':`Move ${l.name} forward`,class:'btn ghost sm icon ar-layer-up'},onClick:()=>move(l.id,1)});
      const down=button({icon:'arrow-down',kind:'ghost',size:'sm',disabled:i===list.length-1&&l.depth==='behind',attrs:{'aria-label':`Move ${l.name} back`,class:'btn ghost sm icon ar-layer-down'},onClick:()=>move(l.id,-1)});
      const soloBtn=button({icon:'solo',kind:'ghost',size:'sm',pressed:l.solo,title:l.solo?'Solo: only soloed layers are drawn':'Solo this layer',attrs:{'aria-label':`Solo ${l.name}`,class:'btn ghost sm icon ar-layer-solo'},onClick:()=>setLayer(l.id,{solo:!l.solo})});
      const eye=button({icon:l.enabled?'eye':'eye-off',kind:'ghost',size:'sm',pressed:l.enabled,title:l.enabled?'Shown: click to hide':'Hidden: click to show',attrs:{'aria-label':`Show ${l.name}`,class:'btn ghost sm icon ar-layer-eye'},onClick:()=>setLayer(l.id,{enabled:!l.enabled})});
      const li=h('li',{class:['ar-layer',sel?'selected':'',dim?'dim':''],dataset:{id:l.id},draggable:'true'},h('span',{class:'ar-drag','aria-hidden':'true'},icon('drag')),main,depth,h('span',{class:'ar-layer-tools'},up,down,soloBtn,eye));
      li.addEventListener('dragstart',e=>{dragId=l.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',l.id);li.classList.add('dragging');});
      li.addEventListener('dragend',()=>{dragId=null;li.classList.remove('dragging');for(const x of stackList.querySelectorAll('.drop-above,.drop-below'))x.classList.remove('drop-above','drop-below');});
      li.addEventListener('dragover',e=>{if(!dragId||dragId===l.id)return;e.preventDefault();const r=li.getBoundingClientRect(),above=e.clientY<r.top+r.height/2;li.classList.toggle('drop-above',above);li.classList.toggle('drop-below',!above);});
      li.addEventListener('dragleave',()=>li.classList.remove('drop-above','drop-below'));
      // The list shows the front first: dropping above a row puts the layer just in front of it, below just behind it.
      li.addEventListener('drop',e=>{e.preventDefault();const above=li.classList.contains('drop-above');li.classList.remove('drop-above','drop-below');if(dragId)moveNext(dragId,l.id,above);});
      stackList.append(li);
    });
    const b=baseOf(w.base);
    const baseRow=h('li',{class:['ar-layer','ar-base',session.selected==='@base'?'selected':'']},h('span',{class:'ar-drag'}),
      h('button',{type:'button',class:'ar-layer-main',onClick:()=>selectLayer('@base')},h('span',{class:'ar-glyph base'},icon(b.icon)),
        h('span',{class:'ar-layer-text'},h('strong',{class:'ellipsis',text:b.name}),h('span',{class:'tiny faint ellipsis',text:w.base==='canvas'?'The canvas: background, horizon, camera':`The world itself${Object.keys(w.tuning).length?` · ${count(Object.keys(w.tuning).length,'value')} tuned`:''}`}))),
      h('span',{class:'ar-depth base',text:'Base'}));
    stackList.append(baseRow);
    if(focused?.id)stackList.querySelector(`[data-id="${CSS.escape(focused.id)}"] .${focused.cls||'ar-layer-main'}`)?.focus({preventScroll:true});
  }
  function selectLayer(id){session.selected=id;renderStack();renderInspector();renderMappings();}
  // ---- Inspector: the selected layer ---------------------------------------------------------------------------------
  let paramControls=new Map();
  function renderInspector(force=false){
    const w=session.work,l=selectedLayer();
    const sig=!w?'none':l?`${l.id}|${l.type}|${l.anchor.kind}|${l.depth}`:`@base|${w.base}|${candidate?.family||''}|${S.state.catalog?1:0}`;
    if(!force&&sig===inspSig){updateInspector();return;}
    inspSig=sig;paramControls=new Map();clear(inspector);
    if(!w){inspector.append(h('div',{class:'inspector-body'},welcome()));return;}
    if(!l){inspector.append(...baseInspector());return;}
    const words=W.LAYER_WORDS[l.type];
    const nm=h('input',{class:'input ar-layer-name',type:'text',maxlength:48,value:l.name,'aria-label':'Layer name',spellcheck:'false'});
    nm.addEventListener('change',()=>setLayer(l.id,{name:nm.value}));nm.addEventListener('keydown',e=>{if(e.key==='Enter')nm.blur();});
    const shown=toggle({checked:l.enabled,label:'Shown',onChange:v=>setLayer(l.id,{enabled:v})});
    const solo=toggle({checked:l.solo,label:'Solo',onChange:v=>setLayer(l.id,{solo:v})});
    paramControls.set('@enabled',shown);paramControls.set('@solo',solo);
    const headEl=h('div',{class:'inspector-head ar-insp-head'},
      h('div',{class:'ar-insp-top'},h('span',{class:'ar-glyph'},icon(l.type)),h('span',{class:'eyebrow',text:words.name}),h('span',{class:'grow'}),
        button({icon:'copy',kind:'ghost',size:'sm',title:'Duplicate the layer',attrs:{'aria-label':'Duplicate the layer'},onClick:()=>duplicateLayer(l.id)}),
        button({icon:'trash',kind:'ghost',size:'sm',title:'Remove the layer',attrs:{'aria-label':'Remove the layer'},onClick:()=>{remember();removeLayer(l.id);}})),
      nm,h('p',{class:'tiny faint',text:words.line}),h('div',{class:'ar-insp-toggles'},shown,solo));
    const body=h('div',{class:'inspector-body ar-insp-body'});
    const spec=C.specOf(l.type),byKey=Object.fromEntries(spec.map(s=>[s.key,s]));
    // Placement: where it is, in which depth class, how it blends, how visible.
    const anchorSel=select({label:'Anchor',value:l.anchor.kind,options:C.ANCHORS.map(a=>({value:a,label:W.ANCHOR_WORDS[a]})),onChange:v=>setLayer(l.id,{anchor:v==='point'?{kind:'point',x:0,y:0,z:0}:v==='largest'?{kind:'largest',index:0}:{kind:v}},{rebuild:true})});
    const place=[field({label:'Anchored to',control:anchorSel,doc:l.anchor.kind==='camera'?'Drawn relative to the view: it stays put on screen as the camera moves.':l.anchor.kind==='subsystems'?'One instance at each of the project’s subsystems (the layout of the real structure).':null})];
    if(l.anchor.kind==='largest'){const s=slider({min:0,max:15,integer:true,value:l.anchor.index,label:'Which subsystem',format:v=>`${ordinal(v+1)} largest`,onChange:v=>setLayer(l.id,{anchor:{kind:'largest',index:v}})});place.push(field({label:'Which one',control:s}));}
    if(l.anchor.kind==='point'){const a=l.anchor;let pos={x:a.x,y:a.y,z:a.z};
      const commit=()=>setLayer(l.id,{anchor:{kind:'point',...pos}});
      const pad=xyPad(a.x,a.z,(x,z,done)=>{pos={...pos,x,z};if(done)commit();else{session.work=C.normalize({...session.work,layers:session.work.layers.map(y=>y.id===l.id?{...y,anchor:{kind:'point',...pos}}:y)});schedulePreview();}});
      const hgt=slider({min:-1,max:1,value:a.y,label:'Height',format:v=>Number(v).toFixed(2),onChange:v=>{pos={...pos,y:v};commit();}});
      place.push(h('div',{class:'field ar-pad-field'},h('div',{class:'field-head'},h('span',{class:'field-label',text:'Position'}),h('span',{class:'tiny faint',text:'seen from above · drag or use the arrow keys'})),pad),field({label:'Height',control:hgt}));}
    const depth=segmented({label:'Depth',block:true,value:l.depth,options:C.DEPTHS.map(d=>({value:d,label:W.DEPTH_WORDS[d].badge,title:W.DEPTH_WORDS[d].line})),onChange:v=>setLayer(l.id,{depth:v},{rebuild:true})});
    const blend=segmented({label:'Blend',block:true,value:l.blend,options:C.BLENDS.map(b=>({value:b,label:humanize(b),title:W.BLEND_WORDS[b]})),onChange:v=>setLayer(l.id,{blend:v})});
    paramControls.set('@blend',blend);
    place.push(field({label:'Depth',control:depth,doc:l.type==='atmosphere'?'A screen-space field: drawn as a full-screen layer, not as volumetric geometry in the world.':W.DEPTH_WORDS[l.depth].line}),
      field({label:'Blend',control:blend}),paramField(l,byKey.opacity));
    body.append(section('Placement',place));
    for(const [group,title] of [['form','Form'],['appearance','Appearance'],['motion','Motion']]){
      const list=spec.filter(s=>s.group===group&&s.key!=='opacity');if(!list.length)continue;
      const first=list.filter(s=>ESSENTIAL[l.type]?.includes(s.key)),more=list.filter(s=>!ESSENTIAL[l.type]?.includes(s.key));
      body.append(section(title,[...first.map(s=>paramField(l,s)),more.length?disclosure({summary:`More ${title.toLowerCase()} · ${more.length}`},...more.map(s=>paramField(l,s))):null]));
    }
    const seed=slider({min:0,max:9999,integer:true,value:l.seed,label:'Variation',onChange:v=>setLayer(l.id,{seed:v})});paramControls.set('@seed',seed);
    body.append(section('Variation',[field({label:'Variation',control:h('div',{class:'field-row'},seed,button({icon:'dice',kind:'ghost',size:'sm',title:'Another variation',attrs:{'aria-label':'Another variation'},onClick:()=>{const v=(l.seed*7919+1237)%9999;setLayer(l.id,{seed:v});seed.set(v);}})),
      doc:'The same settings with another seeded arrangement (deterministic: films and replays draw it the same way).'})]));
    inspector.append(headEl,body);
  }
  const section=(title,children)=>h('section',{class:'ar-insp-sec'},h('h3',{class:'eyebrow',text:title}),h('div',{class:'ar-props'},...children.filter(Boolean)));
  function paramField(l,s){
    if(!s)return null;
    const label=LABEL[s.key]||humanize(s.key),value=l.params[s.key];
    const control=parameterControl(asSpec(s),value,{label,onInput:v=>setParam(l.id,s.key,v),onChange:v=>setParam(l.id,s.key,v)});
    const wrap=h('div',{class:'ar-param-control'},control);
    const f=field({label,control:wrap,doc:DOC[s.key]||null,modified:json(value)!==json(s.default),onReset:()=>{setParam(l.id,s.key,s.default);if(control.set)control.set(s.default);else control.value=String(s.default);f.setModified(false);}});
    if(s.type==='number'||s.type==='int'||s.type==='enum')f.classList.add('stack');
    paramControls.set(s.key,{control,f,s});return f;
  }
  // Values changed elsewhere (a mapping's undo, a cancel) are shown in place; the inspector is not rebuilt under the hand.
  function updateInspector(){
    const l=selectedLayer();if(!l)return;
    for(const [k,x] of paramControls){if(k.startsWith('@'))continue;const v=l.params[k];
      if(!x.f.contains(document.activeElement)){if(x.control.set)x.control.set(v);else if('value' in x.control)x.control.value=String(v);}x.f.setModified(json(v)!==json(x.s.default));}
    paramControls.get('@enabled')?.set(l.enabled);paramControls.get('@solo')?.set(l.solo);paramControls.get('@blend')?.set(l.blend);
  }
  function xyPad(x,z,onChange){
    const dot=h('i',{class:'ar-pad-dot'}),pad=h('div',{class:'ar-pad',role:'slider',tabindex:'0','aria-label':'Position seen from above'},h('span',{class:'ar-pad-h'}),h('span',{class:'ar-pad-v'}),dot);
    const r2=v=>Math.round(v*100)/100;
    const place=()=>{dot.style.left=`${(x+1)*50}%`;dot.style.top=`${(z+1)*50}%`;pad.setAttribute('aria-valuetext',`across ${x.toFixed(2)}, depth ${z.toFixed(2)}`);};
    const at=e=>{const r=pad.getBoundingClientRect();x=r2(clamp((e.clientX-r.left)/r.width*2-1));z=r2(clamp((e.clientY-r.top)/r.height*2-1));place();onChange(x,z,false);};
    pad.addEventListener('pointerdown',e=>{pad.setPointerCapture(e.pointerId);at(e);});
    pad.addEventListener('pointermove',e=>{if(pad.hasPointerCapture(e.pointerId))at(e);});
    pad.addEventListener('pointerup',()=>onChange(x,z,true));
    pad.addEventListener('keydown',e=>{const d={ArrowLeft:[-.05,0],ArrowRight:[.05,0],ArrowUp:[0,-.05],ArrowDown:[0,.05]}[e.key];if(!d)return;e.preventDefault();x=r2(clamp(x+d[0]));z=r2(clamp(z+d[1]));place();onChange(x,z,true);});
    place();return pad;
  }
  // The base: the flagship world's own values (tuning, over the project's generated identity) or the canvas.
  function baseInspector(){
    const w=session.work,b=baseOf(w.base);
    const headEl=h('div',{class:'inspector-head ar-insp-head'},h('div',{class:'ar-insp-top'},h('span',{class:'ar-glyph base'},icon(b.icon)),h('span',{class:'eyebrow',text:'Base'})),
      h('h2',{class:'ar-insp-title',text:b.name}),h('p',{class:'tiny faint',text:w.base==='canvas'?'A minimal procedural foundation. It still receives the project’s structure (anchors), its music and its canonical engineering events.':'The project’s own world, as its identity generates it. Values set here travel with the composition; everything else stays the project’s.'}));
    const body=h('div',{class:'inspector-body ar-insp-body'});
    if(w.base==='canvas'){
      const c=w.canvas;
      const bg=colorInput({value:c.background,label:'Background',onChange:v=>edit(d=>{d.canvas.background=v;})}),hz=colorInput({value:c.horizon,label:'Horizon',onChange:v=>edit(d=>{d.canvas.horizon=v;})});
      const orbit=slider({min:0,max:1,value:c.orbit,label:'Camera orbit',format:v=>Number(v).toFixed(2),onChange:v=>edit(d=>{d.canvas.orbit=v;})});
      const dist=slider({min:.5,max:2,value:c.distance,label:'Camera distance',format:v=>Number(v).toFixed(2),onChange:v=>edit(d=>{d.canvas.distance=v;})});
      body.append(section('Canvas',[field({label:'Background',control:bg,inline:true}),field({label:'Horizon',control:hz,inline:true,doc:'The glow where the ground meets the sky'}),
        field({label:'Camera orbit',control:orbit,doc:'How far the camera travels around the centre'}),field({label:'Camera distance',control:dist})]));
      for(const f of body.querySelectorAll('.field'))if(f.querySelector('.range'))f.classList.add('stack');
      return [headEl,body];
    }
    const spec=S.state.catalog?.families?.[w.base]?.parameters;
    if(!spec){body.append(h('p',{class:'faint small',text:'Loading the world’s parameters…'}));return [headEl,body];}
    const genome=candidate?.family===w.base?candidate.genome:projectRecipe()?.family===w.base?projectRecipe().genome:null;
    const tuned=Object.keys(w.tuning).length;
    const wf=path=>{const s=spec[path];if(!s||path==='technique.finish'||!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9]+){1,3}$/.test(path))return null;
      const has=Object.hasOwn(w.tuning,path),v=has?w.tuning[path]:getPath(genome,path);
      const shown=v??(s.type==='boolean'?false:s.type==='color'?'#888888':s.type==='enum'?s.values[0]:s.type==='vec3'?[1,1,1]:(s.min+s.max)/2);
      const label=LIFE_LABEL[path]||humanize(path.split('.').slice(1).join(' '));
      const control=parameterControl(s,shown,{label,onChange:x=>setTuning(path,x)});
      const f=field({label,control:h('div',{class:'ar-param-control'},control),doc:LIFE_DOC[path]||(s.doc&&s.doc.length<90?s.doc:null),modified:has,onReset:()=>setTuning(path,null)});
      if(['number','integer','enum','vec3'].includes(s.type))f.classList.add('stack');return f;};
    if(!genome)body.append(h('p',{class:'tiny faint',text:'Values show the world as generated once the preview is running.'}));
    body.append(section('Palette',PALETTE.map(wf)),section('World',(WORLD_FIRST[w.base]||[]).map(wf)),section('Digital life',LIFE.map(wf)));
    const rest=Object.keys(spec).filter(p=>!PALETTE.includes(p)&&!LIFE.includes(p)&&!(WORLD_FIRST[w.base]||[]).includes(p)&&!p.startsWith('technique.finish'));
    const groups=new Map();for(const p of rest){const g=p.split('.')[0];if(!groups.has(g))groups.set(g,[]);groups.get(g).push(p);}
    body.append(h('section',{class:'ar-insp-sec'},h('h3',{class:'eyebrow',text:`All world values${tuned?` · ${tuned} set`:''}`}),
      ...[...groups].map(([g,list])=>disclosure({summary:`${humanize(g)} · ${list.length}`},h('div',{class:'ar-props'},...list.map(wf).filter(Boolean))))));
    return [headEl,body];
  }
  function setTuning(path,v){
    if(v!==null&&!Object.hasOwn(session.work.tuning,path)&&Object.keys(session.work.tuning).length>=C.LIMITS.tuning){toast(`A composition carries at most ${C.LIMITS.tuning} world values.`,'warning');return;}
    edit(d=>{if(v===null)delete d.tuning[path];else d.tuning[path]=v;},{rebuild:v===null});
  }
  function welcome(){
    return h('div',{class:'ar-welcome'},emptyState({icon:'brush',title:'Start a composition',
      body:'Build an original look from procedural layers that answer the music and the project’s real engineering events. Start from a starter, from one of the worlds, or from the empty canvas.',
      actions:[button({label:'Bioluminescent Dream',icon:'fractal',kind:'outline',onClick:()=>open({...copy(C.STARTERS[1]),id:null},{kind:'starter',id:C.STARTERS[1].id})}),
        button({label:'Blank canvas',icon:'canvas',kind:'outline',onClick:()=>open(fromWorld('canvas'),{kind:'world',family:'canvas'})})]}),
      h('ol',{class:'ar-steps small muted'},...['Choose a starter or a world','Add a layer and shape it','Map it to the music or to real events','Preview on the stage, then Save','Apply it to the project, or export it to share'].map(s=>h('li',{text:s}))));
  }
  // ---- Mappings: what the selected layer (or the whole composition) reacts to ----------------------------------------
  let sayEls=[];
  const scopeMappings=d=>session.selected==='@base'?d.mappings:layerOf(d,session.selected)?.mappings||null;
  const scopeTargets=()=>session.selected==='@base'?C.GLOBAL_TARGETS:C.targetsOf(selectedLayer()?.type)||[];
  function renderMappings(){
    const w=session.work,l=selectedLayer(),list=w?scopeMappings(w):null;
    const max=session.selected==='@base'?C.LIMITS.globalMappings:C.LIMITS.mappings;
    addMapBtn.disabled=!list||list.length>=max;
    text(mapsSub,!w?'':l?`What makes ${l.name} move · ${list.length} / ${max}`:`The whole composition: camera and finish · ${list.length} / ${max}`);
    const sig=!w?'none':`${session.selected}|${list?list.map(m=>`${m.signal}>${m.target}>${m.curve}`).join(','):''}`;
    if(sig===mapSig){for(const [i,el] of sayEls.entries()){const m=list?.[i];if(!m)continue;text(el.say,W.mappingSentence(m));text(el.resp,W.responseLine(m));}return;}
    mapSig=sig;sayEls=[];clear(mapsBody);
    if(!w){mapsBody.append(h('p',{class:'small faint ar-maps-empty',text:'Open a composition to decide what its layers react to.'}));return;}
    if(!list){mapsBody.append(h('p',{class:'small faint ar-maps-empty',text:'Select a layer.'}));return;}
    if(!list.length){
      const targets=scopeTargets();
      mapsBody.append(h('div',{class:'ar-maps-empty'},h('p',{class:'small muted',text:l?`${l.name} does not react to anything yet. Try one:`:'The whole composition does not react yet. A gentle camera sway with the music, for example:'}),
        h('div',{class:'ar-suggest'},...(l?SUGGEST:[{label:'Sway with the energy',signal:'music.energy',curve:'smooth',amount:.4,smoothing:2,targets:['camera.sway']},{label:'Bloom on new sections',signal:'music.section',curve:'smooth',amount:.4,smoothing:1.5,targets:['finish.bloom']}])
          .map(s=>{const t=s.targets.find(k=>targets.some(x=>x.key===k));return t?button({label:s.label,icon:'link',size:'sm',kind:'outline',onClick:()=>addMapping({signal:s.signal,target:t,amount:s.amount,curve:s.curve,smoothing:s.smoothing,min:0,max:1})}):null;}).filter(Boolean))));
      return;}
    list.forEach((m,i)=>mapsBody.append(mappingRow(m,i)));
  }
  function signalSelect(value,onChange){
    const s=h('select',{class:'select ar-signal','aria-label':'Reacts to'});
    for(const [g,label] of [['music','Music'],['eng','Engineering (canonical events)'],['env','Environment (digital life)']])
      s.append(h('optgroup',{label},...C.SIGNALS.filter(x=>x.group===g).map(x=>h('option',{value:x.id,text:x.label,title:x.doc}))));
    s.value=value;s.title=C.SIGNALS.find(x=>x.id===value)?.doc||'';
    s.addEventListener('change',()=>{s.title=C.SIGNALS.find(x=>x.id===s.value)?.doc||'';onChange(s.value);});return s;
  }
  function mappingRow(m,i){
    const targets=scopeTargets();
    const set=(patch,structural=false)=>{edit(d=>{const list=scopeMappings(d);if(list?.[i])Object.assign(list[i],patch);});if(structural){mapSig='';renderMappings();}};
    const cur=()=>scopeMappings(session.work)?.[i]||m;
    const sig=signalSelect(m.signal,v=>set({signal:v},true));
    const tgt=select({label:'Changes',value:m.target,options:targets.map(t=>({value:t.key,label:W.targetName(t.key)})),onChange:v=>set({target:v},true)});
    const amount=slider({min:-1,max:1,step:.05,value:m.amount,label:'Strength (negative: the other way)',format:fmtAmount,onInput:v=>set({amount:v}),onChange:v=>set({amount:v})});
    const curve=segmented({label:'Response curve',value:m.curve,options:[['linear','Linear','Evenly'],['smooth','Smooth','A soft start and finish'],['sharp','Sharp','Only strong moments'],['pulse','Peaks','Only the peaks']].map(([value,label,title])=>({value,label,title})),onChange:v=>set({curve:v},true)});
    const smooth=slider({min:0,max:4,step:.1,value:m.smoothing,label:'Smoothing (seconds)',format:v=>`${Number(v).toFixed(1)} s`,onChange:v=>set({smoothing:v})});
    const lo=slider({min:0,max:1,step:.05,value:m.min,label:'Lowest',format:v=>`${Math.round(v*100)} %`,onChange:v=>set({min:Math.min(v,cur().max)})});
    const hi=slider({min:0,max:1,step:.05,value:m.max,label:'Highest',format:v=>`${Math.round(v*100)} %`,onChange:v=>set({max:Math.max(v,cur().min)})});
    const adv=h('div',{class:'ar-map-adv',hidden:true},h('div',{class:'ar-map-adv-row'},h('span',{class:'tiny faint',text:'Curve'}),curve),
      h('div',{class:'ar-map-adv-row'},h('span',{class:'tiny faint',text:'Smoothing'}),smooth),h('div',{class:'ar-map-adv-row'},h('span',{class:'tiny faint',text:'Range'}),lo,hi));
    const more=button({icon:'sliders',kind:'ghost',size:'sm',pressed:false,title:'Response: curve, smoothing and range',attrs:{'aria-label':'Response settings','aria-expanded':'false'},
      onClick:()=>{adv.hidden=!adv.hidden;more.setAttribute('aria-pressed',String(!adv.hidden));more.setAttribute('aria-expanded',String(!adv.hidden));}});
    const del=button({icon:'close',kind:'ghost',size:'sm',title:'Remove the mapping',attrs:{'aria-label':'Remove the mapping'},onClick:()=>{edit(d=>{scopeMappings(d)?.splice(i,1);});mapSig='';renderMappings();renderStack();}});
    const say=h('span',{text:W.mappingSentence(m)}),resp=h('span',{class:'tiny faint',text:W.responseLine(m)});
    sayEls[i]={say,resp};
    return h('div',{class:['ar-map',m.signal.split('.')[0]]},h('div',{class:'ar-map-row'},sig,h('span',{class:'ar-map-arrow','aria-hidden':'true',text:'→'}),tgt,h('div',{class:'ar-map-amount'},amount),more,del),
      h('div',{class:'ar-map-say'},h('i',{'aria-hidden':'true'}),say,resp),adv);
  }
  function addMapping(m=null){
    const w=session.work;if(!w)return;const list=scopeMappings(w),targets=scopeTargets();if(!list||!targets.length)return;
    const prefer=['glow','intensity','brightness','camera.sway'].find(k=>targets.some(t=>t.key===k))||targets[0].key;
    const next=m||{signal:'music.energy',target:prefer,amount:.4,curve:'smooth',smoothing:1,min:0,max:1};
    edit(d=>{scopeMappings(d)?.push(next);});mapSig='';renderMappings();renderStack();
  }
  // ---- Composition settings ------------------------------------------------------------------------------------------
  let compRefs=null;
  function renderComposition(){
    const w=session.work,sig=w?`${w.base}`:'none';
    if(sig===compSig){if(w&&compRefs){compRefs.finish.set(w.finish||'');if(document.activeElement!==compRefs.music)compRefs.music.value=w.music?.style||'';compRefs.shape.disabled=!w.music;
      if(compRefs.bg){compRefs.bg.set(w.canvas.background);compRefs.hz.set(w.canvas.horizon);}text(compRefs.note,compNote(w));}return;}
    compSig=sig;compRefs=null;clear(compBody);
    if(!w){compBody.append(h('p',{class:'small faint',text:'Base world, finish and music of the open composition.'}));return;}
    const base=select({label:'Base',value:w.base,options:BASES.map(b=>({value:b.id,label:b.name})),onChange:v=>changeBase(v)});
    const finish=segmented({label:'Finish',value:w.finish||'',options:[{value:'',label:'Own',title:'Keep the project’s own finish'},...C.FINISHES.map(f=>({value:f,label:W.FINISH_WORDS[f],title:{clean:'Crisp, restrained bloom, very little grain',cinematic:'Balanced depth, warm halation, subtle optical aberration',dreamlike:'Luminous, soft diffusion, richer separation'}[f]}))],
      onChange:v=>edit(d=>{d.finish=v||null;})});
    const music=select({label:'Music',value:w.music?.style||'',options:[{value:'',label:'The project’s own music'},...Object.entries(STYLE_NAMES).map(([value,label])=>({value,label:`${label} profile`}))],
      onChange:v=>edit(d=>{d.music=v?{...(d.music||{}),style:v}:null;})});
    const shape=button({label:'Shape',icon:'sliders',size:'sm',kind:'ghost',disabled:!w.music,title:'The performance profile this composition asks for',onClick:()=>openProfile(shape)});
    const rows=[row('Base',base),row('Finish',finish),row('Music',h('div',{class:'field-row'},music,shape))];
    compRefs={finish,music,shape,note:h('p',{class:'tiny faint ar-comp-note',text:compNote(w)})};
    if(w.base==='canvas'){compRefs.bg=colorInput({value:w.canvas.background,label:'Background',onChange:v=>edit(d=>{d.canvas.background=v;})});
      compRefs.hz=colorInput({value:w.canvas.horizon,label:'Horizon',onChange:v=>edit(d=>{d.canvas.horizon=v;})});
      rows.push(row('Canvas',h('div',{class:'field-row ar-canvas-colors'},compRefs.bg,compRefs.hz)));}
    compBody.append(...rows,compRefs.note);
  }
  const compNote=w=>w.music?'Applying sets the project’s music to this profile; its key, mode and motif stay its own.':'Layers are drawn inside the world’s own image, so the finish (bloom, halation, aberration) applies to them too.';
  const row=(label,control)=>h('div',{class:'ar-comp-row'},h('span',{class:'ar-comp-label small',text:label}),control);
  function changeBase(v){
    const w=session.work;if(!w||v===w.base)return;const lost=Object.keys(w.tuning).length;
    if(edit(d=>{d.base=v;d.tuning={};},{rebuild:true})&&lost)toast(`${count(lost,'world value')} of ${baseOf(w.base).name} were left behind: they belong to that world.`,'info');
  }
  function openProfile(anchor){
    const w=session.work;if(!w?.music)return;
    popover(anchor,()=>h('div',{class:'ar-profile'},h('div',{class:'menu-label eyebrow',text:`${STYLE_NAMES[w.music.style]} profile`}),
      ...MUSIC_PROFILE.map(([k,label,doc])=>{const s=slider({min:0,max:1,value:session.work.music?.profile?.[k]??.5,label,format:v=>`${Math.round(v*100)}`,onChange:v=>edit(d=>{d.music={...d.music,profile:{...(d.music?.profile||{}),[k]:v}};})});
        return field({label,control:s,doc});}),
      h('p',{class:'tiny faint',text:'Heard at the next bar while you preview. The Music Studio has every control.'})),{width:340});
  }
  // ---- Head, foot, chrome ------------------------------------------------------------------------------------------
  function renderHead(){
    const w=session.work,e=stored(),r=projectRecipe();
    nameInput.disabled=!w;if(document.activeElement!==nameInput)nameInput.value=w?.name||'';
    clear(headPills);if(!w)return;
    const origin=session.source?.kind==='starter'?`From the starter ${C.STARTERS.find(s=>s.id===session.source.id)?.name||''}`:session.source?.kind==='world'?`New on ${baseOf(session.source.family).name}`:
      session.source?.kind==='pack'?'A copy of an imported creation':session.source?.kind==='project'?'The composition on this project':null;
    if(e)headPills.append(pill(dirty()?`Version ${e.version} · unsaved changes`:`Saved · version ${e.version}`,dirty()?'warn':'ok',{plain:!dirty()}));
    else headPills.append(pill('Not saved yet','warn'));
    if(origin)headPills.append(h('span',{class:'tiny faint ar-origin',text:origin}));
    if(e&&r?.composition?.id===e.id)headPills.append(pill(json(r.composition)===json(e.composition)?'On this project':'On this project · an earlier version','accent',{plain:true}));
  }
  function renderFoot(){
    const w=session.work,b=w?C.budgetOf(w):null,used=b?.used||0,pct=Math.min(100,used/(C?.LIMITS.budget||100)*100);
    meter.setAttribute('aria-valuenow',String(Math.round(used)));meter.classList.toggle('warn',pct>80);meter.querySelector('i').style.width=`${pct}%`;
    text(meter.querySelector('.ar-budget-text'),w?`Budget ${Math.round(used)} / ${C.LIMITS.budget} · ${b.layers} of ${b.maxLayers} layers`:'Budget');
    meter.title='What the enabled layers cost to draw. The quality setting lowers counts on a slower machine; the budget keeps every composition within reach.';
    clear(status);
    const id=S.state.selected;
    if(!w)status.append(h('span',{class:'faint',text:'Nothing open'}));
    else if(previewError)status.append(h('span',{class:'danger',id:'arPreviewError',text:`Not previewed: ${previewError}`}));
    else if(!id)status.append(h('span',{class:'warn',text:'Select a project to preview on its real data'}));
    else if(busy||timer)status.append(h('strong',{class:'accent',text:'Previewing…'}));
    else if(previewing)status.append(h('strong',{class:'accent',text:'Preview'}),h('span',{class:'faint',text:` · this window only${dirty()||unsaved()?' · not saved':''}`}));
    else status.append(h('span',{class:'faint',text:'The stage shows the project’s saved look'}));
    const e=stored();
    saveBtn.disabled=!w||(!unsaved()&&!dirty());saveAsBtn.disabled=!w;cancelBtn.disabled=!w||(!dirty()&&!previewing);
    applyBtn.disabled=!w||!id||!!previewError||busy;dupBtn.disabled=!w;exportBtn.disabled=!w;revertBtn.disabled=!e||!e.history.length;
    saveBtn.classList.toggle('pending',!!w&&(unsaved()||dirty()));
  }
  function renderChrome(){
    clear(badge);clear(stageNote);
    if(previewing)badge.append(h('span',{class:'pill accent',id:'arBadge',text:'Preview · this window only'}),session.work?h('span',{class:'pill plain',text:session.work.name}):null);
    else badge.append(h('span',{class:'pill plain',id:'arBadge',text:'Saved look'}));
    if(localWorld)badge.append(h('span',{class:'pill plain',text:'Living world shown for the preview'}));
    const msg=P.state.preview?.notice||P.state.worldStatus?.notice;
    if(msg)stageNote.append(h('div',{class:'callout'},icon('info'),h('div',{class:'callout-body',text:msg})));
    else if(!S.state.selected)stageNote.append(h('div',{class:'callout'},icon('info'),h('div',{class:'callout-body',text:'Select a project: compositions are previewed on a project’s real structure and recorded events.'})));
  }
  function renderAll(){
    if(!alive||!C)return;
    const w=session.work;if(w&&session.selected!=='@base'&&!layerOf(w,session.selected))session.selected=topLayer()?.id||'@base';
    renderStack();renderInspector();renderMappings();renderComposition();renderFoot();renderChrome();renderHead();renderLibrary();
  }
  // ---- Routes: #/artist, #/artist/new/<starter>, #/artist/from/<family>, #/artist/edit/<id>, #/artist/project -------
  function consumeRoute(){
    if(!C)return;
    const [kind,arg]=wanted||[];
    if(kind==='edit'&&!S.state.compositions)return;
    if(kind==='project'&&!projectRecipe())return;
    const go=fn=>{wanted=null;history.replaceState(null,'',`${location.pathname}${location.search}#/artist`);void guard(fn);};
    if(kind==='new'){const s=C.STARTERS.find(x=>x.id===arg);if(s)go(()=>open({...copy(s),id:null},{kind:'starter',id:s.id}));else{wanted=null;toast('That starter does not exist.','warning');}return;}
    if(kind==='from'){if(BASES.some(b=>b.id===arg))go(()=>open(fromWorld(arg),{kind:'world',family:arg}));else wanted=null;return;}
    if(kind==='edit'){const e=S.composition(arg);if(e)go(()=>open(e.composition,{kind:'stored',id:e.id},{version:e.version}));else{wanted=null;toast('That composition is no longer in My creations.','warning');}return;}
    if(kind==='project'){const c=projectRecipe()?.composition;wanted=null;if(c)go(()=>open(c,c.id&&S.composition(c.id)?{kind:'stored',id:c.id}:{kind:'project'},{version:S.composition(c.id)?.version??null}));return;}
    // A plain visit: the working copy of this page, or else the composition last opened here.
    if(kind==='last'){if(session.work){wanted=null;return;}if(!S.state.compositions)return;wanted=null;
      const last=S.composition(S.state.ui.artistLast);if(last)open(last.composition,{kind:'stored',id:last.id},{version:last.version});return;}
    wanted=null;
  }
  // Another window saved the composition open here: adopted when there is nothing unsaved; otherwise Save will ask.
  function followLibrary(){
    if(session.source?.kind!=='stored')return;const e=S.composition(session.source.id);
    if(!e){toast('This composition was deleted in another window. Save keeps the copy open here as a new one.','warning');session.source={kind:'copy',from:null};renderAll();return;}
    if(e.version!==session.version&&!dirty()){session.version=e.version;session.work=byDepth(C.normalize(e.composition));session.baseline=json(session.work);session.opened=session.baseline;inspSig='';mapSig='';compSig='';renderAll();schedulePreview();}
  }
  // ---- Subscriptions --------------------------------------------------------------------------------------------------
  let projectId=S.state.selected;
  offs.push(S.on(t=>{
    if(!alive||!C)return;
    if(t.has('compositions')){followLibrary();renderLibrary();renderHead();renderFoot();if(wanted)consumeRoute();}
    if(t.has('selection')||t.has('project')){if(S.state.selected!==projectId){projectId=S.state.selected;baseRevision=null;if(session.work)schedulePreview(0);else renderFoot();}renderChrome();}
    if(t.has('recipe')){renderHead();renderLibrary();if(wanted)consumeRoute();if(session.selected==='@base'&&!previewing)inspSig='',renderInspector();}
    if(t.has('catalog')&&session.selected==='@base')renderInspector(true);
    if(t.has('packs')&&(session.tab||'mine')==='mine')renderLibrary();
    if(t.has('preview')||t.has('notice')||t.has('world'))renderChrome();
    // The store re-applies the saved stage on many events; a preview keeps the living world.
    if(previewing&&localWorld&&t.has('world')&&P.state.world!=='living')P.setWorld('living');
  }));
  if(!S.state.compositions)void S.loadCompositions();
  if(!S.state.catalog)void S.loadCatalog();
  renderFoot();renderChrome();
  // The model and its words are plain scripts (shared with the receiver): loaded once, then the studio is built.
  Promise.all([C?null:import('/composition.js'),W?null:import('/composition-text.js')]).then(()=>{
    if(!alive)return;C=globalThis.ResonanceComposition;W=globalThis.ResonanceCompositionText;
    if(session.work)session.work=C.normalize(session.work);
    renderAll();consumeRoute();if(session.work)schedulePreview(0);
  }).catch(e=>{inspector.replaceChildren(h('div',{class:'inspector-body'},callout({kind:'danger',icon:'warn',title:'The Artist Studio could not start',body:e.message})));});
  return {
    route(next){wanted=next?.length?next:['last'];consumeRoute();},
    unmount(){
      alive=false;clearTimeout(timer);
      if(previewing||P.state.preview){P.preview(null).catch(()=>{});S.setDraft(null);if(musicOn)S.previewMusic(null);if(localWorld)S.applyEffective({force:true});
        toast(dirty()||unsaved()?'The preview stopped when you left the Artist Studio. Your unsaved composition is still there when you come back.':'The preview stopped when you left the Artist Studio.','info');}
      for(const f of offs)f();
    }
  };
}};
// A composition's music becomes the project's music preferences: only the keys this receiver keeps for a project.
export async function applyMusicOf(S,c,id=S.state.selected){
  const m=c?.music,pm=S.preferences(id)?.music;if(!m||!pm)return;
  const patch={};if(m.style&&Object.hasOwn(pm,'style'))patch.style=m.style;
  for(const [k,v] of Object.entries(m.profile||{}))if(k!=='mix'&&Object.hasOwn(pm,k))patch[k]=v;
  if(m.profile?.mix&&Object.hasOwn(pm,'mix'))patch.mix={pad:1,bass:1,melody:1,counter:1,arp:1,perc:1,atmos:1,...m.profile.mix};
  if(Object.keys(patch).length)await S.savePreferences({music:patch},id);
}
// ---- Export: the saved composition as a data-only pack (.zip), its contents inspectable before it is downloaded ------
export async function exportDialog({S,id}){
  const e=S.composition(id);if(!e){toast('Save the composition first.','warning');return;}
  const ui=S.state.ui||{};
  const author=h('input',{class:'input',type:'text',maxlength:40,value:ui.artistAuthor||'',placeholder:'Your name or alias','aria-label':'Author',spellcheck:'false'});
  const license=select({label:'License',value:ui.artistLicense||'CC-BY-4.0',options:LICENSES.map(([value,label])=>({value,label}))});
  const desc=h('textarea',{class:'textarea ar-desc',maxlength:280,rows:2,'aria-label':'Description'});desc.value=e.composition.description||'';
  const summary=h('div',{class:'ar-export-summary'},h('p',{class:'faint small',text:'Preparing…'}));
  let pack=null,seq=0;
  async function refresh(){
    const mine=++seq;S.setUi({artistAuthor:author.value.trim(),artistLicense:license.value});
    try{const q=new URLSearchParams({id,author:author.value.trim(),license:license.value,description:desc.value});
      const r=await S.get(`/api/compositions/export?${q}`);if(mine!==seq)return;pack=r;
      const c=r.manifest.declarative.composition,maps=c.layers.reduce((n,l)=>n+l.mappings.length,0)+c.mappings.length;
      summary.replaceChildren(
        h('dl',{class:'kv'},h('dt',{text:'Pack'}),h('dd',{class:'mono',text:`${r.id} · v${r.version}`}),h('dt',{text:'Contains'}),h('dd',{text:`${count(c.layers.length,'layer')}, ${count(maps,'mapping')}${c.finish?`, the ${W_().FINISH_WORDS[c.finish]} finish`:''}${c.music?.style?`, a ${STYLE_NAMES[c.music.style]} music profile`:''}`}),
          h('dt',{text:'Files'}),h('dd',{text:r.files.map(f=>`${f.path} (${bytes(f.size)})`).join(' · ')})),
        callout({kind:'',icon:'shield',title:'Data only',body:'No code, nothing to approve. It never contains your projects, their files or paths, their identities, or anything about this computer.'}));
    }catch(err){if(mine===seq){pack=null;summary.replaceChildren(callout({kind:'danger',icon:'warn',title:'It cannot be exported',body:err.message}));}}
  }
  let t=null;const later=()=>{clearTimeout(t);t=setTimeout(refresh,250);};
  author.addEventListener('input',later);desc.addEventListener('input',later);license.addEventListener('change',later);
  const download=()=>{if(!pack)return false;
    const bytesOf=f=>Uint8Array.from(atob(f.data),ch=>ch.charCodeAt(0));
    const zip=zipStored(pack.files.map(f=>({name:`${pack.folder}/${f.path}`,data:bytesOf(f)})));
    const url=URL.createObjectURL(new Blob([zip],{type:'application/zip'})),a=h('a',{href:url,download:`${pack.folder}.zip`});
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);
    toast(`Exported ${pack.folder}.zip: anyone can import it in Visual Packs → Import a pack.`,'ok');return true;};
  modal({title:`Export “${e.composition.name}”`,subtitle:'A data-only visual pack another Code Resonance can import (Visual Packs → Import a pack).',wide:true,
    body:h('div',{class:'ar-dialog ar-export'},h('div',{class:'ar-export-fields'},field({label:'Author',control:author,doc:'Shown with the pack. Remembered on this device.'}),field({label:'License',control:license}),field({label:'Description',control:desc})),summary),
    actions:[{label:'Inspect contents',icon:'eye',onClick:()=>{if(pack)inspectPack(pack);return false;}},{label:'Close'},{label:'Download .zip',icon:'download',kind:'primary',id:'arExportZip',onClick:download}]});
  void refresh();
}
const W_=()=>globalThis.ResonanceCompositionText||{FINISH_WORDS:{}};
function inspectPack(pack){
  const text_=f=>new TextDecoder().decode(Uint8Array.from(atob(f.data),ch=>ch.charCodeAt(0)));
  const pre=h('pre',{class:'ar-inspect-pre'});let current=pack.files[0];
  const tabs=segmented({label:'File',value:current.path,options:pack.files.map(f=>({value:f.path,label:f.path})),onChange:v=>{current=pack.files.find(f=>f.path===v);pre.textContent=text_(current);}});
  pre.textContent=text_(current);
  modal({title:'Contents of the export',subtitle:`${pack.folder}/ · exactly what the .zip holds`,wide:true,body:h('div',{class:'ar-dialog'},tabs,pre),actions:[{label:'Close'}]});
}

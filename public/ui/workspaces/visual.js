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
import {WORLD_NAMES,LABEL_NAMES,QUALITY_NAMES,publicName,count} from '../format.js';
const FAMILIES=[
  {id:'stellar-forge',name:'Stellar Forge',line:'Gravity: star systems around hubs, agents as comets'},
  {id:'fractal-biosphere',name:'Fractal Biosphere',line:'Growth: organisms of many small parts'},
  {id:'machine-cathedral',name:'Machine Cathedral',line:'Engineering: an ordered, tested city'}];
const CLASSIC=[
  {id:'construct',icon:'grid',line:'The software as an illuminated architectural model (WebGL)'},
  {id:'nexus',icon:'globe',line:'Modules and links as a network (Canvas 2D)'},
  {id:'city',icon:'layers',line:'Modules as blocks of a city (Canvas 2D); the fallback without WebGL'},
  {id:'nebula',icon:'spark',line:'The same layout wound into a turning spiral (Canvas 2D)'}];
// Parameter groups (the first genome path segment) in the order an artist reads a world: its own parameters first.
const GROUPS=[['params','Pack parameters'],['uniforms','Look uniforms'],['geometry','Geometry'],['secondary','Secondary forms'],['space','Space'],['atmosphere','Atmosphere'],
  ['material','Materials'],['motion','Motion'],['camera','Camera'],['agents','Agents'],['palette','Palette'],['light','Light'],['music','Music response'],['technique','Rendering technique'],['limits','Limits']];
const GROUP_OF={agentProminence:'agents'};
// Technique values are multipliers the world host applies to the family's own grade (public/worlds/host.js
// withTechnique): absent means identity, so that is what an untouched control shows.
const TECHNIQUE_IDENTITY={'technique.exposure':1,'technique.bloom':1,'technique.contrast':1,'technique.saturation':1,'technique.vignette':1,'technique.grain':1,'technique.aberration':.004,'technique.tint':[1,1,1],'technique.lift':[0,0,0]};
const NAME=/^[\p{L}\p{N} .,'&()-]{1,40}$/u;
const NAME_RULE='Up to 40 letters, digits, spaces and . , \' & ( ) -';
const LABEL_DOCS={cinematic:'Titles and major moments only',explorer:'Click the world to inspect it',stream:'A lower third for streams (no private names)',off:'The world alone'};
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
  let presetPreview=null,wantedRoute=params?.length?params:null,nameOf=null,thumbRun=0;
  const presetErrors=new Map();
  // Subsystem names come from the same generator the worlds use (loaded with the world host, already cached by the engine).
  import('/worlds/host.js').then(m=>{nameOf=m.generatedName;if(alive)renderAliases(true);}).catch(e=>console.warn('Generated names unavailable',e));
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
  const note=t=>{text(browserNote,t);browserNote.title=t;};
  const cards=h('div',{class:'vs-cards scroll',role:'list'});
  const browser=h('section',{class:'vs-browser','aria-label':'World browser'},h('div',{class:'vs-browser-head'},tabs,browserNote,browserActions),cards);
  const main=h('div',{class:'main vs-main'},head,stageBox,browser);
  // Inspector
  const statePill=h('span',{class:'pill plain'});
  const inspTitle=h('h2',{class:'title-m vs-family'});
  const inspSub=h('div',{class:'vs-sub small muted'});
  const inspHead=h('div',{class:'inspector-head'},h('div',{class:'vs-insp-top'},h('span',{class:'eyebrow',text:'World DNA'}),statePill),inspTitle,inspSub);
  const body=h('div',{class:'inspector-body'});
  const footStatus=h('div',{class:'vs-foot-status small',role:'status','aria-live':'polite'});
  const cancelBtn=button({label:'Cancel',kind:'ghost',id:'vsCancel',onClick:()=>discard()});
  const applyBtn=button({label:'Apply',kind:'primary',icon:'check',id:'vsApply',onClick:()=>apply()});
  const foot=h('div',{class:'inspector-foot vs-foot'},footStatus,h('div',{class:'grow'}),cancelBtn,applyBtn);
  const inspector=h('aside',{class:'inspector vs-inspector','aria-label':'World DNA'},inspHead,body,foot);
  view.append(h('div',{class:'split ws-visual'},main,inspector));
  // Over the stage: what it shows (saved or preview) and why, when it shows something else than asked.
  const badge=h('div',{class:'vs-badge'}),stageNote=h('div',{class:'vs-stage-note',role:'status','aria-live':'polite'});
  const chromeLayer=h('div',{class:'vs-chrome chrome-pass'},badge,stageNote);
  chrome.append(chromeLayer);offs.push(()=>chromeLayer.remove());
  // ---- Inspector sections (built once per project; their contents update in place) ---------------------------------
  const identityBox=h('div',{class:'vs-identity'});
  const actAuto=button({label:'Automatic',icon:'spark',size:'sm',kind:'outline',id:'vsAutomatic',title:'Let the code choose the family again (the generated identity)',onClick:()=>chooseAutomatic()});
  const actRegen=button({label:'Regenerate',icon:'dice',size:'sm',kind:'outline',id:'vsRegenerate',title:'A new seeded draw from the same traits',onClick:()=>regenerate()});
  const actLock=button({label:'Lock',icon:'lock',size:'sm',kind:'outline',id:'vsLock',onClick:()=>toggleLock()});
  const actReset=button({label:'Reset customisations',icon:'reset',size:'sm',kind:'outline',id:'vsReset',title:'Every tuned parameter back to its generated value; spectacle and motion to 100 %',onClick:()=>resetCustom()});
  const identityActions=h('div',{class:'vs-actions'},actAuto,actRegen,actLock,actReset);
  const identityNote=h('div',{class:'vs-identity-note'});
  const lookSelect=select({id:'vsLook',label:'Look pack',options:[{value:'',label:'None'}],value:'',onChange:v=>chooseLook(v||null)});
  const lookField=field({label:'Look pack',control:lookSelect,doc:'A visual pack drawn over the family: its palette, light and rendering. A look with code runs only once approved.',labelFor:'vsLook'});
  const lookNone=h('p',{class:'small faint'});
  const lookBox=h('div',{class:'vs-look'},lookField,h('div',{class:'vs-look-empty'},lookNone,h('button',{type:'button',class:'link-btn small',onClick:()=>navigate('packs'),text:'Visual Packs'})));
  // The exact-value box carries the unit (it reads back "150 %" as 150), so the field needs no second read-out.
  const intensity=slider({min:0,max:200,integer:true,value:100,format:v=>`${v} %`,label:'Spectacle (%)',id:'vsIntensity',onInput:v=>setOverride('intensity',v/100,false),onChange:v=>setOverride('intensity',v/100,true)});
  const motion=slider({min:0,max:200,integer:true,value:100,format:v=>`${v} %`,label:'Motion (%)',id:'vsMotion',onInput:v=>setOverride('motion',v/100,false),onChange:v=>setOverride('motion',v/100,true)});
  const labels=segmented({label:'Information on the stage',id:'vsLabels',value:'cinematic',options:P.LABEL_MODES.map(m=>({value:m,label:LABEL_NAMES[m],title:LABEL_DOCS[m]})),onChange:m=>setOverride('labels',m===globalLabels()?null:m,true)});
  // Choosing the global default means following it (null), so a later change in Settings applies to this project again.
  function globalLabels(){return S.state.settings?.stage?.labels||'cinematic';}
  const fIntensity=field({label:'Spectacle',doc:'How strongly events are staged: 100 % is the identity as generated.',control:intensity,onReset:()=>setOverride('intensity',1,true)});
  const fMotion=field({label:'Motion',doc:'Camera and ambient movement.',control:motion,onReset:()=>setOverride('motion',1,true)});
  const fLabels=field({label:'Information',doc:'',control:labels});
  const paramsBox=h('div',{class:'vs-params'});
  const paramsSummary=h('div',{class:'small muted'});
  const titleInput=h('input',{class:'input',id:'vsTitleInput',type:'text',maxlength:40,autocomplete:'off',spellcheck:'false','aria-label':'Public title','aria-describedby':'vsTitleHelp'});
  const titleError=h('div',{class:'vs-error small',id:'vsTitleError',role:'alert'});
  const titleSave=button({label:'Save title',size:'sm',id:'vsTitleSave',onClick:()=>saveTitle()});
  const titleShown=h('div',{class:'small faint',id:'vsTitleHelp'});
  const aliasBox=h('div',{class:'vs-aliases',id:'vsAliases'});
  const quality=segmented({label:'Rendering quality on this device',id:'vsQuality',value:P.state.quality,options:P.QUALITY.map(q=>({value:q,label:QUALITY_NAMES[q]})),
    onChange:q=>{S.unpin('quality');S.setDevice({quality:q});P.setQuality(q);}});
  const sectionHead=(title,sub=null,...extra)=>h('div',{class:'vs-sec-head'},h('h3',{class:'eyebrow',text:title}),sub?h('span',{class:'tiny faint',text:sub}):null,h('span',{class:'rule'}),...extra);
  function buildInspector(){
    clear(body);
    if(!S.state.selected){body.append(emptyState({icon:'visual',title:S.state.projectsLoaded?'No project yet':'Loading projects…',body:S.state.projectsLoaded?'A project appears when capture starts in VS Code. Its world identity is edited here.':null,
      actions:S.state.projectsLoaded?[button({label:'How to connect',onClick:()=>navigate('connections')})]:[]}));return;}
    if(!saved){body.append(loadError?callout({kind:'danger',icon:'warn',title:'The identity could not be loaded',body:loadError,actions:[button({label:'Retry',size:'sm',onClick:()=>loadSaved()})]}):h('div',{class:'faint small',text:'Loading the identity…'}));return;}
    body.append(
      h('section',{class:'vs-sec'},identityBox,identityActions,identityNote),
      h('section',{class:'vs-sec'},sectionHead('Look','a visual pack over the family'),lookBox),
      h('section',{class:'vs-sec'},sectionHead('Presentation'),fIntensity,fMotion,fLabels),
      h('section',{class:'vs-sec'},sectionHead('Parameters','generated from the family\'s catalogue'),paramsSummary,paramsBox),
      h('section',{class:'vs-sec'},sectionHead('Public title'),
        h('div',{class:'field-row vs-input-row'},titleInput,titleSave),titleError,titleShown),
      h('section',{class:'vs-sec'},sectionHead('Subsystem names','shown in labels on the stage'),aliasBox),
      h('section',{class:'vs-sec'},sectionHead('Quality','this device only'),quality,h('div',{class:'field-doc',text:'Auto lowers the resolution only while frames are slow. Kept in this browser; other machines keep their own choice.'})));
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
    try{const r=await S.get(`/api/recipe/tunable?id=${enc(id)}`);if(!alive||id!==projectId)return;if(rev!==undefined&&r.revision<rev)return;savedSpec=r;renderParams();}
    catch(e){if(alive)text(paramsSummary,`The parameters could not be loaded: ${e.message}`);}
  }
  function resetProject(){
    const id=S.state.selected||'';if(id===projectId)return;
    if(pending()&&projectId){toast('The preview was discarded: another project was selected. Nothing was saved.','info');draft=emptyDraft();applyLocalStage(true);}
    projectId=id;saved=null;savedSpec=null;loadError='';draft=emptyDraft();lastGood=emptyDraft();candidate=null;candidateSpec=null;runtime=null;previewError=null;presetPreview=null;presetErrors.clear();
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
    const v=input.value.trim();
    if(v&&!NAME.test(v)){input.setAttribute('aria-invalid','true');text(err,NAME_RULE);input.focus();return;}
    try{const next=await P.recipeAction({type:'alias',id,name:v||null});delete input.dataset.dirty;await afterDirectSave(next);
      // The list is rebuilt with the saved name; the keyboard stays where it was.
      const refocus=aliasBox.contains(document.activeElement);renderAliases(true);if(refocus)aliasBox.querySelector(`[data-alias="${id}"]`)?.focus();
      toast(v?`Subsystem named “${v}”.`:'Name cleared: the generated name is used again.','ok');}
    catch(e){text(err,e.message);}
  }
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
    const bits=[s.familyKind==='pack'?'Pack world':'Built-in family',s.source==='user'?'chosen by you':'generated from the code',`variant ${(s.variant||0)+1}`];
    if(!candidate&&saved)bits.push(`revision ${saved.revision}`);
    text(inspSub,bits.join(' · '));
    renderIdentity();renderBadge();renderFoot();
  }
  function renderIdentity(){
    const s=shown();if(!s)return;clear(identityBox);
    const state=s.locked?['Locked','ok','Kept as it is: never re-derived from the code']:s.founded?['Permanent','plain','Founded: the project is large enough that this identity is never re-derived']:['Provisional','warn','Re-derived from the code until the project has 6 modules'];
    const look=s.pack?(packOf(s.pack.id)?.name||s.pack.id):null;
    identityBox.append(h('dl',{class:'kv vs-kv'},
      h('dt',{text:'Family'}),h('dd',{},h('strong',{text:s.familyName||familyName(s.family)}),s.source==='user'?' · chosen':' · generated'),
      h('dt',{text:'Look'}),h('dd',{text:look||'None'}),
      h('dt',{text:'State'}),h('dd',{},pill(state[0],state[1],{title:state[2]}),' ',h('span',{class:'small faint',text:state[2]})),
      h('dt',{text:'Customised'}),h('dd',{text:s.tuning?.values&&Object.keys(s.tuning.values).length?count(Object.keys(s.tuning.values).length,'parameter'):'No'}),
      h('dt',{text:'Saved'}),h('dd',{text:saved?`Revision ${saved.revision}${candidate?' (the preview is not saved)':''}`:'—'})));
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
    identityNote.append(h('p',{class:'small faint',text:'Customising a parameter locks the identity: it is never re-derived from the code afterwards. Reset customisations returns every value to the generated one.'}));
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
  // Parameters are generated from the tunable metadata; rebuilt only when the set of parameters changes.
  let paramSig='',paramFields=new Map();const openGroups=new Set();
  function renderParams(){
    const s=shown(),spec=shownSpec();
    if(!s||!spec){if(saved)text(paramsSummary,'Loading parameters…');return;}
    const sig=`${s.family}|${s.pack?.id||''}|${Object.keys(spec).join(',')}`;
    if(sig!==paramSig){paramSig=sig;paramFields=new Map();clear(paramsBox);
      const groups=new Map();
      for(const [path,sp] of Object.entries(spec)){const g=GROUP_OF[sp.group]||sp.group;if(!groups.has(g))groups.set(g,[]);groups.get(g).push([path,sp]);}
      const order=[...GROUPS.map(([g])=>g).filter(g=>groups.has(g)),...[...groups.keys()].filter(g=>!GROUPS.some(([x])=>x===g))];
      if(!openGroups.size)order.slice(0,2).forEach(g=>openGroups.add(g));
      for(const g of order){
        const fields=groups.get(g).map(([path,sp])=>paramField(path,sp,s));
        paramsBox.append(disclosure({summary:`${GROUPS.find(([x])=>x===g)?.[1]||humanize(g)}  ·  ${groups.get(g).length}`,open:openGroups.has(g),onToggle:o=>o?openGroups.add(g):openGroups.delete(g)},...fields));
      }
    }
    const tuned=s.tuning?.family===s.family?s.tuning:null;
    for(const [path,f] of paramFields){
      const v=valueOf(s,path,f.spec);
      if(!f.el.contains(document.activeElement))setControl(f.ctrl,f.spec,v);
      const mod=!!tuned&&Object.hasOwn(tuned.values,path);
      f.el.setModified(mod);f.el.classList.toggle('pending',Object.hasOwn(draft.tune,path));
      f.el.setValue(mod?`generated ${tuned.base[path]===null||tuned.base[path]===undefined?'not set':formatParam(f.spec,tuned.base[path])}`:getPath(s.genome,path)===undefined?'not set':'');
      text(f.err,previewError?.path===path?previewError.message:'');
    }
    const n=tuned?Object.keys(tuned.values).length:0;
    text(paramsSummary,`${count(Object.keys(spec).length,'parameter')} · ${n?`${n} customised`:'all as generated'}${candidate?' (in the preview)':''}`);
  }
  function valueOf(s,path,spec){const v=getPath(s.genome,path);if(v!==undefined)return v;if(Object.hasOwn(TECHNIQUE_IDENTITY,path))return TECHNIQUE_IDENTITY[path];
    return spec.type==='boolean'?false:spec.type==='enum'?spec.values?.[0]:spec.type==='color'?'#000000':spec.type==='vec3'?[spec.min,spec.min,spec.min]:spec.min;}
  function paramField(path,spec,s){
    const label=humanize(path.split('.').at(-1));
    const ctrl=parameterControl(spec,valueOf(s,path,spec),{label,onInput:v=>setTune(path,v,false),onChange:v=>setTune(path,v,true)});
    // The toolkit builds on/off switches without a visible label (the field shows it), so the input gets its name here.
    if(ctrl.input&&!ctrl.input.hasAttribute('aria-label'))ctrl.input.setAttribute('aria-label',label);
    const err=h('div',{class:'vs-error small',role:'alert'});
    const el=field({label,doc:spec.doc&&spec.doc!==path&&spec.doc.toLowerCase()!==label.toLowerCase()?spec.doc:null,control:h('div',{class:'vs-param-control'},ctrl,err),value:'',onReset:()=>setTune(path,null,true)});
    el.dataset.path=path;paramFields.set(path,{el,ctrl,spec,err});return el;
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
    const sig=groups?`${groups.map(g=>`${g.id}:${g.modules}`).join(',')}|${JSON.stringify(saved.aliases||{})}|${!!nameOf}`:'none';
    if(sig===aliasSig&&!force)return;
    if(aliasBox.contains(document.activeElement)&&!force)return;
    aliasSig=sig;clear(aliasBox);
    if(!groups){aliasBox.append(h('p',{class:'small faint',text:'Loading the project structure…'}));return;}
    if(!groups.length){aliasBox.append(h('p',{class:'small faint',text:'No subsystems yet: they appear as the project grows.'}));return;}
    aliasBox.append(h('p',{class:'small faint',text:'Each subsystem has a generated name that reveals nothing about the code. A name you give replaces it in the labels.'}));
    for(const g of groups){
      const gen=nameOf?nameOf(g.id):'…',alias=saved.aliases?.[g.id]||'';
      const input=h('input',{class:'input',type:'text',maxlength:40,value:alias,placeholder:gen,autocomplete:'off',spellcheck:'false','aria-label':`Name for ${gen}`,dataset:{alias:g.id}});
      const err=h('div',{class:'vs-error small',role:'alert'});
      input.addEventListener('input',()=>{input.dataset.dirty='1';const v=input.value.trim();input.setAttribute('aria-invalid',String(!!v&&!NAME.test(v)));text(err,v&&!NAME.test(v)?NAME_RULE:'');});
      input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void saveAlias(g.id,input,err);}else if(e.key==='Escape'&&input.dataset.dirty){e.preventDefault();input.value=alias;delete input.dataset.dirty;text(err,'');}});
      aliasBox.append(h('div',{class:'vs-alias'},
        h('div',{class:'vs-alias-head'},h('strong',{text:alias||gen}),alias?h('span',{class:'tiny faint',text:`generated: ${gen}`}):null,h('span',{class:'grow'}),
          h('span',{class:'tiny faint num',text:`${count(g.modules||0,'module')}${g.test?' · tests':''}`})),
        h('div',{class:'field-row vs-input-row'},input,button({icon:'check',size:'sm',attrs:{'aria-label':`Save the name of ${gen}`},title:'Save the name',onClick:()=>saveAlias(g.id,input,err)}),
          button({icon:'close',size:'sm',kind:'ghost',disabled:!alias,attrs:{'aria-label':`Clear the name of ${gen}`},title:'Use the generated name again',onClick:()=>{input.value='';return saveAlias(g.id,input,err);}})),err));
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
  }
  // A card: the picture (state chips over it) and the name; the whole card is one button.
  function card({id,title,line,media,pills=[],onChoose,active=false,disabled=false,choose='Preview',match=false}){
    const b=h('button',{type:'button',class:'vs-card-main',disabled,'aria-pressed':String(active),'aria-label':`${choose} ${title}`,onClick:onChoose},
      h('span',{class:'vs-thumb'},media,pills.length?h('span',{class:'vs-chips'},...pills):null,
        match?h('span',{class:'vs-match',title:'The code\'s match: the family this project\'s code scores highest for (the automatic choice)'},icon('star'),h('span',{class:'visually-hidden',text:'The code\'s match'})):null),
      h('span',{class:'vs-card-text'},h('strong',{text:title}),h('span',{class:'vs-card-line',text:line})));
    return h('div',{class:['vs-card',active?'active':''],role:'listitem',dataset:{card:id}},b);
  }
  const tile=(ic,caption,kind='')=>h('span',{class:'vs-thumb-media'},h('span',{class:['vs-thumb-tile',kind]},icon(ic)),h('span',{class:'vs-thumb-cap',text:caption}));
  // While a newer revision renders, the previous picture of this project stays (it is real, and says it is updating).
  function thumbMedia(fid){
    const url=THUMBS.get(`${projectId}:${saved?.revision}:${fid}`),older=THUMBS.get(`${projectId}:latest:${fid}`);
    if(url||url!==''&&older)return h('span',{class:'vs-thumb-media',dataset:{thumb:fid}},h('img',{src:url||older,alt:`${familyName(fid)}, rendered from this project`}),
      h('span',{class:'vs-thumb-cap',text:url?'Rendered from this project':'Rendered from this project · updating'}));
    const el=tile('visual',url===''?'No thumbnail on this device':'Rendering from this project…');el.dataset.thumb=fid;return el;
  }
  function renderLiving(){
    const s=saved;if(!s){cards.append(h('p',{class:'faint small vs-cards-empty',text:'Loading the identity…'}));return;}
    const previewFam=hasIdentity(draft)?candidate?.family:null,eff=savedWorld();
    const top=s.familyScores?Object.entries(s.familyScores).sort((a,b)=>b[1]-a[1])[0]?.[0]:null;
    note(eff==='living'?'':`This project's stage is ${WORLD_NAMES[eff]}: choosing a world shows the living world for the preview.`);
    browserActions.append(button({label:'Visual Packs',icon:'packs',size:'sm',kind:'ghost',onClick:()=>navigate('packs')}));
    for(const f of FAMILIES){
      const isSaved=s.family===f.id,prev=previewFam===f.id;
      cards.append(card({id:f.id,title:familyName(f.id),line:f.line,media:thumbMedia(f.id),active:prev||(!previewFam&&isSaved&&draft.world==='living'),
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
    note('Earlier stages, kept for comparison. They do not use the World DNA.');
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
    note('Reusable on every project. Previewing one changes nothing until you apply it.');
    const saveBtn=button({label:'Save as preset',icon:'save',size:'sm',id:'vsSavePreset',disabled:!saved||pending(),title:pending()?'Apply or cancel the preview first: a preset records the saved identity':'Save this project\'s saved identity as a reusable preset',onClick:()=>savePresetDialog()});
    browserActions.append(saveBtn);
    if(!S.state.presets){cards.append(h('p',{class:'faint small vs-cards-empty',text:S.state.errors?.presets?`Presets could not be loaded: ${S.state.errors.presets}`:'Loading presets…'}));return;}
    if(!list.length){cards.append(h('div',{class:'vs-cards-empty'},h('p',{class:'small muted',text:'No visual presets yet. Save the identity you like as a preset to reuse it on other projects.'})));return;}
    for(const p of list){
      const x=p.payload||{},n=Object.keys(x.tuning||{}).length,err=presetErrors.get(p.id),prev=presetPreview===p.id;
      const summary=[x.family?familyName(x.family):'Automatic family',x.look?(packOf(x.look)?.name||x.look):null,n?count(n,'parameter'):null,x.overrides?.intensity!==undefined&&x.overrides.intensity!==1?`Spectacle ${pct(x.overrides.intensity)}`:null].filter(Boolean).join(' · ');
      cards.append(h('div',{class:['vs-card','preset',prev?'active':''],role:'listitem',dataset:{preset:p.id}},
        h('div',{class:'vs-preset-body'},h('span',{class:'vs-preset-icon'},icon('star')),h('span',{class:'vs-card-text'},h('strong',{text:p.name}),h('span',{class:'vs-card-line',text:summary}))),
        err?h('div',{class:'vs-error small',text:err}):null,
        h('div',{class:'vs-card-foot'},prev?pill('Previewing','accent'):null,h('span',{class:'grow'}),
          button({label:'Preview',size:'sm',kind:'outline',icon:'eye',attrs:{'aria-label':`Preview the preset ${p.name}`},onClick:()=>previewPreset(p)}),
          button({icon:'doc',size:'sm',kind:'ghost',title:'Rename',attrs:{'aria-label':`Rename the preset ${p.name}`},onClick:()=>renamePreset(p)}),
          button({icon:'trash',size:'sm',kind:'ghost',title:'Delete',attrs:{'aria-label':`Delete the preset ${p.name}`},onClick:()=>deletePreset(p)}))));
    }
  }
  function renderAll(){
    if(!alive)return;
    renderHead();renderBrowser();
    if(!saved)return;
    renderLook();renderOverrides();renderParams();renderTitle();renderAliases();renderQuality();
  }
  // ---- Thumbnails: the built-in families rendered from this project, one at a time -----------------------------------
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

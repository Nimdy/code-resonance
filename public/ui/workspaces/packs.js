// Visual Packs: the library of installed packs, an inspector for one pack, the approval of code packs, import from a
// .zip or a folder (no terminal), and the way into making one's own. Everything shown comes from the receiver
// (GET /api/packs through the engine, the import report, the README as text); every action goes to it and the list
// refreshes from the change feed. Pack strings (names, descriptions, READMEs, file names) are untrusted: set as text.
// Approval is the one decision here that lets someone else's code run, so it is never a toggle: it shows who made the
// pack, the exact files, the digest the approval is bound to and what isolation cannot guarantee, and needs a click on
// "Allow this code".
import {h,text,button,segmented,disclosure,pill,callout,emptyState,kv,copyable,modal,confirmDialog,toast,styles,humanize} from '../dom.js';
import {icon} from '../icons.js';
import {dateTime,bytes,count} from '../format.js';
import {renderMarkdown,openDoc,DOCS} from '../markdown.js';
// The pack limits of engine/packs.js (LIMITS) and the receiver's import body limit, checked here first so a person is
// told at once, before anything is uploaded. The receiver checks again.
const LIMITS={files:64,fileBytes:1024*1024,totalBytes:8*1024*1024,archiveBytes:12*1024*1024};
const KIND={declarative:{label:'Declarative · data only',short:'Data only',code:false},shader:{label:'Shader · runs code',short:'Runs code',code:true},world:{label:'World · runs code',short:'Runs code',code:true}};
const kindOf=p=>KIND[p?.kind]||{label:`${humanize(p?.kind||'unknown')} · unknown kind`,short:'Unknown',code:!!p?.executable};
// What an approved code pack can reach, and what the browser cannot promise: the same facts as docs/packs/security.md
// and receiver/pack-import.js access() (the import report brings the receiver's own wording; installed packs use this).
const ACCESS=['Runs in a worker inside an isolated frame: no network, no access to the receiver, your files, your recordings or the player page.',
  'Receives only the privacy-safe performance view (salted ids, counts, timings): never file names, paths, source, prompts or the project\'s name.'];
const LIMITS_TEXT='Browsers cannot fully sandbox GPU shaders: a hostile or buggy shader can freeze or crash this tab or the graphics driver, and GPU timing can leak coarse information. A pack that hangs is stopped after 6 s but can keep a processor core busy a few seconds longer. Browser bugs remain possible. Allow only packs from authors you trust.';
const SDK_DOCS=['packs/README.md','packs/world-api.md','packs/manifest.md','packs/determinism.md','packs/performance.md','packs/security.md','packs/catalogue.md'];
// Transport-level refusals of an import (receiver/pack-import.js codes), in words.
const IMPORT_ERRORS={'invalid-archive':'This file is not a ZIP archive Code Resonance can read','unsafe-path':'The pack was refused because an entry is unsafe',
  'too-large':'The pack is too large','too-many-files':'The pack has too many files','changed':'The pack changed since it was shown; import it again to review the new files',
  'not-found':'This import is no longer waiting (imports expire after 30 minutes or when the receiver restarts); import the pack again',
  'pending-limit':'Too many imports are waiting for review','invalid-pack':'The pack has errors and cannot be installed','capability-required':'This window may not change the installation (it has no control permission); reload the page',
  'capability-expired':'This window\'s control permission expired; reload the page'};
const importMessage=e=>{const base=IMPORT_ERRORS[e.code]||(e.status===413?'The upload is larger than the receiver accepts (12 MB)':e.status===415?'The receiver expected a ZIP archive':null);
  if(!base)return e.message||'The import failed';return e.message&&e.message!==base&&!base.endsWith(e.message)?`${base}: ${e.message}`:base;};
const author=p=>p?.author?.name||'Not stated';
const cap=s=>{s=String(s||'stopped');return s.charAt(0).toUpperCase()+s.slice(1);};
const short=hash=>hash?`${hash.slice(0,12)}…`:'—';
const paletteOf=p=>p?.kind==='declarative'?Object.entries(p.parameters?.overrides||{}).filter(([k,v])=>k.startsWith('palette.')&&/^#[0-9a-f]{6}$/i.test(v)).map(([,v])=>v).slice(0,5):[];
// The library's approval column, in one place: the four states the inspector, the rows and the review agree on.
function approval(p){
  if(!p.ok)return {label:'Has problems',kind:'danger'};
  if(!p.executable)return {label:'Data only — no approval needed',kind:'plain'};
  return p.trusted?{label:'Approved',kind:'ok'}:{label:'Needs approval',kind:'warn'};
}
// Smooth scrolling only when motion is welcome: the app's own Reduce/Full setting first, then the system's.
const reduced=()=>{const m=document.documentElement.dataset.motion;return m==='reduce'||(m!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches);};
const usable=p=>p.ok&&p.compatible&&(!p.executable||p.trusted);
const reviewable=p=>p.executable&&p.ok&&p.compatible&&!p.trusted;
// The library filters: every one is a question a person asks of a growing library (what is waiting for me, what runs code).
const FILTERS=[{value:'all',label:'All',test:()=>true},{value:'review',label:'Needs approval',test:p=>reviewable(p)},
  {value:'code',label:'Runs code',test:p=>!!p.executable},{value:'data',label:'Data only',test:p=>!p.executable},{value:'problems',label:'Has problems',test:p=>!p.ok,optional:true}];
export default {mount(view,{store,player:P,navigate,params}){
  styles('packs');
  const offs=[];let selected=params[0]||'',loaded=false,listKey='',inspectKey='',filter='all',filterKey='',hiddenKey='';const readmes=new Map();
  // ---- Layout ------------------------------------------------------------------------------------------------
  // The page: the library (a column per fact a person compares) above the way into making a pack; the inspector beside
  // it holds one pack's identity, approval, actions and contents.
  const summary=h('p',{class:'muted',id:'pkSummary'});
  const importBtn=button({label:'Import a pack',icon:'upload',kind:'primary',id:'pkImportBtn',onClick:()=>openImport()});
  const creatorBtn=button({label:'Make your own',icon:'code',kind:'ghost',onClick:()=>{creator.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});creator.querySelector('button')?.focus({preventScroll:true});}});
  const banner=h('div',{class:'pk-banner'});
  const filterHolder=h('div',{class:'pk-filter'});
  const list=h('ul',{class:'pk-list',id:'pkList','aria-label':'Installed visual packs'});
  // Column labels for sighted readers; each row's own text already names every value for a screen reader.
  const cols=h('div',{class:'pk-cols','aria-hidden':'true'},h('span',{}),h('span',{text:'Pack'}),h('span',{text:'Kind'}),h('span',{text:'Approval'}),h('span',{text:'Use'}),h('span',{class:'pk-col-date',text:'Installed'}));
  // A live region that is always there (an un-hidden one is often not announced); only its content changes.
  const hiddenNote=h('div',{class:'pk-hidden-live',role:'status'});
  const library=h('section',{class:'panel pk-library','aria-labelledby':'pkLibraryTitle'},
    h('div',{class:'panel-head'},h('div',{class:'grow'},h('h2',{id:'pkLibraryTitle',text:'Library'}),h('span',{class:'note',text:'Installed on this computer'})),filterHolder),
    hiddenNote,cols,list);
  const creator=buildCreator();
  const page=h('div',{class:'page'},h('div',{class:'page-inner'},
    h('header',{class:'page-head'},h('div',{class:'grow'},h('span',{class:'eyebrow',text:'Visual Pack SDK'}),h('h1',{class:'title-l',text:'Visual Packs'}),summary),h('div',{class:'actions'},creatorBtn,importBtn)),
    banner,library,creator));
  const inspector=h('aside',{class:'inspector pk-inspector','aria-label':'Pack details'});
  view.append(h('div',{class:'split ws-packs'},h('div',{class:'main'},page),inspector));
  // ---- Library ------------------------------------------------------------------------------------------------
  const packs=()=>[...(P.state.packs||[])].sort((a,b)=>String(a.name).localeCompare(String(b.name))||String(a.id).localeCompare(String(b.id)));
  const current=()=>packs().find(p=>p.id===selected)||null;
  // The pack the inspector shows: the one named, or with none named the first (as renderInspector chooses).
  const inspected=()=>current()||(params[0]?null:packs()[0]||null);
  // A signature of what the views show: the engine re-reads the list every 15 s, and an unchanged list must not
  // rebuild the inspector under the reader (or close the README they opened).
  const sig=p=>p?[p.id,p.name,p.version,p.digest,p.trusted,p.ok,p.compatible,p.usedBy,p.problems?.join('|'),p.installedAt].join('\u0001'):'';
  function context(){const s=P.state,w=s.worldStatus||{},r=s.recipe;
    return {stopped:w.stopped||null,running:w.remote&&w.pack?w.pack.id:null,here:new Set([r?.familyKind==='pack'?r.family:null,r?.pack?.id].filter(Boolean)),sdk:store.state.status?.sdk||null};}
  function renderSummary(){
    const all=P.state.packs||[];
    if(!loaded&&!all.length){text(summary,'Reading the installed packs…');return;}
    const need=all.filter(reviewable).length,bad=all.filter(p=>!p.ok).length;
    // One primary action per view: with nothing installed, the empty state's Import is it.
    importBtn.classList.toggle('primary',all.length>0||!loaded);
    text(summary,all.length?[count(all.length,'pack'),'installed',need?`· ${need} awaiting approval`:'',bad?`· ${bad} with problems`:''].filter(Boolean).join(' '):'Packs change how a project looks: new worlds, shaders and tuned looks, made by you or by people you trust.');
  }
  function renderBanner(){
    const c=context();banner.replaceChildren();
    if(P.state.receiver===false)banner.append(callout({kind:'danger',icon:'warn',title:'The receiver is not answering',body:'The list below is the last one received. Start it again with npm start; this page reconnects by itself.'}));
    if(c.stopped)banner.append(stoppedCallout(c.stopped,'pkRetry'));
  }
  function stoppedCallout(st,elId=null){
    return callout({kind:'warn',icon:'warn',title:`${st.name} stopped`,body:`${cap(st.reason)}. The stage shows the identity without it; nothing restarts on its own.`,
      actions:[button({label:'Retry',icon:'refresh',size:'sm',id:elId,onClick:()=>{if(!P.retryPack())toast('There is nothing to retry: the pack is no longer stopped.','info');}})]});
  }
  // The filter shows its counts; it is rebuilt only when they change, never when a person picks a filter (so focus on
  // it survives a refresh of the list, and arrowing through the filters keeps the focus on them).
  function renderFilter(all){
    const shown=FILTERS.filter(f=>!f.optional||all.some(f.test));
    // No control is drawn for fewer than two packs, so no filter may stay in force unseen.
    if(all.length<2||!shown.some(f=>f.value===filter))filter='all';
    const empty=shown.filter(f=>!all.some(f.test)).map(f=>f.value);
    // An empty group stays choosable only while it is the one shown; that is part of what is drawn.
    const key=all.length<2?'':shown.map(f=>`${f.value}:${all.filter(f.test).length}`).join(',')+`|${empty.includes(filter)?filter:''}`;
    if(key===filterKey){filterHolder.querySelector('.segmented')?.set(filter);return;}
    filterKey=key;
    // The counts changed under someone using the filter: the rebuilt one takes their focus back.
    const focused=filterHolder.contains(document.activeElement);
    if(!key){filterHolder.replaceChildren();return;}
    filterHolder.replaceChildren(segmented({label:'Show packs',value:filter,id:'pkFilter',
      options:shown.map(f=>{const n=all.filter(f.test).length;return {value:f.value,label:`${f.label} · ${n}`,disabled:!n&&f.value!==filter,title:n?null:'No installed pack is in this group'};}),onChange:v=>{filter=v;renderFilter(packs());renderList(true);}}));
    if(focused)filterHolder.querySelector('[aria-checked="true"]')?.focus();
  }
  // The pack in the inspector may be one the filter hides: said above the rows, with the way back to it.
  function renderHidden(){
    const p=inspected(),test=(FILTERS.find(f=>f.value===filter)||FILTERS[0]).test;
    // Not when nothing matches at all (the list says that itself), and redrawn only when it changes (a live region).
    const key=!p||filter==='all'||test(p)||!packs().some(test)?'':`${p.id}\u0001${p.name}`;
    if(key===hiddenKey)return;hiddenKey=key;
    if(!key){hiddenNote.replaceChildren();return;}
    hiddenNote.replaceChildren(h('div',{class:'pk-hidden-note'},icon('info'),h('span',{},h('strong',{text:p.name}),h('span',{class:'faint',text:', shown in the details, is not in this filter.'})),
      button({label:'Show all',size:'sm',kind:'ghost',onClick:()=>{filter='all';renderFilter(packs());renderList(true);
        // The note is gone: the focus goes to the pack it named (or the first row).
        focusRow();}})));
  }
  function renderList(force=false){
    const all=packs(),c=context();
    renderFilter(all);renderHidden();
    // After renderFilter, which may have reset the filter.
    const key=all.map(sig).join('\n')+`|${loaded}|${c.running}|${[...c.here]}|${c.sdk}|${filter}|${store.state.catalog?1:0}`;
    if(!force&&key===listKey)return;listKey=key;
    list.replaceChildren();cols.hidden=!all.length;
    if(!all.length){list.append(h('li',{},loaded?emptyState({icon:'packs',title:'No visual packs installed',
      body:'A pack gives a project a new world, a shader look or a tuned look of a built-in world. Import one you made or one from someone you trust (a .zip or a folder); nothing is downloaded from the internet.',
      actions:[button({label:'Import a pack',icon:'upload',kind:'primary',onClick:()=>openImport()}),button({label:'Read the SDK guide',icon:'doc',onClick:()=>openDoc('packs/README.md')})]}):h('div',{class:'pk-loading faint',text:'Reading the installed packs…'})));return;}
    const test=(FILTERS.find(f=>f.value===filter)||FILTERS[0]).test,shown=all.filter(test);
    if(!shown.length)list.append(h('li',{class:'pk-nomatch'},h('span',{class:'faint',text:'No installed pack matches this filter.'}),
      button({label:'Show all',size:'sm',kind:'ghost',onClick:()=>{filter='all';renderFilter(packs());renderList(true);
        // The button is gone with the message: the focus goes to the filter it changed (or, with none drawn, a row).
        const f=filterHolder.querySelector('[aria-checked="true"]');if(f)f.focus();else focusRow();}})));
    const marked=inspected()?.id;
    for(const p of shown){
      const k=kindOf(p),a=approval(p);
      const row=h('button',{type:'button',class:['pk-row',k.code?'code':'data'],dataset:{id:p.id},'aria-current':p.id===marked?'true':null},
        glyphOf(p),
        h('strong',{class:'pk-row-title ellipsis',text:p.name}),
        h('span',{class:'pk-row-by faint ellipsis'},h('span',{class:'num',text:`v${p.version}`}),` · by ${author(p)}`),
        p.description?h('span',{class:'pk-row-desc',text:p.description}):null,
        h('span',{class:'pk-row-kind'},h('span',{class:['pk-kind',k.code?'code':''],text:k.label}),h('span',{class:'faint small ellipsis',text:baseLine(p)})),
        h('span',{class:'pk-row-state'},pill(a.label,a.kind,{plain:a.kind==='plain'}),c.running===p.id?pill('On the stage','accent',{title:'Running on the stage now'}):null),
        h('span',{class:'pk-row-use small',text:p.usedBy?`Used by ${count(p.usedBy,'project')}`:'Not used yet'}),
        h('span',{class:'pk-row-date small faint num',text:p.installedAt?new Date(p.installedAt).toLocaleDateString([],{year:'numeric',month:'short',day:'numeric'}):'—'}));
      row.addEventListener('click',()=>select(p.id,true));
      row.addEventListener('keydown',e=>{const step={ArrowDown:1,ArrowUp:-1,Home:-Infinity,End:Infinity}[e.key];if(!step)return;e.preventDefault();
        const rows=[...list.querySelectorAll('.pk-row')],i=rows.indexOf(row),next=rows[Math.max(0,Math.min(rows.length-1,i+step))];next?.focus();next?.click();});
      list.append(h('li',{},row));
    }
  }
  function focusRow(){(list.querySelector('.pk-row[aria-current="true"]')||list.querySelector('.pk-row'))?.focus();}
  // The glyph: a data pack shows its own palette when it sets one; a code pack the code mark.
  function glyphOf(p,large=false){
    const k=kindOf(p),swatches=paletteOf(p);
    return h('span',{class:['pk-glyph',k.code?'code':'data',large?'lg':''],'aria-hidden':'true'},swatches.length?h('span',{class:'pk-swatches'},...swatches.map(c=>{const s=h('i');s.style.background=c;return s;})):icon(k.code?'code':'layers'));
  }
  // What a pack changes: the built-in world it is drawn on, or a world of its own.
  function baseLine(p){if(p.kind==='world')return 'A world family of its own';return p.base?`On ${baseName(p.base)}`:'';}
  function select(id,fromUser=false){
    selected=id||'';for(const r of list.querySelectorAll('.pk-row'))r.setAttribute('aria-current',String(r.dataset.id===selected));
    renderInspector(true);renderHidden();
    // Narrow windows stack the inspector under the library: bring it into view, or a choice would seem to do nothing.
    if(fromUser&&matchMedia('(max-width: 900px)').matches)inspector.scrollIntoView({block:'start',behavior:reduced()?'auto':'smooth'});
    // The address names the pack (a bookmark, Back/Forward); the route handler then finds it already shown.
    if(fromUser&&location.hash!==`#/packs/${encodeURIComponent(selected)}`)navigate('packs',selected);
  }
  // ---- Inspector --------------------------------------------------------------------------------------------------
  // The head ties together who the pack is, where it stands (approval, the stage, this project) and what can be done
  // with it; the body holds what it is made of: approval detail, facts, parameters, files and digest, README.
  function renderInspector(force=false){
    let p=current();
    // Nothing chosen (or the chosen pack was removed): the first pack, without changing the address.
    if(!p&&!params[0]&&packs().length){p=packs()[0];selected=p.id;}
    const c=context(),mine=!!(p&&c.stopped&&c.stopped.id===p.id),key=`${sig(p)}|${mine?c.stopped.reason:''}|${c.running===p?.id}|${c.here.has(p?.id)}|${c.sdk}|${store.state.catalog?1:0}`;
    if(!force&&key===inspectKey)return;inspectKey=key;
    inspector.replaceChildren();
    if(!p){inspector.append(h('div',{class:'inspector-body'},h('div',{class:'pk-none'},icon('packs'),h('p',{class:'muted',text:!packs().length?(loaded?'Nothing is installed yet. An imported pack shows its files, approval and parameters here.':'Reading the installed packs…'):selected?'This pack is no longer installed.':'Choose a pack to see its files, approval and parameters.'}))));return;}
    for(const r of list.querySelectorAll('.pk-row'))r.setAttribute('aria-current',String(r.dataset.id===p.id));
    const k=kindOf(p),a=approval(p);
    const actions=h('div',{class:'pk-actions'});
    if(reviewable(p))actions.append(button({label:'Review & approve',icon:'shield-check',kind:'primary',id:'pkReviewBtn',onClick:()=>openReview(p)}));
    else actions.append(button({label:'Use it',icon:'visual',kind:usable(p)?'primary':'',id:'pkUseBtn',disabled:!usable(p),
      title:usable(p)?(p.kind==='world'?'Open Visual Studio with this world for the selected project (a preview until you save)':'Open Visual Studio with this look for the selected project (a preview until you save)'):'It has problems and cannot be used',onClick:()=>use(p)}));
    actions.append(h('span',{class:'grow'}));
    if(p.executable&&p.trusted)actions.append(button({label:'Revoke',icon:'shield',kind:'ghost',size:'sm',id:'pkRevokeBtn',title:'Withdraw the approval: it stops at once',onClick:()=>revoke(p)}));
    actions.append(button({label:'Remove',icon:'trash',kind:'danger',size:'sm',id:'pkRemoveBtn',onClick:()=>remove(p)}));
    // The standing sits beside the glyph, under the name, and the id keeps to one line (the version always shows; a long
    // id is shortened, whole in its tooltip): on a laptop the head leaves most of the height to the body.
    const idLine=`${p.id} · v${p.version}`;
    const head=h('div',{class:'inspector-head pk-head'},
      h('div',{class:'pk-ident'},glyphOf(p,true),h('div',{class:'pk-ident-text'},
        h('span',{class:['eyebrow','pk-kind',k.code?'code':''],text:k.label}),
        h('h2',{class:'title-l pk-name',text:p.name}),
        h('div',{class:'faint small mono pk-id',title:idLine},h('span',{class:'pk-id-name',text:p.id}),h('span',{class:'pk-id-ver',text:`\u00a0· v${p.version}`})),
        h('div',{class:'pk-pills'},pill(a.label,a.kind,{plain:a.kind==='plain'}),c.running===p.id?pill('On the stage now','accent'):null,mine?pill('Stopped','warn',{title:`${cap(c.stopped.reason)}. Retry from the notice above the library.`}):null,c.here.has(p.id)?pill('Used by this project','',{plain:true}):null))),
      actions);
    const body=h('div',{class:'inspector-body'});
    if(!p.ok)body.append(callout({kind:'danger',icon:'warn',title:'It cannot run or be approved',body:h('div',{},
      h('ul',{class:'pk-problems'},...(p.problems||[]).map(x=>h('li',{text:x}))),
      h('p',{text:'Import the pack again to restore its files, or remove it. Projects that use it show their identity without it meanwhile.'}))}));
    else if(reviewable(p))body.append(callout({kind:'warn',icon:'shield',title:'Not approved: it will not run',body:'It contains code. Review who made it and its exact files, then allow it with Review & approve. Until then a project that uses it shows its identity without it.'}));
    // What an approval is bound to, said where the approval is shown.
    else if(p.executable&&p.trusted)body.append(h('div',{class:'pk-approved'},icon('shield-check'),h('div',{},h('strong',{text:'Approved for these exact files'}),
      h('p',{class:'faint small'},'Bound to digest ',h('code',{title:p.digest||'',text:short(p.digest)}),': a change to any file withdraws it.'))));
    if(p.description)body.append(h('p',{class:'pk-desc',text:p.description}));
    const base=p.base?baseName(p.base):null,b=p.budget;
    body.append(facts([['Author',author(p)],base?[p.kind==='world'?'Family':'Built on',base]:p.kind==='world'?['Family','Its own world']:null,
      ['SDK',sdkLine(p,c.sdk)],['Used by',p.usedBy?count(p.usedBy,'project'):'No project yet'],
      ['Installed',dateTime(p.installedAt)],['License',p.license||'Not stated'],
      b?['Budget',[b.drawCalls&&`${b.drawCalls} draw calls`,b.triangles&&`${Math.round(b.triangles/1000)}k triangles`,b.points&&`${Math.round(b.points/1000)}k points`,b.updateMs&&`${b.updateMs} ms update`].filter(Boolean).join(' · '),'wide']:null].filter(Boolean)));
    body.append(parametersBlock(p)||'');
    const total=(p.files||[]).reduce((n,f)=>n+f.size,0);
    body.append(disclosure({summary:`Files · ${(p.files||[]).length} · ${bytes(total)}`,open:(p.files||[]).length<=6},filesTable(p.files||[]),
      h('div',{class:'pk-digest'},h('span',{class:'eyebrow',text:'Digest (SHA-256 of every file)'}),copyable(p.digest||'—',{label:'Copy'}))));
    if(p.readme){const holder=h('div',{class:'pk-readme'},h('p',{class:'faint small',text:'Loading…'}));
      body.append(disclosure({summary:'README',open:true},h('div',{class:'tiny faint',text:'Written by the pack\'s author; shown as text.'}),holder));void loadReadme(p,holder);}
    inspector.append(head,body);
  }
  // Facts as a grid of labelled values (as many columns as the inspector's width holds; long ones take the whole row).
  function facts(rows){
    return h('dl',{class:'pk-facts'},...rows.map(([label,value,wide])=>h('div',{class:['pk-fact',wide?'wide':'']},h('dt',{text:label}),h('dd',{},value instanceof Node?value:String(value??'—')))));
  }
  const baseName=id=>store.state.catalog?.families?.[id]?.name||store.state.catalog?.packFamilies?.[id]?.name||packs().find(p=>p.id===id)?.name||humanize(id);
  function sdkLine(p,sdk){const need=p.sdk||'not stated';
    if(!p.compatible)return h('span',{class:'danger',text:`${need} · not compatible${sdk?` with SDK ${sdk}`:''}`});
    return `${need} · compatible${sdk?` with SDK ${sdk}`:''}`;}
  async function loadReadme(p,holder){
    const key=`${p.id}@${p.digest}`;
    try{if(!readmes.has(key))readmes.set(key,await store.getText(`/api/packs/readme?id=${encodeURIComponent(p.id)}`));
      const md=renderMarkdown(readmes.get(key),{onDoc:path=>openDoc(path)});
      // The author's web links show where each one goes beside its text (public/ui/markdown.js), so a label cannot pose as
      // another address.
      holder.replaceChildren(md);}
    catch(e){readmes.delete(key);holder.replaceChildren(h('p',{class:'faint small',text:`The README could not be read (${e.message}).`}));}
  }
  // The values the pack declares: a world's parameters and a shader's uniforms (what a project may tune), or the
  // values a declarative pack sets on its base family.
  function parametersBlock(p){
    const prm=p.parameters||{};
    if(p.kind==='declarative'){const o=Object.entries(prm.overrides||{});if(!o.length)return null;
      return disclosure({summary:`Sets ${count(o.length,'value')} on ${baseName(p.base)}`,open:true},h('div',{class:'pk-table-wrap'},h('table',{class:'pk-table'},
        h('thead',{},h('tr',{},h('th',{text:'Parameter'}),h('th',{text:'Value'}))),
        h('tbody',{},...o.map(([k,v])=>h('tr',{},h('td',{class:'mono',text:k}),h('td',{},valueOf(v))))))));}
    const specs=Object.entries(prm).filter(([k])=>/^(?:params|uniforms)\./.test(k));
    if(!specs.length)return p.ok?h('p',{class:'faint small',text:'It declares no parameters to tune.'}):null;
    return disclosure({summary:`${p.kind==='shader'?'Uniforms':'Parameters'} · ${specs.length} a project can tune`,open:true},h('div',{class:'pk-params'},...specs.map(([k,s])=>{
      const name=k.split('.').slice(1).join('.');
      return h('div',{class:'pk-param'},h('div',{class:'pk-param-head'},h('strong',{text:humanize(name)}),h('span',{class:'num faint',text:range(s)})),
        s.doc&&s.doc!==name?h('div',{class:'faint small',text:s.doc}):null);})));
  }
  const range=s=>s.type==='enum'?(s.values||[]).map(v=>humanize(v)).join(' · '):s.type==='boolean'?'on / off':s.type==='color'?'colour':s.type==='vec3'?`3 × ${s.min}–${s.max}`:`${s.type==='integer'?'integer ':''}${s.min} – ${s.max}`;
  function valueOf(v){
    if(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)){const sw=h('i',{class:'pk-swatch'});sw.style.background=v;return h('span',{class:'pk-color'},sw,h('span',{class:'mono',text:v}));}
    if(Array.isArray(v))return h('span',{class:'mono',text:v.length===2&&v.every(Number.isFinite)?`${v[0]} – ${v[1]} (drawn per project)`:v.join(', ')});
    return h('span',{class:'mono',text:typeof v==='boolean'?(v?'on':'off'):humanize(v)});
  }
  function filesTable(files){
    return h('div',{class:'pk-table-wrap'},h('table',{class:'pk-table pk-files'},
      h('thead',{},h('tr',{},h('th',{text:'File'}),h('th',{class:'r',text:'Size'}),h('th',{text:'SHA-256'}))),
      h('tbody',{},...files.map(f=>h('tr',{},h('td',{class:'mono',text:f.path}),h('td',{class:'r num',text:bytes(f.size)}),h('td',{class:'mono faint',title:f.sha256,text:short(f.sha256)}))))));
  }
  // ---- Actions ----------------------------------------------------------------------------------------------------
  function use(p){navigate('visual',p.kind==='world'?'family':'look',p.id);}
  // The approval dialog: identity, exact files, digest, access, limits; "Allow this code" approves exactly this digest.
  function openReview(p){
    const fresh=(P.state.packs||[]).find(x=>x.id===p.id)||p;
    if(!reviewable(fresh)){toast(fresh.trusted?`${fresh.name} is already approved.`:`${fresh.name} cannot be approved: ${fresh.problems?.[0]||'it is not usable'}.`,'info');return;}
    const k=kindOf(fresh),total=(fresh.files||[]).reduce((n,f)=>n+f.size,0);
    const body=h('div',{class:'pk-review pk-two'},h('div',{class:'pk-two-a'},
      h('div',{class:'pk-review-id'},h('span',{class:['pk-glyph','code'],'aria-hidden':'true'},icon('code')),
        h('div',{},h('strong',{text:fresh.name}),h('div',{class:'faint small mono',text:`${fresh.id} · v${fresh.version}`}))),
      kv([['Author',author(fresh)],['Kind',k.label],['License',fresh.license||'Not stated'],['SDK',`${fresh.sdk||'not stated'} · compatible`]]),
      fresh.description?h('p',{class:'muted small',text:fresh.description}):null,
      h('div',{class:'pk-review-block'},h('span',{class:'eyebrow',text:'What it can reach'}),h('ul',{class:'pk-access'},...ACCESS.map(x=>h('li',{text:x})))),
      callout({kind:'warn',icon:'warn',title:'What isolation cannot guarantee',body:LIMITS_TEXT})),
      h('div',{class:'pk-two-b'},
      h('div',{class:'pk-review-block'},h('span',{class:'eyebrow',text:`The exact files · ${(fresh.files||[]).length} · ${bytes(total)}`}),filesTable(fresh.files||[])),
      h('div',{class:'pk-review-block'},h('span',{class:'eyebrow',text:'Digest'}),h('code',{class:'pk-digest-full',id:'pkReviewDigest',text:fresh.digest}),
        h('p',{class:'faint small',text:'The approval is bound to this digest: any change to any of these files needs a new approval.'}))));
    const allow=button({label:'Allow this code',icon:'shield-check',kind:'primary',id:'pkAllowBtn',onClick:async()=>{
      try{await P.setTrust(fresh,true);dlg.close();toast(`${fresh.name} is approved for these exact files.`,'ok');}
      catch(e){toast(`Not approved: ${e.message}`,'error');}}});
    const dlg=modal({title:`Allow ${fresh.name} to run?`,subtitle:'Visual pack with code',body,wide:true,label:`Review ${fresh.name}`,
      actions:[button({label:'Cancel',onClick:()=>dlg.close()}),allow]});
    dlg.dialog.classList.add('ws-packs-dialog');
    // The safe answer has the focus (Enter or Space on arrival never approves).
    requestAnimationFrame(()=>dlg.dialog.querySelector('.modal-foot .btn')?.focus());
  }
  async function revoke(p){
    const ok=await confirmDialog({title:`Revoke the approval of ${p.name}?`,confirm:'Revoke',kind:'danger',
      body:h('div',{class:'pk-confirm'},h('p',{text:'If it is running on the stage, it stops at once. Projects that use it keep their identity and show it without the pack.'}),
        h('p',{class:'faint',text:'To run it again you will review and approve its files again.'}))});
    if(!ok)return;
    try{await P.setTrust(p,false);toast(`${p.name} is no longer approved.`,'ok');}catch(e){toast(`Could not revoke: ${e.message}`,'error');}
  }
  async function remove(p){
    const used=p.usedBy||0;
    const ok=await confirmDialog({title:`Remove ${p.name}?`,confirm:'Remove',kind:'danger',
      body:h('div',{class:'pk-confirm'},h('p',{text:used?`${count(used,'project')} ${used===1?'uses':'use'} it. ${used===1?'It keeps its':'They keep their'} identity and ${used===1?'shows':'show'} it without the pack (the recipe still names it, so importing it again brings it back).`:'No project uses it.'}),
        p.executable&&p.trusted?h('p',{class:'faint',text:'Its approval is removed too.'}):null)});
    if(!ok)return;
    try{await P.api.post('/api/packs/remove',{id:p.id});await P.reloadPacks();toast(`${p.name} was removed.`,'ok');if(selected===p.id)navigate('packs');}
    catch(e){toast(`Could not remove it: ${e.message}`,'error');}
  }
  // ---- Import -------------------------------------------------------------------------------------------------------
  function openImport(){
    let pending=null,installed=null;
    const zipInput=h('input',{type:'file',accept:'.zip,application/zip',id:'pkZipInput',class:'visually-hidden',tabindex:'-1','aria-hidden':'true'});
    const folderInput=h('input',{type:'file',webkitdirectory:true,multiple:true,id:'pkFolderInput',class:'visually-hidden',tabindex:'-1','aria-hidden':'true'});
    const choose=(label,sub,ic,input,elId)=>{const b=h('button',{type:'button',class:'pk-source',id:elId},icon(ic),h('span',{},h('strong',{text:label}),h('span',{class:'faint small',text:sub})));b.addEventListener('click',()=>{input.value='';input.click();});return b;};
    const sources=h('div',{class:'pk-sources'},choose('Choose a .zip','A pack zipped with or without its folder · up to 12 MB','upload',zipInput,'pkChooseZip'),
      choose('Choose a folder','A pack folder, the one with pack.json in it','folder',folderInput,'pkChooseFolder'));
    const intro=h('div',{class:'pk-import-intro'},sources,h('p',{class:'faint small',text:`Nothing is installed until you have seen what the pack contains. Limits: ${LIMITS.files} files, 1 MB each, 8 MB in total. Packs come only from your own files: there is no download from the internet.`}),zipInput,folderInput);
    const status=h('div',{class:'pk-import-status',role:'status','aria-live':'polite'});
    const out=h('div',{class:'pk-import-out'});
    const discardBtn=button({label:'Discard',kind:'ghost',id:'pkDiscardBtn',onClick:async()=>{await discard();reset();}});
    const installBtn=button({label:'Install',icon:'download',kind:'primary',id:'pkInstallBtn',onClick:()=>install()});
    const closeBtn=button({label:'Close',id:'pkImportClose',onClick:()=>dlg.close()});
    const extra=h('span',{class:'pk-foot-extra'});
    const dlg=modal({title:'Import a visual pack',subtitle:'From a .zip archive or a folder on this computer',wide:true,body:h('div',{class:'pk-import'},intro,status,out),
      actions:[extra,closeBtn,discardBtn,installBtn],onClose:()=>{if(pending&&!installed)void discard();}});
    dlg.dialog.classList.add('ws-packs-dialog');
    const foot=()=>{discardBtn.hidden=!pending||!!installed;installBtn.hidden=!pending||!!installed;
      installBtn.disabled=!pending||!!pending.errors?.length;closeBtn.hidden=!!pending&&!installed;};
    function reset(){pending=null;installed=null;intro.hidden=false;out.replaceChildren();text(status,'');extra.replaceChildren();foot();}
    function fail(message,detail=null){out.replaceChildren(callout({kind:'danger',icon:'warn',title:message,body:detail}));}
    async function discard(){const id=pending?.importId;pending=null;if(!id)return;try{await P.api.post('/api/packs/discard',{importId:id});}catch{}}
    foot();
    zipInput.addEventListener('change',()=>{const f=zipInput.files?.[0];if(f)void fromZip(f);});
    folderInput.addEventListener('change',()=>{const fs=[...(folderInput.files||[])];if(fs.length)void fromFolder(fs);});
    async function fromZip(file){
      out.replaceChildren();
      if(!/\.zip$/i.test(file.name)&&!/zip/.test(file.type))return fail('Choose a .zip file',`“${file.name}” is not a ZIP archive. To import a folder, use Choose a folder.`);
      if(!file.size)return fail('This file is empty');
      if(file.size>LIMITS.archiveBytes)return fail('The archive is too large',`${bytes(file.size)}; an archive may be at most 12 MB (a pack at most 8 MB unpacked).`);
      await submit(`Checking ${file.name}…`,async()=>P.api.post('/api/packs/import',await file.arrayBuffer(),{type:'application/zip'}));
    }
    async function fromFolder(files){
      out.replaceChildren();
      // Hidden entries (.git, .DS_Store, editor state) are never part of a pack: left out here, and said so. The chosen
      // folder's own name (the first segment) does not count.
      const hidden=files.filter(f=>(f.webkitRelativePath||f.name).split('/').slice(f.webkitRelativePath?1:0).some(s=>s.startsWith('.')));
      const kept=files.filter(f=>!hidden.includes(f)),total=kept.reduce((n,f)=>n+f.size,0);
      if(!kept.length)return fail('This folder has no files to import');
      if(kept.length>LIMITS.files)return fail('Too many files',`This folder has ${kept.length} files${hidden.length?` (not counting ${hidden.length} hidden)`:''}; a pack has at most ${LIMITS.files}. Choose the pack's own folder, the one with pack.json in it.`);
      const big=kept.find(f=>f.size>LIMITS.fileBytes);if(big)return fail('A file is too large',`${big.webkitRelativePath||big.name} is ${bytes(big.size)}; each file may be at most 1 MB.`);
      if(total>LIMITS.totalBytes)return fail('The folder is too large',`${bytes(total)}; a pack may be at most 8 MB in total.`);
      await submit(`Reading ${count(kept.length,'file')}…`,async()=>{
        const list=[];for(const f of kept)list.push({path:f.webkitRelativePath||f.name,data:await base64(f)});
        text(status,'Checking the pack…');return P.api.post('/api/packs/import',{files:list});},hidden.length);
    }
    async function submit(message,run,hidden=0){
      text(status,message);intro.hidden=true;sources.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{pending=await run();text(status,'');showReport(pending,hidden);}
      catch(e){text(status,'');intro.hidden=false;fail(importMessage(e),e.data?.report?null:'Nothing was installed.');}
      finally{sources.querySelectorAll('button').forEach(b=>b.disabled=false);foot();}
    }
    function showReport(r,hidden){
      const m=r.manifest||{},k=KIND[m.kind],code=!!r.executable,errors=r.errors||[],warnings=[...(r.warnings||[])];
      if(hidden)warnings.unshift(`${count(hidden,'hidden file')} (such as .git or .DS_Store) left out by this page`);
      // A data pack has no approval to keep or lose (the registry reports it as trusted).
      const total=(r.files||[]).reduce((n,f)=>n+f.size,0),inst=r.installed;
      const replaces=inst?callout({kind:inst.digest===r.digest?'':'accent',icon:'refresh',title:`Replaces the installed version ${inst.version}`,
        body:inst.digest===r.digest?`The files are identical to the installed ones${code&&inst.trusted?': its approval is kept':''}.`:`The files differ from the installed ones${code&&inst.trusted?': its approval will be withdrawn, and it will need a new review':''}.`}):null;
      out.replaceChildren(h('div',{class:'pk-report',id:'pkReport'},
        h('div',{class:'pk-report-head'},h('span',{class:['pk-glyph',code?'code':'data'],'aria-hidden':'true'},icon(code?'code':'layers')),
          h('div',{class:'grow'},h('strong',{class:'pk-report-name',text:m.name||'Unnamed pack'}),h('div',{class:'faint small mono',text:[m.id||'no id',m.version?`v${m.version}`:null].filter(Boolean).join(' · ')})),
          h('div',{class:'pk-pills'},m.kind?pill(k?k.label:humanize(m.kind),code?'code':'',{plain:!code}):null,errors.length?pill(count(errors.length,'error'),'danger'):pill('No errors','ok'))),
        h('div',{class:'pk-two'},h('div',{class:'pk-two-a'},
        kv([['Author',m.author?.name||'Not stated'],['Kind',k?k.label:m.kind?humanize(m.kind):'Unknown (pack.json could not be read)'],['SDK',m.sdk||'Not stated'],['License',m.license||'Not stated']]),
        m.description?h('p',{class:'muted small',text:m.description}):null,
        errors.length?callout({kind:'danger',icon:'warn',title:'It cannot be installed',body:h('ul',{class:'pk-errors',id:'pkReportErrors'},...errors.map(e=>h('li',{},h('code',{text:e.at}),' ',h('span',{text:e.message}))))}):null,
        replaces,
        r.access?h('div',{class:'pk-review-block'},h('span',{class:'eyebrow',text:code?'Contains code':'Data only'}),h('p',{class:'small',text:r.access.summary}),
          r.access.notes?.length?h('ul',{class:'pk-access'},...r.access.notes.map(x=>h('li',{text:x}))):null):null,
        warnings.length?h('div',{class:'pk-review-block'},h('span',{class:'eyebrow',text:'Warnings'}),h('ul',{class:'pk-warnings'},...warnings.map(x=>h('li',{class:'small',text:x})))):null,
        code&&!errors.length?h('p',{class:'faint small',text:'Installing does not approve it: it will not run until you review and allow its files.'}):null),
        h('div',{class:'pk-two-b'},
        h('div',{class:'pk-review-block'},h('span',{class:'eyebrow',text:`Files · ${(r.files||[]).length} · ${bytes(total)}`}),filesTable(r.files||[])),
        h('div',{class:'pk-review-block'},h('span',{class:'eyebrow',text:'Digest'}),h('code',{class:'pk-digest-full',text:r.digest||'—'}))))));
      installBtn.disabled=!!errors.length;
      out.querySelector('.pk-report')?.scrollIntoView({block:'start'});
    }
    async function install(){
      if(!pending)return;const r=pending;
      try{installed=await P.api.post('/api/packs/install',{importId:r.importId,digest:r.digest});}
      catch(e){if(e.data?.report){pending=e.data.report;showReport(pending,0);}else if(e.code==='not-found'){pending=null;}
        toast(importMessage(e),'error');foot();return;}
      pending=null;await P.reloadPacks();
      const p=(P.state.packs||[]).find(x=>x.id===installed.id)||installed,code=!!p.executable;
      out.replaceChildren(h('div',{class:'pk-installed',id:'pkInstalled'},
        code&&!p.trusted?callout({kind:'warn',icon:'shield',title:`${p.name} is installed but NOT approved`,body:'It contains code and will not run until you review its files and allow them.'})
          :callout({kind:'accent',icon:'check',title:`${p.name} is installed`,body:code?'Its files are identical to the version you approved before, so its approval is kept.':'It contains no code and is ready to use.'})));
      extra.replaceChildren(code&&!p.trusted?button({label:'Review & approve',icon:'shield-check',kind:'primary',id:'pkInstalledReview',onClick:()=>{dlg.close();openReview(p);}})
        :button({label:'Use it',icon:'visual',kind:'primary',id:'pkInstalledUse',onClick:()=>{dlg.close();use(p);}}));
      foot();text(status,'');select(p.id,true);
    }
  }
  async function base64(file){const b=new Uint8Array(await file.arrayBuffer());let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s);}
  // ---- Creator corner -----------------------------------------------------------------------------------------------
  function docButton(d,sub=null){const b=h('button',{type:'button',class:['pk-doc',sub?'lead':'']},icon('doc'),
    sub?h('span',{},h('strong',{text:DOCS[d]||d}),h('span',{class:'faint small',text:sub})):h('span',{text:DOCS[d]||d}));b.addEventListener('click',()=>openDoc(d));return b;}
  function buildCreator(){
    const templates=h('div',{class:'pk-templates'},h('p',{class:'faint small',text:'Loading the starter templates…'}));
    const checks=h('div',{class:'pk-checks'});
    // Three parts: what to read (the overview leads, the six references in an even grid, so none is left alone on a line),
    // a template per kind, and the checks a pack must pass. Stacked in that order; on a very wide page the reading and the
    // checks share a column beside the templates, which keep the width their commands need to stay on one line.
    const el=h('section',{class:'panel pk-creator',id:'pkCreator','aria-labelledby':'pkCreatorTitle'},
      h('div',{class:'panel-head'},h('div',{class:'grow'},h('h2',{id:'pkCreatorTitle',text:'Make your own pack'}),h('span',{class:'note',text:'SDK guides, starter templates and the checks a pack must pass'}))),
      h('div',{class:'panel-body pk-creator-body'},
        h('div',{class:'pk-creator-col pk-creator-read'},h('span',{class:'eyebrow',text:'Read'}),
          h('div',{class:'pk-docs'},docButton(SDK_DOCS[0],'Start here: the three kinds of pack, the quick start, what a world receives'),
            h('div',{class:'pk-docs-ref'},...SDK_DOCS.slice(1).map(d=>docButton(d))))),
        h('div',{class:'pk-creator-col pk-creator-make'},h('span',{class:'eyebrow',text:'Start from a template'}),templates),
        h('div',{class:'pk-creator-col pk-creator-check'},checks)));
    store.get('/api/packs/templates').then(t=>{
      const about={declarative:'Tune a built-in world with data only: parameters, palette, light, effect mapping. No approval needed.',
        shader:'GLSL background and post passes on a built-in family. Runs code: approved before it runs.',world:'A complete world family in JavaScript and GLSL, through the World API. Runs code: approved before it runs.'};
      templates.replaceChildren(...(t.templates||[]).map(x=>h('div',{class:['pk-template',KIND[x.kind]?.code?'code':'data']},
        h('div',{class:'pk-template-about'},h('strong',{class:['pk-kind',KIND[x.kind]?.code?'code':''],text:KIND[x.kind]?.label||humanize(x.kind)}),h('p',{class:'faint small',text:about[x.kind]||''})),
        h('div',{class:'pk-template-cmd'},copyable(x.command),h('div',{class:'tiny faint mono ellipsis',title:(x.files||[]).join(', '),text:`${x.dir}/ · ${(x.files||[]).join(' · ')}`})))));
      checks.replaceChildren(h('div',{class:'pk-check'},h('span',{class:'eyebrow',text:'Check it'}),copyable(t.validate)),h('div',{class:'pk-check'},h('span',{class:'eyebrow',text:'Test it in a real browser'}),copyable(t.test)),
        h('p',{class:'faint small',text:'Run these in a terminal at the Code Resonance folder (replace <dir> with your pack\'s folder; the test needs cd qualification && npm ci once). Then import the folder here: Import a pack → Choose a folder.'}));
    }).catch(e=>templates.replaceChildren(h('p',{class:'faint small',text:`The templates could not be listed (${e.message}).`})));
    return el;
  }
  // ---- Wiring -----------------------------------------------------------------------------------------------------
  function renderAll(force=false){renderSummary();renderBanner();renderList(force);renderInspector(force);}
  renderAll(true);
  P.reloadPacks().then(()=>{loaded=true;renderAll();});
  if(!store.state.catalog)void store.loadCatalog();
  offs.push(store.on(t=>{
    if(t.has('packs')||t.has('status')){loaded=true;renderSummary();renderList();renderInspector();}
    if(t.has('catalog'))renderInspector();
    if(t.has('notice')||t.has('world')||t.has('receiver')||t.has('recipe')){renderBanner();renderList();renderInspector();}
  }));
  return {unmount(){for(const f of offs)f();},route(next){params=next;if((next[0]||'')!==selected||!current()){selected=next[0]||'';renderList(true);renderInspector(true);}}};
}};

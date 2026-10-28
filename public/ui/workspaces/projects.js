// Projects: every project the receiver knows, and one project in depth — what was observed (statistics, timeline,
// agents, validation outcomes), what can be taken away (exports) and where its configuration comes from. Everything
// shown is read from the receiver; unknown stays unknown. Names are private workspace names (the folder name the
// extension shared): they are labelled as such and never reach the Stage.
import {h,text,clear,button,pill,callout,emptyState,kv,toast,popover,menuItem,styles} from '../dom.js';
import {icon} from '../icons.js';
import {ago,clockTime,dateTime,duration,count,projectName,STYLE_NAMES,WORLD_NAMES,LABEL_NAMES} from '../format.js';
import {PROFILE_KEYS,scoreOf} from '../music-profile.js';
import {privateName} from '../../providers.js';
// ---- Capture state, honestly (shared with Home) --------------------------------------------------------------------
// The extension announces capture start and stop, but not VS Code closing: "started" is only trusted while editor
// activity keeps arriving. Historical events are never proof that capture runs now.
export const LIVE_MS=120000;
export const when=ts=>!Number.isFinite(ts)||ts<=0?'—':new Date(ts).toDateString()===new Date().toDateString()?clockTime(ts):dateTime(ts);
// The Control Center is private: it names an uncatalogued agent by the id it reported. Public surfaces use presence().
export const providerName=privateName;
// ev: the compact evidence of /api/projects; full: the /api/evidence document when loaded (adds start/stop times).
export function capture(ev,full=null,now=Date.now()){
  if(full?.building)full=null;
  const ed=full?.editor||null,c=ed?.capture||null,state=c?.state??ev?.editor?.state??null,lastAt=ed?.lastAt??ev?.editor?.at??null;
  if(!ev&&!full)return {key:'none',tone:'unknown',label:'Nothing received',line:'Nothing has been received for this project yet'};
  if(!state)return {key:'unknown',tone:'unknown',label:'No VS Code capture',line:'No VS Code capture observed for this project'};
  if(state==='stopped'){const t=c?.stoppedAt??lastAt;return {key:'stopped',tone:'plain',label:'Capture stopped',line:`Capture stopped at ${when(t)}`};}
  if(Number.isFinite(lastAt)&&now-lastAt<LIVE_MS)return {key:'running',tone:'ok',label:'Capture running',line:`VS Code capture running · editor activity ${ago(lastAt,now)}`};
  return {key:'quiet',tone:'unknown',label:'Capture state unknown',
    line:`${c?.startedAt?`Started at ${when(c.startedAt)}`:'Capture started'}; no activity since ${when(lastAt)} — VS Code may be idle or closed (the extension does not report closing)`};
}
export const lastActivity=p=>p?.evidence?.lastReceivedAt||p?.updatedAt||null;
export const isDemo=p=>!!p?.evidence?.demonstration;
export const DEMO_LABEL='Demonstration (fictional)';
// The command title exactly as the extension contributes it (extension/package.json).
export const START_CMD='CODE RESONANCE: Start Code Performance';
export function familyLine(r){
  if(!r)return 'Not generated yet';
  return [r.source==='user'?'Chosen':'Generated',r.locked?'Locked':null].filter(Boolean).join(' · ');
}
// Polls until a condition holds (the engine announces no "replay ready" event of its own).
const until=(f,ms)=>new Promise((resolve,reject)=>{const t0=Date.now();const tick=()=>{let ok=false;try{ok=f();}catch{}if(ok)return resolve();if(Date.now()-t0>ms)return reject(new Error('timed out'));setTimeout(tick,50);};tick();});
// Replay from a moment: the project becomes active, the engine loads its whole recorded performance, then seeks.
export async function replayFrom({store:S,player:P,navigate},id,ts){
  if(S.state.selected!==id)S.select(id);
  // Selecting while already in replay reloads that project's replay by itself; otherwise switch modes.
  if(P.state.mode!=='replay')P.setMode('replay');
  try{await until(()=>{const s=P.state;return s.project===id&&s.mode==='replay'&&s.position.loaded;},20000);}
  catch{toast('The recorded performance could not be loaded for replay. Is the receiver running?','error');return false;}
  // The engine seeks to the beginning just after loading; seek after that.
  await new Promise(r=>setTimeout(r,80));
  const {start,end}=P.state.position;
  if(!start||!end){toast('Nothing has been recorded for this project yet, so there is nothing to replay.','warning');return false;}
  const at=Math.min(end,Math.max(start,ts));P.seek(at);
  navigate('stage');
  toast(`Replay paused at ${when(at)}. Press Play (or Space) to continue.`,'info');
  return true;
}
// ---- Intent meanings for the timeline (engine/intents.js TYPES) ------------------------------------------------
const LANES=[{id:'sessions',label:'Sessions'},{id:'structure',label:'Structure'},{id:'agents',label:'Agents'},{id:'outcomes',label:'Outcomes'}];
const OUTCOME={'validation.failed':'failed','validation.passed':'passed','validation.recovered':'recovered','refactor.validated':'passed','milestone.achieved':'milestone','repository.checkpoint':'checkpoint','world.expanded':'chapter'};
const STRUCTURE=new Set(['module.created','module.removed','module.renamed','subsystem.created','subsystem.connected','structure.created','structure.modified','structure.removed','structure.linked']);
const humanList=a=>(a||[]).map(x=>String(x).replace(/-/g,' ')).join(', ');
function meaning(i){
  const d=i.detail||{},cat=d.category?`${d.category.charAt(0).toUpperCase()}${d.category.slice(1)}`:'Validation';
  switch(i.type){
    case 'validation.failed':return `${cat} failed`;
    case 'validation.passed':return `${cat} passed`;
    case 'validation.recovered':return `${cat} recovered${d.repaired?` · ${count(d.repaired,'file')} repaired`:''}`;
    case 'refactor.validated':return 'Refactor validated by tests';
    case 'milestone.achieved':return `Milestone${d.kinds?.length?`: ${humanList(d.kinds)}`:''}`;
    case 'repository.checkpoint':return 'Commit observed';
    case 'world.expanded':return `Chapter ${d.chapter??'?'} began`;
    case 'agent.state':return `${providerName(d.provider)} · ${d.state||'active'}${d.activity?` (${d.activity})`:''}`;
    case 'agent.collision':return `${(d.providers||[]).map(providerName).join(' · ')} · collision`;
    default:return i.type.replace(/\./g,' ').replace(/^./,c=>c.toUpperCase());
  }
}
// ---- The workspace -----------------------------------------------------------------------------------------------
// Two layouts. On a desktop screen (WIDE) the project browser stays beside the project it shows: the one in the address,
// or, on #/projects, the active project. Moving between projects then keeps the list, its filter and its scroll; only the
// project beside it is rebuilt. On a narrower screen #/projects is a full-width table and #/projects/<id> the project.
const WIDE_QUERY='(min-width:1400px)';
const COLUMNS=[['name','Project'],['cap','Capture'],['last','Last activity'],['ident','Visual identity'],['world','World'],['music','Music'],['agents','Agents'],['events','Events']];
const PRIVACY='Names are private workspace names: they never appear on the Stage, in the OBS view or in recordings.';
const hm=ts=>new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
// A list cell's date: the time today, else the day and time (the year only when it is not this year).
const whenShort=ts=>!Number.isFinite(ts)||ts<=0?'—':new Date(ts).toDateString()===new Date().toDateString()?clockTime(ts):
  new Date(ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',...(new Date(ts).getFullYear()===new Date().getFullYear()?{}:{year:'numeric'})});
const day=ts=>new Date(ts).toDateString()===new Date().toDateString()?'Today':new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});
// The list filter survives leaving and coming back during this visit, but is never written to browser storage: what is
// typed may be a private name.
let filterText='';
export default {mount(view,ctx){
  styles('projects');
  const {store:S,player:P,navigate}=ctx;const offs=[];
  // Earlier builds kept the filter in browser storage; it is removed there (see filterText).
  if('projectsFilter' in S.state.ui)S.setUi({projectsFilter:undefined});
  const inner=h('div',{class:'page-inner'}),page=h('div',{class:'page ws-projects'},inner);view.append(page);
  const wide=matchMedia(WIDE_QUERY);
  let params=ctx.params,layout=null,browser=null,detail=null,detailId=null,detailHost=null;
  const known=id=>!!id&&S.state.projects.some(p=>p.id===id);
  const byRecent=()=>[...S.state.projects].sort((a,b)=>(lastActivity(b)||0)-(lastActivity(a)||0));
  // The project shown beside the browser on #/projects: the active one, else the one already shown, else the most recent.
  function defaultShown(){
    if(!S.state.projectsLoaded)return null;
    if(known(S.state.selected))return S.state.selected;
    if(known(detailId))return detailId;
    return byRecent()[0]?.id||null;
  }
  function plan(){
    const id=params?.[0]||null,shown=id||(wide.matches?defaultShown():null);
    return {layout:wide.matches&&shown?'md':id?'detail':'table',shown};
  }
  function showDetail(id,host,opts){detail?.destroy();detailId=id;clear(host);detail=buildDetail(id,host,opts);}
  function apply(focus){
    const {layout:L,shown}=plan();
    // A project chosen in the browser beside the detail keeps focus in the browser, as in a mail client: the person goes on
    // browsing with the arrow keys, and a live region says which project is now shown beside the list.
    const fromBrowser=L==='md'&&layout==='md'&&!!document.activeElement?.closest?.('.proj-master');
    if(L==='md'&&layout==='md'){
      browser.setCurrent(shown);
      if(shown!==detailId){showDetail(shown,detailHost,{back:false});page.scrollTop=0;}
      if(focus&&fromBrowser){browser.announce(shown);return;}
    }else{
      detail?.destroy();detail=null;detailId=null;browser=null;clear(inner);page.scrollTop=0;layout=L;page.dataset.layout=L;
      if(L==='table')browser=buildBrowser(inner,{master:false});
      else if(L==='detail'){detailHost=inner;showDetail(shown,inner,{back:true});}
      else{
        const master=h('aside',{class:'panel proj-master','aria-label':'Project browser'});detailHost=h('div',{class:'proj-detail-host'});
        inner.append(h('div',{class:'proj-md'},master,detailHost));
        browser=buildBrowser(master,{master:true});browser.setCurrent(shown);showDetail(shown,detailHost,{back:false});
      }
    }
    // An in-place route change moves focus to the new heading, as a full view change does.
    if(focus){const h1=inner.querySelector('h1');if(h1){h1.tabIndex=-1;h1.focus({preventScroll:true});}}
  }
  function route(next){params=next;apply(next!==ctx.params);}
  // ---- Browser: a table on its own, a column of compact rows beside a project (the same rows, styled by the layout) --
  function buildBrowser(host,{master}){
    const filter=h('input',{class:'input',type:'search',placeholder:'Filter by name, title or identity',value:filterText,'aria-label':'Filter projects',id:'projectFilter',spellcheck:'false',autocomplete:'off'});
    const count_=h('span',{class:'faint small num proj-count'});
    const rows=h('nav',{class:'proj-rows','aria-label':'Projects'});
    const live=h('span',{class:'visually-hidden',role:'status','aria-live':'polite'});
    let current=null;
    if(master){
      host.append(h('div',{class:'proj-master-head'},h('div',{class:'proj-master-title'},h('h2',{text:'Projects'}),count_),filter),
        h('div',{class:'proj-master-rows'},rows),h('p',{class:'proj-master-foot faint tiny',text:PRIVACY}),live);
    }else{
      host.append(
        h('div',{class:'page-head'},h('div',{class:'grow'},h('span',{class:'eyebrow',text:'Control Center'}),h('h1',{class:'title-l',text:'Projects'}),
          h('p',{class:'muted small measure',text:`Every project this receiver has received events for, most recent first. ${PRIVACY}`})),
          h('div',{class:'actions proj-filter'},filter,count_)),
        h('div',{class:'panel proj-table'},h('div',{class:'proj-head','aria-hidden':'true'},...COLUMNS.map(([k,t])=>h('span',{class:`eyebrow c-${k}`,text:t}))),rows));
    }
    filter.addEventListener('input',()=>{filterText=filter.value;render();});
    // Arrow keys move between rows (Tab leaves the list); Enter follows the focused row.
    rows.addEventListener('keydown',e=>{
      const items=[...rows.querySelectorAll('a.proj-row')],i=items.indexOf(document.activeElement);if(i<0)return;
      const j=e.key==='ArrowDown'?i+1:e.key==='ArrowUp'?i-1:e.key==='Home'?0:e.key==='End'?items.length-1:null;
      if(j===null)return;e.preventDefault();items[Math.max(0,Math.min(items.length-1,j))].focus();});
    function render(){
      const q=filter.value.trim().toLowerCase(),all=byRecent();
      const shown=all.filter(p=>!q||[projectName(p),p.id,p.recipe?.title,p.recipe?.familyName,isDemo(p)?DEMO_LABEL:''].some(s=>String(s||'').toLowerCase().includes(q)));
      text(count_,all.length?(q?`${shown.length} of ${all.length}`:count(all.length,'project')):'');
      const focusKey=rows.contains(document.activeElement)?document.activeElement.dataset.id:null;
      if(!S.state.projectsLoaded){rows.replaceChildren(h('div',{class:'proj-empty muted small',text:S.state.errors.projects?`The receiver could not list projects: ${S.state.errors.projects}`:'Loading projects…'}));return;}
      if(!all.length){rows.replaceChildren(emptyState({icon:'projects',title:'No projects yet',body:`A project appears here as soon as the receiver gets its first events: start capture in VS Code (${START_CMD}), or connect an agent such as Claude Code.`,
        actions:[button({label:'How to connect',icon:'connections',kind:'primary',onClick:()=>navigate('connections')}),button({label:'Setup guide',icon:'home',onClick:()=>navigate('home')})]}));return;}
      if(!shown.length){rows.replaceChildren(emptyState({icon:'eye',title:`No project matches “${filter.value.trim()}”`,actions:[button({label:'Clear the filter',onClick:()=>{filter.value=filterText='';render();filter.focus();}})]}));return;}
      rows.replaceChildren(...shown.map(row));
      if(focusKey)rows.querySelector(`a[data-id="${CSS.escape(focusKey)}"]`)?.focus();
    }
    function row(p){
      const cap=capture(p.evidence,S.state.evidence.get(p.id)),r=p.recipe,pm=p.preferences?.music,pw=p.preferences?.world,active=p.id===S.state.selected,last=lastActivity(p),demo=isDemo(p);
      const style=pm?.style?STYLE_NAMES[pm.style]||pm.style:null,gw=S.state.settings?.stage?.world||'living',ag=p.evidence?.agents||[];
      const isCurrent=master&&p.id===current;
      return h('a',{class:['proj-row',active?'active':'',isCurrent?'current':''],href:`#/projects/${encodeURIComponent(p.id)}`,dataset:{id:p.id},'aria-current':isCurrent?'page':!master&&active?'true':null},
        h('span',{class:'cell c-name'},h('span',{class:'name-line'},h('strong',{class:'ellipsis',text:projectName(p)}),active?pill('Active','accent',{plain:true}):null,demo?pill(DEMO_LABEL,'warn',{plain:true}):null),
          h('span',{class:'sub ellipsis'},h('span',{class:'num',text:p.id.slice(0,8)}),' · ',r?.title?`“${r.title}”`:'No public title')),
        h('span',{class:'cell c-cap'},h('span',{class:'cap'},h('span',{class:`dot ${cap.key==='running'?'ok':cap.key==='quiet'?'warn':''}`}),h('span',{class:'ellipsis',text:cap.label})),h('span',{class:'sub ellipsis',title:cap.line,text:cap.key==='stopped'?cap.line.replace('Capture stopped at ','at '):cap.key==='quiet'?`Started · quiet since ${when(p.evidence?.editor?.at)}`:cap.key==='running'?`Editor activity ${ago(p.evidence?.editor?.at)}`:' '})),
        h('span',{class:'cell c-last'},h('span',{text:ago(last)}),h('span',{class:'sub',text:whenShort(last)})),
        h('span',{class:'cell c-ident'},h('span',{class:'ellipsis',text:r?.familyName||r?.family||(master?'No visual identity yet':'—')}),h('span',{class:'sub',text:familyLine(r)})),
        h('span',{class:'cell c-world'},h('span',{class:'ellipsis',text:WORLD_NAMES[pw||gw]||pw||gw}),h('span',{class:'sub',text:pw?'This project':'Global default'})),
        h('span',{class:'cell c-music'},h('span',{text:style||STYLE_NAMES[S.state.settings?.music?.style]||'—'}),h('span',{class:'sub',text:style?'This project':'Global default'})),
        h('span',{class:'cell c-agents'},h('span',{class:'ellipsis',text:ag.length?ag.map(a=>providerName(a.provider)).join(', '):'—'}),
          h('span',{class:'sub ellipsis',text:demo&&ag.length?'Fictional (demo)':ag.length?`last ${ago(ag[0].lastAt)}`:'None observed'})),
        h('span',{class:'cell num-cell c-events'},h('span',{},h('span',{class:'num',text:Number.isFinite(p.events)?p.events.toLocaleString():'—'}),h('span',{class:'unit',text:Number(p.events)===1?' event':' events'})),h('span',{class:'sub',text:p.chapter?`Chapter ${p.chapter}`:'—'})));
    }
    function setCurrent(id){
      current=id;
      for(const a of rows.querySelectorAll('a.proj-row')){const on=a.dataset.id===id;a.classList.toggle('current',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    }
    function announce(id){const pr=S.project(id);text(live,pr?`Showing ${projectName(pr)} beside the list`:'');}
    render();
    return {render,setCurrent,announce,topics:new Set(['projects','selection','evidence','settings'])};
  }
  // ---- One project -------------------------------------------------------------------------------------------------
  function buildDetail(id,host,{back:withBack}){
    let alive=true,model=null,modelError=null,intents=[],lastSeq=-1,recipe=null,refreshing=null,lastStamp='';
    const p=()=>S.project(id),active=()=>S.state.selected===id;
    const titleEl=h('h1',{class:'title-l proj-title ellipsis'}),idEl=h('span',{class:'num faint proj-id'}),pubEl=h('span',{class:'small'}),pills=h('div',{class:'proj-pills'}),actions=h('div',{class:'actions proj-actions'});
    const head=h('header',{class:'proj-detail-head'},
      h('div',{class:'proj-identity'},h('span',{class:'eyebrow',text:'Private workspace name'}),h('div',{class:'proj-title-line'},titleEl,pills),h('div',{class:'proj-meta'},pubEl,idEl)),actions);
    // A titled region of the project; note: the head's secondary line (kept for later updates).
    const panel=({title,note=null,cls='',aside=null},...body)=>{const n=h('span',{class:'note',text:note||''});
      return {n,el:h('section',{class:['panel','proj-panel',cls]},h('div',{class:'panel-head'},h('div',{class:'grow'},h('h2',{text:title}),note===null?null:n),aside),h('div',{class:'panel-body'},...body))};};
    const timeline=h('div',{class:'tl-wrap'}),legend=h('div',{class:'tl-legend small faint'}),overview=h('div',{class:'proj-overview'}),sessionsEl=h('div'),outcomes=h('div'),agents=h('div'),config=h('div'),exportsEl=h('div');
    const agentsP=panel({title:'Agents',note:'Observed through hooks',cls:'proj-agents-panel'},agents),agentsSub=agentsP.n;
    const root=h('div',{class:'proj-detail'});host.append(root);
    root.append(...[withBack?h('div',{class:'proj-back'},button({label:'All projects',icon:'back',kind:'ghost',size:'sm',onClick:()=>navigate('projects')})):null,head,
      panel({title:'Timeline',note:'Sessions and what they produced. Click a moment, or focus the timeline and use the arrow keys, to replay from there.',cls:'proj-timeline',aside:legend},timeline).el,
      h('div',{class:'proj-grid'},
        h('div',{class:'proj-col proj-history'},panel({title:'Sessions',note:'Newest first. Replay from the start of any session.'},sessionsEl).el,
          panel({title:'Validation outcomes',note:'Tests, builds and checks, newest first'},outcomes).el),
        // The engineering activity: the agents that worked on the project, then the structure they and the person built.
        h('div',{class:'proj-col proj-about'},agentsP.el,panel({title:'Overview',note:'Structure observed so far'},overview).el),
        // What the project plays (world, identity, music) leads its column, so it is on the first screen; the exports follow.
        h('div',{class:'proj-col proj-creative'},panel({title:'Configuration',note:'What this project plays, and where each value comes from'},config).el,
          panel({title:'Exports',note:'Take this performance away'},exportsEl).el))].filter(Boolean));
    function renderHead(){
      const pr=p(),r=active()?P.state.recipe||pr?.recipe:recipe||pr?.recipe;
      text(titleEl,pr?projectName(pr):`Project ${id.slice(0,8)}`);titleEl.title=pr?.name?'Private workspace name: shown only in the Control Center':'';
      text(idEl,id);text(pubEl,r?.title?`Public title “${r.title}”`:'No public title — the Stage shows a generic name');pubEl.className=r?.title?'small':'small faint';
      const cap=capture(pr?.evidence,S.state.evidence.get(id));
      pills.replaceChildren(...[active()?pill('Active project','accent'):null,isDemo(pr)?pill(DEMO_LABEL,'warn'):null,pr?pill(cap.label,cap.tone==='ok'?'ok live':cap.tone,{title:cap.line}):null].filter(Boolean));
      const choose=async(go)=>{if(!active())S.select(id);if(go)navigate(go);};
      actions.replaceChildren(...[
        active()?null:button({label:'Make active',icon:'check',kind:'primary',id:'makeActive',title:'Show this project on the Stage and in the studios',onClick:()=>{S.select(id);toast('This project is now the active project.','ok');}}),
        button({label:'Open Stage',icon:'stage',kind:active()?'primary':'outline',onClick:()=>choose('stage')}),
        button({label:'Visual identity',icon:'visual',kind:'ghost',onClick:()=>choose('visual')}),
        button({label:'Music',icon:'music',kind:'ghost',onClick:()=>choose('music')})].filter(Boolean));
    }
    // ---- Overview: only the statistics the receiver returned -------------------------------------------------
    function renderOverview(){
      if(modelError){overview.replaceChildren(callout({kind:'warn',icon:'warn',title:'No interpreted performance yet',body:modelError}));return;}
      if(!model){overview.replaceChildren(h('p',{class:'faint small',text:'Loading…'}));return;}
      const s=model.stats||{},perf=model.performance||{},n=k=>Number.isFinite(s[k])?s[k]:undefined;
      const stats=[['Modules',n('files'),'files'],['Symbols',n('symbols')],['Created',n('created'),'symbols'],['Modified',n('modified'),'symbols'],['Removed',n('removed'),'symbols'],['Imports',n('imports')],
        ['Commands',n('commands')],['Tests passed',n('testsPassed'),null,'ok'],['Tests failed',n('testsFailed'),null,'danger'],['Agent events',n('agentEvents')],['Milestones',n('milestones')],['Agents',n('agents'),'observed']].filter(x=>x[1]!==undefined);
      const progress=Number.isFinite(perf.progress)?Math.max(0,Math.min(100,perf.progress)):null;
      const ev=S.state.evidence.get(id);
      overview.replaceChildren(...[
        h('div',{class:'proj-chapter'},h('div',{},h('span',{class:'eyebrow',text:'Chapter'}),h('b',{class:'num',text:perf.chapter??'—'})),
          progress===null?null:h('div',{class:'grow'},h('div',{class:'proj-progress',role:'meter','aria-label':'Progress through the performance','aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':Math.round(progress)},h('i',{ref:el=>{el.style.width=`${progress}%`;}})),
            h('span',{class:'faint tiny',text:`${Math.round(progress)}% of the way to the next chapter (derived from the structure, not a judgement of the work)`}))),
        h('div',{class:'proj-stats'},...stats.map(([k,v,unit,tone])=>h('div',{class:'stat',dataset:{stat:k}},h('span',{class:'eyebrow',text:k}),h('span',{class:'stat-val'},h('b',{class:['num',v&&tone?tone:''],text:v.toLocaleString()}),unit?h('span',{class:'faint small',text:unit}):null)))),
        kv([['Events received',ev&&!ev.building?ev.events.toLocaleString():p()?.events?.toLocaleString()??'—'],['First received',ev?.firstReceivedAt?dateTime(ev.firstReceivedAt):'—'],
          ['Last received',ev?.lastReceivedAt?`${dateTime(ev.lastReceivedAt)} (${ago(ev.lastReceivedAt)})`:'—'],['Sessions',(model.sessions||[]).length],['Interpreted windows',model.timelineFrames??'—']])]);
    }
    // ---- Timeline ------------------------------------------------------------------------------------------------
    let tl=null,pointed=null;
    function renderTimeline(){
      if(modelError){timeline.replaceChildren(h('p',{class:'faint small',text:'Nothing to show until the receiver has interpreted events for this project.'}));legend.replaceChildren();tl=null;return;}
      if(!model){timeline.replaceChildren(h('p',{class:'faint small',text:'Loading the timeline…'}));return;}
      const sessions=(model.sessions||[]).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end));
      if(!sessions.length&&!intents.length){timeline.replaceChildren(h('p',{class:'faint small',text:'No sessions recorded yet.'}));legend.replaceChildren();tl=null;return;}
      const keep=tl?.cursorTs??null;tl=drawTimeline(timeline,sessions,intents,{name:projectName(p()),legend,onPick:(ts,label,anchor)=>openMoment(ts,label,anchor)});if(keep!==null){tl.setCursor(keep,false);tl.clear();}
      // A history row still hovered or focused while the timeline is redrawn keeps pointing at its moment.
      if(pointed!==null)tl.point(pointed);
    }
    function openMoment(ts,label,anchor){
      popover(anchor,close=>h('div',{class:'tl-menu'},h('div',{class:'menu-label'},h('div',{class:'num',text:dateTime(ts).replace(/, \d+:\d+.*$/,'')+' · '+clockTime(ts)}),h('div',{class:'small muted',text:label})),
        menuItem({label:'Replay from here',icon:'replay',sub:active()?'Opens the Stage in replay at this moment':'Makes this the active project, then opens the Stage in replay',onClick:()=>{close();void replayFrom(ctx,id,ts);}})),{width:300});
    }
    // ---- History rows: each replays from its moment, and points at it on the timeline while hovered or focused -----
    function historyRow(ts,label,...lead){
      const b=h('button',{type:'button',class:'list-row hist-row','aria-label':`Replay from ${day(ts)} ${clockTime(ts)}: ${label}`,
        title:active()?'Opens the Stage in replay at this moment':'Makes this the active project, then opens the Stage in replay at this moment'},
        ...lead,h('span',{class:'hist-go','aria-hidden':'true'},icon('replay'),h('span',{text:'Replay'})));
      b.addEventListener('click',()=>void replayFrom(ctx,id,ts));
      const point=()=>{pointed=ts;tl?.point(ts);},unpoint=()=>{if(pointed===ts)pointed=null;tl?.clear();};
      b.addEventListener('pointerenter',point);b.addEventListener('focus',point);b.addEventListener('pointerleave',unpoint);b.addEventListener('blur',unpoint);
      return b;
    }
    // ---- Sessions -----------------------------------------------------------------------------------------------
    function renderSessions(){
      if(modelError){sessionsEl.replaceChildren(h('p',{class:'faint small',text:'No sessions until the receiver has interpreted events for this project.'}));return;}
      if(!model){sessionsEl.replaceChildren(h('p',{class:'faint small',text:'Loading…'}));return;}
      const list=(model.sessions||[]).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)).sort((a,b)=>b.start-a.start);
      if(!list.length){sessionsEl.replaceChildren(h('p',{class:'faint small',text:'No sessions recorded yet.'}));return;}
      // Start and end of each session. Sessions that begin in the same minute show seconds, so no two rows read alike, and
      // so does a session shorter than its minute (never "04:00 – 04:00").
      const minuteOf=ts=>`${day(ts)} ${hm(ts)}`,starts=new Map();for(const s of list)starts.set(minuteOf(s.start),(starts.get(minuteOf(s.start))||0)+1);
      const rowOf=s=>{const precise=starts.get(minuteOf(s.start))>1||minuteOf(s.start)===minuteOf(s.end),t=ts=>precise?clockTime(ts):hm(ts);
        return historyRow(s.start,`session until ${clockTime(s.end)}, ${duration(s.end-s.start)}, ${count(s.events,'event')}`,
          h('span',{class:'hist-when num'},h('span',{class:'hist-day',text:day(s.start)}),h('span',{text:t(s.start)}),
            h('span',{class:'hist-end',text:` – ${day(s.end)===day(s.start)?'':`${day(s.end)} `}${t(s.end)}`})),
          h('span',{class:'hist-dur num small muted',text:duration(s.end-s.start)}),h('span',{class:'hist-ev small faint',text:count(s.events,'event')}));};
      const first=list.slice(0,8),rest=list.slice(8);
      sessionsEl.replaceChildren(...[h('div',{class:'list proj-sessions'},...first.map(rowOf)),
        rest.length?h('details',{class:'disclosure'},h('summary',{text:`${count(rest.length,'earlier session')}`}),h('div',{class:'disclosure-body'},h('div',{class:'list proj-sessions'},...rest.map(rowOf)))):null].filter(Boolean));
    }
    // ---- Agents ---------------------------------------------------------------------------------------------------
    function renderAgents(){
      const ev=S.state.evidence.get(id),providers=ev&&!ev.building?Object.entries(ev.agents||{}):(p()?.evidence?.agents||[]).map(a=>[a.provider,{lastAt:a.lastAt}]);
      const list=model?.agents||[];
      const demo=isDemo(p());text(agentsSub,demo?'Fictional, written by the demo':'Observed through hooks');
      if(!providers.length&&!list.length){agents.replaceChildren(h('p',{class:'faint small',text:'No agent activity observed for this project.'}));return;}
      agents.replaceChildren(...[
        h('p',{class:'faint small measure',text:demo?'Fictional agent events written by the demo (npm run demo); no agent did this work.':'What agent hooks reported: sessions, tools and files. Code Resonance never sees an agent’s hidden reasoning.'}),
        h('div',{class:'list proj-agents'},...providers.map(([prov,a])=>h('div',{class:'list-row'},h('span',{class:'dot accent proj-agent-dot'}),
          h('div',{class:'grow'},h('strong',{text:providerName(prov)}),h('div',{class:'faint tiny',text:[a.events!==undefined?count(a.events,'event'):null,a.firstAt?`first ${when(a.firstAt)}`:null].filter(Boolean).join(' · ')})),
          h('span',{class:'small muted',text:a.lastAt?`last ${ago(a.lastAt)}`:'—'})))),
        list.length?h('details',{class:'disclosure'},h('summary',{text:`${count(list.length,'agent session')} in the interpretation`}),h('div',{class:'disclosure-body'},
          h('div',{class:'list'},...list.slice().sort((a,b)=>(b.last||0)-(a.last||0)).map(a=>h('div',{class:'list-row'},
            h('div',{class:'grow'},h('div',{},h('strong',{text:providerName(a.provider)}),h('span',{class:'faint num tiny',text:`  #${String(a.id).slice(0,6)}`})),
              h('div',{class:'faint tiny',text:`${when(a.first)} – ${when(a.last)} · ${count(a.events,'event')}`})),
            h('span',{class:'small muted',text:a.activity?`${a.state} · ${a.activity}`:a.state||'—'})))))):null].filter(Boolean));
    }
    // ---- Validation outcomes ---------------------------------------------------------------------------------
    function renderOutcomes(){
      if(!model){outcomes.replaceChildren(h('p',{class:'faint small',text:modelError?'—':'Loading…'}));return;}
      const cues=(model.timeline||[]).filter(c=>/^(validation|milestone)\./.test(c.type)&&(c.type!=='validation.diagnostics'||(c.detail?.errors||c.detail?.warnings))).sort((a,b)=>b.ts-a.ts).slice(0,10);
      if(!cues.length){outcomes.replaceChildren(h('p',{class:'faint small',text:'No test, build or check results observed in the recent history.'}));return;}
      outcomes.replaceChildren(h('div',{class:'list proj-outcomes'},...cues.map(c=>{const bad=/failed|errors?$/.test(c.type)||c.detail?.errors>0,good=/passed|recovered|milestone/.test(c.type);
        const extra=c.type==='validation.diagnostics'?` · ${count(c.detail.errors||0,'error')}, ${count(c.detail.warnings||0,'warning')}`:'',label=P.describe(c.type)+extra;
        return historyRow(c.ts,label,h('span',{class:`dot ${bad?'danger':good?'ok':''}`}),h('span',{class:'grow ellipsis',text:label}),h('span',{class:'num small faint hist-time',text:`${day(c.ts)} ${clockTime(c.ts)}`}));})),
        h('p',{class:'faint tiny',text:'From the last 500 interpreted events. Editor diagnostics without problems are not listed.'}));
    }
    // ---- Exports ----------------------------------------------------------------------------------------------
    let exportBtn=null;
    function renderExports(){
      const s=P.state,last=s.recording.last,isActive=active();
      exportBtn=button({label:s.exporting?'Rendering…':'Render music (WAV)',icon:'wave',size:'sm',id:'exportAudio',disabled:!isActive||s.exporting,onClick:async()=>{
        try{const r=await P.exportAudio();if(r)toast(`Saved ${r.file} (${duration(r.seconds*1000)}) to your downloads.`,'ok');else toast('Nothing recorded to render yet.','warning');}
        catch(e){toast(`The music could not be rendered: ${e.message}`,'error');}}});
      exportsEl.replaceChildren(h('div',{class:'list proj-exports'},
        h('div',{class:'list-row'},h('div',{class:'grow'},h('strong',{text:'Performance data'}),h('div',{class:'faint tiny',text:'JSON: statistics, sessions and the interpreted timeline (no source code).'})),
          h('a',{class:'btn sm',href:`/api/export?id=${encodeURIComponent(id)}`,download:'',id:'exportJson'},icon('download'),h('span',{text:'Download'}))),
        h('div',{class:'list-row'},h('div',{class:'grow'},h('strong',{text:'Music'}),h('div',{class:'faint tiny',text:isActive?(s.exporting?'Rendering offline; the download starts when it is done.':'Up to 10 minutes: from the playhead in replay, else the last 10 minutes.'):'Available for the active project.'})),
          isActive?exportBtn:button({label:'Make active',size:'sm',onClick:()=>S.select(id)})),
        h('div',{class:'list-row'},h('div',{class:'grow'},h('strong',{text:'Video'}),h('div',{class:'faint tiny',text:'Recordings are saved by the browser to its downloads folder. Code Resonance keeps no video library.'}),
          ...[last?h('div',{class:'small muted proj-last-rec',text:`Last recording in this window: ${last.file||'WebM'} · ${duration(last.durationMs)}${last.at?` · ${when(last.at)}`:''}${last.audio&&!last.audioLost?'':' · no sound'}`}):null].filter(Boolean)),
          button({label:'Record & Broadcast',icon:'broadcast',size:'sm',kind:'ghost',title:'Recording and the OBS view',onClick:()=>navigate('output')}))));
    }
    // ---- Configuration: the effective values and where each comes from --------------------------------------
    const FINISHES={classic:'Classic',clean:'Clean',cinematic:'Cinematic',dreamlike:'Dreamlike'},json=x=>JSON.stringify(x);
    function renderConfig(){
      const e=S.effective(id),pref=S.state.preferences.get(id),pm=pref?.music||{},gs=S.state.settings,r=active()?P.state.recipe:recipe||p()?.recipe;
      const src=k=>k==='url'?'Pinned in this window’s address':k==='project'?'This project':'Global default';
      const musicSrc=k=>pm[k]!==null&&pm[k]!==undefined?'This project':'Global default';
      const labels=r?.overrides?.labels||null;
      // Settings are global: changing them there does not change which project is active.
      const go=(to,what)=>button({label:'Change',size:'sm',kind:'ghost',attrs:{'aria-label':`Change ${what}`},onClick:()=>{if(to!=='settings'&&!active())S.select(id);navigate(to);}});
      const own=from=>from==='This project'||from.startsWith('Saved with');
      const rowOf=(k,v,from,to,extra=null)=>h('div',{class:['cfg-row',own(from)?'own':'']},h('span',{class:'faint',text:k}),h('span',{class:'cfg-value'},h('span',{text:v}),h('span',{class:'faint tiny cfg-from',text:from}),extra),to?go(to,k.toLowerCase()):h('span'));
      // A world chosen for this project can be handed back to the global default (the Stage saves one on every pick).
      const gw=gs?.stage?.world||'living';
      const useGlobal=e.sources.world==='project'?h('button',{type:'button',class:'link-btn small cfg-reset',id:'cfgWorldGlobal',text:`Use global (${WORLD_NAMES[gw]||gw})`,
        title:'Remove this project’s own world so it follows the default world in Settings',onClick:async()=>{
          try{await S.savePreferences({world:null},id);toast('This project now follows the default world.','ok');}catch(err){toast(`Not saved: ${err.message}`,'error');}}}):null;
      const group=t=>h('div',{class:'cfg-group eyebrow',text:t});
      // The Artist Studio's composition this project shows, its cinematic finish and its musical performance profile.
      const comp=r?.composition||null,saved=comp?.id?S.composition(comp.id):null;
      const editRow=(k,v,from,label,onClick)=>h('div',{class:['cfg-row',own(from)?'own':'']},h('span',{class:'faint',text:k}),h('span',{class:'cfg-value'},h('span',{text:v}),h('span',{class:'faint tiny cfg-from',text:from})),
        button({label,size:'sm',kind:'ghost',attrs:{'aria-label':`${label} ${k.toLowerCase()}`},onClick:()=>{if(!active())S.select(id);onClick();}}));
      const compRow=comp?editRow('Composition',comp.name,saved?`Saved with this project’s identity · from My creations${json(saved.composition)===json(comp)?'':' (an earlier version)'}`:'Saved with this project’s identity · from a shared pack','Edit',
          ()=>saved?navigate('artist','edit',saved.id):navigate('artist','project'))
        :editRow('Composition','None','No layers over the world','Create',()=>navigate('artist','from',r?.family&&r.familyKind!=='pack'?r.family:'canvas'));
      const finish=r?.genome?.technique?.finish;
      const tuned=[...PROFILE_KEYS,'mix'].filter(k=>pm[k]!==null&&pm[k]!==undefined),score=scoreOf(r);
      config.replaceChildren(h('div',{class:'cfg'},
        group('Visuals'),
        rowOf('World',WORLD_NAMES[e.world]||e.world,src(e.sources.world),'visual',useGlobal),
        rowOf('Visual identity',r?.familyName||r?.family||'Not generated yet',r?familyLine(r):'Generated when first shown','visual'),
        compRow,
        rowOf('Finish',FINISHES[finish]||'Classic',finish?'Saved with this project’s identity':'The world’s own grade','visual'),
        rowOf('Information',LABEL_NAMES[labels||gs?.stage?.labels]||labels||'—',labels?'Saved with this project’s identity':'Global default','visual'),
        group('Music'),
        rowOf('Music style',STYLE_NAMES[e.music.style]||e.music.style,src(e.sources.style),'music'),
        rowOf('Music profile',`${score===3?'Composed score':'Classic score'}${tuned.length?` · ${count(tuned.length,'value')} set for this project`:' · default performance'}`,tuned.length?'This project':score===3?'Saved with this project’s identity':'Global default','music'),
        rowOf('Tempo',e.music.tempoMode==='manual'?`${e.music.tempo} BPM`:'Follows the project',musicSrc('tempoMode'),'music'),
        rowOf('Texture',Number.isFinite(e.music.texture)?`${Math.round(e.music.texture*100)}%`:'—',musicSrc('texture'),'music'),
        group('Stage'),
        rowOf('Captions',e.captions?'On':'Off',S.pinned('captions')?src('url'):'Global default','settings')),
        ...(pref?[]:[h('p',{class:'faint tiny',text:'Loading this project’s preferences…'})]));
    }
    // ---- Data ---------------------------------------------------------------------------------------------------
    async function loadModel(){
      try{model=await S.get(`/api/project?id=${encodeURIComponent(id)}`);modelError=null;}
      catch(e){if(e.status===404){model=null;modelError='The receiver has not interpreted any events for this project yet.';}else if(!model)modelError=`The receiver did not answer: ${e.message}`;}
      if(model){
        // The intents of every window (cheap: fields=intents), read page by page up to the total.
        try{for(let guard=0;guard<200;guard++){const page=await S.get(`/api/timeline?id=${encodeURIComponent(id)}&fields=intents&after=${lastSeq}&limit=500`);
          for(const e of page.entries){lastSeq=e.seq;if(e.intents)intents.push(...e.intents);}if(!page.entries.length||lastSeq>=page.total-1)break;}}catch{}
      }
      if(!alive)return;renderOverview();renderTimeline();renderSessions();renderAgents();renderOutcomes();
    }
    async function loadRecipe(){
      // The saved recipe (with its overrides) of a project that is not active; the active one is the engine's.
      if(active()||!p()?.recipe){recipe=null;return;}
      try{recipe=await S.get(`/api/recipe?id=${encodeURIComponent(id)}`);}catch{recipe=null;}
      if(alive){renderHead();renderConfig();}
    }
    function refresh(){if(refreshing)return;refreshing=setTimeout(async()=>{await loadModel();refreshing=null;},1500);}
    renderHead();renderOverview();renderTimeline();renderSessions();renderAgents();renderOutcomes();renderExports();renderConfig();
    void loadModel();void loadRecipe();void S.loadEvidence(id);if(!S.state.preferences.has(id))void S.loadPreferences(id);
    lastStamp=`${p()?.updatedAt}|${p()?.events}|${p()?.recipe?.revision}`;
    let lastRec=P.state.recording.last;
    const tick=setInterval(()=>{if(alive)renderHead();},15000);
    return {
      update(t){
        if(!alive)return;
        if(t.has('projects')){const stamp=`${p()?.updatedAt}|${p()?.events}|${p()?.recipe?.revision}`;if(stamp!==lastStamp){const recipeChanged=stamp.split('|')[2]!==lastStamp.split('|')[2];lastStamp=stamp;refresh();if(recipeChanged)void loadRecipe();}}
        if(t.has('projects')||t.has('selection')||t.has('evidence')||t.has('recipe'))renderHead();
        if(t.has('evidence')){renderAgents();if(model)renderOverview();}
        if(t.has('selection')){void loadRecipe();renderExports();if(model){renderSessions();renderOutcomes();}}
        if(t.has('preferences')||t.has('settings')||t.has('selection')||t.has('compositions')||(t.has('recipe')&&active()))renderConfig();
        if(t.has('export')||t.has('receiver'))renderExports();
        if(t.has('recording')&&P.state.recording.last!==lastRec){lastRec=P.state.recording.last;renderExports();}
      },
      destroy(){alive=false;clearInterval(tick);clearTimeout(refreshing);tl?.destroy();}
    };
  }
  offs.push(S.on(t=>{
    if(browser&&[...browser.topics].some(x=>t.has(x)))browser.render();
    if(detail)detail.update(t);
    // On #/projects beside the browser, the project shown follows the active one (and appears once the list has loaded).
    if(!params?.[0]&&(t.has('projects')||t.has('selection'))){const n=plan();if(n.layout!==layout||(n.layout==='md'&&n.shown!==detailId))apply(false);}
  }));
  // Crossing the desktop width changes the layout (nothing is lost: the filter is kept, the project reloads).
  const onWide=()=>apply(false);wide.addEventListener('change',onWide);offs.push(()=>wide.removeEventListener('change',onWide));
  // Relative times in the list ("3 min ago") age without any event arriving.
  const tick=setInterval(()=>{if(browser&&!document.hidden)browser.render();},30000);offs.push(()=>clearInterval(tick));
  route(ctx.params);
  return {route,unmount(){for(const f of offs)f();detail?.destroy();}};
}};
// ---- Timeline drawing (DOM; positions in % so it follows the width without measuring) -------------------------------
// Long pauses between sessions are folded into short breaks, so a project worked on over several days still shows each
// session at a readable width.
const FOLD_MS=30*60000,BREAK=.018,MIN_SHARE=.06,BINS=160,TICK=1/6;
function drawTimeline(host,sessions,intents,{name,onPick,legend}){
  const spans=[...sessions.map(s=>[s.start,Math.max(s.end,s.start)]),...intents.map(i=>[i.ts,i.ts])].sort((a,b)=>a[0]-b[0]);
  const segs=[];for(const [a,b] of spans){const last=segs.at(-1);if(last&&a-last.end<=FOLD_MS)last.end=Math.max(last.end,b);else segs.push({start:a,end:b});}
  for(const s of segs)if(s.end-s.start<1000)s.end=s.start+1000;
  const total=segs.reduce((a,s)=>a+(s.end-s.start),0),avail=1-BREAK*(segs.length-1);
  let shares=segs.map(s=>Math.max(MIN_SHARE,(s.end-s.start)/total));const k=avail/shares.reduce((a,b)=>a+b,0);shares=shares.map(x=>x*k);
  let x0=0;segs.forEach((s,i)=>{s.x=x0;s.w=shares[i];x0+=s.w+BREAK;});
  const xOf=ts=>{let s=segs.find(g=>ts<=g.end)||segs.at(-1);if(ts<s.start)return s.x;return s.x+Math.min(1,(ts-s.start)/(s.end-s.start))*s.w;};
  const tsOf=x=>{for(const s of segs){if(x<=s.x+s.w+BREAK/2)return s.start+Math.max(0,Math.min(1,(x-s.x)/s.w))*(s.end-s.start);}const s=segs.at(-1);return s.end;};
  const pct=v=>`${(v*100).toFixed(3)}%`;
  // Points a person can step to with the keyboard: outcomes and session starts.
  const marks=intents.filter(i=>OUTCOME[i.type]).map(i=>({ts:i.ts,kind:OUTCOME[i.type],label:meaning(i)}));
  const stops=[...marks,...sessions.map(s=>({ts:s.start,kind:'session',label:`Session began · ${count(s.events,'event')} · ${duration(s.end-s.start)}`}))].sort((a,b)=>a.ts-b.ts);
  const lanes=Object.fromEntries(LANES.map(l=>[l.id,h('div',{class:'tl-lane',dataset:{lane:l.id}})]));
  // Sessions as bands (overlapping sessions stack their translucency).
  for(const s of sessions){const a=xOf(s.start),b=xOf(s.end);lanes.sessions.append(h('i',{class:'tl-band',ref:el=>{el.style.left=pct(a);el.style.width=pct(Math.max(.003,b-a));}}));}
  // Dense lanes are binned: the brightness of a bin is its share of the busiest bin.
  for(const [lane,test] of [['structure',i=>STRUCTURE.has(i.type)],['agents',i=>i.type==='agent.state'||i.type==='agent.collision']]){
    const bins=new Array(BINS).fill(0);for(const i of intents)if(test(i))bins[Math.min(BINS-1,Math.floor(xOf(i.ts)*BINS))]++;
    const max=Math.max(1,...bins);bins.forEach((n,b)=>{if(n)lanes[lane].append(h('i',{class:'tl-bin',ref:el=>{el.style.left=pct(b/BINS);el.style.width=pct(1/BINS);el.style.opacity=String(.25+.75*n/max);}}));});
  }
  for(const m of marks)lanes.outcomes.append(h('i',{class:`tl-mark ${m.kind}`,dataset:{kind:m.kind,ts:String(m.ts)},title:'',ref:el=>{el.style.left=pct(xOf(m.ts));}}));
  // Folded pauses are drawn as breaks with the length of the pause.
  const breaks=segs.slice(1).map((s,i)=>h('span',{class:'tl-break',title:`Pause of ${duration(s.start-segs[i].end)}`,ref:el=>{el.style.left=pct(s.x-BREAK);el.style.width=pct(BREAK);}}));
  const cursor=h('div',{class:'tl-cursor',tabindex:'-1','aria-hidden':'true'}),tip=h('div',{class:'tl-tip',role:'status','aria-live':'polite'});
  const track=h('div',{class:'tl-track',tabindex:'0',role:'slider','aria-label':`Timeline of ${name}: arrow keys move between moments, Enter offers replay`,'aria-valuemin':'0','aria-valuemax':String(Math.max(0,stops.length-1))},
    ...LANES.map(l=>lanes[l.id]),...breaks,cursor,tip);
  // Ticks: the start of each stretch (with its day when it changes), the end, and times in between about every sixth of
  // the width, kept clear of the others (.mid ticks are dropped when the timeline is narrow).
  const dated=i=>i===0||new Date(segs[i].start).toDateString()!==new Date(segs[i-1].start).toDateString();
  const mids=[];segs.forEach((s,i)=>{for(let x=s.x+TICK*(dated(i)?1.5:1);x<s.x+s.w-TICK*.6&&x<=1-TICK*1.1;x+=TICK)mids.push(x);});
  const axis=h('div',{class:'tl-axis'},...segs.map((s,i)=>h('span',{class:'tl-tick num',text:dated(i)?`${new Date(s.start).toLocaleDateString([],{month:'short',day:'numeric'})} ${clockTime(s.start)}`:clockTime(s.start),ref:el=>{el.style.left=pct(s.x);}})),
    ...mids.map(x=>h('span',{class:'tl-tick mid num',text:clockTime(tsOf(x)),ref:el=>{el.style.left=pct(x);}})),
    h('span',{class:'tl-tick end num',text:clockTime(segs.at(-1).end)}));
  // The legend names only the kinds of marker present; it lives where the caller puts it (the panel's head, before the
  // track). Its swatches are .tl-key, not .tl-mark, so .tl-mark always means a moment on the timeline.
  legend.replaceChildren(...[['passed','Passed'],['failed','Failed'],['recovered','Recovered'],['milestone','Milestone'],['checkpoint','Commit'],['chapter','Chapter']]
    .filter(([k])=>marks.some(m=>m.kind===k)).map(([k,l])=>h('span',{},h('i',{class:`tl-key ${k}`}),l)));
  host.replaceChildren(h('div',{class:'tl'},h('div',{class:'tl-labels','aria-hidden':'true'},...LANES.map(l=>h('span',{text:l.label}))),h('div',{class:'tl-body'},track,axis)));
  let cursorTs=null,stopIndex=-1;
  function describe(ts){
    const exact=stops.find(s=>s.ts===ts&&s.kind!=='session')||stops.find(s=>s.ts===ts);if(exact)return exact.label;
    const nearMark=stops.find(s=>Math.abs(xOf(s.ts)-xOf(ts))<.004&&s.kind!=='session');if(nearMark)return nearMark.label;
    const inSession=sessions.filter(s=>ts>=s.start&&ts<=s.end);
    return inSession.length?`During ${inSession.length>1?`${inSession.length} overlapping sessions`:'a session'}`:'Between sessions';
  }
  function setCursor(ts,announce=true){
    cursorTs=ts;const x=xOf(ts);cursor.style.left=pct(x);cursor.classList.add('on');
    tip.replaceChildren(h('b',{class:'num',text:clockTime(ts)}),h('span',{text:describe(ts)}));tip.classList.add('on');
    tip.style.left=pct(Math.min(.86,Math.max(.0,x-.07)));
    track.setAttribute('aria-valuetext',`${new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'})} ${clockTime(ts)} · ${describe(ts)}`);if(stopIndex>=0)track.setAttribute('aria-valuenow',String(stopIndex));
    if(!announce)tip.classList.remove('on');
  }
  const snap=x=>{let best=null,bd=Infinity;for(const s of stops){const d=Math.abs(xOf(s.ts)-x);if(d<bd){bd=d;best=s;}}return bd<.008?best:null;};
  const xAt=e=>{const r=track.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));};
  track.addEventListener('pointermove',e=>{const x=xAt(e),s=snap(x);setCursor(s?s.ts:tsOf(x));});
  track.addEventListener('pointerleave',()=>{if(document.activeElement!==track){cursor.classList.remove('on');tip.classList.remove('on');}});
  track.addEventListener('click',e=>{const x=xAt(e),s=snap(x),ts=s?s.ts:Math.round(tsOf(x));stopIndex=s?stops.indexOf(s):-1;setCursor(ts);onPick(ts,describe(ts),cursor);});
  track.addEventListener('focus',()=>{if(cursorTs===null){stopIndex=0;setCursor(stops[0]?.ts??segs[0].start);}else setCursor(cursorTs);});
  track.addEventListener('blur',()=>{tip.classList.remove('on');});
  cursor.addEventListener('focus',()=>track.focus({preventScroll:true}));
  track.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();if(cursorTs===null)setCursor(stops[0]?.ts??segs[0].start);onPick(cursorTs,describe(cursorTs),cursor);return;}
    let i=null;
    if(e.key==='ArrowRight'||e.key==='ArrowDown')i=stops.findIndex(s=>s.ts>(cursorTs??-Infinity));
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){i=-1;for(let j=stops.length-1;j>=0;j--)if(stops[j].ts<(cursorTs??Infinity)){i=j;break;}}
    else if(e.key==='Home')i=0;else if(e.key==='End')i=stops.length-1;else return;
    e.preventDefault();if(i<0||!stops[i])return;stopIndex=i;setCursor(stops[i].ts);});
  // Points elsewhere on the page (a session, an outcome) preview a moment on the timeline. A preview moves only the drawn
  // cursor and its tip: the keyboard's place (cursorTs, stopIndex) and what the slider announces are left alone, and
  // ending the preview puts the cursor back where the keyboard left it (or hides it when the timeline is not focused).
  function point(ts){
    const x=xOf(ts);cursor.style.left=pct(x);cursor.classList.add('on');
    tip.replaceChildren(h('b',{class:'num',text:clockTime(ts)}),h('span',{text:describe(ts)}));tip.classList.add('on');
    tip.style.left=pct(Math.min(.86,Math.max(.0,x-.07)));
  }
  function unpoint(){
    if(document.activeElement===track&&cursorTs!==null){setCursor(cursorTs);return;}
    cursor.classList.remove('on');tip.classList.remove('on');
  }
  return {get cursorTs(){return cursorTs;},setCursor,point,clear:unpoint,destroy(){},xOf};
}

// Connections: what is actually connected to this receiver, in plain words. Every state shown is something the receiver
// observed and when (GET /api/status, the evidence documents of /api/evidence, GET /api/integrations); what cannot be
// known is said to be unknown. VS Code owns its settings: this view shows the values the extension *reported* and how
// to change them in VS Code, never a control that looks like it changes VS Code. Claude Code and Cursor hooks are written
// only after the exact change to the file was shown and accepted, and only if the file is still the one that was shown.
// Codex hooks follow the same review: project `.codex/hooks.json` only, observe-only, never PreToolUse. The other tools
// with an observe-only adapter (GET /api/integrations `agents`: Gemini CLI, Qwen Code, GitHub Copilot, Factory Droid,
// Grok Build, goose) share one section and the same review, one tool at a time.
// Project ids never appear as text (they look like secrets and mean nothing to people): names or short labels only.
import {h,button,segmented,section,disclosure,pill,callout,copyable,toast,styles,reducedMotion} from '../dom.js';
import {icon} from '../icons.js';
import {ago,dateTime,duration,count,projectName} from '../format.js';
import {openDoc} from '../markdown.js';
import {privateName} from '../../providers.js';
// The extension does not report VS Code closing: a started capture counts as running only while editor events keep
// arriving (within two minutes, the product's rule); after that it is "started, but quiet", which is unknown, not live.
const RUNNING_MS=120000,STATUS_MS=15000,TICK_MS=10000;
// Command titles from extension/package.json (contributes.commands); the integrations response does not carry them.
const START='CODE RESONANCE: Start Code Performance',STOP='CODE RESONANCE: Stop Code Performance';
// Settings that decide what leaves the editor: each gets a plain explanation beside what VS Code reported.
const PRIVACY={
  'resonance.captureTerminalCommands':'When on, whole terminal command lines are stored in this computer’s journal, and command lines can contain passwords or tokens. When off, only a category (test, build, …) and the exit code are recorded.',
  'resonance.capturePromptText':'Only affects the explicit “Record AI Prompt” command. When on, the prompt’s text is stored; when off, only its length and a fingerprint.',
  'resonance.includeHidden':'When on, dot-folders and dot-files (.github/, .eslintrc.js) are captured too. Secret-like files (.env, keys, credentials) are always left out.',
  'resonance.captureDocumentContents':'Bounded source snapshots go to this receiver so it can analyse the code’s structure. They stay on this computer and never reach the Stage, the OBS view or exports.',
  'resonance.shareProjectName':'The folder name labels the project in this Control Center only. It is never drawn on the Stage, the OBS view or recordings.'};
// SECURITY.md's table, in plain words.
const PRIVACY_TABLE=[
  ['Source code','Bounded snapshots while capture runs (unless “capture document contents” is off), stored compressed on this computer','Never'],
  ['What you type','Never: only counts of edits, characters and lines per second','Never'],
  ['Terminal commands','A category (test, build, lint, …) and the exit code; the command text only if “capture terminal commands” is on','The category, as cues; the text never'],
  ['AI prompts and replies','Length and fingerprint only; the text only if you opt in (RESONANCE_CAPTURE_PROMPT_TEXT=1 for hooks)','Never'],
  ['File paths','Relative to the project; secret-like files and excluded folders are left out','Never: only salted, hashed identifiers'],
  ['Project folder name','If “share project name” is on (the default), for this Control Center’s project list','Never: the Stage shows the public title you approve, or a generic name']];
const PLATFORMS={linux:'Linux',darwin:'macOS',win32:'Windows'};
const settingName=id=>{const s=id.replace(/^resonance\./,'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();return s.charAt(0).toUpperCase()+s.slice(1);};
const formatValue=v=>v===null||v===undefined?'Not reported':typeof v==='boolean'?(v?'On':'Off'):String(v);
const older=(a,b)=>{const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++)if((x[i]||0)!==(y[i]||0))return (x[i]||0)<(y[i]||0);return false;};
// A date and time without the year when it is this year (a fact cell stays on one line).
const shortDateTime=ts=>{if(!Number.isFinite(ts)||ts<=0)return '—';const d=new Date(ts),o={month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'};
  if(d.getFullYear()!==new Date().getFullYear())o.year='numeric';return d.toLocaleString([],o);};
// A command line to copy, displayed so it wraps only at spaces: each word is kept whole (a line break after "--" would be
// typed wrong). A word longer than the line still wraps inside itself. The copied text is the exact value either way.
// With paths, a word may also break after a "/" (a folder name is never cut in two).
const words=(v,paths=false)=>String(v).split(/( +)/).filter(Boolean).flatMap(p=>!p.trim()?[document.createTextNode(p)]
  :(paths?p.split(/(?<=\/)/):[p]).map(t=>h('span',{class:'conn-tok',text:t})));
function command(value){
  const el=copyable(value),code=el.querySelector('code'),set=el.set,paint=v=>code.replaceChildren(...words(v));
  paint(value);el.set=v=>{set(v);paint(v);};el.classList.add('conn-cmd');return el;
}
const quote=p=>/[\s"'$`&|;<>()]/.test(p)?JSON.stringify(p):p;
// ---- What the evidence says about one project's editor -----------------------------------------------------------
// ev: undefined (not loaded yet), null (nothing received for the project), {building:true} or the evidence document.
export function editorState(ev,now=Date.now()){
  if(ev===undefined)return {key:'loading',label:'Reading…',kind:'unknown'};
  if(ev===null)return {key:'none',label:'No VS Code capture observed',kind:'unknown',detail:'Nothing has reached this receiver for this project yet.'};
  if(ev.building)return {key:'building',label:'Reading its history…',kind:'unknown',detail:'The receiver is reading this project’s journal once to learn what was captured.'};
  const ed=ev.editor,c=ed.capture;
  if(c.state==='started'){
    if(ed.lastAt&&now-ed.lastAt<RUNNING_MS)return {key:'running',label:'Capture running',kind:'ok live',detail:`Capture started ${dateTime(c.startedAt)}; editor activity ${ago(ed.lastAt,now)}.`};
    return {key:'quiet',label:'Started, but quiet',kind:'warn',detail:`Capture started ${dateTime(c.startedAt)}; nothing from the editor since ${dateTime(ed.lastAt)}. VS Code may be idle or closed; the extension does not report closing.`};
  }
  if(c.state==='stopped')return {key:'stopped',label:'Stopped',kind:'',detail:`Capture stopped at ${dateTime(c.stoppedAt)}.`};
  if(ev.other?.events)return {key:'unidentified',label:'Editor events from an unidentified source',kind:'warn',
    detail:`${count(ev.other.events,'event')} without an editor session (an older extension or another tool), the last ${ago(ev.other.lastAt,now)}.`};
  return {key:'none',label:'No VS Code capture observed',kind:'unknown',detail:ev.events?'Only events from other sources (such as agents) have arrived for this project.':'Nothing has reached this receiver for this project yet.'};
}
function versionText(ev){
  if(!ev||ev.building||!ev.editor.capture.state)return null;
  if(ev.demonstration)return 'None: a fictional demonstration';
  return ev.editor.reported?.extensionVersion?`Extension ${ev.editor.reported.extensionVersion}`:'Not reported (extension older than 0.5)';
}
// ---- A unified line diff (longest common subsequence; settings files are small) ------------------------------------
export function lineDiff(before,after){
  const split=s=>{if(!s)return [];const l=String(s).split('\n');if(l.at(-1)==='')l.pop();return l;};
  const a=split(before),b=split(after),n=a.length,m=b.length,out=[];
  if(n*m>4e6){for(let i=0;i<n;i++)out.push({t:'-',a:i+1,s:a[i]});for(let j=0;j<m;j++)out.push({t:'+',b:j+1,s:b[j]});return out;}
  const W=m+1,L=new Uint32Array((n+1)*W);
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i*W+j]=a[i]===b[j]?L[(i+1)*W+j+1]+1:Math.max(L[(i+1)*W+j],L[i*W+j+1]);
  let i=0,j=0;
  while(i<n&&j<m){if(a[i]===b[j]){out.push({t:' ',a:i+1,b:j+1,s:a[i]});i++;j++;}else if(L[(i+1)*W+j]>=L[i*W+j+1]){out.push({t:'-',a:i+1,s:a[i]});i++;}else{out.push({t:'+',b:j+1,s:b[j]});j++;}}
  for(;i<n;i++)out.push({t:'-',a:i+1,s:a[i]});for(;j<m;j++)out.push({t:'+',b:j+1,s:b[j]});
  return out;
}
function diffView(ops,label){
  // Unchanged runs keep three lines of context around each change; the rest is folded (the whole file is one click away).
  const keep=ops.map(()=>ops.length<=40);
  ops.forEach((o,i)=>{if(o.t!==' ')for(let k=Math.max(0,i-3);k<=Math.min(ops.length-1,i+3);k++)keep[k]=true;});
  const rows=[];let folded=0;
  const fold=()=>{if(folded)rows.push(h('div',{class:'diff-line gap'},h('span',{class:'ln'}),h('span',{class:'ln'}),h('span',{class:'sign',text:'⋯'}),h('span',{class:'code',text:`${count(folded,'unchanged line')}`})));folded=0;};
  ops.forEach((o,i)=>{if(!keep[i]){folded++;return;}fold();
    rows.push(h('div',{class:['diff-line',o.t==='+'?'add':o.t==='-'?'del':'ctx']},h('span',{class:'ln',text:o.a??''}),h('span',{class:'ln',text:o.b??''}),
      h('span',{class:'sign',text:o.t==='+'?'+':o.t==='-'?'−':''}),h('span',{class:'code',text:o.s.replace(/\r$/,'')})));});
  fold();
  return h('div',{class:'diff',role:'region','aria-label':label,tabindex:0},...rows);
}
// Rebuilding a list keeps keyboard focus on the same logical control.
function rebuild(el,...children){
  const a=document.activeElement,key=el.contains(a)?a?.dataset?.key:null;
  el.replaceChildren(...children.flat().filter(Boolean));
  if(key)el.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
}
export default {mount(view,{store:S,player:P,navigate,params}){
  styles('connections');
  const offs=[],timers=new Set();
  let status=null,statusAt=0,statusError=null,integ=null,integError=null,focus=params?.[0]||'';
  // ---- Page frame -------------------------------------------------------------------------------------------------
  // Each source is a section of two columns: on the left what the receiver observed (evidence only), on the right how to
  // set it up or change it (guidance; actions that belong to VS Code are described there, never offered as buttons).
  const strip=h('nav',{class:'conn-strip','aria-label':'Connection overview'});
  const receiverBody=h('div',{class:'conn-receiver'});
  const editorList=h('div',{class:'conn-projects'});
  const editorDetail=h('div',{class:'conn-detail'});
  const editorSettings=h('div',{class:'conn-settings'});
  const vsGuide=h('div',{class:'conn-guide-stack'});
  // How to change a setting sits beside the settings table it explains (filled with vsGuide, once).
  const vsChange=h('div',{class:'conn-guide-stack'});
  const claudeObserved=h('div',{class:'conn-observed'});
  // What the hooks send is fixed by the adapter (policy, not observation): under the observed activity, as fixed facts.
  // What gets installed (the events and the command) belongs with the form that installs it.
  const claudeInfo=h('div',{class:'conn-fixed conn-claude-info'});
  const claudeSetup=h('div',{class:'conn-guide conn-claude-setup'});
  const cursorObserved=h('div',{class:'conn-observed'});
  const cursorInfo=h('div',{class:'conn-fixed conn-cursor-info'});
  const cursorSetup=h('div',{class:'conn-guide conn-cursor-setup'});
  const codexObserved=h('div',{class:'conn-observed'});
  const codexInfo=h('div',{class:'conn-fixed conn-codex-info'});
  const codexSetup=h('div',{class:'conn-guide conn-codex-setup'});
  const moreTools=h('div',{class:'conn-tools',role:'tablist','aria-label':'Agent',id:'connMoreTools'});
  const moreObserved=h('div',{class:'conn-observed'});
  const moreInfo=h('div',{class:'conn-fixed conn-more-info'});
  const moreSetup=h('div',{class:'conn-guide conn-more-setup'});
  // The tool the section shows (a slug of integ.agents): kept in memory only, like the folder field.
  let moreSlug='';
  const agentsObserved=h('div',{class:'conn-observed'});
  const agentsFacts=h('div',{class:'conn-fixed conn-agents-facts'});
  const agentsInfo=h('div',{class:'conn-agents-info'});
  const refreshBtn=button({label:'Refresh',icon:'refresh',kind:'ghost',id:'connRefresh',title:'Ask the receiver again',onClick:()=>refreshAll()});
  const heads={};
  const sec=(id,title,subtitle,...children)=>{const s=section({title,subtitle,id:`conn-${id}`},...children);heads[id]=s.querySelector('h2');heads[id].tabIndex=-1;return s;};
  // The columns of a section: observed state (evidence, an accent dot), fixed facts (policy, a lock) and guidance (a
  // document icon), each under a small heading so the difference is always visible.
  const COLS={status:['conn-col-status',()=>h('span',{class:'dot'})],fixed:['conn-col-fixed',()=>icon('lock')],guide:['conn-col-guide',()=>icon('doc')]};
  const col=(kind,label,...content)=>h('div',{class:['conn-col',COLS[kind][0]]},h('div',{class:'conn-col-label'},COLS[kind][1](),h('span',{class:'eyebrow',text:label})),...content);
  const area=(el,cls)=>{el.classList.add(cls);return el;};
  const pair=(observed,guide,{observedLabel='Observed by the receiver',guideLabel='Set up and change',wide=false,evidence=true,cls=''}={})=>h('div',{class:['conn-pair',wide?'guide-wide':'',cls]},
    col(evidence?'status':'fixed',observedLabel,observed),col('guide',guideLabel,guide));
  // A guidance panel: a title, then steps or commands to copy.
  const guidePanel=(ic,title,...body)=>h('div',{class:'conn-guide'},h('div',{class:'conn-guide-head'},icon(ic),h('strong',{text:title})),...body);
  const claude=hookFlow({slug:'claude',commandFallback:'npm run hooks:claude -- /path/to/project',
    help:'Only <folder>/.claude/settings.local.json changes (personal, not committed), and in it only this adapter’s hook entries. Everything else in the file stays as it is.',
    emptyPath:'Enter the folder Claude Code runs in.',
    installNext:'Start a new Claude Code session in that folder: its events then appear under Observed activity.',
    removeNext:'Claude Code sessions started in that folder from now on no longer send events here.'});
  const cursor=hookFlow({slug:'cursor',commandFallback:'npm run hooks:cursor -- /path/to/project',
    help:'Only <folder>/.cursor/hooks.json changes, and in it only this adapter’s hook entries. Everything else in the file stays as it is. Cursor may commit this file; the adapter command is an absolute path on this machine — gitignore the file or do not commit that entry. Cursor runs project hooks only in a trusted workspace.',
    emptyPath:'Enter the folder Cursor runs in.',
    installNext:'Start a new Cursor session in that trusted workspace: its events then appear under Observed activity.',
    removeNext:'Cursor sessions started in that folder from now on no longer send events here.'});
  const codex=hookFlow({slug:'codex',commandFallback:'npm run hooks:codex -- /path/to/project',
    help:'Only <folder>/.codex/hooks.json changes, and in it only this adapter’s hook entries. Everything else in the file stays as it is. Codex may commit this file; the adapter command is an absolute path on this machine — gitignore the file or do not commit that entry. Codex runs project hooks only when the project .codex/ layer is trusted.',
    emptyPath:'Enter the folder Codex runs in.',
    installNext:'Start a new Codex session in that trusted workspace: its events then appear under Observed activity.',
    removeNext:'Codex sessions started in that folder from now on no longer send events here.'});
  const moreTool=()=>(integ?.agents||[]).find(t=>t.slug===moreSlug)||(integ?.agents||[])[0]||null;
  const more=hookFlow({slug:'more',api:()=>moreTool()?.slug,entry:moreTool,commandFallback:'npm run hooks:<tool> -- /path/to/project',
    help:()=>{const t=moreTool();return t?`Only <folder>/${t.file} changes, and in it only this adapter’s hook entries. Everything else in the file stays as it is. ${t.commit} ${t.trust}`:'Loading…';},
    emptyPath:()=>`Enter the folder ${moreTool()?.name||'the agent'} runs in.`,
    installNext:()=>`Start a new ${moreTool()?.name||'agent'} session in that folder: its events then appear under Observed activity.`,
    removeNext:()=>`${moreTool()?.name||'Agent'} sessions started in that folder from now on no longer send events here.`});
  view.append(h('div',{class:'page ws-connections'},h('div',{class:'page-inner'},
    h('header',{class:'page-head'},h('div',{class:'grow'},h('span',{class:'eyebrow',text:'Capture and sources'}),h('h1',{class:'title-l',text:'Connections'}),
      h('p',{class:'muted measure',text:'What this receiver has actually received, and from where. Nothing on this page changes VS Code, and agent hooks (Claude Code, Cursor, Codex and the others below) change only after you review and write them.'})),
      h('div',{class:'actions'},refreshBtn)),
    strip,
    sec('receiver','Local receiver','The program on this computer that receives, analyses and stores captures',pair(receiverBody,troubleshooting())),
    // Two rows: the projects and the selected one's capture beside how to start, stop and install; then the settings that
    // capture reported beside how to change them. The settings use the full width of the observed column.
    sec('vscode','VS Code','What the Code Resonance extension reported, per project',
      h('div',{class:'conn-vs'},
        area(col('status','Reported by the extension',h('div',{class:'conn-editor'},editorList,h('div',{class:'conn-editor-main'},editorDetail))),'conn-vs-editor'),
        area(col('guide','Start, stop and install',vsGuide),'conn-vs-guide'),
        area(editorSettings,'conn-vs-settings'),
        area(col('guide','Change a setting',vsChange),'conn-vs-change'))),
    sec('claude','Claude Code','Lifecycle hooks, installed per project with your review',
      h('div',{class:'conn-pair even'},h('div',{class:'conn-col-stack'},col('status','Observed activity, per project',claudeObserved),col('fixed','What the hooks send',claudeInfo)),
        col('guide','Add or remove the hooks',h('div',{class:'conn-guide-stack'},claude.el,claudeSetup))),claude.result),
    sec('cursor','Cursor','Observe-only after-hooks, installed per project with your review',
      h('div',{class:'conn-pair even'},h('div',{class:'conn-col-stack'},col('status','Observed activity, per project',cursorObserved),col('fixed','What the hooks send',cursorInfo)),
        col('guide','Add or remove the hooks',h('div',{class:'conn-guide-stack'},cursor.el,cursorSetup))),cursor.result),
    sec('codex','Codex','Observe-only after-hooks, installed per project with your review',
      h('div',{class:'conn-pair even'},h('div',{class:'conn-col-stack'},col('status','Observed activity, per project',codexObserved),col('fixed','What the hooks send',codexInfo)),
        col('guide','Add or remove the hooks',h('div',{class:'conn-guide-stack'},codex.el,codexSetup))),codex.result),
    sec('more','More agents','Observe-only hooks for Gemini CLI, Qwen Code, GitHub Copilot, Factory Droid, Grok Build and goose, installed per project with your review',
      moreTools,
      h('div',{class:'conn-pair even'},h('div',{class:'conn-col-stack'},col('status','Observed activity, per project',moreObserved),col('fixed','What the hooks send',moreInfo)),
        col('guide','Add or remove the hooks',h('div',{class:'conn-guide-stack'},more.el,moreSetup))),more.result),
    sec('agents','Other agents','Any tool can send events through the generic endpoint',
      h('div',{class:'conn-pair even'},h('div',{class:'conn-col-stack'},col('status','Observed providers',agentsObserved),col('fixed','What an agent’s events carry',agentsFacts)),
        col('guide','Send events',agentsInfo))),
    sec('privacy','Privacy','What is captured, and what never reaches the Stage, the OBS view or exports',pair(privacyView(),privacyGuide(),{observedLabel:'Capture policy: what is kept, and where it shows',guideLabel:'The security model',evidence:false})))));
  // ---- Receiver ---------------------------------------------------------------------------------------------------
  async function loadStatus(){
    // With the control capability the receiver also says where its data lives; a window without one still gets the rest.
    try{status=await P.api.request('GET','/api/status');}
    catch(e){try{status=await S.get('/api/status');}catch(e2){statusError=e2.message;renderReceiver();renderStrip();return;}}
    statusAt=Date.now();statusError=null;renderReceiver();renderStrip();
  }
  const receiverUp=()=>!!status&&!statusError&&P.state.receiver!==false;
  function renderReceiver(){
    const s=status,up=receiverUp(),now=Date.now(),v=(k,value,cls='')=>h('span',{class:cls,dataset:{k},text:value});
    if(!up){
      rebuild(receiverBody,h('div',{class:'conn-panel'},
        callout({kind:P.state.receiver===null&&!statusError?'':'danger',icon:'warn',title:P.state.receiver===null&&!statusError?'Asking the receiver…':'The receiver is not answering',
          body:statusAt?`It last answered ${ago(statusAt,now)}. This page reconnects by itself when it is back. See “Start and check the receiver”.`:'This page reconnects by itself when it starts. See “Start and check the receiver”.'})));
      return;
    }
    const w=s.worker||{},pk=s.packs||{},feed=S.state.changes;
    const rows=[
      ['State',h('span',{class:'conn-inline'},pill('Running','ok'),feed==='open'?null:pill(feed==='connecting'?'Live updates connecting':'Live updates reconnecting','warn'))],
      ['Version',v('version',s.version,'num')],
      ['Running for',h('span',{class:'conn-stack'},v('uptime',duration((s.uptimeMs||0)+(now-statusAt))),h('span',{class:'faint small',text:`since ${shortDateTime(s.startedAt)}`}))],
      ['Address',v('address',location.origin,'num')],
      ['Reachable from',v('network',s.loopbackOnly?'This computer only (loopback)':'Other devices on the network too (RESONANCE_ALLOW_REMOTE=1)',s.loopbackOnly?'':'warn')],
      ...(s.wsl&&s.loopbackOnly?[['From Windows',h('span',{},v('windows',`http://localhost:${s.port}/`,'num'),h('span',{class:'faint small',text:' through WSL’s localhost forwarding'}))]]:[]),
      ['Analysis',v('worker',`${w.lastProjectionAt?`Last update ${ago(w.lastProjectionAt,now)}`:'No analysis yet'} · ${w.errors?`${count(w.errors,'error')} since it started (see the receiver’s terminal)`:'no errors'}`,w.errors?'warn':'')],
      ['Projects',v('projects',count(s.projects,'project'))],
      ['Visual packs',h('span',{class:'conn-inline'},v('packs',`${pk.installed} installed`),pk.needApproval?button({label:`${pk.needApproval} awaiting approval`,size:'sm',kind:'outline',onClick:()=>navigate('packs')}):null,pk.problems?pill(`${pk.problems} with problems`,'warn'):null)],
      ['Runs on',v('runtime',`${PLATFORMS[s.platform]||s.platform}${s.wsl?' (WSL)':''} · Node ${String(s.node).replace(/^v/,'')}`)]];
    const facts=h('dl',{class:'conn-facts'});for(const [k,val] of rows)facts.append(h('div',{class:'conn-fact'},h('dt',{text:k}),h('dd',{},val)));
    const data=s.dataDir?h('div',{class:'conn-data'},h('div',{class:'conn-data-head'},icon('folder'),h('strong',{text:'Data location'}),pill('On this computer','plain')),
        h('div',{class:'conn-data-body'},copyable(s.dataDir,{label:'Copy'}),h('p',{class:'faint small',text:'Projects, settings and the receiver’s token live here. Delete a project’s folder (or all of it) to erase it; see Security and privacy.'})))
      :h('div',{class:'conn-data'},h('div',{class:'conn-data-head'},icon('folder'),h('strong',{text:'Data location'})),h('p',{class:'faint small',text:'Not shown: this window has no control session with the receiver.'}));
    rebuild(receiverBody,h('div',{class:'conn-panel conn-receiver-panel'},facts,data));
  }
  // Static guidance: how to start and check the receiver (always beside its state, open: there is room for it).
  function troubleshooting(){
    const g=guidePanel('terminal','Start and check the receiver',
      h('div',{class:'conn-step'},h('span',{class:'faint small',text:'Start the receiver, in the Code Resonance folder'}),copyable('npm start')),
      h('div',{class:'conn-step'},h('span',{class:'faint small',text:'Check the setup: receiver, port, token, WSL'}),copyable('npm run doctor')),
      h('div',{class:'conn-step conn-step-row'},h('span',{class:'faint small',text:'VS Code, the receiver and agent hooks must run on the same side (all in WSL, or all on Windows).'}),
        button({label:'WSL guide',icon:'doc',size:'sm',onClick:()=>openDoc('WSL.md')})));
    g.classList.add('conn-guide-steps');return h('div',{class:'conn-guide-stack'},g);
  }
  // ---- VS Code ----------------------------------------------------------------------------------------------------
  const evidenceOf=id=>S.state.evidence.has(id)?S.state.evidence.get(id):undefined;
  const projects=()=>S.state.projects.slice().sort((a,b)=>(b.evidence?.lastReceivedAt||b.updatedAt||0)-(a.evidence?.lastReceivedAt||a.updatedAt||0));
  function focusId(){const list=S.state.projects;if(focus&&list.some(p=>p.id===focus))return focus;return list.some(p=>p.id===S.state.selected)?S.state.selected:projects()[0]?.id||'';}
  function renderEditors(){
    const list=projects(),now=Date.now(),id=focusId();
    if(!S.state.projectsLoaded){rebuild(editorList,h('p',{class:'faint small conn-pad',text:'Loading projects…'}));rebuild(editorDetail);rebuild(editorSettings);return;}
    if(!list.length){
      rebuild(editorList,h('p',{class:'faint small conn-pad',text:'No projects yet.'}));
      rebuild(editorDetail,callout({icon:'info',title:'No VS Code capture observed',body:`Install the extension (beside), open a folder in VS Code and run “${START}”. The project appears here within seconds.`}));
      rebuild(editorSettings);return;
    }
    rebuild(editorList,h('div',{class:'eyebrow conn-pad',text:'Projects · private names'}),h('div',{class:'conn-project-rows',role:'list','aria-label':'Projects'},...list.map(p=>{
      const ev=evidenceOf(p.id),st=editorState(ev,now),demo=ev?.demonstration||p.evidence?.demonstration;
      const b=h('button',{type:'button',role:'listitem',class:'conn-row',dataset:{key:`row:${p.id}`,project:p.id,state:st.key},'aria-current':p.id===id?'true':null,
          'aria-label':`${projectName(p)}: ${st.label}`,onClick:()=>{focus=p.id;navigate('connections',p.id);}},
        h('span',{class:['dot',st.key==='running'?'ok':st.kind==='warn'?'warn':'']}),
        h('span',{class:'grow'},h('strong',{class:'ellipsis',text:projectName(p)}),h('span',{class:'ellipsis',text:demo?`Demonstration · ${st.label}`:st.label})));
      return b;})),
      // Under the list: what its dots mean, and where the private names it shows may appear.
      h('div',{class:'conn-legend'},
        h('ul',{class:'conn-legend-dots','aria-label':'What the dots mean'},
          h('li',{},h('span',{class:'dot ok'}),h('span',{text:'Capture running'})),
          h('li',{},h('span',{class:'dot warn'}),h('span',{text:'Started but quiet, or unidentified'})),
          h('li',{},h('span',{class:'dot'}),h('span',{text:'Stopped or not observed'}))),
        h('p',{class:'faint small',text:'Folder names are private: shown in this Control Center only, never on the Stage, the OBS view or recordings.'})));
    renderDetail(id,now);
  }
  function renderDetail(id,now){
    const p=S.project(id),ev=evidenceOf(id),st=editorState(ev,now),demo=!!(ev?.demonstration||p?.evidence?.demonstration);
    if(!p){rebuild(editorDetail);rebuild(editorSettings);return;}
    const ed=ev&&!ev.building?ev.editor:null,r=ed?.reported,version=versionText(ev);
    const rows=[];
    if(ed?.capture.state){
      rows.push(['Capture started',dateTime(ed.capture.startedAt)]);
      if(ed.capture.state==='stopped')rows.push(['Stopped',dateTime(ed.capture.stoppedAt)]);
      rows.push(['Last editor activity',ed.lastAt?`${ago(ed.lastAt,now)} (${shortDateTime(ed.lastAt)})`:'—'],['Editor sessions seen',String(ed.sessions)],['Extension',version]);
      if(r)rows.push(['Window',r.remote?`Remote: ${r.remote}`:r.remote===''?'Local':'Not reported']);
    }
    const latest=integ?.vscode?.latestVersion,stale=r?.extensionVersion&&latest&&older(r.extensionVersion,latest);
    const port=r?.settings?.receiverPort,portMismatch=status&&Number.isFinite(port)&&port!==status.port;
    const dl=h('dl',{class:'conn-facts compact'});for(const [k,v] of rows)dl.append(h('div',{class:'conn-fact'},h('dt',{text:k}),h('dd',{text:v})));
    rebuild(editorDetail,
      h('div',{class:'conn-detail-head'},h('h3',{class:'title-m ellipsis',text:projectName(p)}),demo?pill('Demonstration (fictional)','warn'):null,h('span',{class:'grow'}),
        h('span',{id:'connEditorState',dataset:{state:st.key}},pill(st.label,st.kind))),
      st.detail?h('p',{class:'muted small',id:'connEditorDetail',text:st.detail}):null,
      rows.length?dl:null,
      stale?callout({icon:'info',body:`Extension ${latest} is available from this Code Resonance folder (see “Install or update the extension” beside).`}):null,
      portMismatch?callout({kind:'warn',icon:'warn',title:'Delivering to another port',body:`When it reported, this capture was sending to port ${port}, but this receiver listens on port ${status.port}. Its events go elsewhere or wait in the extension’s outbox until a receiver answers on that port.`}):null);
    renderSettings(id,ed,demo);
  }
  let settingsSig='';
  function renderSettings(id,ed,demo){
    const list=integ?.vscode?.settings;
    const sig=JSON.stringify([id,projectName(S.project(id)||{id}),ed?.reported||null,!!ed?.capture.state,list?.length||0,!!integ,demo]);if(sig===settingsSig)return;settingsSig=sig;
    if(!list){rebuild(editorSettings,integError?callout({kind:'warn',icon:'warn',body:`The extension’s settings list could not be loaded (${integError}).`}):null);return;}
    if(!ed?.capture.state){rebuild(editorSettings);return;}
    // The demonstration had no VS Code: a table of "not reported" values would suggest there is something to check.
    if(demo){rebuild(editorSettings,h('p',{class:'faint small',text:'This is the fictional demonstration: no VS Code was involved, so there are no capture settings to show.'}));return;}
    const r=ed.reported;
    const headLine=r?`Reported by extension ${r.extensionVersion||'(version not given)'} on ${dateTime(r.at)}, ${r.kind==='workspace.settings'?'when a setting changed while capturing':'at capture start'}.`
      :'This capture did not report its settings (extension older than 0.5). The defaults below are only defaults, not what that VS Code uses.';
    const table=h('div',{class:'conn-table',role:'table','aria-label':'Code Resonance settings in VS Code'},
      h('div',{class:'conn-tr head',role:'row'},h('span',{role:'columnheader',text:'Setting'}),h('span',{role:'columnheader',text:'Reported by VS Code'}),h('span',{role:'columnheader',text:'Default'})),
      ...list.map(s=>{
        const key=s.id.replace(/^resonance\./,''),value=r?r.settings?.[key]:undefined,known=value!==undefined&&value!==null,differs=known&&value!==s.default,why=PRIVACY[s.id];
        const copy=button({icon:'copy',kind:'ghost',size:'sm',attrs:{'aria-label':`Copy the setting id ${s.id}`,dataset:{key:`copy:${s.id}`}},title:`Copy ${s.id}`,onClick:async()=>{
          try{await navigator.clipboard.writeText(s.id);toast(`Copied ${s.id}: paste it into VS Code’s Settings search.`,'ok');}catch{toast(`Copy did not work here: the setting id is ${s.id}`,'warning');}}});
        return h('div',{class:['conn-tr',why?'private':'',differs?'differs':''],role:'row',dataset:{setting:s.id}},
          h('div',{role:'cell',class:'conn-setting'},h('div',{class:'conn-setting-name'},why?icon('shield'):null,h('strong',{text:settingName(s.id)})),
            h('div',{class:'conn-setting-id'},h('code',{text:s.id}),copy),
            h('p',{class:'faint small',text:why||s.description})),
          h('span',{role:'cell',class:['conn-value','num',known?'':'faint'],dataset:{reported:key},text:r?formatValue(value):'Not reported'},differs?h('span',{class:'conn-differs',text:'Not the default'}):null),
          h('span',{role:'cell',class:'conn-default num faint',text:formatValue(s.default)}));}));
    rebuild(editorSettings,h('div',{class:'conn-settings-head'},
        h('div',{class:'conn-col-label'},h('span',{class:'dot'}),h('span',{class:'eyebrow ellipsis',text:`Capture settings · ${projectName(S.project(id)||{id})}`})),
        h('span',{class:'faint small',id:'connReportedAt',text:headLine})),table);
  }
  // Guidance for VS Code: capture is started, stopped and configured in VS Code itself; this page only explains how.
  function renderVsGuide(){
    const v=integ?.vscode;
    if(!v){rebuild(vsGuide,h('p',{class:'faint small',text:integError?`The extension’s details could not be loaded (${integError}).`:'Loading…'}));rebuild(vsChange);return;}
    if(vsGuide.dataset.ready)return; // static once loaded: keeps the disclosure open or closed as the person left it
    vsGuide.dataset.ready='1';
    rebuild(vsGuide,
      // A neutral icon: next to a heading about starting capture, a play triangle would read as a Start button.
      guidePanel('terminal','Start or stop capture, in VS Code',
        h('p',{class:'muted small',text:'In VS Code, open the Command Palette (Ctrl+Shift+P) and run a command. Copy its name here to paste it there.'}),
        h('div',{class:'conn-guide-commands'},
          h('div',{class:'conn-step conn-command'},h('span',{class:'faint small',text:'To start (accept local capture when asked)'}),copyable(START)),
          h('div',{class:'conn-step conn-command'},h('span',{class:'faint small',text:'To stop (or click the CR item in the status bar)'}),copyable(STOP))),
        h('p',{class:'faint small',text:'This page shows a capture as running only while editor events keep arriving; VS Code does not report closing.'})),
      h('div',{class:'conn-guide conn-install'},disclosure({summary:`Install or update the extension (${v.latestVersion})`},
        h('div',{class:'conn-step'},h('span',{class:'faint small',text:`1. Package it, in the Code Resonance folder (creates code-resonance-${v.latestVersion}.vsix there)`}),command(v.install.package)),
        h('div',{class:'conn-step'},h('span',{class:'faint small',text:'2. Install it into VS Code (on the side where your workspace runs: inside WSL for a WSL folder)'}),command(v.install.install)),
        h('div',{class:'conn-step'},h('span',{class:'faint small',text:'3. Then start capture in VS Code, as described above.'})))));
    rebuild(vsChange,
      guidePanel('sliders','Change a capture setting',
        h('ol',{class:'conn-steps'},h('li',{text:'In VS Code, open Settings (Ctrl+, — on macOS ⌘,).'}),
          h('li',{},'Search for the setting id (copy it from the list), for example ',h('code',{text:'resonance.captureTerminalCommands'}),'.'),
          h('li',{text:'Change it there. Nothing changes here until VS Code reports it, at the next capture start or when it changes while capturing.'})),
        h('div',{class:'conn-change-link'},h('a',{class:'btn outline sm',id:'connOpenVsSettings',href:v.openSettingsUri},icon('external'),h('span',{text:'Open Code Resonance settings in VS Code'})),
          h('span',{class:'faint small',text:'Works with extension 0.5 or later. Your system asks before opening VS Code; the link only opens the settings.'}))));
  }
  // ---- Agent hooks (Claude Code, Cursor, Codex, then the others one at a time) -------------------------------------
  // `entry` is the integrations entry shown (integ[slug], or the chosen tool of integ.agents); the fixed facts are filled
  // once per `key` (the tool), the observed activity on every render.
  function renderHook(slug,{observed,info,setup,empty,footnote,entry=integ?.[slug],key=slug,extra=null}){
    const Cap=slug[0].toUpperCase()+slug.slice(1),c=entry,now=Date.now();
    if(!c){rebuild(observed,h('p',{class:'faint small',text:integError?`Not available (${integError}).`:'Loading…'}));rebuild(info);rebuild(setup);delete info.dataset.key;return;}
    // An entry that names its provider says when a project's events did not come through its hook (scripts/event.js).
    const other=p=>c.provider&&p.source&&p.source!==`${c.provider}-hook`;
    rebuild(observed,
      c.projects.length?h('div',{class:'conn-list',id:`conn${Cap}Projects`},...c.projects.slice().sort((a,b)=>(b.lastAt||0)-(a.lastAt||0)).map(p=>h('div',{class:'conn-list-row',dataset:{project:p.projectId}},
          h('span',{class:['dot',p.lastAt&&now-p.lastAt<RUNNING_MS?'ok':'']}),h('span',{class:'grow ellipsis',text:projectName({id:p.projectId,name:p.name})}),
          h('span',{class:'faint small num',text:`${count(p.events,'event')} · ${ago(p.lastAt,now)}${other(p)?' · not through the hook':''}`}))))
        :h('p',{class:'muted small',id:`conn${Cap}Projects`,text:empty}));
    if(info.dataset.key===key)return;
    info.dataset.key=key;
    rebuild(info,
      h('div',{class:'conn-capture'},
        h('div',{},h('div',{class:'conn-capture-head'},icon('check'),h('strong',{text:'Sent to this receiver'})),h('ul',{class:'conn-bullets'},...c.captured.map(x=>h('li',{text:x})))),
        h('div',{},h('div',{class:'conn-capture-head'},icon('lock'),h('strong',{text:'Never sent'})),h('ul',{class:'conn-bullets'},...c.excluded.map(x=>h('li',{text:x}))))),
      h('p',{class:'faint small',text:footnote}));
    rebuild(setup,h('div',{class:'conn-guide-head'},icon('sliders'),h('strong',{text:'What gets installed'})),
      h('div',{class:'conn-hook-events'},h('span',{class:'faint small',text:'Hook events used'}),h('div',{class:'conn-chips'},...c.events.map(e=>h('code',{text:e})))),
      ...(c.adapter?[h('div',{class:'conn-step'},h('span',{class:'faint small',text:'Each hook runs'}),h('code',{class:'conn-adapter conn-cmd'},...words(`node ${JSON.stringify(c.adapter)}`,true)))]:[]),
      ...(extra?extra(c):[]));
  }
  const renderClaude=()=>renderHook('claude',{observed:claudeObserved,info:claudeInfo,setup:claudeSetup,empty:'No Claude Code events observed.',
    footnote:'Hooks only receive the lifecycle events Claude Code documents; nothing here sees the model’s reasoning. The adapter never writes to Claude Code’s output and always exits successfully, so it cannot change what Claude does.'});
  const renderCursor=()=>renderHook('cursor',{observed:cursorObserved,info:cursorInfo,setup:cursorSetup,empty:'No Cursor events observed.',
    footnote:'Hooks only receive the after-events Cursor documents; nothing here sees the model’s reasoning. The adapter never writes to Cursor’s output and always exits successfully, so it cannot change what Cursor does. Prove these hooks only in a trusted workspace.'});
  // The other tools: a tab per tool (its dot is live while its events arrive), the chosen one's activity, facts and flow.
  function renderMore(){
    const list=integ?.agents||[],now=Date.now();
    if(list.length&&!list.some(t=>t.slug===moreSlug))moreSlug=list[0].slug;
    const t=moreTool();
    rebuild(moreTools,...list.map(x=>{const last=Math.max(0,...x.projects.map(p=>p.lastAt||0)),on=x.slug===moreSlug;
      return h('button',{type:'button',role:'tab',class:'conn-tool',id:`connTool-${x.slug}`,'aria-selected':String(on),tabIndex:on?0:-1,dataset:{key:`tool:${x.slug}`,tool:x.slug},
          title:x.projects.length?`${x.name}: events from ${count(x.projects.length,'project')}, the last ${ago(last,now)}`:`${x.name}: no events observed`,
          onClick:()=>chooseTool(x.slug),onKeydown:e=>toolKey(e,x.slug)},
        h('span',{class:['dot',last&&now-last<RUNNING_MS?'ok':'']}),h('span',{text:x.name}));}));
    renderHook('more',{observed:moreObserved,info:moreInfo,setup:moreSetup,entry:t,key:t?.slug||'',empty:t?`No ${t.name} events observed.`:'',
      footnote:t?`Hooks only receive the events ${t.name} documents; nothing here sees the model’s reasoning. The adapter never writes to ${t.name}’s output and always exits successfully, so it cannot deny, block or change what ${t.name} does. Only what its documented payloads name is read: anything else becomes no event.`:'',
      extra:c=>[h('div',{class:'conn-step'},h('span',{class:'faint small',text:'In the project'}),h('code',{class:'conn-cmd',id:'connMoreTarget'},...words(c.file,true))),
        h('p',{class:'faint small',text:c.trust}),
        h('p',{class:'faint small'},'Reference: ',h('a',{href:c.docs,target:'_blank',rel:'noopener noreferrer',text:`${c.name} hooks documentation`}),'.'),
        h('div',{},button({label:'What each tool documents',icon:'doc',size:'sm',kind:'outline',id:'connAgentsDoc',onClick:()=>openDoc('AGENTS.md')}))]});
  }
  function chooseTool(slug){if(slug===moreSlug)return;moreSlug=slug;more.retarget();renderMore();}
  // Arrow keys move between the tabs (and choose), Home and End go to the ends.
  function toolKey(e,slug){
    const list=integ?.agents||[],i=list.findIndex(t=>t.slug===slug);if(i<0)return;
    const j=e.key==='ArrowRight'||e.key==='ArrowDown'?(i+1)%list.length:e.key==='ArrowLeft'||e.key==='ArrowUp'?(i-1+list.length)%list.length:e.key==='Home'?0:e.key==='End'?list.length-1:-1;
    if(j<0)return;e.preventDefault();chooseTool(list[j].slug);document.getElementById(`connTool-${list[j].slug}`)?.focus();
  }
  const renderCodex=()=>renderHook('codex',{observed:codexObserved,info:codexInfo,setup:codexSetup,empty:'No Codex events observed.',
    footnote:'Hooks only receive the lifecycle events Codex documents; nothing here sees the model’s reasoning. Paths come from patch headers only, never hunk text. The adapter never writes to Codex’s output and always exits successfully, so it cannot deny, block or change what Codex does. PreToolUse is not installed. Prove these hooks only in a trusted workspace.'});
  // `api` names the route's tool (the More agents flow changes it with its tab; `retarget` starts over), `entry` its
  // integrations entry; texts may be functions of the current tool.
  function hookFlow({slug,commandFallback,help,emptyPath,installNext,removeNext,api=()=>slug,entry=()=>integ?.[slug]}){
    const Cap=slug[0].toUpperCase()+slug.slice(1),id=n=>`conn${Cap}${n}`,val=v=>typeof v==='function'?v():v;
    let plan=null;
    const input=h('input',{class:'input mono',id:id('Path'),type:'text',spellcheck:'false',autocomplete:'off',placeholder:'/home/you/projects/my-app','aria-describedby':id('PathHelp')});
    // The folder path names a private project: it is never kept in browser storage (and a value an earlier version kept is dropped).
    const uiKey=`connections${Cap}Path`;if(S.state.ui[uiKey]!==undefined)S.setUi({[uiKey]:undefined});
    const err=h('div',{class:'conn-error',id:id('PathError'),role:'alert'});
    const action=segmented({label:'Change to make',id:id('Action'),options:[{value:'install',label:'Add the hooks'},{value:'remove',label:'Remove the hooks'}],value:'install',onChange:()=>reset()});
    const show=button({label:'Show the change',kind:'primary',id:id('Show'),type:'submit'});
    const cli=command('');
    const result=h('div',{class:'conn-plan',id:id('Plan'),'aria-live':'polite'});
    const helpEl=h('p',{class:'faint small',id:id('PathHelp'),text:val(help)});
    const form=h('form',{class:'conn-form',noValidate:true,onSubmit:e=>{e.preventDefault();void busyShow();}},
      h('label',{class:'field-label',for:id('Path'),text:'Project folder (absolute path)'}),
      input,err,h('div',{class:'conn-form-row'},action,show),helpEl);
    input.addEventListener('input',()=>{err.replaceChildren();input.removeAttribute('aria-invalid');updateCli();if(plan)reset();});
    function updateCli(){const t=entry()?.command||commandFallback,p=input.value.trim();cli.set(p?t.replace('/path/to/project',quote(p)):t);}
    // The texts again (the tool's entry arrived or changed), and for another tool a fresh start: no plan, no error.
    function refresh(){helpEl.textContent=val(help);updateCli();}
    function retarget(){reset();err.replaceChildren();input.removeAttribute('aria-invalid');refresh();}
    function reset(){plan=null;result.replaceChildren();}
    function busyShow(){const p=planFor(input.value.trim(),action.value);show.disabled=true;show.setAttribute('aria-busy','true');
      return p.finally(()=>{show.disabled=false;show.removeAttribute('aria-busy');});}
    async function planFor(projectPath,act){
      err.replaceChildren();input.removeAttribute('aria-invalid');
      if(!projectPath){fieldError(val(emptyPath));return;}
      if(!/^(\/|[A-Za-z]:[\\/]|\\\\)/.test(projectPath)){fieldError('Enter an absolute path, for example /home/you/projects/my-app or C:\\Users\\you\\my-app.');return;}
      const target=api();if(!target)return;
      try{plan={...await P.api.post(`/api/integrations/${target}/plan`,{projectPath,action:act}),projectPath,action:act,target};renderPlan();}
      catch(e){plan=null;result.replaceChildren();
        if(e.code==='invalid'&&e.data?.key==='projectPath')fieldError(sentence(e.message.replace(/^projectPath\b/,'This folder')));
        else result.append(callout({kind:'danger',icon:'warn',title:'The change could not be prepared',body:sentence(e.message)}));}
    }
    function fieldError(m){input.setAttribute('aria-invalid','true');err.replaceChildren(icon('warn'),h('span',{text:m}));input.focus();}
    function renderPlan(){
      const ops=lineDiff(plan.current,plan.next),added=ops.filter(o=>o.t==='+').length,removed=ops.filter(o=>o.t==='-').length;
      const head=h('div',{class:'conn-plan-head'},h('div',{class:'grow'},h('span',{class:'eyebrow',text:plan.exists?'File':'New file'}),h('code',{class:'conn-file',id:id('File'),text:plan.file})),
        plan.changed?h('span',{class:'num small'},h('span',{class:'ok',text:`+${added}`}),' ',h('span',{class:'danger',text:`−${removed}`})):null);
      if(!plan.changed){result.replaceChildren(head,callout({icon:'check',body:plan.action==='install'?'The Code Resonance hooks are already in this file: nothing to add.':'This file has no Code Resonance hooks: nothing to remove.'}));return;}
      const write=button({label:'Write this change',kind:'primary',id:id('Write'),onClick:()=>apply()});
      const cancel=button({label:'Cancel',kind:'ghost',onClick:()=>{reset();input.focus();}});
      rebuild(result,head,
        plan.current&&/\r\n/.test(plan.current)?callout({kind:'warn',icon:'warn',body:'The file uses Windows line endings; it will be written with Unix line endings, so every line changes.'}):null,
        diffView(ops,`Change to ${plan.file}: ${added} lines added, ${removed} removed`),
        disclosure({summary:'The whole file after the change'},h('pre',{class:'conn-pre'},h('code',{text:plan.next}))),
        h('div',{class:'conn-plan-actions'},write,cancel,h('span',{class:'faint small',text:'Written only if the file is still exactly what is shown.'})));
      requestAnimationFrame(()=>write.focus({preventScroll:false}));
    }
    async function apply(){
      const p=plan;if(!p)return;
      try{const r=await P.api.post(`/api/integrations/${p.target}/apply`,{projectPath:p.projectPath,action:p.action,expectHash:p.currentHash});plan=null;
        result.replaceChildren(callout({kind:'accent',icon:'check',title:r.written?(p.action==='install'?'Hooks added':'Hooks removed'):'Nothing was written',
          body:r.written?h('div',{},h('div',{},'Written to ',h('code',{text:r.file}),'.'),h('div',{text:val(p.action==='install'?installNext:removeNext)}))
            :'The file already matched; it was left untouched.'}));
        result.querySelector('.callout')?.setAttribute('id',id('Result'));
      }catch(e){
        if(e.code==='changed'){const again=button({label:'Show the change again',kind:'primary',id:id('Again'),onClick:()=>planFor(p.projectPath,p.action)});
          result.replaceChildren(callout({kind:'warn',icon:'warn',title:'The file changed meanwhile',body:'Nothing was written. Review the change against the file as it is now.',actions:[again]}));plan=null;again.focus();}
        else toast(`The change was not written: ${sentence(e.message)}`,'error');
      }
    }
    updateCli();
    const el=h('div',{class:'conn-guide conn-flow'},h('div',{class:'conn-flow-head'},h('div',{class:'conn-guide-head'},icon('terminal'),h('strong',{text:'Install or remove the hooks'})),h('span',{class:'faint small',text:'Shows the exact change first; writes nothing until you accept it.'})),
      form,
      disclosure({summary:'Or use the command line'},h('p',{class:'faint small',text:'In the Code Resonance folder. It adds the same hooks directly, without showing the change first (add --print to see the result instead of writing it). Removal is done here or by editing the file.'}),cli));
    return {el,result,updateCli,refresh,retarget};
  }
  const sentence=m=>{const s=String(m||'Unknown error');return s.charAt(0).toUpperCase()+s.slice(1)+(/[.!?]$/.test(s)?'':'.');};
  // ---- Other agents -----------------------------------------------------------------------------------------------
  function providers(){
    // Providers with an adapter of their own are listed in their section (More agents), whatever sent their events.
    const out=new Map(),hooked=new Set((integ?.agents||[]).map(t=>t.provider));
    for(const p of S.state.projects){const ev=evidenceOf(p.id);if(!ev||ev.building)continue;
      for(const [name,a] of Object.entries(ev.agents||{})){if(name==='claude-code'||name==='cursor'||name==='codex'||hooked.has(name))continue;
        const o=out.get(name)||{name,events:0,lastAt:0,projects:[],demo:false};o.events+=a.events;o.lastAt=Math.max(o.lastAt,a.lastAt||0);o.projects.push(projectName(p));
        o.demo=o.demo||ev.demonstration||a.source==='demonstration';out.set(name,o);}}
    return [...out.values()].sort((a,b)=>b.lastAt-a.lastAt);
  }
  function renderAgents(){
    const list=providers(),now=Date.now();
    rebuild(agentsObserved,
      list.length?h('div',{class:'conn-list',id:'connProviders'},...list.map(o=>h('div',{class:'conn-list-row',dataset:{provider:o.name}},
          h('span',{class:['dot',o.lastAt&&now-o.lastAt<RUNNING_MS&&!o.demo?'ok':'']}),
          h('span',{class:'grow stack'},h('strong',{class:'ellipsis',text:privateName(o.name)}),h('span',{class:'faint tiny ellipsis',text:o.projects.join(', ')})),
          o.demo?pill('Demonstration (fictional)','warn'):null,h('span',{class:'faint small num',text:`${count(o.events,'event')} · ${ago(o.lastAt,now)}`}))))
        :h('p',{class:'muted small',id:'connProviders',text:'No events observed from other agents.'}));
    if(agentsInfo.firstChild||!integ)return;
    const g=integ.generic;
    const cast=(integ.providers||[]).map(p=>p.display).filter(Boolean);
    agentsFacts.append(h('ul',{class:'conn-bullets'},
      h('li',{},h('code',{text:'--provider'}),' names the agent here; a provider appears in this list once its events arrive.'),
      cast.length?h('li',{text:`CAST: ${cast.join(' · ')}.`}):null,
      h('li',{},'With ',h('code',{text:'--text'}),' or ',h('code',{text:'--stdin'}),' only the length and a fingerprint are sent, unless ',h('code',{text:'--include-text'}),' is given.'),
      h('li',{text:'Events are sent with the receiver’s token, which the CLI reads from receiver-auth.json in the data folder. The token is never shown here.'})));
    agentsInfo.append(guidePanel('agent','Report what an agent does',
      h('p',{class:'muted small',text:'Any tool on this computer can report what an agent does, through the endpoint below or the command line.'}),
      h('dl',{class:'kv'},h('dt',{text:'Endpoint'}),h('dd',{},h('code',{text:`${g.endpoint} on ${location.origin}`})),h('dt',{text:'Command line'}),h('dd',{},command(g.cli))),
      h('div',{class:'conn-step'},h('span',{class:'faint small',text:'For example, from the Code Resonance folder:'}),
        command('node scripts/event.js --kind agent.tool.started --root /path/to/project --provider my-agent --tool Edit')),
      h('p',{class:'faint small'},h('code',{text:'--port'}),' and ',h('code',{text:'--data'}),' point it at another receiver.')));
  }
  // ---- Privacy ----------------------------------------------------------------------------------------------------
  function privacyView(){
    return h('div',{class:'conn-table privacy',role:'table','aria-label':'What is captured'},
      h('div',{class:'conn-tr head',role:'row'},h('span',{role:'columnheader',text:'What'}),h('span',{role:'columnheader',text:'Recorded on this computer'}),h('span',{role:'columnheader',text:'On the Stage, OBS or in exports'})),
      ...PRIVACY_TABLE.map(([what,rec,shown])=>h('div',{class:'conn-tr',role:'row'},h('strong',{role:'cell',text:what}),h('span',{role:'cell',class:'muted',text:rec}),h('span',{role:'cell',class:/^Never/.test(shown)?'ok':'',text:shown}))));
  }
  function privacyGuide(){
    return guidePanel('shield','Everything stays on this computer',
      h('p',{class:'muted small',text:'No accounts, telemetry or cloud services. Capture starts only when you start it in VS Code or install hooks.'}),
      h('div',{},button({label:'Security and privacy',icon:'shield',size:'sm',onClick:()=>openDoc('SECURITY.md')})));
  }
  // ---- Overview strip ---------------------------------------------------------------------------------------------
  function renderStrip(){
    const now=Date.now(),up=receiverUp();
    const real=S.state.projects.filter(p=>{const ev=evidenceOf(p.id);return !(ev?.demonstration||p.evidence?.demonstration);});
    const states=real.map(p=>editorState(evidenceOf(p.id),now).key);
    const running=states.filter(k=>k==='running').length,quiet=states.filter(k=>k==='quiet').length,seen=real.some(p=>evidenceOf(p.id)?.editor?.capture?.state);
    const mo=(integ?.agents||[]).filter(t=>t.projects.length),moLast=Math.max(0,...mo.flatMap(t=>t.projects.map(p=>p.lastAt||0))),cl=(integ?.claude?.projects||[]),clLast=Math.max(0,...cl.map(p=>p.lastAt||0)),cu=(integ?.cursor?.projects||[]),cuLast=Math.max(0,...cu.map(p=>p.lastAt||0)),cx=(integ?.codex?.projects||[]),cxLast=Math.max(0,...cx.map(p=>p.lastAt||0)),prov=providers().filter(o=>!o.demo),provLast=Math.max(0,...prov.map(o=>o.lastAt||0));
    const seg=(id,label,ic,state,line,sub)=>h('button',{type:'button',class:['conn-seg',state],dataset:{key:`seg:${id}`,seg:id},onClick:()=>jump(id)},
      h('span',{class:'conn-seg-label'},icon(ic),h('span',{class:'eyebrow',text:label})),h('span',{class:'conn-seg-line'},h('span',{class:['dot',state==='on'?'ok':state==='warn'?'warn':state==='off-danger'?'danger':'']}),h('strong',{text:line})),
      h('span',{class:'faint tiny ellipsis',text:sub}));
    rebuild(strip,
      seg('receiver','Receiver','cpu',up?'on':P.state.receiver===null&&!statusError?'idle':'off-danger',up?'Running':P.state.receiver===null&&!statusError?'Asking…':'Not answering',up?`${status.version} · ${location.host}`:'npm start'),
      seg('vscode','VS Code','code',running?'on':quiet?'warn':'idle',running?`${count(running,'capture')} running`:quiet?'Started, but quiet':seen?'No capture running':'No capture observed',
        `${count(real.length,'project')}${quiet&&running?` · ${quiet} quiet`:''}`),
      seg('claude','Claude Code','terminal',clLast&&now-clLast<RUNNING_MS?'on':'idle',cl.length?`Events ${ago(clLast,now)}`:'No events observed',cl.length?`in ${count(cl.length,'project')}`:'hooks not seen yet'),
      seg('cursor','Cursor','terminal',cuLast&&now-cuLast<RUNNING_MS?'on':'idle',cu.length?`Events ${ago(cuLast,now)}`:'No events observed',cu.length?`in ${count(cu.length,'project')}`:'hooks not seen yet'),
      seg('codex','Codex','terminal',cxLast&&now-cxLast<RUNNING_MS?'on':'idle',cx.length?`Events ${ago(cxLast,now)}`:'No events observed',cx.length?`in ${count(cx.length,'project')}`:'hooks not seen yet'),
      seg('more','More agents','terminal',moLast&&now-moLast<RUNNING_MS?'on':'idle',mo.length?`Events ${ago(moLast,now)}`:'No events observed',
        mo.length?mo.map(t=>t.name).join(' · '):`${count((integ?.agents||[]).length,'tool')}, hooks not seen yet`),
      seg('agents','Other agents','agent',provLast&&now-provLast<RUNNING_MS?'on':'idle',prov.length?count(prov.length,'provider'):'No events observed',prov.length?`last ${ago(provLast,now)}`:'generic endpoint ready'));
  }
  function jump(id){const s=document.getElementById(`conn-${id}`);if(!s)return;s.scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});heads[id]?.focus({preventScroll:true});}
  // ---- Loading and staying current ----------------------------------------------------------------------------------
  async function loadIntegrations(){
    // With the capability the response also names the adapter's path (shown as the hook command).
    try{integ=await P.api.request('GET','/api/integrations');integError=null;}
    catch{try{integ=await S.get('/api/integrations');integError=null;}catch(e){integError=e.message;}}
    claude.updateCli();cursor.updateCli();codex.updateCli();renderVsGuide();renderClaude();renderCursor();renderCodex();renderMore();more.refresh();renderAgents();renderEditors();renderStrip();
  }
  const pending=new Map();
  function later(key,fn,ms){if(pending.has(key))return;const t=setTimeout(()=>{pending.delete(key);timers.delete(t);fn();},ms);pending.set(key,t);timers.add(t);}
  // Full evidence for every project (the receiver announces capture-state changes; plain activity only moves the
  // project's lastReceivedAt, so a document older than that is fetched again, at most every few seconds).
  function syncEvidence(){
    for(const p of S.state.projects){
      if(!S.state.evidence.has(p.id)){later(`ev:${p.id}`,()=>S.loadEvidence(p.id),0);continue;}
      const ev=S.state.evidence.get(p.id),seen=p.evidence?.lastReceivedAt;
      if(ev&&!ev.building&&seen&&seen>(ev.lastReceivedAt||0))later(`ev:${p.id}`,()=>S.loadEvidence(p.id),3000);
      else if(ev?.building)later(`ev:${p.id}`,()=>S.loadEvidence(p.id),2000);
    }
  }
  async function refreshAll(){await Promise.all([loadStatus(),loadIntegrations(),S.loadProjects().then(()=>Promise.all(S.state.projects.map(p=>S.loadEvidence(p.id))))]);}
  let lastReceiver=P.state.receiver;
  offs.push(S.on(t=>{
    if(t.has('receiver')||t.has('changes')){if(t.has('receiver')&&P.state.receiver!==lastReceiver){lastReceiver=P.state.receiver;if(P.state.receiver)void loadStatus();}renderReceiver();renderStrip();}
    if(t.has('projects')||t.has('selection')){syncEvidence();later('integ',loadIntegrations,3000);renderEditors();renderStrip();}
    if(t.has('evidence')){syncEvidence();later('integ',loadIntegrations,1500);renderEditors();renderAgents();renderStrip();}
  }));
  const statusTimer=setInterval(()=>{if(!document.hidden)void loadStatus();},STATUS_MS);
  // Relative times ("2 min ago") and the running/quiet boundary move with the clock, not only with new data.
  const tick=setInterval(()=>{if(document.hidden)return;renderReceiver();renderEditors();renderClaude();renderCursor();renderCodex();renderMore();renderAgents();renderStrip();},TICK_MS);
  renderReceiver();renderEditors();renderVsGuide();renderClaude();renderCursor();renderCodex();renderMore();renderAgents();renderStrip();
  void loadStatus();void loadIntegrations();syncEvidence();
  return {
    route(next){focus=next?.[0]||'';renderEditors();},
    unmount(){for(const f of offs)f();clearInterval(statusTimer);clearInterval(tick);for(const t of timers)clearTimeout(t);}
  };
}};

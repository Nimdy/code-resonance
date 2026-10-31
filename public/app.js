'use strict';
// Code Resonance performance engine: the one player behind the Control Center, the Performance Stage and the OBS view.
// One performance clock drives both the music and the visuals: live = wall time minus the interpretation delay,
// replay = the playhead. Recorded cues are scheduled at their true times within each window, so sound and image
// coincide and follow the rhythm of the actual work rather than the arrival of network polls.
// The engine owns the stage (its canvases, the worlds, the music, the recorder) and exposes window.ResonancePlayer:
// commands plus change notifications. It renders no controls: the interface (public/ui/) drives it, and any number of
// interface views in this page share this one engine, so there is never a second renderer, scheduler or clock here.
(() => {
  const $=id=>document.getElementById(id);
  const canvas=$('stage'); const g=canvas.getContext('2d',{alpha:false});
  const params=new URLSearchParams(location.search);
  // 'living' is the project's own generative world (its Visual Recipe); the others are fixed visual languages. Nexus and
  // Nebula, 2D stages retired after 0.7.1, show Monolith: an OBS bookmark (?world=nebula) or a stored choice still plays.
  const WORLDS=['living','construct','city'],RETIRED={nexus:'city',nebula:'city'};
  const worldOf=w=>WORLDS.includes(w)?w:Object.hasOwn(RETIRED,w)?RETIRED[w]:null;
  // Film mode: the clock is driven frame by frame (window.__film), so a recorded performance renders deterministically.
  const FILM=params.has('film');
  const overlay=params.has('overlay');
  // ---- Change notifications ----------------------------------------------------------------------------------
  // Listeners receive the set of changed topics, batched per task, so a burst of updates costs one interface pass.
  const listeners=new Set(),dirty=new Set();let flushing=false;
  function changed(...topics){for(const t of topics)dirty.add(t);if(flushing)return;flushing=true;
    queueMicrotask(()=>{flushing=false;const topics=new Set(dirty);dirty.clear();for(const f of listeners){try{f(topics);}catch(e){console.error(e);}}});}
  // Administrative requests carry a control capability (POST /api/session, bound to this page's origin and to the
  // loopback socket); it is requested on the first administrative call and renewed once when the receiver restarted.
  // Capabilities are issued only to a paired browser, one that holds the receiver's pairing key. A browser gets it once
  // from a link (`npm run pair`, `npm start`, VS Code's Open Code Stage) carrying a single-use code that the receiver
  // exchanges for the key; the key stays in this origin's storage. The link's fragment is removed at once (fragments never
  // reach the server), also when a link is opened in a tab that already shows the application.
  const PAIR_KEY='code-resonance-pairing',readPairing=()=>{try{return localStorage.getItem(PAIR_KEY)||null;}catch{return null;}};
  let pendingCode=null;
  function takePairFragment(){
    const m=/(?:^#|[#&?])pair=([0-9a-f]{64}|[0-9a-f]{32})\b/.exec(location.hash);if(!m)return false;
    if(m[1].length===64){try{localStorage.setItem(PAIR_KEY,m[1]);}catch{}}else pendingCode=m[1];
    const rest=location.hash.replace(/[#&?]?pair=[0-9a-f]{32,64}/,'').replace(/^#?&/,'#');
    window.history.replaceState(null,'',location.pathname+location.search+(rest&&rest!=='#'?rest:''));return true;
  }
  takePairFragment();
  let pairing=readPairing()||pendingCode?'unknown':'unpaired';
  const api=(()=>{let capability=null,pending=null;
    function failure(status,data){const e=new Error(data?.error||`HTTP ${status}`);e.status=status;e.code=data?.code||null;e.data=data||null;return e;}
    function session({quiet=false}={}){if(!pending){const code=pendingCode;pending=fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(code?{code}:{pairing:readPairing()||undefined})})
      .then(async r=>{const data=await r.json().catch(()=>null);if(code)pendingCode=null;
        // A refusal announces itself (the interface offers to pair), except the silent check of a remembered key.
        if(!r.ok){if(data?.code==='pairing-required'){pairing='unpaired';changed(quiet&&!code?'pairing-checked':'pairing');}throw failure(r.status,data);}
        if(data.pairing){try{localStorage.setItem(PAIR_KEY,data.pairing);}catch{}}
        capability=data.capability;if(pairing!=='paired'){pairing='paired';changed('pairing');}return capability;}).finally(()=>{pending=null;});}
      return pending;}
    async function request(method,url,body,{retry=true,type=null}={}){
      if(!capability)await session();
      const init={method,headers:{'X-Resonance-Capability':capability},cache:'no-store'};
      if(body!==undefined){if(type){init.headers['Content-Type']=type;init.body=body;}else{init.headers['Content-Type']='application/json';init.body=JSON.stringify(body);}}
      const r=await fetch(url,init);
      if(r.status===401&&retry){capability=null;return request(method,url,body,{retry:false,type});}
      const data=await r.json().catch(()=>null);
      if(!r.ok)throw failure(r.status,data);
      return data;}
    // Pair with a link, its code, or the key itself: 'paired', 'refused' (not accepted), or 'offline' (no receiver).
    async function pair(input){const m=/([0-9a-f]{64}|[0-9a-f]{32})/.exec(String(input||''));if(!m)return 'refused';capability=null;
      if(m[1].length===64){try{localStorage.setItem(PAIR_KEY,m[1]);}catch{}}else pendingCode=m[1];
      try{await session();return 'paired';}catch(e){return e instanceof TypeError?'offline':'refused';}}
    // A link opened in a tab that already shows the application changes only the fragment.
    addEventListener('hashchange',()=>{if(takePairFragment()&&pendingCode)void session().catch(()=>{});});
    return {request,post:(url,body,o)=>request('POST',url,body,o),session,pair,get capability(){return capability;}};})();
  let selected=params.get('project')||'',model=null,etag='',mode='live',playback=false,replayPos=0,replayClock=0,speedChoice=4,windowUntil=null;
  let frame=null,scaledW=0,scaledH=0,replay=null,lastSeq=-1,delayMs=10500,feedCues=[],section='home',barPhase=0,receiverOk=null;
  // What is on stage: the graph as of the performance clock (every world reads it; `version` counts its changes), and
  // what Monolith animates from the cues (marks on the ground line, agents' last files).
  const scene={nodes:new Map(),edges:new Map(),groups:new Map(),marks:[],agents:new Map(),version:0};
  let firstBar=null,barNumber=0,musicKey='';
  const queue=[];
  const music=new window.ResonanceMusic(({index,section:s,key})=>{if(firstBar===null)firstBar=index;barNumber=index-firstBar+1;if(s)section=s;if(key)musicKey=key;});
  let selectedWorld='living';
  // Live recording of whatever is presented (recording.js): one player-owned compositor, every kind of world.
  const recording=window.ResonanceRecording.create();let packFrame=null,lastRecording=null;const flashes=[];
  let living=null,livingLoading=null,livingFailed=false,livingRetryAt=0,livingFor='',recipe=null,previewRecipe=null,previewNotice='';
  // A failed request or module download means the receiver is unreachable (restarting, stopped): retry, never give up a world for it.
  const unreachable=e=>e instanceof TypeError&&/fetch/i.test(e.message);
  // Visual packs (GET /api/packs); code packs run only in the isolated pack frame.
  let packs=[],packNotice='',stoppedPack=null,lastStop=null,overBudget={since:0,warned:false};const stoppedPacks=new Map();
  // Visual quality: AUTO adapts when frames are slow; a fixed level stays put (URL ?quality= / ?adapt=0 override).
  const QUALITY=['auto','0','1','2','3'];let qualityChoice='auto';
  // Recording size: the encoded video's dimensions. At a fixed size the world renders at exactly that size (16:9), and
  // the stage shows the same picture letterboxed; "stage" records the stage as it is on screen.
  const RECORD_SIZES={'1080p':[1920,1080],'720p':[1280,720]},RECORD_BITRATE={'1080p':8000000,'720p':5000000};
  let recordSize='720p',recordFrame=null,recordPace={frames:0,at:0,slowSince:0,warned:false},recordNotice='';
  const LABEL_MODES=['cinematic','explorer','stream','off'];
  let labelMode=LABEL_MODES.includes(params.get('labels'))?params.get('labels'):overlay?'stream':'cinematic';
  let captions=params.get('captions')!=='0';
  let construct=null,constructLoading=null,constructFailed=false,filmTime=0,filmSections=[],caption={text:'',at:-1e12},filmNote='';
  let soundEnabled=false,soundError='';
  // The stage is drawn only while some view shows it (or a recording needs it); the clock and schedule always run.
  let visible=true;
  // Transient messages for the interface (recording finished early, a pack over budget, …).
  const notices=[];let noticeSeq=0;
  // `action` (optional): what the message offers, e.g. {label:'Show Monolith', world:'city'}; the interface decides.
  function notify(text,kind='info',action=null){notices.push({id:++noticeSeq,text:String(text),kind,at:Date.now(),...(action?{action}:{})});if(notices.length>20)notices.shift();changed('notice');}
  if(worldOf(params.get('world')))selectedWorld=worldOf(params.get('world'));
  if(params.has('quality'))qualityChoice=params.get('adapt')==='0'?String(Math.max(0,Math.min(3,Number(params.get('quality'))||0))):'auto';
  if(params.get('adapt')==='0'&&!params.has('quality'))qualityChoice='0';
  const qualityLevel=()=>qualityChoice==='auto'?(Number(params.get('quality'))||0):Number(qualityChoice),qualityAdaptive=()=>qualityChoice==='auto';
  // What Auto found on this machine (host.js createQualityGovernor): the level the last living world settled at (the
  // next one starts there instead of at High), the measured frame rate, and whether no level makes WebGL usable here.
  // A machine that cannot render the living world is told so once per quality choice, with the lightweight 2D stage
  // (Monolith) offered; the world the viewer chose is never switched without them.
  let rendering={level:null,fps:null,degraded:false},autoLevel=null,degradedWarned=false,renderingCheck=0;
  // Artist layers that could not be drawn (host.js / layers.js isolate them): published on the world topic when the
  // list changes, so the Artist Studio can say which layer failed and why while the rest keeps drawing.
  let failuresSig='[]',failures=[];
  const layerFailures=()=>failures.map(f=>({...f}));
  function watchLayers(){
    const s=living?.remote?null:living?.stats?.()?.layers,list=s?[...(s.failed||[]),...(s.broken?[{id:null,name:'All layers',type:null,message:s.broken}]:[])]:[];
    const sig=JSON.stringify(list);if(sig!==failuresSig){failuresSig=sig;failures=list;changed('world');}
  }
  function watchRendering(){
    const now=performance.now();if(FILM||now-renderingCheck<1000||!living)return;renderingCheck=now;watchLayers();
    const p=living.performance?.()||living.stats?.();if(!p)return;
    const next={level:Number.isInteger(p.quality??p.level)?(p.quality??p.level):null,fps:Number.isFinite(p.fps)?p.fps:null,degraded:p.degraded===true};
    const moved=next.level!==rendering.level||next.degraded!==rendering.degraded;rendering=next;
    if(qualityAdaptive()&&next.level!==null)autoLevel=next.level;
    if(moved)changed('quality');
    if(next.degraded&&!degradedWarned&&selectedWorld==='living'){degradedWarned=true;
      const fps=next.fps===null?'':` (about ${Math.max(1,Math.round(next.fps))} frames per second)`;
      // Auto reports degraded only when no level helps (the lowest is slow too, or the GPU is not what slows the frames).
      notify(qualityAdaptive()||qualityLevel()>=3?`This machine cannot draw the living world smoothly at any quality${fps}. Monolith, a lightweight 2D stage, does not need WebGL; the living world stays selected until you choose another world.`
        :`The living world is too slow at the quality chosen for this device${fps}. Choose Auto in Settings › This device, or Monolith, a lightweight 2D stage that does not need WebGL.`,'warning',{label:'Show Monolith',world:'city'});}
  }
  if(params.get('style')&&window.ResonanceScore.STYLES.includes(params.get('style')))music.setOptions({style:params.get('style')});
  // Film mode has no Control Center: the score version is the rendered recipe's (genome.music.score; absent = the classic
  // score) unless the film asks for another (?score=), and the composed score's profile is the film's own (?music=, the
  // film.js --music flag; absent = as composed). The offline soundtrack is rendered with the same values (film.js).
  const filmMusic=FILM?{score:['2','3'].includes(params.get('score'))?Number(params.get('score')):null,profile:(()=>{
    try{const v=JSON.parse(params.get('music')||'null');return v&&typeof v==='object'&&!Array.isArray(v)?window.ResonanceScore.profileOf(v):null;}catch{return null;}})()}:null;
  if(FILM)music.setOptions({profile:filmMusic.profile});
  function filmScore(){const v=filmMusic.score??window.ResonanceScore.versionOf((living?.recipe||recipe)?.genome?.music?.score);if(music.options.scoreVersion!==v)music.setOptions({scoreVersion:v});return v;}
  const labels={
    'project.baseline':'Initial architecture scan','document.baseline.indexed':'Indexed existing symbols',
    'symbol.created':'A structure emerged','symbol.modified':'A structure evolved','symbol.removed':'A structure was reshaped',
    'dependency.added':'Systems connected','dependency.removed':'Dependency detached',
    'document.change.overflow':'Large code change','source.parse.diagnostics':'Source parser noticed errors',
    'editor.change.observed':'Code changed','editor.newline.inserted':'New line entered',
    'document.saved':'Document saved','file.created':'File created','file.deleted':'File removed','file.renamed':'File renamed',
    'execution.task.started':'A task began','execution.task.succeeded':'Task completed','execution.task.failed':'Task failed',
    'execution.task.unknown':'Task outcome unknown','execution.command.started':'Terminal activity','execution.command.finished':'Command finished',
    'validation.test.passed':'Tests passed','validation.test.failed':'Tests failed','validation.build.passed':'Build succeeded','validation.build.failed':'Build failed',
    'validation.typecheck.passed':'Types check','validation.typecheck.failed':'Type errors','validation.lint.passed':'Lint clean','validation.lint.failed':'Lint issues',
    'validation.diagnostics':'Editor diagnostics','milestone.refactor.validated':'Refactor validated',
    'repository.commit.observed':'New commit observed','repository.head.changed':'Branch switched','agent.prompt.submitted':'An AI prompt was sent','agent.thinking.visible':'Visible agent reasoning',
    'agent.tool.started':'An agent used a tool','agent.tool.completed':'Agent tool finished','agent.file.modified':'Agent modified a file',
    'agent.response.completed':'Agent completed a response','agent.message.visible':'AI message observed','agent.session.started':'Agent session began','agent.session.ended':'Agent session ended',
    'agent.subagent.started':'Subagent started','agent.subagent.stopped':'Subagent finished',
    'agent.plan.visible':'AI plan observed','workspace.started':'Capture started','workspace.stopped':'Capture stopped','instrument.note':'Manual cue','module.renamed':'A module was renamed'
  };
  const QUIET=new Set(['editor.change.observed','editor.newline.inserted','document.baseline.indexed','validation.diagnostics','execution.command.started','agent.tool.started']);
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  function readable(type){return labels[type]||type.replaceAll('.',' · ');}
  function kindClass(type){return type.startsWith('agent.')?'ai':type.startsWith('validation.')||type.startsWith('milestone.')||type==='source.parse.diagnostics'?'validation':type.startsWith('symbol.')||type.startsWith('dependency.')?'structure':'system';}
  function eventLabel(c){if(c.detail?.symbolType)return `${readable(c.type)} · ${c.detail.symbolType}`;return readable(c.type);}
  // ---- Performance clock and scheduling ------------------------------------------------------------------
  // Replay: the playhead advances once per animation frame; between frames it is extrapolated, so sound is scheduled
  // from the current position (from the last frame's, a cue scheduled after a 150 ms main-thread stall sounded 150 ms
  // late: qualification/results/sync/).
  function perfNow(){
    if(FILM)return filmTime;if(mode!=='replay')return Date.now()-delayMs;
    if(!playback||!replay)return replayPos;
    return Math.min(replay.end,replayPos+Math.min(300,Math.max(0,performance.now()-replayClock))*speedChoice);
  }
  function at(time,fn){let i=queue.length;while(i>0&&queue[i-1].time>time)i--;queue.splice(i,0,{time,fn});}
  function runQueue(){const now=perfNow();while(queue.length&&queue[0].time<=now)queue.shift().fn();}
  const cueTime=(cue,entry)=>clamp(cue.ts,entry.start,Math.max(entry.start,entry.end-1));
  // Schedules one recorded window: its frame at the window start, each cue at its own time.
  // Cues before `from` (e.g. earlier in a window that a seek lands inside) join the feed silently, never as a burst.
  function schedule(entry,{animate=true,from=-Infinity}={}){
    at(entry.start,()=>{applyFrame(entry.frame);applyDelta(entry.graph,entry.start,entry.end);construct?.applyDelta(entry.graph,entry.start,entry.end);living?.applyDelta(entry.graph,entry.start,entry.end);if(entry.frame)living?.observe?.(entry.frame,entry.start);});
    // Canonical intents (engine/intents.js) drive the living world's effects at their own recorded times.
    // Each intent carries its recorded position (window, index): with its timestamp, the canonical order of history.
    (entry.intents||[]).forEach((intent,k)=>{if(intent.ord===undefined)intent.ord=entry.seq*65536+k;const time=clamp(intent.ts,entry.start,Math.max(entry.start,entry.end-1));if(animate&&time>=from)at(time,()=>living?.intent(intent,time));});
    for(const cue of entry.cues){
      const time=cueTime(cue,entry),live=animate&&time>=from;
      if(live&&!QUIET.has(cue.type))music.enqueue(cue,time);
      at(time,()=>{if(live){animateCue(cue,time);construct?.cue(cue,time);living?.cue(cue,time);}feedCues.push(cue);if(feedCues.length>400)feedCues.splice(0,feedCues.length-400);changed('feed');});
    }
  }
  function applyFrame(f){if(!f)return;frame=f;music.setFrame(f);changed('frame');}
  // ---- Scene graph ----------------------------------------------------------------------------------------
  function addNode(n,born){
    // Districts (groups) are kept apart: the Construct and Monolith draw them, every world reads them from constructGraph().
    if(n.type==='group'){scene.groups.set(n.id,{...n});return;}
    const existing=scene.nodes.get(n.id);
    if(existing){const was=existing.counts;Object.assign(existing,{...n,dying:null});
      // Monolith grows a tower from what it showed when the file's symbols change (a seek rebuilds it settled).
      if(Number.isFinite(born)&&JSON.stringify(was)!==JSON.stringify(existing.counts))Object.assign(existing,{countsWas:was,countsAt:born});return;}
    scene.nodes.set(n.id,{...n,born,dying:null});
  }
  const edgeKey=e=>`${e.a}>${e.b}>${e.kind}`;
  // `birth` (replay) orders modules by when they first appeared, so every seek rebuilds the same scene.
  function resetScene(graph,birth){
    scene.nodes.clear();scene.edges.clear();scene.groups.clear();scene.marks.length=0;scene.agents.clear();scene.version++;
    for(const e of graph.edges)scene.edges.set(edgeKey(e),e);
    const parents=new Map();for(const e of graph.edges)if(e.kind==='contains')parents.set(e.b,e.a);
    const modules=graph.nodes.filter(n=>n.type==='module');
    if(birth)modules.sort((a,b)=>(birth.get(a.id)??Infinity)-(birth.get(b.id)??Infinity));
    for(const n of modules)addNode(n,-Infinity);
    for(const n of graph.nodes.filter(n=>n.type!=='module'))addNode({...n,parent:n.parent||parents.get(n.id)},-Infinity);
    construct?.reset(constructGraph(),perfNow());
    if(living){living.reset(constructGraph(),perfNow());if(replay&&mode==='replay')living.prime(replay.entries,perfNow());}
  }
  function constructGraph(){return {nodes:[...scene.groups.values(),...[...scene.nodes.values()].filter(n=>n.dying===null)],edges:[...scene.edges.values()]};}
  // Births are staggered across the window so new structure appears in step with the music.
  function applyDelta(d,start,end){
    if(!d)return;
    if(d.keyframe){
      if(!scene.nodes.size){resetScene(d);return;}
      // A keyframe is the full graph; express it as a delta against what is on stage.
      const ids=new Set(d.nodes.map(n=>n.id)),keys=new Set(d.edges.map(edgeKey));
      d={add:d.nodes.filter(n=>!scene.nodes.has(n.id)||scene.nodes.get(n.id).dying!==null),remove:[...scene.nodes.keys()].filter(id=>!ids.has(id)),
        addEdges:d.edges.filter(e=>!scene.edges.has(edgeKey(e))),removeEdges:[...scene.edges.values()].filter(e=>!keys.has(edgeKey(e)))};
    }
    scene.version++;
    for(const e of d.addEdges)scene.edges.set(edgeKey(e),e);
    for(const e of d.removeEdges)scene.edges.delete(edgeKey(e));
    const span=Math.max(1,end-start);
    d.add.filter(n=>n.type==='module').concat(d.add.filter(n=>n.type!=='module')).forEach((n,i,all)=>addNode(n,start+span*(i/Math.max(1,all.length))));
    for(const id of d.remove){const n=scene.nodes.get(id);if(n)n.dying=perfNow();}
  }
  // ---- Cue animation (Monolith), at the cues' own times: the file that changed lights up, an agent's mark stays over
  // the file it last worked on, a commit or a verified moment sweeps the ground line and a failure reddens it.
  function moduleFor(cue){return cue.detail?.fileId?scene.nodes.get(cue.detail.fileId):null;}
  function animateCue(c,time){
    const voice=Number.isInteger(c.detail?.voice)?c.detail.voice:null,target=moduleFor(c);
    if(target)target.litAt=time;
    if(voice!==null){const a=scene.agents.get(voice);if(target)scene.agents.set(voice,{id:target.id,at:time});else if(a)a.at=time;}
    if(/^milestone\.|^repository\.commit/.test(c.type)||(c.type==='validation.test.passed'&&(c.weight||0)>=1))scene.marks.push({at:time,kind:'lift'});
    if(c.type==='validation.test.failed'||c.type==='validation.build.failed')scene.marks.push({at:time,kind:'strain'});
    if(scene.marks.length>16)scene.marks.splice(0,scene.marks.length-16);
  }
  // ---- Data -----------------------------------------------------------------------------------------------
  async function getJSON(url,headers){const r=await fetch(url,{cache:'no-store',headers});if(r.status===304||r.status===404)return null;if(!r.ok)throw Error(`HTTP ${r.status}`);return {json:await r.json(),etag:r.headers.get('etag')||''};}
  function setReceiver(ok){if(receiverOk===ok)return;receiverOk=ok;document.body.dataset.receiver=ok?'connected':'offline';changed('receiver');}
  async function pollProject(){
    if(!selected)return;
    const id=selected;
    try{
      const r=await getJSON(`/api/project?id=${encodeURIComponent(id)}`,etag?{'If-None-Match':etag}:undefined);
      setReceiver(true);if(!r||id!==selected)return;etag=r.etag;model=r.json;
      if(!scene.nodes.size&&mode==='live'){resetScene(model.graph);frame=model.frames.at(-1)||frame;music.setFrame(frame);
        lastSeq=Math.max(lastSeq,(model.timelineFrames||0)-1);feedCues=model.timeline.slice(-60);}
      music.setProject(selected,model.performance?.identity);
      // The recipe holds the project's information mode whatever world shows (the living world loads it itself); asked
      // once the project exists on the receiver, never before.
      if(!recipe&&selectedWorld!=='living')void reloadRecipe();
      $('stageEmpty')?.classList.toggle('hidden',true);
      changed('model','feed','frame');
    }catch{setReceiver(false);}
  }
  async function pollTimeline(){
    if(!selected||mode!=='live'||!model)return;
    try{
      const page=(await getJSON(`/api/timeline?id=${encodeURIComponent(selected)}&after=${lastSeq}&limit=200`))?.json;if(!page)return;
      for(const entry of page.entries){lastSeq=entry.seq;schedule(entry,{animate:entry.end>=perfNow()-2000});}
    }catch{}
  }
  function selectProject(id){
    id=typeof id==='string'?id:'';if(id===selected&&(model||!id))return;
    selected=id;etag='';model=null;lastSeq=-1;replay=null;queue.length=0;feedCues=[];previewRecipe=null;previewNotice='';disposeLiving();resetScene({nodes:[],edges:[]});
    music.resync();frame=null;firstBar=null;barNumber=0;
    $('stageEmpty')?.classList.toggle('hidden',!!id);
    changed('project','model','feed','frame','recipe','preview','position');
    if(mode==='replay')changeMode('replay');else{pollProject();}
  }
  function history(){
    if(mode==='replay'&&replay)return replay;
    return {cues:feedCues,start:feedCues.at(0)?.ts||0,end:feedCues.at(-1)?.ts||0};
  }
  // Recent meaningful events (the feed): newest first, as of the playhead in a replay.
  function feed(limit=28){
    const filtered=history().cues.filter(c=>!QUIET.has(c.type));
    const source=mode==='replay'?filtered.filter(c=>c.ts<=replayPos):filtered;
    return source.slice(-limit).reverse().map(c=>({id:c.id,ts:c.ts,type:c.type,label:eventLabel(c),kind:kindClass(c.type),category:c.category,structural:!!c.weight,agent:c.detail?.attribution==='correlated',voice:Number.isInteger(c.detail?.voice)?c.detail.voice:null}));
  }
  // ---- Rendering ------------------------------------------------------------------------------------------
  function resize(){
    const r=canvas.getBoundingClientRect();if(r.width===0||r.height===0)return;
    scaledW=r.width;scaledH=r.height;const dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.floor(r.width*dpr)||canvas.height!==Math.floor(r.height*dpr)){
      canvas.width=Math.floor(r.width*dpr);canvas.height=Math.floor(r.height*dpr);g.setTransform(dpr,0,0,dpr,0,0);
    }
  }
  // Breathing on the bar grid, from the music when playing or from the deterministic grid when muted.
  let forcedPhase=null;
  function beat(){
    const p=music.phase();if(forcedPhase!==null)barPhase=forcedPhase;else if(p){barPhase=p.phase;if(p.section)section=p.section;}
    else{const stepMs=60000/((window.ResonanceScore.createIdentity(frame?.projectSeed||hash(selected)).tempo[music.options.style]||92)*4);barPhase=((perfNow()/(stepMs*16))%1+1)%1;}
    const q=(barPhase*4)%1;return Math.exp(-q*5);
  }
  function stepScene(now){
    for(const [id,n] of scene.nodes)if(n.dying!==null&&now-n.dying>1500)scene.nodes.delete(id);
    for(const [v,a] of scene.agents)if(now-a.at>60000)scene.agents.delete(v);
  }
  // ---- Monolith (Canvas 2D, public/worlds/monolith.js), loaded on demand: the lightweight stage, and the last fallback --
  let monolith=null,monolithLoading=null,monolithRetryAt=0;
  function ensureMonolith(){
    if(monolith||monolithLoading||performance.now()<monolithRetryAt)return monolithLoading||Promise.resolve(monolith);
    monolithLoading=import('./worlds/monolith.js').then(m=>{monolith=m.createMonolith();return monolith;},e=>{monolithRetryAt=performance.now()+2000;if(!unreachable(e))console.error(e);return null;})
      .finally(()=>{monolithLoading=null;});
    return monolithLoading;
  }
  // Reduced motion (Settings › Interface, else the system's preference) stills Monolith; a film never asks.
  const reduceQuery=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
  function stillMotion(){if(FILM)return false;const m=document.documentElement.dataset.motion;return m==='reduce'||m!=='full'&&!!reduceQuery?.matches;}
  // ---- The Construct (WebGL), loaded on demand; Monolith is the fallback where WebGL is unavailable ----------
  function replaySpeed(){return FILM?filmSpeed:mode==='replay'?speedChoice||1:1;}
  let filmSpeed=1;
  function ensureConstruct(){
    if(construct||constructFailed)return Promise.resolve(construct);
    if(!constructLoading)constructLoading=import('./construct.js').then(m=>{
      try{construct=m.createConstruct($('construct'),{onCaption:showCaption,film:FILM,speed:replaySpeed()});construct.reset(constructGraph(),perfNow());}
      catch(e){console.error('Construct unavailable, using Monolith',e);constructFailed=true;construct=null;if(selectedWorld==='construct'){selectedWorld='city';changed('world');}notify('The Construct needs WebGL, which is not available here: showing Monolith instead.','warning');}
      constructLoading=null;return construct;
    },e=>{constructLoading=null;if(!unreachable(e))console.error(e);return null;});
    return constructLoading;
  }
  // ---- The living world: the project's Visual Recipe rendered by public/worlds (WebGL2) --------------------------------
  function freshWorldCanvas(){const old=$('world'),next=old.cloneNode(false);old.replaceWith(next);return next;}
  function disposeLiving(){if(living){living.dispose();living=null;freshWorldCanvas();}livingFailed=false;livingFor='';recipe=null;changed('world','recipe');}
  async function loadPacks(){
    // A receiver that cannot be reached (restarting, or stopped) says nothing about the packs: keep what was known and
    // leave a running pack alone.
    let fresh;try{fresh=(await getJSON('/api/packs'))?.json?.packs;}catch{return packs;}
    packs=fresh||[];
    // A running pack whose approval was revoked, whose files changed or which was removed stops at once.
    if(living?.remote){const p=packs.find(x=>x.id===living.pack.id);
      if(!p)stopPack(living.pack,'the pack was removed');else if(!p.ok)stopPack(living.pack,'its files changed after approval');
      else if(!p.trusted||p.digest!==living.pack.digest)stopPack(living.pack,'its approval was revoked');}
    changed('packs');return packs;}
  // Stop a pack for this session (the recipe keeps it: RETRY or a new approval restores it), finishing any recording.
  function stopPack(pack,reason){
    if(stoppedPacks.has(pack.id)&&!living?.remote)return;
    const began=performance.now();
    stoppedPacks.set(pack.id,reason);stoppedPack=pack;packNotice=`${pack.name} stopped: ${reason}`;
    if(recording.active)void finishRecording(`${pack.name} stopped`);
    changed('notice','world');
    if(!FILM&&living?.remote&&living.pack.id===pack.id){disposeLiving();if(selectedWorld==='living')void ensureLiving();}
    lastStop={at:began,pack:pack.id,reason,disposeMs:+(performance.now()-began).toFixed(1)};
  }
  // The manual retry after a pack was stopped (nothing restarts on its own).
  function retryPack(){if(!stoppedPack)return false;stoppedPacks.delete(stoppedPack.id);stoppedPack=null;packNotice='';disposeLiving();if(selectedWorld==='living')void ensureLiving();changed('notice');return true;}
  // What a recipe needs from a pack with code: its approved files for the isolated frame, or why it cannot run.
  async function packRuntime(r){
    const id=r.familyKind==='pack'?r.family:r.pack?.kind==='shader'?r.pack.id:null;if(!id)return null;
    const p=(await loadPacks()).find(x=>x.id===id);
    if(!p||!p.ok||!p.compatible)return {blocked:'unavailable',id,name:p?.name||id};
    if(stoppedPacks.has(id))return {blocked:'stopped',id,name:p.name,reason:stoppedPacks.get(id)};
    if(!p.trusted)return {blocked:'approval',id,name:p.name};
    // Every file is checked here against the hash recorded at installation, and the set against the approved digest,
    // before anything reaches the frame (the receiver checks too: a file changed after approval is never served).
    const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
    const sha=async data=>hex(await crypto.subtle.digest('SHA-256',data));
    const bytes={};
    for(const f of p.files){const res=await fetch(`/api/packs/file?id=${encodeURIComponent(id)}&path=${encodeURIComponent(f.path)}`,{cache:'no-store'});
      if(!res.ok)throw new Error(`${f.path}: HTTP ${res.status}`);const b=await res.arrayBuffer();if(await sha(b)!==f.sha256)throw new Error(`${f.path} does not match its approved hash`);bytes[f.path]=b;}
    if(await sha(new TextEncoder().encode(p.files.map(f=>`${f.path}\0${f.sha256}`).join('\n')))!==p.digest)throw new Error('the pack does not match its approved digest');
    const text=b=>new TextDecoder().decode(b),manifest=JSON.parse(text(bytes['pack.json'])),files={};
    for(const f of p.files)if(f.path!=='pack.json'&&!/^(?:README|LICENSE)/.test(f.path))files[f.path]=/\.(?:png|jpg)$/.test(f.path)?bytes[f.path]:text(bytes[f.path]);
    const spec=manifest.kind==='world'?{entry:manifest.world.entry}:{background:manifest.shader.background||null,post:manifest.shader.post||[],effects:manifest.shader.effects||null};
    return {pack:{id,name:p.name,kind:p.kind,digest:p.digest,budget:p.budget||null,...spec},files};
  }
  const runtimeOf=r=>r?.familyKind==='pack'?`world:${r.family}`:r?.pack?.kind==='shader'?`shader:${r.pack.id}`:'builtin';
  function ensureLiving(){
    if(living&&livingFor===selected)return Promise.resolve(living);
    if(livingFailed||!selected||!model||performance.now()<livingRetryAt)return Promise.resolve(null);
    if(livingLoading)return livingLoading;
    livingLoading=(async()=>{
      const id=selected;
      try{
        const r=await getJSON(`/api/recipe?id=${encodeURIComponent(id)}`);if(!r||id!==selected)return null;
        // A preview shows a candidate recipe (never stored) in place of the saved one, through the same host.
        const candidate=previewRecipe;
        const plan=await packRuntime(candidate||r.json).catch(e=>{if(unreachable(e))throw e;return {blocked:'unavailable',name:String(e.message)};});
        if(id!==selected)return null;
        if(living)disposeLiving();
        recipe=r.json;packNotice='';previewNotice='';
        // A pack the recipe names but the receiver cannot serve (removed, or its files changed after installation).
        const missing=recipe.unavailable&&(recipe.unavailable.family||recipe.unavailable.pack);
        if(missing&&!candidate){const p=packs.find(x=>x.id===missing),name=p?.name||missing,reason=stoppedPacks.get(missing);
          packNotice=reason?`${name} stopped: ${reason}. Showing the identity without it.`:`${name} is not available${p&&!p.ok?' (its installed files changed)':''}: showing the identity without it.`;}
        const options={film:FILM,speed:replaySpeed(),labels:labelMode,quality:FILM?0:qualityLevel(),adaptive:!FILM&&qualityAdaptive(),...(!FILM&&qualityAdaptive()&&autoLevel!==null?{level:autoLevel}:{})};
        if(plan?.pack){
          // An approved pack with code: the same world host, inside the isolated frame.
          const m=await import('./worlds/remote.js');
          living=await m.createRemoteWorld($('world').parentElement,{...plan,recipe:candidate||recipe,...options,epoch:replay?.entries.length?replay.start:null});
          // A pack that fails, hangs, loses its GPU context or is too slow is stopped; the identity without it takes over.
          const pack=plan.pack;living.onError(message=>stopPack(pack,message));
          if(recording.active)living.record(onPackFrame);overBudget={since:0,warned:false};
        }else{
          // A pack that needs approval (or is missing) is not run: the identity without it is shown instead. A preview of
          // such a pack shows nothing of it (an unapproved pack never runs because it is previewed).
          let shown=candidate||recipe;
          if(plan?.blocked){const why=plan.blocked==='approval'?`${plan.name} contains code and is not approved`:plan.blocked==='stopped'?`${plan.name} stopped: ${plan.reason}`:`${plan.name} is not available`;
            if(candidate){previewNotice=`${why}: the preview shows the saved identity instead.`;shown=recipe;}
            else packNotice=`${why}: showing the identity without it.`;
            if(!candidate||runtimeOf(recipe)!=='builtin')shown=(await getJSON(`/api/recipe?id=${encodeURIComponent(id)}&fallback=1`))?.json||recipe;}
          const m=await import('./worlds/host.js');
          living=await m.createWorld($('world'),{overlayCanvas:FILM?null:$('worldOverlay'),recipe:shown,...options});
        }
        if(id!==selected){disposeLiving();return null;}
        // A quality chosen while the world was being built (the device settings arrive while its shaders compile) found
        // no world to tell: the new world gets the current choice, not the one it was started with.
        if(!FILM&&(options.quality!==qualityLevel()||options.adaptive!==qualityAdaptive()))living.setQuality?.(qualityLevel(),qualityAdaptive());
        livingFor=selected;livingSize='';
        if(replay?.entries.length)living.setEpoch(replay.start);
        living.reset(constructGraph(),perfNow());
        if(replay&&(mode==='replay'||FILM))living.prime(replay.entries,perfNow());
        else if(mode==='live')void primeLive(living);
        changed('recipe','world','notice','preview');
      }catch(e){
        if(unreachable(e)){if(living)disposeLiving();livingRetryAt=performance.now()+2000;return null;}
        console.error('Living world unavailable, using the Construct',e);livingFailed=true;living=null;
        if(selectedWorld==='living'){selectedWorld='construct';changed('world');void ensureConstruct();}
        notify(`The living world could not start here (${e.message}): showing the Construct.`,'warning');}
      finally{livingLoading=null;}
      return living;
    })();
    return livingLoading;
  }
  // Live: the world learns the session so far (agent lifecycles, verified milestones) from the recorded intents only.
  async function primeLive(world){
    // The whole history's intents (the intents view is small), so unlocks and lasting blooms match a full replay.
    const id=selected,intents=[];let after=-1;
    for(let page=0;page<1000;page++){const r=(await getJSON(`/api/timeline?id=${encodeURIComponent(id)}&after=${after}&limit=2000&fields=intents`))?.json;if(!r||!r.entries.length||selected!==id)break;
      for(const e of r.entries)if(e.intents?.length)intents.push({seq:e.seq,intents:e.intents});after=r.entries.at(-1).seq;if(after>=r.total-1)break;}
    if(world===living&&mode==='live'&&selected===id)living.prime(intents,perfNow());
  }
  // A saved recipe (after an edit here, or another window's edit announced by the receiver): a change of runtime
  // (built-in family, pack world, shader look) builds a new world; otherwise the recipe updates the running one.
  async function showSaved(next){
    if(!next)return;const before=recipe;recipe=next;changed('recipe');
    if(previewRecipe)return;
    if(!living)return;
    if(runtimeOf(before)!==runtimeOf(next)||living.remote||next.unavailable||before?.unavailable){disposeLiving();if(selectedWorld==='living')await ensureLiving();}
    else await living.setRecipe(next);
  }
  async function recipeAction(action,{ifRevision}={}){
    if(!selected)return null;
    const body=Array.isArray(action)?{actions:action}:{action};if(Number.isInteger(ifRevision))body.ifRevision=ifRevision;
    const id=selected,next=await api.post(`/api/recipe?id=${encodeURIComponent(id)}`,body);
    // The answer belongs to the project it was sent for: shown only if that project is still the one on stage.
    if(id===selected)await showSaved(next);return next;
  }
  // Reload the saved recipe (the receiver announced a change made elsewhere).
  async function reloadRecipe(){
    if(!selected)return null;const id=selected;
    const r=await getJSON(`/api/recipe?id=${encodeURIComponent(id)}`).catch(()=>null);if(!r||id!==selected)return null;
    if(recipe&&r.json.revision===recipe.revision&&JSON.stringify(r.json)===JSON.stringify(recipe))return recipe;
    await showSaved(r.json);return r.json;
  }
  // ---- Preview: a candidate recipe shown on this stage only (other windows and the OBS view keep the saved one) -----
  async function preview(candidate){
    if(recording.active&&candidate)throw new Error('Previews are unavailable while recording: the recording would capture the unsaved preview.');
    const before=previewRecipe||recipe;previewRecipe=candidate||null;previewNotice='';changed('preview');
    if(!living&&!livingLoading){if(selectedWorld==='living')void ensureLiving();return;}
    if(livingLoading)await livingLoading;
    const shown=previewRecipe||recipe;
    if(!living||!shown)return;
    if(runtimeOf(before)!==runtimeOf(shown)||living.remote||(!previewRecipe&&recipe?.unavailable)){disposeLiving();if(selectedWorld==='living')await ensureLiving();}
    else{await living.setRecipe(shown);changed('preview');}
  }
  // A point of the page in the living world's own coordinates (letterboxed while recording at a fixed size), or null
  // outside the picture. A pack's frame takes no pointer input: its world is picked from here too.
  function worldPoint(clientX,clientY){
    const el=living?.remote?living.frame:$('world'),r=el?.getBoundingClientRect();if(!r||!r.width||!r.height)return null;
    let x=clientX-r.left,y=clientY-r.top,w=r.width,h=r.height;
    if(recordFrame){const k=Math.min(r.width/recordFrame.w,r.height/recordFrame.h),ox=(r.width-recordFrame.w*k)/2,oy=(r.height-recordFrame.h*k)/2;x=(x-ox)/k;y=(y-oy)/k;w=recordFrame.w;h=recordFrame.h;}
    return x>=0&&y>=0&&x<=w&&y<=h?{x,y}:null;}
  // Explorer clicks select a structure (the world's callout, the Stage's card).
  let picked=null;
  function bindWorldClicks(el){el.addEventListener('click',async e=>{if(!living||labelMode!=='explorer'||selectedWorld!=='living')return;const p=worldPoint(e.clientX,e.clientY);if(!p)return;
    picked=await living.pick(p.x,p.y);changed('picked');});}
  // Plain-language narration of meaningful changes, so the performance reads without knowing code.
  let captionTimer=null;
  function showCaption(text){
    caption={text,at:perfNow()};if(!captions)return;
    const el=$('caption');el.textContent=text;el.classList.add('show');clearTimeout(captionTimer);if(!FILM)captionTimer=setTimeout(()=>el.classList.remove('show'),3800);
  }
  function showWorldCanvas(){const l=selectedWorld==='living'&&!!living,c=!l&&selectedWorld==='construct'&&construct,remote=!!living?.remote;
    $('world').classList.toggle('hidden',!l||remote);$('worldOverlay').classList.toggle('hidden',!l||remote);$('caption').classList.toggle('hidden',l);
    if(living?.remote)living.frame.classList.toggle('hidden',!l);
    $('construct').classList.toggle('hidden',!c);canvas.classList.toggle('hidden',!!(c||l));
    // In the OBS view the living worlds draw their own lower third: the page's corner captions would overlap it.
    document.body.classList.toggle('living-world',l);}
  let lastPaint=performance.now(),constructSize='',livingSize='';
  function renderAt(dt,now){
    runQueue();
    const pulse=beat();
    stepScene(now);
    showWorldCanvas();
    if(selectedWorld==='living'&&(!living||livingFor!==selected)&&model)void ensureLiving();
    // Nothing is drawn while no view shows the stage and nothing records it (a pack's frame is told so, so its
    // watchdog does not mistake the pause for a slow pack).
    const draw=FILM||visible||recording.active;
    living?.setPaused?.(!draw);
    if(!draw)return;
    if(selectedWorld==='living'&&living){
      const r=recordFrame?{width:recordFrame.w,height:recordFrame.h}:(living.remote?living.frame:$('world')).getBoundingClientRect(),dpr=recordFrame?1:Math.min(devicePixelRatio||1,FILM?1:1.5),size=`${r.width}x${r.height}x${dpr}`;
      if(size!==livingSize&&r.width>0){livingSize=size;living.resize(r.width,r.height,dpr);}
      if(FILM){const s=filmSections.filter(x=>x.at<=now).at(-1);if(s)section=s.section;filmScore();}
      const tempo=window.ResonanceScore.createIdentity(frame?.projectSeed||hash(selected)).tempo[music.options.style]||92;
      living.setMood({section,energy:frame?.controls?.energy||0,tempo:music.options.tempoMode==='project'?tempo:music.options.tempo,
        music:{version:music.options.scoreVersion||2,style:music.options.style,profile:music.options.profile||null,seed:frame?.projectSeed||hash(selected)}});
      // A pack frame in a film renders when the film captures the frame (__film.frame).
      if(!(FILM&&living.remote))living.render(now,dt,{phase:barPhase});
      if(living.remote)watchBudget();
      watchRendering();
    }else if(selectedWorld==='construct'&&construct){
      const r=recordFrame?{width:recordFrame.w,height:recordFrame.h}:$('construct').getBoundingClientRect(),dpr=recordFrame?1:Math.min(devicePixelRatio||1,2),size=`${r.width}x${r.height}x${dpr}`;
      if(size!==constructSize&&r.width>0){constructSize=size;construct.resize(r.width,r.height,dpr);}
      if(FILM){const s=filmSections.filter(x=>x.at<=now).at(-1);if(s)section=s.section;}
      const tempo=window.ResonanceScore.createIdentity(frame?.projectSeed||hash(selected)).tempo[music.options.style]||92;
      construct.setMood({section,energy:frame?.controls?.energy||0,tempo:music.options.tempoMode==='project'?tempo:music.options.tempo});
      construct.render(now,dt,{phase:barPhase});
    }else if(scaledW&&scaledH){
      // Monolith; while a WebGL world is still loading, Monolith's empty ground.
      if(!monolith){void ensureMonolith();g.fillStyle='#070a12';g.fillRect(0,0,scaledW,scaledH);}
      else monolith.draw(g,{w:scaledW,h:scaledH,scale:canvas.width/scaledW,now,speed:replaySpeed(),nodes:selectedWorld==='city'?scene.nodes:null,groups:scene.groups,edges:scene.edges,
        marks:scene.marks,agents:scene.agents,version:scene.version,recipe,labels:labelMode,section,pulse,energy:frame?.controls?.energy||0,still:stillMotion()});}
    if(recording.active)recording.frame((g2,w,h)=>composeFrame(g2,w,h,now));
  }
  // The presented frame, for the recording: the world and its labels as the viewer sees them (right after rendering,
  // while the WebGL canvases still hold the frame).
  function composeFrame(g2,w,h,now){
    // While a world is being switched, the recording keeps the last frame it had.
    if(selectedWorld==='living'&&!living)return;
    if(selectedWorld==='living'){
      if(living.remote){if(packFrame)drawFit(g2,packFrame,w,h);}
      else{drawFit(g2,$('world'),w,h);drawFit(g2,$('worldOverlay'),w,h,false);}
    }else if(selectedWorld==='construct'&&construct){drawFit(g2,$('construct'),w,h);drawCaption(g2,w,h,now);}
    else drawFit(g2,canvas,w,h);
    // Qualification (?qual=1): a pure green flash at marked performance times, to measure picture/sound synchronisation
    // (found by its colour, so a world's own white flashes cannot be mistaken for it).
    // A flash lasts 120 ms and at least three presented frames however slowly frames come (a slow machine's capture may
    // keep only every other frame); synchronisation is measured from its first frame.
    for(let i=flashes.length-1;i>=0;i--){const f=flashes[i],age=(now-f.at)/replaySpeed();
      if(age>=0&&(age<120||f.shown<3)){g2.fillStyle='#00ff00';g2.fillRect(0,0,w,h);f.shown++;}if(age>2000)flashes.splice(i,1);}
  }
  // A source drawn into the recording at its own aspect ratio: exact when it matches, otherwise fitted with black bars
  // (never stretched). `clear` paints the bars (false for a transparent layer over the picture).
  function drawFit(g2,src,w,h,clear=true){
    const sw=src.width,sh=src.height;if(!sw||!sh)return;
    if(Math.abs(sw/sh-w/h)<.01){g2.drawImage(src,0,0,w,h);return;}
    const k=Math.min(w/sw,h/sh),dw=sw*k,dh=sh*k;if(clear){g2.fillStyle='#000';g2.fillRect(0,0,w,h);}
    g2.drawImage(src,(w-dw)/2,(h-dh)/2,dw,dh);
  }
  function drawCaption(g2,w,h,t){
    const age=(t-caption.at)/Math.max(1,filmSpeed);
    if(!caption.text||age>=4200||!captions)return;
    const a=Math.min(1,age/500)*Math.min(1,(4200-age)/700),scale=w/1920;
    g2.save();g2.globalAlpha=Math.max(0,a)*.92;g2.font=`500 ${Math.round(30*scale)}px Inter, "Segoe UI", system-ui, sans-serif`;g2.textAlign='center';
    g2.shadowColor='rgba(4,6,12,.95)';g2.shadowBlur=18*scale;g2.fillStyle='#eef3fb';g2.fillText(caption.text,w/2,h-90*scale);g2.restore();
  }
  function onPackFrame(bitmap){packFrame?.close();packFrame=bitmap;}
  // A pack well beyond its declared budget for ten seconds gets a warning (the pack keeps running; adaptive quality
  // and the watchdog handle real trouble).
  let budgetCheck=0;
  function watchBudget(){
    const now=performance.now();if(now-budgetCheck<2000||!living?.pack?.budget)return;budgetCheck=now;
    const s=living.stats(),b=living.pack.budget;if(!s)return;
    const over=['drawCalls','passes','triangles','points','updateMs'].filter(k=>Number.isFinite(b[k])&&Number.isFinite(s[k])&&s[k]>b[k]*1.25);
    if(!over.length){overBudget.since=0;return;}
    if(!overBudget.since)overBudget.since=now;
    if(!overBudget.warned&&now-overBudget.since>10000){overBudget.warned=true;packNotice=`${living.pack.name} exceeds its declared budget (${over.map(k=>`${k} ${Math.round(s[k])} > ${b[k]}`).join(', ')})`;notify(packNotice,'warning');}
  }
  let lastPositionAt=0;
  function paint(nowMs){
    resize();const dt=Math.min(.07,(nowMs-lastPaint)/1000);lastPaint=nowMs;
    if(mode==='replay'&&playback)tickReplay(nowMs);
    renderAt(dt,perfNow());
    // The playhead, the recording clock and the bar counter reach the interface four times a second.
    if(nowMs-lastPositionAt>250){lastPositionAt=nowMs;changed('position');if(recording.active){updateRecordPace();changed('recording');}}
    requestAnimationFrame(paint);
  }
  // ---- Sound, recording -----------------------------------------------------------------------------------
  async function toggleSound(){
    if(soundEnabled){
      if(recording.active)await finishRecording('sound turned off');
      soundEnabled=false;await music.stop();changed('sound');return false;
    }
    music.setProject(selected,model?.performance?.identity);music.setFrame(frame);music.setClock(perfNow,mode==='replay'?speedChoice||1:1);
    try{await music.start();soundError='';}catch(e){soundError=String(e.message||e);changed('sound');throw e;}
    soundEnabled=true;changed('sound');return true;
  }
  function setWorld(world){world=worldOf(world);if(!world||world===selectedWorld)return;
    selectedWorld=world;changed('world');
    if(world==='construct')void ensureConstruct();
    if(world==='living')void ensureLiving();
    if(world==='city')void ensureMonolith();
  }
  function setRecordSize(v){if(recording.active)return recordSize;recordSize=v==='stage'||RECORD_SIZES[v]?v:'720p';changed('recording');return recordSize;}
  // One recording at a time in this browser: the recorder lock (recording.js) is taken before anything starts (the sound,
  // the recording size) and held until the recorder has stopped, however it stopped (the user, the page, a recorder
  // error); the page closing or crashing releases it. A window that loses the race is told why and starts nothing.
  let recordLock=null,recordClaiming=false,recordLockPolicy=null,recordLockGone=Promise.resolve();
  function releaseRecordLock(lock=recordLock){
    if(!lock||lock!==recordLock)return recordLockGone;recordLock=null;
    // Settles when the lock is really free (at most half a second is waited for that).
    recordLockGone=Promise.race([Promise.resolve(lock.release()).catch(()=>{}),new Promise(r=>setTimeout(r,500))]);return recordLockGone;}
  async function toggleRecord(){
    if(recording.active){await finishRecording('stopped');return {ok:true,stopped:true};}
    // A second press while this window is still starting (the sound, the first frame) is not a second recording.
    if(recordClaiming)return {ok:false,reason:'starting'};
    const support=recording.supported();if(!support.ok){notify(support.reason,'error');return {ok:false,reason:support.reason};}
    if(previewRecipe){notify('Apply or cancel the preview before recording: a recording shows the saved identity.','warning');return {ok:false,reason:'preview'};}
    recordClaiming=true;
    try{
      const claim=await window.ResonanceRecording.claim();recordLockPolicy=claim.policy;
      if(!claim.ok){notify(claim.reason,'warning');changed('recording');return {ok:false,reason:'elsewhere',message:claim.reason};}
      recordLock=claim;
      const started=await startRecording();
      if(started.ok)recording.finished?.then(()=>releaseRecordLock(claim),()=>releaseRecordLock(claim));
      else await releaseRecordLock(claim);
      return started;
    }catch(e){await releaseRecordLock();throw e;}
    finally{recordClaiming=false;}
  }
  async function startRecording(){
    if(!soundEnabled)await toggleSound().catch(e=>console.error(e));
    // A fixed size: the world renders at that size from now on (the stage shows it letterboxed). "stage": the stage's own
    // size (the canvas area, laid out whatever world is showing or loading).
    let bitrate=RECORD_BITRATE[recordSize];
    if(RECORD_SIZES[recordSize]){const [W,H]=RECORD_SIZES[recordSize];recording.resize(W,H);recordFrame={w:W,h:H};document.body.classList.add('recording-fixed');livingSize='';constructSize='';
      await new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));}
    else{const r=$('world').parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);recording.resize(Math.max(320,r.width*dpr),Math.max(180,r.height*dpr));
      bitrate=Math.round(Math.min(8000000,Math.max(2500000,8000000*recording.canvas.width*recording.canvas.height/(1920*1080))));}
    recordPace={frames:0,at:performance.now(),slowSince:0,warned:false};recordNotice='';
    // A pack world: its worker starts compositing frames for the recording first, so the file starts on a real frame of
    // the recording's shape (the first may still have the stage's).
    if(living?.remote){living.record(onPackFrame);const t0=performance.now(),aspect=recording.canvas.width/recording.canvas.height;
      while(!(packFrame&&Math.abs(packFrame.width/packFrame.height-aspect)<.01)&&living?.remote&&performance.now()-t0<2000)await new Promise(res=>setTimeout(res,16));}
    const started=recording.start({audioStream:music.stream,fps:30,bitsPerSecond:bitrate,audioContext:music.ctx,musicLevel:()=>music.level(),
      // The sound lost (an audio device lost or stalled): the browser's recorder would stall the file, so it is finished
      // and saved now, with the reason.
      audioLostListener:()=>{void finishRecording('the sound stopped: an audio device was lost or stalled');}});
    if(!started.ok){if(living?.remote)living.record(null);endRecordFrame();notify(started.reason,'error');changed('recording');return {ok:false,reason:started.reason};}
    if(!started.audio)notify('Recording without sound: the music output could not be captured.','warning');
    changed('recording');
    return {ok:true,audio:started.audio,width:started.width,height:started.height};
  }
  function endRecordFrame(){if(!recordFrame)return;recordFrame=null;document.body.classList.remove('recording-fixed');livingSize='';constructSize='';}
  // A machine that cannot keep the chosen size near 30 frames per second is told once (the file would stutter). The
  // recorder keeps every presented frame up to 30 a second, so the recorded rate is what the file gets.
  function updateRecordPace(){
    const now=performance.now(),st=recording.stats();
    if(now-recordPace.at<5000)return;
    const fps=(st.frames-recordPace.frames)/((now-recordPace.at)/1000);recordPace.frames=st.frames;recordPace.at=now;recordPace.fps=fps;
    if(fps<28){recordPace.slowSince||=now;if(!recordPace.warned&&now-recordPace.slowSince>=10000){recordPace.warned=true;
      recordNotice=`Recording ${recordSize==='stage'?'':`at ${recordSize} `}is not keeping up on this machine (${fps.toFixed(0)} frames per second): choose ${recordSize==='1080p'?'720p or ':''}a lower Quality.`;notify(recordNotice,'warning');}}
    else recordPace.slowSince=0;
  }
  // Finish the recording and offer the file (stopped by the user, by a pack failure, or by the page).
  async function finishRecording(reason){
    if(living?.remote)living.record(null);
    const result=await recording.stop(reason);packFrame?.close();packFrame=null;endRecordFrame();
    // The other windows hear that this one stopped (changed('recording')) once its lock is free.
    if(!recordClaiming)await releaseRecordLock();
    changed('recording');
    if(!result)return null;
    const file=`code-resonance-${selected.slice(0,10)||'performance'}-${Date.now()}.webm`;
    lastRecording={mimeType:result.mimeType,durationMs:Math.round(result.durationMs),frames:result.frames,presented:result.presented,bytes:result.bytes,audio:result.audio,audioLost:result.audioLost,audioLostMs:result.audioLostMs,reason:result.reason,
      size:recording.canvas.width+'x'+recording.canvas.height,slowWarning:recordPace.warned,file:result.blob.size?file:null,at:Date.now()};
    if(!result.blob.size){notify(`The recording could not be saved: ${reason==='stopped'?'the browser produced no file':reason+', and the browser produced no file'}.`,'error');changed('recording');return lastRecording;}
    const url=URL.createObjectURL(result.blob),link=document.createElement('a');
    // The download holds its own reference once started: the URL (which kept the whole file in memory) goes at once.
    link.href=url;link.download=file;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    if(reason!=='stopped')notify(`Recording finished early (${reason}); ${Math.round(result.durationMs/1000)} s saved.`,'warning');
    changed('recording');
    return lastRecording;
  }
  // ---- Offline audio export: the deterministic renderer turns the recorded performance into a WAV file ------
  function wav(buffer){
    const frames=buffer.length,L=buffer.getChannelData(0),R=buffer.getChannelData(1),view=new DataView(new ArrayBuffer(44+frames*4));
    const w=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
    w(0,'RIFF');view.setUint32(4,36+frames*4,true);w(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
    view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);w(36,'data');view.setUint32(40,frames*4,true);
    for(let i=0;i<frames;i++){view.setInt16(44+i*4,clamp(L[i],-1,1)*32767,true);view.setInt16(46+i*4,clamp(R[i],-1,1)*32767,true);}
    return new Blob([view.buffer],{type:'audio/wav'});
  }
  let exporting=false;
  async function exportAudio(){
    if(!selected||exporting)return null;
    exporting=true;changed('export');
    try{
      if(!replay)await loadReplay();
      if(!replay?.entries.length)return null;
      const from=mode==='replay'?replayPos:Math.max(replay.start,replay.end-600000),to=Math.min(replay.end,from+600000);
      const timeline=[];
      for(const e of replay.entries){if(e.end<from-60000||e.start>to)continue;timeline.push({atMs:Math.max(from,e.start),frame:e.frame});
        for(const c of e.cues)if(!QUIET.has(c.type))timeline.push({atMs:cueTime(c,e),cue:c});}
      // The file plays what this window plays: the same score version, profile and mix (an unsaved preview included), on
      // the bar grid of the project's real identity from the first bar (projectSeed), as live playback does.
      const projectSeed=frame?.projectSeed??timeline.find(x=>Number.isFinite(x.frame?.projectSeed))?.frame.projectSeed;
      const buffer=await window.ResonanceMusic.renderOffline({timeline:timeline.filter(x=>x.atMs>=from-1),startMs:from,durationSec:Math.max(5,(to-from)/1000),
        style:music.options.style,texture:music.options.texture,tempoMode:music.options.tempoMode,tempo:music.options.tempo,volume:Math.max(.4,music.options.volume),projectId:selected,
        scoreVersion:music.options.scoreVersion||2,profile:music.options.profile||null,...(Number.isFinite(projectSeed)?{projectSeed}:{})});
      // The file name never carries the project's folder name (only its public title, or a short id).
      const name=(recipe?.title||selected.slice(0,10)).replace(/[^a-z0-9-]+/gi,'-');
      const url=URL.createObjectURL(wav(buffer)),link=document.createElement('a');
      link.href=url;link.download=`code-resonance-${name}-${music.options.style}.wav`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      return {seconds:(to-from)/1000,file:link.download};
    }finally{exporting=false;changed('export');}
  }
  // ---- Replay: the whole recorded performance, played on the same clock -----------------------------------
  async function loadReplay(){
    if(!selected)return;
    const id=selected,entries=[];let after=-1;
    try{
      for(;;){const page=(await getJSON(`/api/timeline?id=${encodeURIComponent(id)}&after=${after}&limit=500`))?.json;if(!page)break;
        entries.push(...page.entries);if(!page.entries.length||entries.length>=page.total)break;after=page.entries.at(-1).seq;}
    }catch{}
    if(id!==selected)return;
    const birth=new Map();
    for(const e of entries)for(const n of e.graph.keyframe?e.graph.nodes:e.graph.add)if(n.type==='module'&&!birth.has(n.id))birth.set(n.id,birth.size);
    replay={entries,cues:entries.flatMap(e=>e.cues),start:entries[0]?.start||0,end:entries.at(-1)?.end||0,birth};
    if(entries.length)living?.setEpoch(replay.start);
    changed('position','feed');
  }
  function graphAt(i){
    const entries=replay.entries;let k=i;while(k>0&&!entries[k].graph.keyframe)k--;
    const nodes=new Map(),edges=new Map();
    for(let j=k;j<=i;j++){const d=entries[j].graph;
      if(d.keyframe){nodes.clear();edges.clear();d.nodes.forEach(n=>nodes.set(n.id,n));d.edges.forEach(e=>edges.set(edgeKey(e),e));continue;}
      d.add.forEach(n=>nodes.set(n.id,n));d.remove.forEach(id=>nodes.delete(id));d.addEdges.forEach(e=>edges.set(edgeKey(e),e));d.removeEdges.forEach(e=>edges.delete(edgeKey(e)));}
    return {nodes:[...nodes.values()],edges:[...edges.values()]};
  }
  // Seeking rebuilds the scene at that point; playing forward schedules each window like live.
  function seek(ts){
    replayPos=ts;queue.length=0;music.resync();
    if(!replay?.entries.length)return;
    let i=replay.entries.findIndex(e=>e.end>ts);if(i<0)i=replay.entries.length-1;
    resetScene(graphAt(Math.max(0,i-1)),replay.birth);applyFrame(replay.entries[i].frame);
    feedCues=replay.cues.filter(c=>c.ts<ts&&c.ts<replay.entries[i].start);
    for(const entry of replay.entries.slice(i))if(entry.start<=ts+60000)schedule(entry,{animate:true,from:ts});else break;
    replay.scheduledTo=i;
    changed('position','feed');
  }
  function tickReplay(now){
    const h=history();if(!replay?.entries.length)return;
    const dt=Math.min(300,now-replayClock);
    replayPos+=dt*speedChoice;replayClock=now;
    // Keep a minute of upcoming windows scheduled.
    while(replay.scheduledTo<replay.entries.length-1&&replay.entries[replay.scheduledTo+1].start<=replayPos+60000)schedule(replay.entries[++replay.scheduledTo],{animate:true});
    if(windowUntil!=null&&replayPos>=windowUntil){replayPos=windowUntil;playback=false;windowUntil=null;changed('position');return;}
    if(replayPos>=h.end){replayPos=h.end;playback=false;changed('position');}
  }
  function changeMode(value){
    if(value!=='live'&&value!=='replay')return;
    mode=value;playback=false;queue.length=0;windowUntil=null;
    music.setClock(perfNow,value==='replay'?speedChoice||1:1);construct?.setSpeed(replaySpeed());living?.setSpeed(replaySpeed());
    changed('mode','position');
    if(value==='replay'){void loadReplay().then(()=>{if(mode!=='replay'||!replay)return;seek(replay.start);});}
    else{replay=null;etag='';feedCues=[];living?.newPerformance?.();resetScene({nodes:[],edges:[]});lastSeq=-1;pollProject();}
  }
  function play(){const h=history();if(mode!=='replay'||!h.cues.length&&!replay?.entries.length)return false;if(replayPos>=h.end)seek(h.start);playback=true;replayClock=performance.now();changed('position');return true;}
  function pause(){if(!playback)return;replayPos=perfNow();playback=false;changed('position');}
  function setSpeed(k){k=Number(k);if(![1,4,16].includes(k)||k===speedChoice)return;const pos=perfNow();speedChoice=k;
    if(mode==='replay'){music.setClock(perfNow,speedChoice);construct?.setSpeed(replaySpeed());living?.setSpeed(replaySpeed());replayPos=pos;replayClock=performance.now();seek(pos);}changed('position');}
  // Home Last night / a scored window: replay that range at 1|4|16 and pause at `to`. Do not call changeMode (it seeks to start).
  function playWindow({from,to,speed}={}){
    speed=Number(speed);from=Number(from);to=Number(to);
    if(![1,4,16].includes(speed)||!Number.isFinite(from)||!Number.isFinite(to)||!(to>from)||!selected)return false;
    const id=selected;
    return (async()=>{
      if(mode!=='replay'){mode='replay';playback=false;queue.length=0;changed('mode','position');}
      speedChoice=speed;music.setClock(perfNow,speedChoice);construct?.setSpeed(replaySpeed());living?.setSpeed(replaySpeed());
      await loadReplay();
      if(selected!==id||mode!=='replay'||!replay)return false;
      windowUntil=to;seek(from);playback=true;replayClock=performance.now();changed('position');
      return true;
    })();
  }
  // ---- The engine's interface ---------------------------------------------------------------------------------
  const player={
    WORLDS,worldOf,LABEL_MODES,QUALITY,api,film:FILM,overlay,get pairing(){return pairing;},
    on(f){listeners.add(f);return ()=>listeners.delete(f);},
    // A snapshot of everything a view may show (cheap: no copies of large structures).
    get state(){const h=history();return {
      receiver:receiverOk,delayMs,project:selected,model,frame,mode,playing:playback,speed:speedChoice,
      position:{start:h.start||0,end:mode==='live'?Date.now()-delayMs:h.end||0,now:perfNow(),loaded:mode==='live'||!!replay,windows:replay?.entries.length||0,events:h.cues.length},
      bar:barNumber,key:musicKey,section,world:selectedWorld,labels:labelMode,captions,quality:qualityChoice,qualityLevel:living?.performance?.().level??living?.stats?.()?.quality??null,rendering:{...rendering,adaptive:qualityAdaptive()},
      // The bar being played: its score version, the voice groups in the arrangement now and, for the composed score, its
      // place in the form (the Music Studio's monitor).
      sound:{enabled:soundEnabled,error:soundError,options:{...music.options},tempo:music.tempo(),level:soundEnabled?music.level():0,
        score:soundEnabled&&music.bar?music.bar.scoreVersion||2:null,layers:soundEnabled&&music.bar?.layers?[...music.bar.layers]:null,form:soundEnabled&&music.bar?.form?{...music.bar.form}:null},
      recording:{active:recording.active,size:recordSize,stats:recording.stats(),audio:recording.audio,audioLost:recording.audioLost,last:lastRecording,notice:recordNotice,supported:recording.supported(),dimensions:recordSize==='stage'?null:RECORD_SIZES[recordSize]},
      recipe,preview:previewRecipe?{recipe:previewRecipe,notice:previewNotice}:null,packs,
      worldStatus:{loading:!!livingLoading,running:!!living,remote:!!living?.remote,pack:living?.pack?{id:living.pack.id,name:living.pack.name}:null,failed:livingFailed,construct:!!construct,constructFailed,
        notice:packNotice,layerFailures:layerFailures(),stopped:stoppedPack&&stoppedPacks.has(stoppedPack.id)?{id:stoppedPack.id,name:stoppedPack.name,reason:stoppedPacks.get(stoppedPack.id)}:null},
      exporting,picked,notices:notices.slice()};},
    selectProject,setWorld,
    setLabels(m){if(!LABEL_MODES.includes(m)||m===labelMode)return;labelMode=m;living?.setLabels(m);picked=null;changed('labels');},
    setCaptions(on){captions=!!on;if(!captions)$('caption')?.classList.remove('show');changed('labels');},
    setQuality(q){q=String(q);if(!QUALITY.includes(q)||q===qualityChoice)return;qualityChoice=q;autoLevel=null;degradedWarned=false;living?.setQuality?.(qualityLevel(),qualityAdaptive());changed('quality');},
    // Music options (style, volume, tempo, tempoMode, texture, scoreVersion, profile {mood, …, mix}) apply on the next
    // bar; nothing restarts. They pass through as given (the Control Center resolves them: ui/music-profile.js).
    setMusic(options){music.setOptions(options);changed('sound');},
    toggleSound,
    setMode:changeMode,play,pause,togglePlay(){return playback?(pause(),false):play();},seek(ts){if(mode!=='replay')return;playback=false;windowUntil=null;seek(ts);},
    seekFraction(f){const h=history();if(mode!=='replay'||!replay)return;playback=false;windowUntil=null;seek(h.start+(h.end-h.start)*clamp(Number(f)||0));},setSpeed,playWindow,
    setVisible(v){visible=!!v;},
    // What is under a point of the page (viewport coordinates) on the living world, for the Control Center's hover card:
    // the world's own words and what the player knows there now, or null. It selects nothing and draws nothing.
    async peek(clientX,clientY){if(FILM||overlay||selectedWorld!=='living'||!living?.peek)return null;const p=worldPoint(clientX,clientY);return p?living.peek(p.x,p.y):null;},
    // heldElsewhere(): whether another window of this browser holds the recorder lock (null: no Web Locks here), the
    // evidence behind a "recording in another window" announcement (a crashed window never says it stopped).
    record:{toggle:toggleRecord,setSize:setRecordSize,get active(){return recording.active;},get lockPolicy(){return recordLockPolicy||(navigator.locks?.request?'web-locks':'announcements');},
      async heldElsewhere(){if(recordLock||recordClaiming)return false;return window.ResonanceRecording.held();}},
    exportAudio,
    recipeAction,reloadRecipe,preview,
    reloadPacks:loadPacks,retryPack,
    setTrust(p,trusted){return api.post('/api/packs/trust',{id:p.id,digest:p.digest,trusted}).then(async r=>{await loadPacks();if(living?.remote||runtimeOf(recipe)!=='builtin'){disposeLiving();if(selectedWorld==='living')void ensureLiving();}return r;});},
    feed,describe:readable,
    graph:constructGraph,
    // A short-lived renderer for gallery thumbnails: the same world host on a detached canvas, disposed after use.
    async thumbnail(candidate,{width=384,height=216,frames=24}={}){
      if(!candidate||candidate.familyKind==='pack'||candidate.pack?.kind==='shader')return null;
      const m=await import('./worlds/host.js'),c=document.createElement('canvas');c.width=width;c.height=height;
      const w=await m.createWorld(c,{recipe:candidate,labels:'off',quality:1,adaptive:false,film:true});
      // The page keeps responding between frames (a software renderer may take a while per frame).
      try{w.resize(width,height,1);w.reset(constructGraph(),0);let t=12000;for(let i=0;i<frames;i++){w.render(t,1/30,{phase:(i%30)/30});t+=1000/30;if(i%4===3)await new Promise(r=>setTimeout(r,0));}return c.toDataURL('image/jpeg',.82);}
      finally{w.dispose();}
    },
    dismissNotice(id){const i=notices.findIndex(n=>n.id===id);if(i>=0){notices.splice(i,1);changed('notice');}}
  };
  window.ResonancePlayer=player;
  // Qualification hooks (?qual=1 only): recording control and picture/sound markers.
  if(params.has('qual'))window.__qual={
    record:()=>toggleRecord(),stop:()=>finishRecording('stopped'),breakRecordingAudio:()=>recording.breakAudio(),recording:()=>({...recording.stats(),last:lastRecording}),
    // A flash and a click at the same performance time, delayMs (real time) from now.
    audioClock:()=>music.ctx?music.ctx.currentTime:null,structure:()=>model?{nodes:model.graph?.nodes?.length||0,edges:model.graph?.edges?.length||0}:null,setRecordSize:v=>setRecordSize(v),
    marker(delayMs=300){const at=perfNow()+delayMs*replaySpeed();flashes.push({at,shown:0});return music.marker(at);},pilot:on=>music.pilot(on),perfNow:()=>perfNow(),stats:()=>living?.stats?.()||null,
    world:()=>({selectedWorld,remote:!!living?.remote,pack:living?.pack?.id||null,family:living?.recipe?.family||null,look:living?.recipe?.pack?.id||null,
      frames:document.querySelectorAll('iframe.pack-frame').length,notice:packNotice,lastStop}),
    action:a=>recipeAction(a),setWorld:w=>setWorld(w),
    // Rebuild the living world (what RETRY does), e.g. while the receiver is unreachable.
    rebuildWorld(){disposeLiving();if(selectedWorld==='living')void ensureLiving();return true;},
    retry:()=>retryPack(),
    // Replay from the beginning (a recording then covers the same moments however long the world took to load).
    replayFromStart(){if(mode!=='replay'||!replay)return false;seek(history().start);playback=true;replayClock=performance.now();changed('position');return true;}};
  if(FILM){
    // Deterministic film: open a recorded performance, then render each frame at an exact performance time.
    document.body.classList.add('overlay','film');mode='replay';
    window.__film={
      async open({project,speed=1,note=''}){selected=project;filmSpeed=speed;filmNote=String(note||'').slice(0,160);await pollProject();await loadReplay();
        if(selectedWorld==='living'){await ensureLiving();living?.setSpeed(speed);}else if(selectedWorld==='city')await ensureMonolith();else{await ensureConstruct();construct?.setSpeed(speed);}
        // The music the film's soundtrack must be rendered with (film.js passes it to renderOffline). The Construct loads
        // no recipe of its own: the project's saved one still says which score it plays.
        if(!living&&!recipe)await reloadRecipe().catch(()=>null);
        return {start:replay.start,end:replay.end,windows:replay.entries.length,webgl:!!(living||construct),world:living?'living':'construct',recipe:living?.recipe||null,
          music:{scoreVersion:filmScore(),profile:filmMusic.profile}};},
      sections(list){filmSections=list;},
      seek(t){filmTime=t;seek(t);},
      // phase (optional): the bar phase to render with (qualification: does the world follow the beat?).
      async frame(t,dt,phase=null){
        filmTime=t;replayPos=t;forcedPhase=Number.isFinite(phase)?phase:null;
        while(replay.scheduledTo<replay.entries.length-1&&replay.entries[replay.scheduledTo+1].start<=t+60000)schedule(replay.entries[++replay.scheduledTo],{animate:true});
        renderAt(dt,t);
        // A pack frame renders the exact frame with its labels and hands back a bitmap.
        const bitmap=selectedWorld==='living'&&living?.remote?await living.capture(t,dt,{phase:barPhase}):null;
        // Composite the stage with the caption layer so the film carries the narration.
        const src=bitmap||(selectedWorld==='living'&&living?$('world'):selectedWorld==='construct'&&construct?$('construct'):canvas),out=document.createElement('canvas');out.width=src.width;out.height=src.height;
        const g2=out.getContext('2d');g2.drawImage(src,0,0);bitmap?.close();
        if(selectedWorld==='living'&&living){living.drawOverlay(g2,out.width,out.height);
          // A film can carry a persistent note (e.g. that a fixture is supplemental or a family was chosen by hand).
          if(filmNote){const k=out.width/1920;g2.globalAlpha=.72;g2.font=`500 ${Math.round(15*k)}px Inter, "Segoe UI", system-ui, sans-serif`;g2.textAlign='left';g2.fillStyle='#e8eef8';g2.shadowColor='rgba(0,0,0,.8)';g2.shadowBlur=8*k;g2.fillText(filmNote,40*k,44*k);g2.globalAlpha=1;g2.shadowBlur=0;}
          return out.toDataURL('image/jpeg',.92);}
        drawCaption(g2,out.width,out.height,t);
        return out.toDataURL('image/jpeg',.92);
      },
      stats(){return living?living.stats():construct?.stats();},
      world(){return living?.world||null;},
      labels(){return living?.labels()||[];},
      async setRecipe(r){await living?.setRecipe(r);return living?.recipe?.family;},
      // A World DNA action as the panel sends it (switching between built-in families and packs rebuilds the world).
      async recipeAction(action){await recipeAction(action);return {family:recipe?.family,remote:!!living?.remote,frames:document.querySelectorAll('iframe.pack-frame').length};},
      setLabels(m){living?.setLabels(m);},
      // The rendering quality level (qualification: the ecosystem's state must not depend on it).
      quality(q){living?.setQuality?.(q,false);return living?.performance?.().level??null;},
      memory(){const s=living?.stats();return {geometries:s?.geometries,textures:s?.textures,heap:performance.memory?performance.memory.usedJSHeapSize:null};}
    };
  }else{
    // Render counts only (draw calls, buildings, …) for the technical qualification.
    window.__constructStats=()=>construct?.stats();window.__worldStats=()=>living?.stats();window.__monolithStats=()=>monolith?.stats();
    setInterval(pollProject,3000);setInterval(pollTimeline,1000);setInterval(loadPacks,15000);void loadPacks();
    // Delay = window + grace + scan + 3 s for outbox delivery (<=2.5 s) and polling (<=1 s). Measured worst case: ~9.9 s.
    getJSON('/health').then(r=>{setReceiver(true);const x=r.json;delayMs=(x.windowMs||10000)+(x.graceMs??3000)+(x.sortIntervalMs||1000)+3000;changed('receiver');}).catch(()=>setReceiver(false));
    if(selected)pollProject();
    requestAnimationFrame(paint);
    if(selectedWorld==='construct')void ensureConstruct();else if(selectedWorld==='city')void ensureMonolith();
    bindWorldClicks($('world').parentElement);
    // OBS browser sources allow audio without a click; a regular browser will ignore this until a gesture.
    if(overlay&&params.get('sound')==='1')toggleSound().catch(()=>{});
  }
})();

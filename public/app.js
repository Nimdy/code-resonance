'use strict';
// Code Resonance is a fully independent local performance player.
// One performance clock drives both the music and the visuals: live = wall time minus the interpretation delay,
// replay = the playhead. Recorded cues are scheduled at their true times within each window, so sound and image
// coincide and follow the rhythm of the actual work rather than the arrival of network polls.
(() => {
  const $=id=>document.getElementById(id);
  const canvas=$('stage'); const g=canvas.getContext('2d',{alpha:false});
  const dom={project:$('projectSelect'),feed:$('feed'),scrub:$('scrub'),sound:$('soundBtn'),chapter:$('chapter')};
  const params=new URLSearchParams(location.search);
  // 'living' is the project's own generative world (its Visual Recipe); the others are fixed visual languages.
  const WORLDS=['living','construct','nexus','city','nebula'];
  // Film mode: the clock is driven frame by frame (window.__film), so a recorded performance renders deterministically.
  const FILM=params.has('film');
  const overlay=params.has('overlay');
  let selected=params.get('project')||'',model=null,etag='',mode='live',playback=false,replayPos=0,replayClock=0;
  let frame=null,scaledW=0,scaledH=0,replay=null,lastSeq=-1,delayMs=10500,feedCues=[],section='home',barPhase=0,feedDirty=false;
  // World coordinates are centred on (0,0); the camera eases to frame the structure as it grows.
  const scene={nodes:new Map(),edges:new Map(),groups:new Map(),order:0,pulses:[],comets:new Map(),ripples:[],extent:.12,view:.12};
  let firstBar=null;
  const queue=[];
  const music=new window.ResonanceMusic(({index,section:s,key})=>{if(firstBar===null)firstBar=index;setText('barCounter',`BAR ${String(index-firstBar+1).padStart(3,'0')}`);if(s)section=s;if(key)setText('seedLabel',key.toUpperCase());});
  let selectedWorld='living';
  // Live recording of whatever is presented (recording.js): one player-owned compositor, every kind of world.
  const recording=window.ResonanceRecording.create();let packFrame=null,lastRecording=null;const flashes=[];
  let living=null,livingLoading=null,livingFailed=false,livingRetryAt=0,livingFor='',recipe=null;
  // A failed request or module download means the receiver is unreachable (restarting, stopped): retry, never give up a world for it.
  const unreachable=e=>e instanceof TypeError&&/fetch/i.test(e.message);
  // Visual packs installed with scripts/pack.js (GET /api/packs); code packs run only in the isolated pack frame.
  let packs=[],packNotice='',reviewing=null,stoppedPack=null,lastStop=null,overBudget={since:0,warned:false};const stoppedPacks=new Map();
  // Visual quality: AUTO adapts when frames are slow; a fixed level stays put (URL ?quality= / ?adapt=0 override).
  const QUALITY=['auto','0','1','2','3'];let qualityChoice='auto';
  // Recording size: the encoded video's dimensions. At a fixed size the world renders at exactly that size (16:9), and
  // the stage shows the same picture letterboxed; "stage" records the stage as it is on screen.
  const RECORD_SIZES={'1080p':[1920,1080],'720p':[1280,720]},RECORD_BITRATE={'1080p':8000000,'720p':5000000};
  let recordSize='720p',recordFrame=null,recordPace={frames:0,at:0,slowSince:0,warned:false};
  const LABEL_MODES=['cinematic','explorer','stream','off'];
  let labelMode=LABEL_MODES.includes(params.get('labels'))?params.get('labels'):params.has('overlay')?'stream':'cinematic';
  let construct=null,constructLoading=null,constructFailed=false,filmTime=0,filmSections=[],caption={text:'',at:-1e12},filmNote='';
  let soundEnabled=false;
  try {const prefs=JSON.parse(localStorage.getItem('code-resonance-player-v1')||'{}');
    if(WORLDS.includes(prefs.world))selectedWorld=prefs.world;
    if(window.ResonanceScore.STYLES.includes(prefs.style))music.setOptions({style:prefs.style});
    if(Number.isFinite(prefs.volume)&&prefs.volume>=0&&prefs.volume<=1)music.setOptions({volume:prefs.volume});
    if(Number.isFinite(prefs.tempo)&&prefs.tempo>=58&&prefs.tempo<=160)music.setOptions({tempo:prefs.tempo});
    if(prefs.tempoMode==='manual'||prefs.tempoMode==='project')music.setOptions({tempoMode:prefs.tempoMode});
    if(Number.isFinite(prefs.texture)&&prefs.texture>=0&&prefs.texture<=1)music.setOptions({texture:prefs.texture});
    if(QUALITY.includes(prefs.quality))qualityChoice=prefs.quality;
    if(prefs.recordSize&&(prefs.recordSize==='stage'||RECORD_SIZES[prefs.recordSize]))recordSize=prefs.recordSize;
  }catch{}
  if(params.get('world')&&WORLDS.includes(params.get('world')))selectedWorld=params.get('world');
  if(params.has('quality'))qualityChoice=params.get('adapt')==='0'?String(Math.max(0,Math.min(3,Number(params.get('quality'))||0))):'auto';
  if(params.get('adapt')==='0'&&!params.has('quality'))qualityChoice='0';
  const qualityLevel=()=>qualityChoice==='auto'?(Number(params.get('quality'))||0):Number(qualityChoice),qualityAdaptive=()=>qualityChoice==='auto';
  if(params.get('style')&&window.ResonanceScore.STYLES.includes(params.get('style')))music.setOptions({style:params.get('style')});
  const typeColor={module:'#7ceeff','ui.component':'#df9cff','api.route':'#a6f5cb',function:'#75c9ff',variable:'#9e8fff',class:'#f4ca97',interface:'#ffaec2',method:'#9ae8ef',type:'#b8b8fc',callsite:'#6795bd'};
  const AGENT_COLORS=['#ff9ee8','#ffd27a','#9dffcf','#a7b8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'];
  // Section colour temperature: the image follows the music's form.
  const SECTION_TINT={home:[104,233,255],away:[170,140,255],tension:[255,150,120],resolve:[140,255,200],lift:[255,220,140],breath:[90,140,230]};
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
    'agent.plan.visible':'AI plan observed','workspace.started':'Capture started','workspace.stopped':'Capture stopped','instrument.note':'Manual cue'
  };
  const QUIET=new Set(['editor.change.observed','editor.newline.inserted','document.baseline.indexed','validation.diagnostics','execution.command.started','agent.tool.started']);
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function rand(seed){let t=seed+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
  function opacity(color,opacity){const a=Math.floor(Math.min(1,Math.max(0,opacity))*255).toString(16).padStart(2,'0');return color+a;}
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  function setText(id,s){const e=$(id);if(e)e.textContent=String(s);}
  function timeText(n){if(!n)return '—';return new Date(n).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  function readable(type){return labels[type]||type.replaceAll('.',' · ');}
  function kindClass(type){return type.startsWith('agent.')?'ai':type.startsWith('validation.')||type.startsWith('milestone.')||type==='source.parse.diagnostics'?'validation':type.startsWith('symbol.')||type.startsWith('dependency.')?'structure':'system';}
  function eventLabel(c){if(c.detail?.symbolType)return `${readable(c.type)} · ${c.detail.symbolType.toUpperCase()}`;return readable(c.type);}
  // ---- Performance clock and scheduling ------------------------------------------------------------------
  // Replay: the playhead advances once per animation frame; between frames it is extrapolated, so sound is scheduled
  // from the current position (from the last frame's, a cue scheduled after a 150 ms main-thread stall sounded 150 ms
  // late: qualification/results/sync/).
  function perfNow(){
    if(FILM)return filmTime;if(mode!=='replay')return Date.now()-delayMs;
    if(!playback||!replay)return replayPos;
    return Math.min(replay.end,replayPos+Math.min(300,Math.max(0,performance.now()-replayClock))*(Number($('speedSelect').value)||4));
  }
  function at(time,fn){let i=queue.length;while(i>0&&queue[i-1].time>time)i--;queue.splice(i,0,{time,fn});}
  function runQueue(){const now=perfNow();while(queue.length&&queue[0].time<=now)queue.shift().fn();}
  const cueTime=(cue,entry)=>clamp(cue.ts,entry.start,Math.max(entry.start,entry.end-1));
  // Schedules one recorded window: its frame at the window start, each cue at its own time.
  // Cues before `from` (e.g. earlier in a window that a seek lands inside) join the feed silently, never as a burst.
  function schedule(entry,{animate=true,from=-Infinity}={}){
    at(entry.start,()=>{applyFrame(entry.frame);applyDelta(entry.graph,entry.start,entry.end);construct?.applyDelta(entry.graph,entry.start,entry.end);living?.applyDelta(entry.graph,entry.start,entry.end);});
    // Canonical intents (engine/intents.js) drive the living world's effects at their own recorded times.
    // Each intent carries its recorded position (window, index): with its timestamp, the canonical order of history.
    (entry.intents||[]).forEach((intent,k)=>{if(intent.ord===undefined)intent.ord=entry.seq*65536+k;const time=clamp(intent.ts,entry.start,Math.max(entry.start,entry.end-1));if(animate&&time>=from)at(time,()=>living?.intent(intent,time));});
    for(const cue of entry.cues){
      const time=cueTime(cue,entry),live=animate&&time>=from;
      if(live&&!QUIET.has(cue.type))music.enqueue(cue,time);
      at(time,()=>{if(live){animateCue(cue);construct?.cue(cue,time);living?.cue(cue,time);}feedCues.push(cue);if(feedCues.length>400)feedCues.splice(0,feedCues.length-400);feedDirty=true;});
    }
  }
  function applyFrame(f){if(!f)return;frame=f;music.setFrame(f);if(model)setStats(model);}
  // ---- Scene graph: stable growth layout -------------------------------------------------------------------
  function placeModule(node){
    // Phyllotaxis by birth order: each module keeps its place and the structure grows outward like a sunflower.
    const k=scene.order++,h=hash(node.id),a=k*2.3999632+rand(h)*.25,r=.035*Math.sqrt(k+.6);
    node.angle=a;node.radius=r;node.tx=Math.cos(a)*r;node.ty=Math.sin(a)*r;
    scene.extent=Math.max(scene.extent,r+.03);
  }
  function placeSymbol(node){
    const parent=scene.nodes.get(node.parent);const h=hash(node.id),a=rand(h)*Math.PI*2,r=.006+rand(h+2)*.012;
    node.tx=(parent?parent.tx:0)+Math.cos(a)*r;node.ty=(parent?parent.ty:0)+Math.sin(a)*r;node.angle=a;node.radius=r;
  }
  function addNode(n,born){
    // Architectural districts are drawn only by the Construct; the 2D worlds keep modules and symbols.
    if(n.type==='group'){scene.groups.set(n.id,{...n});return;}
    const existing=scene.nodes.get(n.id);
    if(existing){Object.assign(existing,{...n,x:existing.x,y:existing.y,tx:existing.tx,ty:existing.ty,dying:null});return;}
    const node={...n,born,dying:null,x:0,y:0,glow:0};
    scene.nodes.set(n.id,node);
    if(n.type==='module')placeModule(node);else placeSymbol(node);
    const parent=scene.nodes.get(node.parent);node.x=parent?parent.x:node.tx;node.y=parent?parent.y:node.ty;
  }
  const edgeKey=e=>`${e.a}>${e.b}>${e.kind}`;
  // `birth` (replay) orders modules by when they first appeared, so every seek rebuilds the same layout.
  function resetScene(graph,birth){
    scene.nodes.clear();scene.edges.clear();scene.groups.clear();scene.order=0;scene.extent=.12;
    for(const e of graph.edges)scene.edges.set(edgeKey(e),e);
    const parents=new Map();for(const e of graph.edges)if(e.kind==='contains')parents.set(e.b,e.a);
    const modules=graph.nodes.filter(n=>n.type==='module');
    if(birth)modules.sort((a,b)=>(birth.get(a.id)??Infinity)-(birth.get(b.id)??Infinity));
    for(const n of modules)addNode(n,-Infinity);
    for(const n of graph.nodes.filter(n=>n.type!=='module'))addNode({...n,parent:n.parent||parents.get(n.id)},-Infinity);
    for(const n of scene.nodes.values()){n.x=n.tx;n.y=n.ty;}
    scene.view=scene.extent;
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
    for(const e of d.addEdges)scene.edges.set(edgeKey(e),e);
    for(const e of d.removeEdges)scene.edges.delete(edgeKey(e));
    const span=Math.max(1,end-start);
    d.add.filter(n=>n.type==='module').concat(d.add.filter(n=>n.type!=='module')).forEach((n,i,all)=>addNode(n,start+span*(i/Math.max(1,all.length))));
    for(const id of d.remove){const n=scene.nodes.get(id);if(n)n.dying=perfNow();}
  }
  // ---- Cue animation: pulses travel to the module that actually changed ----------------------------------
  function moduleFor(cue){return cue.detail?.fileId?scene.nodes.get(cue.detail.fileId):null;}
  function animateCue(c){
    const category=kindClass(c.type),voice=Number.isInteger(c.detail?.voice)?c.detail.voice:null;
    const color=voice!==null?AGENT_COLORS[voice%8]:category==='ai'?'#ed94ff':category==='validation'?'#ffbb84':category==='system'?'#93f6c0':'#75edff';
    const target=moduleFor(c);
    if(target){target.glow=1;scene.pulses.push({node:target.id,x:target.x,y:target.y,color,age:0,speed:.05+Math.min(.12,(c.weight||0)*.04),life:1.4});}
    else if(category!=='system')scene.pulses.push({node:null,x:0,y:0,color,age:0,speed:.18,life:1.6});
    if(voice!==null){
      const comet=scene.comets.get(voice)||{voice,x:0,y:0,tx:0,ty:0,trail:[],last:0};
      if(target){comet.tx=target.x;comet.ty=target.y;}
      comet.last=perfNow();scene.comets.set(voice,comet);
    }
    if(/^milestone\.|^repository\.commit/.test(c.type)||(c.type==='validation.test.passed'&&(c.weight||0)>=1))scene.ripples.push({age:0,color:'#ffe6a8'});
    if(c.type==='validation.test.failed'||c.type==='validation.build.failed')scene.ripples.push({age:0,color:'#ff8f7a',inward:true});
    if(scene.pulses.length>220)scene.pulses.splice(0,scene.pulses.length-220);
  }
  // ---- Data -----------------------------------------------------------------------------------------------
  async function getJSON(url,headers){const r=await fetch(url,{cache:'no-store',headers});if(r.status===304||r.status===404)return null;if(!r.ok)throw Error(`HTTP ${r.status}`);return {json:await r.json(),etag:r.headers.get('etag')||''};}
  async function pollProjects(){
    try{
      const list=(await getJSON('/api/projects'))?.json.projects||[];
      const ids=new Set(list.map(p=>p.id));const choice=dom.project.value;
      if(dom.project.options.length!==list.length+1||list.some(p=>![...dom.project.options].some(o=>o.value===p.id))){
        dom.project.replaceChildren(new Option('SELECT PROJECT',''));
        for(const p of list)dom.project.add(new Option(p.name?p.name.toUpperCase():`PROJECT ${p.id.slice(0,8).toUpperCase()}`,p.id));
      }
      if(!selected||!ids.has(selected)){const next=ids.has(choice)?choice:list[0]?.id||'';if(next!==selected)selectProject(next);}
      dom.project.value=selected;
      setConnection(true);
    }catch{setConnection(false);}
  }
  async function pollProject(){
    if(!selected)return;
    try{
      const r=await getJSON(`/api/project?id=${encodeURIComponent(selected)}`,etag?{'If-None-Match':etag}:undefined);
      if(!r)return;etag=r.etag;model=r.json;
      if(!scene.nodes.size&&mode==='live'){resetScene(model.graph);frame=model.frames.at(-1)||frame;music.setFrame(frame);
        lastSeq=Math.max(lastSeq,(model.timelineFrames||0)-1);feedCues=model.timeline.slice(-60);}
      music.setProject(selected,model.performance?.identity);
      setStats(model);renderFeed();setConnection(true);
    }catch{setConnection(false);}
  }
  async function pollTimeline(){
    if(!selected||mode!=='live'||!model)return;
    try{
      const page=(await getJSON(`/api/timeline?id=${encodeURIComponent(selected)}&after=${lastSeq}&limit=200`))?.json;if(!page)return;
      for(const entry of page.entries){lastSeq=entry.seq;schedule(entry,{animate:entry.end>=perfNow()-2000});}
    }catch{}
  }
  function selectProject(id){
    selected=id;etag='';model=null;lastSeq=-1;replay=null;queue.length=0;feedCues=[];disposeLiving();resetScene({nodes:[],edges:[]});
    scene.pulses.length=0;scene.comets.clear();music.resync();
    if(mode==='replay')changeMode('replay');else{pollProject();}
  }
  function setConnection(ok){$('statusDot').classList.toggle('active',!!ok);setText('connection',ok?'SESSION CONNECTED':'RECEIVER OFFLINE');$('stageEmpty').classList.toggle('hidden',!!model);}
  function history(){
    if(mode==='replay'&&replay)return replay;
    return {cues:feedCues,start:feedCues.at(0)?.ts||0,end:feedCues.at(-1)?.ts||0};
  }
  function setStats(m){
    const p=m.performance||{};const controls=frame?.controls||m.frames.at(-1)?.controls||{};
    setText('projectName',(m.name||m.projectId.slice(0,12)).toUpperCase());
    const chapter=frame?.chapter||p.chapter||1;
    setText('chapter',String(chapter).padStart(2,'0'));
    const names=['ORIGIN','FORMATION','STRUCTURE','CONNECTION','INTEGRATION','EVOLUTION','COMPOSITION','RESONANCE'];
    setText('chapterName',names[Math.min(names.length-1,Math.max(0,chapter-1))]);
    // Progress through the current chapter (chapter n begins at progress 12*(2^(n-1)-1); see engine/reducer.js).
    const lo=12*(2**(chapter-1)-1),hi=12*(2**chapter-1);
    $('chapterFill').style.width=`${(clamp(((p.progress||0)-lo)/(hi-lo))*100).toFixed(1)}%`;
    for(const [name,value] of [['energy',controls.energy||0],['tension',controls.tension||0],['complexity',controls.complexity||0]]){
      const n=Math.round(clamp(value)*100);$(`${name}Bar`).style.width=n+'%';setText(`${name}Number`,String(n).padStart(2,'0'));
    }
    setText('files',m.stats.files);setText('symbols',m.stats.symbols);setText('events',m.stats.raw);setText('tests',m.stats.testsPassed);
    const h=history();
    setText('eventCount',h.cues.length);
    setText('confidence','OBSERVED + INFERRED');
    setText('scrubStart',timeText(h.start));setText('scrubEnd',mode==='live'?'NOW':timeText(h.end));
    $('stageEmpty').classList.toggle('hidden',true);
    $('playBtn').disabled=!h.cues.length||mode!=='replay';
  }
  function renderFeed(){if(!model)return;
    const filtered=history().cues.filter(c=>!QUIET.has(c.type));
    const source=mode==='replay'?filtered.filter(c=>c.ts<=replayPos):filtered;
    const recent=source.slice(-28).reverse();
    const fragment=document.createDocumentFragment();
    for(const c of recent){
      const d=document.createElement('div');d.className='feed-entry';
      const marker=document.createElement('span');marker.className=`feed-marker ${kindClass(c.type)}`;
      const content=document.createElement('div');content.className='feed-copy';
      const title=document.createElement('strong');title.textContent=eventLabel(c);
      const detail=document.createElement('div');detail.textContent=`${timeText(c.ts)}  /  ${c.category.toUpperCase()}  /  ${c.weight?'STRUCTURAL':'ACTIVITY'}${c.detail?.attribution==='correlated'?'  /  AGENT':''}`;
      content.append(title,detail);d.append(marker,content);fragment.append(d);
    }
    dom.feed.replaceChildren(fragment);
    if(!recent.length){const none=document.createElement('div');none.className='feed-empty';none.textContent='No classified events yet.';dom.feed.append(none);}
  }
  // ---- Rendering ------------------------------------------------------------------------------------------
  const sprites=new Map();
  // Glow sprites are rendered once per colour; drawing images is far cheaper than per-node shadowBlur.
  function sprite(color){
    if(sprites.has(color))return sprites.get(color);
    const s=document.createElement('canvas');s.width=s.height=64;const c=s.getContext('2d');
    const grad=c.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,opacity(color,1));grad.addColorStop(.18,opacity(color,.55));grad.addColorStop(.5,opacity(color,.12));grad.addColorStop(1,opacity(color,0));
    c.fillStyle=grad;c.fillRect(0,0,64,64);sprites.set(color,s);return s;
  }
  let starfield=null;
  function resize(){
    const r=canvas.getBoundingClientRect();if(r.width===0||r.height===0)return;
    scaledW=r.width;scaledH=r.height;const dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.floor(r.width*dpr)||canvas.height!==Math.floor(r.height*dpr)){
      canvas.width=Math.floor(r.width*dpr);canvas.height=Math.floor(r.height*dpr);g.setTransform(dpr,0,0,dpr,0,0);starfield=null;
    }
  }
  function tint(alpha){const [r,gg,b]=SECTION_TINT[section]||SECTION_TINT.home;return `rgba(${r},${gg},${b},${alpha})`;}
  function backdrop(t){
    const w=scaledW,h=scaledH;
    if(!starfield){starfield=document.createElement('canvas');starfield.width=Math.ceil(w);starfield.height=Math.ceil(h);const c=starfield.getContext('2d');
      for(let i=0;i<420;i++){const seed=hash('star-'+i);c.fillStyle=`rgba(176,209,250,${.05+rand(seed+5)*.22})`;c.fillRect(rand(seed)*w,rand(seed+29)*h,rand(seed+3)>.92?2:1,1);}}
    g.fillStyle='#070a12';g.fillRect(0,0,w,h);
    const haze=g.createRadialGradient(w*.5,h*.48,10,w*.5,h*.5,Math.max(w,h)*.65);
    haze.addColorStop(0,tint(.13+.05*(frame?.controls?.energy||0)));haze.addColorStop(.4,'rgba(12,20,40,.35)');haze.addColorStop(1,'rgba(7,10,17,0)');g.fillStyle=haze;g.fillRect(0,0,w,h);
    g.globalAlpha=.75+.25*Math.sin(t*.3);g.drawImage(starfield,0,0);g.globalAlpha=1;
  }
  // Breathing on the bar grid, from the music when playing or from the deterministic grid when muted.
  let forcedPhase=null;
  function beat(){
    const p=music.phase();if(forcedPhase!==null)barPhase=forcedPhase;else if(p){barPhase=p.phase;if(p.section)section=p.section;}
    else{const stepMs=60000/((window.ResonanceScore.createIdentity(frame?.projectSeed||hash(selected)).tempo[music.options.style]||92)*4);barPhase=((perfNow()/(stepMs*16))%1+1)%1;}
    const q=(barPhase*4)%1;return Math.exp(-q*5);
  }
  function stepScene(dt,now){
    scene.view+=(scene.extent-scene.view)*Math.min(1,dt*.6);
    for(const [id,n] of scene.nodes){
      n.x+=(n.tx-n.x)*Math.min(1,dt*2.2);n.y+=(n.ty-n.y)*Math.min(1,dt*2.2);n.glow=Math.max(0,n.glow-dt*.8);
      if(n.dying!==null&&now-n.dying>1500)scene.nodes.delete(id);
    }
    for(const c of scene.comets.values()){c.x+=(c.tx-c.x)*Math.min(1,dt*1.6);c.y+=(c.ty-c.y)*Math.min(1,dt*1.6);c.trail.push([c.x,c.y]);if(c.trail.length>28)c.trail.shift();}
    for(const [v,c] of scene.comets)if(now-c.last>45000)scene.comets.delete(v);
  }
  // Birth is a flash and a growing ring; death a fade. Visible-from time keeps future nodes hidden until born.
  function life(n,now){if(n.born>now)return 0;if(n.dying!==null)return clamp(1-(now-n.dying)/1500);return 1;}
  function birthFlash(n,now){const a=(now-n.born)/1200;return a>=0&&a<1?1-a:0;}
  // Settled edges are batched into one path per kind; only edges being born or removed are drawn individually.
  function drawEdges(now,w,h,mapXY,pulse){
    g.lineWidth=.8;const depends=new Path2D(),contains=new Path2D(),flows=[];
    for(const e of scene.edges.values()){
      const a=scene.nodes.get(e.a),b=scene.nodes.get(e.b);if(!a||!b)continue;
      const vis=Math.min(life(a,now),life(b,now));if(vis<=0)continue;
      const [x1,y1]=mapXY(a),[x2,y2]=mapXY(b);
      if(e.kind==='depends'){
        const mx=(x1+x2)/2+(y2-y1)*.12,my=(y1+y2)/2-(x2-x1)*.12;
        if(vis<1){g.strokeStyle=`rgba(237,148,255,${.18*vis})`;g.beginPath();g.moveTo(x1,y1);g.quadraticCurveTo(mx,my,x2,y2);g.stroke();}
        else{depends.moveTo(x1,y1);depends.quadraticCurveTo(mx,my,x2,y2);}
        if(flows.length<240)flows.push([x1,y1,mx,my,x2,y2,rand(hash(e.a+e.b))]);
      }else if(vis>=1){contains.moveTo(x1,y1);contains.lineTo(x2,y2);}
    }
    g.strokeStyle='rgba(106,212,242,.08)';g.stroke(contains);
    g.strokeStyle=`rgba(237,148,255,${.15+.08*pulse})`;g.stroke(depends);
    const dot=sprite('#efb9ff');
    for(const [x1,y1,mx,my,x2,y2,r] of flows){const f=((now/7000)+r)%1,u=1-f;g.drawImage(dot,u*u*x1+2*u*f*mx+f*f*x2-5,u*u*y1+2*u*f*my+f*f*y2-5,10,10);}
  }
  function drawNodes(now,mapXY,pulse,density){
    let i=0;
    for(const n of scene.nodes.values()){
      const vis=life(n,now);if(vis<=0){i++;continue;}
      const [x,y]=mapXY(n);const color=typeColor[n.type]||'#8cbad8',flash=birthFlash(n,now);
      const base=(n.type==='module'?5:2.2)*clamp(n.weight||1,.6,3)*.7;
      const r=base*(1+.25*pulse*(n.type==='module'?1:.4)+.8*n.glow+1.4*flash);
      const glow=r*(n.type==='module'?5:3.4);
      g.globalAlpha=vis*density*(.55+.25*Math.sin(now/900+i*.7)+.4*n.glow+.6*flash);
      g.drawImage(sprite(color),x-glow,y-glow,glow*2,glow*2);
      g.globalAlpha=vis;g.fillStyle=color;g.beginPath();g.arc(x,y,Math.max(.8,base*.55),0,Math.PI*2);g.fill();
      if(flash>0){g.globalAlpha=flash*.8;g.strokeStyle=color;g.lineWidth=1.2;g.beginPath();g.arc(x,y,base+(1-flash)*26,0,Math.PI*2);g.stroke();}
      i++;
    }
    g.globalAlpha=1;
  }
  function drawCore(t,pulse){
    const w=scaledW,h=scaledH,core=Math.min(w,h),x=w*.5,y=h*.5;
    const energy=frame?.controls?.energy||0,tension=frame?.controls?.tension||0;
    for(let ring=0;ring<3;ring++){
      const radius=core*(.05+ring*.03)*(1+.04*pulse),rot=t*(ring%2?-.08:.06)+(ring*1.7),arc=Math.PI*(.7+ring*.13);
      g.save();g.translate(x,y);g.rotate(rot);g.strokeStyle=tint(.08+energy*.12);g.lineWidth=ring===0?1.5:1;
      g.beginPath();g.arc(0,0,radius,0,arc);g.stroke();g.restore();
    }
    const rad=core*(.02+energy*.006)*(1+.15*pulse);
    g.globalAlpha=.8;g.drawImage(sprite(tension>.35?'#f4adc3':'#8bdcf4'),x-rad*5,y-rad*5,rad*10,rad*10);g.globalAlpha=1;
  }
  function drawComets(w,h,mapXY){
    for(const c of scene.comets.values()){
      const color=AGENT_COLORS[c.voice%8];
      c.trail.forEach(([px,py],i)=>{const [x,y]=mapXY({x:px,y:py});const a=i/c.trail.length;g.globalAlpha=a*.5;g.drawImage(sprite(color),x-6*a,y-6*a,12*a,12*a);});
      const [x,y]=mapXY(c);g.globalAlpha=1;g.drawImage(sprite(color),x-11,y-11,22,22);
    }
    g.globalAlpha=1;
  }
  function drawPulses(dt,mapXY){
    const scale=Math.min(scaledW,scaledH);
    for(let i=scene.pulses.length-1;i>=0;i--){
      const p=scene.pulses[i];p.age+=dt;
      if(p.age>p.life){scene.pulses.splice(i,1);continue;}
      const [x,y]=mapXY(scene.nodes.get(p.node)||p),r=(p.age*p.speed)*scale,alpha=(1-p.age/p.life)*.7;
      g.strokeStyle=opacity(p.color,alpha);g.lineWidth=1.6-p.age*.6;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.stroke();
    }
    for(let i=scene.ripples.length-1;i>=0;i--){
      const r=scene.ripples[i];r.age+=dt;if(r.age>2.4){scene.ripples.splice(i,1);continue;}
      const f=r.age/2.4,radius=(r.inward?1-f:f)*Math.max(scaledW,scaledH)*.6;
      g.strokeStyle=opacity(r.color,(1-f)*.45);g.lineWidth=2.5*(1-f)+.5;g.beginPath();g.arc(scaledW/2,scaledH/2,Math.max(1,radius),0,Math.PI*2);g.stroke();
    }
  }
  function camera(){const w=scaledW,h=scaledH,s=Math.min(w,h)*.45/Math.max(.08,scene.view);return n=>[w/2+n.x*s,h/2+n.y*s*.86];}
  function drawNexus(t,dt,now,pulse){
    const w=scaledW,h=scaledH,mapXY=camera();
    drawCore(t,pulse);drawEdges(now,w,h,mapXY,pulse);drawNodes(now,mapXY,pulse,1);drawComets(w,h,mapXY);drawPulses(dt,mapXY);
  }
  function drawNebula(t,dt,now,pulse){
    const w=scaledW,h=scaledH,size=Math.min(w,h),cx=w*.5,cy=h*.51;
    // The same stable layout, wrapped into a slowly turning spiral.
    const fit=.5/Math.max(.08,scene.view);
    const mapXY=n=>{const r=Math.hypot(n.x,n.y)*fit,a=Math.atan2(n.y,n.x)+t*.03+r*2.4;return [cx+Math.cos(a)*r*size*.95,cy+Math.sin(a)*r*size*.6];};
    const core=g.createRadialGradient(cx,cy,0,cx,cy,size*.45);core.addColorStop(0,tint(.16+.08*pulse));core.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=core;g.fillRect(0,0,w,h);
    g.save();g.globalCompositeOperation='lighter';
    // Additive light is normalised by node count, so large projects stay luminous instead of blowing out white.
    const density=clamp(Math.sqrt(140/Math.max(140,scene.nodes.size)),.18,1);
    drawEdges(now,w,h,mapXY,pulse*.5);drawNodes(now,mapXY,pulse,density*.8);g.restore();
    drawComets(w,h,mapXY);drawPulses(dt,mapXY);
  }
  function drawCity(t,dt,now,pulse){
    const w=scaledW,h=scaledH,modules=[...scene.nodes.values()].filter(n=>n.type==='module');
    const energy=frame?.controls?.energy||0,count=Math.max(9,modules.length),cols=Math.max(3,Math.ceil(Math.sqrt(count))),rows=Math.ceil(count/cols);
    const unit=Math.min(54,w/(cols+rows+2)*1.15,h/(cols+rows+2)*2.1),cx=w*.5,cy=h*.3;
    const iso=(c,r,z=0)=>[cx+(c-r)*unit*.94,cy+(c+r)*unit*.39-z];
    g.strokeStyle=tint(.06);g.lineWidth=1;
    for(let c=-2;c<=cols+2;c++){g.beginPath();g.moveTo(...iso(c,-2));g.lineTo(...iso(c,rows+2));g.stroke();}
    for(let r=-2;r<=rows+2;r++){g.beginPath();g.moveTo(...iso(-2,r));g.lineTo(...iso(cols+2,r));g.stroke();}
    const floors=new Map();for(const n of scene.nodes.values())if(n.parent&&life(n,now)>0)floors.set(n.parent,(floors.get(n.parent)||0)+1);
    // Buildings take plots in birth order (scene insertion order), so the city grows instead of rearranging.
    const positions=new Map();
    modules.forEach((m,i)=>{m.c=i%cols;m.r=Math.floor(i/cols);});
    for(const m of modules.slice().sort((a,b)=>(a.c+a.r)-(b.c+b.r))){
      const vis=life(m,now);if(vis<=0)continue;
      const f=floors.get(m.id)||0,target=unit*(.45+Math.min(5,Math.log2(f+1)*.9));
      m.height=(m.height??0)+(target-(m.height??0))*Math.min(1,dt*1.5);
      const height=m.height*vis*(1+.03*pulse),flash=birthFlash(m,now);
      const a=iso(m.c+.12,m.r+.12),b=iso(m.c+.8,m.r+.12),c2=iso(m.c+.8,m.r+.8),d=iso(m.c+.12,m.r+.8);
      const top=[a,b,c2,d].map(([x,y])=>[x,y-height]);
      positions.set(m.id,[(top[0][0]+top[2][0])/2,(top[0][1]+top[2][1])/2]);
      const topColor=['#bdfcff','#b6a0ff','#c1f0c8','#eec4ff'][hash(m.id)%4];
      g.fillStyle=`rgba(29,105,130,${.36*vis})`;g.beginPath();g.moveTo(...top[0]);g.lineTo(...top[3]);g.lineTo(...d);g.lineTo(...a);g.closePath();g.fill();
      g.fillStyle=`rgba(13,43,72,${.82*vis})`;g.beginPath();g.moveTo(...top[3]);g.lineTo(...top[2]);g.lineTo(...c2);g.lineTo(...d);g.closePath();g.fill();
      g.strokeStyle=`rgba(97,206,234,${.28*vis})`;g.stroke();
      g.fillStyle=opacity(topColor,(.36+energy*.2+.6*m.glow+.6*flash)*vis);
      g.beginPath();g.moveTo(...top[0]);g.lineTo(...top[1]);g.lineTo(...top[2]);g.lineTo(...top[3]);g.closePath();g.fill();
      const lit=Math.min(12,f);
      for(let j=0;j<lit;j++){
        const level=(j+1)/(lit+1),y0=d[1]-(d[1]-top[3][1])*level;
        g.strokeStyle=opacity(topColor,(.14+.22*((Math.sin(j*1.7+now/1600)+1)/2)+.3*m.glow)*vis);
        g.beginPath();g.moveTo(d[0]+3,y0);g.lineTo(c2[0]-3,c2[1]-(c2[1]-top[2][1])*level);g.stroke();
      }
      if(m.glow>0||flash>0){g.globalAlpha=Math.max(m.glow,flash);g.drawImage(sprite(topColor),positions.get(m.id)[0]-30,positions.get(m.id)[1]-30,60,60);g.globalAlpha=1;}
    }
    // Only the most-connected modules' dependencies are drawn, so the skyline stays readable at scale.
    g.lineWidth=1;const degree=new Map();
    for(const e of scene.edges.values())if(e.kind==='depends')degree.set(e.b,(degree.get(e.b)||0)+1);
    const routes=[...scene.edges.values()].filter(e=>e.kind==='depends').sort((x,y)=>(degree.get(y.b)||0)-(degree.get(x.b)||0)).slice(0,90);
    for(const e of routes){
      const a=positions.get(e.a),b=positions.get(e.b);if(!a||!b)continue;
      g.strokeStyle=`rgba(227,172,255,${.22+.12*pulse})`;g.beginPath();g.moveTo(...a);g.quadraticCurveTo((a[0]+b[0])/2,(a[1]+b[1])/2-40,...b);g.stroke();
      const f=((now/6000)+rand(hash(e.a+e.b)))%1,mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2-40;
      g.drawImage(sprite('#efb9ff'),(1-f)*(1-f)*a[0]+2*(1-f)*f*mx+f*f*b[0]-4,(1-f)*(1-f)*a[1]+2*(1-f)*f*my+f*f*b[1]-4,8,8);
    }
    const fallback=camera();
    drawComets(w,h,n=>positions.get(n.parent||n.id)||fallback(n));
    drawPulses(dt,n=>positions.get(n.parent||n.id)||fallback(n));
  }
  // ---- The Construct (WebGL), loaded on demand; Monolith is the fallback where WebGL is unavailable ----------
  function replaySpeed(){return FILM?filmSpeed:mode==='replay'?Number($('speedSelect').value)||1:1;}
  let filmSpeed=1;
  function ensureConstruct(){
    if(construct||constructFailed)return Promise.resolve(construct);
    if(!constructLoading)constructLoading=import('/construct.js').then(m=>{
      try{construct=m.createConstruct($('construct'),{onCaption:showCaption,film:FILM,speed:replaySpeed()});construct.reset(constructGraph(),perfNow());}
      catch(e){console.error('Construct unavailable, using Monolith',e);constructFailed=true;construct=null;if(selectedWorld==='construct'){selectedWorld='city';syncPlayerControls();}}
      constructLoading=null;return construct;
    },e=>{constructLoading=null;if(!unreachable(e))console.error(e);return null;});
    return constructLoading;
  }
  // ---- The living world: the project's Visual Recipe rendered by public/worlds (WebGL2) --------------------------------
  function freshWorldCanvas(){const old=$('world'),next=old.cloneNode(false);old.replaceWith(next);bindWorldCanvas(next);return next;}
  function disposeLiving(){if(living){living.dispose();living=null;freshWorldCanvas();}livingFailed=false;livingFor='';recipe=null;}
  async function loadPacks(){
    // A receiver that cannot be reached (restarting, or stopped) says nothing about the packs: keep what was known and
    // leave a running pack alone.
    let fresh;try{fresh=(await getJSON('/api/packs'))?.json?.packs;}catch{syncPackControls();return packs;}
    packs=fresh||[];
    // A running pack whose approval was revoked, whose files changed or which was removed stops at once.
    if(living?.remote){const p=packs.find(x=>x.id===living.pack.id);
      if(!p)stopPack(living.pack,'the pack was removed');else if(!p.ok)stopPack(living.pack,'its files changed after approval');
      else if(!p.trusted||p.digest!==living.pack.digest)stopPack(living.pack,'its approval was revoked');}
    syncPackControls();return packs;}
  // Stop a pack for this session (the recipe keeps it: RETRY or a new approval restores it), finishing any recording.
  function stopPack(pack,reason){
    if(stoppedPacks.has(pack.id)&&!living?.remote)return;
    const began=performance.now();
    stoppedPacks.set(pack.id,reason);stoppedPack=pack;packNotice=`${pack.name} stopped: ${reason}`;
    if(recording.active)void finishRecording(`${pack.name} stopped`);
    syncPackControls();
    if(!FILM&&living?.remote&&living.pack.id===pack.id){disposeLiving();if(selectedWorld==='living')void ensureLiving();}
    lastStop={at:began,pack:pack.id,reason,disposeMs:+(performance.now()-began).toFixed(1)};
  }
  function showNotice(text){packNotice=text;syncPackControls();}
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
  function ensureLiving(){
    if(living&&livingFor===selected)return Promise.resolve(living);
    if(livingFailed||!selected||!model||performance.now()<livingRetryAt)return Promise.resolve(null);
    if(livingLoading)return livingLoading;
    livingLoading=(async()=>{
      try{
        const r=await getJSON(`/api/recipe?id=${encodeURIComponent(selected)}`);if(!r)return null;
        const plan=await packRuntime(r.json).catch(e=>{if(unreachable(e))throw e;return {blocked:'unavailable',name:String(e.message)};});
        if(living)disposeLiving();
        recipe=r.json;packNotice='';
        // A pack the recipe names but the receiver cannot serve (removed, or its files changed after installation).
        const missing=recipe.unavailable&&(recipe.unavailable.family||recipe.unavailable.pack);
        if(missing){const p=packs.find(x=>x.id===missing),name=p?.name||missing,reason=stoppedPacks.get(missing);
          packNotice=reason?`${name} stopped: ${reason}. Showing the identity without it.`:`${name} is not available${p&&!p.ok?' (its installed files changed)':''}: showing the identity without it.`;}
        const options={film:FILM,speed:replaySpeed(),labels:labelMode,quality:FILM?0:qualityLevel(),adaptive:!FILM&&qualityAdaptive()};
        if(plan?.pack){
          // An approved pack with code: the same world host, inside the isolated frame.
          const m=await import('/worlds/remote.js');
          living=await m.createRemoteWorld($('world').parentElement,{...plan,recipe,...options,epoch:replay?.entries.length?replay.start:null});
          // A pack that fails, hangs, loses its GPU context or is too slow is stopped; the identity without it takes over.
          const pack=plan.pack;living.onError(message=>stopPack(pack,message));
          if(recording.active)living.record(onPackFrame);overBudget={since:0,warned:false};
        }else{
          // A pack that needs approval (or is missing) is not run: the identity without it is shown instead.
          let shown=recipe;
          if(plan?.blocked){packNotice=plan.blocked==='approval'?`${plan.name} contains code and is not approved: showing the identity without it.`:plan.blocked==='stopped'?`${plan.name} stopped: ${plan.reason}. Showing the identity without it.`:`${plan.name} is not available: showing the identity without it.`;
            shown=(await getJSON(`/api/recipe?id=${encodeURIComponent(selected)}&fallback=1`))?.json||recipe;}
          const m=await import('/worlds/host.js');
          living=await m.createWorld($('world'),{overlayCanvas:FILM?null:$('worldOverlay'),recipe:shown,...options});
        }
        livingFor=selected;livingSize='';
        if(replay?.entries.length)living.setEpoch(replay.start);
        living.reset(constructGraph(),perfNow());
        if(replay&&(mode==='replay'||FILM))living.prime(replay.entries,perfNow());
        else if(mode==='live')void primeLive(living);
        syncRecipePanel();
      }catch(e){
        if(unreachable(e)){if(living)disposeLiving();livingRetryAt=performance.now()+2000;return null;}
        console.error('Living world unavailable, using the Construct',e);livingFailed=true;living=null;if(selectedWorld==='living'){selectedWorld='construct';syncPlayerControls();void ensureConstruct();}}
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
  async function recipeAction(action){
    if(!selected)return;
    const res=await fetch(`/api/recipe?id=${encodeURIComponent(selected)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
    if(!res.ok)return;const before=recipe;recipe=await res.json();
    // A change of runtime (built-in family, pack world, shader look) builds a new world; otherwise the recipe updates it.
    const runtime=r=>r?.familyKind==='pack'?`world:${r.family}`:r?.pack?.kind==='shader'?`shader:${r.pack.id}`:'builtin';
    if(runtime(before)!==runtime(recipe)||living?.remote){disposeLiving();recipe=null;if(selectedWorld==='living')await ensureLiving();}
    else await living?.setRecipe(recipe);
    syncRecipePanel();
  }
  function syncPackControls(){
    if(!$('dnaPackSelect'))return;
    const family=$('dnaFamilySelect'),look=$('dnaPackSelect');
    for(const o of [...family.options])if(o.dataset.pack)o.remove();
    for(const p of packs.filter(p=>p.kind==='world'&&p.ok&&p.compatible)){const o=new Option(`${p.name.toUpperCase()} · PACK${p.trusted?'':' · NEEDS APPROVAL'}`,p.id);o.dataset.pack='1';family.add(o);}
    look.replaceChildren(new Option('NO LOOK PACK',''));
    for(const p of packs.filter(p=>(p.kind==='declarative'||p.kind==='shader')&&p.ok&&p.compatible))look.add(new Option(`${p.name.toUpperCase()} · ${p.base.toUpperCase()}${p.kind==='shader'?' · CODE':''}`,p.id));
    look.value=recipe?.pack?.id||'';if(recipe?.source==='user')family.value=recipe.family;
    const list=$('dnaPacks');list.replaceChildren();
    for(const p of packs.filter(p=>p.executable)){
      const row=document.createElement('div');row.className='dna-pack';const label=document.createElement('span');
      label.textContent=`${p.name} · ${p.ok?(p.trusted?'approved':'not approved'):'problems'}`;label.title=p.ok?`${p.id} ${p.version}`:p.problems.join('\n');row.append(label);
      if(p.ok){const b=document.createElement('button');b.className='action';b.textContent=p.trusted?'REVOKE':'REVIEW';b.addEventListener('click',()=>p.trusted?setTrust(p,false):review(p));row.append(b);}
      list.append(row);
    }
    $('dnaNotice').textContent=packNotice;$('dnaNotice').classList.toggle('hidden',!packNotice);
    if(stoppedPack&&stoppedPacks.has(stoppedPack.id)){const b=document.createElement('button');b.className='action';b.textContent='RETRY';
      b.addEventListener('click',()=>{stoppedPacks.delete(stoppedPack.id);stoppedPack=null;packNotice='';disposeLiving();if(selectedWorld==='living')void ensureLiving();});$('dnaNotice').append(' ',b);}
    if($('qualitySelect'))$('qualitySelect').value=qualityChoice;
  }
  // Approval of a pack with code: the user sees its author, files and digest, and the isolation limits, then decides.
  function review(p){
    reviewing=p;setText('packReviewTitle',`${p.name} ${p.version}`);
    setText('packReviewMeta',`${p.kind==='world'?'World family':'Shader pack'} · ${p.author?.name||'unknown author'} · ${p.id} · digest ${p.digest.slice(0,16)}`);
    setText('packReviewDescription',p.description||'');
    const files=$('packReviewFiles');files.replaceChildren(...p.files.map(f=>{const li=document.createElement('li');li.textContent=`${f.path}  ${f.size} B  ${f.sha256.slice(0,12)}`;return li;}));
    $('packReview').classList.remove('hidden');$('packReviewCancel').focus();
  }
  async function setTrust(p,trusted){
    const res=await fetch('/api/packs/trust',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,digest:p.digest,trusted})});
    if(!res.ok){packNotice=(await res.json().catch(()=>({}))).error||'Approval failed';syncPackControls();return;}
    await loadPacks();disposeLiving();if(selectedWorld==='living')void ensureLiving();
  }
  function syncRecipePanel(){
    syncPackControls();
    if(!$('dnaFamily'))return;
    setText('dnaFamily',recipe?recipe.familyName.toUpperCase():'—');
    setText('dnaSource',recipe?`${recipe.source==='user'?'CHOSEN':'FROM THE CODE'}${recipe.locked?' · LOCKED':recipe.founded?'':' · PROVISIONAL'} · V${recipe.variant}`:'');
    $('dnaFamilySelect').value=recipe&&recipe.source==='user'?recipe.family:'';
    $('dnaLock').setAttribute('aria-pressed',String(!!recipe?.locked));setText('dnaLock',recipe?.locked?'UNLOCK':'LOCK');
    const k=Math.round((recipe?.overrides?.intensity??1)*100);$('intensitySlider').value=String(k);setText('intensityReadout',`${k}%`);
    $('labelsSelect').value=labelMode;
    if(document.activeElement!==$('dnaTitle'))$('dnaTitle').value=recipe?.title||'';
  }
  // Explorer clicks, in the world's own coordinates (letterboxed while recording at a fixed size).
  function bindWorldCanvas(el){el.addEventListener('click',e=>{if(!living||labelMode!=='explorer')return;const r=el.getBoundingClientRect();
    if(!recordFrame){living.pick(e.clientX-r.left,e.clientY-r.top);return;}
    const k=Math.min(r.width/recordFrame.w,r.height/recordFrame.h),ox=(r.width-recordFrame.w*k)/2,oy=(r.height-recordFrame.h*k)/2;
    living.pick((e.clientX-r.left-ox)/k,(e.clientY-r.top-oy)/k);});}
  // Plain-language narration of meaningful changes, so the performance reads without knowing code.
  let captionTimer=null;
  function showCaption(text){
    caption={text,at:perfNow()};if(params.get('captions')==='0')return;
    const el=$('caption');el.textContent=text;el.classList.add('show');clearTimeout(captionTimer);if(!FILM)captionTimer=setTimeout(()=>el.classList.remove('show'),3800);
  }
  function showWorldCanvas(){const l=selectedWorld==='living'&&!!living,c=!l&&selectedWorld==='construct'&&construct,remote=!!living?.remote;
    $('world').classList.toggle('hidden',!l||remote);$('worldOverlay').classList.toggle('hidden',!l||remote);$('caption').classList.toggle('hidden',l);
    if(remote)living.frame.classList.toggle('hidden',!l);
    $('construct').classList.toggle('hidden',!c);canvas.classList.toggle('hidden',!!(c||l));
    // In the OBS view the living worlds draw their own lower third: the page's corner captions would overlap it.
    document.body.classList.toggle('living-world',l);}
  let lastPaint=performance.now(),clock=0,constructSize='',livingSize='';
  function renderAt(dt,now){
    clock+=dt;
    runQueue();
    const pulse=beat();
    stepScene(dt,now);
    showWorldCanvas();
    if(selectedWorld==='living'&&(!living||livingFor!==selected)&&model)void ensureLiving();
    if(selectedWorld==='living'&&living){
      const r=recordFrame?{width:recordFrame.w,height:recordFrame.h}:(living.remote?living.frame:$('world')).getBoundingClientRect(),dpr=recordFrame?1:Math.min(devicePixelRatio||1,FILM?1:1.5),size=`${r.width}x${r.height}x${dpr}`;
      if(size!==livingSize&&r.width>0){livingSize=size;living.resize(r.width,r.height,dpr);}
      if(FILM){const s=filmSections.filter(x=>x.at<=now).at(-1);if(s)section=s.section;}
      const tempo=window.ResonanceScore.createIdentity(frame?.projectSeed||hash(selected)).tempo[music.options.style]||92;
      living.setMood({section,energy:frame?.controls?.energy||0,tempo:music.options.tempoMode==='project'?tempo:music.options.tempo});
      // A pack frame in a film renders when the film captures the frame (__film.frame).
      if(!(FILM&&living.remote))living.render(now,dt,{phase:barPhase});
      if(living.remote)watchBudget();
    }else if(selectedWorld==='construct'&&construct){
      const r=recordFrame?{width:recordFrame.w,height:recordFrame.h}:$('construct').getBoundingClientRect(),dpr=recordFrame?1:Math.min(devicePixelRatio||1,2),size=`${r.width}x${r.height}x${dpr}`;
      if(size!==constructSize&&r.width>0){constructSize=size;construct.resize(r.width,r.height,dpr);}
      if(FILM){const s=filmSections.filter(x=>x.at<=now).at(-1);if(s)section=s.section;}
      const tempo=window.ResonanceScore.createIdentity(frame?.projectSeed||hash(selected)).tempo[music.options.style]||92;
      construct.setMood({section,energy:frame?.controls?.energy||0,tempo:music.options.tempoMode==='project'?tempo:music.options.tempo});
      construct.render(now,dt,{phase:barPhase});
    }else if(scaledW&&scaledH){backdrop(clock);
      if(selectedWorld==='nexus')drawNexus(clock,dt,now,pulse);else if(selectedWorld==='city')drawCity(clock,dt,now,pulse);else drawNebula(clock,dt,now,pulse);}
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
    if(!caption.text||age>=4200||params.get('captions')==='0')return;
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
    if(!overBudget.warned&&now-overBudget.since>10000){overBudget.warned=true;showNotice(`${living.pack.name} exceeds its declared budget (${over.map(k=>`${k} ${Math.round(s[k])} > ${b[k]}`).join(', ')})`);}
  }
  function paint(nowMs){
    resize();const dt=Math.min(.07,(nowMs-lastPaint)/1000);lastPaint=nowMs;
    if(mode==='replay'&&playback)tickReplay(nowMs);
    renderAt(dt,perfNow());
    if(recording.active&&Math.floor(nowMs/500)!==Math.floor((nowMs-dt*1000)/500))updateRecordButton();
    requestAnimationFrame(paint);
  }
  // ---- Sound, preferences, recording -----------------------------------------------------------------------
  async function toggleSound(){
    if(soundEnabled){
      if(recording.active)await finishRecording('sound turned off');
      soundEnabled=false;await music.stop();setText('soundBtn','◌ ENABLE SOUND');
      dom.sound.classList.remove('on');dom.sound.setAttribute('aria-pressed','false');return;
    }
    music.setProject(selected,model?.performance?.identity);music.setFrame(frame);music.setClock(perfNow,mode==='replay'?Number($('speedSelect').value)||1:1);
    await music.start();soundEnabled=true;
    setText('soundBtn','◉ SOUND ON');dom.sound.classList.add('on');dom.sound.setAttribute('aria-pressed','true');
  }
  function storePrefs(){
    try{localStorage.setItem('code-resonance-player-v1',JSON.stringify({world:selectedWorld,quality:qualityChoice,recordSize,...music.options}));}catch{}
  }
  function syncPlayerControls(){
    for(const btn of document.querySelectorAll('[data-world]')){
      const active=btn.dataset.world===selectedWorld;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
    }
    const tempo=music.options.tempoMode==='project'&&(frame?.projectSeed||selected)?window.ResonanceScore.createIdentity(frame?.projectSeed||hash(selected)).tempo[music.options.style]:music.options.tempo;
    $('musicStyle').value=music.options.style;
    $('volumeSlider').value=String(Math.round(music.options.volume*100));
    $('tempoSlider').value=String(tempo);
    $('textureSlider').value=String(Math.round(music.options.texture*100));
    setText('volumeReadout',`${Math.round(music.options.volume*100)}%`);
    setText('tempoReadout',`${Math.round(tempo)} BPM${music.options.tempoMode==='project'?' · PROJECT':''}`);
    setText('textureReadout',`${Math.round(music.options.texture*100)}%`);
    setText('styleReadout',music.options.style.toUpperCase());
    setText('stageMode',`${selectedWorld==='city'?'MONOLITH':selectedWorld.toUpperCase()} / ${mode==='live'?'GENERATIVE STAGE':'RECORDED PERFORMANCE'}`);
  }
  function setWorld(world){if(!WORLDS.includes(world))return;
    selectedWorld=world;syncPlayerControls();storePrefs();
    if(world==='construct')void ensureConstruct();
    if(world==='living')void ensureLiving();
  }
  async function toggleRecord(){
    if(recording.active){await finishRecording('stopped');return;}
    const support=recording.supported();if(!support.ok){showNotice(support.reason);return;}
    if(!soundEnabled)await toggleSound().catch(e=>console.error(e));
    // A fixed size: the world renders at that size from now on (the stage shows it letterboxed). "stage": the stage's own
    // size (the canvas area, laid out whatever world is showing or loading).
    let bitrate=RECORD_BITRATE[recordSize];
    if(RECORD_SIZES[recordSize]){const [W,H]=RECORD_SIZES[recordSize];recording.resize(W,H);recordFrame={w:W,h:H};document.body.classList.add('recording-fixed');livingSize='';constructSize='';
      await new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));}
    else{const r=$('world').parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);recording.resize(Math.max(320,r.width*dpr),Math.max(180,r.height*dpr));
      bitrate=Math.round(Math.min(8000000,Math.max(2500000,8000000*recording.canvas.width*recording.canvas.height/(1920*1080))));}
    recordPace={frames:0,at:performance.now(),slowSince:0,warned:false};
    // A pack world: its worker starts compositing frames for the recording first, so the file starts on a real frame of
    // the recording's shape (the first may still have the stage's).
    if(living?.remote){living.record(onPackFrame);const t0=performance.now(),aspect=recording.canvas.width/recording.canvas.height;
      while(!(packFrame&&Math.abs(packFrame.width/packFrame.height-aspect)<.01)&&living?.remote&&performance.now()-t0<2000)await new Promise(res=>setTimeout(res,16));}
    const started=recording.start({audioStream:music.stream,fps:30,bitsPerSecond:bitrate,audioContext:music.ctx,musicLevel:()=>music.level(),
      // The sound lost (an audio device lost or stalled): the browser's recorder would stall the file, so it is finished
      // and saved now, with the reason.
      audioLostListener:()=>{void finishRecording('the sound stopped: an audio device was lost or stalled');}});
    if(!started.ok){if(living?.remote)living.record(null);endRecordFrame();showNotice(started.reason);return;}
    if(!started.audio)showNotice('Recording without sound: the music output could not be captured.');
    $('recordBtn').classList.add('recording');$('recordSize').disabled=true;updateRecordButton();
  }
  function endRecordFrame(){if(!recordFrame)return;recordFrame=null;document.body.classList.remove('recording-fixed');livingSize='';constructSize='';}
  function updateRecordButton(){
    if(!recording.active){$('recordBtn').classList.remove('recording');$('recordSize').disabled=false;setText('recordBtn','● RECORD');return;}
    // A machine that cannot keep the chosen size near 30 frames per second is told once (the file would stutter). The
    // capture keeps fewer frames than are drawn when drawing is near 30 a second (31 drawn gave 26-28 in the file), so
    // under 28 drawn the file is likely under 25.
    const now=performance.now(),st=recording.stats();
    if(now-recordPace.at>=5000){const fps=(st.frames-recordPace.frames)/((now-recordPace.at)/1000);recordPace.frames=st.frames;recordPace.at=now;recordPace.fps=fps;
      if(fps<28){recordPace.slowSince||=now;if(!recordPace.warned&&now-recordPace.slowSince>=10000){recordPace.warned=true;
        showNotice(`Recording ${recordSize==='stage'?'':`at ${recordSize} `}is not keeping up on this machine (${fps.toFixed(0)} frames per second): choose ${recordSize==='1080p'?'720p or ':''}a lower Quality.`);}}
      else recordPace.slowSince=0;}
    const s=Math.floor(recording.stats().elapsedMs/1000);setText('recordBtn',`■ STOP ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}${recording.audio&&!recording.audioLost?'':' · NO SOUND'}`);
  }
  // Finish the recording and offer the file (stopped by the user, by a pack failure, or by the page).
  async function finishRecording(reason){
    if(living?.remote)living.record(null);
    const result=await recording.stop(reason);packFrame?.close();packFrame=null;endRecordFrame();updateRecordButton();
    if(!result)return null;
    lastRecording={mimeType:result.mimeType,durationMs:Math.round(result.durationMs),frames:result.frames,bytes:result.bytes,audio:result.audio,audioLost:result.audioLost,audioLostMs:result.audioLostMs,reason:result.reason,
      size:recording.canvas.width+'x'+recording.canvas.height,slowWarning:recordPace.warned};
    if(!result.blob.size){showNotice(`The recording could not be saved: ${reason==='stopped'?'the browser produced no file':reason+', and the browser produced no file'}.`);return lastRecording;}
    if(result.blob.size>0){const url=URL.createObjectURL(result.blob),link=document.createElement('a');
      // The download holds its own reference once started: the URL (which kept the whole file in memory) goes at once.
      link.href=url;link.download=`code-resonance-${selected.slice(0,10)||'performance'}-${Date.now()}.webm`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
    if(reason!=='stopped')showNotice(`Recording finished early (${reason}); ${Math.round(result.durationMs/1000)} s saved.`);

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
  async function exportAudio(){
    if(!selected)return;
    const button=$('audioBtn');button.disabled=true;setText('audioBtn','RENDERING…');
    try{
      if(!replay)await loadReplay();
      if(!replay?.entries.length)return;
      const from=mode==='replay'?replayPos:Math.max(replay.start,replay.end-600000),to=Math.min(replay.end,from+600000);
      const timeline=[];
      for(const e of replay.entries){if(e.end<from-60000||e.start>to)continue;timeline.push({atMs:Math.max(from,e.start),frame:e.frame});
        for(const c of e.cues)if(!QUIET.has(c.type))timeline.push({atMs:cueTime(c,e),cue:c});}
      const buffer=await window.ResonanceMusic.renderOffline({timeline:timeline.filter(x=>x.atMs>=from-1),startMs:from,durationSec:Math.max(5,(to-from)/1000),
        style:music.options.style,texture:music.options.texture,volume:Math.max(.4,music.options.volume),projectId:selected});
      const url=URL.createObjectURL(wav(buffer)),link=document.createElement('a');
      link.href=url;link.download=`code-resonance-${(model?.name||selected.slice(0,10)).replace(/[^a-z0-9-]+/gi,'-')}-${music.options.style}.wav`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }finally{button.disabled=false;setText('audioBtn','AUDIO ↓');}
  }
  // ---- Replay: the whole recorded performance, played on the same clock -----------------------------------
  async function loadReplay(){
    if(!selected)return;
    const entries=[];let after=-1;
    try{
      for(;;){const page=(await getJSON(`/api/timeline?id=${encodeURIComponent(selected)}&after=${after}&limit=500`))?.json;if(!page)break;
        entries.push(...page.entries);if(!page.entries.length||entries.length>=page.total)break;after=page.entries.at(-1).seq;}
    }catch{}
    const birth=new Map();
    for(const e of entries)for(const n of e.graph.keyframe?e.graph.nodes:e.graph.add)if(n.type==='module'&&!birth.has(n.id))birth.set(n.id,birth.size);
    replay={entries,cues:entries.flatMap(e=>e.cues),start:entries[0]?.start||0,end:entries.at(-1)?.end||0,birth};
    if(entries.length)living?.setEpoch(replay.start);
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
    const h=history();dom.scrub.value=String(Math.round(((ts-h.start)/(h.end-h.start||1))*1000));
    if(model){renderFeed();setStats(model);}
  }
  function tickReplay(now){
    const h=history();if(!replay?.entries.length)return;
    const speed=Number($('speedSelect').value)||4,dt=Math.min(300,now-replayClock);
    replayPos+=dt*speed;replayClock=now;
    // Keep a minute of upcoming windows scheduled.
    while(replay.scheduledTo<replay.entries.length-1&&replay.entries[replay.scheduledTo+1].start<=replayPos+60000)schedule(replay.entries[++replay.scheduledTo],{animate:true});
    if(replayPos>=h.end){replayPos=h.end;playback=false;$('playBtn').textContent='▶';}
    dom.scrub.value=String(Math.round(((replayPos-h.start)/(h.end-h.start||1))*1000));
    if(Math.floor(now/500)!==Math.floor((now-dt)/500)&&model){renderFeed();setStats(model);}
  }
  function changeMode(value){
    mode=value;playback=false;$('playBtn').textContent='▶';queue.length=0;
    $('liveBtn').classList.toggle('selected',value==='live');$('replayBtn').classList.toggle('selected',value==='replay');
    $('liveBtn').setAttribute('aria-pressed',String(value==='live'));$('replayBtn').setAttribute('aria-pressed',String(value==='replay'));
    dom.scrub.disabled=value==='live';$('playBtn').disabled=value==='live';
    syncPlayerControls();
    $('liveIndicator').textContent=value==='live'?'LIVE':'REPLAY';
    music.setClock(perfNow,value==='replay'?Number($('speedSelect').value)||1:1);construct?.setSpeed(replaySpeed());living?.setSpeed(replaySpeed());
    if(value==='replay'){dom.scrub.value='0';
      void loadReplay().then(()=>{if(mode!=='replay')return;seek(replay.start);});}
    else{dom.scrub.value='1000';replay=null;etag='';feedCues=[];resetScene({nodes:[],edges:[]});lastSeq=-1;pollProject();}
  }
  function timestampFromScrub(v){const h=history();return h.start+(h.end-h.start)*(Number(v)/1000);}
  dom.project.addEventListener('change',()=>selectProject(dom.project.value));
  $('liveBtn').addEventListener('click',()=>changeMode('live'));
  $('replayBtn').addEventListener('click',()=>changeMode('replay'));
  $('playBtn').addEventListener('click',()=>{
    const h=history();if(mode!=='replay'||!h.cues.length)return;
    if(replayPos>=h.end)seek(h.start);
    playback=!playback;replayClock=performance.now();$('playBtn').textContent=playback?'Ⅱ':'▶';
  });
  $('speedSelect').addEventListener('change',()=>{if(mode==='replay'){music.setClock(perfNow,Number($('speedSelect').value)||1);construct?.setSpeed(replaySpeed());living?.setSpeed(replaySpeed());seek(replayPos);}});
  dom.scrub.addEventListener('input',()=>{if(mode==='replay'){playback=false;$('playBtn').textContent='▶';seek(timestampFromScrub(dom.scrub.value));}});
  dom.sound.addEventListener('click',()=>toggleSound().catch(e=>{console.error(e);setText('soundBtn','AUDIO ERROR');}));
  for(const btn of document.querySelectorAll('[data-world]'))btn.addEventListener('click',()=>setWorld(btn.dataset.world));
  bindWorldCanvas($('world'));
  $('dnaPackSelect').addEventListener('change',()=>recipeAction({type:'pack',pack:$('dnaPackSelect').value||null}).catch(console.error));
  $('packReviewCancel').addEventListener('click',()=>{reviewing=null;$('packReview').classList.add('hidden');});
  $('packReviewAllow').addEventListener('click',()=>{const p=reviewing;reviewing=null;$('packReview').classList.add('hidden');if(p)setTrust(p,true).catch(console.error);});
  $('dnaFamilySelect').addEventListener('change',()=>{const v=$('dnaFamilySelect').value;recipeAction(v?{type:'family',family:v}:{type:'automatic'}).catch(console.error);});
  $('dnaRegenerate').addEventListener('click',()=>recipeAction({type:'regenerate',keepFamily:recipe?.source==='user'}).catch(console.error));
  $('dnaLock').addEventListener('click',()=>recipeAction({type:'lock',locked:!recipe?.locked}).catch(console.error));
  $('intensitySlider').addEventListener('change',()=>recipeAction({type:'overrides',intensity:Number($('intensitySlider').value)/100}).catch(console.error));
  $('intensitySlider').addEventListener('input',()=>setText('intensityReadout',`${$('intensitySlider').value}%`));
  $('labelsSelect').addEventListener('change',()=>{labelMode=$('labelsSelect').value;living?.setLabels(labelMode);});
  $('recordSize').value=recordSize;
  $('recordSize').addEventListener('change',()=>{const v=$('recordSize').value;recordSize=v==='stage'||RECORD_SIZES[v]?v:'720p';storePrefs();});
  $('qualitySelect').addEventListener('change',()=>{qualityChoice=QUALITY.includes($('qualitySelect').value)?$('qualitySelect').value:'auto';living?.setQuality?.(qualityLevel(),qualityAdaptive());storePrefs();});
  // The public title is the only project name the Stage may show, and only once the user sets it here.
  $('dnaTitle').addEventListener('change',()=>recipeAction({type:'title',title:$('dnaTitle').value.trim()||null}).catch(console.error));
  $('musicStyle').addEventListener('change',()=>{music.setOptions({style:$('musicStyle').value});syncPlayerControls();storePrefs();});
  for(const [id,key,convert] of [['volumeSlider','volume',v=>v/100],['tempoSlider','tempo',v=>v],['textureSlider','texture',v=>v/100]]){
    $(id).addEventListener('input',()=>{music.setOptions({[key]:convert(Number($(id).value)),...(key==='tempo'?{tempoMode:'manual'}:{})});syncPlayerControls();storePrefs();});
  }
  $('tempoReadout').addEventListener('dblclick',()=>{music.setOptions({tempoMode:'project'});syncPlayerControls();storePrefs();});
  $('recordBtn').addEventListener('click',()=>toggleRecord().catch(e=>{console.error(e);setText('recordBtn','RECORD ERROR');}));
  $('overlayBtn').addEventListener('click',()=>window.open(`/?overlay=1&sound=1&project=${encodeURIComponent(selected)}&world=${selectedWorld}&style=${music.options.style}`,'_blank','noopener'));
  if(overlay)document.body.classList.add('overlay');
  syncPlayerControls();
  $('exportBtn').addEventListener('click',()=>{if(selected)window.open(`/api/export?id=${encodeURIComponent(selected)}`,'_blank','noopener');});
  $('audioBtn').addEventListener('click',()=>exportAudio().catch(e=>{console.error(e);setText('audioBtn','EXPORT ERROR');}));
  // Delay = window + grace + scan + 3 s for outbox delivery (<=2.5 s) and polling (<=1 s). Measured worst case: ~9.9 s.
  getJSON('/health').then(r=>{const x=r.json;delayMs=(x.windowMs||10000)+(x.graceMs??3000)+(x.sortIntervalMs||1000)+3000;setText('renderDelay',`${(delayMs/1000).toFixed(1)}s PERFORMANCE DELAY`);}).catch(()=>{});
  // OBS browser sources allow audio without a click; a regular browser will ignore this until a gesture.
  if(overlay&&params.get('sound')==='1')toggleSound().catch(()=>{});
  // Qualification hooks (?qual=1 only): recording control and picture/sound markers.
  if(params.has('qual'))window.__qual={
    record:()=>toggleRecord(),stop:()=>finishRecording('stopped'),breakRecordingAudio:()=>recording.breakAudio(),recording:()=>({...recording.stats(),last:lastRecording}),
    // A flash and a click at the same performance time, delayMs (real time) from now.
    audioClock:()=>music.ctx?music.ctx.currentTime:null,structure:()=>model?{nodes:model.graph?.nodes?.length||0,edges:model.graph?.edges?.length||0}:null,setRecordSize:v=>{recordSize=v==='stage'||RECORD_SIZES[v]?v:'720p';$('recordSize').value=recordSize;return recordSize;},
    marker(delayMs=300){const at=perfNow()+delayMs*replaySpeed();flashes.push({at,shown:0});return music.marker(at);},pilot:on=>music.pilot(on),perfNow:()=>perfNow(),stats:()=>living?.stats?.()||null,
    world:()=>({selectedWorld,remote:!!living?.remote,pack:living?.pack?.id||null,family:living?.recipe?.family||null,look:living?.recipe?.pack?.id||null,
      frames:document.querySelectorAll('iframe.pack-frame').length,notice:packNotice,lastStop}),
    action:a=>recipeAction(a),setWorld:w=>setWorld(w),
    // Rebuild the living world (what RETRY does), e.g. while the receiver is unreachable.
    rebuildWorld(){disposeLiving();if(selectedWorld==='living')void ensureLiving();return true;},
    // Replay from the beginning (a recording then covers the same moments however long the world took to load).
    replayFromStart(){if(mode!=='replay'||!replay)return false;seek(history().start);playback=true;replayClock=performance.now();$('playBtn').textContent='Ⅱ';return true;}};
  if(FILM){
    // Deterministic film: open a recorded performance, then render each frame at an exact performance time.
    document.body.classList.add('overlay');mode='replay';
    window.__film={
      async open({project,speed=1,note=''}){selected=project;filmSpeed=speed;filmNote=String(note||'').slice(0,160);await pollProject();await loadReplay();
        if(selectedWorld==='living'){await ensureLiving();living?.setSpeed(speed);}else{await ensureConstruct();construct?.setSpeed(speed);}
        return {start:replay.start,end:replay.end,windows:replay.entries.length,webgl:!!(living||construct),world:living?'living':'construct',recipe:living?.recipe||null};},
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
      memory(){const s=living?.stats();return {geometries:s?.geometries,textures:s?.textures,heap:performance.memory?performance.memory.usedJSHeapSize:null};}
    };
  }else{
    // Render counts only (draw calls, buildings, …) for the technical qualification.
    window.__constructStats=()=>construct?.stats();window.__worldStats=()=>living?.stats();
    setInterval(pollProjects,5000);setInterval(pollProject,3000);setInterval(pollTimeline,1000);setInterval(loadPacks,5000);void loadPacks();
    setInterval(()=>{if(feedDirty&&model&&mode==='live'){feedDirty=false;renderFeed();setStats(model);}},1000);
    pollProjects().then(pollProject);requestAnimationFrame(paint);
    if(selectedWorld==='construct')void ensureConstruct();
  }
})();

'use strict';
// Code Resonance is a fully independent local performance player.
(() => {
  const $=id=>document.getElementById(id);
  const canvas=$('stage'); const g=canvas.getContext('2d',{alpha:false});
  const dom={project:$('projectSelect'),feed:$('feed'),scrub:$('scrub'),sound:$('soundBtn'),chapter:$('chapter')};
  let selected='',model=null,lastCue='',mode='live',playback=false,replayPos=0,replayPrev=0,replayClock=0;
  let frame=null,firstPoll=true,clock=0,scaledW=0,scaledH=0,replayGraphs=[];
  let graph=new Map(),edges=[],particles=[],pulses=[],sparks=[],lastGraphKey='';
  const music=new window.ResonanceMusic(({index})=>setText('barCounter',`BAR ${String(index).padStart(3,'0')}`));
  let selectedWorld='nexus',recorder=null,recordChunks=[],recordStreams=[];
  let soundEnabled=false;
  try {const prefs=JSON.parse(localStorage.getItem('code-resonance-player-v1')||'{}');
    if(['nexus','city','nebula'].includes(prefs.world))selectedWorld=prefs.world;
    if(window.ResonanceScore.STYLES.includes(prefs.style))music.setOptions({style:prefs.style});
    if(Number.isFinite(prefs.volume)&&prefs.volume>=0&&prefs.volume<=1)music.setOptions({volume:prefs.volume});
    if(Number.isFinite(prefs.tempo)&&prefs.tempo>=58&&prefs.tempo<=160)music.setOptions({tempo:prefs.tempo});
    if(Number.isFinite(prefs.texture)&&prefs.texture>=0&&prefs.texture<=1)music.setOptions({texture:prefs.texture});
  }catch{}
  const typeColor={module:'#7ceeff','ui.component':'#df9cff','api.route':'#a6f5cb',function:'#75c9ff',variable:'#9e8fff',class:'#f4ca97',interface:'#ffaec2',method:'#9ae8ef',type:'#b8b8fc',callsite:'#6795bd'};
  const labels={
    'project.baseline':'Initial architecture scan','document.baseline.indexed':'Indexed existing symbols',
    'symbol.created':'A structure emerged','symbol.modified':'A structure evolved','symbol.removed':'A structure was reshaped',
    'dependency.added':'Systems connected','dependency.removed':'Dependency detached',
    'document.change.overflow':'Large code change','source.parse.diagnostics':'Source parser noticed errors',
    'editor.change.observed':'Code changed','editor.newline.inserted':'New line entered',
    'document.saved':'Document saved','file.created':'File created','file.deleted':'File removed','file.renamed':'File renamed',
    'execution.task.started':'A task began','execution.task.succeeded':'Task completed','execution.task.failed':'Task failed',
    'execution.task.unknown':'Task outcome unknown','execution.command.started':'Terminal activity','execution.command.finished':'Command finished',
    'validation.test.passed':'Tests passed','validation.test.failed':'Tests failed','validation.diagnostics':'Editor diagnostics',
    'repository.commit.observed':'New commit observed','agent.prompt.submitted':'An AI prompt was sent','agent.thinking.visible':'Visible agent reasoning',
    'agent.tool.started':'An agent used a tool','agent.tool.completed':'Agent tool finished','agent.file.modified':'Agent modified a file',
    'agent.response.completed':'Agent completed a response','agent.message.visible':'AI message observed',
    'agent.plan.visible':'AI plan observed','workspace.started':'Capture started','workspace.stopped':'Capture stopped','instrument.note':'Manual cue'
  };
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function rand(seed){let t=seed+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
  function opacity(color,opacity){const a=Math.floor(Math.min(1,Math.max(0,opacity))*255).toString(16).padStart(2,'0');return color+a;}
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  function setText(id,s){const e=$(id);if(e)e.textContent=String(s);}
  function timeText(n){if(!n)return '—';return new Date(n).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  function readable(type){return labels[type]||type.replaceAll('.',' · ');}
  function kindClass(type){return type.startsWith('agent.')?'ai':type.startsWith('validation.')||type==='source.parse.diagnostics'?'validation':type.startsWith('symbol.')||type.startsWith('dependency.')?'structure':'system';}
  function eventLabel(c){if(c.detail?.symbolType)return `${readable(c.type)} · ${c.detail.symbolType.toUpperCase()}`;return readable(c.type);}
  function animateCue(c){
    const category=kindClass(c.type);
    const color=category==='ai'?'#ed94ff':category==='validation'?'#ffbb84':category==='system'?'#93f6c0':'#75edff';
    const n=Math.min(3,Math.max(1,Math.ceil((c.weight||.1)*1.4)));
    for(let i=0;i<n;i++){
      const seed=hash(c.id)+i;
      const radius=(.03+rand(seed)*.34);
      const angle=rand(seed+12)*Math.PI*2;
      pulses.push({x:.5+Math.cos(angle)*radius*.6,y:.5+Math.sin(angle)*radius*.7,color,age:0,speed:.32+rand(seed+4)*.28});
      if(pulses.length>140)pulses.shift();
    }
    music.accent(c.type);
  }
  async function getJSON(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
  async function poll(){
    try{
      const list=await getJSON('/api/projects');
      const ids=new Set(list.projects.map(p=>p.id));
      const choice=dom.project.value;
      if(dom.project.options.length!==list.projects.length+1||[...ids].some(id=>![...dom.project.options].some(o=>o.value===id))){
        dom.project.replaceChildren(new Option('SELECT PROJECT',''));
        for(const p of list.projects)dom.project.add(new Option(`PROJECT ${p.id.slice(0,8).toUpperCase()}`,p.id));
        dom.project.value=ids.has(choice)?choice:'';
      }
      if(!selected||!ids.has(selected)){selected=ids.has(choice)?choice:list.projects[0]?.id||'';dom.project.value=selected;lastCue='';lastGraphKey='';replayGraphs=[];}
      if(!selected){setConnection(false);return;}
      const next=await getJSON(`/api/project?id=${encodeURIComponent(selected)}`);
      if(!next.timeline||!next.graph)throw Error('Invalid project model');
      setConnection(true);
      const newCues=lastCue?next.timeline.slice(Math.max(0,next.timeline.findIndex(c=>c.id===lastCue)+1)):[];
      const hasLast=lastCue&&next.timeline.some(c=>c.id===lastCue);
      if(mode==='live'&&!firstPoll){
        if(hasLast)newCues.slice(-35).forEach(animateCue);
        else if(lastCue)next.timeline.slice(-12).forEach(animateCue);
      }
      firstPoll=false;lastCue=next.timeline.at(-1)?.id||'';model=next;
      if(mode==='live')frame=next.frames.at(-1)||frame;
      music.setProject(selected,next.performance?.identity);music.setFrame(frame);
      setStats(next);if(mode==='live')layoutGraph(next.graph);renderFeed();
    }catch(e){setConnection(false);setText('connection','RECEIVER OFFLINE');}
  }
  function setConnection(ok){$('statusDot').classList.toggle('active',!!ok);setText('connection',ok?'SESSION CONNECTED':'RECEIVER OFFLINE');$('stageEmpty').classList.toggle('hidden',!!model);}
  function setStats(m){
    const p=m.performance||{};const controls=(mode==='replay'&&frame)?frame.controls:m.frames.at(-1)?.controls||{};
    setText('projectName',m.projectId.slice(0,12).toUpperCase());
    setText('seedLabel',`ROOT ${p.identity?.scale||'D'} · ${p.identity?.motif?.length||4} NOTE MOTIF`);
    const chapter=mode==='replay'?(frame?.chapter||1):(p.chapter||1);
    setText('chapter',String(chapter).padStart(2,'0'));
    const names=['ORIGIN','FORMATION','STRUCTURE','CONNECTION','INTEGRATION','EVOLUTION','COMPOSITION','RESONANCE'];
    setText('chapterName',names[Math.min(names.length-1,Math.max(0,chapter-1))]);
    $('chapterFill').style.width=`${(12+((p.progress||0)%5)*15).toFixed(1)}%`;
    for(const [name,value] of [['energy',controls.energy||0],['tension',controls.tension||0],['complexity',controls.complexity||0]]){
      const n=Math.round(clamp(value)*100);$(`${name}Bar`).style.width=n+'%';setText(`${name}Number`,String(n).padStart(2,'0'));
    }
    setText('files',m.stats.files);setText('symbols',m.stats.symbols);setText('events',m.stats.raw);setText('tests',m.stats.testsPassed);
    setText('eventCount',m.timeline.length);
    setText('confidence','OBSERVED + INFERRED');
    const min=m.timeline.at(0)?.ts,max=m.timeline.at(-1)?.ts;
    setText('scrubStart',timeText(min));setText('scrubEnd',mode==='live'?'NOW':timeText(max));
    $('stageEmpty').classList.toggle('hidden',true);
    $('playBtn').disabled=!m.timeline.length||mode!=='replay';
  }
  function renderFeed(){if(!model)return;
    const filtered=model.timeline.filter(c=>!['editor.change.observed','document.baseline.indexed'].includes(c.type));
    const source=mode==='replay'?filtered.filter(c=>c.ts<=replayPos):filtered;
    const recent=source.slice(-28).reverse();
    const fragment=document.createDocumentFragment();
    for(const c of recent){
      const d=document.createElement('div');d.className='feed-entry';
      const marker=document.createElement('span');marker.className=`feed-marker ${kindClass(c.type)}`;
      const content=document.createElement('div');content.className='feed-copy';
      const title=document.createElement('strong');title.textContent=eventLabel(c);
      const detail=document.createElement('div');detail.textContent=`${timeText(c.ts)}  /  ${c.category.toUpperCase()}  /  ${c.weight?'STRUCTURAL':'ACTIVITY'}`;
      content.append(title,detail);d.append(marker,content);fragment.append(d);
    }
    dom.feed.replaceChildren(fragment);
    if(!recent.length){const none=document.createElement('div');none.className='feed-empty';none.textContent='No classified events yet.';dom.feed.append(none);}
  }
  function layoutGraph(data){
    const key=JSON.stringify([data.nodes.map(n=>n.id),data.edges.map(e=>e.a+e.b)]);
    if(key===lastGraphKey)return;lastGraphKey=key;
    const old=graph;graph=new Map();edges=[];
    const modules=data.nodes.filter(x=>x.type==='module').sort((a,b)=>a.id.localeCompare(b.id)).slice(0,70);
    const parents=new Map();for(const e of data.edges)if(e.kind==='contains')parents.set(e.b,e.a);
    modules.forEach((node,i)=>{
      const r=modules.length<2?.16:.1+.31*Math.sqrt((i+1)/modules.length);
      const angle=i*2.3999632297+rand(hash(node.id))*0.45;
      const x=.5+Math.cos(angle)*r,y=.5+Math.sin(angle)*r*.88;
      graph.set(node.id,{...node,x:old.get(node.id)?.x??x,y:old.get(node.id)?.y??y,tx:x,ty:y});
    });
    const sub=data.nodes.filter(x=>x.type!=='module').slice(0,350);
    for(const node of sub){
      const parent=graph.get(parents.get(node.id));if(!parent)continue;
      const h=hash(node.id),a=rand(h)*Math.PI*2,r=.016+rand(h+2)*.052;
      const x=clamp(parent.tx+Math.cos(a)*r,.045,.955),y=clamp(parent.ty+Math.sin(a)*r,.07,.93);
      graph.set(node.id,{...node,x:old.get(node.id)?.x??x,y:old.get(node.id)?.y??y,tx:x,ty:y});
    }
    edges=data.edges.filter(e=>graph.has(e.a)&&graph.has(e.b)).slice(0,600);
  }
  function resize(){
    const r=canvas.getBoundingClientRect();if(r.width===0||r.height===0)return;
    scaledW=r.width;scaledH=r.height;const dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.floor(r.width*dpr)||canvas.height!==Math.floor(r.height*dpr)){
      canvas.width=Math.floor(r.width*dpr);canvas.height=Math.floor(r.height*dpr);g.setTransform(dpr,0,0,dpr,0,0);
    }
  }
  function backdrop(t){
    const w=scaledW,h=scaledH;g.fillStyle='#080c17';g.fillRect(0,0,w,h);
    const haze=g.createRadialGradient(w*.52,h*.47,12,w*.5,h*.5,Math.max(w,h)*.62);
    haze.addColorStop(0,selectedWorld==='nebula'?'#201334':selectedWorld==='city'?'#112b34':'#14233b');haze.addColorStop(.32,selectedWorld==='nebula'?'#140f24':'#0b1528');haze.addColorStop(1,'#070a11');g.fillStyle=haze;g.fillRect(0,0,w,h);
    g.save();g.strokeStyle='rgba(112,150,200,0.045)';g.lineWidth=1;
    const step=selectedWorld==='city'?34:47;for(let x=(t*1.4)%step;x<w;x+=step){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
    for(let y=(t*.7)%step;y<h;y+=step){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}g.restore();
    for(let i=0;i<(selectedWorld==='nebula'?390:170);i++){
      const seed=hash('star-'+i),x=rand(seed)*w,y=rand(seed+29)*h;
      const intensity=.06+rand(seed+5)*.25*(.8+Math.sin(t*(.4+rand(seed+11))+i)*.2);
      g.fillStyle=`rgba(176,209,250,${intensity})`;g.fillRect(x,y,1,1);
    }
  }
  function drawCore(t){
    const w=scaledW,h=scaledH,core=Math.min(w,h),x=w*.5,y=h*.5;
    const energy=frame?.controls?.energy||0,tension=frame?.controls?.tension||0;
    for(let ring=0;ring<4;ring++){
      const radius=core*(.078+ring*.045),rot=t*(ring%2?-.08:.06)+(ring*1.7),arc=Math.PI*(.7+ring*.13);
      g.save();g.translate(x,y);g.rotate(rot);
      g.strokeStyle=ring%2?`rgba(145,138,255,${.06+energy*.07})`:`rgba(104,233,255,${.07+energy*.15})`;
      g.lineWidth=ring===0?1.7:1;
      g.beginPath();g.arc(0,0,radius,0,arc);g.stroke();g.beginPath();g.arc(0,0,radius,Math.PI,Math.PI+arc*.48);g.stroke();g.restore();
    }
    const rad=core*(.028+energy*.006+Math.sin(t*1.4)*.001);
    const halo=g.createRadialGradient(x,y,0,x,y,rad*6);
    halo.addColorStop(0,`rgba(188,245,255,${.64+energy*.2})`);
    halo.addColorStop(.13,`rgba(85,227,255,${.30+energy*.18})`);
    halo.addColorStop(.4,'rgba(59,130,217,.06)');halo.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=halo;g.fillRect(x-rad*6,y-rad*6,rad*12,rad*12);
    g.save();g.translate(x,y);g.rotate(t*.22);g.strokeStyle=opacity(tension>.35?'#f4adc3':'#8bdcf4',.65);
    g.lineWidth=1;g.strokeRect(-rad*.68,-rad*.68,rad*1.36,rad*1.36);g.rotate(Math.PI/4);g.strokeRect(-rad*.49,-rad*.49,rad*.98,rad*.98);g.restore();
  }
  function drawGraph(t,dt){
    const w=scaledW,h=scaledH,size=Math.min(w,h),energy=frame?.controls?.energy||0;
    // Eased graph motion makes structure growth feel physical without simulating the build.
    for(const node of graph.values()){
      node.x+=(node.tx-node.x)*Math.min(1,dt*1.9);
      node.y+=(node.ty-node.y)*Math.min(1,dt*1.9);
    }
    g.save();g.lineWidth=.8;
    for(const edge of edges){
      const a=graph.get(edge.a),b=graph.get(edge.b);if(!a||!b)continue;
      g.strokeStyle=edge.kind==='depends'?'rgba(237,148,255,.23)':'rgba(106,212,242,.13)';
      g.beginPath();g.moveTo(a.x*w,a.y*h);g.lineTo(b.x*w,b.y*h);g.stroke();
      if(edge.kind==='depends'){
        const f=(t*.13+rand(hash(edge.a+edge.b)))%1;
        g.fillStyle='rgba(239,185,255,.65)';g.beginPath();g.arc((a.x+(b.x-a.x)*f)*w,(a.y+(b.y-a.y)*f)*h,1.5,0,Math.PI*2);g.fill();
      }
    }
    g.restore();
    let i=0;for(const node of graph.values()){
      const x=node.x*w,y=node.y*h;
      const color=typeColor[node.type]||'#8cbad8';
      const rad=(node.type==='module'?4.5:2)*clamp(node.weight||1,.6,3)*.65;
      const twinkle=.78+Math.sin(t*1.6+i*.65)*.19+energy*.15;
      g.save();g.globalAlpha=twinkle;g.shadowColor=color;g.shadowBlur=node.type==='module'?22:10;
      g.fillStyle=color;g.beginPath();g.arc(x,y,rad,0,Math.PI*2);g.fill();
      if(node.type==='module'){
        g.shadowBlur=0;g.strokeStyle=opacity(color,.18);g.beginPath();g.arc(x,y,rad+4+Math.sin(t+i)*1.5,0,Math.PI*2);g.stroke();
      }
      g.restore();i++;
    }
  }
  // Alternate scenes consume exactly the same anonymized architecture graph.
  function drawCity(t,dt){
    const w=scaledW,h=scaledH,modules=[...graph.values()].filter(n=>n.type==='module').sort((a,b)=>a.id.localeCompare(b.id));
    const chapter=frame?.chapter||1,energy=frame?.controls?.energy||0;
    g.save();
    // Project grid: architectural activity creates buildings, symbols create floors/windows.
    const count=modules.length,cols=Math.max(3,Math.ceil(Math.sqrt(Math.max(count,9)))),rows=Math.ceil(Math.max(count,9)/cols);
    const unit=Math.min(52,w/(cols+rows+2)*1.15,h/(cols+rows+2)*2.15);
    const cx=w*.50,cy=h*.36;
    function iso(c,r,z=0){return [cx+(c-r)*unit*.94,cy+(c+r)*unit*.39-z];}
    for(let c=-4;c<cols+6;c++)for(let r=-4;r<rows+6;r++){
      const a=iso(c,r),b=iso(c+1,r),d=iso(c,r+1),e=iso(c+1,r+1);
      g.strokeStyle='rgba(95,204,223,.065)';g.lineWidth=1;g.beginPath();g.moveTo(...a);g.lineTo(...b);g.lineTo(...e);g.lineTo(...d);g.closePath();g.stroke();
    }
    const children=new Map();for(const edge of edges)if(edge.kind==='contains')children.set(edge.a,(children.get(edge.a)||0)+1);
    const sorted=modules.map((m,i)=>({m,c:i%cols,r:Math.floor(i/cols)})).sort((a,b)=>(a.c+a.r)-(b.c+b.r));
    const positions=new Map();
    for(const {m,c,r} of sorted){
      const floors=Math.max(1,children.get(m.id)||1),height=unit*(.48+Math.min(4.7,Math.log2(floors+1)*.83))*(.85+.12*Math.sin(t*.4+hash(m.id)));
      const a=iso(c+.10,r+.1),b=iso(c+.79,r+.10),cc=iso(c+.79,r+.79),d=iso(c+.10,r+.79);
      const top=[a,b,cc,d].map(([xx,yy])=>[xx,yy-height]);
      positions.set(m.id,[(top[0][0]+top[2][0])/2,(top[0][1]+top[2][1])/2]);
      const hue=(hash(m.id)%4),topColor=['#bdfcff','#b6a0ff','#c1f0c8','#eec4ff'][hue];
      g.shadowColor='#23c6ef';g.shadowBlur=8+energy*8;g.fillStyle='rgba(29,105,130,.38)';
      g.beginPath();g.moveTo(...top[0]);g.lineTo(...top[3]);g.lineTo(...d);g.lineTo(...a);g.closePath();g.fill();
      g.shadowBlur=0;g.fillStyle='rgba(13,43,72,.82)';g.beginPath();g.moveTo(...top[3]);g.lineTo(...top[2]);g.lineTo(...cc);g.lineTo(...d);g.closePath();g.fill();
      g.strokeStyle='rgba(97,206,234,.28)';g.stroke();g.fillStyle=opacity(topColor,.39+energy*.22);
      g.beginPath();g.moveTo(...top[0]);g.lineTo(...top[1]);g.lineTo(...top[2]);g.lineTo(...top[3]);g.closePath();g.fill();g.strokeStyle=opacity(topColor,.53);g.stroke();
      // Lighted floors represent symbol families, never arbitrary line counts.
      for(let j=0;j<Math.min(12,floors);j++){
        const level=(j+1)/(Math.min(12,floors)+1),y0=d[1]-(d[1]-top[3][1])*level;
        g.strokeStyle=opacity(topColor,.17+.23*Math.sin(j+t*.9)**2);g.beginPath();
        g.moveTo(d[0]+3,y0);g.lineTo(cc[0]-3,cc[1]-(cc[1]-top[2][1])*level);g.stroke();
      }
      g.strokeStyle=opacity(topColor,.17);g.beginPath();g.moveTo(...top[3]);g.lineTo(...d);g.stroke();
    }
    // Dependency routes provide a separate network from the structural buildings.
    g.save();g.lineWidth=1;
    for(const edge of edges.filter(e=>e.kind==='depends')){
      const a=positions.get(edge.a),b=positions.get(edge.b);if(!a||!b)continue;
      g.strokeStyle='rgba(227,172,255,.35)';g.beginPath();g.moveTo(...a);
      g.quadraticCurveTo((a[0]+b[0])/2,(a[1]+b[1])/2-35,...b);g.stroke();
    }g.restore();
    g.restore();
  }
  function drawNebula(t,dt){
    const w=scaledW,h=scaledH,size=Math.min(w,h),strength=frame?.controls?.energy||0;
    g.save();g.globalCompositeOperation='lighter';
    const centerX=w*.50,centerY=h*.51;
    const core=g.createRadialGradient(centerX,centerY,0,centerX,centerY,size*.47);
    core.addColorStop(0,'rgba(145,95,222,.23)');core.addColorStop(.34,'rgba(66,71,163,.1)');core.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=core;g.fillRect(0,0,w,h);
    const nodes=[...graph.values()];let i=0;
    for(const n of nodes){
      const id=hash(n.id),radius=Math.sqrt((i+2)/(nodes.length+3))*(.39+(rand(id)-.5)*.19),arm=i%3,
        angle=i*2.39996+t*(.04+(arm*.01))+arm*2.09;
      const x=centerX+Math.cos(angle)*radius*size*(1+.03*Math.sin(t*.6+id)),
        y=centerY+Math.sin(angle)*radius*size*.64;
      n.x+=(x/w-n.x)*Math.min(1,dt*1.15);n.y+=(y/h-n.y)*Math.min(1,dt*1.15);
      const color=n.type==='module'?'#b3eeff':typeColor[n.type]||'#c8a2ff';
      const rad=(n.type==='module'?4:1.8)*clamp(n.weight||1,.6,3)*(.87+.13*Math.sin(t*1.3+i));
      const halo=g.createRadialGradient(n.x*w,n.y*h,0,n.x*w,n.y*h,rad*6);
      halo.addColorStop(0,opacity(color,.68));halo.addColorStop(.27,opacity(color,.20+strength*.12));halo.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=halo;g.beginPath();g.arc(n.x*w,n.y*h,rad*6,0,Math.PI*2);g.fill();
      i++;
    }
    // Existing dependence/containment edges become slow, glimmering ribbons.
    g.lineWidth=.85;
    for(const edge of edges.slice(0,550)){
      const a=graph.get(edge.a),b=graph.get(edge.b);if(!a||!b)continue;
      const x1=a.x*w,y1=a.y*h,x2=b.x*w,y2=b.y*h,offset=Math.sin(t*.6+hash(edge.a)%11)*size*.026;
      g.strokeStyle=edge.kind==='depends'?'rgba(244,160,255,.19)':'rgba(127,160,255,.11)';
      g.beginPath();g.moveTo(x1,y1);g.quadraticCurveTo((x1+x2)/2+offset,(y1+y2)/2-offset,x2,y2);g.stroke();
    }
    g.restore();
  }
  function drawPulses(dt){
    const w=scaledW,h=scaledH,scale=Math.min(w,h);
    for(let i=pulses.length-1;i>=0;i--){
      const p=pulses[i];p.age+=dt;
      const life=1.7;if(p.age>life){pulses.splice(i,1);continue;}
      const r=(p.age*p.speed)*scale,alpha=(1-p.age/life)*.65;
      g.strokeStyle=opacity(p.color,alpha);g.lineWidth=1.5-p.age*.55;
      g.beginPath();g.arc(p.x*w,p.y*h,r,0,Math.PI*2);g.stroke();
    }
    for(let i=sparks.length-1;i>=0;i--){
      const p=sparks[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.life<=0){sparks.splice(i,1);continue;}
      g.fillStyle=opacity(p.color,p.life*.7);g.beginPath();g.arc(p.x*w,p.y*h,1.4,0,Math.PI*2);g.fill();
    }
  }
  let lastPaint=performance.now();
  function paint(now){
    resize();const dt=Math.min(.07,(now-lastPaint)/1000);lastPaint=now;
    clock+=dt;
    if(scaledW&&scaledH){backdrop(clock);if(selectedWorld==='nexus'){drawCore(clock);drawGraph(clock,dt);}
      else if(selectedWorld==='city')drawCity(clock,dt);else drawNebula(clock,dt);drawPulses(dt);}
    if(mode==='replay'&&playback)tickReplay(now);
    requestAnimationFrame(paint);
  }
  // Music decisions are scheduled by the standalone synthesizer on bar boundaries.
  async function toggleSound(){
    if(soundEnabled){
      if(recorder?.state==='recording')recorder.stop();
      soundEnabled=false;await music.stop();setText('soundBtn','◌ ENABLE SOUND');
      dom.sound.classList.remove('on');dom.sound.setAttribute('aria-pressed','false');return;
    }
    await music.start();soundEnabled=true;music.setProject(selected,model?.performance?.identity);music.setFrame(frame);
    setText('soundBtn','◉ SOUND ON');dom.sound.classList.add('on');dom.sound.setAttribute('aria-pressed','true');
  }
  function storePrefs(){
    try{localStorage.setItem('code-resonance-player-v1',JSON.stringify({world:selectedWorld,...music.options}));}catch{}
  }
  function syncPlayerControls(){
    for(const btn of document.querySelectorAll('[data-world]')){
      const active=btn.dataset.world===selectedWorld;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
    }
    $('musicStyle').value=music.options.style;
    $('volumeSlider').value=String(Math.round(music.options.volume*100));
    $('tempoSlider').value=String(music.options.tempo);
    $('textureSlider').value=String(Math.round(music.options.texture*100));
    setText('volumeReadout',`${Math.round(music.options.volume*100)}%`);
    setText('tempoReadout',`${Math.round(music.options.tempo)} BPM`);
    setText('textureReadout',`${Math.round(music.options.texture*100)}%`);
    setText('styleReadout',music.options.style.toUpperCase());
    setText('stageMode',`${selectedWorld.toUpperCase()} / ${mode==='live'?'GENERATIVE STAGE':'RECORDED PERFORMANCE'}`);
  }
  function setWorld(world){if(!['nexus','city','nebula'].includes(world))return;
    selectedWorld=world;syncPlayerControls();storePrefs();
  }
  async function toggleRecord(){
    if(recorder){if(recorder.state==='recording')recorder.stop();return;}
    if(!window.MediaRecorder||!canvas.captureStream){alert('WebM recording requires a browser with MediaRecorder and canvas.captureStream support.');return;}
    if(!soundEnabled)await toggleSound();
    const preferred=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    const mimeType=preferred.find(t=>MediaRecorder.isTypeSupported(t));
    if(!mimeType){alert('This browser cannot record WebM video.');return;}
    const video=canvas.captureStream(30),audio=music.stream;
    const combined=new MediaStream([...video.getVideoTracks(),...(audio?.getAudioTracks()||[])]);
    recordStreams=[video,combined];recordChunks=[];
    const capture=new MediaRecorder(combined,{mimeType,videoBitsPerSecond:4500000});recorder=capture;
    capture.ondataavailable=e=>{if(e.data?.size)recordChunks.push(e.data);};
    capture.onstop=()=>{
      const blob=new Blob(recordChunks,{type:mimeType});
      if(blob.size>0){const url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download=`code-resonance-${selected.slice(0,10)||'performance'}-${Date.now()}.webm`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
      for(const stream of recordStreams)for(const track of stream.getTracks())track.stop();
      recordStreams=[];recordChunks=[];recorder=null;$('recordBtn').classList.remove('recording');setText('recordBtn','● RECORD');
    };
    capture.onerror=()=>{capture.stop();};capture.start(1000);
    $('recordBtn').classList.add('recording');setText('recordBtn','■ STOP');
  }
  async function loadReplayGraphs(){
    if(!selected)return;
    try{const data=await getJSON(`/api/replay?id=${encodeURIComponent(selected)}`);replayGraphs=data.graphs||[];}catch{replayGraphs=[];}
  }
  function changeMode(value){
    mode=value;playback=false;$('playBtn').textContent='▶';
    $('liveBtn').classList.toggle('selected',value==='live');$('replayBtn').classList.toggle('selected',value==='replay');
    $('liveBtn').setAttribute('aria-pressed',String(value==='live'));$('replayBtn').setAttribute('aria-pressed',String(value==='replay'));
    dom.scrub.disabled=value==='live';$('playBtn').disabled=value==='live'||!model?.timeline.length;
    syncPlayerControls();
    $('liveIndicator').textContent=value==='live'?'LIVE':'REPLAY';
    if(value==='replay'){replayPos=model?.timeline.at(0)?.ts||0;dom.scrub.value='0';frame=model?.frames.at(0)||frame;music.setFrame(frame);
      void loadReplayGraphs().then(()=>frameAt(replayPos));}
    else{frame=model?.frames.at(-1)||frame;music.setFrame(frame);dom.scrub.value='1000';if(model)layoutGraph(model.graph);}
    if(model){setStats(model);renderFeed();}
  }
  function timestampFromScrub(v){if(!model?.timeline.length)return 0;
    const from=model.timeline.at(0).ts,to=model.timeline.at(-1).ts;
    return from+(to-from)*(Number(v)/1000);
  }
  function frameAt(ts){
    if(!model?.frames?.length)return;
    // Derived batches arrive later than raw event clocks. Use the latest available stage frame.
    const picked=[...model.frames].reverse().find(f=>f.createdAt<=ts+12000);
    frame=picked||model.frames[0];music.setFrame(frame);
    if(mode==='replay'&&replayGraphs.length){
      const history=replayGraphs.find(x=>x.id===frame.id)||replayGraphs.filter(x=>x.ts<=ts+12000).at(-1);
      if(history)layoutGraph(history.graph);
    }
  }
  function seek(ts){replayPos=ts;frameAt(ts);if(model){
    const a=model.timeline.at(0)?.ts||0,b=model.timeline.at(-1)?.ts||1;
    dom.scrub.value=String(Math.round(((ts-a)/(b-a||1))*1000));
    renderFeed();setStats(model);
  }}
  function tickReplay(now){
    if(!model?.timeline.length)return;
    const dt=Math.min(300,now-replayClock),speed=Number($('speedSelect').value)||4;
    const previous=replayPos;replayPos+=dt*speed;replayClock=now;
    const max=model.timeline.at(-1).ts;
    for(const c of model.timeline.filter(c=>c.ts>previous&&c.ts<=replayPos).slice(-24))animateCue(c);
    if(replayPos>=max){replayPos=max;playback=false;$('playBtn').textContent='▶';}
    frameAt(replayPos);const min=model.timeline.at(0).ts;
    dom.scrub.value=String(Math.round(((replayPos-min)/(max-min||1))*1000));
    if(Math.floor(now/500)!==Math.floor((now-dt)/500)){renderFeed();setStats(model);}
  }
  dom.project.addEventListener('change',()=>{selected=dom.project.value;lastCue='';firstPoll=true;lastGraphKey='';graph.clear();poll();});
  $('liveBtn').addEventListener('click',()=>changeMode('live'));
  $('replayBtn').addEventListener('click',()=>changeMode('replay'));
  $('playBtn').addEventListener('click',()=>{
    if(mode!=='replay'||!model?.timeline.length)return;
    if(replayPos>=model.timeline.at(-1).ts)seek(model.timeline.at(0).ts);
    playback=!playback;replayClock=performance.now();$('playBtn').textContent=playback?'Ⅱ':'▶';
  });
  dom.scrub.addEventListener('input',()=>{if(mode==='replay'){playback=false;$('playBtn').textContent='▶';seek(timestampFromScrub(dom.scrub.value));}});
  dom.sound.addEventListener('click',()=>toggleSound().catch(e=>{console.error(e);setText('soundBtn','AUDIO ERROR');}));
  for(const btn of document.querySelectorAll('[data-world]'))btn.addEventListener('click',()=>setWorld(btn.dataset.world));
  $('musicStyle').addEventListener('change',()=>{music.setOptions({style:$('musicStyle').value});syncPlayerControls();storePrefs();});
  for(const [id,key,convert] of [['volumeSlider','volume',v=>v/100],['tempoSlider','tempo',v=>v],['textureSlider','texture',v=>v/100]]){
    $(id).addEventListener('input',()=>{music.setOptions({[key]:convert(Number($(id).value))});syncPlayerControls();storePrefs();});
  }
  $('recordBtn').addEventListener('click',()=>toggleRecord().catch(e=>{console.error(e);setText('recordBtn','RECORD ERROR');}));
  $('overlayBtn').addEventListener('click',()=>window.open('/?overlay=1','_blank','noopener'));
  if(new URLSearchParams(location.search).has('overlay'))document.body.classList.add('overlay');
  syncPlayerControls();
  $('exportBtn').addEventListener('click',()=>{if(selected)window.open(`/api/export?id=${encodeURIComponent(selected)}`,'_blank','noopener');});
  getJSON('/health').then(x=>setText('renderDelay',`${Math.round(x.sortIntervalMs/1000)}s SEMANTIC WINDOW`)).catch(()=>{});
  setInterval(poll,3000);poll();requestAnimationFrame(paint);
})();

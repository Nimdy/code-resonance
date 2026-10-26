// World host: runs a family world (Stellar Forge, Fractal Biosphere, Machine Cathedral, or a visual pack's world) for
// the player with the same contract as the Construct (reset / applyDelta / cue / setMood / render / resize / stats),
// plus intents, priming after a seek, recipes, label modes and picking. One host per canvas; switching worlds disposes
// every GPU resource. Visual packs run in this same host inside the isolated pack frame (frame.js): `families` brings a
// pack's world module (World API, see sdk.js), `extension` a shader pack's background, post passes and effects.
import {THREE,BACKGROUND_VS,createPipeline,createCameraRig,createOverlay,clamp,hash,rng} from './core.js';
import {createModel} from './model.js';
import {createDirector} from './director.js';
import {createAgents} from './agents.js';
import {createHistory} from './history.js';
import {composeLabels,labelStrings,LABEL_MODES} from './labels.js';
import {createSdk,validateWorld} from './sdk.js';
const BUILTIN={'stellar-forge':'./stellar.js','fractal-biosphere':'./biosphere.js','machine-cathedral':'./cathedral.js'};
const ONSET=['V','Th','M','L','S','K','R','D','N','C','Z','Er','Al','Or','El','Ar','Ly','Se','Ca','Ta','Va','Io','Hy','Ae'];
const VOWEL=['a','e','i','o','u','ae','ia','eo','y','au'];
const CODA=['l','r','n','s','th','v','d','m','','',''];
const ENDING=['ra','ris','on','el','is','ar','en','or','ia','eth','ion','yn','os','ae','ix','ara','ene','ira'];
// Re-roll anything that could read as a crude or offensive word.
const BLOCK=/anu|nus|ass|cum|tit|fag|nig|sex|pis|poo|shi|fuc|dic|coc|kik|rap|cun|vag|tw|hor|slu|wh|nazi|dam|hel/i;
// A pronounceable name derived from a salted subsystem id: memorable, stable, and it reveals nothing about the code.
export function generatedName(id){
  const r=rng(hash(id)^0x9e3779b9),pick=list=>list[Math.floor(r()*list.length)];
  for(let i=0;i<12;i++){const name=pick(ONSET)+pick(VOWEL)+pick(CODA)+pick(ENDING);if(!BLOCK.test(name))return name;}
  return 'Aurel';
}
// ---- Auto quality ----------------------------------------------------------------------------------------------------
// Live playback in Auto measures the presented frame rate (wall clock) over half-second windows and moves between the
// levels with hysteresis (docs/QUALIFICATION.md, "Auto quality"):
// - down after `downAfter` s of windows under `slow` fps, to the first level whose relative pixel cost (`cost`) is
//   expected to reach `hold` fps (at least one level: MSAA alone rarely rescues a frame at 18 fps); under `verySlow`
//   fps for `jumpAfter` s, at once to the level expected to reach `target` fps;
// - where the browser measures the GPU time of a frame, slow frames lower the level only while the GPU accounts for
//   at least `gpuShare` of the frame time: frames slowed by the processor or by another program are not made faster by
//   fewer pixels (they count towards `degraded` instead when under `unusable` fps);
// - up one level only after `upAfter` s in which the level above is expected to reach `target` fps: from the GPU
//   time when the browser measures it (and frames not slow now), otherwise from the frame rate (at the display's
//   refresh rate, `capped`, no headroom is visible in it) and from what was seen at the levels left for slowness in
//   the last `memory` s — or only the last `recheck` s when the current level runs over `stale`× what that memory
//   predicts for it (the machine was busy then: another program, a build; or the pixel-cost model does not fit this
//   GPU, which only a later attempt can tell);
// - a level that turns slow within `probation` s of stepping up to it was a failed attempt: back one level (to the
//   level that held), and that level waits three times longer before it is tried again (at most `upMax` s); a level
//   held through its probation halves its wait again;
// - frames during `start` s after creation and `settle` s after a change (shader compilation, new render targets)
//   are not measured; a single gap over `pause` s is a pause (hidden tab, stage not shown), not a slow frame;
// - `degraded`: under `unusable` fps for `unusableAfter` s at the lowest level (or at a fixed level chosen by the
//   viewer): no level makes this machine's WebGL usable. It clears after `recoverAfter` s at `slow` fps or better.
// Pure (time passed in, seconds) so the logic is unit-tested (tests/adaptive-quality.test.js).
export const AUTO_QUALITY=Object.freeze({window:.5,slow:24,hold:27,downAfter:2,verySlow:12,jumpAfter:1,target:30,capped:55,upAfter:20,upMax:600,probation:10,
  memory:120,stale:1.2,recheck:20,gpuShare:.5,start:1.5,settle:.75,pause:1,unusable:8,unusableAfter:5,recoverAfter:10,cost:Object.freeze([1.35,1,.5625,.3025])});
export function createQualityGovernor({levels=4,floor=0,level=floor,adaptive=true,config={}}={}){
  const C={...AUTO_QUALITY,...config},top=levels-1,clampLevel=x=>Math.max(0,Math.min(top,Math.round(Number(x)||0)));
  floor=clampLevel(floor);level=adaptive?Math.max(floor,clampLevel(level)):floor;
  let last=null,longGap=false,frames=0,span=0,settle=C.start,slowFor=0,verySlowFor=0,upFor=0,unusableFor=0,recoverFor=0;
  let holds,seen,sinceUp=Infinity,proving=false,fps=null,degraded=false,changes=0;
  const forget=()=>{holds=Array(levels).fill(C.upAfter);seen=Array(levels).fill(null);sinceUp=Infinity;proving=false;};forget();
  const restart=()=>{frames=0;span=0;slowFor=0;verySlowFor=0;upFor=0;unusableFor=0;recoverFor=0;};
  function to(next,reason,now,f){
    const from=level;
    if(next>from){seen[from]={f,at:now};
      if(sinceUp<C.probation){holds[from]=Math.min(C.upMax,holds[from]*3);next=from+1;reason='failed-step-up';}
      sinceUp=Infinity;proving=false;}
    else{sinceUp=0;proving=true;}
    level=next;changes++;restart();settle=C.settle;
    return {from,to:next,reason};
  }
  return {
    get level(){return level;},get fps(){return fps;},get degraded(){return degraded;},get changes(){return changes;},get adaptive(){return adaptive;},
    hold(l){return holds[clampLevel(l)];},
    // The viewer's choice changed: a fixed level (or Auto's floor) and whether to adapt. Everything is measured anew.
    configure({floor:f,adaptive:a}={}){if(f!==null&&f!==undefined&&Number.isFinite(Number(f))){floor=clampLevel(f);level=floor;}if(typeof a==='boolean')adaptive=a;
      last=null;longGap=false;restart();settle=C.settle;degraded=false;fps=null;forget();},
    // One presented frame at `now` (seconds), with the GPU time per frame (ms) when known. Returns {from, to, reason}
    // when the level changes, otherwise null.
    frame(now,gpuMs=null){
      if(last===null){last=now;return null;}
      const dt=now-last;last=now;if(!(dt>0))return null;
      if(dt>C.pause&&!longGap){longGap=true;frames=0;span=0;return null;}
      longGap=dt>C.pause;
      sinceUp+=dt;
      if(settle>0){settle-=dt;return null;}
      frames++;span+=dt;if(span<C.window)return null;
      const f=frames/span,w=span;frames=0;span=0;fps=fps===null?f:fps+(f-fps)*.5;
      const gpu=gpuMs>0,gpuBound=!gpu||gpuMs>=C.gpuShare*1000/f;
      slowFor=f<C.slow&&gpuBound?slowFor+w:0;verySlowFor=f<C.verySlow&&gpuBound?verySlowFor+w:0;
      unusableFor=(!adaptive||level>=top||!gpuBound)&&f<C.unusable?unusableFor+w:0;
      if(unusableFor>=C.unusableAfter)degraded=true;
      recoverFor=degraded&&f>=C.slow?recoverFor+w:0;if(recoverFor>=C.recoverAfter){degraded=false;recoverFor=0;}
      if(!adaptive)return null;
      if(proving&&sinceUp>=C.probation&&f>=C.slow){proving=false;holds[level]=Math.max(C.upAfter,holds[level]/2);}
      const down=goal=>{const budget=C.cost[level]*f/goal;let n=level+1;while(n<top&&C.cost[n]>budget)n++;return n;};
      if(level<top&&verySlowFor>=C.jumpAfter)return to(down(C.target),'very-slow',now,f);
      if(level<top&&slowFor>=C.downAfter)return to(down(C.hold),'slow',now,f);
      if(level<=floor){upFor=0;return null;}
      const above=level-1,up=C.cost[above]/C.cost[level];
      const remembered=()=>seen.every((s,k)=>!s||k>above||s.f*C.cost[k]/C.cost[above]>=C.target||now-s.at>(f>C.stale*s.f*C.cost[k]/C.cost[level]?C.recheck:C.memory));
      const room=gpu?f>=C.slow&&gpuMs*up<=1000/C.target:(f>=C.capped||f/up>=C.target)&&remembered();
      upFor=room?upFor+w:0;
      if(upFor>=holds[above])return to(above,'headroom',now,f);
      return null;
    }
  };
}
// The recipe's rendering technique applied to a world's grade (multipliers; identity when the genome has none).
function withTechnique(g,t){
  if(!t)return g;g={...g};
  for(const [k,d] of [['exposure',1],['bloom',1],['contrast',1],['saturation',1.05],['vignette',.3],['grain',.025]])if(Number.isFinite(t[k]))g[k]=(g[k]??d)*t[k];
  if(Number.isFinite(t.aberration))g.aberration=t.aberration;
  if(Array.isArray(t.tint))g.tint=(g.tint?g.tint.clone():new THREE.Vector3(1,1,1)).multiply(new THREE.Vector3(...t.tint));
  if(Array.isArray(t.lift))g.lift=(g.lift?g.lift.clone():new THREE.Vector3()).add(new THREE.Vector3(...t.lift));
  return g;
}
// Public labels never receive the project folder name: titles come only from the recipe's approved public title.
export async function createWorld(canvas,{overlayCanvas=null,film=false,speed=1,recipe,labels='cinematic',quality=0,adaptive=true,level:startLevel=null,families={},extension=null,assets={}}={}){
  const known=id=>!!(families[id]||BUILTIN[id]);
  if(!recipe||!known(recipe.family))throw new Error('A visual recipe with a known family is required');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:film,powerPreference:'high-performance',alpha:false,stencil:false});
  if(!renderer.capabilities.isWebGL2)throw new Error('WebGL2 is required for the generative worlds');
  renderer.autoClear=false;renderer.setClearColor(0x000000,1);renderer.info.autoReset=false;
  const pipeline=createPipeline(renderer,{samples:4});
  const overlay=createOverlay();
  let speedK=speed,mode=labels,mood={section:'home',energy:0,tempo:92},beatPhase=0,size=[16,9],pixelRatio=1;
  // Live playback adapts when frames are slow: first no MSAA, then 75 %, then 55 % resolution. Films keep the fixed
  // quality they were given (never adaptive). `startLevel`: where Auto starts (the level the previous world in this
  // window settled at), never above the chosen floor.
  const LEVELS=[{samples:4,scale:1},{samples:0,scale:1},{samples:0,scale:.75},{samples:0,scale:.55}];
  const governor=createQualityGovernor({levels:LEVELS.length,floor:Number(quality)||0,level:startLevel??(Number(quality)||0),adaptive:!film&&adaptive});
  let level=governor.level,applied='';
  // A level change resizes the render targets (and switches MSAA) only: no shader is recompiled, and nothing is
  // reallocated when neither the level nor the size changed.
  function applyLevel(){const k=LEVELS[level].scale,key=`${level}|${size[0]}x${size[1]}|${pixelRatio}`;if(key===applied)return;applied=key;
    pipeline.setSamples(LEVELS[level].samples);renderer.setPixelRatio(pixelRatio*k);renderer.setSize(size[0],size[1],false);pipeline.setSize(Math.round(size[0]*pixelRatio*k),Math.round(size[1]*pixelRatio*k));}
  function adapt(){if(film)return;const change=governor.frame(performance.now()/1000,gpuMs);if(change){level=governor.level;applyLevel();}}
  const camera=new THREE.PerspectiveCamera(36,16/9,.1,4000);
  const rig=createCameraRig(camera);
  const model=createModel({speed});
  let world=null,scene=null,current=null,snapCamera=true,startedAt=null,pinnedStart=null,info=null,selected=null,ext=null;
  // After a reset, prime or new epoch the world still holds the frame before it: the first intent brings it up to date at
  // the intent's time, so an effect is placed as it is in continuous play (a seek then an event before the next frame).
  let stale=true;
  // The director and agent presences fold the recorded intents; the history keeps that fold exact for any length of
  // project with bounded memory (checkpoints), and it survives recipe switches (decisions do not depend on the look).
  const director=createDirector({recipe,intensity:recipe.overrides?.intensity??1}),agents=createAgents();
  const history=createHistory({step:i=>{agents.record(i);return director.process(i);},snapshot:()=>({d:director.snapshot(),a:agents.snapshot()}),restore:x=>{director.restore(x.d);agents.restore(x.a);}});
  const timing={update:0,draw:0},calls={scene:0,total:0,triangles:0,points:0},expressed={};
  // GPU time of the whole frame (background, scene, post, bloom, grade) where the driver offers timer queries; results
  // arrive a few frames later and feed a moving average. Null when unsupported (SwiftShader, many drivers).
  const gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),queries=[];let gpuMs=null;
  function gpuPoll(){while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift(),ns=gl.getQueryParameter(q,gl.QUERY_RESULT);gl.deleteQuery(q);
    if(!gl.getParameter(timer.GPU_DISJOINT_EXT)){const ms=ns/1e6;gpuMs=gpuMs===null?ms:gpuMs+(ms-gpuMs)*.1;}}}
  const contextFor=next=>({THREE,renderer,scene,camera,model,recipe:next,get director(){return director;},get agents(){return agents;},pipeline,film,
    speed:()=>speedK,name:id=>next.aliases?.[id]||generatedName(id)});
  // A shader pack's slots: shared uniforms (time, beat, energy, palette, camera) plus the pack's own values.
  function extensionFor(next,ctx){
    if(!extension)return null;
    const pal=Object.entries(next.genome.palette||{}).filter(([,v])=>typeof v==='string'&&v.startsWith('#'));
    const uniforms=()=>({uTime:{value:0},uBeat:{value:0},uBar:{value:0},uEnergy:{value:0},uActivity:{value:0},uRes:{value:new THREE.Vector2(1,1)},
      uCam:{value:new THREE.Vector3()},uInv:{value:new THREE.Matrix4()},
      ...Object.fromEntries(pal.map(([k,v])=>[`u${k[0].toUpperCase()}${k.slice(1)}`,{value:new THREE.Color(v)}])),
      ...Object.fromEntries(Object.entries(next.genome.uniforms||{}).map(([k,v])=>[k,{value:v}]))});
    const material=f=>new THREE.ShaderMaterial({uniforms:{...uniforms(),tInput:{value:null}},vertexShader:BACKGROUND_VS,fragmentShader:f,depthTest:false,depthWrite:false});
    const x={background:extension.background?material(extension.background):null,post:(extension.post||[]).map(material),effects:null};
    if(extension.effects?.createEffects)x.effects=extension.effects.createEffects(createSdk(ctx,{assets,quality:()=>level}));
    pipeline.setPost(x.post);return x;
  }
  function disposeExtension(){if(!ext)return;ext.effects?.dispose?.();for(const m of [ext.background,...ext.post].filter(Boolean))m.dispose();pipeline.setPost([]);ext=null;}
  async function load(next){
    const mod=families[next.family]||await import(BUILTIN[next.family]);
    if(world){world.dispose();}
    disposeExtension();
    if(scene)scene.traverse(o=>{o.geometry?.dispose?.();const m=o.material;if(m)(Array.isArray(m)?m:[m]).forEach(x=>{for(const v of Object.values(x.uniforms||{}))v?.value?.isTexture&&v.value.dispose();x.dispose();});});
    scene=new THREE.Scene();current=next;
    director.setRecipe(next);director.setIntensity(next.overrides?.intensity??1);
    const ctx=contextFor(next);
    if(mod.createFamily)world=mod.createFamily(ctx);
    else{world=mod.createWorld(createSdk(ctx,{assets,quality:()=>level}));const problems=validateWorld(world);if(problems.length)throw new Error(`World API ${problems.join(', ')}`);}
    ext=extensionFor(next,ctx);
    world.rebuild();snapCamera=true;
  }
  await load(recipe);
  // ---- Labels -------------------------------------------------------------------------------------------------
  function labelItems(i){
    return composeLabels({mode,recipe:current,info:i,commands:director.commands,agentName:a=>agents.name(a),world,toScreen:pos=>overlay.project(camera,pos,size[0],size[1]),
      size,speed:speedK,origin:pinnedStart??startedAt,selected});
  }
  let lastLabels=[];
  function drawOverlay(g,w,h){if(!info)return;const items=labelItems(info);lastLabels=items;g.save();overlay.draw(g,w,h,items,w/1920);g.restore();}
  // ---- Frame ----------------------------------------------------------------------------------------------------
  const inverse=new THREE.Matrix4();
  function updateExtension(i){
    inverse.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).invert();const [w,h]=pipeline.size;
    for(const m of [ext.background,...ext.post].filter(Boolean)){const u=m.uniforms;u.uTime.value=i.tview;u.uBeat.value=i.beat;u.uBar.value=i.barPhase;u.uEnergy.value=i.energy;
      u.uActivity.value=i.activity;u.uRes.value.set(w,h);u.uCam.value.copy(camera.position);u.uInv.value.copy(inverse);}
    ext.effects?.update?.(i);
  }
  function frameInfo(t,dt,phase){
    const tsec=(t-model.epoch)/1000;
    return {t,tsec,tview:tsec/speedK,dt,beat:Math.exp(-((phase%1)*16)*.9),barPhase:phase,mood,energy:mood.energy||0,
      activity:director.activityAt(t),phase:director.phaseAt(t),unlocks:director.unlockedAt(t),agents:agents.list(t),overrides:current.overrides||{},quality:level};
  }
  function render(t,dt,{phase=0}={}){
    const began=performance.now();renderer.info.reset();adapt(dt);
    if(startedAt===null)startedAt=t;
    dt=Math.min(.1,Math.max(0,dt));
    info=frameInfo(t,dt,phase);stale=false;
    world.update(info);
    const goal=world.cameraGoal(info);rig.update(dt,goal,{snap:snapCamera,omega:goal.omega||.9});snapCamera=false;
    // updateMs is the CPU time of update and the camera (docs/packs/performance.md); afterCamera's camera-dependent
    // offscreen passes are drawing and count as draw time.
    const drawn=performance.now();
    world.afterCamera?.(info);
    if(ext)updateExtension(info);
    let query=null;if(timer){gpuPoll();if(queries.length<6){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}}
    const backgroundMaterial=ext?.background||(world.background?world.background(info):null);
    const bg=backgroundMaterial?pipeline.renderBackground(backgroundMaterial):null;
    // Light shafts point at a light the world draws in its own sky: a pack that replaces the sky has none to point at.
    let grade=world.grade?.(info)||{};if(ext?.background&&grade.rays?.length)grade={...grade,rays:[]};
    pipeline.render(()=>{if(bg)pipeline.drawBackdrop(bg);const before=renderer.info.render.calls;renderer.render(scene,camera);
      calls.scene=renderer.info.render.calls-before;calls.triangles=renderer.info.render.triangles;calls.points=renderer.info.render.points;},{time:info.tview,...withTechnique(grade,current.genome.technique)});
    calls.total=renderer.info.render.calls;
    if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(query);}
    if(overlayCanvas){const g=overlayCanvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);lastLabels=labelItems(info);overlay.draw(g,overlayCanvas.width,overlayCanvas.height,lastLabels,overlayCanvas.width/1920);}
    timing.update+=(drawn-began-timing.update)*.1;timing.draw+=(performance.now()-drawn-timing.draw)*.1;
  }
  return {
    get world(){return world;},get recipe(){return current;},
    reset(graph,t){model.reset(graph,t);world.rebuild();snapCamera=true;stale=true;},
    applyDelta(delta,start,end){model.applyDelta(delta,start,end);world.onDelta?.(delta,start,end);},
    cue(c,t){model.cue(c,t);world.onCue?.(c,t);},
    // A recorded intent at its time: folded (exactly, also when it arrives late) and expressed if the world has an effect.
    intent(i,t){if(stale&&Number.isFinite(t)){info=frameInfo(t,0,info?.barPhase||0);world.update(info);stale=false;}const r=history.add(i);if(r.cmd?.effect){expressed[r.cmd.effect]=(expressed[r.cmd.effect]||0)+1;world.effect(r.cmd,info);ext?.effects?.effect?.(r.cmd,info);}},
    // After a seek: intents before t set the director (cooldowns, unlocks) and agent lifecycles, without effects.
    // Intents at or after the seek point are forgotten, so the schedule delivers them again as fresh events.
    prime(entries,t){
      const list=[];for(const e of entries)(e.intents||[]).forEach((i,k)=>{if(i.ord===undefined&&Number.isInteger(e.seq))i.ord=e.seq*65536+k;if(i.ts<t)list.push(i);});
      history.prime(t,list);
      // After a seek: no transient effect from another moment survives; lasting transformations are rebuilt from history.
      world.onPrime?.(t,(t-model.epoch)/1000);ext?.effects?.onPrime?.(t);stale=true;},
    setMood(m){if(m.section)mood.section=m.section;if(Number.isFinite(m.energy))mood.energy=m.energy;if(m.tempo){mood.tempo=m.tempo;model.setTempo(m.tempo);}},
    setSpeed(k){if(k>0){speedK=k;model.setSpeed(k);}},
    setEpoch(t){if(Number.isFinite(t))pinnedStart=t;const before=model.epoch;model.setEpoch(t);if(model.epoch!==before){world.rebuild();snapCamera=true;stale=true;}},
    async setRecipe(next){if(!next||!known(next.family))return;if(next.family===current.family&&next.variant===current.variant&&JSON.stringify(next.genome)===JSON.stringify(current.genome)){current=next;director.setIntensity(next.overrides?.intensity??1);return;}await load(next);},
    setLabels(m){if(LABEL_MODES.includes(m))mode=m;},
    // The viewer's quality choice: a fixed level (0 full … 3 lowest), and whether live playback may lower it further.
    setQuality(q,adapt){governor.configure({floor:q!==null&&q!==undefined&&Number.isFinite(Number(q))?Number(q):undefined,adaptive:typeof adapt==='boolean'?!film&&adapt:undefined});level=governor.level;applyLevel();},
    // Auto's state for the player: the level, the measured frame rate, and whether no level makes WebGL usable here.
    performance(){return {level,fps:governor.fps===null?null:+governor.fps.toFixed(1),degraded:governor.degraded,changes:governor.changes,adaptive:governor.adaptive};},
    pick(x,y){if(!world.pick)return null;const id=world.pick(x/size[0]*2-1,-(y/size[1])*2+1,camera,info);selected=id;return id?world.inspect?.(id,info):null;},
    render,drawOverlay,
    // Every string currently on screen (qualification: the privacy boundary covers labels too).
    labels(){return labelStrings(lastLabels);},
    resize(w,h,dpr=1){size=[w,h];pixelRatio=dpr;applyLevel();camera.aspect=w/h;camera.updateProjectionMatrix();
      if(overlayCanvas){overlayCanvas.width=Math.round(w*dpr);overlayCanvas.height=Math.round(h*dpr);}},
    stats(){const s=world.stats?.()||{};return {family:current.family,variant:current.variant,...s,intents:history.count,history:history.stats(),
      unlocked:info?director.unlockedAt(info.t).filter(u=>u.level>0).length:0,lasting:director.lasting().reduce((n,l)=>n+l.count,0),agentNumbers:info?info.agents.map(a=>a.number):[],agents:info?.agents.length||0,phase:info?.phase,activity:info?+info.activity.toFixed(3):0,
      quality:level,fps:governor.fps===null?null:+governor.fps.toFixed(1),degraded:governor.degraded,qualityChanges:governor.changes,drawCalls:calls.scene,passes:calls.total,triangles:calls.triangles,points:calls.points,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
      programs:renderer.info.programs?.length??null,effects:{...expressed},updateMs:+timing.update.toFixed(2),drawMs:+timing.draw.toFixed(2),gpuMs:gpuMs===null?null:+gpuMs.toFixed(2)};},
    // The context itself is released now (otherwise its GPU memory and buffers wait for the garbage collector).
    dispose(){disposeExtension();for(const q of queries.splice(0))gl.deleteQuery(q);world?.dispose();pipeline.dispose();renderer.dispose();renderer.forceContextLoss?.();}
  };
}

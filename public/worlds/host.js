// World host: runs a family world (one of the six built-in families, or a visual pack's world) for
// the player with the same contract as the Construct (reset / applyDelta / cue / setMood / render / resize / stats),
// plus intents, priming after a seek, recipes, label modes, picking and peeking (what is under a point, for the Control
// Center's hover card: it never selects and never draws). One host per canvas; switching worlds disposes
// every GPU resource. Visual packs run in this same host inside the isolated pack frame (frame.js): `families` brings a
// pack's world module (World API, see sdk.js), `extension` a shader pack's background, post passes and effects.
import {THREE,BACKGROUND_VS,createPipeline,createCameraRig,createOverlay,hash,rng} from './core.js';
import {createModel} from './model.js';
import {createDirector} from './director.js';
import {createAgents} from './agents.js';
import {createHistory} from './history.js';
import {composeLabels,labelStrings,LABEL_MODES,generatedName,isPortrait,safeArea,textScale} from './labels.js';
import {createSdk,validateWorld} from './sdk.js';
import {createLifeTimeline} from './life/timeline.js';
import {createLifeDriver} from './life/driver.js';
import {createMusical} from './musical.js';
import {createQualityGovernor} from './quality.js';
// The six built-in families (engine/recipe.js FAMILIES): the three flagships, and Synaptic Storm, Fractal Continuum and
// Temporal Terrain, previews until generator 5 graduated them.
const BUILTIN={'stellar-forge':'./stellar.js','fractal-biosphere':'./biosphere.js','machine-cathedral':'./cathedral.js','synaptic-storm':'./synaptic.js',
  'fractal-continuum':'./fractal.js','temporal-terrain':'./terrain.js'};
// Artist compositions (layers.js): a recipe's composition draws its layers into the world it runs on. A composition
// whose base is the artist canvas runs on the canvas world (canvas.js) instead of the family's; the canvas is never
// chosen for a project otherwise.
// The generated subsystem names live with the rest of the public text (labels.js); still exported here for its callers.
export {generatedName};
const compositionOf=r=>r?.composition&&typeof r.composition==='object'&&Array.isArray(r.composition.layers)?r.composition:null;
const moduleOf=r=>compositionOf(r)?.base==='canvas'?'./canvas.js':BUILTIN[r?.family];
// ---- Finishes ------------------------------------------------------------------------------------------------------
// Lens and colour profiles over each world's own grade (`technique.finish`; docs/packs/catalogue.md). A finish scales
// the world's light, then the composite's finishing terms (core.js, FINISH) master it: AgX highlights, an optical fringe
// (`optical`: a share of the image height in the corners; `technique.aberration` scales it, 0 turns it off), the same
// lens on the bloom (`fringe`), warm halation hugging the highlights, split toning drawn from the palette (cool depth
// in the shadows, warmth in the light) and, for Dreamlike, a mist of the wide glow. Classic (or none) is the grade as
// it always was: the classic composite, untouched.
export const FINISHES=Object.freeze({
  // Crisp: restrained bloom that starts higher, almost no fringe, a light vignette, very little grain.
  clean:Object.freeze({grade:Object.freeze({bloom:.68,threshold:1.2,contrast:1.07,saturation:.97,vignette:.6,grain:.25,streak:.4}),optical:.0006,fringe:0,halation:0,split:.15,mist:0}),
  // The default for new identities: subtle optical fringe, attractive warm halation, balanced separation, gentle vignette.
  cinematic:Object.freeze({grade:Object.freeze({bloom:.95,contrast:1.08,saturation:1.04,vignette:.95,grain:.8}),optical:.003,fringe:2.5,halation:.62,split:.6,mist:0}),
  // Luminous and atmospheric, never blurry: the bloom starts lower and spreads as mist, stronger halation and fringe.
  dreamlike:Object.freeze({grade:Object.freeze({bloom:1.38,threshold:.8,exposure:1.05,contrast:.93,saturation:1.12,vignette:1.1,grain:.5,streak:1.3}),optical:.0056,fringe:4,halation:1.05,split:1.1,mist:.7})});
const GRADE_DEFAULTS={exposure:1,bloom:1,threshold:.7,contrast:1,saturation:1.05,vignette:.3,grain:.025,streak:0};
// The finish's colours from the identity's palette: a hue offset (no luminance) toward its depth colour for the shadows
// and toward its highlight for the light, each blended with a classic film direction (teal, amber) so a grey palette
// still separates; halation is film's red-orange warmed toward the highlight; the mist takes a little of it too.
const TONES=new Map();
function tonesOf(palette){
  const key=`${palette?.deep}|${palette?.highlight}`;if(TONES.has(key))return TONES.get(key);
  const rgb=hex=>{try{return typeof hex==='string'&&/^#[0-9a-f]{6}$/i.test(hex)?new THREE.Color(hex):null;}catch{return null;}};
  const hue=(c,base,size)=>{const v=new THREE.Vector3(...base),y=x=>x.x*.2126+x.y*.7152+x.z*.0722;
    if(c){const p=new THREE.Vector3(c.r,c.g,c.b),n=p.clone().subScalar(y(p));if(n.length()>.02)v.multiplyScalar(.55).addScaledVector(n.normalize(),.45);}
    return v.subScalar(y(v)).setLength(size);};
  const deep=rgb(palette?.deep),high=rgb(palette?.highlight),lit=high?new THREE.Vector3(high.r,high.g,high.b).divideScalar(Math.max(1e-3,high.r,high.g,high.b)):new THREE.Vector3(1,.85,.7);
  const out={shadow:hue(deep,[-.8,.18,.58],.045),high:hue(high,[.58,-.09,-.8],.03),halation:new THREE.Vector3(1,.38,.15).lerp(lit,.25),mist:new THREE.Vector3(1,1,1).lerp(lit,.25)};
  if(TONES.size>32)TONES.clear();TONES.set(key,out);return out;
}
// The recipe's rendering technique applied to a world's grade: a finish, then the creator's multipliers (identity when
// the genome has none; without a finish, or with Classic, exactly the grade it always was).
export function withTechnique(g,t,palette=null){
  if(!t)return g;g={...g};
  const f=typeof t.finish==='string'&&Object.hasOwn(FINISHES,t.finish)?FINISHES[t.finish]:null;
  if(f){for(const [k,m] of Object.entries(f.grade))g[k]=(g[k]??GRADE_DEFAULTS[k])*m;
    // The world's own fringe (Stellar Forge asks for less) sets the lens's strength until the creator sets one.
    const tones=tonesOf(palette),k=(Number.isFinite(t.aberration)?t.aberration:g.aberration??.004)/.004;
    Object.assign(g,{finish:true,tonemap:'agx',optical:f.optical*k,fringe:f.fringe,halation:f.halation,halationTint:tones.halation,split:f.split,splitShadow:tones.shadow,splitHigh:tones.high,mist:f.mist,mistTint:tones.mist});}
  for(const [k,d] of [['exposure',1],['bloom',1],['contrast',1],['saturation',1.05],['vignette',.3],['grain',.025]])if(Number.isFinite(t[k]))g[k]=(g[k]??d)*t[k];
  if(Number.isFinite(t.aberration))g.aberration=t.aberration;
  if(Array.isArray(t.tint))g.tint=(g.tint?g.tint.clone():new THREE.Vector3(1,1,1)).multiply(new THREE.Vector3(...t.tint));
  if(Array.isArray(t.lift))g.lift=(g.lift?g.lift.clone():new THREE.Vector3()).add(new THREE.Vector3(...t.lift));
  return g;
}
// ---- Hover facts: what the player knows about a picked structure at a frame, from the model and the presences (counts,
// states, the newest test verdict and edit, catalog names and activity categories: never a path or a name from the code).
// For the Control Center's hover card, which adds them to the world's own words (inspect).
export function hoverFacts({model,agents,agentColor=null},id,i){
  const m=model.modules.get(id),d=m?null:model.districts.get(id)||model.districts.get(String(id).slice(String(id).indexOf(':')+1));
  if(!m&&!d)return {};
  const members=m?[m]:d.members.map(x=>model.modules.get(x)).filter(x=>x&&model.alive(x,i.t)&&(x.removed===null||x.removed>i.t));
  const ids=new Set(members.map(x=>x.id)),states={};let check=null,edit=null;
  for(const x of members){const st=model.stateAt(x,i.t);states[st]=(states[st]||0)+1;
    for(let k=x.states.length-1;k>=0;k--){const e=x.states[k];if(e.at>i.t||(e.state!=='validated'&&e.state!=='stressed'))continue;if(!check||e.at>check.at)check={state:e.state,at:e.at};break;}
    for(const [by,at] of [['agent',x.lastAgent],['person',x.lastHuman]])if(Number.isFinite(at)&&at<=i.t&&(!edit||at>edit.at))edit={by,at};}
  // Agents at work here now, or that used a tool here in the last ten minutes (an edit's tool lasts a moment).
  const here=[];for(const a of i.agents){if(here.length>=3)break;const now=a.display==='tool'&&ids.has(a.fileId);let last=null;
    if(!now)for(const e of agents.trail(a.id,i.t,600000))if(e.state==='tool'&&e.fileId&&ids.has(e.fileId)&&(!last||e.ts>last.ts))last=e;
    if(now||last)here.push({name:agents.name(a),label:now?a.label:last.activity||'using a tool',color:agentColor?.(a)||null,working:now,ago:now?null:i.t-last.ts});}
  return {kind:m?'module':'subsystem',modules:m?null:members.length,symbols:m?model.symbolsAt(m,i.t):null,states,agents:here,
    check:check&&{state:check.state,ago:i.t-check.at},edit:edit&&{by:edit.by,ago:i.t-edit.at}};
}
// Public labels never receive the project folder name: titles come only from the recipe's approved public title.
// A portrait frame (a vertical clip) for a world that does not frame portraits itself (framesPortrait): its field of view
// is kept across the frame's short side, the width, so what the world framed for the height of a landscape frame fills
// the width, with sky and ground above and below it. 36° is the camera's own field of view (a goal without one keeps it).
export function portraitGoal(goal,aspect){
  if(!(aspect>0&&aspect<1))return goal;
  const fov=Number.isFinite(goal.fov)&&goal.fov>0?goal.fov:36,wide=2*Math.atan(Math.tan(fov*Math.PI/360)/aspect)*180/Math.PI;
  return {...goal,fov:Math.min(100,wide)};
}
export async function createWorld(canvas,{overlayCanvas=null,film=false,speed=1,recipe,labels='cinematic',quality=0,adaptive=true,level:startLevel=null,families={},extension=null,assets={}}={}){
  const known=id=>!!(families[id]||BUILTIN[id]);
  if(!recipe||!known(recipe.family))throw new Error('A visual recipe with a known family is required');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:film,powerPreference:'high-performance',alpha:false,stencil:false});
  if(!renderer.capabilities.isWebGL2)throw new Error('WebGL2 is required for the generative worlds');
  renderer.autoClear=false;renderer.setClearColor(0x000000,1);renderer.info.autoReset=false;
  const pipeline=createPipeline(renderer,{samples:4});
  const overlay=createOverlay();
  let speedK=speed,mode=labels,mood={section:'home',energy:0,tempo:92},size=[16,9],pixelRatio=1;
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
  function adapt(){if(film)return;const change=governor.frame(performance.now()/1000,gpuMs,timing.update+timing.draw);if(change){level=governor.level;applyLevel();}}
  const camera=new THREE.PerspectiveCamera(36,16/9,.1,4000);
  const rig=createCameraRig(camera);
  const model=createModel({speed});
  let world=null,scene=null,current=null,snapCamera=true,startedAt=null,pinnedStart=null,titleFrom=null,info=null,selected=null,ext=null;
  // A replay's recorded windows from the last prime: a built-in world that draws the whole history (onHistory, Temporal
  // Terrain) rebuilds it from them, also when it loads into a replay already under way. Packs never get them.
  let recorded=null;
  const history_=(w,t)=>{if(recorded&&w?.onHistory&&BUILTIN[current?.family]&&!families[current?.family]&&Number.isFinite(t))w.onHistory(recorded,t);};
  // After a reset, prime or new epoch the world still holds the frame before it: the first intent brings it up to date at
  // the intent's time, so an effect is placed as it is in continuous play (a seek then an event before the next frame).
  let stale=true;
  // The director and agent presences fold the recorded intents; the history keeps that fold exact for any length of
  // project with bounded memory (checkpoints), and it survives recipe switches (decisions do not depend on the look).
  const director=createDirector({recipe,intensity:recipe.overrides?.intensity??1}),agents=createAgents();
  const history=createHistory({step:i=>{agents.record(i);return director.process(i);},snapshot:()=>({d:director.snapshot(),a:agents.snapshot()}),restore:x=>{director.restore(x.d);agents.restore(x.a);}});
  const timing={update:0,draw:0},calls={scene:0,total:0,triangles:0,points:0},expressed={};
  // Digital life (life/driver.js): the canonical timeline outlives world switches; a built-in world whose recipe has
  // life on asks for a driver (ctx.life.create) with its own grammar. A replay feeds the timeline its recorded windows
  // (prime); a live session the structure it joined with (reset) and what arrives. Packs never get one.
  const lifeTimeline=createLifeTimeline();let lifeDriver=null,lifeReplay=false,lifeBase=null;
  // What the music is doing at each moment (musical.js), from the same canonical frames: info.music for worlds and layers.
  const musical=createMusical({timeline:lifeTimeline});
  const lifeOn=r=>r?.familyKind!=='pack'&&!families[r?.family]&&r?.genome?.life?.enabled===true;
  // (music: the musical clock's configuration, the score the player plays: ecology 2 reads its climate from it)
  const lifeConfig=()=>({speed:speedK,tempo:mood.tempo,epoch:model.epoch,params:current?.genome?.life||{},film,live:!lifeReplay&&!film,music:musical.config});
  const lifeFor=next=>lifeOn(next)?{params:next.genome.life,create(grammar){
    lifeDriver=createLifeDriver({grammar,timeline:lifeTimeline,seed:hash(`${next.projectSeed}/${next.variant||0}/life`),config:lifeConfig,onRebase:b=>{lifeBase=b;}});
    if(lifeBase&&!lifeReplay)lifeDriver.setBase(lifeBase.graph,lifeBase.t,lifeBase.from);return lifeDriver;}}:null;
  // GPU time of the whole frame (background, scene, post, bloom, grade) where the driver offers timer queries; results
  // arrive a few frames later and feed a moving average. Null when unsupported (SwiftShader, many drivers).
  const gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),queries=[];let gpuMs=null;
  function gpuPoll(){while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift(),ns=gl.getQueryParameter(q,gl.QUERY_RESULT);gl.deleteQuery(q);
    if(!gl.getParameter(timer.GPU_DISJOINT_EXT)){const ms=ns/1e6;gpuMs=gpuMs===null?ms:gpuMs+(ms-gpuMs)*.1;}}}
  const contextFor=next=>({THREE,renderer,scene,camera,model,recipe:next,get director(){return director;},get agents(){return agents;},pipeline,film,
    speed:()=>speedK,name:id=>next.aliases?.[id]||generatedName(id),life:lifeFor(next)});
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
  // ---- Artist layers: created on first use (their modules load then), updated in place when only the composition
  // changes (the next frame sees it), released with the world they draw into.
  let layers=null,layersFor=null,layersApi=null;
  const layersModule=async()=>layersApi||(layersApi=await import('./layers.js').then(async m=>({create:m.createLayers,C:await m.loadComposition()})));
  let layersBroken=null;
  async function syncLayers(){
    layersFor=current?.composition??null;if(!compositionOf(current)){if(layers){layers.dispose();layers=null;}return;}
    const api=await layersModule(),c=compositionOf(current);if(!c)return;
    if(!layers)layers=api.create({THREE,scene,camera,quality:()=>level,seed:current.projectSeed>>>0,film,composition:api.C,director:()=>director,speed:()=>speedK,musicAt:T=>musical.at(T),size:()=>pipeline.size});
    layers.set(c,{anchors:world?.compose?.anchors||null});world?.onComposition?.(c);
  }
  async function load(next){
    const mod=families[next.family]||await import(moduleOf(next));
    if(layers){layers.dispose();layers=null;}
    if(world){world.dispose();}
    // Live: the next world's ecosystem starts from the structure as it is now, not from the session's join.
    if(lifeDriver&&!lifeReplay&&!film)lifeDriver.rebase();
    lifeDriver?.dispose();lifeDriver=null;
    disposeExtension();
    if(scene)scene.traverse(o=>{o.geometry?.dispose?.();const m=o.material;if(m)(Array.isArray(m)?m:[m]).forEach(x=>{for(const v of Object.values(x.uniforms||{}))v?.value?.isTexture&&v.value.dispose();x.dispose();});});
    scene=new THREE.Scene();current=next;
    director.setRecipe(next);director.setIntensity(next.overrides?.intensity??1);
    const ctx=contextFor(next);
    if(mod.createFamily)world=mod.createFamily(ctx);
    else{world=mod.createWorld(createSdk(ctx,{assets,quality:()=>level}));const problems=validateWorld(world);if(problems.length)throw new Error(`World API ${problems.join(', ')}`);}
    ext=extensionFor(next,ctx);
    world.rebuild();snapCamera=true;history_(world,info?.t);
    await syncLayers();
  }
  await load(recipe);
  // ---- Labels -------------------------------------------------------------------------------------------------
  function labelItems(i){
    // On the artist canvas the title card names the canvas, not the family whose identity the recipe keeps.
    return composeLabels({mode,recipe:compositionOf(current)?.base==='canvas'?{...current,familyName:'Artist canvas'}:current,info:i,commands:director.commands,agentName:a=>agents.name(a),world,toScreen:pos=>overlay.project(camera,pos,size[0],size[1]),
      size,speed:speedK,origin:titleFrom??pinnedStart??startedAt,selected});
  }
  let lastLabels=[];
  function drawOverlay(g,w,h){if(!info)return;const items=labelItems(info);lastLabels=items;g.save();overlay.draw(g,w,h,items,w/1920);if(info.life?.restoring)drawRestoring(g,w,h,info.life.progress);g.restore();}
  // While the ecosystem is being rebuilt for a moment far from the last one, the world says so (its inhabitants are
  // hidden meanwhile: never a stale population shown as if it were this moment's).
  function drawRestoring(g,w,h,p){if(isPortrait(w,h))return drawRestoringPortrait(g,w,h,p);const k=w/1920;g.save();g.font=`500 ${Math.round(15*k)}px Inter, "Segoe UI", system-ui, sans-serif`;g.textAlign='right';g.fillStyle='rgba(232,238,248,.78)';
    g.shadowColor='rgba(0,0,0,.8)';g.shadowBlur=8*k;g.fillText(`Restoring the ecosystem for this moment · ${Math.round(p*100)} %`,w-40*k,h-40*k);g.restore();}
  // In a portrait frame: under the top of the safe area, at the portrait size.
  function drawRestoringPortrait(g,w,h,p){const k=textScale(w,h),s=safeArea(w,h);g.save();g.font=`500 ${Math.round(15*k)}px Inter, "Segoe UI", system-ui, sans-serif`;g.textAlign='right';g.textBaseline='middle';g.fillStyle='rgba(232,238,248,.78)';
    g.shadowColor='rgba(0,0,0,.8)';g.shadowBlur=8*k;g.fillText(`Restoring the ecosystem for this moment · ${Math.round(p*100)} %`,s.x1,s.y0+16*k);g.restore();}
  // Explorer: a selected structure draws the view a little toward it (the world's own goal, eased by the same rig).
  const EXPLORE_PULL=.35;
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
      activity:director.activityAt(t),phase:director.phaseAt(t),unlocks:director.unlockedAt(t),agents:agents.list(t),overrides:current.overrides||{},quality:level,music:musical.at(t)};
  }
  function render(t,dt,{phase=0}={}){
    const began=performance.now();renderer.info.reset();adapt(dt);
    if(startedAt===null)startedAt=t;
    dt=Math.min(.1,Math.max(0,dt));
    info=frameInfo(t,dt,phase);stale=false;
    // The ecosystem reaches this frame's view time first (films wait for the exact state; live playback catches up a
    // few milliseconds per frame and reports that it is restoring while far behind).
    if(lifeDriver)info.life=lifeDriver.update(info,{budgetMs:film?Infinity:6});
    world.update(info);
    if((current.composition??null)!==layersFor){layersBroken=null;void syncLayers();}
    let goal=world.cameraGoal(info);
    if(selected&&mode==='explorer'){const s=world.inspect?.(selected,info);if(s?.position&&goal?.target)goal={...goal,target:goal.target.clone().lerp(s.position,EXPLORE_PULL)};}
    // A composition's global mappings bend the world's own camera goal within bounds; its layers follow the camera.
    if(layers)layers.camera(goal,info);
    if(camera.aspect<1&&!world.framesPortrait)goal=portraitGoal(goal,camera.aspect);
    rig.update(dt,goal,{snap:snapCamera,omega:goal.omega||.9});snapCamera=false;
    // The artist's layers never take the world down: should the layer pass itself fail, layers stop until the
    // composition changes (each layer's own failures are isolated inside the runtime).
    if(layers&&!layersBroken)try{layers.update(info);}catch(err){layersBroken=String(err?.message||err).slice(0,160);console.error('artist layers stopped',err);}
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
    if(layers)grade=layers.grade(grade);
    pipeline.render(()=>{if(bg)pipeline.drawBackdrop(bg);const before=renderer.info.render.calls;renderer.render(scene,camera);
      calls.scene=renderer.info.render.calls-before;calls.triangles=renderer.info.render.triangles;calls.points=renderer.info.render.points;},{time:info.tview,...withTechnique(grade,current.genome.technique,current.genome.palette)});
    calls.total=renderer.info.render.calls;
    if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(query);}
    if(overlayCanvas){const g=overlayCanvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);lastLabels=labelItems(info);overlay.draw(g,overlayCanvas.width,overlayCanvas.height,lastLabels,overlayCanvas.width/1920);
      if(info.life?.restoring)drawRestoring(g,overlayCanvas.width,overlayCanvas.height,info.life.progress);}
    timing.update+=(drawn-began-timing.update)*.1;timing.draw+=(performance.now()-drawn-timing.draw)*.1;
  }
  return {
    get world(){return world;},get recipe(){return current;},
    reset(graph,t){model.reset(graph,t);world.rebuild();snapCamera=true;stale=true;
      // Live: the structure as the session was joined (a replay's structure is its recorded windows only).
      if(!lifeReplay&&graph&&Number.isFinite(t)){lifeBase={graph:{nodes:graph.nodes.map(n=>({...n})),edges:graph.edges.map(e=>({...e}))},t};lifeDriver?.setBase(lifeBase.graph,t);}},
    applyDelta(delta,start,end){model.applyDelta(delta,start,end);world.onDelta?.(delta,start,end);lifeTimeline.structure(delta,start,end);},
    // A recorded window's frame (its controls give the ecosystem's musical climate).
    observe(frame,start){lifeTimeline.frame(frame,start);},
    cue(c,t){model.cue(c,t);world.onCue?.(c,t);},
    // A recorded intent at its time: folded (exactly, also when it arrives late) and expressed if the world has an effect.
    intent(i,t){lifeTimeline.intent(i);if(stale&&Number.isFinite(t)){info=frameInfo(t,0,info?.barPhase||0);world.update(info);stale=false;}const r=history.add(i);if(r.cmd?.effect){expressed[r.cmd.effect]=(expressed[r.cmd.effect]||0)+1;world.effect(r.cmd,info);ext?.effects?.effect?.(r.cmd,info);}},
    // After a seek: intents before t set the director (cooldowns, unlocks) and agent lifecycles, without effects.
    // Intents at or after the seek point are forgotten, so the schedule delivers them again as fresh events.
    prime(entries,t){
      const list=[];for(const e of entries)(e.intents||[]).forEach((i,k)=>{if(i.ord===undefined&&Number.isInteger(e.seq))i.ord=e.seq*65536+k;if(i.ts<t)list.push(i);});
      // A replay (its windows carry structure) gives the ecosystem its whole recorded timeline; a live session's history
      // brings intents only (from before the session's origin they set lasting conditions only).
      if(entries.some(e=>e.graph)){if(!lifeReplay){lifeReplay=true;lifeDriver?.clearBase();}lifeTimeline.prime(entries);recorded=entries;}
      else for(const e of entries)for(const i of e.intents||[])lifeTimeline.intent(i);
      history.prime(t,list);
      // After a seek: no transient effect from another moment survives; lasting transformations are rebuilt from history.
      history_(world,t);world.onPrime?.(t,(t-model.epoch)/1000);ext?.effects?.onPrime?.(t);layers?.onPrime();stale=true;},
    setMood(m){if(m.section)mood.section=m.section;if(Number.isFinite(m.energy))mood.energy=m.energy;if(m.tempo){mood.tempo=m.tempo;model.setTempo(m.tempo);}
      if(m.music)musical.configure({...m.music,tempo:mood.tempo});},
    setSpeed(k){if(k>0){speedK=k;model.setSpeed(k);}},
    // Replay -> live: a new performance (its origin is set by the next reset; the replay's inputs are not its own).
    newPerformance(){pinnedStart=null;model.clearEpoch();lifeTimeline.clear();lifeReplay=false;lifeBase=null;recorded=null;lifeDriver?.clearBase();stale=true;},
    setEpoch(t){if(Number.isFinite(t))pinnedStart=t;const before=model.epoch;model.setEpoch(t);if(model.epoch!==before){world.rebuild();snapCamera=true;stale=true;
      // Another performance: its ecosystem starts from its own inputs only.
      if(lifeTimeline.items.length){lifeTimeline.clear();lifeReplay=false;}}},
    async setRecipe(next){if(!next||!known(next.family))return;
      // Another world module (a composition moving onto or off the artist canvas): a full load. A change to the
      // composition alone keeps the world (the next frame applies it to the layers).
      if(moduleOf(next)!==moduleOf(current))return load(next);
      // The same world with only its technique changed (the finish, the fringe, the grade multipliers: read every frame,
      // so a finish previews at once): the world stays as it is.
      const same=next.family===current.family&&next.variant===current.variant,bare=(r,life)=>{const {technique,...g}=r.genome;if(life)delete g.life;return JSON.stringify(g);};
      if(same&&bare(next)===bare(current)){current=next;director.setIntensity(next.overrides?.intensity??1);return;}
      // Only the life values changed too (life on before and after): the world stays; the ecosystem takes the new values
      // (a live session from now on, a replay rebuilt exactly; life/driver.js).
      if(same&&lifeDriver&&lifeOn(next)&&bare(next,true)===bare(current,true)){current=next;director.setIntensity(next.overrides?.intensity??1);world.onLifeParams?.(next.genome.life);return;}
      await load(next);},
    setLabels(m){if(LABEL_MODES.includes(m))mode=m;},
    // The title card from this performance time instead of the performance's start (a vertical clip opens on it).
    setTitleFrom(t){titleFrom=Number.isFinite(t)?t:null;},
    // The viewer's quality choice: a fixed level (0 full … 3 lowest), and whether live playback may lower it further.
    setQuality(q,adapt){governor.configure({floor:q!==null&&q!==undefined&&Number.isFinite(Number(q))?Number(q):undefined,adaptive:typeof adapt==='boolean'?!film&&adapt:undefined});level=governor.level;applyLevel();},
    // Auto's state for the player: the level, the measured frame rate, and whether no level makes WebGL usable here.
    performance(){return {level,fps:governor.fps===null?null:+governor.fps.toFixed(1),degraded:governor.degraded,changes:governor.changes,adaptive:governor.adaptive};},
    pick(x,y){if(!world.pick)return null;const id=world.pick(x/size[0]*2-1,-(y/size[1])*2+1,camera,info);selected=id;return id?world.inspect?.(id,info):null;},
    // What is under a point (the hover card): the world's words for it and the facts above; it selects nothing.
    peek(x,y){if(!world.pick||!info)return null;const id=world.pick(x/size[0]*2-1,-(y/size[1])*2+1,camera,info),s=id?world.inspect?.(id,info):null;
      return s?{id,text:String(s.text||''),sub:String(s.sub||''),...hoverFacts({model,agents,agentColor:a=>world.agentColor?.(a)},id,info)}:null;},
    render,drawOverlay,
    // Every string currently on screen (qualification: the privacy boundary covers labels too).
    labels(){return labelStrings(lastLabels);},
    resize(w,h,dpr=1){size=[w,h];pixelRatio=dpr;applyLevel();camera.aspect=w/h;camera.updateProjectionMatrix();
      if(overlayCanvas){overlayCanvas.width=Math.round(w*dpr);overlayCanvas.height=Math.round(h*dpr);}},
    stats(){const s=world.stats?.()||{};return {family:current.family,variant:current.variant,...s,intents:history.count,history:history.stats(),
      unlocked:info?director.unlockedAt(info.t).filter(u=>u.level>0).length:0,lasting:director.lasting().reduce((n,l)=>n+l.count,0),agentNumbers:info?info.agents.map(a=>a.number):[],agents:info?.agents.length||0,phase:info?.phase,activity:info?+info.activity.toFixed(3):0,
      quality:level,fps:governor.fps===null?null:+governor.fps.toFixed(1),degraded:governor.degraded,qualityChanges:governor.changes,gpuTimerBlind:governor.gpuTimerBlind,drawCalls:calls.scene,passes:calls.total,triangles:calls.triangles,points:calls.points,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
      programs:renderer.info.programs?.length??null,effects:{...expressed},updateMs:+timing.update.toFixed(2),drawMs:+timing.draw.toFixed(2),gpuMs:gpuMs===null?null:+gpuMs.toFixed(2),
      life:lifeDriver?{...lifeDriver.stats(),digest:lifeDriver.digest(),presented:world.lifeStats?.()||null}:null,layers:layers?{...layers.stats(),broken:layersBroken}:null};},
    // The context itself is released now (otherwise its GPU memory and buffers wait for the garbage collector).
    dispose(){disposeExtension();for(const q of queries.splice(0))gl.deleteQuery(q);layers?.dispose();layers=null;world?.dispose();lifeDriver?.dispose();lifeDriver=null;pipeline.dispose();renderer.dispose();renderer.forceContextLoss?.();}
  };
}

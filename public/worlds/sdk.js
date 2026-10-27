// Visual Pack SDK 1: the World API a pack implements and the object it receives. The three built-in families are
// written against the same interface (they receive the same context), so a pack can do anything they do.
//
// A world pack's entry module exports  createWorld(sdk) -> world  and must not import anything: `sdk` brings THREE,
// the shared GLSL, buffers and helpers. A shader pack's effects module exports  createEffects(sdk) -> {effect(cmd,
// frame)}. The world object:
//   required  rebuild()              structure changed (sdk.model.version); rebuild what you draw from sdk.model
//             update(frame)          every frame, before the camera; frame = {t, tsec, tview, dt, beat, barPhase, mood,
//                                    energy, activity, phase, unlocks, agents, overrides, quality}
//             cameraGoal(frame)      -> {target: Vector3, distance, azimuth, elevation, fov?, omega?}
//             effect(cmd, frame)     a director command: {effect, intent, tier, scale, duration, at, subject, detail}
//             dispose()              release every GPU resource you created
//   optional  afterCamera(frame), background(frame) -> ShaderMaterial (full-screen, half resolution),
//             grade(frame) -> {bloom, threshold, exposure, contrast, saturation, vignette, grain, flash, waves, lift, tint},
//             describe(cmd, frame) -> {text, sub, position, color, banner, bannerSub}, agentPosition(id, frame),
//             agentColor(agent), subsystemLabels(frame), status(frame), pick(x, y, camera, frame), inspect(id, frame),
//             onPrime(t, tsec) (after a seek: clear transients, rebuild lasting state from sdk.director.lasting()),
//             onDelta(delta, start, end), onCue(cue, t), stats()
// Determinism: draw only from sdk.model, sdk.director, sdk.agents, the frame and sdk.random(key); time comes from the
// frame (never Date.now, performance.now or animation-frame timestamps). See docs/packs/determinism.md.
import {THREE,NOISE,ORBIT,BACKGROUND_VS,clamp,lerp,smooth,easeOut,easeInOut,hash,rand,rng,color,orbitPos,pool,instancedBuffers,pointBuffers} from './core.js';
export const SDK_VERSION='1.0.0';
export const WORLD_API=1;
export const REQUIRED=['rebuild','update','cameraGoal','effect','dispose'];
export const OPTIONAL=['afterCamera','background','grade','describe','agentPosition','agentColor','subsystemLabels','status','pick','inspect','onPrime','onDelta','onCue','stats'];
// Problems with a world object returned by createWorld (an empty list means it implements the API).
export function validateWorld(w){
  if(!w||typeof w!=='object')return ['createWorld must return an object'];
  const problems=[];
  for(const k of REQUIRED)if(typeof w[k]!=='function')problems.push(`missing ${k}()`);
  for(const k of OPTIONAL)if(k in w&&typeof w[k]!=='function')problems.push(`${k} must be a function`);
  return problems;
}
// The object a pack receives. `ctx` is the host's family context; `assets` maps pack file paths to their contents.
export function createSdk(ctx,{assets={},quality=()=>0}={}){
  const recipe=ctx.recipe,seed=recipe.projectSeed>>>0;
  const palette=Object.fromEntries(Object.entries(recipe.genome.palette||{}).filter(([,v])=>typeof v==='string'&&v.startsWith('#')).map(([k,v])=>[k,new THREE.Color(v)]));
  return Object.freeze({
    version:SDK_VERSION,api:WORLD_API,THREE,
    scene:ctx.scene,camera:ctx.camera,renderer:ctx.renderer,film:ctx.film,
    recipe,params:recipe.genome.params||{},palette,
    model:ctx.model,get director(){return ctx.director;},get agents(){return ctx.agents;},
    speed:ctx.speed,name:ctx.name,get quality(){return quality();},
    // A seeded generator per key: the same project, variant and key always give the same sequence.
    random:key=>rng(hash(`${seed}/${recipe.variant}/${key}`)),
    assets:Object.freeze({
      text(path){const v=assets[path];if(typeof v!=='string')throw new Error(`No text asset ${path} (declare it in pack.json)`);return v;},
      async image(path){const v=assets[path];if(!(v instanceof Blob))throw new Error(`No image asset ${path} (declare it in pack.json)`);return createImageBitmap(v);}
    }),
    glsl:Object.freeze({NOISE,ORBIT,BACKGROUND_VS}),
    util:Object.freeze({clamp,lerp,smooth,easeOut,easeInOut,hash,rand,rng,color,orbitPos}),
    buffers:Object.freeze({instanced:instancedBuffers,points:pointBuffers,pool})
  });
}

'use strict';
/** Stable public, derived-only contract. Never includes source, prompts, command text or paths. */
const NAMES=['energy','tension','density','growth','complexity','agentActivity'];
function validateFrame(frame){
  if(!frame||frame.schema!=='code-resonance.frame.v1'||typeof frame.id!=='string'||typeof frame.projectId!=='string')throw new Error('Unknown Code Resonance frame');
  if(!frame.controls||typeof frame.controls!=='object')throw new Error('Missing control map');
  for(const name of NAMES){const v=frame.controls[name];if(!Number.isFinite(v)||v<0||v>1)throw new Error(`Out-of-range control: ${name}`);}
  if(!Array.isArray(frame.motif)||frame.motif.length!==4||frame.motif.some(n=>!Number.isInteger(n)||n<0||n>6))throw new Error('Invalid project motif');
  return frame;
}
function toPerformanceIntent(frame){
  validateFrame(frame);
  return Object.freeze({schema:'code-resonance.intent.v1',id:frame.id,projectId:frame.projectId,
    chapter:Math.max(1,Math.floor(frame.chapter||1)),
    parameters:Object.freeze({activity:frame.controls.energy,harmonicTension:frame.controls.tension,
      visualDensity:frame.controls.density,structuralGrowth:frame.controls.growth,
      arrangementDepth:frame.controls.complexity,agentInterplay:frame.controls.agentActivity}),
    motif:frame.motif.slice(),root:frame.scaleRoot,requestedTransition:'next-musical-boundary',authority:'advisory-only'});
}
module.exports={validateFrame,toPerformanceIntent};

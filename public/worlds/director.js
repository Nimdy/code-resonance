// The effect director: canonical intents in, world effects out. The recipe's effect vocabulary names what each intent
// looks like in a family (a solar flare, a fractal bloom, mechanisms locking); the director decides how big it may be.
//
// Proportion rules (the intents already carry tier and magnitude from evidence; see engine/intents.js):
//  - micro (0) and routine (1) effects coalesce per subject, so a burst of edits reads as one gesture;
//  - structural (2) effects have per-subject cooldowns;
//  - milestone (3) effects spend a spectacle token (3 tokens, one regained every 90 s of performance time); without a
//    token they play at structural scale. Rare (4) effects need three tokens and ten minutes since the last one;
//    otherwise they play as milestones. Spectacle is spectacular because it is rare;
//  - the viewer's intensity (0..2) scales every effect; 0 keeps only the lasting transformations.
// Ambient unlocks: each verified milestone permanently enables the next ambient layer of the world (lasting change).
//
// Decisions depend only on the intents, never on the world drawing them: every world (built-in or a visual pack) gets
// the same tiers, tokens, unlocks and attention for the same history, and the vocabulary only names the look. So a
// recipe switch relabels effects without replaying history, and the state is a pure fold over intents in time order:
// replay and films reproduce it exactly, and long histories can be checkpointed (snapshot / restore, see history.js).
// Memory is bounded by time windows, never by history length; lasting transformations are kept per subject.
export const TIERS=['micro','routine','structural','milestone','rare'];
// The intents worlds express as effects (the other canonical intents are texture: worlds may observe them directly).
export const EFFECT_TYPES=['subsystem.created','module.created','structure.created','structure.removed','subsystem.connected','validation.failed',
  'validation.passed','validation.recovered','refactor.validated','milestone.achieved','repository.checkpoint','world.expanded','agent.collision'];
// Lasting transformations: verified structural milestones a world keeps (blooms, crowns, illuminated spires).
export const LASTING_TYPES=['milestone.achieved','refactor.validated'];
const EFFECT=new Set(EFFECT_TYPES),LASTING=new Set(LASTING_TYPES);
const DURATION=[1.4,2.6,5,9,16];
const COALESCE_MS=[2500,2000,0,0,0],COOLDOWN_MS=[0,0,3500,0,0],KEY_MS=4000;
const TOKEN_MS=90000,MAX_TOKENS=3,RARE_GAP_MS=600000;
const ACTIVITY_W=[.12,.35,.7,1,1.2],RECENT_MS=180000;
// Recent commands (labels, phase, attention; high replay speeds look back further) and unlock history.
const KEEP_MS=600000,KEEP_MAX=1000,MAX_UNLOCKS=16;
const subjectKey=i=>i.subject?.fileId||i.subject?.groupId||(i.subject?.fileIds||[]).slice(0,3).join(',')||'world';
const fullSubject=s=>s?.fileId||s?.groupId||(s?.fileIds||[]).join(',')||'world';
export function createDirector({recipe,intensity=1}={}){
  let vocabulary={},unlockNames=[],scale=intensity;
  let s;
  function reset(){s={tokens:MAX_TOKENS,tokenClock:null,lastRare:-Infinity,last:new Map(),recent:[],unlocks:[],commands:[],lasting:new Map(),attention:null};}
  reset();
  const scaled=c=>{c.scale=Math.min(1.6,c.base*scale);return c;};
  // Stored recipes have no agent.collision key; the family's integration look stands in until a pack names one.
  function look(type){return vocabulary[type]||(type==='agent.collision'?vocabulary['subsystem.connected']:null)||null;}
  function regen(ts){if(s.tokenClock===null)s.tokenClock=ts;const gained=Math.floor((ts-s.tokenClock)/TOKEN_MS);if(gained>0){s.tokens=Math.min(MAX_TOKENS,s.tokens+gained);s.tokenClock+=gained*TOKEN_MS;}if(s.tokens>=MAX_TOKENS)s.tokenClock=ts;}
  function trim(ts){
    while(s.recent.length&&s.recent[0].ts<ts-RECENT_MS)s.recent.shift();
    for(const [k,v] of s.last){if(v.ts>=ts-KEY_MS)break;s.last.delete(k);}
    while(s.commands.length&&(s.commands.length>KEEP_MAX||s.commands[0].at<ts-KEEP_MS))s.commands.shift();
  }
  // Returns an effect command, or null when the intent is absorbed (coalesced, cooling down, or not an effect).
  // A command's `effect` is the current vocabulary's name for it (null when this world does not express the intent).
  function process(intent){
    const ts=intent.ts;regen(ts);
    s.recent.push({ts,w:ACTIVITY_W[intent.tier]*(intent.type==='agent.state'?.15:1)*(.3+.7*intent.magnitude)});
    trim(ts);
    if(intent.type==='agent.state'||!EFFECT.has(intent.type))return null;
    if(LASTING.has(intent.type)&&intent.evidence!=='observed'&&s.unlocks.length<MAX_UNLOCKS)s.unlocks.push(ts);
    let tier=intent.tier;
    const key=`${intent.type}|${subjectKey(intent)}`,prev=s.last.get(key);
    if(COALESCE_MS[tier]&&prev&&ts-prev.ts<COALESCE_MS[tier]){prev.cmd.base+=.25*intent.magnitude;scaled(prev.cmd);prev.cmd.count++;return null;}
    if(COOLDOWN_MS[tier]&&prev&&ts-prev.ts<COOLDOWN_MS[tier])return null;
    if(tier===4){if(s.tokens>=3&&ts-s.lastRare>=RARE_GAP_MS){s.tokens-=3;s.lastRare=ts;}else tier=3;}
    if(tier===3){if(s.tokens>=1)s.tokens-=1;else tier=2;}
    const cmd=scaled({effect:look(intent.type),intent:intent.type,id:intent.id,tier,requestedTier:intent.tier,at:ts,magnitude:intent.magnitude,
      base:(.35+.65*intent.magnitude)*(tier>=3?1.15:1),scale:0,duration:DURATION[tier],subject:intent.subject||{},detail:intent.detail||{},evidence:intent.evidence,count:1});
    s.last.delete(key);s.last.set(key,{ts,cmd});
    s.commands.push(cmd);if(tier>=2)s.attention=cmd;
    if(LASTING.has(intent.type)){const k=`${intent.type}|${fullSubject(intent.subject)}`,l=s.lasting.get(k);
      if(l){l.count++;l.at=ts;l.times.push(ts);if(l.times.length>8)l.times.shift();}else s.lasting.set(k,{type:intent.type,effect:cmd.effect,subject:cmd.subject,first:ts,at:ts,count:1,times:[ts]});}
    return scale<=0&&tier<2?null:cmd;
  }
  // How busy the work is right now (0..1), decaying over ~20 s; idle / active / milestone phases with soft edges.
  function activityAt(t){let x=0;for(const r of s.recent)if(r.ts<=t)x+=r.w*Math.exp(-(t-r.ts)/20000);return 1-Math.exp(-x*.9);}
  function phaseAt(t){
    const c=s.commands;
    for(let i=c.length-1;i>=0;i--){const x=c[i];if(x.at>t)continue;if(t-x.at>DURATION[4]*1000)break;if(x.tier>=3&&t-x.at<x.duration*1000)return 'milestone';}
    return activityAt(t)>.08?'active':'idle';
  }
  // Ambient layers unlocked by verified milestones up to t, each fading in over 8 s.
  function unlockedAt(t){return unlockNames.map((name,i)=>{const u=s.unlocks[i];return {name,level:u!==undefined&&u<=t?Math.min(1,(t-u)/8000):0};});}
  function attentionAt(t,minTier=2){const c=s.commands;for(let i=c.length-1;i>=0;i--){const x=c[i];if(x.at<=t&&x.tier>=minTier)return x;}
    const a=s.attention;return a&&a.at<=t&&a.tier>=minTier?a:null;}
  // The vocabulary (and unlock names) of the world now drawing; history keeps its decisions.
  function setRecipe(r){vocabulary=r?.genome?.effects||{};unlockNames=r?.genome?.ambient?.unlocks||[];
    for(const c of s.commands)c.effect=look(c.intent);for(const l of s.lasting.values())l.effect=look(l.type);
    if(s.attention)s.attention.effect=look(s.attention.intent);}
  setRecipe(recipe);
  return {process,activityAt,phaseAt,unlockedAt,attentionAt,setRecipe,reset,
    get commands(){return s.commands;},
    // Lasting transformations up to now: one entry per (type, subject) with how many times it happened, when it first
    // happened and the times of its last eight occurrences.
    lasting(){return [...s.lasting.values()];},
    setIntensity(k){scale=Math.max(0,Math.min(2,Number(k)||0));for(const c of s.commands)scaled(c);},
    get tokens(){return s.tokens;},
    // Exact copies of the fold state (shared references preserved), for checkpoints.
    snapshot(){return structuredClone(s);},
    restore(snap){s=structuredClone(snap);for(const c of s.commands)c.effect=look(c.intent),scaled(c);
      for(const l of s.lasting.values())l.effect=look(l.type);if(s.attention){s.attention.effect=look(s.attention.intent);scaled(s.attention);}},
    stats(){return {commands:s.commands.length,lasting:s.lasting.size,recent:s.recent.length,unlocks:s.unlocks.length,keys:s.last.size};}
  };
}

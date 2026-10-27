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
// Everything is a pure function of the intents in time order, so replay and films reproduce it exactly.
export const TIERS=['micro','routine','structural','milestone','rare'];
const DURATION=[1.4,2.6,5,9,16];
const COALESCE_MS=[2500,2000,0,0,0],COOLDOWN_MS=[0,0,3500,0,0];
const TOKEN_MS=90000,MAX_TOKENS=3,RARE_GAP_MS=600000;
const ACTIVITY_W=[.12,.35,.7,1,1.2];
export function createDirector({recipe,intensity=1}={}){
  const vocabulary=recipe?.genome?.effects||{};
  const unlockNames=recipe?.genome?.ambient?.unlocks||[];
  let tokens=MAX_TOKENS,tokenClock=null,lastRare=-Infinity,scale=intensity;
  const last=new Map(),recent=[],unlocks=[],commands=[];
  function regen(ts){if(tokenClock===null)tokenClock=ts;const gained=Math.floor((ts-tokenClock)/TOKEN_MS);if(gained>0){tokens=Math.min(MAX_TOKENS,tokens+gained);tokenClock+=gained*TOKEN_MS;}if(tokens>=MAX_TOKENS)tokenClock=ts;}
  const subjectKey=i=>i.subject?.fileId||i.subject?.groupId||(i.subject?.fileIds||[]).slice(0,3).join(',')||'world';
  // Returns an effect command, or null when the intent is absorbed (coalesced, cooling down, or agent lifecycle).
  function process(intent){
    const ts=intent.ts;regen(ts);
    recent.push({ts,w:ACTIVITY_W[intent.tier]*(intent.type==='agent.state'?.15:1)*(.3+.7*intent.magnitude)});
    while(recent.length&&recent[0].ts<ts-180000)recent.shift();
    if(intent.type==='agent.state')return null;
    if((intent.type==='milestone.achieved'||intent.type==='refactor.validated')&&intent.evidence!=='observed'&&unlocks.length<unlockNames.length)unlocks.push({ts,name:unlockNames[unlocks.length]});
    const effect=vocabulary[intent.type];if(!effect)return null;
    let tier=intent.tier;
    const key=`${effect}|${subjectKey(intent)}`,prev=last.get(key);
    if(COALESCE_MS[tier]&&prev&&ts-prev.ts<COALESCE_MS[tier]){prev.cmd.scale=Math.min(1.6,prev.cmd.scale+.25*intent.magnitude*scale);prev.cmd.count=(prev.cmd.count||1)+1;return null;}
    if(COOLDOWN_MS[tier]&&prev&&ts-prev.ts<COOLDOWN_MS[tier])return null;
    if(tier===4){if(tokens>=3&&ts-lastRare>=RARE_GAP_MS){tokens-=3;lastRare=ts;}else tier=3;}
    if(tier===3){if(tokens>=1)tokens-=1;else tier=2;}
    const cmd={effect,intent:intent.type,id:intent.id,tier,requestedTier:intent.tier,at:ts,magnitude:intent.magnitude,
      scale:Math.min(1.6,(.35+.65*intent.magnitude)*scale*(tier>=3?1.15:1)),duration:DURATION[tier],subject:intent.subject||{},detail:intent.detail||{},evidence:intent.evidence,count:1};
    last.set(key,{ts,cmd});if(last.size>4000)last.delete(last.keys().next().value);
    commands.push(cmd);if(commands.length>400)commands.shift();
    return scale<=0&&tier<2?null:cmd;
  }
  // How busy the work is right now (0..1), decaying over ~20 s; idle / active / milestone phases with soft edges.
  function activityAt(t){let x=0;for(const r of recent)if(r.ts<=t)x+=r.w*Math.exp(-(t-r.ts)/20000);return 1-Math.exp(-x*.9);}
  function phaseAt(t){
    for(let i=commands.length-1;i>=0;i--){const c=commands[i];if(c.at>t)continue;if(t-c.at>DURATION[4]*1000)break;if(c.tier>=3&&t-c.at<c.duration*1000)return 'milestone';}
    return activityAt(t)>.08?'active':'idle';
  }
  // Ambient layers unlocked by verified milestones up to t, each fading in over 8 s.
  function unlockedAt(t){return unlockNames.map((name,i)=>{const u=unlocks[i];return {name,level:u&&u.ts<=t?Math.min(1,(t-u.ts)/8000):0};});}
  function attentionAt(t,minTier=2){for(let i=commands.length-1;i>=0;i--){const c=commands[i];if(c.at<=t&&c.tier>=minTier)return c;}return null;}
  return {process,activityAt,phaseAt,unlockedAt,attentionAt,commands,setIntensity(k){scale=Math.max(0,Math.min(2,Number(k)||0));},get tokens(){return tokens;}};
}

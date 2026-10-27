// Artist layers' signals: every value a composition can map (public/composition.js SIGNALS), 0..1, from deterministic
// sources only. Pure (no rendering), tested in Node (tests/layers-signals.test.js).
//  music.*  the score's expression at the performance moment (musical.js: the shared clock, never the audio device);
//  eng.*    canonical engineering intents as the director folded them (director.commands: exact after any seek), each
//           kind through an envelope that rises and decays over seconds of view time. Only the matching canonical kind
//           drives a signal: a failure is never a milestone, an unverified event never a verified one, and nothing is
//           ever inferred or invented; `activity` is the director's own activity, `agents` the observed presences;
//  env.*    the ecosystem as shown (the digital life's view), or, without one, the composition's own populations.
// Smoothing is exponential per rendered frame (films render frame by frame, so it is exact for them) and is reset when
// playback seeks. `at(id, T)` is the unsmoothed value at any performance time (the populations' fixed-step clock).
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const num=v=>Number.isFinite(v)?v:0;
export const MUSIC={'music.beat':e=>e.pulse,'music.bar':e=>e.barPulse,'music.phrase':e=>(num(e.barInPhrase)+num(e.phase))/4,'music.section':e=>e.onset,
  'music.transition':e=>e.transition,'music.energy':e=>e.energy,'music.tension':e=>e.tension,'music.melody':e=>e.melody,'music.rhythm':e=>e.rhythm,
  'music.release':e=>e.release,'music.dynamics':e=>e.dynamics,'music.density':e=>e.density};
// Envelopes (seconds of view time): rise, hold at the peak, then decay. `verified`: only intents whose evidence is an
// observed validation result count (engine/intents.js); the reducer records failures, recoveries and milestones so.
export const ENVELOPES=Object.freeze({
  'eng.creation':{types:['module.created','subsystem.created','structure.created'],rise:.3,hold:.5,decay:3.5},
  'eng.removal':{types:['structure.removed','module.removed'],rise:.3,hold:.4,decay:3},
  'eng.failure':{types:['validation.failed'],verified:true,rise:.5,hold:1.5,decay:6},
  'eng.recovery':{types:['validation.recovered'],verified:true,rise:.6,hold:2,decay:7},
  'eng.milestone':{types:['milestone.achieved'],verified:true,rise:.8,hold:3,decay:9}});
const KIND=new Map();for(const [id,e] of Object.entries(ENVELOPES))for(const t of e.types)KIND.set(t,id);
const HORIZON=Math.max(...Object.values(ENVELOPES).map(e=>e.rise+e.hold+e.decay*7));
export function envelope(age,{rise,hold,decay}){return age<0?0:smooth(age/rise)*Math.exp(-Math.max(0,age-rise-hold)/decay);}
// One engineering signal at performance time T (ms) from a list of director commands (or raw intents) in time order.
// speed: the replay speed (envelopes run in view time, as the worlds' own effects do).
export function engineeringAt(id,commands,T,speed=1){
  const E=ENVELOPES[id];if(!E||!commands?.length)return 0;
  const k=1000*(speed>0?speed:1);let x=0;
  for(let i=commands.length-1;i>=0;i--){const c=commands[i],at=c.at??c.ts;if(!(at<=T)){continue;}const age=(T-at)/k;if(age>HORIZON)break;
    if(KIND.get(c.intent??c.type)!==id)continue;if(E.verified&&c.evidence!=='verified')continue;
    const tier=c.requestedTier??c.tier??1,w=(.35+.65*clamp(num(c.magnitude)))*Math.sqrt(Math.max(1,c.count||1))*(tier>=3?1.25:1);
    x+=w*envelope(age,E);}
  return 1-Math.exp(-1.1*x);
}
// Observed AI agents: busy presences count fully, idle ones a little (agents.js: only hook-reported states).
export function agentsOf(list){let x=0;for(const a of list||[])x+=(a.busy?1:.25)*clamp(num(a.alpha));return 1-Math.exp(-.8*x);}
// The ecosystem as shown, from its state arrays (strided samples: bounded cost for any population). The three worlds'
// ecosystems differ by an order of magnitude in their raw field amounts, so the measures are scale-free:
//  density      how gathered: the population's concentration over the density grid (log participation ratio:
//               0 evenly spread, 1 all in one cell);
//  current      how strongly carried: each entity's speed relative to its own species' top speed;
//  coherence    how aligned: per species, |sum of velocities| / sum of speeds;
//  disturbance  the disturbance field (failures and congestion deposit it), saturating;
//  field/trails the energy and trail amounts, raw (createSignals expresses them relative to their own recent level).
export function environmentOf(eco){
  if(!eco||!eco.capacity)return null;
  const cap=eco.capacity,step=Math.max(1,Math.floor(cap/1536)),NS=eco.NS||1,vx=new Float64Array(NS),vy=new Float64Array(NS),vz=new Float64Array(NS),sp=new Float64Array(NS);
  let n=0,rel=0;
  for(let i=0;i<cap;i+=step){if(!eco.alive[i])continue;n++;const s=eco.sp[i]%NS,x=eco.vx[i],y=eco.vy[i],z=eco.vz[i],v=Math.sqrt(x*x+y*y+z*z);
    vx[s]+=x;vy[s]+=y;vz[s]+=z;sp[s]+=v;rel+=v/Math.max(1e-3,eco.species?.[s]?.maxSpeed||1);}
  let coh=0,w=0;for(let s=0;s<NS;s++)if(sp[s]>1e-6){coh+=Math.sqrt(vx[s]*vx[s]+vy[s]*vy[s]+vz[s]*vz[s]);w+=sp[s];}
  const F=eco.field,NC=F?F.nx*F.nz:0,cs=Math.max(1,Math.floor(NC/1024));let tr=0,en=0,di=0,m=0,d1=0,d2=0;
  if(NC)for(let q=0;q<NC;q+=cs){tr+=F.data[q];en+=F.data[NC+q];di+=F.data[2*NC+q];m++;}
  if(F?.density)for(let q=0;q<NC;q++){const d=F.density[q];d1+=d;d2+=d*d;}
  const gather=d1>0&&NC>1?clamp(Math.log(Math.max(1,NC*d2/(d1*d1)))/Math.log(NC)):0;
  return {density:gather,current:n?clamp(rel/n):0,coherence:w?clamp(coh/w):0,disturbance:m?1-Math.exp(-di/m/.08):0,field:m?en/m:0,trails:m?tr/m:0};
}
// Amounts read relative to their own recent level: x / (x + level), so a typical moment of any world sits near .5 and
// a surge rises toward 1. The level follows over REF_TAU seconds (never below a small floor, so noise stays low).
export const RELATIVE=Object.freeze({field:.004,trails:.004}),REF_TAU=30;
export const ENV_IDS=['env.density','env.field','env.current','env.disturbance','env.coherence','env.trails'];
// sources: {music: T => expression (pure), activity: T => 0..1 (pure), commands: () => list, speed: () => k}
export function createSignals(sources={}){
  const speed=()=>{const k=sources.speed?.();return k>0?k:1;};
  let raw=Object.create(null),env=null,dt=0,frame=0,T=0;
  const state=new Map(),level={};
  // This frame's unsmoothed values. info: the host's frame (t, dt, music, activity, agents); environment: the
  // ecosystem's metrics (environmentOf) or the populations' (null: every env.* reads 0).
  function update(info,environment=null){
    frame++;dt=clamp(num(info?.dt),0,.25);T=num(info?.t);env=environment;
    const e=info?.music||null;raw=Object.create(null);
    for(const [id,f] of Object.entries(MUSIC))raw[id]=e?clamp(num(f(e))):0;
    const list=sources.commands?.()||[];for(const id of Object.keys(ENVELOPES))raw[id]=engineeringAt(id,list,T,speed());
    raw['eng.activity']=clamp(num(info?.activity));raw['eng.agents']=agentsOf(info?.agents);
    for(const id of ENV_IDS){const k=id.slice(4),x=env?Math.max(0,num(env[k])):0;
      if(!(k in RELATIVE)){raw[id]=clamp(x);continue;}
      if(!env){delete level[k];raw[id]=0;continue;}
      const f=RELATIVE[k];level[k]=level[k]===undefined?Math.max(x,f):Math.max(f,level[k]+(x-level[k])*(1-Math.exp(-dt/REF_TAU)));
      raw[id]=clamp(x/(x+level[k]));}
  }
  // The value at this frame, smoothed over `smoothing` seconds (0: as it is).
  function get(id,smoothing=0){
    const r=raw[id]??0;if(!(smoothing>0))return r;
    const key=`${id}|${smoothing}`;let s=state.get(key);
    if(!s){s={v:r,frame};state.set(key,s);return r;}
    if(s.frame!==frame){s.v+=(r-s.v)*(1-Math.exp(-dt/smoothing));s.frame=frame;}
    return s.v;
  }
  // The unsmoothed value at performance time T (ms): music and engineering are pure functions of T; the environment
  // is what is shown now.
  let cacheT=NaN,cacheE=null;
  function at(id,t){
    if(id in MUSIC){if(t!==cacheT){cacheT=t;cacheE=sources.music?.(t)||null;}return cacheE?clamp(num(MUSIC[id](cacheE))):0;}
    if(id in ENVELOPES)return engineeringAt(id,sources.commands?.()||[],t,speed());
    if(id==='eng.activity')return sources.activity?clamp(num(sources.activity(t))):raw[id]??0;
    return raw[id]??0;
  }
  return {update,get,at,raw:id=>raw[id]??0,
    // After a seek: no smoothed value carries over from another moment.
    reset(){state.clear();for(const k of Object.keys(level))delete level[k];cacheT=NaN;cacheE=null;},
    get environment(){return env;},snapshot:()=>({...raw})};
}

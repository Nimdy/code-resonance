// The digital-life driver: runs a world's ecosystem (sim.js) on the canonical timeline (timeline.js) at a fixed rate,
// restores it after seeks, and hands the world an interpolated view to draw. Pure (no rendering), tested in Node.
//
// Clock: simulation time is the performance's view time (frame.tview: seconds since the performance's origin at the
// playback speed), stepped at HZ. The state shown at view time v is the state after floor(v * HZ) ticks; presentation
// interpolates from the tick before (never changing the state). However often frames are drawn (15, 30, 60, 120 per
// second), the same view time has had exactly the same ticks with exactly the same inputs.
//
// Inputs, consumed once simulated time reaches them (after tick k, every input at or before the time of tick k):
//  - structure: the world's habitat (sites) from its grammar, evaluated on the shadow model as it was right after
//    each recorded window (never on the world's own model, which after a seek knows only the present);
//  - frames: the musical climate. The score's section rule (ResonanceScore.chooseSection) runs on the bar grid of the
//    performance clock (bar = floor(time / bar length), as the music anchors it), from the recorded frames' energy
//    (smoothed per bar as the music smooths it) and tension, with milestones from the canonical intents. Conditions
//    (current, turbulence, cohesion, activity, attraction, swing) then relax toward the section's targets. Nothing is
//    read from the audio device: silence changes nothing;
//  - intents: bounded influences at the sites they concern (disturbance for a failure, recovery, nourishment, a lasting
//    attractor for a verified milestone, a reorganised current for a validated refactor, a trail along a new
//    connection, a small perturbation for an edit or an agent's tool use). Strength follows the intent's tier,
//    magnitude and evidence; only verified evidence leaves a lasting change. Intents from before the performance's
//    origin (a live session joined late) only set lasting conditions, never transient ones.
//
// Generations (replays and films): the ecosystem shown at view time v is the one of v's generation (GENERATION seconds
// of view time each). Generation 0 starts at the origin. Generation g >= 1 starts WARM seconds before its anchor
// (g x GENERATION) with a fresh population (its own seed) on the structure as it stands then, the lasting history
// before it (verified milestones and refactors) and the climate folded over the 64 bars before it, and from there lives
// on the inputs like any ecosystem. So the state at a view time is a pure function of the inputs since its generation's
// warm start plus the lasting history before it, and a far seek simulates at most one generation and its warm start,
// however long the performance. Near an anchor the next generation is prepared in the background (its own runner); the
// view crossfades over CROSS seconds on either side of the anchor. A live session has a single generation.
//
// Ecology 2 (params.ecology === 2): the climate is read from the music itself. The driver keeps its own musical clock
// (musical.js, configured from config.music: the score version, style, profile and seed the player plays) over the
// same frames, and at every tick turns the expression at that moment (the form's role, energy, harmonic tension,
// dynamics, rhythm, transitions, onsets) into targets for more conditions (climateOf: also gather, explore, persist,
// glow, pulse and a turning attractor), with a perceptual mapping of life.music: 0 is exactly neutral, 1 clearly
// visible, 2 unmistakable but bounded. The beat grid of the performance clock goes with it. Still conditions, never
// choreography: nothing places an entity, every condition relaxes at its own pace, each species feels them its own way.
//
// Restore: checkpoints (a recent ring every 2 s and an even spread over the whole performance) carry the ecosystem,
// the climate, the input position and the generation; each names the fingerprint of the inputs before it and the
// configuration (grammar, simulation version, seed, life parameters, speed, tempo, origin). A checkpoint is used only
// for its own generation and while both still match; otherwise the ecosystem is rebuilt from an earlier one or from its
// generation's start. Catching up is bounded per frame (films excepted: a film frame waits for the exact state); while
// far behind, the view reports `restoring` with its progress and the world hides the population rather than show a
// stale one.
import {createEcosystem,HZ,DT,SIM_VERSION,mix,COND1,COND2} from './sim.js';
import {createShadow,graphOf,KIND} from './timeline.js';
import {createMusical} from '../musical.js';
export {HZ,DT,SIM_VERSION};
const RECENT_EVERY=2*HZ,RECENT_KEEP=6,SPARSE_EVERY=20*HZ,SPARSE_KEEP=24;
const RESTORE_AHEAD=3*HZ;          // further behind than this: the view is "restoring"
const LIVE_REBASE=1200;            // a live session folds its consumed inputs into a new base past this many
// Generations (seconds of view time): their length, the warm start before an anchor, the crossfade on either side.
export const GENERATION=600,WARM=60,CROSS=2;
export const GEN_TICKS=GENERATION*HZ,WARM_TICKS=WARM*HZ;
const PREPARE=WARM_TICKS+30*HZ;    // the next generation is prepared from this far before its anchor,
const BACKGROUND_MS=2;             // about this long per frame (films: no limit)
const TIER_W=[.15,.3,.6,.9,1],EVIDENCE_W={observed:.8,derived:1,inferred:.5,verified:1};
const NEUTRAL={current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0};
// Section -> conditions (relaxed toward; `swing` turns the macro current, read by the grammar's current).
export const SECTION_CLIMATE={
  home:{current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0},
  away:{current:1.25,turb:1.1,cohesion:.9,activity:1.05,attract:.85,swing:1},
  tension:{current:1.1,turb:1.75,cohesion:.6,activity:1.2,attract:.7,swing:.5},
  resolve:{current:.9,turb:.8,cohesion:1.3,activity:.95,attract:1.2,swing:-.4},
  lift:{current:1.2,turb:1,cohesion:1.15,activity:1.25,attract:1.3,swing:.3},
  breath:{current:.75,turb:.6,cohesion:1.25,activity:.75,attract:1,swing:0}};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
// ---- Ecology 2: the climate from the music ------------------------------------------------------------------------
export const NEUTRAL2=Object.freeze({...COND1,...COND2});
// What each role of the score's form asks of the ecology (ratios of the neutral conditions at music influence 1,
// before the music's own measures): development explores, release settles, return regathers, an interlude disperses
// gently, tension unsettles, resolve re-forms the groups; a statement is the ecology's own home. (A v2 score's
// sections arrive as these roles: musical.js.)
export const ROLE_CLIMATE={
  statement:{},
  development:{current:1.3,turb:1.25,cohesion:.85,activity:1.2,attract:.9,swing:.8,gather:.8,explore:1.9,persist:.85},
  interlude:{current:.8,turb:.9,cohesion:.72,activity:.85,attract:.75,swing:-.3,gather:.62,explore:1.3,persist:1.25,glow:.85},
  return:{current:1.08,turb:.9,cohesion:1.35,activity:1.08,attract:1.35,swing:.2,gather:1.45,explore:.75,persist:1.1,glow:1.12},
  release:{current:.72,turb:.65,cohesion:1.12,activity:.72,attract:1.05,gather:.7,explore:.62,persist:1.4,glow:.82},
  tension:{current:1.15,turb:1.85,cohesion:.6,activity:1.28,attract:.7,swing:.5,gather:.55,explore:1.45,persist:.7,glow:.9},
  resolve:{current:.9,turb:.75,cohesion:1.45,activity:.95,attract:1.4,swing:-.4,gather:1.55,explore:.8,persist:1.2,glow:1.18}};
// How far the turning attractor leans in each role (a statement and a return lean toward the music's home direction,
// the others toward a new one each section), and each condition's soft limit (log units for the ratios, units for the
// rest): however expressive the music, a condition saturates there.
const ROLE_SHIFT={statement:.3,development:.55,interlude:.42,return:.22,release:.45,tension:.35,resolve:.28};
const LIMIT={current:.55,turb:.8,cohesion:.6,activity:.42,attract:.6,gather:.7,explore:1,persist:.5,glow:.5,swing:1.2,shift:.85};
const RATIO=['current','turb','cohesion','activity','attract','gather','explore','persist','glow'];
const GOLDEN=2.399963;
// Music influence (life.music, 0..2) -> how much of the music's ask reaches the ecology: none at 0, all of it at 1,
// two and a half times at 2, where the soft limits take over (expressive: unmistakable, never chaotic).
export const influence=m=>m*(.75+.25*m);
// The conditions the music asks for at a moment: ex is the musical expression (musical.js at()), m the influence,
// home the music's own home direction (radians). Ratios are mapped in log space through each condition's soft limit
// (a perceptual mapping: a small ask is felt in proportion, a large one saturates), never by one global factor.
export function climateOf(ex,m,home=0){
  const a=influence(clamp(+m,0,2));if(!(a>0)||!ex)return {...NEUTRAL2};
  const R=ROLE_CLIMATE[ex.role]||{},lg=k=>Math.log(R[k]??1),n=(v,d=0)=>Number.isFinite(+v)?clamp(+v):d;
  const e=n(ex.energy)-.45,d=n(ex.dynamics,.7)-.6,t=n(ex.tension),tr=n(ex.transition),on=n(ex.onset),rh=n(ex.rhythm),lift=ex.lift?1:0;
  // energy and dynamics: currents, activity, exploration and light; harmonic tension: turbulence against cohesion;
  // a section's approach (transition) and arrival (onset): the groups loosen and set out; a sustained passage (little
  // rhythm) keeps the traces longer; a verified milestone's lift: a little more light and gathering, with restraint
  const L={current:lg('current')+.45*e+.25*d,turb:lg('turb')+.5*(t-.3)+.3*on,cohesion:lg('cohesion')-.3*(t-.3)-.35*on,activity:lg('activity')+.5*e+.15*d,
    attract:lg('attract')+.15*lift,gather:lg('gather')+.4*e+.15*lift-.3*tr,explore:lg('explore')+.7*e+.6*tr+.25*on,persist:lg('persist')+.35*(.5-rh),glow:lg('glow')+.45*e+.55*d+.2*lift};
  const out={};for(const k of RATIO){const S=LIMIT[k];out[k]=Math.exp(S*Math.tanh(a*L[k]/S));}
  out.swing=LIMIT.swing*Math.tanh(a*(R.swing??0)/LIMIT.swing);
  // Rhythmic drive (the Cathedral's convoys and pulses): the rhythm the arrangement plays, carried by energy; quiet
  // in a release or an interlude.
  out.pulse=Math.tanh(a*(.3+.7*rh)*(.55+.45*n(ex.energy))*(ex.role==='release'||ex.role==='interlude'?.6:1));
  // The turning attractor: toward the home direction in a statement or a return, toward a new direction each other
  // section (golden-angle steps: never the same region twice in a row), drifting over the section and leaning with
  // the harmony (the chord's degree, by its tension).
  const D=(ROLE_SHIFT[ex.role]??.3)+.25*t,th=(ex.role==='statement'||ex.role==='return'?home:home+GOLDEN*(+ex.section||0))+.9*n(ex.sectionProgress)+.6*t*Math.sin((ex.chord|0)*.8976);
  const mag=LIMIT.shift*Math.tanh(a*D/LIMIT.shift);out.shiftX=mag*Math.cos(th);out.shiftZ=mag*Math.sin(th);
  return out;
}
const fnv=s=>{let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
const samePrint=(p,q)=>!!p&&!!q&&p[0]===q[0]&&p[1]===q[1];
// The crossfade at the anchors of a replay or a film: 1 -> 0 over the CROSS seconds before an anchor, 0 -> 1 over the
// CROSS seconds after it (the outgoing generation fades out, the incoming one in). A pure function of view time:
// presentation only, never the state.
export function crossfade(tview){const a=Math.round(tview/GENERATION)*GENERATION,d=Math.abs(tview-a);return a<=0||d>=CROSS?1:d/CROSS;}
// The influences of one intent: [{kind, site, to?, amount}] (sites are the grammar's site ids).
export function influencesOf(intent,siteOf,{history=false}={}){
  const s=intent.subject||{},d=intent.detail||{},ev=intent.evidence||'observed';
  const a=clamp((.35+.65*(+intent.magnitude||0))*(TIER_W[intent.tier]??.3)*(EVIDENCE_W[ev]??.5));
  const one=id=>id?siteOf(id):null;
  const sites=[...new Set([one(s.groupId),one(s.fileId),...(s.fileIds||[]).slice(0,12).map(one)].filter(Boolean))].slice(0,4);
  const verified=ev==='verified';
  const out=[];const each=(kind,amount)=>{for(const site of sites)out.push({kind,site,amount});};
  if(history){
    // Joined late: only lasting conditions carry over from before the performance's origin.
    if(intent.type==='milestone.achieved'&&verified)each('lasting',a);
    else if(intent.type==='refactor.validated'&&verified)each('lasting',a*.6);
    return out;
  }
  switch(intent.type){
    case 'subsystem.created':each('novelty',a);break;
    case 'module.created':case 'structure.created':each('nourish',a*.6);break;
    case 'structure.modified':case 'module.renamed':each('pulse',a*.6);break;
    case 'structure.removed':case 'module.removed':each('remove',a);break;
    case 'subsystem.connected':case 'structure.linked':{const from=one(s.groupId)||one(s.fileId),to=one(s.targetGroupId)||one(s.targetId);if(from&&to&&from!==to)out.push({kind:'link',site:from,to,amount:a});break;}
    case 'validation.failed':each('disturb',a);break;
    case 'validation.passed':each('nourish',a*.5);break;
    case 'validation.recovered':each('recover',a);break;
    case 'refactor.validated':each('reorganize',a);if(verified)each('lasting',a*.6);break;
    case 'milestone.achieved':if(verified)each('lasting',a);else each('nourish',a);break;
    case 'repository.checkpoint':each('nourish',a*.4);break;
    case 'agent.state':if((d.state==='tool'||d.state==='processing')&&s.fileId)each('pulse',.2);break;
    default:break;
  }
  return out;
}
const MILESTONE=new Set(['milestone.achieved','refactor.validated','validation.recovered']);
// The intents whose conditions last (influencesOf with history): what a live fold keeps and a generation inherits.
const LASTING=x=>x.kind===KIND.intent&&(x.intent.type==='milestone.achieved'||x.intent.type==='refactor.validated')&&x.intent.evidence==='verified';
// Recipe values (catalogue life.*, 0..2 around 1) -> the ecosystem's behaviour scales.
export function lifeScales(p={}){const n=(k,d=1)=>Number.isFinite(+p[k])?+p[k]:d;
  return {density:n('density'),vitality:n('vitality'),collective:n('collective'),environment:n('environment'),trails:n('trails'),music:n('music'),
    attraction:n('attraction'),repulsion:n('repulsion'),separation:n('separation'),alignment:n('alignment'),cohesion:n('cohesion'),current:n('current'),
    persistence:n('persistence'),diffusion:n('diffusion'),radius:n('radius'),ecology:n('ecology')};}
// grammar: {id, version, ecosystem(params, seed) -> spec for createEcosystem (without seed/params),
//           habitat(model, t) -> sites [{id, x, y, z, r, w, kind}], siteOf?(id, model) -> site id,
//           climate?(section, energy, tension) -> condition targets}
// config(): {speed, tempo, epoch (ms), params (the recipe's life values), film, live, music (ecology 2: the musical
//           clock's configuration {version, style, profile, seed}, as the player's)}
// onRebase(base): a live session's new base ({graph, t, from}) after its consumed inputs were folded into it;
// rebaseAfter: how many consumed inputs a live session keeps before it folds them;
// background: prepare the next generation ahead of its anchor (tests turn it off: the states are the same without it).
export function createLifeDriver({grammar,timeline,seed,config,score=globalThis.ResonanceScore,onRebase=null,rebaseAfter=LIVE_REBASE,background=true}){
  seed=seed>>>0;
  let frameKey='',liveKey='',paramKey='',base=null,current=null,shadowCfg={speed:1,tempo:92};
  const habitats=[];   // habitat per structure item (index + 1; 0: base): a pure function of the structure, shared by the runners
  let keptN=0,recent=[],sparse=[],restoring=false,progress=1,shownSince=-1,lastView=null,restoreStart=null;
  const counters={restores:0,resets:0,fromCheckpoint:0,ticks:0,catchUpMs:0,tickMs:0,lastRestoreMs:null,lastRestoreTicks:0,rebases:0,
    handovers:0,backgroundTicks:0,backgroundMs:0,bgTickMs:0,historyMs:null,restored:null};
  const frameKeyOf=(c,tempo=c.tempo)=>fnv(JSON.stringify([grammar.id,grammar.version,SIM_VERSION,seed,c.speed,tempo,c.epoch,base?`${base.t}|${base.graph?.nodes?.length||0}`:'']));
  const liveKeyOf=c=>frameKeyOf(c,null);   // a live session keeps its population through a tempo change
  // Ecology 2: the music the climate is read from (its configuration is part of the parameter key: a checkpoint
  // never crosses a change of score, style, profile or seed; a live session keeps its population through one).
  const music=createMusical({timeline,score}),eco2=c=>+c.params?.ecology===2;
  const paramKeyOf=c=>{if(!eco2(c))return fnv(JSON.stringify(c.params||{}));const m=music.config;return fnv(JSON.stringify([c.params,m.version,m.style,m.profile,m.seed]));};
  const genOf=(k,c)=>c.live?0:Math.floor(k/GEN_TICKS);
  const seedOf=g=>g?mix(seed,g):seed;   // generation 0 keeps the driver's own seed
  const make=(c,g=0)=>{const s=seedOf(g);return createEcosystem({...grammar.ecosystem(c.params||{},s),seed:s,params:lifeScales(c.params)});};
  // ---- Runners -----------------------------------------------------------------------------------------------------
  // A runner: one generation's ecosystem and its own position in the inputs (the consumed cursor and the fingerprint
  // of what it consumed, the climate, the structure position, the habitat it holds) with its own shadow model (the
  // structure as it was where the runner is: forward only, rebuilt when it must go back). R is the shown generation's;
  // N the next generation's, prepared in the background near an anchor (replays and films). A new runner may take over
  // a discarded one's shadow (`from`): the shadow at a position is a pure function of the structure, whoever built it.
  let R=null,N=null;
  function runner(gen,from=null){
    const r={gen,eco:null,cursor:0,climate:null,structPos:-1,sitesSig:'',print:[0,0],shadow:from?from.shadow:createShadow(shadowCfg),applied:from?from.applied:-1};
    // Intents name modules: they are mapped on the structure as it was where the runner is (its shadow may be ahead
    // after a seek back, its habitats cached), so every path to a moment maps them alike.
    r.here=id=>{shadowTo(r,r.structPos);return siteIn(r.shadow.model,id);};
    return r;
  }
  const lists=pick=>{let v=-1,l=[];return ()=>{if(v!==timeline.version){v=timeline.version;l=timeline.items.filter(pick);}return l;};};
  const structures=lists(x=>x.kind===KIND.structure),frames=lists(x=>x.kind===KIND.frame),lastingIntents=lists(LASTING);
  // ---- Structure and habitat --------------------------------------------------------------------------------------
  const siteIn=(model,id)=>grammar.siteOf?grammar.siteOf(id,model):(model.modules.get(id)?.group??(model.districts.has(id)?id:null));
  // Runner r's shadow model holding the base graph and structure items 0..k. With a deadline (background preparation)
  // it may stop early: false until it holds them all.
  function shadowTo(r,k,until=Infinity){
    const list=structures(),s=r.shadow;
    if(r.applied<0||r.applied>k+1){s.reset();if(base)s.model.reset(base.graph,base.t);r.applied=0;}
    while(r.applied<k+1){const x=list[r.applied++];s.model.applyDelta(x.delta,x.t,x.end??x.t);if(until<Infinity&&r.applied<k+1&&performance.now()>until)return false;}
    return true;
  }
  // The habitat right after structure item k (k = -1: before any recorded window; the base graph only, if any).
  function habitatAt(r,k){
    if(habitats[k+1])return habitats[k+1];
    shadowTo(r,k);const list=structures(),t=k>=0?(list[k].end??list[k].t):(base?.t??0);
    // A grammar returns the sites, or {sites, data}: data derived from the same structure (e.g. a navigation network),
    // handed to the ecosystem with the sites and again after every restore.
    const res=grammar.habitat(r.shadow.model,t)||[],sites=Array.isArray(res)?res:(res.sites||[]),data=Array.isArray(res)?null:(res.data??null);
    const h={sites,data,t,sig:fnv(JSON.stringify(sites.map(s=>[s.id,+s.x.toFixed(3),+s.y.toFixed(3),+s.z.toFixed(3),+s.r.toFixed(3),+s.w.toFixed(3),s.kind|0])))};
    habitats[k+1]=h;return h;
  }
  // Inputs changed at or after time t: habitats after it are recomputed, shadow models rebuilt if they passed it.
  function forgetFrom(t){const list=structures();let k=list.findIndex(x=>x.t>=t);if(k<0)k=list.length;habitats.length=Math.min(habitats.length,k+1);for(const r of [R,N])if(r&&r.applied>k)r.applied=-1;}
  // The last structure item at or before time T (-1: none).
  function structAt(T){const list=structures();let lo=0,hi=list.length;while(lo<hi){const m=(lo+hi)>>1;if(list[m].t<=T)lo=m+1;else hi=m;}return lo-1;}
  // ---- Climate: a fold over the bars of the performance clock ------------------------------------------------------
  const barMs=c=>240000/Math.max(30,c.tempo||92);
  function climateInit(c){return {bar:Math.floor(c.epoch/barMs(c))-1,energy:0,section:'home',sectionIndex:-1,milestone:false,fe:0,ft:0,fend:-Infinity};}
  // One bar of the fold at time T: energy smoothed per bar, a section chosen every 8 bars by the score's own rule.
  function bar(cl,T){cl.bar++;
    const stale=T-cl.fend>15000;cl.energy=cl.energy*.7+(stale?0:cl.fe)*.3;
    if(((cl.bar%8)+8)%8===0||cl.sectionIndex<0){cl.sectionIndex=Math.floor(cl.bar/8);
      const choose=score?.chooseSection;cl.section=choose?choose({index:cl.sectionIndex,tension:cl.ft,energy:cl.energy,previous:cl.section,milestone:cl.milestone}):'home';
      cl.milestone=false;}}
  // Ecology 2: at every tick, the conditions the music asks for at time T and the beat grid there (both pure
  // functions of T and the frames at or before it: the musical clock never looks ahead).
  function climate2(r,T,c){
    const ex=music.at(T),B=barMs(c)/4,cl=r.climate;
    r.eco.setClimate(climateOf(ex,c.params?.music??1,(music.config.seed%6283)/1000));r.eco.setGrid({beat:T/B,per:DT*1000*c.speed/B});
    cl.section=ex.role;cl.energy=+ex.energy||0;cl.bar=ex.bar;
  }
  function climateStep(r,T,c){
    if(eco2(c))return climate2(r,T,c);
    const cl=r.climate,b=Math.floor(T/barMs(c));if(cl.bar>=b)return;
    if(cl.bar<b-64)cl.bar=b-64;   // a live session joined long after the origin: 64 bars settle the fold
    while(cl.bar<b)bar(cl,T);
    r.eco.setClimate(conditions(cl,c));
  }
  // A generation's climate at its warm start T: the fold restarted 64 bars before it, each bar taking the last frame at
  // or before the bar's own start; then the frame in force at T (binary searches over the frames: no pass over them).
  function climateFrom(r,T,c){
    if(eco2(c))return climate2(r,T,c);   // (no fold: the musical clock reads its own window of frames)
    const cl=r.climate,B=barMs(c),b=Math.floor(T/B),fr=frames();
    const take=t=>{let lo=0,hi=fr.length;while(lo<hi){const m=(lo+hi)>>1;if(fr[m].t<=t)lo=m+1;else hi=m;}const x=fr[lo-1];cl.fe=x?x.energy:0;cl.ft=x?x.tension:0;cl.fend=x?x.end:-Infinity;};
    cl.bar=Math.max(cl.bar,b-64);
    while(cl.bar<b){const Tb=(cl.bar+1)*B;take(Tb);bar(cl,Tb);}
    take(T);r.eco.setClimate(conditions(cl,c));
  }
  function conditions(cl,c){
    const sec=(grammar.climate?.(cl.section,cl.energy,cl.ft))||SECTION_CLIMATE[cl.section]||NEUTRAL,m=clamp(+(c.params?.music??1),0,2),e=cl.energy;
    const out={};for(const k of Object.keys(NEUTRAL)){const v=sec[k]??NEUTRAL[k];out[k]=NEUTRAL[k]+(v-NEUTRAL[k])*m;}
    out.activity*=1+(.3*e-.15)*m;out.current*=1+(.2*e-.1)*m;return out;
  }
  // ---- Consuming inputs ---------------------------------------------------------------------------------------------
  const tickTime=(k,c)=>c.epoch+k*DT*1000*c.speed;
  function consume(r,T,c){
    const items=timeline.items,n=timeline.upto(T),eco=r.eco,cl=r.climate;
    for(;r.cursor<n;r.cursor++){const x=items[r.cursor];
      // (structure items are consumed in order: the next one is the one after the last, unless the inputs changed)
      if(x.kind===KIND.structure){const list=structures();r.structPos=list[r.structPos+1]===x?r.structPos+1:list.indexOf(x);
        const h=habitatAt(r,r.structPos);eco.setSiteData(h.data);if(h.sig!==r.sitesSig){r.sitesSig=h.sig;eco.setSites(h.sites);}}
      else if(x.kind===KIND.frame){cl.fe=x.energy;cl.ft=x.tension;cl.fend=x.end;}
      else{const i=x.intent,history=i.ts<c.epoch||(c.live&&base&&i.ts<base.from);
        if(!history&&MILESTONE.has(i.type)&&(i.tier>=2||i.evidence==='verified'))cl.milestone=true;
        for(const ev of influencesOf(i,r.here,{history}))eco.influence(ev);}
    }
  }
  // ---- States, generations, checkpoints, restore ----------------------------------------------------------------------
  // A live session's ecosystem is born at its base (the session joined, or its last rebase), not at its origin.
  const startTick=(c,target)=>c.live&&base?Math.max(0,Math.min(target,Math.floor((base.from-c.epoch)/(DT*1000*c.speed)))):0;
  // The shown runner for the generation of `target`, from nothing: generation 0 at the origin (a live session at its
  // base), a later one at its warm start. It takes over the previous runner's shadow.
  function fresh(c,target){
    const g=genOf(target,c),r=runner(g,R);R=r;
    if(g>0)start(r,c);
    else{const eco=r.eco=make(c),k0=startTick(c,target);r.climate=climateInit(c);
      const h=habitatAt(r,-1);r.sitesSig=h.sig;eco.setSiteData(h.data);eco.setSites(h.sites);eco.populate(k0);
      consume(r,tickTime(k0,c),c);climateStep(r,tickTime(k0,c),c);r.print=timeline.print(r.cursor);}
    counters.resets++;
  }
  // Generation g >= 1 at its warm start s = g x GEN_TICKS - WARM_TICKS (the history pass): a fresh population (the
  // generation's own seed) on the structure as it stands at its time (the habitat after the last window at or before
  // it), the lasting history before it (verified milestones and refactors, mapped on that structure, as a live session
  // joined late carries them) and the climate folded over the 64 bars before it. Every input at or before its time is
  // consumed as history: nothing transient carries over. Cost: binary searches, the shadow's replay up to that window
  // (forward only: none when it is there already), one habitat (cached), the lasting intents (few, filtered by type and
  // evidence before any mapping); never a pass over the inputs.
  function start(r,c){
    const t0=performance.now(),s=r.gen*GEN_TICKS-WARM_TICKS,T=tickTime(s,c),eco=r.eco=make(c,r.gen);
    r.structPos=structAt(T);r.cursor=timeline.upto(T);r.climate=climateInit(c);
    const h=habitatAt(r,r.structPos);r.sitesSig=h.sig;eco.setSiteData(h.data);eco.setSites(h.sites);eco.populate(s);
    for(const x of lastingIntents()){if(x.t>T)break;for(const ev of influencesOf(x.intent,r.here,{history:true}))eco.influence(ev);}
    climateFrom(r,T,c);r.print=timeline.print(r.cursor);counters.historyMs=+(performance.now()-t0).toFixed(2);
  }
  function snapshot(r){return {gen:r.gen,tick:r.eco.tick,cursor:r.cursor,print:r.print,frameKey,paramKey,sim:r.eco.snapshot(),climate:{...r.climate},structPos:r.structPos,sitesSig:r.sitesSig};}
  // A state restored into the shown runner (a new runner when the state is another generation's: its own seed).
  function restore(cp,c){
    if(!R||R.gen!==cp.gen||!R.eco){R=runner(cp.gen,R);R.eco=make(c,cp.gen);}
    const r=R;r.eco.restore(cp.sim);r.cursor=cp.cursor;r.print=cp.print;r.climate={...cp.climate};r.structPos=cp.structPos;r.sitesSig=cp.sitesSig;r.eco.setSiteData(habitatAt(r,cp.structPos).data);
    counters.restored={gen:cp.gen,tick:cp.tick};
  }
  // A state (tick, inputs consumed, their fingerprint) is valid while no input at or before its time changed.
  function validState(tick,cur,print,c){
    if(cur>timeline.items.length||!samePrint(timeline.print(cur),print))return false;
    const next=timeline.items[cur];return !next||next.t>tickTime(tick,c);
  }
  const validCp=(cp,c)=>cp.frameKey===frameKey&&cp.paramKey===paramKey&&validState(cp.tick,cp.cursor,cp.print,c);
  function remember(){
    const k=R.eco.tick,g=R.gen,same=x=>x.tick===k&&x.gen===g;
    if(k%RECENT_EVERY===0){recent=recent.filter(x=>!same(x));recent.push(snapshot(R));if(recent.length>RECENT_KEEP)recent.shift();}
    if(k%SPARSE_EVERY===0&&!sparse.some(same)){sparse.push(snapshot(R));sparse.sort((a,b)=>a.tick-b.tick||a.gen-b.gen);
      // An even spread over the performance: drop the checkpoint whose neighbours are closest.
      while(sparse.length>SPARSE_KEEP){let best=1,gap=Infinity;for(let i=1;i<sparse.length-1;i++){const g2=sparse[i+1].tick-sparse[i-1].tick;if(g2<gap){gap=g2;best=i;}}sparse.splice(best,1);}}
  }
  // The latest valid checkpoint of generation g at or before `target` (and after tick `after`); invalid ones are dropped.
  function checkpoint(g,target,c,after=-1){
    recent=recent.filter(x=>validCp(x,c));sparse=sparse.filter(x=>validCp(x,c));
    let best=null;for(const x of sparse.concat(recent))if(x.gen===g&&x.tick<=target&&x.tick>after&&(!best||x.tick>best.tick))best=x;
    return best;
  }
  // The latest valid state of the target's generation at or before it: the shown runner, the next generation's runner
  // (prepared in the background: handed over at its anchor), a checkpoint of that generation, or its start.
  function settle(target,c){
    const g=genOf(target,c),ok=r=>!!r&&!!r.eco&&r.gen===g&&r.eco.tick<=target&&validState(r.eco.tick,r.cursor,r.print,c);
    if(ok(R))return;
    if(ok(N)){R=N;N=null;counters.handovers++;remember();return;}
    const cp=checkpoint(g,target,c);
    if(cp){restore(cp,c);counters.fromCheckpoint++;}else fresh(c,target);
    counters.restores++;
  }
  function stepOnce(r,c){
    const t0=performance.now();
    r.eco.step();const T=tickTime(r.eco.tick,c);consume(r,T,c);climateStep(r,T,c);r.print=timeline.print(r.cursor);
    if(r!==R){counters.backgroundTicks++;return;}
    remember();counters.ticks++;counters.tickMs+=(performance.now()-t0-counters.tickMs)*.02;
  }
  // The next generation, prepared in the background from PREPARE before its anchor: its runner is started (the shadow
  // brought to the warm start a few deltas at a time, then the history pass) and stepped toward the anchor within a
  // small budget per frame (films: without a limit, paced to reach the anchor before playback does), so at the anchor
  // it is handed over without a pause. Never shown before its anchor; it runs exactly what a seek to its generation
  // runs, so no state depends on whether it existed.
  function prepare(target,c){
    const A=(R.gen+1)*GEN_TICKS;if(target<A-PREPARE)return;
    if(!N)N=runner(R.gen+1);
    const t0=performance.now(),until=c.film?Infinity:t0+BACKGROUND_MS,done=()=>{counters.backgroundMs=performance.now()-t0;};
    // (outside films each stage has a frame of its own: the last deltas of the shadow, the history pass, the ticks)
    if(!N.eco){const was=N.applied;if(!shadowTo(N,structAt(tickTime(A-WARM_TICKS,c)),until)||!c.film&&N.applied!==was)return done();
      start(N,c);if(!c.film)return done();}
    // A tick only if it should end within the budget, by what the last ones cost (before any: what the shown
    // generation's cost); the first of a frame always, so a machine whose tick exceeds the budget still progresses.
    // (The first ticks of the first second ecosystem in a page cost several times more, once: the JIT's, not a guess.)
    if(!counters.bgTickMs)counters.bgTickMs=counters.tickMs;
    const goal=c.film?Math.min(A,target+PREPARE-WARM_TICKS):A;
    for(let n=0;N.eco.tick<goal;n++){const a=performance.now();if(n&&a+counters.bgTickMs>=until)break;stepOnce(N,c);counters.bgTickMs+=(performance.now()-a-counters.bgTickMs)*.1;}
    done();
  }
  // ---- The frame --------------------------------------------------------------------------------------------------
  // info: the frame (tview); budgetMs: how long catching up may take this frame (films: no limit, the exact state).
  function update(info,{budgetMs=6}={}){
    const c=config();current=c;
    if(!Number.isFinite(c.epoch)||c.epoch<=0||!Number.isFinite(info.tview))return lastView=null;
    if(eco2(c))music.configure({...(c.music||{}),tempo:c.tempo});
    const fk=frameKeyOf(c),lk=liveKeyOf(c),pk=paramKeyOf(c);
    if(fk!==frameKey||pk!==paramKey){
      // A live session keeps its population through a change of life parameters or tempo (they apply from now: the
      // structure applied so far stays, the bars continue from the current one); replays and films derive the state
      // from the configuration, so any change rebuilds it exactly.
      if(R&&c.live&&lk===liveKey){const snap=snapshot(R);R.eco=make(c,R.gen);restore(snap,c);
        if(fk!==frameKey){R.shadow.retune(c.tempo);shadowCfg={...shadowCfg,tempo:c.tempo};R.climate.bar=Math.floor(tickTime(R.eco.tick,c)/barMs(c));}}
      else{R=N=null;if(fk!==frameKey){shadowCfg={speed:c.speed,tempo:c.tempo};habitats.length=0;}}
      frameKey=fk;liveKey=lk;paramKey=pk;recent=[];sparse=[];
    }
    const change=timeline.takeChange();if(change<Infinity)forgetFrom(change);
    const target=Math.max(0,Math.floor(info.tview*HZ+1e-6)),g=genOf(target,c);
    // The next generation's runner lives while it is this moment's next (or current) one and its inputs are unchanged.
    if(N&&(c.live||(N.gen!==g&&N.gen!==g+1)||(N.eco&&change<=tickTime(N.eco.tick,c))))N=null;
    if(!R||R.gen!==g||R.eco.tick>target||change<=tickTime(R.eco.tick,c))settle(target,c);
    if(N&&N.gen!==g+1)N=null;
    // Far ahead in the same generation: a later checkpoint saves the stepping (a seek forward again).
    if(target-R.eco.tick>RESTORE_AHEAD){const cp=checkpoint(R.gen,target,c,R.eco.tick);if(cp){restore(cp,c);counters.fromCheckpoint++;counters.restores++;}}
    if(target-R.eco.tick>RESTORE_AHEAD&&!c.film&&!restoring){restoring=true;restoreStart={at:performance.now(),from:R.eco.tick,r:R};}
    if(restoring&&restoreStart.r!==R){restoreStart.r=R;restoreStart.from=R.eco.tick;}   // (another runner: progress from where it starts)
    // While restoring, the inhabitants are hidden: catching up takes at least 20 ms a frame.
    const began=performance.now(),limit=c.film?Infinity:restoring?Math.max(budgetMs,20):Math.max(budgetMs,4);
    while(R.eco.tick<target){stepOnce(R,c);if(performance.now()-began>limit)break;}
    counters.catchUpMs=performance.now()-began;
    if(restoring){progress=clamp((R.eco.tick-restoreStart.from)/Math.max(1,target-restoreStart.from));
      if(R.eco.tick>=target){restoring=false;counters.lastRestoreMs=Math.round(performance.now()-restoreStart.at);counters.lastRestoreTicks=R.eco.tick-restoreStart.from;restoreStart=null;shownSince=info.tview;}}
    else progress=1;
    if(c.live&&!restoring&&R.eco.tick===target&&R.cursor-keptN>=rebaseAfter)rebase(c);
    if(!c.live&&background&&!restoring)prepare(target,c);
    // Presentation: alpha interpolates from the previous tick (state at tick-1 + alpha of one tick); the population
    // fades in after a restore and, in a replay or a film, crossfades at a generation's anchor.
    const alpha=R.eco.tick===target?clamp(info.tview*HZ-target):1;
    const fadeIn=(shownSince<0||info.tview<shownSince?1:clamp((info.tview-shownSince)/.6))*(c.live?1:crossfade(info.tview));
    return lastView={eco:R.eco,alpha,restoring,progress,fadeIn,generation:R.gen,tick:R.eco.tick,target,climate:{section:R.climate.section,energy:+R.climate.energy.toFixed(3)},...(eco2(c)?{ecology:2}:{})};
  }
  // ---- A live session's bounded memory --------------------------------------------------------------------------------
  // The consumed inputs are folded away: the timeline keeps only what is not consumed yet (and the verified lasting
  // intents, as history), refuses inputs older than now, and the structure as it is becomes the base a new world
  // starts from. This ecosystem continues exactly (its population, its own shadow and habitat); only a rebuild of the
  // shadow (an out-of-order window) or a new world starts from the base, which is the structure without its history.
  function rebase(c=config()){
    if(!R||!c.live||restoring)return false;
    const r=R,h0=habitatAt(r,r.structPos);shadowTo(r,r.structPos);
    const list=structures(),T=tickTime(r.eco.tick,c),tEval=r.structPos>=0?(list[r.structPos].end??list[r.structPos].t):(base?.t??T);
    // (ecology 2 also keeps the frames the musical clock still reads: the last 72 bars and the one in force)
    let keep=LASTING;if(eco2(c)){const from=T-72*barMs(c);let last=null;for(let i=0;i<r.cursor;i++)if(timeline.items[i].kind===KIND.frame)last=timeline.items[i];
      keep=x=>LASTING(x)||x.kind===KIND.frame&&(x.t>=from||x===last);}
    const kept=timeline.compact(r.cursor,T,keep);
    base={graph:graphOf(r.shadow.model,tEval),t:tEval,from:T};
    habitats.length=0;habitats[0]=h0;r.applied=0;r.cursor=keptN=kept;r.structPos=-1;r.print=timeline.print(r.cursor);
    frameKey=frameKeyOf(c);liveKey=liveKeyOf(c);recent=[snapshot(r)];sparse=[];
    counters.rebases++;onRebase?.(base);return true;
  }
  const resetShadows=()=>{for(const r of [R,N])if(r)r.applied=-1;};
  return {
    update,rebase,
    // Live: the structure the session was joined with, or its last rebase (`from`: inputs before it are history).
    // Replays never use it: their recorded windows are the structure.
    setBase(graph,t,from=t){if(!graph||!Number.isFinite(t))return;base={graph,t,from};habitats.length=0;resetShadows();},
    clearBase(){if(!base)return;base=null;habitats.length=0;resetShadows();},
    get ecosystem(){return R?.eco??null;},get view(){return lastView;},
    // The site a canonical subject belongs to (labels and inspection).
    siteOf:id=>R?siteIn(R.shadow.model,id):null,
    stats(){const e=R?.eco,s=e?e.stats():null,cl=R?.climate;return {grammar:grammar.id,version:grammar.version,sim:SIM_VERSION,hz:HZ,tick:e?.tick??0,generation:R?.gen??0,...(e?.ecology===2?{ecology:2}:{}),
      next:N?{generation:N.gen,tick:N.eco?.tick??null}:null,restoring,progress:+progress.toFixed(3),
      checkpoints:{recent:recent.length,sparse:sparse.length},inputs:timeline.stats(),habitats:habitats.filter(Boolean).length,climate:cl?{section:cl.section,energy:+cl.energy.toFixed(3),bar:cl.bar}:null,
      tickMs:+counters.tickMs.toFixed(3),catchUpMs:+counters.catchUpMs.toFixed(2),restores:counters.restores,resets:counters.resets,fromCheckpoint:counters.fromCheckpoint,ticks:counters.ticks,
      lastRestoreMs:counters.lastRestoreMs,lastRestoreTicks:counters.lastRestoreTicks,rebases:counters.rebases,restored:counters.restored,
      handovers:counters.handovers,backgroundTicks:counters.backgroundTicks,backgroundMs:+counters.backgroundMs.toFixed(2),historyMs:counters.historyMs,ecosystem:s};},
    digest:()=>R?.eco?.digest()??null,
    dispose(){R=N=null;recent=[];sparse=[];habitats.length=0;}
  };
}

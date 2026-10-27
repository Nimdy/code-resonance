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
// Restore: checkpoints (a recent ring every 2 s and an even spread over the whole performance) carry the ecosystem,
// the climate and the input position; each names the fingerprint of the inputs before it and the configuration
// (grammar, simulation version, seed, life parameters, speed, tempo, origin). A checkpoint is used only when both
// still match; otherwise the ecosystem is rebuilt from an earlier one or from its initial population. Catching up is
// bounded per frame (films excepted: a film frame waits for the exact state); while far behind, the view reports
// `restoring` with its progress and the world hides the population rather than show a stale one.
import {createEcosystem,HZ,DT,SIM_VERSION} from './sim.js';
import {createShadow,KIND} from './timeline.js';
export {HZ,DT,SIM_VERSION};
const RECENT_EVERY=2*HZ,RECENT_KEEP=6,SPARSE_EVERY=20*HZ,SPARSE_KEEP=24;
const RESTORE_AHEAD=3*HZ;          // further behind than this: the view is "restoring"
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
const fnv=s=>{let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
const samePrint=(p,q)=>!!p&&!!q&&p[0]===q[0]&&p[1]===q[1];
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
// Recipe values (catalogue life.*, 0..2 around 1) -> the ecosystem's behaviour scales.
export function lifeScales(p={}){const n=(k,d=1)=>Number.isFinite(+p[k])?+p[k]:d;
  return {density:n('density'),vitality:n('vitality'),collective:n('collective'),environment:n('environment'),trails:n('trails'),music:n('music'),
    attraction:n('attraction'),repulsion:n('repulsion'),separation:n('separation'),alignment:n('alignment'),cohesion:n('cohesion'),current:n('current'),
    persistence:n('persistence'),diffusion:n('diffusion'),radius:n('radius')};}
// grammar: {id, version, ecosystem(params, seed) -> spec for createEcosystem (without seed/params),
//           habitat(model, t) -> sites [{id, x, y, z, r, w, kind}], siteOf?(id, model) -> site id,
//           climate?(section, energy, tension) -> condition targets}
// config(): {speed, tempo, epoch (ms), params (the recipe's life values), film, live}
export function createLifeDriver({grammar,timeline,seed,config,score=globalThis.ResonanceScore}){
  seed=seed>>>0;
  const shadow=createShadow();
  let eco=null,frameKey='',paramKey='',cursor=0,climate=null,base=null,current=null;
  let structList=[],structVersion=-1,shadowApplied=-1;const habitats=[];   // habitat per structure item (index + 1; 0: base)
  let recent=[],sparse=[],restoring=false,progress=1,shownSince=-1,lastView=null,restoreStart=null,structPos=-1,sitesSig='';
  const counters={restores:0,resets:0,fromCheckpoint:0,ticks:0,catchUpMs:0,tickMs:0,lastRestoreMs:null,lastRestoreTicks:0};
  const frameKeyOf=c=>fnv(JSON.stringify([grammar.id,grammar.version,SIM_VERSION,seed,c.speed,c.tempo,c.epoch,base?`${base.t}|${base.graph?.nodes?.length||0}`:'']));
  const paramKeyOf=c=>fnv(JSON.stringify(c.params||{}));
  const make=c=>createEcosystem({...grammar.ecosystem(c.params||{},seed),seed,params:lifeScales(c.params)});
  // ---- Structure and habitat --------------------------------------------------------------------------------------
  function structures(){
    if(structVersion!==timeline.version){structVersion=timeline.version;structList=timeline.items.filter(x=>x.kind===KIND.structure);}
    return structList;
  }
  const siteOf=id=>grammar.siteOf?grammar.siteOf(id,shadow.model):(shadow.model.modules.get(id)?.group??(shadow.model.districts.has(id)?id:null));
  // The shadow model holding the base graph and structure items 0..k (forward only; rebuilt when asked to go back).
  function shadowTo(k){
    const list=structures();
    if(shadowApplied<0||shadowApplied>k+1){shadow.reset();if(base)shadow.model.reset(base.graph,base.t);shadowApplied=0;}
    for(;shadowApplied<k+1;shadowApplied++){const x=list[shadowApplied];shadow.model.applyDelta(x.delta,x.t,x.end??x.t);}
  }
  // The habitat right after structure item k (k = -1: before any recorded window; the base graph only, if any).
  function habitatAt(k){
    if(habitats[k+1])return habitats[k+1];
    shadowTo(k);const list=structures(),t=k>=0?(list[k].end??list[k].t):(base?.t??0);
    const sites=grammar.habitat(shadow.model,t)||[];
    const h={sites,t,sig:fnv(JSON.stringify(sites.map(s=>[s.id,+s.x.toFixed(3),+s.y.toFixed(3),+s.z.toFixed(3),+s.r.toFixed(3),+s.w.toFixed(3),s.kind|0])))};
    habitats[k+1]=h;return h;
  }
  // Inputs changed at or after time t: habitats after it are recomputed, the shadow model rebuilt if it passed it.
  function forgetFrom(t){const list=structures();let k=list.findIndex(x=>x.t>=t);if(k<0)k=list.length;habitats.length=Math.min(habitats.length,k+1);if(shadowApplied>k)shadowApplied=-1;}
  // ---- Climate: a fold over the bars of the performance clock ------------------------------------------------------
  const barMs=c=>240000/Math.max(30,c.tempo||92);
  function climateInit(c){return {bar:Math.floor(c.epoch/barMs(c))-1,energy:0,section:'home',sectionIndex:-1,milestone:false,fe:0,ft:0,fend:-Infinity};}
  function climateStep(T,c){
    const b=Math.floor(T/barMs(c));if(climate.bar>=b)return;
    if(climate.bar<b-64)climate.bar=b-64;   // a live session joined long after the origin: 64 bars settle the fold
    while(climate.bar<b){climate.bar++;
      const stale=T-climate.fend>15000;climate.energy=climate.energy*.7+(stale?0:climate.fe)*.3;
      if(((climate.bar%8)+8)%8===0||climate.sectionIndex<0){climate.sectionIndex=Math.floor(climate.bar/8);
        const choose=score?.chooseSection;climate.section=choose?choose({index:climate.sectionIndex,tension:climate.ft,energy:climate.energy,previous:climate.section,milestone:climate.milestone}):'home';
        climate.milestone=false;}}
    eco.setClimate(conditions(c));
  }
  function conditions(c){
    const sec=(grammar.climate?.(climate.section,climate.energy,climate.ft))||SECTION_CLIMATE[climate.section]||NEUTRAL,m=clamp(+(c.params?.music??1),0,2),e=climate.energy;
    const out={};for(const k of Object.keys(NEUTRAL)){const v=sec[k]??NEUTRAL[k];out[k]=NEUTRAL[k]+(v-NEUTRAL[k])*m;}
    out.activity*=1+(.3*e-.15)*m;out.current*=1+(.2*e-.1)*m;return out;
  }
  // ---- Consuming inputs ---------------------------------------------------------------------------------------------
  const tickTime=(k,c)=>c.epoch+k*DT*1000*c.speed;
  function consume(T,c){
    const items=timeline.items,n=timeline.upto(T);
    for(;cursor<n;cursor++){const x=items[cursor];
      if(x.kind===KIND.structure){structPos=structures().indexOf(x);const h=habitatAt(structPos);if(h.sig!==sitesSig){sitesSig=h.sig;eco.setSites(h.sites);}}
      else if(x.kind===KIND.frame){climate.fe=x.energy;climate.ft=x.tension;climate.fend=x.end;}
      else{const i=x.intent,history=i.ts<c.epoch;
        if(!history&&MILESTONE.has(i.type)&&(i.tier>=2||i.evidence==='verified'))climate.milestone=true;
        for(const ev of influencesOf(i,siteOf,{history}))eco.influence(ev);}
    }
  }
  // ---- States, checkpoints, restore -----------------------------------------------------------------------------------
  function fresh(c){
    eco=make(c);cursor=0;climate=climateInit(c);structPos=-1;
    const h=habitatAt(-1);sitesSig=h.sig;eco.setSites(h.sites);eco.populate();
    consume(tickTime(0,c),c);climateStep(tickTime(0,c),c);counters.resets++;
  }
  function snapshot(){return {tick:eco.tick,cursor,print:timeline.print(cursor),frameKey,paramKey,sim:eco.snapshot(),climate:{...climate},structPos,sitesSig};}
  function restore(cp){eco.restore(cp.sim);cursor=cp.cursor;climate={...cp.climate};structPos=cp.structPos;sitesSig=cp.sitesSig;}
  // A state (tick, inputs consumed, their fingerprint) is valid while no input at or before its time changed.
  function validState(tick,cur,print,c){
    if(cur>timeline.items.length||!samePrint(timeline.print(cur),print))return false;
    const next=timeline.items[cur];return !next||next.t>tickTime(tick,c);
  }
  const validCp=(cp,c)=>cp.frameKey===frameKey&&cp.paramKey===paramKey&&validState(cp.tick,cp.cursor,cp.print,c);
  function remember(){
    const k=eco.tick;
    if(k%RECENT_EVERY===0){recent=recent.filter(x=>x.tick!==k);recent.push(snapshot());if(recent.length>RECENT_KEEP)recent.shift();}
    if(k%SPARSE_EVERY===0&&!sparse.some(x=>x.tick===k)){sparse.push(snapshot());sparse.sort((a,b)=>a.tick-b.tick);
      // An even spread over the performance: drop the checkpoint whose neighbours are closest.
      while(sparse.length>SPARSE_KEEP){let best=1,gap=Infinity;for(let i=1;i<sparse.length-1;i++){const g=sparse[i+1].tick-sparse[i-1].tick;if(g<gap){gap=g;best=i;}}sparse.splice(best,1);}}
  }
  // The latest valid state at or before `target`: the current one, a checkpoint, or the initial population.
  function settle(target,c){
    if(eco&&eco.tick<=target&&validState(eco.tick,cursor,consumedPrint,c))return;
    recent=recent.filter(x=>validCp(x,c));sparse=sparse.filter(x=>validCp(x,c));
    const cp=[...sparse,...recent].filter(x=>x.tick<=target).sort((a,b)=>b.tick-a.tick)[0];
    if(cp){if(!eco)eco=make(c);restore(cp);counters.fromCheckpoint++;}else fresh(c);
    consumedPrint=timeline.print(cursor);counters.restores++;
  }
  let consumedPrint=[0,0];
  function stepOnce(c){
    const t0=performance.now();
    eco.step();const T=tickTime(eco.tick,c);consume(T,c);climateStep(T,c);consumedPrint=timeline.print(cursor);remember();
    counters.ticks++;counters.tickMs+=(performance.now()-t0-counters.tickMs)*.02;
  }
  // ---- The frame --------------------------------------------------------------------------------------------------
  // info: the frame (tview); budgetMs: how long catching up may take this frame (films: no limit, the exact state).
  function update(info,{budgetMs=6}={}){
    const c=config();current=c;
    if(!Number.isFinite(c.epoch)||c.epoch<=0||!Number.isFinite(info.tview))return lastView=null;
    const fk=frameKeyOf(c),pk=paramKeyOf(c);
    if(fk!==frameKey||pk!==paramKey){
      // A live session keeps its population through a change of life parameters (it applies from now); replays and
      // films derive the state from the configuration, so any change rebuilds it exactly.
      if(eco&&c.live&&fk===frameKey){const snap=snapshot();eco=make(c);restore(snap);}
      else{eco=null;if(fk!==frameKey){shadow.configure({speed:c.speed,tempo:c.tempo});habitats.length=0;shadowApplied=-1;}}
      frameKey=fk;paramKey=pk;recent=[];sparse=[];
    }
    const change=timeline.takeChange();if(change<Infinity)forgetFrom(change);
    const target=Math.max(0,Math.floor(info.tview*HZ+1e-6));
    if(!eco){fresh(c);consumedPrint=timeline.print(cursor);}
    if(eco.tick>target||change<=tickTime(eco.tick,c))settle(target,c);
    if(target-eco.tick>RESTORE_AHEAD&&!c.film&&!restoring){restoring=true;restoreStart={at:performance.now(),from:eco.tick};}
    const began=performance.now(),limit=c.film?Infinity:restoring?Math.max(budgetMs,12):Math.max(budgetMs,4);
    while(eco.tick<target){stepOnce(c);if(performance.now()-began>limit)break;}
    counters.catchUpMs=performance.now()-began;
    if(restoring){progress=clamp((eco.tick-restoreStart.from)/Math.max(1,target-restoreStart.from));
      if(eco.tick>=target){restoring=false;counters.lastRestoreMs=Math.round(performance.now()-restoreStart.at);counters.lastRestoreTicks=eco.tick-restoreStart.from;restoreStart=null;shownSince=info.tview;}}
    else progress=1;
    // Presentation: alpha interpolates from the previous tick (state at tick-1 + alpha of one tick).
    const alpha=eco.tick===target?clamp(info.tview*HZ-target):1;
    const fadeIn=shownSince<0||info.tview<shownSince?1:clamp((info.tview-shownSince)/.6);
    return lastView={eco,alpha,restoring,progress,fadeIn,tick:eco.tick,target,climate:{section:climate.section,energy:+climate.energy.toFixed(3)}};
  }
  return {
    update,
    // Live: the structure the session was joined with (replays never use it: their recorded windows are the structure).
    setBase(graph,t){if(!graph||!Number.isFinite(t))return;base={graph,t};habitats.length=0;shadowApplied=-1;},
    clearBase(){if(!base)return;base=null;habitats.length=0;shadowApplied=-1;},
    get ecosystem(){return eco;},get view(){return lastView;},
    // The site a canonical subject belongs to (labels and inspection).
    siteOf,
    stats(){const s=eco?eco.stats():null;return {grammar:grammar.id,version:grammar.version,sim:SIM_VERSION,hz:HZ,tick:eco?.tick??0,restoring,progress:+progress.toFixed(3),
      checkpoints:{recent:recent.length,sparse:sparse.length},inputs:timeline.stats(),habitats:habitats.filter(Boolean).length,climate:climate?{section:climate.section,energy:+climate.energy.toFixed(3),bar:climate.bar}:null,
      tickMs:+counters.tickMs.toFixed(3),catchUpMs:+counters.catchUpMs.toFixed(2),restores:counters.restores,resets:counters.resets,fromCheckpoint:counters.fromCheckpoint,ticks:counters.ticks,
      lastRestoreMs:counters.lastRestoreMs,lastRestoreTicks:counters.lastRestoreTicks,ecosystem:s};},
    digest:()=>eco?.digest()??null,
    dispose(){eco=null;recent=[];sparse=[];habitats.length=0;shadow.reset();}
  };
}

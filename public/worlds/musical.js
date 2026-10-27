// The musical expression of a performance moment, for the worlds, the digital life and the artist's layers.
// It reads the same canonical frames the life driver reads (the life timeline's frame items) on the same bar grid as
// the player (bar = floor(performance ms / bar ms)), and asks the score (ResonanceScore.conductAt / expression) what
// the music is doing there. It never listens to the audio device: muted, unplugged or rendered offline, a moment of a
// performance reads the same. Pure (no rendering), tested in Node.
const STALE=15000;
// A v2 score has no form: its sections map onto the nearest v3 roles, and the rest is read from its layer rule.
const V2_ROLE={home:'statement',away:'development',tension:'tension',resolve:'resolve',lift:'return',breath:'release'};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function createMusical({timeline,score=globalThis.ResonanceScore}={}){
  let cfg={version:2,style:'ambient',profile:null,seed:0,tempo:92},key=JSON.stringify(cfg),frames=[],fv=-1;
  const cache=new Map();
  function index(){if(fv===timeline.version)return;fv=timeline.version;frames=timeline.items.filter(x=>x.kind===1);cache.clear();}
  // The frame in force at T (its window started at or before T); after 15 s without a new one the work has gone
  // quiet and its energy no longer counts (the player's own rule).
  function frameAt(T){
    index();let lo=0,hi=frames.length;while(lo<hi){const m=(lo+hi)>>1;if(frames[m].t<=T)lo=m+1;else hi=m;}
    const f=frames[lo-1];if(!f)return null;
    return T-f.end>STALE?{energy:0,tension:f.tension,milestone:false,chapter:f.chapter}:f;
  }
  const barMs=()=>240000/(cfg.tempo>0?cfg.tempo:92);
  // v2: the player's section rule folded over the eight sections before (bounded, so any consumer gets the same value).
  function conductV2(bar){
    const B=barMs(),first=(Math.floor(bar/8)-8)*8;let energy=0,section='home',milestone=false;
    for(let b=first;b<=bar;b++){const f=frameAt(b*B);energy=energy*.7+(f?.energy||0)*.3;milestone=milestone||!!f?.milestone;
      if(((b%8)+8)%8===0){section=score.chooseSection({index:Math.floor(b/8),tension:f?.tension||0,energy,previous:section,milestone});milestone=false;}}
    return {role:V2_ROLE[section]||'statement',section,lift:section==='lift',energy};
  }
  function conducted(bar){
    if(cache.has(bar))return cache.get(bar);
    const B=barMs(),c=cfg.version===3?score.conductAt({seed:cfg.seed,barIndex:bar,profile:cfg.profile,frameAt:b=>frameAt(b*B)}):conductV2(bar);
    cache.set(bar,c);if(cache.size>96)cache.delete(cache.keys().next().value);
    return c;
  }
  function expressionV2(bar,phase,c,f){
    const layers=score.activeLayers(f?.chapter||1,c.energy,cfg.style,c.section),sec=((bar%8)+8)%8;
    const has=n=>layers.includes(n)?1:0;
    return {version:2,role:c.role,planned:c.role,section:Math.floor(bar/8),lift:c.lift,sectionProgress:(sec+phase)/8,passageProgress:(sec+phase)/8,
      phrase:Math.floor(sec/4),barInPhrase:sec%4,beat:Math.floor(phase*4),beatPhase:(phase*4)%1,pulse:Math.pow(1-(phase*4)%1,3),barPulse:Math.pow(1-phase,2),
      energy:clamp(c.energy),tension:clamp(c.section==='tension'?.8:(f?.tension||0)*.8),density:layers.length/9,melody:has('lead')||has('motif')?.7:0,
      rhythm:clamp(has('hat')*.3+has('drums')*.4+has('arp')*.3),dynamics:c.section==='lift'?1:c.section==='breath'?.4:.7,
      transition:sec===7?phase:0,onset:sec===0?1-phase:0,release:c.section==='resolve'||c.section==='breath'?.7:0};
  }
  // The expression at performance time T (ms). All values 0..1 except the counters; `bar` and `phase` locate it.
  function at(T){
    const B=barMs(),bar=Math.floor(T/B),phase=clamp((T-bar*B)/B,0,.999),c=conducted(bar),f=frameAt(T);
    const e=cfg.version===3?score.expression({seed:cfg.seed,style:cfg.style,profile:cfg.profile,barIndex:bar,phase,section:c.role,lift:c.lift,energy:c.energy,chapter:f?.chapter||1})
      :expressionV2(bar,phase,c,f);
    return {...e,bar,phase};
  }
  return {at,frameAt,conducted,
    configure(next={}){
      const n={version:score.versionOf?score.versionOf(next.version??cfg.version):2,style:next.style??cfg.style,profile:next.profile===undefined?cfg.profile:next.profile,
        seed:Number.isFinite(next.seed)?next.seed>>>0:cfg.seed,tempo:next.tempo>0?next.tempo:cfg.tempo};
      const k=JSON.stringify(n);if(k!==key){cfg=n;key=k;cache.clear();}
    },
    get config(){return cfg;},get key(){return key;}};
}

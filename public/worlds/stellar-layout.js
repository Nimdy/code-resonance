// Stellar Forge's layout: where each subsystem's star system sits in the galaxy at a moment, as pure functions of a
// model and a time (no rendering, no THREE), so the world draws it from its own model and the digital life's habitat
// (life/stellar.js) evaluates it on the timeline's shadow model, as the structure was after each recorded window.
// Tested in Node (tests/life-stellar*.test.js). The arithmetic is the world's own (moved here unchanged).
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rand(seed){let t=(seed>>>0)+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
const hexDistance=(aq,ar,bq,br)=>(Math.abs(aq-bq)+Math.abs(aq+ar-bq-br)+Math.abs(ar-br))/2;
// The recipe's layout constants (arrangement, arms, pitch, first arm angle, spacing).
export function layoutConfig(recipe){
  const G=recipe?.genome||{},geo=G.geometry||{},spc=G.space||{};
  const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  const seed=(recipe?.projectSeed>>>0)||1;
  const ARR=['spiral','cluster','ring','binary-core'].includes(geo.arrangement)?geo.arrangement:'spiral';
  // Pitch 23-35 degrees across the generated twist range: open enough to read as a spiral from a low camera.
  const ARMS=Math.max(1,Math.round(num(geo.spiralArms,2))),PITCH=clamp(.48/Math.sqrt(clamp(num(geo.spiralTwist,1),.3,2)),.34,.62),TANP=Math.tan(PITCH),ARM0=rand(seed+31)*TAU,R0=6;
  const STAR_SCALE=clamp(num(geo.starScale,1),.5,1.8),SPACING=clamp(num(geo.orbitSpacing,1),.6,1.6),SPREAD=clamp(num(spc.spread,1),.6,1.6);
  const ORBIT0=2.1*STAR_SCALE+.4,STEP=.78*SPACING;
  return {seed,ARR,ARMS,PITCH,TANP,ARM0,R0,STAR_SCALE,SPACING,SPREAD,ORBIT0,STEP};
}
export function createLayout(cfg){
  const {ARR,ARMS,PITCH,TANP,ARM0,R0,SPREAD,ORBIT0,STEP,STAR_SCALE}=cfg;
  const armAngle=(arm,r)=>ARM0+arm/ARMS*TAU+Math.log(Math.max(.5,r)/R0)/TANP;
  const caches=new WeakMap();   // model -> (signature -> packed layout)
  const cacheOf=model=>{let c=caches.get(model);if(!c){c=new Map();caches.set(model,c);}return c;};
  const aliveAt=(model,x,t)=>model.bornAt(x)<=t&&(x.removed===null||x.removed>t);
  function districtsAt(model,t){return [...model.districts.values()].filter(d=>model.districtBorn(d)<=t).sort((a,b)=>a.order-b.order||(a.id<b.id?-1:1));}
  function sysRadius(model,d,t){let k=0;for(const id of d.members){const m=model.modules.get(id);if(m&&aliveAt(model,m,t))k=Math.max(k,hexDistance(m.q,m.r,d.q,d.r));}return ORBIT0+k*STEP+1.1;}
  function pack(list,S,coreSize){
    const out=new Map(),placed=[];const gap=(a,b)=>(a+b)*1.08*SPREAD;
    const free=(x,y,z,s)=>{for(const p of placed)if(Math.hypot(p.x-x,p.y-y,p.z-z)<gap(p.s,s))return false;return true;};
    if(ARR==='spiral'){const last=new Array(ARMS).fill(null),lastS=new Array(ARMS).fill(0),big=Math.max(1,...list.map(d=>S.get(d.id)));
      list.forEach((d,k)=>{const s=S.get(d.id),arm=k%ARMS;let r=last[arm]!==null?last[arm]+gap(lastS[arm],s)*Math.sin(PITCH)*1.02:Math.max(coreSize*SPREAD+s+1,big*1.15/Math.sin(Math.PI/Math.max(2,ARMS)));
        const h=rand(hash(d.id)),y=(h-.5)*.12;
        for(let i=0;i<500;i++){const a=armAngle(arm,r);if(free(Math.cos(a)*r,y,Math.sin(a)*r,s)&&r>=coreSize+s+.6)break;r+=.25;}
        const a=armAngle(arm,r);const p={x:Math.cos(a)*r,y,z:Math.sin(a)*r,s,arm,r};placed.push(p);out.set(d.id,p);last[arm]=r;lastS[arm]=s;});
      return out;}
    if(ARR==='cluster'){const N=Math.max(12,list.length+4);list.forEach((d,k)=>{const s=S.get(d.id);let R=coreSize+s+1;
        const y=1-(k+.5)/N*2,rr=Math.sqrt(1-y*y),phi=k*2.39996+ARM0;
        for(let i=0;i<500;i++){if(free(Math.cos(phi)*rr*R,y*R*.55,Math.sin(phi)*rr*R,s))break;R+=.3;}
        const p={x:Math.cos(phi)*rr*R,y:y*R*.55,z:Math.sin(phi)*rr*R,s};placed.push(p);out.set(d.id,p);});return out;}
    let inner=list;if(ARR==='binary-core'){inner=list.slice(2);list.slice(0,2).forEach((d,k)=>{const s=S.get(d.id),a=ARM0+(k?Math.PI:0),r=Math.max(coreSize+s+.6,s*1.1);const p={x:Math.cos(a)*r,y:0,z:Math.sin(a)*r,s};placed.push(p);out.set(d.id,p);});}
    const angles=inner.map(d=>d.angle).sort((a,b)=>a-b);let minSep=TAU;for(let i=0;i<angles.length;i++){const a=angles[i],b=i+1<angles.length?angles[i+1]:angles[0]+TAU;if(angles.length>1)minSep=Math.min(minSep,b-a);}
    const big=Math.max(1,...inner.map(d=>S.get(d.id)));
    const R=Math.max(coreSize+big+1,(ARR==='binary-core'?Math.max(0,...placed.map(p=>Math.hypot(p.x,p.z)+p.s))+big+1:0),inner.length>1?gap(big,big)/(2*Math.sin(Math.min(Math.PI/2,Math.max(.05,minSep)/2))):0);
    for(const d of inner){const s=S.get(d.id),h=rand(hash(d.id));const p={x:Math.cos(d.angle)*R,y:(h-.5)*.12,z:Math.sin(d.angle)*R,s};placed.push(p);out.set(d.id,p);}
    return out;
  }
  function layoutState(model,t){
    const list=districtsAt(model,t);const S=new Map();let sig='';
    for(const d of list){const R=sysRadius(model,d,t);S.set(d.id,R);sig+=`${d.id}:${R.toFixed(2)}|`;}
    const layoutCache=cacheOf(model);let L=layoutCache.get(sig);
    if(!L){const core=list.find(d=>d.core),others=list.filter(d=>!d.core);const coreSize=core?S.get(core.id):1.5;
      const pos=pack(others,S,coreSize);if(core)pos.set(core.id,{x:0,y:0,z:0,s:coreSize});
      let outer=Math.max(4,coreSize);for(const p of pos.values())outer=Math.max(outer,Math.hypot(p.x,p.z)+p.s);
      let gR=Math.max(13,outer*(ARR==='cluster'?1.25:ARR==='spiral'?1.25:1.42));
      // Spiral: the systems spread along the arms out to ~0.8 of the galaxy (a monotone radial stretch keeps them apart).
      if(ARR==='spiral'){const arm=[...pos.values()].filter(p=>p.arm!==undefined);if(arm.length){const rin=Math.min(...arm.map(p=>p.r)),rmax=Math.max(...arm.map(p=>p.r));
        const f=rmax>rin+.01?Math.max(1,(gR*.78-rin)/(rmax-rin)):1;
        for(const p of arm){const r=rin+(p.r-rin)*f,a=armAngle(p.arm,r);p.x=Math.cos(a)*r;p.z=Math.sin(a)*r;}
        outer=Math.max(4,coreSize);for(const p of pos.values())outer=Math.max(outer,Math.hypot(p.x,p.z)+p.s);gR=Math.max(gR,outer*1.08);}}
      L={pos,S,outer,galR:gR};layoutCache.set(sig,L);if(layoutCache.size>32)layoutCache.delete(layoutCache.keys().next().value);}
    return {list,L};}
  // The latest structural change at or before t (module born or removed): the layout eases from its state just before.
  const BLEND=3200;
  function lastChange(model,t){let tc=-Infinity;for(const m of model.modules.values()){const b=model.bornAt(m);if(b<=t&&b>tc)tc=b;if(m.removed!==null&&m.removed<=t&&m.removed>tc)tc=m.removed;}return tc;}
  function blended(model,t,depth){const s=layoutState(model,t);const out={list:s.list,pos:new Map(),S:s.L.S,outer:s.L.outer,galR:s.L.galR};for(const [id,p] of s.L.pos)out.pos.set(id,{x:p.x,y:p.y,z:p.z});
    const tc=lastChange(model,t);if(depth<4&&Number.isFinite(tc)&&t-tc<BLEND){const prev=blended(model,tc-1,depth+1),k=smooth((t-tc)/BLEND);
      for(const [id,p] of out.pos){const q=prev.pos.get(id);if(q){p.x=lerp(q.x,p.x,k);p.y=lerp(q.y,p.y,k);p.z=lerp(q.z,p.z,k);}}
      out.galR=lerp(prev.galR,out.galR,k);out.outer=lerp(prev.outer,out.outer,k);}
    return out;}
  function starRadius(model,d,t){let n=0;for(const id of d.members){const m=model.modules.get(id);if(!m||!aliveAt(model,m,t))continue;let k=0;
      for(const sid of m.symbols){const s=model.symbols.get(sid);if(s&&aliveAt(model,s,t))k+=smooth((t-model.bornAt(s))/1500);}n+=Math.max(1,k)*smooth((t-model.bornAt(m))/2000);}
    return Math.min(1.1,(d.core?.6:.36)+.17*Math.log2(1+n)/2.2)*STAR_SCALE;}
  // Richness: how mature the galaxy looks (stars, gas) follows the accumulated structure, eased.
  function richness(model,t){let w=0;for(const m of model.modules.values())if(aliveAt(model,m,t))w+=(1+Math.min(40,m.symbols.size)/6)*smooth((t-model.bornAt(m))/3000);return clamp(.3+.7*Math.log2(1+w)/Math.log2(1+900),.3,1);}
  // The galaxy's own frame for its stars and arms: the log spiral at radius q (galaxy radii) is ARM0 + ln(q) / tan(pitch);
  // the world turns it by ln(galR / R0) / tan(pitch) so that systems placed in world units sit on it.
  const armTurn=galR=>Math.log(galR/R0)/TANP;
  return {cfg,armAngle,armTurn,aliveAt,districtsAt,sysRadius,pack,layoutState,lastChange,blended,starRadius,richness};
}

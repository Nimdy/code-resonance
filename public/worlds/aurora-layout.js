// Aurora's layout (preview): the night over the frozen lake as pure functions of a model, a recipe and a time (no
// rendering, no THREE). The world draws it (aurora.js); tests/aurora.test.js pins it. Design brief: docs/worlds/aurora.md.
//
//  - subsystem -> a curtain of the aurora: a folded sheet of light hanging along the magnetic field, its trace a line
//                 across the sky (east to west, a little off it) at its own distance from the shore, so it rises from the
//                 horizon as an arc; placed by its order of birth: the first in the middle at the middle distance, the
//                 later ones alternately right and left, nearer and farther (low-discrepancy sequences, so a new curtain
//                 never moves an older one). Its length grows with its files
//  - file      -> a ray in its curtain, at its slot (alternately right and left of the curtain's first file, at the
//                 identity's spacing), its height from its live symbols
//  - state     -> the share of the last moments a file was stressed (a storm) or validated
// The model of the moment is the host's live, or in a replay its whole recorded history (terrain-layout.js historyFrom),
// so a curtain's place and its rays' rise do not depend on where playback was sought from.
import {prepare,historyFrom,recordCue} from './terrain-layout.js';
export {prepare,historyFrom,recordCue};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const frac=x=>x-Math.floor(x);
export function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rand(seed){let t=(seed>>>0)+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
// A new ray rises over EASE ms; a removed one fades over the model's own 1.6 s; a storm sets in over STORM_IN and clears
// over STORM_OUT after the files pass again.
export const EASE=2600,STORM_IN=1500,STORM_OUT=2500;
// The field lines: up, leaning north (away from the shore) to the magnetic zenith at about 77 degrees. Every curtain's
// rays run along them, so in perspective they converge toward the magnetic zenith: overhead, that is the corona.
export const MAG=(()=>{const e=77*Math.PI/180;return [0,Math.sin(e),-Math.cos(e)];})();
// The curtains' lower edge (world units above the ice) and their height along the field lines; their middle distance.
export const ALT=235,HEIGHT=560,MID=1350,MINLEN=760;
// The recipe's layout constants (lengths in world units).
export function layoutConfig(recipe){
  const G=recipe?.genome||{},au=G.aurora||{};
  return {seed:(recipe?.projectSeed>>>0)||1,sp:clamp(num(au.spacing,60),8,200),height:clamp(num(au.height,1),.4,1.8),spread:clamp(num(au.spread,1),.5,1.6),
    folds:clamp(num(au.folds,.9),0,1.8)};
}
// ---- Ramps over sorted event times (each event rises from 0 at its time to 1 a span D later) -------------------------
const upper=(a,v)=>{let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m]<=v)lo=m+1;else hi=m;}return lo;};
function rampSum(a,g,D){if(!a.length)return 0;const full=upper(a,g-D),to=upper(a,g);let s=full;for(let k=full;k<to;k++)s+=smooth((g-a[k])/D);return s;}
const ramp=(g,e,D)=>e===-Infinity?1:e===Infinity?0:g<=e?0:g>=e+D?1:smooth((g-e)/D);
// The share of [g - D, g] that segments [from, to) cover.
function share(segs,g,D){let s=0;for(const [a,b] of segs){const x=Math.max(a,g-D),y=Math.min(b,g);if(y>x)s+=y-x;}return clamp(s/D);}
// A stress that sets in over STORM_IN and clears over STORM_OUT (the curtain stays storm-red while its files are stressed).
function stormOf(segs,g){let s=0;for(const [a,b] of segs){if(g<a)continue;const on=smooth((g-a)/STORM_IN),off=b===Infinity||g<b?1:1-smooth((g-b)/STORM_OUT);s=Math.max(s,on*off);}return s;}
// ---- Places --------------------------------------------------------------------------------------------------------
// A curtain's place by its rank (its subsystem's order of birth) and id: its centre's distance from the shore and its
// azimuth (0 straight across the lake, positive to the right), the tilt of its trace off east-west (toward facing the
// shore when it stands to a side), the altitude of its lower edge, its height, and its seed (the phases of its folds).
// The first ten ranks take composed places (azimuth in degrees, depth -1 near .. 1 far): side by side across the sky with
// a little overlap, alternately nearer and farther; later ranks fill in by low-discrepancy sequences.
const AZ=[0,15,-17,29,-31,6,-7,39,-40,22],DEPTH=[0,-.6,.5,.35,-.35,.85,.75,-.85,.2,-.2];
export function placeOf(rank,id,cfg){
  const h=hash(`curtain/${id}`),side=rank%2?1:-1;
  const g=rank<DEPTH.length?DEPTH[rank]:frac(rank*.6180339887+.5)*2-1;
  const az=(rank<AZ.length?AZ[rank]*Math.PI/180:side*(.1+.62*frac(rank*.7548776662+.29)))*cfg.spread,R=MID*Math.exp(.62*g)*Math.sqrt(cfg.spread);
  // the trace leans off east-west, so a curtain sweeps from low on the horizon (its far end) up into the sky (its near
  // end); one to a side turns a little toward facing the shore
  const tilt=(rand(h)<.5?-1:1)*(rank===0?.88+.25*rand(h+4):.15+.38*rand(h+4))+az*.3;
  // (a far curtain's foot stands a little lower, so it rises from behind the far shore's mountains)
  return {R,az,tilt,x:R*Math.sin(az),z:-R*Math.cos(az),dx:Math.cos(tilt),dz:Math.sin(tilt),alt:ALT*(.92+.16*rand(h+1))*(1-.24*Math.max(0,g)),H:HEIGHT*cfg.height*(.86+.28*rand(h+2)),seed:rand(h+3)};
}
// The curtains at moment g: each subsystem with a live file, in order of birth, with its place, its half-length (the
// minimum and its files at the spacing, eased in as they arrive) and its rays: each file's signed place along the trace
// (world units from the centre), how alive it is (0..1), its live symbols, its ray's height (a share of the curtain's)
// and its storm and validated shares.
export function curtainsAt(P,g,cfg){
  const out=[],sp=cfg.sp;
  for(const s of P.subs){
    const nb=s.ancient+rampSum(s.births,g,EASE);if(nb<=1e-4)continue;
    const files=[];let n=0;
    for(const f of s.files){const alive=ramp(g,f.born,EASE)*(1-ramp(g,f.removed,1600));if(alive<=1e-4)continue;
      const sym=Math.max(0,rampSum(f.sb,g,EASE)-rampSum(f.sr,g,EASE));n+=sym;
      const jit=(rand(hash(`ray/${f.id}`))-.5)*.36;
      files.push({id:f.id,s:(f.slot+jit)*sp,alive,n:sym,h:(.4+.6*clamp(Math.log2(1+sym)/5))*alive,born:f.born,
        storm:stormOf(f.stress,g)*alive,valid:share(f.valid,g,2000)*alive});}
    const p=placeOf(s.rank,s.id,cfg),kindle=smooth(Math.min(1,nb));
    let reach=0;for(const f of files)reach=Math.max(reach,Math.abs(f.s));
    const len=Math.max((MINLEN+sp*nb)/2,reach+sp*1.5)*(.55+.45*kindle);
    out.push({id:s.id,rank:s.rank,...p,len,kindle,nb,files,symbols:n});
  }
  return out;
}
// ---- The folds: a curtain's trace bends away from the shore at its ends (an arc of the oval) and folds across itself.
// foldAt is the JS twin of the vertex shader's fold (aurora-glsl.js FOLD), which must agree with it: three folds of the
// sheet (a slow one, a middle one and a fast one whose depth grows with the work's activity), and the ripples the bars
// send along it (u: the place along the curtain, -1 at one end to 1 at the other); they ease toward the ends.
export const BOW=1/16000;
export function foldAt(s,u,h,seed,tv,A,rip,kf=1){
  let d=A[0]*Math.sin(s*.0105+seed*6.2832+tv*.031+h*.0005)+A[1]*Math.sin(s*.029-seed*11.7-tv*.083+h*.0012)+A[2]*Math.sin(s*.071+seed*3.1+tv*.41+h*.0021);
  for(let k=0;k<rip.length;k+=4){const a=rip[k+1];if(!(a>0))continue;const age=tv-rip[k],x=u*rip[k+2]-(-1.3+age*.42);
    d+=a*Math.exp(-x*x/.045)*Math.sin(age*2.6+u*5.)*Math.exp(-age*.32);}
  // the folds ease toward the curtain's ends, so an end never swings toward the shore
  const e=Math.min(1,Math.max(0,(Math.abs(u)-.55)/.45)),taper=1-.6*e*e*(3-2*e);
  return s*s*BOW+kf*d*taper;
}
// A point of a curtain (place p, fold amplitudes A, ripples rip, its fold depth kf) at s along its trace and h along
// the field line.
export function curtainPoint(p,s,h,tv,A,rip,out=[0,0,0],kf=1){
  const d=foldAt(s,s/Math.max(p.len,1),h,p.seed,tv,A,rip,kf),x=p.x+p.dx*s+p.dz*d,z=p.z+p.dz*s-p.dx*d;
  out[0]=x+MAG[0]*h;out[1]=p.alt+MAG[1]*h;out[2]=z+MAG[2]*h;return out;
}
// ---- Field lines: a dependency between two curtains is a long, gentle arc from the importing ray, lifted a little along
// the field, into the imported ray (a cubic Bezier from a point a third of the way up each ray). Its rise is a sixth of
// its span (never a loop: seen from the shore a tall arc between two far curtains reads as a circle in the sky).
export function fieldLine(a,b,ha,hb,n=24,out=[]){
  const P0=[a[0]+MAG[0]*ha,a[1]+MAG[1]*ha,a[2]+MAG[2]*ha],P3=[b[0]+MAG[0]*hb,b[1]+MAG[1]*hb,b[2]+MAG[2]*hb];
  const k=.16*Math.hypot(P3[0]-P0[0],P3[1]-P0[1],P3[2]-P0[2])+30,P1=P0.map((v,i)=>v+MAG[i]*k),P2=P3.map((v,i)=>v+MAG[i]*k);
  out.length=0;for(let j=0;j<=n;j++){const u=j/n,v=1-u;out.push([0,1,2].map(i=>v*v*v*P0[i]+3*v*v*u*P1[i]+3*v*u*u*P2[i]+u*u*u*P3[i]));}
  return out;
}
// ---- The land: seeded value noise for the far mountains, the near shore and the cabin's point ----------------------
function vn1(x,s){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f),a=rand(hash(`${s}/${i}`)),b=rand(hash(`${s}/${i+1}`));return a+(b-a)*u;}
function ridged(x,s,oct){let a=.5,v=0,w=0;for(let k=0;k<oct;k++){const n=1-Math.abs(vn1(x*2**k,`${s}/${k}`)*2-1);v+=a*n*n;w+=a;a*=.5;}return v/w;}
// The far shore: a dark spruce treeline along its foot (a straight shore at SHORE_Z), then mountain layers on arcs
// around the lake, each farther, taller and paler (every point within the camera's far plane). A treeline's samples run
// across x in [-X, X]; a mountain layer's across the azimuth in [-X, X] (radians) at its distance R. Heights above the
// ice; haze 0 near .. 1 far.
export const SHORE_Z=-560,TREE_X=2400,MTN_R=[1000,1450,2000,2650,3400],MTN_A=1.8;
export function mountainLayers(seed,{layers=4,height=1}={}){
  const n=Math.max(2,Math.min(5,Math.round(layers))),out=[];
  {const K=2400,X=TREE_X,ys=new Float32Array(K),s=`${seed}/trees`;
    // spruces every ~4 units, each a spike of its own height and width over a low canopy
    for(let i=0;i<K;i++){const x=-X+2*X*i/(K-1),c=Math.floor(x/4);let y=2.2+2*vn1(x/37,s+'c');
      for(let j=c-1;j<=c+1;j++){const h=hash(`${s}/${j}`),xc=(j+.5+(rand(h)-.5)*.7)*4,ht=(6+8*rand(h+1))*(.7+.5*vn1(j/9,s+'g')),w=1.5+1.4*rand(h+2);
        const k=1-Math.abs(x-xc)/w;if(k>0)y=Math.max(y,ht*Math.pow(k,.75));}
      ys[i]=y;}
    out.push({l:0,tree:true,z:SHORE_Z,X,K,ys,haze:.03});}
  for(let l=1;l<=n;l++){const R=MTN_R[l-1],K=1200,X=MTN_A,ys=new Float32Array(K),s=`${seed}/mtn/${l}`,off=rand(hash(s+'o'))*500;
    const H=height*R*(.058+.022*rand(hash(s)))*(l===1?.85:1),scale=R/(260+70*l);
    for(let i=0;i<K;i++){const a=-X+2*X*i/(K-1);
      // ridges with peaks, a broad swell, now and then a massif standing above its range, and the valley of the lake's
      // outlet kept low in the middle of the nearest layer
      const r=ridged(a*scale+off,s,5),sw=.5+.5*vn1(a*R/(950+320*l)+off,s+'s'),mid=l===1?1-.5*Math.exp(-((a/.42)**2)):1;
      const ms=Math.pow(vn1(a*R/(2300+400*l)+off*1.7,s+'m'),3);
      ys[i]=H*Math.pow(r,1.4)*sw*mid*1.35*(1+.6*ms);}
    out.push({l,tree:false,R,X,K,ys,haze:clamp(.14+.2*(l-1)/Math.max(1,n-1)*1.8,0,.85)});}
  return out;
}
export function profileAt(L,x){const u=(x+L.X)/(2*L.X)*(L.K-1),i=Math.max(0,Math.min(L.K-2,Math.floor(u))),f=clamp(u-i);return L.ys[i]+(L.ys[i+1]-L.ys[i])*f;}
// The near shore and the point the cabin stands on (side: -1 left, 1 right): land height above the ice at (x, z) (the ice
// is at 0; land below it is under the ice). The camera stands on the near bank; the point runs out from the bank on
// the cabin's side toward the cabin, its spine a gentle curve.
export function shoreOf(seed){
  const side=rand(hash(`${seed}/side`))<.5?-1:1,cz=-104-26*rand(hash(`${seed}/cz`)),cx=side*(40+12*rand(hash(`${seed}/cx`)));
  const spine=k=>{const t=clamp(k);return [side*(118-82*t)+side*10*Math.sin(t*3.1),-12-(Math.abs(cz)+12)*t];};
  return {side,cabin:[cx,cz],spine,seed};
}
export function landHeight(S,x,z){
  const s=`${S.seed}/land`;
  // the near bank: the camera stands at the water's edge (the ice begins a few units ahead); to the sides the shore comes
  // forward into the lake a little, its edge wandering
  const edge=3.4-1.6*vn1(x/17,s)-.8*vn1(x/6,s+'e')-.0016*x*x,bank=clamp((z-edge)/5)*(1.1+.5*vn1(x/31,s+'b'))+clamp((z-edge-8)/16)*1.2;
  // the point: a ridge of land around its spine, widest near the bank, the cabin on a knoll near its tip
  let best=1e9,tk=0;for(let k=0;k<=24;k++){const p=S.spine(k/24),d=Math.hypot(x-p[0],z-p[1]);if(d<best){best=d;tk=k/24;}}
  const w=30-14*tk+5*vn1(tk*9+3,s+'w'),pt=clamp(1-best/w)**.8*(2.4+1.4*vn1(tk*6,s+'h'))+1.6*Math.exp(-(((x-S.cabin[0])**2)+((z-S.cabin[1])**2))/220);
  return Math.max(bank,pt)-.35;
}
// Lanterns: the k-th verified milestone's lantern stands at the lake's edge of the point, from near the cabin back toward
// the bank (each later one nearer the shore the camera stands on), a little above the snow.
export function lanternAt(S,k){const t=clamp(.9-.1*k-.02*(k>5?k-5:0),.08,.9),p=S.spine(t),q=S.spine(Math.min(1,t+.02)),tx=q[0]-p[0],tz=q[1]-p[1],L=Math.hypot(tx,tz)||1;
  // the lake's side of the spine: the one facing the middle of the lake (x toward 0)
  let nx=-tz/L,nz=tx/L;if(nx*S.side>0){nx=-nx;nz=-nz;}const w=30-14*t-4;return [p[0]+nx*w*.8,p[1]+nz*w*.8];}
// ---- Meteors: one for each commit, and while nothing happens an occasional one on a lattice of view time (19 s slots, a
// little over a quarter of them). Each: its start (view seconds), its direction across the sky (azimuth, elevation of
// its start, and its heading), its length (radians) and duration (seconds), how bright.
export const METEOR_SLOT=19;
export function meteorOf(key,t0,bright=1){const h=hash(`meteor/${key}`);
  return {t0,az:(rand(h)-.5)*1.5,el:.3+.42*rand(h+1),head:-Math.PI/2+(rand(h+2)-.5)*2.3,len:.12+.2*rand(h+3),dur:.45+.6*rand(h+4),bright};}
export function idleMeteors(seed,tv,span=2){const out=[],k0=Math.floor((tv-span)/METEOR_SLOT),k1=Math.floor(tv/METEOR_SLOT);
  for(let k=k0;k<=k1;k++){const h=hash(`${seed}/sky/${k}`);if(rand(h)>.28)continue;const t0=k*METEOR_SLOT+rand(h+1)*(METEOR_SLOT-2);if(t0<=tv&&tv-t0<span)out.push(meteorOf(`${seed}/${k}`,t0,.55+.5*rand(h+2)));}
  return out;}
// ---- The earned breakup: the first verified milestone, then each at least GAP of performance time after the last that
// earned one (a pure fold over the director's lasting record).
export const BREAKUP_GAP=240000;
export function breakupAllowed(lasting,at){const times=[];for(const l of lasting){if(l.type&&l.type!=='milestone.achieved')continue;for(const x of new Set([l.first,...(l.times||[])]))if(x<=at)times.push(x);}
  times.sort((a,b)=>a-b);let last=-Infinity,ok=false;for(const x of times){const can=x-last>=BREAKUP_GAP;if(can)last=x;if(x===at)ok=can;}return ok;}

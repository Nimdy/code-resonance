// Genesis field: the authoritative simulation of one continuous sheet of matter governed by a project's Lawbook.
// Pure and bounded: a fixed step (DT), fixed memory, no rendering, no clock of its own, no Math.random/Date/performance.
// The step uses only + - * /, sqrt and floor (exp and sin come from the deterministic versions below), so Node and every
// browser reach the same state bit for bit: state hashes are comparable across machines and between real time and
// offline rendering. Design, mappings and limits: docs/worlds/genesis-field.md.
//
// The matter:
//  - a sheet (a disc of material, triangulated in rings) with mass, inertia, stretching and bending stiffness, internal
//    viscosity, self-avoidance and a soft stem at its centre;
//  - a field living in the sheet's material coordinates: one phase per subsystem. Each phase is anchored at its
//    subsystem's seat, competes for territory (sized by the subsystem's files), sharpens its boundaries and diffuses.
//    Phases a dependency couples tolerate each other (their shared boundary intermingles); uncoupled ones exclude;
//  - dependencies also drive currents in the field: a circulation cell along each dependency (an incompressible flow,
//    the curl of a capsule-shaped stream function) that stretches and folds the boundaries it crosses, and a tendon that
//    pulls the two territories toward each other, folding the sheet into an arch or a pleat;
//  - a dependency is a supply line: the territory depended on releases a nutrient into the field, the current carries
//    it, and the dependent territory takes it up where it arrives; what it takes up feeds its growth (it blooms into
//    new folds), so a new dependency changes the matter's shape where its supply lands;
//  - growth: every edge's rest length relaxes toward a target set by the phases under it (each subsystem's growth, more
//    toward the rim, along or across the radius by the anisotropy law, and extra growth on boundaries between phases
//    that do not mix, which raises them as crests). Excess length that has nowhere to go buckles the sheet into folds;
//  - music, at two scales. The vibration of the matter: a bass note strikes its territory, which heaves and rings at the
//    matter's natural frequency (tuned toward the beat by the resonance law) and radiates ripples across the sheet at the
//    speed elasticity sets, hushed by viscosity; a melody note strikes the rim at its pitch's angle; a kick strikes the
//    centre. The slow shape: each territory's resonator (struck by bass and chord tones) swells and shrinks its rest
//    lengths a little (turgor), so its folds breathe. The vibration never pushes the slow shape, so nothing flaps.
export const FIELD_VERSION=2;
export const DT=1/60;
// the music's force gains (pressure per unit of note velocity, per vertex area), calibrated so a strong note moves the
// matter by a few rest lengths: tests/genesis-field.test.js measures the response
export const GAIN={bass:3,attack:40,tap:8,turgor:.08};
const SUB=2,TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x;
const lerp=(a,b,t)=>a+(b-a)*t;
// ---- Deterministic elementary functions (basic IEEE operations only) ----------------------------------------------
export function dexp(x){
  if(x<-700)return 0;if(x>700)x=700;
  const y=x*1.4426950408889634,n=Math.floor(y+.5),f=(y-n)*.6931471805599453;
  const p=1+f*(1+f/2*(1+f/3*(1+f/4*(1+f/5*(1+f/6*(1+f/7*(1+f/8*(1+f/9*(1+f/10*(1+f/11))))))))));
  let s=1,b=n<0?.5:2,m=n<0?-n:n;while(m){if(m&1)s*=b;b*=b;m>>=1;}
  return p*s;
}
export function dsin(x){
  const k=Math.floor(x/(Math.PI/2)+.5),r=x-k*(Math.PI/2),r2=r*r,q=((k%4)+4)%4;
  const s=r*(1-r2/6*(1-r2/20*(1-r2/42*(1-r2/72*(1-r2/110*(1-r2/156*(1-r2/210)))))));
  const c=1-r2/2*(1-r2/12*(1-r2/30*(1-r2/56*(1-r2/90*(1-r2/132*(1-r2/182))))));
  return q===0?s:q===1?c:q===2?-s:-c;
}
export const dcos=x=>dsin(x+Math.PI/2);
// natural logarithm for x > 0: x = m 2^e with m in [sqrt(1/2), sqrt(2)), then 2 atanh((m-1)/(m+1)) as a series
export function dlog(x){
  if(!(x>0))return -Infinity;let e=0;
  while(x>=1.4142135623730951){x/=2;e++;}while(x<.7071067811865476){x*=2;e--;}
  const z=(x-1)/(x+1),z2=z*z;let t=z,s=0;for(let k=1;k<40;k+=2){s+=t/k;t*=z2;}
  return 2*s+e*.6931471805599453;
}
export const dpow=(x,y)=>x<=0?0:dexp(y*dlog(x));
const sq=x=>x*x;
// A seeded stream (integer arithmetic): [0,1).
export function stream(seed){let a=seed>>>0||1;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
// ---- The Lawbook as physics ---------------------------------------------------------------------------------------
// Every law is 0..1 (engine/recipe.js GENOMES.genesis). The ranges are chosen so two identities differ visibly.
export function physicsOf(laws){
  const L=k=>clamp(Number.isFinite(laws?.[k])?laws[k]:.5);
  const c=L('cohesion'),cp=L('coupling'),el=L('elasticity'),co=L('conductivity'),an=L('anisotropy'),re=L('resonance'),vi=L('viscosity'),mo=L('morphogenesis'),st=L('stability'),di=L('dispersion');
  return {
    stretch:lerp(260,520,el),                 // spring stiffness (per unit strain): the sheet's elasticity, its wave speed
    bend:160*dexp(2.4*(c-.5)),                // bending stiffness: cohesion makes broad, smooth folds; little makes frills
    drag:lerp(.25,1.6,vi),                    // viscosity: how quickly motion dies (music rings longer in a fluid world)
    internal:lerp(4,14,vi),                   // internal viscosity along edges
    growth:lerp(.07,.22,mo),                  // how fast rest lengths reach their targets (per second)
    reach:lerp(.55,1.35,mo),                  // how much the most grown matter grows (rest length up to 1 + reach)
    rim:lerp(1.2,3.2,1-c),                    // growth profile: the exponent of radius (high: growth at the rim, ruffles)
    aniso:lerp(-.75,.75,an),                  // growth along (positive) or across (negative) the radius
    crest:lerp(.25,.85,1-cp),                 // extra growth on boundaries between phases that do not mix
    sharp:lerp(2.2,5.5,c),                    // how strongly phases exclude each other (boundary sharpness)
    self:lerp(.8,2.2,c),                      // a phase's affinity for itself: domains form from noise and coarsen
    diffuse:lerp(.0006,.0022,co),             // phase diffusion (material units^2/s): conductivity blurs the boundaries
    mix:lerp(.6,2.4,cp),                      // how much a dependency's phases tolerate each other
    current:lerp(.14,.34,cp),                 // circulation strength along a dependency (material units/s)
    tendon:lerp(160,380,cp),                  // tendon stiffness of a dependency
    supply:lerp(.5,1.1,co),                   // how much nutrient a depended-on territory releases (conductivity)
    uptake:lerp(.9,1.8,co),                   // how readily the dependent territory takes it up
    feed:lerp(.35,.8,mo),                     // how much what it took up grows the matter (morphogenesis)
    blink:lerp(5,11,st),                      // period (s) at which currents alternate (chaotic advection)
    noise:lerp(.06,.012,st),                  // initial roughness of the sheet (stability: a calmer start)
    spread:lerp(.34,.62,di),                  // how far subsystems' seats spread from the centre
    tune:re,                                  // how close the resonators (and the matter's own ring) sit to the beat
    ring:lerp(1.05,2.1,el),                   // the matter's natural frequency (Hz) before the resonance law tunes it
    sound:lerp(16,36,el),                     // the speed of a vibration across the sheet (units/s): elasticity
    hush:lerp(.55,2.1,vi),                    // how fast a vibration dies (1/s): viscosity
    q:lerp(1.6,5,1-vi),                       // resonator quality (cycles to decay)
    pressure:lerp(1.2,2.6,re),                // pressure gain of the music
  };
}
// ---- The sheet ------------------------------------------------------------------------------------------------------
// A disc of R rings: ring k has 6k vertices at radius k (rest edge about 1). Triangles join neighbouring rings by
// angle, so every triangle is close to equilateral and the outline is round.
function disc(R){
  const N=1+3*R*(R+1),mx=new Float64Array(N*2),ring=new Int32Array(N),start=new Int32Array(R+2),off=new Float64Array(R+1);
  let v=1;
  for(let k=1;k<=R;k++){start[k]=v;const n=6*k;off[k]=(k%2)*Math.PI/n;for(let i=0;i<n;i++){const a=TAU*i/n+off[k];mx[2*v]=k*dcos(a);mx[2*v+1]=k*dsin(a);ring[v]=k;v++;}}
  start[R+1]=v;
  const tris=[];
  for(let i=0;i<6;i++)tris.push(0,1+i,1+(i+1)%6);
  for(let k=1;k<R;k++){
    const n1=6*k,n2=6*(k+1),s1=start[k],s2=start[k+1],a=i=>TAU*i/n1+off[k],b=j=>TAU*j/n2+off[k+1];
    let i=0,j=0;
    while(i<n1||j<n2){
      if(j<n2&&(i>=n1||b(j+1)<a(i+1))){tris.push(s1+i%n1,s2+j%n2,s2+(j+1)%n2);j++;}
      else{tris.push(s1+i%n1,s2+j%n2,s1+(i+1)%n1);i++;}
    }
  }
  return {N,mx,ring,tris:Int32Array.from(tris)};
}
function edgesOf(N,tris){
  const keys=[];
  for(let t=0;t<tris.length;t+=3)for(let e=0;e<3;e++){const a=tris[t+e],b=tris[t+(e+1)%3];keys.push(a<b?a*N+b:b*N+a);}
  keys.sort((x,y)=>x-y);
  const out=[];for(let i=0;i<keys.length;i++)if(i===0||keys[i]!==keys[i-1])out.push(Math.floor(keys[i]/N),keys[i]%N);
  return Int32Array.from(out);
}
// ---- Seats: where each subsystem's phase is anchored ---------------------------------------------------------------
// The first subsystem sits at the centre; the others follow by order of birth on a golden spiral, then a few relaxation
// passes pull coupled subsystems toward each other and push all apart (deterministic: a fixed number of passes).
function seatsOf(structure,P,seed){
  const subs=structure.subsystems,K=subs.length,pos=new Float64Array(K*2),r=stream(seed^0x51ed);
  const total=subs.reduce((s,x)=>s+Math.sqrt(x.files),0)||1;
  for(let i=0;i<K;i++){
    if(i===0){pos[0]=0;pos[1]=0;continue;}
    const a=i*2.399963229728653+r()*.4,rad=P.spread*Math.sqrt(i/Math.max(1,K-1))*(.85+.3*r());
    pos[2*i]=rad*dcos(a);pos[2*i+1]=rad*dsin(a);
  }
  const deps=structure.deps||[];
  for(let pass=0;pass<40;pass++){
    const f=new Float64Array(K*2);
    for(let i=0;i<K;i++)for(let j=i+1;j<K;j++){const dx=pos[2*j]-pos[2*i],dy=pos[2*j+1]-pos[2*i+1],d=Math.sqrt(dx*dx+dy*dy)+1e-9;
      const want=.32*(Math.sqrt(subs[i].files)+Math.sqrt(subs[j].files))/Math.sqrt(total)*1.4+.12;
      if(d<want){const k=(want-d)/d*.5;f[2*i]-=dx*k;f[2*i+1]-=dy*k;f[2*j]+=dx*k;f[2*j+1]+=dy*k;}}
    for(const e of deps){const i=subs.findIndex(s=>s.k===e.a),j=subs.findIndex(s=>s.k===e.b);if(i<0||j<0)continue;
      const dx=pos[2*j]-pos[2*i],dy=pos[2*j+1]-pos[2*i+1];f[2*i]+=dx*.02;f[2*i+1]+=dy*.02;f[2*j]-=dx*.02;f[2*j+1]-=dy*.02;}
    for(let i=1;i<K;i++){pos[2*i]+=f[2*i]*.5;pos[2*i+1]+=f[2*i+1]*.5;const d=Math.sqrt(pos[2*i]*pos[2*i]+pos[2*i+1]*pos[2*i+1]),m=.78;if(d>m){pos[2*i]*=m/d;pos[2*i+1]*=m/d;}}
  }
  return pos;
}
// ---- The simulation -------------------------------------------------------------------------------------------------
// laws: the Lawbook; structure: {subsystems:[{k,files,role}], deps:[{a,b,w}]} (k: the subsystem's order of birth);
// seed: the identity's seed; R: rings (resolution; part of the identity of a run, never of the rendering quality).
// boundary: 'stem' (a free sheet held at its centre: the sculpture scale) or 'vault' (the rim held in a ring and the sheet
// gently inflated, so growth buckles it into a vaulted interior a viewer can stand inside: the interior scale).
export function createField({laws,structure,seed=1,R=44,G=72,tempo=92,boundary='stem',inflate=.5}={}){
  const P=physicsOf(laws),rnd=stream(seed);
  const {N,mx,ring,tris}=disc(R),E=edgesOf(N,tris),NE=E.length/2;
  // material coordinates in the unit disc, and per-edge geometry in the material plane
  const xi=new Float64Array(N*2);for(let i=0;i<2*N;i++)xi[i]=mx[i]/R;
  const L0=new Float64Array(NE),L=new Float64Array(NE),Lt=new Float64Array(NE),cos2=new Float64Array(NE);
  for(let e=0;e<NE;e++){const a=E[2*e],b=E[2*e+1],dx=mx[2*b]-mx[2*a],dy=mx[2*b+1]-mx[2*a+1],l=Math.sqrt(dx*dx+dy*dy);L0[e]=l;L[e]=l;Lt[e]=l;
    // the angle between the edge and the radius at its midpoint: cos(2θ) = 2cos²θ - 1
    const cx=(mx[2*a]+mx[2*b])/2,cy=(mx[2*a+1]+mx[2*b+1])/2,cr=Math.sqrt(cx*cx+cy*cy);
    cos2[e]=cr<1e-9?0:2*sq((dx*cx+dy*cy)/(l*cr))-1;}
  // adjacency (CSR) for bending
  const deg=new Int32Array(N);for(let e=0;e<NE;e++){deg[E[2*e]]++;deg[E[2*e+1]]++;}
  const adjStart=new Int32Array(N+1);for(let i=0;i<N;i++)adjStart[i+1]=adjStart[i]+deg[i];
  const adj=new Int32Array(adjStart[N]),fill=adjStart.slice(0,N);
  for(let e=0;e<NE;e++){const a=E[2*e],b=E[2*e+1];adj[fill[a]++]=b;adj[fill[b]++]=a;}
  // state
  const x=new Float64Array(N*3),v=new Float64Array(N*3),f=new Float64Array(N*3),fs=new Float64Array(N*3),n=new Float64Array(N*3),U=new Float64Array(N),area=new Float64Array(N);
  for(let i=0;i<N;i++){const r=ring[i]/R;x[3*i]=mx[2*i];x[3*i+2]=mx[2*i+1];x[3*i+1]=P.noise*R*.05*(rnd()-.5)*r*r;}
  const x0=x.slice(0,3*7),vault=boundary==='vault',rimStart=1+3*(R-1)*R,xRim=x.slice(3*rimStart);
  // in a vault the sheet starts as a shallow dome (so inflation and growth choose up), its rim in the ring
  if(vault)for(let i=0;i<N;i++){const r=ring[i]/R;x[3*i+1]+=R*.08*(1-r*r);}
  // vibration: small elastic displacements along the sheet's normal about its present shape (a damped membrane wave
  // equation with a restoring term), the scale at which the music acts. A struck territory heaves and rings at the
  // matter's natural frequency (tuned toward the beat by the resonance law) and radiates ripples that cross the sheet at
  // the speed elasticity sets; viscosity hushes them. The slow shape (growth, folding) is never pushed by it.
  const vu=new Float64Array(N),vud=new Float64Array(N),vlap=new Float64Array(N),vlen=new Float64Array(N);
  const vibW2=sq(TAU*lerp(P.ring,tempo/60,P.tune*.85));
  // the field: one phase per subsystem on a G x G grid over the material square [-1,1]^2
  const MAXK=12,GG=G*G,h=2/G;
  let subs=[],K=0,seats=new Float64Array(0),target=new Float64Array(0),grow=new Float64Array(0),aniso=new Float64Array(0),born=new Float64Array(0);
  let phi=new Float64Array(0),tmp=new Float64Array(0),src=new Float64Array(0),C=new Float64Array(0);
  // the field lives on the whole square (the disc samples inside it); only the disc counts toward a territory's area
  const inDisc=new Uint8Array(GG);for(let c=0;c<GG;c++){const gx=-1+h*((c%G)+.5),gy=-1+h*(Math.floor(c/G)+.5);inDisc[c]=gx*gx+gy*gy<=1?1:0;}
  let deps=[],ux=new Float64Array(GG),uy=new Float64Array(GG),Ud=[],tendons=[];
  // the flow map: for every cell, where its matter of the field came from (advected with the phases). The view draws
  // fine banding through it, so the currents' stretching and folding is visible at any scale.
  const mapX=new Float64Array(GG),mapY=new Float64Array(GG),mtmp=new Float64Array(GG*2);
  // the supply lines' nutrient in the field, and what the matter has taken up (0..1, it feeds growth)
  const nut=new Float64Array(GG),ntmp=new Float64Array(GG),fed=new Float64Array(GG);
  for(let c=0;c<GG;c++){mapX[c]=-1+h*((c%G)+.5);mapY[c]=-1+h*(Math.floor(c/G)+.5);}
  // per-vertex phase weights and growth drivers (refreshed each step)
  const pv=new Float64Array(N*MAXK),sv=new Float64Array(N),cv=new Float64Array(N),av=new Float64Array(N);
  const tv=new Float64Array(N);
  const rimProf=new Float64Array(N);for(let i=0;i<N;i++)rimProf[i]=dpow(Math.sqrt(xi[2*i]*xi[2*i]+xi[2*i+1]*xi[2*i+1]),P.rim);
  // resonators (one per subsystem)
  const res=new Float64Array(MAXK*2),omega=new Float64Array(MAXK);
  let step=0,time=0;
  const ROLE_GROWTH={core:.75,interface:1.15,services:1,model:.85,logic:1,tests:.7};
  function grid(px,py){const gx=(px+1)/h-.5,gy=(py+1)/h-.5,ix=Math.floor(gx),iy=Math.floor(gy);return [ix,iy,gx-ix,gy-iy];}
  function sample(arr,k,px,py){
    let [ix,iy,fx,fy]=grid(px,py);if(ix<0){ix=0;fx=0;}if(iy<0){iy=0;fy=0;}if(ix>G-2){ix=G-2;fx=1;}if(iy>G-2){iy=G-2;fy=1;}
    const o=k*GG+iy*G+ix;return (arr[o]*(1-fx)+arr[o+1]*fx)*(1-fy)+(arr[o+G]*(1-fx)+arr[o+G+1]*fx)*fy;
  }
  // ---- Structure (an architectural change re-seats nothing that existed: new subsystems get new seats) --------------
  function setStructure(next,{at=time,initial=false}={}){
    const list=(next.subsystems||[]).slice(0,MAXK);
    const old=new Map(subs.map((s,i)=>[s.k,i]));
    const fresh=seatsOf({subsystems:list,deps:next.deps},P,seed);
    const nK=list.length,nseats=new Float64Array(nK*2),nphi=new Float64Array(nK*GG),nborn=new Float64Array(nK);
    for(let i=0;i<nK;i++){
      const j=old.get(list[i].k);
      if(j!==undefined){nseats[2*i]=seats[2*j];nseats[2*i+1]=seats[2*j+1];nborn[i]=born[j];for(let c=0;c<GG;c++)nphi[i*GG+c]=phi[j*GG+c];}
      else{
        nseats[2*i]=fresh[2*i];nseats[2*i+1]=fresh[2*i+1];nborn[i]=initial?-1e9:at;
        // a newborn subsystem: its seat moves to the free side of its coupled neighbours, and its phase starts as a seed
        if(!initial){const cs=[];for(const e of next.deps||[])if(e.a===list[i].k||e.b===list[i].k){const o=e.a===list[i].k?e.b:e.a,oi=list.findIndex(s=>s.k===o);if(oi>=0&&oi!==i)cs.push(oi);}
          if(cs.length){let sx=0,sy=0;for(const oi of cs){sx+=nseats[2*oi];sy+=nseats[2*oi+1];}sx/=cs.length;sy/=cs.length;const d=Math.sqrt(sx*sx+sy*sy)||1,m=Math.min(.8,d+.24);nseats[2*i]=sx/d*m;nseats[2*i+1]=sy/d*m;}}
      }
    }
    const total=list.reduce((s,x)=>s+dpow(Math.max(1,x.files),.75),0)||1;
    subs=list;K=nK;seats=nseats;born=nborn;phi=nphi;tmp=new Float64Array(nK*GG);src=new Float64Array(nK*GG);
    target=new Float64Array(nK);grow=new Float64Array(nK);aniso=new Float64Array(nK);
    for(let i=0;i<K;i++){
      target[i]=dpow(Math.max(1,list[i].files),.75)/total;
      const r=stream(seed^Math.imul(list[i].k+1,0x9E3779B1));
      grow[i]=(ROLE_GROWTH[list[i].role]??1)*(.8+.4*r());
      aniso[i]=P.aniso*(.6+.8*r())*(i%2?1:-.4);
      omega[i]=0;
    }
    // sources: a broad Gaussian at each seat, wide in proportion to the territory it should hold
    for(let i=0;i<K;i++){const w2=Math.max(.012,target[i]*1.1);for(let c=0;c<GG;c++){const gx=-1+h*((c%G)+.5)-seats[2*i],gy=-1+h*(Math.floor(c/G)+.5)-seats[2*i+1];src[i*GG+c]=dexp(-(gx*gx+gy*gy)/w2);}}
    // the initial field: every phase everywhere, unequally (noise), so domains form by themselves
    if(initial)for(let c=0;c<GG;c++){let s=0;for(let i=0;i<K;i++){const v0=.2+rnd()+1.5*src[i*GG+c];phi[i*GG+c]=v0;s+=v0;}for(let i=0;i<K;i++)phi[i*GG+c]/=s;}
    else for(let i=0;i<K;i++)if(nborn[i]===at){for(let c=0;c<GG;c++){const s=src[i*GG+c]*src[i*GG+c]*.9;phi[i*GG+c]=s;for(let j=0;j<K;j++)if(j!==i)phi[j*GG+c]*=1-s;}}
    // coupling matrix (symmetric) and currents
    C=new Float64Array(K*K);
    const idx=new Map(list.map((s,i)=>[s.k,i])),prev=new Map(deps.map(d=>[d.key,d]));deps=[];
    for(const e of next.deps||[]){const a=idx.get(e.a),b=idx.get(e.b);if(a===undefined||b===undefined||a===b)continue;
      const w=Math.min(1,.45+.3*dlog(1+e.w)/.6931471805599453),key=`${Math.min(e.a,e.b)}:${Math.max(e.a,e.b)}`;
      const p=prev.get(key),d=p?{...p,a,b,w:Math.max(p.w,w)}:{key,a,b,w,born:initial?-1e9:at,phase:(hashString(key)%1000)/1000};
      if(!deps.some(x=>x.key===key))deps.push(d);C[a*K+b]=C[b*K+a]=Math.max(C[a*K+b],w);}
    Ud=deps.map(d=>currentOf(d));
    tendons=deps.map(d=>tendonOf(d));
    tuneResonators();
  }
  // a circulation cell along a dependency: u = curl(psi), psi a capsule between the two seats
  function currentOf(d){
    const ax=seats[2*d.a],ay=seats[2*d.a+1],bx=seats[2*d.b],by=seats[2*d.b+1],dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy||1e-9,s2=.022+.18*l2;
    const psi=new Float64Array(GG),u=new Float64Array(GG*2);
    for(let c=0;c<GG;c++){const gx=-1+h*((c%G)+.5),gy=-1+h*(Math.floor(c/G)+.5),t=clamp(((gx-ax)*dx+(gy-ay)*dy)/l2),px=ax+t*dx-gx,py=ay+t*dy-gy;psi[c]=dexp(-(px*px+py*py)/s2);}
    for(let c=0;c<GG;c++){const i=c%G,j=Math.floor(c/G);if(i<1||j<1||i>G-2||j>G-2)continue;
      u[2*c]=(psi[c+G]-psi[c-G])/(2*h)*Math.sqrt(s2);u[2*c+1]=-(psi[c+1]-psi[c-1])/(2*h)*Math.sqrt(s2);}
    u.psi=psi;return u;
  }
  // a tendon between the two territories: the vertices near a point inside each, toward the other
  function tendonOf(d){
    const ax=seats[2*d.a],ay=seats[2*d.a+1],bx=seats[2*d.b],by=seats[2*d.b+1];
    // each end holds a patch of its territory around its seat, as wide as the territory allows (a whole region is drawn)
    const qa=[lerp(ax,bx,.12),lerp(ay,by,.12)],qb=[lerp(bx,ax,.12),lerp(by,ay,.12)];
    const set=(q,k)=>{const rad=clamp(Math.sqrt(target[k])*.42,.06,.16),ids=[],ws=[];for(let i=0;i<N;i++){const dx=xi[2*i]-q[0],dy=xi[2*i+1]-q[1],d2=dx*dx+dy*dy;if(d2<rad*rad){ids.push(i);ws.push(1-d2/(rad*rad));}}
      const s=ws.reduce((a,b)=>a+b,0)||1;return {ids:Int32Array.from(ids),ws:Float64Array.from(ws.map(w=>w/s))};};
    const A=set(qa,d.a),B=set(qb,d.b),cen=s=>{let X=0,Y=0,Z=0;for(let k=0;k<s.ids.length;k++){const i=s.ids[k];X+=x[3*i]*s.ws[k];Y+=x[3*i+1]*s.ws[k];Z+=x[3*i+2]*s.ws[k];}return [X,Y,Z];};
    const ca=cen(A),cb=cen(B),l=Math.sqrt(sq(ca[0]-cb[0])+sq(ca[1]-cb[1])+sq(ca[2]-cb[2]));
    return {A,B,from:l,rest:l,len:l,born:d.born};
  }
  // resonators: each territory rings at its own frequency; the resonance law pulls it toward the beat (tempo / 60 Hz)
  function tuneResonators(){
    const beat=tempo/60;
    for(let i=0;i<K;i++){const own=lerp(1.1,2.6,clamp(1-Math.sqrt(target[i]*K)/2.2)),f=lerp(own,beat*(i%3===2?2:1),P.tune*.85);omega[i]=TAU*f;}
  }
  // ---- One fixed step ---------------------------------------------------------------------------------------------
  // music: {bass:[{k,v}], kick:[v], melody:[{angle,v}]} onsets that fall in this step (from the score), or null.
  function advance(music=null){
    fieldStep();
    sampleField();
    growStep();
    normals();
    // music: strike the resonators and the vibration
    if(music){for(const b of music.bass||[])if(b.k>=0&&b.k<K){res[2*b.k+1]+=b.v*omega[b.k]*.9;
        // the attack: the note's pressure front reaches the territory at once and lifts it as one body (an impulse along
        // the sheet's axis, not each fold's normal, so the folds rise and settle together instead of flipping)
        const imp=GAIN.attack*P.pressure*b.v;for(let i=0;i<N;i++){const w=pv[i*MAXK+b.k];if(w<.15)continue;vud[i]+=imp*w*w;}}
      // a kick: the whole sheet is struck from the centre; a melody note: a small strike on the rim at its pitch's angle
      for(const v0 of music.kick||[])for(let i=0;i<N;i++){const r=xi[2*i]*xi[2*i]+xi[2*i+1]*xi[2*i+1];if(r<.04)vud[i]+=GAIN.attack*P.pressure*v0*(1-r/.04);}
      for(const m of music.melody||[]){const tx=.86*dcos(m.angle),ty=.86*dsin(m.angle);for(let i=0;i<N;i++){const d2=(sq(xi[2*i]-tx)+sq(xi[2*i+1]-ty))/.01;if(d2<4)vud[i]+=GAIN.tap*P.pressure*m.v*dexp(-d2);}}}
    for(let i=0;i<K;i++){const w=omega[i],z=1/(2*P.q),q=res[2*i],qd=res[2*i+1];const acc=-w*w*q-2*z*w*qd;res[2*i+1]=qd+acc*DT;res[2*i]=q+res[2*i+1]*DT;}
    slowForces();
    for(let s=0;s<SUB;s++)fastStep(DT/SUB);
    for(let s=0;s<SUB;s++)vibrate(DT/SUB);
    step++;time=step*DT;
  }
  // the field: reaction (territory competition, mixing of coupled phases), diffusion, then advection by the currents
  function fieldStep(){
    if(!K)return;
    const D=P.diffuse/(h*h),gam=P.sharp,lam=5,cells=new Float64Array(K);
    let discN=0;for(let c=0;c<GG;c++)discN+=inDisc[c];
    for(let i=0;i<K;i++){let s=0;for(let c=0;c<GG;c++)if(inDisc[c])s+=phi[i*GG+c];cells[i]=s/discN;}
    const fit=new Float64Array(K);
    for(let c=0;c<GG;c++){
      const gx=c%G,gy=Math.floor(c/G);
      let fb=0;
      for(let i=0;i<K;i++){
        const o=i*GG;let mixT=0;for(let j=0;j<K;j++)if(j!==i)mixT+=C[i*K+j]*phi[j*GG+c];
        const young=born[i]>-1e8?clamp((time-born[i])/4):1;
        fit[i]=1.6*src[o+c]*(.4+.6*young)+lam*(target[i]-cells[i])/(target[i]+.02)*young+P.mix*mixT+P.self*phi[o+c];
        fb+=phi[o+c]*fit[i];
      }
      for(let i=0;i<K;i++){
        const o=i*GG,p=phi[o+c];
        const l=gx>0?phi[o+c-1]:p,r=gx<G-1?phi[o+c+1]:p,dn=gy>0?phi[o+c-G]:p,up=gy<G-1?phi[o+c+G]:p;
        tmp[o+c]=p+DT*(D*(l+r+dn+up-4*p)+gam*p*(fit[i]-fb));
      }
    }
    // supply lines: each dependency's provider releases nutrient where its phase is; its dependent takes it up where its
    // phase is, and what it takes up accumulates as the matter's feeding (saturating, and slowly spent)
    const ramps=deps.map(D0=>{const age=D0.born>-1e8?time-D0.born:1e9;return clamp(age/3)*(.55+.45*D0.w);});
    for(let c=0;c<GG;c++){
      // released only along the line the current runs (its capsule), so what flows is a stream, not a stain
      let prod=0,upt=0;for(let d=0;d<deps.length;d++){const r=ramps[d];if(r<=0)continue;const q=Ud[d].psi[c];prod+=r*phi[deps[d].b*GG+c]*q*q*q;upt+=r*phi[deps[d].a*GG+c];}
      const n=nut[c],gx=c%G,gy=Math.floor(c/G),l=gx>0?nut[c-1]:n,r=gx<G-1?nut[c+1]:n,dn=gy>0?nut[c-G]:n,up=gy<G-1?nut[c+G]:n;
      const take=P.uptake*upt*n;
      ntmp[c]=Math.max(0,n+DT*(P.supply*prod*(1-n)-take-.22*n+.5*D*(l+r+dn+up-4*n)));
      fed[c]+=DT*(.6*take*(1-fed[c])-.004*fed[c]);
    }
    // currents: each dependency's cell, alternating with the others (a blinking protocol: chaotic advection)
    ux.fill(0);uy.fill(0);let any=false;
    for(let d=0;d<deps.length;d++){
      const D0=deps[d],age=D0.born>-1e8?time-D0.born:1e9,ramp=clamp(age/3)*(.55+.45*D0.w)*P.current;if(ramp<=0)continue;
      const blink=deps.length>1?.25+.75*Math.max(0,dsin(TAU*(time/P.blink+D0.phase))):.7+.3*dsin(TAU*time/P.blink);
      const s=ramp*blink,u=Ud[d];any=true;
      for(let c=0;c<GG;c++){ux[c]+=s*u[2*c];uy[c]+=s*u[2*c+1];}
    }
    for(let c=0;c<GG;c++){
      if(any&&(ux[c]!==0||uy[c]!==0)){
        const px=(c%G)-ux[c]*DT/h,py=Math.floor(c/G)-uy[c]*DT/h;
        let ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;if(ix<0){ix=0;fx=0;}if(iy<0){iy=0;fy=0;}if(ix>G-2){ix=G-2;fx=1;}if(iy>G-2){iy=G-2;fy=1;}
        const o0=iy*G+ix;let s=0;
        mtmp[2*c]=(mapX[o0]*(1-fx)+mapX[o0+1]*fx)*(1-fy)+(mapX[o0+G]*(1-fx)+mapX[o0+G+1]*fx)*fy;
        mtmp[2*c+1]=(mapY[o0]*(1-fx)+mapY[o0+1]*fx)*(1-fy)+(mapY[o0+G]*(1-fx)+mapY[o0+G+1]*fx)*fy;
        nut[c]=(ntmp[o0]*(1-fx)+ntmp[o0+1]*fx)*(1-fy)+(ntmp[o0+G]*(1-fx)+ntmp[o0+G+1]*fx)*fy;
        for(let i=0;i<K;i++){const o=i*GG+o0;let p=(tmp[o]*(1-fx)+tmp[o+1]*fx)*(1-fy)+(tmp[o+G]*(1-fx)+tmp[o+G+1]*fx)*fy;p=p<0?0:p;phi[i*GG+c]=p;s+=p;}
        s=s||1;for(let i=0;i<K;i++)phi[i*GG+c]/=s;
      }else{mtmp[2*c]=mapX[c];mtmp[2*c+1]=mapY[c];nut[c]=ntmp[c];let s=0;for(let i=0;i<K;i++){const p=tmp[i*GG+c]<0?0:tmp[i*GG+c];phi[i*GG+c]=p;s+=p;}s=s||1;for(let i=0;i<K;i++)phi[i*GG+c]/=s;}
    }
    for(let c=0;c<GG;c++){mapX[c]=mtmp[2*c];mapY[c]=mtmp[2*c+1];}
  }
  // phase weights at the vertices, and from them the growth drivers: magnitude, crest (non-mixing boundary), anisotropy
  function sampleField(){
    for(let i=0;i<N;i++){
      const px=xi[2*i],py=xi[2*i+1],r=Math.sqrt(px*px+py*py);
      let s=0,a=0,cr=0;
      for(let k=0;k<K;k++){const w=sample(phi,k,px,py);pv[i*MAXK+k]=w;const young=born[k]>-1e8?clamp((time-born[k])/6):1;s+=w*grow[k]*young;a+=w*aniso[k];}
      for(let k=0;k<K;k++)for(let j=k+1;j<K;j++)cr+=pv[i*MAXK+k]*pv[i*MAXK+j]*(1-clamp(C[k*K+j]));
      const prof=rimProf[i];
      sv[i]=s*(.18+.82*prof)+P.feed*sample(fed,0,px,py);cv[i]=clamp(cr*4);av[i]=a;
    }
  }
  function growStep(){
    const k=P.growth*DT;
    for(let e=0;e<NE;e++){
      const a=E[2*e],b=E[2*e+1],s=(sv[a]+sv[b])/2,cr=(cv[a]+cv[b])/2,an=(av[a]+av[b])/2;
      let g=1+P.reach*s+P.crest*cr+.45*P.reach*an*cos2[e]*s;
      g=clamp(g,.85,1+P.reach+P.crest+P.feed);Lt[e]=L0[e]*g;
      L[e]+=k*(Lt[e]-L[e]);
    }
  }
  // per-vertex normals (area weighted) and areas
  function normals(){
    n.fill(0);area.fill(0);
    for(let t=0;t<tris.length;t+=3){const a=tris[t],b=tris[t+1],c=tris[t+2];
      const e1x=x[3*b]-x[3*a],e1y=x[3*b+1]-x[3*a+1],e1z=x[3*b+2]-x[3*a+2],e2x=x[3*c]-x[3*a],e2y=x[3*c+1]-x[3*a+1],e2z=x[3*c+2]-x[3*a+2];
      // material triangles are counter-clockwise seen from +z of the material plane, which is the sheet's -y side here
      const nx=e1y*e2z-e1z*e2y,ny=e1z*e2x-e1x*e2z,nz=e1x*e2y-e1y*e2x;
      n[3*a]+=nx;n[3*a+1]+=ny;n[3*a+2]+=nz;n[3*b]+=nx;n[3*b+1]+=ny;n[3*b+2]+=nz;n[3*c]+=nx;n[3*c+1]+=ny;n[3*c+2]+=nz;
      const A2=Math.sqrt(nx*nx+ny*ny+nz*nz)/6;area[a]+=A2;area[b]+=A2;area[c]+=A2;}
    for(let i=0;i<N;i++){const l=Math.sqrt(n[3*i]*n[3*i]+n[3*i+1]*n[3*i+1]+n[3*i+2]*n[3*i+2])||1;n[3*i]/=l;n[3*i+1]/=l;n[3*i+2]/=l;}
  }
  // forces held for the whole step: bending, self-avoidance, tendons, the stem, music's pressure
  const head=new Int32Array(1<<16),next=new Int32Array(N);
  function slowForces(){
    fs.fill(0);
    // self-avoidance: vertices closer than hr in space but far apart in the material repel (a hashed grid)
    const hr=1.9,cs=hr,inv=1/cs;head.fill(-1);
    const key=(X,Y,Z)=>((Math.imul(X,73856093)^Math.imul(Y,19349663)^Math.imul(Z,83492791))>>>0)&0xffff;
    for(let i=0;i<N;i++){const k=key(Math.floor(x[3*i]*inv),Math.floor(x[3*i+1]*inv),Math.floor(x[3*i+2]*inv));next[i]=head[k];head[k]=i;}
    const kr=60,far=(4.2/R)*(4.2/R);
    for(let i=0;i<N;i++){
      const X=Math.floor(x[3*i]*inv),Y=Math.floor(x[3*i+1]*inv),Z=Math.floor(x[3*i+2]*inv);
      for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(let oz=-1;oz<=1;oz++){
        for(let j=head[key(X+ox,Y+oy,Z+oz)];j>=0;j=next[j]){
          if(j<=i)continue;
          const dx=x[3*j]-x[3*i],dy=x[3*j+1]-x[3*i+1],dz=x[3*j+2]-x[3*i+2],d2=dx*dx+dy*dy+dz*dz;if(d2>=hr*hr||d2<1e-12)continue;
          const mx2=sq(xi[2*j]-xi[2*i])+sq(xi[2*j+1]-xi[2*i+1]);if(mx2<far)continue;
          const d=Math.sqrt(d2),s=kr*(hr-d)/hr/d;
          fs[3*i]-=dx*s;fs[3*i+1]-=dy*s;fs[3*i+2]-=dz*s;fs[3*j]+=dx*s;fs[3*j+1]+=dy*s;fs[3*j+2]+=dz*s;
        }
      }
    }
    // tendons: each dependency pulls its two territories together (rest length shortens over 5 s to a third)
    for(let d=0;d<tendons.length;d++){
      const T=tendons[d],D0=deps[d],age=T.born>-1e8?time-T.born:1e9;
      T.rest=T.from*lerp(1,.06,clamp(age/4.5));
      const cen=s=>{let X=0,Y=0,Z=0;for(let k=0;k<s.ids.length;k++){const i=s.ids[k];X+=x[3*i]*s.ws[k];Y+=x[3*i+1]*s.ws[k];Z+=x[3*i+2]*s.ws[k];}return [X,Y,Z];};
      const ca=cen(T.A),cb=cen(T.B),dx=cb[0]-ca[0],dy=cb[1]-ca[1],dz=cb[2]-ca[2],l=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-9;T.len=l;
      const F=P.tendon*D0.w*clamp(age/1.5)*(l-T.rest)/l;if(F<=0)continue;
      for(let k=0;k<T.A.ids.length;k++){const i=T.A.ids[k],w=T.A.ws[k]*F;fs[3*i]+=dx*w;fs[3*i+1]+=dy*w;fs[3*i+2]+=dz*w;}
      for(let k=0;k<T.B.ids.length;k++){const i=T.B.ids[k],w=T.B.ws[k]*F;fs[3*i]-=dx*w;fs[3*i+1]-=dy*w;fs[3*i+2]-=dz*w;}
    }
    if(vault){
      // the vault: the rim held in its ring, and a uniform inflation pressure (against the sheet's normal: upward)
      for(let i=rimStart,o=0;i<N;i++,o+=3){fs[3*i]+=(xRim[o]-x[3*i])*200;fs[3*i+1]+=(xRim[o+1]-x[3*i+1])*200;fs[3*i+2]+=(xRim[o+2]-x[3*i+2])*200;}
      for(let i=0;i<rimStart;i++){const s=-inflate*area[i];fs[3*i]+=n[3*i]*s;fs[3*i+1]+=n[3*i+1]*s;fs[3*i+2]+=n[3*i+2]*s;}
    }else{
      // the stem: the centre and its first ring hold their place and orientation
      for(let i=0;i<7;i++){fs[3*i]+=(x0[3*i]-x[3*i])*80;fs[3*i+1]+=(x0[3*i+1]-x[3*i+1])*80;fs[3*i+2]+=(x0[3*i+2]-x[3*i+2])*80;}
    }
    // music on the slow shape: the resonators' pressure over their territories, normal to the sheet
    // turgor: a struck territory's resonator swells and shrinks its matter's rest lengths, so its folds breathe with it
    for(let i=0;i<N;i++){let t=0;for(let k=0;k<K;k++)t+=pv[i*MAXK+k]*res[2*k];tv[i]=GAIN.turgor*P.pressure*t;}
    let anyMusic=false;for(let k=0;k<K;k++)if(res[2*k]!==0)anyMusic=true;
    if(anyMusic){
      const pk=new Float64Array(K);for(let k=0;k<K;k++)pk[k]=res[2*k]*P.pressure*GAIN.bass;
      for(let i=0;i<N;i++){
        let p=0;for(let k=0;k<K;k++)p+=pv[i*MAXK+k]*pk[k];
        const s=p*area[i];fs[3*i]+=n[3*i]*s;fs[3*i+1]+=n[3*i+1]*s;fs[3*i+2]+=n[3*i+2]*s;
      }
    }
  }
  // the stiff part, substepped: bending, stretching and internal viscosity along edges, drag, a soft bounding sphere
  function fastStep(dt){
    f.set(fs);
    // bending: the normal part of the umbrella vector (a discrete mean curvature), and the exact gradient of its square
    for(let i=0;i<N;i++){let sx=0,sy=0,sz=0;const d=adjStart[i+1]-adjStart[i];for(let q=adjStart[i];q<adjStart[i+1];q++){const j=adj[q];sx+=x[3*j];sy+=x[3*j+1];sz+=x[3*j+2];}
      U[i]=ring[i]===R?0:((sx/d-x[3*i])*n[3*i]+(sy/d-x[3*i+1])*n[3*i+1]+(sz/d-x[3*i+2])*n[3*i+2]);}
    for(let i=0;i<N;i++){
      if(ring[i]===R)continue;const d=adjStart[i+1]-adjStart[i],kb=P.bend/(1+.6*(sv[i]*P.reach)),b=U[i]*kb;
      // -dE/dx_i = 2kb (b_i n_i) - sum over neighbours j of (2kb b_i n_i)/deg_i, spread to the neighbours
      f[3*i]+=b*n[3*i];f[3*i+1]+=b*n[3*i+1];f[3*i+2]+=b*n[3*i+2];
      for(let q=adjStart[i];q<adjStart[i+1];q++){const j=adj[q];f[3*j]-=b*n[3*i]/d;f[3*j+1]-=b*n[3*i+1]/d;f[3*j+2]-=b*n[3*i+2]/d;}
    }
    const ks=P.stretch,ci=P.internal;
    for(let e=0;e<NE;e++){
      const a=E[2*e],b=E[2*e+1],dx=x[3*b]-x[3*a],dy=x[3*b+1]-x[3*a+1],dz=x[3*b+2]-x[3*a+2],l=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-9;
      const rv=((v[3*b]-v[3*a])*dx+(v[3*b+1]-v[3*a+1])*dy+(v[3*b+2]-v[3*a+2])*dz)/l;
      const Le=L[e]*(1+.5*(tv[a]+tv[b])),F=(ks*(l-Le)/Le+ci*rv)/l;
      f[3*a]+=dx*F;f[3*a+1]+=dy*F;f[3*a+2]+=dz*F;f[3*b]-=dx*F;f[3*b+1]-=dy*F;f[3*b+2]-=dz*F;
    }
    const drag=1-P.drag*dt,RB=R*2.1;
    for(let i=0;i<N;i++){
      const o=3*i;let fx=f[o],fy=f[o+1],fz=f[o+2];
      const r2=x[o]*x[o]+x[o+1]*x[o+1]+x[o+2]*x[o+2];if(r2>RB*RB){const r=Math.sqrt(r2),s=-40*(r-RB)/r;fx+=x[o]*s;fy+=x[o+1]*s;fz+=x[o+2]*s;}
      let vx=(v[o]+fx*dt)*drag,vy=(v[o+1]+fy*dt)*drag,vz=(v[o+2]+fz*dt)*drag;
      const sp=vx*vx+vy*vy+vz*vz;if(sp>900){const s=30/Math.sqrt(sp);vx*=s;vy*=s;vz*=s;}
      v[o]=vx;v[o+1]=vy;v[o+2]=vz;x[o]+=vx*dt;x[o+1]+=vy*dt;x[o+2]+=vz*dt;
    }
  }
  function vibrate(dt){
    vlen.fill(0);vlap.fill(0);
    for(let e=0;e<NE;e++){const a=E[2*e],b=E[2*e+1];vlen[a]+=L[e];vlen[b]+=L[e];vlap[a]+=vu[b];vlap[b]+=vu[a];}
    const c2=P.sound*P.sound,g=2*P.hush;
    for(let i=0;i<N;i++){const d=adjStart[i+1]-adjStart[i],l=vlen[i]/d,lap=4*(vlap[i]/d-vu[i])/(l*l);
      // the rim is free: its vibration reflects
      vud[i]+=dt*(c2*lap-g*vud[i]-vibW2*vu[i]);}
    for(let i=0;i<N;i++)vu[i]+=dt*vud[i];
  }
  // ---- Read-outs ------------------------------------------------------------------------------------------------------
  // The authoritative state's hash: positions, velocities, rest lengths, the field and the resonators (exact bits).
  function hashState(){
    let h1=2166136261,h2=0x9747b28c;
    const eat=arr=>{const b=new Uint32Array(arr.buffer,arr.byteOffset,arr.byteLength/4);for(let i=0;i<b.length;i++){h1=Math.imul(h1^b[i],16777619);h2=Math.imul(h2^(b[i]>>>16|b[i]<<16),0x5bd1e995)^(h2>>>13);}};
    eat(x);eat(v);eat(L);eat(phi);eat(res);eat(mapX);eat(mapY);eat(nut);eat(fed);eat(vu);eat(vud);
    return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }
  function metrics(){
    let ext=0,mean=0,comp=0,cx=0,cy=0,cz=0;for(let i=0;i<N;i++){cx+=x[3*i];cy+=x[3*i+1];cz+=x[3*i+2];}cx/=N;cy/=N;cz/=N;
    for(let i=0;i<N;i++){const r=Math.sqrt(sq(x[3*i]-cx)+sq(x[3*i+1]-cy)+sq(x[3*i+2]-cz));if(r>ext)ext=r;}
    for(let e=0;e<NE;e++){mean+=L[e]/L0[e];const a=E[2*e],b=E[2*e+1],l=Math.sqrt(sq(x[3*b]-x[3*a])+sq(x[3*b+1]-x[3*a+1])+sq(x[3*b+2]-x[3*a+2]));if(l<L[e]*.9)comp++;}
    let ke=0;for(let i=0;i<3*N;i++)ke+=v[i]*v[i];
    let ys=0;for(let i=0;i<N;i++)ys+=Math.abs(x[3*i+1]);
    return {growth:mean/NE,compressed:comp/NE,extent:ext,kinetic:ke/N,relief:ys/N};
  }
  setStructure(structure,{initial:true});
  normals();
  return {N,NE,R,G,boundary,K:()=>K,MAXK,tris,edges:E,xi,x,v,n,L,L0,pv,sv,cv,phi:()=>phi,seats:()=>seats,subs:()=>subs,coupling:()=>C,res,omega,physics:P,
    get step(){return step;},get time(){return time;},
    advance,setStructure,hash:hashState,metrics,
    // current flow on the grid (for rendering streaks) and the tendons' state
    flow:()=>({ux,uy,mapX,mapY,nut,fed}),vibration:vu,tendons:()=>tendons.map((t,i)=>({rest:t.rest,from:t.from,len:t.len,born:t.born,a:deps[i].a,b:deps[i].b})),
  };
}

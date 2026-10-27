// Digital life: one fixed-step ecosystem of autonomous entities and the shared fields they read and write. Pure (no
// rendering, no DOM), so the scientific properties are tested in Node (tests/life-sim.test.js).
//
// Layers (docs/LIFE.md):
//  A entities   persistent state per slot: position, velocity, inertia (mass), energy, age and lifetime, behavioural
//               mode, a target site, a stable identity (slot + generation) and a seed; steered by bounded forces;
//  B fields     2D grids over the ground plane (x, z): trail, energy, disturbance and a flow vector (momentum), plus a
//               density grid rebuilt every tick; bilinear sampling, central-difference gradients;
//  C feedback   entities deposit trail, energy and momentum where they are; the fields diffuse, decay, saturate and
//               (trail) drift with the flow; the next tick every entity samples them again;
//  D grammar    a world supplies species (numbers), relations between species, its macro current, spawning, sites
//               (habitat) and optional hooks (extra steering, boundaries, mode decisions);
//  E influences canonical events become bounded field deposits and site conditions; the musical climate sets slowly
//               relaxing conditions (current, turbulence, cohesion, activity). Neither ever places an entity.
//
// Ecology 2 (params.ecology === 2; docs/LIFE.md "Ecology v2"): the climate has more conditions (gather: the group size a
// place carries; explore: curiosity and migration; persist: how long trails and energy last; glow: the environment's
// light, read by presentation; pulse: rhythmic drive; shiftX/shiftZ: a slowly turning attractor that changes which
// sites appeal, by their direction from the habitat's centre), each relaxing at its own pace, and every species feels
// them through its own response weights (spec.respond: an exponent per condition). The performance clock's beat grid
// (setGrid) is an input like the climate. Ecology 1 is the code path as it was, bit for bit.
//
// Determinism: the state after tick k is a pure function of the configuration, the seed and the inputs applied before
// each tick (events, sites, climate). Random choices come from a counter-based hash of (seed, slot, generation, tick),
// never Math.random; state is stored in typed arrays, iterated in a fixed order; accelerations are computed from the
// state before the tick (double-buffered), then integrated. Snapshots copy every array: restore gives back exactly the
// same future.
export const SIM_VERSION=1;
export const HZ=20,DT=1/HZ;
export const MODE={explore:0,seek:1,orbit:2,disperse:3,rest:4,settle:5,route:6};
export const MODE_NAMES=['explore','seek','orbit','disperse','rest','settle','route'];
export const CH={trail:0,energy:1,disturb:2,flowX:3,flowZ:4};
const CHANNELS=5;
export const MAX_SITES=64;
const TRAIL_EVERY=3;           // a trail point every 3 ticks (0.15 s)
// The climate's conditions (neutral values): ecology 1's, and those ecology 2 adds.
export const COND1=Object.freeze({current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0});
export const COND2=Object.freeze({gather:1,explore:1,persist:1,glow:1,pulse:0,shiftX:0,shiftZ:0});
// Ecology 2: how fast each condition follows the climate (seconds): activity and light answer within a few seconds
// (the light breathes in with a passage, never on the bar), the attractor and the fields' memory turn over a passage.
// (Ecology 1: all of them six seconds.)
const TAU2={current:5,turb:4,cohesion:6,activity:3.5,attract:8,swing:9,gather:7,explore:4,persist:10,glow:3.5,pulse:1.5,shiftX:9,shiftZ:9};
const KC2=Object.fromEntries(Object.entries(TAU2).map(([k,t])=>[k,1-Math.exp(-DT/t)]));
// The conditions a species feels through its response weights (ecology 2).
const FELT=['current','turb','cohesion','activity','attract','gather','explore'];
// ---- Deterministic randomness -----------------------------------------------------------------------------------------
export function mix(a,b,c=0,d=0){
  let h=(a^Math.imul(b|0,0x9e3779b1)^Math.imul(c|0,0x85ebca77)^Math.imul(d|0,0xc2b2ae3d))>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;return h>>>0;
}
export const u01=(a,b,c,d)=>mix(a,b,c,d)/4294967296;
const len2=(x,z)=>Math.sqrt(x*x+z*z),len3=(x,y,z)=>Math.sqrt(x*x+y*y+z*z);
// ---- Species defaults (a grammar overrides what its species need) ----------------------------------------------------
export const SPECIES_DEFAULTS=Object.freeze({
  name:'entity',share:1,
  radius:1.2,sepRadius:.45,          // awareness and personal space (world units)
  maxSpeed:1.2,minSpeed:.08,maxForce:2.4,mass:1,drag:.12,
  sep:1.6,ali:.5,coh:.35,            // separation, alignment, cohesion (neighbours of the same species)
  seek:1.2,orbit:1.4,orbitRadius:1,orbitSpeed:.55,orbitJitter:.35,orbitBand:.4,
  curiosity:.012,                    // chance per tick that an explorer chooses a site
  trail:.9,deposit:.04,carryDeposit:.08,energyDeposit:.02,
  flow:.4,push:.04,avoid:2,wander:.5,wanderJitter:.35,
  crowd:14,                          // neighbours at which a gathering disperses
  satiate:.006,metabolism:.0006,restBelow:.12,restRecover:.002,
  disturbBelow:.35,                  // disturbance above which an entity flees
  settle:0,settleFlow:.6,            // settling: chance per tick to settle where the flow is slow; dislodged above settleFlow
  life:[90,300],fade:2.5,respawn:[1,6],
  yMin:-1e9,yMax:1e9,yHold:0,yRest:0,
  congestion:0,congestionAbove:6,    // disturbance deposited where density exceeds congestionAbove
  routes:0,                          // >0: the grammar's route hook steers this species (mode route)
  perceive:true                      // false: no neighbour perception at all (a species steered by its own rules)
});
export function createEcosystem(spec){
  const seed=spec.seed>>>0,cap=Math.max(1,spec.capacity|0);
  const species=spec.species.map(s=>Object.freeze({...SPECIES_DEFAULTS,...s}));
  const NS=species.length;
  const rel=spec.relations||[];   // rel[a][b] = {avoid, chase, radius}
  const relAvoid=new Float64Array(NS*NS),relChase=new Float64Array(NS*NS),relR=new Float64Array(NS*NS);
  for(let a=0;a<NS;a++)for(let b=0;b<NS;b++){const r=rel[a]?.[b];relAvoid[a*NS+b]=r?.avoid||0;relChase[a*NS+b]=r?.chase||0;relR[a*NS+b]=r?.radius||species[a].radius;}
  const B=spec.bounds,minX=B.min[0],minY=B.min[1],minZ=B.min[2],maxX=B.max[0],maxY=B.max[1],maxZ=B.max[2];
  const hooks=spec.hooks||{};
  const siteSlots=(spec.siteSlots||[]).filter(o=>o===0||o===1);   // which grammar int-scratch slots hold site indices
  // ---- Entity state (structure of arrays) ---------------------------------------------------------------------------
  const px=new Float32Array(cap),py=new Float32Array(cap),pz=new Float32Array(cap);
  const vx=new Float32Array(cap),vy=new Float32Array(cap),vz=new Float32Array(cap);
  const qx=new Float32Array(cap),qy=new Float32Array(cap),qz=new Float32Array(cap);   // positions at the previous tick
  const en=new Float32Array(cap),age=new Float32Array(cap),life=new Float32Array(cap),fade=new Float32Array(cap);
  const wa=new Float32Array(cap),wb=new Float32Array(cap),wv=new Float32Array(cap*3);     // wander heading (yaw, pitch) and its vector
  const fa=new Float32Array(cap*2);                                                   // grammar scratch (floats)
  const sp=new Uint8Array(cap),mode=new Uint8Array(cap),alive=new Uint8Array(cap);
  const modeT=new Uint32Array(cap),gen=new Uint32Array(cap),carry=new Uint16Array(cap);
  const tgt=new Int16Array(cap),ia=new Int32Array(cap*2);                             // target site; grammar scratch (ints)
  const dead=new Uint32Array(cap);                                                    // tick at which a free slot may respawn
  // Trails: K points per entity, sampled every TRAIL_EVERY ticks into a ring shared by all (one head index).
  const K=Math.max(2,spec.trail|0||8);
  const tx=new Float32Array(cap*K),ty=new Float32Array(cap*K),tz=new Float32Array(cap*K);
  // ---- Fields ---------------------------------------------------------------------------------------------------------
  const F=spec.field||{},NX=F.nx||48,NZ=F.nz||48,FX0=F.min?.[0]??minX,FZ0=F.min?.[1]??minZ,FX1=F.max?.[0]??maxX,FZ1=F.max?.[1]??maxZ;
  const cw=(FX1-FX0)/NX,ch=(FZ1-FZ0)/NZ,NC=NX*NZ;
  const field=new Float32Array(NC*CHANNELS),scratch=new Float32Array(NC),density=new Float32Array(NC);
  const decay={trail:.985,energy:.99,disturb:.985,flow:.97,...F.decay},diffuse={trail:.12,energy:.08,disturb:.1,flow:.15,...F.diffuse};
  const saturate={trail:4,energy:4,disturb:4,flow:3,...F.saturate},advect=F.advect??.6;
  // ---- Sites (habitat) and their conditions ------------------------------------------------------------------------
  // Positions come from the world (spec.habitat updates); conditions are state, kept per site id across updates.
  const sx=new Float32Array(MAX_SITES),sy=new Float32Array(MAX_SITES),sz=new Float32Array(MAX_SITES),sr=new Float32Array(MAX_SITES),sw=new Float32Array(MAX_SITES);
  const sKind=new Uint8Array(MAX_SITES);let nSites=0,siteIds=[];
  let siteState=new Map();   // id -> {novelty, stress, lasting, nourish, visits, swirl}
  const visits=new Float32Array(MAX_SITES),visitsNow=new Uint16Array(MAX_SITES);
  // ---- Conditions (climate and engineering), relaxing toward their targets -----------------------------------------
  // Behaviour scales from the recipe (life parameters): fixed for a configuration.
  const P={density:1,vitality:1,collective:1,environment:1,trails:1,music:1,attraction:1,repulsion:1,separation:1,alignment:1,cohesion:1,current:1,persistence:1,diffusion:1,radius:1,...spec.params};
  const ECO2=P.ecology===2;
  let cond=ECO2?{...COND1,...COND2}:{current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0};let target={...cond};
  // Ecology 2: the beat grid of the performance clock at the state's time (beat: beats since the clock's zero; per:
  // beats per tick), set by the driver with the climate (a pure function of the time, carried by snapshots).
  let grid={beat:0,per:0};
  const decayK=x=>Math.pow(x,1/Math.max(.25,P.persistence));
  let dTrail=decayK(decay.trail),dEnergy=decayK(decay.energy);const dDisturb=decayK(decay.disturb),dFlow=decay.flow;
  let tick=0;
  // Population targets per species (bounded by capacity shares).
  const quota=new Int32Array(NS);{let used=0;species.forEach((s,k)=>{quota[k]=k===NS-1?cap-used:Math.floor(cap*s.share);used+=quota[k];});}
  const slotSpecies=new Uint8Array(cap);{let k=0,left=quota[0];for(let i=0;i<cap;i++){while(left<=0&&k<NS-1){k++;left=quota[k];}slotSpecies[i]=k;left--;}}
  const activeQuota=k=>Math.round(quota[k]*Math.max(0,Math.min(1,(spec.activeShare?.[k]??1)*P.density)));
  // ---- Ecology 2: the conditions as each species feels them, the attractor per site, the fields' memory ------------
  // felt[c][k]: condition FELT[c] as species k feels it (its response weight is an exponent: neutral stays neutral).
  const RW=FELT.map(c=>Float64Array.from(species,s=>Number.isFinite(s.respond?.[c])?s.respond[c]:1));
  const felt=FELT.map(()=>new Float64Array(NS)),F_CUR=0,F_TURB=1,F_COH=2,F_ACT=3,F_GATH=5,F_EXPL=6;
  const sux=new Float32Array(MAX_SITES),suz=new Float32Array(MAX_SITES);let persistAt=1;
  function feel(){
    for(let c=0;c<FELT.length;c++){const v=cond[FELT[c]],w=RW[c],o=felt[c];for(let k=0;k<NS;k++)o[k]=w[k]===1?v:Math.pow(v,w[k]);}
    // A site's direction from the habitat's centre, as a share of the habitat's reach: the turning attractor moves
    // the appeal of the sites at its edge the most and of one at its centre hardly at all.
    let cx=0,cz=0;for(let k=0;k<nSites;k++){cx+=sx[k];cz+=sz[k];}if(nSites){cx/=nSites;cz/=nSites;}
    let R=1;for(let k=0;k<nSites;k++)R=Math.max(R,len2(sx[k]-cx,sz[k]-cz));
    for(let k=0;k<nSites;k++){sux[k]=(sx[k]-cx)/R;suz[k]=(sz[k]-cz)/R;}
    // Sustained passages keep trails and energy longer (scaled by the life value `persistence` as before).
    if(cond.persist!==persistAt){persistAt=cond.persist;const pk=x=>Math.pow(x,1/Math.max(.25,P.persistence*persistAt));dTrail=pk(decay.trail);dEnergy=pk(decay.energy);}
  }
  // How the turning attractor changes site k's appeal (1: not at all; always 1 in ecology 1).
  const shiftOf=k=>ECO2&&k>=0&&k<nSites?Math.max(.1,1+cond.shiftX*sux[k]+cond.shiftZ*suz[k]):1;
  const feltOf=(k,c)=>{const j=FELT.indexOf(c);return ECO2&&j>=0?felt[j][k]:cond[c]??1;};
  if(ECO2)feel();
  // ---- Uniform grid over the bounds (counting sort; neighbours are found in the 27 cells around) -------------------
  let cell=0;for(const s of species)cell=Math.max(cell,s.radius*P.radius);cell=Math.max(.05,cell);
  const GX=Math.max(1,Math.ceil((maxX-minX)/cell)),GY=Math.max(1,Math.ceil((maxY-minY)/cell)),GZ=Math.max(1,Math.ceil((maxZ-minZ)/cell)),TB=GX*GY*GZ;
  const cellOf=new Int32Array(cap),cnt=new Int32Array(TB+1),order=new Int32Array(cap),fill=new Int32Array(TB);
  const cix=new Int32Array(cap),ciy=new Int32Array(cap),ciz=new Int32Array(cap);
  const gi=(v,lo,n)=>{const k=Math.floor((v-lo)/cell);return k<0?0:k>=n?n-1:k;};
  function buildGrid(){
    cnt.fill(0);
    for(let i=0;i<cap;i++){if(!alive[i]){cellOf[i]=-1;continue;}const x=gi(px[i],minX,GX),y=gi(py[i],minY,GY),z=gi(pz[i],minZ,GZ);cix[i]=x;ciy[i]=y;ciz[i]=z;const k=x+GX*(y+GY*z);cellOf[i]=k;cnt[k+1]++;}
    for(let k=0;k<TB;k++)cnt[k+1]+=cnt[k];
    fill.fill(0);for(let i=0;i<cap;i++){const k=cellOf[i];if(k<0)continue;order[cnt[k]+fill[k]++]=i;}
  }
  // ---- Field helpers ----------------------------------------------------------------------------------------------
  const gxOf=x=>(x-FX0)/cw-.5,gzOf=z=>(z-FZ0)/ch-.5;
  function sample(c,x,z){
    let gx=gxOf(x),gz=gzOf(z);gx=gx<0?0:gx>NX-1.001?NX-1.001:gx;gz=gz<0?0:gz>NZ-1.001?NZ-1.001:gz;
    const i=gx|0,j=gz|0,u=gx-i,v=gz-j,o=c*NC+j*NX+i;
    return (field[o]*(1-u)+field[o+1]*u)*(1-v)+(field[o+NX]*(1-u)+field[o+NX+1]*u)*v;
  }
  const grad=[0,0];
  function gradient(c,x,z){const e=Math.min(cw,ch);grad[0]=(sample(c,x+e,z)-sample(c,x-e,z))/(2*e);grad[1]=(sample(c,x,z+e)-sample(c,x,z-e))/(2*e);return grad;}
  // Per tick, at cell centres: the trail and disturbance gradients and the total flow (macro current + momentum).
  // Entities read them bilinearly (one lookup instead of a hook call and four samples each).
  const D_TGX=0,D_TGZ=1,D_DGX=2,D_DGZ=3,D_FX=4,D_FZ=5,D_FY=6,DN=7,derived=new Float32Array(NC*DN);
  function derive(){
    const T=CH.trail*NC,Dd=CH.disturb*NC,out=[0,0,0],k=cond.current*P.current,t=tick*DT;
    for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const q=j*NX+i,l=i>0?q-1:q,r=i<NX-1?q+1:q,u=j>0?q-NX:q,d=j<NZ-1?q+NX:q,sx2=(r-l)*cw||1,sz2=(d-u)/NX*ch||1;
      derived[D_TGX*NC+q]=(field[T+r]-field[T+l])/sx2;derived[D_TGZ*NC+q]=(field[T+d]-field[T+u])/sz2;
      derived[D_DGX*NC+q]=(field[Dd+r]-field[Dd+l])/sx2;derived[D_DGZ*NC+q]=(field[Dd+d]-field[Dd+u])/sz2;
      out[0]=0;out[1]=0;out[2]=0;if(hooks.current)hooks.current(FX0+(i+.5)*cw,0,FZ0+(j+.5)*ch,t,cond,out);
      derived[D_FX*NC+q]=out[0]*k+field[CH.flowX*NC+q];derived[D_FZ*NC+q]=out[2]*k+field[CH.flowZ*NC+q];derived[D_FY*NC+q]=out[1]*k;}
  }
  // Bilinear lookup of a derived channel (cell-centred).
  let lu=0,lv=0,lo=0;
  function locate(x,z){let gx=gxOf(x),gz=gzOf(z);gx=gx<0?0:gx>NX-1.001?NX-1.001:gx;gz=gz<0?0:gz>NZ-1.001?NZ-1.001:gz;const i=gx|0,j=gz|0;lu=gx-i;lv=gz-j;lo=j*NX+i;}
  function at(c){const o=c*NC+lo;return (derived[o]*(1-lu)+derived[o+1]*lu)*(1-lv)+(derived[o+NX]*(1-lu)+derived[o+NX+1]*lu)*lv;}
  function atField(c){const o=c*NC+lo;return (field[o]*(1-lu)+field[o+1]*lu)*(1-lv)+(field[o+NX]*(1-lu)+field[o+NX+1]*lu)*lv;}
  function splat(c,x,z,a){
    const gx=gxOf(x),gz=gzOf(z);if(gx<0||gz<0||gx>NX-1||gz>NZ-1)return;
    const i=gx|0,j=gz|0,u=gx-i,v=gz-j,o=c*NC+j*NX+i;
    field[o]+=a*(1-u)*(1-v);field[o+1]+=a*u*(1-v);field[o+NX]+=a*(1-u)*v;field[o+NX+1]+=a*u*v;
  }
  // A disc deposit (influences): amount at the centre, falling off smoothly to the radius.
  function disc(c,x,z,r,a){
    const i0=Math.max(0,Math.floor(gxOf(x-r))),i1=Math.min(NX-1,Math.ceil(gxOf(x+r))),j0=Math.max(0,Math.floor(gzOf(z-r))),j1=Math.min(NZ-1,Math.ceil(gzOf(z+r)));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const cx=FX0+(i+.5)*cw,cz=FZ0+(j+.5)*ch,d=len2(cx-x,cz-z)/r;if(d>=1)continue;const w=(1-d*d);field[c*NC+j*NX+i]+=a*w*w;}
  }
  // A vortex deposit into the flow (refactors reorganise the current around a site).
  function swirl(x,z,r,a){
    const i0=Math.max(0,Math.floor(gxOf(x-r))),i1=Math.min(NX-1,Math.ceil(gxOf(x+r))),j0=Math.max(0,Math.floor(gzOf(z-r))),j1=Math.min(NZ-1,Math.ceil(gzOf(z+r)));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const cx=FX0+(i+.5)*cw-x,cz=FZ0+(j+.5)*ch-z,d=len2(cx,cz)/r;if(d>=1||d<1e-3)continue;const w=(1-d)*a/(d*r);
      field[CH.flowX*NC+j*NX+i]+=-cz*w;field[CH.flowZ*NC+j*NX+i]+=cx*w;}
  }
  function line(c,x0,z0,x1,z1,a,width){const L=len2(x1-x0,z1-z0),n=Math.max(2,Math.ceil(L/Math.min(cw,ch)));for(let k=0;k<=n;k++){const u=k/n;disc(c,x0+(x1-x0)*u,z0+(z1-z0)*u,width,a/n*4);}}
  function evolve(){
    const lam=[dTrail,dEnergy,dDisturb,dFlow,dFlow],dif=[diffuse.trail,diffuse.energy,diffuse.disturb,diffuse.flow,diffuse.flow],sat=[saturate.trail,saturate.energy,saturate.disturb,saturate.flow,saturate.flow];
    const dk=Math.max(0,Math.min(2.4,P.diffusion));
    for(let c=0;c<CHANNELS;c++){
      const o=c*NC,k=Math.min(.24,dif[c]*dk),l=lam[c],s=sat[c];
      for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const q=o+j*NX+i,v=field[q];
        const L=(i>0?field[q-1]:v)+(i<NX-1?field[q+1]:v)+(j>0?field[q-NX]:v)+(j<NZ-1?field[q+NX]:v)-4*v;
        let x=(v+k*L)*l;x=c>=CH.flowX?(x>s?s:x<-s?-s:x):(x>s?s:x<0?0:x);scratch[j*NX+i]=x;}
      field.set(scratch,o);
    }
    // The trail drifts with the current (semi-Lagrangian, bounded: values are interpolated, never created).
    if(advect>0){const o=CH.trail*NC;
      for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const q=j*NX+i,x=FX0+(i+.5)*cw,z=FZ0+(j+.5)*ch;
        scratch[q]=sample(CH.trail,x-derived[D_FX*NC+q]*DT*advect,z-derived[D_FZ*NC+q]*DT*advect);}
      field.set(scratch,o);}
  }
  // The flow at a point: the world's macro current (scaled by the climate) plus the momentum the populations left.
  const macro=[0,0,0];
  function flowAt(x,y,z,out){locate(x,z);out[0]=at(D_FX);out[1]=at(D_FY);out[2]=at(D_FZ);return out;}
  // ---- Lifecycle ----------------------------------------------------------------------------------------------------
  function spawn(i){
    const k=slotSpecies[i],s=species[k];gen[i]++;const g=gen[i],r=n=>u01(seed,i,g,n);
    sp[i]=k;alive[i]=1;mode[i]=s.routes?MODE.route:MODE.explore;modeT[i]=0;tgt[i]=-1;carry[i]=0;en[i]=.4+.5*r(1);age[i]=0;
    life[i]=Math.round((s.life[0]+(s.life[1]-s.life[0])*r(2))*HZ);fade[i]=0;wa[i]=r(3)*6.2832;wb[i]=(r(4)-.5)*.6;fa[i*2]=r(5);fa[i*2+1]=r(6);ia[i*2]=-1;ia[i*2+1]=-1;
    const out=[0,0,0];
    if(hooks.spawn)hooks.spawn(api,i,k,r,out);
    else if(nSites&&r(7)<.6){const q=Math.floor(r(8)*nSites)%nSites,a=r(9)*6.2832,d=sr[q]*(1+r(10)*2);out[0]=sx[q]+Math.cos(a)*d;out[1]=sy[q]+(r(11)-.5)*sr[q];out[2]=sz[q]+Math.sin(a)*d;}
    else{out[0]=minX+(maxX-minX)*r(8);out[1]=minY+(maxY-minY)*r(9);out[2]=minZ+(maxZ-minZ)*r(10);}
    px[i]=qx[i]=out[0];py[i]=qy[i]=Math.max(s.yMin,Math.min(s.yMax,out[1]));pz[i]=qz[i]=out[2];
    const a=wa[i],sp0=s.maxSpeed*.3;vx[i]=Math.cos(a)*sp0;vy[i]=0;vz[i]=Math.sin(a)*sp0;
    for(let k2=0;k2<K;k2++){tx[i*K+k2]=px[i];ty[i*K+k2]=py[i];tz[i*K+k2]=pz[i];}
  }
  // The first population: each species fills its active quota, deterministically. `at`: the tick it is born at (a
  // live ecosystem started later than its session's origin; 0 otherwise).
  function populate(at=0){tick=Math.max(0,at|0);for(let i=0;i<cap;i++){alive[i]=0;gen[i]=0;dead[i]=0;}
    const want=new Int32Array(NS);for(let k=0;k<NS;k++)want[k]=activeQuota(k);
    for(let i=0;i<cap;i++){const k=slotSpecies[i];if(want[k]>0){spawn(i);want[k]--;age[i]=Math.floor(u01(seed,i,0,12)*life[i]*.8);fade[i]=1;}}}
  // ---- Sites --------------------------------------------------------------------------------------------------------
  // Data a grammar derives from the same structure as the sites (a navigation network, say): supplied by the driver
  // with every habitat and again after a restore, so it is never a cache the grammar must keep in step itself.
  let siteData=null;
  function setSiteData(d){siteData=d??null;}
  function setSites(list){
    // list: [{id, x, y, z, r, w, kind}] sorted by the world; at most MAX_SITES (the strongest kept).
    const sorted=list.slice().sort((a,b)=>(b.w-a.w)||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,MAX_SITES).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const prev=new Map(siteIds.map((id,k)=>[id,k])),remap=new Int16Array(MAX_SITES).fill(-1);
    siteIds=sorted.map(s=>s.id);nSites=sorted.length;
    sorted.forEach((s,k)=>{sx[k]=s.x;sy[k]=s.y;sz[k]=s.z;sr[k]=Math.max(.05,s.r);sw[k]=s.w;sKind[k]=s.kind|0;const p=prev.get(s.id);if(p!==undefined)remap[p]=k;
      if(!siteState.has(s.id))siteState.set(s.id,{novelty:0,stress:0,lasting:0,nourish:0,swirl:0});});
    const old=visits.slice();visits.fill(0);for(let p=0;p<MAX_SITES;p++)if(remap[p]>=0)visits[remap[p]]=old[p];
    for(let i=0;i<cap;i++){if(tgt[i]>=0)tgt[i]=remap[tgt[i]];if(tgt[i]<0&&(mode[i]===MODE.seek||mode[i]===MODE.orbit))setMode(i,MODE.explore);}
    // Site indices a grammar keeps in its integer scratch (spec.siteSlots) follow their sites too (-1: site gone).
    for(const o of siteSlots)for(let i=0;i<cap;i++){const v=ia[i*2+o];if(v>=0)ia[i*2+o]=v<MAX_SITES?remap[v]:-1;}
    // Conditions of sites that no longer exist are forgotten (bounded memory).
    const live=new Set(siteIds);for(const id of [...siteState.keys()])if(!live.has(id))siteState.delete(id);
  }
  const site=k=>siteState.get(siteIds[k]);
  function siteIndex(id){const k=siteIds.indexOf(id);return k;}
  // ---- Influences (canonical events and the world's own conditions) ---------------------------------------------------
  // Every amount is bounded (fields saturate, site conditions are clamped): no event can explode the ecosystem.
  function influence(ev){
    const k=typeof ev.site==='number'?ev.site:ev.site!==undefined?siteIndex(ev.site):-1;
    const x=k>=0?sx[k]:ev.x,z=k>=0?sz[k]:ev.z,r=(k>=0?sr[k]:1)*(ev.radius||2.5),a=Math.max(0,Math.min(1,ev.amount??.5))*P.environment;
    if(!Number.isFinite(x)||!Number.isFinite(z))return;
    const st=k>=0?site(k):null,cl=v=>Math.max(0,Math.min(1,v));
    switch(ev.kind){
      case 'disturb':disc(CH.disturb,x,z,r,1.6*a);if(st)st.stress=cl(st.stress+.6*a);break;
      case 'recover':if(st){st.stress=0;st.nourish=cl(st.nourish+.5*a);}disc(CH.energy,x,z,r,1.2*a);disc(CH.disturb,x,z,r*1.2,-2);break;
      case 'nourish':disc(CH.energy,x,z,r,a);if(st)st.nourish=cl(st.nourish+.35*a);break;
      case 'novelty':if(st){st.novelty=1;st.nourish=cl(st.nourish+.3*a);}disc(CH.energy,x,z,r,.8*a);break;
      case 'lasting':if(st){st.lasting=Math.min(3,st.lasting+1);st.nourish=1;st.stress=0;}disc(CH.energy,x,z,r*1.4,1.5*a);disc(CH.disturb,x,z,r*1.4,-2);break;
      case 'reorganize':swirl(x,z,r*1.3,.9*a);if(st)st.swirl=cl(st.swirl+.5*a);break;
      case 'pulse':disc(CH.energy,x,z,r*.6,.35*a);disc(CH.disturb,x,z,r*.4,.12*a);break;
      case 'link':{const k2=siteIndex(ev.to);if(k>=0&&k2>=0){line(CH.trail,sx[k],sz[k],sx[k2],sz[k2],1.2*a,Math.max(.3,Math.min(sr[k],sr[k2])*.5));}break;}
      case 'remove':disc(CH.disturb,x,z,r*.6,.5*a);break;
      default:break;
    }
    for(let c=0;c<CHANNELS;c++){const o=c*NC;for(let q=0;q<NC;q++){const v=field[o+q];if(c<CH.flowX&&v<0)field[o+q]=0;}}
  }
  function setClimate(t){const next={...target};for(const k in cond)if(Number.isFinite(t?.[k]))next[k]=t[k];target=next;}
  function setGrid(g){if(Number.isFinite(g?.beat)&&Number.isFinite(g?.per))grid={beat:g.beat,per:g.per};}
  // ---- Modes --------------------------------------------------------------------------------------------------------
  function setMode(i,m){if(mode[i]!==m){mode[i]=m;modeT[i]=0;}}
  // Choose a site: attractive (strength, novelty, lasting, nourished, energy around it), not crowded, not strained,
  // nearer is better; a weighted draw from the entity's own random stream.
  function chooseSite(i){
    if(!nSites)return -1;const s=species[sp[i]],x=px[i],z=pz[i];let total=0;const w=chooseW;
    for(let k=0;k<nSites;k++){const st=site(k),d=len2(sx[k]-x,sz[k]-z);
      let a=sw[k]*(1+st.novelty*1.5+st.lasting*.6+st.nourish*.8)*(.6+sample(CH.energy,sx[k],sz[k]))*cond.attract*P.attraction;
      if(ECO2){a*=1/(1+d/((6+s.radius*4)*Math.sqrt(felt[F_EXPL][sp[i]])));a*=1/(1+visits[k]/Math.max(1,s.crowd*.8*felt[F_GATH][sp[i]]));a*=shiftOf(k);}
      else{a*=1/(1+d/(6+s.radius*4));a*=1/(1+visits[k]/Math.max(1,s.crowd*.8));}
      a*=1-.85*st.stress;if(k===tgt[i])a*=.25;
      w[k]=Math.max(0,a);total+=w[k];}
    if(total<=0)return -1;let u=u01(seed,i,gen[i],tick+7)*total;for(let k=0;k<nSites;k++){u-=w[k];if(u<=0)return k;}return nSites-1;
  }
  const chooseW=new Float64Array(MAX_SITES);
  function decide(i,nb,distLocal){
    const s=species[sp[i]],m=mode[i];
    if(hooks.decide){const r=hooks.decide(api,i,nb,distLocal);if(r>=0){setMode(i,r);return;}}
    if(m===MODE.route)return;
    if(distLocal>s.disturbBelow*(m===MODE.orbit?1.3:1)&&m!==MODE.disperse){setMode(i,MODE.disperse);return;}
    switch(m){
      case MODE.explore:
        if(en[i]<s.restBelow){setMode(i,MODE.rest);break;}
        if(s.settle>0&&u01(seed,i,tick,3)<s.settle&&flowSpeed(i)<s.settleFlow*.5){setMode(i,MODE.settle);break;}
        if(s.orbit>0&&modeT[i]>HZ&&u01(seed,i,tick,1)<s.curiosity*P.vitality*(ECO2?felt[F_EXPL][sp[i]]:1)){const k=chooseSite(i);if(k>=0){tgt[i]=k;setMode(i,MODE.seek);}}break;
      case MODE.seek:{const k=tgt[i];if(k<0){setMode(i,MODE.explore);break;}
        const d=len2(sx[k]-px[i],sz[k]-pz[i]);if(d<sr[k]*s.orbitRadius*1.6)setMode(i,MODE.orbit);
        else if(modeT[i]>40*HZ)setMode(i,MODE.explore);break;}
      case MODE.orbit:{const k=tgt[i];if(k<0){setMode(i,MODE.explore);break;}
        if(nb>s.crowd*P.collective*(ECO2?felt[F_GATH][sp[i]]:1)+2){setMode(i,MODE.disperse);break;}
        // (ecology 2: a site the turning attractor has left behind is left sooner, for one it now favours)
        if(ECO2&&modeT[i]>4*HZ){const sh=shiftOf(k);if(sh<.85&&u01(seed,i,tick,4)<.01*(.85-sh)*felt[F_EXPL][sp[i]]){setMode(i,MODE.explore);break;}}
        // Fed: it leaves, carrying the site's influence along its way for a while (it lays a stronger trail).
        if(en[i]>=1){carry[i]=Math.round(12*HZ);setMode(i,MODE.explore);break;}
        if(site(k).stress>.5)setMode(i,MODE.disperse);break;}
      case MODE.disperse:if(modeT[i]>(3+3*u01(seed,i,gen[i],5))*HZ)setMode(i,MODE.explore);break;
      case MODE.rest:if(en[i]>.6)setMode(i,MODE.explore);break;
      case MODE.settle:if(flowSpeed(i)>s.settleFlow||distLocal>s.disturbBelow*.6||modeT[i]>(20+40*u01(seed,i,gen[i],6))*HZ)setMode(i,MODE.explore);break;
      default:break;
    }
  }
  const fl=[0,0,0];
  function flowSpeed(i){flowAt(px[i],py[i],pz[i],fl);return len2(fl[0],fl[2]);}
  // ---- The tick -----------------------------------------------------------------------------------------------------
  const ax=new Float32Array(cap),ay=new Float32Array(cap),az=new Float32Array(cap),nbN=new Uint16Array(cap),living=new Int32Array(NS);
  const PN=13,NB_MAX=24,perc=new Float32Array(cap*PN);   // perceived neighbourhood (count, mean position, mean velocity, separation, other species)
  const counters={neighbourPairs:0,steps:0,candidates:0};
  // Optional per-phase CPU profile (spec.profile: benchmarks only; never on in the player).
  const prof=spec.profile?{grid:0,agents:0,integrate:0,fields:0,steps:0}:null,clock=()=>prof?performance.now():0;
  const scratchF=[0,0,0];
  function step(){
    // Conditions relax toward the climate's targets (about six seconds): no abrupt jump on a section change.
    if(ECO2){for(const k in cond){const v=target[k];if(Number.isFinite(v))cond[k]+=(v-cond[k])*KC2[k];}feel();}
    else{const kc=1-Math.exp(-DT/6);for(const k in cond){const v=target[k];if(Number.isFinite(v))cond[k]+=(v-cond[k])*kc;}}
    for(const st of siteState.values()){st.novelty*=.9995;st.nourish*=.9985;st.stress*=.9997;st.swirl*=.999;}
    // A strained site (failing validation) stays unwelcome while the strain lasts: it keeps emitting disturbance
    // (bounded by saturation) until a recovery clears it or the strain fades.
    for(let k=0;k<nSites;k++){const st=site(k);if(st.stress>.05)disc(CH.disturb,sx[k],sz[k],sr[k]*2.2,.06*st.stress*P.environment);}
    // The grammar's own per-tick preparation (tables shared by its steering), before any entity moves.
    if(hooks.tick)hooks.tick(api);
    let c0=clock();buildGrid();derive();
    density.fill(0);for(let i=0;i<cap;i++)if(alive[i]){const gx=Math.floor((px[i]-FX0)/cw),gz=Math.floor((pz[i]-FZ0)/ch);if(gx>=0&&gz>=0&&gx<NX&&gz<NZ)density[gz*NX+gx]+=1;}
    visitsNow.fill(0);
    const activity=cond.activity*P.vitality,turb=cond.turb;
    for(let i=0;i<cap;i++){
      if(!alive[i]){ax[i]=ay[i]=az[i]=0;continue;}
      const s=species[sp[i]],k=sp[i],x=px[i],y=py[i],z=pz[i],ux=vx[i],uy=vy[i],uz=vz[i];
      let fx=0,fy=0,fz=0;
      // The conditions as this species feels them (ecology 2; ecology 1: the conditions themselves).
      const actK=ECO2?felt[F_ACT][k]*P.vitality:activity,turbK=ECO2?felt[F_TURB][k]:turb,cohK=ECO2?felt[F_COH][k]:cond.cohesion,curK=ECO2?felt[F_CUR][k]/cond.current:1;
      // Neighbours: separation, alignment and cohesion with the same species; avoidance and chasing across species.
      // Each entity perceives its neighbourhood on alternate ticks (10 Hz) and keeps that perception in between (the
      // perception is state: snapshots carry it). At most NB_MAX neighbours are taken, nearest cells first.
      const o13=i*PN;
      if(s.perceive&&(((i+tick)&1)===0||modeT[i]===0)){
      const R=s.radius*P.radius,R2=R*R,SR=s.sepRadius*P.radius;let n=0,cxs=0,cys=0,czs=0,avx=0,avy=0,avz=0,sxs=0,sys=0,szs=0,ox=0,oy=0,oz=0;
      const X=cix[i],Y=ciy[i],Z=ciz[i],z0=Z>0?Z-1:0,z1=Z<GZ-1?Z+1:Z,y0=Y>0?Y-1:0,y1=Y<GY-1?Y+1:Y,x0=X>0?X-1:0,x1=X<GX-1?X+1:X;let seen=0;
      for(let cz=z0;cz<=z1&&seen<NB_MAX;cz++)for(let cy=y0;cy<=y1&&seen<NB_MAX;cy++)for(let cx=x0;cx<=x1&&seen<NB_MAX;cx++){
        const key=cx+GX*(cy+GY*cz);
        for(let p=cnt[key],e=cnt[key+1];p<e&&seen<NB_MAX;p++){const j=order[p];counters.candidates++;if(j===i)continue;
          const ex=px[j]-x,ey=py[j]-y,ez=pz[j]-z,d2=ex*ex+ey*ey+ez*ez;if(d2>R2||d2<1e-10)continue;seen++;counters.neighbourPairs++;
          const kj=sp[j];
          if(kj===k){n++;cxs+=px[j];cys+=py[j];czs+=pz[j];avx+=vx[j];avy+=vy[j];avz+=vz[j];
            if(d2<SR*SR){const d=Math.sqrt(d2),w=(SR-d)/(d*d);sxs-=ex*w;sys-=ey*w;szs-=ez*w;}}
          else{const q=k*NS+kj,rr=relR[q]*P.radius;if(d2<rr*rr){const d=Math.sqrt(d2);const a=relAvoid[q]*P.repulsion,c=relChase[q]*P.attraction;
            if(a){const w=a*(rr-d)/(rr*d);ox-=ex*w;oy-=ey*w;oz-=ez*w;}if(c){ox+=ex/d*c;oy+=ey/d*c;oz+=ez/d*c;}}
            if(d2<SR*SR){const d=Math.sqrt(d2),w=(SR-d)/(d*d)*.6;sxs-=ex*w;sys-=ey*w;szs-=ez*w;}}}
      }
      const inv=n?1/n:0;
      perc[o13]=n;perc[o13+1]=cxs*inv;perc[o13+2]=cys*inv;perc[o13+3]=czs*inv;perc[o13+4]=avx*inv;perc[o13+5]=avy*inv;perc[o13+6]=avz*inv;
      perc[o13+7]=sxs;perc[o13+8]=sys;perc[o13+9]=szs;perc[o13+10]=ox;perc[o13+11]=oy;perc[o13+12]=oz;}
      const n=perc[o13];nbN[i]=n;
      const coll=P.collective*cohK;
      const sep=s.sep*P.separation;fx+=perc[o13+7]*sep;fy+=perc[o13+8]*sep;fz+=perc[o13+9]*sep;
      if(n){const a=s.ali*P.alignment*coll,c=s.coh*P.cohesion*coll;
        fx+=(perc[o13+4]-ux)*a;fy+=(perc[o13+5]-uy)*a;fz+=(perc[o13+6]-uz)*a;
        fx+=(perc[o13+1]-x)*c;fy+=(perc[o13+2]-y)*c;fz+=(perc[o13+3]-z)*c;}
      fx+=perc[o13+10];fy+=perc[o13+11];fz+=perc[o13+12];
      // Fields: follow the trail uphill, flee disturbance downhill, ride the current.
      const m=mode[i];locate(x,z);const distLocal=atField(CH.disturb);
      const tw=s.trail*P.trails*(m===MODE.seek?1.6:m===MODE.explore?1:m===MODE.orbit?.3:0);
      if(tw){const gx=at(D_TGX),gz=at(D_TGZ),gl=len2(gx,gz);if(gl>1e-6){const c=Math.min(1,gl*2)/gl*tw;fx+=gx*c;fz+=gz*c;}}
      if(s.avoid){const c=s.avoid*P.repulsion*(m===MODE.disperse?2:1);fx-=at(D_DGX)*c;fz-=at(D_DGZ)*c;}
      if(s.flow){const c=s.flow*P.environment*(m===MODE.settle?0:1);fx+=(at(D_FX)*curK-ux)*c;fy+=(at(D_FY)*curK-uy)*c*.5;fz+=(at(D_FZ)*curK-uz)*c;}
      // Sites: seek (arrive) or orbit at the entity's own radius, height and direction.
      const kt=tgt[i];
      if(kt>=0&&(m===MODE.seek||m===MODE.orbit)){
        const h=fa[i*2],R0=sr[kt]*s.orbitRadius*(1+s.orbitJitter*(h-.5)*2),yy=sy[kt]+(fa[i*2+1]-.5)*2*s.orbitBand*sr[kt];
        if(m===MODE.seek){let ex=sx[kt]-x,ey=yy-y,ez=sz[kt]-z;const d=len3(ex,ey,ez)||1,want=s.maxSpeed*Math.min(1,d/(R0*2+.5));
          fx+=(ex/d*want-ux)*s.seek;fy+=(ey/d*want-uy)*s.seek;fz+=(ez/d*want-uz)*s.seek;}
        else{visitsNow[kt]++;const dir=h<.5?-1:1;let ex=x-sx[kt],ez=z-sz[kt];const d=len2(ex,ez)||1;ex/=d;ez/=d;
          const sw=1+(site(kt).swirl||0);const tvx=-ez*dir*s.orbitSpeed*sw*Math.max(.5,R0),tvz=ex*dir*s.orbitSpeed*sw*Math.max(.5,R0);
          fx+=((sx[kt]+ex*R0-x)*1.2+tvx-ux)*s.orbit;fz+=((sz[kt]+ez*R0-z)*1.2+tvz-uz)*s.orbit;fy+=((yy-y)*1.2-uy)*s.orbit*.6;
          // (ecology 2: exploring music shortens the visits, so more of them are on their way between sites)
          en[i]=Math.min(1.05,en[i]+s.satiate*(ECO2?felt[F_EXPL][k]:1)*(1+site(kt).nourish+site(kt).lasting*.3)*(1-site(kt).stress));}
      }
      if(m===MODE.disperse){let ex=0,ez=0;if(kt>=0){ex=x-sx[kt];ez=z-sz[kt];}else if(n){ex=x-perc[o13+1];ez=z-perc[o13+3];}const d=len2(ex,ez);if(d>1e-6){fx+=ex/d*s.maxSpeed*1.2;fz+=ez/d*s.maxSpeed*1.2;}}
      // Wander: a slowly turning heading of its own (turbulence turns it faster).
      // (the heading turns every fourth tick, staggered per entity; its direction is kept as a vector in the state)
      if(((i+tick)&3)===0){const jit=s.wanderJitter*(.5+.5*turbK)*2;wa[i]+=(u01(seed,i,tick,8)-.5)*jit;wb[i]=Math.max(-.7,Math.min(.7,wb[i]+(u01(seed,i,tick,9)-.5)*jit*.5));
        const cb=Math.cos(wb[i]);wv[i*3]=Math.cos(wa[i])*cb;wv[i*3+1]=Math.sin(wb[i])*.5;wv[i*3+2]=Math.sin(wa[i])*cb;}
      const ww=s.wander*(m===MODE.rest?.3:m===MODE.settle?0:1)*(.6+.4*turbK);
      fx+=wv[i*3]*ww;fy+=wv[i*3+1]*ww;fz+=wv[i*3+2]*ww;
      // Height band, rest and settle (slow down, hold still).
      if(s.yHold){const yt=m===MODE.rest&&s.yRest?s.yRest:Math.max(s.yMin,Math.min(s.yMax,y));fy+=(yt-y)*s.yHold;}
      if(y<s.yMin)fy+=(s.yMin-y)*4;if(y>s.yMax)fy+=(s.yMax-y)*4;
      if(m===MODE.settle||m===MODE.rest){fx-=ux*1.5;fy-=uy*1.5;fz-=uz*1.5;}
      // World bounds: steer back before the edge.
      const mg=1.5;if(x<minX+mg)fx+=(minX+mg-x)*2;if(x>maxX-mg)fx+=(maxX-mg-x)*2;if(z<minZ+mg)fz+=(minZ+mg-z)*2;if(z>maxZ-mg)fz+=(maxZ-mg-z)*2;if(y<minY)fy+=(minY-y)*2;if(y>maxY)fy+=(maxY-y)*2;
      if(hooks.steer){scratchF[0]=fx;scratchF[1]=fy;scratchF[2]=fz;hooks.steer(api,i,scratchF,distLocal);fx=scratchF[0];fy=scratchF[1];fz=scratchF[2];}
      // Bounded steering: the force is limited, the mass gives inertia (entities never turn or stop instantly).
      const fm=len3(fx,fy,fz),fmax=s.maxForce*(.6+.4*actK);if(fm>fmax){const c=fmax/fm;fx*=c;fy*=c;fz*=c;}
      ax[i]=fx/s.mass;ay[i]=fy/s.mass;az[i]=fz/s.mass;
      decide(i,n,distLocal);
    }
    let c1=clock();if(prof){prof.grid+=0;prof.agents+=c1-c0;}
    // Integrate, then deposit where each entity now is.
    for(let i=0;i<cap;i++){
      if(!alive[i])continue;const s=species[sp[i]];
      qx[i]=px[i];qy[i]=py[i];qz[i]=pz[i];
      let ux=vx[i]+ax[i]*DT,uy=vy[i]+ay[i]*DT,uz=vz[i]+az[i]*DT;const dr=1-s.drag*DT;ux*=dr;uy*=dr;uz*=dr;
      const vmax=s.maxSpeed*(.7+.3*(ECO2?felt[F_ACT][sp[i]]:cond.activity)*P.vitality)*(mode[i]===MODE.disperse?1.4:1),vmin=mode[i]===MODE.settle||mode[i]===MODE.rest?0:s.minSpeed;
      const v=len3(ux,uy,uz);if(v>vmax){const c=vmax/v;ux*=c;uy*=c;uz*=c;}else if(v<vmin&&v>1e-6){const c=vmin/v;ux*=c;uy*=c;uz*=c;}
      if(!(Number.isFinite(ux)&&Number.isFinite(uy)&&Number.isFinite(uz))){ux=uy=uz=0;}
      vx[i]=ux;vy[i]=uy;vz[i]=uz;px[i]+=ux*DT;py[i]+=uy*DT;pz[i]+=uz*DT;
      // Hard bounds (a last resort; steering keeps entities inside).
      if(px[i]<minX)px[i]=minX;else if(px[i]>maxX)px[i]=maxX;if(py[i]<minY)py[i]=minY;else if(py[i]>maxY)py[i]=maxY;if(pz[i]<minZ)pz[i]=minZ;else if(pz[i]>maxZ)pz[i]=maxZ;
      const m=mode[i],dep=(m===MODE.orbit?1.6:m===MODE.seek?.8:m===MODE.route?1:carry[i]?2:.4)*s.deposit*P.trails+(carry[i]?s.carryDeposit*P.trails:0);
      if(dep>0)splat(CH.trail,px[i],pz[i],dep);
      if(m===MODE.orbit&&s.energyDeposit)splat(CH.energy,px[i],pz[i],s.energyDeposit);
      if(s.push)splat(CH.flowX,px[i],pz[i],ux*s.push*P.collective),splat(CH.flowZ,px[i],pz[i],uz*s.push*P.collective);
      if(carry[i])carry[i]--;
      en[i]=Math.max(0,Math.min(1.05,m===MODE.rest?en[i]+s.restRecover:en[i]-s.metabolism));
      modeT[i]++;age[i]++;
      // Lifecycle: appear (fade in), live, depart (fade out) when the lifetime ends; the slot is reused later.
      if(age[i]>=life[i]){fade[i]-=DT/s.fade;if(fade[i]<=0){alive[i]=0;fade[i]=0;dead[i]=tick+Math.round((s.respawn[0]+(s.respawn[1]-s.respawn[0])*u01(seed,i,gen[i],13))*HZ);}}
      else if(fade[i]<1)fade[i]=Math.min(1,fade[i]+DT/s.fade);
    }
    let c2=clock();if(prof)prof.integrate+=c2-c1;
    // Congestion: where a crowd exceeds what a place carries, it becomes unwelcome (a repulsive deposit).
    for(let k=0;k<NS;k++){const s=species[k];if(!s.congestion)continue;for(let q=0;q<NC;q++)if(density[q]>s.congestionAbove)field[CH.disturb*NC+q]+=(density[q]-s.congestionAbove)*s.congestion;}
    evolve();if(prof){prof.fields+=clock()-c2;prof.steps++;}
    for(let k=0;k<MAX_SITES;k++)visits[k]+=(visitsNow[k]-visits[k])*.05;
    if(tick%TRAIL_EVERY===0){const head=(tick/TRAIL_EVERY|0)%K;for(let i=0;i<cap;i++){if(!alive[i])continue;const o=i*K+head;tx[o]=px[i];ty[o]=py[i];tz[o]=pz[i];}}
    // Free slots respawn while their species is below its active quota (bounded, deterministic order).
    living.fill(0);for(let i=0;i<cap;i++)if(alive[i])living[sp[i]]++;
    for(let i=0;i<cap;i++){if(alive[i]||dead[i]>tick)continue;const k=slotSpecies[i];if(living[k]<activeQuota(k)){spawn(i);living[k]++;}}
    tick++;counters.steps++;
  }
  // ---- Snapshots ----------------------------------------------------------------------------------------------------
  const ARRAYS={perc,wv,px,py,pz,vx,vy,vz,qx,qy,qz,en,age,life,fade,wa,wb,fa,sp,mode,alive,modeT,gen,carry,tgt,ia,dead,tx,ty,tz,field,visits,sx,sy,sz,sr,sw,sKind};
  function snapshot(){const a={};for(const [k,v] of Object.entries(ARRAYS))a[k]=v.slice();
    return {tick,arrays:a,nSites,siteIds:siteIds.slice(),siteState:structuredClone(siteState),cond:{...cond},target:{...target},grid:{...grid}};}
  function restore(s){for(const [k,v] of Object.entries(ARRAYS))v.set(s.arrays[k]);tick=s.tick;nSites=s.nSites;siteIds=s.siteIds.slice();siteState=structuredClone(s.siteState);
    // (an ecology 1 state taken into ecology 2, a live session tuned to it: the conditions it did not have start neutral)
    cond=ECO2?{...COND1,...COND2,...s.cond}:{...s.cond};target=ECO2?{...COND1,...COND2,...s.target}:{...s.target};grid={...(s.grid||{beat:0,per:0})};
    if(ECO2)feel();}
  // A digest of the whole state (tests: exact equality of two runs; FNV over the raw bytes).
  function digest(){let h=2166136261;for(const v of Object.values(ARRAYS)){const b=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);for(let i=0;i<b.length;i++){h^=b[i];h=Math.imul(h,16777619);}}
    h^=tick;h=Math.imul(h,16777619);return (h>>>0).toString(16).padStart(8,'0');}
  function stats(){const modes=new Array(MODE_NAMES.length).fill(0),bySpecies=new Array(NS).fill(0);let live=0,speed=0,energy=0;
    for(let i=0;i<cap;i++){if(!alive[i])continue;live++;modes[mode[i]]++;bySpecies[sp[i]]++;speed+=len3(vx[i],vy[i],vz[i]);energy+=en[i];}
    let tr=0,dist=0,eng=0,flow=0;for(let q=0;q<NC;q++){tr+=field[CH.trail*NC+q];eng+=field[CH.energy*NC+q];dist+=field[CH.disturb*NC+q];flow+=len2(field[CH.flowX*NC+q],field[CH.flowZ*NC+q]);}
    return {tick,alive:live,capacity:cap,species:Object.fromEntries(species.map((s,k)=>[s.name,bySpecies[k]])),modes:Object.fromEntries(MODE_NAMES.map((n,k)=>[n,modes[k]])),
      meanSpeed:live?speed/live:0,meanEnergy:live?energy/live:0,field:{trail:tr,energy:eng,disturb:dist,flow},sites:nSites,field_dims:[NX,NZ],
      cond:Object.fromEntries(Object.entries(cond).map(([k,v])=>[k,+v.toFixed(3)])),neighbourPairs:counters.neighbourPairs,candidates:counters.candidates,steps:counters.steps,
      profile:prof&&prof.steps?{gridNeighboursSteeringMs:+(prof.agents/prof.steps).toFixed(4),integrateDepositMs:+(prof.integrate/prof.steps).toFixed(4),fieldsMs:+(prof.fields/prof.steps).toFixed(4)}:null};}
  const api={
    seed,capacity:cap,species,NS,K,TRAIL_EVERY,NX,NZ,field:{data:field,density,min:[FX0,FZ0],max:[FX1,FZ1],cw,ch,nx:NX,nz:NZ},
    px,py,pz,vx,vy,vz,qx,qy,qz,en,age,life,fade,sp,mode,alive,modeT,gen,carry,tgt,fa,ia,tx,ty,tz,nb:nbN,
    sites:{x:sx,y:sy,z:sz,r:sr,w:sw,kind:sKind,visits,get count(){return nSites;},get ids(){return siteIds;},state:k=>site(k)},
    get tick(){return tick;},get cond(){return cond;},params:P,
    get siteData(){return siteData;},
    // Ecology 2: whether it is on, the beat grid, the turning attractor's effect on a site, a condition as a species
    // feels it (all neutral, or the plain conditions, in ecology 1).
    ecology:ECO2?2:1,get grid(){return grid;},shiftOf,felt:feltOf,setGrid,
    populate,step,setSites,setSiteData,influence,setClimate,setMode,sample,gradient,splat,disc,flowAt,snapshot,restore,digest,stats,
    random:(i,n)=>u01(seed,i,gen[i],tick*64+n),
    // The trail ring head: points are ordered newest first from here (k = 0..K-1).
    get trailHead(){return Math.floor(Math.max(0,tick-1)/TRAIL_EVERY)%K;}
  };
  return api;
}

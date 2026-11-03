// Genesis (preview): Metamorphic Matter, the authoritative simulation (G2). Design note: docs/worlds/genesis-matter.md.
//
// One continuous matter on a periodic sheet of hexagonal cells (112 x 128 cells of 2.6 m, about 290 m a side: the
// renderer's own cells), in four regimes: crystal (solid, coherent), liquid (a mercury melt), grains (solid that has
// lost its coherence) and foam (boiling melt). Each cell carries a solid fraction (a phase field), a temperature (above
// or below the melting point, 0), a crystal column's height, stress and fracture, froth, and the memory of a healed
// seam. Fixed step at the life driver's rate (life/sim.js HZ), explicit and deterministic: basic IEEE arithmetic and
// Math.sqrt only, typed arrays in a fixed order, randomness from a counter-based hash of (seed, cell, tick).
//
// The physics (an artistic model, documented as such; every constant follows from the Lawbook through physicsOf):
//  - solidification: an Allen-Cahn phase field driven by undercooling. Undercooled melt is metastable: it crystallises
//    only from a nucleus, then a front grows at a speed set by the undercooling and the region's mobility. The latent
//    heat the front releases warms the melt ahead, so in shallow undercooling growth waits for heat to leave and
//    branches; in deep undercooling the front is compact. Growth is anisotropic: the region's crystal habit (n-fold
//    symmetry, strength, orientation) sets the speed by direction. A superheated solid melts throughout.
//  - heat: diffusion, a pull toward the cell's ambient temperature (its region's climate, its files' cold, the
//    monuments' cold, the music's form), the latent heat, and thermal contacts (work, pads, channels, events: each a
//    conductance toward a temperature, so a source never overshoots it).
//  - columns: a crystal cell's column grows toward its height (taller where colder and near its files), and sinks into
//    the melt when it melts.
//  - fracture: stress from a failing validation spreads through connected solid (never across melt); where it exceeds
//    the matter's strength the crystal breaks into grains. A recovery's sintering front fuses them back and leaves seams.
//  - foam: melt above its boiling point froths; the froth collapses when it cools.
//
// Software structure -> matter (layoutOf; every mapping is an artistic abstraction, never a claim about running code):
//  - subsystem  -> a region of the sheet (a power diagram: territory grows with its live files), seated by birth order
//                  on a golden spiral (a new region never moves an older one), with its own laws drawn from the project's
//                  (its climate: a supercooled lake or a crystal plain; its crystal habit)
//  - file       -> a site in its region (also by order: never moved), a cold spot that holds a crystal island; its
//                  symbols raise its column
//  - dependency -> between regions, a channel held molten (a hot conduit from the importing region's seat to the
//                  imported's), opened by a front from the importer when it first appears
// Canonical intents -> bounded physical inputs (expressOf below; the director decides tiers, cooldowns and spectacle
// tokens, run here on the same intents in the same order): work heats and melts, a new file nucleates, a failure
// fractures, a recovery sinters, a verified milestone sends a freeze across the sea and raises monumental crystals (the
// only lasting change, and only from verified evidence). The score's notes (musical.js bars, never the audio device)
// nucleate crystal in the melt of the region their degree belongs to (melody) and melt pools (pads); its form warms
// and cools the lakes.
import {HZ,DT,mix,u01} from './life/sim.js';
import {createDirector} from './director.js';
import {DEGREES,degreeOfMidi,hash} from './genesis-laws.js';
import {dsin,dcos,dexp} from './genesis-field.js';
export {HZ,DT};
export const MATTER_VERSION=1;
export const COLS=112,ROWS=128,CELL=2.6,SQ3=Math.sqrt(3),PX=COLS*CELL,PZ=ROWS/2*SQ3*CELL,NCELL=COLS*ROWS;
export const REGIME=Object.freeze({crystal:0,liquid:1,grains:2,foam:3});
export const MAXR=64,MAX_MONUMENTS=64;
// Temperatures (0: the melting point): the froth's boiling point, where melt glows, where solid melts throughout and
// below which melt begins to nucleate by itself (rarely just under it, everywhere deep under it: x^3).
export const BOIL=1.15,GLOW=.3,SUPERHEAT=.16,NUCLEATE=.08;
const TAU=Math.PI*2,GOLDEN=2.399963229728653,RH=CELL*SQ3/2;
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;
// The score's values reach the state quantised to 1/1024: Node and Chromium may differ in their last bit (score.js)
const q10=x=>Math.round(x*1024)/1024;
const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const wrap=(d,p)=>d-p*Math.floor(d/p+.5);
export const wx=d=>wrap(d,PX),wz=d=>wrap(d,PZ);
// ---- The sheet ---------------------------------------------------------------------------------------------------
// Cell centres (metres) and the six neighbours of each cell (rows alternate whole and half columns; N is +z), in the
// order E, NE, NW, W, SW, SE, with their directions.
export const CX=new Float64Array(NCELL),CZ=new Float64Array(NCELL);
const NB=new Int32Array(NCELL*6);
const DX=[1,.5,-.5,-1,-.5,.5],DZ=[0,SQ3/2,SQ3/2,0,-SQ3/2,-SQ3/2];
for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const i=r*COLS+c,o=r&1,up=(r+1)%ROWS,dn=(r+ROWS-1)%ROWS,E=(c+1)%COLS,W=(c+COLS-1)%COLS;
  CX[i]=(c+o*.5)*CELL;CZ[i]=r*RH;
  NB[6*i]=r*COLS+E;NB[6*i+1]=up*COLS+(o?E:c);NB[6*i+2]=up*COLS+(o?c:W);NB[6*i+3]=r*COLS+W;NB[6*i+4]=dn*COLS+(o?c:W);NB[6*i+5]=dn*COLS+(o?E:c);}
// The cell nearest a point of the world.
export function cellAt(x,z){
  const rf=z/RH,r0=Math.floor(rf);let best=0,bd=Infinity;
  for(let r=r0;r<=r0+1;r++){const o=((r%2)+2)%2,cf=x/CELL-o*.5,c=Math.round(cf),dx=cf-c,dz=(rf-r)*SQ3/2,d=dx*dx+dz*dz;
    if(d<bd){bd=d;best=(((r%ROWS)+ROWS)%ROWS)*COLS+(((c%COLS)+COLS)%COLS);}}
  return best;
}
// Every cell within `rad` metres of (x, z) on the periodic sheet: fn(cell, d^2 / rad^2).
export function forDisc(x,z,rad,fn){
  rad=Math.min(rad,PZ*.49);const rr=rad*rad,r0=Math.floor((z-rad)/RH),r1=Math.ceil((z+rad)/RH);
  for(let r=r0;r<=r1;r++){const dz=r*RH-z;if(dz*dz>rr)continue;const o=((r%2)+2)%2,half=Math.sqrt(rr-dz*dz),rw=((r%ROWS)+ROWS)%ROWS;
    const c0=Math.ceil((x-half)/CELL-o*.5),c1=Math.floor((x+half)/CELL-o*.5);
    for(let c=c0;c<=c1;c++){const dx=(c+o*.5)*CELL-x;fn(rw*COLS+(((c%COLS)+COLS)%COLS),(dx*dx+dz*dz)/rr);}}
}
const distTo=(i,x,z)=>{const dx=wx(CX[i]-x),dz=wz(CZ[i]-z);return Math.sqrt(dx*dx+dz*dz);};
const len2=(x,z)=>Math.sqrt(x*x+z*z);
// Grains: every nucleus starts a crystal grain of its own (an id), and a cell that freezes joins the grain it froze
// from. A grain's orientation (from its id) turns the habit: n x the orientation, as a cosine and a sine.
export const GRAINS=4096;
const GCOS=new Float64Array(GRAINS),GSIN=new Float64Array(GRAINS);
// a wandering boundary: the sum of three periodic waves over the sheet (wavelengths of a third, a quarter and a fifth
// of it), each region its own phases; precomputed per cell
const WOB=[700,760,640,820,700,680,740,720];
const WAVES=[0,1,2].map(k=>{const c=new Float64Array(NCELL),s_=new Float64Array(NCELL),fx=(3+k)*TAU/PX,fz=(5-k)*TAU/PZ;
  for(let i=0;i<NCELL;i++){const a=fx*CX[i]+fz*CZ[i]*(k===1?-1:1);c[i]=dcos(a);s_[i]=dsin(a);}return [c,s_];});
const wobble=(i,r)=>{let v=0;for(let k=0;k<3;k++){const ph=(r*2.39996+k*1.7)%TAU,cp=dcos(ph),sp=dsin(ph);v+=WAVES[k][0][i]*cp-WAVES[k][1][i]*sp;}return v/3;};
// a grain's strength share (0..1) and its height (a grain stands as one terrace: .8 to 1.2 of its region's column)
const GSTR=new Float64Array(GRAINS),GH=new Float64Array(GRAINS);
for(let g=0;g<GRAINS;g++){GCOS[g]=dcos(TAU*g/GRAINS);GSIN[g]=dsin(TAU*g/GRAINS);GSTR[g]=u01(g,7,0,0x57a);GH[g]=.8+.4*u01(g,9,0,0x6e1);}
// ---- The Lawbook -> physics ----------------------------------------------------------------------------------------
// genome.laws (0..1, engine/recipe.js GENOMES.genesis). Units: cells, seconds, temperature (0 melts).
export function physicsOf(laws){
  const L=k=>clamp(num(laws?.[k],.5));
  return {
    diffusion:lerp(.45,1.6,L('conductivity')),     // heat diffusion (cells^2/s): conductivity
    relax:lerp(.05,.16,L('elasticity')),           // pull toward the ambient (1/s): elasticity, how fast matter returns
    latent:lerp(.15,.09,L('cohesion')),            // latent heat: cohesive matter releases less, grows more compactly
    mobility:lerp(6,3.4,L('viscosity')),           // front mobility (1/s): viscous matter transforms slower
    width:lerp(.42,.95,L('cohesion')),             // interface energy (cells^2): rounder, more compact crystals
    beta:3.2,                                      // undercooling -> driving force
    undercool:lerp(.26,.46,L('stability')),        // a crystal plain's depth below the melting point
    lakes:lerp(.62,.28,L('stability')),            // the share of regions resting as supercooled melt
    anisotropy:L('anisotropy'),                    // crystal habit: rounded grains, hexagonal plates, needles
    growth:lerp(.5,1.6,L('morphogenesis')),        // a column's growth (m/s): morphogenesis
    tall:lerp(.8,1.5,L('morphogenesis')),          // columns' height near their files
    stressDiffusion:lerp(5,1.6,L('cohesion')),     // how far a failure's stress travels through solid (cells^2/s)
    strength:lerp(.22,.5,L('stability')),          // the stress at which crystal breaks (a law of the matter, not the code)
    sinter:lerp(5,14,L('elasticity')),             // a recovery's sintering front (m/s)
    channel:lerp(.9,1.8,L('coupling')),            // a channel's half-width (cells): coupling
    channelHeat:lerp(.45,.9,L('coupling')),        // a channel's temperature
    opening:lerp(7,22,L('conductivity')),          // a new channel's opening front (m/s)
    nucleus:lerp(1.2,2.4,L('resonance')),          // a melody note's nucleus (cells): resonance, how strongly music acts
    pad:lerp(.35,.75,L('resonance')),              // a pad's melt
    climate:lerp(.08,.2,L('resonance')),           // how far the music's form warms and cools the lakes
    froth:lerp(.9,.25,L('viscosity')),             // foam's collapse (1/s)
    spread:lerp(.75,1.4,L('dispersion')),          // the reach of pulses (pads, work, anneals)
    seeding:.25*dexp(L('dispersion')*2.4849066)    // how finely matter nucleates (.25 to 3: coarse grains to fine): dispersion
  };
}
// A region's own laws: drawn from the project's with a seeded share by its rank (never from its role or size, which
// change with the code: a region's climate and habit stay what they were).
export function regionLaws(P,seed,k){
  const h=j=>u01(seed,k+1,j,0x5eed);
  // lakes spread evenly over the ranks (a low-discrepancy draw: never all lakes, never none), the sea a lake
  // (a lake rests above its melting point: a note's crystal melts back unless a calm passage of the music supercools it)
  const lake=k>=MAXR?true:((k*.6180339887+u01(seed,0,1,0x5eed))%1)<P.lakes,U=lake?lerp(-.16,-.08,h(2)):clamp(P.undercool*lerp(.85,1.15,h(3)),.2,.48);
  const an=clamp(P.anisotropy+.36*(h(4)-.5)),fold=an>.64?2:6;
  const delta=fold===6?lerp(.04,.38,an/.64):lerp(.3,.6,(an-.64)/.36);
  return {lake,U,fold,delta,mob:P.mobility*lerp(.85,1.15,h(7)),
    cap:fold===2?lerp(2.6,4.4,h(6)):lerp(1.2,2.8,clamp(an/.64+.3*(h(6)-.5))),sens:lake?1:.3,hue:h(8)};
}
// ---- Layout: the structure at time t -> regions, sites and channels ------------------------------------------------
// The habitat of the life driver: sites are the live files (id, position, cold radius, symbols, state), data the
// regions (rank, seat, power weight, files, degree) and the channels between them.
const STATE_CODE={draft:0,committed:1,validated:2,stressed:3};
export function layoutOf(model,t,{seed=1,nRef=5,area=50}={}){
  const here=x=>model.bornAt(x)<=t&&(x.removed===null||x.removed>t);
  const all=[...model.districts.values()].map(d=>({d,born:model.districtBorn(d)})).filter(x=>x.born<Infinity).sort((a,b)=>a.born-b.born||a.d.order-b.d.order);
  const rot=u01(seed,7,0,0x0e1a)*TAU,Rs=.36*Math.min(PX,PZ),Sf=Math.sqrt(area/Math.PI);
  const regions=[],sites=[],byGroup=new Map();
  all.forEach((x,k)=>{const d=x.d,a=k*GOLDEN+rot,r=Rs*Math.sqrt((k+.5)/Math.max(nRef,k+1));
    const sx=wx(r*dcos(a)),sz=wz(r*dsin(a)),ra=u01(seed,k+1,9,0x0e1a)*TAU;
    const members=d.members.map(id=>model.modules.get(id)).filter(Boolean).sort((p,q)=>p.order-q.order);
    let files=0;members.forEach((m,j)=>{if(!here(m))return;files++;
      const rho=Sf*Math.sqrt(j+.5)*.92,b=j*GOLDEN+ra,sym=model.symbolsAt(m,t);
      sites.push({id:m.id,x:wx(sx+rho*dcos(b)),y:0,z:wz(sz+rho*dsin(b)),r:CELL*Math.min(3.2,1+.3*Math.sqrt(sym)),w:sym,kind:STATE_CODE[model.stateAt(m,t)]??0,region:k});});
    const reg={id:d.id,rank:k,x:sx,z:sz,files,w2:files?(Sf*Math.sqrt(files+.5)+6)*(Sf*Math.sqrt(files+.5)+6):0,degree:DEGREES[k%7]};
    regions.push(reg);byGroup.set(d.id,reg);});
  const pairs=new Map();
  for(const l of model.links.values()){if(!here(l))continue;const a=model.modules.get(l.a),b=model.modules.get(l.b);if(!a||!b||a.group===b.group||!here(a)||!here(b))continue;
    const A=byGroup.get(a.group),B=byGroup.get(b.group);if(!A||!B||!A.files||!B.files)continue;const key=`${A.rank}>${B.rank}`;pairs.set(key,(pairs.get(key)||0)+1);}
  const channels=[...pairs].map(([key,count])=>{const [a,b]=key.split('>').map(Number);return {key,a,b,count};}).sort((p,q)=>p.a-q.a||p.b-q.b);
  return {sites,data:{regions,channels}};
}
// ---- Intents -> influences (the grammar's: the life driver maps subjects to sites on the structure as it was) --------
// A live intent goes to the matter whole (the director inside it decides its tier); before the performance's origin or
// a generation's warm start only verified lasting history counts (monuments).
export function influencesOf(intent,here,{history=false}={}){
  const s=intent.subject||{},files=[...new Set([s.fileId,...(s.fileIds||[])].filter(Boolean))].slice(0,12).map(here).filter(Boolean);
  const group=s.groupId?here(s.groupId):null;
  if(history){
    if(intent.type==='milestone.achieved'&&intent.evidence==='verified')return [{kind:'lasting',type:intent.type,sites:files.length?files:group?[group]:[],magnitude:+intent.magnitude||0,tier:intent.tier|0,id:intent.id}];
    return [];
  }
  return [{kind:'intent',intent,sites:files,group,target:s.targetId?here(s.targetId):null,targetGroup:s.targetGroupId?here(s.targetGroupId):null}];
}
// ---- The grammar (life/driver.js): habitat, sites, influences, the matter itself ----------------------------------
export function createMatterGrammar({recipe}){
  const laws=recipe?.genome?.laws||{},seed=(recipe?.projectSeed>>>0)||1,P=physicsOf(laws),traits=recipe?.traits||{};
  const nRef=Math.max(4,Math.round(num(traits.districts,5))),fileRef=Math.max(12,num(traits.modules,40));
  const area=clamp(.5*PX*PZ/fileRef,24,70);
  return {id:'genesis-matter',version:MATTER_VERSION,listens:true,
    ecosystem:()=>({laws,P,projectSeed:seed}),
    create:spec=>createMatter(spec),
    habitat:(model,t)=>layoutOf(model,t,{seed,nRef,area}),
    siteOf:(id,model)=>model.modules.has(id)?id:model.districts.has(id)?`d:${id}`:null,
    influences:influencesOf};
}
// ---- The matter ------------------------------------------------------------------------------------------------------
// spec: {P (physicsOf), laws, projectSeed, seed (the generation's)}. The life driver's ecosystem interface: setSites,
// setSiteData, populate, influence, setClimate, setGrid, listen (the score), step, snapshot, restore, digest, stats.
export function createMatter(spec){
  const P=spec.P||physicsOf(spec.laws),pseed=spec.projectSeed>>>0||1,seed=spec.seed>>>0;
  const N=NCELL,F=()=>new Float32Array(N);
  // state
  let phi=F(),T=F(),phi2=F(),T2=F(),st=F(),st2=F();
  const H=F(),frac=F(),foam=F(),seam=F(),hPrev=F(),phiPrev=F(),gid=new Uint16Array(N);
  // the grains of matter at rest: the nearest of 180 points strewn over the sheet (the project's own), within its region
  const GP=[...Array(180)].map((_,k)=>[u01(pseed,k,1,0x9a1)*PX,u01(pseed,k,2,0x9a1)*PZ]);
  const restGrain=(i,salt=0)=>{let b=0,bd=Infinity;for(let k=0;k<GP.length;k++){const dx=wx(CX[i]-GP[k][0]),dz=wz(CZ[i]-GP[k][1]),d=dx*dx+dz*dz;if(d<bd){bd=d;b=k;}}return mix(pseed,b,reg[i]+2,0x9a2^salt)%GRAINS;};
  // static (from the layout, the monuments and the files' growth): region, ambient, column height, channels
  const reg=new Int16Array(N),taBase=F(),cap=F(),chanW=F(),chanS=F(),chanIdx=new Int16Array(N).fill(-1);
  // per tick: thermal contacts (sum of conductances, sum of conductance x temperature) and the stress sources
  const kc=F(),kt=F(),sq=F();
  const R=[];   // region laws by rank
  let sites=[],siteMap=new Map(),data={regions:[],channels:[]},regionById=new Map(),dirty=true;
  let tick=0,warm=0,warmTarget=0,craze=0,lastT=null,expressionAt=-1;
  // dynamic: contacts {x,z,r,k,T,k0,k1,ramp}, waves {x,z,v,k0,kind,A,R,hold,fade,w}, stressed sites, sintering fronts,
  // monuments, channels' birth ticks, files' growth (metres added by structure), the causal log
  let contacts=[],waves=[],stressed=new Map(),sinters=[],monuments=[],born=new Map(),growth=new Map(),log=[],surged=new Map();
  const director=createDirector({recipe:null});
  const lawsOf=k=>R[k]||(R[k]=regionLaws(P,pseed,k));
  const SEA=regionLaws(P,pseed,MAXR*7);   // before any subsystem: a supercooled sea of the project's own laws
  const regionOf=i=>{const k=reg[i];return k<0?SEA:lawsOf(k);};
  // ---- Static fields ---------------------------------------------------------------------------------------------
  function rebuild(){
    dirty=false;regionById=new Map(data.regions.map(r=>[`d:${r.id}`,r]));siteMap=new Map(sites.map(s=>[s.id,s]));
    const live=data.regions.filter(r=>r.files>0);
    // (the boundaries between regions wander: a periodic swell of about 40 m added to each region's power distance)
    for(let i=0;i<N;i++){let best=-1,bd=Infinity;for(const r of live){const dx=wx(CX[i]-r.x),dz=wz(CZ[i]-r.z),e=dx*dx+dz*dz-r.w2+WOB[r.rank&7]*wobble(i,r.rank);if(e<bd){bd=e;best=r.rank;}}
      reg[i]=best;const L=regionOf(i);taBase[i]=-L.U;cap[i]=L.cap;}
    // the files' cold (their crystal islands) and their columns (taller with their symbols and the structure grown there)
    for(const s of sites){const g=growth.get(s.id)||0,boost=Math.min(7,P.tall*(.35*Math.sqrt(s.w)+g));
      forDisc(s.x,s.z,s.r,(i,q)=>{taBase[i]-=.28*(1-q);});forDisc(s.x,s.z,s.r+CELL*3,(i,q)=>{cap[i]+=boost*(1-q);});}
    for(const m of monuments)forDisc(m.x,m.z,9,(i,q)=>{taBase[i]-=.55*(1-q);});
    // channels: a capsule from the importing region's seat to the imported's (the shorter way round), weighted to its axis
    chanW.fill(0);chanIdx.fill(-1);const byRank=new Map(data.regions.map(r=>[r.rank,r]));
    data.channels.forEach((c,ci)=>{const A=byRank.get(c.a),B=byRank.get(c.b);if(!A||!B)return;const bx=wx(B.x-A.x),bz=wz(B.z-A.z),len=len2(bx,bz)||1;
      const hw=P.channel*CELL*(.85+.15*Math.min(3,31-Math.clz32(1+c.count)));
      for(let s=0;s<=len;s+=CELL*.5)forDisc(A.x+bx*s/len,A.z+bz*s/len,hw,(i,q)=>{const w=1-q;if(w>chanW[i]){chanW[i]=w;chanS[i]=s;chanIdx[i]=ci;}});});
    const keys=new Set(data.channels.map(c=>c.key));for(const k of [...born.keys()])if(!keys.has(k))born.delete(k);
    for(const k of keys)if(!born.has(k))born.set(k,tick);
  }
  // ---- Inputs ------------------------------------------------------------------------------------------------------
  const posOf=id=>{const s=siteMap.get(id);if(s)return s;const r=regionById.get(id);return r?{x:r.x,z:r.z,region:r.rank}:null;};
  const regionAt=id=>{const s=siteMap.get(id);if(s)return data.regions[s.region]||null;return regionById.get(id)||null;};
  let curRegions=[];   // the regions the input being applied concerns (for the causal log)
  const note=(kind,what,rule,extra={})=>{log.push({tick,kind,what,rule,regions:curRegions,...extra});if(log.length>48)log.shift();};
  function contact(x,z,r,k,temp,secs,ramp=.4){contacts.push({x,z,r,k,T:temp,k0:tick,k1:tick+Math.round(secs*HZ),ramp:Math.max(1,Math.round(ramp*HZ))});if(contacts.length>96)contacts.shift();}
  function wave(o){waves.push({k0:tick,...o});if(waves.length>6)waves.shift();}
  // a surge of heat along the channels a region imports through (coupling: energy travels toward what it depends on),
  // at most one per channel every 4 s
  function surgeFrom(rank,A){const R0=data.regions.find(r=>r.rank===rank);if(!R0)return 0;let n=0;
    for(const c of data.channels){if(c.a!==rank||tick-(surged.get(c.key)??-1e9)<4*HZ)continue;const B=data.regions.find(r=>r.rank===c.b);if(!B)continue;
      const dx=wx(B.x-R0.x),dz=wz(B.z-R0.z),len=len2(dx,dz)||1;surged.set(c.key,tick);n++;wave({kind:'surge',x:R0.x,z:R0.z,ux:dx/len,uz:dz/len,len,v:P.opening*1.4,A,w:7});}
    return n;}
  // a crystal nucleus: the melt within r cells becomes solid (a new grain), releasing its latent heat; `quench` cools the
  // melt around it for a moment (a note's: its crystal grows visibly before the lake's own temperature decides its fate)
  function nucleate(x,z,r,quench=0){let n=0;const g=mix(seed,tick,Math.round(x*16),Math.round(z*16))%GRAINS;
    forDisc(x,z,r*CELL,(i,q)=>{if(phi[i]<.5){T[i]+=P.latent*(1-phi[i]);phi[i]=1;gid[i]=g;n++;}});
    if(quench>0)contact(x,z,r*CELL*3.2,quench,-.45,1.4,.15);return n;}
  function monument(siteIds,ev,grown,arrive=null){
    for(const id of siteIds.slice(0,6)){const p=posOf(id);if(!p)continue;const k=mix(pseed,hash(id),monuments.length);
      monuments.push({x:p.x,z:p.z,k0:grown?-1e9:(arrive?arrive(p):tick),size:clamp(+ev.magnitude||0,.3,1.4)*(ev.tier>=4?1.3:1),seed:k,n:3+(k%5),site:id});}
    while(monuments.length>MAX_MONUMENTS)monuments.shift();dirty=true;
  }
  function influence(ev){
    if(ev.kind==='lasting'){curRegions=[];if(ev.type==='milestone.achieved'){monument(ev.sites,ev,true);note('lasting','a verified milestone before this moment','its monumental crystals stand');}return;}
    const i=ev.intent,cmd=director.process(i);
    curRegions=[...new Set([...ev.sites,ev.group].map(id=>id&&(siteMap.get(id)?.region??regionById.get(id)?.rank)).filter(x=>x!==undefined&&x!==null))];
    if(i.type==='agent.state'){const d=i.detail||{};if((d.state==='tool'||d.state==='processing')&&ev.sites[0]){const p=posOf(ev.sites[0]);
      if(p){contact(p.x,p.z,1.9*CELL*P.spread,2.4,1.9,4);const n=surgeFrom(p.region,.55);
        note('work','an agent used a tool on a file','the file\'s matter is heated: it melts, glows and froths while the work lasts'+(n?'; the heat surges along its region\'s channels to the regions it depends on (coupling)':''));}}return;}
    if(i.type==='structure.modified'||i.type==='module.renamed'){const p=ev.sites[0]&&posOf(ev.sites[0]);if(p){contact(p.x,p.z,1.3*CELL*P.spread,1.6,.9,1.6);note('edit','a file\'s structure changed','its crystal is warmed and softens');}return;}
    if(!cmd)return;   // coalesced or cooling down (the director's proportion rules)
    const s=cmd.scale,sites_=ev.sites.map(posOf).filter(Boolean);
    switch(i.type){
      case 'module.created':for(const p of sites_)nucleate(p.x,p.z,1.6);note('nucleate','a file was created','a crystal nucleates at its site and grows through the melt of its region');break;
      case 'structure.created':for(const id of ev.sites){growth.set(id,Math.min(4,(growth.get(id)||0)+.35*s));}dirty=true;note('accrete','structure was created in a file','the file\'s column grows taller');break;
      case 'structure.removed':case 'module.removed':for(const id of ev.sites){growth.set(id,Math.max(-1,(growth.get(id)||0)-.35*s));const p=posOf(id);if(p)contact(p.x,p.z,1.6*CELL,2.4,1,2.5);}
        dirty=true;note('dissolve','structure was removed from a file','its crystal melts back and its column sinks');break;
      case 'structure.linked':{const a=sites_[0],b=ev.target&&posOf(ev.target);if(a&&b){const dx=wx(b.x-a.x),dz=wz(b.z-a.z),len=len2(dx,dz)||1;
        for(let q=0;q<=len;q+=CELL)contact(a.x+dx*q/len,a.z+dz*q/len,CELL,1.4,.7,1.2,.2);note('link','a file began to depend on another in its subsystem','a thin vein of melt runs between them and closes');}break;}
      case 'subsystem.connected':{const A=ev.group&&posOf(ev.group),B=ev.targetGroup&&posOf(ev.targetGroup);if(A&&B){const dx=wx(B.x-A.x),dz=wz(B.z-A.z),len=len2(dx,dz)||1;
        wave({kind:'surge',x:A.x,z:A.z,ux:dx/len,uz:dz/len,len,v:P.opening*1.4,A:1.1+.5*s,w:7});note('couple','a dependency between two subsystems was recorded','a surge of heat travels along the channel from the importing region to the imported (coupling; a static dependency, never runtime execution)');}break;}
      case 'subsystem.created':{const p=ev.group&&posOf(ev.group);const r=ev.group&&regionById.get(ev.group);if(p){wave({kind:'reform',x:p.x,z:p.z,v:12,A:1.2*s,R:Math.max(24,Math.sqrt(r?.w2||600)),w:6});
        for(const q of sites_)nucleate(q.x,q.z,1.8);note('region','a subsystem appeared','its region re-forms outward from its seat under its own laws');}break;}
      case 'validation.failed':
        if(sites_.length){for(const id of ev.sites)stressed.set(id,Math.max(stressed.get(id)||0,.5+.5*s));note('fracture','a validation failed on these files','stress spreads through the connected crystal; where it exceeds its strength it breaks into grains',{sites:ev.sites.length});}
        else{craze=1;note('craze','a validation failed with no files attributed','the whole sea\'s crystal crazes faintly for a moment (unlocalised: nothing is broken)');}
        break;
      case 'validation.recovered':{const list=ev.sites.length?ev.sites:[...stressed.keys()];
        for(const id of list){stressed.delete(id);const p=posOf(id);if(p){sinters.push({x:p.x,z:p.z,k0:tick,v:P.sinter,R:90});if(sinters.length>8)sinters.shift();}}
        if(!ev.sites.length){craze=0;}note('sinter','a failure was recovered','a sintering front fuses the grains back into crystal and leaves seams');break;}
      case 'validation.passed':for(const p of sites_.slice(0,6))contact(p.x,p.z,10*P.spread,1.2,-.55,3);note('anneal','a validation passed on these files','their matter is annealed: nearby melt crystallises (no celebration)');break;
      case 'refactor.validated':for(const p of sites_.slice(0,3))wave({kind:'reform',x:p.x,z:p.z,v:10,A:1.1*s,R:40,w:6});note('reform','a refactor was validated','the matter around it re-forms');break;
      case 'repository.checkpoint':for(const p of sites_.slice(0,12))contact(p.x,p.z,8*P.spread,.9,-.45,3);note('consolidate','a commit was observed','a restrained cooling consolidates the committed files\' matter');break;
      case 'world.expanded':{const c=data.regions[0];wave({kind:'reform',x:c?c.x:0,z:c?c.z:0,v:30,A:.9*s,R:PZ*.49,w:6});note('expand','the project entered a new chapter','a wave of re-formation crosses the whole sea from the first region');break;}
      case 'agent.collision':for(const p of sites_)contact(p.x,p.z,2.5*CELL,2,1.3,2);note('meet','two agents worked in the same place','their heat meets there (no progress is credited)');break;
      case 'milestone.achieved':{
        const verified=i.evidence==='verified',c=sites_.length?sites_[0]:(data.regions[0]||{x:0,z:0}),whole=cmd.tier>=3;
        const v=25,w={kind:'freeze',x:c.x,z:c.z,v,A:whole?.95:.7,R:whole?PZ*.49:70,hold:cmd.tier>=4?14:whole?8:5,fade:whole?18:10,w:10};wave(w);
        if(verified)monument(ev.sites,{magnitude:i.magnitude,tier:cmd.tier},false,p=>tick+Math.round(len2(wx(p.x-c.x),wz(p.z-c.z))/v*HZ));
        note('freeze',verified?'a verified milestone':'a milestone without verified evidence',whole?'a freeze sweeps the whole sea from its files'+(verified?'; monumental crystals rise where they are (lasting)':''):'a freeze around its files (structural scale: no spectacle token, or not verified)'+(verified?'; monumental crystals rise there (lasting)':''));break;}
      default:break;
    }
  }
  // ---- The score: notes nucleate and melt, the form warms and cools the lakes ---------------------------------------
  // music: the driver's musical clock (musical.js), at performance time T (ms). Notes whose onset is in (last, T].
  function regionForDegree(d,low){
    const live=data.regions.filter(r=>r.files>0);if(!live.length||d===null)return null;let best=null;
    for(const r of live)if(r.degree===d&&(!best||(low?r.files>best.files:r.files<best.files)))best=r;
    return best||live[d%live.length];
  }
  function listen(T_,music){
    if(!music||!Number.isFinite(T_))return;
    if(lastT===null||T_<lastT){lastT=T_;return;}
    const key=music.key(),cfg=music.config,barMs=240000/(cfg?.tempo>0?cfg.tempo:92),step=barMs/16;
    for(let b=Math.floor(lastT/barMs);b<=Math.floor(T_/barMs);b++){const x=music.bar(b);if(!x?.steps)continue;
      for(let k=0;k<16;k++){const at=b*barMs+k*step;if(at<=lastT||at>T_)continue;
        for(const n of x.steps[k]||[]){const v=q10(clamp(+n.velocity||0));
          if(n.group==='melody'||n.group==='counter'||n.group==='pad'){
            const r=regionForDegree(degreeOfMidi(n.midi,key),n.group==='pad');if(!r)continue;
            const h=mix(seed,b,k,n.midi|0),own=sites.filter(s=>s.region===r.rank),s0=own.length?own[h%own.length]:r;
            const a=u01(h,1)*TAU,dd=(own.length?5:0)+12*u01(h,2),x0=wx(s0.x+dd*dcos(a)),z0=wz(s0.z+dd*dsin(a));
            if(n.group==='pad')contact(x0,z0,(5+7*v)*P.spread,.9,P.pad,q10(clamp(+n.duration||2,1,6)),.8);
            else nucleate(x0,z0,P.nucleus*(n.group==='counter'?.6:1)*(.6+.8*v),1.6);}}}}
    lastT=T_;
    // the form (every half second): harmonic tension warms the lakes, release and resolution cool them
    if(tick-expressionAt>=HZ/2){expressionAt=tick;const e=music.at(T_);
      if(e)warmTarget=P.climate*(1.6*(q10(clamp(+e.tension||0))-.35)+.5*(q10(clamp(+e.energy||0))-.45)-.8*q10(clamp(+e.release||0)));}
  }
  // ---- The step ----------------------------------------------------------------------------------------------------
  function step(){
    if(dirty)rebuild();
    tick++;hPrev.set(H);phiPrev.set(phi);
    warm+=(warmTarget-warm)*(DT/6);craze*=1-DT/4;
    kc.fill(0);kt.fill(0);sq.fill(0);
    // thermal contacts (a conductance toward a temperature, ramped in and out)
    contacts=contacts.filter(c=>c.k1+c.ramp>tick);
    for(const c of contacts){const e=clamp((tick-c.k0)/c.ramp)*clamp((c.k1+c.ramp-tick)/c.ramp);if(e<=0)continue;
      forDisc(c.x,c.z,c.r,(i,q)=>{const k=c.k*e*(1-q);kc[i]+=k;kt[i]+=k*c.T;});}
    // waves: a freeze's cold front (a strong cold contact in its band, a lasting chill behind it), a re-formation's hot
    // ring, a surge along a channel
    waves=waves.filter(w=>w.kind==='freeze'?tick<w.k0+(w.R/w.v+w.hold+w.fade)*HZ:w.kind==='surge'?tick<w.k0+(w.len/w.v+2)*HZ:tick<w.k0+(w.R/w.v+2)*HZ);
    for(const w of waves){const r=(tick-w.k0)*DT*w.v;
      if(w.kind==='surge'){const a=Math.max(0,r-w.w),b=Math.min(w.len,r);for(let s=a;s<=b;s+=CELL)forDisc(w.x+w.ux*s,w.z+w.uz*s,CELL*P.channel,(i,q)=>{const k=w.A*(1-q);kc[i]+=k;kt[i]+=k*1.3;});continue;}
      for(let i=0;i<N;i++){const d=distTo(i,w.x,w.z);if(d>w.R||d>r)continue;
        if(w.kind==='reform'){if(r-d<w.w){const k=w.A;kc[i]+=k;kt[i]+=k*.9;}continue;}
        const age=(r-d)/w.v,e=age<w.hold?1:clamp(1-(age-w.hold)/w.fade);const k=(r-d<w.w?1.6:.35)*e*w.A;kc[i]+=k;kt[i]+=k*-.95;}}
    // channels: hot conduits, open where their opening front has passed
    const byIdx=data.channels;
    for(let i=0;i<N;i++){const ci=chanIdx[i];if(ci<0)continue;const c=byIdx[ci];if(!c)continue;const b=born.get(c.key)??tick;
      if((tick-b)*DT*P.opening<chanS[i])continue;const k=1.5*chanW[i];kc[i]+=k;kt[i]+=k*P.channelHeat;}
    // stress: from the files a failure covers, while they are failing
    for(const [id,a] of stressed){const p=posOf(id);if(p)forDisc(p.x,p.z,1.8*CELL,(i,q)=>{sq[i]+=3*a*(1-q);});}
    // sintering fronts: cells they have passed (their fracture fuses)
    sinters=sinters.filter(s=>tick<s.k0+(s.R/s.v+6)*HZ);
    const D=P.diffusion,eps=P.width,beta=P.beta,Lh=P.latent,rel=P.relax,Ds=P.stressDiffusion,str=P.strength,froth=P.froth,grow=P.growth*DT,seeding=P.seeding;
    for(let i=0;i<N;i++){
      const o=6*i,p=phi[i],t=T[i],L=regionOf(i);
      let sp=0,stt=0,gx=0,gz=0,ss=0,bj=i,bp=-1;const s0=st[i];
      for(let k=0;k<6;k++){const j=NB[o+k],pj=phi[j];sp+=pj;stt+=T[j];gx+=pj*DX[k];gz+=pj*DZ[k];const w=pj<p?pj:p;ss+=w*(st[j]-s0);if(pj>bp){bp=pj;bj=j;}}
      const g=p>=.5||bp<.5?gid[i]:gid[bj];
      const lapP=(2/3)*(sp-6*p),lapT=(2/3)*(stt-6*t);gx/=3;gz/=3;
      // the habit: speed by the interface's direction (n-fold, its strength and orientation)
      let a=1;const g2=gx*gx+gz*gz;
      if(g2>1e-6&&L.delta>0){const inv=1/Math.sqrt(g2),c=gx*inv,s=gz*inv;let zr=c*c-s*s,zi=2*c*s;
        if(L.fold===6){const r3=zr*c-zi*s,i3=zr*s+zi*c;zr=r3*r3-i3*i3;zi=2*r3*i3;}
        a=1+L.delta*(zr*GCOS[g]+zi*GSIN[g]);}
      let m=-beta*t;m=m>.45?.45:m<-.62?-.62:m;
      if(p>.02&&p<.98)m+=.06*(u01(seed,i,tick,1)-.5);
      let pn=p+DT*L.mob*a*(eps*lapP+2*p*(1-p)*(p-.5+m));
      // without a nucleus melt freezes only well below its melting point: rarely in a plain's supercooled melt (so a
      // plain is a mosaic of grains), everywhere at once in a freeze's wake
      if(p<.05&&t<-NUCLEATE){const x=-t-NUCLEATE;if(u01(seed,i,tick,2)<5*seeding*DT*x*x*x){pn=1;gid[i]=mix(seed,i,tick,4)%GRAINS;}}
      // a cell that freezes joins the grain it froze from, or (more often in deep undercooling) starts one of its own:
      // fast fronts fragment, so a plain grows as a mosaic of columnar grains radiating from its nuclei
      else if(p<.5&&pn>=.5){const x=-t-.1;gid[i]=u01(seed,i,tick,6)<seeding*(.002+.03*(x>0?x:0))?mix(seed,i,tick,8)%GRAINS:g;}
      // a superheated solid melts throughout; a lake warmed past its melting point opens melt at a few cells
      if(p>.98){if(t>SUPERHEAT)pn-=DT*4*(t-SUPERHEAT);else if(L.lake&&t>.03&&u01(seed,i,tick,3)<.5*DT*(t-.03))pn=.3;}
      pn=pn<0?0:pn>1?1:pn;
      const ta=taBase[i]+warm*L.sens;
      const tn=t+DT*(D*lapT+rel*(ta-t)+kt[i]-kc[i]*t)+Lh*(pn-p);
      phi2[i]=pn;T2[i]=tn;
      // froth: boiling melt; collapses as it cools
      const f=foam[i];foam[i]=clamp(f+DT*(tn>BOIL&&pn<.5?2*(tn-BOIL)*(1-f):-froth*f));
      // the column: toward its height while solid (taller where colder), into the melt when molten
      const h=H[i],ht=pn>.5?.9+cap[i]*GH[gid[i]]*(.5+.5*clamp(-tn/.35)):.9;H[i]=ht>h?Math.min(ht,h+grow):Math.max(ht,h-6*DT);
      // stress through connected solid; fracture where it exceeds the strength; sintering where a front has passed
      let sn=s0+DT*(Ds*(2/3)*ss-.06*s0+sq[i]);
      let fr=frac[i];
      if(pn<.5)fr=0;
      else{
        // each grain its own strength, its boundaries weaker: cracks run along the grains and take some whole
        const edge=gid[NB[o]]!==gid[i]||gid[NB[o+1]]!==gid[i]||gid[NB[o+2]]!==gid[i],si=str*(.7+.6*GSTR[gid[i]])*(edge?.6:1);
        if(sn>si)fr+=DT*4*(sn-si)*(1-fr);
        if(fr>0){let passed=null;for(const s of sinters){const r=(tick-s.k0)*DT*s.v;if(r>=distTo(i,s.x,s.z)){passed=s;break;}}
          // a sintering front relieves the stress it passes and fuses the grains back into new crystal grains (seams at
          // their boundaries remain); without one, grains whose stress has gone fuse back very slowly
          if(passed){sn*=1-6*DT;if(fr>.3&&sn<si){seam[i]=1;gid[i]=restGrain(i,passed.k0);}if(sn<si)fr-=DT*1.5*fr;}else if(sn<si)fr-=DT*.01*fr;}}
      st2[i]=sn<0?0:sn;
      frac[i]=fr<0?0:fr>1?1:fr;
      if(seam[i]>0)seam[i]*=1-DT/1800;
    }
    let x=phi;phi=phi2;phi2=x;x=T;T=T2;T2=x;x=st;st=st2;st2=x;
  }
  // ---- Rest: the matter as its laws hold it, for a performance's start or a generation's warm start -------------------
  function populate(k0=0){
    tick=k0|0;if(dirty)rebuild();
    for(let i=0;i<N;i++){const L=regionOf(i),cold=-taBase[i]-L.U;phi[i]=!L.lake||cold>.12?1:0;gid[i]=restGrain(i);T[i]=taBase[i];H[i]=phi[i]>.5?.9+cap[i]*GH[gid[i]]*(.5+.5*clamp(-T[i]/.35)):.9;
      frac[i]=0;foam[i]=0;seam[i]=0;st[i]=0;}
    hPrev.set(H);phiPrev.set(phi);
    for(const s of sites)if(s.kind===3)stressed.set(s.id,.6);
    for(const c of data.channels)born.set(c.key,-1e9);
    lastT=null;expressionAt=-1;
  }
  // ---- Snapshots ---------------------------------------------------------------------------------------------------
  const ARR=()=>({phi,T,st,H,frac,foam,seam,hPrev,phiPrev,gid});
  function snapshot(){const a={};for(const [k,v] of Object.entries(ARR()))a[k]=v.slice();
    return {tick,warm,warmTarget,craze,lastT,expressionAt,a,sites,data,contacts:structuredClone(contacts),waves:structuredClone(waves),stressed:[...stressed],sinters:structuredClone(sinters),
      monuments:structuredClone(monuments),born:[...born],growth:[...growth],surged:[...surged],director:director.snapshot(),log:log.slice()};}
  function restore(s){tick=s.tick;warm=s.warm;warmTarget=s.warmTarget;craze=s.craze;lastT=s.lastT;expressionAt=s.expressionAt;
    phi=s.a.phi.slice();T=s.a.T.slice();st=s.a.st.slice();H.set(s.a.H);frac.set(s.a.frac);foam.set(s.a.foam);seam.set(s.a.seam);hPrev.set(s.a.hPrev);phiPrev.set(s.a.phiPrev);gid.set(s.a.gid);
    sites=s.sites;data=s.data;contacts=structuredClone(s.contacts);waves=structuredClone(s.waves);stressed=new Map(s.stressed);sinters=structuredClone(s.sinters);
    monuments=structuredClone(s.monuments);born=new Map(s.born);growth=new Map(s.growth);surged=new Map(s.surged);director.restore(s.director);log=s.log.slice();dirty=true;}
  function digest(){let h=2166136261;const mixIn=v=>{h^=v&0xffff;h=Math.imul(h,16777619);h^=v>>>16;h=Math.imul(h,16777619);};
    for(let i=0;i<N;i++){mixIn(Math.round(phi[i]*4096));mixIn(Math.round(T[i]*4096)+65536);mixIn(Math.round(H[i]*256));mixIn(Math.round(frac[i]*4096));mixIn(Math.round(foam[i]*4096));mixIn(gid[i]);}
    mixIn(tick);mixIn(monuments.length);mixIn(stressed.size);return (h>>>0).toString(16).padStart(8,'0');}
  // ---- What a cell is now (presentation): its regime, column, glow; interpolated from the tick before ----------------
  function regimeOf(i){if(phi[i]>=.5)return frac[i]>.5?REGIME.grains:REGIME.crystal;return foam[i]>.35?REGIME.foam:REGIME.liquid;}
  return {
    get tick(){return tick;},
    setSites(list){sites=list||[];dirty=true;},
    setSiteData(d){if(d&&d!==data){data=d;dirty=true;}},
    populate,influence,listen,step,snapshot,restore,digest,regimeOf,
    setClimate(){},setGrid(){},
    // read-only views for the renderer and the inspector
    get fields(){return {phi,T,H,frac,foam,seam,hPrev,phiPrev,gid,reg,chanW,chanIdx};},
    get regions(){return data.regions;},get channels(){return data.channels;},get sites(){return sites;},
    get monuments(){return monuments;},get waves(){return waves;},get craze(){return craze;},get warm(){return warm;},
    get log(){return log;},born:key=>born.get(key),
    regionLaws:k=>k<0?SEA:lawsOf(k),
    stats(){let c=0,l=0,g=0,f=0,hot=0;for(let i=0;i<N;i++){const r=regimeOf(i);r===0?c++:r===1?l++:r===2?g++:f++;if(T[i]>GLOW&&phi[i]<.5)hot++;}
      return {tick,cells:N,crystal:c,liquid:l,grains:g,foam:f,molten:hot,monuments:monuments.length,contacts:contacts.length,waves:waves.length,stressed:stressed.size,
        sinters:sinters.length,channels:data.channels.length,regions:data.regions.filter(r=>r.files>0).length,warm:+warm.toFixed(3)};}
  };
}

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
// fractures, a recovery sinters, a verified milestone sends a freeze across the sea, raises monumental crystals and
// recrystallises the matter around them into one coherent crystal (the only lasting change, and only from verified
// evidence).
// The score (G3; musical.js bars, never the audio device; the notes as composed, none invented) acts on the matter at
// the scale of its phrases, in each lake's stage (its open melt, farthest from its files and shores):
//  - melody: a phrase is a succession of nuclei along a path its contour steers (a rising interval turns it one way, a
//    falling one the other, a rest lengthens the step); each note's crystal grows while it is held and meets its
//    neighbours' fronts, so the phrase grows as one branched crystal; the counter-melody grows side branches; the
//    phrases of a section grow as arms about the stage at its habit's angles (a repeated phrase repeats its arm);
//  - harmony: each bar's chord sets the stage's undercooling (a dominant drives the growth and its branching, the tonic
//    lets it rest), a cadence on the tonic lets the structure settle (its fronts stop, its interfaces relax, its melt
//    calms), a release, or the closing cadence of a section, melts it back;
//  - bass: drives a damped wave on the melt's surface at the stages; crystal reflects it, grains and foam absorb it, and
//    where it shakes undercooled melt hard enough the melt nucleates.
// Music never produces an engineering effect: no fracture, no sintering, no monument, nothing in the causal log.
import {HZ,DT,mix,u01} from './life/sim.js';
import {createDirector} from './director.js';
import {DEGREES,degreeOfMidi,hash} from './genesis-laws.js';
import {dsin,dcos,dexp} from './genesis-field.js';
export {HZ,DT};
export const MATTER_VERSION=2;
export const COLS=112,ROWS=128,CELL=2.6,SQ3=Math.sqrt(3),PX=COLS*CELL,PZ=ROWS/2*SQ3*CELL,NCELL=COLS*ROWS;
export const REGIME=Object.freeze({crystal:0,liquid:1,grains:2,foam:3});
export const MAXR=64,MAX_MONUMENTS=64;
// a verified milestone's coherent crystal (m); a phrase's reference reach (m: a stage scales it to its own)
export const MONO_R=16,PHRASE_R=40;
// a note's crystal: how fast it strikes up (m/s) and how long it takes to settle back (s)
const STRIKE=6,LIFT=10;
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
    climate:lerp(.08,.2,L('resonance')),           // how deep the harmony's tension undercools a stage
    ring:lerp(11,24,L('resonance')),               // the bass's drive on the melt
    waveSpeed:lerp(4.5,7.5,L('elasticity')),       // the melt's surface waves (cells/s): elastic matter rings faster
    waveDamp:lerp(.3,.9,L('viscosity')),           // their damping (1/s): viscous melt calms sooner
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
    cap:fold===2?lerp(2.6,4.4,h(6)):lerp(1.2,2.8,clamp(an/.64+.3*(h(6)-.5))),hue:h(8)};
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
// ---- A phrase's path (G3) ------------------------------------------------------------------------------------------
// A melody's pen through its phrase, in the phrase's own frame (metres; a stage scales and turns it): it starts 7 m out,
// heading out; every note after the first turns it by its interval (7 degrees a semitone, up to the left) and moves it
// on by the time since the note before (1.1 m a sixteenth, up to a dotted quarter), shorter as it nears the reach (a
// stage's, 40 m by default), never beyond it (there it runs along the rim); it leans outward, so a phrase is an arm.
// notes: [{at (sixteenths into the phrase), m (midi)}] in order -> the pen at each. Intervals and rhythm only: a phrase
// transposed draws the same arm, inverted its mirror.
export function phrasePath(notes,reach=PHRASE_R){
  let x=7,z=0,hx=1,hz=0,last=null;const out=[];
  for(const nt of notes){const m=nt.m,at=nt.at;
    if(last){const a=clamp((m-last.m)*.122,-.9,.9),c=dcos(a),sn=dsin(a);let ax=hx*c-hz*sn,az=hx*sn+hz*c;
      const d=len2(x,z)||1;ax=.8*ax+.2*x/d;az=.8*az+.2*z/d;const l=len2(ax,az)||1;hx=ax/l;hz=az/l;
      const e=d/reach,step=1.1*Math.min(6,Math.max(1,at-last.at))*Math.max(.3,1-e*e);x+=hx*step;z+=hz*step;
      const d2=len2(x,z);if(d2>reach){x*=reach/d2;z*=reach/d2;}}
    last={m,at};out.push({x,z,hx,hz});}
  return out;
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
// silentFrom (qualification only: the comparison films): the music's forces stop at this performance time (ms); until
// then the matter is exactly the one the player shows.
export function createMatterGrammar({recipe,silentFrom=Infinity}){
  const laws=recipe?.genome?.laws||{},seed=(recipe?.projectSeed>>>0)||1,P=physicsOf(laws),traits=recipe?.traits||{};
  const nRef=Math.max(4,Math.round(num(traits.districts,5))),fileRef=Math.max(12,num(traits.modules,40));
  const area=clamp(.5*PX*PZ/fileRef,24,70);
  return {id:'genesis-matter',version:silentFrom<Infinity?`${MATTER_VERSION}/silent@${silentFrom}`:MATTER_VERSION,listens:true,
    ecosystem:()=>({laws,P,projectSeed:seed,silentFrom}),
    create:spec=>createMatter(spec),
    habitat:(model,t)=>layoutOf(model,t,{seed,nRef,area}),
    siteOf:(id,model)=>model.modules.has(id)?id:model.districts.has(id)?`d:${id}`:null,
    influences:influencesOf};
}
// ---- The matter ------------------------------------------------------------------------------------------------------
// spec: {P (physicsOf), laws, projectSeed, seed (the generation's)}. The life driver's ecosystem interface: setSites,
// setSiteData, populate, influence, setClimate, setGrid, listen (the score), step, snapshot, restore, digest, stats.
export function createMatter(spec){
  const P=spec.P||physicsOf(spec.laws),pseed=spec.projectSeed>>>0||1,seed=spec.seed>>>0,silentFrom=num(spec.silentFrom,Infinity);
  const N=NCELL,F=()=>new Float32Array(N);
  // state (surf: the melt's surface waves and their velocity, G3)
  let phi=F(),T=F(),phi2=F(),T2=F(),st=F(),st2=F();
  // (lift: a note's crystal column, by its pitch: the height it grows to while it stays solid, G3)
  const H=F(),frac=F(),foam=F(),seam=F(),hPrev=F(),phiPrev=F(),gid=new Uint16Array(N),surf=F(),svel=F(),sPrev=F(),src=F(),lift=F();
  // the grains of matter at rest: the nearest of 180 points strewn over the sheet (the project's own), within its region
  const GP=[...Array(180)].map((_,k)=>[u01(pseed,k,1,0x9a1)*PX,u01(pseed,k,2,0x9a1)*PZ]);
  const restGrain=(i,salt=0)=>{let b=0,bd=Infinity;for(let k=0;k<GP.length;k++){const dx=wx(CX[i]-GP[k][0]),dz=wz(CZ[i]-GP[k][1]),d=dx*dx+dz*dz;if(d<bd){bd=d;b=k;}}return mix(pseed,b,reg[i]+2,0x9a2^salt)%GRAINS;};
  // static (from the layout, the monuments and the files' growth): region, ambient, column height, channels
  const reg=new Int16Array(N),taBase=F(),cap=F(),chanW=F(),chanS=F(),chanIdx=new Int16Array(N).fill(-1);
  // the stages (G3: where the score's phrases grow, one per lake) and the monuments' coherent crystal (its monument, and
  // the tick its recrystallising front reaches the cell)
  const stageW=F(),stageOf=new Int16Array(N).fill(-1),monoOf=new Int16Array(N).fill(-1),monoAt=new Float64Array(N),monoG=new Uint16Array(N);
  // (a region's stage stays where it was first placed, as its seat does, while that spot is still open melt: stageAt)
  let stages=[],stageAt=new Map();
  // per tick: thermal contacts (sum of conductances, sum of conductance x temperature) and the stress sources
  const kc=F(),kt=F(),sq=F();
  const R=[];   // region laws by rank
  let sites=[],siteMap=new Map(),data={regions:[],channels:[]},regionById=new Map(),dirty=true;
  let tick=0,craze=0,lastT=null;
  // the harmony in force (the bar it was read at, the stage's temperature and conductance, settling) and the bass's
  // drives {k0, k1, w (rad/s), A, g (its grain)}, the music's own log (never the causal log)
  // (every object the step reads has one shape, made here, also on restore, so its loops stay monomorphic: a hot loop
  // that meets a new shape is deoptimised, and the player's frame waits while it runs slowly)
  const mkHarm=(b=-1,T=0,k=0,smooth=0,damp=1,g=-1)=>({b,T,k,smooth,damp,g});
  const mkContact=c=>({x:c.x,z:c.z,r:c.r,k:c.k,T:c.T,k0:c.k0,k1:c.k1,ramp:c.ramp,rin:c.rin});
  const mkWave=w=>({kind:w.kind,x:w.x,z:w.z,ux:w.ux||0,uz:w.uz||0,len:w.len||0,v:w.v,A:w.A,R:w.R||0,hold:w.hold||0,fade:w.fade||0,w:w.w,k0:w.k0});
  const mkSinter=c=>({x:c.x,z:c.z,k0:c.k0,v:c.v,R:c.R});
  const mkDrive=d=>({k0:d.k0,k1:d.k1,w:d.w,A:d.A,g:d.g});
  const mkMonument=m=>({x:m.x,z:m.z,k0:m.k0,size:m.size,seed:m.seed,n:m.n,site:m.site,grain:m.grain});
  let harm=mkHarm(),drives=[],mlog=[];
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
    // a verified milestone's monuments: a lasting cold, and around them one coherent crystal (their grain), recrystallised
    // by a front from each at 4 m/s
    monoOf.fill(-1);
    monuments.forEach((m,j)=>forDisc(m.x,m.z,MONO_R,(i,q)=>{taBase[i]-=.5*(1-q);if(monoOf[i]<0){monoOf[i]=j;monoG[i]=m.grain;monoAt[i]=m.k0+Math.sqrt(q)*MONO_R/4*HZ;}}));
    // channels: a capsule from the importing region's seat to the imported's (the shorter way round), weighted to its axis
    chanW.fill(0);chanIdx.fill(-1);const byRank=new Map(data.regions.map(r=>[r.rank,r]));
    data.channels.forEach((c,ci)=>{const A=byRank.get(c.a),B=byRank.get(c.b);if(!A||!B)return;const bx=wx(B.x-A.x),bz=wz(B.z-A.z),len=len2(bx,bz)||1;
      const hw=P.channel*CELL*(.85+.15*Math.min(3,31-Math.clz32(1+c.count)));
      for(let s=0;s<=len;s+=CELL*.5)forDisc(A.x+bx*s/len,A.z+bz*s/len,hw,(i,q)=>{const w=1-q;if(w>chanW[i]){chanW[i]=w;chanS[i]=s;chanIdx[i]=ci;}});});
    const keys=new Set(data.channels.map(c=>c.key));for(const k of [...born.keys()])if(!keys.has(k))born.delete(k);
    for(const k of keys)if(!born.has(k))born.set(k,tick);
    stagesOf(live);
  }
  // The stages: in each lake, the cell of open melt farthest from its files, the channels and its region's border (a
  // distance transform over the cells), so stages keep apart; its reach the distance from there to matter that is not
  // melt (the files' islands, the channels, the plains: a neighbouring lake's melt is no shore), .72 of it, 12 to 48 m,
  // so its cold never reaches a shore. A lake too small or too crowded has none.
  const dist=new Int16Array(N),hard=new Int16Array(N),queue=new Int32Array(N);
  function transform(d,obstacle){d.fill(-1);let qh=0,qt=0;
    for(let i=0;i<N;i++)if(obstacle(i)){d[i]=0;queue[qt++]=i;}
    for(const s of sites)forDisc(s.x,s.z,s.r+2*CELL,i=>{if(d[i]!==0){d[i]=0;queue[qt++]=i;}});
    if(!qt)return false;
    while(qh<qt){const i=queue[qh++];for(let k=0;k<6;k++){const j=NB[6*i+k];if(d[j]<0){d[j]=d[i]+1;queue[qt++]=j;}}}
    return true;}
  function stagesOf(live){
    stages=[];stageW.fill(0);stageOf.fill(-1);
    const melt=i=>{const k=reg[i];return k>=0&&lawsOf(k).lake&&chanW[i]===0;};
    if(!transform(hard,i=>!melt(i)))return;
    transform(dist,i=>{if(!melt(i))return true;const k=reg[i];for(let d=0;d<6;d++)if(reg[NB[6*i+d]]!==k)return true;return false;});
    for(const r of live){if(!lawsOf(r.rank).lake)continue;let best=-1,bd=0;const kept=stageAt.get(r.rank);
      if(kept!==undefined&&reg[kept]===r.rank&&dist[kept]>=6){best=kept;bd=dist[kept];}
      else for(let i=0;i<N;i++)if(reg[i]===r.rank&&dist[i]>bd){bd=dist[i];best=i;}
      if(best<0)continue;stageAt.set(r.rank,best);
      const reach=Math.min(48,hard[best]*CELL*.72);if(reach<12)continue;
      const S={rank:r.rank,x:CX[best],z:CZ[best],R:reach,fold:lawsOf(r.rank).fold},k=stages.length;stages.push(S);
      // (its weight fades to nothing three cells from a file's island, a channel or a plain: the music never touches
      // the matter of the structure)
      forDisc(S.x,S.z,S.R,(i,q)=>{if(hard[i]<=0)return;const w=(q<.6?1:clamp((1-q)/.4))*clamp(hard[i]/3);if(w>stageW[i]){stageW[i]=w;stageOf[i]=k;}});}
  }
  // ---- Inputs ------------------------------------------------------------------------------------------------------
  const posOf=id=>{const s=siteMap.get(id);if(s)return s;const r=regionById.get(id);return r?{x:r.x,z:r.z,region:r.rank}:null;};
  const regionAt=id=>{const s=siteMap.get(id);if(s)return data.regions[s.region]||null;return regionById.get(id)||null;};
  let curRegions=[];   // the regions the input being applied concerns (for the causal log)
  const note=(kind,what,rule,extra={})=>{log.push({tick,kind,what,rule,regions:curRegions,...extra});if(log.length>48)log.shift();};
  function contact(x,z,r,k,temp,secs,ramp=.4,rampIn=ramp){contacts.push(mkContact({x,z,r,k,T:temp,k0:tick,k1:tick+Math.round(secs*HZ),ramp:Math.max(1,Math.round(ramp*HZ)),rin:Math.max(1,Math.round(rampIn*HZ))}));if(contacts.length>320)contacts.shift();}
  function wave(o){waves.push(mkWave({k0:tick,...o}));if(waves.length>6)waves.shift();}
  // a surge of heat along the channels a region imports through (coupling: energy travels toward what it depends on),
  // at most one per channel every 4 s
  function surgeFrom(rank,A){const R0=data.regions.find(r=>r.rank===rank);if(!R0)return 0;let n=0;
    for(const c of data.channels){if(c.a!==rank||tick-(surged.get(c.key)??-1e9)<4*HZ)continue;const B=data.regions.find(r=>r.rank===c.b);if(!B)continue;
      const dx=wx(B.x-R0.x),dz=wz(B.z-R0.z),len=len2(dx,dz)||1;surged.set(c.key,tick);n++;wave({kind:'surge',x:R0.x,z:R0.z,ux:dx/len,uz:dz/len,len,v:P.opening*1.4,A,w:7});}
    return n;}
  // a crystal nucleus: the melt within r cells becomes solid (a new grain), releasing its latent heat; `quench` cools the
  // melt around it for a moment (a note's: its crystal grows visibly before the lake's own temperature decides its fate)
  // (a note's nucleus is struck cold, `chill`: its latent heat is taken up by the note's quench)
  function nucleate(x,z,r,quench=0,g=mix(seed,tick,Math.round(x*16),Math.round(z*16))%GRAINS,chill=null,up=0){let n=0;
    // (a note's nucleus, up > 0, recrystallises its spot as its own grain even where crystal stood: its pillar)
    forDisc(x,z,r*CELL,(i,q)=>{if(up>0){if(up>lift[i])lift[i]=up;gid[i]=g;}if(phi[i]<.5){T[i]=chill===null?T[i]+P.latent*(1-phi[i]):Math.min(T[i],chill);phi[i]=1;gid[i]=g;n++;}});
    if(quench>0)contact(x,z,r*CELL*3.2,quench,-.45,1.4,.15);return n;}
  function monument(siteIds,ev,grown,arrive=null){
    for(const id of siteIds.slice(0,6)){const p=posOf(id);if(!p)continue;const k=mix(pseed,hash(id),monuments.length);
      monuments.push(mkMonument({x:p.x,z:p.z,k0:grown?-1e9:(arrive?arrive(p):tick),size:clamp(+ev.magnitude||0,.3,1.4)*(ev.tier>=4?1.3:1),seed:k,n:3+(k%5),site:id,grain:k%GRAINS}));}
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
        for(const id of list){stressed.delete(id);const p=posOf(id);if(p){sinters.push(mkSinter({x:p.x,z:p.z,k0:tick,v:P.sinter,R:90}));if(sinters.length>8)sinters.shift();}}
        if(!ev.sites.length){craze=0;}note('sinter','a failure was recovered','a sintering front fuses the grains back into crystal and leaves seams');break;}
      case 'validation.passed':for(const p of sites_.slice(0,6))contact(p.x,p.z,10*P.spread,1.2,-.55,3);note('anneal','a validation passed on these files','their matter is annealed: nearby melt crystallises (no celebration)');break;
      case 'refactor.validated':for(const p of sites_.slice(0,3))wave({kind:'reform',x:p.x,z:p.z,v:10,A:1.1*s,R:40,w:6});note('reform','a refactor was validated','the matter around it re-forms');break;
      case 'repository.checkpoint':for(const p of sites_.slice(0,12))contact(p.x,p.z,8*P.spread,.9,-.45,3);note('consolidate','a commit was observed','a restrained cooling consolidates the committed files\' matter');break;
      case 'world.expanded':{const c=data.regions[0];wave({kind:'reform',x:c?c.x:0,z:c?c.z:0,v:30,A:.9*s,R:PZ*.49,w:6});note('expand','the project entered a new chapter','a wave of re-formation crosses the whole sea from the first region');break;}
      case 'agent.collision':for(const p of sites_)contact(p.x,p.z,2.5*CELL,2,1.3,2);note('meet','two agents worked in the same place','their heat meets there (no progress is credited)');break;
      case 'milestone.achieved':{
        const verified=i.evidence==='verified',c=sites_.length?sites_[0]:(data.regions[0]||{x:0,z:0}),whole=cmd.tier>=3;
        const v=25,w={kind:'freeze',x:c.x,z:c.z,v,A:whole?.95:.7,R:whole?PZ*.49:70,hold:cmd.tier>=4?10:whole?6:5,fade:whole?12:8,w:10};wave(w);
        if(verified)monument(ev.sites,{magnitude:i.magnitude,tier:cmd.tier},false,p=>tick+Math.round(len2(wx(p.x-c.x),wz(p.z-c.z))/v*HZ));
        note('freeze',verified?'a verified milestone':'a milestone without verified evidence',whole?'a freeze sweeps the whole sea from its files'+(verified?'; monumental crystals rise where they are (lasting)':''):'a freeze around its files (structural scale: no spectacle token, or not verified)'+(verified?'; monumental crystals rise there (lasting)':''));break;}
      default:break;
    }
  }
  // ---- The score (G3): phrases, harmony, cadences, the bass -------------------------------------------------------------
  // music: the driver's musical clock (musical.js), at performance time T (ms). Notes whose onset is in (last, T].
  // A melody's pen through its phrase (four bars, the score's own) up to step k of bar b (phrasePath, above).
  function penOf(music,b,k,reach){
    const b0=b-(((b%4)+4)%4),notes=[];
    for(let bb=b0;bb<=b;bb++){const xb=music.bar(bb);if(!xb?.steps)continue;
      for(let s=0;s<16&&!(bb===b&&s>k);s++)for(const nt of xb.steps[s]||[])if(nt.group==='melody')notes.push({at:(bb-b0)*16+s,m:Math.round(+nt.midi||0)});}
    if(!notes.length)return null;const path=phrasePath(notes,reach),p=path[path.length-1];
    return {...p,n:notes.length,m:notes[notes.length-1].m};
  }
  // A point of the phrase's frame in a stage: the section's own turn of the stage, the phrase's arm (its habit's angles:
  // six arms, or two for a needle habit, then between them); the path drawn within .85 of the stage's reach.
  function place(S,x,px,pz){
    const sec=x.expression?.section|0,ord=Math.floor((x.form?.bar|0)/4),f=S.fold;
    const a=u01(pseed,S.rank+1,sec,0x7e7a)*TAU+(ord%f)*TAU/f+(Math.floor(ord/f)&1)*Math.PI/f,c=dcos(a),s=dsin(a);
    return [wx(S.x+c*px-s*pz),wz(S.z+s*px+c*pz),S.R/PHRASE_R];
  }
  // a pitch's grain: one orientation per pitch class (crystals of one pitch share their facets' light)
  // (a note's crystal is held by its cold while it sounds, then by a weak memory of it: MEMORY s, fading over 10)
  const MEMORY=36;
  // a note's grain: its own (the step it sounds on spreads them), its orientation (the low byte, the faces' tilt) its
  // pitch class's, so crystals of one pitch share their faces' light; its column's height by its pitch (1.5 to 9 m)
  const pitchGrain=(m,sec,at)=>(((at*5)&15)<<8)|(((((m%12)+12)%12)*85+(sec&7)*3+1)&255);
  const pitchLift=m=>1.5+7.5*clamp((m-55)/36);
  const mnote=(kind,what,rule)=>{mlog.push({tick,kind,what,rule});if(mlog.length>24)mlog.shift();};
  // The harmony of a new bar: the chord's tension (score.js expression: the function of the chord, the section) sets the
  // stages' undercooling, deeper with the Lawbook's resonance; a phrase closing on the tonic settles; a release, and the
  // closing cadence of a section, warms the stages so what grew there melts back.
  function harmonyOf(b,x){
    const e=x.expression||{},ten=q10(clamp(+e.tension||0)),rel=q10(clamp(+e.release||0)),ly=x.layers||[];
    const melody=ly.includes('melody'),pad=ly.includes('pad'),resolved=(e.barInPhrase|0)>=2&&x.chord===0&&(melody||pad);
    // (about the melting point: tension takes the stage below it, so the phrases' crystal thickens and branches, rest
    // above it, so their finest parts recede; the notes' own cold holds the arms meanwhile; a resolved cadence rests above
    // it with relaxed interfaces: the arms round off; a release melts them)
    let t=resolved?.04:.045-.4*P.climate*ten*(melody?1:.7);
    if(rel>0)t=t*(1-rel)+.22*rel;
    // (what freezes in a stage under this bar's harmony is its own grain: one ring of growth per bar, its faces' tilt by
    // the chord, so a chord's rings share their light)
    harm=mkHarm(b,q10(t),.5,resolved?.6:0,resolved?3:1,((((b*3)&15)<<8)|((((x.chord|0)%7+7)%7)*36+11))%GRAINS);
    if(resolved&&(e.barInPhrase|0)===2)mnote('cadence','the phrase closes on the tonic','the stages settle: fronts stop, interfaces relax, the melt calms');
    if(rel>.3&&(e.barInPhrase|0)===0)mnote('release','the music releases','the stages warm: what the phrases grew melts back');
  }
  function listen(T_,music){
    if(!music||!Number.isFinite(T_))return;
    if(lastT===null||T_<lastT){lastT=T_;return;}
    if(T_>=silentFrom){harm=mkHarm();lastT=T_;return;}
    const cfg=music.config,barMs=240000/(cfg?.tempo>0?cfg.tempo:92),step=barMs/16;
    for(let b=Math.floor(lastT/barMs);b<=Math.floor(T_/barMs);b++){const x=music.bar(b);if(!x?.steps)continue;
      if(b*barMs>lastT&&b*barMs<=T_)harmonyOf(b,x);
      for(let k=0;k<16;k++){const at=b*barMs+k*step;if(at<=lastT||at>T_)continue;
        for(const n of x.steps[k]||[]){const v=q10(clamp(+n.velocity||0)),dur=q10(clamp(+n.duration||.5,.2,6)),m=Math.round(+n.midi||0);
          if(n.group==='melody'){const g=pitchGrain(m,x.expression?.section|0,b*16+k);let first=false;
            for(const S of stages){const p=penOf(music,b,k,.85*S.R);if(!p)continue;first=p.n===1;const [px,pz,sc]=place(S,x,p.x,p.z),r=Math.max(1.8,P.nucleus*(.5+.8*v)*Math.sqrt(sc));
              nucleate(px,pz,r,0,g,-.25,pitchLift(m));contact(px,pz,r*CELL*1.3,1.5+3*v,-.3,dur,.1);contact(px,pz,r*CELL,.6,-.12,MEMORY,10,.3);}
            if(first)mnote('phrase',`a phrase begins (bar ${b})`,'its notes nucleate one after another along an arm of each stage');}
          else if(n.group==='counter'){const g=pitchGrain(m,x.expression?.section|0,b*16+k);
            for(const S of stages){const p=penOf(music,b,k,.85*S.R)||{x:7,z:0,hx:1,hz:0,m};const d=clamp(m-p.m,-12,12),side=d<0?-1:1,o=3+.5*Math.abs(d);
              const [px,pz,sc]=place(S,x,p.x-p.hz*side*o,p.z+p.hx*side*o),r=Math.max(1.8,.7*P.nucleus*(.5+.8*v)*Math.sqrt(sc));
              nucleate(px,pz,r,0,g,-.25,pitchLift(m));contact(px,pz,r*CELL*1.3,1.2+3*v,-.3,dur,.1);contact(px,pz,r*CELL,.6,-.12,MEMORY,10,.3);}}
          else if(n.group==='bass'&&stages.length){const f=.28*dexp((clamp(m,28,64)-36)*.0577623);
            drives.push(mkDrive({k0:tick,k1:tick+Math.round(dur*HZ),w:TAU*f,A:v,g:pitchGrain(m,0,b*16+k)}));if(drives.length>4)drives.shift();}}}}
    lastT=T_;
  }
  // ---- The bass's waves (G3) ----------------------------------------------------------------------------------------
  // A damped wave equation on the melt's surface, driven in the stages by the bass's held notes (at a frequency from
  // their pitch: lower notes, longer waves): the bass sounds through the crystal, so the melt rings where it touches the
  // stages' crystal (the phrases' arms radiate the waves) and, more faintly, at their centres. Its speed and damping are
  // the Lawbook's (a large wave breaks: its damping grows with its height); crystal is rigid and reflects it, grains and
  // foam carry it but absorb it; a settling stage calms.
  // Quiet (no drive, no motion left) it is exactly zero and skipped.
  const SONO=.06;let wq=true;
  function stepWaves(){
    drives=drives.filter(d=>tick<d.k1+2*HZ);
    if(wq&&!drives.length)return;
    src.fill(0);let drv=0;
    for(const d of drives){const age=(tick-d.k0)*DT,env=clamp(age/.15)*dexp(-age/1.6)*(tick<d.k1?1:dexp(-(tick-d.k1)*DT/.3)),a=P.ring*d.A*env*dsin(d.w*age);drv+=a;
      for(const S of stages)forDisc(S.x,S.z,2.4*CELL,(i,q)=>{src[i]+=.5*a*(1-q);});}
    const c2=P.waveSpeed*P.waveSpeed*(2/3),gb=P.waveDamp,calm=harm.damp;let mv=0;
    for(let i=0;i<N;i++){if(phi[i]>=.5&&frac[i]<.5){svel[i]=0;continue;}const o=6*i,u=surf[i];let s=0,touch=false;
      for(let k=0;k<6;k++){const j=NB[o+k];if(phi[j]<.5||frac[j]>=.5)s+=surf[j]-u;else touch=true;}
      const f=touch&&stageW[i]>.2?drv*stageW[i]:0;
      const v=svel[i]+DT*(c2*s-(gb*(1+(calm-1)*stageW[i])*(1+3*u*u)+(phi[i]>=.5?3:0)+4*foam[i])*svel[i]+src[i]+f);svel[i]=v;if(v>mv)mv=v;else if(-v>mv)mv=-v;}
    for(let i=0;i<N;i++){if(phi[i]>=.5&&frac[i]<.5)surf[i]*=1-8*DT;else surf[i]+=DT*svel[i];}
    if(!drives.length&&mv<1e-4){surf.fill(0);svel.fill(0);wq=true;}else wq=false;
  }
  // ---- The step ----------------------------------------------------------------------------------------------------
  function step(){
    if(dirty)rebuild();
    tick++;hPrev.set(H);phiPrev.set(phi);sPrev.set(surf);
    craze*=1-DT/4;
    kc.fill(0);kt.fill(0);sq.fill(0);
    // thermal contacts (a conductance toward a temperature, ramped in and out)
    contacts=contacts.filter(c=>c.k1+c.ramp>tick);
    for(const c of contacts){const e=clamp((tick-c.k0)/c.rin)*clamp((c.k1+c.ramp-tick)/c.ramp);if(e<=0)continue;
      forDisc(c.x,c.z,c.r,(i,q)=>{const k=c.k*e*(1-q);kc[i]+=k;kt[i]+=k*c.T;});}
    // waves: a freeze's cold front (a strong cold contact in its band, a lasting chill behind it), a re-formation's hot
    // ring, a surge along a channel
    waves=waves.filter(w=>w.kind==='freeze'?tick<w.k0+(w.R/w.v+w.hold+w.fade)*HZ:w.kind==='surge'?tick<w.k0+(w.len/w.v+2)*HZ:tick<w.k0+(w.R/w.v+2)*HZ);
    for(const w of waves){const r=(tick-w.k0)*DT*w.v;
      if(w.kind==='surge'){const a=Math.max(0,r-w.w),b=Math.min(w.len,r);for(let s=a;s<=b;s+=CELL)forDisc(w.x+w.ux*s,w.z+w.uz*s,CELL*P.channel,(i,q)=>{const k=w.A*(1-q);kc[i]+=k;kt[i]+=k*1.3;});continue;}
      for(let i=0;i<N;i++){const d=distTo(i,w.x,w.z);if(d>w.R||d>r)continue;
        if(w.kind==='reform'){if(r-d<w.w){const k=w.A;kc[i]+=k;kt[i]+=k*.9;}continue;}
        const age=(r-d)/w.v,e=age<w.hold?1:clamp(1-(age-w.hold)/w.fade);const k=(r-d<w.w?1.6:.25)*e*w.A;kc[i]+=k;kt[i]+=k*-.95;}}
    // channels: hot conduits, open where their opening front has passed
    const byIdx=data.channels;
    for(let i=0;i<N;i++){const ci=chanIdx[i];if(ci<0)continue;const c=byIdx[ci];if(!c)continue;const b=born.get(c.key)??tick;
      if((tick-b)*DT*P.opening<chanS[i])continue;const k=1.5*chanW[i];kc[i]+=k;kt[i]+=k*P.channelHeat;}
    // stress: from the files a failure covers, while they are failing
    for(const [id,a] of stressed){const p=posOf(id);if(p)forDisc(p.x,p.z,1.8*CELL,(i,q)=>{sq[i]+=3*a*(1-q);});}
    // sintering fronts: cells they have passed (their fracture fuses)
    sinters=sinters.filter(s=>tick<s.k0+(s.R/s.v+6)*HZ);
    // the harmony: each stage drawn toward its temperature (G3)
    if(harm.k>0)for(let i=0;i<N;i++){const w=stageW[i];if(w>0){const k=harm.k*w;kc[i]+=k;kt[i]+=k*harm.T;}}
    // the bass: the melt's surface waves
    stepWaves();
    const settle=harm.smooth,hg=harm.g,bassG=drives.length?drives[drives.length-1].g:0;
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
      // (a stage settling on a cadence: its interfaces relax, as if their energy rose)
      const sw=stageW[i];
      let pn=p+DT*L.mob*a*(eps*(1+.9*settle*sw)*lapP+2*p*(1-p)*(p-.5+m));
      // without a nucleus melt freezes only well below its melting point: rarely in a plain's supercooled melt (so a
      // plain is a mosaic of grains), everywhere at once in a freeze's wake; never in a stage's clean melt, where only
      // the music nucleates: its notes, and the bass where its waves shake the undercooled melt hard enough
      if(p<.05&&t<-NUCLEATE&&sw<.2){const x=-t-NUCLEATE;if(u01(seed,i,tick,2)<5*seeding*DT*x*x*x){pn=1;gid[i]=mix(seed,i,tick,4)%GRAINS;}}
      else if(p<.05&&sw>=.2&&t<-.02&&drives.length){const e=surf[i]*surf[i]-SONO;if(e>0&&u01(seed,i,tick,9)<4*seeding*e*(-t)*DT){pn=1;gid[i]=bassG;}}
      // a cell that freezes joins the grain it froze from, or (more often in deep undercooling) starts one of its own:
      // fast fronts fragment, so a plain grows as a mosaic of columnar grains radiating from its nuclei
      else if(p<.5&&pn>=.5){const x=-t-.1;gid[i]=sw>=.2&&hg>=0?hg:u01(seed,i,tick,6)<seeding*(.002+.03*(x>0?x:0))?mix(seed,i,tick,8)%GRAINS:g;}
      // a superheated solid melts throughout; a lake warmed past its melting point opens melt at cells here and there
      // (a freeze's crust on a lake thaws within seconds of the cold's going)
      if(p>.98){if(t>SUPERHEAT)pn-=DT*4*(t-SUPERHEAT);else if(L.lake&&t>.01&&u01(seed,i,tick,3)<4*DT*(t-.01))pn=.3;}
      pn=pn<0?0:pn>1?1:pn;
      // a verified milestone's coherent crystal: solid within its reach takes its grain as its front passes (lasting)
      const mj=monoOf[i];if(mj>=0&&pn>=.5&&tick>=monoAt[i])gid[i]=monoG[i];
      const tn=t+DT*(D*lapT+rel*(taBase[i]-t)+kt[i]-kc[i]*t)+Lh*(pn-p);
      phi2[i]=pn;T2[i]=tn;
      // froth: boiling melt; collapses as it cools
      const f=foam[i];foam[i]=clamp(f+DT*(tn>BOIL&&pn<.5?2*(tn-BOIL)*(1-f):-froth*f));
      // the column: toward its height while solid (taller where colder), into the melt when molten
      // (a note's crystal strikes up to its pitch's height within a second and settles over about ten (LIFT s), so the
      // newest notes stand tallest: the phrase passes through its arm as a crest; molten, it forgets it)
      const lf=lift[i];if(pn<.5)lift[i]=0;else if(lf>0)lift[i]=lf<.05?0:lf*(1-DT/LIFT);
      const h=H[i],ht=pn>.5?Math.max(.9+cap[i]*GH[gid[i]]*(.5+.5*clamp(-tn/.35)),.9+lift[i]):.9;H[i]=ht>h?Math.min(ht,h+(lf>0?STRIKE*DT:grow)):Math.max(ht,h-6*DT);
      // stress through connected solid; fracture where it exceeds the strength; sintering where a front has passed
      let sn=s0+DT*(Ds*(2/3)*ss-.06*s0+sq[i]);
      let fr=frac[i];
      if(pn<.5)fr=0;
      else{
        // each grain its own strength, its boundaries weaker: cracks run along the grains and take some whole
        const edge=gid[NB[o]]!==gid[i]||gid[NB[o+1]]!==gid[i]||gid[NB[o+2]]!==gid[i],si=str*(.7+.6*GSTR[gid[i]])*(edge?.6:1)*(mj>=0?1.5:1);
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
    tick=k0|0;stageAt=new Map();dirty=true;rebuild();
    for(let i=0;i<N;i++){const L=regionOf(i),cold=-taBase[i]-L.U;phi[i]=!L.lake||cold>.12?1:0;gid[i]=restGrain(i);T[i]=taBase[i];H[i]=phi[i]>.5?.9+cap[i]*GH[gid[i]]*(.5+.5*clamp(-T[i]/.35)):.9;
      frac[i]=0;foam[i]=0;seam[i]=0;st[i]=0;}
    hPrev.set(H);phiPrev.set(phi);surf.fill(0);svel.fill(0);sPrev.fill(0);lift.fill(0);wq=true;
    for(const s of sites)if(s.kind===3)stressed.set(s.id,.6);
    for(const c of data.channels)born.set(c.key,-1e9);
    lastT=null;harm=mkHarm();drives=[];
  }
  // ---- Snapshots ---------------------------------------------------------------------------------------------------
  const ARR=()=>({phi,T,st,H,frac,foam,seam,hPrev,phiPrev,gid,surf,svel,sPrev,lift});
  function snapshot(){const a={};for(const [k,v] of Object.entries(ARR()))a[k]=v.slice();
    return {tick,craze,lastT,harm:{...harm},drives:structuredClone(drives),mlog:mlog.slice(),wq,stageAt:[...stageAt],a,sites,data,contacts:structuredClone(contacts),waves:structuredClone(waves),stressed:[...stressed],sinters:structuredClone(sinters),
      monuments:structuredClone(monuments),born:[...born],growth:[...growth],surged:[...surged],director:director.snapshot(),log:log.slice()};}
  function restore(s){tick=s.tick;craze=s.craze;lastT=s.lastT;const h=s.harm;harm=mkHarm(h.b,h.T,h.k,h.smooth,h.damp,h.g);drives=s.drives.map(mkDrive);mlog=s.mlog.slice();wq=s.wq;stageAt=new Map(s.stageAt);
    phi=s.a.phi.slice();T=s.a.T.slice();st=s.a.st.slice();H.set(s.a.H);frac.set(s.a.frac);foam.set(s.a.foam);seam.set(s.a.seam);hPrev.set(s.a.hPrev);phiPrev.set(s.a.phiPrev);gid.set(s.a.gid);
    surf.set(s.a.surf);svel.set(s.a.svel);sPrev.set(s.a.sPrev);lift.set(s.a.lift);
    sites=s.sites;data=s.data;contacts=s.contacts.map(mkContact);waves=s.waves.map(mkWave);stressed=new Map(s.stressed);sinters=s.sinters.map(mkSinter);
    monuments=s.monuments.map(mkMonument);born=new Map(s.born);growth=new Map(s.growth);surged=new Map(s.surged);director.restore(s.director);log=s.log.slice();dirty=true;}
  function digest(){let h=2166136261;const mixIn=v=>{h^=v&0xffff;h=Math.imul(h,16777619);h^=v>>>16;h=Math.imul(h,16777619);};
    for(let i=0;i<N;i++){mixIn(Math.round(phi[i]*4096));mixIn(Math.round(T[i]*4096)+65536);mixIn(Math.round(H[i]*256));mixIn(Math.round(frac[i]*4096));mixIn(Math.round(foam[i]*4096));mixIn(gid[i]);mixIn(Math.round(surf[i]*4096)+65536);mixIn(Math.round(lift[i]*256));}
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
    get fields(){return {phi,T,H,frac,foam,seam,hPrev,phiPrev,gid,reg,chanW,chanIdx,surf,surfPrev:sPrev,stageW,stageOf,monoOf};},
    get regions(){return data.regions;},get channels(){return data.channels;},get sites(){return sites;},
    get monuments(){return monuments;},get waves(){return waves;},get craze(){return craze;},
    get log(){return log;},born:key=>born.get(key),
    // the music's (G3): the stages, the harmony in force, its own log
    get stages(){return stages;},get harmony(){return harm;},get musicLog(){return mlog;},
    regionLaws:k=>k<0?SEA:lawsOf(k),
    stats(){let c=0,l=0,g=0,f=0,hot=0;for(let i=0;i<N;i++){const r=regimeOf(i);r===0?c++:r===1?l++:r===2?g++:f++;if(T[i]>GLOW&&phi[i]<.5)hot++;}
      return {tick,cells:N,crystal:c,liquid:l,grains:g,foam:f,molten:hot,monuments:monuments.length,contacts:contacts.length,waves:waves.length,stressed:stressed.size,
        sinters:sinters.length,channels:data.channels.length,regions:data.regions.filter(r=>r.files>0).length,stages:stages.length,harmony:harm.T,drives:drives.length};}
  };
}

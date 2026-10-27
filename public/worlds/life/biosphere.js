// Fractal Biosphere's digital life: an underwater ecology living among the organisms the code grows. Pure (no rendering):
// the grammar of the ecosystem (life/sim.js) for the world (biosphere.js draws it), tested in Node
// (tests/life-biosphere.test.js).
//
// Four populations, each with its own rules (no entity knows the choreography; it emerges from local rules and the
// shared fields):
//  - pollinators  forage among the crowns (the organisms' heads). Each crown holds nectar (it regenerates slowly and is drunk by its visitors);
//                 its appeal is winner-take-more (squared): bright, nourished, lasting, new, rich in energy, marked by
//                 other pollinators' trails (their pheromone), full of nectar, not overcrowded for its size, not
//                 strained, near is better, on an organism the eye goes to (focal: the world's own measure of an
//                 organism's presence, so the usual attractors are in view). So one or two crowns draw a gathering that grows (each visitor marks it
//                 more), circles it at its own radius and height, feeds, crowds; when the nectar runs low, the crowd
//                 exceeds what the crown carries, or a visitor is fed, they peel away carrying its influence (a stronger
//                 trail), and those leaving the same crown follow the one who left just before (a stream toward the
//                 next crown), where a new concentration forms while the old one fades and its nectar returns. A
//                 disturbance (a failing run on that subsystem) opens a void around its organism and makes the whole
//                 water flinch for a few seconds (every gathering scatters, colonies part, settled spores lift,
//                 drifters stir; the pollinators come back as it passes); a recovery draws them back to the organism;
//                 a verified milestone makes a lasting hotspot. Only as many are awake as the crowns can feed (the
//                 rest rest, dormant and dim, until organisms appear).
//  - spores       ride the broad current (and the circulation a gathering of pollinators stirs up), are slowed and
//                 deflected by the organisms' trunks and crowns, collect where the water is calm close to a structure
//                 (settle) and are dislodged again by the momentum of a passing swarm, a disturbance or a stronger current.
//  - plankton     bioluminescent micro-organisms in coordinated colonies (separation, alignment, cohesion), steered by
//                 the fields (toward energy, away from disturbance), curious about a new organism, resting low when
//                 spent; they shy away from pollinators and drifters (a colony parts around them).
//  - drifters     slow scavengers near the floor, moving through the quiet spaces (away from trails and energy), grazing
//                 through spore clouds; they become visible when the conditions around them change.
//
// Habitat (sites): per organism one to four crown sites at its heads, where its crowns gather as they are rendered
// (biosphere-growth.js growForest on the model, at the organism's rest size; the first carries the subsystem's id, so
// engineering events reach it, the others share its conditions), and a root site (the trunk the others steer around);
// data: each head's focal weight and the organism of each further head. A pure function of the model and the time;
// organisms are grown once per distinct structure (memoised by a signature of what growForest reads), so the habitat
// stays cheap.
import {MODE,CH,HZ} from './sim.js';
import {growForest,SPECIES} from '../biosphere-growth.js';
export const POLLINATOR=0,SPORE=1,PLANKTON=2,DRIFTER=3;
export const SPECIES_NAMES=['pollinator','spore','plankton','drifter'];
const num=(x,d)=>Number.isFinite(x)?x:d;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const r3=x=>Math.round(x*1000)/1000;
const hyp=(a,b)=>Math.sqrt(a*a+b*b);
export const CAPACITY=1000,TRAIL_K=10;
// How an organism's crowns are summarised as sites (unscaled, the organism's rest geometry): its heads, where its
// crowns gather (a flower, a canopy, a kelp's float, a fern's fronds), so a gathering circles a glowing head of the
// organism and not the empty water between two of them. Crown points are taken by prominence (their size, more
// at about two thirds of the organism's height, where the world opens a verified milestone's bloom) and joined to the
// first head within JOIN of them; at most `most` heads (fewer in a large project: the habitat keeps 64 sites), each
// further one only when it carries at least a quarter of the first's prominence. A head is the size-weighted centre of
// its points, its reach from its largest crown and its spread.
const JOIN=.9;
function summarise(o,most=4){
  const H=Math.max(.8,o.height),hs=[];
  const pts=o.crown.map(c=>{const s=Math.max(.2,num(c.size,1));return {p:c.p,s,q:s*(.6+.4*Math.exp(-((((c.p[1]/H)-.68)/.22)**2)))};}).sort((a,b)=>(b.q-a.q)||(b.p[1]-a.p[1]));
  for(const c of pts){let h=null;for(const g of hs)if(Math.hypot(c.p[0]-g.p[0],c.p[1]-g.p[1],c.p[2]-g.p[2])<JOIN){h=g;break;}
    if(!h){if(hs.length>=most)continue;h={p:c.p,x:0,y:0,z:0,n:0,q:0,sMax:0,pts:[]};hs.push(h);}
    h.x+=c.p[0]*c.s;h.y+=c.p[1]*c.s;h.z+=c.p[2]*c.s;h.n+=c.s;h.q+=c.q;h.sMax=Math.max(h.sMax,c.s);h.pts.push(c);}
  const heads=[];
  for(const h of hs){const x=h.x/h.n,y=h.y/h.n,z=h.z/h.n;let d2=0;for(const c of h.pts)d2+=c.s*((c.p[0]-x)**2+(c.p[1]-y)**2+(c.p[2]-z)**2);
    heads.push({x,y:Math.max(y,.6),z,spread:Math.sqrt(d2/h.n),size:h.sMax,q:h.q});}
  heads.sort((a,b)=>b.q-a.q);for(let j=1;j<heads.length;j++)if(heads[j].q<heads[0].q/4){heads.length=j;break;}
  if(!heads.length)heads.push({x:o.root[0],y:H*.6,z:o.root[2],spread:0,size:1,q:1});
  return {root:o.root.slice(),height:o.height,radius:o.radius,heads,species:o.species};
}
// How much an organism holds the eye (biosphere.js compose: the anchor is the organism with the most of it): tall,
// broad, of a showy species. The habitat hands it to the ecosystem as data (focal, 0..1 of the most), so the organisms
// the camera favours are the usual attractors and a move between two of them happens in view.
const BEAUTY={coral:1.5,'crystal-tree':1.25,fern:.6,kelp:.25,mycelial:.3};
const massOf=(o,S)=>Math.pow(o.height*S,1.6)*Math.sqrt(o.radius*S+.6)*(BEAUTY[o.species]||1);
export function biosphereGrammar(recipe){
  const G=recipe?.genome||{},GEO=G.geometry||{},MOT=G.motion||{},SPACE=G.space||{};
  const dominant=SPECIES[GEO.species]?GEO.species:'coral',current=num(MOT.current,0);
  const HALF=Math.round(34*Math.max(1,num(SPACE.spread,1)));
  const cache=new Map();
  // ---- Habitat --------------------------------------------------------------------------------------------------
  // One organism, grown on its own (growForest on a view of the model holding only its subsystem: the same geometry,
  // see the test), memoised by everything growForest reads for it.
  function organism(model,d,cross,Mb){
    let sig=`${d.id}|${d.q},${d.r}|${d.role}|${d.test?1:0}|${JSON.stringify(d.counts||{})}|${cross}|${Mb}|`;
    for(const id of d.members){const m=model.modules.get(id);if(!m)continue;sig+=`${m.id}/${m.dir}/${m.order}:`;for(const s of m.symbols){const y=model.symbols.get(s);if(y)sig+=`${y.id}.${y.kind}.${y.slot},`;}sig+=';';}
    const hit=cache.get(sig);if(hit)return hit;
    const view={districts:new Map([[d.id,d]]),modules:model.modules,symbols:model.symbols,links:model.links,bornAt:model.bornAt};
    const f=growForest(view,{species:dominant,G,epoch:model.epoch,quality:0,current});
    const out=f.orgs[0]?summarise(f.orgs[0]):null;
    if(cache.size>=512)cache.clear();cache.set(sig,out);return out;
  }
  function habitat(model,t){
    const M=model.modules.size,Mb=M>200?2:M>60?1:0;
    const cross=new Map();
    for(const l of model.links.values()){if(l.removed!==null)continue;const a=model.modules.get(l.a),b=model.modules.get(l.b);if(!a||!b||a.group===b.group)continue;
      cross.set(a.group,(cross.get(a.group)||0)+1);cross.set(b.group,(cross.get(b.group)||0)+1);}
    const sites=[],mass=[],main={};
    const districts=[...model.districts.values()].filter(d=>d.members.length).sort((a,b)=>a.order-b.order);
    const most=districts.length<=8?4:districts.length<=14?3:districts.length<=20?2:1;
    for(const d of districts){
      let alive=0,val=0,str=0;
      for(const id of d.members){const m=model.modules.get(id);if(!m||!(model.bornAt(m)<=t)||(m.removed!==null&&m.removed<=t))continue;alive++;const s=model.stateAt(m,t);if(s==='validated')val++;else if(s==='stressed')str++;}
      if(!alive)continue;
      const o=organism(model,d,cross.get(d.id)||0,Mb);if(!o)continue;
      // The organism's rest size (biosphere.js Sof0: positions scale about the root).
      const S=.7+.17*Math.log2(1+d.members.length),R=o.root;
      const w=Math.sqrt(alive)*(1+.5*val/alive-.6*str/alive)+.1;
      // Its heads (the first carries the subsystem's id, so engineering events reach it; the others share its
      // conditions, data.main), each at the organism's rest size about its root.
      o.heads.slice(0,most).forEach((h,j)=>{const id=j?`${d.id}#h${j}`:d.id;if(j)main[id]=d.id;
        sites.push({id,x:r3(R[0]+(h.x-R[0])*S),y:r3(h.y*S),z:r3(R[2]+(h.z-R[2])*S),r:r3(clamp((.35+.3*h.size+.9*h.spread)*S,.7,2.4)),w:r3(w*(1-.12*j)),kind:0});
        mass.push([id,massOf(o,S)*(j?Math.min(1,h.q/o.heads[0].q):1)]);});
      sites.push({id:`${d.id}#root`,x:r3(R[0]),y:r3(Math.min(.8,o.height*S*.2)),z:r3(R[2]),r:r3(.12+.1*S+(o.species==='kelp'?0:.08)),w:r3(w*.25),kind:1});
    }
    let top=0;for(const [,m] of mass)top=Math.max(top,m);
    const focal={};for(const [id,m] of mass)focal[id]=r3(top>0?m/top:1);
    return {sites,data:{focal,main}};
  }
  // ---- The musical climate: slow phrasing (current, cohesion), never a jump --------------------------------------
  const CLIMATE={
    home:{current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0},
    away:{current:1.2,turb:1.1,cohesion:.9,activity:1.05,attract:.9,swing:.8},
    tension:{current:1.1,turb:1.6,cohesion:.65,activity:1.15,attract:.75,swing:.4},
    resolve:{current:.9,turb:.8,cohesion:1.35,activity:.95,attract:1.2,swing:-.4},
    lift:{current:1.15,turb:1,cohesion:1.2,activity:1.2,attract:1.3,swing:.25},
    breath:{current:.7,turb:.6,cohesion:1.25,activity:.75,attract:1,swing:0}};
  // ---- Populations ------------------------------------------------------------------------------------------------
  // Plankton keep tight colonies (more cohesion than separation: a dense bright core, sparse edges); drifters are slow,
  // heavy and hardly flee a disturbance (they come to graze at the edge of one). Spores do not perceive neighbours: they
  // are the water's haze, moved by the current, the structures and the momentum the others leave (a drifter grazing
  // through a cloud pushes it aside through its wake).
  const SPECIES_SPEC=[
    {name:'pollinator',share:.1,radius:1,sepRadius:.4,maxSpeed:1.15,minSpeed:.2,maxForce:2.6,mass:1,drag:.1,sep:1.6,ali:.2,coh:.1,
      seek:1.4,orbit:1.6,orbitRadius:.78,orbitSpeed:.45,orbitJitter:.25,orbitBand:.32,curiosity:0,
      trail:1.1,deposit:.006,carryDeposit:.03,energyDeposit:.006,flow:.25,push:.025,avoid:2.2,wander:.45,wanderJitter:.35,
      crowd:9,satiate:.0012,metabolism:.0005,restBelow:.08,restRecover:.002,disturbBelow:.3,life:[70,200],fade:2.5,respawn:[1,6],yMin:.8,yMax:12},
    {name:'spore',share:.31,radius:.5,sepRadius:.22,maxSpeed:.9,minSpeed:.03,maxForce:1.6,mass:.6,drag:.25,sep:1.2,ali:0,coh:0,
      orbit:0,curiosity:0,trail:0,deposit:0,carryDeposit:0,energyDeposit:0,flow:1.6,push:0,avoid:1.6,wander:.18,wanderJitter:.5,
      crowd:30,metabolism:0,restBelow:-1,disturbBelow:.25,settle:0,settleFlow:.5,life:[45,130],fade:3,respawn:[1,5],yMin:.25,yMax:11,yHold:.05,perceive:false},
    {name:'plankton',share:.45,radius:.9,sepRadius:.22,maxSpeed:1,minSpeed:.12,maxForce:2.2,mass:.8,drag:.15,sep:1.05,ali:.9,coh:1.05,
      orbit:0,curiosity:0,trail:0,deposit:0,carryDeposit:0,energyDeposit:0,flow:.6,push:.006,avoid:2.4,wander:.3,wanderJitter:.35,
      crowd:14,metabolism:.0004,restBelow:.1,restRecover:.0025,disturbBelow:.25,life:[120,360],fade:3,respawn:[1,6],yMin:1,yMax:8,yHold:.15,yRest:.7},
    {name:'drifter',share:.14,radius:1,sepRadius:.8,maxSpeed:.45,minSpeed:.05,maxForce:1,mass:2.2,drag:.2,sep:2,ali:0,coh:0,
      orbit:0,curiosity:0,trail:-.5,deposit:0,carryDeposit:0,energyDeposit:0,flow:.35,push:.025,avoid:.35,wander:.5,wanderJitter:.2,
      crowd:30,metabolism:0,restBelow:-1,disturbBelow:5,life:[160,420],fade:5,respawn:[2,8],yMin:.3,yMax:3.2,yHold:.1}];
  // Between species: plankton colonies part around pollinators and drifters; drifters graze through spore clouds
  // (spores are pushed aside); pollinators keep clear of drifters.
  const RELATIONS=[
    [null,null,null,{avoid:.5,radius:1.2}],
    [null,null,null,{avoid:.6,radius:.8}],
    [{avoid:1.2,radius:.9},null,null,{avoid:.8,radius:1}],
    [null,{chase:.25,radius:1},null,null]];
  // Foraging (pollinators): nectar regenerates steadily (an empty crown is full again in about 90 s; a lasting attractor
  // faster) and each visitor drinks it, so a crown sustains about nine visitors indefinitely and a crowd of twenty for
  // about a minute. The glow (what the organism shows of its visitors) follows them with a time constant of 4 s (slow
  // attack and release). A recovered crown is inviting again for about half a minute (revive). A failure anywhere makes
  // the whole water flinch (FLINCH: about 5 s to fall to a third): gatherings scatter, colonies part, settled spores
  // lift, drifters stir, and the pollinators come back only as it passes (a re-gathering over 10 to 20 s).
  const REGEN=1/(90*HZ),DRINK=6e-5,REVIVE=Math.exp(-1/(25*HZ)),GLOW_K=1-Math.exp(-1/(4*HZ)),STREAM=8*HZ,curiosity=.035;
  const FLINCH=Math.exp(-1/(5*HZ));
  function ecosystem(params,seed){
    // ---- Derived habitat data (a pure function of the ecosystem's sites; recomputed when they change) ----------------
    let idsRef=null,dataRef=null,nO=0,nOB=0,hx=0,hz=0,Rh=12;
    const oc=new Int16Array(64),or=new Int16Array(64),orgOfSite=new Int16Array(64),CAP=new Float32Array(64),FOC=new Float32Array(64),MAIN=new Int16Array(64);
    // Obstacles per organism (crown x, y, z, r; trunk x, z, radius, top; 0 when it has no root site).
    const OB=new Float32Array(64*8);
    function ensure(api){const S=api.sites,ids=S.ids,data=api.siteData;if(ids===idsRef&&data===dataRef)return;idsRef=ids;dataRef=data;
      const focal=data?.focal||null,mainOf=data?.main||null;
      const idx=new Map();for(let k=0;k<S.count;k++)idx.set(ids[k],k);orgOfSite.fill(-1);
      nO=0;let sx=0,sz=0;for(let k=0;k<S.count;k++){if(S.kind[k]!==0)continue;const mid=mainOf?.[ids[k]];oc[nO]=k;or[nO]=idx.get(`${mid??ids[k]}#root`)??-1;orgOfSite[k]=nO;
        // A second head of an organism shares the conditions of its first (the subsystem's own site).
        MAIN[nO]=mid!==undefined?idx.get(mid)??k:k;
        // What a crown carries before its visitors start to leave: grows with its size (about 13 to 25).
        CAP[nO]=clamp(8+8*S.r[k],12,26);FOC[nO]=focal?clamp(num(focal[ids[k]],1)):1;nO++;sx+=S.x[k];sz+=S.z[k];}
      if(nO){hx=sx/nO;hz=sz/nO;Rh=7;for(let o=0;o<nO;o++){const k=oc[o];Rh=Math.max(Rh,hyp(S.x[k]-hx,S.z[k]-hz)+S.r[k]+2.5);}}else{hx=0;hz=0;Rh=10;}
      // (One obstacle per organism: its trunk and its first head.)
      nOB=0;for(let o=0;o<nO;o++){const k=oc[o],kr=or[o];if(MAIN[o]!==k)continue;const b=nOB++*8;OB[b]=S.x[k];OB[b+1]=S.y[k];OB[b+2]=S.z[k];OB[b+3]=S.r[k];
        if(kr>=0){OB[b+4]=S.x[kr];OB[b+5]=S.z[kr];OB[b+6]=S.r[kr]+.35;OB[b+7]=S.y[k]-S.r[k]*.4;}else OB[b+6]=0;}
    }
    // Is a point close to a structure (in a crown's reach, or low near a trunk)?
    function nearOrg(S,x,y,z){for(let o=0;o<nO;o++){const k=oc[o],r=S.r[k];const ex=x-S.x[k],ez=z-S.z[k];
      if(Math.abs(ex)<r*1.4&&Math.abs(ez)<r*1.4&&Math.abs(y-S.y[k])<r*1.4&&ex*ex+ez*ez+(y-S.y[k])**2<r*r*1.9)return true;
      const kr=or[o];if(kr>=0&&y<1.6&&Math.abs(x-S.x[kr])<1.3&&Math.abs(z-S.z[kr])<1.3)return true;}return false;}
    const fl=[0,0,0],dg=[0,0];
    const CX=new Float64Array(256*5);let cT=NaN,cZ=NaN,cN=0,col=0,zc=0,zs=0,zt=0,zv=0;
    // ---- Per tick (hooks.tick, before anything moves): the crowns' conditions and the tables steering reads --------
    // Nectar and glow are conditions of the site (kept with its other conditions, so snapshots carry them); the rest
    // is derived from the state each tick, so a restored past never reads a stale value.
    const nov=new Float32Array(64),AP=new Float64Array(64),STR=new Float32Array(64),VR=new Float32Array(64);
    const streamTo=new Int16Array(64),streamT=new Int32Array(64),strained=new Int16Array(64);let nNov=0,nStr=0,FL=0,AW=0;
    function perTick(api){
      ensure(api);const S=api.sites,c=api.cond,P=api.params,t=api.tick;nNov=0;nStr=0;FL=0;let jump=0,feed=0;
      for(let o=0;o<nO;o++){const k=oc[o],st=S.state(k);streamTo[o]=-1;streamT[o]=-1;
        if(!st){AP[o]=0;nov[o]=0;STR[o]=0;continue;}
        if(st.nectar===undefined){st.nectar=1;st.glow=0;st.strained=0;st.revive=0;st.ps=st.stress;st.flinch=0;}
        // A new strain (a failing run) on any crown: the flinch below.
        if(st.stress-st.ps>.04)jump=Math.max(jump,st.stress-st.ps);st.ps=st.stress;st.flinch*=FLINCH;FL=Math.max(FL,st.flinch);
        // A recovery (the strain cleared) makes the crown inviting again for a while: the pollinators come back.
        if(st.stress>.2)st.strained=1;else if(st.strained&&st.stress<.05){st.strained=0;st.revive=1;}
        st.revive*=REVIVE;
        // The organism's conditions (its first head's), the head's own nectar and glow.
        const sm=MAIN[o]!==k&&S.state(MAIN[o])||st;
        if(sm.stress<.35)feed+=CAP[o];
        const v=S.visits[k],occ=v/CAP[o],lasting=Math.min(2,sm.lasting);
        st.nectar=clamp(st.nectar+REGEN*(1+lasting)-DRINK*v);
        st.glow+=(Math.min(1,(occ*1.1)**1.5)-st.glow)*GLOW_K;
        nov[o]=sm.novelty;if(sm.novelty>=.15)nNov++;
        STR[o]=sm.stress;if(sm.stress>.05){strained[nStr++]=o;VR[o]=S.r[k]*2.6+2.5;}
        // The crown's appeal, winner-take-more (squared): one or two crowns dominate. Pollinators mark the crown they
        // visit (a scent, scaled as their trails are) and lay trails around it, so a gathering draws more of them.
        // The organisms the eye goes to (focal) are the usual attractors; a lasting attractor (a verified milestone)
        // outweighs that.
        let a=S.w[k]*(1+1.5*sm.novelty+2*lasting+.8*sm.nourish+8*sm.revive)*(.4+.6*FOC[o]);
        a*=.6+.5*Math.min(1.5,api.sample(CH.energy,S.x[k],S.z[k]));
        a*=(1+.4*Math.min(3,api.sample(CH.trail,S.x[k],S.z[k])))*(1+v*P.trails/2);
        a*=.15+.85*st.nectar;a*=a;
        a*=1/(1+occ*occ*occ);a*=1-.95*sm.stress;
        AP[o]=Math.max(0,a*c.attract*P.attraction);}
      // The flinch is kept by every crown alike (site conditions: snapshots carry it), so it is the whole habitat's.
      if(jump>0){const f=Math.min(1,.55+jump);for(let o=0;o<nO;o++){const st=S.state(oc[o]);if(st)st.flinch=Math.max(st.flinch,f);}FL=Math.max(FL,f);}
      // How many pollinators the habitat can feed: those beyond it stay dormant (resting low and dim) and wake as
      // organisms appear, so a young world is not sprinkled with pollinators that have nowhere to go.
      AW=Math.round(1.3*feed);
      // Streams: who left each crown most recently, and for where (those leaving after follow them).
      const cap=api.capacity,ia=api.ia;
      for(let i=0;i<cap;i++){if(!api.alive[i]||api.sp[i]!==POLLINATOR||api.mode[i]!==MODE.seek)continue;const src=ia[i*2],at=ia[i*2+1];
        if(src<0||src>=64||t-at>STREAM)continue;const o=orgOfSite[src];if(o>=0&&at>streamT[o]){streamT[o]=at;streamTo[o]=api.tgt[i];}}
    }
    // Pollinators: the crown to visit (a weighted draw from the entity's own random stream); nearer is a little better.
    const W=new Float64Array(64);
    function chooseCrown(api,i,avoid){
      const S=api.sites,x=api.px[i],z=api.pz[i];let total=0;
      for(let o=0;o<nO;o++){const k=oc[o];let a=AP[o]/(1+hyp(S.x[k]-x,S.z[k]-z)/12);if(k===api.tgt[i]||k===avoid)a*=.06;W[o]=a;total+=a;}
      if(total<=0)return -1;let u=api.random(i,7)*total;for(let o=0;o<nO;o++){u-=W[o];if(u<=0)return oc[o];}return oc[nO-1];
    }
    // A pollinator leaves its crown: it follows whoever left the same crown just before (a stream toward the next
    // crown), or chooses for itself; it carries the crown's influence for a while (a stronger trail).
    function leave(api,i,k){
      const o=orgOfSite[k];let q=-1;
      if(o>=0){const s=streamTo[o];if(s>=0&&s!==k&&api.random(i,11)<.75){const so=orgOfSite[s];if(so>=0&&STR[so]<.3)q=s;}}
      if(q<0)q=chooseCrown(api,i,k);
      // (Fed, it has turned the nectar into the influence it carries: hungry again by the next crown.)
      api.carry[i]=Math.round((api.en[i]>.7?10:5)*HZ);api.en[i]=Math.min(api.en[i],.6);api.ia[i*2]=k;api.ia[i*2+1]=api.tick;
      if(q>=0&&q!==k&&api.random(i,12)<.85){api.tgt[i]=q;return MODE.seek;}
      return MODE.explore;
    }
    const hooks={
      // The broad current: slowly drifting gyres (a stream function, so the water circulates rather than piles up) and
      // a weak mean drift along the world's current direction, turned by the music's swing; turbulence adds eddies.
      current(x,y,z,t,c,out){
        // Separable terms are memoised along the field's rows (the sim asks cell by cell, row by row, at one time).
        if(t!==cT){cT=t;cZ=NaN;cN=0;}
        if(z!==cZ){cZ=z;col=0;const b=z*.17952+t*.008+1.3;zc=Math.cos(b);zs=Math.sin(b);zt=Math.sin(z*.61+t*.07);zv=Math.cos(z*.17-t*.02);}else col++;
        let o=col*5;if(col>=cN||CX[o]!==x){const a=x*.2244+t*.011;CX[o]=x;CX[o+1]=Math.sin(a);CX[o+2]=Math.cos(a);CX[o+3]=Math.cos(x*.53-t*.05);CX[o+4]=Math.sin(x*.19+t*.03);if(col>=cN)cN=col+1;}
        const A=.36;out[0]=A*.8*CX[o+1]*zc;out[2]=-A*CX[o+2]*zs;
        const th=current+c.swing*.8;out[0]+=.1*Math.cos(th);out[2]+=.1*Math.sin(th);
        const e=.05*c.turb;out[0]+=e*zt;out[2]+=e*CX[o+3];
        out[1]=.035*CX[o+4]*zv;
      },
      spawn(api,i,k,r,out){
        ensure(api);const S=api.sites;
        if(!nO){const a=r(20)*6.2832,d=Math.sqrt(r(21))*9;out[0]=Math.cos(a)*d;out[2]=Math.sin(a)*d;out[1]=k===DRIFTER?.5+r(22)*1.5:1+r(22)*4;}
        else if(k===POLLINATOR||k===SPORE){const o=Math.floor(r(20)*nO)%nO,q=oc[o],a=r(21)*6.2832,cr=S.r[q];
          const d=k===SPORE?cr*.8*Math.sqrt(r(22)):cr*(1.2+r(22));out[0]=S.x[q]+Math.cos(a)*d;out[2]=S.z[q]+Math.sin(a)*d;out[1]=Math.max(.5,S.y[q]+(r(23)-.5)*cr);}
        else{const a=r(20)*6.2832,d=Math.sqrt(r(21))*Rh*.8;out[0]=hx+Math.cos(a)*d;out[2]=hz+Math.sin(a)*d;out[1]=k===DRIFTER?.4+r(22)*1.6:1.5+r(22)*3.5;}
        if(k===DRIFTER||k===PLANKTON){api.fa[i*2]=0;api.fa[i*2+1]=0;}
      },
      tick:perTick,
      steer(api,i,f,dist){
        const S=api.sites,k=api.sp[i],x=api.px[i],y=api.py[i],z=api.pz[i],m=api.mode[i];
        // Home: the ecology lives among the organisms (a soft edge around the habitat).
        {const dx=x-hx,dz=z-hz,d=hyp(dx,dz),R=Rh*(k===DRIFTER?1.1:1);if(d>R){const c=(d-R)*.5/d;f[0]-=dx*c;f[2]-=dz*c;}}
        // Structures: trunks and the dense core of a crown deflect everything but the pollinators (who live in the
        // crowns); a crown slows the spores passing through it (they collect there when the water is calm).
        if(k!==POLLINATOR)for(let o=0,b=0;o<nOB;o++,b+=8){
          const tr=OB[b+6];if(tr>0&&y<OB[b+7]){const ex=x-OB[b+4],ez=z-OB[b+5];if(ex<tr&&ex>-tr&&ez<tr&&ez>-tr){const h=Math.sqrt(ex*ex+ez*ez);if(h<tr&&h>1e-4){const p=(tr-h)/tr*5/h;f[0]+=ex*p;f[2]+=ez*p;}}}
          const cr=OB[b+3],ex=x-OB[b],ey=y-OB[b+1],ez=z-OB[b+2];if(ex>cr||ex<-cr||ez>cr||ez<-cr||ey>cr||ey<-cr)continue;
          const d=Math.sqrt(ex*ex+ey*ey+ez*ez);if(d>=cr||d<1e-4)continue;
          const core=cr*.55;if(d<core){const p=(core-d)/core*3/d;f[0]+=ex*p;f[1]+=ey*p;f[2]+=ez*p;}
          if(k===SPORE){const g=1.2*(1-d/cr);f[0]-=api.vx[i]*g;f[1]-=api.vy[i]*g;f[2]-=api.vz[i]*g;}}
        // A strained organism (a failing run) opens a void around it: everything but the drifters is pushed out of it
        // while the strain lasts; drifters, scavengers of the quiet water, come to graze at its edge.
        for(let n=0;n<nStr;n++){const o=strained[n],q=oc[o],ex=x-S.x[q],ez=z-S.z[q],d=hyp(ex,ez),R=VR[o];
          if(k===DRIFTER){if(d<R*2.6&&d>1e-3){const c=.9*STR[o]*(R*.85-d)/R/d;f[0]+=ex*c;f[2]+=ez*c;}continue;}
          if(d<R&&d>1e-3){const c=3.2*Math.min(1,STR[o]*1.6)*(1-d/R)/d;f[0]+=ex*c;f[2]+=ez*c;}}
        // Field readings are staggered (every second or fourth tick per entity) and kept in the entity's scratch
        // state (plankton, drifters), so a reading costs little and stays exact across restores.
        const ph=(i+api.tick)&3,o2=i*2;
        if(k===POLLINATOR){
          // Seekers near their crown fly to it (closing in, the crown's pull outweighs the trail they followed there).
          if(m===MODE.seek){const q=api.tgt[i];if(q>=0){const ex=S.x[q]-x,ez=S.z[q]-z,d=hyp(ex,ez);if(d<5&&d>1e-3){const c=1.4*(1-d/5)/d;f[0]+=ex*c;f[2]+=ez*c;}}}
          // Explorers lean toward richer water.
          if(m===MODE.explore&&(ph&1)===0){const g=api.gradient(CH.energy,x,z),gl=hyp(g[0],g[1]);if(gl>1e-4){const c=Math.min(1,gl)/gl*1.2;f[0]+=g[0]*c;f[2]+=g[1]*c;}}
        }else if(k===PLANKTON){
          if((ph&1)===0){
            let gx=0,gz=0;
            if(m!==MODE.rest){const g=api.gradient(CH.energy,x,z),gl=hyp(g[0],g[1]);const c=gl>1e-4?Math.min(1,gl*2)/gl*1.1:0;gx=g[0]*c;gz=g[1]*c;
              // Colonies live near the organisms (not in the open water): a gentle pull toward the nearest organism.
              let best=1e9,bx=0,bz=0,br=1;for(let o=0,b=0;o<nOB;o++,b+=8){const ex=OB[b]-x,ez=OB[b+2]-z,d2=ex*ex+ez*ez;if(d2<best){best=d2;bx=ex;bz=ez;br=OB[b+3];}}
              const d=Math.sqrt(best),R0=br*2.4+1;if(d>R0&&d<18){const c=Math.min(.45,(d-R0)*.12)/d;gx+=bx*c;gz+=bz*c;}}
            api.fa[o2]=gx;api.fa[o2+1]=gz;
            // Feeding where the water is rich (energy restores them).
            api.en[i]=Math.min(1.05,api.en[i]+.003*Math.min(2,api.sample(CH.energy,x,z)));}
          f[0]+=api.fa[o2];f[2]+=api.fa[o2+1];
          // Curious colonies: a new organism draws them in for a while.
          if(m!==MODE.rest&&nNov){for(let o=0;o<nO;o++){const nv=nov[o];if(nv<.15)continue;const q=oc[o],ex=S.x[q]-x,ez=S.z[q]-z,d=hyp(ex,ez);if(d<16&&d>S.r[q]*1.6){const c=.9*nv/d;f[0]+=ex*c;f[2]+=ez*c;f[1]+=(S.y[q]-y)*.1*nv;}}}
        }else if(k===DRIFTER){
          if(ph===0){const g=api.gradient(CH.energy,x,z),gl=hyp(g[0],g[1]);if(gl>1e-4){const c=Math.min(1,gl)/gl*.6;dg[0]=g[0]*c;dg[1]=g[1]*c;}else{dg[0]=dg[1]=0;}
            // Arousal (presentation reads it): how much the conditions around it differ from what it has been used to.
            const v=dist*1.5+api.sample(CH.energy,x,z)+api.sample(CH.trail,x,z)*.5;
            api.fa[o2]+=(v-api.fa[o2])*.04;const target=Math.min(1,Math.abs(v-api.fa[o2])*1.5+dist*1.5+FL*.8);api.fa[o2+1]+=(target-api.fa[o2+1])*.18;
            f[0]-=dg[0]*4;f[2]-=dg[1]*4;}
        }else if(k===SPORE&&m===MODE.settle){f[1]-=.04;}
      },
      decide(api,i,nb,dist){
        const k=api.sp[i],m=api.mode[i];
        if(k===POLLINATOR){
          const s=api.species[k];
          // Dormant (pollinator slots come first: the slot is its rank): the habitat cannot feed it yet.
          if(i>=AW)return MODE.rest;
          if(m===MODE.explore){
            // While the water flinches nobody goes to a crown; as it passes they come back, a few at first.
            if(api.en[i]>=s.restBelow&&api.modeT[i]>3*HZ&&dist<s.disturbBelow&&api.random(i,1)<curiosity*api.cond.activity*api.params.vitality*clamp(1-FL*1.7)){
              // A crown already full (or drunk dry) is left alone for now: it keeps exploring, or rests a while (dormant,
              // low and dim), so a small habitat is not swamped by pollinators it cannot feed.
              const q=chooseCrown(api,i,-1);if(q<0)return -1;const st=api.sites.state(q);
              if(api.sites.visits[q]<CAP[orgOfSite[q]]*1.1&&st.nectar>.15){api.tgt[i]=q;return MODE.seek;}
              if(api.random(i,5)<.8)return MODE.rest;}
            return -1;
          }
          if(m===MODE.rest)return api.modeT[i]<(12+16*((i*.618034)%1))*HZ||api.en[i]<.6?MODE.rest:MODE.explore;
          const q=api.tgt[i];if(q<0)return -1;const o=orgOfSite[q];if(o<0)return -1;
          // A crown that is failing is no place to go.
          if(m===MODE.seek){if(STR[o]>.35||FL>.45&&api.random(i,13)<.1)return MODE.explore;
            // Arrived: in the crown's reach (the trail its visitors lay drifts downstream with the current; an arrival
            // waiting for the exact centre would hover in that drift instead of joining the circle).
            const S=api.sites;if(hyp(S.x[q]-api.px[i],S.z[q]-api.pz[i])<S.r[q]*2)return MODE.orbit;return -1;}
          if(m===MODE.orbit){
            if(dist>s.disturbBelow*1.3||STR[o]>.25||FL>.45&&api.random(i,14)<.25)return MODE.disperse;
            const st=api.sites.state(q),occ=api.sites.visits[q]/CAP[o];
            // Fed, the nectar running out, more visitors than the crown carries, or no room at all: it peels away.
            if(api.en[i]>=1)return leave(api,i,q);
            if(st.nectar<.3&&api.random(i,2)<.012+.03*(1-st.nectar/.3))return leave(api,i,q);
            if(occ>1.15&&api.random(i,3)<.012*(occ-1))return leave(api,i,q);
            if(nb>s.crowd*api.params.collective*2.4&&api.random(i,4)<.02)return leave(api,i,q);
            return MODE.orbit;
          }
          return -1;
        }
        if(k===SPORE){
          const x=api.px[i],y=api.py[i],z=api.pz[i];
          if(m===MODE.settle){
            // Dislodged: the momentum of a passing swarm, a disturbance, a stronger current, the flinch, or in time.
            if(FL>.4&&api.random(i,4)<.05)return MODE.explore;
            const mx=api.sample(CH.flowX,x,z),mz=api.sample(CH.flowZ,x,z);
            if(hyp(mx,mz)>.2||dist>.12)return MODE.explore;
            api.flowAt(x,y,z,fl);if(hyp(fl[0],fl[2])>.42)return MODE.explore;
            return -1;
          }
          if(m===MODE.explore&&api.modeT[i]>3*HZ&&dist<.06&&api.random(i,3)<.03){
            api.flowAt(x,y,z,fl);if(hyp(fl[0],fl[2])<.3&&nearOrg(api.sites,x,y,z))return MODE.settle;}
          return -1;
        }
        // Plankton: a flinch parts the colonies (each scatters away from its neighbours, dimming), then they re-form.
        if(k===PLANKTON&&FL>.5&&m!==MODE.disperse&&m!==MODE.rest&&api.random(i,6)<.06)return MODE.disperse;
        return -1;
      }
    };
    return {capacity:CAPACITY,trail:TRAIL_K,bounds:{min:[-HALF,.1,-HALF],max:[HALF,14,HALF]},
      field:{nx:64,nz:64,decay:{trail:.994,energy:.996,disturb:.992,flow:.95},diffuse:{trail:.1,energy:.06,disturb:.08,flow:.12},advect:.5},
      species:SPECIES_SPEC,relations:RELATIONS,hooks};
  }
  return {id:'fractal-biosphere',version:3,ecosystem,habitat,climate:section=>CLIMATE[section]||CLIMATE.home,
    // For tests and inspection.
    summarise:(model,d)=>organism(model,d,0,0)};
}

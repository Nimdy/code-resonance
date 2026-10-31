// Fractal Continuum's digital life: motes of light living on the surface of the fractal (life/sim.js grammar
// 'fractal-continuum'; the world, fractal.js, draws them). Ambient life, never progress: never labelled, never counted
// as agents, never placed from an event. Pure (no rendering), tested in Node (tests/life-fractal*.test.js).
//
// The map. The ecosystem's fields are 2D grids over a ground plane; this world is a closed surface. The world reaches
// every point of its surface from the form's centre along one direction (each site is traced outward along its own),
// so a direction names a point of the surface, and the life lives on the sphere of directions. The ecosystem's plane
// is an azimuthal equidistant map of that sphere around the form's pole (y up: the bulbs' axis of symmetry): the
// direction at colatitude θ and longitude φ is the point (K θ cos φ, K θ sin φ), and the plane's height y is the
// altitude above the surface. Arcs from the pole keep their length; across them the map stretches by θ / sin θ (1 at
// the pole, 1.57 at the equator), the price of one chart over almost the whole surface. The south pole, which the map
// tears open into its rim, is never inhabited: the life is held within SOFT (135 degrees of the pole: 85 % of the
// surface; the regions lie between 35 degrees south and 70 north), so nothing crosses the seam. Regions and sites keep
// their directions, so the habitat sits still in the map whatever the form does (it unfolds, swells, breathes,
// blooms): the world draws each inhabitant along its direction at its altitude above the surface as drawn at that
// moment.
//
// Populations (species):
//  motes      drifting motes of light: ride the surface's current, follow the trails the others lay, choose an active
//             site (one that is being worked on, newly born, nourished, lasting, rich in the energy the work leaves;
//             not crowded, not strained), circle it in a slow halo and feed, then leave carrying its light (a stronger
//             trail); those leaving the same site follow the one who left before them, so threads of light run from
//             site to site across the form;
//  skimmers   small flocks skimming the relief (separation, alignment and cohesion), drawn along the threads the motes
//             lay and toward the energy of the gatherings; their momentum stirs the current;
//  embers     slow, heavy glows that settle where the current is calm and rest close to the surface (in its hollows),
//             lifted again by a passing flock's wake, a stronger current or a disturbance.
// Habitat (sites, from the world's own layout: fractal-forms.js layoutAt): one site per subsystem's region at the
// region's direction, and one per file at its own direction on its region's spiral (the most prominent files, by
// their symbols, when a project has more than the 64 sites the ecosystem holds; a file without a site of its own
// gives its events to its region's).
// Events act only through the driver (site conditions and field deposits): a failing run strains its sites (a void
// opens over the decohering region: the life withdraws to its edge and stays out while the strain lasts); a recovery
// clears it and for a while draws the motes back to the repaired sites; edits and new structure leave energy where they
// happen (the active sites draw the gatherings); a verified milestone leaves a lasting attractor; a validated refactor
// turns the current around its site; a new connection lays a trail between two sites.
import {MODE,CH,HZ,MAX_SITES} from './sim.js';
import {layoutConfig,layoutAt,regionSlots} from '../fractal-forms.js';
export const K=6.4;                 // map units per radian of arc from the pole
export const SOFT=2.35*K;           // the life's reach from the pole (135 degrees), the seam far beyond it
export const FIELD=SOFT+2.2;        // the fields' half extent (the map's square)
export const ALT0=.022,ALT=.06;     // altitude above the surface (fractal units): ALT0 + ALT per map unit of height
export const MOTE=0,SKIMMER=1,EMBER=2;
export const SPECIES_NAMES=['mote','skimmer','ember'];
export const CAPACITY=680,TRAIL_K=10;
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),r3=x=>Math.round(x*1000)/1000,hyp=(a,b)=>Math.sqrt(a*a+b*b);
// ---- The map ----------------------------------------------------------------------------------------------------------
// A unit direction -> its point (x, 0, z) of the plane; the plane's (x, z) -> the unit direction.
export function toMap(u,out=[0,0,0]){const th=Math.acos(clamp(u[1],-1,1)),s=hyp(u[0],u[2]);
  if(s<1e-12){out[0]=0;out[1]=0;out[2]=0;return out;}const k=K*th/s;out[0]=u[0]*k;out[1]=0;out[2]=u[2]*k;return out;}
export function toDir(x,z,out=[0,1,0]){const rho=hyp(x,z);if(rho<1e-12){out[0]=0;out[1]=1;out[2]=0;return out;}
  const th=rho/K,s=Math.sin(th)/rho;out[0]=x*s;out[1]=Math.cos(th);out[2]=z*s;return out;}
// How much the map stretches across the arcs from the pole at (x, z): theta / sin(theta) (1 at the pole).
export function stretch(x,z){const th=Math.min(Math.PI-1e-3,hyp(x,z)/K);return th<1e-6?1:th/Math.sin(th);}
// ---- The grammar ------------------------------------------------------------------------------------------------------
export function createFractalGrammar(recipe){
  const lc=layoutConfig(recipe);let slots=regionSlots(lc.seed);
  // (the sequence of region directions continues for a larger project; its first slots never move: the same
  // directions whatever count was asked for before)
  const slotsFor=n=>{if(n>slots.length)slots=regionSlots(lc.seed,n);return slots;};
  // Which files have a site of their own: all of them while the ecosystem has room, otherwise the most prominent (their
  // symbols, then creation order), decided on the structure the model holds (not the moment), so an event on a file
  // and the habitat always agree. Memoised per model and version (a pure function of them).
  const owned=new WeakMap();
  function ownSites(model){
    const hit=owned.get(model);if(hit&&hit.v===model.version)return hit.set;
    const districts=[...model.districts.values()].filter(d=>d.members.length),room=MAX_SITES-Math.min(districts.length,40);
    const files=[...model.modules.values()].filter(m=>m.removed===null);let set;
    if(files.length<=room)set=new Set(files.map(m=>m.id));
    else set=new Set(files.map(m=>({id:m.id,n:model.symbolsAt(m,Infinity),o:m.order})).sort((a,b)=>b.n-a.n||a.o-b.o||(a.id<b.id?-1:1)).slice(0,room).map(x=>x.id));
    owned.set(model,{v:model.version,set});return set;
  }
  // A canonical subject -> its site: a file with a site of its own, else its region; a subsystem its region.
  function siteOf(id,model){
    if(model.districts.has(id))return id;const m=model.modules.get(id);if(!m)return null;
    return ownSites(model).has(id)?id:m.group;
  }
  // ---- Habitat ----------------------------------------------------------------------------------------------------
  function habitat(model,t){
    slotsFor(model.districts.size);const lay=layoutAt(model,t,lc,slots),own=ownSites(model),out=[],p=[0,0,0];
    for(const r of lay.regions.slice(0,40)){if(!r.live)continue;toMap(r.dir,p);
      out.push({id:r.id,x:r3(p[0]),y:.55,z:r3(p[2]),r:r3(clamp(r.extent*K*.45,.9,2.4)),w:r3(.35+.25*Math.log2(1+r.live)),kind:1});}
    for(const s of lay.sites){if(!s.alive||!own.has(s.id))continue;const m=model.modules.get(s.id);if(!m||m.removed!==null&&m.removed<=t)continue;
      const n=model.symbolsAt(m,t),st=model.stateAt(m,t);toMap(s.dir,p);
      out.push({id:s.id,x:r3(p[0]),y:.35,z:r3(p[2]),r:r3(clamp(.55+.1*Math.log2(1+n),.55,.95)),
        w:r3((.55+.3*Math.log2(1+n))*(st==='validated'?1.2:st==='stressed'?.6:st==='draft'?.85:1)),kind:st==='stressed'?2:0});}
    return out;
  }
  // ---- The musical climate (ecology 1): slow phrasing, never a jump ------------------------------------------------
  const CLIMATE={
    home:{current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0},
    away:{current:1.2,turb:1.1,cohesion:.9,activity:1.05,attract:.9,swing:.8},
    tension:{current:1.1,turb:1.6,cohesion:.65,activity:1.15,attract:.75,swing:.4},
    resolve:{current:.9,turb:.8,cohesion:1.35,activity:.95,attract:1.2,swing:-.4},
    lift:{current:1.15,turb:1,cohesion:1.2,activity:1.2,attract:1.3,swing:.25},
    breath:{current:.7,turb:.6,cohesion:1.25,activity:.75,attract:1,swing:0}};
  // ---- Populations ------------------------------------------------------------------------------------------------
  // Ecology 2 (respond): motes answer exploration, gathering and activity; skimmers cohesion and the current; embers
  // hardly the music (they rest where the surface is calm).
  const SPECIES=[
    {name:'mote',share:.6,radius:1.1,sepRadius:.36,maxSpeed:.9,minSpeed:.06,maxForce:2.4,mass:1,drag:.1,sep:1.4,ali:.3,coh:.2,
      seek:2,orbit:1.5,orbitRadius:.95,orbitSpeed:.5,orbitJitter:.4,orbitBand:.55,curiosity:0,
      trail:.6,deposit:.025,carryDeposit:.06,energyDeposit:.012,flow:.55,push:.008,avoid:2.4,wander:.4,wanderJitter:.35,
      crowd:12,satiate:.0016,metabolism:.0006,restBelow:.1,restRecover:.002,disturbBelow:.3,life:[60,180],fade:2.5,respawn:[1,5],
      yMin:.14,yMax:1.05,yHold:.3,respond:{explore:1.3,gather:1.2,activity:1.1,cohesion:.7,turb:.8,current:.8}},
    {name:'skimmer',share:.22,radius:1.15,sepRadius:.32,maxSpeed:1.1,minSpeed:.25,maxForce:2.4,mass:.7,drag:.08,sep:1.6,ali:1,coh:.42,
      seek:0,orbit:0,curiosity:0,trail:.8,deposit:.006,carryDeposit:0,energyDeposit:0,flow:.45,push:.006,avoid:3,wander:.32,wanderJitter:.4,
      crowd:24,satiate:0,metabolism:0,restBelow:-1,disturbBelow:.3,life:[80,220],fade:3,respawn:[1,5],yMin:.28,yMax:.95,yHold:.3,
      respond:{cohesion:1.6,current:1.2,activity:1.2,turb:1.1,explore:.9}},
    {name:'ember',share:.18,radius:.85,sepRadius:.5,maxSpeed:.38,minSpeed:.02,maxForce:1,mass:2,drag:.25,sep:1.2,ali:0,coh:0,
      seek:0,orbit:0,curiosity:0,trail:0,deposit:0,carryDeposit:0,energyDeposit:0,flow:.7,push:0,avoid:1.5,wander:.2,wanderJitter:.3,
      crowd:30,satiate:0,metabolism:0,restBelow:-1,disturbBelow:.2,settle:.02,settleFlow:.42,life:[120,360],fade:4,respawn:[2,8],
      yMin:.06,yMax:.42,yHold:.4,respond:{activity:.45,turb:.5,current:.6,cohesion:.5,explore:.4}}];
  // Between species: skimmers are drawn to the motes' gatherings a little; embers part around a passing flock (its wake
  // lifts them).
  const RELATIONS=[[],[{chase:.12,radius:1.6}],[null,{avoid:.7,radius:1.1}]];
  // Strain, recovery and streams: a strained site's void (VOID: its reach), a recovered site's draw (REVIVE: about
  // 25 s), who left a site last and for where (STREAM: 8 s), how often a leaver follows (FOLLOW).
  const REVIVE=Math.exp(-1/(25*HZ)),STREAM=8*HZ,FOLLOW=.7,CROWD=14,CURIOSITY=.014,FLOCK=10;
  function ecosystem(){
    const VR=new Float32Array(MAX_SITES),REACH=new Uint8Array(MAX_SITES),STR=new Float32Array(MAX_SITES),REV=new Float32Array(MAX_SITES),strained=new Int16Array(MAX_SITES),revived=new Int16Array(MAX_SITES);
    const streamTo=new Int16Array(MAX_SITES),streamT=new Int32Array(MAX_SITES),W=new Float64Array(MAX_SITES),fl=[0,0,0];let nStr=0,nRev=0,E2=false,GA=1,EXP=1;
    // ---- Per tick (before anything moves): strain and its void, recovery and its draw, the streams --------------------
    // Conditions a recovery leaves (revive, strained) are site conditions, so snapshots carry them; the rest is derived
    // from the state each tick, so a restored past never reads a stale value.
    function perTick(api){
      const S=api.sites,n=S.count,t=api.tick;nStr=0;nRev=0;
      if((E2=api.ecology===2)){GA=api.felt(MOTE,'gather');EXP=api.felt(MOTE,'explore');}
      for(let k=0;k<n;k++){const st=S.state(k);streamTo[k]=-1;streamT[k]=-1;STR[k]=0;REV[k]=0;REACH[k]=hyp(S.x[k],S.z[k])<SOFT-.4?1:0;if(!st)continue;
        if(st.revive===undefined){st.revive=0;st.strained=0;}
        if(st.stress>.2)st.strained=1;else if(st.strained&&st.stress<.05){st.strained=0;st.revive=1;}
        st.revive*=REVIVE;
        STR[k]=st.stress;if(st.stress>.05){strained[nStr++]=k;VR[k]=S.r[k]*2.4+1.6;}
        REV[k]=st.revive;if(st.revive>.05)revived[nRev++]=k;}
      // who left each site most recently, and for where (motes leaving after them follow: a thread between sites)
      const cap=api.capacity,ia=api.ia;
      for(let i=0;i<cap;i++){if(!api.alive[i]||api.sp[i]!==MOTE||api.mode[i]!==MODE.seek)continue;const src=ia[i*2],at=ia[i*2+1];
        if(src<0||src>=n||t-at>STREAM)continue;if(at>streamT[src]){streamT[src]=at;streamTo[src]=api.tgt[i];}}
    }
    // A mote's site (a weighted draw from its own stream): the site's strength and conditions (new, lasting,
    // nourished, recovered), the energy the work and the gatherings left there and the motes' trails to it, a gathering
    // already circling it (winner-take-more: a gathering draws more, until it carries all it can); never a strained
    // one; nearer is better. (ecology 2: the music's willingness to gather sets what a site carries and how strongly
    // the gatherings concentrate; exploration widens the reach; the turning attractor moves the appeal around the form)
    // A site beyond the life's reach (a file far down its region's spiral toward the south pole) is never chosen.
    function choose(api,i,avoid){
      const S=api.sites,n=S.count,x=api.px[i],z=api.pz[i],P=api.params,reach=E2?4.5*Math.sqrt(EXP):4.5,carries=CROWD*(E2?GA:1)*P.collective,wtm=E2?clamp(1.6*Math.sqrt(GA),1.1,2.2):1.6;let total=0;
      for(let k=0;k<n;k++){const st=S.state(k);if(!st||k===avoid||st.stress>.3||!REACH[k]){W[k]=0;continue;}const v=S.visits[k];
        let a=S.w[k]*(1+1.5*st.novelty+.8*st.lasting+.8*st.nourish+3*REV[k])*(.5+Math.min(2,api.sample(CH.energy,S.x[k],S.z[k])))*(1+.4*Math.min(3,api.sample(CH.trail,S.x[k],S.z[k]))*P.trails)*(1+.35*Math.min(v,carries));
        a=Math.pow(a,wtm)/(1+Math.pow(v/Math.max(1,carries),3))/(1+hyp(S.x[k]-x,S.z[k]-z)/reach)*(1-.9*st.stress)*api.cond.attract*P.attraction*api.shiftOf(k);
        W[k]=Math.max(0,a);total+=W[k];}
      if(total<=0)return -1;let u=api.random(i,7)*total;for(let k=0;k<n;k++){u-=W[k];if(u<=0)return k;}return n-1;
    }
    // A fed mote leaves its site carrying its light (a stronger trail): after whoever left the same site just before
    // (a thread toward the next site), or for a site of its own choosing.
    function leave(api,i,k){
      let q=-1;const s=streamTo[k];if(s>=0&&s!==k&&STR[s]<.3&&api.random(i,11)<FOLLOW)q=s;
      if(q<0)q=choose(api,i,k);
      api.carry[i]=Math.round(10*HZ);api.en[i]=Math.min(api.en[i],.6);api.ia[i*2]=k;api.ia[i*2+1]=api.tick;
      if(q>=0&&q!==k&&api.random(i,12)<.85){api.tgt[i]=q;return MODE.seek;}
      return MODE.explore;
    }
    // The surface's current: bands of slow differential rotation about the pole (alternating shear, so the trails the
    // life lays turn into spirals) and a few drifting eddies (a stream function: the flow circulates, never piles up),
    // turned by the music's swing; turbulence stirs the eddies; near the life's reach it turns back toward the pole.
    // Separable terms are memoised per time (the sim asks cell by cell at one time).
    const EDDY=[[.31,.17,.045,.7],[-.2,.36,-.033,2.1],[.27,-.29,.027,4.4],[.11,.41,.052,5.3]];let cT=NaN;const ec=new Float64Array(8);
    function current(x,y,z,t,c,out){
      if(t!==cT){cT=t;for(let m=0;m<4;m++){const a=EDDY[m][2]*t+EDDY[m][3]+c.swing*.9*(m%2?1:-1);ec[m*2]=Math.cos(a);ec[m*2+1]=Math.sin(a);}}
      const rho=hyp(x,z),th=rho/K;
      // zonal: an angular velocity per band (map radians per second; the map turns as the surface would)
      const w=.024*(.55+.75*Math.cos(th*3.1+.6))+.006*c.swing;
      let vx=-z*w,vz=x*w;
      // eddies: psi = sum a sin(kx x + kz z + phase(t)) -> v = (d psi/dz, -d psi/dx)
      const A=.19*(.75+.25*c.turb);
      for(let m=0;m<4;m++){const [kx,kz]=EDDY[m],ph=kx*x+kz*z,cs=Math.cos(ph),sn=Math.sin(ph),cc=cs*ec[m*2]-sn*ec[m*2+1];vx+=A*kz*cc/.4;vz-=A*kx*cc/.4;}
      // the life's reach: the flow turns back toward the pole past it (no current carries anything to the seam)
      if(rho>SOFT-1.5){const k=(rho-SOFT+1.5)*.25/rho;vx-=x*k;vz-=z*k;}
      out[0]=vx;out[1]=0;out[2]=vz;
    }
    const hooks={current,tick:perTick,
      spawn(api,i,s,r,out){
        const S=api.sites,n=S.count;
        // motes and embers mostly near a site (the life lives where the code lives), the rest over the inhabited surface
        // (uniform on the sphere, not on the map)
        if(n&&s!==SKIMMER&&r(20)<(s===MOTE?.55:.7)){const k=Math.floor(r(21)*n)%n,a=r(22)*TAU,d=S.r[k]*(1.1+1.6*r(23));out[0]=S.x[k]+Math.cos(a)*d;out[2]=S.z[k]+Math.sin(a)*d;}
        else{const c0=Math.cos(SOFT/K*.92),th=Math.acos(1-(1-c0)*r(21)),a=r(22)*TAU;out[0]=Math.cos(a)*th*K;out[2]=Math.sin(a)*th*K;}
        const sp=api.species[s];out[1]=sp.yMin+(sp.yMax-sp.yMin)*(.2+.6*r(24));
        if(s===MOTE){api.ia[i*2]=-1;api.ia[i*2+1]=-1e6;}
      },
      steer(api,i,f,dist){
        const S=api.sites,s=api.sp[i],x=api.px[i],y=api.py[i],z=api.pz[i],m=api.mode[i];
        // the life's reach: back toward the pole past it (the seam is never reached)
        const rho=hyp(x,z);if(rho>SOFT){const c=(rho-SOFT)*2.4/rho;f[0]-=x*c;f[2]-=z*c;}
        // a strained site (a failing run) opens a void over its region: everything is pushed out of it while the strain
        // lasts; the motes wait at its edge
        for(let q=0;q<nStr;q++){const k=strained[q],ex=x-S.x[k],ez=z-S.z[k],d=hyp(ex,ez),R=VR[k];
          if(d<R&&d>1e-3){const c=(s===EMBER?3:4.5)*Math.min(1,STR[k]*3)*(1-d/R)/d;f[0]+=ex*c;f[2]+=ez*c;}}
        // its own altitude: each inhabitant keeps to a height of its own above the surface while it explores (seeded)
        if(m===MODE.explore||m===MODE.settle||m===MODE.rest){const sp=api.species[s],h=api.fa[i*2+1],yt=sp.yMin+(sp.yMax-sp.yMin)*(s===EMBER?.15+.3*h:.15+.7*h*h);
          f[1]+=(yt-y)*(m===MODE.settle?1.6:.5)-api.vy[i]*.6;}
        if(s===MOTE){
          // a recovered site draws the explorers around it back (the repaired region fills again)
          if(m===MODE.explore)for(let q=0;q<nRev;q++){const k=revived[q],ex=S.x[k]-x,ez=S.z[k]-z,d=hyp(ex,ez);if(d<9&&d>S.r[k]*1.5){const c=1.1*REV[k]*(1-d/9)/d;f[0]+=ex*c;f[2]+=ez*c;}}
          // seekers swim against the current, and close to their site come in to it (its pull outweighs the trail they
          // followed there)
          if(m===MODE.seek){api.flowAt(x,y,z,fl);const c0=.33*api.params.environment;f[0]-=fl[0]*c0;f[2]-=fl[2]*c0;
            const k=api.tgt[i];if(k>=0){const ex=S.x[k]-x,ez=S.z[k]-z,d=hyp(ex,ez);if(d<4&&d>1e-3){const c=1.2*(1-d/4)/d;f[0]+=ex*c;f[2]+=ez*c;}}}
        }else if(s===SKIMMER&&((i+api.tick)&1)===0){
          // skimmers lean toward the energy the gatherings leave
          const g=api.gradient(CH.energy,x,z),gl=hyp(g[0],g[1]);if(gl>1e-4){const c=Math.min(1,gl*1.5)/gl*.9;f[0]+=g[0]*c;f[2]+=g[1]*c;}
        }
      },
      decide(api,i,nb,dist){
        // a flock grown too large splits: crowded skimmers peel away from the flock's centre for a few seconds
        if(api.sp[i]===SKIMMER)return api.mode[i]===MODE.explore&&nb>FLOCK*api.params.collective*(E2?api.felt(SKIMMER,'cohesion'):1)&&api.random(i,3)<.02?MODE.disperse:-1;
        if(api.sp[i]!==MOTE)return -1;const m=api.mode[i],s=api.species[MOTE];
        if(m===MODE.explore){
          if(api.en[i]<s.restBelow||api.modeT[i]<HZ||dist>=s.disturbBelow)return -1;
          // a recovered site nearby: they come back to it, a few at a time
          if(nRev&&api.random(i,1)<.02){let best=-1,bd=9;for(let q=0;q<nRev;q++){const k=revived[q],d=hyp(api.sites.x[k]-api.px[i],api.sites.z[k]-api.pz[i]);if(d<bd&&REV[k]>.2){bd=d;best=k;}}
            if(best>=0){api.tgt[i]=best;return MODE.seek;}}
          // curious: a site of its own choosing (a full one is left alone for now: it keeps drifting)
          if(api.random(i,2)<CURIOSITY*api.params.vitality*(E2?api.felt(MOTE,'activity')*Math.pow(EXP,.8):api.cond.activity)){const q=choose(api,i,-1);
            if(q>=0&&api.sites.visits[q]<CROWD*(E2?GA:1)*api.params.collective*1.2){api.tgt[i]=q;return MODE.seek;}}
          return -1;}
        if(m===MODE.seek){const k=api.tgt[i];if(k>=0&&STR[k]>.35)return MODE.explore;return -1;}
        if(m===MODE.orbit){const k=api.tgt[i];if(k<0)return -1;
          if(STR[k]>.25||dist>s.disturbBelow*1.3)return MODE.disperse;
          if(api.en[i]>=1)return leave(api,i,k);
          // (ecology 2: a site the turning attractor has left behind loses its visitors to the ones it favours)
          if(E2&&api.modeT[i]>4*HZ){const sh=api.shiftOf(k);if(sh<.85&&api.random(i,16)<.012*(.85-sh)*EXP)return leave(api,i,k);}
          return -1;}
        return -1;
      }};
    return {capacity:CAPACITY,trail:TRAIL_K,bounds:{min:[-FIELD,.04,-FIELD],max:[FIELD,1.2,FIELD]},
      field:{nx:64,nz:64,decay:{trail:.993,energy:.995,disturb:.99,flow:.95},diffuse:{trail:.1,energy:.07,disturb:.09,flow:.14},saturate:{trail:4,energy:4,disturb:3,flow:.6},advect:.6},
      species:SPECIES,relations:RELATIONS,hooks,siteSlots:[0]};   // ia[i*2]: the site a mote last left
  }
  return {id:'fractal-continuum',version:1,ecosystem,habitat,siteOf,climate:section=>CLIMATE[section]||CLIMATE.home,capacity:CAPACITY,trail:TRAIL_K};
}

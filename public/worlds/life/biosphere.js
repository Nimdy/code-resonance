// Fractal Biosphere's digital life: an underwater ecology living among the organisms the code grows. Pure (no rendering):
// the grammar of the ecosystem (life/sim.js) for the world (biosphere.js draws it), tested in Node
// (tests/life-biosphere.test.js).
//
// Four populations, each with its own rules (no entity knows the choreography; it emerges from local rules and the
// shared fields):
//  - pollinators  choose a crown to visit (bright, nourished, lasting, new, already marked by other pollinators' trails;
//                 not crowded, not strained, near is better), circle it at their own radius and height, feed there, and
//                 when satiated peel away carrying its influence (a stronger trail) toward another organism. Crowding
//                 makes a gathering break up; a disturbance (a failing run on that subsystem) scatters it. They lay
//                 the trail channel (their pheromone) and follow it: trails attract more pollinators.
//  - spores       ride the broad current (and the circulation a gathering of pollinators stirs up), are slowed and
//                 deflected by the organisms' trunks and crowns, collect where the water is calm close to a structure
//                 (settle) and are dislodged again by the momentum of a passing swarm, a disturbance or a stronger current.
//  - plankton     bioluminescent micro-organisms in coordinated colonies (separation, alignment, cohesion), steered by
//                 the fields (toward energy, away from disturbance), curious about a new organism, resting low when
//                 spent; they shy away from pollinators and drifters (a colony parts around them).
//  - drifters     slow scavengers near the floor, moving through the quiet spaces (away from trails and energy), grazing
//                 through spore clouds; they become visible when the conditions around them change.
//
// Habitat (sites): per organism a crown site (id: the subsystem's id, so engineering events reach it) at the centre
// of its crowns as they are rendered (biosphere-growth.js growForest on the model, at the organism's rest size) and a
// root site (the trunk the others steer around). A pure function of the model and the time; organisms are grown once
// per distinct structure (memoised by a signature of what growForest reads), so the habitat stays cheap.
import {MODE,CH,HZ} from './sim.js';
import {growForest,SPECIES} from '../biosphere-growth.js';
export const POLLINATOR=0,SPORE=1,PLANKTON=2,DRIFTER=3;
export const SPECIES_NAMES=['pollinator','spore','plankton','drifter'];
const num=(x,d)=>Number.isFinite(x)?x:d;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const r3=x=>Math.round(x*1000)/1000;
const hyp=(a,b)=>Math.sqrt(a*a+b*b);
export const CAPACITY=1000,TRAIL_K=10;
// How the organisms' crowns are summarised as a site (unscaled, the organism's rest geometry).
function summarise(o){
  let cx=0,cy=0,cz=0,n=0;for(const c of o.crown){cx+=c.p[0];cy+=c.p[1];cz+=c.p[2];n++;}
  if(!n){cx=o.root[0];cz=o.root[2];cy=o.height*.6;n=1;}else{cx/=n;cy/=n;cz/=n;}
  let h2=0;for(const c of o.crown)h2+=(c.p[0]-cx)**2+(c.p[2]-cz)**2;const hr=o.crown.length?Math.sqrt(h2/o.crown.length):0;
  return {root:o.root.slice(),height:o.height,radius:o.radius,cx,cy:Math.max(cy,o.height*.5),cz,cr:clamp(.5*o.radius+.9*hr+.2,.7,Math.max(.7,o.radius*1.1)),species:o.species};
}
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
    const sites=[];
    const districts=[...model.districts.values()].filter(d=>d.members.length).sort((a,b)=>a.order-b.order);
    for(const d of districts){
      let alive=0,val=0,str=0;
      for(const id of d.members){const m=model.modules.get(id);if(!m||!(model.bornAt(m)<=t)||(m.removed!==null&&m.removed<=t))continue;alive++;const s=model.stateAt(m,t);if(s==='validated')val++;else if(s==='stressed')str++;}
      if(!alive)continue;
      const o=organism(model,d,cross.get(d.id)||0,Mb);if(!o)continue;
      // The organism's rest size (biosphere.js Sof0: positions scale about the root).
      const S=.7+.17*Math.log2(1+d.members.length),R=o.root;
      const w=Math.sqrt(alive)*(1+.5*val/alive-.6*str/alive)+.1;
      sites.push({id:d.id,x:r3(R[0]+(o.cx-R[0])*S),y:r3(o.cy*S),z:r3(R[2]+(o.cz-R[2])*S),r:r3(o.cr*S),w:r3(w),kind:0});
      sites.push({id:`${d.id}#root`,x:r3(R[0]),y:r3(Math.min(.8,o.height*S*.2)),z:r3(R[2]),r:r3(.12+.1*S+(o.species==='kelp'?0:.08)),w:r3(w*.25),kind:1});
    }
    return sites;
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
  const SPECIES_SPEC=[
    {name:'pollinator',share:.15,radius:1,sepRadius:.45,maxSpeed:1.15,minSpeed:.2,maxForce:2.6,mass:1,drag:.1,sep:1.8,ali:.15,coh:.08,
      seek:1.4,orbit:1.6,orbitRadius:1.05,orbitSpeed:.5,orbitJitter:.35,orbitBand:.45,curiosity:0,
      trail:1.1,deposit:.025,carryDeposit:.06,energyDeposit:.015,flow:.25,push:.025,avoid:2.2,wander:.45,wanderJitter:.35,
      crowd:9,satiate:.0012,metabolism:.0005,restBelow:.08,restRecover:.002,disturbBelow:.3,life:[70,200],fade:2.5,respawn:[1,6],yMin:.8,yMax:12},
    {name:'spore',share:.31,radius:.5,sepRadius:.22,maxSpeed:.9,minSpeed:.03,maxForce:1.6,mass:.6,drag:.25,sep:1.2,ali:0,coh:0,
      orbit:0,curiosity:0,trail:0,deposit:0,carryDeposit:0,energyDeposit:0,flow:1.6,push:0,avoid:1.6,wander:.18,wanderJitter:.5,
      crowd:30,metabolism:0,restBelow:-1,disturbBelow:.25,settle:0,settleFlow:.5,life:[45,130],fade:3,respawn:[1,5],yMin:.25,yMax:11,yHold:.05},
    {name:'plankton',share:.4,radius:.9,sepRadius:.28,maxSpeed:1,minSpeed:.12,maxForce:2.2,mass:.8,drag:.15,sep:1.5,ali:.9,coh:.7,
      orbit:0,curiosity:0,trail:0,deposit:0,carryDeposit:0,energyDeposit:0,flow:.6,push:.006,avoid:2.4,wander:.35,wanderJitter:.35,
      crowd:14,metabolism:.0004,restBelow:.1,restRecover:.0025,disturbBelow:.25,life:[120,360],fade:3,respawn:[1,6],yMin:1,yMax:8,yHold:.15,yRest:.7},
    {name:'drifter',share:.14,radius:1,sepRadius:.8,maxSpeed:.45,minSpeed:.05,maxForce:1,mass:2.2,drag:.2,sep:2,ali:0,coh:0,
      orbit:0,curiosity:0,trail:-.5,deposit:0,carryDeposit:0,energyDeposit:0,flow:.35,push:.01,avoid:1.2,wander:.5,wanderJitter:.2,
      crowd:30,metabolism:0,restBelow:-1,disturbBelow:.5,life:[160,420],fade:5,respawn:[2,8],yMin:.3,yMax:3.2,yHold:.1}];
  // Between species: plankton colonies part around pollinators and drifters; drifters graze through spore clouds
  // (spores are pushed aside); pollinators keep clear of drifters.
  const RELATIONS=[
    [null,null,null,{avoid:.5,radius:1.2}],
    [null,null,null,{avoid:.6,radius:.8}],
    [{avoid:1.2,radius:.9},null,null,{avoid:.8,radius:1}],
    [null,{chase:.25,radius:1},null,null]];
  function ecosystem(params,seed){
    // ---- Derived habitat data (a pure function of the ecosystem's sites; recomputed when they change) ----------------
    let idsRef=null,nO=0,hx=0,hz=0,Rh=12;
    const oc=new Int16Array(64),or=new Int16Array(64);
    // Obstacles per organism (crown x, y, z, r; trunk x, z, radius, top; 0 when it has no root site).
    const OB=new Float32Array(64*8);
    function ensure(api){const S=api.sites,ids=S.ids;if(ids===idsRef)return;idsRef=ids;novTick=-1;
      const idx=new Map();for(let k=0;k<S.count;k++)idx.set(ids[k],k);
      nO=0;let sx=0,sz=0;for(let k=0;k<S.count;k++){if(S.kind[k]!==0)continue;oc[nO]=k;or[nO]=idx.get(`${ids[k]}#root`)??-1;nO++;sx+=S.x[k];sz+=S.z[k];}
      if(nO){hx=sx/nO;hz=sz/nO;Rh=7;for(let o=0;o<nO;o++){const k=oc[o];Rh=Math.max(Rh,hyp(S.x[k]-hx,S.z[k]-hz)+S.r[k]+2.5);}}else{hx=0;hz=0;Rh=10;}
      for(let o=0;o<nO;o++){const k=oc[o],kr=or[o],b=o*8;OB[b]=S.x[k];OB[b+1]=S.y[k];OB[b+2]=S.z[k];OB[b+3]=S.r[k];
        if(kr>=0){OB[b+4]=S.x[kr];OB[b+5]=S.z[kr];OB[b+6]=S.r[kr]+.35;OB[b+7]=S.y[k]-S.r[k]*.4;}else OB[b+6]=0;}
    }
    // Is a point close to a structure (in a crown's reach, or low near a trunk)?
    function nearOrg(S,x,y,z){for(let o=0;o<nO;o++){const k=oc[o],r=S.r[k];const ex=x-S.x[k],ez=z-S.z[k];
      if(Math.abs(ex)<r*1.4&&Math.abs(ez)<r*1.4&&Math.abs(y-S.y[k])<r*1.4&&ex*ex+ez*ez+(y-S.y[k])**2<r*r*1.9)return true;
      const kr=or[o];if(kr>=0&&y<1.6&&Math.abs(x-S.x[kr])<1.3&&Math.abs(z-S.z[kr])<1.3)return true;}return false;}
    const fl=[0,0,0],dg=[0,0];
    const CX=new Float64Array(256*5);let cT=NaN,cZ=NaN,cN=0,col=0,zc=0,zs=0,zt=0,zv=0;
    // Per tick: the novelty of each organism (plankton read it). Keyed by the tick and the site conditions' identity
    // (a restore or a habitat change replaces them), so a restored past never reads a stale value.
    const nov=new Float32Array(64);let novTick=-1,nNov=0,novRef=null;
    function perTick(api){const ref=nO?api.sites.state(oc[0]):null;if(novTick===api.tick&&novRef===ref)return;novTick=api.tick;novRef=ref;nNov=0;for(let o=0;o<nO;o++){const st=api.sites.state(oc[o]);nov[o]=st?st.novelty:0;if(nov[o]>=.15)nNov++;}}
    const curiosity=.012;
    // Pollinators: the crown to visit (a weighted draw from the entity's own random stream).
    const W=new Float64Array(64);
    function chooseCrown(api,i){
      const S=api.sites,P=api.params,c=api.cond,x=api.px[i],z=api.pz[i],crowd=api.species[POLLINATOR].crowd;let total=0;
      for(let o=0;o<nO;o++){const k=oc[o],st=S.state(k);if(!st){W[o]=0;continue;}
        let a=S.w[k]*(1+1.5*st.novelty+.8*st.lasting+.8*st.nourish);
        a*=.5+Math.min(2,api.sample(CH.energy,S.x[k],S.z[k]));
        // Trail reinforcement: a crown other pollinators have marked draws more of them.
        a*=1+4*Math.min(2,api.sample(CH.trail,S.x[k],S.z[k]));
        a*=1/(1+hyp(S.x[k]-x,S.z[k]-z)/12);{const v=S.visits[k]/crowd;a*=1/(1+v*v);}a*=1-.9*st.stress;
        if(k===api.tgt[i])a*=.15;
        W[o]=Math.max(0,a*c.attract*P.attraction);total+=W[o];}
      if(total<=0)return -1;let u=api.random(i,7)*total;for(let o=0;o<nO;o++){u-=W[o];if(u<=0)return oc[o];}return oc[nO-1];
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
      steer(api,i,f){
        ensure(api);perTick(api);const S=api.sites,k=api.sp[i],x=api.px[i],y=api.py[i],z=api.pz[i],m=api.mode[i];
        // Home: the ecology lives among the organisms (a soft edge around the habitat).
        {const dx=x-hx,dz=z-hz,d=hyp(dx,dz),R=Rh*(k===DRIFTER?1.1:1);if(d>R){const c=(d-R)*.5/d;f[0]-=dx*c;f[2]-=dz*c;}}
        // Structures: trunks and the dense core of a crown deflect everything but the pollinators (who live in the
        // crowns); a crown slows the spores passing through it (they collect there when the water is calm).
        if(k!==POLLINATOR)for(let o=0,b=0;o<nO;o++,b+=8){
          const tr=OB[b+6];if(tr>0&&y<OB[b+7]){const ex=x-OB[b+4],ez=z-OB[b+5];if(ex<tr&&ex>-tr&&ez<tr&&ez>-tr){const h=Math.sqrt(ex*ex+ez*ez);if(h<tr&&h>1e-4){const p=(tr-h)/tr*5/h;f[0]+=ex*p;f[2]+=ez*p;}}}
          const cr=OB[b+3],ex=x-OB[b],ey=y-OB[b+1],ez=z-OB[b+2];if(ex>cr||ex<-cr||ez>cr||ez<-cr||ey>cr||ey<-cr)continue;
          const d=Math.sqrt(ex*ex+ey*ey+ez*ez);if(d>=cr||d<1e-4)continue;
          const core=cr*.55;if(d<core){const p=(core-d)/core*3/d;f[0]+=ex*p;f[1]+=ey*p;f[2]+=ez*p;}
          if(k===SPORE){const g=1.2*(1-d/cr);f[0]-=api.vx[i]*g;f[1]-=api.vy[i]*g;f[2]-=api.vz[i]*g;}}
        // Field readings are staggered (every second or fourth tick per entity) and kept in the entity's scratch
        // state (plankton, drifters), so a reading costs little and stays exact across restores.
        const ph=(i+api.tick)&3,o2=i*2;
        if(k===POLLINATOR){
          // Explorers lean toward richer water.
          if(m===MODE.explore&&(ph&1)===0){const g=api.gradient(CH.energy,x,z),gl=hyp(g[0],g[1]);if(gl>1e-4){const c=Math.min(1,gl)/gl*1.2;f[0]+=g[0]*c;f[2]+=g[1]*c;}}
        }else if(k===PLANKTON){
          if((ph&1)===0){
            if(m!==MODE.rest){const g=api.gradient(CH.energy,x,z),gl=hyp(g[0],g[1]);const c=gl>1e-4?Math.min(1,gl*2)/gl*1.1:0;api.fa[o2]=g[0]*c;api.fa[o2+1]=g[1]*c;}else{api.fa[o2]=0;api.fa[o2+1]=0;}
            // Feeding where the water is rich (energy restores them).
            api.en[i]=Math.min(1.05,api.en[i]+.003*Math.min(2,api.sample(CH.energy,x,z)));}
          f[0]+=api.fa[o2];f[2]+=api.fa[o2+1];
          // Curious colonies: a new organism draws them in for a while.
          if(m!==MODE.rest&&nNov){for(let o=0;o<nO;o++){const nv=nov[o];if(nv<.15)continue;const q=oc[o],ex=S.x[q]-x,ez=S.z[q]-z,d=hyp(ex,ez);if(d<16&&d>S.r[q]*1.6){const c=.9*nv/d;f[0]+=ex*c;f[2]+=ez*c;f[1]+=(S.y[q]-y)*.1*nv;}}}
        }else if(k===DRIFTER){
          if(ph===0){const g=api.gradient(CH.energy,x,z),gl=hyp(g[0],g[1]);if(gl>1e-4){const c=Math.min(1,gl)/gl*.6;dg[0]=g[0]*c;dg[1]=g[1]*c;}else{dg[0]=dg[1]=0;}
            // Arousal (presentation reads it): how much the conditions around it differ from what it has been used to.
            const ds=api.sample(CH.disturb,x,z),v=ds*1.5+api.sample(CH.energy,x,z)+api.sample(CH.trail,x,z)*.5;
            api.fa[o2]+=(v-api.fa[o2])*.04;const target=Math.min(1,Math.abs(v-api.fa[o2])*1.5+ds);api.fa[o2+1]+=(target-api.fa[o2+1])*.18;
            f[0]-=dg[0]*4;f[2]-=dg[1]*4;}
        }else if(k===SPORE&&m===MODE.settle){f[1]-=.04;}
      },
      decide(api,i,nb,dist){
        const k=api.sp[i],m=api.mode[i];
        if(k===POLLINATOR){
          if(m===MODE.explore&&api.en[i]>=api.species[k].restBelow&&api.modeT[i]>2*HZ&&dist<api.species[k].disturbBelow&&api.random(i,1)<curiosity*api.cond.activity*api.params.vitality){
            ensure(api);const q=chooseCrown(api,i);if(q>=0){api.tgt[i]=q;return MODE.seek;}}
          return -1;
        }
        if(k===SPORE){
          const x=api.px[i],y=api.py[i],z=api.pz[i];
          if(m===MODE.settle){
            // Dislodged: the momentum of a passing swarm, a disturbance, a stronger current, or simply in time.
            const mx=api.sample(CH.flowX,x,z),mz=api.sample(CH.flowZ,x,z);
            if(hyp(mx,mz)>.2||dist>.12)return MODE.explore;
            api.flowAt(x,y,z,fl);if(hyp(fl[0],fl[2])>.42)return MODE.explore;
            return -1;
          }
          if(m===MODE.explore&&api.modeT[i]>3*HZ&&dist<.06&&api.random(i,3)<.03){ensure(api);
            api.flowAt(x,y,z,fl);if(hyp(fl[0],fl[2])<.3&&nearOrg(api.sites,x,y,z))return MODE.settle;}
          return -1;
        }
        return -1;
      }
    };
    return {capacity:CAPACITY,trail:TRAIL_K,bounds:{min:[-HALF,.1,-HALF],max:[HALF,14,HALF]},
      field:{nx:64,nz:64,decay:{trail:.992,energy:.996,disturb:.992,flow:.95},diffuse:{trail:.1,energy:.06,disturb:.08,flow:.12},advect:.5},
      species:SPECIES_SPEC,relations:RELATIONS,hooks};
  }
  return {id:'fractal-biosphere',version:1,ecosystem,habitat,climate:section=>CLIMATE[section]||CLIMATE.home,
    // For tests and inspection.
    summarise:(model,d)=>organism(model,d,0,0)};
}

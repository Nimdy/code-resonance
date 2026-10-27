// Stellar Forge's digital life: living celestial matter (life/sim.js grammar 'stellar-forge'). Ambient matter organised
// by forces, never progress: it is never labelled, never counted as an agent and never placed from an event.
//
// Frame: the galaxy's own frame (the frame of its stars and arms: rotation removed, the arms' log spiral fixed at
// theta = ARM0 + ln(q) / tan(pitch)), scaled so the galaxy's radius is RN units whatever the project's size. Systems sit
// still in it between structural changes (the world turns the whole frame by the galaxy's rotation and by its arm turn
// ln(galR / R0) / tan(pitch), exactly as it turns its own stars), so the matter keeps its place in the arms as the
// galaxy grows and turns. toEco / fromEco are that transform.
//
// Populations (species):
//  dust       drift dust: rides the disc's differential rotation and the density waves along the arms (macro), follows
//             the trail it lays (streams and filaments form and deform, meso), is captured into circulating zones
//             around massive systems, escapes where the flow is stronger than the pull, avoids the stellar wind;
//  fragments  small orbiting fragments: choose a system (bigger, nourished, lasting ones attract more), fall in, orbit
//             at their own radius in the system's sense of rotation until fed, then leave carrying a stronger trail
//             (accretion streams);
//  motes      charged particulate clusters: tight flocks (high alignment and cohesion) that respond most visibly
//             (micro), ride filaments, are drawn to fragments and flee the wind and disturbance quickly;
//  wind       stellar wind: outflow leaving each system under radiation pressure, stronger and more turbulent from a
//             strained system; its momentum enters the flow field, so it bends the trajectories of the others.
// Forces per entity (hooks.steer): the flow (macro current + momentum the populations left) weakened inside a capture
// zone; each system's bounded attraction toward an orbital band around it (pull from outside, push from inside), a
// tangential drive in the system's own sense of rotation and radial damping in the band (capture into temporary
// orbits); disc confinement; turbulence where the field is disturbed. Everything is bounded and comes from the grammar's
// inputs (sites, their conditions, the climate, the life values) and the entity's own seeded stream.
// Events act only through the fields and site conditions (life/driver.js): a failure strains a system (it emits
// disturbance, its pull weakens, its wind strengthens: matter is blown out, turbulent); a recovery clears it (matter
// is recaptured); a verified milestone ('lasting') makes a persistent, wider, stronger attractor.
import {u01,MODE,CH} from './sim.js';
export const RN=20;                 // the galaxy's radius in the ecosystem's units
const KTRAIL=12;                    // trail points per entity (TRAIL_EVERY ticks apart: 1.8 s of history)
const TAU=Math.PI*2;
const ROLES=['interface','services','model','logic','tests','core'];
export const NUCLEUS_KIND=6;
// The galaxy-local position (world units, rotation removed) of a point -> the ecosystem's frame, and back.
export function toEco(x,y,z,galR,turn,out=[0,0,0]){const k=RN/galR,c=Math.cos(turn),s=Math.sin(turn);out[0]=(c*x+s*z)*k;out[1]=y*k;out[2]=(-s*x+c*z)*k;return out;}
export function fromEco(x,y,z,galR,turn,out=[0,0,0]){const k=galR/RN,c=Math.cos(turn),s=Math.sin(turn);out[0]=(c*x-s*z)*k;out[1]=y*k;out[2]=(s*x+c*z)*k;return out;}
// Per-species values the grammar reads itself (the shared simulation's flow term is off: flow is coupled here).
//   flowK: coupling to the current, grav: pull toward the band, swirl: tangential drive, damp: radial damping in the band,
//   band: [min, max] orbital band (units outside the system's planets), wind: radiation pressure, ystiff: hold to the
//   disc plane, turb: shaking where the field is disturbed
const SPX=[
  {flowK:.95,grav:.55,swirl:.4,damp:.3,band:[.4,2.2],wind:0,ystiff:.9,turb:.9},
  {flowK:.55,grav:1.3,swirl:.9,damp:.8,band:[.15,1.2],wind:0,ystiff:1.3,turb:.6},
  {flowK:.7,grav:.6,swirl:.5,damp:.3,band:[.6,2.4],wind:0,ystiff:.9,turb:1.4},
  {flowK:.3,grav:0,swirl:.15,damp:0,band:[0,0],wind:1.8,ystiff:.5,turb:1}];
export function createStellarGrammar({layout,capacity=1100}){
  const cfg=layout.cfg,ARR=cfg.ARR,ARMS=cfg.ARMS,ARM0=cfg.ARM0,TANP=cfg.TANP;
  const CLUSTER=ARR==='cluster',ARMED=ARR==='spiral'||ARR==='binary-core';
  const B=RN*1.3,YB=CLUSTER?RN*.75:1.6;
  // ---- Habitat: one site per star system alive at t (its band just outside its planets), plus the galactic nucleus --
  function habitat(model,t){
    const lay=layout.blended(model,t,0),galR=lay.galR,turn=layout.armTurn(galR),k=RN/galR,out=[];
    const n=new Map();for(const m of model.modules.values())if(layout.aliveAt(model,m,t))n.set(m.group,(n.get(m.group)||0)+1);
    let nMax=8;for(const v of n.values())nMax=Math.max(nMax,v);
    let core=false;const e=[0,0,0];
    for(const d of lay.list){const p=lay.pos.get(d.id);if(!p)continue;toEco(p.x,p.y,p.z,galR,turn,e);
      const size=.3+.7*Math.log2(1+(n.get(d.id)||0))/Math.log2(1+nMax),ri=ROLES.indexOf(d.role);if(d.core)core=true;
      out.push({id:d.id,x:e[0],y:e[1],z:e[2],r:Math.max(.5,(lay.S.get(d.id)-.5)*k),w:size*(d.core?1.3:1),kind:ri<0?3:ri});}
    if(!core&&!CLUSTER)out.push({id:'#nucleus',x:0,y:0,z:0,r:RN*.07,w:.9,kind:NUCLEUS_KIND});
    return out;
  }
  // ---- The macro current: the disc's differential rotation relative to the arm pattern (inner disc ahead of it,
  // outer disc behind: shear), density waves (the gas slows and streams across the arms, so it gathers in them), a
  // looser wave migrating through the disc (its phase turned by the climate's swing) and a few slow eddies. Static parts
  // are tabulated per field cell; per tick only the phases change.
  const NX=64,cw=2*B/NX,NC=NX*NX,V=.42;
  const tab={vx:new Float32Array(NC),vz:new Float32Array(NC),rx:new Float32Array(NC),rz:new Float32Array(NC),cs2:new Float32Array(NC),sn2:new Float32Array(NC),
    ed:new Float32Array(NC*6)};
  const EDDY=[[.21,.13,.05,.9],[-.11,.24,-.037,1.7],[.17,-.19,.028,4.1]];   // kx, kz, omega, phase (stream function modes)
  const EKX=new Float64Array(EDDY.map(e=>e[0])),EKZ=new Float64Array(EDDY.map(e=>e[1])),EW=new Float64Array(EDDY.map(e=>e[2]));
  for(let j=0;j<NX;j++)for(let i=0;i<NX;i++){const q=j*NX+i,x=-B+(i+.5)*cw,z=-B+(j+.5)*cw,r=Math.hypot(x,z),qq=r/RN,th=Math.atan2(z,x);
    const ux=r>1e-6?x/r:0,uz=r>1e-6?z/r:0;tab.rx[q]=ux;tab.rz[q]=uz;
    let vt=V*(1-1.2*Math.min(qq,1.25))*Math.min(1,qq/.12),vr=0;
    let cx=0,cz=0;
    if(ARMED){const psi=ARMS*(th-ARM0-Math.log(Math.max(qq,.05))/TANP),arm=Math.min(1,qq/.2)*(1-Math.min(1,Math.max(0,(qq-.95)/.25)));vt*=1-.3*Math.cos(psi)*arm;vr+=.13*V*Math.sin(psi)*arm;
      // the spiral potential: the gas converges onto the arm crest (a density-wave shock), across the arm (grad psi)
      const gx=(-uz)/Math.max(r,1)-ux/(Math.max(r,1)*TANP),gz=ux/Math.max(r,1)-uz/(Math.max(r,1)*TANP),gl=Math.hypot(gx,gz)||1,c=-.42*V*Math.sin(psi)*arm;cx=gx/gl*c;cz=gz/gl*c;}
    else if(ARR==='ring')vr+=-.5*V*(qq-.66)*Math.exp(-((qq-.66)/.35)*((qq-.66)/.35));
    if(CLUSTER)vt*=.5;
    if(qq>1.02)vr-=.6*V*(qq-1.02)/.2;
    // trailing rotation (the galaxy turns toward decreasing angle): -e_theta = (sin, -cos)
    tab.vx[q]=vt*uz+vr*ux+cx;tab.vz[q]=-vt*ux+vr*uz+cz;
    const p2=ARMS*(th-ARM0)-9*qq;tab.cs2[q]=Math.cos(p2)*Math.min(1,qq/.25)*(qq<1.05?1:0);tab.sn2[q]=Math.sin(p2)*Math.min(1,qq/.25)*(qq<1.05?1:0);
    for(let m=0;m<3;m++){const [kx,kz,,ph]=EDDY[m];const a=kx*x+kz*z+ph;tab.ed[q*6+m*2]=Math.cos(a);tab.ed[q*6+m*2+1]=Math.sin(a);}}
  function makeHooks(){
    let dirty=true;
    let lastT=NaN,wc=1,ws=0,swingNow=0;const ec=new Float64Array(3),es=new Float64Array(3);
    function current(x,y,z,t,cond,out){
      if(t!==lastT||cond.swing!==swingNow){lastT=t;swingNow=cond.swing;const a=t*TAU/90-cond.swing*1.2;wc=Math.cos(a);ws=Math.sin(a);for(let m=0;m<3;m++){ec[m]=Math.cos(EW[m]*t);es[m]=Math.sin(EW[m]*t);}}
      let i=Math.round((x+B)/cw-.5),j=Math.round((z+B)/cw-.5);i=i<0?0:i>=NX?NX-1:i;j=j<0?0:j>=NX?NX-1:j;const q=j*NX+i;
      if(q===0)dirty=true;   // the first cell of a tick: site conditions are read again before the entities steer
      // migrating wave: radial streaming sin(p2 - a)
      const w=(tab.sn2[q]*wc-tab.cs2[q]*ws)*.16*V*(1+.4*Math.abs(cond.swing));
      let ex=0,ez=0;for(let m=0;m<3;m++){const c=tab.ed[q*6+m*2]*ec[m]-tab.ed[q*6+m*2+1]*es[m];ex+=c*EKZ[m];ez-=c*EKX[m];}
      const turb=.3*V*(.6+.4*cond.turb);
      out[0]=tab.vx[q]+tab.rx[q]*w+ex*turb;out[1]=0;out[2]=tab.vz[q]+tab.rz[q]*w+ez*turb;
    }
    // ---- Per tick: each site's pull, capture radius, sense of rotation, strain ----------------------------------
    const ST={G:new Float32Array(64),Rc:new Float32Array(64),spin:new Float32Array(64),stress:new Float32Array(64),wind:new Float32Array(64)};let nS=0;
    function sitesTick(api){
      const S=api.sites,P=api.params,c=api.cond;nS=S.count;
      for(let k=0;k<nS;k++){const st=S.state(k),lasting=st.lasting||0;
        ST.G[k]=1.7*S.w[k]*(1+.8*lasting+.3*st.nourish+.4*st.novelty)*(1-.75*st.stress)*c.attract*P.attraction;
        ST.Rc[k]=S.r[k]+3.2+2.2*lasting+.8*st.novelty;ST.stress[k]=st.stress;
        ST.wind[k]=(.5+.5*S.w[k])*(1+2.6*st.stress)*P.repulsion;
        // most systems turn with the galaxy; some against it (regions with a different behaviour)
        const h=u01(api.seed,Math.round(S.x[k]*64),Math.round(S.z[k]*64),77);ST.spin[k]=S.kind[k]===NUCLEUS_KIND?-1:h<.72?-1:1;}
    }
    const fl=[0,0,0];
    function nearest(api,x,z){let best=-1,bd=Infinity;for(let k=0;k<nS;k++){const dx=x-api.sites.x[k],dz=z-api.sites.z[k],d=Math.sqrt(dx*dx+dz*dz)/ST.Rc[k];if(d<bd){bd=d;best=k;}}return best;}
    function steer(api,i,f){
      if(dirty){sitesTick(api);dirty=false;}
      const s=api.sp[i],X=SPX[s],x=api.px[i],y=api.py[i],z=api.pz[i],ux=api.vx[i],uy=api.vy[i],uz=api.vz[i],m=api.mode[i],P=api.params;
      let k=api.ia[i*2];
      if(k>=nS||(k<0&&nS>0)||(s!==3&&((i+api.tick)&7)===0))k=api.ia[i*2]=nS?nearest(api,x,z):-1;
      let cap=0,yc=0;
      if(k>=0){const S=api.sites,dx=x-S.x[k],dz=z-S.z[k],d=Math.sqrt(dx*dx+dz*dz)||1e-3,R=S.r[k],Rc=ST.Rc[k],rx=dx/d,rz=dz/d;
        if(s===3){// stellar wind: radiation pressure out of its system, fading with distance
          const a=X.wind*ST.wind[k]/(1+Math.max(0,d-R)*.5);f[0]+=rx*a;f[2]+=rz*a;
          f[0]+=-rz*ST.spin[k]*a*X.swirl;f[2]+=rx*ST.spin[k]*a*X.swirl;}
        else if(d<Rc){const u=d/Rc;cap=(1-u)*(1-u);
          // the entity's own orbital band (seeded per entity: fa[0] is its jitter)
          // eccentric: the band leans toward the entity's own orientation (fa[1]), so the orbits are ellipses, not rings
          const ecc=1+.28*((rx*Math.cos(api.fa[i*2+1]*TAU)+rz*Math.sin(api.fa[i*2+1]*TAU)));
          const band=(R+X.band[0]+(X.band[1]-X.band[0])*api.fa[i*2])*ecc,e=d-band,G=ST.G[k]*X.grav;
          const ar=-G*Math.min(1,cap*3)*e/(Math.abs(e)+.8);f[0]+=rx*ar;f[2]+=rz*ar;
          const inBand=Math.exp(-e*e*1.2)*Math.min(1,cap*4),at=ST.G[k]*X.swirl*inBand*ST.spin[k];
          f[0]+=-rz*at;f[2]+=rx*at;
          const vr=ux*rx+uz*rz,dmp=X.damp*inBand*2;f[0]-=rx*vr*dmp;f[2]-=rz*vr*dmp;
          yc=S.y[k]*inBand;cap=Math.min(1,cap*2.2)*(m===MODE.disperse?.3:1);}}
      // the current, weaker inside a capture zone
      api.flowAt(x,y,z,fl);const fk=X.flowK*(1-.8*cap)*(m===MODE.settle?0:1)*P.environment;
      f[0]+=(fl[0]-ux)*fk;f[2]+=(fl[2]-uz)*fk;
      // a thin disc (a cluster is a thick swarm)
      if(!CLUSTER){f[1]+=(yc-y)*X.ystiff-uy*.6;}
      else{const r3=Math.hypot(x,y*1.4,z);if(r3>RN*.95){f[0]-=x/r3*(r3-RN*.95);f[1]-=y/r3*(r3-RN*.95);f[2]-=z/r3*(r3-RN*.95);}}
      const r=Math.sqrt(x*x+z*z);if(r>RN*1.06){const o=(r-RN*1.06)*1.5;f[0]-=x/r*o;f[2]-=z/r*o;}
      // turbulence where the field is disturbed (a strained system, a shock): shaking, never a jump
      const dist=api.sample(CH.disturb,x,z);
      if(dist>.35){const a=Math.min(1.2,dist-.35)*X.turb*P.repulsion,h=api.random(i,3)*TAU,v=api.random(i,4)-.5;f[0]+=Math.cos(h)*a;f[2]+=Math.sin(h)*a;f[1]+=v*a*.3;}
      api.ia[i*2+1]=Math.round(cap*1000);
    }
    // ---- Where matter appears: dust and motes in the disc (most along the arms), fragments around a system, wind at
    // a star (more from a strained one). Never at an event, never at an agent.
    function spawn(api,i,s,r,out){
      const S=api.sites,n=S.count;
      const pick=(wf)=>{let tot=0;for(let k=0;k<n;k++)tot+=wf(k);if(tot<=0)return -1;let u=r(20)*tot;for(let k=0;k<n;k++){u-=wf(k);if(u<=0)return k;}return n-1;};
      if((s===1||s===3)&&n){const k=s===3?pick(k=>S.w[k]*(1+3*(S.state(k).stress||0))):pick(k=>S.w[k]);
        if(k>=0){const a=r(21)*TAU,d=S.r[k]*(s===3?.35+.3*r(22):1.3+1.6*r(22));out[0]=S.x[k]+Math.cos(a)*d;out[1]=S.y[k]+(r(23)-.5)*.15;out[2]=S.z[k]+Math.sin(a)*d;api.ia[i*2]=k;return;}}
      if(CLUSTER){const rr=Math.pow(r(21),.6)*RN*.85,u=r(22)*2-1,a=r(23)*TAU,q=Math.sqrt(1-u*u);out[0]=Math.cos(a)*q*rr;out[1]=u*rr*.6;out[2]=Math.sin(a)*q*rr;return;}
      let q;if(ARR==='ring')q=.66+(r(21)+r(22)-1)*.25;else{q=-Math.log(1-r(21)*.93)/2.4;if(q>1.02)q=.3+.7*r(22);}
      let a;if(ARMED&&r(24)<.72){const arm=Math.floor(r(25)*ARMS);a=ARM0+arm/ARMS*TAU+Math.log(Math.max(q,.05))/TANP+(r(26)+r(27)-1)*.35;}else a=r(25)*TAU;
      out[0]=Math.cos(a)*q*RN;out[1]=(r(28)-.5)*.3;out[2]=Math.sin(a)*q*RN;
    }
    return {current,steer,spawn};
  }
  function ecosystem(){
    const species=[
      {name:'dust',share:.56,radius:.8,sepRadius:.3,maxSpeed:.95,minSpeed:.05,maxForce:1.3,mass:1.4,drag:.04,sep:.7,ali:.3,coh:.1,
        seek:0,orbit:0,curiosity:0,trail:.6,deposit:.03,carryDeposit:0,energyDeposit:0,flow:0,push:.006,avoid:1.7,wander:.12,wanderJitter:.25,
        crowd:40,satiate:0,metabolism:0,restBelow:0,disturbBelow:.55,life:[70,200],fade:4,respawn:[1,5],yMin:-YB,yMax:YB,congestion:.003,congestionAbove:20},
      {name:'fragments',share:.2,radius:.9,sepRadius:.35,maxSpeed:1.3,minSpeed:.08,maxForce:2,mass:1,drag:.06,sep:1.1,ali:.3,coh:.15,
        seek:.35,orbit:1.1,orbitRadius:1.25,orbitSpeed:.45,orbitJitter:.3,orbitBand:.06,curiosity:.005,trail:.35,deposit:.04,carryDeposit:.07,energyDeposit:.015,
        flow:0,push:.025,avoid:2.2,wander:.18,crowd:26,satiate:.0007,metabolism:.0007,restBelow:0,disturbBelow:.32,life:[90,260],fade:3,respawn:[1,5],yMin:-YB,yMax:YB},
      {name:'motes',share:.14,radius:1,sepRadius:.26,maxSpeed:1.15,minSpeed:.1,maxForce:2.6,mass:.7,drag:.08,sep:1.5,ali:1.1,coh:.75,
        seek:.3,orbit:.9,orbitRadius:1.7,orbitSpeed:.4,orbitJitter:.25,orbitBand:.1,curiosity:.003,trail:1,deposit:.02,energyDeposit:0,flow:0,push:.02,avoid:3,
        wander:.35,wanderJitter:.4,crowd:18,satiate:.0009,metabolism:.0008,restBelow:0,disturbBelow:.24,life:[80,220],fade:3,respawn:[1,5],yMin:-YB,yMax:YB},
      {name:'wind',share:.1,radius:.7,sepRadius:.4,maxSpeed:1.6,minSpeed:.2,maxForce:2.2,mass:.6,drag:.02,sep:.6,ali:.15,coh:0,
        seek:0,orbit:0,curiosity:0,trail:0,deposit:.004,flow:0,push:.11,avoid:0,wander:.15,crowd:99,satiate:0,metabolism:0,restBelow:0,disturbBelow:99,
        life:[9,20],fade:1.6,respawn:[.3,2.5],yMin:-YB,yMax:YB}];
    const relations=[[null,null,null,{avoid:1.4,radius:1.3}],[null,null,null,{avoid:1,radius:1.2}],[null,{chase:.22,radius:1.6},null,{avoid:2.2,radius:1.5}],[]];
    return {capacity,trail:KTRAIL,bounds:{min:[-B,-YB,-B],max:[B,YB,B]},
      field:{nx:NX,nz:NX,decay:{trail:.988,energy:.993,disturb:.986,flow:.975},diffuse:{trail:.1,energy:.08,disturb:.12,flow:.12},saturate:{trail:4,energy:4,disturb:3,flow:1.2},advect:.9},
      species,relations,hooks:makeHooks()};
  }
  return {id:'stellar-forge',version:1,ecosystem,habitat,capacity,trail:KTRAIL};
}

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
//             the trail it lays and aligns with its neighbours (streams and filaments form and deform, meso), is
//             captured into circulating zones around massive systems, escapes where the flow is stronger than the pull,
//             avoids the stellar wind; dust that drifts off the disc's rim or into the bulge dissipates and condenses
//             again on an arm crest or around a system (the disc recycles its matter: no pile-up at an edge);
//  fragments  small orbiting fragments: a resident population at every system (each system holds some, in proportion
//             to its weight, with a minimum), choose a system (bigger, nourished, lasting ones attract more), fall in,
//             orbit at their own radius in the system's sense of rotation until fed, then leave carrying a stronger
//             trail (accretion streams);
//  motes      charged particulate clusters: tight flocks (high alignment and cohesion) that respond most visibly
//             (micro), ride filaments, are drawn to fragments and flee the wind and disturbance quickly;
//  wind       stellar wind: outflow leaving each system under radiation pressure (most of it from a strained system,
//             stronger and more turbulent there); its momentum enters the flow field, so it bends the trajectories of
//             the others. Never perceives neighbours (it is steered by its system alone).
// Forces per entity (hooks.steer): the flow (macro current + momentum the populations left) weakened inside a capture
// zone; each system's bounded attraction toward an orbital band around it (pull from outside, push from inside), a
// tangential drive in the system's own sense of rotation and radial damping in the band (capture into temporary
// orbits); radiation pressure out of a strained system; disc confinement; a smooth, curling turbulence where the field
// is disturbed (never a per-tick jolt). Everything is bounded and comes from the grammar's inputs (sites, their
// conditions, the climate, the life values) and the entity's own seeded stream.
// Events act only through the fields and site conditions (life/driver.js): a failure strains a system (it emits
// disturbance, its pull weakens, its wind strengthens and blows captured matter out: turbulent); a recovery clears it
// and the system briefly pulls harder and wider (matter spirals back in within seconds); a verified milestone
// ('lasting') makes a persistent, wider, stronger attractor. The galactic centre is a weak, small attractor (it never
// becomes the single vortex of the whole disc).
import {u01,MODE,DT,CH} from './sim.js';
export const RN=20;                 // the galaxy's radius in the ecosystem's units
const KTRAIL=12;                    // trail points per entity (TRAIL_EVERY ticks apart: 1.8 s of history)
const TAU=Math.PI*2;
const ROLES=['interface','services','model','logic','tests','core'];
export const NUCLEUS_KIND=6;
// Matter spawned per species share of the capacity (dust, fragments, motes, wind).
export const SHARES=[.54,.24,.10,.12];
// The galaxy-local position (world units, rotation removed) of a point -> the ecosystem's frame, and back.
export function toEco(x,y,z,galR,turn,out=[0,0,0]){const k=RN/galR,c=Math.cos(turn),s=Math.sin(turn);out[0]=(c*x+s*z)*k;out[1]=y*k;out[2]=(-s*x+c*z)*k;return out;}
export function fromEco(x,y,z,galR,turn,out=[0,0,0]){const k=galR/RN,c=Math.cos(turn),s=Math.sin(turn);out[0]=(c*x-s*z)*k;out[1]=y*k;out[2]=(s*x+c*z)*k;return out;}
// A site at the galactic centre (the nucleus, or a core system drawn there): a weak, small attractor.
const CENTRAL=RN*.1;
// Per-species values the grammar reads itself (the shared simulation's flow term is off: flow is coupled here).
//   flowK: coupling to the current, grav: pull toward the band, swirl: tangential drive, damp: radial damping in the band,
//   band: [min, max, add] orbital band (multiples of the system's ring radius, plus a few units: a halo stays about the
//   size of the system's own ring, so the system, not its halo, is the focal mass), wind: radiation pressure, ystiff: hold to the
//   disc plane, ydamp: vertical damping (matter stays in the disc's plane), turb: curling where the field is disturbed,
//   blow: how hard a strained system's radiation drives captured matter out
const SPX=[
  {flowK:.95,grav:.55,swirl:.4,damp:.3,band:[1.3,2.1,.3],wind:0,ystiff:1.6,ydamp:2.2,turb:.8,blow:1.6},
  {flowK:.55,grav:1.3,swirl:.9,damp:.8,band:[1.05,1.45,.1],wind:0,ystiff:1.8,ydamp:2.4,turb:.6,blow:2.2},
  {flowK:.7,grav:.6,swirl:.5,damp:.3,band:[1.2,1.9,.25],wind:0,ystiff:1.2,ydamp:1.6,turb:1.2,blow:2},
  {flowK:.3,grav:0,swirl:.15,damp:0,band:[0,0,0],wind:1.8,ystiff:.8,ydamp:1.2,turb:.8,blow:0}];
export function createStellarGrammar({layout,capacity=1100}){
  const cfg=layout.cfg,ARR=cfg.ARR,ARMS=cfg.ARMS,ARM0=cfg.ARM0,TANP=cfg.TANP;
  const CLUSTER=ARR==='cluster',ARMED=ARR==='spiral'||ARR==='binary-core';
  const B=RN*1.3,YB=CLUSTER?RN*.75:1.6;
  // ---- Habitat: one site per star system alive at t (its radius: the system's own dusty orbit ring, as the world draws
  // it), plus the galactic nucleus --
  function habitat(model,t){
    const lay=layout.blended(model,t,0),galR=lay.galR,turn=layout.armTurn(galR),k=RN/galR,out=[];
    const n=new Map();for(const m of model.modules.values())if(layout.aliveAt(model,m,t))n.set(m.group,(n.get(m.group)||0)+1);
    let nMax=8;for(const v of n.values())nMax=Math.max(nMax,v);
    let core=false;const e=[0,0,0];
    for(const d of lay.list){const p=lay.pos.get(d.id);if(!p)continue;toEco(p.x,p.y,p.z,galR,turn,e);
      const size=.3+.7*Math.log2(1+(n.get(d.id)||0))/Math.log2(1+nMax),ri=ROLES.indexOf(d.role);if(d.core)core=true;
      out.push({id:d.id,x:e[0],y:e[1],z:e[2],r:Math.max(.35,Math.max(.6,lay.S.get(d.id)-1.1)*k),w:size*(d.core?1.3:1),kind:ri<0?3:ri});}
    if(!core&&!CLUSTER)out.push({id:'#nucleus',x:0,y:0,z:0,r:RN*.06,w:.4,kind:NUCLEUS_KIND});
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
    let lastT=NaN,wc=1,ws=0,swingNow=0;const ec=new Float64Array(3),es=new Float64Array(3);
    function current(x,y,z,t,cond,out){
      if(t!==lastT||cond.swing!==swingNow){lastT=t;swingNow=cond.swing;const a=t*TAU/90-cond.swing*1.2;wc=Math.cos(a);ws=Math.sin(a);for(let m=0;m<3;m++){ec[m]=Math.cos(EW[m]*t);es[m]=Math.sin(EW[m]*t);}}
      let i=Math.round((x+B)/cw-.5),j=Math.round((z+B)/cw-.5);i=i<0?0:i>=NX?NX-1:i;j=j<0?0:j>=NX?NX-1:j;const q=j*NX+i;
      // migrating wave: radial streaming sin(p2 - a)
      const w=(tab.sn2[q]*wc-tab.cs2[q]*ws)*.16*V*(1+.4*Math.abs(cond.swing));
      let ex=0,ez=0;for(let m=0;m<3;m++){const c=tab.ed[q*6+m*2]*ec[m]-tab.ed[q*6+m*2+1]*es[m];ex+=c*EKZ[m];ez-=c*EKX[m];}
      const turb=.3*V*(.6+.4*cond.turb);
      out[0]=tab.vx[q]+tab.rx[q]*w+ex*turb;out[1]=0;out[2]=tab.vz[q]+tab.rz[q]*w+ez*turb;
    }
    // ---- Per tick (hooks.tick, before anything moves): each site's pull, capture radius, sense of rotation, strain --
    // A recovery (the strain cleared) leaves `recap` on the site's conditions: for a few seconds the system pulls harder
    // and wider, so the matter its failure blew out spirals back in. Conditions are state (snapshots carry them), so
    // a restored past derives exactly the same values.
    // A failure's onset (the strain rising) leaves `shock` (about four seconds): the system's radiation blows its halo
    // out into an emptied bubble and a denser wind puffs out of it; the strain then holds a wider, scorched halo.
    // A new system (novelty) pulls harder and wider for a while: it captures the dust and drifters around it.
    const ST={G:new Float32Array(64),Rc:new Float32Array(64),spin:new Float32Array(64),stress:new Float32Array(64),wind:new Float32Array(64),recap:new Float32Array(64),
      shock:new Float32Array(64),held:new Float32Array(64)};let nS=0;
    function sitesTick(api){
      const S=api.sites,P=api.params,c=api.cond;nS=S.count;
      // the fragments each system holds now (new fragments go first where a halo is thin: every system keeps one)
      ST.held.fill(0);for(let i=0;i<api.capacity;i++){if(!api.alive[i]||api.sp[i]!==1)continue;const k=api.ia[i*2];if(k>=0&&k<nS)ST.held[k]++;}
      for(let k=0;k<nS;k++){const st=S.state(k),lasting=st.lasting||0;
        // (the halo the strain built is calmed too, so the matter held there is free to fall back)
        if((st.strained||0)>.15&&st.stress<.02){st.recap=1;api.disc(CH.disturb,S.x[k],S.z[k],S.r[k]*2.2+3,-3);}else st.recap=(st.recap||0)*.99;
        const rise=st.stress-(st.strained||0);st.shock=rise>.03?Math.min(1,(st.shock||0)+rise*4):(st.shock||0)*.975;
        st.strained=st.stress;const rc=st.recap,sN=Math.min(1,st.stress*3),sh=st.shock;
        const central=Math.hypot(S.x[k],S.z[k])<CENTRAL;
        ST.G[k]=1.7*S.w[k]*(1+.8*lasting+.3*st.nourish+.9*st.novelty+1.6*rc)*(1-.3*sN)*c.attract*P.attraction*(central?.5:1);
        ST.Rc[k]=S.r[k]*(central?1:1.7)+(central?1.2:1.6+2.2*lasting+2*st.novelty+1.6*rc)+(central?0:(sN+.6*sh)*(S.r[k]*.3+1));ST.stress[k]=sN;ST.recap[k]=rc;ST.shock[k]=sh;
        ST.wind[k]=(.5+.5*S.w[k])*(1+2.2*sN+2*sh)*P.repulsion;
        // most systems turn with the galaxy; some against it (regions with a different behaviour)
        const h=u01(api.seed,Math.round(S.x[k]*64),Math.round(S.z[k]*64),77);ST.spin[k]=S.kind[k]===NUCLEUS_KIND?-1:h<.72?-1:1;}
    }
    const fl=[0,0,0];
    // a seeded half of the dust are drifters (from the entity's own seeded values: no extra state)
    const drifter=(api,i)=>{const h=api.fa[i*2]*7.31+api.fa[i*2+1]*3.77;return h-Math.floor(h)<.55;};
    // The system an entity belongs to: the nearest relative to its reach, the present one a little preferred (no
    // flicker between two neighbours); matter held by a strained or recovering system stays its own while in its reach
    // (the blown-out halo is the system's, and falls back to it).
    function nearest(api,x,z,cur){let best=-1,bd=Infinity;for(let k=0;k<nS;k++){const dx=x-api.sites.x[k],dz=z-api.sites.z[k],d=Math.sqrt(dx*dx+dz*dz)/ST.Rc[k]*(k===cur?.85:1);if(d<bd){bd=d;best=k;}}return best;}
    function held(api,k,x,z){if(ST.stress[k]<.05&&ST.recap[k]<.05&&ST.shock[k]<.05)return false;const dx=x-api.sites.x[k],dz=z-api.sites.z[k];return dx*dx+dz*dz<ST.Rc[k]*ST.Rc[k];}
    function steer(api,i,f,distLocal){
      const s=api.sp[i],X=SPX[s],x=api.px[i],y=api.py[i],z=api.pz[i],ux=api.vx[i],uy=api.vy[i],uz=api.vz[i],m=api.mode[i],P=api.params;
      let k=api.ia[i*2];
      if(k>=nS||(k<0&&nS>0)||(s!==3&&((i+api.tick)&7)===0&&!held(api,k,x,z)))k=api.ia[i*2]=nS?nearest(api,x,z,k):-1;
      let cap=0,yc=0;
      if(k>=0){const S=api.sites,dx=x-S.x[k],dz=z-S.z[k],d=Math.sqrt(dx*dx+dz*dz)||1e-3,R=S.r[k],Rc=ST.Rc[k],rx=dx/d,rz=dz/d;
        if(s===3){// stellar wind: radiation pressure out of its system, fading with distance
          const a=X.wind*ST.wind[k]/(1+Math.max(0,d-R)*.5);f[0]+=rx*a;f[2]+=rz*a;
          f[0]+=-rz*ST.spin[k]*a*X.swirl;f[2]+=rx*ST.spin[k]*a*X.swirl;}
        else if(d<Rc){const u=d/Rc,rc0=Math.max(ST.recap[k],ST.stress[k]*.8);cap=(1-u)*(1-u*(1-rc0));   // a recovering or strained system reaches its whole zone (it holds its halo)
          // most dust only drifts past a system (its path curves around it and goes on: the arms keep their streams);
          // the rest is captured into its circulating zone
          if(s===0&&drifter(api,i))cap*=.22;   // a recovering system reaches its whole zone
          // the entity's own orbital band (seeded per entity: fa[0] is its jitter)
          // eccentric: the band leans toward the entity's own orientation (fa[1]), so the orbits are ellipses, not rings
          const ecc=1+.18*((rx*Math.cos(api.fa[i*2+1]*TAU)+rz*Math.sin(api.fa[i*2+1]*TAU)));
          // a strained system holds its matter further out (a turbulent, scorched halo): radiation pressure against its
          // weakened pull (at the failure's onset a shock blows it further still); when the strain clears the band falls
          // back and the matter spirals in
          const st=ST.stress[k],sh=ST.shock[k],band=(R*(X.band[0]+(X.band[1]-X.band[0])*api.fa[i*2])+X.band[2])*ecc+st*(R*.15+.5)+sh*(R*.3+.8),e=d-band,G=ST.G[k]*X.grav;
          const ar=-G*Math.min(1,cap*3)*e/(Math.abs(e)+.8);f[0]+=rx*ar;f[2]+=rz*ar;
          const inBand=Math.exp(-e*e*1.2)*Math.min(1,cap*4),at=ST.G[k]*X.swirl*inBand*ST.spin[k];
          f[0]+=-rz*at;f[2]+=rx*at;
          const vr=ux*rx+uz*rz,dmp=X.damp*inBand*2*Math.min(1,P.attraction);f[0]-=rx*vr*dmp;f[2]-=rz*vr*dmp;
          // a strained system's radiation drives its captured matter out (the failure is legible as an outflow)
          if((st>.02||sh>.02)&&e<0){const b=X.blow*(st*.6+2.2*sh)*Math.min(1,-e)*P.repulsion;f[0]+=rx*b;f[2]+=rz*b;}
          // a recovering system draws its scattered halo back in: an inward drift on top of the orbital drive, so the
          // matter falls in on spirals within seconds
          const rc=ST.recap[k];if(rc>.05&&e>0){const g=-rc*X.grav*1.6*Math.min(1,e*.8)*P.attraction;f[0]+=rx*g;f[2]+=rz*g;}
          yc=S.y[k]*inBand;cap=Math.min(1,cap*2.2)*(m===MODE.disperse?.3:1);}}
      // the current, weaker inside a capture zone
      api.flowAt(x,y,z,fl);const fk=X.flowK*(1-.8*cap)*(m===MODE.settle?0:1)*P.environment;
      f[0]+=(fl[0]-ux)*fk;f[2]+=(fl[2]-uz)*fk;
      // a thin disc (a cluster is a thick swarm): the vertical velocity is damped hard, so matter never streaks across
      // the disc's plane
      if(!CLUSTER){f[1]+=(yc-y)*X.ystiff-uy*X.ydamp;}
      else{const r3=Math.hypot(x,y*1.4,z);if(r3>RN*.95){f[0]-=x/r3*(r3-RN*.95);f[1]-=y/r3*(r3-RN*.95);f[2]-=z/r3*(r3-RN*.95);}}
      const r=Math.sqrt(x*x+z*z);if(r>RN*1.06){const o=(r-RN*1.06)*1.5;f[0]-=x/r*o;f[2]-=z/r*o;}
      // turbulence where the field is disturbed (a strained system, a shock): a smooth curl across the entity's own
      // motion (its phase turns over seconds), so paths swirl and curl instead of kinking
      if(distLocal>.25){const a=Math.min(1.2,distLocal-.25)*X.turb*P.repulsion,ph=api.fa[i*2]*TAU*3+api.tick*DT*(1.1+api.fa[i*2+1]),v=Math.sqrt(ux*ux+uz*uz)||1;
        const sn=Math.sin(ph),cs=Math.cos(ph*.7)*.4;f[0]+=(-uz*sn+ux*cs)/v*a;f[2]+=(ux*sn+uz*cs)/v*a;}
      api.ia[i*2+1]=Math.round(cap*1000);
      // the disc recycles its matter: dust that drifts off the rim, or into the bulge without being held by a system,
      // dissipates (it fades out over its species' fade time and condenses again elsewhere)
      if(s===0&&api.age[i]<api.life[i]&&api.age[i]>40&&(r>RN*1.04||(r<RN*.09&&cap<.2)))api.life[i]=api.age[i];
    }
    // ---- Where matter appears: dust and motes in the disc (most on the arm crests, some around systems), fragments
    // around a system (every system keeps a resident population: a minimum each, more for heavier ones; the galactic
    // centre gets few), wind at a star (most from a strained one). Never at an event, never at an agent.
    function spawn(api,i,s,r,out){
      const S=api.sites,n=S.count;
      const pick=(wf)=>{let tot=0;for(let k=0;k<n;k++)tot+=wf(k);if(tot<=0)return -1;let u=r(20)*tot;for(let k=0;k<n;k++){u-=wf(k);if(u<=0)return k;}return n-1;};
      const central=k=>Math.hypot(S.x[k],S.z[k])<CENTRAL;
      if((s===1||s===3)&&n){const k=s===3?pick(k=>(.3+S.w[k])*(central(k)?.4:1)*(1+6*ST.stress[k]+30*ST.shock[k])):pick(k=>central(k)?.12:(.45+S.w[k])*(1+3*(S.state(k).novelty||0))/(1+ST.held[k]/(12+20*S.w[k])));
        if(k>=0){const a=r(21)*TAU,d=S.r[k]*(s===3?.35+.3*r(22):1.15+1.2*r(22))+(s===1?.3+1.2*r(23):0);out[0]=S.x[k]+Math.cos(a)*d;out[1]=S.y[k]+(r(23)-.5)*.1;out[2]=S.z[k]+Math.sin(a)*d;api.ia[i*2]=k;return;}}
      if(CLUSTER){const rr=Math.pow(r(21),.6)*RN*.85,u=r(22)*2-1,a=r(23)*TAU,q=Math.sqrt(1-u*u);out[0]=Math.cos(a)*q*rr;out[1]=u*rr*.6;out[2]=Math.sin(a)*q*rr;return;}
      // around a system (not the centre): the matter a system gathers
      if(n&&r(29)<(s===0?.12:.3)){const k=pick(k=>central(k)?0:.3+S.w[k]);
        if(k>=0){const a=r(21)*TAU,d=S.r[k]+1+3.2*r(22);out[0]=S.x[k]+Math.cos(a)*d;out[1]=S.y[k]+(r(23)-.5)*.2;out[2]=S.z[k]+Math.sin(a)*d;return;}}
      let q;if(ARR==='ring')q=.66+(r(21)+r(22)-1)*.25;else q=.14+.86*Math.pow(r(21),.85);
      let a;if(ARMED&&r(24)<(s===2?.92:.78)){const arm=Math.floor(r(25)*ARMS);a=ARM0+arm/ARMS*TAU+Math.log(Math.max(q,.05))/TANP+(r(26)+r(27)-1)*.3;}else a=r(25)*TAU;
      out[0]=Math.cos(a)*q*RN;out[1]=(r(28)-.5)*.2;out[2]=Math.sin(a)*q*RN;
    }
    // Fragments held by a strained system stay in its halo (steered above) instead of fleeing across the disc, so the
    // failure reads at the system and the recovery visibly brings them back; every other choice is the shared one.
    function decide(api,i){
      if(api.sp[i]!==1)return -1;const k=api.ia[i*2];
      return k>=0&&k<nS&&ST.stress[k]>.08&&api.ia[i*2+1]>0?MODE.explore:-1;
    }
    return {tick:sitesTick,current,steer,spawn,decide};
  }
  function ecosystem(){
    const species=[
      {name:'dust',share:SHARES[0],radius:.9,sepRadius:.3,maxSpeed:.95,minSpeed:.05,maxForce:1.3,mass:1.4,drag:.04,sep:.6,ali:.75,coh:.18,
        seek:0,orbit:0,curiosity:0,trail:1.1,deposit:.05,carryDeposit:0,energyDeposit:0,flow:0,push:.006,avoid:1.7,wander:.1,wanderJitter:.25,
        crowd:40,satiate:0,metabolism:0,restBelow:0,disturbBelow:.55,life:[70,200],fade:4,respawn:[1,5],yMin:-YB,yMax:YB,congestion:.002,congestionAbove:30},
      {name:'fragments',share:SHARES[1],radius:.9,sepRadius:.35,maxSpeed:1.3,minSpeed:.08,maxForce:2,mass:1,drag:.06,sep:1.1,ali:.3,coh:.15,
        seek:.35,orbit:1.1,orbitRadius:1.25,orbitSpeed:.45,orbitJitter:.3,orbitBand:.06,curiosity:.005,trail:.35,deposit:.04,carryDeposit:.07,energyDeposit:.015,
        flow:0,push:.025,avoid:2.2,wander:.16,crowd:26,satiate:.0007,metabolism:.0007,restBelow:0,disturbBelow:.32,life:[45,130],fade:3,respawn:[1,5],yMin:-YB,yMax:YB},
      {name:'motes',share:SHARES[2],radius:1,sepRadius:.26,maxSpeed:1.15,minSpeed:.1,maxForce:2.6,mass:.7,drag:.08,sep:1.5,ali:1.1,coh:.75,
        seek:.3,orbit:.9,orbitRadius:1.7,orbitSpeed:.4,orbitJitter:.25,orbitBand:.1,curiosity:.003,trail:1,deposit:.02,energyDeposit:0,flow:0,push:.02,avoid:3,
        wander:.3,wanderJitter:.4,crowd:18,satiate:.0009,metabolism:.0008,restBelow:0,disturbBelow:.24,life:[80,220],fade:3,respawn:[1,5],yMin:-YB,yMax:YB},
      {name:'wind',share:SHARES[3],radius:.7,sepRadius:.4,maxSpeed:1.4,minSpeed:.2,maxForce:2.2,mass:.6,drag:.25,sep:0,ali:0,coh:0,
        seek:0,orbit:0,curiosity:0,trail:0,deposit:.004,flow:0,push:.11,avoid:0,wander:.12,crowd:99,satiate:0,metabolism:0,restBelow:0,disturbBelow:99,
        life:[4,9],fade:1,respawn:[.2,1.2],yMin:-YB,yMax:YB,perceive:false}];
    // The trail is the disc's memory of its streams (decaying over about 20 s, drifting with the current): the gas reads
    // it, so a stream that matter keeps using glows and migrates with the matter's own drift.
    const relations=[[null,null,null,{avoid:1.4,radius:1.3}],[null,null,null,{avoid:1,radius:1.2}],[null,{chase:.22,radius:1.6},null,{avoid:2.2,radius:1.5}],[]];
    return {capacity,trail:KTRAIL,bounds:{min:[-B,-YB,-B],max:[B,YB,B]},
      field:{nx:NX,nz:NX,decay:{trail:.9975,energy:.993,disturb:.986,flow:.975},diffuse:{trail:.1,energy:.08,disturb:.12,flow:.12},saturate:{trail:4,energy:4,disturb:3,flow:1.2},advect:.9},
      species,relations,hooks:makeHooks(),siteSlots:[0]};
  }
  return {id:'stellar-forge',version:4,ecosystem,habitat,capacity,trail:KTRAIL};
}
// ---- Presentation helper: the matter map (macro scale; reads the ecosystem, never writes it) ------------------------
// An N x N RGBA8 map over the ecosystem's field rectangle, rebuilt from the state at a tick (a pure function of it):
//  r  free dust (not captured by a system), splatted along its recent path and smoothed along the dust's own mean
//     motion (a line-integral convolution), so lanes come out as elongated filaments that follow the flow, never as
//     cells or rings; nothing near a system (its halo never darkens the gas);
//  g  the streams the matter keeps using: ridges of the trail field (the disc's memory of its streams, decaying over
//     about 20 s and drifting with the current), plus the dust streams of the moment; away from the systems.
// The world's gas map reads it (dust lanes thicken a little where the dust streams, the gas glows along the ridges).
export function createMatterMap(N=128){
  const NN=N*N,D=new Float32Array(NN),L=new Float32Array(NN),tmp=new Float32Array(NN),G=new Float32Array(NN),mask=new Float32Array(NN),maskL=new Float32Array(NN);
  const C=32,VX=new Float32Array(C*C),VZ=new Float32Array(C*C),VW=new Float32Array(C*C),ct=new Float32Array(C*C);
  const out=new Uint8Array(NN*4);let TW=null,TT=null,TR=null;
  const b8=x=>x<=0?0:x>=1?255:(x*255+.5)|0;
  // separable binomial blur (1 2 1) on an n x n grid, in place
  function blur3(a,t,n){
    for(let j=0;j<n;j++){const o=j*n;t[o]=(3*a[o]+a[o+1])/4;for(let i=1;i<n-1;i++)t[o+i]=(a[o+i-1]+2*a[o+i]+a[o+i+1])/4;t[o+n-1]=(a[o+n-2]+3*a[o+n-1])/4;}
    for(let i=0;i<n;i++){a[i]=(3*t[i]+t[n+i])/4;for(let j=1;j<n-1;j++){const q=j*n+i;a[q]=(t[q-n]+2*t[q]+t[q+n])/4;}const q=(n-1)*n+i;a[q]=(t[q-n]+3*t[q])/4;}}
  function bil(a,n,x,y){if(x<0)x=0;else if(x>n-1.001)x=n-1.001;if(y<0)y=0;else if(y>n-1.001)y=n-1.001;const i=x|0,j=y|0,u=x-i,v=y-j,o=j*n+i;
    return (a[o]*(1-u)+a[o+1]*u)*(1-v)+(a[o+n]*(1-u)+a[o+n+1]*u)*v;}
  const LIC=[.06,.1,.15,.19,.19,.15,.1,.06],LH=1.1;   // taps along the flow (cells): -3.5 .. 3.5 steps of LH
  function build(eco){
    const F0=eco.field.min[0],G0=eco.field.min[1],W=eco.field.max[0]-F0,H=eco.field.max[1]-G0,sx=N/W,sz=N/H,cx=C/W,cz=C/H,K=eco.K,S=eco.sites,nS=S.count;
    D.fill(0);VX.fill(0);VZ.fill(0);VW.fill(0);
    for(let e=0;e<eco.capacity;e++){if(eco.sp[e]!==0||!eco.alive[e])continue;const cap=Math.max(0,eco.ia[e*2+1])/1000;
      const a=Math.min(1,eco.fade[e])*(cap<.15?1:cap>.45?0:(.45-cap)/.3);if(a<=.01)continue;
      for(let k=0;k<K;k+=2){const q=e*K+k,gx=(eco.tx[q]-F0)*sx-.5,gz=(eco.tz[q]-G0)*sz-.5;if(gx<0||gz<0||gx>=N-1||gz>=N-1)continue;
        const i=gx|0,j=gz|0,u=gx-i,w=gz-j,o=j*N+i;D[o]+=a*(1-u)*(1-w);D[o+1]+=a*u*(1-w);D[o+N]+=a*(1-u)*w;D[o+N+1]+=a*u*w;}
      const ci=Math.floor((eco.px[e]-F0)*cx),cj=Math.floor((eco.pz[e]-G0)*cz);if(ci<0||cj<0||ci>=C||cj>=C)continue;
      const o=cj*C+ci;VX[o]+=eco.vx[e]*a;VZ[o]+=eco.vz[e]*a;VW[o]+=a;}
    blur3(VX,ct,C);blur3(VZ,ct,C);blur3(VW,ct,C);blur3(VX,ct,C);blur3(VZ,ct,C);blur3(VW,ct,C);
    // near the systems: no glow within the halo, and no lanes within the reach where dust curves around a system (a
    // halo never paints a ring or a crescent into the gas)
    mask.fill(1);maskL.fill(1);
    for(let k=0;k<nS;k++){const R=S.r[k],r0=R*1.1,r1=R*1.9+.4,l1=R*2.7+1,ci=(S.x[k]-F0)*sx-.5,cj=(S.z[k]-G0)*sz-.5,rr=l1*sx;
      const i0=Math.max(0,Math.floor(ci-rr)),i1=Math.min(N-1,Math.ceil(ci+rr)),j0=Math.max(0,Math.floor(cj-rr)),j1=Math.min(N-1,Math.ceil(cj+rr));
      for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const d=Math.hypot(i-ci,j-cj)/sx;if(d>=l1)continue;const q=j*N+i;
        let t=d<=r0?0:d>=r1?1:(d-r0)/(r1-r0),m=t*t*(3-2*t);if(m<mask[q])mask[q]=m;
        t=d<=r0?0:(d-r0)/(l1-r0);m=t*t*(3-2*t);if(m<maskL[q])maskL[q]=m;}}
    // r: line-integral convolution of the dust along its mean motion
    const cs=C/N;
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){const q=j*N+i;if(maskL[q]<=0){L[q]=0;continue;}const X=(i+.5)*cs-.5,Y=(j+.5)*cs-.5;const w=bil(VW,C,X,Y);
      if(w<1e-3){L[q]=D[q];continue;}
      let dx=bil(VX,C,X,Y),dz=bil(VZ,C,X,Y);const m=Math.hypot(dx,dz);if(m<1e-4){L[q]=D[q];continue;}dx=dx/m*LH;dz=dz/m*LH;
      let s=0;for(let t=0;t<8;t++){const o=t-3.5;s+=LIC[t]*bil(D,N,i+dx*o,j+dz*o);}L[q]=s;}
    blur3(L,tmp,N);
    // g: ridges of the trail field (64 x 64: the stream memory) above their wider surroundings
    const nx=eco.field.nx,NC=nx*eco.field.nz;if(!TT||TT.length!==NC){TT=new Float32Array(NC);TW=new Float32Array(NC);TR=new Float32Array(NC);}
    TT.set(eco.field.data.subarray(0,NC));TW.set(TT);blur3(TW,TR,nx);blur3(TW,TR,nx);blur3(TW,TR,nx);
    for(let q=0;q<NC;q++)TR[q]=Math.max(0,TT[q]-TW[q]*.8);
    const fs=nx/N;
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){const q=j*N+i,m=mask[q];if(m<=0){out[q*4]=0;out[q*4+1]=0;continue;}
      const tr=bil(TR,nx,(i+.5)*fs-.5,(j+.5)*fs-.5);G[q]=tr;
      out[q*4]=b8((1-Math.exp(-L[q]/1.3))*maskL[q]);out[q*4+1]=b8((tr*.7+(1-Math.exp(-L[q]/3))*.25)*m);}
    return out;
  }
  return {N,build,data:out,debug:{D,L,G,mask,maskL}};
}

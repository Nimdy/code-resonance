// Aurora's digital life (life/sim.js grammar 'aurora'): life on the shore, the snow and under the ice of the frozen lake,
// reacting to the sky and to the work. Pure (no rendering): aurora.js draws it, tests/life-aurora*.test.js check it.
// Ambient life, never progress: it is never labelled, never counted as an agent and never placed from an event.
//
// Frame: the world's own ground plane (aurora-layout.js: world units, about a metre each; the camera stands at the
// water's edge at (0, 6) looking north across the lake toward -z). x and z are the world's; y is the height above the
// ground (the snow of the land or the ice at 0) for the animals, the owl's height above the ice, and for the life under
// the ice its depth below it (negative). The world draws a ground animal on the land as aurora-layout.js landHeight
// gives it (or on the ice).
//
// Populations (species):
//  foxes     arctic foxes. They trot along the shore of the cabin's point and out onto the ice, to the light under it
//            (they are curious about it) or anywhere; they follow the tracks they and the others left in the snow (the
//            trail field, which fades); they pause, sniff, and sit to look up at a bright curtain (a lively one: its
//            subsystem strong, new, nourished or lasting, the energy the work leaves under it), and lie down to rest. Young
//            ones come from the woods at either end of the shore and old ones go back there. Mild interest in hares.
//  hares     snowshoe hares: each keeps to a spruce of its own on the point (by the cabin), hopping a few metres at a time
//            and sitting still between hops; they flee a fox.
//  owl       one snowy owl: perches on the spruces' tops, the cabin's roof ridge or its chimney, and glides low between
//            them.
//  glimmers  faint bioluminescent life under the ice: drifting with a slow current under it, they gather beneath the
//            brightest curtains (each curtain's site lies on the lake along its own bearing from the shore, so from the
//            shore the light under the ice stands below the curtain, in its colour), circle there, feed on the energy the
//            work leaves, and drift on carrying it; they part under a fox's steps.
// Reactions (conditions, never choreography; everything comes from the site conditions the driver's influences set):
//  - a failing run (the curtain turns storm-red; its site strained): the animals shelter toward the woods and the cabin
//    (foxes lie down in the lee of the cabin or under the spruces, hares crouch under theirs, the owl takes the cabin's
//    roof) while any site is strained; the glimmers leave the strained site (its disturbance) and its light dims;
//  - recovery (the corona; the strain cleared): the strained site revives (a site condition that fades over about 25
//    s): the owl takes off and flies a wide circle over the ice before it perches again, the foxes come out and sit to
//    look up, and the glimmers come back to the revived site, its light blooming (the energy the recovery leaves there);
//  - a new curtain (a new subsystem kindles): the foxes look up at it;
//  - an agent's wisp passing low: a fox turns to watch it (presentation only, aurora.js: the ecosystem never reads
//    agents);
//  - the music (ecology 2, life.music): its conditions as everywhere (activity, cohesion, gathering, exploration, the
//    turning attractor over the curtains' sites), each species feeling them its own way.
// Habitat (sites): one per curtain (subsystem) on the near ice under its bearing (spread a little wider than the curtains
// stand, nearer for a nearer curtain, so the light lies in the curtain's reflection and the gatherings stand apart),
// never under the land; the shore (the point's lake edge, the woods at its ends, the spruces, the cabin and its roof) is
// the recipe's, constant for the grammar. A pure function of the model and the time.
import {MODE,CH,HZ} from './sim.js';
import {layoutConfig,prepare,curtainsAt,shoreOf,landHeight,sprucesOf,cabinOf,MID,EASE} from '../aurora-layout.js';
export const FOX=0,HARE=1,OWL=2,GLIMMER=3;
export const SPECIES_NAMES=['fox','hare','owl','glimmer'];
export const COUNTS=[6,6,1];               // foxes, hares, owls (the rest of the capacity is glimmers)
export const CAPACITY=120,TRAIL_K=16;
// The fields' extent (world units) and the ecosystem's bounds.
export const X0=-120,X1=120,Z0=-165,Z1=15,NXF=160,NZF=120;
export const ICE_Y=-2.4;                   // the glimmers' depth under the ice
export const CAM=[0,6];                    // the camera's place on the shore (aurora.js shoreAt, without its breathing)
const ICE=-.35;                            // aurora-layout.js landHeight on the open ice
// A fox's flags (ia[i * 2]): sitting to look up (LOOK; the curtain's site in tgt, which follows the sites when the habitat
// changes), sheltering, old, the kind of its waypoint (fa: x, z). A hare's: its waypoint's kind; its spruce in ia[i * 2 + 1].
export const LOOK=1;
export const SHELTERING=2,OLD=4;
const WP_SHORE=8,WP_ICE=16,WP_SITE=32,WP_DEN=64,WP_SHELTER=128;
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),hyp=(a,b)=>Math.sqrt(a*a+b*b),r3=x=>Math.round(x*1000)/1000;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// A site's revival after a recovery: about 25 s (a site condition: snapshots carry it).
const REVIVE=Math.exp(-1/(25*HZ));
// Strain (the strongest site's stress) above which the animals shelter, and below which they come out again.
export const SHELTER_ON=.1,SHELTER_OFF=.07;
export function createAuroraGrammar(recipe,{capacity=CAPACITY}={}){
  const cfg=layoutConfig(recipe),G=recipe?.genome||{},seed=cfg.seed,S=shoreOf(seed);
  const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  // ---- The shore (constant for the recipe) --------------------------------------------------------------------------
  const ground=(x,z)=>landHeight(S,x,z);
  // the lake's edge of the point at spine t: from the spine outward on the lake's side until the land meets the ice
  const lakeSide=t=>{const p=S.spine(t),q=S.spine(Math.min(1,t+.02)),p0=S.spine(Math.max(0,t-.02)),tx=q[0]-p0[0],tz=q[1]-p0[1],L=hyp(tx,tz)||1;let nx=-tz/L,nz=tx/L;if(nx*S.side>0){nx=-nx;nz=-nz;}return [p,nx,nz];};
  function edgeAt(t,inside=1.5){const [p,nx,nz]=lakeSide(t);let d=0;for(;d<40&&ground(p[0]+nx*d,p[1]+nz*d)>0;d+=.5);d=Math.max(0,d-inside);return [p[0]+nx*d,p[1]+nz*d];}
  // the shore path: along the point's lake edge, from near the bank to the point's tip, and round the tip
  const SHORE=[];for(let k=0;k<9;k++)SHORE.push(edgeAt(.3+.68*k/8));
  {const tip=S.spine(1),pre=S.spine(.96),dx=tip[0]-pre[0],dz=tip[1]-pre[1],L=hyp(dx,dz)||1;SHORE.push([tip[0]+dx/L*2,tip[1]+dz/L*2]);}
  // the part of the shore the camera sees (a landscape frame's fan from the shore)
  const SEEN=SHORE.map((p,k)=>Math.abs(p[0]/(CAM[1]-p[1]))<.8?k:-1).filter(k=>k>=0);
  // the woods at either end of the shore (out of the frame): where foxes come from and go back to
  const DENS=[[S.spine(.08)[0],S.spine(.08)[1]],[-S.side*128,-22]];
  const cabin=cabinOf(S),cf=[Math.sin(cabin.yaw),Math.cos(cabin.yaw)],cr=[Math.cos(cabin.yaw),-Math.sin(cabin.yaw)];
  const atCabin=(x,z)=>[S.cabin[0]+cr[0]*x+cf[0]*z,S.cabin[1]+cr[1]*x+cf[1]*z];
  // the spruces on the point (the ones near the bank's far end are out of the frame): homes for the hares, perches
  const TREES=sprucesOf(S,seed,num(G.land?.trees,1)).filter(t=>Math.abs(t[0])<140&&t[2]<-40);
  // shelter: the cabin's lee (its back and sides, away from the lake) and the foot of the spruces on their landward side
  const SHELTER=[atCabin(-5.2,-1),atCabin(5.2,-1.5),atCabin(0,-5.4),atCabin(-3.5,-5)];
  {const [,nx,nz]=lakeSide(.7);for(const t of TREES.slice(0,6))SHELTER.push([t[0]-nx*2.2,t[2]-nz*2.2]);}
  // perches: the spruces' tops, the cabin's roof ridge (its front end, toward the shore) and its chimney
  const PERCH=TREES.map(t=>[t[0],t[1]+t[3]*.96,t[2]]);const ROOF=PERCH.length;
  {const r=atCabin(0,2.4),c=atCabin(1.62,-.84);PERCH.push([r[0],cabin.y+5.35,r[1]],[c[0],cabin.y+6.55,c[1]]);}
  // the lake: where the land lies (a grid at 4 units; the life under the ice keeps away from it, the hares on it). The
  // open ice is at ICE (landHeight's floor: the land rises from it toward the shore).
  const MX=80,MZ=60,mw=(X1-X0)/MX,mh=(Z1-Z0)/MZ,mask=new Float32Array(MX*MZ);
  for(let j=0;j<MZ;j++)for(let i=0;i<MX;i++)mask[j*MX+i]=ground(X0+(i+.5)*mw,Z0+(j+.5)*mh);
  function landAt(x,z){let u=(x-X0)/mw-.5,v=(z-Z0)/mh-.5;u=clamp(u,0,MX-1.001);v=clamp(v,0,MZ-1.001);const i=u|0,j=v|0,a=u-i,b=v-j,o=j*MX+i;
    return (mask[o]*(1-a)+mask[o+1]*a)*(1-b)+(mask[o+MX]*(1-a)+mask[o+MX+1]*a)*b;}
  // the direction toward higher land at (x, z) (unit, or zero)
  const lg=[0,0];function landGrad(x,z){const e=2.5,gx=landAt(x+e,z)-landAt(x-e,z),gz=landAt(x,z+e)-landAt(x,z-e),l=hyp(gx,gz);if(l<1e-6){lg[0]=lg[1]=0;}else{lg[0]=gx/l;lg[1]=gz/l;}return lg;}
  // ---- Habitat: a site per curtain, on the lake under its bearing ------------------------------------------------------
  function habitat(model,t){
    const out=[];
    for(const c of curtainsAt(prepare(model),t+EASE,cfg)){if(!c.files.length)continue;
      const g=clamp(Math.log(c.R/(MID*Math.sqrt(cfg.spread)))/.62,-1,1),D=27+12*g;let a=clamp(c.az*1.5,-.75,.75);
      for(let n=0;n<14&&ground(D*Math.sin(a),CAM[1]-D*Math.cos(a))>ICE+.02;n++)a*=.88;
      const nf=c.files.length,elev=Math.atan2(c.alt,c.R),ext=.45+.55*smooth((elev-.07)/.2),size=clamp(Math.log2(1+nf)/5);
      out.push({id:c.id,x:r3(D*Math.sin(a)),y:ICE_Y,z:r3(CAM[1]-D*Math.cos(a)),r:r3(3.6+2*size),w:r3((.62+.5*size)*ext*(.25+.75*c.kindle)),kind:1});}
    return out;
  }
  // ---- The musical climate (ecology 1): slow phrasing, never a jump ---------------------------------------------------
  const CLIMATE={
    home:{current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0},
    away:{current:1.2,turb:1.1,cohesion:.9,activity:1.05,attract:.9,swing:.8},
    tension:{current:1.1,turb:1.6,cohesion:.65,activity:1.15,attract:.75,swing:.4},
    resolve:{current:.9,turb:.8,cohesion:1.35,activity:.95,attract:1.2,swing:-.4},
    lift:{current:1.15,turb:1,cohesion:1.2,activity:1.2,attract:1.3,swing:.25},
    breath:{current:.7,turb:.6,cohesion:1.25,activity:.75,attract:1,swing:0}};
  function ecosystem(){
    const share=n=>(n+.5)/capacity;
    // Ecology 2 (respond): foxes answer exploration and activity (they roam farther and trot livelier), hares and the
    // owl hardly the music; the glimmers gathering, exploration, cohesion and the current most.
    const SPECIES=[
      {name:'fox',share:share(COUNTS[0]),radius:6,sepRadius:2.2,maxSpeed:2.7,minSpeed:0,maxForce:3.4,mass:1,drag:.4,sep:2,ali:.15,coh:.04,
        seek:0,orbit:0,curiosity:0,trail:0,deposit:.05,carryDeposit:0,energyDeposit:0,flow:0,push:0,avoid:1.6,wander:.22,wanderJitter:.4,
        crowd:99,satiate:0,metabolism:.00022,restBelow:-1,restRecover:.0016,disturbBelow:.6,life:[260,620],fade:3,respawn:[6,20],
        yMin:0,yMax:.3,yHold:3,routes:1,respond:{activity:1,explore:1.2,turb:.6,cohesion:.5,gather:.6,current:0}},
      {name:'hare',share:share(COUNTS[1]),radius:5,sepRadius:1.2,maxSpeed:3.6,minSpeed:0,maxForce:6,mass:.6,drag:.8,sep:1.6,ali:0,coh:0,
        seek:0,orbit:0,curiosity:0,trail:0,deposit:.022,carryDeposit:0,energyDeposit:0,flow:0,push:0,avoid:1,wander:.15,wanderJitter:.4,
        crowd:99,satiate:0,metabolism:0,restBelow:-1,disturbBelow:.8,life:[180,440],fade:2.5,respawn:[8,24],
        yMin:0,yMax:.3,yHold:3,routes:1,respond:{activity:.7,explore:.6,turb:.5,cohesion:0,gather:0,current:0}},
      {name:'owl',share:share(COUNTS[2]),radius:6,sepRadius:1,maxSpeed:9,minSpeed:0,maxForce:7,mass:.8,drag:.12,sep:0,ali:0,coh:0,
        seek:0,orbit:0,curiosity:0,trail:0,deposit:0,carryDeposit:0,energyDeposit:0,flow:0,push:0,avoid:0,wander:.06,wanderJitter:.3,
        crowd:99,satiate:0,metabolism:0,restBelow:-1,disturbBelow:9,life:[500,1100],fade:3,respawn:[20,40],
        yMin:.4,yMax:32,yHold:0,routes:1,perceive:false,respond:{activity:.6,explore:.8,turb:.4,cohesion:0,gather:0,current:0}},
      {name:'glimmer',share:1,radius:3.2,sepRadius:.9,maxSpeed:1.3,minSpeed:.06,maxForce:1.9,mass:1,drag:.2,sep:1.2,ali:.2,coh:.15,
        seek:1.2,orbit:1.3,orbitRadius:.95,orbitSpeed:.22,orbitJitter:.38,orbitBand:.04,curiosity:0,
        trail:0,deposit:0,carryDeposit:0,energyDeposit:.004,flow:.35,push:.004,avoid:2.2,wander:.3,wanderJitter:.35,
        crowd:22,satiate:.0008,metabolism:.0005,restBelow:-1,disturbBelow:.3,life:[90,260],fade:4,respawn:[2,8],
        yMin:ICE_Y-.8,yMax:ICE_Y+.8,yHold:.6,respond:{gather:1.3,explore:1.1,cohesion:1.2,activity:1,turb:1,current:1}}];
    // Between species (rel[a][b]: how a answers b): a fox takes a mild interest in a hare, a hare flees a fox, the
    // glimmers part under a fox's steps.
    const RELATIONS=[[null,{chase:.2,radius:6},null,null],[{avoid:3,radius:5},null,null,null],null,[{avoid:1.2,radius:4},null,null,null]];
    // the foxes' slots (the simulation gives each species its quota of slots in order, the foxes first)
    const FOXES=[0,Math.floor(capacity*SPECIES[FOX].share)];
    // ---- Per tick (before anything moves): the sites' liveliness, strain and revival ----------------------------------
    // Revival and strain are site conditions (st.revive, st.strained: snapshots carry them); the rest is derived from
    // the state each tick, so a restored past never reads a stale value.
    const FL=[0,0,0],LIVE=new Float64Array(64),STR=new Float32Array(64),REV=new Float32Array(64),W=new Float64Array(64);
    let STRAIN=0,REVIVED=0,LMAX=0,NOV=0,NOVK=-1,E2=false,EXP=1,GA=1,ACT=1;
    function perTick(api){
      const S2=api.sites,n=S2.count;STRAIN=0;REVIVED=0;LMAX=0;NOV=0;NOVK=-1;
      if((E2=api.ecology===2)){EXP=api.felt(FOX,'explore');GA=api.felt(GLIMMER,'gather');ACT=api.felt(FOX,'activity');}else{EXP=1;GA=1;ACT=api.cond.activity;}
      for(let k=0;k<n;k++){const st=S2.state(k);LIVE[k]=0;STR[k]=0;REV[k]=0;if(!st)continue;
        if(st.revive===undefined){st.revive=0;st.strained=0;}
        if(st.stress>SHELTER_ON)st.strained=1;else if(st.strained&&st.stress<.03){st.strained=0;st.revive=1;}
        st.revive*=REVIVE;STR[k]=st.stress;REV[k]=st.revive;STRAIN=Math.max(STRAIN,st.stress);REVIVED=Math.max(REVIVED,st.revive);
        if(st.novelty>NOV){NOV=st.novelty;NOVK=k;}
        const e=api.sample(CH.energy,S2.x[k],S2.z[k]);
        const l=S2.w[k]*(1+1.6*st.novelty+.9*st.nourish+.5*Math.min(2,st.lasting)+2.5*st.revive)*(.6+.5*Math.min(1.5,e))*(1-.9*clamp(st.stress*4))*(E2?api.shiftOf(k):1);
        LIVE[k]=Math.max(0,l);LMAX=Math.max(LMAX,LIVE[k]);}
    }
    // A weighted draw over the sites (the entity's own random stream): the liveliest, not crowded (for glimmers), nearer
    // is better; never a strained one.
    function chooseSite(api,i,crowd,reach,n0,pw=1.5){
      const S2=api.sites,n=S2.count,x=api.px[i],z=api.pz[i];let total=0;
      for(let k=0;k<n;k++){if(STR[k]>.08){W[k]=0;continue;}let a=Math.pow(LIVE[k],pw)/(1+hyp(S2.x[k]-x,S2.z[k]-z)/reach);
        if(crowd>0)a/=1+Math.pow(S2.visits[k]/crowd,3);if(k===api.tgt[i])a*=.3;W[k]=a;total+=a;}
      if(total<=0)return -1;let u=api.random(i,n0)*total;for(let k=0;k<n;k++){u-=W[k];if(u<=0)return k;}return n-1;
    }
    // A look up: the liveliest sites draw the eyes (a new curtain most), a weighted draw.
    function lookSite(api,i){if(NOV>.5&&NOVK>=0&&api.random(i,31)<.7)return NOVK;return chooseSite(api,i,0,1e6,32);}
    const sitAndLook=(api,i,q)=>{api.tgt[i]=q;api.ia[i*2]|=LOOK;return MODE.settle;};
    // ---- Waypoints (a fox's fa: x, z; its kind in its flags) ------------------------------------------------------------
    const setWP=(api,i,x,z,kind)=>{api.fa[i*2]=x;api.fa[i*2+1]=z;api.ia[i*2]=(api.ia[i*2]&(SHELTERING|OLD))|kind;};
    const wpKind=(api,i)=>api.ia[i*2]&(WP_SHORE|WP_ICE|WP_SITE|WP_DEN|WP_SHELTER);
    const nearestShore=(x,z)=>{let b=0,bd=Infinity;for(let k=0;k<SHORE.length;k++){const d=hyp(SHORE[k][0]-x,SHORE[k][1]-z);if(d<bd){bd=d;b=k;}}return b;};
    function iceSpot(api,i,n0,reachK=1){
      // a place on the open ice in front of the shore (not on the land; within the view's fan)
      for(let q=0;q<6;q++){const d=14+40*Math.pow(api.random(i,n0+q*3),1.8)*reachK,a=(api.random(i,n0+q*3+2)-.5)*1.25;
        const x=d*Math.sin(a),z=CAM[1]-d*Math.cos(a);if(landAt(x,z)<ICE+.01&&z>Z0+12)return [x,z];}
      return [0,-24];}
    // (the same from a spawn's own random stream)
    function iceSpotR(r,n0){for(let q=0;q<4;q++){const d=16+38*r(n0+q*2)**1.6,a=(r(n0+q*2+1)-.5)*1.2,x=d*Math.sin(a),z=CAM[1]-d*Math.cos(a);if(landAt(x,z)<ICE+.01)return [x,z];}return [0,-24];}
    function nextFox(api,i){
      const x=api.px[i],z=api.pz[i],P=api.params,r=api.random(i,40),reachK=clamp((E2?EXP:1)*P.vitality,.5,1.6);
      // to the light under the ice beneath a lively curtain (curious), along the shore, or anywhere on the ice
      if(r<.45){const k=chooseSite(api,i,0,60*reachK,41);if(k>=0){const S2=api.sites,a=api.random(i,42)*TAU,d=S2.r[k]*(.4+.8*api.random(i,43));setWP(api,i,S2.x[k]+Math.cos(a)*d,S2.z[k]+Math.sin(a)*d,WP_SITE);return;}}
      // along the shore the camera sees (a step or two from the nearest of its points, or onto it from the ice)
      if(r<.63&&SEEN.length){const k=nearestShore(x,z),on=SEEN.indexOf(k);let j;
        if(on<0)j=SEEN[Math.floor(api.random(i,44)*SEEN.length)%SEEN.length];else j=SEEN[clamp(on+(api.random(i,45)<.5?-1:1)*(1+Math.floor(api.random(i,46)*2)),0,SEEN.length-1)];
        setWP(api,i,SHORE[j][0],SHORE[j][1],WP_SHORE);return;}
      const p=iceSpot(api,i,47,reachK*(r>.95?2:1));setWP(api,i,p[0],p[1],WP_ICE);
    }
    function nextHare(api,i){
      // a few metres from its spruce, on the land
      const T=TREES[api.ia[i*2+1]]||TREES[0];if(!T){setWP(api,i,api.px[i],api.pz[i],WP_SHORE);return;}
      for(let q=0;q<5;q++){const a=api.random(i,50+q)*TAU,d=1.5+9*api.random(i,56+q),x=T[0]+Math.cos(a)*d,z=T[2]+Math.sin(a)*d;
        if(landAt(x,z)>.3&&hyp(x-S.cabin[0],z-S.cabin[1])>5){setWP(api,i,x,z,WP_SHORE);return;}}
      setWP(api,i,T[0],T[2]+1.5,WP_SHORE);
    }
    // ---- The under-ice current: a slow gyre about the lake's middle, turned by the music's swing -------------------------
    // (the simulation asks for it at the fields' cell centres: their static part is tabulated per cell, per tick only the
    // phases change)
    const cw=(X1-X0)/NXF,chh=(Z1-Z0)/NZF,GY=new Float64Array(NXF*NZF*4);
    for(let j=0;j<NZF;j++)for(let i=0;i<NXF;i++){const x=X0+(i+.5)*cw,dz=Z0+(j+.5)*chh+42,d=hyp(x,dz)+12,o=(j*NXF+i)*4;GY[o]=-dz/d;GY[o+1]=x/d;GY[o+2]=Math.sin(d*.07);GY[o+3]=Math.cos(d*.07);}
    let cT=NaN,cs=1,sn=0,st=0,ct=1;
    function current(x,y,z,t,c,out){
      if(t!==cT){cT=t;const a=.35*c.swing+.25*Math.sin(t/97);cs=Math.cos(a);sn=Math.sin(a);st=Math.sin(t*.01);ct=Math.cos(t*.01);}
      const i=Math.round((x-X0)/cw-.5),j=Math.round((z-Z0)/chh-.5);if(i<0||j<0||i>=NXF||j>=NZF){out[0]=out[1]=out[2]=0;return;}
      const o=(j*NXF+i)*4,v=.09*(.6+.4*(GY[o+2]*ct+GY[o+3]*st)),ux=GY[o]*v,uz=GY[o+1]*v;out[0]=ux*cs-uz*sn;out[1]=0;out[2]=ux*sn+uz*cs;
    }
    const hooks={current,tick:perTick,
      spawn(api,i,k,r,out){
        const S2=api.sites,n=S2.count;out[1]=0;
        if(k===FOX){api.ia[i*2+1]=-1;
          // the first of a slot (a new ecosystem's population) somewhere on the ice in front of the shore; the later ones
          // come out of the woods at either end of the shore (out of the frame) and trot in
          if(api.gen[i]<=1){const d=16+40*r(21)**1.5,a=(r(22)-.5)*1.2;out[0]=d*Math.sin(a);out[2]=CAM[1]-d*Math.cos(a);if(landAt(out[0],out[2])>ICE+.01){out[0]*=.5;}
            const s=iceSpotR(r,24);api.fa[i*2]=s[0];api.fa[i*2+1]=s[1];api.ia[i*2]=WP_ICE;}
          else{const d=DENS[Math.floor(r(20)*2)%2];out[0]=d[0]+(r(21)-.5)*8;out[2]=d[1]+(r(22)-.5)*8;
            const s=SEEN.length?SHORE[SEEN[Math.floor(r(23)*SEEN.length)%SEEN.length]]:iceSpotR(r,24);api.fa[i*2]=s[0];api.fa[i*2+1]=s[1];api.ia[i*2]=SEEN.length?WP_SHORE:WP_ICE;}}
        else if(k===HARE){const h=TREES.length?Math.floor(r(20)*TREES.length)%TREES.length:-1,T=TREES[h];api.ia[i*2]=WP_SHORE;api.ia[i*2+1]=Math.max(0,h);
          if(T){const a=r(21)*TAU;out[0]=T[0]+Math.cos(a)*1.6;out[2]=T[2]+Math.sin(a)*1.6;}else{out[0]=S.cabin[0];out[2]=S.cabin[1]+4;}api.fa[i*2]=out[0];api.fa[i*2+1]=out[2];}
        else if(k===OWL){const p=PERCH[Math.floor(r(20)*Math.max(1,ROOF))%PERCH.length];out[0]=p[0];out[1]=p[1];out[2]=p[2];api.ia[i*2]=PERCH.indexOf(p);api.ia[i*2+1]=0;api.fa[i*2]=0;api.fa[i*2+1]=0;}
        else{
          // glimmers near a site (under its curtain), the rest anywhere under the open ice
          let x=0,z=-60;
          for(let q=0;q<6;q++){if(n&&r(20+q)<.7){const s=Math.floor(r(30+q)*n)%n,a=r(40+q)*TAU,d=S2.r[s]*(.3+1.8*r(50+q));x=S2.x[s]+Math.cos(a)*d;z=S2.z[s]+Math.sin(a)*d;}
            else{const d=12+40*r(60+q),a=(r(70+q)-.5)*1.5;x=d*Math.sin(a);z=CAM[1]-d*Math.cos(a);}
            if(landAt(x,z)<ICE+.005&&z>Z0+6&&Math.abs(x)<X1-8)break;}
          out[0]=x;out[2]=z;out[1]=ICE_Y+(r(80)-.5)*1.2;}
      },
      steer(api,i,f,dist){
        const k=api.sp[i],x=api.px[i],y=api.py[i],z=api.pz[i],m=api.mode[i],vx=api.vx[i],vz=api.vz[i];
        if(k===GLIMMER){
          // under the open ice only: away from the land, inside the lake's part of the frame
          const h=landAt(x,z);if(h>ICE+.005){const g=landGrad(x,z),c=3+6*clamp(h-ICE,0,2);f[0]-=g[0]*c;f[2]-=g[1]*c;}
          if(z<-62)f[2]+=(-62-z)*.5;if(z>-5)f[2]-=(z+5)*.8;if(x<-48)f[0]+=(-48-x)*.5;else if(x>48)f[0]-=(x-48)*.5;
          // seekers swim against the current (the light gathers under its curtain, not where the current took it)
          if(m===MODE.seek){const fl=api.flowAt(x,y,z,FL),c0=.3*api.params.environment;f[0]-=fl[0]*c0;f[2]-=fl[2]*c0;}
          // a revived site draws the drifters near it back (the light under the curtain blooms again)
          if(m===MODE.explore&&REVIVED>.05){const S2=api.sites;for(let q=0;q<S2.count;q++){if(REV[q]<.05)continue;const ex=S2.x[q]-x,ez=S2.z[q]-z,d=hyp(ex,ez);if(d<36&&d>S2.r[q]){const c=.9*REV[q]*(1-d/36)/d;f[0]+=ex*c;f[2]+=ez*c;}}}
          return;}
        if(k===OWL){steerOwl(api,i,f);return;}
        // ground animals: to the waypoint at a trot (a fox) or a hop (a hare), stopping when they sit or lie down
        if(m===MODE.route){const tx=api.fa[i*2],tz=api.fa[i*2+1],ex=tx-x,ez=tz-z,d=hyp(ex,ez)||1;
          const want=(k===FOX?(wpKind(api,i)===WP_SHELTER||STRAIN>SHELTER_ON?2.4:1.55+.35*clamp(ACT)):2.6)*Math.min(1,d/2.5+.25);
          const c=k===FOX?1.4:2.4;f[0]+=(ex/d*want-vx)*c;f[2]+=(ez/d*want-vz)*c;
          // foxes follow the tracks in the snow a little (theirs and the others'): toward the middle of a track nearby
          if(k===FOX&&((i+api.tick)&1)===0){const g=api.gradient(CH.trail,x,z),gl=hyp(g[0],g[1]);if(gl>1e-4){const c2=Math.min(.6,gl*.8)/gl*api.params.trails*(E2?Math.pow(GA,.3):1);f[0]+=g[0]*c2;f[2]+=g[1]*c2;}}}
        else if(m===MODE.settle||m===MODE.rest){f[0]-=vx*2;f[2]-=vz*2;
          // a fox sitting to look up turns to face the curtain (its heading: the velocity, which stays tiny)
          if(k===FOX&&(api.ia[i*2]&LOOK)){const q=api.tgt[i],S2=api.sites;if(q>=0&&q<S2.count){const ex=S2.x[q]-x,ez=S2.z[q]-z,d=hyp(ex,ez)||1;f[0]+=ex/d*.03;f[2]+=ez/d*.03;}}}
        // never into the cabin, never up to the camera, within the shore's part of the frame
        {const ex=x-S.cabin[0],ez=z-S.cabin[1],d=hyp(ex,ez);if(d<5.5&&d>1e-3){const c=(5.5-d)*3/d;f[0]+=ex*c;f[2]+=ez*c;}}
        if(k===FOX&&z>-8&&!(api.ia[i*2]&(WP_DEN|OLD)))f[2]-=(z+8)*1.2;
        if(x<X0+12)f[0]+=(X0+12-x)*.8;else if(x>X1-12)f[0]-=(x-X1+12)*.8;if(z<Z0+14)f[2]+=(Z0+14-z)*.8;
        // hares keep to the land
        if(k===HARE){const h=landAt(x,z);if(h<.4){const g=landGrad(x,z);f[0]+=g[0]*2.5;f[2]+=g[1]*2.5;}}
        void y;void dist;
      },
      decide(api,i,nb,dist){
        const k=api.sp[i];
        if(k===GLIMMER)return decideGlimmer(api,i,dist);
        if(k===OWL)return decideOwl(api,i);
        if(k===HARE)return decideHare(api,i,dist);
        return decideFox(api,i,dist);
      }};
    function decideGlimmer(api,i,dist){
      const m=api.mode[i],s=SPECIES[GLIMMER],P=api.params;
      if(m===MODE.explore){if(api.modeT[i]<HZ||dist>=s.disturbBelow)return -1;
        // a revived site nearby: they come back to it, a few at a time
        if(REVIVED>.2&&api.random(i,1)<.02){const S2=api.sites;let best=-1,bd=40;for(let q=0;q<S2.count;q++){if(REV[q]<.2)continue;const d=hyp(S2.x[q]-api.px[i],S2.z[q]-api.pz[i]);if(d<bd){bd=d;best=q;}}
          if(best>=0){api.tgt[i]=best;return MODE.seek;}}
        if(api.random(i,2)<.012*P.vitality*(E2?api.felt(GLIMMER,'activity')*Math.pow(api.felt(GLIMMER,'explore'),.8):api.cond.activity)){
          const q=chooseSite(api,i,s.crowd*(E2?GA:1)*P.collective,24*(E2?Math.sqrt(api.felt(GLIMMER,'explore')):1),3,2.4);if(q>=0){api.tgt[i]=q;return MODE.seek;}}
        return -1;}
      if(m===MODE.seek){const q=api.tgt[i];if(q<0)return -1;if(STR[q]>.08)return MODE.explore;
        // (near its site it joins the gathering: a crowd waiting at the edge would never reach it)
        if(hyp(api.sites.x[q]-api.px[i],api.sites.z[q]-api.pz[i])<api.sites.r[q]*2.1)return MODE.orbit;return -1;}
      if(m===MODE.orbit){const q=api.tgt[i];if(q<0)return -1;if(STR[q]>.06||dist>s.disturbBelow*1.3)return MODE.disperse;
        // (ecology 2: a site the turning attractor has left behind loses its visitors to the ones it favours)
        if(E2&&api.modeT[i]>4*HZ){const sh=api.shiftOf(q);if(sh<.85&&api.random(i,16)<.012*(.85-sh)*api.felt(GLIMMER,'explore'))return MODE.explore;}
        return -1;}
      return -1;
    }
    // ---- Foxes ------------------------------------------------------------------------------------------------------
    function decideFox(api,i,dist){
      const m=api.mode[i],fl=api.ia[i*2],T=api.modeT[i],x=api.px[i],z=api.pz[i],P=api.params;
      const old=api.age[i]>api.life[i]*.86;
      // old: back to the woods it came from, where its life ends
      if(old&&!(fl&OLD)){api.ia[i*2]=(fl&~SHELTERING)|OLD;const d=DENS[hyp(DENS[0][0]-x,DENS[0][1]-z)<hyp(DENS[1][0]-x,DENS[1][1]-z)?0:1];setWP(api,i,d[0],d[1],WP_DEN);api.ia[i*2]&=~LOOK;return MODE.route;}
      if(fl&OLD){if(m===MODE.route&&hyp(api.fa[i*2]-x,api.fa[i*2+1]-z)<3)return MODE.rest;return m===MODE.rest?MODE.rest:MODE.route;}
      // a failing run: to shelter (the cabin's lee, the foot of the spruces), and lie down there while it lasts
      if(STRAIN>SHELTER_ON&&!(fl&SHELTERING)){let b=0,bd=Infinity;for(let q=0;q<SHELTER.length;q++){const d=hyp(SHELTER[q][0]-x,SHELTER[q][1]-z)+12*api.random(i,60+q);if(d<bd){bd=d;b=q;}}
        api.ia[i*2]=(fl&~LOOK)|SHELTERING;setWP(api,i,SHELTER[b][0]+(api.random(i,70)-.5)*3,SHELTER[b][1]+(api.random(i,71)-.5)*3,WP_SHELTER);return MODE.route;}
      if(fl&SHELTERING){
        if(STRAIN<SHELTER_OFF){
          // it has cleared: out of shelter, and up at the sky
          api.ia[i*2]=fl&~SHELTERING;const q=lookSite(api,i);if(q>=0)return sitAndLook(api,i,q);nextFox(api,i);return MODE.route;}
        if(m===MODE.route&&hyp(api.fa[i*2]-x,api.fa[i*2+1]-z)<2.2)return MODE.rest;
        return m===MODE.rest?MODE.rest:MODE.route;}
      // disturbed ground (a strained site's reach out on the ice): away from it
      if(dist>.6&&m!==MODE.disperse){api.ia[i*2]&=~LOOK;return MODE.disperse;}
      if(m===MODE.disperse){if(T>4*HZ){nextFox(api,i);return MODE.route;}return MODE.disperse;}
      const look=()=>{const q=lookSite(api,i);return q<0?-1:sitAndLook(api,i,q);};
      if(m===MODE.route){
        // a new curtain kindling, or now and then a bright one: it stops and sits to look up
        const lively=clamp(LMAX),chance=(.0008+.0025*lively+.06*clamp((NOV-.9)*10))*P.vitality*(REVIVED>.3?3:1);
        if(T>2*HZ&&api.random(i,1)<chance){const r=look();if(r>=0)return r;}
        if(hyp(api.fa[i*2]-x,api.fa[i*2+1]-z)<2.5||T>70*HZ){
          // arrived: a look up, a sniff, a rest, or on
          const u=api.random(i,2);if(u<.22){const r=look();if(r>=0)return r;}
          if(u<.55){api.ia[i*2]&=~LOOK;return MODE.settle;}
          if(u<.62&&api.en[i]<.7){api.ia[i*2]&=~LOOK;return MODE.rest;}
          nextFox(api,i);return MODE.route;}
        return MODE.route;}
      if(m===MODE.settle){
        // a pause: sitting to look up lasts longer than a sniff
        const min=(fl&LOOK?4:2)*HZ;if(T>min&&api.random(i,3)<(fl&LOOK?.012:.03)){api.ia[i*2]&=~LOOK;nextFox(api,i);return MODE.route;}
        return MODE.settle;}
      if(m===MODE.rest){if(T>8*HZ&&(api.en[i]>.9||api.random(i,4)<.004)){nextFox(api,i);return MODE.route;}return MODE.rest;}
      nextFox(api,i);return MODE.route;
    }
    // ---- Hares ------------------------------------------------------------------------------------------------------
    function decideHare(api,i,dist){
      const m=api.mode[i],T=api.modeT[i],x=api.px[i],z=api.pz[i];
      // a fox close: away from it in long hops
      for(let f=FOXES[0];f<FOXES[1];f++){if(!api.alive[f])continue;const ex=x-api.px[f],ez=z-api.pz[f],d=hyp(ex,ez);
        if(d<9&&d>1e-3&&(m!==MODE.route||T>HZ)){const H=TREES[api.ia[i*2+1]],hx=H?H[0]:x,hz=H?H[2]:z;
          // (toward its spruce if that is away from the fox, else straight away)
          const awayH=((hx-x)*ex+(hz-z)*ez)>0;setWP(api,i,awayH?hx:x+ex/d*10,awayH?hz:z+ez/d*10,WP_SHORE);return MODE.route;}}
      // a failing run: under its spruce, crouched, while it lasts
      if(STRAIN>SHELTER_ON){const H=TREES[api.ia[i*2+1]];if(H){const d=hyp(H[0]-x,H[2]-z);if(d>1.6){if(m!==MODE.route||wpKind(api,i)!==WP_SHELTER)setWP(api,i,H[0]+.9,H[2]+.9,WP_SHELTER);return MODE.route;}}return MODE.rest;}
      if(m===MODE.route){if(hyp(api.fa[i*2]-x,api.fa[i*2+1]-z)<1||T>12*HZ)return MODE.settle;return MODE.route;}
      // sitting: now and then a few hops, seldom to another spruce near the cabin
      if((m===MODE.settle||m===MODE.rest)&&T>2*HZ&&api.random(i,5)<.012*api.params.vitality*(E2?api.felt(HARE,'activity'):1)){
        if(api.random(i,6)<.06&&TREES.length>1){let b=api.ia[i*2+1],bd=Infinity;for(let q=0;q<TREES.length;q++){if(q===api.ia[i*2+1])continue;const d=hyp(TREES[q][0]-S.cabin[0],TREES[q][2]-S.cabin[1])+30*api.random(i,80+q%8);if(d<bd){bd=d;b=q;}}api.ia[i*2+1]=b;}
        nextHare(api,i);return MODE.route;}
      return m===MODE.route?MODE.route:MODE.settle;
    }
    // ---- The owl ------------------------------------------------------------------------------------------------------
    // ia[i*2]: the perch it sits on or flies to (while it circles: the tick its circle began); ia[i*2+1]: 0 perched or
    // gliding between perches, 1 sheltering on the roof, 2 flying its circle over the ice after a recovery (its centre in fa).
    function decideOwl(api,i){
      const m=api.mode[i],T=api.modeT[i],st=api.ia[i*2+1],p=st===2?null:PERCH[api.ia[i*2]]||PERCH[0];
      const at=!!p&&hyp(p[0]-api.px[i],p[2]-api.pz[i])<1.4&&Math.abs(p[1]-api.py[i])<1.2;
      // a recovery: off the roof (or wherever it sits) for a wide circle over the ice
      if(REVIVED>.9&&st!==2){api.ia[i*2+1]=2;api.ia[i*2]=api.tick;api.fa[i*2]=(api.random(i,20)-.5)*24;api.fa[i*2+1]=-26-12*api.random(i,21);return MODE.route;}
      if(st===2){if(api.tick-api.ia[i*2]>24*HZ){api.ia[i*2+1]=0;api.ia[i*2]=Math.floor(api.random(i,22)*Math.max(1,ROOF))%PERCH.length;}return MODE.route;}
      // a failing run: to the cabin's roof, and stay there while it lasts
      if(STRAIN>SHELTER_ON&&st!==1){api.ia[i*2+1]=1;api.ia[i*2]=ROOF;return MODE.route;}
      if(st===1&&STRAIN<SHELTER_OFF)api.ia[i*2+1]=0;
      if(m===MODE.route){return at?MODE.settle:MODE.route;}
      // perched: now and then (less while it shelters) to another perch
      if(st!==1&&T>20*HZ&&api.random(i,23)<.0025*api.params.vitality*(E2?api.felt(OWL,'explore'):1)){let q=Math.floor(api.random(i,24)*PERCH.length)%PERCH.length;if(q===api.ia[i*2])q=(q+1)%PERCH.length;api.ia[i*2]=q;return MODE.route;}
      return at?MODE.settle:MODE.route;
    }
    function steerOwl(api,i,f){
      const x=api.px[i],y=api.py[i],z=api.pz[i],vx=api.vx[i],vy=api.vy[i],vz=api.vz[i],m=api.mode[i],st=api.ia[i*2+1];
      if(st===2&&m===MODE.route){
        // its flight out over the ice and a wide circle there, about the centre in fa, 20 units across and 7 to 12 up (seen
        // from the shore against the sky as the camera comes down from the corona), then back to a perch
        const cx=api.fa[i*2],cz=api.fa[i*2+1],ex=x-cx,ez=z-cz,d=hyp(ex,ez)||1,R=10,tx=-ez/d,tz=ex/d,sp=6.5,age=(api.tick-api.ia[i*2])/HZ;
        f[0]+=(tx*sp+(R-d)*ex/d*.8-vx)*1.6;f[2]+=(tz*sp+(R-d)*ez/d*.8-vz)*1.6;f[1]+=((7+4*smooth(age/5)+1.2*Math.sin(age*.9))-y)*1.2-vy*.8;return;}
      const p=PERCH[api.ia[i*2]]||PERCH[0],ex=p[0]-x,ez=p[2]-z,d=hyp(ex,ez);
      if(m===MODE.settle){f[0]+=ex*6-vx*4;f[1]+=(p[1]-y)*6-vy*4;f[2]+=ez*6-vz*4;return;}
      // gliding: low over the snow and the ice between perches, rising to the perch over its last stretch
      const sp=Math.min(7.5,1+d*.9),dd=d||1;f[0]+=(ex/dd*sp-vx)*1.3;f[2]+=(ez/dd*sp-vz)*1.3;
      const cruise=Math.max(p[1],3.2+Math.min(6,d*.08)),yt=d<14?p[1]+(cruise-p[1])*(d/14)*(d/14):cruise;
      f[1]+=(yt-y)*1.4-vy*1.1;
    }
    return {capacity,trail:TRAIL_K,bounds:{min:[X0-10,ICE_Y-1.6,Z0-11],max:[X1+10,34,Z1+10]},
      field:{nx:NXF,nz:NZF,min:[X0,Z0],max:[X1,Z1],decay:{trail:.9993,energy:.993,disturb:.995,flow:.95},diffuse:{trail:.004,energy:.05,disturb:.05,flow:.12},saturate:{trail:3,energy:4,disturb:4,flow:1},advect:0},
      species:SPECIES,relations:RELATIONS,hooks,siteSlots:[]};
  }
  return {id:'aurora',version:1,ecosystem,habitat,climate:section=>CLIMATE[section]||CLIMATE.home,capacity,trail:TRAIL_K,
    // the shore as the grammar knows it (the world and the tests read it; constant for the recipe)
    shore:{S,SHORE,DENS,TREES,SHELTER,PERCH,ROOF,landAt}};
}

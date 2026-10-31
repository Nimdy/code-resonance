// Temporal Terrain's digital life (life/sim.js grammar 'temporal-terrain'): living light on the land of time. Pure (no
// rendering): the grammar of the ecosystem for the world (terrain.js draws it), tested in Node
// (tests/life-terrain.test.js). Ambient life, never progress: it is never labelled, never counted as an agent and never
// placed from an event.
//
// Frame: the land's own layout. x is where terrain-layout.js rangesAt places ranges and files across the land
// (compressed by kx when the land is wider than the frame, kxOf), z the depth behind the front edge (the present at 0,
// the past on the land's logarithmic scale), y the height above the drawn ground. The world draws a point at layout x
// on the drawn (meandered) land at depth z, y above it, so the inhabitants follow the ridges and valleys as drawn.
//
// Time flows back through the frame: the moment under a point at depth z recedes at L / (tau e^(z / L)) units a second
// (the derivative of terrain-layout.js depthOf), fast at the front, ever slower in the past. That is the macro current,
// and the fields lie on the land: every tick the trail, energy and disturbance channels are carried back with it (so the
// paths the herds wear, a nourished pasture and a fault's disturbance recede into history as the land does). The music
// never makes time flow faster (the climate's current is taken back out of it); in a replay faster than SPEED_MAX the
// inhabitants live at SPEED_MAX (they cannot follow a land rushing back; the world fades the paths it draws).
//
// Populations (species):
//  grazers   herds of light on the ground. They graze on the pastures of the present (each file's ridge just behind the
//            front edge, by its height and how recently it changed), walking against the flow of time to stay on them;
//            between pastures they travel in the valleys (downhill across the land's profile) toward the present. Fed,
//            they move on carrying a stronger trail; tired, they lie down and the land carries them back into the past
//            until they recover; old, they let it carry them away into the haze, where their lives end. A fault (a
//            failing run: a disturbance at its range that keeps emitting while it lasts and recedes as a scar) scatters
//            them from the struck range: they shelter in the valleys of the others until it heals. Only as many are awake
//            as the pastures can feed (the rest sleep far back in the haze, unseen, until the land grows).
//  swifts    flocks in the air over the present: murmurations (strong alignment and cohesion) that circle over the
//            ranges where the land is lit (nourished, new, lasting), scatter at a fault and re-form; the land does not
//            carry them.
//  gleaners  solitary slow lights of the past: they keep to the older land, follow the paths the herds wore as those
//            recede into history, settle where time runs slow (deep in the land) and ride it back, and wake again.
// Habitat (sites): per range (subsystem) a site over its crest just behind the front edge, the target of engineering
// events (a module's intents reach its range); per file a pasture on its ridge (at most 64 sites in all: the ranges
// first, then the strongest pastures). Data: the land's profile across the frame (elevation per lane, the world's own
// rowAt at the habitat's moment), the frame's compression, each pasture's range and the playback speed (the land's
// rate). A pure function of the model and the time.
import {MODE,CH,HZ,DT} from './sim.js';
import {prepare,rangesAt,rowAt,EASE,LANES} from '../terrain-layout.js';
export const GRAZER=0,SWIFT=1,GLEANER=2;
export const SPECIES_NAMES=['grazer','swift','gleaner'];
export const CAPACITY=720,TRAIL_K=10;
// The frame: layout x in [-RN, RN] (the land compressed into 90 % of it when wider), depth in [Z0, Z1].
export const RN=130,Z0=-6,Z1=126,YMAX=16;
export const SPEED_MAX=1.5;
// Where the sites stand (depth behind the front edge, height above the ground).
export const PASTURE_Z=3.2,RANGE_Z=9,RANGE_Y=8;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const r3=x=>Math.round(x*1000)/1000;
const hyp=(a,b)=>Math.sqrt(a*a+b*b);
const Z3=[0,0,0];
// The compression of the frame for a land reaching from `left` to `right` (layout units): 1 while it fits.
export const kxOf=(left,right)=>Math.min(1,RN*.9/Math.max(1,-left,right));
// The land's rate (depth units per second of view time) at depth z, at playback speed k (capped at SPEED_MAX).
export const landRate=(z,cfg,k=1)=>1000*cfg.L/cfg.tau*Math.exp(-Math.max(0,z)/cfg.L)*Math.min(SPEED_MAX,Math.max(0,k));
const upper=(a,v)=>{let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m]<=v)lo=m+1;else hi=m;}return lo;};
// cfg: terrain-layout.js layoutConfig(recipe).
export function createTerrainGrammar({cfg,capacity=CAPACITY}){
  const R0=landRate(0,cfg,1);   // the land's rate at the front edge at 1x
  // ---- Habitat ----------------------------------------------------------------------------------------------------
  // At the habitat's moment t the structure of the window is settled EASE later (its births have risen): the land as
  // this structure stands, which is where the herds graze until the next window.
  function habitat(model,t){
    const P=prepare(model),g=t+EASE,R=rangesAt(P,g,EASE,cfg),kx=kxOf(R.left,R.right);
    const row=new Float32Array(LANES*8);rowAt(P,g,EASE,cfg,{Xc:0,Xh:RN/kx},row,()=>Z3,Z3);
    const prof=new Float32Array(LANES),stress=new Float32Array(LANES);for(let j=0;j<LANES;j++){prof[j]=r3(row[j*4]);stress[j]=r3(row[j*4+2]);}
    const lw=2*RN/kx/LANES,sig=Math.max(.62*cfg.sp,1.3*lw);
    const ranges=[],pastures=[];
    for(const r of R.ranges){let rec=0;
      for(const f of r.files){const pf=P.files.get(f.id),k=pf?upper(pf.ev,g):0,last=k>0?pf.ev[k-1]:-Infinity;
        const rc=last>-Infinity?Math.exp(-Math.max(0,t-last)/120000):0;rec=Math.max(rec,rc);
        const w=f.alive*(.35+.3*Math.log2(1+f.n))*(1+1.6*rc)*(f.stress>.2?.35:1)*(f.valid>.3?1.12:1);
        if(w>.02)pastures.push({id:`${f.id}#p`,range:r.id,x:r3(f.x*kx),y:.4,z:PASTURE_Z,r:r3(clamp(sig*kx*1.15,1.1,5.5)),w:r3(w),kind:0});}
      ranges.push({id:r.id,x:r3(r.c*kx),y:RANGE_Y,z:RANGE_Z,r:r3(clamp(r.w*kx*.22,2.5,16)),w:r3((.5+.3*Math.log2(1+r.files.length))*(1+rec)*Math.min(1,r.nb)),kind:1});}
    const by=(a,b)=>b.w-a.w||(a.id<b.id?-1:a.id>b.id?1:0);
    const keepR=ranges.sort(by).slice(0,24),keepP=pastures.sort(by).slice(0,64-keepR.length);
    const rangeOf={};for(const p of keepP)rangeOf[p.id]=p.range;
    const sites=[...keepR,...keepP.map(({range,...p})=>p)];
    return {sites,data:{speed:Number.isFinite(model.speed)&&model.speed>0?model.speed:1,kx:r3(kx),left:r3(R.left*kx),right:r3(R.right*kx),prof,stress,rangeOf}};
  }
  // ---- The musical climate (ecology 1): slow phrasing, never a jump ---------------------------------------------------
  const CLIMATE={
    home:{current:1,turb:1,cohesion:1,activity:1,attract:1,swing:0},
    away:{current:1,turb:1.1,cohesion:.9,activity:1.05,attract:.9,swing:.8},
    tension:{current:1,turb:1.6,cohesion:.65,activity:1.15,attract:.75,swing:.4},
    resolve:{current:1,turb:.8,cohesion:1.35,activity:.95,attract:1.2,swing:-.4},
    lift:{current:1,turb:1,cohesion:1.2,activity:1.2,attract:1.3,swing:.25},
    breath:{current:1,turb:.6,cohesion:1.25,activity:.75,attract:1,swing:0}};
  function ecosystem(params,seed){
    // ---- Populations ----------------------------------------------------------------------------------------------
    // Grazers walk faster than the land flows at the front (they hold the present against it); gleaners just enough to
    // ride it. Ecology 2 (respond): grazers answer gathering and exploration, swifts the music's cohesion, activity and
    // turbulence most (a murmuration tightens and loosens with it); gleaners hardly notice it. The land's pull is felt
    // as it is (current 1: time never flows faster for the music).
    const SPECIES_SPEC=[
      {name:'grazer',share:.56,radius:3,sepRadius:.85,maxSpeed:1.1+1.5*R0,minSpeed:.05,maxForce:3,mass:1.1,drag:.2,sep:1.7,ali:.75,coh:.6,
        seek:1.3,orbit:1.2,orbitRadius:.8,orbitSpeed:.18,orbitJitter:.6,orbitBand:0,curiosity:0,
        trail:.45,deposit:.006,carryDeposit:.014,energyDeposit:.004,flow:.7,push:.008,avoid:2.6,wander:.55,wanderJitter:.4,
        crowd:13,satiate:.0018,metabolism:.0008,restBelow:.12,restRecover:.0024,disturbBelow:.3,
        life:[120,300],fade:5,respawn:[2,8],yMin:.1,yMax:1.2,yHold:2,yRest:.15,congestion:.002,congestionAbove:8,
        respond:{current:1,gather:1.25,explore:1.1,activity:.8,cohesion:1,turb:.8}},
      {name:'swift',share:.26,radius:4.2,sepRadius:1.1,maxSpeed:4,minSpeed:1.5,maxForce:4,mass:.7,drag:.05,sep:1.3,ali:1.35,coh:.95,
        seek:1,orbit:.9,orbitRadius:1.1,orbitSpeed:.42,orbitJitter:.5,orbitBand:.45,curiosity:0,
        trail:0,deposit:0,carryDeposit:0,energyDeposit:0,flow:0,push:0,avoid:1.6,wander:.6,wanderJitter:.45,
        crowd:24,satiate:.0015,metabolism:.0005,restBelow:-1,disturbBelow:.28,
        life:[60,180],fade:2.5,respawn:[1,5],yMin:4,yMax:15,yHold:.25,
        respond:{cohesion:1.6,activity:1.25,turb:1.4,explore:1.3,gather:1.1}},
      {name:'gleaner',share:.18,radius:2.4,sepRadius:1.5,maxSpeed:.8+1.2*R0,minSpeed:.03,maxForce:1.5,mass:1.6,drag:.25,sep:1.8,ali:.1,coh:0,
        orbit:0,curiosity:0,trail:1.8,deposit:.0015,carryDeposit:0,energyDeposit:0,flow:.55,push:0,avoid:1.2,wander:.35,wanderJitter:.3,
        crowd:30,metabolism:0,restBelow:-1,disturbBelow:1.2,settle:.006,settleFlow:.9*R0,
        life:[150,360],fade:6,respawn:[3,9],yMin:.2,yMax:2.5,yHold:.4,
        respond:{current:1,activity:.4,turb:.5,cohesion:.5,explore:.5,gather:.6}}];
    // Between species: grazers part around the gleaners, gleaners keep apart from the herds.
    const RELATIONS=[[null,null,{avoid:.3,radius:1.6}],null,[{avoid:.6,radius:2.2},null,null]];
    const GZ=SPECIES_SPEC[0],OLD=.8,HOME=22,GL0=28,GL1=95,SW1=32,VALLEY=.55,curiosity=.02,swiftCuriosity=.012,STREAM=8*HZ,FOLLOW=.7;
    // ---- Derived habitat data (a pure function of the ecosystem's sites and data; recomputed when they change) ------
    let idsRef=null,dataRef=null,nR=0,nP=0,kSpeed=1,left=-12,right=12,prof=null,AW0=0;
    const RK=new Int16Array(64),PK=new Int16Array(64),PR=new Int16Array(64),PO=new Int16Array(64),CAPP=new Float32Array(64);
    const RAP=new Float64Array(64),AP=new Float64Array(64),APk=new Float64Array(64),NOV=new Float32Array(64),STR=new Float32Array(64),W=new Float64Array(64),streamTo=new Int16Array(64),streamT=new Int32Array(64);
    let LURE=0;   // how strongly a new or freshly nourished range draws grazers off their pastures (0: none)
    // The land's rate and the fields' carriage per field row (semi-Lagrangian along z: row j takes from row j - 1).
    let rows=null,rowsK=NaN,NXf=0,NZf=0,chf=1,FZ0f=0;
    function ensure(api){
      const S=api.sites,ids=S.ids,data=api.siteData;if(ids===idsRef&&data===dataRef)return;idsRef=ids;dataRef=data;
      kSpeed=Math.min(SPEED_MAX,Math.max(0,data?.speed??1));prof=data?.prof||null;left=data?.left??-12;right=data?.right??12;
      const idx=new Map();for(let k=0;k<S.count;k++)idx.set(ids[k],k);
      nR=0;nP=0;let feed=0;
      for(let k=0;k<S.count;k++){if(S.kind[k]===1){PO[k]=nR;RK[nR++]=k;}}
      for(let k=0;k<S.count;k++){if(S.kind[k]!==0)continue;const p=nP++;PK[p]=k;PO[k]=p;const rid=data?.rangeOf?.[ids[k]];PR[p]=rid!==undefined?idx.get(rid)??-1:-1;
        // what a pasture carries before its grazers move on (about 7 to 18)
        CAPP[p]=clamp(6+3*S.r[k],7,18);feed+=CAPP[p];}
      AW0=Math.round(1.4*feed);
      // the fields' carriage: per row, where its content comes from one tick earlier
      const F=api.field;NXf=F.nx;NZf=F.nz;chf=F.ch;FZ0f=F.min[1];
      if(kSpeed!==rowsK){rowsK=kSpeed;rows=new Float64Array(NZf*2);
        for(let j=0;j<NZf;j++){const z=FZ0f+(j+.5)*chf,v=landRate(z,cfg,kSpeed),js=j-v*DT/chf,j0=Math.floor(js);rows[j*2]=j0;rows[j*2+1]=js-j0;}}
    }
    // The land's rate at depth z (the value the current gives).
    const rateAt=z=>landRate(z,cfg,kSpeed);
    // A gleaner's own depth in the older land.
    const zOwn=(api,i)=>GL0+4+(GL1-GL0-8)*api.fa[i*2];
    // The land's profile across the frame: its slope at x (elevation per eco unit; positive: rising toward +x).
    const LW=2*RN/LANES;
    function slope(x){if(!prof)return 0;const u=(x+RN)/LW-.5;let j=Math.floor(u);if(j<1)j=1;if(j>LANES-3)j=LANES-3;const f=clamp(u-j);
      const s0=(prof[j+1]-prof[j-1])/(2*LW),s1=(prof[j+2]-prof[j])/(2*LW);return s0+(s1-s0)*f;}
    // ---- Per tick (hooks.tick, before anything moves): the fields ride the land; the sites' appeal; who is awake ----
    let fieldBuf=new Float32Array(1),cz=NaN,ck=NaN,cv=0;
    let AW=0,E2=false,GA=1,EXP=1,ACT=1;
    function carry(api){
      if(!rows)return;const F=api.field.data,NC=NXf*NZf;if(fieldBuf.length!==NC)fieldBuf=new Float32Array(NC);
      for(const c of [CH.trail,CH.energy,CH.disturb]){const o=c*NC;
        for(let j=NZf-1;j>=0;j--){const j0=rows[j*2],w=rows[j*2+1],q=j*NXf;
          if(j0<0){if(j0+1===j)for(let i=0;i<NXf;i++)fieldBuf[q+i]=F[o+q+i]*w;else for(let i=0;i<NXf;i++)fieldBuf[q+i]=0;continue;}
          const a=o+j0*NXf,b=j0+1<NZf?a+NXf:a;for(let i=0;i<NXf;i++)fieldBuf[q+i]=F[a+i]*(1-w)+F[b+i]*w;}
        F.set(fieldBuf,o);}
    }
    function perTick(api){
      ensure(api);carry(api);
      const S=api.sites,c=api.cond,P=api.params;
      if((E2=api.ecology===2)){GA=api.felt(GRAZER,'gather');EXP=api.felt(GRAZER,'explore');ACT=api.felt(GRAZER,'activity');}else{GA=1;EXP=1;ACT=c.activity;}
      let feed=0;LURE=0;
      for(let n=0;n<nR;n++){const k=RK[n],st=S.state(k);if(!st){RAP[n]=0;STR[k]=0;continue;}STR[k]=st.stress;LURE=Math.max(LURE,(st.novelty+.6*st.nourish)*(1-st.stress));
        let a=S.w[k]*(1+2*st.novelty+1.2*Math.min(2,st.lasting)+.9*st.nourish)*(.6+.5*Math.min(1.5,api.sample(CH.energy,S.x[k],S.z[k])));
        a*=1/(1+(S.visits[k]/18)**2)*(1-.95*st.stress)*c.attract*P.attraction*(E2?api.shiftOf(k):1);RAP[n]=Math.max(0,a);}
      for(let p=0;p<nP;p++){const k=PK[p],kr=PR[p],st=kr>=0?S.state(kr):null,str=st?st.stress:0;STR[k]=str;NOV[p]=st?st.novelty:0;
        const cap=CAPP[p]*(E2?GA:1);if(str<.3)feed+=cap;
        let a=S.w[k]*(st?1+2.6*st.novelty+.9*Math.min(2,st.lasting)+1.4*st.nourish:1)*(.6+.6*Math.min(1.5,api.sample(CH.energy,S.x[k],S.z[k])));
        a*=1/(1+(S.visits[k]/cap)**3)*(1-.95*str)*c.attract*P.attraction*(E2?api.shiftOf(k):1);AP[p]=APk[k]=Math.max(0,a);}
      // How many grazers are awake: as many as the pastures carry (grazer slots come first: the slot is its rank). The
      // state says who sleeps (ia[i * 2 + 1]: 1 asleep), so the world reads it from the ecosystem alone.
      AW=Math.round(1.4*feed);const ia=api.ia;for(let i=0;i<api.capacity;i++){if(api.sp[i]!==GRAZER)break;ia[i*2+1]=i>=AW?1:0;}
      // Streams: who left each pasture most recently, and for where (the herd leaving after follows). A seeker keeps the
      // pasture it left (ia[i * 2]); its time on the way is its time in the mode.
      streamTo.fill(-1);streamT.fill(1<<30);
      for(let i=0;i<api.capacity;i++){if(api.sp[i]!==GRAZER)break;if(!api.alive[i]||api.mode[i]!==MODE.seek)continue;const src=ia[i*2],t=api.modeT[i];
        if(src<0||src>=64||t>STREAM)continue;if(t<streamT[src]){streamT[src]=t;streamTo[src]=api.tgt[i];}}
    }
    // A pasture to graze (a weighted draw from the entity's own random stream); nearer is better, a little more so
    // across the land than along it (the herds walk along the valleys), and a new range is worth a longer walk.
    function choosePasture(api,i,avoid){
      const S=api.sites,x=api.px[i],z=api.pz[i],reach=E2?28*Math.sqrt(EXP):28;let total=0;
      for(let p=0;p<nP;p++){const k=PK[p];let a=AP[p]/(1+hyp(S.x[k]-x,(S.z[k]-z)*.5)/(reach*(1+2*NOV[p])));if(k===avoid||k===api.tgt[i])a*=.08;W[p]=a;total+=a;}
      if(total<=0)return -1;let u=api.random(i,7)*total;for(let p=0;p<nP;p++){u-=W[p];if(u<=0)return PK[p];}return PK[nP-1];
    }
    function chooseRange(api,i){
      const S=api.sites,x=api.px[i];let total=0;
      for(let n=0;n<nR;n++){const k=RK[n];let a=RAP[n]/(1+Math.abs(S.x[k]-x)/60);if(k===api.tgt[i])a*=.15;W[n]=a;total+=a;}
      if(total<=0)return -1;let u=api.random(i,8)*total;for(let n=0;n<nR;n++){u-=W[n];if(u<=0)return RK[n];}return RK[nR-1];
    }
    const hooks={
      // The macro current: the land flowing back (depth only), the climate's current taken back out (the music never
      // makes time flow faster). Memoised along a field row (the sim asks row by row at one time).
      current(x,y,z,t,c,out){if(z!==cz||kSpeed!==ck){cz=z;ck=kSpeed;cv=landRate(z,cfg,kSpeed);}out[0]=0;out[1]=0;out[2]=cv/(c.current||1);},
      spawn(api,i,k,r,out){
        ensure(api);const S=api.sites,L=Math.min(left,-6),Rt=Math.max(right,6);
        if(k===GRAZER){
          // the awake are born at the present, in a valley beside a pasture; the sleepers far back in the haze
          if(nP&&i<AW0){const p=Math.floor(r(20)*nP)%nP,q=PK[p],side=r(21)<.5?-1:1;out[0]=S.x[q]+side*(S.r[q]*(1.2+1.5*r(22)));out[2]=2+26*r(23);}
          else if(!nP||i<AW0){out[0]=L+(Rt-L)*r(20);out[2]=4+24*r(23);}
          else{out[0]=L+(Rt-L)*r(20);out[2]=95+28*r(23);}
          out[1]=.3;}
        else if(k===SWIFT){out[0]=L+(Rt-L)*r(20);out[2]=2+24*r(21);out[1]=6+7*r(22);}
        else{out[0]=L+(Rt-L)*r(20);out[2]=GL0+8+(GL1-GL0)*r(21);out[1]=.6;}
      },
      tick:perTick,
      steer(api,i,f,dist){
        const k=api.sp[i],x=api.px[i],z=api.pz[i],m=api.mode[i];
        if(k===SWIFT){
          // over the present: back toward it when far over the past, never far over the void before the front edge
          if(z>SW1)f[2]-=(z-SW1)*.12;else if(z<-3)f[2]+=(-3-z)*.6;
          if(x<left-14)f[0]+=(left-14-x)*.3;else if(x>right+14)f[0]-=(x-right-14)*.3;
          return;}
        // On the land: never before the front edge, never far beyond the outer ranges.
        if(z<.6)f[2]+=(.6-z)*5;
        if(x<left-5)f[0]+=(left-5-x)*.6;else if(x>right+5)f[0]-=(x-right-5)*.6;
        // What rests on the land is carried back with it (the sim's rest and settle damp toward the land's velocity).
        if(m===MODE.rest||m===MODE.settle){const vL=rateAt(z);f[2]+=vL*1.5;if(m===MODE.settle)f[2]+=(vL-api.vz[i])*.8;}
        if(k===GRAZER){
          // asleep: far back in the haze
          if(i>=AW&&z<100)f[2]+=.6;
          // travelling: in the valleys (downhill across the land); toward the present when far from it; a fault nearby
          // sends them to the low ground sooner (shelter)
          if(m===MODE.explore||m===MODE.disperse){const s=slope(x),g=VALLEY*(1+3*Math.min(1,dist*4));f[0]-=clamp(s*g,-1.2,1.2);
            if(m===MODE.explore&&z>HOME&&i<AW)f[2]-=Math.min(1.4,(z-HOME)*.06);}
        }else{
          // gleaners keep to the older land, each walking back to a depth of its own (its seeded orbit share, unused by
          // a gleaner) before it settles there and rides the land back
          if(z<GL0)f[2]+=(GL0-z)*.1;else if(z>GL1)f[2]-=(z-GL1)*.08;
          if(m===MODE.explore){const d=zOwn(api,i)-z;f[2]+=clamp(d*.05,-.9,.9);}
        }
      },
      decide(api,i,nb,dist){
        const k=api.sp[i],m=api.mode[i];
        if(k===GRAZER){
          // asleep (the pastures cannot feed it), or old: it lies down and the land carries it into the past
          if(i>=AW||api.age[i]>api.life[i]*OLD)return MODE.rest;
          if(m===MODE.explore){
            if(api.en[i]<GZ.restBelow)return MODE.rest;
            if(api.modeT[i]>2*HZ&&dist<GZ.disturbBelow*.6&&api.random(i,1)<curiosity*ACT*api.params.vitality*(E2?Math.pow(EXP,.8):1)){
              const q=choosePasture(api,i,-1);if(q>=0){api.tgt[i]=q;return MODE.seek;}}
            return -1;}
          const q=api.tgt[i];
          if(m===MODE.seek){if(q<0)return MODE.explore;if(STR[q]>.35)return MODE.explore;return -1;}
          if(m===MODE.orbit){if(q<0)return MODE.explore;if(STR[q]>.25)return MODE.disperse;
            // fed: on to another pasture (or roaming), carrying this one's influence for a while; the herd leaving after
            // follows whoever left just before, unless the pasture it would choose itself is far better. A new or freshly
            // nourished range draws grazers away before they are fed (they come to see).
            const lure=api.en[i]<1&&LURE>0&&api.modeT[i]>3*HZ&&api.random(i,13)<.006*LURE;
            if(api.en[i]>=1||lure){api.carry[i]=Math.round((lure?5:10)*HZ);api.en[i]=Math.min(api.en[i],.7);api.ia[i*2]=q;
              const own=choosePasture(api,i,q),s=streamTo[q];let n=own;
              if(!lure&&s>=0&&s!==q&&STR[s]<.3&&api.random(i,11)<FOLLOW&&(own<0||APk[s]>=.5*APk[own]))n=s;
              if(n>=0&&n!==q&&api.random(i,12)<.75){api.tgt[i]=n;return MODE.seek;}return MODE.explore;}
            return -1;}
          return -1;}
        if(k===SWIFT){
          if(m===MODE.explore){if(api.modeT[i]>3*HZ&&dist<.15&&api.random(i,2)<swiftCuriosity*api.params.vitality*(E2?EXP:1)){const q=chooseRange(api,i);if(q>=0){api.tgt[i]=q;return MODE.seek;}}return -1;}
          if((m===MODE.seek||m===MODE.orbit)&&api.tgt[i]>=0&&STR[api.tgt[i]]>.3)return MODE.disperse;
          return -1;}
        // gleaners: settled, carried back to the far edge of their land, they wake and walk forward again; on the way
        // back to their own depth they do not settle
        if(m===MODE.settle&&api.pz[i]>GL1+6)return MODE.explore;
        if(m===MODE.explore&&Math.abs(zOwn(api,i)-api.pz[i])>6)return MODE.explore;
        return -1;
      }
    };
    return {capacity,trail:TRAIL_K,bounds:{min:[-RN,0,Z0],max:[RN,YMAX,Z1]},
      field:{nx:128,nz:64,min:[-RN,Z0],max:[RN,Z1],decay:{trail:.9985,energy:.993,disturb:.997,flow:.95},diffuse:{trail:.03,energy:.06,disturb:.05,flow:.12},saturate:{trail:3,energy:4,disturb:4,flow:3},advect:0},
      species:SPECIES_SPEC,relations:RELATIONS,hooks,siteSlots:[0]};   // ia[i*2]: the pasture a grazer last left
  }
  return {id:'temporal-terrain',version:1,ecosystem,habitat,climate:section=>CLIMATE[section]||CLIMATE.home,capacity,trail:TRAIL_K,
    // For tests and the world: who is awake (a grazer below the count the pastures feed)
    cfg};
}

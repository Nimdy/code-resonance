// Synaptic Storm's digital life: the glia and vesicles of the living network (life/sim.js grammar 'synaptic-storm').
// Pure (no rendering): synaptic.js draws it, tests/life-synaptic*.test.js check it. Ambient life, never progress: it is
// never labelled, never counted as an agent and never placed from an event.
//
// Frame: the network's own coordinates (synaptic-layout.js, world units) scaled by frameScale(radius) = min(1, RN /
// radius), so a network up to RN units in radius lives at its own scale (its somas, synapses and inhabitants as large as
// the world draws them) and a larger one is scaled to fit the ecosystem's fixed bounds. The world draws the ecosystem
// at world = eco / frameScale(its own network's radius).
//
// Populations (species):
//  glia       astrocytes: slow star-shaped cells that tile the network. Each chooses a neuron (its weight, the energy
//             and nourishment around it, how few glia it holds already), settles in a domain of its own beside one of
//             the neuron's synapses or branch roots (a seeded anchor of the neuron, the habitat's data) and moves on
//             seldom (never because it is fed; less where the neuron is nourished, new or lasting), carrying the
//             neuron's influence (a stronger trail). They keep their distance from each other (separation: they tile,
//             never crowd), drift a little with the tide, withdraw from an inhibited region and come back after a
//             recovery;
//  vesicles   neuromodulator vesicles: small glassy bubbles riding the tide in loose clouds (alignment, cohesion), that
//             gather where a neuron is active (energy, nourishment), swirling in small clouds around its synapses, and
//             leave fed in streams that carry the gathering's influence to the next neuron; they flee disturbance first;
//  microglia  the network's sentinels: few, motile, following the trails others leave; within SENSE site radii of an
//             inhibited neuron they come to the edge of its sphere and circle it slowly, never inside; they part the
//             vesicles' clouds.
// Carrying capacity: only as many of each are awake as the neurons can host (hostable); the others are dormant, outside
// every field, and wake as neurons appear.
// The tide (the macro current): the neuromodulator tide of the network: a slow circulation about the network's heart, a
// slow in- and outflow (a period of TIDE seconds, turned by the climate's swing), a few broad eddies and a vertical
// swell. Static parts are tabulated per field cell when the habitat changes; per tick only the phases change.
// Inhibited regions: a failing run strains the neurons of the files it covers (the driver's disturbance at their sites):
// besides the field's disturbance (a column over the ground plane), a strained neuron repels glia and vesicles within a
// sphere about its soma, as the world dims its neighbourhood.
//
// Habitat: one site per neuron (the soma, synaptic-layout.js networkAt, settled: where the layout of the structure comes
// to rest), at most MAX_SITES, the hubs first, then by their files and symbols; data: per site its anchors (the synaptic
// terminals on its branches, where axons from other neurons arrive, then its branches' roots), the network's centre and
// reach. A file's events land on its neuron's site (siteOf), or on its cluster's first site when the neuron is not kept.
// The set of sites and siteOf read the structure as it stands in the model (never the time), so they always agree.
import {u01,MODE,CH,DT} from './sim.js';
import {dendriteTree,slotDirection} from '../synaptic-layout.js';
export const RN=64;                       // the network radius (world units) up to which the frame is the world's own
export const GLIA=0,VESICLE=1,MICROGLIA=2;
export const SPECIES_NAMES=['glia','vesicle','microglia'];
export const SHARES=[.15,.79,.06];
export const CAPACITY=900,TRAIL_K=10;
export const MAX_SITES=60,ANCHORS=8;
const TAU=Math.PI*2,TIDE=56,V=.42;        // the tide's period (s) and speed (units/s)
const SENSE=7;                            // how far (in site radii) a sentinel senses an inhibited neuron
const B=RN*1.3,YB=45;                     // the ecosystem's bounds: x, z in [-B, B], y in [-YB, YB]
const NX=64,cw=2*B/NX,NC=NX*NX;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// How many of a species the network hosts awake with n neurons as sites (the species' own share of the capacity caps it).
export const HOST=[[4,14],[40,60],[4,4]];
export const hostable=(s,n)=>HOST[s][0]+HOST[s][1]*n;
export const DORMANT=1;   // ia[i * 2 + 1]: a dormant inhabitant (see the carrying capacity below)
export const dormant=(eco,i)=>eco.ia[i*2+1]===DORMANT;
const r3=x=>Math.round(x*1000)/1000;
export const frameScale=radius=>Math.min(1,RN/Math.max(1e-6,radius));
export function createSynapticGrammar({layout,capacity=CAPACITY}){
  const cfg=layout.cfg,K=cfg.K;
  // ---- The standing structure: which neurons exist, which are sites, where each file's events land -----------------
  // Read from the model's membership only (files not removed), never from a time: habitat() and siteOf() see the same.
  const memo=new WeakMap();
  function standing(model){
    const hit=memo.get(model);if(hit&&hit.version===model.version)return hit;
    const neurons=[],neuronOf=new Map();
    const districts=[...model.districts.values()].sort((a,b)=>a.order-b.order||(a.id<b.id?-1:1));
    districts.forEach((d,di)=>{
      const ms=[];for(const id of d.members){const m=model.modules.get(id);if(m)ms.push(m);}
      ms.sort((a,b)=>a.order-b.order||(a.id<b.id?-1:1));const per=new Map();
      ms.forEach((m,rank)=>{const k=Math.floor(rank/K),id=`${d.id}#${k}`;neuronOf.set(m.id,id);if(m.removed!==null)return;
        let n=per.get(k);if(!n)per.set(k,n={id,k,cluster:d.id,di,files:0,symbols:0});n.files++;
        for(const s of m.symbols){const y=model.symbols.get(s);if(y&&y.removed===null)n.symbols++;}});
      for(const n of per.values())neurons.push(n);});
    // hubs first (in cluster order), then the neurons with the most files and symbols
    neurons.sort((a,b)=>(a.k===0?0:1)-(b.k===0?0:1)||(a.k===0?a.di-b.di:(b.files+.1*b.symbols)-(a.files+.1*a.symbols))||(a.id<b.id?-1:1));
    // (a cluster's first kept neuron takes the events of its files whose neuron is not kept, and of the cluster itself)
    const kept=new Set(neurons.slice(0,MAX_SITES).map(n=>n.id)),first=new Map(),firstK=new Map();
    for(const n of neurons)if(kept.has(n.id)&&!(firstK.get(n.cluster)<=n.k)){first.set(n.cluster,n.id);firstK.set(n.cluster,n.k);}
    const s={version:model.version,kept,neuronOf,first,weight:new Map(neurons.map(n=>[n.id,n]))};memo.set(model,s);return s;
  }
  function siteOf(id,model){
    const s=standing(model),m=model.modules.get(id);
    if(m){const n=s.neuronOf.get(id);if(n&&s.kept.has(n))return n;return s.first.get(m.group)??null;}
    return model.districts.has(id)?s.first.get(id)??null:null;
  }
  // A file's branch, as the world grows it: its direction from the soma, the root of its branch and its synapse (where
  // an axon from another neuron ends: the world's tree.syn). Pure functions of the file, its neuron and its slot.
  const trees=new Map();
  function branchOf(fileId,neuron,slot){const key=`${fileId}|${neuron}|${slot}`;let b=trees.get(key);
    if(!b){const dir=slotDirection(neuron,slot,K),t=dendriteTree(fileId,dir,cfg),lv0=t.segs.filter(x=>x.level===0);
      b={dir,entry:lv0[lv0.length-1].b,syn:lv0[Math.min(lv0.length-1,1)].b};if(trees.size>=4096)trees.clear();trees.set(key,b);}
    return b;}
  // ---- Habitat ------------------------------------------------------------------------------------------------------
  function habitat(model,t){
    const s=standing(model),net=layout.networkAt(model,t,true),k=frameScale(net.radius),sites=[],anchors={};
    const pos=new Map(),R=new Map(),slot=new Map();
    for(const n of net.neurons){pos.set(n.id,n.pos);R.set(n.id,layout.somaRadius(model,n,t));n.files.forEach((f,j)=>slot.set(f,[n.id,n.slots[j]]));}
    // the synapses on each neuron's branches: one per imported file that a file of another neuron imports
    const syn=new Map(),seen=new Set();
    for(const l of model.links.values()){if(!model.alive(l,t))continue;const a=net.fileNeuron.get(l.a),b=slot.get(l.b);if(!a||!b||a.neuron.id===b[0]||seen.has(l.b))continue;seen.add(l.b);
      let x=syn.get(b[0]);if(!x)syn.set(b[0],x=[]);x.push(l.b);}
    for(const n of net.neurons){if(!s.kept.has(n.id))continue;const p=n.pos,r=R.get(n.id),w=s.weight.get(n.id);
      const nsyn=syn.get(n.id)?.length||0;
      sites.push({id:n.id,x:r3(p[0]*k),y:r3(p[1]*k),z:r3(p[2]*k),r:r3(Math.max(.6,(r*1.6+2.2*cfg.DENDRITE)*k)),
        w:r3((n.k===0?1.2:1)*(.5+.25*Math.log2(1+(w?.files||1))+.05*Math.log2(1+(w?.symbols||0)))*(1+.15*Math.log2(1+nsyn))),kind:n.k===0?1:0});
      // anchors: the synapses on its branches (by the imported files' order), then its branches' roots
      const list=[],add=(f,which)=>{const sl=slot.get(f);if(!sl||list.length>=ANCHORS*3)return;const b=branchOf(f,n.id,sl[1]),q=which==='syn'?b.syn:b.entry;
        list.push(r3((p[0]+b.dir[0]*r*.85+q[0])*k),r3((p[1]+b.dir[1]*r*.85+q[1])*k),r3((p[2]+b.dir[2]*r*.85+q[2])*k));};
      const order=f=>model.modules.get(f)?.order??0;
      for(const f of (syn.get(n.id)||[]).slice().sort((a,b)=>order(a)-order(b)||(a<b?-1:1)))add(f,'syn');
      for(const f of n.files)add(f,'entry');
      anchors[n.id]=list;}
    // the network's heart (weighted by neurons, as the world frames it) and its reach, in the ecosystem's frame
    let reach=12;for(const c of net.clusters)reach=Math.max(reach,Math.hypot(c.pos[0]-net.center[0],c.pos[1]-net.center[1],c.pos[2]-net.center[2])+c.R*.7);
    return {sites,data:{k:r3(k),anchors,centre:net.center.map(v=>r3(v*k)),reach:r3(reach*k),synapses:[...syn.values()].reduce((a,x)=>a+x.length,0)}};
  }
  // ---- The tide and the per-tick tables -----------------------------------------------------------------------------
  // Static tables per field cell (rebuilt when the network's heart or reach changes): the radial direction from the
  // heart, the circulation's and the in- and outflow's profiles, the eddies' phases, the swell's phase.
  const EDDY=[[.9,.55,.031,.7],[-.45,1.05,-.023,2.3],[.7,-.8,.019,4.6]];   // kx, kz (per reach), omega, phase
  function makeHooks(){
    let ids=null,data=null,nS=0,cx=0,cy=0,cz=0,RH=20,tabFor='';
    const AX=new Float32Array(64*ANCHORS*3),AN=new Uint8Array(64);
    const T={ux:new Float32Array(NC),uz:new Float32Array(NC),rot:new Float32Array(NC),br:new Float32Array(NC),ed:new Float32Array(NC*6),sw:new Float32Array(NC)};
    const EKX=new Float64Array(3),EKZ=new Float64Array(3);
    function prep(api){
      const S=api.sites;if(S.ids===ids&&api.siteData===data)return;ids=S.ids;data=api.siteData;nS=S.count;AN.fill(0);
      const A=data?.anchors||{};for(let k=0;k<nS;k++){const a=A[ids[k]];if(!a)continue;const n=Math.min(ANCHORS,a.length/3|0);AN[k]=n;for(let j=0;j<n*3;j++)AX[k*ANCHORS*3+j]=a[j];}
      if(data?.centre){[cx,cy,cz]=data.centre;RH=Math.max(8,data.reach||20);}
      else if(nS){cx=cy=cz=0;for(let k=0;k<nS;k++){cx+=S.x[k];cy+=S.y[k];cz+=S.z[k];}cx/=nS;cy/=nS;cz/=nS;RH=8;for(let k=0;k<nS;k++)RH=Math.max(RH,Math.hypot(S.x[k]-cx,S.z[k]-cz)+S.r[k]*2);}
      else{cx=cy=cz=0;RH=20;}
      const key=`${cx},${cz},${RH}`;if(key===tabFor)return;tabFor=key;
      for(let m=0;m<3;m++){EKX[m]=EDDY[m][0]*TAU/(RH*2.2);EKZ[m]=EDDY[m][1]*TAU/(RH*2.2);}
      for(let j=0;j<NX;j++)for(let i=0;i<NX;i++){const q=j*NX+i,x=-B+(i+.5)*cw-cx,z=-B+(j+.5)*cw-cz,r=Math.hypot(x,z),u=r/RH;
        T.ux[q]=r>1e-6?x/r:0;T.uz[q]=r>1e-6?z/r:0;
        T.rot[q]=2.2*u*Math.exp(-u*u*.9);                         // the circulation: strongest at about 3/4 of the reach
        T.br[q]=Math.sin(Math.PI*Math.min(u,1.25)/1.25);           // the in- and outflow: none at the heart and beyond the reach
        for(let m=0;m<3;m++){const a=EKX[m]*x+EKZ[m]*z+EDDY[m][3];T.ed[q*6+m*2]=Math.cos(a);T.ed[q*6+m*2+1]=Math.sin(a);}
        T.sw[q]=(x+z)*TAU/(RH*3);}
    }
    let lastT=NaN,lastSwing=NaN,cb=0,sb=0,cr=1;const ec=new Float64Array(3),es=new Float64Array(3);
    function current(x,y,z,t,cond,out){
      if(t!==lastT||cond.swing!==lastSwing){lastT=t;lastSwing=cond.swing;const ph=t*TAU/TIDE+cond.swing*1.1;cb=Math.sin(ph);sb=ph;cr=1+.25*Math.cos(ph*.5);
        for(let m=0;m<3;m++){ec[m]=Math.cos(EDDY[m][2]*TAU*t);es[m]=Math.sin(EDDY[m][2]*TAU*t);}}
      let i=Math.round((x+B)/cw-.5),j=Math.round((z+B)/cw-.5);i=i<0?0:i>=NX?NX-1:i;j=j<0?0:j>=NX?NX-1:j;const q=j*NX+i;
      const ux=T.ux[q],uz=T.uz[q],vt=V*.55*T.rot[q]*cr,vr=V*.5*T.br[q]*cb;
      let ex=0,ez=0;for(let m=0;m<3;m++){const c=T.ed[q*6+m*2]*ec[m]-T.ed[q*6+m*2+1]*es[m];ex+=c*EKZ[m];ez-=c*EKX[m];}
      const ek=V*.5*(.6+.4*cond.turb)*RH/TAU;
      out[0]=-uz*vt+ux*vr+ex*ek;out[2]=ux*vt+uz*vr+ez*ek;out[1]=V*.16*Math.sin(sb*.7+T.sw[q]);
    }
    // Per tick, before anything moves: the sites' strain (an inhibited neuron), the tables, and how many of each species
    // the network can host (awake: the rest are dormant, see below).
    const stress=new Float32Array(64),strained=new Int32Array(64);let nStr=0;
    function tick(api){prep(api);const S=api.sites;nStr=0;
      for(let k=0;k<nS;k++){const st=S.state(k);stress[k]=Math.min(1,(st?.stress||0)*2.5);if(stress[k]>.04)strained[nStr++]=k;}
      const first=firstSlots(api.capacity);
      for(let i=0;i<api.capacity;i++){if(!api.alive[i])continue;const sp=api.sp[i],awake=i-first[sp]<hostable(sp,nS),asleep=api.ia[i*2+1]===DORMANT;
        if(awake&&asleep)wake(api,i);
        else if(!awake&&!asleep&&api.age[i]<api.life[i])api.life[i]=api.age[i];}}   // (beyond what the network hosts: it departs)
    // ---- Carrying capacity: only as many inhabitants are awake as the network can host (glia, vesicles and microglia
    // per neuron); the others are dormant: parked at the corner of the bounds, outside every field (no deposit, no
    // visit, never drawn), and woken in slot order as neurons appear (born where a newcomer would be, fading in).
    // A slot's rank in its species decides (a pure function of the slot and the number of sites).
    function firstSlots(cap){const f=[0,0,0];let used=0;for(let k=0;k<3;k++){f[k]=used;used+=k===2?cap-used:Math.floor(cap*SHARES[k]);}return f;}
    function park(api,i){api.ia[i*2+1]=DORMANT;api.tgt[i]=-1;api.setMode(i,MODE.rest);api.carry[i]=0;}
    function place(api,i,x,y,z){api.px[i]=api.qx[i]=x;api.py[i]=api.qy[i]=y;api.pz[i]=api.qz[i]=z;api.vx[i]=api.vy[i]=api.vz[i]=0;
      const K=api.K;for(let j=0;j<K;j++){api.tx[i*K+j]=x;api.ty[i*K+j]=y;api.tz[i*K+j]=z;}}
    const wakeOut=[0,0,0];
    function wake(api,i){const g=api.gen[i];api.ia[i*2+1]=-1;api.setMode(i,MODE.explore);api.tgt[i]=-1;
      spawnAt(api,i,api.sp[i],n=>u01(api.seed,i,g,100+n),wakeOut);place(api,i,wakeOut[0],wakeOut[1],wakeOut[2]);api.age[i]=0;api.fade[i]=0;}
    const unit=(api,i,n,out)=>{const g=api.gen[i],u=u01(api.seed,i,g,n)*2-1,a=u01(api.seed,i,g,n+1)*TAU,s=Math.sqrt(1-u*u);out[0]=Math.cos(a)*s;out[1]=u;out[2]=Math.sin(a)*s;return out;};
    const dir=[0,0,0];
    function steer(api,i,f,distLocal){
      const s=api.sp[i],m=api.mode[i],x=api.px[i],y=api.py[i],z=api.pz[i],ux=api.vx[i],uy=api.vy[i],uz=api.vz[i],P=api.params,S=api.sites;
      if(api.ia[i*2+1]===DORMANT){f[0]=(-B-x)*4-ux*4;f[1]=(-YB-y)*4-uy*4;f[2]=(-B-z)*4-uz*4;return;}
      // an inhibited neuron pushes glia and vesicles out of a sphere about its soma (as the world dims it)
      if(s!==MICROGLIA)for(let n=0;n<nStr;n++){const k=strained[n],dx=x-S.x[k],dy=y-S.y[k],dz=z-S.z[k],d=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-3,R=S.r[k]*2.6;
        if(d<R){const a=stress[k]*(1-d/R)*(s===VESICLE?3.2:2.4)*P.repulsion;f[0]+=dx/d*a;f[1]+=dy/d*a;f[2]+=dz/d*a;}}
      const k=api.tgt[i];
      if(k>=0&&k<nS&&AN[k]>0&&(m===MODE.orbit||(m===MODE.seek&&s===GLIA))){
        const j=Math.floor(api.fa[i*2+1]*AN[k])%AN[k],o=(k*ANCHORS+j)*3,axp=AX[o],ayp=AX[o+1],azp=AX[o+2];
        if(s===GLIA){// its domain: beside the anchor, out from it by a seeded distance in a seeded direction
          unit(api,i,31,dir);const d=.8+1.5*api.fa[i*2];const hx=axp+dir[0]*d,hy=ayp+dir[1]*d*.8,hz=azp+dir[2]*d;
          const ex=hx-x,ey=hy-y,ez=hz-z,near=m===MODE.seek?Math.min(1,3/(Math.sqrt(ex*ex+ey*ey+ez*ez)+1e-3)):1;
          f[0]+=(ex*.9-ux*1.1)*near;f[1]+=(ey*.9-uy*1.1)*near;f[2]+=(ez*.9-uz*1.1)*near;}
        else if(s===VESICLE){// a small cloud swirling about the synapse
          const h=api.fa[i*2],sp=(h<.5?-1:1)*(.5+.6*api.fa[i*2+1]),a=h*TAU*3+api.tick*DT*sp,rr=.45+.95*h;
          const ex=axp+Math.cos(a)*rr-x,ey=ayp+Math.sin(a*1.3)*rr*.45-y,ez=azp+Math.sin(a)*rr-z;
          f[0]+=ex*1.1-ux*.35;f[1]+=ey*1.1-uy*.35;f[2]+=ez*1.1-uz*.35;}
      }
      // sentinels: drawn from within SENSE of an inhibited neuron to the edge of its sphere, where they hold and circle
      // it slowly (surveying it), never inside it
      if(s===MICROGLIA&&nStr){let best=-1,bd=Infinity;
        for(let n=0;n<nStr;n++){const q=strained[n],d=Math.hypot(x-S.x[q],y-S.y[q],z-S.z[q])/S.r[q];if(d<SENSE&&d<bd){bd=d;best=q;}}
        if(best>=0){const dx=x-S.x[best],dy=y-S.y[best],dz=z-S.z[best],d=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-3,R=S.r[best]*2.9,st=stress[best],e=R-d;
          const a=clamp(e*.9,-1.4,1.4)*st*P.environment,sw=(api.fa[i*2]<.5?-1:1)*.35*st;
          f[0]+=dx/d*a-dz/d*sw-ux*.5*st;f[1]+=dy/d*a*.6-uy*.5*st;f[2]+=dz/d*a+dx/d*sw-uz*.5*st;}}
      // home: the ecology lives within the network (a soft edge beyond its reach)
      const hx=x-cx,hy=(y-cy)*1.6,hz=z-cz,hd=Math.sqrt(hx*hx+hy*hy+hz*hz);
      if(hd>RH){const a=Math.min(2,(hd-RH)*.35);f[0]-=hx/hd*a;f[1]-=hy/hd*a;f[2]-=hz/hd*a;}
    }
    // Where they appear: glia beside a neuron's anchors, most vesicles about a neuron, the rest of the vesicles and most
    // microglia anywhere within the network's reach. Never at an event, never at an agent.
    function spawn(api,i,s,r,out){
      prep(api);
      if(i-firstSlots(api.capacity)[s]>=hostable(s,nS)){park(api,i);out[0]=-B;out[1]=-YB;out[2]=-B;return;}
      spawnAt(api,i,s,r,out);
    }
    function spawnAt(api,i,s,r,out){
      const S=api.sites;
      const pick=()=>{let tot=0;for(let k=0;k<nS;k++)tot+=S.w[k];let u=r(20)*tot;for(let k=0;k<nS;k++){u-=S.w[k];if(u<=0)return k;}return nS-1;};
      if(nS&&r(21)<(s===GLIA?.85:s===VESICLE?.6:.25)){const k=pick();let ax=S.x[k],ay=S.y[k],az=S.z[k];
        if(AN[k]){const j=Math.floor(r(22)*AN[k])%AN[k],o=(k*ANCHORS+j)*3;ax=AX[o];ay=AX[o+1];az=AX[o+2];}
        const u=r(23)*2-1,a=r(24)*TAU,q=Math.sqrt(1-u*u),d=.6+(s===GLIA?1.6:2.4)*r(25);out[0]=ax+Math.cos(a)*q*d;out[1]=ay+u*d*.7;out[2]=az+Math.sin(a)*q*d;
        // a glial cell born beside a neuron begins in a domain of that neuron (where it was born: the habitat's site)
        if(s===GLIA){api.tgt[i]=k;api.setMode(i,MODE.orbit);}}
      else{const u=r(23)*2-1,a=r(24)*TAU,q=Math.sqrt(1-u*u),d=RH*.85*Math.cbrt(r(25));out[0]=cx+Math.cos(a)*q*d;out[1]=cy+u*d*.55;out[2]=cz+Math.sin(a)*q*d;}
      out[0]=clamp(out[0],-B+2,B-2);out[1]=clamp(out[1],-YB+2,YB-2);out[2]=clamp(out[2],-B+2,B-2);
    }
    // Glia never leave a domain because they are fed: now and then one moves on (seldom where the neuron is nourished,
    // active or lasting), so over minutes they gather where the network is active.
    function decide(api,i){
      if(api.ia[i*2+1]===DORMANT)return MODE.rest;
      // a sentinel near an inhibited neuron leaves whatever site it was at to survey it (its own steering holds it there)
      if(api.sp[i]===MICROGLIA&&nStr&&(api.mode[i]===MODE.orbit||api.mode[i]===MODE.seek)){const S=api.sites,x=api.px[i],y=api.py[i],z=api.pz[i];
        for(let n=0;n<nStr;n++){const q=strained[n];if(Math.hypot(x-S.x[q],y-S.y[q],z-S.z[q])<S.r[q]*SENSE)return MODE.explore;}}
      if(api.sp[i]!==GLIA||api.mode[i]!==MODE.orbit||api.modeT[i]<30*20)return -1;const k=api.tgt[i];if(k<0||k>=nS)return -1;const st=api.sites.state(k)||{};
      const p=.0005*(1-.75*Math.min(1,(st.nourish||0)*1.5+(st.lasting||0)*.5+(st.novelty||0)*.5));
      if(u01(api.seed,i,api.tick,61)<p){api.carry[i]=Math.round(8*20);return MODE.explore;}return -1;}
    return {tick,current,steer,spawn,decide};
  }
  // ---- Populations ----------------------------------------------------------------------------------------------------
  // Ecology 2 (respond): vesicles answer the tide, cohesion, gathering and exploration most (the most responsive
  // matter); glia hardly notice a phrase (they stay where they work), a little the gathering; microglia exploration and
  // activity (their patrols lengthen with exploring music).
  function ecosystem(){
    const species=[
      {name:'glia',share:SHARES[0],radius:2.6,sepRadius:2.1,maxSpeed:.6,minSpeed:.02,maxForce:1.4,mass:1.6,drag:.3,sep:2.6,ali:0,coh:0,
        seek:1.4,orbit:.25,orbitRadius:1.1,orbitSpeed:.06,orbitJitter:.4,orbitBand:.8,curiosity:.01,
        trail:.25,deposit:.002,carryDeposit:.025,energyDeposit:.004,flow:.15,push:.01,avoid:2.2,wander:.12,wanderJitter:.3,
        crowd:24,satiate:0,metabolism:.0002,restBelow:.05,restRecover:.002,disturbBelow:.3,life:[150,420],fade:4,respawn:[2,8],
        respond:{gather:.8,activity:.6,explore:.7,current:.6,turb:.6,cohesion:.5}},
      {name:'vesicle',share:SHARES[1],radius:1.6,sepRadius:.32,maxSpeed:1.1,minSpeed:.1,maxForce:2.6,mass:.5,drag:.12,sep:1.1,ali:.55,coh:.45,
        seek:2.4,orbit:.5,orbitRadius:.6,orbitSpeed:.5,orbitJitter:.5,orbitBand:.6,curiosity:.004,
        trail:.8,deposit:.006,carryDeposit:.03,energyDeposit:.01,flow:.55,push:.02,avoid:2.6,wander:.35,wanderJitter:.4,
        crowd:21,satiate:.0025,metabolism:.0006,restBelow:.1,restRecover:.002,disturbBelow:.22,life:[60,180],fade:2.5,respawn:[1,5],
        respond:{current:1.3,cohesion:1.3,gather:1.2,explore:1.1,activity:1,turb:1.1}},
      {name:'microglia',share:SHARES[2],radius:3.2,sepRadius:1.4,maxSpeed:.7,minSpeed:.1,maxForce:1.6,mass:1.2,drag:.15,sep:1.6,ali:.1,coh:0,
        seek:1,orbit:.9,orbitRadius:1.6,orbitSpeed:.2,orbitJitter:.4,orbitBand:.7,curiosity:.004,
        trail:.7,deposit:.006,carryDeposit:.015,energyDeposit:0,flow:.35,push:.02,avoid:0,wander:.4,wanderJitter:.35,
        crowd:10,satiate:.001,metabolism:.0005,restBelow:.08,restRecover:.002,disturbBelow:9,life:[120,320],fade:3.5,respawn:[2,8],
        respond:{explore:1.4,activity:1.1,current:.8,gather:.8}}];
    // Vesicles' clouds part around a sentinel; glia keep clear of one passing through their domains (and it of them).
    const relations=[[null,null,{avoid:.5,radius:2}],[null,null,{avoid:.9,radius:1.5}],[{avoid:.3,radius:2},null,null]];
    return {capacity,trail:TRAIL_K,bounds:{min:[-B,-YB,-B],max:[B,YB,B]},
      field:{nx:NX,nz:NX,decay:{trail:.995,energy:.993,disturb:.985,flow:.975},diffuse:{trail:.1,energy:.08,disturb:.1,flow:.12},saturate:{trail:4,energy:4,disturb:3,flow:1.5},advect:.8},
      species,relations,hooks:makeHooks()};
  }
  return {id:'synaptic-storm',version:1,ecosystem,habitat,siteOf,capacity,trail:TRAIL_K};
}
// ---- Presentation helper: the anchors of the ecosystem's sites (reads the ecosystem, never writes it) ---------------
// For entity i: the anchor it works beside (the one its own steering uses), in the ecosystem's frame; false when it has
// none (not at a site, or the site has no anchors). A pure function of the state and the habitat's data.
export function createAnchors(){
  let ids=null,data=null;const AX=new Float32Array(64*ANCHORS*3),AN=new Uint8Array(64);
  function prep(eco){const S=eco.sites;if(S.ids===ids&&eco.siteData===data)return;ids=S.ids;data=eco.siteData;AN.fill(0);
    const A=data?.anchors||{};for(let k=0;k<S.count;k++){const a=A[ids[k]];if(!a)continue;const n=Math.min(ANCHORS,a.length/3|0);AN[k]=n;for(let j=0;j<n*3;j++)AX[k*ANCHORS*3+j]=a[j];}}
  return {of(eco,i,out){prep(eco);const k=eco.tgt[i];if(k<0||k>=eco.sites.count||!AN[k])return false;const j=Math.floor(eco.fa[i*2+1]*AN[k])%AN[k],o=(k*ANCHORS+j)*3;
    out[0]=AX[o];out[1]=AX[o+1];out[2]=AX[o+2];return true;},
    count(eco,k){prep(eco);return k>=0&&k<64?AN[k]:0;}};
}

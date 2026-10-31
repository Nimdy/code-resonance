// Synaptic Storm's layout (preview): which neuron each file is a dendrite of, where each subsystem's cluster and each
// neuron sit at a moment, the dendrite tree each file grows and the beat grid of spontaneous firing, as pure functions
// of a model and a time (no rendering, no THREE). The world draws it; tests/synaptic.test.js pins it.
//
//  - subsystem (district) -> a cluster of neurons; its first neuron is the hub, the others sit on a golden spiral
//    around it (a neuron's place depends only on its index, so a cluster never reshuffles as it grows)
//  - file (module)        -> a dendrite branch of a neuron: a subsystem's files, in creation order, fill neurons of K
//    branches each (a file never changes neuron); the branch is a recursive tree seeded by the file, grown outward as
//    far as its symbols reach
//  - dependency           -> an axon from the importing file's neuron to a synapse on the imported file's branch
//  - clusters             -> a force layout over the real cross-subsystem dependencies (springs), anchored on the
//    stable site plan (engine/layout.js) so a new subsystem nudges the network instead of reshuffling it; cached per
//    structural signature and eased for 3.2 s after each change
const TAU=Math.PI*2,SQRT3=Math.sqrt(3),GOLD=Math.PI*(3-Math.sqrt(5));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
export function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rand(seed){let t=(seed>>>0)+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
// Small vector arithmetic on [x, y, z].
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sc=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
function basis(d){const u=norm(cross(Math.abs(d[1])<.9?[0,1,0]:[1,0,0],d));return [u,cross(d,u)];}
// A direction `ang` away from d, turned `around` it.
function tilt(d,ang,around){const [u,v]=basis(d),c=Math.cos(ang),s=Math.sin(ang);return norm(add(sc(d,c),add(sc(u,s*Math.cos(around)),sc(v,s*Math.sin(around)))));}
// The recipe's layout constants.
export function layoutConfig(recipe){
  const G=recipe?.genome||{},geo=G.geometry||{},spc=G.space||{};
  return {seed:(recipe?.projectSeed>>>0)||1,K:Math.round(clamp(num(geo.filesPerNeuron,5),2,10)),CLUSTER:clamp(num(geo.clustering,1),.3,2),
    DENDRITE:clamp(num(geo.dendrites,1),.4,1.8),ANGLE:clamp(num(geo.branchAngle,.55),.15,1.2),CURL:clamp(num(geo.curl,.35),0,1.2),SOMA:clamp(num(geo.somaSize,1),.5,1.8),
    SPREAD:clamp(num(spc.spread,1),.6,1.6),DEPTH:clamp(num(spc.depth,.7),.15,1.4),LEVELS:num(G.limits?.detail,1)<.62?4:5};
}
// Where a neuron sits in its cluster (index k): the hub at the centre, the others on a golden spiral, flattened by depth.
export function neuronOffset(cluster,k,cfg){
  if(k===0)return [0,0,0];
  const h=hash(`${cluster}#${k}`),c=hash(cluster),r=7*cfg.CLUSTER*Math.sqrt(k)*(.84+.32*rand(h));
  const u=((k*.6180339887+rand(c+7))%1)*2-1,a=k*GOLD+rand(c)*TAU,s=Math.sqrt(1-u*u);
  return [Math.cos(a)*s*r,u*r*.8*cfg.DEPTH,Math.sin(a)*s*r];
}
// The direction a neuron's branch j leaves the soma: K points of a Fibonacci sphere, turned per neuron.
export function slotDirection(neuron,j,K){
  const h=hash(neuron),z=1-2*(j+.5)/Math.max(1,K),s=Math.sqrt(Math.max(0,1-z*z)),a=j*GOLD+rand(h)*TAU;
  const v=[Math.cos(a)*s,z,Math.sin(a)*s],t=rand(h+1)*TAU,p=(rand(h+2)-.5)*1.4;
  const y=[v[0]*Math.cos(t)-v[2]*Math.sin(t),v[1],v[0]*Math.sin(t)+v[2]*Math.cos(t)];
  return norm([y[0],y[1]*Math.cos(p)-y[2]*Math.sin(p),y[1]*Math.sin(p)+y[2]*Math.cos(p)]);
}
// A file's dendrite: a recursive tree in the soma's frame, seeded by the file id. Segments carry their distance from the
// soma along the branch (d0, d1); `sites` are the boutons (branch ends and spines, nearest first) that symbols light;
// `reach` is the farthest distance. Its shape never depends on how many symbols the file has: growth reveals it.
export function dendriteTree(id,dir,cfg){
  const r=rng(hash(`dendrite/${id}`)),segs=[],sites=[],L=cfg.LEVELS;
  const L0=4*cfg.DENDRITE*(.85+.3*r()),R0=.21*(.9+.2*r());
  // A branch bends along a smooth arc (one bend direction, a little noise), tapering as it goes.
  function branch(p,d,len,rad,level,dist){
    const n=level<2?4:3,step=len/n,around=r()*TAU,bend=cfg.CURL*.2*(.3+r());let q=p,dd=d;
    for(let s=0;s<n;s++){
      dd=tilt(dd,bend*(.6+.8*r()),around+(r()-.5)*.9);const b=add(q,sc(dd,step));
      segs.push({a:q,b,ra:rad*(1-.3*s/n),rb:rad*(1-.3*(s+1)/n),d0:dist+step*s,d1:dist+step*(s+1),level});
      if(s===1&&level>0)sites.push({p:b,d:dist+step*2,tip:false,level});
      q=b;}
    const end=dist+len;sites.push({p:q,d:end,tip:level>=L-1,level});
    if(level>=L-1)return end;
    const kids=level===0&&r()<.4?3:2,phase=r()*TAU;let reach=end;
    for(let c=0;c<kids;c++){const nd=tilt(dd,cfg.ANGLE*(.7+.6*r()),phase+c*TAU/kids+(r()-.5)*.7);
      reach=Math.max(reach,branch(q,nd,len*(.68+.14*r()),rad*.62,level+1,end));}
    return reach;
  }
  const reach=branch([0,0,0],dir,L0,R0,0,0);
  sites.sort((a,b)=>a.d-b.d||a.level-b.level);
  return {segs,sites,reach};
}
// The beats (integers on the performance clock's beat grid, at or before `beat`) of a neuron's two latest spontaneous
// firings: each beat fires with probability p(k), seeded by the neuron and the beat. Null when none in `scan` beats.
export function spontaneous(seed,beat,p,scan=64){
  let a=null;const P=typeof p==='function'?p:()=>p;
  for(let k=beat;k>beat-scan;k--){if(rand((seed^Math.imul(k|0,0x9e3779b1))>>>0)<P(k)){if(a===null)a=k;else return [a,k];}}
  return [a,null];
}
export function createLayout(cfg){
  const {K,CLUSTER,SPREAD,DEPTH,DENDRITE}=cfg;
  const caches=new WeakMap(),cacheOf=model=>{let c=caches.get(model);if(!c){c=new Map();caches.set(model,c);}return c;};
  const aliveAt=(model,x,t)=>model.bornAt(x)<=t&&(x.removed===null||x.removed>t);
  function districtsAt(model,t){return [...model.districts.values()].filter(d=>model.districtBorn(d)<=t).sort((a,b)=>a.order-b.order||(a.id<b.id?-1:1));}
  // A district's neurons at t: its files born by t in creation order, K per neuron (a file keeps its neuron and slot:
  // only files born before it count). A neuron exists while one of its files is alive (or still fading out).
  function neuronsOf(model,d,t){
    const ms=[];for(const id of d.members){const m=model.modules.get(id);if(m&&model.bornAt(m)<=t)ms.push(m);}
    ms.sort((a,b)=>a.order-b.order||(a.id<b.id?-1:1));
    const list=[];ms.forEach((m,rank)=>{const k=Math.floor(rank/K);let n=list[k];if(!n)list[k]=n={id:`${d.id}#${k}`,cluster:d.id,k,files:[],slots:[],live:0};
      if(model.alive(m,t)){n.files.push(m.id);n.slots.push(rank%K);}if(aliveAt(model,m,t))n.live++;});
    return list.filter(n=>n&&n.files.length);
  }
  const clusterRadius=ns=>{const kmax=Math.max(0,...ns.filter(n=>n.live).map(n=>n.k));return 7*CLUSTER*Math.sqrt(kmax)*1.12+8.5*DENDRITE+1.6;};
  // The cross-subsystem dependencies at t, per pair of clusters, quantized (log2) so a single new import rarely moves
  // the network.
  function weightsOf(model,t,index){
    const c=new Map();
    for(const l of model.links.values()){if(!aliveAt(model,l,t))continue;const a=model.modules.get(l.a),b=model.modules.get(l.b);if(!a||!b||a.group===b.group)continue;
      const i=index.get(a.group),j=index.get(b.group);if(i===undefined||j===undefined)continue;const key=i<j?`${i}|${j}`:`${j}|${i}`;c.set(key,(c.get(key)||0)+1);}
    return [...c].map(([k,n])=>{const [i,j]=k.split('|').map(Number);return [i,j,Math.round(Math.log2(1+n)*2)/2];}).sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
  }
  // Force layout: short-range repulsion (overlap-aware), springs along dependencies, a pull toward the site plan, the
  // vertical squeezed by depth. A fixed number of steps in a fixed order: a pure function of its inputs.
  function relax(list,W){
    const n=list.length,Rm=list.reduce((a,c)=>a+c.R,0)/Math.max(1,n),U=Rm*2.6/(7*SQRT3);
    const pos=list.map(c=>[(SQRT3*c.q+SQRT3/2*c.r)*U,(rand(hash(c.id)+3)-.5)*Rm*2.2*DEPTH,1.5*c.r*U]),anchor=pos.map(p=>p.slice());
    if(n>1){const iters=n>60?70:n>25?110:150;
      for(let it=0;it<iters;it++){const step=.14*(1-it/iters)+.025,F=pos.map(()=>[0,0,0]);
        for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const dx=pos[j][0]-pos[i][0],dy=pos[j][1]-pos[i][1],dz=pos[j][2]-pos[i][2],d=Math.hypot(dx,dy,dz)||1e-3;
          const min=(list[i].R+list[j].R)*.8*SPREAD;if(d<min*1.5){const f=(min*1.5-d)/d*.5;F[i][0]-=dx*f;F[i][1]-=dy*f;F[i][2]-=dz*f;F[j][0]+=dx*f;F[j][1]+=dy*f;F[j][2]+=dz*f;}}
        for(const [i,j,w] of W){const dx=pos[j][0]-pos[i][0],dy=pos[j][1]-pos[i][1],dz=pos[j][2]-pos[i][2],d=Math.hypot(dx,dy,dz)||1e-3;
          const f=(d-(list[i].R+list[j].R)*.85*SPREAD)/d*.07*w;F[i][0]+=dx*f;F[i][1]+=dy*f;F[i][2]+=dz*f;F[j][0]-=dx*f;F[j][1]-=dy*f;F[j][2]-=dz*f;}
        for(let i=0;i<n;i++){const p=pos[i];F[i][0]+=(anchor[i][0]-p[0])*.02;F[i][1]+=(anchor[i][1]-p[1])*.02-p[1]*.03*(1.5-DEPTH);F[i][2]+=(anchor[i][2]-p[2])*.02;
          const m=Math.hypot(...F[i]),cap=Rm*.5;const k=m>cap?cap/m:1;p[0]+=F[i][0]*step*k;p[1]+=F[i][1]*step*k;p[2]+=F[i][2]*step*k;}}}
    const c=[0,1,2].map(a=>pos.reduce((s,p)=>s+p[a],0)/Math.max(1,n));
    return pos.map(p=>[p[0]-c[0],p[1]-c[1],p[2]-c[2]]);
  }
  function layoutState(model,t){
    const ds=districtsAt(model,t),list=[],index=new Map();
    for(const d of ds){const ns=neuronsOf(model,d,t);if(!ns.length)continue;index.set(d.id,list.length);list.push({id:d.id,q:d.q,r:d.r,core:d.core,neurons:ns,R:clusterRadius(ns)});}
    const W=weightsOf(model,t,index);
    const sig=list.map(c=>`${c.id}:${c.R.toFixed(1)}`).join(',')+'/'+W.map(w=>w.join(':')).join(',');
    const cache=cacheOf(model);let P=cache.get(sig);
    if(!P){P=relax(list,W);cache.set(sig,P);if(cache.size>24)cache.delete(cache.keys().next().value);}
    return {list,P,W};
  }
  // The latest structural change at or before t (a file or a dependency born or removed): the layout eases from its state
  // just before it.
  const BLEND=3200;
  function lastChange(model,t){let tc=-Infinity;const see=x=>{const b=model.bornAt(x);if(b<=t&&b>tc)tc=b;if(x.removed!==null&&x.removed<=t&&x.removed>tc)tc=x.removed;};
    for(const m of model.modules.values())see(m);for(const l of model.links.values())see(l);return tc;}
  function clustersAt(model,t,depth=0){
    const {list,P,W}=layoutState(model,t),pos=new Map(list.map((c,i)=>[c.id,P[i].slice()]));
    const tc=lastChange(model,t);
    if(depth<4&&Number.isFinite(tc)&&t-tc<BLEND){const prev=clustersAt(model,tc-1,depth+1),k=smooth((t-tc)/BLEND);
      for(const [id,p] of pos){const q=prev.pos.get(id);if(q)for(let a=0;a<3;a++)p[a]=lerp(q[a],p[a],k);}}
    return {list,pos,W};
  }
  // The network at t: clusters (position, radius, neurons), neurons (position, files and their branch slots), the file ->
  // neuron map, the centre and the radius that frames it. `settled`: where the layout of this structure comes to rest,
  // without the easing from the previous one (the digital life's habitat; the world draws the eased network).
  function networkAt(model,t,settled=false){
    const {list,pos,W}=clustersAt(model,t,settled?4:0),clusters=[],neurons=[],fileNeuron=new Map();
    for(const c of list){const p=pos.get(c.id),cl={id:c.id,pos:p,R:c.R,core:c.core,neurons:[]};clusters.push(cl);
      for(const n of c.neurons){const o=neuronOffset(c.id,n.k,cfg),x={id:n.id,cluster:c.id,k:n.k,pos:[p[0]+o[0],p[1]+o[1],p[2]+o[2]],files:n.files,slots:n.slots,live:n.live,index:neurons.length};
        neurons.push(x);cl.neurons.push(x);n.files.forEach((f,i)=>fileNeuron.set(f,{neuron:x,slot:n.slots[i]}));}}
    // The centre is weighted by neurons (where the network is), the radius frames every cluster.
    const W2=clusters.reduce((s,c)=>s+c.neurons.length,0)||1,center=[0,1,2].map(a=>clusters.reduce((s,c)=>s+c.pos[a]*c.neurons.length,0)/W2);
    let radius=12;for(const c of clusters)radius=Math.max(radius,Math.hypot(c.pos[0]-center[0],c.pos[1]-center[1],c.pos[2]-center[2])+c.R);
    return {clusters,neurons,fileNeuron,center,radius,weights:W};
  }
  // A neuron's soma radius from its live files and their symbols (eased in as they are born).
  function somaRadius(model,n,t){let w=0;for(const id of n.files){const m=model.modules.get(id);if(!m||!aliveAt(model,m,t))continue;
      w+=(1+Math.min(30,model.symbolsAt(m,t))/8)*smooth((t-model.bornAt(m))/2400);}
    return cfg.SOMA*(.5+.2*Math.log2(1+w))*(n.k===0?1.22:1);}
  return {cfg,aliveAt,districtsAt,neuronsOf,layoutState,clustersAt,networkAt,lastChange,somaRadius};
}

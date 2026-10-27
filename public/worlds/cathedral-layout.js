// Machine Cathedral: the pure layout of the city, a function of the world model and the recipe's genome only (no
// rendering, no THREE). The world (cathedral.js) builds its geometry from it, and its digital life (life/cathedral.js)
// derives the navigable network of its inhabitants from the same function on the shadow model, so the routes always
// match the stone: precincts pushed apart by canals, their foundation ellipses, towers on their plots (radius, mass,
// storeys, landmark rank), the floor channels inside a precinct and the cables between precincts.
//
// The arithmetic is the world's own, in the same order (plain numbers instead of vectors give the same doubles), so the
// rendered city is byte-identical to the one built before this module existed.
export const SQRT3=Math.sqrt(3);
// Storey proportions per symbol kind (height, radius factor, facade look).
export const KINDS={function:{h:.46,r:1,look:0},method:{h:.38,r:.97,look:0},class:{h:.7,r:1.06,look:1},'ui.component':{h:.62,r:1.03,look:2},interface:{h:.4,r:.95,look:3},type:{h:.34,r:.93,look:3},variable:{h:.2,r:.98,look:9}};
export const ARCH={gothic:{sides:8,r:.35,id:0},brutalist:{sides:4,r:.44,id:1},deco:{sides:4,r:.38,id:2},spire:{sides:8,r:.3,id:3}};
// The same hash and seeded random as core.js (kept here so the module has no rendering dependency).
export function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rand(seed){let t=(seed>>>0)+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// The genome's layout parameters (defaults as the world reads them).
export function layoutOptions(G={}){
  const g=G.geometry||{},archName=ARCH[g.architecture]?g.architecture:'gothic';
  return {archName,A:ARCH[archName],
    S:1.22*(Number.isFinite(G.space?.spread)?G.space.spread:1),streetK:Number.isFinite(G.space?.streets)?G.space.streets:1,
    setback:Number.isFinite(g.setback)?g.setback:.15,spireK:Number.isFinite(g.spire)?g.spire:.6,buttressK:Number.isFinite(g.buttress)?g.buttress:.5};
}
export const plotX=(q,r,S)=>(SQRT3*q+SQRT3/2*r)*S,plotZ=(q,r,S)=>1.5*r*S;
export const symTotal=m=>Object.entries(m.counts||{}).filter(([x])=>x!=='api.route'&&x!=='property').reduce((a,[,v])=>a+v,0);
// Precincts: raw centroids first, then canals: each precinct is pushed out from the city's centre, so wide dark mirror
// canals separate them; then the principal axis and extents of its foundation ellipse (rx, rz along angle ang).
export function precincts(model,o){
  const S=o.S,raw=[];let cx=0,cz=0,cw=0;
  for(const d of [...model.districts.values()].filter(d=>d.members.length).sort((a,b)=>a.order-b.order)){
    const members=d.members.map(id=>model.modules.get(id)).filter(Boolean);if(!members.length)continue;
    const pts=members.map(m=>({x:plotX(m.q,m.r,S),z:plotZ(m.q,m.r,S)}));const c={x:0,z:0};for(const p of pts){c.x+=p.x;c.z+=p.z;}const k=1/pts.length;c.x*=k;c.z*=k;
    raw.push({d,members,pts,c});const w=Math.sqrt(members.length);cx+=c.x*w;cz+=c.z*w;cw+=w;}
  if(cw){cx/=cw;cz/=cw;}
  const canal=.32*o.streetK,out=[];
  for(const {d,members,pts,c} of raw){
    const off={x:(c.x-cx)*canal,z:(c.z-cz)*canal};for(const p of pts){p.x+=off.x;p.z+=off.z;}c.x+=off.x;c.z+=off.z;
    let sxx=0,szz=0,sxz=0;for(const p of pts){const x=p.x-c.x,z=p.z-c.z;sxx+=x*x;szz+=z*z;sxz+=x*z;}
    const ang=.5*Math.atan2(2*sxz,sxx-szz);const ca=Math.cos(ang),sa=Math.sin(ang);let ex=0,ez=0;
    for(const p of pts){const x=p.x-c.x,z=p.z-c.z;ex=Math.max(ex,Math.abs(x*ca+z*sa));ez=Math.max(ez,Math.abs(-x*sa+z*ca));}
    const rx=Math.max(1.7,(ex+1.2*S)*1.1),rz=Math.max(1.7,(ez+1.2*S)*1.1);
    out.push({d,members,pts,c,off,ang,ex,ez,rx,rz});}
  return out;
}
// The nave of a precinct (a long gabled hall along its axis): length, width, wall and roof heights.
export function naveOf(p,o){
  const S=o.S,len=Math.max(1.5,2*p.ex*.92+.5*S),wid=Math.min(.95*S,Math.max(.8,p.ez*1.1+.6)),wall=Math.min(1.05,.42+.12*Math.log2(1+p.members.length));
  const roof=o.archName==='brutalist'?.05:o.archName==='deco'?wid*.5:wid*.66;return {len,wid,wall,roof};
}
// Towers: one per module of a standing precinct, in the model's order, with the hierarchy (each precinct's landmark,
// the city's grand spires, the low carpet of a large precinct), mass, radius and the storeys shown.
export function towerPlans(model,o,offsets){
  const S=o.S,arch=o.archName,A=o.A,landmark=new Map();let maxT=1;
  for(const m of model.modules.values()){if(m.removed!==null)continue;const t=symTotal(m);maxT=Math.max(maxT,t);const best=landmark.get(m.group);if(!best||t>symTotal(best)||t===symTotal(best)&&m.id<best.id)landmark.set(m.group,m);}
  const alive=[...model.modules.values()].filter(m=>m.removed===null);const rankIn=new Map(),byGroup=new Map();
  for(const m of alive){if(!byGroup.has(m.group))byGroup.set(m.group,[]);byGroup.get(m.group).push(m);}
  for(const l of byGroup.values()){l.sort((a,b)=>symTotal(b)-symTotal(a)||(a.id<b.id?-1:1));l.forEach((m,k)=>rankIn.set(m.id,k));}
  const greatsAll=[...landmark.values()].filter(m=>symTotal(m)>=4).sort((a,b)=>symTotal(b)-symTotal(a)||(a.id<b.id?-1:1));
  const grandN=clamp(Math.round(1.2+Math.sqrt(greatsAll.length)*.8),1,5);const grand=new Set(greatsAll.slice(0,grandN).map(m=>m.id));
  const grandK=smooth((alive.length-25)/220);
  const out=[];
  for(const m of [...model.modules.values()].sort((a,b)=>a.order-b.order)){
    const off=offsets.get(m.group);if(!off)continue;
    const x=plotX(m.q,m.r,S)+off.x,z=plotZ(m.q,m.r,S)+off.z;
    const syms=[...m.symbols].map(id=>model.symbols.get(id)).filter(s=>s&&KINDS[s.kind]).sort((a,b)=>a.slot-b.slot||a.id.localeCompare(b.id));
    const great=landmark.get(m.group)===m&&symTotal(m)>=4,isGrand=great&&grand.has(m.id);
    const carpet=!great&&(byGroup.get(m.group)?.length||0)>8&&(rankIn.get(m.id)??0)>=6;
    const shown=syms.slice(0,carpet?3:16);const total=symTotal(m);
    const mass=.62+.88*Math.pow(clamp(Math.log2(1+total)/Math.log2(1+maxT)),1.6);const hk=mass*(isGrand?1.22+.6*grandK:great?1.22:carpet?.6:1);
    const R0=A.r*(.9+.28*Math.min(1,total/12))*(m.test?.92:1)*(isGrand?1.25:great?1.15:carpet?1.4:1);const sd=rand(hash(m.id));
    out.push({m,x,z,syms,great,isGrand,carpet,shown,total,hk,R0,sd,grandK});
  }
  return out;
}
// A storey's height (the world's own expression).
export const storeyH=(kind,hk,arch)=>KINDS[kind].h*hk*(arch==='gothic'?1.2:arch==='spire'?1.28:1.05);
// The tower's footprint: the radius nothing may enter below its roof (plinth, buttress piers, brutalist columns).
export function footprint(tp,o){
  const N=tp.shown.length,gothicLike=o.archName==='gothic'||o.archName==='spire';let r=tp.R0*1.5;
  if(gothicLike&&N>=5&&!tp.carpet&&tp.sd<o.buttressK+.15)r=Math.max(r,tp.R0*1.9+.12);
  if(o.archName==='brutalist'&&N>=3&&!tp.carpet)r=Math.max(r,tp.R0*(1.12+.62*2)+tp.R0*.36*1.42);
  return r;
}
// The height of a tower's body (where its roof begins) once everything born by time t stands (the world's stacking
// without the assembly animation): plinth, the storeys shown, the band of the rest, or a chapel.
export function towerTop(model,tp,t,o){
  const m=tp.m,born=x=>model.bornAt(x)<=t,gone=x=>x.removed!==null&&x.removed<=t;
  if(!born(m)||gone(m))return 0;
  let y=.24,N=tp.shown.length;
  for(const s of tp.shown)if(born(s)&&!gone(s))y+=storeyH(s.kind,tp.hk,o.archName);
  const extra=tp.total-N;
  if(extra>0)y+=Math.min(.9,.14*Math.log2(1+extra))*tp.hk;
  if(!N&&extra<=0)y+=.32;
  return Math.max(.3,y);
}
// Dependencies: channels inside a precinct (the latest 900) and one cable per pair of precincts (the most-linked 24
// pairs, each by its oldest link), with each cable's anchor height factors.
export function linkPlans(model,districtOf){
  const all=[...model.links.values()].filter(l=>districtOf.has(l.a)&&districtOf.has(l.b));const internal=all.filter(l=>!l.cross).slice(-900);
  const pairs=new Map();for(const l of all.filter(l=>l.cross)){const key=[districtOf.get(l.a),districtOf.get(l.b)].sort().join('|');if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(l);}
  const plist=[...pairs.entries()].sort((x,y)=>y[1].length-x[1].length||(x[0]<y[0]?-1:1)).slice(0,24);
  const bridges=[];
  for(const [,ls] of plist){ls.sort((x,y)=>(model.bornAt(x)-model.bornAt(y))||rand(hash(x.key))-rand(hash(y.key)));const kk=Math.min(2,1+.3*Math.log2(ls.length));const l=ls[0];
    bridges.push({l,k:kk,ha:.55+.35*rand(hash(l.key+'a')),hb:.55+.35*rand(hash(l.key+'b'))});}
  return {internal,bridges};
}
// A cable's anchor heights and sag (the world draws it from tower a at ya to tower b at yb, sagging by `sag` mid-span).
export function cableShape(br,ax,az,topA,bx,bz,topB){
  const ya=Math.max(.8,topA*(.62+.4*br.ha)),yb=Math.max(.8,topB*(.62+.4*br.hb)),d=Math.sqrt((bx-ax)*(bx-ax)+(bz-az)*(bz-az));return {ya,yb,sag:d*.06,d};
}
// The height below which a tower's outworks stand around it (gothic buttress piers with their pinnacles and flying
// buttresses, brutalist columns): above it, the wall itself (radius wallR) is the outermost stone.
export function partsTop(tp,top,o){
  const N=tp.shown.length,gothicLike=o.archName==='gothic'||o.archName==='spire',base=.24;
  if(gothicLike&&N>=5&&!tp.carpet&&tp.sd<o.buttressK+.15){const H=Math.max(.5,(top-base)*.3),y0=base+H+.2,y1=Math.min(top-.1,y0+(top-y0)*.3+.2);return Math.max(y1,base+H+.34);}
  if(o.archName==='brutalist'&&N>=3&&!tp.carpet)return base+Math.max(.5,(top-base)*.82);
  return base;
}
export const wallR=tp=>tp.R0*1.1;
// The orientation of the towers' prisms (the world's frustum of `sides` faces turned by axisAz + pi / sides): n faces,
// v0 the direction (atan2(z, x)) of a vertex; the faces' normals lie half-way between the vertices.
export const prismOf=(o,axisAz)=>({n:o.A.sides,v0:Math.PI/2-axisAz-Math.PI/o.A.sides});
// The stone profile of a tower at time t (the world's stack without the assembly animation): the plinth, each storey
// born and standing (its stage's setback and its kind's girth), the band of the rest or a chapel, as prisms
// [{y0, y1, r}] (r: the circumradius at the foot, the widest), and the pinnacles standing on each setback's ledge
// [{x, z, r, y0, y1}]. Its height is towerTop's.
export function towerProfile(model,tp,t,o){
  const m=tp.m,born=x=>model.bornAt(x)<=t,gone=x=>x.removed!==null&&x.removed<=t,arch=o.archName,R0=tp.R0,out=[],pins=[];
  if(!born(m)||gone(m))return {segs:out,pins};
  const gothicLike=arch==='gothic'||arch==='spire',stageN=arch==='spire'?4:3,stepK=.05+.3*o.setback,rf=j=>Math.max(.55,1-stepK*Math.floor(j/stageN));
  const rot=(o.axisAz||0)+Math.PI/o.A.sides,N=tp.shown.length;
  out.push({y0:0,y1:.24,r:R0*1.5});let y=.24,prevR=0;
  tp.shown.forEach((s,j)=>{const K=KINDS[s.kind],rb=R0*K.r*rf(j);
    if(j>0&&j%stageN===0&&arch!=='brutalist'&&!tp.carpet&&prevR>0){const st=Math.floor(j/stageN),rr=prevR*(arch==='gothic'?.985:1)*.96;
      for(let q=0;q<4;q++){const a=rot+(q+.5)/4*Math.PI*2+(o.A.sides===8?Math.PI/8:Math.PI/4);pins.push({x:tp.x+Math.cos(a)*rr,z:tp.z+Math.sin(a)*rr,r:.045+.01*st,y0:y-.05,y1:y+.2+.05*st});
        if(gothicLike&&N>=6)for(const sgn of [-1,1]){const a2=a+sgn*.32;pins.push({x:tp.x+Math.cos(a2)*rr*.98,z:tp.z+Math.sin(a2)*rr*.98,r:.025,y0:y-.05,y1:y+.11+.02*st});}}}
    if(born(s)&&!gone(s)){const h=storeyH(s.kind,tp.hk,arch);out.push({y0:y,y1:y+h,r:rb});y+=h;}
    prevR=rb;});
  const extra=tp.total-N,topR=N?R0*KINDS[tp.shown[N-1].kind].r*rf(N-1)*(arch==='gothic'?.985:1):R0;
  if(extra>0){const h=Math.min(.9,.14*Math.log2(1+extra))*tp.hk;out.push({y0:y,y1:y+h,r:topR*.98});y+=h;}
  if(!N&&extra<=0){out.push({y0:y,y1:y+.32,r:R0*.9});y+=.32;}
  return {segs:out,pins,top:Math.max(.3,y),topR};
}
// The solid stone of a standing tower once complete (for its inhabitants' routes and their clearance tests): vertical
// cylinders {x,z,r,y0,y1} (plinth, the body up to its roof's foot with the roof's pinnacles, buttress piers, brutalist
// columns) and capsules {a:[x,y,z],b:[x,y,z],r} (flying buttresses: pier top, arch crown, wall). axisAz: the world's
// processional axis (its towers' orientation); ang: the precinct's axis.
// prof (optional, towerProfile): the body as its stacked prisms (each {x, z, r, y0, y1, n, f}: f the direction of a
// face's normal) with the setback pinnacles, and the roof's foot above it, instead of one cylinder of the widest girth.
export function solidsOf(tp,top,o,axisAz,ang,prof=null){
  const N=tp.shown.length,R0=tp.R0,x=tp.x,z=tp.z,gothicLike=o.archName==='gothic'||o.archName==='spire',base=.24,out=[];
  if(prof&&prof.segs.length){const P=prismOf(o,axisAz),f=P.v0+Math.PI/P.n;
    prof.segs.forEach((g,k)=>out.push({x,z,r:g.r,y0:k?g.y0:-1,y1:g.y1,n:P.n,f}));
    for(const p of prof.pins)out.push({x:p.x,z:p.z,r:p.r,y0:p.y0,y1:p.y1});
    // The roof's foot (lantern, gablets, pinnacles round it).
    out.push({x,z,r:prof.topR*1.08+.04,y0:top-.03,y1:top+.7});}
  else{out.push({x,z,r:R0*1.5,y0:-1,y1:base});
    out.push({x,z,r:R0*1.1,y0:-1,y1:top+.7});}
  if(gothicLike&&N>=5&&!tp.carpet&&tp.sd<o.buttressK+.15){const SIDES=o.A.sides,rot=axisAz+Math.PI/SIDES,H=Math.max(.5,(top-base)*.3),off=R0*1.9,rw=R0*.95;
    for(let j=0;j<4;j++){const a=rot+(j+.5)/4*Math.PI*2+(SIDES===8?Math.PI/8:0),ca=Math.cos(a),sa=Math.sin(a);
      out.push({x:x+ca*off,z:z+sa*off,r:.12,y0:-1,y1:base+H+.34,angle:a});
      const y0=base+H+.2,y1=Math.min(top-.1,y0+(top-y0)*.3+.2),w=(off-rw)*.5+.05,P=[x+ca*off,y0,z+sa*off],Q=[x+ca*rw,y1,z+sa*rw],M=[(P[0]+Q[0])/2,(P[1]+Q[1])/2+w,(P[2]+Q[2])/2];
      out.push({a:P,b:M,r:.09,angle:a},{a:M,b:Q,r:.09,angle:a});}}
  if(o.archName==='brutalist'&&N>=3&&!tp.carpet)for(const sgn of [-1,1])for(let q=0;q<3;q++){const off=R0*(1.12+.62*q)*sgn;
    out.push({x:x+Math.cos(ang)*off,z:z+Math.sin(ang)*off,r:R0*.36*1.42,y0:-1,y1:base+Math.max(.5,(top-base)*(.82-.2*q)),angle:sgn>0?ang:ang+Math.PI});}
  return out;
}
// Distance from point p to a solid (negative inside).
export function solidDist(s,px,py,pz){
  if(s.a){const [ax,ay,az]=s.a,[bx,by,bz]=s.b,dx=bx-ax,dy=by-ay,dz=bz-az,L2=dx*dx+dy*dy+dz*dz;let u=L2>0?((px-ax)*dx+(py-ay)*dy+(pz-az)*dz)/L2:0;u=u<0?0:u>1?1:u;
    const ex=ax+dx*u-px,ey=ay+dy*u-py,ez=az+dz*u-pz;return Math.sqrt(ex*ex+ey*ey+ez*ez)-s.r;}
  const dx=px-s.x,dz=pz-s.z,hd=Math.sqrt(dx*dx+dz*dz),v=py<s.y0?s.y0-py:py>s.y1?py-s.y1:0;let h=hd-s.r;
  // A prism: the distance to the plane of its nearest face (exact on a face, less near an edge: never more).
  if(s.n&&h<.4){const k=2*Math.PI/s.n;let a=Math.atan2(dz,dx)-s.f;a-=Math.round(a/k)*k;h=hd*Math.cos(a)-s.r*Math.cos(Math.PI/s.n);}
  return v>0?(h>0?Math.hypot(h,v):v):h;
}

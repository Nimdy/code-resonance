// Temporal Terrain's roads: the present's dependencies between subsystems as paths in the land, pure functions of the
// layout (no rendering, no THREE). The world draws them into the land (a light map its shader reads, so a road lies on
// the drawn ground and the land hides it where the ground hides it) and lets agents travel along them;
// tests/terrain-roads.test.js pins them. Design brief: docs/worlds/temporal-terrain.md (Roads).
//
// A road from the importing file's ridge (a) to the imported one (b) leaves a's peak at the front edge, runs down into
// the valley beside a's range on b's side, crosses the land at a depth of its own just behind the front edge (deeper
// the farther apart its files are, so a longer road passes behind the shorter ones it spans instead of crossing them)
// and climbs from the valley beside b's range to b's peak. Between neighbouring ranges both valleys are one: the road
// dips into the valley between them. A plan is a polyline in the land's layout frame: x across (where the layout places
// files and ranges), z the depth behind the front edge (units). Roads stay within ZR of the front edge: the present.
export const ZR=18,Z0=.6,LANE_MIN=3,LANE_MAX=15;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
// The depth at which a road between files `span` units apart crosses the land.
export const laneDepth=span=>clamp(LANE_MIN+1.15*Math.sqrt(Math.max(0,span)),LANE_MIN,LANE_MAX);
// The valleys of a land: for each range (rangesAt's, in any order) the x of the valley floor on its left and right, half
// way between its outermost ridge and the facing ridge of its neighbour (beyond the outermost ranges: a range's own
// gap). Returns Map(range id -> [left, right]).
export function valleysOf(ranges,sp){
  const list=[...ranges].filter(r=>r.files.length).sort((a,b)=>a.c-b.c),out=new Map(),gap=Math.max(sp*1.6,2.5);
  const lo=r=>Math.min(...r.files.map(f=>f.x)),hi=r=>Math.max(...r.files.map(f=>f.x));
  list.forEach((r,k)=>{const L=list[k-1],R=list[k+1];
    out.set(r.id,[L?(hi(L)+lo(r))/2:lo(r)-gap,R?(hi(r)+lo(R))/2:hi(r)+gap]);});
  return out;
}
// A cubic Bezier's points (n segments) appended to pts, without its first point.
function cubic(pts,p0,p1,p2,p3,n){for(let k=1;k<=n;k++){const u=k/n,v=1-u,a=v*v*v,b=3*v*v*u,c=3*v*u*u,d=u*u*u;
  pts.push([a*p0[0]+b*p1[0]+c*p2[0]+d*p3[0],a*p0[1]+b*p1[1]+c*p2[1]+d*p3[1]]);}}
const segs=len=>Math.max(4,Math.min(24,Math.ceil(len/1.2)));
// A road's plan from a's peak (ax) to b's (bx), through va (the valley beside a's range toward b) and vb (beside b's
// range toward a): {pts: [[x, z], ...] from a to b, len (its length in plan), lane (the depth it crosses at)}.
export function roadPlan(ax,bx,va,vb){
  const s=Math.sign(bx-ax)||1,lane=laneDepth(Math.abs(bx-ax)),pts=[[ax,Z0]];
  // (a valley is always on the road's side of its file: never behind it)
  va=s>0?Math.max(va,ax+.5):Math.min(va,ax-.5);vb=s>0?Math.min(vb,bx-.5):Math.max(vb,bx+.5);if((vb-va)*s<0)va=vb=(va+vb)/2;
  const da=Math.abs(va-ax),db=Math.abs(bx-vb),drop=lane-Z0;
  cubic(pts,[ax,Z0],[ax,Z0+drop*.7],[va-s*Math.min(da*.5,4),lane],[va,lane],segs(da+drop));
  const cross=Math.abs(vb-va);if(cross>1e-6){const n=Math.max(1,Math.ceil(cross/1.2));for(let k=1;k<=n;k++)pts.push([va+(vb-va)*k/n,lane]);}
  cubic(pts,[vb,lane],[vb+s*Math.min(db*.5,4),lane],[bx,Z0+drop*.7],[bx,Z0],segs(db+drop));
  let len=0;for(let k=1;k<pts.length;k++)len+=Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]);
  return {pts,len,lane};
}
// The point at plan length s along a plan (from a; clamped to its ends) into out ([x, z]).
export function along(plan,s,out=[0,0]){const P=plan.pts;if(s<=0||P.length<2){out[0]=P[0][0];out[1]=P[0][1];return out;}
  for(let k=1;k<P.length;k++){const dx=P[k][0]-P[k-1][0],dz=P[k][1]-P[k-1][1],d=Math.hypot(dx,dz);if(s<=d||k===P.length-1){const u=d>1e-9?clamp(s/d):1;
    out[0]=P[k-1][0]+dx*u;out[1]=P[k-1][1]+dz*u;return out;}s-=d;}
  return out;}
// The roads' light map: each road a soft line (Gaussian across, sigma a quarter of a unit or most of a cell) in a
// grid of W x H cells over x in [x0, x0 + width) and z in [0, ZR); a road's own segments never add to each other where
// they meet, roads add (a busy route is brighter). roads: [{plan, alpha (0..1), drawn (the share of its length drawn
// from a)}]. acc: Float32Array(W * H) (cleared here); returns acc. Each road's stamp is kept with its plan (a plan
// object stands for one shape) and drawn again only when the plan, its drawn share or the grid changed.
let CUR=null,MARK=null;const GL=new Float32Array(257);for(let k=0;k<=256;k++)GL[k]=Math.exp(-4.5*k/256);   // exp(-d^2/2 sigma^2) by (d/3 sigma)^2
const STAMPS=new WeakMap();
function stampOf(plan,drawn,x0,width,W,H){
  const key=`${drawn}|${x0}|${width}|${W}|${H}`,old=STAMPS.get(plan);if(old?.key===key)return old;
  if(CUR?.length!==W*H){CUR=new Float32Array(W*H);MARK=new Int32Array(W*H).fill(-1);}const cur=CUR,mark=MARK,touched=[];
  const tx=width/W,tz=ZR/H,sig=Math.max(.24,.75*tx,.75*tz),R=3*sig,kq=256/(R*R),P=plan.pts,keep=plan.len*clamp(drawn);let walked=0;stampOf.n=(stampOf.n|0)+1;const id=stampOf.n;
  for(let k=1;k<P.length&&walked<keep;k++){
    // (a straight run at one depth, the crossing, is one segment: each cell is visited once)
    let k1=k;while(k1+1<P.length&&P[k1+1][1]===P[k-1][1]&&P[k1][1]===P[k-1][1])k1++;
    let ax=P[k-1][0],az=P[k-1][1],bx=P[k1][0],bz=P[k1][1];k=k1;const d=Math.hypot(bx-ax,bz-az);
    if(walked+d>keep){const u=(keep-walked)/d;bx=ax+(bx-ax)*u;bz=az+(bz-az)*u;}walked+=d;
    const j0=Math.max(0,Math.floor((Math.min(az,bz)-R)/tz)),j1=Math.min(H-1,Math.ceil((Math.max(az,bz)+R)/tz)),ex=bx-ax,ez=bz-az,ee=ex*ex+ez*ez,L=Math.sqrt(ee);
    for(let j=j0;j<=j1;j++){const z=(j+.5)*tz;
      // the row's slice of the segment's capsule (its end discs and the band between them): only those cells
      let lo=Infinity,hi=-Infinity;for(const [cx,cz] of [[ax,az],[bx,bz]]){const q=R*R-(z-cz)*(z-cz);if(q>0){const h=Math.sqrt(q);lo=Math.min(lo,cx-h);hi=Math.max(hi,cx+h);}}
      if(L>1e-9){if(Math.abs(ez)<1e-9*L){if(Math.abs(z-az)<R){lo=Math.min(lo,Math.min(ax,bx));hi=Math.max(hi,Math.max(ax,bx));}}
        else{const za=Math.max(Math.min(az,bz),z-R*Math.abs(ex)/L),zb=Math.min(Math.max(az,bz),z+R*Math.abs(ex)/L);
          if(za<=zb){const xc=ax+ex*(z-az)/ez,hw=R*L/Math.abs(ez),xa=ax+ex*(za-az)/ez,xb=ax+ex*(zb-az)/ez;lo=Math.min(lo,Math.max(xc-hw,Math.min(xa,xb)-R));hi=Math.max(hi,Math.min(xc+hw,Math.max(xa,xb)+R));}}}
      if(!(lo<=hi))continue;const i0=Math.max(0,Math.floor((lo-x0)/tx)),i1=Math.min(W-1,Math.ceil((hi-x0)/tx));
      for(let i=i0;i<=i1;i++){const x=x0+(i+.5)*tx,u=ee>1e-12?clamp(((x-ax)*ex+(z-az)*ez)/ee):0,dx=x-ax-ex*u,dz=z-az-ez*u,dd=dx*dx+dz*dz;
      if(dd>=R*R)continue;const v=GL[(dd*kq)|0],o=j*W+i;if(mark[o]!==id){mark[o]=id;cur[o]=v;touched.push(o);}else if(v>cur[o])cur[o]=v;}}}
  const idx=Int32Array.from(touched),val=new Float32Array(idx.length);for(let k=0;k<idx.length;k++)val[k]=cur[idx[k]];
  const st={key,idx,val};STAMPS.set(plan,st);return st;}
export function rasterRoads(roads,x0,width,W,H,acc){
  acc.fill(0);
  for(const r of roads){if(!(r.alpha>0)||!(r.drawn>0))continue;const {idx,val}=stampOf(r.plan,r.drawn??1,x0,width,W,H);for(let k=0;k<idx.length;k++)acc[idx[k]]+=val[k]*r.alpha;}
  return acc;
}
// A route for an agent between two files of different ranges along the roads: the ranges joined by roads (in either
// direction) searched breadth first, at most `hops` roads, in the roads' own order (so a pure function of them); on each
// hop the road whose end in the range the agent is in lies nearest to where it is. roads: [{key, a: {id, x, range},
// b: {...}}] (range: the range's id). Returns [{road, rev}] (rev: travelled from b to a) or null.
export function routeOf(roads,from,to,hops=3){
  if(!from||!to||from.range===to.range)return null;
  const prev=new Map([[from.range,null]]),q=[from.range],depth=new Map([[from.range,0]]);
  for(let h=0;h<q.length&&!prev.has(to.range);h++){const r=q[h];if(depth.get(r)>=hops)continue;
    for(const x of roads){const o=x.a.range===r?x.b.range:x.b.range===r?x.a.range:null;if(o===null||prev.has(o))continue;prev.set(o,r);depth.set(o,depth.get(r)+1);q.push(o);}}
  if(!prev.has(to.range))return null;
  const chain=[];for(let r=to.range;r!==null;r=prev.get(r))chain.unshift(r);
  const out=[];let x=from.x;
  for(let k=0;k+1<chain.length;k++){const A=chain[k],B=chain[k+1];let best=null,bd=Infinity;
    for(const r of roads){const rev=r.b.range===A&&r.a.range===B;if(!(rev||(r.a.range===A&&r.b.range===B)))continue;const s=rev?r.b:r.a,d=Math.abs(s.x-x);
      if(d<bd-1e-9){bd=d;best={road:r,rev};}}
    out.push(best);x=best.rev?best.road.a.x:best.road.b.x;}
  return out;
}

// Genesis (preview): the form at a moment, pure (no THREE, no rendering): tests/genesis.test.js pins it. Design brief:
// docs/worlds/genesis.md.
//
//  - subsystem  -> a chamber: a ball at its slot on the growth coil (genesis-laws.js slotOf, by order of birth), its
//                  radius from its live files; the structure is the union of the chambers' balls, so where two meet their
//                  walls end on one circle (a suture) and a flat wall (a septum) parts them, as in a foam
//  - new subsystem -> a chamber buds from the newest chamber's aperture and swells into its slot
//  - file       -> a chamberlet: a cell of the chamber's own foam (its files' Voronoi partition inside the chamber, never
//                  crossing its walls), around the file's seed (seedOf, by its rank in the chamber); its inner light
//  - symbols    -> the share of the chamber's pore lattice that is open
//  - dependency between chambers -> a thread from the importing file's place on its wall to the imported file's, its
//                  light flowing toward the import; adjacent chambers that share a dependency have an opening in their
//                  septum (coupling)
// The model of the moment is the host's live, or in a replay its whole recorded history (terrain-layout.js historyFrom),
// prepared once per change (prepare). Times are performance ms; durations below are view seconds (scaled by `speed`).
import {slotOf,sizeOf,seedOf,apertureOf,degreeOf,MAXC} from './genesis-laws.js';
export const BUD_S=3.2,NUCLEATE_S=2.2,FADE_S=2.4,GROW_S=1.2,THREAD_S=1.6;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const easeOut=x=>1-Math.pow(1-clamp(x),3);
const upper=(a,v)=>{let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m]<=v)lo=m+1;else hi=m;}return lo;};
const ramp=(t,at,s)=>at===-Infinity?1:!(at<Infinity)?0:smooth((t-at)/(s*1000));
// Live symbols of a prepared file at t (each symbol a soft step, so a count never jumps).
export function symbolsAt(f,t){return upper(f.sb,t)-upper(f.sr,t);}
// A prepared file's state at t, its stress (0..1, eased in and out) and its verified repairs so far (stress that ended
// in a passing run: what the walls keep as gold seams).
export function conditionOf(f,t,speed=1){
  let stress=0,heal=0,healAt=-Infinity;
  for(const [a,b] of f.stress){if(a>t)break;const on=smooth((t-a)/(600*speed)),off=b<=t?smooth((t-b)/(900*speed)):0;stress=Math.max(stress,on*(1-off));
    if(b<=t&&f.valid.some(([v])=>v===b)){heal++;healAt=b;}}
  return {stress,heal,healAt};
}
// ---- Chambers at t --------------------------------------------------------------------------------------------------------
// Every chamber present (budding, grown or fading), in order of birth, with its files. `P` = prepare(model).
export function chambersAt(P,book,t,{speed=1}={}){
  const out=[];
  for(let k=0;k<P.subs.length&&out.length<MAXC;k++){const s=P.subs[k];
    if(!(s.born<=t))continue;
    let n=0,last=-Infinity,files=[],symbols=0;
    s.files.forEach((f,j)=>{if(!(f.born<=t))return;const gone=f.removed<=t,fade=gone?1-smooth((t-f.removed)/(FADE_S*1000*speed)):1;
      if(gone)last=Math.max(last,f.removed);if(fade<=0)return;
      const grow=ramp(t,f.born,GROW_S*speed);n+=grow*(gone?fade:1);const sy=symbolsAt(f,t);symbols+=sy;
      files.push({id:f.id,j,born:f.born,removed:f.removed,alive:!gone,fade,nuc:f.born===-Infinity?1:smooth((t-f.born)/(NUCLEATE_S*1000*speed)),symbols:sy,f});});
    if(!files.length)continue;
    const alive=files.some(x=>x.alive),fade=alive?1:1-smooth((t-last)/(FADE_S*1000*speed));if(fade<=0)continue;
    const slot=slotOf(book,k),bud=s.born===-Infinity?1:easeOut((t-s.born)/(BUD_S*1000*speed));
    let c=slot.c,r=slot.rho*sizeOf(Math.max(1,n));
    // budding: out of the previous chamber's aperture, swelling into the slot
    if(bud<1&&k>0){const p=slotOf(book,k-1),ap=apertureOf(book,k-1),q=[p.c[0]+ap[0]*p.rho,p.c[1]+ap[1]*p.rho,p.c[2]+ap[2]*p.rho];
      c=[q[0]+(c[0]-q[0])*bud,q[1]+(c[1]-q[1])*bud,q[2]+(c[2]-q[2])*bud];}
    r*=(.12+.88*bud)*(.25+.75*fade);
    for(const x of files){const u=seedOf(x.j);x.local=u;x.seed=[c[0]+u[0]*r,c[1]+u[1]*r,c[2]+u[2]*r];}
    out.push({id:s.id,rank:k,slot,c,r,bud,fade,alive,n,symbols,files,degree:degreeOf(k),born:s.born});
  }
  // the newest present chamber carries the aperture (where the next will bud)
  const last=out.at(-1);if(last)last.aperture=apertureOf(book,last.rank);
  return out;
}
// The structure's centre (balls weighted by volume) and the radius that holds every chamber.
export function extentOf(chambers){
  let w=0,x=0,y=0,z=0;for(const c of chambers){const v=c.r**3;w+=v;x+=c.c[0]*v;y+=c.c[1]*v;z+=c.c[2]*v;}
  if(!w)return {center:[0,0,0],radius:60};const m=[x/w,y/w,z/w];let R=0;
  for(const c of chambers)R=Math.max(R,Math.hypot(c.c[0]-m[0],c.c[1]-m[1],c.c[2]-m[2])+c.r);
  return {center:m,radius:Math.max(20,R)};
}
// ---- Walls between chambers -------------------------------------------------------------------------------------------
// Each pair of chambers whose balls meet: their radical circle (where both walls end: the suture; the septum fills it),
// and whether a dependency couples them (an opening in the septum).
export function pairsOf(chambers,coupled=()=>0){
  const out=[];
  for(let i=0;i<chambers.length;i++)for(let j=i+1;j<chambers.length;j++){const A=chambers[i],B=chambers[j];
    const d=Math.hypot(B.c[0]-A.c[0],B.c[1]-A.c[1],B.c[2]-A.c[2]);
    if(!(d<A.r+B.r)||d<=Math.abs(A.r-B.r)+1e-6)continue;
    const a=(d*d+A.r*A.r-B.r*B.r)/(2*d),rho=Math.sqrt(Math.max(0,A.r*A.r-a*a)),n=[(B.c[0]-A.c[0])/d,(B.c[1]-A.c[1])/d,(B.c[2]-A.c[2])/d];
    out.push({i,j,a:A,b:B,center:[A.c[0]+n[0]*a,A.c[1]+n[1]*a,A.c[2]+n[2]*a],normal:n,radius:rho,coupling:coupled(A.id,B.id)});}
  return out;
}
// ---- Chamberlets: the files' foam inside a chamber ----------------------------------------------------------------------
// A convex cell is a list of faces (vertex loops); clipping keeps the half-space n.x <= d and closes the cut with a cap
// tagged `tag`. Faces carry the tag of the plane that made them: a file's index (a film between two files), or -1 (the
// chamber's own wall or septum: drawn on the GPU, never as a film).
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function clip(faces,n,d,tag,eps){
  const out=[],cut=[];
  for(const f of faces){const v=f.v,nv=[];
    for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length],da=dot(n,a)-d,db=dot(n,b)-d;
      if(da<=eps)nv.push(a);
      if((da<-eps&&db>eps)||(da>eps&&db<-eps)){const s=da/(da-db),p=[a[0]+(b[0]-a[0])*s,a[1]+(b[1]-a[1])*s,a[2]+(b[2]-a[2])*s];nv.push(p);cut.push(p);}
      else if(Math.abs(da)<=eps)cut.push(a);}
    if(nv.length>=3)out.push({v:nv,tag:f.tag});}
  if(cut.length>=3){
    const m=[0,0,0];for(const p of cut){m[0]+=p[0];m[1]+=p[1];m[2]+=p[2];}m[0]/=cut.length;m[1]/=cut.length;m[2]/=cut.length;
    const ax=Math.abs(n[0])<.9?[1,0,0]:[0,1,0],u=[n[1]*ax[2]-n[2]*ax[1],n[2]*ax[0]-n[0]*ax[2],n[0]*ax[1]-n[1]*ax[0]],ul=Math.hypot(...u);u[0]/=ul;u[1]/=ul;u[2]/=ul;
    const w=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
    const ring=cut.map(p=>{const q=[p[0]-m[0],p[1]-m[1],p[2]-m[2]];return [Math.atan2(dot(q,w),dot(q,u)),p];}).sort((x,y)=>x[0]-y[0]);
    const v=[];for(const [,p] of ring){const l=v.at(-1);if(!l||Math.hypot(p[0]-l[0],p[1]-l[1],p[2]-l[2])>eps*4)v.push(p);}
    if(v.length>2&&Math.hypot(v[0][0]-v.at(-1)[0],v[0][1]-v.at(-1)[1],v[0][2]-v.at(-1)[2])<=eps*4)v.pop();
    if(v.length>=3)out.push({v,tag});}
  return out;
}
// The films of one chamber: for each pair of neighbouring live files, the polygon of the wall between their cells, with
// the indices of the two files in `chamber.files`. `others` are the chambers whose balls meet this one (their radical
// planes bound the cells); the chamber's own ball is not a plane here: the film's shader cuts each film to it exactly
// (so the cells start from the ball's cube and stay small). Deterministic: files in chamber order, planes in a fixed order.
export function filmsOf(chamber,others=[]){
  const {c,r}=chamber,live=chamber.files.map((x,k)=>[x,k]).filter(([x])=>x.nuc>0);
  if(live.length<2)return [];
  const eps=r*1e-6;
  const base=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(p=>[c[0]+p[0]*r*1.02,c[1]+p[1]*r*1.02,c[2]+p[2]*r*1.02]);
  const Q=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,4,7,3]];
  let cell=Q.map(q=>({v:q.map(i=>base[i]),tag:-1}));
  for(const o of others){const d=Math.hypot(o.c[0]-c[0],o.c[1]-c[1],o.c[2]-c[2]);if(!(d>1e-6))continue;const n=[(o.c[0]-c[0])/d,(o.c[1]-c[1])/d,(o.c[2]-c[2])/d];
    const a=(d*d+r*r-o.r*o.r)/(2*d);cell=clip(cell,n,dot(n,c)+a,-1,eps);}
  const out=[];
  for(let a=0;a<live.length;a++){const [x,ka]=live[a],s=x.seed;let f=cell;
    const near=live.map(([y,kb],b)=>[Math.hypot(y.seed[0]-s[0],y.seed[1]-s[1],y.seed[2]-s[2]),b,y,kb]).filter(z=>z[1]!==a).sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
    const reachOf=()=>{let x=0;for(const g of f)for(const v of g.v)x=Math.max(x,(v[0]-s[0])**2+(v[1]-s[1])**2+(v[2]-s[2])**2);return Math.sqrt(x);};
    let reach=reachOf();
    for(const [dist,b,y] of near){
      // a seed farther than twice the cell's reach cannot cut it
      if(dist>2*reach)break;
      const n=[(y.seed[0]-s[0])/dist,(y.seed[1]-s[1])/dist,(y.seed[2]-s[2])/dist],m=[(y.seed[0]+s[0])/2,(y.seed[1]+s[1])/2,(y.seed[2]+s[2])/2];
      const before=f.length;f=clip(f,n,dot(n,m),b,eps);if(!f.length)break;if(f.length!==before||f.some(g=>g.tag===b))reach=reachOf();}
    for(const g of f)if(g.tag>a)out.push({a:ka,b:live[g.tag][1],v:g.v});
  }
  return out;
}
// ---- Threads: dependencies between chambers -----------------------------------------------------------------------------
// Each live dependency whose two files lie in different chambers present at t, as a curve from the importing file's
// place on its chamber's wall, lifted away from the structure, to the imported file's place on its own. `model` gives
// the links (model.js) and their times.
export function threadsAt(model,chambers,t,{speed=1,max=384,center=[0,0,0]}={}){
  const where=new Map();for(const ch of chambers)for(const f of ch.files)if(f.alive)where.set(f.id,[ch,f]);
  const out=[];
  for(const l of model.links.values()){const A=where.get(l.a),B=where.get(l.b);if(!A||!B||A[0]===B[0])continue;
    const born=model.bornAt(l);if(!(born<=t)||(l.removed!==null&&l.removed<=t))continue;
    const pa=wallPoint(A[0],A[1],B[0].c),pb=wallPoint(B[0],B[1],A[0].c);
    const mid=[(pa[0]+pb[0])/2,(pa[1]+pb[1])/2,(pa[2]+pb[2])/2],o=[mid[0]-center[0],mid[1]-center[1],mid[2]-center[2]],ol=Math.hypot(...o)||1;
    const len=Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]),lift=.32*len+.16*(A[0].r+B[0].r);
    out.push({key:l.key,a:l.a,b:l.b,from:A[0].id,to:B[0].id,pa,pb,ctrl:[mid[0]+o[0]/ol*lift,mid[1]+o[1]/ol*lift,mid[2]+o[2]/ol*lift],
      grow:born===-Infinity?1:smooth((t-born)/(THREAD_S*1000*speed)),born,len:len+lift});}
  out.sort((x,y)=>(y.born===-Infinity?-Infinity:y.born)-(x.born===-Infinity?-Infinity:x.born)||(x.key<y.key?-1:1));
  return out.slice(0,max);
}
// The threads of each pair of chambers bundled into one cord (the coupling between two regions, never a wire per import):
// its strength from how many live dependencies it carries and how many flow each way (light flows toward the import). It
// leaves each chamber on its outer side, leaning toward the other, and arcs around the outside of the structure.
export function cordsOf(threads,chambers,center=[0,0,0]){
  const by=new Map(),idx=new Map(chambers.map(c=>[c.id,c]));
  for(const th of threads){const k=th.from<th.to?`${th.from}|${th.to}`:`${th.to}|${th.from}`;let c=by.get(k);
    if(!c){const [a,b]=th.from<th.to?[th.from,th.to]:[th.to,th.from];c={key:k,a,b,count:0,ab:0,ba:0,grow:0,born:Infinity};by.set(k,c);}
    c.count++;if(th.from===c.a)c.ab++;else c.ba++;c.grow=Math.max(c.grow,th.grow);c.born=Math.min(c.born,th.born);}
  const out=[];
  for(const c of by.values()){const A=idx.get(c.a),B=idx.get(c.b);if(!A||!B)continue;
    const end=(P,Q)=>{const o=[P.c[0]-center[0],P.c[1]-center[1],P.c[2]-center[2]],ol=Math.hypot(...o)||1,t=[Q.c[0]-P.c[0],Q.c[1]-P.c[1],Q.c[2]-P.c[2]],tl=Math.hypot(...t)||1;
      const d=[o[0]/ol+.7*t[0]/tl,o[1]/ol+.7*t[1]/tl,o[2]/ol+.7*t[2]/tl],dl=Math.hypot(...d)||1;return [P.c[0]+d[0]/dl*P.r,P.c[1]+d[1]/dl*P.r,P.c[2]+d[2]/dl*P.r];};
    const pa=end(A,B),pb=end(B,A),mid=[(pa[0]+pb[0])/2,(pa[1]+pb[1])/2,(pa[2]+pb[2])/2],o=[mid[0]-center[0],mid[1]-center[1],mid[2]-center[2]],ol=Math.hypot(...o)||1;
    const len=Math.hypot(pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]),lift=.3*len+.18*(A.r+B.r);
    out.push({...c,pa,pb,ctrl:[mid[0]+o[0]/ol*lift,mid[1]+o[1]/ol*lift,mid[2]+o[2]/ol*lift],len:len+lift});}
  return out.sort((x,y)=>x.key<y.key?-1:1);
}
// A file's place on its chamber's wall: along its seed's direction (the centre file's toward `toward`).
export function wallPoint(ch,f,toward){
  let d=f.local&&Math.hypot(...f.local)>1e-6?f.local:[toward[0]-ch.c[0],toward[1]-ch.c[1],toward[2]-ch.c[2]];const l=Math.hypot(...d)||1;
  return [ch.c[0]+d[0]/l*ch.r,ch.c[1]+d[1]/l*ch.r,ch.c[2]+d[2]/l*ch.r];
}
export const bezier=(p,q,c,u,out=[0,0,0])=>{const a=(1-u)*(1-u),b=2*(1-u)*u,d=u*u;out[0]=a*p[0]+b*c[0]+d*q[0];out[1]=a*p[1]+b*c[1]+d*q[1];out[2]=a*p[2]+b*c[2]+d*q[2];return out;};
// Is a point inside any chamber's ball but `skip` (the union's interior: hidden walls)?
export function insideOther(chambers,p,skip=-1,shrink=1){for(let k=0;k<chambers.length;k++){if(k===skip)continue;const c=chambers[k],d=(p[0]-c.c[0])**2+(p[1]-c.c[1])**2+(p[2]-c.c[2])**2;if(d<(c.r*shrink)**2)return true;}return false;}

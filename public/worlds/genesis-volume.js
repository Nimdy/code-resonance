// Genesis volume: the Lawbook's universe as a body of matter in three dimensions (the art-direction experiment after
// G1.5; docs/worlds/genesis-volume.md). The sheet of genesis-field.js can fold and enclose, but it can never open a hole,
// a tunnel or a network of chambers without being cut; here matter fills space and life hollows it.
//
// Authoritative and pure like the field: a fixed step (DT), fixed memory, only + - * /, sqrt and floor in the step
// (its own exp and sine), state stored in Float32Arrays (rounding on store is exact IEEE), so Node and every browser
// reach the same state and the same hash.
//
// The matter:
//  - a periodic world in all three directions: no walls, no floor and no ceiling; it continues;
//  - every subsystem holds a region of space around its seat (a power diagram: larger subsystems hold more), and its
//    region's chemistry obeys its own law: a Gray-Scott reaction-diffusion whose activity v hollows the matter. Each
//    region's (feed, kill) comes from its role, its seed and the Lawbook, so regions grow different architectures
//    (layered strata, tunnel networks, dividing cells, foam, drifting fronts) that meet and interact at their borders;
//  - a dependency is a passage: along the line between the two seats the chemistry is fed (a tunnel opens and stays
//    open), a current runs through it from the region depended on to the dependent one, and it carries a nutrient the
//    dependent region feeds on (its cavities grow);
//  - music is pressure: a wave equation through the whole medium; a bass note strikes its region at its seat and the
//    wave crosses the world, a region rings at the matter's natural frequency (tuned toward the beat by the resonance
//    law), and the walls (the matter's boundary) move with the pressure. Linear and damped: nothing is left changed.
import {dexp,dsin,dcos,dpow,dlog,stream,hashString,physicsOf} from './genesis-field.js';
export const VOLUME_VERSION=1;
export const DT=1/60;
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x;
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2;
// Gray-Scott regimes (Pearson's (F, k) with Du = .2, Dv = .1) as measured in three dimensions (a periodic 48³ sweep,
// docs/worlds/genesis-volume.md): the share of space the activity hollows, whether the hollows form one network, and
// whether they keep changing.
export const REGIMES={
  open:{F:.045,k:.055},        // 100 % open, a gently fluctuating medium: the great hall the other regions wall in
  halls:{F:.044,k:.0592},      // 84 % open, one network: vast halls with pillars of matter
  labyrinth:{F:.037,k:.06},    // 61 % open, one network: walls and passages
  tubes:{F:.031,k:.0622},      // 32 % open, one network: tubes through matter
  chambers:{F:.0367,k:.0649},  // 30 % open in separate chambers that grow and divide
  tide:{F:.025,k:.06},         // 44 % open, one network, never settles: drifting rings and fronts
  worms:{F:.05,k:.063}         // 34 % open, moving worms
};
// each role's architecture, and the livelier one a region takes when its project's stability law is low
const ROLE_REGIME={core:['open','open'],interface:['labyrinth','tide'],services:['worms','tide'],model:['chambers','worms'],logic:['tubes','labyrinth'],tests:['chambers','tide']};
export const GAIN={strike:9,tap:3};
// regionLaw: a subsystem's chemistry from its role, its own seed and the Lawbook (a fractional position on REGIMES and
// a speed). Distinct projects mix distinct regimes in distinct proportions.
export function regionLaw(sub,laws,seed){
  const r=stream(seed^Math.imul((sub.k+1)|0,0x9E3779B1)),L=k=>clamp(Number.isFinite(laws?.[k])?laws[k]:.5);
  // the role's architecture; the livelier one with a chance that grows as the stability law falls, and the logic of a
  // cohesive project closes toward tubes, a loose one opens toward labyrinths
  const pair=ROLE_REGIME[sub.role]||ROLE_REGIME.logic,lively=r()<lerp(.65,.1,L('stability'));
  let name=lively?pair[1]:pair[0];if(sub.role==='logic'&&!lively)name=r()<L('cohesion')?'tubes':'labyrinth';
  const g=REGIMES[name],j=.0012*(r()-.5);
  // speed scales the chemistry's step: explicit diffusion in 3D stays stable while 6 Du speed <= 1
  return {F:g.F+j,k:g.k,regime:name,speed:Math.min(.82,lerp(.55,.8,L('morphogenesis'))*(.95+.1*r()))};
}
// nx x ny x nz cells; laws, structure ({subsystems, deps}) and seed as for the field.
export function createVolume({laws,structure,seed=1,nx=64,ny=48,nz=64,tempo=92}={}){
  const P=physicsOf(laws),rnd=stream(seed^0x51A7),NC=nx*ny*nz,sx=1,sy=nx,sz=nx*ny;
  const u=new Float32Array(NC),v=new Float32Array(NC),u2=new Float32Array(NC),v2=new Float32Array(NC);
  const F=new Float32Array(NC),Kf=new Float32Array(NC),rate=new Float32Array(NC);
  const nut=new Float32Array(NC),nut2=new Float32Array(NC);
  const p=new Float32Array(NC),pd=new Float32Array(NC);
  // life: how fast the matter is changing here (a running average of the activity's change), what the view lights
  const life=new Float32Array(NC);
  const reg=new Uint8Array(NC),reg2=new Uint8Array(NC),blend=new Float32Array(NC);
  const MAXK=16;let subs=[],K=0,seats=new Float64Array(0),born=new Float64Array(0),laws_=[];
  let deps=[],tubes=[],step=0,time=0;
  const res=new Float64Array(MAXK*2),omega=new Float64Array(MAXK);
  // periodic differences in x and z
  const dwrap=(d,n)=>d>n/2?d-n:d<-n/2?d+n:d;
  // ---- the world before anything: rock everywhere, a little activity scattered (deterministic) -------------------
  u.fill(1);v.fill(0);
  // a seed of activity: a ball of radius rad (activity in three dimensions needs room to take hold)
  function seedAt(cx,cy,cz,rad=4){const R=Math.ceil(rad);
    for(let dz=-R;dz<=R;dz++)for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){if(dx*dx+dy*dy+dz*dz>rad*rad)continue;
      const i=((Math.floor(cx)+dx)%nx+nx)%nx+((Math.floor(cy)+dy)%ny+ny)%ny*sy+((Math.floor(cz)+dz)%nz+nz)%nz*sz;u[i]=.5;v[i]=.3;}}
  for(let s=0;s<Math.round(NC/4000);s++)seedAt(rnd()*nx,rnd()*ny,rnd()*nz,3.5+rnd()*1.5);
  // ---- structure --------------------------------------------------------------------------------------------------
  function seatsOf(list,depList){
    const pos=new Float64Array(list.length*3),r=stream(seed^0x5EA7);
    for(let i=0;i<list.length;i++){const a=i*2.399963229728653,rad=Math.sqrt((i+.5)/Math.max(1,list.length));
      pos[3*i]=(.5+.42*rad*dcos(a))*nx;pos[3*i+2]=(.5+.42*rad*dsin(a))*nz;pos[3*i+1]=(.5+.38*(r()-.5)*2*rad)*ny;}
    return pos;
  }
  function assignRegions(){
    // a power diagram in periodic x, z: d² - w where w grows with the region's files
    const w=wts;
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      let b1=1e30,b2=1e30,k1=0,k2=0;
      for(let k=0;k<K;k++){const dx=dwrap(x-seats[3*k],nx),dy=dwrap(y-seats[3*k+1],ny),dz=dwrap(z-seats[3*k+2],nz),d=dx*dx+dy*dy+dz*dz-w[k];
        if(d<b1){b2=b1;k2=k1;b1=d;k1=k;}else if(d<b2){b2=d;k2=k;}}
      // the laws change over a border several cells wide, so neighbouring architectures grade into each other
      const i=x+y*sy+z*sz;reg[i]=k1;reg2[i]=k2;blend[i]=K>1?.5*clamp(1-(b2-b1)/260):0;
    }
  }
  // a region's weight in the power diagram: the square of the radius of a ball holding its share of the world (shares
  // grow with files, as territories do in the field; the core's open hall is given a larger share)
  let wts=[];
  function weightsOf(list){const sh=list.map(s=>dpow(Math.max(1,s.files),.75)*(s.role==='core'?2.2:1)),tot=sh.reduce((a,b)=>a+b,0)||1;
    return sh.map(x=>{const r=dpow(x/tot*NC*3/(4*Math.PI),1/3);return r*r;});}
  function lawField(){
    const L=laws_;
    for(let i=0;i<NC;i++){const a=L[reg[i]],b=L[reg2[i]],t=blend[i];F[i]=lerp(a.F,b.F,t);Kf[i]=lerp(a.k,b.k,t);rate[i]=lerp(a.speed,b.speed,t);}
    // the passages: along each dependency the chemistry is fed, so a tunnel opens (ramped from its birth)
    for(const T of tubes){const g=T.grow;if(g<=0)continue;for(let q=0;q<T.cells.length;q++){const i=T.cells[q],s=T.w[q]*g;F[i]=lerp(F[i],.039,s);Kf[i]=lerp(Kf[i],.058,s);}}
  }
  function tubeOf(d){
    // the cells near the shortest (periodic) segment from the dependent's seat (a) to the depended-on's seat (b)
    const ax=seats[3*d.a],ay=seats[3*d.a+1],az=seats[3*d.a+2];
    const dx=dwrap(seats[3*d.b]-ax,nx),dy=dwrap(seats[3*d.b+1]-ay,ny),dz=dwrap(seats[3*d.b+2]-az,nz),l2=dx*dx+dy*dy+dz*dz||1,len=Math.sqrt(l2);
    const rad=2.6+1.2*d.w,cells=[],w=[],dir=[],along=[];
    const steps=Math.ceil(len),seen=new Set();
    for(let s=0;s<=steps;s++){const t=s/steps,cx=ax+dx*t,cy=ay+dy*t,cz=az+dz*t,R=Math.ceil(rad+1);
      for(let oz=-R;oz<=R;oz++)for(let oy=-R;oy<=R;oy++)for(let ox=-R;ox<=R;ox++){
        const X=((Math.floor(cx)+ox)%nx+nx)%nx,Y=((Math.floor(cy)+oy)%ny+ny)%ny,Z=((Math.floor(cz)+oz)%nz+nz)%nz;
        const i=X+Y*sy+Z*sz;if(seen.has(i))continue;
        const px=dwrap(X-ax,nx),py=dwrap(Y-ay,ny),pz=dwrap(Z-az,nz),tt=clamp((px*dx+py*dy+pz*dz)/l2),qx=px-tt*dx,qy=py-tt*dy,qz=pz-tt*dz,r2=qx*qx+qy*qy+qz*qz;
        if(r2>rad*rad)continue;seen.add(i);cells.push(i);w.push(1-r2/(rad*rad));along.push(tt);}}
    // order the cells (deterministic) by index
    const ord=cells.map((c,j)=>j).sort((p1,p2)=>cells[p1]-cells[p2]);
    return {cells:Int32Array.from(ord.map(j=>cells[j])),w:Float32Array.from(ord.map(j=>w[j])),along:Float32Array.from(ord.map(j=>along[j])),
      dir:[-dx/len,-dy/len,-dz/len],born:d.born,grow:0,weight:d.w};
  }
  function setStructure(next,{at=time,initial=false}={}){
    const list=(next.subsystems||[]).slice(0,MAXK),old=new Map(subs.map((s,i)=>[s.k,i])),fresh=seatsOf(list,next.deps||[]);
    const ns=new Float64Array(list.length*3),nb=new Float64Array(list.length);
    for(let i=0;i<list.length;i++){const j=old.get(list[i].k);
      if(j!==undefined){ns[3*i]=seats[3*j];ns[3*i+1]=seats[3*j+1];ns[3*i+2]=seats[3*j+2];nb[i]=born[j];}
      else{ns[3*i]=fresh[3*i];ns[3*i+1]=fresh[3*i+1];ns[3*i+2]=fresh[3*i+2];nb[i]=initial?-1e9:at;
        // a newborn region starts as a seed of activity at its seat
        if(!initial)seedAt(ns[3*i],ns[3*i+1],ns[3*i+2],5);}}
    subs=list;K=list.length;seats=ns;born=nb;laws_=list.map(s=>regionLaw(s,laws,seed));wts=weightsOf(list);
    const idx=new Map(list.map((s,i)=>[s.k,i])),prev=new Map(deps.map(d=>[d.key,d]));deps=[];
    for(const e of next.deps||[]){const a=idx.get(e.a),b=idx.get(e.b);if(a===undefined||b===undefined||a===b)continue;
      const key=`${e.a}>${e.b}`,w=Math.min(1,.45+.3*dlog(1+e.w)/.6931471805599453),pd0=prev.get(key);
      deps.push(pd0?{...pd0,a,b,w}:{key,a,b,w,born:initial?-1e9:at});}
    tubes=deps.map(d=>tubeOf(d));
    if(initial){for(let k=0;k<K;k++)seedAt(seats[3*k],seats[3*k+1],seats[3*k+2],5);}
    for(let k=0;k<K;k++){const own=lerp(.9,2.2,clamp(1-Math.sqrt(1/Math.max(1,K))));omega[k]=TAU*lerp(own*lerp(.8,1.3,clamp(laws?.elasticity??.5)),tempo/60,P.tune*.85);}
    assignRegions();
    for(const T of tubes){T.grow=T.born>-1e8?clamp((time-T.born)/5):1;if(!T.seeded){T.seeded=true;for(let q=0;q<T.cells.length;q+=7)if(T.w[q]>.6&&T.born<=-1e8){const i=T.cells[q];u[i]=.5;v[i]=.3;}}}
    lawField();
  }
  // ---- one fixed step ---------------------------------------------------------------------------------------------
  // music: {bass:[{k,v}], kick:[v], melody:[{angle,v}]} onsets in this step (the field's format), or null
  function advance(music=null){
    // the passages open over five seconds after their dependency's birth
    let regrow=false;for(const T of tubes){const g=T.born>-1e8?clamp((time-T.born)/5):1;if(g!==T.grow){T.grow=g;regrow=true;}}
    if(regrow)lawField();
    for(let s=0;s<2;s++)chemistry();
    currents();
    if(music){for(const b of music.bass||[])if(b.k>=0&&b.k<K){res[2*b.k+1]+=b.v*omega[b.k];strike(b.k,b.v*GAIN.strike);}
      for(const v0 of music.kick||[])for(let k=0;k<K;k++)strike(k,v0*GAIN.strike*.5);
      for(const m of music.melody||[]){const k=Math.floor((m.angle/TAU)*K+.5)%Math.max(1,K);strike(k,m.v*GAIN.tap);}}
    for(let k=0;k<K;k++){const w=omega[k],z=.08+.18*clamp(laws?.viscosity??.5),q=res[2*k],qd=res[2*k+1];res[2*k+1]=qd+(-w*w*q-2*z*w*qd)*DT;res[2*k]=q+res[2*k+1]*DT;}
    for(let s=0;s<2;s++)waves(DT/2);
    step++;time=step*DT;
  }
  // Gray-Scott, one step (dt = 1 in the chemistry's own time, times the region's speed)
  const Du=.2,Dv=.1;
  function chemistry(){
    for(let z=0;z<nz;z++){const zm=((z+nz-1)%nz)*sz,zp=((z+1)%nz)*sz,zo=z*sz;
      for(let y=0;y<ny;y++){const yo=y*sy,ym=((y+ny-1)%ny)*sy,yp=((y+1)%ny)*sy;
        for(let x=0;x<nx;x++){const xm=(x+nx-1)%nx,xp=(x+1)%nx,i=x+yo+zo;
          const uc=u[i],vc=v[i];
          const lu=u[xm+yo+zo]+u[xp+yo+zo]+u[x+ym+zo]+u[x+yp+zo]+u[x+yo+zm]+u[x+yo+zp]-6*uc;
          const lv=v[xm+yo+zo]+v[xp+yo+zo]+v[x+ym+zo]+v[x+yp+zo]+v[x+yo+zm]+v[x+yo+zp]-6*vc;
          const uvv=uc*vc*vc,r=rate[i],f=F[i]+.012*nut[i];
          u2[i]=uc+r*(Du*lu-uvv+f*(1-uc));const nv=vc+r*(Dv*lv+uvv-(f+Kf[i])*vc);v2[i]=nv;
          const dv=nv>vc?nv-vc:vc-nv;life[i]=life[i]*.985+dv*1.5;}}}
    u.set(u2);v.set(v2);
  }
  // the currents: through each passage, from the region depended on toward the dependent one, carrying the activity and
  // a nutrient released at the depended-on end; the nutrient decays and is taken up where it arrives
  function currents(){
    nut2.set(nut);
    for(const T of tubes){if(T.grow<=0)continue;const sp=(2.2+2*T.weight)*T.grow*DT*60*.05,[ux,uy,uz]=T.dir;
      for(let q=0;q<T.cells.length;q++){const i=T.cells[q],w=T.w[q];
        // semi-Lagrangian along the passage's axis: the value upstream
        const x=i%nx,y=Math.floor(i/sy)%ny,z=Math.floor(i/sz),bx=x-ux*sp*w,by=y-uy*sp*w,bz=z-uz*sp*w;
        const X=Math.floor(bx),Y=Math.floor(by),Z=Math.floor(bz),fx=bx-X,fy=by-Y,fz=bz-Z;
        const c=(xx,yy,zz)=>((xx%nx+nx)%nx)+((yy%ny+ny)%ny)*sy+((zz%nz+nz)%nz)*sz;
        const s3=(a)=>{const c00=a[c(X,Y,Z)]*(1-fx)+a[c(X+1,Y,Z)]*fx,c10=a[c(X,Y+1,Z)]*(1-fx)+a[c(X+1,Y+1,Z)]*fx,c01=a[c(X,Y,Z+1)]*(1-fx)+a[c(X+1,Y,Z+1)]*fx,c11=a[c(X,Y+1,Z+1)]*(1-fx)+a[c(X+1,Y+1,Z+1)]*fx;
          return (c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz;};
        // the value upstream, then the release at the depended-on end (along near 1)
        nut2[i]=s3(nut);v[i]=v[i]+(s3(v)-v[i])*.5;
        if(T.along[q]>.85)nut2[i]+=(1-nut2[i])*.08*w*T.grow;}}
    // the nutrient spreads a little from the passages (diffusion) and decays
    for(let z=0;z<nz;z++){const zm=((z+nz-1)%nz)*sz,zp=((z+1)%nz)*sz,zo=z*sz;
      for(let y=0;y<ny;y++){const yo=y*sy,ym=((y+ny-1)%ny)*sy,yp=((y+1)%ny)*sy;
        for(let x=0;x<nx;x++){const i=x+yo+zo,c=nut2[i];
          const l=nut2[(x+nx-1)%nx+yo+zo]+nut2[(x+1)%nx+yo+zo]+nut2[x+ym+zo]+nut2[x+yp+zo]+nut2[x+yo+zm]+nut2[x+yo+zp]-6*c;
          const n=(c+.05*l)*(1-.25*DT);nut[i]=n<1e-6?0:n;}}}
  }
  // the pressure: a damped wave through the whole medium with a restoring term (the matter's own ring)
  function strike(k,a){
    const cx=seats[3*k],cy=seats[3*k+1],cz=seats[3*k+2],R=6;
    for(let oz=-R;oz<=R;oz++)for(let oy=-R;oy<=R;oy++)for(let ox=-R;ox<=R;ox++){const d2=(ox*ox+oy*oy+oz*oz)/(R*R*.35);if(d2>3)continue;
      const X=((Math.floor(cx)+ox)%nx+nx)%nx,Y=((Math.floor(cy)+oy)%ny+ny)%ny,Z=((Math.floor(cz)+oz)%nz+nz)%nz;pd[X+Y*sy+Z*sz]+=a*dexp(-d2);}
  }
  function waves(dt){
    const c2=sq(P.sound*.8),g=2*P.hush*.6,w2=sq(TAU*1.2);
    for(let z=0;z<nz;z++){const zm=((z+nz-1)%nz)*sz,zp=((z+1)%nz)*sz,zo=z*sz;
      for(let y=0;y<ny;y++){const yo=y*sy,ym=((y+ny-1)%ny)*sy,yp=((y+1)%ny)*sy;
        for(let x=0;x<nx;x++){const xm=(x+nx-1)%nx,xp=(x+1)%nx,i=x+yo+zo,pc=p[i];
          const lp=p[xm+yo+zo]+p[xp+yo+zo]+p[x+ym+zo]+p[x+yp+zo]+p[x+yo+zm]+p[x+yo+zp]-6*pc;
          pd[i]=pd[i]+dt*(c2*lp-g*pd[i]-w2*pc);}}}
    for(let i=0;i<NC;i++)p[i]=p[i]+dt*pd[i];
  }
  const sq=x=>x*x;
  // ---- read-outs ------------------------------------------------------------------------------------------------------
  function hashState(){
    let h1=2166136261,h2=0x9747b28c;
    const eat=arr=>{const b=new Uint32Array(arr.buffer,arr.byteOffset,arr.byteLength>>2);for(let i=0;i<b.length;i++){h1=Math.imul(h1^b[i],16777619);h2=Math.imul(h2^(b[i]>>>16|b[i]<<16),0x5bd1e995)^(h2>>>13);}};
    eat(u);eat(v);eat(nut);eat(p);eat(pd);eat(life);eat(res);
    return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }
  function metrics(){let hollow=0,act=0,np=0;for(let i=0;i<NC;i++){if(v[i]>.15)hollow++;act+=v[i];np+=p[i]*p[i];}return {hollow:hollow/NC,activity:act/NC,pressure:Math.sqrt(np/NC)};}
  setStructure(structure,{initial:true});
  return {nx,ny,nz,NC,u,v,nut,p,life,reg,reg2,blend,seats:()=>seats,weights:()=>wts,subs:()=>subs,K:()=>K,laws:()=>laws_,tubes:()=>tubes,physics:P,res,
    get step(){return step;},get time(){return time;},advance,setStructure,hash:hashState,metrics,MAXK};
}

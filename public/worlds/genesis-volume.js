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
//    open), and it drives a circulation (version 2): the medium streams through the passage from the region depended on
//    to the dependent one and returns through the matter around it, carrying the activity, the substrate and a nutrient
//    the dependent region feeds on. Matter carried into the passage dissolves and re-forms downstream, so the walls
//    around a passage never settle (without it every regime freezes into a still pattern within about a minute);
//  - music is pressure: a wave equation through the whole medium; a bass note strikes its region at its seat and the
//    wave crosses the world, a region rings at the matter's natural frequency (tuned toward the beat by the resonance
//    law), and the walls (the matter's boundary) move with the pressure. Linear and damped: nothing is left changed.
import {dexp,dsin,dcos,dpow,dlog,stream,hashString,physicsOf} from './genesis-field.js';
export const VOLUME_VERSION=2;
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
// the circulation a dependency drives (version 2): the speed on its axis (cells per second, before the coupling law and
// the dependency's weight), the radius of its forward core (cells), the return sheath's radius as a multiple of it, and
// how far beyond the seats it turns (cells)
export const FLOW={U:8,a:4,b:2,turn:6};
// the length scale of the chemistry (version 2): both diffusions times this (a pattern's wavelength scales with its root)
export const GRAIN=.3;
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
export function createVolume({laws,structure,seed=1,nx=64,ny=48,nz=64,tempo=92,flow=FLOW}={}){
  const P=physicsOf(laws),rnd=stream(seed^0x51A7),NC=nx*ny*nz,sx=1,sy=nx,sz=nx*ny;
  // the chemistry writes into the second pair and the pairs swap (read-outs are getters)
  let u=new Float32Array(NC),v=new Float32Array(NC),u2=new Float32Array(NC),v2=new Float32Array(NC);
  const F=new Float32Array(NC),Kf=new Float32Array(NC),rate=new Float32Array(NC);
  // the medium's grain (version 2): diffusion along each axis (the three sum to 3); a region whose chemistry spreads more
  // easily in a plane than across it builds its architecture in layers stacked across that plane
  const gw=new Float32Array(3*NC).fill(1);
  const nut=new Float32Array(NC),nut2=new Float32Array(NC);
  const p=new Float32Array(NC),pd=new Float32Array(NC);
  // life: how fast the matter is changing here (a running average of the activity's change), what the view lights
  const life=new Float32Array(NC);
  const reg=new Uint8Array(NC),reg2=new Uint8Array(NC),blend=new Float32Array(NC);
  const MAXK=16;let subs=[],K=0,seats=new Float64Array(0),born=new Float64Array(0),laws_=[];
  let deps=[],tubes=[],step=0,time=0;
  const res=new Float64Array(MAXK*2),omega=new Float64Array(MAXK);
  // the circulation: one step of each passage's current gathered here before it is written (see advectBy)
  let gather=new Float32Array(0);
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
    for(let i=0;i<NC;i++){const a=L[reg[i]],b=L[reg2[i]],t=blend[i];F[i]=lerp(a.F,b.F,t);Kf[i]=lerp(a.k,b.k,t);rate[i]=lerp(a.speed,b.speed,t);
      gw[3*i]=lerp(a.grain[0],b.grain[0],t);gw[3*i+1]=lerp(a.grain[1],b.grain[1],t);gw[3*i+2]=lerp(a.grain[2],b.grain[2],t);}
    // the passages: along each dependency the chemistry takes the open regime (ramped from its birth), so a tunnel opens
    // through whatever architecture it crosses (version 2: at the finer grain a merely richer feed builds a labyrinth
    // inside the tube instead of a tunnel)
    const O=REGIMES.open;
    for(const T of tubes){const g=T.grow;if(g<=0)continue;for(let q=0;q<T.cells.length;q++){const i=T.cells[q],s=T.w[q]*g;F[i]=lerp(F[i],O.F,s);Kf[i]=lerp(Kf[i],O.k,s);}}
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
      dir:[-dx/len,-dy/len,-dz/len],mid:[ax+dx/2,ay+dy/2,az+dz/2],len,born:d.born,grow:0,weight:d.w,phase:(hashString(d.key)%1000)/1000,acc:0};
  }
  // the circulation a passage drives, at unit speed: the discrete curl of a vector potential about its axis,
  // A = Phi(r) g(z) (dir x r) / r², Phi = a² (exp(-r²/2b²) - exp(-r²/2a²)), so the axial velocity is
  // exp(-r²/2a²) - (a/b)² exp(-r²/2b²): forward through the passage, back through a sheath around it, no net flux, and
  // divergence-free; g turns it around beyond the seats
  let Ax=null,Ay=null,Az=null;
  function circulationOf(T){
    if(!Ax){Ax=new Float64Array(NC);Ay=new Float64Array(NC);Az=new Float64Array(NC);}
    const a0=flow.a,b0=a0*flow.b,half=T.len/2,turn2=flow.turn*flow.turn,[dx,dy,dz]=T.dir,[mx,my,mz]=T.mid,reach=9*b0*b0,touched=[];
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const px=dwrap(x-mx,nx),py=dwrap(y-my,ny),pz=dwrap(z-mz,nz),t=px*dx+py*dy+pz*dz,rx=px-t*dx,ry=py-t*dy,rz=pz-t*dz,r2=rx*rx+ry*ry+rz*rz;
      if(r2>reach)continue;const e=Math.max(0,Math.abs(t)-half);if(e>3*flow.turn)continue;const g=dexp(-e*e/(2*turn2));
      const c=r2>1e-9?a0*a0*(dexp(-r2/(2*b0*b0))-dexp(-r2/(2*a0*a0)))*g/r2:.5*(1-a0*a0/(b0*b0))*g;
      const i=x+y*sy+z*sz;Ax[i]=c*(dy*rz-dz*ry);Ay[i]=c*(dz*rx-dx*rz);Az[i]=c*(dx*ry-dy*rx);touched.push(i);}
    const cells=[],v3=[];
    for(const i of touched){const x=i%nx,y=Math.floor(i/sy)%ny,z=Math.floor(i/sz);
      const X1=(x+1)%nx+y*sy+z*sz,X0=(x+nx-1)%nx+y*sy+z*sz,Y1=x+((y+1)%ny)*sy+z*sz,Y0=x+((y+ny-1)%ny)*sy+z*sz,Z1=x+y*sy+((z+1)%nz)*sz,Z0=x+y*sy+((z+nz-1)%nz)*sz;
      const ux=.5*((Az[Y1]-Az[Y0])-(Ay[Z1]-Ay[Z0])),uy=.5*((Ax[Z1]-Ax[Z0])-(Az[X1]-Az[X0])),uz=.5*((Ay[X1]-Ay[X0])-(Ax[Y1]-Ax[Y0]));
      if(ux*ux+uy*uy+uz*uz<1e-6)continue;cells.push(i);v3.push(ux,uy,uz);}
    for(const i of touched){Ax[i]=0;Ay[i]=0;Az[i]=0;}
    return {cells:Int32Array.from(cells),v:Float32Array.from(v3)};
  }
  // a passage's current at full strength (the coupling law, the dependency's weight) as one semi-Lagrangian step of two
  // fixed steps (the currents move every other step): for every cell it moves (at least a quarter of a cell a second),
  // the eight cells (and weights) it comes from
  const ADV=2*DT;
  function stencilOf(T){
    if(!T.flow)T.flow=circulationOf(T);
    const S=flow.U*(P.current/.24)*T.weight,{cells,v:w3}=T.flow,m=[],f=[],w=[];
    for(let q=0;q<cells.length;q++){const ux=S*w3[3*q],uy=S*w3[3*q+1],uz=S*w3[3*q+2];if(ux*ux+uy*uy+uz*uz<.0625)continue;
      const i=cells[q],x=i%nx,y=Math.floor(i/sy)%ny,z=Math.floor(i/sz),bx=x-ux*ADV,by=y-uy*ADV,bz=z-uz*ADV,X=Math.floor(bx),Y=Math.floor(by),Z=Math.floor(bz),fx=bx-X,fy=by-Y,fz=bz-Z;
      m.push(i);
      for(let c=0;c<8;c++){const ox=c&1,oy=(c>>1)&1,oz=(c>>2)&1;
        f.push(((X+ox)%nx+nx)%nx+((Y+oy)%ny+ny)%ny*sy+((Z+oz)%nz+nz)%nz*sz);w.push((ox?fx:1-fx)*(oy?fy:1-fy)*(oz?fz:1-fz));}}
    if(gather.length<m.length)gather=new Float32Array(m.length);
    return {cells:Int32Array.from(m),from:Int32Array.from(f),wt:Float32Array.from(w)};
  }
  // one step of a passage's current: every moving cell takes the value upstream (trilinear), all read before any write
  function advectBy(A,a){
    const {cells,from:fr,wt}=A,n=cells.length;
    for(let q=0;q<n;q++){const o=8*q;gather[q]=wt[o]*a[fr[o]]+wt[o+1]*a[fr[o+1]]+wt[o+2]*a[fr[o+2]]+wt[o+3]*a[fr[o+3]]+wt[o+4]*a[fr[o+4]]+wt[o+5]*a[fr[o+5]]+wt[o+6]*a[fr[o+6]]+wt[o+7]*a[fr[o+7]];}
    for(let q=0;q<n;q++)a[cells[q]]=gather[q];
  }
  // the currents blink, as on the sheet (the accepted model): each pulses between a quarter and its full strength on the
  // stability law's period, in its own phase, so the flow never lets the walls settle into its streamlines (a steady
  // current does: measured). A strength s is the share of steps on which the current's full step is taken (its
  // accumulator), so a current's step is computed once, not every step.
  function gateOf(T){
    const g=T.born>-1e8?clamp((time-T.born)/5):1;
    return g*(tubes.length>1?.25+.75*Math.max(0,dsin(TAU*(time/P.blink+T.phase))):.7+.3*dsin(TAU*time/P.blink));
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
    const before=new Map(tubes.map(T=>[T.key,T]));
    tubes=deps.map(d=>{const T=tubeOf(d),o=before.get(d.key);T.key=d.key;if(o&&o.len===T.len&&o.dir.join()===T.dir.join()){T.flow=o.flow;T.adv=o.adv;T.acc=o.acc;}return T;});
    grains();
    if(initial){for(let k=0;k<K;k++)seedAt(seats[3*k],seats[3*k+1],seats[3*k+2],5);}
    for(let k=0;k<K;k++){const own=lerp(.9,2.2,clamp(1-Math.sqrt(1/Math.max(1,K))));omega[k]=TAU*lerp(own*lerp(.8,1.3,clamp(laws?.elasticity??.5)),tempo/60,P.tune*.85);}
    assignRegions();
    for(const T of tubes){T.grow=T.born>-1e8?clamp((time-T.born)/5):1;if(!T.seeded){T.seeded=true;for(let q=0;q<T.cells.length;q+=7)if(T.w[q]>.6&&T.born<=-1e8){const i=T.cells[q];u[i]=.5;v[i]=.3;}}}
    lawField();for(const T of tubes)if(!T.adv)T.adv=stencilOf(T);
  }
  // each region's grain: its layers lie across the currents through it (the axis nearest their weighted directions; with
  // none, the direction toward the core), as strongly as the anisotropy law says; the core's open hall has none
  function grains(){
    const an=clamp(laws?.anisotropy??.5),across=lerp(.7,.15,an),along=(3-across)/2,core=subs.findIndex(s=>s.role==='core');
    for(let k=0;k<K;k++){const l=laws_[k];if(subs[k].role==='core'||l.regime==='open'){l.grain=[1,1,1];l.axis=-1;continue;}
      const d=[0,0,0];for(let j=0;j<deps.length;j++){const D=deps[j];if(D.a!==k&&D.b!==k)continue;const T=tubes[j];for(let c=0;c<3;c++)d[c]+=Math.abs(T.dir[c])*D.w;}
      if(d[0]+d[1]+d[2]===0&&core>=0)for(let c=0;c<3;c++)d[c]=Math.abs(dwrap(seats[3*k+c]-seats[3*core+c],[nx,ny,nz][c]));
      const ax=d[0]>=d[1]&&d[0]>=d[2]?0:d[1]>=d[2]?1:2;l.axis=ax;l.grain=[0,1,2].map(c=>c===ax?across:along);}
  }
  // ---- one fixed step ---------------------------------------------------------------------------------------------
  // music: {bass:[{k,v}], kick:[v], melody:[{angle,v}]} onsets in this step (the field's format), or null
  function advance(music=null){
    // the passages open over five seconds after their dependency's birth
    let regrow=false;for(const T of tubes){const g=T.born>-1e8?clamp((time-T.born)/5):1;if(g!==T.grow){T.grow=g;regrow=true;}}
    if(regrow)lawField();
    chemistry(false);chemistry(true);
    if(step%2===0)for(const T of tubes){T.acc+=gateOf(T);if(T.acc>=1){T.acc-=1;advectBy(T.adv,u);advectBy(T.adv,nut);}}
    currents();
    if(music){for(const b of music.bass||[])if(b.k>=0&&b.k<K){res[2*b.k+1]+=b.v*omega[b.k];strike(b.k,b.v*GAIN.strike);}
      for(const v0 of music.kick||[])for(let k=0;k<K;k++)strike(k,v0*GAIN.strike*.5);
      for(const m of music.melody||[]){const k=Math.floor((m.angle/TAU)*K+.5)%Math.max(1,K);strike(k,m.v*GAIN.tap);}}
    for(let k=0;k<K;k++){const w=omega[k],z=.08+.18*clamp(laws?.viscosity??.5),q=res[2*k],qd=res[2*k+1];res[2*k+1]=qd+(-w*w*q-2*z*w*qd)*DT;res[2*k]=q+res[2*k+1]*DT;}
    for(let s=0;s<2;s++)waves(DT/2);
    step++;time=step*DT;
  }
  // Gray-Scott, one step (dt = 1 in the chemistry's own time, times the region's speed). Version 2 scales both diffusions
  // by GRAIN: the same regimes (a change of length only), with features about half as large, so the world holds about
  // eight times as many structures and the hall's walls are built finely rather than of a few smooth cavities
  const Du=.2*GRAIN,Dv=.1*GRAIN;
  // (life, how fast the matter is changing, is measured on the second of a step's two)
  function chemistry(measure){
    for(let z=0;z<nz;z++){const zm=((z+nz-1)%nz)*sz,zp=((z+1)%nz)*sz,zo=z*sz;
      for(let y=0;y<ny;y++){const yo=y*sy,ym=((y+ny-1)%ny)*sy,yp=((y+1)%ny)*sy,row=yo+zo,a1=ym+zo,a2=yp+zo,a3=yo+zm,a4=yo+zp;
        for(let x=0;x<nx;x++){const i=x+row,xm=x?i-1:i+nx-1,xp=x<nx-1?i+1:i-nx+1;
          const uc=u[i],vc=v[i];
          const wx=gw[3*i],wy=gw[3*i+1],wz=gw[3*i+2];
          const lu=wx*(u[xm]+u[xp])+wy*(u[x+a1]+u[x+a2])+wz*(u[x+a3]+u[x+a4])-6*uc;
          const lv=wx*(v[xm]+v[xp])+wy*(v[x+a1]+v[x+a2])+wz*(v[x+a3]+v[x+a4])-6*vc;
          const uvv=uc*vc*vc,r=rate[i],f=F[i]+.012*nut[i];
          u2[i]=uc+r*(Du*lu-uvv+f*(1-uc));const nv=vc+r*(Dv*lv+uvv-(f+Kf[i])*vc);v2[i]=nv;
          if(measure){const dv=nv>vc?nv-vc:vc-nv;life[i]=life[i]*.97+dv*3;}}}}
    const a=u;u=u2;u2=a;const b=v;v=v2;v2=b;
  }
  // the supply: each passage releases a nutrient at its depended-on end; the circulation carries it through the passage
  // and around it, it spreads a little, decays, and feeds the chemistry where it arrives (the feed rises with it)
  function currents(){
    nut2.set(nut);
    for(const T of tubes){if(T.grow<=0)continue;
      for(let q=0;q<T.cells.length;q++)if(T.along[q]>.85){const i=T.cells[q];nut2[i]+=(1-nut2[i])*.08*T.w[q]*T.grow;}}
    for(let z=0;z<nz;z++){const zm=((z+nz-1)%nz)*sz,zp=((z+1)%nz)*sz,zo=z*sz;
      for(let y=0;y<ny;y++){const yo=y*sy,ym=((y+ny-1)%ny)*sy,yp=((y+1)%ny)*sy,row=yo+zo,a1=ym+zo,a2=yp+zo,a3=yo+zm,a4=yo+zp;
        for(let x=0;x<nx;x++){const i=x+row,c=nut2[i];
          const l=nut2[x?i-1:i+nx-1]+nut2[x<nx-1?i+1:i-nx+1]+nut2[x+a1]+nut2[x+a2]+nut2[x+a3]+nut2[x+a4]-6*c;
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
      for(let y=0;y<ny;y++){const yo=y*sy,ym=((y+ny-1)%ny)*sy,yp=((y+1)%ny)*sy,row=yo+zo,a1=ym+zo,a2=yp+zo,a3=yo+zm,a4=yo+zp;
        for(let x=0;x<nx;x++){const i=x+row,pc=p[i];
          const lp=p[x?i-1:i+nx-1]+p[x<nx-1?i+1:i-nx+1]+p[x+a1]+p[x+a2]+p[x+a3]+p[x+a4]-6*pc;
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
  return {nx,ny,nz,NC,get u(){return u;},get v(){return v;},nut,p,life,reg,reg2,blend,flow:()=>tubes.map(T=>({key:T.key,cells:T.adv.cells.length,gate:gateOf(T)})),seats:()=>seats,weights:()=>wts,subs:()=>subs,K:()=>K,laws:()=>laws_,tubes:()=>tubes,physics:P,res,
    get step(){return step;},get time(){return time;},advance,setStructure,hash:hashState,metrics,MAXK};
}

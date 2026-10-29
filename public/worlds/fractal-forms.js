// Fractal Continuum's formulas and layout (preview): the universe a recipe draws (a distance estimator in GLSL and its
// exact JS twin), how far it has unfolded at a moment, and where the project sits on its surface, as pure functions of
// the recipe, a model and a time (no rendering, no THREE, no clock, no randomness). The world (fractal.js) draws it;
// tests/fractal.test.js pins it.
//
//  - the project          -> the fractal: its formula (bulb, julia, box, kifs) and parameters come from the genome (the
//                            code's character and the identity's own stream); how many recursions it has unfolded from
//                            how much code exists at t (files and symbols), eased in as they are born
//  - subsystem (district) -> a region of the surface around a direction (slot k of a fixed spread sequence, in creation
//                            order, so a region never moves); the region swells outward with its files
//  - file (module)        -> a site on its region's surface: a direction on a golden spiral around the region's (index j
//                            in creation order: a file never moves), traced to the surface along that direction
// Fractal space: the form is normalized to a bounding radius of about R0 (the world scales it).
export const R0=1.15,MAX_IT=14,MIN_IT=2.5;
export const FORMS=['bulb','julia','box','kifs'];
const TAU=Math.PI*2,GOLD=Math.PI*(3-Math.sqrt(5));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
export function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rand(seed){let t=(seed>>>0)+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function basis(d){const u=norm(cross(Math.abs(d[1])<.9?[0,1,0]:[1,0,0],d));return [u,cross(d,u)];}
// A direction `ang` away from d, turned `around` it.
export function tilt(d,ang,around){const [u,v]=basis(d),c=Math.cos(ang),s=Math.sin(ang),ca=Math.cos(around),sa=Math.sin(around);
  return norm([d[0]*c+(u[0]*ca+v[0]*sa)*s,d[1]*c+(u[1]*ca+v[1]*sa)*s,d[2]*c+(u[2]*ca+v[2]*sa)*s]);}
// Rotation matrices (row-major 3x3 as 9 numbers) shared by GLSL (as mat3 literals) and JS.
export function rotation(ax,ay){const cx=Math.cos(ax),sx=Math.sin(ax),cy=Math.cos(ay),sy=Math.sin(ay);
  // R = Ry * Rx
  return [cy,sy*sx,sy*cx, 0,cx,-sx, -sy,cy*sx,cy*cx];}
const mul3=(m,x,y,z)=>[m[0]*x+m[1]*y+m[2]*z,m[3]*x+m[4]*y+m[5]*z,m[6]*x+m[7]*y+m[8]*z];
const glslMat=m=>`mat3(${[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]].map(f).join(',')})`;// column-major
function f(x){const s=(+x).toPrecision(9);return /[.e]/.test(s)?s:`${s}.`;}
// ---- The universe a recipe draws ------------------------------------------------------------------------------------
// The formula's constants from the genome (a tuned value is clamped to what the renderer handles).
export function formOf(recipe){
  const G=recipe?.genome||{},F=G.fractal||{};
  const form=FORMS.includes(F.form)?F.form:'bulb',power=Math.round(clamp(num(F.power,8),3,12)),twist=clamp(num(F.twist,0),0,1),shape=clamp(num(F.shape,.5),0,1);
  const julia=Math.round(clamp(num(F.julia,0),0,5)),detail=clamp(num(F.detail,1),.5,1.5),seed=(recipe?.projectSeed>>>0)||1;
  const cfg={form,power,twist,shape,julia,detail,seed};
  if(form==='bulb'||form==='julia'){
    // theta phase (twist) and phi phase (shape): continuous for an integer power
    cfg.tw=twist*Math.PI*.5;cfg.sp=(shape-.5)*Math.PI/power;cfg.bail=4;cfg.fudge=.8;cfg.itK=1;cfg.lod=1.9;
  }else if(form==='box'){
    // A Mandelbox (scale -1.5 .. -2.3: intricate from outside) whose iterations turn a little (twist)
    cfg.S=-(1.5+.8*shape);cfg.rot=rotation(twist*.55,twist*.4);cfg.mr2=.25;cfg.fr2=1;cfg.bail=40;cfg.fudge=.85;cfg.itK=1.25;cfg.lod=1.7;
  }else{
    // A kaleidoscopic IFS: octahedral folds between two turns, scale 1.9 .. 2.6, a Menger-like offset
    cfg.S=1.9+.7*shape;cfg.rot1=rotation(.06+twist*.32,.04+twist*.22);cfg.rot2=rotation(-.03-twist*.14,.08+twist*.26);
    cfg.C=norm([1,.55+.4*shape,.25+.5*twist]);cfg.bail=40;cfg.fudge=.9;cfg.itK=1.1;cfg.lod=cfg.S;
  }
  return cfg;
}
// The native formula's distance estimate after `it` (fractional) iterations, and an orbit trap (min |z|^2 and the
// minimum distance to three planes) for colour. JS twin of the GLSL below: the same function (the GLSL raises to the
// power by squarings, the JS by repeated products).
function nativeDE(cfg,x,y,z,it,trap){
  const n0=Math.floor(it),fr=it-n0;let zx=x,zy=y,zz=z,dr=1,r=Math.hypot(zx,zy,zz),d0=0,snap=false;
  let t0=1e9,t1=1e9,t2=1e9,t3=1e9;
  const P=cfg.power,cx=cfg.form==='julia'?cfg.jc[0]:x,cy=cfg.form==='julia'?cfg.jc[1]:y,cz=cfg.form==='julia'?cfg.jc[2]:z;
  for(let i=0;i<MAX_IT+1;i++){
    if(i===n0){d0=estimate(cfg,r,dr,zx,zy,zz);snap=true;}
    if(i>n0||r>cfg.bail)break;
    if(cfg.form==='bulb'||cfg.form==='julia'){
      const rr=Math.max(r,1e-9),rho=Math.max(Math.hypot(zx,zz),1e-12);
      // B = (y + i rho)^P (polar angle), A = ((z + i x)/rho)^P (azimuth), each turned by its phase
      let br=zy,bi=rho,ar=zz/rho,ai=zx/rho,Br=1,Bi=0,Ar=1,Ai=0;
      for(let k=0;k<P;k++){const nb=Br*br-Bi*bi;Bi=Br*bi+Bi*br;Br=nb;const na=Ar*ar-Ai*ai;Ai=Ar*ai+Ai*ar;Ar=na;}
      const ct=Math.cos(cfg.tw),st=Math.sin(cfg.tw),cp=Math.cos(cfg.sp),spp=Math.sin(cfg.sp);
      const B2r=Br*ct-Bi*st,B2i=Br*st+Bi*ct,A2r=Ar*cp-Ai*spp,A2i=Ar*spp+Ai*cp;
      dr=P*Math.hypot(Br,Bi)/rr*dr+(cfg.form==='julia'?0:1);
      zx=B2i*A2i+cx;zy=B2r+cy;zz=B2i*A2r+cz;
    }else if(cfg.form==='box'){
      zx=Math.min(1,Math.max(-1,zx))*2-zx;zy=Math.min(1,Math.max(-1,zy))*2-zy;zz=Math.min(1,Math.max(-1,zz))*2-zz;
      const r2=zx*zx+zy*zy+zz*zz;
      if(r2<cfg.mr2){const k=cfg.fr2/cfg.mr2;zx*=k;zy*=k;zz*=k;dr*=k;}else if(r2<cfg.fr2){const k=cfg.fr2/r2;zx*=k;zy*=k;zz*=k;dr*=k;}
      [zx,zy,zz]=mul3(cfg.rot,zx,zy,zz);
      zx=zx*cfg.S+x;zy=zy*cfg.S+y;zz=zz*cfg.S+z;dr=dr*Math.abs(cfg.S)+1;
    }else{
      [zx,zy,zz]=mul3(cfg.rot1,zx,zy,zz);
      zx=Math.abs(zx);zy=Math.abs(zy);zz=Math.abs(zz);
      if(zx<zy){const q=zx;zx=zy;zy=q;}if(zx<zz){const q=zx;zx=zz;zz=q;}if(zy<zz){const q=zy;zy=zz;zz=q;}
      [zx,zy,zz]=mul3(cfg.rot2,zx,zy,zz);
      const S=cfg.S,C=cfg.C;zx=S*zx-C[0]*(S-1);zy=S*zy-C[1]*(S-1);zz=S*zz;
      if(zz>.5*C[2]*(S-1))zz-=C[2]*(S-1);
      dr*=S;
    }
    r=Math.hypot(zx,zy,zz);
    t0=Math.min(t0,zx*zx+zy*zy+zz*zz);t1=Math.min(t1,Math.abs(zx));t2=Math.min(t2,Math.abs(zy));t3=Math.min(t3,Math.abs(zz));
  }
  const d1=estimate(cfg,r,dr,zx,zy,zz);if(!snap)d0=d1;
  if(trap){trap[0]=t0;trap[1]=t1;trap[2]=t2;trap[3]=t3;}
  return d0+(d1-d0)*fr;
}
// The distance at the end of the recursion: the potential of a bulb, a sphere of radius 2 for the box, a cube of half
// size 1 for the crystal (its facets are what make it a crystal), each scaled back by the derivative.
function estimate(cfg,r,dr,x,y,z){
  if(cfg.form==='bulb'||cfg.form==='julia'){const rr=Math.max(r,1e-9);return .5*Math.log(rr)*rr/dr;}
  if(cfg.form==='box')return (r-2)/Math.abs(dr);
  const qx=Math.abs(x)-1,qy=Math.abs(y)-1,qz=Math.abs(z)-1;
  return (Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0))/dr;
}
// GLSL of the same: float fde(vec3 p, float it, out vec4 trap) in native coordinates.
function glslDE(cfg){
  const P=cfg.power,bulb=cfg.form==='bulb'||cfg.form==='julia';
  const C=cfg.form==='julia'?`vec3(${cfg.jc.map(f).join(',')})`:'p';
  const est=bulb?'.5*log(max(r,1e-9))*max(r,1e-9)/dr':cfg.form==='box'?'(r-2.)/abs(dr)':'(length(max(abs(z)-1.,0.))+min(max(abs(z).x-1.,max(abs(z).y-1.,abs(z).z-1.)),0.))/dr';
  let step;
  // z^P for an integer P by an addition chain (squarings and products, no transcendental function)
  const chain=e=>{const out=[];let have=1;const bits=e.toString(2);for(let i=1;i<bits.length;i++){out.push('sq');have*=2;if(bits[i]==='1'){out.push('mul');have++;}}return out;};
  const cpow=(v,src)=>chain(P).map(op=>op==='sq'?`${v}=vec2(${v}.x*${v}.x-${v}.y*${v}.y,2.*${v}.x*${v}.y);`:`${v}=vec2(${v}.x*${src}.x-${v}.y*${src}.y,${v}.x*${src}.y+${v}.y*${src}.x);`).join('');
  if(bulb)step=`float rho=max(length(z.xz),1e-12);vec2 b=vec2(z.y,rho),a=vec2(z.z,z.x)/rho,B=b,A=a;
      ${cpow('B','b')}${cpow('A','a')}
      float rn=length(B);if(TWON>.5){B=vec2(B.x*TWC.x-B.y*TWC.y,B.x*TWC.y+B.y*TWC.x);A=vec2(A.x*SPC.x-A.y*SPC.y,A.x*SPC.y+A.y*SPC.x);}
      dr=${f(P)}*rn/max(r,1e-9)*dr+${cfg.form==='julia'?'0.':'1.'};
      z=vec3(B.y*A.y,B.x,B.y*A.x)+${C};`;
  else if(cfg.form==='box')step=`z=clamp(z,-1.,1.)*2.-z;float r2=dot(z,z);
      if(r2<${f(cfg.mr2)}){float k=${f(cfg.fr2/cfg.mr2)};z*=k;dr*=k;}else if(r2<${f(cfg.fr2)}){float k=${f(cfg.fr2)}/r2;z*=k;dr*=k;}
      z=BROT*z;z=z*BS+p;dr=dr*abs(BS)+1.;`;
  else step=`z=KR1*z;z=abs(z);
      if(z.x<z.y)z.xy=z.yx;if(z.x<z.z)z.xz=z.zx;if(z.y<z.z)z.yz=z.zy;
      z=KR2*z;
      z=vec3(${f(cfg.S)}*z.x-${f(cfg.C[0]*(cfg.S-1))},${f(cfg.S)}*z.y-${f(cfg.C[1]*(cfg.S-1))},${f(cfg.S)}*z.z);
      if(z.z>${f(.5*cfg.C[2]*(cfg.S-1))})z.z-=${f(cfg.C[2]*(cfg.S-1))};dr*=${f(cfg.S)};`;
  const body=trap=>`
  int n0=int(floor(it));float fr=it-float(n0);vec3 z=p;float dr=1.,r=length(z),d0=0.;bool snap=false;${trap?'trap=vec4(1e9);':''}
  for(int i=0;i<FIT;i++){
    if(i==n0){d0=${est};snap=true;}
    if(i>n0||r>${f(cfg.bail)})break;
    ${step}
    r=length(z);${trap?'trap=min(trap,vec4(dot(z,z),abs(z)));':''}
  }
  float d1=${est};if(!snap)d0=d1;
  return mix(d0,d1,fr);`;
  // (TWON: the phases are applied only when the identity has some or a bloom turns them; fde has no orbit trap, for the
  // march, fdeT has one, for the colour at the hit)
  return `
uniform vec2 TWC,SPC;uniform float TWON,BS;uniform int FIT;uniform mat3 BROT,KR1,KR2;
float fde(vec3 p,float it){${body(false)}}
float fdeT(vec3 p,float it,out vec4 trap){${body(true)}}`;
}
// The formula, normalized to a bounding radius of R0: de(x, y, z, it) in fractal space, its GLSL, and the radius along
// a direction (the surface seen from outside).
export function createFormula(recipe){
  const cfg=formOf(recipe);
  if(cfg.form==='julia'){
    // A Julia constant just inside the bulb of the same power along one of six directions: a connected Julia set
    const base={...cfg,form:'bulb'},dirs=[[.62,.48,.62],[.2,.95,.25],[.85,-.2,.5],[-.4,.7,-.6],[.95,.1,-.3],[.3,-.6,.75]].map(norm),u=dirs[cfg.julia];
    let r=1.6;for(let k=0;k<200;k++){const d=nativeDE(base,u[0]*r,u[1]*r,u[2]*r,8);if(d<1e-4)break;r-=d*.8;if(r<.1)break;}
    const k=.86+.05*(cfg.julia%3);cfg.jc=[u[0]*r*k,u[1]*r*k,u[2]*r*k];
  }
  // The native bounding radius, from rays at full detail along 96 directions.
  let Rn=0;const it=Math.min(MAX_IT,9*cfg.itK);
  for(let k=0;k<96;k++){const y=1-2*(k+.5)/96,s=Math.sqrt(1-y*y),a=k*GOLD,u=[Math.cos(a)*s,y,Math.sin(a)*s];Rn=Math.max(Rn,radialNative(cfg,u,it,4));}
  cfg.k=Math.max(.2,Rn*1.03)/R0;cfg.Rn=Rn;
  const K=cfg.k;
  return {cfg,
    de(x,y,z,it,trap=null){return nativeDE(cfg,x*K,y*K,z*K,it,trap)/K;},
    // The radius at which a ray from outside along -u first meets the surface (fractal space), or null.
    radial(u,it){const r=radialNative(cfg,u,it,R0*1.6*K);return r===null?null:r/K;},
    glsl:`${glslDE(cfg)}
const float FK=${f(K)};
float fdeN(vec3 p,float it){return fde(p*FK,it)/FK;}
float fdeNT(vec3 p,float it,out vec4 trap){return fdeT(p*FK,it,trap)/FK;}`,
    twist:{tw:cfg.tw??0,sp:cfg.sp??0}};
}
function radialNative(cfg,u,it,from){
  let r=from;const eps=2e-4*from;
  for(let k=0;k<400;k++){const d=nativeDE(cfg,u[0]*r,u[1]*r,u[2]*r,it);if(d<eps)return r;r-=Math.max(d*cfg.fudge,eps*.5);if(r<from*.01)return null;}
  return r;
}
// ---- Unfolding: how many recursions exist at t ---------------------------------------------------------------------
// The live code at t (files, and symbols at a quarter weight), each eased in over 2.6 s from its birth (and out after its
// removal). Iterations grow with its logarithm: an empty project is a smooth seed, a large one fully unfolded.
export function massAt(model,t,speed=1){
  let m=0;const ease=x=>model.alive(x,t)?smooth((t-model.bornAt(x))/(2600*speed))*(x.removed===null?1:1-smooth((t-x.removed)/(1600*speed))):0;
  for(const x of model.modules.values())m+=ease(x);
  for(const s of model.symbols.values())m+=.25*ease(s);
  return m;
}
// How many recursions the pixels can hold at a pixel footprint (fractal units): detail stays above about 1.5 pixels, so
// the form unfolds further as the camera comes closer instead of turning to noise.
export function detailCap(cfg,footprint){return Math.max(MIN_IT+1,Math.log(R0/Math.max(1e-6,1.5*footprint))/Math.log(cfg.lod||2)+1);}
export function unfoldAt(cfg,mass){return clamp(MIN_IT+(.95*cfg.detail*Math.log2(1+Math.max(0,mass)))*(cfg.itK||1),MIN_IT,MAX_IT-.001);}
// ---- Layout: regions and sites ----------------------------------------------------------------------------------------
// Slot k's direction: a fixed sequence (seeded per identity) whose first slots stand far apart, kept to the band the
// camera sees best (latitude -35 .. 70 degrees). Slot k depends only on k: asking for more slots (a project with more
// subsystems than 24) continues the sequence and leaves the first ones where they are.
export function regionSlots(seed,count=24){
  const cand=[];for(let k=0;k<600;k++){const y=1-2*(k+.5)/600,s=Math.sqrt(1-y*y),a=k*GOLD+rand(seed)*TAU;const lat=Math.asin(y);if(lat<-.61||lat>1.22)continue;cand.push([Math.cos(a)*s,y,Math.sin(a)*s]);}
  const out=[cand[Math.floor(rand(seed+1)*cand.length)]],far=cand.map(()=>Infinity);
  // far[i]: candidate i's distance to the nearest slot so far (the next slot is the candidate farthest from all of them)
  while(out.length<count){const o=out.at(-1);let best=null,bd=-1;
    cand.forEach((c,i)=>{far[i]=Math.min(far[i],1-(c[0]*o[0]+c[1]*o[1]+c[2]*o[2]));if(far[i]>bd){bd=far[i];best=c;}});out.push(best);}
  return out;
}
// File j of a region: a golden spiral around the region's direction, at angular spacing `spacing` (radians).
export function siteDirection(regionDir,j,spacing,salt=0){
  if(j===0)return tilt(regionDir,spacing*.25,rand(salt)*TAU);
  return tilt(regionDir,spacing*Math.sqrt(j+.25),j*GOLD+rand(salt)*TAU);
}
export function layoutConfig(recipe){
  const G=recipe?.genome||{},geo=G.geometry||{};
  return {seed:(recipe?.projectSeed>>>0)||1,spacing:clamp(num(geo.spacing,.2),.03,.8),regions:clamp(num(geo.regions,1),.4,2),swell:clamp(num(geo.swell,.3),0,.7)};
}
// The regions and sites alive at t, in creation order (pure; a region keeps its slot, a file its spiral index).
export function layoutAt(model,t,cfg,slots){
  const districts=[...model.districts.values()].filter(d=>model.districtBorn(d)<=t).sort((a,b)=>a.order-b.order||(a.id<b.id?-1:1));
  const regions=[],sites=[];
  districts.forEach((d,k)=>{const dir=slots[k%slots.length],files=[];
    const mods=d.members.map(id=>model.modules.get(id)).filter(m=>m&&model.bornAt(m)<=t).sort((a,b)=>a.order-b.order);
    mods.forEach((m,j)=>{const site={id:m.id,region:d.id,j,dir:siteDirection(dir,j,cfg.spacing,hash(d.id)),alive:model.alive(m,t)};files.push(site);sites.push(site);});
    const live=files.filter(s=>s.alive).length;
    regions.push({id:d.id,k,dir,files:files.map(s=>s.id),live,extent:cfg.spacing*Math.sqrt(Math.max(1,files.length)+.5)*cfg.regions});});
  return {regions,sites};
}
// A region's swell weight at t (its live files, each eased in at birth): log-scaled against the largest region.
export function regionWeights(model,t,regions,speed=1){
  const w=regions.map(r=>{let x=0;for(const id of r.files){const m=model.modules.get(id);if(m&&model.alive(m,t))x+=smooth((t-model.bornAt(m))/(2600*speed))*(m.removed===null?1:1-smooth((t-m.removed)/(1600*speed)));}return Math.log2(1+x);});
  const max=Math.max(1,...w);return w.map(x=>x/max);
}
// The kernel of a region (its falloff in 1 - cos of the angle from its direction): wide enough to keep the estimator safe.
export const kappaOf=r=>clamp(r.extent*r.extent*.9,.12,.6);
// The swell factor along u: 1 + swell * (sum of the regions' kernels, at most 1). The GLSL samples the same function
// from an equirectangular table (fractal.js swellTable); the JS evaluates it exactly.
export function swellAt(u,regions,weights,swell){
  let s=0;for(let k=0;k<regions.length;k++){const R=regions[k],c=u[0]*R.dir[0]+u[1]*R.dir[1]+u[2]*R.dir[2];s+=weights[k]*Math.exp((c-1)/kappaOf(R));}
  return 1+swell*Math.min(1,s);
}
// Spontaneous pulses on the beat grid: the last two beats (at or before `beat`) on which a seeded draw fired.
export function spontaneous(seed,beat,p,scan=64){
  let a=null;const P=typeof p==='function'?p:()=>p;
  for(let k=beat;k>beat-scan;k--){if(rand((seed^Math.imul(k|0,0x9e3779b1))>>>0)<P(k)){if(a===null)a=k;else return [a,k];}}
  return [a,null];
}

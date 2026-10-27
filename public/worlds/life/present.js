// Presentation helpers for a world's digital life: interpolated positions, trails newest first, visual followers and
// field textures. Presentation only: nothing here writes to the ecosystem, so frame rate and quality never change it.
//
// Population hierarchy: the ecosystem's entities are the authoritative inhabitants (they sense, decide and deposit).
// A world may draw followers around each one (quality decides how many): a follower is placed on its leader's own
// recorded path (its trail ring), a little behind and to the side, so it takes the same currents, gathers at the same
// crowns and flees the same disturbances: the same ecology, more bodies. Followers never act on the fields.
//
// Every value is a pure function of the ecosystem's state, the presentation fraction (alpha) and the view time.
import {u01} from './sim.js';
// The entity's position at the presentation time: from the previous tick toward the current one.
export function position(eco,i,alpha,out){
  out[0]=eco.qx[i]+(eco.px[i]-eco.qx[i])*alpha;out[1]=eco.qy[i]+(eco.py[i]-eco.qy[i])*alpha;out[2]=eco.qz[i]+(eco.pz[i]-eco.qz[i])*alpha;return out;
}
// The trail of entity i, newest first: k = 0 is the interpolated position, then the ring's points from newest to
// oldest (K points, TRAIL_EVERY ticks apart). cb(k, x, y, z, age) with age 0..1 (1: the oldest point kept).
export function trail(eco,i,alpha,cb,maxPoints=eco.K+1){
  const K=eco.K,h=eco.trailHead,o=i*K,p=position(eco,i,alpha,tmp);
  const n=Math.min(maxPoints,K+1);cb(0,p[0],p[1],p[2],0);
  for(let k=1;k<n;k++){const q=o+((h-k+1+K*4)%K);cb(k,eco.tx[q],eco.ty[q],eco.tz[q],k/K);}
}
const tmp=[0,0,0];
// Follower f (0..F-1) of entity i: on the leader's path, `lag` (0..1) of its trail behind, offset to the side by a
// seeded radius that breathes slowly. Returns false when the leader is not alive.
export function follower(eco,i,f,F,alpha,tview,out,{spread=.35,lag=.8}={}){
  if(!eco.alive[i])return false;
  const K=eco.K,h=eco.trailHead,o=i*K,s=eco.seed,g=eco.gen[i];
  const u=(f+1)/(F+1)*lag*(K-1),k0=Math.floor(u),w=u-k0;
  const p=position(eco,i,alpha,tmp),a=k0===0?p:null;
  const q0=o+((h-k0+1+K*4)%K),q1=o+((h-k0+K*4)%K);
  const x0=a?a[0]:eco.tx[q0],y0=a?a[1]:eco.ty[q0],z0=a?a[2]:eco.tz[q0];
  out[0]=x0+(eco.tx[q1]-x0)*w;out[1]=y0+(eco.ty[q1]-y0)*w;out[2]=z0+(eco.tz[q1]-z0)*w;
  const r=spread*(.4+.6*u01(s,i,g,f*3+1)),ph=u01(s,i,g,f*3+2)*6.2832,sp=.4+.8*u01(s,i,g,f*3+3);
  out[0]+=Math.cos(ph+tview*sp)*r;out[1]+=Math.sin(ph*1.7+tview*sp*.7)*r*.5;out[2]+=Math.sin(ph+tview*sp)*r;
  return true;
}
// A field as an RGBA8 texture (r: trail, g: energy, b: disturbance, a: density), normalised by `scale` per channel;
// worlds sample it in their shaders (channel glow, crown light, haze). update() rewrites it in place (64x64: 16 KB).
export function fieldTexture(THREE,eco,{scale=[3,3,3,6]}={}){
  const {nx,nz,data,density}=eco.field,NC=nx*nz,buf=new Uint8Array(NC*4);
  const tex=new THREE.DataTexture(buf,nx,nz,THREE.RGBAFormat,THREE.UnsignedByteType);
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;tex.needsUpdate=true;
  const b=v=>v<=0?0:v>=1?255:(v*255+.5)|0;
  return {texture:tex,min:eco.field.min,max:eco.field.max,
    update(){for(let q=0;q<NC;q++){buf[q*4]=b(data[q]/scale[0]);buf[q*4+1]=b(data[NC+q]/scale[1]);buf[q*4+2]=b(data[2*NC+q]/scale[2]);buf[q*4+3]=b(density[q]/scale[3]);}tex.needsUpdate=true;},
    dispose(){tex.dispose();}};
}
// How visible an entity is: born fading in, departing fading out; the whole population fades in after a restore and,
// in a replay or a film, crossfades at a generation's anchor (view.fadeIn). A world scales whatever else it draws from
// the ecosystem (field-driven light: crowns, gas and matter maps, lit copings and cables) by view.fadeIn too.
export const visibility=(eco,i,view)=>eco.alive[i]?Math.max(0,Math.min(1,eco.fade[i]))*view.fadeIn*(view.restoring?0:1):0;

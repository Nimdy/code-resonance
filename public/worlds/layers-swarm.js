// Artist particle populations: the digital life's concepts (cohesion, separation, alignment, attraction to sites,
// lifetimes, a fixed step) for a composition's particle layers. Pure (no rendering), tested in Node
// (tests/layers-swarm.test.js).
//
// Space: positions are in the composition's normalised units (the world's half extent is 1), relative to its centre;
// sites are where the layer is anchored (subsystems, nodes, the centre …), each with a radius.
// Clock: view time (seconds since the performance's origin), stepped at HZ. Like the life driver's replays, the state
// shown at view time v belongs to v's generation: generation g starts WARM seconds before g * GEN from its seeded
// distribution and runs on the inputs at each tick's time, so a seek (or a film's first frame) and continuous play
// show the same population. Around each generation's start the outgoing and incoming populations crossfade over
// 2 * CROSS seconds. Random choices come from a counter-based hash of (seed, generation, slot, respawn), never
// Math.random.
export const HZ=15,DT=1/HZ,GEN=24,WARM=6,CROSS=1.5,TRAIL=8;
export const BEHAVIORS=['swarm','orbit','drift','flock'],DISTRIBUTIONS=['cloud','disc','shell','anchors'];
function mix(a,b,c=0,d=0){
  let h=(a^Math.imul(b|0,0x9e3779b1)^Math.imul(c|0,0x85ebca77)^Math.imul(d|0,0xc2b2ae3d))>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;return h>>>0;
}
const u01=(a,b,c,d)=>mix(a,b,c,d)/4294967296;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// Sites from anchors: {n, x, y, z, r} (typed arrays; at most MAX_SITES).
export const MAX_SITES=64;
export function sitesOf(list){
  const n=Math.max(1,Math.min(MAX_SITES,list?.length||0)),S={n,x:new Float32Array(n),y:new Float32Array(n),z:new Float32Array(n),r:new Float32Array(n)};
  if(!list?.length){S.r[0]=1;return S;}
  for(let k=0;k<n;k++){const s=list[k];S.x[k]=s.x||0;S.y[k]=s.y||0;S.z[k]=s.z||0;S.r[k]=Math.max(.02,s.r||.2);}
  return S;
}
// Simulation parameters from a layer's (mapped) values: composition.js particle params.
export function simParams(p){
  return {behavior:BEHAVIORS.includes(p.behavior)?p.behavior:'swarm',distribution:DISTRIBUTIONS.includes(p.distribution)?p.distribution:'cloud',
    spread:clamp(+p.spread||1,.05,4)*clamp(+p.scale||1,.1,3),cohesion:clamp(+p.cohesion||0),separation:clamp(+p.separation||0),alignment:clamp(+p.alignment||0),
    attraction:clamp(+p.attraction||0,-1,1),speed:clamp(+p.speed||0,0,4),lifetime:clamp(+p.lifetime||8,.5,20)};
}
export function createSwarm({seed=1,capacity=1000,generation=0}={}){
  const cap=Math.max(1,capacity|0),S0=seed>>>0,G=generation|0;
  const px=new Float32Array(cap),py=new Float32Array(cap),pz=new Float32Array(cap),vx=new Float32Array(cap),vy=new Float32Array(cap),vz=new Float32Array(cap);
  const qx=new Float32Array(cap),qy=new Float32Array(cap),qz=new Float32Array(cap),age=new Float32Array(cap),life=new Float32Array(cap);
  const site=new Uint8Array(cap),spawns=new Uint32Array(cap),nb=new Uint8Array(cap);
  const tx=new Float32Array(cap*TRAIL),ty=new Float32Array(cap*TRAIL),tz=new Float32Array(cap*TRAIL);
  // Spatial hash (cells of the perception radius), rebuilt every tick.
  const TABLE=4096,head=new Int32Array(TABLE),next=new Int32Array(cap);
  const ARRAYS={px,py,pz,vx,vy,vz,age,life};
  // Each particle's own orbit: an axis tilted from the vertical (an electron cloud, not a disc) and a radius band.
  const ox3=new Float32Array(cap*3),band0=new Float32Array(cap);
  for(let i=0;i<cap;i++){const tilt=(u01(S0,i,7)-.5)*1.3,yaw=u01(S0,i,9)*6.2831853;ox3[i*3]=Math.sin(tilt)*Math.cos(yaw);ox3[i*3+1]=Math.cos(tilt);ox3[i*3+2]=Math.sin(tilt)*Math.sin(yaw);band0[i]=.45+.55*u01(S0,i,11);}
  let tick=0,cell=.2,metrics={density:0,current:0,coherence:0,disturbance:0,field:0,trails:0};
  // Fade of particle i: in after birth, out before its lifetime ends (never a pop).
  const fade=i=>smooth(age[i]/.7)*smooth((life[i]-age[i])/.9);
  const r=(i,k)=>u01(S0,G*65536+i,spawns[i],k);
  // A particle's site: sites in turn (so each holds its share), then its place in the distribution around it.
  function spawn(i,S,P,initial=false){
    const k=(i+spawns[i]*7)%S.n,R=S.r[k]*P.spread,h1=r(i,1),h2=r(i,2),h3=r(i,3);site[i]=k;
    let x=0,y=0,z=0;const th=h1*6.2831853,ph=Math.acos(2*h2-1),dx=Math.sin(ph)*Math.cos(th),dy=Math.cos(ph),dz=Math.sin(ph)*Math.sin(th);
    if(P.distribution==='disc'){const d=R*Math.sqrt(h3);x=Math.cos(th)*d;z=Math.sin(th)*d;y=(h2-.5)*R*.1;}
    else if(P.distribution==='shell'){const d=R*(.9+.1*h3);x=dx*d;y=dy*d;z=dz*d;}
    else if(P.distribution==='anchors'){const d=R*.12*h3;x=dx*d;y=dy*d;z=dz*d;}
    else{const d=R*Math.cbrt(h3)*.85;x=dx*d;y=dy*d*.8;z=dz*d;}
    px[i]=S.x[k]+x;py[i]=S.y[k]+y;pz[i]=S.z[k]+z;
    const v=.15*R*(P.speed+.1),out=P.distribution==='anchors'?2.5:1;
    vx[i]=(dx*out+(r(i,4)-.5))*v;vy[i]=(dy*out+(r(i,5)-.5))*v*.6;vz[i]=(dz*out+(r(i,6)-.5))*v;
    life[i]=P.lifetime*(.6+.8*r(i,7));age[i]=initial?life[i]*r(i,8):0;
    qx[i]=px[i];qy[i]=py[i];qz[i]=pz[i];
    for(let t=0;t<TRAIL;t++){const o=i*TRAIL+t;tx[o]=px[i];ty[o]=py[i];tz[o]=pz[i];}
  }
  function populate(S,P){for(let i=0;i<cap;i++){spawns[i]=0;spawn(i,S,P,true);}tick=0;}
  const key=(x,y,z)=>(Math.imul(Math.floor(x/cell),73856093)^Math.imul(Math.floor(y/cell),19349663)^Math.imul(Math.floor(z/cell),83492791))&(TABLE-1);
  function grid(){head.fill(-1);for(let i=0;i<cap;i++){const k=key(px[i],py[i],pz[i]);next[i]=head[k];head[k]=i;}}
  // One fixed step. P: simParams; S: sites; t: the step's view time (seconds).
  function step(P,S,t){
    let meanR=0;for(let k=0;k<S.n;k++)meanR+=S.r[k];meanR=meanR/S.n*P.spread;
    cell=clamp(meanR*.32,.02,.6);grid();
    const B=P.behavior,rs=cell*.45,rs2=rs*rs,c2=cell*cell;
    let sumN=0,sumV=0,crowd=0,lively=0;const gvx=new Float64Array(S.n),gvy=new Float64Array(S.n),gvz=new Float64Array(S.n),gsp=new Float64Array(S.n);
    for(let i=0;i<cap;i++){qx[i]=px[i];qy[i]=py[i];qz[i]=pz[i];}
    for(let i=0;i<cap;i++){
      const k=site[i]<S.n?site[i]:site[i]%S.n,R=S.r[k]*P.spread,vmax=(.04+.5*P.speed)*R*(B==='drift'?.45:B==='flock'?1.25:1),vmin=vmax*(B==='flock'?.45:B==='orbit'?.35:B==='swarm'?.12:.02);
      const x=qx[i],y=qy[i],z=qz[i],sx=S.x[k],sy=S.y[k],sz=S.z[k],h=(i*.61803398875)%1;
      // Neighbours: the 2x2x2 cells nearest the particle (cells are the perception radius), at most 10 within it.
      let n=0,close=0,ax=0,ay=0,az=0,cx=0,cy=0,cz=0,ex=0,ey=0,ez=0;
      const fxc=x/cell,fyc=y/cell,fzc=z/cell,gx=Math.floor(fxc),gy=Math.floor(fyc),gz=Math.floor(fzc);
      const ox=fxc-gx<.5?-1:0,oy=fyc-gy<.5?-1:0,oz=fzc-gz<.5?-1:0;
      search:for(let a=ox;a<=ox+1;a++)for(let b=oy;b<=oy+1;b++)for(let c=oz;c<=oz+1;c++){
        let j=head[(Math.imul(gx+a,73856093)^Math.imul(gy+b,19349663)^Math.imul(gz+c,83492791))&(TABLE-1)];
        for(;j>=0;j=next[j]){if(j===i)continue;const dx=x-qx[j],dy=y-qy[j],dz=z-qz[j],d2=dx*dx+dy*dy+dz*dz;if(d2>c2)continue;
          n++;ax+=vx[j];ay+=vy[j];az+=vz[j];cx+=qx[j];cy+=qy[j];cz+=qz[j];if(d2<rs2&&d2>1e-10){close++;const w=1/d2;ex+=dx*w;ey+=dy*w;ez+=dz*w;}
          if(n>=10)break search;}}
      nb[i]=n;sumN+=n;if(close>=3)crowd++;
      let fx=0,fy=0,fz=0;const W=vmax*2.2;
      if(n){const sep=P.separation*rs*rs*W*.9;fx+=ex*sep;fy+=ey*sep;fz+=ez*sep;
        const al=P.alignment*(B==='flock'?2.2:1.1);fx+=(ax/n-vx[i])*al;fy+=(ay/n-vy[i])*al;fz+=(az/n-vz[i])*al;
        const co=P.cohesion*(B==='flock'?2.4:1.4)/Math.max(cell,1e-3)*vmax;fx+=(cx/n-x)*co;fy+=(cy/n-y)*co;fz+=(cz/n-z)*co;}
      const dx=sx-x,dy=sy-y,dz=sz-z,dist=Math.sqrt(dx*dx+dy*dy+dz*dz)+1e-6,A=P.attraction;
      if(B==='orbit'){
        // Orbits about a tilted axis per particle (an electron cloud around the site), pulled to a radius band.
        const kx=ox3[i*3],ky=ox3[i*3+1],kz=ox3[i*3+2];
        const ox=-dx,oy=-dy,oz=-dz,along=ox*kx+oy*ky+oz*kz,rx=ox-kx*along,ry=oy-ky*along,rz=oz-kz*along,rr=Math.sqrt(rx*rx+ry*ry+rz*rz)+1e-6;
        let tx0=ky*rz-kz*ry,ty0=kz*rx-kx*rz,tz0=kx*ry-ky*rx;const tl=Math.sqrt(tx0*tx0+ty0*ty0+tz0*tz0)+1e-6,dir=h<.5?1:-1;tx0*=dir/tl;ty0*=dir/tl;tz0*=dir/tl;
        const band=R*band0[i],pull=(band-rr)/R*(1+2*Math.abs(A)),flat=-along/R*1.8;
        const dvx=tx0*vmax+rx/rr*pull*vmax+kx*flat*vmax,dvy=ty0*vmax+ry/rr*pull*vmax+ky*flat*vmax,dvz=tz0*vmax+rz/rr*pull*vmax+kz*flat*vmax;
        fx+=(dvx-vx[i])*2.2;fy+=(dvy-vy[i])*2.2;fz+=(dvz-vz[i])*2.2;
      }else if(B==='drift'){
        // A slow curling current (divergence-free: the curl of a field of sines) carries spores; they rise a little.
        // Psi = (sin(1.3Y+.7Z+T), sin(1.1Z+.9X-.8T), sin(1.2X+.8Y+1.1T)); F = curl Psi.
        const q=1.6/Math.max(R,.05),T=t*.07,X=(x-sx)*q,Y=(y-sy)*q,Z=(z-sz)*q;
        const c1=Math.cos(1.3*Y+.7*Z+T),c2=Math.cos(1.1*Z+.9*X-T*.8),c3=Math.cos(1.2*X+.8*Y+T*1.1);
        const dvx=(.8*c3-1.1*c2)*vmax*.75,dvy=((.7*c1-1.2*c3)*.5+.3)*vmax*.5,dvz=(.9*c2-1.3*c1)*vmax*.75;
        fx+=(dvx-vx[i])*1.2;fy+=(dvy-vy[i])*1.2;fz+=(dvz-vz[i])*1.2;
        if(dist>R){const k2=(dist-R)/R*vmax*(.6+A);fx+=dx/dist*k2;fy+=dy/dist*k2;fz+=dz/dist*k2;}
      }else if(B==='flock'){
        // Murmurations: a leader wanders a slow Lissajous path around the site; the flock follows it as one.
        const ph=k*1.7,lx=sx+R*1.1*Math.sin(t*.11+ph),ly=sy+R*.35*Math.sin(t*.23+ph*2),lz=sz+R*1.1*Math.sin(t*.07+1.7+ph);
        const ldx=lx-x,ldy=ly-y,ldz=lz-z,ld=Math.sqrt(ldx*ldx+ldy*ldy+ldz*ldz)+1e-6,a=(.35+Math.max(0,A))*vmax*1.6;
        fx+=ldx/ld*a;fy+=ldy/ld*a;fz+=ldz/ld*a;
        if(dist>R*2.4){const k2=(dist-R*2.4)/R*vmax*2;fx+=dx/dist*k2;fy+=dy/dist*k2;fz+=dz/dist*k2;}
      }else{
        // Swarm: buzzing about a point that wanders near the site, each particle with its own wander.
        const ph=h*6.2831853,wx=sx+R*.45*Math.sin(t*.7+k),wy=sy+R*.3*Math.sin(t*.53+k*2),wz=sz+R*.45*Math.cos(t*.61+k);
        const wdx=wx-x,wdy=wy-y,wdz=wz-z;fx+=wdx/R*vmax*1.4*A;fy+=wdy/R*vmax*1.4*A;fz+=wdz/R*vmax*1.4*A;
        fx+=Math.sin(t*1.3+ph)*vmax*1.1;fy+=Math.sin(t*1.1+ph*2.3)*vmax*.7;fz+=Math.cos(t*1.7+ph*1.7)*vmax*1.1;
        if(dist>R*1.8){const k2=(dist-R*1.8)/R*vmax*2.5;fx+=dx/dist*k2;fy+=dy/dist*k2;fz+=dz/dist*k2;}
      }
      // Repulsion (negative attraction): the site keeps a void around it.
      if(A<0&&dist<R*1.2){const k2=-A*(1-dist/(R*1.2))*vmax*3;fx-=dx/dist*k2;fy-=dy/dist*k2;fz-=dz/dist*k2;}
      const fm=Math.sqrt(fx*fx+fy*fy+fz*fz),fmax=vmax*6;if(fm>fmax){fx*=fmax/fm;fy*=fmax/fm;fz*=fmax/fm;}
      let nx=vx[i]+fx*DT,ny=vy[i]+fy*DT,nz=vz[i]+fz*DT;nx*=1-.08*DT;ny*=1-.08*DT;nz*=1-.08*DT;
      const s=Math.sqrt(nx*nx+ny*ny+nz*nz)+1e-9,cl=clamp(s,vmin,vmax)/s;nx*=cl;ny*=cl;nz*=cl;
      vx[i]=nx;vy[i]=ny;vz[i]=nz;px[i]=x+nx*DT;py[i]=y+ny*DT;pz[i]=z+nz*DT;
      const rel=s*cl/Math.max(vmax,1e-6);sumV+=rel;lively+=rel*fade(i);
      gvx[k]+=nx;gvy[k]+=ny;gvz[k]+=nz;gsp[k]+=s*cl;
      age[i]+=DT;if(age[i]>=life[i]){spawns[i]++;spawn(i,S,P);}
    }
    tick++;const slot=tick%TRAIL;
    for(let i=0;i<cap;i++){const o=i*TRAIL+slot;tx[o]=px[i];ty[o]=py[i];tz[o]=pz[i];}
    let coh=0,w=0;for(let k=0;k<S.n;k++)if(gsp[k]>1e-9){coh+=Math.sqrt(gvx[k]*gvx[k]+gvy[k]*gvy[k]+gvz[k]*gvz[k]);w+=gsp[k];}
    // The population's own environment (env.* when there is no digital life): how gathered, how fast, how aligned,
    // how crowded (three or more neighbours within personal space), and its liveliness for field and trails.
    metrics={density:clamp(sumN/cap/10),current:clamp(sumV/cap),coherence:w?clamp(coh/w):0,disturbance:clamp(crowd/cap*1.5),field:lively/cap,trails:lively/cap};
  }
  function digest(){let h=2166136261;for(const v of Object.values(ARRAYS)){const b=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);for(let i=0;i<b.length;i++){h^=b[i];h=Math.imul(h,16777619);}}
    h^=tick;h=Math.imul(h,16777619);return (h>>>0).toString(16).padStart(8,'0');}
  return {capacity:cap,seed:S0,generation:G,px,py,pz,vx,vy,vz,qx,qy,qz,age,life,site,nb,tx,ty,tz,populate,step,fade,digest,
    get tick(){return tick;},get metrics(){return metrics;},get trailHead(){return tick%TRAIL;}};
}
// Generations at view time v: the populations shown and their weights (they sum to 1).
export function shown(v){
  const g=Math.floor(v/GEN),a=g*GEN,b=a+GEN;
  if(g>0&&v-a<CROSS){const w=smooth((v-a+CROSS)/(2*CROSS));return [{g:g-1,w:1-w},{g,w}];}
  if(b-v<CROSS){const w=smooth((v-b+CROSS)/(2*CROSS));return [{g,w:1-w},{g:g+1,w}];}
  return [{g,w:1}];
}
export const startOf=g=>g*GEN-WARM;
// The populations a layer keeps at view time v: those shown, plus the next one once its warm start has begun.
export function needed(v){const list=shown(v).map(x=>x.g),g=Math.floor(v/GEN);if(v>=startOf(g+1)&&!list.includes(g+1))list.push(g+1);return list;}
// Runs the generations. inputsAt(t, run) -> {P: simParams, S: sites} for the tick at view time t (run.filters is the
// run's own state for smoothing its inputs tick by tick). advance(v, {budgetMs}) steps every needed generation up to
// v (live playback within a time budget per frame; films without one) and returns what to draw.
export function createRunner({seed=1,capacity=1000,inputsAt}){
  const runs=new Map();let restoring=false;
  function fresh(g){const s=createSwarm({seed,capacity,generation:g}),t0=startOf(g),run={g,swarm:s,filters:new Map(),shownSince:-Infinity};
    const {P,S}=inputsAt(t0,run);s.populate(S,P);runs.set(g,run);return run;}
  function advance(v,{budgetMs=Infinity,now=()=>performance.now()}={}){
    const began=now(),keep=needed(v);restoring=false;
    for(const g of [...runs.keys()])if(!keep.includes(g))runs.delete(g);
    for(const g of keep){
      const target=Math.max(0,Math.floor((v-startOf(g))*HZ+1e-6));let run=runs.get(g);
      if(!run||run.swarm.tick>target){run=fresh(g);run.shownSince=-Infinity;}
      while(run.swarm.tick<target){if(now()-began>budgetMs)break;const t=startOf(g)+(run.swarm.tick+1)*DT,{P,S}=inputsAt(t,run);run.swarm.step(P,S,t);}
      if(run.swarm.tick<target-1){restoring=true;run.shownSince=-Infinity;}else if(run.shownSince===-Infinity)run.shownSince=v;
    }
    const out=[];
    for(const {g,w} of shown(v)){const run=runs.get(g);if(!run||run.shownSince===-Infinity)continue;
      const caught=run.shownSince<=startOf(g)+WARM-CROSS?1:clamp((v-run.shownSince)/.6);
      // alpha: where v lies between the previous tick and the current one (the shown state trails v by a tick).
      out.push({g,run,swarm:run.swarm,weight:w*caught,alpha:clamp((v-startOf(g))*HZ-run.swarm.tick)});}
    return out;
  }
  return {advance,reset(){runs.clear();},get restoring(){return restoring;},get runs(){return runs;}};
}

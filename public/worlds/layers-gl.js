// Artist layers' rendering: one renderer per layer type, each a few instanced or buffer geometries with one
// ShaderMaterial, drawn in the world's own HDR scene pass (the finish, bloom and aberration treat them as the world).
// Depth classes are real draw order and depth state: behind (pushed to the far plane, so everything in the world draws
// over it), integrated (depth-tested with the world), front (over everything, no depth test). Blends: add, screen,
// normal, all premultiplied. THREE is passed in (no module state); the forms come from layers-forms.js, the particle
// populations from layers-swarm.js.
import {fractal,structure,ribbonSeeds,streamline,SEG,TIP,LINE,VERT,POINT,BODY,hash} from './layers-forms.js';
import {createRunner,simParams,sitesOf,TRAIL,DT as SWARM_DT} from './layers-swarm.js';
export const GPU_SITES=16,GROUPS=24;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
// ---- Shared GLSL ------------------------------------------------------------------------------------------------------
const COMMON=`uniform float uOpacity,uBright,uHue,uFar,uClock,uPx,uScale;
vec3 hueShift(vec3 c,float h){if(abs(h)<1e-4)return c;const vec3 k=vec3(.57735027);float a=h*6.2831853,ca=cos(a);return max(c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca),0.);}
vec3 rotAxis(vec3 p,vec3 k,float a){float c=cos(a),s=sin(a);return p*c+cross(k,p)*s+k*dot(k,p)*(1.-c);}
float h11(float n){return fract(sin(n)*43758.5453123);}
`;
const PLACE=`uniform vec4 uSite[${GPU_SITES}];uniform vec4 uGroup[${GROUPS}];uniform vec4 uGroupC[${GROUPS}];
vec3 spin(vec3 p,float g){int k=int(g+.5);vec4 G=uGroup[k];if(G.w==0.)return p;vec3 c=uGroupC[k].xyz;return c+rotAxis(p-c,G.xyz,G.w);}
vec3 spinN(vec3 n,float g){int k=int(g+.5);vec4 G=uGroup[k];return G.w==0.?n:rotAxis(n,G.xyz,G.w);}
float siteSize(float s){return uSite[int(s+.5)].w*uScale;}
vec3 place(vec3 p,float s){vec4 S=uSite[int(s+.5)];return S.xyz+p*S.w*uScale;}
// A camera-facing band from A to B (view space): x 0..1 along, y -1..1 across. Widths never fall under 1.3 pixels:
// thinner lines fade instead (no aliasing shimmer far away).
vec4 band(vec3 A,vec3 B,float x,float y,float wA,float wB,out float fade){
  vec4 a=modelViewMatrix*vec4(A,1.),b=modelViewMatrix*vec4(B,1.),p=mix(a,b,x);
  vec2 d=b.xy/max(.001,-b.z)-a.xy/max(.001,-a.z);d=dot(d,d)>1e-12?normalize(d):vec2(1.,0.);
  float w=mix(wA,wB,x),wmin=1.3*uPx*max(.05,-p.z);fade=clamp(w/wmin,0.,1.);p.xy+=vec2(-d.y,d.x)*max(w,wmin)*y;return projectionMatrix*p;}
`;
const FAR='if(uFar>.5)gl_Position.z=gl_Position.w*.99999;';
// Cheap value noise (3D) and fbm for atmospheres.
const VNOISE=`float vh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(vh(i),vh(i+vec3(1,0,0)),f.x),mix(vh(i+vec3(0,1,0)),vh(i+vec3(1,1,0)),f.x),f.y),mix(mix(vh(i+vec3(0,0,1)),vh(i+vec3(1,0,1)),f.x),mix(vh(i+vec3(0,1,1)),vh(i+vec3(1,1,1)),f.x),f.y),f.z);}
float vfbm(vec3 p,int o){float a=.5,s=0.;for(int i=0;i<4;i++){if(i>=o)break;s+=a*vn(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/(1.-pow(.5,float(o)));}
`;
// Premultiplied output: add (One, One), screen (One, OneMinusSrcColor: src + dst(1 - src), src clamped to 1),
// normal (One, OneMinusSrcAlpha).
function blendOf(THREE,m,blend){
  m.blending=THREE.CustomBlending;m.blendEquation=THREE.AddEquation;m.blendSrc=THREE.OneFactor;
  m.blendDst=blend==='normal'?THREE.OneMinusSrcAlphaFactor:blend==='screen'?THREE.OneMinusSrcColorFactor:THREE.OneFactor;
  m.blendEquationAlpha=THREE.AddEquation;m.blendSrcAlpha=THREE.OneFactor;m.blendDstAlpha=THREE.OneMinusSrcAlphaFactor;
  if(m.uniforms.uScreen)m.uniforms.uScreen.value=blend==='screen'?1:0;
}
const OUT='gl_FragColor=uScreen>.5?vec4(min(rgb,vec3(1.)),a):vec4(rgb,a);';
function base(THREE){return {uOpacity:{value:1},uBright:{value:1},uHue:{value:0},uFar:{value:0},uClock:{value:0},uPx:{value:.001},uScale:{value:1},uScreen:{value:0}};}
function placing(THREE){return {uSite:{value:Array.from({length:GPU_SITES},()=>new THREE.Vector4(0,0,0,1))},uGroup:{value:Array.from({length:GROUPS},()=>new THREE.Vector4())},
  uGroupC:{value:Array.from({length:GROUPS},()=>new THREE.Vector4())}};}
const color=(THREE,hex)=>new THREE.Color(hex);
function material(THREE,uniforms,vs,fs,extra={}){return new THREE.ShaderMaterial({uniforms,vertexShader:vs,fragmentShader:fs,transparent:true,depthWrite:false,...extra});}
// The instanced quad of a band: x 0..1 along, y -1..1 across.
function bandGeometry(THREE){const g=new THREE.InstancedBufferGeometry();g.setIndex([0,1,2,2,1,3]);g.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,0,1,0,1,1,0],3));return g;}
function setSites(u,sites){for(let k=0;k<GPU_SITES;k++){const s=sites[k]||sites[0];u.uSite.value[k].set(s?.x||0,s?.y||0,s?.z||0,s?.r||1);}}
// Sites for n instances: each site in turn, extra instances ringed around their site (offsets in site radii).
function distribute(n,sites,radius=.55,beside=0){const m=Math.max(1,Math.min(GPU_SITES,sites.length)),out=[];
  for(let i=0;i<n;i++){const s=i%m,round=Math.floor(i/m),per=Math.ceil(n/m),a=(round/Math.max(1,per))*Math.PI*2+s*1.3,r=per>1?Math.max(radius,beside):beside;
    out.push({site:s,offset:r?[Math.cos(a)*r,0,Math.sin(a)*r]:[0,0,0]});}
  return out;}
// ---- Fractal geometry ---------------------------------------------------------------------------------------------------
const FORM_INDEX={tree:0,fern:1,coral:2,lightning:3,spiral:4},MAT_INDEX={filament:0,crystal:1,vein:2};
const FRACTAL_VS=COMMON+PLACE+`attribute vec4 iA,iB,iW,iP;uniform float uWidth,uGrowth,uSway,uForm;
varying vec2 vQ;varying float vT,vPh,vF,vFront,vInst;
vec3 sway(vec3 p,float t,float ph){float k=uSway*.11*pow(clamp(t,0.,1.),1.6);
  return vec3(sin(uClock*1.3+ph+p.y*2.3+p.x*1.7),.2*sin(uClock*.9+ph*1.3+p.z*2.),cos(uClock*1.1+ph*1.7+p.y*1.9))*k;}
void main(){float g=uGrowth,tA=iA.w,tB=iB.w;
  // Lightning strikes and fades on its own beat; every other form grows to its growth and stays.
  if(abs(uForm-3.)<.5)g*=smoothstep(0.,.12,fract(uClock*.3+iP.z));
  float vis=step(tA,g-1e-4),k=clamp((g-tA)/max(1e-5,tB-tA),0.,1.),tb=mix(tA,tB,k);
  vec3 a=iA.xyz,b=mix(iA.xyz,iB.xyz,k);
  a=place(spin(a+sway(a,tA,iP.z*6.28),iP.y),iP.x);b=place(spin(b+sway(b,tb,iP.z*6.28),iP.y),iP.x);
  float w=uWidth*.011*siteSize(iP.x),fade;gl_Position=band(a,b,position.x,position.y,iW.x*w,iW.y*w,fade);
  vQ=position.xy;vT=mix(tA,tb,position.x);vPh=iW.w;vF=fade*vis;vFront=g<.999?smoothstep(.1,0.,g-vT):0.;vInst=iP.z;${FAR}}`;
const FRACTAL_FS=COMMON+`uniform vec3 uColor,uTip;uniform float uGlow,uMat,uForm,uScreen;varying vec2 vQ;varying float vT,vPh,vF,vFront,vInst;
void main(){float y=vQ.y,core=exp(-y*y*9.),halo=exp(-y*y*2.4),I;
  if(uMat<.5)I=core+halo*.3;
  else if(uMat<1.5){I=smoothstep(.4,.95,abs(y))*.85+core*.3+halo*.1;I*=.75+.8*pow(.5+.5*sin(vT*47.+vPh*31.+uClock*.6),10.);}
  else{float p=pow(.5+.5*sin(vT*24.-uClock*2.4+vPh*2.),5.);I=(core*.55+halo*.3)*(.3+1.7*p);}
  if(abs(uForm-3.)<.5){float c=fract(uClock*.3+vInst);I*=.2+2.4*exp(-c*7.)*(.75+.25*step(.4,h11(floor(uClock*30.)+vInst*91.)));}
  vec3 col=hueShift(mix(uColor,uTip,smoothstep(.15,1.,vT)),uHue)*(1.+vFront*1.6);
  float e=I*uBright*(.35+uGlow*.85)*uOpacity*vF;vec3 rgb=col*e;float a=min(1.,I)*uOpacity*vF;${OUT}}`;
const TIP_VS=COMMON+PLACE+`attribute vec4 aTip,aPh;uniform float uGrowth,uSway,uWidth,uForm;varying float vA,vTw;
vec3 sway(vec3 p,float t,float ph){float k=uSway*.11*pow(clamp(t,0.,1.),1.6);
  return vec3(sin(uClock*1.3+ph+p.y*2.3+p.x*1.7),.2*sin(uClock*.9+ph*1.3+p.z*2.),cos(uClock*1.1+ph*1.7+p.y*1.9))*k;}
void main(){float g=uGrowth;if(abs(uForm-3.)<.5)g*=smoothstep(0.,.12,fract(uClock*.3+aPh.x));
  vec3 p=place(spin(position+sway(position,aTip.x,aPh.x*6.28),aTip.w),aTip.z);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  float s=uWidth*.05*aTip.y*siteSize(aTip.z),px=s/(uPx*max(.05,-mv.z));gl_PointSize=clamp(px,1.5,40.);
  vA=smoothstep(aTip.x-.06,aTip.x,g)*min(1.,px/2.);vTw=.7+.3*sin(uClock*2.3+aPh.y*40.);${FAR}}`;
const TIP_FS=COMMON+`uniform vec3 uTip;uniform float uGlow,uScreen;varying float vA,vTw;
void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;float I=exp(-r*6.)+exp(-r*2.)*.2;
  vec3 rgb=hueShift(uTip,uHue)*I*vA*vTw*uBright*(.5+uGlow)*uOpacity;float a=min(1.,I)*vA*uOpacity;${OUT}}`;
function createFractal(THREE,env){
  let objects=[],geo=null,tipGeo=null,segs=0,tips=0,lowCut=0;
  const uniforms={...base(THREE),...placing(THREE),uColor:{value:new THREE.Color()},uTip:{value:new THREE.Color()},uWidth:{value:1},uGrowth:{value:1},uSway:{value:0},uGlow:{value:1},uMat:{value:0},uForm:{value:0}};
  const mat=material(THREE,uniforms,FRACTAL_VS,FRACTAL_FS),tipMat=material(THREE,uniforms,TIP_VS,TIP_FS);
  function build(cfg,sites){
    // At subsystems, instances stand beside their subsystem (around it), not inside what the world draws there.
    const p=cfg.params,n=p.instances,slots=distribute(n,sites,.6,cfg.anchor.kind==='subsystems'||cfg.anchor.kind==='largest'?.7:0),limit=Math.floor(60000/Math.max(1,n));
    const forms=slots.map((s,i)=>fractal({form:p.form,depth:p.depth,branching:p.branching,spread:p.spread,seed:hash(`${cfg.seed}/${cfg.id}/${i}`),limit}));
    segs=forms.reduce((a,f)=>a+f.count,0);tips=forms.reduce((a,f)=>a+f.tipCount,0);
    const A=new Float32Array(segs*4),B=new Float32Array(segs*4),W=new Float32Array(segs*4),P=new Float32Array(segs*4);
    const TP=new Float32Array(tips*3),TA=new Float32Array(tips*4),TH=new Float32Array(tips*4);let o=0,t=0;
    const groups=uniforms.uGroup.value,centres=uniforms.uGroupC.value;
    slots.forEach(({site,offset},i)=>{const f=forms[i],r=env.random(`${cfg.id}/inst/${i}`),yaw=r()*Math.PI*2,sc=.75+.5*r(),tilt=p.form==='spiral'?(r()-.5)*.9:(r()-.5)*.25,ph=r();
      const c=Math.cos(yaw),s=Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt);
      // Each instance: turned, scaled a little differently, and tilted (spirals tilt more and turn about their axis).
      const X=(x,y,z)=>{let y1=y*ct-z*st,z1=y*st+z*ct;return [offset[0]+(x*c-z1*s)*sc,offset[1]+y1*sc,offset[2]+(x*s+z1*c)*sc];};
      const g=Math.min(GROUPS-1,i);const ax=[-s*st,ct,c*st];
      groups[g].set(ax[0],ax[1],ax[2],0);centres[g].set(offset[0],offset[1],offset[2],p.form==='spiral'?(.08+.12*r())*(i%2?1:-1):0);
      for(let k=0;k<f.count;k++,o++){const q=f.segments.subarray(k*SEG,k*SEG+SEG),a=X(q[0],q[1],q[2]),b=X(q[4],q[5],q[6]);
        A.set([a[0],a[1],a[2],q[3]],o*4);B.set([b[0],b[1],b[2],q[7]],o*4);W.set([q[8],q[9],q[10],q[11]],o*4);P.set([site,g,ph,0],o*4);}
      for(let k=0;k<f.tipCount;k++,t++){const q=f.tips.subarray(k*TIP,k*TIP+TIP),a=X(q[0],q[1],q[2]);TP.set(a,t*3);TA.set([q[3],q[4],site,g],t*4);TH.set([ph,r(),0,0],t*4);}});
    dispose(false);
    geo=bandGeometry(THREE);for(const [k,v] of Object.entries({iA:A,iB:B,iW:W,iP:P}))geo.setAttribute(k,new THREE.InstancedBufferAttribute(v,4));geo.instanceCount=segs;
    tipGeo=new THREE.BufferGeometry();tipGeo.setAttribute('position',new THREE.BufferAttribute(TP,3));tipGeo.setAttribute('aTip',new THREE.BufferAttribute(TA,4));tipGeo.setAttribute('aPh',new THREE.BufferAttribute(TH,4));
    const m=new THREE.Mesh(geo,mat),pts=new THREE.Points(tipGeo,tipMat);for(const x of [m,pts])x.frustumCulled=false;
    objects=p.material==='vein'?[m]:[m,pts];
    // At low quality the finest level is left out (segments are sorted by level, coarse first).
    const deepest=forms[0]?.levels.length-1;lowCut=forms.reduce((a,f)=>a+(f.count-(deepest>2?f.levels[deepest]||0:0)),0);
    return objects;
  }
  return {uniforms,materials:[mat,tipMat],get objects(){return objects;},
    key:(cfg,sites)=>JSON.stringify([cfg.params.form,cfg.params.depth,cfg.params.branching,cfg.params.spread,cfg.params.instances,cfg.params.material==='vein',cfg.seed,cfg.anchor.kind,Math.min(GPU_SITES,sites.length)]),
    build,
    update(p,F){setSites(uniforms,F.sites);const u=uniforms;
      u.uColor.value.set(p.color);u.uTip.value.set(p.tip);u.uWidth.value=p.width;u.uGrowth.value=p.growth;u.uSway.value=p.sway;u.uGlow.value=p.glow;
      u.uMat.value=MAT_INDEX[p.material]??0;u.uForm.value=FORM_INDEX[p.form]??0;
      for(let g=0;g<GROUPS;g++){const C=u.uGroupC.value[g];u.uGroup.value[g].w=C.w?F.clock*C.w*2:0;}
      u.uScale.value=p.scale;if(geo)geo.instanceCount=F.quality>=3&&lowCut>segs*.3?lowCut:segs;},
    stats:()=>({segments:segs,points:tips,draws:objects.length}),
    dispose
  };
  function dispose(all=true){geo?.dispose();tipGeo?.dispose();geo=tipGeo=null;objects=[];if(all){mat.dispose();tipMat.dispose();}}
}
// ---- Particle populations ----------------------------------------------------------------------------------------------
const PARTICLE_VS=COMMON+`attribute vec3 aPrev;attribute vec4 aInfo;uniform float uAlpha,uSize,uGlow,uSparkle,uWeight,uU;uniform vec3 uCenter,uColor,uColorB;
varying vec3 vC;varying float vA;
void main(){vec3 p=mix(aPrev,position,uAlpha);vec4 mv=modelViewMatrix*vec4(uCenter+p*uU,1.);gl_Position=projectionMatrix*mv;
  float s=uSize*uU*.012*(.6+.8*aInfo.z),px=s/(uPx*max(.05,-mv.z));gl_PointSize=clamp(px,1.,64.);
  float tw=1.+uSparkle*(pow(.5+.5*sin(uClock*5.3+aInfo.w*40.),10.)*2.6-.3);
  vC=hueShift(mix(uColor,uColorB,aInfo.y),uHue)*uBright*(.35+uGlow*.8)*tw;vA=aInfo.x*uOpacity*uWeight*min(1.,px*px/2.25);${FAR}}`;
const PARTICLE_FS=COMMON+`uniform float uScreen;varying vec3 vC;varying float vA;
void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;float I=exp(-r*5.)+exp(-r*1.6)*.25;vec3 rgb=vC*I*vA;float a=min(1.,I)*vA;${OUT}}`;
const TRAIL_VS=COMMON+`attribute vec2 aK;attribute vec2 aInfo;uniform float uHead,uTrail,uWeight,uU,uGlow;uniform vec3 uCenter,uColor,uColorB;varying vec3 vC;varying float vA;
void main(){vec4 mv=modelViewMatrix*vec4(uCenter+position*uU,1.);gl_Position=projectionMatrix*mv;
  float K=${TRAIL}.,rank=mod(uHead-aK.x+K,K),seg=mod(uHead-aK.y+K,K);
  vA=seg<.5?0.:pow(1.-rank/K,1.6)*uTrail*aInfo.x*uOpacity*uWeight*.55;vC=hueShift(mix(uColor,uColorB,aInfo.y),uHue)*uBright*(.3+uGlow*.6);${FAR}}`;
const TRAIL_FS=COMMON+`uniform float uScreen;varying vec3 vC;varying float vA;void main(){vec3 rgb=vC*vA;float a=vA;${OUT}}`;
function createParticles(THREE,env){
  let cap=0,slots=[],runner=null,trailCap=0,sim=null,inputs=null;
  const make=(vs,fs)=>{const u={...base(THREE),uAlpha:{value:1},uSize:{value:1},uGlow:{value:1},uSparkle:{value:0},uWeight:{value:1},uU:{value:1},uCenter:{value:new THREE.Vector3()},
    uColor:{value:new THREE.Color()},uColorB:{value:new THREE.Color()},uHead:{value:0},uTrail:{value:0}};return material(THREE,u,vs,fs);};
  // Two slots: during a generation's crossfade the outgoing and the incoming populations are both drawn.
  function slot(){const pm=make(PARTICLE_VS,PARTICLE_FS),tm=make(TRAIL_VS,TRAIL_FS);
    const g=new THREE.BufferGeometry(),pos=new Float32Array(cap*3),prev=new Float32Array(cap*3),info=new Float32Array(cap*4);
    g.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('aPrev',new THREE.BufferAttribute(prev,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo',new THREE.BufferAttribute(info,4).setUsage(THREE.DynamicDrawUsage));
    // Trails: segment k of a particle joins ring slots k and k+1. aK = (the vertex's slot, its segment's start slot): the
    // slot gives the vertex's age, and the segment from the newest slot to the oldest (the ring's wrap) is hidden.
    const tg=new THREE.BufferGeometry(),tgPos=new Float32Array(trailCap*TRAIL*2*3),tgK=new Float32Array(trailCap*TRAIL*2*2),tgInfo=new Float32Array(trailCap*TRAIL*2*2);
    for(let i=0;i<trailCap;i++)for(let k=0;k<TRAIL;k++){const o=(i*TRAIL+k)*2;tgK[o*2]=k;tgK[o*2+1]=k;tgK[o*2+2]=(k+1)%TRAIL;tgK[o*2+3]=k;}
    tg.setAttribute('position',new THREE.BufferAttribute(tgPos,3).setUsage(THREE.DynamicDrawUsage));tg.setAttribute('aK',new THREE.BufferAttribute(tgK,2));
    tg.setAttribute('aInfo',new THREE.BufferAttribute(tgInfo,2).setUsage(THREE.DynamicDrawUsage));
    const points=new THREE.Points(g,pm),trails=new THREE.LineSegments(tg,tm);points.frustumCulled=trails.frustumCulled=false;
    return {points,trails,pm,tm,g,tg,pos,prev,info,tgPos,tgInfo,tick:-1,g0:null};}
  function disposeSlots(){for(const s of slots){s.g.dispose();s.tg.dispose();s.pm.dispose();s.tm.dispose();}slots=[];}
  function build(cfg){
    disposeSlots();cap=cfg.params.count;trailCap=Math.min(cap,3000);slots=[slot(),slot()];
    runner=createRunner({seed:hash(`${cfg.seed}/${cfg.id}/swarm`),capacity:cap,inputsAt:(t,run)=>inputs(t,run)});
    return [];
  }
  // A population's state into a slot (when its tick changed): positions, the previous tick's, fade and colour.
  function upload(s,sw){
    if(s.tick===sw.tick&&s.g0===sw)return;s.tick=sw.tick;s.g0=sw;
    for(let i=0;i<cap;i++){s.pos[i*3]=sw.px[i];s.pos[i*3+1]=sw.py[i];s.pos[i*3+2]=sw.pz[i];s.prev[i*3]=sw.qx[i];s.prev[i*3+1]=sw.qy[i];s.prev[i*3+2]=sw.qz[i];
      const h=((i*2654435761)>>>0)/4294967296;s.info[i*4]=sw.fade(i);s.info[i*4+1]=(h*7.13)%1;s.info[i*4+2]=(h*3.71)%1;s.info[i*4+3]=h;}
    for(const k of ['position','aPrev','aInfo'])s.g.attributes[k].needsUpdate=true;
    if(s.trails.visible){const P=s.tgPos,I=s.tgInfo;for(let i=0;i<trailCap;i++){const f=sw.fade(i),c=s.info[i*4+1];
      for(let k=0;k<TRAIL;k++){const a=i*TRAIL+k,b=i*TRAIL+(k+1)%TRAIL,o=(i*TRAIL+k)*2,q=o*3;
        P[q]=sw.tx[a];P[q+1]=sw.ty[a];P[q+2]=sw.tz[a];P[q+3]=sw.tx[b];P[q+4]=sw.ty[b];P[q+5]=sw.tz[b];I[o*2]=f;I[o*2+1]=c;I[o*2+2]=f;I[o*2+3]=c;}}
      s.tg.attributes.position.needsUpdate=true;s.tg.attributes.aInfo.needsUpdate=true;}
  }
  return {get objects(){return slots.flatMap(s=>[s.points,s.trails]);},get materials(){return slots.flatMap(s=>[s.pm,s.tm]);},
    key:cfg=>JSON.stringify([cfg.params.count,cfg.seed]),build,
    get metrics(){return sim?.metrics||null;},
    update(p,F){
      // The simulation's inputs at a tick's own time (pure signals, smoothed tick by tick), sites as they are now.
      const S=sitesOf(F.swarmSites);inputs=(t,run)=>({P:simParams(F.tickParams(t,run)),S});
      const view=runner.advance(F.tview,{budgetMs:F.film?Infinity:3});sim=view.at(-1)?.swarm||null;
      const visible=F.quality>=3?.6:F.quality>=2?.8:1,trail=p.trail>.01&&F.quality<3;
      slots.forEach((s,k)=>{const v=view[k];s.points.visible=!!v&&v.weight>.002;s.trails.visible=s.points.visible&&trail;if(!s.points.visible)return;
        upload(s,v.swarm);s.g.setDrawRange(0,Math.round(cap*visible));s.tg.setDrawRange(0,Math.round(trailCap*(F.quality>=2?.5:1))*TRAIL*2);
        for(const m of [s.pm,s.tm]){const u=m.uniforms;u.uAlpha.value=v.alpha;u.uWeight.value=v.weight;u.uU.value=F.U0;u.uCenter.value.copy(F.center);
          u.uSize.value=p.size*p.scale;u.uGlow.value=p.glow;u.uSparkle.value=p.sparkle;u.uColor.value.set(p.color);u.uColorB.value.set(p.colorB);u.uHead.value=v.swarm.trailHead;u.uTrail.value=p.trail;}});
    },
    stats:()=>({points:cap,segments:trailCap*TRAIL,draws:slots.reduce((a,s)=>a+(s.points.visible?1:0)+(s.trails.visible?1:0),0),restoring:runner?.restoring||false}),
    dispose(){disposeSlots();runner=null;}
  };
}
// ---- Ribbons & flow ------------------------------------------------------------------------------------------------------
const RIBBON_VS=COMMON+`attribute vec4 aRib;varying vec4 vR;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);vR=aRib;${FAR}}`;
const RIBBON_FS=COMMON+`uniform vec3 uColor,uColorB;uniform float uGlow,uScreen;varying vec4 vR;
void main(){float s=vR.x,y=vR.y,core=exp(-y*y*4.5),edge=exp(-y*y*1.3)*.3;
  // Energy streams along each ribbon: soft pulses travelling downstream.
  float flow=pow(.5+.5*sin(s*15.-uClock*2.2+vR.z*6.2831853),6.);
  vec3 col=hueShift(mix(uColor,uColorB,smoothstep(0.,1.,s)),uHue)*(core+edge)*(.55+1.3*flow)*uBright*(.35+uGlow*.8);
  float a=vR.w*uOpacity;vec3 rgb=col*a;a*=min(1.,core+edge);${OUT}}`;
function createRibbons(THREE,env){
  let geo=null,obj=null,seeds=[],M=64,count=0,pos=null,rib=null,path=null;
  const uniforms={...base(THREE),uColor:{value:new THREE.Color()},uColorB:{value:new THREE.Color()},uGlow:{value:1}};
  const mat=material(THREE,uniforms,RIBBON_VS,RIBBON_FS);
  function build(cfg){
    geo?.dispose();count=cfg.params.count;M=env.quality()>=3?32:env.quality()>=2?44:64;seeds=ribbonSeeds(hash(`${cfg.seed}/${cfg.id}/ribbons`),count,cfg.params.field);
    pos=new Float32Array(count*M*2*3);rib=new Float32Array(count*M*2*4);path=new Float32Array(M*3);const index=[];
    for(let j=0;j<count;j++)for(let k=0;k<M;k++){const o=(j*M+k)*2;rib.set([k/(M-1),-1,seeds[j].hue,1,k/(M-1),1,seeds[j].hue,1],o*4);if(k<M-1)index.push(o,o+1,o+2,o+2,o+1,o+3);}
    geo=new THREE.BufferGeometry();geo.setIndex(index);geo.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('aRib',new THREE.BufferAttribute(rib,4).setUsage(THREE.DynamicDrawUsage));
    obj=new THREE.Mesh(geo,mat);obj.frustumCulled=false;return [obj];
  }
  const cam=new THREE.Vector3();
  return {uniforms,materials:[mat],get objects(){return obj?[obj]:[];},
    key:cfg=>JSON.stringify([cfg.params.count,cfg.params.field,cfg.seed,env.quality()>=3?3:env.quality()>=2?2:0]),build,
    update(p,F){
      const u=uniforms;u.uColor.value.set(p.color);u.uColorB.value.set(p.colorB);u.uGlow.value=p.glow;
      cam.copy(F.camera.position);const n=F.sites.length||1,t=F.clock;
      // Streamlines in each ribbon's site frame (radius: the site's, times scale), made camera-facing here.
      for(let j=0;j<count;j++){const S=F.sites[j%n]||{x:0,y:0,z:0,r:1},R=S.r*p.scale,width=p.width*R*.022;
        streamline(path,M,seeds[j],p.field,{t,length:p.length,turbulence:p.turbulence});
        for(let k=0;k<M;k++){const a=Math.max(0,k-1),b=Math.min(M-1,k+1),x=S.x+path[k*3]*R,y=S.y+path[k*3+1]*R,z=S.z+path[k*3+2]*R;
          let tx=path[b*3]-path[a*3],ty=path[b*3+1]-path[a*3+1],tz=path[b*3+2]-path[a*3+2];
          const vx=cam.x-x,vy=cam.y-y,vz=cam.z-z;let sx=ty*vz-tz*vy,sy=tz*vx-tx*vz,sz=tx*vy-ty*vx;const sl=Math.hypot(sx,sy,sz)||1;
          const s=k/(M-1),taper=(1-p.taper)+p.taper*Math.pow(Math.sin(Math.PI*s),.6),dist=Math.hypot(vx,vy,vz),w=Math.max(width*taper,1.3*F.uPx*dist)/sl;
          const o=(j*M+k)*6;pos[o]=x-sx*w;pos[o+1]=y-sy*w;pos[o+2]=z-sz*w;pos[o+3]=x+sx*w;pos[o+4]=y+sy*w;pos[o+5]=z+sz*w;
          const fade=Math.min(1,s*10,(1-s)*10)*Math.min(1,width*taper/(1.3*F.uPx*dist+1e-9)),q=(j*M+k)*8;rib[q+3]=fade;rib[q+7]=fade;}}
      geo.attributes.position.needsUpdate=true;geo.attributes.aRib.needsUpdate=true;},
    stats:()=>({segments:count*M,points:0,draws:obj?1:0}),
    dispose(){geo?.dispose();mat.dispose();geo=obj=null;}
  };
}
// ---- Geometric structures ----------------------------------------------------------------------------------------------
const LINE_VS=COMMON+PLACE+`attribute vec4 iA,iB,iW;attribute float iSite;uniform float uThick,uWobble;varying vec2 vQ;varying float vT,vPh,vF;
// Wobble is a function of position only, so lines that meet stay joined.
vec3 wob(vec3 p){return uWobble*.045*vec3(sin(uClock*1.1+p.y*3.1),sin(uClock*.8+p.z*2.7),sin(uClock*.95+p.x*2.9));}
void main(){float g=iA.w;vec3 a=place(spin(iA.xyz+wob(iA.xyz),g),iSite),b=place(spin(iB.xyz+wob(iB.xyz),g),iSite);
  float w=uThick*.008*iW.y*siteSize(iSite),fade;gl_Position=band(a,b,position.x,position.y,w,w,fade);vQ=position.xy;vT=iW.x;vPh=iW.z;vF=fade;${FAR}}`;
const LINE_FS=COMMON+`uniform vec3 uColor;uniform float uGlow,uPulse,uScreen,uEdge;varying vec2 vQ;varying float vT,vPh,vF;
void main(){float y=vQ.y,core=exp(-y*y*9.),halo=exp(-y*y*2.2);
  // Signals travel along the structure's lines (lattices and polyhedra pulse; rings show their graduations turn).
  float pulse=pow(.5+.5*sin(vT*18.85-uClock*1.6+vPh*6.2831853),14.)*uPulse;
  vec3 col=hueShift(uColor,uHue);float I=(core+halo*.25)*(1.+pulse*1.8)*uEdge;
  vec3 rgb=col*I*uBright*(.35+uGlow*.85)*uOpacity*vF;float a=min(1.,core+halo*.25)*uOpacity*vF*uEdge;${OUT}}`;
const SURF_VS=COMMON+PLACE+`attribute float aGroup;attribute float iSite;uniform float uWobble;varying vec3 vN,vW;
void main(){vec3 p=place(spin(position,aGroup),iSite);vN=spinN(normal,aGroup);vW=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);${FAR}}`;
const SURF_FS=COMMON+`uniform vec3 uColor;uniform float uGlow,uScreen,uSolid;varying vec3 vN,vW;
void main(){vec3 n=normalize(vN),v=normalize(cameraPosition-vW);float nv=abs(dot(n,v)),f=pow(1.-nv,2.6),lam=.3+.7*abs(dot(n,normalize(vec3(.35,.85,.4))));
  vec3 col=hueShift(uColor,uHue)*uBright*(lam*(.1+.35*uSolid)+f*(.45+uGlow*1.1));float a=uOpacity*(uSolid>.5?1.:.18+f*.8);vec3 rgb=col*a;${OUT}}`;
const NODE_VS=COMMON+PLACE+`attribute vec2 aNode;attribute float iSite;uniform float uThick,uGlow;varying float vA;
void main(){vec3 p=place(spin(position,aNode.x),iSite);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  float s=uThick*.035*aNode.y*siteSize(iSite),px=s/(uPx*max(.05,-mv.z));gl_PointSize=clamp(px,1.5,32.);vA=min(1.,px/2.);${FAR}}`;
const BODY_VS=COMMON+PLACE+`attribute vec4 aOrb,aMove;attribute float iSite;uniform float uSpin,uThick;varying float vA;
void main(){float a=aMove.x+uSpin*aMove.y,r=aOrb.x;vec3 p=vec3(cos(a)*r,0.,sin(a)*r*(1.-aOrb.y));
  p=vec3(p.x,p.y*cos(aOrb.z)-p.z*sin(aOrb.z),p.y*sin(aOrb.z)+p.z*cos(aOrb.z));p=vec3(p.x*cos(aOrb.w)-p.y*sin(aOrb.w),p.x*sin(aOrb.w)+p.y*cos(aOrb.w),p.z);
  vec4 mv=modelViewMatrix*vec4(place(p,iSite),1.);gl_Position=projectionMatrix*mv;float s=(.5+uThick)*.03*aMove.z*siteSize(iSite),px=s/(uPx*max(.05,-mv.z));gl_PointSize=clamp(px,2.,40.);vA=min(1.,px/2.);${FAR}}`;
const NODE_FS=COMMON+`uniform vec3 uColor;uniform float uGlow,uScreen;varying float vA;
void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;float I=exp(-r*7.)+exp(-r*2.)*.25;vec3 rgb=hueShift(uColor,uHue)*I*vA*uBright*(.6+uGlow*1.2)*uOpacity;float a=min(1.,I)*vA*uOpacity;${OUT}}`;
function createStructure(THREE,env){
  let objects=[],geos=[],form=null,lines=0;const MAXS=8;
  const uniforms={...base(THREE),...placing(THREE),uColor:{value:new THREE.Color()},uGlow:{value:1},uThick:{value:.5},uWobble:{value:0},uPulse:{value:0},uSolid:{value:0},uEdge:{value:1},uSpin:{value:0}};
  const mats={line:material(THREE,uniforms,LINE_VS,LINE_FS),surf:material(THREE,uniforms,SURF_VS,SURF_FS,{side:THREE.DoubleSide}),node:material(THREE,uniforms,NODE_VS,NODE_FS),body:material(THREE,uniforms,BODY_VS,NODE_FS)};
  function sitesAttr(g,n){const a=new Float32Array(n);for(let k=0;k<n;k++)a[k]=k;g.setAttribute('iSite',new THREE.InstancedBufferAttribute(a,1));g.instanceCount=n;}
  function build(cfg,sites){
    disposeGeo();const p=cfg.params,n=Math.max(1,Math.min(MAXS,sites.length));
    form=structure({shape:p.shape,count:p.count,detail:p.detail,thickness:p.thickness,seed:hash(`${cfg.seed}/${cfg.id}/structure`)});lines=form.lineCount;
    for(let k=0;k<GROUPS;k++){uniforms.uGroup.value[k].set(0,1,0,0);uniforms.uGroupC.value[k].set(0,0,0,0);}
    form.groups.forEach((g,k)=>{if(k>=GROUPS)return;uniforms.uGroup.value[k].set(g.axis[0],g.axis[1],g.axis[2],0);uniforms.uGroupC.value[k].set(g.centre[0],g.centre[1],g.centre[2],g.rate);});
    // Lines: instanced bands (instances are lines x sites: a site index per instance block via a second instancing level
    // is not available, so the line list is repeated per site).
    const L=form.lines,A=new Float32Array(lines*n*4),B=new Float32Array(lines*n*4),W=new Float32Array(lines*n*4),S=new Float32Array(lines*n);
    for(let s=0;s<n;s++)for(let k=0;k<lines;k++){const q=L.subarray(k*LINE,k*LINE+LINE),o=s*lines+k;A.set([q[0],q[1],q[2],Math.min(GROUPS-1,q[6])],o*4);B.set([q[3],q[4],q[5],0],o*4);W.set([q[7],q[8],q[9],0],o*4);S[o]=s;}
    const lg=bandGeometry(THREE);for(const [k,v] of Object.entries({iA:A,iB:B,iW:W}))lg.setAttribute(k,new THREE.InstancedBufferAttribute(v,4));lg.setAttribute('iSite',new THREE.InstancedBufferAttribute(S,1));lg.instanceCount=lines*n;
    const list=[new THREE.Mesh(lg,mats.line)];geos.push(lg);
    if(!p.wire&&form.vertexCount){const sg=new THREE.InstancedBufferGeometry(),V=form.surfaces,N=form.vertexCount,P=new Float32Array(N*3),NN=new Float32Array(N*3),G=new Float32Array(N);
      for(let k=0;k<N;k++){P.set(V.subarray(k*VERT,k*VERT+3),k*3);NN.set(V.subarray(k*VERT+3,k*VERT+6),k*3);G[k]=Math.min(GROUPS-1,V[k*VERT+6]);}
      sg.setAttribute('position',new THREE.BufferAttribute(P,3));sg.setAttribute('normal',new THREE.BufferAttribute(NN,3));sg.setAttribute('aGroup',new THREE.BufferAttribute(G,1));sitesAttr(sg,n);
      list.push(new THREE.Mesh(sg,mats.surf));geos.push(sg);}
    if(form.pointCount){const ng=new THREE.InstancedBufferGeometry(),Q=form.points,N=form.pointCount,P=new Float32Array(N*3),D=new Float32Array(N*2);
      for(let k=0;k<N;k++){P.set(Q.subarray(k*POINT,k*POINT+3),k*3);D[k*2]=Math.min(GROUPS-1,Q[k*POINT+3]);D[k*2+1]=Q[k*POINT+4];}
      ng.setAttribute('position',new THREE.BufferAttribute(P,3));ng.setAttribute('aNode',new THREE.BufferAttribute(D,2));sitesAttr(ng,n);list.push(new THREE.Points(ng,mats.node));geos.push(ng);}
    if(form.bodyCount){const bg=new THREE.InstancedBufferGeometry(),Q=form.bodies,N=form.bodyCount,O=new Float32Array(N*4),Mv=new Float32Array(N*4);
      for(let k=0;k<N;k++){O.set(Q.subarray(k*BODY,k*BODY+4),k*4);Mv.set([Q[k*BODY+4],Q[k*BODY+5],Q[k*BODY+6],0],k*4);}
      bg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));bg.setAttribute('aOrb',new THREE.BufferAttribute(O,4));bg.setAttribute('aMove',new THREE.BufferAttribute(Mv,4));sitesAttr(bg,n);
      list.push(new THREE.Points(bg,mats.body));geos.push(bg);}
    for(const o of list)o.frustumCulled=false;objects=list;return objects;
  }
  function disposeGeo(){for(const g of geos)g.dispose();geos=[];objects=[];}
  return {uniforms,materials:Object.values(mats),get objects(){return objects;},
    key:(cfg,sites)=>JSON.stringify([cfg.params.shape,cfg.params.count,cfg.params.detail,cfg.params.thickness,cfg.params.wire,cfg.seed,Math.min(MAXS,sites.length)]),build,
    update(p,F){setSites(uniforms,F.sites);const u=uniforms;u.uColor.value.set(p.color);u.uGlow.value=p.glow;u.uThick.value=p.thickness;u.uWobble.value=p.wobble;u.uScale.value=p.radius*p.scale;
      u.uPulse.value=p.shape==='lattice'||p.shape==='polyhedron'?1:p.shape==='arches'?.5:0;u.uSolid.value=p.wire?0:1;u.uEdge.value=p.wire?1:.55;
      // Turning: each group's angle advances with the rotation (integrated, so a mapped rotation never jumps).
      // Orrery bodies: an outer orbit takes about half a minute at rotation .25, the innermost a few seconds.
      for(let g=0;g<GROUPS;g++){const C=u.uGroupC.value[g];u.uGroup.value[g].w=C.w?F.spin*C.w*6:0;}u.uSpin.value=F.spin*.8;
      // An opaque solid occludes the world behind it.
      mats.surf.depthWrite=p.opacity>.995&&F.blend==='normal'&&F.depth==='world';},
    stats:()=>({segments:objects[0]?.geometry.instanceCount||0,points:form?.pointCount||0,draws:objects.length}),
    dispose(){disposeGeo();for(const m of Object.values(mats))m.dispose();}
  };
}
// ---- Atmospheric fields --------------------------------------------------------------------------------------------------
// behind: a sky along the view rays, anchored to world directions (screen-space, at the far plane: the world in front);
// world:  a volume around its anchor (a sphere, ray-marched; depth-tested against the world);
// front:  a veil over the image (screen-space: mist, a graduated filter, light leaks, drifting colour).
const STYLE_INDEX={haze:0,aurora:1,gradient:2,nebula:3};
const ATMO_COMMON=COMMON+VNOISE+`uniform vec3 uColor,uColorB,uAnchor;uniform float uStyle,uScaleN,uHeight,uIntensity,uNoise,uScreen,uOct,uSteps;`;
const SKY_VS=COMMON+`uniform mat4 uInv;varying vec3 vDir;varying vec2 vUv;
void main(){vUv=position.xy*.5+.5;vec4 w=uInv*vec4(position.xy,1.,1.);vDir=w.xyz/w.w-cameraPosition;gl_Position=vec4(position.xy,uFar>.5?.99999:0.,1.);}`;
const SKY_FS=ATMO_COMMON+`uniform float uVeil;varying vec3 vDir;varying vec2 vUv;
vec3 sky(vec3 d){float e=d.y,t=uClock*.05,n=vfbm(d*2.2*uScaleN+vec3(t,t*.4,-t),int(uOct));vec3 c;float I;
  float lobe=pow(max(0.,dot(d,uAnchor)),6.)*.35;
  if(uStyle<.5){float h0=(uHeight-.35)*.7;I=exp(-abs(e-h0)*(3.5-1.5*uNoise))*mix(1.,.45+.9*n,uNoise)+lobe;c=mix(uColor,uColorB,smoothstep(-.15,.55,e-h0+n*.25*uNoise));}
  else if(uStyle<1.5){float ph=atan(d.z,d.x),e0=.04+uHeight*.32+.06*vfbm(vec3(ph*1.3,t*2.,1.),2);
    float cur=smoothstep(e0-.02,e0+.012,e)*exp(-max(0.,e-e0)*(3.2+2.*(1.-uHeight)));
    float fold=.45+.55*sin(ph*3.+vfbm(vec3(ph*2.,t*1.5,3.),2)*5.+t*4.),stri=mix(1.,.45+.8*vfbm(vec3(ph*22.,e*3.,t*3.),2),uNoise);
    I=cur*max(0.,fold)*stri*1.6+lobe*.4;c=mix(uColor,uColorB,smoothstep(e0,e0+.3,e));}
  else if(uStyle<2.5){float m=smoothstep(-.25+uHeight*.3,.95,e);I=.55+lobe*1.4+(n-.5)*.3*uNoise;c=mix(uColor,uColorB,m);}
  else{vec3 q=d*2.6*uScaleN;float w=vfbm(q+vec3(t),2);float k=vfbm(q+w*1.6*uNoise+vec3(-t,t,0.),int(uOct)),dark=smoothstep(.45,.75,vfbm(q*2.1+7.,2));
    I=pow(k,2.2)*1.8*(1.-dark*.65*uNoise)+lobe*.6;c=mix(uColor,uColorB,smoothstep(.3,.75,w));
    vec3 cell=floor(d*240.);float s=vh(cell);vec3 f=fract(d*240.)-.5;I+=step(.9965,s)*exp(-dot(f,f)*28.)*(.6+.4*sin(uClock*2.+s*90.))*6.;}
  return c*I;}
void main(){vec3 d=normalize(vDir),c;float a=1.;
  if(uVeil>.5){
    // The veil: screen-space, strongest toward the frame's edges and its lower part, drifting.
    vec2 q=vUv;float t=uClock*.04,n=vfbm(vec3(q*vec2(3.,1.8)*uScaleN,t),int(uOct)),edge=smoothstep(.25,1.05,length((q-.5)*vec2(1.15,1.)))*.7+.3;
    if(uStyle<.5){c=mix(uColor,uColorB,q.y)*(.25+.75*mix(1.,n,uNoise))*edge*(1.2-q.y*.6);}
    else if(uStyle<1.5){float lk=pow(max(0.,1.-length(q-vec2(.12+.2*sin(t*3.),.92))*1.4),2.)+pow(max(0.,1.-length(q-vec2(.9,.15+.1*cos(t*2.)))*1.6),2.);c=mix(uColor,uColorB,n)*lk*(.6+.6*n);}
    else if(uStyle<2.5){float m=smoothstep(.15+uHeight*.5,1.,q.y);c=uColorB*m*.9+uColor*(1.-m)*smoothstep(.6,0.,q.y)*.25;}
    else{c=mix(uColor,uColorB,vfbm(vec3(q*2.,t*1.3)+n,2))*pow(n,2.)*1.4;}
    c*=uIntensity*.5;}
  else c=sky(d)*uIntensity;
  vec3 rgb=c*uBright*uOpacity;a=clamp(dot(c,vec3(.3333))*uOpacity,0.,1.);${OUT}}`;
const VOL_VS=COMMON+`uniform vec4 uSphere;varying vec3 vW;void main(){vec3 p=uSphere.xyz+position*uSphere.w;vW=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const VOL_FS=ATMO_COMMON+`uniform vec4 uSphere;varying vec3 vW;
float dens(vec3 q,float t,out float m){float r=length(q),fall=clamp(1.-r*r,0.,1.);float n=vfbm(q*2.*uScaleN+vec3(t,t*.6,-t),int(uOct));m=.5;
  if(uStyle<.5){m=clamp(q.y*.5+.5,0.,1.);return fall*fall*mix(1.,.3+1.2*n,uNoise)*(1.-smoothstep(uHeight*1.6-.8,uHeight*1.6-.2,q.y)*.7);}
  if(uStyle<1.5){float s=q.z+.35*sin(q.x*2.6+t*3.)+.25*(n-.5)*uNoise*2.;m=smoothstep(-.6,.7,q.y);
    return exp(-s*s*26.)*smoothstep(-.75,-.3,q.y)*(1.-smoothstep(.3,.95,q.y))*(.5+.9*vn(vec3(q.x*16.,q.y*2.,t*2.)))*fall*2.2;}
  if(uStyle<2.5){m=clamp(r,0.,1.);return pow(fall,1.6)*(1.+(n-.5)*uNoise);}
  float w=vfbm(q*3.*uScaleN+n*1.5,2);m=w;return pow(fall,1.2)*pow(clamp(n*1.1+w*.5-.35,0.,1.),1.6)*2.4;}
void main(){vec3 ro=cameraPosition,rd=normalize(vW-ro),oc=ro-uSphere.xyz;float R=uSphere.w,b=dot(oc,rd),c=dot(oc,oc)-R*R,h=b*b-c;if(h<0.)discard;
  h=sqrt(h);float t0=max(0.,-b-h),t1=-b+h;if(t1<=t0)discard;float dt=(t1-t0)/uSteps,t=uClock*.05;vec3 acc=vec3(0.);
  for(int i=0;i<8;i++){if(float(i)>=uSteps)break;vec3 q=(ro+rd*(t0+dt*(float(i)+.5))-uSphere.xyz)/R;float m,d=dens(q,t,m);acc+=mix(uColor,uColorB,m)*d;}
  acc*=(t1-t0)/R/uSteps*uIntensity*.9;vec3 rgb=acc*uBright*uOpacity;float a=clamp(dot(acc,vec3(.3333))*uOpacity,0.,1.);${OUT}}`;
function createAtmosphere(THREE,env){
  let obj=null,geo=null,mode='';
  const uniforms={...base(THREE),uColor:{value:new THREE.Color()},uColorB:{value:new THREE.Color()},uAnchor:{value:new THREE.Vector3(0,0,1)},uStyle:{value:0},uScaleN:{value:1},uHeight:{value:.5},
    uIntensity:{value:.6},uNoise:{value:.5},uOct:{value:3},uSteps:{value:6},uInv:{value:new THREE.Matrix4()},uSphere:{value:new THREE.Vector4(0,0,0,10)},uVeil:{value:0}};
  const sky=material(THREE,uniforms,SKY_VS,SKY_FS,{depthTest:true}),vol=material(THREE,uniforms,VOL_VS,VOL_FS,{side:THREE.BackSide});
  function build(cfg){geo?.dispose();mode=cfg.depth==='world'?'volume':'sky';
    geo=mode==='volume'?new THREE.SphereGeometry(1,40,24):new THREE.PlaneGeometry(2,2);obj=new THREE.Mesh(geo,mode==='volume'?vol:sky);obj.frustumCulled=false;return [obj];}
  const tmp=new THREE.Matrix4(),dir=new THREE.Vector3();
  return {uniforms,get materials(){return [mode==='volume'?vol:sky];},get objects(){return obj?[obj]:[];},
    key:cfg=>JSON.stringify([cfg.depth==='world']),build,
    update(p,F){const u=uniforms;u.uColor.value.set(p.color);u.uColorB.value.set(p.colorB);u.uStyle.value=STYLE_INDEX[p.style]??0;u.uScaleN.value=p.scale;u.uHeight.value=p.height;
      u.uIntensity.value=p.intensity;u.uNoise.value=p.noise;u.uOct.value=F.quality>=2?2:3;u.uSteps.value=F.quality>=2?4:6;u.uVeil.value=F.depth==='front'?1:0;
      F.camera.updateMatrixWorld();tmp.multiplyMatrices(F.camera.projectionMatrix,F.camera.matrixWorldInverse);u.uInv.value.copy(tmp).invert();
      const s=F.sites[0]||{x:0,y:0,z:0,r:1};dir.set(s.x,s.y,s.z).sub(F.camera.position);if(dir.lengthSq()<1e-6)dir.set(0,0,1);u.uAnchor.value.copy(dir.normalize());
      u.uSphere.value.set(s.x,s.y,s.z,Math.max(.5,s.r*1.6*p.scale));},
    stats:()=>({segments:0,points:0,draws:obj?1:0}),
    dispose(){geo?.dispose();sky.dispose();vol.dispose();obj=geo=null;}
  };
}
// ---- Light accents --------------------------------------------------------------------------------------------------------
const LIGHT_INDEX={glow:0,pulse:1,flare:2,beacon:3};
const LIGHT_VS=COMMON+PLACE+`attribute vec4 iL,iM;uniform float uSize,uStyle,uPull;varying vec2 vQ;varying float vPh,vH;
void main(){vec3 c=place(iL.xyz,iL.w);float s=uSize*.32*siteSize(iL.w)*(.8+.4*iM.y);vQ=position.xy;vPh=iM.x;vH=1.;
  if(abs(uStyle-3.)<.5){
    // A beacon: a tall band facing the camera about the vertical, from below the base to well above it.
    vec3 up=vec3(0.,1.,0.),v=normalize(cameraPosition-c),r=normalize(cross(up,v));float H=s*7.;vH=H/s;
    vec3 p=c+r*position.x*s+up*mix(-s,H,position.y*.5+.5);vQ=vec2(position.x,mix(-1.,vH,position.y*.5+.5));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}
  else{vec4 mv=modelViewMatrix*vec4(c,1.);
    // Integrated with the world: the sprite is tested where its glow begins, not cut by geometry around its centre.
    mv.xyz+=normalize(-mv.xyz)*min(s*uPull,max(0.,-mv.z-.2));mv.xy+=position.xy*s*(abs(uStyle-2.)<.5?2.2:1.);gl_Position=projectionMatrix*mv;}
  ${FAR}}`;
const LIGHT_FS=COMMON+`uniform vec3 uColor;uniform float uStyle,uIntensity,uFalloff,uScreen;varying vec2 vQ;varying float vPh,vH;
void main(){vec2 q=vQ;float d=length(q),I;
  if(uStyle<.5){I=(exp(-d*d*(3.+12.*uFalloff))+.18*exp(-d*d*1.4)*(1.-uFalloff*.6))*(.85+.15*sin(uClock*1.7+vPh*6.28));}
  else if(uStyle<1.5){I=exp(-d*d*(14.+10.*uFalloff))*1.1;for(int k=0;k<3;k++){float r=fract(uClock*.45+vPh+float(k)/3.);I+=exp(-pow((d-r)/(.04+.05*r),2.))*pow(1.-r,1.5)*.7;}}
  else if(uStyle<2.5){q*=2.2;d=length(q);float core=exp(-d*d*(10.+10.*uFalloff))+.22*exp(-d*d*2.2),streak=exp(-q.y*q.y*700.)*exp(-abs(q.x)*(1.6+2.*uFalloff))*.9;
    float an=atan(q.y,q.x),spikes=(pow(abs(cos(an*2.)),80.)+.45*pow(abs(cos(an*2.+.785)),120.))*exp(-d*(2.6+2.*uFalloff))*.7,ring=exp(-pow((d-.65)/.035,2.))*.07;I=core+streak+spikes+ring;}
  else{float beam=exp(-q.x*q.x*(40.+40.*uFalloff))*smoothstep(-.4,.4,q.y)*pow(clamp(1.-q.y/vH,0.,1.),.9)*(.75+.25*sin(q.y*2.-uClock*1.4+vPh*6.28));
    float base=exp(-dot(q,q)*(2.5+4.*uFalloff));I=beam*.9+base;}
  vec3 rgb=hueShift(uColor,uHue)*I*uIntensity*uBright*uOpacity;float a=clamp(I,0.,1.)*uOpacity*min(1.,uIntensity);${OUT}}`;
function createLight(THREE,env){
  let obj=null,geo=null,count=0;
  const uniforms={...base(THREE),...placing(THREE),uColor:{value:new THREE.Color()},uSize:{value:1},uStyle:{value:0},uIntensity:{value:1},uFalloff:{value:.5},uPull:{value:.6}};
  const mat=material(THREE,uniforms,LIGHT_VS,LIGHT_FS);
  function build(cfg,sites){geo?.dispose();count=cfg.params.count;const slots=distribute(count,sites,.5),L=new Float32Array(count*4),M=new Float32Array(count*4),r=env.random(`${cfg.id}/lights`);
    slots.forEach(({site,offset},i)=>{L.set([offset[0],offset[1]+(cfg.params.style==='beacon'?0:.15),offset[2],site],i*4);M.set([r(),r(),0,0],i*4);});
    geo=new THREE.InstancedBufferGeometry();geo.setIndex([0,1,2,2,1,3]);geo.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,-1,1,0,1,1,0],3));
    geo.setAttribute('iL',new THREE.InstancedBufferAttribute(L,4));geo.setAttribute('iM',new THREE.InstancedBufferAttribute(M,4));geo.instanceCount=count;
    obj=new THREE.Mesh(geo,mat);obj.frustumCulled=false;return [obj];}
  return {uniforms,materials:[mat],get objects(){return obj?[obj]:[];},
    key:(cfg,sites)=>JSON.stringify([cfg.params.count,cfg.params.style==='beacon',cfg.seed,Math.min(GPU_SITES,sites.length)]),build,
    update(p,F){setSites(uniforms,F.sites);const u=uniforms;u.uScale.value=1;u.uColor.value.set(p.color);u.uSize.value=p.size*p.scale;u.uStyle.value=LIGHT_INDEX[p.style]??0;
      u.uIntensity.value=p.intensity;u.uFalloff.value=p.falloff;u.uPull.value=F.depth==='world'?.6:0;},
    stats:()=>({segments:0,points:count,draws:obj?1:0}),
    dispose(){geo?.dispose();mat.dispose();obj=geo=null;}
  };
}
export const RENDERERS={fractal:createFractal,particles:createParticles,ribbons:createRibbons,structure:createStructure,atmosphere:createAtmosphere,light:createLight};
// Every program's sources (vertex, fragment), for offline compilation checks.
export const SHADERS={fractal:[FRACTAL_VS,FRACTAL_FS],tip:[TIP_VS,TIP_FS],particle:[PARTICLE_VS,PARTICLE_FS],trail:[TRAIL_VS,TRAIL_FS],ribbon:[RIBBON_VS,RIBBON_FS],
  line:[LINE_VS,LINE_FS],surface:[SURF_VS,SURF_FS],node:[NODE_VS,NODE_FS],body:[BODY_VS,NODE_FS],sky:[SKY_VS,SKY_FS],volume:[VOL_VS,VOL_FS],light:[LIGHT_VS,LIGHT_FS]};
// Which anchors a type reads as one large site around the world (a ring of radius `boundary`) instead of points on it.
export const RING_TYPES=new Set(['structure','atmosphere','ribbons']);
export {blendOf,SWARM_DT};

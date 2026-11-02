// Genesis volume: the view. Raymarches the authoritative volume of genesis-volume.js (it reads the state each frame and
// never writes it): the matter's boundary where the activity crosses its threshold (moved by the pressure, so walls
// answer the music), each region's glaze (from the regions' own seats), occlusion from the matter around, and light
// from the state alone: walls glow where the matter is changing (its life), the passages' nutrient is a light carried
// along them, a little light passes through thin walls. No particles, no bloom, no geometry of its own.
import {THREE} from './core.js';
const MAXR=16;
const FS=`precision highp float;precision highp sampler3D;
uniform sampler3D uVol;uniform vec3 uDim;uniform vec4 uSeat[${MAXR}];uniform int uK;
uniform vec3 uCamPos;uniform mat3 uCamRot;uniform float uTanHalf;uniform float uAspect;
uniform float uIso;uniform float uPress;uniform vec3 uTone[${MAXR}];uniform vec3 uKey;uniform vec3 uKeyCol;uniform vec3 uAmb;
uniform vec3 uFog;uniform float uFogDen;uniform vec3 uAmber;uniform vec3 uLife;uniform float uMaxT;uniform float uGlow;uniform float uLifeGain;
in vec2 vUv;out vec4 outColor;
vec4 S(vec3 p){return texture(uVol,p/uDim);}
float F(vec3 p){vec4 s=S(p);return s.r+uPress*s.b-uIso;}
vec3 wrapd(vec3 d){return d-uDim*floor(d/uDim+.5);}
// the region a point belongs to (the power diagram the simulation uses), blended over a few cells at the borders
vec3 tone(vec3 p){float b1=1e9,b2=1e9;int k1=0,k2=0;
  for(int k=0;k<${MAXR};k++){if(k>=uK)break;vec3 d=wrapd(p-uSeat[k].xyz);float e=dot(d,d)-uSeat[k].w;if(e<b1){b2=b1;k2=k1;b1=e;k1=k;}else if(e<b2){b2=e;k2=k;}}
  return mix(uTone[k2],uTone[k1],.5+.5*clamp((b2-b1)/260.,0.,1.));}
void main(){
  vec2 q=(vUv*2.-1.)*vec2(uAspect,1.)*uTanHalf;vec3 rd=normalize(uCamRot*vec3(q,-1.)),ro=uCamPos;
  float t=.2,tPrev=0.;vec3 glow=vec3(0.);float through=1.;bool hit=false;
  for(int i=0;i<160;i++){
    vec3 p=ro+rd*t;if(t>uMaxT)break;
    vec4 s=S(p);float f=s.r+uPress*s.b-uIso;
    if(f<0.){hit=true;break;}
    float dt=clamp(f*10.,.3,1.6);
    // light carried by the medium: the passages' nutrient (amber) and the living medium where it is changing (ivory);
    // the medium between absorbs
    float lv=clamp(s.a*uLifeGain*.35,0.,1.);
    glow+=through*(uAmber*s.g*s.g*uGlow+uLife*lv*lv*.05)*dt;through*=exp(-dt*uFogDen);
    tPrev=t;t+=dt;
  }
  vec3 col;
  if(hit){
    float a=tPrev,b=t;for(int k=0;k<5;k++){float m=.5*(a+b);if(F(ro+rd*m)<0.)b=m;else a=m;}t=b;vec3 p=ro+rd*t;
    float h=.6;vec3 n=normalize(vec3(F(p+vec3(h,0,0))-F(p-vec3(h,0,0)),F(p+vec3(0,h,0))-F(p-vec3(0,h,0)),F(p+vec3(0,0,h))-F(p-vec3(0,0,h))));
    float occ=clamp(-F(p+n*1.2)*3.,0.,1.)*.5+clamp(-F(p+n*2.8)*3.,0.,1.)*.3+clamp(-F(p+n*6.)*3.,0.,1.)*.2;float ao=1.-.6*occ;
    float thin=clamp(F(p-n*1.6)*4.,0.,1.)*.6+clamp(F(p-n*3.)*4.,0.,1.)*.4;
    vec3 base=tone(p)*.62;
    // life: how fast the matter is changing just off the wall
    float life=clamp(S(p+n*.8).a*uLifeGain,0.,1.);
    float dif=max(dot(n,uKey),0.);vec3 v=-rd,hv=normalize(uKey+v);float spec=pow(max(dot(n,hv),0.),40.)*(.2+.8*pow(1.-max(dot(n,v),0.),5.));
    // the key, and a sky-like fill from every side (the medium's own diffuse light)
    col=base*(uKeyCol*dif*.9+uAmb*(.75+.25*n.y))*ao+uKeyCol*spec*.3*ao;
    col+=(base*.6+.4*uLife)*life*(.35+.65*ao)+base*uLife*thin*.04;
    // the supply lines light the walls around them: the nutrient's glow just off the wall
    float nearN=S(p+n*1.5).g+.6*S(p+n*3.5).g;col+=uAmber*(base*.8+.2)*nearN*nearN*uGlow*1.6;
  }else col=uFog;
  float fog=1.-exp(-t*uFogDen);col=mix(col,uFog,fog)+glow;
  outColor=vec4(col,1.);
}`;
// look: {camera: {pos, target, fov}, path: [{t, pos, target, fov}] (proof seconds), iso, fog, glow, life, key}
export function createVolumeView({renderer,sim,palette={},material={},width=1920,height=1080,look={}}){
  const {nx,ny,nz,NC}=sim;
  const C=x=>new THREE.Color(x);
  const body=C(palette.primary||'#e1d7c9'),deep=C(palette.deep||'#09090a'),haze=C(palette.haze||'#1c1e23'),lamp=C(palette.accent||'#f6a331');
  const white=body.clone().lerp(C('#f4f1ea'),.55);
  const TONES=[white,C('#2b2a29'),C('#a7aca6'),C('#ddd3c2'),C('#585b5f'),C('#efe9dd'),C('#8e8880'),C('#c9cdc6'),C('#3f3c39'),C('#b8ad9c'),C('#e6e3dc'),C('#716b64'),C('#d0c8bb'),C('#4b4a48'),C('#bfc4c0'),C('#9a948c')];
  const data=new Float32Array(NC*4),tex=new THREE.Data3DTexture(data,nx,ny,nz);
  tex.format=THREE.RGBAFormat;tex.type=THREE.FloatType;tex.minFilter=tex.magFilter=THREE.LinearFilter;tex.wrapS=tex.wrapT=tex.wrapR=THREE.RepeatWrapping;tex.unpackAlignment=1;tex.needsUpdate=true;
  const key=new THREE.Vector3(...(look.key||[.35,1,.25])).normalize();
  const uniforms={uVol:{value:tex},uDim:{value:new THREE.Vector3(nx,ny,nz)},uSeat:{value:[...Array(MAXR)].map(()=>new THREE.Vector4())},uK:{value:0},
    uCamPos:{value:new THREE.Vector3()},uCamRot:{value:new THREE.Matrix3()},uTanHalf:{value:Math.tan(35*Math.PI/360)},uAspect:{value:width/height},
    uIso:{value:look.iso??.13},uPress:{value:look.press??.15},uTone:{value:TONES},uKey:{value:key},uKeyCol:{value:C(look.keyColor||'#f2f0ea')},uAmb:{value:C(look.ambient||'#5c5953')},
    uFog:{value:C(look.fogColor||'#0c0f13').lerp(haze,.2)},uFogDen:{value:look.fog??.022},uAmber:{value:lamp.clone().lerp(C('#fff1dc'),.45)},uLife:{value:C(look.lifeColor||'#ffe9c8')},
    uMaxT:{value:look.maxT??140},uGlow:{value:look.glow??.3},uLifeGain:{value:look.life??60}};
  const mat=new THREE.RawShaderMaterial({uniforms,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,
    vertexShader:'in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:FS});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);quad.frustumCulled=false;
  const scene=new THREE.Scene();scene.add(quad);const cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  // the camera: fixed, or a path of keyframes in proof time (smoothstep between them)
  const camera={pos:new THREE.Vector3(),target:new THREE.Vector3(),fov:70};
  function placeCamera(c){camera.pos.set(...c.pos);camera.target.set(...c.target);camera.fov=c.fov??70;}
  if(look.camera)placeCamera(look.camera);
  function setTime(tau){const P=look.path;if(!P||!P.length)return;
    if(tau<=P[0].t)return placeCamera(P[0]);if(tau>=P[P.length-1].t)return placeCamera(P[P.length-1]);
    let i=0;while(i<P.length-2&&P[i+1].t<=tau)i++;const a=P[i],b=P[i+1],s=(tau-a.t)/(b.t-a.t),e=b.ease===false?s:s*s*(3-2*s);
    const L=(x,y)=>x.map((v,j)=>v+(y[j]-v)*e);camera.pos.set(...L(a.pos,b.pos));camera.target.set(...L(a.target,b.target));camera.fov=(a.fov??70)+((b.fov??70)-(a.fov??70))*e;}
  function sync(){
    const v=sim.v,n=sim.nut,p=sim.p,l=sim.life;
    for(let i=0;i<NC;i++){const o=4*i;data[o]=v[i];data[o+1]=n[i];data[o+2]=p[i];data[o+3]=l[i];}
    tex.needsUpdate=true;
    const K=sim.K(),st=sim.seats(),w=sim.weights();uniforms.uK.value=K;for(let k=0;k<K;k++)uniforms.uSeat.value[k].set(st[3*k],st[3*k+1],st[3*k+2],w[k]);
  }
  const m4=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);
  function render(viewport=null){
    if(viewport){renderer.setViewport(viewport.x,viewport.y,viewport.w,viewport.h);renderer.setScissor(viewport.x,viewport.y,viewport.w,viewport.h);renderer.setScissorTest(true);uniforms.uAspect.value=viewport.w/viewport.h;}
    m4.lookAt(camera.pos,camera.target,up);uniforms.uCamRot.value.setFromMatrix4(m4);uniforms.uCamPos.value.copy(camera.pos);uniforms.uTanHalf.value=Math.tan(camera.fov*Math.PI/360);
    renderer.render(scene,cam);
  }
  function resize(w,h){uniforms.uAspect.value=w/h;}
  function dispose(){tex.dispose();mat.dispose();quad.geometry.dispose();}
  return {scene,camera,setTime,capture(){},sync,render,resize,dispose,frame(){},debug(){},stats:()=>({cells:NC})};
}

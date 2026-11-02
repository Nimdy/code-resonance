// Genesis volume: the view. Raymarches the authoritative volume of genesis-volume.js (it reads the state each frame and
// never writes it). Two materials for the same state:
//  - 'stone' (the art-direction gate's): the matter opaque, its boundary where the activity crosses its threshold
//    (moved by the pressure, so walls answer the music), each region's glaze, occlusion, light from the state alone;
//  - 'glass' (the volumetric art gate's): the matter a translucent medium. Light passes through it and is absorbed
//    with depth (thin walls clear, thick masses dense), so walls behind walls show through; its boundaries are skins
//    that reflect at grazing angles; each regime's matter has its own optical density and tone, so architectures that
//    meet at a law's border meet as different materials; where the matter is changing (its life) it glows, and the
//    passages' nutrient is a light carried along them. The music moves every boundary and compresses the medium.
// The music's displacement of the matter is derived from the state: each region's resonance (its resonator, which its
// bass notes strike: it rings at the matter's own frequency, tuned toward the beat by the resonance law, and dies away
// with the viscosity law) dilates the region's architecture about its seat (look.breath per unit of resonance, at most
// 2.5 cells), blended over the laws' borders, so a struck region's walls move together, ring and settle; the pressure
// wave adds a ripple at every wall. A displacement, not a change of threshold: no matter is made or unmade. The
// simulation's chemistry never sees it.
// No particles, no bloom, no geometry of its own.
//
// The state is uploaded as one RGBA texture (activity, nutrient, pressure, life): float, half float or 8-bit
// (look.format; decoded by uScale and uOffset). The regions' materials are a second texture, rebuilt only when the
// structure changes.
import {THREE} from './core.js';
const MAXR=16;
const HEAD=`precision highp float;precision highp sampler3D;
uniform sampler3D uVol;uniform sampler3D uMat;uniform vec3 uDim;uniform vec4 uScale;uniform vec4 uOffset;
uniform vec3 uCamPos;uniform mat3 uCamRot;uniform float uTanHalf;uniform float uAspect;
uniform float uIso;uniform float uPress;uniform vec3 uKey;uniform vec3 uKeyCol;uniform vec3 uAmb;
uniform vec3 uFog;uniform float uFogDen;uniform vec3 uAmber;uniform vec3 uLife;uniform float uMaxT;uniform float uGlow;uniform float uLifeGain;
uniform vec4 uSeat[${MAXR}];uniform int uK;uniform vec3 uTone[${MAXR}];
in vec2 vUv;out vec4 outColor;
// the state at a point: (activity, nutrient, pressure, life)
vec4 S(vec3 p){return texture(uVol,p/uDim)*uScale+uOffset;}
float Fs(vec4 s){return s.r+uPress*s.b-uIso;}
float F(vec3 p){return Fs(S(p));}
vec3 wrapd(vec3 d){return d-uDim*floor(d/uDim+.5);}
`;
// the gate's opaque stone; TONE_LOOP: each region's glaze from the seats (the gate's), otherwise from the material texture
const STONE=`
vec3 tone(vec3 p){
#ifdef TONE_LOOP
  float b1=1e9,b2=1e9;int k1=0,k2=0;
  for(int k=0;k<${MAXR};k++){if(k>=uK)break;vec3 d=wrapd(p-uSeat[k].xyz);float e=dot(d,d)-uSeat[k].w;if(e<b1){b2=b1;k2=k1;b1=e;k1=k;}else if(e<b2){b2=e;k2=k;}}
  return mix(uTone[k2],uTone[k1],.5+.5*clamp((b2-b1)/260.,0.,1.));
#else
  return texture(uMat,p/uDim).rgb;
#endif
}
void main(){
  vec2 q=(vUv*2.-1.)*vec2(uAspect,1.)*uTanHalf;vec3 rd=normalize(uCamRot*vec3(q,-1.)),ro=uCamPos;
  float t=.2,tPrev=0.;vec3 glow=vec3(0.);float through=1.;bool hit=false;
  for(int i=0;i<160;i++){
    vec3 p=ro+rd*t;if(t>uMaxT)break;
    vec4 s=S(p);float f=Fs(s);
    if(f<0.){hit=true;break;}
    float dt=clamp(f*10.,.3,1.6);
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
    float life=clamp(S(p+n*.8).a*uLifeGain,0.,1.);
    float dif=max(dot(n,uKey),0.);vec3 v=-rd,hv=normalize(uKey+v);float spec=pow(max(dot(n,hv),0.),40.)*(.2+.8*pow(1.-max(dot(n,v),0.),5.));
    col=base*(uKeyCol*dif*.9+uAmb*(.75+.25*n.y))*ao+uKeyCol*spec*.3*ao;
    col+=(base*.6+.4*uLife)*life*(.35+.65*ao)+base*uLife*thin*.04;
    float nearN=S(p+n*1.5).g+.6*S(p+n*3.5).g;col+=uAmber*(base*.8+.2)*nearN*nearN*uGlow*1.6;
  }else col=uFog;
  float fog=1.-exp(-t*uFogDen);col=mix(col,uFog,fog)+glow;
  outColor=vec4(col,1.);
}`;
// translucent matter: one march front to back. Open space: the medium's own light (nutrient, life) and a thin haze.
// Matter: absorption that grows with depth below the boundary (the region's optical density), the light it scatters
// (strongest near its surface, where the key reaches it), its glow where it is changing, and its compression by the
// pressure. Each crossing of the boundary is a skin: a reflection that grows toward grazing angles.
const GLASS=`
uniform float uSigma;uniform float uSkin;uniform float uSkinBase;uniform float uDepth;uniform float uSquash;uniform float uLit;uniform float uScatter;
// the boundary's normal from four samples (a tetrahedron)
vec3 N(vec3 p){const vec2 k=vec2(1.,-1.);float h=.7;return normalize(k.xyy*F(p+k.xyy*h)+k.yyx*F(p+k.yyx*h)+k.yxy*F(p+k.yxy*h)+k.xxx*F(p+k.xxx*h));}
void main(){
  vec2 q=(vUv*2.-1.)*vec2(uAspect,1.)*uTanHalf;vec3 rd=normalize(uCamRot*vec3(q,-1.)),ro=uCamPos;
  float t=.15+.45*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));vec3 T=vec3(1.),acc=vec3(0.);
  vec4 s=S(ro+rd*t);float f=Fs(s);
  // bounded work: at most 32 samples inside matter (beyond them the matter counts as opaque) and 8 boundaries
  int inside=0,skins=0;
  for(int i=0;i<180;i++){
    if(t>uMaxT||max(T.r,max(T.g,T.b))<.03)break;
    if(inside>=32){T=vec3(0.);break;}
    vec3 p=ro+rd*t;float dt;
    float lv=clamp(s.a*uLifeGain,0.,1.);
    if(f>0.){
      // open space: the medium's own light (the passages' nutrient, life) and a thin haze
      dt=clamp(f*10.,.3,1.6);
      float a=1.-exp(-dt*uFogDen);
      acc+=T*((uAmber*s.g*s.g*uGlow+uLife*lv*lv*.06)*dt+a*uFog);T*=1.-a;
    }else{
      // matter: tinted absorption growing with depth below the boundary (thin walls clear, thick masses deep), denser where
      // the pressure compresses it, a little light scattered near its surface, its glow where it is changing
      dt=clamp(-f*8.,.5,2.);inside++;
      vec4 m=texture(uMat,p/uDim);float depth=-f;
      float dens=uSigma*m.a*smoothstep(0.,uDepth,depth)*max(.2,1.+uSquash*s.b);
      vec3 k=dens*(1.06-m.rgb);
      float key=exp(-depth*uLit);
      acc+=T*(m.rgb*(uAmb+uKeyCol*.5*key)*uScatter*dens*(.25+.75*key)+(m.rgb*.5+.5*uLife)*lv*lv*.12)*dt;
      T*=exp(-k*dt);
    }
    float tp=t,fp=f;t+=dt;s=S(ro+rd*t);f=Fs(s);
    if((fp>0.)!=(f>0.)&&skins<8){skins++;
      // a boundary: a skin that reflects (more at grazing angles) and transmits the rest
      float tc=tp+(t-tp)*fp/(fp-f);vec3 pc=ro+rd*tc;vec3 n=N(pc);if(dot(n,rd)>0.)n=-n;
      vec4 m=texture(uMat,pc/uDim);float cv=abs(dot(n,rd)),fres=pow(1.-cv,4.);
      float dif=max(dot(n,uKey),0.);vec3 hv=normalize(uKey-rd);float spec=pow(max(dot(n,hv),0.),70.);
      float life=clamp(S(pc+n*.8).a*uLifeGain,0.,1.);
      vec3 c=m.rgb*(uAmb*(.5+.5*n.y)+uKeyCol*dif*.9)+uKeyCol*spec*(.25+fres)+(m.rgb*.5+.5*uLife)*life*.9;
      float al=uSkin*(uSkinBase+(1.-uSkinBase)*fres);acc+=T*al*c;T*=1.-al;
    }
  }
  acc+=T*uFog;
  outColor=vec4(acc,1.);
}`;
// each regime's matter (the same for every project, so projects differ by their laws, not their palette): its tone and
// its optical density (a regime that leaves more of space open has thinner, clearer matter)
export const MATTER={
  open:{tone:'#d6dade',density:.35},halls:{tone:'#cdd3d7',density:.4},labyrinth:{tone:'#ebe4d5',density:.3},
  tubes:{tone:'#3a3e44',density:1.5},chambers:{tone:'#a8c6ba',density:.8},tide:{tone:'#d9a862',density:.55},worms:{tone:'#c68c7c',density:.7}
};
// look: {material: 'stone'|'glass', format: 'float'|'half'|'byte', toneLoop, camera: {pos, target, fov},
// path: [{t, pos, target, fov}] (proof seconds), iso, press, fog, glow, life, key, sigma, skin, depth, squash}
export function createVolumeView({renderer,sim,palette={},material={},width=1920,height=1080,look={}}){
  const {nx,ny,nz,NC}=sim,glass=look.material==='glass',format=look.format||'byte';
  const C=x=>new THREE.Color(x);
  const body=C(palette.primary||'#e1d7c9'),haze=C(palette.haze||'#1c1e23'),lamp=C(palette.accent||'#f6a331');
  const white=body.clone().lerp(C('#f4f1ea'),.55);
  const TONES=[white,C('#2b2a29'),C('#a7aca6'),C('#ddd3c2'),C('#585b5f'),C('#efe9dd'),C('#8e8880'),C('#c9cdc6'),C('#3f3c39'),C('#b8ad9c'),C('#e6e3dc'),C('#716b64'),C('#d0c8bb'),C('#4b4a48'),C('#bfc4c0'),C('#9a948c')];
  // the state texture
  const PV=format==='float'?Float32Array:format==='half'?Uint16Array:Uint8Array;
  const data=new PV(NC*4),tex=new THREE.Data3DTexture(data,nx,ny,nz);
  tex.format=THREE.RGBAFormat;tex.type=format==='float'?THREE.FloatType:format==='half'?THREE.HalfFloatType:THREE.UnsignedByteType;
  tex.minFilter=tex.magFilter=THREE.LinearFilter;tex.wrapS=tex.wrapT=tex.wrapR=THREE.RepeatWrapping;tex.unpackAlignment=1;tex.needsUpdate=true;
  // 8-bit: activity [0, .5], nutrient [0, 1], pressure [-2, 2], life [0, .05]
  const BYTE=[.5,1,4,.05],BOFF=[0,0,-2,0];
  const scale=format==='byte'?new THREE.Vector4(...BYTE):new THREE.Vector4(1,1,1,1),offset=format==='byte'?new THREE.Vector4(...BOFF):new THREE.Vector4(0,0,0,0);
  // the regions' materials (tone, density), blended over the laws' borders as the simulation blends the laws
  const mdata=new Uint8Array(NC*4),mtex=new THREE.Data3DTexture(mdata,nx,ny,nz);
  mtex.format=THREE.RGBAFormat;mtex.type=THREE.UnsignedByteType;mtex.minFilter=mtex.magFilter=THREE.LinearFilter;mtex.wrapS=mtex.wrapT=mtex.wrapR=THREE.RepeatWrapping;mtex.unpackAlignment=1;
  let matOf=null;
  function materials(){
    const L=sim.laws(),K=sim.K();if(matOf===L)return;matOf=L;
    const mats=L.map((l,k)=>{const M=MATTER[l.regime]||MATTER.labyrinth,c=glass?C(M.tone):TONES[k%TONES.length];return [c.r,c.g,c.b,glass?M.density/2:.5];});
    const reg=sim.reg,reg2=sim.reg2,bl=sim.blend;
    for(let i=0;i<NC;i++){const a=mats[reg[i]]||mats[0],b=mats[reg2[i]]||a,t=K>1?bl[i]:0,o=4*i;
      for(let c=0;c<4;c++)mdata[o+c]=Math.round(255*Math.min(1,a[c]+(b[c]-a[c])*t));}
    mtex.needsUpdate=true;
  }
  const key=new THREE.Vector3(...(look.key||[.35,1,.25])).normalize();
  const uniforms={uVol:{value:tex},uMat:{value:mtex},uDim:{value:new THREE.Vector3(nx,ny,nz)},uScale:{value:scale},uOffset:{value:offset},
    uSeat:{value:[...Array(MAXR)].map(()=>new THREE.Vector4())},uK:{value:0},uTone:{value:TONES},
    uCamPos:{value:new THREE.Vector3()},uCamRot:{value:new THREE.Matrix3()},uTanHalf:{value:Math.tan(35*Math.PI/360)},uAspect:{value:width/height},
    uIso:{value:look.iso??.13},uPress:{value:look.press??.15},uKey:{value:key},uKeyCol:{value:C(look.keyColor||'#f2f0ea')},uAmb:{value:C(look.ambient||'#5c5953')},
    uFog:{value:C(look.fogColor||'#0c0f13').lerp(haze,.2)},uFogDen:{value:look.fog??.022},uAmber:{value:lamp.clone().lerp(C('#fff1dc'),.45)},uLife:{value:C(look.lifeColor||'#ffe9c8')},
    uMaxT:{value:look.maxT??140},uGlow:{value:look.glow??.3},uLifeGain:{value:look.life??60},
    uSigma:{value:look.sigma??1},uSkin:{value:look.skin??.35},uSkinBase:{value:look.skinBase??.3},uDepth:{value:look.depth??.06},uSquash:{value:look.squash??.6},uLit:{value:look.lit??9},uScatter:{value:look.scatter??.6}};
  const mat=new THREE.RawShaderMaterial({uniforms,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,
    vertexShader:'in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:(look.toneLoop?'#define TONE_LOOP\n':'')+HEAD+(glass?GLASS:STONE)});
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
  // the state into the texture (cost measured by bench: pack is CPU, upload is the driver)
  const f32=new Float32Array(1),u32=new Uint32Array(f32.buffer);
  const half=x=>{f32[0]=x;const b=u32[0],s=(b>>>16)&0x8000,e=((b>>>23)&0xff)-112,m=b&0x7fffff;if(e<=0)return s;if(e>30)return s|0x7c00;return s|(e<<10)|(m>>>13);};
  const breath=look.breath??1,q=new Float64Array(16),moved=new Float32Array(NC);
  const wrap=(d,n)=>d>n/2?d-n:d<-n/2?d+n:d;
  // the activity as the music displaces it: each cell shows the activity from where its region's dilation carried it
  function displaced(v){
    const K=sim.K(),res=sim.res,st=sim.seats(),reg=sim.reg,reg2=sim.reg2,bl=sim.blend;let any=0;
    for(let k=0;k<K;k++){q[k]=breath*res[2*k];any=Math.max(any,Math.abs(q[k]));}
    if(any<.002)return v;
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=x+nx*(y+ny*z),k1=reg[i],k2=reg2[i],t=bl[i],a=q[k1]*(1-t),b=q[k2]*t;
      let dx=a*wrap(x-st[3*k1],nx)+b*wrap(x-st[3*k2],nx),dy=a*wrap(y-st[3*k1+1],ny)+b*wrap(y-st[3*k2+1],ny),dz=a*wrap(z-st[3*k1+2],nz)+b*wrap(z-st[3*k2+2],nz);
      const m=Math.sqrt(dx*dx+dy*dy+dz*dz);if(m>2.5){dx*=2.5/m;dy*=2.5/m;dz*=2.5/m;}
      const sx=x-dx,sy=y-dy,sz=z-dz,X=Math.floor(sx),Y=Math.floor(sy),Z=Math.floor(sz),fx=sx-X,fy=sy-Y,fz=sz-Z;
      const x0=(X%nx+nx)%nx,x1=(x0+1)%nx,y0=((Y%ny+ny)%ny)*nx,y1=((((Y+1)%ny)+ny)%ny)*nx,z0=((Z%nz+nz)%nz)*nx*ny,z1=((((Z+1)%nz)+nz)%nz)*nx*ny;
      moved[i]=((v[x0+y0+z0]*(1-fx)+v[x1+y0+z0]*fx)*(1-fy)+(v[x0+y1+z0]*(1-fx)+v[x1+y1+z0]*fx)*fy)*(1-fz)+((v[x0+y0+z1]*(1-fx)+v[x1+y0+z1]*fx)*(1-fy)+(v[x0+y1+z1]*(1-fx)+v[x1+y1+z1]*fx)*fy)*fz;}
    return moved;
  }
  function pack(){
    const v=displaced(sim.v),n=sim.nut,P=sim.p,l=sim.life;
    if(format==='float')for(let i=0;i<NC;i++){const o=4*i;data[o]=v[i];data[o+1]=n[i];data[o+2]=P[i];data[o+3]=l[i];}
    else if(format==='half')for(let i=0;i<NC;i++){const o=4*i;data[o]=half(v[i]);data[o+1]=half(n[i]);data[o+2]=half(P[i]);data[o+3]=half(l[i]);}
    else for(let i=0;i<NC;i++){const o=4*i,a=v[i]*510,b=n[i]*255,c=(P[i]+2)*63.75,d=l[i]*5100;
      data[o]=a<0?0:a>255?255:a+.5;data[o+1]=b<0?0:b>255?255:b+.5;data[o+2]=c<0?0:c>255?255:c+.5;data[o+3]=d<0?0:d>255?255:d+.5;}
  }
  let skipUpload=false;
  function sync(){
    materials();
    if(!skipUpload){pack();tex.needsUpdate=true;}
    const K=sim.K(),st=sim.seats(),w=sim.weights();uniforms.uK.value=K;for(let k=0;k<K;k++)uniforms.uSeat.value[k].set(st[3*k],st[3*k+1],st[3*k+2],w[k]);
  }
  const m4=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);
  function render(viewport=null){
    if(viewport){renderer.setViewport(viewport.x,viewport.y,viewport.w,viewport.h);renderer.setScissor(viewport.x,viewport.y,viewport.w,viewport.h);renderer.setScissorTest(true);uniforms.uAspect.value=viewport.w/viewport.h;}
    m4.lookAt(camera.pos,camera.target,up);uniforms.uCamRot.value.setFromMatrix4(m4);uniforms.uCamPos.value.copy(camera.pos);uniforms.uTanHalf.value=Math.tan(camera.fov*Math.PI/360);
    renderer.render(scene,cam);
  }
  function resize(w,h){uniforms.uAspect.value=w/h;}
  // lab: the same state under other values of the look (numbers and colours only) and another camera
  const NAMES={iso:'uIso',press:'uPress',fog:'uFogDen',glow:'uGlow',life:'uLifeGain',sigma:'uSigma',skin:'uSkin',skinBase:'uSkinBase',depth:'uDepth',squash:'uSquash',lit:'uLit',scatter:'uScatter',maxT:'uMaxT',ambient:'uAmb',keyColor:'uKeyCol',fogColor:'uFog',lifeColor:'uLife'};
  function set(o={}){for(const [k,x] of Object.entries(o)){const u=uniforms[NAMES[k]];if(!u)continue;if(typeof x==='string')u.value=C(x);else u.value=x;}
    if(o.key)uniforms.uKey.value.set(...o.key).normalize();if(o.camera)placeCamera(o.camera);}
  function dispose(){tex.dispose();mtex.dispose();mat.dispose();quad.geometry.dispose();}
  // bench: the costs apart (pack: the state into the array; skipUpload: render without uploading)
  const bench={pack,set skipUpload(x){skipUpload=x;},get skipUpload(){return skipUpload;},bytes:data.byteLength};
  return {scene,camera,setTime,set,capture(){},sync,render,resize,dispose,frame(){},debug(){},bench,stats:()=>({cells:NC})};
}

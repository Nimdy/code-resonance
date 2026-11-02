// Concept B · Resonant Architecture (an animatic, scripted; not a simulation). The project is an instrument the size of a
// landscape: a city of spires built of tuned metal rods, one spire per subsystem. A spire is rings of rods, each ring
// tuned to one pitch (a chord stacked outward from its subsystem's own degree: the long bass rods at the centre, higher
// and shorter outward, so the tuning is the silhouette); a rod is as long as its pitch requires (an octave higher, about
// 0.7 times as long); more files, more rings. Between the spires, to the horizon, short rods of the key's tonic and fifth. The score plays it: a note sets ringing only the rods tuned to it, starting at
// its subsystem's grove and running out across the field as a wave, each rod swinging at a rate that rises with its pitch
// and dying away. Nothing else moves the field. A dependency is a line of rods tuned up a scale from one grove to the
// other, which carries the waves between them.
// Scripted for the animatic: the recorded dependency's line rises from the ground at 12 s; at 24 s a grove grows (its
// subsystem gaining files: more and taller rods); from 31 s the camera rises to show the whole field.
const MAXN=48;
const VS=`precision highp float;
uniform mat4 projectionMatrix;uniform mat4 viewMatrix;uniform float uTime;uniform vec4 uNote[${MAXN}];uniform vec2 uSrc[${MAXN}];
in vec3 position;in vec3 normal;in vec3 aBase;in vec4 aRod;in vec2 aExtra;
out vec3 vN;out vec3 vW;out float vEnergy;out float vS;out float vTone;
void main(){
  float L=aRod.x*clamp((uTime-aRod.w)/2.5,0.,1.);
  // the grove's growth (aExtra.x: its scale over time is passed in aRod.x by the CPU) and the rod's own pitch
  float midi=aRod.y,pc=mod(midi,12.);vec2 disp=vec2(0.);float energy=0.;
  for(int i=0;i<${MAXN};i++){vec4 n=uNote[i];if(n.w<=0.)continue;
    float npc=mod(n.z,12.),m=0.;
    if(abs(npc-pc)<.5)m=abs(n.z-midi)<.5?1.:(abs(n.z-midi)<12.5?.5:.22);else if(abs(mod(npc+7.,12.)-pc)<.5)m=.16;
    if(m<=0.)continue;
    vec2 dir=aBase.xz-uSrc[i];float r=length(dir);float tt=uTime-n.x-r/46.;if(tt<=0.)continue;
    float f=.85*exp2((midi-36.)/24.),a=n.w*m*exp(-tt/2.6)*(1.-exp(-tt/.05))*exp(-r/420.);
    disp+=(r>.01?dir/r:vec2(1,0))*a*sin(6.2831853*f*tt);energy+=a;}
  float s=position.y,y=s*L;vec3 p=vec3(aBase.x+position.x*aRod.z,y,aBase.z+position.z*aRod.z);
  p.xz+=disp*L*.13*s*s;
  vN=normal;vW=p;vEnergy=energy;vS=s;vTone=aExtra.y;
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
const FS=`precision highp float;
uniform vec3 uSun;uniform vec3 uSunCol;uniform vec3 uSky;uniform vec3 uFog;uniform vec3 uCam;
in vec3 vN;in vec3 vW;in float vEnergy;in float vS;in float vTone;out vec4 outColor;
void main(){
  vec3 n=normalize(vN),v=normalize(uCam-vW),h=normalize(uSun+v);
  // brushed metal: a little diffuse, a long highlight, the sky in it; a ringing rod brightens toward its tip
  vec3 base=mix(vec3(.62,.6,.57),vec3(.72,.55,.38),vTone);
  float dif=max(dot(n,uSun),0.),sp=pow(max(dot(n,h),0.),38.);
  vec3 c=base*(uSky*.35+uSunCol*dif*.55)+uSunCol*sp*.9+uSky*.12*(1.-abs(n.y));
  c+=vec3(1.,.8,.55)*min(vEnergy,1.4)*(.25+vS*vS)*.9;
  float fog=1.-exp(-length(uCam-vW)*.0015);c=mix(c,uFog,fog);
  outColor=vec4(c,1.);
}`;
const GROUND_FS=`precision highp float;
uniform vec3 uFog;uniform vec3 uCam;uniform vec3 uSunCol;in vec3 vW;out vec4 outColor;
void main(){float d=length(uCam-vW);vec3 c=vec3(.085,.082,.08)+uSunCol*.03*smoothstep(600.,0.,d);c=mix(c,uFog,1.-exp(-d*.0015));outColor=vec4(c,1.);}`;
const SKY_FS=`precision highp float;
uniform vec3 uFog;uniform vec3 uSky;uniform vec3 uSun;uniform vec3 uSunCol;uniform mat3 uRot;uniform float uTanHalf;uniform float uAspect;in vec2 vUv;out vec4 outColor;
void main(){vec2 q=(vUv*2.-1.)*vec2(uAspect,1.)*uTanHalf;vec3 d=normalize(uRot*vec3(q,-1.));
  float hgt=max(d.y,0.);vec3 c=mix(uFog,uSky*.8,pow(hgt,.45));c+=uSunCol*pow(max(dot(d,uSun),0.),48.)*.9+uSunCol*pow(max(dot(d,uSun),0.),5.)*.18;outColor=vec4(c,1.);}`;
export function create({THREE,renderer,width,height,notes,structure,laws,key,params={}}){
  const subs=structure.after.subsystems,K=subs.length;
  let seed=0x2F6E2B1;const rnd=()=>{seed=(seed+0x6D2B79F5)|0;let x=Math.imul(seed^(seed>>>15),1|seed);x^=x+Math.imul(x^(x>>>7),61|x);return ((x^(x>>>14))>>>0)/4294967296;};
  // groves on a spiral; a grove's radius grows with its files
  const DEG=[0,4,2,5,3,1,6],SCALE=key?.scale?.length===7?key.scale:[0,2,4,5,7,9,11],tonic=((key?.tonic??0)%12+12)%12;
  const groves=subs.map((s,k)=>{const a=k*2.399963+.6,r=95*Math.sqrt((k+.55)/K);return {x:r*Math.cos(a),z:r*Math.sin(a)-60,rings:6+Math.round(1.6*s.files),deg:DEG[k%7],role:s.role,files:s.files};});
  const growK=params.grow??subs.findIndex(s=>s.role==='core');
  const rods=[];
  const pitchOf=(deg,oct)=>12*oct+((tonic+SCALE[deg%7])%12);
  const lenOf=m=>34*Math.pow(2,-(m-36)/24);
  // the spires: ring j a pitch (the subsystem's degree, then stacked thirds outward, an octave up every fourth ring),
  // its rods 0.6 apart around it; the rings that grow at 24 s rise then
  for(let k=0;k<K;k++){const g=groves[k],extra=k===growK?5:0;
    for(let j=0;j<g.rings+extra;j++){const deg=(g.deg+2*j)%7,m=pitchOf(deg,2+Math.floor(j/4)),r=1+j*1.25,n=Math.max(3,Math.round(2*Math.PI*r/.6)),ph=rnd()*6.28;
      for(let i=0;i<n;i++){const a=ph+i/n*Math.PI*2;rods.push({x:g.x+r*Math.cos(a),z:g.z+r*Math.sin(a),len:lenOf(m)*(.985+.03*rnd()),midi:m,w:.13,rise:j>=g.rings?24+.25*(j-g.rings):-10,tone:.3+.4*(j%2),grove:k});}}}
  // between the spires, to the horizon: short rods of the tonic and fifth, sparse
  for(let i=0;i<7000;i++){const a=rnd()*Math.PI*2,r=40+700*Math.pow(rnd(),.65),deg=rnd()<.6?0:4,m=pitchOf(deg,5+Math.floor(rnd()*2));
    if(Math.hypot(r*Math.cos(a)+30,r*Math.sin(a)-60-95)<28)continue;
    rods.push({x:r*Math.cos(a),z:r*Math.sin(a)-60,len:lenOf(m)*(.8+.4*rnd()),midi:m,w:.1,rise:-10,tone:.1+.2*rnd(),grove:-1});}
  // the dependencies: lines of rods up a scale from the dependent's grove to the depended-on's (the recorded one rises)
  const recorded=structure.change&&structure.change.kind==='dependency'?`${structure.change.a}>${structure.change.b}`:null;
  for(const e of structure.after.deps){const A=groves[e.a],B=groves[e.b];if(!A||!B)continue;const isNew=`${e.a}>${e.b}`===recorded,dx=B.x-A.x,dz=B.z-A.z,len=Math.hypot(dx,dz),n=Math.floor(len/1.6);
    for(let i=1;i<n;i++){const t=i/n,deg=Math.floor(t*7.999),m=pitchOf(deg,3+(t>.5?1:0));
      rods.push({x:A.x+dx*t+(rnd()-.5)*.8,z:A.z+dz*t+(rnd()-.5)*.8,len:lenOf(m)*.9,midi:m,w:.14,rise:isNew?12+t*2.2:-10,tone:.8,grove:-2});}}
  // the growing grove's rods grow taller too (scale), passed per frame
  const N=rods.length;
  const box=new THREE.BoxGeometry(1,1,1,1,6,1);box.translate(0,.5,0);
  const geo=new THREE.InstancedBufferGeometry();geo.index=box.index;geo.setAttribute('position',box.getAttribute('position'));geo.setAttribute('normal',box.getAttribute('normal'));
  const base=new Float32Array(N*3),rod=new Float32Array(N*4),extra=new Float32Array(N*2);
  rods.forEach((r,i)=>{base.set([r.x,0,r.z],3*i);rod.set([r.len,r.midi,r.w,r.rise],4*i);extra.set([r.grove,r.tone],2*i);});
  geo.setAttribute('aBase',new THREE.InstancedBufferAttribute(base,3));const rodAttr=new THREE.InstancedBufferAttribute(rod,4);geo.setAttribute('aRod',rodAttr);
  geo.setAttribute('aExtra',new THREE.InstancedBufferAttribute(extra,2));geo.instanceCount=N;
  const sun=new THREE.Vector3(-.55,.16,-.82).normalize();
  const U={uTime:{value:0},uNote:{value:[...Array(MAXN)].map(()=>new THREE.Vector4())},uSrc:{value:[...Array(MAXN)].map(()=>new THREE.Vector2())},
    uSun:{value:sun},uSunCol:{value:new THREE.Color('#ffd9a8')},uSky:{value:new THREE.Color('#9fb2c8')},uFog:{value:new THREE.Color('#c9b9a6')},uCam:{value:new THREE.Vector3()},
    uRot:{value:new THREE.Matrix3()},uTanHalf:{value:1},uAspect:{value:width/height}};
  const mat=new THREE.RawShaderMaterial({uniforms:U,vertexShader:VS,fragmentShader:FS,glslVersion:THREE.GLSL3});
  const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000).rotateX(-Math.PI/2),new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,
    vertexShader:'uniform mat4 projectionMatrix;uniform mat4 viewMatrix;in vec3 position;out vec3 vW;void main(){vW=position;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}',fragmentShader:GROUND_FS}));
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,
    vertexShader:'in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.9999,1.);}',fragmentShader:SKY_FS}));
  sky.frustumCulled=false;sky.renderOrder=-1;
  const scene=new THREE.Scene();scene.add(sky,ground,mesh);
  const cam=new THREE.PerspectiveCamera(50,width/height,.5,3000);
  const W={bass:1,pad:.7,melody:.75,counter:.6,arp:.5,atmos:.45};
  const path=params.path||[{t:0,pos:[-30,3,95],target:[8,15,-70],fov:50},{t:31,pos:[-30,3,95],target:[8,15,-70],fov:50},{t:40,pos:[-95,120,175],target:[0,0,-60],fov:52}];
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const growScale=t=>1+.35*smooth(24,30,t);
  return {render(t){
    // the notes sounding now (the last eight seconds), each with its grove as the source of its wave
    const active=notes.filter(n=>n.t<=t&&n.t>t-8).slice(-MAXN);
    U.uNote.value.forEach((v,i)=>{const n=active[i];if(!n){v.set(0,0,0,0);return;}v.set(n.t,0,n.midi,(W[n.group]||.4)*(.45+.55*n.v));const g=groves[n.k%K];U.uSrc.value[i].set(g.x,g.z);});
    // the growing grove (its rods taller)
    const sg=growScale(t);rods.forEach((r,i)=>{if(r.grove===growK)rod[4*i]=r.len*sg;});rodAttr.needsUpdate=true;
    U.uTime.value=t;
    let i=0;while(i<path.length-2&&path[i+1].t<=t)i++;const a=path[i],b=path[i+1],e=smooth(a.t,b.t,t);
    const L=(x,y)=>x.map((v,j)=>v+(y[j]-v)*e);cam.position.set(...L(a.pos,b.pos));cam.lookAt(...L(a.target,b.target));cam.fov=a.fov+(b.fov-a.fov)*e;cam.updateProjectionMatrix();cam.updateMatrixWorld();
    U.uCam.value.copy(cam.position);U.uRot.value.setFromMatrix4(cam.matrixWorld);U.uTanHalf.value=Math.tan(cam.fov*Math.PI/360);
    renderer.setClearColor(0x000000,1);renderer.clear();renderer.render(scene,cam);}};
}

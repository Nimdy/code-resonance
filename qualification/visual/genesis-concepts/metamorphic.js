// Concept C · Metamorphic Matter (an animatic, scripted; not a simulation). One continuous matter to the horizon, in
// domains (one per subsystem, repeating), each in a physical regime its law gives it: crystal (faceted basalt-like
// columns), liquid (a mirror), granular (loose blocks) or foam (packed domes). Regimes change by fronts, never by fades:
// the score composes the matter. A melody note nucleates a crystal that grows outward through the liquid; a pad melts a
// pool into the crystal; a bass note sends rings across the liquid and shakes the grains. The structure transforms at
// the scale of the whole: a dependency opens a molten channel between two domains; a freeze can sweep the sea.
// Scripted for the animatic: the recorded dependency's channel melts open at 12 s; from 22 s a freeze sweeps the whole
// sea outward from the core and crystal towers rise; from 31 s the camera descends to the surface.
const MAXE=64,MAXK=8;
// the regime map, once a frame (one period, 512²): the domains' regimes blended over their borders, the music's discs,
// the dependency's channel and the freeze; alpha: the liquid's rings from the bass
const MAP_FS=`precision highp float;
uniform float uTime;uniform vec3 uSeat[${MAXK}];uniform vec4 uReg[${MAXK}];uniform int uK;uniform float uPeriod;
uniform vec4 uEv[${MAXE}];uniform vec4 uEv2[${MAXE}];uniform vec4 uChan;uniform vec2 uChanT;uniform vec3 uFreeze;
in vec2 vUv;out vec4 outColor;
void main(){
  vec2 p=(vUv-.5)*uPeriod;float b1=1e9,b2=1e9;int k1=0,k2=0;
  for(int k=0;k<${MAXK};k++){if(k>=uK)break;vec2 d=p-uSeat[k].xz;d-=uPeriod*floor(d/uPeriod+.5);float e=dot(d,d)-uSeat[k].y;if(e<b1){b2=b1;k2=k1;b1=e;k1=k;}else if(e<b2){b2=e;k2=k;}}
  float bl=.5*clamp(1.-(b2-b1)/90.,0.,1.);vec4 w=mix(uReg[k1],uReg[k2],bl);float ripple=0.;
  for(int i=0;i<${MAXE};i++){vec4 e=uEv[i];if(e.w==0.)continue;float age=uTime-e.z;if(age<0.)continue;
    vec2 d=p-e.xy;d-=uPeriod*floor(d/uPeriod+.5);float r=length(d);
    if(e.w>2.5){if(age<5.)ripple+=.6*uEv2[i].z*exp(-age/1.6)*sin(r*.9-age*9.)*exp(-abs(r-age*10.)/6.);continue;}
    float R=uEv2[i].x*(1.-exp(-age/uEv2[i].y)),inside=1.-smoothstep(R-.6,R+.6,r);vec4 to=e.w>1.5?vec4(0,1,0,0):vec4(1,0,0,0);w=mix(w,to,inside*uEv2[i].z);}
  vec2 a=uChan.xy,c=uChan.zw;vec2 ba=c-a;ba-=uPeriod*floor(ba/uPeriod+.5);vec2 pa=p-a;pa-=uPeriod*floor(pa/uPeriod+.5);
  float hh=clamp(dot(pa,ba)/max(dot(ba,ba),1e-3),0.,1.),open=clamp((uTime-uChanT.x)/uChanT.y,0.,1.),along=abs(hh-.5)*2.;
  float cw=(1.-smoothstep(3.,4.5,length(pa-ba*hh)))*step(along,open);w=mix(w,vec4(0,1,0,0),cw);
  vec2 fd=p-uFreeze.xy;fd-=uPeriod*floor(fd/uPeriod+.5);float frozen=1.-smoothstep(uFreeze.z-2.,uFreeze.z+2.,length(fd));w=mix(w,vec4(1,0,0,0),frozen*step(.5,uFreeze.z));
  w/=max(1e-3,w.x+w.y+w.z+w.w);outColor=vec4(w.x,w.y,w.z,ripple);
}`;
const FS=`precision highp float;
uniform vec3 uCamPos;uniform mat3 uCamRot;uniform float uTanHalf;uniform float uAspect;uniform float uTime;uniform float uPeriod;
uniform sampler2D uMap;uniform vec3 uFreeze;uniform vec3 uSun;uniform vec3 uSunCol;
in vec2 vUv;out vec4 outColor;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec4 hexCell(vec2 p){vec2 s=vec2(1.,1.7320508);vec4 hc=floor(vec4(p,p-vec2(.5,1.))/s.xyxy)+.5;vec4 h=vec4(p-hc.xy*s,p-(hc.zw+.5)*s);return dot(h.xy,h.xy)<dot(h.zw,h.zw)?vec4(h.xy,hc.xy):vec4(h.zw,hc.zw+.5);}
float hexD(vec2 p){p=abs(p);return max(dot(p,vec2(.5,.8660254)),p.x);}
vec3 sky(vec3 d){float y=max(d.y,0.);vec3 c=mix(vec3(.62,.66,.74),vec3(.16,.22,.38),pow(y,.6));c+=uSunCol*pow(max(dot(d,uSun),0.),1500.)*3.+uSunCol*pow(max(dot(d,uSun),0.),8.)*.25;return c;}
// a column with a faceted (pyramidal) termination; the rare tall ones, where the freeze has passed, are spires
float crystal(vec3 p,float tower){vec4 c=hexCell(p.xz/2.6);float r=h21(c.zw),r2=h21(c.zw+7.1),hx=hexD(c.xy);
  float spire=tower*step(.972,r2);float H=1.6+3.4*r+tower*r2*2.5+spire*(r2-.972)*1100.;
  return max((hx-.47)*2.6,(p.y-(H-hx*(1.1+spire*9.)))*.8);}
// the crystal's normal from its own cell (a side face or the faceted top): finite differences would straddle cells
vec3 crystalN(vec3 p,float tower){vec4 c=hexCell(p.xz/2.6);float r=h21(c.zw),r2=h21(c.zw+7.1),hx=hexD(c.xy);
  float spire=tower*step(.972,r2),slope=1.1+spire*9.,H=1.6+3.4*r+tower*r2*2.5+spire*(r2-.972)*1100.;
  vec2 a=abs(c.xy),sg=sign(c.xy);vec2 g=dot(a,vec2(.5,.8660254))>a.x?vec2(.5,.8660254)*sg:vec2(sg.x,0.);
  float side=(hx-.47)*2.6,top=(p.y-(H-hx*slope))*.8;
  return side>top?normalize(vec3(g.x,0.,g.y)):normalize(vec3(g.x*slope/2.6,1.,g.y*slope/2.6));}
float liquid(vec3 p,float ripple){float h=.9+.12*sin(p.x*.21+uTime*.7)*sin(p.z*.17-uTime*.5)+ripple;return (p.y-h)*.7;}
float granular(vec3 p){vec2 g=floor(p.xz/.95),f=p.xz/.95-g-.5;float H=.9+1.3*h21(g);return max((max(abs(f.x),abs(f.y))-.42)*.95,p.y-H);}
float foam(vec3 p){vec2 g=floor(p.xz/3.4);float bd=9.;vec2 best=g;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 c=g+vec2(i,j),o=c+.15+.7*vec2(h21(c),h21(c+3.3));float d=length(p.xz/3.4-o);if(d<bd){bd=d;best=c;}}
  float R=1.1*3.4*(.55+.25*h21(best+9.)),dd=bd*3.4;return (p.y-(1.4+sqrt(max(R*R-dd*dd,0.))*.75))*.6;}
vec4 W(vec3 p,out float ripple,out float tower){vec4 m=texture(uMap,p.xz/uPeriod+.5);ripple=m.a;vec2 fd=p.xz-uFreeze.xy;fd-=uPeriod*floor(fd/uPeriod+.5);
  tower=(1.-smoothstep(uFreeze.z-2.,uFreeze.z+2.,length(fd)))*step(.5,uFreeze.z);return vec4(m.rgb,max(0.,1.-m.r-m.g-m.b));}
float field(vec3 p,out vec4 w){float rp,tw;w=W(p,rp,tw);float d=0.;
  if(w.x>.01)d+=w.x*crystal(p,tw);if(w.y>.01)d+=w.y*liquid(p,rp);if(w.z>.01)d+=w.z*granular(p);if(w.w>.01)d+=w.w*foam(p);return d;}
float F(vec3 p){vec4 w;return field(p,w);}
void main(){
  vec2 q=(vUv*2.-1.)*vec2(uAspect,1.)*uTanHalf;vec3 rd=normalize(uCamRot*vec3(q,-1.)),ro=uCamPos;
  float t=.1;bool hit=false;vec4 w;
  if(ro.y>70.){if(rd.y>=0.){outColor=vec4(sky(rd),1.);return;}t=(ro.y-70.)/-rd.y;}
  float tp=t;
  for(int i=0;i<220;i++){vec3 p=ro+rd*t;if(p.y>72.&&rd.y>0.)break;float d=field(p,w);if(d<.02*(1.+t*.01)){hit=true;break;}tp=t;t+=clamp(d,.05,1.3+t*.012);if(t>900.)break;}
  // a step can land inside a tall column from a short one's cell: back to the surface between the last two steps
  if(hit){float a=tp,b=t;for(int i=0;i<7;i++){float m=.5*(a+b);if(field(ro+rd*m,w)<0.)b=m;else a=m;}t=b;field(ro+rd*t,w);}
  vec3 col;
  if(hit){vec3 p=ro+rd*t;const vec2 k=vec2(1,-1);float e=.03+t*.0006;
    vec3 n=normalize(k.xyy*F(p+k.xyy*e)+k.yyx*F(p+k.yyx*e)+k.yxy*F(p+k.yxy*e)+k.xxx*F(p+k.xxx*e));
    if(w.x>.5){float rp,tw;W(p,rp,tw);n=normalize(mix(n,crystalN(p,tw),smoothstep(.5,.8,w.x)));}
    float dif=max(dot(n,uSun),0.),sh=1.;float st=.3;for(int i=0;i<24;i++){float d=F(p+n*.05+uSun*st);sh=min(sh,4.*d/st);st+=clamp(d,.3,3.);if(sh<.02||st>60.)break;}sh=.25+.75*clamp(sh,0.,1.);
    float ao=clamp(F(p+n*1.2)/1.2,0.,1.)*.6+.4;
    vec3 v=-rd,r=reflect(rd,n);float fr=.04+.96*pow(1.-max(dot(n,v),0.),5.);
    vec3 cC=vec3(.03,.035,.045)*(.3+.7*dif*sh)+sky(r)*(.12+.88*fr)*(.35+.65*sh)+uSunCol*pow(max(dot(r,uSun),0.),200.)*3.*sh;
    vec3 cL=sky(r)*(.55+.45*fr)*vec3(.82,.84,.88)+uSunCol*pow(max(dot(r,uSun),0.),400.)*6.*sh;
    vec3 cG=vec3(.42,.36,.28)*(.25+.9*dif*sh)*ao;
    vec3 cF=vec3(.86,.87,.88)*(.35+.75*dif*sh)*ao+vec3(.9,.92,1.)*.12*(1.-dif);
    col=(w.x*cC+w.y*cL+w.z*cG+w.w*cF)/max(1e-3,w.x+w.y+w.z+w.w);
    col=mix(col,sky(normalize(vec3(rd.x,.03,rd.z)))*.92,1.-exp(-t*.0035));
  }else col=sky(rd);
  outColor=vec4(col,1.);
}`;
export function create({THREE,renderer,width,height,notes,structure,laws,params={}}){
  const subs=structure.after.subsystems.slice(0,MAXK),K=subs.length,PERIOD=params.period??150;
  // the domains: seats spread over a period, sized by files; each domain's regime from its role (what the volume's
  // regimes gave it: the core liquid, cohesive logic crystal, loose logic foam, tests granular)
  const seats=subs.map((s,k)=>{const a=k*2.399963,r=PERIOD*.42*Math.sqrt((k+.5)/K);return [r*Math.cos(a),r*Math.sin(a),(6+3*s.files)*(s.role==='core'?2:1)];});
  const REG={core:[0,1,0,0],tests:[0,0,1,0],logic:[1,0,0,0]};
  const base=subs.map((s,k)=>s.role==='logic'&&k%3===2?[0,0,0,1]:(REG[s.role]||[1,0,0,0]));
  // the music's events: a melody note nucleates a crystal in its region's domain (at a place its pitch chooses), a pad
  // melts a pool, a bass note rings the liquid and shakes the grains
  const hash=x=>{x=Math.imul(x^0x9E3779B9,0x85EBCA6B);x^=x>>>13;x=Math.imul(x,0xC2B2AE35);return ((x^(x>>>16))>>>0)/4294967296;};
  const ev=notes.map((n,i)=>{const s=seats[n.k%K],a=hash(i*3+n.midi)*Math.PI*2,r=Math.sqrt(s[2])*.9*Math.sqrt(hash(i*5+1));const x=s[0]+r*Math.cos(a),z=s[1]+r*Math.sin(a);
    if(n.group==='melody'||n.group==='counter')return {x,z,t:n.t,type:1,R:4+9*n.v,tau:1.4,amt:1};
    if(n.group==='pad')return {x,z,t:n.t,type:2,R:5+8*n.v,tau:2.2,amt:.9};
    if(n.group==='bass')return {x:s[0],z:s[1],t:n.t,type:3,R:0,tau:1,amt:.6+.6*n.v};
    return null;}).filter(Boolean);
  const recorded=structure.change&&structure.change.kind==='dependency'?structure.change:null;
  const chan=recorded?[...seats[recorded.a].slice(0,2),...seats[recorded.b].slice(0,2)]:[0,0,0,0];
  const core=Math.max(0,subs.findIndex(s=>s.role==='core'));
  const U={uCamPos:{value:new THREE.Vector3()},uCamRot:{value:new THREE.Matrix3()},uTanHalf:{value:1},uAspect:{value:width/height},uTime:{value:0},
    uSeat:{value:seats.map(s=>new THREE.Vector3(s[0],s[2]*s[2]*.0,s[1]))},uReg:{value:[...Array(MAXK)].map(()=>new THREE.Vector4())},uK:{value:K},uPeriod:{value:PERIOD},
    uEv:{value:[...Array(MAXE)].map(()=>new THREE.Vector4())},uEv2:{value:[...Array(MAXE)].map(()=>new THREE.Vector4())},uChan:{value:new THREE.Vector4(...chan)},uChanT:{value:new THREE.Vector2(12,3)},
    uFreeze:{value:new THREE.Vector3(...seats[core].slice(0,2),0)},uSun:{value:new THREE.Vector3(.86,.13,-.49).normalize()},uSunCol:{value:new THREE.Color('#ffe1b8')}};
  // a domain's weight in its power diagram: its size
  seats.forEach((s,k)=>U.uSeat.value[k].set(s[0],s[2]*s[2],s[1]));
  base.forEach((b,k)=>U.uReg.value[k].set(...b));
  const VS='in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const target=new THREE.WebGLRenderTarget(512,512,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,depthBuffer:false});
  U.uMap={value:target.texture};
  const mapScene=new THREE.Scene(),mapQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,vertexShader:VS,fragmentShader:MAP_FS}));mapQuad.frustumCulled=false;mapScene.add(mapQuad);
  const mat=new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,vertexShader:VS,fragmentShader:FS});
  const scene=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);quad.frustumCulled=false;scene.add(quad);const cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const path=params.path||[{t:0,pos:[-20,46,95],target:[10,0,-40],fov:56},{t:31,pos:[-20,46,95],target:[10,0,-40],fov:56},{t:40,pos:[4,10,34],target:[14,8,-10],fov:62}];
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const m4=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0),P=new THREE.Vector3(),T=new THREE.Vector3();
  return {render(t){
    U.uTime.value=t;
    // the events in play: the last 64 begun (a nucleus or a pool stays; a ring fades)
    const live=ev.filter(e=>e.t<=t).slice(-MAXE);
    U.uEv.value.forEach((v,i)=>{const e=live[i];if(!e){v.set(0,0,0,0);U.uEv2.value[i].set(0,1,0,0);return;}v.set(e.x,e.z,e.t,e.type);U.uEv2.value[i].set(e.R,e.tau,e.amt,0);});
    // the freeze: a front from the core, 22 s to 30 s, across the period
    U.uFreeze.value.z=PERIOD*.9*smooth(22,30,t);
    let i=0;while(i<path.length-2&&path[i+1].t<=t)i++;const a=path[i],b=path[i+1],e=smooth(a.t,b.t,t);
    P.set(...a.pos).lerp(new THREE.Vector3(...b.pos),e);T.set(...a.target).lerp(new THREE.Vector3(...b.target),e);
    m4.lookAt(P,T,up);U.uCamRot.value.setFromMatrix4(m4);U.uCamPos.value.copy(P);U.uTanHalf.value=Math.tan((a.fov+(b.fov-a.fov)*e)*Math.PI/360);
    renderer.setRenderTarget(target);renderer.render(mapScene,cam);renderer.setRenderTarget(null);renderer.render(scene,cam);}};
}

// Concept A · Impossible Topology (an animatic, scripted; not a simulation). Every subsystem is a room, sized by its
// files; every dependency glues a doorway of one room to a doorway of another, so a door opens onto a room that is
// elsewhere: the space is the dependency graph. A mutual dependency is a corridor without end; a doorway glued with a
// twist turns the space beyond it (a vertical shaft through a wall). The score acts on the space itself: a bass note
// stretches its room (and every vista through it) and rings out; each note's light travels from room to room along the
// dependencies, so an echo is something you see recede through the doors.
// Scripted for the animatic (one take): the endless corridor of the mutual dependency, still; at 14 s its coupling
// tightens and its doorways twist a quarter turn, so the corridor turns into a spiral; the view turns to a side doorway
// into the tests' room, where at 24 s the recorded dependency's doorway opens in the floor; the camera walks through
// (it passes doorways as the light does) to the edge of that opening and looks down into the space beyond it.
const FACES=6,MAXR=8,HOPS=30;
const FS=`precision highp float;
uniform vec3 uHalf[${MAXR}];uniform vec3 uTint[${MAXR}];uniform float uGlow[${MAXR}];uniform vec4 uDoor[${MAXR*FACES}];uniform vec3 uRim[${MAXR*FACES}];
uniform vec3 uCamPos;uniform mat3 uCamRot;uniform float uTanHalf;uniform float uAspect;uniform int uStart;uniform vec3 uHaze;uniform float uTime;
in vec2 vUv;out vec4 outColor;
vec3 faceN(int f){return f==0?vec3(1,0,0):f==1?vec3(-1,0,0):f==2?vec3(0,1,0):f==3?vec3(0,-1,0):f==4?vec3(0,0,1):vec3(0,0,-1);}
vec3 faceU(int f){return f==2||f==3?vec3(0,0,1):vec3(0,1,0);}
vec2 doorHalf(int f){return f==2||f==3?vec2(3.2,3.2):vec2(2.1,3.1);}
vec3 doorC(int f,vec3 h){vec3 n=faceN(f);vec3 c=n*abs(dot(n,h));if(f!=2&&f!=3)c.y=-h.y+3.1;return c;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
  vec2 q0=(vUv*2.-1.)*vec2(uAspect,1.)*uTanHalf;vec3 d=normalize(uCamRot*vec3(q0,-1.)),o=uCamPos;
  int r=uStart;float dist=0.,hops=0.;vec3 col=vec3(0.);bool done=false;
  for(int i=0;i<${HOPS};i++){
    vec3 h=uHalf[r];vec3 tt=(sign(d)*h-o)/d;float t=min(tt.x,min(tt.y,tt.z));
    int axis=tt.x<=t?0:(tt.y<=t?1:2);vec3 p=o+d*t;dist+=t;
    float dv=axis==0?d.x:(axis==1?d.y:d.z);int f=axis*2+(dv>0.?0:1);
    vec4 D=uDoor[r*${FACES}+f];vec3 n=faceN(f),u=faceU(f),tv=cross(u,n),c=doorC(f,h);
    vec2 q=vec2(dot(p-c,tv),dot(p-c,u));vec2 hs=doorHalf(f)*D.z;
    if(D.x>=0.&&abs(q.x)<hs.x&&abs(q.y)<hs.y){
      int g=int(D.x+.5),r2=g/${FACES},f2=g-r2*${FACES};
      vec3 dl=vec3(dot(d,tv),dot(d,u),dot(d,n));q=rot(D.y)*q;dl.xy=rot(D.y)*dl.xy;
      vec3 n2=faceN(f2),u2=faceU(f2),t2=cross(u2,n2),c2=doorC(f2,uHalf[r2]);
      o=c2-q.x*t2+q.y*u2-n2*.002;d=normalize(-dl.x*t2+dl.y*u2-dl.z*n2);r=r2;hops+=1.;continue;
    }
    // a wall: lit from above (brighter toward the ceiling), darkened into its corners, washed by its room's music light;
    // a doorway glued somewhere has a thin luminous jamb in the colour of its dependency
    vec3 a=abs(p);vec3 e=h-a;float edge=min(axis==0?min(e.y,e.z):axis==1?min(e.x,e.z):min(e.x,e.y),9.);
    float ao=1.-.55*exp(-edge/1.1);float up=.55+.45*smoothstep(-h.y,h.y,p.y);if(f==3)up=.42;if(f==2)up=1.05;
    // the walls' modular joints (1.5 units): the same module in every room, so a room's size reads against the next
    vec3 gp=p/1.5;vec3 gf=abs(fract(gp)-.5);float joint=axis==0?min(gf.y,gf.z):axis==1?min(gf.x,gf.z):min(gf.x,gf.y);
    float jl=1.-.22*(1.-smoothstep(.0,.035+dist*.0006,.5-joint));
    vec3 base=uTint[r]*up*ao*jl;
    vec2 qe=abs(q)-doorHalf(f)*max(D.z,.0001);float rim=D.x>=0.?exp(-max(max(qe.x,qe.y),0.)/.05)*step(max(qe.x,qe.y),.35):0.;
    float g=uGlow[r];
    col=base*(.5+.9*g)+uRim[r*${FACES}+f]*rim*(.9+2.6*g)+vec3(1.,.74,.42)*g*.55;
    done=true;break;
  }
  if(!done)col=uHaze;
  // each passage through a doorway and the distance travelled fade toward the haze (the space's depth)
  float k=pow(.84,hops)*exp(-dist*.004);col=mix(uHaze,col,k);
  outColor=vec4(col,1.);
}`;
export function create({THREE,renderer,width,height,notes,structure,laws,params={}}){
  const subs=structure.after.subsystems.slice(0,MAXR),K=subs.length;
  const hash=(x)=>{x=Math.imul(x^0x9E3779B9,0x85EBCA6B);x^=x>>>13;x=Math.imul(x,0xC2B2AE35);return ((x^(x>>>16))>>>0)/4294967296;};
  // rooms: width and depth from the files, height from the role (the tests stand tall), all with their own proportions
  const half=subs.map((s,k)=>{const w=4+1.3*Math.sqrt(s.files);return [w*(.85+.5*hash(k*7+1)),s.role==='tests'?8.5:s.role==='core'?7:4.4+.7*Math.sqrt(s.files),w*(.8+.6*hash(k*7+2))];});
  const TONE={core:[.6,.58,.55],logic:[.55,.56,.58],tests:[.62,.59,.55],interface:[.58,.56,.6],services:[.55,.58,.55],model:[.6,.58,.56]};
  const RIM=[[1,.62,.25],[.35,.75,1],[1,.42,.38],[.55,1,.7],[.95,.85,.4],[.7,.55,1],[.4,1,.95],[1,.7,.85]];
  // doorways: each dependency takes the next free face of both its rooms (walls first, then ceiling and floor)
  const ORDER=[0,1,4,5,2,3],next=new Array(K).fill(0),doors=[];
  const edges=structure.after.deps.map(e=>({a:e.a,b:e.b,w:e.w,key:`${e.a}>${e.b}`}));
  const recorded=structure.change&&structure.change.kind==='dependency'?`${structure.change.a}>${structure.change.b}`:null;
  edges.sort((x,y)=>(x.key===recorded)-(y.key===recorded));
  for(const [i,e] of edges.entries()){if(e.a>=K||e.b>=K||next[e.a]>=6||next[e.b]>=6)continue;
    const fa=ORDER[next[e.a]++],fb=ORDER[next[e.b]++];doors.push({...e,i,fa,fb,isNew:e.key===recorded});}
  // the mutual dependency (a cycle of two): the doorways that twist at 22 s
  const mutual=doors.filter(d=>doors.some(x=>x.a===d.b&&x.b===d.a));
  // music: a note lights its region's room and its light travels along the dependencies, a room a hop (fading); bass and
  // pads stretch their room, which rings out
  const adj=[...Array(K)].map(()=>[]);for(const d of doors){adj[d.a].push(d.b);adj[d.b].push(d.a);}
  const hopsFrom=s=>{const h=new Array(K).fill(99);h[s]=0;const q=[s];while(q.length){const x=q.shift();for(const y of adj[x])if(h[y]>h[x]+1){h[y]=h[x]+1;q.push(y);}}return h;};
  const HOP=[...Array(K)].map((_,k)=>hopsFrom(k));
  const W={bass:1,pad:.55,melody:.45,counter:.35,arp:.25,atmos:.2};
  const glowAt=(t,j)=>{let g=0;for(const n of notes){if(n.t>t)break;const h=HOP[n.k%K][j];if(h>6)continue;const x=t-n.t-h*.16;if(x<0)continue;g+=(W[n.group]||.2)*n.v*Math.pow(.62,h)*Math.exp(-x/.9)*(1-Math.exp(-x/.035));}return Math.min(1.4,g);};
  const stretchAt=(t,j)=>{let s=0;for(const n of notes){if(n.t>t)break;if(n.k%K!==j||(n.group!=='bass'&&n.group!=='pad'))continue;const x=t-n.t;s+=(n.group==='bass'?.32:.14)*n.v*Math.exp(-x/1.6)*Math.cos(x*4.2);}return s;};
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const uniforms={uHalf:{value:[...Array(MAXR)].map(()=>new THREE.Vector3(1,1,1))},uTint:{value:[...Array(MAXR)].map(()=>new THREE.Vector3())},uGlow:{value:new Array(MAXR).fill(0)},
    uDoor:{value:[...Array(MAXR*FACES)].map(()=>new THREE.Vector4(-1,0,0,0))},uRim:{value:[...Array(MAXR*FACES)].map(()=>new THREE.Vector3())},
    uCamPos:{value:new THREE.Vector3()},uCamRot:{value:new THREE.Matrix3()},uTanHalf:{value:1},uAspect:{value:width/height},uStart:{value:0},uHaze:{value:new THREE.Vector3(.93,.88,.8)},uTime:{value:0}};
  const mat=new THREE.RawShaderMaterial({uniforms,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,
    vertexShader:'in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:FS});
  const scene=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);quad.frustumCulled=false;scene.add(quad);const cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  // the camera: in the tests' room (the most connected), still, then a slow walk toward the new doorway
  // (default: a room of the mutual dependency, facing the doorway of the cycle, a side doorway in view)
  const cyc=mutual[0],start=params.room??(cyc?cyc.a:0);
  // the camera: keyframes in the start room's coordinates, extended through its doorways (see locate)
  const H0=half[start],side=doors.find(d=>(d.a===start&&d.fa===4)||(d.b===start&&d.fb===4)),far=side?(side.a===start?side.b:side.a):start,Hf=half[far];
  const eye=-H0[1]+1.7,z0=-.18*H0[2],x0=-.15*H0[0],zIn=H0[2]+Hf[0];
  const path=params.path||[{t:0,pos:[x0,eye,z0],target:[H0[0],eye+.9,-.02*H0[2]],fov:70},{t:18,pos:[x0,eye,z0],target:[H0[0],eye+.9,-.02*H0[2]],fov:70},
    {t:23,pos:[x0,eye,z0],target:[0,eye-.4,H0[2]],fov:72},{t:25,pos:[x0*.5,eye,z0+1],target:[0,eye-.6,H0[2]+2],fov:72},
    {t:31,pos:[0,eye,zIn-4.2],target:[0,eye-5,zIn],fov:76},{t:40,pos:[0,eye,zIn-3.6],target:[0,eye-6,zIn+.4],fov:78}];
  const at=(f,k)=>{const h=half[k];return [f[0]*h[0],-h[1]+f[1],f[2]*h[2]];};
  const m4=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0),P=new THREE.Vector3(),T=new THREE.Vector3();
  // the doorways' geometry, as the shader has it
  const FN=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],FU=f=>f===2||f===3?[0,0,1]:[0,1,0],DH=f=>f===2||f===3?[3.2,3.2]:[2.1,3.1];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const doorC=(f,h)=>{const n=FN[f],c=n.map((x,j)=>x*Math.abs(dot(n,h)));if(f!==2&&f!==3)c[1]=-h[1]+3.1;return c;};
  const glued=(r,f,t)=>{for(const d of doors){const open=d.isNew?smooth(24,26.5,t):1;if(open<=0)continue;const tw=mutual.includes(d)?Math.PI/2*smooth(14,18,t):0;
    if(d.a===r&&d.fa===f)return {r2:d.b,f2:d.fb,tw,open};if(d.b===r&&d.fb===f)return {r2:d.a,f2:d.fa,tw:-tw,open};}return null;};
  // march from p in room r along delta, through the glued doorways: the room reached, the point in it, and the map of
  // directions from the start room into it (the camera passes doorways as the light does)
  function locate(r,p,delta,t){
    let len=Math.hypot(...delta);let d=len>1e-9?delta.map(x=>x/len):[0,0,1];let M=[[1,0,0],[0,1,0],[0,0,1]];p=p.slice();
    for(let i=0;i<12&&len>1e-9;i++){const h=[...half[r]];
      const tt=[0,1,2].map(j=>Math.abs(d[j])<1e-12?Infinity:((d[j]>0?h[j]:-h[j])-p[j])/d[j]),tm=Math.min(...tt);
      if(tm>=len){p=p.map((x,j)=>x+d[j]*len);break;}
      const ax=tt.indexOf(tm),f=ax*2+(d[ax]>0?0:1);p=p.map((x,j)=>x+d[j]*tm);len-=tm;
      const G=glued(r,f,t),n=FN[f],u=FU(f),tv=cross(u,n),c=doorC(f,h),q=[dot(p.map((x,j)=>x-c[j]),tv),dot(p.map((x,j)=>x-c[j]),u)],hs=DH(f);
      if(!G||Math.abs(q[0])>hs[0]*G.open||Math.abs(q[1])>hs[1]*G.open){p=p.map((x,j)=>x-n[j]*.3);break;}
      const cs=Math.cos(G.tw),sn=Math.sin(G.tw),rot=v=>[cs*v[0]-sn*v[1],sn*v[0]+cs*v[1]];
      const n2=FN[G.f2],u2=FU(G.f2),t2=cross(u2,n2),c2=doorC(G.f2,half[G.r2]);
      const map=v=>{const l=[dot(v,tv),dot(v,u),dot(v,n)],xy=rot(l);return [0,1,2].map(j=>-xy[0]*t2[j]+xy[1]*u2[j]-l[2]*n2[j]);};
      const qq=rot(q);p=[0,1,2].map(j=>c2[j]-qq[0]*t2[j]+qq[1]*u2[j]-n2[j]*.01);d=map(d);
      const cols=[0,1,2].map(j=>map([M[0][j],M[1][j],M[2][j]]));M=[0,1,2].map(i2=>[0,1,2].map(j=>cols[j][i2]));r=G.r2;}
    return {r,p,apply:v=>[0,1,2].map(i2=>M[i2][0]*v[0]+M[i2][1]*v[1]+M[i2][2]*v[2])};
  }
  return {doors,render(t){
    for(let k=0;k<K;k++){const hh=half[k],s=1+stretchAt(t,k);uniforms.uHalf.value[k].set(hh[0],hh[1],hh[2]*s);
      const c=TONE[subs[k].role]||TONE.logic;uniforms.uTint.value[k].set(...c);uniforms.uGlow.value[k]=glowAt(t,k);}
    for(const v of uniforms.uDoor.value)v.set(-1,0,0,0);
    const twist=Math.PI/2*smooth(14,18,t);
    for(const d of doors){const open=d.isNew?smooth(24,26.5,t):1;if(open<=0)continue;const tw=mutual.includes(d)?twist:0;
      uniforms.uDoor.value[d.a*FACES+d.fa].set(d.b*FACES+d.fb,tw,open,0);uniforms.uDoor.value[d.b*FACES+d.fb].set(d.a*FACES+d.fa,-tw,open,0);
      const c=RIM[d.i%RIM.length];uniforms.uRim.value[d.a*FACES+d.fa].set(...c);uniforms.uRim.value[d.b*FACES+d.fb].set(...c);}
    let i=0;while(i<path.length-2&&path[i+1].t<=t)i++;const a=path[i],b=path[i+1],e=smooth(a.t,b.t,t);
    P.set(...a.pos).lerp(new THREE.Vector3(...b.pos),e);T.set(...a.target).lerp(new THREE.Vector3(...b.target),e);
    const L=locate(start,[x0,eye,z0],[P.x-x0,P.y-eye,P.z-z0],t),view=L.apply([T.x-P.x,T.y-P.y,T.z-P.z]),upL=L.apply([0,1,0]);
    uniforms.uStart.value=L.r;P.set(...L.p);T.set(P.x+view[0],P.y+view[1],P.z+view[2]);up.set(...upL);
    m4.lookAt(P,T,up);uniforms.uCamRot.value.setFromMatrix4(m4);uniforms.uCamPos.value.copy(P);uniforms.uTanHalf.value=Math.tan((a.fov+(b.fov-a.fov)*e)*Math.PI/360);uniforms.uTime.value=t;
    renderer.render(scene,cam);}};
}

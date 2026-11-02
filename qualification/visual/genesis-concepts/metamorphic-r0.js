// Concept C · Metamorphic Matter, renderer C-R0 (a feasibility renderer for the same scripted animatic; not a
// simulation). The reference (metamorphic.js, commit 71b0721) raymarches blended signed distances of four materials at
// every step, shadow and normal (about 100 ms a frame at 1080p on the AMD iGPU). Here the same scene is what it really
// is: a field of hexagonal cells, each one column of one material. So:
//  - the phase representation is a map of the cells over one period (58 x 66 cells), computed once a frame on the CPU
//    from the same script (domains, the score's events, the dependency's channel, the freeze), closed-form in time:
//    each front's arrival at a cell is solved, and the cell's column grows after it;
//  - one full-screen ray cast steps from cell to cell (a hexagonal grid traversal) and intersects each cell's own
//    geometry exactly: a crystal prism with a faceted top, the mercury plane, the grains (a square sub-grid of
//    blocks), a foam dome; the bass's rings and the liquid's swell perturb the mercury's normal;
//  - the monumental spires are instanced prisms, rasterised and depth-tested against the ray cast, and cast their long
//    shadows through a sun shadow map; the low columns shadow each other by a short traversal toward the sun.
// Every pass is timed separately when profiling.
const COLS=58,ROWS=66,CELL=2.6,SQ3=Math.sqrt(3),PX=COLS*CELL,PZ=ROWS/2*SQ3*CELL,MAXR=8;
const COMMON=`
uniform vec3 uSun;uniform vec3 uSunCol;
vec3 sky(vec3 d){float y=max(d.y,0.);vec3 c=mix(vec3(.62,.66,.74),vec3(.16,.22,.38),pow(y,.6));c+=uSunCol*pow(max(dot(d,uSun),0.),1500.)*3.+uSunCol*pow(max(dot(d,uSun),0.),8.)*.25;return c;}
vec3 crystalShade(vec3 n,vec3 rd,float dif,float sh){vec3 r=reflect(rd,n);float fr=.04+.96*pow(1.-max(dot(n,-rd),0.),5.);
  return vec3(.03,.035,.045)*(.3+.7*dif*sh)+sky(r)*(.12+.88*fr)*(.35+.65*sh)+uSunCol*pow(max(dot(r,uSun),0.),200.)*3.*sh;}
vec3 fogged(vec3 c,vec3 rd,float t){return mix(c,sky(normalize(vec3(rd.x,.03,rd.z)))*.92,1.-exp(-t*.0035));}
`;
const RAY_FS=`precision highp float;precision highp sampler2D;
uniform vec3 uCamPos;uniform mat3 uCamRot;uniform float uTanHalf;uniform float uAspect;uniform mat4 uViewProj;uniform float uTime;
uniform sampler2D uCells;uniform sampler2D uCellShadow;uniform sampler2D uShadow;uniform int uShadowSteps;uniform float uLod;uniform float uSlab;uniform int uDebug;uniform sampler2D uSpireCol;uniform sampler2D uSpireDepth;uniform vec2 uNearFar;uniform vec3 uFwd;uniform mat4 uShadowMat;uniform vec4 uRing[8];uniform int uRings;
${COMMON}
in vec2 vUv;out vec4 outColor;
const float S=${CELL.toFixed(3)},Q3=1.7320508,COLS=${COLS}.,ROWS=${ROWS}.;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
// the cell's state: weights of crystal, liquid, grains (foam = the rest) and the freeze's passage (tower)
vec4 cellAt(vec2 c){float row=floor(c.y/(Q3*.5)+.5),col=floor(c.x+.25);return texelFetch(uCells,ivec2(int(mod(col,COLS)),int(mod(row,ROWS))),0);}
vec2 nearestCenter(vec2 p){vec2 s=vec2(1.,Q3);vec2 a=(floor(p/s)+.5)*s;vec2 b=(floor((p-vec2(.5,Q3*.5))/s)+.5)*s+vec2(.5,Q3*.5);
  return dot(p-a,p-a)<dot(p-b,p-b)?a:b;}
// the six edge normals of a cell (pointy in z): a neighbour's centre is one cell unit along each
const vec2 N0=vec2(1.,0.),N1=vec2(.5,.8660254),N2=vec2(-.5,.8660254);
float hexD(vec2 p){p=abs(p);return max(dot(p,N1),p.x);}
// a cell's identity exactly as the reference's hexCell gives it (its column and half its row), for the hash
vec2 idOf(vec2 c){return vec2(c.x,floor(c.y/(Q3*.5)+.5)*.5);}
// the column of a crystal cell: its height (the freeze adds to it; spires are drawn as instances) and its top's slope
float towerOf(float a){return a>=.5?(a*255.-128.)/127.:a*255./127.;}
float colH(vec2 id,float a){float r=h21(id),r2=h21(id+7.1);return 1.6+3.4*r+towerOf(a)*r2*2.5;}
bool isSpire(vec2 id,float a){return a>=.5;}
float ripple(vec2 p,out vec2 g){float h=.12*sin(p.x*.21+uTime*.7)*sin(p.y*.17-uTime*.5);g=vec2(.12*.21*cos(p.x*.21+uTime*.7)*sin(p.y*.17-uTime*.5),.12*.17*sin(p.x*.21+uTime*.7)*cos(p.y*.17-uTime*.5));
  for(int i=0;i<8;i++){if(i>=uRings)break;vec4 e=uRing[i];float age=uTime-e.z;if(age<0.||age>5.)continue;vec2 d=p-e.xy;d-=vec2(${PX.toFixed(3)},${PZ.toFixed(3)})*floor(d/vec2(${PX.toFixed(3)},${PZ.toFixed(3)})+.5);float r=max(length(d),1e-3);
    float env=.6*e.w*exp(-age/1.6)*exp(-abs(r-age*10.)/6.),ph=r*.9-age*9.;h+=env*sin(ph);g+=d/r*env*.9*cos(ph);}return h;}
float grainShake(vec2 cellId){float s=0.;for(int i=0;i<8;i++){if(i>=uRings)break;vec4 e=uRing[i];float age=uTime-e.z;if(age<0.||age>1.5)continue;s+=.25*exp(-age/.3)*sin(h21(cellId)*40.+age*30.)*e.w;}return s;}
// one cell's geometry along the ray between t0 and t1 (the ray within the cell's column): a hit's t, normal and material
// (0 crystal, 1 liquid, 2 grains, 3 foam, 4 floor)
bool hitCell(vec3 ro,vec3 rd,vec2 c,float t0,float t1,vec4 st,out float th,out vec3 n,out float mat){
  float wF=max(0.,1.-st.r-st.g-st.b);vec2 id=idOf(c);
  float best=max(max(st.r,st.g),max(st.b,wF));
  vec2 pc=c*S;
  if(st.r>=best){
    if(isSpire(id,st.a)){th=1e9;return false;}
    // a hexagonal prism (inradius .47 cells: the crevices between columns) with a shallow faceted top; it grows out of
    // the mercury as the cell crystallises
    float g=smoothstep(.15,.85,st.r),H=mix(.9,colH(id,st.a),g);
    float ti=t0,to=t1;vec2 o=(ro.xz-pc)/S,d=rd.xz/S;
    for(int k=0;k<3;k++){vec2 nn=k==0?N0:(k==1?N1:N2);float dn=dot(d,nn),on=dot(o,nn);
      if(abs(dn)<1e-6){if(abs(on)>.47){th=1e9;return false;}continue;}
      float a=(-.47-on)/dn,b=(.47-on)/dn;ti=max(ti,min(a,b));to=min(to,max(a,b));}
    if(ti<to){float y=ro.y+rd.y*ti;vec2 lp=o+d*ti;float cap=H-hexD(lp)*1.1;
      if(y<cap&&y>.9){th=ti;vec2 a=abs(lp),sg=sign(lp);vec2 gg=dot(a,N1)>a.x?N1*sg:vec2(sg.x,0.);n=normalize(vec3(gg.x,0.,gg.y));mat=0.;return true;}
      // the top: y - (H - 1.1 hexD) is convex along the ray; its zero after the entry by bisection
      float fa=y-cap,lo=ti,hi=to;vec2 lq=o+d*to;float fb=ro.y+rd.y*to-(H-hexD(lq)*1.1);
      if(fa>0.&&fb<0.){for(int i=0;i<6;i++){float m=.5*(lo+hi);vec2 lm=o+d*m;if(ro.y+rd.y*m-(H-hexD(lm)*1.1)>0.)lo=m;else hi=m;}
        th=hi;vec2 lm=o+d*hi;vec2 a=abs(lm),sg=sign(lm);vec2 gg=dot(a,N1)>a.x?N1*sg:vec2(sg.x,0.);n=normalize(vec3(gg.x*1.1/S,1.,gg.y*1.1/S));mat=0.;return true;}}
  }else if(st.b>=best){
    // grains: blocks on a .95 m square grid (in the world), each its own height, shaken by the bass
    vec2 p0=ro.xz+rd.xz*t0;float dl=t1-t0;vec2 gc=floor(p0/.95);vec2 dd=rd.xz;vec2 stp=sign(dd),tD=abs(.95/max(abs(dd),vec2(1e-6)));
    vec2 nb=(gc+max(stp,0.))*.95;vec2 tm=(nb-p0)/max(abs(dd),vec2(1e-6))*abs(sign(dd)+1e-9);tm=vec2(dd.x==0.?1e9:(nb.x-p0.x)/dd.x,dd.y==0.?1e9:(nb.y-p0.y)/dd.y);
    float tc=t0;
    for(int i=0;i<8;i++){float tn=min(min(tm.x,tm.y)+t0,t1);
      float Hg=.9+1.3*h21(gc)+grainShake(gc);vec3 bmin=vec3(gc.x*.95+.075,-1.,gc.y*.95+.075),bmax=vec3(gc.x*.95+.875,Hg,gc.y*.95+.875);
      vec3 inv=1./rd,ta=(bmin-ro)*inv,tb=(bmax-ro)*inv,tmn=min(ta,tb),tmx=max(ta,tb);float tin=max(max(tmn.x,tmn.y),tmn.z),tout=min(min(tmx.x,tmx.y),tmx.z);
      if(tin<tout&&tin>=tc-1e-4&&tin<=tn){th=tin;n=tin==tmn.x?vec3(-sign(rd.x),0,0):(tin==tmn.y?vec3(0,-sign(rd.y),0):vec3(0,0,-sign(rd.z)));mat=2.;return true;}
      if(tn>=t1)break;tc=tn;if(tm.x<tm.y){gc.x+=stp.x;tm.x+=tD.x;}else{gc.y+=stp.y;tm.y+=tD.y;}}
  }else if(wF>=best){
    // foam: a dome per cell (an ellipsoid on a base at 1.4 m), clipped by the cell: packed domes with sharp creases
    vec2 jc=pc+(vec2(h21(id+3.),h21(id+5.))-.5)*.5;float R=S*(.75+.3*h21(id+9.));
    vec3 oc=vec3(ro.x-jc.x,(ro.y-1.4)/.75,ro.z-jc.y),dv=vec3(rd.x,rd.y/.75,rd.z);float A=dot(dv,dv),B=dot(oc,dv),Cc=dot(oc,oc)-R*R,D=B*B-A*Cc;
    vec3 pe=ro+rd*t0;vec2 de=pe.xz-jc;float he=1.4+.75*sqrt(max(R*R-dot(de,de),0.));
    if(pe.y<he&&pe.y>.9&&t0>0.){th=t0;vec2 lq=(pe.xz-pc)/S,a=abs(lq),sg=sign(lq);vec2 gg=dot(a,N1)>a.x?N1*sg:vec2(sg.x,0.);n=normalize(vec3(gg.x,0.,gg.y));mat=3.;return true;}
    if(D>0.){float tq=(-B-sqrt(D))/A;if(tq>=t0&&tq<=t1){vec3 p=ro+rd*tq;th=tq;n=normalize(vec3(p.x-jc.x,(p.y-1.4)/.75/.75,p.z-jc.y));mat=3.;return true;}}
  }
  // the mercury (and the floor of the crevices)
  if(rd.y<0.){float tp=(.9-ro.y)/rd.y;if(tp>=t0&&tp<=t1){th=tp;n=vec3(0,1,0);mat=st.g>=best?1.:4.;return true;}}
  th=1e9;return false;
}
// a cell's highest point, for the shadow traversal
float cellTop(vec2 c){vec4 st=cellAt(c);float wF=max(0.,1.-st.r-st.g-st.b),best=max(max(st.r,st.g),max(st.b,wF));vec2 id=idOf(c);
  if(st.r>=best)return isSpire(id,st.a)?.9:mix(.9,colH(id,st.a),smoothstep(.15,.85,st.r));if(st.b>=best)return 2.2;if(wF>=best)return 3.6;return .9;}
// cell to cell along a ray's ground track: the exit edge's parameter and the next centre
float exitCell(vec2 o,vec2 d,vec2 c,out vec2 nc){float te=1e9;nc=c;
  for(int k=0;k<6;k++){vec2 nn=k==0?N0:(k==1?N1:(k==2?N2:(k==3?-N0:(k==4?-N1:-N2))));float dn=dot(d,nn);if(dn<=1e-7)continue;
    float tt=(.5-dot(o-c,nn))/dn;if(tt<te){te=tt;nc=c+nn;}}return te;}
vec4 cellAux(vec2 c){float row=floor(c.y/(Q3*.5)+.5),col=floor(c.x+.25);return texelFetch(uCellShadow,ivec2(int(mod(col,COLS)),int(mod(row,ROWS))),0);}
float cellShadow(vec2 c){return cellAux(c).r;}
float spireShadow(vec3 p){vec4 sp=uShadowMat*vec4(p,1.);vec3 s=sp.xyz/sp.w*.5+.5;if(any(lessThan(s,vec3(0.)))||any(greaterThan(s,vec3(1.))))return 1.;
  float sm=0.;for(int i=0;i<4;i++){vec2 o=vec2(i&1,i>>1)-.5;sm+=step(s.z-.002,texture(uShadow,s.xy+o/2048.).r);}return sm*.25;}
float shadowAt(vec3 p){
  // the spires' long shadows (the sun's shadow map) and the low columns' (a short traversal toward the sun)
  vec4 sp=uShadowMat*vec4(p,1.);vec3 s=sp.xyz/sp.w*.5+.5;float sm=1.;
  if(all(greaterThan(s,vec3(0.)))&&all(lessThan(s,vec3(1.)))){sm=0.;for(int i=0;i<4;i++){vec2 o=vec2(i&1,i>>1)-.5;sm+=step(s.z-.002,texture(uShadow,s.xy+o/2048.).r);}sm*=.25;}
  vec2 d=normalize(uSun.xz),o=p.xz/S;float rise=uSun.y/length(uSun.xz);vec2 c=nearestCenter(o),nc;float sh=1.,tt=0.;
  for(int i=0;i<16;i++){if(i>=uShadowSteps)break;float te=exitCell(o,d/S*S,c,nc);float tm=max(te,0.);float y=p.y+rise*tt*S;if(i>0){float top=cellTop(c);sh=min(sh,clamp(4.*(y-top)/max(tt*S,.5)+.5,0.,1.));}
    tt=tm;c=nc;if(p.y+rise*tt*S>uSlab)break;}
  return min(sm,sh);
}
void main(){
  vec2 q=(vUv*2.-1.)*vec2(uAspect,1.)*uTanHalf;vec3 rd=normalize(uCamRot*vec3(q,-1.)),ro=uCamPos;
  vec3 col;float tHit=-1.;
  float zd=texture(uSpireDepth,vUv).r,tSp=1e9;vec4 spc=vec4(0.);
  if(zd<1.){float zn=zd*2.-1.,zv=2.*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-zn*(uNearFar.y-uNearFar.x));tSp=zv/max(dot(rd,uFwd),1e-3);spc=texture(uSpireCol,vUv);}
  // enter the slab of the low matter (under 8 m); rays that never do see the sky
  float t0=0.;if(ro.y>uSlab){if(rd.y>=0.){outColor=vec4(zd<1.?spc.rgb:sky(rd),1.);return;}t0=(ro.y-uSlab)/-rd.y;}
  if(t0>tSp){outColor=vec4(spc.rgb,1.);return;}
  vec2 o=ro.xz/S,d=rd.xz/S;vec2 c=nearestCenter(o+d*t0),nc;float ta=t0;bool hit=false;float th;vec3 n;float mat;vec4 st;
  // the three edges a ray can leave a cell by, fixed for the ray: their normals and the inverse rates
  vec2 e0=dot(d,N0)>=0.?N0:-N0,e1=dot(d,N1)>=0.?N1:-N1,e2=dot(d,N2)>=0.?N2:-N2;vec3 inv=1./max(vec3(dot(d,e0),dot(d,e1),dot(d,e2)),vec3(1e-7));
  int steps=0;
  for(int i=0;i<220;i++){steps=i;vec2 rel=o-c;vec3 tt=(.5-vec3(dot(rel,e0),dot(rel,e1),dot(rel,e2)))*inv;float te=min(tt.x,min(tt.y,tt.z));
    nc=c+(te==tt.x?e0:(te==tt.y?e1:e2));float tb=max(te,ta);
    // nothing in a cell whose highest point stays under the ray (the map carries it): step on
    float top=cellAux(c).g*8.+.06;
    if(min(ro.y+rd.y*ta,ro.y+rd.y*tb)<=top){st=cellAt(c);if(hitCell(ro,rd,c,ta,tb,st,th,n,mat)){hit=true;break;}}
    ta=tb;c=nc;if(ro.y+rd.y*ta>uSlab+.5&&rd.y>0.)break;if(ta>uLod||ta>tSp)break;}
  // beyond the distance budget, the same regimes as a flat continuation (by then the haze has taken over 80 % of it)
  if(!hit&&rd.y<0.&&ta>uLod&&ta<tSp){th=(.9-ro.y)/rd.y;c=nearestCenter((ro.xz+rd.xz*th)/S);st=cellAt(c);float wF=max(0.,1.-st.r-st.g-st.b),b=max(max(st.r,st.g),max(st.b,wF));
    n=vec3(0,1,0);mat=st.r>=b?0.:(st.g>=b?1.:(st.b>=b?2.:3.));hit=true;}
  if(hit){vec3 p=ro+rd*th;tHit=th;float dif=max(dot(n,uSun),0.);float sh=.25+.75*min(cellShadow(c),spireShadow(p+n*.2));
    vec3 r=reflect(rd,n);float fr=.04+.96*pow(1.-max(dot(n,-rd),0.),5.);
    if(mat<.5)col=crystalShade(n,rd,dif,sh);
    else if(mat<1.5||mat>3.5){vec2 g;ripple(p.xz,g);vec3 nl=normalize(vec3(-g.x,1.,-g.y));vec3 rl=reflect(rd,nl);float fl=.04+.96*pow(1.-max(dot(nl,-rd),0.),5.);
      col=sky(rl)*(.55+.45*fl)*vec3(.82,.84,.88)+uSunCol*pow(max(dot(rl,uSun),0.),400.)*6.*sh;if(mat>3.5)col*=.22;
      float mo=cellAux(c).b;col=mix(col,vec3(1.,.42,.12)*1.6+sky(rl)*.15,mo*.85);}
    else if(mat<2.5){float ao=.4+.6*clamp((p.y-.9)/1.2,0.,1.);col=vec3(.42,.36,.28)*(.25+.9*dif*sh)*ao;}
    else{float ao=.4+.6*clamp((p.y-1.)/1.6,0.,1.);col=vec3(.86,.87,.88)*(.35+.75*dif*sh)*ao+vec3(.9,.92,1.)*.12*(1.-dif);}
    col=fogged(col,rd,th);
  }else{col=sky(rd);if(rd.y<0.)col=fogged(vec3(.05),rd,900.);}
  if(zd<1.&&(!hit||tHit>tSp))col=spc.rgb;
  if(uDebug==1)col=vec3(float(steps)/48.,float(steps)/160.,0.);
  outColor=vec4(col,1.);
}`;
// the spires: hexagonal prisms rising from the floor, a tall faceted point; instanced (position, height)
const SPIRE_VS=`precision highp float;
uniform mat4 projectionMatrix;uniform mat4 viewMatrix;in vec3 position;in vec4 aSpire;out vec3 vW;out vec3 vN;out float vTop;
void main(){float H=aSpire.w,tip=5.;vec3 p=position;float top=p.y>.5?1.:0.;float isApex=step(1.5,p.y);
  vec3 w=vec3(aSpire.x+p.x*1.222,isApex>0.?H:(top>0.?H-tip:0.),aSpire.z+p.z*1.222);
  vN=normalize(vec3(p.x,0.,p.z));vW=w;vTop=top;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`;
const SPIRE_FS=`precision highp float;uniform vec3 uCamPos;uniform sampler2D uShadow;uniform mat4 uShadowMat;
${COMMON}
in vec3 vW;in vec3 vN;in float vTop;out vec4 outColor;
void main(){vec3 n=normalize(cross(dFdx(vW),dFdy(vW)));vec3 rd=normalize(vW-uCamPos);if(dot(n,rd)>0.)n=-n;
  float dif=max(dot(n,uSun),0.);vec4 sp=uShadowMat*vec4(vW+n*.2,1.);vec3 s=sp.xyz/sp.w*.5+.5;float sm=1.;
  if(all(greaterThan(s,vec3(0.)))&&all(lessThan(s,vec3(1.))))sm=step(s.z-.002,texture(uShadow,s.xy).r);
  vec3 c=crystalShade(n,rd,dif,.25+.75*sm);outColor=vec4(fogged(c,rd,length(vW-uCamPos)),1.);}`;
const DEPTH_FS=`precision highp float;out vec4 outColor;void main(){outColor=vec4(gl_FragCoord.z,0.,0.,1.);}`;
export function create({THREE,renderer,width,height,notes,structure,params={}}){
  const subs=structure.after.subsystems.slice(0,MAXR),K=subs.length,PERIOD=150;
  // the script, as the reference has it
  const seats=subs.map((s,k)=>{const a=k*2.399963,r=PERIOD*.42*Math.sqrt((k+.5)/K);return [r*Math.cos(a),r*Math.sin(a),(6+3*s.files)*(s.role==='core'?2:1)];});
  const REG={core:[0,1,0,0],tests:[0,0,1,0],logic:[1,0,0,0]};
  const base=subs.map((s,k)=>s.role==='logic'&&k%3===2?[0,0,0,1]:(REG[s.role]||[1,0,0,0]));
  const hash=x=>{x=Math.imul(x^0x9E3779B9,0x85EBCA6B);x^=x>>>13;x=Math.imul(x,0xC2B2AE35);return ((x^(x>>>16))>>>0)/4294967296;};
  const ev=notes.map((n,i)=>{const s=seats[n.k%K],a=hash(i*3+n.midi)*Math.PI*2,r=Math.sqrt(s[2])*.9*Math.sqrt(hash(i*5+1));const x=s[0]+r*Math.cos(a),z=s[1]+r*Math.sin(a);
    if(n.group==='melody'||n.group==='counter')return {x,z,t:n.t,type:1,R:4+9*n.v,tau:1.4,amt:1};
    if(n.group==='pad')return {x,z,t:n.t,type:2,R:5+8*n.v,tau:2.2,amt:.9};
    if(n.group==='bass')return {x:s[0],z:s[1],t:n.t,type:3,R:0,tau:1,amt:.6+.6*n.v};
    return null;}).filter(Boolean);
  const discs=ev.filter(e=>e.type!==3),rings=ev.filter(e=>e.type===3);
  const recorded=structure.change&&structure.change.kind==='dependency'?structure.change:null;
  const chan=recorded?[...seats[recorded.a].slice(0,2),...seats[recorded.b].slice(0,2)]:null;
  const core=Math.max(0,subs.findIndex(s=>s.role==='core'));
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const wrap=(d,p)=>d-p*Math.floor(d/p+.5),wx=d=>wrap(d,PX),wz=d=>wrap(d,PZ);
  // the freeze's front and the time it reaches a distance (the smoothstep inverted)
  const front=t=>PERIOD*.9*smooth(22,30,t);
  const frontAt=dist=>{if(dist>PERIOD*.9)return Infinity;let a=22,b=30;for(let i=0;i<30;i++){const m=(a+b)/2;if(front(m)<dist)a=m;else b=m;}return b;};
  // the cells: centres (cell units) and their state, once a frame
  const cells=[];for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){const cx=col+(row%2?.5:0),cz=row*SQ3/2;cells.push({row,col,x:cx*CELL,z:cz*CELL,id:[cx,cz/SQ3]});}
  // the shader's cell hash in single precision (as the GPU computes it: the reference picks its spires with it)
  const f=Math.fround,fr=x=>f(x-Math.floor(x));
  const h21=(x,y)=>{let px=fr(f(f(x)*f(123.34))),py=fr(f(f(y)*f(456.21)));const dd=f(f(px*f(px+f(45.32)))+f(py*f(py+f(45.32))));px=f(px+dd);py=f(py+dd);return fr(f(px*py));};
  const sun=new THREE.Vector3(.86,.13,-.49).normalize();
  const freezeArr=cells.map(c=>frontAt(Math.hypot(wx(c.x-seats[core][0]),wz(c.z-seats[core][1]))));
  const data=new Uint8Array(COLS*ROWS*4),tex=new THREE.DataTexture(data,COLS,ROWS,THREE.RGBAFormat,THREE.UnsignedByteType);tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.needsUpdate=true;
  const w=[0,0,0,0];
  // per cell, once: its domains' blend, the discs that reach it (in the score's order, with the time each front
  // arrives), its place on the channel, the freeze's arrival
  const shadowData=new Uint8Array(COLS*ROWS*4),shadowTex=new THREE.DataTexture(shadowData,COLS,ROWS,THREE.RGBAFormat,THREE.UnsignedByteType);shadowTex.minFilter=shadowTex.magFilter=THREE.NearestFilter;
  for(const c of cells){
    let b1=1e9,b2=1e9,k1=0,k2=0;for(let k=0;k<K;k++){const dx=wx(c.x-seats[k][0]),dz=wz(c.z-seats[k][1]),e=dx*dx+dz*dz-seats[k][2]*seats[k][2];if(e<b1){b2=b1;k2=k1;b1=e;k1=k;}else if(e<b2){b2=e;k2=k;}}
    const bl=.5*Math.min(1,Math.max(0,1-(b2-b1)/90));c.base=[0,1,2,3].map(j=>base[k1][j]+(base[k2][j]-base[k1][j])*bl);
    c.discs=[];for(const e of discs){const dist=Math.hypot(wx(c.x-e.x),wz(c.z-e.z));if(dist>=e.R)continue;c.discs.push({t:e.t,arr:e.t-e.tau*Math.log(1-dist/e.R),to:e.type===2?1:0,amt:e.amt,ramp:Math.max(.12,e.tau*1.2/Math.max(e.R-dist,.6))});}
    if(chan){const ax=chan[0],az=chan[1],bx=wx(chan[2]-ax),bz=wz(chan[3]-az),px=wx(c.x-ax),pz=wz(c.z-az);
      const hh=Math.min(1,Math.max(0,(px*bx+pz*bz)/(bx*bx+bz*bz)));c.chanW=1-smooth(4,6,Math.hypot(px-bx*hh,pz-bz*hh));c.along=Math.abs(hh-.5)*2;}else c.chanW=0;}
  const top=new Float32Array(cells.length),molten=new Float32Array(cells.length);
  function updateCells(t){
    const open=Math.min(1,Math.max(0,(t-12)/3));let maxTop=.9;
    for(let i=0;i<cells.length;i++){const c=cells[i];w[0]=c.base[0];w[1]=c.base[1];w[2]=c.base[2];w[3]=c.base[3];
      for(const e of c.discs){if(e.t>t)break;const g=smooth(e.arr,e.arr+e.ramp,t)*e.amt;if(g<=0)continue;for(let j=0;j<4;j++)w[j]+=((j===e.to?1:0)-w[j])*g;}
      molten[i]=0;if(c.chanW>0&&c.along<=open){for(let j=0;j<4;j++)w[j]+=((j===1?1:0)-w[j])*c.chanW;molten[i]=c.chanW*(1-smooth(29,34,t)*0);}
      const fa=freezeArr[i],g=smooth(fa-.08,fa+.08,t);if(g>0){for(let j=0;j<4;j++)w[j]+=((j===0?1:0)-w[j])*g;molten[i]*=1-g;}
      const s=w[0]+w[1]+w[2]+w[3]||1,o=4*(c.row*COLS+c.col),wc=w[0]/s,best=Math.max(wc,w[1]/s,w[2]/s,w[3]/s),spire=c.spire&&smooth(fa,fa+2.5,t)>0&&wc>=best;
      data[o]=Math.round(255*wc);data[o+1]=Math.round(255*w[1]/s);data[o+2]=Math.round(255*w[2]/s);data[o+3]=Math.round(127*g)+(spire?128:0);
      // the cell's highest point (the shadow sweep and the slab above the matter)
      const h=wc>=best?(spire?.9:.9+(1.6+3.4*c.r+g*c.r2*2.5-.9)*smooth(.15,.85,wc)):w[2]/s>=best?2.2:w[1]/s>=best?.9:3.6;top[i]=h;if(h>maxTop)maxTop=h;}
    tex.needsUpdate=true;U.uSlab.value=maxTop+.3;
  }
  // the low columns' shadows, a cell at a time: from each cell toward the sun (in 1.3 m steps, up to where the light
  // clears the tallest column), the lowest margin between the light's height and the columns it passes over
  const rise=sun.y/Math.hypot(sun.x,sun.z),ux=sun.x/Math.hypot(sun.x,sun.z),uz=sun.z/Math.hypot(sun.x,sun.z);
  // the cell nearest a point of the world (rows alternate whole and half columns), as an index into the map
  const cellIndex=(x,z)=>{const cx=x/CELL,cz=z/CELL,r0=Math.floor(cz/(SQ3/2));let bi=0,bd=1e9;
    for(let r=r0;r<=r0+1;r++){const odd=((r%2)+2)%2,xc=Math.round(cx-odd*.5)+odd*.5,d=(xc-cx)**2+(r*SQ3/2-cz)**2;
      if(d<bd){bd=d;bi=((((r%ROWS)+ROWS)%ROWS)*COLS)+(((Math.floor(xc)%COLS)+COLS)%COLS);}}return bi;};
  const sweep=cells.map(c=>{const list=[];for(let k=1;k<=44;k++){const d=k*1.3;list.push([cellIndex(c.x+ux*d,c.z+uz*d),d]);}return list;});
  function updateShadows(){
    for(let i=0;i<cells.length;i++){const c=cells[i],h0=top[i];let sh=1;
      for(const [j,d] of sweep[i]){const y=h0+rise*d;if(y>U.uSlab.value)break;const m=(y-top[j])/d;const v=Math.min(1,Math.max(0,4*m+.5));if(v<sh)sh=v;if(sh<=0)break;}
      const o=4*(c.row*COLS+c.col);shadowData[o]=Math.round(255*sh);shadowData[o+1]=Math.min(255,Math.ceil(255*top[i]/8));shadowData[o+2]=Math.round(255*molten[i]);}
    shadowTex.needsUpdate=true;
  }
  // the spires: the cells whose hash makes them spires, risen where the freeze has passed (over 2.5 s)
  for(const c of cells){c.r=h21(c.id[0],c.id[1]);c.r2=h21(f(f(c.id[0])+f(7.1)),f(f(c.id[1])+f(7.1)));}
  const spireCells=cells.map((c,i)=>({c,i,r2:c.r2,r:c.r})).filter(s=>s.r2>.972);for(const s of spireCells)s.c.spire=true;
  const MAXI=12000,inst=new Float32Array(MAXI*4);
  const prism=new THREE.BufferGeometry();{const P=[];const V=k=>{const a=Math.PI/6+k*Math.PI/3;return [Math.cos(a)/Math.cos(Math.PI/6),Math.sin(a)/Math.cos(Math.PI/6)];};
    for(let k=0;k<6;k++){const [x0,z0]=V(k),[x1,z1]=V(k+1);P.push(x0,0,z0,x1,0,z1,x1,1,z1, x0,0,z0,x1,1,z1,x0,1,z0, x0,1,z0,x1,1,z1,0,2,0);}
    prism.setAttribute('position',new THREE.Float32BufferAttribute(P,3));}
  const geo=new THREE.InstancedBufferGeometry();geo.setAttribute('position',prism.getAttribute('position'));const instAttr=new THREE.InstancedBufferAttribute(inst,4);instAttr.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('aSpire',instAttr);geo.instanceCount=0;
  // the sun's shadow map: its depth texture is what is sampled (the colour target is the smallest three allows)
  const shadowRT=new THREE.WebGLRenderTarget(2048,2048,{type:THREE.UnsignedByteType,format:THREE.RedFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});shadowRT.depthTexture=new THREE.DepthTexture(2048,2048);
  const shadowMat=new THREE.Matrix4(),sunCam=new THREE.OrthographicCamera(-420,420,420,-420,1,1600);
  const U={uCamPos:{value:new THREE.Vector3()},uCamRot:{value:new THREE.Matrix3()},uTanHalf:{value:1},uAspect:{value:width/height},uViewProj:{value:new THREE.Matrix4()},uTime:{value:0},
    uCells:{value:tex},uCellShadow:{value:shadowTex},uShadow:{value:shadowRT.depthTexture},uShadowMat:{value:shadowMat},uRing:{value:[...Array(8)].map(()=>new THREE.Vector4())},uRings:{value:0},
    uShadowSteps:{value:params.shadowSteps??10},uLod:{value:params.lod??450},uSlab:{value:8},uDebug:{value:params.debug??0},
    uSun:{value:sun},uSunCol:{value:new THREE.Color('#ffe1b8')}};
  const VS='in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const spireRT=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});spireRT.depthTexture=new THREE.DepthTexture(width,height);
  U.uSpireCol={value:spireRT.texture};U.uSpireDepth={value:spireRT.depthTexture};U.uNearFar={value:new THREE.Vector2(1,2000)};U.uFwd={value:new THREE.Vector3()};
  const rayMat=new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,vertexShader:VS,fragmentShader:RAY_FS});
  const rayScene=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),rayMat);quad.frustumCulled=false;rayScene.add(quad);const ortho=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const spireMat=new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,vertexShader:SPIRE_VS,fragmentShader:SPIRE_FS});
  const spireMesh=new THREE.Mesh(geo,spireMat);spireMesh.frustumCulled=false;const spireScene=new THREE.Scene();spireScene.add(spireMesh);
  const depthMat=new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,vertexShader:SPIRE_VS,fragmentShader:DEPTH_FS});
  const shadowMesh=new THREE.Mesh(geo,depthMat);shadowMesh.frustumCulled=false;const shadowScene=new THREE.Scene();shadowScene.add(shadowMesh);
  const cam=new THREE.PerspectiveCamera(56,width/height,1,2000);
  const path=params.path||[{t:0,pos:[-20,46,95],target:[10,0,-40],fov:56},{t:31,pos:[-20,46,95],target:[10,0,-40],fov:56},{t:40,pos:[4,10,34],target:[14,8,-10],fov:62}];
  const P=new THREE.Vector3(),T=new THREE.Vector3(),m4=new THREE.Matrix4();
  const gl=renderer.getContext(),ext=params.profile?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null,prof={cpu:{},gpu:{}};
  // GPU timing of one pass (profiling only: one query at a time, read back at once)
  const timed=(name,fn)=>{if(!ext){fn();return;}const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);fn();gl.endQuery(ext.TIME_ELAPSED_EXT);(prof.pending||(prof.pending=[])).push([name,q]);};
  const cpuT=(name,fn)=>{const a=performance.now();fn();prof.cpu[name]=performance.now()-a;};
  function render(t){
    renderer.autoClear=false;renderer.info.autoReset=false;renderer.info.reset();
    U.uTime.value=t;
    let i=0;while(i<path.length-2&&path[i+1].t<=t)i++;const a=path[i],b=path[i+1],e=smooth(a.t,b.t,t);
    P.set(...a.pos).lerp(new THREE.Vector3(...b.pos),e);T.set(...a.target).lerp(new THREE.Vector3(...b.target),e);
    cam.position.copy(P);cam.lookAt(T);cam.fov=a.fov+(b.fov-a.fov)*e;cam.updateProjectionMatrix();cam.updateMatrixWorld();
    m4.lookAt(P,T,new THREE.Vector3(0,1,0));U.uCamRot.value.setFromMatrix4(m4);U.uCamPos.value.copy(P);U.uTanHalf.value=Math.tan(cam.fov*Math.PI/360);
    U.uViewProj.value.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
    // the phase map and the bass's rings (the last eight begun)
    cpuT('phase',()=>updateCells(t));cpuT('cellShadow',()=>updateShadows());
    const live=rings.filter(r=>r.t<=t&&r.t>t-5).slice(-8);U.uRings.value=live.length;live.forEach((r,j)=>U.uRing.value[j].set(r.x,r.z,r.t,r.amt));
    // the spires' instances: every copy of the period within 900 m of the camera and in front of it
    cpuT('instances',()=>{let n=0;const fwd=new THREE.Vector3().subVectors(T,P).normalize();
      const active=spireCells.map(s=>({s,g:smooth(freezeArr[s.i],freezeArr[s.i]+2.5,t)})).filter(x=>x.g>0&&data[4*(x.s.c.row*COLS+x.s.c.col)+3]>=128);
      // within the spires' draw distance (650 m: the haze has taken about 90 % there), nearest first so that the depth
      // test spares what is hidden
      const list=[];
      if(active.length){for(let pz=-6;pz<=6;pz++)for(let px=-6;px<=6;px++){const ox=Math.round(P.x/PX)*PX+px*PX,oz=Math.round(P.z/PZ)*PZ+pz*PZ;
        const dx=ox-P.x,dz=oz-P.z,dist=Math.hypot(dx,dz);if(dist>650+PX)continue;if(dist>PX*1.2&&(dx*fwd.x+dz*fwd.z)/dist<-.35)continue;
        for(const {s,g} of active){const x=ox+s.c.x,z=oz+s.c.z,ddx=x-P.x,ddz=z-P.z,d2=ddx*ddx+ddz*ddz;if(d2>650*650)continue;if(d2>400&&(ddx*fwd.x+ddz*fwd.z)<-.2*Math.sqrt(d2))continue;
          list.push([d2,x,z,1.6+3.4*s.r+s.r2*2.5+(s.r2-.972)*1100*g]);}}}
      list.sort((a,b)=>a[0]-b[0]);for(const q of list){if(n>=MAXI)break;inst[4*n]=q[1];inst[4*n+1]=0;inst[4*n+2]=q[2];inst[4*n+3]=q[3];n++;}
      geo.instanceCount=n;instAttr.needsUpdate=true;instAttr.clearUpdateRanges?.();});
    // the sun's shadow map over the view (the spires only)
    const focus=new THREE.Vector3().copy(P).addScaledVector(new THREE.Vector3().subVectors(T,P).setY(0).normalize(),260);
    sunCam.position.copy(focus).addScaledVector(sun,700);sunCam.lookAt(focus);sunCam.updateMatrixWorld();sunCam.updateProjectionMatrix();
    shadowMat.multiplyMatrices(sunCam.projectionMatrix,sunCam.matrixWorldInverse);
    renderer.setRenderTarget(shadowRT);renderer.setClearColor(0xffffff,1);renderer.clear();
    timed('shadow',()=>{if(geo.instanceCount)renderer.render(shadowScene,sunCam);});
    U.uShadow.value=shadowRT.depthTexture;
    renderer.setRenderTarget(spireRT);renderer.setClearColor(0x000000,0);renderer.clear();
    timed('spires',()=>{if(geo.instanceCount)renderer.render(spireScene,cam);});
    U.uFwd.value.subVectors(T,P).normalize();U.uNearFar.value.set(cam.near,cam.far);
    renderer.setRenderTarget(null);renderer.setClearColor(0x000000,1);renderer.clear();
    timed('ray',()=>renderer.render(rayScene,ortho));
  }
  async function readProfile(){if(!prof.pending)return null;const out={};for(const [name,q] of prof.pending){for(let k=0;k<400&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);k++)await new Promise(r=>requestAnimationFrame(r));
    out[name]=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);}prof.pending=null;return {gpu:out,cpu:{...prof.cpu},instances:geo.instanceCount,calls:renderer.info.render.calls};}
  return {render,readProfile,stats:()=>({cells:cells.length,spireCells:spireCells.length,instances:geo.instanceCount})};
}

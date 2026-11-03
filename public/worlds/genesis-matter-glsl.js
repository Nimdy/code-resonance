// Genesis (preview), Metamorphic Matter: the shaders (G2). The matter is a field of hexagonal cells (genesis-matter.js),
// each one column of one regime; one full-screen ray cast steps from cell to cell and intersects each cell's own
// geometry exactly (the C-R0 renderer, docs/worlds/genesis-c-r0.md): a crystal prism whose faceted top is tilted by its
// grain (the grains read as one mosaic, grooved at their boundaries, seamed where a recovery fused them), the mercury
// plane (the bass's rings and the swell perturb its normal; molten melt glows, in an agent's colour where it works),
// the grains of broken crystal (a square sub-grid of blocks), a foam dome. The monumental crystals are instanced,
// tilted prisms in clusters, drawn first; the rays stop where they stand, and they cast their long shadows through a
// sun shadow map. Everything is derived from the simulation's state: no shader decides anything.
import {COLS,ROWS,CELL,PX,PZ} from './genesis-matter.js';
const F=x=>x.toFixed(4);
export const COMMON=`
uniform vec3 uSun;uniform vec3 uSunCol;uniform vec3 uSkyLo;uniform vec3 uSkyHi;uniform vec3 uBody;uniform float uGloss;uniform float uClock;
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.55),b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.55),
  c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.55),e=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.55);return mix(mix(a,b,f.x),mix(c,e,f.x),f.y);}
// the sky: a cold gradient, the sun, and a high layer of drifting cloud (what the mercury and the facets reflect)
vec3 sky(vec3 d){float y=max(d.y,0.);vec3 c=mix(uSkyLo,uSkyHi,pow(y,.5));float s=max(dot(d,uSun),0.);
  vec2 q=d.xz/max(d.y,.035)*1.6+vec2(uClock*.012,uClock*.004);float n=vn(q)*.55+vn(q*2.3+7.)*.3+vn(q*5.1+3.)*.15;
  float cl=smoothstep(.5,.8,n)*smoothstep(.0,.12,d.y);c=mix(c,vec3(.9,.92,.96)*(.75+.35*s),cl*.85);
  c+=uSunCol*(pow(s,1400.)*24.+pow(s,10.)*.22);return c;}
// crystal: its body lit through it (a wrapped diffuse, a little light passing where the view faces the sun), the sky in
// its facets by Fresnel, a sun glint
vec3 crystalShade(vec3 n,vec3 rd,float sh,vec3 body,float tone){vec3 r=reflect(rd,n);float fr=.04+.96*pow(1.-max(dot(n,-rd),0.),5.);
  float wrap=max(dot(n,uSun)*.6+.4,0.),back=pow(max(dot(rd,uSun),0.),3.)*.6;
  vec3 b=body*tone;return b*(.1+uSunCol*.55*wrap*sh+back*uSunCol*.4)+sky(r)*(.08+.92*fr)*uGloss*(.5+.5*sh)+uSunCol*pow(max(dot(r,uSun),0.),300.)*7.*sh*uGloss;}
vec3 fogged(vec3 c,vec3 rd,float t){return mix(c,mix(uSkyLo,uSkyHi,.1),1.-exp(-t*.0013));}
`;
export const RAY_FS=`precision highp float;precision highp sampler2D;
uniform vec3 uCamPos;uniform mat3 uCamRot;uniform float uTanHalf;uniform float uAspect;uniform float uTime;
uniform sampler2D uCells;uniform sampler2D uAux;uniform sampler2D uShadow;uniform int uShadowSteps;uniform float uLod;uniform float uSlab;
uniform sampler2D uMonCol;uniform sampler2D uMonDepth;uniform vec2 uNearFar;uniform vec3 uFwd;uniform mat4 uShadowMat;
uniform vec4 uRing[8];uniform int uRings;uniform vec4 uAgent[6];uniform vec3 uAgentCol[6];uniform int uAgents;uniform float uCraze;uniform float uGrainShake;
uniform vec3 uMolten;uniform vec3 uRubble;uniform vec3 uSeam;uniform float uFade;
${COMMON}
in vec2 vUv;out vec4 outColor;
const float S=${F(CELL)},Q3=1.7320508,COLS=${COLS}.,ROWS=${ROWS}.;const vec2 PER=vec2(${F(PX)},${F(PZ)});
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
ivec2 texOf(vec2 c){float row=floor(c.y/(Q3*.5)+.5),col=floor(c.x-mod(row,2.)*.5+.5);return ivec2(int(mod(col,COLS)),int(mod(row,ROWS)));}
// the cell's state: r regime (0 crystal, 1 melt, 2 grains, 3 foam), g column height (/16 m), b glow, a grain (/256)
vec4 cellAt(vec2 c){return texelFetch(uCells,texOf(c),0);}
// aux: r the low columns' shadow, g the cell's highest point (/16 m), b healed seam, a crazing
vec4 cellAux(vec2 c){return texelFetch(uAux,texOf(c),0);}
int regimeOf(vec4 st){return int(st.r*3.+.5);}
vec2 nearestCenter(vec2 p){vec2 s=vec2(1.,Q3);vec2 a=(floor(p/s)+.5)*s;vec2 b=(floor((p-vec2(.5,Q3*.5))/s)+.5)*s+vec2(.5,Q3*.5);
  return dot(p-a,p-a)<dot(p-b,p-b)?a:b;}
const vec2 N0=vec2(1.,0.),N1=vec2(.5,.8660254),N2=vec2(-.5,.8660254);
float hexD(vec2 p){p=abs(p);return max(dot(p,N1),p.x);}
// the edge of a cell nearest a point inside it (its outward normal, a neighbour's centre one cell along it)
vec2 edgeOf(vec2 lp){vec2 best=N0;float bd=dot(lp,N0);for(int k=1;k<6;k++){vec2 nn=k==1?N1:(k==2?N2:(k==3?-N0:(k==4?-N1:-N2)));float d=dot(lp,nn);if(d>bd){bd=d;best=nn;}}return best;}
// a grain's facet: its tilt direction and slope, from its id
vec3 facetOf(float g){float a=g*6.2831853+1.3,s=.1+.32*fract(g*157.31);return vec3(cos(a),sin(a),s);}
float topAt(vec2 lp,float H,vec3 f){return H;}
// the melt's swell: three long waves from different directions (never a grid), then the bass's rings
float ripple(vec2 p,out vec2 g){float h=0.;g=vec2(0.);
  for(int k=0;k<3;k++){float a=1.1+float(k)*2.17,w=.11+.07*float(k);vec2 dd=vec2(cos(a),sin(a));float ph=dot(p,dd)*w-uTime*(.5+.2*float(k)),am=.06/(1.+float(k));
    h+=am*sin(ph);g+=dd*am*w*cos(ph);}
  for(int i=0;i<8;i++){if(i>=uRings)break;vec4 e=uRing[i];float age=uTime-e.z;if(age<0.||age>6.)continue;vec2 d=p-e.xy;d-=PER*floor(d/PER+.5);float r=max(length(d),1e-3);
    float env=.55*e.w*exp(-age/1.8)*exp(-abs(r-age*9.)/7.),ph=r*.85-age*8.;h+=env*sin(ph);g+=d/r*env*.85*cos(ph);}return h;}
// one cell's geometry between t0 and t1: a hit's t, normal and material (0 crystal, 1 melt, 2 grains, 3 foam, 4 floor)
bool hitCell(vec3 ro,vec3 rd,vec2 c,float t0,float t1,vec4 st,out float th,out vec3 n,out float mat){
  int R=regimeOf(st);vec2 pc=c*S;vec2 id=vec2(c.x,floor(c.y/(Q3*.5)+.5));
  if(R==0){
    // a hexagonal prism (closed: grains are mosaics, not columns) with a shallow faceted top tilted by its grain
    float H=st.g*16.;vec3 f=facetOf(st.a);
    float ti=t0,to=t1;vec2 o=(ro.xz-pc)/S,d=rd.xz/S;
    for(int k=0;k<3;k++){vec2 nn=k==0?N0:(k==1?N1:N2);float dn=dot(d,nn),on=dot(o,nn);
      if(abs(dn)<1e-6){if(abs(on)>.5){th=1e9;return false;}continue;}
      float a=(-.5-on)/dn,b=(.5-on)/dn;ti=max(ti,min(a,b));to=min(to,max(a,b));}
    // a flat terrace: every cell of a grain stands at the grain's height and shares its facet (a tilted normal), so a
    // grain reads as one crystal face and the cells vanish into it
    if(ti<to){float y=ro.y+rd.y*ti;
      if(y<H&&y>.85){th=ti;vec2 lp=o+d*ti;vec2 a=abs(lp),sg=sign(lp);vec2 gg=dot(a,N1)>a.x?N1*sg:vec2(sg.x,0.);n=normalize(vec3(gg.x,0.,gg.y));mat=0.;return true;}
      if(rd.y<0.){float tp=(H-ro.y)/rd.y;if(tp>=ti&&tp<=to){th=tp;n=normalize(vec3(f.x*f.z,1.,f.y*f.z));mat=0.;return true;}}}
  }else if(R==2){
    // grains: blocks of broken crystal on a .95 m square grid, each its own height, shaken by the bass
    vec2 p0=ro.xz+rd.xz*t0;vec2 gc=floor(p0/.95);vec2 dd=rd.xz;vec2 stp=sign(dd),tD=abs(.95/max(abs(dd),vec2(1e-6)));
    vec2 nb=(gc+max(stp,0.))*.95;vec2 tm=vec2(dd.x==0.?1e9:(nb.x-p0.x)/dd.x,dd.y==0.?1e9:(nb.y-p0.y)/dd.y);float tc=t0;
    for(int i=0;i<8;i++){float tn=min(min(tm.x,tm.y)+t0,t1);
      float Hg=.95+1.2*h21(gc)+uGrainShake*.3*sin(h21(gc+3.)*40.+uTime*26.);vec3 bmin=vec3(gc.x*.95+.07,-1.,gc.y*.95+.07),bmax=vec3(gc.x*.95+.88,Hg,gc.y*.95+.88);
      vec3 inv=1./rd,ta=(bmin-ro)*inv,tb=(bmax-ro)*inv,tmn=min(ta,tb),tmx=max(ta,tb);float tin=max(max(tmn.x,tmn.y),tmn.z),tout=min(min(tmx.x,tmx.y),tmx.z);
      if(tin<tout&&tin>=tc-1e-4&&tin<=tn){th=tin;n=tin==tmn.x?vec3(-sign(rd.x),0,0):(tin==tmn.y?vec3(0,-sign(rd.y),0):vec3(0,0,-sign(rd.z)));mat=2.;return true;}
      if(tn>=t1)break;tc=tn;if(tm.x<tm.y){gc.x+=stp.x;tm.x+=tD.x;}else{gc.y+=stp.y;tm.y+=tD.y;}}
  }else if(R==3){
    // foam: a dome per cell (an ellipsoid on a base at 1.2 m), clipped by the cell
    vec2 jc=pc+(vec2(h21(id+3.),h21(id+5.))-.5)*.5;float Rr=S*(.75+.3*h21(id+9.));
    vec3 oc=vec3(ro.x-jc.x,(ro.y-1.2)/.75,ro.z-jc.y),dv=vec3(rd.x,rd.y/.75,rd.z);float A=dot(dv,dv),B=dot(oc,dv),Cc=dot(oc,oc)-Rr*Rr,D=B*B-A*Cc;
    vec3 pe=ro+rd*t0;vec2 de=pe.xz-jc;float he=1.2+.75*sqrt(max(Rr*Rr-dot(de,de),0.));
    if(pe.y<he&&pe.y>.9&&t0>0.){th=t0;vec2 lq=(pe.xz-pc)/S,a=abs(lq),sg=sign(lq);vec2 gg=dot(a,N1)>a.x?N1*sg:vec2(sg.x,0.);n=normalize(vec3(gg.x,0.,gg.y));mat=3.;return true;}
    if(D>0.){float tq=(-B-sqrt(D))/A;if(tq>=t0&&tq<=t1){vec3 p=ro+rd*tq;th=tq;n=normalize(vec3(p.x-jc.x,(p.y-1.2)/.75/.75,p.z-jc.y));mat=3.;return true;}}
  }
  // the melt (and the floor between grains and under foam)
  if(rd.y<0.){float tp=(.9-ro.y)/rd.y;if(tp>=t0&&tp<=t1){th=tp;n=vec3(0,1,0);mat=R==1?1.:4.;return true;}}
  th=1e9;return false;
}
float cellTop(vec2 c){return cellAux(c).g*16.;}
float exitCell(vec2 o,vec2 d,vec2 c,out vec2 nc){float te=1e9;nc=c;
  for(int k=0;k<6;k++){vec2 nn=k==0?N0:(k==1?N1:(k==2?N2:(k==3?-N0:(k==4?-N1:-N2))));float dn=dot(d,nn);if(dn<=1e-7)continue;
    float tt=(.5-dot(o-c,nn))/dn;if(tt<te){te=tt;nc=c+nn;}}return te;}
float monShadow(vec3 p){vec4 sp=uShadowMat*vec4(p,1.);vec3 s=sp.xyz/sp.w*.5+.5;if(any(lessThan(s,vec3(0.)))||any(greaterThan(s,vec3(1.))))return 1.;
  float sm=0.;for(int i=0;i<4;i++){vec2 o=vec2(i&1,i>>1)-.5;sm+=step(s.z-.002,texture(uShadow,s.xy+o/2048.).r);}return sm*.25;}
void main(){
  vec2 q=(vUv*2.-1.)*vec2(uAspect,1.)*uTanHalf;vec3 rd=normalize(uCamRot*vec3(q,-1.)),ro=uCamPos;
  vec3 col;float tHit=-1.;
  float zd=texture(uMonDepth,vUv).r,tMon=1e9;vec4 mc=vec4(0.);
  if(zd<1.){float zn=zd*2.-1.,zv=2.*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-zn*(uNearFar.y-uNearFar.x));tMon=zv/max(dot(rd,uFwd),1e-3);mc=texture(uMonCol,vUv);}
  float t0=0.;if(ro.y>uSlab){if(rd.y>=0.){outColor=vec4(zd<1.?mc.rgb:sky(rd),1.);return;}t0=(ro.y-uSlab)/-rd.y;}
  if(t0>tMon){outColor=vec4(mc.rgb,1.);return;}
  vec2 o=ro.xz/S,d=rd.xz/S;vec2 c=nearestCenter(o+d*t0),nc;float ta=t0;bool hit=false;float th;vec3 n;float mat;vec4 st;
  vec2 e0=dot(d,N0)>=0.?N0:-N0,e1=dot(d,N1)>=0.?N1:-N1,e2=dot(d,N2)>=0.?N2:-N2;vec3 inv=1./max(vec3(dot(d,e0),dot(d,e1),dot(d,e2)),vec3(1e-7));
  for(int i=0;i<240;i++){vec2 rel=o-c;vec3 tt=(.5-vec3(dot(rel,e0),dot(rel,e1),dot(rel,e2)))*inv;float te=min(tt.x,min(tt.y,tt.z));
    nc=c+(te==tt.x?e0:(te==tt.y?e1:e2));float tb=max(te,ta);
    float top=cellAux(c).g*16.+.06;
    if(min(ro.y+rd.y*ta,ro.y+rd.y*tb)<=top){st=cellAt(c);if(hitCell(ro,rd,c,ta,tb,st,th,n,mat)){hit=true;break;}}
    ta=tb;c=nc;if(ro.y+rd.y*ta>uSlab+.5&&rd.y>0.)break;if(ta>uLod||ta>tMon)break;}
  // beyond the distance budget, the same regimes as a flat continuation (the haze has taken most of it there)
  if(!hit&&rd.y<0.&&ta>uLod&&ta<tMon){th=(.9-ro.y)/rd.y;c=nearestCenter((ro.xz+rd.xz*th)/S);st=cellAt(c);int R=regimeOf(st);
    n=vec3(0,1,0);mat=R==0?0.:(R==1?1.:(R==2?2.:3.));hit=true;}
  if(hit){vec3 p=ro+rd*th;tHit=th;vec4 ax=cellAux(c);float sh=.3+.7*min(ax.r,monShadow(p+n*.2));
    float tone=.72+.56*fract(st.a*91.7);
    if(mat<.5){
      // (each region's crystal a little cooler or warmer, lighter or darker: its own matter, never a map's colours)
      float rh=st.b;vec3 bd=uBody*(.88+.24*fract(rh*3.7))*mix(vec3(1.),vec3(.94,.98,1.06),fract(rh*7.1));
      vec3 nn=n;if(n.y>.5){vec2 j=vec2(h21(c+.37),h21(c*1.3+.71))-.5;nn=normalize(n+vec3(j.x,0.,j.y)*.05);}
      col=crystalShade(nn,rd,sh,bd,tone);
      // the grain's boundary: a groove where the neighbour across the nearest edge is another grain (a seam of light where
      // a recovery fused them); crazing: fine dark cracks while a failure without files lasts
      vec2 lp=(p.xz-c*S)/S;if(hexD(lp)>.43&&n.y>.5){vec2 e=edgeOf(lp);vec4 nb=cellAt(c+e);if(regimeOf(nb)==0&&abs(nb.a-st.a)>.002){
        float w=smoothstep(.42,.5,hexD(lp));col*=1.-.7*w;if(ax.b>.5&&cellAux(c+e).b>.5)col+=uSeam*w*1.4;}}
      float cr=ax.a*step(.5,fract(h21(floor(p.xz*1.7))*3.+p.x*.31));col*=1.-.5*cr*smoothstep(.0,.08,abs(fract(p.x*.6+p.z*.37)-.5)-.44);
    }
    else if(mat<1.5||mat>3.5){vec2 g;ripple(p.xz,g);vec3 nl=normalize(vec3(-g.x,1.,-g.y));vec3 rl=reflect(rd,nl);float fl=.04+.96*pow(1.-max(dot(nl,-rd),0.),5.);
      col=sky(rl)*(.55+.45*fl)*vec3(.82,.84,.88)+uSunCol*pow(max(dot(rl,uSun),0.),400.)*6.*sh;if(mat>3.5)col*=.22;
      // melt above its glowing point: incandescent, in the colour of an agent at work there
      // (incandescence: a dark crust where it is barely hot, orange, a white-hot core; a slow shimmer of flow)
      float gl=st.b;{vec2 lp=(p.xz-c*S)/S;float w=smoothstep(.2,.5,hexD(lp))*.5;if(w>0.){vec4 nb=cellAt(c+edgeOf(lp));gl=mix(gl,regimeOf(nb)==1||regimeOf(nb)==3?nb.b:0.,w);}}
      if(gl>0.){gl*=.8+.4*vn(p.xz*.14+vec2(uTime*.35,-uTime*.2));vec3 mo=mix(vec3(.3,.05,.02),uMolten,smoothstep(.05,.35,gl));mo=mix(mo,vec3(1.35,1.,.62),smoothstep(.45,.9,gl));for(int k=0;k<6;k++){if(k>=uAgents)break;vec2 dd=p.xz-uAgent[k].xy;dd-=PER*floor(dd/PER+.5);float w=uAgent[k].z*exp(-dot(dd,dd)/(uAgent[k].w*uAgent[k].w));mo=mix(mo,uAgentCol[k]*1.6,clamp(w,0.,.85));}
        col=mix(col,mo*(.5+1.6*gl)+sky(rl)*.08,clamp(.2+1.3*gl,0.,.94));}}
    else if(mat<2.5){float ao=.4+.6*clamp((p.y-.9)/1.1,0.,1.);col=uRubble*(.25+.85*max(dot(n,uSun),0.)*sh)*ao*tone;}
    else{float ao=.45+.55*clamp((p.y-1.)/1.4,0.,1.);col=vec3(.88,.89,.9)*(.35+.75*max(dot(n,uSun),0.)*sh)*ao+vec3(.9,.92,1.)*.1;}
    col=fogged(col,rd,th);
  }else{col=sky(rd);if(rd.y<0.)col=fogged(vec3(.05),rd,900.);}
  if(zd<1.&&(!hit||tHit>tMon))col=mc.rgb;
  outColor=vec4(col*uFade,1.);
}`;
// The monumental crystals: tilted hexagonal prisms with a pyramidal point, in clusters (instanced: base x, z, height,
// radius; tilt direction x, z, slope, tone)
export const MON_VS=`precision highp float;
uniform mat4 projectionMatrix;uniform mat4 viewMatrix;in vec3 position;in vec4 aBase;in vec4 aTilt;out vec3 vW;out float vY;out float vTone;
void main(){float H=aBase.z,R=aBase.w,tip=R*2.4;vec3 ax=normalize(vec3(aTilt.x*aTilt.z,1.,aTilt.y*aTilt.z));vec3 u=normalize(cross(ax,vec3(0.,0.,1.)));vec3 v=cross(u,ax);
  float y=position.y>1.5?H:(position.y>.5?H-tip:-1.);vec3 w=vec3(aBase.x,0.,aBase.y)+u*position.x*R*(position.y>1.5?0.:1.)+v*position.z*R*(position.y>1.5?0.:1.)+ax*y;
  vW=w;vY=clamp(y/max(H,1.),0.,1.);vTone=aTilt.w;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`;
export const MON_FS=`precision highp float;uniform vec3 uCamPos;uniform sampler2D uShadow;uniform mat4 uShadowMat;uniform vec3 uMonGlow;
${COMMON}
in vec3 vW;in float vY;in float vTone;out vec4 outColor;
void main(){vec3 n=normalize(cross(dFdx(vW),dFdy(vW)));vec3 rd=normalize(vW-uCamPos);if(dot(n,rd)>0.)n=-n;
  vec4 sp=uShadowMat*vec4(vW+n*.3,1.);vec3 s=sp.xyz/sp.w*.5+.5;float sm=1.;
  if(all(greaterThan(s,vec3(0.)))&&all(lessThan(s,vec3(1.))))sm=step(s.z-.002,texture(uShadow,s.xy).r);
  // translucent: the body lit through, a light within that brightens toward the point, the sky in its faces
  float fr=pow(1.-abs(dot(n,rd)),3.);vec3 c=crystalShade(n,rd,.35+.65*sm,uBody*.8,vTone)+uMonGlow*(.15+.85*vY*vY)*(.35+.9*fr)+sky(reflect(rd,n))*fr*.5;
  outColor=vec4(fogged(c,rd,length(vW-uCamPos)),1.);}`;
export const DEPTH_FS=`precision highp float;out vec4 outColor;void main(){outColor=vec4(gl_FragCoord.z,0.,0.,1.);}`;
export const QUAD_VS='in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

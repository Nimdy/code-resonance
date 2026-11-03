// Genesis (preview), Metamorphic Matter: the shaders (G2, G3). The matter is a field of hexagonal cells
// (genesis-matter.js), each one column of one regime; one full-screen ray cast steps from cell to cell and intersects
// each cell's own geometry exactly (the C-R0 renderer, docs/worlds/genesis-c-r0.md). The four regimes by their geometry,
// motion and response:
//  - crystal: each grain one tilted face (a plane through all its cells, its tilt by its orientation, shallower the
//    larger the grain), so a grain reads as one plate and the cells vanish into it; stepped and grooved at its
//    boundaries, seamed where a recovery fused them;
//  - melt: a mercury mirror whose normal is the simulated surface wave (the bass's), interpolated across the cells;
//    molten melt glows, in an agent's colour where it works;
//  - grains of broken crystal: loose shards, each tilted its own way, lower than the crystal, rattled by the wave;
//  - foam: bubbles that swell and burst, faster the hotter the melt.
// The monumental crystals are instanced, tilted prisms in clusters, drawn first; the rays stop where they stand, and
// they cast their long shadows through a sun shadow map. Everything is derived from the simulation's state: no shader
// decides anything.
import {COLS,ROWS,CELL,PX,PZ} from './genesis-matter.js';
// the wave texel's scales: its height (m) and gradient (per m) at full range, as genesis-matter-world.js writes them
export const WAVE_H=2.4,WAVE_G=.16;
// the cloud layer's noise: a lattice of CLOUD_CELLS cells across its texture (it tiles)
export const CLOUD_CELLS=64,CLOUD_SIZE=512;
const F=x=>x.toFixed(4);
export const COMMON=`
uniform vec3 uSun;uniform vec3 uSunCol;uniform vec3 uSkyLo;uniform vec3 uSkyHi;uniform vec3 uBody;uniform float uGloss;uniform float uClock;uniform sampler2D uCloud;
// value noise, tiling (the cloud layer's: genesis-matter-world.js computes it once, three octaves, into uCloud)
float vn(vec2 p){return texture(uCloud,p*${F(1/CLOUD_CELLS)}).r;}
// the sky: a cold gradient, the sun, and a high layer of drifting cloud (what the mercury and the facets reflect)
vec3 sky(vec3 d){float y=max(d.y,0.);vec3 c=mix(uSkyLo,uSkyHi,pow(y,.5));float s=max(dot(d,uSun),0.);
  vec2 q=d.xz/max(d.y,.035)*1.6+vec2(uClock*.012,uClock*.004);float n=vn(q);
  float cl=smoothstep(.58,.86,n)*smoothstep(.0,.12,d.y);c=mix(c,vec3(.9,.92,.96)*(.75+.35*s),cl*.75);
  c+=uSunCol*(pow(s,1400.)*24.+pow(s,10.)*.22);return c;}
// crystal: its body lit through it (a wrapped diffuse, a little light passing where the view faces the sun), the sky in
// its facets by Fresnel, a sun glint
// (its colour turns a little with its orientation, as a pleochroic crystal's does: grains differ, a pitch's crystals
// share theirs)
vec3 crystalShade(vec3 n,vec3 rd,float sh,vec3 body,float tone){vec3 r=reflect(rd,n);float fr=.04+.66*pow(1.-max(dot(n,-rd),0.),5.);
  float wrap=max(dot(n,uSun)*.7+.3,0.),back=pow(max(dot(rd,uSun),0.),3.)*.6;
  vec3 b=body*tone;return b*(.06+uSunCol*.7*wrap*sh+back*uSunCol*.4)+sky(r)*(.05+.95*fr)*uGloss*(.35+.65*sh)+uSunCol*pow(max(dot(r,uSun),0.),300.)*7.*sh*uGloss;}
vec3 pleo(float g){float a=g*6.2831853;return mix(vec3(1.08,.99,.9),vec3(.88,.98,1.1),.5+.5*cos(a*2.+.7));}
vec3 fogged(vec3 c,vec3 rd,float t){return mix(c,mix(uSkyLo,uSkyHi,.1),1.-exp(-t*.001));}
`;
export const RAY_FS=`precision highp float;precision highp sampler2D;
uniform vec3 uCamPos;uniform mat3 uCamRot;uniform float uTanHalf;uniform float uAspect;uniform float uTime;
uniform sampler2D uCells;uniform sampler2D uAux;uniform sampler2D uShadow;uniform int uShadowSteps;uniform float uLod;uniform float uSlab;
uniform sampler2D uMonCol;uniform sampler2D uMonDepth;uniform vec2 uNearFar;uniform vec3 uFwd;uniform mat4 uShadowMat;
uniform sampler2D uWave;uniform sampler2D uShape;uniform int uMons;uniform vec4 uAgent[6];uniform vec3 uAgentCol[6];uniform int uAgents;uniform float uCraze;
uniform vec3 uMolten;uniform vec3 uRubble;uniform vec3 uSeam;uniform float uFade;
${COMMON}
in vec2 vUv;out vec4 outColor;
const float S=${F(CELL)},Q3=1.7320508,COLS=${COLS}.,ROWS=${ROWS}.;const vec2 PER=vec2(${F(PX)},${F(PZ)});
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
ivec2 texOf(vec2 c){float row=floor(c.y/(Q3*.5)+.5),col=floor(c.x-mod(row,2.)*.5+.5);return ivec2(int(mod(col,COLS)),int(mod(row,ROWS)));}
// the cell's state: r regime (0 crystal, 1 melt, 2 grains, 3 foam, times 85; +40 where the crystal's outline crosses
// it), g column height (/16 m), b glow, a grain (/256)
vec4 cellAt(vec2 c){return texelFetch(uCells,texOf(c),0);}
// aux: r the low columns' shadow, g the cell's highest point (/16 m), b healed seam (128) and the grain face's slope
// (0..127: 0 to .32), a crazing (its top three bits) and five more bits of the column's height (a grain's face is
// continuous across its cells: 2 mm steps, not 6 cm)
vec4 cellAux(vec2 c){return texelFetch(uAux,texOf(c),0);}
// wave: r the surface wave (m, .5 at rest), gb its gradient (per m, .5 at rest), a the froth
vec4 cellWave(vec2 c){return texelFetch(uWave,texOf(c),0);}
// shape: where the crystal's boundary crosses the cell (the smoothed phase field's middle, as a line): rg its normal
// (toward the crystal), b its offset from the centre (cells, (d+1)/2; 0 = the whole cell is crystal)
vec4 cellShape(vec2 c){return texelFetch(uShape,texOf(c),0);}
int regimeOf(vec4 st){return int(st.r*3.+.5);}
vec2 nearestCenter(vec2 p){vec2 s=vec2(1.,Q3);vec2 a=(floor(p/s)+.5)*s;vec2 b=(floor((p-vec2(.5,Q3*.5))/s)+.5)*s+vec2(.5,Q3*.5);
  return dot(p-a,p-a)<dot(p-b,p-b)?a:b;}
const vec2 N0=vec2(1.,0.),N1=vec2(.5,.8660254),N2=vec2(-.5,.8660254);
float hexD(vec2 p){p=abs(p);return max(dot(p,N1),p.x);}
// the edge of a cell nearest a point inside it (its outward normal, a neighbour's centre one cell along it)
vec2 edgeOf(vec2 lp){vec2 best=N0;float bd=dot(lp,N0);for(int k=1;k<6;k++){vec2 nn=k==1?N1:(k==2?N2:(k==3?-N0:(k==4?-N1:-N2)));float d=dot(lp,nn);if(d>bd){bd=d;best=nn;}}return best;}
// a grain's face: the direction its tilt descends toward, from its orientation (its id; the CPU's grain planes use the
// same), and its slope (the cell's wave texel: shallower for a larger grain)
vec2 facetDir(float g){float a=g*6.2831853+1.3;return vec2(cos(a),sin(a));}
// the surface wave at a point: its height and gradient interpolated over the triangle of cell centres around it
const vec2 E6[7]=vec2[7](vec2(1.,0.),vec2(.5,.8660254),vec2(-.5,.8660254),vec2(-1.,0.),vec2(-.5,-.8660254),vec2(.5,-.8660254),vec2(1.,0.));
vec3 waveAt(vec2 p){vec2 q=p/S,c=nearestCenter(q),l=q-c;int k=int(floor(mod(atan(l.y,l.x)/1.0471976,6.)));
  vec2 e0=E6[k],e1=E6[k+1];float u=(l.x*e1.y-l.y*e1.x)*1.1547005,v=(e0.x*l.y-e0.y*l.x)*1.1547005;
  vec4 w0=cellWave(c),w1=cellWave(c+e0),w2=cellWave(c+e1);vec3 A=vec3(w0.r,w0.g,w0.b),B=vec3(w1.r,w1.g,w1.b),C=vec3(w2.r,w2.g,w2.b);
  return (A*(1.-u-v)+B*u+C*v-.5)*vec3(${F(WAVE_H)},${F(WAVE_G)},${F(WAVE_G)});}
// one cell's geometry between t0 and t1: a hit's t, normal and material (0 crystal, 1 melt, 2 grains, 3 foam, 4 floor)
bool hitCell(vec3 ro,vec3 rd,vec2 c,ivec2 tc,float t0,float t1,vec4 st,vec4 ax,out float th,out vec3 n,out float mat){
  int R=regimeOf(st);vec2 pc=c*S;vec2 id=vec2(c.x,floor(c.y/(Q3*.5)+.5));
  if(R==0){
    // a hexagonal prism whose top is its grain's face: one plane through all the grain's cells (its height at the cell's
    // centre in the cell texel, its slope in the wave texel), so a grain reads as one plate and the cells vanish into it
    // (clipped by the boundary's line where it crosses the cell: the crystal's outline follows the phase field, not the
    // cells; the rest of such a cell is melt)
    float H=(floor(st.g*255.+.5)*32.+mod(floor(ax.a*255.+.5),32.))/8160.*16.,sl=mod(floor(ax.b*255.+.5),128.)/127.*.32;vec2 fd=facetDir(st.a);bool clip=st.r*255.>20.;
    vec4 sh=clip?texelFetch(uShape,tc,0):vec4(.5,.5,0.,0.);float cd=sh.b*2.-1.;vec2 cn=sh.rg*2.-1.;
    float ti=t0,to=t1;vec2 o=(ro.xz-pc)/S,d=rd.xz/S;vec2 wn=vec2(0.);
    for(int k=0;k<3;k++){vec2 nn=k==0?N0:(k==1?N1:N2);float dn=dot(d,nn),on=dot(o,nn);
      if(abs(dn)<1e-6){if(abs(on)>.5){th=1e9;return false;}continue;}
      float a=(-.5-on)/dn,b=(.5-on)/dn;if(min(a,b)>ti){ti=min(a,b);wn=-nn*sign(dn);}to=min(to,max(a,b));}
    if(clip){float dn=dot(d,cn),on=dot(o,cn);if(abs(dn)<1e-6){if(on<cd)ti=1e9;}else{float a=(cd-on)/dn;if(dn>0.){if(a>ti){ti=a;wn=-cn;}}else to=min(to,a);}}
    if(ti<to){float y=ro.y+rd.y*ti,top=H-sl*dot(ro.xz+rd.xz*ti-pc,fd);
      if(y<top&&y>.85){th=ti;n=normalize(vec3(wn.x,0.,wn.y));mat=0.;return true;}
      float den=rd.y+sl*dot(rd.xz,fd);if(den<0.){float tp=(H-sl*dot(ro.xz-pc,fd)-ro.y)/den;if(tp>=ti&&tp<=to){th=tp;n=normalize(vec3(sl*fd.x,1.,sl*fd.y));mat=0.;return true;}}}
    if(clip&&rd.y<0.){float tp=(.9-ro.y)/rd.y;if(tp>=t0&&tp<=t1){th=tp;n=vec3(0,1,0);mat=1.;return true;}}
  }else if(R==2){
    // grains: loose shards of broken crystal on a .95 m grid, lower than the crystal, each its own height and tilt,
    // rattled by the wave where it reaches them (more for the looser ones)
    float u=(texelFetch(uWave,tc,0).r-.5)*${F(WAVE_H)};
    vec2 p0=ro.xz+rd.xz*t0;vec2 gc=floor(p0/.95);vec2 dd=rd.xz;vec2 stp=sign(dd),tD=abs(.95/max(abs(dd),vec2(1e-6)));
    vec2 nb=(gc+max(stp,0.))*.95;vec2 tm=vec2(dd.x==0.?1e9:(nb.x-p0.x)/dd.x,dd.y==0.?1e9:(nb.y-p0.y)/dd.y);float tc=t0;
    for(int i=0;i<8;i++){float tn=min(min(tm.x,tm.y)+t0,t1);
      float Hg=.95+.9*h21(gc)+u*(.4+1.2*h21(gc+3.));vec3 bmin=vec3(gc.x*.95+.1,-1.,gc.y*.95+.1),bmax=vec3(gc.x*.95+.85,Hg,gc.y*.95+.85);
      vec3 inv=1./rd,ta=(bmin-ro)*inv,tb=(bmax-ro)*inv,tmn=min(ta,tb),tmx=max(ta,tb);float tin=max(max(tmn.x,tmn.y),tmn.z),tout=min(min(tmx.x,tmx.y),tmx.z);
      if(tin<tout&&tin>=tc-1e-4&&tin<=tn){th=tin;mat=2.;
        if(tin==tmn.y){vec2 j=vec2(h21(gc+7.),h21(gc+11.))-.5;n=normalize(vec3(j.x*1.3,1.,j.y*1.3));}
        else n=tin==tmn.x?vec3(-sign(rd.x),0,0):vec3(0,0,-sign(rd.z));return true;}
      if(tn>=t1)break;tc=tn;if(tm.x<tm.y){gc.x+=stp.x;tm.x+=tD.x;}else{gc.y+=stp.y;tm.y+=tD.y;}}
  }else if(R==3){
    // foam: three bubbles per cell on the melt, each swelling and bursting in turn (faster where the froth is thicker)
    float fr=texelFetch(uWave,tc,0).a;float best=1e9;vec3 bn=vec3(0,1,0);
    for(int b=0;b<3;b++){vec2 hb=id+float(b)*7.31;vec2 jc=pc+(vec2(h21(hb+3.),h21(hb+5.))-.5)*S*.9;float life=fract(uTime*(.25+.6*fr)+h21(hb+9.));
      float Rr=S*(.25+.45*h21(hb+13.))*smoothstep(0.,.8,life)*step(life,.97);if(Rr<.05)continue;
      vec3 oc=vec3(ro.x-jc.x,ro.y-.9,ro.z-jc.y);float B=dot(oc,rd),Cc=dot(oc,oc)-Rr*Rr,D=B*B-Cc;
      if(D>0.){float tq=-B-sqrt(D);if(tq>=t0&&tq<=t1&&tq<best){vec3 q=ro+rd*tq;if(q.y>.9){best=tq;bn=normalize(q-vec3(jc.x,.9,jc.y));}}}}
    if(best<1e9){th=best;n=bn;mat=3.;return true;}
  }
  // the melt (and the floor between grains and under foam)
  if(rd.y<0.){float tp=(.9-ro.y)/rd.y;if(tp>=t0&&tp<=t1){th=tp;n=vec3(0,1,0);mat=R==1?1.:4.;return true;}}
  th=1e9;return false;
}
float cellTop(vec2 c){return cellAux(c).g*16.;}
float exitCell(vec2 o,vec2 d,vec2 c,out vec2 nc){float te=1e9;nc=c;
  for(int k=0;k<6;k++){vec2 nn=k==0?N0:(k==1?N1:(k==2?N2:(k==3?-N0:(k==4?-N1:-N2))));float dn=dot(d,nn);if(dn<=1e-7)continue;
    float tt=(.5-dot(o-c,nn))/dn;if(tt<te){te=tt;nc=c+nn;}}return te;}
float monShadow(vec3 p){if(uMons==0)return 1.;vec4 sp=uShadowMat*vec4(p,1.);vec3 s=sp.xyz/sp.w*.5+.5;if(any(lessThan(s,vec3(0.)))||any(greaterThan(s,vec3(1.))))return 1.;
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
    nc=c+(te==tt.x?e0:(te==tt.y?e1:e2));float tb=max(te,ta);ivec2 tc=texOf(c);
    vec4 ac=texelFetch(uAux,tc,0);float top=ac.g*16.+.06;
    if(min(ro.y+rd.y*ta,ro.y+rd.y*tb)<=top){st=texelFetch(uCells,tc,0);if(hitCell(ro,rd,c,tc,ta,tb,st,ac,th,n,mat)){hit=true;break;}}
    ta=tb;c=nc;if(ro.y+rd.y*ta>uSlab+.5&&rd.y>0.)break;if(ta>uLod||ta>tMon)break;}
  // beyond the distance budget, the same regimes as a flat continuation (the haze has taken most of it there)
  if(!hit&&rd.y<0.&&ta>uLod&&ta<tMon){th=(.9-ro.y)/rd.y;c=nearestCenter((ro.xz+rd.xz*th)/S);st=cellAt(c);int R=regimeOf(st);
    n=vec3(0,1,0);mat=R==0?0.:(R==1?1.:(R==2?2.:3.));hit=true;}
  if(hit){vec3 p=ro+rd*th;tHit=th;vec4 ax=cellAux(c);float sh=.3+.7*min(ax.r,monShadow(p+n*.2));
    float tone=.86+.28*fract(st.a*91.7);
    if(mat<.5){
      // (each region's crystal a little cooler or warmer, lighter or darker: its own matter, never a map's colours)
      float rh=st.b;vec3 bd=uBody*(.88+.24*fract(rh*3.7))*mix(vec3(1.),vec3(.94,.98,1.06),fract(rh*7.1));
      col=crystalShade(n,rd,sh,bd*pleo(st.a),tone);
      // the grain's boundary: a groove where the neighbour across the nearest edge is another grain (a seam of light where
      // a recovery fused them); crazing: fine dark cracks while a failure without files lasts
      vec2 lp=(p.xz-c*S)/S;if(hexD(lp)>.43&&n.y>.5){vec2 e=edgeOf(lp);vec4 nb=cellAt(c+e);if(regimeOf(nb)==0&&abs(nb.a-st.a)>.002){
        float w=smoothstep(.42,.5,hexD(lp));col*=1.-.7*w;if(ax.b>.5&&cellAux(c+e).b>.5)col+=uSeam*w*1.4;}}
      float cr=floor(ax.a*255./32.+.01)/7.*step(.5,fract(h21(floor(p.xz*1.7))*3.+p.x*.31));col*=1.-.5*cr*smoothstep(.0,.08,abs(fract(p.x*.6+p.z*.37)-.5)-.44);
    }
    // (far melt: its own cell's wave, where the interpolation would not show)
    else if(mat<1.5||mat>3.5){vec3 w=th<120.?waveAt(p.xz):(cellWave(c).rgb-.5)*vec3(${F(WAVE_H)},${F(WAVE_G)},${F(WAVE_G)});vec3 nl=normalize(vec3(-w.y,1.,-w.z));vec3 rl=reflect(rd,nl);float fl=.04+.96*pow(1.-max(dot(nl,-rd),0.),5.);
      col=sky(rl)*(.55+.45*fl)*vec3(.82,.84,.88)+uSunCol*pow(max(dot(rl,uSun),0.),400.)*6.*sh;if(mat>3.5)col*=.22;
      // melt above its glowing point: incandescent, in the colour of an agent at work there
      // (incandescence: a dark crust where it is barely hot, orange, a white-hot core; a slow shimmer of flow)
      float gl=regimeOf(st)==0?0.:st.b;{vec2 lp=(p.xz-c*S)/S;float w=smoothstep(.2,.5,hexD(lp))*.5;if(w>0.){vec4 nb=cellAt(c+edgeOf(lp));gl=mix(gl,regimeOf(nb)==1||regimeOf(nb)==3?nb.b:0.,w);}}
      if(gl>0.){gl*=.8+.4*vn(p.xz*.14+vec2(uTime*.35,-uTime*.2));vec3 mo=mix(vec3(.3,.05,.02),uMolten,smoothstep(.05,.35,gl));mo=mix(mo,vec3(1.35,1.,.62),smoothstep(.45,.9,gl));for(int k=0;k<6;k++){if(k>=uAgents)break;vec2 dd=p.xz-uAgent[k].xy;dd-=PER*floor(dd/PER+.5);float w=uAgent[k].z*exp(-dot(dd,dd)/(uAgent[k].w*uAgent[k].w));mo=mix(mo,uAgentCol[k]*1.6,clamp(w,0.,.85));}
        col=mix(col,mo*(.5+1.6*gl)+sky(rl)*.08,clamp(.2+1.3*gl,0.,.94));}}
    // broken crystal: dull, dark between the shards, each shard glinting its own way (incoherent: no two alike)
    else if(mat<2.5){float ao=.3+.7*clamp((p.y-.9)/1.2,0.,1.);vec3 r=reflect(rd,n);
      col=uRubble*(.2+.8*max(dot(n,uSun),0.)*sh)*ao*tone+uSunCol*pow(max(dot(r,uSun),0.),60.)*2.2*sh*ao+sky(r)*.12*ao;}
    // foam: white, thin-walled (bright at its rims), on dark melt
    else{float rim=pow(1.-max(dot(n,-rd),0.),2.);col=vec3(.86,.88,.9)*(.45+.6*max(dot(n,uSun),0.)*sh)+sky(reflect(rd,n))*.25*rim+vec3(.9,.93,1.)*.18*rim;}
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

// Genesis (preview): the shaders. Design brief: docs/worlds/genesis.md.
//
// Every wall is drawn from two data textures the world writes each frame (genesis.js): uC, the chambers (8 texels a row:
// centre and radius; aperture; pores and visibility; vitrification, rings and pulses; resonance; inner light; files;
// the mode's axis), and uF, the files (4 texels a row: direction in the chamber and the reach of its light; light colour
// and strength; stress, repairs, nucleation, touch; seed and chamber). The structure is the union of the chambers'
// balls: a chamber's wall is its sphere where no other ball covers it, a septum the radical disc of two balls where no
// third covers it, a suture the circle where two walls end. Nothing here reads a clock but uT (view seconds).
import {NOISE} from './core.js';
export const MAXC=48;
const DATA=`
uniform sampler2D uC,uF;uniform float uNC,uT,uQ;uniform mat3 uS,uSi;
vec4 ch(int k,int j){return texelFetch(uC,ivec2(j,k),0);}
vec4 fl(int m,int j){return texelFetch(uF,ivec2(j,m),0);}
// inside another chamber's ball (the union's interior)
bool covered(vec3 p,int a,int b){for(int k=0;k<${MAXC};k++){if(float(k)>=uNC)break;if(k==a||k==b)continue;vec4 c=ch(k,0);vec3 d=p-c.xyz;if(dot(d,d)<c.w*c.w*.9998)return true;}return false;}
// on a septum: a third chamber's power below the pair's
bool coveredPow(vec3 p,int a,int b,float pw){for(int k=0;k<${MAXC};k++){if(float(k)>=uNC)break;if(k==a||k==b)continue;vec4 c=ch(k,0);vec3 d=p-c.xyz;if(dot(d,d)-c.w*c.w<pw-1e-3)return true;}return false;}
`;
const LIGHT=`
uniform vec3 uKey,uKeyL,uKeyC,uFill,uFillC,uRim,uRimC,uAmb,uDeep;
// Studio light for the glaze's reflections: a large soft box toward the key, a strip behind the subject, a faint dome.
vec3 env(vec3 R){float k=max(dot(R,uKey),0.),s=max(dot(R,uRim),0.);
  return uKeyC*(pow(k,28.)*2.4+pow(k,5.)*.18)+uRimC*(pow(s,14.)*1.5+pow(s,3.)*.08)+uFillC*.05*smoothstep(-.4,1.,R.y)+uDeep*.6;}
// Inigo Quilez's analytic sphere soft shadow and (approximate) sphere occlusion.
float sphShadow(vec3 ro,vec3 rd,vec4 s,float k){vec3 oc=ro-s.xyz;float b=dot(oc,rd),c=dot(oc,oc)-s.w*s.w,h=b*b-c;
  float d=sqrt(max(0.,s.w*s.w-h))-s.w,t=-b-sqrt(max(h,0.));return t<0.?1.:smoothstep(0.,1.,2.5*k*d/t);}
float sphOcc(vec3 p,vec3 n,vec4 s){vec3 di=s.xyz-p;float l=length(di),nl=dot(n,di/l),h=l/s.w,h2=h*h;return pow(clamp(.5*(nl*h+1.)/h2,0.,1.),1.5);}
float shadowAt(vec3 p,vec3 n,int a,int b){if(uQ>2.5)return 1.;float s=1.;
  for(int k=0;k<${MAXC};k++){if(float(k)>=uNC)break;if(k==a||k==b)continue;s*=sphShadow(p+n*.08,uKeyL,ch(k,0),5.);}return s;}
float occAt(vec3 p,vec3 n,int a,int b){if(uQ>2.5)return 1.;float o=1.;
  for(int k=0;k<${MAXC};k++){if(float(k)>=uNC)break;if(k==a||k==b)continue;o*=1.-.75*sphOcc(p,n,ch(k,0));}return clamp(o,0.,1.);}
// A thin film's reflectance per channel (thickness in nm, index 1.33): what the glaze's opal and the films' colours are.
vec3 thinFilm(float c,float d){float ct=sqrt(max(0.,1.-(1.-c*c)/1.77)),opd=2.*1.33*d*ct;vec3 s=sin(3.14159*opd/vec3(640.,540.,455.));return s*s;}
float ggx(float nh,float a){float a2=a*a,d=nh*nh*(a2-1.)+1.;return a2/(3.14159*d*d);}
`;
// Inigo Quilez's inverse spherical Fibonacci mapping (after Keinert et al. 2015), widened around the
// lattice's local cell (its four corners and their eight edge neighbours) so it also finds the second-nearest point: (nearest index, its chord distance, second index, its
// distance). The difference of the two distances is zero on a Voronoi edge: the wall's ridges.
const FIB=`
vec4 invSF2(vec3 p,float n){const float PI=3.14159265,PHI=1.61803398875;float m=1.-1./n;
  float phi=min(atan(p.y,p.x),PI),ct=p.z;float k=max(2.,floor(log(n*PI*sqrt(5.)*(1.-ct*ct))/log(PHI*PHI)));
  float Fk=pow(PHI,k)/sqrt(5.);vec2 F=vec2(round(Fk),round(Fk*PHI));vec2 ka=2.*F/n,kb=2.*PI*(fract((F+1.)*PHI)-(PHI-1.));
  mat2 iB=mat2(ka.y,-ka.x,kb.y,-kb.x)/(ka.y*kb.x-ka.x*kb.y);vec2 c=floor(iB*vec2(phi,ct-m));float d1=8.,d2=8.,j1=0.,j2=0.;
  const vec2 O[12]=vec2[12](vec2(0,0),vec2(1,0),vec2(0,1),vec2(1,1),vec2(-1,0),vec2(-1,1),vec2(2,0),vec2(2,1),vec2(0,-1),vec2(1,-1),vec2(0,2),vec2(1,2));
  for(int s=0;s<12;s++){float i=dot(F,O[s]+c);if(i<0.||i>=n)continue;
    float ph=2.*PI*fract(i*(PHI-1.)),cz=m-2.*i/n,sz=sqrt(max(0.,1.-cz*cz));vec3 q=vec3(cos(ph)*sz,sin(ph)*sz,cz);float dd=dot(q-p,q-p);
    if(dd<d1){d2=d1;j2=j1;d1=dd;j1=i;}else if(dd<d2){d2=dd;j2=i;}}
  return vec4(j1,sqrt(d1),j2,sqrt(d2));}
vec3 sfPoint(float i,float n){const float PI=3.14159265,PHI=1.61803398875;float ph=2.*PI*fract(i*(PHI-1.)),cz=1.-1./n-2.*i/n,sz=sqrt(max(0.,1.-cz*cz));return vec3(cos(ph)*sz,sin(ph)*sz,cz);}
float h1(float x){return fract(sin(x*12.9898)*43758.5453);}
mat3 latticeRot(float seed){float sd=seed*6.2832;return mat3(cos(sd),0.,sin(sd),0.,1.,0.,-sin(sd),0.,cos(sd))*mat3(1.,0.,0.,0.,cos(sd*1.7),-sin(sd*1.7),0.,sin(sd*1.7),cos(sd*1.7));}
`;
// The material and its states, shared by the walls.
const MATTER=`
uniform vec3 uBody,uSss,uMetal,uInterior,uCrystal,uWarn,uGold,uValid,uAcc;uniform float uGlaze,uRough,uTrans,uOpal,uGrain,uCoh,uSpark,uThump;
// A chamber's standing wave on its wall: |cos(l theta) cos(m phi)| about its axis, turning with its phase.
float modeOf(vec3 d,vec4 R,vec3 ax){vec3 a=normalize(ax+1e-5),b=normalize(cross(a,abs(a.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.))),c=cross(a,b);
  float th=acos(clamp(dot(d,a),-1.,1.)),ph=atan(dot(d,c),dot(d,b))+R.w;float l=max(1.,R.z);
  return abs(cos(l*th)*cos(max(0.,l-1.)*ph));}
// The inner light reaching a point of chamber k's wall through the porcelain: each file's light around its direction,
// coloured (amber, an agent's colour when it works there), with the file's own states.
vec3 innerGlow(int k,vec3 d,out float stress,out float heal,out float touch){
  vec3 g=ch(k,8).rgb*.45;stress=0.;heal=0.;touch=0.;
  for(int i=0;i<12;i++){float x=ch(k,10+i/4)[i-4*(i/4)];if(x<0.)break;int m=int(x+.5);vec4 a=fl(m,0),b=fl(m,1),c=fl(m,2);
    float cs=length(a.xyz)>.01?dot(d,normalize(a.xyz)):.2,w=exp(-(1.-cs)/max(.02,a.w*a.w));
    g+=b.rgb*b.w*w;stress=max(stress,c.x*w);heal=max(heal,c.y*w);touch=max(touch,c.w*w);}
  return g;}
// Crazing (failure) and kintsugi (a verified repair) share the cracks: a cellular network on the wall's direction.
float cracks(vec3 d,float seed){vec3 p=d*4.6+seed*13.1,i=floor(p),f=fract(p);float f1=8.,f2=8.;vec3 fw=fwidth(p);float px=max(fw.x+fw.y+fw.z,1e-5);
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 o=vec3(x,y,z),h=fract(sin(vec3(dot(i+o,vec3(127.1,311.7,74.7)),dot(i+o,vec3(269.5,183.3,246.1)),dot(i+o,vec3(113.5,271.9,124.6))))*43758.5453);
    vec3 r=o+h-f;float dd=dot(r,r);if(dd<f1){f2=f1;f1=dd;}else if(dd<f2)f2=dd;}
  float e=sqrt(f2)-sqrt(f1),w=max(.03,px*1.6);return 1.-smoothstep(w*.5,w,e);}
`;
// ---- The chambers' walls -------------------------------------------------------------------------------------------------
// One unit sphere instanced per chamber (aK its row), both faces: outside, glazed matter in the key light with the inner
// light shining through; inside (a back face), nacre lit by the files' lights and by the day through the pores.
export const SHELL_VS=`${DATA}attribute float aK;varying vec3 vP,vD;varying float vK;
void main(){int k=int(aK+.5);vec4 c=ch(k,0);vec3 d=normalize(position);vec3 p=c.xyz+d*c.w;vP=p;vD=d;vK=aK;gl_Position=projectionMatrix*viewMatrix*vec4(uS*p,1.);}`;
export const SHELL_FS=`${DATA}${LIGHT}${FIB}${MATTER}${NOISE}varying vec3 vP,vD;varying float vK;
void main(){int k=int(vK+.5);if(covered(vP,k,-1))discard;
  vec4 C0=ch(k,0),C1=ch(k,1),C2=ch(k,2),C3=ch(k,3),C4=ch(k,4),C5=ch(k,5),C6=ch(k,6),C7=ch(k,7);
  vec3 d=normalize(vP-C0.xyz);
  // a chamber whose files have gone dissolves
  if(C2.w<.999&&gnoise(d*4.3+vec3(vK*3.1))*.5+.5>C2.w)discard;
  // the aperture of the newest chamber: an opening with a lip
  float lip=0.;if(C1.w>0.){float a=dot(d,C1.xyz);if(a>C1.w)discard;lip=smoothstep(C1.w-.05,C1.w,a);}
  // the reticulate wall: a honeycomb of ridges on the chamber's own lattice (cells of one size in the world); each cell a
  // thin, translucent floor; some cells a glazed window (the inner light glows through it), a few an open pore
  mat3 rot=latticeRot(C2.z);float n=max(12.,C5.x),sp=sqrt(12.566/n);
  // the lattice's detail fades to its average where a cell spans only a few pixels (no moire in a far view)
  vec3 fw=fwidth(d);float cellPx=sp/max(fw.x+fw.y+fw.z,1e-6),detail=smoothstep(3.,9.,cellPx);
  vec4 sf=invSF2(rot*d,n);vec3 q1=transpose(rot)*sfPoint(sf.x,n);
  float hB=h1(sf.x*.71+C2.z*37.3);
  float rw=.075*sp*max(.3,C5.z)*(.9+.2*hB),edge=sf.w-sf.y,ridge=mix(.22,1.-smoothstep(0.,rw,edge),detail),bowl=mix(.6,clamp(sf.y/(.58*sp),0.,1.),detail);
  // every cell alike: a round pore at its centre (its size the conductivity law's: none, a solid wall), a countersink
  float pr=C2.x*.5*sp,rim=0.;
  if(pr>0.&&lip<.01&&detail>.05){if(sf.y<pr*detail)discard;rim=(1.-smoothstep(pr,pr*1.9,sf.y))*detail;}
  float win=0.;
  float thin=(1.-ridge)*(.45+.55*(1.-bowl));
  float stress,heal,touch;vec3 glow=innerGlow(k,d,stress,heal,touch);
  float mode=modeOf(d,C4,C7.xyz),ring=.5+2.4*C4.y*mode*mode+1.7*C4.x+1.3*C3.z*mode;
  // vitrification (a verified milestone): the wall turns to clear crystal, behind a front sweeping from its axis
  float vit=C3.x;if(C3.y>0.){float f=dot(d,normalize(C7.xyz+1e-5))*.5+.5;vit=max(vit,smoothstep(1.-C3.y*1.08,1.-C3.y*1.08+.06,f)*step(.001,C3.y));}
  vec3 V=normalize(cameraPosition-uS*vP);vec3 col;
  float crackF=0.,gold=0.;if(stress+heal>.02){float cr=cracks(d,C2.z*7.);crackF=cr*stress;gold=cr*heal*(1.-stress);}
  float relief=1.-.6*lip;
  if(gl_FrontFacing){
    // outside: deep pits between thin raised ridges (the pit's walls lean toward its floor, the floor is flat and in the
    // ridges' shade), under a glaze with a faint orange peel; an open pore's countersink
    float wall=smoothstep(.45,.95,bowl)*(1.-ridge);
    vec3 N=normalize(d-(d-q1)*wall*2.6/sp*.3*relief);
    if(rim>0.)N=normalize(N+(q1-d)*rim*1.6/sp);
    float gr=gnoise(d*61.);N=normalize(N+uGrain*.03*vec3(gr,-gr,gr*.5)*detail);N=normalize(uSi*N);
    float pit=(1.-ridge)*(1.-smoothstep(.55,1.,bowl))*relief*detail;
    float NL=dot(N,uKey),NV=max(dot(N,V),1e-3),sh=shadowAt(vP,d,k,-1),ao=occAt(vP,d,k,-1)*(1.-.5*rim)*(1.-.55*pit);
    // vitrified: clear dark crystal, its lattice gilded, its inner light twice as present
    vec3 body=mix(uBody,uCrystal*.18,vit);float trans=mix(uTrans,2.4,vit);
    float wrap=clamp((NL+.3)/1.3,0.,1.);
    col=body*(uKeyC*wrap*sh+uFillC*(.45+.55*dot(N,uFill))*.3*ao+uAmb*ao);
    col+=uSss*body*uKeyC*smoothstep(-.3,.1,NL)*(1.-smoothstep(.1,.55,NL))*.25*uTrans*sh;
    vec3 H=normalize(uKey+V);float F=.04+.96*pow(1.-NV,5.),rough=mix(uRough,.04,vit);
    vec3 film=mix(vec3(1.),thinFilm(NV,300.+260.*(gnoise(d*2.2+vec3(uT*.012))*.5+.5))*2.,uOpal*.45);
    col+=uKeyC*ggx(max(dot(N,H),0.),rough)*F*max(NL,0.)*sh*uGlaze*.25*film;
    col+=env(reflect(-V,N))*F*uGlaze*ao*film*(1.+vit);
    col+=uRimC*pow(1.-NV,4.)*max(dot(N,uRim),0.)*.18*ao;
    // the crests catch the key; the inner light comes through the thin pit floors and the windows (the ridges stay dark
    // against it), strongest on the side the key leaves in shade
    col+=uKeyC*body*ridge*max(NL,0.)*sh*.22*relief;
    col=mix(col,uGold*(uKeyC*wrap*sh*.8+uAmb*1.8)+env(reflect(-V,N))*uGold*.8,vit*ridge*detail*.85);
    float dark=1.-.75*clamp(dot(d,uKeyL)*sh,0.,1.);
    col+=glow*ring*trans*(thin*(1.-.8*ridge))*(.34+.9*dark)*(1.-rim)+glow*ring*rim*.3;
    // the lip: a band of the sutures' metal
    if(lip>0.)col=mix(col,uMetal*(uKeyC*wrap*sh+uAmb*2.)+env(reflect(-V,N))*uMetal*.7,lip*.85);
    // failure crazes the wall (vermilion light in the cracks); a verified repair fills them with gold
    col=mix(col,uWarn*(1.4+.8*abs(sin(uT*3.1+d.x*9.))),crackF);
    col=mix(col,uGold*(uKeyC*wrap*sh*1.1+uAmb*2.5)+env(reflect(-V,N))*uGold*1.2,clamp(gold*1.6,0.,1.));
    // the music's own light: the cell floors of a ringing chamber glow in its standing wave (a bass note the whole lattice,
    // the melody bands that move with the line), whatever the key light does
    float rez=(1.-exp(-1.5*C4.y))*mode*mode*1.3+(1.-exp(-1.3*C4.x))*.55+.6*C3.z*mode;
    col+=uAcc*rez*thin*(1.-.75*ridge)*1.5;
    col+=uAcc*touch*.18*trans*thin+uAcc*uSpark*rim*.25;
  }else{
    // inside: nacre lit by the files' lights and their standing wave; the day through the windows and pores
    vec3 Nl=normalize(-d+(d-q1)*(1.-ridge)*bowl*.25/sp*.22),N=normalize(uSi*Nl);float NV=max(dot(N,V),1e-3);vec3 li=vec3(0.);
    li+=ch(k,8).rgb*.35;
    for(int i=0;i<12;i++){float x=ch(k,10+i/4)[i-4*(i/4)];if(x<0.)break;int m=int(x+.5);vec4 a=fl(m,3),b=fl(m,1);vec3 L=a.xyz-vP;float dl=length(L);li+=b.rgb*b.w*max(dot(Nl,L/dl),0.)/(1.+dl*dl/(C0.w*C0.w*.18));}
    vec3 nac=mix(vec3(1.),thinFilm(NV,420.+300.*(gnoise(d*3.1+vec3(uT*.02))*.5+.5))*1.6,uOpal*.3);
    float day=max(dot(d,uKeyL),0.);
    col=uInterior*(li*.55*ring*(.7+.3*ridge)+uAmb*.4+uKeyC*day*uTrans*.04*thin)*nac;
    col+=uKeyC*day*rim*.6;
    col=mix(col,uWarn*.8,crackF*.6);col=mix(col,uGold*(li+uAmb)*1.5,gold*.8);
  }
  gl_FragColor=vec4(col,1.);}`;
// ---- Septa: the walls between chambers -----------------------------------------------------------------------------------
// One disc per pair of meeting chambers on their radical plane (sA: centre, radius; sB: normal, coupling; sC: the two
// chambers, the counter-melody's tone on it, a pulse; sD: the opening's centre and radius, 0 for none).
export const SEPTUM_VS=`uniform mat3 uS;attribute vec4 sA,sB,sC,sD;varying vec3 vP;varying vec4 vB,vC,vD;varying float vR;
void main(){vec3 n=normalize(sB.xyz),e1=normalize(cross(n,abs(n.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.))),e2=cross(n,e1);
  vec3 p=sA.xyz+(e1*position.x+e2*position.y)*sA.w*1.003;vP=p;vB=sB;vC=sC;vD=sD;vR=length(position.xy);gl_Position=projectionMatrix*viewMatrix*vec4(uS*p,1.);}`;
export const SEPTUM_FS=`${DATA}${LIGHT}${MATTER}${NOISE}varying vec3 vP;varying vec4 vB,vC,vD;varying float vR;
void main(){int a=int(vC.x+.5),b=int(vC.y+.5);vec4 A=ch(a,0);vec3 da=vP-A.xyz;float pw=dot(da,da)-A.w*A.w;if(pw>0.)discard;if(coveredPow(vP,a,b,pw))discard;
  float lip=0.;if(vD.w>0.){float r=length(vP-vD.xyz);if(r<vD.w)discard;lip=1.-smoothstep(vD.w,vD.w*1.25,r);}
  vec3 V=normalize(cameraPosition-uS*vP),Nl=normalize(vB.xyz),N=normalize(uSi*Nl);int k=dot(V,N)>0.?b:a;if(dot(N,V)<0.){N=-N;Nl=-Nl;}
  vec4 Ck=ch(k,0),C4=ch(k,4);vec3 li=ch(k,8).rgb*.35;
  for(int i=0;i<12;i++){float x=ch(k,10+i/4)[i-4*(i/4)];if(x<0.)break;int m=int(x+.5);vec4 f=fl(m,3),c=fl(m,1);vec3 L=f.xyz-vP;float dl=length(L);li+=c.rgb*c.w*max(dot(Nl,L/dl),0.)/(1.+dl*dl/(Ck.w*Ck.w*.18));}
  float NV=max(dot(N,V),1e-3),tone=vC.z;
  // the counter-melody rings the septum in concentric standing waves
  float wave=.6+tone*.9*pow(abs(cos(vR*9.4248)),3.);
  vec3 nac=mix(vec3(1.),thinFilm(NV,380.+280.*(gnoise(vP*.06+vec3(uT*.015))*.5+.5))*2.,uOpal*.6);
  vec3 col=uInterior*(li*.95*wave*(.7+.5*C4.x)+uAmb*.5)*nac*(.75+.25*smoothstep(.98,.85,vR));
  col=mix(col,uMetal*(li*.8+uAmb*2.)+uKeyC*.05,lip*.9);col+=uMetal*vC.w*.2*lip;
  gl_FragColor=vec4(col,1.);}`;
// ---- Sutures and the aperture's lip: champagne titanium along a circle ---------------------------------------------------
// A torus per circle (tA: centre, radius; tB: normal, tube radius; tC: the two chambers (-1: the aperture's lip), a pulse,
// the beads' phase). The part of the circle another ball covers is not drawn. Light beads glide along it (drainage).
export const SUTURE_VS=`uniform mat3 uS;attribute vec4 tA,tB,tC;varying vec3 vP,vQ,vT,vN;varying vec4 vC;varying float vU;
void main(){vec3 n=normalize(tB.xyz),e1=normalize(cross(n,abs(n.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.))),e2=cross(n,e1);
  float u=position.x*6.2831853,v=position.y*6.2831853;vec3 rd=e1*cos(u)+e2*sin(u);vec3 q=tA.xyz+rd*tA.w;
  vec3 nn=rd*cos(v)+n*sin(v);vec3 p=q+nn*tB.w;vP=p;vQ=q;vT=-e1*sin(u)+e2*cos(u);vN=nn;vC=tC;vU=position.x;gl_Position=projectionMatrix*viewMatrix*vec4(uS*p,1.);}`;
export const SUTURE_FS=`${DATA}${LIGHT}${MATTER}varying vec3 vP,vQ,vT,vN;varying vec4 vC;varying float vU;
uniform float uBeads,uFlow;
void main(){int a=int(vC.x+.5),b=int(vC.y+.5);if(vC.y<-.5)b=-1;if(covered(vQ,a,b))discard;
  vec3 Nl=normalize(vN),N=normalize(uSi*Nl),V=normalize(cameraPosition-uS*vP),T=normalize(uS*vT),H=normalize(uKey+V);
  float NL=dot(N,uKey),sh=shadowAt(vP,Nl,a,b),ao=occAt(vP,Nl,a,b);
  float th=sqrt(max(0.,1.-pow(dot(T,H),2.))),aniso=pow(th,180.)*1.6+pow(th,22.)*.25;
  vec3 col=uMetal*(uKeyC*clamp(NL*.6+.4,0.,1.)*sh*.55+uAmb*1.4*ao)+uMetal*uKeyC*aniso*sh*max(NL+.2,0.);
  col+=env(reflect(-V,N))*uMetal*.55*ao;
  // drainage: beads of light gliding along the seam; the commit's consolidating pulse
  float bead=pow(max(0.,sin((vU*uBeads-vC.w)*6.2831853)),40.);col+=uAcc*bead*uFlow*1.4+uMetal*vC.z*1.2;
  gl_FragColor=vec4(col,1.);}`;
// ---- Chamberlets: the files' films inside a chamber (additive) -----------------------------------------------------------
// CPU polygons (genesis-form.js filmsOf), cut here to the chamber's ball and to the union. aW: edge (0 at the polygon's
// rim, 1 inside), chamber row, the two files' rows.
export const FILM_VS=`uniform mat3 uS;attribute vec4 aW;attribute vec3 aN;varying vec3 vP,vN;varying vec4 vW;
void main(){vP=position;vN=aN;vW=aW;gl_Position=projectionMatrix*viewMatrix*vec4(uS*position,1.);}`;
export const FILM_FS=`${DATA}${LIGHT}${MATTER}${NOISE}varying vec3 vP,vN;varying vec4 vW;uniform float uFilm;
void main(){int k=int(vW.y+.5),m0=int(ch(k,6).x+.5),fa=m0+int(vW.z+.5),fb=m0+int(vW.w+.5);vec4 C=ch(k,0);vec3 dc=vP-C.xyz;float rr=length(dc)/C.w;if(rr>.995)discard;
  if(covered(vP,k,-1))discard;
  vec4 A=fl(fa,1),B=fl(fb,1),SA=fl(fa,2),SB=fl(fb,2);float nuc=min(SA.z,SB.z);if(nuc<=0.)discard;
  vec3 V=normalize(cameraPosition-uS*vP),N=normalize(uSi*vN);float NV=abs(dot(N,V));
  float stress=max(SA.x,SB.x);
  // the film's thickness: draining toward its foot, slow currents, turbulence where a failure stirs it
  float th=520.+260.*gnoise(vP*.05+vec3(0.,uT*.03,uT*.017))+140.*gnoise(vP*.13-vec3(uT*.05))+(-dot(dc,vec3(0.,1.,0.))/C.w)*160.;
  th+=stress*500.*gnoise(vP*.4+vec3(uT*1.7));
  vec3 irid=mix(vec3(.5),thinFilm(NV,max(40.,th)),.55)*1.2;float F=.04+.96*pow(1.-NV,5.);
  vec3 li=(A.rgb*A.w+B.rgb*B.w)*.5+uAcc*.05;
  float border=pow(1.-clamp(vW.x,0.,1.),5.)+smoothstep(.93,.995,rr)*.6;
  vec3 col=(irid*(.12+F*1.2)*li*.45+uMetal*li*border*.6)*nuc*uFilm;
  col=mix(col,uWarn*.25*(.5+.5*sin(uT*9.+vP.x)),stress*.5);
  gl_FragColor=vec4(col*(1.-smoothstep(.97,.995,rr)*.5),1.);}`;
// ---- Spines: fine titanium needles radiating from the walls (nA: base and width, nB: tip and width, nC: the beads' phase,
// brightness, beads per needle, alpha), shaded as thin brushed tubes; light beads stream outward along them ---------------
export const NEEDLE_VS=`uniform float uPx;uniform vec2 uRes;attribute vec4 nA,nB,nC;varying float vY,vX;varying vec4 vC;varying vec3 vT,vP;
void main(){vec4 va=viewMatrix*vec4(nA.xyz,1.),vb=viewMatrix*vec4(nB.xyz,1.),vp=mix(va,vb,position.x);
  vec3 t=vb.xyz-va.xyz;t=length(t)>1e-6?normalize(t):vec3(1.,0.,0.);vec3 sd=cross(t,normalize(vp.xyz));sd=length(sd)>1e-6?normalize(sd):vec3(0.,1.,0.);
  float z=max(-vp.z,.1),ppu=projectionMatrix[1][1]*uRes.y*.5/z,w=mix(nA.w,nB.w,position.x),wp=max(w,.7*uPx/ppu);
  vp.xyz+=sd*position.y*wp;vY=position.y;vX=position.x;vC=nC;vC.w*=min(1.,w/wp*1.2);vT=normalize(nB.xyz-nA.xyz);vP=mix(nA.xyz,nB.xyz,position.x);gl_Position=projectionMatrix*vp;}`;
export const NEEDLE_FS=`uniform vec3 uKey,uKeyC,uMetal,uAmb,uAcc;uniform float uT,uFlow;varying float vY,vX;varying vec4 vC;varying vec3 vT,vP;
void main(){float a=1.-smoothstep(.45,1.,abs(vY));if(a<=.01)discard;
  vec3 V=normalize(cameraPosition-vP),T=normalize(vT),H=normalize(uKey+V);float th=sqrt(max(0.,1.-pow(dot(T,H),2.))),across=1.-vY*vY;
  vec3 col=uMetal*(uAmb*2.2+uKeyC*(.2+.4*across)*.45)+uMetal*uKeyC*(pow(th,110.)*1.6+pow(th,14.)*.22)*across;
  float bead=pow(max(0.,sin((vX*vC.z-uT*uFlow*.55+vC.x)*6.2831853)),26.);col+=uAcc*bead*1.8*(1.-vX*.5)*vC.y;
  gl_FragColor=vec4(col*(1.-.45*vX),a*vC.w*(1.-.35*vX));}`;
// ---- Light: threads, granules, the files' lights, agents, motes (additive) -----------------------------------------------
export const POINT_VS=`uniform float uPx;uniform vec2 uRes;attribute vec4 pC;attribute vec3 pS;varying vec4 vC;varying float vSh;
void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float ppu=projectionMatrix[1][1]*uRes.y*.5/max(-mv.z,.1);
  gl_PointSize=clamp(max(pS.x*uPx,pS.z*ppu),1.,260.*uPx);vC=pC;vSh=pS.y;}`;
export const POINT_FS=`varying vec4 vC;varying float vSh;
void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q),a;int sh=int(vSh+.5);
  if(sh==1)a=exp(-pow((r-.55)*9.,2.))*1.3+exp(-r*r*40.);
  else if(sh==2){a=max(0.,1.-(abs(q.x)*8.+abs(q.y)*1.2))+max(0.,1.-(abs(q.y)*8.+abs(q.x)*1.2))+exp(-r*r*26.)*1.5;}
  else if(sh==3)a=exp(-r*r*5.)*.6;
  else a=exp(-r*r*12.)*1.2+exp(-r*r*3.)*.15;
  a*=1.-smoothstep(.9,1.,r);gl_FragColor=vec4(vC.rgb*a*vC.a,1.);}`;
export const RIB_VS=`uniform float uPx;uniform vec2 uRes;attribute vec4 rA,rB,rC;varying vec4 vC;varying float vY;
void main(){vec4 va=viewMatrix*vec4(rA.xyz,1.),vb=viewMatrix*vec4(rB.xyz,1.),vp=mix(va,vb,position.x);
  vec3 t=vb.xyz-va.xyz;t=length(t)>1e-6?normalize(t):vec3(1.,0.,0.);vec3 sd=cross(t,normalize(vp.xyz));sd=length(sd)>1e-6?normalize(sd):vec3(0.,1.,0.);
  float z=max(-vp.z,.1),ppu=projectionMatrix[1][1]*uRes.y*.5/z,w=mix(rA.w,rB.w,position.x),wp=max(w,.9*uPx/ppu);
  vp.xyz+=sd*position.y*wp*1.5;vY=position.y*1.5;vC=rC*vec4(1.,1.,1.,min(1.,w/wp*1.3+.3));gl_Position=projectionMatrix*vp;}`;
export const RIB_FS=`varying vec4 vC;varying float vY;void main(){float a=exp(-vY*vY*3.)+exp(-vY*vY*60.)*.8;gl_FragColor=vec4(vC.rgb*a*vC.a,1.);}`;
// ---- The void: charcoal, a soft studio fall-off behind the structure, haze ------------------------------------------------
export const VOID_FS=`varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam,uDeep,uHaze,uKeyC,uKey;uniform vec4 uHalo;uniform float uHz,uT;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){vec4 a=uInv*vec4(vUv*2.-1.,1.,1.);vec3 r=normalize(a.xyz/a.w-uCam);
  vec3 col=uDeep*(1.+.35*r.y)+uHaze*.18*uHz*exp(-abs(r.y)*3.);
  col+=uKeyC*.012*pow(max(dot(r,uKey),0.),3.);
  vec2 q=(vUv-uHalo.xy)*vec2(uHalo.w,1.);col+=(uHaze*2.2+uKeyC*.008)*uHalo.z*exp(-dot(q,q)*1.6)*uHz*5.;
  col+=(h(vUv*vec2(1931.,1087.)+fract(uT*.37))-.5)*.004;
  gl_FragColor=vec4(col,1.);}`;

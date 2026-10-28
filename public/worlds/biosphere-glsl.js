// Fractal Biosphere shaders. One current field (sway), one light (direction, height fog with in-scattering toward it,
// shafts migrating through the water / air), one material language: dark translucent bodies lit from inside by
// luminous veins, brighter toward the tips (a saturated palette colour, never white), with nutrient pulses climbing
// from the roots. The JS mirror of sway() lives in biosphere.js and must agree with it.
import {NOISE} from './core.js';
export const MAXO=48;
// Shared uniforms and functions (vertex and fragment).
export const COMMON=`
#define MAXO ${MAXO}
float sq(float x){return x*x;}float pw(float x,float y){return pow(max(x,0.),y);}
// Cheap 2D value noise (-1..1) for wide surfaces (ground, mist) where gradient noise costs too much fill.
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x),u.y)*2.-1.;}
uniform float uT,uV,uSpeed,uSwayAmp,uSwayT,uFlow,uLum,uBreath,uIntensity,uPx,uFogD,uFogH,uVeins,uFogFar,uTurb,uBark,uTrans,uRoots;
uniform vec2 uCur,uLean,uRes;
uniform vec4 uOrg[MAXO],uOrgC[MAXO],uOrgS[MAXO],uOrgB[MAXO];uniform vec3 uPal[6];
// Lasting blooms light the branches around them (position, strength; colour, reach).
uniform vec4 uBL[8],uBLC[8];
uniform vec3 uFogC,uFogLit,uLightDir,uBody;
uniform vec4 uWave[8],uWaveC[8];
uniform vec4 uTouch[4],uTouchC[4];
uniform sampler2D uState;
// The current: a travelling wave along one direction plus a slow cross swell; bending grows with the path distance from
// the root (flexible tips, stiff trunks), with the organism's size and its species' flexibility, so every connected
// part moves together.
vec3 sway(vec3 p,float dist,float org){vec4 o=uOrg[int(org)];float H=max(1.,o.z);float x=clamp(dist/H,0.,2.5);float f=x*sqrt(x)*H*.07*uSwayAmp*uOrgS[int(org)].y;
  float tv=uSwayT;vec2 d=uCur;float ph=dot(p.xz,d)*.16-tv*.5;
  float a=sin(ph)+uTurb*(.6*sin(ph*2.3+p.y*.3+1.7)+.35*sin(tv*1.3+p.x*.37-p.z*.29));
  float b=.55*sin(tv*.41+dot(p.xz,vec2(-d.y,d.x))*.21+p.y*.17);
  vec2 m=d*a+vec2(-d.y,d.x)*b+uLean;return vec3(m.x,-.12*length(m)*x,m.y)*f;}
// An organism's size follows its data: positions scale about the root (a pure function of the modules alive).
float orgScale(float org){return uOrgC[int(org)].w;}
vec3 grown(vec3 p,float org){vec4 o=uOrg[int(org)];vec3 r=vec3(o.x,0.,o.y);return r+(p-r)*orgScale(org);}
// Height fog and depth haze; looking toward the light the fog glows (in-scattering).
float fogAmount(vec3 w){vec3 e=w-cameraPosition;float d=length(e);float hm=max(0.,(w.y+cameraPosition.y)*.5);float far=max(0.,d-uFogFar)*(1.2/uFogFar);return 1.-exp(-d*uFogD*(.35+1.7*exp(-hm*uFogH))-far*far);}
// The colour of the haze in a direction (the sky shares it at the horizon, so far ground and water meet seamlessly):
// near black looking down and away from the light, luminous toward it.
vec3 hazeAt(vec3 e){float s=max(0.,dot(e,uLightDir));return uFogC*(.55+.45*smoothstep(-.25,.2,e.y))+uFogLit*(pw(s,3.)*.4+pw(s,10.)*.6)*smoothstep(-.35,.15,e.y);}
vec3 fogMix(vec3 c,vec3 w){return mix(c,hazeAt(normalize(w-cameraPosition)),fogAmount(w));}
// Far silhouettes keep part of their shape however deep in the haze they stand.
vec3 farFog(vec3 c,vec3 w){float d=length(w-cameraPosition);return mix(c,hazeAt(normalize(w-cameraPosition)),clamp(1.-exp(-d*uFogD*2.6),0.,.94));}
// A colour at full saturation (brightest channel 1): emission peaks in colour, the tone mapper keeps it.
vec3 satc(vec3 c){float m=max(c.r,max(c.g,c.b));return pow(c/max(m,1e-3),vec3(1.45));}
// Per-module state from the state texture: x current, y previous, z change time, w attention glow; and the pulse texel:
// x pulse start, y pulse kind (0 light, 1 shed, 2 blight), z module base distance, w healed time (a repaired failure).
vec4 stateOf(float m){if(m<0.)return vec4(1.,1.,-1e5,0.);return texelFetch(uState,ivec2(0,int(m)),0);}
vec4 pulseOf(float m){if(m<0.)return vec4(-1e5,0.,0.,-1e5);return texelFetch(uState,ivec2(1,int(m)),0);}
// Material look per state: emission, paleness (new growth), blight, health.
vec4 look(float s){return s<.5?vec4(.85,.5,0.,0.):s<1.5?vec4(1.,0.,0.,0.):s<2.5?vec4(1.25,0.,0.,1.):vec4(.12,0.,1.,0.);}
vec4 lookAt(vec4 st){float k=smoothstep(0.,1.,(uT-st.z)/uSpeed/(st.x>2.5?1.:2.2));return mix(look(st.y),look(st.x),k);}
// Blight: the module's stressed state, or (sooner) the failing run that reached it, until the state takes over.
float blightOf(vec4 lk,vec4 pu){float a=(uT-pu.x)/uSpeed;float b=pu.y>1.5&&a>0.?smoothstep(0.,.9,a)*(1.-smoothstep(10.,14.,a)):0.;return max(lk.z,b);}
float healOf(vec4 pu){return pu.w>-1e4?smoothstep(0.,3.,(uT-pu.w)/uSpeed):0.;}
// Waves of light through an organism along the path distance: up from the roots (growth, validation, recovery) or
// down from the tips (blight draining the colour, only through the failing branches).
// A recovery's flood (w = 2) runs only up the repaired branches (a branch that was never stressed keeps its light).
vec3 waves(float org,float dist,float blight,float repaired){vec3 a=vec3(0.);for(int i=0;i<8;i++){vec4 w=uWave[i];if(w.y<-1e4)continue;if(w.x>-.5&&abs(w.x-org)>.5)continue;
  float age=(uT-w.y)/uSpeed;if(age<0.||age>9.)continue;float H=max(1.,uOrg[int(org)].z)*1.7;float front=w.w>0.?age*w.z-1.:H-age*w.z;
  float band=exp(-sq((dist-front)/max(.4,uWaveC[i].w)));float k=w.w>1.5?.1+.9*repaired:w.w>0.?1.:blight;
  // An upward wave leaves the light behind it for a moment (a flood, not a ring).
  float wake=w.w>0.?smoothstep(front,front-uWaveC[i].w*3.,dist)*.2*step(dist,front)*(w.w>1.5?repaired:1.):0.;
  a+=uWaveC[i].rgb*(band+wake)*k*smoothstep(9.,5.,age)*smoothstep(0.,.4,age);}return a;}
// An agent's touch on a file (touch.js, biosphere.js): a pulse in the agent's colour runs up the file's branch, past its
// tip into its crown, lighting the photophores on its way; the branch flares behind it and fades over three seconds.
// uTouch: module, start, strength, the branch's base distance; uTouchC: colour, its tip distance (at rest, scaled here).
vec3 touchAt(float m,float dist,float S){vec3 a=vec3(0.);if(m<-.5)return a;
  for(int i=0;i<4;i++){vec4 T=uTouch[i];if(T.z<=0.||abs(T.x-m)>.5)continue;float age=(uT-T.y)/uSpeed;if(age<0.||age>3.2)continue;
    float b=T.w*S,L=max(.4,uTouchC[i].w*S-b),front=b+L*1.3*smoothstep(0.,.9,age);
    float band=exp(-sq((dist-front)/max(.22,L*.14)))*(1.-smoothstep(1.,1.6,age));float env=smoothstep(0.,.15,age)*pw(1.-age/3.2,1.6);
    a+=uTouchC[i].rgb*T.z*(band*2.6+env*.8*step(dist,front+.3));}
  return a;}
// Nutrient circulation: ambient life from the roots to the tips (never growth). A wide, soft swell in the water's own
// colour (never the organism's hue, never a sharp front: the event pulses are narrow, bright and coloured).
float nutrient(float dist,float org){float p=fract(dist*.07-uV*.045*uFlow+org*.37);return smoothstep(0.,.3,p)*smoothstep(.75,.3,p);}
// The key light's colour (the water's lit colour at full strength).
vec3 keyCol(){return uFogLit/max(1e-3,max(uFogLit.r,max(uFogLit.g,uFogLit.b)));}
// Colour fades into the haze with distance (background organisms lose saturation before they lose shape).
vec3 distHue(vec3 hue,vec3 w){float d=length(w-cameraPosition);float k=smoothstep(uFogFar*.2,uFogFar*1.1,d)*.7;float l=dot(hue,vec3(.3,.55,.15));return mix(hue,mix(vec3(l),keyCol()*l,.5),k);}
// The light a lasting bloom casts on the branches near it.
vec3 bloomLight(vec3 w){vec3 a=vec3(0.);for(int i=0;i<8;i++){vec4 b=uBL[i];if(b.w<=0.)continue;float r=uBLC[i].w;vec3 d=w-b.xyz;a+=uBLC[i].rgb*b.w/(1.+dot(d,d)/(r*r))*exp(-length(d)/(r*3.));}return a;}
`;
const VARY='varying vec3 vW,vN,vWave,vProf;varying vec4 vLook,vInfo;varying vec2 vCS,vPol;varying float vPulse,vMat,vFront,vHeal,vFar,vThin;';
// ---- Branch segments: instanced cubic-Bezier tubes ----------------------------------------------------------------
export const SEG_VS=`${COMMON}
attribute vec4 iA,iB,iC1,iC2,iT,iM;
${VARY}
vec3 bez(vec3 a,vec3 c1,vec3 c2,vec3 b,float t){float u=1.-t;return u*u*u*a+3.*u*u*t*c1+3.*u*t*t*c2+t*t*t*b;}
vec3 bezd(vec3 a,vec3 c1,vec3 c2,vec3 b,float t){float u=1.-t;return 3.*u*u*(c1-a)+6.*u*t*(c2-c1)+3.*t*t*(b-c2);}
float radAt(float t){float r=mix(iA.w,iB.w,t);float f=iT.w;if(f>.5&&f<1.5)r=iA.w*sqrt(max(0.,1.-t*t));else if(f>1.5&&f<2.5)r=iA.w*sin(3.1416*t);else if(f>2.5&&f<3.5)r=iA.w*pw(cos(t*1.5708),.75)*(1.+.12*sin(t*3.1416));return r;}
void main(){
  float grow=clamp((uT-iT.x)/uSpeed/iT.z,0.,1.);float gone=iT.y<1e5?clamp((uT-iT.y)/uSpeed/1.5,0.,1.):0.;
  if(grow<=0.||gone>=1.){gl_Position=vec4(2.,2.,2.,1.);return;}
  float org=iM.y;float t=position.y*grow;float S=orgScale(org);vec3 P=grown(bez(iA.xyz,iC1.xyz,iC2.xyz,iB.xyz,t),org);vec3 T=normalize(bezd(iA.xyz,iC1.xyz,iC2.xyz,iB.xyz,t)+vec3(0.,1e-5,0.));
  vec4 o=uOrg[int(org)];float dist=mix(iC1.w,iC2.w,t)*S;float tip=clamp(dist/(max(1.,o.z)*.95),0.,1.);
  // Girth from the continuous path distance (old, large organisms carry thicker trunks), no step at any joint.
  float k=S*mix(o.w,1.,smoothstep(0.,.45,tip))*(.35+.65*smoothstep(0.,1.,grow))*(1.-gone*.75);
  float r=radAt(t)*k;float drds=(radAt(min(1.,t+.02))-radAt(max(0.,t-.02)))*k/(.04*max(1e-3,S*length(bezd(iA.xyz,iC1.xyz,iC2.xyz,iB.xyz,t))*grow));
  // Trunks flare into buttresses where they meet the ground.
  if(iT.w>3.5&&iC1.w<.001){float fl=1.2*exp(-max(0.,P.y)/max(.03,iA.w*S*.9))*sq(1.-t);r*=1.+fl;drds-=fl*2.;}
  vec4 st=stateOf(iM.x),pu=pulseOf(iM.x);vec4 lk=lookAt(st);float bl=blightOf(lk,pu);
  vec3 C=P+sway(P,dist,org);
  // Blight: affected branches sag a little (never collapse).
  C.y-=bl*.05*dist*smoothstep(.2,.8,tip);
  vec3 N=normalize(cross(T,abs(T.y)<.95?vec3(0.,1.,0.):vec3(1.,0.,0.))),B=cross(N,T);vec2 cs=position.xz;
  // Crystal trees: hexagonal prisms (the ring snaps to six faces; flat shading draws the facets).
  if(uOrgS[int(org)].x>.5&&uOrgS[int(org)].x<1.5){float a=atan(cs.y,cs.x);a=floor(a/1.0472+.5)*1.0472;cs=vec2(cos(a),sin(a));}
  vec3 n=N*cs.x+B*cs.y;
  vec3 w=C+n*r;vW=w;vN=normalize(n-T*clamp(drds,-6.,6.));vLook=vec4(lk.xy,bl,lk.w);vInfo=vec4(org,tip,dist,iM.w);vCS=position.xz;vProf=vec3(iT.w,t,iM.x<-1.5?-iM.x-2.:-1.);vMat=max(0.,o.w-1.);
  vWave=waves(org,dist,bl,pu.w>-1e4?1.:0.)+touchAt(iM.x,dist,S);float pa=(uT-pu.x)/uSpeed;float front=pu.z+pa*5.5;vPol=vec2(0.,iM.z);
  vPulse=(pa>0.&&pa<5.&&pu.y<1.5?exp(-sq((dist-front)*1.3))*smoothstep(5.,3.,pa)*(pu.y>.5?.4:1.):0.)+st.w*(.55+.45*sin(uV*3.+dist*2.));
  vFront=grow<1.?pw(position.y,3.)*(1.-grow*.6):0.;vFront+=uOrgS[int(org)].z*.5;vHeal=healOf(pu);vFar=0.;vThin=1.;
  gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`;
// ---- Crowns: instanced recursive templates (a scaled copy of the organism's rule at every file and symbol) ----------
export const CROWN_VS=`${COMMON}
uniform float uCrownD,uTwist,uTipBreath;
attribute vec4 aO,aS,aP;attribute float aA;attribute vec4 tA,tB,tC,tD,tM;
${VARY}
void main(){
  float flags=floor(tM.w/8.),far=mod(flags,2.),colour=mod(tM.w,8.);
  float grow=clamp((uT-tD.x)/uSpeed/tD.z,0.,1.);float gone=tD.y<1e5?clamp((uT-tD.y)/uSpeed/1.5,0.,1.):0.;
  if(grow<=0.||gone>=1.){gl_Position=vec4(2.,2.,2.,1.);return;}
  // aP.z: the branch level (0 base .. 1 finest); above 1 marks the rings of a polyp bud at a terminal twig.
  float lvl=min(aP.z,1.),bud=step(1.05,aP.z);
  float org=tM.y;float S=far>.5?1.:orgScale(org);
  vec3 Y=normalize(tB.xyz),X=normalize(tC.xyz-Y*dot(tC.xyz,Y)),Z=cross(X,Y);
  // The growth front runs out along the template's paths: a branch beyond it folds back onto its base.
  float g=grow*uCrownD*1.02;vec3 c=position;float fr=1.;
  if(aP.x>g){fr=clamp((g-aS.w)/max(1e-4,aP.x-aS.w),0.,1.);c=mix(aS.xyz,c,fr);}
  // Level of detail: a twig shorter than a few pixels on screen folds away (no sub-pixel lace).
  vec4 mv0=viewMatrix*vec4(tA.xyz,1.);float pxw0=max(.05,-mv0.z)/(projectionMatrix[1][1]*uRes.y*.5);
  float lenPx=(aP.y-aS.w)*tA.w*S/pxw0;float lod=lvl>.01&&bud<.5?smoothstep(2.5,6.,lenPx):1.;c=mix(aS.xyz,c,lod);fr*=lod;
  // Every instance differs a little (a twist about its axis growing with the level); the finest tips breathe slowly.
  float tw=(tM.z-.5)*uTwist*lvl;float cs=cos(tw),sn=sin(tw);mat2 R=mat2(cs,-sn,sn,cs);
  c.xz=R*c.xz;vec3 oo=aO.xyz;oo.xz=R*oo.xz;
  c*=1.+uTipBreath*.06*sin(uV*.42+org*1.7+tM.z*6.283)*lvl*lvl*(1.-far);
  vec3 L=X*c.x*tB.w+Y*c.y+Z*c.z;vec3 P0=tA.xyz+L*tA.w;vec3 P=far>.5?P0:grown(P0,org);
  float dist=(tC.w+aP.x*tA.w)*S;
  vec4 o=uOrg[int(org)];
  vec4 st=far>.5?vec4(1.,1.,-1e5,0.):stateOf(tM.x),pu=far>.5?vec4(-1e5,0.,0.,-1e5):pulseOf(tM.x);vec4 lk=lookAt(st);float bl=blightOf(lk,pu);
  float tip=far>.5?lvl:clamp(max(dist/(max(1.,o.z)*.95),.15+.85*lvl),0.,1.);
  vec3 Cw=P+(far>.5?vec3(0.):sway(P,dist,org));Cw.y-=bl*.05*dist*smoothstep(.2,.8,tip);
  vec3 off=normalize(X*oo.x*tB.w+Y*oo.y+Z*oo.z);
  // Fine twigs keep about half a pixel of width (dimmed by the same factor) so they never shimmer.
  float rw=aO.w*tD.w*fr*tA.w*S*(1.-gone*.6)*(.4+.6*smoothstep(0.,1.,grow));vec4 mv=viewMatrix*vec4(Cw,1.);float pxw=-mv.z/(projectionMatrix[1][1]*uRes.y*.5);float rr=bud>.5?max(rw,pxw*.9*fr):max(rw,pxw*.5*lod);
  vec3 w=Cw+off*rr;vW=w;vN=off;vLook=vec4(lk.xy,bl,lk.w);vInfo=vec4(far>.5?0.:org,tip,dist,tM.z);vCS=vec2(cos(aA),sin(aA));
  vProf=vec3(0.,lvl,colour>.5?colour:-1.);vMat=0.;vThin=bud>.5?1.:clamp(rw/max(1e-5,rr),.2,1.);vFar=far;vPol=vec2(bud,lvl);
  vWave=far>.5?vec3(0.):waves(org,dist,bl,pu.w>-1e4?1.:0.)+touchAt(tM.x,dist,S);float pa=(uT-pu.x)/uSpeed;float front=pu.z+pa*5.5;
  vPulse=far>.5?0.:(pa>0.&&pa<5.&&pu.y<1.5?exp(-sq((dist-front)*1.3))*smoothstep(5.,3.,pa)*(pu.y>.5?.4:1.):0.)+st.w*(.55+.45*sin(uV*3.+dist*2.));
  vFront=grow<1.?exp(-sq((aP.x-g)*7.))*(1.-grow*.5):0.;vFront+=far>.5?0.:uOrgS[int(org)].z*.5;vHeal=far>.5?0.:healOf(pu);
  gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`;
export const SEG_FS=`${COMMON}${NOISE}
${VARY}
// Photophores: discrete points of living light along every branch (polyps on a sea fan, glands on a stem), in cells
// along the path distance, each at its own angle; denser and brighter toward the tips.
float photophore(float dist,float ang,float seed,float freq){float s=dist*freq+seed*17.;float cell=floor(s),f=fract(s);
  float r1=fract(sin(cell*12.9898+seed*78.233)*43758.5453),r2=fract(r1*91.7+.13);
  float da=abs(mod(ang-r1*6.2832+3.1416,6.2832)-3.1416);return exp(-sq((f-.5)*4.2)-sq(da*2.4))*step(r2,.62)*(.6+.8*fract(r1*13.1));}
void main(){
  vec3 n=normalize(vN);bool back=!gl_FrontFacing;if(back)n=-n;
  float org=vInfo.x,tip=vInfo.y,dist=vInfo.z,seed=vInfo.w;vec4 os=uOrgS[int(org)];
  // Crystal trees are faceted (flat shading).
  float facet=0.;if(os.x>.5&&os.x<1.5&&vFar<.5){vec3 cr=cross(dFdx(vW),dFdy(vW));if(dot(cr,cr)>1e-16){vec3 fn=normalize(cr);fn=dot(fn,cameraPosition-vW)<0.?-fn:fn;facet=1.-abs(dot(fn,n));n=fn;}}
  vec3 V=normalize(cameraPosition-vW);float ndv=abs(dot(n,V));float rim=pw(1.-ndv,2.);
  vec3 L=uLightDir,K=keyCol();
  vec3 oc=vProf.z>-.5?uPal[int(vProf.z)]:uOrgC[int(org)].rgb;vec4 lk=vLook;
  vec3 hue=distHue(satc(oc),vW);hue=mix(hue,mix(hue,vec3(.9,.95,1.),.45),lk.y);hue=mix(hue,vec3(.5,.16,.05),lk.z*.92);
  float ang=atan(vCS.y,vCS.x);
  if(vFar>.5){
    // Far giants: shapes in the haze only (no palette colour): their bases dissolve in the fog, their crowns catch the
    // light coming down through the water.
    vec3 hz=hazeAt(normalize(vW-cameraPosition));float hk=smoothstep(0.,22.,vW.y);float bk=pw(dot(-V,L)*.5+.5,3.);
    vec3 c=hz*(.8+.1*hk)+K*length(uFogLit)*(.02+.12*bk)*hk*(.4+.6*rim);
    // Only a suggestion of form: most of it is the water's own light.
    c=mix(hz,c,smoothstep(0.,.4,vW.y/30.)*.42);gl_FragColor=vec4(farFog(c,vW),1.);return;}
  float lvl=vPol.y,bud=vPol.x;
  // Light: the body is a dark, translucent volume lit by the key light (wrapped), glowing where the light comes through
  // it toward the eye (thin parts more), with a faint fill from above.
  float wrapd=clamp((dot(n,L)+.45)/1.45,0.,1.);float through=pw(dot(-V,L)*.5+.5,5.);float thin=.25+.75*smoothstep(.0,.8,tip);
  float breath=1.+uBreath*sin(uV*.7+org*2.3+dist*.15);float E=uLum*lk.x*breath*uOrgB[int(org)].x;
  float lit=1.-lk.z*.6;
  vec3 body=mix(K,hue,.45)*length(uFogLit);
  vec3 c=uBody*(.7+.6*wrapd)+body*(wrapd*wrapd*.28+max(0.,n.y)*.06+through*thin*(.4+rim)*.4)*lit;
  // Subsurface: the organism's own colour inside the body, strongest where the light passes through thin tissue.
  c+=hue*E*(through*thin*.06+rim*.025+.008)*lit;
  // Photophores (polyps, glands) and the polyp buds at the terminal twigs carry the light; the outer tenth glows most.
  float tipk=smoothstep(.72,1.,max(tip,lvl));float freq=os.x>2.5&&os.x<3.5?3.:9.;
  float spot=photophore(dist,ang,seed+org*.13,freq)*vThin*(.15+.85*smoothstep(.2,.7,tip));
  float nut=nutrient(dist,org)*(1.-lk.z);
  c+=hue*E*(spot*(.03+.5*tipk*tipk)*(1.+.6*nut)+bud*(1.1+.5*nut)+tipk*tipk*tipk*.04*vThin)*(1.-lk.z*.85);
  // Crystal: light caught along the facet edges, brighter toward the points.
  c+=hue*smoothstep(.04,.3,facet)*(.04+.5*tipk)*E*(1.-lk.z);
  // Ambient circulation: a slow swell of the water's colour through the tissue (never the hue, never a sharp front).
  c+=K*length(uFogLit)*nut*(.15+.35*thin)*(.5+uVeins);
  // Moss on old trunks (an organism's girth is its age and size): soft emissive specks on upward faces.
  if(tip<.3&&vMat>.05){float m=smoothstep(.15,.65,gnoise(vW*vec3(2.6,1.4,2.6)+seed));c+=satc(uPal[5])*m*max(0.,n.y+.35)*min(1.,vMat)*.08*uBark*(1.-tip*3.3)*(1.-lk.z);}
  // Gills: the underside of a cap glows (backfaces of the dome) with radial lamellae.
  if((vProf.x>.5&&vProf.x<1.5)||(vProf.x>2.5&&vProf.x<3.5)){float edge=1.-smoothstep(0.,.45,vProf.y);
    if(back){float g=pow(abs(sin(ang*16.)),5.);c=uBody+hue*(.08+g*.5)*E*(.4+.6*edge)+hue*vPulse;}
    else{float spots=smoothstep(.45,.75,gnoise(vW*4.+seed*9.));float stri=pw(abs(sin(ang*12.)),8.)*(1.-vProf.y);c=uBody*(.7+.6*wrapd)+K*length(uFogLit)*through*.5+hue*(.03+edge*.55+rim*.25+stri*.12)*E+hue*spots*.3*E*(1.-edge)+hue*vPulse*.6;}}
  else if(vProf.x>1.5&&vProf.x<2.5){c=uBody+hue*(rim*.5+pow(ndv,3.)*.2+.04+through*.3)*E+hue*vPulse;}
  // Blight: dull embers smoulder in the bark (never bright, never gold).
  if(lk.z>.01){float e=gnoise(vW*7.+vec3(0.,uV*.3,0.));c+=vec3(.4,.1,.03)*smoothstep(.55,.85,e)*lk.z*.08*(.6+.4*sin(uV*2.+seed));}
  c+=satc(uPal[5])*lk.w*(rim*.15+spot*.3);
  // Events: waves and pulses travel through the tissue and light the photophores on their way.
  c+=vWave*(.18+rim*.6+spot*1.6+bud)+hue*vPulse*(.25+rim*.9+spot*2.+bud)+vec3(.7)*vPulse*spot*.3;
  // A lasting bloom lights its neighbourhood.
  c+=bloomLight(vW)*(.08+.35*wrapd+spot+bud)*(1.-lk.z*.7);
  // The growth front leads bright (a new branch is never a dark pole); repaired tips keep a fresh green.
  c+=hue*vFront*1.4*uLum+satc(uPal[5])*vHeal*(spot+bud)*.5*uLum*(1.-lk.z);
  // Atmospheric perspective: organisms behind the anchor take on the water's colour (lower contrast, not darker).
  float B=uOrgB[int(org)].x;c=mix(c,hazeAt(-V)*.9,(1.-B)*.45*smoothstep(4.,14.,length(vW-cameraPosition)));
  gl_FragColor=vec4(fogMix(c,vW),1.);
}`;
// ---- Leaves, fronds, blades, blossoms, petals, buds: instanced quads bent along their axis --------------------------
export const LEAF_VS=`${COMMON}
attribute vec4 lP,lD,lW,lM;
varying vec2 vUv;varying vec3 vC,vW,vWave;varying vec4 vLook,vI;varying float vA;
void main(){
  float age=(uT-lW.z)/uSpeed;float shape=lW.y;float ms=shape>7.5?1.:shape>6.5?0.:shape;vec4 st=stateOf(lM.x),pu=pulseOf(lM.x);vec4 lk=lookAt(st);float bl=blightOf(lk,pu);
  // Buds open only on a repaired file (a lasting sign of the recovery); petals open over a few seconds.
  float open=shape>5.5?healOf(pu)*smoothstep(0.,1.4,age):smoothstep(0.,shape>4.5&&shape<5.5?2.4:1.4,age);float gone=lW.w<1e5?clamp((uT-lW.w)/uSpeed/2.2,0.,1.):0.;
  if(open<=0.||gone>=1.){gl_Position=vec4(2.,2.,2.,1.);return;}
  float S=orgScale(lM.y);vec3 base=grown(lP.xyz,lM.y);float bd=lP.w*S;vec3 a=base+sway(base,bd,lM.y);float size=lD.w*S*open*(1.-gone*.35);
  vec3 dir=lD.xyz;
  if(shape>4.5&&shape<5.5)dir=normalize(mix(vec3(0.,1.,0.),dir,smoothstep(0.,1.,age/3.)));
  // Ribbons stream with the current; blight curls leaves and lets them hang; shed leaves fall.
  if(ms<.5){dir=normalize(dir+vec3(uCur.x,0.,uCur.y)*.35);}
  dir.y-=bl*.9;dir=normalize(dir);
  float y=position.y+.5;float d2=bd+size*y;
  vec3 pr=base+dir*size*y;
  if(ms<.5){pr+=vec3(uCur.x,.0,uCur.y)*size*.25*y*y;pr.y-=size*.1*y*y;}
  if(ms>.5&&ms<1.5){pr.y-=size*.16*y*y;}
  vec3 p=pr+sway(pr,d2,lM.y);p.y-=gone*gone*3.;
  if(ms<.5){p+=vec3(-uCur.y,0.,uCur.x)*sin(uSwayT*1.7+y*5.+lM.z*20.)*size*.07*y;}
  vec3 axis=normalize(p-a+1e-4*dir);vec3 V=normalize(cameraPosition-p);vec3 side=normalize(cross(axis,V)+vec3(1e-4,0.,0.));
  float width=lW.x*size*(1.-bl*.55);
  if(shape>1.5&&shape<2.5){side=normalize(cross(V,vec3(0.,1.,0.))+1e-4);vec3 up=cross(side,V);p=a+dir*size*.3+(side*position.x+up*(position.y))*size*.9;}
  else p+=side*position.x*width;
  vW=p;vUv=vec2(position.x+.5,y);
  float ci=lM.w;vec3 kc=ci<.5?uOrgC[int(lM.y)].rgb:uPal[int(ci)];vC=kc;vLook=vec4(lk.xy,bl,lk.w);vI=vec4(shape,lM.z,lM.y,st.w);
  vA=smoothstep(0.,.35,age)*(1.-gone)*(shape>5.5?open:1.);vWave=waves(lM.y,d2,bl,pu.w>-1e4?1.:0.)+touchAt(lM.x,d2,S);
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
export const LEAF_FS=`${COMMON}
varying vec2 vUv;varying vec3 vC,vW,vWave;varying vec4 vLook,vI;varying float vA;
// Masks return (coverage, edge): the edge is a thin band inside the outline that glows (translucent rims).
vec2 mask(vec2 uv,float shape){vec2 p=uv-vec2(.5);float y=uv.y;float w;
  if(shape<.5){w=.42*smoothstep(0.,.1,y)*pw(1.-y,.45)*(1.+.07*sin(y*13.)+.03*sin(y*31.));}
  else if(shape<1.5){float lobes=.62+.38*abs(sin(y*3.1416*3.5));w=.5*pw(sin(3.1416*pw(y,.8)),.9)*lobes;}
  else if(shape<2.5){vec2 q=(uv-.5)*2.;float a=atan(q.x,q.y);float r=length(q);float pet=.6+.4*cos(a*5.);return vec2(smoothstep(pet,pet-.12,r),smoothstep(pet-.3,pet-.1,r)*smoothstep(pet,pet-.08,r));}
  else if(shape>4.5&&shape<5.5){w=.5*pw(sin(3.1416*pw(y,.55)),1.3)*(1.-.08*pw(abs(sin(y*6.28)),4.));}
  else w=.48*sin(3.1416*pw(y,.8));
  float x=abs(p.x);return vec2(smoothstep(w,w*.8,x),smoothstep(w*.45,w*.85,x)*smoothstep(w,w*.86,x));}
void main(){float shape=vI.x;float ms=shape>7.5?1.:shape>6.5?0.:shape;vec2 m=mask(vUv,ms);if(m.x<.02)discard;vec4 lk=vLook;
  vec3 hue=distHue(satc(vC),vW);hue=mix(hue,mix(hue,vec3(.9,.95,1.),.4),lk.y*.6);hue=mix(hue,vec3(.36,.13,.04),lk.z*.85);
  vec3 V=normalize(cameraPosition-vW),K=keyCol();float through=pw(dot(-V,uLightDir)*.5+.5,5.);
  float vein=pw(1.-abs(vUv.x-.5)*2.,14.);float tipG=pw(vUv.y,1.6);float breath=1.+uBreath*sin(uV*.9+vI.y*30.);
  float E=uLum*lk.x*breath*uOrgB[int(vI.z)].x;
  // Translucent tissue: dark where it faces away from the light, glowing where the light passes through it.
  vec3 c=hue*(.02+.18*tipG+m.y*.4+vein*(.1+.3*tipG)+through*.12)*E+K*length(uFogLit)*through*.35;
  if(shape>1.5&&shape<2.5){float r=length(vUv-.5)*2.;c=hue*(.2+m.y*.8)*(1.2-r*.6)*E+satc(uPal[4])*exp(-r*7.)*.4*uLum;}
  // Bloom petals: a translucent body, a luminous margin and fine ribs; brightest toward the tip.
  if(shape>4.5&&shape<5.5){float rib=pw(abs(sin((vUv.x-.5)*30.)),6.)*.3;c=hue*(.03+.22*tipG+rib*tipG*.5+m.y*.9+vein*.35+through*.3)*uLum*breath;}
  // Kelp blades: a translucent ribbon body, a softly ruffled glowing margin and fine parallel veins.
  if(ms<.5){float lines=pw(abs(sin((vUv.x-.5)*18.)),10.)*.25;float ruff=.6+.4*sin(vUv.y*20.+vI.y*30.);c=hue*(.05+.1*tipG+m.y*(.45+.3*ruff)+lines*(.2+tipG*.5)+vein*.2+through*.25)*E+K*length(uFogLit)*through*.5;}
  c+=satc(uPal[5])*lk.w*.2*tipG+vWave*(.4+vein+m.y)+hue*vI.w*.4+bloomLight(vW)*(.3+m.y);
  float a=m.x*vA*(ms<.5?.34+.45*m.y:shape>4.5&&shape<5.5?.22+.55*m.y:.7)*(.75+.5*uTrans);
  gl_FragColor=vec4(fogMix(c,vW),a);}`;
// ---- Glows: symbol tips, bladders, sori, the light under caps, organism halos, seeds (additive sprites) -------------
export const GLOW_VS=`${COMMON}
attribute vec4 gP,gG,gM;
varying vec3 vC;varying float vA,vK,vS;
void main(){
  float age=(uT-gG.z)/uSpeed;float on=smoothstep(0.,1.,age);float gone=gG.w<1e5?clamp((uT-gG.w)/uSpeed/1.6,0.,1.):0.;
  vec4 st=stateOf(gM.x),pu=pulseOf(gM.x);
  // Fresh polyps (kind 8) open only on a repaired file: a lasting sign of the recovery.
  if(gG.y>7.5&&gG.y<8.5)on*=healOf(pu);
  if(on<=0.||gone>=1.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}
  float S=orgScale(gM.y);vec3 p0=grown(gP.xyz,gM.y);vec3 p=p0+sway(p0,gP.w*S,gM.y);vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  vec4 lk=lookAt(st);float bl=blightOf(lk,pu);
  float ci=gM.w;vec3 kc=ci<.5?uOrgC[int(gM.y)].rgb:uPal[int(ci)];vec3 hue=mix(distHue(satc(kc),p),vec3(.4,.14,.05),bl*.9);
  float pulse=nutrient(gP.w*S,gM.y);float breath=1.+uBreath*1.4*sin(uV*.8+gM.z*40.);
  vec3 wv=waves(gM.y,gP.w*S,bl,pu.w>-1e4?1.:0.)+touchAt(gM.x,gP.w*S,S);
  float halo=step(5.5,gG.y)*step(gG.y,6.5),seed=step(6.5,gG.y)*step(gG.y,7.5),floret=step(8.5,gG.y);
  float B=gM.x<-1.5?1.:uOrgB[int(gM.y)].x;
  vC=hue*(.5+.25*pulse)*mix(uLum*B,min(uLum,1.1)*.4*B,halo)*lk.x*breath+(wv*1.2+hue*st.w*1.2)*(1.-halo*.9);
  if(seed>.5)vC=satc(mix(uOrgC[int(gM.y)].rgb,uPal[4],.3))*2.2*uLum;
  // Bloom florets: a slow shimmer runs out along the spiral (ambient, never a burst).
  if(floret>.5)vC=hue*uLum*(1.1+.35*sin(uV*.6-gM.z*9.))+wv;
  float px=projectionMatrix[1][1]*uRes.y*.5;
  gl_PointSize=clamp(gG.x*S*on*(1.-gone*.5)*px/max(.3,-mv.z),1.5,(halo>.5?300.:seed>.5?160.:56.)*uPx);vA=(1.-gone)*on*(1.-bl*.75)*(1.-fogAmount(p)*(halo>.5?.6:.85));vK=gG.y;vS=gM.z;}`;
export const GLOW_FS=`${COMMON}
varying vec3 vC;varying float vA,vK,vS;
void main(){vec2 q=(gl_PointCoord-.5)*2.;float r=length(q);if(r>1.)discard;float g;
  if(vK<.5){g=exp(-r*r*22.)*1.1+exp(-r*4.)*.08;}
  else if(vK<1.5){g=exp(-r*r*18.)*1.+exp(-r*5.)*.12;}
  else if(vK<2.5){g=smoothstep(.55,.45,r)*(.1+.6*smoothstep(.2,.52,r))+exp(-r*5.)*.12;}
  else if(vK<3.5){g=exp(-r*r*24.)*1.1+exp(-r*6.)*.08;}
  else if(vK<4.5){float x=pow(max(0.,1.-abs(q.x)*9.),3.)*pw(1.-abs(q.y),2.)+pow(max(0.,1.-abs(q.y)*9.),3.)*pw(1.-abs(q.x),2.);g=exp(-r*r*20.)*1.2+x*.4+exp(-r*4.)*.1;}
  else if(vK<5.5){g=exp(-r*r*3.)*.1;}
  else if(vK<6.5){g=exp(-r*r*3.)*.16+exp(-r*r*12.)*.06;}
  else if(vK<7.5){g=exp(-r*r*14.)*1.2+exp(-r*3.)*.2;}
  else if(vK<8.5){g=exp(-r*r*16.)*1.+exp(-r*5.)*.1;}
  else{g=exp(-r*r*10.)*1.1+exp(-r*4.)*.15;}
  gl_FragColor=vec4(vC*g*vA,1.);}`;
// ---- Light shafts: long soft sheets slanting down from the light, drifting slowly (additive) ------------------------
export const SHAFT_VS=`${COMMON}
uniform float uShaftL;attribute vec4 sP;varying vec2 vUv;varying float vA,vSeed;
void main(){float y=position.y+.5;vec3 L=normalize(uLightDir);
  float drift=sin(uV*.013+sP.w*6.)*sP.z*.8;vec3 base=vec3(sP.x+drift*uLightDir.z,0.,sP.y-drift*uLightDir.x);
  vec3 p=base+L*y*uShaftL;vec3 V=normalize(cameraPosition-p);vec3 side=normalize(cross(L,V));p+=side*position.x*sP.z*(.7+.6*y);
  vUv=vec2(position.x+.5,y);vSeed=sP.w;float d=length(cameraPosition-p);
  vA=(.55+.45*sin(uV*.05+sP.w*11.))*smoothstep(0.,.25,y)*smoothstep(1.,.55,y)*smoothstep(1.5,5.,d);
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
export const SHAFT_FS=`${COMMON}
uniform float uShaftK;varying vec2 vUv;varying float vA,vSeed;
void main(){float x=abs(vUv.x-.5)*2.;float core=exp(-x*x*3.5);float streak=.65+.35*sin(vUv.x*19.+vSeed*30.+uV*.04);
  gl_FragColor=vec4(uFogLit*core*streak*vA*uShaftK,1.);}`;
// ---- Columns of light (a checkpoint: committed growth sends a slow column of light and spores up into the water) ----
export const PILLAR_VS=`${COMMON}
uniform vec4 uCol[6],uColC[6];attribute float pK;varying vec2 vUv;varying vec3 vC;varying float vA;
void main(){int k=int(pK);vec4 A=uCol[k],C=uColC[k];float age=(uT-A.z)/uSpeed;
  if(age<0.||age>A.w){gl_Position=vec4(2.,2.,2.,1.);return;}
  float y=position.y+.5;float h=C.w*4.5;vec3 base=vec3(A.x,0.,A.y);vec3 p=base+vec3(0.,y*h,0.);
  vec3 V=normalize(cameraPosition-p);vec3 side=normalize(cross(vec3(0.,1.,0.),V));p+=side*position.x*C.w*(.35+.25*y);
  float rise=age/A.w;vUv=vec2(position.x+.5,y);vC=C.rgb;
  vA=smoothstep(0.,.12,rise)*(1.-smoothstep(.55,1.,rise))*smoothstep(min(1.,rise*1.6)+.05,min(1.,rise*1.6)-.25,y)*smoothstep(0.,.08,y);
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
export const PILLAR_FS=`${COMMON}
varying vec2 vUv;varying vec3 vC;varying float vA;
void main(){float x=abs(vUv.x-.5)*2.;float core=exp(-x*x*9.)+exp(-x*x*2.)*.3;float fil=.7+.3*sin(vUv.y*40.-uV*3.+vUv.x*9.);
  gl_FragColor=vec4(vC*core*fil*vA,1.);}`;
// ---- Ground: near-black moss and fungal terrain, coloured pools of light under the organisms, fine hyphae from the
// roots, caustics where the shafts reach the floor ----------------------------------------------------------------
export const GROUND_VS=`uniform float uScale;uniform vec2 uCentre;varying vec3 vW;void main(){vec3 p=vec3(uCentre.x+position.x*uScale,0.,uCentre.y-position.y*uScale);vW=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
export const CAUSTIC=`
// Caustics: two drifting ridge networks of value noise; where they cross the light gathers.
float caustic(vec2 p,float t){vec2 w=vec2(vnoise(p*.5+vec2(t*.07,0.)),vnoise(p*.5+vec2(3.1,-t*.06)));p+=w*.8;
  float a=1.-abs(vnoise(p+vec2(t*.11,t*.05))),b=1.-abs(vnoise(p*1.43+vec2(5.2-t*.08,t*.09)));return pw(a,7.)*.55+pw(b,7.)*.45+pw(a*b,3.)*.6;}
`;
export const GROUND_FS=`${COMMON}${CAUSTIC}
uniform int uOrgN;uniform vec3 uMoss,uWeb;uniform vec4 uRipple[6],uRippleC[6],uUnlock;uniform float uWebK,uTideK,uCaustK;
varying vec3 vW;
void main(){vec2 p=vW.xz;
  float n1=vnoise(p*.06+3.7)*.7;float n2=vnoise(p*.9+1.3)*.7;
  // Light from the organisms pools on the ground in their colours; hyphae radiate from the nearest root.
  float near=0.;vec3 pool=vec3(0.);float best=1e9;vec2 bd=vec2(1.,0.);float bR=1.,bi=0.;
  for(int i=0;i<MAXO;i++){if(i>=uOrgN)break;vec4 o=uOrg[i];float R=max(1.2,o.z*.45);vec2 dp=p-o.xy;float d=length(dp);
    float k=exp(-d*d/(R*R*1.3));near+=k;pool+=satc(uOrgC[i].rgb)*(exp(-d*d/(R*R*.3))*.035+k*.012)*(.7+.3*min(2.,o.w))*(1.+uOrgS[i].z*3.);
    if(d/R<best){best=d/R;bd=dp;bR=R;bi=float(i);}}
  near=min(near,1.4);float d=length(bd),a=atan(bd.y,bd.x+1e-5);
  float wob=vnoise(bd*.55+bi*7.3)*1.7;
  float fil=pow(abs(sin(a*7.+wob+d*.22)),110.)*exp(-d/(bR*.9))+pow(abs(sin(a*17.+wob*1.7+d*.6+1.3)),180.)*exp(-d/(bR*.5))*.8;
  fil*=smoothstep(.15,.6,d)*uRoots;
  // Sediment: soft ripples of sand and silt (lit only by the water's light and the organisms' pools).
  float rip=.5+.5*sin(dot(p,vec2(.83,.55))*2.6+n1*5.+vnoise(p*.35)*2.);float sed=.55+.3*n1+.12*n2+.18*rip*(.5+.5*n2);
  vec3 c=uBody*sed;
  float breath=1.+uBreath*sin(uV*.5+n1*4.);
  float speck=smoothstep(.6,.95,n2)*smoothstep(.1,.9,near);
  c+=pool*breath*(.7+.5*rip)+satc(uMoss)*(speck*.025*breath);
  float flow=.6+.6*sin(uV*.5*uFlow-d*1.3+bi);
  vec3 hc=mix(satc(uOrgC[int(bi)].rgb),uWeb,.35);c+=hc*fil*.04*uWebK*flow*breath;
  // Where the shafts reach the floor the caustic net plays over the sediment (only there).
  vec2 q=p-uLightDir.xz/max(.2,uLightDir.y)*2.;float sh=smoothstep(.55,.95,sin(q.x*.21+uV*.02)*sin(q.y*.17-uV*.015)*.5+.5+.25*sin((q.x+q.y)*.43));
  float fade=exp(-length(vW-cameraPosition)*.025);
  float cs=uCaustK>0.?caustic(p*.55,uV*.6):0.;
  c+=uFogLit*sh*(.03+cs*.16*uCaustK)*(.6+.4*rip)*fade;
  float tide=uUnlock.w*exp(-sq(mod(length(p-uOrg[0].xy)*.12-uV*.06,1.)-.5)*30.)*.5;c+=uWeb*tide*(fil*3.+speck*.5+.03)*uTideK;
  for(int i=0;i<6;i++){float age=(uT-uRipple[i].w)/uSpeed;if(age<0.||age>uRippleC[i].w)continue;float r=age*2.8;float dd=distance(p,uRipple[i].xz);
    float ring=exp(-sq((dd-r)*1.1))+.35*exp(-sq((dd-r*.7)*1.6));c+=uRippleC[i].rgb*ring*(1.-age/uRippleC[i].w)*(.1+fil*1.4+speck*.5);}
  // Toward the horizon the floor dissolves into the same haze as the sky (no seam).
  vec3 e=normalize(vW-cameraPosition);gl_FragColor=vec4(mix(fogMix(c,vW),hazeAt(e),smoothstep(-.07,-.005,e.y)),1.);}`;
// ---- Background: the water / night air beyond the fog. Abyss: the rippling surface far above, bright where the light
// comes through it (Snell's window), caustic ripples crossing it; forest floor: a deep night sky with a veiled moon;
// cavern: a dark vault. ------------------------------------------------------------------------------------------
export const SKY_FS=`${COMMON}${NOISE}${CAUSTIC}
varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam,uTop,uSun;uniform float uShafts,uAbyss,uSurface,uTerrain;uniform vec4 uUnlock;
void main(){vec4 q=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(q.xyz/q.w-uCam);float h=d.y;
  float s=max(0.,dot(d,uLightDir));
  vec3 c=hazeAt(d)+uTop*smoothstep(.0,.7,h);
  if(uTerrain<.5){
    // The surface: a plane far above; its ripples carry caustic light, brightest in the window around the light.
    float t=(uSurface-uCam.y)/max(.04,h);vec2 hit=uCam.xz+d.xz*t;float dist=t*max(.04,h)/max(.04,h);
    float fade=exp(-t*.006)*smoothstep(.03,.25,h);
    float cs=caustic(hit*.045,uV*.5);float win=pw(s,4.);
    c+=uTop*(.35+1.4*cs)*fade*(.5+2.2*win)+uSun*(pw(s,12.)*.06+pw(s,60.)*.22+pw(s,500.)*.35)*smoothstep(-.05,.2,h);
    // A fan of beams under the window.
    vec3 ax=normalize(cross(uLightDir,vec3(0.,1.,0.))+1e-4);vec3 ay=cross(ax,uLightDir);float ang=atan(dot(d,ay),dot(d,ax));
    float fan=pow(max(0.,gnoise(vec3(ang*2.6,uV*.02,1.))*.5+.5),3.)*1.2+pow(max(0.,gnoise(vec3(ang*7.,uV*.03,4.))*.5+.5),5.)*.7;
    c+=uFogLit*fan*pow(s,1.5)*uShafts*.4*smoothstep(.02,.35,h);
  }else if(uTerrain<1.5){
    // Night air: a veiled moon and the faint glow of the canopy-high mist.
    c+=uSun*(pw(s,300.)*.6+pw(s,40.)*.12+pw(s,8.)*.03)*smoothstep(-.05,.1,h);
    float veil=smoothstep(.1,.7,fbm3(vec3(d.x*3.,d.y*6.-uV*.01,d.z*3.)))*smoothstep(.05,.5,h);c+=uFogLit*veil*.08*(.4+pw(s,3.));
  }else{
    // A vault: darkness overhead, a faint glow seeping through a fissure toward the light.
    float fis=pw(1.-abs(gnoise(vec3(d.xz/max(.2,h)*.8,uV*.01))),14.)*smoothstep(.15,.6,h);c+=uFogLit*fis*.25*(.3+pw(s,2.));
  }
  c=mix(c,hazeAt(d),smoothstep(.0,-.02,h));
  if(uUnlock.z>0.){float veil=uUnlock.z*smoothstep(.1,.6,fbm3(vec3(d.x*4.,d.y*7.-uV*.03,d.z*4.)))*smoothstep(.12,.55,h);c+=satc(uPal[3])*veil*.05;}
  gl_FragColor=vec4(c,1.);}`;
// ---- Digital life (only when the recipe has it on: these strings are never part of a world without life) -----------
// The organisms answer the ecology living among them, never with new structure and never with a flash:
//  - a head visited by a gathering of pollinators glows: its photophores, buds and leaves near the head (not the
//    trunk, not the organism's other head) brighten with its visitors, with a slow attack and release (the site's glow, about 4 s), with a soft
//    shimmer; a lasting attractor keeps a steady part of that glow; its halo in the water swells with it;
//  - where pollinators pass, their trail lights the photophores at the tips a little (local illumination);
//  - on the floor the trail field lights the hyphae and the bioluminescent specks faintly where it forms a ridge: the
//    paths the pollinators lay between crowns (which others follow) show as a soft glowing thread that fades as the
//    trail decays.
const LIFE_DECL=`uniform sampler2D uLifeF;uniform vec4 uLifeO[MAXO],uLifeC[MAXO],uLifeD[MAXO],uLifeB;uniform float uLifeK;
vec4 lifeField(vec3 w){vec2 u=(w.xz-uLifeB.xy)/uLifeB.zw;return texture2D(uLifeF,clamp(u,0.,1.));}
// A soft falloff from a head's centre (xyz, reach w; none when w is 0).
float lifeFall(vec4 c,vec3 p){vec3 d=p-c.xyz;return c.w>0.?exp(-dot(d,d)/(c.w*c.w*2.4+.3)):0.;}
// How much of an organism's glow reaches this point: each of its (one or two) heads lights its own surroundings with
// its own visitors (uLifeO: glow of the first head, lasting, glow of the second, strain).
float lifeLight(float org,vec3 p){int i=int(org);vec4 o=uLifeO[i];return (o.x+o.y*.35)*lifeFall(uLifeC[i],p)+(o.z+o.y*.35)*lifeFall(uLifeD[i],p);}
float lifeGlow(float org){vec4 o=uLifeO[int(org)];return max(o.x,o.z)+o.y*.35;}`;
const SEG_ANCHOR='  // Atmospheric perspective: organisms behind the anchor';
const SEG_LIFE=`  {float g=lifeLight(org,vW)*smoothstep(.35,.85,tip);float sh=.78+.22*sin(uV*1.3+dot(vW,vec3(2.1,1.7,2.3)));
    float loc=lifeField(vW).r*smoothstep(.55,1.,tip);
    c+=hue*uLum*uLifeK*(spot*(g*2.6*sh+loc*.5)+bud*g*1.5+g*.1*sh)*(1.-lk.z*.85);}
`;
const LEAF_ANCHOR='  float a=m.x*vA*';
const LEAF_LIFE=`  {float g=lifeLight(vI.z,vW);c+=hue*uLum*uLifeK*g*(m.y*.8+vein*.45+tipG*.4)*(1.-lk.z);}
`;
const GLOW_ANCHOR='vA=(1.-gone)*on*(1.-bl*.75)';
const GROUND_ANCHOR='  // Where the shafts reach the floor the caustic net plays over the sediment (only there).';
// The floor shows the trail as threads, not pools: only where the trail stands above its surroundings (a ridge: a path
// laid between crowns), not over the broad wash around a busy trunk.
const GROUND_LIFE=`  {vec2 lu=(vW.xz-uLifeB.xy)/uLifeB.zw,le=vec2(1.5/64.);float t0=texture2D(uLifeF,clamp(lu,0.,1.)).r;
    float ta=.25*(texture2D(uLifeF,clamp(lu+vec2(le.x,0.),0.,1.)).r+texture2D(uLifeF,clamp(lu-vec2(le.x,0.),0.,1.)).r+texture2D(uLifeF,clamp(lu+vec2(0.,le.y),0.,1.)).r+texture2D(uLifeF,clamp(lu-vec2(0.,le.y),0.,1.)).r);
    float tr=smoothstep(.15,.8,t0)*smoothstep(.05,.45,(t0-ta)/(t0+.04));c+=hc*uLifeK*tr*(fil*.55+speck*.35+.012)*(.75+.25*sin(uV*.7+n1*6.));}
`;
export function withLife(src,kind){
  const head=src.replace(COMMON,COMMON+LIFE_DECL);
  const put=(anchor,text)=>{if(!head.includes(anchor))throw new Error(`life: ${kind} anchor`);return head.replace(anchor,text+anchor);};
  if(kind==='seg')return put(SEG_ANCHOR,SEG_LIFE);
  if(kind==='leaf')return put(LEAF_ANCHOR,LEAF_LIFE);
  if(kind==='ground')return put(GROUND_ANCHOR,GROUND_LIFE);
  if(kind==='glow'){if(!head.includes(GLOW_ANCHOR))throw new Error('life: glow anchor');
    // The halo swells with the crown's visitors; the crown's own glows (florets, tips) brighten a little.
    // (The halo only a little: the life lights the crown, not a disc in the water.)
    return head.replace(GLOW_ANCHOR,`vA=(1.+uLifeK*(halo*.8*lifeGlow(gM.y)+(1.-halo)*.9*lifeLight(gM.y,p)))*(1.-gone)*on*(1.-bl*.75)`);}
  return head;
}
// Inhabitants: soft points (authoritative entities and their followers) and screen-space ribbons along their trails,
// additive, depth-tested against the organisms (a pollinator behind a trunk is hidden by it).
export const LIFE_PT_VS=`${COMMON}
attribute vec4 lC,lS;varying vec3 vC;varying float vK;
void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float px=projectionMatrix[1][1]*uRes.y*.5;float z=max(.3,-mv.z);
  float s=lS.x*px/z;float ps=clamp(s,1.4*uPx,18.*uPx);
  vC=lC.rgb*lC.a*min(1.,s*s/(ps*ps)+.4)*(1.-fogAmount(position)*.85)*smoothstep(.4,1.8,z);gl_PointSize=ps;vK=lS.y;}`;
// Pollinators (kind 0): a warm white core in a halo of their hue (the core is as bright as the halo's strongest
// channel, so it stands above any crown whatever its colour).
export const LIFE_PT_FS=`varying vec3 vC;varying float vK;
void main(){vec2 q=gl_PointCoord-.5;float r=dot(q,q)*4.;if(r>1.)discard;
  if(vK<.5){vec3 w=vec3(max(vC.r,max(vC.g,vC.b)))*vec3(1.,.95,.86);gl_FragColor=vec4(vC*exp(-r*4.5)*.4+mix(vC,w,.9)*(exp(-r*11.)*1.5+exp(-r*40.)*1.2),1.);return;}
  float g=vK>2.5?exp(-r*2.6)*.7+exp(-r*14.)*.5:exp(-r*7.)+exp(-r*26.)*1.3;gl_FragColor=vec4(vC*g,1.);}`;
export const LIFE_RIB_VS=`${COMMON}
attribute vec4 rA,rB,rC;varying vec3 vC;varying float vSide;
void main(){vec4 ca=projectionMatrix*viewMatrix*vec4(rA.xyz,1.),cb=projectionMatrix*viewMatrix*vec4(rB.xyz,1.);
  vec2 d=(cb.xy/max(cb.w,1e-3)-ca.xy/max(ca.w,1e-3))*uRes;vec2 n=normalize(vec2(-d.y,d.x)+1e-6);
  bool e=position.y>.5;vec4 cp=e?cb:ca;vec3 p=e?rB.xyz:rA.xyz;float z=max(.3,cp.w);float px=projectionMatrix[1][1]*uRes.y*.5;
  float w=clamp(rC.w*px/z,.7*uPx,4.*uPx);cp.xy+=n*position.x*w/uRes*2.*cp.w;gl_Position=cp;vSide=position.x;
  // A segment long on screen (an inhabitant passing close to the camera) fades, so no tail reads as a streak.
  vC=rC.rgb*(e?rB.w:rA.w)*(1.-fogAmount(p)*.85)*smoothstep(.4,1.8,z)*min(1.,rC.w*px/z/(.7*uPx))*min(1.,70.*uPx/max(length(d),1.));}`;
export const LIFE_RIB_FS=`varying vec3 vC;varying float vSide;void main(){float e=1.-vSide*vSide;gl_FragColor=vec4(vC*e*e,1.);}`;

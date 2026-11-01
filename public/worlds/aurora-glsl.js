// Aurora's shaders (preview). Design brief: docs/worlds/aurora.md. Every surface also draws into the reflection (the
// scene mirrored in the ice, uMirror -1): positions are mirrored in their vertex shaders, so one material serves both.
import {BOW} from './aurora-layout.js';
// ---- The curtains ---------------------------------------------------------------------------------------------------
// One mesh for every curtain: per vertex its curtain (k), its place along it (u, -1..1) and up it (v, a share of its
// height). A curtain's row of the parameter texture uCP (aurora.js writeCurtains):
//   0: centre x, z; trace direction dx, dz      1: half-length, lower edge's altitude, height, seed
//   2: brightness, kindle, kind (0 a line, 1 the corona's ring), fold depth   3: lower colour, flicker
//   4: fringe colour, fringe strength           5: the ring's radius, the ring's centre x, z, its rays' convergence
// FOLD is the JS twin of aurora-layout.js foldAt (they must agree): the bow of the trace, three folds of the sheet (the
// third's depth grows with the work), and the bars' ripples running along it (uRip: start, depth, direction).
const FOLD=`
uniform vec3 uA;uniform vec4 uRip[4];uniform float uV;
float fold(float s,float u,float h,float sd,float kf){
  float d=uA.x*sin(s*.0105+sd*6.2832+uV*.031+h*.0005)+uA.y*sin(s*.029-sd*11.7-uV*.083+h*.0012)+uA.z*sin(s*.071+sd*3.1+uV*.41+h*.0021);
  for(int k=0;k<4;k++){vec4 R=uRip[k];if(R.y<=0.)continue;float age=uV-R.x,x=u*R.z-(-1.3+age*.42);d+=R.y*exp(-x*x/.045)*sin(age*2.6+u*5.)*exp(-age*.32);}
  return s*s*${BOW.toExponential(6)}+kf*d*(1.-.6*smoothstep(.55,1.,abs(u)));}`;
export const CURTAIN_VS=`
attribute vec3 aC;uniform highp sampler2D uCP;uniform sampler2D uRay;uniform float uMirror,uNK;uniform vec3 uMag;
${FOLD}
varying vec3 vW;varying vec2 vS;varying float vK,vEdge,vH,vSd;varying vec3 vLo,vHi;varying vec4 vP,vQ;
vec4 cp(int k,int j){return texelFetch(uCP,ivec2(j,k),0);}
vec3 trace(vec4 T0,vec4 T1,vec4 T2,vec4 T5,float s,float u,float h){
  if(T2.z<.5){float d=fold(s,u,h,T1.w,T2.w);return vec3(T0.x+T0.z*s+T0.w*d,T1.y,T0.y+T0.w*s-T0.z*d);}
  // the corona's ring: folds run around it, radially
  // (barely folded: from below, radial folds read as a crown of teeth; its edge comes from its rays instead)
  float a=u*3.14159265,d=fold(s*2.3,u,h,T1.w,T2.w)-s*s*5.29*${BOW.toExponential(6)};float r=T5.x+d*.04;return vec3(T5.y+cos(a)*r,T1.y,T5.z+sin(a)*r);}
void main(){
  int k=int(aC.x+.5);vec4 T0=cp(k,0),T1=cp(k,1),T2=cp(k,2),T3=cp(k,3),T4=cp(k,4),T5=cp(k,5);
  vK=aC.x;vSd=T1.w;vP=vec4(T2.x,T2.y,T1.x,T1.z);vQ=vec4(T3.w,T4.w,T2.z,T5.w);vLo=T3.rgb;vHi=T4.rgb;
  // an unlit curtain draws nothing (its vertices leave the frame)
  if(T2.x<=0.){gl_Position=vec4(2.,2.,2.,1.);vW=vec3(0.);vS=vec2(0.);vEdge=0.;vH=0.;vSd=0.;return;}
  // the strip reaches only as high as its column's rays (no light, and no fill, above them)
  float topc=textureLod(uRay,vec2(aC.y*.5+.5,(aC.x+.5)/uNK),0.).x*1.5*T2.y;
  float vv=-.03+(aC.z+.07)/1.42*(min(topc*1.07+.03,1.35)+.03);
  float u=aC.y,s=u*T1.x,H=T1.z,h=vv*H;
  vec3 b=trace(T0,T1,T2,T5,s,u,h),b2=trace(T0,T1,T2,T5,s+2.5,u+2.5/max(T1.x,1.),h);
  // the corona's rays converge on the magnetic zenith; a line's run along the field
  vec3 up=uMag,p=b+up*h;
  // seen edge-on (a fold turned toward the shore), the sheet is brighter: the line of sight runs through more of it
  vec3 tg=normalize(vec3(b2.x-b.x,0.,b2.z-b.z)+1e-5),n=normalize(cross(tg,up)),V=normalize(p-cameraPosition);
  float c=abs(dot(n,V));vEdge=mix(1.,1./max(c,.2),.5);
  vS=vec2(u,vv);vH=h;vW=p;
  p.y*=uMirror;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
// The light of a curtain: a sharp, bright lower edge (a fine border line just above it), the green fading upward into the
// fringe colour (violet to magenta) toward the top, fine rays along the field (two drifting striations whose share
// shifts with the work's activity, flickering), the files' own rays (uRay g) up to their heights (uRay r), their storm (b:
// the warning colour, a ragged lower edge, a faster flicker), their ignition (uRayB: a pulse running up the ray in its
// colour), the effects' patches and waves, the music's shimmer and surge. Additive, linear HDR.
export const CURTAIN_FS=`
uniform sampler2D uRay,uRayB,uStri,uNoise;uniform float uNK,uFast,uRayK,uFringeK,uEdgeK,uEighth,uMirror,uStormK,uFlash;uniform vec2 uSurge;uniform vec3 uWarn,uValid,uWhite;
uniform vec4 uE[8],uEF[8];uniform float uNE,uV;
varying vec3 vW;varying vec2 vS;varying float vK,vEdge,vH,vSd;varying vec3 vLo,vHi;varying vec4 vP,vQ;
void main(){
  float row=(vK+.5)/uNK,su=vS.x*.5+.5;vec4 A=texture(uRay,vec2(su,row));A.x*=1.5;A.y*=2.;
  float s=vS.x*vP.z,x0=vS.y,storm=A.z*uStormK;
  // rays: discrete rays along the trace (world units) drifting slowly, and a finer, faster set (the other way) that takes
  // a larger share as the work quickens; broad bands vary their strength along the curtain but never fill the gaps
  // between them: between two rays the sky shows through
  // (the corona's ring, overhead and near, has its rays twice as dense)
  float ring=step(.5,vQ.z),sr=s*(1.+ring);
  vec4 S1=texture(uStri,vec2(sr*.0021+uV*.0012+vSd*7.,.5));float r2=texture(uStri,vec2(sr*.0047-uV*.0031+vSd*3.,.5)).g;
  float rays=mix(S1.r,r2,.3+.4*uFast)*(.5+.6*S1.b),R=smoothstep(.07,.66,rays);
#ifdef MIRROR
  float fl=.5;
#else
  // the rays flicker along their length: brighter knots rising and falling along the field
  float fl=texture(uNoise,vec2(s*.0031+vSd*5.,x0*.9-uV*(.05+.09*uFast+.25*storm))).x;
#endif
  // the corona's ring has no sheet at its foot: its rays start at irregular heights and dissolve downward
  float n2=.5;
  if(ring>0.){float n1=texture(uNoise,vec2(s*.0013+vSd*2.,.61)).y;n2=texture(uNoise,vec2(s*.0061+vSd,.23)).w;x0+=(n1-.5)*.34+(n2-.5)*.16;}
  // the lower edge is sharp but ragged (deeper under a storm), each ray dipping a little below it
  float x=x0-(S1.a-.5)*(.008+.1*storm)+(R-.4)*.014,xp=max(x,0.);
  // a far, low curtain (vQ.w: its softness) is seen through more air: its foot is soft and broken by its rays, with no
  // hem line (stacked sharp hems near the horizon would read as mountain ridges in the sky)
  float soft=vQ.w*(1.-ring);
  float lo=ring>0.?smoothstep(-.02,.16,x)*(.15+.85*R):smoothstep(-.006-.06*soft,.008+.014/uEdgeK+.34*soft,x)*mix(1.,.15+.85*R,soft);
  float top=max(A.x*vP.y,.05)*(1.+.22*(rays-.45))*(ring>0.?.65+.7*n2:1.)+.05*(fl-.5);
  // a soft top: the rays thin out toward their heights; the curtain's ends fade
  // (the fades are long: under the tone curve a tenth of a bright curtain still shows)
  float end=pow(smoothstep(1.,.3,abs(vS.x)),2.2),cut=pow(smoothstep(top+.03,top*.45,x),1.6)*end;
  if(cut*lo<=.001)discard;
  // the light: a thin bright hem at the lower edge and a short fringe of diffuse light over it (a bright fringe, never the
  // top of a lit slab), then the rays, which carry the light upward with dark sky between them; toward the top the
  // fringe colour, in the rays. The lower edge is not even: bright knots and dimmer stretches drifting along it
  float knot=.5+.9*smoothstep(.3,.75,texture(uNoise,vec2(s*.0011+vSd*3.,uV*.011+vSd)).z);
  float hem=exp(-pow(xp/.011,2.))*knot*(1.-.85*ring)*(1.-soft),glow=exp(-xp*mix(30.,16.,soft))*knot*(1.-.8*ring)*(1.-.8*soft);
  float rl=(R*R*.9+.12*rays)*(exp(-xp*5.)*1.05+exp(-xp*1.5)*.45)+ring*.16*rays*exp(-xp*1.6);
  float rm=1.+uEighth*(R*2.-.6);
  float fr=smoothstep(.16,.48,x)*exp(-pow((x-top*.72)/(.22+.2*top),2.));
  vec3 c=vLo*((hem*1.3+glow*(.55+.8*R))*(.8+.35*fl)+rl*uRayK*2.6*(.55+.7*fl))*rm*lo*cut
    +vHi*fr*R*(.45+.85*R)*(.5+.6*fl)*vQ.y*uFringeK*cut*.6;
  // the files' rays: brighter streaks along the field up to their own heights
  float fray=A.y*lo*smoothstep(top+.02,top*.5,x)*end;c+=mix(vLo,uWhite,.08)*fray*(R*(.6*exp(-xp*2.5)+.2*R)+.012)*(.7+.6*fl);
#ifndef MIRROR
  // ignition: a pulse running up the ray in its colour, and the ray lit behind it
  if(uFlash>0.){vec4 B=texture(uRayB,vec2(su,row));B.rgb*=4.;B.a*=1.25;
    if(B.a>0.){float fp=exp(-pow((x-B.a)/.07,2.))*step(-.05,x),lit=smoothstep(B.a+.05,B.a-.1,x)*exp(-x*1.4);c+=B.rgb*(fp*3.6+lit*1.3)*lo;}}
#endif
  // validated rays settle: a little paler at the hem
  c+=uValid*A.w*hem*.3*cut;
  // the storm: red and ragged where the covered files are stressed (never gold), flickering faster
  float lum=dot(c,vec3(.2126,.7152,.0722));c=mix(c,uWarn*min(lum,.9)*(1.15+.8*fl),storm*.9);
#ifndef MIRROR
  // effects (aurora.js slots): 0 pulsating patches sweeping a curtain (tests pass), 1 a surge along it, 2 a calm glow
  for(int k=0;k<8;k++){if(float(k)>=uNE)break;vec4 E=uE[k],F=uEF[k];if(E.y>=0.&&abs(E.y-vK)>.5)continue;float age=F.x;
    if(E.x<.5){float fr2=mix(E.z,E.w,clamp(age/2.8,0.,1.)),dir=E.w>E.z?1.:-1.,d=(fr2-vS.x)*dir,behind=smoothstep(-.06,.12,d)*smoothstep(1.1,.3,d);
      float pa=smoothstep(.52,.72,texture(uNoise,vec2(s*.0019+F.z,x*.8+F.z)).y),blink=pow(.5+.5*sin(age*3.1+pa*5.+F.z*9.),3.);
      float env=smoothstep(0.,.4,age)*(1.-smoothstep(4.5,6.5,age));c+=mix(vLo,uValid,.5)*pa*blink*behind*env*F.y*smoothstep(-.02,.06,x)*exp(-x*1.6)*cut*1.4;}
    else if(E.x<1.5){float fr2=mix(E.z,E.w,clamp(age/3.6,0.,1.)),w=exp(-pow((vS.x-fr2)/.16,2.)),env=1.-smoothstep(3.,4.4,age);c*=1.+w*F.y*env*1.4;}
    else{float env=smoothstep(0.,.8,age)*(1.-smoothstep(3.5,7.,age));c*=1.+env*F.y*.7;c+=vLo*env*F.y*.12*lo*cut;}}
#endif
  // the music: a section's onset is a surge of light running along every curtain
  if(uSurge.y>0.){float dir=mod(vK,2.)<.5?1.:-1.,w=exp(-pow((vS.x*dir-(-1.2+uSurge.x*.62))/.22,2.));c*=1.+w*uSurge.y;}
  c*=vP.x*vEdge;
  // light too faint to see (between the rays high up) is not blended at all
  if(max(c.g,max(c.r,c.b))<.0012)discard;
  gl_FragColor=vec4(c,1.);}`;
// ---- The sky (drawn at half resolution by the host, and again into the reflection) -------------------------------
// The night's gradient from the deep zenith to a paler horizon, airglow, the Milky Way turning with the stars (its dust
// lanes), the aurora's own light in the air around its curtains (soft lobes), dithered against banding.
export const SKY_FS=`
varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam;uniform float uV,uQ,uMir,uMW,uAG,uNL;uniform vec3 uDeep,uHaze,uAirG,uAirR;uniform mat3 uRot;
uniform vec4 uLobe[8],uLobeC[8];uniform sampler2D uNoise;
void main(){vec4 pp=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(pp.xyz/pp.w-uCam);d.y*=uMir;
  // below the horizon the land and the ice cover the sky: only their edges' surroundings are seen
  if(d.y<-.06){gl_FragColor=vec4(uHaze*.15,1.);return;}
  float y=max(d.y,0.),e=asin(clamp(y,0.,1.));
  vec3 c=mix(uHaze,uDeep,pow(smoothstep(0.,.75,y),.6));
  c+=uAirG*exp(-pow((e-.16)/.075,2.))*uAG+uAirR*exp(-pow((e-.3)/.14,2.))*uAG*.5;
  if(uQ<2.5&&uMW>0.){vec3 g=uRot*d;float lat=g.y,lon=atan(g.z,g.x);float band=exp(-lat*lat/.03)*.6+exp(-lat*lat/.005)*.7;
    vec2 q=vec2(lon*2.6,lat*7.);float cl=texture(uNoise,q*.12+.3).x*.55+texture(uNoise,q*.37+.7).y*.3+texture(uNoise,q*1.1+.2).z*.15;
    float dust=smoothstep(.5,.72,texture(uNoise,vec2(lon*1.9,lat*16.)*.11+.17).z*.7+texture(uNoise,vec2(lon*5.,lat*30.)*.11+.4).w*.3)*exp(-lat*lat/.008);
    c+=vec3(.78,.8,.95)*band*pow(cl,1.5)*2.2*(1.-.85*dust)*uMW*.014*smoothstep(.0,.3,y);}
  for(int k=0;k<8;k++){if(float(k)>=uNL)break;vec4 L=uLobe[k];float a=dot(d,L.xyz);c+=uLobeC[k].rgb*exp((a-1.)/L.w)*uLobeC[k].w*(1.-.6*smoothstep(-.05,.25,d.y-L.y));}
  c*=smoothstep(-.12,0.,d.y)*.85+.15;
  float n=fract(sin(dot(gl_FragCoord.xy+uV*7.,vec2(12.9898,78.233)))*43758.5453);c+=(n-.5)*.0009*(.3+c*8.);
  gl_FragColor=vec4(max(c,0.),1.);}`;
// ---- Stars: points at infinity on the celestial sphere, wheeling about the pole; they twinkle a little ---------------
export const STAR_VS=`
attribute vec4 aS;uniform mat3 uRotT;uniform float uV,uPx,uMirror,uStarK;uniform vec2 uRes;varying vec3 vC;varying float vA;
void main(){vec3 d=uRotT*normalize(position);float m=aS.x;
  if(d.y<-.01||uStarK<=0.){gl_Position=vec4(2.,2.,2.,1.);vC=vec3(0.);vA=0.;return;}
  vec3 p=cameraPosition+d*2900.;p.y*=uMirror;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
  float tw=1.+(.18+.5*(1.-smoothstep(.0,.35,d.y)))*sin(uV*(2.3+aS.z*4.1)+aS.z*61.)*sin(uV*(1.1+aS.z*2.)+aS.z*17.);
  vA=m*2.4*tw*uStarK*smoothstep(-.01,.06,d.y)*(.45+.55*smoothstep(.0,.25,d.y));
  vC=mix(vec3(1.,.78,.6),vec3(.72,.82,1.),aS.y);gl_PointSize=clamp((1.6+2.6*sqrt(m))*uPx,1.,6.*uPx);}`;
export const STAR_FS=`varying vec3 vC;varying float vA;void main(){vec2 q=gl_PointCoord*2.-1.;float r2=dot(q,q);if(r2>1.)discard;
  gl_FragColor=vec4(vC*vA*(exp(-r2*5.)*1.2+exp(-r2*30.)*.8),1.);}`;
// ---- The ice: mirror ice, dark and glossy, its reflection gently distorted, faint cracks, drifted snow ---------------
export const ICE_VS=`uniform float uMirror;varying vec3 vW;void main(){vec3 p=position;vW=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
export const ICE_FS=`
uniform sampler2D uRefl,uNoise;uniform vec2 uRes;uniform float uV,uGloss,uSnow,uCracks,uFrost,uQ,uNG;uniform vec3 uIce,uSnowC,uSkyAmb,uAurL,uAcc;uniform vec4 uGlow[10];
varying vec3 vW;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec2 p=vW.xz;vec3 toC=cameraPosition-vW;float dist=length(toC);vec3 V=toC/dist;
  vec4 n0=texture(uNoise,p*.0017+.13),n1=texture(uNoise,p*.011+.71),n2=texture(uNoise,p*.047+vec2(uV*.0009,.37));
  // snow drifted by the wind: long drifts in patches, thicker toward the far shore, a thin dusting around them
  vec2 w=vec2(p.x*.0031+p.y*.0012,p.y*.0088-p.x*.0013);
  float sn=texture(uNoise,w).x*.58+texture(uNoise,w*2.9+.5).y*.27+n1.z*.15;
  float near=smoothstep(-470.,-560.,vW.z)*.3;
  float drift=smoothstep(.79-.12*uSnow-near,.88-.12*uSnow-near,sn),thin=smoothstep(.66-.12*uSnow-near,.8-.12*uSnow-near,sn)*(1.-drift);
  // sastrugi: wind ripples in the snow, across the wind
  float st=texture(uNoise,vec2(p.x*.05+p.y*.018,p.y*.005-p.x*.004)).w*.6+n2.y*.4;
  // cracks in the clear ice: long, wandering pale lines in some places (fracture planes catching the light), fading with
  // distance; none under the snow
  vec2 wp=p+(n0.zw-.5)*90.;float c1=abs(texture(uNoise,wp*.0042+.21).z-.5),c2=abs(texture(uNoise,wp*.0123+.63).w-.5);
  float zone=smoothstep(.45,.7,texture(uNoise,p*.0009+.37).y);
  float crack=(1.-smoothstep(0.,fwidth(c1)*1.2+.0022,c1))*.65+(1.-smoothstep(0.,fwidth(c2)*1.2+.0016,c2))*.35*zone;
  crack*=uCracks*zone*(1.-smoothstep(40.,200.,dist))*(1.-drift)*(1.-thin*.7);
  // the reflection: the mirrored night, gently distorted by the ice's undulation, glossy along the vertical
  vec2 uv=gl_FragCoord.xy/uRes;vec2 nrm=(n1.xy-.5)*.7+(n2.zw-.5)*.3;float graze=1.-clamp(V.y,0.,1.);
  vec2 off=nrm*vec2(.0018,.0075)*(.35+graze)*(1.25-uGloss)+vec2(0.,(n0.y-.5)*.002);
  float br=(.0018+.007*(1.-uGloss))*(1.+thin*1.6)*(1.+(1.-graze)*4.);
  vec3 r=texture(uRefl,uv+off).rgb*.36;
  if(uQ<2.5){r+=(texture(uRefl,uv+off+vec2(0.,br)).rgb+texture(uRefl,uv+off-vec2(0.,br)).rgb)*.16+(texture(uRefl,uv+off+vec2(br*.25,br*2.3)).rgb+texture(uRefl,uv+off-vec2(br*.25,br*2.3)).rgb)*.16;}
  else r/=.36;
  float F=.025+.975*pow(graze,5.);F=mix(F,F*.5+.5*pow(graze,2.2),.35*uGloss);
  vec3 ice=uIce*(.55+.45*n0.x)*(.7+.3*n2.x);
  // (the ice's own surface catches a little of the aurora's light: near the shore, where it reflects least, it still reads)
  vec3 col=ice*(1.-F)+r*F*mix(.7,.97,uGloss)*(1.-thin*.5)+uAurL*(1.-F)*(.05+.06*n2.x);
  vec3 snow=uSnowC*(uSkyAmb*(.75+.3*st)+uAurL*(.3+.45*st))*(.82+.18*n1.z);
  col=mix(col,snow*.7+col*.35,thin*.5);col=mix(col,snow,drift);
  col+=uSnowC*crack*(uSkyAmb*.7+uAurL*.45)*.8;
  // hoarfrost (unlock): glints on the snow and the ice that twinkle as the light moves
  if(uFrost>0.&&uQ<2.5){vec2 g=floor(p*3.1);float hg=h21(g);if(hg>.985){float tw=pow(max(0.,sin(uV*1.7+hg*90.)),12.);col+=(uAurL*2.+vec3(.4))*tw*uFrost*(1.-smoothstep(10.,70.,dist))*.6;}}
  // the warm pools of the lanterns and the cabin's window on the snow and the ice near them
  for(int k=0;k<10;k++){if(float(k)>=uNG)break;vec4 G=uGlow[k];vec2 dd=p-G.xy;float d2=dot(dd,dd);col+=uAcc*G.w*(exp(-d2/(G.z*G.z))*mix(.35,1.,drift)+.04*G.z*G.z/(d2+G.z*G.z));}
  gl_FragColor=vec4(col,1.);}`;
// ---- The land: the near bank and the cabin's point (snow over a heightfield), and the far shore's treeline and
// mountains (snow and rock under the aurora's light, paler with distance) --------------------------------------------
// (in the reflection, what lies under the ice is flattened onto it: no discard, so the main pass keeps early depth rejection)
export const LAND_VS=`attribute vec3 aN;uniform float uMirror;varying vec3 vW,vN;void main(){vec3 p=position;vW=p;vN=aN;if(uMirror<0.)p.y=max(p.y,0.);p.y*=uMirror;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
export const LAND_FS=`
uniform sampler2D uNoise;uniform float uV,uFrost,uQ,uNG,uMirror;uniform vec3 uSnowC,uSkyAmb,uAurL,uAurD,uAcc;uniform vec4 uGlow[10];varying vec3 vW,vN;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec3 n=normalize(vN);vec2 p=vW.xz;float dist=length(cameraPosition-vW);
  vec4 a=texture(uNoise,p*.05+.3),b=texture(uNoise,p*.21+.6);
  float st=texture(uNoise,vec2(p.x*.09+p.y*.03,p.y*.012)).w;
  // the snow: sky light from above, the aurora's from across the lake, wind streaks, a few stones showing through
  float sky=.55+.45*n.y,aur=clamp(dot(n,uAurD)*.6+.55,0.,1.2);
  vec3 col=uSnowC*(uSkyAmb*sky+uAurL*aur)*(.86+.1*st+.08*(b.x-.5));
  float rock=smoothstep(.78,.84,a.y*.7+b.z*.3)*smoothstep(.2,.8,1.-n.y+.4);col=mix(col,col*.18,rock);
  if(uFrost>0.&&uQ<2.5){vec2 g=floor(p*4.);float hg=h21(g);if(hg>.98){float tw=pow(max(0.,sin(uV*1.9+hg*70.)),14.);col+=(uAurL*2.+vec3(.45))*tw*uFrost*(1.-smoothstep(8.,60.,dist))*.7;}}
  for(int k=0;k<10;k++){if(float(k)>=uNG)break;vec4 G=uGlow[k];vec2 dd=p-G.xy;float d2=dot(dd,dd);col+=uAcc*G.w*(exp(-d2/(G.z*G.z))*1.2+.05*G.z*G.z/(d2+G.z*G.z))*(.6+.4*n.y);}
  gl_FragColor=vec4(col,1.);}`;
export const MTN_VS=`attribute vec4 aM;uniform float uMirror;varying vec3 vW;varying vec4 vM;void main(){vec3 p=position;vW=p;vM=aM;if(uMirror<0.)p.y=max(p.y,0.);p.y*=uMirror;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
// aM: x the place across (world units), y the height share (1 the crest), z the haze, w the slope's light (0..1)
export const MTN_FS=`
uniform sampler2D uNoise;uniform vec3 uSnowC,uSkyAmb,uAurL,uAurD,uHazeC;uniform float uTree,uMirror;varying vec3 vW;varying vec4 vM;
void main(){float x=vM.x,y=vW.y,f=vM.y;
  vec4 a=texture(uNoise,vec2(x*.0021,y*.004)+.2),c=texture(uNoise,vec2(x*.0007,y*.0011)+.4);
  // gullies down the fall line, wandering, of varied depth; snow on the upper slopes, ridges and shoulders
  float gx=x*.0067+(a.x-.5)*2.2+(c.z-.5)*4.;vec4 b=texture(uNoise,vec2(gx,y*.0042+(a.w-.5)*.6)+.6);
  float gul=smoothstep(.55,.85,b.x*.6+a.z*.4)*smoothstep(.15,.6,f);
  float sl=clamp(.7-.3*abs(vM.w)+.32*vM.w*uAurD.x,0.,1.);
  float snow=smoothstep(.22,.55,f+(a.y-.5)*.45+(c.x-.5)*.25)*(1.-gul*.8);
  // the snow takes the aurora's light (and the sky's), most on the slopes facing it and along the crests
  vec3 lit=uSkyAmb*.8+uAurL*(.22+.75*sl)*(.75+.35*c.y);float rim=smoothstep(.93,1.,f)*.4;
  vec3 col=mix(uSnowC*.03*(.7+.3*b.y),uSnowC*.62,snow*(.75+.25*b.z))*lit*(1.+rim);
  // the treeline: dark spruces, a little snow on their tops
  if(vM.z<.05)col=uSnowC*(uSkyAmb*.3+uAurL*.12)*(.3+.7*smoothstep(.55,1.,f))*(.55+.45*a.x);
  // the air between: farther layers paler and bluer, the low air toward the horizon too
  col=mix(col,uHazeC*(.8+.4*smoothstep(.0,.6,f)),clamp(vM.z+.25*(1.-f)*vM.z,0.,.92));
  gl_FragColor=vec4(col,1.);}`;
// ---- Spruces (camera-facing quads: a procedural silhouette of drooping tiers, snow along them) ----------------------
export const TREE_VS=`attribute vec4 aT;uniform float uMirror;varying vec2 vQ;varying float vSd;
void main(){vec3 base=position;vec3 toC=cameraPosition-base;vec3 rt=normalize(vec3(toC.z,0.,-toC.x)+1e-5);
  vec3 p=base+rt*aT.x*aT.w*.2+vec3(0.,aT.y*aT.w,0.);vQ=aT.xy;vSd=aT.z;p.y*=uMirror;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
export const TREE_FS=`uniform vec3 uSnowC,uSkyAmb,uAurL;varying vec2 vQ;varying float vSd;
void main(){float y=vQ.y,x=abs(vQ.x);float tiers=7.+floor(vSd*5.),t=fract(y*tiers+vSd*3.);
  float w=(1.-y)*(.55+.45*pow(1.-t,.6))*(.92+.16*sin(vSd*40.+floor(y*tiers)*2.1));
  if(y>.985||x>w*(y<.06?.25:1.)&&!(y<.08&&x<.06))discard;
  float sn=smoothstep(.85,.97,1.-t)*smoothstep(.2,.9,x/max(w,.01)+.3);vec3 lit=uSkyAmb*.6+uAurL*.5;
  vec3 col=mix(uSnowC*.012,uSnowC*.55,sn*.85)*lit;
  gl_FragColor=vec4(col,1.);}`;
// ---- The cabin: log walls, a snowy gable roof, one warm window, a chimney ---------------------------------------
export const CABIN_VS=`attribute vec4 aK;uniform float uMirror;varying vec4 vK;varying vec3 vW;void main(){vec3 p=position;vW=p;vK=aK;p.y*=uMirror;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
export const CABIN_FS=`uniform vec3 uSnowC,uSkyAmb,uAurL,uAcc;uniform float uWin,uV,uMirror;varying vec4 vK;varying vec3 vW;
void main(){int k=int(vK.x+.5);vec3 lit=uSkyAmb*.7+uAurL*.6;vec3 col;
  if(k==0){float logs=.55+.45*smoothstep(.08,.45,abs(fract(vW.y*3.1)-.5));col=vec3(.05,.035,.025)*lit*logs*3.;}
  else if(k==1){col=uSnowC*lit*(.7+.3*vK.y);}
  else if(k==2){vec2 q=vK.zw;float frame=step(.08,q.x)*step(q.x,.92)*step(.08,q.y)*step(q.y,.92)*(1.-step(abs(q.x-.5),.04))*(1.-step(abs(q.y-.52),.04));
    float fl=.85+.1*sin(uV*7.3)+.06*sin(uV*13.1+1.);col=uAcc*uWin*fl*(.25+frame*(1.3-.5*length(q-.5)));}
  else col=vec3(.03,.025,.02)*lit*2.;
  gl_FragColor=vec4(col,1.);}`;
// ---- Lights: points (wisps, lanterns, the window's glow, sparks, motes) and ribbons (field lines, meteors, tethers) ----
// Point shapes by the CAST seat: 0 four-point spark, 1 ring, 2 diamond, 3 six-point star, 4 triangle, 5 double ring,
// 6 soft dot; 8 soft round, 9 a lantern's flame, 10 a ring, 11 a wide halo.
export const POINT_VS=`uniform float uPx,uMirror;uniform vec2 uRes;attribute vec4 fC;attribute vec3 fS;varying vec4 vC;varying float vSh;
  void main(){vec3 p=position;p.y*=uMirror;vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float ppu=projectionMatrix[1][1]*uRes.y*.5/max(-mv.z,.1);
    gl_PointSize=clamp(max(fS.x*uPx,fS.z*ppu),1.,300.*uPx);vC=fC;vSh=fS.y;}`;
export const POINT_FS=`varying vec4 vC;varying float vSh;
  float tri(vec2 p){const float k=1.7320508;p.x=abs(p.x)-.5;p.y=p.y+.5/k;if(p.x+k*p.y>0.)p=vec2(p.x-k*p.y,-k*p.x-p.y)/2.;p.x-=clamp(p.x,-1.,0.);return -length(p)*sign(p.y);}
  void main(){vec2 q=gl_PointCoord*2.-1.;q.y=-q.y;float r=length(q),a=0.,g=exp(-r*r*4.5)*.45;int sh=int(vSh+.5);
    if(sh==0){a=max(0.,1.-(abs(q.x)*7.+abs(q.y)*1.15))+max(0.,1.-(abs(q.y)*7.+abs(q.x)*1.15))+exp(-r*r*30.)*1.4;}
    else if(sh==1){a=exp(-pow((r-.5)*10.,2.))*1.5+exp(-r*r*45.)*.9;}
    else if(sh==2){float d=abs(q.x)+abs(q.y);a=exp(-pow((d-.55)*10.,2.))*1.4+exp(-d*d*35.);}
    else if(sh==3){float t=atan(q.y,q.x),k=pow(abs(cos(t*3.)),10.);a=exp(-r*(7.-6.*k))*1.5;}
    else if(sh==4){float d=tri(q*1.25);a=exp(-pow(d*14.,2.))*1.4+exp(-r*r*40.);}
    else if(sh==5){a=exp(-pow((r-.62)*12.,2.))*1.2+exp(-pow((r-.32)*12.,2.))*1.2+exp(-r*r*50.);}
    else if(sh==8){a=exp(-r*r*6.);g=0.;}
    else if(sh==9){a=exp(-(q.x*q.x*9.+pow(q.y+.15,2.)*4.))*1.3+exp(-r*r*40.)*1.2;g=exp(-r*r*2.5)*.18;}
    else if(sh==10){a=exp(-pow((r-.8)*9.,2.));g=0.;}
    else if(sh==11){a=exp(-r*r*3.)*.6;g=0.;}
    else{a=exp(-r*r*14.)*1.4;}
    a=(a+g)*(1.-smoothstep(.92,1.,r));gl_FragColor=vec4(vC.rgb*a*vC.a,1.);}`;
export const RIB_VS=`uniform float uPx,uMirror;uniform vec2 uRes;attribute vec4 rA,rB,rC,rD;varying vec4 vC;varying float vY,vAl,vCore;
  void main(){vec3 pa=rA.xyz,pb=rB.xyz;pa.y*=uMirror;pb.y*=uMirror;vec4 va=viewMatrix*vec4(pa,1.),vb=viewMatrix*vec4(pb,1.),vp=mix(va,vb,position.x);
    vec3 t=vb.xyz-va.xyz;t=length(t)>1e-6?normalize(t):vec3(1.,0.,0.);vec3 sd=cross(t,normalize(vp.xyz));sd=length(sd)>1e-6?normalize(sd):vec3(0.,1.,0.);
    float z=max(-vp.z,.1),ppu=projectionMatrix[1][1]*uRes.y*.5/z,w=mix(rA.w,rB.w,position.x),wp=max(w,1.1*uPx/ppu);
    vp.xyz+=sd*position.y*wp*1.6;vY=position.y*1.6;vAl=mix(rD.x,rD.y,position.x)*min(1.,w/wp*1.4+.25);vCore=rD.z;vC=rC;gl_Position=projectionMatrix*vp;}`;
// rD.z: a fine bright core inside the soft glow (field lines), its share
export const RIB_FS=`varying vec4 vC;varying float vY,vAl,vCore;void main(){float a=exp(-vY*vY*2.6)*(1.-vCore)+exp(-vY*vY*90.)*vCore*2.2;gl_FragColor=vec4(vC.rgb*a*vAl*vC.a,1.);}`;

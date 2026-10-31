// Temporal Terrain's shaders (preview): the land (a static grid whose vertices find their moment by depth and sample the
// land's rows), its contour lines and light, the sky, and the shared pieces. The row lookup is the twin of
// terrain-layout.js ordinalOf / ordinalRow, the relief's noise the twin of terrain-layout.js reliefAt (the JS places
// what stands on the land the same way). Everything smooth is computed per vertex (the grid is dense enough on screen:
// rows spaced for an even density from the front edge to the horizon); the fragments draw the lines.
import {LANES,LEVELS,PER,ROWS} from './terrain-layout.js';
// Value noise with analytic derivatives (value in [-1, 1], d/dx, d/dy), its lattice hashed after wrapping to 1024
// cells so it stays exact at the large coordinates of the land's own time axis.
export const NOISE2=`
float vh(vec2 i){i=mod(i,1024.);vec3 p=fract(vec3(i.xyx)*vec3(.1031,.1030,.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z)*2.-1.;}
vec3 vnd(vec2 p){vec2 i=floor(p),f=p-i,u=f*f*(3.-2.*f),du=6.*f*(1.-f);float a=vh(i),b=vh(i+vec2(1.,0.)),c=vh(i+vec2(0.,1.)),d=vh(i+vec2(1.,1.)),k=a-b-c+d;
  return vec3(a+(b-a)*u.x+(c-a)*u.y+k*u.x*u.y,du*vec2(b-a+k*u.y,c-a+k*u.x));}
`;
// The sky toward a direction (no stars or aurora): the horizon haze, the zenith, the key light's glow. The land's fog
// takes the same colour, so the land dissolves into its own horizon.
export const SKY=`
uniform vec3 uDeep,uHaze,uKey,uKeyC,uAcc;uniform float uDawn,uSun,uSunX;
vec3 skyCol(vec3 d){float y=d.y;vec3 c=mix(uHaze*1.5,uDeep,smoothstep(-.03,.3,y))+uHaze*1.2*exp(-abs(y)*16.);
  float m=max(dot(d,uKey),0.);c+=uKeyC*(pow(m,12.)*.035+pow(m,90.)*.09);
  float h=exp(-abs(y+.01)*22.),hs=exp(-abs(y+.01)*6.);c+=uAcc*(uDawn*h*.07+uSun*(h*.5+hs*.18)*(.45+.55*exp(-pow((d.x-uSunX)*2.4,2.))));
  return c;}
`;
const W=LANES;
// The land's rows: which ordinal a moment falls on (and how fast it runs with the moment), and the texture row of an
// ordinal (terrain-layout.js twins).
export const ROWS_GLSL=`
uniform vec4 uLv[${LEVELS}];uniform float uNow;
float rowOf(float tp,out float sl){float g0=uLv[0].x*uLv[0].y;if(tp>=g0){float s=max(uNow-g0,1e-4);sl=-1./s;return clamp((uNow-tp)/s,0.,1.);}
  for(int l=0;l<${LEVELS};l++){float b=uLv[l].y,gN=uLv[l].x*b,gO=gN-${PER-1}.*b;
    if(tp>=gO){sl=-1./b;return 1.+float(l*${PER})+(gN-tp)/b;}
    if(l+1<${LEVELS}){float gn=uLv[l+1].x*uLv[l+1].y;if(tp>=gn){float s=max(gO-gn,1e-4);sl=-1./s;return 1.+float(l*${PER})+${PER-1}.+(gO-tp)/s;}}}
  sl=0.;return ${ROWS-1}.;}
int texRow(int o){if(o<=0)return 0;int l=(o-1)/${PER},k=(o-1)-l*${PER};float m=uLv[l].x-float(k);return 1+l*${PER}+int(mod(m,${PER}.));}
`;
// The relief's own texture (ambient, never structure), fixed on the ground (x, depth): a meander of the ridges, a faint
// undulation of the open land, ruggedness where symbols are dense (rug: the fine relief's amplitude from the files). The
// structure travels back through it; while nothing changes the land is still. Its JS twin is terrain-layout.js
// reliefAt; returns (height, d/dx, d/ddepth) and the meander (dx) in w.
export const RELIEF=`
uniform float uWarp;
vec4 relief(float x,float z,float rug,float fine){
  vec3 m=vnd(vec2(x/47.,z/38.)+vec2(5.3,1.7));float w=m.x*uWarp;
  vec3 g=vnd(vec2(x/13.,z/11.));float rg=1.-abs(g.x)*2.,ra=.12+1.1*rug,sg=g.x>0.?-2.:2.;
  float h=g.x*.16+rg*ra*.55;vec2 d=vec2((g.y*.16+sg*g.y*ra*.55)/13.,(g.z*.16+sg*g.z*ra*.55)/11.);
  if(fine>0.){vec3 f=vnd(vec2(x/5.5,z/4.6)+3.1);float rf=1.-abs(f.x)*2.,sf=f.x>0.?-2.:2.,af=rug*.42*fine;h+=rf*af;d+=af*sf*vec2(f.y/5.5,f.z/4.6);
    vec3 f2=vnd(vec2(x/2.6,z/2.2)+9.7);float r2=1.-abs(f2.x)*2.,s2=f2.x>0.?-2.:2.,a2=rug*.17*fine;h+=r2*a2;d+=a2*s2*vec2(f2.y/2.6,f2.z/2.2);}
  return vec4(h,d,w);}
`;
// The land's vertex shader: elevation (the rows' B-spline sampled at the meandered place, the relief's texture, the
// agents' touches lifting the ground, a fault's tremor), its normal, the smooth effects' light, mist and fog.
// position: (u in [-1, 1], depth, -1 surface / 0 cut top / 1 cut bottom).
export const LAND_VS=`
uniform highp sampler2D uLand;uniform float uXc,uXh,uL,uTau,uBase,uV,uQ,uOct,uZmax,uHazeK,uMist,uNFx,uNMn,uNTch;
uniform vec4 uTch[4],uFx[8],uFxB[8],uFxC[8],uMn[8];
varying vec3 vW,vN,vCol,vFx,vFogC;varying vec4 vA;varying float vCrest,vAge,vTp,vSk,vTop,vDepth,vMist,vFog;
${ROWS_GLSL}
${NOISE2}
${RELIEF}
${SKY}
vec4 bs(float u){float v=1.-u;return vec4(v*v*v,3.*u*u*u-6.*u*u+4.,-3.*u*u*u+3.*u*u+3.*u+1.,u*u*u)/6.;}
vec4 bsd(float u){return vec4(-(1.-u)*(1.-u),3.*u*u-4.*u,-3.*u*u+2.*u+1.,u*u)*.5;}
void main(){
  float u=position.x,depth=position.y,sk=position.z,x=uXc+u*uXh;
  float age=uTau*(exp(depth/uL)-1.),tp=uNow-age,dtd=-(uTau/uL)*exp(depth/uL);
  // the meander first (where along the lanes the structure is read), then the rows' B-spline there
  vec4 m0=relief(x,depth,0.,0.);float xs=x+m0.w;
  float sl,nu=rowOf(tp,sl),i0=floor(nu),fr=nu-i0,lam=(xs-uXc+uXh)/(2.*uXh)*${W}.-.5,j0=floor(lam),fl=lam-j0;
  vec4 wr=bs(fr),dwr=bsd(fr),wl=bs(fl),dwl=bsd(fl);vec4 A=vec4(0.),B=vec4(0.);float dx=0.,dn=0.;
  for(int a=0;a<4;a++){int row=texRow(clamp(int(i0)-1+a,0,${ROWS-1}));
    for(int b=0;b<4;b++){int ln=clamp(int(j0)-1+b,0,${W-1});vec4 ta=texelFetch(uLand,ivec2(ln,row),0),tb=texelFetch(uLand,ivec2(ln+${W},row),0);
      float w=wr[a]*wl[b];A+=ta*w;B+=tb*w;dx+=wr[a]*dwl[b]*ta.x;dn+=dwr[a]*wl[b]*ta.x;}}
  float H=A.x,gx=dx*${W}./(2.*uXh),gd=dn*sl*dtd;
  vec4 r=relief(x,depth,clamp(A.y,0.,2.),uOct);H+=r.x;gx+=r.y;gd+=r.z;
  // agents' touches: the ground rises in a dome where they work (it travels back with the moment it happened)
  for(int k=0;k<4;k++){if(float(k)>=uNTch)break;vec4 T=uTch[k];float dk=uL*log(1.+max(uNow-T.y,0.)/uTau),rx=x-T.x,rz=depth-dk,q=exp(-(rx*rx+rz*rz)/(T.z*T.z));
    H+=T.w*q;gx+=-2.*rx/(T.z*T.z)*T.w*q;gd+=-2.*rz/(T.z*T.z)*T.w*q;}
  // smooth effects on the land: a fault's tremor, the scan's front, the healing light, the sunrise's wave, local glows
  vec3 fxc=vec3(0.);
  for(int k=0;k<8;k++){if(float(k)>=uNFx)break;vec4 F=uFx[k],Bk=uFxB[k];vec3 C=uFxC[k].rgb;float a=Bk.w;
    if(F.x==0.){float cov=x>F.w-3.&&x<Bk.y+3.?1.:.3,mm=exp(-pow((x-F.y)/F.z,2.))*exp(-depth/30.)*Bk.x;fxc+=C*mm*cov*(.5+.5*smoothstep(.2,.8,B.w)+.3);}
    else if(F.x==1.){float mm=smoothstep(F.y-3.,F.y,x)*(1.-smoothstep(F.z,F.z+3.,x))*exp(-depth/12.),cr=smoothstep(.25,.8,B.w);H+=sin(uV*41.+x*1.7+depth*2.3)*.5*mm*cr*(1.-smoothstep(.4,2.2,a))*step(0.,a);
      fxc+=C*mm*cr*exp(-a*.9)*Bk.x*1.8;}
    else if(F.x==2.){float fr2=Bk.y+(uNow-Bk.y)*smoothstep(0.,3.,a),mm=smoothstep(F.y-2.,F.y,x)*(1.-smoothstep(F.z,F.z+2.,x))*step(Bk.y,tp)*exp(-pow((tp-fr2)/1.6,2.))*Bk.x;
      fxc+=C*mm*(.35+.65*smoothstep(.3,.8,B.w))*1.6;}
    else if(F.x==4.){float rr=length(vec2(x-F.y,depth*.6)),w=rr-a*26.;fxc+=C*exp(-w*w/90.)*exp(-a*.18)*Bk.x;}
    else if(F.x==5.){float rr=length(vec2(x-F.y,depth-F.w));fxc+=C*exp(-rr*rr/(F.z*F.z))*exp(-a*.7)*smoothstep(0.,.25,a)*Bk.x;}}
  // monuments: a pool of warm light around each (lasting)
  for(int k=0;k<8;k++){if(float(k)>=uNMn)break;vec4 Mn=uMn[k];float dk=uL*log(1.+max(uNow-Mn.y,0.)/uTau),rr=length(vec2(x-Mn.x,depth-dk)),s=Mn.z>.5?9.:5.;fxc+=uAcc*exp(-rr*rr/(s*s))*Mn.w*.7;}
  vFx=fxc;
  vN=normalize(vec3(-gx,1.,gd));
  vec3 p=vec3(x,H,-depth);vTop=H;vSk=sk;
  if(sk>.5){p.y=-uBase;}
  if(sk>-.5)vN=vec3(0.,0.,1.);
  vA=vec4(clamp(A.y,0.,2.),clamp(A.z,0.,1.),clamp(A.w,0.,1.),H);vCol=max(B.rgb,vec3(0.));vCrest=clamp(B.w,0.,1.);vAge=age;vTp=tp;vDepth=depth;
  vec4 wp=modelMatrix*vec4(p,1.);vW=wp.xyz;
  // mist in the valleys (ambient, drifting), thickening with distance; fog toward the horizon's own colour
  float mn=uQ<2.5?vnd(vec2(x/34.+uV*.012,depth/30.)).x:0.;
  vMist=clamp(uMist*exp(-max(H,0.)/1.8)*(.35+.65*smoothstep(-.5,.6,mn))*(.15+.6*smoothstep(10.,140.,depth)),0.,.7);
  vFog=clamp(1.-exp(-pow(depth/(uZmax*.6/max(uHazeK,.2)),1.8)),0.,1.);vFogC=skyCol(normalize(vW-cameraPosition));
  gl_Position=projectionMatrix*viewMatrix*wp;}`;
// The land's fragments: the rock under a low key light and the sky, the contour lines (anti-aliased by their screen
// width, index lines brighter, each kind fading where its lines would crowd), the present's heat, faults, the
// validated sheen, what is thin (survey lines, the touches' rings) and the agents' light, mist and fog.
export const LAND_FS=`
uniform float uInt,uIdx,uLW,uGlow,uSheen,uCut,uPx,uQ,uV,uBeat,uBeatL,uShim,uLant,uBase,uL,uTau,uNow,uFresh,uNCm,uNSv,uNTch,uNAg;
uniform vec3 uRock,uWarn,uValid,uHi,uSkyC;
uniform vec4 uSv[4],uTch[4],uTchC[4],uAg[6],uAgC[6],uCm[16];
varying vec3 vW,vN,vCol,vFx,vFogC;varying vec4 vA;varying float vCrest,vAge,vTp,vSk,vTop,vDepth,vMist,vFog;
${SKY}
${NOISE2}
// A contour line's coverage: the distance to the nearest isoline in pixels (fw: the level's change per pixel, taken in
// uniform control flow), against the line's width.
float lineAA(float lv,float wpx,float fw){float d=abs(fract(lv+.5)-.5)/fw;return 1.-smoothstep(wpx*.5-.5,wpx*.5+.8,d);}
void main(){
  vec3 V=vW-cameraPosition;vec3 vd=normalize(V);
  float depth=vDepth,age=vAge,tp=vTp,H=vA.w,st=vA.y,va=vA.z;
  // every derivative is taken here, before any branch that differs between neighbouring pixels
  float lv=H/uInt,fw=max(fwidth(lv),1e-5),lvC=vW.y/uInt,fwC=max(fwidth(lvC),1e-5);
  vec3 col;
  if(vSk>-.5){
    // the cut through the present: strata at the contour levels, its crest the present's skyline
    float y=vW.y,ln=lineAA(lvC,uLW*uPx,fwC),lvl=floor(lvC+.5),idx=step(mod(lvl+256.,uIdx),.5);
    float below=vTop-y,fade=exp(-max(below,0.)/(uBase*.45));
    col=uRock*.12*fade+vCol*ln*(.07+.16*idx)*uGlow*fade*(1.-smoothstep(.3,.8,fwC));
    col+=uAcc*uCut*(exp(-below*3.)*1.1+exp(-below*.8)*.03);
    col=mix(col,uWarn*.9,st*exp(-below*.6)*.6);
    gl_FragColor=vec4(col,1.);return;}
  vec3 n=normalize(vN);
  // the rock: a low key light, the sky above; valleys lose the fill
  float diff=max(dot(n,uKey),0.),sky=.45+.55*n.y,cav=smoothstep(-2.,6.,H);
  vec3 hv=normalize(uKey-vd);float spec=pow(max(dot(n,hv),0.),28.)*diff;
  col=uRock*(diff*uKeyC*1.5+uSkyC*sky*.32*(.5+.5*cav))+uKeyC*spec*uSheen*.22;
  col*=1.-.5*st;
  // contour lines (index lines wider and brighter; each kind fades where its lines would crowd under a few pixels)
  float lvl=floor(lv+.5),idx=step(mod(lvl+256.,uIdx),.5),wpx=uLW*uPx*mix(1.,1.6,idx),ln=lineAA(lv,wpx,fw);
  float crowd=mix(1.-smoothstep(.22,.5,fw),1.-smoothstep(.22*uIdx,.55*uIdx,fw),idx),on=step(.5,lvl)*crowd*ln;
  vec3 lc=vCol*mix(.55,1.35,idx)*uGlow;
  // the present is hot: fresh land glows in the lamps' colour and cools as it travels back
  float hot=exp(-age/(5.5*uFresh));lc=mix(lc,uAcc*1.25,hot*.6)+uAcc*hot*.18*idx;
  // validated: a calm sheen on the index lines
  lc=mix(lc,uValid*1.3,va*.45*idx);
  // a fault: warning lines, a fissure along the ridge (hot at the front, an ember scar behind)
  float fs=smoothstep(.04,.35,st);lc=mix(lc,uWarn*1.5,fs);
  if(st>.02){float cr=vnd(vec2(vW.x/1.6,tp/.9)).x,crack=(1.-smoothstep(0.,.07,abs(cr)))*smoothstep(.35,.85,vCrest)*st;
    col+=uWarn*crack*(2.4*exp(-age/40.)+.35)+uWarn*st*.05;}
  // the score's beat: one contour level in four brightens, climbing the land beat by beat
  float bk=mod(lvl+uBeatL+256.,4.);lc*=1.+uShim*uBeat*.9*step(bk,.5);
  // the smooth effects (from the vertices) light the lines most
  lc+=vFx*1.4;col+=vFx*.12;
  // survey flashes: a commit's line across the land at its moment
  for(int k=0;k<4;k++){if(float(k)>=uNSv)break;vec4 S=uSv[k];float m=exp(-pow((tp-S.x)/max(.22,.018*age),2.))*exp(-S.w*.45)*smoothstep(0.,.2,S.w)*S.y;lc+=uHi*m*2.;col+=uHi*m*.75;}
  // survey lines of the commits (lasting): faint dotted lines across the land at their moments
  for(int k=0;k<16;k++){if(float(k)>=uNCm)break;vec4 Cm=uCm[k];float w=max(.12,.012*age),d=abs(tp-Cm.x)/w;if(d>3.)continue;
    float dots=step(.45,fract(vW.x*.5)),m=exp(-d*d)*Cm.y*(vW.x>Cm.z-3.&&vW.x<Cm.w+3.?1.:.45);col+=uHi*m*.38*(.35+.65*dots);}
  // lanterns (unlock): small lights along the ridges in the history
  if(uLant>0.){vec2 c=vec2(vW.x/3.,tp/12.),ce=floor(c),f=fract(c)-.5;float h=vh(ce+17.)*.5+.5;
    if(h>.9)col+=uAcc*exp(-dot(f,f)*90.)*smoothstep(.88,.99,vCrest)*uLant*.8*smoothstep(8.,30.,depth);}
  col+=lc*on;
  // the agents' touches: rings of light in their colour opening around the touch
  for(int k=0;k<4;k++){if(float(k)>=uNTch)break;vec4 T=uTch[k],C=uTchC[k];float dk=uL*log(1.+max(uNow-T.y,0.)/uTau),r=length(vec2(vW.x-T.x,depth-dk));
    float rr=C.w*T.z*2.4,ring=exp(-pow((r-rr)/(.9+.08*rr),2.))*(1.-smoothstep(.6,1.,C.w/1.3)),core=exp(-r*r/(T.z*T.z*.5));
    col+=C.rgb*(ring*1.1+core*.45*on+core*.08)*T.w*.55;}
  // the agents' surveying light: a pool on the land under each
  for(int k=0;k<6;k++){if(float(k)>=uNAg)break;vec4 Ag=uAg[k];vec3 L=Ag.xyz-vW;float d2=dot(L,L),ll=max(dot(n,normalize(L)),0.);
    float pool=Ag.w*ll/(1.+d2/36.);col+=uAgC[k].rgb*(pool*.5+pool*on*1.2);}
  col=mix(col,vFogC*1.6+uHaze*1.2+uKeyC*.008,vMist);col=mix(col,vFogC,vFog);
  gl_FragColor=vec4(col,1.);}`;
// The sky behind the land (drawn at half resolution by the host): its gradient and light, the moon's disc, and what
// verified milestones unlock: dawn, stars, an aurora; a sunrise warms it.
export const SKY_FS=`
varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam;uniform float uV,uStars,uAurora,uQ;
${SKY}
float hs(vec2 p){p=mod(p,1024.);vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
void main(){vec4 pp=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(pp.xyz/pp.w-uCam);
  vec3 c=skyCol(d);float m=dot(d,uKey);
  c+=uKeyC*smoothstep(.99965,.99985,m)*1.6*(1.-uSun*.6);
  if(uStars>0.&&uQ<2.5){vec2 q=vec2(atan(d.z,d.x)*180.,d.y*240.),ce=floor(q),f=fract(q)-.5;float h=hs(ce);
    if(h>.985){float tw=.6+.4*sin(uV*(1.+h*3.)+h*60.);c+=vec3(.85,.9,1.)*exp(-dot(f,f)*30.)*smoothstep(.02,.25,d.y)*uStars*tw*(h-.985)*60.*.05;}}
  if(uAurora>0.&&uQ<2.5){float a=atan(d.z,d.x),y=d.y,band=exp(-pow((y-.22-.05*sin(a*3.+uV*.05))/.08,2.));
    float cur=.5+.5*sin(a*19.+sin(a*7.+uV*.11)*2.+uV*.07);c+=mix(uAcc,vec3(.3,1.,.7),.6)*band*cur*uAurora*.09*smoothstep(-.6,.2,cos(a+1.57));}
  gl_FragColor=vec4(c,1.);}`;

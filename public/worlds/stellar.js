// Stellar Forge: the software as a galaxy being composed.
//
// Data -> image (nothing is decoration that claims engineering work):
//  - subsystem (district)  -> a star system on the galaxy's structure (spiral arm, ring, twin cores or cluster). The star's
//                             temperature comes from what the subsystem contains (interface blue-white, services gold,
//                             model orange, logic pale yellow, tests violet), its size from its symbols. At galaxy scale a
//                             star is a point of light (a lens's point-spread core and glow); framed up close it resolves
//                             into a granulated, limb-darkened sphere with coronal streamers (only the star the camera
//                             attends to; the core subsystem is always the point of light at the galactic nucleus)
//  - file (module)         -> a planet on a Kepler orbit around its subsystem's star; orbit from its persisted plot (ring and
//                             bearing); surface from its content (UI: banded gas giant, types/classes: crystal, tests: ice,
//                             functions: terran/desert/frozen ocean, no symbols: cratered moonlet). At galaxy scale planets
//                             are points of reflected light (brighter at full phase); large subsystems carry their outer rings as asteroid belts
//                             (one clump per module, banded by ring)
//  - symbol                -> a moon in stable slot order (or a ring particle), visible when the planet is resolved
//  - material state        -> draft: molten protoplanet; committed: cooled world; validated: aurora; stressed: storms on the
//                             night side, the star dims, flickers and erupts, dark globules rise around the system
//  - dependency            -> inside a system a short curved thread of light, shown while it forms or either end is being
//                             worked on; across systems the dependencies of a pair of systems are one tidal stream of gas
//                             drawn into the galaxy's own gas map along a spiral-bent path in the disc (the six strongest
//                             pairs); the strongest pair also carries a plasma current of particles
//  - agent                 -> a comet with an ion tail (pointing away from the nearest star) and a dust trail: it circles its
//                             home system while working on a request, hangs over the planet it reads or edits while a tool
//                             runs, waits at the system's edge, and leaves when the session ends
//  - verified milestones   -> lasting remnant nebulae (director.lasting()): each verified milestone or validated refactor
//                             leaves a shell nebula (limb-brightened broken filaments, in the galaxy march) around its
//                             system that stays, grows with repetition and slowly expands
//  - project size          -> the galaxy's richness (how many stars and how much gas) and radius follow the structure
// Ambient life (never progress): gas flowing through the arms with differential rotation (dust lanes shear), star-forming
// knots swelling and fading, galactic rotation, sky drift with parallax, stellar convection and breathing coronae,
// orbital motion, breathing on the music's bars, a slow lateral camera dolly (stars seen from outside a galaxy do not
// twinkle). Verified milestones unlock
// lasting layers (aurora veils, plasma currents, a distant pulsar, a galactic halo).
//
// Rendering: the deep sky is baked once per recipe into two cube maps (a raymarched emission nebula, its densest complex
// placed behind the galaxy, and a nearer layer of dark dust filaments that drifts at its own rate). The galaxy's gas and
// dust are rendered each frame face-on into a map (pure function of time: two flow phases of a differential rotation),
// which also carries the moments that live in the disc (light echoes, storm globules, nurseries, calm glows, a commit's
// compression front, tidal streams). The map is drawn twice: rasterised as a thin sheet in the galactic plane (crisp,
// full resolution) and raymarched at a third of the resolution through the disc slab (soft thick component, the bulge's
// light and the lasting remnant shells). Its stars are GPU points that follow the same structure.
//
// Effects are expressed in effect(cmd) for recorded intents only. One exception, by contract: an ignition is recorded in
// effect() and drawn when the model's subsystem (the star) appears, which can trail the intent by a few seconds; it is
// timed from the star's recorded birth, so replays and seeks reproduce it.
import {THREE,ORBIT,BACKGROUND_VS,clamp,lerp,smooth,hash,rand,rng,instancedBuffers,pointBuffers,orbitPos} from './core.js';
const MAX_SYS=48,MAPR=1.35;
// Stellar temperatures by role (blackbody-like tints).
const ROLE_COLOR={interface:'#8fb8ff',services:'#ffc65a',model:'#ff9050',logic:'#ffe09a',tests:'#c09cff',core:'#ffdcae'};
const KIND_INDEX={function:0,method:1,class:2,'ui.component':3,interface:4,type:5,variable:6,'api.route':7};
const STATE_INDEX={draft:0,committed:1,validated:2,stressed:3};
const SQRT3=Math.sqrt(3),TAU=Math.PI*2;
const hexDistance=(aq,ar,bq,br)=>(Math.abs(aq-bq)+Math.abs(aq+ar-bq-br)+Math.abs(ar-br))/2;
const secs=(t,epoch)=>Number.isFinite(t)?(t-epoch)/1000:(t>0?1e6:-1e5);
// GLSL: a sine-free hash (stable for large inputs, unlike fract(sin)) and gradient noise / fbm on it.
const GN=`
vec3 hh3(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx)*2.-1.;}
float hh1(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float gn(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(mix(dot(hh3(i),f),dot(hh3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),mix(dot(hh3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(hh3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
    mix(mix(dot(hh3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(hh3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),mix(dot(hh3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(hh3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);}
float fbm(vec3 p,int o){float a=.5,s=0.;for(int i=0;i<6;i++){if(i>=o)break;s+=a*gn(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
vec3 rotY(vec3 d,float a){float c=cos(a),s=sin(a);return vec3(c*d.x-s*d.z,d.y,s*d.x+c*d.z);}
float sq(float x){return x*x;}
`;
// GLSL: screen scale. A body's display size: at galaxy scale stars and planets stay points of light (a few pixels), up
// close they take their true size (the eye reads a galaxy first, then a system when the camera frames one).
const SCREEN=`
uniform vec2 uRes;
float pxPer(vec3 c){vec4 q=projectionMatrix*viewMatrix*vec4(c,1.);return projectionMatrix[1][1]*uRes.y*.5/max(q.w,.05);}
float squeezeP(float px){return px<2.6?max(px,1.6):2.6+(px-2.6)*mix(.1,1.,smoothstep(24.,72.,px));}
float squeezeS(float px){return px<5.?px:5.+(px-5.)*mix(.1,1.,smoothstep(45.,160.,px));}
`;
// GLSL: the galaxy's structure, shared by the face-on map, the raymarch and the star points. Positions are galaxy-local
// (rotation removed). The log spiral is world-absolute (theta = arm + ln(r / R0) / tan(pitch)), so systems placed on an
// arm in world units sit exactly on the arm drawn here.
const GALAXY=`
uniform vec4 uGal;   // radius (world), rotation, arms, first arm angle
uniform vec4 uGal2;  // tan(pitch), R0, half thickness (per radius), arrangement (0 spiral, 1 cluster, 2 ring, 3 twin cores)
uniform vec4 uGal3;  // richness, dust, core (0 forge, 1 protostar), twin-core axis
uniform vec3 uGalSeed,uCOld,uCYoung,uCHII,uCCore;
uniform sampler2D uMap;
float galH(float q){return uGal2.z*(.6+.7*q);}
float galPsiN(vec2 n){float q=max(length(n),1e-3);return uGal.z*(atan(n.y,n.x)-uGal.w-log(max(q*uGal.x,.5)/uGal2.y)/uGal2.x);}
vec4 galMap(vec2 lxz){return texture2D(uMap,lxz/(uGal.x*${(2*MAPR).toFixed(2)})+.5);}
`;
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome||{},P=G.palette||{};
  const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  const geo=G.geometry||{},sec=G.secondary||{},spc=G.space||{},atm=G.atmosphere||{},mtl=G.material||{},mot=G.motion||{},cam=G.camera||{},LT=G.light||{},MU=G.music||{};
  const col=(c,d)=>new THREE.Color(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:d);
  const pal={primary:col(P.primary,'#8fa8ff'),secondary:col(P.secondary,'#ff7fbf'),accent:col(P.accent,'#7fe0ff'),highlight:col(P.highlight,'#fff0d8'),
    deep:col(P.deep,'#05060c'),haze:col(P.haze,'#1a1430'),warning:col(P.warning,'#ff5a4a'),valid:col(P.valid,'#8affc8')};
  // Background colours keep their hue but stay dark (a pack may set any colour; space must stay deep).
  const capL=(c,max)=>{const h={};c.getHSL(h);if(h.l>max)c.setHSL(h.h,h.s,max);return c;};capL(pal.deep,.07);capL(pal.haze,.2);
  const seed=(recipe.projectSeed>>>0)||1;
  const ARR=['spiral','cluster','ring','binary-core'].includes(geo.arrangement)?geo.arrangement:'spiral',ARR_I={spiral:0,cluster:1,ring:2,'binary-core':3}[ARR];
  // Pitch 23-35 degrees across the generated twist range: open enough to read as a spiral from a low camera.
  const ARMS=Math.max(1,Math.round(num(geo.spiralArms,2))),PITCH=clamp(.48/Math.sqrt(clamp(num(geo.spiralTwist,1),.3,2)),.34,.62),TANP=Math.tan(PITCH),ARM0=rand(seed+31)*TAU,R0=6;
  const STAR_SCALE=clamp(num(geo.starScale,1),.5,1.8),SPACING=clamp(num(geo.orbitSpacing,1),.6,1.6),TILT=clamp(num(geo.orbitTilt,.15),0,.6),SPREAD=clamp(num(spc.spread,1),.6,1.6);
  const VERTICAL=clamp(num(spc.vertical,.2),0,.8),PROTOSTAR=spc.coreBody==='protostar';
  const ORBIT0=2.1*STAR_SCALE+.4,STEP=.78*SPACING;
  const armAngle=(arm,r)=>ARM0+arm/ARMS*TAU+Math.log(Math.max(.5,r)/R0)/TANP;
  const mix3=(a,b,k)=>a.clone().lerp(b,k);
  const sat=(c,k)=>{const h={};c.getHSL(h);return c.setHSL(h.h,Math.min(1,h.s*k),h.l);};
  // Galaxy colours: old population warm, young arms blue-white (leaning to the palette), HII regions rose.
  const cOld=mix3(new THREE.Color('#ffc890'),pal.highlight,.2),cYoung=mix3(new THREE.Color('#a4c4ff'),pal.accent,.25),cHII=mix3(new THREE.Color('#ff6f96'),pal.secondary,.25),
    cCore=mix3(new THREE.Color('#fff1dc'),pal.highlight,.2);
  const common={uT:{value:0},uV:{value:0},uSpeed:{value:1},uSys:{value:Array.from({length:MAX_SYS},()=>new THREE.Vector4())},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},
    uBeat:{value:0},uActivity:{value:0},uIntensity:{value:1},uMotion:{value:1},uBreath:{value:0}};
  const disposables=[];const keep=x=>{disposables.push(x);return x;};
  const add=(o,order=0)=>{o.frustumCulled=false;o.renderOrder=order;scene.add(o);return o;};
  const quad0=keep(new THREE.PlaneGeometry(2,2));
  // Full-screen passes into render targets (galaxy map, galaxy march).
  const fsScene=new THREE.Scene(),fsQuad=new THREE.Mesh(quad0),ortho=new THREE.OrthographicCamera(-1,1,1,-1,0,1);fsQuad.frustumCulled=false;fsScene.add(fsQuad);
  function fsPass(material,rt){const r=ctx.renderer,prev=r.getRenderTarget();fsQuad.material=material;r.setRenderTarget(rt);r.render(fsScene,ortho);r.setRenderTarget(prev);}
  const mapRT=keep(new THREE.WebGLRenderTarget(768,768,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.ClampToEdgeWrapping,wrapT:THREE.ClampToEdgeWrapping}));
  // The gas disc is thin (its scale height a fraction of an arm's width, as in a real spiral); the old stars are thicker.
  const GAS_H=.006+.014*VERTICAL,SLAB=Math.max(GAS_H*1.51*4,.06);
  const galU={uGal:{value:new THREE.Vector4(20,0,ARMS,ARM0)},uGal2:{value:new THREE.Vector4(TANP,R0,GAS_H,ARR_I)},
    uGal3:{value:new THREE.Vector4(1,Math.min(1.3,clamp(num(atm.dust,.7),0,1.6)*(.6+.25*clamp(num(atm.dustLanes,2),0,4))),PROTOSTAR?1:0,ARM0)},
    uGalSeed:{value:new THREE.Vector3(rand(seed+5)*9,rand(seed+6)*9,rand(seed+7)*9)},uCOld:{value:cOld},uCYoung:{value:cYoung},uCHII:{value:cHII},uCCore:{value:cCore},uMap:{value:mapRT.texture}};
  // ---- Deep sky: two cube maps baked once (pure function of the recipe) --------------------------------------------
  const nebStyle={filamentary:0,billowing:1,veil:2}[atm.nebula]??1,nebDensity=clamp(num(atm.nebulaDensity,.8),0,1.6);
  const baseAz=rand(seed)*TAU;
  const BAKE_FS=`${GN}varying vec3 vDir;uniform vec3 uSeed,uDeep,uHaze,uA,uB,uC,uD0;uniform float uDensity,uStyle,uLayer;uniform vec4 uGx[14];
    float F(vec3 p,int o){return fbm(p,o)*3.5;}
    void main(){vec3 d=normalize(vDir);vec3 p0=d*2.1+uSeed;
      // Where the nebula complexes are: in a band around the galactic horizon, the densest one behind the galaxy as seen
      // from the establishing view (the sky turns with the camera, so it stays there).
      float band=exp(-sq((d.y-uD0.y-.1)/.3))*(.03+.97*smoothstep(uD0.y-.2,uD0.y+.05,d.y));
      float lobe=exp(-dot(d-uD0,d-uD0)*3.2)*smoothstep(uD0.y-.22,uD0.y,d.y)*.8;
      float cm=max(smoothstep(.15,.95,F(d*1.5+uSeed.zxy,4))*band*.3,lobe*(.55+.45*smoothstep(-.4,.5,F(d*2.3+uSeed,3))));
      vec3 w=vec3(F(p0*.9,4),F(p0*.9+vec3(5.2,1.3,2.8),4),F(p0*.9+vec3(2.1,7.7,4.4),4))*.55;
      vec3 L=vec3(0.);float T=1.;
      if(uLayer<.5){
        for(int i=0;i<10;i++){float s=1.+float(i)*.1;vec3 q=p0*s+w*.8;
          float n=F(q*1.7,5);float ridge=pow(max(0.,1.-abs(F(q*2.6+vec3(4.),4)*.75)),6.);float f;
          if(uStyle<.5)f=ridge*1.4+smoothstep(.2,1.2,n)*.45;
          else if(uStyle<1.5)f=smoothstep(.1,1.25,n)*(.55+.9*ridge);
          else f=smoothstep(0.,1.1,n)*(.4+.6*sin(dot(q,vec3(0.,7.,2.))+n*2.5))+ridge*.6;
          float dust=pow(max(0.,1.-abs(F(q*3.1+vec3(3.),4)*.8)),5.)*1.1+smoothstep(.35,1.2,F(q*1.1+vec3(8.),3));
          float hue=smoothstep(-.7,.7,w.x+n*.35);
          vec3 em=mix(uA,uB,hue)*f*1.6+uC*sq(max(0.,n-.5))*2.2;
          L+=T*em*cm*.2*uDensity;T*=exp(-dust*.25*cm*uDensity);}
        L+=uDeep*.8+uHaze*.1*cm+mix(uA,uB,.4)*lobe*.05*(.4+.6*uDensity);
        for(int k=0;k<14;k++){vec4 G=uGx[k];vec3 gd=normalize(G.xyz);float c=dot(d,gd);if(c<.999)continue;vec3 u=normalize(cross(gd,vec3(.3,1.,.2)));vec3 v=cross(gd,u);
          vec2 xy=vec2(dot(d,u),dot(d,v))/G.w;float ca=cos(float(k)*1.7),sa=sin(float(k)*1.7);xy=vec2(ca*xy.x-sa*xy.y,(sa*xy.x+ca*xy.y)*3.2);
          float r=length(xy);L+=mix(vec3(1.,.9,.78),vec3(.75,.85,1.),fract(float(k)*.37))*(exp(-r*r*3.)*.25+exp(-r*12.)*.3)*T;}
        gl_FragColor=vec4(L,1.);
      }else{
        // Near layer: dark filaments (alpha = absorption) with faintly lit rims.
        vec3 q=p0*1.25+w*1.4+vec3(11.);float n=F(q*1.6,5);float fil=pow(max(0.,1.-abs(n*.8)),5.);
        float a=fil*smoothstep(-.5,.7,F(q*.7,2))*(.3+.7*cm);
        float rim=pow(max(0.,1.-abs(n*.8-.3)),9.)*cm;
        gl_FragColor=vec4(mix(uA,uB,.5)*rim*.05*uDensity,a*.8*uDensity);}
    }`;
  const bake=size=>keep(new THREE.WebGLCubeRenderTarget(size,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false,depthBuffer:false}));
  const skyFar=bake(896),skyNear=bake(640);let baked=false;
  function bakeSky(){
    const sc=new THREE.Scene(),g=new THREE.SphereGeometry(5,32,16),gx=[];const r=rng(hash(`galaxies/${seed}`));
    for(let k=0;k<14;k++){const u=r()*2-1,a=r()*TAU,s=Math.sqrt(1-u*u);gx.push(new THREE.Vector4(Math.cos(a)*s,u,Math.sin(a)*s,.004+r()*.012));}
    // A cool sky against the warm galaxy: teal and blue gas, a little rose in the brightest knots (never brown).
    const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthTest:false,depthWrite:false,vertexShader:'varying vec3 vDir;void main(){vDir=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vDir,1.);}',
      fragmentShader:BAKE_FS,uniforms:{uSeed:{value:new THREE.Vector3(rand(seed+11)*7,rand(seed+12)*7,rand(seed+13)*7)},uDeep:{value:mix3(pal.deep,new THREE.Color('#02060e'),.8)},uHaze:{value:mix3(pal.haze,new THREE.Color('#0a1a2e'),.6)},
        uA:{value:sat(mix3(pal.accent,new THREE.Color('#2aa8c8'),.7),.85)},uB:{value:sat(mix3(pal.primary,new THREE.Color('#2f5fd0'),.7),.8)},uC:{value:sat(mix3(pal.secondary,new THREE.Color('#ff5aa8'),.5),.85)},
        uD0:{value:(()=>{const el=-Math.atan((.27+.15*clamp(num(cam.elevation,.4),.05,.9))/2.03)+.05;return new THREE.Vector3(-Math.cos(baseAz)*Math.cos(el),Math.sin(el),-Math.sin(baseAz)*Math.cos(el));})()},uDensity:{value:nebDensity},uStyle:{value:nebStyle},uLayer:{value:0},uGx:{value:gx}}});
    const mesh=new THREE.Mesh(g,m);mesh.frustumCulled=false;sc.add(mesh);
    for(const [rt,layer] of [[skyFar,0],[skyNear,1]]){m.uniforms.uLayer.value=layer;const cc=new THREE.CubeCamera(.1,50,rt);cc.update(ctx.renderer,sc);}
    g.dispose();m.dispose();baked=true;
  }
  // ---- The galaxy's gas and dust, face-on (rendered each frame; pure function of time) ----------------------------
  // Two flow phases of a differential rotation (omega ~ 1/r relative to the arm pattern): the gas visibly streams through
  // the arms and the dust lanes shear, without ever winding up. Each arm has the anatomy of a real grand-design spiral:
  // a crisp dust lane on its inner (concave) edge where the gas is shocked, rose HII knots just downstream, blue-white
  // young light across it, and feathers and spurs trailing out of its outer edge; arms break into flocculent segments
  // and one arm dominates. The inner disc and the short bar are warm old light. Dependencies between systems are tidal
  // streams of gas drawn here too (so the march gives them perspective and they always lie in the disc). A commit's
  // compression front sweeps once from the core, sharpening arms and lanes as it passes.
  const NB=6,BK=13;
  const brU={uBrP:{value:Array.from({length:NB*BK},()=>new THREE.Vector2())},uBrI:{value:Array.from({length:NB},()=>new THREE.Vector4())},uBrX:{value:Array.from({length:NB},()=>new THREE.Vector4())},
    uBrB:{value:Array.from({length:NB},()=>new THREE.Vector4())},uBrC0:{value:Array.from({length:NB},()=>new THREE.Vector3())},uBrC1:{value:Array.from({length:NB},()=>new THREE.Vector3())}};
  // Moments drawn into the gas map (crisp at the sheet's full resolution, anchored in the disc, lit by the gas they touch):
  //  0 a light echo (a thin ring racing out through the disc, decelerating, lighting the dust lanes it crosses),
  //  1 a stellar storm (dark dust pillars rising around a strained star, their star-facing rims lit crimson, turbulent),
  //  2 a nursery (a dark globule collapsing onto a protostar, blown open into a bright bubble when the star ignites),
  //  3 a calm glow (serene light in the gas around a system that recovered).
  const MEV=6,mevU={uMx:{value:Array.from({length:MEV},()=>new THREE.Vector4())},uMy:{value:Array.from({length:MEV},()=>new THREE.Vector4())},uMc:{value:Array.from({length:MEV},()=>new THREE.Vector3())}};
  const mapMat=keep(new THREE.ShaderMaterial({uniforms:{...galU,...brU,...mevU,uMap:{value:null},uFlowT:{value:0},uFlowK:{value:.2},uKnotT:{value:0},uMV:{value:0},uCk:{value:new THREE.Vector4(-9,0,.06,0)}},vertexShader:BACKGROUND_VS,depthWrite:false,depthTest:false,
    fragmentShader:`${GN}${GALAXY}varying vec2 vUv;uniform float uFlowT,uFlowK,uKnotT,uMV;uniform vec4 uCk;
      uniform vec2 uBrP[${NB*BK}];uniform vec4 uBrI[${NB}],uBrX[${NB}],uBrB[${NB}];uniform vec3 uBrC0[${NB}],uBrC1[${NB}];
      uniform vec4 uMx[${MEV}],uMy[${MEV}];uniform vec3 uMc[${MEV}];
      vec2 rot2(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}
      // storm pillars: dark dust in a ring around the star, turbulent, broken into fingers pointing at it
      float stormD(float r,float ph,float sd,float dis){float big=gn(vec3(cos(ph)*1.1,sin(ph)*1.1,sd*.37));ph+=1.2*gn(vec3(r*1.6,sd,uMV*.03));vec3 pq=vec3(cos(ph)*2.,sin(ph)*2.,r*2.2-uMV*.05)+vec3(sd,sd*.7,0.);
        float f=fbm(pq,3)+.35*gn(vec3(cos(ph)*6.,sin(ph)*6.,r*5.-uMV*.1+sd))+big*.6;
        return smoothstep(-.02,.25,f-.05-dis*.9)*smoothstep(.18,.38+.2*f,r)*(1.-smoothstep(.75,1.25+dis*.6,r));}
      void fields(vec2 n,float q,float ph,out float nz,out float dn){float a=uFlowK*(1./max(q,.22)-1.2)*(ph-.5);vec2 m=rot2(n,a);
        vec3 p=vec3(m.x,0.,m.y);nz=fbm(p*5.5+uGalSeed,3);dn=fbm(p*12.+uGalSeed.zxy+vec3(0.,3.1,0.),3);}
      void main(){vec2 n=(vUv*2.-1.)*${MAPR.toFixed(2)};float q=length(n);float lq=log(max(q,.02));
        float f1=fract(uFlowT),w1=1.-abs(2.*f1-1.),w2=1.-w1;float a1,b1,a2,b2;fields(n,q,f1,a1,b1);fields(n,q,fract(uFlowT+.5),a2,b2);
        float nrm=inversesqrt(w1*w1+w2*w2);float nz=(a1*w1+a2*w2)*nrm,dn=(b1*w1+b2*w2)*nrm;
        float nk=gn(vec3(n*15.,uKnotT)+uGalSeed.yzx)+.5*gn(vec3(n*31.,uKnotT*1.3)+uGalSeed);
        float fil=pow(max(0.,1.-abs(dn)*2.2),4.);float arr=uGal2.w;vec3 e=vec3(0.);float dust=0.;float armL=0.;
        // the old population: a warm inner disc and a short bar (gold), whatever the arrangement
        float ba=uGal.w;vec2 bn=vec2(dot(n,vec2(cos(ba),sin(ba))),dot(n,vec2(-sin(ba),cos(ba))));float isBar=arr<.5?1.:0.;
        float bar=exp(-(bn.x*bn.x/.026+bn.y*bn.y/.0021))*isBar;
        e+=mix(uCOld,vec3(1.,.96,.92),.78)*(exp(-q*14.)*1.1+bar*1.2)*(.85+.3*nz);
        if(arr<.5||arr>2.5){float psi=galPsiN(n);float ps=psi+nz*.75;
          float u=mod(ps+3.14159,6.28318)-3.14159;float armId=mod(floor(ps/6.28318+.5),uGal.z);
          float dom=uGal.z>1.5?(armId<.5?1.35:.62):1.;
          float seg=.35+.65*smoothstep(-.3,.25,gn(vec3(lq*3.4,armId*7.3,uKnotT*.35)+uGalSeed)+.12);
          float disc=exp(-q*.55)*(1.-smoothstep(.95,1.3,q))*smoothstep(.12,.28,q);
          float prof=exp(-u*u/(u>0.?.13:.5));armL=prof*seg*dom*disc;
          // the arm is beaded: young clusters and star clouds strung along it
          // star clouds stretched along the arm (arm coordinates: across = phase, along = log radius)
          float cl=smoothstep(-.4,.6,gn(vec3(ps*1.6,lq*10.,armId*3.+uKnotT*.4)+uGalSeed.zxy)+.55*gn(vec3(ps*3.4,lq*24.,armId*5.)+uGalSeed)+.3*gn(vec3(n*60.,2.))+.3*nz);
          // spurs and feathers: short, irregular dust feathers and faint star streams trailing from the arm's outer side
          float th=atan(n.y,n.x);float sc=(th-lq/1.15)*18.+nz*4.+dn*3.+armId*1.7;float outer=smoothstep(-1.9,-.8,u)*(1.-smoothstep(-.4,-.05,u));
          float fb=smoothstep(-.1,.35,gn(vec3(cos(th)*1.6,sin(th)*1.6,lq*4.+armId*2.3)+uGalSeed));float spur=pow(max(0.,cos(sc)),6.)*outer*seg*fb,feather=pow(max(0.,cos(sc+1.1)),14.)*outer*fb;
          // the dust lane: thin, ridged, broken, on the inner edge; a fainter second lane inside it
          float br=smoothstep(-.15,.35,gn(vec3(lq*9.,armId*3.1,1.)+uGalSeed.yzx)+.1);
          float lane=exp(-sq((u-.5-.14*dn)/.06))*(.25+.7*fil)*br+exp(-sq((u-.85-.2*dn)/.05))*.35*fil;
          float knots=sq(smoothstep(.3,.78,nk))*exp(-sq((u-.18)/.16))*seg;
          e+=disc*dom*(uCYoung*armL/max(dom*disc,1e-3)*2.8*(.45+.8*cl)*(.75+.4*nz)+mix(uCHII,vec3(1.,.85,.9),.2)*knots*4.+mix(uCYoung,vec3(1.),.3)*spur*.25);
          e+=uCYoung*disc*exp(-q*1.3)*.04*(.6+.8*nz);
          // the faint, flocculent outer disc: wisps of young light beyond the arms
          e+=mix(uCYoung,vec3(.8,.9,1.),.3)*smoothstep(.7,1.,q)*(1.-smoothstep(1.08,1.28,q))*smoothstep(-.1,.8,fbm(vec3(n*7.,uKnotT*.3)+uGalSeed.yxz,3)+.3*nz)*.1;
          dust=disc*dom*(lane*1.3+feather*.55+armL/max(dom*disc,1e-3)*fil*.35)+exp(-sq((q-.2)/.035))*(.4+1.4*fil)*(1.-smoothstep(.85,1.,abs(bn.x)/.2));
          // the bar's straight lanes on its leading edges
          dust+=isBar*exp(-sq((bn.y-.035*sign(bn.x))/.012))*(1.-smoothstep(.04,.17,abs(bn.x)))*smoothstep(.01,.04,abs(bn.x))*1.6;}
        else{float ring=exp(-sq((q-.66)/.08));float u=(q-.66)/.08;
          float th=atan(n.y,n.x);float spur=pow(max(0.,cos(th*30.+lq*9.+nz*4.)),5.)*smoothstep(.3,1.5,u)*exp(-max(u-1.,0.)*1.4)*smoothstep(-.1,.4,gn(vec3(cos(th)*3.,sin(th)*3.,lq)+uGalSeed));
          float cl=smoothstep(-.4,.6,gn(vec3(cos(th)*9.,sin(th)*9.,u*1.5)+uGalSeed)+.5*gn(vec3(n*50.,3.))+.3*nz);
          armL=ring;e+=ring*(uCYoung*2.6*(.45+.8*cl)*(.75+.4*nz))+uCHII*sq(smoothstep(.3,.78,nk))*exp(-sq((q-.62)/.04))*3.5+mix(uCYoung,vec3(1.),.3)*spur*.18;
          dust=exp(-sq((q-.575)/.022))*(.6+1.5*fil)+exp(-sq((q-.76)/.035))*fil*.7+pow(max(0.,cos(th*30.+lq*9.+nz*2.5+1.)),12.)*smoothstep(.3,1.5,u)*exp(-max(u-1.,0.))*.6;}
        // a commit's compression front: once from the core, brightening and sharpening the arms and lanes it passes
        if(uCk.y>0.){float fr=exp(-sq((q-uCk.x)/uCk.z));float wake=smoothstep(uCk.x,uCk.x-.3,q)*(1.-smoothstep(uCk.x-.3,uCk.x-.6,q));
          e*=1.+uCk.y*(fr*1.6+wake*.35);e+=mix(mix(uCYoung,vec3(1.,.97,.9),.5),uCOld*1.3,uCk.w)*fr*uCk.y*(.08+armL*.9)*(1.-smoothstep(1.,1.3,q));dust*=1.+uCk.y*(fr*.9+wake*.3);}
        // tidal streams between systems (dependencies): gas along a spiral-bent path in the plane, knots flowing
        for(int b=0;b<${NB};b++){vec4 I=uBrI[b];if(I.y<=0.)continue;vec4 bb=uBrB[b];if(n.x<bb.x||n.y<bb.y||n.x>bb.z||n.y>bb.w)continue;
          float dm=1e9,tm=0.;for(int k=0;k<${BK-1};k++){vec2 a=uBrP[b*${BK}+k],c=uBrP[b*${BK}+k+1];vec2 ac=c-a;float h=clamp(dot(n-a,ac)/max(dot(ac,ac),1e-8),0.,1.);float d=length(n-a-ac*h);if(d<dm){dm=d;tm=(float(k)+h)/${(BK-1).toFixed(1)};}}
          float w=I.x*(.75+.5*sin(tm*3.1416));float pr=exp(-dm*dm/(w*w));if(pr<.004)continue;
          float grow=1.-smoothstep(I.z-.04,I.z,tm);float ends=smoothstep(.0,.12,tm)*(1.-smoothstep(.88,1.,tm));
          float fl=.2+.8*smoothstep(-.2,.6,gn(vec3(tm*26.-uMV*(.3+.2*uBrX[b].z),I.w*9.,dm/w*1.5))+.4*gn(vec3(n*70.,I.w)));
          float pulse=exp(-sq((tm-uBrX[b].x)/.07))*uBrX[b].y;
          vec3 col=mix(uBrC0[b],uBrC1[b],tm);
          e+=col*pr*fl*grow*ends*I.y*(1.+pulse*5.)+col*exp(-dm*dm/(w*w*4.))*grow*ends*I.y*.03*(1.+pulse*3.);
          dust+=exp(-sq((dm-w*1.1)/(w*.4)))*.5*I.y*grow*ends*fl;}
        dust*=.3+.7*smoothstep(-.35,.3,nz);e*=uGal3.x;
        for(int k=0;k<${MEV};k++){vec4 Y=uMy[k];if(Y.y<=0.)continue;vec4 X=uMx[k];vec2 rel=n-X.xy;float rho=length(rel);float gl=dot(e,vec3(.3,.5,.2));
          if(Y.x<.5){if(abs(rho-X.z)>X.w*6.)continue;float ring=exp(-sq((rho-X.z)/X.w));float wake=step(rho,X.z)*exp(-(X.z-rho)/(X.w*5.));
            e+=uMc[k]*Y.y*(ring*(gl*1.1+dust*7.+.02)+wake*(gl*.25+dust*1.2));}
          else if(Y.x<1.5){float r=rho/X.z;if(r>1.6)continue;float ph=atan(rel.y,rel.x);float d1=stormD(r,ph,Y.w*17.,Y.z),d0=stormD(r-.09,ph,Y.w*17.,Y.z);
            float rim=pow(clamp((d1-d0)*2.5,0.,1.),1.5)*(1.-smoothstep(.3,1.1,r)*.6);float turb=pow(max(0.,gn(vec3(rel/X.z*6.,uMV*.35+Y.w*9.))),4.)*smoothstep(.3,.6,r)*(1.-smoothstep(.8,1.2,r));
            dust+=d1*Y.y*4.;e*=1.-d1*Y.y*.92;e+=uMc[k]*Y.y*(rim*.7+turb*.12)*(.25+gl*1.3)+vec3(.5,.15,.9)*turb*Y.y*.05;}
          else if(Y.x<2.5){float r=rho/X.z;if(r>2.)continue;float nzz=fbm(vec3(rel/X.z*2.2,Y.w*9.+uMV*.03),3);float dd=smoothstep(-.1,.6,1.-r+nzz*.7)*(1.-X.w)*.55;
            float ig=X.w;
            float lit=smoothstep(0.,.4,1.-r*.8+nzz*.7)*(.35+.9*smoothstep(-.3,.5,gn(vec3(rel/X.z*4.,Y.w*3.+uMV*.05))));
            float edgeL=smoothstep(.15,.45,dd)*(1.-smoothstep(.45,.9,dd));
            dust+=Y.y*dd*2.2;e*=1.-Y.y*dd*.6;e+=uMc[k]*Y.y*((exp(-r*r*12.)*.35+edgeL*.12)*(1.-ig)+ig*lit*(.35+gl*1.2+dust*1.5));}
          else{float r=rho/X.z;if(r>2.5)continue;e+=uMc[k]*Y.y*exp(-r*r)*(gl*.9+dust*2.5+.05);}}
        float edge=1.-smoothstep(1.12,1.32,q);gl_FragColor=vec4(max(e,0.)*edge,dust*edge);}`}));
  // ---- The galaxy raymarched through its disc slab (third resolution): rgb light, a transmittance ------------------
  // Besides the disc, the march carries the lasting remnants: limb-brightened shells of broken filaments, one per
  // system that earned them (the transient moments are drawn into the gas map above).
  const RM=8;
  const bgU={...common,...galU,uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uFar:{value:skyFar.texture},uNear:{value:skyNear.texture},uSkyRot:{value:0},
    uQ:{value:0},uUnlock:{value:new THREE.Vector4()},uGain:{value:2.1},uBulge:{value:1},uStorm:{value:0},uGalTex:{value:null},
    uRmA:{value:Array.from({length:RM},()=>new THREE.Vector4())},uRmB:{value:Array.from({length:RM},()=>new THREE.Vector4())},uRmN:{value:0},
    uRmC1:{value:new THREE.Color()},uRmC2:{value:new THREE.Color()},uRmC3:{value:new THREE.Color()}};
  const marchMat=keep(new THREE.ShaderMaterial({uniforms:bgU,vertexShader:BACKGROUND_VS,depthWrite:false,depthTest:false,
    fragmentShader:`${GN}${GALAXY}varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam;uniform float uQ,uV;
      uniform vec4 uRmA[${RM}],uRmB[${RM}];uniform int uRmN;uniform vec3 uRmC1,uRmC2,uRmC3;
      // Thin shells (light echo fronts, remnant filaments) are far thinner than a march step: they are intersected
      // analytically; each crossing is lit with the limb brightening of its path length and composited at its depth.
      float hT[24];vec3 hE[24];int nh=0;
      vec2 shell(vec3 o,vec3 d,vec3 c,float r,float sq){vec3 s=vec3(1.,1./sq,1.);vec3 oo=(o-c)*s,dd=d*s;float a=dot(dd,dd),b=dot(oo,dd),k=dot(oo,oo)-r*r,h=b*b-a*k;if(h<0.)return vec2(-1.);h=sqrt(h);return vec2((-b-h)/a,(-b+h)/a);}
      void main(){vec4 pp=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(pp.xyz/pp.w-uCam);
        vec3 o=rotY(uCam,-uGal.y),dir=rotY(d,-uGal.y);float R=uGal.x;bool cl=uGal2.w>.5&&uGal2.w<1.5;
        float Yb=R*${SLAB.toFixed(4)};float Y=cl?R*.9:Yb,RC=cl?R*1.1:R*${MAPR.toFixed(2)};float t0=0.,t1=-1.;
        if(abs(dir.y)<1e-5){if(abs(o.y)<Y){t0=0.;t1=1e6;}}else{float ta=(Y-o.y)/dir.y,tb=(-Y-o.y)/dir.y;t0=max(min(ta,tb),0.);t1=max(ta,tb);}
        if(cl){float b=dot(o,dir),c=dot(o,o)-RC*RC,h=b*b-c;if(h<0.)t1=-1.;else{h=sqrt(h);t0=max(t0,-b-h);t1=min(t1,-b+h);}}
        else{vec2 o2=o.xz,d2=dir.xz;float a=dot(d2,d2),b=dot(o2,d2),c=dot(o2,o2)-RC*RC,h=b*b-a*c;if(a<1e-8){if(c>0.)t1=-1.;}else if(h<0.)t1=-1.;else{h=sqrt(h);t0=max(t0,(-b-h)/a);t1=min(t1,(-b+h)/a);}}
        // remnant shells (lasting): broken limb-brightened filaments, Halpha rose (refactor: violet) with a thin teal inner edge
        for(int k=0;k<${RM};k++){if(k>=uRmN)break;vec4 A=uRmA[k],B=uRmB[k];float ly=min(abs(B.x),2.);vec3 hc=B.x<0.?uRmC3:uRmC1;
          for(int l=0;l<2;l++){float fl=float(l);if(fl>=ly)break;float rk=A.w*(1.-fl*.24);vec2 th=shell(o,dir,A.xyz,rk,B.w);if(th.y<0.)continue;
            for(int e=0;e<2;e++){float t=e==0?th.x:th.y;if(t<0.||nh>=24)continue;vec3 p=o+dir*t;vec3 rel=(p-A.xyz)*vec3(1.,1./B.w,1.);vec3 dr=rel/rk;
              vec3 g=normalize((p-A.xyz)*vec3(1.,1./(B.w*B.w),1.));float lim=min(1./max(abs(dot(g,dir)),.06),9.);
              float f=pow(max(0.,1.-abs(gn(dr*(2.1+fl*.8)+vec3(B.y*9.+fl*5.)))*4.),5.)+.12*pow(max(0.,1.-abs(gn(dr*4.+vec3(B.y*4.)))*4.),6.);
              float brk=smoothstep(.05,.4,gn(dr*1.2+vec3(B.y*13.+fl)));
              hT[nh]=t;hE[nh]=(hc*(f*brk*(1.-fl*.3)+.03*(.5+.5*brk))+uRmC2*pow(max(0.,1.-abs(gn(dr*2.6+vec3(B.y*7.+2.)))*4.),6.)*brk*.35)*B.z*lim*rk*.06/R;nh++;}}}
        vec3 L=vec3(0.);float T=1.;float Ts[44];float N=1.,ds=1.,j=0.;
        if(t1>t0){N=uQ>1.5?16.:clamp((t1-t0)/(2.*Y)*5.5,26.,44.);ds=(t1-t0)/N;j=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));float dn=ds/R;
          for(int i=0;i<44;i++){if(float(i)>=N)break;float tc=t0+(float(i)+j)*ds;vec3 p=o+dir*tc;vec3 em;float du,gl;
            if(cl){vec3 n=p/R;float r3=length(n*vec3(1.,1.35,1.));float nz=gn(n*5.+uGalSeed);em=mix(mix(uCOld,vec3(1.,.95,.9),.25),uCYoung,.1+.25*nz)*(exp(-r3*9.)*2.2+exp(-r3*3.2)*.22)*(.85+.3*nz)*uGal3.x;du=0.;gl=.3;}
            else{vec4 m=galMap(p.xz);float q=length(p.xz)/R;float H=galH(q)*R;float y2=p.y*p.y/(H*H);float ve=exp(-y2),vd=exp(-y2*4.5);float ring=uGal2.w>1.5&&uGal2.w<2.5?.55:1.;
              vec3 old=mix(uCOld,vec3(1.,.96,.92),.75)*(exp(-q*8.)*1.2+exp(-q*2.5)*.008)*(1.-smoothstep(.85,1.35,q))*exp(-abs(p.y)/(R*.012*(1.+q)))*.13*ring*uGal3.x;vec3 gas=m.rgb*ve*.5;du=m.a*vd*.55;
              // cloud structure close to the camera: a 3D erosion octave whose frequency rises as the disc comes near
              float wn=smoothstep(R*1.5,R*.7,tc);if(wn>0.&&uQ<1.5){float fq=16./R*clamp(R*.8/max(tc,.1),1.,4.5);float nd=gn(p*fq+uGalSeed*3.)+.5*gn(p*fq*2.3+uGalSeed.zxy);
                gas*=mix(1.,.45+1.1*smoothstep(-.45,.5,nd),wn);du*=mix(1.,.35+1.3*smoothstep(-.3,.5,nd+.1),wn);}
              em=gas+old;gl=dot(m.rgb,vec3(.3,.5,.2))*ve;}
            L+=T*em*dn;T*=exp(-du*min(uGal3.y,1.)*70.*dn-dn*.15);Ts[i]=T;}}
        for(int h=0;h<24;h++){if(h>=nh)break;float t=hT[h];float Th=1.;if(t1>t0&&t>t0){int ih=int(clamp(floor((t-t0)/ds-j),-1.,N-1.));Th=ih<0?1.:Ts[ih];}L+=hE[h]*Th;}
        gl_FragColor=vec4(L,T);}`}));
  const galRT=keep(new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}));bgU.uGalTex.value=galRT.texture;
  function renderGalaxy(q){const [w,h]=ctx.pipeline.size,dv=q>=2?4:3,gw=Math.max(1,Math.ceil(w/dv)),gh=Math.max(1,Math.ceil(h/dv));if(galRT.width!==gw||galRT.height!==gh)galRT.setSize(gw,gh);
    const ms=q>=2?512:1024;if(mapRT.width!==ms)mapRT.setSize(ms,ms);
    if(ARR!=='cluster')fsPass(mapMat,mapRT);fsPass(marchMat,galRT);}
  // The composite: the march upsampled, the deep sky behind it (dimmed where the view crosses the disc, so background
  // galaxies never show through it), and the bulge: a de Vaucouleurs cusp with a short bar, warm gold-white, whose
  // nucleus is the brightest light in the frame.
  const background_=keep(new THREE.ShaderMaterial({uniforms:bgU,vertexShader:BACKGROUND_VS,depthWrite:false,depthTest:false,
    fragmentShader:`${GN}${GALAXY}varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam;uniform samplerCube uFar,uNear;uniform sampler2D uGalTex;uniform float uV,uSkyRot,uGain,uBulge,uBeat,uStorm,uBreath;uniform vec4 uUnlock;
      float bulge(vec3 o,vec3 d,vec3 c,float s,float bar){vec3 oc=o-c;float tb=max(0.,-dot(oc,d));vec3 cp=oc+d*tb;float ba=uGal.w;
        vec2 bx=vec2(dot(cp.xz,vec2(cos(ba),sin(ba))),dot(cp.xz,vec2(-sin(ba),cos(ba))));
        float x=sqrt((bx.x*bx.x/(1.+bar*1.6)+bx.y*bx.y+cp.y*cp.y*1.5)/(s*s));float ser=exp(-7.67*(pow(max(x,.003),.25)-1.));
        float amp=clamp(dot(oc,oc)/(s*s*100.),.1,1.);return (ser*.05*exp(-x*x/2.5)+exp(-dot(cp,cp)/(s*s*.0012))*5.)*amp;}
      void main(){vec4 pp=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(pp.xyz/pp.w-uCam);
        vec3 sky=textureCube(uFar,rotY(d,uSkyRot)).rgb;vec4 nr=textureCube(uNear,rotY(d,uSkyRot*1.3));sky=sky*exp(-nr.a)+nr.rgb;
        if(uUnlock.x>0.){float veil=uUnlock.x*smoothstep(.15,.7,gn(vec3(d.x*3.,d.y*8.-uV*.04,d.z*3.)))*exp(-sq(d.y*2.5-.6));sky+=mix(uCHII,vec3(.4,1.,.75),.6)*veil*.18;}
        if(uUnlock.z>0.){vec3 pd=normalize(vec3(.62,.32,-.71));float cpd=dot(d,pd);if(cpd>.8){float pa=acos(clamp(cpd,-1.,1.));vec3 ax=normalize(cross(pd,vec3(0.,1.,0.)));
          float beam=pow(abs(dot(normalize(d-pd*cpd+1e-5),rotY(ax,uV*2.4))),40.)*exp(-pa*9.);sky+=uUnlock.z*(vec3(.7,.85,1.)*(exp(-pa*160.)*(1.2+.8*uBeat)+beam*.5));}}
        vec2 gt=vec2(.75)/vec2(textureSize(uGalTex,0));vec4 g=texture2D(uGalTex,vUv)*.36+(texture2D(uGalTex,vUv+gt)+texture2D(uGalTex,vUv-gt)+texture2D(uGalTex,vUv+vec2(gt.x,-gt.y))+texture2D(uGalTex,vUv-vec2(gt.x,-gt.y)))*.16;
        vec3 o=rotY(uCam,-uGal.y),dir=rotY(d,-uGal.y);float R=uGal.x;
        if(o.y*dir.y<0.){float th=-o.y/dir.y;sky*=mix(.12,1.,smoothstep(R*.8,R*1.3,length(o.xz+dir.xz*th)));}
        float sb=R*(PROTO>.5?.08:.11);vec3 bl;vec3 gold=vec3(1.,.886,.69);
        if(uGal2.w>2.5){vec3 ax2=vec3(cos(uGal3.w),0.,sin(uGal3.w))*R*.2;bl=mix(uCOld,gold,.6)*(bulge(o,dir,ax2,sb*.8,0.)+bulge(o,dir,-ax2,sb*.8,0.));}
        else bl=(PROTO>.5?mix(gold,uCYoung,.45):mix(uCOld,gold,.75))*bulge(o,dir,vec3(0.),sb,uGal2.w<.5?1.:0.);
        vec3 col=g.rgb*uGain+sky*g.a+bl*uBulge*uGal3.x*(.06+.94*g.a)*(1.+.05*uBreath);
        float l=dot(col,vec3(.3,.5,.2));col=mix(col,vec3(l)*vec3(1.,.84,.88),uStorm*.25)*(1.-uStorm*.08);
        gl_FragColor=vec4(col,1.);}`.replace(/PROTO/g,PROTOSTAR?'1.':'0.')}));
  // ---- The disc sheet: the thin gas and dust of the map rasterised at full resolution in the galactic plane ----------
  // (crisp arms, lanes, feathers and streams at any distance; the march above carries the thick, soft component). It
  // dims what lies behind it by its dust (blend: emission + destination x transmittance) and gains optical depth at
  // grazing angles, so the far rim is a thin bright line cut by one sharp midplane lane.
  const sheetGeo=keep(new THREE.PlaneGeometry(2,2,1,1));sheetGeo.rotateX(-Math.PI/2);
  const sheetMat=keep(new THREE.ShaderMaterial({uniforms:{...common,...galU,uSheet:{value:new THREE.Vector2(1,1)}},transparent:true,depthWrite:false,depthTest:false,side:THREE.DoubleSide,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.SrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
    vertexShader:`${GN}${GALAXY}varying vec3 vL,vW;void main(){float R=uGal.x;vec3 lp=position*R*${MAPR.toFixed(2)};vL=lp;vW=rotY(lp,uGal.y);gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.);}`,
    fragmentShader:`${GN}${GALAXY}uniform vec2 uSheet;varying vec3 vL,vW;
      void main(){float R=uGal.x;float q=length(vL.xz)/R;if(q>${MAPR.toFixed(2)})discard;vec4 m=galMap(vL.xz);vec3 v=cameraPosition-vW;float dist=length(v);v/=dist;
        float path=min(1./max(abs(v.y),.04),9.);
        // close to the camera the map is magnified: a finer octave of cloud structure takes over
        float wn=smoothstep(R*1.3,R*.45,dist);vec3 e=m.rgb;float a=m.a;
        if(wn>0.){float fq=26./R*clamp(R*.6/max(dist,.1),1.,6.);vec3 pq=vec3(vL.xz*fq,0.)+uGalSeed*5.;float nd=gn(pq)+.5*gn(pq*2.3+3.1)+.25*gn(pq*5.1+7.);
          float rd=pow(max(0.,1.-abs(gn(pq*.8+11.)+.5*gn(pq*1.9+5.))*1.6),3.);
          e*=mix(1.,.5+.9*smoothstep(-.6,.6,nd),wn);a*=mix(1.,.45+.7*smoothstep(-.3,.5,nd)+.6*rd,wn);}
        float T=exp(-a*uSheet.y*uGal3.y*min(path,5.)*.9);
        // the far half of the bulge stands above the plane: dust behind the centre does not dim it
        float cb=(1.-smoothstep(.06,.3,q))*smoothstep(-.25,.25,dot(normalize(-vL),rotY(v,-uGal.y)));
        T=mix(T,1.,cb*.85);
        gl_FragColor=vec4(e*uSheet.x*(.45+.12*min(path,6.))*T,T);}`}));
  const sheet=new THREE.Mesh(sheetGeo,sheetMat);add(sheet,-2.5);sheet.visible=ARR!=='cluster';
  // ---- Galaxy stars (GPU points following the galaxy's structure) and the distant sky -----------------------------
  // A steep brightness law: most stars blend into unresolved light, a few bright ones stand out. HII regions are soft
  // nebular blobs strung along the arms' leading edges. Stars close to the camera defocus into soft discs.
  const GSTARS=Math.round(clamp(90000+55000*clamp(num(atm.stars,.8),0,1.5),60000,180000));
  const gal=pointBuffers({gA:4,gC:3},GSTARS);
  {const r=rng(hash(`galaxy-stars/${seed}/${ARR}`));const gauss=()=>(r()+r()+r()+r()+r()+r()-3)*.7071;const lum=()=>Math.min(3,.028/Math.pow(1-r()*.9985,.8));
    const old=[new THREE.Color('#ffd2a1'),new THREE.Color('#ffe6c4'),new THREE.Color('#ffb98a')],young=[new THREE.Color('#a8c8ff'),new THREE.Color('#d9e6ff'),cYoung],hii=mix3(cHII,new THREE.Color('#ffd0dc'),.25);
    const H=.008+.02*VERTICAL;const KN=ARR==='cluster'?0:Math.round(GSTARS*.003/8)*8;
    for(let i=0;i<GSTARS;i++){
      let x,y,z,c,b,kind=0;const k=r();
      if(i<KN){// HII knot clusters (soft blobs), 6 per cluster, on the leading edge of an arm (or on the ring)
        const cr=rng(hash(`knot/${seed}/${Math.floor(i/8)}`));let q,a;
        if(ARR==='ring'){q=.66+(cr()-.5)*.1;a=cr()*TAU;}else{do{q=-Math.log(1-cr()*.96)/2.2;}while(q>.85||q<.12);const arm=Math.floor(cr()*ARMS);a=ARM0+arm/ARMS*TAU+Math.log(q)/TANP+.2/ARMS+(cr()-.5)*.06;}
        x=Math.cos(a)*q+gauss()*.014;z=Math.sin(a)*q+gauss()*.014;y=gauss()*H*.3;c=hii.clone();b=.04+r()*.07;kind=1;}
      else if(k<.13){const s=PROTOSTAR?.07:.1;let cx=0,cz=0;if(ARR==='binary-core'){const side=r()<.5?1:-1;cx=Math.cos(ARM0)*.2*side;cz=Math.sin(ARM0)*.2*side;}
        x=cx+gauss()*s;z=cz+gauss()*s;y=gauss()*s*.62;c=old[Math.floor(r()*3)].clone();b=lum()*.6;kind=2;}
      else if(ARR==='cluster'){const rr=Math.pow(r(),1.7)*.95,u=r()*2-1,a=r()*TAU,s=Math.sqrt(1-u*u);x=Math.cos(a)*s*rr;z=Math.sin(a)*s*rr;y=u*rr/1.3;
        c=(r()<.82?old[Math.floor(r()*3)]:young[Math.floor(r()*3)]).clone();b=lum()*.7;}
      else if(ARR==='ring'){const onRing=k<.8;const q=onRing?.66+gauss()*.06:Math.pow(r(),.7)*1.1;const a=r()*TAU;x=Math.cos(a)*q;z=Math.sin(a)*q;y=gauss()*H*(.55+.9*q);
        c=(onRing?young[Math.floor(r()*3)]:old[Math.floor(r()*3)]).clone();b=lum()*(onRing?.9:.5);}
      else{let q;do{q=-Math.log(1-r()*.96)/2.2;}while(q>1.3);const onArm=r()<.62;let a;
        // arm stars: half of them in OB associations (tight groups strung along the arm), the rest scattered across it
        let assoc=false;if(onArm&&r()<.5){const ar=rng(hash(`assoc/${seed}/${Math.floor(r()*420)}`));do{q=-Math.log(1-ar()*.96)/1.7;}while(q>1.15||q<.12);
          const arm=Math.floor(ar()*ARMS);a=ARM0+arm/ARMS*TAU+Math.log(q)/TANP+(ar()-.65)*.5/ARMS;const sc=.006+ar()*.012;q+=gauss()*sc;a+=gauss()*sc/Math.max(q,.05);assoc=true;}
        else if(onArm){const arm=Math.floor(r()*ARMS);a=ARM0+arm/ARMS*TAU+Math.log(Math.max(q,.02))/TANP+gauss()*(.13+.2*q)*(1/Math.max(1,ARMS*.5));}else a=r()*TAU;
        x=Math.cos(a)*q;z=Math.sin(a)*q;y=gauss()*H*(.55+.9*q)*(onArm?(assoc?.4:.8):1.2);
        c=(onArm?young[Math.floor(r()*3)]:old[Math.floor(r()*3)]).clone();b=lum()*(assoc?1.5:onArm?.8:.32);}
      gal.write('position',i,x,y,z);gal.write('gA',i,b,r(),r(),kind);gal.write('gC',i,c.r,c.g,c.b);}
    gal.commit(GSTARS);}
  const galMat=keep(new THREE.ShaderMaterial({uniforms:{...common,...galU,uGalTex:bgU.uGalTex,uRotX:{value:0},uRich:{value:1},uWave:{value:new THREE.Vector4(-100,0,0,0)},uExpand:{value:new THREE.Vector4(-100,0,0,0)}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${GN}${GALAXY}attribute vec4 gA;attribute vec3 gC;uniform float uV,uPx,uRotX,uRich,uMotion;uniform vec4 uWave,uExpand;uniform sampler2D uGalTex;varying vec3 vC;varying float vK;
      void main(){float R=uGal.x;vec3 lp=position*R;float ph=gA.z*6.283;
        lp.xz+=vec2(cos(uV*.03*uMotion+ph),sin(uV*.03*uMotion+ph))*R*.0025;
        if(gA.w<1.5)lp=rotY(lp,uRotX);
        float r=length(lp.xz);float age=uV-uWave.x;float wr=age*R*.42;float env=uWave.y*exp(-sq((r-wr)/(R*.05)))*exp(-age*.3);lp.y+=env*sin((r-wr)*1.4/R*6.283)*R*.012;
        float ea=uV-uExpand.x;float ew=ea*R*.25;float exb=uExpand.y*exp(-sq((r-ew)/(R*.08)))*exp(-ea*.25);
        float H=galH(r/R)*R;vec4 gm=galMap(lp.xz);bool clu=uGal2.w>.5&&uGal2.w<1.5;float dust=gA.w>1.5||clu?0.:gm.a*exp(-lp.y*lp.y/(H*H*.25))*uGal3.y;
        // where the light is bright and smooth (the bulge, arm crests) faint stars are unresolved: they fade into it
        float sbr=clu?0.:dot(gm.rgb,vec3(.3,.5,.2));float unres=gA.w>1.5?1.-smoothstep(.05,.24,length(lp)/R):smoothstep(.6,2.2,sbr)*(1.-smoothstep(.2,.9,gA.x));
        vec3 w=rotY(lp,uGal.y);vec4 mv=viewMatrix*vec4(w,1.);gl_Position=projectionMatrix*mv;float dist=max(.5,-mv.z);
        float knot=gA.w>.5&&gA.w<1.5?1.:0.;
        float base=uPx*(1.+sqrt(gA.x)*.9)*clamp(R*1.1/dist,.6,1.6);
        float df=clamp((R*.75-dist)/(R*.75),0.,1.)*step(.3,gA.x);float sz=knot>.5?uPx*(4.+fract(gA.z*7.)*4.)*clamp(R*1.3/dist,.5,1.6):base+df*df*6.*uPx;
        float vis=smoothstep(gA.y-.04,gA.y,uRich);
        gl_PointSize=max(sz,1.);vK=knot;
        float kn=knot>.5?.45+.55*smoothstep(-.6,.8,sin(uV*.045+ph*3.)):1.;
        float occ=gA.w>1.5?.12+.88*pow(texture2D(uGalTex,gl_Position.xy/gl_Position.w*.5+.5).a,.7):1.;
        vC=gC*gA.x*exp(-dust*2.6)*occ*vis*(1.-unres*.92)*(knot>.5?1.:base*base/(sz*sz))*(1.+env*3.+exb*2.)*kn*smoothstep(.5,3.,dist);}`,
    fragmentShader:`varying vec3 vC;varying float vK;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*(vK>.5?exp(-r*2.5)*(1.-r):exp(-r*4.5)*1.5),1.);}`}));
  add(new THREE.Points(gal.geometry,galMat),-2);
  const SKY=Math.round(3000+3000*clamp(num(atm.stars,.8),0,1.5)),sky=pointBuffers({sInfo:4},SKY);
  {const r=rng(hash(`sky/${seed}`));for(let i=0;i<SKY;i++){const u=r()*2-1,a=r()*TAU,s=Math.sqrt(1-u*u);sky.write('position',i,Math.cos(a)*s*1500,u*1500,Math.sin(a)*s*1500);sky.write('sInfo',i,Math.pow(r(),4)*2.2+.18,r()*TAU,.4+r()*2.2,r());}sky.commit(SKY);}
  const skyMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uSkyRot:bgU.uSkyRot},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 sInfo;uniform float uV,uPx,uSkyRot;varying float vB,vT;void main(){float c=cos(-uSkyRot),s=sin(-uSkyRot);vec3 p=vec3(c*position.x-s*position.z,position.y,s*position.x+c*position.z);
      vec4 mv=viewMatrix*vec4(p+cameraPosition,1.);gl_Position=projectionMatrix*mv;vB=sInfo.x*.9;vT=sInfo.w;gl_PointSize=clamp(sInfo.x*1.6*uPx,1.,4.5);}`,
    fragmentShader:`varying float vB,vT;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;vec3 c=mix(vec3(.72,.82,1.),vec3(1.,.86,.72),vT);gl_FragColor=vec4(c*vB*exp(-r*3.5),1.);}`}));
  add(new THREE.Points(sky.geometry,skyMat),-3);
  // Galactic halo (unlock): old globular clusters around the galaxy.
  const HALO=900,halo=pointBuffers({hA:4},HALO);
  {const r=rng(hash(`halo/${seed}`));for(let i=0;i<HALO;i++){const cl=Math.floor(i/60),cr=rng(hash(`halo/${seed}/${cl}`));const u=cr()*2-1,a=cr()*TAU,s=Math.sqrt(1-u*u),rr=.75+cr()*.7;
    const g=()=>(r()+r()+r()-1.5)*.03;halo.write('position',i,Math.cos(a)*s*rr+g(),u*rr*.7+g(),Math.sin(a)*s*rr+g());halo.write('hA',i,.4+r()*.8,r(),0,0);}halo.commit(HALO);}
  const haloMat=keep(new THREE.ShaderMaterial({uniforms:{...common,...galU,uHalo:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 hA;uniform vec4 uGal;uniform float uPx,uHalo;varying float vB;vec3 rY(vec3 d,float a){float c=cos(a),s=sin(a);return vec3(c*d.x-s*d.z,d.y,s*d.x+c*d.z);}
      void main(){vec4 mv=viewMatrix*vec4(rY(position*uGal.x,uGal.y),1.);gl_Position=projectionMatrix*mv;gl_PointSize=max(1.,uPx*1.6);vB=hA.x*uHalo;}`,
    fragmentShader:`varying float vB;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.||vB<.001)discard;gl_FragColor=vec4(vec3(1.,.88,.72)*vB*exp(-r*3.),1.);}`}));
  add(new THREE.Points(halo.geometry,haloMat),-2);
  // ---- Stars (one per subsystem): photosphere (resolved only up close), point-spread glow and corona ----------------
  const stormC=mix3(pal.warning,new THREE.Color('#c0123c'),.55),stormV=mix3(stormC,new THREE.Color('#8a2bff'),.35);
  const starBase=keep(new THREE.IcosahedronGeometry(1,4));
  const stars=instancedBuffers(starBase,{iStar:4,iStarColor:3,iStarFx:4},16);
  const starMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uGran:{value:clamp(num(sec.granulation,1),.2,2.2)*clamp(num(mot.convection,1),.2,2.2)},uStressC:{value:stormC}},
    vertexShader:`${SCREEN}attribute vec4 iStar,iStarFx;attribute vec3 iStarColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uSpeed,uBreath;
      varying vec3 vN,vP,vC,vW;varying vec4 vS,vF;
      void main(){vec4 sys=uSys[int(iStar.x)];float age=(uT-iStar.y)/uSpeed;
        float grow=age<0.?0.:age<2.6?.35+.15*age/2.6:age<3.5?.5+.5*smoothstep(2.6,3.3,age)+.12*sin((age-2.6)*3.5)*(3.5-age):1.;
        float flare=iStar.z>-1e4&&uT>=iStar.z?exp(-(uT-iStar.z)/uSpeed*.8):0.;
        float r=sys.w*grow*(1.+.05*flare);float px=r*pxPer(sys.xyz);float pd=squeezeS(px);pd=mix(min(pd,12.),pd,iStarFx.y);float vis=smoothstep(7.,11.5,pd)*(1.-iStarFx.w);
        float rv=r*pd/max(px,1e-4)*vis;
        vP=position;vN=normal;vC=iStarColor;vS=vec4(iStar.xyw,age);vF=vec4(flare,iStarFx.yzw);
        vec3 w=sys.xyz+position*rv;vW=w;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${GN}uniform float uV,uGran,uBreath;uniform vec3 uStressC;varying vec3 vN,vP,vC,vW;varying vec4 vS,vF;
      void main(){vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);float mu=clamp(dot(n,v),0.,1.);
        float t=uV*.06*uGran;vec3 p=vP*4.+vS.x*3.1;
        float cells=1.-abs(gn(p*2.1+vec3(0.,t,t*.5)));float fine=gn(p*6.3+vec3(t*1.9,0.,0.));float big=gn(p*.7+vec3(t*.3));
        float gran=.5+.62*cells*cells+.16*fine+.2*big;
        float spots=smoothstep(.5,.75,gn(vP*1.7+vec3(t*.15,vS.x,0.)))*(.35+vS.z*.65);
        float fac=smoothstep(.2,.6,gn(vP*3.+vec3(vS.x)))*sq(1.-mu)*.6;
        float ld=.3+.7*pow(mu,.5);
        vec3 hot=mix(vC,vec3(1.,.97,.92),.45);vec3 limb=vC*vec3(1.,.62,.4);
        vec3 c=mix(limb,hot,pow(mu,.4))*gran*ld*(1.-spots*.7)+vC*fac;
        // a stressed subsystem: magnetic unrest, the light reddens, dims and flickers
        float st=vS.z;float flick=.7+.3*gn(vec3(uV*3.,vS.x*7.,0.));c=mix(c,c*vec3(1.05,.45,.42)+uStressC*cells*.5,st*.7);c*=1.-st*(.3+.25*(1.-flick));
        float proto=vS.w>=0.&&vS.w<2.6?1.-vS.w/2.6*.3:0.;c=mix(c,vec3(.9,.3,.15)*(.4+cells*.4),proto*.85);
        float ign=vS.w>2.5&&vS.w<4.?exp(-(vS.w-2.6)*2.5):0.;
        c*=1.5*(1.+vF.x*1.2+ign*2.5+.05*uBreath);gl_FragColor=vec4(c,1.);}`}));
  add(new THREE.Mesh(stars.geometry,starMat),0);
  const quad=keep(new THREE.PlaneGeometry(2,2));
  const coronaGeo=keep(new THREE.InstancedBufferGeometry());coronaGeo.index=quad.index;coronaGeo.setAttribute('position',quad.attributes.position);
  const CS=4.2;
  const coronaMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uCorona:{value:clamp(num(sec.corona,.8),0,1.6)},uLoops:{value:clamp(num(sec.loops,4),0,8)},uStressC:{value:stormV}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${SCREEN}attribute vec4 iStar,iStarFx;attribute vec3 iStarColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uSpeed,uPx;varying vec2 vUv;varying vec3 vC;varying vec4 vS;varying float vFlash,vGrow,vAge,vHalf,vRv,vPP,vVis,vLum,vCor,vNova;
      void main(){vec4 sys=uSys[int(iStar.x)];float age=(uT-iStar.y)/uSpeed;vAge=age;vGrow=age<0.?0.:age<2.6?.12+.18*age/2.6:age<4.?1.+2.6*exp(-(age-2.6)*2.2):1.;
        float flare=iStar.z>-1e4&&uT>=iStar.z?exp(-(uT-iStar.z)/uSpeed*.6):0.;vFlash=flare;
        float r=sys.w*(age<2.6&&age>=0.?.55:1.);float pp=pxPer(sys.xyz);float px=r*pp;float pd=squeezeS(px);pd=mix(min(pd,12.),pd,iStarFx.y);
        vVis=smoothstep(7.,11.5,pd)*(1.-iStarFx.w);vCor=smoothstep(5.,13.,pd)*(1.-iStarFx.w);float rv=r*pd/max(px,1e-4);
        float na=(uT-iStarFx.x)/uSpeed;vNova=na>=0.&&na<1.4?exp(-na*3.2)*smoothstep(0.,.06,na):0.;
        float S=max(rv*${CS.toFixed(1)},(56.+170.*vNova)*uPx/pp);vHalf=S;vRv=rv;vPP=pp;vLum=(.55+.45*sys.w/1.1)*(iStarFx.w>.5?.45:1.);
        vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        vec3 w=sys.xyz+(right*position.x+up*position.y)*S;vUv=position.xy;vC=iStarColor;vS=vec4(iStar.x,iStar.w,iStarFx.z,0.);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${GN}uniform float uV,uCorona,uLoops,uBreath,uBeat,uPx;uniform vec3 uStressC;varying vec2 vUv;varying vec3 vC;varying vec4 vS;varying float vFlash,vGrow,vAge,vHalf,vRv,vPP,vVis,vLum,vCor,vNova;
      void main(){vec2 P=vUv*vHalf;float r=length(P)/vRv;float dpx=length(P)*vPP/uPx;float a=atan(vUv.y,vUv.x);float ex=max(r-1.,0.);float st=vS.y;
        vec3 sc=mix(vC,uStressC,st*.8);
        // point-spread glow (always) and its slow breathing: the star at galaxy scale
        float breathe=1.+.12*sin(uV*.33+vS.z*40.)+.05*uBreath+.02*uBeat;float flick=1.-st*(.25+.2*gn(vec3(uV*3.,vS.x*7.,0.)));
        float dl=max(0.,dpx-vRv*vPP/uPx*vVis*.97);float core=exp(-dpx*dpx/5.)*2.6*(1.-vVis*.9),glow=exp(-dl/5.5)*.55+exp(-dl/19.)*.1;
        vec3 c=(mix(sc,vec3(1.,.97,.93),.6)*core+sc*glow*breathe)*vLum*flick;
        // resolved corona: streamers and prominences (up close), eruptions on one limb when the subsystem is under strain
        if(r<${CS.toFixed(1)}){float edge=1.-smoothstep(${(CS*.55).toFixed(2)},${CS.toFixed(1)},r);
          float flow=uV*(.02+.05*st);float strm=fbm(vec3(cos(a)*2.2,sin(a)*2.2,log(max(r,1.))*1.3-flow)+vS.x*3.7+vec3(st*uV*.3,0.,0.),2)*.6+.5;
          float rays=pow(max(strm,0.),3.2)*exp(-ex*.85);float halo=exp(-ex*7.)*1.3+exp(-ex*1.6)*.4;
          float prom=0.;for(int i=0;i<8;i++){if(float(i)>=uLoops)break;float fi=float(i);float ang=fi*2.39+vS.x*1.7+sin(uV*.017+fi*1.3)*.5;
            float da=mod(a-ang+3.1416,6.2832)-3.1416;float w=.09+.04*sin(fi*3.1),hgt=.1+.08*fract(fi*.618)+.03*sin(uV*.05+fi);
            float e=sqrt(da*da/(w*w)+ex*ex/(hgt*hgt));prom+=exp(-sq((e-1.)*7.))*step(0.,ex)*(.25+.2*sin(uV*.11+fi*2.));}
          vec3 cc=sc*(halo*.45+rays*.45*uCorona+prom*.9*uCorona)*breathe+vec3(1.,.95,.88)*vFlash*exp(-ex*1.6)*.6;
          vec2 g=abs(P)/vRv;float glare=exp(-g.y*7.)*exp(-g.x*.75)*.3;cc+=mix(sc,vec3(.8,.88,1.),.5)*glare*(1.-st*.7);
          c+=cc*smoothstep(.97,1.03,r)*edge*vCor;
          float ea=vS.z*6.2832+.25*sin(uV*.07+vS.z*9.);float db=mod(a-ea+3.1416,6.2832)-3.1416;
          float er=pow(max(0.,1.-abs(gn(vec3(db*4.,r*1.4-uV*.8,vS.z*5.))*2.2)),3.)*exp(-db*db*4.)*exp(-ex*.6)*smoothstep(.95,1.2,r);
          c+=uStressC*er*st*2.4*edge;}
        c*=vGrow*(1.-smoothstep(.8,1.,length(vUv)));
        // a nova: a brief, hard point-spread spike (a crisp core and four diffraction rays), gone within a second
        if(vNova>.002){vec2 q=P*vPP/uPx;float L=150.*vNova+20.;float sp=exp(-abs(q.y)/.9)*exp(-abs(q.x)/L)+exp(-abs(q.x)/.9)*exp(-abs(q.y)/L);
          c+=vec3(1.,.98,.95)*vNova*(exp(-dot(q,q)/18.)*40.+exp(-length(q)/9.)*3.+sp*4.);}
        gl_FragColor=vec4(c,1.);}`}));
  for(const k of ['iStar','iStarColor','iStarFx'])coronaGeo.setAttribute(k,stars.geometry.attributes[k]);
  add(new THREE.Mesh(coronaGeo,coronaMat),3);
  // ---- Planets ---------------------------------------------------------------------------------------------------
  const PLANET_VS=`${ORBIT}${SCREEN}attribute vec4 iOrbit,iLife,iLook;attribute vec3 iTilt,iColor;attribute vec2 iGlow;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed;
      varying vec3 vN,vW,vL,vC,vToStar,vCen;varying vec4 vLook,vLife;varying vec2 vGlow;varying float vBirth,vSize,vPxD;
      void main(){vec4 sys=uSys[int(iTilt.z)];float age=(uT-iLife.x)/uSpeed;float gone=iLife.y<1e5?clamp((uT-iLife.y)/uSpeed/1.4,0.,1.):0.;
        float grow=smoothstep(0.,2.2,age)*(1.-gone);vBirth=age>0.&&age<2.2?1.-age/2.2:0.;
        vec3 c=orbitPos(sys.xyz,iOrbit.x,iOrbit.y,iOrbit.z,iTilt.xy,uV);
        float pb=iOrbit.w*pxPer(c);float sq=squeezeP(pb)/max(pb,1e-4);vPxD=pb*sq*grow;
        float spin=uV*(.05+fract(iGlow.y*13.)*.08);float cs=cos(spin),sn=sin(spin);vL=vec3(position.x*cs-position.z*sn,position.y,position.x*sn+position.z*cs);
        float sz=iOrbit.w*sq*grow*SHELL*step(6.,vPxD);vec3 w=c+position*sz;vW=w;vN=normal;vC=iColor;vLook=iLook;vLife=iLife;vGlow=iGlow;vToStar=normalize(sys.xyz-c);vCen=c;vSize=iOrbit.w*sq*grow;
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`;
  const planetBase=keep(new THREE.IcosahedronGeometry(1,4));
  const planets=instancedBuffers(planetBase,{iOrbit:4,iTilt:3,iLife:4,iLook:4,iColor:3,iGlow:2},64);
  const planetMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uValid:{value:pal.valid},uStress:{value:stormC},uDraft:{value:new THREE.Color('#ff7a2e')},
      uContrast:{value:clamp(num(mtl.surfaceContrast,.9),.2,1.8)},uAtmo:{value:clamp(num(mtl.atmosphereGlow,.7),0,1.6)}},
    vertexShader:PLANET_VS.replace('SHELL','1.'),
    fragmentShader:`${GN}uniform float uT,uV,uSpeed,uContrast,uAtmo;uniform vec3 uValid,uStress,uDraft;
      varying vec3 vN,vW,vL,vC,vToStar,vCen;varying vec4 vLook,vLife;varying vec2 vGlow;varying float vBirth,vSize,vPxD;
      vec3 surface(float style,float sub,vec3 q,float s,out float spec,out vec3 atmo){spec=0.;atmo=vC;
        if(style<.5){float wq=fbm(q*vec3(2.,5.,2.)+s,3);float lat=q.y;float b=sin(lat*(9.+fract(s)*9.)+wq*3.4)*.5+.5;float b2=sin(lat*23.+wq*6.)*.5+.5;
          vec3 c=mix(vC*.45,mix(vC*1.2,vec3(1.,.93,.82),.3),b)*(.85+.25*b2);
          float lon=atan(q.z,q.x);float spot=exp(-sq(mod(lon-s*3.+3.1416,6.2832)-3.1416)*5.-sq((lat-.32)*9.));c=mix(c,vec3(1.,.55,.4)*vC*1.4,spot*.8);
          atmo=mix(vC,vec3(.8,.9,1.),.4);return c;}
        if(style<1.5){float f=abs(gn(q*3.2+s));float g=abs(gn(q*7.+s*2.));float facet=pow(1.-f,3.*uContrast);spec=.9*(1.-g);
          atmo=vC*1.2;return mix(vC*.18,vC*1.25+.08,facet)+vC*pow(1.-g,8.)*.6;}
        if(style<2.5){float cr=smoothstep(.9,1.,1.-abs(gn(q*5.5+s)));float cr2=smoothstep(.93,1.,1.-abs(gn(q*13.+s)));float cap=smoothstep(.55,.85,abs(q.y));
          spec=.4;atmo=vec3(.6,.85,1.);return mix(mix(vec3(.62,.78,.95),vC*.9+.15,.25)*(.85+.15*fbm(q*3.+s,2)),vec3(.97,.99,1.),cap)-vec3(.3,.18,.05)*(cr+cr2*.6);}
        if(style<3.5){float f=fbm(q*2.3+s,4);float land=smoothstep(-.02,.1,f);float cl=smoothstep(.08,.45,fbm(q*3.1+vec3(uV*.008,0.,0.)+s*2.,4));
          if(sub<.5){vec3 ocean=mix(vec3(.02,.07,.2),vC*.25,.35);vec3 ground=mix(vec3(.18,.3,.12),mix(vec3(.5,.4,.25),vC*.6,.4),smoothstep(.1,.3,f));spec=(1.-land)*.9;atmo=vec3(.45,.7,1.);
            return mix(mix(ocean,ground,land),vec3(.95),cl*.8);}
          if(sub<1.5){float dune=sin(q.x*14.+f*9.)*.5+.5;spec=0.;atmo=vec3(1.,.7,.45);return mix(vec3(.45,.2,.1),mix(vec3(.85,.55,.3),vC*.8,.3),f*1.4+.4)*(.8+.2*dune)+vec3(.9,.85,.8)*cl*.25;}
          spec=.6;atmo=vec3(.6,.9,1.);float cr=smoothstep(.92,1.,1.-abs(gn(q*6.+s)));return mix(vec3(.75,.85,.95),vec3(.05,.12,.25),land*.3+cr*.7);}
        float cra=0.;for(int i=0;i<3;i++){vec3 cq=q*(2.5+float(i)*2.3)+s+float(i)*7.;float d=length(fract(cq)-.5);cra+=(1.-smoothstep(.28,.32,d))*.3-(1.-smoothstep(.32,.36,d))*smoothstep(.28,.32,d)*.25;}
        atmo=vec3(0.);return vec3(.38,.37,.4)*(.75+.5*fbm(q*3.+s,3))-cra*.4+vC*.06;}
      vec3 stateLight(float st,vec3 c,vec3 q,float rim,float s,float lit){
        if(st<.5){float cracks=smoothstep(.86,.98,1.-abs(gn(q*4.4+vec3(uV*.15))));float crust=.55+.45*fbm(q*3.+s,2);return c*vec3(.55,.42,.36)*crust+uDraft*cracks*1.6+uDraft*rim*.55;}
        if(st>2.5){float storm=smoothstep(.05,.65,fbm(q*2.6+vec3(0.,uV*.3,uV*.15),3));float night=1.-smoothstep(0.,.45,lit);
          float bolt=pow(max(0.,gn(q*9.+vec3(uV*3.))),6.)*step(.62,fract(uV*.55+s));vec3 grey=vec3(dot(c,vec3(.3,.5,.2)));
          return mix(c,grey,.55)*.7*(1.-storm*.35)+uStress*storm*(.12+1.2*night)+uStress*rim*.3+vec3(1.,.6,.75)*bolt*night*2.2;}
        if(st>1.5){float oval=exp(-sq((abs(q.y)-.84+.04*sin(atan(q.z,q.x)*3.+s))/.045));float curtain=.55+.45*sin(atan(q.z,q.x)*11.+uV*.7+gn(q*3.+uV*.06)*3.);return c+uValid*(oval*curtain*1.3*(.35+.65*(1.-lit))+rim*.35);}
        return c;}
      void main(){vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);vec3 L=normalize(vToStar);float s=vGlow.y*17.;
        float spec;vec3 atmo;vec3 base=surface(vLook.x,vLook.w,vL,s,spec,atmo);float nl=dot(n,L);float diff=smoothstep(-.08,.35,nl)*max(nl*.75+.25,0.);
        float mu=max(0.,dot(n,v));float rim=pow(1.-mu,2.6);
        vec3 c=base*(.06+1.15*diff)+atmo*.02;
        vec3 hv=normalize(L+v);c+=vec3(1.,.95,.88)*pow(max(dot(n,hv),0.),60.)*spec*diff*1.5;
        float atm=vLook.x>3.5?0.:1.;c+=atmo*rim*smoothstep(-.35,.45,nl)*1.1*uAtmo*atm;
        float k=clamp((uT-vLife.z)/uSpeed/1.4,0.,1.);
        c=mix(stateLight(vLook.z,c,vL,rim,s,diff),stateLight(vLook.y,c,vL,rim,s,diff),k);
        // a planet a few pixels wide: a lit crescent that still reads at galaxy scale
        float tiny=1.-smoothstep(6.,14.,vPxD);c*=1.+tiny*1.6*diff;c+=mix(vC,atmo,.5)*tiny*.3*(1.-diff);
        c+=vC*vGlow.x*(1.6*rim+.35)+mix(uDraft,vec3(1.,.9,.8),.5)*vBirth*3.;gl_FragColor=vec4(c,1.);}`}));
  add(new THREE.Mesh(planets.geometry,planetMat),0);
  // Atmosphere shells: the same instances, a slightly larger back-facing shell glowing where the star lights the limb.
  const shellMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uAtmo:planetMat.uniforms.uAtmo},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.BackSide,
    vertexShader:PLANET_VS.replace('SHELL','(iLook.x>3.5?0.:1.09)'),
    fragmentShader:`uniform float uAtmo;varying vec3 vN,vW,vC,vToStar,vCen;varying vec4 vLook;varying float vSize;
      void main(){if(vSize<=0.)discard;vec3 v=normalize(cameraPosition-vW);vec3 rel=vW-vCen;float b=length(rel-v*dot(rel,v))/vSize;
        float lit=smoothstep(-.45,.6,dot(normalize(rel),normalize(vToStar)));float g=exp(-max(b-1.,0.)*28.)*smoothstep(.96,1.01,b);
        vec3 tone=vLook.x<.5?mix(vC,vec3(.8,.9,1.),.4):vLook.x<1.5?vC*1.2:vLook.x<2.5?vec3(.6,.85,1.):vLook.w>.5&&vLook.w<1.5?vec3(1.,.7,.45):vec3(.45,.7,1.);
        gl_FragColor=vec4(tone*g*lit*1.4*uAtmo,1.);}`}));
  add(new THREE.Mesh(planets.geometry,shellMat),2);
  // A planet only a few pixels wide is a point of reflected light (brighter at full phase, never a dark hole in the gas);
  // it hands over to the lit sphere as it resolves.
  const pSpriteGeo=keep(new THREE.InstancedBufferGeometry());pSpriteGeo.index=quad0.index;pSpriteGeo.setAttribute('position',quad0.attributes.position);
  const pSpriteMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uValid:{value:pal.valid},uStress:{value:stormC},uDraft:{value:new THREE.Color('#ff7a2e')}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${ORBIT}${SCREEN}attribute vec4 iOrbit,iLife,iLook;attribute vec3 iTilt,iColor;attribute vec2 iGlow;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed,uPx;uniform vec3 uValid,uStress,uDraft;varying vec2 vUv;varying vec3 vC;
      void main(){vec4 sys=uSys[int(iTilt.z)];float age=(uT-iLife.x)/uSpeed;float gone=iLife.y<1e5?clamp((uT-iLife.y)/uSpeed/1.4,0.,1.):0.;float grow=smoothstep(0.,2.2,age)*(1.-gone);
        vec3 c=orbitPos(sys.xyz,iOrbit.x,iOrbit.y,iOrbit.z,iTilt.xy,uV);float pp=pxPer(c);float pb=iOrbit.w*pp;float pxD=pb*(squeezeP(pb)/max(pb,1e-4))*grow;
        float fade=(1.-smoothstep(6.,11.,pxD))*grow;float ph=.5+.5*dot(normalize(sys.xyz-c),normalize(cameraPosition-c));
        float st=iLook.y;vec3 col=mix(iColor,vec3(1.),.25);if(st<.5)col=mix(col,uDraft,.55);else if(st>2.5)col=mix(col*.6,uStress,.6);else if(st>1.5)col=mix(col,uValid,.25);
        vC=col*fade*(.3+.9*ph*ph)*(1.+iGlow.x*2.)*1.3;float h=max(pxD*1.1,2.2)*uPx/pp;
        vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        vUv=position.xy;gl_Position=fade<.002?vec4(2.,2.,2.,1.):projectionMatrix*viewMatrix*vec4(c+(right*position.x+up*position.y)*h,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vC;void main(){float r=dot(vUv,vUv);if(r>1.)discard;gl_FragColor=vec4(vC*(exp(-r*9.)*1.6+exp(-r*3.)*.25),1.);}`}));
  add(new THREE.Mesh(pSpriteGeo,pSpriteMat),2);
  const bindShared=(dst,src,keys,n)=>{for(const k of keys)if(dst.attributes[k]!==src.attributes[k])dst.setAttribute(k,src.attributes[k]);dst.instanceCount=n;};
  // Rings: planets with many symbols (a ring of their structure).
  const rings=instancedBuffers(quad,{gOrbit:4,gTilt:4,gInfo:4,gColor:3},16);
  const ringMat=keep(new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:`${ORBIT}${SCREEN}attribute vec4 gOrbit,gTilt,gInfo;attribute vec3 gColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed;varying vec2 vUv;varying vec3 vC,vP,vCen,vL,vNrm;varying vec4 vI;varying float vS;
      void main(){vec4 sys=uSys[int(gTilt.z)];vec3 c=orbitPos(sys.xyz,gOrbit.x,gOrbit.y,gOrbit.z,gTilt.xy,uV);float age=(uT-gInfo.x)/uSpeed;float gone=gInfo.y<1e5?clamp((uT-gInfo.y)/uSpeed/1.4,0.,1.):0.;
        float pb=gOrbit.w*pxPer(c);float sq=squeezeP(pb)/max(pb,1e-4);
        float g=smoothstep(.5,2.6,age)*(1.-gone);float tx=gTilt.x+gTilt.w,tz=gTilt.y-gTilt.w*.6;
        vec3 p=vec3(position.x,0.,position.y)*gOrbit.w*sq*2.3*g;float ca=cos(tx),sa=sin(tx);p=vec3(p.x,p.y*ca-p.z*sa,p.y*sa+p.z*ca);float cb=cos(tz),sb=sin(tz);p=vec3(p.x*cb-p.y*sb,p.x*sb+p.y*cb,p.z);
        vec3 nr=vec3(0.,1.,0.);nr=vec3(nr.x,nr.y*ca-nr.z*sa,nr.y*sa+nr.z*ca);nr=vec3(nr.x*cb-nr.y*sb,nr.x*sb+nr.y*cb,nr.z);
        vUv=position.xy;vC=gColor;vI=gInfo;vP=c+p;vCen=c;vL=normalize(sys.xyz-c);vNrm=nr;vS=gOrbit.w*sq*g;gl_Position=projectionMatrix*viewMatrix*vec4(c+p,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vC,vP,vCen,vL,vNrm;varying vec4 vI;varying float vS;float h1(float n){return fract(sin(n*.137)*4375.85);}
      void main(){float r=length(vUv);if(r>1.||r<.52||vS<=0.)discard;float x=(r-.52)/.48;float k=floor(x*24.);float band=mix(h1(k+vI.z*50.),h1(k+1.+vI.z*50.),fract(x*24.));
        float gaps=smoothstep(.15,.3,abs(x-.55))*smoothstep(.0,.06,x)*(1.-smoothstep(.85,1.,x));float dens=(.35+.65*band)*gaps*vI.w;
        vec3 d=vP-vCen;float t=dot(d,vL);float sh=t<0.&&length(d-t*vL)<vS?.12:1.;float lit=.3+.7*abs(dot(vNrm,vL));
        gl_FragColor=vec4(vC*lit*sh*.8*dens,1.);}`}));
  add(new THREE.Mesh(rings.geometry,ringMat),4);
  // Orbit arcs: a faint trace for every planet, a luminous one (brighter behind the planet) for planets that are active:
  // recently born, edited, changing state, or worked on by an agent.
  const OSEG=96;const orbitGeo=keep((()=>{const g=new THREE.BufferGeometry(),t=[],side=[],idx=[];for(let i=0;i<=OSEG;i++){t.push(i/OSEG,i/OSEG);side.push(-1,1);if(i<OSEG){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    g.setAttribute('position',new THREE.Float32BufferAttribute(new Array((OSEG+1)*2*3).fill(0),3));g.setAttribute('aT',new THREE.Float32BufferAttribute(t,1));g.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));g.setIndex(idx);return g;})());
  const orbits=instancedBuffers(orbitGeo,{oOrbit:4,oTilt:3,oLife:2,oColor:3,oAct:1},64);
  const orbitMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uOrbitK:{value:1}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${ORBIT}attribute float aT,aSide,oAct;attribute vec4 oOrbit;attribute vec3 oTilt,oColor;attribute vec2 oLife;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed,uPx;uniform vec2 uRes;varying float vB,vSide;varying vec3 vC;
      void main(){vec4 sys=uSys[int(oTilt.z)];float a=aT*6.2832;vec3 p=orbitPos(sys.xyz,oOrbit.x,a,0.,oTilt.xy,0.),q=orbitPos(sys.xyz,oOrbit.x,a+.02,0.,oTilt.xy,0.);
        vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.),cq=projectionMatrix*viewMatrix*vec4(q,1.);vec2 dir=normalize((cq.xy/cq.w-cp.xy/cp.w)*uRes+1e-5);vec2 nrm=vec2(-dir.y,dir.x);
        cp.xy+=nrm*aSide*1.1*uPx/uRes*2.*cp.w;gl_Position=cp;if(cp.w<.1||cq.w<.1)gl_Position=vec4(2.,2.,2.,1.);
        float ap=oOrbit.y+oOrbit.z*uV;float behind=mod(ap-a,6.2832);float age=(uT-oLife.x)/uSpeed;float gone=oLife.y<1e5?clamp((uT-oLife.y)/uSpeed/1.4,0.,1.):0.;
        vB=oAct*(.85*exp(-behind*1.5)*smoothstep(0.,.05,behind))*smoothstep(0.,2.5,age)*(1.-gone);vSide=aSide;vC=oColor;if(oAct<.002)gl_Position=vec4(2.,2.,2.,1.);}`,
    fragmentShader:`uniform float uOrbitK;varying float vB,vSide;varying vec3 vC;void main(){gl_FragColor=vec4(vC*vB*(1.-vSide*vSide)*uOrbitK,1.);}`}));
  add(new THREE.Mesh(orbits.geometry,orbitMat),1);
  // Asteroid belts: in a large subsystem the outer rings of modules are clumps of rock along their orbit (banded by ring).
  const BELT_N=14,belt=pointBuffers({kO:4,kT:4,kF:4,kC:4},256);
  const beltMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uValid:{value:pal.valid},uStress:{value:stormC},uDraft:{value:new THREE.Color('#ff7a2e')},uQ:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${ORBIT}attribute vec4 kO,kT,kF,kC;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed,uPx,uQ;uniform vec3 uValid,uStress,uDraft;varying vec3 vC;
      void main(){float age=(uT-kT.z)/uSpeed;float gone=kT.w<1e5?clamp((uT-kT.w)/uSpeed/1.4,0.,1.):0.;
        if(age<0.||gone>=1.||(uQ>1.5&&fract(kF.w*7.)<.5)){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vC=vec3(0.);return;}
        vec4 sys=uSys[int(kO.w)];vec3 p=orbitPos(sys.xyz,kO.x+kF.y,kO.y+kF.x,kO.z,kT.xy,uV);p.y+=kF.z;
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float dist=max(.5,-mv.z);gl_PointSize=clamp((.6+fract(kF.w*13.)*1.2)*uPx*26./dist,1.,5.);
        float lit=.55+.45*dot(normalize(sys.xyz-p),normalize(cameraPosition-p));float st=kC.w;
        vec3 c=kC.rgb*(.35+.4*lit);if(st<.5)c=mix(c,uDraft*1.4,.6);else if(st>2.5)c=mix(c*.6,uStress*1.1,.55);else if(st>1.5)c=mix(c,uValid,.3)*1.2;
        vC=c*smoothstep(0.,2.,age)*(1.-gone);}`,
    fragmentShader:`varying vec3 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*3.),1.);}`}));
  add(new THREE.Points(belt.geometry,beltMat),1);
  // Polar jets for planets that expose API routes ("endpoints reaching out").
  const jets=instancedBuffers(new THREE.PlaneGeometry(1,1),{jOrbit:4,jTilt:3,jInfo:4,jColor:3},16);keep(jets.geometry);
  const jetMat=keep(new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${ORBIT}${SCREEN}attribute vec4 jOrbit,jInfo;attribute vec3 jTilt,jColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed;varying vec2 vUv;varying vec3 vC;varying float vA;
      void main(){vec4 sys=uSys[int(jTilt.z)];vec3 c=orbitPos(sys.xyz,jOrbit.x,jOrbit.y,jOrbit.z,jTilt.xy,uV);float pb=jOrbit.w*pxPer(c);float sq=squeezeP(pb)/max(pb,1e-4);float sz=jOrbit.w*sq;
        float age=(uT-jInfo.x)/uSpeed;vA=smoothstep(0.,2.5,age)*(jInfo.y<1e5?1.-clamp((uT-jInfo.y)/uSpeed,0.,1.):1.);
        float ca=cos(jTilt.x),sa=sin(jTilt.x),cb=cos(jTilt.y),sb=sin(jTilt.y);vec3 axis=normalize(vec3(-sb*ca,cb*ca,sa));
        vec3 side=normalize(cross(axis,cameraPosition-c));float len=sz*(3.+jInfo.z*1.2)*(1.+.08*sin(uV*1.3+jOrbit.y));
        vec3 w=c+axis*position.y*len*2.+side*position.x*sz*.8*(1.-abs(position.y)*1.2);vUv=position.xy;vC=jColor;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`uniform float uV;varying vec2 vUv;varying vec3 vC;varying float vA;
      void main(){float y=abs(vUv.y)*2.;float x=abs(vUv.x)*2.;float core=exp(-x*x*7./(1.-y*.8+.01))*(1.-y);float knots=.65+.35*sin(y*26.-uV*4.);
        gl_FragColor=vec4(vC*core*knots*1.8*vA,1.);}`}));
  add(new THREE.Mesh(jets.geometry,jetMat),3);
  // ---- Moons (symbols): tiny lit spheres, shown once their planet is resolved -----------------------------------------
  const moons=pointBuffers({mOrbit:4,mTilt:3,mMoon:4,mLife:4,mColor:3},256);
  const moonMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uRings:{value:sec.moonsAsRings?1:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${ORBIT}${SCREEN}attribute vec4 mOrbit,mMoon,mLife;attribute vec3 mTilt,mColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed,uPx,uRings;varying vec3 vC,vLd;varying float vA,vGlow;
      void main(){vec4 sys=uSys[int(mTilt.z)];vec3 pc=orbitPos(sys.xyz,mOrbit.x,mOrbit.y,mOrbit.z,mTilt.xy,uV);float pb=mOrbit.w*pxPer(pc);float sq=squeezeP(pb)/max(pb,1e-4);
        float age=(uT-mLife.x)/uSpeed;float gone=mLife.y<1e5?clamp((uT-mLife.y)/uSpeed/1.6,0.,1.):0.;float pg=mLife.w<1e5?clamp((uT-mLife.w)/uSpeed/1.4,0.,1.):0.;
        float spiral=1.-smoothstep(0.,2.,age);float R=mOrbit.w*sq*mMoon.x*(1.+spiral*3.+gone*2.5);
        float a=mMoon.y+uV*mMoon.z+spiral*5.;float incl=mix(sin(mMoon.y*3.7)*.45,.04,uRings);
        vec3 off=vec3(cos(a)*R,sin(a)*R*incl,sin(a)*R);vec3 w=pc+off;
        float weld=exp(-max(0.,(uT-mLife.z)/uSpeed)*2.5)*step(mLife.z,uT);
        vA=smoothstep(0.,.5,age)*(1.-gone)*(1.-pg)*smoothstep(4.,11.,pb*sq);vGlow=spiral*1.5+weld*1.5;vC=mColor;
        vec4 mv=viewMatrix*vec4(w,1.);vLd=normalize((viewMatrix*vec4(sys.xyz-w,0.)).xyz);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(mMoon.w*uPx*(1.+vGlow*.6)*16./max(.5,-mv.z),1.,40.);}`,
    fragmentShader:`varying vec3 vC,vLd;varying float vA,vGlow;void main(){if(vA<.01)discard;vec2 d=(gl_PointCoord-.5)*2.;float r=dot(d,d);if(r>1.)discard;vec3 n=vec3(d.x,-d.y,sqrt(1.-r));
      float lit=max(dot(n,vLd),0.)*.95+.05;gl_FragColor=vec4((vC*lit*1.2+vC*vGlow*exp(-r*2.))*vA,1.);}`}));
  add(new THREE.Points(moons.geometry,moonMat),3);
  // ---- Dependencies: filaments inside a system, bundled bridges between systems -------------------------------------
  const SEG=28;const ribbon=keep((()=>{const g=new THREE.BufferGeometry(),t=[],side=[],idx=[];
    for(let i=0;i<=SEG;i++){t.push(i/SEG,i/SEG);side.push(-1,1);if(i<SEG){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    g.setAttribute('position',new THREE.Float32BufferAttribute(new Array((SEG+1)*2*3).fill(0),3));g.setAttribute('aT',new THREE.Float32BufferAttribute(t,1));g.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));g.setIndex(idx);return g;})());
  const links=instancedBuffers(ribbon,{iA:4,iAT:4,iB:4,iBT:4,iInfo:4,iColA:3,iColB:3,iAct:1},64);
  const linkMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uFlow:{value:clamp(num(mot.turbulence,.7),0,1.6)},uPlasma:{value:clamp(num(mtl.plasma,1),.3,1.8)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${ORBIT}attribute float aT,aSide,iAct;attribute vec4 iA,iAT,iB,iBT,iInfo;attribute vec3 iColA,iColB;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed,uPx;uniform vec2 uRes;
      varying float vT,vSide,vA,vSeed,vK;varying vec3 vC;
      vec3 m0;vec3 curve(vec3 a,vec3 b,float lift,float t){float u=1.-t;return u*u*a+2.*u*t*m0+t*t*b;}
      void main(){vec3 a=orbitPos(uSys[int(iA.w)].xyz,iA.x,iA.y,iA.z,iAT.xy,uV),b=orbitPos(uSys[int(iB.w)].xyz,iB.x,iB.y,iB.z,iBT.xy,uV);
        float d=distance(a,b);float lift=.1+.08*d;vec3 side=normalize(cross(b-a+vec3(1e-4),vec3(0.,1.,0.))+1e-5);m0=(a+b)*.5+side*d*(.22+.12*iInfo.w)+vec3(0.,lift*.5,0.);
        float t0=aT,t1=min(1.,aT+.02);vec3 p=curve(a,b,lift,t0),q=curve(a,b,lift,aT<.99?t1:t0-.02);
        vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.),cq=projectionMatrix*viewMatrix*vec4(q,1.);
        vec2 dir=normalize((aT<.99?cq.xy/cq.w-cp.xy/cp.w:cp.xy/cp.w-cq.xy/cq.w)*uRes+1e-5);vec2 nrm=vec2(-dir.y,dir.x);
        float age=(uT-iInfo.x)/uSpeed;float grow=clamp(age/1.2,0.,1.);float gone=iInfo.y<1e5?clamp((uT-iInfo.y)/uSpeed/.9,0.,1.):0.;
        float w=1.1*uPx*(1.+(1.-smoothstep(0.,3.,age))*1.5);cp.xy+=nrm*aSide*w/uRes*2.*cp.w;gl_Position=cp;if(cp.w<.1||cq.w<.1)gl_Position=vec4(2.,2.,2.,1.);
        // a light thread only while it matters: when it forms, and while either end is being worked on; at rest it fades
        float on=max(iAct,exp(-max(age,0.)/20.));
        vT=aT;vSide=aSide;vA=(aT<=grow?1.:0.)*(1.-gone)*on;vSeed=iInfo.w;vK=iInfo.z;vC=mix(iColA,iColB,aT);if((1.-gone)*on<.01)gl_Position=vec4(2.,2.,2.,1.);}`,
    fragmentShader:`float sq(float x){return x*x;}uniform float uV,uFlow,uActivity,uPlasma;varying float vT,vSide,vA,vSeed,vK;varying vec3 vC;
      void main(){if(vA<.01)discard;float edge=exp(-vSide*vSide*3.);float p=fract(vT-uV*(.08+.08*uFlow)*(1.+uActivity*.5)+vSeed);
        float glint=exp(-sq((p-.5)/.12));float ends=smoothstep(0.,.12,vT)*(1.-smoothstep(.88,1.,vT));
        gl_FragColor=vec4(vC*edge*(.06+glint*.4)*vA*vK*uPlasma*ends,1.);}`}));
  add(new THREE.Mesh(links.geometry,linkMat),1);
  // Between systems the dependencies are tidal streams drawn in the galaxy's gas map (above). The single strongest pair
  // also carries a plasma current: particles flowing along the same stream, low in the disc (never a screen ribbon).
  const PLN=260,plasma=pointBuffers({pl:4},PLN);
  {const r=rng(hash(`plasma/${seed}`));for(let i=0;i<PLN;i++){plasma.write('position',i,0,0,0);plasma.write('pl',i,r(),r(),r(),r());}plasma.commit(PLN);}
  const plasmaMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uGal:galU.uGal,uBrP:brU.uBrP,uBrI:brU.uBrI,uBrX:brU.uBrX,uBrC0:brU.uBrC0,uBrC1:brU.uBrC1,uPlasma:linkMat.uniforms.uPlasma,uCurrents:{value:0}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 pl;uniform vec4 uGal;uniform vec2 uBrP[${NB*BK}];uniform vec4 uBrI[${NB}],uBrX[${NB}];uniform vec3 uBrC0[${NB}],uBrC1[${NB}];uniform float uV,uPx,uPlasma,uCurrents;varying vec3 vC;
      void main(){vec4 I=uBrI[0],X=uBrX[0];if(I.y<=0.||X.z<.5){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vC=vec3(0.);return;}
        float t=fract(pl.x+uV*(.012+.01*pl.y)*(1.+uCurrents*.6));float ft=t*${(BK-1).toFixed(1)};int k=int(min(floor(ft),${(BK-2).toFixed(1)}));vec2 a=uBrP[k],b=uBrP[k+1];vec2 p=mix(a,b,ft-float(k));
        vec2 dir=normalize(b-a+1e-6);vec2 nr=vec2(-dir.y,dir.x);float w=I.x*(.75+.5*sin(t*3.1416));
        float braid=sin(t*26.+pl.z*6.283+uV*.4)*.55+(pl.w-.5)*.5;p+=nr*braid*w;float R=uGal.x;
        float c=cos(uGal.y),s=sin(uGal.y);vec3 lp=vec3(p.x*R,(pl.y-.5)*R*.004+sin(t*9.+pl.w*6.)*R*.003,p.y*R);vec3 wp=vec3(c*lp.x-s*lp.z,lp.y,s*lp.x+c*lp.z);
        vec4 mv=viewMatrix*vec4(wp,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(uPx*(1.2+pl.w*1.6)*R*.9/max(.5,-mv.z),1.,4.);
        float grow=1.-smoothstep(I.z-.03,I.z,t);float ends=smoothstep(0.,.1,t)*(1.-smoothstep(.9,1.,t));float pd=(t-X.x)/.07;float pulse=exp(-pd*pd)*X.y;
        vC=mix(uBrC0[0],uBrC1[0],t)*grow*ends*I.y*uPlasma*(.5+.5*pl.z)*(1.+pulse*4.)*.9;}`,
    fragmentShader:`varying vec3 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*3.5),1.);}`}));
  add(new THREE.Points(plasma.geometry,plasmaMat),1);
  // ---- Protoplanetary discs: young systems are wrapped in a turning disc of dust that thins to a faint debris ring
  const DPER=Math.round(640*clamp(num(atm.dust,.7)+.3,.4,1.6)),discPts=pointBuffers({pA:4},MAX_SYS*DPER),uSysB={value:Array.from({length:MAX_SYS},()=>new THREE.Vector4(1e6,1,0,0))};
  {const r=rng(hash(`discs/${seed}`));for(let k=0;k<MAX_SYS;k++)for(let j=0;j<DPER;j++){const i=k*DPER+j;discPts.write('position',i,0,0,0);discPts.write('pA',i,k+r()*.5,Math.pow(r(),.7),r()*TAU,r());}discPts.commit(MAX_SYS*DPER);}
  const discMat=keep(new THREE.ShaderMaterial({uniforms:{...common,uSysB,uDustC:{value:mix3(new THREE.Color('#ff9a5a'),pal.secondary,.25)},uIceC:{value:mix3(new THREE.Color('#a8c4ff'),pal.accent,.3)},uQ:{value:0}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 pA;uniform vec4 uSys[${MAX_SYS}],uSysB[${MAX_SYS}];uniform float uT,uV,uSpeed,uPx,uQ;uniform vec3 uDustC,uIceC;varying vec3 vC;
      void main(){int k=int(pA.x);vec4 S=uSys[k],B=uSysB[k];float age=(uT-B.x)/uSpeed;
        if(age<0.||S.w<=0.||(uQ>1.5&&fract(pA.w*7.)<.5)){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vC=vec3(0.);return;}
        float youth=exp(-age/150.);float collapse=1.-smoothstep(0.,2.4,age);
        float f=pA.y;float r=B.y*(.22+1.05*f)*(1.+collapse*1.6);float w=.4*pow(max(r,.5),-1.5);float a=pA.z+uV*w-collapse*3.;
        float h=(fract(pA.w*13.)-.5)*.08*r;vec3 p=vec3(cos(a)*r,h,sin(a)*r);
        float ca=cos(B.z),sa=sin(B.z);p=vec3(p.x,p.y*ca-p.z*sa,p.y*sa+p.z*ca);float cb=cos(B.w),sb=sin(B.w);p=vec3(p.x*cb-p.y*sb,p.x*sb+p.y*cb,p.z);
        vec4 mv=viewMatrix*vec4(S.xyz+p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=max(1.,uPx*(1.2+fract(pA.w*31.)*1.8)*clamp(30./-mv.z,.7,2.6));
        float band=.55+.45*sin(f*38.+pA.w*2.);float lane=smoothstep(.0,.08,abs(f-.55-.05*sin(pA.z*3.)));
        vC=mix(uDustC,uIceC,smoothstep(.35,.9,f))*(.12+youth*1.1+collapse)*band*lane*(1.-f*.55)*1.2;}`,
    fragmentShader:`varying vec3 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*3.),1.);}`}));
  add(new THREE.Points(discPts.geometry,discMat),1);
  // ---- Agents: comet heads, dust trails, ion tails and work streams (one point cloud) -----------------------------
  const TAIL=30,ION=34,STREAM=24,MAX_AGENTS=10,agentPts=pointBuffers({aCol:4,aSize:1},MAX_AGENTS*(TAIL+ION+STREAM+2));
  const agentMat=keep(new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 aCol;attribute float aSize;uniform float uPx;varying vec4 vC;void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(max(aSize*uPx*34./max(.5,-mv.z),aSize*uPx*2.6),1.,18.*uPx);vC=aCol;}`,
    fragmentShader:`varying vec4 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC.rgb*(exp(-r*4.)+exp(-r*24.)*1.5)*vC.a,1.);}`}));
  add(new THREE.Points(agentPts.geometry,agentMat),5);
  // Ion tails: one continuous tapered strip per comet (straight, away from the nearest star).
  const ionTails=instancedBuffers(ribbon,{tH:4,tD:4,tC:3},10);
  const ionMat=keep(new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`attribute float aT,aSide;attribute vec4 tH,tD;attribute vec3 tC;uniform float uPx,uV;uniform vec2 uRes;varying float vT,vSide;varying vec3 vC;
      void main(){vec3 p=tH.xyz+tD.xyz*tH.w*aT,q=tH.xyz+tD.xyz*tH.w*min(1.,aT+.03);vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.),cq=projectionMatrix*viewMatrix*vec4(q,1.);
        vT=aT;vSide=aSide;vC=tC*tD.w;if(cp.w<.2||cq.w<.2){gl_Position=vec4(2.,2.,2.,1.);return;}
        vec2 dir=normalize((cq.xy/cq.w-cp.xy/cp.w)*uRes+1e-5);vec2 nr=vec2(-dir.y,dir.x);float w=mix(2.6,6.,aT)*uPx;cp.xy+=nr*aSide*w/uRes*2.*cp.w;gl_Position=cp;}`,
    fragmentShader:`uniform float uV;varying float vT,vSide;varying vec3 vC;void main(){float s=vSide;float st=.75+.25*sin(s*7.+vT*5.);
      gl_FragColor=vec4(vC*exp(-s*s*(3.+6.*(1.-vT)))*pow(1.-vT,1.4)*smoothstep(0.,.03,vT)*st,1.);}`}));
  add(new THREE.Mesh(ionTails.geometry,ionMat),5);
  // ---- Effects (pooled; appearance seeded by the command, so a slot never carries history) --------------------------
  const BURSTS=32,PER=40,burstPts=pointBuffers({bDir:4},BURSTS*PER);
  {const r=rng(hash(`burst/${seed}`));for(let b=0;b<BURSTS;b++)for(let k=0;k<PER;k++){const u=r()*2-1,a=r()*TAU,s=Math.sqrt(1-u*u);burstPts.write('position',b*PER+k,r(),r(),r());burstPts.write('bDir',b*PER+k,Math.cos(a)*s,u,Math.sin(a)*s,b+r()*.9);}burstPts.commit(BURSTS*PER);}
  const burstU={uBA:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(0,0,0,-1e5))},uBB:{value:Array.from({length:BURSTS},()=>new THREE.Vector4())},uBC:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(1,0,1,0))},uBD:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(0,1,0,0))}};
  // modes: 0 outward, 1 spiral inward (accretion), 2 stream along a direction (ablation), 3 turbulent shell, 4 rising (aurora), 5 disc condensing
  const burstMat=keep(new THREE.ShaderMaterial({uniforms:{...common,...burstU},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${GN}attribute vec4 bDir;uniform vec4 uBA[${BURSTS}],uBB[${BURSTS}],uBC[${BURSTS}],uBD[${BURSTS}];uniform float uT,uSpeed,uPx;varying vec3 vC;varying float vA;
      void main(){int b=int(bDir.w);float sp=fract(bDir.w);vec4 A=uBA[b],B=uBB[b],C=uBC[b],D=uBD[b];float age=(uT-A.w)/uSpeed/C.x;
        if(age<0.||age>1.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vA=0.;return;}
        float mode=C.y;vec3 dir=rotY(bDir.xyz,C.w*6.2832);if(fract(C.w*7.)>.5)dir.y=-dir.y;sp=fract(sp+C.w*3.1);vec3 p;float fade=1.-age;
        if(mode<.5){p=A.xyz+dir*(1.-pow(1.-age,2.5))*C.z*(.35+sp);}
        else if(mode<1.5||mode>4.5){vec3 dd=mode>4.5?normalize(vec3(dir.x,dir.y*.08,dir.z)):dir;float rr=C.z*(.3+sp)*(1.-smoothstep(0.,1.,age));float an=age*(3.+sp*3.);
          vec3 up=normalize(D.xyz);vec3 t=normalize(cross(up,dd+vec3(.01)));p=A.xyz+(dd*cos(an)+t*sin(an))*rr;fade=smoothstep(0.,.2,age)*(1.-age*.6);}
        else if(mode<2.5){vec3 dd=normalize(D.xyz+dir*(.25+.35*D.w));p=A.xyz+dd*age*C.z*(.4+sp)+dir*C.z*.08*age;}
        else if(mode<3.5){vec3 q=dir*C.z*(.25+sp*.75)*(1.-sq(1.-age));q+=vec3(gn(q*.8+vec3(age*3.)),gn(q*.8+vec3(5.,age*3.,0.)),gn(q*.8+vec3(0.,9.,age*3.)))*C.z*.35*age;p=A.xyz+q;}
        else{p=A.xyz+vec3(dir.x*.35,abs(dir.y)+.3,dir.z*.35)*C.z*age*(.5+sp);}
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(B.w*uPx*24./max(.5,-mv.z)*(1.-age*.5),1.,28.);vC=B.rgb;vA=fade;}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*4.)*vA*2.,1.);}`}));
  add(new THREE.Points(burstPts.geometry,burstMat),6);let burstNext=0;
  const waves=[],flashes=[],calms=[],novas=[],storms=[],echoes=[];
  // ---- Layout: pure functions of the model at a time ---------------------------------------------------------------
  const sys=new Map();      // district id -> {index, pos, radius, sysR, tilt, color, role, born, d}
  const bodies=new Map();   // module id -> orbit and look
  const layoutCache=new Map();let galR=14,outerR=8,rotNow=0;
  const tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),tmp3=new THREE.Vector3();
  const aliveAt=(x,t)=>model.bornAt(x)<=t&&(x.removed===null||x.removed>t);
  function districtsAt(t){return [...model.districts.values()].filter(d=>model.districtBorn(d)<=t).sort((a,b)=>a.order-b.order||(a.id<b.id?-1:1));}
  function sysRadius(d,t){let k=0;for(const id of d.members){const m=model.modules.get(id);if(m&&aliveAt(m,t))k=Math.max(k,hexDistance(m.q,m.r,d.q,d.r));}return ORBIT0+k*STEP+1.1;}
  function pack(list,S,coreSize){
    const out=new Map(),placed=[];const gap=(a,b)=>(a+b)*1.08*SPREAD;
    const free=(x,y,z,s)=>{for(const p of placed)if(Math.hypot(p.x-x,p.y-y,p.z-z)<gap(p.s,s))return false;return true;};
    if(ARR==='spiral'){const last=new Array(ARMS).fill(null),lastS=new Array(ARMS).fill(0),big=Math.max(1,...list.map(d=>S.get(d.id)));
      list.forEach((d,k)=>{const s=S.get(d.id),arm=k%ARMS;let r=last[arm]!==null?last[arm]+gap(lastS[arm],s)*Math.sin(PITCH)*1.02:Math.max(coreSize*SPREAD+s+1,big*1.15/Math.sin(Math.PI/Math.max(2,ARMS)));
        const h=rand(hash(d.id)),y=(h-.5)*(.4+1.6*VERTICAL);
        for(let i=0;i<500;i++){const a=armAngle(arm,r);if(free(Math.cos(a)*r,y,Math.sin(a)*r,s)&&r>=coreSize+s+.6)break;r+=.25;}
        const a=armAngle(arm,r);const p={x:Math.cos(a)*r,y,z:Math.sin(a)*r,s,arm,r};placed.push(p);out.set(d.id,p);last[arm]=r;lastS[arm]=s;});
      return out;}
    if(ARR==='cluster'){const N=Math.max(12,list.length+4);list.forEach((d,k)=>{const s=S.get(d.id);let R=coreSize+s+1;
        const y=1-(k+.5)/N*2,rr=Math.sqrt(1-y*y),phi=k*2.39996+ARM0;
        for(let i=0;i<500;i++){if(free(Math.cos(phi)*rr*R,y*R*.55,Math.sin(phi)*rr*R,s))break;R+=.3;}
        const p={x:Math.cos(phi)*rr*R,y:y*R*.55,z:Math.sin(phi)*rr*R,s};placed.push(p);out.set(d.id,p);});return out;}
    let inner=list;if(ARR==='binary-core'){inner=list.slice(2);list.slice(0,2).forEach((d,k)=>{const s=S.get(d.id),a=ARM0+(k?Math.PI:0),r=Math.max(coreSize+s+.6,s*1.1);const p={x:Math.cos(a)*r,y:0,z:Math.sin(a)*r,s};placed.push(p);out.set(d.id,p);});}
    const angles=inner.map(d=>d.angle).sort((a,b)=>a-b);let minSep=TAU;for(let i=0;i<angles.length;i++){const a=angles[i],b=i+1<angles.length?angles[i+1]:angles[0]+TAU;if(angles.length>1)minSep=Math.min(minSep,b-a);}
    const big=Math.max(1,...inner.map(d=>S.get(d.id)));
    const R=Math.max(coreSize+big+1,(ARR==='binary-core'?Math.max(0,...placed.map(p=>Math.hypot(p.x,p.z)+p.s))+big+1:0),inner.length>1?gap(big,big)/(2*Math.sin(Math.min(Math.PI/2,Math.max(.05,minSep)/2))):0);
    for(const d of inner){const s=S.get(d.id),h=rand(hash(d.id));const p={x:Math.cos(d.angle)*R,y:(h-.5)*(.3+VERTICAL),z:Math.sin(d.angle)*R,s};placed.push(p);out.set(d.id,p);}
    return out;
  }
  function layoutState(t){
    const list=districtsAt(t);const S=new Map();let sig='';
    for(const d of list){const R=sysRadius(d,t);S.set(d.id,R);sig+=`${d.id}:${R.toFixed(2)}|`;}
    let L=layoutCache.get(sig);
    if(!L){const core=list.find(d=>d.core),others=list.filter(d=>!d.core);const coreSize=core?S.get(core.id):1.5;
      const pos=pack(others,S,coreSize);if(core)pos.set(core.id,{x:0,y:0,z:0,s:coreSize});
      let outer=Math.max(4,coreSize);for(const p of pos.values())outer=Math.max(outer,Math.hypot(p.x,p.z)+p.s);
      let gR=Math.max(13,outer*(ARR==='cluster'?1.25:ARR==='spiral'?1.25:1.42));
      // Spiral: the systems spread along the arms out to ~0.8 of the galaxy (a monotone radial stretch keeps them apart).
      if(ARR==='spiral'){const arm=[...pos.values()].filter(p=>p.arm!==undefined);if(arm.length){const rin=Math.min(...arm.map(p=>p.r)),rmax=Math.max(...arm.map(p=>p.r));
        const f=rmax>rin+.01?Math.max(1,(gR*.78-rin)/(rmax-rin)):1;
        for(const p of arm){const r=rin+(p.r-rin)*f,a=armAngle(p.arm,r);p.x=Math.cos(a)*r;p.z=Math.sin(a)*r;}
        outer=Math.max(4,coreSize);for(const p of pos.values())outer=Math.max(outer,Math.hypot(p.x,p.z)+p.s);gR=Math.max(gR,outer*1.08);}}
      L={pos,S,outer,galR:gR};layoutCache.set(sig,L);if(layoutCache.size>32)layoutCache.delete(layoutCache.keys().next().value);}
    return {list,L};}
  // The latest structural change at or before t (module born or removed): the layout eases from its state just before.
  const BLEND=3200;
  function lastChange(t){let tc=-Infinity;for(const m of model.modules.values()){const b=model.bornAt(m);if(b<=t&&b>tc)tc=b;if(m.removed!==null&&m.removed<=t&&m.removed>tc)tc=m.removed;}return tc;}
  function blended(t,depth){const s=layoutState(t);const out={list:s.list,pos:new Map(),S:s.L.S,outer:s.L.outer,galR:s.L.galR};for(const [id,p] of s.L.pos)out.pos.set(id,{x:p.x,y:p.y,z:p.z});
    const tc=lastChange(t);if(depth<4&&Number.isFinite(tc)&&t-tc<BLEND){const prev=blended(tc-1,depth+1),k=smooth((t-tc)/BLEND);
      for(const [id,p] of out.pos){const q=prev.pos.get(id);if(q){p.x=lerp(q.x,p.x,k);p.y=lerp(q.y,p.y,k);p.z=lerp(q.z,p.z,k);}}
      out.galR=lerp(prev.galR,out.galR,k);out.outer=lerp(prev.outer,out.outer,k);}
    return out;}
  function starRadius(d,t){let n=0;for(const id of d.members){const m=model.modules.get(id);if(!m||!aliveAt(m,t))continue;let k=0;
      for(const sid of m.symbols){const s=model.symbols.get(sid);if(s&&aliveAt(s,t))k+=smooth((t-model.bornAt(s))/1500);}n+=Math.max(1,k)*smooth((t-model.bornAt(m))/2000);}
    return Math.min(1.1,(d.core?.6:.36)+.17*Math.log2(1+n)/2.2)*STAR_SCALE;}
  // Richness: how mature the galaxy looks (stars, gas) follows the accumulated structure, eased.
  function richness(t){let w=0;for(const m of model.modules.values())if(aliveAt(m,t))w+=(1+Math.min(40,m.symbols.size)/6)*smooth((t-model.bornAt(m))/3000);return clamp(.3+.7*Math.log2(1+w)/Math.log2(1+900),.3,1);}
  function updateLayout(i){
    const t=i.t,lay=blended(t,0);galR=lay.galR;outerR=lay.outer;
    rotNow=-i.tview*TAU/2400*clamp(i.overrides.motion??1,0,1);
    const c=Math.cos(rotNow),s=Math.sin(rotNow);
    for(const d of lay.list){
      const st=sys.get(d.id)||{};const p=lay.pos.get(d.id)||{x:0,y:0,z:0};
      st.index=Math.min(MAX_SYS-1,d.order);st.sysR=lay.S.get(d.id);st.radius=starRadius(d,t);
      st.pos=(st.pos||new THREE.Vector3()).set(c*p.x-s*p.z,p.y,s*p.x+c*p.z);st.local=p;
      if(!st.color||st.role!==d.role)st.color=new THREE.Color(ROLE_COLOR[d.role]||ROLE_COLOR.logic).lerp(pal.primary,.08);st.role=d.role;
      const h=hash(d.id);st.tilt=[(rand(h+3)-.5)*2*TILT,(rand(h+7)-.5)*2*TILT];st.seed=rand(h+23);st.born=model.districtBorn(d);st.d=d;st.alive=true;
      common.uSys.value[st.index].set(st.pos.x,st.pos.y,st.pos.z,st.radius);uSysB.value[st.index].set(Number.isFinite(st.born)?secs(st.born,model.epoch):-1e5,st.sysR,st.tilt[0],st.tilt[1]);sys.set(d.id,st);}
    const live=new Set(lay.list.map(d=>d.id));for(const [id,st] of sys)if(!live.has(id)){st.alive=false;if(Number.isInteger(st.index))uSysB.value[st.index].set(1e6,1,0,0);}
    galU.uGal.value.set(galR,rotNow,ARMS,ARM0);
    galMat.uniforms.uRotX.value=Math.log(galR/R0)/TANP;
    return lay.list;}
  // ---- Bodies (rebuilt when the model changes) ---------------------------------------------------------------------
  const STYLE_W=[num(geo.planetStyles?.gas,.4),num(geo.planetStyles?.rock,.4),num(geo.planetStyles?.ice,.2)].map(x=>Math.max(.01,x));
  function styleOf(m){const c=m.counts||{};const total=Object.entries(c).filter(([k])=>k!=='property').reduce((a,[,v])=>a+v,0);
    if(m.test)return 2;if(!total)return 4;if((c['ui.component']||0)>0)return 0;if((c.class||0)+(c.interface||0)+(c.type||0)>=(c.function||0)*.6)return 1;return 3;}
  function bodyOf(m,groupCount){
    const s=sys.get(m.group);if(!s||!s.d)return null;const d=s.d;
    const k=hexDistance(m.q,m.r,d.q,d.r),h=hash(m.id);
    const wx=SQRT3*(m.q-d.q)+SQRT3/2*(m.r-d.r),wz=1.5*(m.r-d.r);const bearing=k?Math.atan2(wz,wx):rand(h)*TAU;
    const r=ORBIT0+k*STEP+(rand(h+1)-.5)*.25+(k?0:.2);
    const w=.55*Math.pow(r,-1.5)*clamp(num(mot.orbitSpeed,1),.1,2.2)*.64;
    const total=Object.entries(m.counts||{}).filter(([x])=>x!=='property'&&x!=='api.route').reduce((a,[,v])=>a+v,0);
    const crowd=clamp(Math.sqrt(14/Math.max(1,groupCount)),.42,1);
    const size=Math.min(.62,(total?.15+.06*Math.sqrt(total):.09))*(m.test?.85:1)*crowd;
    const style=styleOf(m);const base=[pal.secondary,pal.accent,pal.highlight,pal.primary,pal.highlight][style];const c=base.clone().lerp(s.color,.15);
    {const hsl={};c.getHSL(hsl);c.setHSL(hsl.h+(rand(h+11)-.5)*.08,Math.min(1,hsl.s*1.1),clamp(hsl.l,.35,.62));}
    // logic worlds vary in look within their class, weighted by the recipe's gas/rock/ice shares
    const u=rand(h+13)*(STYLE_W[0]+STYLE_W[1]+STYLE_W[2]),sub=u<STYLE_W[0]?0:u<STYLE_W[0]+STYLE_W[1]?1:2;
    const ringed=total>=6&&(sec.moonsAsRings?true:rand(h+17)<clamp(num(geo.ringChance,.35),0,1)+.15)&&style!==4;
    return {r,k,ph:bearing+(rand(h+2)-.5)*.6,w,size,tx:s.tilt[0]+(rand(h+4)-.5)*.14,tz:s.tilt[1]+(rand(h+5)-.5)*.14,sysIndex:s.index,group:m.group,style,sub,color:c,routes:m.counts?.['api.route']||0,seed:rand(h+9),ringed,ringTilt:(rand(h+19)-.5)*.9,total};
  }
  function bodyPos(out,b,tv){return orbitPos(out,common.uSys.value[b.sysIndex],b.r,b.ph,b.w,b.tx,b.tz,tv);}
  let builtVersion=-1,moduleIds=[],planetIds=[],beltIds=[],symbolIds=[],linkKeys=[],bridgeList=[],linkEnds=[];const beltState=[];
  const agentState=new Map();
  const BELT_ABOVE=25,BELT_KEEP=18;
  function syncBodies(){
    const epoch=model.epoch;
    moduleIds=[...model.modules.values()].filter(m=>sys.has(m.group)).sort((a,b)=>a.order-b.order).map(m=>m.id);
    const byGroup=new Map();for(const id of moduleIds){const m=model.modules.get(id);if(!byGroup.has(m.group))byGroup.set(m.group,[]);byGroup.get(m.group).push(m);}
    // Large subsystems: the outer hex rings become asteroid belts (the inner ~18 modules stay planets).
    const cut=new Map();for(const [g,list] of byGroup){if(list.length<=BELT_ABOVE){cut.set(g,Infinity);continue;}const d=sys.get(g).d;
      const ks=list.map(m=>hexDistance(m.q,m.r,d.q,d.r)).sort((a,b)=>a-b);let kc=ks[0];for(const k of new Set(ks)){if(ks.filter(x=>x<=k).length<=BELT_KEEP)kc=k;else break;}cut.set(g,kc);}
    bodies.clear();planetIds=[];beltIds=[];
    for(const id of moduleIds){const m=model.modules.get(id);const b=bodyOf(m,byGroup.get(m.group).length);if(!b)continue;b.belt=b.k>cut.get(m.group);bodies.set(id,b);(b.belt?beltIds:planetIds).push(id);}
    planets.ensure(planetIds.length);orbits.ensure(planetIds.length);let jetN=0,ringN=0;
    planetIds.forEach((id,i)=>{const m=model.modules.get(id),b=bodies.get(id);b.index=i;
      const born=secs(m.born,epoch),gone=m.removed===null?1e6:secs(m.removed,epoch);
      planets.write('iOrbit',i,b.r,b.ph,b.w,b.size);planets.write('iTilt',i,b.tx,b.tz,b.sysIndex);planets.write('iColor',i,b.color.r,b.color.g,b.color.b);
      planets.write('iLife',i,born,gone,-1e5,0);
      orbits.write('oOrbit',i,b.r,b.ph,b.w,b.size);orbits.write('oTilt',i,b.tx,b.tz,b.sysIndex);orbits.write('oLife',i,born,gone);
      const oc=b.color.clone().lerp(new THREE.Color(1,1,1),.35).multiplyScalar(.55);orbits.write('oColor',i,oc.r,oc.g,oc.b);
      if(b.ringed){rings.ensure(ringN+1);rings.write('gOrbit',ringN,b.r,b.ph,b.w,b.size);rings.write('gTilt',ringN,b.tx,b.tz,b.sysIndex,b.ringTilt);
        rings.write('gInfo',ringN,born,gone,b.seed,clamp(.35+b.total/40,.35,1));const rc=b.color.clone().lerp(new THREE.Color('#f3e6d0'),.55);rings.write('gColor',ringN,rc.r,rc.g,rc.b);ringN++;}
      if(b.routes){jets.ensure(jetN+1);jets.write('jOrbit',jetN,b.r,b.ph,b.w,b.size);jets.write('jTilt',jetN,b.tx,b.tz,b.sysIndex);jets.write('jInfo',jetN,born,gone,Math.min(4,b.routes),0);
        const jc=pal.valid.clone().lerp(b.color,.4);jets.write('jColor',jetN,jc.r*1.4,jc.g*1.4,jc.b*1.4);jetN++;}});
    planets.commit(planetIds.length);orbits.commit(planetIds.length);jets.commit(jetN);rings.commit(ringN);
    belt.ensure(beltIds.length*BELT_N);beltState.length=0;
    beltIds.forEach((id,j)=>{const m=model.modules.get(id),b=bodies.get(id);b.index=j;const born=secs(m.born,epoch),gone=m.removed===null?1e6:secs(m.removed,epoch);const r=rng(hash(`belt/${id}`));
      const rc=b.color.clone().lerp(new THREE.Color('#b8aa98'),.6);beltState.push(-1);
      for(let k=0;k<BELT_N;k++){const i=j*BELT_N+k;const g=()=>(r()+r()+r()-1.5);belt.write('position',i,0,0,0);belt.write('kO',i,b.r,b.ph,b.w,b.sysIndex);belt.write('kT',i,b.tx,b.tz,born,gone);
        belt.write('kF',i,(r()-.5)*.7,g()*.12,g()*.05,r());belt.write('kC',i,rc.r,rc.g,rc.b,1);}});
    belt.commit(beltIds.length*BELT_N);
    const kinds=[pal.highlight,pal.highlight.clone().multiplyScalar(.8),pal.accent.clone().multiplyScalar(1.3),pal.secondary.clone().multiplyScalar(1.3),pal.primary.clone().multiplyScalar(.8),pal.primary.clone().multiplyScalar(.6),new THREE.Color(.45,.47,.52),pal.valid];
    const sizes=[3.2,2.7,5.4,5,2.6,2.2,1.7,4.4];
    symbolIds=[];for(const s of model.symbols.values()){const b=bodies.get(s.parent);if(b&&!b.belt)symbolIds.push(s.id);}
    moons.ensure(symbolIds.length);
    symbolIds.forEach((id,i)=>{const s=model.symbols.get(id),b=bodies.get(s.parent),m=model.modules.get(s.parent);const k=KIND_INDEX[s.kind]??0,h=hash(id);
      moons.write('position',i,0,0,0);moons.write('mOrbit',i,b.r,b.ph,b.w,b.size);moons.write('mTilt',i,b.tx,b.tz,b.sysIndex);
      moons.write('mMoon',i,(b.ringed?2.5:1.75)+Math.min(14,s.slot)*.2+rand(h)*.15,rand(h+1)*TAU,(1.1+rand(h+2)*.6)/Math.sqrt(1.75+s.slot*.2)*.25,sizes[k]);
      const born=model.bornAt(s);moons.write('mLife',i,Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,s.removed===null?1e6:secs(s.removed,epoch),Number.isFinite(s.weldAt)?secs(s.weldAt,epoch):-1e5,m.removed===null?1e6:secs(m.removed,epoch));
      const c=kinds[k];moons.write('mColor',i,c.r,c.g,c.b);});
    moons.commit(symbolIds.length);
    // Links inside a system: filaments, dimmer where they are dense. Across systems: bundled per pair of systems.
    linkKeys=[];const perSys=new Map(),pairs=new Map();
    for(const l of model.links.values()){const a=bodies.get(l.a),b=bodies.get(l.b);if(!a||!b)continue;
      if(a.sysIndex!==b.sysIndex){const key=a.sysIndex<b.sysIndex?`${a.sysIndex}|${b.sysIndex}`:`${b.sysIndex}|${a.sysIndex}`;let p=pairs.get(key);
        if(!p){p={key,a:Math.min(a.sysIndex,b.sysIndex),b:Math.max(a.sysIndex,b.sysIndex),ga:a.sysIndex<b.sysIndex?a.group:b.group,gb:a.sysIndex<b.sysIndex?b.group:a.group,n:0,born:Infinity,removed:-Infinity,live:0};pairs.set(key,p);}
        p.n++;p.born=Math.min(p.born,model.bornAt(l));if(l.removed===null)p.live++;else p.removed=Math.max(p.removed,l.removed);continue;}
      if(a.belt&&b.belt)continue;linkKeys.push(l.key);perSys.set(a.sysIndex,(perSys.get(a.sysIndex)||0)+1);}
    links.ensure(linkKeys.length);
    linkKeys.forEach((key,i)=>{const l=model.links.get(key),a=bodies.get(l.a),b=bodies.get(l.b);const born=model.bornAt(l);
      links.write('iA',i,a.r,a.ph,a.w,a.sysIndex);links.write('iAT',i,a.tx,a.tz,a.size,0);links.write('iB',i,b.r,b.ph,b.w,b.sysIndex);links.write('iBT',i,b.tx,b.tz,b.size,0);
      links.write('iInfo',i,Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,l.removed===null?1e6:secs(l.removed,epoch),clamp(3/Math.sqrt(perSys.get(a.sysIndex)||1),.15,1),rand(hash(key)));
      const ca=a.color,cb=b.color;links.write('iColA',i,ca.r,ca.g,ca.b);links.write('iColB',i,cb.r,cb.g,cb.b);});
    links.commit(linkKeys.length);
    // Pairs of systems with dependencies become tidal streams (the NB strongest); the strongest one also a plasma current.
    bridgeList=[...pairs.values()].sort((x,y)=>y.n-x.n||(x.key<y.key?-1:1)).slice(0,NB);
    for(const p of bridgeList){p.bornS=Number.isFinite(p.born)?secs(p.born,epoch):p.born===Infinity?1e6:-1e5;p.goneS=p.live?1e6:secs(p.removed,epoch);p.seed=rand(hash(`bridge/${p.ga}|${p.gb}`));}
    linkEnds=linkKeys.map(key=>{const l=model.links.get(key);const A=bodies.get(l.a),B=bodies.get(l.b);return [A&&!A.belt?A.index:-1,B&&!B.belt?B.index:-1];});
    builtVersion=model.version;
  }
  function rebuild(){builtVersion=-1;}
  // ---- Agents: comets (positions are pure functions of the observed lifecycle and time) ----------------------------
  const PROBE=G.agents?.form==='probe';
  const AGENT_COLORS=['#ff9ee8','#ffd27a','#9dffcf','#a7b8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'].map(c=>new THREE.Color(c));
  const homeSys=b=>{for(const s of sys.values())if(s.index===b.sysIndex&&s.pos)return s;return null;};
  function goalOf(p,tv,out){
    const b=p.fileId?bodies.get(p.fileId):null,home=p.home?bodies.get(p.home):null;const hs=home?homeSys(home):b?homeSys(b):null;
    if(b&&p.display==='tool'){bodyPos(out,b,tv);out.y+=b.size*2.4+.6;return out;}
    const phase=rand(hash(p.id))*TAU;
    if(hs){const waiting=p.display==='waiting'||p.display==='dormant';const R=waiting?hs.sysR+1.4:hs.sysR*.66+.8,speed=p.busy?.16:.04;
      return out.set(hs.pos.x+Math.cos(phase+tv*speed)*R,hs.pos.y+1.1+Math.sin(tv*.3+phase)*.3,hs.pos.z+Math.sin(phase+tv*speed)*R);}
    const R=outerR*.55;return out.set(Math.cos(phase+tv*.05)*R,1.6,Math.sin(phase+tv*.05)*R);
  }
  // A presence's position at time t: the goal of its current state, eased from the goal of its previous state.
  function agentAt(id,t,tv,out){const a=ctx.agents.presence(id,t);if(!a)return null;goalOf(a,tv,out);
    if(a.since<2600){const prev=ctx.agents.presence(id,t-a.since-1);if(prev){const k=smooth(a.since/2600);goalOf(prev,tv,tmp3);out.copy(tmp3.lerp(out,k));}}
    return a;}
  const fwd=new THREE.Vector3();
  function updateAgents(i){
    const list=i.agents.slice(0,MAX_AGENTS);let n=0,tn=0;const seen=new Set();const sp=ctx.speed();const head=new THREE.Vector3(),q=new THREE.Vector3(),star=new THREE.Vector3();
    camera.getWorldDirection(fwd);const H=ctx.pipeline.size[1],pyy=camera.projectionMatrix.elements[5];
    for(const a of list){seen.add(a.id);
      if(!agentAt(a.id,i.t,i.tview,head))continue;let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3()};agentState.set(a.id,st);}st.pos.copy(head);
      const c=AGENT_COLORS[a.voice%8],alpha=a.alpha*(a.busy?1:.6)*clamp(num(G.agentProminence,.8),0,1)*(i.overrides.intensity===0?.6:1),tailK=clamp(num(G.agents?.tail,1),.2,2.2);
      // the comet keeps a legible length at galaxy scale (an ion tail at least ~70 px)
      const depth=Math.max(.5,tmp.copy(head).sub(camera.position).dot(fwd)),ppu=pyy*H*.5/depth,minLen=70*(H/1080)/ppu;
      // coma and nucleus
      agentPts.write('position',n,head.x,head.y,head.z);agentPts.write('aCol',n,c.r*1.5,c.g*1.5,c.b*1.5,alpha*1.4);agentPts.write('aSize',n,2.4);n++;
      const beacon=PROBE?.4+.6*Math.pow(Math.max(0,Math.sin(i.tview*2.4+a.number)),8):1;
      agentPts.write('position',n,head.x,head.y,head.z);agentPts.write('aCol',n,1.6*beacon,1.6*beacon,1.7*beacon,alpha);agentPts.write('aSize',n,PROBE?1.6:1.1);n++;
      // dust trail: where the comet was (sampled from its pure path)
      for(let k=1;k<=TAIL;k++){const tt=i.t-k*45*sp*tailK;if(!agentAt(a.id,tt,i.tview-k*.045*tailK,q))break;const f=1-k/TAIL;
        agentPts.write('position',n,q.x,q.y,q.z);agentPts.write('aCol',n,c.r*(.6+f),c.g*(.55+f*.9),c.b*(.5+f*.8),alpha*f*f*.45);agentPts.write('aSize',n,(.9+f*1.4)*tailK);n++;}
      // ion tail: straight, away from the nearest star
      let best=null,bd=Infinity;for(const s of sys.values()){if(!s.alive||!s.pos)continue;const dd=s.pos.distanceToSquared(head);if(dd<bd){bd=dd;best=s;}}
      if(best&&!PROBE&&tn<10){star.copy(head).sub(best.pos);if(star.lengthSq()<1e-6)star.set(0,1,0);star.normalize();const len=Math.min(Math.max(2.8*tailK,minLen),depth*.5);
        ionTails.write('tH',tn,head.x,head.y,head.z,len);ionTails.write('tD',tn,star.x,star.y,star.z,alpha*.9);ionTails.write('tC',tn,.55,.8,1.6);tn++;}
      // work stream: particles comet -> planet while editing, planet -> comet while reading
      const b=a.fileId?bodies.get(a.fileId):null;
      if(b&&a.display==='tool'){const target=bodyPos(tmp2,b,i.tview);const inward=a.activity==='reading'||a.activity==='searching';
        for(let k=0;k<STREAM;k++){let f=((i.tview*.5+k/STREAM)%1);if(inward)f=1-f;q.copy(head).lerp(target,f);q.y+=Math.sin(f*Math.PI)*.3;
          agentPts.write('position',n,q.x,q.y,q.z);agentPts.write('aCol',n,c.r*1.6,c.g*1.6,c.b*1.6,alpha*Math.sin(f*Math.PI)*.8);agentPts.write('aSize',n,.75);n++;}}}
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
    agentPts.commit(n);ionTails.commit(tn);
  }
  // ---- Remnants (lasting): one shell nebula per system that earned verified milestones, in the galaxy march ----------
  function remnantSite(l){const s=l.subject||{};
    if(s.groupId&&sys.get(s.groupId)?.alive)return sys.get(s.groupId);
    const ids=s.fileIds||(s.fileId?[s.fileId]:[]);const count=new Map();for(const id of ids){const m=model.modules.get(id);if(m&&sys.get(m.group)?.alive)count.set(m.group,(count.get(m.group)||0)+1);}
    let best=null,bn=0;for(const [g,n] of count)if(n>bn){bn=n;best=g;}return best?sys.get(best):null;}
  bgU.uRmC1.value.copy(mix3(new THREE.Color('#e8607e'),pal.secondary,.2).multiplyScalar(.8));bgU.uRmC2.value.copy(mix3(new THREE.Color('#45d6e8'),pal.accent,.2));bgU.uRmC3.value.copy(mix3(new THREE.Color('#8f7dff'),pal.primary,.25));
  const remSites=new Map();
  function updateRemnants(i){
    const epoch=model.epoch,sp=ctx.speed();remSites.clear();
    for(const l of ctx.director.lasting()){if(l.first>i.t)continue;const site=remnantSite(l);
      // a milestone without a system of its own leaves its remnant in the field between the arms, never at the core
      const key=site?site.d.id:`field/${hash(`${l.type}|${l.subject?.groupId||''}|${(l.subject?.fileIds||[]).join(',')}`)}`;
      let r=remSites.get(key);if(!r){r={site,key,first:l.first,last:-Infinity,count:0,refactor:0};remSites.set(key,r);}
      const times=(l.times||[l.at]).filter(x=>x<=i.t);r.first=Math.min(r.first,l.first);r.last=Math.max(r.last,times.length?times[times.length-1]:l.first);r.count+=Math.max(1,l.count||1);
      if(l.type==='refactor.validated')r.refactor++;else r.refactor--;}
    const list=[...remSites.values()].sort((a,b)=>b.last-a.last||(a.key<b.key?-1:1)).slice(0,RM);
    const Yb=galR*SLAB;let n=0;
    for(const r of list){const h=hash(r.key);let cx,cy,cz,base;
      if(r.site){const p=r.site.local;cx=p.x+(rand(h)-.5)*.5;cy=p.y;cz=p.z+(rand(h+1)-.5)*.5;base=r.site.sysR*.8;}
      else{const a=rand(h)*TAU,q=(.45+.3*rand(h+1))*galR;cx=Math.cos(a)*q;cy=0;cz=Math.sin(a)*q;base=galR*.08;}
      const age=(i.t-r.first)/1000/sp,last=(i.t-r.last)/1000/sp;
      const size=base*(1+.14*Math.min(5,r.count-1))*(1+.06*Math.log(1+Math.max(age,0)/60))*(.5+.5*smooth(age/9));
      const pulse=last>=0?Math.exp(-last*.35)*smooth(last):0;
      bgU.uRmA.value[n].set(cx,cy,cz,size);bgU.uRmB.value[n].set(Math.min(2,r.count)*(r.refactor>0?-1:1),rand(h+2),smooth(age/7)*(1.1+.15*Math.min(4,r.count))*(1+pulse*1.6),Math.min(1,Yb*.8/size));n++;}
    bgU.uRmN.value=n;return n;}
  // ---- Effects ----------------------------------------------------------------------------------------------------
  let info={t:0,tsec:0,tview:0},fxT=0,fxSeed=0;
  const seedOf=cmd=>rand(hash(String(cmd.id??`${cmd.intent}|${cmd.at}`)));
  const sub=k=>rand(hash(`${fxSeed}/${k}`));
  function burst(pos,color,{radius=2,duration=1.6,size=1,mode=0,dir=null,spread=0,delay=0,key=0}={}){const k=burstNext++%BURSTS;burstU.uBA.value[k].set(pos.x,pos.y,pos.z,fxT+delay*ctx.speed());burstU.uBB.value[k].set(color.r*1.5,color.g*1.5,color.b*1.5,size);
    burstU.uBC.value[k].set(duration,mode,radius,sub(`b${key}`));if(dir)burstU.uBD.value[k].set(dir.x,dir.y,dir.z,spread);else burstU.uBD.value[k].set(0,1,0,spread);}
  function wave(pos,strength,duration=2.4,delay=0){waves.push({pos:pos.clone(),at:fxT+delay*ctx.speed(),duration,strength});if(waves.length>4)waves.shift();}
  function flash(amount,delay=0){flashes.push({at:fxT+delay*ctx.speed(),amount});if(flashes.length>6)flashes.shift();}
  // A light echo: a thin shell of light racing out from a star, decelerating; it lights the gas and dust it passes.
  function echo(st,{speed,width,strength,color,duration,delay=0}){echoes.push({local:{...st.local},at:fxT+delay*ctx.speed(),speed,width,strength,color:color.clone(),duration,seed:sub(`e${echoes.length}`)});if(echoes.length>6)echoes.shift();}
  const starFlares=new Map(),novaAt=new Map(),bridgePulse=new Map();let ckWave=null;
  const starOf=g=>{const s=sys.get(g);return s&&s.alive&&s.pos?s:null;};
  function planetsOf(ids){return (ids||[]).map(id=>({b:bodies.get(id),m:model.modules.get(id)})).filter(x=>x.b&&x.m);}
  // The systems an intent touches, the most affected first.
  function groupsOf(list){const c=new Map();for(const x of list)c.set(x.m.group,(c.get(x.m.group)||0)+1);return [...c].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1)).filter(([g])=>starOf(g));}
  const calmC=mix3(new THREE.Color('#d6f4ff'),pal.valid,.2),novaC=new THREE.Color('#fff6ec');
  // Commands at or before a moment (never after it: live playback and a replay fold the same commands up to then).
  const priorCmd=(at,types,ms=2000)=>{const c=ctx.director.commands;for(let k=c.length-1;k>=0;k--){const x=c[k];if(x.at<=at&&at-x.at<=ms&&types.includes(x.intent))return x;}return null;};
  function effect(cmd,i){
    if(i)info=i;fxT=Number.isFinite(cmd.at)?(cmd.at-model.epoch)/1000:info.tsec;fxSeed=seedOf(cmd);const tv=fxT/ctx.speed(),s=clamp(cmd.scale,0,1.6),subj=cmd.subject||{};if(s<=0)return;
    const planetPos=id=>{const b=bodies.get(id);return b?bodyPos(new THREE.Vector3(),b,tv):null;};
    switch(cmd.effect){
      case 'ignition':{pendingIgn.push({g:subj.groupId,at:fxT,s,seed:fxSeed});if(pendingIgn.length>8)pendingIgn.shift();flushIgnitions();break;}
      case 'planet-birth':{const p=planetPos(subj.fileId);if(!p)break;const b=bodies.get(subj.fileId);burst(p,b.color.clone().lerp(new THREE.Color(1,.8,.6),.4),{radius:b.size*5+.6,duration:2,size:.7,mode:5});break;}
      case 'accretion-spark':{const p=planetPos(subj.fileId);if(!p)break;burst(p,pal.highlight,{radius:1.3*s+.5,duration:1.5,size:.6,mode:1});break;}
      case 'ablation':{const p=planetPos(subj.fileId);if(!p)break;const b=bodies.get(subj.fileId);const st=homeSys(b);const away=st?p.clone().sub(st.pos).normalize():new THREE.Vector3(0,1,0);
        burst(p,new THREE.Color(.5,.52,.6),{radius:2.2,duration:2.2,size:.6,mode:2,dir:away,spread:.5});break;}
      case 'flare-bridge':{const a=bodies.get(subj.fileId),b=bodies.get(subj.targetId);if(!a||!b)break;const sa=homeSys(a),sb=homeSys(b);if(!sa||!sb||sa===sb)break;
        // the stream between the two systems carries a surge of light from one to the other; both stars flare
        const ga=a.group,gb=b.group,key=ga<gb?`${ga}|${gb}`:`${gb}|${ga}`;bridgePulse.set(key,{at:fxT,s:(cmd.tier>=2?1:.55)*Math.min(1.2,s),from:ga});
        if(cmd.tier>=2){starFlares.set(sa.index,fxT);starFlares.set(sb.index,fxT);}break;}
      case 'stellar-storm':{const gs=groupsOf(planetsOf(subj.fileIds));if(!gs.length)break;const top=gs[0][1];
        storms.push({at:fxT,s,w:new Map(gs.map(([g,n])=>[g,.45+.55*n/top]))});if(storms.length>4)storms.shift();break;}
      case 'aurora':{const list=planetsOf(subj.fileIds);for(const x of list.slice(0,14))burst(bodyPos(new THREE.Vector3(),x.b,tv),pal.valid,{radius:x.b.size*3+.4,duration:2.4,size:.6,mode:4,key:x.m.id});break;}
      case 'calm-pulse':{const list=planetsOf(subj.fileIds);const gs=groupsOf(list);
        // when a verified milestone came with the recovery, its nova carries the moment (no second glow)
        const merged=!!priorCmd(cmd.at,['milestone.achieved','refactor.validated']);
        if(!merged){for(const [g] of gs.slice(0,4))starFlares.set(starOf(g).index,fxT);for(const x of list.slice(0,14))burst(bodyPos(new THREE.Vector3(),x.b,tv),calmC,{radius:x.b.size*3+.5,duration:2.6,size:.5,mode:4,key:x.m.id});}
        calms.push({at:fxT,amount:merged?0:s,groups:new Set(gs.map(([g])=>g)),cmdAt:cmd.at});if(calms.length>4)calms.shift();break;}
      case 'accretion-collapse':case 'nova':{const gs=groupsOf(planetsOf(subj.fileIds));const main=gs.length?starOf(gs[0][0]):null;const rare=cmd.tier>=4,nova=cmd.effect==='nova',d0=nova?0:1.2;
        // a recovery just before gives way to it: one focal moment (its storm still dissolves)
        for(const c of calms)if(c.cmdAt<=cmd.at&&cmd.at-c.cmdAt<=2000)c.amount=0;
        if(!main){wave(new THREE.Vector3(),.4*s,3);break;}
        starFlares.set(main.index,fxT+d0*ctx.speed());novaAt.set(main.index,fxT+d0*ctx.speed());
        if(!nova)burst(main.pos,new THREE.Color(.7,.75,1),{radius:main.sysR*1.4,duration:1.4,size:1,mode:1});
        burst(main.pos,novaC,{radius:main.sysR*(nova?1.8:1.3),duration:nova?2.6:2,size:.9,delay:d0});
        echo(main,{speed:galR*(rare?.3:.25),width:galR*.009,strength:rare?1.1:.8,color:mix3(new THREE.Color('#dcecff'),pal.accent,.2),duration:rare?12:10,delay:d0});
        wave(main.pos,(rare?.6:.4)*s,rare?4:3,d0);flash((rare?.1:.05)*s,d0);
        novas.push({at:fxT+d0*ctx.speed(),idx:main.index,amount:rare?1:.65});if(novas.length>3)novas.shift();
        for(const [g] of gs.slice(1,4)){const st=starOf(g);starFlares.set(st.index,fxT+d0*ctx.speed());}break;}
      case 'gravity-wave':{wave(new THREE.Vector3(),.35*s,3.2);galMat.uniforms.uWave.value.set(tv,1.1*s,0,0);ckWave={at:fxT,s,gold:false};break;}
      case 'expansion':{wave(new THREE.Vector3(),.3,3.5);galMat.uniforms.uExpand.value.set(tv,1.2*s,0,0);ckWave={at:fxT,s:s*.8,gold:true};break;}
      default:break;
    }
  }
  // Ignitions wait for the model's star (see the header): timed from the star's recorded birth. A nursery globule
  // collapses for 2.6 s (the camera has arrived by then), the star ignites, blows the globule open and a light echo leaves.
  const pendingIgn=[],nurseries=[];
  function flushIgnitions(){
    for(let k=pendingIgn.length-1;k>=0;k--){const p=pendingIgn[k];const st=starOf(p.g);
      if(!st){if(info.tsec-p.at>60*ctx.speed())pendingIgn.splice(k,1);continue;}
      pendingIgn.splice(k,1);const save=fxT,saveSeed=fxSeed;fxT=Math.max(p.at,Number.isFinite(st.born)?secs(st.born,model.epoch):p.at);fxSeed=p.seed;ignite(st,p.s);fxT=save;fxSeed=saveSeed;}
  }
  const IGN=2.6;
  function ignite(st,s){
    nurseries.push({g:st.d.id,at:fxT,s,seed:sub('nursery')});if(nurseries.length>3)nurseries.shift();
    burst(st.pos,new THREE.Color(.9,.45,.3),{radius:st.sysR*1.2,duration:2.4,size:1,mode:1,key:'in'});
    burst(st.pos,st.color,{radius:st.sysR*1.1,duration:2,size:1,delay:IGN,key:'out'});
    starFlares.set(st.index,fxT+IGN*ctx.speed());
    echo(st,{speed:galR*.12,width:galR*.007,strength:.9*(.6+.4*s),color:st.color.clone().lerp(new THREE.Color(1,1,1),.4),duration:7,delay:IGN});
    wave(st.pos,.25*s,2.4,IGN);flash(.03*s,IGN);
  }
  // ---- Frame ------------------------------------------------------------------------------------------------------
  let stressNow=0,remCount=0;const stormOf=new Map(),stressOf=new Map();
  const stormK=mix3(new THREE.Color('#e01838'),pal.warning,.25);
  const evList=[];
  function pushEv(pri,type,c,radius,w,strength,dis,seedV,col){evList.push({pri,type,x:c.x/galR,z:c.z/galR,r:radius/galR,w,strength,dis,seed:seedV,col});}
  function updateEvents(i,sp){
    evList.length=0;const inten=i.overrides.intensity??1;
    for(const x of echoes){const age=(i.tsec-x.at)/sp;if(age<0||age>x.duration)continue;const tau=2.2,rad=x.speed*tau*(1-Math.exp(-age/tau));
      const fade=smooth(age/.25)*(1-smooth((age-x.duration*.4)/(x.duration*.6)))*inten;if(fade<=0)continue;pushEv(4-age*.01,0,x.local,rad,x.width*(1+age*.3)/galR,x.strength*fade,0,x.seed,x.color);}
    for(const nu of nurseries){const age=(i.tsec-nu.at)/sp;const st=sys.get(nu.g);if(age<0||age>IGN+2.2||!st?.alive)continue;
      const ig=smooth((age-IGN+.05)/.3),rad=st.sysR*1.1*(1-.6*smooth(age/IGN))*(1+ig*.9*Math.max(0,age-IGN));const str=Math.max(.3,inten)*(1-smooth((age-IGN-.3)/1.8));
      pushEv(3,2,st.local,rad,ig,str,0,nu.seed,st.color.clone().lerp(new THREE.Color(1,.6,.4),.35*(1-ig)));}
    for(const s of sys.values()){if(!s.alive)continue;const lvl=s.lvl||0;
      if(lvl>.02){pushEv(2+lvl,1,s.local,s.sysR*.95,0,lvl*Math.max(.5,Math.min(1,inten)),0,s.seed,stormK);continue;}
      for(const c of calms){const age=(i.tsec-c.at)/sp;if(age<0||age>4.5||!c.groups.has(s.d.id))continue;pushEv(1.5,1,s.local,s.sysR*.95,0,.8*(1-smooth(age/4.5)),age/4.5,s.seed,stormK);break;}}
    for(const c of calms){const age=(i.tsec-c.at)/sp;if(age<0||age>9||c.amount<=0)continue;for(const g of c.groups){const s=sys.get(g);if(!s?.alive)continue;
      pushEv(1,3,s.local,s.sysR*1.5,0,.5*c.amount*smooth(age/1.4)*Math.exp(-age*.3)*inten,0,s.seed,calmC);}}
    evList.sort((a,b)=>b.pri-a.pri);let e=0;const U=mevU;
    for(const x of evList){if(e>=MEV)break;U.uMx.value[e].set(x.x,x.z,x.r,x.w);U.uMy.value[e].set(x.type,x.strength,x.dis,x.seed);U.uMc.value[e].set(x.col.r,x.col.g,x.col.b);e++;}
    for(;e<MEV;e++)U.uMy.value[e].set(0,0,0,0);
  }
  // Tidal streams: polylines in the galaxy's own frame (normalised), bent along a log spiral between the two systems
  // (so they swing around the core and lie in the disc); grown from their recorded birth, surging on a connection.
  const tmpC=new THREE.Color(),tmpC2=new THREE.Color();
  function updateBridges(i,sp){
    const inten=i.overrides.intensity??1;let b=0;
    for(const p of bridgeList){const sa=sys.get(p.ga),sb=sys.get(p.gb);if(!sa?.alive||!sb?.alive||!sa.local||!sb.local)continue;
      const age=i.tsec-p.bornS,gone=p.goneS<1e5?smooth((i.tsec-p.goneS)/sp/1.5):0;if(age<0||gone>=1)continue;
      const ax=sa.local.x/galR,az=sa.local.z/galR,bx=sb.local.x/galR,bz=sb.local.z/galR;let ra=Math.hypot(ax,az),rb=Math.hypot(bx,bz);let ta=Math.atan2(az,ax),tb=Math.atan2(bz,bx);
      if(ra<.03)ta=tb;if(rb<.03)tb=ta;let dt=tb-ta;while(dt>Math.PI)dt-=TAU;while(dt<-Math.PI)dt+=TAU;
      const plasmaPair=b===0;const w=Math.min(.017,.008+.0025*Math.log2(1+p.n))*(plasmaPair?1.2:1);let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      const bow=(p.seed>.5?1:-1)*(.06+.16*Math.abs(dt)/Math.PI);
      for(let k=0;k<BK;k++){const t=k/(BK-1);const r=(ra>.05&&rb>.05?ra*Math.pow(rb/ra,t):lerp(ra,rb,t))*(1+bow*Math.sin(Math.PI*t)),a=ta+dt*t;const x=Math.cos(a)*r,y=Math.sin(a)*r;
        brU.uBrP.value[b*BK+k].set(x,y);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
      const m=w*3.2;brU.uBrB.value[b].set(x0-m,y0-m,x1+m,y1+m);
      brU.uBrI.value[b].set(w,Math.min(.3,.09+.04*Math.log2(1+p.n))*(plasmaPair?1.25:1)*(1-gone)*(.25+.75*Math.min(1,inten)),clamp(age/sp/2.5)*1.05,p.seed);
      const pu=bridgePulse.get(p.ga<p.gb?`${p.ga}|${p.gb}`:`${p.gb}|${p.ga}`);let px=-1,ps=0;if(pu){const pa=(i.tsec-pu.at)/sp;if(pa>=0&&pa<3.4){const f=clamp(pa/2.4);px=pu.from===p.ga?f:1-f;ps=pu.s*(1-smooth((pa-2.4)/1))*smooth(pa/.3)*inten;}}
      brU.uBrX.value[b].set(px,ps,plasmaPair?1:0,0);
      const ca=tmpC.copy(sa.color).lerp(cYoung,.7),cb=tmpC2.copy(sb.color).lerp(cYoung,.7);brU.uBrC0.value[b].set(ca.r,ca.g,ca.b);brU.uBrC1.value[b].set(cb.r,cb.g,cb.b);b++;if(b>=NB)break;}
    for(;b<NB;b++)brU.uBrI.value[b].set(0,0,0,0);
  }
  // Which system the camera is attending to (its star resolves fully while framed; elsewhere stars stay points).
  function attentionFocus(i){const att=ctx.director.attentionAt(i.t,2);if(!att)return null;const since=(i.t-att.at)/ctx.speed()/1000;if(!(since<13))return null;
    const s=att.subject||{};let st=null;if(s.fileId&&bodies.has(s.fileId)&&!s.targetId)st=homeSys(bodies.get(s.fileId));else if(s.groupId)st=starOf(s.groupId);else if(s.fileIds)st=worstSystem(s.fileIds);
    return st?{index:st.index,k:smooth(since/1.6)*(1-smooth((since-8.5)/4.5))*clamp(i.overrides.intensity??1,.4,1)}:null;}
  function update(i){
    info=i;const epoch=model.epoch;
    if(!baked)bakeSky();
    const sp=ctx.speed();common.uT.value=i.tsec;common.uV.value=i.tview;common.uSpeed.value=sp;common.uActivity.value=i.activity;
    common.uBeat.value=i.beat*num(MU.beatPulse,.4)*num(MU.reactivity,.6)*.6;
    const tempo=Math.max(40,i.mood?.tempo||92),breathS=Math.max(2,num(mot.breath,4))*4*60/tempo;common.uBreath.value=Math.sin(i.tview/breathS*TAU)*num(MU.reactivity,.6);
    common.uIntensity.value=i.overrides.intensity??1;const motion=clamp(i.overrides.motion??1,0,2);common.uMotion.value=motion;
    const px=ctx.pipeline.size[1]/1080;common.uPx.value=Math.max(.5,px);common.uRes.value.set(ctx.pipeline.size[0],ctx.pipeline.size[1]);
    updateLayout(i);
    if(model.version!==builtVersion)syncBodies();
    if(pendingIgn.length)flushIgnitions();
    const q=i.quality||0;discMat.uniforms.uQ.value=q;beltMat.uniforms.uQ.value=q;
    gal.geometry.setDrawRange(0,q>=2?GSTARS>>1:GSTARS);bgU.uQ.value=q;
    galMat.uniforms.uRich.value=richness(i.t);galU.uGal3.value.x=.55+.45*galMat.uniforms.uRich.value;
    // The gas flows (two phases of a 48 s cycle), knots evolve; both pure functions of view time.
    mapMat.uniforms.uFlowT.value=i.tview/48;mapMat.uniforms.uFlowK.value=.2*Math.min(1.5,motion);mapMat.uniforms.uKnotT.value=i.tview*.018*Math.min(1.5,motion);mapMat.uniforms.uMV.value=i.tview;
    // Stars: birth, flares, novae, unrest (stressed planets now, and the storm a failing run raised), attention.
    const list=[...sys.values()].filter(s=>s.alive);stars.ensure(list.length);
    stressOf.clear();let stressed=0,alive=0;
    for(const id of moduleIds){const m=model.modules.get(id);if(!m||!aliveAt(m,i.t))continue;alive++;if(model.stateAt(m,i.t)==='stressed'){stressOf.set(m.group,(stressOf.get(m.group)||0)+1);stressed++;}}
    stressNow=alive?clamp(stressed/Math.max(3,alive*.35)):0;
    stormOf.clear();for(const x of storms){const age=(i.tsec-x.at)/sp;if(age<0||age>40)continue;const k=smooth(age/.6)*Math.exp(-age/9)*clamp(x.s,.4,1.2);for(const [g,w] of x.w)stormOf.set(g,Math.max(stormOf.get(g)||0,w*k));}
    const focus=attentionFocus(i);
    list.forEach((s,k)=>{const fl=starFlares.has(s.index)?starFlares.get(s.index):-1e5;const sn0=stressOf.get(s.d.id)||0;const lvl=sn0?clamp(Math.min(1,sn0/3)*.7+(stormOf.get(s.d.id)||0)):0;s.lvl=lvl;
      stars.write('iStar',k,s.index,Number.isFinite(s.born)?secs(s.born,epoch):-1e5,fl,lvl);
      stars.write('iStarColor',k,s.color.r,s.color.g,s.color.b);stars.write('iStarFx',k,novaAt.has(s.index)?novaAt.get(s.index):-1e5,focus&&focus.index===s.index?focus.k:0,s.seed,s.d.core?1:0);});
    for(const s of sys.values())if(!s.alive)s.lvl=0;
    stars.commit(list.length);bindShared(coronaGeo,stars.geometry,['iStar','iStarColor','iStarFx'],list.length);
    // Planets: state transitions (blended in the shader), agents at work, human edits; orbit arcs light for active ones.
    const working=new Map();for(const a of i.agents)if(a.fileId&&a.display==='tool')working.set(a.fileId,a);
    const recent=(at,ms)=>Number.isFinite(at)&&i.t>=at?Math.exp(-(i.t-at)/(ms*sp)):0;
    let beltDirty=false;
    for(const id of moduleIds){const m=model.modules.get(id),b=bodies.get(id);if(!m||!b)continue;
      let cur=m.initial,prev=m.initial,at=-1e5,atMs=-Infinity;for(const e of m.states){if(e.at>i.t)break;prev=cur;cur=e.state;at=secs(e.at,epoch);atMs=e.at;}
      if(b.belt){const v=STATE_INDEX[cur]??1;if(beltState[b.index]!==v){beltState[b.index]=v;for(let k=0;k<BELT_N;k++)belt.arrays.kC[(b.index*BELT_N+k)*4+3]=v;beltDirty=true;}continue;}
      const k=b.index;planets.write('iLook',k,b.style,STATE_INDEX[cur]??1,STATE_INDEX[prev]??1,b.sub);
      const life=planets.arrays.iLife;life[k*4+2]=at;planets.dirty('iLife');
      const glow=working.has(id)?.8:Number.isFinite(m.lastHuman)&&i.t>=m.lastHuman&&i.t-m.lastHuman<4000*sp?.6*(1-(i.t-m.lastHuman)/(4000*sp)):0;
      planets.write('iGlow',k,glow,b.seed);
      orbits.arrays.oAct[k]=Math.max(working.has(id)?1:0,recent(m.lastHuman,12000),recent(atMs,15000),recent(model.bornAt(m),15000));}
    planets.flush();orbits.dirty('oAct');orbits.flush();if(beltDirty){belt.dirty('kC');belt.flush();}
    bindShared(pSpriteGeo,planets.geometry,['iOrbit','iTilt','iLife','iLook','iColor','iGlow'],planetIds.length);
    for(let k=0;k<linkEnds.length;k++){const [a,b]=linkEnds[k];links.arrays.iAct[k]=Math.max(a>=0?orbits.arrays.oAct[a]:0,b>=0?orbits.arrays.oAct[b]:0);}links.dirty('iAct');links.flush();
    orbitMat.uniforms.uOrbitK.value=clamp(1.1/Math.sqrt(Math.max(1,planetIds.length/12)),.08,1);
    remCount=updateRemnants(i);
    const un=k=>i.unlocks[k]?.level||0;
    bgU.uUnlock.value.set(un(0),un(1),un(2),un(3));plasmaMat.uniforms.uCurrents.value=un(1);haloMat.uniforms.uHalo.value=un(3);
    bgU.uStorm.value=stressNow*.8+Math.min(1,Math.max(0,...stormOf.values()))*.2;
    updateEvents(i,sp);updateBridges(i,sp);
    // a commit's compression front (and the gold front of a world expanding) in the gas map
    const ck=mapMat.uniforms.uCk.value;ck.set(-9,0,.06,0);
    if(ckWave){const age=(i.tsec-ckWave.at)/sp;if(age>=0&&age<3.8)ck.set(.05+age*.4,Math.max(.6,ckWave.s)*1.4*(1-smooth((age-2.4)/1.3))*smooth(age/.25)*(i.overrides.intensity??1),.035+.025*age,ckWave.gold?1:0);}
  }
  function afterCamera(i){camera.updateMatrixWorld();bgU.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);bgU.uCam.value.copy(camera.position);
    // The sky turns with the camera (with a slight lag, for parallax): its densest complex stays behind the galaxy.
    let da=Math.atan2(camera.position.z,camera.position.x)-baseAz;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
    bgU.uSkyRot.value=-da*.82+i.tview*.002*clamp(i.overrides.motion??1,0,2);
    updateAgents(i);renderGalaxy(i.quality||0);}
  function background(){return background_;}
  const proj=new THREE.Vector3();
  function screenOf(p){proj.copy(p).project(camera);return proj.z<1&&Math.abs(proj.x)<1.15&&Math.abs(proj.y)<1.15?{x:proj.x*.5+.5,y:proj.y*.5+.5}:null;}
  function grade(i){
    const inten=i.overrides.intensity??1,sp=ctx.speed();
    const out=[];for(const w of waves){const age=(i.tsec-w.at)/sp/w.duration;if(age<0||age>1)continue;const p=w.pos.clone().project(camera);if(p.z>1)continue;out.push({x:p.x*.5+.5,y:p.y*.5+.5,r:age*.9,a:w.strength*(1-age)*inten});}
    let f=0;for(const x of flashes){const age=(i.tsec-x.at)/sp;if(age>=0&&age<3)f+=x.amount*Math.exp(-age*2.2);}
    let calm=0;for(const x of calms){const age=(i.tsec-x.at)/sp;if(age>=0&&age<8)calm+=.04*x.amount*smooth(age/1.2)*Math.exp(-age*.45);}
    const sec=i.mood?.section;const st=Math.min(1,stressNow+Math.max(0,...stormOf.values(),0)*.5);
    const exposure=(1+(clamp(num(LT.exposure,1.05),.4,2.2)-1)*.6)*1.08*(sec==='breath'?.96:sec==='lift'?1.03:1)*1.24*(1-.1*st)*(1+Math.min(.05,calm)*inten);
    const tint=new THREE.Vector3(1,1,1);if(sec==='tension')tint.set(1.04,.98,.96);else if(sec==='resolve')tint.set(.97,1.01,1.03);
    tint.lerp(new THREE.Vector3(1.08,.9,.95),st*.6);
    // Light shafts from the galactic core, and from a star that went nova.
    const rays=[];const core=screenOf(tmp.set(0,0,0));
    if(core)rays.push({x:core.x,y:core.y,strength:.05*(1-st*.6),color:{x:1,y:.86,z:.68}});
    let nova=null;for(const x of novas){const age=(i.tsec-x.at)/sp;if(age>=0&&age<10){const s=[...sys.values()].find(z=>z.index===x.idx&&z.alive);if(s){const p=screenOf(s.pos);if(p)nova={...p,strength:.2*x.amount*Math.exp(-age*.45)*smooth(age/.3)};}}}
    if(nova)rays.push({x:nova.x,y:nova.y,strength:nova.strength*inten,color:{x:.95,y:.97,z:1}});
    return {tonemap:'agx',bloom:Math.min(1.6,num(LT.bloom,1))*.62*(1+.15*i.activity)*(1+(i.unlocks[3]?.level||0)*.08),threshold:clamp(num(LT.bloomThreshold,.7),.6,.85),exposure,
      contrast:clamp(num(LT.contrast,1),.9,1.3)*1.04,saturation:1.12*(1-.2*st),vignette:num(LT.vignette,.3)*1.1,grain:num(LT.grain,.025)*.5,flash:f*inten,waves:out,tint,aberration:.0022,
      bloomTint:{x:1,y:.95,z:.93},rays,rayDecay:.962};
  }
  // ---- Camera: an establishing view from low over the disc, attention on what changed, a slow lateral dolly at rest ----
  function cameraGoal(i){
    const fov=clamp(num(cam.fov,36),20,55),tanHalf=Math.tan(fov*Math.PI/360),aspect=camera.aspect||16/9,motion=clamp(i.overrides.motion??1,0,2);
    const R=Math.max(10,galR);
    // The galaxy's coverage of the frame stays the same across fields of view and aspect ratios.
    const kd=clamp(num(cam.distance,1),.6,1.6)*(.3249*1.7778)/(tanHalf*clamp(aspect,1.2,2.4));
    const kc=ARR==='cluster'?1.9:1;const h=R*1.03*kd*kc,z=R*(.27+.15*clamp(num(cam.elevation,.4),.05,.9))*kd*kc;
    const drift=clamp(num(cam.drift,.7),0,1.6);
    const az=cam.personality==='drifting'?baseAz+Math.sin(i.tview/170)*.3*drift*motion:baseAz+i.tview*TAU/1100*motion*(.5+.5*drift);
    const toward=new THREE.Vector3(Math.cos(az),0,Math.sin(az)),right=new THREE.Vector3(Math.sin(az),0,-Math.cos(az));
    // The core sits on the right third, a little above centre; the near arm leaves the frame at the bottom.
    const pitch=Math.atan2(z,h)+Math.atan(.3*tanHalf);
    const dolly=R*.09*Math.sin(i.tview*TAU/150)*motion*(.4+.6*drift);
    const lat=.24*tanHalf*aspect*Math.hypot(h,z);
    const C=toward.clone().multiplyScalar(h).addScaledVector(right,-(lat+dolly));C.y=z;
    let distance=z/Math.sin(pitch),elev=pitch;
    let target=C.clone().addScaledVector(toward,-distance*Math.cos(pitch));target.y=0;
    const frameSubject=(pos,radius,k)=>{const d=Math.max(6,radius/tanHalf*1.1);
      target.lerp(tmp2.copy(pos).addScaledVector(right,-d*tanHalf*aspect*.12),k);distance=lerp(distance,d,k);elev=lerp(elev,Math.max(pitch,.3),k);};
    const att=ctx.director.attentionAt(i.t,2);const since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;
    let k=0;
    if(att&&since<13){const a=attentionSubject(att,i);if(a){k=smooth(since/1.6)*(1-smooth((since-8.5)/4.5))*clamp(i.overrides.intensity??1,.4,1);frameSubject(a.pos,a.radius,k);}}
    if(k<.01){const busy=i.agents.find(a=>a.display==='tool'&&a.fileId&&bodies.has(a.fileId));
      if(busy){const b=bodies.get(busy.fileId),hs=homeSys(b);if(hs)frameSubject(hs.pos,sysFrame(hs,hs.sysR*2.4),.22);}}
    return {target,distance,azimuth:az,elevation:elev,fov,omega:k>.01?.75:.55};
  }
  // What an intent is about, for the camera and the callout: the most affected system for multi-file intents.
  function worstSystem(ids){const gs=groupsOf(planetsOf(ids));return gs.length?starOf(gs[0][0]):null;}
  // The core subsystem lives in the bulge: it is framed with the whole nucleus around it, never from inside the glow.
  const sysFrame=(st,r)=>st&&st.d?.core?Math.max(r,galR*.38):r;
  function attentionSubject(c,i){const s=c.subject||{};
    if(s.fileId&&bodies.has(s.fileId)){const b=bodies.get(s.fileId);const st=homeSys(b);
      if(s.targetId&&bodies.has(s.targetId)){const tb=bodies.get(s.targetId),ts=homeSys(tb);if(st&&ts&&st!==ts)return {pos:st.pos.clone().lerp(ts.pos,.5),radius:st.pos.distanceTo(ts.pos)*.62+Math.max(st.sysR,ts.sysR)*.6};
        const p=bodyPos(new THREE.Vector3(),b,i.tview),q=bodyPos(new THREE.Vector3(),tb,i.tview);return {pos:p.clone().lerp(q,.5),radius:p.distanceTo(q)*.6+2};}
      return {pos:st?st.pos.clone():bodyPos(new THREE.Vector3(),b,i.tview),radius:sysFrame(st,st?st.sysR*1.1:b.r+1)};}
    if(s.groupId&&starOf(s.groupId)){const st=sys.get(s.groupId);return {pos:st.pos.clone(),radius:sysFrame(st,st.sysR*1.2)};}
    const w=worstSystem(s.fileIds);if(w)return {pos:w.pos.clone(),radius:sysFrame(w,w.sysR*1.35)};
    return null;}
  function attentionPoint(c,i){const s=c.subject||{};
    if(s.fileId&&bodies.has(s.fileId)){if(s.targetId&&bodies.has(s.targetId))return bodyPos(new THREE.Vector3(),bodies.get(s.fileId),i.tview).lerp(bodyPos(new THREE.Vector3(),bodies.get(s.targetId),i.tview),.5);return bodyPos(new THREE.Vector3(),bodies.get(s.fileId),i.tview);}
    if(s.groupId&&starOf(s.groupId))return sys.get(s.groupId).pos.clone();
    const w=worstSystem(s.fileIds);return w?w.pos.clone():new THREE.Vector3();}
  // ---- Words -------------------------------------------------------------------------------------------------------
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const groupName=id=>{const s=sys.get(id);return s?`${ctx.name(id)} · ${s.role}`:ctx.name(id);};
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  const milestoneWords=c=>(c.detail?.kinds||[]).map(x=>MILESTONE[x]||x).join(' · ');
  function describe(c,i){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=attentionPoint(c,i);
    switch(c.intent){
      case 'subsystem.created':return {text:'A new star ignites',sub:groupName(s.groupId),position:pos};
      case 'structure.created':return {text:'New structure enters orbit',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','component').replace('api.route','route')}`).join(' · ')||plural(d.count||1,'symbol'),position:pos};
      case 'subsystem.connected':{const a=bodies.get(s.fileId),b=bodies.get(s.targetId);const ga=a?model.modules.get(s.fileId)?.group:null,gb=b?model.modules.get(s.targetId)?.group:null;
        // say only what is drawn: the strongest pair carries a plasma current, the next strongest a tidal stream of gas
        const bi=ga&&gb?bridgeList.findIndex(p=>(p.ga===ga&&p.gb===gb)||(p.ga===gb&&p.gb===ga)):-1;const form=bi===0?'a plasma current':bi>0?'a stream of gas':null;
        return {text:form?(d.first?`Integration · ${form} links two systems`:`The ${form.slice(2)} between two systems brightens`):(d.first?'Integration · two systems now depend on each other':'Two systems depend on each other more'),sub:ga&&gb?`${ctx.name(ga)} ↔ ${ctx.name(gb)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · a stellar storm over ${plural(n,'world')}`,sub:'observed failing run',position:pos,color:'#ff8a6a'};
      case 'validation.passed':return {text:`Tests pass · aurora on ${plural(n,'world')}`,sub:'observed passing run',position:pos,color:'#9dffcf'};
      case 'validation.recovered':{const m=priorCmd(c.at,['milestone.achieved']);const words=m?milestoneWords(m):'';
        // A milestone that landed with the recovery keeps its banner (the labels show one callout per subject).
        return m&&words?{text:`Recovered · ${plural(d.repaired||n,'world')} calm again · a nova marks the milestone`,sub:'the tests pass again',position:pos,color:'#9dffcf',banner:words,bannerSub:'milestone · verified by a passing test run'}
          :{text:`Recovered · ${plural(d.repaired||n,'world')} calm again`,sub:'the tests pass again',position:pos,color:'#9dffcf',banner:'Recovery',bannerSub:'the tests pass again'};}
      case 'refactor.validated':return {text:'Refactor validated · the system consolidates',sub:plural(d.removedSymbols||0,'symbol')+' removed',position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=milestoneWords(c);return {text:`${({aurora:'Aurora','calm-pulse':'Calm pulse','accretion-collapse':'Collapse'})[c.effect]||'Nova'} · ${k}`,sub:'verified by a passing test run · a remnant remains',position:pos,banner:k,bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:n?`Committed · ${plural(n,'world')} set in orbit`:'Committed · the work is set in place',sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The galaxy grows · chapter ${d.chapter}`,sub:'accumulated structure',position:new THREE.Vector3()};
      default:return null;}}
  function agentPosition(id){return agentState.get(id)?.pos||null;}
  function agentColor(a){return '#'+AGENT_COLORS[a.voice%8].getHexString();}
  function subsystemLabels(i){return [...sys.values()].filter(s=>s.alive&&s.pos).map(s=>({position:s.pos.clone().add(new THREE.Vector3(0,s.radius*1.6+.7,0)),text:ctx.name(s.d.id),sub:`${s.role} · ${plural(s.d.members.length,'module')}`}));}
  function status(i){let v=0,st=0;for(const id of moduleIds){const m=model.modules.get(id);if(!m||!model.alive(m,i.t))continue;const s=model.stateAt(m,i.t);if(s==='validated')v++;if(s==='stressed')st++;}return st?`${st} under strain`:v?`${v} validated`:'';}
  function pick(x,y,cam,i){let best=null,bd=.05;for(const [id,b] of bodies){const p=bodyPos(tmp,b,i.tview).project(cam);const d=Math.hypot(p.x-x,(p.y-y)*.6);if(p.z<1&&d<bd){bd=d;best=id;}}
    if(!best)for(const s of sys.values()){if(!s.alive||!s.pos)continue;const p=s.pos.clone().project(cam);const d=Math.hypot(p.x-x,p.y-y);if(p.z<1&&d<bd*1.6){bd=d;best='sys:'+s.d.id;}}return best;}
  function inspect(id,i){if(!id)return null;
    if(id.startsWith('sys:')){const s=sys.get(id.slice(4));return s&&s.pos?{position:s.pos.clone(),text:groupName(s.d.id),sub:`${plural(s.d.members.length,'module')} · star of this subsystem`}:null;}
    const m=model.modules.get(id),b=bodies.get(id);if(!m||!b)return null;const syms=model.symbolsAt(m,i.t);const deps=[...model.links.values()].filter(l=>(l.a===id||l.b===id)&&model.alive(l,i.t)).length;
    return {position:bodyPos(new THREE.Vector3(),b,i.tview),text:`A ${['UI','typed','test','logic','configuration'][b.style]} ${b.belt?'asteroid clump':'world'} · ${model.stateAt(m,i.t)}`,sub:`${plural(syms,'symbol')} · ${plural(deps,'dependency')} · ${ctx.name(m.group)}`};}
  function stats(){return {systems:[...sys.values()].filter(s=>s.alive).length,planets:planetIds.length,belts:beltIds.length,moons:symbolIds.length,links:linkKeys.length,bridges:bridgeList.length,remnants:remCount,galaxyStars:GSTARS,
    galaxy:+galR.toFixed(2),arrangement:ARR,camera:camera.position.toArray().map(x=>+x.toFixed(1))};}
  function dispose(){
    const objs=[];scene.traverse(o=>{if(o!==scene)objs.push(o);});
    for(const o of objs){scene.remove(o);o.geometry?.dispose?.();o.material?.dispose?.();}
    for(const x of disposables)x.dispose?.();fsScene.remove(fsQuad);
  }
  // After a seek: no transient survives, and pools restart (their look comes from the commands, never from the slot).
  function onPrime(){starFlares.clear();novaAt.clear();bridgePulse.clear();ckWave=null;pendingIgn.length=0;nurseries.length=0;waves.length=0;flashes.length=0;calms.length=0;novas.length=0;storms.length=0;echoes.length=0;agentState.clear();
    burstNext=0;for(const v of burstU.uBA.value)v.w=-1e5;
    galMat.uniforms.uWave.value.set(-100,0,0,0);galMat.uniforms.uExpand.value.set(-100,0,0,0);}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime};
}

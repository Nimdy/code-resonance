// Machine Cathedral: the software as a monumental machine-cathedral of light, built while the work happens.
// A night cathedral city on a black, wet obsidian floor that mirrors it, seen from low with a long lens toward a low
// moon that hangs behind the city's great openwork spire and throws crepuscular rays past it: sodium-amber light in
// lancets and rose windows against a cold steel-blue night, a moonlit ground mist the towers' bases sink into, cloud
// banks crossing the moon, clockwork precessing on the bars.
//
// Data -> image (every structure comes from the world model):
//  - district (subsystem) -> a precinct, an island separated from the others by dark mirror canals: its foundation
//                            engraved in light on the floor, a low kerb whose coping carries a line of light (the share
//                            of its committed and validated work), and its nave (a
//                            long gabled hall along the precinct's axis, clerestory lancets lit by the share of its
//                            validated work, a rose window in each gable)
//  - file (module)        -> a tower on its persisted plot: a plinth with an inscription band, one storey per symbol in
//                            stable slot order (functions lancet storeys, classes paired lancets with an oculus,
//                            components stained glass, interfaces/types tracery screens, constants low bands), taller
//                            storeys for larger modules; stages step in every few storeys with pinnacle clusters at the
//                            setback; the roof from the recipe's architecture (gothic concave spire, needle, deco stepped
//                            crown, brutalist ziggurat over a lantern band with stepped organ-pipe columns on its flanks);
//                            each precinct's largest module is its landmark: a much taller tower crowned by an openwork
//                            spire of stone ribs and tracery (the few largest landmarks of a large project are the city's
//                            grand spires; in a large precinct the smaller modules form a low carpet of hip-roofed
//                            buildings); towers of three storeys and more carry an octagonal lantern stage and a spire
//                            ringed by gablets; tall gothic towers may carry flying buttresses; API routes
//                            are lit pinnacles; the city's largest tower carries the orrery
//  - material state       -> draft: dark glass behind a thin cyan scaffold; committed: stone with some warm windows and
//                            an engraved inscription; validated: the windows lit; stressed: angular cracks climbing from
//                            the base, windows dying storey by storey from the top, a slow red crown lamp, the precinct
//                            around it turning cold
//  - dependency           -> inside a precinct a channel inlaid in the floor carrying light; across precincts a thin
//                            cable of light slung between towers at staggered heights (the most-linked pairs, a few dozen)
//  - verified milestone   -> lasting: each covered tower's top storey becomes a lantern of lit tracery, its precinct's
//                            gable roses ignite, and the precinct's great spire is crowned (its openwork ribs gilded from
//                            the foot up, halo rings tilted toward the view, one more per repeat); its own moment pushes
//                            the camera in on that spire with a gold flare
//  - agent                -> a servitor: a lantern inside two precessing brass rings, circling the tower it works on below
//                            the skyline, beaming onto it and casting a warm pool of light on the facade
// Ambient life (never progress): mist banks drifting past the bases, cloud shadows passing, cloud banks crossing the
// moon (the rays, rims and glitter dim and return), drips ringing the wet floor, dust glinting toward the moon, windows
// breathing on the bars with a slow candle flicker, the orrery precessing with beads ticking on the bars, a carillon peal
// climbing the great spire every sixteen bars, light flowing in channels and cables. Verified milestones unlock
// searchlights, the clockwork's full light, spire beacons and an aurora over the glass.
import {THREE,NOISE,BACKGROUND_VS,clamp,lerp,smooth,hash,rand,rng,instancedBuffers,pointBuffers} from './core.js';
import {KINDS,ARCH,layoutOptions,precincts,towerPlans,linkPlans,symTotal} from './cathedral-layout.js';
import {createCathedralGrammar,JOB as LIFE_JOB} from './life/cathedral.js';
import {CH as LIFE_CH} from './life/sim.js';
import {position as lifePosition,follower as lifeFollower,visibility as lifeVisibility,musicLook} from './life/present.js';
import {presence} from '../providers.js';
const STATE_INDEX={draft:0,committed:1,validated:2,stressed:3};
// Storey proportions per symbol kind (KINDS) and architectures (ARCH): cathedral-layout.js.
// Facade looks (shader): 0 lancet, 1 paired lancets, 2 stained glass, 3 tracery screen, 4 plinth, 5 roof spire,
// 7 crown step, 8 slab, 9 band, 10 pinnacle / needle, 11 lantern band, 12 roof pinnacle, 13 buttress pier / column.
const DISTRICT_HUES=['#7fd6d0','#f0b77a','#b3a2f5','#f29dbb','#86c2f0','#a9e08e','#f2928a','#e8d47c'];
const DMAX=24;
const secs=(t,epoch)=>Number.isFinite(t)?(t-epoch)/1000:(t>0?1e6:-1e5);
// Shared GLSL: height fog with drifting density, sky colour for a direction (also reflected in the floor).
const FOG=`uniform vec3 uFogC,uFogW,uMoonDir,uMoonC,uMistC;uniform float uFogD,uFogH,uFogS,uMirror,uMistD,uMistH,uMoonK;uniform vec2 uMistO,uCloudO;uniform sampler2D uNoise;
  // Cloud shadows: moonlight on the floor and the facades, broken by passing cloud.
  float cloudSh(vec2 xz){return mix(.3,1.,smoothstep(.32,.68,texture(uNoise,xz*.016+uCloudO).x));}
  vec3 hazeCol(vec3 v,float y){float m=max(dot(v,uMoonDir),0.);return uFogC+uMoonC*uMoonK*(pow(m,8.)*.06+pow(m,40.)*.2)+uFogW*exp(-y*.5)*.6;}
  // The ground mist is lit from above by the moon: a pale bank, brightest toward the moon (forward scattering).
  vec3 mistCol(vec3 v){float m=max(dot(v,uMoonDir),0.);return uFogC*1.2+uMoonC*(.014+.035*pow(m,5.)+.08*pow(m,30.))*(.35+.65*uMoonK)+uFogW*.9;}
  float layerE(float y0,float y1,float H){float dy=y1-y0;return abs(dy)>1e-3?H*(exp(-y0/H)-exp(-y1/H))/dy:exp(-y0/H);}
  // Haze that starts beyond the near city (aerial perspective: far precincts recede), plus a dense ground mist (banks
  // drifting with the wind, three times denser in its lowest layer) that the towers' bases sink into.
  float fogAmt(vec3 p){vec3 q=vec3(p.x,abs(p.y),p.z);vec3 d=q-cameraPosition;float L=length(d);float y0=max(cameraPosition.y,0.),y1=q.y;
    float bank=texture(uNoise,q.xz*.045+uMistO).y;bank=smoothstep(.22,.78,bank);
    // The mist lies thickest among the precincts (the open water beyond stays dark and clear).
    float city=.25+.75*exp(-pow(length(q.xz-uMistC.xy)/uMistC.z,2.));
    return 1.-exp(-uFogD*max(L-uFogS,0.)*(.3+layerE(y0,y1,uFogH))-uMistD*city*(.15+1.8*bank)*L*(layerE(y0,y1,uMistH)+2.*layerE(y0,y1,uMistH*.3)));}
  vec3 fogCol(vec3 p){vec3 v=normalize(vec3(p.x,abs(p.y),p.z)-cameraPosition);float y=abs(p.y);return mix(hazeCol(v,y),mistCol(v),exp(-y/(uMistH*1.6)));}
  vec3 applyFog(vec3 c,vec3 p){return mix(c,fogCol(p),fogAmt(p));}`;
// The cloud bank that crosses the moon: one low-frequency function of the angle from the moon and the clock, evaluated
// identically here and in JavaScript (moonCloud), so the moonlight dims exactly when a cloud covers the disc.
const SKY=`uniform vec3 uZenith,uHorizon,uCity;uniform float uCloudT,uMoonAz;
  float moonBand(float s,float h,float el){float x=s*7.+uCloudT;float b=.5+.5*(.62*sin(x+1.3)+.38*sin(x*2.17+4.1));return smoothstep(.42,.78,b)*exp(-pow((h-el)*13.,2.));}
  vec3 skyCol(vec3 d){float h=d.y;vec3 c=mix(hazeCol(d,0.),uZenith,smoothstep(0.,.38,h));c+=uCity*exp(-max(h,0.)*22.)*.3*smoothstep(-.01,.01,h);
    float m=max(dot(d,uMoonDir),0.);c+=uMoonC*uMoonK*(pow(m,120.)*.16+pow(m,2400.)*.9);return c;}`;
export function createFamily(ctx){
  const {scene,camera,model,recipe,renderer}=ctx;const G=recipe.genome,P=G.palette;
  const g=G.geometry||{},sec=G.secondary||{},atm=G.atmosphere||{},mat=G.material||{},mot=G.motion||{},cam=G.camera||{};
  const archName=ARCH[g.architecture]?g.architecture:'gothic',A=ARCH[archName],SIDES=A.sides;
  const setback=Number.isFinite(g.setback)?g.setback:.15,spireK=Number.isFinite(g.spire)?g.spire:.6,buttressK=Number.isFinite(g.buttress)?g.buttress:.5;
  const mechK=Number.isFinite(sec.mechanisms)?sec.mechanisms:.7,winK=Number.isFinite(sec.windows)?sec.windows:.9,beaconK=Number.isFinite(sec.beacons)?sec.beacons:.7;
  const fogK=Number.isFinite(atm.fog)?atm.fog:.7,moteK=Number.isFinite(atm.motes)?atm.motes:.7,searchK=Number.isFinite(atm.searchlights)?atm.searchlights:.5;
  const shaftK=Number.isFinite(atm.shafts)?atm.shafts:.8,wetK=Number.isFinite(mat.wetness)?mat.wetness:.6;
  const stoneK=Number.isFinite(mat.stone)?mat.stone:.55,metalK=Number.isFinite(mat.metal)?mat.metal:.45,glassK=Number.isFinite(mat.glass)?mat.glass:.45;
  const turbK=Number.isFinite(mot.turbulence)?mot.turbulence:.4,driftK=Number.isFinite(cam.drift)?cam.drift:.5,streetK=Number.isFinite(G.space?.streets)?G.space.streets:1;
  const mechSpeed=Number.isFinite(mot.mechanism)?mot.mechanism:1,breathBars=[2,4,8].includes(mot.breath)?mot.breath:4;
  const weather=atm.weather||'night-fog';
  const col=c=>new THREE.Color(c);
  const pal={primary:col(P.primary),secondary:col(P.secondary),accent:col(P.accent),highlight:col(P.highlight),deep:col(P.deep),haze:col(P.haze),warning:col(P.warning),valid:col(P.valid)};
  const seed=recipe.projectSeed>>>0;
  // ---- Light and colour: cool exterior night, warm interior light ------------------------------------------------
  // The cathedral owns its look whatever the palette: obsidian near-black, sodium-amber interior light, a cold
  // steel-blue moon and haze; gold is kept for verified milestones. Palette colours only tint (hue), never lighten.
  const warm=new THREE.Color('#ff9c48').lerp(pal.secondary,.08);
  const GOLD=new THREE.Color('#ffd27a').lerp(new THREE.Color('#fff1cf'),.2);
  const moonC=new THREE.Color('#a6bbe0').lerp(pal.highlight,.08);
  const fogC=new THREE.Color(weather==='dusk-haze'?'#3a3442':weather==='steam'?'#36404c':'#2c3648').lerp(pal.haze,.1);
  {const L=.2126*fogC.r+.7152*fogC.g+.0722*fogC.b,want=weather==='steam'?.016:weather==='dusk-haze'?.014:.012;fogC.multiplyScalar(want/Math.max(L,1e-4));}
  const horizon=fogC.clone().multiplyScalar(1.2);
  const capL=(c,max)=>{const L=.2126*c.r+.7152*c.g+.0722*c.b;return L>max?c.multiplyScalar(max/L):c;};
  const zenith=new THREE.Color('#010206').lerp(capL(pal.deep.clone(),.002),.2);
  const cityGlow=warm.clone().multiplyScalar(weather==='dusk-haze'?.14:.09);
  const stone=new THREE.Color('#474c57').lerp(new THREE.Color('#7a7468'),stoneK*.5).multiplyScalar(.45+.35*stoneK);
  const metal=new THREE.Color('#c39a5c').lerp(pal.highlight,.12).multiplyScalar(.6+.8*metalK);
  const seedR=rng(hash(`cathedral/${seed}/${recipe.variant||0}`));const moonPh=rand(hash(`moon/${seed}`))*6.283;
  const axisAz=seedR()*Math.PI*2;
  // The moon sits low behind the city as seen from the camera's establishing side; its light rims the towers.
  // The moon hangs low behind the city, seen from the establishing side; the camera stands on the line from the moon
  // through the city's great spire, and the moon's elevation follows that camera so the disc sits behind the spire.
  const moonAz=axisAz+Math.PI+(seedR()<.5?-1:1)*(.1+.08*seedR());let moonEl=.065+.03*seedR();
  const moonDir=new THREE.Vector3(Math.cos(moonAz)*Math.cos(moonEl),Math.sin(moonEl),Math.sin(moonAz)*Math.cos(moonEl));
  const keyAz=axisAz+Math.PI+(seedR()<.5?-1:1)*(.95+.3*seedR());const keyDir=new THREE.Vector3(Math.cos(keyAz)*.5,1,Math.sin(keyAz)*.5).normalize().lerp(moonDir,.25).normalize();
  // JavaScript twin of moonBand (GLSL): the cloud cover on the moon's disc.
  const moonCloud=T=>{const b=.5+.5*(.62*Math.sin(T+1.3)+.38*Math.sin(T*2.17+4.1));return smooth((b-.42)/.36);};
  const common={uT:{value:0},uV:{value:0},uSpeed:{value:1},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},uBeat:{value:0},uActivity:{value:0},uBars:{value:0},
    uMirror:{value:1},uMistD:{value:.05},uMistH:{value:.4},uMoonK:{value:1},uMistO:{value:new THREE.Vector2()},uCloudO:{value:new THREE.Vector2()},uCloudT:{value:0},uMoonAz:{value:moonAz},uRain:{value:.5},uCold:{value:new THREE.Vector4(0,0,1,0)},uFogC:{value:fogC},uFogW:{value:cityGlow.clone().multiplyScalar(.18)},uFogD:{value:.01},uFogH:{value:2.2},uFogS:{value:0},uMistC:{value:new THREE.Vector3(0,0,10)},uMoonDir:{value:moonDir},uMoonC:{value:moonC},
    uKey:{value:keyDir},uWarm:{value:warm},uUnlock:{value:new THREE.Vector4()},uMood:{value:new THREE.Vector4(1,0,0,0)},uCentre:{value:new THREE.Vector3()},uAxis:{value:axisAz},
    uZenith:{value:zenith},uHorizon:{value:horizon},uCity:{value:cityGlow},
    uAgentL:{value:Array.from({length:4},()=>new THREE.Vector4())},uAgentC:{value:Array.from({length:4},()=>new THREE.Vector3())},uCarillon:{value:new THREE.Vector4(0,0,0,-1)},
    uWaves:{value:Array.from({length:4},()=>new THREE.Vector4(0,0,0,-1e5))},uWaveC:{value:Array.from({length:4},()=>new THREE.Vector4(0,0,0,1))}};
  // Digital life (only when the recipe has it: ctx.life): the traffic field (trail, disturbance, flow) as a texture the
  // copings, channels, cables and the wet floor read; without life none of this exists (the shaders are unchanged).
  const LIFE=!!ctx.life,LIFE_N=96,LIFE_B=56;   // (the ecosystem's field: life/cathedral.js)
  const lifeTex=LIFE?new THREE.DataTexture(new Uint8Array(LIFE_N*LIFE_N*4),LIFE_N,LIFE_N,THREE.RGBAFormat):null;
  if(LIFE){lifeTex.magFilter=lifeTex.minFilter=THREE.LinearFilter;lifeTex.wrapS=lifeTex.wrapT=THREE.ClampToEdgeWrapping;lifeTex.needsUpdate=true;
    common.uLifeF={value:lifeTex};common.uLifeB={value:new THREE.Vector4(-LIFE_B,-LIFE_B,1/(2*LIFE_B),1/(2*LIFE_B))};}
  // r: trail (travelled routes), g: disturbance, b/a: flow (direction of traffic, signed around .5).
  const LIFE_GLSL=LIFE?`uniform sampler2D uLifeF;uniform vec4 uLifeB;vec4 lifeAt(vec2 xz){return texture(uLifeF,clamp((xz-uLifeB.xy)*uLifeB.zw,0.,1.));}`:'';
  const WAVE=`uniform vec4 uWaves[4],uWaveC[4];uniform float uT,uSpeed;
    vec3 waves(vec3 p){vec3 a=vec3(0.);for(int i=0;i<4;i++){float age=(uT-uWaves[i].w)/uSpeed;if(age<0.||age>7.)continue;float r=age*uWaveC[i].w;float d=distance(p.xz,uWaves[i].xz);
      a+=uWaveC[i].rgb*exp(-pow((d-r)*1.6,2.))*(1.-age/7.)*(1.-age/7.);}return a;}`;
  // Every opaque surface writes 1 + its height into alpha: the floor's reflection reads coverage and blur from it.
  const OUT_ALPHA=`float outAlpha(vec3 w){return uMirror<0.?1.+min(abs(w.y),40.)*.1:1.;}`;
  const additive=m=>{m.transparent=true;m.depthWrite=false;m.blending=THREE.CustomBlending;m.blendEquation=THREE.AddEquation;m.blendSrc=THREE.OneFactor;m.blendDst=THREE.OneFactor;
    m.blendSrcAlpha=THREE.ZeroFactor;m.blendDstAlpha=THREE.OneFactor;return m;};
  const S=1.22*(Number.isFinite(G.space?.spread)?G.space.spread:1);
  const LO=layoutOptions(G);   // the city's pure layout (cathedral-layout.js), shared with its digital life
  // ---- A seeded, tileable noise texture (smoothed value noise, 4 channels): cheap texture lookups replace gradient
  // noise in the full-screen floor and the facades.
  const noiseTex=(()=>{const N=256,r=rng(hash(`noise/${seed}`)),a=new Float32Array(N*N*4);for(let i=0;i<a.length;i++)a[i]=r();
    for(let pass=0;pass<3;pass++){const b=new Float32Array(a.length);for(let y=0;y<N;y++)for(let x=0;x<N;x++)for(let c=0;c<4;c++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=a[(((y+dy+N)%N)*N+((x+dx+N)%N))*4+c];b[(y*N+x)*4+c]=sum/9;}a.set(b);}
    const d=new Uint8Array(N*N*4);for(let c=0;c<4;c++){let lo=1,hi=0;for(let i=c;i<a.length;i+=4){lo=Math.min(lo,a[i]);hi=Math.max(hi,a[i]);}for(let i=c;i<a.length;i+=4)d[i]=Math.round((a[i]-lo)/(hi-lo||1)*255);}
    const t=new THREE.DataTexture(d,N,N,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;})();
  common.uNoise={value:noiseTex};
  // ---- Reflection: the scene mirrored in the floor plane, at half resolution, rendered before the frame -----------
  const reflRT=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,depthBuffer:true});
  const mirror=new THREE.Scene();
  const mirrored=mesh=>{const m=new THREE.Mesh(mesh.geometry,mesh.material);m.scale.y=-1;m.frustumCulled=false;m.renderOrder=mesh.renderOrder;mirror.add(m);return m;};
  // ---- Floor: polished obsidian slabs, wet and dry, mirroring the precinct ----------------------------------------
  const floorU={...common,uScale:{value:900},uRefl:{value:reflRT.texture},uReflOn:{value:1},uD:{value:Array.from({length:DMAX},()=>new THREE.Vector4())},uD2:{value:Array.from({length:DMAX},()=>new THREE.Vector4())},
    uDC:{value:Array.from({length:DMAX},()=>new THREE.Vector4())},uObs:{value:new THREE.Color('#030406').lerp(capL(pal.deep.clone(),.003),.2)},uWet:{value:.35+.6*wetK},uTurb:{value:.4+1.5*turbK},uRose:{value:new THREE.Vector4(0,0,3,0)},uMetal:{value:metal}};
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({uniforms:floorU,
    vertexShader:`uniform float uScale;uniform vec3 uCentre;varying vec3 vW;void main(){vec3 p=vec3(position.x*uScale+uCentre.x,0.,-position.y*uScale+uCentre.z);vW=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`${FOG}${SKY}${WAVE}${LIFE_GLSL}uniform float uV,uAxis,uReflOn,uWet,uActivity,uRain;uniform float uTurb;uniform vec2 uRes;uniform sampler2D uRefl;uniform vec3 uObs,uWarm,uCentre,uMetal;
      uniform vec4 uD[${DMAX}],uD2[${DMAX}],uDC[${DMAX}],uRose,uUnlock,uCold;varying vec3 vW;
      float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float line(float d,float w){float a=max(fwidth(d),1e-5);return 1.-smoothstep(w,w+a*1.5,abs(d));}
      // Drips on the wet stone: rings spreading from seeded points on their own periods (ambient weather).
      vec2 ripples(vec2 p,float t){vec2 n=vec2(0.);vec2 g=p*1.25;vec2 c0=floor(g-.5);
        for(int j=0;j<2;j++)for(int i=0;i<2;i++){vec2 id=c0+vec2(float(i),float(j));float h=h21(id);if(h>uRain)continue;float h2=h21(id+17.3);
          vec2 ctr=id+.2+.6*vec2(h2,fract(h2*7.13));float ph=fract(t*(.22+.18*h)+h*9.);float r=ph*.62;vec2 d=g-ctr;float L=length(d);
          float w=(L-r)*7.;n+=d/max(L,1e-3)*sin(w*3.)*exp(-w*w)*(1.-ph)*(1.-ph);}
        return n;}
      void main(){vec2 p=vW.xz;vec3 toC=cameraPosition-vW;float dist=length(toC);vec3 V=toC/dist;
        float ca=cos(uAxis),sa=sin(uAxis);vec2 q=mat2(ca,-sa,sa,ca)*(p-uCentre.xz);
        // Slabs in running bond along the processional axis; joints (fading with distance), per-slab tone and polish.
        vec2 s=q/vec2(2.4,1.6);s.x+=step(1.,mod(floor(s.y),2.))*.5;vec2 cell=floor(s),f=fract(s);
        float near=1.-smoothstep(9.,20.,dist);
        float jd=min(min(f.x,1.-f.x)*2.4,min(f.y,1.-f.y)*1.6);float jw=fwidth(jd);float joint=(1.-smoothstep(0.,.018+jw*1.2,jd))*(1.-smoothstep(.04,.16,jw))*near;
        float ch=mix(.5,h21(cell),near);
        vec4 nz=texture(uNoise,p*.011);vec4 nz2=texture(uNoise,p*.037+.31);float wn=(nz.x-.5)*1.4+(nz2.y-.5)*.6;float wet=smoothstep(-.05,.3,wn+(ch-.5)*.2)*uWet;
        float rough=mix(.75,.06,wet)+joint*.5;
        // Surface normal: broad undulation, a fine shimmer moving with the air, and drip rings in the wet.
        vec4 nr=texture(uNoise,p*.21+vec2(uV*.0011,uV*.0007)*uTurb);vec2 n2=(nr.zw-.5)*2.*(.012+.045*(1.-wet));
        // Fine detail fades where a pixel covers much floor (grazing, far): no sparkle aliasing.
        vec2 fw=fwidth(p);float fine=1.-smoothstep(.08,.35,max(fw.x,fw.y));
        vec4 nf=texture(uNoise,p*1.9+vec2(uV*.03,-uV*.021)*uTurb);n2+=(nf.xy-.5)*(.018+.03*(1.-wet))*fine;
        float rk=wet*(1.-smoothstep(18.,46.,dist))*fine;if(rk>.01)n2+=ripples(p,uV)*.07*rk;
        vec2 uv=gl_FragCoord.xy/uRes;vec2 off=n2*vec2(.05,.22)/(1.+dist*.04);
        vec3 refl=vec3(0.);float cov=0.;
        if(uReflOn>.5){vec4 c0=texture(uRefl,uv+off);float hgt=max(c0.a-1.,0.)*10.;float br=rough*(.0015+.0011*min(hgt,8.))*(14./(6.+dist*.25));
          vec4 acc=c0+texture(uRefl,uv+off+vec2(br*.25,br*2.4))+texture(uRefl,uv+off+vec2(-br*.3,br*1.2))+texture(uRefl,uv+off+vec2(br*.3,-br*1.3))+texture(uRefl,uv+off+vec2(-br*.2,-br*2.6));
          acc/=5.;cov=clamp(acc.a,0.,1.);refl=acc.rgb;}
        vec3 R=reflect(-V,normalize(vec3(n2.x,1.,n2.y)));R.y=max(R.y,.004);R=normalize(R);float mr=max(dot(R,uMoonDir),0.);
        // The reflected night is dark away from the moon; toward it, the moon's glitter path runs across the wet stone.
        vec3 sky=skyCol(R)*mix(.22,1.,pow(mr,5.));
        float glit=pow(mr,mix(60.,900.,wet))*mix(.4,5.,wet)*uMoonK;
        vec3 rc=refl+(sky+uMoonC*glit)*(1.-cov);
        float F=.05+.95*pow(1.-clamp(V.y,0.,1.),4.);F*=mix(.5,1.,wet)*(1.-joint*.6);
        vec3 base=uObs*(.6+.5*ch)*(1.+joint*.5);
        // Cloud shadows sweep the floor.
        float cs=cloudSh(p);
        vec3 c=base*(.25+.75*(1.-F))*(.6+.4*cs)+rc*F+uMoonC*cs*.006*(1.-F*.5);
        // Foundations: each district's outline engraved in light (a double line with ticks), laid when it was founded.
        vec3 lines=vec3(0.),glow=vec3(0.);
        for(int i=0;i<${DMAX};i++){vec4 D=uD[i];if(D.z<=0.)continue;vec4 D2=uD2[i];vec4 C=uDC[i];
          vec2 dp=p-D.xy;float rmax=max(D.z,D.w)+2.;if(dot(dp,dp)>rmax*rmax)continue;float c2=cos(D2.x),s2=sin(D2.x);vec2 l=mat2(c2,-s2,s2,c2)*dp;float e=length(l/D.zw);float d=(e-1.)*min(D.z,D.w);
          float ang=atan(l.y,l.x)/6.2831853+.5;float age=(uT-D2.y)/uSpeed;float laid=clamp(age/2.6,0.,1.);
          float vis=step(ang,laid*1.0001)*step(0.,age);float fresh=exp(-max(age,0.)*.45);float head=exp(-pow((ang-laid)*18.,2.))*step(age,2.8);
          // At grazing angles a fine inlay aliases into dashes: it fades with the view's slope; the founding engraving
          // (a bright head running once around) shows at any angle.
          float graze=smoothstep(.05,.2,V.y);
          float l2=line(d+.2,.016)*(graze*.5+fresh*1.5+head*4.)+line(d+.36,.008)*graze*.4;
          lines+=C.rgb*l2*vis*(C.w*.6+fresh*2.);
          glow+=C.rgb*exp(-abs(d)*1.8)*.03*C.w+uWarm*D2.z*(1.-smoothstep(-2.5,.5,d))*.035*vis;}
        // The crossing: a rose inlaid in brass at the centre of the precinct.
        vec2 rq=p-uRose.xy;float rr=length(rq),ra=atan(rq.y,rq.x);float R0=uRose.z;
        float rose=(line(rr-R0,.02)+line(rr-R0*.72,.012)+line(rr-R0*.3,.012)+line(rr-R0*1.06,.008))*step(rr,R0*1.1)
          +line(sin(ra*8.)*rr*.12,.01)*step(rr,R0)*step(R0*.3,rr)+line(abs(sin(ra*16.))*rr*.06-.01*rr,.006)*step(R0*.72,rr)*step(rr,R0);
        c+=uMetal*rose*(.05+.25*uRose.w)*(1.-F*.6);
        c+=lines*(1.-F*.4)+glow+waves(vW)*(1.-.5*F);
        if(uCold.w>0.){float k=uCold.w*exp(-pow(distance(p,uCold.xy)/uCold.z,2.));c=mix(c,vec3(dot(c,vec3(.3,.55,.15)))*vec3(.55,.8,1.35),k);}
        ${LIFE?`{vec4 L=lifeAt(p);c+=uWarm*smoothstep(.02,.8,L.r)*.03*(1.-F*.4)*(1.-.9*smoothstep(.08,.6,L.g));}`:''}
        gl_FragColor=vec4(applyFog(c,vW),1.);}`}));
  floor.frustumCulled=false;floor.renderOrder=-2;scene.add(floor);
  // ---- Stone: plinths, storeys, roofs, pillars, buttresses, pinnacles (one instanced frustum, facades in the shader)
  const frustum=new THREE.CylinderGeometry(1,1,1,SIDES,4,false);frustum.translate(0,.5,0);
  const stoneB=instancedBuffers(frustum,{iA:4,iB:4,iL:4,iS:4,iF:4,iC:4,iT:4},512);
  const stoneU={...common,uStone:{value:stone},uMetal:{value:metal},uStress:{value:pal.warning},uValid:{value:pal.valid},uDraft:{value:new THREE.Color('#9cc8ff').lerp(pal.highlight,.3)},
    uGlass:{value:[pal.accent,new THREE.Color('#c41e3a'),new THREE.Color('#1f4fd8'),pal.valid].map(c=>{const h={};c.getHSL(h);return new THREE.Color().setHSL(h.h,.88,.42);})},uWin:{value:winK},uGlassK:{value:glassK},uMetalK:{value:metalK},
    uSides:{value:SIDES},uArch:{value:A.id},uGold:{value:GOLD},uRoseDir:{value:new THREE.Vector2(-Math.cos(moonAz),-Math.sin(moonAz))}};
  const stoneMat=new THREE.ShaderMaterial({uniforms:stoneU,
    vertexShader:`${FOG}attribute vec4 iA,iB,iL,iS,iF,iC,iT;uniform float uT,uSpeed,uV,uSides;
      varying vec3 vW,vL,vN,vC;varying vec4 vB,vS,vF,vX,vT;varying vec2 vP;varying float vFog,vAsm,vTest;
      void main(){float look=iB.w;vTest=iC.w;float age=(uT-iL.x)/uSpeed;float gone=iL.y<1e5?clamp((uT-iL.y)/uSpeed/1.1,0.,1.):0.;
        // Assembly: a storey slides down from just above its slot and turns into place, locking with a small overshoot;
        // a roof or a plinth rises from below; a removed piece lifts, turns and folds away.
        float a=clamp(age/1.1,0.,1.);float e=1.-pow(1.-a,3.)+sin(a*3.14159)*.05*(1.-a);
        float lift=0.,turn=0.,scale=1.;
        if(look<3.5||look>8.5&&look<9.5){lift=(1.-e)*.32*max(iB.z,.3);turn=(1.-e)*6.2832/uSides;scale=mix(1.12,1.,e);}
        else if(look<4.5){lift=-(1.-e)*(iB.z+.05);}
        else{lift=-(1.-e)*iB.z*1.02;}
        lift+=gone*gone*.9;turn+=gone*.9;scale*=1.-gone;
        // Tremor after a failure (from the state change, or the effect).
        float sk=(uT-iS.z)/uSpeed;float tr=iS.x>2.5&&sk>0.&&sk<1.8?(1.-sk/1.8):0.;float fk=(uT-iF.x)/uSpeed;if(iF.y>1.5&&iF.y<2.5&&fk>0.&&fk<1.8)tr=max(tr,1.-fk/1.8);
        vec2 jit=tr*vec2(sin(uV*61.+iL.w*40.),cos(uV*53.+iL.w*17.))*.03;
        vec3 lp=position;float r=(look>4.5&&look<5.5?iB.x*pow(1.-lp.y,1.3):mix(iB.x,iB.y,lp.y))*scale;float ang=iA.w+turn;float c=cos(ang),s=sin(ang);
        vec2 xz=mat2(c,-s,s,c)*(lp.xz*r);
        vec3 w=vec3(iA.x+xz.x+jit.x,iA.z+lp.y*iB.z+lift,iA.y+xz.y+jit.y);
        float slope=(iB.x-iB.y)/max(iB.z,1e-3);vec3 nl=abs(normal.y)>.5?normal:normalize(vec3(normal.x,slope,normal.z));
        vec2 nxz=mat2(c,-s,s,c)*nl.xz;vec3 n=vec3(nxz.x,nl.y,nxz.y);
        w.y*=uMirror;n.y*=uMirror;
        vW=w;vL=vec3(lp.x,lp.y,lp.z);vN=n;vB=iB;vS=iS;vF=iF;vC=iC.rgb;vT=iT;vP=iA.xy;vX=vec4(age,gone,(uT-iL.z)/uSpeed,iL.w);vAsm=a;
        vFog=fogAmt(w);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${FOG}${OUT_ALPHA}uniform vec3 uKey,uWarm,uStone,uMetal,uStress,uValid,uDraft,uGold,uGlass[4],uAgentC[4];uniform vec4 uUnlock,uMood,uCold,uAgentL[4];uniform vec3 uCentre;uniform vec2 uRoseDir;
      uniform float uT,uV,uSpeed,uBeat,uBars,uWin,uGlassK,uMetalK,uSides,uArch,uActivity;
      varying vec3 vW,vL,vN,vC;varying vec4 vB,vS,vF,vX,vT;varying vec2 vP;varying float vFog,vAsm,vTest;
      float h11b(float n){return fract(sin(n*12.9898)*43758.5453);}
      float AA(float d){return max(fwidth(d),1e-4);}
      float fill(float d){float a=AA(d);return 1.-smoothstep(-a,a,d);}
      // A pointed (equilateral) arch window: half width a, springing at ys, sill at yb.
      float lancet(vec2 p,float a,float yb,float ys){float d=p.y>ys?length(vec2(abs(p.x)+a,p.y-ys))-2.*a:abs(p.x)-a;return max(d,yb-p.y);}
      float rect(vec2 p,vec2 c,vec2 hs){vec2 d=abs(p-c)-hs;return max(d.x,d.y);}
      void main(){
        if(vX.y>=1.)discard;
        float look=vB.w,h=vB.z;float r=mix(vB.x,vB.y,vL.y);
        vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);
        float stCur=vS.x,stPrev=vS.y;float sk=(uT-vS.z)/uSpeed;float wy=abs(vW.y);float top=max(vT.z,.5);
        // State changes: validation lights the tower upward (a scan); a failure kills the light storey by storey from
        // the top; a commit clads the scaffold in stone; the scan band itself glows.
        float scanY=sk*(stCur>1.5?3.2:2.6);
        float st=sk<0.?stPrev:(stCur>2.5?(sk>(1.-vT.x)*2.8?stCur:stPrev):(wy<scanY?stCur:stPrev));
        float band=stCur<2.5&&sk>0.&&sk<5.?exp(-pow((wy-scanY)*5.,2.))*(1.-sk/5.):0.;
        float fxk=(uT-vF.x)/uSpeed,fk2=fxk-vT.y;
        float fxScan=vF.y>.5&&vF.y<1.5&&fxk>0.&&fxk<4.?exp(-pow((wy-fxk*3.)*4.,2.))*(1.-fxk/4.):0.;
        float fxRestore=vF.y>2.5&&vF.y<3.5&&fk2>0.&&fk2<6.?exp(-pow((wy-fk2*2.4)*2.5,2.))*(1.-fk2/6.):0.;
        float cap=step(.9,abs(N.y));
        float ang=atan(vL.x,vL.z);float fs=(ang/6.2831853+.5)*uSides;float fi=floor(fs),fu=fract(fs);
        float faceW=2.*r*sin(3.14159265/uSides);float px=(fu-.5)*faceW,py=vL.y*h;
        float seed=vX.w;
        // Lighting: moonlight from behind the city (broken by passing cloud) rimming the silhouettes, a faint cool fill,
        // warm bounce from the lit precinct below.
        float cs=cloudSh(vW.xz);float key=max(dot(N,uKey),0.)*cs*(.3+.7*uMoonK);
        float rim=pow(1.-max(dot(N,V),0.),3.)*(.35+.65*max(dot(normalize(vec3(N.x,0.,N.z)+1e-4),normalize(vec3(uMoonDir.x,0.,uMoonDir.z))),0.))*uMoonK;
        float bounce=exp(-wy*.4)*(.5-.5*N.y);
        float tex=texture(uNoise,vec2(vW.x+vW.z,vW.y*2.6)*.8+seed).x;
        vec3 stoneC=uStone*(.82+.36*tex)*(1.-.08*step(.5,fract(py/.13+fi*.5)));
        float ashlar=smoothstep(-AA(py)*1.5-.003,0.,abs(fract(py/.13)-.5)*.13-.062);stoneC*=1.-.4*ashlar*step(look,4.5);
        vec3 lit=stoneC*(key*.75*uMoonC+.018*uMoonC)+uMoonC*rim*.32+uWarm*bounce*.05;
        // A servitor at work casts a small warm pool of light on the facade it works on.
        for(int k=0;k<4;k++){vec4 Ag=uAgentL[k];if(Ag.w<=0.)continue;vec3 dl=Ag.xyz-vW;float dd=length(dl);lit+=uAgentC[k]*Ag.w*max(dot(N,dl/max(dd,1e-3)),0.)*(.25+stoneC*6.)/(1.+dd*dd*3.);}
        float ed=min(fu,1.-fu)*faceW;float far=1.-smoothstep(.012,.05,AA(ed));float rib=(1.-smoothstep(.0,.028+AA(ed),ed))*(.35+.65*far);
        float lineY=1.-smoothstep(0.,AA(py-.05)*1.5+.004,abs(py-.05));
        vec3 c=lit*(1.+rib*.8)+uMoonC*rib*key*.15;
        vec3 em=vec3(0.);
        // Windows (storeys only): bays across each face, shaped by the architecture and the symbol kind.
        float isStorey=step(look,3.5)+step(8.5,look)*step(look,9.5);
        if(isStorey>.5&&cap<.5){
          float nb=max(1.,floor(faceW/(uArch>.5&&uArch<1.5?.3:.34)));float bx=fract(fu*nb),bi=floor(fu*nb);float bw=faceW/nb;
          vec2 wp=vec2((bx-.5)*bw,py);float d=1.;float cid=fi*13.+bi;
          if(look>8.5){d=rect(wp,vec2(0.,h*.5),vec2(bw*.3,h*.2));}
          else if(uArch<.5||uArch>2.5){
            float a=bw*(look>.5&&look<1.5?.2:look>1.5&&look<2.5?.33:look>2.5?.12:.24);float yb=h*(look>1.5&&look<2.5?.12:.2),ys=h*(uArch>2.5?.72:.52);a=min(a,(h*.9-ys)/1.75);
            if(look>.5&&look<1.5){float a2=a*.62;d=min(lancet(wp-vec2(-a*.75,0.),a2,yb,ys*.95),lancet(wp-vec2(a*.75,0.),a2,yb,ys*.95));d=min(d,length(wp-vec2(0.,ys+a*1.35))-a*.42);}
            else d=lancet(wp,a,yb,ys);
          }else if(uArch<1.5){d=lancet(wp,bw*.075,h*.04,h*.88);}
          else{float a=bw*.13;d=min(lancet(wp-vec2(-a*1.25,0.),a,h*.12,h*.66),lancet(wp-vec2(a*1.25,0.),a,h*.12,h*.66));}
          float win=fill(d);float frame=(1.-smoothstep(0.,.02+AA(d),abs(d-.022)))*(1.-win);
          c*=1.-.45*(1.-smoothstep(0.,.03,d))*(1.-win);c+=lit*frame*.9;
          // Glass: leaded quarries, sodium-warm when lit, stained for components. Each lit window is a room seen through
          // the glass: brightest toward the sill and the middle, some with a mullion or a transom, its candlelight drifting
          // on its own slow flicker (never on and off).
          float lh=h11b(cid+seed*91.);float lit2=h11b(cid*1.7+seed*37.);
          float litFrac=st>2.5?0.:st>1.5?.88:st>.5?.42:0.;
          float human=exp(-max(vS.w,0.)*.9)*step(0.,vS.w);float weld=vX.z>0.?exp(-vX.z*.8):0.;
          if(vF.y>3.5&&vF.y<4.5&&fxk>0.)weld=max(weld,exp(-fxk*.45)*smoothstep(0.,.8,fxk));if(vF.y>2.5&&vF.y<3.5&&fk2>0.)weld=max(weld,exp(-fk2*.45)*step(wy,fk2*2.4));
          litFrac=min(1.,litFrac+human*.5+weld*1.2);
          float on=step(lit2,litFrac);
          float fl=texture(uNoise,vec2(cid*.071+seed*.37,uV*.23+lh)).x;
          float breathe=.84+.16*sin(6.2832*uBars/${breathBars}.+seed*6.)+.3*(fl-.5)+.02*uBeat;
          vec2 lq=wp*vec2(26.,20.);float lead=min(abs(fract(lq.x+lq.y)-.5),abs(fract(lq.x-lq.y)-.5));lead=smoothstep(.05,.12,lead);
          vec3 gc=mix(uWarm*(.7+.6*lh),vec3(.9,.93,1.)*(.8+.3*lh),vTest*.15);
          if(look>1.5&&look<2.5){float m=h11b(floor(lq.x*.5)+floor(lq.y*.5)*7.+cid);gc=mix(uWarm,m<.25?uGlass[0]:m<.5?uGlass[1]:m<.75?uGlass[2]:uGlass[3],.25+.3*uGlassK)*(.75+.4*m);}
          float wx=abs(wp.x)/max(bw*.3,1e-3);float sill=clamp((wp.y-h*.15)/(h*.65),0.,1.);float depth=(1.15-.6*sill)*(1.-.4*min(wx*wx,1.));
          float mull=step(.6,lh)*(1.-smoothstep(0.,AA(wp.x)*1.5+.005,abs(wp.x)))+step(.78,lh)*(1.-smoothstep(0.,AA(wp.y)*1.5+.005,abs(wp.y-h*.48)));
          float inten=(st>1.5&&st<2.5?2.4:1.15)*uWin*on*breathe*depth*(1.+weld*1.6+human*.6);
          vec3 glass=mix(vec3(.003,.004,.008)+uMoonC*.015*pow(1.-max(dot(N,V),0.),2.)*uMoonK,gc*inten,on);
          // Failing: the light dies storey by storey from the top; each window gutters once as it goes out.
          if(st>2.5){float emer=step(.9,lit2);float dk=sk-(1.-vT.x)*2.8;float gut=dk>0.&&dk<.7&&stPrev>.5&&stPrev<2.5?(1.-dk/.7)*(.6+.4*sin(dk*40.+cid)):0.;
            glass=vec3(.002,.003,.008)+uStress*emer*.14*(.7+.3*sin(uV*.9+cid))+gc*gut*1.4*step(lit2,.88);}
          if(st<.5)glass=vec3(.002,.004,.008);
          if(look>2.5&&look<3.5){float lat=min(abs(fract(wp.x*14.)-.5),abs(fract(wp.y*14.)-.5));glass*=.5+.5*smoothstep(.1,.2,lat);}
          glass*=(.6+.4*lead)*(1.-.85*mull);
          // A verified milestone (lasting): the covered tower's top storey becomes a lantern of lit tracery, kindled from
          // the sill up, brighter for a while after its moment, then steady.
          float ra=(uT-vF.z)/uSpeed;
          if(vF.z>-1e4&&ra>0.&&vF.w>.5){float ign=clamp(ra/1.6-vL.y*.7,0.,1.);vec2 tq=vec2(wp.x/max(bw*.16,1e-3),(wp.y-h*.2)/(h*.13));vec2 tf=fract(tq)-.5;
            float qd=min(abs(length(tf)-.33),min(abs(tf.x),abs(tf.y))*1.4);float tr=1.-smoothstep(.04,.04+fwidth(qd)*1.5+.02,qd);
            vec3 tc=mix(uWarm,uGold,.55)*(1.5+2.5*exp(-max(ra-2.,0.)*.25))*(.9+.1*fl);
            glass=mix(glass,tc*(1.-.82*tr),ign);}
          em+=glass*win*(1.-cap);
          c=mix(c,vec3(0.),win*.9);
        }
        // Plinth: an inscription band engraved once the work is committed (set in stone).
        if(look>3.5&&look<4.5&&cap<.5){float y=vL.y;float bandM=step(.32,y)*step(y,.72);
          float cells=floor((ang/6.2831853+.5)*uSides*7.);float gx=fract((ang/6.2831853+.5)*uSides*7.),gy=(y-.32)/.4;
          float bit=step(.45,h11b(cells*3.1+floor(gx*3.)+floor(gy*4.)*5.+seed*13.))*step(.12,fract(gx*3.))*step(.15,fract(gy*4.));
          float inscribed=st>.5?1.:0.;float prog=sk>0.&&stPrev<.5&&stCur>.5?clamp(sk/1.6,0.,1.):1.;
          float fxs=vF.y>4.5&&vF.y<5.5&&fxk>0.?clamp(fxk/1.6,0.,1.):1.;float around=(ang/6.2831853+.5);
          float shown=step(around,prog)*step(around,fxs);float hot=(vF.y>4.5&&vF.y<5.5&&fxk>0.&&fxk<4.?exp(-fxk*.8)*2.5:0.)+(sk>0.&&sk<4.&&stPrev<.5?exp(-sk*.8)*2.5:0.);
          em+=mix(uWarm,uMetal,.5)*bit*bandM*inscribed*shown*(.2+hot)*(st>2.5?.2:1.);
          // The coping of the plinth: a continuous line of light once committed (it stays), struck bright by a commit.
          float cop=(1.-smoothstep(0.,AA(y)*1.5+.02,abs(y-.9)))+(1.-smoothstep(0.,AA(y)*1.5+.015,abs(y-.12)))*.5;
          em+=mix(uWarm,uMetal,.35)*cop*inscribed*shown*(.12+hot*1.6)*(st>2.5?.2:1.);
          c=mix(c,stoneC*.3,bandM*.6);}
        // Roofs: crockets climbing the spire's edges, small lucarnes and a lit finial.
        if(look>4.5&&look<5.5){
          // Crockets: small leafy knobs up the edges that catch the moonlight (stone, not lamps).
          float cro=rib*smoothstep(.7,.9,fract(py/.2))*step(vL.y,.92);c+=uMoonC*cro*(.05+.4*rim+.2*key)*uMoonK;
          float lu=lancet(vec2(px,py-h*.1),min(faceW*.12,.05),0.,h*.07);float luc=fill(lu)*step(.5,mod(fi,2.))*step(vL.y,.3);
          em+=uWarm*luc*(st>1.5&&st<2.5?.6:st>.5&&st<1.5?.2:0.);c*=1.-luc*.8;
          float crown=vF.w>.5&&vF.z>-1e4?clamp((uT-vF.z)/uSpeed/2.5-vL.y,0.,1.):0.;em+=uGold*(rib*1.2+.05)*crown*(.5+.12*min(vF.w,4.));
          float fin=smoothstep(.86,.98,vL.y);em+=mix(uWarm,uMetal,.3)*fin*(.4+1.4*uUnlock.z);c=mix(c,c*vec3(.75,.85,.9),.4);}
        if(look>6.5&&look<8.5){em+=mix(uWarm,vC,.25)*lineY*(st>1.5&&st<2.5?.8:.3)*(look<7.5?1.:.4);}
        // Buttress piers and brutalist columns: fluted; a brutalist column carries a vertical light slit.
        if(look>12.5&&look<13.5){float fl=abs(fract(fu*3.)-.5);c*=.8+.4*smoothstep(.1,.3,fl);
          if(uArch>.5&&uArch<1.5&&cap<.5){float sl=1.-smoothstep(.0,AA(px)*1.5+.01,abs(px)-faceW*.05);sl*=step(.06,vL.y)*step(vL.y,.94);float on=st>1.5&&st<2.5?.7:st>.5&&st<1.5?.12*step(.5,h11b(seed*7.+fi)):0.;
            em+=uWarm*sl*on*(1.+.1*sin(6.2832*uBars/${breathBars}.+seed*5.));c*=1.-sl*.6;}}
        if(look>9.5&&look<10.5){em+=mix(uWarm,uMetal,.4)*smoothstep(.88,1.,vL.y)*(.1+.2*uUnlock.z);}
        if(look>10.5&&look<11.5&&cap<.5){float on=st>1.5&&st<2.5?1.:st>.5&&st<1.5?.45:st>2.5?0.:.06;float fl2=texture(uNoise,vec2(seed+fi*.13,uV*.19)).y;
          if(uArch>.5&&uArch<1.5){float mul=step(.12,abs(fract(fu*3.)-.5)*2.);em+=uWarm*mul*on*1.5*(.9+.1*sin(6.2832*uBars/${breathBars}.+seed*5.));c*=.3;}
          else{// The lantern stage: one tall open lancet on each face, the light inside seen through it.
            float dl=lancet(vec2(px,py),faceW*.26,h*.1,h*.62);float ow=fill(dl);float fr=1.-smoothstep(0.,.015+AA(dl),abs(dl-.02));
            em+=uWarm*ow*on*(1.6+.5*(fl2-.5))*(1.1-.5*vL.y);c=mix(c,vec3(0.),ow*.9);c+=uMoonC*fr*(.08+.3*rim)*(1.-ow);}}
        // Gablets (Freiburg): a pointed gable on each face around the foot of a spire, a small lit lancet in each, moonlit
        // crockets on its rakes.
        if(look>13.5&&look<14.5){float rake=h*(1.-abs(px)/(faceW*.5));if(py>rake||cap>.5)discard;
          float er=1.-smoothstep(0.,AA(rake-py)*1.5+.012,rake-py);c+=uMoonC*er*(.1+.5*rim+.3*key)*uMoonK;
          float gl=fill(lancet(vec2(px,py-h*.1),faceW*.07,0.,h*.28));float on=st>1.5&&st<2.5?1.:st>.5&&st<1.5?.4:0.;
          em+=uWarm*gl*on*1.3;c*=1.-.8*gl;}
        // String courses and ribs: precise light lines (state coloured; a failing tower's only faintly red).
        vec3 lineC=st<.5?uDraft*.12:st>2.5?uStress*.22:st>1.5?mix(uWarm,uValid,.2)*.55:mix(uWarm,vC,.4)*.14;
        if(look<3.5||look>8.5&&look<9.5){em+=lineC*lineY*(1.-cap);em+=lineC*rib*(st<.5?.3:.05)*(1.-cap);}
        // Draft: dark glass behind a thin, dim cyan scaffold that fades with distance.
        float camD=length(cameraPosition-vW);
        if(st<.5&&look<4.5){float gx=smoothstep(-AA(px)*1.2-.002,0.,abs(fract(px/.2)-.5)*.2-.094);float gy=smoothstep(-AA(py)*1.2-.002,0.,abs(fract(py/.2)-.5)*.2-.094);
          c=c*.25;em+=uDraft*max(gx,gy)*.055*(1.-cap)*(1.-smoothstep(20.,70.,camD));}
        // Stressed: at most one crack per face climbing from the base: a narrow white-hot core with a dim red bleed.
        vec3 crk=vec3(0.);
        if(stCur>2.5&&look<4.5&&cap<.5&&(st>2.5||sk>0.)){float cTop=min(top,max(sk,0.)*1.3+.15);float hf=h11b(fi*7.3+seed*31.);
          if(hf<.38){float x0=(h11b(fi*3.1+seed*17.)-.5)*faceW*.45;float t1=wy*2.1+hf*5.,t2=wy*5.7+hf*11.;
            float x=x0+(abs(fract(t1)-.5)-.25)*faceW*.5+(abs(fract(t2)-.5)-.25)*faceW*.16;float dd=abs(px-x);float grow=1.-smoothstep(cTop-.35,cTop,wy);
            float core=1.-smoothstep(.001,.0035+AA(dd),dd);crk=(vec3(1.,.8,.66)*core*1.3+uStress*exp(-dd*32.)*.16)*grow*(.85+.15*sin(uV*1.1+seed*3.));}
          c*=.75;}
        // Assembly glow on new pieces, the state sweeps, effects.
        float asmG=(1.-vAsm)*step(vX.x,1.6)*step(0.,vX.x);em+=uDraft*asmG*(rib+lineY+.1)*.9;
        em+=(stCur>1.5?mix(uWarm,uValid,.3)*2.:uDraft*.8)*band*(.4+rib);
        em+=mix(uWarm,uValid,.3)*fxScan*2.+mix(uWarm,vec3(1.,.86,.62),.3)*fxRestore*3.;
        em+=uDraft*vX.y*(rib+lineY)*1.5;
        vec3 outc=c+em*uMood.x;
        // A failing precinct turns cold: stone and window light drain toward a grey-blue (not the cracks).
        if(uCold.w>0.){float k=uCold.w*exp(-pow(distance(vW.xz,uCold.xy)/uCold.z,2.));outc=mix(outc,vec3(dot(outc,vec3(.3,.55,.15)))*vec3(.5,.75,1.3),k);}
        outc+=crk;
        gl_FragColor=vec4(mix(outc,fogCol(vW),vFog),outAlpha(vW));}`});
  const stoneMesh=new THREE.Mesh(stoneB.geometry,stoneMat);stoneMesh.frustumCulled=false;scene.add(stoneMesh);
  const stoneMirror=mirrored(stoneMesh);
  // ---- Ribbons: arcade arches and suspended bridges (solid), floor channels, agent beams and crown needles (light)
  const SEG=28;const ribbonGeo=(()=>{const gg=new THREE.BufferGeometry(),t=[],side=[],idx=[];
    for(let i=0;i<=SEG;i++){t.push(i/SEG,i/SEG);side.push(-1,1);if(i<SEG){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    gg.setAttribute('position',new THREE.Float32BufferAttribute(new Array((SEG+1)*2*3).fill(0),3));gg.setAttribute('aT',new THREE.Float32BufferAttribute(t,1));gg.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));gg.setIndex(idx);return gg;})();
  const RIBBON_VS=`${FOG}attribute float aT,aSide;attribute vec4 kA,kB,kInfo,kC;uniform float uT,uSpeed,uV;
    varying float vT,vSide,vAl,vKind,vSeed,vFog,vFresh;varying vec4 vC;varying vec3 vW,vTan;
    vec3 curve(float t,float kind){vec3 a=kA.xyz,b=kB.xyz;vec3 m=mix(a,b,t);
      if(kind>1.5&&kind<2.5){float x=t*2.-1.;m.y+=kB.w*(sqrt(max(4.-pow(1.+abs(x),2.),0.))/1.7320508);}
      else if(kind>.5&&kind<1.5){m.y-=kB.w*4.*t*(1.-t);}
      return m;}
    void main(){float kind=kInfo.z;float age=(uT-kInfo.x)/uSpeed;float gone=kInfo.y<1e5?clamp((uT-kInfo.y)/uSpeed/1.,0.,1.):0.;
      float grow=kind>1.5&&kind<2.5?clamp((age-.6)/1.4,0.,1.):kind>2.5?1.:clamp(age/(kind>.5?2.2:1.2),0.,1.);
      vec3 p=curve(aT,kind),q=curve(min(1.,aT+.01),kind);if(aT>.99)q=p+(p-curve(aT-.01,kind));vec3 tg=normalize(q-p+1e-5);
      vec3 side=kind<.5?normalize(cross(tg,vec3(0.,1.,0.))+1e-5):normalize(cross(tg,normalize(cameraPosition-p))+1e-5);
      float w=kA.w*(kind>2.5&&kind<3.5?mix(.15,1.,aT):kind>3.5?mix(1.,.2,aT):1.);
      p+=side*aSide*w*.5;if(kind<.5)p.y=.012;
      p.y*=uMirror;vW=p;vTan=tg;
      vT=aT;vSide=aSide;vAl=(aT<=grow?1.:0.)*(1.-gone)*step(0.,age);vFresh=age>0.&&age<12.?exp(-max(age-2.2,0.)*.45):0.;vKind=kind;vSeed=kInfo.w;vC=kC;vFog=fogAmt(p);
      gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
  const solidB=instancedBuffers(ribbonGeo,{kA:4,kB:4,kInfo:4,kC:4},256);
  const solidMat=new THREE.ShaderMaterial({uniforms:{...common,uStone:{value:stone},uMetal:{value:metal}},side:THREE.DoubleSide,vertexShader:RIBBON_VS,
    fragmentShader:`${FOG}${OUT_ALPHA}uniform vec3 uStone,uMetal,uKey,uWarm;uniform float uV,uActivity,uBars;uniform vec4 uMood;varying float vT,vSide,vAl,vKind,vSeed,vFog;varying vec4 vC;varying vec3 vW,vTan;
      void main(){if(vAl<.5)discard;float e=abs(vSide);float core=exp(-e*e*28.);float edge=smoothstep(.6,.95,e);
        vec3 c=uStone*(.12+.25*max(uKey.y,0.)*(1.-e))+uMoonC*edge*.12;
        vec3 em=vC.rgb*core*vC.w;
        if(vKind>.5&&vKind<1.5){float p=fract(vT*3.-uV*(.12+.12*uActivity)+vSeed);float pk=smoothstep(0.,.03,p)*(1.-smoothstep(.03,.12,p));em+=mix(uWarm,vC.rgb,.5)*(pk*2.6+.25)*core;em+=uMoonC*edge*.15;}
        gl_FragColor=vec4(mix(c+em*uMood.x,fogCol(vW),vFog),outAlpha(vW));}`});
  const solidMesh=new THREE.Mesh(solidB.geometry,solidMat);solidMesh.frustumCulled=false;scene.add(solidMesh);mirrored(solidMesh);
  // With life, a cable's traffic (kL: how many inhabitants run along it and which way) lights it; a channel reads the field.
  const glowB=instancedBuffers(ribbonGeo,LIFE?{kA:4,kB:4,kInfo:4,kC:4,kL:2}:{kA:4,kB:4,kInfo:4,kC:4},256);
  const GLOW_VS=LIFE?RIBBON_VS.replace('void main(){',`${LIFE_GLSL}attribute vec2 kL;varying vec4 vLife;void main(){`).replace('p.y*=uMirror;vW=p;',
    'vLife=lifeAt(p.xz);vLife.ba=vec2(dot(vLife.ba*2.-1.,normalize(tg.xz+1e-5)),0.);if(kind>.5&&kind<1.5)vLife=vec4(kL.x*.7,0.,kL.y*.25,0.);p.y*=uMirror;vW=p;'):RIBBON_VS;
  const glowMat=additive(new THREE.ShaderMaterial({uniforms:{...common},side:THREE.DoubleSide,vertexShader:GLOW_VS,
    fragmentShader:`${FOG}uniform float uV,uActivity;uniform vec3 uWarm;uniform vec4 uMood;varying float vT,vSide,vAl,vKind,vSeed,vFog,vFresh;varying vec4 vC;varying vec3 vW,vTan;${LIFE?'varying vec4 vLife;':''}
      void main(){if(vAl<.5)discard;float e=1.-vSide*vSide;vec3 c=vec3(0.);
        if(vKind<.5){float p=fract(vT*2.-uV*(.15+.2*uActivity)+vSeed);float pk=smoothstep(0.,.04,p)*(1.-smoothstep(.04,.16,p));c=vC.rgb*vC.w*e*(.35+pk*2.5);}
        else if(vKind<1.5){float p=fract(vT*2.5-uV*(.1+.12*uActivity)+vSeed);float pk=smoothstep(0.,.02,p)*(1.-smoothstep(.02,.06,p));c=vC.rgb*vC.w*(pow(e,3.)*(.7+3.*vFresh)+pk*pow(e,2.)*3.);}
        else{float f=pow(e,1.5)*(.75+.25*sin(vT*14.-uV*5.));c=vC.rgb*vC.w*f*(1.-vT*.5);}
        ${LIFE?`if(vKind<1.5){float tr=smoothstep(.02,.7,vLife.r),fl=vLife.b,dir=fl>=0.?1.:-1.,gs=smoothstep(.08,.6,vLife.g);
          float q=fract(dot(vW.xz,normalize(vTan.xz+1e-5))*1.6-uV*(.5+2.5*min(abs(fl)*4.,1.))*dir);float pk=smoothstep(0.,.05,q)*(1.-smoothstep(.05,.3,q))*(1.-gs)*(.3+.7*tr);
          c+=mix(vC.rgb,uWarm,.5)*tr*min(1.,vC.w*2.5)*(vKind<.5?e*(.35+2.*pk):pow(e,2.)*(.45+2.6*pk))*(1.-.92*gs);}`:''}
        c*=(1.-vFog*.8)*uMood.x;if(!(c.r>=0.&&c.g>=0.&&c.b>=0.&&c.r<1e4))c=vec3(0.);
        gl_FragColor=vec4(c,0.);}`}));
  const glowMesh=new THREE.Mesh(glowB.geometry,glowMat);glowMesh.frustumCulled=false;glowMesh.renderOrder=2;scene.add(glowMesh);
  // ---- Kerbs: each precinct's foundation edged by a low stone kerb (a few centimetres) whose coping carries a line of
  // light: lit by the share of the precinct's committed and validated work (it stays), struck by commits and foundings.
  const bayShape=new THREE.BoxGeometry(1,1,1);bayShape.translate(0,.5,0);
  const bayB=instancedBuffers(bayShape,{aP:4,aS:4,aC:4,aQ:4,aF:4},128);
  const bayMat=new THREE.ShaderMaterial({uniforms:{...common,uStone:{value:stone},uMetal:{value:metal},uDLit:{value:new Float32Array(DMAX)}},
    vertexShader:`${FOG}${LIFE_GLSL}attribute vec4 aP,aS,aC,aQ,aF;uniform float uT,uSpeed,uBars,uDLit[${DMAX}];varying vec3 vW,vN,vL,vC;varying float vFog,vK,vAge,vChase,vFx,vLit;${LIFE?'varying vec4 vLife;':''}
      void main(){float age=(uT-aP.w)/uSpeed;float e=clamp(age/1.2,0.,1.);e=1.-pow(1.-e,3.);
        vec3 lp=position;vec3 q=lp*vec3(aS.x,aS.y,.12);q.y-=(1.-e)*(aS.y+.02);
        float c=cos(aP.z),s=sin(aP.z);vec3 w=vec3(aP.x+q.x*c-q.z*s,q.y,aP.y+q.x*s+q.z*c);
        vec3 n=vec3(normal.x*c-normal.z*s,normal.y,normal.x*s+normal.z*c);w.y*=uMirror;n.y*=uMirror;
        float ph=fract(aQ.x-uBars/aQ.y+aQ.z);float dd=min(ph,1.-ph)*aQ.w;vChase=exp(-dd*dd*1.2);
        float fk=(uT-aF.x)/uSpeed-aF.y;vFx=aF.z>.5&&fk>-1.&&fk<5.?exp(-fk*fk*2.)*4.+max(0.,fk)*exp(-fk*.7)*.6:0.;
        vLit=uDLit[int(aS.z)];${LIFE?'vLife=lifeAt(w.xz);vLife.b=dot(vLife.ba*2.-1.,vec2(c,s));vLife.a=dot(w.xz,vec2(c,s));':''}
        vW=w;vN=n;vL=vec3(lp.x*aS.x,lp.y,lp.z);vC=aC.rgb;vK=aC.w;vAge=age;vFog=fogAmt(w);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${FOG}${OUT_ALPHA}uniform vec3 uStone,uMetal,uKey,uWarm;uniform float uV,uActivity,uBars;uniform vec4 uMood,uUnlock;varying vec3 vW,vN,vL,vC;varying float vFog,vK,vAge,vChase,vFx,vLit;${LIFE?'varying vec4 vLife;':''}
      void main(){if(vAge<0.)discard;vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);
        float key=max(dot(N,uKey),0.);float rim=pow(1.-max(dot(N,V),0.),3.)*.2;float tex=texture(uNoise,vW.xz*.7+vW.y*.3).x;
        vec3 c=uStone*(.7+.4*tex)*(key*.35*uMoonC*cloudSh(vW.xz)+.03*uMoonC)+uMoonC*rim*.2;
        float y=vL.y;float cop=N.y>.5?1.:smoothstep(.55,.9,y);
        vec3 lc=mix(uWarm,vC,.35);
        float fresh=vAge<3.?exp(-vAge*1.2)*1.5:0.;
        vec3 em=lc*cop*(.05+.5*vLit+(fresh+vFx)*1.4+vChase*.12*(.3+.7*uUnlock.y));
        ${LIFE?`{float tr=smoothstep(.02,.7,vLife.r),fl=vLife.b,gs=smoothstep(.08,.6,vLife.g);float q=fract(vLife.a*2.2-uV*(.4+2.*min(abs(fl)*4.,1.))*(fl>=0.?1.:-1.));
          float pk=smoothstep(0.,.06,q)*(1.-smoothstep(.06,.35,q))*(1.-gs)*(.3+.7*tr);em*=1.-.85*gs;em+=mix(lc,uWarm,.5)*cop*tr*(.25+1.9*pk)*(1.-.8*gs);}`:''}
        gl_FragColor=vec4(mix((c+em)*uMood.x,fogCol(vW),vFog),outAlpha(vW));}`});
  const bayMesh=new THREE.Mesh(bayB.geometry,bayMat);bayMesh.frustumCulled=false;scene.add(bayMesh);mirrored(bayMesh);
  // ---- Pinnacles and needles: the same stone shader on a cheap four-sided geometry (they are many) ------------------
  const pinGeo=new THREE.CylinderGeometry(1,1,1,4,1,false);pinGeo.translate(0,.5,0);
  const pinB=instancedBuffers(pinGeo,{iA:4,iB:4,iL:4,iS:4,iF:4,iC:4,iT:4},256);
  const pinMesh=new THREE.Mesh(pinB.geometry,stoneMat);pinMesh.frustumCulled=false;scene.add(pinMesh);mirrored(pinMesh);
  // ---- Naves: each precinct's hall, a long gabled body along its principal axis with clerestory lancets, and a rose
  // window in each gable (the rose ignites with a verified milestone and stays lit) ----------------------------------
  const naveGeo=(()=>{const P=[],N=[],F=[];const v3=(a)=>new THREE.Vector3(...a);
    const poly=(pts,n,f)=>{for(let k=1;k+1<pts.length;k++){let a=pts[0],b=pts[k],c=pts[k+1];const cr=v3(b).sub(v3(a)).cross(v3(c).sub(v3(a)));if(cr.dot(v3(n))<0)[b,c]=[c,b];for(const x of [a,b,c]){P.push(...x);N.push(...n);F.push(f);}}};
    poly([[.5,0,-.5],[.5,0,.5],[.5,1,.5],[.5,1,-.5]],[1,0,0],0);poly([[-.5,0,-.5],[-.5,0,.5],[-.5,1,.5],[-.5,1,-.5]],[-1,0,0],0);
    poly([[.5,1,-.5],[.5,1,.5],[0,2,.5],[0,2,-.5]],[1,.5,0],1);poly([[-.5,1,-.5],[-.5,1,.5],[0,2,.5],[0,2,-.5]],[-1,.5,0],1);
    for(const z of [.5,-.5])poly([[-.5,0,z],[.5,0,z],[.5,1,z],[0,2,z],[-.5,1,z]],[0,0,Math.sign(z)],2);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));g.setAttribute('aFace',new THREE.Float32BufferAttribute(F,1));return g;})();
  const naveB=instancedBuffers(naveGeo,{nA:4,nB:4,nC:4,nD:4},16);
  const naveMat=new THREE.ShaderMaterial({uniforms:{...common,uStone:{value:stone},uMetal:{value:metal},uGlass:stoneU.uGlass,uGlassK:{value:glassK},uArch:{value:A.id},uDraft:stoneU.uDraft},
    vertexShader:`${FOG}attribute vec4 nA,nB,nC,nD;attribute float aFace;uniform float uT,uSpeed;varying vec3 vW,vN,vL,vC;varying vec4 vB,vD;varying float vFace,vLit,vFog,vRise;
      void main(){float age=(uT-nA.w)/uSpeed;float rise=smoothstep(0.,1.,clamp((age-1.)/2.2,0.,1.));
        vec3 lp=position;float y=lp.y<=1.?lp.y*nB.z:nB.z+(lp.y-1.)*nB.w;y*=rise;
        vec2 dir=vec2(cos(nA.z),sin(nA.z)),perp=vec2(dir.y,-dir.x);vec2 xz=nA.xy+perp*lp.x*nB.y+dir*lp.z*nB.x;
        vec3 nl=normal/vec3(nB.y,aFace>.5&&aFace<1.5?nB.w:nB.z,nB.x);vec3 n=normalize(vec3(perp.x*nl.x+dir.x*nl.z,nl.y,perp.y*nl.x+dir.y*nl.z));
        vec3 w=vec3(xz.x,y,xz.y);w.y*=uMirror;n.y*=uMirror;
        vW=w;vN=n;vL=vec3(lp.x*nB.y,y,lp.z*nB.x);vB=nB;vC=nC.rgb;vLit=nC.w;vD=nD;vFace=aFace;vRise=age<0.?-1.:rise;vFog=fogAmt(w);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${FOG}${OUT_ALPHA}uniform vec3 uStone,uMetal,uKey,uWarm,uGlass[4],uDraft;uniform float uV,uBars,uGlassK,uArch,uT,uSpeed;uniform vec4 uMood;
      varying vec3 vW,vN,vL,vC;varying vec4 vB,vD;varying float vFace,vLit,vFog,vRise;
      float h11b(float n){return fract(sin(n*12.9898)*43758.5453);}
      float fillD(float d){float a=max(fwidth(d),1e-4);return 1.-smoothstep(-a,a,d);}
      float lancet(vec2 p,float a,float yb,float ys){float d=p.y>ys?length(vec2(abs(p.x)+a,p.y-ys))-2.*a:abs(p.x)-a;return max(d,yb-p.y);}
      void main(){if(vRise<0.)discard;vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);float y=vL.y,H=vB.z,W=vB.y,Ln=vB.x;
        float key=max(dot(N,uKey),0.)*cloudSh(vW.xz);float rim=pow(1.-max(dot(N,V),0.),3.);
        float tex=texture(uNoise,vW.xz*.6+vW.y*.4).x;vec3 st=uStone*(.75+.35*tex);
        vec3 c=st*(key*.6*uMoonC+.03*uMoonC)+uMoonC*rim*.14*uMoonK+st*uWarm*exp(-y*2.5)*(.04+.08*vLit);vec3 em=vec3(0.);float lit=vLit;
        float ign=vD.x>-1e4?clamp((uT-vD.x)/uSpeed,0.,1e4):-1.;float hold=ign>=0.?exp(-max(ign-1.5,0.)*.35)*smoothstep(0.,1.5,ign):0.;
        if(vFace<.5){
          // Side walls: bays between buttresses, tall clerestory lancets above, low aisle lancets below.
          float nb=max(2.,floor(Ln/.46+.5));float bf=(vL.z/Ln+.5)*nb;float bx=fract(bf)-.5,bi=floor(bf);float bw=Ln/nb;vec2 wp=vec2(bx*bw,y);
          float but=smoothstep(.36,.42,abs(bx));c*=1.-.35*but;c+=uMoonC*but*rim*.1;
          float d1,d2;if(uArch>.5&&uArch<1.5){d1=max(abs(wp.x)-bw*.05,abs(y-H*.55)-H*.38);d2=1.;}
          else{d1=lancet(wp,bw*.17,H*.5,H*.76);d2=lancet(wp,bw*.12,H*.1,H*.3);}
          float w1=fillD(d1),w2=fillD(d2);float side=step(0.,vL.x);float r1=h11b(bi*3.1+side*7.+vD.w*13.),r2=h11b(bi*5.7+side*3.+vD.w*29.);
          float on1=step(r1,lit*1.1),on2=step(r2,lit*.6);
          vec3 g1=uWarm*(.9+.4*r2)*(1.15-.3*(y-H*.5)/(H*.3));
          em+=g1*w1*on1*1.3+uWarm*w2*on2*.6;c*=1.-.85*max(w1,w2);}
        else if(vFace<1.5){
          // Roof: dark lead with a lit brass ridge.
          float top=H+vB.w;float ridge=1.-smoothstep(.0,.04+fwidth(y),top-y);c=c*.55+uMetal*ridge*.06;em+=mix(uWarm,uMetal,.5)*ridge*.06*(.4+lit);}
        else{
          // Gable: the rose window, a portal glowing at its foot, and an oculus under the apex.
          vec2 gp=vec2(vL.x,y);float R=min(W*.36,H*.33);vec2 rc=gp-vec2(0.,H*.62);float rr=length(rc)/R;float th=atan(rc.y,rc.x);
          if(uArch>.5&&uArch<1.5){float sl=max(abs(abs(gp.x)-W*.3)-W*.02,abs(y-H*.45)-H*.35);float ws=fillD(sl);em+=uWarm*ws*(.3+lit);c*=1.-.8*ws;}
          float inside=1.-smoothstep(1.,1.02,rr);
          // The rose sits deep in the wall: a dark reveal, then a moulded stone frame catching the moonlight.
          float reveal=smoothstep(1.,1.02,rr)*(1.-smoothstep(1.12,1.14,rr));float mould=smoothstep(1.13,1.15,rr)*(1.-smoothstep(1.21,1.23,rr));
          c*=1.-.8*reveal;c+=uMoonC*(mould*(.05+.3*rim)+reveal*max(-rc.y/max(length(rc),1e-3),0.)*.04)*uMoonK;
          // Tracery: a hub, twelve spokes to a ring, and twelve cusped lobes (foils) in the outer band; the glass is set in
          // concentric bands (amber hub, ruby, cobalt), each pane a little different.
          float sf=fract(th/6.2831853*12.+.5)-.5;float spoke=abs(sf)*rr*.52;float rings=min(abs(rr-.62),abs(rr-.27));
          vec2 lq=vec2((rr-.81)/.19,sf*rr*.52/.16);float lobe=length(lq)-.82;
          float bar=min(min(rings,max(spoke,step(rr,.27)*1.+step(.62,rr)*1.)),abs(rr-1.));float trac=1.-smoothstep(0.,.04+fwidth(rr)*1.5,bar);
          trac=max(trac,step(.62,rr)*smoothstep(-.02,.06,lobe));
          float ring=rr<.27?0.:rr<.62?1.:2.,sec=floor(fract(th/6.2831853)*12.);float ci=ring*12.+sec;float m=h11b(ci*3.7+vD.w*11.);
          vec3 gc=mix(uWarm,ring<.5?mix(uWarm,vec3(1.,.8,.4),.5):ring<1.5?uGlass[1]:uGlass[2],.7+.25*uGlassK)*(.8+.4*m);
          float base=.3+.8*lit;float glow=ign>=0.?clamp(ign/2.2-rr*.7+.3,0.,1.):0.;
          float I=base+glow*(1.8+5.*hold)*(.92+.08*sin(6.2832*uBars/8.+ci));
          em+=gc*I*(1.-trac)*inside*(.9+.3*(1.-rr));c=mix(c,c*.3,inside);c+=uMetal*trac*inside*.18;
          float por=fillD(lancet(gp,W*.12,0.,H*.2));em+=uWarm*por*(.25+.7*lit)*(1.-y/(H*.4));c*=1.-.8*por;
          float ocu=fillD(length(gp-vec2(0.,H+vB.w*.45))-min(W*.07,vB.w*.22));em+=uWarm*ocu*(.2+.6*lit);c*=1.-.8*ocu;}
        float fx=vD.y>-1e4?(uT-vD.y)/uSpeed:-1.;if(fx>0.&&fx<6.){float band=exp(-pow((y-fx*.8)*4.,2.))*(1.-fx/6.);em+=mix(uWarm,vC,.3)*band*1.5;}
        gl_FragColor=vec4(mix((c+em)*uMood.x,fogCol(vW),vFog),outAlpha(vW));}`});
  const naveMesh=new THREE.Mesh(naveB.geometry,naveMat);naveMesh.frustumCulled=false;scene.add(naveMesh);mirrored(naveMesh);
  // ---- Openwork spires: the precincts' great spires as lattices of stone ribs, tracery and rings with the night seen
  // through them; a verified milestone crowns one with light (its ribs glow gold, lasting) ----------------------------
  const latGeo=new THREE.CylinderGeometry(1,1,1,SIDES,10,true);latGeo.translate(0,.5,0);
  const latB=instancedBuffers(latGeo,{lA:4,lB:4,lC:4},16);
  const latMat=new THREE.ShaderMaterial({uniforms:{...common,uStone:{value:stone},uMetal:{value:metal},uGold:{value:GOLD},uSides:{value:SIDES}},side:THREE.DoubleSide,
    vertexShader:`${FOG}attribute vec4 lA,lB,lC;uniform float uSides;varying vec3 vW,vL,vN;varying vec4 vB,vC;varying float vFog;
      void main(){vec3 lp=position;float k=pow(1.-lp.y,1.12);float r=lB.x*k;float c=cos(lB.w),s=sin(lB.w);vec2 xz=mat2(c,-s,s,c)*(lp.xz*r);
        vec3 w=vec3(lA.x+xz.x,lA.z+lp.y*lB.y,lA.y+xz.y);vec2 nxz=mat2(c,-s,s,c)*normal.xz;vec3 n=normalize(vec3(nxz.x,lB.x/max(lB.y,.01),nxz.y));
        w.y*=uMirror;n.y*=uMirror;vW=w;vL=lp;vN=n;vB=lB;vC=lC;vFog=fogAmt(w);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${FOG}${OUT_ALPHA}uniform vec3 uStone,uMetal,uKey,uWarm,uGold;uniform float uSides,uBars,uT,uSpeed;uniform vec4 uMood,uCarillon;varying vec3 vW,vL,vN;varying vec4 vB,vC;varying float vFog;
      float ln(float d,float w){float a=max(fwidth(d),1e-5);return 1.-smoothstep(w,w+a*1.2,abs(d));}
      void main(){float H=vB.y,y=vL.y;float r=vB.x*pow(1.-y,1.12);float ang=atan(vL.x,vL.z);float fs=(ang/6.2831853+.5)*uSides;float fu=fract(fs);
        float faceW=max(2.*r*sin(3.14159265/uSides),1e-3);float px=(fu-.5)*faceW,py=y*H;float camD=length(cameraPosition-vW);float near=1.-smoothstep(30.,70.,camD);
        float ed=min(fu,1.-fu)*faceW;float rib=ln(ed,.022+.018*(1.-y));
        float sp=.42*(1.-.5*y);float ry=fract(py/sp);float ring=ln(min(ry,1.-ry)*sp,.014)*near;
        float la=min(faceW,sp*1.2)*.2;vec2 cq=vec2(px,ry*sp);float ld=cq.y>sp*.5?length(vec2(abs(cq.x)+la,cq.y-sp*.5))-2.*la:abs(cq.x)-la;ld=max(ld,sp*.12-cq.y);
        float tr=(ln(ld,.008)+ln(px,.006)*step(ry,.5))*near;
        float m=max(rib,max(ring,tr));if(m<.5&&y<.97)discard;
        vec3 N=normalize(vN)*(gl_FrontFacing?1.:-1.);vec3 V=normalize(cameraPosition-vW);float rim=pow(1.-abs(dot(N,V)),2.);
        vec3 c=uStone*(.05+.5*max(dot(N,uKey),0.)*cloudSh(vW.xz))*uMoonC+uMoonC*rim*.18*uMoonK;
        // Gilded from the foot up when crowned; after its moment the crown holds bright for a while, then settles.
        float crown=vC.y>-1e4?clamp((uT-vC.y)/uSpeed/2.2-y*.9,0.,1.):0.;float lvl=vC.x;
        float a2=(uT-vC.w)/uSpeed;float fresh=vC.w>-1e4&&a2>0.?(1.+1.5*exp(-a2*.6))*(1.-smoothstep(18.,26.,a2)):0.;
        vec3 em=uGold*crown*(rib*.9+ring*.6+tr*.45)*(.75+.18*min(lvl,4.)+1.8*fresh)*(.92+.08*sin(6.2832*uBars/4.+y*6.));
        // The carillon: on the city's great spire a peal of light climbs the lattice's rings every sixteen bars.
        if(vB.z>.5&&uCarillon.y>0.){float pk=exp(-pow((y-uCarillon.x)*9.,2.));em+=mix(uWarm,vec3(1.,.93,.8),.4)*(ring*1.4+rib*.35)*pk*uCarillon.y;}
        em+=mix(uWarm,uMetal,.4)*rib*step(.8,fract(py/.2))*.25*vC.z;
        em+=mix(uWarm,uGold,.5)*smoothstep(.95,.99,y)*(.6+1.6*vC.z+2.*crown);
        gl_FragColor=vec4(mix((c+em)*uMood.x,fogCol(vW),vFog),outAlpha(vW));}`});
  const latMesh=new THREE.Mesh(latB.geometry,latMat);latMesh.frustumCulled=false;scene.add(latMesh);mirrored(latMesh);
  // ---- Rings: tower armillaries, the great orrery, crowns' halos and lock clamps (instanced torus, brass and light)-
  const ringGeo=new THREE.TorusGeometry(1,.02,6,128);
  const ringB=instancedBuffers(ringGeo,{rC:4,rU:4,rV:4,rK:4},64);
  const ringMat=new THREE.ShaderMaterial({uniforms:{...common,uMetal:{value:metal}},
    vertexShader:`${FOG}attribute vec4 rC,rU,rV,rK;uniform float uT,uSpeed;varying vec3 vW,vN;varying float vFog,vTh,vKind,vA;varying vec3 vCol;
      void main(){vec3 U=rU.xyz,Vv=rV.xyz;vec3 Nn=normalize(cross(U,Vv));float th=atan(position.y,position.x);float rad=length(position.xy)-1.;float thick=rU.w;
        vec3 dir=U*cos(th)+Vv*sin(th);vec3 w=rC.xyz+dir*(rC.w+rad*thick/.02)+Nn*position.z*thick/.02;
        vN=normalize(dir*rad+Nn*position.z);w.y*=uMirror;vN.y*=uMirror;vW=w;vFog=fogAmt(w);vTh=th;vKind=rK.x;vA=rK.y;vCol=vec3(rK.z,rV.w,rK.w);
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${FOG}${OUT_ALPHA}uniform vec3 uMetal,uKey,uWarm;uniform float uV;uniform vec4 uMood;varying vec3 vW,vN;varying float vFog,vTh,vKind,vA;varying vec3 vCol;
      void main(){if(vA<.01)discard;vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);vec3 H=normalize(uKey+V);
        float spec=pow(max(dot(N,H),0.),40.);float teeth=step(.5,fract(vTh*48./6.2831853));
        vec3 c=uMetal*(.08+.35*max(dot(N,uKey),0.))*(.85+.15*teeth)+uMoonC*spec*.6+uMetal*pow(1.-max(dot(N,V),0.),3.)*.25;
        c+=vCol*(vKind>.5?1.:.35);
        gl_FragColor=vec4(mix(c*vA*uMood.x,fogCol(vW),vFog),outAlpha(vW));}`});
  const ringMesh=new THREE.Mesh(ringB.geometry,ringMat);ringMesh.frustumCulled=false;scene.add(ringMesh);mirrored(ringMesh);
  // ---- Searchlights and the recovery beam (volumetric: the chord of the view ray through each beam) ---------------
  const beamGeo=new THREE.CylinderGeometry(1,1,1,20,1,true);beamGeo.translate(0,.5,0);
  const beamB=instancedBuffers(beamGeo,{bP:4,bD:4,bC:4},16);
  const beamMat=additive(new THREE.ShaderMaterial({uniforms:{...common},side:THREE.BackSide,
    vertexShader:`attribute vec4 bP,bD,bC;varying vec3 vW;varying vec4 vP,vD,vC;
      void main(){vec3 d=normalize(bD.xyz);vec3 u=normalize(abs(d.y)<.99?cross(d,vec3(0.,1.,0.)):vec3(1.,0.,0.));vec3 v=cross(d,u);
        vec3 w=bP.xyz+d*position.y*bD.w+(u*position.x+v*position.z)*bP.w*(1.+position.y*bC.w);
        vW=w;vP=bP;vD=vec4(d,bD.w);vC=bC;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`uniform float uV;uniform vec4 uMood;uniform sampler2D uNoise;varying vec3 vW;varying vec4 vP,vD,vC;
      void main(){vec3 ro=cameraPosition,rd=normalize(vW-ro);vec3 a=vP.xyz,d=vD.xyz;
        vec3 w0=ro-a;float b=dot(rd,d),dd=dot(w0,d),e=dot(rd,w0);float den=max(1.-b*b,1e-4);float s=(dd-b*e)/den,tt=(b*dd-e)/den;
        vec3 pc=ro+rd*tt,pa=a+d*clamp(s,0.,vD.w);float dist=length(pc-pa);float along=clamp(s/vD.w,0.,1.);float rr=vP.w*(1.+along*vC.w);
        float ch=sqrt(max(0.,1.-dist*dist/(rr*rr)));if(ch<=0.||tt<0.)discard;float camD=length(w0-d*dot(w0,d));ch*=smoothstep(rr*1.3,rr*3.5,camD);float mie=dot(rd,d);ch*=mix(.7,1.25,smoothstep(-.3,.8,mie));
        vec4 n1=texture2D(uNoise,vec2(pa.x+pa.z,pa.y*.4)*.03+vec2(0.,-uV*.003));vec4 n2=texture2D(uNoise,vec2(pa.x-pa.z,pa.y*.3)*.17+vec2(uV*.002,0.));float dust=.7+.4*n1.x*n1.y+.1*(n2.z-.5);
        float fall=smoothstep(.0,.12,along)*(1.-smoothstep(.55,1.,along));
        gl_FragColor=vec4(vC.rgb*ch*ch*dust*fall*uMood.x,0.);}`}));
  const beamMesh=new THREE.Mesh(beamB.geometry,beamMat);beamMesh.frustumCulled=false;beamMesh.renderOrder=4;scene.add(beamMesh);
  // ---- Points: dust, orrery beads and beacons, agents, bursts ----------------------------------------------------
  const POINT_FS=`varying vec4 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC.rgb*(exp(-r*5.)+exp(-r*24.)*1.5)*vC.a,0.);}`;
  // Dust in the air between the camera and the city, glinting where it lies toward the moon (forward scattering).
  const MOTES=Math.round((1400+2400*moteK)),motes=pointBuffers({mI:4},MOTES);
  {const r=rng(hash(`motes/${seed}`));for(let i=0;i<MOTES;i++){motes.write('position',i,r(),r(),r()*6.2832);motes.write('mI',i,0,.3+r()*.7,r(),r());}motes.commit(MOTES);}
  const moteMat=additive(new THREE.ShaderMaterial({uniforms:{...common,uBox:{value:new THREE.Vector4(0,0,20,8)},uMote:{value:moonC.clone().lerp(warm,.15)},uCount:{value:MOTES}},
    vertexShader:`uniform vec3 uMote,uMoonDir;uniform vec4 uBox;uniform float uV,uPx,uCount,uMoonK;attribute vec4 mI;varying vec4 vC;
      void main(){if(float(gl_VertexID)>=uCount){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vC=vec4(0.);return;}
        float drift=uV*.012*(mI.y-.5);
        vec3 p=vec3(uBox.x+(position.x-.5)*uBox.z,fract(position.y+drift*.5)*uBox.w,uBox.y+(sin(position.z)*.5)*uBox.z)+vec3(sin(uV*.05+mI.w*9.),0.,cos(uV*.04+mI.z*9.))*1.5;
        p.y=max(p.y,.02);vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        float fwd=max(dot(normalize(p-cameraPosition),uMoonDir),0.);float a=.1+2.2*pow(fwd,18.)*uMoonK;
        float tw=.55+.45*sin(uV*(.6+mI.w)+mI.z*40.);gl_PointSize=clamp(1.3*uPx*22./max(1.,-mv.z),1.,2.6);vC=vec4(uMote*tw*a*mI.y*.12*clamp((-mv.z-4.)/8.,0.,1.),1.);}`,
    fragmentShader:POINT_FS}));
  const motePoints=new THREE.Points(motes.geometry,moteMat);motePoints.frustumCulled=false;motePoints.renderOrder=5;scene.add(motePoints);
  const LAMPS=96,lamps=pointBuffers({aC:4,aS:1},LAMPS);
  const lampMat=additive(new THREE.ShaderMaterial({uniforms:{...common},
    vertexShader:`${FOG}attribute vec4 aC;attribute float aS;uniform float uPx;varying vec4 vC;void main(){vec3 p=position;p.y*=uMirror;vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(aS*uPx*60./max(.5,-mv.z),0.,64.);vC=vec4(aC.rgb*(1.-fogAmt(p)*.85),aC.a);}`,fragmentShader:POINT_FS}));
  const lampPoints=new THREE.Points(lamps.geometry,lampMat);lampPoints.frustumCulled=false;lampPoints.renderOrder=6;scene.add(lampPoints);
  const lampMirror=new THREE.Points(lamps.geometry,lampMat);lampMirror.frustumCulled=false;mirror.add(lampMirror);
  const BURSTS=24,PER=40,burstPts=pointBuffers({bDir:4},BURSTS*PER);
  {const r=rng(hash(`burst/${seed}`));for(let b=0;b<BURSTS;b++)for(let k=0;k<PER;k++){const u=r()*2-1,a=r()*6.283,s=Math.sqrt(1-u*u);burstPts.write('position',b*PER+k,0,0,0);burstPts.write('bDir',b*PER+k,Math.cos(a)*s,Math.abs(u)*.9+.1,Math.sin(a)*s,b+r()*.9);}burstPts.commit(BURSTS*PER);}
  const burstU={uBA:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(0,0,0,-1e5))},uBB:{value:Array.from({length:BURSTS},()=>new THREE.Vector4())},uBC:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(1,0,1,0))}};
  const burstMat=additive(new THREE.ShaderMaterial({uniforms:{...common,...burstU},
    vertexShader:`attribute vec4 bDir;uniform vec4 uBA[${BURSTS}],uBB[${BURSTS}],uBC[${BURSTS}];uniform float uT,uSpeed,uPx;varying vec4 vC;
      void main(){int b=int(bDir.w);float sp=fract(bDir.w);vec4 A=uBA[b],B=uBB[b],C=uBC[b];float age=(uT-A.w)/uSpeed/C.x;
        if(age<0.||age>1.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vC=vec4(0.);return;}
        vec3 dir=bDir.xyz;float ra=C.w*6.2832;dir.xz=mat2(cos(ra),-sin(ra),sin(ra),cos(ra))*dir.xz;sp=fract(sp+C.w*7.13);float mode=C.y;vec3 p;
        if(mode<.5){p=A.xyz+vec3(dir.x,dir.y*.6,dir.z)*C.z*(.3+sp)*(1.-pow(1.-age,2.));p.y-=age*age*2.2;}
        else if(mode<1.5){float a=6.2832*sp;p=A.xyz+vec3(cos(a),0.,sin(a))*C.z*(1.-pow(1.-age,3.));p.y+=dir.y*.15;}
        else if(mode<2.5){p=A.xyz+vec3(dir.x*.35,1.,dir.z*.35)*C.z*(.3+sp)*(1.-pow(1.-age,2.));}
        else{p=A.xyz+dir*C.z*(.2+sp)*(1.-pow(1.-age,2.));p.y-=age*.8;}
        p.y=max(p.y,.02);vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(B.w*uPx*22./max(.5,-mv.z)*(1.-age*.5),1.,14.);
        vC=vec4(B.rgb*(1.-age)*(mode<.5?1.6:1.2),1.);}`,fragmentShader:POINT_FS}));
  const burstPoints=new THREE.Points(burstPts.geometry,burstMat);burstPoints.frustumCulled=false;burstPoints.renderOrder=7;scene.add(burstPoints);
  // ---- Sky: a low moon in haze behind the city, thin stratus, sparse stars, the city's warm glow on the horizon ----
  const sky=new THREE.ShaderMaterial({uniforms:{...common,uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uAurora:{value:pal.valid.clone().lerp(pal.accent,.4)}},vertexShader:BACKGROUND_VS,depthWrite:false,depthTest:false,
    fragmentShader:`${NOISE}${FOG}${SKY}varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam,uAurora;uniform float uV;uniform vec4 uUnlock,uMood;
      void main(){vec4 p=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(p.xyz/p.w-uCam);float h=d.y;vec3 c=skyCol(d);
        float cl=0.;if(h>-.02&&h<.6){vec2 cp=d.xz/(max(h,0.)+.12);float n=fbm3(vec3(cp.x*.55+uV*.02,cp.y*.55+uV*.006,1.7));cl=smoothstep(.0,.45,n)*smoothstep(-.02,.08,h)*(1.-smoothstep(.25,.6,h));
          // The bank that crosses the moon (its twin in JavaScript dims the moonlight while it covers the disc).
          // Ragged edges: the bank's outline is warped by noise along the height, and broken inside.
          float sa=atan(d.z,d.x)-uMoonAz;sa=atan(sin(sa),cos(sa));float det=fbm3(vec3(sa*9.+uCloudT*1.3,h*26.,4.7));float warp=fbm3(vec3(h*18.,sa*4.+uCloudT*.4,9.1));
          cl=max(cl,moonBand(sa+warp*.16,h+warp*.025,uMoonDir.y)*smoothstep(-.3,.3,det+.12)*(.75+.25*det));}
        float m=max(dot(d,uMoonDir),0.);vec3 cloudC=uHorizon*.55+uMoonC*pow(m,8.)*.35;c=mix(c,cloudC,cl*.75);c+=uMoonC*pow(m,30.)*cl*.5;
        if(h>-.01&&h<.08){float az=atan(d.z,d.x);vec2 ad=vec2(cos(az),sin(az));
          float n1=1.-abs(fbm3(vec3(ad*7.,.7)));float n2=1.-abs(fbm3(vec3(ad*13.,4.1)));float r1=.004+.03*n1*n1*smoothstep(-.3,.5,fbm3(vec3(ad*2.,2.)));float r2=.002+.014*n2*n2;
          float m1=(1.-smoothstep(r1-.0015,r1+.0015,h)),m2=(1.-smoothstep(r2-.0012,r2+.0012,h));
          // Two ridges separated by haze: the far one pale and soft, the near one dark, each paling toward its foot.
          vec3 hz=hazeCol(d,0.);vec3 far=hz*mix(1.45,1.05,clamp(h/max(r1,1e-3),0.,1.)),near=hz*mix(.85,.38,clamp(h/max(r2,1e-3),0.,1.));c=mix(c,far,m1*.8);c=mix(c,near,m2*.92);cl*=1.-max(m1,m2);}
        vec2 sq=d.xz/(h+.3)*220.;vec2 sg=floor(sq);float st=fract(sin(dot(sg,vec2(12.9898,78.233)))*43758.5453);float sr=length(fract(sq)-.5-(vec2(fract(st*13.7),fract(st*71.3))-.5)*.5);
        float star=step(.9978,st)*smoothstep(.08,.35,h)*(1.-cl)*(.3+.3*sin(uV*.8+st*90.))*(1.-smoothstep(.04,.04+fwidth(sq.x)*1.2,sr));
        c+=vec3(.75,.82,1.)*star*.5;
        if(m>.9998){float disc=smoothstep(.999922,.999934,m);float rr=clamp((1.-m)/(1.-.999928),0.,1.);float mt=(.78+.22*gnoise(d*420.))*(.72+.28*sqrt(1.-rr*rr));
          c=mix(c,uMoonC*3.4*mt*(.35+.65*uMoonK),disc*(1.-cl*.5));}
        if(uUnlock.w>0.&&h>.04){float aur=uUnlock.w*smoothstep(.15,.6,fbm3(vec3(d.x*3.,d.y*8.-uV*.03,d.z*3.)))*smoothstep(.06,.3,h)*(1.-smoothstep(.45,.8,h));c+=uAurora*aur*.16;}
        gl_FragColor=vec4(c,1.);}`});
  // ---- Structure ----------------------------------------------------------------------------------------------------
  const districts=new Map(),towers=new Map();let builtVersion=-1,stoneCount=0,glowStatic=0,extent=8,tallest=1,quality=0;
  const centre=new THREE.Vector3();let orreryAt=null;
  const blocks=[];      // per stone instance: {kind, module, symbol, h, born, removed, stack (bool), ...}
  const towerBlocks=new Map(),districtBays=new Map();let bayList=[];
  const bridges=[],channels=[];
  function districtColor(d){return d.core?new THREE.Color('#f3e7cc'):new THREE.Color(DISTRICT_HUES[(d.order+DISTRICT_HUES.length*8-1)%DISTRICT_HUES.length]).lerp(pal.primary,.2).lerp(new THREE.Color('#e0b27a'),.45);}
  const greats=[],flyers=[],naves=[];
  function build(){
    const epoch=model.epoch;districts.clear();towers.clear();blocks.length=0;towerBlocks.clear();districtBays.clear();bridges.length=0;channels.length=0;greats.length=0;flyers.length=0;naves.length=0;
    const fu=floorU;let k=0;centre.set(0,0,0);let n=0;
    const rot=axisAz+Math.PI/SIDES;
    // Precincts: raw centroids first, then canals: each precinct is pushed out from the city's centre, so wide dark
    // mirror canals separate them (positions stay a pure function of the model's persisted plots).
    // (cathedral-layout.js: the same arithmetic the digital life's network is derived from)
    const offsets=new Map();
    for(const {d,members,c:cc,off:oo,ang,ex,ez,rx,rz} of precincts(model,LO)){
      const c=new THREE.Vector3(cc.x,0,cc.z);offsets.set(d.id,new THREE.Vector3(oo.x,0,oo.z));
      // Principal axis and extents: the foundation is an ellipse around the district's towers; the nave runs along it.
      const born=Math.min(...members.map(m=>m.born));const color=districtColor(d);
      const ds={d,centre:c,radius:Math.max(rx,rz),rx,rz,ex,ez,ang,color,ringColor:color.clone().multiplyScalar(.1),born,index:k,members,lit:0};districts.set(d.id,ds);
      if(k<DMAX){fu.uD.value[k].set(c.x,c.z,rx,rz);const perim=Math.PI*(3*(rx+rz)-Math.sqrt((3*rx+rz)*(rx+3*rz)));fu.uD2.value[k].set(-ang,secs(born,epoch),0,Math.max(12,Math.round(perim/.6)));fu.uDC.value[k].set(color.r,color.g,color.b,.3);}
      k++;centre.addScaledVector(c,Math.sqrt(members.length));n+=Math.sqrt(members.length);}
    for(;k<DMAX;k++)fu.uD.value[k].set(0,0,0,0);
    if(n)centre.multiplyScalar(1/n);
    const core=[...districts.values()].find(s=>s.d.core);orreryAt=core?core.centre.clone():centre.clone();
    extent=6;for(const s of districts.values())extent=Math.max(extent,s.centre.distanceTo(centre)+s.radius);
    common.uCentre.value.copy(centre);floorU.uScale.value=Math.max(1200,extent*60);
    floorU.uRose.value.set(orreryAt.x,orreryAt.z,core?Math.min(core.rx,core.rz)*.75:Math.max(2.2,extent*.12),floorU.uRose.value.w);
    common.uFogH.value=1.5+extent*.06;common.uMistH.value=.3+.01*extent;
    // Towers.
    const list=[],pins=[];
    const gothicLike=archName==='gothic'||archName==='spire';const stageN=archName==='spire'?4:3;const stepK=.05+.3*setback;
    // Hierarchy (cathedral-layout.js towerPlans): the few largest precinct landmarks become the city's grand spires (much
    // taller); in a large precinct the modules beyond its first few form a low, dense carpet of roofs (each still its own
    // building) beneath them. Mass: larger modules get taller storeys (log of their symbols), each landmark much taller.
    for(const {m,x:tx,z:tz,great,isGrand,carpet,shown,total,hk,R0,sd,grandK} of towerPlans(model,LO,offsets)){
      const dist=districts.get(m.group);if(!dist)continue;const p=new THREE.Vector3(tx,0,tz);
      const born=secs(m.born,epoch),removed=m.removed===null?1e6:secs(m.removed,epoch);
      const routes=[...m.symbols].map(id=>model.symbols.get(id)).filter(s=>s&&s.kind==='api.route');
      const delay=p.distanceTo(orreryAt)*.09;
      const tw={id:m.id,pos:p,color:dist.color,born:m.born,top:.3,roofTop:.6,district:m.group,R:R0,count:shown.length,blocks:[],great,grand:isGrand,carpet,delay,storeys:[]};towers.set(m.id,tw);
      const add=(b,pin=false)=>{b.module=m.id;b.test=m.test;b.x=p.x;b.z=p.z;b.rot=b.rot??rot;b.seed=rand(hash(m.id+(b.symbol||b.kind)+(b.j||0)));b.color=dist.color;b.pin=pin;b.frac=b.frac??0;(pin?pins:list).push(b);tw.blocks.push(b);return b;};
      add({kind:'plinth',stack:true,look:4,rB:R0*1.5,rT:R0*1.36,h:.24,born,removed,weld:-1e5});
      const N=shown.length;let prev=null;const rf=j=>Math.max(.55,1-stepK*Math.floor(j/stageN));
      shown.forEach((s,j)=>{const K=KINDS[s.kind];const st=Math.floor(j/stageN);const rb=R0*K.r*rf(j),rt=rb*(archName==='gothic'?.985:1);const sb=model.bornAt(s);
        // A setback: a cluster of pinnacles stands at the corners of the stage below.
        if(prev&&j%stageN===0&&archName!=='brutalist'&&!carpet){const rr=prev.rT*.96;for(let q=0;q<4;q++){const a=rot+(q+.5)/4*Math.PI*2+(SIDES===8?Math.PI/8:Math.PI/4);
          add({kind:'pinnacle',attach:'after',ref:prev,look:10,rB:.045+.01*st,rT:0,h:.2+.05*st,ox:Math.cos(a)*rr,oz:Math.sin(a)*rr,born,removed,weld:-1e5,j:100+j*4+q},true);
          if(gothicLike&&N>=6)for(const sgn of [-1,1]){const a2=a+sgn*.32;add({kind:'pinnacle',attach:'after',ref:prev,look:10,rB:.025,rT:0,h:.11+.02*st,ox:Math.cos(a2)*rr*.98,oz:Math.sin(a2)*rr*.98,born,removed,weld:-1e5,j:300+j*8+q*2+(sgn>0)},true);}}}
        prev=add({kind:'storey',stack:true,symbol:s.id,look:K.look,rB:rb,rT:rt,h:K.h*hk*(archName==='gothic'?1.2:archName==='spire'?1.28:1.05),born:Number.isFinite(sb)?secs(sb,epoch):sb===Infinity?1e6:-1e5,
          removed:s.removed===null?removed:secs(s.removed,epoch),weld:Number.isFinite(s.weldAt)?secs(s.weldAt,epoch):-1e5,j,frac:(j+.5)/Math.max(1,N)});tw.storeys.push(prev);});
      const extra=total-N;const topR=N?prev.rT:R0;
      if(extra>0)add({kind:'band',stack:true,look:9,rB:topR*.98,rT:topR*.94,h:Math.min(.9,.14*Math.log2(1+extra))*hk,born,removed,weld:-1e5,frac:1});
      if(!N&&extra<=0)add({kind:'storey',stack:true,look:3,rB:R0*.9,rT:R0*.86,h:.32,born,removed,weld:-1e5,chapel:true,frac:.5});
      // Roof by architecture. A precinct's great spire is an openwork lattice (drawn by the lattice mesh; its block
      // here only keeps the stack's height).
      const rTop=topR*(N?1:.88);
      const lattice=(GH)=>{const b=add({kind:'roof',stack:true,roof:true,look:5,rB:0,rT:0,h:GH,born,removed,weld:-1e5,hidden:true});greats.push({id:m.id,rB:rTop*1.02,block:b});};
      const GH=Math.max(rTop*2*(3+3.5*spireK),N*.5*hk)*(isGrand?1+.6*grandK:1);
      if(carpet)add({kind:'roof',stack:true,roof:true,look:5,rB:rTop*1.04,rT:0,h:rTop*(gothicLike?1.1+.6*spireK:.8),born,removed,weld:-1e5});
      else if(gothicLike){const H=rTop*2*(archName==='spire'?2.4+3.2*spireK:1.7+2.4*spireK)*(.6+.4*Math.min(1,N/6));
        if(great)lattice(GH);
        else if(N>=3){// An octagonal lantern stage, then the spire with a gablet on each face around its foot (Freiburg).
          const lan=add({kind:'crown',stack:true,roof:true,look:11,rB:rTop*.84,rT:rTop*.82,h:Math.max(.3,rTop*1.25)*hk,born,removed,weld:-1e5,j:7});
          add({kind:'gablet',attach:'after',ref:lan,look:14,rB:rTop*.92,rT:rTop*.92,h:rTop*1.5,ox:0,oz:0,born,removed,weld:-1e5,j:8});
          add({kind:'roof',stack:true,roof:true,look:5,rB:rTop*.66,rT:0,h:H*1.15,born,removed,weld:-1e5});}
        else add({kind:'roof',stack:true,roof:true,look:5,rB:rTop*(archName==='spire'?.85:.92),rT:0,h:H,born,removed,weld:-1e5});
        if(archName==='gothic'&&N>=2)for(let j=0;j<4;j++){const a=rot+(j+.5)/4*Math.PI*2+Math.PI/8;
          add({kind:'pinnacle',attach:'roof',look:12,rB:.055,rT:0,h:.32+.05*Math.min(4,N/2),ox:Math.cos(a)*rTop*1.02,oz:Math.sin(a)*rTop*1.02,born,removed,weld:-1e5,j:j+40},true);
          if(N>=4)for(const sgn of [-1,1]){const a2=a+sgn*.3;add({kind:'pinnacle',attach:'roof',look:12,rB:.03,rT:0,h:.16+.03*Math.min(4,N/2),ox:Math.cos(a2)*rTop*1.0,oz:Math.sin(a2)*rTop*1.0,born,removed,weld:-1e5,j:j*2+(sgn>0)+60},true);}}}
      else if(archName==='deco'){for(let q=0;q<3;q++)add({kind:'crown',stack:true,roof:true,look:7,rB:rTop*(.92-q*.2),rT:rTop*(.8-q*.2),h:.16,born,removed,weld:-1e5,j:q});
        // Deco keeps the cathedral's signifiers: pinnacles at the crown's corners, an openwork crown on the landmark.
        if(great)lattice(GH*.85);else add({kind:'roof',stack:true,roof:true,look:5,rB:rTop*.3,rT:0,h:rTop*2*(.8+1.6*spireK),born,removed,weld:-1e5});
        if(N>=3)for(let j=0;j<4;j++){const a=rot+(j+.5)/4*Math.PI*2+Math.PI/4;add({kind:'pinnacle',attach:'roof',look:12,rB:.045,rT:0,h:.3+.04*Math.min(4,N/2),ox:Math.cos(a)*rTop*.95,oz:Math.sin(a)*rTop*.95,born,removed,weld:-1e5,j:j+40},true);}}
      else{// Brutalist: a lantern band, a stepped ziggurat crown; the landmark carries an openwork crown of ribs.
        const ck=.35+.65*Math.min(1,N/6);if(N>=6||great)add({kind:'crown',stack:true,roof:true,look:11,rB:rTop*.86,rT:rTop*.86,h:.22*ck*hk,born,removed,weld:-1e5});
        const steps=great?3:N>=5?2:N>=3?1:0;for(let q=0;q<steps;q++)add({kind:'crown',stack:true,roof:true,look:7,rB:rTop*(1.02-q*.24),rT:rTop*(.96-q*.24),h:(.07+.05*ck)*(1-q*.15),born,removed,weld:-1e5,j:q+1});
        if(!steps)add({kind:'crown',stack:true,roof:true,look:8,rB:rTop*1.04,rT:rTop*1.0,h:.05,born,removed,weld:-1e5,j:1});
        if(great)lattice(GH*.8);else if(spireK>.75&&N>=5)add({kind:'roof',stack:true,roof:true,look:10,rB:.035,rT:.012,h:(.5+spireK*.9),born,removed,weld:-1e5});}
      // API routes: pinnacles around the roof's foot.
      routes.slice(0,8).forEach((s,j)=>{const a=rot+(j+.5)/Math.min(8,routes.length)*Math.PI*2;const sb=model.bornAt(s);
        add({kind:'pinnacle',attach:'roof',look:10,rB:.05,rT:0,h:.42+.12*(j%2),ox:Math.cos(a)*rTop*.92,oz:Math.sin(a)*rTop*.92,born:Number.isFinite(sb)?secs(sb,epoch):-1e5,removed:s.removed===null?removed:secs(s.removed,epoch),weld:-1e5,j},true);});
      // Gothic towers of five storeys and more may carry buttress piers with flying buttresses to the tower; brutalist
      // ones of three and more carry stepped columns on two sides along the precinct's axis (organ pipes).
      if(gothicLike&&N>=5&&!carpet&&sd<buttressK+.15){for(let j=0;j<4;j++){const a=rot+(j+.5)/4*Math.PI*2+(SIDES===8?Math.PI/8:0);const off=R0*1.9;
        const pier=add({kind:'buttress',attach:'base',look:13,rB:.12,rT:.09,h:1,frac:.3,ox:Math.cos(a)*off,oz:Math.sin(a)*off,born,removed,weld:-1e5,j});
        add({kind:'pinnacle',attach:'after',ref:pier,look:10,rB:.06,rT:0,h:.34,ox:Math.cos(a)*off,oz:Math.sin(a)*off,born,removed,weld:-1e5,j:j+20},true);
        flyers.push({tw,pier,a,off});}}
      if(archName==='brutalist'&&N>=3&&!carpet){const ax=dist.ang;for(const sgn of [-1,1])for(let q=0;q<3;q++){const off=R0*(1.12+.62*q)*sgn;
        add({kind:'buttress',attach:'base',look:13,rB:R0*.36,rT:R0*.34,h:1,frac:.82-.2*q,ox:Math.cos(ax)*off,oz:Math.sin(ax)*off,born,removed,weld:-1e5,j:q+(sgn>0?3:0),rot:ax+Math.PI/4},false);}}
      for(const b of tw.blocks)b.delay=delay;
    }
    // The great orrery turns at the city's largest tower.
    orreryTower=null;{let best=null,bs=-1;
      for(const tw of towers.values()){const m=model.modules.get(tw.id);if(m.removed!==null)continue;const n=symTotal(m);if(n>bs||n===bs&&tw.id<best){bs=n;best=tw.id;}}
      orreryTower=best;}
    // Naves: one hall per precinct along its axis (the precinct's lit share lights its windows each frame).
    for(const s of districts.values()){const len=Math.max(1.5,2*s.ex*.92+.5*S),wid=Math.min(.95*S,Math.max(.8,s.ez*1.1+.6));const wall=Math.min(1.05,.42+.12*Math.log2(1+s.members.length));
      const roof=archName==='brutalist'?.05:archName==='deco'?wid*.5:wid*.66;naves.push({s,len,wid,wall,roof,born:secs(s.born,epoch),seed:rand(hash(s.d.id+'n'))});}
    // Pinnacles along the naves' eaves at every buttress, and a finial on each gable.
    if(archName!=='brutalist')for(const v of naves){const nb=Math.max(2,Math.round(v.len/.46)),dx=Math.cos(v.s.ang),dz=Math.sin(v.s.ang),px=dz,pz=-dx;const nv={module:null,removed:1e6,weld:-1e5,color:v.s.color,frac:0,delay:0,rot};
      for(let q=0;q<=nb;q++){const z=-v.len/2+q*v.len/nb;for(const sg of [-1,1])pins.push({...nv,kind:'pinnacle',look:10,rB:.035,rT:0,h:.17+.04*(q%2),x:v.s.centre.x+px*sg*v.wid*.5+dx*z,z:v.s.centre.z+pz*sg*v.wid*.5+dz*z,y:v.wall,born:v.born+3.2,seed:rand(hash(v.s.d.id+'e'+q+sg))});}
      for(const sg of [-1,1])pins.push({...nv,kind:'pinnacle',look:10,rB:.05,rT:0,h:.32,x:v.s.centre.x+dx*sg*v.len*.5,z:v.s.centre.z+dz*sg*v.len*.5,y:v.wall+v.roof-.05,born:v.born+3.2,seed:rand(hash(v.s.d.id+'g'+sg))});}
    naveB.ensure(naves.length);naves.forEach((v,i)=>{naveB.write('nA',i,v.s.centre.x,v.s.centre.z,v.s.ang,v.born);naveB.write('nB',i,v.len,v.wid,v.wall,v.roof);naveB.write('nC',i,v.s.color.r,v.s.color.g,v.s.color.b,0);naveB.write('nD',i,-1e5,-1e5,0,v.seed);});naveB.commit(naves.length);
    // Cloister walls: a low wall of blind arcading around each foundation ellipse, raised bay by bay when founded.
    const solid=[],bays=[];
    for(const s of districts.values()){const perim=Math.PI*(3*(s.rx+s.rz)-Math.sqrt((3*s.rx+s.rz)*(s.rx+3*s.rz)));const np=Math.max(12,Math.round(perim/(.9*S))&~1);
      const ca=Math.cos(s.ang),sa=Math.sin(s.ang);const H=.055*S,born=secs(s.born,model.epoch);const pts=[];
      for(let j=0;j<np;j++){const a=j/np*Math.PI*2;const lx=Math.cos(a)*s.rx,lz=Math.sin(a)*s.rz;pts.push([s.centre.x+lx*ca-lz*sa,s.centre.z+lx*sa+lz*ca]);}
      for(let j=0;j<np;j++){const a=pts[j],b=pts[(j+1)%np];const chord=Math.hypot(a[0]-b[0],a[1]-b[1]);
        bays.push({x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,rot:Math.atan2(b[1]-a[1],b[0]-a[0]),born:born+j/np*2.4,span:chord+.03,h:H,c:s.color,order:(j+.5)/np,period:[16,12,24,8,32,20,28,10][s.index%8],phase:rand(hash(s.d.id+'c')),n:np,district:s.d.id,di:s.index});}
    }
    // Dependencies: channels inlaid in the floor inside a precinct; across precincts a thin cable of light slung between
    // two towers at staggered heights, one per pair of precincts, the most-linked pairs first (a few dozen at most).
    const {internal,bridges:bplans}=linkPlans(model,new Map([...towers.values()].map(tw=>[tw.id,tw.district])));
    const quiet=Math.min(1,3/Math.sqrt(internal.length+1)+.25);
    for(const l of internal){const a=towers.get(l.a),b=towers.get(l.b);const born=model.bornAt(l);
      channels.push({l,born:Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,removed:l.removed===null?1e6:secs(l.removed,epoch),k:.9*quiet,c:a.color.clone().lerp(b.color,.5)});}
    for(const {l,k:kk,ha,hb} of bplans){const born=model.bornAt(l);
      bridges.push({l,born:Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,removed:l.removed===null?1e6:secs(l.removed,epoch),k:kk,ha,hb});}
    // Write static instance data.
    stoneB.ensure(list.length);pinB.ensure(pins.length);
    const writeStatic=(B,b,i)=>{b.index=i;b.buf=B;B.write('iB',i,b.rB,b.rT,b.h,b.look);B.write('iL',i,b.born,b.removed,b.weld,b.seed);B.write('iA',i,b.x,b.z,b.y||0,b.rot);
      B.write('iS',i,1,1,-1e5,1);B.write('iF',i,-1e5,0,-1e5,0);B.write('iC',i,b.color.r,b.color.g,b.color.b,b.test?1:0);B.write('iT',i,b.frac,b.delay||0,b.y||0,0);blocks.push(b);if(!b.module)return;
      if(!towerBlocks.has(b.module))towerBlocks.set(b.module,[]);towerBlocks.get(b.module).push(b);};
    list.forEach((b,i)=>writeStatic(stoneB,b,i));pins.forEach((b,i)=>writeStatic(pinB,b,i));
    stoneCount=list.length;stoneB.commit(stoneCount);pinCount=pins.length;pinB.commit(pinCount);
    bayB.ensure(bays.length);bays.forEach((b,i)=>{bayB.write('aP',i,b.x,b.z,b.rot,b.born);bayB.write('aS',i,b.span,b.h,Math.min(DMAX-1,b.di),0);bayB.write('aC',i,b.c.r,b.c.g,b.c.b,1);bayB.write('aQ',i,b.order,b.period,b.phase,b.n);bayB.write('aF',i,-1e5,0,0,0);
      if(!districtBays.has(b.district))districtBays.set(b.district,[]);districtBays.get(b.district).push(i);});bayList=bays;bayCount=bays.length;bayB.commit(bayCount);
    glowB.ensure(channels.length+bridges.length+64);
    channels.forEach((x,i)=>{const a=towers.get(x.l.a),b=towers.get(x.l.b);glowB.write('kA',i,a.pos.x,.012,a.pos.z,.05);glowB.write('kB',i,b.pos.x,.012,b.pos.z,0);glowB.write('kInfo',i,x.born,x.removed,0,rand(hash(x.l.key)));glowB.write('kC',i,x.c.r,x.c.g,x.c.b,x.k);});
    bridges.forEach((x,j)=>{const i=channels.length+j;const a=towers.get(x.l.a).color,b=towers.get(x.l.b).color;const c=a.clone().lerp(b,.5).lerp(warm,.5);glowB.write('kInfo',i,x.born,x.removed,1,rand(hash(x.l.key)));glowB.write('kC',i,c.r,c.g,c.b,.75*x.k);});
    glowStatic=channels.length+bridges.length;
    tallCache=null;builtVersion=model.version;lastingSig='';applyFx();
  }
  let bayCount=0,pinCount=0,orreryTower=null,tallCache=null;
  // ---- Per frame: stacking (analytic, so a seek or a film reproduces it exactly), states, attachments ---------------
  const presence=(b,ts,sp)=>{const a=(ts-b.born)/sp;if(a<0)return 0;let x=Math.min(1,a/.7);x=x*x*(3-2*x);if(b.removed<1e5){const g=(ts-b.removed)/sp;if(g>0)x*=1-Math.min(1,g/1.1);}return x;};
  function restack(i){const ts=i.tsec,sp=ctx.speed();tallest=1;
    for(const tw of towers.values()){let y=0,roofBase=0,plinthTop=0;const m=model.modules.get(tw.id);
      for(const b of tw.blocks){if(!b.stack)continue;if(b.roof&&roofBase===0)roofBase=y;b.y=y;b.pr=presence(b,ts,sp);y+=b.h*b.pr;if(b.kind==='plinth')plinthTop=y;}
      tw.top=Math.max(.3,roofBase||y);tw.roofTop=y;tw.plinthTop=plinthTop;
      if(m&&model.alive(m,i.t))tallest=Math.max(tallest,tw.roofTop);
      for(const b of tw.blocks){const B=b.buf;if(b.stack){B.write('iA',b.index,b.x,b.z,b.y,b.rot);B.arrays.iT[b.index*4+2]=tw.roofTop;continue;}
        if(b.attach==='roof'){b.y=tw.top;}
        else if(b.attach==='base'){const H=Math.max(.5,(tw.top-plinthTop)*b.frac);b.y=plinthTop;B.arrays.iB[b.index*4+2]=H;b.hh=H;}
        else if(b.attach==='after'){const r=b.ref;b.y=r.y+(r.hh??r.h*(r.pr??1));}
        B.write('iA',b.index,b.x+b.ox,b.z+b.oz,b.y,b.rot);B.arrays.iT[b.index*4+2]=tw.roofTop;}
    }
    stoneB.dirty('iB');pinB.dirty('iB');stoneB.dirty('iT');pinB.dirty('iT');
  }
  // ---- Lasting transformations: rose windows and crowns of light from verified milestones (director.lasting()) -----
  let lastingSig='';const roses=new Map(),crowns=[],naveRose=new Map();
  function lasting(i){
    const list=[];for(const l of ctx.director.lasting()){if(l.first>i.t)continue;const later=l.times.filter(x=>x>i.t).length;const count=l.count-later;if(count>0)list.push({l,count});}
    const sig=list.map(x=>`${x.l.type}|${x.l.first}|${x.count}`).join(';')+`@${builtVersion}`;if(sig===lastingSig)return;lastingSig=sig;
    roses.clear();crowns.length=0;naveRose.clear();const byTower=new Map();
    for(const {l,count} of list){const ids=(l.subject?.fileIds||[]).concat(l.subject?.fileId?[l.subject.fileId]:[]).filter(id=>towers.has(id));if(!ids.length)continue;
      for(const id of ids){const at=secs(l.first,model.epoch);if(!roses.has(id)||roses.get(id)>at)roses.set(id,at);}
      // The crown goes to the covered precinct's great spire when it has one, else to the largest covered tower.
      let best=ids[0];const score=id=>{const tw=towers.get(id);return (tw.great?1000:0)+tw.count;};for(const id of ids)if(score(id)>score(best)||score(id)===score(best)&&id<best)best=id;
      const lastAt=secs(Math.max(...l.times.filter(x=>x<=i.t)),model.epoch);
      const c=byTower.get(best)||{id:best,level:0,at:secs(l.first,model.epoch),last:lastAt};c.level+=count;c.last=Math.max(c.last,lastAt);byTower.set(best,c);
      const d=towers.get(best).district;const nr=naveRose.get(d);if(!nr||nr.last<lastAt)naveRose.set(d,{first:Math.min(nr?.first??1e9,c.at),last:lastAt});}
    crowns.push(...byTower.values());
    for(const [id,list2] of towerBlocks){const at=roses.has(id)?roses.get(id):-1e5;const tw=towers.get(id);const top=tw.storeys.at(-1);
      const cl=byTower.get(id)?.level||0;for(const b of list2){const o=b.index*4;b.buf.arrays.iF[o+2]=at;b.buf.arrays.iF[o+3]=b===top?1:b.look===5?cl:0;}}
    stoneB.dirty('iF');pinB.dirty('iF');
    naves.forEach((v,k)=>{const r=naveRose.get(v.s.d.id);naveB.arrays.nD[k*4]=r?r.last:-1e5;});naveB.dirty('nD');
  }
  // ---- Transient effects per tower or district (cleared on a seek) -------------------------------------------------
  const fxTower=new Map(),fxDistrict=new Map();
  function applyFx(){for(const [id,f] of fxTower){const list2=towerBlocks.get(id);if(!list2)continue;for(const b of list2){const o=b.index*4;b.buf.arrays.iF[o]=f.at;b.buf.arrays.iF[o+1]=f.kind;}}
    for(const [id,f] of fxDistrict){const idx=districtBays.get(id);if(!idx)continue;for(const k of idx)bayB.write('aF',k,f.at,f.delay(bayList[k]),1,0);}stoneB.dirty('iF');pinB.dirty('iF');bayB.flush();}
  // ---- Agents: servitor drones with lanterns ------------------------------------------------------------------------
  const AGENT_COLORS=['#ffb0dc','#ffd28a','#9cf0c8','#a8b8ff','#ffb48c','#8ce4ff','#dcaaff','#c8f096'].map(c=>new THREE.Color(c));
  const agentPos=new Map();
  // Servitors fly below the skyline (the banners and chips above the city stay clear): around the tower an agent works
  // on at four fifths of its height, over their precinct while thinking, parked low at its edge while waiting.
  function orbitOf(a,i,out){const ph=rand(hash(a.id))*6.283;const home=a.home?towers.get(a.home):null,dist=home?districts.get(home.district):null;
    const waiting=a.display==='waiting'||a.display==='dormant';
    if(dist){const R=waiting?dist.radius+.5:dist.radius*.55,y=waiting?.55:Math.max(1.1,(dist.meanTop||1.5)*.8),sp=a.busy?.1:.03;
      return out.set(dist.centre.x+Math.cos(ph+i.tview*sp)*R,y+Math.sin(i.tview*.6+ph)*.08,dist.centre.z+Math.sin(ph+i.tview*sp)*R);}
    return out.set(centre.x+Math.cos(ph+i.tview*.04)*extent*.5,Math.max(1.2,tallest*.3),centre.z+Math.sin(ph+i.tview*.04)*extent*.5);}
  // ---- Effects --------------------------------------------------------------------------------------------------
  // Every effect is placed from its command alone (its time, its subject, the towers' heights at that time) and takes
  // the pool slot that frees first, with its spark pattern seeded by the command: replays and seeks reproduce it.
  let info={tsec:0,tview:0,t:0};const flashes=[];
  const at=cmd=>secs(cmd.at,model.epoch);
  const hgt={top:0,roofTop:0};
  function heightsAt(tw,ts){const sp=ctx.speed();let y=0,roofBase=0;for(const b of tw.blocks){if(!b.stack)continue;if(b.roof&&roofBase===0)roofBase=y;y+=b.h*presence(b,ts,sp);}hgt.top=Math.max(.3,roofBase||y);hgt.roofTop=y;return hgt;}
  function wave0(pos,color,t0,speed=4){const W=common.uWaves.value;let k=0;for(let j=1;j<4;j++)if(W[j].w<W[k].w)k=j;W[k].set(pos.x,0,pos.z,t0);common.uWaveC.value[k].set(color.r,color.g,color.b,speed);}
  function burst(pos,color,t0,key,{radius=1.4,duration=1.6,size=1,mode=0}={}){const A=burstU.uBA.value,C=burstU.uBC.value,sp=ctx.speed();let k=0,end=Infinity;
    for(let j=0;j<BURSTS;j++){const e=A[j].w+C[j].x*sp;if(e<end){end=e;k=j;}}
    A[k].set(pos.x,pos.y,pos.z,t0);burstU.uBB.value[k].set(color.r*1.5,color.g*1.5,color.b*1.5,size);C[k].set(duration,mode,radius,rand(hash(key)));}
  function flash(t0,a,kind=0){flashes.push({at:t0,amount:a,kind});flashes.sort((x,y)=>x.at-y.at);if(flashes.length>8)flashes.shift();}
  const topAt=(id,ts)=>{const tw=towers.get(id);if(!tw)return null;const h=heightsAt(tw,ts);return {pos:tw.pos.clone().setY(h.top),roofTop:h.roofTop,tw};};
  const lockRings=[],beamFx=[],haloFx=[],moments=[];
  const keep=(list,x,n)=>{list.push(x);list.sort((a,b)=>a.at-b.at);while(list.length>n)list.shift();};
  function towerFx(ids,t0,kind){for(const id of ids)if(towers.has(id))fxTower.set(id,{at:t0,kind});applyFx();}
  const MD=2.2;   // a milestone's own moment: its crown, lanterns and halo ignite this long after the run that verified it
  // The tower a milestone crowns: its precinct's great spire when it covers one, else its largest covered tower.
  function crownTower(ids){ids=ids.filter(id=>towers.has(id));if(!ids.length)return null;let best=ids[0];const score=id=>{const tw=towers.get(id);return (tw.great?1000:0)+tw.count;};
    for(const id of ids)if(score(id)>score(best)||score(id)===score(best)&&id<best)best=id;return best;}
  function effect(cmd,i){
    if(i)info=i;const s=cmd.subject||{},k=clamp(cmd.scale,0,1.6),ids=(s.fileIds||[]).slice(0,24),t0=at(cmd),sp=ctx.speed();
    if(model.version!==builtVersion)build();
    if(k<=.001)return;const kw=Math.min(1,k);const wave=(p,c,t,spd)=>wave0(p,c.clone().multiplyScalar(kw),t,spd);const key=`${cmd.at}|${cmd.intent}|${cmd.id??''}`;
    const white=new THREE.Color('#dfe9ff'),glow=warm.clone().lerp(new THREE.Color('#ffe2b8'),.3);
    switch(cmd.effect){
      case 'foundation':{const d=districts.get(s.groupId);if(d){wave(d.centre,d.color,t0,3.2);fxDistrict.set(d.d.id,{at:t0,kind:7,delay:b=>b.order*2.4});naveFx(d.d.id,t0+1.2*sp);applyFx();}break;}
      case 'raise':{const tw=towers.get(s.fileId);if(tw){wave(tw.pos,white.clone().multiplyScalar(.5),t0,2.4);burst(tw.pos.clone().setY(.05),white,t0,key,{radius:.9,duration:1.2,size:.9,mode:1});}break;}
      case 'storey':{const p=topAt(s.fileId,t0+.9*sp);if(p)burst(p.pos,white,t0+.9*sp,key,{radius:.6+.3*k,duration:.9,size:.9,mode:1});break;}
      case 'dismantle':{const p=topAt(s.fileId,t0);if(p)burst(p.pos,new THREE.Color(.45,.47,.52),t0,key,{radius:.9,duration:1.8,size:.9,mode:3});break;}
      case 'lock-mechanism':{const a=topAt(s.fileId,t0),b=topAt(s.targetId,t0);if(a&&b){const az=Math.atan2(b.pos.z-a.pos.z,b.pos.x-a.pos.x);
        keep(lockRings,{id:s.fileId,at:t0+2.2*sp,az,y:a.pos.y*.85},8);keep(lockRings,{id:s.targetId,at:t0+2.2*sp,az:az+Math.PI,y:b.pos.y*.85},8);
        if(cmd.tier>=2){wave(a.pos.clone().lerp(b.pos,.5),pal.highlight,t0+2.2*sp,3.5);flash(t0+2.2*sp,.05);}}break;}
      case 'stress-fracture':{towerFx(ids,t0,2);const red=pal.warning.clone().lerp(new THREE.Color('#ff4a1a'),.4);
        ids.slice(0,8).forEach((id,j)=>{const p=topAt(id,t0);if(p)burst(p.pos,red,t0,key+j,{radius:.8,duration:2.2,size:1.1,mode:0});});
        flash(t0,.5*k,1);break;}
      case 'window-scan':{towerFx(ids,t0,1);break;}
      case 'restore':{towerFx(ids,t0,3);ids.slice(0,10).forEach((id,j)=>{const tw=towers.get(id);if(!tw)return;const ts=t0+(.8+tw.delay)*sp;const p=topAt(id,ts);burst(p.pos,glow,ts,key+j,{radius:2.2,duration:2.8,size:1.9,mode:2});});
        if(ids.length)wave(orreryAt||centre,glow,t0,3.2);keep(beamFx,{at:t0+1.*sp,k:kw},4);flash(t0,.14*k);break;}
      case 'reassemble':case 'illumination':{towerFx(ids,t0,4);const big=cmd.tier>=4;const ct=crownTower(ids);
        ids.slice(0,12).forEach((id,j)=>{const tw=towers.get(id);if(!tw)return;const ts=t0+(MD+.6+tw.delay)*sp;const p=topAt(id,ts);burst(p.pos.setY(p.roofTop),GOLD,ts,key+j,{radius:big?3.4:2.4,duration:3.2,size:2,mode:2});});
        wave(ct?towers.get(ct).pos:(orreryAt||centre),GOLD.clone().multiplyScalar(2.2),t0+MD*sp,big?5:3.8);flash(t0+MD*sp,(big?.7:.4)*k,2);
        if(ct){keep(haloFx,{at:t0+(MD+.4)*sp,id:ct,k:kw},4);keep(moments,{at:t0+MD*sp,id:ct,k:kw},4);}break;}
      case 'set-in-stone':{towerFx(ids,t0,5);wave(orreryAt||centre,warm.clone().multiplyScalar(.5),t0,4);
        // The commit is a carillon beat: a ring of light runs once along every precinct's coping (and stays lit there
        // with the committed share) while the plinths' copings are struck.
        for(const d of districts.values())fxDistrict.set(d.d.id,{at:t0,kind:5,delay:b=>b.order*1.6});applyFx();break;}
      case 'district-lights':{const o=orreryAt||centre;for(const d of districts.values()){const dd=d.centre.distanceTo(o);fxDistrict.set(d.d.id,{at:t0,kind:7,delay:b=>dd*.12+b.order*1.2});naveFx(d.d.id,t0+dd*.12*sp);}applyFx();wave(o,warm,t0,5);break;}
      default:break;
    }
  }
  function naveFx(id,t){naves.forEach((v,k)=>{if(v.s.d.id===id)naveB.arrays.nD[k*4+1]=t;});naveB.dirty('nD');}
  // ---- Frame ----------------------------------------------------------------------------------------------------
  const workingSet=new Set(),seenSet=new Set(),crownMap=new Map();const NONE=[],haloLight=GOLD.clone().multiplyScalar(1.2);
  const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpV=new THREE.Vector3(),tmpN=new THREE.Vector3(),tmpC=new THREE.Color();
  const drones=Array.from({length:10},()=>({pos:null,c:null,a:0,ph:0,busy:false}));let nd=0;
  let li=0;const lamp=(x,y,z,r,g,b,size)=>{if(li>=LAMPS)return;lamps.write('position',li,x,y,z);lamps.write('aC',li,r,g,b,1);lamps.write('aS',li,size);li++;};
  function rebuild(){builtVersion=-1;}
  function tallOrder(){if(!tallCache){const fh=tw=>tw.blocks.reduce((a,b)=>a+(b.stack?b.h:0),0);tallCache=[...towers.values()].sort((a,b)=>fh(b)-fh(a)||(a.id<b.id?-1:1));}return tallCache;}
  // ---- The establishing view: the camera stands on the line from the moon through the city's great spire, outside
  // the city, low, with a long lens; the moon's elevation is set from that standpoint so the disc sits behind the
  // spire's upper third (a pure function of the city and the clock: seeks and films reproduce it).
  const estab={C:new THREE.Vector3(),T:new THREE.Vector3(),S:new THREE.Vector3(),fov:24,L:40,yaw:0,pitch:0,near:20};
  const camE=new THREE.Vector3();
  function establish(i){
    const C=cam,motion=i.overrides?.motion??1,aspect=Math.min(camera.aspect||16/9,2.4);
    const otw=orreryTower&&towers.get(orreryTower);const S=estab.S.copy(otw?otw.pos:(orreryAt||centre));
    const top=otw?otw.top:1,roofTop=otw?otw.roofTop:2;const hA=top+.6*Math.max(roofTop-top,.4);
    const mx=Math.cos(moonAz),mz=Math.sin(moonAz),px=-mz,pz=mx;
    let back=0,latMin=-1,latMax=1;
    // Only precincts standing now frame the view (a precinct whose every module was removed leaves no mark on it).
    for(const d of districts.values()){d.standing=d.members.some(m=>model.alive(m,i.t));}
    for(const d of districts.values()){if(!d.standing)continue;const dx=d.centre.x-S.x,dz=d.centre.z-S.z;back=Math.max(back,-(dx*mx+dz*mz)+d.radius);const lat=dx*px+dz*pz;latMin=Math.min(latMin,lat-d.radius);latMax=Math.max(latMax,lat+d.radius);}
    const lens=Math.sqrt(34/clamp(C.fov||34,20,60))*(C.distance||1);
    let tallTop=2;for(const tw of tallOrder().slice(0,4))tallTop=Math.max(tallTop,tw.roofTop);
    const L0=Math.max(back+2+extent*.3,extent*3.1*lens,tallTop*4.6*lens,32);
    const e0=clamp(((C.elevation??.4)-.15)/.65);const Cy0=Math.max(.45,L0*Math.tan(.022+.04*e0+.045*smooth((extent-16)/45)));
    // The moon's elevation from the undisturbed standpoint (the idle sway and glide then move the spire across it).
    moonEl=clamp(Math.atan2(hA-Cy0,L0),.035,.2);moonDir.set(Math.cos(moonAz)*Math.cos(moonEl),Math.sin(moonEl),Math.sin(moonAz)*Math.cos(moonEl));
    const proc=C.personality!=='architectural',tv=i.tview;
    // Idle: a slow sideways sway (the spire slides across the moon) and, for the procession, a slow glide in and back.
    const sway=Math.sin(tv/130+moonPh)*(.4+.8*driftK)*.009*L0*motion;
    const glide=proc&&i.phase==='idle'?.16*smooth(.5-.5*Math.cos(tv*Math.PI*2/170))*motion:0;
    const L=L0*(1-glide)*(proc?1+.03*Math.sin(tv/97)*motion:1);const Cy=Cy0*(1-glide*.6)*(proc?1:1+.08*Math.sin(tv/83)*motion);
    const Cp=estab.C.set(S.x-mx*L+px*sway,Cy,S.z-mz*L+pz*sway);
    // Frame: the city's angular width (horizontal), from the spires' tops with headroom down to a band of reflection.
    let aMin=Infinity,aMax=-Infinity,aTop=moonEl+.03,near=Infinity;
    for(const d of districts.values()){if(!d.standing)continue;const dx=d.centre.x-Cp.x,dz=d.centre.z-Cp.z,dist=Math.max(1,Math.hypot(dx,dz));let a=Math.atan2(dz,dx)-moonAz;a=Math.atan2(Math.sin(a),Math.cos(a));
      const w=Math.asin(Math.min(.95,d.radius/dist));aMin=Math.min(aMin,a-w);aMax=Math.max(aMax,a+w);near=Math.min(near,Math.max(1,dist-d.radius));}
    for(const tw of tallOrder().slice(0,8)){const dist=Math.max(1,Math.hypot(tw.pos.x-Cp.x,tw.pos.z-Cp.z));aTop=Math.max(aTop,Math.atan2(tw.roofTop-Cy,dist));}
    if(!Number.isFinite(aMin)){aMin=-.3;aMax=.3;near=10;}
    let hf=(aMax-aMin)*1.06;let aim=(aMin+aMax)/2;const lim=.22*hf;aim=clamp(aim,-lim,lim);hf=Math.max(hf,2*Math.max(aim-aMin,aMax-aim)*1.04);
    const aBot=-(Math.atan2(Cy,near)+.38*Math.max(aTop,.05));
    const vNeed=(aTop-aBot)/.9,vH=2*Math.atan(Math.tan(hf/2)/aspect);let vf=clamp(Math.max(vNeed,Math.min(vH,vNeed*1.4)),.16,.95);
    // A wide, low city is cropped at the sides rather than left floating in empty water.
    const pitchTop=aTop+.08*vf-vf/2,pitchMid=(aTop+aBot)/2;const pitch=vf>vNeed*1.02?lerp(pitchTop,Math.min(pitchMid,pitchTop),.4):pitchMid;
    // With room to spare across the frame, centre the city (the moon need only stay well inside the frame).
    {const hfa=2*Math.atan(Math.tan(vf/2)*aspect);if(hfa>hf*1.02){const mid=(aMin+aMax)/2;aim=clamp(mid,-.36*hfa,.36*hfa);}}
    estab.yaw=moonAz+aim;estab.pitch=pitch;estab.fov=THREE.MathUtils.radToDeg(vf);estab.L=L;estab.near=near;
    camE.set(Math.cos(estab.yaw)*Math.cos(pitch),Math.sin(pitch),Math.sin(estab.yaw)*Math.cos(pitch));estab.T.copy(Cp).addScaledVector(camE,L);
    // Haze from the near city outward (aerial perspective) and a ground mist scaled to the view's depth.
    common.uFogS.value=Math.max(0,L-extent*.7);common.uFogD.value=(.3+.35*fogK)/Math.max(8,extent);common.uMistD.value=(5.4+4.8*fogK)/Math.max(48,L);common.uMistC.value.set(centre.x,centre.z,extent*1.05);
    moteMat.uniforms.uBox.value.set(lerp(Cp.x,S.x,.45),lerp(Cp.z,S.z,.45),Math.max(10,L*.7),Math.max(3,Cy*2.2));}
  function update(i){
    info=i;const epoch=model.epoch,sp=ctx.speed();quality=i.quality||0;
    const tempo=i.mood?.tempo||92,bars=i.tview*tempo/240;
    common.uT.value=i.tsec;common.uV.value=i.tview;common.uSpeed.value=sp;common.uBeat.value=i.beat*(G.music?.beatPulse??.4)*.5;common.uActivity.value=i.activity;common.uBars.value=bars;
    common.uPx.value=Math.max(.5,ctx.pipeline.size[1]/1080);common.uRes.value.set(ctx.pipeline.size[0],ctx.pipeline.size[1]);
    // Ambient weather: mist banks drifting with the wind, cloud shadows passing, the moon slipping behind cloud and out
    // again on a slow period, drips on the wet stone (all from the view clock: honest ambient life, never an event).
    // A cloud bank crosses the moon every half minute or so: the moonlight (rays, rims, glitter) dims while it passes.
    const tv=i.tview,wind=.6+turbK;common.uMistO.value.set(tv*.014*wind,tv*.006*wind);common.uCloudO.value.set(tv*.007*wind,tv*.0035*wind);
    const cloudT=tv*(.1+.1*turbK)+moonPh;common.uCloudT.value=cloudT;common.uMoonK.value=1-.72*moonCloud(cloudT);
    common.uRain.value=(weather==='night-fog'?.45:weather==='steam'?.3:.18)*(.5+wetK);
    const section=i.mood?.section||'home';common.uMood.value.set(section==='breath'?.85:section==='lift'||section==='resolve'?1.08:1,0,0,0);
    if(model.version!==builtVersion)build();
    restack(i);lasting(i);establish(i);
    const unl=i.unlocks.map(u=>u.level||0);
    // Precincts: foundations laid when founded; the nave's windows light with the share of validated work; a failing
    // precinct's surroundings turn cold (from its stressed state, as long as it lasts).
    let cx=0,cz=0,cn=0;
    for(const s of districts.values()){let lit=0,n=0,tops=0;
      for(const m of s.members){if(!model.alive(m,i.t)||m.removed!==null&&m.removed<=i.t)continue;n++;const st=model.stateAt(m,i.t);lit+=st==='validated'?1:st==='committed'?.35:0;tops+=towers.get(m.id)?.top||0;
        if(st==='stressed'){const tw=towers.get(m.id);if(tw){cx+=tw.pos.x;cz+=tw.pos.z;cn++;}}}
      s.lit=n?lit/n:0;s.meanTop=n?tops/n:1;if(s.index<DMAX){floorU.uDC.value[s.index].w=.3+.2*i.activity;floorU.uD2.value[s.index].z=s.lit;bayMat.uniforms.uDLit.value[s.index]=s.lit;}}
    naves.forEach((v,k)=>{naveB.arrays.nC[k*4+3]=v.s.lit;});naveB.dirty('nC');naveB.flush();
    if(cn){const cold=common.uCold.value;cold.set(cx/cn,cz/cn,3+Math.sqrt(cn)*1.6,Math.min(.85,.45+.08*cn));}else common.uCold.value.w=0;
    floorU.uRose.value.w=unl[1]*.6+.25;
    // States per tower (with the time of the last change), the last human edit and agent work.
    const working=workingSet;working.clear();for(const a of i.agents)if(a.fileId&&a.display==='tool')working.add(a.fileId);
    for(const [id,list2] of towerBlocks){const m=model.modules.get(id);if(!m)continue;let cur=m.initial,prev=m.initial,t0=-1e5;for(const e of m.states){if(e.at>i.t)break;prev=cur;cur=e.state;t0=secs(e.at,epoch);}
      const hum=Number.isFinite(m.lastHuman)&&m.lastHuman<=i.t?(i.t-m.lastHuman)/1000/sp:working.has(id)?.6:1e3;
      const s0=STATE_INDEX[cur]??1,s1=STATE_INDEX[prev]??1,hv=working.has(id)?Math.min(hum,.6):hum;for(const b of list2)b.buf.write('iS',b.index,s0,s1,t0,hv);}
    stoneB.flush();pinB.flush();
    // Flying buttresses: from each pier's pinnacle up to the tower wall (solid stone arches).
    let fi=0;solidB.ensure(flyers.length);
    for(const f of flyers){const tw=f.tw,p=f.pier;if(!p.hh)continue;const ca=Math.cos(f.a),sa=Math.sin(f.a);const y0=p.y+p.hh+.2,y1=Math.min(tw.top-.1,y0+(tw.top-y0)*.3+.2);const rw=tw.R*.95;
      solidB.write('kA',fi,tw.pos.x+ca*f.off,y0,tw.pos.z+sa*f.off,.07);solidB.write('kB',fi,tw.pos.x+ca*rw,y1,tw.pos.z+sa*rw,(f.off-rw)*.5+.05);
      solidB.write('kInfo',fi,-1e5,1e6,2,0);solidB.write('kC',fi,0,0,0,0);fi++;}
    solidB.commit(fi);
    // Cables between precincts: endpoints at staggered heights, sagging; extended when the link was made.
    let gi=channels.length;
    for(const x of bridges){const a=towers.get(x.l.a),b=towers.get(x.l.b);const ya=Math.max(.8,a.top*(.62+.4*x.ha)),yb=Math.max(.8,b.top*(.62+.4*x.hb));const d=a.pos.distanceTo(b.pos);
      glowB.write('kA',gi,a.pos.x,ya,a.pos.z,.05*Math.max(1,estab.L/28));glowB.write('kB',gi,b.pos.x,yb,b.pos.z,d*.06);gi++;}
    gi=glowStatic;glowB.ensure(glowStatic+16);
    // Agents: servitors with lanterns; while one works on a tower it circles it at four fifths of its height, beaming
    // onto it and casting a warm pool of light on the facade.
    li=0;nd=0;const MAX_AGENTS=10;const seen=seenSet;seen.clear();let na=0;for(const v of common.uAgentL.value)v.w=0;
    for(const a of i.agents.slice(0,MAX_AGENTS)){seen.add(a.id);const orbit=orbitOf(a,i,tmpA);const tw=a.fileId?towers.get(a.fileId):null;const blend=smooth(Math.min(1,(a.since||0)/1000/sp/1.6));
      const work=tw&&a.display==='tool';
      if(work){const ph=rand(hash(a.id+'h'))*6.283+i.tview*.18;const rr=tw.R*2.2+.45;tmpB.set(tw.pos.x+Math.cos(ph)*rr,Math.max(.7,tw.top*.8)+Math.sin(i.tview*.9)*.05,tw.pos.z+Math.sin(ph)*rr);orbit.lerp(tmpB,blend);}
      let pos=agentPos.get(a.id);if(!pos){pos=new THREE.Vector3();agentPos.set(a.id,pos);}pos.copy(orbit);
      const c=AGENT_COLORS[a.voice%8],alpha=a.alpha*(a.busy?1:.45)*(G.agentProminence??.8);
      lamp(pos.x,pos.y,pos.z,c.r*1.1*alpha,c.g*1.*alpha,c.b*.9*alpha,5);const dr=drones[nd++];dr.pos=pos;dr.c=c;dr.a=alpha;dr.ph=rand(hash(a.id))*6.283;dr.busy=a.busy;
      if(na<4){const L=common.uAgentL.value[na],C=common.uAgentC.value[na];L.set(pos.x,pos.y,pos.z,(work?1.1*blend:.25)*alpha);C.set(c.r*.6+warm.r*.4,c.g*.6+warm.g*.4,c.b*.6+warm.b*.4);na++;}
      if(work&&gi<glowB.capacity){glowB.write('kA',gi,pos.x,pos.y-.05,pos.z,.22);glowB.write('kB',gi,tw.pos.x,pos.y-.25,tw.pos.z,0);glowB.write('kInfo',gi,-1e5,1e6,3,rand(hash(a.id)));
        glowB.write('kC',gi,c.r,c.g,c.b,.6*alpha*blend);gi++;}}
    for(const id of agentPos.keys())if(!seen.has(id))agentPos.delete(id);
    glowB.commit(gi);
    // Beacons (unlock 2) on the tallest spires, breathing on the bars.
    const tall=unl[0]>0||unl[2]>0?tallOrder():NONE;let tl=0;const beacons=Math.round((3+6*beaconK)*unl[2]);
    for(const tw of tall){if(tl>=Math.max(beacons,2))break;if(!model.alive(model.modules.get(tw.id),i.t))continue;tw.rank=tl++;
      if(tw.rank<beacons){const b=.5+.5*Math.sin(Math.PI*2*(bars/4+tw.rank*.17));lamp(tw.pos.x,tw.roofTop+.05,tw.pos.z,1.1*b,.95*b,.75*b,.8);}}
    // Failing towers: a slow red warning light on the crown (mirrored in the floor).
    for(const tw of towers.values()){const m=model.modules.get(tw.id);if(!m||!model.alive(m,i.t))continue;if(model.stateAt(m,i.t)!=='stressed')continue;const b=.55+.45*Math.sin(i.tview*1.6+rand(hash(tw.id))*6);
      lamp(tw.pos.x,tw.roofTop+.08,tw.pos.z,pal.warning.r*2.6*b,pal.warning.g*.8*b,pal.warning.b*.7*b,2.6);if(li>=LAMPS-14)break;}
    // Openwork spires (precincts' great spires) and crowns of light (lasting): cages of lit ribs.
    let lc=0;latB.ensure(greats.length+crowns.length);const crownOf=crownMap;crownOf.clear();for(const c of crowns)crownOf.set(c.id,c);
    for(const g of greats){const tw=towers.get(g.id);const H=tw.roofTop-tw.top;if(H<.02)continue;const c=crownOf.get(g.id);
      latB.write('lA',lc,tw.pos.x,tw.pos.z,tw.top,0);latB.write('lB',lc,g.rB,H,0,axisAz+Math.PI/SIDES);latB.write('lC',lc,c?c.level:0,c?c.at+MD*sp:-1e5,unl[2],c?c.last+MD*sp:-1e5);lc++;}
    for(const c of crowns){const tw=towers.get(c.id);if(!tw||tw.great)continue;const H=Math.max(.8,(tw.roofTop-tw.top)*1.06);
      latB.write('lA',lc,tw.pos.x,tw.pos.z,tw.top,0);latB.write('lB',lc,tw.R*1.25,H,0,axisAz+Math.PI/SIDES);latB.write('lC',lc,c.level,c.at+MD*sp,unl[2],c.last+MD*sp);lc++;}
    latB.commit(lc);
    const otw=orreryTower&&towers.get(orreryTower),om=otw&&model.modules.get(otw.id);const oAge=om?(i.t-om.born)/1000/sp:-1;const o=otw?otw.pos:(orreryAt||centre);const lanternY=orreryY();
    // Rings: the great orrery (three nested rings sharing one slow tilt, each precessing a third of a turn apart, beads
    // of light ticking round them on the bars), the carillon (a peal climbing the great spire every sixteen bars), the
    // crowns' halos (lasting; tilted toward the view and precessing, so their motion reads from a low camera) and lock
    // clamps closing. A ring turning in its own plane cannot be seen: motion comes from precession and beads.
    let ri=0;const R=tmpA,U=tmpB,Vv=tmpV,Nn=tmpN;
    const ring=(c,radius,thick,u,v,kind,alpha,color)=>{if(ri>=ringB.capacity)ringB.ensure(ri+16);ringB.write('rC',ri,c.x,c.y,c.z,radius);ringB.write('rU',ri,u.x,u.y,u.z,thick);ringB.write('rV',ri,v.x,v.y,v.z,color.g);ringB.write('rK',ri,kind,alpha,color.r,color.b);ri++;};
    const tick=(b,period,mode)=>{const x=b/period;if(!mode)return x*Math.PI*2;const n=Math.floor(b),f=b-n;return (n+smooth(Math.min(1,f/.35)))/period*Math.PI*2;};
    // A ring's plane from its normal: tilted from the vertical by `tilt` toward horizontal azimuth `az`.
    const orientN=(tilt,az,u,v)=>{const st=Math.sin(tilt),ct=Math.cos(tilt);Nn.set(Math.cos(az)*st,ct,Math.sin(az)*st);u.set(-Math.sin(az),0,Math.cos(az));v.crossVectors(Nn,u);};
    const camAz=(x,z)=>Math.atan2(estab.C.z-z,estab.C.x-x);
    const dl=dList();const baseR=otw?otw.R*3.4:1;
    const mechB=mechSpeed*(.6+.4*mechK);let realign=0;for(const f of fxTower.values())if(f.kind===3){const ag=(i.tsec-f.at)/sp;if(ag>0&&ag<6)realign=Math.max(realign,smooth(ag/1.4)*(1-smooth((ag-3.5)/2.5)));}
    if(otw&&oAge>0){const towardCam=camAz(o.x,o.z);const tilt=(.36+.06*Math.sin(tick(bars,64/mechB,0)))*(1-realign);
      for(let k=0;k<Math.min(3,Math.max(1,dl.length));k++){const s=dl[k]||null;const age=s?(i.tsec-secs(s.born,epoch))/sp:oAge;const al=clamp(age/3)*clamp(oAge/3);if(al<=0)continue;
        const period=[16,24,12][k]/mechB;const az=towardCam+tick(bars,period*4,0)*(k%2?-1:1)+k*2.094;orientN(tilt*(1-.12*k),az*(1-realign)+towardCam*realign,U,Vv);
        R.set(o.x,lanternY,o.z);const rad=baseR*(.75+.2*k);ring(R,rad,.016+.004*(k%2),U,Vv,0,al,(s||districts.values().next().value).ringColor);
        const lk=(.5+.6*mechK)*al*(.7+.5*unl[1]);const col=s?s.color:warm;
        for(let q=0;q<3;q++){const th=tick(bars,period*.5,1)*(k%2?-1:1)+k*.9+q*2.094;const cth=Math.cos(th)*rad,sth=Math.sin(th)*rad;
          lamp(R.x+U.x*cth+Vv.x*sth,R.y+U.y*cth+Vv.y*sth,R.z+U.z*cth+Vv.z*sth,(col.r*.4+.6*warm.r)*lk,(col.g*.4+.6*warm.g)*lk,(col.b*.4+.6*warm.b)*lk,(q?9:13)*Math.sqrt(estab.L/40));}}}
    // The carillon: every sixteen bars a peal of light climbs the great spire's rings, and a brass ring rises with it.
    common.uCarillon.value.set(0,0,0,0);
    if(otw&&oAge>3){const g=greats.find(x=>x.id===otw.id);const H=otw.roofTop-otw.top;const ph=(bars%16)/4;if(ph<1&&H>.5){const f=.06+.84*smooth(ph);const y=otw.top+H*f;const env=Math.sin(Math.PI*ph)*(.5+.5*mechK);
      common.uCarillon.value.set(f,env*1.6,0,0);const rr=(g?g.rB:otw.R)*Math.pow(1-f,1.12)*1.6+.08;
      orientN(.26,camAz(o.x,o.z),U,Vv);R.set(o.x,y,o.z);tmpC.copy(moonC).lerp(warm,.4).multiplyScalar(1.1*env);ring(R,rr,.022,U,Vv,1,1,tmpC);}}
    for(const c of crowns){const tw=towers.get(c.id);if(!tw)continue;const age=(i.tsec-c.at)/sp-MD;const al=clamp(age/2.5);if(al<=0)continue;const nq=Math.min(4,c.level+1);const ca=camAz(tw.pos.x,tw.pos.z);
      const hold=1+1.2*clamp(1-(age-18)/8)*clamp(age/2);
      for(let q=0;q<nq;q++){const f=.14+q*.18;orientN(.5+.06*q,ca+.7*Math.sin(tick(bars,(16+q*8)/mechB,0)+q*2.1),U,Vv);R.set(tw.pos.x,tw.top+(tw.roofTop-tw.top)*f,tw.pos.z);
        ring(R,tw.R*(3.4-2.2*f)*(1+.22*q),.016,U,Vv,1,al*.85,tmpC.copy(haloLight).multiplyScalar(hold));}}
    // A milestone's halo: a great ring blooming out through the haze from the crowned spire, tilted toward the view.
    for(const h of haloFx){const ag=(i.tsec-h.at)/sp;if(ag<0||ag>7)continue;const tw=towers.get(h.id);if(!tw)continue;const e=1-Math.pow(1-clamp(ag/6),3);
      orientN(.55,camAz(tw.pos.x,tw.pos.z),U,Vv);R.set(tw.pos.x,tw.top+(tw.roofTop-tw.top)*.3,tw.pos.z);tmpC.copy(GOLD).multiplyScalar(4*h.k*Math.pow(1-e,1.6));ring(R,tw.R*(1.6+14*e),.04,U,Vv,1,1,tmpC);
      if(ag>.5){const e2=1-Math.pow(1-clamp((ag-.5)/6),3);tmpC.copy(GOLD).multiplyScalar(2.4*h.k*Math.pow(1-e2,1.6));ring(R,tw.R*(1.4+9*e2),.025,U,Vv,1,1,tmpC);}}
    // Servitors: a lantern inside two brass rings precessing about it (faster while the agent works).
    for(let k=0;k<nd;k++){const d=drones[k];const sp2=i.tview*(d.busy?1.4:.35)+d.ph;tmpC.copy(d.c).multiplyScalar(.5*d.a);
      orientN(1.05,sp2,U,Vv);ring(d.pos,.62,.022,U,Vv,1,1,tmpC);orientN(1.05,-sp2*.8+1.6,U,Vv);ring(d.pos,.5,.018,U,Vv,1,1,tmpC);}
    // Lock clamps: a ring drops onto each end of the new bridge, closing from wide and steep to tight and level.
    for(const L of lockRings){const tw=towers.get(L.id);if(!tw)continue;const ag=(i.tsec-L.at)/sp;if(ag<0||ag>5)continue;const e=1-Math.pow(1-clamp(ag/1.1),3);
      orientN(1.2*(1-e),L.az,U,Vv);R.set(tw.pos.x,Math.max(.6,L.y),tw.pos.z);tmpC.copy(pal.highlight).multiplyScalar(1.6*Math.exp(-Math.max(0,ag-1.1)*.8));ring(R,tw.R*(1.25+2.2*(1-e)),.035,U,Vv,1,1-ag/5,tmpC);}
    ringB.commit(ri);lamps.commit(li);
    // Beams: searchlights (after the searchlights unlock) and the recovery beam.
    let bi=0;
    if(unl[0]>0&&quality<3)for(const tw of tall){if(tw.rank===undefined||tw.rank>1)continue;const k=tw.rank;const a=i.tview*.09*(k?-1:1)+k*2.1+rand(seed)*6;tmpB.set(Math.cos(a)*.35,1,Math.sin(a)*.35).normalize();
      beamB.write('bP',bi,tw.pos.x,tw.roofTop,tw.pos.z,.18);beamB.write('bD',bi,tmpB.x,tmpB.y,tmpB.z,60);const s2=.05*unl[0]*(.4+.6*searchK);beamB.write('bC',bi,warm.r*s2,warm.g*s2,warm.b*s2,.6);bi++;}
    // Recovery: a warm beam rises through the great openwork spire into the haze and fades.
    for(const f of beamFx){const ag=(i.tsec-f.at)/sp;if(ag<0||ag>8||!otw)continue;const e=smooth(ag/1.2)*(1-smooth((ag-3.5)/4.5));beamB.write('bP',bi,o.x,otw.top,o.z,.3);beamB.write('bD',bi,0,1,0,Math.max(4,(otw.roofTop-otw.top)*1.7));
      const s2=e*2.6*f.k;beamB.write('bC',bi,warm.r*s2,warm.g*s2*.92,warm.b*s2*.8,.08);bi++;}
    beamB.commit(bi);
    moteMat.uniforms.uCount.value=Math.round(MOTES*(quality>=2?.5:1));
    common.uUnlock.value.set(unl[0]||0,unl[1]||0,unl[2]||0,unl[3]||0);
    if(life)life.update(i);
  }
  // ---- Digital life: the city's inhabitants (simulated: never labelled, never agents) ---------------------------------
  // Small lanterns running the cathedral's routes (life/cathedral.js): a bright core in a soft halo (couriers the largest,
  // sparks the smallest), a light trail behind each and, behind a travelling courier or spark, a comet of fading points
  // along its own recorded path. Couriers sodium-warm, wardens a warm pale gold, sparks gold-white. What an inhabitant
  // is doing sets its brightness (travelling brightest, waiting and lingering dim), so the streams read over the
  // pottering; near a failure the lanterns cool and dim. Followers (by quality) run on their leader's own path.
  // Depth-tested (the towers hide them), fogged like the lamps and mirrored in the wet floor. Without ctx.life nothing
  // here exists.
  const life=LIFE?(()=>{
    const grammar=createCathedralGrammar({genome:G,axisAz}),driver=ctx.life.create(grammar);
    const spec=grammar.ecosystem({},0),CAPN=spec.capacity,FMAX=2,TK=spec.trail,PN=CAPN*9;   // (leaders, followers and comet points: bounded, checked)
    const pts=pointBuffers({aC:4,aS:3},PN),segs=pointBuffers({aC:4},CAPN*(TK-1)*2);
    // aS: world size, smallest size on screen (px), halo (0..1). aC.a: 1, or above 1 for a lantern on its way along a
    // route (ecology 2's selective glow).
    // Ecology 2 (uLifeE 1; 0 is exactly the drawing before): far from the camera a lantern keeps a slightly larger
    // floor and a wider, softer core with less halo (a small clear light, never a neon disc), and the ones travelling
    // the routes cut through the fog a little more, so inhabitants and their routes read at a distance.
    const LIFE_VS=`${FOG}attribute vec4 aC;attribute vec3 aS;uniform float uPx,uLifeE;varying vec4 vC;varying float vH,vF;void main(){vec3 p=position;p.y*=uMirror;vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      float far=uLifeE*smoothstep(28.,110.,-mv.z),sel=uLifeE*max(0.,aC.a-1.)*far;
      gl_PointSize=clamp(aS.x*uPx*210./max(.5,-mv.z),aS.y*uPx*(1.+.3*far),18.*uPx);vH=aS.z;vF=far;vC=vec4(aC.rgb*(1.-fogAmt(p)*.65*(1.-.5*sel))*(1.+.5*sel),min(aC.a,1.));}`;
    const LIFE_FS=`varying vec4 vC;varying float vH,vF;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;
      float core=exp(-r*mix(5.,40.,vH)*(1.-.45*vF))*(1.+1.4*vH)*(1.-.3*vF),halo=exp(-r*4.)*(1.-r)*.7*vH*(1.-.35*vF);gl_FragColor=vec4(vC.rgb*(core+halo)*vC.a,0.);}`;
    const lifeE={value:0},ptMat=additive(new THREE.ShaderMaterial({uniforms:{...common,uLifeE:lifeE},vertexShader:LIFE_VS,fragmentShader:LIFE_FS}));
    const segMat=additive(new THREE.ShaderMaterial({uniforms:{...common},vertexShader:`${FOG}attribute vec4 aC;varying vec4 vC;void main(){vec3 p=position;p.y*=uMirror;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);vC=vec4(aC.rgb*aC.a*(1.-fogAmt(p)*.8),1.);}`,
      fragmentShader:`varying vec4 vC;void main(){gl_FragColor=vec4(vC.rgb,0.);}`}));
    const points=new THREE.Points(pts.geometry,ptMat),lines=new THREE.LineSegments(segs.geometry,segMat);
    for(const o of [points,lines]){o.frustumCulled=false;o.renderOrder=6;scene.add(o);}
    const pointsM=new THREE.Points(pts.geometry,ptMat),linesM=new THREE.LineSegments(segs.geometry,segMat);for(const o of [pointsM,linesM]){o.frustumCulled=false;mirror.add(o);}
    const COL=[warm.clone().lerp(new THREE.Color('#ffd9a0'),.25).multiplyScalar(2.6),GOLD.clone().lerp(moonC,.3).multiplyScalar(1.7),GOLD.clone().lerp(new THREE.Color('#fff6e0'),.4).multiplyScalar(3)];
    const COLD=moonC.clone().multiplyScalar(1/Math.max(.01,moonC.r*.3+moonC.g*.59+moonC.b*.11));   // (a failure's cold: the moon's own hue)
    const SIZE=[3,2.1,1.2],MINPX=[12,9,6],HALO=[1,.8,.45],TRAIL=[TK,5,4],FOLLOW=[2,1,0];
    // Brightness by job (life/cathedral.js JOB): travelling and climbing bright, waiting and lingering dim.
    const J=LIFE_JOB,JOB_K=new Float32Array(16).fill(.8);JOB_K[J.travel]=1;JOB_K[J.dwell]=.42;JOB_K[J.wait]=.5;JOB_K[J.go]=.9;JOB_K[J.up]=1;JOB_K[J.circle]=.85;JOB_K[J.down]=.95;
    JOB_K[J.edge]=.85;JOB_K[J.patrol]=.55;JOB_K[J.migrate]=1;JOB_K[J.linger]=.32;
    const p3=[0,0,0],f3=[0,0,0],texBuf=lifeTex.image.data,cc=new THREE.Color();let shown={drawn:0,followers:0,trailSegments:0,trailPoints:0,drawCalls:0},texTick=-1,texK=-1;
    const b8=v=>v<=0?0:v>=1?255:(v*255+.5)|0;
    // Cable traffic: which drawn cable (bridge instance) each network edge belongs to, and which way along it.
    let cableKey='',edgeCable=null,edgeDir=null;const cableN=new Float32Array(32),cableD=new Float32Array(32);
    function cableMap(net){const key=net.key+'@'+builtVersion;if(key===cableKey)return;cableKey=key;edgeCable=new Int16Array(net.m*2).fill(-1);edgeDir=new Int8Array(net.m*2);
      const byPair=new Map(bridges.map((x,j)=>[x.l.a+'|'+x.l.b,j]));
      for(const c of net.cables){const j=byPair.get(c.a+'|'+c.b);if(j===undefined)continue;
        for(let k=0;k+1<c.nodes.length;k++){const u=c.nodes[k],w=c.nodes[k+1];for(let q=net.adjOff[u];q<net.adjOff[u+1];q++){const d=net.adj[q],e=d>>1;if((net.ea[e]===u&&net.eb[e]===w)||(net.eb[e]===u&&net.ea[e]===w)){
          const fwd=(d&1?net.eb[e]:net.ea[e])===u;edgeCable[d]=j;edgeDir[d]=fwd?1:-1;edgeCable[d^1]=j;edgeDir[d^1]=fwd?-1:1;}}}}}
    function cables(eco,net,v){cableMap(net);const n=Math.min(32,bridges.length);cableN.fill(0);cableD.fill(0);
      for(let e=0;e<eco.capacity;e++){if(!eco.alive[e]||eco.fa[e*2+1]!==net.tag)continue;const d=eco.ia[e*2];if(d<0)continue;const j=edgeCable[d];if(j<0||j>=n)continue;const w=lifeVisibility(eco,e,v);cableN[j]+=w;cableD[j]+=w*edgeDir[d];}
      for(let j=0;j<n;j++)glowB.write('kL',channels.length+j,Math.min(1,cableN[j]/4),cableN[j]>0?cableD[j]/cableN[j]:0);glowB.flush();}
    // The architecture's light (uMood.x, set by the world every frame before this) and the city's glow in the haze and
    // on the horizon (kept here: set from their own values every frame), by the music's light (1: as without music).
    const fogW0=common.uFogW.value.clone(),city0=common.uCity.value.clone();
    function cityLight(k){common.uFogW.value.copy(fogW0);common.uCity.value.copy(city0);if(k===1)return;common.uMood.value.x*=k*k;common.uFogW.value.multiplyScalar(k*k*Math.sqrt(k));common.uCity.value.multiplyScalar(k*k);}
    function hide(){cityLight(1);pts.commit(0);segs.commit(0);shown={drawn:0,followers:0,trailSegments:0,trailPoints:0,drawCalls:0};for(let j=0;j<bridges.length;j++)glowB.write('kL',channels.length+j,0,0);glowB.flush();
      if(texK!==0){for(let q=0;q<texBuf.length;q+=4){texBuf[q]=0;texBuf[q+1]=0;}lifeTex.needsUpdate=true;texK=0;texTick=-1;}}
    function update(i){
      const v=i.life;if(!v||!v.eco||v.restoring){hide();return;}
      const eco=v.eco,net=grammar.networkOf(eco);if(!net){hide();return;}
      // Ecology 2: the music as the city shows it (musicLook: all 1 without music). The architecture's own light (its
      // windows, channels and lit stone: a passage's weather; the world sets it afresh every frame before this), the
      // routes' light (the traffic's trail on copings, channels, cables and the wet floor: brightest where the music
      // gathers the traffic), the lanterns' light, size and comets; and the lanterns' distance treatment (uLifeE).
      // (the city's own light in the low haze and on the horizon breathes widest: it is how the whole city reads at a
      // distance)
      const E2=v.ecology===2,M=musicLook(eco,v),lk=v.fadeIn*M.life;lifeE.value=E2?1:0;cityLight(M.light);
      // The traffic field (once per tick), its light (trail) and its dimming (disturbance) faded with the population.
      if(texTick!==eco.tick||texK!==lk){texTick=eco.tick;texK=lk;const F=eco.field,NC=F.nx*F.nz,d=F.data,dk=v.fadeIn;
        for(let q=0;q<NC;q++){texBuf[q*4]=b8(d[q]/3*texK);texBuf[q*4+1]=b8(d[2*NC+q]/2.5*dk);texBuf[q*4+2]=b8(.5+d[3*NC+q]*1.5);texBuf[q*4+3]=b8(.5+d[4*NC+q]*1.5);}lifeTex.needsUpdate=true;}
      cables(eco,net,v);
      const q=quality,alpha=v.alpha,tv=i.tview,tag=net.tag,K=eco.K,head=eco.trailHead,PMAX=pts.capacity??PN;let n=0,nf=0,ns=0,nc=0;
      for(let e=0;e<eco.capacity;e++){if(!eco.alive[e]||eco.fa[e*2+1]!==tag)continue;const vis=lifeVisibility(eco,e,v);if(vis<=.01)continue;
        const k=eco.sp[e],job=eco.ia[e*2+1]&15;lifePosition(eco,e,alpha,p3);
        // Colour: the species' own, cooled and dimmed near a failure (the disturbance where it is).
        const sk=grammar.strainOf(eco,e),g=Math.min(1,Math.max(sk>.12?Math.min(1,(sk-.12)*3):0,(eco.sample(LIFE_CH.disturb,p3[0],p3[2])-.25)/1.25));cc.copy(COL[k]);
        if(g>0){const l=cc.r*.3+cc.g*.59+cc.b*.11;cc.lerp(f3c.copy(COLD).multiplyScalar(l*.7),.8*g).multiplyScalar(1-.45*g);}
        // (wardens going back in after a recovery, gathered at the hub's foot and climbing together, burn brighter)
        const back=k===1&&g<=0&&(eco.ia[e*2+1]>>4&4)&&(job===J.go||job===J.linger||job===J.up);
        const bk=vis*JOB_K[job]*(back?1.35:1)*(M.bright===1?1:Math.pow(M.bright,1.4)),moving=job===J.travel||job===J.up||job===J.down||job===J.go||job===J.edge||job===J.migrate;
        pts.write('position',n,p3[0],p3[1],p3[2]);pts.write('aC',n,cc.r*bk,cc.g*bk,cc.b*bk,E2&&moving?1.6:1);pts.write('aS',n,SIZE[k]*M.size,MINPX[k]*(.7+.3*JOB_K[job]),HALO[k]);n++;
        // The light trail: the recorded path, newest first, fading. Couriers and sparks draw it as a comet of soft points
        // (the heading in light), slow wardens as a short faint line. A jump (a relocation) or a sharp turn (a shaft's
        // step onto a gallery or a ledge, a corner) ends it: no hook is ever drawn in the air.
        // (ecology 2: sustained music keeps the comets brighter along their length and a little longer, at most half again
        // as many points: the point budget holds; tension cuts them short)
        let px=p3[0],py=p3[1],pz=p3[2],hx=0,hy=0,hz=0;const T0=moving?TRAIL[k]:3,T=Math.min(TK,M.trail===1?T0:Math.max(2,Math.round(T0*Math.min(1.5,M.trail)))),fe=1.6/M.trail,comet=moving&&k!==1,line=k===1;
        for(let t=1;t<T;t++){const o=e*K+((head-t+1+K*4)%K),x=eco.tx[o],y=eco.ty[o],z=eco.tz[o],sx=px-x,sy=py-y,sz=pz-z,l2=sx*sx+sy*sy+sz*sz;if(l2>1)break;
          if(l2>1e-4){const l=Math.sqrt(l2);if(hx*sx+hy*sy+hz*sz<.5*l*Math.sqrt(hx*hx+hy*hy+hz*hz)&&(hx||hy||hz))break;hx=sx;hy=sy;hz=sz;}
          if(line){const a0=bk*(1-(t-1)/T)*.35,a1=bk*(1-t/T)*.35;segs.write('position',ns*2,px,py,pz);segs.write('aC',ns*2,cc.r,cc.g,cc.b,a0);segs.write('position',ns*2+1,x,y,z);segs.write('aC',ns*2+1,cc.r,cc.g,cc.b,a1);ns++;}
          // The comet: soft points along the segment, shrinking and fading with age.
          if(comet&&n<PMAX-2)for(const f of q>=2?[.5]:[.3,.8]){const ag=(t-1+f)/T,w=(1-ag)**fe*bk*.45;
            pts.write('position',n,px+(x-px)*f,py+(y-py)*f,pz+(z-pz)*f);pts.write('aC',n,cc.r*w,cc.g*w,cc.b*w,1);pts.write('aS',n,SIZE[k]*.3*(1-ag),Math.max(1.5,3.5*(1-ag)),0);n++;nc++;}
          px=x;py=y;pz=z;}
        const F=q<=0?FOLLOW[k]:q===1?Math.min(1,FOLLOW[k]):0;
        for(let f=0;f<F&&n<PMAX;f++){if(!lifeFollower(eco,e,f,F,alpha,tv,f3,{spread:.035,lag:.3}))break;pts.write('position',n,f3[0],f3[1],f3[2]);pts.write('aC',n,cc.r*bk*.5,cc.g*bk*.5,cc.b*bk*.5,1);pts.write('aS',n,SIZE[k]*.45,4,HALO[k]*.5);n++;nf++;}}
      pts.commit(n);segs.commit(ns*2);shown={drawn:n-nf-nc,followers:nf,trailSegments:ns,trailPoints:nc,drawCalls:((n>0)+(ns>0))*(quality<2?2:1)};
    }
    const f3c=new THREE.Color();
    function dispose(){for(const o of [points,lines]){scene.remove(o);}mirror.remove(pointsM,linesM);pts.geometry.dispose();segs.geometry.dispose();ptMat.dispose();segMat.dispose();lifeTex.dispose();}
    return {update,dispose,stats:()=>({...shown}),grammar,driver};
  })():null;
  let dCache=null,dCacheV=-1;function dList(){if(dCacheV!==builtVersion){dCache=[...districts.values()].sort((a,b)=>a.index-b.index).slice(0,4);dCacheV=builtVersion;}return dCache;}
  function orreryY(){const tw=orreryTower&&towers.get(orreryTower);return tw?Math.max(.8,tw.top*.84):2;}
  // The reflection pass (half resolution) runs inside the measured frame: from background() when the host asks for
  // the sky, otherwise from afterCamera().
  let reflDue=false,bgSeen=true;const clearTmp=new THREE.Color();
  function renderReflection(){
    reflDue=false;const on=quality<2;floorU.uReflOn.value=on?1:0;if(!on)return;
    const [w,h]=ctx.pipeline.size;const rw=Math.max(2,w>>1),rh=Math.max(2,h>>1);if(reflRT.width!==rw||reflRT.height!==rh)reflRT.setSize(rw,rh);
    const prevTarget=renderer.getRenderTarget(),prevClear=renderer.getClearColor(clearTmp),prevAlpha=renderer.getClearAlpha();
    common.uMirror.value=-1;renderer.setRenderTarget(reflRT);renderer.setClearColor(0x000000,0);renderer.clear(true,true,false);renderer.render(mirror,camera);
    common.uMirror.value=1;renderer.setRenderTarget(prevTarget);renderer.setClearColor(prevClear,prevAlpha);
  }
  function afterCamera(){camera.updateMatrixWorld();sky.uniforms.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);sky.uniforms.uCam.value.copy(camera.position);
    if(!bgSeen&&reflDue)renderReflection();reflDue=true;bgSeen=false;}
  function background(){bgSeen=true;if(reflDue)renderReflection();return sky;}
  // ---- Grade: AgX; the moon throws crepuscular rays past the great spire's lattice (they breathe as cloud crosses the
  // disc); a milestone's moment flares gold (halation and a horizontal streak) -------------------------------------
  const gTint=new THREE.Vector3(),gBloomT=new THREE.Vector3(),gStreakT=new THREE.Vector3(1,.78,.45),gLift=new THREE.Vector3(-.014,-.013,-.01),gMoon=new THREE.Vector3();
  const gRay={x:.5,y:.5,strength:0,color:moonC},gRays=[gRay],NO_RAYS=[];
  function momentAt(i){let mm=0;const sp=ctx.speed();for(const m of moments){const ag=(i.tsec-m.at)/sp;if(ag<-.5||ag>10)continue;mm=Math.max(mm,m.k*smooth((ag+.3)/.9)*(1-smooth((ag-4)/5)));}return mm;}
  function grade(i){const L=G.light||{},inten=i.overrides.intensity??1;let f=0,cold=0,gold=0;
    for(const x of flashes){const age=(i.tsec-x.at)/ctx.speed();if(age<0||age>6)continue;const e=Math.exp(-age*1.6);if(x.kind===1)cold+=x.amount*Math.exp(-age*.6);else{f+=x.amount*e;if(x.kind===2)gold+=x.amount*Math.exp(-age*.5);}}
    cold=Math.min(1,cold*inten);gold=Math.min(1,gold*inten);const mm=Math.min(1,momentAt(i)*Math.min(1,inten));
    const section=i.mood.section;const tint=section==='tension'?gTint.set(1.04,.97,.97):section==='resolve'||section==='lift'?gTint.set(1.02,1,.97):section==='away'?gTint.set(.98,1,1.03):gTint.set(1,1,1);
    tint.x*=1+.05*cold;tint.y*=1-.05*cold;tint.z*=1-.03*cold;
    gBloomT.set(lerp(1.1,1.55,mm),lerp(.92,1.05,mm),lerp(.78,.5,mm));
    let rays=NO_RAYS;gMoon.copy(moonDir).multiplyScalar(500).add(camera.position).project(camera);
    if(gMoon.z<1&&Math.abs(gMoon.x)<1.6&&Math.abs(gMoon.y)<1.6){const out=Math.max(Math.abs(gMoon.x),Math.abs(gMoon.y));gRay.x=gMoon.x*.5+.5;gRay.y=gMoon.y*.5+.5;
      gRay.strength=(.2+.25*shaftK)*common.uMoonK.value*Math.min(1,Math.pow(camera.fov/20,1.5))*(1-smooth((out-.95)/.6))*(1+.3*(i.unlocks[0]?.level||0));rays=gRays;}
    return {tonemap:'agx',bloom:(L.bloom??1)*.9*(1+.15*i.activity)+gold*.4+mm*.5,threshold:Math.max(.6,(L.bloomThreshold??.7)+.2),exposure:(L.exposure??1)*.8*(1-.12*cold),contrast:(L.contrast??1)*1.16,
      saturation:1-.3*cold,vignette:(L.vignette??.3)+.14,grain:L.grain??.025,flash:f*inten*.6,waves:NO_RAYS,tint,rays,rayDecay:.91,
      streak:.16*mm,streakTint:gStreakT,bloomTint:gBloomT,lift:gLift};}
  // ---- Camera: the establishing view (above), with attention gliding to significant events and back; a milestone's
  // moment pushes in on the spire it crowns ---------------------------------------------------------------------
  const gC=new THREE.Vector3(),gT=new THREE.Vector3(),gE=new THREE.Vector3(),gP=new THREE.Vector3(),goal={target:new THREE.Vector3(),distance:20,azimuth:0,elevation:0,fov:24,omega:.5};
  // Attention: the camera glides toward the subject but never into the city (it stops outside every precinct); the
  // long lens narrows to frame the subject.
  function pushTo(P,r,k,amt,fovK=.8){const C0=estab.C;const dx=P.x-C0.x,dz=P.z-C0.z,dist=Math.max(1e-3,Math.hypot(dx,dz));
    let fe=estab.fov*fovK;const want=Math.max(r/Math.tan(THREE.MathUtils.degToRad(fe)/2)*1.2,4);let travel=Math.max(0,dist-want)*amt;
    const ux=dx/dist,uz=dz/dist;let safe=travel;
    for(const d of districts.values()){const ox=d.centre.x-C0.x,oz=d.centre.z-C0.z;const along=ox*ux+oz*uz;const lat=Math.abs(ox*uz-oz*ux);const R=d.radius+1.2;
      if(lat<R&&along>0){const entry=along-Math.sqrt(R*R-lat*lat);safe=Math.min(safe,Math.max(0,entry));}}
    travel=Math.min(travel,safe);const left=dist-travel;
    fe=clamp(THREE.MathUtils.radToDeg(2*Math.atan(r*1.25/Math.max(1,left))),estab.fov*.5,estab.fov*fovK);
    gE.set(C0.x+ux*travel,lerp(C0.y,Math.max(.5,Math.min(C0.y,P.y*.6)),amt*.6),C0.z+uz*travel);gC.lerp(gE,k);gT.lerp(P,k);return lerp(0,fe-estab.fov,k);}
  function cameraGoal(i){
    gC.copy(estab.C);gT.copy(estab.T);let dfov=0;const sp=ctx.speed();
    let mk=0,mt=null;for(const m of moments){const ag=(i.tsec-m.at)/sp;if(ag<-1.6||ag>9)continue;const k=smooth((ag+1.6)/2.2)*(1-smooth((ag-5.5)/3));if(k>mk&&towers.has(m.id)){mk=k;mt=m;}}
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/sp/1000:Infinity;
    if(mt&&mk>0){const tw=towers.get(mt.id);gP.set(tw.pos.x,tw.top+(tw.roofTop-tw.top)*.42,tw.pos.z);dfov=pushTo(gP,(tw.roofTop-tw.top)*.55+tw.R*2,mk*Math.min(1,(i.overrides.intensity??1)+.3),.75,.7);}
    else if(since<14&&att){const a=subjectOf(att);if(a){const k=smooth(1-Math.max(0,since-9)/5)*smooth(since/1.2+.2);gP.copy(a.pos);dfov=pushTo(gP,a.radius,k,.4);}}
    else{const busy=i.agents.find(a=>a.display==='tool'&&a.fileId&&towers.has(a.fileId));
      if(busy){const tw=towers.get(busy.fileId);gP.set(tw.pos.x,tw.top*.5,tw.pos.z);gT.lerp(gP,.12);}}
    // The rig's target always sits a fixed distance along the line of sight, so the camera glides on a steady path
    // (it never swings through the city while the target and the distance settle at different rates).
    const dx=gT.x-gC.x,dy=gT.y-gC.y,dz=gT.z-gC.z,len=Math.max(1e-3,Math.hypot(dx,dy,dz)),D=Math.max(6,estab.L*.5);
    goal.target.set(gC.x+dx/len*D,gC.y+dy/len*D,gC.z+dz/len*D);goal.distance=D;goal.azimuth=Math.atan2(-dz,-dx);goal.elevation=Math.asin(clamp(-dy/len,-1,1));goal.fov=clamp(estab.fov+dfov,8,60);return goal;
  }
  function subjectOf(c){const s=c.subject||{};
    if(s.fileId&&towers.has(s.fileId)){const a=towers.get(s.fileId);if(s.targetId&&towers.has(s.targetId)){const b=towers.get(s.targetId);return {pos:a.pos.clone().lerp(b.pos,.5).setY(Math.max(a.top,b.top)*.6),radius:a.pos.distanceTo(b.pos)*.6+2};}
      const d=districts.get(a.district);return {pos:(d?d.centre.clone():a.pos.clone()).lerp(a.pos,.5).setY(a.roofTop*.45),radius:Math.max((d?.radius||3)+.5,a.roofTop*.6)};}
    if(s.groupId&&districts.get(s.groupId)){const d=districts.get(s.groupId);return {pos:d.centre.clone().setY(1),radius:d.radius+1};}
    const list=(s.fileIds||[]).map(id=>towers.get(id)).filter(Boolean);if(list.length){const c0=new THREE.Vector3();for(const t of list)c0.add(t.pos);c0.multiplyScalar(1/list.length);let r=3,h=1;for(const t of list){r=Math.max(r,t.pos.distanceTo(c0)+1.5);h=Math.max(h,t.roofTop);}c0.y=h*.45;return {pos:c0,radius:Math.max(r,h*.6)};}
    return null;}
  // ---- Words ---------------------------------------------------------------------------------------------------
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const dName=id=>{const d=model.districts.get(id);return d?`${ctx.name(id)} · ${d.role}`:ctx.name(id);};
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  function describe(c){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=subjectOf(c)?.pos;
    switch(c.intent){
      case 'subsystem.created':return {text:'A new precinct is founded',sub:dName(s.groupId),position:pos};
      case 'structure.created':return {text:'New storeys are set in place',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','glass storey').replace('api.route','pinnacle').replace('class','hall storey').replace('function','storey').replace('interface','tracery').replace('type','tracery')}`).join(' · ')||plural(d.count||1,'storey'),position:pos};
      case 'subsystem.connected':{const ga=towers.get(s.fileId)?.district,gb=towers.get(s.targetId)?.district;return {text:d.first?'Integration · a bridge locks two precincts':'A bridge between precincts strengthens',sub:ga&&gb?`${ctx.name(ga)} ↔ ${ctx.name(gb)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · ${plural(n,'tower')} under strain`,sub:'observed failing run',position:pos,color:'#ff8a6a'};
      case 'validation.passed':return {text:`Tests pass · ${plural(n,'tower')} lit`,sub:'observed passing run',position:pos,color:'#ffe2b0'};
      case 'validation.recovered':return {text:`Recovered · ${plural(d.repaired||n,'tower')} restored`,sub:'the tests pass again',position:pos,color:'#ffe2b0',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the structure is reassembled',sub:plural(d.removedSymbols||0,'symbol')+' removed',position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=(d.kinds||[]).map(x=>MILESTONE[x]||x);return {text:`${({'window-scan':'A window scan',restore:'Restoration',reassemble:'Reassembly'})[c.effect]||'Illumination · rose windows ignite'} · ${k.join(' + ')}`,sub:'verified by a passing test run',position:pos,banner:k.join(' · '),bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:n?`Committed · ${plural(n,'tower')} set in stone`:'Committed · the work is set in stone',sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The cathedral grows · chapter ${d.chapter}`,sub:'accumulated structure',position:(orreryAt||centre).clone().setY(2)};
      case 'agent.collision':return {text:'Two agents meet in the nave',sub:(d.providers||[]).map(id=>presence(id).display).join(' · '),position:pos};
      default:return null;}}
  function agentPosition(id){return agentPos.get(id)||null;}
  function agentColor(a){return '#'+AGENT_COLORS[a.voice%8].getHexString();}
  function subsystemLabels(){return [...districts.values()].map(s=>({position:s.centre.clone().setY(1.6*S),text:ctx.name(s.d.id),sub:`${s.d.role} · ${plural(s.d.members.length,'module')}`}));}
  function status(i){let v=0,st=0;for(const m of model.modules.values()){if(!model.alive(m,i.t))continue;const s=model.stateAt(m,i.t);if(s==='validated')v++;if(s==='stressed')st++;}return st?`${st} under strain`:v?`${v} validated`:'';}
  function pick(x,y,cam){let best=null,bd=.05;for(const [id,tw] of towers){const p=tw.pos.clone().setY(tw.top*.6).project(cam);const d=Math.hypot(p.x-x,(p.y-y)*.6);if(p.z<1&&d<bd){bd=d;best=id;}}return best;}
  function inspect(id,i){const tw=towers.get(id),m=model.modules.get(id);if(!tw||!m)return null;const deps=[...model.links.values()].filter(l=>(l.a===id||l.b===id)&&model.alive(l,i.t)).length;
    return {position:tw.pos.clone().setY(tw.top),text:`A tower · ${model.stateAt(m,i.t)}`,sub:`${plural(model.symbolsAt(m,i.t),'storey')} · ${plural(deps,'link')} · ${ctx.name(m.group)}`};}
  function stats(){return {districts:districts.size,towers:towers.size,stones:stoneCount,pinnacles:pinCount,naves:naves.length,spires:greats.length,flyers:flyers.length,bridges:bridges.length,channels:channels.length,rings:ringB.geometry.instanceCount,crowns:crowns.length,roses:roses.size,
    architecture:archName,camera:camera.position.toArray().map(x=>+x.toFixed(1)),extent:+extent.toFixed(1),estab:[estab.C.x,estab.C.y,estab.C.z,estab.S.x,estab.S.z,centre.x,centre.z].map(x=>+x.toFixed(1)),view:{L:+estab.L.toFixed(1),fov:+estab.fov.toFixed(1),moonEl:+moonEl.toFixed(3),mist:+common.uMistD.value.toFixed(4)}};}
  function dispose(){life?.dispose();for(const o of [floor,stoneMesh,pinMesh,naveMesh,latMesh,bayMesh,solidMesh,glowMesh,ringMesh,beamMesh,motePoints,lampPoints,burstPoints]){scene.remove(o);o.geometry.dispose();o.material.dispose();}
    mirror.clear();noiseTex.dispose();sky.dispose();frustum.dispose();pinGeo.dispose();naveGeo.dispose();latGeo.dispose();ribbonGeo.dispose();bayShape.dispose();ringGeo.dispose();beamGeo.dispose();reflRT.dispose();}
  // After a seek: transient effects are cleared (lasting rose windows and crowns come from director.lasting() each frame).
  function onPrime(){for(const v of common.uWaves.value)v.w=-1e5;for(const v of burstU.uBA.value)v.w=-1e5;for(const v of burstU.uBC.value)v.set(1,0,1,0);
    flashes.length=0;lockRings.length=0;beamFx.length=0;haloFx.length=0;moments.length=0;fxTower.clear();fxDistrict.clear();for(let k=0;k<bayCount;k++)bayB.arrays.aF[k*4]=-1e5;bayB.dirty('aF');bayB.flush();
    if(builtVersion>=0){for(const B of [stoneB,pinB]){for(let k=0;k<B.capacity;k++){B.arrays.iF[k*4]=-1e5;B.arrays.iF[k*4+1]=0;}B.dirty('iF');}for(let k=0;k<naves.length;k++)naveB.arrays.nD[k*4+1]=-1e5;naveB.dirty('nD');}lastingSig='';}
  // ---- Composition anchors (layers.js): the precincts (above their towers, rooted on the floor), the work, the tower
  // tops, the city's edge. Read-only.
  const composeA={center:new THREE.Vector3(),extent:8,floor:0,subsystems:[],active:{pos:new THREE.Vector3()},nodes:[],boundary:{radius:10,y:0}};
  function composeAnchors(i){
    composeA.center.set(centre.x,Math.max(.5,tallest*.3),centre.z);composeA.extent=extent;composeA.boundary.radius=extent*1.15;
    composeA.subsystems=[...districts.values()].map(d=>{let h=0;for(const m of d.members){const tw=towers.get(m.id);if(tw)h=Math.max(h,tw.roofTop||0);}
      return {id:d.d.id,pos:d.centre.clone().setY(Math.max(.6,h*.6)),base:d.centre.clone(),size:Math.max(.8,d.radius)};});
    const list=[...towers.values()],n=Math.min(64,list.length);composeA.nodes=[];for(let k=0;k<n;k++){const tw=list[Math.floor(k*list.length/n)];composeA.nodes.push({pos:tw.pos.clone().setY(tw.roofTop||tw.top||.5)});}
    const att=i?ctx.director.attentionAt(i.t,1):null,busy=i?.agents?.find(a=>a.display==='tool'&&a.fileId&&towers.has(a.fileId));
    const at=att&&(i.t-att.at)/ctx.speed()/1000<30?subjectOf(att)?.pos:busy?towers.get(busy.fileId).pos.clone().setY(towers.get(busy.fileId).top*.6):null;composeA.active.pos.copy(at||composeA.center);
    return composeA;}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime,
    compose:{camera,scene,anchors:composeAnchors},
    ...(life?{lifeStats:life.stats,onLifeParams(){}}:{})};
}

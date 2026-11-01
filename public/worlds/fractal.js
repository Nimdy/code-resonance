// Fractal Continuum: the software as an evolving 3D fractal universe. Design brief: docs/worlds/fractal-continuum.md.
//
// Data -> image (nothing here is decoration that claims engineering work):
//  - the project          -> one raymarched, distance-estimated fractal; the code's character picks its universe (a
//                            Mandelbulb, a Julia bulb, a Mandelbox, a kaleidoscopic crystal) and its parameters
//                            (fractal-forms.js), and the live code at t (files, symbols) how far its recursion has
//                            unfolded: an empty project is a smooth seed, each file and symbol unfolds it further
//  - subsystem (district) -> a region of the surface around its own direction, in its own hue on the identity's
//                            harmony (palette.scheme), swelling outward with its files (more gently once the form is
//                            intricate, so the swell never smears its fine structure)
//  - file (module)        -> a site of light on its region's surface (traced to the surface with the JS twin of the
//                            estimator): its size from its symbols, its light from its state
//  - dependency           -> a faint thread of light arcing from the importing file's site to the imported one's
//  - agent                -> a signal in its provider's colour and shape (CAST seat) that rides to the site it works on;
//                            its edit touches the surface there: rings of its colour ripple across the fractal, the
//                            crevices around the site light up, the site flares and its threads carry the pulse
//  - human edit, new file, new symbols -> a pulse of the site (warm white, the light's colour)
//  - tests passing        -> a coherent wave of light sweeping the whole form from the covered sites
//  - failure              -> decoherence: the covered region distorts and stutters, static crackles in the warning
//                            colour, the surface dims around it. Never gold, never a wave
//  - recovery             -> coherence restored: the distortion relaxes, rings converge on the repaired region
//  - commit               -> a warm glow rising from the crevices of the committed sites
//  - verified milestone   -> the earned fractal bloom (the form twists through its own recursion and inflates, a shell
//                            of light runs over it from the subject, light floods from every crevice, a burst of light
//                            leaves the surface, the camera pulls back), at most once per BLOOM_GAP of performance time
//                            and only with the director's milestone token; otherwise a local unfolding. It leaves an inner
//                            light in the subject's region (lasting)
// Ambient life (never progress): the form breathes on the bars, the key light circles slowly, glints catch on the beat,
// sites pulse spontaneously on the beat grid (raised by recent work), dust drifts in the void.
// Every image is a function of the model, the recipe, the director's fold and the performance clock; the level of detail
// drawn (how many recursions the pixels can hold) also follows the camera's distance, as the camera rig follows the frames.
import {THREE,clamp,lerp,smooth,hash,rand} from './core.js';
import {createFormula,massAt,unfoldAt,detailCap,rotation,layoutConfig,layoutAt,regionSlots,regionWeights,swellAt,kappaOf,spontaneous,R0,MAX_IT,MIN_IT} from './fractal-forms.js';
import {touchesAt,touchGain} from './touch.js';
import {presence} from '../providers.js';
import {createFractalGrammar,toDir as lifeDir,toMap as lifeMap,ALT0 as LIFE_ALT0,ALT as LIFE_ALT,FIELD as LIFE_FIELD,MOTE,SKIMMER,EMBER} from './life/fractal.js';
import {position as lifePosition,follower as lifeFollower,visibility as lifeVisibility,musicLook} from './life/present.js';
import {u01,MODE as LIFE_MODE} from './life/sim.js';
const TAU=Math.PI*2,WS=10,BLOOM_GAP=240000,DWELL=4500,MOTES=360,BURST=3200,MAX_THREADS=480,TSEG=10,MAX_FX=4000;
// Each CAST provider its own colour and shape (seat: Claude, Cursor, Codex, Grok, Qwen, Kimi, then unknown providers).
const AGENT_COLORS=['#ff5f8a','#3fe6ff','#8dff6a','#f2f4ff','#59a8ff','#ff5cf0','#ffb35c','#c0c8d8'];
const C_HUMAN=8,C_GROW=9,C_VALID=10,C_BLOOM=11,C_WARN=12,C_SPONT=13;
const LIGHT=new Set(['reading','searching','researching']);
// Quality levels (the host also drops MSAA at 1 and resolution at 2 and 3): march steps, the hit tolerance in pixels,
// occlusion taps, the key light's shadow trace (steps; 0: two taps toward the light), the most recursions drawn. Films
// always render at 0.
const QUALITY=[{steps:220,eps:1,ao:3,sh:6,cap:MAX_IT,scale:.6},{steps:170,eps:1,ao:2,sh:4,cap:12,scale:.54},{steps:120,eps:1.2,ao:2,sh:0,cap:10,scale:.5},{steps:84,eps:1.5,ao:1,sh:0,cap:8.5,scale:.45}];
const FRAC_SCALE=QUALITY.map(q=>q.scale);
const SW=128;
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome||{},P=G.palette||{};
  // Digital life (life/fractal.js): only when the recipe has it on. Off, nothing below differs from the world without it
  // (no resource, no draw call, no uniform, no shader text): every life addition is guarded by LIFE.
  const LIFE=ctx.life||null;
  const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  const atm=G.atmosphere||{},mtl=G.material||{},mot=G.motion||{},cam=G.camera||{},geo=G.geometry||{},LT=G.light||{},MU=G.music||{};
  const col=(c,d)=>new THREE.Color(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:d);
  const pal={primary:col(P.primary,'#2b6b78'),secondary:col(P.secondary,'#17323a'),accent:col(P.accent,'#ffb14e'),highlight:col(P.highlight,'#cfe3e6'),
    deep:col(P.deep,'#030607'),haze:col(P.haze,'#0f1f24'),warning:col(P.warning,'#ff3d5e'),valid:col(P.valid,'#86e8d0')};
  // The void stays a void and the surface a surface whatever a tuned palette says.
  const capL=(c,max)=>{const h={};c.getHSL(h);if(h.l>max)c.setHSL(h.h,h.s,max);return c;};capL(pal.deep,.05);capL(pal.haze,.18);capL(pal.primary,.6);
  const seed=(recipe.projectSeed>>>0)||1;
  const formula=createFormula(recipe),fc=formula.cfg,lc=layoutConfig(recipe);let slots=regionSlots(lc.seed);
  const V3=(c,k=1)=>new THREE.Vector3(c.r*k,c.g*k,c.b*k),v4=()=>new THREE.Vector4();
  const agentCol=AGENT_COLORS.map(c=>new THREE.Color(c));
  const COLS=[...agentCol.map(c=>V3(c,1.4)),V3(new THREE.Color('#fff4e4'),1.2),V3(pal.accent,1.3),V3(pal.valid,1.3),V3(pal.accent.clone().lerp(new THREE.Color('#fff6e8'),.45),2),V3(pal.warning,1.1),V3(pal.accent,.9)];
  const GLOW=clamp(num(mtl.glow,1),.4,1.8),SWELL=lc.swell,RES=clamp(num(mot.resonance,.9),.1,2.2),SYNC=clamp(num(mot.sync,.55),0,1);
  const disposables=[];const keep=x=>{disposables.push(x);return x;};
  const add=(o,order=0)=>{o.frustumCulled=false;o.renderOrder=order;scene.add(o);return o;};
  // ---- The swell table: each direction's swell factor (alpha) and region colour (rgb), half float, octahedral (a direction
  // maps to the table without trigonometry); rewritten only when the regions' weights change ----------------------------
  const swData=new Uint16Array(SW*SW*4),swTex=keep(new THREE.DataTexture(swData,SW,SW,THREE.RGBAFormat,THREE.HalfFloatType));
  swTex.wrapS=swTex.wrapT=THREE.ClampToEdgeWrapping;swTex.minFilter=swTex.magFilter=THREE.LinearFilter;swTex.generateMipmaps=false;
  const toHalf=THREE.DataUtils.toHalfFloat;for(let k=0;k<SW*SW;k++){swData[k*4]=toHalf(pal.primary.r);swData[k*4+1]=toHalf(pal.primary.g);swData[k*4+2]=toHalf(pal.primary.b);swData[k*4+3]=toHalf(1);}swTex.needsUpdate=true;
  // ---- The identity's harmony (palette.scheme): the hues its regions take, and how depth and the light turn them --------
  // The harmony's far pole (in degrees from the surface's hue): the light's hue for analogous and complementary (the
  // opposite hue when the light stands near), 150 and 120 degrees for split and triad (both sides). Region k takes a hue
  // on the arc from the surface's hue toward the far pole (SEQF[k] of the arc's span: the first region the surface's own
  // hue; a negative share toward the other side), its own saturation and lightness drawn from its id: a family of jewel
  // tones. The far pole itself is the light's: it colours the rim, the glints, the sites. An arc never crosses the band
  // between amber and green (a dark yellow reads as olive): it turns the other way round the wheel, or stops short.
  const hslS=c=>{const h={};c.getHSL(h,THREE.SRGBColorSpace);return h;};
  const Hp=hslS(pal.primary),Ha=hslS(pal.accent),Hs=hslS(pal.secondary),H0=Hp.h*360;
  const turn=(a,b)=>((b-a)%1+1.5)%1-.5,toA=turn(Hp.h,Ha.h)*360,wrapD=x=>((x%360)+360)%360;
  const OLIVE=[48,100],inOlive=h=>{h=wrapD(h);return h>OLIVE[0]&&h<OLIVE[1];};
  // how far (degrees) one can go from the surface's hue in direction d before the olive band, less a margin for the turns
  const room=d=>{for(let x=1;x<=180;x++)if(inOlive(H0+d*x))return Math.max(0,x-44);return 180;};
  const far=P.scheme==='triad'?120:P.scheme==='split'?150:P.scheme==='analogous'?(Math.abs(toA)>=12?toA:30):(Math.abs(toA)>=90?toA:180);
  let dirP=far<0?-1:1;const want=P.scheme==='analogous'?clamp(Math.abs(far),28,40):P.scheme==='triad'?110:P.scheme==='split'?100:100;
  if(room(dirP)<want*.6&&room(-dirP)>room(dirP))dirP=-dirP;
  const spanP=Math.min(want,room(dirP)),spanM=Math.min(P.scheme==='triad'||P.scheme==='split'?want:want*.6,room(-dirP));
  const SEQF=[0,1,-1,.5,-.5,.75,.25,-.75,.9,-.25];
  const regionHSL=r=>{const h=hash(`tint/${r.id}`),f=SEQF[r.k%SEQF.length],off=f>=0?dirP*spanP*f:-dirP*spanM*(-f);
    const hue=wrapD(H0+off+(rand(h)-.5)*8)/360;
    return {h:hue,s:clamp(Hp.s*1.05+.05+.16*(rand(h+1)-.4),.34,.68),l:clamp(Hp.l*(.64+.44*rand(h+2)),.15,.48)};};
  // Depth and light turn the hue (radians): ridges and grazing angles along the arc toward the far pole, the crevices the
  // other way (the palette's depth colour, at least 12 degrees), unless that way lies the olive band.
  const DEG=Math.PI/180,dS=Math.max(12,Math.abs(turn(Hp.h,Hs.h)*360)),dD=inOlive(H0-dirP*dS)?dirP:-dirP;
  const HUE_D=dD*dS*DEG,HUE_R=dirP*14*DEG,IRI=dirP*Math.min(38,room(dirP)+30)*DEG;
  const rimCol=new THREE.Color().setHSL(wrapD(H0+(inOlive(H0+far)?dirP*Math.min(Math.abs(far),room(dirP)+44):far))/360,.5,.6,THREE.SRGBColorSpace);
  const tmpC=new THREE.Color();
  let swSig='',swShape='';
  // Each region's kernel at every texel, kept for its exact width (up to 64 regions): while a project grows its regions'
  // weights change far more often than their widths, and then only the swell is summed again (the tints stay).
  const swK=new Map(),SWK_MAX=64;
  // The octahedral map's inverse (y up), as the shader's oct() encodes it.
  function octDecode(px,pz,out){let x=px,y=1-Math.abs(px)-Math.abs(pz),z=pz;const t=Math.max(-y,0);x+=x>=0?-t:t;z+=z>=0?-t:t;const l=Math.hypot(x,y,z)||1;out[0]=x/l;out[1]=y/l;out[2]=z/l;return out;}
  // (rgb: the region's colour, linear, blended with its neighbours' over a narrow seam (hue, saturation and lightness:
  // neighbouring hues on the harmony's arc meet in the hue between them) and the surface's own colour where no region
  // reaches; alpha: the swell factor at the current swell amplitude `amp`)
  function swellTable(regions,weights,amp){
    const sig=`${Math.round(amp*512)}|`+regions.map((r,k)=>`${r.id}:${Math.round(weights[k]*128)}:${Math.round(kappaOf(r)*256)}`).join(',');if(sig===swSig)return;swSig=sig;
    const shape=regions.map(r=>`${r.id}|${r.k}|${kappaOf(r)}|${r.dir}`).join(','),cache=regions.length<=SWK_MAX;
    if(cache&&shape===swShape){
      const Ks=regions.map(r=>swK.get(r.id));
      for(let i=0;i<SW*SW;i++){let s=0;for(let k=0;k<regions.length;k++)s+=weights[k]*Ks[k][i];swData[i*4+3]=toHalf(1+amp*Math.min(1,s));}
      swTex.needsUpdate=true;return;}
    swShape=shape;for(const id of swK.keys())if(!regions.some(r=>r.id===id))swK.delete(id);
    const hs=regions.map(regionHSL),Ks=cache?regions.map(r=>{let K=swK.get(r.id);if(!K){K=new Float64Array(SW*SW);swK.set(r.id,K);}return K;}):null,u=[0,0,0];
    // (hues as offsets from the surface's hue, so a blend never goes the long way round)
    const ho=hs.map(c=>turn(Hp.h,c.h)),s0=clamp(Hp.s*1.05+.06,.34,.74),wk=new Float64Array(regions.length);
    for(let y=0;y<SW;y++){for(let x=0;x<SW;x++){octDecode((x+.5)/SW*2-1,(y+.5)/SW*2-1,u);
        let s=0,tw=0,wm=0;for(let k=0;k<regions.length;k++){const R=regions[k],c=u[0]*R.dir[0]+u[1]*R.dir[1]+u[2]*R.dir[2],K=Math.exp((c-1)/kappaOf(R));s+=weights[k]*K;if(Ks)Ks[k][y*SW+x]=K;
          const w=Math.exp((c-1)/(kappaOf(R)*.25));wk[k]=w;tw+=w;wm=Math.max(wm,w);}
        // (each region's weight sharpened against the strongest: a narrow seam between two regions)
        let n=0,hh=0,ss=0,ll=0;const cov=Math.min(1,tw);
        for(let k=0;k<regions.length;k++){const w=Math.pow(wk[k]/Math.max(wm,1e-12),8)*cov;n+=w;hh+=w*ho[k];ss+=w*hs[k].s;ll+=w*hs[k].l;}
        const w0=1-cov;n+=w0;ss+=w0*s0;ll+=w0*Hp.l;n=Math.max(n,1e-9);
        tmpC.setHSL(((Hp.h+hh/n)%1+1)%1,ss/n,ll/n,THREE.SRGBColorSpace);
        const o=(y*SW+x)*4;swData[o]=toHalf(tmpC.r);swData[o+1]=toHalf(tmpC.g);swData[o+2]=toHalf(tmpC.b);swData[o+3]=toHalf(1+amp*Math.min(1,s));}}
    swTex.needsUpdate=true;}
  // ---- The fractal: a raymarched distance estimator in three passes into its own targets (a coarse cone march, the march,
  // the shading), at a share of the scene's resolution, then a composite into the scene that writes depth (signals and
  // sites are hidden behind the form) -------------------------------------------------------------------------------
  const L4=n=>Array.from({length:n},v4);
  const M3=a=>new THREE.Matrix3().set(...a);
  const R={BS:{value:fc.S??-2},BROT:{value:M3(fc.rot||rotation(0,0))},KR1:{value:M3(fc.rot1||rotation(0,0))},KR2:{value:M3(fc.rot2||rotation(0,0))},FIT:{value:MAX_IT+1},TWON:{value:formula.twist.tw||formula.twist.sp?1:0},uDecOn:{value:0},uCoarse:{value:null},uCSteps:{value:120},uConeK:{value:4},uInvVP:{value:new THREE.Matrix4()},uVP:{value:new THREE.Matrix4()},uCamF:{value:new THREE.Vector3(0,0,8)},uWSg:{value:WS},uRB:{value:R0*1.04*(1+SWELL)},
    uPix:{value:.001},uEpsK:{value:.8},uSteps:{value:200},uAOn:{value:5},uIt:{value:6},TWC:{value:new THREE.Vector2(Math.cos(formula.twist.tw),Math.sin(formula.twist.tw))},
    SPC:{value:new THREE.Vector2(Math.cos(formula.twist.sp),Math.sin(formula.twist.sp))},uSw:{value:swTex},uDec:{value:L4(2)},uDecA:{value:L4(2)},
    uKey:{value:new THREE.Vector3(.4,.8,.3).normalize()},uKeyC:{value:new THREE.Vector3(2.55,2.45,2.35)},uFillC:{value:V3(pal.highlight,.1)},uRimC:{value:V3(rimCol,.9)},
    uRimDir:{value:new THREE.Vector3(0,0,-1)},uShN:{value:6},uShK:{value:9},uHueD:{value:HUE_D},uHueR:{value:HUE_R},uIri:{value:IRI},uSwN:{value:SWELL},
    uHi:{value:V3(pal.highlight)},uAcc:{value:V3(pal.accent,1.3)},uWarn:{value:V3(pal.warning,1.2)},uValid:{value:V3(pal.valid,1.2)},
    uOcc:{value:clamp(num(mtl.occlusion,1),.4,1.8)},uTrapK:{value:clamp(num(mtl.trap,.5),0,1)},uSheen:{value:clamp(num(mtl.sheen,.4),0,1)},uRim:{value:clamp(num(mtl.rim,.7),0,1.6)},
    uGlow:{value:GLOW},uInner:{value:0},uShim:{value:clamp(num(mot.shimmer,.8),0,1.6)},uBeat:{value:0},uTime:{value:0},uBreath:{value:0},uQ:{value:0},
    uTch:{value:L4(4)},uTchC:{value:L4(4)},uWav:{value:L4(6)},uWavC:{value:L4(6)},uWavK:{value:L4(6)},uLast:{value:L4(4)},uStress:{value:0},uHaloK:{value:clamp(num(atm.halo,.7),0,1.6)},uHaloC:{value:V3(pal.highlight.clone().lerp(pal.primary,.5),.5)}};
  // Life on: the light the life pools in the relief (an octahedral map of directions like the swell table's, rebuilt
  // from the ecosystem at each tick; r: where motes gather and embers rest, g: the threads they keep using).
  const LLN=64,llData=LIFE?new Uint8Array(LLN*LLN*4):null,llTex=LIFE?keep(new THREE.DataTexture(llData,LLN,LLN,THREE.RGBAFormat,THREE.UnsignedByteType)):null;
  if(LIFE){llTex.magFilter=llTex.minFilter=THREE.LinearFilter;llTex.wrapS=llTex.wrapT=THREE.ClampToEdgeWrapping;llTex.generateMipmaps=false;llTex.needsUpdate=true;
    Object.assign(R,{uLifeL:{value:llTex},uLifeK:{value:new THREE.Vector4(0,0,0,0)},uLifeC:{value:V3(pal.accent.clone().lerp(pal.highlight,.3),1)}});}
  // Loops over the event slots are written out with constant indices (plain reads of each uniform).
  const unroll=(n,body)=>Array.from({length:n},(_,k)=>`{${body(k)}}`).join('\n');
  // The estimator of the drawn form (shared by the coarse pass and the full pass): the region's swell, the decoherence.
  const MAP=`
uniform mat4 uInvVP;uniform vec3 uCamF;uniform float uRB,uPix,uIt,uDecOn;uniform sampler2D uSw;uniform vec4 uDec[2],uDecA[2];
${formula.glsl}
vec2 oct(vec3 u){u/=abs(u.x)+abs(u.y)+abs(u.z);vec2 p=u.xz;if(u.y<0.)p=(1.-abs(p.yx))*vec2(p.x>=0.?1.:-1.,p.y>=0.?1.:-1.);return p*.5+.5;}
vec4 swellOf(vec3 u){return texture2D(uSw,oct(u));}
// Decoherence: a turbulent displacement of the failing region that jumps 12 times a second (the form loses its lock)
vec3 decohere(vec3 q){vec3 o=vec3(0.);${unroll(2,k=>`vec4 A=uDecA[${k}];if(A.x>0.){vec4 D=uDec[${k}];vec3 e=q-D.xyz;float w=exp(-dot(e,e)/(D.w*D.w));
  float ph=A.y;o+=A.x*w*vec3(sin(q.y*11.+ph),sin(q.z*13.+ph*1.3),sin(q.x*9.+ph*.7));}`)}return o;}
// s: the region's swell along p, looked up per ray every few steps (it changes slowly with the direction)
float swellAt(vec3 p){return swellOf(p).a;}
float mapK(vec3 p,float it,float s){vec3 q=p/s;if(uDecOn>0.)q+=decohere(q);return fdeN(q,it)*s;}
float mapT(vec3 p,float s,out vec4 trap){vec3 q=p/s;if(uDecOn>0.)q+=decohere(q);return fdeNT(q,uIt,trap)*s;}
float mapS(vec3 p,float s){return mapK(p,uIt,s);}
float mapA(vec3 p,float s){return mapK(p,max(${MIN_IT.toFixed(1)},uIt-1.),s);}
vec3 rayDir(vec2 uv){vec4 a=uInvVP*vec4(uv*2.-1.,-1.,1.),b=uInvVP*vec4(uv*2.-1.,1.,1.);return normalize(b.xyz/b.w-a.xyz/a.w);}`;
  const FS=`precision highp float;varying vec2 vUv;
uniform mat4 uVP;uniform vec3 uKey,uKeyC,uFillC,uRimC,uRimDir,uHi,uAcc,uWarn,uValid,uHaloC;
uniform float uEpsK,uOcc,uTrapK,uSheen,uRim,uGlow,uInner,uShim,uBeat,uTime,uBreath,uQ,uStress,uHaloK,uShK,uHueD,uHueR,uIri,uSwN;uniform int uAOn,uShN;
uniform vec4 uTch[4],uTchC[4],uWav[6],uWavC[6],uWavK[6],uLast[4];${LIFE?'\nuniform sampler2D uLifeL;uniform vec4 uLifeK;uniform vec3 uLifeC;':''}
${MAP}
float h31(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
// (forward differences from the hit's own distance d0: three more evaluations instead of four)
vec3 normalAt(vec3 p,float h,float s,float d0){vec3 g;for(int k=0;k<3;k++){vec3 o=vec3(0.);o[k]=h;g[k]=mapS(p+o,s);}return normalize(g-d0);}
// a hue turn (radians) about the grey axis
vec3 hueRot(vec3 c,float a){const vec3 k=vec3(.57735027);float ca=cos(a);return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca);}
// The key light's shadow: a sphere trace toward the light from just off the surface; the closest approach over the
// distance travelled softens its edge (penumbra uShK). Without steps (quality 2, 3): two taps toward the light.
float shadowAt(vec3 p,vec3 n,float s,float e){
  if(uShN<=0){float a=clamp(min(mapA(p+uKey*.05,s)/.05,mapA(p+uKey*.16,s)/.16)*1.1+.1,0.,1.);return a*a*(3.-2.*a);}
  vec3 o=p+n*e*1.5;float res=1.,t=.004+e;
  for(int i=0;i<16;i++){if(i>=uShN)break;float h=mapS(o+uKey*t,s);res=min(res,uShK*h/t);if(res<.02)break;t+=clamp(h*${(fc.fudge).toFixed(3)},.004,.16);if(t>1.4)break;}
  res=clamp(res,0.,1.);return res*res*(3.-2.*res);}
vec3 shade(vec3 p,vec3 rd,float t,out float aoOut){
  vec4 sw=swellOf(p),trap;float e=max(t*uPix*uEpsK,1e-5),s=sw.a,d0=mapT(p,s,trap);vec3 n=normalAt(p,e*2.,s,d0);
  // occlusion: the estimator along the normal at growing distances, deep in the crevices; the second tap (a few pixels
  // out, the first where there is only one) also says whether the point is a ridge (open) or a pore (closed)
  float ao=0.,w=1.,cav=1.;for(int i=0;i<5;i++){if(i>=uAOn)break;float h=.006+.006*float(i*i+i),dd=i==0?mapS(p+n*h,s):mapA(p+n*h,s);if(i<2)cav=clamp(dd/h,0.,2.);ao+=(h-dd)*w;w*=.62;}
  ao=clamp(1.-ao*10.*uOcc,0.,1.);float ot=clamp(pow(clamp(trap.x,0.,1.),.35)*1.15,0.,1.);ao*=mix(1.,.15+.85*ot,clamp(uOcc*.8,0.,1.));aoOut=ao;
  float ridge=clamp((cav-1.)*.6,0.,.6),pore=clamp(1.-cav,0.,1.);
  // colour: the region's own hue (its subsystem, sw.rgb), turned by the recursion's orbit (traps): the depths toward the
  // palette's depth side, darker and denser, the ridges along the arc toward the far pole, lighter; grazing angles turn
  // further (iridescence)
  float tk=uTrapK*(.55*smoothstep(.0,.6,trap.y)+.45*smoothstep(.1,.9,sqrt(trap.x)))+(1.-uTrapK)*.5;
  vec3 base=sw.rgb,deep=hueRot(base,uHueD)*.32,bright=hueRot(base,uHueR)*1.3;float lb=dot(deep,vec3(.2126,.7152,.0722));deep=max(mix(vec3(lb),deep,1.35),0.);
  vec3 alb=mix(deep,base,smoothstep(.05,.5,tk));alb=mix(alb,bright,clamp(smoothstep(.5,1.,tk)*.8+ridge*.5,0.,1.));alb*=1.-.6*pore;
  float nv=clamp(dot(n,-rd),0.,1.),fr=1.-nv;alb=max(hueRot(alb,uIri*fr*fr),0.);
  // light: a hard key from the side and above (its shadow traced), a dim fill the crevices lose (taking the surface's
  // colour again where less light reaches), a back light in the far pole's hue on the silhouette. Materials: glassy,
  // metallic ridges and exposed surfaces (a sharp highlight tinted by their colour, a soft reflection at grazing angles),
  // matte depths
  float nl=dot(n,uKey),sh=nl>0.?shadowAt(p,n,s,e):0.,dif=clamp(nl,0.,1.)*sh;
  float sky=.55+.45*n.y,bnc=clamp(-n.y*.6+.2,0.,1.);
  vec3 lin=uKeyC*dif*(.4+.6*ao)+uFillC*(sky+bnc*.5)*ao*ao*(.5+alb*3.);
  float gl=clamp(ridge*.8+smoothstep(.45,.9,tk)*.6+smoothstep(.55,1.,ao)*.4,0.,1.)*ao;
  vec3 hal=normalize(uKey-rd);float nh=clamp(dot(n,hal),0.,1.),shin=mix(28.,128.,gl);
  float spe=pow(nh,shin)*(shin+8.)*.016*(.5+uSheen)*(.06+.94*gl)*dif;
  vec3 sc=mix(vec3(1.),normalize(bright+1e-4)*1.73,.35+.4*gl);
  // (glassy: a studio's soft reflection, the key's side bright, at grazing angles more)
  vec3 rf=reflect(rd,n);float env=smoothstep(-.1,.9,dot(rf,uRimDir))*pow(fr,3.)*gl*ao,fe=(.04+.96*pow(fr,5.))*(.35+.65*gl)*ao*(rf.y>-.3?1.:.3);
  vec3 envK=uKeyC*.22*smoothstep(-.3,.9,dot(rf,uKey))*fe;
  float rim=pow(fr,3.)*clamp(dot(n,uRimDir)*.8+.2,0.,1.)*ao;
  vec3 c=alb*lin+sc*(uKeyC*spe+envK)+uRimC*(rim*uRim*(.5+.7*gl)+env*.6);
  // ambient glints on the beat: rare points of light where a glassy ridge catches the key, in the region's colour, more
  // of them where a region holds more files (its swell), a few pixels wide at any distance
  if(uShim>0.&&uQ<2.5){float lv=floor(log2(e*3.)),cs=exp2(lv);vec3 g=floor(p/cs);float hs=h31(g+lv*17.),rw=clamp((s-1.)/max(uSwN,1e-3),0.,1.);
    if(hs>.9994-.0024*rw){float tw=.5+.5*sin(uTime*(1.7+hs*3.)+hs*90.);c+=mix(normalize(bright+1e-4)*2.2,uHi,.3)*pow(tw,6.)*(.3+.7*uBeat)*uShim*ao*3.*smoothstep(.55,.95,nh)*sh*(.4+gl);}}
  // events on the surface
  float cre=1.-ao;cre*=cre;vec3 em=vec3(0.);
  ${unroll(4,k=>`vec4 C=uTchC[${k}];if(C.w>0.){vec4 T=uTch[${k}];float d=length(p-T.xyz),a=T.w;
    float r1=.03+a*.15,ring=exp(-pow((d-r1)*30.,2.))*exp(-a*.6)+exp(-pow((d-r1*.6)*40.,2.))*exp(-a*.9)*.7+exp(-pow((d-r1*.3)*55.,2.))*exp(-a*1.3)*.5;
    float core=exp(-d*d*700.)*(1.-smoothstep(0.,3.,a)),halo=exp(-d*d*25.)*exp(-a*.45);
    em+=C.rgb*C.w*(ring*(.6+.6*ao+ridge)*2.4+core*4.+halo*(.25+cre*3.5));}`)}
  ${unroll(6,k=>`vec4 K=uWavK[${k}];if(K.y>0.){vec4 W=uWav[${k}];float d=length(p-W.xyz),a=W.w;vec3 wc=uWavC[${k}].rgb;
    if(K.x<.5){float r=a*K.z,front=exp(-pow((d-r)*10.,2.))+exp(-pow((d-r+.06)*24.,2.))*.5,after=step(d,r)*exp(-(r-d)*2.2)*.35;em+=wc*K.y*(front*(.8+.8*ao+ridge)+after*(ao+cre))*(1.-smoothstep(2.4,3.,r))*1.6;}
    else if(K.x<1.5){float r=max(0.,K.w-a*K.z),front=exp(-pow((d-r)*20.,2.))*step(.002,r);em+=wc*K.y*(front*(.4+.6*ao)+exp(-d*d*30.)*.25*exp(-a*.4)*ao);}
    else if(K.x<2.5){float g=exp(-d*d/(K.w*K.w))*smoothstep(0.,.5,a)*exp(-a*.35);em+=wc*K.y*g*(.35+cre*3.2+ridge*.6);}
    else{float r=a*K.z,front=exp(-pow((d-r)*9.,2.))+exp(-pow((d-r*.7)*14.,2.))*.4,flood=step(d,r)*exp(-a*.28)*(.2+cre*4.+ridge*.8);em+=wc*K.y*(front*(2.2+ridge*2.)+flood);}}`)}
  // inner light: what verified milestones leave in their regions, and the unlock everywhere
  vec3 u=normalize(p);float il=uInner*.1;${unroll(4,k=>`vec4 Lr=uLast[${k}];if(Lr.w>0.)il+=Lr.w*exp((dot(u,Lr.xyz)-1.)/.1)*.3;`)}
  em+=uAcc*il*cre*cre*(.7+.3*uBreath)*2.;
${LIFE?`  // digital life: where the motes gather and rest, and along the threads they keep using, their light pools in the
  // relief around them (mostly in the crevices), in their own light turned toward the region's hue
  {vec4 LL=texture2D(uLifeL,oct(u));float lg=LL.r*uLifeK.x+LL.g*uLifeK.y;if(lg>.002){vec3 lc=mix(uLifeC,normalize(base+1e-4)*1.6,.35);em+=lc*lg*uLifeK.w*(.2+cre*2.4+ridge*.45)*(.35+.65*ao);}}
`:''}  // decoherence: static crackles in the warning colour, the region dims
  float dim=0.;vec3 qd=p/sw.a;${unroll(2,k=>`vec4 A=uDecA[${k}];if(A.x>0.){vec4 D=uDec[${k}];vec3 e2=qd-D.xyz;float w2=exp(-dot(e2,e2)/(D.w*D.w));
    float st=step(.8,h31(floor(p*140.)+floor(uTime*15.)*7.13));em+=uWarn*A.z*w2*(st*(.4+cre*1.4)+cre*.35*(.6+.4*sin(uTime*29.+p.x*40.)));dim=max(dim,w2*A.z);}`)}
  c*=1.-.45*dim;
  return c+em*uGlow;}
uniform sampler2D uMarch;
void main(){
  // the march pass's result for this pixel: a hit (x > 0, its distance), the silhouette's edge (y: the closest approach
  // in pixels, z: where), or the void (w: how close the ray came, for the halo)
  vec4 M=texelFetch(uMarch,ivec2(gl_FragCoord.xy),0);vec3 rd=rayDir(vUv),ro=uCamF;
  if(M.x<=0.&&M.y>=2.2){gl_FragColor=vec4(uHaloC*uHaloK*exp(-max(M.w,0.)*24.)*.35,0.);return;}
  bool hit=M.x>0.;float ts=hit?M.x:M.z,k=hit?1.:1.-smoothstep(.6,2.2,M.y),ao;vec3 c=shade(ro+rd*ts,rd,ts,ao);
  vec3 halo=uHaloC*uHaloK*exp(-max(M.w,0.)*24.)*.35;
  gl_FragColor=hit?vec4(c,max(ts,1e-4)):vec4(c*k+halo*(1.-k),-k);}`;
  // The march pass: the coarse pass cone-marched each 2 x 2 block (half this target's resolution); a pixel inside a cone
  // that stayed clear misses the form; otherwise the ray starts where the cones around it touched the surface, and is
  // traced (over-relaxed sphere tracing, Keinert et al. 2014) to the surface. It writes a float target the shading reads.
  const MARCH=`precision highp float;varying vec2 vUv;uniform float uEpsK;uniform int uSteps;uniform sampler2D uCoarse;
${MAP}
void main(){
  vec3 rd=rayDir(vUv),ro=uCamF;
  float B=dot(ro,rd),C=dot(ro,ro)-uRB*uRB,h=B*B-C;
  if(h<0.){gl_FragColor=vec4(-1.,1e3,0.,1e3);return;}
  h=sqrt(h);float t=max(-B-h,0.),tmax=-B+h;
  {ivec2 cs=textureSize(uCoarse,0),c0=ivec2(floor(gl_FragCoord.xy*.5-.5));float tc=1e9,mc=1e9;bool clear=false;
    for(int j=0;j<4;j++){float v=texelFetch(uCoarse,clamp(c0+ivec2(j%2,j/2),ivec2(0),cs-ivec2(1)),0).r;if(v<0.){clear=true;mc=min(mc,-v);}else tc=min(tc,v);}
    if(clear){gl_FragColor=vec4(-1.,1e3,0.,mc);return;}
    t=max(t,tc*(1.-uPix*2.));}
  float tm=t,mr=1e9,md=1e9,om=1.35,prev=0.,stepL=0.,tp=t;bool hit=false;const float FU=${(fc.fudge).toFixed(3)};
  float sr=swellAt(ro+rd*t);
  for(int i=0;i<260;i++){if(i>=uSteps)break;vec3 pp=ro+rd*t;if(i%6==5)sr=swellAt(pp);float d=mapK(pp,uIt,sr),e=max(t*uPix*uEpsK,1e-5);
    // the spheres no longer overlap: back to the last point, a plain step from there, plain steps from now on
    if(om>1.&&d+prev<stepL){om=1.;t=tp+prev*FU;continue;}
    if(d<e){hit=true;break;}float ratio=d/e;if(ratio<mr){mr=ratio;tm=t;}md=min(md,d);tp=t;prev=d;stepL=d*FU*om;t+=stepL;if(t>tmax)break;}
  if(!hit&&t<tmax)hit=true;
  gl_FragColor=hit?vec4(t,0.,t,0.):vec4(-1.,mr,tm,md);}`;
  // The coarse pass: the distance a cone of four pixels' radius travels before it touches the form, or (negative) how
  // clear of the form a cone that never touched it stayed.
  const COARSE=`precision highp float;varying vec2 vUv;uniform float uConeK;uniform int uCSteps;
${MAP}
void main(){vec3 rd=rayDir(vUv),ro=uCamF;float B=dot(ro,rd),C=dot(ro,ro)-uRB*uRB,h=B*B-C;if(h<0.){gl_FragColor=vec4(-1.);return;}h=sqrt(h);
  float t=max(-B-h,0.),tmax=-B+h,mc=1e9,pix=uPix*2.;
  float sr=1.;for(int i=0;i<200;i++){if(i>=uCSteps){gl_FragColor=vec4(t);return;}vec3 pp=ro+rd*t;if(i%4==0)sr=swellAt(pp);float d=mapS(pp,sr),cone=t*pix*uConeK*.5;if(d<cone){gl_FragColor=vec4(t);return;}mc=min(mc,d-cone);t+=d*${(fc.fudge).toFixed(3)};if(t>tmax)break;}
  gl_FragColor=vec4(-max(mc,1e-4));}`;
  // The composite (in the scene, full resolution): the fractal's target upsampled (Catmull-Rom on the colour, bilinear on
  // the coverage), its depth written from the nearest texel's hit, so sites and signals hide behind the form.
  const COMPOSITE=`precision highp float;varying vec2 vUv;uniform sampler2D uFrac;uniform vec2 uFracSize;uniform mat4 uVP,uInvVP;uniform vec3 uCamF;uniform float uWSg;
vec3 rayDir(vec2 uv){vec4 a=uInvVP*vec4(uv*2.-1.,-1.,1.),b=uInvVP*vec4(uv*2.-1.,1.,1.);return normalize(b.xyz/b.w-a.xyz/a.w);}
vec3 cr(vec2 uv){vec2 sp=uv*uFracSize,tp=floor(sp-.5)+.5,f=sp-tp,w0=f*(-.5+f*(1.-.5*f)),w1=1.+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.-1.5*f)),w3=f*f*(-.5+.5*f),w12=w1+w2,o12=w2/w12;
  vec2 t0=(tp-1.)/uFracSize,t3=(tp+2.)/uFracSize,t12=(tp+o12)/uFracSize;
  vec3 c=texture2D(uFrac,vec2(t12.x,t0.y)).rgb*w12.x*w0.y+texture2D(uFrac,vec2(t0.x,t12.y)).rgb*w0.x*w12.y+texture2D(uFrac,t12).rgb*w12.x*w12.y
    +texture2D(uFrac,vec2(t3.x,t12.y)).rgb*w3.x*w12.y+texture2D(uFrac,vec2(t12.x,t3.y)).rgb*w12.x*w3.y;
  return c/(w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y);}
void main(){vec2 sp=vUv*uFracSize-.5;ivec2 i0=ivec2(floor(sp)),mx=ivec2(uFracSize)-1;vec2 f=fract(sp);float cov=0.;
  for(int j=0;j<4;j++){ivec2 o=ivec2(j%2,j/2);float a=texelFetch(uFrac,clamp(i0+o,ivec2(0),mx),0).a,c=a>0.?1.:-a;cov+=c*(o.x==1?f.x:1.-f.x)*(o.y==1?f.y:1.-f.y);}
  float tn=texelFetch(uFrac,clamp(ivec2(floor(vUv*uFracSize)),ivec2(0),mx),0).a;
  gl_FragColor=vec4(max(cr(vUv),0.),clamp(cov,0.,1.));
  if(tn>0.){vec4 cl=uVP*vec4((uCamF+rayDir(vUv)*tn)*uWSg,1.);gl_FragDepth=clamp(cl.z/cl.w*.5+.5,0.,1.);}else gl_FragDepth=1.;}`;
  const quadGeo=keep(new THREE.PlaneGeometry(2,2));
  const QVS='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const pass=(fragmentShader,uniforms)=>{const m=keep(new THREE.ShaderMaterial({uniforms,vertexShader:QVS,fragmentShader,depthTest:false,depthWrite:false,blending:THREE.NoBlending}));
    const sc=new THREE.Scene(),me=new THREE.Mesh(quadGeo,m);me.frustumCulled=false;sc.add(me);return {scene:sc,material:m};};
  const fracPass=pass(FS,R),marchPass=pass(MARCH,R),coarsePass=pass(COARSE,R),ortho=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const rtOpts={type:THREE.HalfFloatType,depthBuffer:false,generateMipmaps:false};
  const fracRT=keep(new THREE.WebGLRenderTarget(4,4,{...rtOpts,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}));
  const coarseRT=keep(new THREE.WebGLRenderTarget(4,4,{...rtOpts,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter}));
  const marchRT=keep(new THREE.WebGLRenderTarget(4,4,{type:THREE.FloatType,depthBuffer:false,generateMipmaps:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter}));
  R.uCoarse.value=coarseRT.texture;R.uMarch={value:marchRT.texture};
  const CU={uFrac:{value:fracRT.texture},uFracSize:{value:new THREE.Vector2(4,4)},uVP:R.uVP,uInvVP:R.uInvVP,uCamF:R.uCamF,uWSg:R.uWSg};
  const compositeMat=keep(new THREE.ShaderMaterial({uniforms:CU,vertexShader:QVS,fragmentShader:COMPOSITE,depthTest:true,depthWrite:true,depthFunc:THREE.AlwaysDepth,transparent:false,
    blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor}));
  const composite=add(new THREE.Mesh(quadGeo,compositeMat),0);composite.userData.fractal=R;// (read-only, for tests)
  // The two raymarch passes render into their own targets right before the composite draws (inside the scene's frame,
  // so the host's GPU timer counts them), at the quality's share of the scene's resolution.
  let fracScale=FRAC_SCALE[0];
  // The share follows how much of the frame the form covers: a close-up that fills it is drawn at up to 0.8 of the share,
  // so its cost stays near the framed view's (in steps of 0.04, so the targets are rarely reallocated).
  const coverage=()=>{const d=camera.position.length(),Rw=R0*(1+SWELL)*gsNow*WS;if(d<=Rw*1.01)return 1;
    const r=Rw/Math.sqrt(d*d-Rw*Rw)/Math.tan(camera.fov*Math.PI/360);return Math.min(1,Math.PI*r*r/(4*Math.max(.5,camera.aspect)));};
  composite.onBeforeRender=renderer=>{
    const k=Math.round(clamp(Math.sqrt(.32/Math.max(.01,coverage())),.8,1)*25)/25,sc=fracScale*k;
    const [W,H]=ctx.pipeline.size,fw=Math.max(2,Math.round(W*sc)),fh=Math.max(2,Math.round(H*sc));
    if(fracRT.width!==fw||fracRT.height!==fh){fracRT.setSize(fw,fh);marchRT.setSize(fw,fh);coarseRT.setSize(Math.ceil(fw/2),Math.ceil(fh/2));CU.uFracSize.value.set(fw,fh);}
    R.uPix.value=2*Math.tan(camera.fov*Math.PI/360)/fh;
    const prev=renderer.getRenderTarget();
    renderer.setRenderTarget(coarseRT);renderer.render(coarsePass.scene,ortho);
    renderer.setRenderTarget(marchRT);renderer.render(marchPass.scene,ortho);
    renderer.setRenderTarget(fracRT);renderer.render(fracPass.scene,ortho);
    renderer.setRenderTarget(prev);};
  // ---- Shared sprite uniforms ---------------------------------------------------------------------------------------
  const U={uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},uV:{value:0},uWSg:R.uWSg};
  const glow=(vertexShader,fragmentShader,extra={})=>keep(new THREE.ShaderMaterial({uniforms:{...U,...extra},vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending}));
  function pointsOf(layout,cap=64){
    const all={position:3,...layout},g=new THREE.BufferGeometry(),self={geometry:g,capacity:0,arrays:{},n:0};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(cap,self.capacity);while(c<n)c*=2;
      for(const [name,size] of Object.entries(all)){const arr=new Float32Array(c*size),old=self.arrays[name];if(old)arr.set(old.subarray(0,Math.min(old.length,arr.length)));
        self.arrays[name]=arr;g.deleteAttribute(name);const at=new THREE.BufferAttribute(arr,size);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,at);}
      self.capacity=c;};
    self.ensure(cap);g.setDrawRange(0,0);
    self.write=(name,i,a=0,b=0,c=0,d=0)=>{if(i>=self.capacity)self.ensure(i+1);const s=all[name],o=i*s,x=self.arrays[name];x[o]=a;if(s>1)x[o+1]=b;if(s>2)x[o+2]=c;if(s>3)x[o+3]=d;};
    self.commit=n=>{g.setDrawRange(0,n);self.n=n;for(const name of Object.keys(all))g.attributes[name].needsUpdate=true;};
    self.dispose=()=>g.dispose();keep(self);return self;}
  // ---- Sites: one light per file on the surface (CPU positions, the GPU draws a soft core, a glint and a birth ring) ---
  const site=pointsOf({sC:4,sS:4},256);
  const siteMat=glow(`attribute vec4 sC,sS;uniform float uPx,uWSg;uniform vec2 uRes;uniform sampler2D uFrac;uniform vec2 uFracSize;varying vec4 vC;varying vec3 vS;
    void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float k=projectionMatrix[1][1]*uRes.y*.5/max(-mv.z,.1);
      vec2 uv=gl_Position.xy/gl_Position.w*.5+.5;float tf=texelFetch(uFrac,clamp(ivec2(uv*uFracSize),ivec2(0),ivec2(uFracSize)-1),0).a,ts=length(mv.xyz)/uWSg;
      float vis=tf>0.?1.-smoothstep(.02,.07,ts-tf):1.;
      gl_PointSize=clamp(max(sS.x*uPx,sS.y*k),1.,220.*uPx);vC=sC*vis;vS=sS.zwz;if(vis<.01)gl_Position=vec4(0.,0.,2.,1.);}`,
    `varying vec4 vC;varying vec3 vS;void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q);if(r>1.)discard;
      float g=exp(-r*r*26.)*2.2+exp(-r*r*7.)*.55+exp(-r*r*2.2)*.14,x=pow(max(0.,1.-abs(q.x)*8.),3.)*pow(1.-abs(q.y),3.)+pow(max(0.,1.-abs(q.y)*8.),3.)*pow(1.-abs(q.x),3.);g+=x*.8*vS.x;
      if(vS.y>0.){float rr=vS.y;g+=exp(-pow((r-rr)*14.,2.))*(1.-rr)*1.2;}
      gl_FragColor=vec4(vC.rgb*g*vC.a,1.);}`,{uFrac:CU.uFrac,uFracSize:CU.uFracSize});
  siteMat.depthTest=false;add(new THREE.Points(site.geometry,siteMat),2);
  // ---- Threads: dependencies as faint arcs of light between sites (instanced ribbons, curve on the GPU) --------------
  const ribbon=keep(new THREE.BufferGeometry());ribbon.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,0,1,0,1,1,0],3));ribbon.setIndex([0,1,2,2,1,3]);
  const thr=(()=>{const g=new THREE.InstancedBufferGeometry();g.index=ribbon.index;g.setAttribute('position',ribbon.attributes.position);const self={geometry:g,capacity:0,arrays:{},layout:{hA:4,hB:4,hP:4,hQ:4}};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(256,self.capacity);while(c<n)c*=2;for(const [k,s] of Object.entries(self.layout)){const a=new Float32Array(c*s),o=self.arrays[k];if(o)a.set(o);self.arrays[k]=a;g.deleteAttribute(k);
      const at=new THREE.InstancedBufferAttribute(a,s);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute(k,at);}self.capacity=c;};
    self.write=(k,i,a,b,c,d)=>{const s=self.layout[k],x=self.arrays[k],o=i*s;x[o]=a;x[o+1]=b;x[o+2]=c;x[o+3]=d;};
    self.commit=n=>{g.instanceCount=n;for(const k of Object.keys(self.layout))g.attributes[k].needsUpdate=true;};self.ensure(256);g.instanceCount=0;self.dispose=()=>g.dispose();keep(self);return self;})();
  const thrMat=glow(`attribute vec4 hA,hB,hP,hQ;uniform float uPx,uV,uThrK;uniform vec2 uRes;uniform vec3 uThrC,uSpark;uniform vec3 uCol[14];varying vec3 vC;varying float vV;
    vec3 bez(vec3 a,vec3 c,vec3 b,float u){float v=1.-u;return v*v*a+2.*v*u*c+u*u*b;}
    vec2 scr(vec4 c){return c.xy/max(c.w,1e-3)*uRes*.5;}
    float pulse(float a,float s,float u,float L){if(a<0.||s<=0.)return 0.;float f=a*2.2/max(L,.3);if(f>1.1)return 0.;return s*(exp(-pow((u-f)*L*2.2,2.))*1.8+step(u,f)*exp(-(f-u)*L*1.5)*.25);}
    void main(){vec3 a=hA.xyz,b=hB.xyz;float L=length(b-a);vec3 m=normalize(a+b+1e-4)*(max(length(a),length(b))+hP.x*L);
      float u0=hA.w,u1=hB.w,u=mix(u0,u1,position.x);vec4 ca=projectionMatrix*viewMatrix*vec4(bez(a,m,b,u0),1.),cb=projectionMatrix*viewMatrix*vec4(bez(a,m,b,u1),1.);
      vec2 d=scr(cb)-scr(ca);vec2 nn=length(d)>1e-4?normalize(vec2(-d.y,d.x)):vec2(0.,1.);float w=1.1*uPx;
      vec4 c=mix(ca,cb,position.x);c.xy+=nn*position.y*w/uRes*2.*c.w;gl_Position=c;vV=position.y;
      vec3 p=uCol[int(hQ.z+.5)]*pulse(uV-hP.z,hQ.x,u,L)+uCol[int(hQ.w+.5)]*pulse(uV-hP.w,hQ.y,u,L);
      vC=uThrC*uThrK*hP.y*(.6+.4*sin(u*3.1416))+p*.9;}`,
    `varying vec3 vC;varying float vV;void main(){float k=exp(-vV*vV*2.5);gl_FragColor=vec4(vC*k,1.);}`,
    {uThrK:{value:clamp(num(geo.threads,.8),0,1.6)},uThrC:{value:V3(pal.highlight.clone().lerp(pal.accent,.35),.12)},uSpark:{value:V3(pal.accent,1.5)},uCol:{value:COLS}});
  add(new THREE.Mesh(thr.geometry,thrMat),1);
  // ---- Signals: agents, their trails and injections, the bloom's burst (CPU points) ----------------------------------
  const fx=pointsOf({fC:4,fS:2},512);
  const fxMat=glow(`attribute vec4 fC;attribute vec2 fS;uniform float uPx;varying vec4 vC;varying float vSh;
    void main(){vec4 vp=viewMatrix*vec4(position,1.);gl_PointSize=clamp(fS.x*uPx,1.,200.);vC=fC;vSh=fS.y;gl_Position=projectionMatrix*vp;}`,
    `varying vec4 vC;varying float vSh;
    float tri(vec2 p){const float k=1.7320508;p.x=abs(p.x)-.5;p.y=p.y+.5/k;if(p.x+k*p.y>0.)p=vec2(p.x-k*p.y,-k*p.x-p.y)/2.;p.x-=clamp(p.x,-1.,0.);return -length(p)*sign(p.y);}
    void main(){vec2 q=gl_PointCoord*2.-1.;q.y=-q.y;float r=length(q),a=0.,g=exp(-r*r*4.5)*.45;int sh=int(vSh+.5);
      if(sh==0){a=max(0.,1.-(abs(q.x)*7.+abs(q.y)*1.15))+max(0.,1.-(abs(q.y)*7.+abs(q.x)*1.15))+exp(-r*r*30.)*1.4;}
      else if(sh==1){a=exp(-pow((r-.5)*10.,2.))*1.5+exp(-r*r*45.)*.9;}
      else if(sh==2){float d=abs(q.x)+abs(q.y);a=exp(-pow((d-.55)*10.,2.))*1.4+exp(-d*d*35.);}
      else if(sh==3){float t=atan(q.y,q.x),k=pow(abs(cos(t*3.)),10.);a=exp(-r*(7.-6.*k))*1.5;}
      else if(sh==4){float d=tri(q*1.25);a=exp(-pow(d*14.,2.))*1.4+exp(-r*r*40.);}
      else if(sh==5){a=exp(-pow((r-.62)*12.,2.))*1.2+exp(-pow((r-.32)*12.,2.))*1.2+exp(-r*r*50.);}
      else if(sh==8){a=exp(-r*r*6.);g=0.;}
      else{a=exp(-r*r*14.)*1.4;}
      a=(a+g)*(1.-smoothstep(.92,1.,r));gl_FragColor=vec4(vC.rgb*a*vC.a,1.);}`);
  add(new THREE.Points(fx.geometry,fxMat),4);
  // ---- Dust in the void (ambient; GPU points, pure functions of time) ------------------------------------------------
  const motes=pointsOf({mP:4,mS:4},MOTES);
  {const r=n=>rand(hash(`mote/${seed}/${n}`));
    for(let k=0;k<MOTES;k++){const u=r(k*5)*2-1,a=r(k*5+1)*TAU,q=1.25+Math.pow(r(k*5+2),.6)*2.6,s=Math.sqrt(1-u*u);
      motes.write('position',k,0,0,0);motes.write('mP',k,Math.cos(a)*s*q,u*q*.75,Math.sin(a)*s*q,r(k*5+3));motes.write('mS',k,.8+2.4*Math.pow(r(k*5+4),3),Math.floor(r(k*7)*3),0,0);}
    motes.commit(MOTES);}
  const moteMat=glow(`attribute vec4 mP,mS;uniform float uPx,uV,uDust;uniform vec3 uMC[3];varying vec3 vC;
    void main(){float s0=mP.w*6.2832;vec3 p=(mP.xyz*${(R0*WS).toFixed(2)}+${(R0*WS*.05).toFixed(2)}*vec3(sin(uV*.021+s0),sin(uV*.017+s0*1.7)*.6,cos(uV*.019+s0*2.3)));
      vec4 vp=viewMatrix*vec4(p,1.);float sz=(3.+mS.x*2.)*uPx;gl_PointSize=clamp(sz,3.,14.);vC=uMC[int(mS.y+.5)]*uDust*(.55+.45*sin(uV*.4+s0*3.))*3./sz;gl_Position=projectionMatrix*vp;}`,
    `varying vec3 vC;void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*3.5)*(1.-r),1.);}`,
    {uDust:{value:.07},uMC:{value:[V3(pal.highlight,.5),V3(pal.accent,.6),V3(pal.primary,1.1)]}});
  add(new THREE.Points(motes.geometry,moteMat),5);
  // ---- The bloom's burst: light leaving the surface (GPU points, from surface samples traced once, at the first bloom) --
  const burst=pointsOf({bO:4},BURST);let burstReady=false,burstTraced=false;
  const burstMat=glow(`attribute vec4 bO;uniform float uPx,uBA,uBK,uSc;uniform vec3 uBC,uBO,uAccB,uHiB;varying vec3 vC;
    void main(){vec3 o=bO.xyz;float delay=length(o-uBO)*.9,a=uBA-delay;if(a<0.||uBK<=0.){gl_Position=vec4(0.,0.,2.,1.);gl_PointSize=0.;vC=vec3(0.);return;}
      vec3 dir=normalize(o+.35*vec3(sin(bO.w*91.),sin(bO.w*57.),sin(bO.w*23.)));float travel=(1.-exp(-a*.9))/.9*(.4+.9*fract(bO.w*13.7));
      vec3 p=(o+dir*travel)*uSc;vec4 vp=viewMatrix*vec4(p,1.);gl_PointSize=clamp((2.5+4.*fract(bO.w*7.3))*uPx*(1.+.8*exp(-a*2.)),2.,16.);
      vC=mix(uHiB,uAccB,fract(bO.w*3.1))*uBK*exp(-a*.4)*smoothstep(0.,.12,a)*2.2;gl_Position=projectionMatrix*vp;}`,
    `varying vec3 vC;void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q);gl_FragColor=vec4(vC*exp(-r*r*4.),1.);}`,
    {uBA:{value:0},uBK:{value:0},uSc:{value:WS},uBO:{value:new THREE.Vector3()},uBC:{value:new THREE.Vector3()},uAccB:{value:V3(pal.accent,1.6)},uHiB:{value:V3(pal.highlight,1.4)}});
  add(new THREE.Points(burst.geometry,burstMat),3);
  // ---- Background: the void, a faint haze, the unlocks' dust and echoes (half resolution) ------------------------------
  const bgU={uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uDeep:{value:V3(pal.deep)},uHaze:{value:V3(pal.haze)},uAcc:{value:V3(pal.accent)},uHi:{value:V3(pal.highlight)},
    uV:{value:0},uQ:{value:0},uHazeK:{value:clamp(num(atm.haze,.7),0,1.6)},uStress:{value:0},uBloom:{value:0},uDustK:{value:0},uCorona:{value:0},uEcho:{value:0},uCtr:{value:new THREE.Vector3()},uRw:{value:R0*WS},
    uSeed:{value:new THREE.Vector3(rand(seed)*9,rand(seed+1)*9,rand(seed+2)*9)}};
  const background_=keep(new THREE.ShaderMaterial({uniforms:bgU,depthWrite:false,depthTest:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`precision highp float;varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam,uDeep,uHaze,uAcc,uHi,uSeed,uCtr;uniform float uV,uQ,uHazeK,uStress,uBloom,uDustK,uCorona,uEcho,uRw;
      float hh(vec3 p){p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
      void main(){vec4 pp=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(pp.xyz/pp.w-uCam);
        vec3 toC=uCtr-uCam;float dc=length(toC),ang=acos(clamp(dot(d,toC/dc),-1.,1.)),rad=asin(clamp(uRw/dc,0.,1.));
        vec3 c=uDeep*(1.+.6*smoothstep(-.6,.8,d.y));
        // a faint haze behind the form, a corona hugging its silhouette (stronger once unlocked), lifted by the bloom
        c+=uHaze*uHazeK*(.35*exp(-max(0.,ang-rad*.6)/(rad*.9))+.06)*(1.-.4*uStress);
        c+=mix(uHi,uAcc,.5)*(uCorona*.12+uBloom*.06)*exp(-max(0.,ang-rad*.92)/(rad*.12))*step(rad*.85,ang);
        // stardust (unlocked): fine points of light far away
        if(uDustK>0.){vec3 q=d*120.,g=floor(q);float s=hh(g+uSeed);if(s>.992){vec3 ct=g+.25+.5*vec3(hh(g+1.3),hh(g+2.7),hh(g+4.1));float r=length(q-ct);
          c+=uHi*exp(-r*r*40.)*uDustK*(.35+.65*hh(g*1.7))*(.6+.4*sin(uV*.6+s*60.))*.8;}}
        // echoes (unlocked): far soft glows of the form's light in a few seeded directions
        if(uEcho>0.){for(int k=0;k<3;k++){vec3 e=normalize(vec3(sin(uSeed.x+float(k)*2.1),.25*sin(uSeed.y+float(k)),cos(uSeed.x+float(k)*2.1)));c+=uAcc*uEcho*.05*exp(-(1.-dot(d,e))*30.);}}
        gl_FragColor=vec4(c,1.);}`}));
  // ---- Digital life: motes of light on the surface (life/fractal.js; only when the recipe has life on) ----------------
  // The ecosystem lives on a map of the sphere of directions (life/fractal.js): each inhabitant is drawn along its
  // direction at its altitude above the surface as drawn at that moment. The vertex shader traces that point itself (the
  // outermost point along the direction at the inhabitant's altitude from the form: sphere tracing toward the
  // estimator's offset surface, with the region's swell, at the drawn recursion), so the life rides the relief as the
  // form unfolds, swells, breathes and blooms, and each point tests its own visibility against the fractal's depth
  // (hidden behind the relief, as the sites are). Presentation only reads the ecosystem.
  //  motes     soft points in the light's colour turned toward their region's hue: dim while they drift, brighter in a
  //            gathering's halo; a fine tapered thread behind those that carry a site's light or seek a site (a
  //            recovered one in the valid colour);
  //  skimmers  short tapered streaks in the rim's light, in loose flocks;
  //  embers    larger, dimmer, warmer glows close to the surface;
  //  surface   where motes gather and embers rest, and along the threads they keep using, their light pools in the
  //            relief (the shading pass reads llTex, rebuilt at each tick).
  // Followers (quality: how many) sit on the leader's own recorded path; quality never changes the ecosystem. Two draw
  // calls (threads and streaks, points) and one texture lookup per shaded pixel.
  let lifeStatsNow={drawn:0,followers:0,trailSegments:0,drawCalls:0},updateLife=()=>{};
  function onLifeParams(){}
  function lifeStats(){return {...lifeStatsNow};}
  if(LIFE){
    const grammar=createFractalGrammar(recipe);LIFE.create(grammar);
    const CAP=grammar.capacity,MAXP=4,MAXR=6;
    // per quality (0 best .. 3 least): mote and skimmer followers, thread and streak segments
    const MOTEF=[2,1,1,0],SKIMF=[2,1,0,0],TSEG=[4,3,2,2],SSEG=[3,2,2,1];
    const C3=(c,k=1)=>[c.r*k,c.g*k,c.b*k];
    const cMote=C3(pal.accent.clone().lerp(pal.highlight,.15)),cCarry=C3(pal.accent,1.05),cValid=C3(pal.valid),cSkim=C3(pal.highlight.clone().lerp(rimCol,.55)),cEmber=C3(pal.accent.clone().lerp(pal.primary,.4));
    const NP=CAP*MAXP,NR=CAP*MAXR;
    const pDir=new Float32Array(NP*3),pL=new Float32Array(NP*4),pC=new Float32Array(NP*4);
    const attr=(a,n)=>{const x=new THREE.BufferAttribute(a,n);x.setUsage(THREE.DynamicDrawUsage);return x;};
    const iattr=(a,n)=>{const x=new THREE.InstancedBufferAttribute(a,n);x.setUsage(THREE.DynamicDrawUsage);return x;};
    const pGeo=keep(new THREE.BufferGeometry());pGeo.setAttribute('position',attr(pDir,3));pGeo.setAttribute('aL',attr(pL,4));pGeo.setAttribute('aC',attr(pC,4));pGeo.setDrawRange(0,0);
    // threads and streaks: one quad per segment (along 0..1, side -1..1), expanded across the segment on screen
    const rA=new Float32Array(NR*4),rB=new Float32Array(NR*4),rCA=new Float32Array(NR*3),rCB=new Float32Array(NR*3),rW=new Float32Array(NR*3);
    const rGeo=keep(new THREE.InstancedBufferGeometry());
    rGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,-1,0,0,1,0,1,-1,0,1,1,0]),3));rGeo.setIndex([0,2,1,1,2,3]);
    rGeo.setAttribute('iA',iattr(rA,4));rGeo.setAttribute('iB',iattr(rB,4));rGeo.setAttribute('iCA',iattr(rCA,3));rGeo.setAttribute('iCB',iattr(rCB,3));rGeo.setAttribute('iW',iattr(rW,3));rGeo.instanceCount=0;
    // (uLifeP: x the margin a pit is bridged by (fractal units), y the smallest size in pixels at 1080 lines, z the largest)
    const lifeU={...R,uFrac:CU.uFrac,uFracSize:CU.uFracSize,uPx:U.uPx,uRes:U.uRes,uLifeP:{value:new THREE.Vector4(.04,2.2,7,0)}};
    const LIFE_VS=`${MAP}
uniform float uPx,uWSg;uniform vec2 uRes;uniform sampler2D uFrac;uniform vec2 uFracSize;uniform vec4 uLifeP;
// along direction u at altitude h above the drawn surface, closed over its pits: sphere tracing from outside to the
// outermost point within uLifeP.x of the form (the estimator's offset surface, with the region's swell), then back down
// by the rest of that margin, so a pit narrower than about twice the margin is bridged and the life rides the relief
// rather than dropping into every hole; a ray that slips through the form (w: 0) is not drawn
vec4 lifeAt(vec3 u,float h){float H=max(h,uLifeP.x),s=swellOf(u).a,r=uRB+H;for(int i=0;i<30;i++){float d=fdeN(u*(r/s),uIt)*s-H;if(d<2e-4)break;r-=max(d*${fc.fudge.toFixed(3)},1e-4);if(r<.03)break;}
  r-=H-h;return vec4(u*r*uWSg,step(uRB*.4,r));}
// hidden behind the relief: the fractal's own hit distance at the point's pixel, with a small tolerance
float lifeVis(vec4 clip,vec3 mv){vec2 uv=clip.xy/clip.w*.5+.5;float tf=texelFetch(uFrac,clamp(ivec2(uv*uFracSize),ivec2(0),ivec2(uFracSize)-1),0).a,ts=length(mv)/uWSg;return tf>0.?1.-smoothstep(.02,.07,ts-tf):1.;}
float lifePx(float size,float w){return size*uWSg*projectionMatrix[1][1]*uRes.y*.5/max(w,.05);}`;
    const lifeMat=(vertexShader,fragmentShader)=>keep(new THREE.ShaderMaterial({uniforms:lifeU,vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
    // points: position the direction; aL altitude, size (fractal units: the core's diameter; the sprite holds a halo
    // around it), how much the region's hue turns it; aC colour
    const pMat=lifeMat(`${LIFE_VS}attribute vec4 aL,aC;varying vec3 vC;
      void main(){vec3 u=normalize(position);vec4 P=lifeAt(u,aL.x);vec4 mv=viewMatrix*vec4(P.xyz,1.);gl_Position=projectionMatrix*mv;
        float vis=lifeVis(gl_Position,mv.xyz)*P.w,fl=uLifeP.y*uPx,sz=clamp(lifePx(aL.y,-mv.z),fl,uLifeP.z*uPx);gl_PointSize=sz*4.;
        vec3 reg=normalize(swellOf(u).rgb+1e-4)*1.73,c=aC.rgb*mix(vec3(1.),reg,aL.z);
        vC=c*aC.a*vis*clamp(fl*1.6/sz,.3,1.);if(vis<.01||aC.a<=0.)gl_Position=vec4(0.,0.,2.,1.);}`,
      `varying vec3 vC;void main(){vec2 d=gl_PointCoord*2.-1.;float r=dot(d,d);if(r>1.)discard;gl_FragColor=vec4((vC*(exp(-r*11.)*1.4+exp(-r*2.4)*.3)+vec3(dot(vC,vec3(.3,.5,.2)))*exp(-r*34.)*.7)*(1.-r),1.);}`);
    // segments: iA, iB the ends (direction, altitude); iCA, iCB their light; iW width (fractal units), its taper at both ends
    const rMat=lifeMat(`${LIFE_VS}attribute vec4 iA,iB;attribute vec3 iCA,iCB,iW;varying vec3 vC;varying float vS;
      void main(){vec3 ua=normalize(iA.xyz),ub=normalize(iB.xyz);vec4 pa=lifeAt(ua,iA.w),pb=lifeAt(ub,iB.w),ma=viewMatrix*vec4(pa.xyz,1.),mb=viewMatrix*vec4(pb.xyz,1.);
        vec4 ca=projectionMatrix*ma,cb=projectionMatrix*mb;if(ca.w<.05||cb.w<.05||pa.w*pb.w<.5){gl_Position=vec4(0.,0.,2.,1.);vC=vec3(0.);vS=0.;return;}
        vec2 sa=ca.xy/ca.w*uRes*.5,sb=cb.xy/cb.w*uRes*.5,d=sb-sa;float L=length(d);vec2 nr=L>1e-3?vec2(-d.y,d.x)/L:vec2(0.,1.);
        float t=position.x;vec4 c=t<.5?ca:cb;vec3 mv=t<.5?ma.xyz:mb.xyz,u=t<.5?ua:ub;float fl=uLifeP.y*uPx,px=clamp(lifePx(iW.x,c.w),fl*.75,uLifeP.z*uPx*.6)*mix(iW.y,iW.z,t);
        float vis=lifeVis(c,mv);c.xy+=nr*position.y*px/uRes*c.w;gl_Position=c;vS=position.y;
        vC=mix(iCA,iCB,t)*mix(vec3(1.),normalize(swellOf(u).rgb+1e-4)*1.73,.4)*vis*clamp(fl*1.3/max(px,1e-3),.3,1.);}`,
      `varying vec3 vC;varying float vS;void main(){gl_FragColor=vec4(vC*exp(-vS*vS*2.8),1.);}`);
    add(new THREE.Mesh(rGeo,rMat),2);add(new THREE.Points(pGeo,pMat),2);
    // The surface's light: each texel's place on the map (fixed), the gatherings splatted on the map's grid at each tick
    const GN=64,llX=new Float32Array(LLN*LLN),llZ=new Float32Array(LLN*LLN),llIn=new Uint8Array(LLN*LLN),gat=new Float32Array(GN*GN),gtmp=new Float32Array(GN*GN);
    {const u=[0,0,0],m=[0,0,0];for(let y=0;y<LLN;y++)for(let x=0;x<LLN;x++){const q=y*LLN+x;octDecode((x+.5)/LLN*2-1,(y+.5)/LLN*2-1,u);lifeMap(u,m);llX[q]=m[0];llZ[q]=m[2];llIn[q]=Math.hypot(m[0],m[2])<LIFE_FIELD?1:0;}}
    const blur3=(a,t,n)=>{for(let j=0;j<n;j++){const o=j*n;t[o]=(3*a[o]+a[o+1])/4;for(let i=1;i<n-1;i++)t[o+i]=(a[o+i-1]+2*a[o+i]+a[o+i+1])/4;t[o+n-1]=(a[o+n-2]+3*a[o+n-1])/4;}
      for(let i=0;i<n;i++){a[i]=(3*t[i]+t[n+i])/4;for(let j=1;j<n-1;j++){const q=j*n+i;a[q]=(t[q-n]+2*t[q]+t[q+n])/4;}const q=(n-1)*n+i;a[q]=(t[q-n]+3*t[q])/4;}};
    const bil=(a,n,x,y)=>{if(x<0)x=0;else if(x>n-1.001)x=n-1.001;if(y<0)y=0;else if(y>n-1.001)y=n-1.001;const i=x|0,j=y|0,u=x-i,v=y-j,o=j*n+i;return (a[o]*(1-u)+a[o+1]*u)*(1-v)+(a[o+n]*(1-u)+a[o+n+1]*u)*v;};
    function buildLight(eco){
      const F0=eco.field.min[0],G0=eco.field.min[1],sx=GN/(eco.field.max[0]-F0),sz=GN/(eco.field.max[1]-G0),NX=eco.field.nx,fs=NX/GN,T=eco.field.data;gat.fill(0);
      for(let e=0;e<eco.capacity;e++){if(!eco.alive[e])continue;const s=eco.sp[e],m=eco.mode[e];
        const w=(s===MOTE?(m===LIFE_MODE.orbit?1:eco.carry[e]?.25:0):s===EMBER?(m===LIFE_MODE.settle?.6:.2):0)*Math.min(1,eco.fade[e]);if(w<=0)continue;
        const gx=(eco.px[e]-F0)*sx-.5,gz=(eco.pz[e]-G0)*sz-.5;if(gx<0||gz<0||gx>=GN-1||gz>=GN-1)continue;const i=gx|0,j=gz|0,u=gx-i,v=gz-j,o=j*GN+i;
        gat[o]+=w*(1-u)*(1-v);gat[o+1]+=w*u*(1-v);gat[o+GN]+=w*(1-u)*v;gat[o+GN+1]+=w*u*v;}
      blur3(gat,gtmp,GN);blur3(gat,gtmp,GN);
      const b8=x=>x<=0?0:x>=1?255:(x*255+.5)|0;
      for(let q=0;q<LLN*LLN;q++){if(!llIn[q]){llData[q*4]=0;llData[q*4+1]=0;continue;}
        const gx=(llX[q]-F0)*sx-.5,gz=(llZ[q]-G0)*sz-.5;llData[q*4]=b8(1-Math.exp(-bil(gat,GN,gx,gz)/1.1));
        llData[q*4+1]=b8(Math.max(0,bil(T,NX,(llX[q]-F0)*sx*fs-.5,(llZ[q]-G0)*sz*fs-.5)-.35)/2.5);}
      llTex.needsUpdate=true;
    }
    // The point `lag` ticks behind the presented position along the entity's recorded path (as in Stellar Forge).
    let pS=0,pW1=0,pHead=0,pK=10,pT=3;
    function pathPrep(eco,alpha){pK=eco.K;pT=eco.TRAIL_EVERY;const N=eco.tick;pS=N-1+alpha;pW1=pT*Math.floor((N-1)/pT)+1;pHead=eco.trailHead;}
    function pathAt(eco,e,P,lag,out){
      const K=pK,o=e*K,t=pS-lag,k1=pW1<pS-1e-6?1:2,t1=pW1-pT*(k1-1),ring=k=>o+((pHead-k+1+K*4)%K);
      if(t>=t1){const u=(pS-t)/Math.max(1e-6,pS-t1),q=ring(k1);out[0]=P[0]+(eco.tx[q]-P[0])*u;out[1]=P[1]+(eco.ty[q]-P[1])*u;out[2]=P[2]+(eco.tz[q]-P[2])*u;return out;}
      const j=(t1-t)/pT,f=Math.floor(j);let k=k1+f,w=j-f;if(k>=K){k=K;w=0;}
      const a=ring(k),b=ring(Math.min(K,k+1));out[0]=eco.tx[a]+(eco.tx[b]-eco.tx[a])*w;out[1]=eco.ty[a]+(eco.ty[b]-eco.ty[a])*w;out[2]=eco.tz[a]+(eco.tz[b]-eco.tz[a])*w;return out;
    }
    const upload=(geo,name,n)=>{const a=geo.attributes[name];a.clearUpdateRanges();a.addUpdateRange(0,n*a.itemSize);a.needsUpdate=true;};
    let lightEco=null,lightTick=-1;
    const hide=()=>{pGeo.setDrawRange(0,0);rGeo.instanceCount=0;R.uLifeK.value.set(0,0,0,0);lifeStatsNow={drawn:0,followers:0,trailSegments:0,points:0,drawCalls:2};};
    const D=[0,0,0],D0=[0,0,0],P3=[0,0,0],P4=[0,0,0],P5=[0,0,0],C=[0,0,0];
    const mix3=(a,b,k,o)=>{o[0]=a[0]+(b[0]-a[0])*k;o[1]=a[1]+(b[1]-a[1])*k;o[2]=a[2]+(b[2]-a[2])*k;return o;};
    updateLife=i=>{
      const v=i.life,eco=v&&v.eco;if(!eco||v.restoring)return hide();
      if(lightEco!==eco||lightTick!==eco.tick){buildLight(eco);lightEco=eco;lightTick=eco.tick;}
      // the music as the form shows it (musicLook: all 1 without music): the light the life pools in the relief, the
      // inhabitants' light, size and traces
      const M=musicLook(eco,v),gk=clamp(i.overrides.intensity??1,.4,1.3)*GLOW;
      R.uLifeK.value.set(1.1,.35,0,v.fadeIn*M.life*gk*.8);
      const q=clamp(Math.round(i.quality||0),0,3),alpha=v.alpha,tv=i.tview,seed=eco.seed,S=eco.sites,nS=S.count;
      pathPrep(eco,alpha);let np=0,nr=0,nf=0,nd=0;
      const point=(x,y,z,c,b,size,tint)=>{if(np>=NP||b<=.002)return;lifeDir(x,z,D);const o=np*3,o4=np*4;pDir[o]=D[0];pDir[o+1]=D[1];pDir[o+2]=D[2];
        pL[o4]=LIFE_ALT0+Math.max(0,y)*LIFE_ALT;pL[o4+1]=size*M.size;pL[o4+2]=tint;pL[o4+3]=0;pC[o4]=c[0];pC[o4+1]=c[1];pC[o4+2]=c[2];pC[o4+3]=b;np++;};
      // a soft thread through `n` samples of the path over `span` ticks: light and width taper to both ends; it keeps
      // the inhabitant's present altitude (only its way across the surface shows, never a climb as a streak of rain)
      const prof=u=>{const s=Math.sin(Math.PI*Math.pow(u,.7));return s>0?s:0;};
      const thread=(e,P,n,span,c,bright,width)=>{let w0=0;const y0=P[1];lifeDir(P[0],P[2],D0);
        for(let k=1;k<=n;k++){const u=k/n;pathAt(eco,e,P,span*u,P5);const p1=prof(u),w1=p1*bright;lifeDir(P5[0],P5[2],D);
          if(nr<NR){const a=nr*4,c3=nr*3;rA[a]=D0[0];rA[a+1]=D0[1];rA[a+2]=D0[2];rA[a+3]=LIFE_ALT0+Math.max(0,y0)*LIFE_ALT;rB[a]=D[0];rB[a+1]=D[1];rB[a+2]=D[2];rB[a+3]=LIFE_ALT0+Math.max(0,y0)*LIFE_ALT;
            rCA[c3]=c[0]*w0;rCA[c3+1]=c[1]*w0;rCA[c3+2]=c[2]*w0;rCB[c3]=c[0]*w1;rCB[c3+1]=c[1]*w1;rCB[c3+2]=c[2]*w1;rW[c3]=width;rW[c3+1]=.3+.7*(w0/Math.max(bright,1e-6));rW[c3+2]=.3+.7*p1;nr++;}
          w0=w1;D0[0]=D[0];D0[1]=D[1];D0[2]=D[2];}};
      for(let e=0;e<eco.capacity;e++){
        const vis=lifeVisibility(eco,e,v);if(vis<=.003)continue;
        const s=eco.sp[e],m=eco.mode[e];lifePosition(eco,e,alpha,P3);
        // a disturbed place (a decohering region's edge) dims the life around it
        const dist=Math.min(1,eco.sample(2,P3[0],P3[2])/1.2),gen=eco.gen[e],h=u01(seed,e,gen,31);
        let br=vis*(1-.55*dist)*M.bright*gk;nd++;
        if(s===MOTE){
          const k=eco.tgt[e],site=k>=0&&k<nS,rev=site?S.state(k)?.revive||0:0,carry=eco.carry[e]>0;
          mix3(cMote,carry?cCarry:cValid,carry?.55:m===LIFE_MODE.seek?Math.min(1,rev*1.4):0,C);
          const b=m===LIFE_MODE.orbit?1.9:m===LIFE_MODE.seek?1.3:m===LIFE_MODE.rest?.3:m===LIFE_MODE.disperse?.7:.8;
          point(P3[0],P3[1],P3[2],C,br*b*(.75+.5*h),m===LIFE_MODE.orbit?.0088:.0074,.12);
          if((m===LIFE_MODE.seek||carry)&&TSEG[q])thread(e,P3,TSEG[q],(18+10*h)*M.trail,C,br*(carry?1.1:.75),.0034);
          const F=MOTEF[q];for(let f=0;f<F;f++){if(!lifeFollower(eco,e,f,F,alpha,tv,P4,{spread:.3,lag:.75}))break;point(P4[0],P4[1],P4[2],C,br*b*.45,.006,.12);nf++;}
        }else if(s===SKIMMER){
          if(SSEG[q])thread(e,P3,SSEG[q],(7+5*h)*M.trail,cSkim,br*1.2,.0042);
          point(P3[0],P3[1],P3[2],cSkim,br*.55,.0062,.4);
          const F=SKIMF[q];for(let f=0;f<F;f++){if(!lifeFollower(eco,e,f,F,alpha,tv,P4,{spread:.22,lag:.6}))break;point(P4[0],P4[1],P4[2],cSkim,br*.35,.005,.4);nf++;}
        }else{
          point(P3[0],P3[1],P3[2],cEmber,br*(m===LIFE_MODE.settle?.5:.32)*(.7+.6*h),.016+.008*h,.5);
        }
      }
      pGeo.setDrawRange(0,np);upload(pGeo,'position',np);upload(pGeo,'aL',np);upload(pGeo,'aC',np);
      rGeo.instanceCount=nr;for(const nm of ['iA','iB','iCA','iCB','iW'])upload(rGeo,nm,nr);
      lifeStatsNow={drawn:nd,followers:nf,trailSegments:nr,points:np,drawCalls:2,sites:nS};
    };
  }
  // ---- Structure -----------------------------------------------------------------------------------------------------
  let lay={regions:[],sites:[]},layKey='',layFrom=-Infinity,layUntil=Infinity,siteIdx=new Map(),regionIdx=new Map(),threads=[],weights=[];
  const radCache=new Map();
  // The surface radius along a site's direction at integer recursion n (cached: the shape at n never changes).
  function radiusAt(key,dir,n){const k=`${key}|${n}`;let r=radCache.get(k);if(r===undefined){r=formula.radial(dir,n);if(r===null){
      // a ray that slips through the form: the nearest of six turned directions that meets it
      let best=null;for(let j=0;j<6&&best===null;j++){const a=j*1.047,d2=[dir[0]+.08*Math.cos(a),dir[1]+.08*Math.sin(a),dir[2]];const l=Math.hypot(...d2);const rr=formula.radial(d2.map(x=>x/l),n);if(rr!==null)best=rr;}
      r=best??R0*.5;}radCache.set(k,r);if(radCache.size>20000)radCache.delete(radCache.keys().next().value);}return r;}
  function structure(t){
    let files=0;for(const d of model.districts.values())files+=d.members.length;
    const key=`${model.version}|${model.districts.size}|${files}`;if(key===layKey&&t>=layFrom&&t<layUntil)return;layKey=key;
    // more subsystems than slots: the sequence continues, so no two regions share a direction (the first slots stay)
    if(model.districts.size>slots.length)slots=regionSlots(lc.seed,model.districts.size);
    lay=layoutAt(model,t,lc,slots);siteIdx=new Map(lay.sites.map((s,i)=>[s.id,i]));regionIdx=new Map(lay.regions.map((r,i)=>[r.id,i]));
    // it holds until the next birth or removal (model.alive: born, and removed + 1.6 s), however t was reached
    layFrom=-Infinity;layUntil=Infinity;const edge=x=>{if(!Number.isFinite(x))return;if(x<=t)layFrom=Math.max(layFrom,x);else layUntil=Math.min(layUntil,x);};
    for(const x of [...model.modules.values(),...model.links.values()]){edge(model.bornAt(x));if(x.removed!==null)edge(x.removed+1600);}
    threads=[];const seen=new Set();
    for(const l of model.links.values()){if(!model.alive(l,t))continue;const a=siteIdx.get(l.a),b=siteIdx.get(l.b);if(a===undefined||b===undefined||a===b)continue;const k=`${a}>${b}`;if(seen.has(k))continue;seen.add(k);
      threads.push({a,b,born:model.bornAt(l),removed:l.removed,cross:lay.sites[a].region!==lay.sites[b].region,seed:rand(hash(l.key))});}
    threads.sort((x,y)=>x.born-y.born||x.seed-y.seed);threads=threads.slice(0,MAX_THREADS);
    thr.ensure(threads.length*TSEG);site.ensure(lay.sites.length);
  }
  // The camera is the host's: its rig eases it toward cameraGoal and snaps it to the next goal after a rebuild (a seek, a
  // new performance, a world switch). Until the rig has placed it for this state nothing here reads where it was: the
  // level of detail is taken at the framing distance and a close-up's dolly at the direction the goal turns to, so the
  // frame at a moment never depends on the path playback took to it (tests/fractal-seek.test.js).
  let camPlaced=false;
  function rebuild(){layKey='';swSig='';camPlaced=false;}
  // ---- Per-frame state -------------------------------------------------------------------------------------------------
  let info={t:0,tsec:0,tview:0,overrides:{},agents:[]},itNow=MIN_IT,itDraw=MIN_IT,gsNow=1,massNow=0,swNow=SWELL;
  const sitePos=[],siteSurf=[],siteBase=[];   // world positions of the sprites; fractal-space surface points (events), before the swell
  const waves=[],decoheres=[],recoheres=[],glows=[],blooms=[],deepens=[];
  const push=(list,x,max=6)=>{list.push(x);if(list.length>max)list.shift();};
  const tempoOf=i=>Math.max(40,i.mood?.tempo||92);
  const near=(list,i,ms)=>list.filter(x=>x.at<=i.t&&i.t-x.at<ms*ctx.speed());
  const seatOf=a=>presence(a.provider).seat%8;
  let stressNow=0,bloomNow=0,lastStats={};
  // A site's surface point (fractal space) at the current frame: its radius at the drawn recursion, the region's swell.
  // (siteBase: the same point before the region's swell, where the decoherence field lives)
  function surfacePoint(s,out,base){const n0=Math.floor(itDraw),f=itDraw-n0,r0=radiusAt(s.id,s.dir,n0),r1=radiusAt(s.id,s.dir,Math.min(MAX_IT,n0+1)),r=lerp(r0,r1,f);
    base[0]=s.dir[0]*r;base[1]=s.dir[1]*r;base[2]=s.dir[2]*r;const k=r*swellAt(s.dir,lay.regions,weights,swNow);out[0]=s.dir[0]*k;out[1]=s.dir[1]*k;out[2]=s.dir[2]*k;return out;}
  // JS twin of the shader's decoherence (the sprite follows the displaced surface).
  function decohereAt(q,fields){let x=0,y=0,z=0;for(const F of fields){const e0=q[0]-F.c[0],e1=q[1]-F.c[1],e2=q[2]-F.c[2],w=Math.exp(-(e0*e0+e1*e1+e2*e2)/(F.r*F.r));
    x+=F.a*w*Math.sin(q[1]*11+F.ph);y+=F.a*w*Math.sin(q[2]*13+F.ph*1.3);z+=F.a*w*Math.sin(q[0]*9+F.ph*.7);}return [x,y,z];}
  const top2=()=>({t1:-Infinity,s1:0,c1:0,t2:-Infinity,s2:0,c2:0});
  const offer=(x,t,s,c,now)=>{if(!(t<=now)||!Number.isFinite(t))return;if(t>x.t1){x.t2=x.t1;x.s2=x.s1;x.c2=x.c1;x.t1=t;x.s1=s;x.c1=c;}else if(t>x.t2){x.t2=t;x.s2=s;x.c2=c;}};
  // Which verified milestones may bloom: the first, then each at least BLOOM_GAP of performance time after the last that
  // did (a pure fold over the director's lasting record).
  function bloomAllowed(at){const times=[];for(const l of ctx.director.lasting())for(const x of new Set([l.first,...(l.times||[])]))if(x<=at)times.push(x);
    times.sort((a,b)=>a-b);let last=-Infinity,ok=false;for(const x of times){const can=x-last>=BLOOM_GAP;if(can)last=x;if(x===at)ok=can;}return ok;}
  const centroidSite=(files,from=siteSurf)=>{let c=[0,0,0],n=0;const pts=[];for(const id of files||[]){const k=siteIdx.get(id);if(k===undefined)continue;const p=from[k];if(!p)continue;pts.push([k,p]);c[0]+=p[0];c[1]+=p[1];c[2]+=p[2];n++;}
    if(!n)return null;c=c.map(x=>x/n);let best=pts[0],bd=Infinity;for(const x of pts){const d=Math.hypot(x[1][0]-c[0],x[1][1]-c[1],x[1][2]-c[2]);if(d<bd){bd=d;best=x;}}
    let spread=0;for(const x of pts)spread=Math.max(spread,Math.hypot(x[1][0]-c[0],x[1][1]-c[1],x[1][2]-c[2]));return {p:best[1],k:best[0],id:lay.sites[best[0]]?.id,spread,n};};
  // Touches: the agent's own tool event on a file (touch.js), and an attributed edit landing (the model's correlated cue).
  function touchList(i){
    const sp=ctx.speed(),gain=touchGain(G,i.overrides),out=[];
    for(const x of touchesAt(ctx.agents,i.agents,i.t,sp,{known:id=>siteIdx.has(id),max:4})){const a=i.agents.find(p=>p.id===x.agentId);out.push({fileId:x.fileId,age:x.age,k:x.env*x.k*gain,seat:a?seatOf(a):0,agentId:x.agentId,kind:x.kind});}
    for(const m of model.modules.values()){if(!Number.isInteger(m.agentVoice)||!Number.isFinite(m.lastAgent)||!siteIdx.has(m.id))continue;const age=(i.t-m.lastAgent)/sp/1000;if(age<0||age>3.2)continue;
      if(out.some(x=>x.fileId===m.id))continue;const a=i.agents.find(p=>p.voice===m.agentVoice);out.push({fileId:m.id,age,k:smooth(age/.15)*Math.pow(1-age/3.2,1.6)*gain,seat:a?seatOf(a):m.agentVoice%8,agentId:a?.id||null,kind:'edit'});}
    return out.sort((a,b)=>b.k-a.k).slice(0,4);}
  let touches=[];
  function writeState(i){
    const t=i.t,sp=ctx.speed(),beatMs=60000/tempoOf(i),b=Math.floor(t/beatMs),tv=i.tview;
    // sites: surface points, sprites
    const N=lay.sites.length,fires=lay.sites.map(()=>top2()),stressS=new Float32Array(N),validS=new Float32Array(N);
    const decFields=[];
    for(let k=0;k<N;k++){const s=lay.sites[k];siteBase[k]=siteBase[k]||[0,0,0];siteSurf[k]=surfacePoint(s,siteSurf[k]||[0,0,0],siteBase[k]);}
    // an effect follows its own site's surface point, whichever index the site has now (a gone site's last point stays)
    for(const l of [waves,recoheres,glows,blooms])for(const x of l){if(!x.site)continue;const k=siteIdx.get(x.site);if(k!==undefined)x.o=siteSurf[k];else{x.o=x.o&&[...x.o];x.site=null;}}
    // material state per site (stressed eased in, relaxing away; validated a calm sheen) and the regions' decoherence
    const regStress=new Map();
    for(let k=0;k<N;k++){const s=lay.sites[k],m=model.modules.get(s.id);if(!m)continue;let cur=m.initial,prev=m.initial,at=-Infinity;for(const e of m.states){if(e.at>t)break;prev=cur;cur=e.state;at=e.at;}
      const since=(t-at)/sp;stressS[k]=cur==='stressed'?smooth(since/1500):prev==='stressed'?1-smooth(since/4000):0;validS[k]=cur==='validated'?.35+.65*Math.exp(-since/9000):0;
      if(stressS[k]>.01){let r=regStress.get(s.region);if(!r)regStress.set(s.region,r={files:[],w:0});r.files.push(s.id);r.w=Math.max(r.w,stressS[k]);}}
    // a failing run's first seconds shake harder
    for(const d of near(decoheres,i,4000)){const a=(t-d.at)/1000/sp;for(const id of d.files){const s=lay.sites[siteIdx.get(id)];if(!s)continue;let r=regStress.get(s.region);if(!r)regStress.set(s.region,r={files:[],w:0});if(!r.files.includes(id))r.files.push(id);r.w=Math.max(r.w,(1.4-.4*smooth(a/2.6))*smooth(a/.25));}}
    const ph=Math.floor(tv*12)*2.39996;
    for(const [rid,r] of [...regStress].sort((a,b)=>b[1].w-a[1].w||(a[0]<b[0]?-1:1)).slice(0,2)){const c=centroidSite(r.files,siteBase);if(!c)continue;decFields.push({c:c.p,r:Math.max(.14,c.spread*1.3+.1),a:.03*r.w,ph:ph+hash(rid)%7,e:Math.min(1.2,r.w)});}
    stressNow=decFields.length?clamp(decFields.reduce((m,f)=>Math.max(m,f.e),0)):0;
    for(let k=0;k<2;k++){const F=decFields[k];if(F){R.uDec.value[k].set(...F.c,F.r);R.uDecA.value[k].set(F.a,F.ph,F.e,0);}else{R.uDec.value[k].set(0,0,0,0);R.uDecA.value[k].set(0,0,0,0);}}R.uDecOn.value=decFields.length?1:0;
    // inputs: agent and human edits, births, symbols; tests' wave front; resynchronisation; spontaneous resonance
    const actAt=new Map(),act=k=>{let v=actAt.get(k);if(v===undefined){v=ctx.director.activityAt(k*beatMs);actAt.set(k,v);}return v;};
    const mu=i.music,energy=clamp(mu?mu.energy:i.energy||0),spontS=(.45+.35*energy)*clamp(i.overrides.intensity??1,.3,1.4);
    for(let k=0;k<N;k++){const s=lay.sites[k],m=model.modules.get(s.id);if(!m)continue;const x=fires[k];
      if(Number.isFinite(m.lastAgent)&&Number.isInteger(m.agentVoice))offer(x,m.lastAgent,1.2,m.agentVoice%8,t);
      offer(x,m.lastHuman,.8,C_HUMAN,t);offer(x,model.bornAt(m),1,C_GROW,t);
      let latest=-Infinity;for(const id of m.symbols){const y=model.symbols.get(id);if(!y)continue;const bs=model.bornAt(y);if(bs<=t&&bs>latest&&bs>model.bornAt(m)+1)latest=bs;if(y.weldAt<=t&&y.weldAt>latest)latest=y.weldAt;}
      offer(x,latest,.6,C_GROW,t);
      const h=hash(s.id),pn=RES*clamp(.9/Math.sqrt(N+4),.015,.12)*(.6+.8*rand(h+5));
      const [k1,k2]=spontaneous(h,b,kk=>pn*(1+1.4*act(kk)),48),jit=kk=>(1-SYNC)*rand((h^Math.imul(kk|0,0x85ebca6b))>>>0)*beatMs*.5;
      for(const kk of [k1,k2])if(kk!==null)offer(x,kk*beatMs-jit(kk),spontS,C_SPONT,t);
      if(stressS[k]>.05){const hm=hash(`mis/${s.id}`),step=beatMs*.37,kq=Math.floor(t/step);for(let j=0;j<5;j++){const kk=kq-j;if(rand((hm^Math.imul(kk|0,0x27d4eb2d))>>>0)<.45*stressS[k])offer(x,kk*step+rand(hm+kk)*step*.8,-.7*stressS[k],C_WARN,t);}}}
    for(const w of near(waves,i,9000)){for(const id of w.files){const k=siteIdx.get(id);if(k===undefined)continue;const p=siteSurf[k],d=Math.hypot(p[0]-w.o[0],p[1]-w.o[1],p[2]-w.o[2]);offer(fires[k],w.at+d/w.speed*1000*sp,.9,C_VALID,t);}}
    for(const r of near(recoheres,i,8000)){const k0=Math.floor(r.at/beatMs);for(const id of r.files){const k=siteIdx.get(id);if(k===undefined)continue;for(let j=1;j<=3;j++)offer(fires[k],(k0+j)*beatMs,1.05,C_VALID,t);}}
    for(const g of near(glows,i,8000))for(const id of g.files){const k=siteIdx.get(id);if(k!==undefined)offer(fires[k],g.at+250*sp,.8,C_GROW,t);}
    // the bloom: every site in volleys from the subject outward (a full bloom), or the subject's region (a local unfolding)
    bloomNow=0;
    for(const s of near(blooms,i,16000)){const a=(t-s.at)/1000/sp;if(a<0)continue;const vol=s.grand?4:s.full?3:2,gap=beatMs*2;
      for(let k=0;k<N;k++){const p=siteSurf[k],d=s.o?Math.hypot(p[0]-s.o[0],p[1]-s.o[1],p[2]-s.o[2]):0;if(!s.full&&d>.55)continue;for(let v=0;v<vol;v++)offer(fires[k],s.at+d/1.1*1000*sp+v*gap,s.full?1.5:1.1,C_BLOOM,t);}
      if(s.full)bloomNow=Math.max(bloomNow,smooth(a/.8)*(1-smooth((a-7)/4)));}
    // sprites
    const size=clamp(num(geo.siteSize,1),.4,2),gs=gsNow*WS,alpha=clamp(i.overrides.intensity??1,.4,1.3);let n=0;
    const touchK=new Map();for(const x of touches)touchK.set(x.fileId,Math.max(touchK.get(x.fileId)||0,x.k));
    sitePos.length=N;
    for(let k=0;k<N;k++){const s=lay.sites[k],m=model.modules.get(s.id);if(!m){sitePos[k]=null;continue;}
      const life=model.alive(m,t)?smooth((t-model.bornAt(m))/(1200*sp))*(m.removed===null?1:1-smooth((t-m.removed)/(1600*sp))):0;if(life<=.002){sitePos[k]=null;continue;}
      let q=siteSurf[k];if(decFields.length){const b0=siteBase[k],o=decohereAt(b0,decFields),sw=Math.hypot(...q)/Math.max(1e-6,Math.hypot(...b0));q=[(b0[0]-o[0])*sw,(b0[1]-o[1])*sw,(b0[2]-o[2])*sw];}
      const out=1.018+.004*size,p=[q[0]*out*gs,q[1]*out*gs,q[2]*out*gs];sitePos[k]=p;
      const x=fires[k],st=model.stateAt(m,t),nsym=model.symbolsAt(m,t);
      const fl=(tt,ss)=>{if(!(tt>-Infinity))return 0;const a=(t-tt)/1000/sp;return a<0?0:Math.abs(ss)*Math.exp(-a*2.6);};
      const f1=fl(x.t1,x.s1),f2=fl(x.t2,x.s2),tk=touchK.get(s.id)||0;
      const base=st==='draft'?V3(pal.highlight,.55):st==='validated'?V3(pal.accent,.95).lerp(V3(pal.valid,.9),.35):V3(pal.accent,1);
      const c=base.clone().multiplyScalar(.7+.15*Math.sin(tv*.7+rand(hash(s.id))*TAU)).lerp(V3(pal.warning,.9),stressS[k]*.85)
        .addScaledVector(COLS[x.c1]||COLS[C_SPONT],f1*.9).addScaledVector(COLS[x.c2]||COLS[C_SPONT],f2*.6).addScaledVector(COLS[touches.find(z=>z.fileId===s.id)?.seat??0],tk*1.6);
      const flick=stressS[k]>.05?.55+.45*((Math.floor(tv*13+k*.37)%2)):1;
      const born=(t-model.bornAt(m))/1000/sp,ring=born>=0&&born<2.4?born/2.4:0;
      site.write('position',n,...p);site.write('sC',n,c.x,c.y,c.z,life*flick*alpha*GLOW);
      site.write('sS',n,(16+7*Math.log2(1+nsym))*size*(1+.6*Math.max(f1,tk)),.018*size*WS*(1+Math.log2(1+nsym)*.35),.5+.5*Math.max(f1,tk),ring);n++;}
    site.commit(n);
    // threads: their ends follow the sites; pulses from the importing file's firings
    let m2=0;const thK=clamp(Math.sqrt(120/Math.max(1,threads.length)),.35,1);thrMat.uniforms.uThrK.value=clamp(num(geo.threads,.8),0,1.6)*thK;
    for(const th of threads){const a=sitePos[th.a],bb=sitePos[th.b];if(!a||!bb)continue;const life=smooth((t-th.born)/(2400*sp))*(th.removed===null?1:1-smooth((t-th.removed)/(1600*sp)));if(life<=.002)continue;
      const x=fires[th.a],S=x0=>Number.isFinite(x0)?(x0-model.epoch)/1000/sp:-1e5;
      for(let s=0;s<TSEG;s++){thr.write('hA',m2,...a,s/TSEG);thr.write('hB',m2,...bb,(s+1)/TSEG);thr.write('hP',m2,th.cross?.22:.1,life*(th.cross?1:.7),S(x.t1),S(x.t2));
        thr.write('hQ',m2,x.s1>0?Math.min(1.2,x.s1):0,x.s2>0?Math.min(1.2,x.s2):0,x.c1,x.c2);m2++;}}
    thr.commit(m2);
    lastStats={fires:fires.filter(x=>x.t1>-Infinity).length,threads:m2/TSEG,sites:n};
  }
  // ---- Agents: signals riding to the site they work on (pure functions of the observed lifecycle and time) ----------
  const agentState=new Map();
  let editsT=null;const edits=new Map();
  function editsOf(voice){if(editsT!==info.t){edits.clear();editsT=info.t;}let l=edits.get(voice);
    if(!l){l=[...model.modules.values()].filter(m=>m.agentVoice===voice&&Number.isFinite(m.lastAgent)&&siteIdx.has(m.id)).sort((a,b)=>b.lastAgent-a.lastAgent).slice(0,4);edits.set(voice,l);}return l;}
  const lastEdit=(p,t)=>{for(const m of editsOf(p.voice))if(m.lastAgent<=t)return m;return null;};
  function workOf(p,t){if(p.display==='tool'&&p.fileId&&siteIdx.has(p.fileId))return p.fileId;const m=lastEdit(p,t);return m&&t-m.lastAgent<DWELL*ctx.speed()?m.id:null;}
  // A goal as [direction, radius] in fractal space (an agent travels in spherical coordinates, so it never cuts through the form).
  function goalOf(p,tv,t){
    const w=workOf(p,t);if(w){const k=siteIdx.get(w),q=siteSurf[k];if(q){const r=Math.hypot(...q);return [q.map(x=>x/r),r*1.07+.02];}}
    const ph=rand(hash(p.id))*TAU,home=p.home?siteIdx.get(p.home):undefined;
    if(home!==undefined&&siteSurf[home]){const q=siteSurf[home],r=Math.hypot(...q),waiting=p.display==='waiting'||p.display==='dormant'||p.display==='connected';
      const d=q.map(x=>x/r),a=ph+tv*(p.busy?.35:.08),[u,v]=perp(d),k=waiting?.32:.2;
      return [norm3([d[0]+(u[0]*Math.cos(a)+v[0]*Math.sin(a))*k,d[1]+(u[1]*Math.cos(a)+v[1]*Math.sin(a))*k,d[2]+(u[2]*Math.cos(a)+v[2]*Math.sin(a))*k]),r*(waiting?1.4:1.2)];}
    return [norm3([Math.cos(ph+tv*.05),.35,Math.sin(ph+tv*.05)]),R0*(1+SWELL)*1.3];}
  const norm3=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
  const perp=d=>{const a=Math.abs(d[1])<.9?[0,1,0]:[1,0,0],u=norm3([a[1]*d[2]-a[2]*d[1],a[2]*d[0]-a[0]*d[2],a[0]*d[1]-a[1]*d[0]]);return [u,[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]]];};
  function slerpGoal(a,b,k){const c=clamp(a[0][0]*b[0][0]+a[0][1]*b[0][1]+a[0][2]*b[0][2],-1,1),om=Math.acos(c);let d;
    if(om<1e-4)d=b[0];else{const s=Math.sin(om),wa=Math.sin((1-k)*om)/s,wb=Math.sin(k*om)/s;d=[0,1,2].map(j=>a[0][j]*wa+b[0][j]*wb);}
    return [norm3(d),lerp(a[1],b[1],k)+Math.sin(k*Math.PI)*Math.min(.45,om*.35)];}
  function agentAt(id,t,tv){const a=ctx.agents.presence(id,t);if(!a)return null;let g=goalOf(a,tv,t);
    const sp=ctx.speed(),m=lastEdit(a,t);let tc=t-a.since;if(m){tc=Math.max(tc,m.lastAgent);if(m.lastAgent+DWELL*sp<=t)tc=Math.max(tc,m.lastAgent+DWELL*sp);}
    if(t-tc<1800*sp){const prev=ctx.agents.presence(id,tc-1);if(prev)g=slerpGoal(goalOf(prev,tv,tc-1),g,smooth((t-tc)/(1800*sp)));}
    const s=gsNow*WS;return {a,p:[g[0][0]*g[1]*s,g[0][1]*g[1]*s,g[0][2]*g[1]*s]};}
  function fxPoint(n,p,c,k,size,shape){if(n>=MAX_FX||k<=.003)return n;fx.write('position',n,p[0],p[1],p[2]);fx.write('fC',n,(c.x??c.r)*k,(c.y??c.g)*k,(c.z??c.b)*k,1);fx.write('fS',n,size,shape);return n+1;}
  function updateAgents(i){
    const sp=ctx.speed(),trailK=clamp(num(G.agents?.trail,1),.2,2.2),prom=clamp(num(G.agentProminence,.8),.3,1),seen=new Set();let n=0;
    for(const a of i.agents.slice(0,12)){const h=agentAt(a.id,i.t,i.tview);if(!h)continue;seen.add(a.id);let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3()};agentState.set(a.id,st);}st.pos.set(...h.p);
      const seat=seatOf(a),c=agentCol[seat],alpha=a.alpha*(a.busy?1:.65)*prom,sub=a.subagent?.75:1;
      for(let k=20;k>=1;k--){const q=agentAt(a.id,i.t-k*60*sp*trailK,i.tview-k*.06*trailK);if(!q)continue;const f=1-k/21;n=fxPoint(n,q.p,c,alpha*f*f,(2.5+7*f)*sub,8);}
      n=fxPoint(n,h.p,c,alpha*.45,80*sub,8);n=fxPoint(n,h.p,c,alpha*1.6,42*sub,seat<6?seat:6);n=fxPoint(n,h.p,{r:1,g:1,b:1},alpha,7*sub,8);
      // injection: light from the signal into the site it edits (out of it while it reads)
      const work=workOf(a,i.t),k0=work?siteIdx.get(work):undefined,sp2=k0!==undefined?sitePos[k0]:null;
      if(sp2){const inward=!(a.display==='tool'&&LIGHT.has(a.activity));for(let k=0;k<10;k++){let f=(i.tview*1.1+k/10)%1;if(!inward)f=1-f;
        n=fxPoint(n,[lerp(h.p[0],sp2[0],f),lerp(h.p[1],sp2[1],f),lerp(h.p[2],sp2[2],f)],c,alpha*Math.sin(f*Math.PI),4,8);}}}
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
    return n;
  }
  // ---- Effects: recorded intents only ---------------------------------------------------------------------------------
  function effect(cmd,i){
    if(i)info=i;const s=clamp(cmd.scale,0,1.6),subj=cmd.subject||{},at=Number.isFinite(cmd.at)?cmd.at:info.t;if(s<=0)return;
    const files=new Set(subj.fileIds||(subj.fileId?[subj.fileId]:[]));const c=centroidSite(files);
    switch(cmd.effect){
      case 'coherence-wave':push(waves,{at,files,s,o:c?.p||[0,R0,0],site:c?.id,speed:.55});break;
      case 'decohere':push(decoheres,{at,files,s});break;
      case 'recohere':push(recoheres,{at,files,s,o:c?.p||[0,R0,0],site:c?.id,r:Math.max(.25,(c?.spread||0)+.3)});break;
      case 'bloom':case 'refine':{const full=cmd.tier>=3&&bloomAllowed(cmd.at);push(blooms,{at,files,s,o:c?.p||null,site:c?.id,full,grand:full&&cmd.tier>=4,refactor:cmd.effect==='refine'},4);break;}
      case 'glow':push(glows,{at,files,s,o:c?.p||null,site:c?.id,r:Math.max(.12,(c?.spread||0)+.1)});break;
      case 'deepen':push(deepens,{at,s});break;
      default:break;// growth (emerge, seed, unfold, erode, thread) is drawn from the model's own times
    }
  }
  // The surface events of this frame into the shader's slots (most recent first).
  function eventUniforms(i){
    const sp=ctx.speed(),age=x=>(i.t-x.at)/1000/sp,slots=[];
    for(const w of near(waves,i,9000))slots.push({o:w.o,a:age(w),kind:0,s:w.s*1.1,speed:w.speed,c:V3(pal.valid,1.3)});
    for(const r of near(recoheres,i,7000))slots.push({o:r.o,a:age(r),kind:1,s:r.s*1.2,speed:.35,w:r.r,c:V3(pal.valid,1.2)});
    // (a commit that names no files warms the whole form)
    for(const g of near(glows,i,8000))slots.push({o:g.o||[0,0,0],a:age(g),kind:2,s:g.s*(g.o?.9:.55),w:g.o?g.r:R0*1.6,c:V3(pal.accent,1.1)});
    for(const b of near(blooms,i,14000)){const o=b.o||[0,R0,0];if(b.full)slots.push({o,a:age(b),kind:3,s:1.3*(b.grand?1.3:1),speed:.42,c:V3(pal.accent.clone().lerp(new THREE.Color('#fff7ea'),.4),1.5)});
      else slots.push({o,a:age(b),kind:2,s:1.1,w:.45,c:V3(pal.accent,1.3)});}
    slots.sort((a,b)=>a.a-b.a);
    // (an empty slot is all zeros: nothing from an earlier frame stays in the state)
    for(let k=0;k<6;k++){const x=slots[k];if(!x){R.uWav.value[k].set(0,0,0,0);R.uWavC.value[k].set(0,0,0,0);R.uWavK.value[k].set(0,0,0,0);continue;}R.uWav.value[k].set(...x.o,x.a);R.uWavC.value[k].set(x.c.x,x.c.y,x.c.z,0);R.uWavK.value[k].set(x.kind,x.s*clamp(i.overrides.intensity??1,.3,1.4),x.speed||0,x.w||0);}
    for(let k=0;k<4;k++){const x=touches[k],s=x?siteSurf[siteIdx.get(x.fileId)]:null;if(!x||!s){R.uTch.value[k].set(0,0,0,0);R.uTchC.value[k].set(0,0,0,0);continue;}
      const c=agentCol[x.seat%8];R.uTch.value[k].set(...s,x.age);R.uTchC.value[k].set(c.r*1.6,c.g*1.6,c.b*1.6,clamp(x.k,0,1.4)*(x.kind==='edit'?1:.45));}
    // lasting: the regions of verified milestones keep an inner light
    const L=lastingRegions(i);for(let k=0;k<4;k++){const x=L[k];if(!x){R.uLast.value[k].set(0,0,0,0);continue;}R.uLast.value[k].set(...x.dir,x.level);}
  }
  let lastSig='',lastList=[];
  function lastingRegions(i){const all=ctx.director.lasting();let sig=`${layKey}`;for(const l of all)if(l.first<=i.t)sig+=`|${l.first}:${l.count}`;if(sig===lastSig)return lastList;lastSig=sig;
    const m=new Map();for(const l of all){if(l.first>i.t)continue;const s=l.subject||{},ids=s.fileIds||(s.fileId?[s.fileId]:[]),cl=new Set();if(s.groupId)cl.add(s.groupId);
      for(const id of ids){const k=siteIdx.get(id);if(k!==undefined)cl.add(lay.sites[k].region);}for(const c of cl)m.set(c,Math.min(1,(m.get(c)||0)+.45+.15*Math.min(4,(l.count||1)-1)));}
    lastList=[...m].map(([id,level])=>({id,level,dir:lay.regions[regionIdx.get(id)]?.dir})).filter(x=>x.dir).sort((a,b)=>b.level-a.level||(a.id<b.id?-1:1)).slice(0,4);return lastList;}
  // ---- Frame -------------------------------------------------------------------------------------------------------------
  function update(i){
    info=i;const sp=ctx.speed(),qi=clamp(Math.round(i.quality||0),0,3),q=QUALITY[qi];
    const [w,h]=ctx.pipeline.size;U.uPx.value=Math.max(.4,h/1080);U.uRes.value.set(w,h);U.uV.value=i.tview;
    structure(i.t);
    massNow=massAt(model,i.t,sp);itNow=unfoldAt(fc,massNow);
    // (before the camera is placed for this state: the framing distance, in fractal units, at the identity's own lens)
    const fovNow=camPlaced?camera.fov:clamp(num(cam.fov,32),20,55),dist=camPlaced?camera.position.length()/(gsNow*WS):R0*(1+SWELL*.7)/Math.sin(fovNow*Math.PI/360)*1.2*clamp(num(cam.distance,1),.6,1.6);
    const [,hpx]=ctx.pipeline.size,camD=Math.max(1e-3,dist-R0*.9),foot=camD*2*Math.tan(fovNow*Math.PI/360)/Math.max(1,hpx*q.scale);
    itDraw=Math.min(itNow,q.cap,detailCap(fc,foot));
    // the swell: a region grows with its files, the more gently the further the form has unfolded, so its fine detail
    // is magnified and sheared less (a smooth seed may bulge; an intricate form keeps its structure)
    swNow=SWELL*(1-.5*smooth((itNow-MIN_IT-1)/4));R.uSwN.value=swNow;
    weights=regionWeights(model,i.t,lay.regions,sp);swellTable(lay.regions,weights,swNow);
    // breathing on the bars, the bloom's inflation
    const reactive=clamp(num(MU.reactivity,.6),0,1),tempo=tempoOf(i),breathS=Math.max(2,num(mot.breath,4))*4*60/tempo,breath=.5+.5*Math.sin(i.tview/breathS*TAU);
    touches=touchList(i);
    // the scale of the form at t (breathing, the bloom's inflation) before anything is placed on it
    let bloomCmd=null;for(const b of near(blooms,i,16000))if(b.full&&b.at<=i.t)bloomCmd=b;
    let infl=0,twist=0;if(bloomCmd){const a=(i.t-bloomCmd.at)/1000/sp;infl=.08*smooth(a/1.2)*(1-smooth((a-5)/5));twist=.6*Math.sin(clamp(a/9)*Math.PI)*(bloomCmd.grand?1.4:1);}
    gsNow=(1+.006*(breath-.5)*(.4+.6*reactive))*(1+infl);R.uWSg.value=gsNow*WS;
    writeState(i);
    if(fc.form==='box'){R.BROT.value.set(...rotation(fc.twist*.55+twist*.5,fc.twist*.4+twist*.35));R.BS.value=fc.S-twist*.18;}
    if(fc.form==='kifs'){R.KR1.value.set(...rotation(.06+fc.twist*.32+twist*.45,.04+fc.twist*.22+twist*.3));R.KR2.value.set(...rotation(-.03-fc.twist*.14-twist*.2,.08+fc.twist*.26+twist*.4));}
    R.TWON.value=formula.twist.tw||formula.twist.sp||twist?1:0;R.TWC.value.set(Math.cos(formula.twist.tw+twist),Math.sin(formula.twist.tw+twist));R.SPC.value.set(Math.cos(formula.twist.sp+twist*.5),Math.sin(formula.twist.sp+twist*.5));
    fracScale=q.scale;R.uIt.value=itDraw;R.FIT.value=Math.floor(itDraw)+2;R.uSteps.value=q.steps;R.uEpsK.value=q.eps;R.uAOn.value=q.ao;R.uShN.value=q.sh;R.uQ.value=i.quality||0;R.uTime.value=i.tview;
    R.uBeat.value=i.beat*num(MU.beatPulse,.4)*reactive;R.uBreath.value=breath;R.uInner.value=i.unlocks[1]?.level||0;R.uStress.value=stressNow;
    eventUniforms(i);
    // the burst
    // the burst's points are traced on the first frame (already a long one), not on the milestone's: shown at the first bloom
    if(!burstTraced){burstTraced=true;for(let k=0;k<BURST;k++){const y=1-2*(k+.5)/BURST,s=Math.sqrt(1-y*y),a=k*2.39996,u=[Math.cos(a)*s,y,Math.sin(a)*s],r=radiusAt(`burst${k}`,u,5)*.98;burst.write('position',k,0,0,0);burst.write('bO',k,u[0]*r,u[1]*r,u[2]*r,rand(hash(`b/${seed}/${k}`)));}}
    if(bloomCmd){if(!burstReady){burstReady=true;burst.commit(BURST);}
      const a=(i.t-bloomCmd.at)/1000/sp;burstMat.uniforms.uBA.value=a;burstMat.uniforms.uBK.value=clamp(i.overrides.intensity??1,.3,1.3)*(bloomCmd.grand?1.3:1);burstMat.uniforms.uBO.value.set(...(bloomCmd.o||[0,R0,0]));}
    else burstMat.uniforms.uBK.value=0;
    burstMat.uniforms.uSc.value=gsNow*WS;
    const fxn=updateAgents(i);fx.commit(fxn);
    if(LIFE)updateLife(i);
    const atmo=clamp(i.overrides.atmosphere??1,0,2);moteMat.uniforms.uDust.value=.07*clamp(num(atm.particles,.8),0,1.6)*atmo*(1+.8*(i.unlocks[0]?.level||0));
    motes.geometry.setDrawRange(0,Math.round(MOTES*(qi>=3?.4:qi>=2?.65:1)));
    bgU.uStress.value=stressNow;bgU.uBloom.value=bloomNow;bgU.uDustK.value=(i.unlocks[0]?.level||0)*atmo;bgU.uCorona.value=i.unlocks[2]?.level||0;bgU.uEcho.value=i.unlocks[3]?.level||0;
    bgU.uHazeK.value=clamp(num(atm.haze,.7),0,1.6)*atmo;bgU.uV.value=i.tview;bgU.uQ.value=i.quality||0;bgU.uRw.value=R0*(1+SWELL*.6)*gsNow*WS;
  }
  const fwd=new THREE.Vector3(),rightV=new THREE.Vector3(),upV=new THREE.Vector3(),vp=new THREE.Matrix4();
  function afterCamera(i){camPlaced=true;camera.updateMatrixWorld();
    vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);R.uVP.value.copy(vp);R.uInvVP.value.copy(vp).invert();
    const s=gsNow*WS;R.uCamF.value.copy(camera.position).divideScalar(s);
    // the key light: above and to the side of the camera, circling slowly (ambient)
    camera.getWorldDirection(fwd);rightV.crossVectors(fwd,camera.up).normalize();upV.crossVectors(rightV,fwd).normalize();
    const la=(i?.tview||0)*.035*clamp(num(mot.light,.6),0,1.6)+rand(seed+3)*TAU;
    // (from the side and above, a little toward the camera: lit ridges against deep shade on the far side)
    R.uKey.value.copy(upV).multiplyScalar(.7).addScaledVector(rightV,-.72+.22*Math.sin(la)).addScaledVector(fwd,-.26+.12*Math.cos(la)).normalize();
    // the back light: behind the form on the other side, for the rim
    R.uRimDir.value.copy(fwd).multiplyScalar(.75).addScaledVector(rightV,.55).addScaledVector(upV,.2).normalize();
    bgU.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);bgU.uCam.value.copy(camera.position);}
  function background(){return background_;}
  function grade(i){
    const inten=i.overrides.intensity??1,sec=i.mood?.section,sp=ctx.speed();
    let flash=0;for(const s of blooms){const a=(i.t-s.at)/1000/sp;if(s.full&&a>=0&&a<3)flash+=.05*Math.exp(-a*1.8)*(s.grand?1.6:1);}
    let ex=0;for(const e of deepens){const a=(i.t-e.at)/1000/sp;if(a>=0&&a<6)ex+=.04*e.s*smooth(a/.6)*Math.exp(-a*.5);}
    const tint=new THREE.Vector3(1,1,1);if(sec==='tension')tint.set(1.03,.98,.99);else if(sec==='resolve')tint.set(.98,1.01,1.03);
    tint.lerp(new THREE.Vector3(.95,.96,1.06),stressNow*.5);
    return {tonemap:'agx',bloom:clamp(num(LT.bloom,1),.3,2)*.7*(1+.6*bloomNow+.1*(i.activity||0)),threshold:clamp(num(LT.bloomThreshold,.65),.5,.9)*1.25,
      exposure:(1+(clamp(num(LT.exposure,1.05),.4,2.2)-1)*.5)*1.08*(1-.1*stressNow)*(1+.14*bloomNow+ex)*(sec==='breath'?.97:sec==='lift'?1.03:1),
      contrast:clamp(num(LT.contrast,1),.85,1.3)*1.1,saturation:1.06*(1-.25*stressNow),vignette:num(LT.vignette,.3)*1.2,grain:num(LT.grain,.025)*.5,
      flash:flash*inten,tint,aberration:.0015,bloomTint:{x:1,y:.95,z:.9},streak:.05};
  }
  // ---- Camera: the whole form framed, close to the surface for what changed, a pull-back for the bloom ----------------
  const baseAz=rand(seed+11)*TAU,tmp=new THREE.Vector3();
  const sphOf=d=>({az:Math.atan2(d[2],d[0]),el:Math.asin(clamp(d[1],-1,1))});
  function cameraGoal(i){
    const fov=clamp(num(cam.fov,32),20,55),half=fov*Math.PI/360,motion=clamp(i.overrides.motion??1,0,2),drift=clamp(num(cam.drift,.7),0,1.6);
    const Rw=R0*(1+SWELL*.7)*gsNow*WS,frame=Rw/Math.sin(half)*1.2*clamp(num(cam.distance,1),.6,1.6);
    let distance=frame*(1+.25*bloomNow);
    const pole=cam.personality==='pole';
    let az=cam.personality==='glide'?baseAz+Math.sin(i.tview/170)*.7*drift*motion:baseAz+i.tview*TAU/(pole?2400:1500)*motion*(.5+.5*drift);
    let el=pole?1.18+Math.sin(i.tview/120)*.06*drift:.08+.6*clamp(num(cam.elevation,.35),.05,1.2)+Math.sin(i.tview/97)*.05*drift*motion;
    const target=new THREE.Vector3(0,0,0);
    // idle: a slow drift in toward one region after another, then back out (ambient; work and events end it)
    const idle=clamp(1-(i.activity||0)*6),cyc=i.tview/190,ph=cyc-Math.floor(cyc),dip=idle*Math.pow(Math.sin(ph*Math.PI),2)*.3*clamp(num(mot.drift,.7),0,1.5);
    if(dip>.002&&lay.regions.length){const r=lay.regions[Math.floor(cyc)%lay.regions.length],p=regionPoint(r);if(p){target.lerp(p,dip*1.4);const s=sphOf(r.dir);az=lerpAngle(az,s.az,dip*1.2);el=lerp(el,clamp(s.el,-.25,1.2),dip*1.2);distance*=1-dip;}}
    // what changed is seen up close (the surface's fine structure fills the frame); an agent's work in a medium view
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;let k=0;
    if(att&&since<13&&!bloomNow){const p=attentionPoint(att);if(p){const s=sphOf(p.dir);k=smooth(since/1.4)*(1-smooth((since-8.5)/4.5))*clamp(i.overrides.intensity??1,.4,1)*.85;
      const kd=k*smooth((since-.9)/2)*facing(p.dir,lerpAngle(az,s.az,k),lerp(el,clamp(s.el,-.3,1.25),k));target.lerp(p.pos,k*.75);az=lerpAngle(az,s.az,k);el=lerp(el,clamp(s.el,-.3,1.25),k);distance=lerp(distance,Math.min(distance,Rw*.45/Math.tan(half)),kd);}}
    if(k<.01){const busy=(touches[0]&&touches[0].k>.15&&touches[0].kind==='edit'?touches[0].fileId:null)||i.agents.map(a=>workOf(a,i.t)).find(Boolean);
      if(busy){const kk=siteIdx.get(busy),qq=siteSurf[kk];if(qq){const r=Math.hypot(...qq),d=qq.map(x=>x/r),s=sphOf(d);target.lerp(tmp.set(...qq).multiplyScalar(gsNow*WS),.4);az=lerpAngle(az,s.az,.55);el=lerp(el,clamp(s.el,-.3,1.2),.5);
        distance=lerp(distance,Math.min(distance,Rw*.8/Math.tan(half)),.6*facing(d,az,el));}}}
    return {target,distance,azimuth:az,elevation:el,fov,omega:k>.01?1.1:.5};
  }
  const lerpAngle=(a,b,k)=>{let d=b-a;while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;return a+d*k;};
  // How directly the camera already faces a direction: a close-up waits until it does (it never cuts through the form).
  // (before the camera is placed for this state: as faced from the goal's own azimuth and elevation, where the snap puts it)
  function facing(d,az,el){if(!camPlaced){const ce=Math.cos(el);return smooth((Math.cos(az)*ce*d[0]+Math.sin(el)*d[1]+Math.sin(az)*ce*d[2])*1.6-.3);}
    const p=camera.position,l=p.length()||1;return smooth((p.x*d[0]+p.y*d[1]+p.z*d[2])/l*1.6-.3);}
  function regionPoint(r){const n0=Math.floor(itDraw),rr=radiusAt(`r:${r.id}`,r.dir,n0)*swellAt(r.dir,lay.regions,weights,swNow)*gsNow*WS;return new THREE.Vector3(...r.dir).multiplyScalar(rr);}
  function attentionPoint(c){const s=c.subject||{};
    const fid=s.fileId&&siteIdx.has(s.fileId)?s.fileId:null;
    if(fid){const q=siteSurf[siteIdx.get(fid)];if(q){const r=Math.hypot(...q);return {pos:new THREE.Vector3(...q).multiplyScalar(gsNow*WS),dir:q.map(x=>x/r)};}}
    if(s.groupId&&regionIdx.has(s.groupId)){const r=lay.regions[regionIdx.get(s.groupId)];return {pos:regionPoint(r),dir:r.dir};}
    const cs=centroidSite(s.fileIds);if(cs){const r=Math.hypot(...cs.p);return {pos:new THREE.Vector3(...cs.p).multiplyScalar(gsNow*WS),dir:cs.p.map(x=>x/r)};}
    return null;}
  // ---- Words -------------------------------------------------------------------------------------------------------------
  const role=id=>model.districts.get(id)?.role||'logic';
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  const milestoneWords=c=>(c.detail?.kinds||[]).map(x=>MILESTONE[x]||x).join(' · ');
  const bloomOf=c=>blooms.find(s=>s.at===c.at);
  const plural=(n,w,ws=`${w}s`)=>`${n} ${n===1?w:ws}`;
  function describe(c,i){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=attentionPoint(c)?.pos||new THREE.Vector3(0,R0*WS,0);
    switch(c.intent){
      case 'subsystem.created':return {text:'A new region unfolds',sub:s.groupId?`${ctx.name(s.groupId)} · ${role(s.groupId)}`:'',position:pos};
      case 'structure.created':return {text:'The surface unfolds finer detail',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','component').replace('api.route','route')}`).join(' · ')||plural(d.count||1,'symbol'),position:pos};
      case 'structure.removed':return {text:'Detail erodes',sub:'structure removed',position:pos};
      case 'subsystem.connected':{const a=s.fileId&&siteIdx.has(s.fileId)?lay.sites[siteIdx.get(s.fileId)].region:null,b=s.targetId&&siteIdx.has(s.targetId)?lay.sites[siteIdx.get(s.targetId)].region:null;
        return {text:d.first?'Integration · a thread of light links two regions':'The thread between two regions strengthens',sub:a&&b?`${ctx.name(a)} → ${ctx.name(b)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · ${plural(n,'site')} decohere${n===1?'s':''}`,sub:'observed failing run',position:pos,color:'#ff7a8a'};
      case 'validation.passed':return {text:`Tests pass · a coherent wave crosses ${plural(n,'site')}`,sub:'observed passing run',position:pos,color:'#8dffd8'};
      case 'validation.recovered':return {text:'Recovered · coherence restored',sub:'the tests pass again',position:pos,color:'#8dffd8',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the form is refined',sub:`${plural(d.removedSymbols||0,'symbol')} removed`,position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=milestoneWords(c),st=bloomOf(c);return {text:`${st?.full?'Fractal bloom':'A local unfolding'} · ${k}`,sub:'verified by a passing test run · an inner light remains',position:pos,banner:k,bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:n?`Committed · ${plural(n,'site')} glow`:'Committed · the work glows',sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The continuum deepens · chapter ${d.chapter}`,sub:'accumulated structure',position:pos};
      case 'agent.collision':return {text:'Two agents meet in one region',sub:(d.providers||[]).map(id=>presence(id).display).join(' · '),position:pos};
      default:return null;}}
  function agentPosition(id){return agentState.get(id)?.pos||null;}
  function agentColor(a){return '#'+agentCol[seatOf(a)].getHexString();}
  // Labels for the regions facing the camera.
  function subsystemLabels(){const p=camera.position,l=p.length()||1;return lay.regions.filter(r=>(p.x*r.dir[0]+p.y*r.dir[1]+p.z*r.dir[2])/l>.15&&r.live>0).map(r=>{const q=regionPoint(r).multiplyScalar(1.06);
    return {position:q,text:ctx.name(r.id),sub:`${role(r.id)} · ${plural(r.live,'file')}`};});}
  function status(i){let v=0,st=0;for(const s of lay.sites){const m=model.modules.get(s.id);if(!m||!model.alive(m,i.t))continue;const x=model.stateAt(m,i.t);if(x==='validated')v++;if(x==='stressed')st++;}
    return st?`${plural(st,'site')} decohering`:v?`${v} validated`:'';}
  function pick(x,y,cam){let best=null,bd=.05;const v=new THREE.Vector3();
    for(let k=0;k<lay.sites.length;k++){const p=sitePos[k];if(!p)continue;v.set(...p).project(cam);const d=Math.hypot(v.x-x,(v.y-y)*.7);if(v.z<1&&d<bd){bd=d;best=lay.sites[k].id;}}
    if(!best)for(const r of lay.regions){v.copy(regionPoint(r)).project(cam);const d=Math.hypot(v.x-x,(v.y-y)*.7);if(v.z<1&&d<bd*2.5){bd=d/2.5;best=`r:${r.id}`;}}
    return best;}
  function inspect(id,i){if(!id)return null;
    if(id.startsWith('r:')){const k=regionIdx.get(id.slice(2)),r=lay.regions[k];if(!r)return null;return {position:regionPoint(r),text:`${ctx.name(r.id)} · a region of the form`,sub:`${role(r.id)} · ${plural(r.live,'file')}`};}
    const k=siteIdx.get(id),m=model.modules.get(id);if(k===undefined||!m||!sitePos[k])return null;const deps=threads.filter(t=>lay.sites[t.a].id===id||lay.sites[t.b].id===id).length;
    return {position:new THREE.Vector3(...sitePos[k]),text:`A site of ${ctx.name(lay.sites[k].region)} · ${model.stateAt(m,i.t)}`,sub:`${plural(model.symbolsAt(m,i.t),'symbol')} · ${plural(deps,'thread')}`};}
  function stats(){return {form:fc.form,power:fc.form==='bulb'||fc.form==='julia'?fc.power:null,iterations:+itNow.toFixed(2),drawnIterations:+itDraw.toFixed(2),mass:+massNow.toFixed(1),
    regions:lay.regions.length,sites:lastStats.sites||0,threads:lastStats.threads||0,touches:touches.length,blooms:blooms.filter(s=>s.full).length,lastBloom:blooms.length?(blooms.at(-1).full?'bloom':'local'):null,firing:lastStats.fires||0,
    decoherence:+stressNow.toFixed(2),fx:fx.n};}
  function dispose(){const objs=[];scene.traverse(o=>{if(o!==scene)objs.push(o);});for(const o of objs){scene.remove(o);o.material?.dispose?.();}
    for(const x of disposables)x.dispose?.();}
  // After a seek: no transient survives (the lasting inner light comes back from the director's record).
  function onPrime(){for(const l of [waves,decoheres,recoheres,glows,blooms,deepens])l.length=0;agentState.clear();lastSig='';}
  // Composition anchors (layers.js): the form, its regions, the sites, its rim. Read-only.
  const composeA={center:new THREE.Vector3(),extent:14,subsystems:[],active:{pos:new THREE.Vector3()},nodes:[],boundary:{radius:16,y:0}};
  function composeAnchors(i){const Rw=R0*(1+SWELL*.5)*gsNow*WS;composeA.center.set(0,0,0);composeA.extent=Rw;composeA.boundary.radius=Rw*1.1;composeA.boundary.y=0;
    composeA.subsystems=lay.regions.map(r=>({id:r.id,pos:regionPoint(r),size:Math.max(1,r.extent*Rw)}));
    composeA.nodes=sitePos.filter(Boolean).slice(0,64).map(p=>({pos:new THREE.Vector3(...p)}));
    const att=i?ctx.director.attentionAt(i.t,1):null;composeA.active.pos.copy((att&&attentionPoint(att)?.pos)||composeA.center);return composeA;}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime,
    compose:{camera,scene,anchors:composeAnchors},...(LIFE?{lifeStats,onLifeParams}:{})};
}

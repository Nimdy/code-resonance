// Synaptic Storm (preview): the software as an immense living neural network. Design brief: docs/worlds/synaptic-storm.md.
//
// Data -> image (nothing here is decoration that claims engineering work):
//  - subsystem (district) -> a cluster of glassy neurons, laid out by a force layout over the real cross-subsystem
//                            dependencies (synaptic-layout.js); its first neuron is the hub
//  - file (module)        -> a dendrite branch of a neuron (K files per neuron, in creation order), a recursive tree
//                            seeded by the file that grows outward as far as the file's symbols reach
//  - symbol               -> a bouton on its file's branch (nearest first), lit while it exists
//  - dependency           -> an axon from the importing file's neuron to a synapse on the imported file's branch; axons
//                            between two clusters bundle into one tract
//  - agent                -> a travelling signal in its provider's colour and shape (CAST seat): it rides to the branch
//                            it works on, injects pulses into it on the beat while a tool runs (inward along the branch,
//                            in its colour), and that neuron fires: the soma flashes and the spike runs down its axons to
//                            the synapses of what the file imports, where a spark jumps the gap
//  - human edit, new file, new symbols -> an input pulse along that branch (warm white, gold)
//  - tests passing        -> an activation wave sweeping across the covered branches; their neurons fire in its order
//  - failure              -> the covered branches misfire: static crackles along them, their neurons fire off the beat
//                            and the spikes die halfway down the axon; the neighbourhood dims (inhibition). Never gold
//  - recovery             -> resynchronisation: the repaired neurons fire together on the next three beats
//  - verified milestone   -> the earned storm (a synchronous cascade from the subject through the network graph, three
//                            volleys), at most once per STORM_GAP of performance time and only with the director's
//                            milestone token; otherwise a local cascade. It leaves myelin on the subject's axons (lasting)
// Ambient life (never progress): spontaneous low-rate firing on the beat grid (seeded per neuron and beat, raised by
// recent work), the glow breathing on the bars, slow drift, motes and bokeh, a far out-of-focus network (atmosphere).
// Every image is a function of the model, the recipe, the director's fold and the performance clock.
import {THREE,NOISE,clamp,lerp,smooth,hash,rand} from './core.js';
import {layoutConfig,createLayout,dendriteTree,slotDirection,spontaneous} from './synaptic-layout.js';
import {presence} from '../providers.js';
import {createSynapticGrammar,createAnchors,frameScale,dormant as lifeDormant,GLIA,VESICLE,MICROGLIA} from './life/synaptic.js';
import {position as lifePosition,follower as lifeFollower,visibility as lifeVisibility,musicLook} from './life/present.js';
import {u01,MODE as LIFE_MODE} from './life/sim.js';
const TAU=Math.PI*2,TW=128,NT=5,FT=5,NONE=-1e5,FAR=1e6;
const MAX_AXONS=720,MAX_FX=6000,MOTES=1800,STORM_GAP=240000,DWELL=4500;
// A synaptic terminal's bell, in axon radii. The far tissue's fibres.
const TERM=8,FIBRES=32;
// Each CAST provider its own colour and shape (seat: Claude, Cursor, Codex, Grok, Qwen, Kimi, then unknown providers);
// the shape is the seat's index in the signal shader: four-point spark, ring, diamond, six-point star, triangle, double
// ring, then a soft dot.
const AGENT_COLORS=['#ff5f8a','#3fe6ff','#8dff6a','#f2f4ff','#59a8ff','#ff5cf0','#ffb35c','#c0c8d8'];
// Colour codes in the state textures: 0-7 agent seats, then these.
const C_HUMAN=8,C_GROW=9,C_VALID=10,C_STORM=11,C_MIS=12,C_SPONT=13;
const STRONG=new Set(['editing','writing','running','testing','building','checking']),LIGHT=new Set(['reading','searching','researching']);
const secs=(t,epoch)=>Number.isFinite(t)?(t-epoch)/1000:(t>0?FAR:NONE);
// GLSL shared by every material: state lookups, drift (the JS drift below must agree), depth of field.
const COMMON=`
uniform highp sampler2D uN,uF;
uniform float uT,uV,uSpeed,uDrift,uFocus,uDof,uPx,uTrans,uGlowK,uVd,uVa,uBreath,uBeat,uMyelin,uQ,uAxK;
uniform vec2 uRes;
uniform vec3 uSoma,uMem,uSpark,uHi,uWarn,uValid;
uniform vec3 uCol[14];
vec4 nT(float n,int k){int i=int(n+.5);return texelFetch(uN,ivec2(i%128,(i/128)*${NT}+k),0);}
vec4 fT(float f,int k){int i=int(f+.5);return texelFetch(uF,ivec2(i%128,(i/128)*${FT}+k),0);}
vec3 drift(float s){return uDrift*vec3(sin(uV*.13+s*6.2832)*.55,sin(uV*.097+s*12.1)*.4,sin(uV*.111+s*3.7)*.55);}
float age(float t0){return (uT-t0)/uSpeed;}
float ppu(float z){return projectionMatrix[1][1]*uRes.y*.5/max(z,.1);}
float coc(float z){return uDof*clamp(abs(z-uFocus)/max(z,1.),0.,1.)*15.*uPx;}
// What passes right in front of the lens fades out instead of filling the frame.
float nearFade(float z){return smoothstep(3.,max(8.,.42*uFocus),z);}
vec3 colOf(float c){return uCol[int(clamp(c,0.,13.)+.5)];}
`;
// Fragment noise for the membranes' fine structure: a hash, value noise, and a web of fine filaments (ridged, two octaves).
const FRAG_NOISE=`
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+1.),f.x),f.y);}
float web(vec2 p){float a=1.-abs(vn(p)*2.-1.),b=1.-abs(vn(p*2.3+7.1)*2.-1.);return pow(a,7.)*.75+pow(b,9.)*.5;}
`;
// A glassy tube: bright rims (sharp in focus), a clear body, inner light in the core, a soft halo. Up close (where the
// tube is wide enough on screen to hold it, in focus) its membrane shows a web of fine filaments with gold specks caught
// in it; gold beads ride every fibre. vEnd: where an axon gives way to its synaptic terminal. vAl, vLen: the position
// along the segment and its length on screen (px), past which a free end is rounded.
const TUBE_VARY='varying vec3 vCol,vMemC,vPulse;varying float vV,vE,vBl,vCrk,vD,vSeed,vW,vWb,vR,vGold,vEnd,vAl,vLen;';
const TUBE_FS=`uniform float uTrans,uV,uQ;uniform vec3 uWarn,uSpark;${TUBE_VARY}${FRAG_NOISE}
float hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){float o=max(0.,max(-vAl,vAl-vLen))/max(vWb,1e-3),v=length(vec2(vV,o));if(v>1.8)discard;
  float core=exp(-v*v*2.2),rim=exp(-pow((v-.84)*(4.5-2.5*vBl),2.))*(1.-.6*vBl),halo=exp(-v*v*.55)*.2*smoothstep(1.8,1.4,v);
  vec3 c=vMemC*(rim*uTrans*.55+halo)+vCol*core+vPulse*(core*1.2+halo*2.);
  float sharp=(1.-vBl)*step(uQ,2.5),ppw=vW/max(vR,1e-3);
  if(sharp>.01){
    // the web is laid out in tube radii (around the visible half, and along), so every tube carries the same weave
    float tex=smoothstep(4.,10.,vW)*sharp*(1.-smoothstep(.92,1.02,v));
    if(tex>.01){vec2 q=vec2(vD/max(vR,1e-3)*.55,asin(clamp(vV,-1.,1.))*1.3+vSeed*9.);
      c+=vMemC*web(q*1.7)*(.35+.65*smoothstep(.2,.95,v))*tex*1.1;
      vec2 g=q*vec2(1.6,2.2),f=fract(g)-.5;float hs=hh(floor(g)+vSeed*31.);
      if(hs>.83)c+=uSpark*exp(-dot(f,f)*90.)*tex*(.6+.4*sin(uV*(1.3+hs*2.)+hs*40.))*1.4*vGold;}
    // round beads, at least a pixel and a half, where they stand apart on screen
    float cw=max(vR*5.,.45),cpx=cw*ppw,bx=vD/cw+vSeed*13.,bc=floor(bx),bh=hh(vec2(bc,vSeed*7.));
    if(bh>.6){float rad=max(1.5,.5*vW),dx=(fract(bx)-.2-.6*hh(vec2(bc+3.,1.)))*cpx,dy=vV*vWb;
      c+=uSpark*exp(-(dx*dx+dy*dy)/(rad*rad))*(.55+.45*sin(uV*(.9+bh*1.7)+bh*60.))*vGold*sharp*smoothstep(5.,12.,cpx/rad)*1.3;}}
  if(vCrk>.01){float k=step(.8,hh(vec2(floor(vD*5.),floor(uV*15.+vSeed*40.))));c+=uWarn*k*vCrk*(core+halo)*1.6;}
  gl_FragColor=vec4(c*vE*(1.-smoothstep(vEnd-.3,vEnd,vD)),1.);}`;
// Quad expansion shared by dendrites and axons: a camera-facing ribbon between a and b, at least ~1 px wide, widened
// and dimmed by the circle of confusion (energy kept). ta, tb: the tangents at the ends, shared with the neighbouring
// segment at a joint so that their edges meet exactly; ca, cb: 1 at a free end, which reaches out by the half-width and
// is rounded. wpx: the tube's own radius in pixels here; wb: the ribbon's (blurred) half-width unit in pixels.
const RIBBON=`
vec2 scr(vec4 v){vec4 c=projectionMatrix*v;return c.xy/max(c.w,1e-3)*uRes*.5;}
vec4 ribbon(vec3 a,vec3 b,vec3 ta,vec3 tb,float ra,float rb,float ca,float cb,out float e,out float bl,out float wpx,out float wb){
  vec4 va=viewMatrix*vec4(a,1.),vb=viewMatrix*vec4(b,1.),vp=mix(va,vb,position.x);
  vec3 t=mat3(viewMatrix)*mix(ta,tb,position.x),sd=cross(t,vp.xyz);sd=length(sd)>1e-7?normalize(sd):vec3(1.,0.,0.);
  vec3 tv=t-sd*dot(t,sd);tv=length(tv)>1e-7?normalize(tv):vec3(0.,1.,0.);
  float r=mix(ra,rb,position.x),z=max(-vp.z,.1),k=ppu(z),rpx=r*k,cc=coc(z),w=min(max(rpx,.75*uPx)+cc,36.*uPx);
  float cap=mix(ca,cb,position.x)*w*1.8,sx=position.x*2.-1.;
  vLen=length(scr(vb)-scr(va));vAl=position.x*vLen+sx*cap;
  vp.xyz+=sd*position.y*w*1.8/k+tv*sx*cap/k;vV=position.y*1.8;bl=clamp(cc/w,0.,1.);e=max(rpx,.75*uPx)/max(w,max(rpx,.75*uPx))*min(1.,rpx/(.75*uPx)*.6+.4)*nearFade(z);
  wpx=rpx;wb=w;return projectionMatrix*vp;}
`;
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome||{},P=G.palette||{};
  // Digital life (life/synaptic.js): only when the recipe has it on. Off, nothing below differs from the world without
  // it (no resource, no draw call, no uniform, no shader text): every life addition is guarded by LIFE.
  const LIFE=ctx.life||null;
  const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  const atm=G.atmosphere||{},mtl=G.material||{},mot=G.motion||{},cam=G.camera||{},LT=G.light||{},MU=G.music||{};
  const col=(c,d)=>new THREE.Color(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:d);
  const pal={primary:col(P.primary,'#ffae42'),secondary:col(P.secondary,'#7c6cf0'),accent:col(P.accent,'#ffd979'),highlight:col(P.highlight,'#fff1dc'),
    deep:col(P.deep,'#05061a'),haze:col(P.haze,'#1e1642'),warning:col(P.warning,'#ff4d6a'),valid:col(P.valid,'#6fe3c8')};
  // The void stays a void whatever a tuned palette says.
  const capL=(c,max)=>{const h={};c.getHSL(h);if(h.l>max)c.setHSL(h.h,h.s,max);return c;};capL(pal.deep,.075);capL(pal.haze,.2);
  const seed=(recipe.projectSeed>>>0)||1;
  const layout=createLayout(layoutConfig(recipe)),cfg=layout.cfg;
  const V3=(c,k=1)=>new THREE.Vector3(c.r*k,c.g*k,c.b*k);
  const agentCol=AGENT_COLORS.map(c=>new THREE.Color(c));
  const COLS=[...agentCol.map(c=>V3(c,1.5)),V3(new THREE.Color('#fff4e4'),1.3),V3(pal.primary,1.4),V3(pal.valid,1.3),V3(pal.accent.clone().lerp(pal.primary,.35).lerp(pal.highlight,.25),1.9),V3(pal.warning,1.1),V3(pal.primary,1)];
  const RATE=clamp(num(mot.firingRate,1),.1,2.2),SYNC=clamp(num(mot.sync,.55),0,1),COND=clamp(num(mot.conduction,1),.4,2);
  const VD=7*COND,VA=11*COND,GHOSTS=clamp(num(atm.ghosts,.8),0,1.6),PARTICLES=clamp(num(atm.particles,.85),0,1.6);
  const U={uT:{value:0},uV:{value:0},uSpeed:{value:1},uDrift:{value:0},uFocus:{value:60},uDof:{value:clamp(num(atm.depthOfField,.85),0,1.6)},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},
    uTrans:{value:.5+.9*clamp(num(mtl.translucency,.65),0,1)},uGlowK:{value:clamp(num(mtl.glow,1),.4,1.8)},uVd:{value:VD},uVa:{value:VA},uBreath:{value:0},uBeat:{value:0},uMyelin:{value:0},uQ:{value:0},uAxK:{value:1},
    uSoma:{value:V3(pal.primary)},uMem:{value:V3(pal.secondary)},uSpark:{value:V3(pal.accent,1.6)},uHi:{value:V3(pal.highlight)},uWarn:{value:V3(pal.warning)},uValid:{value:V3(pal.valid)},
    uCol:{value:COLS},uN:{value:null},uF:{value:null}};
  // Life on: the neurons answer their inhabitants (NE.z: the life gathered at a neuron, 0..1). Empty without life.
  const LG={mem:LIFE?'*(1.+.6*NE.z)':'',dend:LIFE?'*(1.+.45*NE.z*near)':'',vary:LIFE?'varying float vLg;':'',term:LIFE?'vLg=nT(xA.y,4).z;':'',cleft:LIFE?'*(1.+3.*vLg)':''};
  const disposables=[];const keep=x=>{disposables.push(x);return x;};
  const add=(o,order=0)=>{o.frustumCulled=false;o.renderOrder=order;scene.add(o);return o;};
  const glow=(vertexShader,fragmentShader,extra={})=>keep(new THREE.ShaderMaterial({uniforms:{...U,...extra},vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
  // ---- State textures: per neuron and per file, rewritten every frame (positions, firings, inputs, conditions) --------
  function stateTex(texels){let tex=null,cap=0,data=null;
    return {ensure(n){if(tex&&n<=cap)return;cap=Math.max(TW,2**Math.ceil(Math.log2(Math.max(1,n))));data=new Float32Array(TW*Math.ceil(cap/TW)*texels*4);
        tex?.dispose();tex=new THREE.DataTexture(data,TW,Math.ceil(cap/TW)*texels,THREE.RGBAFormat,THREE.FloatType);tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true;},
      set(i,k,a,b,c,d){const o=((Math.floor(i/TW)*texels+k)*TW+i%TW)*4;data[o]=a;data[o+1]=b;data[o+2]=c;data[o+3]=d;},
      commit(){tex.needsUpdate=true;},get texture(){return tex;},dispose(){tex?.dispose();}};}
  const NS=stateTex(NT),FS=stateTex(FT);NS.ensure(1);FS.ensure(1);
  // ---- Background: the navy-violet void, slow haze, two vast soft glows of the far brain -------------------------------
  // The far tissue's fibres (seeded per project): per fibre its arc's normal and depth, two wander directions and a
  // phase, whether it is warm; a bokeh node on each arc.
  const fibres=[],nodes=[];
  {const r=k=>rand(hash(`fibre/${seed}/${k}`)),unit=k=>{const u=r(k)*2-1,a=r(k+1)*TAU,s=Math.sqrt(1-u*u);return [Math.cos(a)*s,u,Math.sin(a)*s];};
    for(let k=0;k<FIBRES;k++){const o=k*16,n=unit(o),t=unit(o+10),dt=t[0]*n[0]+t[1]*n[1]+t[2]*n[2],p=[t[0]-n[0]*dt,t[1]-n[1]*dt,t[2]-n[2]*dt],l=Math.hypot(...p)||1;
      fibres.push(new THREE.Vector4(...n,r(o+6)),new THREE.Vector4(...unit(o+2),r(o+7)*TAU),new THREE.Vector4(...unit(o+4),r(o+8)<.15?1:0));
      nodes.push(new THREE.Vector4(p[0]/l,p[1]/l,p[2]/l,.006+.016*r(o+12)));}}
  const bgU={uFib:{value:fibres},uNode:{value:nodes},uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uDeep:{value:V3(pal.deep)},uHaze:{value:V3(pal.haze)},uMem:U.uMem,uSoma:U.uSoma,uV:U.uV,uQ:U.uQ,
    uHazeK:{value:clamp(num(atm.haze,.75),0,1.6)},uWebK:{value:0},uStress:{value:0},uTide:{value:0},uStorm:{value:0},uSeed:{value:new THREE.Vector3(rand(seed)*9,rand(seed+1)*9,rand(seed+2)*9)}};
  const background_=keep(new THREE.ShaderMaterial({uniforms:bgU,depthWrite:false,depthTest:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`${NOISE}varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam,uDeep,uHaze,uMem,uSoma,uSeed;uniform float uV,uQ,uHazeK,uWebK,uStress,uTide,uStorm;
      uniform vec4 uFib[${FIBRES*3}],uNode[${FIBRES}];
      void main(){vec4 pp=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(pp.xyz/pp.w-uCam);
        vec3 c=uDeep*(1.5+1.2*smoothstep(-.6,.8,d.y));
        float n=uQ>2.5?.2:fbm3(d*1.8+uSeed+vec3(0.,uV*.004,0.)),m=gnoise(d*4.1+uSeed.zxy+vec3(uV*.003,0.,0.));
        c+=uHaze*(.3+uHazeK*(.5+1.2*smoothstep(-.3,.5,n))*(.7+.3*m))*(1.-.4*uStress);
        // the far tissue (atmosphere, never code): out-of-focus fibres in every direction (seeded arcs that wander, break
        // off and differ in depth: wider and softer nearer), soft bokeh nodes on them; it drifts very slowly
        if(uQ<2.5&&uWebK>.001){vec3 fib=vec3(0.),warm=uMem*.6+uSoma*.25;float t=uV*.004;
          // a pixel well outside a fibre's band (its wander plus three widths) skips it: most pixels see two or three
          for(int k=0;k<${FIBRES};k++){vec4 N=uFib[k*3];float d0=dot(d,N.xyz);if(abs(d0)>.058)continue;vec4 A=uFib[k*3+1],B=uFib[k*3+2];
            float da=dot(d,A.xyz),db=dot(d,B.xyz),dist=abs(d0+.022*sin(da*14.+A.w+t)+.007*sin(db*31.+A.w*2.)),wd=mix(.0022,.009,N.w);
            fib+=mix(uMem,warm,B.w)*smoothstep(.15,.55,.5+.5*sin(db*4.+A.w*3.))*exp(-dist*dist/(wd*wd))*mix(1.,.35,N.w);
            vec4 P=uNode[k];float q=1.-dot(d,P.xyz);fib+=uSoma*.6*smoothstep(P.w*P.w*.5,0.,q)*(.7+.3*sin(uV*.25+A.w))*mix(1.,.4,N.w);}
          c+=fib*.16*uWebK*(.6+.4*smoothstep(-.4,.6,n))*(1.-.4*uStress);}
        vec3 w=normalize(vec3(cos(uSeed.x),.18,sin(uSeed.x))),k=normalize(vec3(cos(uSeed.y),-.1,sin(uSeed.y)));
        c+=uSoma*.07*uHazeK*exp(-(1.-dot(d,w))*4.)*(1.+.8*uStorm)+uMem*.12*uHazeK*exp(-(1.-dot(d,k))*2.5);
        c+=uMem*uTide*.05*smoothstep(.1,.9,gnoise(d*2.3+vec3(uV*.02,0.,0.))+.4);
        gl_FragColor=vec4(c,1.);}`}));
  // ---- Dendrites: instanced ribbons in each neuron's frame ---------------------------------------------------------------
  const quad=keep(new THREE.BufferGeometry());quad.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,0,1,0,1,1,0],3));quad.setIndex([0,1,2,2,1,3]);
  const dend=instancedBuffersOf(quad,{sA:4,sB:4,sI:4,sD:4,sT:4,sU:4});
  const dendMat=glow(`${COMMON}${TUBE_VARY}${RIBBON}attribute vec4 sA,sB,sI,sD,sT,sU;
    void main(){
      vec4 FC=fT(sI.y,2);float R=max(FC.w,.01),g0=sI.z/R,g1=sI.w/R,grow=clamp((FC.z-g0)/max(1e-4,g1-g0),0.,1.);
      vec4 NA=nT(sI.x,0),ND=nT(sI.x,3);
      float life=ND.x*smoothstep(0.,.8,age(FC.x))*(1.-smoothstep(0.,1.6,age(FC.y)));
      if(grow<=0.||life<=.002){gl_Position=vec4(0.,0.,2.,1.);return;}
      vec3 base=NA.xyz+drift(ND.z)+sD.xyz*NA.w*.85;
      float d=mix(sI.z,mix(sI.z,sI.w,grow),position.x),near=exp(-d/(2.4*uGlowK));
      // a trunk swells where it leaves the soma (not in the far network: it is only atmosphere); a growing tip is a free end
      float tk=step(sD.w,.5)*step(.9,ND.y)*1.8,RS=.55*max(NA.w,.3),dB=mix(sI.z,sI.w,grow);
      float ra=sA.w*(1.+tk*exp(-sI.z/RS)),rb=sB.w*(1.+tk*exp(-dB/RS)),r=mix(ra,rb,position.x),open=step(grow,.999);
      float e,bl,wpx,wb;gl_Position=ribbon(base+sA.xyz,base+mix(sA.xyz,sB.xyz,grow),sT.xyz,mix(sU.xyz,sB.xyz-sA.xyz,open),ra,rb,sT.w,max(sU.w,open),e,bl,wpx,wb);
      vec4 NB=nT(sI.x,1),NC=nT(sI.x,2),NE=nT(sI.x,4),FA=fT(sI.y,0),FB=fT(sI.y,1),FD=fT(sI.y,3);
      float stress=FB.w;
      vec3 inner=mix(uMem*.36,uSoma*1.3*uGlowK,near*near)*(.7+.3*uBreath+.25*uBeat*near);
      vec3 p=vec3(0.);
      // a soma's firing floods back into its dendrites
      float a1=age(NB.x),a2=age(NB.w);
      p+=colOf(NB.z)*abs(NB.y)*step(0.,a1)*exp(-a1*2.4)*exp(-d*.32);
      p+=colOf(NC.y)*abs(NC.x)*step(0.,a2)*exp(-a2*2.4)*exp(-d*.32);
      // inputs run inward from the branch's reach to the soma
      float rv=R-d,i1=age(FA.x),i2=age(FA.w),done=R/uVd+.4;
      p+=colOf(FA.z)*FA.y*step(0.,i1)*exp(-pow((rv-uVd*i1)*.9,2.))*(1.-smoothstep(done-.3,done,i1))*2.2;
      p+=colOf(FB.y)*FB.x*step(0.,i2)*exp(-pow((rv-uVd*i2)*.9,2.))*(1.-smoothstep(done-.3,done,i2))*2.2;
      // tests passing: an activation wave out from the soma
      float w1=age(FB.z);p+=uValid*1.4*step(0.,w1)*exp(-pow((d-uVd*1.3*w1)*.7,2.))*exp(-w1*.3);
      // a synapse of an incoming axon fired
      float s1=age(FD.x);p+=uSpark*FD.y*step(0.,s1)*exp(-abs(d-.3*R)*.8)*exp(-s1*2.);
      // the storm floods everything; potentiation (a commit) warms it
      p+=colOf(11.)*NC.w*(.45+.55*near)+uSoma*NE.y*.6*near;
      // an agent's attributed edit leaves the branch glowing in its colour for a while
      vec4 FE=fT(sI.y,4);float t1=age(FE.x);p+=colOf(FE.y)*FE.z*step(0.,t1)*exp(-t1/3.5)*(.7+.6*near);
      inner+=uValid*FD.w*.22*near;
      inner=mix(inner,uWarn*.3+uMem*.12,stress*.75)*(1.-.45*stress);
      float dim=(1.-.7*NC.z)*ND.y;
      vCol=inner*dim${LG.dend};vPulse=p*dim;vMemC=uMem*dim*(.55+.45*near)*(1.-.35*stress)${LG.dend};vE=e*life;vBl=bl;vCrk=stress;vD=d;
      vSeed=fract(ND.z+sin(dot(sA.xyz,vec3(12.9898,78.233,37.719)))*43758.5453);vW=wpx;vWb=wb;vR=r;vGold=(.55+.7*near)*dim*(1.-stress);vEnd=1e6;}`,TUBE_FS);
  add(new THREE.Mesh(dend.geometry,dendMat),2);
  // ---- Axons: cubic curves between neurons, evaluated on the GPU from the neurons' live positions -----------------------
  const axon=instancedBuffersOf(quad,{xA:4,xB:4,xC:4,xD:4});
  // An axon's curve from its source soma to its synapse (xB: the synapse's offset on the target neuron, the axon's radius).
  const AXON=`vec3 bez(vec3 p0,vec3 p1,vec3 p2,vec3 p3,float u){float v=1.-u;return v*v*v*p0+3.*v*v*u*p1+3.*v*u*u*p2+u*u*u*p3;}
    vec3 bezd(vec3 p0,vec3 p1,vec3 p2,vec3 p3,float u){float v=1.-u;return 3.*v*v*(p1-p0)+6.*v*u*(p2-p1)+3.*u*u*(p3-p2);}
    void axonPts(vec4 xA,vec4 xB,vec4 xC,out vec3 p0,out vec3 p1,out vec3 p2,out vec3 e,out float L,out vec4 SD,out vec4 DD){
      vec4 SA=nT(xA.x,0),DA=nT(xA.y,0);SD=nT(xA.x,3);DD=nT(xA.y,3);
      vec3 s=SA.xyz+drift(SD.z),ch;e=DA.xyz+drift(DD.z)+xB.xyz;ch=e-s;L=max(length(ch),1e-3);vec3 dir=ch/L;p0=s+dir*SA.w*.9;
      vec3 up=abs(dir.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.),n1=normalize(cross(up,dir)),n2=cross(dir,n1);
      p1=p0+ch*.33+(n1*xC.x+n2*xC.y)*L;p2=p0+ch*.67+(n1*xC.z+n2*xC.w)*L;}`;
  const axonMat=glow(`${COMMON}${TUBE_VARY}${RIBBON}${AXON}attribute vec4 xA,xB,xC,xD;
    float spike(float t0,float s,float u,float L){float a=age(t0);if(a<0.)return 0.;float f=uVa*a/L;if(f>1.08)return 0.;
      float k=s<0.?1.-smoothstep(.22,.5,f):1.;return abs(s)*k*(exp(-pow((u-f)*L*.8,2.))*1.6+step(u,f)*exp(-(f-u)*L/3.)*.35);}
    void main(){
      vec3 p0,p1,p2,e;float L;vec4 SD,DD;axonPts(xA,xB,xC,p0,p1,p2,e,L,SD,DD);
      float life=min(SD.x,DD.x)*(1.-smoothstep(0.,1.6,age(xD.y))),gr=smoothstep(0.,2.4,age(xD.x));
      if(life<=.002||gr<=xA.z){gl_Position=vec4(0.,0.,2.,1.);return;}
      float u0=xA.z,u1=min(xA.w,gr),e2,bl,wpx,wb,ra=xB.w*(1.-.35*u0),rb=xB.w*(1.-.35*u1),r=mix(ra,rb,position.x);
      gl_Position=ribbon(bez(p0,p1,p2,e,u0),bez(p0,p1,p2,e,u1),bezd(p0,p1,p2,e,u0),bezd(p0,p1,p2,e,u1),ra,rb,step(u0,1e-4),min(1.,step(u1,xA.w-1e-4)+step(.9999,xA.w)),e2,bl,wpx,wb);
      float u=mix(u0,u1,position.x),Ls=L*1.12;
      vec4 NB=nT(xA.x,1),NC=nT(xA.x,2),NE=nT(xA.x,4);
      vec3 p=colOf(NB.z)*spike(NB.x,NB.y,u,Ls)+colOf(NC.y)*spike(NB.w,NC.x,u,Ls)+colOf(11.)*NC.w*.5;
      float my=max(SD.w,uMyelin*.4),bead=smoothstep(.5,.95,.5+.5*cos(u*Ls*2.2+xD.z*30.));
      float dim=(1.-.6*NC.z)*min(SD.y,DD.y);
      vCol=(uMem*.16+uSoma*my*bead*.55*uGlowK)*dim;vPulse=p*dim;vMemC=uMem*(.5+.35*xD.w+.4*my)*dim*(1.-.3*NE.x);
      vE=e2*life;vMemC*=uAxK;vCol*=uAxK;vPulse*=.5+.5*uAxK;vBl=bl;vCrk=NE.x*.6;vD=u*Ls;vSeed=xD.z;
      vW=wpx;vWb=wb;vR=r;vGold=.7*dim*uAxK;vEnd=gr>=1.?Ls-${(TERM*.85).toFixed(2)}*xB.w*1.12:1e6;}`,TUBE_FS);
  add(new THREE.Mesh(axon.geometry,axonMat),1);
  // ---- Somas: irregular glass cells around a golden nucleus (billboards) ----------------------------------------------
  const sq=keep(new THREE.PlaneGeometry(2,2));
  const soma=instancedBuffersOf(sq,{sN:1});
  const somaMat=glow(`${COMMON}attribute float sN;varying vec2 vQ;varying float vBl,vFl,vAr,vRs,vSt,vE,vK,vSd,vPx;varying vec3 vNuc,vMemS,vRc;
    void main(){
      vec4 NA=nT(sN,0),NB=nT(sN,1),NC=nT(sN,2),ND=nT(sN,3),NE=nT(sN,4);
      if(ND.x<=.002){gl_Position=vec4(0.,0.,2.,1.);return;}
      vec3 c=NA.xyz+drift(ND.z);vec4 vc=viewMatrix*vec4(c,1.);float z=max(-vc.z,.1),k=ppu(z),R=NA.w*(.3+.7*ND.x),cc=coc(z),cw=cc/k;
      float H=(R+cw)*3.2;vc.xy+=position.xy*H;vQ=position.xy*H/(R+cw);vK=R/(R+cw);vBl=cc/(R*k+cc);vPx=R*k;
      float a1=age(NB.x),a2=age(NB.w);vFl=abs(NB.y)*step(0.,a1)*exp(-a1*3.)+abs(NC.x)*step(0.,a2)*exp(-a2*3.)+NC.w*.8+NE.y*.4;
      vAr=a1;vRs=abs(NB.y)*step(0.,a1);vRc=colOf(NB.z);vSt=NE.x;vSd=ND.z;
      vNuc=mix(uSoma*uGlowK,colOf(NB.z),clamp(abs(NB.y)*step(0.,a1)*exp(-a1*1.5)*.7,0.,.7))*(.85+.25*uBreath+.3*uBeat);
      vNuc=mix(vNuc,uWarn*.45+uMem*.1,NE.x*.7);vMemS=uMem${LG.mem};
      vE=ND.y*(1.-.7*NC.z)*vK*vK*nearFade(z);
      gl_Position=projectionMatrix*vc;}`,
    `uniform float uTrans,uV,uQ;uniform vec3 uHi,uWarn,uSpark;varying vec2 vQ;varying float vBl,vFl,vAr,vRs,vSt,vE,vK,vSd,vPx;varying vec3 vNuc,vMemS,vRc;
    ${FRAG_NOISE}
    void main(){float r0=length(vQ),b=vBl,s=vSd*40.,det=smoothstep(8.,30.,vPx)*(1.-b)*step(uQ,2.5);
      // lobes where the cell pulls out into its trunks, slowly changing (a small neuron stays a round point of light)
      float t=atan(vQ.y,vQ.x),r=r0/(1.+det*(.07*sin(t*3.+s)+.05*sin(t*5.+s*1.7+uV*.05)+.03*sin(t*8.+s*2.3)));
      float inside=1.-smoothstep(1.-.06-b*.5,1.+b*.4,r),zc=sqrt(max(0.,1.-r*r));
      float fres=pow(1.-zc,2.)*inside*(1.-.6*b),halo=exp(-max(0.,r-.9)*3.2)*.16;
      // up close the golden nucleus draws in to a bright core inside two glassy shells
      float nuc=mix(exp(-r0*r0*(6.-3.5*b)),exp(-r0*r0*11.)*.9+exp(-r0*r0*55.)*1.1,det);
      vec2 hl=vQ-vec2(-.36,.4);float spec=exp(-dot(hl,hl)*28.)*inside*(1.-b);
      float ring=vRs*exp(-pow((r-(1.05+vAr*3.))*6.,2.))*exp(-vAr*4.)*.18;
      float flick=vSt>.01?.55+.45*step(.45,fract(sin(floor(uV*13.+vSd*50.)*91.7)*4375.85)):1.;
      vec3 c=vMemS*(.1*inside+fres*1.3)*uTrans+vNuc*(nuc*(1.1+vFl*2.6)*flick+halo*(.5+vFl*1.2))+uHi*spec*.7+uHi*ring;
      if(det>.01){
        // the membrane: a web of fine filaments wrapped on the cell, gold specks caught in it
        vec2 sp=vQ/(zc+.35);c+=vMemS*web(sp*3.2+vec2(s,uV*.01))*inside*(.25+.9*fres)*det*1.3;
        vec2 g=sp*7.+s,f=fract(g)-.5;float hs=h21(floor(g));
        if(hs>.86)c+=uSpark*exp(-dot(f,f)*70.)*inside*det*(.6+.4*sin(uV*(1.+hs*2.)+hs*50.));
        c+=vNuc*(exp(-pow((r0-.42)*16.,2.))*.45+exp(-pow((r0-.6)*20.,2.))*.25)*det;
        // organelles: glassy vesicles around the nucleus
        for(int k=0;k<6;k++){float fk=float(k),a=fk*1.047+s+sin(uV*.07+fk)*.2;vec2 o=vec2(cos(a),sin(a))*(.48+.2*h21(vec2(fk,s)));
          float d=length(vQ-o)/(.07+.06*h21(vec2(s,fk)));c+=(vMemS*1.2*exp(-pow((d-1.)*5.,2.))+uSpark*.25*exp(-d*d*6.))*det*.8;}}
      gl_FragColor=vec4(c*vE,1.);}`);
  add(new THREE.Mesh(soma.geometry,somaMat),3);
  // ---- Synaptic terminals: where each axon ends, a glass bell of vesicles facing a cup on the receiving branch across
  // the cleft; the spike's arrival is a spark jumping the gap (billboards along the axon's last stretch, on the GPU) ----
  const term=instancedBuffersOf(sq,{xA:4,xB:4,xC:4,xD:4});
  const termMat=glow(`${COMMON}${AXON}attribute vec4 xA,xB,xC,xD;varying vec2 vQ;varying float vE,vBl,vSp,vPx,vSd,vRel,vFl;varying vec3 vMemT,vSpC;${LG.vary}
    void main(){
      vec3 p0,p1,p2,e;float L;vec4 SD,DD;axonPts(xA,xB,xC,p0,p1,p2,e,L,SD,DD);
      float life=min(SD.x,DD.x)*(1.-smoothstep(0.,1.6,age(xD.y)))*smoothstep(.85,1.,smoothstep(0.,2.4,age(xD.x)));
      if(life<=.002){gl_Position=vec4(0.,0.,2.,1.);return;}
      float Rb=xB.w*${TERM}.,Ls=L*1.12;
      vec4 ve=viewMatrix*vec4(e,1.),vb=viewMatrix*vec4(bez(p0,p1,p2,e,clamp(1.-3.*Rb/Ls,.5,.98)),1.);vec3 ax=ve.xyz-vb.xyz;float al=max(length(ax),1e-5);
      vec2 dx=length(ax.xy)>1e-6?normalize(ax.xy):vec2(1.,0.),dy=vec2(-dx.y,dx.x);float fl=length(ax.xy)/al,sx=max(fl,.35);
      vec4 vc=ve-vec4(ax/al*Rb*.55,0.);float z=max(-vc.z,.1),k=ppu(z),cc=coc(z),cw=cc/k,hx=3.*Rb*sx+cw,hy=1.5*Rb+cw;
      vc.xy+=dx*position.x*hx+dy*position.y*hy;
      vQ=vec2(position.x*hx/(Rb*sx),position.y*hy/Rb);vPx=Rb*k;vBl=cc/(Rb*k+cc);vFl=fl;vSd=xD.z;
      vec4 NB=nT(xA.x,1),NC=nT(xA.x,2);
      float a1=age(NB.x)-Ls/uVa,a2=age(NB.w)-Ls/uVa,s1=NB.y>0.?NB.y*step(0.,a1)*exp(-a1*3.):0.,s2=NC.x>0.?NC.x*step(0.,a2)*exp(-a2*3.):0.;
      vSp=max(s1,s2)+NC.w*.4;vRel=s1>=s2?a1:a2;vSpC=mix(uSpark,colOf(s1>=s2?NB.z:NC.y),.45);
      float dim=(1.-.6*NC.z)*min(SD.y,DD.y);vMemT=uMem*1.1*dim;vE=life*dim*(Rb*k/(Rb*k+cc))*nearFade(z);${LG.term}
      gl_Position=projectionMatrix*vc;}`,
    `uniform float uV,uQ,uTrans;uniform vec3 uSpark,uHi;varying vec2 vQ;varying float vE,vBl,vSp,vPx,vSd,vRel,vFl;varying vec3 vMemT,vSpC;${LG.vary}
    ${FRAG_NOISE}
    // a glass wall: a faint body, bright where the line of sight grazes it; a rim seen at an angle
    float wall(float y,float rho,float aa){float v=y/max(rho,1e-3);return smoothstep(1.+aa,1.-aa,v)*(.12+.9*exp(-pow((v-.9)*6.,2.)));}
    float rim(vec2 q,float x0,float rx,float ry,float b){return exp(-pow((length(vec2((q.x-x0)/rx,q.y/ry))-1.)*(4.-2.*b),2.));}
    void main(){vec2 q=vQ;float x=q.x,y=abs(q.y),b=vBl,aa=1.5/max(vPx,1.)+b*.8,s=vSd*50.,det=smoothstep(6.,20.,vPx)*(1.-b)*step(uQ,2.5),rx=.14+.6*(1.-vFl);
      // presynaptic bell (the axon's stalk swelling into a cup open towards the cleft), postsynaptic cup on the branch
      float rho=mix(.16,1.,smoothstep(0.,.7,clamp((x+2.6)/2.35,0.,1.))),pre=smoothstep(-2.6-aa,-2.6+aa,x)*smoothstep(-.25+aa,-.25-aa,x);
      float rho2=mix(.92,.3,smoothstep(0.,1.,(x-.25)/1.55)),post=smoothstep(.25-aa,.25+aa,x)*smoothstep(1.8+aa,1.8-aa,x);
      vec3 c=vMemT*(wall(y,rho,aa)*pre+wall(y,rho2,aa)*post*.85)*uTrans+mix(vMemT,uSpark,.35)*rim(q,-.25,rx,.9,b)*.8+vMemT*rim(q,.25,rx,.94,b)*.6;
      // the cleft: a faint warm glow at rest; when a spike arrives a spark jumps the gap
      c+=uSpark*exp(-x*x*18.-y*y*2.5)*.12${LG.cleft};
      if(vSp>.002){float yy=q.y-.12*sin(x*17.+uV*37.+s)*exp(-max(vRel,0.)*2.);
        c+=vSpC*vSp*(exp(-yy*yy*60.)*smoothstep(.4,.2,abs(x))*2.2+exp(-(x*x+q.y*q.y)*7.)*2.+exp(-(x*x*2.+q.y*q.y*.6)*1.2)*.5);}
      if(det>.01){
        c+=vMemT*web(q*2.6+s)*(pre*smoothstep(1.,.2,y/rho)+post*smoothstep(1.,.2,y/rho2))*det*.9;
        // vesicles waiting in the bell; those near its mouth glow and cross the gap when it fires
        for(int k=0;k<9;k++){float fk=float(k),cx=-1.65+1.25*h21(vec2(fk,s)),ry=mix(.16,1.,smoothstep(0.,.7,(cx+2.6)/2.35))*.62;
          float sz=.11+.07*h21(vec2(fk*3.,s)),rel=min(1.,vSp)*smoothstep(-1.1,-.45,cx);
          vec2 o=vec2(cx+rel*min(max(vRel,0.),.6)*1.1,(h21(vec2(s,fk+.5))*2.-1.)*ry),dq=(q-o)/sz,hq=dq+vec2(.3,-.3);float d=length(dq);
          c+=(vMemT*1.4*exp(-pow((d-1.)*4.,2.))+uHi*.5*exp(-dot(hq,hq)*30.)+uSpark*(.25+1.6*rel)*exp(-d*d*3.))*det;}}
      gl_FragColor=vec4(c*vE,1.);}`);
  add(new THREE.Mesh(term.geometry,termMat),3);
  // ---- Boutons: one per symbol on its file's branch (GPU points in the neuron's frame) -----------------------------------
  const tips=pointBuffersOf({tI:4,tL:4,tD:4});
  const tipMat=glow(`${COMMON}attribute vec4 tI,tL,tD;varying vec3 vC;varying float vB;
    void main(){vec4 FC=fT(tI.y,2),FD=fT(tI.y,3),NA=nT(tI.x,0),ND=nT(tI.x,3);float R=max(FC.w,.01);
      float vis=step(tI.z+.5,FD.z)*step(tI.w/R,FC.z)*ND.x*smoothstep(0.,.8,age(FC.x))*(1.-smoothstep(0.,1.6,age(FC.y)));
      if(vis<=.002){gl_Position=vec4(0.,0.,2.,1.);gl_PointSize=0.;return;}
      vec4 vp=viewMatrix*vec4(NA.xyz+drift(ND.z)+tD.xyz*NA.w*.85+tL.xyz,1.);float z=max(-vp.z,.1),s=(tL.w>.5?.17:.11)*ppu(z)*2.,cc=coc(z);
      gl_PointSize=clamp(max(s,1.6*uPx)+cc,1.,96.);vB=cc/(s+cc);vis*=nearFade(z);
      vec4 FA=fT(tI.y,0),NB=nT(tI.x,1);float i1=age(FA.x),rv=R-tI.w,hit=FA.y*step(0.,i1)*exp(-pow((rv-uVd*i1)*.9,2.));
      float f1=age(NB.x),back=abs(NB.y)*step(0.,f1)*exp(-f1*2.4)*exp(-tI.w*.32);
      vC=(uSoma*.75*uGlowK+colOf(FA.z)*hit*2.+colOf(NB.z)*back)*vis*ND.y*pow(max(s,1.6*uPx)/(max(s,1.6*uPx)+cc),2.)*(1.-.5*fT(tI.y,1).w);
      gl_Position=projectionMatrix*vp;}`,
    `varying vec3 vC;varying float vB;void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q);
      float a=mix(exp(-r*r*6.)*1.3+exp(-r*r*40.)*1.5,smoothstep(1.,.75,r)*(.5+.5*smoothstep(.4,.95,r)),vB);gl_FragColor=vec4(vC*a,1.);}`);
  add(new THREE.Points(tips.geometry,tipMat),4);
  // ---- Motes and bokeh: the void's dust (GPU points, pure functions of time) ----------------------------------------------
  const motes=pointBuffersOf({mP:4,mS:4});
  {const r=n=>rand(hash(`mote/${seed}/${n}`));
    for(let k=0;k<MOTES;k++){const u=r(k*5)*2-1,a=r(k*5+1)*TAU,q=Math.pow(r(k*5+2),.5)*1.9,s=Math.sqrt(1-u*u);
      motes.write('position',k,0,0,0);motes.write('mP',k,Math.cos(a)*s*q,u*q*.6,Math.sin(a)*s*q,r(k*5+3));motes.write('mS',k,1+3.2*Math.pow(r(k*5+4),3),Math.floor(r(k*7)*3),0,0);}
    motes.commit(MOTES);}
  const moteMat=glow(`${COMMON}attribute vec4 mP,mS;uniform vec4 uNet;uniform float uGlial;varying vec3 vC;varying float vB;
    void main(){float s0=mP.w*6.2832;vec3 p=uNet.xyz+mP.xyz*uNet.w+uNet.w*.06*vec3(sin(uV*.021+s0),sin(uV*.017+s0*1.7)*.6,cos(uV*.019+s0*2.3));
      vec4 vp=viewMatrix*vec4(p,1.);float z=max(-vp.z,.1),s=mS.x*uPx*(1.+uGlial*.4),cc=coc(z)*1.2;gl_PointSize=clamp(s+cc,1.,110.);vB=cc/(s+cc);
      vec3 c=mS.y<.5?uSoma:mS.y<1.5?uMem*1.3:uSpark*.6;vC=c*(.6+.4*uGlial)*pow(s/(s+cc),1.6)*(.6+.4*sin(uV*.4+s0*3.));gl_Position=projectionMatrix*vp;}`,
    `varying vec3 vC;varying float vB;void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q);
      float a=mix(exp(-r*r*5.),smoothstep(1.,.82,r)*(.45+.55*smoothstep(.5,.96,r)),vB);gl_FragColor=vec4(vC*a,1.);}`,{uNet:{value:new THREE.Vector4(0,0,0,40)},uGlial:{value:0}});
  add(new THREE.Points(motes.geometry,moteMat),0);
  // ---- Signals: agents, their trails, injections, spikes' heads, synaptic sparks (CPU points) ---------------------------
  const fx=pointBuffersOf({fC:4,fS:2},512);
  const fxMat=glow(`${COMMON}attribute vec4 fC;attribute vec2 fS;varying vec4 vC;varying float vSh,vB;
    void main(){vec4 vp=viewMatrix*vec4(position,1.);float z=max(-vp.z,.1),s=fS.x*uPx,cc=coc(z)*(fS.y<7.5?.35:.8);
      gl_PointSize=clamp(s+cc,1.,180.);vB=cc/(s+cc);vC=vec4(fC.rgb*pow(s/(s+cc),1.4),fC.a);vSh=fS.y;gl_Position=projectionMatrix*vp;}`,
    `varying vec4 vC;varying float vSh,vB;
    float tri(vec2 p){const float k=1.7320508;p.x=abs(p.x)-.5;p.y=p.y+.5/k;if(p.x+k*p.y>0.)p=vec2(p.x-k*p.y,-k*p.x-p.y)/2.;p.x-=clamp(p.x,-1.,0.);return -length(p)*sign(p.y);}
    void main(){vec2 q=gl_PointCoord*2.-1.;q.y=-q.y;float r=length(q),a=0.,g=exp(-r*r*4.5)*.45;int sh=int(vSh+.5);
      if(sh==0){a=max(0.,1.-(abs(q.x)*7.+abs(q.y)*1.15))+max(0.,1.-(abs(q.y)*7.+abs(q.x)*1.15))+exp(-r*r*30.)*1.4;}
      else if(sh==1){a=exp(-pow((r-.5)*10.,2.))*1.5+exp(-r*r*45.)*.9;}
      else if(sh==2){float d=abs(q.x)+abs(q.y);a=exp(-pow((d-.55)*10.,2.))*1.4+exp(-d*d*35.);}
      else if(sh==3){float t=atan(q.y,q.x),k=pow(abs(cos(t*3.)),10.);a=exp(-r*(7.-6.*k))*1.5;}
      else if(sh==4){float d=tri(q*1.25);a=exp(-pow(d*14.,2.))*1.4+exp(-r*r*40.);}
      else if(sh==5){a=exp(-pow((r-.62)*12.,2.))*1.2+exp(-pow((r-.32)*12.,2.))*1.2+exp(-r*r*50.);}
      else if(sh==8){a=exp(-r*r*6.);g=0.;}
      else if(sh==9){a=max(0.,1.-(abs(q.x)*9.+abs(q.y)*1.3))+max(0.,1.-(abs(q.y)*9.+abs(q.x)*1.3))+exp(-r*r*22.)*1.6;g*=.6;}
      else{a=exp(-r*r*14.)*1.4;}
      a=mix(a+g,smoothstep(1.,.8,r)*.8,vB)*(1.-smoothstep(.92,1.,r));gl_FragColor=vec4(vC.rgb*a*vC.a,1.);}`);
  add(new THREE.Points(fx.geometry,fxMat),5);
  function instancedBuffersOf(base,layout){
    const g=new THREE.InstancedBufferGeometry();g.index=base.index;for(const [k,v] of Object.entries(base.attributes))g.setAttribute(k,v);
    const self={geometry:g,capacity:0,arrays:{},n:0};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(64,self.capacity);while(c<n)c*=2;
      for(const [name,size] of Object.entries(layout)){const arr=new Float32Array(c*size),old=self.arrays[name];if(old)arr.set(old.subarray(0,Math.min(old.length,arr.length)));
        self.arrays[name]=arr;g.deleteAttribute(name);const at=new THREE.InstancedBufferAttribute(arr,size);g.setAttribute(name,at);}
      self.capacity=c;};
    self.write=(name,i,...v)=>{const s=layout[name],a=self.arrays[name];for(let k=0;k<s;k++)a[i*s+k]=v[k]??0;};
    self.commit=n=>{g.instanceCount=n;self.n=n;for(const name of Object.keys(layout))g.attributes[name].needsUpdate=true;};
    // allocated at once, as pointBuffersOf is: a project without dependencies commits no axon (and has no buffer to update)
    self.ensure(64);self.dispose=()=>g.dispose();g.instanceCount=0;keep(self);return self;
  }
  function pointBuffersOf(layout,cap=64){
    const all={position:3,...layout},g=new THREE.BufferGeometry(),self={geometry:g,capacity:0,arrays:{},n:0};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(cap,self.capacity);while(c<n)c*=2;
      for(const [name,size] of Object.entries(all)){const arr=new Float32Array(c*size),old=self.arrays[name];if(old)arr.set(old.subarray(0,Math.min(old.length,arr.length)));
        self.arrays[name]=arr;g.deleteAttribute(name);const at=new THREE.BufferAttribute(arr,size);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,at);}
      self.capacity=c;};
    self.ensure(cap);g.setDrawRange(0,0);
    self.write=(name,i,...v)=>{if(i>=self.capacity)self.ensure(i+1);const s=all[name],a=self.arrays[name];for(let k=0;k<s;k++)a[i*s+k]=v[k]??0;};
    self.commit=n=>{g.setDrawRange(0,n);self.n=n;for(const name of Object.keys(all))g.attributes[name].needsUpdate=true;};
    self.dispose=()=>g.dispose();keep(self);return self;
  }
  // ---- The far network: dim, out-of-focus neurons around the project's own (atmosphere: it never stands for code) ------
  const GH=Math.round(34*GHOSTS),ghostCfg={...cfg,LEVELS:4,DENDRITE:cfg.DENDRITE*2.6,CURL:cfg.CURL+.15};
  const ghosts=Array.from({length:GH},(_,k)=>{const h=hash(`ghost/${seed}/${k}`),u=(1-2*(k+.5)/Math.max(1,GH))*.8,s=Math.sqrt(1-u*u),a=k*2.39996+rand(h)*.6;
    const id=`ghost/${seed}/${k}`,files=Array.from({length:3+Math.floor(rand(h+1)*3)},(_,j)=>`${id}/${j}`);
    return {id,ghost:true,dir:[Math.cos(a)*s,u*.5,Math.sin(a)*s],far:2.7+1.3*rand(h+2),seed:rand(h+3),files,R:(1.4+1.2*rand(h+4))*cfg.SOMA};});
  // ---- Structure: rebuilt when the network's membership or its axons change ------------------------------------------------
  const trees=new Map();
  const treeOf=(fileId,neuron,j,c=cfg)=>{const key=`${fileId}|${neuron}|${j}`;let t=trees.get(key);if(!t){t={dir:slotDirection(neuron,j,c.K),...dendriteTree(fileId,slotDirection(neuron,j,c.K),c)};
    const lv0=t.segs.filter(s=>s.level===0);t.entry=lv0[lv0.length-1].b;t.entryD=lv0[lv0.length-1].d1;t.syn=lv0[Math.min(lv0.length-1,1)].b;t.joints=jointsOf(t.segs);
    trees.set(key,t);if(trees.size>4096)trees.delete(trees.keys().next().value);}return t;};
  // A segment that continues the one before it (the tree lists a branch's segments in order, its first child next) shares
  // the tangent at their joint; an end that continues nothing is free (capped).
  function jointsOf(segs){const dir=s=>{const d=[s.b[0]-s.a[0],s.b[1]-s.a[1],s.b[2]-s.a[2]],l=Math.hypot(...d)||1;return d.map(x=>x/l);};
    const mean=(a,b)=>{const m=[a[0]+b[0],a[1]+b[1],a[2]+b[2]],l=Math.hypot(...m)||1;return m.map(x=>x/l);};
    return segs.map((s,k)=>{const d=dir(s),p=segs[k-1],n=segs[k+1],prev=p&&p.b===s.a,next=n&&n.a===s.b;
      return {tin:prev?mean(dir(p),d):d,tout:next?mean(d,dir(n)):d,capA:prev?0:1,capB:next?0:1};});}
  let net=null,built={key:'',cheap:''},neuronList=[],fileList=[],fileIdx=new Map(),neuronIdx=new Map(),axons=[],adjacency=[],realSegs=0,ghostSegs=0,realTips=0;
  function axonsOf(t){
    const pairs=new Map();
    for(const l of model.links.values()){if(!model.alive(l,t))continue;const a=net.fileNeuron.get(l.a),b=net.fileNeuron.get(l.b);if(!a||!b||a.neuron===b.neuron)continue;
      const key=`${a.neuron.id}>${l.b}`;let x=pairs.get(key);if(!x){x={key,src:a.neuron,dst:b.neuron,target:l.b,born:Infinity,removed:-Infinity,live:0};pairs.set(key,x);}
      x.born=Math.min(x.born,model.bornAt(l));if(l.removed===null)x.live++;else x.removed=Math.max(x.removed,l.removed);}
    return [...pairs.values()].sort((x,y)=>x.born-y.born||(x.key<y.key?-1:1)).slice(0,MAX_AXONS);
  }
  function structureKey(t){return net.neurons.map(n=>`${n.id}:${n.files.join('.')}`).join(',')+'|'+axonsOf(t).map(x=>x.key+(x.live?'':'~')).join(',');}
  function build(t){
    const epoch=model.epoch;neuronList=[...net.neurons,...ghosts];neuronIdx=new Map(neuronList.map((n,i)=>[n.id,i]));
    fileList=[];fileIdx=new Map();
    for(const n of net.neurons)n.files.forEach((f,j)=>{fileIdx.set(f,fileList.length);fileList.push({id:f,neuron:n,slot:n.slots[j],tree:treeOf(f,n.id,n.slots[j])});});
    const realFiles=fileList.length;
    for(const g of ghosts)g.files.forEach((f,j)=>{fileIdx.set(f,fileList.length);fileList.push({id:f,neuron:g,slot:j,ghost:true,tree:treeOf(f,g.id,j,{...ghostCfg,K:g.files.length})});});
    NS.ensure(neuronList.length);FS.ensure(fileList.length);U.uN.value=NS.texture;U.uF.value=FS.texture;
    let ns=0,nt=0;const count=(from,to)=>{for(let k=from;k<to;k++){ns+=fileList[k].tree.segs.length;nt+=fileList[k].tree.sites.length;}};
    count(0,realFiles);realSegs=ns;realTips=nt;count(realFiles,fileList.length);ghostSegs=ns-realSegs;
    dend.ensure(ns);tips.ensure(nt);let si=0,ti=0;
    fileList.forEach((f,fi)=>{const ni=neuronIdx.get(f.neuron.id),{segs,sites,dir,joints}=f.tree;
      segs.forEach((s,j)=>{const J=joints[j];dend.write('sA',si,...s.a,s.ra);dend.write('sB',si,...s.b,s.rb);dend.write('sI',si,ni,fi,s.d0,s.d1);dend.write('sD',si,...dir,s.level);
        dend.write('sT',si,...J.tin,J.capA);dend.write('sU',si,...J.tout,J.capB);si++;});
      sites.forEach((s,k)=>{tips.write('position',ti,0,0,0);tips.write('tI',ti,ni,fi,k,s.d);tips.write('tL',ti,...s.p,s.tip?1:0);tips.write('tD',ti,...dir,0);ti++;});});
    dend.commit(si);tips.commit(ti);
    // Axons: one per (neuron, imported file); tracts between two clusters share their bend, so they bundle.
    axons=axonsOf(t).map(x=>{const tf=fileList[fileIdx.get(x.target)],cross=x.src.cluster!==x.dst.cluster,h=hash(x.key),hb=hash(cross?[x.src.cluster,x.dst.cluster].sort().join('|'):x.key);
      const bend=cross?.2:.32,j=cross?.05:.12,c=[0,1,2,3].map(k=>(rand(hb+k)-.5)*2*bend*(.5+cfg.CURL)+(rand(h+k)-.5)*2*j);
      return {...x,si:neuronIdx.get(x.src.id),di:neuronIdx.get(x.dst.id),ti:fileIdx.get(x.target),c,cross,seed:rand(h),r:cross?.085:.06,S:cross?14:8,
        local:tf?[tf.tree.dir[0]*.85,tf.tree.dir[1]*.85,tf.tree.dir[2]*.85]:[0,0,0],syn:tf?tf.tree.syn:[0,0,0],bornS:secs(x.born,epoch),goneS:x.live?FAR:secs(x.removed,epoch)};});
    let n=0;for(const a of axons)n+=a.S;axon.ensure(n);let k=0;
    for(const a of axons){for(let s=0;s<a.S;s++){axon.write('xA',k,a.si,a.di,s/a.S,(s+1)/a.S);axon.write('xB',k,0,0,0,a.r);axon.write('xC',k,...a.c);axon.write('xD',k,a.bornS,a.goneS,a.seed,a.cross?1:0);k++;}}
    axon.commit(k);
    term.ensure(axons.length);axons.forEach((a,j)=>{term.write('xA',j,a.si,a.di,0,1);term.write('xB',j,0,0,0,a.r);term.write('xC',j,...a.c);term.write('xD',j,a.bornS,a.goneS,a.seed,a.cross?1:0);});
    term.commit(axons.length);
    U.uAxK.value=clamp(Math.sqrt(90/Math.max(1,axons.length)),.3,1);
    adjacency=neuronList.map(()=>[]);for(const a of axons){if(!adjacency[a.si].includes(a.di))adjacency[a.si].push(a.di);if(!adjacency[a.di].includes(a.si))adjacency[a.di].push(a.si);}
    soma.ensure(neuronList.length);neuronList.forEach((_,i)=>soma.write('sN',i,i));soma.commit(neuronList.length);
  }
  function rebuild(){built.cheap='';built.key='';}
  // The target of each axon (the synapse on the imported file's branch) moves with the soma it sits on: rewritten per frame.
  function placeSynapses(){let k=0;axons.forEach((a,j)=>{const R=somaR[a.di]||1,x=a.local[0]*R+a.syn[0],y=a.local[1]*R+a.syn[1],z=a.local[2]*R+a.syn[2];
    for(let s=0;s<a.S;s++){axon.write('xB',k,x,y,z,a.r);k++;}term.write('xB',j,x,y,z,a.r);});
    axon.geometry.attributes.xB.needsUpdate=true;term.geometry.attributes.xB.needsUpdate=true;}
  // ---- Per-frame state -------------------------------------------------------------------------------------------------
  let info={t:0,tsec:0,tview:0,overrides:{},agents:[]};
  let somaR=new Float32Array(0),npos=new Float32Array(0),nseed=new Float32Array(0);
  const waves=[],misfires=[],resyncs=[],storms=[],potentiations=[],expands=[];
  const push=(list,x,max=6)=>{list.push(x);if(list.length>max)list.shift();};
  const tempoOf=i=>Math.max(40,i.mood?.tempo||92);
  // JS twin of the shader's drift.
  const driftK=()=>clamp(num(mot.drift,.7),0,1.6)*clamp(info.overrides?.motion??1,0,2)*1.2;
  function neuronWorld(ni,out){const s=nseed[ni],tv=info.tview,k=U.uDrift.value;out[0]=npos[ni*3]+k*Math.sin(tv*.13+s*6.2832)*.55;out[1]=npos[ni*3+1]+k*Math.sin(tv*.097+s*12.1)*.4;out[2]=npos[ni*3+2]+k*Math.sin(tv*.111+s*3.7)*.55;return out;}
  const top2=()=>({t1:-Infinity,s1:0,c1:0,t2:-Infinity,s2:0,c2:0});
  const offer=(x,t,s,c,now)=>{if(!(t<=now)||!Number.isFinite(t))return;if(t>x.t1){x.t2=x.t1;x.s2=x.s1;x.c2=x.c1;x.t1=t;x.s1=s;x.c1=c;}else if(t>x.t2){x.t2=t;x.s2=s;x.c2=c;}};
  const seatOf=a=>presence(a.provider).seat%8;
  // What each agent is doing to which file now: pulses on the beat while a tool runs (and through the switch from the
  // previous one), the first at the moment the tool started.
  function agentInputs(i,beatMs){
    const out=new Map(),addIn=(f,t,s,c)=>{let l=out.get(f);if(!l)out.set(f,l=[]);l.push([t,s,c]);};
    const beats=(f,from,to,s,c,every)=>{if(!fileIdx.has(f))return;addIn(f,from,s,c);let k=Math.floor(to/beatMs);for(let n=0;n<3&&k*beatMs>=from;k--){if(k%every)continue;addIn(f,k*beatMs,s,c);n++;}};
    // after an attributed edit lands (the model's correlated cue), its seat keeps pulsing into that branch on the beat
    const dwell=DWELL*ctx.speed();for(const m of model.modules.values())if(Number.isInteger(m.agentVoice)&&m.lastAgent<=i.t&&i.t-m.lastAgent<dwell)beats(m.id,m.lastAgent,Math.min(i.t,m.lastAgent+dwell),1,m.agentVoice%8,1);
    for(const a of i.agents){const c=seatOf(a),kind=x=>STRONG.has(x)?[1,1]:LIGHT.has(x)?[.5,2]:[.75,1];
      if(a.display==='tool'&&a.fileId){const [s,e]=kind(a.activity);beats(a.fileId,i.t-a.since,i.t,s*a.alpha,c,e);}
      if(a.since<2500){const p=ctx.agents.presence(a.id,i.t-a.since-1);if(p&&p.display==='tool'&&p.fileId&&p.fileId!==a.fileId){const [s,e]=kind(p.activity);beats(p.fileId,i.t-a.since-p.since-1,i.t-a.since,s,c,e);}}}
    return out;
  }
  const near=(list,i,ms)=>list.filter(x=>x.at<=i.t&&i.t-x.at<ms*ctx.speed());
  const filesNeurons=ids=>{const out=new Set();for(const id of ids||[]){const f=net.fileNeuron.get(id),ni=f&&neuronIdx.get(f.neuron.id);if(ni!==undefined)out.add(ni);}return out;};
  // Hop distances through the axon graph (undirected) from a set of neurons; unreachable ones by distance.
  function hops(from){if(!from.size)return new Array(neuronList.length).fill(0);const d=new Array(neuronList.length).fill(-1),q=[...from];for(const n of from)d[n]=0;
    for(let h=0;h<q.length;h++){const n=q[h];for(const m of adjacency[n]||[])if(d[m]<0){d[m]=d[n]+1;q.push(m);}}
    let max=0;for(const x of d)max=Math.max(max,x);const c=[...from].map(n=>[npos[n*3],npos[n*3+1],npos[n*3+2]]),R=Math.max(12,net.radius);
    return d.map((x,n)=>x>=0?x:max+1+Math.round(Math.min(...c.map(p=>Math.hypot(npos[n*3]-p[0],npos[n*3+1]-p[1],npos[n*3+2]-p[2])))/R*3));}
  // Which verified milestones may storm: the first, then each at least STORM_GAP of performance time after the last
  // that did (a pure fold over the director's lasting record).
  function stormAllowed(at){const times=[];for(const l of ctx.director.lasting())for(const x of new Set([l.first,...(l.times||[])]))if(x<=at)times.push(x);
    times.sort((a,b)=>a-b);let last=-Infinity,ok=false;for(const x of times){const can=x-last>=STORM_GAP;if(can)last=x;if(x===at)ok=can;}return ok;}
  let stormNow=0,stressNow=0,flashNow=0,storming=null,lastStats={};
  function writeState(i){
    const t=i.t,ep=model.epoch,sp=ctx.speed(),S=ms=>secs(ms,ep),beatMs=60000/tempoOf(i),b=Math.floor(t/beatMs);
    const N=neuronList.length,F=fileList.length,real=net.neurons.length;
    if(somaR.length<N){somaR=new Float32Array(N*2);npos=new Float32Array(N*6);nseed=new Float32Array(N*2);}
    // Neuron positions (the layout at t; the far network around it) and soma sizes.
    const c=net.center,R=net.radius;
    neuronList.forEach((n,ni)=>{let p,r;if(n.ghost){p=[c[0]+n.dir[0]*R*n.far,c[1]+n.dir[1]*R*n.far,c[2]+n.dir[2]*R*n.far];r=n.R;nseed[ni]=n.seed;}
      else{const cur=net.neurons[ni]?.id===n.id?net.neurons[ni]:n;p=cur.pos;r=layout.somaRadius(model,cur,t);nseed[ni]=rand(hash(n.id));}npos[ni*3]=p[0];npos[ni*3+1]=p[1];npos[ni*3+2]=p[2];somaR[ni]=r;});
    // Activity per beat (spontaneous firing rises with recent work): one director query per beat of the window.
    const act=new Map(),actAt=k=>{let v=act.get(k);if(v===undefined){v=ctx.director.activityAt(k*beatMs);act.set(k,v);}return v;};
    const mu=i.music,energy=clamp(mu?mu.energy:i.energy||0),dyn=clamp(mu?.dynamics??.7),reactive=clamp(num(MU.reactivity,.6),0,1);
    const spontS=(.5+.35*energy*reactive+.15*dyn*reactive)*clamp(i.overrides.intensity??1,.3,1.4);
    // Files: inputs, conditions, growth.
    const inputs=agentInputs(i,beatMs),fileFire=new Array(F),fileSym=new Float32Array(F),fileValid=new Float32Array(F);
    const stressN=new Float32Array(N);
    for(let fi=0;fi<F;fi++){const f=fileList[fi];
      if(f.ghost){FS.set(fi,0,NONE,0,0,NONE);FS.set(fi,1,0,0,NONE,0);FS.set(fi,2,NONE,FAR,1,f.tree.reach);FS.set(fi,3,NONE,0,4,0);FS.set(fi,4,NONE,0,0,0);fileFire[fi]=null;continue;}
      const m=model.modules.get(f.id),x=top2();
      for(const [tt,s,cc] of inputs.get(f.id)||[])offer(x,tt,s,cc,t);
      if(Number.isFinite(m.lastAgent)&&Number.isInteger(m.agentVoice))offer(x,m.lastAgent,1,m.agentVoice%8,t);
      offer(x,m.lastHuman,.8,C_HUMAN,t);offer(x,model.bornAt(m),.9,C_GROW,t);
      let latest=-Infinity,nsym=0;for(const id of m.symbols){const s=model.symbols.get(id);if(!s)continue;const bs=model.bornAt(s);if(model.alive(s,t)&&s.removed===null)nsym++;if(bs<=t&&bs>latest&&bs>model.bornAt(m)+1)latest=bs;if(s.weldAt<=t&&s.weldAt>latest)latest=s.weldAt;}
      offer(x,latest,.55,C_GROW,t);
      // material state: stressed (eased in), relaxing after a change away from it; validated leaves a calm sheen
      let cur=m.initial,prev=m.initial,at=-Infinity;for(const e of m.states){if(e.at>t)break;prev=cur;cur=e.state;at=e.at;}
      const since=(t-at)/sp;const stress=cur==='stressed'?smooth(since/1500):prev==='stressed'?1-smooth(since/4000):0;
      const valid=cur==='validated'?.35+.65*Math.exp(-since/9000):0;
      const ni=neuronIdx.get(f.neuron.id);stressN[ni]=Math.max(stressN[ni],stress);
      let tw=-Infinity;for(const w of near(waves,i,9000))if(w.files.has(f.id)){const o=w.order.get(f.id)??0;tw=Math.max(tw,w.at+o*sp);}
      // growth: the branch reaches as far as its symbols (eased in at birth, folding back when removed)
      const life=model.alive(m,t)?smooth((t-model.bornAt(m))/(2600*sp)):0,Gt=(.58+.42*clamp(Math.log2(1+nsym)/4))*life;
      FS.set(fi,0,S(x.t1),x.s1,x.c1,S(x.t2));FS.set(fi,1,x.s2,x.c2,S(tw),stress);FS.set(fi,2,S(model.bornAt(m)),m.removed===null?FAR:S(m.removed),Gt,f.tree.reach);
      fileSym[fi]=nsym;fileValid[fi]=valid;fileFire[fi]={x,travel:f.tree.reach/VD*1000*sp,ni,tw};
      const touch=Number.isFinite(m.lastAgent)&&m.lastAgent<=t&&Number.isInteger(m.agentVoice);FS.set(fi,4,touch?S(m.lastAgent):NONE,touch?m.agentVoice%8:0,touch?1:0,0);}
    // Neurons: spontaneous firing, driven firings, waves, resynchronisation, storms, misfires.
    const fires=neuronList.map(()=>top2()),glowN=new Float32Array(N),potN=new Float32Array(N);
    neuronList.forEach((n,ni)=>{const h=hash(n.id),pn=RATE*clamp(.95/Math.sqrt(real+4),.02,.14)*(.6+.8*rand(h+5))*(n.ghost?.5:1);
      const [k1,k2]=spontaneous(h,b,k=>pn*(n.ghost?1:1+1.4*actAt(k)),64),jit=k=>(1-SYNC)*rand((h^Math.imul(k|0,0x85ebca6b))>>>0)*beatMs*.5;
      for(const k of [k1,k2])if(k!==null)offer(fires[ni],k*beatMs-jit(k),spontS*(n.ghost?.7:1),C_SPONT,t);});
    for(let fi=0;fi<F;fi++){const q=fileFire[fi];if(!q)continue;const {x,travel,ni,tw}=q;
      if(x.t1>-Infinity)offer(fires[ni],x.t1+travel,Math.max(.5,x.s1),x.c1,t);if(x.t2>-Infinity)offer(fires[ni],x.t2+travel,Math.max(.5,x.s2),x.c2,t);
      if(tw>-Infinity)offer(fires[ni],tw+travel*.4,.85,C_VALID,t);}
    for(const r of near(resyncs,i,8000)){const k0=Math.floor(r.at/beatMs);for(const ni of filesNeurons(r.files))for(let k=1;k<=3;k++)offer(fires[ni],(k0+k)*beatMs,1.05,C_VALID,t);}
    for(const m of near(misfires,i,4000)){for(const ni of filesNeurons(m.files)){const h=hash(`${m.at}/${ni}`);for(let k=0;k<14;k++){const tt=m.at+(k*.19+rand(h+k)*.12)*1000*sp;offer(fires[ni],tt,-.9,C_MIS,t);}}}
    // lingering strain: off-beat abortive firings while stressed
    for(let ni=0;ni<real;ni++)if(stressN[ni]>.05){const h=hash(`mis/${neuronList[ni].id}`),step=beatMs*.37,k=Math.floor(t/step);
      for(let j=0;j<6;j++){const kk=k-j;if(rand((h^Math.imul(kk|0,0x27d4eb2d))>>>0)<.45*stressN[ni]){offer(fires[ni],kk*step+rand(h+kk)*step*.8,-.7*stressN[ni],C_MIS,t);}}}
    stormNow=0;storming=null;
    for(const s of near(storms,i,16000)){const from=filesNeurons(s.files);if(!from.size)for(let ni=0;ni<real;ni++)if(neuronList[ni].k===0)from.add(ni);
      const d=hops(from),hopMs=(s.full?240:200)*sp,vol=s.grand?4:s.full?3:2,gap=beatMs*2;
      for(let ni=0;ni<N;ni++){if(!s.full&&d[ni]>1)continue;if(neuronList[ni].ghost&&!s.full)continue;const h=hash(`${s.at}/${ni}`);
        for(let v=0;v<vol;v++){const tt=s.at+d[ni]*hopMs+v*gap+rand(h+v)*90*sp;offer(fires[ni],tt,s.full?1.45:1.1,C_STORM,t);const a=(t-tt)/1000/sp;if(a>=0)glowN[ni]+=Math.exp(-a*1.7)*(s.full?.55:.35);}}
      const a=(t-s.at)/1000/sp;if(s.full&&a>=0){stormNow=Math.max(stormNow,smooth(a/.8)*(1-smooth((a-7)/4)));storming=s;}}
    for(const p of near(potentiations,i,8000)){const from=filesNeurons(p.files),a=(t-p.at)/1000/sp;for(const ni of from){potN[ni]+=Math.exp(-a*.7)*smooth(a/.5)*p.s;offer(fires[ni],p.at+300*sp,.7,C_GROW,t);}}
    // inhibition: the neighbourhood of a struggling neuron dims
    const inhib=new Float32Array(N),stressed=[];for(let ni=0;ni<real;ni++)if(stressN[ni]>.05)stressed.push(ni);stressNow=stressed.length?clamp(stressed.length/Math.max(3,real*.3)):0;
    if(stressed.length)for(let ni=0;ni<N;ni++){if(stressN[ni]>.05)continue;let v=0;for(const s of stressed){const d=Math.hypot(npos[ni*3]-npos[s*3],npos[ni*3+1]-npos[s*3+1],npos[ni*3+2]-npos[s*3+2]);v=Math.max(v,stressN[s]*Math.exp(-d/18));}inhib[ni]=v*.75;}
    // lasting: myelin on the clusters that earned verified milestones
    const myelin=myelinOf(i);
    neuronList.forEach((n,ni)=>{const x=fires[ni];
      const life=n.ghost?1:clamp(n.files.reduce((m,id)=>{const mm=model.modules.get(id);return Math.max(m,mm?smooth((t-model.bornAt(mm))/(1800*sp))*(model.alive(mm,t)?1:0):0);},0));
      NS.set(ni,0,npos[ni*3],npos[ni*3+1],npos[ni*3+2],somaR[ni]);NS.set(ni,1,S(x.t1),x.s1,x.c1,S(x.t2));NS.set(ni,2,x.s2,x.c2,inhib[ni],Math.min(1.4,glowN[ni]));
      NS.set(ni,3,life,n.ghost?.34+.3*(i.unlocks[3]?.level||0):1,nseed[ni],n.ghost?0:myelin.get(n.cluster)||0);NS.set(ni,4,stressN[ni],Math.min(1,potN[ni]),LIFE?lifeGlow[ni]||0:0,0);});
    // Axons: spikes' heads, synaptic sparks; the imported branch feels the synapse.
    const syn=new Map();let fxn=0;const pa=[0,0,0],pb=[0,0,0];
    for(const a of axons){const L=Math.max(1e-3,dist3(neuronWorld(a.si,pa),endOf(a,pb))),Ls=L*1.12,x=fires[a.si];
      for(const [tf,s,cc] of [[x.t1,x.s1,x.c1],[x.t2,x.s2,x.c2]]){if(!(tf>-Infinity))continue;const ag=(t-tf)/1000/sp,fr=VA*ag/Ls;if(ag<0)continue;
        const col=COLS[cc]||COLS[C_SPONT],k=Math.abs(s);
        if(fr<1&&(s>0||fr<.5)){const p=curve(a,fr);fxn=fxPoint(fxn,p,col,k*(s<0?.5:1)*(1-(s<0?smooth((fr-.25)/.25):0))*1.3,5.5,8);}
        else if(fr>=1&&s>0){const aa=(ag-Ls/VA);if(aa<.7){const p=curve(a,1),f=1-aa/.7;fxn=fxPoint(fxn,p,COLS[C_STORM],k*f*f*1.6,16*f+4,9);}
          const at=tf+Ls/VA*1000*sp,prev=syn.get(a.ti);if(!prev||prev[0]<at)syn.set(a.ti,[at,Math.min(1,k)]);}}}
    for(let fi=0;fi<F;fi++){if(fileList[fi].ghost)continue;const x=syn.get(fi);FS.set(fi,3,x?S(x[0]):NONE,x?x[1]:0,fileSym[fi],fileValid[fi]);}
    NS.commit();FS.commit();lastStats={fires:fires.filter(x=>x.t1>-Infinity).length};if(LIFE)firesNow=fires;
    return fxn;
  }
  const dist3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  // An axon's synapse in world space, and its curve (the shader's, in JS).
  function endOf(a,out){neuronWorld(a.di,out);const R=somaR[a.di]||1;out[0]+=a.local[0]*R+a.syn[0];out[1]+=a.local[1]*R+a.syn[1];out[2]+=a.local[2]*R+a.syn[2];return out;}
  const cs=[0,0,0],ce=[0,0,0];
  function curve(a,u){neuronWorld(a.si,cs);endOf(a,ce);const ch=[ce[0]-cs[0],ce[1]-cs[1],ce[2]-cs[2]],L=Math.max(1e-3,Math.hypot(...ch)),d=[ch[0]/L,ch[1]/L,ch[2]/L];
    const R=somaR[a.si]||1,p0=[cs[0]+d[0]*R*.9,cs[1]+d[1]*R*.9,cs[2]+d[2]*R*.9],up=Math.abs(d[1])<.9?[0,1,0]:[1,0,0];
    let n1=[up[1]*d[2]-up[2]*d[1],up[2]*d[0]-up[0]*d[2],up[0]*d[1]-up[1]*d[0]];const l1=Math.hypot(...n1)||1;n1=n1.map(v=>v/l1);const n2=[d[1]*n1[2]-d[2]*n1[1],d[2]*n1[0]-d[0]*n1[2],d[0]*n1[1]-d[1]*n1[0]];
    const c=a.c,p1=[0,1,2].map(k=>p0[k]+ch[k]*.33+(n1[k]*c[0]+n2[k]*c[1])*L),p2=[0,1,2].map(k=>p0[k]+ch[k]*.67+(n1[k]*c[2]+n2[k]*c[3])*L),v=1-u;
    return [0,1,2].map(k=>v*v*v*p0[k]+3*v*v*u*p1[k]+3*v*u*u*p2[k]+u*u*u*ce[k]);}
  let fxCount=0;
  function fxPoint(n,p,c,k,size,shape){if(n>=MAX_FX||k<=.003)return n;fx.write('position',n,p[0],p[1],p[2]);fx.write('fC',n,(c.x??c.r)*k,(c.y??c.g)*k,(c.z??c.b)*k,1);fx.write('fS',n,size,shape);return n+1;}
  let mySig='',myMap=new Map();
  function myelinOf(i){const all=ctx.director.lasting();let sig=`${model.version}|${net.neurons.length}`;for(const l of all)if(l.first<=i.t)sig+=`|${l.first}:${l.count}`;
    if(sig===mySig)return myMap;mySig=sig;myMap=new Map();
    for(const l of all){if(l.first>i.t)continue;const s=l.subject||{},ids=s.fileIds||(s.fileId?[s.fileId]:[]);const cl=new Set();if(s.groupId)cl.add(s.groupId);
      for(const id of ids){const f=net.fileNeuron.get(id);if(f)cl.add(f.neuron.cluster);}
      for(const c of cl)myMap.set(c,Math.min(1,(myMap.get(c)||0)+.45+.15*Math.min(4,(l.count||1)-1)));}
    return myMap;}
  // ---- Agents: travelling signals (positions are pure functions of the observed lifecycle and time) -------------------------
  const agentState=new Map();
  function siteOf(fileId,out){const fi=fileIdx.get(fileId);if(fi===undefined)return null;const f=fileList[fi],ni=neuronIdx.get(f.neuron.id);neuronWorld(ni,out);
    const R=somaR[ni]||1,e=f.tree.entry,d=f.tree.dir;out[0]+=d[0]*R*.85+e[0];out[1]+=d[1]*R*.85+e[1];out[2]+=d[2]*R*.85+e[2];return out;}
  // The file an agent works on at t: the tool's file while one runs, otherwise the file its last attributed edit landed on
  // (the model's correlated cue) for DWELL after it. Edits are found per CAST seat, newest first, once per frame.
  let editsT=null;const edits=new Map();
  function editsOf(voice){if(editsT!==info.t){edits.clear();editsT=info.t;}let l=edits.get(voice);
    if(!l){l=[...model.modules.values()].filter(m=>m.agentVoice===voice&&Number.isFinite(m.lastAgent)&&fileIdx.has(m.id)).sort((a,b)=>b.lastAgent-a.lastAgent).slice(0,4);edits.set(voice,l);}return l;}
  const lastEdit=(p,t)=>{for(const m of editsOf(p.voice))if(m.lastAgent<=t)return m;return null;};
  function workOf(p,t){if(p.display==='tool'&&p.fileId&&fileIdx.has(p.fileId))return p.fileId;const m=lastEdit(p,t);return m&&t-m.lastAgent<DWELL*ctx.speed()?m.id:null;}
  function goalOf(p,tv,out,t){
    const w=workOf(p,t);if(w&&siteOf(w,out)){const d=fileList[fileIdx.get(w)].tree.dir;out[0]+=d[0]*1.1;out[1]+=d[1]*1.1+.6;out[2]+=d[2]*1.1;return out;}
    const ph=rand(hash(p.id))*TAU,home=p.home?fileIdx.get(p.home):undefined;
    if(home!==undefined){const ni=neuronIdx.get(fileList[home].neuron.id);neuronWorld(ni,out);const waiting=p.display==='waiting'||p.display==='dormant'||p.display==='connected';
      const r=waiting?(somaR[ni]||1)*3+7:(somaR[ni]||1)*2.6+3.5,w=p.busy?.32:.07;out[0]+=Math.cos(ph+tv*w)*r;out[1]+=2+Math.sin(tv*.4+ph)*.8;out[2]+=Math.sin(ph+tv*w)*r;return out;}
    const r=Math.max(10,net.radius)*.55;out[0]=net.center[0]+Math.cos(ph+tv*.05)*r;out[1]=net.center[1]+4;out[2]=net.center[2]+Math.sin(ph+tv*.05)*r;return out;}
  const ga=[0,0,0],gb=[0,0,0];
  // From the goal before the latest change (a state, an edit landing, its dwell ending) to this one over 1.8 s, along a
  // lifted arc: a signal travelling the network.
  function agentAt(id,t,tv,out){const a=ctx.agents.presence(id,t);if(!a)return null;goalOf(a,tv,out,t);
    const sp=ctx.speed(),m=lastEdit(a,t);let tc=t-a.since;if(m){tc=Math.max(tc,m.lastAgent);if(m.lastAgent+DWELL*sp<=t)tc=Math.max(tc,m.lastAgent+DWELL*sp);}
    if(t-tc<1800*sp){const prev=ctx.agents.presence(id,tc-1);if(prev){const k=smooth((t-tc)/(1800*sp));goalOf(prev,tv,ga,tc-1);const lift=Math.sin(k*Math.PI)*Math.min(14,dist3(ga,out)*.3);
      for(let c=0;c<3;c++)out[c]=lerp(ga[c],out[c],k);out[1]+=lift;}}
    return a;}
  function updateAgents(i,n){
const sp=ctx.speed(),trailK=clamp(num(G.agents?.trail,1),.2,2.2),prom=clamp(num(G.agentProminence,.8),.3,1);const seen=new Set(),head=[0,0,0],q=[0,0,0],site=[0,0,0];
    for(const a of i.agents.slice(0,12)){if(!agentAt(a.id,i.t,i.tview,head))continue;seen.add(a.id);let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3()};agentState.set(a.id,st);}st.pos.set(...head);
      const seat=seatOf(a),c=agentCol[seat],alpha=a.alpha*(a.busy?1:.65)*prom,sub=a.subagent?.75:1;
      // the trail: where the signal was (sampled from its pure path)
      for(let k=22;k>=1;k--){const tt=i.t-k*60*sp*trailK;if(!agentAt(a.id,tt,i.tview-k*.06*trailK,q))continue;const f=1-k/23;n=fxPoint(n,q,c,alpha*f*f*1.1,(3+8*f)*sub,8);}
      n=fxPoint(n,head,c,alpha*.5,90*sub,8);n=fxPoint(n,head,c,alpha*1.6,46*sub,seat<6?seat:6);n=fxPoint(n,head,{r:1,g:1,b:1},alpha,8*sub,8);
      // injection: particles from the signal into the branch it edits (from the branch while it reads)
      const work=workOf(a,i.t);if(work&&siteOf(work,site)){const inward=!(a.display==='tool'&&LIGHT.has(a.activity));
        for(let k=0;k<10;k++){let f=(i.tview*1.1+k/10)%1;if(!inward)f=1-f;for(let c2=0;c2<3;c2++)q[c2]=lerp(head[c2],site[c2],f);q[1]+=Math.sin(f*Math.PI)*.6;
          n=fxPoint(n,q,c,alpha*Math.sin(f*Math.PI)*1.1,4.5,8);}
        n=fxPoint(n,site,c,alpha*(.6+.4*Math.pow(1-((i.t/(60000/tempoOf(i)))%1),3)),14,9);}}
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
    return n;
  }
  // ---- Effects: recorded intents only -----------------------------------------------------------------------------------
  function effect(cmd,i){
    if(i)info=i;const s=clamp(cmd.scale,0,1.6),subj=cmd.subject||{},at=Number.isFinite(cmd.at)?cmd.at:info.t;if(s<=0)return;
    const files=new Set(subj.fileIds||(subj.fileId?[subj.fileId]:[]));
    switch(cmd.effect){
      case 'activation-wave':{// a sweep across the covered branches, ordered along a direction seeded by the run
        const h=rand(hash(String(cmd.id??at)))*TAU,dir=[Math.cos(h),.25,Math.sin(h)],order=new Map();const proj=[];
        if(net)for(const id of files){const f=net.fileNeuron.get(id);if(f)proj.push([id,f.neuron.pos[0]*dir[0]+f.neuron.pos[1]*dir[1]+f.neuron.pos[2]*dir[2]]);}
        const min=Math.min(0,...proj.map(x=>x[1]));for(const [id,p] of proj)order.set(id,(p-min)/(14*COND)*1000);
        push(waves,{at,files,order,s});break;}
      case 'misfire':push(misfires,{at,files,s});break;
      case 'resync':push(resyncs,{at,files,s});break;
      case 'storm':case 'consolidate':{const full=cmd.tier>=3&&stormAllowed(cmd.at);push(storms,{at,files,s,full,grand:full&&cmd.tier>=4,refactor:cmd.effect==='consolidate'},4);break;}
      case 'potentiate':push(potentiations,{at,files,s});break;
      case 'expand':push(expands,{at,s});break;
      default:break;// growth (neurogenesis, sprout, arborize, prune, axon-link) is drawn from the model's own times
    }
  }
  // ---- Digital life: the network's glia and vesicles (life/synaptic.js; only when the recipe has life on) ------------
  // The ecosystem lives in the network's own frame (world units, scaled by frameScale for a network larger than the
  // ecosystem's bounds): drawn at eco / frameScale(the network's radius), carried by the drift of the neurons they live
  // beside (each inhabitant takes the drift of the somas within reach, weighted by nearness: continuous as it moves).
  // Presentation only reads the ecosystem and the world's own state:
  //  glia       astrocytes: billboarded glass cells, a small bright-rimmed body and six fine processes that flex slowly,
  //             those facing the synapse it works beside reaching farther and ending in an endfoot; far away a soft
  //             star of light. When its neuron fires, a calcium wave crosses the glia around it: they light up in the
  //             firing's colour as the wave passes them (outward from the soma, a few units a second);
  //  vesicles   tiny glass bubbles (a membrane rim, a golden core) and, at the best qualities, a follower or two on
  //             their own recorded path; a fed vesicle leaving a neuron draws a fading tail (the influence it carries);
  //  microglia  pale amoeboid cells, their pseudopods along their motion, granules inside, holding at the edge of an
  //             inhibited region.
  // The world answers its inhabitants: a neuron's membrane and the clefts of its synapses brighten a little with the
  // inhabitants gathered there (the site's visits). Everything is scaled by the view's fade (restores, generations).
  // Two draw calls (cells, points), additive like the rest of the network.
  let lifeUpdate=()=>{},lifeHide=()=>{},lifeStatsNow={drawn:0,followers:0,tails:0,drawCalls:0},firesNow=null,lifeGlow=new Float32Array(0);
  // The life gathered at each neuron (its site's visits, all species), before the state is written: the neurons answer.
  function lifeGlowAt(i){const v=i.life,eco=v&&v.eco;if(lifeGlow.length<neuronList.length)lifeGlow=new Float32Array(neuronList.length*2);lifeGlow.fill(0);
    if(!eco||v.restoring)return;const S=eco.sites;for(let s=0;s<S.count;s++){const ni=neuronIdx.get(S.ids[s]);if(ni!==undefined)lifeGlow[ni]=Math.min(1,S.visits[s]/16)*v.fadeIn;}}
  function lifeStats(){return {...lifeStatsNow};}
  function onLifeParams(){}
  if(LIFE){
    const grammar=createSynapticGrammar({layout});LIFE.create(grammar);
    const CAP=grammar.capacity,anchors=createAnchors(),MODE_ORBIT=LIFE_MODE.orbit,MODE_REST=LIFE_MODE.rest;
    // per quality (0 best .. 3 none): vesicle followers, tail points of a fed vesicle
    const VFOL=[2,1,1,0],TAIL=[5,4,3,0];
    const cells=instancedBuffersOf(sq,{cP:4,cA:4,cC:4,cS:4});cells.ensure(CAP);
    const dots=pointBuffersOf({pC:4,pS:2},CAP*4);
    const cellMat=glow(`${COMMON}attribute vec4 cP,cA,cC,cS;varying vec2 vQ;varying vec3 vC,vCal;varying float vBl,vPx,vE,vSd,vSh,vTh;
      void main(){
        vec4 vc=viewMatrix*vec4(cP.xyz,1.);float z=max(-vc.z,.1),k=ppu(z),R=cP.w,cc=coc(z),cw=cc/k;
        float H=min(R+cw,260.*uPx/k);vc.xy+=position.xy*H;vQ=position.xy*H/R;vPx=R*k;vBl=cc/(R*k+cc);
        vec3 dv=mat3(viewMatrix)*cA.xyz;vTh=atan(dv.y,dv.x);
        vC=cC.rgb;vCal=cS.yzw;vSd=cS.x;vSh=cA.w;vE=cC.w*nearFade(z)*pow(R*k/(R*k+cc),1.5);
        gl_Position=projectionMatrix*vc;}`,
      `uniform float uV,uQ;uniform vec3 uHi,uSpark;varying vec2 vQ;varying vec3 vC,vCal;varying float vBl,vPx,vE,vSd,vSh,vTh;${FRAG_NOISE}
      const float PI=3.14159265;
      // a fine process leaving the body at angle a, curving by \`bend\` toward its tip at length L, tapering
      float proc(float r,float th,float a,float L,float w0,float bend){float t=r/L;if(t>1.)return 0.;
        float d=th-a-bend*t*t;d=mod(d+PI,2.*PI)-PI;if(abs(d)>1.4)return 0.;float w=w0*(1.-.8*t)+.012;float e=r*sin(abs(d));
        return exp(-e*e/(w*w))*smoothstep(1.,.55,t)*smoothstep(.05,.16,r)*(1.-.45*t);}
      // a process and the branch it forks into part way out (the fork only near its process: most pixels skip it)
      float branch(vec2 q,float r,float th,float a,float L,float w0,float bend,float side,float at){
        float d=th-a;d=mod(d+PI,2.*PI)-PI;if(abs(d)>1.1||r>L*1.05)return 0.;float p=proc(r,th,a,L,w0,bend);
        float fa=a+bend*at*at,fx=cos(fa)*L*at,fy=sin(fa)*L*at;vec2 o=q-vec2(fx,fy);return p+.7*proc(length(o),atan(o.y,o.x),fa+.55*side,L*(1.-at)*.85,w0*.6,.35*side);}
      void main(){vec2 q=vQ;float r=length(q);if(r>1.12)discard;float th=atan(q.y,q.x),b=vBl,s=vSd*40.,det=smoothstep(3.,18.,vPx)*(1.-b);vec3 c;
        if(vSh<.5){// an astrocyte: a small glassy body, nine fine branching processes, beaded and dissolving into a fine
          // spongy fuzz at their ends; those toward its synapse reach farther, ending in endfeet
          float body=exp(-r*r*120.)*.5+exp(-pow((r-.08)*38.,2.))*.3,halo=exp(-r*r*5.)*.08,pr=0.,foot=0.;
          if(det>.01){for(int k=0;k<9;k++){float fk=float(k),h=fract(sin(fk*12.99+s)*437.58),a=s+fk*.6981+.4*(h-.5)+.16*sin(uV*.19+fk*1.9+s),bd=.28*sin(s*3.1+fk*2.3);
              float tw=max(0.,cos(a-vTh)),L=.32+.38*h+.3*tw;
              float p=branch(q,r,th,a,L,.038,bd,h>.5?1.:-1.,.3+.2*h)+.6*proc(r,th,a+.3*(h-.5),L*.55,.022,-bd);
              pr+=p*(.55+.45*h)*(.55+.45*vn(vec2(r*16.,fk*3.7+s)));
              float ta=a+bd;vec2 tp=vec2(cos(ta),sin(ta))*L*.92;foot+=tw*tw*tw*exp(-dot(q-tp,q-tp)*1400.);}
            pr+=web(q*6.5+s)*smoothstep(.8,.15,r)*.22*smoothstep(.0,.25,pr+.05);}
          float far=exp(-r*r*9.)*.35+exp(-r*r*60.)*.35;
          c=vC*mix(far,body+halo+pr*.8+foot*.6,det)+vCal*mix(far*1.4,pr*1.2+body+halo*2.+foot*1.4,det);}
        else{// a microglial cell: a small elongated body and fine wandering processes (ramified, surveying); activated at a
          // disturbance it rounds up and draws its processes in
          float act=clamp(vSh-1.,0.,1.),a=th-vTh,cs=cos(vTh),sn=sin(vTh);vec2 u=vec2(q.x*cs+q.y*sn,-q.x*sn+q.y*cs);
          float ex=mix(.17,.24,act),ey=mix(.09,.21,act),edge=1.+.12*act*sin(3.*th+s+uV*.4),bd=length(u/vec2(ex,ey))/edge;
          float body=exp(-bd*bd*1.6)*.6+exp(-pow((bd-.9)*5.,2.))*.25*act,pr=0.;
          if(det>.01)for(int k=0;k<5;k++){float fk=float(k),h=fract(sin(fk*7.31+s)*913.7),pa=vTh+(k<2?fk*PI:fk*1.3+h)+.3*sin(uV*.27+fk*2.1+s);
            pr+=branch(q,r,th,pa,(.45+.4*h)*(1.-.75*act),.035,1.1*(h-.5),h>.5?1.:-1.,.35+.3*h);}
          float far=exp(-r*r*12.)*.4;
          c=vC*mix(far,body+pr*.8,det)+vCal*mix(far,body*.8+pr,det);}
        gl_FragColor=vec4(c*vE,1.);}`);
    add(new THREE.Mesh(cells.geometry,cellMat),3);
    const dotMat=glow(`${COMMON}attribute vec4 pC;attribute vec2 pS;varying vec3 vC;varying float vB,vPx,vRim;
      void main(){vec4 vp=viewMatrix*vec4(position,1.);float z=max(-vp.z,.1),s=pS.x*ppu(z)*2.,cc=coc(z);
        gl_PointSize=clamp(max(s,1.5*uPx)+cc,1.,80.);vB=cc/(s+cc);vPx=s;vRim=pS.y;vC=pC.rgb*pC.a*nearFade(z)*pow(max(s,1.5*uPx)/(max(s,1.5*uPx)+cc),1.4);
        gl_Position=projectionMatrix*vp;}`,
      `uniform vec3 uMem,uHi;varying vec3 vC;varying float vB,vPx,vRim;void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q);if(r>1.)discard;
        float det=smoothstep(4.,12.,vPx)*(1.-vB);
        // a glass bubble up close: a membrane rim, a golden core, a highlight; far away a soft point
        vec2 hl=q-vec2(-.3,.32);float glass=exp(-pow((r-.78)*7.,2.))*vRim,core=exp(-r*r*9.),spec=exp(-dot(hl,hl)*40.);
        vec3 c=mix(vC*(exp(-r*r*5.)*1.2),uMem*glass*length(vC)*.9+vC*core*.8+uHi*spec*.35*length(vC),det);
        gl_FragColor=vec4(mix(c,vC*smoothstep(1.,.75,r)*.5,vB),1.);}`);
    add(new THREE.Points(dots.geometry,dotMat),4);
    const CAL=pal.accent.clone().lerp(pal.primary,.4).multiplyScalar(1.2),vPal=[pal.secondary.clone().lerp(pal.highlight,.12),pal.accent.clone().lerp(pal.primary,.25),pal.highlight.clone().lerp(pal.secondary,.55).lerp(pal.primary,.12)];
    const P3=[0,0,0],P4=[0,0,0],A3=[0,0,0],D3=[0,0,0],sNi=new Int32Array(64),sDr=new Float32Array(64*3),sW=new Float32Array(64),wv=[0,0,0];
    // the drift of the neurons an inhabitant lives beside (eco position e, world units): weighted by nearness
    function driftAt(eco,ex,ey,ez,k,out){const S=eco.sites,n=S.count;let w=0;out[0]=out[1]=out[2]=0;
      for(let s=0;s<n;s++){if(sNi[s]<0)continue;const dx=ex-S.x[s],dy=ey-S.y[s],dz=ez-S.z[s],R=S.r[s]*3,d2=dx*dx+dy*dy+dz*dz;if(d2>=R*R)continue;
        const u=1-Math.sqrt(d2)/R,ws=u*u*(3-2*u);out[0]+=sDr[s*3]*ws;out[1]+=sDr[s*3+1]*ws;out[2]+=sDr[s*3+2]*ws;w+=ws;}
      if(w>1){out[0]/=w;out[1]/=w;out[2]/=w;}return out;}
    lifeHide=()=>{cells.commit(0);dots.commit(0);lifeStatsNow={drawn:0,followers:0,tails:0,drawCalls:2};};
    lifeUpdate=i=>{
      const v=i.life,eco=v&&v.eco;if(!eco||v.restoring||!net)return lifeHide();
      const k=frameScale(net.radius),ik=1/k,q=Math.min(3,Math.max(0,i.quality|0)),alpha=v.alpha,tv=i.tview,sp=ctx.speed(),t=i.t,S=eco.sites,nS=S.count,seed=eco.seed;
      const M=musicLook(eco,v),MB=M.bright,MS=M.size,MT=M.trail;
      // each site's neuron, its drift (the world's own) and how many gather there
      for(let s=0;s<nS;s++){const ni=neuronIdx.get(S.ids[s]);sNi[s]=ni===undefined?-1:ni;if(ni===undefined)continue;neuronWorld(ni,wv);
        sDr[s*3]=wv[0]-npos[ni*3];sDr[s*3+1]=wv[1]-npos[ni*3+1];sDr[s*3+2]=wv[2]-npos[ni*3+2];sW[s]=Math.min(1,S.visits[s]/14);}
      // a firing's calcium wave at distance d from the soma of neuron ni (gold into out, whatever caused the firing:
      // ambient life never takes an agent's colour; its strength returned)
      const wave=(ni,d,out)=>{const x=firesNow?.[ni];out[0]=out[1]=out[2]=0;if(!x)return 0;let e=0;
        for(const [tf,s0] of [[x.t1,x.s1,x.c1],[x.t2,x.s2,x.c2]]){if(!(tf>-Infinity)||s0<=0)continue;const ag=(t-tf)/1000/sp;if(ag<0||ag>6)continue;
          const f=Math.min(1,s0)*Math.min(1,s0)*Math.exp(-Math.pow((ag*3.2-d)/1.1,2))*Math.exp(-ag*.8);if(f<.01)continue;e+=f;}
        e=Math.min(1.5,e);out[0]=CAL.r*e;out[1]=CAL.g*e;out[2]=CAL.b*e;return e;};
      let nc=0,nd=0,nf=0,nt=0;const W3=[0,0,0];
      const dot=(x,y,z,r,g,b,a,size,rim)=>{if(nd>=dots.capacity)dots.ensure(nd+1);dots.write('position',nd,x,y,z);dots.write('pC',nd,r,g,b,a);dots.write('pS',nd,size,rim);nd++;};
      for(let e=0;e<eco.capacity;e++){
        const vis=lifeVisibility(eco,e,v);if(vis<=.003||lifeDormant(eco,e))continue;
        const s=eco.sp[e];lifePosition(eco,e,alpha,P3);driftAt(eco,P3[0],P3[1],P3[2],k,D3);
        const x=P3[0]*ik+D3[0],y=P3[1]*ik+D3[1],z=P3[2]*ik+D3[2];
        const kt=eco.tgt[e],site=kt>=0&&kt<nS&&sNi[kt]>=0,ni=site?sNi[kt]:-1,m=eco.mode[e];
        const dist=Math.min(1,eco.sample(2,P3[0],P3[2])/1.2),en=Math.min(1,eco.sample(1,P3[0],P3[2])/2);
        const h0=u01(seed,e,eco.gen[e],71);
        if(s===VESICLE){
          // brighter where it gathers and where the neuron is nourished; the calcium wave of its neuron's firing passes it too
          let ca=0;if(site){const dx=x-(npos[ni*3]+sDr[kt*3]),dy=y-(npos[ni*3+1]+sDr[kt*3+1]),dz=z-(npos[ni*3+2]+sDr[kt*3+2]);ca=wave(ni,Math.sqrt(dx*dx+dy*dy+dz*dz),W3);}
          const g=(m===MODE_ORBIT?1.25:m===MODE_REST?.45:.8)*(1+.5*en)*(1-.5*dist)*(.75+.5*h0)*vis*MB,C=vPal[VESICLE],sz=(.06+.04*h0)*MS;
          dot(x,y,z,C.r*g+W3[0]*.9,C.g*g+W3[1]*.9,C.b*g+W3[2]*.9,.5,sz,1);
          const F=VFOL[q];for(let f=0;f<F;f++){if(!lifeFollower(eco,e,f,F,alpha,tv,P4,{spread:.45,lag:.7}))break;
            dot(P4[0]*ik+D3[0],P4[1]*ik+D3[1],P4[2]*ik+D3[2],C.r*g,C.g*g,C.b*g,.22,sz*(.6+.3*u01(seed,e,eco.gen[e],72+f)),1);nf++;}
          // a fed vesicle carries the gathering's influence: a fading tail along its own path
          if(eco.carry[e]>0&&TAIL[q]){const n=Math.round(TAIL[q]*Math.min(1.6,MT)),K=eco.K,hd=eco.trailHead,o=e*K;
            for(let j=1;j<=n&&j<K;j++){const qq=o+((hd-j+1+K*4)%K),f=1-j/(n+1);dot(eco.tx[qq]*ik+D3[0],eco.ty[qq]*ik+D3[1],eco.tz[qq]*ik+D3[2],C.r*g,C.g*g,C.b*g,.24*f*f,sz*(.5+.5*f),0);nt++;}}
          continue;}
        // glia and microglia: cells, oriented toward the synapse they work beside (glia) or along their motion (microglia)
        let ox=0,oy=0,oz=0;
        if(s===GLIA&&anchors.of(eco,e,A3)){ox=A3[0]*ik+D3[0]-x;oy=A3[1]*ik+D3[1]-y;oz=A3[2]*ik+D3[2]-z;}
        else if(site&&s===GLIA){ox=npos[ni*3]+sDr[kt*3]-x;oy=npos[ni*3+1]+sDr[kt*3+1]-y;oz=npos[ni*3+2]+sDr[kt*3+2]-z;}
        else{ox=eco.vx[e];oy=eco.vy[e];oz=eco.vz[e];}
        let ca=0;W3[0]=W3[1]=W3[2]=0;
        if(site){const dx=x-(npos[ni*3]+sDr[kt*3]),dy=y-(npos[ni*3+1]+sDr[kt*3+1]),dz=z-(npos[ni*3+2]+sDr[kt*3+2]);ca=wave(ni,Math.sqrt(dx*dx+dy*dy+dz*dz),W3);}
        const settled=m===MODE_ORBIT?1:0,C=vPal[s===GLIA?GLIA:MICROGLIA];
        const g=(s===GLIA?.3+.15*settled:.32)*(1-.55*dist)*(.8+.4*h0)*vis*MB,cal=(s===GLIA?.8:.4)*vis;
        // the glia's own light rises a little with the energy where they work (gold), and with the wave; a microglial
        // cell is activated (rounds up) where the field is disturbed
        const R=(s===GLIA?1+.35*h0:.75+.25*h0)*MS,act=s===GLIA?0:Math.min(.999,Math.max(0,(eco.sample(2,P3[0],P3[2])-.08)*2.2));
        cells.write('cP',nc,x,y,z,R);cells.write('cA',nc,ox,oy,oz,s===GLIA?0:1+act);cells.write('cC',nc,C.r*g,C.g*g,C.b*g,1);
        cells.write('cS',nc,u01(seed,e,eco.gen[e],73),(W3[0]+pal.primary.r*.07*en*settled)*cal,(W3[1]+pal.primary.g*.07*en*settled)*cal,(W3[2]+pal.primary.b*.07*en*settled)*cal);nc++;
      }
      cells.commit(nc);dots.commit(nd);
      lifeStatsNow={drawn:nc+nd-nf-nt,followers:nf,tails:nt,drawCalls:2,cells:nc,sites:nS,scale:+k.toFixed(3)};
    };
  }
  // ---- Frame -------------------------------------------------------------------------------------------------------------
  function update(i){
    info=i;const sp=ctx.speed();U.uT.value=i.tsec;U.uV.value=i.tview;U.uSpeed.value=sp;U.uQ.value=i.quality||0;
    const [w,h]=ctx.pipeline.size;U.uPx.value=Math.max(.4,h/1080);U.uRes.value.set(w,h);
    const reactive=clamp(num(MU.reactivity,.6),0,1),tempo=tempoOf(i),breathS=Math.max(2,num(mot.breath,4))*4*60/tempo;
    U.uBreath.value=(.5+.5*Math.sin(i.tview/breathS*TAU))*(.4+.6*reactive);U.uBeat.value=i.beat*num(MU.beatPulse,.4)*reactive;
    U.uDrift.value=driftK();U.uMyelin.value=i.unlocks[2]?.level||0;
    net=layout.networkAt(model,i.t);
    // Files and dependencies become alive as the performance reaches them, also without a new model version.
    let files=0,links=0;for(const n of net.neurons)files+=n.files.length;for(const l of model.links.values())if(model.alive(l,i.t))links++;
    const cheap=`${model.version}|${net.neurons.length}|${files}|${links}`;
    if(cheap!==built.cheap){built.cheap=cheap;const k=structureKey(i.t);if(k!==built.key){built.key=k;build(i.t);}}
    const q=i.quality||0,atmo=clamp(i.overrides.atmosphere??1,0,2);
    dend.geometry.instanceCount=realSegs+(q>=3?0:q>=2?ghostSegs>>1:ghostSegs);
    motes.geometry.setDrawRange(0,Math.round(MOTES*clamp(PARTICLES*atmo,0,2)/2*(q>=3?.35:q>=2?.55:1)));
    if(LIFE)lifeGlowAt(i);
    const spikes=writeState(i);placeSynapses();fxCount=updateAgents(i,spikes);fx.commit(fxCount);
    if(LIFE)lifeUpdate(i);
    moteMat.uniforms.uNet.value.set(net.center[0],net.center[1],net.center[2],Math.max(14,net.radius));moteMat.uniforms.uGlial.value=i.unlocks[0]?.level||0;
    bgU.uStress.value=stressNow;bgU.uStorm.value=stormNow;bgU.uTide.value=i.unlocks[1]?.level||0;bgU.uHazeK.value=clamp(num(atm.haze,.75),0,1.6)*atmo;
    bgU.uWebK.value=GHOSTS*atmo*(1+.5*(i.unlocks[3]?.level||0));
  }
  const fwd=new THREE.Vector3(),tmp=new THREE.Vector3();let goalTarget=new THREE.Vector3();
  function afterCamera(i){camera.updateMatrixWorld();bgU.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);bgU.uCam.value.copy(camera.position);
    camera.getWorldDirection(fwd);U.uFocus.value=Math.max(4,tmp.copy(goalTarget).sub(camera.position).dot(fwd));}
  function background(){return background_;}
  function grade(i){
    const inten=i.overrides.intensity??1,sec=i.mood?.section,sp=ctx.speed();
    let flash=0;for(const s of storms){const a=(i.t-s.at)/1000/sp;if(s.full&&a>=0&&a<3)flash+=.05*Math.exp(-a*1.8)*(s.grand?1.6:1);}
    let ex=0;for(const e of expands){const a=(i.t-e.at)/1000/sp;if(a>=0&&a<6)ex+=.04*e.s*smooth(a/.6)*Math.exp(-a*.5);}
    const tint=new THREE.Vector3(1,1,1);if(sec==='tension')tint.set(1.03,.98,.99);else if(sec==='resolve')tint.set(.98,1.01,1.03);
    tint.lerp(new THREE.Vector3(.96,.95,1.06),stressNow*.6);
    return {tonemap:'agx',bloom:clamp(num(LT.bloom,1),.3,2)*.95*(1+.45*stormNow+.12*(i.activity||0)),threshold:clamp(num(LT.bloomThreshold,.65),.5,.9)*.9,
      exposure:(1+(clamp(num(LT.exposure,1.05),.4,2.2)-1)*.6)*1.15*(1-.12*stressNow)*(1+.12*stormNow+ex)*(sec==='breath'?.97:sec==='lift'?1.03:1),
      contrast:clamp(num(LT.contrast,1),.85,1.3)*1.05,saturation:1.1*(1-.25*stressNow),vignette:num(LT.vignette,.3)*1.15,grain:num(LT.grain,.025)*.6,
      flash:flash*inten,tint,aberration:.002,bloomTint:{x:1,y:.93,z:.88},streak:.12};
  }
  // ---- Camera: an establishing view into the network, attention on what changed, a pull-back for the storm ----------------
  const baseAz=rand(seed+11)*TAU;
  function cameraGoal(i){
    const fov=clamp(num(cam.fov,34),20,55),tanHalf=Math.tan(fov*Math.PI/360),motion=clamp(i.overrides.motion??1,0,2),drift=clamp(num(cam.drift,.7),0,1.6);
    const c=net?net.center:[0,0,0],R=Math.max(14,net?net.radius:14);
    // a small network fits the frame; a large one fills it and runs past its edges (distance grows with its square root)
    let distance=Math.min(R*.5,3.1*Math.sqrt(R))/tanHalf*clamp(num(cam.distance,1),.6,1.6)*(1+.22*stormNow);
    const az=cam.personality==='glide'?baseAz+Math.sin(i.tview/160)*.55*drift*motion:baseAz+i.tview*TAU/1300*motion*(.5+.5*drift);
    let elev=.06+.42*clamp(num(cam.elevation,.3),.05,.9)+Math.sin(i.tview/97)*.04*drift*motion;
    const target=new THREE.Vector3(c[0],c[1],c[2]);
    // what changed is seen up close (a few soma widths fill the frame: the membranes, the nucleus, the synapses); an agent's
    // work in a medium close-up; between them the network
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;let k=0;
    if(att&&since<13&&!stormNow){const p=attentionPos(att);if(p){k=smooth(since/1.6)*(1-smooth((since-8.5)/4.5))*clamp(i.overrides.intensity??1,.4,1)*.85;
      target.lerp(p,k);distance=lerp(distance,Math.min(distance,4.4/tanHalf),k);}}
    if(k<.01){const busy=i.agents.map(a=>workOf(a,i.t)).find(Boolean);
      if(busy){const p=siteOf(busy,[0,0,0]);if(p){target.lerp(tmp.set(...p),.5);distance=lerp(distance,Math.min(distance,7/tanHalf),.55);}}}
    goalTarget.copy(target);
    return {target,distance,azimuth:az,elevation:elev,fov,omega:k>.01?1.1:.5};
  }
  function attentionPos(c){const s=c.subject||{};
    if(s.fileId&&fileIdx.has(s.fileId)){const p=siteOf(s.fileId,[0,0,0]);if(s.targetId&&fileIdx.has(s.targetId)){const q=siteOf(s.targetId,[0,0,0]);return new THREE.Vector3((p[0]+q[0])/2,(p[1]+q[1])/2,(p[2]+q[2])/2);}return new THREE.Vector3(...p);}
    if(s.groupId&&net){const cl=net.clusters.find(x=>x.id===s.groupId);if(cl)return new THREE.Vector3(...cl.pos);}
    const cl=mostAffected(s.fileIds);return cl?new THREE.Vector3(...cl.pos):null;}
  function mostAffected(ids){if(!net)return null;const n=new Map();for(const id of ids||[]){const f=net.fileNeuron.get(id);if(f)n.set(f.neuron.cluster,(n.get(f.neuron.cluster)||0)+1);}
    const best=[...n].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1))[0];return best?net.clusters.find(c=>c.id===best[0]):null;}
  // ---- Words -------------------------------------------------------------------------------------------------------------
  const role=id=>model.districts.get(id)?.role||'logic';
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  const milestoneWords=c=>(c.detail?.kinds||[]).map(x=>MILESTONE[x]||x).join(' · ');
  const stormOf=c=>storms.find(s=>s.at===c.at);
  function describe(c,i){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=attentionPos(c)||new THREE.Vector3(...(net?.center||[0,0,0]));
    switch(c.intent){
      case 'subsystem.created':return {text:'A new cluster of neurons forms',sub:s.groupId?`${ctx.name(s.groupId)} · ${role(s.groupId)}`:'',position:pos};
      case 'structure.created':return {text:'New branches arborise',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','component').replace('api.route','route')}`).join(' · ')||`${d.count||1} symbol${(d.count||1)===1?'':'s'}`,position:pos};
      case 'structure.removed':return {text:'Branches are pruned',sub:'structure removed',position:pos};
      case 'subsystem.connected':{const a=net?.fileNeuron.get(s.fileId),b=net?.fileNeuron.get(s.targetId);
        return {text:d.first?'Integration · a new axon pathway links two clusters':'The pathway between two clusters strengthens',sub:a&&b?`${ctx.name(a.neuron.cluster)} → ${ctx.name(b.neuron.cluster)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · ${n} branch${n===1?'':'es'} misfire`,sub:'observed failing run',position:pos,color:'#ff7a8a'};
      case 'validation.passed':return {text:`Tests pass · an activation wave crosses ${n} branch${n===1?'':'es'}`,sub:'observed passing run',position:pos,color:'#8dffd8'};
      case 'validation.recovered':return {text:'Recovered · the network fires in step again',sub:'the tests pass again',position:pos,color:'#8dffd8',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · pathways consolidate',sub:`${d.removedSymbols||0} symbol${d.removedSymbols===1?'':'s'} removed`,position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=milestoneWords(c),st=stormOf(c);return {text:`${st?.full?'Synaptic storm':'A cascade'} · ${k}`,sub:'verified by a passing test run · myelin remains',position:pos,banner:k,bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:n?`Committed · ${n} branch${n===1?'':'es'} potentiated`:'Committed · the work is potentiated',sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The network grows · chapter ${d.chapter}`,sub:'accumulated structure',position:pos};
      case 'agent.collision':return {text:'Two agents meet at one neuron',sub:(d.providers||[]).map(id=>presence(id).display).join(' · '),position:pos};
      default:return null;}}
  function agentPosition(id){return agentState.get(id)?.pos||null;}
  function agentColor(a){return '#'+agentCol[seatOf(a)].getHexString();}
  function subsystemLabels(){if(!net)return [];return net.clusters.map(c=>{const files=c.neurons.reduce((a,n)=>a+n.live,0);
    return {position:new THREE.Vector3(c.pos[0],c.pos[1]+Math.min(c.R*.55,9)+2,c.pos[2]),text:ctx.name(c.id),sub:`${role(c.id)} · ${c.neurons.length} neuron${c.neurons.length===1?'':'s'} · ${files} file${files===1?'':'s'}`};});}
  function status(i){let v=0,st=0;for(const f of fileList){if(f.ghost)continue;const m=model.modules.get(f.id);if(!m||!model.alive(m,i.t))continue;const s=model.stateAt(m,i.t);if(s==='validated')v++;if(s==='stressed')st++;}
    return st?`${st} branch${st===1?'':'es'} misfiring`:v?`${v} validated`:'';}
  function pick(x,y,cam,i){let best=null,bd=.06;const p=new THREE.Vector3(),w=[0,0,0];for(let ni=0;ni<(net?.neurons.length||0);ni++){p.set(...neuronWorld(ni,w)).project(cam);const d=Math.hypot(p.x-x,(p.y-y)*.7);if(p.z<1&&d<bd){bd=d;best=`n:${neuronList[ni].id}`;}}return best;}
  function inspect(id,i){if(!id?.startsWith('n:'))return null;const ni=neuronIdx.get(id.slice(2)),n=neuronList[ni];if(!n||n.ghost)return null;
    const st=n.files.map(f=>model.modules.get(f)).filter(Boolean).map(m=>model.stateAt(m,i.t)),stressed=st.filter(x=>x==='stressed').length;
    return {position:new THREE.Vector3(...neuronWorld(ni,[0,0,0])),text:`A neuron of ${ctx.name(n.cluster)}${n.k===0?' · hub':''}`,sub:`${n.files.length} branch${n.files.length===1?'':'es'}${stressed?` · ${stressed} misfiring`:''}`};}
  function stats(){return {clusters:net?.clusters.length||0,neurons:net?.neurons.length||0,ghosts:GH,files:fileList.filter(f=>!f.ghost).length,segments:realSegs,ghostSegments:ghostSegs,boutons:realTips,
    axons:axons.length,fx:fxCount,storms:storms.filter(s=>s.full).length,firing:lastStats.fires||0,radius:+(net?.radius||0).toFixed(1)};}
  function dispose(){const objs=[];scene.traverse(o=>{if(o!==scene)objs.push(o);});for(const o of objs){scene.remove(o);o.material?.dispose?.();}
    for(const x of disposables)x.dispose?.();NS.dispose();FS.dispose();}
  // After a seek: no transient survives (lasting myelin comes back from the director's record).
  function onPrime(){for(const l of [waves,misfires,resyncs,storms,potentiations,expands])l.length=0;agentState.clear();mySig='';}
  // Composition anchors (layers.js): the clusters, the neurons, the work, the network's rim. Read-only.
  const composeA={center:new THREE.Vector3(),extent:14,subsystems:[],active:{pos:new THREE.Vector3()},nodes:[],boundary:{radius:16,y:0}};
  function composeAnchors(i){if(!net)return composeA;composeA.center.set(...net.center);composeA.extent=Math.max(6,net.radius);composeA.boundary.radius=net.radius*1.1;composeA.boundary.y=net.center[1];
    composeA.subsystems=net.clusters.map(c=>({id:c.id,pos:new THREE.Vector3(...c.pos),size:Math.max(1,c.R*.5)}));
    composeA.nodes=net.neurons.slice(0,64).map(n=>({pos:new THREE.Vector3(...n.pos)}));
    const att=i?ctx.director.attentionAt(i.t,1):null;composeA.active.pos.copy((att&&attentionPos(att))||composeA.center);return composeA;}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime,
    compose:{camera,scene,anchors:composeAnchors},...(LIFE?{lifeStats,onLifeParams}:{})};
}

// Temporal Terrain (preview): the project's history as a contour landscape. Design brief: docs/worlds/temporal-terrain.md.
//
// Data -> image (nothing here is decoration that claims engineering work):
//  - time                 -> depth: the present is the front edge (a lit cut through the land), the past recedes toward
//                            the horizon on a logarithmic scale (terrain-layout.js depthOf)
//  - subsystem (district) -> a range across the land in its own hue on the identity's harmony, placed from the middle
//                            outward in order of birth; its plateau rises with its symbols and files
//  - file (module)        -> a ridge at its slot in its range, running back through time from its birth, its height
//                            from its live symbols; a settlement light on its peak at the front edge
//  - symbol               -> the ridge's height and its fine relief (the amplitude of small anchored ridges)
//  - dependency           -> a road of light over the land near the front edge, from the importing peak to the
//                            imported one; pulses run along it when the importer's file fires
//  - agent                -> a surveyor's light in its provider's colour and shape (CAST seat) over the ridge it works
//                            on, its beam on the ground; its edit raises the ground there (a dome: the contours open
//                            into rings of its colour)
//  - tests passing        -> a scan: a front of valid light sweeping across the land near the present
//  - failure              -> a fault: the ground shudders, a fissure opens along the covered ridges in the warning
//                            colour and its contours turn warning-coloured for as long as they are stressed; the scar
//                            stays in history. Never gold
//  - recovery             -> healing: valid light runs along the scar to the present and seals it
//  - commit               -> a survey line across the land at its moment and a stake on each committed ridge (lasting)
//  - verified milestone   -> the earned sunrise (the key light swings low behind the land, the sky warms, a warm wave
//                            runs over every range), at most once per SUNRISE_GAP of performance time and only with the
//                            director's milestone token; otherwise a local glow. A monument stays (lasting)
// Ambient life (never progress): the land keeps flowing back with time, the key light travels a slow arc, mist drifts in
// the valleys, the contours shimmer on the score's beat grid, motes drift, the camera drifts between its vantage points.
// Every image is a function of the model (in a replay its whole recorded history, rebuilt after a seek: onHistory),
// the recipe, the director's fold and the performance clock.
import {THREE,clamp,lerp,smooth,hash,rand} from './core.js';
import {LANES,LEVELS,ROWS,EASE,MAX_AGE,layoutConfig,depthOf,ageOf,levelBin,createLand,historyFrom,recordCue,rangesAt,reliefAt,meanderAt,reliefHeight} from './terrain-layout.js';
import {LAND_VS,LAND_FS,SKY_FS} from './terrain-glsl.js';
import {touchesAt,touchGain} from './touch.js';
import {presence} from '../providers.js';
import {createTerrainGrammar,kxOf,GRAZER,SWIFT,GLEANER,RN as LIFE_RN,Z0 as LIFE_Z0,Z1 as LIFE_Z1,SPEED_MAX} from './life/terrain.js';
import {position as lifePosition,follower as lifeFollower,fieldTexture as lifeFieldTexture,visibility as lifeVisibility,musicLook} from './life/present.js';
import {u01} from './life/sim.js';
const TAU=Math.PI*2,SUNRISE_GAP=240000,DWELL=4500,MAX_FX=4000,MAX_RIB=3000,MAX_ROADS=32,ROAD_SEG=28,MOTES=420,BASE=7;
// Each CAST provider its own colour and shape (seat: Claude, Cursor, Codex, Grok, Qwen, Kimi, then unknown providers).
const AGENT_COLORS=['#ff5f8a','#3fe6ff','#8dff6a','#f2f4ff','#59a8ff','#ff5cf0','#ffb35c','#c0c8d8'];
const LIGHT=new Set(['reading','searching','researching']);
// Quality levels (the host also drops MSAA at 1 and resolution at 2 and 3): the land's grid (lanes x rows), the fine
// relief's octaves, motes. Films always render at 0.
export const QUALITY=[{nx:400,nz:230,oct:1,motes:1},{nx:330,nz:190,oct:1,motes:1},{nx:260,nz:150,oct:.6,motes:.6},{nx:200,nz:115,oct:0,motes:.35}];
// The harmony's shares of its span: range k takes the hue at SEQ[k] of the span around the first hue.
const SEQ=[0,1,-1,.5,-.5,.75,-.75,.25,-.25,.9,-.9];
const SPAN={analogous:28,complementary:48,split:64,triad:80};
// The land's shaders with digital life (only when it is on): the vertex passes the layout x it read the land at (the
// ecosystem's frame), the fragments read the ecosystem's fields there (life/present.js fieldTexture: r trail, g energy,
// b disturbance, a density) and the world's light map (its own inhabitants' light, drawn each frame) and draw what the
// life gives the land: the paths the herds wore, receding with the land, as contour lines brighter where they cross
// them; the light of the inhabitants on the ground under them and on the contour lines around them; a nourished
// pasture's warmth on its lines.
// uLifeX: the frame's compression, the population's visibility (crossfades, restoring), the paths' strength (the
// music's trail factor, fading in replays faster than the life can follow), the herds' light (the music's life factor).
function withLife(src,kind){
  const vary=src.replace('varying float vCrest,','varying float vLx,vCrest,');
  if(kind==='vs')return vary.replace('vFx=fxc;','vFx=fxc;vLx=xs;');
  return vary.replace('uniform vec3 uRock,uWarn,uValid,uHi,uSkyC;','uniform vec3 uRock,uWarn,uValid,uHi,uSkyC;uniform sampler2D uLifeF,uLifeL;uniform vec4 uLifeX;uniform vec3 uLifeC,uLifeD;')
    .replace('col=mix(col,vFogC*1.6+uHaze*1.2+uKeyC*.008,vMist);',`{vec2 lu=vec2((vLx*uLifeX.x+${LIFE_RN.toFixed(1)})/${(2*LIFE_RN).toFixed(1)},(depth-(${LIFE_Z0.toFixed(1)}))/${(LIFE_Z1-LIFE_Z0).toFixed(1)});
    if(uLifeX.y>0.&&lu.x>0.&&lu.x<1.&&lu.y>0.&&lu.y<1.){vec4 L=texture2D(uLifeF,lu);float tr=smoothstep(.12,.8,L.r)*uLifeX.z,hl=texture2D(uLifeL,lu).r,en=smoothstep(.08,.9,L.g);
      col+=(uLifeC*tr*(.012+on*.45)+uLifeD*hl*(.13+on*1.5)*uLifeX.w+uAcc*en*on*.22)*uLifeX.y;}}
  col=mix(col,vFogC*1.6+uHaze*1.2+uKeyC*.008,vMist);`);
}
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome||{},P0=G.palette||{};
  const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  const ctr=G.contour||{},mtl=G.material||{},atm=G.atmosphere||{},mot=G.motion||{},cam=G.camera||{},LT=G.light||{},MU=G.music||{};
  const col=(c,d)=>new THREE.Color(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:d);
  const pal={primary:col(P0.primary,'#3fb8c9'),secondary:col(P0.secondary,'#1c2230'),accent:col(P0.accent,'#ffb14e'),highlight:col(P0.highlight,'#d4e6ee'),
    deep:col(P0.deep,'#03050b'),haze:col(P0.haze,'#121a2c'),warning:col(P0.warning,'#ff3d5e'),valid:col(P0.valid,'#7ee8c4')};
  // The night stays a night and the rock a ground for the lines whatever a tuned palette says.
  const capL=(c,max)=>{const h={};c.getHSL(h);if(h.l>max)c.setHSL(h.h,h.s,max);return c;};capL(pal.deep,.05);capL(pal.haze,.18);capL(pal.secondary,.22);
  const seed=(recipe.projectSeed>>>0)||1,cfg=layoutConfig(recipe),Zmax=depthOf(MAX_AGE,cfg);
  const V3=(c,k=1)=>new THREE.Vector3(c.r*k,c.g*k,c.b*k);
  const agentCol=AGENT_COLORS.map(c=>new THREE.Color(c));
  // ---- The harmony: each range its own hue around the lines' first hue, never olive -----------------------------------
  const hsl={};pal.primary.getHSL(hsl,THREE.SRGBColorSpace);
  const span=SPAN[P0.scheme]||60,rangeCols=new Map();
  function rangeColor(id,rank){let c=rangeCols.get(id);if(c)return c;
    let h=hsl.h*360+span*SEQ[rank%SEQ.length]*(rank>=SEQ.length?.6:1)+(rand(hash(`hue/${id}`))-.5)*8;h=((h%360)+360)%360;if(h>48&&h<100)h=h<74?46:102;
    const k=new THREE.Color().setHSL(h/360,clamp(hsl.s*(.88+.24*rand(hash(`sat/${id}`)))),clamp(hsl.l*(.92+.16*rand(hash(`lit/${id}`))),.35,.72),THREE.SRGBColorSpace);
    c=[k.r,k.g,k.b];rangeCols.set(id,c);return c;}
  const land=createLand(cfg,{colorOf:rangeColor,plain:[pal.primary.r*.5,pal.primary.g*.5,pal.primary.b*.5]});
  const tex=new THREE.DataTexture(land.data,LANES*2,ROWS,THREE.RGBAFormat,THREE.FloatType);tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true;
  const disposables=[tex];const keep=x=>{disposables.push(x);return x;};
  const add=(o,order=0)=>{o.frustumCulled=false;o.renderOrder=order;scene.add(o);return o;};
  // ---- The recorded history: a replay's own model of everything recorded up to the moment (onHistory); live, the host's
  let hist=null;const M=()=>hist||model;
  // ---- Uniforms -------------------------------------------------------------------------------------------------------
  const v4=()=>new THREE.Vector4(),arr=(n,f)=>Array.from({length:n},f);
  const keyC=new THREE.Color('#9fb4d8').lerp(pal.highlight,.3);
  const U={uWarp:{value:1.5+.25*cfg.sp},uNFx:{value:0},uNMn:{value:0},uNTch:{value:0},uNCm:{value:0},uNSv:{value:0},uNAg:{value:0},uSv:{value:arr(4,v4)},uLand:{value:tex},uXc:{value:0},uXh:{value:100},uL:{value:cfg.L},uTau:{value:cfg.tau/1000},uNow:{value:0},uLv:{value:arr(LEVELS,v4)},uZmax:{value:Zmax},uBase:{value:BASE},
    uV:{value:0},uQ:{value:0},uOct:{value:1},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},
    uInt:{value:clamp(num(ctr.interval,.9),.4,1.6)},uIdx:{value:Math.round(clamp(num(ctr.index,5),3,6))},uLW:{value:clamp(num(ctr.width,1.1),.5,2)},uGlow:{value:clamp(num(ctr.glow,1),.4,1.8)},
    uSheen:{value:clamp(num(mtl.sheen,.4),0,1)},uCut:{value:clamp(num(mtl.cut,1),0,1.8)},uFresh:{value:1},
    uRock:{value:V3(pal.secondary,clamp(num(mtl.rock,.8),.2,1.4)*1.6)},uWarn:{value:V3(pal.warning)},uValid:{value:V3(pal.valid)},uHi:{value:V3(pal.highlight)},
    uSkyC:{value:V3(pal.haze.clone().lerp(pal.primary,.25),1.6)},uKey:{value:new THREE.Vector3(.5,.3,-.8).normalize()},uKeyC:{value:V3(keyC,.9)},uAcc:{value:V3(pal.accent)},
    uDeep:{value:V3(pal.deep)},uHaze:{value:V3(pal.haze)},uDawn:{value:0},uSun:{value:0},uSunX:{value:0},
    uMist:{value:clamp(num(atm.mist,.8),0,1.6)},uHazeK:{value:clamp(num(atm.haze,.8),0,1.5)},uBeat:{value:0},uBeatL:{value:0},uShim:{value:clamp(num(mot.shimmer,.8),0,1.5)},uLant:{value:0},uStress:{value:0},
    uFx:{value:arr(8,v4)},uFxB:{value:arr(8,v4)},uFxC:{value:arr(8,v4)},uTch:{value:arr(4,v4)},uTchC:{value:arr(4,v4)},uAg:{value:arr(6,v4)},uAgC:{value:arr(6,v4)},uCm:{value:arr(16,v4)},uMn:{value:arr(8,v4)}};
  // Digital life (life/terrain.js): only when the recipe has it on. Off, nothing below differs from the world without it
  // (no resource, no draw call, no uniform, no shader text): every life addition is guarded by LIFE.
  const LIFE=ctx.life||null;
  if(LIFE)Object.assign(U,{uLifeF:{value:null},uLifeL:{value:null},uLifeX:{value:new THREE.Vector4(1,0,0,1)},uLifeC:{value:V3(pal.highlight.clone().lerp(pal.accent,.45),1)},uLifeD:{value:V3(pal.highlight.clone().lerp(pal.accent,.3),1)}});
  const landMat=keep(new THREE.ShaderMaterial({uniforms:U,vertexShader:LIFE?withLife(LAND_VS,'vs'):LAND_VS,fragmentShader:LIFE?withLife(LAND_FS,'fs'):LAND_FS}));
  // ---- The land's grid: denser near the front edge; the cut through the present first (it is nearest) -------------------
  const grids=new Map();
  function gridOf(q){let g=grids.get(q);if(g)return g;const {nx,nz}=QUALITY[q],pos=new Float32Array((nx*nz+nx*2)*3),idx=[];let v=0;
    const put=(u,d,s)=>{pos[v*3]=u;pos[v*3+1]=d;pos[v*3+2]=s;return v++;};
    const cutTop=v;for(let i=0;i<nx;i++)put(-1+2*i/(nx-1),0,0);const cutBot=v;for(let i=0;i<nx;i++)put(-1+2*i/(nx-1),0,1);
    for(let i=0;i+1<nx;i++)idx.push(cutTop+i,cutBot+i,cutTop+i+1,cutTop+i+1,cutBot+i,cutBot+i+1);
    const surf=v,D=180,K=1-D/(D+Zmax);for(let j=0;j<nz;j++){const d=D*(1/(1-K*j/(nz-1))-1);for(let i=0;i<nx;i++)put(-1+2*i/(nx-1),d,-1);}
    for(let j=0;j+1<nz;j++)for(let i=0;i+1<nx;i++){const a=surf+j*nx+i,b=a+nx;idx.push(a,a+1,b,a+1,b+1,b);}
    g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(idx);grids.set(q,g);return g;}
  const landMesh=add(new THREE.Mesh(gridOf(0),landMat),1);landMesh.userData.terrain=U;let gridQ=0;
  // ---- The sky -----------------------------------------------------------------------------------------------------------
  const bgU={uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uV:U.uV,uQ:U.uQ,uStars:{value:0},uAurora:{value:0},
    uDeep:U.uDeep,uHaze:U.uHaze,uKey:U.uKey,uKeyC:U.uKeyC,uAcc:U.uAcc,uDawn:U.uDawn,uSun:U.uSun,uSunX:U.uSunX};
  const sky=keep(new THREE.ShaderMaterial({uniforms:bgU,depthWrite:false,depthTest:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:SKY_FS}));
  // ---- Lights: agents, settlements, stakes, monuments' caps, sparks, motes (points: px at 1080 lines, or world size) ----
  const glow=(vertexShader,fragmentShader,extra={})=>keep(new THREE.ShaderMaterial({uniforms:{uPx:U.uPx,uRes:U.uRes,...extra},vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending}));
  const fx=pointBuffersOf({fC:4,fS:3},512);
  const fxMat=glow(`uniform float uPx;uniform vec2 uRes;attribute vec4 fC;attribute vec3 fS;varying vec4 vC;varying float vSh;
    void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float ppu=projectionMatrix[1][1]*uRes.y*.5/max(-mv.z,.1);
      gl_PointSize=clamp(max(fS.x*uPx,fS.z*ppu),1.,260.*uPx);vC=fC;vSh=fS.y;}`,
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
      else if(sh==9){a=exp(-q.x*q.x*400.)*smoothstep(1.,.7,abs(q.y))+exp(-(q.x*q.x+(q.y-.72)*(q.y-.72))*90.)*1.2;g=0.;}
      else if(sh==10){a=exp(-pow((r-.8)*9.,2.));g=0.;}
      else if(sh==11){a=exp(-r*r*3.)*.6;g=0.;}
      else if(sh==12){a=max(0.,1.-(abs(q.x)*9.+abs(q.y)*1.3))+max(0.,1.-(abs(q.y)*9.+abs(q.x)*1.3))+exp(-r*r*22.)*1.6;g*=.6;}
      else{a=exp(-r*r*14.)*1.4;}
      a=(a+g)*(1.-smoothstep(.92,1.,r));gl_FragColor=vec4(vC.rgb*a*vC.a,1.);}`);
  add(new THREE.Points(fx.geometry,fxMat),5);
  // ---- Ribbons: roads, beams, beacons, stakes (camera-facing segments, soft across) -------------------------------------
  const quad=keep(new THREE.BufferGeometry());quad.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,0,1,0,1,1,0],3));quad.setIndex([0,1,2,2,1,3]);
  const rib=instancedBuffersOf(quad,{rA:4,rB:4,rC:4,rD:4});
  const ribMat=glow(`uniform float uPx;uniform vec2 uRes;attribute vec4 rA,rB,rC,rD;varying vec4 vC;varying float vY,vAl;
    void main(){vec4 va=viewMatrix*vec4(rA.xyz,1.),vb=viewMatrix*vec4(rB.xyz,1.),vp=mix(va,vb,position.x);
      vec3 t=vb.xyz-va.xyz;t=length(t)>1e-6?normalize(t):vec3(1.,0.,0.);vec3 sd=cross(t,normalize(vp.xyz));sd=length(sd)>1e-6?normalize(sd):vec3(0.,1.,0.);
      float z=max(-vp.z,.1),ppu=projectionMatrix[1][1]*uRes.y*.5/z,w=mix(rA.w,rB.w,position.x),wp=max(w,1.1*uPx/ppu);
      vp.xyz+=sd*position.y*wp*1.6;vY=position.y*1.6;vAl=mix(rD.x,rD.y,position.x)*min(1.,w/wp*1.4+.25);vC=rC;gl_Position=projectionMatrix*vp;}`,
    `varying vec4 vC;varying float vY,vAl;void main(){float a=exp(-vY*vY*2.6);gl_FragColor=vec4(vC.rgb*a*vAl*vC.a,1.);}`);
  add(new THREE.Mesh(rib.geometry,ribMat),4);
  function instancedBuffersOf(base,layout){
    const g=new THREE.InstancedBufferGeometry();g.index=base.index;for(const [k,v] of Object.entries(base.attributes))g.setAttribute(k,v);
    const self={geometry:g,capacity:0,arrays:{},n:0};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(64,self.capacity);while(c<n)c*=2;
      for(const [name,size] of Object.entries(layout)){const arr=new Float32Array(c*size),old=self.arrays[name];if(old)arr.set(old.subarray(0,Math.min(old.length,arr.length)));
        self.arrays[name]=arr;g.deleteAttribute(name);const at=new THREE.InstancedBufferAttribute(arr,size);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,at);}
      self.capacity=c;};
    self.write=(name,i,...v)=>{if(i>=self.capacity)self.ensure(i+1);const s=layout[name],a=self.arrays[name];for(let k=0;k<s;k++)a[i*s+k]=v[k]??0;};
    self.commit=n=>{g.instanceCount=n;self.n=n;for(const name of Object.keys(layout))g.attributes[name].needsUpdate=true;};
    self.ensure(256);self.dispose=()=>g.dispose();g.instanceCount=0;keep(self);return self;
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
  let nFx=0,nRib=0;
  const C3=c=>c.isVector3?c:{x:c.r,y:c.g,z:c.b};
  function point(p,c,a,px,shape=7,world=0){if(nFx>=MAX_FX||!(a>.003))return;const k=C3(c);fx.write('position',nFx,p[0],p[1],p[2]);fx.write('fC',nFx,k.x,k.y,k.z,a);fx.write('fS',nFx,px,shape,world);nFx++;}
  function ribbon(a,b,wa,wb,c,alpha,aa=1,ab=1){if(nRib>=MAX_RIB||!(alpha>.003))return;const k=C3(c);rib.write('rA',nRib,a[0],a[1],a[2],wa);rib.write('rB',nRib,b[0],b[1],b[2],wb);rib.write('rC',nRib,k.x,k.y,k.z,alpha);rib.write('rD',nRib,aa,ab,0,0);nRib++;}
  // ---- Per-frame state -------------------------------------------------------------------------------------------------
  let info={t:0,tsec:0,tview:0,overrides:{},agents:[]},present={ranges:[],left:0,right:0},files=new Map(),crest=new Map(),peak=10;
  const scans=[],faults=[],heals=[],surveys=[],sunrises=[],glows=[],horizons=[];
  const push=(list,x,max=6)=>{list.push(x);if(list.length>max)list.shift();};
  const tempoOf=i=>Math.max(40,i.mood?.tempo||92);
  const near=(list,i,ms)=>list.filter(x=>x.at<=i.t&&i.t-x.at<ms*ctx.speed());
  const seatOf=a=>presence(a.provider).seat%8;
  const ep=()=>model.epoch;
  // A moment's place: its depth now, and the land's elevation there (the JS twin of the shader's sample).
  const depthAt=tAbs=>depthOf(info.t-tAbs,cfg);
  const groundAt=(x,tAbs)=>{const z=depthOf(info.t-tAbs,cfg),w=reliefAt(x,z,0,0,U.uWarp.value)[3],xs=x+w,rug=clamp(land.sample(xs,tAbs,info.t,ep(),1),0,2);
    return land.sample(xs,tAbs,info.t,ep(),0)+reliefAt(x,z,rug,0,0)[0];};
  // Where a place of the layout is drawn at a depth: the shader reads the structure at x + meander(x, depth), so a ridge
  // laid out at xl stands where x + meander(x) = xl (two fixed-point steps; the meander is smooth).
  const drawnX=(xl,z)=>{let x=xl;for(let k=0;k<2;k++)x=xl-reliefAt(x,z,0,0,U.uWarp.value)[3];return x;};
  const at3=(xl,tAbs,lift=0)=>{const z=depthAt(tAbs),x=drawnX(xl,z);return [x,groundAt(x,tAbs)+lift,-z];};
  let stressNow=0,sunNow=0,lastStats={};
  // Which verified milestones may earn a sunrise: the first, then each at least SUNRISE_GAP of performance time after the
  // last that did (a pure fold over the director's lasting record).
  function sunriseAllowed(at){const times=[];for(const l of ctx.director.lasting())for(const x of new Set([l.first,...(l.times||[])]))if(x<=at)times.push(x);
    times.sort((a,b)=>a-b);let last=-Infinity,ok=false;for(const x of times){const can=x-last>=SUNRISE_GAP;if(can)last=x;if(x===at)ok=can;}return ok;}
  // The present's files and ranges (positions, crests); the subjects of events by their files.
  // The present's files (their drawn place x, layout place xl) and ranges (drawn centre cd), their crests.
  function presentAt(i){present=rangesAt(land.prepared,i.t,EASE,cfg);files=new Map();crest=new Map();peak=6;
    for(const r of present.ranges){r.cd=drawnX(r.c,0);for(const f of r.files){const x=drawnX(f.x,0);files.set(f.id,{...f,xl:f.x,x,range:r});const h=groundAt(x,i.t);crest.set(f.id,h);peak=Math.max(peak,h);}}}
  function spanOf(ids,pad=2){let a=Infinity,b=-Infinity;for(const id of ids||[]){const f=files.get(id);if(!f)continue;a=Math.min(a,f.x);b=Math.max(b,f.x);}
    return a<=b?[a-pad,b+pad]:null;}
  const centreOf=ids=>{const s=spanOf(ids,0);return s?(s[0]+s[1])/2:null;};
  // Touches: the agent's own tool event on a file (touch.js), and an attributed edit landing (the model's correlated cue).
  function touchList(i){
    const sp=ctx.speed(),gain=touchGain(G,i.overrides),out=[],src=M();
    for(const x of touchesAt(ctx.agents,i.agents,i.t,sp,{known:id=>files.has(id),max:4})){const a=i.agents.find(p=>p.id===x.agentId);out.push({fileId:x.fileId,age:x.age,at:x.at,k:x.env*x.k*gain,seat:a?seatOf(a):0,agentId:x.agentId,kind:x.kind});}
    for(const m of src.modules.values()){if(!Number.isInteger(m.agentVoice)||!Number.isFinite(m.lastAgent)||!files.has(m.id))continue;const age=(i.t-m.lastAgent)/sp/1000;if(age<0||age>3.2)continue;
      if(out.some(x=>x.fileId===m.id))continue;const a=i.agents.find(p=>p.voice===m.agentVoice);
      out.push({fileId:m.id,age,at:m.lastAgent,k:smooth(age/.15)*Math.pow(1-age/3.2,1.6)*gain,seat:a?seatOf(a):m.agentVoice%8,agentId:a?.id||null,kind:'edit'});}
    return out.sort((a,b)=>b.k-a.k||a.at-b.at).slice(0,4);}
  let touches=[];
  // ---- Agents: surveyors over the ridge they work on (pure functions of the observed lifecycle and time) -----------------
  const agentState=new Map();
  let editsT=null;const edits=new Map();
  function editsOf(voice){if(editsT!==info.t){edits.clear();editsT=info.t;}let l=edits.get(voice);
    if(!l){l=[...M().modules.values()].filter(m=>m.agentVoice===voice&&Number.isFinite(m.lastAgent)&&files.has(m.id)).sort((a,b)=>b.lastAgent-a.lastAgent).slice(0,4);edits.set(voice,l);}return l;}
  const lastEdit=(p,t)=>{for(const m of editsOf(p.voice))if(m.lastAgent<=t)return m;return null;};
  function workOf(p,t){if(p.display==='tool'&&p.fileId&&files.has(p.fileId))return p.fileId;const m=lastEdit(p,t);return m&&t-m.lastAgent<DWELL*ctx.speed()?m.id:null;}
  // A goal over the land in present coordinates: [x, height, depth].
  function goalOf(p,tv,t){
    const w=workOf(p,t);if(w){const f=files.get(w),h=crest.get(w)??0;return [f.x,h+6.5+.6*Math.sin(tv*1.3),2.4];}
    const ph=rand(hash(p.id))*TAU,home=p.home&&files.has(p.home)?files.get(p.home):null,waiting=p.display==='waiting'||p.display==='dormant'||p.display==='connected';
    if(home){const r=home.range,R=Math.max(4,r.w*.35),a=ph+tv*(p.busy?.3:.08);return [r.cd+Math.cos(a)*R,(crest.get(home.id)??0)+(waiting?17:11),5+(waiting?6:3)*(1+Math.sin(a))];}
    const c=(present.left+present.right)/2,R=Math.max(10,(present.right-present.left)*.3);return [c+Math.cos(ph+tv*.05)*R,peak+14,9];}
  function agentAt(id,t,tv){const a=ctx.agents.presence(id,t);if(!a)return null;let g=goalOf(a,tv,t);
    const sp=ctx.speed(),m=lastEdit(a,t);let tc=t-a.since;if(m){tc=Math.max(tc,m.lastAgent);if(m.lastAgent+DWELL*sp<=t)tc=Math.max(tc,m.lastAgent+DWELL*sp);}
    if(t-tc<1800*sp){const prev=ctx.agents.presence(id,tc-1);if(prev){const k=smooth((t-tc)/(1800*sp)),q=goalOf(prev,tv,tc-1),lift=Math.sin(k*Math.PI)*Math.min(8,Math.abs(q[0]-g[0])*.25);
      g=[lerp(q[0],g[0],k),lerp(q[1],g[1],k)+lift,lerp(q[2],g[2],k)];}}
    return {a,p:g};}
  function updateAgents(i){
    const sp=ctx.speed(),trailK=clamp(num(G.agents?.trail,1),.2,2.2),prom=clamp(num(G.agentProminence,.8),.3,1),seen=new Set();let k=0;
    for(const v of U.uAg.value)v.set(0,0,0,0);
    for(const a of i.agents.slice(0,12)){const h=agentAt(a.id,i.t,i.tview);if(!h)continue;seen.add(a.id);
      const pos=[h.p[0],h.p[1],-h.p[2]];let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3()};agentState.set(a.id,st);}st.pos.set(...pos);
      const seat=seatOf(a),c=agentCol[seat],alpha=a.alpha*(a.busy?1:.65)*prom,sub=a.subagent?.75:1,tk=touches.find(x=>x.agentId===a.id)?.k||0;
      // its trail: where it was, carried back with the land since
      for(let s=18;s>=1;s--){const dt=s*90*sp*trailK,q=agentAt(a.id,i.t-dt,i.tview-s*.09*trailK);if(!q)continue;const f=1-s/19;point([q.p[0],q.p[1],-depthOf(ageOf(q.p[2],cfg)+dt,cfg)],c,alpha*f*f*.9,(2.5+6*f)*sub,8);}
      point(pos,c,alpha*.45,78*sub,11);point(pos,c,alpha*(1.5+tk),40*sub,seat<6?seat:6);point(pos,{r:1,g:1,b:1},alpha,7*sub,8);
      // its beam on the land, brighter while it works there
      const work=workOf(a,i.t),gy=work?(crest.get(work)??0):groundAt(pos[0],i.t-ageOf(h.p[2],cfg));
      ribbon(pos,[pos[0],gy,pos[2]],.25,1.6,c,alpha*(work?.55+.6*tk:.18),1,.15);
      if(k<6){U.uAg.value[k].set(pos[0],pos[1],pos[2],alpha*(work?1.4+2*tk:.5));U.uAgC.value[k].set(c.r,c.g,c.b,0);k++;}}
    U.uNAg.value=k;
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
  }
  // ---- Effects: recorded intents only -------------------------------------------------------------------------------------
  function effect(cmd,i){
    if(i)info=i;const s=clamp(cmd.scale,0,1.6),subj=cmd.subject||{},at=Number.isFinite(cmd.at)?cmd.at:info.t;if(s<=0)return;
    const ids=new Set(subj.fileIds||(subj.fileId?[subj.fileId]:[]));
    switch(cmd.effect){
      case 'scan':push(scans,{at,files:ids,s});break;
      case 'fault':push(faults,{at,files:ids,s});break;
      case 'heal':push(heals,{at,files:ids,s});break;
      case 'survey':push(surveys,{at,files:ids,s});break;
      case 'sunrise':case 'terrace':{const full=cmd.effect==='sunrise'&&cmd.tier>=3&&sunriseAllowed(cmd.at);push(sunrises,{at,files:ids,s,full,grand:full&&cmd.tier>=4,terrace:cmd.effect==='terrace'},4);break;}
      case 'range':push(glows,{at,group:subj.groupId||null,files:ids,s,c:'primary',r:1.6},10);break;
      case 'peak':case 'uplift':push(glows,{at,files:ids,s:s*.8,c:'accent',r:.9},10);break;
      case 'erode':push(glows,{at,files:ids,s:s*.6,c:'highlight',r:.8},10);break;
      case 'horizon':push(horizons,{at,s});break;
      default:break;// roads draw themselves from the model's own times
    }
  }
  function slots(i){
    const sp=ctx.speed(),age=x=>(i.t-x.at)/1000/sp,out=[],tsec=x=>(x-ep())/1000,inten=clamp(i.overrides.intensity??1,.3,1.4);
    const all=[present.left,present.right];
    for(const x of near(scans,i,5000)){const sp2=spanOf(x.files)||all,a=age(x),L0=present.left-6,R0=present.right+6,xs=lerp(L0,R0,smooth(a/2.6));
      out.push({k:0,a,f:[xs,7,sp2[0]],b:[x.s*inten*(1-smooth((a-2.4)/1.2)),sp2[1],0],c:V3(pal.valid,1.4)});}
    for(const x of near(faults,i,6000)){const sp2=spanOf(x.files,3);if(!sp2)continue;out.push({k:1,a:age(x),f:[sp2[0],sp2[1],0],b:[x.s*inten,0,0],c:V3(pal.warning,1.3)});}
    for(const x of near(heals,i,6000)){const sp2=spanOf(x.files,3);if(!sp2)continue;let tf=Infinity;
      for(const id of x.files){const f=land.prepared.files.get(id);for(const [a2] of f?.stress||[])if(a2<=x.at&&a2>-Infinity)tf=Math.min(tf,Math.max(a2,x.at-MAX_AGE));}
      if(!Number.isFinite(tf))tf=x.at-8000;out.push({k:2,a:age(x),f:[sp2[0],sp2[1],0],b:[x.s*inten,tsec(tf),0],c:V3(pal.valid,1.3)});}
    for(const x of near(sunrises,i,16000)){const cx=centreOf(x.files)??(present.left+present.right)/2;
      if(x.full)out.push({k:4,a:age(x),f:[cx,0,0],b:[inten*(x.grand?1.3:1),0,0],c:V3(pal.accent.clone().lerp(new THREE.Color('#fff2dc'),.35),1.4)});
      else out.push({k:5,a:age(x),f:[cx,Math.max(10,(spanOf(x.files)||[cx-6,cx+6])[1]-cx+10),depthOf(i.t-x.at,cfg)],b:[inten*1.2,0,0],c:V3(pal.accent,1.3)});}
    for(const x of near(glows,i,5000)){let cx=centreOf(x.files),r=8;
      if(x.group){const R=present.ranges.find(q=>q.id===x.group);if(R){cx=R.cd;r=Math.max(8,R.w*.6);}}
      if(cx===null||cx===undefined)continue;out.push({k:5,a:age(x),f:[cx,r*x.r,depthOf(i.t-x.at,cfg)],b:[x.s*inten,0,0],c:V3(pal[x.c]||pal.accent,1.3)});}
    out.sort((a,b)=>a.a-b.a);
    // (an empty slot is inert: nothing from an earlier frame stays in the state)
    for(let k=0;k<8;k++){const x=out[k];if(!x){U.uFx.value[k].set(-1,0,0,0);U.uFxB.value[k].set(0,0,0,0);U.uFxC.value[k].set(0,0,0,0);continue;}
      U.uFx.value[k].set(x.k,...x.f);U.uFxB.value[k].set(...x.b,x.a);U.uFxC.value[k].set(x.c.x,x.c.y,x.c.z,0);}
    U.uNFx.value=Math.min(8,out.length);
    // survey flashes (thin: drawn by the fragments)
    const sv=near(surveys,i,5000).sort((a,b)=>b.at-a.at);for(let k=0;k<4;k++){const x=sv[k];if(!x){U.uSv.value[k].set(0,0,0,0);continue;}U.uSv.value[k].set(tsec(x.at),x.s*inten,0,age(x));}
    U.uNSv.value=Math.min(4,sv.length);
    return out;
  }
  // ---- Lasting: commits (survey lines and stakes) from the model, monuments from the director's record ----------------------
  let cmSig='',commits=[];
  function commitsOf(i){const P=land.prepared,live=hist?null:ctx.director.commands.filter(c=>c.intent==='repository.checkpoint'&&c.at<=i.t),sig=`${M().version}|${P.files.size}|${live?live.length+':'+(live.at(-1)?.at??''):''}`;
    if(sig!==cmSig){cmSig=sig;commits=P.commits.map(c=>({t:c.at,files:c.files}));
      // live: the director's recent checkpoints too (a deterministic fold of the recorded intents)
      if(live)for(const c of live)if(!commits.some(x=>Math.abs(x.t-c.at)<1500))commits.push({t:c.at,files:(c.subject?.fileIds||(c.subject?.fileId?[c.subject.fileId]:[])).filter(id=>P.files.has(id))});
      commits.sort((a,b)=>a.t-b.t);}
    return commits.filter(c=>c.t<=i.t&&i.t-c.t<MAX_AGE);}
  let mnSig='',monuments=[];
  function monumentsOf(i){const all=ctx.director.lasting();let sig=`${land.extent.Xc}|${land.extent.Xh}|${M().version}`;for(const l of all)sig+=`|${l.first}:${l.count}`;
    if(sig!==mnSig){mnSig=sig;monuments=[];const P=land.prepared;
      for(const l of all){const s=l.subject||{},ids=s.fileIds||(s.fileId?[s.fileId]:[]);
        for(const tm of new Set([l.first,...(l.times||[])])){const R=rangesAt(P,tm,EASE,cfg);let x=null;const xs=[];
          for(const r of R.ranges){if(s.groupId&&r.id===s.groupId&&!ids.length)xs.push(r.c);for(const f of r.files)if(ids.includes(f.id))xs.push(f.x);}
          if(xs.length)x=xs.reduce((a,b)=>a+b,0)/xs.length;if(x!==null)monuments.push({t:tm,x,kind:l.type==='milestone.achieved'?1:0,count:l.count});}}
      monuments.sort((a,b)=>b.t-a.t);}
    return monuments.filter(m=>m.t<=i.t&&i.t-m.t<MAX_AGE).slice(0,8);}
  // ---- Roads: the present's cross-subsystem dependencies, draped over the land near the front edge -------------------------
  function roadsOf(i){const src=M(),out=[];
    for(const l of src.links.values()){if(!src.alive(l,i.t))continue;const a=files.get(l.a),b=files.get(l.b);if(!a||!b||a.range.id===b.range.id)continue;
      out.push({key:l.key,a,b,born:src.bornAt(l),removed:l.removed});}
    out.sort((x,y)=>y.born-x.born||(x.key<y.key?-1:1));return out.slice(0,MAX_ROADS);}
  // ---- Frame ----------------------------------------------------------------------------------------------------------------
  function writeScene(i){
    const t=i.t,sp=ctx.speed(),tv=i.tview,inten=clamp(i.overrides.intensity??1,.4,1.3);nFx=0;nRib=0;
    // settlements: a light on each file's peak at the front edge, by its state
    const src=M();let validated=0,stressed=0;
    for(const [id,f] of files){const m=src.modules.get(id);if(!m)continue;const st=src.stateAt(m,t),h=crest.get(id)??0;if(st==='validated')validated++;if(st==='stressed')stressed++;
      const c=st==='draft'?V3(pal.highlight,.7):st==='validated'?V3(pal.accent,.8).lerp(V3(pal.valid,.9),.45):st==='stressed'?V3(pal.warning,1.2):V3(pal.accent,1);
      const flick=st==='stressed'?.5+.5*(Math.floor(tv*11+rand(hash(id))*7)%2):1,fl=touches.find(x=>x.fileId===id)?.k||0;
      point([f.x,h+.5,-.4],c,f.alive*flick*inten*(.55+.6*fl),7+2.2*Math.log2(1+f.n)+10*fl,7);point([f.x,h+.5,-.4],c,f.alive*flick*inten*.25,26+4*Math.log2(1+f.n),11);}
    // stakes: each commit's committed ridges (lasting)
    const cms=commitsOf(i);U.uNCm.value=Math.min(16,cms.length);for(let k=0;k<16;k++){const c=cms[cms.length-1-k];if(!c){U.uCm.value[k].set(0,0,0,0);continue;}
      const R=rangesAt(land.prepared,c.t,EASE,cfg),zc=depthAt(c.t),xs=[];for(const r of R.ranges)for(const f of r.files)if(c.files.includes(f.id))xs.push(drawnX(f.x,zc));
      const fresh=Math.exp(-(t-c.t)/1000/sp/6);U.uCm.value[k].set((c.t-ep())/1000,clamp(.35+.9*fresh,0,1.2)*Math.exp(-(t-c.t)/1800000),xs.length?Math.min(...xs):R.left,xs.length?Math.max(...xs):R.right);
      for(const x of xs){const p=[x,groundAt(x,c.t),-zc];ribbon(p,[p[0],p[1]+2.6,p[2]],.07,.07,pal.highlight,.55+.8*fresh,1,.6);point([p[0],p[1]+2.7,p[2]],pal.highlight,.6+1.2*fresh,5,8);}}
    // monuments: a beacon for each verified milestone, a cairn for a refactor (lasting; they travel back with their moment)
    const mns=monumentsOf(i);U.uNMn.value=mns.length;for(let k=0;k<8;k++){const m=mns[k];if(!m){U.uMn.value[k].set(0,0,0,0);continue;}
      const p=at3(m.x,m.t,0),hgt=m.kind?24+6*Math.min(3,m.count-1):7,lv=clamp(.6+.4*Math.min(3,m.count));U.uMn.value[k].set(p[0],(m.t-ep())/1000,m.kind,lv);
      ribbon(p,[p[0],p[1]+hgt,p[2]],m.kind?.6:.4,m.kind?.25:.3,pal.accent,.7*lv,1,0);ribbon(p,[p[0],p[1]+hgt*.45,p[2]],m.kind?1.8:1,.4,pal.accent,.25*lv,1,0);
      point([p[0],p[1]+hgt,p[2]],pal.accent,1.2*lv,m.kind?14:8,12);point([p[0],p[1]+.6,p[2]],pal.accent,.9*lv,m.kind?30:16,11);}
    // roads: arcs of light between the two peaks just behind the front edge, pulses running from the importer
    const roads=roadsOf(i),pulse=[],roadK=.16*clamp(Math.sqrt(12/Math.max(1,roads.length)),.3,1);let nr=0;
    for(const r of roads){const life=r.born===-Infinity?1:smooth((t-r.born)/(2400*sp)),gone=r.removed!==null?1-smooth((t-r.removed)/(1600*sp)):1;if(life*gone<=.003)continue;
      const hh=hash(r.key),d=.7+1.6*rand(hh),ya=(crest.get(r.a.id)??0)+.8,yb=(crest.get(r.b.id)??0)+.8,span=Math.abs(r.b.x-r.a.x),lift=Math.abs(ya-yb)*.5+2.2+span*.045;let prev=null;
      const m=src.modules.get(r.a.id),fired=m?Math.max(m.lastAgent,m.lastHuman):-Infinity,pa=Number.isFinite(fired)?(t-fired)/1000/sp:Infinity;
      for(let s2=0;s2<=ROAD_SEG;s2++){const u=s2/ROAD_SEG;if(u>life+1e-6)break;const p=[lerp(r.a.x,r.b.x,u),lerp(ya,yb,u)+Math.sin(u*Math.PI)*lift,-d-Math.sin(u*Math.PI)*1.2];
        if(prev)ribbon(prev,p,.09,.09,pal.accent,roadK*gone*inten,1,1);prev=p;
        if(pa<4&&Math.abs(u-clamp(pa/1.6))<.6/ROAD_SEG)pulse.push(p);}
      // where it lands, a small glow on the imported peak
      if(life>=1)point([r.b.x,yb,-.6],pal.accent,.35*gone*inten,9,8);nr++;}
    for(const p of pulse)point(p,pal.accent,1.4*inten,12,8);
    // the scan and the fault: light on the covered ridges' peaks; a fault's sparks
    for(const x of near(faults,i,4000)){const a=(t-x.at)/1000/sp;for(const id of x.files){const f=files.get(id);if(!f)continue;const h=crest.get(id)??0,r=rand(hash(`${x.at}/${id}`));
      for(let k=0;k<6;k++){const q=(a*1.7+k/6+r)%1,ang=(r+k*.17)*TAU;point([f.x+Math.cos(ang)*q*3,h+.6+q*2.4-q*q*3,-.6-Math.sin(ang)*q*2],pal.warning,(1-q)*1.6*Math.exp(-a*.6)*x.s,5,8);}}}
    // motes over the land (ambient)
    const nm=Math.round(MOTES*.4*clamp(num(atm.motes,.7),0,1.6)*clamp(i.overrides.atmosphere??1,0,2)/1.6*QUALITY[clamp(Math.round(i.quality||0),0,3)].motes),cx=(present.left+present.right)/2,wd=Math.max(60,present.right-present.left);
    for(let k=0;k<nm;k++){const r1=rand(hash(`mote/${seed}/${k}`)),r2=rand(hash(`mote/${seed}/${k}/b`)),r3=rand(hash(`mote/${seed}/${k}/c`)),ph=r3*TAU;
      const x=cx+(r1-.5)*wd*1.3+Math.sin(tv*.05+ph)*4,d=5+Math.pow(r2,1.6)*150+Math.sin(tv*.04+ph*1.3)*3,y=groundAt(x,t-ageOf(d,cfg))+1.5+5*r3+Math.sin(tv*.3+ph)*.8;
      point([x,y+4,-d],pal.highlight,(.2+.2*Math.sin(tv*.7+ph*3))*.45,1.5+1.5*r3,8);}
    lastStats={validated,stressed,roads:nr,commits:cms.length,monuments:mns.length};
  }
  // ---- Digital life: living light on the land of time (life/terrain.js; only when the recipe has it on) --------------
  // The ecosystem lives in the land's layout frame: each inhabitant is drawn at its layout x on the drawn (meandered)
  // land at its depth, standing on the drawn ground (grazers and gleaners: the land's rows, its relief and the agents'
  // domes, as the vertex shader raises them) or flying over the present's profile (swifts). The fields come into the
  // land's shader (withLife). Three kinds of light, small beside the settlements: grazers pale and warm, brighter as
  // they graze, dim as they rest and the land carries them back; swifts fine cool points with short streaks of their
  // flight; gleaners faint amber embers in the past. Everything the ecosystem draws fades into the haze with its depth
  // and is scaled by the view's fadeIn (generation crossfades, restoring). Presentation only reads the ecosystem:
  // quality decides how many followers (bodies on the leader's own path) and streak segments are drawn, never what
  // lives. Two draw calls (points, streaks) with the world's own light materials.
  const lifePart=LIFE?(()=>{
    LIFE.create(createTerrainGrammar({cfg}));
    const FOLLOW=[[2,2,0],[1,2,0],[1,1,0],[0,0,0]],STREAK=[3,3,2,1],H2=[0,0],P3=[0,0,0],P4=[0,0,0],Q=[0,0,0];
    const COL=[V3(pal.highlight.clone().lerp(pal.accent,.35),1),V3(pal.highlight.clone().lerp(pal.primary,.3),1),V3(pal.accent.clone().lerp(pal.warning,.12),1)];
    const GRAZE=V3(pal.highlight.clone().lerp(pal.accent,.6),1.15);
    const lp=pointBuffersOf({fC:4,fS:3},2048),lr=instancedBuffersOf(quad,{rA:4,rB:4,rC:4,rD:4});
    add(new THREE.Points(lp.geometry,fxMat),5);add(new THREE.Mesh(lr.geometry,ribMat),4);
    let ftex=null,texEco=null,texTick=-1,profRef=null,profMax=null,nP=0,nR=0;
    // The inhabitants' light on the land: each awake grazer and gleaner a soft pool in a map over the frame, at its
    // interpolated place, drawn into the land by its shader (uLifeL). Presentation only, rebuilt every frame.
    const LMX=256,LMZ=128,lmBuf=new Float32Array(LMX*LMZ),lmPx=new Uint8Array(LMX*LMZ),KR=2,KW=[];
    for(let dz=-KR;dz<=KR;dz++)for(let dx=-KR;dx<=KR;dx++)KW.push(Math.exp(-(dx*dx+dz*dz)/2.2));
    const lmTex=new THREE.DataTexture(lmPx,LMX,LMZ,THREE.RedFormat,THREE.UnsignedByteType);lmTex.magFilter=lmTex.minFilter=THREE.LinearFilter;lmTex.needsUpdate=true;U.uLifeL.value=lmTex;
    function glowAt(x,z,a){const i0=Math.round((x+LIFE_RN)/(2*LIFE_RN)*LMX-.5),j0=Math.round((z-LIFE_Z0)/(LIFE_Z1-LIFE_Z0)*LMZ-.5);if(i0<-KR||j0<-KR||i0>=LMX+KR||j0>=LMZ+KR)return;
      let k=0;for(let dz=-KR;dz<=KR;dz++){const j=j0+dz;for(let dx=-KR;dx<=KR;dx++,k++){const i=i0+dx;if(i>=0&&j>=0&&i<LMX&&j<LMZ)lmBuf[j*LMX+i]+=a*KW[k];}}}
    const statsNow={drawn:0,followers:0,trailSegments:0,drawCalls:2,awake:0,asleep:0,grazing:0};
    function pt(x,y,z,c,a,px,shape,world){if(nP>=lp.capacity)lp.ensure(nP+1);const P=lp.arrays.position,C=lp.arrays.fC,S=lp.arrays.fS,o=nP*3,o4=nP*4;
      P[o]=x;P[o+1]=y;P[o+2]=z;C[o4]=c.x;C[o4+1]=c.y;C[o4+2]=c.z;C[o4+3]=a;S[o]=px;S[o+1]=shape;S[o+2]=world;nP++;}
    function seg(a,b,w,c,alpha,aa,ab){if(nR>=lr.capacity)lr.ensure(nR+1);const A=lr.arrays.rA,B=lr.arrays.rB,C=lr.arrays.rC,D=lr.arrays.rD,o=nR*4;
      A[o]=a[0];A[o+1]=a[1];A[o+2]=a[2];A[o+3]=w;B[o]=b[0];B[o+1]=b[1];B[o+2]=b[2];B[o+3]=w*.6;C[o]=c.x;C[o+1]=c.y;C[o+2]=c.z;C[o+3]=alpha;D[o]=aa;D[o+1]=ab;D[o+2]=0;D[o+3]=0;nR++;}
    // The present's profile across the frame, as a ceiling to fly over: the highest ground within a few lanes (swifts).
    function ceilingOf(prof){const n=prof.length,out=new Float32Array(n);for(let j=0;j<n;j++){let m=0;for(let d=-5;d<=5;d++){const v=prof[Math.max(0,Math.min(n-1,j+d))];if(v>m)m=v;}out[j]=m;}return out;}
    const ceiling=(x)=>{if(!profMax)return 0;const n=profMax.length,u=(x+LIFE_RN)/(2*LIFE_RN)*n-.5,j=Math.max(0,Math.min(n-2,Math.floor(u))),f=clamp(u-j);return profMax[j]+(profMax[j+1]-profMax[j])*f;};
    // Where an ecosystem point is drawn: its layout x on the drawn land at depth z (the meander's inverse, as drawnX),
    // and the drawn ground there (rows, relief, the agents' domes).
    let kx=1,warp=1,tNow=0,e0=0;
    function landX(xe,z){const xl=xe/kx;let x=xl;for(let k=0;k<2;k++)x=xl-meanderAt(x,z,warp);return x;}
    function ground(xl,xd,z){const zc=Math.max(0,z),tp=tNow-ageOf(zc,cfg);land.height(xl,tp,tNow,e0,H2);let h=H2[0]+reliefHeight(xd,zc,clamp(H2[1],0,2));
      for(let k=0;k<U.uNTch.value;k++){const T=U.uTch.value[k];if(!(T.w>0))continue;const dk=cfg.L*Math.log1p(Math.max(U.uNow.value-T.y,0)/(cfg.tau/1000)),rx=xd-T.x,rz=zc-dk;h+=T.w*Math.exp(-(rx*rx+rz*rz)/(T.z*T.z));}
      return h;}
    const hide=()=>{lp.commit(0);lr.commit(0);if(U.uLifeX)U.uLifeX.value.y=0;Object.assign(statsNow,{drawn:0,followers:0,trailSegments:0,awake:0,asleep:0,grazing:0});};
    function update(i){
      const v=i.life,eco=v&&v.eco;if(!eco||v.restoring)return hide();
      if(texEco!==eco){ftex?.dispose();ftex=lifeFieldTexture(THREE,eco,{scale:[2.4,3,3,5]});texEco=eco;texTick=-1;U.uLifeF.value=ftex.texture;}
      if(texTick!==eco.tick){ftex.update();texTick=eco.tick;}
      const data=eco.siteData;if(data?.prof!==profRef){profRef=data?.prof||null;profMax=profRef?ceilingOf(profRef):null;}
      const sp=ctx.speed(),M=musicLook(eco,v),q=clamp(Math.round(i.quality||0),0,3),alpha=v.alpha,tv=i.tview,inten=clamp(i.overrides.intensity??1,.4,1.3);
      kx=kxOf(present.left,present.right);warp=U.uWarp.value;tNow=i.t;e0=ep();
      // (the paths fade in replays faster than the life can follow the land: they would slide over its contours)
      U.uLifeX.value.set(kx,v.fadeIn,Math.min(1,(SPEED_MAX/Math.max(sp,1e-3))**2)*Math.min(1.8,M.trail),M.life);
      const hazeK=Math.max(U.uHazeK.value,.2),haze=z=>(1-clamp(1-Math.exp(-Math.pow(Math.max(0,z)/(Zmax*.6/hazeK),1.8))))*Math.exp(-Math.max(0,z-45)/55);
      const MB=M.bright,MS=M.size,F=FOLLOW[q];nP=0;nR=0;let drawn=0,fol=0,awake=0,asleep=0,grazing=0;
      const K=eco.K,head=eco.trailHead;lmBuf.fill(0);
      for(let e=0;e<eco.capacity;e++){
        const vis0=lifeVisibility(eco,e,v);if(vis0<=.003)continue;const s=eco.sp[e];
        if(s===GRAZER){if(eco.ia[e*2+1]===1){asleep++;continue;}awake++;}
        lifePosition(eco,e,alpha,P3);const z=P3[2],vis=vis0*haze(z)*inten;if(vis<=.003)continue;
        const xl=P3[0]/kx,xd=landX(P3[0],Math.max(0,z)),m=eco.mode[e];drawn++;
        if(s===SWIFT){
          const y=ceiling(P3[0])+2+P3[1],b=vis*MB;pt(xd,y,-z,COL[1],b,4.5,8,.4*MS);
          // a short streak of its flight (its recorded path, newest first), tapering
          const n=STREAK[q];let a=[xd,y,-z],ab=b;for(let k=1;k<=n;k++){const o=e*K+((head-k+1+K*4)%K),x2=eco.tx[o],z2=eco.tz[o],yb=ceiling(x2)+2+eco.ty[o];
            const bb=[landX(x2,Math.max(0,z2)),yb,-z2],f=1-k/(n+1);seg(a,bb,.07,COL[1],1,ab*.55,b*f*f*.55);a=bb;ab=b*f*f;}
          for(let f=0;f<F[1];f++){if(!lifeFollower(eco,e,f,F[1],alpha,tv,P4,{spread:.9,lag:.9}))break;pt(landX(P4[0],Math.max(0,P4[2])),ceiling(P4[0])+2+P4[1],-P4[2],COL[1],b*.6,3.5,8,.32*MS);fol++;}
          continue;}
        const g=ground(xl,xd,z);
        if(s===GRAZER){
          const old=eco.age[e]>eco.life[e]*.8,orbit=m===2,rest=m===4,carry=eco.carry[e]>0;if(orbit)grazing++;
          const en=Math.min(1,eco.en[e]),b=vis*MB*(orbit?1.5+.6*en:carry?1.4:rest||old?.55:1.1),c=orbit?GRAZE:COL[0],y=g+.45+.35*P3[1];
          pt(xd,y,-z,c,b,8,8,.8*MS);glowAt(P3[0],z,b*.32);
          for(let f=0;f<F[0];f++){if(!lifeFollower(eco,e,f,F[0],alpha,tv,P4,{spread:.6,lag:.7}))break;pt(xd+(P4[0]-P3[0])/kx,y+(P4[1]-P3[1])*.3,-P4[2],c,b*.6,6,8,.6*MS);fol++;}}
        else{// gleaners: a faint ember and its glow on the ground
          const b=vis*MB*.55*(.75+.25*Math.sin(tv*(.6+u01(eco.seed,e,eco.gen[e],3))+u01(eco.seed,e,eco.gen[e],4)*6.28)),y=g+.5+.4*P3[1];
          pt(xd,y,-z,COL[2],b,7,8,.8*MS);glowAt(P3[0],z,b*.7);}
      }
      lp.commit(nP);lr.commit(nR);
      for(let q2=0;q2<lmBuf.length;q2++){const x=lmBuf[q2];lmPx[q2]=x<=0?0:(255*x/(1+x)+.5)|0;}lmTex.needsUpdate=true;
      Object.assign(statsNow,{drawn,followers:fol,trailSegments:nR,awake,asleep,grazing,kx:+kx.toFixed(3)});
    }
    function dispose(){ftex?.dispose();ftex=null;texEco=null;lmTex.dispose();}
    return {update,stats:()=>({...statsNow}),dispose};
  })():null;
  function update(i){
    info=i;const sp=ctx.speed(),qi=clamp(Math.round(i.quality||0),0,3),q=QUALITY[qi];
    const [w,h]=ctx.pipeline.size;U.uPx.value=Math.max(.4,h/1080);U.uRes.value.set(w,h);U.uV.value=i.tview;U.uQ.value=i.quality||0;U.uOct.value=q.oct;
    if(qi!==gridQ){gridQ=qi;landMesh.geometry=gridOf(qi);}
    // the land at t: rows of the history pyramid (computed once per moment), the present again when it changes
    if(land.update(M(),i.t,ep()))tex.needsUpdate=true;
    const X=land.extent,lat=land.lattice;U.uXc.value=X.Xc;U.uXh.value=X.Xh;U.uNow.value=(i.t-ep())/1000;
    for(let l=0;l<LEVELS;l++)U.uLv.value[l].set(lat[l],levelBin(l)/1000,0,0);
    presentAt(i);touches=touchList(i);
    // touches: the ground rises in a dome under the agent's edit, rings of its colour open around it
    for(let k=0;k<4;k++){const x=touches[k],f=x&&files.get(x.fileId);if(!f){U.uTch.value[k].set(0,0,0,0);U.uTchC.value[k].set(0,0,0,0);continue;}
      const c=agentCol[x.seat%8],kk=clamp(x.k,0,1.4)*(x.kind==='edit'?1:.45);U.uTch.value[k].set(drawnX(f.xl,depthAt(x.at)),(x.at-ep())/1000,Math.max(4,cfg.sp*1.3),4.6*kk);U.uTchC.value[k].set(c.r*1.6,c.g*1.6,c.b*1.6,x.age);}
    U.uNTch.value=Math.min(4,touches.length);
    // state: the faults now, the sunrise
    stressNow=0;for(const f of files.values())stressNow=Math.max(stressNow,f.stress);
    sunNow=0;let sunX=0;for(const s of near(sunrises,i,16000)){if(!s.full)continue;const a=(i.t-s.at)/1000/sp;const k=smooth(a/1.5)*(1-smooth((a-9)/5));if(k>sunNow){sunNow=k;sunX=clamp(((centreOf(s.files)??0)-(present.left+present.right)/2)/Math.max(30,present.right-present.left),-.6,.6);}}
    U.uSun.value=sunNow;U.uSunX.value=sunX;U.uStress.value=stressNow;
    const beatMs=60000/tempoOf(i),reactive=clamp(num(MU.reactivity,.6),0,1);U.uBeat.value=i.beat*(.35+.65*num(MU.beatPulse,.4))*reactive;U.uBeatL.value=Math.floor(i.t/beatMs)%4;
    U.uDawn.value=i.unlocks[0]?.level||0;U.uLant.value=i.unlocks[1]?.level||0;bgU.uStars.value=i.unlocks[2]?.level||0;bgU.uAurora.value=i.unlocks[3]?.level||0;
    const atmo=clamp(i.overrides.atmosphere??1,0,2);U.uMist.value=clamp(num(atm.mist,.8),0,1.6)*atmo;U.uHazeK.value=clamp(num(atm.haze,.8),0,1.5)*Math.max(.3,atmo);
    slots(i);writeScene(i);updateAgents(i);fx.commit(nFx);rib.commit(nRib);
    if(lifePart)lifePart.update(i);
  }
  const fwd=new THREE.Vector3(),rightV=new THREE.Vector3();
  function afterCamera(i){camera.updateMatrixWorld();
    // the key light: low, from the side of the land toward the horizon, travelling a slow arc (ambient); the sunrise swings it behind the land
    const la=(i?.tview||0)*.012*clamp(num(mot.light,.6),0,1.6)+rand(seed+3)*TAU,az=-Math.PI/2+.95*Math.sin(la),el=.2+.07*Math.sin(la*1.7+1);
    const k=new THREE.Vector3(Math.cos(az)*Math.cos(el),Math.sin(el),Math.sin(az)*Math.cos(el));
    if(sunNow>0)k.lerp(new THREE.Vector3(U.uSunX.value,.1,-1).normalize(),sunNow).normalize();U.uKey.value.copy(k);
    const warm=clamp(sunNow+.35*U.uDawn.value);U.uKeyC.value.copy(V3(keyC,.9)).lerp(V3(pal.accent,1.2),warm);
    bgU.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);bgU.uCam.value.copy(camera.position);}
  function background(){return sky;}
  function grade(i){
    const inten=i.overrides.intensity??1,sec=i.mood?.section,sp=ctx.speed();
    let flash=0;for(const s of sunrises){const a=(i.t-s.at)/1000/sp;if(s.full&&a>=0&&a<3)flash+=.04*Math.exp(-a*1.5)*(s.grand?1.6:1);}
    let ex=0;for(const e of horizons){const a=(i.t-e.at)/1000/sp;if(a>=0&&a<6)ex+=.04*e.s*smooth(a/.6)*Math.exp(-a*.5);}
    const tint=new THREE.Vector3(1,1,1);if(sec==='tension')tint.set(1.03,.98,.99);else if(sec==='resolve')tint.set(.98,1.01,1.03);
    tint.lerp(new THREE.Vector3(.95,.96,1.06),stressNow*.5);
    return {tonemap:'agx',bloom:clamp(num(LT.bloom,1),.3,2)*.6*(1+.5*sunNow+.1*(i.activity||0)),threshold:clamp(num(LT.bloomThreshold,.65),.5,.9)*1.45,
      exposure:(1+(clamp(num(LT.exposure,1.05),.4,2.2)-1)*.5)*1.1*(1-.08*stressNow)*(1+.18*sunNow+ex)*(sec==='breath'?.97:sec==='lift'?1.03:1),
      contrast:clamp(num(LT.contrast,1),.85,1.3)*1.06,saturation:1.08*(1-.22*stressNow),vignette:num(LT.vignette,.3)*1.2,grain:num(LT.grain,.025)*.5,
      flash:flash*inten,tint,aberration:.0015,bloomTint:{x:1,y:.95,z:.9},streak:.06};
  }
  // ---- Camera: the present's front edge and the land behind it; close to what changed; vantage points while idle ----------
  const baseAz=Math.PI/2+(rand(seed+11)<.5?-1:1)*(.5+.25*rand(seed+12)),tmp=new THREE.Vector3();
  const VANTAGE={survey:{el:.44,back:.7},valley:{el:.24,back:.9},map:{el:1.05,back:.6}};
  function cameraGoal(i){
    const fov=clamp(num(cam.fov,34),20,55),half=fov*Math.PI/360,aspect=camera.aspect||16/9,motion=clamp(i.overrides.motion??1,0,2),drift=clamp(num(cam.drift,.7),0,1.6);
    const L0=present.left,R0=present.right,wd=Math.max(40,R0-L0)+16,cx=(L0+R0)/2,hx=Math.atan(Math.tan(half)*aspect);
    const own=VANTAGE[cam.personality]||VANTAGE.survey;let el=lerp(own.el,clamp(num(cam.elevation,.4),.05,1.2),.35),back=own.back;
    // idle: the camera travels between the vantage points (ambient; work and events end it)
    const idle=clamp(1-(i.activity||0)*6),cyc=i.tview/170,ph=cyc-Math.floor(cyc),order=['survey','valley','map'],next=VANTAGE[order[(order.indexOf(cam.personality)+1+Math.floor(cyc))%3]]||own;
    const dip=idle*Math.pow(Math.sin(ph*Math.PI),2)*clamp(num(mot.drift,.7),0,1.5)*.9;el=lerp(el,next.el,dip);back=lerp(back,next.back,dip);
    // A portrait frame (a vertical clip): time runs up the frame. The camera looks down more steeply, so the present's
    // front edge spans the width at the bottom and the past recedes toward the top, and stands a little closer, since the
    // width fit above already counts the narrow frame (the host leaves its field of view alone: framesPortrait).
    const portrait=aspect<1;if(portrait){el=Math.max(el,.74);back=Math.max(back,1.05);}
    let distance=Math.max(wd*.62/Math.tan(hx),peak*5.5)*clamp(num(cam.distance,1),.6,1.6)*lerp(1.02,.9,smooth((el-.3)/.7))*(portrait?.82:1);
    const target=new THREE.Vector3(cx,peak*.25,-wd*back*.6);
    let az=baseAz+Math.sin(i.tview/150)*.22*drift*motion*(1-.6*smooth((el-.6)/.4));
    // what changed is seen up close: the front edge where it happened. An agent's edit (its touch raising the ground) is
    // this world's signature moment: a medium close-up that only a failure, a recovery or a milestone overrides.
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;let k=0;
    const major=att&&since<12&&(att.tier>=3||att.intent==='validation.failed'||att.intent==='validation.recovered');
    const tch=touches.find(x=>x.kind==='edit'&&x.k>.2&&files.has(x.fileId));
    if(tch&&!major){const f=files.get(tch.fileId),kt=smooth(tch.age/.5)*(1-smooth((tch.age-2.6)/.6));k=kt;
      target.lerp(tmp.set(f.x,(crest.get(tch.fileId)??0)*.7,-7),.75*kt);distance=lerp(distance,Math.min(distance,Math.max(85,wd*.34)),kt);el=lerp(el,.38,.6*kt);}
    else if(att&&since<12){const p=attentionPoint(att);if(p){k=smooth(since/1.3)*(1-smooth((since-8)/4))*clamp(i.overrides.intensity??1,.4,1)*.85;
      target.lerp(p,k*.7);distance=lerp(distance,Math.min(distance,Math.max(120,wd*.5)),k);el=lerp(el,.4,k*.5);}}
    if(k<.01){const busy=i.agents.map(a=>workOf(a,i.t)).find(Boolean);
      if(busy&&files.has(busy)){const f=files.get(busy);target.lerp(tmp.set(f.x,(crest.get(busy)??0)*.6,-6),.45);distance=lerp(distance,Math.min(distance,Math.max(110,wd*.55)),.5);}}
    if(sunNow>0)distance*=1+.15*sunNow;
    return {target,distance,azimuth:az,elevation:el,fov,omega:k>.01?1.1:.5};
  }
  function attentionPoint(c){const s=c.subject||{};let x=null;
    if(s.fileId&&files.has(s.fileId))x=files.get(s.fileId).x;
    else if(s.groupId){const r=present.ranges.find(q=>q.id===s.groupId);if(r)x=r.cd;}
    if(x===null)x=centreOf(s.fileIds);
    if(x===null||x===undefined)return null;return new THREE.Vector3(x,groundAt(x,info.t)*.6,-5);}
  // ---- Words -------------------------------------------------------------------------------------------------------------
  const role=id=>M().districts.get(id)?.role||model.districts.get(id)?.role||'logic';
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  const milestoneWords=c=>(c.detail?.kinds||[]).map(x=>MILESTONE[x]||x).join(' · ');
  const sunriseOf=c=>sunrises.find(s=>s.at===c.at);
  const plural=(n,w,ws=`${w}s`)=>`${n} ${n===1?w:ws}`;
  const rangeOfFile=id=>files.get(id)?.range?.id||null;
  function describe(c,i){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=attentionPoint(c)||new THREE.Vector3((present.left+present.right)/2,peak*.5,-5);
    switch(c.intent){
      case 'subsystem.created':return {text:'A new range rises',sub:s.groupId?`${ctx.name(s.groupId)} · ${role(s.groupId)}`:'',position:pos};
      case 'module.created':return {text:'A new ridge rises at the front edge',sub:s.groupId?`${ctx.name(s.groupId)}`:'',position:pos};
      case 'structure.created':return {text:'The ridge grows',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','component').replace('api.route','route')}`).join(' · ')||plural(d.count||1,'symbol'),position:pos};
      case 'structure.removed':return {text:'The ridge erodes',sub:'structure removed',position:pos};
      case 'subsystem.connected':{const a=s.fileId?rangeOfFile(s.fileId):null,b=s.targetId?rangeOfFile(s.targetId):null;
        return {text:d.first?'Integration · a road of light links two ranges':'The road between two ranges carries more',sub:a&&b?`${ctx.name(a)} → ${ctx.name(b)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · a fault opens under ${plural(n,'peak')}`,sub:'observed failing run',position:pos,color:'#ff7a8a'};
      case 'validation.passed':return {text:`Tests pass · a scan crosses ${plural(n,'peak')}`,sub:'observed passing run',position:pos,color:'#8dffd8'};
      case 'validation.recovered':return {text:'Recovered · the fault heals',sub:'the tests pass again',position:pos,color:'#8dffd8',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the land settles',sub:`${plural(d.removedSymbols||0,'symbol')} removed`,position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=milestoneWords(c),st=sunriseOf(c);return {text:`${st?.full?'Sunrise':'A glow over the range'} · ${k}`,sub:'verified by a passing test run · a monument remains',position:pos,banner:k,bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:n?`Committed · ${plural(n,'stake')} on the survey line`:'Committed · a survey line is drawn',sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The land reaches further · chapter ${d.chapter}`,sub:'accumulated structure',position:pos};
      case 'agent.collision':return {text:'Two agents meet over one range',sub:(d.providers||[]).map(id=>presence(id).display).join(' · '),position:pos};
      default:return null;}}
  function agentPosition(id){return agentState.get(id)?.pos||null;}
  function agentColor(a){return '#'+agentCol[seatOf(a)].getHexString();}
  // Labels at each range's crest on the front edge.
  function subsystemLabels(){return present.ranges.map(r=>{let h=0;for(const f of r.files)h=Math.max(h,crest.get(f.id)??0);
    return {position:new THREE.Vector3(r.cd,h+4,-1.5),text:ctx.name(r.id),sub:`${role(r.id)} · ${plural(r.files.length,'file')}`};});}
  function status(){const s=lastStats;return s.stressed?`${plural(s.stressed,'peak')} on a fault`:s.validated?`${s.validated} validated`:'';}
  function pick(x,y,cm){let best=null,bd=.05;const v=new THREE.Vector3();
    for(const [id,f] of files){v.set(f.x,(crest.get(id)??0)+.5,-.4).project(cm);const d=Math.hypot(v.x-x,(v.y-y)*.7);if(v.z<1&&d<bd){bd=d;best=id;}}
    if(!best)for(const r of present.ranges){v.set(r.cd,peak*.4,-6).project(cm);const d=Math.hypot(v.x-x,(v.y-y)*.7);if(v.z<1&&d<bd*2.5){bd=d/2.5;best=`r:${r.id}`;}}
    return best;}
  function inspect(id,i){if(!id)return null;
    if(id.startsWith('r:')){const r=present.ranges.find(q=>q.id===id.slice(2));if(!r)return null;return {position:new THREE.Vector3(r.cd,peak*.4,-6),text:`${ctx.name(r.id)} · a range of the land`,sub:`${role(r.id)} · ${plural(r.files.length,'file')}`};}
    const f=files.get(id),m=M().modules.get(id);if(!f||!m)return null;let roads=0;for(const r of roadsOf(i||info))if(r.a.id===id||r.b.id===id)roads++;
    return {position:new THREE.Vector3(f.x,(crest.get(id)??0)+.5,-.4),text:`A peak of ${ctx.name(f.range.id)} · ${M().stateAt(m,(i||info).t)}`,sub:`${plural(Math.round(f.n),'symbol')} · ${plural(roads,'road')}`};}
  function stats(){const X=land.extent;return {ranges:present.ranges.length,files:files.size,history:!!hist,rows:land.computed,extent:+X.Xh.toFixed(1),width:+(present.right-present.left).toFixed(1),peak:+peak.toFixed(1),
    touches:touches.length,roads:lastStats.roads||0,commits:lastStats.commits||0,monuments:lastStats.monuments||0,sunrises:sunrises.filter(s=>s.full).length,lastSunrise:sunrises.length?(sunrises.at(-1).full?'sunrise':'local'):null,
    fault:+stressNow.toFixed(2),fx:nFx,ribbons:nRib,grid:QUALITY[gridQ].nx*QUALITY[gridQ].nz};}
  function rebuild(){hist=null;land.reset();cmSig='';mnSig='';}
  function dispose(){const objs=[];scene.traverse(o=>{if(o!==scene)objs.push(o);});for(const o of objs){scene.remove(o);o.material?.dispose?.();}
    for(const g of grids.values())g.dispose();for(const x of disposables)x.dispose?.();lifePart?.dispose();}
  // After a seek: no transient survives (commits and monuments come back from the model and the director's record).
  function onPrime(){for(const l of [scans,faults,heals,surveys,sunrises,glows,horizons])l.length=0;agentState.clear();cmSig='';mnSig='';}
  // A replay's recorded windows (the host after a seek, or when this world loads into a replay): the land's history.
  function onHistory(entries,t){hist=historyFrom(entries,t);land.reset();cmSig='';mnSig='';}
  function onDelta(d,s,e){hist?.applyDelta(d,s,e);}
  function onCue(c,t){if(hist)recordCue(hist,c,t);}
  // Composition anchors (layers.js): the land, its ranges, the peaks at the front edge. Read-only.
  const composeA={center:new THREE.Vector3(),extent:14,subsystems:[],active:{pos:new THREE.Vector3()},nodes:[],boundary:{radius:16,y:0}};
  function composeAnchors(i){const cx=(present.left+present.right)/2,wd=Math.max(20,present.right-present.left);composeA.center.set(cx,peak*.3,-wd*.2);composeA.extent=wd*.5;composeA.boundary.radius=wd*.6;composeA.boundary.y=0;
    composeA.subsystems=present.ranges.map(r=>({id:r.id,pos:new THREE.Vector3(r.cd,peak*.4,-4),size:Math.max(1,r.w*.5)}));
    composeA.nodes=[...files.values()].slice(0,64).map(f=>({pos:new THREE.Vector3(f.x,(crest.get(f.id)??0)+.5,-.4)}));
    const att=i?ctx.director.attentionAt(i.t,1):null;composeA.active.pos.copy((att&&attentionPoint(att))||composeA.center);return composeA;}
  return {framesPortrait:true,rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime,onHistory,onDelta,onCue,
    compose:{camera,scene,anchors:composeAnchors},...(lifePart?{lifeStats:lifePart.stats,onLifeParams(){}}:{})};
}

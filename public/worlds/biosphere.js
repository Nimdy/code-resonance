// Fractal Biosphere: the software as a bioluminescent ecosystem grown by the code.
//
// Data -> image (no decoration claims engineering work; the grammar is in biosphere-growth.js):
//  - subsystem (district) -> an organism rooted at its persisted site, a recursive structure of its folders, files and
//                            symbols; its species from its own role and data (interface: a sea fan, tests and types: a
//                            crystal tree, services and flowing code: kelp, folder-rich code: a fern colony, heavily
//                            cross-linked code: mycelium; the genome's species is the world's dominant one)
//  - folder / file / symbol -> limb / branch / crown (or stem / frond / pinna, stipe / blade, cord / mushroom / satellite);
//                            a crown is the organism's own branching rule repeated one scale down (a fan of fans,
//                            shards bearing shards); symbol kinds colour their crowns and only symbols carry a light
//  - material state       -> draft: pale new growth; committed: mature; validated: brighter; stressed: blight (colour
//                            drained, leaves curl and rust, dull embers in the bark) on exactly the failing files
//  - repaired file        -> fresh leaves open at its tip and stay (a lasting sign of the recovery, from the states)
//  - dependency           -> across organisms a braided mycelial cord on the ground; inside one a faint silk thread
//  - agent                -> a firefly swarm (or pollinators) gathered at the branch it reads or edits
//  - lasting milestones   -> a phyllotactic fractal flower (milestone) or crystalline star (refactor) on the organism,
//                            kept and accumulated around its crown for the project's whole life; ambient unlocks add
//                            fireflies, drifting petals, brighter veins and a bioluminescent tide
// Ambient life (never progress): one current sways everything, one slow band of light climbs every organism, the finest
// tips breathe, light breathes on the recipe's period, caustics drift over the floor and the surface, motes drift in
// slowly migrating shafts of light and in the glow around each crown. A file an agent or a person is touching glows
// (model data: lastHuman / lastAgent); that is observation, never an effect.
import {THREE,BACKGROUND_VS,clamp,lerp,smooth,easeOut,hash,rand,rng,instancedBuffers,pointBuffers} from './core.js';
import {growForest,growBloom,buildCrown,crownDecay,SPECIES,SEG,LEAF,GLOW,TPL,CROWN_KEYS,CROWN_VARIANTS} from './biosphere-growth.js';
import {COMMON,MAXO,SEG_VS,SEG_FS,CROWN_VS,LEAF_VS,LEAF_FS,GLOW_VS,GLOW_FS,SHAFT_VS,SHAFT_FS,PILLAR_VS,PILLAR_FS,GROUND_VS,GROUND_FS,SKY_FS,withLife,LIFE_PT_VS,LIFE_PT_FS,LIFE_RIB_VS,LIFE_RIB_FS} from './biosphere-glsl.js';
import {biosphereGrammar,POLLINATOR,SPORE,PLANKTON,DRIFTER} from './life/biosphere.js';
import {MODE} from './life/sim.js';
import {position as lifePosition,follower as lifeFollower,fieldTexture as lifeFieldTexture,visibility as lifeVisibility,musicLook} from './life/present.js';
const STATE_INDEX={draft:0,committed:1,validated:2,stressed:3};
const secs=(t,epoch)=>Number.isFinite(t)?(t-epoch)/1000:(t>0?1e6:-1e5);
const num=(x,d)=>Number.isFinite(x)?x:d;
const CROWN_TWIST={fan:.35,shard:1.4,hypha:.3};
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome,P=G.palette;
  const GEO=G.geometry||{},ATM=G.atmosphere||{},MAT=G.material||{},MOT=G.motion||{},CAM=G.camera||{},SEC=G.secondary||{};
  const col=c=>new THREE.Color(c);
  const pal={primary:col(P.primary),secondary:col(P.secondary),accent:col(P.accent),highlight:col(P.highlight),deep:col(P.deep),haze:col(P.haze),warning:col(P.warning),valid:col(P.valid)};
  const seed=recipe.projectSeed>>>0,species=SPECIES[GEO.species]?GEO.species:'coral',terrain=ATM.terrain||'abyss';
  // ---- Environment: always abyssal blue-teal (or night blue), tinted a little by the palette; near black below the
  // horizon so the organisms' own light carries the image -------------------------------------------------------------
  const ENV={abyss:{fog:[.0015,.006,.013],lit:[.022,.08,.13],top:[.003,.016,.03],sun:[.45,.85,1],body:[.006,.01,.015],shafts:1.2,surface:26,caust:1,t:0},
    'forest-floor':{fog:[.0018,.003,.01],lit:[.028,.048,.12],top:[.002,.005,.014],sun:[.7,.8,1],body:[.007,.009,.014],shafts:.9,surface:60,caust:.35,t:1},
    cavern:{fog:[.002,.006,.007],lit:[.05,.1,.085],top:[.001,.003,.003],sun:[.8,.95,.8],body:[.008,.01,.01],shafts:.8,surface:40,caust:.5,t:2}};
  const env=ENV[terrain]||ENV.abyss;
  const tint=(a,k)=>{const h=new THREE.Vector3(pal.haze.r,pal.haze.g,pal.haze.b);const m=Math.max(.05,h.x,h.y,h.z);return new THREE.Vector3(...a).lerp(h.multiplyScalar(Math.max(...a)/m),k);};
  const fogC=tint(env.fog,.12),fogLit=tint(env.lit,.08);
  const acc=new THREE.Vector3(pal.accent.r,pal.accent.g,pal.accent.b),seasonLit=fogLit.clone().lerp(acc.clone().multiplyScalar(Math.max(...env.lit)/Math.max(.05,acc.x,acc.y,acc.z)),.6),seasonFog=fogC.clone().lerp(acc.clone().multiplyScalar(Math.max(...env.fog)/Math.max(.05,acc.x,acc.y,acc.z)),.5);
  // Bioluminescence compresses toward 1 so the catalogue's extremes stay readable (0.2 -> 0.64, 2 -> 1.45).
  const fogK=num(ATM.fog,.7),lum=.55+.45*num(MAT.bioluminescence,1);
  const orgColors=Array.from({length:MAXO},()=>new THREE.Vector4(1,1,1,1)),orgSpecies=Array.from({length:MAXO},()=>new THREE.Vector4(0,1,0,0));
  const orgValue=new Float32Array(MAXO).fill(1);
  const palU=[pal.primary,pal.primary,pal.secondary,pal.accent,pal.highlight,pal.valid].map(c=>new THREE.Vector3(c.r,c.g,c.b));
  const current=num(MOT.current,0);
  const U={uT:{value:0},uV:{value:0},uSpeed:{value:1},uSwayAmp:{value:num(MOT.sway,.9)},uSwayT:{value:0},uFlow:{value:num(MOT.flow,1)},uLum:{value:lum*1.15},uBreath:{value:.12},
    uIntensity:{value:1},uPx:{value:1},uFogD:{value:.007+.011*fogK},uFogH:{value:.35},uFogFar:{value:28},uTurb:{value:.4+.8*num(MOT.turbulence,.6)},uBark:{value:.4+1.6*num(MAT.bark,.45)},uTrans:{value:num(MAT.translucency,.55)},uRoots:{value:.3+1.1*num(G.space?.rootVisibility,.6)},uVeins:{value:0},uCur:{value:new THREE.Vector2(Math.cos(current),Math.sin(current))},
    uLean:{value:new THREE.Vector2()},uRes:{value:new THREE.Vector2(1920,1080)},uOrg:{value:Array.from({length:MAXO},()=>new THREE.Vector4(0,0,1,1))},uOrgB:{value:Array.from({length:MAXO},()=>new THREE.Vector4(1,0,0,0))},
    uBL:{value:Array.from({length:8},()=>new THREE.Vector4(0,0,0,0))},uBLC:{value:Array.from({length:8},()=>new THREE.Vector4(1,1,1,1))},uOrgC:{value:orgColors},uOrgS:{value:orgSpecies},uPal:{value:palU},
    uFogC:{value:fogC.clone()},uFogLit:{value:fogLit.clone()},uLightDir:{value:new THREE.Vector3(0,1,0)},uBody:{value:new THREE.Vector3(...env.body)},
    uWave:{value:Array.from({length:8},()=>new THREE.Vector4(-1,-1e5,1,1))},uWaveC:{value:Array.from({length:8},()=>new THREE.Vector4(0,0,0,1))},uState:{value:null}};
  // Digital life (life/biosphere.js): only when the recipe has it on. Off, nothing differs from the world without it (no
  // resource, no draw call, no uniform, no shader text): every life addition is guarded by LIFE.
  const LIFE=ctx.life||null;
  if(LIFE)Object.assign(U,{uLifeF:{value:null},uLifeO:{value:Array.from({length:MAXO},()=>new THREE.Vector4())},uLifeC:{value:Array.from({length:MAXO},()=>new THREE.Vector4())},uLifeD:{value:Array.from({length:MAXO},()=>new THREE.Vector4())},uLifeB:{value:new THREE.Vector4(0,0,1,1)},uLifeK:{value:0}});
  const SEG_FS_=LIFE?withLife(SEG_FS,'seg'):SEG_FS,GLOW_VS_=LIFE?withLife(GLOW_VS,'glow'):GLOW_VS,LEAF_FS_=LIFE?withLife(LEAF_FS,'leaf'):LEAF_FS,GROUND_FS_=LIFE?withLife(GROUND_FS,'ground'):GROUND_FS;
  // ---- Module state texture (2 texels per module: state, pulse) ----------------------------------------------------
  let stateTex=null,stateData=null;
  function ensureState(n){n=Math.max(1,n);if(stateTex&&stateTex.image.height>=n)return;stateTex?.dispose();
    const h=Math.max(16,1<<Math.ceil(Math.log2(n)));stateData=new Float32Array(2*h*4);
    stateTex=new THREE.DataTexture(stateData,2,h,THREE.RGBAFormat,THREE.FloatType);stateTex.minFilter=stateTex.magFilter=THREE.NearestFilter;stateTex.needsUpdate=true;U.uState.value=stateTex;}
  ensureState(16);
  // ---- Branches: two instanced tube meshes (structure: smooth; fine stems and roots: cheaper) ------------------------
  const SEG_LAYOUT={iA:4,iB:4,iC1:4,iC2:4,iT:4,iM:4};
  const tube=(radial,height)=>{const g=new THREE.CylinderGeometry(1,1,1,radial,height,true);g.translate(0,.5,0);g.deleteAttribute('normal');g.deleteAttribute('uv');return g;};
  const thickGeo=tube(10,5),fineGeo=tube(5,2);
  const thick=instancedBuffers(thickGeo,SEG_LAYOUT,512),fine=instancedBuffers(fineGeo,SEG_LAYOUT,1024);
  const segMat=new THREE.ShaderMaterial({uniforms:U,vertexShader:SEG_VS,fragmentShader:SEG_FS_,side:THREE.DoubleSide});
  const thickMesh=new THREE.Mesh(thick.geometry,segMat),fineMesh=new THREE.Mesh(fine.geometry,segMat);
  for(const m of [thickMesh,fineMesh]){m.frustumCulled=false;scene.add(m);}
  // ---- Crowns: one instanced mesh per recursive template (rebuilt only when the level of detail changes) -------------
  const CROWN_LAYOUT={tA:4,tB:4,tC:4,tD:4,tM:4};
  const crownSets={};let crownLite=null;
  function makeCrowns(lite){
    for(const key of CROWN_KEYS){const old=crownSets[key];if(old){scene.remove(old.mesh);old.mesh.geometry.dispose();old.base.dispose();old.material.dispose();}
      const name=key.split(':')[0],C=buildCrown(key,lite,crownDecay(G)),g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(C.pos,3));g.setAttribute('aO',new THREE.BufferAttribute(C.aO,4));g.setAttribute('aS',new THREE.BufferAttribute(C.aS,4));
      g.setAttribute('aP',new THREE.BufferAttribute(C.aP,4));g.setAttribute('aA',new THREE.BufferAttribute(C.aA,1));g.setIndex(new THREE.BufferAttribute(C.index,1));
      const buf=instancedBuffers(g,CROWN_LAYOUT,64);
      const material=new THREE.ShaderMaterial({uniforms:{...U,uCrownD:{value:C.maxD},uTwist:{value:CROWN_TWIST[name]},uTipBreath:{value:name==='fan'?1:.5}},vertexShader:CROWN_VS,fragmentShader:SEG_FS_,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(buf.geometry,material);mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
      crownSets[key]={base:g,buf,material,mesh,count:0};}
    crownLite=lite;
  }
  // ---- Leaves and glows ----------------------------------------------------------------------------------------------
  const leafGeo=new THREE.PlaneGeometry(1,1,1,6);leafGeo.deleteAttribute('normal');leafGeo.deleteAttribute('uv');
  const leaves=instancedBuffers(leafGeo,{lP:4,lD:4,lW:4,lM:4},512);
  const leafMat=new THREE.ShaderMaterial({uniforms:U,vertexShader:LEAF_VS,fragmentShader:LEAF_FS_,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const leafMesh=new THREE.Mesh(leaves.geometry,leafMat);leafMesh.frustumCulled=false;leafMesh.renderOrder=2;scene.add(leafMesh);
  const glows=pointBuffers({gP:4,gG:4,gM:4},512);
  const glowMat=new THREE.ShaderMaterial({uniforms:U,vertexShader:GLOW_VS_,fragmentShader:GLOW_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const glowPoints=new THREE.Points(glows.geometry,glowMat);glowPoints.frustumCulled=false;glowPoints.renderOrder=4;scene.add(glowPoints);
  // ---- Ground ------------------------------------------------------------------------------------------------------
  const moss=pal.primary.clone().lerp(pal.valid,.35);
  const groundU={...U,uScale:{value:200},uCentre:{value:new THREE.Vector2()},uOrgN:{value:0},uMoss:{value:new THREE.Vector3(moss.r,moss.g,moss.b)},
    uWeb:{value:new THREE.Vector3(pal.accent.r,pal.accent.g,pal.accent.b).lerp(new THREE.Vector3(pal.highlight.r,pal.highlight.g,pal.highlight.b),.3)},
    uRipple:{value:Array.from({length:6},()=>new THREE.Vector4(0,0,0,-1e5))},uRippleC:{value:Array.from({length:6},()=>new THREE.Vector4(1,1,1,4))},uUnlock:{value:new THREE.Vector4()},
    uWebK:{value:num(SEC.veins,.7)*(species==='mycelial'?1.6:1)},uTideK:{value:1},uCaustK:{value:env.caust*(.4+.6*num(ATM.lightShafts,.7))}};
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:groundU,vertexShader:GROUND_VS,fragmentShader:GROUND_FS_}));
  ground.frustumCulled=false;ground.renderOrder=-2;scene.add(ground);
  // ---- Light shafts: soft sheets slanting down from the light through the whole scene ----------------------------
  const SHAFTS=9,shaftGeo=new THREE.PlaneGeometry(1,1,1,4);shaftGeo.deleteAttribute('normal');shaftGeo.deleteAttribute('uv');
  const shafts=instancedBuffers(shaftGeo,{sP:4},SHAFTS);const shaftU=Array.from({length:SHAFTS},()=>new THREE.Vector4());
  const shaftBase=num(ATM.lightShafts,.7)*env.shafts*.9;
  const shaftMat=new THREE.ShaderMaterial({uniforms:{...U,uShaftL:{value:30},uShaftK:{value:shaftBase}},vertexShader:SHAFT_VS,fragmentShader:SHAFT_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const shaftMesh=new THREE.Mesh(shafts.geometry,shaftMat);shaftMesh.frustumCulled=false;shaftMesh.renderOrder=8;scene.add(shaftMesh);
  // ---- Columns of light (checkpoints) --------------------------------------------------------------------------------
  const PILLARS=6,pillarGeo=new THREE.PlaneGeometry(1,1,1,8);pillarGeo.deleteAttribute('normal');pillarGeo.deleteAttribute('uv');
  const pillars=instancedBuffers(pillarGeo,{pK:1},PILLARS);for(let k=0;k<PILLARS;k++)pillars.write('pK',k,k);pillars.commit(PILLARS);
  const pillarU={uCol:{value:Array.from({length:PILLARS},()=>new THREE.Vector4(0,0,-1e5,1))},uColC:{value:Array.from({length:PILLARS},()=>new THREE.Vector4())}};
  const pillarMat=new THREE.ShaderMaterial({uniforms:{...U,...pillarU},vertexShader:PILLAR_VS,fragmentShader:PILLAR_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const pillarMesh=new THREE.Mesh(pillars.geometry,pillarMat);pillarMesh.frustumCulled=false;pillarMesh.renderOrder=8;scene.add(pillarMesh);let pillarNext=0;
  // ---- Low mist: two drifting sheets near the ground, lit by the light above and by the organisms' glow (per vertex) --
  const mistGeo=new THREE.PlaneGeometry(2,2,40,40);mistGeo.deleteAttribute('normal');mistGeo.deleteAttribute('uv');
  const mist=instancedBuffers(mistGeo,{mY:4},2);mist.write('mY',0,.5,1,1,.13);mist.write('mY',1,1.6,.6,.55,.71);mist.commit(2);
  const mistMat=new THREE.ShaderMaterial({uniforms:{...groundU,uMistK:{value:.5+.5*fogK},uMistR:{value:30}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${COMMON}uniform vec2 uCentre;uniform float uMistR;uniform int uOrgN;attribute vec4 mY;varying vec3 vW,vGlow;varying vec4 vM;
      void main(){vec3 p=vec3(uCentre.x+position.x*uMistR,mY.x,uCentre.y-position.y*uMistR);vW=p;vM=mY;vec3 glow=vec3(0.);
        for(int i=0;i<MAXO;i++){if(i>=uOrgN)break;vec4 o=uOrg[i];float R=max(1.5,o.z*.6);float d=distance(p.xz,o.xy);glow+=satc(uOrgC[i].rgb)*exp(-d*d/(R*R))*(.6+uOrgS[i].w*2.+uOrgS[i].z*2.);}
        vGlow=glow*(1.-smoothstep(.75,1.,max(abs(position.x),abs(position.y))));gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`${COMMON}uniform float uMistK,uMistR;uniform vec2 uCentre;varying vec3 vW,vGlow;varying vec4 vM;
      void main(){vec2 p=vW.xz;vec2 f=uCur*uV*.05*vM.y;float n=vnoise((p-f)*.05+vM.w*9.)*.7+.35*vnoise((p+f*1.7)*.13+vM.w*5.+uV*.01);
        float dens=smoothstep(-.3,.8,n);float d=length(vW-cameraPosition);vec3 e=(vW-cameraPosition)/max(d,1e-3);
        // A sheet seen edge-on (or near its rim) fades away: no line across the horizon.
        float fade=smoothstep(1.5,6.,d)*(1.-fogAmount(vW))*smoothstep(.04,.22,abs(e.y))*(1.-smoothstep(uMistR*.55,uMistR*.95,length(vW.xz-uCentre)));
        vec3 c=(uFogLit*.25+vGlow*1.6)*dens*vM.z*.11*uMistK*fade*(1.+uBreath*sin(uV*.4+vM.w*5.));
        gl_FragColor=vec4(c,1.);}`});
  const mistMesh=new THREE.Mesh(mist.geometry,mistMat);mistMesh.frustumCulled=false;mistMesh.renderOrder=7;scene.add(mistMesh);
  // ---- Mycelial cords (dependencies) -------------------------------------------------------------------------------
  const RSEG=40;const ribbon=(()=>{const g=new THREE.BufferGeometry(),t=[],side=[],idx=[];
    for(let i=0;i<=RSEG;i++){t.push(i/RSEG,i/RSEG);side.push(-1,1);if(i<RSEG){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    g.setAttribute('position',new THREE.Float32BufferAttribute(new Array((RSEG+1)*2*3).fill(0),3));g.setAttribute('aT',new THREE.Float32BufferAttribute(t,1));g.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));g.setIndex(idx);return g;})();
  const cords=instancedBuffers(ribbon,{cA:4,cB:4,cI:4,cD:4,cCA:3,cCB:3},128);
  const cordMat=new THREE.ShaderMaterial({uniforms:{...U,uTendrils:{value:.3+1.2*num(SEC.tendrils,.75)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${COMMON}attribute float aT,aSide;attribute vec4 cA,cB,cI,cD;attribute vec3 cCA,cCB;varying float vT,vSide,vAl,vKind,vSeed,vW8,vFog,vNew;varying vec3 vC;
      vec3 path(float t){vec3 a=cA.xyz,b=cB.xyz;float kind=cA.w;float L=distance(a.xz,b.xz);
        if(kind<.5){vec3 dir=normalize(b-a+1e-4);vec3 sd=normalize(vec3(-dir.z,0.,dir.x));vec3 p=mix(a,b,t);
          p+=sd*sin(t*3.1416*2.+cI.z*12.)*.05*L*sin(3.1416*t)+vec3(0.,.03+.02*sin(3.1416*t),0.);
          float ph=t*L*1.1+cD.z*2.094+cI.z*6.;p+=(sd*cos(ph)+vec3(0.,1.,0.)*sin(ph)*.6)*.07*(.6+.4*sin(3.1416*t))*step(1.5,cD.w);return p;}
        vec3 ga=grown(a,cA.w-1.),gb=grown(b,cB.w);vec3 pa=ga+sway(ga,cD.x*orgScale(cA.w-1.),cA.w-1.),pb=gb+sway(gb,cD.y*orgScale(cB.w),cB.w);vec3 p=mix(pa,pb,t);p.y-=sin(3.1416*t)*(.15+.12*distance(a,b));return p;}
      void main(){float age=(uT-cI.x)/uSpeed;float grow=clamp(age/2.6,0.,1.);float gone=cI.y<1e5?clamp((uT-cI.y)/uSpeed/1.5,0.,1.):0.;
        vec3 p=path(aT),q=path(min(1.,aT+.02));if(aT>.98)q=p+(p-path(aT-.02));
        vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.),cq=projectionMatrix*viewMatrix*vec4(q,1.);vec2 dir=normalize((cq.xy/cq.w-cp.xy/cp.w)*uRes+1e-5);vec2 nrm=vec2(-dir.y,dir.x);
        float w=(cA.w<.5?3.2:1.1)*uPx*(1.+(1.-smoothstep(0.,3.,age))*1.2);cp.xy+=nrm*aSide*w/uRes*2.*cp.w;gl_Position=cp;
        vT=aT;vSide=aSide;vAl=(aT<=grow?1.:0.)*(1.-gone);vKind=cA.w<.5?0.:1.;vSeed=cI.z;vW8=cI.w;vC=satc(mix(cCA,cCB,aT));
        vFog=1.-fogAmount(p);vNew=(1.-smoothstep(2.,6.,age))*exp(-sq((aT-grow)*12.));}`,
    fragmentShader:`uniform float uV,uFlow,uLum,uTendrils;varying float vT,vSide,vAl,vKind,vSeed,vW8,vFog,vNew;varying vec3 vC;
      void main(){if(vAl<.01)discard;float edge=1.-vSide*vSide;float p=fract(vT*(vKind<.5?3.:2.)-uV*(.12+.08*uFlow)+vSeed);
        float pulse=smoothstep(0.,.2,p)*smoothstep(.6,.2,p);float k=vKind<.5?(.008+pulse*.025)*vW8:(.03+pulse*.15)*vW8*uTendrils;
        // Rhizomes: a dark cord with a dim living core (the light of a new strand runs along it once).
        gl_FragColor=vec4(vC*(edge*edge*k+edge*vNew*2.5)*vAl*vFog*uLum,1.);}`});
  const cordMesh=new THREE.Mesh(cords.geometry,cordMat);cordMesh.frustumCulled=false;cordMesh.renderOrder=1;scene.add(cordMesh);
  // ---- Atmosphere: motes in the shafts and in the glow around each crown (and, when unlocked, fireflies near the
  // organisms and drifting petals), with depth of field: soft discs near the lens, fine points far away -------------
  const moteN=Math.round(420+620*num(ATM.spores,.75)),FLIES=120,PETALN=60,AIRN=moteN+FLIES+PETALN;
  const air=pointBuffers({pI:4},AIRN);
  {const r=rng(hash(`air/${seed}`));
    for(let i=0;i<AIRN;i++){const kind=i<moteN?(r()<.62?0:r()<.9?1:4):i<moteN+FLIES?2:3;air.write('position',i,r(),r(),r());air.write('pI',i,r(),.4+r()*1.4,r()*6.283,kind);}
    air.commit(AIRN);}
  const moteC=fogLit.clone().normalize().lerp(new THREE.Vector3(pal.highlight.r,pal.highlight.g,pal.highlight.b),.45);
  const airMat=new THREE.ShaderMaterial({uniforms:{...U,uBox:{value:new THREE.Vector3(40,14,40)},uBoxC:{value:new THREE.Vector3()},uRise:{value:terrain==='abyss'?-.35:.3},uSpores:{value:num(ATM.spores,.75)},
      uFlies:{value:num(ATM.fireflies,.7)},uUnlock:{value:new THREE.Vector4()},uMotion:{value:1},uShaft:{value:shaftU},uOrgN:{value:0},uFocus:{value:10},uMoteC:{value:moteC},uFlyC:{value:new THREE.Color('#ffd98a').lerp(pal.valid,.3)},uPetalC:{value:pal.secondary.clone().lerp(pal.highlight,.25)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${COMMON}
      uniform vec3 uBox,uBoxC,uMoteC,uFlyC,uPetalC;uniform float uRise,uMotion,uFlies,uFocus;uniform vec4 uUnlock,uShaft[9];uniform int uOrgN;attribute vec4 pI;varying vec3 vC;varying float vA,vK,vR,vBok;
      void main(){float kind=pI.w,sp=pI.y,ph=pI.z,rn=pI.x;float tv=uV*uMotion;vec3 u=position;
        u.y=fract(u.y+tv*uRise*.004*sp*(kind>2.5&&kind<3.5?-1.6:1.));
        vec3 p;vec3 c=uMoteC;float vis=1.,size=1.4;
        if(kind<.5){
          // In a shaft: along its slanting column, within its width; bright where it catches the light.
          int k=int(rn*8.999);vec4 S=uShaft[k];vec3 L=normalize(uLightDir);float drift=sin(uV*.013+S.w*6.)*S.z*.8;vec3 b=vec3(S.x+drift*L.z,0.,S.y-drift*L.x);
          vec3 e1=normalize(cross(L,vec3(0.,1.,0.))),e2=cross(L,e1);float hgt=u.y*uBox.y*1.15;
          vec2 o=vec2(u.x-.5,u.z-.5);o+=vec2(sin(tv*.11*sp+ph),cos(tv*.09*sp+ph*2.))*.08;
          p=b+L*(hgt/max(.3,L.y))+(e1*o.x+e2*o.y)*S.z*1.4;vis=exp(-dot(o,o)*7.)*(.55+.45*sin(uV*.05+S.w*11.));c*=1.2;
        }else if(kind<1.5){
          // Around a crown: a slow halo of motes within one and a half radii, lit by the organism's colour.
          if(uOrgN<1){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}
          int k=int(fract(rn*7.31)*float(uOrgN));vec4 o=uOrg[k];float R=max(1.,o.z*.45)*1.5;vec3 cc=vec3(o.x,o.z*.62,o.y);
          vec3 d=normalize(vec3(u.x-.5,(fract(u.y)-.5)*.8,u.z-.5)+1e-3);float rr=pow(fract(rn*13.7+.37),.4);float a=tv*.03*sp+ph;
          d.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*d.xz;p=cc+d*R*rr+vec3(0.,sin(tv*.13*sp+ph)*.3,0.);
          c=mix(uMoteC,satc(uOrgC[k].rgb),.55);vis=.55*(1.-rr*.6)*(1.+uOrgS[k].w*2.)*step(fract(rn*91.7),.1+.1*float(uOrgN));
        }else if(kind<2.5){
          // Fireflies (unlocked): low around the organisms, blinking.
          if(uOrgN<1){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}
          int k=int(fract(rn*5.17)*float(uOrgN));vec4 o=uOrg[k];float R=max(1.,o.z*.45)*(.7+.9*u.x);float a=ph+tv*.05*sp;
          p=vec3(o.x+cos(a)*R,.3+u.z*o.z*.7,o.y+sin(a)*R)+vec3(sin(tv*.9+ph*5.),sin(tv*1.4+ph*3.)*.4,cos(tv*.8+ph*7.))*.5;
          vis=uUnlock.x*uFlies*pow(max(0.,sin(tv*(.9+sp*.6)+ph*11.)),6.);size=2.6;c=uFlyC*3.;
        }else if(kind<3.5){
          p=uBoxC+(vec3(fract(u.x+tv*uCur.x*.0025*sp),u.y,fract(u.z+tv*uCur.y*.0025*sp))-vec3(.5,0.,.5))*uBox;vis=uUnlock.y*.7;size=3.2;c=uPetalC*.8;
        }else{
          p=uBoxC+(vec3(fract(u.x+tv*uCur.x*.0025*sp),u.y,fract(u.z+tv*uCur.y*.0025*sp))-vec3(.5,0.,.5))*uBox;vis=.05;
        }
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float px=projectionMatrix[1][1]*uRes.y*.5;float z=max(.3,-mv.z);
        // Depth of field: discs in front of the focus, fine points behind it (the light they carry is kept).
        float coc=(max(0.,uFocus-z)/z*12.+max(0.,z-uFocus)/z*1.2)*uPx;float s0=max(1.2*uPx,size*.035*px/z);float ps=s0+coc;
        // Only a few motes near the lens become soft discs (a clean lens, not a dusty one).
        if(ps>5.*uPx&&fract(rn*37.13)>.3)vis=0.;
        gl_PointSize=clamp(ps,1.,(kind>1.5&&kind<2.5?14.:22.)*uPx);vBok=smoothstep(4.,9.,ps);
        vC=c*min(1.,sq(s0/ps)*1.6+.006)*(1.-.5*smoothstep(4.,12.,ps));vK=kind;vR=ph+tv*(.3+sp*.2);
        vA=vis*(1.-fogAmount(p)*.9)*smoothstep(.0,.06,u.y)*smoothstep(1.,.85,u.y)*smoothstep(1.2,3.5,z);}`,
    fragmentShader:`uniform float uSpores;varying vec3 vC;varying float vA,vK,vR,vBok;void main(){vec2 q=gl_PointCoord-.5;float r=dot(q,q)*4.;if(r>1.)discard;
      float g=mix(exp(-r*3.),smoothstep(1.,.8,r)*(.75+.25*smoothstep(.4,.95,r)),vBok);
      if(vK>2.5&&vK<3.5){float c=cos(vR),s=sin(vR);vec2 z=mat2(c,-s,s,c)*q*2.;float m=smoothstep(.5,.3,abs(z.x)*1.8+z.y*z.y*1.2);g=m*.8;}
      gl_FragColor=vec4(vC*g*vA*(vK<1.5||vK>3.5?uSpores*.9:1.),1.);}`});
  const airPoints=new THREE.Points(air.geometry,airMat);airPoints.frustumCulled=false;airPoints.renderOrder=5;scene.add(airPoints);
  // ---- Bursts (pooled emitters: seedling bursts, spore plumes, embers of decay, falling leaves) ----------------------
  const BURSTS=20,PER=96,burstPts=pointBuffers({bD:4,bE:2},BURSTS*PER);
  {const r=rng(hash(`burst/${seed}`));for(let b=0;b<BURSTS;b++)for(let k=0;k<PER;k++){const u=r()*2-1,a=r()*6.283,s=Math.sqrt(1-u*u);const i=b*PER+k;burstPts.write('bD',i,Math.cos(a)*s,Math.abs(u),Math.sin(a)*s,b+r()*.98);burstPts.write('bE',i,r(),r());}burstPts.commit(BURSTS*PER);}
  const burstU={uBA:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(0,0,0,-1e5))},uBB:{value:Array.from({length:BURSTS},()=>new THREE.Vector4())},uBC:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(1,0,1,0))}};
  const burstMat=new THREE.ShaderMaterial({uniforms:{...U,...burstU},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${COMMON}attribute vec4 bD;attribute vec2 bE;uniform vec4 uBA[${BURSTS}],uBB[${BURSTS}],uBC[${BURSTS}];varying vec3 vC;varying float vA;
      void main(){int b=int(bD.w);float r=fract(bD.w);vec4 A=uBA[b],B=uBB[b],C=uBC[b];
        // Each particle leaves at its own moment and speed (no visible lattice).
        float age=((uT-A.w)/uSpeed-bE.x*C.x*.3)/(C.x*(.75+.5*bE.y));
        if(age<0.||age>1.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vA=0.;return;}
        vec3 dir=bD.xyz;float mode=C.y;vec3 p;float fade=1.-age;float wob=sin(age*7.+r*40.)*.12;
        if(mode<.5){p=A.xyz+dir*(1.-pow(1.-age,2.5))*C.z*(.25+.75*r)+vec3(wob,age*age*.5,cos(age*6.+r*30.)*.12);}
        else if(mode<1.5){float spread=C.z*(.18+.5*r*r);p=A.xyz+vec3(dir.x*spread*sqrt(age),age*C.z*(1.4+1.8*bE.y)+dir.y*.25,dir.z*spread*sqrt(age))+vec3(wob,0.,cos(age*5.+r*20.)*.1);p.xz+=uCur*age*age*C.z*.4;fade=sin(3.1416*min(1.,age*1.1));}
        else if(mode<2.5){
          // Embers of decay: few, dull, falling (never a festive cloud).
          if(bE.y>.33){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vA=0.;return;}
          p=A.xyz+vec3(dir.x,0.,dir.z)*C.z*(.3+.5*r)*sqrt(age)+vec3(sin(age*4.+r*20.)*.1,-age*age*C.z*1.4-age*.25,cos(age*3.+r*13.)*.1);fade=(1.-age)*.8;}
        else{p=A.xyz+vec3(dir.x,0.,dir.z)*C.z*.5*age+vec3(sin(age*9.+r*20.)*.15,-age*age*C.z*1.6,cos(age*7.+r*13.)*.15);fade=1.-age*age;}
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float px=projectionMatrix[1][1]*uRes.y*.5;
        gl_PointSize=clamp(B.w*.08*px/max(.4,-mv.z)*(.5+.6*bE.y),1.5,24.*uPx);vC=B.rgb;vA=fade*(1.-fogAmount(p)*.8);}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*(exp(-r*4.)+exp(-r*18.))*vA,1.);}`});
  const burstPoints=new THREE.Points(burstPts.geometry,burstMat);burstPoints.frustumCulled=false;burstPoints.renderOrder=6;scene.add(burstPoints);let burstNext=0;
  // ---- Lasting blooms: phyllotactic flowers (milestones) and crystalline stars (refactors), drawn with the world's
  // materials -----------------------------------------------------------------------------------------------------------
  const bloomSeg=instancedBuffers(fineGeo,SEG_LAYOUT,256),bloomGlow=pointBuffers({gP:4,gG:4,gM:4},128),bloomLeaf=instancedBuffers(leafGeo,{lP:4,lD:4,lW:4,lM:4},256);let bloomCount=0;
  const bloomLeafMesh=new THREE.Mesh(bloomLeaf.geometry,leafMat);bloomLeafMesh.frustumCulled=false;bloomLeafMesh.renderOrder=3;scene.add(bloomLeafMesh);
  const bloomMesh=new THREE.Mesh(bloomSeg.geometry,segMat);bloomMesh.frustumCulled=false;scene.add(bloomMesh);
  const bloomPoints=new THREE.Points(bloomGlow.geometry,glowMat);bloomPoints.frustumCulled=false;bloomPoints.renderOrder=4;scene.add(bloomPoints);
  // ---- Background -------------------------------------------------------------------------------------------------
  const sky=new THREE.ShaderMaterial({uniforms:{...U,uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uTop:{value:new THREE.Vector3(...env.top)},uSun:{value:new THREE.Vector3(...env.sun)},
      uShafts:{value:num(ATM.lightShafts,.7)*env.shafts},uAbyss:{value:terrain==='abyss'?1:0},uSurface:{value:env.surface},uTerrain:{value:env.t},uUnlock:groundU.uUnlock},vertexShader:BACKGROUND_VS,fragmentShader:SKY_FS,depthWrite:false,depthTest:false});
  // ---- Structure ------------------------------------------------------------------------------------------------------
  let forest=null,builtVersion=-1,builtQuality=-1,extent=6,canopyH=4,worldExtent=6;const centre=new THREE.Vector3();
  const orgs=new Map(),orgList=[];
  function copy(buf,packed,stride,names){const n=packed.length/stride;buf.ensure(n);
    names.forEach((name,a)=>{const arr=buf.arrays[name];for(let i=0;i<n;i++){const o=i*stride+a*4,t=i*4;arr[t]=packed[o];arr[t+1]=packed[o+1];arr[t+2]=packed[o+2];arr[t+3]=packed[o+3];}buf.dirty(name);});
    buf.commit(n);return n;}
  const SEG_NAMES=['iA','iB','iC1','iC2','iT','iM'],CROWN_FIELDS=['tA','tB','tC','tD','tM'];
  const counts={thick:0,fine:0,crowns:0,far:0,leaves:0,glows:0,cords:0};
  // The establishing composition (from the organisms' rest sizes; it changes only when the structure does).
  let comp=null;const Sof0=o=>.7+.17*Math.log2(1+o.members.length);
  function compose(){
    const fov=num(CAM.fov,38),tanV=Math.tan(THREE.MathUtils.degToRad(fov)/2),aspect=camera.aspect||16/9,tanH=tanV*aspect;
    const list=orgList.filter(o=>o.removed>=1e5);if(!list.length){comp=null;return;}
    const BEAUTY={coral:1.5,'crystal-tree':1.25,fern:.6,kelp:.25,mycelial:.3},mass=o=>{const S=Sof0(o);return Math.pow(o.height*S,1.6)*Math.sqrt(o.radius*S+.6)*(BEAUTY[o.species]||1);};
    const A=list.reduce((a,o)=>!a||mass(o)>mass(a)?o:a,null),SA=Sof0(A),HA=A.height*SA,RA=A.radius*SA;
    const xa0=list.length>1?.36:.18,base=rand(seed)*6.283;let best=null,bs=-Infinity;
    for(let j=0;j<24;j++)for(const s of [-1,1]){
      const phi=base+j*Math.PI/12,V=[Math.cos(phi),Math.sin(phi)],R=[-V[1],V[0]],xa=s*xa0;
      const dA=Math.max(HA*.5/(tanV*.8),RA*1.15/(tanH*(1-Math.abs(xa)*.8)),1.6+HA*.6)*num(CAM.distance,1);
      const C=[A.root[0]-V[0]*dA-R[0]*xa*dA*tanH,A.root[2]-V[1]*dA-R[1]*xa*dA*tanH];let score=0;
      for(const o of list){if(o===A)continue;const w=Math.sqrt(mass(o)),S=Sof0(o),dx=o.root[0]-C[0],dz=o.root[2]-C[1],z=dx*V[0]+dz*V[1],x=dx*R[0]+dz*R[1],r=o.radius*S;
        if(z<dA*.8){const near=z>.3?(Math.abs(x)-r)/(z*tanH):(Math.abs(x)-r>0?9:0);if(near<1.05)score-=2.5*Math.max(w,Math.sqrt(o.height*S)*1.5);continue;}
        const ndc=x/(z*tanH),half=r/(z*tanH);
        if(Math.abs(ndc)<.98)score+=w*(1+.7*clamp(-Math.sign(xa)*ndc+.15))+.5*w*clamp((z-dA)/(extent+2));else score+=.1*w;
        // A near organism cut by the frame's edge is a distraction (it reads as a pole across the image).
        if(Math.abs(ndc)-half<1&&Math.abs(ndc)+half>1)score-=1.2*w*clamp(1.6-(z-dA)/(extent+2));}
      // A sea fan is seen face-on; otherwise prefer the seed's own direction a little.
      if(A.fan)score+=1.4*Math.sqrt(mass(A))*Math.abs(A.fan[0]*V[0]+A.fan[2]*V[1]);
      score-=.004*j;
      if(score>bs){bs=score;best={V,R,xa,dA,A,HA,RA,phi,C,tanV,tanH,aspect};}}
    comp=best;
    // The light: in the upper third of the establishing view, on the side away from the anchor, so its shafts cut
    // through the silhouettes (a pure function of the composition).
    const v=viewOf(1),pitch=-v.el,V=comp.V,R=comp.R,cp=Math.cos(pitch),sp=Math.sin(pitch);
    const f=[V[0]*cp,sp,V[1]*cp],up=[-V[0]*sp,cp,-V[1]*sp],lx=-Math.sign(comp.xa||1)*.42*tanH,ly=.62*tanV;
    comp.light=new THREE.Vector3(f[0]+R[0]*lx+up[0]*ly,f[1]+up[1]*ly,f[2]+R[1]*lx+up[2]*ly).normalize();
    // Brightness budget: the anchor at full light, the others about one stop lower per band of depth behind it.
    const band=Math.max(6,extent*.8);
    for(const o of orgList){const k=o.index%MAXO,dx=o.root[0]-comp.C[0],dz=o.root[2]-comp.C[1],z=dx*V[0]+dz*V[1];
      const b=o===comp.A?1:z<comp.dA?.8:Math.pow(.5,(z-comp.dA)/band);U.uOrgB.value[k].x=clamp(b,.4,1)*(o===comp.A?1:orgValue[k]);}
  }
  // The establishing view for the composition (k: the anchor's current size relative to its rest size).
  function viewOf(k){const A=comp.A,dA=Math.max(1.6,comp.dA*k),crane=CAM.personality==='crane';
    const C=[A.root[0]-comp.V[0]*dA-comp.R[0]*comp.xa*dA*comp.tanH,A.root[2]-comp.V[1]*dA-comp.R[1]*comp.xa*dA*comp.tanH];
    const HA=comp.HA*k,RA=comp.RA*k,low=clamp(1-HA/(RA*1.6));
    // Tall organisms are seen from low, looking up; low wide ones (a fern colony, a mycelial mat) from a little above.
    const yc=lerp(HA*(crane?.36:.26),HA*.8+dA*.12,low),yt=lerp(HA*.52,HA*.3,low);
    return {target:new THREE.Vector3(C[0]+comp.V[0]*dA,yt,C[1]+comp.V[1]*dA),distance:Math.hypot(dA,yt-yc),az:Math.atan2(-comp.V[1],-comp.V[0]),el:Math.atan2(yc-yt,dA)};}
  // Giant far organisms in the haze (the reef / forest goes on beyond the project's own): silhouettes only, no data.
  // Three depth layers (parallax), several forms (fan walls, columns, forks), never behind the anchor's own silhouette.
  function farLayer(lite){
    const out={};if(!comp||!orgList.length)return out;
    const r=rng(hash(`far/${seed}`)),N=lite?7:13,forms=terrain==='cavern'?['shard','hypha','shard']:['fan','shard','fan','hypha'];
    const reach=extent*2.4+34,hz=Math.max(.6,Math.min(1.5,canopyH/5)),fwd=Math.atan2(comp.V[1],comp.V[0]);
    for(let k=0,tries=0;k<N&&tries<N*6;tries++){
      const layer=k%3,name=forms[Math.floor(r()*forms.length)],v=Math.floor(r()*CROWN_VARIANTS)%CROWN_VARIANTS;
      const off=(r()-.5)*2*Math.atan(comp.tanH*1.25),ndc=Math.tan(off)/comp.tanH;
      // The side of the anchor stays clear (its silhouette reads alone against the haze).
      if(Math.abs(ndc-comp.xa)<.38||Math.abs(ndc+Math.sign(comp.xa||1)*.42)<.22)continue;
      const a=fwd+off,d=reach+[8,40,85][layer]+r()*[18,30,40][layer],sc=([11,19,30][layer]+r()*[8,12,16][layer])*hz;
      const column=name==='shard',width=column?.35+.25*r():name==='fan'?1.2+.6*r():.8+.4*r();
      const x=comp.C[0]+Math.cos(a)*d,z=comp.C[1]+Math.sin(a)*d,dir=[(r()-.5)*.2,1,(r()-.5)*.2],l=Math.hypot(...dir);
      const key=`${name}:${v}`;(out[key]||(out[key]=[])).push(x,-sc*.1,z,sc*(column?1.3:1),dir[0]/l,dir[1]/l,dir[2]/l,width,comp.R[0],0,comp.R[1],0,-1e5,1e6,1,column?.3:.4,-1,0,r(),1+8);k++;}
    return out;
  }
  function build(quality){
    const epoch=model.epoch;
    forest=growForest(model,{species,G,epoch,quality,current});
    const lite=quality>=2||model.modules.size>200;if(crownLite!==lite)makeCrowns(lite);
    orgs.clear();orgList.length=0;for(const o of forest.orgs){orgs.set(o.id,o);orgList.push(o);}
    // What a bloom's geometry reads of its organism (blooms on an unchanged organism are kept across rebuilds).
    for(const o of orgList)o.sig=hash(`${o.id}|${o.index}|${o.root}|${o.top}|${o.height}|${o.radius}|${o.crown.map(c=>`${c.p}:${c.dist}`).join(';')}`);
    counts.thick=copy(thick,forest.seg,SEG,SEG_NAMES);counts.fine=copy(fine,forest.fine,SEG,SEG_NAMES);
    counts.leaves=copy(leaves,forest.leaf,LEAF,['lP','lD','lW','lM']);
    counts.glows=copy(glows,forest.glow,GLOW,['gP','gG','gM']);
    ensureState(forest.moduleIds.length);
    // Organism colours: one family of hues per world (the primary, a little toward the accent); organisms differ in
    // saturation and value, accent hues are kept for blooms and events.
    for(const o of orgList){const k=o.index%MAXO,r1=rand(hash(o.id)),r2=rand(hash(o.id)+5),r3=rand(hash(o.id)+9);
      const c=pal.primary.clone().lerpHSL(pal.accent,o.index===0?0:.05+.2*r1),hsl={};c.getHSL(hsl);c.setHSL(hsl.h,clamp(hsl.s*(.55+.45*r2)),hsl.l);
      orgColors[k].set(c.r,c.g,c.b,1);orgValue[k]=.8+.3*r3;U.uOrg.value[k].set(o.root[0],o.root[2],o.height,1);orgSpecies[k].set(o.speciesIndex,SPECIES[o.species].flex,0,0);}
    groundU.uOrgN.value=Math.min(MAXO,orgList.length);airMat.uniforms.uOrgN.value=groundU.uOrgN.value;
    // Frame: centroid weighted by size, extent to the outermost canopy.
    centre.set(0,0,0);let w=0;for(const o of orgList){const k=Math.sqrt(o.members.length);centre.x+=o.root[0]*k;centre.z+=o.root[2]*k;w+=k;}if(w)centre.multiplyScalar(1/w);
    extent=3;canopyH=2;for(const o of orgList){extent=Math.max(extent,Math.hypot(o.root[0]-centre.x,o.root[2]-centre.z)+o.radius);canopyH=Math.max(canopyH,o.height);}
    worldExtent=extent;
    compose();
    const far=farLayer(quality>=2);counts.crowns=0;counts.far=0;
    for(const key of CROWN_KEYS){const set=crownSets[key],own=forest.crowns[key],extra=far[key]||[];
      const all=extra.length?own.concat(extra):own;set.count=copy(set.buf,all,TPL,CROWN_FIELDS);set.mesh.visible=set.count>0;counts.crowns+=own.length/TPL;counts.far+=extra.length/TPL;}
    groundU.uScale.value=Math.max(1500,extent*60);mistMat.uniforms.uMistR.value=extent*1.6+10;groundU.uCentre.value.set(centre.x,centre.z);
    airMat.uniforms.uBox.value.set(extent*2.4+8,Math.max(6,canopyH*1.15),extent*2.4+8);airMat.uniforms.uBoxC.value.set(centre.x,-.5,centre.z);
    buildCords();
    {const r=rng(hash(`shafts/${seed}`));for(let k=0;k<SHAFTS;k++){const a=r()*6.283,d=Math.sqrt(r())*(extent*1.1+2),x=centre.x+Math.cos(a)*d,z=centre.z+Math.sin(a)*d,wd=.8+r()*2.4,sd=r();
      shafts.write('sP',k,x,z,wd,sd);shaftU[k].set(x,z,wd,sd);}shafts.commit(SHAFTS);shaftMat.uniforms.uShaftL.value=Math.max(24,canopyH*4.5);}
    builtVersion=model.version;builtQuality=quality;lastBloomKey='';evCache.clear();
  }
  // Dependencies: across organisms at most three braided strands per pair along the ground (brighter for more links);
  // inside an organism a faint silk thread between the two branches (quieter as they multiply).
  function buildCords(){
    const epoch=model.epoch,pairs=new Map(),inner=[];
    for(const l of model.links.values()){const a=forest.anchors.get(l.a),b=forest.anchors.get(l.b);if(!a||!b)continue;
      if(a.org===b.org)inner.push({l,a,b});else{const key=a.org<b.org?`${a.org}|${b.org}`:`${b.org}|${a.org}`;if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push({l,a,b});}}
    const list=[];
    for(const ps of pairs.values()){ps.sort((x,y)=>(model.bornAt(x.l)-model.bornAt(y.l))||(x.l.key<y.l.key?-1:1));const k=Math.min(2.2,1+.35*Math.log2(ps.length)),n=Math.min(3,ps.length);
      ps.slice(0,n).forEach((x,i)=>list.push({...x,kind:0,strand:i,strands:n,w:k}));}
    inner.sort((x,y)=>rand(hash(x.l.key))-rand(hash(y.l.key)));const quiet=Math.min(1,Math.sqrt(40/Math.max(40,inner.length)));
    for(const x of inner.slice(0,240))list.push({...x,kind:1,strand:0,strands:1,w:quiet});
    cords.ensure(list.length);
    list.forEach(({l,a,b,kind,strand,strands,w},i)=>{const oa=orgList[a.org],ob=orgList[b.org];const born=model.bornAt(l);
      const pa=kind===0?oa.root:a.tip,pb=kind===0?ob.root:b.tip;
      cords.write('cA',i,pa[0],pa[1],pa[2],kind===0?0:1+a.org%MAXO);cords.write('cB',i,pb[0],pb[1],pb[2],b.org%MAXO);
      cords.write('cI',i,Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,l.removed===null?1e6:secs(l.removed,epoch),rand(hash(l.key)),w);
      cords.write('cD',i,a.dist,b.dist,strand,strands);
      const ca=orgColors[a.org%MAXO],cb=orgColors[b.org%MAXO];cords.write('cCA',i,ca.x,ca.y,ca.z);cords.write('cCB',i,cb.x,cb.y,cb.z);});
    counts.cords=list.length;cords.commit(list.length);
  }
  // ---- Sway mirror (must agree with COMMON.sway) ----------------------------------------------------------------
  function swayed(p0,dist0,org){const k=org%MAXO,o=U.uOrg.value[k],S=orgColors[k].w,p=[o.x+(p0[0]-o.x)*S,p0[1]*S,o.y+(p0[2]-o.y)*S],dist=dist0*S,H=Math.max(1,o.z),x=clamp(dist/H,0,2.5),f=x*Math.sqrt(x)*H*.07*U.uSwayAmp.value*orgSpecies[k].y;
    const tv=U.uSwayT.value,d=U.uCur.value,tb=U.uTurb.value,ph=(p[0]*d.x+p[2]*d.y)*.16-tv*.5;
    const a=Math.sin(ph)+tb*(.6*Math.sin(ph*2.3+p[1]*.3+1.7)+.35*Math.sin(tv*1.3+p[0]*.37-p[2]*.29));
    const b=.55*Math.sin(tv*.41+(-d.y*p[0]+d.x*p[2])*.21+p[1]*.17);const mx=d.x*a-d.y*b+U.uLean.value.x,mz=d.y*a+d.x*b+U.uLean.value.y;
    return new THREE.Vector3(p[0]+mx*f,p[1]-.12*Math.hypot(mx,mz)*x*f,p[2]+mz*f);}
  // An organism's current size (its data-driven scale) applied to its rest geometry.
  const Sof=o=>orgColors[o.index%MAXO].w,hOf=o=>o.height*Sof(o),rOf=o=>o.radius*Sof(o);
  const scaled=(o,p)=>{const S=Sof(o);return new THREE.Vector3(o.root[0]+(p[0]-o.root[0])*S,p[1]*S,o.root[2]+(p[2]-o.root[2])*S);};
  const topOf=o=>scaled(o,o.top);
  const anchorPos=id=>{const a=forest?.anchors.get(id);return a?swayed(a.tip,a.dist,a.org):null;};
  const orgOfModule=id=>{const a=forest?.anchors.get(id);return a?orgList[a.org]:null;};
  const orgsOf=ids=>[...new Set((ids||[]).map(id=>forest?.anchors.get(id)?.org).filter(x=>x!==undefined))].map(k=>orgList[k]).filter(Boolean);
  // The organism holding most of a subject's files (ties: the larger organism).
  const mainOrg=ids=>{const n=new Map();for(const id of ids||[]){const a=forest?.anchors.get(id);if(a)n.set(a.org,(n.get(a.org)||0)+1);}let best=null,bn=0;for(const [k,c] of n){const o=orgList[k];if(c>bn||(c===bn&&best&&o.members.length>best.members.length)){best=o;bn=c;}}return best;};
  const biggest=()=>comp?.A||orgList.reduce((a,o)=>!a||o.members.length>a.members.length?o:a,null);
  const v3=a=>new THREE.Vector3(a[0],a[1],a[2]);
  // ---- Blooms (rebuilt from director.lasting(): a pure function of the verified history) -------------------------
  // They spread around the crown (golden-angle order over its highest points), each at most a third of its radius.
  // Bounded: per organism its first (crowning) bloom and its newest PER_ORG-1, and at most BLOOM_MAX in the world (the
  // crowning ones are kept first). A retired bloom's place is taken by a newer one (places cycle around the crown).
  const PER_ORG=24,BLOOM_MAX=400;
  let lastBloomKey='',lastBloomSet='';const bloomAt=new Map();
  function buildBlooms(i){
    let key='';const lasting=ctx.director.lasting(),lite=(i.quality||0)>=2;
    for(const l of lasting){if(l.first>i.t)continue;let n=l.count-l.times.length;for(const x of l.times)if(x<=i.t)n++;key+=`${l.type}:${l.first}:${n};`;}
    key+=`|${builtVersion}|${lite}`;if(key===lastBloomKey)return;lastBloomKey=key;
    // Occurrences in groups (the occurrences older than the last eight times of an entry share its first time).
    const groups=[];lasting.forEach((l,seq)=>{if(l.first>i.t)return;const org=mainOrg(l.subject?.fileIds)||biggest();if(!org)return;const kind=l.type==='refactor.validated'?1:0;
      const known=l.times.filter(x=>x<=i.t),older=l.count-l.times.length;if(older>0)groups.push({kind,at:l.first,n:older,org,seq});for(const at of known)groups.push({kind,at,n:1,org,seq});});
    groups.sort((a,b)=>a.at-b.at||a.seq-b.seq);
    const total=new Map();for(const g of groups){g.k0=total.get(g.org.id)||0;total.set(g.org.id,g.k0+g.n);}
    let occ=[];for(const g of groups){const T=total.get(g.org.id),from=Math.max(g.k0,T-(PER_ORG-1),1),to=g.k0+g.n;
      if(g.k0===0)occ.push({kind:g.kind,at:g.at,org:g.org,k:0});for(let k=from;k<to;k++)occ.push({kind:g.kind,at:g.at,org:g.org,k});}
    if(occ.length>BLOOM_MAX){const firsts=occ.filter(o=>o.k===0),rest=occ.filter(o=>o.k>0);occ=firsts.slice(-BLOOM_MAX).concat(rest.slice(Math.max(0,rest.length-(BLOOM_MAX-Math.min(BLOOM_MAX,firsts.length)))));
      occ.sort((a,b)=>a.at-b.at||a.k-b.k);}
    // Facing the establishing view (a pure function of the composition), so a bloom opens toward the viewer.
    const toward=comp?[-comp.V[0],0,-comp.V[1]]:[0,0,1];let camEye=null;if(comp){const v=viewOf(1),ce=Math.cos(v.el);camEye=[v.target.x+Math.cos(v.az)*ce*v.distance,v.target.y+Math.sin(v.el)*v.distance,v.target.z+Math.sin(v.az)*ce*v.distance];}
    // The same blooms on unchanged organisms (a structure change elsewhere) are not grown again.
    const set=`${lite}|${model.epoch}|${toward}|${camEye}|`+occ.map(o=>`${o.kind}:${o.at}:${o.k}:${o.org.sig}`).join(';');
    if(set===lastBloomSet){for(const b of bloomLights)b.org=orgs.get(b.org.id)||b.org;for(const b of bloomAt.values())b.org=orgs.get(b.org.id)||b.org;return;}lastBloomSet=set;
    const out={seg:[],glow:[],leaf:[]};const lastBloom=new Map();bloomLights.length=0;
    occ.forEach((o,j)=>{const org=o.org,k=o.k;const top=org.crown.slice(0,Math.max(1,Math.min(14,org.crown.length)));
      // The first bloom crowns the organism; later ones open around its crown (smaller), so they accumulate.
      const first=()=>{let b=null,bs=Infinity;for(const c of org.crown){const sc=Math.abs(c.p[1]/org.height-.68)+(camEye?.15*Math.hypot(c.p[0]-camEye[0],c.p[2]-camEye[2])/Math.max(1,org.radius):0);if(sc<bs){bs=sc;b=c;}}return b||{p:org.top,dist:org.height};};
      const cr=k===0?first():top.length?top[(k*5+(o.kind?2:0))%top.length]:{p:[org.root[0],org.height,org.root[2]],dist:org.height};
      const size=clamp((k===0?.5:.3*Math.pow(.9,k-1))*Math.min(org.radius,org.height*.55),.45,2.6)*(o.kind?.85:1);
      // Facing the establishing lens (like a flower turned to the light), a little upward.
      const eye=camEye||[cr.p[0]+toward[0]*10,2,cr.p[2]+toward[2]*10],ed=[eye[0]-cr.p[0],eye[1]-cr.p[1],eye[2]-cr.p[2]],el=Math.hypot(...ed)||1;
      const up=[ed[0]/el*.8,ed[1]/el*.8+.45,ed[2]/el*.8];
      const centerP=[cr.p[0]+toward[0]*size*.15,cr.p[1]+size*.1,cr.p[2]+toward[2]*size*.15];
      lastBloom.set(`${o.kind}|${o.at}`,{org,p:centerP,size});
      // Older blooms in a long history keep their form with fewer elements.
      const fewer=lite||j<occ.length-24||out.glow.length>GLOW*20000;
      const start=secs(o.at,model.epoch);
      growBloom(out,{center:centerP,up,org:org.index%MAXO,dist:cr.dist,size,kind:o.kind,start,seed:hash(`${org.id}/${k}/${o.kind}`),lite:fewer});
      bloomLights.push({org,p:centerP,size,start,kind:o.kind});});
    bloomCount=copy(bloomSeg,out.seg,SEG,SEG_NAMES)+copy(bloomLeaf,out.leaf,LEAF,['lP','lD','lW','lM']);copy(bloomGlow,out.glow,GLOW,['gP','gG','gM']);bloomAt.clear();for(const [k,v] of lastBloom)bloomAt.set(k,v);
  }
  // The light of the newest blooms on the branches around them (eight at most), opening with the bloom.
  const sat=c=>{const m=Math.max(c.r,c.g,c.b,1e-3);return new THREE.Color(c.r/m,c.g/m,c.b/m);};
  const bloomLights=[],BLOOM_C=[sat(pal.secondary),sat(pal.highlight.clone().lerp(pal.accent,.5))];
  function updateBloomLights(i){const L=U.uBL.value,C=U.uBLC.value,spd=ctx.speed(),n=bloomLights.length;
    for(let k=0;k<8;k++){const b=bloomLights[n-1-k];if(!b){L[k].set(0,0,0,0);continue;}
      const o=b.org,S=Sof(o),a=(i.tsec-b.start)/spd,c=BLOOM_C[b.kind];
      L[k].set(o.root[0]+(b.p[0]-o.root[0])*S,b.p[1]*S,o.root[2]+(b.p[2]-o.root[2])*S,(a>=0?.3*smooth(a/4):0)*(1+.08*Math.sin(i.tview*.4+k)));C[k].set(c.r,c.g,c.b,b.size*Sof(b.org)*1.6);}}
  // ---- Agents: firefly swarms or pollinators, with soft trails -----------------------------------------------------
  const AGENT_COLORS=['#ffe29a','#9dffcf','#ff9ee8','#a7c8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'].map(c=>new THREE.Color(c));
  const pollinator=G.agents?.form==='pollinator',SWARM=pollinator?7:Math.max(8,Math.min(48,num(G.agents?.swarm,24))),TRAIL=5,MAX_AGENTS=10;
  const agentPts=pointBuffers({aCol:4,aSize:1},MAX_AGENTS*(SWARM*TRAIL+24));
  const agentMat=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 aCol;attribute float aSize;uniform float uPx;uniform vec2 uRes;varying vec4 vC;void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float px=projectionMatrix[1][1]*uRes.y*.5;gl_PointSize=clamp(aSize*.05*px/max(.4,-mv.z),1.5,60.*uPx);vC=aCol;}`,
    fragmentShader:`varying vec4 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC.rgb*(exp(-r*5.)+exp(-r*24.)*2.)*vC.a,1.);}`});
  const agentPoints=new THREE.Points(agentPts.geometry,agentMat);agentPoints.frustumCulled=false;agentPoints.renderOrder=7;scene.add(agentPoints);
  const agentState=new Map(),tmp=new THREE.Vector3(),tmpP=new THREE.Vector3();
  function agentGoal(a,i){
    const tip=a.fileId?anchorPos(a.fileId):null,home=a.home?forest?.anchors.get(a.home):null,o=home?orgList[home.org]:null;
    const ph=rand(hash(a.id))*6.283;
    // At the branch it works on: each presence keeps its own side of it (two agents on one file stay apart).
    if(tip&&a.display==='tool'){const same=i.agents.filter(b=>b.display==='tool'&&b.fileId===a.fileId).map(b=>b.id).sort(),k=Math.max(0,same.indexOf(a.id));return tip.add(tmp.set(Math.cos(ph)*.6,.45+1.1*k,Math.sin(ph)*.6));}
    // Presences around one organism keep apart (their own height band and side), so two never merge into one.
    if(o){const waiting=a.display==='waiting'||a.display==='dormant';const same=i.agents.filter(b=>b.home&&forest?.anchors.get(b.home)?.org===home.org).map(b=>b.id).sort(),k=Math.max(0,same.indexOf(a.id));
      const R=waiting?rOf(o)+1:rOf(o)*.65+.5,y=(waiting?.7:hOf(o)*.62)+k*1.1;const s=a.busy?.22:.05,ph2=ph+k*2.2;
      return new THREE.Vector3(o.root[0]+Math.cos(ph2+i.tview*s)*R,y+Math.sin(i.tview*.5+ph)*.3,o.root[2]+Math.sin(ph2+i.tview*s)*R);}
    // Not yet at home anywhere: they drift over the ecosystem, each in its own lane (never stacked on another).
    const free=i.agents.filter(b=>!(b.home&&forest?.anchors.get(b.home))).map(b=>b.id).sort(),k=Math.max(0,free.indexOf(a.id)),pf=k*6.283/Math.max(1,free.length)+ph*.2;
    return new THREE.Vector3(centre.x+Math.cos(pf+i.tview*.06)*extent*.5,canopyH*(.5+.18*k),centre.z+Math.sin(pf+i.tview*.06)*extent*.5);
  }
  // Where a presence's swarm is at the frame's time (a pure function of the observed lifecycle and the time, so a seek
  // and continuous play agree): the goal of its current state, eased in from the goal of the state before it.
  const goalKey=p=>`${p.display}|${p.fileId}|${p.home}`;
  function agentAt(a,i,out){out.copy(agentGoal(a,i));
    const spd=ctx.speed(),W=(a.display==='tool'?1.6:2.8)*1000*spd,before=ctx.agents.presence(a.id,i.t-W);
    if(!before||goalKey(before)===goalKey(a))return out;
    // The moment the goal changed (within the last W): bisected over the pure lifecycle.
    let lo=i.t-W,hi=i.t;for(let n=0;n<12;n++){const mid=(lo+hi)/2,p=ctx.agents.presence(a.id,mid);if(p&&goalKey(p)===goalKey(a))hi=mid;else lo=mid;}
    const prev=ctx.agents.presence(a.id,lo);if(!prev)return out;
    return out.lerp(tmpP.copy(agentGoal(prev,i)),1-smooth((i.t-hi)/W));}
  function updateAgents(i){
    let n=0;const seen=new Set();const cap=agentPts.capacity;
    for(const a of i.agents.slice(0,MAX_AGENTS)){
      seen.add(a.id);let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3()};agentState.set(a.id,st);}
      agentAt(a,i,st.pos);
      const c=AGENT_COLORS[a.voice%8],alpha=a.alpha*(a.busy?1:.45)*num(G.agentProminence,.8),ph=rand(hash(a.id))*100;
      const spread=a.display==='tool'?.5:a.busy?.95:.6;
      for(let k=0;k<SWARM;k++){const u=k/SWARM*6.283+ph,rk=spread*(.35+.65*rand(k*31+7)),wk=(pollinator?.7:1.2)+k*.045;
        for(let j=0;j<TRAIL&&n<cap;j++){const tt=i.tview-j*.07;
          const x=st.pos.x+Math.cos(u+tt*wk)*rk,y=st.pos.y+Math.sin(tt*(1.9+k*.07)+k)*rk*.55,z=st.pos.z+Math.sin(u*1.3+tt*wk*.9)*rk;
          const blink=pollinator?.8+.2*Math.sin(tt*30+k):Math.max(0,Math.sin(tt*(2.4+k*.23)+k*2.1))**2;
          agentPts.write('position',n,x,y,z);agentPts.write('aCol',n,c.r*2.4,c.g*2.4,c.b*2.4,alpha*blink*(1-j/TRAIL)*(j?.5:1));agentPts.write('aSize',n,(pollinator?3.2:1.6)*(j?.6:1));n++;}}
      // The presence's heart: one soft light at the swarm's centre.
      if(n<cap){agentPts.write('position',n,st.pos.x,st.pos.y,st.pos.z);agentPts.write('aCol',n,c.r*1.4,c.g*1.4,c.b*1.4,alpha*(a.busy?.9:.5));agentPts.write('aSize',n,a.display==='tool'?9:6);n++;}
      if(a.display==='tool'&&a.fileId){const tip=anchorPos(a.fileId);if(tip){const inward=a.activity==='reading'||a.activity==='searching';
        for(let k=0;k<16&&n<cap;k++){let f=(i.tview*.6+k/16)%1;if(inward)f=1-f;const p=st.pos.clone().lerp(tip,f);p.y+=Math.sin(f*Math.PI)*.25;
          agentPts.write('position',n,p.x,p.y,p.z);agentPts.write('aCol',n,c.r*1.6,c.g*1.6,c.b*1.6,alpha*Math.sin(f*Math.PI)*.6);agentPts.write('aSize',n,.6);n++;}}}
    }
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
    agentPts.commit(n);
  }
  // ---- Digital life: the ecology among the organisms (life/biosphere.js; only when the recipe has life on) -----------
  // The ecosystem's entities are the authoritative inhabitants (always drawn); followers on their own paths add bodies
  // to the plankton colonies and spore clouds (more at full quality, none at the lowest). Ambient inhabitants are small
  // and part of the water: the observed agents keep their own larger, brighter swarms. Each species has its own
  // signature, not only its hue:
  //  - pollinators: a warm white core (brighter than any crown, so a gathering shows on a pink flower as on a teal
  //    one, and never in the hue of an observed agent's swarm) in a halo of the palette's highlight. Light follows
  //    behaviour: explorers are faint motes without a tail; seekers have a short one (longer and brighter while they
  //    carry a crown's influence: a thread between two crowns); orbiters are the brightest and largest, each drawing a
  //    short arc of its circle around the crown, so a gathering of fifteen reads as one ring of light from afar;
  //    scattering ones are dim; dormant ones (more than the habitat feeds) almost invisible; a slow wing-beat flicker.
  //    Near an observed agent's swarm they fade (presentation only), so the swarm never looks larger than it is;
  //  - plankton: tight twinkling clusters (a leader and its followers close around it) breathing together (a slow pulse
  //    shared by neighbours); a scattering colony dims (a disturbance is never a celebration);
  //  - spores: fine motes, a faint streak along the current they ride (the gyres can be read against the floor),
  //    gathering light where they settle: a soft cloud with some depth, brightest at its centre;
  //  - drifters: larger, slow, soft translucent forms near the floor with a faint wake, brighter as they are aroused.
  // Presentation reads only the ecosystem's state, the tick fraction (alpha) and the view time.
  const life=LIFE?(()=>{
    LIFE.create(biosphereGrammar(recipe));
    // The world's palette, made vivid (living light is saturated; the hue stays the palette's), each species at its own
    // saturation and lightness so they separate even where the palette's hues are close.
    const vivid=(c,s0,l)=>{const hsl={};c.getHSL(hsl);const o=new THREE.Color().setHSL(hsl.h,Math.max(hsl.s,s0),l);return [o.r,o.g,o.b];};
    const COL=[vivid(pal.highlight.clone().lerp(pal.secondary,.2),.7,.64),vivid(pal.valid,.6,.62),vivid(pal.haze,.45,.72),vivid(pal.accent.clone().lerp(pal.haze,.45),.35,.45)];
    const FOLLOW={[PLANKTON]:[4,3,1,0],[SPORE]:[1,1,0,0]},WAKE=4,PL=4,ARC=4;
    const ARC_C=COL[POLLINATOR].map(x=>x*.55+.45);
    let pts=null,rib=null,ptsObj=null,ribObj=null,ptMat=null,ribMat=null,cap=0,K=0,ftex=null,texEco=null,idsRef=null;const siteOfOrg=new Map();
    const statsNow={drawn:0,followers:0,trailSegments:0,drawCalls:0};
    const P3=[0,0,0],F3=[0,0,0],FOPT_PL={spread:.17,lag:.45},FOPT_SP={spread:.22,lag:.8};
    // Writers into the reused buffers (no allocation per frame).
    let C=null,SZ=null,PP=null,RA=null,RB=null,RC=null,ptCap=0,ribCap=0,n=0,ns=0;
    function put(x,y,z,c,b,size,kind){if(n>=ptCap)return;const o=n*3,o4=n*4;PP[o]=x;PP[o+1]=y;PP[o+2]=z;C[o4]=c[0];C[o4+1]=c[1];C[o4+2]=c[2];C[o4+3]=b;SZ[o4]=size;SZ[o4+1]=kind;SZ[o4+2]=0;SZ[o4+3]=0;n++;}
    function seg(x0,y0,z0,a0,x1,y1,z1,a1,c,w){if(ns>=ribCap)return;const o=ns*4;RA[o]=x0;RA[o+1]=y0;RA[o+2]=z0;RA[o+3]=a0;RB[o]=x1;RB[o+1]=y1;RB[o+2]=z1;RB[o+3]=a1;RC[o]=c[0];RC[o+1]=c[1];RC[o+2]=c[2];RC[o+3]=w;ns++;}
    // A tail along the entity's recorded path (newest first), fading out quadratically.
    function tail(e,L,tb,c,w){const o=e*K,h=eco0.trailHead;let x0=P3[0],y0=P3[1],z0=P3[2],a0=tb;
      for(let j=1;j<=L;j++){const r=o+((h-j+1+K*4)%K),x1=eco0.tx[r],y1=eco0.ty[r],z1=eco0.tz[r],f=1-j/L,a1=tb*f*f;seg(x0,y0,z0,a0,x1,y1,z1,a1,c,w);x0=x1;y0=y1;z0=z1;a0=a1;}}
    // An orbiter's arc: the stretch of its circle around the crown it has just flown (behind it, in its own direction),
    // fading; fifteen of them on one crown draw a ring.
    // (ecology 2: `tr`, the music's trail factor, lengthens or shortens the arc)
    function arc(e,S,b,w,tr=1){const k=eco0.tgt[e];if(k<0)return;const cx=S.x[k],cz=S.z[k],ex=P3[0]-cx,ez=P3[2]-cz,d=Math.hypot(ex,ez);if(d<.05)return;
      const n=tr===1?ARC:Math.max(2,Math.round(ARC*tr)),dir=(ex*eco0.vz[e]-ez*eco0.vx[e])>=0?1:-1,th=Math.atan2(ez,ex),step=Math.min(.2*tr,.55*tr/(n*d))*dir;
      let x0=P3[0],z0=P3[2],a0=b;for(let j=1;j<=n;j++){const t=th-step*j,x1=cx+Math.cos(t)*d,z1=cz+Math.sin(t)*d,f=1-j/n,a1=b*f*f;seg(x0,P3[1],z0,a0,x1,P3[1],z1,a1,ARC_C,w);x0=x1;z0=z1;a0=a1;}}
    // Observed agents' swarm centres this frame (their presences; read for presentation only, never by the ecosystem).
    const AG=new Float32Array(30);let nAg=0;
    const agentFade=(x,y,z)=>{let f=1;for(let a=0;a<nAg;a++){const dx=x-AG[a*3],dy=y-AG[a*3+1],dz=z-AG[a*3+2],d2=dx*dx+dy*dy+dz*dz;if(d2<6.25){const u=Math.sqrt(d2)/2.5;f=Math.min(f,.15+.85*u*u);}}return f;};
    // The crowns and roots this frame (where settled spore clouds have their centres).
    const CW=new Int16Array(128);let nCw=0;
    let eco0=null;
    function alloc(eco){
      cap=eco.capacity;K=eco.K;
      // Buffers sized once from the ecosystem's species quotas (the most each species can have alive).
      const share=eco.species.map(s=>s.share);let used=0;const quota=share.map((x,k)=>{const q=k===share.length-1?cap-used:Math.floor(cap*x);used+=q;return q;});
      const nF=quota[PLANKTON]*FOLLOW[PLANKTON][0]+quota[SPORE]*FOLLOW[SPORE][0];
      pts=pointBuffers({lC:4,lS:4},cap+nF);
      ptMat=new THREE.ShaderMaterial({uniforms:U,vertexShader:LIFE_PT_VS,fragmentShader:LIFE_PT_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      ptsObj=new THREE.Points(pts.geometry,ptMat);ptsObj.frustumCulled=false;ptsObj.renderOrder=6;scene.add(ptsObj);
      const quad=new THREE.BufferGeometry();quad.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,-1,1,0,1,1,0],3));quad.setIndex([0,2,1,1,2,3]);
      // (ecology 2: room for the longest traces the music asks for, musicLook's trail at most 2.4)
      const T2=eco.ecology===2?2.4:1;
      rib=instancedBuffers(quad,{rA:4,rB:4,rC:4},quota[POLLINATOR]*Math.max(Math.round(ARC*T2),Math.min(Math.ceil(PL*T2),K-1))+quota[DRIFTER]*Math.min(Math.round(WAKE*T2),Math.max(WAKE,K-1))+quota[SPORE]*Math.ceil(T2));
      ribMat=new THREE.ShaderMaterial({uniforms:U,vertexShader:LIFE_RIB_VS,fragmentShader:LIFE_RIB_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      ribObj=new THREE.Mesh(rib.geometry,ribMat);ribObj.frustumCulled=false;ribObj.renderOrder=6;scene.add(ribObj);
    }
    function hide(){if(ptsObj){pts.commit(0);rib.commit(0);ptsObj.visible=ribObj.visible=false;}U.uLifeK.value=0;statsNow.drawn=statsNow.followers=statsNow.trailSegments=statsNow.drawCalls=0;}
    function update(i){
      const v=i.life;if(!v||!v.eco){hide();return;}
      const eco=v.eco;eco0=eco;if(!pts)alloc(eco);
      // Ecology 2: the music as the water shows it (musicLook: all 1 without music). Its light is the water's own (the
      // haze toward the light, the caustics, the light through the organisms and the rays): a passage's weather, over
      // seconds. A quiet passage dims it all; a full one brightens the haze only a little (the deep water keeps its
      // blacks) and gives the rest to the shafts. (The world sets these afresh every frame before this.)
      const M=musicLook(eco,v);if(forest&&M.light!==1){const up=M.light>1;U.uFogLit.value.multiplyScalar(up?Math.sqrt(M.light):M.light);if(up)shaftMat.uniforms.uShaftK.value*=M.light;}
      const show=v.restoring?0:v.fadeIn;if(show<=0){hide();return;}
      // Fields -> the organisms' light.
      if(eco!==texEco){ftex?.dispose();ftex=lifeFieldTexture(THREE,eco,{scale:[1.2,2,2.5,6]});texEco=eco;U.uLifeF.value=ftex.texture;
        const f=eco.field;U.uLifeB.value.set(f.min[0],f.min[1],f.max[0]-f.min[0],f.max[1]-f.min[1]);}
      // Ecology 2: the light the life gives the organisms and the floor follows the music (brighter as a passage opens
      // up and its groups gather, dimmer as it settles; a little under the full factor, so a full passage never washes
      // the floor: the inhabitants themselves carry the rest).
      const E2=v.ecology===2;
      ftex.update();U.uLifeK.value=show*(M.life===1?1:Math.pow(M.life,.8));
      const S=eco.sites;if(S.ids!==idsRef){idsRef=S.ids;siteOfOrg.clear();S.ids.forEach((id,k)=>siteOfOrg.set(id,k));}
      for(const L of [U.uLifeO,U.uLifeC,U.uLifeD])for(const v4 of L.value)v4.set(0,0,0,0);
      // The water's flinch after a failure anywhere (kept alike by every crown): every crown's glow drops by up to
      // half, released as slowly as it fell.
      let flinch=0;for(let k=0;k<S.count;k++)if(S.kind[k]===0)flinch=Math.max(flinch,S.state(k)?.flinch||0);
      nCw=0;for(let k=0;k<S.count&&nCw<128;k++)CW[nCw++]=k;
      nAg=0;for(const st of agentState.values()){if(nAg>=10)break;AG[nAg*3]=st.pos.x;AG[nAg*3+1]=st.pos.y;AG[nAg*3+2]=st.pos.z;nAg++;}
      // Per organism (its one or two heads): each head's glow, the organism's lasting and strain; each head's centre
      // and reach.
      // (ecology 2: a smaller gathering's light is lifted more than a full one's, so the secondary gatherings read
      // around the scene and looking around is rewarded; a full crown is unchanged)
      const lit=E2?g=>Math.pow(Math.min(1,g||0),.72):g=>Math.min(1,g||0);
      for(const o of orgList){const k=siteOfOrg.get(o.id);if(k===undefined)continue;const st=S.state(k),j=o.index%MAXO,k2=siteOfOrg.get(`${o.id}#h1`),st2=k2!==undefined?S.state(k2):null;
        U.uLifeO.value[j].set(st?lit(st.glow)*(1-.5*flinch):0,st?Math.min(1,st.lasting/2):0,st2?lit(st2.glow)*(1-.5*flinch):0,st?st.stress:0);U.uLifeC.value[j].set(S.x[k],S.y[k],S.z[k],S.r[k]);
        if(st2)U.uLifeD.value[j].set(S.x[k2],S.y[k2],S.z[k2],S.r[k2]);}
      // Inhabitants.
      const q=Math.max(0,Math.min(3,i.quality|0)),a=v.alpha,tv=i.tview;C=pts.arrays.lC;SZ=pts.arrays.lS;PP=pts.arrays.position;
      RA=rib.arrays.rA;RB=rib.arrays.rB;RC=rib.arrays.rC;ribCap=rib.capacity;ptCap=pts.capacity;n=0;ns=0;let nf=0;
      const h=eco.trailHead,PLK=Math.min(PL,K-1);
      for(let e=0;e<cap;e++){
        const vis=lifeVisibility(eco,e,v);if(vis<=.002)continue;
        const k=eco.sp[e],m=eco.mode[e],c=COL[k],ph=((e*.618034+eco.gen[e]*.371)%1);
        lifePosition(eco,e,a,P3);let b,size;
        if(k===POLLINATOR){
          const carry=eco.carry[e]>0,wing=Math.sin(tv*(7+ph*4)+ph*40),fl=.78+.22*wing*wing;let L=0,ta=0,w=.012;
          if(m===MODE.orbit){b=2.1;size=.21;}
          else if(m===MODE.seek){b=carry?1.05:.8;size=.11;L=carry?3:1;ta=carry?.12:.08;w=carry?.014:.012;}
          else if(m===MODE.rest){b=.03;size=.05;}
          else if(m===MODE.disperse){b=.45;size=.08;L=2;ta=.08;}
          else{b=carry?.55:.3;size=.075;L=carry?1:0;ta=.08;}
          b*=fl*(nAg?agentFade(P3[0],P3[1],P3[2]):1)*M.bright;if(L&&M.trail!==1)L=Math.min(K-1,Math.round(L*M.trail));
          if(m===MODE.orbit)arc(e,S,vis*b*.16,.016,M.trail);else if(L)tail(e,L,vis*b*ta,c,w);
        }else if(k===SPORE){
          // Spores collecting in calm water brighten slowly (gathered light) and spread a little in height (a cloud with
          // depth, not a sheet), brightest at the cloud's centre (the structure they collect at); drifting ones are
          // faint and leave a faint streak along the current they ride.
          if(m===MODE.settle){const held=Math.min(1,eco.modeT[e]/60);let best=9,rc=.6;
            for(let j=0;j<nCw;j++){const q=CW[j];let dn;
              if(S.kind[q]===0){const dx=P3[0]-S.x[q],dy=P3[1]-S.y[q],dz=P3[2]-S.z[q];dn=Math.sqrt(dx*dx+dy*dy+dz*dz)/S.r[q];if(dn<best){best=dn;rc=S.r[q];}}
              else if(P3[1]<1.8){dn=Math.hypot(P3[0]-S.x[q],P3[2]-S.z[q])/1.3;if(dn<best){best=dn;rc=.7;}}}
            P3[1]=Math.max(.2,P3[1]+(((e*.7548777+eco.gen[e]*.5698403)%1)-.5)*.8*rc*held);
            b=(.45+.75*held*(.8+.2*Math.sin(tv*.9+ph*30)))*Math.max(.2,Math.min(1,1.25-best*.75));size=.065;}
          else{b=m===MODE.disperse?.5:.4;size=.05;if(M.trail===1){const r=e*K+((h-1+K*4)%K);seg(P3[0],P3[1],P3[2],vis*b*.38,eco.tx[r],eco.ty[r],eco.tz[r],0,c,.01);}
            else tail(e,Math.min(K-1,Math.max(1,Math.round(M.trail))),vis*b*.38*M.bright,c,.01);}
          if(M.bright!==1)b*=Math.pow(M.bright,.6);
        }else if(k===PLANKTON){
          // Colonies breathe together (a slow pulse shared by neighbours); a startled colony dims as it scatters.
          const br=.7+.3*Math.sin(tv*.75+P3[0]*.31+P3[2]*.27);
          b=m===MODE.rest?.13:.5*br*(.8+.2*Math.sin(tv*(1.3+ph*2)+ph*40));if(m===MODE.disperse)b*=1-.6*Math.exp(-eco.modeT[e]/40);size=.045;if(M.bright!==1)b*=Math.pow(M.bright,.8);
        }else{
          const ar=Math.max(0,Math.min(1,eco.fa[e*2+1]));b=.3+.9*ar;size=.3;if(M.bright!==1)b*=Math.sqrt(M.bright);
          tail(e,M.trail===1?WAKE:Math.min(K-1,Math.max(2,Math.round(WAKE*M.trail))),vis*b*.08,c,.06);
        }
        if(M.size!==1)size*=M.size;put(P3[0],P3[1],P3[2],c,b*vis,size,k);
        const F=FOLLOW[k]?.[q]||0;
        for(let f=0;f<F;f++){if(!lifeFollower(eco,e,f,F,a,tv,F3,k===PLANKTON?FOPT_PL:FOPT_SP))break;put(F3[0],F3[1],F3[2],c,b*vis*.7,size*.8,k);nf++;}
      }
      pts.dirty('position');pts.dirty('lC');pts.dirty('lS');pts.commit(n);rib.dirty('rA');rib.dirty('rB');rib.dirty('rC');rib.commit(ns);
      ptsObj.visible=n>0;ribObj.visible=ns>0;
      statsNow.drawn=n-nf;statsNow.followers=nf;statsNow.trailSegments=ns;statsNow.drawCalls=(n>0?1:0)+(ns>0?1:0);
    }
    function dispose(){if(ptsObj){scene.remove(ptsObj);scene.remove(ribObj);pts.geometry.dispose();rib.geometry.dispose();ptMat.dispose();ribMat.dispose();}ftex?.dispose();ftex=null;}
    return {update,dispose,stats:()=>({...statsNow})};
  })():null;
  // ---- Effects --------------------------------------------------------------------------------------------------
  let waveNext=0,rippleNext=0;const transients={flash:[],shadow:[],swell:[],shafts:[],light:[]},pulses=new Map();
  function wave(org,start,color,{speed=4,width=1.2,down=false,heal=false,k=1}={}){const s=waveNext++%8;U.uWave.value[s].set(org,start,speed,down?-1:heal?2:1);U.uWaveC.value[s].set(color.r*k,color.g*k,color.b*k,width);}
  function ripple(pos,start,color,duration=5,k=1){const s=rippleNext++%6;groundU.uRipple.value[s].set(pos[0],0,pos[2],start);groundU.uRippleC.value[s].set(color.r*k,color.g*k,color.b*k,duration);}
  function burst(pos,start,color,{radius=1.6,duration=2,size=1,mode=0,k=1}={}){const b=burstNext++%BURSTS;burstU.uBA.value[b].set(pos.x,pos.y,pos.z,start);burstU.uBB.value[b].set(color.r*k,color.g*k,color.b*k,size);burstU.uBC.value[b].set(duration,mode,radius,0);}
  function pillar(x,z,start,color,{width=1,duration=9,k=1}={}){const s=pillarNext++%PILLARS;pillarU.uCol.value[s].set(x,z,start,duration);pillarU.uColC.value[s].set(color.r*k,color.g*k,color.b*k,width);}
  const pulse=(id,start,kind=0)=>{if(id)pulses.set(id,{at:start,kind});};
  // An organism's light swells into the water around it (its halo, mist and floor) for a few seconds.
  const lightUp=(o,start,k)=>{if(o)transients.light.push({org:o.index%MAXO,at:start,k});};
  function effect(cmd,i){
    // At the command's own time (also right after a seek, before the next frame): the current structure, the organisms'
    // sizes and the current's phase then, never those of the last frame drawn.
    const q=i?.quality??Math.max(0,builtQuality);if(model.version!==builtVersion||(q>=2)!==(builtQuality>=2))build(q);
    if(!forest)return;const s=cmd.subject||{},inten=clamp(cmd.scale,0,1.6),start=secs(cmd.at,model.epoch);
    if(Number.isFinite(cmd.at)){growthAt(cmd.at,start);U.uSwayT.value=start/ctx.speed()*(i?.overrides?.motion??1);}
    const show=(i?.overrides?.intensity??1)>0&&inten>0;
    const ids=s.fileIds||[];
    switch(cmd.effect){
      case 'sprout':{const o=orgs.get(s.groupId);if(!o||!show)break;const c=pal.valid.clone().lerp(pal.highlight,.4);
        ripple(o.root,start,pal.valid,7,1.1*inten);burst(v3(o.root).setY(.3),start,c,{radius:2.4,duration:3.5,size:1.1,mode:0,k:1.8*inten});
        burst(v3(o.root).setY(.2),start+.5,pal.highlight,{radius:1.2,duration:7,size:.8,mode:1,k:1.2*inten});wave(o.index,start+.4,pal.highlight,{speed:3,width:1.4,k:.4*inten});lightUp(o,start,.8*inten);break;}
      case 'branch-growth':{const o=orgOfModule(s.fileId);pulse(s.fileId,start,0);if(!o||!show)break;wave(o.index,start,pal.highlight.clone().lerp(pal.valid,.4),{speed:5,width:.9,k:.4*inten});break;}
      case 'unfurl':{pulse(s.fileId,start,0);const p=anchorPos(s.fileId);if(p&&show)burst(p,start+.6,pal.highlight,{radius:.7,duration:1.6,size:.7,mode:0,k:.8*inten});break;}
      case 'shed':{pulse(s.fileId,start,1);const p=anchorPos(s.fileId);if(p&&show)burst(p,start,new THREE.Color(.32,.28,.22),{radius:.9,duration:3.2,size:.8,mode:3,k:.7});break;}
      case 'mycelium-bridge':{const a=orgOfModule(s.fileId),b=orgOfModule(s.targetId);if(!a||!b||!show)break;
        ripple(a.root,start,pal.valid,4.5,.4*inten);ripple(b.root,start+1.6,pal.valid,4.5,.4*inten);
        if(cmd.tier>=2){wave(a.index,start,pal.valid,{speed:4,k:.5*inten});wave(b.index,start+1.8,pal.valid,{speed:4,k:.5*inten});}break;}
      case 'blight':{for(const id of ids)pulse(id,start,2);if(!show)break;const list=orgsOf(ids);
        // The drain runs down only the failing branches (gated per module in the shaders).
        for(const o of list){wave(o.index,start,new THREE.Color(.3,.09,.03),{speed:2.6,width:1.4,down:true,k:.45});}
        for(const id of ids.slice(0,6)){const p=anchorPos(id);if(p)burst(p,start+.2,new THREE.Color(.45,.11,.035),{radius:1.1,duration:6,size:.5,mode:2,k:.5});}
        transients.shadow.push({at:start,k:.9*Math.min(1,inten)});break;}
      case 'glow-wave':{for(const id of ids)pulse(id,start,0);if(!show)break;for(const o of orgsOf(ids))wave(o.index,start,pal.valid,{speed:3.2,width:1.2,k:.3*inten});break;}
      case 'regreen':{for(const id of ids)pulse(id,start,0);if(!show)break;const list=orgsOf(ids);
        // Light floods back up from the roots (a front climbing for about two seconds, the colour behind it).
        for(const o of list){const H=hOf(o)*1.7+1;wave(o.index,start,pal.valid,{speed:H/2.2,width:1.4,heal:true,k:.45*inten});ripple(o.root,start,pal.valid,6,.9*inten);lightUp(o,start+1,.5*inten);
          burst(topOf(o),start+1.8,pal.valid.clone().lerp(pal.highlight,.5),{radius:1.3,duration:6,size:.9,mode:1,k:.9*inten});}
        transients.swell.push({at:start+.8,k:.3*inten});break;}
      case 'metamorphosis':case 'fractal-bloom':{const list=orgsOf(ids);const targets=list.length?list:[biggest()].filter(Boolean);if(!show)break;
        const c=cmd.effect==='metamorphosis'?pal.highlight.clone().lerp(pal.accent,.3):pal.secondary.clone().lerp(pal.highlight,.3);
        for(const o of targets){wave(o.index,start,c,{speed:3,width:1.8,k:.45*inten});ripple(o.root,start,c,8,.7*inten);lightUp(o,start+.5,(cmd.tier>=4?1.4:1)*inten);
          burst(topOf(o),start+1.5,c,{radius:2.4,duration:6,size:1.1,mode:1,k:1*inten});}
        transients.swell.push({at:start+.5,k:(cmd.tier>=4?.7:.45)*inten});transients.flash.push({at:start+1.2,k:(cmd.tier>=4?.25:.12)*inten});break;}
      case 'spore-release':{if(!show)break;const c=pal.highlight.clone().lerp(pal.valid,.35);const list=orgsOf(ids.length?ids:null);const targets=list.length?list.slice(0,4):orgList.slice(0,3);
        // A slow column of light and spores rises from the committed organisms; the shafts brighten for a moment.
        for(const o of targets){const t=topOf(o);pillar(o.root[0],o.root[2],start,c,{width:Math.max(1.2,rOf(o)*.55),duration:10,k:.5*inten});
          burst(v3(o.root).setY(.4),start,c,{radius:Math.max(.8,rOf(o)*.35),duration:10,size:1,mode:1,k:1.2*inten});burst(t,start+1.2,c,{radius:1.2,duration:9,size:.9,mode:1,k:1*inten});
          wave(o.index,start,c,{speed:2.4,width:1.2,k:.25*inten});}
        transients.shafts.push({at:start,k:.6*inten});break;}
      case 'season-turn':{if(!show)break;ripple([centre.x,0,centre.z],start,pal.accent,9,.5*inten);for(const o of orgList)wave(o.index,start+rand(hash(o.id))*2,pal.accent.clone().lerp(pal.highlight,.4),{speed:2,width:2.4,k:.45*inten});transients.swell.push({at:start,k:.25*inten});transients.shafts.push({at:start,k:.4*inten});break;}
      default:break;
    }
  }
  // ---- Frame ----------------------------------------------------------------------------------------------------
  const lightDir=new THREE.Vector3(0,1,0);
  function rebuild(){builtVersion=-1;}
  // The cold shadow of a failing run (it desaturates the grade and dims the shafts while the blight spreads).
  function shadowAt(i){let k=0;const spd=ctx.speed();for(const x of transients.shadow){const a=(i.tsec-x.at)/spd;if(a>=0)k+=x.k*smooth(a/.8)*Math.exp(-Math.max(0,a-2)/4);}return clamp(k);}
  const env1=(a,rise,hold,fall)=>a<0?0:smooth(a/rise)*Math.exp(-Math.max(0,a-hold)/fall);
  // Organism girth and size at time t: trunks thicken with the modules alive then; a new organism grows from its seed.
  function growthAt(T,tsec){const spd=ctx.speed(),alive=new Array(orgList.length).fill(0);
    for(const id of forest.moduleIds){const m=model.modules.get(id),a=forest.anchors.get(id);if(m&&a&&model.alive(m,T)&&m.removed===null)alive[a.org]++;}
    // Size: each module counts as it grows in (3 s) and as it fades out, so the organism scales smoothly.
    const grow=new Array(orgList.length).fill(0);
    for(const id of forest.moduleIds){const m=model.modules.get(id),a=forest.anchors.get(id);if(!m||!a)continue;const b=m.born;if(!(b<=T))continue;
      let k=Number.isFinite(b)?clamp((T-b)/3000):1;if(m.removed!==null&&m.removed<=T)k*=1-clamp((T-m.removed)/3000);grow[a.org]+=k;}
    for(const o of orgList){const k=o.index%MAXO,age=(tsec-o.born)/spd,birth=age>=0?smooth(age/5):1;
      const S=(.7+.17*Math.log2(1+grow[o.index]))*(.08+.92*easeOut(birth));orgColors[k].w=S;U.uOrg.value[k].z=o.height*S;U.uOrg.value[k].w=.85+.12*Math.log2(1+alive[o.index]);
      orgSpecies[k].z=age>=0&&age<7?(1-smooth(age/7))*(.4+.6*smooth(age/.6)):0;}
    return grow;}
  function update(i){
    const epoch=model.epoch,q=i.quality||0,spd=ctx.speed();
    U.uT.value=i.tsec;U.uV.value=i.tview;U.uSpeed.value=spd;const motion=i.overrides?.motion??1;U.uSwayT.value=i.tview*motion;airMat.uniforms.uMotion.value=motion;
    U.uPx.value=Math.max(.5,ctx.pipeline.size[1]/1080);U.uRes.value.set(ctx.pipeline.size[0],ctx.pipeline.size[1]);
    if(model.version!==builtVersion||(q>=2)!==(builtQuality>=2))build(q);
    // Light: placed by the composition (upper third, away from the anchor), migrating very slowly.
    if(comp){if(Math.abs((camera.aspect||16/9)-comp.aspect)>.01)build(q);
      const L=comp.light,laz=Math.atan2(L.z,L.x)+.04*Math.sin(i.tview*.0021),lel=Math.asin(clamp(L.y,-1,1))+.02*Math.sin(i.tview*.0017+1);
      lightDir.set(Math.cos(laz)*Math.cos(lel),Math.sin(lel),Math.sin(laz)*Math.cos(lel));}
    else lightDir.set(.5,.5,.3).normalize();
    U.uLightDir.value.copy(lightDir);
    U.uLean.value.set(lightDir.x*.12,lightDir.z*.12);
    // Music: breathing on the bar, a softer world in breath sections, never a flash per beat.
    const bar=Math.sin((i.barPhase||0)*Math.PI*2),sec=i.mood?.section;
    U.uBreath.value=.1+.05*bar*num(G.music?.reactivity,.5)+(sec==='lift'?.04:sec==='breath'?-.03:0);
    // The world's light breathes over the recipe's period (in bars at the score's base tempo; a fixed clock, so a tempo
    // change never makes the light jump), never on the beat.
    const barSec=240/92,period=barSec*([2,4,8].includes(MOT.breath)?MOT.breath:4);U.uLum.value=lum*1.15*(1+.07*Math.sin(i.tview*6.283/period));
    const un=[0,1,2,3].map(k=>i.unlocks[k]?.level||0);groundU.uUnlock.value.set(...un);airMat.uniforms.uUnlock.value.set(...un);U.uVeins.value=un[2];
    let shaftBoost=0;for(const x of transients.shafts)shaftBoost+=x.k*env1((i.tsec-x.at)/spd,1.5,2,3);shaftMat.uniforms.uShaftK.value=shaftBase*(1+shaftBoost)*(1-.55*shadowAt(i));
    for(const v of orgSpecies)v.w=0;for(const x of transients.light)orgSpecies[x.org].w+=x.k*env1((i.tsec-x.at)/spd,1.5,2,3.5);
    if(forest){const grow=growthAt(i.t,i.tsec);
      // Seasons: as the ecosystem matures (modules alive, smoothly weighted) the ambient light slowly warms toward the
      // palette's accent; a pure function of the model at this time.
      {let total=0;for(const g of grow)total+=g;const m=clamp(Math.log2(1+total)/9);U.uFogLit.value.copy(fogLit).lerp(seasonLit,m*.4);U.uFogC.value.copy(fogC).lerp(seasonFog,m*.3);}
      // Framing: the main mass of the ecosystem (organisms of any real size).
      extent=3;canopyH=2;let worldR=3;const big=Math.max(1,...orgList.map(o=>o.members.length));
      for(const o of orgList){const S=orgColors[o.index%MAXO].w,r=Math.hypot(o.root[0]-centre.x,o.root[2]-centre.z)+o.radius*S;worldR=Math.max(worldR,r);
        if(o.members.length>=big*.12||orgList.length<=6){extent=Math.max(extent,r);canopyH=Math.max(canopyH,o.height*S);}}worldExtent=worldR;
      // Fog scales with the world: a large ecosystem is seen from further away through the same visual depth.
      const sc=Math.max(1,extent/9);U.uFogD.value=(.007+.011*fogK)/sc;U.uFogFar.value=28*sc;}
    // Module states and pulses into the state texture; repaired files (a stressed state followed by a healthy one)
    // keep the time of their repair.
    if(forest){const working=new Set();for(const a of i.agents)if(a.fileId&&a.display==='tool')working.add(a.fileId);
      for(const [id,p] of pulses)if((i.tsec-p.at)/spd>20)pulses.delete(id);
      const D=stateData;forest.moduleIds.forEach((id,k)=>{const m=model.modules.get(id);if(!m)return;
        let cur=m.initial,prev=m.initial,at=-1e5,stressed=m.initial==='stressed',healed=-1e5;
        for(const e of m.states){if(e.at>i.t)break;prev=cur;cur=e.state;at=secs(e.at,epoch);if(cur==='stressed'){stressed=true;healed=-1e5;}else if(stressed){stressed=false;healed=at;}}
        const human=Number.isFinite(m.lastHuman)&&i.t>=m.lastHuman&&i.t-m.lastHuman<5000?1-(i.t-m.lastHuman)/5000:0;
        const o=k*8;D[o]=STATE_INDEX[cur]??1;D[o+1]=STATE_INDEX[prev]??1;D[o+2]=at;D[o+3]=(working.has(id)?.7:0)+human*.35;
        let ps=-1e5,pk=0;const p=pulses.get(id);if(p&&p.at<=i.tsec){ps=p.at;pk=p.kind;}
        // Touch (observed edits by a person or an agent): a pulse climbs that file's branch.
        const touch=Math.max(Number.isFinite(m.lastHuman)?m.lastHuman:-Infinity,Number.isFinite(m.lastAgent)?m.lastAgent:-Infinity);if(Number.isFinite(touch)&&touch<=i.t&&i.t-touch<6000){const ts=secs(touch,epoch);if(ts>ps){ps=ts;pk=0;}}
        const an=forest.anchors.get(id);D[o+4]=ps;D[o+5]=pk;D[o+6]=an?Math.max(0,an.dist-(an.size||1)):0;D[o+7]=healed;});
      stateTex.needsUpdate=true;}
    updateAgents(i);buildBlooms(i);updateBloomLights(i);
    if(life)life.update(i);
    // Quality 2 and below: half the motes (the shaft and crown motes are interleaved, so both halve).
    {const h=q>=2?Math.round(moteN/2):0;air.geometry.setDrawRange(h,AIRN-h);}
    U.uIntensity.value=i.overrides?.intensity??1;
    for(const L of Object.values(transients))while(L.length&&(i.tsec-L[0].at)/spd>20)L.shift();
  }
  function afterCamera(){sky.uniforms.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);sky.uniforms.uCam.value.copy(camera.position);
    airMat.uniforms.uFocus.value=Math.max(3,camState.focus);}
  function background(){return sky;}
  // The grade reuses its objects (no allocation per frame).
  const lightPoint=new THREE.Vector3(),projected=new THREE.Vector3(),SHADOW_TINT=new THREE.Vector3(.86,.95,1.08);
  const halo=pal.accent.clone().lerp(pal.highlight,.5);
  const gradeOut={tonemap:'agx',bloomTint:new THREE.Vector3(.85+halo.r*.3,.85+halo.g*.3,.9+halo.b*.3),streak:.05,streakTint:new THREE.Vector3(),rays:[],rayDecay:.965,tint:new THREE.Vector3(),lift:new THREE.Vector3(0,.001,.003)};
  const ray={x:0,y:0,strength:0,color:new THREE.Vector3()};
  function grade(i){
    const L=G.light||{},inten=i.overrides?.intensity??1,spd=ctx.speed();
    let shadow=shadowAt(i),swell=0,flash=0;
    for(const x of transients.swell){const a=(i.tsec-x.at)/spd;if(a>=0)swell+=x.k*smooth(a/2)*Math.exp(-Math.max(0,a-1.5)/3.5);}
    for(const x of transients.flash){const a=(i.tsec-x.at)/spd;if(a>=0)flash+=x.k*Math.exp(-a*1.6);}
    shadow=clamp(shadow);
    const sec=i.mood?.section,lit=U.uFogLit.value,g=gradeOut;
    // Music: a cooler tint under tension, a warmer one on resolve and lift; a cold shadow while blight spreads.
    g.tint.set(1,1,1);if(sec==='tension')g.tint.set(.97,.97,1.04);else if(sec==='resolve'||sec==='lift')g.tint.set(1.02,1.01,.98);g.tint.lerp(SHADOW_TINT,shadow);
    // Light shafts toward the light's place on screen (fading as it leaves the frame).
    lightPoint.copy(camera.position).addScaledVector(lightDir,400);projected.copy(lightPoint).project(camera);g.rays.length=0;
    if(projected.z<1){const x=projected.x*.5+.5,y=projected.y*.5+.5,off=Math.max(0,Math.abs(x-.5)-.5,Math.abs(y-.5)-.5);
      const k=num(ATM.lightShafts,.7)*env.shafts*Math.exp(-off*1.4)*(1-.45*shadow);if(k>.01){ray.x=x;ray.y=y;ray.strength=.7*k;ray.color.set(lit.x*3.2,lit.y*2.4,lit.z*2.2);g.rays.push(ray);}}
    g.streakTint.set(lit.x*2,lit.y*2,lit.z*2.2);
    g.bloom=num(L.bloom,1)*1.0*(1+.12*i.activity)+swell*.6;g.threshold=num(L.bloomThreshold,.7)*.75;
    g.exposure=num(L.exposure,1.05)*1.2*(1-.12*shadow)*(1+.18*swell)*(sec==='breath'?.94:1);
    g.contrast=num(L.contrast,1)*1.12;g.saturation=1-.3*shadow;g.vignette=num(L.vignette,.3)+.12;g.grain=num(L.grain,.025);g.flash=flash*inten;
    return g;
  }
  // ---- Camera: an establishing composition. The largest organism stands close on a third (its crown may leave the
  // frame), the rest recede diagonally into the haze behind it; a low lens looks slightly up so the crowns break the
  // light. Idle motion is a slow breath of that view; significant events draw the view and it returns. ---------------
  const camState={focus:10,view:''};
  function cameraGoal(i){
    const fov=num(CAM.fov,38),tanV=Math.tan(THREE.MathUtils.degToRad(fov)/2);
    const motion=i.overrides?.motion??1,drift=(.3+.9*num(CAM.drift,.7))*motion,crane=CAM.personality==='crane';
    let target,distance,az,el;
    if(comp){const v=viewOf(clamp(Sof(comp.A)/Sof0(comp.A),.75,1.3));target=v.target;distance=v.distance;az=v.az;el=v.el;}
    else{target=centre.clone().setY(canopyH*.5);distance=Math.max(6,extent*1.6/tanV*.4);az=rand(seed)*6.283;el=.08;}
    // Idle: a slow, composed breath (minutes per cycle), never a constant drift.
    az+=(.05*Math.sin(i.tview/83)+.02*Math.sin(i.tview/37+1))*drift;distance*=1+.03*Math.sin(i.tview/61)*drift;el+=(crane?.03:.012)*Math.sin(i.tview/97)*drift;
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity,hold=att&&att.tier>=3?16:12;
    camState.view='establishing';
    if(since<hold&&att){const ev=eventView(att,tanV);if(ev){camState.view=`${att.intent} +${since.toFixed(1)}s`;const k=smooth(1-Math.max(0,since-(hold-5))/5)*smooth(since/.8+.35)*Math.min(1,(i.overrides?.intensity??1)+.4);
      target.lerp(ev.target,k);distance=lerp(distance,ev.distance,k);let da=ev.az-az;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;az+=da*k;el=lerp(el,ev.el,k);}}
    else{const busy=i.agents.find(a=>a.display==='tool'&&a.fileId&&forest?.anchors.has(a.fileId));
      if(busy){const a=forest.anchors.get(busy.fileId),o=orgList[a.org];target.lerp(scaled(o,a.tip),.25);distance=lerp(distance,Math.min(distance,Math.max(6,rOf(o)*2/tanV)),.25);}}
    camState.focus=distance;
    return {target,distance,azimuth:az,elevation:el,fov,omega:since<hold&&att?.tier>=3?.75:.5};
  }
  // The view of an event: its subject near the centre (below the banner's band), its whole organism inside about 70 % of
  // the frame height, turned around the subject until no other organism stands between it and the lens. Computed from
  // the organisms' rest sizes and the composition only (a pure function, memoised per event).
  const evCache=new Map();
  function eventView(att,tanV){
    const key=`${att.at}|${att.intent}|${builtVersion}`;if(evCache.has(key))return evCache.get(key);if(evCache.size>64)evCache.clear();
    // An event across several organisms is best seen in the wide view (it stays).
    // Wide events (a checkpoint's columns of light, a season turning) read best in the establishing view.
    if(att.intent==='repository.checkpoint'||att.intent==='world.expanded')return null;
    const a=subjectOf(att,true);if(!a||!comp||(!a.org&&!a.bloom))return null;
    const tanH=tanV*(comp.aspect||16/9),O=a.org,H0=O?O.height*Sof0(O):a.radius*2,R0=O?O.radius*Sof0(O):a.radius;
    // A subject's height in its rest frame (the subject positions are current ones; the ratio is close to 1).
    const P=a.pos.clone(),dist=Math.min(Math.max(H0/(2*tanV*.7),R0*1.15/tanH,a.radius/tanV*1.2,3.2),viewOf(1).distance*1.15);
    const el=.1,az0=Math.atan2(-comp.V[1],-comp.V[0]);let best=null,bs=Infinity;
    for(const d of [0,.3,-.3,.6,-.6,.9,-.9,1.25,-1.25,1.6,-1.6]){const az=az0+d,cx=P.x+Math.cos(az)*dist,cz=P.z+Math.sin(az)*dist;let pen=0;
      for(const o of orgList){if(o===O||o.removed<1e5)continue;const S=Sof0(o),r=o.radius*S*.55,h=o.height*S;
        // Closest approach of the sight line (lens to subject) to the organism's axis, in plan.
        const vx=P.x-cx,vz=P.z-cz,L2=vx*vx+vz*vz,t=clamp(((o.root[0]-cx)*vx+(o.root[2]-cz)*vz)/L2,0,1),qx=cx+vx*t-o.root[0],qz=cz+vz*t-o.root[2];
        const y=P.y+dist*Math.sin(el)*(1-t);if(t>.02&&t<.98&&Math.hypot(qx,qz)<r+.3&&y<h*1.05)pen+=Math.sqrt(o.members.length)+1;
        // Never with the lens inside an organism's crown.
        {const dl=Math.hypot(cx-o.root[0],cz-o.root[2]),R=o.radius*S*1.6+1.5;if(dl<R)pen+=2*(1-dl/R)*(Math.sqrt(o.members.length)+1);}}
      const score=pen*10+Math.abs(d);if(score<bs){bs=score;best=az;}}
    // The subject sits a little above the centre (in the band 0.35-0.65 of the height, clear of the banner's top band).
    const target=P.clone();target.y=Math.max(.6,P.y-dist*tanV*.08);
    const out={target,distance:dist,az:best,el};
    // A milestone's bloom may arrive a moment after the recovery that drew the view: memoise only the settled view.
    const settled=!(att.intent==='milestone.achieved'||att.intent==='refactor.validated'||att.intent==='validation.recovered')||a.bloom;if(settled)evCache.set(key,out);return out;}
  // rest: from the organisms' rest sizes (time-independent: the event view memoises it).
  function subjectOf(c,rest=false){const s=c.subject||{};
    const SX=rest?Sof0:Sof,sc=(o,p)=>{const S=SX(o);return new THREE.Vector3(o.root[0]+(p[0]-o.root[0])*S,p[1]*S,o.root[2]+(p[2]-o.root[2])*S);},hX=o=>o.height*SX(o),rX=o=>o.radius*SX(o);
    // A milestone (or the recovery verified by the same run) draws the view to the bloom it opened.
    const bm=c.intent==='validation.recovered'?ctx.director.commands.find(x=>x.intent==='milestone.achieved'&&Math.abs(x.at-c.at)<3000):null;if(bm)c=bm;
    if(c.intent==='milestone.achieved'||c.intent==='refactor.validated'){const b=bloomAt.get(`${c.intent==='refactor.validated'?1:0}|${c.at}`);if(b)return {pos:sc(b.org,b.p),radius:Math.max(2.2,b.size*SX(b.org)*3),org:b.org,bloom:true};}
    if(s.fileId&&forest?.anchors.has(s.fileId)){const a=forest.anchors.get(s.fileId),o=orgList[a.org];
      if(s.targetId&&forest.anchors.has(s.targetId)){const b=forest.anchors.get(s.targetId),ob=orgList[b.org];const pa=v3(o.root).setY(hX(o)*.4),pb=v3(ob.root).setY(hX(ob)*.4);return {pos:pa.clone().lerp(pb,.5),radius:pa.distanceTo(pb)*.6+Math.max(rX(o),rX(ob)),org:null};}
      return {pos:v3(o.root).setY(hX(o)*.45).lerp(sc(o,a.tip),.35),radius:rX(o)+hX(o)*.35,org:o};}
    if(s.groupId&&orgs.get(s.groupId)){const o=orgs.get(s.groupId);return {pos:v3(o.root).setY(Math.max(1.2,hX(o)*.45)),radius:Math.max(2.5,rX(o)+hX(o)*.35),org:o};}
    const list=orgsOf(s.fileIds);if(list.length){const c0=new THREE.Vector3();for(const o of list)c0.add(v3(o.root));c0.multiplyScalar(1/list.length);let r=3,h=1;for(const o of list){r=Math.max(r,c0.distanceTo(v3(o.root))+rX(o));h=Math.max(h,hX(o));}c0.y=h*.42;return {pos:c0,radius:r+h*.3,org:list.length===1?list[0]:null};}
    return null;}
  // ---- Words ---------------------------------------------------------------------------------------------------
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;const branches=n=>plural(n,'branch').replace('branchs','branches');
  const orgName=id=>{const d=model.districts.get(id);return d?`${ctx.name(id)} · ${d.role}`:ctx.name(id);};
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  const WORD={coral:'sea fan','crystal-tree':'crystal tree',fern:'fern',kelp:'kelp',mycelial:'mycelium'};
  // A milestone verified by the same run as a recovery carries both in one banner (the recovery's own is dropped).
  // The labels keep one callout per subject: when both share one, the recovery's (listed first) carries the banner.
  const subjectKey=c=>c.subject?.fileId||c.subject?.groupId||(c.subject?.fileIds||[]).join(',');
  const partner=(c,intent)=>ctx.director.commands.find(x=>x!==c&&x.intent===intent&&Math.abs(x.at-c.at)<3000)||null;
  const kindsOf=c=>(c?.detail?.kinds||[]).map(x=>MILESTONE[x]||x);
  function describe(c,i){const d0=describeRaw(c);if(!d0)return null;
    // A newer failing run owns the screen: older, lower-tier captions give way to it.
    const t=i?.t??c.at;if(c.intent!=='validation.failed'&&ctx.director.commands.some(x=>x.tier>=Math.min(3,c.tier)&&x.intent==='validation.failed'&&x.at>c.at&&x.at<=t))return null;
    // A banner says it already: no second caption for the same event.
    if(c.tier>=3&&d0.banner)d0.text='';
    return d0;}
  function describeRaw(c){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=subjectOf(c)?.pos;
    switch(c.intent){
      case 'subsystem.created':{const o=orgs.get(s.groupId);return {text:`A new ${WORD[o?.species||species]} takes root`,sub:orgName(s.groupId),position:pos};}
      case 'structure.created':return {text:'A bud unfurls',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','blossom').replace('api.route','route').replace('class','pod')}`).join(' · ')||plural(d.count||1,'new twig'),position:pos};
      case 'subsystem.connected':{const ga=forest?.anchors.get(s.fileId)?.org,gb=forest?.anchors.get(s.targetId)?.org;const na=orgList[ga]?.id,nb=orgList[gb]?.id;
        return {text:d.first?'Integration · a mycelial strand joins two organisms':'The strand between two organisms thickens',sub:na&&nb?`${ctx.name(na)} ↔ ${ctx.name(nb)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · blight on ${branches(n)}`,sub:'observed failing run',position:pos,color:'#ff8a6a'};
      case 'validation.passed':return {text:`Tests pass · ${branches(n)} glow`,sub:'observed passing run',position:pos,color:'#9dffcf'};
      case 'validation.recovered':{const m=partner(c,'milestone.achieved');if(m&&subjectKey(m)===subjectKey(c)){const k=kindsOf(m).filter(x=>x!=='Recovery');
          return {text:`Recovered · a fractal bloom opens`,sub:'verified by a passing test run',position:subjectOf(m)?.pos||pos,color:'#9dffcf',banner:['Recovery',...k].join(' · '),bannerSub:'a fractal bloom opens · verified by a passing test run'};}
        return {text:`Recovered · light returns to ${branches(d.repaired||n)}`,sub:'the tests pass again',position:pos,color:'#9dffcf',...(m?{}:{banner:'Recovery',bannerSub:'the tests pass again'})};}
      case 'refactor.validated':return {text:'Refactor validated · a crystalline bloom forms',sub:plural(d.removedSymbols||0,'symbol')+' removed',position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=kindsOf(c);if(partner(c,'validation.recovered')&&!k.includes('Recovery'))k.unshift('Recovery');
        return {text:`A fractal bloom opens · ${k.join(' + ')}`,sub:'verified by a passing test run',position:pos,banner:k.join(' · ')||'Milestone',bannerSub:'a fractal bloom opens · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:n?`Committed · spores rise from ${branches(n)}`:'Committed · the growth is set',sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The ecosystem deepens · chapter ${d.chapter}`,sub:'accumulated structure',position:centre.clone().setY(canopyH*.6)};
      default:return null;}}
  // The chip of a presence stays inside the safe frame (the swarm itself stays at the branch it works on).
  const chipP=new THREE.Vector3();
  function agentPosition(id){const p=agentState.get(id)?.pos;if(!p)return null;chipP.copy(p).project(camera);if(chipP.z>1||chipP.z<-1)return p;
    const x=clamp(chipP.x,-.9,.6),y=clamp(chipP.y,-.75,.8);if(x===chipP.x&&y===chipP.y)return p;return new THREE.Vector3(x,y,chipP.z).unproject(camera);}
  function agentColor(a){return '#'+AGENT_COLORS[a.voice%8].getHexString();}
  function subsystemLabels(){return orgList.map(o=>({position:v3(o.root).setY(hOf(o)+.6),text:ctx.name(o.id),sub:`${model.districts.get(o.id)?.role||''} · ${plural(o.members.length,'module')}`}));}
  function status(i){let v=0,st=0;for(const m of model.modules.values()){if(!model.alive(m,i.t))continue;const s=model.stateAt(m,i.t);if(s==='validated')v++;if(s==='stressed')st++;}return st?`${st} under blight`:v?`${v} validated`:'';}
  function pick(x,y,cam){let best=null,bd=.05;if(!forest)return null;for(const [id,a] of forest.anchors){const p=swayed(a.tip,a.dist,a.org).project(cam);const d=Math.hypot(p.x-x,(p.y-y)*.6);if(p.z<1&&d<bd){bd=d;best=id;}}
    if(!best)for(const o of orgList){const p=v3(o.root).setY(hOf(o)*.5).project(cam);const d=Math.hypot(p.x-x,p.y-y);if(p.z<1&&d<bd*2){bd=d;best='org:'+o.id;}}return best;}
  function inspect(id,i){if(!id||!forest)return null;if(id.startsWith('org:')){const o=orgs.get(id.slice(4));return o?{position:topOf(o),text:orgName(o.id),sub:`${plural(o.members.length,'module')} · a ${WORD[o.species]} of this subsystem`}:null;}
    const m=model.modules.get(id),a=forest.anchors.get(id);if(!m||!a)return null;const deps=[...model.links.values()].filter(l=>(l.a===id||l.b===id)&&model.alive(l,i.t)).length;
    return {position:swayed(a.tip,a.dist,a.org),text:`A branch · ${model.stateAt(m,i.t)}`,sub:`${plural(model.symbolsAt(m,i.t),'twig')} · ${plural(deps,'strand')} · ${ctx.name(m.group)}`};}
  function stats(){const sp={};for(const o of orgList)sp[o.species]=(sp[o.species]||0)+1;
    return {organisms:orgList.length,species:sp,dominant:species,segments:counts.thick+counts.fine,structural:counts.thick,twigs:counts.fine,crowns:counts.crowns,farSilhouettes:counts.far,leaves:counts.leaves,glows:counts.glows,cords:counts.cords,bloomSegments:bloomCount,
    motes:moteN,terrain,palette:P,anchor:comp?`${comp.A.species}/${comp.A.members.length}`:null,view:camState.view,camera:camera.position.toArray().map(x=>+x.toFixed(1)),extent:+extent.toFixed(1),canopy:+canopyH.toFixed(1)};}
  function dispose(){for(const o of [thickMesh,fineMesh,leafMesh,glowPoints,ground,shaftMesh,pillarMesh,mistMesh,cordMesh,airPoints,burstPoints,bloomMesh,bloomPoints,bloomLeafMesh,agentPoints]){scene.remove(o);o.geometry.dispose();}
    for(const set of Object.values(crownSets)){scene.remove(set.mesh);set.mesh.geometry.dispose();set.base.dispose();set.material.dispose();}
    for(const m of [segMat,leafMat,glowMat,ground.material,shaftMat,pillarMat,mistMat,cordMat,airMat,burstMat,agentMat,sky])m.dispose();
    for(const g of [thickGeo,fineGeo,leafGeo,shaftGeo,pillarGeo,mistGeo,ribbon])g.dispose();stateTex?.dispose();stateTex=null;life?.dispose();}
  // After a seek: transient effects are cleared; lasting blooms are rebuilt from the verified history (buildBlooms).
  function onPrime(){for(const v of U.uWave.value)v.y=-1e5;for(const v of groundU.uRipple.value)v.w=-1e5;for(const v of burstU.uBA.value)v.w=-1e5;for(const v of pillarU.uCol.value)v.z=-1e5;
    for(const L of Object.values(transients))L.length=0;pulses.clear();lastBloomKey='';agentState.clear();}
  makeCrowns(false);
  // ---- Composition anchors (layers.js): the organisms (mid-height, rooted at their base), the work, the branch tips,
  // the reef's edge. Read-only: they follow the organisms' current size and sway and never change the world.
  const composeA={center:new THREE.Vector3(),extent:6,floor:0,subsystems:[],active:{pos:new THREE.Vector3()},nodes:[],boundary:{radius:8,y:0}};
  function composeAnchors(i){
    if(!forest)return composeA;composeA.center.set(centre.x,canopyH*.35,centre.z);composeA.extent=extent;composeA.boundary.radius=extent*1.25;
    composeA.subsystems=orgList.filter(o=>o.removed>=1e5).map(o=>({id:o.id,pos:v3(o.root).setY(hOf(o)*.5),base:v3(o.root),size:Math.max(rOf(o),hOf(o)*.45)}));
    const ids=forest.moduleIds,n=Math.min(64,ids.length);composeA.nodes=[];for(let k=0;k<n;k++){const p=anchorPos(ids[Math.floor(k*ids.length/n)]);if(p)composeA.nodes.push({pos:p});}
    const att=i?ctx.director.attentionAt(i.t,1):null,busy=i?.agents?.find(a=>a.display==='tool'&&a.fileId&&forest.anchors.has(a.fileId));
    const at=att&&(i.t-att.at)/ctx.speed()/1000<30?subjectOf(att)?.pos:busy?anchorPos(busy.fileId):null;composeA.active.pos.copy(at||composeA.center);
    return composeA;}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime,
    compose:{camera,scene,anchors:composeAnchors},
    ...(life?{lifeStats:life.stats,onLifeParams(){}}:{})};
}

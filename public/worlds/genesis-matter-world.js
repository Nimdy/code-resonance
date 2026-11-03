// Genesis (preview): Metamorphic Matter (G2, G3). Design note: docs/worlds/genesis-matter.md.
//
// One continuous matter, a sea of hexagonal cells in four regimes (crystal, a mercury melt, grains of broken crystal,
// foam), simulated by genesis-matter.js on the life driver's timeline (life/driver.js: the same clock, inputs,
// checkpoints and generations as digital life; the host runs it: ctx.matter). This module only draws it and frames it:
// every image is a function of the simulation's state at the frame (interpolated from the tick before), the recipe and
// the agents' presences (the colour of the melt where one works).
//  - the cells: one full-screen ray cast (genesis-matter-glsl.js), fed three small maps per frame (regime, column,
//    glow, grain; the low columns' shadow, top, seam, crazing; the surface wave, its gradient, a grain's tilt or the
//    froth); a crystal grain is drawn as one tilted face, a plane through its cells (their mean height, its tilt by its
//    orientation, shallower the larger it is);
//  - the monumental crystals (lasting: verified milestones): instanced clusters of tilted prisms, drawn first with a
//    sun shadow map;
//  - the camera: high and slow over the regions, drawn toward what changed, wide for a freeze, low among the crystals
//    afterwards and in its idle hours.
import {THREE,clamp,lerp,smooth,hash,rand} from './core.js';
import {createMatterGrammar,COLS,ROWS,CELL,PX,PZ,NCELL,REGIME,GLOW,HZ,GRAINS,CX,CZ,wx,wz,cellAt} from './genesis-matter.js';
import {RAY_FS,MON_VS,MON_FS,DEPTH_FS,QUAD_VS,WAVE_H,WAVE_G,CLOUD_CELLS,CLOUD_SIZE} from './genesis-matter-glsl.js';
import {presence} from '../providers.js';
const TAU=Math.PI*2;
const AGENT_COLORS=['#ffb0dc','#ffd28a','#9cf0c8','#a8b8ff','#ffb48c','#8ce4ff','#dcaaff','#c8f096'];
// The crystal's body by the Lawbook's material (genome.material.kind): pale quartz, beryl, smoky quartz, a dark glass;
// never black spires standing in mirror water (docs/worlds/genesis-c-r0.md, identity).
const BODIES={porcelain:[.42,.45,.5],celadon:[.26,.38,.36],smoke:[.3,.26,.22],onyx:[.12,.12,.14]};
// Quality levels (the host also drops MSAA at 1 and resolution at 2 and 3): draw distance and the shadow traversal.
export const QUALITY=[{lod:450,shadow:12,map:2048},{lod:360,shadow:12,map:2048},{lod:330,shadow:8,map:2048},{lod:300,shadow:6,map:1024}];
const SWEEP=14;   // the low columns' shadow: cells toward the sun
export function createFamily(ctx){
  const {scene,camera,recipe}=ctx,renderer=ctx.renderer||null;
  const G=recipe.genome||{},CAM=G.camera||{},num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  let driver=ctx.matter?.create(createMatterGrammar({recipe}))||null;
  const seed=(recipe.projectSeed>>>0)||1;
  const body=BODIES[G.material?.kind]||BODIES.porcelain;
  const disposables=[];const keep=x=>{disposables.push(x);return x;};
  // a cell's neighbours (the matter's order: E, NE, NW, W, SW, SE) and their directions
  const NX=[1,.5,-.5,-1,-.5,.5],NZ=[0,.8660254,.8660254,0,-.8660254,-.8660254];
  function nbOf(r,c,o,d){const up=(r+1)%ROWS,dn=(r+ROWS-1)%ROWS,E=(c+1)%COLS,W=(c+COLS-1)%COLS;
    switch(d){case 0:return r*COLS+E;case 1:return up*COLS+(o?E:c);case 2:return up*COLS+(o?c:W);case 3:return r*COLS+W;case 4:return dn*COLS+(o?c:W);default:return dn*COLS+(o?E:c);}}
  // ---- The maps ----------------------------------------------------------------------------------------------------
  const cellData=new Uint8Array(NCELL*4),auxData=new Uint8Array(NCELL*4),waveData=new Uint8Array(NCELL*4),shapeData=new Uint8Array(NCELL*4),top=new Float32Array(NCELL);
  const tex=d=>{const t=keep(new THREE.DataTexture(d,COLS,ROWS,THREE.RGBAFormat,THREE.UnsignedByteType));t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;};
  const cellTex=tex(cellData),auxTex=tex(auxData),waveTex=tex(waveData),shapeTex=tex(shapeData);
  // the cloud layer's noise, once: three octaves (1, 2 and 4 lattice cells a cell, weights .55, .3, .15) of smooth value
  // noise on a periodic lattice, so it tiles (the sky samples it, filtered, as it drifts)
  const cloudTex=(()=>{const N=CLOUD_SIZE,d=new Uint8Array(N*N*4),lat=o=>{const L=CLOUD_CELLS*o,v=new Float32Array(L*L);for(let i=0;i<L*L;i++)v[i]=rand(hash(`${seed}/cloud/${o}/${i}`));return v;};
    const oct=[[1,.55],[2,.3],[4,.15]].map(([o,w])=>({L:CLOUD_CELLS*o,v:lat(o),w})),sm=t=>t*t*(3-2*t);
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){let n=0;for(const {L,v,w} of oct){const fx=x/N*L,fy=y/N*L,ix=Math.floor(fx),iy=Math.floor(fy),tx=sm(fx-ix),ty=sm(fy-iy),
      a=v[iy*L+ix],b=v[iy*L+(ix+1)%L],c=v[((iy+1)%L)*L+ix],e=v[((iy+1)%L)*L+(ix+1)%L];n+=w*((a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+e*tx)*ty);}
      const o=4*(y*N+x);d[o]=d[o+1]=d[o+2]=Math.round(n*255);d[o+3]=255;}
    const t=keep(new THREE.DataTexture(d,N,N,THREE.RGBAFormat,THREE.UnsignedByteType));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;})();
  // the crystal's outline: the phase field interpolated and smoothed (a cell and its six neighbours), its middle (.5)
  // a line across each cell it crosses
  const phA=new Float32Array(NCELL),phS=new Float32Array(NCELL),NBW=new Int32Array(NCELL*6);
  for(let k=0;k<NCELL;k++){const r=Math.floor(k/COLS),c=k%COLS;for(let d=0;d<6;d++)NBW[6*k+d]=nbOf(r,c,r&1,d);}
  // the grains' faces: per grain its cells' mean position (on the periodic sheet, from its first cell) and height
  // (and its lowest and highest: a face never leaves its grain's own heights, so a grain id that two far pieces share,
  // or a piece far from its grain's centre, stays at its own height)
  const gN=new Int32Array(GRAINS),gRef=new Int32Array(GRAINS),gX=new Float64Array(GRAINS),gZ=new Float64Array(GRAINS),gH=new Float64Array(GRAINS),gLo=new Float32Array(GRAINS),gHi=new Float32Array(GRAINS),hNow=new Float32Array(NCELL);
  const CA=CELL*CELL*Math.sqrt(3)/2,TILT=.9;   // a cell's area; a face rises at most about .9 m across its grain's radius
  // the sun: cold daylight, high enough that a column's shadow stays within SWEEP cells
  const sun=new THREE.Vector3(.62,.42,-.66).normalize(),rise=sun.y/Math.sqrt(sun.x*sun.x+sun.z*sun.z),ux=sun.x/Math.sqrt(sun.x*sun.x+sun.z*sun.z),uz=sun.z/Math.sqrt(sun.x*sun.x+sun.z*sun.z);
  const SW=new Int32Array(NCELL*SWEEP);{const CX=[],CZ=[];for(let i=0;i<NCELL;i++){const r=Math.floor(i/COLS),c=i%COLS;CX[i]=(c+(r&1)*.5)*CELL;CZ[i]=r*CELL*Math.sqrt(3)/2;}
    for(let i=0;i<NCELL;i++)for(let k=0;k<SWEEP;k++){const d=(k+1)*CELL;SW[i*SWEEP+k]=cellAt(CX[i]+ux*d,CZ[i]+uz*d);}}
  // ---- Monuments: instanced crystals ------------------------------------------------------------------------------------
  const MAXI=12000,iBase=new Float32Array(MAXI*4),iTilt=new Float32Array(MAXI*4);
  const prism=keep(new THREE.BufferGeometry());{const P=[];const V=k=>{const a=Math.PI/6+k*Math.PI/3;return [Math.cos(a)/Math.cos(Math.PI/6),Math.sin(a)/Math.cos(Math.PI/6)];};
    for(let k=0;k<6;k++){const [x0,z0]=V(k),[x1,z1]=V(k+1);P.push(x0,0,z0,x1,0,z1,x1,1,z1, x0,0,z0,x1,1,z1,x0,1,z0, x0,1,z0,x1,1,z1,0,2,0);}
    prism.setAttribute('position',new THREE.Float32BufferAttribute(P,3));}
  const geo=keep(new THREE.InstancedBufferGeometry());geo.setAttribute('position',prism.getAttribute('position'));
  const aBase=new THREE.InstancedBufferAttribute(iBase,4),aTilt=new THREE.InstancedBufferAttribute(iTilt,4);aBase.setUsage(THREE.DynamicDrawUsage);aTilt.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aBase',aBase);geo.setAttribute('aTilt',aTilt);geo.instanceCount=0;
  // a cluster: a main crystal standing almost upright, smaller ones leaning out from its foot (its habit: never a tower)
  const clusters=new Map();
  function clusterOf(m){let c=clusters.get(m.seed);if(c)return c;const r=j=>rand(hash(`${m.seed}/${j}`));c=[];
    for(let j=0;j<m.n;j++){const a=r(j*7)*TAU,off=j?2+3.2*r(j*7+1):0,lean=j?.25+.5*r(j*7+2):.06*r(j*7+2),dir=j?a:r(j*7+3)*TAU;
      c.push({dx:off*Math.cos(a),dz:off*Math.sin(a),h:(j?9+14*r(j*7+4):26+10*r(j*7+4))*m.size,R:j?.9+.8*r(j*7+5):1.7+.6*r(j*7+5),tx:Math.cos(dir),tz:Math.sin(dir),lean,tone:.85+.3*r(j*7+6)});}
    clusters.set(m.seed,c);return c;}
  // ---- Passes --------------------------------------------------------------------------------------------------------
  let quality=0,mapSize=QUALITY[0].map;
  const shadowRT=keep(new THREE.WebGLRenderTarget(mapSize,mapSize,{type:THREE.UnsignedByteType,format:THREE.RedFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter}));
  shadowRT.depthTexture=keep(new THREE.DepthTexture(mapSize,mapSize));
  const monRT=keep(new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter}));monRT.depthTexture=keep(new THREE.DepthTexture(4,4));
  const shadowMat=new THREE.Matrix4(),sunCam=new THREE.OrthographicCamera(-420,420,420,-420,1,1600);
  const V3=a=>new THREE.Vector3(...a);
  const U={uCamPos:{value:new THREE.Vector3()},uCamRot:{value:new THREE.Matrix3()},uTanHalf:{value:1},uAspect:{value:16/9},uTime:{value:0},
    uCells:{value:cellTex},uAux:{value:auxTex},uShadow:{value:shadowRT.depthTexture},uShadowMat:{value:shadowMat},uShadowSteps:{value:12},uLod:{value:450},uSlab:{value:8},
    uMonCol:{value:monRT.texture},uMonDepth:{value:monRT.depthTexture},uNearFar:{value:new THREE.Vector2(.1,4000)},uFwd:{value:new THREE.Vector3()},
    uWave:{value:waveTex},uShape:{value:shapeTex},uCloud:{value:cloudTex},uMons:{value:0},uAgent:{value:[...Array(6)].map(()=>new THREE.Vector4())},uAgentCol:{value:[...Array(6)].map(()=>new THREE.Vector3())},uAgents:{value:0},
    uCraze:{value:0},uFade:{value:1},uClock:{value:0},
    uSun:{value:sun},uSunCol:{value:new THREE.Vector3(1,.97,.92).multiplyScalar(1.2)},uSkyLo:{value:V3([.4,.47,.57])},uSkyHi:{value:V3([.06,.12,.28])},
    uBody:{value:V3(body)},uGloss:{value:clamp(num(G.material?.glaze,.85),.5,1)},uMolten:{value:V3([1,.42,.12])},uRubble:{value:V3(body).multiplyScalar(.45).add(V3([.18,.13,.07]))},
    uSeam:{value:V3([1,.93,.78])},uMonGlow:{value:V3(body).multiplyScalar(.6).add(V3([.16,.2,.26]))}};
  const rayMat=keep(new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,vertexShader:QUAD_VS,fragmentShader:RAY_FS}));
  const quadGeo=keep(new THREE.PlaneGeometry(2,2)),quad=new THREE.Mesh(quadGeo,rayMat);quad.frustumCulled=false;scene.add(quad);
  const monMat=keep(new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,vertexShader:MON_VS,fragmentShader:MON_FS}));
  const depthMat=keep(new THREE.RawShaderMaterial({uniforms:U,glslVersion:THREE.GLSL3,vertexShader:MON_VS,fragmentShader:DEPTH_FS}));
  const monScene=new THREE.Scene(),shadowScene=new THREE.Scene();
  {const a=new THREE.Mesh(geo,monMat),b=new THREE.Mesh(geo,depthMat);a.frustumCulled=b.frustumCulled=false;monScene.add(a);shadowScene.add(b);}
  // ---- Per frame -------------------------------------------------------------------------------------------------------
  let info=null,view=null,lastTick=-1,lastEco=null,maxTop=1,agentsNow=0,lastGoal=null;
  const eco=()=>view?.eco||null;
  const regionsLive=()=>(eco()?.regions||[]).filter(r=>r.files>0);
  const byte=v=>v<0?0:v>255?255:Math.round(v);
  function writeMaps(e,a){
    const f=e.fields;let mt=1;
    gN.fill(0);gX.fill(0);gZ.fill(0);gH.fill(0);
    for(let k=0;k<NCELL;k++){const h=f.hPrev[k]+(f.H[k]-f.hPrev[k])*a;hNow[k]=h;phA[k]=f.phiPrev[k]+(f.phi[k]-f.phiPrev[k])*a;if(e.regimeOf(k)!==REGIME.crystal)continue;const g=f.gid[k];
      if(!gN[g]){gRef[g]=k;gLo[g]=h;gHi[g]=h;}else{if(h<gLo[g])gLo[g]=h;if(h>gHi[g])gHi[g]=h;}const r=gRef[g];gN[g]++;gX[g]+=wx(CX[k]-CX[r]);gZ[g]+=wz(CZ[k]-CZ[r]);gH[g]+=h;}
    for(let k=0;k<NCELL;k++){let s=2*phA[k];for(let d=0;d<6;d++)s+=phA[NBW[6*k+d]];phS[k]=s/8;}
    const w=f.surf,wp=f.surfPrev;
    for(let k=0;k<NCELL;k++){let R=e.regimeOf(k),src=k;const o=4*k;let H=.9,tilt=0;
      // the boundary's line: the smoothed field's gradient and where its middle lies from the centre (cells); a cell of
      // melt beside crystal takes a sliver of its neighbour's crystal where the line passes inside it
      let gx=0,gz=0,best=-1,bp=-1;for(let d=0;d<6;d++){const j=NBW[6*k+d],v=phS[j];gx+=v*NX[d];gz+=v*NZ[d];if(e.regimeOf(j)===REGIME.crystal&&phA[j]>bp){bp=phA[j];best=j;}}
      gx/=3;gz/=3;const gl=Math.sqrt(gx*gx+gz*gz);let cut=-1;
      if(gl>.02){const dd=(.5-phS[k])/gl;
        if(R===REGIME.crystal&&dd>-.6)cut=dd;
        else if(R===REGIME.liquid&&best>=0&&dd<.45){cut=dd;R=REGIME.crystal;src=best;}}
      shapeData[o]=byte(127.5+gx/gl*127.5);shapeData[o+1]=byte(127.5+gz/gl*127.5);shapeData[o+2]=cut<-.99?0:byte((clamp(cut,-.98,1)+1)/2*255);
      let h=hNow[src];
      if(R===REGIME.crystal){
        // the grain's face (the shader's facetDir: the same orientation from the grain's low byte)
        const g=f.gid[src],n=gN[g]||1,r=gN[g]?gRef[g]:src,u=(g&255)/255,ang=u*TAU+1.3,sl=Math.min(.08+.24*((u*157.31)%1),TILT/Math.sqrt(n*CA/Math.PI)),dx=wx(CX[k]-CX[r])-gX[g]/n,dz=wz(CZ[k]-CZ[r])-gZ[g]/n;
        h=gN[g]?clamp(gH[g]/n-clamp(sl*(dx*Math.cos(ang)+dz*Math.sin(ang)),-TILT,TILT),gLo[g],gHi[g]+.3):h;h=Math.max(1,h);tilt=sl;H=h+sl*CELL*.58;}
      else if(R===REGIME.grains)H=2.6;else if(R===REGIME.foam)H=.9+CELL*.7;
      top[k]=H;if(H>mt)mt=H;
      const hq=Math.max(0,Math.min(8191,Math.round(h/16*8160)));
      cellData[o]=R*85+(R===REGIME.crystal&&cut>-.99?40:0);cellData[o+1]=R===REGIME.crystal?hq>>5:byte(h/16*255);cellData[o+2]=R===REGIME.liquid||R===REGIME.foam?byte(255*clamp((f.T[k]-GLOW)/1.2)):byte(255*(e.regionLaws(f.reg[src]).hue));cellData[o+3]=f.gid[src]&255;
      auxData[o+1]=Math.min(255,Math.ceil(H/16*255));auxData[o+2]=(f.seam[src]>.3?128:0)|byte(tilt/.32*127);auxData[o+3]=(Math.round(7*clamp(e.craze*.8+(R===REGIME.crystal?f.frac[k]*1.6:0)))<<5)|(R===REGIME.crystal?hq&31:0);
      // the surface wave (interpolated) and its gradient from the neighbours' (per metre)
      const s0=wp[k]+(w[k]-wp[k])*a;let ux=0,uz=0;
      for(let d=0;d<6;d++){const j=NBW[6*k+d],v=wp[j]+(w[j]-wp[j])*a;ux+=v*NX[d];uz+=v*NZ[d];}
      waveData[o]=byte(127.5+s0/WAVE_H*255);waveData[o+1]=byte(127.5+ux/(3*CELL)/WAVE_G*255);waveData[o+2]=byte(127.5+uz/(3*CELL)/WAVE_G*255);
      waveData[o+3]=byte(255*f.foam[k]);}
    maxTop=mt;cellTex.needsUpdate=true;waveTex.needsUpdate=true;shapeTex.needsUpdate=true;
  }
  // the low columns' shadows: from each cell toward the sun, the lowest margin between the light and the tops it passes
  function writeShadows(){
    for(let i=0;i<NCELL;i++){const h0=top[i];let sh=1;
      for(let k=0;k<SWEEP;k++){const d=(k+1)*CELL,y=h0+rise*d;if(y>maxTop)break;const v=clamp(4*(y-top[SW[i*SWEEP+k]])/d+.5);if(v<sh)sh=v;if(sh<=0)break;}
      auxData[4*i]=Math.round(255*sh);}
    auxTex.needsUpdate=true;
  }
  // The near image of a point of the periodic sea (the one closest to `ref`)
  const near=(x,z,ref)=>new THREE.Vector3(ref.x+wx(x-ref.x),0,ref.z+wz(z-ref.z));
  const seatOf=a=>presence(a.provider).seat%8;
  function update(i){
    info=i;view=i.matter||null;const e=eco();quality=clamp(Math.round(i.quality||0),0,3);
    if(!e){U.uFade.value=0;return;}
    U.uFade.value=view.restoring?0:clamp(view.fadeIn??1);
    if(e!==lastEco||e.tick!==lastTick||view.alpha<1){writeMaps(e,view.alpha??1);if(e!==lastEco||e.tick!==lastTick)writeShadows();lastTick=e.tick;lastEco=e;}
    U.uCraze.value=e.craze;
    U.uTime.value=i.tview;U.uClock.value=i.tview;U.uSlab.value=maxTop+.3;U.uLod.value=QUALITY[quality].lod;U.uShadowSteps.value=QUALITY[quality].shadow;
    // agents at work: their file's melt takes their colour
    let n=0;const sites=new Map((e.sites||[]).map(s=>[s.id,s]));
    for(const a of i.agents||[]){if(n>=6)break;const s=a.fileId&&sites.get(a.fileId);if(!s)continue;const c=new THREE.Color(AGENT_COLORS[seatOf(a)]);
      U.uAgent.value[n].set(s.x,s.z,clamp(a.alpha??1)*(a.display==='tool'?1:.5),9);U.uAgentCol.value[n].set(c.r,c.g,c.b);n++;}
    U.uAgents.value=n;agentsNow=n;
  }
  // ---- Camera ------------------------------------------------------------------------------------------------------
  // High and slow over the regions; drawn toward what changed; wide while a freeze crosses the sea, then down among the
  // monumental crystals; in idle hours a glide low across a region now and then. Targets are taken on the image of the
  // periodic sea nearest the last one, so the view never jumps across it.
  const PERIOD=120,ref=new THREE.Vector3();let haveRef=false,lock=null;
  function centre(){const live=regionsLive();if(!live.length)return new THREE.Vector3(0,0,0);const o=live[0];let x=0,z=0,w=0;
    for(const r of live){const k=Math.sqrt(r.files+1);x+=(o.x+wx(r.x-o.x))*k;z+=(o.z+wz(r.z-o.z))*k;w+=k;}return new THREE.Vector3(x/w,0,z/w);}
  function siteOfSubject(s){const e=eco();if(!e||!s)return null;const ids=[s.fileId,...(s.fileIds||[])].filter(Boolean);
    for(const id of ids){const x=e.sites.find(q=>q.id===id);if(x)return x;}const r=s.groupId&&e.regions.find(q=>q.id===s.groupId);return r||null;}
  function cameraGoal(i){
    // (qualification: a locked camera, the review films' fixed views)
    // ({rank: k} locks onto that region's stage, or its seat, where it first exists, and stays there)
    if(lock&&lock.x===undefined&&lock.rank!==undefined){const e=eco(),S=e?.stages.find(q=>q.rank===lock.rank),r=e?.regions.find(q=>q.rank===lock.rank);
      if(S||r)lock={...lock,x:(S||r).x+(lock.dx||0),z:(S||r).z+(lock.dz||0)};}
    if(lock&&lock.x!==undefined){const p=near(lock.x,lock.z,haveRef?ref:new THREE.Vector3(lock.x,0,lock.z));p.y=lock.y??2;ref.copy(p);haveRef=true;
      return lastGoal={target:p,distance:lock.distance,azimuth:lock.azimuth,elevation:lock.elevation,fov:lock.fov??55,omega:40};}
    const tv=i.tview,motion=clamp(i.overrides?.motion??1,0,2),drift=clamp(num(CAM.drift,.7),0,1.6)*motion;
    const fov=clamp(46+num(CAM.fov,34)*.3,50,60);
    const c=centre();if(!haveRef){ref.copy(c);haveRef=true;}
    let target=near(c.x,c.z,ref);target.y=2;
    let distance=125,elevation=.25+.08*clamp(num(CAM.elevation,.4),0,1.2)+.03*Math.sin(tv/47)*drift,azimuth=rand(seed)*TAU+tv*.011*drift,omega=.5;
    // idle: now and then a glide low across a region, the musical stages first (where the phrases grow)
    const ph=((tv%PERIOD)+PERIOD)%PERIOD/PERIOD,cycle=Math.floor(tv/PERIOD),live=regionsLive(),st=eco()?.stages||[];
    if(live.length&&i.activity<.15&&ph>.42&&ph<.82){const pick=rand(hash(`${seed}/glide/${cycle}`)),r=st.length?st[Math.floor(pick*st.length)]:live[Math.floor(pick*live.length)],e=smooth((ph-.42)/.08)*(1-smooth((ph-.74)/.08));
      const p=near(r.x,r.z,target),g=(ph-.42)/.4;p.x+=Math.cos(azimuth+1.2)*30*(g-.5);p.z+=Math.sin(azimuth+1.2)*30*(g-.5);p.y=3;
      target.lerp(p,e);distance=lerp(distance,46,e);elevation=lerp(elevation,.17,e);omega=.42;}
    // what changed, up close; a freeze: wide while it crosses, then down among its crystals
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;
    if(att&&since<26){const s=siteOfSubject(att.subject);
      if(att.intent==='milestone.achieved'&&att.tier>=3){const w=smooth(since/2)*(1-smooth((since-9)/3)),d=smooth((since-10)/4)*(1-smooth((since-22)/4));
        distance=lerp(distance,230,w);elevation=lerp(elevation,.5,w);
        if(s){const p=near(s.x,s.z,target);p.y=6;target.lerp(p,Math.max(w*.4,d));}distance=lerp(distance,58,d);elevation=lerp(elevation,.2,d);omega=.5;}
      else if(since<10&&s){const k=smooth(since/1.2)*(1-smooth((since-7)/3))*clamp(i.overrides?.intensity??1,.4,1)*.8,p=near(s.x,s.z,target);p.y=2;
        target.lerp(p,k*.75);distance=lerp(distance,85,k);elevation=lerp(elevation,.32,k);omega=.75;}}
    ref.copy(target);
    return lastGoal={target,distance,azimuth,elevation,fov,omega};
  }
  // ---- Passes that need the camera ---------------------------------------------------------------------------------------
  const rot=new THREE.Matrix4(),fwd=new THREE.Vector3();
  function afterCamera(i){
    camera.updateMatrixWorld();U.uCamPos.value.copy(camera.position);rot.extractRotation(camera.matrixWorld);U.uCamRot.value.setFromMatrix4(rot);
    U.uTanHalf.value=Math.tan(camera.fov*Math.PI/360);U.uAspect.value=camera.aspect||16/9;camera.getWorldDirection(fwd);U.uFwd.value.copy(fwd);U.uNearFar.value.set(camera.near,camera.far);
    const e=eco();if(!e||!renderer)return;
    // the monuments within 650 m and in front, nearest first (the depth test spares what is hidden)
    const P=camera.position,tNow=e.tick-1+(view?.alpha??1),list=[];
    for(const m of e.monuments){const g=clamp((tNow-m.k0)/(6*HZ));if(g<=0)continue;
      for(let tz=-3;tz<=3;tz++)for(let tx=-3;tx<=3;tx++){const x=P.x+wx(m.x-P.x)+tx*PX,z=P.z+wz(m.z-P.z)+tz*PZ,dx=x-P.x,dz=z-P.z,d2=dx*dx+dz*dz;if(d2>650*650)continue;
        if(d2>900&&(dx*fwd.x+dz*fwd.z)<-.2*Math.sqrt(d2))continue;
        for(const k of clusterOf(m))list.push([d2,x+k.dx,z+k.dz,k.h*smooth(g*1.15-.15*(k.R<1.5?1:0)),k.R,k.tx,k.tz,k.lean,k.tone]);}}
    list.sort((p,q)=>p[0]-q[0]);let n=0;
    for(const q of list){if(n>=MAXI)break;if(q[3]<.5)continue;const o=4*n;iBase[o]=q[1];iBase[o+1]=q[2];iBase[o+2]=q[3];iBase[o+3]=q[4];iTilt[o]=q[5];iTilt[o+1]=q[6];iTilt[o+2]=q[7];iTilt[o+3]=q[8];n++;}
    geo.instanceCount=n;U.uMons.value=n;aBase.needsUpdate=true;aTilt.needsUpdate=true;
    const size=ctx.pipeline?.size||[1920,1080];if(monRT.width!==size[0]||monRT.height!==size[1]){monRT.setSize(size[0],size[1]);}
    const was=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    // the sun's shadow map over the view (the monuments only)
    const focus=new THREE.Vector3().copy(P).addScaledVector(new THREE.Vector3(fwd.x,0,fwd.z).normalize(),220);
    sunCam.position.copy(focus).addScaledVector(sun,700);sunCam.lookAt(focus);sunCam.updateMatrixWorld();sunCam.updateProjectionMatrix();
    shadowMat.multiplyMatrices(sunCam.projectionMatrix,sunCam.matrixWorldInverse);
    renderer.setRenderTarget(shadowRT);renderer.setClearColor(0xffffff,1);renderer.clear();if(n)renderer.render(shadowScene,sunCam);
    renderer.setRenderTarget(monRT);renderer.setClearColor(0x000000,0);renderer.clear();if(n)renderer.render(monScene,camera);
    renderer.setRenderTarget(was);renderer.setClearColor(clear,alpha);
  }
  function grade(){return {tonemap:'agx',bloom:.18,threshold:1.8,exposure:.9,contrast:1.28,saturation:1.15,vignette:.3,grain:.012,aberration:.0012,streak:0};}
  // ---- Words ---------------------------------------------------------------------------------------------------------
  const plural=(n,w,ws=`${w}s`)=>`${n} ${n===1?w:ws}`;
  const regimeWords=r=>{const L=eco()?.regionLaws(r.rank);return L?.lake?'a lake of melt':'a crystal plain';};
  const posOf=s=>{const x=siteOfSubject(s),r=ref.clone();if(!x)return new THREE.Vector3(r.x,4,r.z);const p=near(x.x,x.z,r);p.y=4;return p;};
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  // (a run's evidence as recorded: verified, observed or reported, its category, how many files: never their names)
  const runOf=(c,how)=>`${c.evidence==='verified'?'verified':c.evidence==='observed'?'observed':'reported'} ${how} ${c.detail?.category||'test'} run`;
  function describe(c){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length,pos=posOf(s);
    switch(c.intent){
      case 'subsystem.created':{const r=eco()?.regions.find(q=>q.id===s.groupId);return {text:'A region forms',sub:s.groupId?`${ctx.name(s.groupId)}${r?` · ${regimeWords(r)}`:''}`:'',position:pos};}
      case 'module.created':return {text:'A crystal nucleates',sub:s.groupId?ctx.name(s.groupId):'',position:pos};
      case 'structure.created':return {text:'A crystal grows taller',sub:plural(d.count||1,'symbol'),position:pos};
      case 'structure.removed':return {text:'Matter melts back',sub:'structure removed',position:pos};
      case 'subsystem.connected':return {text:d.first?'A channel opens between two regions':'Heat surges along a channel',sub:'a recorded dependency',position:pos};
      case 'validation.failed':return {text:n?`Tests fail · the crystal over ${plural(n,'file')} fractures`:'A failure without files · the crystal crazes',sub:`${runOf(c,'failing')}${n?` · ${plural(n,'file')}`:' · no files attributed'}`,position:pos,color:'#ff9a7a'};
      case 'validation.passed':return {text:'Tests pass · the matter anneals',sub:`${runOf(c,'passing')}${n?` · ${plural(n,'file')}`:''}`,position:pos,color:'#e6eef2'};
      case 'validation.recovered':return {text:'Recovered · the grains sinter back into crystal',sub:`${runOf(c,'passing')} after the failure${d.repaired?` · ${plural(d.repaired,'file')} repaired`:''}`,position:pos,color:'#fff0d8',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the matter re-forms',sub:`${plural(d.removedSymbols||0,'symbol')} removed`,position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=(d.kinds||[]).map(x=>MILESTONE[x]||x).join(' · ')||'Milestone';const v=c.evidence==='verified';
        return {text:`Phase transition · ${k}`,sub:v?`verified evidence${n?` · ${plural(n,'file')}`:''} · the sea freezes; monumental crystals rise, one crystal around them (lasting)`:'without verified evidence · a local freeze, nothing lasting',position:pos,...(v&&c.tier>=3?{banner:k,bannerSub:'milestone · verified by a passing test run'}:{})};}
      case 'repository.checkpoint':return {text:'Committed · the matter consolidates',sub:n?`commit observed · ${plural(n,'file')}`:'commit observed',position:pos};
      case 'world.expanded':return {text:`A new chapter · the sea re-forms`,sub:'accumulated structure',position:pos};
      case 'agent.collision':return {text:'Two agents work in one place · their heat meets',sub:(d.providers||[]).map(id=>presence(id).display).join(' · '),position:pos};
      default:return null;}}
  // The glass box (private): what was observed, how it was interpreted, which law responded, what is artistic. The same
  // mapping as genesis-matter.js (its causal log carries the rule as applied).
  const EXPLAIN={
    'subsystem.created':['a new subsystem in the recorded structure','a region of the sea, seated by birth order, its territory by its live files','its laws (climate, habit) drawn from the project\'s Lawbook; a re-forming ring from its seat'],
    'module.created':['a new file','a site in its region: a cold spot that holds a crystal','a nucleus at the site grows through the melt'],
    'structure.created':['new symbols in a file','structure at the file\'s site','its crystal column grows taller'],
    'structure.removed':['symbols removed from a file','structure at the file\'s site','heat melts its crystal back; the column sinks'],
    'subsystem.connected':['a static dependency recorded between two subsystems (never runtime execution)','coupling between their regions','a channel held molten from the importer\'s seat to the imported\'s; a surge of heat along it'],
    'validation.failed':['an observed failing run, with the files it covers when known','stress at those files\' sites while they fail','stress spreads through connected crystal; past its strength (a law of the matter) it breaks into grains'],
    'validation.passed':['an observed passing run','those files\' matter annealed','a cooling contact: nearby melt crystallises'],
    'validation.recovered':['a passing run after a failure (verified)','the stress removed','a sintering front fuses the grains into new crystal, leaving seams'],
    'refactor.validated':['a validated refactor','the matter around it re-forms','a re-forming ring'],
    'milestone.achieved':['a milestone (its evidence as recorded; the director\'s spectacle budget decides its scale)','a phase transition','a freeze across the sea from its files; for verified evidence only, monumental crystals and one coherent crystal around them (lasting)'],
    'repository.checkpoint':['an observed commit','consolidation of the committed files','a restrained cooling'],
    'world.expanded':['the project entered a new chapter (accumulated structure)','expansion','a ring of re-formation across the sea'],
    'agent.collision':['two agents observed in the same file or subsystem','their influences meet (no progress credited)','heat at that place'],
    'agent.state':['an agent used a tool on a file','work in progress','heat: the file\'s matter melts, glows (in the agent\'s colour) and froths while it lasts']};
  function explain(c){const x=EXPLAIN[c?.intent||c?.type];return x?{observed:x[0],interpreted:x[1],rule:x[2],artistic:'every shape, colour and motion of the response is an artistic expression of that recorded fact'}:null;}
  function subsystemLabels(){const r0=ref.clone();return regionsLive().map(r=>{const p=near(r.x,r.z,r0);p.y=3;return {position:p,text:ctx.name(r.id),sub:`${regimeWords(r)} · ${plural(r.files,'file')}`};});}
  const pv=new THREE.Vector3();
  function pick(x,y,cm){const e=eco();if(!e)return null;let best=null,bd=.03;const r0=ref.clone();
    for(const s of e.sites){const p=near(s.x,s.z,r0);p.y=2;pv.copy(p).project(cm);const d=Math.hypot(pv.x-x,(pv.y-y)*.7);if(pv.z<1&&d<bd){bd=d;best=s.id;}}
    if(!best)for(const r of regionsLive()){const p=near(r.x,r.z,r0);pv.copy(p).project(cm);const d=Math.hypot(pv.x-x,(pv.y-y)*.7);if(pv.z<1&&d<bd*5){bd=d/5;best=`r:${r.id}`;}}
    return best;}
  function inspect(id){const e=eco();if(!e||!id)return null;const r0=ref.clone();
    if(id.startsWith('r:')){const r=e.regions.find(q=>q.id===id.slice(2));if(!r)return null;const p=near(r.x,r.z,r0);p.y=3;
      const last=[...e.log].reverse().find(x=>x.regions?.includes(r.rank));
      return {position:p,text:`${ctx.name(r.id)} · ${regimeWords(r)}`,sub:`${plural(r.files,'file')}${last?` · last: ${last.what} → ${last.rule}`:''}`};}
    const s=e.sites.find(q=>q.id===id);if(!s)return null;const r=e.regions[s.region];const p=near(s.x,s.z,r0);p.y=2;
    return {position:p,text:`A site of ${r?ctx.name(r.id):'a region'}`,sub:plural(s.w,'symbol')};}
  function stats(){const e=eco();return {matter:e?e.stats():null,instances:geo.instanceCount,agents:agentsNow,restoring:!!view?.restoring,music:e?e.musicLog.slice(-4).map(x=>({kind:x.kind,what:x.what,rule:x.rule})):[],
    generation:view?.generation??null,causal:e?e.log.slice(-6).map(x=>({kind:x.kind,what:x.what,rule:x.rule})):[],driver:!!driver,
    // (for the live measurements: the camera's distance, the harmony, how long ago the latest musical moment and freeze)
    sample:e?{camera:lastGoal?+lastGoal.distance.toFixed(1):null,harmony:e.harmony.T,music:(m=>m?{kind:m.kind,age:+((e.tick-m.tick)/HZ).toFixed(1)}:null)(e.musicLog.at(-1)),
      freeze:(m=>m?+((e.tick-m.tick)/HZ).toFixed(1):null)([...e.log].reverse().find(x=>x.kind==='freeze'))}:null};}
  function rebuild(){haveRef=false;}
  function dispose(){scene.remove(quad);for(const x of disposables)x.dispose?.();clusters.clear();}
  // Qualification only (the review films, qualification/visual/genesis-g3-film.js): a locked camera ({x, z, y, distance,
  // azimuth, elevation, fov}, or null), and the music's forces off from a performance time (a new matter driver on the
  // same timeline: until that time its states are the player's, digest for digest).
  function qualify(o={}){
    if(o.camera!==undefined)lock=o.camera;
    if(o.silentFrom!==undefined){driver?.dispose?.();driver=ctx.matter?.create(createMatterGrammar({recipe,silentFrom:o.silentFrom}))||null;lastEco=null;}
    return {stages:(eco()?.stages||[]).map(S=>({rank:S.rank,x:S.x,z:S.z,R:S.R,fold:S.fold})),silent:o.silentFrom??null};
  }
  return {rebuild,update,cameraGoal,afterCamera,grade,effect(){},describe,explain,subsystemLabels,pick,inspect,stats,dispose,qualify,
    agentColor:a=>AGENT_COLORS[seatOf(a)],get driver(){return driver;}};
}

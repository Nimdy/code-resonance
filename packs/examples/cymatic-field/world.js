// Cymatic Field: a Code Resonance world family (Visual Pack SDK 1) by Halcyon Visuals, a fictional outside studio.
// Written only against the SDK documentation (docs/packs): nothing here imports or knows Code Resonance internals.
//
// Every subsystem is a resonant plate in a dark hall. Sand gathers on each plate's nodal lines (Chladni figures): a
// module brings a handful of grains, every symbol a pinch, so the figures grow denser as the code grows. The plates
// slowly morph between modes while nothing happens (idle life) and vibrate with the beat. Failing tests make a plate
// dissonant (its sand scatters, red flicker), passing tests ring it clear, verified milestones leave golden halos that
// stay (rebuilt after a seek from the director's lasting record), commits send a standing wave through the hall.
// Each plate holds a bed of sand from the moment its subsystem appears; every module and symbol adds more.
// Agents are tuning forks hovering over the plate they work on, exciting ripples. Dependencies between subsystems are
// sympathetic bridges carrying a standing wave.
export function createWorld(sdk){
  const {THREE,scene,model,params,util}=sdk;
  const glsl=name=>sdk.assets.text(`shaders/${name}`);
  const COMMON=glsl('common.glsl');
  const MAXP=48,MAXA=8,RINGS=48,R=1.6;
  const pal=k=>(sdk.palette[k]||new THREE.Color('#ffffff')).clone();
  const GOLD=new THREE.Color('#ffcf7a');
  const TONE={warm:new THREE.Color('#ffd9a0'),cool:new THREE.Color('#bfe6ff'),iridescent:new THREE.Color('#e9c8ff')}[params.sandTone]||new THREE.Color('#ffd9a0');
  const ROLE={core:'highlight',interface:'secondary',services:'accent',model:'primary',logic:'primary',tests:'valid'};
  const STATE_COLOR={draft:new THREE.Color('#6d7891'),committed:pal('highlight'),validated:GOLD.clone().multiplyScalar(1.4),stressed:pal('warning').multiplyScalar(1.5)};
  const AGENT=['#ff9ee8','#ffd27a','#9dffcf','#a7b8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'].map(c=>new THREE.Color(c));
  const shared={uT:{value:0},uSpeed:{value:1},uBeat:{value:0}};
  const additive={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending};
  const vec4s=n=>Array.from({length:n},()=>new THREE.Vector4());
  // ---- Plates --------------------------------------------------------------------------------------------------
  const disc=new THREE.CircleGeometry(1,96);
  const plates=sdk.buffers.instanced(disc,{iA:4,iS:4,iCol:3},MAXP);
  const plateMat=new THREE.ShaderMaterial({uniforms:{...shared,uAgents:{value:vec4s(MAXA)},uDeep:{value:pal('deep')},uGold:{value:GOLD},uWarn:{value:pal('warning')}},
    vertexShader:glsl('plate.vert'),fragmentShader:COMMON+glsl('plate.frag'),side:THREE.DoubleSide});
  const plateMesh=new THREE.Mesh(plates.geometry,plateMat);plateMesh.frustumCulled=false;scene.add(plateMesh);
  // ---- Sand -----------------------------------------------------------------------------------------------------
  const sand=sdk.buffers.points({aPlate:1,aHome:2,aSeed:1,aLife:2},4096);
  const sandU={...shared,uPlateA:{value:vec4s(MAXP)},uModes:{value:vec4s(MAXP)},uPlateS:{value:vec4s(MAXP)},uPlateCol:{value:Array.from({length:MAXP},()=>new THREE.Color())},
    uPx:{value:1},uSymmetry:{value:params.symmetry==='radial'?1:0},uShimmer:{value:params.shimmer??.6},uScatter:{value:0}};
  const sandMat=new THREE.ShaderMaterial({uniforms:sandU,vertexShader:COMMON+glsl('sand.vert'),fragmentShader:glsl('sand.frag'),...additive});
  const sandPoints=new THREE.Points(sand.geometry,sandMat);sandPoints.frustumCulled=false;scene.add(sandPoints);
  // ---- Resonators (one pin per module) ----------------------------------------------------------------------------
  const cylinder=new THREE.CylinderGeometry(1,1,1,8,1);
  const pins=sdk.buffers.instanced(cylinder,{iPos:4,iCol:3},128);
  const pinMat=new THREE.ShaderMaterial({uniforms:{...shared},vertexShader:glsl('pin.vert'),fragmentShader:glsl('pin.frag')});
  const pinMesh=new THREE.Mesh(pins.geometry,pinMat);pinMesh.frustumCulled=false;scene.add(pinMesh);
  // ---- Sympathetic bridges (dependencies across subsystems) -----------------------------------------------------
  const SEG=24,arcGeo=new THREE.BufferGeometry();
  const arcMat=new THREE.ShaderMaterial({uniforms:{...shared,uHeight:{value:params.arcHeight??1},uAccent:{value:pal('accent')},uGold:{value:GOLD}},
    vertexShader:COMMON+glsl('arc.vert'),fragmentShader:glsl('arc.frag'),...additive});
  const arcLines=new THREE.LineSegments(arcGeo,arcMat);arcLines.frustumCulled=false;scene.add(arcLines);
  // ---- Effect rings (pooled) --------------------------------------------------------------------------------------
  const quad=new THREE.PlaneGeometry(2,2);
  const rings=sdk.buffers.instanced(quad,{rA:4,rB:4},RINGS);
  const ringMat=new THREE.ShaderMaterial({uniforms:{...shared},vertexShader:glsl('ring.vert'),fragmentShader:glsl('ring.frag'),...additive,side:THREE.DoubleSide});
  const ringMesh=new THREE.Mesh(rings.geometry,ringMat);ringMesh.frustumCulled=false;scene.add(ringMesh);
  // ---- Agents and golden dust ------------------------------------------------------------------------------------
  const pointU=mode=>({...shared,uDust:{value:0},uPx:{value:1},uExtent:{value:8},uMode:{value:mode}});
  const agentPts=sdk.buffers.points({pA:4,pB:4},MAXA);
  const agentMat=new THREE.ShaderMaterial({uniforms:pointU(0),vertexShader:COMMON+glsl('point.vert'),fragmentShader:glsl('point.frag'),...additive});
  const agentPoints=new THREE.Points(agentPts.geometry,agentMat);agentPoints.frustumCulled=false;scene.add(agentPoints);
  const DUST=420,dust=sdk.buffers.points({pA:4,pB:4},DUST);
  const dustMat=new THREE.ShaderMaterial({uniforms:pointU(1),vertexShader:COMMON+glsl('point.vert'),fragmentShader:glsl('point.frag'),...additive});
  const dustPoints=new THREE.Points(dust.geometry,dustMat);dustPoints.frustumCulled=false;scene.add(dustPoints);
  // ---- The hall (background) -------------------------------------------------------------------------------------
  const skyU={...shared,uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uCentre:{value:new THREE.Vector2()},uExtent:{value:8},uDeep:{value:pal('deep')},uHaze:{value:pal('haze')},uAccent:{value:pal('accent')},uGold:{value:GOLD},
    uAurora:{value:0},uDistant:{value:0}};
  const sky=new THREE.ShaderMaterial({uniforms:skyU,vertexShader:sdk.glsl.BACKGROUND_VS,fragmentShader:COMMON+glsl('sky.frag'),depthTest:false,depthWrite:false});
  // ---- Structure -------------------------------------------------------------------------------------------------
  const secs=ms=>Number.isFinite(ms)?(ms-model.epoch)/1000:(ms<0?-1e5:1e9);
  let built=-1,builtQuality=-1,plateList=[],plateIndex=new Map(),pinList=[],pinOf=new Map(),grains=0,arcCount=0,arcKeys=[],extent=6,centre=new THREE.Vector3(),flashAt=-1e5;
  const transient=Array.from({length:MAXP},()=>({strike:-1e5,pass:-1e5,fail:-1e5}));
  let resonance=new Array(MAXP).fill(0);
  // Axial coordinates of the i-th cell of a hexagonal spiral (stable as subsystems are added).
  function hexSpiral(i){if(i===0)return [0,0];let ring=1,start=1;while(start+6*ring<=i){start+=6*ring;ring++;}
    const k=i-start,side=Math.floor(k/ring),step=k%ring,dirs=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
    let q=-ring,r=ring;for(let s=0;s<side;s++){q+=dirs[s][0]*ring;r+=dirs[s][1]*ring;}return [q+dirs[side][0]*step,r+dirs[side][1]*step];}
  function build(frame){
    built=model.version;builtQuality=frame?.quality??0;
    const ds=[...model.districts.values()].filter(d=>model.districtBorn(d)<Infinity).sort((a,b)=>a.order-b.order||(a.id<b.id?-1:1)).slice(0,MAXP);
    const S=2*R*1.08*(params.plateSpacing??1);
    plateList=ds.map((d,i)=>{const [q,r]=hexSpiral(i);return {d,i,x:(Math.sqrt(3)*q+Math.sqrt(3)/2*r)*S,z:1.5*r*S,color:pal(ROLE[d.role]||'primary').lerp(TONE,.5)};});
    plateIndex=new Map(plateList.map(p=>[p.d.id,p]));
    centre.set(0,0,0);for(const p of plateList)centre.add(new THREE.Vector3(p.x,0,p.z));if(plateList.length)centre.divideScalar(plateList.length);
    extent=Math.max(4,...plateList.map(p=>Math.hypot(p.x-centre.x,p.z-centre.z)+R*1.2));
    plates.ensure(Math.max(1,plateList.length));
    for(const p of plateList){plates.write('iA',p.i,p.x,p.z,R,secs(model.districtBorn(p.d)));plates.write('iCol',p.i,p.color.r,p.color.g,p.color.b);
      sandU.uPlateA.value[p.i].set(p.x,p.z,R,secs(model.districtBorn(p.d)));sandU.uPlateCol.value[p.i].copy(p.color);}
    plates.commit(plateList.length);
    // Resonators: golden-angle placement by module order, stable as modules are added.
    pinList=[];pinOf=new Map();
    for(const p of plateList){const mods=p.d.members.map(id=>model.modules.get(id)).filter(Boolean).sort((a,b)=>a.order-b.order);
      mods.forEach((m,k)=>{const a=k*2.39996+util.rand(util.hash(p.d.id))*6.283,rr=R*.88*Math.sqrt((k+.5)/(k+6));
        const pin={m,plate:p,x:p.x+Math.cos(a)*rr,z:p.z+Math.sin(a)*rr};pinList.push(pin);pinOf.set(m.id,pin);});}
    pins.ensure(Math.max(1,pinList.length));
    // Sand: a bed per plate, a handful per module, a pinch per symbol, within the grain budget (halved at the lower live
    // qualities, so a large project keeps its figures and the frame time).
    const budget=Math.round(Math.min(72000,62000*(params.grainDensity??1))*(builtQuality>=2?.5:1));
    const BED=1600,MODULE=220,SYMBOL=60;
    const want=plateList.length*BED+pinList.reduce((n,pin)=>n+MODULE+SYMBOL*pin.m.symbols.size,0),scale=Math.min(1,budget/Math.max(1,want));
    let g=0;sand.ensure(Math.max(1,Math.ceil(want*scale)+pinList.length+plateList.length));
    const add=(id,count,plate,born,removed)=>{for(let j=0;j<count;j++){const h=util.hash(`${id}/${j}`),u=util.rand(h),v=util.rand(h^0x5bd1e995),r=Math.sqrt(u)*.96,a=v*6.2832;
      sand.write('aPlate',g,plate);sand.write('aHome',g,Math.cos(a)*r,Math.sin(a)*r);sand.write('aSeed',g,util.rand(h^0x2545f491)*97.3);sand.write('aLife',g,born,removed);g++;}};
    for(const p of plateList)add(`bed/${p.d.id}`,Math.round(BED*scale),p.i,secs(model.districtBorn(p.d)),1e9);
    for(const pin of pinList){const m=pin.m;add(m.id,Math.max(8,Math.round(MODULE*scale)),pin.plate.i,secs(model.bornAt(m)),m.removed===null?1e9:secs(m.removed));
      for(const sid of m.symbols){const s=model.symbols.get(sid);if(s)add(sid,Math.max(2,Math.round(SYMBOL*scale)),pin.plate.i,secs(model.bornAt(s)),s.removed===null?1e9:secs(s.removed));}}
    grains=g;sand.commit(g);
    // Bridges: dependencies across subsystems, at most three per pair of plates (the earliest).
    const perPair=new Map(),links=[...model.links.values()].filter(l=>l.cross).sort((a,b)=>model.bornAt(a)-model.bornAt(b));
    const chosen=[];for(const l of links){const a=pinOf.get(l.a),b=pinOf.get(l.b);if(!a||!b||a.plate===b.plate)continue;const key=[a.plate.i,b.plate.i].sort().join('-');const n=perPair.get(key)||0;if(n>=3)continue;perPair.set(key,n+1);chosen.push({l,a,b});}
    arcGeo.dispose();arcKeys=chosen.map(c=>c.l.key);arcCount=chosen.length;
    const n=Math.max(1,arcCount)*SEG*2,A=new Float32Array(n*3),B=new Float32Array(n*3),I=new Float32Array(n*4),P=new Float32Array(n*3);
    chosen.forEach(({l,a,b},k)=>{const seed=util.rand(util.hash(l.key))*10,born=secs(model.bornAt(l));
      for(let s=0;s<SEG;s++)for(let e=0;e<2;e++){const v=(k*SEG+s)*2+e;A.set([a.x,.3,a.z],v*3);B.set([b.x,.3,b.z],v*3);I.set([(s+e)/SEG,seed,born,-1e5],v*4);}});
    arcGeo.setAttribute('position',new THREE.BufferAttribute(P,3));arcGeo.setAttribute('aA',new THREE.BufferAttribute(A,3));arcGeo.setAttribute('aB',new THREE.BufferAttribute(B,3));
    arcGeo.setAttribute('aInfo',new THREE.BufferAttribute(I,4));arcGeo.setDrawRange(0,arcCount*SEG*2);
    // Golden dust (an ambient layer unlocked by verified milestones).
    for(let i=0;i<DUST;i++){const h=util.hash(`dust/${i}`),a=util.rand(h)*6.2832,r=Math.sqrt(util.rand(h^7))*extent*1.1;
      dust.write('pA',i,centre.x+Math.cos(a)*r,centre.z+Math.sin(a)*r,util.rand(h^13),.5+util.rand(h^17)*.8);dust.write('pB',i,GOLD.r,GOLD.g,GOLD.b,.8);}
    dust.commit(DUST);
    lasting();
  }
  // Lasting resonance: one halo per verified milestone that touched a plate (from the director's lasting record).
  function lasting(){
    resonance=new Array(MAXP).fill(0);
    for(const l of sdk.director.lasting()){if(l.effect!=='resonance')continue;const touched=new Set();
      for(const id of l.subject?.fileIds||[]){const pin=pinOf.get(id);if(pin)touched.add(pin.plate.i);}
      for(const i of touched)resonance[i]=Math.min(4,resonance[i]+l.count);}
  }
  // ---- Modes: the figure each plate shows, morphing slowly between two modes (idle life) ---------------------------
  function modeFor(i,k,order){const h=util.hash(`${i}/${k}`),m=1+(h%order),n=m+1+((h>>>8)%Math.max(1,order-m+2));return [m,n];}
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  function updatePlates(frame){
    const bar=240/(frame.mood?.tempo||92),period=(params.morphBars||16)*bar,global=Math.floor(Math.log2(1+model.totals(frame.t).modules/6));
    for(const p of plateList){
      const order=(params.baseOrder||3)+global+resonance[p.i],phase=frame.tview/period+util.rand(util.hash(p.d.id))*3,k=Math.floor(phase),f=phase-k;
      const [m1,n1]=modeFor(p.i,k,order),[m2,n2]=modeFor(p.i,k+1,order);
      sandU.uModes.value[p.i].set(m1,n1,m2,n2);
      const tr=transient[p.i],sp=sdk.speed(),fail=(frame.tsec-tr.fail)/sp,pass=(frame.tsec-tr.pass)/sp;
      const chaos=fail>=0&&fail<8?smooth(fail/.4)*(1-smooth((fail-5)/3)):0,glow=pass>=0&&pass<4?1-pass/4:0;
      sandU.uPlateS.value[p.i].set(smooth((f-.55)/.45),chaos,glow,0);
      plates.write('iS',p.i,tr.strike,tr.pass,tr.fail,resonance[p.i]);
    }
    plates.flush();
  }
  // ---- Agents: tuning forks over the plate they work on, gliding from their previous place ---------------------
  const agentState=new Map();
  function placeOf(fileId){const pin=fileId&&pinOf.get(fileId);return pin?new THREE.Vector3(pin.x,1.6,pin.z):null;}
  function agentTarget(a,frame){
    const trail=sdk.agents.trail?.(a.id,frame.t,600000)||[];const files=trail.filter(e=>e.fileId).map(e=>e.fileId);
    const now=placeOf(a.fileId||a.home)||centre.clone().setY(2.4),prev=placeOf(files.at(-2))||now;
    const k=smooth(a.since/1200),p=prev.clone().lerp(now,k),seed=util.rand(util.hash(a.id))*6.28,w=frame.tview*.7+seed;
    return p.add(new THREE.Vector3(Math.cos(w)*.45,Math.sin(w*1.3)*.15,Math.sin(w)*.45));
  }
  function updateAgents(frame){
    const list=frame.agents.slice(0,MAXA);let n=0;agentState.clear();
    for(const a of list){const p=agentTarget(a,frame),c=AGENT[a.voice%8];agentState.set(a.id,p);
      agentPts.write('position',n,0,0,0);agentPts.write('pA',n,p.x,p.y,p.z,a.busy?1.3:.8);agentPts.write('pB',n,c.r,c.g,c.b,a.alpha);
      plateMat.uniforms.uAgents.value[n].set(p.x,p.z,(a.busy?1:.35)*a.alpha,util.rand(util.hash(a.id))*6.28);n++;}
    for(let i=n;i<MAXA;i++)plateMat.uniforms.uAgents.value[i].set(0,0,0,0);
    agentPts.commit(n);
  }
  function updatePins(frame){
    pinList.forEach((pin,i)=>{const m=pin.m,state=model.stateAt(m,frame.t),c=STATE_COLOR[state]||STATE_COLOR.draft,h=.35+.07*Math.min(14,model.symbolsAt(m,frame.t));
      const gone=m.removed!==null&&m.removed<=frame.t;pins.write('iPos',i,pin.x,pin.z,gone?0:h,secs(model.bornAt(m)));pins.write('iCol',i,c.r,c.g,c.b);});
    pins.commit(pinList.length);
  }
  // ---- Effects ---------------------------------------------------------------------------------------------------
  let nextRing=0;
  function ring(x,z,radius,color,duration,at){const i=nextRing++%RINGS;rings.write('rA',i,x,z,radius,secs(at));rings.write('rB',i,color.r,color.g,color.b,duration);rings.flush();}
  for(let i=0;i<RINGS;i++)rings.write('rA',i,0,0,0,-1e5);rings.commit(RINGS);
  const platesOf=s=>{const out=new Set();if(s.groupId&&plateIndex.has(s.groupId))out.add(plateIndex.get(s.groupId));
    for(const id of [s.fileId,s.targetId,...(s.fileIds||[])])if(id&&pinOf.has(id))out.add(pinOf.get(id).plate);return [...out];};
  function effect(cmd){
    const s=cmd.subject||{},at=cmd.at,k=Math.max(.4,Math.min(1.6,cmd.scale)),tsec=secs(at),hit=platesOf(s),pin=pinOf.get(s.fileId);
    switch(cmd.effect){
      case 'plate-strike':for(const p of hit){transient[p.i].strike=tsec;ring(p.x,p.z,R*2.4,p.color,3,at);}break;
      case 'pin-rise':if(pin)ring(pin.x,pin.z,.9,pin.plate.color,1.6,at);break;
      case 'grain-shower':if(pin)ring(pin.x,pin.z,.5+.6*k,TONE,1.4,at);break;
      case 'grain-scatter':if(pin)ring(pin.x,pin.z,1.2,pal('warning'),2,at);break;
      case 'sympathetic-bridge':{const key=s.fileId&&s.targetId?`${s.fileId}>${s.targetId}`:null,ai=arcKeys.indexOf(key);
        if(ai>=0){const I=arcGeo.attributes.aInfo;for(let v=ai*SEG*2;v<(ai+1)*SEG*2;v++)I.setW(v,tsec);I.needsUpdate=true;}
        for(const p of hit)ring(p.x,p.z,R*1.6,pal('accent'),2.4,at);break;}
      case 'dissonance':for(const p of hit){transient[p.i].fail=tsec;ring(p.x,p.z,R*1.8,pal('warning'),2.6,at);}break;
      case 'clear-tone':for(const p of hit)transient[p.i].pass=tsec;break;
      case 'retune':for(const p of hit){transient[p.i].pass=tsec;transient[p.i].fail=-1e5;ring(p.x,p.z,R*2,pal('valid'),3,at);}break;
      case 'mode-shift':for(const p of hit){transient[p.i].strike=tsec;ring(p.x,p.z,R*2.2,GOLD,3.4,at);}break;
      case 'resonance':lasting();flashAt=tsec;for(const p of hit.length?hit:plateList.slice(0,1)){transient[p.i].pass=tsec;ring(p.x,p.z,R*3.4,GOLD,4.5,at);}break;
      case 'standing-wave':ring(centre.x,centre.z,extent*1.4,pal('highlight'),4,at);for(const p of hit)transient[p.i].strike=tsec;break;
      case 'new-harmonic':ring(centre.x,centre.z,extent*1.8,GOLD,5,at);break;
    }
  }
  // ---- Frame -----------------------------------------------------------------------------------------------------
  function update(frame){
    if(model.version!==built||(frame.quality>=2)!==(builtQuality>=2))build(frame);
    shared.uT.value=frame.tsec;shared.uSpeed.value=sdk.speed();shared.uBeat.value=frame.beat*(.4+.6*(sdk.recipe.genome.music?.beatPulse??.5));
    const px=sdk.renderer?Math.max(1,sdk.renderer.getPixelRatio()):1;sandU.uPx.value=px;agentMat.uniforms.uPx.value=px;dustMat.uniforms.uPx.value=px;
    const unlock=name=>frame.unlocks.find(u=>u.name===name)?.level||0;
    dustMat.uniforms.uDust.value=unlock('golden-dust');dustMat.uniforms.uExtent.value=extent;skyU.uAurora.value=unlock('aurora-field');skyU.uDistant.value=unlock('distant-plates');
    sandU.uShimmer.value=(params.shimmer??.6)*(1+unlock('overtones')*.6);
    updatePlates(frame);updatePins(frame);updateAgents(frame);
  }
  function cameraGoal(frame){
    const att=sdk.director.attentionAt(frame.t,2),since=att?(frame.t-att.at)/sdk.speed()/1000:Infinity,target=centre.clone();
    if(since<12){const p=platesOf(att.subject||{})[0];if(p)target.lerp(new THREE.Vector3(p.x,0,p.z),.3*(1-since/12));}
    const drift=params.drift??.6;
    return {target,distance:extent*1.45+3.5,azimuth:.7+frame.tview*.012*drift+Math.sin(frame.tview*.035)*.3,elevation:params.cameraTilt??.75,fov:38,omega:.55};
  }
  function background(){skyU.uCentre.value.set(centre.x,centre.z);skyU.uExtent.value=extent;skyU.uInv.value.multiplyMatrices(sdk.camera.projectionMatrix,sdk.camera.matrixWorldInverse).invert();skyU.uCam.value.copy(sdk.camera.position);return sky;}
  function grade(frame){const L=sdk.recipe.genome.light||{},f=(frame.tsec-flashAt)/sdk.speed();
    return {bloom:L.bloom??1,threshold:L.bloomThreshold??.7,exposure:(L.exposure??1)*1.05,contrast:L.contrast??1,saturation:1.08,vignette:L.vignette??.3,grain:L.grain??.025,flash:f>=0&&f<1.2?(1-f/1.2)*.5:0};}
  // ---- Words (generic vocabulary and the names the SDK provides; never anything about the code itself) -----------
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  function describe(cmd){
    const s=cmd.subject||{},d=cmd.detail||{},hit=platesOf(s),p=hit[0],pin=pinOf.get(s.fileId);
    const position=pin?new THREE.Vector3(pin.x,.8,pin.z):p?new THREE.Vector3(p.x,.6,p.z):centre.clone().setY(.6);
    const n=(s.fileIds||[]).length||d.count||1,name=p?sdk.name(p.d.id):'the hall';
    switch(cmd.effect){
      case 'plate-strike':return {text:`A new plate is struck · ${name}`,sub:'a new subsystem',position};
      case 'pin-rise':return {text:'A resonator rises',sub:name,position};
      case 'grain-shower':return {text:'New structure · sand gathers',sub:name,position};
      case 'grain-scatter':return {text:'Structure removed · sand scatters',sub:name,position};
      case 'sympathetic-bridge':{const q=hit[1];return {text:d.first?'Integration · two plates resonate together':'A sympathetic bridge strengthens',sub:p&&q?`${sdk.name(p.d.id)} ↔ ${sdk.name(q.d.id)}`:'',position};}
      case 'dissonance':return {text:`Dissonance · tests fail on ${plural(n,'resonator')}`,sub:'observed failing run',position,color:'#ff9a86'};
      case 'clear-tone':return {text:`Clear tone · ${plural(n,'resonator')} in tune`,sub:'observed passing run',position};
      case 'retune':return {text:`Retuned · ${plural(d.repaired||n,'resonator')} in tune again`,sub:'the tests pass again',position,banner:'Recovery',bannerSub:'the tests pass again'};
      case 'mode-shift':return {text:'Refactor validated · the figure changes mode',sub:'verified by a passing test run',position,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'resonance':{const kinds=(Array.isArray(d.kinds)?d.kinds:[]).map(k=>k.replace(/-/g,' '));return {text:`Resonance · ${kinds.join(' + ')||'a harmonic locks'}`,sub:'verified by a passing test run',position,
        banner:kinds.length?kinds.join(' · '):'Resonance',bannerSub:'milestone · verified by a passing test run'};}
      case 'standing-wave':return {text:n?`Committed · a standing wave crosses ${plural(n,'resonator')}`:'Committed · the figures are set',sub:'commit observed',position};
      case 'new-harmonic':return {text:`A new harmonic · chapter ${d.chapter}`,sub:'accumulated structure',position:centre.clone().setY(1)};
      default:return null;
    }
  }
  function agentPosition(id){return agentState.get(id)||null;}
  function agentColor(a){return `#${AGENT[a.voice%8].getHexString()}`;}
  function subsystemLabels(){return plateList.map(p=>({position:new THREE.Vector3(p.x,.6,p.z+R*1.25),text:sdk.name(p.d.id),sub:`${p.d.role} · ${plural(p.d.members.length,'resonator')}`}));}
  function status(frame){let tune=0,diss=0;for(const pin of pinList){const s=model.stateAt(pin.m,frame.t);if(s==='validated')tune++;else if(s==='stressed')diss++;}
    return diss?`${diss} dissonant`:tune?`${tune} in tune`:'';}
  function pick(x,y,camera){let best=null,dist=.04;for(const pin of pinList){const v=new THREE.Vector3(pin.x,.5,pin.z).project(camera);const d=Math.hypot(v.x-x,v.y-y);if(d<dist){dist=d;best=pin.m.id;}}return best;}
  function inspect(id,frame){const pin=pinOf.get(id);if(!pin)return null;
    return {position:new THREE.Vector3(pin.x,1,pin.z),text:`A resonator · ${model.stateAt(pin.m,frame.t)}`,sub:`${plural(model.symbolsAt(pin.m,frame.t),'pinch')} of sand · ${sdk.name(pin.plate.d.id)}`};}
  // After a seek: transient effects from another moment are cleared; lasting halos are rebuilt from history.
  function onPrime(){for(const tr of transient){tr.strike=tr.pass=tr.fail=-1e5;}for(let i=0;i<RINGS;i++)rings.write('rA',i,0,0,0,-1e5);rings.flush();flashAt=-1e5;
    if(arcGeo.attributes.aInfo){const I=arcGeo.attributes.aInfo;for(let v=0;v<I.count;v++)I.setW(v,-1e5);I.needsUpdate=true;}lasting();}
  function stats(){return {plates:plateList.length,resonators:pinList.length,grains,bridges:arcCount,halos:resonance.reduce((a,b)=>a+b,0),symmetry:params.symmetry,tone:params.sandTone};}
  function dispose(){for(const o of [plateMesh,sandPoints,pinMesh,arcLines,ringMesh,agentPoints,dustPoints]){scene.remove(o);o.geometry.dispose();o.material.dispose();}
    disc.dispose();cylinder.dispose();quad.dispose();sky.dispose();}
  function rebuild(){built=-1;}
  return {rebuild,update,cameraGoal,background,grade,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,onPrime,stats,dispose};
}

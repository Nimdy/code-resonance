// The artist canvas: a deliberately quiet world for compositions that build their own image from layers (layers.js).
// It is never chosen for a project: a composition whose base is "canvas" asks for it. It still receives everything a
// flagship world does (the project's structure, canonical intents, observed agents, the music through info.music),
// and shows it with restraint: a horizon, a floor whose faint marks are the project's subsystems (sized by their
// modules, warming where verified milestones were reached, cooling while their tests fail), ripples for canonical
// events, and a slowly orbiting camera. The composition's layers anchor to those subsystems (compose.anchors).
// Positions come from the Construct's persisted hexagonal site plan (module q, r), scaled to the canvas, so the same
// project always has the same arrangement and every project its own.
import {THREE,BACKGROUND_VS,clamp,lerp,smooth,hash,rand} from './core.js';
const SQ3=Math.sqrt(3),MARKS=24,RIPPLES=8,MAX_AGENTS=8;
const AGENT_COLORS=['#ffe29a','#9dffcf','#ff9ee8','#a7c8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'].map(c=>new THREE.Color(c));
const DEFAULTS={background:'#04060c',horizon:'#14223a',orbit:.25,distance:1,floor:.4};
const SKY_FS=`varying vec2 vUv;uniform vec3 uTop,uHorizon,uCam;uniform mat4 uInv;uniform float uTime,uGlow,uStars;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
void main(){vec4 w=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(w.xyz/w.w-uCam);float e=d.y;
  vec3 c=mix(uHorizon,uTop,smoothstep(-.02,.6,e));
  // The horizon: a soft band of light where the sky meets the floor, a little brighter toward the low sun's side.
  float side=.75+.25*dot(normalize(vec2(d.x,d.z)+1e-5),vec2(.8,.6));c+=uHorizon*exp(-abs(e)*16.)*.6*uGlow*side+uHorizon*exp(-abs(e)*4.)*.12*uGlow;
  // A few faint stars high up (a sense of depth; the canvas stays quiet).
  vec3 cell=floor(d*180.);float s=h3(cell);vec3 f=fract(d*180.)-.5;c+=vec3(.85,.9,1.)*step(.997,s)*exp(-dot(f,f)*30.)*smoothstep(.12,.5,e)*uStars*(.6+.4*sin(uTime*.7+s*80.));
  c*=e<0.?mix(1.,.3,smoothstep(0.,-.3,e)):1.;
  c+=(h(gl_FragCoord.xy+fract(uTime))-.5)/255.;gl_FragColor=vec4(max(c,0.),1.);}`;
const FLOOR_VS='varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
const FLOOR_FS=`varying vec3 vW;uniform vec3 uBase,uLine,uHorizon;uniform vec2 uCentre;uniform float uExtent,uFloor,uTime;
uniform vec4 uMarks[${MARKS}];uniform vec4 uMarkC[${MARKS}];uniform vec4 uRipples[${RIPPLES}];uniform vec4 uRippleC[${RIPPLES}];
void main(){vec2 p=vW.xz-uCentre;float r=length(p),step=max(1.,uExtent/4.);
  // A polar grid (rings and 24 rays), antialiased, fading into the distance: scale and depth, never a pattern.
  float fr=abs(fract(r/step+.5)-.5)*step,wr=fwidth(r)*1.3,ring=1.-smoothstep(0.,wr,fr);
  float a=atan(p.y,p.x)/6.2831853*24.,fa=abs(fract(a+.5)-.5),wa=fwidth(a)*1.3,ray=(1.-smoothstep(0.,wa,fa))*smoothstep(step*.6,step*1.4,r);
  float fade=exp(-r/(uExtent*2.4))*smoothstep(0.,.3,1.-wr*4.);
  vec3 c=uBase+uLine*(ring*.5+ray*.18)*fade*uFloor;
  // The project's subsystems: a soft pool of light and a fine rim each.
  for(int i=0;i<${MARKS};i++){vec4 m=uMarks[i];if(m.w<=0.)continue;float d=length(vW.xz-m.xy),R=m.z;
    float pool=exp(-d*d/(R*R)*1.6),rim=exp(-pow((d-R)/(R*.05+.03),2.));c+=uMarkC[i].rgb*(pool*.22+rim*.75)*m.w*uFloor;
    c+=vec3(1.,.78,.45)*exp(-pow((d-R*1.18)/(R*.04+.03),2.))*uMarkC[i].a*uFloor;}
  // Canonical events: rings travelling out from where they happened.
  for(int i=0;i<${RIPPLES};i++){vec4 q=uRipples[i];float age=uTime-q.w;if(age<0.||age>9.)continue;float d=length(vW.xz-q.xy),rad=age*q.z;
    c+=uRippleC[i].rgb*exp(-pow((d-rad)/(.25+age*.06),2.))*exp(-age*.5)*uRippleC[i].a;}
  vec3 v=normalize(cameraPosition-vW);c+=uHorizon*pow(1.-clamp(v.y,0.,1.),6.)*.5;
  gl_FragColor=vec4(c,1.);}`;
const AGENT_VS='attribute vec4 aC;uniform float uPx;varying vec4 vC;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(.35/(uPx*max(.1,-mv.z)),2.,28.);vC=aC;}';
const AGENT_FS='varying vec4 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;float I=exp(-r*6.)+exp(-r*2.)*.3;gl_FragColor=vec4(vC.rgb*I*vC.a*1.6,1.);}';
export const SHADERS={canvasSky:[BACKGROUND_VS,SKY_FS],canvasFloor:[FLOOR_VS,FLOOR_FS],canvasAgents:[AGENT_VS,AGENT_FS]};
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx,seed=recipe.projectSeed>>>0;
  let cfg={...DEFAULTS,...(recipe.composition?.canvas||{})};
  const col=c=>new THREE.Color(c);
  // ---- Sky and floor ---------------------------------------------------------------------------------------------------
  const sky=new THREE.ShaderMaterial({uniforms:{uTop:{value:new THREE.Color()},uHorizon:{value:new THREE.Color()},uCam:{value:new THREE.Vector3()},uInv:{value:new THREE.Matrix4()},
    uTime:{value:0},uGlow:{value:1},uStars:{value:1}},vertexShader:BACKGROUND_VS,fragmentShader:SKY_FS,depthTest:false,depthWrite:false});
  const FU={uBase:{value:new THREE.Color()},uLine:{value:new THREE.Color()},uHorizon:{value:new THREE.Color()},uCentre:{value:new THREE.Vector2()},uExtent:{value:10},uFloor:{value:.4},uTime:{value:0},
    uMarks:{value:Array.from({length:MARKS},()=>new THREE.Vector4())},uMarkC:{value:Array.from({length:MARKS},()=>new THREE.Vector4(1,1,1,0))},
    uRipples:{value:Array.from({length:RIPPLES},()=>new THREE.Vector4(0,0,1,-1e5))},uRippleC:{value:Array.from({length:RIPPLES},()=>new THREE.Vector4())}};
  const floorMat=new THREE.ShaderMaterial({uniforms:FU,vertexShader:FLOOR_VS,fragmentShader:FLOOR_FS});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),floorMat);floor.frustumCulled=false;floor.renderOrder=-10;scene.add(floor);
  const agentGeo=new THREE.BufferGeometry();agentGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MAX_AGENTS*3),3).setUsage(THREE.DynamicDrawUsage));
  agentGeo.setAttribute('aC',new THREE.BufferAttribute(new Float32Array(MAX_AGENTS*4),4).setUsage(THREE.DynamicDrawUsage));
  const agentMat=new THREE.ShaderMaterial({uniforms:{uPx:{value:.001}},vertexShader:AGENT_VS,fragmentShader:AGENT_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const agentPoints=new THREE.Points(agentGeo,agentMat);agentPoints.frustumCulled=false;agentPoints.renderOrder=20;scene.add(agentPoints);
  function applyConfig(){const bg=col(cfg.background),hz=col(cfg.horizon);sky.uniforms.uTop.value.copy(bg);sky.uniforms.uHorizon.value.copy(hz);
    FU.uBase.value.copy(bg).multiplyScalar(.42).lerp(hz,.06);FU.uLine.value.copy(hz).lerp(new THREE.Color(1,1,1),.35).multiplyScalar(.55);FU.uHorizon.value.copy(hz);
    FU.uFloor.value=clamp(Number(cfg.floor??DEFAULTS.floor));sky.uniforms.uStars.value=.4+FU.uFloor.value;}
  applyConfig();
  // ---- Layout: the persisted site plan, scaled to the canvas ---------------------------------------------------------------
  const subs=new Map();let subList=[],nodes=[],centre=new THREE.Vector3(),extent=10,builtVersion=-1,builtAt=-Infinity,k=1;
  const hexX=m=>SQ3*m.q+SQ3/2*m.r,hexZ=m=>1.5*m.r;
  function layout(t){
    const groups=[];
    for(const d of model.districts.values()){const mods=d.members.map(id=>model.modules.get(id)).filter(m=>m&&model.alive(m,t)&&m.removed===null);if(!mods.length)continue;
      let x=0,z=0;for(const m of mods){x+=hexX(m);z+=hexZ(m);}groups.push({d,mods,x:x/mods.length,z:z/mods.length});}
    let cx=0,cz=0,w=0;for(const g of groups){const q=Math.sqrt(g.mods.length);cx+=g.x*q;cz+=g.z*q;w+=q;}if(w){cx/=w;cz/=w;}
    let raw=3;for(const g of groups)for(const m of g.mods)raw=Math.max(raw,Math.hypot(hexX(m)-cx,hexZ(m)-cz));
    // Any project fits the canvas: a large one is drawn smaller, a tiny one is not blown up.
    k=clamp(9/raw,.22,1.6);centre.set(0,0,0);subs.clear();
    subList=groups.map(g=>{const size=(.7+.42*Math.sqrt(g.mods.length))*Math.max(.55,k);
      const s={id:g.d.id,d:g.d,members:g.mods,x:(g.x-cx)*k,z:(g.z-cz)*k,size,born:model.districtBorn(g.d)};subs.set(s.id,s);return s;});
    nodes=[];for(const g of groups)for(const m of g.mods)if(nodes.length<64)nodes.push({id:m.id,group:g.d.id,pos:new THREE.Vector3((hexX(m)-cx)*k,.25,(hexZ(m)-cz)*k)});
    extent=8;for(const s of subList)extent=Math.max(extent,Math.hypot(s.x,s.z)+s.size*1.4);
    FU.uExtent.value=extent;FU.uCentre.value.set(0,0);floor.scale.set(extent*14,1,extent*14);
  }
  const ensure=i=>{if(model.version!==builtVersion||Math.abs(i.t-builtAt)>2000){layout(i.t);builtVersion=model.version;builtAt=i.t;}};
  const subOfModule=id=>{const m=model.modules.get(id);return m?subs.get(m.group):null;};
  const markPos=s=>new THREE.Vector3(s.x,Math.max(.6,s.size*.55),s.z);
  // ---- Effects: canonical intents as rings on the floor ----------------------------------------------------------------------
  let rip=0;const secs=(T)=>(T-model.epoch)/1000/ctx.speed();
  const RING={'subsystem.created':['#dfe9ff',1,2.4],'module.created':['#bcd3ff',.35,1.6],'structure.created':['#bcd3ff',.3,1.4],'structure.removed':['#8a93a8',.3,1.2],
    'subsystem.connected':['#a8ffe0',.6,2],'validation.failed':['#ff7a52',.75,1.1],'validation.passed':['#a8ffd0',.45,1.8],'validation.recovered':['#a8ffd0',.9,2],
    'refactor.validated':['#d8c4ff',.8,2.2],'milestone.achieved':['#ffd28a',1.2,2.8],'repository.checkpoint':['#cfd8e8',.5,3.2],'world.expanded':['#e8eeff',.7,3.5]};
  function ring(x,z,at,c,k2,speed){const i=rip++%RIPPLES;FU.uRipples.value[i].set(x,z,speed,at);const C=col(c);FU.uRippleC.value[i].set(C.r,C.g,C.b,k2);}
  function effect(cmd,i){
    if(i)ensure(i);const R=RING[cmd.intent];if(!R)return;
    // A milestone without verification never gets a ring of its own (the reducer only records verified ones).
    if(cmd.intent==='milestone.achieved'&&cmd.evidence!=='verified')return;
    const s=cmd.subject||{},k2=R[1]*clamp(cmd.scale??1,.2,1.4)*((i?.overrides?.intensity??1)>0?1:0),at=secs(cmd.at);if(!k2)return;
    const places=[];if(s.groupId&&subs.has(s.groupId))places.push(subs.get(s.groupId));if(s.targetGroupId&&subs.has(s.targetGroupId))places.push(subs.get(s.targetGroupId));
    if(s.fileId)places.push(subOfModule(s.fileId));if(s.targetId)places.push(subOfModule(s.targetId));for(const id of (s.fileIds||[]).slice(0,4))places.push(subOfModule(id));
    const list=[...new Set(places.filter(Boolean))];
    if(!list.length||cmd.intent==='repository.checkpoint'||cmd.intent==='world.expanded'){ring(0,0,at,R[0],k2,R[2]*Math.max(1,extent/8));return;}
    list.slice(0,3).forEach((p,j)=>ring(p.x,p.z,at+j*.35,R[0],k2,R[2]));
  }
  // ---- Frame ---------------------------------------------------------------------------------------------------------------
  const STRESS=new THREE.Color('#ff6a48'),VALID=new THREE.Color('#bff5ff'),BASE=new THREE.Color();
  function update(i){
    ensure(i);const tv=i.tview,cmds=ctx.director.commands;FU.uTime.value=tv;sky.uniforms.uTime.value=tv;
    // Marks: brighter where the work is now (recent commands about the subsystem), cooler under failing tests, a warm
    // outer rim where verified milestones were reached (director.lasting(): the verified history).
    const recent=new Map();for(let k2=cmds.length-1;k2>=0;k2--){const c=cmds[k2];if(c.at>i.t)continue;const age=(i.t-c.at)/ctx.speed()/1000;if(age>8)break;
      const s=c.subject||{},ids=[s.groupId,...[s.fileId,s.targetId,...(s.fileIds||[])].map(id=>subOfModule(id)?.id)].filter(Boolean);
      for(const id of new Set(ids))recent.set(id,(recent.get(id)||0)+Math.exp(-age/2.5)*(.3+.2*c.tier));}
    const lasting=new Map();for(const l of ctx.director.lasting()){if(l.type!=='milestone.achieved')continue;const s=l.subject||{};
      for(const id of new Set([s.groupId,...(s.fileIds||[]).map(f=>subOfModule(f)?.id)].filter(Boolean)))lasting.set(id,(lasting.get(id)||0)+l.count);}
    BASE.copy(FU.uLine.value).multiplyScalar(2.2);
    for(let m=0;m<MARKS;m++){const s=subList[m],M=FU.uMarks.value[m],Cc=FU.uMarkC.value[m];if(!s){M.w=0;continue;}
      let st=0,ok=0;for(const x of s.members){const state=model.stateAt(x,i.t);if(state==='stressed')st++;else if(state==='validated')ok++;}
      const age=(i.t-s.born)/ctx.speed()/1000,grow=Number.isFinite(age)?smooth(age/2.5):1;
      M.set(s.x,s.z,s.size*(.6+.4*grow),(.55+.9*Math.min(1,recent.get(s.id)||0))*grow);
      const c=BASE.clone().lerp(VALID,ok/s.members.length*.35).lerp(STRESS,st/s.members.length*.7);Cc.set(c.r,c.g,c.b,Math.min(1,(lasting.get(s.id)||0)*.35));}
    // Observed agents: a small light above the subsystem each one works in (only while reported).
    const P=agentGeo.attributes.position.array,A=agentGeo.attributes.aC.array;let n=0;agentPos.clear();
    for(const a of i.agents){if(n>=MAX_AGENTS)break;const s=subOfModule(a.fileId||a.home);const base=s?markPos(s):new THREE.Vector3(0,1.2,0),ph=rand(hash(a.id))*6.283;
      const p=base.add(new THREE.Vector3(Math.cos(tv*.6+ph)*1.1,.9+.25*Math.sin(tv*.9+ph),Math.sin(tv*.6+ph)*1.1));agentPos.set(a.id,p);
      P.set([p.x,p.y,p.z],n*3);const c=AGENT_COLORS[a.voice%8];A.set([c.r,c.g,c.b,a.alpha*(a.busy?1:.45)],n*4);n++;}
    agentGeo.setDrawRange(0,n);agentGeo.attributes.position.needsUpdate=true;agentGeo.attributes.aC.needsUpdate=true;
  }
  const agentPos=new Map(),inv=new THREE.Matrix4();
  function afterCamera(){camera.updateMatrixWorld();inv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).invert();sky.uniforms.uInv.value.copy(inv);sky.uniforms.uCam.value.copy(camera.position);
    agentMat.uniforms.uPx.value=2*Math.tan(camera.fov*Math.PI/360)/1080;}
  function background(){return sky;}
  // ---- Camera: a slow orbit about the canvas, a little above the floor; verified moments draw it closer ---------------
  // The lens looks almost level, so the horizon sits near the middle of the frame: the sky (an aurora, a nebula) and
  // the floor's marks share the image.
  const az0=rand(seed+3)*Math.PI*2;
  function cameraGoal(i){
    const motion=i.overrides?.motion??1,orbit=clamp(Number(cfg.orbit??DEFAULTS.orbit)),dist=clamp(Number(cfg.distance??DEFAULTS.distance),.5,2);
    const target=new THREE.Vector3(0,extent*.24,0);let distance=Math.max(9,extent*2.4)*dist,az=az0+i.tview*orbit*Math.PI*2/120*motion,el=.1+.03*Math.sin(i.tview/53);
    distance*=1+.025*Math.sin(i.tview/41)*motion;
    const att=ctx.director.attentionAt(i.t,3),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;
    if(att&&since<12){const s=subjectOf(att);if(s){const k2=smooth(since/1.5)*(1-smooth((since-7)/5))*clamp((i.overrides?.intensity??1)+.3,.3,1);target.lerp(s.pos,.35*k2);distance=lerp(distance,distance*.82,k2);}}
    else{const busy=i.agents.find(a=>a.busy&&a.fileId&&subOfModule(a.fileId));if(busy)target.lerp(markPos(subOfModule(busy.fileId)),.12);}
    return {target,distance,azimuth:az,elevation:el,fov:40,omega:.5};
  }
  function subjectOf(c){const s=c.subject||{};let list=[];
    if(s.groupId&&subs.has(s.groupId))list.push(subs.get(s.groupId));for(const id of [s.fileId,s.targetId,...(s.fileIds||[])])if(id){const x=subOfModule(id);if(x)list.push(x);}
    list=[...new Set(list)];if(!list.length)return null;const p=new THREE.Vector3();for(const x of list)p.add(markPos(x));p.multiplyScalar(1/list.length);return {pos:p,radius:Math.max(...list.map(x=>x.size))*1.4};}
  // ---- Grade: filmic and calm; a little warmth when the music lifts, cooler while it is tense ---------------------------
  function grade(i){const sec=i.mood?.section,tint=sec==='tension'?new THREE.Vector3(.97,.98,1.04):sec==='lift'||sec==='resolve'?new THREE.Vector3(1.03,1.01,.98):new THREE.Vector3(1,1,1);
    return {tonemap:'agx',bloom:.95*(1+.15*(i.activity||0)),threshold:.62,exposure:1.08,contrast:1.06,saturation:1.04,vignette:.34,grain:.02,tint,bloomTint:new THREE.Vector3(1,.97,.94),lift:new THREE.Vector3(0,.002,.004)};}
  // ---- Words (generic words only: labels.js) -------------------------------------------------------------------------------
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  function describe(c){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length,pos=subjectOf(c)?.pos||new THREE.Vector3(0,1,0);
    switch(c.intent){
      case 'subsystem.created':return {text:'A new subsystem appears',sub:s.groupId?ctx.name(s.groupId):'',position:pos};
      case 'structure.created':return {text:'New structure',sub:Object.entries(d.kinds||{}).filter(([x])=>x!=='variable').map(([x,v])=>`${v} ${x.replace('ui.component','component').replace('api.route','route')}`).join(' · ')||plural(d.count||1,'symbol'),position:pos};
      case 'subsystem.connected':return {text:d.first?'Integration · two subsystems connect':'Two subsystems depend on each other more',sub:'',position:pos};
      case 'validation.failed':return {text:`Tests fail · ${plural(n,'module')}`,sub:'observed failing run',position:pos,color:'#ff8a6a'};
      case 'validation.passed':return {text:`Tests pass · ${plural(n,'module')}`,sub:'observed passing run',position:pos,color:'#9dffcf'};
      case 'validation.recovered':return {text:'Recovered · the tests pass again',sub:'verified by a passing test run',position:pos,color:'#9dffcf',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated',sub:plural(d.removedSymbols||0,'symbol')+' removed',position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k2=(d.kinds||[]).map(x=>MILESTONE[x]||x).join(' · ');return {text:`Milestone · ${k2}`,sub:'verified by a passing test run',position:pos,banner:k2||'Milestone',bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:n?`Committed · ${plural(n,'module')}`:'Committed',sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The project grows · chapter ${d.chapter}`,sub:'accumulated structure',position:new THREE.Vector3(0,1.5,0)};
      default:return null;}}
  function agentPosition(id){return agentPos.get(id)||null;}
  function agentColor(a){return '#'+AGENT_COLORS[a.voice%8].getHexString();}
  function subsystemLabels(){return subList.map(s=>({position:markPos(s).setY(Math.max(.6,s.size*.55)+.8),text:ctx.name(s.id),sub:`${s.d.role||''} · ${plural(s.members.length,'module')}`}));}
  function status(i){let v=0,st=0;for(const m of model.modules.values()){if(!model.alive(m,i.t))continue;const s=model.stateAt(m,i.t);if(s==='validated')v++;if(s==='stressed')st++;}return st?`${st} under strain`:v?`${v} validated`:'';}
  function pick(x,y,cam){let best=null,bd=.06;for(const s of subList){const p=markPos(s).project(cam);const d=Math.hypot(p.x-x,p.y-y);if(p.z<1&&d<bd){bd=d;best='sub:'+s.id;}}return best;}
  function inspect(id){if(!id?.startsWith('sub:'))return null;const s=subs.get(id.slice(4));return s?{position:markPos(s),text:ctx.name(s.id),sub:`${plural(s.members.length,'module')} · a subsystem of this project`}:null;}
  function stats(){return {subsystems:subList.length,nodes:nodes.length,extent:+extent.toFixed(1),scale:+k.toFixed(2),camera:camera.position.toArray().map(x=>+x.toFixed(1))};}
  function onPrime(){for(const v of FU.uRipples.value)v.w=-1e5;agentPos.clear();}
  function rebuild(){builtVersion=-1;}
  function dispose(){for(const o of [floor,agentPoints]){scene.remove(o);o.geometry.dispose();}for(const m of [sky,floorMat,agentMat])m.dispose();}
  // ---- Composition anchors (layers.js) -------------------------------------------------------------------------------------
  const A={center:new THREE.Vector3(),extent:10,floor:0,subsystems:[],active:{pos:new THREE.Vector3()},nodes:[],boundary:{radius:12,y:0}};let anchorKey='';
  function anchors(i){
    if(i)ensure(i);const key=`${builtVersion}|${builtAt}`;
    if(key!==anchorKey){anchorKey=key;A.extent=extent;A.center.set(0,extent*.15,0);A.boundary.radius=extent*1.25;
      A.subsystems=subList.map(s=>({id:s.id,pos:markPos(s),base:new THREE.Vector3(s.x,0,s.z),size:s.size}));A.nodes=nodes.map(n=>({pos:n.pos}));}
    const att=i?ctx.director.attentionAt(i.t,1):null,busy=i?.agents?.find(a=>a.busy&&a.fileId&&subOfModule(a.fileId));
    const at=att&&(i.t-att.at)/ctx.speed()/1000<30?subjectOf(att)?.pos:busy?markPos(subOfModule(busy.fileId)):null;
    A.active.pos.copy(at||A.center);return A;
  }
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime,
    compose:{camera,scene,anchors},
    // The composition's canvas settings changed (colours, orbit, distance, floor): applied in place.
    onComposition(c){cfg={...DEFAULTS,...(c?.canvas||{})};applyConfig();}};
}

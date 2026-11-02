// Genesis (preview): a universe whose laws are derived from the code. Design brief: docs/worlds/genesis.md.
//
// A suspended structure of fired matter (porcelain, celadon, smoky glass or onyx: the material law), grown chamber by
// chamber along a coil by the project's Lawbook (genesis-laws.js). Data -> matter (nothing here is decoration that
// claims engineering work):
//  - subsystem (district) -> a chamber at its slot on the growth coil, by order of birth (a new one never moves an older
//                            one); its size from its live files; the newest carries the aperture the next will bud from
//  - file (module)        -> a chamberlet: a cell of the chamber's inner foam around the file's seed, with its own inner
//                            light (amber; an agent's colour while it works there), shining through the wall
//  - symbols              -> the share of the wall's pore lattice that is open
//  - dependency           -> between chambers, a thread from the importing file's place on its wall to the imported
//                            file's, light flowing toward the import; adjacent coupled chambers share an opening
//  - agent                -> a probe of light in its provider's colour; at work it enters the chamber of the file it
//                            edits and that chamberlet takes its colour
//  - tests passing        -> the covered chambers ring once in a clean standing wave (no celebration)
//  - failure              -> decoherence: the covered files' lights flicker out of phase, the wall over them crazes
//                            (vermilion light in the cracks) for as long as they are stressed. Never gold
//  - recovery             -> kintsugi: the cracks fill with gold (kept: the model's own history of the repair)
//  - verified milestone   -> vitrification: the covered chambers turn to crystal behind a sweeping front (kept: the
//                            director's record), a rare one the whole structure
//  - commit               -> a consolidating pulse along the sutures, from the first chamber to the newest
// Ambient (never progress): the inner light breathes, light streams along the threads and beads glide along the sutures,
// the films' colours drift, dust turns in the light, the camera explores. With the host's musical clock and the score's
// notes (ctx.musicBar) the matter answers single notes (genesis-resonance.js). Every image is a function of the model (in
// a replay its whole recorded history: onHistory), the recipe, the director's fold and the performance clock.
import {THREE,clamp,lerp,smooth,hash,rand} from './core.js';
import {lawbook,MAXC,axisOf,latticeOf,toWorld,normalToWorld,regionOf,latticeRot,sfPoint} from './genesis-laws.js';
import {prepare,historyFrom,recordCue} from './terrain-layout.js';
import {chambersAt,extentOf,pairsOf,filmsOf,threadsAt,cordsOf,bezier,conditionOf,wallPoint} from './genesis-form.js';
import {resonanceAt,resonanceFromExpression} from './genesis-resonance.js';
import {SHELL_VS,SHELL_FS,SEPTUM_VS,SEPTUM_FS,SUTURE_VS,SUTURE_FS,FILM_VS,FILM_FS,NEEDLE_VS,NEEDLE_FS,POINT_VS,POINT_FS,RIB_VS,RIB_FS,VOID_FS} from './genesis-glsl.js';
import {touchesAt,touchGain,touchVisits,visitBlend} from './touch.js';
import {presence} from '../providers.js';
const TAU=Math.PI*2,MAXF=1024,MAX_FX=6000,MAX_RIB=9000;
// Each CAST provider its own colour (seat: Claude, Cursor, Codex, Grok, Qwen, Kimi, then unknown providers).
const AGENT_COLORS=['#ffb0dc','#ffd28a','#9cf0c8','#a8b8ff','#ffb48c','#8ce4ff','#dcaaff','#c8f096'];
// Quality levels (the host also drops MSAA at 1 and resolution at 2 and 3): the walls' tessellation and the motes drawn.
// Level 3 also drops the analytic shadows and occlusion. Films render at 0.
export const QUALITY=[{seg:[112,56],motes:520},{seg:[96,48],motes:420},{seg:[72,36],motes:300},{seg:[56,28],motes:180}];
// Spans of the transient expressions (view seconds).
const RING_S=3.4,FRONT_S=5.5,PULSE_S=4,DECO_S=2.6,GILD_S=3.2;
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome||{},P0=G.palette||{};
  const book=lawbook(recipe),mat=book.material,mot=G.motion||{},atm=G.atmosphere||{},cam=G.camera||{},LT=G.light||{},MU=G.music||{};
  const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  const col=(c,d)=>new THREE.Color(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:d);
  const pal={primary:col(P0.primary,'#e8e0cc'),secondary:col(P0.secondary,'#c9a46a'),accent:col(P0.accent,'#f4a63a'),highlight:col(P0.highlight,'#f6f2e8'),
    deep:col(P0.deep,'#0c0b0a'),haze:col(P0.haze,'#211d1a'),warning:col(P0.warning,'#ef2f3c'),valid:col(P0.valid,'#d8e4ea')};
  // The void stays a charcoal void whatever a tuned palette says.
  const capL=(c,max)=>{const h={};c.getHSL(h);if(h.l>max)c.setHSL(h.h,h.s,max);return c;};capL(pal.deep,.06);capL(pal.haze,.16);
  const V3=(c,k=1)=>new THREE.Vector3(c.r*k,c.g*k,c.b*k),lum=c=>c.r*.2126+c.g*.7152+c.b*.0722;
  // the body: the material's own colour, tinted by the identity's (its hue, not its lightness)
  const tint=pal.primary.clone();tint.multiplyScalar(1/Math.max(.05,lum(tint)));
  const body=new THREE.Vector3(...mat.body).multiply(new THREE.Vector3(1,1,1).lerp(V3(tint),.35));
  const metal=new THREE.Vector3(...mat.metal).lerp(V3(pal.secondary).multiplyScalar(1/Math.max(.08,lum(pal.secondary))*.75),.4);
  const agentCol=AGENT_COLORS.map(c=>new THREE.Color(c));
  // the inner light: the identity's amber, a little toward its warm white
  const lamp=pal.accent.clone().lerp(pal.highlight,.22);
  const disposables=[];const keep=x=>{disposables.push(x);return x;};
  // ---- The recorded history (as Aurora's): a replay's own model of everything recorded up to the moment; live, the host's
  let hist=null;const M=()=>hist||model;
  let prep=null,prepKey='';
  function prepared(){const m=M(),k=`${hist?'h':'l'}|${m.version}|${m.modules.size}`;if(k!==prepKey||!prep){prepKey=k;prep=prepare(m);}return prep;}
  // ---- State textures ----------------------------------------------------------------------------------------------------
  const CW=13,cData=new Float32Array(CW*MAXC*4),cTex=keep(new THREE.DataTexture(cData,CW,MAXC,THREE.RGBAFormat,THREE.FloatType));
  const fData=new Float32Array(4*MAXF*4),fTex=keep(new THREE.DataTexture(fData,4,MAXF,THREE.RGBAFormat,THREE.FloatType));
  for(const t of [cTex,fTex]){t.magFilter=t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;}
  const cRow=(k,j,a,b,c,d)=>{const o=(k*CW+j)*4;cData[o]=a;cData[o+1]=b;cData[o+2]=c;cData[o+3]=d;};
  const fRow=(m,j,a,b,c,d)=>{const o=(m*4+j)*4;fData[o]=a;fData[o+1]=b;fData[o+2]=c;fData[o+3]=d;};
  // ---- Light (world space): a warm key above and to one side, a cool fill, a rim behind the subject (set per frame) ----
  const key=new THREE.Vector3(-.55,.74,.4).normalize(),fill=new THREE.Vector3(.62,.05,-.55).normalize();
  const U={uC:{value:cTex},uF:{value:fTex},uNC:{value:0},uT:{value:0},uQ:{value:0},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},
    uS:{value:new THREE.Matrix3().set(...book.S)},uSi:{value:new THREE.Matrix3().set(...book.Si)},uKeyL:{value:new THREE.Vector3(...normalToWorld(book,[key.x,key.y,key.z]))},
    uKey:{value:key},uKeyC:{value:new THREE.Vector3(1,.92,.8).multiplyScalar(2.1)},uFill:{value:fill},uFillC:{value:new THREE.Vector3(.38,.44,.56).multiplyScalar(.45)},
    uRim:{value:new THREE.Vector3(0,.4,-1).normalize()},uRimC:{value:new THREE.Vector3(.95,.9,.84).multiplyScalar(.9)},uAmb:{value:V3(pal.haze,.55).add(new THREE.Vector3(.018,.017,.016))},
    uDeep:{value:V3(pal.deep,1)},uBody:{value:body},uSss:{value:new THREE.Vector3(...mat.sss)},uMetal:{value:metal},uInterior:{value:new THREE.Vector3(...mat.interior)},
    uCrystal:{value:new THREE.Vector3(.55,.5,.42)},uWarn:{value:V3(pal.warning,1.4)},uGold:{value:new THREE.Vector3(1,.72,.3)},uValid:{value:V3(pal.valid,1)},uAcc:{value:V3(pal.accent,1)},
    uGlaze:{value:mat.glaze},uRough:{value:mat.rough},uTrans:{value:mat.translucency},uOpal:{value:mat.opal},uGrain:{value:mat.grain},
    uCoh:{value:1},uSpark:{value:0},uThump:{value:0},uBeads:{value:8},uFlow:{value:1},uFilm:{value:1}};
  const mat_=(vs,fs,o={})=>keep(new THREE.ShaderMaterial({uniforms:U,vertexShader:vs,fragmentShader:fs,side:THREE.DoubleSide,...o}));
  const glowMat=(vs,fs,o={})=>mat_(vs,fs,{transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,...o});
  const add=(o,order=0)=>{o.frustumCulled=false;o.renderOrder=order;scene.add(o);return o;};
  function instanced(base,layout,cap=16){
    const g=new THREE.InstancedBufferGeometry();g.index=base.index;for(const [k,v] of Object.entries(base.attributes))g.setAttribute(k,v);
    const self={geometry:g,capacity:0,arrays:{},n:0};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(cap,self.capacity);while(c<n)c*=2;
      for(const [name,size] of Object.entries(layout)){const a=new Float32Array(c*size),old=self.arrays[name];if(old)a.set(old.subarray(0,Math.min(old.length,a.length)));
        self.arrays[name]=a;g.deleteAttribute(name);const at=new THREE.InstancedBufferAttribute(a,size);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,at);}
      self.capacity=c;};
    self.write=(name,i,...v)=>{if(i>=self.capacity)self.ensure(i+1);const s=layout[name],a=self.arrays[name];for(let k=0;k<s;k++)a[i*s+k]=v[k]??0;};
    self.commit=n=>{g.instanceCount=n;self.n=n;for(const name of Object.keys(layout))g.attributes[name].needsUpdate=true;};
    self.ensure(cap);g.instanceCount=0;keep(g);return self;}
  function points(layout,cap=256){
    const all={position:3,...layout},g=keep(new THREE.BufferGeometry()),self={geometry:g,capacity:0,arrays:{},n:0};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(cap,self.capacity);while(c<n)c*=2;
      for(const [name,size] of Object.entries(all)){const a=new Float32Array(c*size),old=self.arrays[name];if(old)a.set(old.subarray(0,Math.min(old.length,a.length)));
        self.arrays[name]=a;g.deleteAttribute(name);const at=new THREE.BufferAttribute(a,size);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,at);}
      self.capacity=c;};
    self.ensure(cap);g.setDrawRange(0,0);
    self.write=(name,i,...v)=>{if(i>=self.capacity)self.ensure(i+1);const s=all[name],a=self.arrays[name];for(let k=0;k<s;k++)a[i*s+k]=v[k]??0;};
    self.commit=n=>{g.setDrawRange(0,n);self.n=n;for(const name of Object.keys(all))g.attributes[name].needsUpdate=true;};
    return self;}
  // ---- The walls: one sphere instanced per chamber (rebuilt only when the quality's tessellation changes) ------------------
  // (outer faces first, then inner faces: what an outer face hides is rejected by depth before its interior is shaded)
  const shellOut=mat_(SHELL_VS,SHELL_FS,{side:THREE.FrontSide}),shellIn=mat_(SHELL_VS,SHELL_FS,{side:THREE.BackSide});let shells=null,shellQ=-1;
  function shellGeometry(q){if(q===shellQ&&shells)return;shellQ=q;const [w,h]=QUALITY[q].seg,s=new THREE.SphereGeometry(1,w,h);
    const next=instanced(s,{aK:1},MAXC);s.dispose();for(let k=0;k<MAXC;k++)next.write('aK',k,k);
    if(shells){shells.mesh.geometry.dispose();shells.mesh.geometry=next.geometry;shells.inner.geometry=next.geometry;Object.assign(shells,next,{mesh:shells.mesh,inner:shells.inner});}
    else{shells=next;shells.mesh=add(new THREE.Mesh(next.geometry,shellOut),2);shells.inner=add(new THREE.Mesh(next.geometry,shellIn),3);}}
  // septa: a polar disc instanced per pair; sutures (and the aperture's lip): a torus instanced per circle
  const discG=keep((()=>{const pos=[],idx=[],R=7,S=72;pos.push(0,0,0);for(let r=1;r<=R;r++)for(let s=0;s<S;s++){const a=s/S*TAU,k=r/R;pos.push(Math.cos(a)*k,Math.sin(a)*k,0);}
    for(let s=0;s<S;s++)idx.push(0,1+s,1+(s+1)%S);
    for(let r=1;r<R;r++)for(let s=0;s<S;s++){const a=1+(r-1)*S+s,b=1+(r-1)*S+(s+1)%S,c=a+S,d=b+S;idx.push(a,c,b,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);return g;})());
  const septa=instanced(discG,{sA:4,sB:4,sC:4,sD:4},64);add(new THREE.Mesh(septa.geometry,mat_(SEPTUM_VS,SEPTUM_FS)),2);
  const torusG=keep((()=>{const pos=[],idx=[],NU=160,NV=8;for(let i=0;i<=NU;i++)for(let j=0;j<=NV;j++)pos.push(i/NU,j/NV,0);
    for(let i=0;i<NU;i++)for(let j=0;j<NV;j++){const a=i*(NV+1)+j,b=a+NV+1;idx.push(a,b,a+1,a+1,b,b+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);return g;})());
  const sutures=instanced(torusG,{tA:4,tB:4,tC:4},64);add(new THREE.Mesh(sutures.geometry,mat_(SUTURE_VS,SUTURE_FS)),2);
  const needles=instanced(quadG0(),{nA:4,nB:4,nC:4},256);add(new THREE.Mesh(needles.geometry,mat_(NEEDLE_VS,NEEDLE_FS,{transparent:true,depthWrite:false})),4);
  function quadG0(){const g=keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,0,1,0,1,1,0],3));g.setIndex([0,1,2,2,1,3]);return g;}
  // the chamberlets' films: one geometry, rebuilt when a chamber's foam changes (each chamber's films cached by its key)
  const filmMat=glowMat(FILM_VS,FILM_FS);const filmMesh=add(new THREE.Mesh(new THREE.BufferGeometry(),filmMat),5);
  const filmCache=new Map();let filmSig='',filmCount=0,filmMs=0;
  // light: points (the files' lights, granules, agents, motes) and ribbons (threads, agents' trails)
  const fx=points({pC:4,pS:3},1024);add(new THREE.Points(fx.geometry,glowMat(POINT_VS,POINT_FS)),6);
  const halo=points({pC:4,pS:3},64);add(new THREE.Points(halo.geometry,glowMat(POINT_VS,POINT_FS,{depthTest:false})),7);
  const quadG=keep(new THREE.BufferGeometry());quadG.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,0,1,0,1,1,0],3));quadG.setIndex([0,1,2,2,1,3]);
  const rib=instanced(quadG,{rA:4,rB:4,rC:4},512);add(new THREE.Mesh(rib.geometry,glowMat(RIB_VS,RIB_FS)),5);
  let nFx=0,nHalo=0,nRib=0;
  const C3=c=>c.isVector3?c:{x:c.r,y:c.g,z:c.b};
  function point(p,c,a,px,shape=0,world=0,buf=fx){const n=buf===fx?nFx:nHalo;if(n>=MAX_FX||!(a>.003))return;const k=C3(c);buf.write('position',n,p[0],p[1],p[2]);buf.write('pC',n,k.x,k.y,k.z,a);buf.write('pS',n,px,shape,world);if(buf===fx)nFx++;else nHalo++;}
  function ribbon(a,b,wa,wb,c,alpha){if(nRib>=MAX_RIB||!(alpha>.003))return;const k=C3(c);rib.write('rA',nRib,a[0],a[1],a[2],wa);rib.write('rB',nRib,b[0],b[1],b[2],wb);rib.write('rC',nRib,k.x,k.y,k.z,alpha);nRib++;}
  // ---- The void ----------------------------------------------------------------------------------------------------------
  const voidU={uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uDeep:U.uDeep,uHaze:{value:V3(pal.haze,1)},uKeyC:U.uKeyC,uKey:U.uKey,
    uHalo:{value:new THREE.Vector4(.5,.5,0,1.78)},uHz:{value:clamp(num(atm.haze,.6),0,1.5)},uT:U.uT};
  const voidMat=keep(new THREE.ShaderMaterial({uniforms:voidU,depthWrite:false,depthTest:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:VOID_FS}));
  // ---- Per-frame state ---------------------------------------------------------------------------------------------------
  let info={t:0,tsec:0,tview:0,overrides:{},agents:[],unlocks:[]},chambers=[],extent={center:[0,0,0],radius:60},extentLaw=extent,threads=[],cords=[],pairs=[],res=null,touches=[];
  // What the camera frames: the world's bounding sphere of every chamber (the newest, largest chambers do not pull the
  // frame off the oldest).
  function framed(list,ex){if(!list.length)return {center:W(ex.center),radius:ex.radius};const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const c of list){const w=W(c.c);for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],w[a]-c.r);hi[a]=Math.max(hi[a],w[a]+c.r);}}
    const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];let R=0;for(const c of list){const w=W(c.c);R=Math.max(R,Math.hypot(w[0]-m[0],w[1]-m[1],w[2]-m[2])+c.r);}
    return {center:m,radius:Math.max(20,R)};}
  // law space (genesis-laws.js: where the chambers are balls) -> the world
  const W=p=>toWorld(book,p,[0,0,0]),WN=n=>normalToWorld(book,n,[0,0,0]);
  const byId=new Map(),fileAt=new Map();let fileRows=0,lastStats={};
  const rings=[],fronts=[],pulses=[],decos=[],gilds=[],widens=[],meetings=[];
  const push=(list,x,max=8)=>{list.push(x);if(list.length>max)list.shift();};
  const tempoOf=i=>Math.max(40,i.mood?.tempo||92);
  const ageOf=(x,i)=>(i.t-x.at)/1000/ctx.speed();
  const seatOf=a=>presence(a.provider).seat%8;
  const ep=()=>model.epoch;
  // Which chambers a subject covers (files to their chambers; a subsystem to its own); none when it names nothing known.
  function chambersOf(s){const out=new Set();if(!s)return out;const ids=s.fileIds||(s.fileId?[s.fileId]:[]);
    for(const id of ids){const at=fileAt.get(id);if(at)out.add(at.ch.id);}if(s.groupId&&byId.has(s.groupId))out.add(s.groupId);return out;}
  // The coupling between two chambers: the live dependencies between their files (threads), as 0..1.
  let couple=new Map();const pairKey=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
  // ---- Lasting: vitrified chambers (verified milestones: the director's record), and the gold of verified repairs (the
  // model's own history: conditionOf) ---------------------------------------------------------------------------------------
  let lastSig='',lasting={vit:new Map(),global:0,firsts:[]};
  function lastingOf(i){const all=ctx.director.lasting();let sig='';for(const l of all)sig+=`|${l.type}:${l.first}:${l.count}`;
    if(sig!==lastSig||!lasting.ready){lastSig=sig;const vit=new Map();let global=0;const firsts=[];
      for(const l of all){if(l.type!=='milestone.achieved')continue;const cs=chambersOf(l.subject);firsts.push(l.first);
        if(!cs.size)global=Math.max(global,.35);for(const id of cs)vit.set(id,[...(vit.get(id)||[]),l.first]);}
      lasting={vit,global,firsts,ready:true};}
    return lasting;}
  const vitLevel=(id,t)=>{const xs=lasting.vit.get(id);if(!xs)return 0;let v=0;for(const at of xs)if(at<=t)v=Math.min(1,v+.62*smooth((t-at)/(4200*ctx.speed())));return v;};
  // ---- The music per moment (the score's notes when the host gives them) --------------------------------------------------
  let key_=null;
  function musicOf(i){
    const barMs=4*60000/tempoOf(i);
    const cpl=(a,b)=>couple.get(pairKey(chambers[a].id,chambers[b].id))||0;
    if(ctx.musicBar&&i.music){const k=ctx.musicKey?.();if(k)key_=k;
      const r=resonanceAt(i.t,{bar:ctx.musicBar,key:key_,barMs,speed:ctx.speed(),book,chambers,expression:i.music,couple:cpl});
      if(r.notes>0||ctx.musicBar(Math.floor(i.t/barMs)))return r;}
    return resonanceFromExpression(i.t,{expression:i.music,book,chambers,key:key_});
  }
  // ---- Frame ------------------------------------------------------------------------------------------------------------
  function update(i){
    info=i;const sp=ctx.speed(),tv=i.tview,qi=clamp(Math.round(i.quality||0),0,3);
    const [w,h]=ctx.pipeline.size;U.uPx.value=Math.max(.4,h/1080);U.uRes.value.set(w,h);U.uT.value=tv;U.uQ.value=qi;
    shellGeometry(qi);
    const P=prepared();chambers=chambersAt(P,book,i.t,{speed:sp});const ex=extentOf(chambers);extentLaw=ex;extent=framed(chambers,ex);
    byId.clear();fileAt.clear();chambers.forEach((c,k)=>{c.k=k;c.role=role(c.id);c.region=regionOf(c.role);c.lattice=latticeOf(book,c.slot,c.region.cell);c.w=W(c.c);byId.set(c.id,c);
      for(const f of c.files){f.w=W(f.seed);fileAt.set(f.id,{ch:c,f});}});
    threads=threadsAt(M(),chambers,i.t,{speed:sp,max:2000,center:ex.center});cords=cordsOf(threads,chambers,ex.center);for(const c of cords){c.wa=W(c.pa);c.wb=W(c.pb);c.wc=W(c.ctrl);}
    couple=new Map();for(const c of cords)couple.set(c.key,clamp(Math.log2(1+c.count)/3)*c.grow);
    pairs=pairsOf(chambers,(a,b)=>couple.get(pairKey(a,b))||0);
    lastingOf(i);
    res=musicOf(i);
    touches=touchesAt(ctx.agents,i.agents,i.t,sp,{known:id=>fileAt.has(id)&&fileAt.get(id).f.alive});
    nFx=0;nHalo=0;nRib=0;
    writeChambers(i);writeFilms(i);writeWalls(i);writeSpines(i);writeThreads(i);writeAgents(i);motes(i);
    fx.commit(nFx);halo.commit(nHalo);rib.commit(nRib);
    U.uNC.value=chambers.length;shells.commit(chambers.length);cTex.needsUpdate=true;fTex.needsUpdate=true;
    U.uCoh.value=res.coherence;U.uSpark.value=res.spark;U.uThump.value=res.thump;
    U.uFlow.value=clamp(num(mot.flow,1),0,1.6)*(.6+.8*clamp(res.arp));
    const un=k=>i.unlocks?.[k]?.level||0;U.uFilm.value=1+.8*un(1);
  }
  // Each chamber's row and its files' rows of the state textures.
  function writeChambers(i){
    const sp=ctx.speed(),tv=i.tview,reactive=clamp(num(MU.reactivity,.6),0,1),barS=4*60/tempoOf(i),breathS=barS*num(mot.breath,4);
    const inten=clamp(i.overrides.intensity??1,0,2),motion=clamp(i.overrides.motion??1,0,2);
    let m=0,stressNow=0,healNow=0;
    for(const c of chambers){const k=c.k;
      // the music and the events on this chamber now
      const mono=res.mono[k]*(.35+.65*reactive),mode=res.mode[k]*(.35+.65*reactive);
      let ring=0,front=0,pulse=0,deco=0,gild=0;
      for(const x of rings)if(x.chambers.has(c.id)){const a=ageOf(x,i);if(a>=0&&a<RING_S)ring=Math.max(ring,x.s*smooth(a/.15)*Math.exp(-a/1.1));}
      for(const x of fronts)if(x.all||x.chambers.has(c.id)){const a=ageOf(x,i);if(a>=0&&a<FRONT_S)front=Math.max(front,smooth(a/(FRONT_S*.8)));}
      for(const x of pulses){const a=ageOf(x,i)*2.4-c.rank*.55;if(a>-1&&a<2)pulse=Math.max(pulse,x.s*Math.exp(-a*a*3));}
      for(const x of decos)if(x.chambers.has(c.id)){const a=ageOf(x,i);if(a>=0&&a<DECO_S)deco=Math.max(deco,x.s*(1-a/DECO_S));}
      for(const x of gilds)if(x.chambers.has(c.id)){const a=ageOf(x,i);if(a>=0&&a<GILD_S)gild=Math.max(gild,x.s*smooth(a/.4)*(1-smooth((a-1.6)/1.6)));}
      for(const x of meetings)if(x.chamber===c.id){const a=ageOf(x,i);if(a>=0&&a<RING_S)ring=Math.max(ring,.8*x.s*Math.abs(Math.sin(a*5.3))*Math.exp(-a/1.4));}
      ring*=inten;deco*=inten;
      const breath=1+.006*mono*Math.sin(tv*TAU*book.ring.freq)+.003*res.thump;
      cRow(k,0,c.c[0],c.c[1],c.c[2],c.r*breath);
      if(c.aperture)cRow(k,1,c.aperture[0],c.aperture[1],c.aperture[2],Math.cos(.4+.08*book.laws.coupling));else cRow(k,1,0,0,0,0);
      // regional porosity: the global law, raised where the chamber's files carry more of the cross-subsystem wiring
      let deg=0;for(const x of cords)if(x.a===c.id||x.b===c.id)deg+=x.count*x.grow;
      // its pores: the conductivity law's size, wider where its files carry more of the coupling, opening as its symbols arrive
      const porous=clamp(.75+.6*clamp(deg/(2+c.n))),pore=clamp(book.pores.size*porous*clamp(.35+c.symbols/(30+6*c.n)),0,.8);
      cRow(k,2,pore,0,rand(hash(`pores/${book.seed}/${c.id}`)),c.fade);
      cRow(k,3,Math.max(vitLevel(c.id,i.t),lasting.global*smooth((i.t-(lasting.firsts[0]??Infinity))/4000)),front,ring+gild*.6,pulse);
      // the mode: the melody's order and phase, turning slowly; decoherence scrambles it
      const ph=res.phase[k]+tv*.05*motion+(deco>0?Math.sin(tv*13+k)*deco*2:0);
      cRow(k,4,mono,mode+.4*res.pad[k],res.l[k],ph);
      const n=c.files.length,m0=m;
      for(let j=0;j<n&&m<MAXF;j++,m++){const f=c.files[j],cond=conditionOf(f.f,i.t,sp),mod=M().modules.get(f.id),st=mod?M().stateAt(mod,i.t):'draft';
        const u=f.local,ul=Math.hypot(...u)||0,reach=clamp(1.1/Math.sqrt(1+c.n),.22,.85);
        // the light: by state; out of phase while stressed (decoherence); a flare as the file nucleates; the breath
        let I={draft:.5,committed:.68,validated:.85,stressed:.7}[st]??.55;
        I*=.8+.2*Math.sin(tv*TAU/breathS+c.rank*1.3+j*.7);
        if(cond.stress>0)I*=1-cond.stress*.6*book.stability.flicker*(.5+.5*Math.sin(tv*(11+j*1.7)+j*2.3));
        I+=(1-f.nuc)*1.6*(f.nuc>0?1:0)+.5*res.pad[k];I*=f.fade;
        let cr=lamp.r,cg=lamp.g,cb=lamp.b;
        if(cond.stress>0){const kw=cond.stress*.25;cr=lerp(cr,pal.warning.r,kw);cg=lerp(cg,pal.warning.g,kw);cb=lerp(cb,pal.warning.b,kw);}
        // an agent's touch: the chamberlet takes its colour
        let touch=0;for(const x of touches)if(x.fileId===f.id){const a=i.agents.find(q=>q.id===x.agentId),ac=a?agentCol[seatOf(a)]:pal.highlight,kt=x.env*x.k;
          if(kt>touch){touch=kt;cr=lerp(cr,ac.r,kt*.85);cg=lerp(cg,ac.g,kt*.85);cb=lerp(cb,ac.b,kt*.85);}}
        I+=touch*1.4*touchGain(G,i.overrides);
        const gold=cond.heal>0?clamp(cond.heal/2)*smooth((i.t-cond.healAt)/(2600*sp)):0;
        stressNow=Math.max(stressNow,cond.stress);healNow=Math.max(healNow,gold);
        fRow(m,0,ul>1e-6?u[0]/ul:0,ul>1e-6?u[1]/ul:0,ul>1e-6?u[2]/ul:0,reach);fRow(m,1,cr,cg,cb,I*2.4);
        fRow(m,2,cond.stress*book.stability.crack,gold,f.nuc,touch);fRow(m,3,f.seed[0],f.seed[1],f.seed[2],k);
        f.row=m;f.light=I;f.color=[cr,cg,cb];}
      cRow(k,5,c.lattice,0,c.region.ridge,res.pad[k]);cRow(k,6,m0,m-m0,deco,0);
      // the chamber's own glow (the mean of its files' lights) fills it between them
      let br=0,bg=0,bb=0;for(let j=m0;j<m;j++){const o=(j*4+1)*4;br+=fData[o]*fData[o+3];bg+=fData[o+1]*fData[o+3];bb+=fData[o+2]*fData[o+3];}const nm=Math.max(1,m-m0);cRow(k,8,br/nm,bg/nm,bb/nm,0);
      // the files whose own light reaches the wall: the twelve that matter most now (touched, stressed, nucleating, bright)
      const lit=[];for(let j=m0;j<m;j++){const o2=(j*4+2)*4,o1=(j*4+1)*4;lit.push([fData[o2+3]*10+fData[o2]*5+(1-fData[o2+2])*4+fData[o1+3],j]);}
      lit.sort((a,b)=>b[0]-a[0]||a[1]-b[1]);for(let q=0;q<12;q++){const o=(k*CW+10+(q>>2))*4+(q&3);cData[o]=q<lit.length?lit[q][1]:-1;}
      // the standing wave's axis: toward the chamber's own aperture slot (a fixed direction for each chamber)
      const ax=[c.slot.c[0]-extentLaw.center[0],c.slot.c[1]-extentLaw.center[1],c.slot.c[2]-extentLaw.center[2]],al=Math.hypot(...ax)||1;
      cRow(k,7,ax[0]/al,ax[1]/al,ax[2]/al,res.tone[k]);
    }
    fileRows=m;lastStats.stress=stressNow;lastStats.gold=healNow;
  }
  // The films of every chamber, recomputed only for a chamber whose foam changed (its live files, its size and its
  // neighbours' to 2 %), into one geometry.
  function writeFilms(){
    let sig='';const q=x=>Math.round(x*50);const parts=[];
    for(const c of chambers){const others=pairs.filter(p=>p.a===c||p.b===c).map(p=>p.a===c?p.b:p.a);
      const k=`${c.id}|${c.files.filter(f=>f.nuc>0).map(f=>f.id).join(',')}|${q(c.r/10)}|${c.c.map(x=>q(x/10)).join(',')}|${others.map(o=>`${o.id}:${q(o.r/10)}`).join(',')}`;
      let e=filmCache.get(c.id);if(!e||e.key!==k){const t0=performance.now();e={key:k,films:filmsOf(c,others)};filmCache.set(c.id,e);filmMs=performance.now()-t0;}
      sig+=`#${c.k}:${k}`;parts.push([c,e.films]);}
    for(const id of [...filmCache.keys()])if(!byId.has(id))filmCache.delete(id);
    if(sig===filmSig)return;
    filmSig=sig;const pos=[],nrm=[],aw=[];
    for(const [c,films] of parts)for(const f of films){const A=c.files[f.a],B=c.files[f.b];if(!A||!B)continue;
      const v=f.v,m=[0,0,0];for(const p of v){m[0]+=p[0];m[1]+=p[1];m[2]+=p[2];}m[0]/=v.length;m[1]/=v.length;m[2]/=v.length;
      const n=[B.seed[0]-A.seed[0],B.seed[1]-A.seed[1],B.seed[2]-A.seed[2]],nl=Math.hypot(...n)||1;
      for(let e=0;e<v.length;e++){const a=v[e],b=v[(e+1)%v.length];
        for(const [p,wv] of [[m,1],[a,0],[b,0]]){pos.push(...p);nrm.push(n[0]/nl,n[1]/nl,n[2]/nl);aw.push(wv,c.k,f.a,f.b);}}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aN',new THREE.Float32BufferAttribute(nrm,3));g.setAttribute('aW',new THREE.Float32BufferAttribute(aw,4));
    filmMesh.geometry.dispose();filmMesh.geometry=g;filmCount=pos.length/9;}
  // Septa, sutures and the aperture's lip.
  function writeWalls(i){
    let ns=0,nt=0;const tv=i.tview,flow=clamp(num(mot.flow,1),0,1.6);
    for(const p of pairs){const A=p.a,B=p.b,cA=cData[(A.k*CW)*4+3],cB=cData[(B.k*CW)*4+3];
      // with the drawn radii (they breathe): the circle again
      const d=Math.hypot(B.c[0]-A.c[0],B.c[1]-A.c[1],B.c[2]-A.c[2]),a=(d*d+cA*cA-cB*cB)/(2*d),rho=Math.sqrt(Math.max(0,cA*cA-a*a)),n=p.normal;
      const o=[A.c[0]+n[0]*a,A.c[1]+n[1]*a,A.c[2]+n[2]*a];
      // the opening of a coupled pair: toward the outside of the structure, its size from the coupling law
      let fo=[0,0,0],fr=0;if(p.coupling>0){const e=[o[0]-extentLaw.center[0],o[1]-extentLaw.center[1],o[2]-extentLaw.center[2]],en=e[0]*n[0]+e[1]*n[1]+e[2]*n[2];
        const t=[e[0]-n[0]*en,e[1]-n[1]*en,e[2]-n[2]*en],tl=Math.hypot(...t);const off=tl>1e-3?.32*rho/tl:0;fo=[o[0]+t[0]*off,o[1]+t[1]*off,o[2]+t[2]*off];fr=rho*book.coupling.opening*(.6+.4*p.coupling);}
      const pulse=Math.max(cData[(A.k*CW+3)*4+3],cData[(B.k*CW+3)*4+3]);
      septa.write('sA',ns,o[0],o[1],o[2],rho);septa.write('sB',ns,n[0],n[1],n[2],p.coupling);septa.write('sC',ns,A.k,B.k,Math.max(res.tone[A.k],res.tone[B.k]),pulse);septa.write('sD',ns,fo[0],fo[1],fo[2],fr);ns++;
      const tube=.35+.012*Math.min(cA,cB);
      sutures.write('tA',nt,o[0],o[1],o[2],rho);sutures.write('tB',nt,n[0],n[1],n[2],tube);sutures.write('tC',nt,A.k,B.k,pulse,tv*.06*flow+rand(hash(`${A.id}/${B.id}`)));nt++;
      if(fr>0){sutures.write('tA',nt,fo[0],fo[1],fo[2],fr);sutures.write('tB',nt,n[0],n[1],n[2],tube*.7);sutures.write('tC',nt,A.k,B.k,pulse,tv*.05*flow);nt++;}}
    // the aperture's lip
    const L=chambers.at(-1);if(L?.aperture){const r=cData[(L.k*CW)*4+3],ca=Math.cos(.4+.08*book.laws.coupling),sa=Math.sqrt(1-ca*ca),ap=L.aperture;
      sutures.write('tA',nt,L.c[0]+ap[0]*r*ca,L.c[1]+ap[1]*r*ca,L.c[2]+ap[2]*r*ca,r*sa);sutures.write('tB',nt,ap[0],ap[1],ap[2],.5+.018*r);sutures.write('tC',nt,L.k,-1,0,tv*.04*flow);nt++;}
    septa.commit(ns);sutures.commit(nt);lastStats.pairs=pairs.length;}
  // ---- Spines: fine needles from the walls' lattice points (their count from the chamber's symbols and its region,
  // their reach from the dispersion law), the newest growing out as symbols arrive; beads of light stream out along them.
  // Their places are cached with the chamber's foam (the same key: its files, size and neighbours).
  const spineCache=new Map();
  function spinesOf(c){const sig=filmCache.get(c.id)?.key||'',e=spineCache.get(c.id);if(e&&e.sig===sig&&e.lattice===c.lattice)return e.list;
    const rot=latticeRot(rand(hash(`pores/${book.seed}/${c.id}`))),n=c.lattice,out=[],ap=c.aperture,apCos=Math.cos(.4+.08*book.laws.coupling)-.08;
    const cap=48,step=7919%n||1,off=Math.floor(rand(hash(`sp/${c.id}`))*n);
    for(let j=0;j<n&&out.length<cap;j++){const i=(off+j*step)%n,q=sfPoint(i,n);
      // the lattice frame -> law space: the transpose of the shader's rotation
      const d=[rot[0][0]*q[0]+rot[1][0]*q[1]+rot[2][0]*q[2],rot[0][1]*q[0]+rot[1][1]*q[1]+rot[2][1]*q[2],rot[0][2]*q[0]+rot[1][2]*q[1]+rot[2][2]*q[2]];
      if(ap&&d[0]*ap[0]+d[1]*ap[1]+d[2]*ap[2]>apCos)continue;
      const b=[c.c[0]+d[0]*c.r,c.c[1]+d[1]*c.r,c.c[2]+d[2]*c.r];let hidden=false;
      for(const o of chambers){if(o===c)continue;const dd=(b[0]-o.c[0])**2+(b[1]-o.c[1])**2+(b[2]-o.c[2])**2;if(dd<(o.r*1.04)**2){hidden=true;break;}}
      if(!hidden)out.push({d,len:.6+.8*rand(hash(`sl/${c.id}/${i}`)),ph:rand(hash(`sb/${c.id}/${i}`))});}
    spineCache.set(c.id,{sig,lattice:c.lattice,list:out});return out;}
  function writeSpines(i){let n=0;const reach=.35+.6*book.laws.dispersion,beads=3+Math.round(4*book.laws.dispersion);
    for(const c of chambers){const list=spinesOf(c),want=clamp((5+.09*c.symbols)*c.region.spines,0,list.length)*c.fade;
      for(let j=0;j<list.length&&j<want;j++){const sp=list[j],g=clamp(want-j),L=c.r*reach*sp.len*g;if(L<.5)continue;
        const b=W([c.c[0]+sp.d[0]*c.r,c.c[1]+sp.d[1]*c.r,c.c[2]+sp.d[2]*c.r]),nw=WN(sp.d);
        needles.write('nA',n,b[0],b[1],b[2],.2+.004*c.r);needles.write('nB',n,b[0]+nw[0]*L,b[1]+nw[1]*L,b[2]+nw[2]*L,.03);needles.write('nC',n,sp.ph,.7+.6*c.n/(c.n+4),beads,1);n++;}}
    needles.commit(n);lastStats.spines=n;}
  // Threads between chambers and the light flowing along them; the files' lights (seen through the pores and the aperture).
  const tmp=[0,0,0],tmp2=[0,0,0];
  function writeThreads(i){
    const tv=i.tview,sp=ctx.speed(),gold=V3(pal.secondary).lerp(new THREE.Vector3(1,.78,.42),.5),light=V3(pal.accent,1),un=k=>i.unlocks?.[k]?.level||0;
    const halo_=1+.8*un(2),seg=20,speed=book.flow.speed*(.55+.9*clamp(res.arp));
    // each cord: a few fibres (more with more dependencies) that part at the walls and meet in the middle
    for(const c of cords){const g=c.grow;if(g<=0)continue;const k=Math.max(1,Math.min(6,Math.round(Math.log2(1+c.count)*1.6))),str=clamp(Math.log2(1+c.count)/4,.25,1);
      const t=[c.wb[0]-c.wa[0],c.wb[1]-c.wa[1],c.wb[2]-c.wa[2]],o=[c.wc[0]-(c.wa[0]+c.wb[0])/2,c.wc[1]-(c.wa[1]+c.wb[1])/2,c.wc[2]-(c.wa[2]+c.wb[2])/2];
      const e=[t[1]*o[2]-t[2]*o[1],t[2]*o[0]-t[0]*o[2],t[0]*o[1]-t[1]*o[0]],el=Math.hypot(...e)||1,spread=Math.min(6,c.len*.02);
      for(let f=0;f<k;f++){const off=(f-(k-1)/2)*spread/el,ea=[c.wa[0]+e[0]*off,c.wa[1]+e[1]*off,c.wa[2]+e[2]*off],eb=[c.wb[0]+e[0]*off,c.wb[1]+e[1]*off,c.wb[2]+e[2]*off];
        let prev=ea;for(let s=1;s<=seg;s++){const u=s/seg*g,p=bezier(ea,eb,c.wc,u,[0,0,0]);ribbon(prev,p,.08,.08,gold,.22*str*halo_);prev=p;}}
      // light flowing toward the imports both ways, in trains (dispersion), quicker with the arpeggio
      const n=Math.min(10,1+Math.round(c.count*.6)),ph=rand(hash(c.key));
      for(let q=0;q<n;q++){const fwd=(q+.5)/n<=c.ab/c.count;let u=((tv*speed/c.len+ph+q/n+book.flow.spread*Math.sin(q*2.1+ph*6))%1+1)%1;if(!fwd)u=1-u;if(u>g)continue;
        const train=book.flow.train,lit=1-train+train*Math.pow(Math.max(0,Math.sin((tv*.7+q)*1.3+ph*9)),2);
        bezier(c.wa,c.wb,c.wc,u,tmp);point(tmp,light,.8*lit*(.6+.4*clamp(res.arp)),2.8,0,.4);}}
    // the files' lights inside their chambers
    for(const c of chambers)for(const f of c.files){if(f.row===undefined||!(f.light>0))continue;const k=f.color;
      point(f.w,{x:k[0],y:k[1],z:k[2]},clamp(f.light*.3,0,2),5+3*f.light,0,c.r*.05);}
    lastStats.threads=threads.length;lastStats.cords=cords.length;
  }
  // ---- Agents: probes of light. Waiting, a probe hovers outside the chamber of its last file; at work it enters the
  // chamber and settles at the file's seed (touch.js visits: weights over the agent's own recorded tool events) ----------
  const agentPos=new Map();
  function goalOf(a,i,tvOff=0){const tv=i.tview-tvOff,home=fileAt.get(a.fileId)||fileAt.get(a.home),ph=rand(hash(a.id))*TAU;
    let base;
    if(home){const p=W(wallPoint(home.ch,home.f,extentLaw.center)),d=WN([p[0]-home.ch.w[0],p[1]-home.ch.w[1],p[2]-home.ch.w[2]]),out=home.ch.r*.42;
      base=[p[0]+d[0]*out,p[1]+d[1]*out+6*Math.sin(tv*.4+ph),p[2]+d[2]*out];}
    else{const R=extent.radius*.95;base=[extent.center[0]+R*Math.cos(tv*.05+ph),extent.center[1]+extent.radius*.3+6*Math.sin(tv*.3+ph),extent.center[2]+R*Math.sin(tv*.05+ph)];}
    return base;}
  function positionOf(a,i,lag=0){const goal=goalOf(a,i,lag),visits=touchVisits(ctx.agents,a.id,i.t-lag*1000*ctx.speed(),ctx.speed(),id=>fileAt.has(id));
    const out={x:goal[0],y:goal[1],z:goal[2]};visitBlend(out,visits,id=>{const x=fileAt.get(id);return x?{x:x.f.w[0],y:x.f.w[1],z:x.f.w[2]}:null;},out);return [out.x,out.y,out.z];}
  function writeAgents(i){agentPos.clear();const trail=clamp(num(G.agents?.trail,1),.2,2);
    for(const a of i.agents){const c=agentCol[seatOf(a)],p=positionOf(a,i),al=clamp(a.alpha??1)*(a.subagent?.7:1);agentPos.set(a.id,p);
      point(p,c,1.2*al,a.subagent?9:13,2,1.2);point(p,c,.35*al,46,3,4,halo);
      let prev=p;for(let s=1;s<=10;s++){const q=positionOf(a,i,s*.09*trail);ribbon(prev,q,.5*(1-s/11),.5*(1-(s+1)/11),c,.4*al*(1-s/11));prev=q;}}}
  // ---- Motes: dust turning slowly in the light around the structure (ambient) ---------------------------------------------
  function motes(i){const n=Math.round(QUALITY[clamp(Math.round(i.quality||0),0,3)].motes*clamp(num(atm.motes,.8),0,1.6)*clamp(i.overrides.atmosphere??1,0,2)),tv=i.tview,R=extent.radius,c=extent.center;
    const un=k=>i.unlocks?.[k]?.level||0,crystal=un(3);
    for(let j=0;j<n;j++){const r1=rand(hash(`m/${book.seed}/${j}`)),r2=rand(hash(`m/${book.seed}/${j}/b`)),r3=rand(hash(`m/${book.seed}/${j}/c`));
      const rr=R*(1.05+.9*Math.sqrt(r1)),th=r2*TAU+tv*.012*(1+r3),z=(r3*2-1)*.85,s=Math.sqrt(1-z*z);
      tmp2[0]=c[0]+rr*s*Math.cos(th);tmp2[1]=c[1]+rr*z+Math.sin(tv*.07+j)*3;tmp2[2]=c[2]+rr*s*Math.sin(th);
      const lit=clamp((tmp2[0]-c[0])*key.x+(tmp2[1]-c[1])*key.y+(tmp2[2]-c[2])*key.z,0,R*2)/(R*2);
      const tw=crystal>0&&r1<.25*crystal?Math.pow(Math.max(0,Math.sin(tv*1.7+j*3.1)),14)*1.4:0;
      point(tmp2,pal.highlight,(.05+.4*lit)*(.6+.4*Math.sin(tv*.9+j))+tw+res.spark*.12*(r2<.3?1:0),1.6+1.6*r3,tw>0?2:0,.12);}}
  // ---- Effects: director commands -----------------------------------------------------------------------------------------
  function effect(cmd,i){
    if(i)info=i;const s=clamp(cmd.scale,0,1.6),subj=cmd.subject||{},at=Number.isFinite(cmd.at)?cmd.at:info.t;if(s<=0)return;
    const cs=chambersOf(subj);
    switch(cmd.effect){
      case 'ring':push(rings,{at,chambers:cs,s:s*.8});break;
      case 'decohere':push(decos,{at,chambers:cs,s});break;
      case 'kintsugi':push(gilds,{at,chambers:cs,s});push(rings,{at,chambers:cs,s:s*.6});break;
      // a verified milestone: the covered chambers' front (the whole structure when it is rare, or names nothing known)
      case 'vitrify':case 'anneal':push(fronts,{at,chambers:cs,all:cmd.effect==='vitrify'&&(cmd.tier>=4||!cs.size),s},6);push(rings,{at,chambers:cs.size?cs:new Set(chambers.map(c=>c.id)),s:s*.7});break;
      case 'consolidate':push(pulses,{at,s:s*.8},4);break;
      case 'expand':push(widens,{at,s});break;
      case 'nucleate':case 'accrete':case 'perforate':push(rings,{at,chambers:cs,s:s*.45});break;
      // two agents at one file (agent.collision: the director gives it the integration look): interfering rings there
      case 'couple':if(cmd.intent==='agent.collision'&&subj.fileId){const at_=fileAt.get(subj.fileId);if(at_)push(meetings,{at,chamber:at_.ch.id,s},4);}
        else push(rings,{at,chambers:cs,s:s*.4});break;
      default:break;// a dissolving file: drawn from the model's own times
    }
  }
  // ---- Camera: monumental and slow; it draws toward what changed, and in its idle hours explores a chamber and, now and
  // then (camera.interior), passes through the aperture into the newest one ---------------------------------------------------
  const PERIOD=110,axis=new THREE.Vector3(...axisOf(book)).normalize();
  function cameraGoal(i){
    const tv=i.tview,aspect=camera.aspect||16/9,portrait=aspect<1,motion=clamp(i.overrides.motion??1,0,2),drift=clamp(num(cam.drift,.7),0,1.6)*motion;
    const fov=clamp(num(cam.fov,34),24,50),half=fov*Math.PI/360,pers=cam.personality||'monument';
    const C=new THREE.Vector3(...extent.center),R=extent.radius;
    // the view: obliquely along the coil's axis (so its spiral reads), turning slowly about it; elevation leans it
    const ax=axis,up=new THREE.Vector3(0,1,0),perp=up.clone().addScaledVector(ax,-up.dot(ax));if(perp.lengthSq()<1e-4)perp.set(1,0,0);perp.normalize();
    const beta=(.62+.35*clamp(num(cam.elevation,.4),0,1.2))+.05*Math.sin(tv/41)*drift,spin=rand(book.seed)*TAU+tv*(pers==='orbit'?.03:.012)*drift;
    const dir=ax.clone().multiplyScalar(Math.cos(beta)).addScaledVector(perp,Math.sin(beta)).applyAxisAngle(ax,spin).normalize();
    let distance=R/Math.sin(half)*(portrait?.98:.9)*(pers==='orbit'?1.06:1),az=Math.atan2(dir.z,dir.x),el=Math.asin(clamp(dir.y,-.95,.95));
    let target=C.clone(),k=0,omega=.55;
    // idle exploration: a chamber close up, then (sometimes) into the newest through its aperture, then back out
    const ph=((tv%PERIOD)+PERIOD)%PERIOD/PERIOD,interior=clamp(num(cam.interior,.6),0,1)*(pers==='pilgrim'?1.3:1),cycle=Math.floor(tv/PERIOD);
    const L=chambers.at(-1);
    if(chambers.length&&i.activity<.15){
      const pick=chambers[Math.floor(rand(hash(`${book.seed}/cam/${cycle}`))*chambers.length)];
      const go=rand(hash(`${book.seed}/in/${cycle}`))<interior&&L?.aperture;
      if(ph>.38&&ph<.6){const e=smooth((ph-.38)/.06)*(1-smooth((ph-.54)/.06));const p=new THREE.Vector3(...pick.w);target.lerp(p,e*.85);distance=lerp(distance,pick.r/Math.sin(half)*1.5,e);k=e;}
      else if(go&&ph>=.6&&ph<.86){const ap=new THREE.Vector3(...WN(L.aperture)),Lc=new THREE.Vector3(...L.w),a=smooth((ph-.6)/.05),dive=smooth((ph-.66)/.07)*(1-smooth((ph-.8)/.05));
        target.lerp(Lc,a);az=lerpAngle(az,Math.atan2(ap.z,ap.x),a);el=lerp(el,Math.asin(clamp(ap.y,-.9,.9)),a);distance=lerp(lerp(distance,L.r*2.6,a),L.r*.32,dive);k=a;omega=.42;}
    }
    // what changed is seen up close: its chamber, the camera turning toward it and closing in
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;
    const tch=touches.find(x=>x.kind==='edit'&&x.k>.2&&fileAt.has(x.fileId));
    const lean=(ch,kk,close)=>{const p=new THREE.Vector3(...ch.w);target.lerp(p,kk*.7);distance=lerp(distance,Math.max(ch.r/Math.sin(half)*close,distance*.45),kk);k=Math.max(k,kk);omega=.8;};
    if(att&&since<10){const cs=[...chambersOf(att.subject)].map(id=>byId.get(id)).filter(Boolean);
      if(cs.length===1)lean(cs[0],smooth(since/1.2)*(1-smooth((since-7)/3))*clamp(i.overrides.intensity??1,.4,1)*.85,2.1);}
    else if(tch){const x=fileAt.get(tch.fileId);lean(x.ch,smooth(tch.age/.5)*(1-smooth((tch.age-2.6)/.6))*.7,2.3);}
    for(const x of widens){const a=ageOf(x,i);if(a>=0&&a<6)distance*=1+.08*x.s*smooth(a/.8)*(1-smooth((a-3)/3));}
    return {target,distance,azimuth:az,elevation:el,fov,omega};
  }
  const lerpAngle=(a,b,t)=>{let d=b-a;while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;return a+d*t;};
  // The void's halo sits behind the structure (its centre on screen).
  const pv=new THREE.Vector3();
  function afterCamera(){camera.updateMatrixWorld();voidU.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);voidU.uCam.value.copy(camera.position);
    pv.set(...extent.center).project(camera);const d=camera.position.distanceTo(new THREE.Vector3(...extent.center));
    voidU.uHalo.value.set(pv.x*.5+.5,pv.y*.5+.5,clamp(1.6*extent.radius/Math.max(1,d)),camera.aspect||1.78);
    // the light follows the view, as a studio's would: the key rakes in from the upper left and a little behind the
    // subject (every view has a lit side and a side in shade), the rim from behind it, the fill low from the right
    const f=new THREE.Vector3(),r=new THREE.Vector3(),u=new THREE.Vector3();camera.getWorldDirection(f);r.crossVectors(f,camera.up).normalize();u.crossVectors(r,f).normalize();
    key.copy(r).multiplyScalar(-.78).addScaledVector(u,.55).addScaledVector(f,.32).normalize();
    U.uRim.value.copy(f).addScaledVector(u,.5).addScaledVector(r,.25).normalize();fill.copy(r).multiplyScalar(.7).addScaledVector(u,-.25).addScaledVector(f,-.5).normalize();
    U.uKeyL.value.set(...normalToWorld(book,[key.x,key.y,key.z]));}
  function background(){return voidMat;}
  function grade(i){
    const sec=i.mood?.section,inten=i.overrides.intensity??1;let flash=0;
    for(const x of fronts){const a=ageOf(x,i);if(a>=0&&a<2)flash+=.03*Math.exp(-a*1.6)*(x.all?1.6:1);}
    const tint=new THREE.Vector3(1,1,1);if(sec==='tension')tint.set(1.015,.99,.985);
    tint.lerp(new THREE.Vector3(1.03,.97,.96),(lastStats.stress||0)*.25);
    return {tonemap:'agx',bloom:clamp(num(LT.bloom,1),.3,2)*.42,threshold:clamp(num(LT.bloomThreshold,.7),.5,.9)*1.7,exposure:(1+(clamp(num(LT.exposure,1.05),.4,2.2)-1)*.5)*1.05,
      contrast:clamp(num(LT.contrast,1),.85,1.3)*1.05,saturation:.98,vignette:num(LT.vignette,.3)*1.15,grain:num(LT.grain,.025)*.45,flash:flash*inten,tint,aberration:.0025,streak:0};
  }
  // ---- Words --------------------------------------------------------------------------------------------------------------
  const role=id=>M().districts.get(id)?.role||model.districts.get(id)?.role||'logic';
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  const milestoneWords=c=>(c.detail?.kinds||[]).map(x=>MILESTONE[x]||x).join(' · ');
  const plural=(n,w,ws=`${w}s`)=>`${n} ${n===1?w:ws}`;
  const centre=()=>new THREE.Vector3(...extent.center);
  const posOf=s=>{const cs=[...chambersOf(s)].map(id=>byId.get(id)).filter(Boolean);if(!cs.length)return centre();const c=cs[0];return new THREE.Vector3(c.w[0],c.w[1]+c.r*.6,c.w[2]);};
  function describe(c){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length,pos=posOf(s);
    switch(c.intent){
      case 'subsystem.created':return {text:'A new chamber buds from the aperture',sub:s.groupId?`${ctx.name(s.groupId)} · ${role(s.groupId)}`:'',position:pos};
      case 'module.created':return {text:'A new chamberlet nucleates',sub:s.groupId?ctx.name(s.groupId):'',position:pos};
      case 'structure.created':return {text:'Pores open in the wall',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','component').replace('api.route','route')}`).join(' · ')||plural(d.count||1,'symbol'),position:pos};
      case 'structure.removed':return {text:'Matter dissolves',sub:'structure removed',position:pos};
      case 'subsystem.connected':return {text:d.first?'Coupling · a thread joins two chambers':'The coupling between two chambers grows',sub:'',position:pos};
      case 'validation.failed':return {text:`Tests fail · the wall crazes over ${plural(n,'chamberlet')}`,sub:'observed failing run',position:pos,color:'#ff8a7a'};
      case 'validation.passed':return {text:`Tests pass · ${plural(n,'chamberlet')} ring true`,sub:'observed passing run',position:pos,color:'#e6eef2'};
      case 'validation.recovered':return {text:'Recovered · the cracks fill with gold',sub:'the tests pass again',position:pos,color:'#ffd58a',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the matter anneals',sub:`${plural(d.removedSymbols||0,'symbol')} removed`,position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=milestoneWords(c);return {text:`Phase transition · ${k}`,sub:'verified by a passing test run · the chamber stays crystal',position:pos,banner:k,bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:'Committed · the sutures consolidate',sub:n?`commit observed · ${plural(n,'file')}`:'commit observed',position:pos};
      case 'world.expanded':return {text:`The structure expands · chapter ${d.chapter}`,sub:'accumulated structure',position:pos};
      case 'agent.collision':return {text:'Two agents\' fields meet at one chamberlet',sub:(d.providers||[]).map(id=>presence(id).display).join(' · '),position:pos};
      default:return null;}}
  function agentPosition(id){const p=agentPos.get(id);return p?new THREE.Vector3(...p):null;}
  function agentColor(a){return '#'+agentCol[seatOf(a)].getHexString();}
  function subsystemLabels(){return chambers.filter(c=>c.alive).map(c=>({position:new THREE.Vector3(c.w[0],c.w[1]-c.r*1.02,c.w[2]),text:ctx.name(c.id),sub:`${role(c.id)} · ${plural(c.files.filter(f=>f.alive).length,'file')}`}));}
  function status(){return lastStats.stress>.05?'decoherence':lastStats.gold>.05?'repaired':'';}
  const pv2=new THREE.Vector3();
  function pick(x,y,cm){let best=null,bd=.035;
    for(const c of chambers){for(const f of c.files){if(!f.alive)continue;pv2.set(...W(wallPoint(c,f,extentLaw.center))).project(cm);const d=Math.hypot(pv2.x-x,(pv2.y-y)*.7);if(pv2.z<1&&d<bd){bd=d;best=f.id;}}}
    if(!best)for(const c of chambers){pv2.set(...c.w).project(cm);const d=Math.hypot(pv2.x-x,(pv2.y-y)*.7);if(pv2.z<1&&d<bd*5){bd=d/5;best=`c:${c.id}`;}}
    return best;}
  function inspect(id,i){if(!id)return null;
    if(id.startsWith('c:')){const c=byId.get(id.slice(2));if(!c)return null;return {position:new THREE.Vector3(...c.w),text:`${ctx.name(c.id)} · a chamber`,sub:`${role(c.id)} · ${plural(c.files.filter(f=>f.alive).length,'file')}`};}
    const x=fileAt.get(id),m=M().modules.get(id);if(!x||!m)return null;
    let n=0;for(const th of threads)if(th.a===id||th.b===id)n++;
    return {position:new THREE.Vector3(...W(wallPoint(x.ch,x.f,extentLaw.center))),text:`A chamberlet of ${ctx.name(x.ch.id)} · ${M().stateAt(m,(i||info).t)}`,sub:`${plural(x.f.symbols,'symbol')} · ${plural(n,'thread')}`};}
  function stats(){return {chambers:chambers.length,files:fileRows,films:filmCount,filmMs:+filmMs.toFixed(2),threads:threads.length,cords:cords.length,spines:lastStats.spines||0,pairs:lastStats.pairs||0,history:!!hist,fx:nFx,ribbons:nRib,
    stress:+(lastStats.stress||0).toFixed(2),gold:+(lastStats.gold||0).toFixed(2),vitrified:[...lasting.vit.keys()].filter(id=>vitLevel(id,info.t)>0).length,
    music:res?{notes:res.notes,coherence:+res.coherence.toFixed(2),mono:+Math.max(0,...res.mono).toFixed(2),mode:+Math.max(0,...res.mode).toFixed(2)}:null,
    laws:book.laws,material:mat.kind,perWhorl:+book.perWhorl.toFixed(2),touches:touches.length};}
  function rebuild(){hist=null;prep=null;prepKey='';filmCache.clear();filmSig='';lastSig='';lasting.ready=false;}
  function dispose(){const objs=[];scene.traverse(o=>{if(o!==scene)objs.push(o);});for(const o of objs)scene.remove(o);filmMesh.geometry.dispose();shells?.mesh.geometry.dispose();for(const x of disposables)x.dispose?.();}
  // After a seek: no transient survives (vitrified chambers come back from the director's record, gold from the model).
  function onPrime(){for(const l of [rings,fronts,pulses,decos,gilds,widens,meetings])l.length=0;lastSig='';lasting.ready=false;}
  function onHistory(entries,t){hist=historyFrom(entries,t);prep=null;prepKey='';}
  function onDelta(d,s,e){hist?.applyDelta(d,s,e);}
  function onCue(c,t){if(hist)recordCue(hist,c,t);}
  // Composition anchors (layers.js), read-only.
  const composeA={center:new THREE.Vector3(),extent:200,subsystems:[],active:{pos:new THREE.Vector3()},nodes:[],boundary:{radius:300,y:0}};
  function composeAnchors(i){composeA.center.copy(centre());composeA.extent=extent.radius*2;composeA.subsystems=chambers.map(c=>({id:c.id,pos:new THREE.Vector3(...c.w),size:c.r}));
    composeA.nodes=chambers.flatMap(c=>c.files.slice(0,8).map(f=>({pos:new THREE.Vector3(...f.w)}))).slice(0,64);
    const att=i?ctx.director.attentionAt(i.t,1):null;composeA.active.pos.copy(att?posOf(att.subject):composeA.center);return composeA;}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime,onHistory,onDelta,onCue,
    compose:{camera,scene,anchors:composeAnchors}};
}

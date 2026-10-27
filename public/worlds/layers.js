// Artist layers: a composition's stack of procedural layers (public/composition.js), drawn into a running world (a
// flagship family, or the artist canvas) inside its own HDR scene pass, so the world's finish treats them as part of
// the image. The host (host.js) owns one runtime per world: set() applies a composition (layers are matched by id, so
// an edit rebuilds only what changed and disposes what was removed), update() runs every frame after the camera, and
// the composition's global mappings bend the camera and the grade within bounds.
//
// Anchors come from the world (world.compose.anchors(): the centre, the project's subsystems, the active region,
// structural nodes, the boundary) or from the camera, or a normalised point. Signals (layers-signals.js) are
// deterministic: the score's expression, canonical engineering intents, the ecosystem as shown. Every clock is view
// time integrated frame by frame (a mapped speed never makes a layer jump) and restarts from the performance time after
// a seek, so films (rendered frame by frame) are exact and a seek shows the moment as continuous play would.
import {RENDERERS,RING_TYPES,GPU_SITES,blendOf,SWARM_DT} from './layers-gl.js';
import {createSignals,environmentOf} from './layers-signals.js';
import {rng,hash} from './layers-forms.js';
// The composition model: window.ResonanceComposition where the page has loaded it, otherwise the module itself (the
// receiver serves it at /composition.js; a UMD script is also a valid module).
export async function loadComposition(){
  if(globalThis.ResonanceComposition)return globalThis.ResonanceComposition;
  const m=await import('../composition.js');return globalThis.ResonanceComposition||m.default||m;
}
const ORDER={behind:-1000,world:0,front:1000};
// The particle parameters the population's fixed-step simulation reads (mapped at each tick's own time).
const SIM_KEYS=new Set(['spread','scale','cohesion','separation','alignment','attraction','speed','lifetime']);
// A neutral world for anchors when the world has none (a pack world, a test).
const NO_ANCHORS={center:{x:0,y:0,z:0},extent:10,floor:null,subsystems:[],active:null,nodes:[],boundary:{radius:12,y:0}};
const v3=(p,d={x:0,y:0,z:0})=>p?{x:+p.x||0,y:+p.y||0,z:+p.z||0}:d;
export function createLayers({THREE,scene,camera,quality=()=>0,seed=0,film=false,composition:C,director=()=>null,speed=()=>1,musicAt=null,size=()=>[1920,1080]}){
  if(!C)throw new Error('createLayers needs the composition model (loadComposition)');
  const root=new THREE.Group();root.name='artist-layers';scene.add(root);
  const signals=createSignals({music:musicAt,activity:T=>director()?.activityAt(T)??0,commands:()=>director()?.commands||[],speed});
  const stack=new Map(),env={THREE,quality,random:key=>rng(hash(`${seed>>>0}/${key}`))};
  const counters={created:0,rebuilt:0,disposed:0};
  // A layer that fails (building or drawing) is set aside with its reason, its resources released and its definition
  // remembered: it is not rebuilt every frame, only when the artist changes it. The rest of the composition and the
  // world carry on.
  const failed=new Map();
  const failure=(l,err)=>{const e=stack.get(l.id);if(e){try{e.renderer.dispose();}catch{}e.group.visible=false;for(const o of [...e.group.children])e.group.remove(o);e.key=null;}
    failed.set(l.id,{def:JSON.stringify(l),name:l.name,type:l.type,message:String(err?.message||err).slice(0,160)});};
  let comp=null,anchors=null,lastTview=null,active=null,global={'camera.sway':0,'camera.zoom':0,'finish.bloom':0,'finish.exposure':0},drawn={points:0,segments:0,draws:0};
  function create(l){
    const r=RENDERERS[l.type](THREE,env),group=new THREE.Group();group.name=`layer:${l.id}`;root.add(group);
    const e={id:l.id,type:l.type,cfg:l,renderer:r,group,key:null,state:'',clock:0,spin:0,index:0};stack.set(l.id,e);counters.created++;return e;
  }
  function remove(e){e.group.parent?.remove(e.group);e.renderer.dispose();stack.delete(e.id);counters.disposed++;}
  // ---- A composition --------------------------------------------------------------------------------------------------
  // Layers keep their GPU resources while their id and type stay; a removed layer releases everything at once.
  function set(c,opts={}){
    if(opts.anchors!==undefined)anchors=opts.anchors;
    comp=c?C.normalize(c):null;
    const want=new Map((comp?.layers||[]).map(l=>[l.id,l]));
    for(const e of [...stack.values()]){const l=want.get(e.id);if(!l||l.type!==e.type)remove(e);}
    for(const id of [...failed.keys()])if(!want.has(id))failed.delete(id);
    (comp?.layers||[]).forEach((l,i)=>{if(failed.get(l.id)?.def===JSON.stringify(l))return;failed.delete(l.id);
      try{const e=stack.get(l.id)||create(l);e.cfg=l;e.index=i;}catch(err){failure(l,err);}});
    if(!comp)global={'camera.sway':0,'camera.zoom':0,'finish.bloom':0,'finish.exposure':0};
    return comp;
  }
  // ---- Anchors --------------------------------------------------------------------------------------------------------
  function anchorsAt(info){
    let A=typeof anchors==='function'?anchors(info):anchors;if(!A)A=NO_ANCHORS;
    const center=v3(A.center),extent=Math.max(1,+A.extent||10);
    const subs=(A.subsystems||[]).map(s=>({id:String(s.id??''),p:v3(s.pos),b:s.base?v3(s.base):null,r:Math.max(.2,+s.size||extent*.1)}))
      .sort((a,b)=>b.r-a.r||(a.id<b.id?-1:a.id>b.id?1:0));
    return {center,extent,floor:Number.isFinite(A.floor)?A.floor:null,subs,active:A.active?.pos?v3(A.active.pos):null,nodes:(A.nodes||[]).map(n=>v3(n.pos)),boundary:{radius:Math.max(1,+A.boundary?.radius||extent*1.2),y:+A.boundary?.y||0}};
  }
  const fwd=new THREE.Vector3();
  function sitesFor(l,A){
    const kind=l.anchor.kind,max=l.type==='particles'||l.type==='ribbons'?64:GPU_SITES,c=A.center,E=A.extent;
    const at=(p,r)=>({x:p.x,y:p.y,z:p.z,r});
    // Forms that grow upward root on the world's floor (where it has one); a spiral hovers where it is anchored.
    const grounded=l.type==='fractal'&&l.params.form!=='spiral'&&A.floor!==null,ground=p=>grounded?{x:p.x,y:A.floor,z:p.z}:p;
    switch(kind){
      case 'subsystems':if(A.subs.length)return A.subs.slice(0,max).map(s=>at(l.type==='fractal'&&s.b?s.b:s.p,s.r));break;
      case 'largest':if(A.subs.length){const s=A.subs[l.anchor.index%A.subs.length];return [at(l.type==='fractal'&&s.b?s.b:s.p,s.r)];}break;
      case 'active':return [at(ground(active||c),E*.18)];
      case 'nodes':if(A.nodes.length){const n=A.nodes.length,m=Math.min(max,n);return Array.from({length:m},(_,k)=>at(A.nodes[Math.floor(k*n/m)],E*.07));}break;
      // Around the boundary: one great site encircling the world at mid-height (rings, a volume, a current), or eight
      // points on its edge at floor level.
      case 'boundary':{const B=A.boundary;if(RING_TYPES.has(l.type))return [at({x:c.x,y:c.y,z:c.z},B.radius)];
        return Array.from({length:8},(_,k)=>{const a=k/8*Math.PI*2;return at({x:c.x+Math.cos(a)*B.radius,y:B.y,z:c.z+Math.sin(a)*B.radius},E*.12);});}
      case 'camera':{camera.getWorldDirection(fwd);const D=E*.35,h=D*Math.tan((camera.fov||36)*Math.PI/360);
        return [at({x:camera.position.x+fwd.x*D,y:camera.position.y+fwd.y*D,z:camera.position.z+fwd.z*D},h*.9)];}
      case 'point':return [at({x:c.x+l.anchor.x*E,y:(grounded?A.floor:c.y)+l.anchor.y*E,z:c.z+l.anchor.z*E},E*.25)];
      default:break;
    }
    return [at(ground(c),E*.5)];
  }
  // The active region glides after the work (it never jumps between subjects), and is placed anew after a seek.
  function follow(A,dtv,jump){const goal=A.active||A.center;
    if(!active||jump){active={...goal};return;}const k=1-Math.exp(-dtv/1.2);active.x+=(goal.x-active.x)*k;active.y+=(goal.y-active.y)*k;active.z+=(goal.z-active.z)*k;}
  // The populations' environment when no digital life is shown: the composition's own particle layers.
  function populations(){let n=0;const out={density:0,current:0,coherence:0,disturbance:0,field:0,trails:0};
    for(const e of stack.values()){const m=e.type==='particles'&&e.group.visible?e.renderer.metrics:null;if(!m)continue;n++;for(const k in out)out[k]+=m[k]||0;}
    if(!n)return null;for(const k in out)out[k]/=n;return out;}
  // ---- Frame -------------------------------------------------------------------------------------------------------------
  function update(info){
    if(!comp||!info)return;
    camera.updateMatrixWorld();
    const tv=Number.isFinite(info.tview)?info.tview:0;let dtv=lastTview===null?0:tv-lastTview;const jump=lastTview===null||dtv<0||dtv>.5;if(jump)dtv=0;lastTview=tv;
    if(jump)signals.reset();
    const A=anchorsAt(info);follow(A,dtv,jump);
    const life=info.life&&!info.life.restoring&&info.life.eco?environmentOf(info.life.eco):null;
    signals.update({t:info.t,dt:dtv,music:info.music,activity:info.activity,agents:info.agents},life||populations());
    global=C.applyMappings({'camera.sway':0,'camera.zoom':0,'finish.bloom':0,'finish.exposure':0},comp.mappings,(id,s)=>signals.get(id,s),C.GLOBAL_TARGETS);
    const h=size()[1],uPx=2*Math.tan((camera.fov||36)*Math.PI/360)/Math.max(1,h),q=quality(),k=speed()>0?speed():1;
    const solo=comp.layers.some(l=>l.enabled&&l.solo);drawn={points:0,segments:0,draws:0};
    for(const l of comp.layers){const e=stack.get(l.id);if(!e||failed.has(l.id))continue;
      const visible=l.enabled&&(!solo||l.solo);e.group.visible=visible;if(!visible)continue;
      try{
      const spec=C.specOf(l.type),p=C.applyMappings(l.params,l.mappings,(id,s)=>signals.get(id,s),spec),sites=sitesFor(l,A);
      const key=e.renderer.key(l,sites);
      if(key!==e.key){if(e.key!==null)counters.rebuilt++;e.key=key;e.renderer.build(l,sites);for(const o of [...e.group.children])e.group.remove(o);for(const o of e.renderer.objects)e.group.add(o);e.state='';}
      // Clocks: integrated speed (and a structure's turning), restarted from the performance time after a seek.
      const sp=+p.speed||0,rot=(+p.rotation||0)*sp;
      if(jump){e.clock=tv*(+l.params.speed||0);e.spin=tv*(+l.params.rotation||0)*(+l.params.speed||0);}else{e.clock+=dtv*sp;e.spin+=dtv*rot;}
      // Depth class and blend: draw order and depth state on every object of the layer.
      const state=`${l.depth}|${l.blend}|${e.index}|${e.renderer.objects.length}`;
      if(state!==e.state){e.state=state;e.renderer.objects.forEach((o,j)=>{o.renderOrder=ORDER[l.depth]+e.index*10+j;});
        for(const m of e.renderer.materials){blendOf(THREE,m,l.blend);m.depthTest=l.depth!=='front';m.depthWrite=false;}}
      for(const m of e.renderer.materials){const u=m.uniforms;u.uOpacity.value=p.opacity;u.uBright.value=p.brightness;u.uHue.value=p.hue;u.uFar.value=l.depth==='behind'?1:0;u.uClock.value=e.clock;u.uPx.value=uPx;}
      const U0=A.extent*.5;
      e.renderer.update(p,{info,sites,center:A.center,U0,camera,uPx,quality:q,clock:e.clock,spin:e.spin,tview:tv,dtv,film,depth:l.depth,blend:l.blend,
        swarmSites:sites.map(s=>({x:(s.x-A.center.x)/U0,y:(s.y-A.center.y)/U0,z:(s.z-A.center.z)/U0,r:s.r/U0})),
        // A tick's own parameters: the population's mappings evaluated at that tick's performance time, smoothed tick by
        // tick in the population's own state (so a generation is the same however it was reached).
        tickParams:(t,run)=>{const T=info.t+(t-tv)*1000*k,sim=l.mappings.filter(m=>SIM_KEYS.has(m.target));if(!sim.length)return l.params;
          const sig=(id,s)=>{const raw=signals.at(id,T);if(!(s>0))return raw;const key=`${id}|${s}`,f=run.filters.get(key);const v=f===undefined?raw:f+(raw-f)*(1-Math.exp(-SWARM_DT/s));run.filters.set(key,v);return v;};
          return C.applyMappings(l.params,sim,sig,spec);}});
      const s=e.renderer.stats();drawn.points+=s.points||0;drawn.segments+=s.segments||0;drawn.draws+=s.draws||0;
      }catch(err){failure(l,err);}}
  }
  return {
    set,update,
    // Composition-level mappings: a bounded camera sway and zoom on the world's own camera goal.
    camera(goal,info){const s=global['camera.sway'],z=global['camera.zoom'];if(!goal||(!s&&!z))return goal;const t=info?.tview||0;
      if(s){goal.azimuth+=s*.16*Math.sin(t*.31)+s*.05*Math.sin(t*.83+1.1);goal.elevation+=s*.045*Math.sin(t*.23+1.3);}
      if(z)goal.distance*=1-z;return goal;},
    // …and the grade's bloom and exposure (unchanged when nothing is mapped).
    grade(g){const b=global['finish.bloom'],x=global['finish.exposure'];if(!b&&!x)return g;return {...g,bloom:(g.bloom??1)*(1+b),exposure:(g.exposure??1)*(1+x)};},
    // After a seek: no smoothed value and no clock carries over; populations restart from their generation.
    onPrime(){signals.reset();lastTview=null;active=null;},
    get composition(){return comp;},get signals(){return signals;},get root(){return root;},
    stats(){const f=[...failed].map(([id,x])=>({id,name:x.name,type:x.type,message:x.message}));
      return comp?{layers:comp.layers.filter(l=>l.enabled).length,cost:C.budgetOf(comp).used,points:drawn.points,segments:drawn.segments,drawCalls:drawn.draws,failed:f,...counters}:{layers:0,cost:0,points:0,segments:0,drawCalls:0,failed:f,...counters};},
    ids:()=>[...stack.keys()],
    dispose(){for(const e of [...stack.values()])remove(e);scene.remove(root);comp=null;}
  };
}

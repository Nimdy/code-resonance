// The Construct: an illuminated architectural model of the software, built as the work happens.
//
// Visual language (each element is tied to engineering data, never decoration):
//  - ground plan:   districts = architectural groups (salted ids only), separated by streets; the core at the centre;
//                   ground appears only where something is built, so the world starts empty
//  - buildings:     one per file, on its persisted plot; storeys = symbols in stable slot order
//                   functions = floors, classes = thick blocks, UI components = glass storeys,
//                   interfaces/types = open frames, module constants = thin plates, API routes = roof spires;
//                   test files are open lattice "instruments"
//  - materials:     draft = translucent scaffold, committed = solid, validated = lit windows,
//                   stressed = strain lines and a red ground glow, only where a failing run applies
//  - connections:   conduits within a district, high bridges between districts (integration)
//  - agents:        a builder drone per agent, only for correlated (verified) provenance; editor activity = warm lamp
//  - time:          every animation is a function of the shared performance clock, snapped to the music's step grid
import * as THREE from './vendor/three.module.min.js';

const SQRT3=Math.sqrt(3);
const PALETTE=['#43d1c1','#f2a65a','#a78bfa','#f582ae','#5cb7f2','#9be37d','#f7786b','#e9d461'];
const CORE='#efe6cf',SCAFFOLD='#d7ecff',STRESS='#ff6a4a',VALID_LIGHT='#fff0d2';
const AGENT_COLORS=['#ff9ee8','#ffd27a','#9dffcf','#a7b8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'];
const MOODS={home:{key:'#dce8ff',sky:'#0d1730',k:1},away:{key:'#e2d6ff',sky:'#130f2c',k:.95},tension:{key:'#ffc2a0',sky:'#1d0f14',k:.8},
  resolve:{key:'#d4fff0',sky:'#0b1a1f',k:1},lift:{key:'#fff0cc',sky:'#1a1608',k:1.2},breath:{key:'#b9c8f0',sky:'#080d1c',k:.75}};
// Storeys are tall and the footprint slim, so even a file with a handful of symbols stands as a building.
const KINDS={
  'function':{h:.3,r:.56,look:'panel'},'method':{h:.21,r:.54,look:'panel'},'class':{h:.44,r:.64,look:'block'},
  'ui.component':{h:.38,r:.6,look:'glass'},'interface':{h:.22,r:.56,look:'frame'},'type':{h:.16,r:.54,look:'frame'},
  'variable':{h:.1,r:.5,look:'plate'}
};
const PLINTH_H=.16,GAP=.008;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>{x=clamp(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;};
const easeOut=x=>1-Math.pow(1-clamp(x),3);
// Fully faded objects are hidden, so they cost no draw call (it matters with hundreds of buildings).
function fade(o,opacity){if(!o)return;o.material.opacity=opacity;o.visible=opacity>.002;}
const plot=(q,r)=>({x:SQRT3*q+SQRT3/2*r,z:1.5*r});
function radialTexture(stops){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const grad=g.createRadialGradient(64,64,0,64,64,64);for(const [o,a] of stops)grad.addColorStop(o,`rgba(255,255,255,${a})`);
  g.fillStyle=grad;g.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function skyTexture(){
  const c=document.createElement('canvas');c.width=4;c.height=256;const g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,0,256);grad.addColorStop(0,'#03050a');grad.addColorStop(.55,'#070c18');grad.addColorStop(.8,'#0d1628');grad.addColorStop(1,'#111b2e');
  g.fillStyle=grad;g.fillRect(0,0,4,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// District character from what it contains (never from its name).
function roleOf(group){
  const c=group.counts||{},ui=c['ui.component']||0,routes=c['api.route']||0,cls=(c.class||0)+(c.interface||0),fn=(c.function||0)+(c.method||0);
  if(group.test)return 'tests';if(group.core)return 'core';
  if(ui>=Math.max(routes,cls,1)&&ui*2>=fn)return 'interface';if(routes>0&&routes>=ui)return 'services';
  if(cls>fn*.5)return 'model';return 'logic';
}

export function createConstruct(canvas,{onCaption=()=>{},film=false,speed=1}={}){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:film,powerPreference:'high-performance'});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;renderer.outputColorSpace=THREE.SRGBColorSpace;
  // Soft shadows give the structures weight and make their form readable.
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=skyTexture();scene.fog=new THREE.FogExp2('#101a2e',.018);
  const camera=new THREE.PerspectiveCamera(34,16/9,.1,600);
  const hemi=new THREE.HemisphereLight('#a9c2ff','#1a2233',1.05);scene.add(hemi);
  const key=new THREE.DirectionalLight('#dce8ff',2.4);key.position.set(-14,26,10);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0004;key.shadow.normalBias=.02;key.shadow.radius=4;scene.add(key,key.target);
  const fill=new THREE.DirectionalLight('#ffcfa0',.45);fill.position.set(16,8,-12);scene.add(fill);
  const glowTex=radialTexture([[0,1],[.25,.55],[.6,.12],[1,0]]),poolTex=radialTexture([[0,.9],[.5,.35],[1,0]]);
  const ground=new THREE.Mesh(new THREE.CircleGeometry(400,64),new THREE.MeshStandardMaterial({color:'#121a28',roughness:.92,metalness:0}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.01;ground.receiveShadow=true;scene.add(ground);
  // A faint survey grid of the whole site gives scale and a sense of a plan being filled in.
  const grid=(()=>{const pts=[];for(let q=-40;q<=40;q++)for(let r=-40;r<=40;r++){if(Math.abs(q+r)>40)continue;const {x,z}=plot(q,r);
    for(let k=0;k<6;k++){const a0=k/6*Math.PI*2,a1=(k+1)/6*Math.PI*2;pts.push(x+Math.sin(a0)*.995,0,z+Math.cos(a0)*.995,x+Math.sin(a1)*.995,0,z+Math.cos(a1)*.995);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    return new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#2a3a55',transparent:true,opacity:.13}));})();
  grid.position.y=.001;scene.add(grid);
  const world=new THREE.Group();scene.add(world);
  const geoCache=new Map();
  function hexGeo(r,h,open=false){const k=`${r.toFixed(3)}|${h.toFixed(3)}|${open}`;if(!geoCache.has(k)){const g=new THREE.CylinderGeometry(r,r,h,6,1,open);g.translate(0,h/2,0);geoCache.set(k,g);}return geoCache.get(k);}
  function edgeGeo(r,h){const k=`e|${r.toFixed(3)}|${h.toFixed(3)}`;if(!geoCache.has(k))geoCache.set(k,new THREE.EdgesGeometry(hexGeo(r,h)));return geoCache.get(k);}
  // Corner lines only (no horizontals), so a finished building reads as one continuous facade.
  function cornerGeo(r,h){const k=`c|${r.toFixed(3)}|${h.toFixed(3)}`;if(!geoCache.has(k)){const pts=[];for(let i=0;i<6;i++){const a=i/6*Math.PI*2;pts.push(Math.sin(a)*r,0,Math.cos(a)*r,Math.sin(a)*r,h,Math.cos(a)*r);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));geoCache.set(k,g);}return geoCache.get(k);}
  const tileGeo=new THREE.CylinderGeometry(.985,.985,.05,6);tileGeo.translate(0,.025,0);
  const tileEdges=new THREE.EdgesGeometry(tileGeo);
  const ringGeo=new THREE.RingGeometry(.74,.84,6,1);ringGeo.rotateX(-Math.PI/2);
  const districts=new Map(),buildings=new Map(),tiers=new Map(),links=new Map(),agents=new Map(),effects=[];
  let stepMs=60000/(92*4),mood='home',energy=0,lastCaptionAt=-1e12,extent=4,attention=null;
  const view={target:new THREE.Vector3(),distance:11,shift:0};
  // Callers pass performance time. Animations run in viewer time (performance time / replay speed) so pacing stays
  // natural at any replay speed, while starts are snapped to the music's step grid in performance time.
  const vsnap=t=>Math.ceil(t/stepMs)*stepMs/speed;
  function caption(t,text,priority=1){if(t-lastCaptionAt<3800&&priority<3)return false;lastCaptionAt=t;onCaption(text,t);return true;}
  function look(gid){const d=districts.get(gid);return d?d.color:new THREE.Color(CORE);}
  // ---- Districts -------------------------------------------------------------------------------------------
  function district(node,t){
    let d=districts.get(node.id);
    if(!d){
      const order=node.order??districts.size;
      const color=new THREE.Color(node.core?CORE:PALETTE[(order-(node.core?0:1)+PALETTE.length*8)%PALETTE.length]);
      const pool=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:poolTex,color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
      pool.rotation.x=-Math.PI/2;pool.position.y=.004;world.add(pool);
      d={id:node.id,core:!!node.core,color,pool,born:t,role:'logic',cells:0,cx:0,cz:0};districts.set(node.id,d);
    }
    Object.assign(d,{counts:node.counts,test:node.test,role:roleOf({...node,test:d.test})});
    return d;
  }
  function districtCentre(d){
    let x=0,z=0,n=0,r=0;
    for(const b of buildings.values())if(b.gid===d.id&&!b.removed){x+=b.x;z+=b.z;n++;}
    if(!n)return;d.cx=x/n;d.cz=z/n;
    for(const b of buildings.values())if(b.gid===d.id&&!b.removed)r=Math.max(r,Math.hypot(b.x-d.cx,b.z-d.cz));
    d.cells=n;d.pool.position.set(d.cx,.004,d.cz);d.radius=r+2.2;d.pool.scale.setScalar(d.radius*2.4);
  }
  // ---- Buildings and storeys -----------------------------------------------------------------------------
  function building(node,t){
    let b=buildings.get(node.id);
    if(b){Object.assign(b,{counts:node.counts||b.counts,test:!!node.test});return b;}
    const {x,z}=plot(node.q,node.r);
    const group=new THREE.Group();group.position.set(x,0,z);world.add(group);
    const color=look(node.group);
    const tileMat=new THREE.MeshStandardMaterial({color:color.clone().multiplyScalar(.3).lerp(new THREE.Color('#1a2335'),.55),roughness:.8,metalness:.05,transparent:true,opacity:0});
    const tile=new THREE.Mesh(tileGeo,tileMat);tile.receiveShadow=true;
    const tileLine=new THREE.LineSegments(tileEdges,new THREE.LineBasicMaterial({color:color.clone().multiplyScalar(.75),transparent:true,opacity:0}));
    const plinthMat=new THREE.MeshStandardMaterial({color:'#2a3446',roughness:.65,metalness:.25,emissive:color,emissiveIntensity:.04});
    const plinth=new THREE.Mesh(hexGeo(.72,PLINTH_H),plinthMat);plinth.scale.y=.001;plinth.castShadow=true;plinth.receiveShadow=true;
    // One silhouette outline per building (corners + roof), so storeys read as a single structure, not stacked plates.
    const outline=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color,transparent:true,opacity:0}));
    const trim=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));trim.position.y=PLINTH_H+.002;
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4),new THREE.MeshBasicMaterial({map:poolTex,color:STRESS,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    glow.rotation.x=-Math.PI/2;glow.position.y=.06;
    const survey=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:7},(_,i)=>{const a=i/6*Math.PI*2;return new THREE.Vector3(Math.sin(a)*.95,.07,Math.cos(a)*.95);})),
      new THREE.LineBasicMaterial({color:SCAFFOLD,transparent:true,opacity:0}));
    group.add(tile,tileLine,plinth,trim,glow,survey,outline);
    b={id:node.id,gid:node.group,x,z,group,tile,tileLine,plinth,trim,glow,survey,outline,outlineSig:'',color,state:node.state||'draft',shownState:node.state||'draft',
      stateAt:t,counts:node.counts||{},test:!!node.test,born:t,removed:null,builder:null,builderAt:-1e12,stressAt:-1e12,validAt:-1e12,crown:null,spires:[],storeys:new Set()};
    buildings.set(node.id,b);
    return b;
  }
  function tierMaterials(b,kind){
    const k=KINDS[kind]||KINDS.function,c=b.color;
    const look=b.test?'frame':k.look;
    const body=look==='frame'?null:new THREE.MeshStandardMaterial({
      color:look==='glass'?new THREE.Color('#bfe4ff').lerp(c,.45):look==='plate'?new THREE.Color('#7d8aa3').lerp(c,.25):new THREE.Color('#c3cbdb').lerp(c,look==='block'?.42:.34),
      roughness:look==='glass'?.15:.5,metalness:look==='glass'?.3:.12,emissive:c,emissiveIntensity:look==='glass'?.28:.05,transparent:true,opacity:0});
    const edge=new THREE.LineBasicMaterial({color:SCAFFOLD,transparent:true,opacity:0});
    const band=look==='frame'||look==='plate'?null:new THREE.MeshBasicMaterial({color:VALID_LIGHT,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
    return {body,edge,band,look};
  }
  function tier(node,t,hidden){
    let s=tiers.get(node.id);
    if(s){s.slot=node.slot??s.slot;s.kind=node.type;return s;}
    const b=buildings.get(node.parent);if(!b)return null;
    if(node.type==='api.route'){
      const mat=new THREE.MeshStandardMaterial({color:'#c9d6ea',emissive:b.color,emissiveIntensity:.35,roughness:.4,metalness:.5,transparent:true,opacity:0});
      const mast=new THREE.Mesh(new THREE.CylinderGeometry(.018,.04,.62,6),mat);mast.geometry.translate(0,.31,0);
      const beacon=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:b.color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
      beacon.scale.setScalar(.34);const spire=new THREE.Group();spire.add(mast,beacon);b.group.add(spire);
      s={id:node.id,parent:b.id,kind:'api.route',slot:node.slot??0,spire,mast,beacon,mat,born:hidden?null:t,removed:null,weld:-1e12};
    }else{
      const m=tierMaterials(b,node.type);
      const k=KINDS[node.type]||KINDS.function;
      const holder=new THREE.Group();b.group.add(holder);
      s={id:node.id,parent:b.id,kind:node.type,slot:node.slot??0,holder,mats:m,k,born:hidden?null:t,removed:null,weld:-1e12,y:null,r:null,mesh:null,edges:null,band:null};
    }
    tiers.set(node.id,s);b.storeys.add(s);return s;
  }
  function dropTier(s){tiers.delete(s.id);buildings.get(s.parent)?.storeys.delete(s);}
  // Storey geometry depends on its height in the stack (slight taper), so it is (re)built when the stack changes.
  function shapeTier(s,i,y){
    const taper=1-Math.min(.4,i*.035),r=s.k.r*taper,h=s.k.h;
    if(s.r!==null&&Math.abs(s.r-r)<1e-3)return;
    s.r=r;s.holder.clear();
    if(s.mats.body){s.mesh=new THREE.Mesh(hexGeo(r,h),s.mats.body);s.mesh.castShadow=true;s.mesh.receiveShadow=true;s.holder.add(s.mesh);}
    s.edges=new THREE.LineSegments(edgeGeo(r+.004,h),s.mats.edge);s.holder.add(s.edges);
    const b=buildings.get(s.parent);if(b){s.corners=new THREE.LineSegments(cornerGeo(r+.003,h+GAP),b.outline.material);s.holder.add(s.corners);}
    if(s.mats.band){s.band=new THREE.Mesh(hexGeo(r+.006,Math.min(.045,h*.32),true),s.mats.band);s.band.position.y=h*.42;s.holder.add(s.band);}
  }
  function layoutStack(b,dt,immediate){
    const stack=[...b.storeys].filter(s=>s.kind!=='api.route'&&s.born!==null).sort((a,c)=>a.slot-c.slot||a.id.localeCompare(c.id));
    let y=PLINTH_H+GAP,i=0;
    for(const s of stack){
      shapeTier(s,i,y);
      if(s.y===null||immediate)s.y=y;else s.y+=(y-s.y)*Math.min(1,dt*5);
      s.holder.position.y=s.y;
      if(!s.removed){y+=s.k.h+GAP;i++;}
    }
    // Symbols beyond the shown storeys form a crown whose height grows with their number.
    const shown=stack.filter(s=>!s.removed).length,total=Object.entries(b.counts||{}).filter(([k])=>k!=='api.route'&&k!=='property').reduce((a,[,n])=>a+n,0);
    const extra=Math.max(0,total-shown);
    if(extra>0){
      const h=Math.min(1,.1*Math.log2(1+extra)),r=.52*(1-Math.min(.4,i*.035));
      if(!b.crown){b.crown=new THREE.Mesh(hexGeo(1,1),new THREE.MeshStandardMaterial({color:new THREE.Color('#6b7891').lerp(b.color,.12),roughness:.7,metalness:.1,transparent:true,opacity:.95}));b.group.add(b.crown);}
      b.crown.scale.set(r,h,r);b.crown.position.y=y;y+=h+GAP;
    }else if(b.crown){b.group.remove(b.crown);b.crown=null;}
    // Files without code symbols (configuration, styles, docs) are low pavilions, so every file is a visible building.
    if(!shown&&!extra){
      if(!b.pavilion){b.pavilion=new THREE.Mesh(hexGeo(.5,.3),new THREE.MeshStandardMaterial({color:new THREE.Color('#7b88a1').lerp(b.color,.3),roughness:.7,metalness:.1}));b.pavilion.castShadow=true;b.pavilion.position.y=PLINTH_H;b.group.add(b.pavilion);}
      y+=.32;
    }else if(b.pavilion){b.group.remove(b.pavilion);b.pavilion=null;}
    b.top=y;
    // Roof ring at the top storey's radius.
    const roofR=(stack.filter(x=>!x.removed).at(-1)?.r??.5)+.003,sig=`${y.toFixed(3)}|${roofR.toFixed(3)}`;
    if(sig!==b.outlineSig){b.outlineSig=sig;const pts=[];
      for(let k=0;k<6;k++){const a=k/6*Math.PI*2,a1=(k+1)/6*Math.PI*2;pts.push(Math.sin(a)*roofR,y-GAP,Math.cos(a)*roofR,Math.sin(a1)*roofR,y-GAP,Math.cos(a1)*roofR);}
      b.outline.geometry.dispose();b.outline.geometry=new THREE.BufferGeometry();b.outline.geometry.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));}
    const spires=[...b.storeys].filter(s=>s.kind==='api.route'&&s.born!==null).sort((a,c)=>a.slot-c.slot);
    spires.forEach((s,j)=>{const a=j/Math.max(1,spires.length)*Math.PI*2+.4,rr=spires.length>1?.28:0;s.spire.position.set(Math.sin(a)*rr,y,Math.cos(a)*rr);s.beacon.position.y=.66;});
  }
  // ---- Links ---------------------------------------------------------------------------------------------
  function link(edge,t){
    const key=`${edge.a}>${edge.b}`;if(links.has(key))return links.get(key);
    const a=buildings.get(edge.a),b=buildings.get(edge.b);if(!a||!b)return null;
    const l={key,a:edge.a,b:edge.b,cross:!!edge.cross,born:t,removed:null,mesh:null,count:0};links.set(key,l);return l;
  }
  function shapeLink(l){
    const a=buildings.get(l.a),b=buildings.get(l.b);if(!a||!b)return;
    const ya=l.cross?(a.top||.4):PLINTH_H+.04,yb=l.cross?(b.top||.4):PLINTH_H+.04;
    const d=Math.hypot(a.x-b.x,a.z-b.z),lift=l.cross?1.1+.24*d:.25+.08*d;
    const sig=`${a.x},${a.z},${b.x},${b.z},${ya.toFixed(2)},${yb.toFixed(2)}`;if(l.sig===sig)return;l.sig=sig;
    const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x,ya,a.z),new THREE.Vector3((a.x+b.x)/2,Math.max(ya,yb)+lift,(a.z+b.z)/2),new THREE.Vector3(b.x,yb,b.z));
    const geo=new THREE.TubeGeometry(curve,l.cross?48:24,l.cross?.032:.014,5,false);
    // Colour runs from the source district to the target district.
    const colors=[],ca=a.color,cb=b.color,count=geo.attributes.position.count,seg=(l.cross?48:24)+1;
    for(let i=0;i<count;i++){const u=Math.floor(i/6)/(seg-1);const c=ca.clone().lerp(cb,clamp(u));colors.push(c.r,c.g,c.b);}
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    if(l.mesh){world.remove(l.mesh);l.mesh.geometry.dispose();}
    l.mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:l.cross?.8:.55,blending:THREE.AdditiveBlending,depthWrite:false}));
    l.curve=curve;l.indexCount=geo.index.count;world.add(l.mesh);
  }
  // Settled conduits are merged into one mesh (one draw call); a conduit being laid or removed keeps its own.
  const SETTLE=6900;
  const conduitMesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
  world.add(conduitMesh);let mergedAt=-1e12;
  function mergeConduits(t){
    const list=[...links.values()].filter(l=>!l.cross&&l.removed===null&&l.mesh&&t-l.born>SETTLE);
    for(const l of links.values())l.merged=false;for(const l of list){l.merged=true;l.mesh.visible=false;}
    let nv=0,ni=0;for(const l of list){nv+=l.mesh.geometry.attributes.position.count;ni+=l.mesh.geometry.index.count;}
    const pos=new Float32Array(nv*3),col=new Float32Array(nv*3),idx=new Uint32Array(ni);let v=0,i=0;
    for(const l of list){const g=l.mesh.geometry;pos.set(g.attributes.position.array,v*3);col.set(g.attributes.color.array,v*3);for(const x of g.index.array)idx[i++]=x+v;v+=g.attributes.position.count;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setIndex(new THREE.BufferAttribute(idx,1));
    conduitMesh.geometry.dispose();conduitMesh.geometry=geo;mergedAt=t;
  }
  // ---- Agents (verified provenance only) and the editor lamp ---------------------------------------------
  function drone(voice){
    if(agents.has(voice))return agents.get(voice);
    const color=new THREE.Color(AGENT_COLORS[voice%8]);
    const body=new THREE.Mesh(new THREE.OctahedronGeometry(.26,0),new THREE.MeshBasicMaterial({color}));
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));halo.scale.setScalar(1.7);
    const beamGeo=new THREE.CylinderGeometry(.05,.62,1,24,1,true);beamGeo.translate(0,-.5,0);
    const beam=new THREE.Mesh(beamGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    const light=new THREE.PointLight(color,0,7,1.6);
    const g=new THREE.Group();g.add(body,halo,beam,light);g.visible=false;world.add(g);
    const a={voice,color,g,body,beam,light,from:new THREE.Vector3(),to:new THREE.Vector3(),moveAt:-1e12,active:-1e12,target:null};agents.set(voice,a);return a;
  }
  function dock(voice){const a=voice*1.1+2.4,r=extent*1.15+3;return new THREE.Vector3(Math.cos(a)*r,3.2,Math.sin(a)*r);}
  function sendDrone(voice,b,t){
    const a=drone(voice);const pos=currentDrone(a,t);
    a.from.copy(pos);a.to.set(b.x,(b.top||.6)+1.5,b.z);a.moveAt=t;a.active=t;a.target=b.id;a.g.visible=true;
    b.builder=voice;b.builderAt=t;
  }
  function currentDrone(a,t){
    if(a.moveAt<-1e11)return dock(a.voice);
    const p=ease((t-a.moveAt)/1600),v=a.from.clone().lerp(a.to,p);v.y+=Math.sin(p*Math.PI)*1.2;return v;
  }
  // ---- Effects ------------------------------------------------------------------------------------------
  function effect(e){effects.push(e);}
  function scan(b,start,color,duration=1500){
    const ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.08,6),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2;b.group.add(ring);
    effect({update:(now)=>{const p=(now-start)/duration;ring.position.y=PLINTH_H+clamp(p)*((b.top||.6)-PLINTH_H+.1);ring.material.opacity=Math.sin(Math.PI*clamp(p))*.85;return p<1;},dispose:()=>b.group.remove(ring)});
  }
  function groundRipple(x,z,t,color,radius,duration){
    const ring=new THREE.Mesh(new THREE.RingGeometry(.96,1,96),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;ring.position.set(x,.03,z);world.add(ring);
    effect({update:(now)=>{const p=(now-t)/duration;if(p<0)return true;ring.scale.setScalar(.5+easeOut(p)*radius);ring.material.opacity=(1-p)*.32;return p<1;},dispose:()=>world.remove(ring)});
  }
  function probe(from,to,t,color){
    const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(from.x,(from.top||.5),from.z),new THREE.Vector3((from.x+to.x)/2,Math.max(from.top||.5,to.top||.5)+1.4,(from.z+to.z)/2),new THREE.Vector3(to.x,(to.top||.5),to.z));
    const geo=new THREE.TubeGeometry(curve,32,.012,4,false);const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.0,blending:THREE.AdditiveBlending,depthWrite:false}));world.add(mesh);
    effect({update:(now)=>{const p=(now-t)/1300;if(p<0)return true;geo.setDrawRange(0,Math.floor(geo.index.count*clamp(p*1.6)));mesh.material.opacity=p<.6?.8:(1-p)/.4*.8;return p<1;},dispose:()=>{world.remove(mesh);geo.dispose();}});
  }
  // ---- Model updates from the recorded timeline -----------------------------------------------------------
  function reset(graph,t){
    t=t/speed;
    for(const b of buildings.values())world.remove(b.group);for(const l of links.values())if(l.mesh)world.remove(l.mesh);
    for(const d of districts.values())world.remove(d.pool);for(const a of agents.values())world.remove(a.g);for(const e of effects)e.dispose?.();
    buildings.clear();tiers.clear();links.clear();districts.clear();agents.clear();effects.length=0;
    conduitMesh.geometry.dispose();conduitMesh.geometry=new THREE.BufferGeometry();mergedAt=-1e12;
    applyGraph(graph,t,true);
  }
  function applyGraph(graph,t,immediate){
    for(const n of graph.nodes.filter(n=>n.type==='group'))district(n,t);
    for(const n of graph.nodes.filter(n=>n.type==='module')){const b=building(n,immediate?-1e12:t);if(immediate){b.born=-1e12;b.state=b.shownState=n.state||'committed';}}
    for(const n of graph.nodes.filter(n=>n.parent&&n.type!=='module'))tier(n,immediate?-1e12:t,false);
    for(const e of graph.edges.filter(e=>e.kind==='depends'))link(e,immediate?-1e12:t);
    for(const d of districts.values())districtCentre(d);
    for(const b of buildings.values())layoutStack(b,0,true);
  }
  // A recorded window: new structure waits for its own cue (symbol.created etc.) and otherwise appears by the window's end.
  function applyDelta(delta,start,end){
    const vStart=vsnap(start),vEnd=end/speed;
    if(delta.keyframe){
      const ids=new Set(delta.nodes.map(n=>n.id));
      for(const [id,s] of tiers)if(!ids.has(id)&&!s.removed)s.removed=start;
      for(const [id,b] of buildings)if(!ids.has(id)&&!b.removed)b.removed=start;
      delta={add:delta.nodes.filter(n=>!buildings.has(n.id)&&!tiers.has(n.id)||n.type==='module'||n.type==='group'),remove:[],addEdges:delta.edges,removeEdges:[]};
    }
    const span=Math.max(1,end-start);
    for(const n of delta.add.filter(n=>n.type==='group'))district(n,start);
    const mods=delta.add.filter(n=>n.type==='module');
    mods.forEach((n,i)=>{
      const existing=buildings.get(n.id);
      if(existing&&!existing.removed){existing.counts=n.counts||existing.counts;if(n.state&&n.state!==existing.state&&!existing.pending)existing.pending={state:n.state,at:vEnd};return;}
      if(existing&&existing.removed){existing.removed=null;existing.group.scale.set(1,1,1);existing.state=n.state;return;}
      const b=building(n,vsnap(start+span*.15*i/Math.max(1,mods.length)));b.pending=null;
    });
    for(const n of delta.add.filter(n=>n.parent&&n.type!=='module')){
      const s=tiers.get(n.id);
      if(s){if(s.removed&&n.id){s.removed=null;}s.slot=n.slot??s.slot;continue;}
      // Hidden until its symbol.created cue raises it; if the cue never comes (e.g. a seek), it rises at the window's end.
      const created=tier(n,vStart,true);if(created)created.dueAt=vEnd;
    }
    for(const id of delta.remove){const s=tiers.get(id);if(s&&!s.removed)s.removed=vStart;const b=buildings.get(id);if(b&&!b.removed)b.removed=vStart;}
    for(const e of delta.addEdges.filter(e=>e.kind==='depends')){const l=link(e,null);if(l&&l.born===null)l.dueAt=vEnd;}
    for(const e of delta.removeEdges.filter(e=>e.kind==='depends')){const l=links.get(`${e.a}>${e.b}`);if(l&&!l.removed)l.removed=vStart;}
    for(const d of districts.values())districtCentre(d);
  }
  function raise(s,at){if(s&&s.born===null)s.born=at;}
  function cue(c,t){
    const d=c.detail||{},b=d.fileId?buildings.get(d.fileId):null,voice=Number.isInteger(d.voice)?d.voice:null;
    const at=vsnap(t);
    if(b&&voice!==null&&d.attribution==='correlated')sendDrone(voice,b,at);
    switch(c.type){
      case 'symbol.created':{
        const s=tiers.get(d.symbolId);raise(s,at);
        if(b&&b.born>at-1)noteAttention(b,at,1.4);
        if(b&&(d.symbolType==='ui.component'||d.symbolType==='api.route'||d.symbolType==='class'))noteAttention(b,at,2);
        break;
      }
      case 'symbol.modified':{const s=tiers.get(d.symbolId);if(s)s.weld=at;else if(b)b.weldAt=at;break;}
      case 'symbol.removed':{const s=tiers.get(d.symbolId);if(s&&!s.removed)s.removed=at;break;}
      case 'dependency.added':{
        if(d.targetId){const l=links.get(`${d.fileId}>${d.targetId}`)||link({a:d.fileId,b:d.targetId,cross:d.cross},null);if(l&&l.born===null)l.born=at;
          if(d.cross){const a=buildings.get(d.fileId),e=buildings.get(d.targetId);if(a&&e){noteAttention({x:(a.x+e.x)/2,z:(a.z+e.z)/2},at,2.2);caption(at,'Two subsystems connect',2);}}}
        break;
      }
      case 'agent.tool.started':case 'agent.tool.completed':case 'agent.file.modified':{
        if(b&&voice!==null)sendDrone(voice,b,at);else if(voice!==null){const a=drone(voice);a.active=at;a.g.visible=true;}
        if(voice!==null){const a=drone(voice);a.lastTool=at;
          // "In parallel" only when another agent used a tool within the last few seconds: a claim the data supports.
          const concurrent=[...agents.values()].filter(x=>x.lastTool!==undefined&&at-x.lastTool<6000).length;
          if(concurrent>1&&(!a.parallelAt||at-a.parallelAt>20000)&&caption(at,`${concurrent} agents are building in parallel`,2))a.parallelAt=at;}
        break;
      }
      case 'agent.prompt.submitted':case 'agent.session.started':if(voice!==null){const a=drone(voice);a.active=at;a.g.visible=true;caption(at,'An agent joins the work',1);}break;
      case 'validation.test.passed':case 'validation.build.passed':{
        const covered=(d.fileIds||[]).map(id=>buildings.get(id)).filter(Boolean);
        const testers=[...buildings.values()].filter(x=>x.test&&!x.removed);
        covered.forEach((x,i)=>{const when=at+i*90;x.pending={state:'validated',at:when};scan(x,when,VALID_LIGHT);x.validAt=when;if(testers.length&&i<16)probe(testers[i%testers.length],x,at,new THREE.Color('#bff6ff'));});
        if(covered.length){const recovered=covered.some(x=>x.state==='stressed');caption(at,recovered?`Tests pass — ${covered.length} structure${covered.length>1?'s':''} repaired and validated`:`Tests pass — ${covered.length} structure${covered.length>1?'s':''} validated`,3);
          noteAttention(centroid(covered),at,recovered?3:1.8);}
        break;
      }
      case 'validation.test.failed':case 'validation.build.failed':{
        const covered=(d.fileIds||[]).map(id=>buildings.get(id)).filter(Boolean);
        covered.forEach((x,i)=>{x.pending={state:'stressed',at:at+i*60};x.stressAt=at+i*60;});
        if(covered.length){caption(at,`Tests fail — strain in ${covered.length} structure${covered.length>1?'s':''}`,3);noteAttention(centroid(covered),at,3);}
        break;
      }
      case 'repository.commit.observed':{
        const covered=(d.fileIds||[]).map(id=>buildings.get(id)).filter(Boolean);
        // The commit settles drafts as a wave from the centre outward.
        for(const x of covered){const when=at+Math.hypot(x.x,x.z)*90;x.pending={state:x.state==='draft'?'committed':x.state,at:when};}
        groundRipple(0,0,at,new THREE.Color('#ffe2a6'),extent*1.6+4,2600);caption(at,'Committed — the work is set in place',2);
        break;
      }
      case 'milestone.refactor.validated':{for(const id of d.fileIds||[]){const x=buildings.get(id);if(x)scan(x,at+200,'#ffe08a',1800);}caption(at,'Refactor validated — the structure consolidates',3);break;}
      case 'module.renamed':if(b)scan(b,at,'#cfe2ff',900);break;
      default:break;
    }
  }
  function centroid(list){const c={x:0,z:0};for(const b of list){c.x+=b.x/list.length;c.z+=b.z/list.length;}return c;}
  function noteAttention(p,t,weight){if(!attention||t-attention.t>5000||weight>=attention.w)attention={x:p.x,z:p.z,t,w:weight};}
  // ---- Frame ------------------------------------------------------------------------------------------------
  function setMood(m){if(m.section&&MOODS[m.section])mood=m.section;if(Number.isFinite(m.energy))energy=m.energy;if(m.tempo)stepMs=60000/(m.tempo*4);}
  const moodKey=new THREE.Color('#dce8ff');
  // Live playback only: sustained slow frames lower the pixel ratio, then drop shadows. Films keep full quality.
  let frameEma=1/60,slowFor=0,quality=0,pixelRatio=1,size=[16,9];
  const timing={update:0,draw:0};let fine=true;
  function adapt(dt){
    if(film||dt<=0)return;
    frameEma+=(dt-frameEma)*.05;slowFor=frameEma>1/30?slowFor+dt:0;
    if(slowFor>3&&quality<2){quality++;slowFor=0;frameEma=1/60;
      if(quality===1){renderer.setPixelRatio(Math.max(.75,pixelRatio*.66));renderer.setSize(size[0],size[1],false);}
      if(quality===2){renderer.shadowMap.enabled=false;scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});}}
  }
  // Closest camera distance at which the site fits the frame, and how far beyond the view target to aim (s) so the
  // site sits balanced between the top margin and the caption area (in perspective the near edge looms, so aiming
  // at the centre would leave the top of the frame empty). The site is its outline: the outermost building in each
  // of 16 directions (ground and roof) and the tallest tower. A minimum distance keeps a first building from being a
  // close-up.
  const probeCam=new THREE.PerspectiveCamera(),probePt=new THREE.Vector3(),fitMemo={key:'',d:0,s:0};
  const TOP=.8,BOTTOM=-.72,SIDE=.84,SECTORS=16,MIN_SITE=3.2,MIN_DISTANCE=10;
  const q=x=>Math.round(x*4)/4;
  function siteOutline(t,az){
    const sectors=new Array(SECTORS).fill(null),tx=q(view.target.x),tz=q(view.target.z);let tallest=null;
    for(const b of buildings.values())if(!b.removed&&b.born<=t){
      const dx=b.x-tx,dz=b.z-tz,r=Math.hypot(dx,dz),h=b.top||.5;
      const i=Math.floor((Math.atan2(dz,dx)+Math.PI)/(2*Math.PI)*SECTORS)%SECTORS;
      if(!sectors[i]||r>sectors[i].r)sectors[i]={dx,dz,r,h};
      if(!tallest||h>tallest.h)tallest={dx,dz,r,h};
    }
    // Points relative to the view target, pushed out by a footprint, rotated so the camera looks along -x.
    const pts=[],c=Math.cos(az),s=Math.sin(az);
    const add=(dx,dz,y)=>pts.push([q(dx*c+dz*s),q(y),q(-dx*s+dz*c)]);
    for(const p of sectors)if(p){const k=p.r>0?(p.r+.9)/p.r:1;add(p.dx*k,p.dz*k,0);add(p.dx,p.dz,p.h);}
    if(tallest)add(tallest.dx,tallest.dz,tallest.h);
    // Bridges between districts arc high, and working drones hover above their building: both stay in frame.
    for(const l of links.values())if(l.cross&&l.curve&&l.born!==null&&l.born<=t&&l.removed===null){const m=l.curve.getPoint(.5);add(m.x-tx,m.z-tz,m.y);}
    for(const a of agents.values())if(a.moveAt>-1e11&&t-a.active<14000)add(a.to.x-tx,a.to.z-tz,a.to.y+.4);
    if(!pts.length)add(0,0,0);
    return pts;
  }
  function fitView(pts,el,ty){
    // The outline is quantised, so the search (a few ms) reruns only when the site or the orbit has changed noticeably.
    ty=q(ty);const key=`${el.toFixed(3)}|${ty}|${camera.aspect.toFixed(3)}|${pts.join(';')}`;if(key===fitMemo.key)return fitMemo;
    probeCam.fov=camera.fov;probeCam.aspect=camera.aspect;probeCam.updateProjectionMatrix();
    // A portrait frame (a vertical clip): the site fills the width and sits a little above the middle, inside the area
    // Reels, Shorts and TikTok leave clear (under the top 19 %, above the bottom 25 % of the frame).
    const portrait=camera.aspect<1,top=portrait?.62:TOP,bottom=portrait?-.5:BOTTOM,side=portrait?.9:SIDE;
    const R=Math.max(MIN_SITE,...pts.map(p=>Math.hypot(p[0],p[2])));
    const extent=(d,s)=>{
      probeCam.position.set(Math.cos(el)*d-s,ty+Math.sin(el)*d,0);probeCam.lookAt(-s,ty,0);probeCam.updateMatrixWorld();
      let x=0,y0=Infinity,y1=-Infinity;
      for(const p of pts){probePt.set(p[0],p[1],p[2]).project(probeCam);
        if(probePt.z>1)return null;x=Math.max(x,Math.abs(probePt.x));y0=Math.min(y0,probePt.y);y1=Math.max(y1,probePt.y);}
      return {x,y0,y1};
    };
    // Aiming further away moves the site down the frame; search for the aim that centres it between the margins.
    const aimFor=d=>{let a=-R,b=R,s=0,e=null;for(let j=0;j<12;j++){s=(a+b)/2;e=extent(d,s);if(!e){a=s;continue;}if((e.y0+e.y1)/2>(top+bottom)/2)a=s;else b=s;}return {s,e};};
    let lo=Math.max(MIN_DISTANCE,R*.5)*.999,hi=Math.max(MIN_DISTANCE,R*20),best=null;
    for(let k=0;k<16;k++){
      const d=(lo+hi)/2,{s,e}=aimFor(d);
      if(e&&e.x<=side&&e.y1-e.y0<=top-bottom){hi=d;best={d,s};}else lo=d;
    }
    if(!best)best={d:hi,s:aimFor(hi).s};
    return Object.assign(fitMemo,{key},best);
  }
  function render(t,dt,{phase=0}={}){
    const began=performance.now();t=t/speed;adapt(Math.max(0,dt));dt=Math.min(.1,Math.max(0,dt));
    // Mood follows the musical section, slowly.
    const m=MOODS[mood]||MOODS.home;moodKey.lerp(new THREE.Color(m.key),Math.min(1,dt*.8));key.color.copy(moodKey);
    key.intensity+=(1.15*m.k-key.intensity)*Math.min(1,dt*.8);
    const downbeat=Math.exp(-((phase%1)*16)*.9);
    // Districts appear with their first building.
    for(const d of districts.values()){
      const alive=[...buildings.values()].some(b=>b.gid===d.id&&!b.removed&&b.born<=t);
      const target=alive?.16+.04*energy:0;d.pool.material.opacity+=(target-d.pool.material.opacity)*Math.min(1,dt*1.2);d.pool.material.color.copy(d.color);
      if(alive&&!d.rippled){d.rippled=true;if(d.born>-1e11&&!d.core){groundRipple(d.cx,d.cz,Math.max(t,d.born),d.color,3.2,1800);noteAttention({x:d.cx,z:d.cz},t,2.5);}}
      // A district is named once it has storeys, so its character comes from what was actually built there.
      if(alive&&!d.announced&&d.born>-1e11&&!d.core){
        const built=[...tiers.values()].some(x=>x.born!==null&&x.born<=t&&buildings.get(x.parent)?.gid===d.id);
        if(built||t-d.born>8000){d.announced=true;const role=Object.keys(d.counts||{}).length?d.role:null;caption(t,role?`A new district takes shape — ${role}`:'A new district takes shape',2);}
      }
    }
    extent=4;for(const b of buildings.values())if(!b.removed&&b.born<=t)extent=Math.max(extent,Math.hypot(b.x,b.z)+1.5);
    // Level of detail: when a building is only a few pixels wide, storey corner lines and plot outlines are noise,
    // not detail, so they are left out (with hysteresis, so they do not flicker at the threshold).
    const unitPx=size[1]/2/(Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*view.distance);
    if(fine&&unitPx<34)fine=false;else if(!fine&&unitPx>40)fine=true;
    for(const b of buildings.values()){
      const age=t-b.born,p=clamp(age/900);
      const visible=age>=0;b.group.visible=visible;if(!visible)continue;
      if(b.pending&&t>=b.pending.at){b.state=b.pending.state;b.pending=null;b.stateAt=t;}
      // Birth: survey outline, ground tile, plinth.
      fade(b.survey,age<1800?Math.sin(Math.PI*clamp(age/1800))*.9:0);b.survey.material.color.set(b.builder!==null&&t-b.builderAt<6000?AGENT_COLORS[b.builder%8]:SCAFFOLD);
      b.tile.material.opacity=easeOut(p)*.95;b.tileLine.material.opacity=easeOut(p)*.35;b.tileLine.visible=fine;
      b.plinth.scale.y=Math.max(.001,ease(clamp((age-250)/600)));
      const stressed=b.state==='stressed',validated=b.state==='validated';
      b.trim.material.opacity=(validated?.55:stressed?.65:.28)*easeOut(p)*(1+.25*downbeat*energy);b.trim.material.color.set(stressed?STRESS:b.color);
      fade(b.glow,b.glow.material.opacity+((stressed?.8:0)-b.glow.material.opacity)*Math.min(1,dt*2.5));b.glow.scale.setScalar(stressed?1.4:1);
      b.outline.material.color.copy(stressed?new THREE.Color(STRESS):b.state==='draft'?new THREE.Color(SCAFFOLD):b.color);
      b.outline.material.opacity=easeOut(clamp((age-600)/900))*(b.state==='draft'?.5:validated?.75:stressed?.85:.55);
      if(b.removed!==null){const q=clamp((t-b.removed)/1400);b.group.scale.set(1,1-ease(q)*.98,1);b.tile.material.opacity*=1-q;if(q>=1){world.remove(b.group);buildings.delete(b.id);for(const s of b.storeys)tiers.delete(s.id);}}
    }
    for(const s of tiers.values()){
      if(s.born===null&&s.dueAt!==undefined&&t>=s.dueAt)s.born=s.dueAt;
      const b=buildings.get(s.parent);if(!b)continue;
      if(s.born===null||t<s.born){if(s.holder)s.holder.visible=false;if(s.spire)s.spire.visible=false;continue;}
      if(s.mesh&&!s.shadowSet){s.shadowSet=true;}
      const age=t-s.born,ageR=s.removed!==null?t-s.removed:-1;
      const agentTint=b.builder!==null&&t-b.builderAt<8000?new THREE.Color(AGENT_COLORS[b.builder%8]):null;
      if(s.kind==='api.route'){
        s.spire.visible=true;const p=ease(clamp(age/900));s.mast.scale.set(1,Math.max(.001,p),1);s.mat.opacity=Math.min(1,p*1.4);
        s.beacon.material.opacity=p*(.55+.45*downbeat*energy);
        if(ageR>=0){const q=clamp(ageR/900);s.mast.scale.y*=1-q;s.beacon.material.opacity*=1-q;if(q>=1){b.group.remove(s.spire);dropTier(s);}}
        continue;
      }
      s.holder.visible=true;if(s.corners)s.corners.visible=fine;
      // Construction: the frame appears first, then the panels; a weld flashes along the edges on modification.
      const frame=clamp(age/450),panel=clamp((age-300)/700),weld=Math.exp(-Math.max(0,t-s.weld)/500)*(t>=s.weld?1:0);
      const st=b.state,mats=s.mats;
      const panelTarget=st==='draft'?.58:1;
      if(mats.body){mats.body.opacity=panel*panelTarget*(ageR>=0?1-clamp(ageR/900):1);mats.body.transparent=mats.body.opacity<.999;mats.body.depthWrite=mats.body.opacity>.5;
        // Strain darkens the facade toward red; repair returns it.
        const strain=st==='stressed'?1:0;mats.body.emissiveIntensity+=((strain?.45:(mats.look==='glass'?.28:.05))-mats.body.emissiveIntensity)*Math.min(1,dt*3);
        mats.body.emissive.lerp(strain?new THREE.Color(STRESS):b.color,Math.min(1,dt*3));}
      const edgeColor=st==='stressed'?STRESS:st==='draft'?(agentTint||new THREE.Color(SCAFFOLD)):b.color.clone().lerp(new THREE.Color('#ffffff'),st==='validated'?.15:0);
      mats.edge.color.copy(edgeColor).lerp(new THREE.Color('#ffffff'),weld*.7);
      // Storey edges are scaffolding: visible while drafted (or strained, or for open frames); solid work shows only its silhouette.
      const building=age<1400?1-clamp((age-700)/700):0;
      fade(s.edges,Math.min(1,frame*Math.max(building,st==='draft'?.9:st==='stressed'?.75:mats.look==='frame'?.85:0)+weld*.8)*(ageR>=0?1-clamp(ageR/900):1));
      if(mats.band){
        const lit=st==='validated'?1:st==='committed'?.45:st==='stressed'?1:.12;
        mats.band.color.set(st==='stressed'?STRESS:VALID_LIGHT).lerp(b.color,st==='stressed'?0:.5);
        // Windows light from the bottom up as a validation scan passes.
        const scanP=clamp((t-b.validAt)/1500),reached=s.y!==null&&b.top?(s.y/(b.top||1))<=scanP:true;
        fade(s.band,mats.band.opacity+(((reached?lit:0)*panel*(1+.18*downbeat*energy))-mats.band.opacity)*Math.min(1,dt*4));
      }
      if(ageR>=0){const q=clamp(ageR/900);s.holder.scale.set(1-q*.6,1,1-q*.6);if(q>=1){b.group.remove(s.holder);dropTier(s);}}
      else s.holder.scale.set(1,ease(clamp(age/450))*.999+.001,1);
    }
    for(const b of buildings.values())if(b.group.visible)layoutStack(b,dt,false);
    // A new conduit is bright while it is laid, then settles; the more conduits a site has, the quieter they rest,
    // so hundreds of internal dependencies read as texture, not a tangle. Bridges between districts stay bright.
    let conduits=0;for(const l of links.values())if(!l.cross&&l.born!==null&&t>=l.born)conduits++;
    const rest=Math.min(.32,3/Math.sqrt(conduits+1));
    let merge=false,mergeNow=false;
    for(const l of links.values()){
      if(l.born===null&&l.dueAt!==undefined&&t>=l.dueAt)l.born=l.dueAt;
      if(l.born===null||t<l.born){if(l.mesh)l.mesh.visible=false;continue;}
      if(l.merged){if(l.removed===null){l.mesh.visible=false;continue;}l.merged=false;mergeNow=true;}
      shapeLink(l);if(!l.mesh)continue;
      const p=clamp((t-l.born)/(l.cross?1800:900));l.mesh.geometry.setDrawRange(0,Math.floor(l.indexCount*easeOut(p)/3)*3);
      const lit=l.cross?.8:rest+(.55-rest)*(1-clamp((t-l.born-900)/6000));
      if(l.removed!==null){const q=clamp((t-l.removed)/900);fade(l.mesh,lit*(1-q));if(q>=1){world.remove(l.mesh);links.delete(l.key);}}
      else{fade(l.mesh,lit);if(!l.cross&&t-l.born>SETTLE)merge=true;}
    }
    // Merging is batched (at most every 2 s) except when a merged conduit is being removed.
    if(mergeNow||merge&&t-mergedAt>2000)mergeConduits(t);
    fade(conduitMesh,conduitMesh.geometry.index?rest:0);
    for(const a of agents.values()){
      const idle=t-a.active;const pos=idle>14000?dock(a.voice):currentDrone(a,t);
      if(idle>14000){a.from.copy(a.g.position);a.to.copy(dock(a.voice));}
      a.g.position.lerp(pos,Math.min(1,dt*3));a.g.visible=idle<60000;
      const working=a.target&&idle<5000&&t-a.moveAt>1200;const b=buildings.get(a.target);
      const beamH=b?Math.max(.4,a.g.position.y-(b.top||.6)):1;a.beam.scale.set(1,beamH,1);
      a.beam.material.opacity+=((working?.38:0)-a.beam.material.opacity)*Math.min(1,dt*4);
      a.light.intensity+=((working?3.5:idle<14000?.8:0)-a.light.intensity)*Math.min(1,dt*3);
    }
    for(let i=effects.length-1;i>=0;i--)if(!effects[i].update(t)){effects[i].dispose?.();effects.splice(i,1);}
    // Camera: a slow architectural orbit that eases toward real construction and back, never jumping.
    // Frame the bounding circle of what has been built; lean toward real construction without losing the whole.
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,maxH=.5;
    for(const b of buildings.values())if(!b.removed&&b.born<=t){minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);minZ=Math.min(minZ,b.z);maxZ=Math.max(maxZ,b.z);maxH=Math.max(maxH,b.top||.5);}
    if(minX===Infinity){minX=maxX=minZ=maxZ=0;}
    const centre=new THREE.Vector3((minX+maxX)/2,0,(minZ+maxZ)/2);
    let reach=0;for(const b of buildings.values())if(!b.removed&&b.born<=t)reach=Math.max(reach,Math.hypot(b.x-centre.x,b.z-centre.z));
    const radius=Math.max(MIN_SITE,reach+1.3);
    const att=attention&&t-attention.t<9000&&t>=attention.t?attention:null;
    const goal=centre.clone().lerp(new THREE.Vector3(att?att.x:centre.x,0,att?att.z:centre.z),att?Math.min(.3,2.2/radius):0);goal.y=Math.min(1.2,maxH*.3);
    if(!view.ready){view.target.copy(goal);view.ready=true;}
    view.target.lerp(goal,Math.min(1,dt*.6));
    const el=.42+Math.min(.14,radius/100);
    const az=-0.9+t/520000*Math.PI*2;
    // The camera leans toward attention, so the site is fitted around the view target; the orbit angle is quantised
    // (3°) so the fit is recomputed only every few seconds while the camera turns.
    const fit=fitView(siteOutline(t,Math.round(az/.05236)*.05236),el,view.target.y);
    if(!view.sized){view.distance=fit.d;view.shift=fit.s;view.sized=true;}
    view.distance+=(fit.d-view.distance)*Math.min(1,dt*.5);view.shift+=(fit.s-view.shift)*Math.min(1,dt*.5);
    const aim=new THREE.Vector3(view.target.x-Math.cos(az)*view.shift,view.target.y,view.target.z-Math.sin(az)*view.shift);
    camera.position.set(aim.x+Math.cos(az)*Math.cos(el)*view.distance,aim.y+Math.sin(el)*view.distance,aim.z+Math.sin(az)*Math.cos(el)*view.distance);
    camera.lookAt(aim);
    const span=radius+3;key.target.position.copy(view.target);key.position.set(view.target.x-14,26,view.target.z+10);
    if(Math.abs((key.shadow.camera.right||0)-span)>.5){Object.assign(key.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:1,far:90});key.shadow.camera.updateProjectionMatrix();}
    scene.fog.density=.9/(view.distance*4+20);
    const drawn=performance.now();renderer.render(scene,camera);
    timing.update+=(drawn-began-timing.update)*.1;timing.draw+=(performance.now()-drawn-timing.draw)*.1;
  }
  function resize(w,h,dpr=1){pixelRatio=dpr;size=[w,h];renderer.setPixelRatio(quality?Math.max(.75,dpr*.66):dpr);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  function stats(){return {districts:districts.size,buildings:buildings.size,tiers:tiers.size,links:links.size,bridges:[...links.values()].filter(l=>l.cross).length,agents:agents.size,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,quality,detail:fine?'fine':'coarse',
    updateMs:+timing.update.toFixed(2),drawMs:+timing.draw.toFixed(2)};}
  function dispose(){renderer.dispose();}
  function setSpeed(k){if(k>0)speed=k;}
  return {reset,applyDelta,cue,setMood,setSpeed,render,resize,stats,dispose};
}

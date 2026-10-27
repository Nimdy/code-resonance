'use strict';
// The artist layers' runtime (public/worlds/layers.js) with real three.js objects (no GPU is needed to build, diff and
// dispose them), the procedural forms (layers-forms.js) and the artist canvas's anchors (canvas.js). Rendering itself
// is qualified in a browser; the shaders are compiled there.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/composition.js');
const T0=1750000000000;
const load=async()=>{const [THREE,L,F]=await Promise.all([import('../public/vendor/three.module.min.js'),import('../public/worlds/layers.js'),import('../public/worlds/layers-forms.js')]);return {THREE,L,F};};
const ANCHORS={center:{x:0,y:2,z:0},extent:16,floor:0,subsystems:[{id:'a',pos:{x:4,y:2,z:1},size:3},{id:'b',pos:{x:-5,y:1.5,z:3},size:2},{id:'c',pos:{x:1,y:1,z:-6},size:1.5}],
  active:{pos:{x:4,y:2,z:1}},nodes:Array.from({length:30},(_,k)=>({pos:{x:Math.cos(k)*8,y:1,z:Math.sin(k)*8}})),boundary:{radius:18,y:0}};
const music=T=>{const ph=((T/2500)%1+1)%1;return {pulse:Math.pow(1-(ph*4)%1,3),barPulse:Math.pow(1-ph,2),barInPhrase:Math.floor(T/2500)%4,phase:ph,onset:0,transition:0,energy:.6,tension:.4,melody:.7,rhythm:.3,release:0,dynamics:.6,density:.5};};
function rig(THREE,L,{commands=[]}={}){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,16/9,.1,4000);camera.position.set(30,12,30);camera.lookAt(0,0,0);
  const director={commands,activityAt:()=>.3};
  const layers=L.createLayers({THREE,scene,camera,composition:C,director:()=>director,musicAt:music,seed:42,size:()=>[1920,1080]});
  const frame=(k,fps=60)=>{const tview=k/fps,t=T0+tview*1000;layers.update({t,tview,dt:1/fps,music:music(t),activity:.3,agents:[]});};
  return {scene,camera,layers,frame};
}
// Counts dispose() calls on every geometry and material (the GPU resources a layer holds).
function counting(THREE){const n={geometries:0,materials:0};const g=THREE.BufferGeometry.prototype.dispose,m=THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose=function(){n.geometries++;return g.call(this);};THREE.Material.prototype.dispose=function(){n.materials++;return m.call(this);};
  return {n,restore(){THREE.BufferGeometry.prototype.dispose=g;THREE.Material.prototype.dispose=m;}};}
test('Forms are seeded and bounded: the same seed draws the same form, every form fits its unit space',async()=>{
  const {F}=await load();
  for(const form of F.FORMS){const a=F.fractal({form,depth:6,branching:3,spread:.6,seed:11}),b=F.fractal({form,depth:6,branching:3,spread:.6,seed:11}),c=F.fractal({form,depth:6,branching:3,spread:.6,seed:12});
    assert.deepEqual(a.segments,b.segments,form);assert.notDeepEqual(a.segments,c.segments,form);
    for(const v of a.segments)assert(Number.isFinite(v));for(let i=0;i<a.count;i++){const t=a.segments[i*F.SEG+7];assert(t>=0&&t<=1+1e-6);}
    assert(a.count<=F.MAX_SEGMENTS&&a.tipCount>0,form);}
  assert(F.fractal({form:'tree',depth:7,branching:4,seed:1,limit:500}).count<=500,'a segment limit holds');
  for(const shape of F.SHAPES){const s=F.structure({shape,count:6,detail:5,thickness:.6,seed:4});assert(s.lineCount>0,shape);
    for(let i=0;i<s.lines.length;i+=F.LINE)for(let k=0;k<6;k++)assert(Math.abs(s.lines[i+k])<=1.25,`${shape} out of bounds`);}
  const out=new Float32Array(64*3);for(const field of F.FIELDS){const r=F.ribbonSeeds(3,6,field);for(const x of r){F.streamline(out,64,x,field,{t:30,length:1,turbulence:.6});for(const v of out)assert(Number.isFinite(v)&&Math.abs(v)<4,field);}}
});
test('set() diffs the stack by layer id: an edit rebuilds only what changed, a removal releases its GPU resources',async()=>{
  const {THREE,L}=await load();const {scene,layers,frame}=rig(THREE,L),count=counting(THREE);
  try{
    const c=structuredClone(C.STARTERS.find(s=>s.id==='starter-bioluminescent-dream'));
    layers.set(c,{anchors:ANCHORS});for(let k=0;k<4;k++)frame(k);
    const s0=layers.stats();assert.equal(s0.layers,4);assert.equal(s0.created,4);assert.equal(s0.rebuilt,0);assert.deepEqual(layers.ids(),c.layers.map(l=>l.id));
    // Appearance and motion: uniforms only, nothing is rebuilt or released.
    const before={...count.n};c.layers[1].params.glow=2.4;c.layers[1].params.color='#ff00aa';layers.set(c);frame(5);
    assert.equal(layers.stats().rebuilt,0);assert.deepEqual(count.n,before);
    // Form: that layer alone is rebuilt.
    c.layers[1].params.depth=3;layers.set(c);frame(6);assert.equal(layers.stats().rebuilt,1);
    // Removing a layer disposes its geometries and materials at once; the others keep theirs.
    const g0=count.n.geometries,m0=count.n.materials;c.layers.splice(2,1);layers.set(c);
    assert.equal(layers.stats().disposed,1);assert(count.n.geometries>g0&&count.n.materials>m0);assert.deepEqual(layers.ids(),['haze','filaments','lanterns']);
    // A different type under the same id is a new layer.
    c.layers[2]=C.layer('ribbons',{id:'lanterns'});layers.set(c);frame(7);assert.equal(layers.stats().disposed,2);assert.equal(layers.stats().created,5);
    layers.set(null);assert.equal(layers.stats().disposed,5);assert.equal(scene.children[0].children.length,0,'no layer left in the scene');
    layers.dispose();assert.equal(scene.children.length,0,'the runtime leaves the scene as it found it');
  }finally{count.restore();}
});
test('Depth classes and blends are real draw order and depth state; solo and enable change what is drawn',async()=>{
  const {THREE,L}=await load();const {layers,frame}=rig(THREE,L);
  const c=C.normalize({base:'canvas',layers:[C.layer('atmosphere',{id:'sky',depth:'behind',blend:'screen'}),C.layer('light',{id:'glow',depth:'world',blend:'add'}),C.layer('structure',{id:'rings',depth:'front',blend:'normal'})]});
  layers.set(c,{anchors:ANCHORS});frame(0);
  const root=layers.root,objs=id=>root.children.find(g=>g.name===`layer:${id}`).children;
  for(const o of objs('sky')){assert(o.renderOrder<-500);assert.equal(o.material.depthTest,true);assert.equal(o.material.uniforms.uFar.value,1);assert.equal(o.material.blendDst,THREE.OneMinusSrcColorFactor);}
  for(const o of objs('glow')){assert(Math.abs(o.renderOrder)<500);assert.equal(o.material.depthTest,true);assert.equal(o.material.uniforms.uFar.value,0);assert.equal(o.material.blendDst,THREE.OneFactor);}
  for(const o of objs('rings')){assert(o.renderOrder>500);assert.equal(o.material.depthTest,false);assert.equal(o.material.blendDst,THREE.OneMinusSrcAlphaFactor);}
  const visible=()=>root.children.filter(g=>g.visible).map(g=>g.name.slice(6));
  assert.deepEqual(visible(),['sky','glow','rings']);
  c.layers[1].solo=true;layers.set(c);frame(1);assert.deepEqual(visible(),['glow']);
  c.layers[1].solo=false;c.layers[0].enabled=false;layers.set(c);frame(2);assert.deepEqual(visible(),['glow','rings']);
  layers.dispose();
});
test('Global mappings bend the camera and the grade within bounds, and leave both untouched otherwise',async()=>{
  const {THREE,L}=await load();const {layers,frame}=rig(THREE,L);
  layers.set(C.normalize({base:'canvas',layers:[]}),{anchors:ANCHORS});frame(0);
  const goal={target:new THREE.Vector3(),distance:40,azimuth:1,elevation:.3},g={bloom:1.2,exposure:1};
  assert.equal(layers.grade(g),g,'nothing mapped: the very same grade');layers.camera(goal,{tview:3});assert.deepEqual([goal.distance,goal.azimuth,goal.elevation],[40,1,.3]);
  layers.set(C.normalize({base:'canvas',layers:[],mappings:[{signal:'music.energy',target:'camera.zoom',amount:.3,curve:'linear'},{signal:'music.energy',target:'finish.bloom',amount:.5,curve:'linear'}]}));frame(1);
  const z={...goal};layers.camera(z,{tview:3});assert(z.distance<40&&z.distance>=40*.7,`zoom stays bounded: ${z.distance}`);
  const b=layers.grade(g);assert(b.bloom>1.2&&b.bloom<=1.2*1.5+1e-9);assert.equal(b.exposure,1);
  layers.dispose();
});
test('Two runtimes fed the same frames draw the same layers (films are rendered frame by frame)',async()=>{
  const {THREE,L}=await load();
  const commands=[{intent:'milestone.achieved',at:T0+1500,tier:3,magnitude:.9,evidence:'verified',count:1}];
  const run=()=>{const r=rig(THREE,L,{commands});r.layers.set(C.STARTERS.find(s=>s.id==='starter-abstract-resonance'),{anchors:ANCHORS});for(let k=0;k<150;k++)r.frame(k,30);
    const out=[];r.scene.traverse(o=>{if(o.material?.uniforms)for(const k of ['uClock','uGrowth','uIntensity','uOpacity','uBright','uWeight','uAlpha'])if(o.material.uniforms[k])out.push(+o.material.uniforms[k].value.toFixed(9));
      if(o.geometry?.attributes?.position&&o.isPoints)out.push(Array.from(o.geometry.attributes.position.array.slice(0,24)).join());});r.layers.dispose();return out;};
  assert.deepEqual(run(),run());
});
test('A layer that fails is set aside with its reason; the others keep drawing; it is retried only once it is changed',async()=>{
  const {THREE,L}=await load();
  // A composition model whose mappings throw for one layer: the failure happens while drawing that layer.
  // (The starter's one particle population is the layer that fails: its spec is the only one with a behaviour.)
  const broken=new Set(['particles']),model={...C,applyMappings:(params,mappings,signal,spec)=>{if(broken.has('particles')&&spec.some(p=>p.key==='behavior'))throw new Error('this layer cannot be drawn');return C.applyMappings(params,mappings,signal,spec);}};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,16/9,.1,4000);camera.position.set(30,12,30);camera.lookAt(0,0,0);
  const layers=L.createLayers({THREE,scene,camera,composition:model,director:()=>({commands:[],activityAt:()=>.3}),musicAt:music,seed:42,size:()=>[1920,1080]});
  const frame=k=>{const tview=k/60,t=T0+tview*1000;layers.update({t,tview,dt:1/60,music:music(t),activity:.3,agents:[]});};
  const c=structuredClone(C.STARTERS.find(s=>s.id==='starter-bioluminescent-dream'));
  layers.set(c,{anchors:ANCHORS});for(let k=0;k<6;k++)assert.doesNotThrow(()=>frame(k));
  let s=layers.stats();assert.deepEqual(s.failed.map(f=>f.id),['spores']);assert.match(s.failed[0].message,/cannot be drawn/);assert.equal(s.failed[0].name,'Drifting spores');
  const group=scene.getObjectByName('layer:spores');assert.equal(group.visible,false);assert.equal(group.children.length,0);
  assert(scene.getObjectByName('layer:filaments').children.length>0,'the other layers still draw');
  // The same definition is not rebuilt every frame (no loop of failures)…
  const created=s.created;layers.set(structuredClone(c),{anchors:ANCHORS});frame(7);assert.equal(layers.stats().created,created);assert.equal(layers.stats().failed.length,1);
  // …a change to the layer tries it again, and a working layer clears the failure.
  broken.clear();const d=structuredClone(c);d.layers.find(l=>l.id==='spores').params.size=1.2;layers.set(d,{anchors:ANCHORS});frame(8);frame(9);
  s=layers.stats();assert.deepEqual(s.failed,[]);assert(scene.getObjectByName('layer:spores').children.length>0);
  layers.dispose();
});

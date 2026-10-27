'use strict';
// The artist canvas (public/worlds/canvas.js): a quiet world that still receives the project's structure, its canonical
// events and its observed agents, and gives a composition's layers the project's own subsystems to anchor to.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/composition.js');
const T0=1750000000000;
async function setup(){
  const [THREE,{createFamily},{createModel},{createDirector},{createLayers}]=await Promise.all([import('../public/vendor/three.module.min.js'),import('../public/worlds/canvas.js'),
    import('../public/worlds/model.js'),import('../public/worlds/director.js'),import('../public/worlds/layers.js')]);
  const model=createModel(),nodes=[];
  [['g0',0,0],['g1',6,-2],['g2',-5,4]].forEach(([g,q,r],k)=>{nodes.push({id:g,type:'group',order:k,q,r,counts:{function:4}});
    for(let m=0;m<2+k*2;m++)nodes.push({id:`${g}/m${m}`,type:'module',group:g,dir:'d',q:q+(m%2),r:r+Math.floor(m/2),state:'committed',counts:{function:2}});});
  model.applyDelta({keyframe:true,nodes,edges:[]},T0,T0+10000);
  const camera=new THREE.PerspectiveCamera(38,16/9,.1,4000),director=createDirector({recipe:{genome:{}}});
  const make=composition=>{const scene=new THREE.Scene();return {scene,world:createFamily({THREE,scene,camera,model,recipe:{projectSeed:9,variant:0,genome:{},composition},director,film:true,speed:()=>1,name:id=>id})};};
  return {THREE,make,model,camera,director,createLayers};
}
const info={t:T0+20000,tview:20,dt:1/30,agents:[],activity:0,mood:{},overrides:{}};
test('The artist canvas lays out the project\'s own subsystems (the persisted site plan) as anchors',async()=>{
  const {make}=await setup(),{world}=make(C.normalize(C.STARTERS[0]));world.update(info);
  const A=world.compose.anchors(info);
  assert.equal(A.subsystems.length,3);assert.deepEqual(A.subsystems.map(s=>s.id).sort(),['g0','g1','g2']);
  assert(A.subsystems.find(s=>s.id==='g2').size>A.subsystems.find(s=>s.id==='g0').size,'sized by their modules');
  assert.equal(A.nodes.length,2+4+6);assert(A.extent>=8);for(const s of A.subsystems)assert(Math.hypot(s.pos.x,s.pos.z)<A.extent);
  assert.equal(A.floor,0);for(const s of A.subsystems)assert.equal(s.base.y,0,'rooted on the floor');
  // The same project always gets the same arrangement.
  const {world:again}=make(C.normalize(C.STARTERS[0]));again.update(info);
  assert.deepEqual(again.compose.anchors(info).subsystems.map(s=>s.pos.toArray()),A.subsystems.map(s=>s.pos.toArray()));
  // Canonical events ripple from where they happened; the camera keeps the canvas in view.
  world.effect({intent:'subsystem.created',at:T0+19000,tier:2,scale:1,subject:{groupId:'g1'}},info);const goal=world.cameraGoal(info);
  assert(goal.distance>A.extent&&Number.isFinite(goal.azimuth));
  world.dispose();again.dispose();
});
test('A composition on the canvas anchors its layers to the subsystems, and canvas settings apply in place',async()=>{
  const {THREE,make,camera,director,createLayers}=await setup();
  const comp=C.normalize({base:'canvas',canvas:{background:'#100820',floor:.8},layers:[C.layer('light',{id:'l',anchor:{kind:'subsystems'},params:{count:3}}),C.layer('fractal',{id:'f',anchor:{kind:'subsystems'},params:{instances:3,depth:3}})]});
  const {scene,world}=make(comp);world.update(info);
  const layers=createLayers({THREE,scene,camera,composition:C,director:()=>director,seed:9});layers.set(comp,{anchors:world.compose.anchors});layers.update(info);
  const A=world.compose.anchors(info),light=layers.root.children.find(g=>g.name==='layer:l').children[0];
  const sites=light.material.uniforms.uSite.value.slice(0,3).map(v=>[+v.x.toFixed(4),+v.z.toFixed(4)]).sort();
  assert.deepEqual(sites,A.subsystems.map(s=>[+s.pos.x.toFixed(4),+s.pos.z.toFixed(4)]).sort(),'one light at each subsystem');
  const fractal=layers.root.children.find(g=>g.name==='layer:f').children[0];
  for(const v of fractal.material.uniforms.uSite.value.slice(0,3))assert.equal(v.y,0,'fractals grow from the floor');
  // A canvas setting (colour, floor) changes in place: no new world is needed.
  world.onComposition({...comp,canvas:{...comp.canvas,floor:.1}});assert(world.stats().subsystems===3);
  layers.dispose();world.dispose();
});

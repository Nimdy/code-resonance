'use strict';
// Shared fixture for Aurora's digital-life tests (tests/life-aurora*.test.js): a sky of subsystems with files, symbols
// and dependencies, the world's layout and life grammar, an ecosystem on its habitat, a recorded performance for the
// driver, and the world headless (as the host drives it). Not a test file itself.
const crypto=require('node:crypto');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const score=require('../public/score.js');
const load=()=>Promise.all([import('../public/worlds/model.js'),import('../public/worlds/aurora-layout.js'),import('../public/worlds/life/aurora.js'),
  import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
const loadWorld=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000,T1=T0+10000;
const ID='aurora';
// A project for the recipe (the generator's traits), and an Aurora identity drawn for it, with or without life.
function project(id='aurora-life',{modules=24,groups=4}={}){
  const nodes=Array.from({length:groups},(_,k)=>({id:`g${k}`,type:'group'}));
  for(let i=0;i<modules;i++)nodes.push({id:`m${i}`,type:'module',group:`g${i%groups}`,dir:`d${i%3}`,lang:'ts',counts:{function:3}});
  return {projectId:sha(id),graph:{nodes,edges:[]},stats:{raw:100},agents:[]};}
function identity({life=null,name='aurora-life'}={}){
  const r=recipe.generate(project(name),{family:ID,now:0});const {life:_,...g}=r.genome;
  return {...r,genome:life?{...g,life}:g};}
// nG subsystems of per+g files (3 symbols a file, more on the first), dependencies inside each and from each to the next.
function graph(nG=4,per=4){const nodes=[],edges=[];
  for(let g=0;g<nG;g++){nodes.push({id:`g${g}`,type:'group',order:g,q:g,r:0,counts:{function:6}});
    for(let k=0;k<per+g;k++){const id=`m${g}_${k}`,n=k===0?6:3;nodes.push({id,type:'module',group:`g${g}`,dir:'d',q:0,r:0,state:'committed',counts:{function:n}});
      for(let s=0;s<n;s++)nodes.push({id:`${id}.f${s}`,type:'function',parent:id,slot:s});}
    edges.push({a:`m${g}_1`,b:`m${g}_0`,kind:'depends'});
    if(g)edges.push({a:`m${g}_0`,b:`m${g-1}_1`,kind:'depends',cross:true});}
  return {nodes,edges};}
async function network(nG=4,per=4){const {createModel}=await loadWorld('model');const m=createModel({speed:1,tempo:92});const g=graph(nG,per);m.applyDelta({keyframe:true,nodes:g.nodes,edges:g.edges},T0,T1);return m;}
// The grammar on a recipe, and an ecosystem on its habitat at `at` (no driver: the habitat, then ticks).
async function setup({nG=4,per=4,rec=identity()}={}){
  const [model,L,life,sim,driver,timeline]=await load();
  const m=await network(nG,per),grammar=life.createAuroraGrammar(rec);
  const eco=(params={},seed=7,at=T1+3000)=>{const e=sim.createEcosystem({...grammar.ecosystem(params,seed),seed,params:driver.lifeScales(params)});e.setSites(grammar.habitat(m,at));e.populate();return e;};
  return {model:m,L,grammar,life,sim,driver,timeline,eco,rec,createModel:model.createModel};
}
const run=(e,n)=>{for(let k=0;k<n;k++)e.step();};
// A recorded performance for the driver: windows of 10 s, a subsystem founded every 6 windows (its files over the next
// ones), frames with energy and tension, and intents naming files and subsystems (edits, a failure and its recovery, a
// verified milestone, a connection, commits).
function recording(windows=24){
  const g=graph(4,5),entries=[];
  for(let k=0;k<windows;k++){const start=T0+k*10000,end=start+10000,gi=Math.min(3,Math.floor(k/6)),gid=`g${gi}`,fk=k%6,file=`m${gi}_${fk}`;
    const want=new Set();if(k<24){if(fk===0)want.add(gid);if(fk<5+gi){want.add(file);for(const n of g.nodes)if(n.parent===file)want.add(n.id);}}
    const nodes=g.nodes.filter(n=>want.has(n.id)),edges=g.edges.filter(e=>want.has(e.a)&&nodes.some(n=>n.id===e.a));
    const intents=[],I=(id,type,ts,subject,extra={})=>intents.push({v:1,id,type,ts,tier:extra.tier??1,magnitude:extra.magnitude??.5,evidence:extra.evidence||'observed',subject,detail:extra.detail||{}});
    if(fk===0)I(`c${k}`,'subsystem.created',start+800,{groupId:gid},{tier:2});
    if(k%2===1)I(`e${k}`,'structure.modified',start+3000,{fileId:`m${Math.max(0,gi)}_0`,groupId:gid},{tier:0,magnitude:.3,evidence:'derived'});
    if(k===9)I('f','validation.failed',start+2000,{fileIds:['m1_0','m1_1'],groupId:'g1'},{tier:2,magnitude:.7,evidence:'verified'});
    if(k===13)I('r','validation.recovered',start+2000,{fileIds:['m1_0','m1_1'],groupId:'g1'},{tier:3,magnitude:.7,evidence:'verified'});
    if(k===15)I('ms','milestone.achieved',start+2500,{groupId:'g0',fileIds:['m0_0']},{tier:3,magnitude:.8,evidence:'verified',detail:{kinds:['recovery']}});
    if(k===16)I('ln','subsystem.connected',start+1000,{groupId:'g2',fileId:'m2_0',targetGroupId:'g1',targetId:'m1_1'},{tier:2});
    if(k%5===4)I(`k${k}`,'repository.checkpoint',start+5000,{fileIds:[file]},{tier:1});
    entries.push({seq:k,start,end,frame:{start,end,chapter:1,controls:{energy:.25+.03*(k%10),tension:k>=9&&k<13?.55:.12}},
      graph:k===0?{keyframe:true,nodes,edges}:{add:nodes,remove:[],addEdges:edges,removeEdges:[]},intents});}
  return entries;}
// A player: the driver on the recording, as a replay or a film (background preparation off: the states are the same).
async function player({params={ecology:2,music:1},rec=identity(),entries=recording(),seed=99,speed=1,tempo=96}={}){
  const [,,life,,{createLifeDriver},{createLifeTimeline}]=await load();
  const timeline=createLifeTimeline();timeline.prime(entries);const grammar=life.createAuroraGrammar(rec);
  const driver=createLifeDriver({grammar,timeline,seed,config:()=>({speed,tempo,epoch:T0,params,film:true,live:false,music:{version:3,style:'ambient',seed:5,profile:null}}),score,background:false});
  return {driver,grammar,timeline,at:t=>driver.update({tview:(t-T0)/1000},{budgetMs:Infinity})};
}
// The world headless on a model (as the host drives it), with life (ctx.life) or without.
async function world({model,rec=identity(),life=null,size=[1280,720],agents=null}={}){
  const {THREE}=await loadWorld('core'),{createFamily}=await loadWorld('aurora'),{createDirector}=await loadWorld('director'),{createAgents}=await loadWorld('agents');
  const director=createDirector({recipe:rec}),ag=agents||createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,size[0]/size[1],.1,4000);
  const w=createFamily({scene,camera,model,recipe:rec,speed:()=>1,name:id=>`Name ${id}`,director,agents:ag,pipeline:{size},...(life?{life}:{})});w.rebuild();
  const frame=(t,quality=0,extra={})=>({t,tsec:(t-model.epoch)/1000,tview:(t-model.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',
    unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:ag.list(t),overrides:{},quality,music:null,...extra});
  const place=goal=>{const e=goal.elevation,a=goal.azimuth;camera.position.set(goal.target.x+Math.cos(a)*Math.cos(e)*goal.distance,goal.target.y+Math.sin(e)*goal.distance,goal.target.z+Math.sin(a)*Math.cos(e)*goal.distance);camera.lookAt(goal.target);};
  const objects=()=>{const out=[];scene.traverse(o=>{if(o!==scene)out.push(o);});return out;};
  return {w,frame,scene,camera,objects,THREE,place};
}
// Everything the GPU would be given: per object its kind, order, shader text, uniform names and blending (and the sky's
// material); per moment every uniform value, texture, buffer, draw range, the grade and the camera goal.
function fingerprint(W,moments){
  const h=crypto.createHash('sha256'),objs=W.objects(),sky=W.w.background();
  // (each object's twin in the reflection too: the curtains' has a material of its own)
  const mats=[...new Set([...objs.flatMap(o=>[o.material,o.userData?.mirror?.material]).filter(Boolean),sky])];
  for(const o of objs)h.update(`${o.type}|${o.renderOrder}|${o.frustumCulled}|${!!o.userData?.mirror}`);
  for(const M of mats){h.update(M.vertexShader||'');h.update(M.fragmentShader||'');h.update(Object.keys(M.uniforms||{}).sort().join(','));h.update(`${M.blending}|${M.transparent}|${M.depthTest}|${M.depthWrite}`);}
  const shader=h.digest('hex').slice(0,16),h2=crypto.createHash('sha256');
  for(const t of moments){const f=W.frame(t);W.w.update(f);const goal=W.w.cameraGoal(f);W.place(goal);W.w.afterCamera(f);h2.update(JSON.stringify(W.w.grade(f)));h2.update(JSON.stringify(goal));
    for(const M of mats){for(const u of Object.values(M.uniforms||{})){const v=u.value;if(v&&v.isTexture&&v.image?.data)h2.update(Buffer.from(v.image.data.buffer));else if(v&&typeof v==='object'&&!v.isTexture)h2.update(JSON.stringify(v));else if(typeof v==='number')h2.update(String(v));}}
    for(const o of objs){const G=o.geometry;if(!G)continue;h2.update(String(G.instanceCount??'')+'|'+JSON.stringify(G.drawRange));
      for(const [k,a] of Object.entries(G.attributes)){const b=Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);h2.update(`${k}:${b.length}:${crypto.createHash('sha1').update(b).digest('hex')}`);}}}
  return {objects:objs.length,shader,state:h2.digest('hex').slice(0,16)};
}
// The state at AT is the same after continuous play (15, 30, 60 and 120 fps for ecology 2; 30 for ecology 1), seeks back
// and forth with a restored checkpoint, and a fresh session (shared by the two driver test files, one ecology each).
const AT=T0+137300;   // after the failure (90 s), the recovery (130 s); before the milestone
async function sameMoment(params){
  const assert=require('node:assert/strict');
  const ref=await player({params});ref.at(AT);const want=ref.driver.digest();
  const st=ref.driver.stats();assert(st.ecosystem.alive>60,'alive');assert.equal(st.ecosystem.sites,3,'a site per curtain (the fourth subsystem comes at 180 s)');assert.equal(st.grammar,'aurora');
  for(const fps of [15,30,60,120]){if(params.ecology!==2&&fps!==30)continue;const p=await player({params});
    // (from a while before the moment: the earlier frames are simulated the same either way)
    for(let t=fps===30?T0:AT-20000;t<AT;t+=1000/fps)p.at(t);p.at(AT);assert.equal(p.driver.digest(),want,`continuous play at ${fps} fps`);}
  const seek=await player({params});seek.at(T0+200000);seek.at(T0+40000);seek.at(AT+15000);seek.at(AT);
  assert.equal(seek.driver.digest(),want,'seeks back and forth');assert(seek.driver.stats().fromCheckpoint>0,'a checkpoint was restored');
  const fresh=await player({params});fresh.at(AT);assert.equal(fresh.driver.digest(),want,'a fresh session');
}
module.exports={load,loadWorld,T0,T1,ID,project,identity,graph,network,setup,run,recording,player,world,fingerprint,score,sameMoment};

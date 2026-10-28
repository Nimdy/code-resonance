'use strict';
// The flagship worlds draw an agent's touch (public/worlds/touch.js) from the presences alone: built in Node without a
// GPU (update only), with an agent editing one file. Presentation only: nothing reaches the director or digital life.
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const load=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000;
const group=id=>({id,type:'group',order:0,q:0,r:0,angle:1,counts:{}});
const mod=(id,g,q=1,r=0)=>({id,type:'module',group:g,dir:'d',q,r,state:'committed',counts:{function:2}});
const sym=(id,parent,slot=0)=>({id,type:'function',parent,slot});
const state=(ts,agentId,detail,fileId=null)=>({v:1,id:`a-${agentId}-${ts}`,type:'agent.state',ts,tier:0,magnitude:.2,evidence:'observed',
  subject:{agentId,voice:1,...(fileId?{fileId}:{})},detail:{provider:'claude-code',...detail}});
async function world(family){
  const [{THREE},{createModel},{createAgents},{createFamily}]=await Promise.all([load('core'),load('model'),load('agents'),load(family==='fractal-biosphere'?'biosphere':family==='stellar-forge'?'stellar':'cathedral')]);
  const nodes=[group('g1'),group('g2'),...['m1','m2','m3','m4'].map((id,k)=>mod(id,k<2?'g1':'g2',k+1,k%2)),...['m1','m2','m3','m4'].flatMap(p=>[sym(`${p}s0`,p),sym(`${p}s1`,p,1)])];
  const graph={nodes,edges:[]},r=recipe.generate({projectId:'touch',graph,stats:{}},{family,now:0});
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,16/9,.1,4000),model=createModel(),agents=createAgents();
  model.reset(graph,T0);camera.position.set(0,6,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  agents.record(state(T0+1000,'a1',{state:'processing'}));agents.record(state(T0+5000,'a1',{state:'tool',activity:'editing'},'m3'));agents.record(state(T0+5100,'a1',{state:'processing'},'m3'));
  const director={lasting:()=>[],attentionAt:()=>null,commands:[],activityAt:()=>0,phaseAt:()=>'active',unlockedAt:()=>[]};
  const w=createFamily({THREE,scene,camera,model,recipe:r,speed:()=>1,name:id=>id,director,agents,pipeline:{size:[960,540]},film:true,life:null});
  const frame=t=>{const tsec=(t-model.epoch)/1000;return {t,tsec,tview:tsec,dt:1/30,beat:0,barPhase:0,mood:{section:'home',energy:0,tempo:92},energy:0,activity:.2,phase:'active',
    unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:agents.list(t),overrides:{},quality:0};};
  return {w,frame,scene,dispose:()=>w.dispose()};
}
for(const family of ['fractal-biosphere','stellar-forge','machine-cathedral'])test(`${family}: an agent's edit touches its file for a few seconds, then nothing`,async()=>{
  const {w,frame,dispose}=await world(family);
  try{
    const run=t=>{const i=frame(t);w.update(i);w.cameraGoal(i);return w.stats().touches;};
    assert.equal(run(T0+4000),0,'before the edit');
    assert.equal(run(T0+5600),1,'during its touch (the tool itself ended 100 ms after it began)');
    assert.equal(run(T0+7500),1);
    assert.equal(run(T0+9000),0,'gone after a few seconds');
    assert.equal(run(T0+5600),1,'a pure function of the time: a seek back shows it again');
  }finally{dispose();}
});

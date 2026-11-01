'use strict';
// Shared fixture for Synaptic Storm's digital-life tests (tests/life-synaptic*.test.js): a network of subsystems with
// files, symbols and dependencies inside and across them, the world's layout and life grammar, an ecosystem on its
// habitat, and a player that runs the grammar on a recorded performance through the driver. Not a test file itself.
const load=()=>Promise.all([import('../public/worlds/model.js'),import('../public/worlds/synaptic-layout.js'),import('../public/worlds/life/synaptic.js'),
  import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
const score=require('../public/score.js');
const T0=1750000000000,T1=T0+10000;
// nG subsystems of `per`+g files each (three symbols a file), dependencies inside each and from each to the next.
function graph(nG=5,per=6){const nodes=[],edges=[];
  for(let g=0;g<nG;g++){nodes.push({id:`g${g}`,type:'group',order:g,q:(g%3)*4-4,r:Math.floor(g/3)*4-2,counts:{function:9}});
    for(let k=0;k<per+g;k++){const id=`m${g}_${k}`;nodes.push({id,type:'module',group:`g${g}`,dir:'d',q:0,r:0,state:'committed',counts:{function:3}});
      for(let s=0;s<3;s++)nodes.push({id:`${id}.f${s}`,type:'function',parent:id,slot:s});}
    edges.push({a:`m${g}_1`,b:`m${g}_0`,kind:'depends'},{a:`m${g}_${per-1}`,b:`m${g}_2`,kind:'depends'});
    if(g)edges.push({a:`m${g}_0`,b:`m${g-1}_1`,kind:'depends',cross:true},{a:`m${g}_3`,b:`m${g-1}_4`,kind:'depends',cross:true});}
  return {nodes,edges};}
async function network(nG=5,per=6){const [{createModel}]=await load();const m=createModel({});const g=graph(nG,per);m.applyDelta({keyframe:true,nodes:g.nodes,edges:g.edges},T0,T1);return m;}
const RECIPE={projectSeed:42,genome:{geometry:{filesPerNeuron:4}}};
async function setup({nG=5,per=6,recipe=RECIPE}={}){
  const [model,layoutMod,life,sim,driver,timeline]=await load();
  const m=await network(nG,per),layout=layoutMod.createLayout(layoutMod.layoutConfig(recipe)),grammar=life.createSynapticGrammar({layout});
  const eco=(params={},seed=7,at=T1)=>{const e=sim.createEcosystem({...grammar.ecosystem(params,seed),seed,params:driver.lifeScales(params)});const h=grammar.habitat(m,at);
    e.setSiteData(h.data);e.setSites(h.sites);e.populate();return e;};
  return {model:m,layout,layoutMod,grammar,life,sim,eco,createModel:model.createModel};
}
const run=(e,n)=>{for(let k=0;k<n;k++)e.step();};
// A recorded performance for the driver: windows of 10 s, a subsystem founded every 8 windows (files in it and its
// dependencies), more files in between, frames with energy and tension, and intents naming files and subsystems (edits,
// a failure, a recovery, a verified milestone, a connection, commits).
function recording(windows=30){
  const entries=[];let nodes=[],edges=[];
  const mod=(id,g)=>({id,type:'module',group:g,dir:'d',q:0,r:0,state:'committed',counts:{function:3}});
  for(let k=0;k<windows;k++){
    const start=T0+k*10000,end=start+10000,add=[],addEdges=[];
    if(k%8===0){const g=`g${k/8}`;add.push({id:g,type:'group',order:k/8,q:(k/8)%3*4-4,r:Math.floor(k/24)*4,counts:{function:6}});for(let j=0;j<5;j++)add.push(mod(`${g}_${j}`,g));
      addEdges.push({a:`${g}_1`,b:`${g}_0`,kind:'depends'});if(k)addEdges.push({a:`${g}_0`,b:`g${k/8-1}_2`,kind:'depends',cross:true});}
    else if(k%3===1)add.push(mod(`g${Math.floor(k/8)}_x${k}`,`g${Math.floor(k/8)}`));
    nodes=nodes.concat(add);edges=edges.concat(addEdges);
    const graph=k%6===0?{keyframe:true,nodes:nodes.slice(),edges:edges.slice()}:{add,remove:[],addEdges,removeEdges:[]};
    const intents=[],I=(type,dt,extra={})=>intents.push({v:1,id:`w${k}:${type}:${dt}`,type,ts:start+dt,tier:1,magnitude:.5,evidence:'observed',subject:{groupId:'g0'},detail:{},...extra});
    I('structure.modified',1500,{subject:{fileId:'g0_1'}});I('agent.state',4200,{subject:{fileId:'g0_2'},detail:{state:'tool'}});
    if(k===10)I('validation.failed',3000,{tier:2,evidence:'verified',subject:{fileIds:['g0_0','g0_1','g1_2']}});
    if(k===14)I('validation.recovered',4000,{tier:3,evidence:'verified',subject:{fileIds:['g0_0','g0_1','g1_2']}});
    if(k===18)I('milestone.achieved',5000,{tier:3,magnitude:.9,evidence:'verified',subject:{groupId:'g1'}});
    if(k===20)I('subsystem.connected',2000,{tier:2,evidence:'derived',subject:{fileId:'g2_0',targetId:'g1_2'}});
    if(k%5===2)I('repository.checkpoint',6000,{tier:1,subject:{fileIds:['g0_3','g1_1']}});
    entries.push({seq:k,start,end,frame:{start,end,chapter:1,controls:{energy:.3+.4*((k%7)/7),tension:k>=10&&k<14?.5:.1}},graph,intents});
  }
  return entries;
}
// A player: delivers the recorded windows as playback reaches them (or all at once, as a replay primes).
async function player({entries,prime=true,params={enabled:true},film=false,live=false,recipe=RECIPE,opts={}}){
  const [,layoutMod,life,,{createLifeDriver},{createLifeTimeline}]=await load();
  const grammar=life.createSynapticGrammar({layout:layoutMod.createLayout(layoutMod.layoutConfig(recipe))});
  const timeline=createLifeTimeline();let cfg={speed:1,tempo:96,epoch:T0,params,live,film,music:{version:3,style:'ambient',seed:9001,profile:null}};
  const driver=createLifeDriver({grammar,timeline,seed:1234,config:()=>cfg,score,...opts});
  if(prime)timeline.prime(entries);let next=0;
  const deliver=t=>{while(next<entries.length&&entries[next].start<=t){const e=entries[next++];timeline.structure(e.graph,e.start,e.end,e.seq);timeline.frame(e.frame,e.start);for(const i of e.intents)timeline.intent(i);}};
  const viewAt=t=>(t-T0)/1000;
  return {driver,timeline,grammar,set:x=>{cfg={...cfg,...x};},
    play(t0,t1,fps=30){const step=1000/fps;for(let k=0,t=t0;t<t1;t=t0+(++k)*step){deliver(t);driver.update({tview:viewAt(t)},{budgetMs:1e9});}deliver(t1);return driver.update({tview:viewAt(t1)},{budgetMs:1e9});},
    at(t){deliver(t);return driver.update({tview:viewAt(t)},{budgetMs:1e9});},
    seek(t){next=entries.findIndex(e=>e.end>t);if(next<0)next=entries.length;}};
}
module.exports={load,score,T0,T1,graph,network,RECIPE,setup,run,recording,player};

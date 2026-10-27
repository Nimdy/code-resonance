'use strict';
// Shared fixture for Fractal Biosphere's digital-life tests (tests/life-biosphere*.test.js): the modules under test, a
// small project model, and an ecosystem built on a habitat the way the driver builds it.
const load=()=>Promise.all([import('../public/worlds/life/biosphere.js'),import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js'),
  import('../public/worlds/model.js'),import('../public/worlds/biosphere-growth.js')]);
const T0=1750000000000;
const RECIPE={projectSeed:7,genome:{geometry:{species:'coral'},space:{},motion:{current:.4}}};
// A project of six subsystems on the hex grid, with folders, files and symbols (and a few cross links).
function graph(){
  const nodes=[],edges=[];const at=[[0,0],[1,0],[0,1],[-1,1],[-1,0],[1,-1]];
  at.forEach(([q,r],g)=>{nodes.push({id:`g${g}`,type:'group',order:g,q,r,angle:g,counts:{function:4+g,class:g%2}});
    for(let m=0;m<2+g;m++){const id=`g${g}/m${m}`;nodes.push({id,type:'module',group:`g${g}`,dir:`d${m%2}`,q,r,state:m%3?'committed':'validated',counts:{function:2}});
      for(let s=0;s<1+(m%3);s++)nodes.push({id:`${id}#s${s}`,type:s%2?'class':'function',parent:id,slot:s});}});
  edges.push({a:'g0/m0',b:'g1/m0',kind:'depends',cross:true},{a:'g2/m1',b:'g3/m0',kind:'depends',cross:true});
  return {nodes,edges};
}
async function setup(){
  const [bio,sim,drv,mdl,growth]=await load();
  const model=mdl.createModel();model.applyDelta({keyframe:true,...graph()},T0,T0+10000);
  return {bio,sim,drv,model,growth};
}
// sites: a habitat's sites, or the habitat itself ({sites, data}: the data is handed over as the driver does).
function ecosystemOf({bio,sim,drv},sites,{seed=99,params={}}={}){
  const g=bio.biosphereGrammar(RECIPE);
  const eco=sim.createEcosystem({...g.ecosystem(params,seed),seed,params:drv.lifeScales(params)});
  if(!Array.isArray(sites)){eco.setSiteData(sites.data??null);sites=sites.sites;}
  eco.setSites(sites);eco.populate();return {g,eco};
}
const run=(eco,ticks,each)=>{for(let t=0;t<ticks;t++){eco.step();each?.(t);}};
module.exports={load,T0,RECIPE,graph,setup,ecosystemOf,run};

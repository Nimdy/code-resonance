'use strict';
// Shared fixture for Stellar Forge's digital-life tests (tests/life-stellar*.test.js): a project model, the world's
// layout and life grammar, and an ecosystem built on the grammar's habitat.
const load=()=>Promise.all([import('../public/worlds/model.js'),import('../public/worlds/stellar-layout.js'),import('../public/worlds/life/stellar.js'),
  import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js')]);
const T0=1750000000000;
// A project: nG subsystems (the first one the core), each with a few modules on its hex rings.
function nodes(nG=7,per=5){const out=[];
  for(let g=0;g<nG;g++){out.push({id:`g${g}`,type:'group',order:g,q:g*3,r:-g,angle:g*.8,counts:{function:3},core:g===0});
    for(let k=0;k<per+g;k++)out.push({id:`m${g}_${k}`,type:'module',group:`g${g}`,dir:'d',q:g*3+(k%3),r:-g+Math.floor(k/3),state:'committed',counts:{function:2}});}
  return out;}
async function setup({recipe={projectSeed:42,genome:{}},nG=7}={}){
  const [{createModel},{layoutConfig,createLayout},life,{createEcosystem},{lifeScales}]=await load();
  const model=createModel({speed:1,tempo:96});model.reset({nodes:nodes(nG),edges:[]},T0);
  const layout=createLayout(layoutConfig(recipe)),grammar=life.createStellarGrammar({layout});
  const eco=(params={},seed=7)=>{const e=createEcosystem({...grammar.ecosystem(params,seed),seed,params:lifeScales(params)});e.setSites(grammar.habitat(model,T0+60000));e.populate();return e;};
  return {model,layout,grammar,life,eco,createModel,createLayout,layoutConfig};
}
const run=(e,n)=>{for(let k=0;k<n;k++)e.step();};
module.exports={T0,nodes,setup,run};

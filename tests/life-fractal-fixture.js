'use strict';
// Shared fixture for Fractal Continuum's digital-life tests (tests/life-fractal*.test.js): the modules under test, a
// project model (subsystems with files and symbols) and an ecosystem built on the grammar's habitat the way the driver
// builds it. Not a test file itself.
const load=()=>Promise.all([import('../public/worlds/life/fractal.js'),import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js'),
  import('../public/worlds/model.js'),import('../public/worlds/fractal-forms.js')]);
const T0=1750000000000;
const RECIPE={projectSeed:42,genome:{geometry:{spacing:.2,regions:1,swell:.3}}};
// nG subsystems, each with 3 + g files of one to three symbols (a few validated).
function graph(nG=6,extra=0){const nodes=[];
  for(let g=0;g<nG;g++){nodes.push({id:`g${g}`,type:'group',order:g,q:g,r:0,counts:{function:3}});
    for(let k=0;k<3+g+extra;k++){const id=`m${g}_${k}`;nodes.push({id,type:'module',group:`g${g}`,dir:'d',q:0,r:0,state:k%3?'committed':'validated',counts:{function:2}});
      for(let s=0;s<1+k%3;s++)nodes.push({id:`${id}#s${s}`,type:'function',parent:id,slot:s});}}
  return {nodes,edges:[]};}
async function setup({nG=6,extra=0,recipe=RECIPE}={}){
  const [life,sim,drv,mdl,forms]=await load();
  const model=mdl.createModel({speed:1,tempo:96});model.reset(graph(nG,extra),T0);
  const grammar=life.createFractalGrammar(recipe);
  const eco=(params={},seed=7)=>{const e=sim.createEcosystem({...grammar.ecosystem(params,seed),seed,params:drv.lifeScales(params)});e.setSites(grammar.habitat(model,T0+60000));e.populate();return e;};
  return {life,sim,drv,mdl,forms,model,grammar,eco,recipe};
}
const run=(e,n)=>{for(let k=0;k<n;k++)e.step();};
// Inhabitants (of a species, or all) within map distance d of site k.
function near(e,k,d,species=-1){const S=e.sites;let n=0;for(let i=0;i<e.capacity;i++){if(!e.alive[i]||species>=0&&e.sp[i]!==species)continue;if(Math.hypot(e.px[i]-S.x[k],e.pz[i]-S.z[k])<d)n++;}return n;}
module.exports={load,T0,RECIPE,graph,setup,run,near};

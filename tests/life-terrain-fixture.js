'use strict';
// Shared fixture for Temporal Terrain's digital-life tests (tests/life-terrain*.test.js): the modules under test, a land
// of ranges and ridges, and an ecosystem on it with the terrain grammar (no driver: the habitat at a moment, then ticks).
const load=()=>Promise.all([import('../public/worlds/model.js'),import('../public/worlds/terrain-layout.js'),import('../public/worlds/life/terrain.js'),
  import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
const T0=1750000000000;
// A land: nG subsystems, each with a few files of a few symbols (the first subsystem the largest).
function graph(nG=4,per=4){const nodes=[],edges=[];
  for(let g=0;g<nG;g++){nodes.push({id:`g${g}`,type:'group',order:g,q:g,r:0,counts:{function:6}});
    for(let k=0;k<per+(g===0?2:0);k++){const id=`m${g}_${k}`,n=2+((g+k)%4);nodes.push({id,type:'module',group:`g${g}`,dir:'d',q:g,r:k,state:'committed',counts:{function:n}});
      for(let s=0;s<n;s++)nodes.push({id:`${id}.f${s}`,type:'function',parent:id,slot:s});}}
  return {nodes,edges};}
const CFG={projectSeed:7,genome:{time:{scale:42,depth:60},relief:{spacing:5}}};
async function land(nG=4){const [{createModel}]=await load();const m=createModel({speed:1,tempo:92});m.reset(graph(nG),T0);return m;}
// An ecosystem on the land at T0 + 20 s (its habitat, data and population), with the terrain grammar.
async function ecosystem(m,{params={},seed=7,capacity=360,at=T0+20000,recipe=CFG}={}){
  const [,L,G,{createEcosystem},{lifeScales}]=await load();
  const cfg=L.layoutConfig(recipe),grammar=G.createTerrainGrammar({cfg,capacity}),h=grammar.habitat(m,at);
  const eco=createEcosystem({...grammar.ecosystem(params,seed),seed,params:lifeScales(params)});eco.setSiteData(h.data);eco.setSites(h.sites);eco.populate();
  return {L,G,cfg,grammar,h,eco};
}
const run=(e,n)=>{for(let k=0;k<n;k++)e.step();};
// Awake grazers within reach of a range's pastures (by its site index), and those grazing (orbit) anywhere.
function nearRange(e,G,h,rangeId,reach=2.5){const xs=h.sites.filter(s=>h.data.rangeOf[s.id]===rangeId).map(s=>s.x);let n=0;
  for(let i=0;i<e.capacity;i++){if(!e.alive[i]||e.sp[i]!==G.GRAZER||e.ia[i*2+1]===1||e.pz[i]>30)continue;if(xs.some(x=>Math.abs(e.px[i]-x)<reach))n++;}return n;}
module.exports={load,T0,graph,CFG,land,ecosystem,run,nearRange};

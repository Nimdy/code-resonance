'use strict';
// Shared fixture for Machine Cathedral's digital-life tests (tests/life-cathedral*.test.js): the modules under test, a
// city of precincts, and an ecosystem on it with the cathedral grammar; route choice between two mirror-image routes.
const load=()=>Promise.all([import('../public/worlds/model.js'),import('../public/worlds/life/cathedral.js'),import('../public/worlds/cathedral-layout.js'),
  import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
const T0=1750000000000,T1=T0+10000;
// A city of precincts (hex plots), each with a landmark and smaller towers; dependencies inside and across precincts.
function graph({centres,set=[[0,0],[1,0],[0,1],[-1,1],[1,-1]],cross=true,big=9}){
  const nodes=[],edges=[];
  Object.entries(centres).forEach(([g,[q0,r0]],gi)=>{nodes.push({id:g,type:'group',order:gi,q:q0,r:r0,counts:{function:12}});
    set.forEach(([dq,dr],k)=>{const id=`${g}_${k}`,n=k===0?big:2+((gi+k)%4);nodes.push({id,type:'module',group:g,dir:'d',q:q0+dq,r:r0+dr,state:'committed',counts:{function:n}});
      for(let s=0;s<n;s++)nodes.push({id:`${id}.f${s}`,type:'function',parent:id,slot:s});});
    if(set.length>=4)edges.push({a:`${g}_1`,b:`${g}_2`,kind:'depends'},{a:`${g}_0`,b:`${g}_3`,kind:'depends'});});
  const ids=Object.keys(centres);if(cross)ids.forEach((g,k)=>edges.push({a:`${g}_0`,b:`${ids[(k+1)%ids.length]}_0`,kind:'depends',cross:true}));
  return {nodes,edges};
}
const RING={centres:{g0:[0,0],g1:[7,-1],g2:[6,6],g3:[-1,7]}};
// Mirror-symmetric about z = 0 (a hex plot (q, r) mirrors to (q + r, -r)): from A to B, via C or via D, are the same.
// (Its towers are square (deco) and turned square to the axes (axisAz 0), so their rings are mirror-symmetric too.)
const DIAMOND=(near=false)=>({centres:{A:[0,0],B:[9,0],C:[7,-5],D:near?[3,4]:[2,5],F:[-6,0],H:[15,0]},set:[[0,0],[1,0],[1,-1],[0,1]],cross:false,big:6});
async function city(spec){const [{createModel}]=await load();const m=createModel({});const g=graph(spec);m.applyDelta({keyframe:true,nodes:g.nodes,edges:g.edges},T0,T1);return m;}
// An ecosystem on a city with the cathedral grammar (no driver: the habitat at the window's end, then ticks).
async function ecosystem(m,{arch='gothic',params={},opts={},seed=7,capacity=600}={}){
  const [,G,,{createEcosystem},{lifeScales}]=await load();
  const grammar=G.createCathedralGrammar({genome:{geometry:{architecture:arch,buttress:1}},axisAz:.4,capacity,...opts});
  const h=grammar.habitat(m,T1),sites=h.sites,net=h.data;
  const eco=createEcosystem({...grammar.ecosystem(params,seed),seed,params:lifeScales(params)});eco.setSiteData(h.data);eco.setSites(sites);eco.populate();
  return {G,grammar,net,eco,sites,awake:i=>eco.alive[i]&&eco.fa[i*2+1]===net.tag};
}
// Route choice between two mirror-image routes (A to B via C or via D): the share of A<->B couriers via C.
async function viaC(m,{seed,params,opts,ticks=3000,prime=null}){
  const {G,net,eco,awake}=await ecosystem(m,{arch:'deco',seed,params,opts:{axisAz:0,...opts}});
  const corridor=new Map();
  for(let e=0;e<net.m;e++){if(net.ek[e]!==G.EDGE.corridor)continue;const a=net.np[net.ea[e]]>=0?net.ea[e]:net.eb[e],mid=a===net.ea[e]?net.eb[e]:net.ea[e];let other=-1;
    for(let q=net.adjOff[mid];q<net.adjOff[mid+1];q++){const e2=net.adj[q]>>1,u=net.ea[e2]===mid?net.eb[e2]:net.ea[e2];if(net.np[u]>=0&&net.np[u]!==net.np[a])other=net.np[u];}
    corridor.set(e,[net.precs[net.np[a]].id,net.precs[other].id].sort().join(''));}
  const use={C:0,D:0},trail={C:0,D:0},all={C:0,D:0};
  // Priming: light along every route on one side (as if travelled), between A and B.
  const A=net.precs.find(q=>q.id==='A'),B=net.precs.find(q=>q.id==='B'),lit=[];
  if(prime)for(let v=0;v<net.n;v++)if((prime==='C'?net.z[v]<-.5:net.z[v]>.5)&&net.x[v]>A.cx-4&&net.x[v]<B.cx+4)lit.push([net.x[v],net.z[v]]);
  for(let k=0;k<ticks;k++){if(lit.length&&k%40===0)for(const [x,z] of lit)eco.splat(0,x,z,.25);eco.step();if(k<ticks/5)continue;
    for(let i=0;i<eco.capacity;i++){if(!awake(i)||eco.sp[i]!==0||(eco.ia[i*2+1]&15)!==G.JOB.travel)continue;const pair=corridor.get(eco.ia[i*2]>>1);if(!pair||pair==='CD')continue;
      const hub=net.hubs[eco.ia[i*2+1]>>8]?.id;if((hub==='B'&&pair.includes('A'))||(hub==='A'&&pair.includes('B')))use[pair.includes('C')?'C':'D']++;}
    for(let i=0;i<eco.capacity;i++){if(!awake(i))continue;const pair=corridor.get(eco.ia[i*2]>>1);if(pair==='AC'||pair==='AD')all[pair[1]]++;}}
  for(const [e,pair] of corridor)if(pair==='AC'||pair==='AD')trail[pair[1]]+=eco.sample(0,net.emx[e],net.emz[e]);
  return {share:use.C/Math.max(1,use.C+use.D),trips:use.C+use.D,trail,all};
}
module.exports={load,T0,T1,graph,RING,DIAMOND,city,ecosystem,viaC};

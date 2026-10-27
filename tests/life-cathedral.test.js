'use strict';
// Machine Cathedral digital life (public/worlds/life/cathedral.js, public/worlds/cathedral-layout.js): the inhabitants'
// network is derived from the city's own layout (the function the world renders from), they never pass through stone,
// the routes they travel brighten and draw more traffic, a crowded route sheds traffic to its alternative, a failing
// precinct is avoided (its maintenance swarm waits at its kerb) and traffic returns once it recovers, lifecycles and
// state stay bounded and exact. Rendering is looked at in the browser (qualification/visual/lab.js).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
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
test('Habitat: the network is a pure function of the model and the time; it is the same whatever grammar instance built it',async()=>{
  const [,G]=await load();const m1=await city(RING),m2=await city(RING);
  const a=G.createCathedralGrammar({axisAz:.4}),b=G.createCathedralGrammar({axisAz:.4});
  const ha=a.habitat(m1,T1),hb=b.habitat(m2,T1),sa=ha.sites;assert.deepEqual(sa,hb.sites,'same sites');assert.deepEqual(a.habitat(m1,T1).sites,sa,'same again (cached)');
  const na=ha.data,nb=hb.data;assert.equal(na.key,nb.key);assert.equal(a.networkAt(m1,T1).key,na.key);
  for(const k of ['x','y','z','ea','eb','ek'])assert.deepEqual(Array.from(na[k]),Array.from(nb[k]),`network ${k}`);
  // A network built afresh (no cache at all) is the same: the habitat's data is a pure function of the structure.
  const fresh=G.createCathedralGrammar({axisAz:.4,cacheMax:0}).habitat(m1,T1).data;for(const k of ['x','y','z','ea','eb','ek'])assert.deepEqual(Array.from(fresh[k]),Array.from(na[k]),`rebuilt ${k}`);
  assert.equal(sa.length,4,'one site per precinct (influences land on them)');assert(sa.every(s=>s.kind===1));
  // Before the city stood there is no network; the habitat follows the structure in time.
  const h0=a.habitat(m1,T0-1);assert.equal(h0.sites.length,0);assert.equal(h0.data,null);
  const s=na.stats;assert(s.kinds.kerb>0&&s.kinds.dock>0&&s.kinds.shaft>0&&s.kinds.gallery>0&&s.kinds.corridor>0&&s.kinds.cable>0&&s.kinds.channel>0,`every kind of route ${JSON.stringify(s.kinds)}`);
  assert.equal([...na.comp].filter(c=>c===na.main).length,na.n,'one connected network');
});
test('Habitat matches the rendered layout: the world builds its city from the same pure layout the routes come from',async()=>{
  const [,G,L]=await load();const m=await city(RING),o=L.layoutOptions({});
  const src=fs.readFileSync(path.join(__dirname,'../public/worlds/cathedral.js'),'utf8');
  for(const f of ['precincts(model,LO)','towerPlans(model,LO,offsets)','linkPlans(model,'])assert(src.includes(f),`cathedral.js builds from ${f}`);
  assert(!/const canal=\.32\*streetK/.test(src),'no second copy of the layout arithmetic in the world');
  const net=G.createCathedralGrammar({}).networkAt(m,T1);
  const pr=L.precincts(m,o),plans=L.towerPlans(m,o,new Map(pr.map(p=>[p.d.id,p.off])));
  // Kerb nodes lie on the foundation ellipse; docks ring each tower's plot outside its footprint.
  for(const q of net.precs){const p=pr.find(x=>x.d.id===q.id);
    for(const v of q.kerb){if(v<0)continue;const dx=net.x[v]-p.c.x,dz=net.z[v]-p.c.z,u=(dx*Math.cos(p.ang)+dz*Math.sin(p.ang))/p.rx,w=(-dx*Math.sin(p.ang)+dz*Math.cos(p.ang))/p.rz;assert(Math.abs(u*u+w*w-1)<1e-6,'on the kerb');}}
  for(const tw of net.towers){if(tw.dead)continue;const tp=plans.find(x=>x.m.id===tw.id);assert.equal(tw.x,tp.x);assert.equal(tw.z,tp.z);
    for(const v of tw.dock){if(v<0)continue;assert(Math.hypot(net.x[v]-tp.x,net.z[v]-tp.z)>L.footprint(tp,o)+.1,'dock outside the footprint');}}
  // A cable's interior follows the rendered cable's curve (from tower a at ya to tower b at yb, sagging).
  const lk=L.linkPlans(m,new Map(plans.map(tp=>[tp.m.id,tp.m.group])));assert(net.cables.length>0);
  for(const c of net.cables){const br=lk.bridges.find(b=>b.l.a===c.a&&b.l.b===c.b),A=plans.find(x=>x.m.id===c.a),B=plans.find(x=>x.m.id===c.b);
    const sh=L.cableShape(br,A.x,A.z,L.towerTop(m,A,T1,o),B.x,B.z,L.towerTop(m,B,T1,o));
    for(const v of c.nodes.slice(1,-1)){const u=((net.x[v]-A.x)*(B.x-A.x)+(net.z[v]-A.z)*(B.z-A.z))/(sh.d*sh.d);const y=sh.ya+(sh.yb-sh.ya)*u-sh.sag*4*u*(1-u);
      assert(Math.abs(net.y[v]-y)<1e-4,'on the cable');}}
});
test('Never through stone: over a long run no inhabitant enters a tower, a buttress, a column or a nave, and every route keeps clear',async()=>{
  const [,,L]=await load();
  for(const arch of ['gothic','brutalist']){const m=await city(RING);const {net,eco,awake,G}=await ecosystem(m,{arch});
    const solids=net.towers.filter(t=>!t.dead).flatMap(t=>t.solids);assert(solids.some(s=>s.a)||arch!=='gothic','flying buttresses present');
    // Every edge, sampled finely, is clear of every solid by most of the margin; a tower's own shafts and galleries run
    // on its stone, WALL off it (at least OWN).
    let worstEdge=Infinity,worstOwn=Infinity;for(let e=0;e<net.m;e++){const a=net.ea[e],b=net.eb[e],ot=net.nt[a]>=0?net.nt[a]:net.nt[b],own=ot>=0&&(net.nt[b]<0||net.nt[b]===ot)?net.towers[ot].solids:null;
      for(let s=0;s<=20;s++){const u=s/20,x=net.x[a]+(net.x[b]-net.x[a])*u,y=net.y[a]+(net.y[b]-net.y[a])*u,z=net.z[a]+(net.z[b]-net.z[a])*u;
        for(const so of solids){const d=L.solidDist(so,x,y,z);if(own&&own.includes(so)){if(d<worstOwn)worstOwn=d;}else if(d<worstEdge)worstEdge=d;}}}
    assert(worstEdge>=G.MARGIN*.6,`${arch}: routes keep clear (worst ${worstEdge.toFixed(3)})`);assert(worstOwn>=G.OWN*.9,`${arch}: on its own stone, never in it (worst ${worstOwn.toFixed(3)})`);
    let worst=Infinity,samples=0,naves=0,below=0;
    for(let k=0;k<2400;k++){eco.step();if(k%3)continue;
      for(let i=0;i<eco.capacity;i++){if(!awake(i))continue;samples++;const x=eco.px[i],y=eco.py[i],z=eco.pz[i];
        for(const so of solids){const d=L.solidDist(so,x,y,z);if(d<worst)worst=d;}
        if(y<0)below++;
        for(const q of net.precs){if(!q.nave)continue;const dx=x-q.cx,dz=z-q.cz,u=dx*q.ca+dz*q.sa,v=-dx*q.sa+dz*q.ca;if(Math.abs(u)<q.nave.hl&&Math.abs(v)<q.nave.hw&&y<q.nave.h-.3)naves++;}}}
    assert(samples>200000,'a long run (two minutes)');assert(worst>0,`${arch}: never inside stone (closest ${worst.toFixed(3)} over ${samples} samples)`);
    assert.equal(naves,0,'never inside a nave');assert.equal(below,0,'never below the floor');
    console.log(`# ${arch}: ${samples} inhabitant positions, closest approach to stone ${worst.toFixed(3)}, routes ${worstEdge.toFixed(3)} (on their own tower ${worstOwn.toFixed(3)})`);}
});
test('On the stone: shafts and galleries hug each tower\'s own wall at every height (stepping in at its setbacks), never the air beside it',async()=>{
  const [,,L]=await load();
  for(const arch of ['gothic','brutalist','spire']){const m=await city({...RING,big:16});const {net,G}=await ecosystem(m,{arch});let n=0,far=0,worst=0,steps=0;
    net.towers.forEach((tw,k)=>{if(tw.dead||tw.shaft<0)return;const own=tw.solids;
      for(let v=0;v<net.n;v++){if(net.nt[v]!==k||net.y[v]<.5||(net.nk[v]!==G.EDGE.shaft&&net.nk[v]!==G.EDGE.gallery))continue;
        // (the distance to its own stone: the wall, a ledge or the plinth below it)
        let d=Infinity;for(const so of own)d=Math.min(d,L.solidDist(so,net.x[v],net.y[v],net.z[v]));n++;worst=Math.max(worst,d);if(d>.12)far++;}
      // Where the tower steps in, so does its shaft: a horizontal stretch of the shaft above the plinth.
      for(let e=0;e<net.m;e++)if(net.ek[e]===G.EDGE.shaft&&net.nt[net.ea[e]]===k&&net.y[net.ea[e]]>.5&&Math.abs(net.y[net.ea[e]]-net.y[net.eb[e]])<1e-6)steps++;});
    console.log(`# ${arch}: ${n} shaft and gallery nodes, farthest from their own stone ${worst.toFixed(3)}, ${steps} setback steps`);
    assert(n>40,'climbable towers');assert.equal(far,0,`${arch}: every shaft and gallery node is on its tower's stone (within 0.12)`);
    if(arch!=='brutalist')assert(steps>0,'shafts step in at setbacks');}
});
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
test('Trail feedback: at a junction, travellers take the way that is lit (as a travelled route is)',async()=>{
  const m=await city(DIAMOND());const seeds=[1,2,3];let on=0,off=0;
  // The light is where the traffic is: each place's trail follows how many passed there lately.
  {const {eco}=await ecosystem(m,{arch:'deco',seed:9,opts:{axisAz:0}});const NC=eco.field.nx*eco.field.nz,traffic=new Float64Array(NC);
    for(let k=0;k<1600;k++){eco.step();for(let q=0;q<NC;q++)traffic[q]=traffic[q]*.993+eco.field.density[q];}   // recent traffic (the light fades in ~7 s)
    let lit=0,nl=0,dark=0,nd=0;for(let q=0;q<NC;q++){if(traffic[q]>5){lit+=eco.field.data[q];nl++;}else if(traffic[q]<.05){dark+=eco.field.data[q];nd++;}}lit/=nl;dark/=nd;
    console.log(`# light where traffic passes ${lit.toFixed(3)} (${nl} places), where none passes ${dark.toFixed(4)} (${nd} places)`);assert(nl>50&&lit>20*dark,'routes are lit by their traffic');}
  // At every fork a travelling courier passes (its ways differently lit), how often it takes the brightest way (the
  // light as it was when the choice was made), with the trail pull and without.
  // One side of the city (between A and B, via C) is kept lit, as if travelled, so the forks there offer a lit and a
  // dark way.
  async function lift(seed,opts){const {G,net,eco,awake}=await ecosystem(m,{arch:'deco',seed,opts:{axisAz:0,...opts}});
    const A=net.precs.find(q=>q.id==='A'),B=net.precs.find(q=>q.id==='B'),lit=[];
    for(let v=0;v<net.n;v++)if(net.z[v]<-.5&&net.x[v]>A.cx-4&&net.x[v]<B.cx+4)lit.push([net.x[v],net.z[v]]);
    const tr=new Float32Array(net.m*2),prev=new Int32Array(eco.capacity).fill(-1);let best=0,n=0;
    // (each way's light a little way along it from the junction, as a traveller judges it)
    const along=(dd,v)=>{const e=dd>>1,w=dd&1?net.ea[e]:net.eb[e],f=Math.min(1,1.8/Math.max(1e-6,net.el[e]));return eco.sample(0,net.x[v]+(net.x[w]-net.x[v])*f,net.z[v]+(net.z[w]-net.z[v])*f);};
    for(let k=0;k<2400;k++){if(k%40===0)for(const [x,z] of lit)eco.splat(0,x,z,.4);
      for(let dd=0;dd<net.m*2;dd++)tr[dd]=along(dd,dd&1?net.eb[dd>>1]:net.ea[dd>>1]);
      for(let i=0;i<eco.capacity;i++)prev[i]=awake(i)&&eco.sp[i]===0&&(eco.ia[i*2+1]&15)===G.JOB.travel?eco.ia[i*2]:-1;
      eco.step();if(k<400)continue;
      for(let i=0;i<eco.capacity;i++){const d0=prev[i],d=eco.ia[i*2];if(d0<0||d===d0||!awake(i))continue;const v=d0&1?net.ea[d0>>1]:net.eb[d0>>1];if((d&1?net.eb[d>>1]:net.ea[d>>1])!==v)continue;
        let hi=-1,lo=Infinity,c=0;for(let q=net.adjOff[v];q<net.adjOff[v+1];q++){const dd=net.adj[q];if(dd===(d0^1))continue;hi=Math.max(hi,tr[dd]);lo=Math.min(lo,tr[dd]);c++;}
        if(c<2||hi-lo<.05)continue;n++;if(tr[d]===hi)best++;}}
    return {lift:best/n,n};}
  for(const seed of seeds){const a=await lift(seed,{}),b=await lift(seed,{trailPull:0});on+=a.lift;off+=b.lift;
    if(seed===seeds[0])console.log(`# choices at forks: ${a.n} with the pull, ${b.n} without`);}
  on/=seeds.length;off/=seeds.length;
  console.log(`# the brightest way taken at a fork: trail pull on ${(100*on).toFixed(1)} %, off ${(100*off).toFixed(1)} %`);
  assert(on>off+.05,'travellers take the lit way');
  // The light is the channel: priming one side changes nothing when the pull is off, and nothing is lit without deposits.
  const c0=await viaC(m,{seed:1,prime:'C',opts:{trailPull:0}}),d0=await viaC(m,{seed:1,prime:'D',opts:{trailPull:0}});assert(Math.abs(c0.share-d0.share)<1e-9,'without the pull the light changes nothing');
  const z=await viaC(m,{seed:1,params:{trails:0}});assert.equal(z.trail.C+z.trail.D,0,'no trail without deposits');
});
test('Congestion: when the shorter route crowds, traffic redistributes to the longer one',async()=>{
  const m=await city(DIAMOND(true));let on=0,off=0;const seeds=[1,2,3];
  for(const seed of seeds){const a=await viaC(m,{seed}),b=await viaC(m,{seed,opts:{congestion:false}});on+=a.share;off+=b.share;console.log(`# seed ${seed}: longer route ${a.share.toFixed(3)} with congestion, ${b.share.toFixed(3)} without`);assert(b.share<.5,'the route via D is the shorter one (without congestion most take it)');}
  on/=seeds.length;off/=seeds.length;console.log(`# share of the longer route: congestion on ${on.toFixed(3)}, off ${off.toFixed(3)}`);
  assert(on>off+.05,'a crowded route sheds traffic to its alternative');
});
test('Failure and recovery: a failing precinct is avoided, its wardens withdraw to its kerb, traffic returns once it recovers',async()=>{
  const m=await city(RING);const {G,net,eco,awake}=await ecosystem(m,{seed:3});const P=net.precs.find(q=>q.id==='g1');
  // (going back in after the recovery: the withdrawn wardens gather at the hub's foot, then climb its shaft together)
  const hubT=P.hub;let gathered=0,climbing=0;
  const census=()=>{let inside=0,wardens=0,atKerb=0;for(let i=0;i<eco.capacity;i++){if(!awake(i))continue;const dx=eco.px[i]-P.cx,dz=eco.pz[i]-P.cz,u=(dx*P.ca+dz*P.sa)/P.rx,w=(-dx*P.sa+dz*P.ca)/P.rz;if(u*u+w*w<.8)inside++;
    const v=net.ea[eco.ia[i*2]>>1],j=eco.ia[i*2+1]&15;if(eco.sp[i]===1&&net.np[v]===P.k){wardens++;if(j===G.JOB.edge||j===G.JOB.patrol)atKerb++;}}return {inside,wardens,atKerb};};
  const avg=(from,to,events={},each=null)=>{const acc={inside:0,wardens:0,atKerb:0};let n=0;for(let k=from;k<to;k++){if(events[k])eco.influence(events[k]);eco.step();if(each)each();if(k%20===0){const c=census();for(const x in acc)acc[x]+=c[x];n++;}}for(const x in acc)acc[x]/=n;return acc;};
  const before=avg(0,1200),during=avg(1200,2400,{1200:{kind:'disturb',site:'g1',amount:.8}}),after=avg(2400,3800,{2400:{kind:'recover',site:'g1',amount:.8}},()=>{let g=0,c=0;
    for(let i=0;i<eco.capacity;i++){if(!awake(i)||eco.sp[i]!==1)continue;const st=eco.ia[i*2+1];if(!(st>>4&4)||(st>>8)!==hubT)continue;const j=st&15;if(j===G.JOB.linger)g++;if(j===G.JOB.up)c++;}
    gathered=Math.max(gathered,g);climbing=Math.max(climbing,c);});
  const late=avg(3800,4400);
  console.log(`# after the recovery: up to ${gathered} wardens gathered at the hub's foot, up to ${climbing} climbing together`);
  assert(gathered>=4&&climbing>=4,'the maintenance swarm goes back in together');
  console.log(`# precinct inhabitants before ${before.inside.toFixed(0)}, failing ${during.inside.toFixed(0)}, recovering ${after.inside.toFixed(0)}, later ${late.inside.toFixed(0)}; wardens at its kerb before ${before.atKerb.toFixed(1)}, failing ${during.atKerb.toFixed(1)}, after ${late.atKerb.toFixed(1)}`);
  assert(during.inside<before.inside*.7,'the failing precinct is avoided');
  assert(during.atKerb>before.atKerb+.5*during.wardens,'its maintenance swarm gathers at its kerb');
  assert(late.inside>during.inside*1.2&&late.atKerb<during.atKerb*.2,'traffic returns after the recovery');
});
test('Kerb pulses: traffic along the copings moves in platoons with dark gaps between them, not as an evenly filled ring',async()=>{
  const m=await city(RING);
  // Each way round each kerb: the gaps between successive inhabitants along it. In a platoon: a gap under 0.7 units;
  // dark: the share of the ring in gaps over 2.5 units.
  async function platoons(pulses){const {G,net,eco,awake}=await ecosystem(m,{seed:6,opts:{pulses},params:{density:1.6}});let close=0,gaps=0,dark=0,nb=0;
    for(let k=0;k<3000;k++){eco.step();if(k<600||k%10)continue;
      for(const q of net.precs)for(const dir of [0,1]){const th=[];
        for(let i=0;i<eco.capacity;i++){if(!awake(i))continue;const d=eco.ia[i*2],e=d>>1;if(net.ek[e]!==G.EDGE.kerb||net.np[net.ea[e]]!==q.k||(d&1)!==dir)continue;
          const dx=eco.px[i]-q.cx,dz=eco.pz[i]-q.cz;th.push(Math.atan2((-dx*q.sa+dz*q.ca)/q.rz,(dx*q.ca+dz*q.sa)/q.rx));}
        if(th.length<4)continue;th.sort((a,b)=>a-b);nb++;
        th.forEach((t,j)=>{const g=((j+1<th.length?th[j+1]:th[0]+2*Math.PI)-t)*q.perim/(2*Math.PI);gaps++;if(g<.7)close++;if(g>2.5)dark+=g/q.perim;});}}
    return {close:close/gaps,dark:dark/nb,nb};}
  const on=await platoons(true),off=await platoons(false);
  console.log(`# kerb traffic: in a platoon ${(100*on.close).toFixed(0)} % (without pulses ${(100*off.close).toFixed(0)} %), ring in dark gaps ${(100*on.dark).toFixed(0)} % (${(100*off.dark).toFixed(0)} %), ${on.nb} samples`);
  assert(on.nb>500,'kerbs carry traffic');assert(on.close>off.close+.03&&on.dark>off.dark+.05,'the kerb traffic bunches into platoons with dark gaps');
});
test('Lifecycles and state: bounded population, valid routes, exact snapshots; the staff grows with the city',async()=>{
  const m=await city(RING);const {G,net,eco,awake,grammar}=await ecosystem(m,{seed:5});
  let maxAge=0;
  for(let k=0;k<6000;k++){eco.step();if(k%50)continue;let n=0;
    for(let i=0;i<eco.capacity;i++){if(!eco.alive[i])continue;assert(eco.age[i]<=eco.life[i]+3*20,'a lifetime ends');maxAge=Math.max(maxAge,eco.age[i]);if(!awake(i))continue;n++;
      assert(Number.isFinite(eco.px[i])&&Number.isFinite(eco.py[i])&&Number.isFinite(eco.pz[i]));const d=eco.ia[i*2];assert(d>=0&&d<net.m*2,'on a route');}
    assert(n<=eco.capacity&&n>=Math.round(eco.capacity*net.awake*.85),`awake ${n}`);}
  const st=eco.stats();assert(st.alive<=eco.capacity);
  // Snapshots carry the route state: restoring gives back exactly the same future.
  const snap=eco.snapshot();for(let k=0;k<200;k++)eco.step();const want=eco.digest();eco.restore(snap);for(let k=0;k<200;k++)eco.step();assert.equal(eco.digest(),want);
  // A larger city wakes more of the staff.
  const big=await city({centres:{a:[0,0],b:[7,-1],c:[6,6],d:[-1,7],e:[13,-2],f:[12,5]}}),G2=G.createCathedralGrammar({capacity:4000});assert(G2.networkAt(big,T1).awake>G2.networkAt(m,T1).awake);void grammar;
});
test('On the canonical timeline: the same moment after continuous play, after seeks, and in a fresh session with a fresh grammar',async()=>{
  const [,G,,,{createLifeDriver},{createLifeTimeline}]=await load();const score=require('../public/score.js');
  // A city founded window by window: one precinct per window, a failure and a recovery.
  const g=graph(RING),entries=[];const groups=Object.keys(RING.centres);
  for(let k=0;k<12;k++){const start=T0+k*10000,end=start+10000,gi=Math.min(k,3),gid=groups[gi];
    const nodes=k<4?g.nodes.filter(n=>n.id===gid||n.group===gid||(n.parent&&n.parent.startsWith(gid+'_'))):[];
    const edges=k===3?g.edges:[];
    const intents=[];if(k===6)intents.push({v:1,id:'f',type:'validation.failed',ts:start+2000,tier:2,magnitude:.6,evidence:'verified',subject:{groupId:'g1'},detail:{}});
    if(k===9)intents.push({v:1,id:'r',type:'validation.recovered',ts:start+2000,tier:3,magnitude:.6,evidence:'verified',subject:{groupId:'g1'},detail:{}});
    entries.push({seq:k,start,end,frame:{start,end,chapter:1,controls:{energy:.4,tension:.1}},graph:k===0?{keyframe:true,nodes,edges:[]}:{add:nodes,remove:[],addEdges:edges,removeEdges:[]},intents});}
  const player=(o={})=>{const timeline=createLifeTimeline();timeline.prime(entries);const grammar=G.createCathedralGrammar({axisAz:.4,...o});
    const driver=createLifeDriver({grammar,timeline,seed:99,config:()=>({speed:1,tempo:96,epoch:T0,params:{},film:true}),score});return {driver,at:t=>driver.update({tview:(t-T0)/1000})};};
  const AT=T0+113300;const ref=player();ref.at(AT);const want=ref.driver.digest();
  const cont=player();for(let t=T0;t<AT;t+=1000/30)cont.at(t);cont.at(AT);assert.equal(cont.driver.digest(),want,'continuous play');
  const seek=player();seek.at(T0+60000);seek.at(T0+20000);seek.at(AT+15000);seek.at(AT);assert.equal(seek.driver.digest(),want,'seeks back and forth');
  // The network comes with the habitat (the driver re-supplies it after every restore): a grammar that keeps no cache
  // at all restores checkpoints after seeks to exactly the same state (no checkpoint ever finds its network missing).
  const bare=player({cacheMax:0});bare.at(T0+90000);bare.at(T0+30000);bare.at(AT);assert.equal(bare.driver.digest(),want,'no network cache: same state');
  assert(bare.driver.stats().fromCheckpoint>0,'a checkpoint was restored');
  assert(ref.driver.stats().ecosystem.alive>100);
});
test('Convoys: each shaft gate lets climbers up in short processions with clear gaps (not an evenly filled column)',async()=>{
  const m=await city(RING);
  // Headways (ticks) between successive inhabitants entering hub shafts from the foot, with and without the gates.
  async function headways(gates){const {G,net,eco,awake}=await ecosystem(m,{seed:4,opts:{gates}});
    const first=new Set();for(const h of net.hubs){const tw=net.towers[h.tower];const v=tw.dock[tw.shaft];for(let q=net.adjOff[v];q<net.adjOff[v+1];q++){const d=net.adj[q],e=d>>1;if(net.ek[e]===G.EDGE.shaft)first.add((net.ea[e]===v?0:1)|e<<1);}}
    const was=new Uint8Array(eco.capacity),last=new Map(),gaps=[];
    for(let k=0;k<4000;k++){eco.step();for(let i=0;i<eco.capacity;i++){const on=awake(i)&&first.has(eco.ia[i*2]);if(on&&!was[i]&&k>400){const d=eco.ia[i*2];if(last.has(d))gaps.push(k-last.get(d));last.set(d,k);}was[i]=on?1:0;}}
    return gaps;}
  const on=await headways(true),off=await headways(false);
  // Gated, the headways are short (inside a convoy) or long (between two openings), rarely in between; ungated they
  // spread evenly (arrivals as they come). (Spawning at a hub's foot can still put one on a shaft at any time.)
  const share=(g,lo,hi)=>g.filter(x=>x>=lo&&x<=hi).length/g.length,mid=g=>share(g,14,40);
  console.log(`# climbers entering hub shafts: gated ${on.length} (in a convoy ${(100*share(on,1,13)).toFixed(0)} %, in between ${(100*mid(on)).toFixed(0)} %), ungated ${off.length} (${(100*share(off,1,13)).toFixed(0)} %, ${(100*mid(off)).toFixed(0)} %)`);
  assert(on.length>30,'the shafts are climbed');assert(mid(on)<mid(off)*.5,'gated arrivals come in convoys with gaps between them');
});

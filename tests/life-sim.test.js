'use strict';
// Digital life, the ecosystem itself (public/worlds/life/sim.js): direct evidence that the behaviour we claim is in
// the simulation. Each property is shown by comparing the same initial state with and without one cause: an
// attractor, a repulsive region, neighbours, field feedback. Then numerical stability and bounded lifecycles.
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../public/worlds/life/sim.js');
const BOUNDS={min:[-20,0,-20],max:[20,8,20]};
// One entity species with every social and field behaviour off unless a test turns it on.
const lone=(extra={})=>({name:'probe',share:1,sep:0,ali:0,coh:0,seek:0,orbit:0,curiosity:0,trail:0,deposit:0,carryDeposit:0,energyDeposit:0,flow:0,push:0,avoid:0,wander:0,
  life:[1e6,1e6],metabolism:0,restBelow:-1,disturbBelow:99,minSpeed:0,yMin:-1e9,yMax:1e9,...extra});
async function eco(spec){const {createEcosystem}=await load();return createEcosystem({seed:7,capacity:1,trail:4,bounds:BOUNDS,field:{nx:40,nz:40},...spec});}
const place=(e,i,[x,y,z],[u,v,w]=[0,0,0])=>{e.px[i]=e.qx[i]=x;e.py[i]=e.qy[i]=y;e.pz[i]=e.qz[i]=z;e.vx[i]=u;e.vy[i]=v;e.vz[i]=w;};
const dist=(e,i,[x,y,z])=>Math.hypot(e.px[i]-x,e.py[i]-y,e.pz[i]-z);
test('A. Autonomous motion: an entity keeps its momentum, turns only through bounded acceleration and never exceeds its speed',async()=>{
  const {DT}=await load();
  const e=await eco({species:[lone({maxSpeed:2,maxForce:1,mass:1,drag:0,seek:1})]});
  e.setSites([{id:'s',x:10,y:4,z:0,r:.5,w:1}]);e.populate();place(e,0,[-10,4,0],[0,0,1.5]);
  // Moving along +z, with a target along +x: the velocity changes by at most maxForce/mass * dt per tick.
  e.tgt[0]=0;e.setMode(0,1);let prev=[e.vx[0],e.vy[0],e.vz[0]],maxDv=0,maxV=0;
  for(let k=0;k<200;k++){e.step();const v=[e.vx[0],e.vy[0],e.vz[0]];maxDv=Math.max(maxDv,Math.hypot(v[0]-prev[0],v[1]-prev[1],v[2]-prev[2]));maxV=Math.max(maxV,Math.hypot(...v));prev=v;}
  assert(maxDv<=1*DT*1.0001+1e-6,`velocity change per tick ${maxDv} exceeds the force bound ${DT}`);
  assert(maxV<=2*1.0001,`speed ${maxV} exceeds the maximum`);
  // Inertia: with no force at all the entity coasts in a straight line.
  const f=await eco({species:[lone({drag:0})]});f.populate();place(f,0,[0,4,0],[.5,0,.25]);for(let k=0;k<40;k++)f.step();
  assert(Math.abs(f.px[0]-.5*40*DT)<1e-4&&Math.abs(f.pz[0]-.25*40*DT)<1e-4,'coasting is uniform motion');
  // A heavier entity turns more slowly under the same force.
  const turn=async mass=>{const g=await eco({species:[lone({mass,maxSpeed:3,maxForce:2,drag:0,seek:1})]});g.setSites([{id:'s',x:10,y:4,z:0,r:.5,w:1}]);g.populate();place(g,0,[0,4,0],[0,0,1]);g.tgt[0]=0;g.setMode(0,1);for(let k=0;k<20;k++)g.step();return g.vx[0];};
  assert((await turn(1))>(await turn(4))*1.5,'mass is inertia');
});
test('B. Attraction and repulsion: an attractor bends the trajectory toward it; a repulsive region is avoided',async()=>{
  const run=async({site,disturb})=>{const e=await eco({species:[lone({maxSpeed:1.5,maxForce:2,seek:site?1.2:0,avoid:disturb?3:0,drag:0})]});
    // The repulsive region: a strained site (a failing subsystem) on the free path; it is never targeted.
    e.setSites([{id:'s',x:6,y:4,z:6,r:1,w:1},{id:'strained',x:0,y:4,z:-6,r:1,w:1}]);e.populate();place(e,0,[-6,4,-5.7],[1,0,0]);
    if(site){e.tgt[0]=0;e.setMode(0,1);}if(disturb)e.influence({kind:'disturb',site:'strained',radius:1.5,amount:1});
    const path=[];for(let k=0;k<160;k++){e.step();path.push([e.px[0],e.pz[0]]);}return {e,path};};
  const free=await run({}),drawn=await run({site:true});
  assert(dist(drawn.e,0,[6,4,6])<dist(free.e,0,[6,4,6])-5,'the attractor pulls the entity toward it');
  // The free entity passes 0.3 from the region's centre (it moves along z = -5.7); with the region it swerves.
  const pushed=await run({disturb:true});
  const closest=p=>Math.min(...p.path.map(([x,z])=>Math.hypot(x-0,z+6)));
  assert(closest(free)<.35,'without the region the path passes by its centre');
  assert(closest(pushed)>closest(free)+.5,`the repulsive region is avoided (closest ${closest(pushed).toFixed(2)})`);
});
test('C. Neighbour interaction: the same entity moves differently when neighbours are present (separation, alignment, cohesion)',async()=>{
  const {createEcosystem}=await load();
  const make=(n,{sep=1.6,ali=.8,coh=.6}={})=>{const e=createEcosystem({seed:3,capacity:n,trail:4,bounds:BOUNDS,field:{nx:40,nz:40},
    species:[lone({sep,ali,coh,radius:3,sepRadius:1,maxSpeed:1.5,maxForce:3,drag:0})]});e.populate();
    for(let i=0;i<n;i++)place(e,i,[i*.6,4,(i%3)*.5],[i?(i%2?1:-1):0,0,i?.5:0]);return e;};
  const solo=make(1),flock=make(8);for(let k=0;k<60;k++){solo.step();flock.step();}
  assert.equal(solo.px[0],0,'alone, with no other force, it stays put');
  assert(Math.hypot(flock.px[0],flock.pz[0])>.05,'with neighbours, entity 0 moves');
  // Alignment: velocities converge (their spread shrinks) only when alignment is on.
  const spread=e=>{let mx=0,mz=0;for(let i=0;i<e.capacity;i++){mx+=e.vx[i];mz+=e.vz[i];}mx/=e.capacity;mz/=e.capacity;let s=0;for(let i=0;i<e.capacity;i++)s+=Math.hypot(e.vx[i]-mx,e.vz[i]-mz);return s/e.capacity;};
  const aligned=make(8,{sep:0,coh:0,ali:1.5}),unaligned=make(8,{sep:0,coh:0,ali:0});const s0=spread(aligned);
  for(let k=0;k<60;k++){aligned.step();unaligned.step();}
  assert(spread(aligned)<s0*.3&&spread(unaligned)>s0*.9,`alignment converges headings (${s0.toFixed(2)} -> ${spread(aligned).toFixed(2)}; without: ${spread(unaligned).toFixed(2)})`);
  // Separation keeps personal space: the closest pair ends farther apart than without it.
  // (mean distance to the nearest neighbour over the last two seconds of a gathering held by cohesion)
  const nearest=e=>{let s=0;for(let i=0;i<e.capacity;i++){let m=Infinity;for(let j=0;j<e.capacity;j++)if(j!==i)m=Math.min(m,Math.hypot(e.px[i]-e.px[j],e.py[i]-e.py[j],e.pz[i]-e.pz[j]));s+=m;}return s/e.capacity;};
  const gather=sep=>{const e=createEcosystem({seed:3,capacity:8,trail:4,bounds:BOUNDS,field:{nx:40,nz:40},species:[lone({sep,ali:0,coh:1.2,radius:3,sepRadius:1,maxSpeed:1.5,maxForce:3,drag:1})]});e.populate();
    for(let i=0;i<8;i++)place(e,i,[(i%4)*1.2,4,(i>>2)*1.2]);let m=0;for(let k=0;k<200;k++){e.step();if(k>=160)m+=nearest(e)/40;}return m;};
  const tight=gather(0),spaced=gather(2);
  assert(spaced>tight*1.5,`separation keeps personal space (nearest neighbour ${spaced.toFixed(2)} vs ${tight.toFixed(2)} without)`);
});
test('D. Field feedback: deposits change the shared field, the changed field changes another entity, and disabling deposits restores the old path',async()=>{
  const {createEcosystem,CH}=await load();
  // A leader crosses in front of a follower and lays a trail; the follower only reads the trail.
  const run=deposit=>{const e=createEcosystem({seed:5,capacity:2,trail:4,bounds:BOUNDS,field:{nx:80,nz:80,decay:{trail:.998}},
    species:[lone({name:'leader',share:.5,deposit,trail:0}),lone({name:'follower',share:.5,trail:2.5,maxSpeed:1,maxForce:2,drag:0})],params:{}});
    e.populate();place(e,0,[-10,4,0],[1.5,0,0]);place(e,1,[-10,4,3],[1,0,0]);
    // The follower explores (mode 0 reads the trail); the leader lays its path for 6 s first.
    for(let k=0;k<120;k++)e.step();const before=e.sample(CH.trail,-5,0);
    const ys=[];for(let k=0;k<160;k++){e.step();ys.push(e.pz[1]);}return {e,before,ys};};
  const on=run(.25),off=run(0);
  assert(on.before>.05&&off.before===0,'the leader\'s movement deposited a trail only when deposits are on');
  const meanZ=r=>r.ys.slice(-40).reduce((a,b)=>a+b,0)/40;
  assert(Math.abs(meanZ(off)-3)<.05,'without the trail the follower holds its line');
  assert(meanZ(on)<2.2,`with the trail the follower is drawn toward the leader's path (z ${meanZ(on).toFixed(2)})`);
  // The field retains the change (decays slowly) and stays bounded.
  const data=on.e.field.data;let max=0;for(const v of data)max=Math.max(max,v);assert(Number.isFinite(max)&&max<=4.0001,'fields saturate');
});
test('D2. Collective feedback: momentum deposited by a moving group carries a passive drifter that never touches it',async()=>{
  const {createEcosystem}=await load();
  const run=push=>{const e=createEcosystem({seed:9,capacity:13,trail:4,bounds:BOUNDS,field:{nx:40,nz:40,decay:{flow:.995}},
    species:[lone({name:'school',share:12/13,push,ali:.5,radius:2,maxSpeed:2}),lone({name:'drifter',share:1/13,flow:2,maxSpeed:2,maxForce:3})]});
    e.populate();for(let i=0;i<12;i++)place(e,i,[-12+(i%4)*.5,4,-1+(i>>2)*.5],[1.8,0,0]);place(e,12,[-2,4,6],[0,0,0]);
    for(let k=0;k<200;k++)e.step();return e.px[12];};
  const moved=run(.6),still=run(0);
  assert(Math.abs(still+2)<1e-6,'with no momentum deposited the drifter stays');
  assert(moved>-2+.3,`the school's wake moved the drifter (dx ${(moved+2).toFixed(2)})`);
});
test('E. Numerical stability: hours of extreme parameters stay finite, bounded and below every speed limit',async()=>{
  const {createEcosystem,MAX_SITES}=await load();
  const e=createEcosystem({seed:11,capacity:300,trail:6,bounds:BOUNDS,field:{nx:32,nz:32},params:{density:2,vitality:2,collective:2,environment:2,trails:2,attraction:2,repulsion:2,separation:2,alignment:2,cohesion:2,current:2,persistence:2,diffusion:2,radius:2},
    species:[{name:'a',share:.5,crowd:2,deposit:.5,push:.5,congestion:.5,congestionAbove:1},{name:'b',share:.5,settle:.05,flow:3}],relations:[[null,{avoid:3}],[{chase:3},null]],
    hooks:{current(x,y,z,t,c,out){out[0]=Math.sin(z*.3+t)*3;out[2]=Math.cos(x*.3-t)*3;}}});
  e.setSites(Array.from({length:MAX_SITES+10},(_,k)=>({id:`s${k}`,x:Math.cos(k)*15,y:4,z:Math.sin(k)*15,r:1,w:1+k%3})));e.populate();
  for(let k=0;k<20*60*5;k++){
    if(k%50===0)e.influence({kind:['disturb','lasting','reorganize','nourish','recover','pulse'][k/50%6],site:`s${k%40}`,amount:1});
    e.step();
  }
  let maxV=0;const sp=e.species;
  for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;for(const a of [e.px,e.py,e.pz,e.vx,e.vy,e.vz])assert(Number.isFinite(a[i]));
    maxV=Math.max(maxV,Math.hypot(e.vx[i],e.vy[i],e.vz[i])/sp[e.sp[i]].maxSpeed);}
  assert(maxV<=1.41*1.0001*1.3,'no entity beyond its (dispersal) speed limit');
  for(const v of e.field.data)assert(Number.isFinite(v)&&Math.abs(v)<=4.0001);
  assert(e.sites.count<=MAX_SITES,'sites are bounded');
  for(let k=0;k<e.sites.count;k++){const st=e.sites.state(k);for(const v of Object.values(st))assert(Number.isFinite(v)&&v>=0&&v<=3);}
});
test('E2. Bounded lifecycles: entities appear, depart and their slots are reused; the population never exceeds capacity',async()=>{
  const {createEcosystem,HZ}=await load();
  const e=createEcosystem({seed:2,capacity:60,trail:4,bounds:BOUNDS,field:{nx:16,nz:16},species:[{name:'short',share:1,life:[3,6],fade:.5,respawn:[.5,1]}]});
  e.populate();const gen0=Array.from(e.gen);let peak=0,departed=0,wasAlive=Array.from(e.alive);
  for(let k=0;k<HZ*60;k++){e.step();let n=0;for(let i=0;i<60;i++){n+=e.alive[i];if(wasAlive[i]&&!e.alive[i])departed++;}wasAlive=Array.from(e.alive);peak=Math.max(peak,n);}
  assert(peak<=60,'never more than capacity');assert(departed>100,`entities depart (${departed} departures in a minute)`);
  assert(Array.from(e.gen).every((g,i)=>g>gen0[i]+3),'every slot was reused by new generations (stable slot, new identity)');
});
test('Snapshots restore exactly the same future (the digest of the whole state)',async()=>{
  const {createEcosystem}=await load();
  const e=createEcosystem({seed:4,capacity:200,trail:6,bounds:BOUNDS,field:{nx:32,nz:32},species:[{name:'a',share:.6},{name:'b',share:.4,flow:1,settle:.01}],
    hooks:{current(x,y,z,t,c,out){out[0]=Math.sin(t*.1);}}});
  e.setSites([{id:'a',x:5,y:3,z:5,r:1.5,w:1},{id:'b',x:-5,y:3,z:-2,r:1,w:1}]);e.populate();
  for(let k=0;k<300;k++)e.step();const s=e.snapshot();
  for(let k=0;k<400;k++){if(k===100)e.influence({kind:'disturb',site:'a',amount:.8});e.step();}const d1=e.digest();
  e.restore(s);for(let k=0;k<400;k++){if(k===100)e.influence({kind:'disturb',site:'a',amount:.8});e.step();}
  assert.equal(e.digest(),d1);
});
test('Site indices a grammar keeps (siteSlots) follow their sites when the habitat changes; a vanished site becomes -1',async()=>{
  const e=await eco({capacity:3,species:[lone()],siteSlots:[0]});
  e.setSites([{id:'b',x:0,y:4,z:0,r:1,w:1},{id:'c',x:4,y:4,z:0,r:1,w:1}]);e.populate();
  e.ia[0]=0;e.ia[2]=1;e.ia[4]=-1;e.ia[1]=5;            // entity 0 -> 'b', entity 1 -> 'c', entity 2 -> none; slot 1 is not a site
  e.setSites([{id:'a',x:-4,y:4,z:0,r:1,w:1},{id:'c',x:4,y:4,z:0,r:1,w:1}]);   // 'a' sorts first, 'b' is gone
  assert.equal(e.ia[0],-1,"'b' vanished");assert.equal(e.sites.ids[e.ia[2]],'c',"still 'c'");assert.equal(e.ia[4],-1);assert.equal(e.ia[1],5,'other slots untouched');
});

'use strict';
// Fractal Continuum's digital life (public/worlds/life/fractal.js): the map of the surface (the sphere of directions,
// an azimuthal equidistant chart around the pole), a habitat that is a pure function of the model and the time and sits
// at the world's own directions, gatherings at active sites, a void over a strained site and the return after its
// recovery, bounds and bounded lifecycles, and influences that change trajectories. Driver determinism, quality and the
// world with life off: tests/life-fractal-driver.test.js. Shared fixture: tests/life-fractal-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,RECIPE,graph,setup,run,near}=require('./life-fractal-fixture');
test('The map: a direction and its point of the plane are one (round trip), arcs from the pole keep their length, the seam is out of reach',async()=>{
  const {life}=await setup();let worst=0;
  for(let k=0;k<4000;k++){const y=1-2*(k+.5)/4000,s=Math.sqrt(1-y*y),a=k*2.39996,u=[Math.cos(a)*s,y,Math.sin(a)*s],p=life.toMap(u),v=life.toDir(p[0],p[2]);
    worst=Math.max(worst,Math.hypot(u[0]-v[0],u[1]-v[1],u[2]-v[2]));
    // the distance from the plane's origin is the arc from the pole (K per radian)
    assert(Math.abs(Math.hypot(p[0],p[2])-life.K*Math.acos(y))<1e-9);}
  assert(worst<1e-12,`round trip ${worst}`);
  assert.deepEqual(life.toDir(0,0),[0,1,0],'the plane\'s origin is the pole');
  assert(Math.abs(life.stretch(life.K*Math.PI/2,0)-Math.PI/2)<1e-9,'the stretch across the arcs at the equator: pi / 2');
  // the life's reach: 135 degrees from the pole, the fields' square inside the seam (the south pole: the rim, at pi K)
  assert(Math.abs(life.SOFT/life.K-2.35)<1e-12);assert(life.FIELD<Math.PI*life.K-2);
});
test('The habitat is a pure function of the model and the time; its sites are the world\'s own regions and files, at their directions',async()=>{
  const {life,forms,model,grammar,mdl}=await setup();const t=T0+60000;
  const a=grammar.habitat(model,t);assert.deepEqual(grammar.habitat(model,t),a,'same model, same moment');
  const other=mdl.createModel({speed:1,tempo:96});other.reset(graph(),T0);assert.deepEqual(grammar.habitat(other,t),a,'another model holding the same structure');
  // the world's layout (fractal-forms.js layoutAt): each region and each file at its own direction (to the rounding)
  const lc=forms.layoutConfig(RECIPE),lay=forms.layoutAt(model,t,lc,forms.regionSlots(lc.seed));
  const at=s=>life.toDir(s.x,s.z),close=(u,v)=>Math.hypot(u[0]-v[0],u[1]-v[1],u[2]-v[2])<2e-3;
  assert.equal(a.filter(s=>s.kind===1).length,lay.regions.length);assert.equal(a.filter(s=>s.kind!==1).length,lay.sites.length);
  for(const r of lay.regions)assert(close(at(a.find(s=>s.id===r.id)),r.dir),`region ${r.id}`);
  for(const f of lay.sites)assert(close(at(a.find(s=>s.id===f.id)),f.dir),`file ${f.id}`);
  // an event names its file's own site, or its region's when the file has none; a subsystem its region
  assert.equal(grammar.siteOf('m2_1',model),'m2_1');assert.equal(grammar.siteOf('g3',model),'g3');assert.equal(grammar.siteOf('nobody',model),null);
  // cheap enough to run after every recorded window
  const t0=performance.now();for(let k=0;k<20;k++)grammar.habitat(model,t+k);assert((performance.now()-t0)/20<5,'habitat under 5 ms');
});
test('A large project: at most 64 sites (every region, then the most prominent files); the other files give their events to their region',async()=>{
  const {model,grammar,sim}=await setup({nG:9,extra:12});const sites=grammar.habitat(model,T0+60000);
  assert(sites.length<=sim.MAX_SITES,`${sites.length} sites`);assert.equal(sites.filter(s=>s.kind===1).length,9,'every region');
  const own=new Set(sites.filter(s=>s.kind!==1).map(s=>s.id));let mapped=0;
  for(const m of model.modules.values()){const s=grammar.siteOf(m.id,model);assert.equal(s,own.has(m.id)?m.id:m.group);if(!own.has(m.id))mapped++;}
  assert(mapped>0,'some files have no site of their own');
});
test('The life stays on the inhabited surface, in its altitude band; lifecycles are bounded, nothing grows; the state is deterministic',async()=>{
  const {life,eco}=await setup();const e=eco(),f=eco(),S=life.SPECIES_NAMES;
  const quota=[.6,.22].map(s=>Math.floor(e.capacity*s));quota.push(e.capacity-quota[0]-quota[1]);
  for(let round=0;round<6;round++){run(e,500);const per=[0,0,0];let alive=0;
    for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;alive++;per[e.sp[i]]++;
      assert(Number.isFinite(e.px[i]+e.py[i]+e.pz[i]+e.vx[i]+e.vy[i]+e.vz[i]),'finite');
      assert(Math.hypot(e.px[i],e.pz[i])<life.FIELD*1.01,`within the fields (rho ${Math.hypot(e.px[i],e.pz[i]).toFixed(2)})`);
      assert(e.py[i]>=.04-1e-6&&e.py[i]<=1.2+1e-6,`altitude ${e.py[i]}`);assert(e.age[i]<=e.life[i]+5*20,'departs after its lifetime');}
    assert(alive<=e.capacity);per.forEach((n,s)=>assert(n<=quota[s]+1,`${S[s]}: ${n} of ${quota[s]}`));}
  // most of the life is within its reach of the pole (the steering holds it there; the seam is never approached)
  let inside=0,all=0;for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;all++;if(Math.hypot(e.px[i],e.pz[i])<life.SOFT+.6)inside++;}
  assert(inside>all*.97,`${inside} of ${all} within reach`);
  let respawned=0;for(let i=0;i<e.capacity;i++)if(e.gen[i]>1)respawned++;assert(respawned>e.capacity*.3,'slots are reused');
  run(f,3000);assert.equal(f.digest(),e.digest(),'same inputs, same state');
  const snap=e.snapshot();run(e,200);const d1=e.digest();e.restore(snap);run(e,200);assert.equal(e.digest(),d1,'restore gives the same future');
});
test('Motes gather at active sites: a site being worked on (energy, nourishment) draws a gathering that circles it',async()=>{
  const {eco,life}=await setup();const a=eco(),b=eco();const both=n=>{run(a,n);run(b,n);};both(600);
  // the least visited file site within the life's reach
  const S=a.sites;let k=-1;for(let s=0;s<S.count;s++)if(S.kind[s]!==1&&Math.hypot(S.x[s],S.z[s])<life.SOFT-2&&(k<0||S.visits[s]<S.visits[k]))k=s;const id=S.ids[k];
  // edits on one file: a small perturbation and nourishment every few seconds, as the driver gives them
  let na=0,nb=0,circ=0;
  for(let t=0;t<40;t++){a.influence({kind:'pulse',site:id,amount:.6});a.influence({kind:'nourish',site:id,amount:.4});both(40);
    if(t>=10){na+=a.sites.visits[k];nb+=b.sites.visits[k];for(let i=0;i<a.capacity;i++)if(a.alive[i]&&a.sp[i]===life.MOTE&&a.mode[i]===2&&a.tgt[i]===k)circ++;}}
  console.log(`# visits at the active site: ${na.toFixed(0)}, without the work ${nb.toFixed(0)} (circling ${circ})`);
  assert(na>nb*2+20,`the active site draws a gathering: ${na.toFixed(0)} vs ${nb.toFixed(0)}`);assert(circ>60,'they circle it');
});
test('A failing run opens a void over its site and the motes wait at its edge; after the recovery they come back within seconds',async()=>{
  const {eco,life}=await setup();const e=eco(),c=eco();const both=n=>{run(e,n);run(c,n);};both(900);
  const S=e.sites;let k=-1,best=-1;for(let s=0;s<S.count;s++){if(S.kind[s]===1)continue;const n=near(e,s,2.5);if(n>best){best=n;k=s;}}const id=S.ids[k],R=S.r[k]*2.4+1.6;
  e.influence({kind:'disturb',site:id,amount:.5});both(100);
  let inE=0,inC=0,edge=0,edgeC=0;for(let t=0;t<10;t++){both(20);inE+=near(e,k,R*.7);inC+=near(c,k,R*.7);edge+=near(e,k,R*1.6)-near(e,k,R);edgeC+=near(c,k,R*1.6)-near(c,k,R);}
  console.log(`# within the void: ${inE} (without the failure ${inC}); at its edge ${edge} (${edgeC})`);
  assert(inE<inC*.35,`the void empties: ${inE} vs ${inC}`);assert(edge>edgeC,`they wait at its edge: ${edge} vs ${edgeC}`);
  assert(e.sites.state(k).stress>.25,'the site is strained');
  const before=near(e,k,R*.7,life.MOTE);e.influence({kind:'recover',site:id,amount:.5});both(200);const after=near(e,k,R*.7,life.MOTE);
  console.log(`# motes within the void's reach: ${before} before the recovery, ${after} ten seconds after`);
  assert(after>=before+8&&after>=2*before,`they come back: ${before} -> ${after}`);assert(e.sites.state(k).revive>.5,'the recovered site draws them for a while');
});
test('Influences change trajectories (and nothing else does): the same ecosystem with and without one event',async()=>{
  const {eco}=await setup();const a=eco(),b=eco(),c=eco();run(a,300);run(b,300);run(c,300);
  assert.equal(a.digest(),b.digest());
  const id=a.sites.ids[3];a.influence({kind:'novelty',site:id,amount:.8});a.influence({kind:'reorganize',site:id,amount:.8});run(a,400);run(b,400);run(c,400);
  assert.notEqual(a.digest(),b.digest(),'an influence changes the state');assert.equal(b.digest(),c.digest(),'without it, the same state');
  let moved=0;for(let i=0;i<a.capacity;i++)if(a.alive[i]&&b.alive[i]&&Math.hypot(a.px[i]-b.px[i],a.pz[i]-b.pz[i])>.5)moved++;
  assert(moved>40,`${moved} inhabitants on other paths`);
});

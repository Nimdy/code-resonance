'use strict';
// Synaptic Storm's digital life (public/worlds/life/synaptic.js): the habitat is a pure function of the model and a time,
// its sites are the neurons where the world draws them and its anchors the synapses where the world's axons arrive;
// events land on their files' neurons; an inhibited neuron is avoided and life returns after the recovery; sentinels
// survey its edge; nourishment draws vesicles; only as many inhabitants are awake as the network hosts; nothing grows
// and the state is exact. The ecosystem on the performance timeline (seeks, checkpoints, frame rates) is in
// tests/life-synaptic-driver.test.js, the world's presentation in tests/life-synaptic-world.test.js. Fixture:
// tests/life-synaptic-fixture.js. Rendering is looked at in the browser (qualification/visual/lab.js).
const test=require('node:test'),assert=require('node:assert/strict');
const {T1,graph,setup,run}=require('./life-synaptic-fixture.js');
test('Habitat: one site per neuron where the world comes to draw its soma, a pure function of the model and the time',async()=>{
  const {model,layout,layoutMod,grammar,life,createModel}=await setup();const t=T1+5000;
  const a=grammar.habitat(model,t);assert.deepEqual(grammar.habitat(model,t),a,'same model and time: same habitat');
  // the same structure in another model (the timeline's shadow model) gives the same habitat
  const other=createModel({});const g=graph();other.applyDelta({keyframe:true,nodes:g.nodes,edges:g.edges},T1-10000,T1);
  assert.deepEqual(grammar.habitat(other,t),a,'another model with the same structure');
  // each site is a neuron, at the settled layout (where the world's eased network comes to rest), in the ecosystem's frame
  const net=layout.networkAt(model,t,true),k=life.frameScale(net.radius),later=layout.networkAt(model,t+4000);
  assert.equal(a.sites.length,net.neurons.length);assert.equal(a.data.k,+k.toFixed(3));
  for(const s of a.sites){const n=net.neurons.find(x=>x.id===s.id),w=later.neurons.find(x=>x.id===s.id);assert(n&&w,s.id);
    for(let c=0;c<3;c++){assert(Math.abs([s.x,s.y,s.z][c]-n.pos[c]*k)<1e-3,`${s.id} at its soma`);assert(Math.abs(w.pos[c]-n.pos[c])<1e-9,`${s.id}: the world's network settles there`);}
    assert.equal(s.kind,n.k===0?1:0,'hubs are their own kind');}
  // anchors: the synapses where axons from other neurons arrive, exactly where the world ends them (its terminal formula)
  const K=layout.cfg.K;let checked=0;
  for(const l of model.links.values()){const fa=net.fileNeuron.get(l.a),fb=net.fileNeuron.get(l.b);if(!fa||!fb||fa.neuron.id===fb.neuron.id)continue;
    const dir=layoutMod.slotDirection(fb.neuron.id,fb.slot,K),tree=layoutMod.dendriteTree(l.b,dir,layout.cfg),lv0=tree.segs.filter(x=>x.level===0),syn=lv0[Math.min(lv0.length-1,1)].b;
    const R=layout.somaRadius(model,fb.neuron,t),p=fb.neuron.pos,want=[0,1,2].map(c=>(p[c]+dir[c]*R*.85+syn[c])*k),list=a.data.anchors[fb.neuron.id];
    let hit=false;for(let j=0;j<list.length;j+=3)if(Math.hypot(list[j]-want[0],list[j+1]-want[1],list[j+2]-want[2])<2e-3)hit=true;assert(hit,`synapse of ${l.a} -> ${l.b}`);checked++;}
  assert(checked>=8,`${checked} synapses checked`);
  // events land on their files' neurons; a subsystem's on its hub
  for(const m of model.modules.values())assert.equal(grammar.siteOf(m.id,model),net.fileNeuron.get(m.id).neuron.id,m.id);
  for(const d of model.districts.values())assert.equal(grammar.siteOf(d.id,model),`${d.id}#0`);
  const t0=performance.now();for(let j=0;j<10;j++)grammar.habitat(model,t+j);assert((performance.now()-t0)/10<25,'habitat under 25 ms');
});
test('A large network keeps at most MAX_SITES sites, every hub among them; the events of a neuron not kept land on its cluster\'s first site',async()=>{
  const {model,grammar,life,layout}=await setup({nG:12,per:26});const h=grammar.habitat(model,T1);
  const net=layout.networkAt(model,T1,true);assert(net.neurons.length>life.MAX_SITES,`${net.neurons.length} neurons`);
  assert.equal(h.sites.length,life.MAX_SITES);const ids=new Set(h.sites.map(s=>s.id));
  for(const c of net.clusters)assert(ids.has(`${c.id}#0`),`hub of ${c.id} kept`);
  let fallback=0;for(const m of model.modules.values()){const s=grammar.siteOf(m.id,model);assert(ids.has(s),`${m.id} lands on a site (${s})`);if(s!==net.fileNeuron.get(m.id).neuron.id){fallback++;assert.equal(s,`${m.group}#0`);}}
  assert(fallback>0,'some files land on their hub');assert(h.data.k<1||net.radius<=life.RN,'a network larger than RN is scaled');
});
// Awake inhabitants of species sp within f0..f1 site radii (3D) of site k.
function within(e,life,k,f0,f1,sp){let n=0;const S=e.sites;for(let i=0;i<e.capacity;i++){if(!e.alive[i]||life.dormant(e,i)||(sp>=0&&e.sp[i]!==sp))continue;
  const d=Math.hypot(e.px[i]-S.x[k],e.py[i]-S.y[k],e.pz[i]-S.z[k])/S.r[k];if(d>=f0&&d<f1)n++;}return n;}
test('An inhibited neuron is avoided (glia and vesicles leave its sphere, sentinels hold at its edge); after the recovery life returns',async()=>{
  // compared with the same ecosystem without the failure
  const {eco,life}=await setup();const e=eco({},8),c=eco({},8);const both=n=>{run(e,n);run(c,n);};both(600);
  const k=e.sites.ids.indexOf('g3#0'),G=life.GLIA,V=life.VESICLE,M=life.MICROGLIA,inner=x=>within(x,life,k,0,2,G)+within(x,life,k,0,2,V);
  assert(inner(c)>30,`a neighbourhood to inhibit (${inner(c)})`);
  e.influence({kind:'disturb',site:'g3#0',amount:.5});both(200);   // a verified failure's strength (the driver's), 10 s
  const ring=x=>within(x,life,k,2.2,3.6,M),inside=x=>within(x,life,k,0,2.2,M);
  console.log(`# inhibited sphere: ${inner(e)} glia and vesicles (${inner(c)} without the failure); sentinels at its edge ${ring(e)} (${ring(c)}), inside ${inside(e)}`);
  assert(inner(e)<inner(c)*.45,`withdrawn: ${inner(e)} vs ${inner(c)}`);
  both(100);assert(ring(e)>=ring(c)+4&&ring(e)>=2*ring(c),`sentinels survey the edge: ${ring(e)} vs ${ring(c)}`);assert(inside(e)<=1,`and stay out (${inside(e)})`);
  e.influence({kind:'recover',site:'g3#0',amount:.5});both(600);
  console.log(`# 30 s after the recovery: ${inner(e)} (${inner(c)})`);assert(inner(e)>inner(c)*.8,`life returns: ${inner(e)} vs ${inner(c)}`);
});
test('Nourishment (new files, passing tests, commits) draws vesicles to a neuron; influences change trajectories, never place an inhabitant',async()=>{
  const {eco,life}=await setup();const a=eco({},9),b=eco({},9);run(a,400);run(b,400);
  let w=0;for(let s=1;s<a.sites.count;s++)if(a.sites.w[s]<a.sites.w[w])w=s;
  const pos=e=>{const out=[];for(let i=0;i<e.capacity;i++)out.push(e.alive[i]?`${e.px[i]},${e.pz[i]}`:'');return out;},p0=pos(a);
  a.influence({kind:'nourish',site:a.sites.ids[w],amount:.6});assert.deepEqual(pos(a),p0,'an influence moves nobody by itself');
  let na=0,nb=0;for(let t=0;t<30;t++){run(a,40);run(b,40);na+=within(a,life,w,0,2,life.VESICLE);nb+=within(b,life,w,0,2,life.VESICLE);a.influence({kind:'nourish',site:a.sites.ids[w],amount:.6});}
  console.log(`# vesicles at a nourished neuron over a minute: ${na}, without ${nb}`);assert(na>nb*1.12,`${na} vs ${nb}`);
  assert.notEqual(a.digest(),b.digest());
});
test('Only as many inhabitants are awake as the network hosts; the dormant sit outside every field and wake as neurons appear',async()=>{
  const {grammar,life,sim,createModel}=await setup();const {lifeScales}=await import('../public/worlds/life/driver.js');
  const small=createModel({});small.applyDelta({keyframe:true,nodes:[{id:'g0',type:'group',order:0,q:0,r:0},{id:'a',type:'module',group:'g0',dir:'d',q:0,r:0,state:'committed',counts:{function:2}}],edges:[]},T1-10000,T1);
  const e=sim.createEcosystem({...grammar.ecosystem({},5),seed:5,params:lifeScales({})});let h=grammar.habitat(small,T1);e.setSiteData(h.data);e.setSites(h.sites);e.populate();run(e,40);
  const awake=()=>{const n=[0,0,0];for(let i=0;i<e.capacity;i++)if(e.alive[i]&&!life.dormant(e,i))n[e.sp[i]]++;return n;};
  const quota=life.SHARES.map(s=>Math.floor(e.capacity*s));
  assert.deepEqual(awake(),[0,1,2].map(s=>Math.min(quota[s],life.hostable(s,1))),'one neuron hosts a few');
  const B=e.field.min[0];
  // (a deposit lands only within half a cell of the field's first cell centre: the corner is outside every field)
  const half=e.field.cw*.45;for(let i=0;i<e.capacity;i++)if(e.alive[i]&&life.dormant(e,i)){assert(e.px[i]<B+half&&e.pz[i]<e.field.min[1]+half,'parked at the corner, outside the fields');}
  // the dormant leave no trace: the fields are what the awake alone would leave (a second ecosystem without the dormant
  // slots is not possible, so: no deposit at the corner cell)
  assert.equal(e.field.data[0],0,'nothing deposited at the corner');
  // the network grows: more wake, born where newcomers are, fading in
  const big=await (async()=>{const {network}=require('./life-synaptic-fixture.js');return network(5,6);})();h=grammar.habitat(big,T1);e.setSiteData(h.data);e.setSites(h.sites);
  run(e,1);const n=awake();assert.deepEqual(n,[0,1,2].map(s=>Math.min(quota[s],life.hostable(s,h.sites.length))),`${h.sites.length} neurons host more`);
  let fresh=0;for(let i=0;i<e.capacity;i++)if(e.alive[i]&&!life.dormant(e,i)&&e.age[i]<=1){fresh++;assert(e.fade[i]<.2,'a woken inhabitant fades in');assert(e.px[i]>B+2,'away from the corner');}
  assert(fresh>100,`${fresh} woken`);
});
test('Nothing grows with time; inhabitants stay finite and in bounds; slots are reused; the state is deterministic',async()=>{
  const {eco,life}=await setup();const e=eco(),f=eco();const quota=life.SHARES.map(s=>Math.floor(e.capacity*s));
  for(let round=0;round<6;round++){run(e,500);const per=[0,0,0],awake=[0,0,0];let alive=0;
    for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;alive++;per[e.sp[i]]++;if(!life.dormant(e,i))awake[e.sp[i]]++;
      assert(Number.isFinite(e.px[i]+e.py[i]+e.pz[i]+e.vx[i]+e.vy[i]+e.vz[i]),'finite');
      assert(Math.abs(e.px[i])<=life.RN*1.3+1e-6&&Math.abs(e.pz[i])<=life.RN*1.3+1e-6&&Math.abs(e.py[i])<=45+1e-6,'in bounds');
      assert(e.age[i]<=e.life[i]+5*20,'departs after its lifetime');}
    assert(alive<=e.capacity);per.forEach((n,s)=>{assert(n<=quota[s]+1,`species ${s}: ${n} of ${quota[s]}`);assert(awake[s]<=life.hostable(s,e.sites.count),`awake ${s}`);});
    const st=e.stats();assert.equal(st.sites,12);}
  let respawned=0;for(let i=0;i<e.capacity;i++)if(e.gen[i]>1)respawned++;assert(respawned>e.capacity*.25,`slots are reused (${respawned})`);
  run(f,3000);assert.equal(f.digest(),e.digest(),'same inputs, same state');
  const snap=e.snapshot();run(e,200);const d1=e.digest();e.restore(snap);run(e,200);assert.equal(e.digest(),d1,'restore gives the same future');
});
test('The tide: a slow circulation about the network\'s heart with an in- and outflow, turned by the climate\'s swing; bounded',async()=>{
  const {eco,grammar}=await setup();const e=eco();run(e,2);const hooks=grammar.ecosystem({},7).hooks;
  // (the grammar's own hooks on this ecosystem: prepared by its tick, as the simulation runs it)
  hooks.tick(e);const out=[0,0,0],at=(x,z,t,swing=0)=>{hooks.current(x,0,z,t,{swing,turb:1},out);return out.slice();};
  let max=0;for(let x=-80;x<=80;x+=10)for(let z=-80;z<=80;z+=10)for(const t of [0,13,40]){const v=at(x,z,t);max=Math.max(max,Math.hypot(...v));}
  assert(max<1&&max>.15,`bounded and present (${max.toFixed(3)})`);
  assert.notDeepEqual(at(20,10,10),at(20,10,38),'it changes over a tide');assert.notDeepEqual(at(20,10,10,0),at(20,10,10,1),'the swing turns it');
});

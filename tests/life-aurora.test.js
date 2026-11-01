'use strict';
// Aurora's digital life (public/worlds/life/aurora.js): the habitat is a pure function of the model and a time, a site
// per curtain on the near ice under its bearing; foxes trot on the shore and the ice and leave tracks that fade, sit to
// look up at a lively curtain (a new one most), hares keep to their spruces, the owl to its perches, the glimmers gather
// under the liveliest curtains; a failing run sends the animals to shelter and empties the strained site's light, the
// recovery revives it (the owl climbs into the sky, the foxes come out to look up, the light comes back); events change
// trajectories only through the driver's influences; nothing grows with time. Determinism on the driver is in
// tests/life-aurora-driver.test.js, the world's presentation in tests/life-aurora-world.test.js; the shared fixture is
// tests/life-aurora-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {load,T0,T1,graph,network,setup,run,identity}=require('./life-aurora-fixture');
const hyp=(a,b)=>Math.sqrt(a*a+b*b);
test('The habitat is a pure function of the model and the time: a site per curtain, on the near ice under its bearing',async()=>{
  const X=await setup(),{L,grammar,model}=X,[{createModel},,life]=await load(),t=T1+3000;
  const h=grammar.habitat(model,t);assert.deepEqual(grammar.habitat(model,t),h,'same model and time: the same sites');
  const other=createModel({speed:1,tempo:92});const g=graph();other.applyDelta({keyframe:true,nodes:g.nodes,edges:g.edges},T0,T1);
  assert.deepEqual(grammar.habitat(other,t),h,'another model with the same structure: the same sites');
  const cfg=L.layoutConfig(X.rec),cs=L.curtainsAt(L.prepare(model),t+L.EASE,cfg),S=grammar.shore.S;
  assert.deepEqual(h.map(s=>s.id),cs.map(c=>c.id),'one site per curtain, by the curtain\'s own id (the subsystem: events land on it)');
  const bearing=s=>Math.atan2(s.x,life.CAM[1]-s.z),dist=s=>hyp(s.x,life.CAM[1]-s.z);
  for(const s of h){const c=cs.find(q=>q.id===s.id);
    assert(Math.abs(L.landHeight(S,s.x,s.z)+.35)<1e-9,`${s.id} on the open ice`);assert.equal(s.y,life.ICE_Y,'under the ice');
    assert(dist(s)>=14&&dist(s)<=40,`${s.id} on the near ice (${dist(s).toFixed(1)} units from the shore)`);
    assert(Math.sign(bearing(s))===Math.sign(c.az)||Math.abs(c.az)<1e-9,`${s.id} under its curtain's bearing`);}
  // the curtains' order across the sky is kept, and a nearer curtain's light lies nearer the shore
  const byAz=cs.slice().sort((a,b)=>a.az-b.az).map(c=>c.id),bySite=h.slice().sort((a,b)=>bearing(a)-bearing(b)).map(s=>s.id);assert.deepEqual(bySite,byAz);
  const near=cs.reduce((a,b)=>a.R<b.R?a:b),far=cs.reduce((a,b)=>a.R>b.R?a:b);assert(dist(h.find(s=>s.id===near.id))<dist(h.find(s=>s.id===far.id)));
  // a curtain grows into its site with its first file, and a bigger subsystem is a stronger site
  const w=id=>h.find(s=>s.id===id).w;assert(w('g3')>w('g0')*.6);
  // more than 64 subsystems: the strongest 64 are kept by the ecosystem; the habitat is cheap enough for every window
  const big=createModel({speed:1,tempo:92}),gb=graph(70,1);big.applyDelta({keyframe:true,nodes:gb.nodes,edges:gb.edges},T0,T1);
  const hb=grammar.habitat(big,t);assert(hb.length>=64);for(const s of hb)assert(Math.abs(L.landHeight(S,s.x,s.z)+.35)<1e-9);
  const t0=performance.now();for(let k=0;k<10;k++)grammar.habitat(model,t+k*1000);assert((performance.now()-t0)/10<8,'habitat under 8 ms');
  // the shore: its path on the point's land at the lake's edge, spruces and perches from the recipe's own layout
  const sh=grammar.shore;assert(sh.SHORE.length>=8&&sh.SHORE.every(p=>L.landHeight(S,p[0],p[1])>-.1),'the shore path on the land');
  assert.deepEqual(sh.TREES,L.sprucesOf(S,X.rec.projectSeed,X.rec.genome.land?.trees??1).filter(t=>Math.abs(t[0])<140&&t[2]<-40));
  assert.equal(sh.PERCH.length,sh.TREES.length+2,'a perch on each spruce\'s top, the roof\'s ridge and the chimney');
});
test('Foxes trot on the shore and the ice in front of it, leave tracks that fade, and sit to look up; hares keep to their spruces; the owl to its perches',async()=>{
  const X=await setup(),e=X.eco({ecology:2,music:1}),[,,life]=await load(),{TREES,PERCH,landAt}=X.grammar.shore;
  run(e,400);let inView=0,near=0,foxes=0,looked=0,onHares=0,hares=0,perched=0,owlN=0;
  for(let k=0;k<40;k++){run(e,40);
    for(let i=0;i<e.capacity;i++){if(!e.alive[i]||e.fade[i]<1)continue;const s=e.sp[i],x=e.px[i],z=e.pz[i];
      if(s===life.FOX){foxes++;const d=hyp(x,life.CAM[1]-z);if(Math.abs(x/(life.CAM[1]-z))<.9&&d<160)inView++;if(d<60)near++;if(e.mode[i]===5&&(e.ia[i*2]&life.LOOK))looked++;}
      else if(s===life.HARE){hares++;const T=TREES[e.ia[i*2+1]];if(T&&hyp(T[0]-x,T[2]-z)<16&&landAt(x,z)>0)onHares++;}
      else if(s===life.OWL){owlN++;if(e.mode[i]===5&&PERCH.some(p=>hyp(p[0]-x,p[2]-z)<1.5&&Math.abs(p[1]-e.py[i])<1.3))perched++;}}}
  console.log(`# foxes in the view's fan ${(inView/foxes).toFixed(2)}, within 60 units ${(near/foxes).toFixed(2)}, sitting to look up ${(looked/foxes).toFixed(2)}; hares by their spruce ${(onHares/hares).toFixed(2)}; owl perched ${(perched/owlN).toFixed(2)}`);
  assert(inView>.6*foxes,'the foxes are mostly where the camera looks');assert(near>.45*foxes,'and often near the shore');assert(looked>0,'some sit to look up');
  assert(onHares>.85*hares,'hares keep to their spruces, on the land');assert(perched>.5*owlN,'the owl sits on a perch most of the time');
  // tracks: the trail field lies where the foxes walked and fades after they have gone
  const F=e.field,NC=F.nx*F.nz;let total=0;for(let q=0;q<NC;q++)total+=F.data[q];assert(total>5,'tracks in the snow');
  const quiet=X.eco({density:0}),Q=quiet.field;quiet.disc(0,0,-30,4,2);let a=0;for(let q=0;q<NC;q++)a+=Q.data[q];run(quiet,1200);let b=0;for(let q=0;q<NC;q++)b+=Q.data[q];
  assert(b<a*.6&&b>0,`tracks fade (${a.toFixed(2)} -> ${b.toFixed(2)} in a minute)`);
});
test('A new curtain draws the foxes\' eyes; the glimmers gather under the liveliest curtains',async()=>{
  const X=await setup(),e=X.eco({},5),c=X.eco({},5),both=n=>{run(e,n);run(c,n);},[,,life]=await load();both(600);
  const S=e.sites,ids=[...S.ids],visits=eco=>ids.map((_,k)=>eco.sites.visits[k]);
  // the glimmers: more under the liveliest (strongest) site than under the weakest
  let v=ids.map(()=>0);for(let k=0;k<20;k++){both(20);visits(c).forEach((x,j)=>v[j]+=x);}
  const strong=ids.map((_,k)=>S.w[k]),hi=strong.indexOf(Math.max(...strong)),lo=strong.indexOf(Math.min(...strong));
  console.log(`# glimmers per site ${v.map(x=>(x/20).toFixed(1)).join(', ')} (weights ${strong.map(x=>x.toFixed(2)).join(', ')})`);
  assert(v[hi]>v[lo],'more under the stronger curtain');assert(v.reduce((a,b)=>a+b,0)/20>20,'gathered (circling) under the curtains');
  // a new curtain (novelty on the weakest site): the foxes stop to look at it
  const k=lo;e.influence({kind:'novelty',site:ids[k],amount:1});let at=0,others=0;
  for(let q=0;q<10;q++){both(20);for(let i=0;i<e.capacity;i++){if(!e.alive[i]||e.sp[i]!==life.FOX||e.mode[i]!==5||!(e.ia[i*2]&life.LOOK))continue;if(e.tgt[i]===k)at++;else others++;}}
  console.log(`# foxes looking at the new curtain ${at}, at others ${others}`);assert(at>others&&at>3,'they look up at the new curtain');
});
test('A failing run sends the animals to shelter and empties the strained curtain\'s light; the recovery revives it',async()=>{
  const X=await setup(),e=X.eco({},9),c=X.eco({},9),both=n=>{run(e,n);run(c,n);},[,,life]=await load(),{SHELTER,PERCH,ROOF,TREES}=X.grammar.shore;both(700);
  const S=e.sites,ids=[...S.ids],vis=S.visits.slice(0,ids.length);let k=vis.indexOf(Math.max(...vis));
  // (the young foxes: an old one goes back to the woods it came from, failure or not)
  const young=(eco,i)=>eco.alive[i]&&eco.sp[i]===life.FOX&&!(eco.ia[i*2]&life.OLD)&&!(c.ia[i*2]&life.OLD);
  const foxDist=eco=>{let s=0,n=0;for(let i=0;i<eco.capacity;i++){if(!young(eco,i))continue;s+=Math.min(...SHELTER.map(p=>hyp(p[0]-eco.px[i],p[1]-eco.pz[i])));n++;}return s/n;};
  const owl=eco=>{for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&eco.sp[i]===life.OWL)return i;return -1;};
  const d0=foxDist(e);assert.equal(e.digest(),c.digest(),'the same ecosystem before the failure');
  e.influence({kind:'disturb',site:ids[k],amount:.5});both(400);
  let shelter=0,foxes=0;for(let i=0;i<e.capacity;i++){if(!young(e,i))continue;foxes++;if(e.ia[i*2]&life.SHELTERING)shelter++;}
  const d1=foxDist(e),dc=foxDist(c),o=owl(e);
  console.log(`# foxes sheltering ${shelter}/${foxes}; distance to shelter ${d0.toFixed(1)} -> ${d1.toFixed(1)} (without the failure ${dc.toFixed(1)}); the strained site's glimmers ${S.visits[k].toFixed(1)} (without ${c.sites.visits[k].toFixed(1)})`);
  assert(foxes>0&&shelter===foxes,'the foxes shelter');assert(d1<dc-20,'toward the cabin and the spruces');
  assert(o>=0&&e.ia[o*2+1]===1&&e.ia[o*2]===ROOF,'the owl takes the cabin\'s roof');
  assert(S.visits[k]<c.sites.visits[k]*.35,'the light under the strained curtain empties');
  const hares=[];for(let i=0;i<e.capacity;i++)if(e.alive[i]&&e.sp[i]===life.HARE)hares.push(i);
  assert(hares.filter(i=>e.mode[i]===4||hyp(TREES[e.ia[i*2+1]][0]-e.px[i],TREES[e.ia[i*2+1]][2]-e.pz[i])<3).length>=hares.length-1,'hares crouch under their spruces');
  // the recovery: the site revives; the owl takes off and climbs into the sky, the foxes come out to look up, the light returns
  e.influence({kind:'recover',site:ids[k],amount:.5});run(e,1);run(c,1);const st=S.state(k);assert(st.revive>.9,'the site revives');
  both(20);let looking=0;for(let i=0;i<e.capacity;i++)if(e.alive[i]&&e.sp[i]===life.FOX&&e.mode[i]===5&&(e.ia[i*2]&life.LOOK))looking++;
  const from=[e.px[o],e.pz[o]];let low=Infinity;for(let q=0;q<40;q++){both(10);low=Math.min(low,hyp(e.px[o],life.CAM[1]-e.pz[o]));}
  assert.equal(e.ia[o*2+1],2,'the owl flies out over the ice');assert(low<45&&low<hyp(from[0],life.CAM[1]-from[1])-30,`and comes over the near ice (${low.toFixed(1)} from the shore)`);
  assert(e.py[o]>5,'in the air');
  assert(looking>=2,'the foxes came out to look up');
  both(900);let a=0,b=0;for(let q=0;q<15;q++){both(20);a+=S.visits[k];b+=c.sites.visits[k];}
  console.log(`# the revived site's glimmers ${(a/15).toFixed(1)} (without the failure ${(b/15).toFixed(1)}); the owl perched again: ${e.mode[o]===5}`);
  assert(a>b*.6,'the light comes back');assert(PERCH.some(p=>hyp(p[0]-e.px[o],p[2]-e.pz[o])<2)||e.mode[o]===6,'the owl goes back to a perch');
});
test('Events act only through conditions: the same identities either way, influences change trajectories; nothing grows; snapshots give back the same future',async()=>{
  const X=await setup(),e=X.eco({ecology:2,music:1},3),c=X.eco({ecology:2,music:1},3),[,,life]=await load();run(e,300);run(c,300);
  e.influence({kind:'nourish',site:e.sites.ids[0],amount:1});e.influence({kind:'pulse',site:e.sites.ids[1],amount:1});run(e,400);run(c,400);
  assert.notEqual(e.digest(),c.digest(),'influences change the ecosystem');for(let i=0;i<e.capacity;i++)assert.equal(e.sp[i],c.sp[i],'nothing is placed or counted from an event');
  for(let k=0;k<50;k++){run(e,120);let n=0;
    for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;n++;assert(e.age[i]<=e.life[i]+5*20,'a lifetime ends');
      assert(Number.isFinite(e.px[i])&&Number.isFinite(e.py[i])&&Number.isFinite(e.pz[i]));assert(e.px[i]>=life.X0-10&&e.px[i]<=life.X1+10&&e.pz[i]>=life.Z0-11&&e.pz[i]<=life.Z1+10);
      if(e.sp[i]===life.GLIMMER)assert(e.py[i]<0,'the glimmers stay under the ice');else if(e.sp[i]!==life.OWL)assert(e.py[i]<.6,'the animals on the ground');}
    assert(n<=e.capacity);for(const v of Object.values(e.stats().field))assert(Number.isFinite(v)&&v<5e4);}
  const counts=e.stats().species;assert.deepEqual([counts.fox<=life.COUNTS[0],counts.hare<=life.COUNTS[1],counts.owl<=life.COUNTS[2]],[true,true,true]);
  const snap=e.snapshot();run(e,300);const want=e.digest();e.restore(snap);run(e,300);assert.equal(e.digest(),want,'restored: the same future');
  // (the site conditions the grammar keeps, revival and strain, travel with the snapshot)
  const s2=e.snapshot();e.influence({kind:'disturb',site:e.sites.ids[0],amount:1});run(e,200);e.influence({kind:'recover',site:e.sites.ids[0],amount:1});run(e,40);const w2=e.digest();
  e.restore(s2);e.influence({kind:'disturb',site:e.sites.ids[0],amount:1});run(e,200);e.influence({kind:'recover',site:e.sites.ids[0],amount:1});run(e,40);assert.equal(e.digest(),w2);
});
test('An Aurora identity: new ones live (generator 5, its own stream), a stored one keeps what it had, a tuning turns life on and off',async()=>{
  const recipe=require('../engine/recipe'),catalog=require('../engine/catalog'),{project}=require('./life-aurora-fixture');
  const p=project('stored'),r=recipe.generate(p,{family:'aurora',now:0});
  assert.equal(r.genome.life.enabled,true);assert.equal(r.genome.life.ecology,2);for(const [k,v] of Object.entries(r.genome.life))assert(catalog.accepts(catalog.LIFE[`life.${k}`],v),`life.${k}`);
  assert.equal(recipe.generate(p,{family:'aurora',now:0,version:4}).genome.life,undefined,'only generator 5 draws it');
  // without life, every other value is the 0.9.0 draw (life comes from its own random stream, appended)
  const {life:_,...rest}=r.genome;assert.deepEqual(Object.keys(r.genome).at(-1)==='life'||Object.keys(r.genome).indexOf('life')>Object.keys(r.genome).indexOf('palette'),true);
  const stored={...r,genome:rest};assert.equal(recipe.resolve(stored,p,5).recipe,stored,'a stored Aurora without life is served as stored');
  const same=recipe.update(stored,{type:'pack',pack:null},p,0);assert.equal(same.genome.life,undefined,'redrawn without a look: still none');assert.deepEqual(same.genome,stored.genome);
  const on=recipe.update(stored,{type:'tune',values:{'life.enabled':true}},p,0);assert.deepEqual(on.genome.life,{enabled:true});
  assert.deepEqual(recipe.update(on,{type:'pack',pack:null},p,0).genome,on.genome,'a tuned life is kept exactly');
  assert.equal(recipe.update(on,{type:'tune-reset'},p,0).genome.life,undefined,'reset removes it again');
  assert.equal(identity().genome.life,undefined,'(the fixture\'s identity without life is the stored kind)');
});

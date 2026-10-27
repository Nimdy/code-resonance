'use strict';
// Fractal Biosphere's digital life (public/worlds/life/biosphere.js): the habitat is the organisms as they are rendered
// (a pure function of the model), the populations stay in the water and inside the world, each species behaves as its
// own rules say (pollinators gather at crowns, spores settle and are dislodged, plankton keep together), lifecycles are
// bounded, and feedback is real (pollinators' trails draw more pollinators). Disturbances, gatherings, milestones and
// determinism are in tests/life-biosphere-gatherings.test.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,RECIPE,setup,ecosystemOf,run}=require('./life-biosphere-fixture.js');
test('The habitat is a pure function of the model: the same sites every time, at the organisms as growForest grows them',async()=>{
  const ctx=await setup(),{bio,model,growth}=ctx,t=T0+20000;
  const ha=bio.biosphereGrammar(RECIPE).habitat(model,t),hb=bio.biosphereGrammar(RECIPE).habitat(model,t);
  const g=bio.biosphereGrammar(RECIPE);const c1=g.habitat(model,t),c2=g.habitat(model,t);   // memoised path
  assert.deepEqual(ha,hb);assert.deepEqual(ha,c1);assert.deepEqual(c1,c2);const a=ha.sites;
  const roots=a.filter(s=>s.kind===1),heads=a.filter(s=>s.kind===0);
  assert.equal(roots.length,6,'one root site per organism');assert(heads.length>=6&&heads.length<=24,'one to four heads per organism');
  // The same organisms grown for the whole model (as the world does): roots exactly; the first head carries the
  // subsystem's id, the others (if any) name it as their organism (data.main); every head is among the organism's own
  // crown points (at its rest size), inside it, and two heads are apart.
  const f=growth.growForest(model,{species:'coral',G:RECIPE.genome,epoch:model.epoch,quality:0,current:.4});
  const BEAUTY={coral:1.5,'crystal-tree':1.25,fern:.6,kelp:.25,mycelial:.3},mass={};
  for(const o of f.orgs){
    const root=a.find(s=>s.id===`${o.id}#root`),mine=heads.filter(s=>s.id===o.id||ha.data.main[s.id]===o.id);assert(root&&mine[0]?.id===o.id&&mine.length<=4,o.id);
    assert.equal(root.x,+o.root[0].toFixed(3));assert.equal(root.z,+o.root[2].toFixed(3));
    const S=.7+.17*Math.log2(1+o.members.length),P=o.crown.map(c=>[o.root[0]+(c.p[0]-o.root[0])*S,c.p[1]*S,o.root[2]+(c.p[2]-o.root[2])*S]);
    for(const h of mine){const near=Math.min(...P.map(p=>Math.hypot(p[0]-h.x,p[1]-h.y,p[2]-h.z)));
      assert(near<1.2*S+1e-3,`${h.id}: a head is where crowns are (${near.toFixed(2)})`);
      assert(h.y>0&&h.y<=o.height*S+1e-3&&h.r>=.7&&h.r<=2.4,`${h.id} inside the organism`);}
    for(let j=1;j<mine.length;j++)assert(Math.hypot(mine[0].x-mine[j].x,mine[0].y-mine[j].y,mine[0].z-mine[j].z)>.2*S,`${o.id}: heads apart`);
    mass[o.id]=Math.pow(o.height*S,1.6)*Math.sqrt(o.radius*S+.6)*(BEAUTY[o.species]||1);}
  // Data: how much each head holds the eye (the world's anchor, the most, is 1; a further head no more than its first).
  const top=Math.max(...Object.values(mass));
  for(const [id,v] of Object.entries(mass))assert(Math.abs(ha.data.focal[id]-v/top)<2e-3,`${id} focal`);
  for(const [id,m] of Object.entries(ha.data.main))assert(ha.data.focal[id]<=ha.data.focal[m]+1e-9,`${id} focal`);
  assert.equal(Math.max(...Object.values(ha.data.focal)),1);
  // Before the structure exists there is nothing; a removed subsystem leaves the habitat.
  assert.deepEqual(bio.biosphereGrammar(RECIPE).habitat(model,T0-1).sites,[]);
  model.applyDelta({add:[],remove:['g5/m0','g5/m1','g5/m2','g5/m3','g5/m4','g5/m5','g5/m6'],addEdges:[],removeEdges:[]},T0+30000,T0+40000);
  assert(!bio.biosphereGrammar(RECIPE).habitat(model,T0+50000).sites.some(s=>s.id.startsWith('g5')));
});
test('Populations live in the water, inside the world, with bounded lifecycles, over a long run (10 minutes)',async()=>{
  const ctx=await setup(),h=ctx.bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000),sites=h.sites;
  const {eco}=ecosystemOf(ctx,h);const sp=eco.species,B=ctx.bio;
  const spec=B.biosphereGrammar(RECIPE).ecosystem({},99),min=spec.bounds.min,max=spec.bounds.max;
  let worst=0;
  run(eco,600*20,t=>{if(t%20)return;for(let i=0;i<eco.capacity;i++){if(!eco.alive[i])continue;const x=eco.px[i],y=eco.py[i],z=eco.pz[i];
    assert(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z),'finite');
    assert(y>=min[1]&&y<=max[1]&&x>=min[0]&&x<=max[0]&&z>=min[2]&&z<=max[2],`inside the world (${x},${y},${z})`);
    assert(y>=.1,'above the floor');
    const s=sp[eco.sp[i]];worst=Math.max(worst,y<s.yMin?s.yMin-y:0);
    assert(eco.age[i]<=eco.life[i]+s.fade*20+1,'a lifetime ends (it fades out)');}});
  assert(worst<.6,`species keep their height band (worst excursion ${worst.toFixed(2)})`);
  const st=eco.stats();for(const n of B.SPECIES_NAMES)assert(st.species[n]>0,`${n} alive`);
  assert(st.alive<=eco.capacity&&st.alive>eco.capacity*.85,'the population stays near its quota');
  let reborn=0;for(let i=0;i<eco.capacity;i++)if(eco.gen[i]>1)reborn++;assert(reborn>eco.capacity*.5,'inhabitants depart and others are born');
  // Everyone stays among the organisms (the habitat's soft edge).
  const cs=sites.filter(s=>s.kind===0),cx=cs.reduce((a,s)=>a+s.x,0)/cs.length,cz=cs.reduce((a,s)=>a+s.z,0)/cs.length;
  let far=0;for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&Math.hypot(eco.px[i]-cx,eco.pz[i]-cz)>25)far++;assert(far<eco.capacity*.02,`${far} far away`);
});
test('Each population behaves as its own: pollinators gather at crowns, plankton keep together, spores settle and are dislodged',async()=>{
  const ctx=await setup(),h=ctx.bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000),sites=h.sites;
  const {eco}=ecosystemOf(ctx,h);const {POLLINATOR,SPORE,PLANKTON,DRIFTER}=ctx.bio,{MODE}=ctx.sim;
  const crowns=sites.filter(s=>s.kind===0);
  const atCrown=k=>{let n=0,all=0;for(let i=0;i<eco.capacity;i++){if(!eco.alive[i]||eco.sp[i]!==k)continue;all++;
    if(crowns.some(c=>Math.hypot(eco.px[i]-c.x,eco.pz[i]-c.z)<c.r*1.6&&Math.abs(eco.py[i]-c.y)<c.r*1.6))n++;}return n/Math.max(1,all);};
  const prev=new Uint8Array(eco.capacity),gen=new Uint32Array(eco.capacity);let settled=0,dislodged=0;const share={p:0,d:0},nb={pl:0,sp:0,dr:0,n:0};
  run(eco,240*20,t=>{
    for(let i=0;i<eco.capacity;i++){if(!eco.alive[i]||eco.sp[i]!==SPORE){prev[i]=255;continue;}const m=eco.mode[i];
      if(gen[i]===eco.gen[i]&&prev[i]!==255){if(m===MODE.settle&&prev[i]!==MODE.settle)settled++;if(prev[i]===MODE.settle&&m!==MODE.settle)dislodged++;}prev[i]=m;gen[i]=eco.gen[i];}
    if(t>=60*20&&t%20===0){share.p+=atCrown(POLLINATOR);share.d+=atCrown(DRIFTER);
      const mean=k=>{let s=0,c=0;for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&eco.sp[i]===k){s+=eco.nb[i];c++;}return s/Math.max(1,c);};
      nb.pl+=mean(PLANKTON);nb.sp+=mean(SPORE);nb.dr+=mean(DRIFTER);nb.n++;}});
  assert(share.p>2*share.d,`pollinators at crowns ${share.p.toFixed(1)} vs drifters ${share.d.toFixed(1)}`);
  assert(nb.pl/nb.n>1.5*nb.dr/nb.n&&nb.pl/nb.n>2,`plankton neighbours ${(nb.pl/nb.n).toFixed(1)} vs drifters ${(nb.dr/nb.n).toFixed(1)}`);
  assert(settled>50&&dislodged>30,`spores settled ${settled} times, dislodged ${dislodged} times`);
  // Orbits, seeking and exploring coexist among pollinators (a living mix, not one state).
  const modes=new Array(7).fill(0);for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&eco.sp[i]===POLLINATOR)modes[eco.mode[i]]++;
  assert(modes[MODE.orbit]>0&&modes[MODE.seek]>0&&modes[MODE.explore]>0,`pollinator modes ${modes}`);
});
// Twelve equal crowns on a ring and a sparse population: when a pollinator chooses its next crown, does it prefer the
// crowns others are visiting (their trails mark them), or not (trails off: only the crowd's own deterrence remains)?
async function joining(trails){
  const ctx=await setup();const sites=[];for(let k=0;k<12;k++){const a=k/12*Math.PI*2;sites.push({id:`s${String(k).padStart(2,'0')}`,x:Math.cos(a)*11,y:3,z:Math.sin(a)*11,r:1.1,w:1,kind:0});}
  let rel=0,n=0;
  for(const seed of [1,2,3]){const {eco}=ecosystemOf(ctx,sites,{seed,params:{trails,density:.35}});const prev=new Uint8Array(eco.capacity);
    run(eco,180*20,t=>{if(t<400)return;let mean=0;for(let k=0;k<12;k++)mean+=eco.sites.visits[k];mean/=12;
      for(let i=0;i<eco.capacity;i++){if(eco.sp[i]!==ctx.bio.POLLINATOR)continue;const m=eco.mode[i];
        if(m===ctx.sim.MODE.seek&&prev[i]!==m&&eco.tgt[i]>=0&&mean>0){rel+=eco.sites.visits[eco.tgt[i]]/mean;n++;}prev[i]=m;}});}
  return {ratio:rel/n,choices:n};
}
test('Feedback: pollinators\' trails draw more pollinators to the crowns others are visiting (not with trails off)',async()=>{
  const on=await joining(1),off=await joining(0);
  assert(on.choices>250&&off.choices>250,'many choices');
  assert(on.ratio>1.1,`chosen crowns are busier than average with trails on (${on.ratio.toFixed(2)})`);
  assert(on.ratio>off.ratio+.08,`the preference comes from the trails (on ${on.ratio.toFixed(2)}, off ${off.ratio.toFixed(2)})`);
});

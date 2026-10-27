'use strict';
// Fractal Biosphere's digital life (public/worlds/life/biosphere.js): the habitat is the organisms as they are rendered
// (a pure function of the model), the populations stay in the water and inside the world, each species behaves as its
// own rules say (pollinators gather at crowns, spores settle and are dislodged, plankton keep together), feedback is
// real (pollinators' trails draw more pollinators), disturbances scatter and recoveries bring them back, lifecycles are
// bounded, and the ecosystem is deterministic across snapshots (the grammar's derived caches included).
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>Promise.all([import('../public/worlds/life/biosphere.js'),import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js'),
  import('../public/worlds/model.js'),import('../public/worlds/biosphere-growth.js')]);
const T0=1750000000000;
const RECIPE={projectSeed:7,genome:{geometry:{species:'coral'},space:{},motion:{current:.4}}};
// A project of six subsystems on the hex grid, with folders, files and symbols (and a few cross links).
function graph(){
  const nodes=[],edges=[];const at=[[0,0],[1,0],[0,1],[-1,1],[-1,0],[1,-1]];
  at.forEach(([q,r],g)=>{nodes.push({id:`g${g}`,type:'group',order:g,q,r,angle:g,counts:{function:4+g,class:g%2}});
    for(let m=0;m<2+g;m++){const id=`g${g}/m${m}`;nodes.push({id,type:'module',group:`g${g}`,dir:`d${m%2}`,q,r,state:m%3?'committed':'validated',counts:{function:2}});
      for(let s=0;s<1+(m%3);s++)nodes.push({id:`${id}#s${s}`,type:s%2?'class':'function',parent:id,slot:s});}});
  edges.push({a:'g0/m0',b:'g1/m0',kind:'depends',cross:true},{a:'g2/m1',b:'g3/m0',kind:'depends',cross:true});
  return {nodes,edges};
}
async function setup(){
  const [bio,sim,drv,mdl,growth]=await load();
  const model=mdl.createModel();model.applyDelta({keyframe:true,...graph()},T0,T0+10000);
  return {bio,sim,drv,model,growth};
}
function ecosystemOf({bio,sim,drv},sites,{seed=99,params={}}={}){
  const g=bio.biosphereGrammar(RECIPE);
  const eco=sim.createEcosystem({...g.ecosystem(params,seed),seed,params:drv.lifeScales(params)});
  eco.setSites(sites);eco.populate();return {g,eco};
}
const run=(eco,ticks,each)=>{for(let t=0;t<ticks;t++){eco.step();each?.(t);}};
test('The habitat is a pure function of the model: the same sites every time, at the organisms as growForest grows them',async()=>{
  const ctx=await setup(),{bio,model,growth}=ctx,t=T0+20000;
  const a=bio.biosphereGrammar(RECIPE).habitat(model,t),b=bio.biosphereGrammar(RECIPE).habitat(model,t);
  const g=bio.biosphereGrammar(RECIPE);const c1=g.habitat(model,t),c2=g.habitat(model,t);   // memoised path
  assert.deepEqual(a,b);assert.deepEqual(a,c1);assert.deepEqual(c1,c2);
  assert.equal(a.filter(s=>s.kind===0).length,6,'one crown site per organism');assert.equal(a.filter(s=>s.kind===1).length,6,'one root site per organism');
  // The same organisms grown for the whole model (as the world does): roots exactly, crowns at the centre of the
  // organism's crowns at its rest size.
  const f=growth.growForest(model,{species:'coral',G:RECIPE.genome,epoch:model.epoch,quality:0,current:.4});
  for(const o of f.orgs){
    const crown=a.find(s=>s.id===o.id),root=a.find(s=>s.id===`${o.id}#root`);assert(crown&&root,o.id);
    assert.equal(root.x,+o.root[0].toFixed(3));assert.equal(root.z,+o.root[2].toFixed(3));
    const S=.7+.17*Math.log2(1+o.members.length);let cx=0,cy=0,cz=0;for(const c of o.crown){cx+=c.p[0];cy+=c.p[1];cz+=c.p[2];}const n=o.crown.length;cx/=n;cy/=n;cz/=n;
    assert(Math.abs(crown.x-(o.root[0]+(cx-o.root[0])*S))<2e-3,`${o.id} crown x`);assert(Math.abs(crown.z-(o.root[2]+(cz-o.root[2])*S))<2e-3,`${o.id} crown z`);
    assert(Math.abs(crown.y-Math.max(cy,o.height*.5)*S)<2e-3,`${o.id} crown y`);
    assert(crown.y<o.height*S+1e-6&&crown.r>0&&crown.r<=Math.max(.7,o.radius*1.1)*S+1e-3,`${o.id} crown inside the organism`);}
  // Before the structure exists there is nothing; a removed subsystem leaves the habitat.
  assert.deepEqual(bio.biosphereGrammar(RECIPE).habitat(model,T0-1),[]);
  model.applyDelta({add:[],remove:['g5/m0','g5/m1','g5/m2','g5/m3','g5/m4','g5/m5','g5/m6'],addEdges:[],removeEdges:[]},T0+30000,T0+40000);
  assert(!bio.biosphereGrammar(RECIPE).habitat(model,T0+50000).some(s=>s.id.startsWith('g5')));
});
test('Populations live in the water, inside the world, with bounded lifecycles, over a long run (10 minutes)',async()=>{
  const ctx=await setup(),sites=ctx.bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000);
  const {eco}=ecosystemOf(ctx,sites);const sp=eco.species,B=ctx.bio;
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
  const ctx=await setup(),sites=ctx.bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000);
  const {eco}=ecosystemOf(ctx,sites);const {POLLINATOR,SPORE,PLANKTON,DRIFTER}=ctx.bio,{MODE}=ctx.sim;
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
test('A failure scatters the gathering at its organism; after the recovery pollinators return',async()=>{
  const ctx=await setup(),sites=ctx.bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000);
  const {eco}=ecosystemOf(ctx,sites);const ids=eco.sites.ids;
  run(eco,90*20);
  // The most visited crown.
  let k=-1;for(let q=0;q<eco.sites.count;q++)if(eco.sites.kind[q]===0&&(k<0||eco.sites.visits[q]>eco.sites.visits[k]))k=q;const id=ids[k];
  const before=eco.sites.visits[k];assert(before>2,`a gathering (${before.toFixed(1)})`);
  eco.influence({kind:'disturb',site:id,amount:.9});
  let fled=Infinity;run(eco,20*20,t=>{if(fled===Infinity&&eco.sites.visits[eco.sites.ids.indexOf(id)]<before*.25)fled=t/20;});
  assert(fled<15,`scattered within ${fled}s`);
  const during=eco.sites.visits[eco.sites.ids.indexOf(id)];assert(during<before*.3,`stays unwelcome while strained (${during.toFixed(1)})`);
  eco.influence({kind:'recover',site:id,amount:.9});
  let back=0;run(eco,60*20,t=>{back=Math.max(back,eco.sites.visits[eco.sites.ids.indexOf(id)]);});
  assert(back>Math.max(1,during*2),`they return (${back.toFixed(1)})`);
});
test('Deterministic: the same inputs give the same ecosystem, and a snapshot restored into a fresh one continues exactly',async()=>{
  const ctx=await setup(),sites=ctx.bio.biosphereGrammar(RECIPE).habitat(ctx.model,T0+20000);
  const a=ecosystemOf(ctx,sites).eco,b=ecosystemOf(ctx,sites).eco;
  run(a,400);run(b,400);assert.equal(a.digest(),b.digest());
  const snap=a.snapshot();run(a,600);
  const c=ecosystemOf(ctx,[],{}).eco;c.restore(snap);run(c,600);
  assert.equal(c.digest(),a.digest(),'restored (the grammar\'s caches are derived from the restored state)');
});
test('On the performance timeline (driver, shadow model): the same moment after continuous play or a fresh restore',async()=>{
  const {bio,drv}=await setup(),{createLifeTimeline}=await import('../public/worlds/life/timeline.js');const score=require('../public/score.js');
  const g0=graph(),entries=[];
  for(let k=0;k<12;k++){const start=T0+k*10000,keep=new Set(g0.nodes.filter(n=>n.type==='group'||+n.id.split('/')[0].slice(1)<=k/2).map(n=>n.id));
    const nodes=g0.nodes.filter(n=>keep.has(n.id)||keep.has(n.group)&&n.type==='module'&&+n.id.split('/m')[1]<=k||n.parent&&keep.has(n.parent.split('#')[0]));
    const intents=k===6?[{v:1,id:`f${k}`,type:'validation.failed',ts:start+2000,tier:2,magnitude:.6,evidence:'verified',subject:{groupId:'g0'},detail:{}}]:
      k===9?[{v:1,id:`r${k}`,type:'validation.recovered',ts:start+2000,tier:3,magnitude:.6,evidence:'verified',subject:{groupId:'g0'},detail:{}}]:[];
    entries.push({seq:k,start,end:start+10000,frame:{start,end:start+10000,controls:{energy:.4,tension:.2}},graph:{keyframe:true,nodes:nodes.filter(n=>n.type!=='group'||nodes.some(m=>m.group===n.id)).concat(g0.nodes.filter(n=>n.type==='group')),edges:[]},intents});}
  const make=()=>{const tl=createLifeTimeline();tl.prime(entries);return drv.createLifeDriver({grammar:bio.biosphereGrammar(RECIPE),timeline:tl,seed:5,config:()=>({speed:1,tempo:92,epoch:T0,params:{},film:true,live:false}),score});};
  const a=make();for(let v=0;v<=115;v+=1/15)a.update({tview:v});
  const b=make();b.update({tview:115});
  assert.equal(a.digest(),b.digest());
  const st=a.stats();assert(st.ecosystem.sites>=6&&st.habitats>1,'the habitat followed the structure');
});

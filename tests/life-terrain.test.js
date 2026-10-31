'use strict';
// Temporal Terrain's digital life (public/worlds/life/terrain.js): the habitat is a pure function of the model and a time
// and stands where the world's own layout puts its ranges and ridges; the land carries what rests on it and the fields
// ride it back; grazers graze the pastures of the present, a fault scatters them and they come back after the recovery;
// events change trajectories only through the driver's influences; nothing grows with time; the state is the same after
// continuous play, seeks, checkpoints and a fresh session. The world's presentation is in tests/life-terrain-world.test.js;
// the shared fixture is tests/life-terrain-fixture.js. Rendering is qualified in a browser (qualification/visual/lab.js).
const test=require('node:test'),assert=require('node:assert/strict');
const {load,T0,graph,CFG,land,ecosystem,run,nearRange}=require('./life-terrain-fixture');
test('The habitat is a pure function of the model and the time, standing where the world lays out its ranges and ridges',async()=>{
  const m=await land(),{L,G,cfg,grammar,h}=await ecosystem(m),t=T0+20000;
  assert.deepEqual(grammar.habitat(m,t),h,'same model and time: same habitat');
  const [{createModel}]=await load();const other=createModel({speed:1,tempo:92});other.reset(graph(),T0);
  assert.deepEqual(grammar.habitat(other,t).sites,h.sites,'another model with the same structure: the same sites');
  // ranges (the event targets, by subsystem id) first, then a pasture on every file's ridge behind the front edge
  const R=L.rangesAt(L.prepare(m),t+L.EASE,L.EASE,cfg),kx=G.kxOf(R.left,R.right);assert.equal(kx,1,'the test land fits the frame');
  const ranges=h.sites.filter(s=>s.kind===1),pastures=h.sites.filter(s=>s.kind===0);
  assert.equal(ranges.length,R.ranges.length);assert.equal(pastures.length,R.ranges.reduce((n,r)=>n+r.files.length,0));
  for(const r of R.ranges){const s=ranges.find(x=>x.id===r.id);assert(Math.abs(s.x-r.c*kx)<1e-3,`${r.id} over its range`);assert.equal(s.z,G.RANGE_Z);
    for(const f of r.files){const p=pastures.find(x=>x.id===`${f.id}#p`);assert(p&&Math.abs(p.x-f.x*kx)<1e-3,`${f.id}'s pasture on its ridge`);assert.equal(h.data.rangeOf[p.id],r.id);assert.equal(p.z,G.PASTURE_Z);}}
  // the land's profile across the frame is the world's own row of the land (rowAt) at that moment
  const row=new Float32Array(L.LANES*8);L.rowAt(L.prepare(m),t+L.EASE,L.EASE,cfg,{Xc:0,Xh:G.RN/kx},row,()=>[0,0,0],[0,0,0]);
  for(let j=0;j<L.LANES;j+=7)assert(Math.abs(h.data.prof[j]-row[j*4])<1e-3);
  assert.equal(h.data.speed,1);assert(h.sites.length<=64);
  // a wide land is compressed into the frame; more than 64 places keep the ranges and the strongest pastures, and
  // pastures closer than PASTURE_GAP across the land are one place (the strongest)
  const big=createModel({speed:1,tempo:92});big.reset(graph(30,5),T0);const hb=grammar.habitat(big,t);
  assert(hb.sites.length<=64);assert.equal(hb.sites.filter(s=>s.kind===1).length,24);assert(hb.data.kx<1);
  const px=hb.sites.filter(s=>s.kind===0).map(s=>s.x).sort((a,b)=>a-b);assert(px.length>10);for(let k=1;k<px.length;k++)assert(px[k]-px[k-1]>=G.PASTURE_GAP-1e-9);
  for(const s of hb.sites)assert(Math.abs(s.x)<=G.RN*.9+1e-6,'inside the frame');
  // cheap enough to run after every recorded window
  const t0=performance.now();for(let k=0;k<20;k++)grammar.habitat(m,t+k*1000);assert((performance.now()-t0)/20<4,'habitat under 4 ms');
});
test('The land carries what rests on it, and the fields ride it back into the past',async()=>{
  const m=await land(),{G,cfg,eco}=await ecosystem(m);run(eco,200);
  // the land's rate: L / (tau e^(z / L)) depth units a second, fast at the front, slower behind; capped in fast replays
  assert(Math.abs(G.landRate(0,cfg)-60/42)<1e-9);assert(G.landRate(60,cfg)<G.landRate(0,cfg)/2.7);assert.equal(G.landRate(0,cfg,8),G.landRate(0,cfg,G.SPEED_MAX));
  // resting grazers and settled gleaners move back with it
  const was=new Map();for(let i=0;i<eco.capacity;i++)if(eco.alive[i]&&(eco.mode[i]===4||eco.mode[i]===5)&&eco.pz[i]>5&&eco.pz[i]<95)was.set(i,[eco.gen[i],eco.pz[i]]);
  run(eco,40);let n=0,ratio=0;
  for(const [i,[g,z]] of was){if(eco.gen[i]!==g||!(eco.mode[i]===4||eco.mode[i]===5))continue;const want=G.landRate(z,cfg)*2;ratio+=(eco.pz[i]-z)/want;n++;}
  assert(n>20,`resting or settled: ${n}`);ratio/=n;assert(ratio>.7&&ratio<1.3,`they drift back at the land's rate (${ratio.toFixed(2)})`);
  // a deposit at the front recedes with the land: its centre of mass moves back as a moment does
  const quiet=(await ecosystem(m,{params:{density:0}})).eco;quiet.disc(2,0,10,4,3);
  const centre=()=>{const F=quiet.field,NC=F.nx*F.nz;let s=0,w=0;for(let j=0;j<F.nz;j++)for(let i=0;i<F.nx;i++){const v=F.data[2*NC+j*F.nx+i];s+=v*(F.min[1]+(j+.5)*F.ch);w+=v;}return s/w;};
  const z0=centre();run(quiet,200);const z1=centre(),age=cfg.tau*Math.expm1(z0/cfg.L)/1000+10,want=cfg.L*Math.log1p(age*1000/cfg.tau);
  assert(Math.abs(z1-want)<1.5,`after 10 s the disturbance lies ${z1.toFixed(1)} deep, a moment from ${z0.toFixed(1)} would be ${want.toFixed(1)}`);
});
test('Grazers graze the pastures of the present in herds; swifts fly over it; gleaners keep to the older land',async()=>{
  const m=await land(),{G,eco}=await ecosystem(m),off=(await ecosystem(m,{params:{attraction:0}})).eco;run(eco,1200);run(off,1200);
  const tally=e=>{const s={orbit:0,front:0,grazers:0,swifts:0,high:0,over:0,gleaners:0,old:0,nb:0};
    for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;const k=e.sp[i];
      if(k===G.GRAZER&&e.ia[i*2+1]!==1){s.grazers++;if(e.mode[i]===2)s.orbit++;if(e.pz[i]<20)s.front++;s.nb+=e.nb[i];}
      else if(k===G.SWIFT){s.swifts++;if(e.py[i]>=3.5)s.high++;if(e.pz[i]<40)s.over++;}
      else if(k===G.GLEANER){s.gleaners++;if(e.pz[i]>25)s.old++;}}return s;};
  let a={orbit:0},b={orbit:0},last=null;for(let k=0;k<10;k++){run(eco,40);run(off,40);const x=tally(eco),y=tally(off);a.orbit+=x.orbit;b.orbit+=y.orbit;last=x;}
  console.log(`# grazing: ${a.orbit/10} with attraction, ${b.orbit/10} without; ${JSON.stringify(last)}`);
  assert(a.orbit>2*b.orbit+20,`grazing on the pastures: ${a.orbit/10} vs ${b.orbit/10} without attraction`);
  assert(last.front>last.grazers*.6,'the herds keep to the present');assert(last.nb/last.grazers>2,'in company (neighbours each)');
  assert(last.high>last.swifts*.95&&last.over>last.swifts*.85,'swifts fly over the present');assert(last.old>last.gleaners*.85,'gleaners keep to the older land');
});
test('A fault scatters the herds from its range and sends them to shelter; after the recovery they come back',async()=>{
  const m=await land(),{G,h,eco}=await ecosystem(m,{seed:3}),c=(await ecosystem(m,{seed:3})).eco,both=n=>{run(eco,n);run(c,n);};both(1000);
  // the busiest range
  const ids=h.sites.filter(s=>s.kind===1).map(s=>s.id);let id=ids[0],best=-1;for(const r of ids){const n=nearRange(eco,G,h,r);if(n>best){best=n;id=r;}}
  const at=e=>nearRange(e,G,h,id);
  assert.equal(eco.digest(),c.digest(),'the same ecosystem before the fault');
  eco.influence({kind:'disturb',site:id,amount:.6});both(100);let a=0,b=0;for(let k=0;k<10;k++){both(20);a+=at(eco);b+=at(c);}
  console.log(`# grazers at the struck range: ${a/10} during the fault, ${b/10} without it`);
  assert(a<b*.5,`scattered: ${a/10} at the struck range, ${b/10} without the fault`);assert(eco.sites.state(eco.sites.ids.indexOf(id)).stress>.25);
  // the disturbance it keeps emitting lies along the land behind it, a scar receding into the past
  const F=eco.field,NC=F.nx*F.nz,col=Math.round((eco.sites.x[eco.sites.ids.indexOf(id)]-F.min[0])/F.cw-.5);let deep=0,front=0;
  for(let j=0;j<F.nz;j++){const z=F.min[1]+(j+.5)*F.ch,v=F.data[2*NC+j*F.nx+col];if(z>25&&z<60)deep+=v;if(z>0&&z<20)front+=v;}assert(deep>.2*front&&front>0,`a scar behind the front (${deep.toFixed(2)} deep, ${front.toFixed(2)} at the front)`);
  eco.influence({kind:'recover',site:id,amount:.6});both(900);a=0;b=0;for(let k=0;k<20;k++){both(20);a+=at(eco);b+=at(c);}
  console.log(`# after the recovery: ${a/20} at the range, ${b/20} without the fault`);
  assert(a>b*.6,`back after the recovery: ${a/20} vs ${b/20}`);
});
test('Events act through the driver\'s influences: nourishment draws the herds, a new range draws the swifts',async()=>{
  const m=await land(),{G,h,eco}=await ecosystem(m,{seed:11}),c=(await ecosystem(m,{seed:11})).eco,both=n=>{run(eco,n);run(c,n);};both(600);
  const ids=h.sites.filter(s=>s.kind===1).map(s=>s.id);let id=ids[0],least=Infinity;for(const r of ids){const n=nearRange(c,G,h,r);if(n<least){least=n;id=r;}}
  eco.influence({kind:'nourish',site:id,amount:1});eco.influence({kind:'novelty',site:id,amount:1});both(600);let a=0,b=0;for(let k=0;k<15;k++){both(40);a+=nearRange(eco,G,h,id);b+=nearRange(c,G,h,id);}
  console.log(`# grazers at a nourished new range (its second half-minute): ${a/15}, ${b/15} without`);assert(a>b*1.3+5,`drawn: ${a/15} vs ${b/15}`);
  const k=eco.sites.ids.indexOf(id),sx=eco.sites.x[k],sw=e=>{let n=0;for(let i=0;i<e.capacity;i++)if(e.alive[i]&&e.sp[i]===G.SWIFT&&Math.abs(e.px[i]-sx)<14)n++;return n;};
  let s1=0,s2=0;for(let q=0;q<10;q++){both(40);s1+=sw(eco);s2+=sw(c);}assert(s1>s2,`swifts over the new range: ${s1/10} vs ${s2/10}`);
  // nothing is ever placed: the population is the same set of identities either way
  for(let i=0;i<eco.capacity;i++)assert.equal(eco.sp[i],c.sp[i]);
});
test('Nothing grows with time: bounded population, fields and memory over a long run; snapshots give back the same future',async()=>{
  const m=await land(),{G,eco}=await ecosystem(m,{params:{ecology:2,music:1}});
  for(let k=0;k<60;k++){run(eco,100);let n=0;
    for(let i=0;i<eco.capacity;i++){if(!eco.alive[i])continue;n++;assert(eco.age[i]<=eco.life[i]+7*20,'a lifetime ends');
      assert(Number.isFinite(eco.px[i])&&Number.isFinite(eco.py[i])&&Number.isFinite(eco.pz[i]));assert(eco.px[i]>=-G.RN&&eco.px[i]<=G.RN&&eco.pz[i]>=G.Z0&&eco.pz[i]<=G.Z1&&eco.py[i]>=0&&eco.py[i]<=G.YMAX);
      if(eco.sp[i]!==G.SWIFT)assert(eco.pz[i]>-.5,'on the land, never before its front edge');}
    assert(n<=eco.capacity);const f=eco.stats().field;for(const v of Object.values(f))assert(Number.isFinite(v)&&v<5e4);}
  assert(eco.stats().sites<=64);
  const snap=eco.snapshot();run(eco,300);const want=eco.digest();eco.restore(snap);run(eco,300);assert.equal(eco.digest(),want,'restored: the same future');
});
test('On the canonical timeline: the same moment after continuous play, after seeks, from a checkpoint and in a fresh session',async()=>{
  const [{createModel},L,G,,{createLifeDriver},{createLifeTimeline}]=await load();const score=require('../public/score.js');
  // A land laid down window by window: a subsystem a few windows apart, files in between, a failure and a recovery.
  const g=graph(4,4),entries=[];const groups=['g0','g1','g2','g3'];
  // window k founds subsystem floor(k / 3) (on its first window) and adds its file k % 3 with that file's symbols
  for(let k=0;k<14;k++){const start=T0+k*10000,end=start+10000,gi=Math.floor(k/3),gid=groups[gi],file=`m${gi}_${k%3}`;
    const nodes=k<12?g.nodes.filter(n=>(n.id===gid&&k%3===0)||n.id===file||n.parent===file):[];
    const intents=[];if(k===6)intents.push({v:1,id:'f',type:'validation.failed',ts:start+2000,tier:2,magnitude:.6,evidence:'verified',subject:{fileIds:['m1_0','m1_1']},detail:{}});
    if(k===9)intents.push({v:1,id:'r',type:'validation.recovered',ts:start+2000,tier:3,magnitude:.6,evidence:'verified',subject:{fileIds:['m1_0','m1_1']},detail:{}});
    if(k===4)intents.push({v:1,id:'e',type:'structure.modified',ts:start+3000,tier:0,magnitude:.3,evidence:'derived',subject:{fileId:'m0_1',groupId:'g0'},detail:{}});
    entries.push({seq:k,start,end,frame:{start,end,chapter:1,controls:{energy:.3+.05*k,tension:k>=6&&k<9?.5:.1}},graph:k===0?{keyframe:true,nodes,edges:[]}:{add:nodes,remove:[],addEdges:[],removeEdges:[]},intents});}
  const cfg=L.layoutConfig(CFG),player=(params={})=>{const timeline=createLifeTimeline();timeline.prime(entries);const grammar=G.createTerrainGrammar({cfg,capacity:240});
    const driver=createLifeDriver({grammar,timeline,seed:99,config:()=>({speed:1,tempo:96,epoch:T0,params,film:true,music:{version:3,style:'ambient',seed:5,profile:null}}),score,background:false});return {driver,at:t=>driver.update({tview:(t-T0)/1000})};};
  // (ecology 2 played through and sought; ecology 1, the earlier climate, sought)
  const AT=T0+101700;
  for(const [params,through] of [[{ecology:2,music:1},true],[{},false]]){
    const ref=player(params);ref.at(AT);const want=ref.driver.digest();
    if(through){const cont=player(params);for(let t=T0;t<AT;t+=1000/24)cont.at(t);cont.at(AT);assert.equal(cont.driver.digest(),want,'continuous play');}
    const seek=player(params);seek.at(T0+80000);seek.at(T0+30000);seek.at(AT+12000);seek.at(AT);assert.equal(seek.driver.digest(),want,`seeks back and forth (${JSON.stringify(params)})`);
    assert(seek.driver.stats().fromCheckpoint>0,'a checkpoint was restored');
    assert(ref.driver.stats().ecosystem.alive>100);assert(ref.driver.stats().ecosystem.sites>10);}
  // life values change the state (a replay rebuilds it from them), and the music shapes it in ecology 2
  const a=player({ecology:2,music:0}),b=player({ecology:2,music:2});a.at(T0+50000);b.at(T0+50000);assert.notEqual(a.driver.digest(),b.driver.digest());
  // the playback speed is the land's: the habitat says it, and the inhabitants live at it (capped)
  const fast=createModel({speed:4,tempo:92});fast.reset(graph(),T0);assert.equal(G.createTerrainGrammar({cfg}).habitat(fast,T0+1000).data.speed,4);
});

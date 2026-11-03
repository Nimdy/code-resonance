'use strict';
// Genesis G2 and G3, Metamorphic Matter (public/worlds/genesis-matter.js, genesis-matter-world.js): the Lawbook's
// physics, the layout's stability, determinism through the life driver (continuous play, seeks, checkpoints),
// engineering truth (failure, recovery, milestones, idle, music), the same events under different Lawbooks, the score
// at the scale of its phrases (paths, stages, harmony, cadences, the bass), that music never fabricates engineering,
// the music-off comparison, a verified milestone's lasting crystal, the world headless. The recording here is a
// synthetic test fixture, not a recording of real work.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const score=require('../public/score.js');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,WIN=5000;
const LAWS={cohesion:.5,coupling:.5,elasticity:.5,conductivity:.5,anisotropy:.4,resonance:.6,viscosity:.5,morphogenesis:.6,stability:.4,dispersion:.4};
const recipeOf=(laws=LAWS,seed=777)=>({family:'genesis',projectSeed:seed,variant:0,genome:{laws,material:{kind:'porcelain'}},traits:{districts:4,modules:20}});
const group=(id,order)=>({id,type:'group',order,counts:{function:3}});
const mod=(id,g)=>({id,type:'module',group:g,dir:'d',state:'draft',counts:{function:2}});
// Four subsystems of five files from the start; then (each optional) work by an agent, a failure on two files and its
// recovery, a milestone (verified or not), a dependency between two subsystems with its edge.
// (fail: the failure's window, its recovery three windows later)
function recording({windows=14,failure=true,recovery=true,milestone='verified',work=true,connect=true,unlocalized=false,fail=2}={}){
  const nodes=[];for(let g=0;g<4;g++){nodes.push(group(`g${g}`,g));for(let f=0;f<5;f++)nodes.push(mod(`g${g}f${f}`,`g${g}`));}
  const entries=[];
  for(let k=0;k<windows;k++){const start=T0+k*WIN,end=start+WIN,intents=[];
    const I=(type,dt,extra)=>intents.push({v:1,id:`w${k}:${type}:${dt}`,type,ts:start+dt,tier:1,magnitude:.5,evidence:'observed',subject:{},detail:{},...extra});
    let graph=k===0?{keyframe:true,nodes:nodes.slice(),edges:[]}:{add:[],remove:[],addEdges:[],removeEdges:[]};
    if(work&&k===1)I('agent.state',1000,{tier:0,magnitude:.2,subject:{agentId:'a1',fileId:'g1f0'},detail:{state:'tool',activity:'editing',provider:'claude-code'}});
    if(failure&&k===fail)I('validation.failed',500,{tier:2,evidence:'verified',subject:{fileIds:unlocalized?[]:['g0f0','g0f1']},detail:{category:'test'}});
    if(failure&&recovery&&k===fail+3)I('validation.recovered',500,{tier:3,magnitude:.7,evidence:'verified',subject:{fileIds:unlocalized?[]:['g0f0','g0f1']},detail:{category:'test'}});
    if(milestone&&k===7)I('milestone.achieved',500,{tier:3,magnitude:.9,evidence:milestone,subject:{fileIds:['g2f0','g2f1']},detail:{kinds:['recovery']}});
    if(work&&connect&&k===11)I('agent.state',1000,{tier:0,magnitude:.2,subject:{agentId:'a1',fileId:'g1f2'},detail:{state:'tool',activity:'editing',provider:'claude-code'}});
    if(connect&&k===9){graph={add:[],remove:[],addEdges:[{a:'g1f1',b:'g3f2',kind:'depends',cross:true}],removeEdges:[]};
      I('subsystem.connected',800,{tier:2,magnitude:.65,evidence:'derived',subject:{fileId:'g1f1',groupId:'g1',targetId:'g3f2',targetGroupId:'g3'},detail:{first:true}});}
    entries.push({seq:k,start,end,frame:{start,end,chapter:1,controls:{energy:.4,tension:.2}},graph,intents});}
  return entries;
}
async function driverFor(entries,{laws=LAWS,seed=777,music=null,silentFrom=Infinity}={}){
  const [{createLifeDriver},{createLifeTimeline},M]=await Promise.all([load('life/driver'),load('life/timeline'),load('genesis-matter')]);
  const timeline=createLifeTimeline();timeline.prime(entries);
  const grammar=M.createMatterGrammar({recipe:recipeOf(laws,seed),silentFrom});
  const driver=createLifeDriver({grammar,timeline,seed:42,background:false,score,
    config:()=>({speed:1,tempo:96,epoch:T0,params:{},film:true,live:false,music:music||{version:3,style:'ambient',profile:null,seed:9}})});
  return {driver,M,at:s=>{driver.update({tview:s},{budgetMs:Infinity});return driver.view.eco;}};
}
const near=(eco,M,ids,r=30)=>{const f=eco.fields,ps=eco.sites.filter(s=>ids.includes(s.id));let g=0,seams=0;
  for(let i=0;i<M.NCELL;i++){if(!ps.some(p=>Math.hypot(M.wx(M.CX[i]-p.x),M.wz(M.CZ[i]-p.z))<r))continue;if(eco.regimeOf(i)===M.REGIME.grains)g++;if(f.seam[i]>.3)seams++;}return {grains:g,seams};};

test('The Lawbook sets the physics: each law moves its own constants, and a region\'s laws depend on its rank only',async()=>{
  const M=await load('genesis-matter');
  const lo=M.physicsOf({...LAWS,stability:.1,coupling:.1,conductivity:.1,resonance:.1,cohesion:.1}),hi=M.physicsOf({...LAWS,stability:.9,coupling:.9,conductivity:.9,resonance:.9,cohesion:.9});
  assert(hi.strength>lo.strength&&hi.undercool>lo.undercool&&hi.lakes<lo.lakes,'stability: stronger, colder matter, fewer lakes');
  assert(hi.channel>lo.channel&&hi.channelHeat>lo.channelHeat,'coupling: wider, hotter channels');
  assert(hi.diffusion>lo.diffusion&&hi.opening>lo.opening,'conductivity: heat and new channels travel faster');
  assert(hi.nucleus>lo.nucleus&&hi.climate>lo.climate,'resonance: the music acts more strongly');
  assert(hi.stressDiffusion<lo.stressDiffusion,'cohesion: a failure\'s stress travels less far');
  assert(M.physicsOf({...LAWS,dispersion:1}).seeding>8*M.physicsOf({...LAWS,dispersion:0}).seeding,'dispersion: finer grains');
  const P=M.physicsOf(LAWS);assert.deepEqual(M.regionLaws(P,777,3),M.regionLaws(P,777,3));
  // lakes spread evenly over the ranks: never all lakes, never none
  for(const st of [0,.5,1]){const Q=M.physicsOf({...LAWS,stability:st});const lakes=[0,1,2,3,4,5].map(k=>M.regionLaws(Q,777,k).lake);
    assert(lakes.some(Boolean)&&lakes.some(x=>!x),`stability ${st}: ${lakes}`);}
});
test('The layout: a new subsystem never moves an older one, a new file never moves another, a dependency is a channel',async()=>{
  const [{createModel},M]=await Promise.all([load('model'),load('genesis-matter')]);
  const m=createModel();const nodes=[group('g0',0),mod('a0','g0'),mod('a1','g0'),group('g1',1),mod('b0','g1')];m.reset({nodes,edges:[]},T0);
  const before=M.layoutOf(m,T0+1,{seed:7,nRef:4,area:50});
  m.applyDelta({add:[group('g2',2),mod('c0','g2'),mod('a2','g0')],remove:[],addEdges:[{a:'a0',b:'c0',kind:'depends',cross:true}],removeEdges:[]},T0+1000,T0+2000);
  const after=M.layoutOf(m,T0+3000,{seed:7,nRef:4,area:50});
  for(const r of before.data.regions){const q=after.data.regions.find(x=>x.id===r.id);assert.equal(q.x,r.x);assert.equal(q.z,r.z);}
  for(const s of before.sites){const q=after.sites.find(x=>x.id===s.id);assert.equal(q.x,s.x);assert.equal(q.z,s.z);}
  assert.equal(after.sites.length,5);assert.equal(after.data.regions.length,3);
  assert.deepEqual(after.data.channels.map(c=>[c.a,c.b,c.count]),[[0,2,1]],'the importing region to the imported, once');
});
test('Determinism: continuous play, a far seek, a seek back to a checkpoint and a restored snapshot reach the same state',async()=>{
  const entries=recording();
  const A=await driverFor(entries),B=await driverFor(entries);
  for(let k=0;k<=500;k++)A.at(k/10);
  const da=A.driver.digest();B.at(50);assert.equal(B.driver.digest(),da,'a far seek from nothing equals continuous play');
  A.at(20);const back=A.driver.stats();assert(back.fromCheckpoint>0,'the seek back used a checkpoint');
  const C=await driverFor(entries);for(let k=0;k<=80;k++)C.at(k/4);assert.equal(A.driver.digest(),C.driver.digest(),'and lands on the continuous state');
  A.at(50);assert.equal(A.driver.digest(),da,'forward again: the same state');
  // a snapshot restored gives back exactly the same future
  const e=C.at(20),snap=e.snapshot();for(let k=0;k<100;k++)e.step();const d1=e.digest();e.restore(snap);for(let k=0;k<100;k++)e.step();assert.equal(e.digest(),d1);
});
test('Engineering truth: a failure fractures its files\' crystal (never a monument), a recovery sinters it back with seams',async()=>{
  const {at,M}=await driverFor(recording({milestone:false,connect:false}));
  let e=at(20);assert(near(e,M,['g0f0','g0f1']).grains>20,`grains around the failing files: ${near(e,M,['g0f0','g0f1']).grains}`);
  assert.equal(e.monuments.length,0);assert.equal(near(e,M,['g3f0','g3f1','g3f2']).grains,0,'nothing broken elsewhere');
  e=at(45);const r=near(e,M,['g0f0','g0f1']);assert.equal(r.grains,0,'recovered: no grains left');assert(r.seams>0,'seams remain where the grains fused');
  assert(e.log.some(x=>x.kind==='fracture')&&e.log.some(x=>x.kind==='sinter'));
});
test('Agent work melts its file\'s matter and, once its region depends on another, surges along that channel (coupling)',async()=>{
  const {at}=await driverFor(recording({failure:false,milestone:false}));
  let e=at(8);const first=e.log.filter(x=>x.kind==='work');assert.equal(first.length,1);assert(!/surges/.test(first[0].rule),'no channel yet: the heat stays');
  e=at(58);const second=e.log.filter(x=>x.kind==='work').at(-1);assert(/surges along its region's channels/.test(second.rule),second.rule);
  assert(e.stats().channels===1);
});
test('A failure without files only crazes (unlocalised: nothing broken); idle and music alone never break or crown anything',async()=>{
  const U=await driverFor(recording({unlocalized:true,recovery:false,milestone:false,connect:false}));let e=U.at(12);
  assert.equal(e.stats().grains,0);assert(e.craze>0,'a faint crazing');
  const idle=await driverFor(recording({failure:false,milestone:false,connect:false,work:false}));e=idle.at(60);
  assert.equal(e.stats().grains,0);assert.equal(e.monuments.length,0);assert.equal(e.stats().stressed,0);
});
test('Milestones: only verified evidence raises monumental crystals, and they survive a far seek (the lasting history)',async()=>{
  const V=await driverFor(recording({failure:false})),D=await driverFor(recording({failure:false,milestone:'derived'}));
  const ev=V.at(50),ed=D.at(50);assert(ev.monuments.length>0,'verified: monuments');assert.equal(ed.monuments.length,0,'without verified evidence: none');
  assert(ed.log.some(x=>x.kind==='freeze'),'but a freeze still answers it');
  // a generation's warm start (tview >= 540 s here) begins with the lasting history: the monuments stand, grown
  const far=await driverFor(recording({failure:false,windows:130}));const e=far.at(600);
  assert(e.monuments.length>0&&e.monuments.every(m=>m.k0<0),'restored from history, fully grown');
});
test('The same events under two Lawbooks: brittle matter breaks wider and heals slower than cohesive, stable matter',async()=>{
  // (the failure once both plains have frozen: a brittle, slowly relaxing plain takes longer to form; since G3 no music
  // cools the plains, so the failure waits for them; the fracture measured as it spreads, 11.5 s on)
  const entries=recording({milestone:false,connect:false,fail:10,windows:16});
  const brittle=await driverFor(entries,{laws:{...LAWS,stability:.05,cohesion:.05,elasticity:.1}}),firm=await driverFor(entries,{laws:{...LAWS,stability:.95,cohesion:.95,elasticity:.9}});
  const {M}=brittle;const b=near(brittle.at(62),M,['g0f0','g0f1'],45).grains,f=near(firm.at(62),M,['g0f0','g0f1'],45).grains;
  assert(b>f*1.25,`brittle ${b} vs firm ${f}`);
  // a different response, not merely a different look: the regions' climates, habits and grains differ too
  assert.notEqual(brittle.driver.digest(),firm.driver.digest());
});
// A lake (resonance and lakes at their most), its layout, and a matter on it with a scripted score: bars(b) -> a bar
// ({steps, expression, chord, layers, form}) as musical.js hands them over.
async function lakeMatter({laws={...LAWS,stability:0,resonance:1},silentFrom=Infinity}={}){
  const [{createModel},M]=await Promise.all([load('model'),load('genesis-matter')]);
  const P=M.physicsOf(laws),m=createModel();const nodes=[];for(let g=0;g<3;g++){nodes.push(group(`g${g}`,g));nodes.push(mod(`g${g}f0`,`g${g}`));}m.reset({nodes,edges:[]},T0);
  const lay=M.layoutOf(m,T0,{seed:5,nRef:3,area:50});const e=M.createMatter({P,projectSeed:5,seed:1,silentFrom});e.setSiteData(lay.data);e.setSites(lay.sites);e.populate(0);
  return {M,e,lay,P};
}
const BAR=60000/96*4,stepsOf=list=>{const st=Array.from({length:16},()=>[]);for(const n of list)st[n.step].push(n);return st;};
const barOf=({notes=[],chord=0,tension=.3,release=0,barInPhrase=0,layers=['melody','pad','bass'],bar=0,section=1})=>({steps:stepsOf(notes),chord,layers,form:{bar,role:'statement'},expression:{tension,release,barInPhrase,section}});
const musicOf=bars=>({key:()=>({tonic:0,scale:[0,2,4,5,7,9,11]}),config:{tempo:96},at:()=>null,bar:b=>bars(b)});
// (the performance's time from the matter's own tick, so successive calls carry on)
const play=(e,music,seconds)=>{for(let t=0;t<seconds*20;t++){e.step();e.listen(T0+e.tick*50,music);}};
test('A phrase\'s path: its notes draw an arm outward within its reach; transposed it draws the same arm, inverted its mirror',async()=>{
  const M=await load('genesis-matter');
  const notes=[[0,82],[6,79],[8,86],[12,81],[18,86],[24,82],[32,81],[37,79],[38,79],[40,84],[44,81],[48,89],[50,88]].map(([at,m])=>({at,m}));
  const p=M.phrasePath(notes),r=p.map(q=>Math.hypot(q.x,q.z));
  assert.deepEqual([p[0].x,p[0].z],[7,0],'it starts 7 m out');assert(r.every(x=>x<=M.PHRASE_R+1e-9),'within its reach');assert(r.at(-1)>25,`an arm: ${r.at(-1).toFixed(1)} m`);
  assert.deepEqual(M.phrasePath(notes.map(n=>({...n,m:n.m+5}))),p,'transposed: the same arm (intervals and rhythm only)');
  const inv=M.phrasePath(notes.map(n=>({...n,m:2*82-n.m})));for(let k=0;k<p.length;k++){assert(Math.abs(inv[k].x-p[k].x)<1e-9&&Math.abs(inv[k].z+p[k].z)<1e-9,'inverted: its mirror');}
});
test('The score\'s phrases grow in a lake\'s stage note by note, never on the files\' matter; without notes nothing grows there',async()=>{
  const {M,e,lay}=await lakeMatter();assert(e.stages.length>0,'a lake has a stage');
  const f=e.fields,inStage=x=>{let c=0;for(let i=0;i<M.NCELL;i++)if(x.fields.stageOf[i]===0&&x.fields.phi[i]>=.5)c++;return c;};
  for(const site of lay.sites)M.forDisc(site.x,site.z,site.r+2*M.CELL,i=>assert.equal(f.stageW[i],0,'the stage keeps off a file\'s island'));
  const melody=b=>barOf({notes:[0,4,8,12].map((step,k)=>({group:'melody',midi:72+((b*4+k)%5)*2,velocity:.4,duration:.6,step})),bar:b%16});
  const quiet=b=>barOf({notes:[],bar:b%16,layers:['pad']});
  const A=await lakeMatter(),B=await lakeMatter();
  const counts=[];for(let k=0;k<6;k++){play(A.e,musicOf(melody),1);counts.push(inStage(A.e));}
  play(B.e,musicOf(quiet),6);
  assert(counts.at(-1)>counts[0]&&counts.at(-1)>40,`the arm grows: ${counts.join(',')}`);assert.equal(inStage(B.e),0,'without notes nothing grows in the stage');
  play(A.e,musicOf(melody),5);assert(A.e.musicLog.some(x=>x.kind==='phrase'),'the next phrase begins: the music\'s own log');
});
test('Harmony: a dominant takes a stage below melting, the tonic above, a cadence on the tonic settles it, a release warms it',async()=>{
  // (a bar's harmony is read as the bar begins)
  const h=async bar=>{const {e:m}=await lakeMatter();m.listen(BAR*10-1,musicOf(()=>bar));m.listen(BAR*10+1,musicOf(()=>bar));return m.harmony;};
  const dominant=await h(barOf({chord:4,tension:.7,barInPhrase:1})),tonic=await h(barOf({chord:0,tension:.05,barInPhrase:0}));
  const cadence=await h(barOf({chord:0,tension:.05,barInPhrase:2})),release=await h(barOf({chord:5,tension:.2,release:.9,barInPhrase:0}));
  assert(dominant.T<0&&tonic.T>0&&dominant.T<tonic.T,`dominant ${dominant.T}, tonic ${tonic.T}`);
  assert(cadence.smooth>0&&cadence.damp>1,'a cadence settles: interfaces relax, the melt calms');assert(release.T>.15,`a release warms: ${release.T}`);
  assert.notEqual(dominant.g,tonic.g,'each bar\'s growth its own grain, its tilt by the chord');
});
test('The bass rings the melt at the stages, crystal reflects it, and with no bass the surface is exactly still',async()=>{
  const {M,e}=await lakeMatter(),{e:q}=await lakeMatter();
  const bass=b=>barOf({notes:[{group:'bass',midi:40,velocity:.4,duration:3,step:0},{group:'melody',midi:76,velocity:.4,duration:1,step:4}],bar:b%16});
  const none=b=>barOf({notes:[{group:'melody',midi:76,velocity:.4,duration:1,step:4}],bar:b%16});
  play(e,musicOf(bass),4);play(q,musicOf(none),4);
  let mx=0,solids=0,moving=0;for(let i=0;i<M.NCELL;i++){const u=Math.abs(e.fields.surf[i]);if(e.fields.stageW[i]>0&&u>mx)mx=u;}
  for(let i=0;i<M.NCELL;i++)if(e.fields.phi[i]>=.5&&e.fields.frac[i]<.5){solids++;if(Math.abs(e.fields.surf[i])>mx*.2)moving++;}
  assert(mx>.05,`the melt rings: ${mx.toFixed(3)}`);assert(moving<solids*.01,`crystal is rigid: ${moving} of ${solids} solid cells move`);
  assert(q.fields.surf.every(v=>v===0),'no bass: still');
});
test('Music never fabricates engineering, and the music-off comparison is the player\'s matter until its moment',async()=>{
  const entries=recording();
  const on=await driverFor(entries),off=await driverFor(entries,{silentFrom:T0});
  const a=on.at(60),b=off.at(60);
  const log=x=>x.log.map(y=>[y.tick,y.kind,y.what]);assert.deepEqual(log(a),log(b),'the same causal log with and without music');
  assert.deepEqual(a.monuments.map(m=>[m.x,m.z,m.k0]),b.monuments.map(m=>[m.x,m.z,m.k0]),'the same monuments');
  assert(a.log.every(x=>!/music|note|phrase|bass/i.test(x.kind)),'music writes only its own log');
  const c=await driverFor(entries),d=await driverFor(entries,{silentFrom:T0+30000});c.at(29.9);d.at(29.9);
  assert.equal(c.driver.digest(),d.driver.digest(),'until the comparison\'s moment: the same state');
  c.at(45);d.at(45);assert.notEqual(c.driver.digest(),d.driver.digest(),'after it, the music no longer acts');
});
test('A verified milestone\'s coherent crystal: the solid around its monuments takes their grain as its front passes, and keeps it',async()=>{
  const V=await driverFor(recording({failure:false}));const e=V.at(50),f=e.fields,M=V.M;
  let n=0,mono=0;for(let i=0;i<M.NCELL;i++){const j=f.monoOf[i];if(j<0||f.phi[i]<.5)continue;n++;if(f.gid[i]===e.monuments[j].grain)mono++;}
  assert(n>20&&mono/n>.9,`one crystal around the monuments: ${mono}/${n}`);
  const far=await driverFor(recording({failure:false,windows:130}));const g=far.at(600),h=g.fields;let k=0,km=0;
  for(let i=0;i<M.NCELL;i++){const j=h.monoOf[i];if(j<0||h.phi[i]<.5)continue;k++;if(h.gid[i]===g.monuments[j].grain)km++;}
  assert(k>20&&km/k>.9,`restored from history: ${km}/${k}`);
});
test('The world headless: it draws the matter, frames it, names it with permitted words only, and quality never touches the state',async()=>{
  const [{THREE},W,{createModel},{createDirector},{createAgents}]=await Promise.all([load('core'),load('genesis-matter-world'),load('model'),load('director'),load('agents')]);
  const entries=recording();const {driver}=await driverFor(entries);
  const model=createModel();model.reset({nodes:[],edges:[]},T0);model.setEpoch(T0);
  const director=createDirector({recipe:recipeOf()}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,16/9,.1,4000);
  const w=W.createFamily({scene,camera,model,recipe:recipeOf(),speed:()=>1,name:id=>`Name ${id}`,director,agents:createAgents(),pipeline:{size:[640,360]},matter:{create:()=>driver}});w.rebuild();
  const frame=(s,quality=0)=>{const i={t:T0+s*1000,tsec:s,tview:s,dt:1/30,mood:{tempo:96},activity:0,phase:'idle',unlocks:[],agents:[],overrides:{},quality,music:null};i.matter=driver.update(i,{budgetMs:Infinity});return i;};
  for(let s=0;s<=46;s+=.5){const i=frame(s,s>30?3:0);w.update(i);w.afterCamera(i);const g=w.cameraGoal(i);for(const v of [g.distance,g.azimuth,g.elevation,g.fov,g.target.x,g.target.y,g.target.z])assert(Number.isFinite(v));}
  const C=await driverFor(entries);C.at(46);assert.equal(driver.digest(),C.driver.digest(),'drawn at every quality level, the state is the same as without a world');
  const st=w.stats();assert(st.matter.regions===4&&st.causal.length>0);
  // the review films' locked camera (qualification only)
  w.qualify({camera:{x:10,z:20,distance:60,azimuth:.5,elevation:.7}});const g=w.cameraGoal(frame(46));
  assert.equal(g.distance,60);assert.equal(g.elevation,.7);assert.equal(g.target.x,10);w.qualify({camera:null});
  for(const l of w.subsystemLabels())assert(/^Name g\d$/.test(l.text),l.text);
  const catalog=await load('director');
  for(const intent of catalog.EFFECT_TYPES){const d=w.describe({intent,evidence:'verified',tier:3,subject:{fileIds:['g0f0'],fileId:'g0f0',groupId:'g0'},detail:{kinds:['recovery'],chapter:2,providers:[]}});
    if(!d)continue;const words=`${d.text} ${d.sub||''} ${d.banner||''}`;assert(!/\bg\df\d\b|\/|\\/.test(words),`${intent}: ${words}`);
    const x=w.explain({intent});assert(x&&x.observed&&x.interpreted&&x.rule&&x.artistic,intent);}
  w.dispose();
});
test('The host runs Genesis\'s matter on the canonical timeline, for built-in worlds only',()=>{
  const host=fs.readFileSync(path.join(__dirname,'../public/worlds/host.js'),'utf8');
  assert.match(host,/'genesis':'\.\/genesis-matter-world\.js'/);
  assert.match(host,/matter:matterFor\(next\)/);assert.match(host,/families\[next\.family\]\|\|next\.familyKind==='pack'\?null/);
  assert.match(host,/info\.matter=matterDriver\.update\(info/);
});

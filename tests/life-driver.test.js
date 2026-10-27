'use strict';
// Digital life on the performance timeline (public/worlds/life/driver.js, timeline.js): the ecosystem at a moment is
// the same whatever path playback took to reach it (continuous play at any frame rate, seeks back and forth, a
// checkpoint, a fresh session), it keeps living through long idle stretches with bounded memory, and canonical events
// change its conditions without ever adding events. Replays and films live in generations (10 min of view time each,
// a 60 s warm start): a far seek costs at most one generation, generation 0 is exactly the ecosystem as it was before
// generations, a live session has none. Rendering is qualified in a browser (qualification/visual/life.qual.js).
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>Promise.all([import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
const score=require('../public/score.js');
const T0=1750000000000,WIN=10000;
const group=(id,q,r)=>({id,type:'group',order:+id.slice(1),q,r,angle:q,counts:{function:3}});
const mod=(id,g,q,r)=>({id,type:'module',group:g,dir:'d',q,r,state:'draft',counts:{function:2}});
// A recorded performance: windows of 10 s, a subsystem founded every 8 windows, modules in between, frames with
// energy and tension, and intents (edits, a failure, a recovery, a verified milestone, a connection). Sessions with
// gaps between them: `gapMs` of silence after every `gapEvery` windows.
function recording(windows=60,{quietAfter=Infinity,gapEvery=0,gapMs=0}={}){
  const entries=[];let nodes=[group('g0',0,0),mod('m0','g0',0,0)];
  for(let k=0;k<windows;k++){
    const start=T0+k*WIN+(gapEvery?Math.floor(k/gapEvery)*gapMs:0),end=start+WIN,add=[];
    if(k&&k%8===0&&k<quietAfter){const g=`g${k/8}`;add.push(group(g,(k/8)%3*2-2,Math.floor(k/16)*2-1),mod(`m${k}`,g,0,0));}
    else if(k%3===1&&k<quietAfter)add.push(mod(`m${k}`,'g0',k%4,1));
    nodes=nodes.concat(add);
    const graph=k%6===0?{keyframe:true,nodes:nodes.slice(),edges:[]}:{add,remove:[],addEdges:[],removeEdges:[]};
    const quiet=k>=quietAfter,intents=[];
    const I=(type,dt,extra={})=>intents.push({v:1,id:`w${k}:${type}:${dt}`,type,ts:start+dt,tier:1,magnitude:.5,evidence:'observed',subject:{groupId:'g0'},detail:{},...extra});
    if(!quiet){I('structure.modified',1200);I('structure.modified',6100,{subject:{fileId:'m0'}});
      if(k===12)I('validation.failed',3000,{tier:2,evidence:'verified',subject:{fileIds:['m0']}});
      if(k===18)I('validation.recovered',4000,{tier:3,evidence:'verified',subject:{fileIds:['m0']}});
      if(k===24)I('milestone.achieved',5000,{tier:3,magnitude:.9,evidence:'verified',subject:{groupId:'g1'}});
      if(k===30)I('subsystem.connected',2000,{tier:2,evidence:'derived',subject:{groupId:'g1',targetGroupId:'g2'}});
      if(k%8===0&&k)I('subsystem.created',500,{tier:2,evidence:'derived',subject:{groupId:`g${k/8}`}});}
    entries.push({seq:k,start,end,frame:{start,end,chapter:1,controls:{energy:quiet?0:.3+.4*((k%7)/7),tension:k>=12&&k<18?.5:.1}},graph,intents});
  }
  return entries;
}
const grammar={id:'test',version:1,
  ecosystem:()=>({capacity:300,trail:6,bounds:{min:[-20,0,-20],max:[20,8,20]},field:{nx:32,nz:32},
    species:[{name:'a',share:.6,crowd:8,radius:1.4},{name:'b',share:.4,flow:1.2,settle:.01,orbit:0,radius:.9}],
    hooks:{current(x,y,z,t,c,out){out[0]=.4*Math.cos(t*.05+z*.1+c.swing);out[2]=.4*Math.sin(t*.05+x*.1);}}}),
  habitat:(model,t)=>[...model.districts.values()].filter(d=>model.districtBorn(d)<=t).map(d=>({id:d.id,x:d.q*4,y:3,z:d.r*4,r:1+.2*d.members.length,w:1}))};
// A player: delivers the recorded windows as playback reaches them (or all at once, as a replay primes) and renders.
async function player({entries,prime=true,speed=1,params={},live=false,film=false,opts={}}){
  const [{createLifeDriver},{createLifeTimeline}]=await load();
  const timeline=createLifeTimeline();
  let cfg={speed,tempo:96,epoch:T0,params,live,film};
  const driver=createLifeDriver({grammar,timeline,seed:1234,config:()=>cfg,score,...opts});
  if(prime)timeline.prime(entries);
  let next=0;
  const deliver=t=>{while(next<entries.length&&entries[next].start<=t){const e=entries[next++];timeline.structure(e.graph,e.start,e.end,e.seq);timeline.frame(e.frame,e.start);for(const i of e.intents)timeline.intent(i);}};
  const viewAt=t=>(t-T0)/1000/cfg.speed;
  return {driver,timeline,set:x=>{cfg={...cfg,...x};},
    // Render frames from t0 to t1 (performance ms) at `fps` frames per view second; returns the last view.
    play(t0,t1,fps=60,budgetMs=1e9){const step=1000*cfg.speed/fps;for(let k=0,t=t0;t<t1;t=t0+(++k)*step){deliver(t);driver.update({tview:viewAt(t)},{budgetMs});}deliver(t1);return driver.update({tview:viewAt(t1)},{budgetMs});},
    at(t,budgetMs=1e9){deliver(t);return driver.update({tview:viewAt(t)},{budgetMs});},
    seek(t){next=entries.findIndex(e=>e.start+WIN>t);if(next<0)next=entries.length;}};
}
const AT=T0+4*60000+1234;   // 4 min 1.234 s into the performance
test('F. The ecosystem at a moment is the same after continuous play, seeks back and forth, and in a fresh session',async()=>{
  const entries=recording(40);
  const ref=await player({entries});ref.at(AT);const want=ref.driver.digest();assert.match(want,/^[0-9a-f]{8}$/);
  // Continuous play from the start, delivering windows as they come (live-like: nothing primed).
  const cont=await player({entries,prime:false});cont.play(T0,AT,60);
  assert.equal(cont.driver.digest(),want,'continuous play (windows delivered as playback reaches them)');
  // Seek far ahead, back before the moment, then forward to it.
  const seeks=await player({entries});seeks.play(T0,T0+90000,30);seeks.at(T0+6*60000);seeks.seek(T0+60000);seeks.play(T0+60000,AT,30);
  assert.equal(seeks.driver.digest(),want,'forward, far ahead, back, forward again');
  // A checkpoint: past the moment, back to just before it (restored from a checkpoint, not from the start).
  const cp=await player({entries});cp.play(T0,AT+30000,20);const before=cp.driver.stats().fromCheckpoint;cp.at(AT);
  assert.equal(cp.driver.digest(),want,'restored from a checkpoint');assert(cp.driver.stats().fromCheckpoint>before,'a checkpoint was used');
  // Late deliveries (a seek re-schedules the window it lands in): duplicates change nothing.
  const dup=await player({entries});dup.play(T0,AT-20000,24);dup.timeline.prime(entries);dup.play(AT-20000,AT,24);
  assert.equal(dup.driver.digest(),want,'duplicate inputs are ignored');
});
test('G. Frame-rate independence: 15, 30, 60 and 120 frames per second reach the same state at the same tick',async()=>{
  const entries=recording(20);const t1=T0+150000+333;const digests=[];
  for(const fps of [15,30,60,120]){const p=await player({entries,prime:false});p.play(T0,t1,fps);digests.push(p.driver.digest());}
  assert.equal(new Set(digests).size,1,`digests ${digests.join(' ')}`);
  // Presentation interpolates between ticks; the state never depends on where in a tick a frame falls.
  const p=await player({entries});const a=p.at(t1);const b=p.at(t1+1);assert.equal(a.tick,b.tick);assert(b.alpha>=a.alpha);
});
test('Speed is part of the clock: the same performance at 4x reaches the same view time with the same ticks',async()=>{
  const entries=recording(30);const p=await player({entries,speed:4});const v=p.at(T0+4*60000);
  assert.equal(v.tick,Math.floor(60*20),'4 minutes at 4x is one minute of view time');
  const q=await player({entries,speed:4,prime:false});q.play(T0,T0+4*60000,30);assert.equal(q.driver.digest(),p.driver.digest());
});
test('H. Long idle: ten quiet minutes keep the population alive and moving, invent no events, and keep memory bounded',async()=>{
  const entries=recording(66,{quietAfter:6});   // one minute of work, then ten minutes with no events at all
  const p=await player({entries});const items=p.timeline.items.length;
  const pos=e=>{let s=0;for(let i=0;i<e.capacity;i++)if(e.alive[i])s+=e.px[i]+e.pz[i]*7;return s;};
  const minute=[];let prevPos=null;
  for(let m=1;m<=11;m++){const v=p.at(T0+m*60000);const e=v.eco,st=e.stats(),c=pos(e);
    minute.push({alive:st.alive,speed:st.meanSpeed,moved:prevPos===null?1:Math.abs(c-prevPos),modes:st.modes});prevPos=c;
    for(let i=0;i<e.capacity;i++)if(e.alive[i])assert(Number.isFinite(e.px[i])&&Number.isFinite(e.vx[i]));}
  assert.equal(p.timeline.items.length,items,'no input was created');
  const idle=minute.slice(2);
  for(const m of idle){assert(m.alive>=250,`population held (${m.alive})`);assert(m.speed>.2,`still moving (${m.speed.toFixed(2)})`);assert(m.moved>1,'positions keep changing');}
  // The behaviour keeps changing too: modes (exploring, gathering, dispersing, resting) are mixed in every minute.
  for(const m of idle)assert(Object.values(m.modes).filter(x=>x>5).length>=3,`mixed behaviour ${JSON.stringify(m.modes)}`);
  const s=p.driver.stats();assert(s.checkpoints.recent<=6&&s.checkpoints.sparse<=24,'bounded checkpoints');
});
test('I. Seeking across a long history: far seeks restore the exact state at the target, not the previous position',async()=>{
  const entries=recording(180);  // 30 minutes
  const p=await player({entries});let v=p.at(T0+60000);const near=p.driver.digest();
  const t0=performance.now();v=p.at(T0+29*60000,40);   // 40 ms budget: one frame of catching up
  assert(v.restoring&&v.progress<1,'a far seek reports that it is restoring, with progress');
  let frames=1;while(p.driver.view.restoring){v=p.at(T0+29*60000,40);frames++;}const ms=performance.now()-t0;
  const ref=await player({entries});ref.at(T0+29*60000);assert.equal(p.driver.digest(),ref.driver.digest(),'exact once restored');
  assert.notEqual(p.driver.digest(),near);
  // Back near the start: from a checkpoint (fast), exact.
  const t1=performance.now();p.at(T0+60000);const back=performance.now()-t1;assert.equal(p.driver.digest(),near);
  console.log(`# far seek 0:01 -> 29:00 restored in ${ms.toFixed(0)} ms over ${frames} frames (${p.driver.stats().lastRestoreTicks} ticks); back to 0:01 in ${back.toFixed(1)} ms`);
});
test('Events change conditions in kind: a failure disturbs its site, a recovery clears it, a verified milestone lasts',async()=>{
  const entries=recording(30);const p=await player({entries});
  const site=(id)=>{const e=p.driver.ecosystem;const k=e.sites.ids.indexOf(id);return k<0?null:e.sites.state(k);};
  p.at(T0+12*WIN+2000);assert.equal(site('g0').stress,0,'before the failure');
  p.at(T0+12*WIN+5000);assert(site('g0').stress>.2,'the failure strains its subsystem');
  const e=p.driver.ecosystem;let dist=0;for(let q=0;q<e.field.nx*e.field.nz;q++)dist+=e.field.data[2*e.field.nx*e.field.nz+q];assert(dist>0,'and disturbs the field around it');
  p.at(T0+18*WIN+5000);assert.equal(site('g0').stress,0,'the recovery clears it');
  p.at(T0+24*WIN+6000);assert.equal(site('g1').lasting,1,'a verified milestone leaves a lasting attractor');
  p.at(T0+29*WIN);assert.equal(site('g1').lasting,1,'and it stays');
  // An observed (unverified) milestone never lasts.
  const weak=recording(30).map(x=>({...x,intents:x.intents.map(i=>i.type==='milestone.achieved'?{...i,id:i.id+'w',evidence:'inferred'}:i)}));
  const q=await player({entries:weak});q.at(T0+29*WIN);const k=q.driver.ecosystem.sites.ids.indexOf('g1');assert.equal(q.driver.ecosystem.sites.state(k).lasting,0);
});
test('Silence and music: the climate comes from the recorded frames on the bar grid, so it is the same with sound off; sections change conditions',async()=>{
  const entries=recording(30);const p=await player({entries});p.at(T0+12*WIN+9000);
  assert.equal(p.driver.stats().climate.section,'tension','tension in the frames gives the tension section');
  const turb=p.driver.ecosystem.cond.turb;p.at(T0+26*WIN);assert(p.driver.ecosystem.cond.turb<turb,'turbulence relaxes once tension resolves');
  // Music influence 0: conditions stay neutral whatever the section.
  const flat=await player({entries,params:{music:0}});flat.at(T0+12*WIN+9000);assert(Math.abs(flat.driver.ecosystem.cond.turb-1)<1e-9);
});
test('Configuration: a replay rebuilds exactly for new life parameters; a live session keeps its population through the change',async()=>{
  const entries=recording(20);
  const r=await player({entries});r.at(T0+100000);r.set({params:{density:.5}});r.at(T0+100000);
  const ref=await player({entries,params:{density:.5}});ref.at(T0+100000);assert.equal(r.driver.digest(),ref.driver.digest(),'replay: same as starting with the new parameters');
  const l=await player({entries,live:true,prime:false});l.play(T0,T0+100000,30);const before=l.driver.ecosystem.px.slice();
  l.set({params:{vitality:1.5}});l.at(T0+100000);assert.deepEqual(Array.from(l.driver.ecosystem.px),Array.from(before),'live: the population continues from where it was');
});
test('Joining a live session late: only lasting conditions carry over from before the origin',async()=>{
  const [{createLifeDriver},{createLifeTimeline}]=await load();
  const timeline=createLifeTimeline();const origin=T0+20*WIN;
  const driver=createLifeDriver({grammar,timeline,seed:1,config:()=>({speed:1,tempo:96,epoch:origin,params:{},live:true}),score});
  driver.setBase({nodes:[group('g0',0,0),group('g1',2,0),mod('m0','g0',0,0),mod('m1','g1',0,0)],edges:[]},origin);
  for(const e of recording(20))for(const i of e.intents)timeline.intent(i);
  driver.update({tview:.05});const e=driver.ecosystem,st=id=>e.sites.state(e.sites.ids.indexOf(id));
  assert.equal(e.sites.count,2,'the habitat is the structure as joined');
  assert.equal(st('g0').stress,0,'an old failure does not strain the present');
  assert.equal(st('g1').lasting,0,'no verified milestone in this history yet');
});
test('Habitat data travels with the sites: after a restore the ecosystem holds the data of its own moment',async()=>{
  const [{createLifeDriver},{createLifeTimeline}]=await load();
  const withData={...grammar,habitat:(model,t)=>{const sites=grammar.habitat(model,t);return {sites,data:{key:sites.map(s=>s.id).join(',')}};}};
  const timeline=createLifeTimeline();timeline.prime(recording(30));
  const driver=createLifeDriver({grammar:withData,timeline,seed:5,config:()=>({speed:1,tempo:96,epoch:T0,params:{}}),score});
  driver.update({tview:250},{budgetMs:1e9});const late=driver.ecosystem.siteData.key;
  driver.update({tview:30},{budgetMs:1e9});const early=driver.ecosystem.siteData.key;
  assert.notEqual(late,early,'the habitat grew between the two moments');
  assert.equal(early,driver.ecosystem.sites.ids.join(','),'restored: the data matches the restored sites');
  assert.equal(driver.stats().fromCheckpoint>0||driver.stats().resets>1,true);
});

test('Intents are mapped on the structure where the ecosystem is: after a seek back, as in a fresh session',async()=>{
  // An intent about a module whose window starts 50 ms after the intent's own timestamp (windows are chosen by when
  // they were received): at the intent's moment the module does not exist yet, on every path to that moment.
  const entries=recording(30).map(e=>({...e,intents:[...e.intents]}));
  const w=entries[9];w.graph={add:[...(w.graph.add||w.graph.nodes),mod('mNew','g0',1,0)],remove:[],addEdges:[],removeEdges:[]};
  w.intents.push({v:1,id:'late:validation.failed',type:'validation.failed',ts:w.start-50,tier:2,magnitude:.8,evidence:'verified',subject:{fileIds:['mNew']},detail:{}});
  const at=T0+9*WIN+5000;   // the seek back restores the checkpoint at 80 s and consumes the intent again
  const fresh=await player({entries});fresh.at(at);
  const seek=await player({entries});seek.at(T0+29*WIN);seek.at(at);
  assert(seek.driver.stats().fromCheckpoint>0,'the seek back restored a checkpoint');
  assert.equal(seek.driver.digest(),fresh.driver.digest(),'same state after the seek back');
});
test('Live: a change of tempo (a music style) keeps the population; the bars continue from the current one',async()=>{
  const entries=recording(30);
  const l=await player({entries,live:true,prime:false});l.play(T0,T0+120000,20);const resets=l.driver.stats().resets,before=l.driver.ecosystem.px.slice();
  l.set({tempo:132});const v=l.at(T0+120000);
  assert.equal(l.driver.stats().resets,resets,'no rebuild');assert.equal(v.restoring,false);
  assert.deepEqual(Array.from(l.driver.ecosystem.px),Array.from(before),'the population continues from where it was');
  const v2=l.at(T0+125000);assert.equal(v2.tick,v2.target,'keeps up');assert.equal(v2.restoring,false);
});
test('Live: a long session folds its consumed inputs (bounded memory) and the ecosystem continues exactly; a new world starts from the folded base',async()=>{
  const entries=recording(60),AT2=T0+59*WIN;
  const whole=await player({entries,live:true,prime:false,opts:{rebaseAfter:Infinity}});whole.play(T0,AT2,20);
  let base=null;
  const folded=await player({entries,live:true,prime:false,opts:{rebaseAfter:40,onRebase:b=>{base=b;}}});folded.play(T0,AT2,20);
  assert(folded.driver.stats().rebases>=3,`folded ${folded.driver.stats().rebases} times`);
  assert(folded.timeline.items.length<whole.timeline.items.length/3,`inputs kept: ${folded.timeline.items.length} of ${whole.timeline.items.length}`);
  assert.equal(folded.driver.digest(),whole.driver.digest(),'the folded session is the same ecosystem');
  // Inputs at or before the last fold are history now: a late one is refused.
  assert.equal(folded.timeline.intent({v:1,id:'too-late',type:'validation.failed',ts:base.from-1,tier:2,magnitude:1,evidence:'verified',subject:{groupId:'g0'}}),false);
  // A world switched to now: its ecosystem is born at the base, not at the session's origin.
  const [{createLifeDriver}]=await load();
  const next=createLifeDriver({grammar,timeline:folded.timeline,seed:99,config:()=>({speed:1,tempo:96,epoch:T0,params:{},live:true,film:false}),score});
  next.setBase(base.graph,base.t,base.from);
  const v=next.update({tview:(AT2-T0)/1000},{budgetMs:1e9});
  assert(next.stats().ticks<=(AT2-base.from)/50+2,`caught up ${next.stats().ticks} ticks only`);
  assert.equal(v.tick,v.target);assert(next.stats().ecosystem.alive>100);
  assert.deepEqual([...next.ecosystem.sites.ids],[...folded.driver.ecosystem.sites.ids],'the base holds the same sites');
});
// ---- Generations (replays and films) -----------------------------------------------------------------------------------
// Digests of recording(66) recorded with the driver as it was before generations (commit 1c823e5), by a far seek from a
// fresh session and by continuous play at 20 fps (windows delivered as playback reaches them): generation 0 must keep
// them bit for bit. The live digest: recording(80) played live at 20 fps to 700 s.
const PIN_GEN0={1.234:'eb05e118',61.234:'5b020b5a',241.234:'2659289b',431.5:'dba8e2b7',599.95:'b9ca3162'},PIN_LIVE700='a0527add';
test('Generations: generation 0 is the ecosystem as it was before generations (pinned digests, seek and continuous play)',async()=>{
  const entries=recording(66);
  const p=await player({entries});
  for(const [v,want] of Object.entries(PIN_GEN0)){const view=p.at(T0+v*1000);assert.equal(p.driver.digest(),want,`${v} s`);assert.equal(view.generation,0);}
  const far=await player({entries});far.at(T0+599.95*1000);assert.equal(far.driver.digest(),PIN_GEN0[599.95],'a far seek to 9:59.95');
  const cont=await player({entries,prime:false});cont.play(T0,T0+599.95*1000,20);assert.equal(cont.driver.digest(),PIN_GEN0[599.95],'continuous play to 9:59.95');
});
test('Generations: a live session has none: one population past 10 min, no crossfade, the same ecosystem as before generations',async()=>{
  const l=await player({entries:recording(80),live:true,prime:false});l.play(T0,T0+598000,20);
  const seen=[];for(const t of [598500,599500,600000,600500,601500]){const v=l.at(T0+t);seen.push([v.generation,v.fadeIn]);}
  assert.deepEqual(seen,[[0,1],[0,1],[0,1],[0,1],[0,1]],'no generation and no fade at 10 min');
  l.play(T0+601500,T0+700000,20);const s=l.driver.stats();
  assert.equal(s.resets,1,'one population');assert.equal(s.generation,0);assert.equal(s.next,null);assert.equal(s.backgroundTicks,0);assert.equal(s.handovers,0);
  assert.equal(l.driver.digest(),PIN_LIVE700,'pinned: the live ecosystem at 11:40 is the one before generations');
});
test('Generations: a far seek in a long replay simulates at most one generation and its warm start, and reaches the state of continuous play through two anchors',async()=>{
  const [{GEN_TICKS,WARM_TICKS}]=await load();
  const entries=recording(240,{gapEvery:30,gapMs:20*60000});   // 8 sessions of 5 min, 20 min apart: 3 h
  const V=T0+10633400,s=17*GEN_TICKS-WARM_TICKS;   // 2:57:13.4: generation 17, 7:13.4 past its anchor
  const far=await player({entries});let t0=performance.now();const view=far.at(V);const farMs=performance.now()-t0,st=far.driver.stats();
  assert.equal(st.generation,17);assert.equal(st.ticks,view.target-s,'from the generation\'s warm start');assert(st.ticks<=GEN_TICKS+WARM_TICKS);
  // The worst case: the last tick of a generation (also preparing the next one in the background, within its budget).
  const end=await player({entries});t0=performance.now();end.at(T0+10799950);const endMs=performance.now()-t0,se=end.driver.stats();
  assert.equal(se.ticks,GEN_TICKS+WARM_TICKS-1,'one generation and its warm start, no more');assert.equal(se.generation,17);
  // Continuous play at 10 fps from a seek into generation 15: across the anchors of generations 16 and 17 (each handed
  // over to the runner prepared in the background) to the same moment.
  const cont=await player({entries});cont.at(T0+154*60000);cont.play(T0+154*60000,V,10);
  assert.equal(cont.driver.stats().generation,17);assert.equal(cont.driver.stats().handovers,2,'two anchors, two hand-overs');
  assert.equal(cont.driver.digest(),far.driver.digest(),'the far seek reaches the state continuous play reaches');
  console.log(`# far seek to 2:57:13 of a 3 h replay: ${st.ticks} ticks in ${farMs.toFixed(0)} ms (history pass ${st.historyMs} ms); to 2:59:59.95: ${se.ticks} ticks (+${se.backgroundTicks} in the background) in ${endMs.toFixed(0)} ms`);
});
test('Generations: the next generation prepared in the background changes nothing (the same state without it, in a replay and in a film)',async()=>{
  const [{WARM_TICKS}]=await load();
  const entries=recording(80),from=T0+8*60000,at=T0+(10*60+20)*1000;
  const on=await player({entries});on.at(from);on.play(from,at,15);
  const off=await player({entries,opts:{background:false}});off.at(from);off.play(from,at,15);
  const film=await player({entries,film:true});film.at(from);film.play(from,at,15);
  const ref=await player({entries});ref.at(at);
  assert.equal(on.driver.stats().handovers,1);assert.equal(on.driver.stats().backgroundTicks,WARM_TICKS,'the warm start, in the background');
  assert.equal(off.driver.stats().handovers,0);assert.equal(off.driver.stats().backgroundTicks,0);
  assert.equal(film.driver.stats().handovers,1);
  assert.equal(on.driver.digest(),off.driver.digest(),'with and without the background runner');
  assert.equal(film.driver.digest(),off.driver.digest(),'a film (paced background preparation, no frame budget)');
  assert.equal(ref.driver.digest(),on.driver.digest(),'a fresh session');
});
test('Generations: the view crossfades at an anchor (a pure function of view time); from the anchor on the state is the next generation\'s',async()=>{
  const [{crossfade,CROSS,GENERATION}]=await load();
  assert.equal(CROSS,2);assert.equal(GENERATION,600);
  assert.deepEqual([0,1,597,598,599,599.5,600,600.5,601,602,1199,1200,1201.5,7200.25].map(crossfade),[1,1,1,1,.5,.25,0,.25,.5,1,.5,0,.75,.125]);
  // A film (exact, never "restoring"): fadeIn is the crossfade alone; the shown generation changes at the anchor.
  const entries=recording(70);const p=await player({entries,film:true});p.at(T0+595000);
  const seen=[];for(const s of [596,598,599,599.5,599.95,600,600.5,601,602,603]){const v=p.at(T0+s*1000);seen.push([s,+v.fadeIn.toFixed(3),v.generation]);}
  assert.deepEqual(seen,[[596,1,0],[598,1,0],[599,.5,0],[599.5,.25,0],[599.95,.025,0],[600,0,1],[600.5,.25,1],[601,.5,1],[602,1,1],[603,1,1]]);
  assert.equal(p.driver.stats().handovers,1);
  // A replay: the same crossfade (after the fade-in that follows a restore).
  const r=await player({entries});r.at(T0+590000);r.play(T0+590000,T0+599500,20);assert.equal(+r.driver.view.fadeIn.toFixed(3),.25);
});
test('Generations: a checkpoint serves only its own generation',async()=>{
  const entries=recording(130);   // 21:40
  const ref=async t=>{const q=await player({entries});q.at(t);return q.driver.digest();};
  const p=await player({entries,opts:{background:false}});
  p.at(T0+605000);   // generation 1 from its warm start (9:00): its checkpoints at 9:00, 9:20, 9:40, 10:00
  let v=p.at(T0+590000),s=p.driver.stats();   // generation 0 at 9:50: those are earlier but not its own
  assert.equal(v.generation,0);assert.equal(s.restored,null,'no checkpoint restored');assert.equal(s.resets,2,'generation 0 from its start');
  assert.equal(p.driver.digest(),await ref(T0+590000));
  v=p.at(T0+600500);s=p.driver.stats();   // generation 1 again: its own checkpoint at the anchor
  assert.equal(v.generation,1);assert.deepEqual(s.restored,{gen:1,tick:12000});assert.equal(p.driver.digest(),await ref(T0+600500));
  p.at(T0+1205000);   // generation 2 from its warm start (19:00): checkpoints at 19:00, 19:20, 19:40, 20:00
  v=p.at(T0+1190000);s=p.driver.stats();   // generation 1 at 19:50: the latest checkpoint before it is generation 2's (19:40)
  assert.equal(v.generation,1);assert.equal(s.restored.gen,1,'generation 1\'s own checkpoint');assert(s.restored.tick<=12100);
  assert.equal(p.driver.digest(),await ref(T0+1190000));
});
test('Generations: a seek forward within a generation restores a later checkpoint rather than simulating the way there',async()=>{
  const entries=recording(40);const p=await player({entries});
  p.at(T0+300000);p.at(T0+60000);   // checkpoints up to 5:00, then back to 1:00
  const before=p.driver.stats().ticks;p.at(T0+290500);const s=p.driver.stats();
  assert.deepEqual(s.restored,{gen:0,tick:5800});assert.equal(s.ticks-before,10,'only the last half second simulated');
  const ref=await player({entries});ref.at(T0+290500);assert.equal(p.driver.digest(),ref.driver.digest());
});
test('Generations: preparing the next generation spreads its stages over frames (the shadow, the history pass, then the ticks), never in a frame with another',async()=>{
  const [{GEN_TICKS,WARM_TICKS}]=await load();
  const p=await player({entries:recording(80)});p.at(T0+509000);   // the next generation is prepared from 8:30 (90 s before its anchor)
  const seen=[];for(let k=0;k<=120;k++){p.at(T0+509000+k*1000/60,6);const s=p.driver.stats();if(s.next)seen.push([s.next.tick,s.backgroundTicks]);}
  const s0=GEN_TICKS-WARM_TICKS;
  assert.deepEqual(seen.slice(0,2),[[null,0],[s0,0]],'the shadow brought to the warm start, then the history pass alone (no tick)');
  assert(seen[2][1]>=1&&seen.slice(2).every(([t,n])=>t===s0+n),'then the ticks, from the warm start');
});

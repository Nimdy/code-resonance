'use strict';
// Digital life on the performance timeline (public/worlds/life/driver.js, timeline.js): the ecosystem at a moment is
// the same whatever path playback took to reach it (continuous play at any frame rate, seeks back and forth, a
// checkpoint, a fresh session), it keeps living through long idle stretches with bounded memory, and canonical events
// change its conditions without ever adding events. Rendering is qualified in a browser (qualification/visual/life.qual.js).
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>Promise.all([import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
const score=require('../public/score.js');
const T0=1750000000000,WIN=10000;
const group=(id,q,r)=>({id,type:'group',order:+id.slice(1),q,r,angle:q,counts:{function:3}});
const mod=(id,g,q,r)=>({id,type:'module',group:g,dir:'d',q,r,state:'draft',counts:{function:2}});
// A recorded performance: windows of 10 s, a subsystem founded every 8 windows, modules in between, frames with
// energy and tension, and intents (edits, a failure, a recovery, a verified milestone, a connection).
function recording(windows=60,{quietAfter=Infinity}={}){
  const entries=[];let nodes=[group('g0',0,0),mod('m0','g0',0,0)];
  for(let k=0;k<windows;k++){
    const start=T0+k*WIN,end=start+WIN,add=[];
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
async function player({entries,prime=true,speed=1,params={},live=false,film=false}){
  const [{createLifeDriver},{createLifeTimeline}]=await load();
  const timeline=createLifeTimeline();
  let cfg={speed,tempo:96,epoch:T0,params,live,film};
  const driver=createLifeDriver({grammar,timeline,seed:1234,config:()=>cfg,score});
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

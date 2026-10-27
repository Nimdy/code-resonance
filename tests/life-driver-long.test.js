'use strict';
// Digital life over long stretches (public/worlds/life/driver.js, timeline.js): far seeks across a long history restore
// the exact state at the target, a long live session folds its consumed inputs (bounded memory) and continues exactly,
// and the next generation prepared in the background over a replay or a film changes nothing. Shared fixture:
// life-driver-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {load,score,T0,WIN,recording,grammar,player}=require('./life-driver-fixture.js');
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

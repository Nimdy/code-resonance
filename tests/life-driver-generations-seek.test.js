'use strict';
// Digital life, seeking in generations (public/worlds/life/driver.js): a far seek in a long replay costs at most one
// generation and its warm start and reaches the state of continuous play, a checkpoint serves only its own generation,
// and a seek forward within a generation restores a later checkpoint. Shared fixture: life-driver-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {load,T0,recording,player}=require('./life-driver-fixture.js');
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

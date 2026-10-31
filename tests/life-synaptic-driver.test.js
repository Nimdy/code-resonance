'use strict';
// Synaptic Storm's digital life on the performance timeline (public/worlds/life/driver.js with life/synaptic.js): the
// ecosystem at a moment is bit-identical whatever path playback took (continuous play at any frame rate, seeks back
// and forth, a checkpoint, a fresh session); the recorded events change it only through their influences (a failure
// strains the neurons of the files it covers). Ecology 2 and idle life: tests/life-synaptic-driver-ecology.test.js.
// Fixture: tests/life-synaptic-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,recording,player}=require('./life-synaptic-fixture.js');
const AT=T0+100000+1234;   // 1 min 41.234 s into the performance
for(const [name,params] of [['ecology 1',{enabled:true}]]){
  test(`${name}: the ecosystem at a moment is the same after continuous play, seeks, a checkpoint and in a fresh session`,async()=>{
    const entries=recording(24);
    const ref=await player({entries,params});ref.at(AT);const want=ref.driver.digest();assert.match(want,/^[0-9a-f]{8}$/);
    const cont=await player({entries,params,prime:false});cont.play(T0,AT,30);assert.equal(cont.driver.digest(),want,'continuous play, windows delivered as playback reaches them');
    const seeks=await player({entries,params});seeks.at(T0+130000);seeks.at(T0+30000);seeks.play(T0+30000,AT,20);assert.equal(seeks.driver.digest(),want,'far ahead, back, forward again');
    const cp=await player({entries,params});cp.play(AT-8000,AT+22000,15);const before=cp.driver.stats().fromCheckpoint;cp.at(AT);
    assert.equal(cp.driver.digest(),want,'restored from a checkpoint');assert(cp.driver.stats().fromCheckpoint>before,'a checkpoint was used');
    if(name==='ecology 1'){const fast=await player({entries,params,prime:false});fast.play(T0,AT,60);assert.equal(fast.driver.digest(),want,'60 frames per second');}
  });
}
test('Events act only through their influences: a failure strains the neurons of the files it covers, a recovery clears them',async()=>{
  const entries=recording(24);const p=await player({entries});
  const state=id=>{const e=p.driver.ecosystem,k=e.sites.ids.indexOf(id);return k<0?null:e.sites.state(k);};
  p.at(T0+10*10000+2000);   // just before the failure (window 10, 3 s in)
  const s0=state('g0#0');assert(s0&&s0.stress===0,'before the failure');
  p.at(T0+10*10000+6000);const s1=state('g0#0'),other=state('g1#0');
  assert(s1.stress>.15,`the failure strains the neuron of g0's files (${s1.stress})`);assert(other.stress>.15,'and of g1\'s covered file');
  p.at(T0+14*10000+8000);assert.equal(state('g0#0').stress,0,'the recovery clears it');
  p.at(T0+19*10000);assert.equal(state('g1#0').lasting,1,'a verified milestone on a subsystem lasts at its hub');
  // without the failure and the recovery, the same performance gives another ecosystem; the inputs are not added to
  const quiet=entries.map(e=>({...e,intents:e.intents.filter(i=>!/^validation\./.test(i.type))}));const q=await player({entries:quiet});q.at(T0+16*10000);
  p.at(T0+16*10000);assert.notEqual(q.driver.digest(),p.driver.digest());assert.equal(p.timeline.items.length,new Set(p.timeline.items.map(x=>x.key)).size);
});

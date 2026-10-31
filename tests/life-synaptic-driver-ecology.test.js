'use strict';
// Synaptic Storm's digital life on the performance timeline, continued (own file: Node's test timeout and CI's slower
// runners): ecology 2 (the climate read from the music) is as exact across seeks and checkpoints as ecology 1, and idle
// life keeps living without inventing inputs. Fixture: tests/life-synaptic-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,recording,player}=require('./life-synaptic-fixture.js');
const AT=T0+100000+1234;   // 1 min 41.234 s into the performance
for(const [name,params] of [['ecology 2',{enabled:true,ecology:2,music:1}]]){
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
test('Idle: three quiet minutes after the last event keep the population alive and moving, invent no input, keep memory bounded',async()=>{
  const entries=recording(16);const p=await player({entries});const items=p.timeline.items.length;let prev=null;
  for(let m=3;m<=6;m++){const v=p.at(T0+m*60000),e=v.eco,st=e.stats();let s=0,awake=0;
    for(let i=0;i<e.capacity;i++)if(e.alive[i]&&e.ia[i*2+1]!==1){s+=e.px[i]+7*e.pz[i];awake++;}
    assert(awake>=300,`awake ${awake}`);assert(st.meanSpeed>.05,`moving ${st.meanSpeed}`);if(prev!==null)assert(Math.abs(s-prev)>1,'positions keep changing');prev=s;
    assert(Object.values(st.modes).filter(x=>x>5).length>=3,`mixed behaviour ${JSON.stringify(st.modes)}`);}
  assert.equal(p.timeline.items.length,items,'no input was created');
  const s=p.driver.stats();assert(s.checkpoints.recent<=6&&s.checkpoints.sparse<=24,'bounded checkpoints');
});

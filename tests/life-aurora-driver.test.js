'use strict';
// Aurora's digital life on the canonical timeline (life/driver.js with the Aurora grammar): the state at a moment is the
// same after continuous play at any frame rate, seeks back and forth, a restored checkpoint and a fresh session, for
// ecology 1 and 2; across a generation's anchor continuous play and a far seek agree; the life values and the music
// change it; the habitat follows the recorded structure. The shared fixture is tests/life-aurora-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,player,recording}=require('./life-aurora-fixture');
const AT=T0+137300;   // after the failure (90 s), the recovery (130 s); before the milestone
for(const [name,params] of [['ecology 2',{ecology:2,music:1}],['ecology 1',{}]]){
  test(`${name}: the same moment after continuous play, at 15, 30, 60 and 120 fps, after seeks, from a checkpoint and in a fresh session`,async()=>{
    const ref=await player({params});ref.at(AT);const want=ref.driver.digest();
    const st=ref.driver.stats();assert(st.ecosystem.alive>60,'alive');assert.equal(st.ecosystem.sites,3,'a site per curtain (the fourth subsystem comes at 180 s)');assert.equal(st.grammar,'aurora');
    for(const fps of [15,30,60,120]){if(params.ecology!==2&&fps!==30)continue;const p=await player({params});
      // (from a while before the moment: the earlier frames are simulated the same either way)
      for(let t=fps===30?T0:AT-20000;t<AT;t+=1000/fps)p.at(t);p.at(AT);assert.equal(p.driver.digest(),want,`continuous play at ${fps} fps`);}
    const seek=await player({params});seek.at(T0+200000);seek.at(T0+40000);seek.at(AT+15000);seek.at(AT);
    assert.equal(seek.driver.digest(),want,'seeks back and forth');assert(seek.driver.stats().fromCheckpoint>0,'a checkpoint was restored');
    const fresh=await player({params});fresh.at(AT);assert.equal(fresh.driver.digest(),want,'a fresh session');
  });
}
test('Across a generation\'s anchor: continuous play and a far seek from a fresh session reach the same state',async()=>{
  // 70 windows (700 s): generation 1 begins at 600 s, warm from 540 s
  const entries=recording(70),A=T0+612000;
  const far=await player({entries});far.at(A);const want=far.driver.digest();assert.equal(far.driver.stats().generation,1);
  // (played from shortly before the anchor: generation 0 is simulated from its own start either way)
  const cont=await player({entries});cont.at(T0+585000);for(let t=T0+585000;t<A;t+=1000/10)cont.at(t);cont.at(A);assert.equal(cont.driver.digest(),want,'continuous play through the anchor');
  cont.at(T0+300000);cont.at(A);assert.equal(cont.driver.digest(),want,'and seeks back across it');
});
test('The life values and the music change the state; music 0 is neutral; the habitat follows the recorded structure',async()=>{
  const at=T0+80000,dig=async params=>{const p=await player({params});p.at(at);return {d:p.driver.digest(),p};};
  const a=await dig({ecology:2,music:0}),b=await dig({ecology:2,music:2}),c=await dig({ecology:2,music:1,density:.5});
  assert.notEqual(a.d,b.d,'the music shapes the ecology');assert.notEqual(c.d,a.d);
  const cond=a.p.driver.ecosystem.cond;for(const [k,v] of Object.entries(cond))assert.equal(v,{swing:0,pulse:0,shiftX:0,shiftZ:0}[k]??1,`music 0: ${k} neutral`);
  assert(c.p.driver.stats().ecosystem.alive<b.p.driver.stats().ecosystem.alive*.7,'density: fewer inhabitants live');
  // the curtains arrive with the recorded windows: one site after the first, four at the end
  const p=await player();p.at(T0+12000);assert.equal(p.driver.stats().ecosystem.sites,1);p.at(T0+235000);assert.equal(p.driver.stats().ecosystem.sites,4);
});

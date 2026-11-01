'use strict';
// Aurora's digital life on the canonical timeline (life/driver.js with the Aurora grammar), ecology 2: the state at a
// moment is the same after continuous play at 15, 30, 60 and 120 fps, seeks back and forth, a restored checkpoint and a
// fresh session; the life values and the music change it; the habitat follows the recorded structure. Ecology 1 and a
// generation's anchor are in tests/life-aurora-generations.test.js (one file took more than the 120 s a file may take on
// a two-core runner). The shared fixture is tests/life-aurora-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,player,sameMoment}=require('./life-aurora-fixture');
test('ecology 2: the same moment after continuous play, at 15, 30, 60 and 120 fps, after seeks, from a checkpoint and in a fresh session',()=>sameMoment({ecology:2,music:1}));
test('The life values and the music change the state; music 0 is neutral; the habitat follows the recorded structure',async()=>{
  const at=T0+80000,dig=async params=>{const p=await player({params});p.at(at);return {d:p.driver.digest(),p};};
  const a=await dig({ecology:2,music:0}),b=await dig({ecology:2,music:2}),c=await dig({ecology:2,music:1,density:.5});
  assert.notEqual(a.d,b.d,'the music shapes the ecology');assert.notEqual(c.d,a.d);
  const cond=a.p.driver.ecosystem.cond;for(const [k,v] of Object.entries(cond))assert.equal(v,{swing:0,pulse:0,shiftX:0,shiftZ:0}[k]??1,`music 0: ${k} neutral`);
  assert(c.p.driver.stats().ecosystem.alive<b.p.driver.stats().ecosystem.alive*.7,'density: fewer inhabitants live');
  // the curtains arrive with the recorded windows: one site after the first, four at the end
  const p=await player();p.at(T0+12000);assert.equal(p.driver.stats().ecosystem.sites,1);p.at(T0+235000);assert.equal(p.driver.stats().ecosystem.sites,4);
});

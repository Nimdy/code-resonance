'use strict';
// Aurora's digital life on the canonical timeline, ecology 1, and across a generation's anchor: the state at a moment is
// the same after continuous play, seeks back and forth, a restored checkpoint and a fresh session; continuous play
// through a generation's anchor and a far seek agree. (Ecology 2, the life values and the music: life-aurora-driver.)
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,player,recording,sameMoment}=require('./life-aurora-fixture');
test('ecology 1: the same moment after continuous play, after seeks, from a checkpoint and in a fresh session',()=>sameMoment({}));
test('Across a generation\'s anchor: continuous play and a far seek from a fresh session reach the same state',async()=>{
  // 70 windows (700 s): generation 1 begins at 600 s, warm from 540 s
  const entries=recording(70),A=T0+612000;
  const far=await player({entries});far.at(A);const want=far.driver.digest();assert.equal(far.driver.stats().generation,1);
  // (played from shortly before the anchor: generation 0 is simulated from its own start either way)
  const cont=await player({entries});cont.at(T0+585000);for(let t=T0+585000;t<A;t+=1000/10)cont.at(t);cont.at(A);assert.equal(cont.driver.digest(),want,'continuous play through the anchor');
  cont.at(T0+300000);cont.at(A);assert.equal(cont.driver.digest(),want,'and seeks back across it');
});

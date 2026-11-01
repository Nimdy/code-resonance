'use strict';
// Digital life in generations (public/worlds/life/driver.js): replays and films live in generations (10 min of view
// time each, a 60 s warm start). Generation 0 is exactly the ecosystem as it was before generations (pinned digests),
// a live session has none, the view crossfades at an anchor, and preparing the next generation is spread over frames.
// Seeks within and across generations: life-driver-generations-seek.test.js. Shared fixture: life-driver-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {load,T0,recording,player}=require('./life-driver-fixture.js');
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
test('Generations: preparing the next generation spreads its stages over frames (the shadow, the history pass, then the ticks), never in a frame with another',async()=>{
  const [{GEN_TICKS,WARM_TICKS}]=await load();
  const p=await player({entries:recording(80)});p.at(T0+509000);   // the next generation is prepared from 8:30 (90 s before its anchor)
  const seen=[];for(let k=0;k<=120;k++){p.at(T0+509000+k*1000/60,6);const s=p.driver.stats();if(s.next)seen.push([s.next.tick,s.backgroundTicks]);}
  // The shadow takes as many frames as its deltas need within the frame's budget: one on a fast machine, more on a loaded
  // one (a Windows runner took two), so the stages are checked in order, not at fixed frames.
  const s0=GEN_TICKS-WARM_TICKS,h=seen.findIndex(([t])=>t!==null);
  assert(h>=1&&seen.slice(0,h).every(([t,n])=>t===null&&n===0),'first the shadow brought to the warm start, alone');
  assert.deepEqual(seen[h],[s0,0],'then the history pass alone (no tick)');
  assert(seen[h+1][1]>=1&&seen.slice(h+1).every(([t,n])=>t===s0+n),'then the ticks, from the warm start');
});

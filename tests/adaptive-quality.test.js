'use strict';
// Auto quality (public/worlds/host.js createQualityGovernor): how quickly live playback steps down on a slow machine,
// that it does not oscillate, and when it reports that no level makes WebGL usable. Frame times are simulated; the
// real-browser measurements are in docs/QUALIFICATION.md ("Auto quality").
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../public/worlds/host.js');
// Presents frames for `seconds` from `t` at the frame rate `fps(level, t)` (fps may be fractional); returns the end time
// and every level change with the time it happened.
function run(g,fps,seconds,t=0){const end=t+seconds,changes=[];
  while(t<end){t+=1/fps(g.level,t);const c=g.frame(t);if(c)changes.push({...c,at:+t.toFixed(2)});}
  return {t,changes};}
// A machine whose frame time is proportional to the pixels drawn (MSAA ≈ 1.35× a frame without it).
const COST=[1.35,1,.5625,.3025],fillBound=fullFps=>level=>Math.min(60,fullFps*COST[0]/COST[level]);
test('Auto steps down within about two seconds of sustained slow frames, one level at a time',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor();
  const {changes}=run(g,level=>[21,40,60,60][level],30);
  assert.equal(g.level,1,'21 fps at High: one step (MSAA off) is expected to be enough');
  assert.equal(changes.length,1);assert.equal(changes[0].reason,'slow');
  assert(changes[0].at<=1.5+2.6,`stepped down at ${changes[0].at} s (start-up 1.5 s excluded)`);
});
test('Slow frames that MSAA alone cannot rescue go straight to a lower resolution',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor();
  const {changes}=run(g,level=>[18,19,60,60][level],30);
  assert.deepEqual(changes.map(c=>[c.from,c.to,c.reason]),[[0,2,'slow']]);
});
test('Frames far too slow skip levels at once',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor();
  const {changes}=run(g,fillBound(7),20);
  assert.equal(changes[0].reason,'very-slow');assert(changes[0].to-changes[0].from>=2,JSON.stringify(changes));
  assert(changes[0].at<=1.5+1.6,`jumped at ${changes[0].at} s`);
});
test('A level whose frame rate hovers around the threshold does not oscillate over a minute',async()=>{
  const {createQualityGovernor}=await load();
  // Medium runs at 26-34 fps; High would be 19-25 fps: Auto must settle at Medium and stay.
  const g=createQualityGovernor();
  const {changes}=run(g,(level,t)=>{const k=1+.13*Math.sin(t*1.7);return level===0?22*k:level===1?30*k:60;},60);
  assert.equal(g.level,1);assert.equal(changes.length,1,JSON.stringify(changes));
});
test('Auto climbs back only after a long stable period, never right after a step down',async()=>{
  const {createQualityGovernor,AUTO_QUALITY}=await load();const g=createQualityGovernor();
  // A busy machine for 6 s (another program), then idle: the full rate comes back.
  let {t,changes}=run(g,(level,t)=>t<6?10:60,6);
  assert(g.level>0);const down=changes.at(-1).at;
  ({changes}=run(g,()=>60,90,t));
  const up=changes.find(c=>c.reason==='headroom');
  assert(up&&up.at-down>=AUTO_QUALITY.upAfter,`first step up ${up?.at} s, after the step down at ${down} s`);
  assert(changes.every(c=>c.reason==='headroom'),'only steps up while frames are at the refresh rate');
  assert.equal(g.level,0,'back at High, one level per stable period');
});
test('A step up that cannot be held makes the next attempt wait much longer (no ping-pong)',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor();
  // High is unusable (15 fps), Medium is at the refresh rate: from Medium nothing says High would fail.
  const {changes}=run(g,level=>level===0?15:60,300);
  const ups=changes.filter(c=>c.reason==='headroom');
  assert(ups.length<=3,`${ups.length} attempts in 5 minutes: ${JSON.stringify(changes)}`);
  assert(changes.filter(c=>c.at<60).length<=4,'first minute: down, up to Medium, one attempt at High and back');
  assert.deepEqual(changes.filter(c=>c.reason==='failed-step-up').map(c=>[c.from,c.to]),changes.filter(c=>c.reason==='failed-step-up').map(()=>[0,1]),'a failed attempt goes back to the level that held');
  assert(g.hold(0)>=60);
});
test('A cost-bound machine does not climb to a level predicted to be slow',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor();
  const {changes}=run(g,fillBound(15),120);
  // 15 fps at High: Medium 20, Low 36: Auto settles at Low and the climb to Medium (20 fps predicted) is not tried.
  assert.equal(g.level,2,JSON.stringify(changes));assert(changes.length<=2,JSON.stringify(changes));
});
test('A GPU fast enough for High stays at High (vsync-limited and 26 fps alike)',async()=>{
  const {createQualityGovernor}=await load();
  for(const rate of [60,26]){const g=createQualityGovernor();const {changes}=run(g,(level,t)=>rate*(1+.04*Math.sin(t*3)),60);
    assert.equal(g.level,0,`${rate} fps`);assert.equal(changes.length,0);}
});
test('Under 8 fps at the lowest level for several seconds is reported as degraded, and clears when frames recover',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor();
  let {t}=run(g,()=>5,4);assert.equal(g.level,3,'jumped to the lowest level');assert.equal(g.degraded,false,'not yet: the lowest level gets its chance');
  ({t}=run(g,()=>5,8,t));assert.equal(g.degraded,true);
  ({t}=run(g,()=>40,12,t));assert.equal(g.degraded,false);
  // 12 fps at the lowest level is slow but usable: not degraded.
  const h=createQualityGovernor({level:3});run(h,()=>12,30);assert.equal(h.degraded,false);
});
test('A fixed quality never changes level, but a machine under 8 fps is still reported',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor({floor:1,adaptive:false});
  const {changes}=run(g,()=>5,20);assert.equal(changes.length,0);assert.equal(g.level,1);assert.equal(g.degraded,true);
  g.configure({floor:2,adaptive:false});assert.equal(g.level,2);assert.equal(g.degraded,false,'a new choice is measured anew');
});
test('Auto never goes above the floor and starts where the previous world settled',async()=>{
  const {createQualityGovernor}=await load();
  const g=createQualityGovernor({floor:2,level:3});assert.equal(g.level,3);run(g,()=>60,120);assert.equal(g.level,2);
  assert.equal(createQualityGovernor({floor:2,level:0}).level,2);
  assert.equal(createQualityGovernor({floor:0,level:3,adaptive:false}).level,0,'a fixed level ignores the start level');
});
test('A pause (hidden tab, stage not shown) is not a slow frame; frames over a second apart still count when they persist',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor();
  let {t}=run(g,()=>60,5);g.frame(t+30);({t}=run(g,()=>60,5,t+30));assert.equal(g.level,0);assert.equal(g.changes,0);
  const s=createQualityGovernor();run(s,()=>.7,20);assert(s.level>0,'0.7 fps is slow, not a series of pauses');
});
test('At the refresh rate, the GPU time decides whether the level above can be held',async()=>{
  const {createQualityGovernor}=await load();
  // Low at 60 fps with 25 ms of GPU work per frame: Medium would need about 44 ms (22 fps): not tried.
  let g=createQualityGovernor({level:2}),changes=[],t=0;
  for(;t<120;t+=1/60){const c=g.frame(t,25);if(c)changes.push(c);}
  assert.equal(g.level,2);assert.equal(changes.length,0);
  // 8 ms per frame: Medium needs about 14 ms: Auto climbs (and on to High, 19 ms).
  g=createQualityGovernor({level:2});for(t=0;t<120;t+=1/60)g.frame(t,8*[1.35,1,.5625,.3025][g.level]/.5625);
  assert.equal(g.level,0);
});
// Presents frames like run(), with the GPU time per frame `gpu(level, t)` (ms) that the browser would report.
function runGpu(g,fps,gpu,seconds,t=0){const end=t+seconds,changes=[];
  while(t<end){t+=1/fps(g.level,t);const c=g.frame(t,gpu(g.level,t));if(c)changes.push({...c,at:+t.toFixed(2)});}
  return {t,changes};}
test('Slow frames while the GPU is mostly idle (processor-bound, a busy machine) keep the level; under 8 fps they are reported',async()=>{
  const {createQualityGovernor}=await load();
  let g=createQualityGovernor();let {changes}=runGpu(g,()=>20,()=>6,60);
  assert.equal(g.level,0);assert.equal(changes.length,0,'fewer pixels would not make these frames faster');assert.equal(g.degraded,false);
  g=createQualityGovernor();({changes}=runGpu(g,()=>5,()=>6,20));
  assert.equal(changes.length,0);assert.equal(g.degraded,true,'no level helps: degraded at High');
});
test('With GPU time: a GPU shared with another program for a few seconds, then High again within about a minute, without oscillating',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor();
  // 25 ms of GPU work at High (about 38 fps, the AMD integrated GPU at 1920x1080); for 5 s another program takes the GPU.
  const ms=(level,t)=>25*COST[level]/COST[0]*(t<5?2.4:1),fps=(level,t)=>Math.min(60,1000/ms(level,t));
  let {t,changes}=runGpu(g,fps,ms,5);assert(g.level>0,'stepped down while the GPU was shared');
  const down=changes.at(-1).at;
  ({changes}=runGpu(g,fps,ms,120,t));
  assert.equal(g.level,0,JSON.stringify(changes));assert(changes.every(c=>c.reason==='headroom'),JSON.stringify(changes));
  assert(changes.at(-1).at-down<=70,`back at High ${changes.at(-1).at-down} s after the step down`);
});
test('A failed step up waits three times longer; a level then held through its probation halves its wait again',async()=>{
  const {createQualityGovernor}=await load();const g=createQualityGovernor({level:1});
  // High predicted from Medium (20 ms × 1.35 = 27 ms) but really 50 ms for the first minute (the cost model is wrong here).
  const ms=(level,t)=>level===0?(t<60?50:24):level===1?20:12,fps=(level,t)=>Math.min(60,1000/ms(level,t));
  const {changes}=runGpu(g,fps,ms,300);
  assert(changes.some(c=>c.reason==='failed-step-up'),JSON.stringify(changes));
  assert.equal(g.level,0,'High once it can be held');assert.equal(g.hold(0),30,'one failure (×3), then held through probation (÷2)');
});

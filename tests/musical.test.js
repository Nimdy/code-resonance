'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
globalThis.ResonanceScore=require('../public/score.js');
const load=()=>Promise.all([import('../public/worlds/musical.js'),import('../public/worlds/life/timeline.js')]);
const T0=1750000000000;
function timeline(createLifeTimeline){
  const tl=createLifeTimeline();
  for(let i=0;i<60;i++)tl.frame({end:T0+i*5000+5000,chapter:6,controls:{energy:i%12<6?.8:.15,tension:i>=30&&i<34?.7:.05},milestones:i===40?['validation.test.passed']:i===20?['validation.test.failed']:[]},T0+i*5000);
  return tl;
}
test('The musical clock reads the score at a performance time from canonical frames only',async()=>{
  const [{createMusical},{createLifeTimeline}]=await load();
  const tl=timeline(createLifeTimeline),a=createMusical({timeline:tl}),b=createMusical({timeline:tl});
  for(const m of [a,b])m.configure({version:3,style:'cinematic',seed:4242,tempo:90,profile:{evolution:.7}});
  const times=[0,13700,61000,151000,200000,299000].map(x=>T0+x);
  assert.deepEqual(times.map(t=>a.at(t)),times.map(t=>b.at(t)));
  for(const t of times){const e=a.at(t);assert.equal(e.version,3);
    for(const k of ['energy','tension','density','melody','rhythm','dynamics','transition','onset','release','pulse','barPulse'])assert(e[k]>=0&&e[k]<=1,`${k}=${e[k]}`);}
  // Sustained tension (frames 30..33) takes a passage over; the passage after it resolves.
  const B=240000/90,roles=new Set();for(let t=T0+150000;t<T0+215000;t+=B)roles.add(a.at(t).role);
  assert(roles.has('tension')&&roles.has('resolve'),[...roles].join());
  // Only the verified success lifts the music; the failure at frame 20 does not.
  const lifted=[];for(let t=T0;t<T0+300000;t+=B*8)if(a.conducted(Math.floor(t/B)).lift)lifted.push(Math.round((t-T0)/1000));
  assert(lifted.length>=1&&lifted.every(s=>s>=200&&s<=240),lifted.join());
});
test('A v2 identity is described by the music it actually plays (its own section rule and layers)',async()=>{
  const [{createMusical},{createLifeTimeline}]=await load();
  const m=createMusical({timeline:timeline(createLifeTimeline)});m.configure({version:2,style:'ambient',seed:7,tempo:80});
  const e=m.at(T0+120000);assert.equal(e.version,2);assert(['statement','development','tension','resolve','return','release'].includes(e.role));
  m.configure({version:3});assert.equal(m.at(T0+120000).version,3);
});
test('Without a score (a code pack\'s isolated frame), the clock answers null instead of failing',async()=>{
  const [{createMusical},{createLifeTimeline}]=await load();
  const m=createMusical({timeline:timeline(createLifeTimeline),score:null});m.configure({version:3,style:'ambient',seed:1,tempo:90});
  assert.equal(m.at(T0+5000),null);
});

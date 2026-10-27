'use strict';
// Artist particle populations (public/worlds/layers-swarm.js): fixed-step, seeded, and the moment shown is the same
// whether playback reached it continuously or seeked to it (the generation pattern of the digital life's replays).
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../public/worlds/layers-swarm.js');
const SITES=[{x:0,y:0,z:0,r:1},{x:1.3,y:.2,z:-.5,r:.45},{x:-1.1,y:-.1,z:.9,r:.5}];
const PARAMS={behavior:'swarm',distribution:'cloud',spread:1,cohesion:.5,separation:.4,alignment:.5,attraction:.3,speed:.6,lifetime:8};
test('The same seed and inputs give the same population, tick for tick; another seed another one',async()=>{
  const {createSwarm,sitesOf,simParams}=await load();const S=sitesOf(SITES),P=simParams(PARAMS);
  const run=seed=>{const s=createSwarm({seed,capacity:600});s.populate(S,P);for(let k=0;k<150;k++)s.step(P,S,k/15);return s.digest();};
  assert.equal(run(7),run(7));assert.notEqual(run(7),run(8));
  // Pinned: a change to the stepping changes every population drawn from it (films included).
  assert.equal(run(7),'f6c501bc');
});
test('A seek shows the population continuous play reaches (warm start of the generation)',async()=>{
  const {createRunner,sitesOf,simParams,GEN}=await load();const S=sitesOf(SITES);
  // Inputs vary with time (as mapped music does): pure functions of the tick's view time.
  const inputsAt=t=>({P:simParams({...PARAMS,cohesion:.3+.3*Math.sin(t*.2)}),S});
  const v=GEN*2+3.37,a=createRunner({seed:5,capacity:500,inputsAt}),b=createRunner({seed:5,capacity:500,inputsAt});
  for(let t=0;t<v;t+=1/30)a.advance(t);
  const A=a.advance(v),B=b.advance(v);
  assert.deepEqual(A.map(x=>x.g),B.map(x=>x.g));assert.deepEqual(A.map(x=>x.swarm.digest()),B.map(x=>x.swarm.digest()));
  assert.deepEqual(A.map(x=>+x.alpha.toFixed(6)),B.map(x=>+x.alpha.toFixed(6)));
  // A seek backwards rebuilds the earlier moment exactly too.
  const back=a.advance(GEN+1.5),fresh=createRunner({seed:5,capacity:500,inputsAt}).advance(GEN+1.5);
  assert.deepEqual(back.map(x=>x.swarm.digest()),fresh.map(x=>x.swarm.digest()));
});
test('Generations hand over by crossfade: the weights always sum to one, never a pop',async()=>{
  const {shown,needed,GEN,CROSS,WARM}=await load();
  for(let v=GEN-3;v<GEN+3;v+=.05){const s=shown(v),w=s.reduce((a,x)=>a+x.w,0);assert(Math.abs(w-1)<1e-9,`v=${v}: ${w}`);}
  assert.equal(shown(GEN-CROSS-.1).length,1);assert.equal(shown(GEN).length,2);assert.equal(shown(GEN+CROSS+.1).length,1);
  // The next generation is being prepared before it is shown.
  assert(needed(GEN-WARM+.1).includes(1)&&!shown(GEN-WARM+.1).some(x=>x.g===1));
});
test('Behaviours organise the same particles differently (and stay near their sites)',async()=>{
  const {createSwarm,sitesOf,simParams}=await load();const S=sitesOf([{x:0,y:0,z:0,r:1}]);
  const metrics=behavior=>{const P=simParams({...PARAMS,behavior}),s=createSwarm({seed:3,capacity:800});s.populate(S,P);for(let k=0;k<180;k++)s.step(P,S,k/15);
    let r=0;for(let i=0;i<s.capacity;i++)r=Math.max(r,Math.hypot(s.px[i],s.py[i],s.pz[i]));return {...s.metrics,reach:r};};
  const orbit=metrics('orbit'),flock=metrics('flock'),drift=metrics('drift'),swarm=metrics('swarm');
  assert(flock.coherence>orbit.coherence+.2,`flock ${flock.coherence} vs orbit ${orbit.coherence}`);
  assert(drift.current<flock.current,'drifting spores are slower than a flock');
  for(const m of [orbit,flock,drift,swarm])assert(m.reach<4,`reach ${m.reach}`);
  for(const m of [orbit,flock,drift,swarm])for(const k of ['density','current','coherence','disturbance'])assert(m[k]>=0&&m[k]<=1);
});

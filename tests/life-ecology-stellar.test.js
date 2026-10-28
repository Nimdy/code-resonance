'use strict';
// Stellar Forge ecology 2 vs music 0/1/2. Own file: local ~10 s, Node --test-timeout is per file.
const test=require('node:test'),assert=require('node:assert/strict');
const stellarFx=require('./life-stellar-fixture.js');
const {perform,sd}=require('./life-ecology-harness.js');
test('Stellar Forge: gathering music concentrates the matter around the systems and releases it; the rotation never speeds up',async t=>{
  const {grammar}=await stellarFx.setup({nG:7});
  const graph={nodes:stellarFx.nodes(7),edges:[]};
  const measure=async music=>{const held=[];let rot=0,rn=0;
    await perform({grammar,graph,music,style:'cinematic',secs:140,every:2,sample(e,s){if(s%10)return;let cap=0,fr=0;
      for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;const x=e.px[i],z=e.pz[i],r=Math.hypot(x,z);
        if(e.sp[i]===0&&r>2){rot+=Math.abs((-z*e.vx[i]+x*e.vz[i])/r);rn++;}if(e.sp[i]===1){fr++;if(e.ia[i*2+1]>350)cap++;}}
      held.push(cap/fr);}});
    return {sd:sd(held),rot:rot/rn};};
  const m0=await measure(0),m1=await measure(1),m2=await measure(2);
  const f=x=>JSON.stringify({sd:+x.sd.toFixed(3),rot:+x.rot.toFixed(3)});
  t.diagnostic(`music 0 ${f(m0)} · 1 ${f(m1)} · 2 ${f(m2)}`);
  assert(m1.sd>m0.sd*1.8&&m2.sd>m1.sd*1.2,`the systems' hold on their fragments follows the music ${f(m0)} ${f(m1)} ${f(m2)}`);
  assert(m1.rot<m0.rot*1.1&&m2.rot<m0.rot*1.1,`the disc's own motion is no faster ${f(m0)} ${f(m1)} ${f(m2)}`);
});

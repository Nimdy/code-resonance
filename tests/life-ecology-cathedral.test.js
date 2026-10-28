'use strict';
// Machine Cathedral ecology 2 vs music 0/1/2. Samples at 20 Hz for 120 s × 3 music levels (keep every:.05). Own file so
// Node's 120 s suite timeout does not cancel it on 2-core CI (local ~7 s).
const test=require('node:test'),assert=require('node:assert/strict');
const cathFx=require('./life-cathedral-fixture.js');
const {load,perform,sd}=require('./life-ecology-harness.js');
test('Machine Cathedral: convoys on the musical grid come with the rhythm, and the traffic\'s destinations follow the music',async t=>{
  const [,,,,cath]=await load(),g=cathFx.graph(cathFx.RING);
  const measure=async music=>{
    const grammar=cath.createCathedralGrammar({genome:{geometry:{architecture:'gothic',buttress:1}},axisAz:.4,capacity:600});
    let prev=null,released=0,convoys=0;const shares=[],win=new Map();
    await perform({grammar,graph:{nodes:g.nodes,edges:g.edges},music,style:'pulse',secs:120,from:20,every:.05,sample(e,s){
      const net=grammar.networkOf(e),cap=e.capacity;if(!prev){prev=new Uint8Array(cap);for(let i=0;i<cap;i++)prev[i]=e.ia[i*2+1]&15;return;}
      const groups=new Map();
      for(let i=0;i<cap;i++){if(!e.alive[i])continue;const st=e.ia[i*2+1],job=st&15;
        if(e.sp[i]!==1&&prev[i]===cath.JOB.wait&&job===cath.JOB.travel){released++;const ed=e.ia[i*2]>>1,p=net.np[net.ea[ed]]>=0?net.np[net.ea[ed]]:net.np[net.eb[ed]];groups.set(p,(groups.get(p)||0)+1);}
        if(e.sp[i]===0&&job===cath.JOB.travel)win.set(st>>8,(win.get(st>>8)||0)+1);
        prev[i]=job;}
      for(const v of groups.values())if(v>=3)convoys++;
      if(Math.abs(s*20%200)<1e-6){const t=[...win.values()].reduce((a,b)=>a+b,0)||1;shares.push([0,1,2,3].map(h=>(win.get(h)||0)/t));win.clear();}}});
    let spread=0;for(let h=0;h<4;h++)spread+=sd(shares.slice(1).map(x=>x[h]))/4;
    return {released,convoys,spread};};
  const m0=await measure(0),m1=await measure(1),m2=await measure(2);
  const f=x=>JSON.stringify({released:x.released,convoys:x.convoys,spread:+x.spread.toFixed(3)});
  t.diagnostic(`music 0 ${f(m0)} · 1 ${f(m1)} · 2 ${f(m2)}`);
  assert(m1.released>m0.released*1.2&&m2.released>m1.released*1.1,`departures from the hubs ${f(m0)} ${f(m1)} ${f(m2)}`);
  assert(m1.convoys>m0.convoys*1.6&&m2.convoys>m0.convoys*1.6,`convoys of three or more ${f(m0)} ${f(m1)} ${f(m2)}`);
  assert(m1.spread>m0.spread*1.4&&m2.spread>m0.spread*1.4,`the destinations move with the music ${f(m0)} ${f(m1)} ${f(m2)}`);
});

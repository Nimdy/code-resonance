'use strict';
// Machine Cathedral digital life (public/worlds/life/cathedral.js): traffic dynamics. A crowded route sheds traffic to
// its alternative, kerb traffic moves in platoons with dark gaps, and shaft gates let climbers up in convoys. The shared
// fixture is tests/life-cathedral-fixture.js; the network, stone, failure, lifecycles and timeline are in
// tests/life-cathedral.test.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {city,RING,DIAMOND,ecosystem,viaC}=require('./life-cathedral-fixture.js');
test('Congestion: when the shorter route crowds, traffic redistributes to the longer one',async()=>{
  const m=await city(DIAMOND(true));let on=0,off=0;const seeds=[1,2,3];
  for(const seed of seeds){const a=await viaC(m,{seed}),b=await viaC(m,{seed,opts:{congestion:false}});on+=a.share;off+=b.share;console.log(`# seed ${seed}: longer route ${a.share.toFixed(3)} with congestion, ${b.share.toFixed(3)} without`);assert(b.share<.5,'the route via D is the shorter one (without congestion most take it)');}
  on/=seeds.length;off/=seeds.length;console.log(`# share of the longer route: congestion on ${on.toFixed(3)}, off ${off.toFixed(3)}`);
  assert(on>off+.05,'a crowded route sheds traffic to its alternative');
});
test('Kerb pulses: traffic along the copings moves in platoons with dark gaps between them, not as an evenly filled ring',async()=>{
  const m=await city(RING);
  // Each way round each kerb: the gaps between successive inhabitants along it. In a platoon: a gap under 0.7 units;
  // dark: the share of the ring in gaps over 2.5 units.
  async function platoons(pulses){const {G,net,eco,awake}=await ecosystem(m,{seed:6,opts:{pulses},params:{density:1.6}});let close=0,gaps=0,dark=0,nb=0;
    for(let k=0;k<3000;k++){eco.step();if(k<600||k%10)continue;
      for(const q of net.precs)for(const dir of [0,1]){const th=[];
        for(let i=0;i<eco.capacity;i++){if(!awake(i))continue;const d=eco.ia[i*2],e=d>>1;if(net.ek[e]!==G.EDGE.kerb||net.np[net.ea[e]]!==q.k||(d&1)!==dir)continue;
          const dx=eco.px[i]-q.cx,dz=eco.pz[i]-q.cz;th.push(Math.atan2((-dx*q.sa+dz*q.ca)/q.rz,(dx*q.ca+dz*q.sa)/q.rx));}
        if(th.length<4)continue;th.sort((a,b)=>a-b);nb++;
        th.forEach((t,j)=>{const g=((j+1<th.length?th[j+1]:th[0]+2*Math.PI)-t)*q.perim/(2*Math.PI);gaps++;if(g<.7)close++;if(g>2.5)dark+=g/q.perim;});}}
    return {close:close/gaps,dark:dark/nb,nb};}
  const on=await platoons(true),off=await platoons(false);
  console.log(`# kerb traffic: in a platoon ${(100*on.close).toFixed(0)} % (without pulses ${(100*off.close).toFixed(0)} %), ring in dark gaps ${(100*on.dark).toFixed(0)} % (${(100*off.dark).toFixed(0)} %), ${on.nb} samples`);
  assert(on.nb>500,'kerbs carry traffic');assert(on.close>off.close+.03&&on.dark>off.dark+.05,'the kerb traffic bunches into platoons with dark gaps');
});
test('Convoys: each shaft gate lets climbers up in short processions with clear gaps (not an evenly filled column)',async()=>{
  const m=await city(RING);
  // Headways (ticks) between successive inhabitants entering hub shafts from the foot, with and without the gates.
  async function headways(gates){const {G,net,eco,awake}=await ecosystem(m,{seed:4,opts:{gates}});
    const first=new Set();for(const h of net.hubs){const tw=net.towers[h.tower];const v=tw.dock[tw.shaft];for(let q=net.adjOff[v];q<net.adjOff[v+1];q++){const d=net.adj[q],e=d>>1;if(net.ek[e]===G.EDGE.shaft)first.add((net.ea[e]===v?0:1)|e<<1);}}
    const was=new Uint8Array(eco.capacity),last=new Map(),gaps=[];
    for(let k=0;k<4000;k++){eco.step();for(let i=0;i<eco.capacity;i++){const on=awake(i)&&first.has(eco.ia[i*2]);if(on&&!was[i]&&k>400){const d=eco.ia[i*2];if(last.has(d))gaps.push(k-last.get(d));last.set(d,k);}was[i]=on?1:0;}}
    return gaps;}
  const on=await headways(true),off=await headways(false);
  // Gated, the headways are short (inside a convoy) or long (between two openings), rarely in between; ungated they
  // spread evenly (arrivals as they come). (Spawning at a hub's foot can still put one on a shaft at any time.)
  const share=(g,lo,hi)=>g.filter(x=>x>=lo&&x<=hi).length/g.length,mid=g=>share(g,14,40);
  console.log(`# climbers entering hub shafts: gated ${on.length} (in a convoy ${(100*share(on,1,13)).toFixed(0)} %, in between ${(100*mid(on)).toFixed(0)} %), ungated ${off.length} (${(100*share(off,1,13)).toFixed(0)} %, ${(100*mid(off)).toFixed(0)} %)`);
  assert(on.length>30,'the shafts are climbed');assert(mid(on)<mid(off)*.5,'gated arrivals come in convoys with gaps between them');
});

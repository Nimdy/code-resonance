'use strict';
// Machine Cathedral digital life (public/worlds/life/cathedral.js): trail feedback. The routes the inhabitants travel
// brighten, and at a junction travellers take the way that is lit. The shared fixture is tests/life-cathedral-fixture.js;
// the network, stone, failure, lifecycles and timeline are in tests/life-cathedral.test.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {city,DIAMOND,ecosystem,viaC}=require('./life-cathedral-fixture.js');
test('Trail feedback: at a junction, travellers take the way that is lit (as a travelled route is)',async()=>{
  const m=await city(DIAMOND());const seeds=[1,2,3];let on=0,off=0;
  // The light is where the traffic is: each place's trail follows how many passed there lately.
  {const {eco}=await ecosystem(m,{arch:'deco',seed:9,opts:{axisAz:0}});const NC=eco.field.nx*eco.field.nz,traffic=new Float64Array(NC);
    for(let k=0;k<1600;k++){eco.step();for(let q=0;q<NC;q++)traffic[q]=traffic[q]*.993+eco.field.density[q];}   // recent traffic (the light fades in ~7 s)
    let lit=0,nl=0,dark=0,nd=0;for(let q=0;q<NC;q++){if(traffic[q]>5){lit+=eco.field.data[q];nl++;}else if(traffic[q]<.05){dark+=eco.field.data[q];nd++;}}lit/=nl;dark/=nd;
    console.log(`# light where traffic passes ${lit.toFixed(3)} (${nl} places), where none passes ${dark.toFixed(4)} (${nd} places)`);assert(nl>50&&lit>20*dark,'routes are lit by their traffic');}
  // At every fork a travelling courier passes (its ways differently lit), how often it takes the brightest way (the
  // light as it was when the choice was made), with the trail pull and without.
  // One side of the city (between A and B, via C) is kept lit, as if travelled, so the forks there offer a lit and a
  // dark way.
  async function lift(seed,opts){const {G,net,eco,awake}=await ecosystem(m,{arch:'deco',seed,opts:{axisAz:0,...opts}});
    const A=net.precs.find(q=>q.id==='A'),B=net.precs.find(q=>q.id==='B'),lit=[];
    for(let v=0;v<net.n;v++)if(net.z[v]<-.5&&net.x[v]>A.cx-4&&net.x[v]<B.cx+4)lit.push([net.x[v],net.z[v]]);
    const tr=new Float32Array(net.m*2),prev=new Int32Array(eco.capacity).fill(-1);let best=0,n=0;
    // (each way's light a little way along it from the junction, as a traveller judges it)
    const along=(dd,v)=>{const e=dd>>1,w=dd&1?net.ea[e]:net.eb[e],f=Math.min(1,1.8/Math.max(1e-6,net.el[e]));return eco.sample(0,net.x[v]+(net.x[w]-net.x[v])*f,net.z[v]+(net.z[w]-net.z[v])*f);};
    for(let k=0;k<2400;k++){if(k%40===0)for(const [x,z] of lit)eco.splat(0,x,z,.4);
      for(let dd=0;dd<net.m*2;dd++)tr[dd]=along(dd,dd&1?net.eb[dd>>1]:net.ea[dd>>1]);
      for(let i=0;i<eco.capacity;i++)prev[i]=awake(i)&&eco.sp[i]===0&&(eco.ia[i*2+1]&15)===G.JOB.travel?eco.ia[i*2]:-1;
      eco.step();if(k<400)continue;
      for(let i=0;i<eco.capacity;i++){const d0=prev[i],d=eco.ia[i*2];if(d0<0||d===d0||!awake(i))continue;const v=d0&1?net.ea[d0>>1]:net.eb[d0>>1];if((d&1?net.eb[d>>1]:net.ea[d>>1])!==v)continue;
        let hi=-1,lo=Infinity,c=0;for(let q=net.adjOff[v];q<net.adjOff[v+1];q++){const dd=net.adj[q];if(dd===(d0^1))continue;hi=Math.max(hi,tr[dd]);lo=Math.min(lo,tr[dd]);c++;}
        if(c<2||hi-lo<.05)continue;n++;if(tr[d]===hi)best++;}}
    return {lift:best/n,n};}
  for(const seed of seeds){const a=await lift(seed,{}),b=await lift(seed,{trailPull:0});on+=a.lift;off+=b.lift;
    if(seed===seeds[0])console.log(`# choices at forks: ${a.n} with the pull, ${b.n} without`);}
  on/=seeds.length;off/=seeds.length;
  console.log(`# the brightest way taken at a fork: trail pull on ${(100*on).toFixed(1)} %, off ${(100*off).toFixed(1)} %`);
  assert(on>off+.05,'travellers take the lit way');
  // The light is the channel: priming one side changes nothing when the pull is off, and nothing is lit without deposits.
  const c0=await viaC(m,{seed:1,prime:'C',opts:{trailPull:0}}),d0=await viaC(m,{seed:1,prime:'D',opts:{trailPull:0}});assert(Math.abs(c0.share-d0.share)<1e-9,'without the pull the light changes nothing');
  const z=await viaC(m,{seed:1,params:{trails:0}});assert.equal(z.trail.C+z.trail.D,0,'no trail without deposits');
});

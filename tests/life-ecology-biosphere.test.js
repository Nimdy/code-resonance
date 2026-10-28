'use strict';
// Fractal Biosphere ecology 2 vs music 0/1/2. Own file: local ~16 s, Node --test-timeout is per file.
const test=require('node:test'),assert=require('node:assert/strict');
const bioFx=require('./life-biosphere-fixture.js');
const {load,perform}=require('./life-ecology-harness.js');
test('Fractal Biosphere: the music moves migrations and attention across the habitat; ecology 2 spreads life beyond the dominant organism',async t=>{
  const [,,bio]=await load(),graph=bioFx.graph();
  const measure=async(ecology,music)=>{
    const prev=new Map(),cx=[],cz=[];let migr=0,top=0,n=0,wx=0,wz=0,wn=0;
    await perform({grammar:bio.biosphereGrammar(bioFx.RECIPE),graph,ecology,music,secs:200,sample(e,s){
      const S=e.sites,per=new Map();let orb=0,x=0,z=0;
      for(let i=0;i<e.capacity;i++){if(!e.alive[i]||e.sp[i]!==bio.POLLINATOR||e.mode[i]!==2||e.tgt[i]<0)continue;const k=e.tgt[i],o=S.ids[k].split('#')[0];
        per.set(o,(per.get(o)||0)+1);orb++;x+=S.x[k];z+=S.z[k];const key=i*65536+e.gen[i],was=prev.get(key);if(was!==undefined&&was!==o)migr++;prev.set(key,o);}
      if(orb){top+=Math.max(...per.values())/orb;n++;wx+=x/orb;wz+=z/orb;wn++;}
      if(s%10===0&&wn){cx.push(wx/wn);cz.push(wz/wn);wx=wz=wn=0;}}});
    let travel=0;for(let k=1;k<cx.length;k++)travel+=Math.hypot(cx[k]-cx[k-1],cz[k]-cz[k-1]);
    return {migr,travel,top:top/n};};
  const m0=await measure(2,0),m1=await measure(2,1),m2=await measure(2,2),e1=await measure(1,1);
  const f=x=>JSON.stringify({migr:x.migr,travel:+x.travel.toFixed(2),top:+x.top.toFixed(3)});
  t.diagnostic(`music 0 ${f(m0)} · 1 ${f(m1)} · 2 ${f(m2)} · ecology 1 ${f(e1)}`);
  // Migrations between organisms: the music's exploring and dispersing passages send gatherings on to other crowns.
  assert(m1.migr>m0.migr*1.08&&m2.migr>m1.migr*1.2,`migrations ${f(m0)} ${f(m1)} ${f(m2)}`);
  // Where the gatherings are: the turning attractor moves the attention around the habitat.
  assert(m1.travel>m0.travel*1.3&&m2.travel>m1.travel*1.3,`attention travels ${f(m0)} ${f(m1)} ${f(m2)}`);
  // The single-organism hotspot: ecology 2 gives the busiest organism a clearly smaller share of the gatherings.
  assert(m1.top<e1.top*.85,`busiest organism's share ${f(e1)} (ecology 1) vs ${f(m1)}`);
});

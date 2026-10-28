'use strict';
// Ecology 2 (public/worlds/life/driver.js climateOf, sim.js conditions, the three grammars): the climate read from the
// music itself, shaping more than speed. Cheap pins live here. World-scale runs (Biosphere, Stellar, Cathedral) are
// their own files so Node's 120 s file timeout does not cancel them on 2-core CI.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,recording,player}=require('./life-driver-fixture.js');
const {load,MUSIC}=require('./life-ecology-harness.js');
test('Music 0 is an independent ecology: exactly neutral conditions all along, while the music clock runs; 1 moves them',async()=>{
  const [{climateOf,NEUTRAL2}]=await load();
  assert.deepEqual(climateOf({role:'tension',energy:.9,tension:1,onset:1,rhythm:1,section:3},0),{...NEUTRAL2},'climateOf at 0');
  const entries=recording(30);
  const p=await player({entries,params:{ecology:2,music:0}});p.set({music:MUSIC});
  const seen=new Set();
  for(let s=5;s<=290;s+=5){p.at(T0+s*1000);const e=p.driver.ecosystem;assert.deepEqual({...e.cond},{...NEUTRAL2},`neutral at ${s} s`);seen.add(p.driver.view.climate.section);}
  assert(seen.size>=3,`the music played on (${[...seen]})`);
  const q=await player({entries,params:{ecology:2,music:1}});q.set({music:MUSIC});
  const moved={};for(let s=5;s<=290;s+=5){q.at(T0+s*1000);for(const [k,v] of Object.entries(q.driver.ecosystem.cond))moved[k]=Math.max(moved[k]||0,Math.abs(v-NEUTRAL2[k]));}
  for(const k of ['current','turb','cohesion','activity','attract','gather','explore','persist','glow','pulse','shiftX','shiftZ'])assert(moved[k]>.05,`${k} moves with the music (${moved[k].toFixed(3)})`);
  // Bounded: expressive music saturates, it never runs away.
  for(const ex of [{role:'tension',energy:1,tension:1,onset:1,transition:1,rhythm:1,dynamics:1},{role:'release',energy:0,tension:0,dynamics:0}]){
    const c=climateOf(ex,2);for(const k of ['current','turb','cohesion','activity','attract','gather','explore','persist','glow'])assert(c[k]>.3&&c[k]<3,`${k} bounded (${c[k]})`);
    assert(Math.hypot(c.shiftX,c.shiftZ)<=.85+1e-9&&c.pulse<=1&&Math.abs(c.swing)<=1.2);}
});
test('Deterministic: the same digest twice, by a far seek and by continuous play; a change of the music rebuilds a replay exactly',async()=>{
  const entries=recording(40);
  const run=async()=>{const p=await player({entries,params:{ecology:2,music:1.5}});p.set({music:MUSIC});p.at(T0+240000);return p.driver.digest();};
  const a=await run(),b=await run();assert.equal(a,b,'twice');
  const c=await player({entries,params:{ecology:2,music:1.5},prime:false});c.set({music:MUSIC});c.play(T0,T0+240000,20);assert.equal(c.driver.digest(),a,'continuous play at 20 fps');
  // The music is part of the configuration: another score (its seed: another form) gives another ecosystem, and
  // switching to it in a replay gives exactly the ecosystem started with it.
  const other={...MUSIC,seed:12345};
  const p=await player({entries,params:{ecology:2,music:1.5}});p.set({music:MUSIC});p.at(T0+200000);p.set({music:other});p.at(T0+200000);
  const q=await player({entries,params:{ecology:2,music:1.5}});q.set({music:other});q.at(T0+200000);
  assert.equal(p.driver.digest(),q.driver.digest(),'rebuilt exactly');
  const r=await player({entries,params:{ecology:2,music:1.5}});r.set({music:MUSIC});r.at(T0+200000);assert.notEqual(r.driver.digest(),q.driver.digest(),'the music matters');
});
test('A live session tuned to ecology 2 keeps its population and lives on with the new conditions',async()=>{
  const [{NEUTRAL2}]=await load();
  const l=await player({entries:recording(20),live:true,prime:false});l.set({music:MUSIC});l.play(T0,T0+60000,20);const before=l.driver.ecosystem.px.slice();
  l.set({params:{ecology:2,music:2}});l.at(T0+60000);assert.deepEqual(Array.from(l.driver.ecosystem.px),Array.from(before),'the population continues from where it was');
  l.play(T0+60000,T0+150000,20);const e=l.driver.ecosystem;
  assert.deepEqual(Object.keys(e.cond).sort(),Object.keys(NEUTRAL2).sort(),'all the conditions');
  for(let i=0;i<e.capacity;i++)if(e.alive[i])assert(Number.isFinite(e.px[i]+e.py[i]+e.pz[i]+e.vx[i]+e.vz[i]),`entity ${i} finite`);
  assert(Object.entries(e.cond).some(([k,v])=>Math.abs(v-NEUTRAL2[k])>.05),'the music reaches it');
});
test('Ecology 1 is the ecosystem as it was: absent or 1, the pinned digests (generation 0, before generations)',async()=>{
  const entries=recording(66);
  for(const params of [{},{ecology:1}]){const p=await player({entries,params});p.set({music:MUSIC});p.at(T0+61234);assert.equal(p.driver.digest(),'5b020b5a',JSON.stringify(params));}
});

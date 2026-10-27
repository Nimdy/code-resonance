'use strict';
// Ecology 2 (public/worlds/life/driver.js climateOf, sim.js conditions, the three grammars): the climate read from the
// music itself, shaping more than speed. One performance (the same frames, the same musical configuration) is played
// to each world at music influence 0, 1 and 2; the collective metrics differ clearly (migrations, where the attention
// is, how much of the matter the systems hold, convoys), music 0 is exactly neutral, every run is deterministic, and
// ecology 1 is the ecosystem as it was (its pinned digests). Shared fixtures: life-*-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const score=require('../public/score.js');
const {T0,recording,player}=require('./life-driver-fixture.js');
const bioFx=require('./life-biosphere-fixture.js'),stellarFx=require('./life-stellar-fixture.js'),cathFx=require('./life-cathedral-fixture.js');
const load=()=>Promise.all([import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js'),import('../public/worlds/life/biosphere.js'),
  import('../public/worlds/life/stellar.js'),import('../public/worlds/life/cathedral.js'),import('../public/worlds/musical.js')]);
const MUSIC={version:3,style:'ambient',seed:9001,profile:null},WIN=10000;
// A replay (a film: exact states) of one structure and a performance arc: activity rising and falling, a stretch of
// trouble (tension) in the middle. sample(eco, s, driver) is called after every second of view time from `from` on.
async function perform({grammar,graph,ecology=2,music=1,style=MUSIC.style,secs,from=20,every=1,sample}){
  const [{createLifeDriver},{createLifeTimeline}]=await load();
  const tl=createLifeTimeline();tl.structure({keyframe:true,...graph},T0,T0+WIN,0);
  for(let k=0;k<Math.ceil(secs/10)+2;k++){const s=T0+k*WIN;tl.frame({end:s+WIN,chapter:6,controls:{energy:.25+.5*(.5+.5*Math.sin(k*.45)),tension:k>=9&&k<13?.5:.08}},s);}
  const cfg={speed:1,tempo:96,epoch:T0,params:{enabled:true,ecology,music},live:false,film:true,music:{...MUSIC,style}};
  const d=createLifeDriver({grammar,timeline:tl,seed:77,config:()=>cfg,score,background:false});
  for(let k=1;k<=secs/every;k++){const s=k*every;d.update({tview:s},{budgetMs:Infinity});if(s>=from)sample(d.ecosystem,s,d);}
  return d;
}
const sd=a=>{const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);};
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

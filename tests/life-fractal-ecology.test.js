'use strict';
// Fractal Continuum's digital life, ecology 2 (public/worlds/life/fractal.js, driver.js climateOf): the climate read
// from the music is deterministic, music 0 is neutral, and the motes gather and travel with the music. Own file: Node's
// --test-timeout applies to a whole file. The same player as tests/life-fractal-driver.test.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,recording}=require('./life-driver-fixture.js');
const {RECIPE}=require('./life-fractal-fixture.js');
const score=require('../public/score.js');
const load=()=>Promise.all([import('../public/worlds/life/fractal.js'),import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
// A player of the fixture's recorded performance with the fractal grammar: windows delivered as playback reaches them
// (live-like) or all at once (a replay primes its timeline).
async function player({entries,prime=true,params={enabled:true},film=false,background=false,music=null}){
  const [life,{createLifeDriver},{createLifeTimeline}]=await load();
  const timeline=createLifeTimeline(),grammar=life.createFractalGrammar(RECIPE);
  const cfg={speed:1,tempo:96,epoch:T0,params,live:false,film,...(music?{music}:{})};
  const driver=createLifeDriver({grammar,timeline,seed:4321,config:()=>cfg,score,background});
  if(prime)timeline.prime(entries);let next=0;
  const deliver=t=>{while(next<entries.length&&entries[next].start<=t){const e=entries[next++];timeline.structure(e.graph,e.start,e.end,e.seq);timeline.frame(e.frame,e.start);for(const i of e.intents)timeline.intent(i);}};
  const view=t=>({tview:(t-T0)/1000});
  return {driver,timeline,
    play(t0,t1,fps=30){const step=1000/fps;for(let k=0,t=t0;t<t1;t=t0+(++k)*step){deliver(t);driver.update(view(t),{budgetMs:1e9});}deliver(t1);return driver.update(view(t1),{budgetMs:1e9});},
    at(t){deliver(t);return driver.update(view(t),{budgetMs:1e9});}};
}
test('Ecology 2: the climate read from the music is deterministic, music 0 is neutral, and the motes gather and travel with the music',async()=>{
  const MUSIC={version:3,style:'ambient',seed:9001,profile:null},entries=recording(26);
  // every 2 s from 20 s to 230 s: the share of motes gathered at a site and travelling to one, and the conditions
  const series=async(music,until=230)=>{const p=await player({entries,params:{enabled:true,ecology:2,music},film:true,music:MUSIC}),out={gathered:[],travelling:[],gather:[],explore:[]};
    for(let s=20;s<=until;s+=2){const e=p.at(T0+s*1000).eco;let orbit=0,seek=0,motes=0;for(let i=0;i<e.capacity;i++)if(e.alive[i]&&e.sp[i]===0){motes++;if(e.mode[i]===2)orbit++;else if(e.mode[i]===1)seek++;}
      out.gathered.push(orbit/motes);out.travelling.push(seek/motes);out.gather.push(e.cond.gather);out.explore.push(e.cond.explore);}
    return {...out,digest:p.driver.digest(),cond:p.driver.ecosystem.cond};};
  const m0=await series(0),m1=await series(1),m2=await series(2),again=await series(1,120);
  assert.equal(again.digest,(await series(1,120)).digest,'deterministic');
  for(const [k,v] of Object.entries(m0.cond))assert.equal(v,{pulse:0,shiftX:0,shiftZ:0,swing:0}[k]??1,`music 0: ${k} neutral`);
  assert.notEqual(m1.digest,m0.digest);assert.notEqual(m2.digest,m1.digest);
  const corr=(a,b)=>{const ma=a.reduce((x,y)=>x+y)/a.length,mb=b.reduce((x,y)=>x+y)/b.length;let c=0,sa=0,sb=0;for(let i=0;i<a.length;i++){c+=(a[i]-ma)*(b[i]-mb);sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2;}return c/Math.sqrt(sa*sb);};
  const f=m=>`gathered~gather ${corr(m.gathered,m.gather).toFixed(2)}, travelling~explore ${corr(m.travelling,m.explore).toFixed(2)}`;
  console.log(`# music 1: ${f(m1)} · music 2: ${f(m2)}`);
  for(const [name,m] of [['music 1',m1],['music 2',m2]]){assert(corr(m.gathered,m.gather)>.5,`${name}: gathering music gathers the motes (${f(m)})`);
    assert(corr(m.travelling,m.explore)>.3,`${name}: exploring music sends them on (${f(m)})`);}
});

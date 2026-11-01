'use strict';
// Fractal Continuum's digital life in generations (life/driver.js, 10 min of view time each with a 60 s warm start): across
// an anchor, continuous play (the next generation prepared in the background) and a far seek from a fresh session reach
// the same ecosystem, and the new generation inherits the lasting history mapped on its own habitat (a verified
// milestone's attractor at its region). Own file: Node's --test-timeout applies to a whole file.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,recording}=require('./life-driver-fixture.js');
const {RECIPE}=require('./life-fractal-fixture.js');
const score=require('../public/score.js');
async function driverOf(entries,{background=false,prime=true}={}){
  const [life,{createLifeDriver},{createLifeTimeline}]=await Promise.all([import('../public/worlds/life/fractal.js'),import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
  const timeline=createLifeTimeline();if(prime)timeline.prime(entries);
  const d=createLifeDriver({grammar:life.createFractalGrammar(RECIPE),timeline,seed:4321,config:()=>({speed:1,tempo:96,epoch:T0,params:{enabled:true},live:false,film:false}),score,background});
  return {d,timeline};
}
test('Across a generation\'s anchor: continuous play with the next generation prepared in the background equals a far seek; the lasting history is inherited',async()=>{
  const entries=recording(66),at=T0+605500;
  const far=await driverOf(entries);const v=far.d.update({tview:(at-T0)/1000},{budgetMs:1e9});assert.equal(v.generation,1);
  const want=far.d.digest(),e=far.d.ecosystem,k=e.sites.ids.indexOf('g1');
  assert(k>=0&&e.sites.state(k).lasting>=1,'generation 1 starts with the verified milestone\'s lasting attractor at g1\'s region');
  const cont=await driverOf(entries,{background:true});
  for(let t=T0;t<at;t+=250)cont.d.update({tview:(t-T0)/1000},{budgetMs:1e9});const w=cont.d.update({tview:(at-T0)/1000},{budgetMs:1e9});
  assert.equal(w.generation,1);assert.equal(cont.d.digest(),want,'continuous play across the anchor');
  const s=cont.d.stats();assert.equal(s.handovers,1,'the prepared generation was handed over at its anchor');assert(s.backgroundTicks>0);
});

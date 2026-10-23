'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBar,pitch,STYLES}=require('../public/score');
function config(extras={}){return {seed:1002,motif:[0,2,4,6],root:'D',chapter:4,energy:.6,tension:.2,barIndex:7,...extras};}
test('Score identity is deterministic across repeated runs and does not depend on wall-clock',()=>{
  const a=createBar(config({style:'pulse'})),b=createBar(config({style:'pulse'}));assert.deepEqual(a,b);
  assert.equal(a.schema,'code-resonance.bar.v1');assert.equal(a.steps.length,16);
});
test('Chapters unlock arrangement layers; baseline remains quiet',()=>{
  const early=createBar(config({chapter:1,style:'ambient'}));
  const later=createBar(config({chapter:5,style:'ambient'}));
  const count=b=>b.steps.flat().length;
  assert(count(later)>count(early));
  assert(!early.steps.flat().some(x=>x.instrument==='bass'));
  assert(later.steps.flat().some(x=>x.instrument==='arp'));
});
test('Four score palettes have distinct deterministic orchestrations',()=>{
  const bars=STYLES.map(style=>createBar(config({style})));
  assert.equal(STYLES.length,4);
  assert.equal(new Set(bars.map(b=>JSON.stringify(b.steps))).size,4);
});
test('No musical event can exceed safe MIDI/velocity/duration bounds',()=>{
  for(const style of STYLES)for(const chapter of [1,3,8,19]){
    const bar=createBar(config({style,chapter,tension:1,energy:1}));
    for(const event of bar.steps.flat()){
      assert(Number.isInteger(event.midi));assert(event.midi>=25&&event.midi<=105);
      assert(event.velocity>=0&&event.velocity<=1);assert(event.duration>=.025&&event.duration<=5);
    }
  }
  assert.equal(pitch(0,0,'D'),50);
});

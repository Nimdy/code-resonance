'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBar,STYLES}=require('../public/score');
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
});
const {createIdentity,accentFigure,chooseSection,SECTION_BARS}=require('../public/score');
test('Each project has a stable, distinctive identity (key, mode, progressions, motif)',()=>{
  assert.deepEqual(createIdentity(77),createIdentity(77));
  const ids=new Set(),motifs=new Set();
  for(let s=0;s<300;s++){const id=createIdentity(s*7919+3);ids.add(`${id.key} ${id.mode}`);motifs.add(JSON.stringify(id.motif));}
  assert(ids.size>=30,`only ${ids.size} key/mode identities`);assert(motifs.size>=250);
});
test('Outside tension sections every pitched note stays in the project key',()=>{
  for(const seed of [1,99,4242,123456])for(const style of STYLES){
    const id=createIdentity(seed),pcs=new Set(id.scale.map(x=>(x+id.tonic)%12));
    for(let b=0;b<96;b++){const bar=createBar({seed,chapter:8,tension:.1,energy:.8,style,barIndex:b});
      for(const e of bar.steps.flat())if(!['hat','shaker','kick','snare','taiko','texture'].includes(e.instrument))assert(pcs.has(e.midi%12),`${style} seed ${seed} bar ${b} ${e.instrument} ${e.midi}`);}
  }
});
test('Tension changes the harmony; calm sections cycle home/away with breathing room',()=>{
  assert.equal(chooseSection({index:3,tension:.6}),'tension');
  assert.equal(chooseSection({index:4,tension:.1,previous:'tension'}),'resolve');
  assert.equal(chooseSection({index:2,tension:0,previous:'home'}),'away');
  const calm=createBar({seed:5,chapter:5,tension:.1,energy:.5,style:'ambient',barIndex:6,section:'home'});
  const tense=createBar({seed:5,chapter:5,tension:.7,energy:.5,style:'ambient',barIndex:6,section:'tension'});
  assert.notDeepEqual(calm.steps,tense.steps);assert.equal(SECTION_BARS,8);
});
test('Early chapters develop instead of looping one bar',()=>{
  const sig=new Set();for(let b=0;b<690;b++)sig.add(JSON.stringify(createBar({seed:12345,chapter:2,tension:.1,energy:.4,style:'pulse',barIndex:b}).steps));
  assert(sig.size>=40,`only ${sig.size} distinct bars in 30 minutes`);
});
test('Engineering events become bounded figures; agents keep distinct voices',()=>{
  const base={seed:9,chord:3,style:'ambient'};
  for(const type of ['symbol.created','dependency.added','validation.test.passed','validation.test.failed','milestone.refactor.validated','repository.commit.observed','agent.file.modified']){
    const notes=accentFigure({id:type,type,weight:3,detail:{symbolType:'ui.component',voice:2}},base);
    assert(notes.length>0&&notes.length<=5,type);
    for(const n of notes){assert(n.midi>=25&&n.midi<=105);assert(n.velocity>=0&&n.velocity<=1);assert(n.offset>=0&&n.offset<16);}
  }
  const a=accentFigure({id:'x',type:'agent.file.modified',detail:{voice:0}},base)[0],b=accentFigure({id:'x',type:'agent.file.modified',detail:{voice:1}},base)[0];
  assert.notEqual(a.voice,b.voice);assert.notEqual(a.pan,b.pan);
  assert.deepEqual(accentFigure({id:'q',type:'editor.change.observed',detail:{}},base),[]);
});

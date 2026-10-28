'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const S=require('../public/score');
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,16);
const PERC=new Set(['hat','shaker','kick','snare','taiko','texture','riser','wash']);
function bars(opts,n=96,from=0){const out=[];for(let b=from;b<from+n;b++)out.push(S.createBar({scoreVersion:3,seed:4242,chapter:8,energy:.55,tension:.05,style:'ambient',...opts,barIndex:b}));return out;}

test('Score v2 stays the default and its output is frozen (identities created before v3 keep their sound)',()=>{
  const out=[];
  for(const style of S.STYLES)for(let b=0;b<120;b++)out.push(S.createBar({seed:4242,chapter:1+b%9,energy:(b%7)/6,tension:b%37<5?.6:.1,style,barIndex:b,section:['home','away','tension','resolve','lift','breath'][b%6]}));
  assert.equal(digest(out),'925096346390f9d8');
  assert.deepEqual(S.createBar({seed:9,barIndex:3,chapter:4}),S.createBar({seed:9,barIndex:3,chapter:4,scoreVersion:2}));
  assert.equal(S.versionOf(undefined),2);assert.equal(S.versionOf(3),3);assert.equal(S.LATEST_VERSION,3);
});

test('Score v3 is deterministic, stays in the key outside tension and within safe bounds',()=>{
  assert.deepEqual(bars({style:'pulse'},24),bars({style:'pulse'},24));
  for(const seed of [1,99,4242,123456])for(const style of S.STYLES){
    const id=S.createIdentity(seed),pcs=new Set(id.scale.map(x=>(x+id.tonic)%12));
    for(const bar of bars({seed,style,profile:{harmony:1,evolution:1,melody:1,rhythm:1,atmosphere:1}},192)){
      assert.equal(bar.scoreVersion,3);assert.equal(bar.steps.length,16);
      for(const e of bar.steps.flat()){
        assert(Number.isInteger(e.midi)&&e.midi>=25&&e.midi<=105);assert(e.velocity>=0&&e.velocity<=1);assert(e.duration>=.025&&e.duration<=(['pad','air','bass','breath','swell','wash'].includes(e.instrument)?16:5),`${e.instrument} ${e.duration}`);
        assert(S.GROUPS.includes(e.group),e.instrument);
        if(!PERC.has(e.instrument))assert(pcs.has(e.midi%12),`${style} seed ${seed} bar ${bar.barIndex} ${e.instrument} ${e.midi}`);
      }
    }
  }
});

test('The form goes somewhere: every arc states, develops or returns, and releases; roles change only at passage boundaries',()=>{
  for(const evolution of [0,.5,1]){
    const seen=new Set();let last=null;
    for(let b=0;b<S.ARC_BARS*3;b++){const p=S.planAt(4242,b,evolution);seen.add(p.role);
      if(last&&p.role!==last.role)assert.equal(b%S.PASSAGE_BARS,0,`role changed mid-passage at bar ${b}`);last=p;}
    assert(seen.has('statement')&&seen.has('return')&&seen.has('release')&&seen.has('interlude'),[...seen].join());
  }
  // Exploratory profiles develop more than familiar ones.
  const share=e=>{let d=0;for(let b=0;b<S.ARC_BARS*12;b+=8)d+=S.planAt(77,b,e).role==='development'?1:0;return d;};
  assert(share(1)>share(0),`${share(1)} vs ${share(0)}`);
});

test('The motif returns recognisably: a return section states the identity motif in the melody',()=>{
  const id=S.createIdentity(4242);
  for(let b=0;b<S.ARC_BARS*2;b++){const p=S.planAt(4242,b,.5);if(p.role!=='return'||p.barInPassage!==0||p.passage!==0)continue;
    const bar=S.createBar({scoreVersion:3,seed:4242,chapter:8,energy:.5,style:'ambient',barIndex:b});
    const onsets=bar.steps.map((s,i)=>s.some(e=>e.group==='melody'&&e.instrument==='lead')?i:-1).filter(i=>i>=0);
    assert.deepEqual(onsets,id.motif.rhythm.map(([s])=>s));return;}
  assert.fail('no return section in two arcs');
});

// `space` (the room and the echo) is the synthesizer's: tests/audio-engine.test.js covers it.
test('Every profile control changes the music, and the mixer silences a role',()=>{
  const base=digest(bars({style:'pulse'}));
  for(const k of Object.keys(S.PROFILE).filter(k=>k!=='space'))for(const v of [0,1])if(v!==S.PROFILE[k])assert.notEqual(digest(bars({style:'pulse',profile:{[k]:v}})),base,`${k}=${v} changed nothing`);
  for(const g of S.GROUPS){
    const muted=bars({style:'pulse',profile:{mix:{[g]:0}}});
    assert(!muted.some(b=>b.steps.flat().some(e=>e.group===g&&!['riser','wash','swell'].includes(e.instrument))),`${g} still plays when muted`);
  }
});

test('The four styles keep distinct personalities (ambient has no drums, cinematic punctuates, pulse and chip move)',()=>{
  const count=(style,pred)=>bars({style},192).reduce((n,b)=>n+b.steps.flat().filter(pred).length,0);
  assert.equal(count('ambient',e=>e.instrument==='kick'||e.instrument==='snare'),0);
  const cine=count('cinematic',e=>e.group==='perc'),pulse=count('pulse',e=>e.group==='perc'),chip=count('chip',e=>e.group==='arp');
  assert(cine>0&&cine<pulse/8,`cinematic ${cine} vs pulse ${pulse}`);assert(chip>count('ambient',e=>e.group==='arp')*3);
  assert.equal(new Set(S.STYLES.map(style=>digest(bars({style},16)))).size,4);
});

test('Expression is pure, matches the bar it describes, and the conductor reacts to tension and verified milestones',()=>{
  const bar=S.createBar({scoreVersion:3,seed:5,chapter:6,energy:.4,style:'cinematic',barIndex:41});
  assert.deepEqual(bar.expression,S.expression({seed:5,chapter:6,energy:.4,style:'cinematic',barIndex:41,phase:0}));
  for(const k of ['energy','tension','density','melody','rhythm','dynamics','transition','onset','release'])assert(bar.expression[k]>=0&&bar.expression[k]<=1,k);
  const frames=b=>({energy:.5,tension:b>=64&&b<70?.6:.05,milestone:b===90});
  assert.equal(S.conductAt({seed:7,barIndex:64,frameAt:frames}).role,'tension');
  assert.equal(S.conductAt({seed:7,barIndex:72,frameAt:frames}).role,'resolve');
  assert.equal(S.conductAt({seed:7,barIndex:96,frameAt:frames}).lift,true);
  assert.equal(S.conductAt({seed:7,barIndex:104,frameAt:frames}).lift,false);
  assert.equal(S.milestoneOf({milestones:['validation.test.failed']}),false);
  assert.equal(S.milestoneOf({milestones:['validation.test.passed']}),true);
});
test('Agent collision is an additive figure and does not change existing identity bars',()=>{
  const notes=S.accentFigure({id:'c',type:'agent.collision',detail:{voices:[3,1],providers:['grok','cursor']}},{seed:9,chord:3,style:'ambient'});
  assert.equal(notes.length,4);
  assert.deepEqual([...new Set(notes.map(n=>n.voice))].sort(),[1,3]);
  assert(notes.every(n=>n.instrument==='agent'&&n.priority===4));
  assert.deepEqual(S.createBar({seed:9,barIndex:3,chapter:4}),S.createBar({seed:9,barIndex:3,chapter:4,scoreVersion:2}));
});
test('A held chord is held: the harmony sounds through every bar of a slow interlude (no seconds of silence inside a chord)',()=>{
  for(const style of S.STYLES)for(let b=0;b<S.ARC_BARS*2;b++){const p=S.planAt(4242,b,.5);if(p.role!=='interlude'||p.barInPassage!==0)continue;
    const tempo=S.createIdentity(4242).tempo[style],bar=60/(tempo*4)*16;let covered=0;
    for(let k=0;k<8;k++){const x=S.createBar({scoreVersion:3,seed:4242,chapter:8,energy:.2,style,barIndex:b+k});
      for(const [i,step] of x.steps.entries())for(const e of step)if(e.group==='pad')covered=Math.max(covered,k*bar+i*bar/16+e.duration);
      assert(covered>=(k+1)*bar-.05,`${style} bar ${b+k}: the pads stop ${((k+1)*bar-covered).toFixed(1)} s before the bar ends`);}
    return;}
});

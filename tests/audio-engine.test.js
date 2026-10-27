'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {runInNewContext}=require('node:vm');const {join}=require('node:path');
const Score=require('../public/score');
function music(){
 const win={ResonanceScore:Score};const sandbox={window:win,console,Number,Math,setInterval,clearInterval,setTimeout};
 runInNewContext(readFileSync(join(__dirname,'../public/music.js'),'utf8'),sandbox,{filename:'music.js'});
 return new win.ResonanceMusic();
}
test('Audio controller can switch project without inheriting old musical identity',()=>{
 const m=music();
 m.setProject('project-A',{motif:[1,2,3,4],scale:'G'});
 m.setFrame({projectSeed:3,chapter:1,motif:[1,2,3,4],scaleRoot:'G',controls:{tension:0,energy:0}});
 m.beginBar();const first=m.bar;
 m.setProject('project-B',{motif:[0,0,1,1],scale:'D'});
 m.setFrame({projectSeed:7,chapter:4,motif:[0,0,1,1],scaleRoot:'D',controls:{tension:.8,energy:1}});
 m.beginBar();assert.notDeepEqual(m.bar.steps,first.steps);
 assert.equal(m.projectId,'project-B');assert.equal(m.barIndex,1);
});
test('Palette changes are applied at the next musical bar rather than rewriting current bar',()=>{
 const m=music();m.setProject('hello',{motif:[0,2,4,1],scale:'D'});
 m.setFrame({projectSeed:4,chapter:4,motif:[0,2,4,1],scaleRoot:'D',controls:{tension:0,energy:.5}});
 m.beginBar();assert.equal(m.bar.style,'ambient');const prev=m.bar;
 m.setOptions({style:'chip',volume:.3,tempo:120,texture:1});
 assert.equal(m.bar,prev);m.beginBar();assert.equal(m.bar.style,'chip');assert.equal(m.appliedOptions.tempo,120);
});
test('Audio mix controls are clamped before oscillator scheduling',()=>{
 const m=music();m.setOptions({volume:2,tempo:2000,texture:-3});
 assert.equal(m.options.volume,1);assert.equal(m.options.tempo,160);assert.equal(m.options.texture,0);
});
test('Queued cues are quantized with per-step and per-bar budgets, highest priority first',()=>{
 const m=music();m.setProject('budget',{motif:[0,2,4,1],scale:'D'});
 m.setFrame({projectSeed:11,chapter:3,controls:{tension:0,energy:.5}});m.beginBar();
 const cue=(type,i,weight=1)=>({cue:{id:`${type}-${i}`,type,weight,detail:{symbolType:'function'}},when:1});
 m.accents=[cue('symbol.created',1),cue('dependency.added',2),cue('validation.test.passed',3,3),cue('symbol.created',4),cue('agent.tool.completed',5)];
 const budget={left:6};
 const first=m.accentsFor(1,0.1,budget);
 assert.equal(first.length,2);assert.equal(first[0][0].priority,4);assert.equal(budget.left,4);assert.equal(m.milestone,true);
 m.accents=[cue('symbol.created',6)];m.accentsFor(1,0.1,{left:0}).forEach(()=>assert.fail('bar budget exhausted'));
 m.accents=[{...cue('symbol.created',7),when:5}];assert.equal(m.accentsFor(1,0.1,{left:6}).length,0);assert.equal(m.accents.length,1);
});
// A context that, like OfflineAudioContext while scheduling, never dispatches `ended`: voices must still free up.
function mockContext(){
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
 const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param(),detune:param(),Q:param(),pan:param(),delayTime:param(),
   threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),start(){},stop(){},type:'',buffer:null,onended:null});
 let oscillators=0;
 const ctx={currentTime:0,sampleRate:8000,destination:node(),createGain:node,createStereoPanner:node,createBiquadFilter:node,createBufferSource:node,
   createDynamicsCompressor:node,createConvolver:node,createDelay:node,createChannelMerger:node,
   createBuffer:(channels,length)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return {getChannelData:c=>data[c]};},
   createOscillator:()=>{oscillators++;return node();}};
 return {ctx,count:()=>oscillators};
}
test('Voice budget frees voices by scheduled end time, so long offline renders keep every soft pad',()=>{
 const m=music();m.setOptions({style:'ambient'});m.appliedOptions={...m.options};
 const {ctx,count}=mockContext();const g=m.buildGraph(ctx,ctx.destination);
 const before=count();
 for(let i=0;i<400;i++)m.voice(g,{instrument:'pad',midi:50,velocity:.17,duration:2,pan:0},i*3);
 // Each ambient pad voice uses two detuned oscillators.
 assert((count()-before)>=800,`only ${(count()-before)/2} of 400 soft pad notes were voiced`);
});
// Score v3's voices: every instrument the v3 score writes, in every style, on a context that also offers the nodes v3
// uses (wave shapers, periodic waves). Space reshapes the room; an upgrade swaps the bus without a new context.
function mockContext3(){
 const {ctx,count}=mockContext();const base=ctx.createOscillator;let shapers=0,waves=0;
 Object.assign(ctx,{createWaveShaper:()=>{shapers++;return {...ctx.createGain(),curve:null,oversample:'none'};},createPeriodicWave:()=>{waves++;return {};},
   createOscillator:()=>({...base(),setPeriodicWave(){}})});
 return {ctx,count,shapers:()=>shapers,waves:()=>waves};
}
test('Score v3 voices every instrument its score writes, in every style, and keeps the accents on their v2 voices',()=>{
 for(const style of Score.STYLES){
  const m=music();m.setOptions({style,scoreVersion:3});m.appliedOptions={...m.options};
  const {ctx,count}=mockContext3();const g=m.buildGraph(ctx,ctx.destination);assert.equal(g.version,3);
  const seen=new Set();
  for(let b=0;b<192;b+=3){const bar=Score.createBar({scoreVersion:3,seed:4242,chapter:8,energy:.6,style,barIndex:b,profile:{rhythm:.9,atmosphere:.9}});
   bar.steps.forEach((step,i)=>{for(const e of step){seen.add(e.instrument);m.voice(g,e,b*4+i*.1);}});}
  for(const type of ['symbol.created','validation.test.passed','repository.commit.observed','agent.file.modified'])
   for(const n of Score.accentFigure({id:type,type,weight:2,detail:{voice:1}},{seed:4242,chord:0,style}))m.voice(g,n,900);
  assert(count()>0&&seen.has('pad')&&seen.has('lead'),`${style}: ${[...seen].join()}`);
 }
});
test('Space changes the room and the echo; an upgrade to v3 swaps the bus on the same context',()=>{
 const m=music();m.setOptions({scoreVersion:3,profile:{space:0}});m.appliedOptions={...m.options};
 const {ctx}=mockContext3();const dry=m.buildGraph(ctx,ctx.destination);
 m.setOptions({profile:{space:1}});m.appliedOptions={...m.options};const wide=m.buildGraph(ctx,ctx.destination);
 assert(wide.roomLength>dry.roomLength&&wide.reverbIn.gain.value>dry.reverbIn.gain.value&&wide.feedback.gain.value>dry.feedback.gain.value);
 const v=music();v.setProject('upgrade');v.setFrame({projectSeed:5,chapter:4,controls:{energy:.5,tension:0}});
 v.ctx=ctx;v.graph=v.buildGraph(ctx,ctx.destination);v.output=v.graph.output;v.beginBar();assert.equal(v.graph.version,undefined);
 v.setOptions({scoreVersion:3});v.beginBar();assert.equal(v.graph.version,3);assert.equal(v.bar.scoreVersion,3);assert.equal(v.ctx,ctx);
});
test('The engine starts with the receiver\'s default music and keeps the manual tempo in its range',()=>{
 const m=music(),store=require('../receiver/store'),d=store.SETTINGS_DEFAULTS.music;
 for(const k of ['style','volume','texture','tempoMode','tempo'])assert.equal(m.options[k],d[k],k);
 m.setOptions({tempo:1});assert.equal(m.options.tempo,store.TEMPO_MIN);m.setOptions({tempo:1e4});assert.equal(m.options.tempo,store.TEMPO_MAX);
});
test('A style\'s room (what the Music Studio shows): fixed for the classic score, opened and closed by Space for the composed',()=>{
 const R=music().constructor.roomSeconds;
 // Seconds: the classic score's, then the composed score's at Space 0, .5 and 1.
 const rooms={ambient:[3.2,2.25,3.75,5.25],pulse:[1.6,1,1.75,2.5],cinematic:[3.6,2.25,4,5.75],chip:[.9,.75,1.25,1.5]};
 for(const [style,[v2,...v3]] of Object.entries(rooms))[0,.5,1].forEach((space,i)=>{assert.equal(R(style,2,space),v2,style);assert.equal(R(style,3,space),v3[i],`${style} ${space}`);});
 const m=music();m.setOptions({style:'chip',scoreVersion:3,profile:{space:1}});m.appliedOptions={...m.options};
 const {ctx}=mockContext3();assert.equal(m.buildGraph(ctx,ctx.destination).roomLength,R('chip',3,1),'the engine builds the room it reports');
});

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

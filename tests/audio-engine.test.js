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

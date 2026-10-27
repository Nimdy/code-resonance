'use strict';
// Ecology 2's presentation of the music (public/worlds/life/present.js musicLook): factors of the drawing (the
// environment's light, the life's light, the inhabitants' light, size and traces) read from the ecosystem's relaxed
// conditions. Exactly 1 without music (influence 0, ecology 1, restoring), clearly moving at 1, about twice as far at
// 2, bounded, and smooth from one frame to the next (seconds, never a flicker). Shared fixture: life-driver-fixture.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,recording,player}=require('./life-driver-fixture.js');
const MUSIC={version:3,style:'ambient',seed:9001,profile:null},KEYS=['light','life','bright','size','trail'];
const look=()=>import('../public/worlds/life/present.js');
// One performance at a music influence: the factors every 50 ms of view time (every tick) from 20 s to `secs`.
async function series(music,secs=240,params={}){
  const {musicLook}=await look();const p=await player({entries:recording(Math.ceil(secs/10)+1),params:{ecology:2,music,...params}});p.set({music:MUSIC});
  const out=[];for(let t=20;t<=secs;t+=.05){const v=p.at(T0+t*1000);out.push(musicLook(p.driver.ecosystem,v));}
  return out;
}
const span=(s,k)=>{const l=s.map(x=>Math.log(x[k]));return Math.max(...l)-Math.min(...l);};
test('Without music the drawing is the drawing: every factor exactly 1 (no ecosystem, ecology 1, restoring, neutral conditions)',async()=>{
  const {musicLook}=await look(),one={light:1,life:1,bright:1,size:1,trail:1};
  assert.deepEqual({...musicLook(null)},one);
  assert.deepEqual({...musicLook({ecology:1,cond:{glow:2,activity:2,persist:2,gather:2}})},one,'ecology 1 never asks');
  assert.deepEqual({...musicLook({ecology:2,cond:{glow:2,activity:2,persist:2,gather:2}},{restoring:true})},one,'restoring');
  assert.deepEqual({...musicLook({ecology:2,cond:{glow:1,activity:1,persist:1,gather:1}})},one,'neutral conditions');
  for(const f of await series(0,120))for(const k of KEYS)assert.equal(f[k],1,`music 0: ${k}`);
});
test('Music 1 moves the light and the traces clearly; music 2 about twice as far, bounded and smooth',async t=>{
  const s1=await series(1),s2=await series(2);
  const r=s=>Object.fromEntries(KEYS.map(k=>[k,+span(s,k).toFixed(3)]));
  t.diagnostic(`log ranges · 1 ${JSON.stringify(r(s1))} · 2 ${JSON.stringify(r(s2))}`);
  // (light: the environment's, a passage's weather; life: the light the life gives, the strongest)
  assert(span(s1,'light')>.2&&span(s1,'life')>.5&&span(s1,'bright')>.3&&span(s1,'trail')>.25,`music 1 ${JSON.stringify(r(s1))}`);
  for(const k of ['light','life','bright'])assert(span(s2,k)>span(s1,k)*1.6,`music 2 reads about twice as strongly: ${k} ${span(s1,k).toFixed(3)} -> ${span(s2,k).toFixed(3)}`);
  for(const s of [s1,s2])for(const f of s){assert(f.light>=.55&&f.light<=1.8&&f.life>=.3&&f.life<=3.2&&f.bright>=.4&&f.bright<=2.4&&f.size>=.7&&f.size<=1.5&&f.trail>=.5&&f.trail<=2.4,JSON.stringify(f));}
  // No flicker: from one tick to the next the light changes by less than 2.5 % (a section change takes seconds).
  let step=0;for(let i=1;i<s2.length;i++)for(const k of ['light','life','bright'])step=Math.max(step,Math.abs(Math.log(s2[i][k]/s2[i-1][k])));
  t.diagnostic(`largest change per tick at music 2: ${(step*100).toFixed(2)} %`);
  assert(step<.025,`smooth: ${step}`);
});

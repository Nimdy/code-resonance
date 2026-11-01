'use strict';
// Temporal Terrain, music: with the host's musical clock (ctx.musicAt), the present's contour lines shimmer on each
// off-beat eighth as strongly as the arrangement plays rhythm in that eighth's own bar (so the state at a moment never
// depends on the music after it), and a section's onset sends a soft wave of light back over the land for six seconds.
// Without the clock (a pack frame, headless) nothing changes.
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,ID='temporal-terrain',TEMPO=96,BEAT=60000/TEMPO,BAR=4*BEAT,EIGHTH=BEAT/2;
// musicAt: the stub musical clock (rhythm and section per bar), or null (no clock)
async function scene(musicAt){
  const {THREE}=await load('core'),{createFamily}=await load('terrain'),{createDirector}=await load('director'),{createAgents}=await load('agents'),{createModel}=await load('model');
  const m=createModel(),g=id=>({id,type:'group',q:0,r:0,order:0,counts:{}}),mod=(id,G)=>({id,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A'),g('B')];for(const [p,G] of [['a','A'],['b','B']])for(let k=0;k<4;k++)nodes.push(mod(`${p}${k}`,G));m.reset({nodes,edges:[]},T0);
  const r=recipe.generate({projectId:sha('terrain-music'),graph:{nodes:[],edges:[]},stats:{}},{family:ID,now:0}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);
  const w=createFamily({scene,camera,model:m,recipe:r,speed:()=>1,name:id=>id,director:createDirector({recipe:r}),agents:createAgents(),pipeline:{size:[640,360]},...(musicAt?{musicAt}:{})});w.rebuild();
  let U=null;scene.traverse(o=>{if(o.userData?.terrain)U=o.userData.terrain;});
  const at=t=>{w.update({t,tsec:(t-T0)/1000,tview:(t-T0)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:TEMPO},energy:.4,activity:0,phase:'idle',unlocks:[],agents:[],overrides:{},quality:0,
    music:musicAt?{rhythm:0}:null});return {eighth:U.uEighth.value,sweep:U.uSweep.value.toArray()};};
  return {at};
}
const music=f=>T=>{const bar=Math.floor((T-T0)/BAR);return {rhythm:f(bar),section:Math.floor(bar/8)};};
test('The present\'s lines shimmer on the off-beat eighths, only where the arrangement plays rhythm, read at the eighth\'s own bar',async()=>{
  const X=T0+16*BAR,off=X+3*EIGHTH+10,on=X+2*EIGHTH+10;   // just after an off-beat eighth, and just after an on-beat one
  const none=await scene(null),flat=await scene(music(()=>0)),full=await scene(music(()=>1));
  for(const t of [off,on,X+5000])assert.equal(none.at(t).eighth,0,'no clock: nothing');
  for(const t of [off,on,X+5000])assert.equal(flat.at(t).eighth,0,'no rhythm: nothing');
  const a=full.at(off).eighth,b=full.at(on).eighth;console.log(`# shimmer just after an off-beat eighth ${a.toFixed(3)}, after an on-beat one ${b.toFixed(3)}`);
  assert(a>.2&&a>b*5,'on the off-beat eighths');
  // a shimmer under way never changes: the rhythm stops at bar 16 in B, not in A; just after the bar line both still
  // carry the last off-beat eighth of bar 15, then B is still
  const A=await scene(music(()=>1)),B=await scene(music(k=>k<16?1:0));
  for(const t of [X-3000,X-1,X+10,X+EIGHTH-1])assert.deepEqual(A.at(t),B.at(t),`the same at ${t-X} ms`);
  assert(B.at(X+10).eighth>0,'the last eighth of bar 15 still shimmers');assert.equal(B.at(off).eighth,0,'none in bar 16');
});
test('A section\'s onset sends a soft wave back over the land for six seconds; without the clock there is none',async()=>{
  const X=T0+16*BAR,S=await scene(music(()=>.5)),N=await scene(null);   // sections change every 8 bars: one starts at bar 16
  assert.equal(S.at(X-1000).sweep[1],0,'the section before began long ago');
  const w1=S.at(X+1000).sweep,w3=S.at(X+3000).sweep;assert(w1[1]>0&&w3[1]>0&&w3[1]<w1[1],'a wave, fading');assert(w3[0]>w1[0]+40,'travelling back over the land');
  assert.deepEqual(S.at(X+6500).sweep,[0,0],'over after six seconds');assert.deepEqual(N.at(X+1000).sweep,[0,0]);
});

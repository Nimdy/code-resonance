'use strict';
// Synaptic Storm (preview), music: with the host's musical clock (ctx.musicAt), neurons also fire spontaneously on the
// eighth notes between the beats, gated by the rhythm the arrangement plays in that bar (read at the candidate's own
// bar, so the state at a moment never depends on the music after it), and a section's onset is a soft synchronous
// volley of the whole project. Without the clock (a pack frame, headless) nothing changes.
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,ID='synaptic-storm',TEMPO=96,BEAT=60000/TEMPO,BAR=4*BEAT,EIGHTH=BEAT/2;
function project(){const nodes=[{id:'g1',type:'group'},{id:'g2',type:'group'},{id:'g3',type:'group'}];
  for(let i=0;i<10;i++)nodes.push({id:`m${i}`,type:'module',group:`g${1+i%3}`,dir:`d${i%3}`,lang:'ts',counts:{function:3}});
  return {projectId:sha('music'),graph:{nodes,edges:[]},stats:{raw:100},agents:[]};}
// musicAt: the stub musical clock (rhythm and section per bar), or null (no clock)
async function scene(musicAt){
  const {THREE}=await load('core');const {createFamily}=await load('synaptic');const {createDirector}=await load('director');const {createAgents}=await load('agents');const {createModel}=await load('model');
  const m=createModel(),g=(id,q,r)=>({id,type:'group',q,r,order:0,counts:{}}),mod=(id,G)=>({id,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A',0,0),g('B',7,0),g('C',0,7)];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<6;k++)nodes.push(mod(`${p}${k}`,G));
  m.reset({nodes,edges:[['a2','b0'],['b1','c0']].map(([a,b])=>({a,b,kind:'depends',cross:true}))},T0);
  const r=recipe.generate(project(),{family:ID,now:0}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);
  const w=createFamily({scene,camera,model:m,recipe:r,speed:()=>1,name:id=>id,director:createDirector({recipe:r}),agents:createAgents(),pipeline:{size:[640,360]},...(musicAt?{musicAt}:{})});w.rebuild();
  const frame=t=>({t,tsec:(t-m.epoch)/1000,tview:(t-m.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:TEMPO},energy:.4,activity:0,phase:'idle',unlocks:[],
    agents:[],overrides:{},quality:0,music:musicAt?{rhythm:0}:null});
  let N=null;scene.traverse(o=>{if(!N&&o.material?.uniforms?.uN)N=o.material.uniforms.uN;});
  // every neuron's two latest firings (performance ms), as the state texture holds them
  const firings=t=>{w.update(frame(t));const d=N.value.image.data,n=w.stats().neurons,out=[];for(let i=0;i<n;i++){const o=((Math.floor(i/128)*5+1)*128+i%128)*4;out.push([d[o]*1000+m.epoch,d[o+3]*1000+m.epoch]);}return out;};
  return {w,firings,state:t=>{w.update(frame(t));return Array.from(N.value.image.data);}};
}
const onEighth=x=>{const e=Math.round((x-T0)/EIGHTH);return e%2===1&&Math.abs(x-T0-e*EIGHTH)<.5;};   // exactly on an off-beat eighth (on-beat firings are jittered)
const music=f=>T=>{const bar=Math.floor((T-T0)/BAR);return {rhythm:f(bar),section:Math.floor(bar/8)};};
test('Eighth notes between the beats fire only where the arrangement plays rhythm, read at their own bar',async()=>{
  const count=async f=>{const S=await scene(f?music(f):null),seen=new Set();for(let t=T0+20000;t<T0+80000;t+=EIGHTH/2)for(const [a,b] of S.firings(t))for(const x of [a,b])if(Number.isFinite(x)&&x>T0)seen.add(+x.toFixed(2));
    return [...seen].filter(onEighth).length;};
  const none=await count(null),flat=await count(()=>0),full=await count(()=>1);
  console.log(`# off-beat eighth firings over a minute: no clock ${none}, no rhythm ${flat}, full rhythm ${full}`);
  assert.equal(none,0);assert.equal(flat,0);assert(full>=20,`${full}`);
});
test('The state at a moment never depends on the music after it; a section\'s onset is a soft volley of every neuron',async()=>{
  const X=T0+16*BAR;   // the rhythm stops at bar 16 (and a section starts there) in B, not in A
  const A=await scene(music(()=>1)),B=await scene(music(b=>b<16?1:0));
  for(const t of [X-5000,X-1000,X-1])assert.deepEqual(A.state(t),B.state(t),`the same before the change (${t-X} ms)`);
  // B after the change: an eighth firing seen is from before it
  for(let t=X;t<X+8000;t+=250)for(const [a,b] of B.firings(t))for(const x of [a,b])if(onEighth(x))assert(x<X,'no eighth after the rhythm stops');
  // the section's onset at bar 16: every neuron fires within a third of a beat after it
  const f=A.firings(X+BEAT*.5);assert(f.every(([a,b])=>[a,b].some(x=>x>=X&&x<=X+BEAT*.3+1)),'a synchronous volley at the section\'s start');
});

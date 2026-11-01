'use strict';
// Fractal Continuum, music: with the host's musical clock (ctx.musicAt), sites also fire on the eighth notes between the
// beats, gated by the rhythm the arrangement plays in that bar (read at the candidate's own bar, so the state at a moment
// never depends on the music after it); a section's onset is a soft volley of every site and a brief shimmer of glints
// over the surface. Without the clock (a pack frame, headless) nothing changes. A site's two latest firings are read
// from its threads (each thread carries its importing site's firings to the GPU; here every file imports the next).
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,ID='fractal-continuum',TEMPO=96,BEAT=60000/TEMPO,BAR=4*BEAT,EIGHTH=BEAT/2;
function project(){const nodes=[{id:'g1',type:'group'},{id:'g2',type:'group'},{id:'g3',type:'group'}];
  for(let i=0;i<10;i++)nodes.push({id:`m${i}`,type:'module',group:`g${1+i%3}`,dir:`d${i%3}`,lang:'ts',counts:{function:3}});
  return {projectId:sha('music'),graph:{nodes,edges:[]},stats:{raw:100},agents:[]};}
// musicAt: the stub musical clock (rhythm and section per bar), or null (no clock)
async function scene(musicAt){
  const [{THREE},{createFamily},{createDirector},{createAgents},{createModel}]=await Promise.all(['core','fractal','director','agents','model'].map(load));
  const m=createModel(),g=(id,k)=>({id,type:'group',q:0,r:0,order:k,counts:{}}),mod=(id,G)=>({id,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A',0),g('B',1),g('C',2)],ids=[];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<6;k++){nodes.push(mod(`${p}${k}`,G));ids.push(`${p}${k}`);}
  m.reset({nodes,edges:ids.map((a,k)=>({a,b:ids[(k+1)%ids.length],kind:'depends',cross:a[0]!==ids[(k+1)%ids.length][0]}))},T0);
  const r=recipe.generate(project(),{family:ID,now:0}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);camera.position.set(0,8,60);camera.lookAt(0,0,0);
  const w=createFamily({scene,camera,model:m,recipe:r,speed:()=>1,name:id=>id,director:createDirector({recipe:r}),agents:createAgents(),pipeline:{size:[640,360]},...(musicAt?{musicAt}:{})});w.rebuild();
  const frame=t=>({t,tsec:(t-m.epoch)/1000,tview:(t-m.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:TEMPO},energy:.4,activity:0,phase:'idle',unlocks:[],
    agents:[],overrides:{},quality:0,music:musicAt?{rhythm:0}:null});
  let thr=null,R=null;scene.traverse(o=>{if(o.geometry?.attributes?.hA)thr=o;if(o.userData?.fractal)R=o.userData.fractal;});
  // every site's two latest firings (performance ms), from the threads it imports through (hP.z, hP.w: view seconds)
  const firings=t=>{w.update(frame(t));const G=thr.geometry,P=G.attributes.hP.array,A=G.attributes.hA.array,out=[];
    for(let k=0;k<G.instanceCount;k++)if(A[k*4+3]===0)out.push([P[k*4+2]*1000+m.epoch,P[k*4+3]*1000+m.epoch]);return out;};
  const state=t=>{w.update(frame(t));const G=thr.geometry;return JSON.stringify({hP:Array.from(G.attributes.hP.array.slice(0,G.instanceCount*4)),hQ:Array.from(G.attributes.hQ.array.slice(0,G.instanceCount*4)),sect:R.uSect.value});};
  return {w,firings,state,R,sites:ids.length,at:t=>w.update(frame(t))};
}
const onEighth=x=>{const e=Math.round((x-T0)/EIGHTH);return e%2===1&&Math.abs(x-T0-e*EIGHTH)<.5;};   // exactly on an off-beat eighth (on-beat firings are jittered)
const music=f=>T=>{const bar=Math.floor((T-T0)/BAR);return {rhythm:f(bar),section:Math.floor(bar/8)};};
test('Eighth notes between the beats fire only where the arrangement plays rhythm, read at their own bar',async()=>{
  const count=async f=>{const S=await scene(f?music(f):null),seen=new Set();for(let t=T0+20000;t<T0+80000;t+=EIGHTH/2)for(const [a,b] of S.firings(t))for(const x of [a,b])if(Number.isFinite(x)&&x>T0)seen.add(+x.toFixed(2));
    return [...seen].filter(onEighth).length;};
  const none=await count(null),flat=await count(()=>0),full=await count(()=>1);
  console.log(`# off-beat eighth firings over a minute (18 sites): no clock ${none}, no rhythm ${flat}, full rhythm ${full}`);
  assert.equal(none,0);assert.equal(flat,0);assert(full>=20,`${full}`);
});
test('The state at a moment never depends on the music after it; a section\'s onset is a soft volley of every site and a shimmer',async()=>{
  const X=T0+16*BAR;   // the rhythm stops at bar 16 (and a section starts there) in B, not in A
  const A=await scene(music(()=>1)),B=await scene(music(b=>b<16?1:0)),N=await scene(null);
  for(const t of [X-5000,X-1000,X-1])assert.equal(A.state(t),B.state(t),`the same before the change (${t-X} ms)`);
  // B after the change: an eighth firing seen is from before it
  for(let t=X;t<X+8000;t+=250)for(const [a,b] of B.firings(t))for(const x of [a,b])if(onEighth(x))assert(x<X,'no eighth after the rhythm stops');
  // the section's onset at bar 16: every site fires within a third of a beat after it; the glints shimmer, then calm
  const f=A.firings(X+BEAT*.5);assert.equal(f.length,A.sites);assert(f.every(([a,b])=>[a,b].some(x=>x>=X&&x<=X+BEAT*.3+1)),'a volley at the section\'s start');
  assert(A.R.uSect.value>.2,`a shimmer (${A.R.uSect.value})`);A.at(X-1000);assert.equal(A.R.uSect.value,0,'none mid-section');A.at(X+5000);assert(A.R.uSect.value<.01,'it fades within seconds');
  N.at(X+BEAT*.5);assert.equal(N.R.uSect.value,0,'without the clock, no shimmer');
});

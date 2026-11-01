'use strict';
// Fractal Continuum, agents on the threads: the threads are veins along the surface (never through the form, their
// ends on the sites); moving between two sites the threads join, an agent's signal runs along those veins (the very
// segments the GPU draws, read back from the world's own attributes) at conduction speed, taking longer for a longer
// path; between sites the threads do not join it keeps its ride; a change that interrupts a move never makes it jump;
// agent.collision is two signals meeting at the shared file's site with rings of both colours on the surface. Positions
// are pure functions of the observed lifecycle and the time (the same whatever was drawn before).
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,ID='fractal-continuum';
function project(id){const nodes=[{id:'g1',type:'group'},{id:'g2',type:'group'},{id:'g3',type:'group'}];
  for(let i=0;i<10;i++)nodes.push({id:`m${i}`,type:'module',group:`g${1+i%3}`,dir:`d${i%3}`,lang:'ts',counts:{function:3}});
  return {projectId:sha(id),graph:{nodes,edges:[]},stats:{raw:100},agents:[]};}
// Three subsystems of five files; `links` [importer, imported]; `states` the agent's observed events [file|null, ms, state].
async function scene({links=[['a1','a2'],['a2','b0'],['b1','c0'],['c1','b0'],['a3','c2']],states=[['a1',500],['b0',6000],['c2',12000]],edits=[],swell=null,id='routes'}={}){
  const [{THREE},{createFamily},{createDirector},{createAgents},{createModel}]=await Promise.all(['core','fractal','director','agents','model'].map(load));
  const m=createModel(),g=(gid,k)=>({id:gid,type:'group',q:0,r:0,order:k,counts:{}}),mod=(mid,G)=>({id:mid,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A',0),g('B',1),g('C',2)];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<5;k++)nodes.push(mod(`${p}${k}`,G));
  m.reset({nodes,edges:links.map(([a,b])=>({a,b,kind:'depends',cross:a[0]!==b[0]}))},T0);
  const r0=recipe.generate(project(id),{family:ID,now:0}),r=swell===null?r0:{...r0,genome:{...r0.genome,geometry:{...r0.genome.geometry,swell}}};
  const agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);camera.position.set(0,8,60);camera.lookAt(0,0,0);
  for(const [f,t,state='tool'] of states)agents.record({type:'agent.state',ts:T0+t,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:f},detail:{state,activity:'editing',provider:'cursor'}});
  const w=createFamily({scene,camera,model:m,recipe:r,speed:()=>1,name:n=>`Name ${n}`,director:createDirector({recipe:r}),agents,pipeline:{size:[1280,720]}});w.rebuild();
  const frame=t=>({t,tsec:(t-m.epoch)/1000,tview:(t-m.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',unlocks:[],agents:agents.list(t),overrides:{},quality:0,music:null});
  let fedEdits=0;const update=t=>{while(fedEdits<edits.length&&T0+edits[fedEdits][1]<=t){const [f,at]=edits[fedEdits++];m.cue({type:'structure.modified',detail:{fileId:f,voice:1,attribution:'correlated'}},T0+at);}w.update(frame(t));};
  const at=t=>{update(t);const p=w.agentPosition('x');return p?[p.x,p.y,p.z]:null;};
  let thr=null,R=null,sites=null,fx=null;scene.traverse(o=>{if(o.geometry?.attributes?.hA)thr=o;if(o.userData?.fractal)R=o.userData.fractal;if(o.isPoints&&o.geometry.attributes.sS)sites=o;if(o.isPoints&&o.geometry.attributes.fS)fx=o;});
  // the drawn vein segments (world space), and the veins as polylines (consecutive segments of one thread)
  const segs=()=>{const G=thr.geometry,A=G.attributes.hA.array,B=G.attributes.hB.array,out=[];for(let k=0;k<G.instanceCount;k++)out.push([[A[k*4],A[k*4+1],A[k*4+2]],[B[k*4],B[k*4+1],B[k*4+2]],A[k*4+3],B[k*4+3]]);return out;};
  const veins=()=>{const out=[];let cur=null;for(const s of segs()){if(s[2]===0){cur=[s[0]];out.push(cur);}cur.push(s[1]);}return out;};
  const sitePositions=()=>{const n=sites.geometry.drawRange.count,a=sites.geometry.attributes.position.array,out=[];for(let k=0;k<n;k++)out.push([a[k*3],a[k*3+1],a[k*3+2]]);return out;};
  const state=()=>{const v=x=>Array.from(x.array.slice(0,(x.count??0)*x.itemSize));return JSON.stringify({p:w.agentPosition('x')?.toArray(),fx:Object.fromEntries(Object.entries(fx.geometry.attributes).map(([k,x])=>[k,Array.from(x.array.slice(0,fx.geometry.drawRange.count*x.itemSize))])),
    thr:Object.fromEntries(Object.entries(thr.geometry.attributes).filter(([k])=>k!=='position').map(([k,x])=>[k,Array.from(x.array.slice(0,thr.geometry.instanceCount*x.itemSize))])),tch:R.uTch.value.map(x=>x.toArray()),tchc:R.uTchC.value.map(x=>x.toArray())});};
  return {w,m,r,at,update,frame,segs,veins,sitePositions,state,R};
}
const dseg=(p,[a,b])=>{const ab=[0,1,2].map(c=>b[c]-a[c]),ap=[0,1,2].map(c=>p[c]-a[c]),l2=ab[0]**2+ab[1]**2+ab[2]**2,u=l2>0?Math.max(0,Math.min(1,(ap[0]*ab[0]+ap[1]*ab[1]+ap[2]*ab[2])/l2)):0;return Math.hypot(...[0,1,2].map(c=>a[c]+ab[c]*u-p[c]));};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
test('The threads are veins along the surface: their ends on the sites, their points at the form or just above it, never through it',async()=>{
  const {createFormula}=await load('fractal-forms');
  // no swell (the surface is the formula's own), and a long thread between the two farthest regions
  const S=await scene({swell:0,links:[['a0','b0'],['a1','a2'],['a2','b1'],['b2','c0'],['c1','a3']],states:[]});S.update(T0+20000);
  const st=S.w.stats(),gs=S.R.uWSg.value,f=createFormula(S.r),it=st.drawnIterations,V=S.veins(),P=S.sitePositions();
  assert.equal(V.length,5,'a vein per thread');
  // (the drawn surface along a direction, as the sites are placed on it: the radii at the two neighbouring recursions blended)
  const n0=Math.floor(it),surface=d=>{const a=f.radial(d,n0),b=f.radial(d,n0+1);return (a===null||b===null?Math.max(a??0,b??0):a+(b-a)*(it-n0))*gs;},rad=p=>Math.hypot(...p);
  const angle=v=>Math.acos(Math.min(1,v[0].reduce((s,x,k)=>s+x*v.at(-1)[k],0)/rad(v[0])/rad(v.at(-1))))*180/Math.PI;
  assert(V.some(v=>angle(v)>110),`a long thread (${V.map(v=>angle(v).toFixed(0)).join(', ')} degrees)`);
  const chords=[];
  for(const v of V){for(const end of [v[0],v.at(-1)])assert(P.some(p=>dist(p,end)<1e-4),'each end is a site');
    assert(v.length>=5&&v.length<=41,`segments by its length (${v.length-1})`);
    for(let k=0;k<v.length;k++){const p=v[k];assert(rad(p)>=surface(p.map(x=>x/rad(p)))*.999,'every point of the vein is at the surface or above it');
      if(k)for(const u of [.25,.5,.75]){const q=[0,1,2].map(c=>v[k-1][c]+(p[c]-v[k-1][c])*u);chords.push(rad(q)/surface(q.map(x=>x/rad(q))));}
      assert(rad(p)<=surface(p.map(x=>x/rad(p)))*1.6,'close to the form, not an arc in the void');}}
  chords.sort((a,b)=>a-b);const q05=chords[Math.floor(chords.length*.05)];
  console.log(`# between the points: ${chords.length} samples, min ${chords[0].toFixed(3)}, 5th percentile ${q05.toFixed(3)}, median ${chords[chords.length>>1].toFixed(3)} of the surface's radius`);
  assert(chords[0]>.85&&q05>.97,'between its points a vein dips under a lobe for a moment at most');
});
test('Between two sites the threads join, the agent\'s signal runs along those veins (not its ride), arriving within 1.8 to 3.2 s',async()=>{
  const S=await scene();S.at(T0+5900);
  // the move: tool on a1 until 6 s, then on b0; the threads a1 > a2 > b0 join them (two hops)
  const on=[],trav=[];for(let k=1;k<=12;k++){const p=S.at(T0+6000+k*250);trav.push(S.w.stats().travelling);on.push(+Math.min(...S.segs().map(s=>dseg(p,s))).toFixed(3));}
  console.log(`# distance of the signal from the nearest drawn vein segment (every 250 ms): ${on.join(' ')}`);
  assert(on.slice(1,8).every(d=>d<.02),`it runs along the veins: ${on}`);
  assert.equal(trav[2],1,'the world reports it travelling');assert.equal(trav[9],1,'still on its way at 2.5 s (a long path: longer than the ride\'s 1.8 s)');
  const rest=S.at(T0+6000+3300);assert.equal(S.w.stats().travelling,0);assert(dist(rest,S.at(T0+6000+5000))<.15,'it has arrived by 3.3 s (only the form\'s breath moves it)');
});
test('Between sites the threads do not join it keeps its ride; positions do not depend on the path to a moment',async()=>{
  const S=await scene();S.at(T0+11900);
  // b0 -> c2: no thread path within four hops
  const q=S.at(T0+12000),p=S.at(T0+12900),r=S.at(T0+15000);assert.equal(S.w.stats().travelling,0);
  const mid=[0,1,2].map(c=>(q[c]+r[c])/2);assert(Math.hypot(...p)>Math.hypot(...mid)+.5,'lifted over the form, in spherical coordinates');
  S.at(T0+12900);assert(Math.min(...S.segs().map(s=>dseg(p,s)))>1,'not on a vein');
  const A=await scene(),B=await scene();for(const t of [15000,1200,7100])A.at(T0+t);B.at(T0+7100);
  assert.equal(A.state(),B.state(),'the same signal, trail and veins whatever was drawn before');
});
test('A change that interrupts a move never makes the signal jump; an edit landing at the site it travels to lets it run on along the veins',async()=>{
  // a tool reported on b0 for 40 ms (its home becomes b0), then the agent's edit on b0 lands 300 ms later: the goal moves
  // three times within the first trip
  const S=await scene({states:[['a1',500],['b0',6000],[null,6040,'processing']],edits:[['b0',6300]]});S.at(T0+5900);
  let worst=0,prev=S.at(T0+5900),onVeins=0;
  for(let t=T0+5900+1000/60;t<T0+12000;t+=1000/60){const p=S.at(t);worst=Math.max(worst,dist(p,prev));prev=p;if(t>T0+6400&&t<T0+7400&&Math.min(...S.segs().map(s=>dseg(p,s)))<.02)onVeins++;}
  console.log(`# largest step between frames at 60 fps: ${worst.toFixed(3)} world units; frames on the veins between 6.4 and 7.4 s: ${onVeins}`);
  assert(worst<.8,`no jump (${worst})`);assert(onVeins>=50,'it ran on along the veins');
});
test('agent.collision: two signals in their colours meet at the shared file\'s site, then rings of both colours ripple across the surface',async()=>{
  const T=T0+20000,S=await scene({states:[['a1',500]]}),C=await scene({states:[['a1',500]]}),Rl=await scene({states:[['a1',500]]});for(const x of [S,C,Rl])x.at(T-100);
  S.w.effect({effect:'thread',intent:'agent.collision',at:T,scale:1,tier:2,subject:{fileId:'b1',groupId:'B'},detail:{providers:['claude-code','cursor'],scope:'file'}},S.frame(T));
  // a real connection (thread from subsystem.connected) adds nothing of the kind: growth is drawn from the model
  Rl.w.effect({effect:'thread',intent:'subsystem.connected',at:T,scale:1,tier:2,subject:{fileId:'b1',targetId:'c0'},detail:{}},Rl.frame(T));
  const fx=(x,d)=>{x.at(T+d);return x.w.stats().fx;};
  for(const [d,extra] of [[600,10],[1500,1],[4500,0]]){const a=fx(S,d),c=fx(C,d),r=fx(Rl,d);assert.equal(r,c,`subsystem.connected draws no meeting (${d} ms)`);
    if(extra)assert(a>=c+extra,`${d} ms: ${a} points with the meeting, ${c} without`);else assert.equal(a,c,'gone after four seconds');}
  // the rings: two touch slots at one surface point, one in each agent's colour (Claude rose, Cursor cyan)
  S.at(T+1600);const {THREE}=await load('core');
  const want=['#ff5f8a','#3fe6ff'].map(h=>{const c=new THREE.Color(h);return [c.r*1.6,c.g*1.6,c.b*1.6];}),slots=S.R.uTchC.value.map((c,k)=>({c:c.toArray(),o:S.R.uTch.value[k].toArray()})).filter(x=>x.c[3]>0);
  const found=want.map(wc=>slots.find(x=>x.c.slice(0,3).every((v,k)=>Math.abs(v-wc[k])<.02)));
  assert(found[0]&&found[1],`a ring in each colour (${JSON.stringify(slots.map(x=>x.c.map(v=>+v.toFixed(2))))})`);
  assert.deepEqual(found[0].o.slice(0,3),found[1].o.slice(0,3),'both at the same site');
  S.at(T+4500);assert(S.R.uTchC.value.every(c=>c.w===0),'the rings are gone');
  const words=x=>S.w.describe({intent:'agent.collision',subject:{fileId:'b1',groupId:'B'},detail:{providers:['claude-code','cursor'],scope:x}},S.frame(T));
  assert.equal(words('file').text,'Two agents meet at one site');assert.equal(words('subsystem').text,'Two agents meet in one region');
  for(const x of ['file','subsystem'])assert(!/\b[abc]\d\b/.test(`${words(x).text} ${words(x).sub}`),'no file id in the words');
});

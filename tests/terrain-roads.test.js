'use strict';
// Temporal Terrain, roads as paths in the land: a road leaves the importing peak at the front edge, runs down into the
// valley beside its range, crosses at a depth of its own (deeper the longer it is, so nested roads do not cross) and
// climbs to the imported peak; the land's shader draws it from a light map (a pure function of the roads); an agent
// moving between ranges the roads join travels along them; agent.collision is two signals meeting at the shared file.
// Positions are pure functions of the observed lifecycle and the time (the same whatever was drawn before).
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,ID='temporal-terrain';
test('A road\'s plan: from peak to peak through the valleys beside their ranges, crossing at a depth of its own',async()=>{
  const R=await load('terrain-roads');
  // between neighbouring ranges both valleys are one: the road dips into the valley between them
  const p=R.roadPlan(0,20,10,10),P=p.pts;
  assert.deepEqual(P[0],[0,R.Z0]);assert.deepEqual(P.at(-1),[20,R.Z0]);
  assert(P.some(([x,z])=>Math.abs(x-10)<1e-9&&Math.abs(z-p.lane)<1e-9),'through the valley at its depth');
  assert(P.every(([,z])=>z>=R.Z0-1e-9&&z<=p.lane+1e-9&&z<R.ZR),'never deeper than its lane, within the present\'s band');
  // farther apart, deeper: a longer road passes behind a shorter one it spans
  const outer=R.roadPlan(-20,40,-12,32),inner=R.roadPlan(-5,25,2,18);assert(outer.lane>inner.lane);
  const zAt=(pl,x)=>{let best=null;for(let k=1;k<pl.pts.length;k++){const [a,b]=[pl.pts[k-1],pl.pts[k]];if((a[0]-x)*(b[0]-x)<=0&&a[0]!==b[0]){const u=(x-a[0])/(b[0]-a[0]),z=a[1]+(b[1]-a[1])*u;best=best===null?z:Math.max(best,z);}}return best;};
  for(const x of [4,10,16])assert(zAt(inner,x)<zAt(outer,x),`at x=${x} the shorter road lies in front of the longer`);
  assert.equal(R.laneDepth(0),R.LANE_MIN);assert.equal(R.laneDepth(1e6),R.LANE_MAX);
  // valleys: half way between the facing ridges of neighbouring ranges, a gap beyond the outermost
  const ranges=[{id:'A',c:0,files:[{x:-2},{x:2}]},{id:'B',c:10,files:[{x:8},{x:12}]},{id:'C',c:-10,files:[{x:-12},{x:-8}]}];
  const V=R.valleysOf(ranges,2);assert.deepEqual(V.get('A'),[-5,5]);assert.equal(V.get('B')[0],5);assert.equal(V.get('C')[1],-5);assert(V.get('B')[1]>12&&V.get('C')[0]<-12);
  // along: the point at a plan length, clamped to its ends
  const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-9;assert(near(R.along(p,0),[0,R.Z0])&&near(R.along(p,1e9),[20,R.Z0]));
  const m=R.along(p,p.len/2);assert(Math.abs(m[0]-10)<1&&m[1]>p.lane*.8,'half way along: in the valley');
});
test('The light map is a pure function of the roads: a road\'s own segments never add up, roads do, a road draws itself in',async()=>{
  const R=await load('terrain-roads'),W=256,H=48,x0=-40,w=80,acc=()=>new Float32Array(W*H);
  const a=R.roadPlan(-20,20,-8,8),b=R.roadPlan(-6,30,0,22);
  const one=R.rasterRoads([{plan:a,alpha:1,drawn:1}],x0,w,W,H,acc()),again=R.rasterRoads([{plan:a,alpha:1,drawn:1}],x0,w,W,H,acc());
  assert.deepEqual([...one],[...again],'the same roads, the same map');
  const max=m=>m.reduce((x,y)=>Math.max(x,y),0);assert(max(one)>.9&&max(one)<=1+1e-6,`one road peaks at 1 (${max(one)}), its joints never double`);
  assert(max(R.rasterRoads([{plan:a,alpha:1,drawn:1},{plan:a,alpha:1,drawn:1}],x0,w,W,H,acc()))>1.8,'two roads on one path add');
  const cell=(m,x,z)=>m[Math.floor(z/R.ZR*H)*W+Math.floor((x-x0)/w*W)];
  assert(cell(one,0,a.lane)>.5,'lit along its crossing');assert.equal(cell(one,0,R.ZR-.2),0,'dark away from it');
  // half drawn (it draws itself from the importer): its first half only
  const half=R.rasterRoads([{plan:a,alpha:1,drawn:.5}],x0,w,W,H,acc());assert(cell(half,-20,1.5)>.3&&cell(half,20,1.5)===0);
  // two roads: the map holds both
  const both=R.rasterRoads([{plan:a,alpha:1,drawn:1},{plan:b,alpha:.5,drawn:1}],x0,w,W,H,acc());assert(cell(both,20,b.lane)>.2&&cell(both,-4,a.lane)>.5);
});
test('A route along the roads: breadth first over the ranges they join, nearest road end first, at most three roads',async()=>{
  const {routeOf}=await load('terrain-roads');const f=(id,x,range)=>({id,x,range});
  const roads=[{key:'1',a:f('a1',-6,'A'),b:f('b0',10,'B')},{key:'2',a:f('a3',2,'A'),b:f('b1',14,'B')},{key:'3',a:f('c0',-20,'C'),b:f('b2',18,'B')},{key:'4',a:f('d0',40,'D'),b:f('c1',-24,'C')}];
  const r=routeOf(roads,{range:'A',x:3},{range:'C',x:-20});assert.deepEqual(r.map(x=>[x.road.key,x.rev]),[['2',false],['3',true]],'A to B from the end nearest the agent, then B to C against the road\'s direction');
  assert.deepEqual(routeOf(roads,{range:'A',x:-7},{range:'B',x:0}).map(x=>x.road.key),['1']);
  assert.equal(routeOf(roads,{range:'A',x:0},{range:'D',x:40},2),null,'beyond the hops');assert.equal(routeOf(roads,{range:'A',x:0},{range:'D',x:40}).length,3);
  assert.equal(routeOf(roads,{range:'A',x:0},{range:'A',x:5}),null);assert.equal(routeOf(roads,{range:'A',x:0},{range:'E',x:5}),null);
});
function project(){const nodes=[{id:'g1',type:'group'},{id:'g2',type:'group'},{id:'g3',type:'group'}];
  for(let i=0;i<10;i++)nodes.push({id:`m${i}`,type:'module',group:`g${1+i%3}`,dir:`d${i%3}`,lang:'ts',counts:{function:3}});
  return {projectId:sha('terrain-roads'),graph:{nodes,edges:[]},stats:{raw:100},agents:[]};}
// Three ranges (A in the middle, B right, C left) and dependencies across them; an agent working on one file, then
// another (tool states on files, as synaptic-routes.test.js).
async function scene({links=[['a2','b0'],['b1','c0'],['c1','b0']],moves=[['a1',500],['b0',6000]]}={}){
  const {THREE}=await load('core'),{createFamily}=await load('terrain'),{createDirector}=await load('director'),{createAgents}=await load('agents'),{createModel}=await load('model');
  const m=createModel(),g=id=>({id,type:'group',q:0,r:0,order:0,counts:{}}),mod=(id,G)=>({id,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A'),g('B'),g('C')];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<(p==='a'?7:3);k++)nodes.push(mod(`${p}${k}`,G));
  m.reset({nodes,edges:links.map(([a,b])=>({a,b,kind:'depends',cross:a[0]!==b[0]}))},T0);
  const r=recipe.generate(project(),{family:ID,now:0}),agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);camera.position.set(0,120,200);
  for(const [f,t] of moves)agents.record({type:'agent.state',ts:T0+t,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:f},detail:{state:'tool',activity:'editing',provider:'cursor'}});
  const w=createFamily({scene,camera,model:m,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:createDirector({recipe:r}),agents,pipeline:{size:[1280,720]}});w.rebuild();
  const frame=t=>({t,tsec:(t-m.epoch)/1000,tview:(t-m.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',unlocks:[],agents:agents.list(t),overrides:{},quality:0,music:null});
  let U=null;scene.traverse(o=>{if(o.userData?.terrain)U=o.userData.terrain;});
  const at=t=>{const f=frame(t);w.update(f);w.cameraGoal(f);w.afterCamera(f);const p=w.agentPosition('x');return p?[p.x,p.y,p.z]:null;};
  // the road light under a drawn point (as the land's shader reads it: at the layout x where the land is drawn there)
  const {meanderAt}=await load('terrain-layout');
  const roadAt=p=>{const R=U.uRoadX.value,img=U.uRoad.value.image,z=-p[2],xl=p[0]+meanderAt(p[0],z,U.uWarp.value),u=(xl-R.x)*R.y,v=z/R.z;if(!(u>=0&&u<1&&v>=0&&v<1))return 0;
    const i=Math.floor(u*img.width),j=Math.floor(v*img.height);let best=0;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const ii=i+di,jj=j+dj;if(ii>=0&&jj>=0&&ii<img.width&&jj<img.height)best=Math.max(best,img.data[jj*img.width+ii]);}return best/255;};
  return {w,at,frame,m,U,roadAt};
}
test('Roads lie in the land: the light map is lit along each road\'s path, nothing is drawn in the air for them',async()=>{
  const S=await scene({moves:[]});S.at(T0+5000);const s=S.w.stats();assert.equal(s.roads,3,'a2→b0, b1→c0, c1→b0 (a0→a1 is inside one range)');
  const img=S.U.uRoad.value.image;let lit=0;for(const v of img.data)if(v>96)lit++;assert(lit>200,`${lit} cells lit`);
  assert(S.U.uRoadX.value.w>0&&S.U.uRoadX.value.z===18,'the shader reads the map near the front edge');
  // drawn again only when something changed: the same moment twice leaves the map as it was
  const before=[...img.data];S.at(T0+5000);assert.deepEqual([...S.U.uRoad.value.image.data],before);
  // no roads, no light; the same moment reached directly or after others gives the same map
  const N=await scene({links:[],moves:[]});N.at(T0+5000);assert.equal(N.w.stats().roads,0);assert(N.U.uRoad.value.image.data.every(v=>v===0));
  const A=await scene({moves:[]}),B=await scene({moves:[]});for(const t of [T0+90000,T0+1000,T0+5000])A.at(t);B.at(T0+5000);
  assert.deepEqual([...A.U.uRoad.value.image.data],[...B.U.uRoad.value.image.data]);
});
test('Between ranges a road joins, an agent travels along the road (low over its light), not on an arc; positions do not depend on the path to a moment',async()=>{
  const S=await scene();S.at(T0+5900);
  // the move: tool on a1 (range A) until 6 s, then on b0 (range B); A and B are joined by the road a2 → b0
  const on=[];let arrived=null,low=Infinity;
  for(let k=1;k<=25;k++){const p=S.at(T0+6000+k*200);if(S.w.stats().travel){on.push(+S.roadAt(p).toFixed(2));low=Math.min(low,p[1]);}else if(arrived===null)arrived=k*200;}
  console.log(`# the road's light under the agent while it travels (every 200 ms): ${on.join(' ')}; arrived after ${arrived} ms`);
  // (first down from where it worked to the road's end at a2, then along the road to b0, then up to where it works now)
  const riding=on.filter(v=>v>.35).length;assert(riding>=on.length/2&&riding>=4,`it rides the road: ${on}`);
  assert(arrived>1800&&arrived<=4600,'longer than the arc\'s 1.8 s for this journey, never more than 4.5 s');
  const start=S.at(T0+5990),end=S.at(T0+6000+5000);assert(low<Math.min(start[1],end[1])-2,'down at the road, below where it works');
  // without the road: the lifted arc over 1.8 s, as before
  const N=await scene({links:[]});N.at(T0+5900);const q=N.at(T0+6000),r=N.at(T0+6000+3000),p=N.at(T0+6900);assert(p[1]>(q[1]+r[1])/2+1,'lifted above the straight path');
  assert.equal(N.w.stats().travel,0);
  const A=await scene(),B=await scene();for(const t of [9000,1200,6700])A.at(T0+t);B.at(T0+6700);assert.deepEqual(A.at(T0+6700),B.at(T0+6700),'the same position whatever was drawn before');
});
test('agent.collision: two signals in their colours run in over the ground to the shared file\'s peak, then a ring spreads and fades',async()=>{
  const T=T0+20000,S=await scene({moves:[['a1',500]]}),C=await scene({moves:[['a1',500]]}),R=await scene({moves:[['a1',500]]});for(const x of [S,C,R])x.at(T-100);
  S.w.effect({effect:'road',intent:'agent.collision',at:T,scale:1,tier:2,subject:{fileId:'b1',groupId:'B'},detail:{providers:['claude-code','cursor']}},S.frame(T));
  // a real connection (the road look from subsystem.connected) adds nothing of the kind: its road is drawn from the model
  R.w.effect({effect:'road',intent:'subsystem.connected',at:T,scale:1,tier:2,subject:{fileId:'b1',targetId:'c0'},detail:{}},R.frame(T));
  const fx=(x,d)=>{x.at(T+d);return x.w.stats().fx;};
  for(const [d,extra] of [[600,12],[1500,1],[5000,0]]){const a=fx(S,d),c=fx(C,d),r=fx(R,d);assert.equal(r,c,`subsystem.connected draws no meeting (${d} ms)`);
    if(extra)assert(a>=c+extra,`${d} ms: ${a} points with the meeting, ${c} without`);else assert.equal(a,c,'gone after four seconds');}
  S.w.onPrime();assert.equal(fx(S,1500),fx(C,1500),'after a seek no meeting survives');
  // its words name no file
  const d=S.w.describe({intent:'agent.collision',subject:{fileId:'b1'},detail:{providers:['claude-code','cursor']}},S.frame(T));assert(d&&!/\bb1\b/.test(`${d.text} ${d.sub}`));
});

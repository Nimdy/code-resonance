'use strict';
// Synaptic Storm (preview), agents on the network's own pathways: moving between two neurons joined through the axon
// graph, an agent's signal rides those axons (the curve the GPU draws, reconstructed here from the world's own state
// texture, axon attributes and drift), taking longer for a longer path; between unconnected neurons it keeps its lifted
// arc; agent.collision is two signals meeting at the shared file's neuron. Positions are pure functions of the observed
// lifecycle and the time (the same whatever was drawn before).
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,ID='synaptic-storm';
function project(){const nodes=[{id:'g1',type:'group'},{id:'g2',type:'group'},{id:'g3',type:'group'}];
  for(let i=0;i<10;i++)nodes.push({id:`m${i}`,type:'module',group:`g${1+i%3}`,dir:`d${i%3}`,lang:'ts',counts:{function:3}});
  return {projectId:sha('routes'),graph:{nodes,edges:[]},stats:{raw:100},agents:[]};}
async function scene({links=[['a2','b0'],['b1','c0'],['a0','a1'],['c1','b0']],moves=[['a1',500],['b0',6000]]}={}){
  const {THREE}=await load('core');const {createFamily}=await load('synaptic');const {createDirector}=await load('director');const {createAgents}=await load('agents');const {createModel}=await load('model');
  const m=createModel(),g=(id,q,r)=>({id,type:'group',q,r,order:0,counts:{}}),mod=(id,G)=>({id,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A',0,0),g('B',7,0),g('C',0,7)];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<(p==='a'?7:3);k++)nodes.push(mod(`${p}${k}`,G));
  m.reset({nodes,edges:links.map(([a,b])=>({a,b,kind:'depends',cross:a[0]!==b[0]}))},T0);
  const r={...recipe.generate(project(),{family:ID,now:0})};r.genome={...r.genome,geometry:{...r.genome.geometry,filesPerNeuron:4}};
  const agents=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);
  for(const [f,t] of moves)agents.record({type:'agent.state',ts:T0+t,tier:0,magnitude:.1,evidence:'observed',subject:{agentId:'x',voice:1,fileId:f},detail:{state:'tool',activity:'editing',provider:'cursor'}});
  const w=createFamily({scene,camera,model:m,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:createDirector({recipe:r}),agents,pipeline:{size:[1280,720]}});w.rebuild();
  const frame=t=>({t,tsec:(t-m.epoch)/1000,tview:(t-m.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',unlocks:[],agents:agents.list(t),overrides:{},quality:0,music:null});
  const at=t=>{w.update(frame(t));const p=w.agentPosition('x');return p?[p.x,p.y,p.z]:null;};
  // the axons as the GPU draws them (synaptic.js AXON, at this frame's state): each a cubic from its source soma
  const axons=()=>{let mesh=null,U=null;scene.traverse(o=>{if(!mesh&&o.geometry?.attributes?.xC&&o.type==='Mesh'&&o.renderOrder===1){mesh=o;U=o.material.uniforms;}});
    const N=U.uN.value.image.data,nT=(i,k)=>{const o=((Math.floor(i/128)*5+k)*128+i%128)*4;return [N[o],N[o+1],N[o+2],N[o+3]];};
    const drift=s=>[0,1,2].map(c=>U.uDrift.value*[Math.sin(U.uV.value*.13+s*6.2832)*.55,Math.sin(U.uV.value*.097+s*12.1)*.4,Math.sin(U.uV.value*.111+s*3.7)*.55][c]);
    const A=mesh.geometry.attributes,out=[];
    for(let k=0;k<mesh.geometry.instanceCount;k++){const xa=A.xA.array.slice(k*4,k*4+4),xb=A.xB.array.slice(k*4,k*4+4),xc=A.xC.array.slice(k*4,k*4+4);if(xa[2]!==0)continue;
      const SA=nT(xa[0],0),DA=nT(xa[1],0),sd=drift(nT(xa[0],3)[2]),dd=drift(nT(xa[1],3)[2]),s=[0,1,2].map(c=>SA[c]+sd[c]),e=[0,1,2].map(c=>DA[c]+dd[c]+xb[c]);
      const ch=e.map((v,c)=>v-s[c]),L=Math.hypot(...ch),d=ch.map(v=>v/L),p0=s.map((v,c)=>v+d[c]*SA[3]*.9),up=Math.abs(d[1])<.9?[0,1,0]:[1,0,0];
      let n1=[up[1]*d[2]-up[2]*d[1],up[2]*d[0]-up[0]*d[2],up[0]*d[1]-up[1]*d[0]];const l1=Math.hypot(...n1);n1=n1.map(v=>v/l1);const n2=[d[1]*n1[2]-d[2]*n1[1],d[2]*n1[0]-d[0]*n1[2],d[0]*n1[1]-d[1]*n1[0]];
      const p1=p0.map((v,c)=>v+ch[c]*.33+(n1[c]*xc[0]+n2[c]*xc[1])*L),p2=p0.map((v,c)=>v+ch[c]*.67+(n1[c]*xc[2]+n2[c]*xc[3])*L);
      const pts=[];for(let j=0;j<=64;j++){const u=j/64,v=1-u;pts.push([0,1,2].map(c=>v*v*v*p0[c]+3*v*v*u*p1[c]+3*v*u*u*p2[c]+u*u*u*e[c]));}out.push({si:xa[0],di:xa[1],pts});}
    return out;};
  return {w,at,axons,frame,m};
}
const near=(p,pts)=>Math.min(...pts.map(q=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])));
test('Between two neurons joined by an axon, the agent\'s signal rides that axon (not an arc), longer than the arc\'s 1.8 s',async()=>{
  const S=await scene();S.at(T0+5900);const ax=S.axons();
  // the move: tool on a1 (neuron A#0) until 6 s, then on b0 (B#0); A#0 -> B#0 is the axon a2 -> b0
  const on=[];for(let k=1;k<10;k++){const p=S.at(T0+6000+k*250);const d=Math.min(...S.axons().map(x=>near(p,x.pts)));on.push(+d.toFixed(2));}
  console.log(`# distance of the signal from the nearest axon during the move (every 250 ms): ${on.join(' ')}`);
  // (first in from its branch to the soma, then along the axon to the synapse on the other neuron's branch)
  assert(on.slice(3).every(d=>d<.6),`it rides the axon: ${on}`);
  const p18=S.at(T0+6000+1800),p20=S.at(T0+6000+2000);assert(Math.hypot(p18[0]-p20[0],p18[1]-p20[1],p18[2]-p20[2])>.02,'still on its way after the arc\'s 1.8 s');
  const end=S.at(T0+6000+4600),rest=S.at(T0+6000+5000);assert(Math.hypot(end[0]-rest[0],end[1]-rest[1],end[2]-rest[2])<.6,'it has arrived by 4.6 s');
  assert(ax.length>=2,'axons drawn');
});
test('Between neurons the axon graph does not join, the signal keeps its lifted arc; positions do not depend on the path to a moment',async()=>{
  const S=await scene({links:[['b1','c0']],moves:[['a1',500],['b0',6000]]});S.at(T0+5900);
  const p=S.at(T0+6900),q=S.at(T0+6000),r=S.at(T0+7800+1000);   // mid-arc, start, arrived
  const mid=[0,1,2].map(c=>(q[c]+r[c])/2);assert(p[1]>mid[1]+1,'lifted above the straight path');
  const A=await scene(),B=await scene();for(const t of [9000,1200,7100])A.at(T0+t);B.at(T0+7100);
  assert.deepEqual(A.at(T0+7100),B.at(T0+7100),'the same position whatever was drawn before');
});
test('agent.collision: two signals in their colours meet at the shared file\'s neuron, then a ring spreads and fades',async()=>{
  // against the same scene without the event, at the same moments
  const T=T0+20000,S=await scene({moves:[['a1',500]]}),C=await scene({moves:[['a1',500]]}),R=await scene({moves:[['a1',500]]});for(const x of [S,C,R])x.at(T-100);
  S.w.effect({effect:'axon-link',intent:'agent.collision',at:T,scale:1,tier:2,subject:{fileId:'b1',groupId:'B'},detail:{providers:['claude-code','cursor']}},S.frame(T));
  // a real connection (axon-link from subsystem.connected) adds nothing of the kind: growth is drawn from the model
  R.w.effect({effect:'axon-link',intent:'subsystem.connected',at:T,scale:1,tier:2,subject:{fileId:'b1',targetId:'c0'},detail:{}},R.frame(T));
  const fx=(x,d)=>{x.at(T+d);return x.w.stats().fx;};
  for(const [d,extra] of [[600,12],[1500,1],[5000,0]]){const a=fx(S,d),c=fx(C,d),r=fx(R,d);assert.equal(r,c,`subsystem.connected draws no meeting (${d} ms)`);
    if(extra)assert(a>=c+extra,`${d} ms: ${a} points with the meeting, ${c} without`);else assert.equal(a,c,'gone after four seconds');}
});

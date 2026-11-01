'use strict';
// Synaptic Storm's subagents: a subagent (an agent whose intents name its parent, interpretation 11; the relation itself
// is tested in tests/agent-parents.test.js) is a smaller signal tethered to its parent's by a faint filament in its
// colour: along the axon pathway between their neurons when the graph joins them, otherwise a shallow arc, easing
// between the two while a signal travels (it never jumps); absent when the parent is unknown or has ended; and a pure
// function of the moment (the same whatever was drawn before, at any frame rate).
const test=require('node:test'),assert=require('node:assert/strict');
const recipe=require('../engine/recipe');
const {sha}=require('../receiver/protocol');
const load=n=>import(`../public/worlds/${n}.js`);
const T0=1750000000000,ID='synaptic-storm';
// The network of tests/synaptic-routes.test.js: three clusters, an axon a2 -> b0 joining neuron A#0 to B#0.
async function scene({links=[['a2','b0'],['b1','c0'],['a0','a1'],['c1','b0']],intents}={}){
  const {THREE}=await load('core');const {createFamily}=await load('synaptic');const {createDirector}=await load('director');const {createAgents}=await load('agents');const {createModel}=await load('model');
  const m=createModel(),g=(id,q,r)=>({id,type:'group',q,r,order:0,counts:{}}),mod=(id,G)=>({id,type:'module',group:G,dir:G,q:0,r:0,state:'committed',counts:{function:3}});
  const nodes=[g('A',0,0),g('B',7,0),g('C',0,7)];for(const [p,G] of [['a','A'],['b','B'],['c','C']])for(let k=0;k<(p==='a'?7:3);k++)nodes.push(mod(`${p}${k}`,G));
  m.reset({nodes,edges:links.map(([a,b])=>({a,b,kind:'depends',cross:a[0]!==b[0]}))},T0);
  const nodes0=[{id:'g1',type:'group'}];for(let i=0;i<6;i++)nodes0.push({id:`m${i}`,type:'module',group:'g1',dir:'d',lang:'ts',counts:{function:3}});
  const r={...recipe.generate({projectId:sha('tether'),graph:{nodes:nodes0,edges:[]},stats:{raw:100},agents:[]},{family:ID,now:0})};r.genome={...r.genome,geometry:{...r.genome.geometry,filesPerNeuron:4}};
  const agents=createAgents(),sc=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);
  for(const i of intents)agents.record({type:'agent.state',tier:0,magnitude:.1,evidence:'observed',...i});
  const w=createFamily({scene:sc,camera,model:m,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:createDirector({recipe:r}),agents,pipeline:{size:[1280,720]}});w.rebuild();
  const frame=t=>({t,tsec:(t-m.epoch)/1000,tview:(t-m.epoch)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',unlocks:[],agents:agents.list(t),overrides:{},quality:0,music:null});
  let fx=null;sc.traverse(o=>{if(!fx&&o.type==='Points'&&o.geometry.attributes.fC)fx=o.geometry;});
  // the points drawn at t: position, colour, size and shape of each
  const at=t=>{w.update(frame(t));const n=w.stats().fx,A=fx.attributes;return {n,tethers:w.stats().tethers,pos:Array.from(A.position.array.slice(0,n*3)),col:Array.from(A.fC.array.slice(0,n*4)),size:Array.from(A.fS.array.slice(0,n*2)),
    head:id=>{const p=w.agentPosition(id);return p?[p.x,p.y,p.z]:null;}};};
  const axons=()=>{let mesh=null,U=null;sc.traverse(o=>{if(!mesh&&o.geometry?.attributes?.xC&&o.type==='Mesh'&&o.renderOrder===1){mesh=o;U=o.material.uniforms;}});
    const N=U.uN.value.image.data,nT=(i,k)=>{const o=((Math.floor(i/128)*5+k)*128+i%128)*4;return [N[o],N[o+1],N[o+2],N[o+3]];};
    const drift=s=>[0,1,2].map(c=>U.uDrift.value*[Math.sin(U.uV.value*.13+s*6.2832)*.55,Math.sin(U.uV.value*.097+s*12.1)*.4,Math.sin(U.uV.value*.111+s*3.7)*.55][c]);
    const A=mesh.geometry.attributes,out=[];
    for(let k=0;k<mesh.geometry.instanceCount;k++){const xa=A.xA.array.slice(k*4,k*4+4),xb=A.xB.array.slice(k*4,k*4+4),xc=A.xC.array.slice(k*4,k*4+4);if(xa[2]!==0)continue;
      const SA=nT(xa[0],0),DA=nT(xa[1],0),sd=drift(nT(xa[0],3)[2]),dd=drift(nT(xa[1],3)[2]),s=[0,1,2].map(c=>SA[c]+sd[c]),e=[0,1,2].map(c=>DA[c]+dd[c]+xb[c]);
      const ch=e.map((v,c)=>v-s[c]),L=Math.hypot(...ch),d=ch.map(v=>v/L),p0=s.map((v,c)=>v+d[c]*SA[3]*.9),up=Math.abs(d[1])<.9?[0,1,0]:[1,0,0];
      let n1=[up[1]*d[2]-up[2]*d[1],up[2]*d[0]-up[0]*d[2],up[0]*d[1]-up[1]*d[0]];const l1=Math.hypot(...n1);n1=n1.map(v=>v/l1);const n2=[d[1]*n1[2]-d[2]*n1[1],d[2]*n1[0]-d[0]*n1[2],d[0]*n1[1]-d[1]*n1[0]];
      const p1=p0.map((v,c)=>v+ch[c]*.33+(n1[c]*xc[0]+n2[c]*xc[1])*L),p2=p0.map((v,c)=>v+ch[c]*.67+(n1[c]*xc[2]+n2[c]*xc[3])*L);
      const pts=[];for(let j=0;j<=64;j++){const u=j/64,v=1-u;pts.push([0,1,2].map(c=>v*v*v*p0[c]+3*v*v*u*p1[c]+3*v*u*u*p2[c]+u*u*u*e[c]));}out.push(pts);}
    return out;};
  return {w,at,axons,THREE};
}
// A Claude session editing a1 (neuron A#0) and its subagent reading b0 (B#0); `parent` is what the subagent's intents name.
const pair=({parent='P',end=null}={})=>[
  {ts:T0+500,subject:{agentId:'P',voice:0,fileId:'a1'},detail:{state:'tool',activity:'editing',provider:'claude-code'}},
  {ts:T0+1000,subject:{agentId:'S',voice:0,...(parent?{parentAgentId:parent}:{})},detail:{state:'processing',activity:null,provider:'claude-code',subagent:true}},
  {ts:T0+1500,subject:{agentId:'S',voice:0,fileId:'b0',...(parent?{parentAgentId:parent}:{})},detail:{state:'tool',activity:'reading',provider:'claude-code'}},
  ...(end?[{ts:end,subject:{agentId:'P',voice:0},detail:{state:'disconnected',activity:null,provider:'claude-code'}}]:[])];
const pointsAfter=(f,from)=>{const out=[];for(let k=from;k<f.n;k++)out.push({p:f.pos.slice(k*3,k*3+3),c:f.col.slice(k*4,k*4+3),size:f.size[k*2],shape:f.size[k*2+1]});return out;};
const d3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
test('A subagent is a smaller signal with a faint tether to its parent\'s signal, in its colour, along the axon pathway',async()=>{
  const T=T0+8000,S=await scene({intents:pair()}),C=await scene({intents:pair({parent:null})});
  const f=S.at(T),g=C.at(T);
  assert.equal(f.tethers,1);assert.equal(g.tethers,0);
  assert.deepEqual(f.pos.slice(0,g.n*3),g.pos,'the signals themselves are the same with and without the tether');
  const tp=pointsAfter(f,g.n);console.log(`# tether: ${tp.length} points`);assert(tp.length>=12,`${tp.length} tether points`);
  const want=new S.THREE.Color('#ff5f8a');
  for(const x of tp){const k=x.c[0]/want.r;assert(Math.abs(x.c[1]-want.g*k)<1e-5&&Math.abs(x.c[2]-want.b*k)<1e-5,'Claude\'s colour');assert(k<.75,`faint (${k})`);assert(x.size<=5.1&&x.shape===8,'fine soft points');}
  const P=f.head('P'),Q=f.head('S');assert(Math.min(...tp.map(x=>d3(x.p,P)))<1.6,'from the parent\'s signal');assert(Math.min(...tp.map(x=>d3(x.p,Q)))<1.6,'to the subagent\'s');
  // along the axon a2 -> b0 that joins their neurons (the part between the two neurons' somas)
  const ax=S.axons(),onAxon=tp.filter(x=>Math.min(...ax.map(pts=>Math.min(...pts.map(q=>d3(x.p,q)))))<.5).length;
  console.log(`# ${onAxon} of ${tp.length} tether points within 0.5 of an axon`);assert(onAxon>=tp.length*.5,`${onAxon} of ${tp.length} on the axons`);
  // smaller: the subagent's signal points are 0.6 of its parent's
  const both=pointsAfter(g,0).filter(x=>x.shape===0).map(x=>x.size).sort((a,b)=>b-a);assert.deepEqual(both.map(x=>+x.toFixed(2)),[46,27.6],'the heads: parent 46 px, subagent 0.6 of it');
  // between neurons the graph does not join, a shallow arc
  const U=await scene({links:[['b1','c0']],intents:pair()}),V=await scene({links:[['b1','c0']],intents:pair({parent:null})});
  const u=U.at(T),v=V.at(T),arc=pointsAfter(u,v.n);assert.equal(u.tethers,1);assert(arc.length>=12);
  const a=u.head('P'),b=u.head('S'),mid=[0,1,2].map(c=>(a[c]+b[c])/2);assert(Math.max(...arc.map(x=>x.p[1]))>mid[1]+.5,'lifted above the straight line');
});
test('No tether when the parent is unknown or has ended',async()=>{
  const T=T0+8000;
  const unknown=(await scene({intents:pair({parent:'nobody'})})).at(T);assert.equal(unknown.tethers,0,'a parent that is not here');
  const E=await scene({intents:pair({end:T0+7000})}),F=await scene({intents:pair({parent:null,end:T0+7000})});
  const e=E.at(T0+7400),f=F.at(T0+7400);assert(e.head('P'),'the parent\'s signal is still fading out');
  assert.equal(e.tethers,0);assert.equal(e.n,f.n,'nothing drawn for it');
  const before=E.at(T0+6900);assert.equal(before.tethers,1,'until the parent ends');
});
test('The tether is a pure function of the moment: the same whatever was drawn before and at any frame rate',async()=>{
  const T=T0+9300,A=await scene({intents:pair()}),B=await scene({intents:pair()}),C=await scene({intents:pair()});
  const a=A.at(T);
  for(const t of [T0+30000,T0+2000,T0+12000,T0+600])B.at(t);const b=B.at(T);
  for(let t=T0+6000;t<T;t+=1000/60)C.at(t);const c=C.at(T);
  assert.equal(a.tethers,1);
  for(const x of [b,c]){assert.deepEqual(x.pos,a.pos);assert.deepEqual(x.col,a.col);assert.deepEqual(x.size,a.size);}
  // the bead runs down it from the parent: the brightest tether point moves away from the parent's signal over time
  const N=await scene({intents:pair({parent:null})}),brightest=t=>{const f=A.at(t),tp=pointsAfter(f,N.at(t).n);let best=tp[0];for(const x of tp)if(x.c[0]>best.c[0])best=x;return d3(best.p,f.head('P'));};
  const d=[];for(let k=0;k<20;k++)d.push(brightest(T+700+k*100));let up=0;for(let k=1;k<d.length;k++)if(d[k]>d[k-1]+.05)up++;
  console.log(`# the brightest tether point's distance from the parent, every 100 ms: ${d.map(x=>x.toFixed(1)).join(' ')}`);
  assert(up>=12,`the bead moves away from the parent (${up} of 19 steps)`);
});
test('While a signal travels between goals the tether eases between the pathway and the arc: it never jumps',async()=>{
  // the subagent moves from b0 (B#0, joined to its parent's neuron) to c2 (C#0, not joined to it) at 9 s
  const move={ts:T0+9000,subject:{agentId:'S',voice:0,fileId:'c2',parentAgentId:'P'},detail:{state:'tool',activity:'reading',provider:'claude-code'}};
  const S=await scene({intents:[...pair(),move]}),C=await scene({intents:[...pair({parent:null}),{...move,subject:{agentId:'S',voice:0,fileId:'c2'}}]});
  const centre=t=>{const f=S.at(t),tp=pointsAfter(f,C.at(t).n);assert.equal(f.tethers,1,`tethered at ${t-T0}`);return [0,1,2].map(c=>tp.reduce((x,p)=>x+p.p[c],0)/tp.length);};
  let last=centre(T0+8900),max=0;for(let t=T0+8900+1000/30;t<T0+15000;t+=1000/30){const c=centre(t);max=Math.max(max,d3(c,last));last=c;}
  console.log(`# largest step of the tether's centre between frames at 30 fps through the move: ${max.toFixed(3)}`);
  assert(max<1,`no jump (${max.toFixed(3)})`);
});

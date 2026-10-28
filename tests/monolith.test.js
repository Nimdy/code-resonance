'use strict';
// Monolith (public/worlds/monolith.js), the 2D stage and the no-WebGL fallback: towers stand on the persisted site plan,
// every frame is a function of the graph and the clock, an unchanged frame is copied, and its only words are public ones.
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../public/worlds/monolith.js');
const T0=1750000000000,SQRT3=Math.sqrt(3);
const group=(id,order,x={})=>({id,type:'group',order,counts:{function:4},...x});
// Private text rides along on the nodes as a client might send it: it must never be drawn.
const mod=(id,g,q,r,x={})=>({id,type:'module',group:g,q,r,state:'committed',counts:{function:3},born:-Infinity,dying:null,name:'secret-folder',path:'src/secret.ts',...x});
function scene(extra=[]){
  const groups=new Map([['g1',group('g1',0,{core:true,counts:{}})],['g2',group('g2',1,{counts:{'ui.component':5,function:2}})],['g3',group('g3',2,{test:true})]]);
  const nodes=new Map([mod('a','g1',0,0),mod('b','g2',2,-1,{counts:{'ui.component':40}}),mod('c','g2',3,-1,{state:'validated'}),mod('d','g3',-2,2,{test:true,state:'draft'}),...extra].map(n=>[n.id,n]));
  const edges=new Map([['b>c',{a:'b',b:'c',kind:'depends'}],['a>b',{a:'a',b:'b',kind:'depends',cross:true}],['b>s',{a:'b',b:'s',kind:'contains'}]]);
  return {nodes,groups,edges};
}
// A 2D context that records what is drawn (nothing is rendered).
function context(){
  const log=[];
  return new Proxy({},{get:(_,k)=>k==='log'?log:k==='measureText'?t=>({width:String(t).length*7}):k==='createLinearGradient'?(...a)=>(log.push(['gradient',...a]),{addColorStop:(...s)=>log.push(['stop',...s])}):(...a)=>{log.push([k,...a]);},
    set:(_,k,v)=>{log.push(['set',k,v]);return true;}});
}
function stage(){const layers=[];const m=(async()=>(await load()).createMonolith({canvas:(width,height)=>{const c={width,height,ctx:context()};c.getContext=()=>c.ctx;layers.push(c);return c;}}))();return {m,layers};}
const frame=(s,x={})=>({w:1280,h:720,scale:1,now:T0,speed:1,...s,marks:[],agents:new Map(),version:1,recipe:null,labels:'cinematic',section:'home',pulse:0,energy:0,still:false,...x});
const texts=log=>log.filter(c=>c[0]==='fillText').map(c=>c[1]);
test('Towers stand on the persisted site plan: placing another file never moves one, and storeys are the file\'s symbols',async()=>{
  const {towers}=await load(),s=scene();
  const before=towers(s.nodes,T0);
  assert.deepEqual(before.map(t=>t.id),['b','c','a','d'],'back row first');
  const b=before.find(t=>t.id==='b');assert.deepEqual([b.x,b.z,b.symbols,b.storeys],[SQRT3*2-SQRT3/2,-1.5,40,40]);
  const after=towers(scene([mod('e','g2',5,-3)]).nodes,T0);
  for(const t of before)assert.deepEqual([after.find(x=>x.id===t.id).x,after.find(x=>x.id===t.id).z],[t.x,t.z],t.id);
});
test('Births rise, symbols grow, removals fade, all as functions of the performance clock (in viewer time); reduced motion stills them',async()=>{
  const {towers}=await load();
  const s=scene([mod('n','g2',1,1,{born:T0}),mod('x','g2',4,0,{dying:T0}),mod('m','g2',0,1,{counts:{function:9},countsWas:{function:1},countsAt:T0})]);
  const at=(t,o)=>Object.fromEntries(towers(s.nodes,t,o).filter(x=>'nxm'.includes(x.id)).map(x=>[x.id,{grow:+x.grow.toFixed(3),alpha:+x.alpha.toFixed(3),storeys:+x.storeys.toFixed(2)}]));
  assert.equal(at(T0-1).n,undefined,'a file appears at its own time');
  assert.deepEqual(at(T0-1).m.storeys,1);
  const mid=at(T0+600),end=at(T0+3000);
  assert(mid.n.grow>0&&mid.n.grow<1&&mid.x.alpha<1&&mid.m.storeys>1&&mid.m.storeys<9,JSON.stringify(mid));
  assert.deepEqual([end.n.grow,end.x,end.m.storeys],[1,undefined,9]);
  assert.deepEqual(at(T0+600),at(T0+600),'the same moment, the same picture');
  assert.deepEqual(at(T0+600*4,{speed:4}),mid,'at 4x replay the same moment in viewer time');
  const still=at(T0+600,{still:true});assert.deepEqual([still.n.grow,still.m.storeys],[1,9],'reduced motion: nothing rises or grows');assert(still.n.alpha===1);
});
test('Its words are public: the approved title or the generic one, counts, and districts by alias or generated name and role',async()=>{
  const {captions,towers}=await load(),{generatedName}=await import('../public/worlds/labels.js'),s=scene();
  const list=towers(s.nodes,T0);
  let c=captions(list,{groups:s.groups,links:2});
  assert.equal(c.title,'Code Resonance');assert.equal(c.stats,'4 files · 49 symbols · 2 links');
  assert.deepEqual(c.districts.map(d=>[d.name,d.role,d.files]),[[generatedName('g2'),'interface',2],[generatedName('g1'),'core',1],[generatedName('g3'),'tests',1]]);
  c=captions(list,{groups:s.groups,recipe:{title:'Night Shift',aliases:{g2:'Front Desk'}}});
  assert.equal(c.title,'Night Shift');assert.equal(c.districts[0].name,'Front Desk');
});
test('A frame is a function of its inputs; an unchanged frame is copied, not redrawn; nothing private is ever drawn',async()=>{
  const a=stage(),b=stage(),ma=await a.m,mb=await b.m,s=scene();
  const ga=context(),gb=context();
  ma.draw(ga,frame(s));mb.draw(gb,frame(s));
  const strip=log=>JSON.stringify(log.map(c=>c.map(x=>x&&typeof x==='object'&&'ctx' in x?'layer':x)));
  assert.equal(strip(a.layers[0].ctx.log),strip(b.layers[0].ctx.log),'the same drawing from the same data');
  assert.equal(strip(ga.log),strip(gb.log));
  const drawn=texts(a.layers[0].ctx.log).join('\n');
  assert.match(drawn,/MONOLITH/);assert.match(drawn,/Code Resonance/);assert.match(drawn,/4 files · 49 symbols · 2 links/);
  assert(!/secret/.test(JSON.stringify(a.layers[0].ctx.log)+JSON.stringify(ga.log)),'no private field reaches the canvas');
  // Idle: the next frames copy the layer (the beat on the ground line is drawn over it).
  for(let i=1;i<=5;i++)ma.draw(ga,frame(s,{now:T0+i*16,pulse:i/5}));
  assert.deepEqual([ma.stats().frames,ma.stats().redraws],[6,1]);
  // An edit lights a file: redrawn while its light climbs and fades, then copied again.
  s.nodes.get('c').litAt=T0+100;
  for(const t of [T0+200,T0+400])ma.draw(ga,frame(s,{now:t}));assert.equal(ma.stats().redraws,3);
  ma.draw(ga,frame(s,{now:T0+9000}));ma.draw(ga,frame(s,{now:T0+9016}));assert.equal(ma.stats().redraws,4);
  // Labels off: no text at all; without nodes (another world loading): the empty ground, no text.
  const c=stage(),mc=await c.m;mc.draw(context(),frame(s,{labels:'off'}));assert.deepEqual(texts(c.layers[0].ctx.log),[]);
  const d=stage(),md=await d.m;md.draw(context(),frame({nodes:null,groups:new Map(),edges:new Map()}));assert.deepEqual(texts(d.layers[0].ctx.log),[]);
});
test('Motion: an agent\'s mark, a commit\'s sweep and a failure\'s red are drawn at their times; reduced motion has no sweep or climb',async()=>{
  const {m}=stage(),mono=await m,s=scene();s.nodes.get('c').litAt=T0;
  const g=context();
  mono.draw(g,frame(s,{now:T0+500,marks:[{at:T0,kind:'lift'}],agents:new Map([[2,{id:'c',at:T0}]])}));
  const calls=g.log.map(c=>c[0]);
  assert(calls.includes('gradient'),'the sweep travels the ground line');assert(calls.includes('closePath'),'the agent\'s mark');
  const still=stage(),ms=await still.m,gs=context();
  ms.draw(gs,frame(s,{now:T0+500,still:true,marks:[{at:T0,kind:'lift'}]}));
  assert(!gs.log.some(c=>c[0]==='gradient'),'no travelling sweep');
  const climbing=log=>log.filter(c=>c[0]==='fillRect'&&c[4]===3).length;
  assert(climbing(still.layers[0].ctx.log)===0&&climbing((await (async()=>{const x=stage(),mx=await x.m;mx.draw(context(),frame(s,{now:T0+500}));return x.layers[0].ctx.log;})()))>0,'the light climbs only with motion');
  // A mark before its time or after its end draws nothing.
  const late=stage(),ml=await late.m,gl=context();ml.draw(gl,frame(s,{now:T0+9000,marks:[{at:T0,kind:'strain'},{at:T0+20000,kind:'lift'}]}));
  assert.equal(gl.log.filter(c=>c[0]==='fillRect').length,0);
});

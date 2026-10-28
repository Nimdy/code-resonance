'use strict';
// The hover card over the living world (public/ui/hover.js, host.js hoverFacts): when it may show, how often it picks,
// where it goes, what it says. It is DOM in the interactive views only: never drawn into the stage, never in the OBS view.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ui=()=>import('../public/ui/hover.js');
const T0=1750000000000;
test('The card shows only over the living world in an interactive view, with labels Cinematic or Explorer',async()=>{
  const {hoverAllowed}=await ui();const base={labels:'cinematic',world:'living',running:true};
  assert.equal(hoverAllowed(base),true);assert.equal(hoverAllowed({...base,labels:'explorer'}),true);
  for(const labels of ['stream','off'])assert.equal(hoverAllowed({...base,labels}),false,labels);
  assert.equal(hoverAllowed({...base,overlay:true}),false,'never in the OBS view');assert.equal(hoverAllowed({...base,film:true}),false,'never in a film');
  assert.equal(hoverAllowed({...base,world:'construct'}),false);assert.equal(hoverAllowed({...base,running:false}),false);
  assert.equal(hoverAllowed({...base,modal:true}),false,'not over a dialog or menu');assert.equal(hoverAllowed({...base,idle:true}),false,'not while the Stage rests');
});
test('Picking is throttled to ten a second, the latest position wins, and stale answers are dropped',async()=>{
  const {createPicker,PICK_MS}=await ui();
  let now=0;const timers=[],picks=[],shown=[];
  const later=(f,ms)=>{const t={at:now+ms,f};timers.push(t);return t;},cancel=t=>{const k=timers.indexOf(t);if(k>=0)timers.splice(k,1);};
  const advance=to=>{for(;;){timers.sort((a,b)=>a.at-b.at);const t=timers[0];if(!t||t.at>to)break;timers.shift();now=t.at;t.f();}now=to;};
  const resolvers=[];
  const p=createPicker({interval:PICK_MS,now:()=>now,later,cancel,pick:x=>{picks.push(x);return new Promise(r=>resolvers.push(r));},show:(r,x)=>shown.push([r,x])});
  // A second of pointer movement at 120 Hz.
  for(let k=0;k<120;k++){advance(k*1000/120);p.move({x:k,y:0});}
  advance(1100);
  assert(picks.length>=10&&picks.length<=11,`${picks.length} picks`);
  assert.equal(picks[0].x,0,'the first at once');assert.equal(picks.at(-1).x,119,'the latest position at the end');
  // Answers arrive late and out of order: only the newest pick's answer is shown.
  resolvers.at(-1)('newest');resolvers[0]('old');await new Promise(r=>setImmediate(r));
  assert.deepEqual(shown.map(s=>s[0]),['newest']);
  // Leaving drops what is in flight and what is scheduled.
  p.move({x:500,y:0});advance(1150);p.move({x:501,y:0});assert.equal(picks.at(-1).x,500);p.stop();advance(2000);
  resolvers.at(-1)('after leaving');await new Promise(r=>setImmediate(r));
  assert.deepEqual(shown.map(s=>s[0]),['newest']);assert.equal(picks.at(-1).x,500,'the pending move was cancelled');
});
test('The card sits beside the pointer, inside the stage, never over the pointer, and off the stage\'s controls',async()=>{
  const {placeCard}=await ui();const box={w:240,h:90},b={left:8,top:8,right:1912,bottom:1072};
  assert.deepEqual(placeCard({x:400,y:300},box,b),{left:416,top:316},'below right by default');
  const right=placeCard({x:1850,y:300},box,b);assert(right.left+box.w<=1912&&right.left+box.w<1850,'flips left near the right edge');
  const low=placeCard({x:400,y:1040},box,b);assert(low.top+box.h<1040,'goes above near the bottom');
  // The Stage's bottom bar under the default place: the card goes above the pointer instead.
  const bar={left:0,right:1920,top:880,bottom:1080};const up=placeCard({x:400,y:820},box,b,[bar]);assert(up.top+box.h<=820&&up.top+box.h<=880,JSON.stringify(up));
  for(const pt of [{x:10,y:10},{x:1910,y:1070},{x:960,y:540}]){const p=placeCard(pt,box,b,[bar]);assert(!(pt.x>=p.left&&pt.x<=p.left+box.w&&pt.y>=p.top&&pt.y<=p.top+box.h),JSON.stringify([pt,p]));}
});
test('Facts come from the model and the presences: agents there, the newest test verdict and edit, sizes',async()=>{
  const [{hoverFacts},{createModel},{createAgents}]=await Promise.all([import('../public/worlds/host.js'),import('../public/worlds/model.js'),import('../public/worlds/agents.js')]);
  const model=createModel(),agents=createAgents();
  model.reset({nodes:[{id:'g1',type:'group'},{id:'m1',type:'module',group:'g1',state:'committed'},{id:'m2',type:'module',group:'g1',state:'committed'},{id:'s1',type:'function',parent:'m1'}],edges:[]},T0);
  model.cue({type:'validation.test.failed',detail:{fileIds:['m1']}},T0+10000);model.cue({type:'validation.test.passed',detail:{fileIds:['m1','m2']}},T0+40000);
  const st=(ts,detail,fileId)=>({type:'agent.state',ts,subject:{agentId:'a1',voice:2,...(fileId?{fileId}:{})},detail:{provider:'claude-code',...detail}});
  agents.record(st(T0+1000,{state:'processing'}));agents.record(st(T0+50000,{state:'tool',activity:'editing'},'m1'));agents.record(st(T0+50100,{state:'processing'},'m1'));
  const at=t=>({t,agents:agents.list(t)});
  const during=hoverFacts({model,agents,agentColor:()=>'#ffd27a'},'m1',at(T0+50050));
  assert.equal(during.kind,'module');assert.equal(during.symbols,1);
  assert.deepEqual(during.agents,[{name:'Claude',label:'editing',color:'#ffd27a',working:true,ago:null}]);
  assert.equal(during.check.state,'validated');assert(Math.abs(during.check.ago-10050)<300,'the newest verdict (cue times sit on the beat grid)');
  const after=hoverFacts({model,agents},'m1',at(T0+62000));
  assert.deepEqual(after.agents.map(a=>[a.label,a.working,a.ago]),[['editing',false,12000]],'an edit\'s tool lasts a moment: the card says how long ago');
  const before=hoverFacts({model,agents},'m1',at(T0+20000));assert.equal(before.check.state,'stressed');assert.equal(before.agents.length,0);
  const group=hoverFacts({model,agents},'org:g1',at(T0+62000));
  assert.equal(group.kind,'subsystem');assert.equal(group.modules,2);assert.deepEqual(group.states,{validated:2});assert.equal(group.agents.length,1);
  assert.deepEqual(hoverFacts({model,agents},'nothing',at(T0+62000)),{});
});
test('The card says it in the Control Center\'s words, with catalog and generated names only',async()=>{
  const {cardLines,since}=await ui();
  assert.equal(cardLines(null),null);assert.equal(cardLines({text:'',sub:''}),null);
  const L=cardLines({text:'A branch · validated',sub:'3 twigs · 1 strand · Vauos',kind:'module',agents:[{name:'Claude',label:'editing',color:'#ffd27a',working:true},{name:'Cursor',label:'reading',working:false,ago:42000}],
    check:{state:'stressed',ago:65000},edit:{by:'agent',ago:3000}});
  assert.equal(L.title,'A branch · validated');assert.equal(L.sub,'3 twigs · 1 strand · Vauos');
  assert.deepEqual(L.lines.map(l=>l.text),['Claude · editing now','Cursor · reading · 42 s ago','Tests failed 1 min ago','Edited by an agent just now']);
  assert.equal(L.lines[0].color,'#ffd27a');
  const G=cardLines({text:'Vauos · interface',sub:'12 modules',kind:'subsystem',modules:12,states:{validated:3,stressed:1,committed:8}});
  assert.equal(G.lines[0].text,'12 files · 3 validated · 1 failing');
  assert.equal(since(7200000),'2 h ago');
});
test('Privacy: the card is DOM in the interactive views only; the OBS view, films and recordings never contain it',()=>{
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  const main=read('public/ui/main.js'),boot=main.slice(main.indexOf('async function boot()'));
  assert(boot.indexOf('mountHover(')>boot.indexOf('if(P.overlay)')&&boot.indexOf('if(P.film)return')<boot.indexOf('mountHover('),'mounted only after the OBS view and films have left');
  assert.match(read('public/style.css'),/body\.overlay[^{]*\.world-hover\{display:none!important\}/);
  const hover=read('public/ui/hover.js');
  assert(!/projectName|\.name\b(?!\})|getContext|drawImage/.test(hover.replace(/a\.name/g,'')),'no project name, never drawn into a canvas');
  const app=read('public/app.js'),peek=app.slice(app.indexOf('async peek('),app.indexOf('async peek(')+200);
  assert.match(peek,/FILM\|\|overlay/,'the engine answers no hover in a film or the OBS view');
  const record=app.slice(app.indexOf('function composeFrame('),app.indexOf('function drawFit('));
  assert(!/worldHover|world-hover/.test(record),'the recording composes the canvases only');
});

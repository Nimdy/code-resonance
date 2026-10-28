'use strict';
// Agent touches (public/worlds/touch.js): what the flagship worlds draw the moment an agent edits, reads or searches a
// file. A pure function of the recorded presences and the frame's time, rate-limited per file, in view seconds.
const test=require('node:test'),assert=require('node:assert/strict');
const load=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000;
const state=(ts,agentId,detail,fileId=null,voice=0)=>({v:1,id:`a-${agentId}-${ts}`,type:'agent.state',ts,tier:0,magnitude:.2,evidence:'observed',
  subject:{agentId,voice,...(fileId?{fileId}:{})},detail:{provider:'claude-code',...detail}});
// An edit (or a read) as the reducer records it: the tool starts on the file, then the agent is back to its request.
const tool=(ts,agentId,activity,fileId,voice=0)=>[state(ts,agentId,{state:'tool',activity},fileId,voice),state(ts+120,agentId,{state:'processing',activity:null},fileId,voice)];
async function fold(intents){const {createAgents}=await load('agents');const a=createAgents();a.record(state(T0,'a1',{state:'processing'}));a.record(state(T0,'a2',{state:'processing'},null,3));
  for(const i of intents)a.record(i);return a;}
test('An edit is a touch of a few seconds on its file, starting at the agent\'s tool event; a read is gentler',async()=>{
  const {touchesAt,touchEnvelope,TOUCH_SECONDS}=await load('touch');
  const agents=await fold([...tool(T0+10000,'a1','editing','f1'),...tool(T0+20000,'a2','reading','f2',3),...tool(T0+30000,'a1','running',null)]);
  const at=t=>touchesAt(agents,agents.list(t),t,1);
  assert.deepEqual(at(T0+9990),[],'nothing before the event');
  const [x]=at(T0+10500);
  assert.equal(x.fileId,'f1');assert.equal(x.kind,'edit');assert.equal(x.k,1);assert.equal(x.at,T0+10000);assert.equal(x.voice,0);
  assert(Math.abs(x.age-.5)<1e-9);assert(x.env>.6&&x.env<1,'bright soon after it began');
  // Long after the tool finished (the presence is back to its request), the touch still plays out, then ends.
  assert.equal(agents.presence('a1',T0+12000).fileId,null);
  assert(at(T0+12000)[0].env>0&&at(T0+12000)[0].env<x.env,'fading');
  assert.deepEqual(at(T0+10000+TOUCH_SECONDS*1000),[],'gone after TOUCH_SECONDS');
  const [r]=at(T0+20400);assert.equal(r.kind,'read');assert.equal(r.voice,3);assert(r.k<.5);
  assert.deepEqual(at(T0+30200),[],'a tool without a file is no touch');
  assert.equal(touchEnvelope(-.1),0);assert.equal(touchEnvelope(0),0);assert(touchEnvelope(.2)>.8);assert.equal(touchEnvelope(TOUCH_SECONDS),0);
});
test('A file is touched again only after the cooldown; an edit after a read upgrades it; the newest touch wins',async()=>{
  const {touchesAt,TOUCH_COOLDOWN}=await load('touch');
  const agents=await fold([...tool(T0+1000,'a1','editing','f1'),...tool(T0+2000,'a1','editing','f1'),...tool(T0+1000+TOUCH_COOLDOWN*1000+100,'a1','editing','f1'),
    ...tool(T0+40000,'a2','reading','f3',3),...tool(T0+40300,'a1','editing','f3'),...tool(T0+50000,'a2','reading','f4',3),...tool(T0+51500,'a1','editing','f4')]);
  const at=t=>touchesAt(agents,agents.list(t),t,1);
  assert.equal(at(T0+2500)[0].at,T0+1000,'the second edit 1 s later is inside the cooldown');
  assert.equal(at(T0+1000+TOUCH_COOLDOWN*1000+300)[0].at,T0+1000+TOUCH_COOLDOWN*1000+100,'after the cooldown a new touch begins');
  assert.equal(at(T0+1000+TOUCH_COOLDOWN*1000+300).length,1,'one touch per file');
  const up=at(T0+40500)[0];assert.equal(up.kind,'edit');assert.equal(up.at,T0+40000,'an edit right after a read keeps the read\'s start');assert.equal(up.agentId,'a1');
  const later=at(T0+51700)[0];assert.equal(later.kind,'edit');assert.equal(later.at,T0+51500,'an edit well after a read is a touch of its own');
});
test('Touches are a pure function of the presences and the time: in view seconds, whatever the frames or their order',async()=>{
  const {touchesAt,TOUCH_SECONDS}=await load('touch');
  const intents=[...tool(T0+1000,'a1','editing','f1'),...tool(T0+1500,'a2','editing','f2',3),...tool(T0+2000,'a1','searching','f5'),...tool(T0+2400,'a2','editing','f6',3),...tool(T0+2600,'a1','editing','f7')];
  const agents=await fold(intents),t=T0+3000;
  const a=touchesAt(agents,agents.list(t),t,1),b=touchesAt(agents,agents.list(t).reverse(),t,1);
  assert.deepEqual(a,b,'the order of the presences does not matter');
  assert.deepEqual(a,touchesAt(await fold([...intents].reverse()),agents.list(t),t,1),'nor the order the intents were folded in');
  assert.equal(a.length,4,'at most four');assert(a.every((x,k)=>!k||a[k-1].env*a[k-1].k>=x.env*x.k),'the most visible first');
  assert.deepEqual(touchesAt(agents,agents.list(t),t,1,{known:id=>id!=='f7'}).map(x=>x.fileId).includes('f7'),false,'only files the world draws');
  // An 8x replay: the same touch lasts as long on screen, and its cooldown spans eight times the recorded time.
  const fast=await fold([...tool(T0+1000,'a1','editing','f1'),...tool(T0+10000,'a1','editing','f1')]);
  assert.equal(touchesAt(fast,fast.list(T0+1000+TOUCH_SECONDS*4000),T0+1000+TOUCH_SECONDS*4000,8).length,1,'still playing at half its view length');
  assert.equal(touchesAt(fast,fast.list(T0+10500),T0+10500,8)[0].at,T0+1000,'9 s of recording is about 1 s of view: inside the cooldown');
  assert.equal(touchesAt(fast,fast.list(T0+10500),T0+10500,1)[0].at,T0+10000);
});
test('A touch draws with its presences\' prominence and stays (quietly) without spectacle',async()=>{
  const {touchGain,touchRing,touchTravel}=await load('touch');
  assert.equal(touchGain({agentProminence:.8},{intensity:1}),1);
  assert.equal(touchGain({agentProminence:0},{intensity:1}),0);
  assert(touchGain({agentProminence:.8},{intensity:0})>0&&touchGain({agentProminence:.8},{intensity:0})<.5);
  assert(touchGain({agentProminence:1},{intensity:2})<=1.25*1.2);
  assert.equal(touchRing(.2),null);assert(touchRing(.35).r<touchRing(1).r);assert.equal(touchRing(1.7),null);
  assert.equal(touchTravel(0),0);assert.equal(touchTravel(.9),1);
});
test('A presence visits the files it touched: a weight that rises, holds and falls, never jumping, even across re-edits',async()=>{
  const {touchVisits,visitBlend,touchHold}=await load('touch');
  const agents=await fold([...tool(T0+1000,'a1','editing','f1'),...tool(T0+3500,'a1','editing','f1'),...tool(T0+4500,'a1','reading','f2'),...tool(T0+5000,'a1','running',null)]);
  const place={f1:{x:10,y:0,z:0},f2:{x:0,y:0,z:10}},goal={x:0,y:5,z:0};
  let prev=null,maxStep=0,peak=0;
  for(let t=T0;t<=T0+9000;t+=10){const v=touchVisits(agents,'a1',t,1),p=visitBlend(goal,v,id=>place[id],{x:0,y:0,z:0});
    for(const x of v)peak=Math.max(peak,x.w);
    if(prev)maxStep=Math.max(maxStep,Math.hypot(p.x-prev.x,p.y-prev.y,p.z-prev.z));prev=p;}
  // The files are 10 units from the goal: a jump would move most of that in one step; a flight over half a second, at most ~0.45.
  assert(maxStep<.6,`the place moves smoothly (largest step in 10 ms: ${maxStep.toFixed(3)})`);
  assert(peak>.99,'it reaches the file');
  assert.deepEqual(touchVisits(agents,'a1',T0+900,1),[],'not before');
  assert.equal(touchVisits(agents,'a1',T0+8000,1).length,0,'back to its own goal after a few seconds');
  assert.equal(touchVisits(agents,'a1',T0+4000,1,id=>id!=='f1').length,0,'only files the world draws');
  assert.deepEqual(visitBlend(goal,[],()=>null,{x:0,y:0,z:0}),goal);
  assert.equal(touchHold(-1),0);assert.equal(touchHold(1),1);assert.equal(touchHold(3.2),0);
});

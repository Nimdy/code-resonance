'use strict';
// Overnight-scale highlight pick: a million intents across eight hours must finish well inside the file timeout, and
// the frozen CLUSTER pin must stay identical after inWindow became a binary search and the scan a sweep.
const test=require('node:test'),assert=require('node:assert/strict');
const highlight=require('../engine/highlight');
const reference=require('./highlight-reference');
const T0=1700000000000;
const I=(type,dt,extra={})=>({v:1,id:`i:${type}:${dt}`,type,ts:T0+dt,tier:2,magnitude:.5,evidence:'observed',subject:{},detail:{},...extra,type,ts:T0+dt});
const CLUSTER=[
  I('agent.state',200000,{tier:0,detail:{provider:'claude-code'}}),
  I('agent.state',210000,{tier:0,detail:{provider:'cursor'}}),
  I('agent.state',215000,{tier:0,detail:{provider:'demo (fictional)'}}),
  I('structure.created',220000,{tier:2,subject:{fileId:'src/secret/path.ts'},detail:{path:'/home/acme/secret-client'}}),
  I('validation.failed',230000,{detail:{category:'test'}}),
  I('validation.recovered',250000,{detail:{category:'test'}}),
  I('agent.collision',260000,{detail:{providers:['claude-code','cursor']}}),
  I('repository.checkpoint',270000,{})
];
const PINNED={from:T0+144000,to:T0+504000,speed:4,viewMs:90000,score:109};
test('inWindow on sorted intents matches a linear filter',()=>{
  const all=CLUSTER.slice().sort((a,b)=>a.ts-b.ts||String(a.id).localeCompare(String(b.id)));
  const from=T0+210000,to=T0+250000;
  assert.deepEqual(highlight.inWindow(all,from,to).map(i=>i.id),all.filter(i=>i.ts>=from&&i.ts<=to).map(i=>i.id));
  assert.deepEqual(highlight.inWindow(all,T0,T0).map(i=>i.id),all.filter(i=>i.ts>=T0&&i.ts<=T0).map(i=>i.id));
  assert.deepEqual(highlight.inWindow(all,T0+10e12,T0+11e12),[]);
});
test('CLUSTER pin is unchanged; a million overnight intents pick in time',()=>{
  const pinned=highlight.pick(CLUSTER,T0,T0+1_200_000);
  assert.deepEqual({from:pinned.from,to:pinned.to,speed:pinned.speed,viewMs:pinned.viewMs,score:pinned.score},PINNED);
  const N=1_000_000,span=8*3600*1000;
  const intents=new Array(N);
  for(let i=0;i<N;i++)intents[i]={v:1,id:`s:${i}`,type:'agent.state',ts:T0+Math.floor(i*span/N),tier:0,magnitude:.1,evidence:'observed',subject:{},detail:{provider:i%2?'cursor':'claude-code'}};
  intents.push(
    I('validation.failed',3_600_000,{detail:{category:'test'}}),
    I('validation.recovered',3_620_000,{detail:{category:'test'}}),
    I('agent.collision',3_630_000,{detail:{providers:['claude-code','cursor']}})
  );
  const t0=process.hrtime.bigint();
  const night=highlight.pick(intents,T0,T0+span);
  const ms=Number(process.hrtime.bigint()-t0)/1e6;
  assert(ms<8000,`overnight pick ${ms.toFixed(0)} ms`);
  assert(night&&night.score>0&&night.to>night.from,JSON.stringify(night&&{score:night.score,from:night.from,to:night.to}));
  assert(night.reasons.includes('validation.failed+recovered'));
  assert.deepEqual(night,reference.pick(intents,T0,T0+span),'the 0.7.1 exhaustive picker chooses the same window');
  assert.deepEqual(pinned,reference.pick(CLUSTER,T0,T0+1_200_000));
});
// The 0.7.1 picker scored every candidate by scanning its window; a failure recovered more than one 16x view later made
// every intent of the red period a candidate (quadratic: seconds at 50k intents, about half a minute at a million). The
// sweep scores the same candidates in one pass per kind and must choose exactly what the exhaustive scan chose.
function lcg(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function randomNight(rnd,t){
  const of=a=>a[Math.floor(rnd()*a.length)];
  const TYPES=['agent.state','agent.state','agent.state','validation.failed','validation.failed','validation.recovered','validation.recovered','milestone.achieved',
    'refactor.validated','subsystem.connected','structure.created','structure.created','agent.collision','repository.checkpoint','module.created'];
  const PROVIDERS=['claude-code','cursor','codex','grok','external-agent','demo (fictional)','unspecified','',null,'constructor'];
  const rec=of([45_000,200_000,1_200_000,3*3600_000,8*3600_000]),n=1+Math.floor(rnd()*of([10,60,250])),grid=of([1,1000,30000]);
  const intents=[];
  for(let k=0;k<n;k++){
    const type=of(TYPES),detail={};
    if(type==='agent.state')detail.provider=of(PROVIDERS);
    if(type==='agent.collision'&&rnd()<.9)detail.providers=[of(PROVIDERS),of(PROVIDERS)];
    if(type.startsWith('validation.'))detail.category=of(['test','build',undefined,'lint']);
    if(type==='subsystem.connected')detail.first=rnd()<.5;
    intents.push({id:`r${t}:${k}:${type}`,type,ts:T0+Math.round((rnd()*1.2-.1)*rec/grid)*grid,tier:Math.floor(rnd()*5),detail});
  }
  if(rnd()<.3&&rec>=3*3600_000){const f=T0+Math.floor(rnd()*rec*.3);
    intents.push({id:`rf${t}`,type:'validation.failed',ts:f,tier:2,detail:{category:'test'}},{id:`rr${t}`,type:'validation.recovered',ts:f+Math.floor(rec*.6),tier:3,detail:{category:'test'}});}
  return {intents,rec};
}
test('The sweep picks exactly what the 0.7.1 exhaustive scan picks (seeded random nights)',()=>{
  const rnd=lcg(20261028);let picked=0;
  for(let t=0;t<600;t++){
    const {intents,rec}=randomNight(rnd,t);
    const a=highlight.pick(intents,T0,T0+rec);
    assert.deepEqual(a,reference.pick(intents,T0,T0+rec),`night ${t}`);
    if(a)picked++;
  }
  assert(picked>100,`${picked} nights scored`);
});
// A night that stays red for six hours: 200 failing runs from 1 h, the recovery at 7 h, a tier-2 structure every 25
// intents (40,000 anchors) among a million agent intents.
function redNight(N){
  const span=8*3600*1000,intents=new Array(N);
  for(let i=0;i<N;i++){const ts=T0+Math.floor(i*span/N);
    intents[i]=i%25===0?{v:1,id:`a:${i}`,type:'structure.created',ts,tier:2,detail:{}}:{v:1,id:`s:${i}`,type:'agent.state',ts,tier:0,detail:{provider:i%2?'cursor':'claude-code'}};}
  for(let k=0;k<200;k++)intents.push(I('validation.failed',3_600_000+k*60_000,{detail:{category:'test'}}));
  intents.push(I('validation.recovered',7*3_600_000,{tier:3,detail:{category:'test'}}));
  return {intents,span};
}
test('A six-hour red period with many anchors picks a million intents in time, as the exhaustive scan would',()=>{
  const small=redNight(4000);
  assert.deepEqual(highlight.pick(small.intents,T0,T0+small.span),reference.pick(small.intents,T0,T0+small.span));
  const {intents,span}=redNight(1_000_000);
  const t0=process.hrtime.bigint();
  const night=highlight.pick(intents,T0,T0+span);
  const ms=Number(process.hrtime.bigint()-t0)/1e6;
  assert(ms<8000,`red-night pick ${ms.toFixed(0)} ms`);
  assert(night&&night.score>0,JSON.stringify(night));
  assert.deepEqual(night.reasons,['providers>=2','structure.created']);
});

'use strict';
// Overnight-scale highlight pick: a million intents across eight hours must finish well inside the file timeout, and
// the frozen CLUSTER pin must stay identical after inWindow became a binary search.
const test=require('node:test'),assert=require('node:assert/strict');
const highlight=require('../engine/highlight');
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
});

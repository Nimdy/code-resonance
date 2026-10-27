'use strict';
// The shared fixture of the digital-life driver tests (tests/life-driver*.test.js): a recorded performance, a test
// grammar and a player that delivers the recording as playback reaches it. Not a test file itself.
const load=()=>Promise.all([import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
const score=require('../public/score.js');
const T0=1750000000000,WIN=10000;
const group=(id,q,r)=>({id,type:'group',order:+id.slice(1),q,r,angle:q,counts:{function:3}});
const mod=(id,g,q,r)=>({id,type:'module',group:g,dir:'d',q,r,state:'draft',counts:{function:2}});
// A recorded performance: windows of 10 s, a subsystem founded every 8 windows, modules in between, frames with
// energy and tension, and intents (edits, a failure, a recovery, a verified milestone, a connection). Sessions with
// gaps between them: `gapMs` of silence after every `gapEvery` windows.
function recording(windows=60,{quietAfter=Infinity,gapEvery=0,gapMs=0}={}){
  const entries=[];let nodes=[group('g0',0,0),mod('m0','g0',0,0)];
  for(let k=0;k<windows;k++){
    const start=T0+k*WIN+(gapEvery?Math.floor(k/gapEvery)*gapMs:0),end=start+WIN,add=[];
    if(k&&k%8===0&&k<quietAfter){const g=`g${k/8}`;add.push(group(g,(k/8)%3*2-2,Math.floor(k/16)*2-1),mod(`m${k}`,g,0,0));}
    else if(k%3===1&&k<quietAfter)add.push(mod(`m${k}`,'g0',k%4,1));
    nodes=nodes.concat(add);
    const graph=k%6===0?{keyframe:true,nodes:nodes.slice(),edges:[]}:{add,remove:[],addEdges:[],removeEdges:[]};
    const quiet=k>=quietAfter,intents=[];
    const I=(type,dt,extra={})=>intents.push({v:1,id:`w${k}:${type}:${dt}`,type,ts:start+dt,tier:1,magnitude:.5,evidence:'observed',subject:{groupId:'g0'},detail:{},...extra});
    if(!quiet){I('structure.modified',1200);I('structure.modified',6100,{subject:{fileId:'m0'}});
      if(k===12)I('validation.failed',3000,{tier:2,evidence:'verified',subject:{fileIds:['m0']}});
      if(k===18)I('validation.recovered',4000,{tier:3,evidence:'verified',subject:{fileIds:['m0']}});
      if(k===24)I('milestone.achieved',5000,{tier:3,magnitude:.9,evidence:'verified',subject:{groupId:'g1'}});
      if(k===30)I('subsystem.connected',2000,{tier:2,evidence:'derived',subject:{groupId:'g1',targetGroupId:'g2'}});
      if(k%8===0&&k)I('subsystem.created',500,{tier:2,evidence:'derived',subject:{groupId:`g${k/8}`}});}
    entries.push({seq:k,start,end,frame:{start,end,chapter:1,controls:{energy:quiet?0:.3+.4*((k%7)/7),tension:k>=12&&k<18?.5:.1}},graph,intents});
  }
  return entries;
}
const grammar={id:'test',version:1,
  ecosystem:()=>({capacity:300,trail:6,bounds:{min:[-20,0,-20],max:[20,8,20]},field:{nx:32,nz:32},
    species:[{name:'a',share:.6,crowd:8,radius:1.4},{name:'b',share:.4,flow:1.2,settle:.01,orbit:0,radius:.9}],
    hooks:{current(x,y,z,t,c,out){out[0]=.4*Math.cos(t*.05+z*.1+c.swing);out[2]=.4*Math.sin(t*.05+x*.1);}}}),
  habitat:(model,t)=>[...model.districts.values()].filter(d=>model.districtBorn(d)<=t).map(d=>({id:d.id,x:d.q*4,y:3,z:d.r*4,r:1+.2*d.members.length,w:1}))};
// A player: delivers the recorded windows as playback reaches them (or all at once, as a replay primes) and renders.
async function player({entries,prime=true,speed=1,params={},live=false,film=false,opts={}}){
  const [{createLifeDriver},{createLifeTimeline}]=await load();
  const timeline=createLifeTimeline();
  let cfg={speed,tempo:96,epoch:T0,params,live,film};
  const driver=createLifeDriver({grammar,timeline,seed:1234,config:()=>cfg,score,...opts});
  if(prime)timeline.prime(entries);
  let next=0;
  const deliver=t=>{while(next<entries.length&&entries[next].start<=t){const e=entries[next++];timeline.structure(e.graph,e.start,e.end,e.seq);timeline.frame(e.frame,e.start);for(const i of e.intents)timeline.intent(i);}};
  const viewAt=t=>(t-T0)/1000/cfg.speed;
  return {driver,timeline,set:x=>{cfg={...cfg,...x};},
    // Render frames from t0 to t1 (performance ms) at `fps` frames per view second; returns the last view.
    play(t0,t1,fps=60,budgetMs=1e9){const step=1000*cfg.speed/fps;for(let k=0,t=t0;t<t1;t=t0+(++k)*step){deliver(t);driver.update({tview:viewAt(t)},{budgetMs});}deliver(t1);return driver.update({tview:viewAt(t1)},{budgetMs});},
    at(t,budgetMs=1e9){deliver(t);return driver.update({tview:viewAt(t)},{budgetMs});},
    seek(t){next=entries.findIndex(e=>e.start+WIN>t);if(next<0)next=entries.length;}};
}
module.exports={load,score,T0,WIN,group,mod,recording,grammar,player};

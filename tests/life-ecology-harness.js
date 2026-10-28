'use strict';
// Shared fixtures for the ecology 2 suite. Node's --test-timeout applies to a whole file, so Biosphere, Stellar and
// Cathedral each live in their own test file (local ~16 s / ~10 s / ~7 s; CI 2-core has been ~2.8× slower).
const score=require('../public/score.js');
const {T0}=require('./life-driver-fixture.js');
const load=()=>Promise.all([import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js'),import('../public/worlds/life/biosphere.js'),
  import('../public/worlds/life/stellar.js'),import('../public/worlds/life/cathedral.js'),import('../public/worlds/musical.js')]);
const MUSIC={version:3,style:'ambient',seed:9001,profile:null},WIN=10000;
// A replay (a film: exact states) of one structure and a performance arc: activity rising and falling, a stretch of
// trouble (tension) in the middle. sample(eco, s, driver) is called after every second of view time from `from` on.
async function perform({grammar,graph,ecology=2,music=1,style=MUSIC.style,secs,from=20,every=1,sample}){
  const [{createLifeDriver},{createLifeTimeline}]=await load();
  const tl=createLifeTimeline();tl.structure({keyframe:true,...graph},T0,T0+WIN,0);
  for(let k=0;k<Math.ceil(secs/10)+2;k++){const s=T0+k*WIN;tl.frame({end:s+WIN,chapter:6,controls:{energy:.25+.5*(.5+.5*Math.sin(k*.45)),tension:k>=9&&k<13?.5:.08}},s);}
  const cfg={speed:1,tempo:96,epoch:T0,params:{enabled:true,ecology,music},live:false,film:true,music:{...MUSIC,style}};
  const d=createLifeDriver({grammar,timeline:tl,seed:77,config:()=>cfg,score,background:false});
  for(let k=1;k<=secs/every;k++){const s=k*every;d.update({tview:s},{budgetMs:Infinity});if(s>=from)sample(d.ecosystem,s,d);}
  return d;
}
const sd=a=>{const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);};
module.exports={load,perform,sd,MUSIC,WIN};

'use strict';
// A synthetic corpus of public projections (the shape engine/recipe.js traitsOf reads), for tests of the automatic
// family choice: kinds of real software (a UI app, a service, a typed library, an algorithmic core, a monorepo, a game
// or simulation, a data pipeline, a command-line tool, a full-stack app, an agent-built prototype), each drawn with
// seeded variation of its size, subsystems, symbol mix, tests, dependencies and coupling.
//
// Each project is what the generator sees when an identity is founded. A repository opened with Code Resonance for the
// first time is indexed whole by its first scan (its structure is there, not grown: stats.created stays near 0); a
// project started under observation is founded small, when it reaches its sixth file, with nearly everything grown while
// it was observed. How much of the work agents did is drawn separately (most projects none, some a little, some most).
// Deterministic: the same index always gives the same project. Synthetic data, labelled as such wherever it is reported.
const {sha}=require('../receiver/protocol');
function rng(seed){let s=(parseInt(sha(`synthetic/${seed}`).slice(0,8),16)>>>0)||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const KINDS={
  'ui-app':{weight:3,modules:[25,500],districts:[3,10],ui:[.35,.75],routes:[0,.01],model:[.03,.15],tests:[.02,.18],dirs:[.15,.45],langs:['tsx','jsx','ts'],deps:[1.5,4],cross:[.15,.45],hub:[.02,.2],symbols:[3,8]},
  'service':{weight:2,modules:[12,160],districts:[3,8],ui:[0,.02],routes:[.08,.3],model:[.05,.2],tests:[.08,.3],dirs:[.08,.3],langs:['ts','js','py','go'],deps:[1.2,3],cross:[.15,.45],hub:[.1,.35],symbols:[3,7]},
  'typed-library':{weight:2,modules:[15,250],districts:[2,7],ui:[0,0],routes:[0,0],model:[.3,.6],tests:[.2,.45],dirs:[.08,.3],langs:['ts','rs','go'],deps:[1,3],cross:[.25,.6],hub:[.05,.25],symbols:[4,12]},
  'algorithmic-core':{weight:1.5,modules:[8,120],districts:[1,4],ui:[0,0],routes:[0,0],model:[.02,.15],tests:[.05,.25],dirs:[.05,.2],langs:['rs','py','go','ts'],deps:[1,3.5],cross:[.05,.35],hub:[.05,.25],symbols:[6,18],functions:[.6,.9]},
  'monorepo':{weight:1.5,modules:[300,2000],districts:[8,16],ui:[.1,.4],routes:[0,.08],model:[.1,.3],tests:[.1,.3],dirs:[.1,.35],langs:['ts','tsx','js'],deps:[2,5],cross:[.35,.7],hub:[.01,.1],symbols:[4,9]},
  'game-or-simulation':{weight:1,modules:[30,300],districts:[4,10],ui:[0,.05],routes:[0,0],model:[.3,.55],tests:[0,.1],dirs:[.1,.3],langs:['ts','rs','go'],deps:[2,4],cross:[.35,.7],hub:[.05,.25],symbols:[6,14]},
  'data-pipeline':{weight:1,modules:[10,120],districts:[2,6],ui:[0,0],routes:[0,.03],model:[.02,.12],tests:[.05,.2],dirs:[.08,.3],langs:['py'],deps:[.8,2.5],cross:[.1,.4],hub:[.05,.3],symbols:[4,10],functions:[.6,.85]},
  'command-line':{weight:1,modules:[6,40],districts:[1,4],ui:[0,0],routes:[0,0],model:[.02,.15],tests:[0,.15],dirs:[.1,.4],langs:['js','ts','py','go','rs'],deps:[.3,1.5],cross:[0,.3],hub:[.1,.4],symbols:[2,6],functions:[.6,.9]},
  'full-stack':{weight:2,modules:[40,400],districts:[4,10],ui:[.15,.4],routes:[.03,.12],model:[.1,.25],tests:[.05,.25],dirs:[.12,.4],langs:['tsx','ts','js'],deps:[1.5,4],cross:[.25,.55],hub:[.05,.3],symbols:[3,8]},
  'agent-prototype':{weight:1.5,modules:[6,14],districts:[2,6],ui:[0,.5],routes:[0,.15],model:[0,.2],tests:[0,.2],dirs:[.2,.6],langs:['ts','tsx','js','py'],deps:[.4,1.5],cross:[.1,.5],hub:[.05,.4],symbols:[1,4],born:1,agents:'heavy'}
};
const NAMES=Object.keys(KINDS),TOTAL=NAMES.reduce((a,k)=>a+KINDS[k].weight,0);
const between=(r,[a,b])=>a+(b-a)*r();
// The i-th project of the corpus: {kind, born, agents, project}.
function syntheticProject(i){
  const r=rng(i);
  let x=r()*TOTAL,kind=NAMES[0];for(const k of NAMES){if((x-=KINDS[k].weight)<0){kind=k;break;}}
  const K=KINDS[kind];
  // Started under observation (founded small, grown) or opened with its history already written (indexed whole).
  const born=K.born??(r()<.3?1:0);
  const agents=K.agents||(r()<.5?'none':r()<.6?'light':'heavy');
  let modules=Math.round(Math.exp(between(r,K.modules.map(Math.log))));
  let districts=Math.max(1,Math.round(between(r,K.districts)));
  if(born){modules=Math.max(6,Math.min(modules,6+Math.floor(r()*7)));districts=Math.max(1,Math.min(districts,1+Math.floor(r()*Math.min(5,modules/2))));}
  const groups=Array.from({length:districts},(_,k)=>({id:`g${k}`,type:'group'}));
  const ui=between(r,K.ui),routes=between(r,K.routes),model=between(r,K.model),tests=between(r,K.tests);
  const fnShare=K.functions?between(r,K.functions):.35+.3*r();
  const perFile=between(r,K.symbols)*(born?.6:1);
  const dirs=Math.max(1,Math.round(modules*between(r,K.dirs)));
  const nodes=[...groups],edges=[];
  for(let m=0;m<modules;m++){
    const n=Math.max(0,Math.round(perFile*(.4+1.2*r())));const counts={};
    const add=(k,v)=>{if(v>0)counts[k]=(counts[k]||0)+v;};
    const isUi=r()<ui,isRoute=r()<routes*3,isModel=r()<model*1.6;
    if(isUi)add('ui.component',Math.max(1,Math.round(n*.4)));
    if(isRoute)add('api.route',Math.max(1,Math.round(n*.3)));
    if(isModel){add('class',Math.max(1,Math.round(n*.25)));add('interface',Math.round(n*.15));add('type',Math.round(n*.1));}
    add(r()<.5?'function':'method',Math.round(n*fnShare));add('variable',Math.round(n*(1-fnShare)*.6));
    const lang=K.langs[Math.floor(r()*K.langs.length)];
    nodes.push({id:`m${m}`,type:'module',group:`g${Math.floor(r()*districts)}`,dir:`d${Math.floor(r()*dirs)}`,lang:isUi&&!/x$/.test(lang)?'tsx':lang,test:r()<tests,counts});
  }
  // Dependencies: a share into the project's hub (its first file), the rest inside the importing file's subsystem or,
  // for a share of them, across to another.
  const deps=Math.round(modules*between(r,K.deps)*(born?.6:1)),hubShare=between(r,K.hub),crossShare=between(r,K.cross);
  const files=nodes.slice(groups.length),inGroup=new Map();for(const f of files){if(!inGroup.has(f.group))inGroup.set(f.group,[]);inGroup.get(f.group).push(f);}
  for(let k=0;k<deps&&modules>1;k++){
    const a=files[Math.floor(r()*modules)];let b;
    if(r()<hubShare)b=files[0];
    else if(districts>1&&r()<crossShare){for(let k=0;k<8&&(!b||b.group===a.group);k++)b=files[Math.floor(r()*modules)];}
    else{const same=inGroup.get(a.group);b=same[Math.floor(r()*same.length)];}
    if(b.id===a.id)continue;
    edges.push({a:a.id,b:b.id,kind:'depends',cross:a.group!==b.group});
  }
  const symbols=nodes.reduce((s,n)=>s+Object.values(n.counts||{}).reduce((x,y)=>x+y,0),0);
  const raw=Math.max(10,Math.round(born?symbols*3:modules+5));
  const share=agents==='none'?0:agents==='light'?.05+.25*r():.4+.5*r();
  const stats={raw,agentEvents:Math.round(raw*share),created:born?Math.round(symbols*(.85+.3*r())):Math.round(symbols*.08*r()),testsPassed:0,testsFailed:0};
  const project={projectId:sha(`synthetic-project-${i}`),graph:{nodes,edges},stats,agents:Array.from({length:agents==='none'?0:agents==='light'?1:1+Math.floor(r()*4)},(_,k)=>({id:`a${k}`}))};
  return {kind,born:!!born,agents,project};
}
module.exports={syntheticProject,KINDS};

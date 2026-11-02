'use strict';
// Genesis (preview): chosen only explicitly, so no existing identity changes; its Lawbook follows the project's traits
// and derives the physics; the growth law never moves an older chamber; the form (chambers, their foam, the walls between
// them, the cords) is a pure function of the model and the time; the score's own notes excite the chambers they name;
// the world runs headless, reads the same at a moment however it got there, keeps failure vermilion and gold for verified
// repairs only, keeps vitrified chambers across a seek, and never draws a path or an identifier.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const recipe=require('../engine/recipe');
const catalog=require('../engine/catalog');
const score=require('../public/score.js');
const {tempDir,startService}=require('./helpers');
const {sha}=require('../receiver/protocol');
const load=name=>import(`../public/worlds/${name}.js`);
const T0=1750000000000;
const ID='genesis';
const h=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16);
function project(id,{modules=10,fns=3,classes=0,tests=0,dirs=3,cross=0,deps=0,groups=3,created=null}={}){
  const nodes=Array.from({length:groups},(_,k)=>({id:`g${k+1}`,type:'group'})),edges=[];
  for(let i=0;i<modules;i++){const counts={function:fns};if(i<classes){counts.class=2;counts.interface=2;}
    nodes.push({id:`m${i}`,type:'module',group:`g${1+i%groups}`,dir:`d${i%dirs}`,lang:'ts',test:i>=modules-tests,counts});}
  for(let i=0;i<cross;i++)edges.push({a:`m${i%modules}`,b:`m${(i+1)%modules}`,kind:'depends',cross:true});
  for(let i=0;i<deps;i++)edges.push({a:`m${i%modules}`,b:`m${(i+groups)%modules}`,kind:'depends',cross:false});
  return {projectId:sha(id),graph:{nodes,edges},stats:{raw:100,agentEvents:0,testsPassed:0,testsFailed:0,created:created??modules},agents:[]};
}
test('Genesis is chosen only explicitly: never by the family scores, automatic or a plain regenerate',()=>{
  assert.deepEqual(recipe.PREVIEWS,['aurora',ID]);assert(!recipe.FAMILIES.includes(ID));
  const shapes=[{modules:120,dirs:40},{modules:12,cross:20},{modules:60,classes:40,tests:20,cross:50},{modules:3},{modules:400,cross:300}];
  for(let k=0;k<200;k++){const r=recipe.generate(project(`scored-${k}`,shapes[k%shapes.length]),{variant:k%4,now:0});assert(recipe.FAMILIES.includes(r.family),`${k}: ${r.family}`);}
  const p=project('chosen',{modules:30});
  const chosen=recipe.update(recipe.generate(p,{now:0}),{type:'family',family:ID},p,0);
  assert.equal(chosen.family,ID);assert.equal(chosen.familyName,'Genesis (preview)');assert.equal(chosen.familyKind,'builtin');assert.equal(chosen.source,'user');assert.equal(chosen.locked,true);
  assert.equal(chosen.genome.life,undefined,'no digital life yet (G4)');assert.equal(chosen.genome.technique.finish,'cinematic');assert.equal(chosen.genome.music.score,3);
  assert.equal(recipe.resolve(chosen,p,5).recipe,chosen);
  assert(recipe.FAMILIES.includes(recipe.update(chosen,{type:'automatic'},p,0).family));
  const again=recipe.update(chosen,{type:'regenerate',keepFamily:true},p,0);assert.equal(again.family,ID);assert.notDeepEqual(again.genome.laws,chosen.genome.laws);
  assert.deepEqual(recipe.generate(p,{family:ID,now:1}),recipe.generate(p,{family:ID,now:1}));
});
test('Adding the preview changes no existing identity (the fingerprints of tests/recipe.test.js and tests/generator-v5.test.js hold)',()=>{
  const EMPTY={projectId:'pal-test-1234567',graph:{nodes:[],edges:[]},stats:{}};
  recipe.generate(EMPTY,{family:ID,now:0});
  assert.equal(recipe.RECIPE_VERSION,5);
  assert.equal(h(recipe.FLAGSHIPS.map(f=>recipe.generate(EMPTY,{family:f,now:0}).genome)),'d27fb424f09b9362');
  assert.equal(h(recipe.GRADUATED.map(f=>recipe.generate(EMPTY,{family:f,now:0,version:4}).genome)),'c447ad761dabd75a');
  assert.equal(h(recipe.GRADUATED.map(f=>recipe.generate(EMPTY,{family:f,now:0,version:3}).genome)),'25d6c4e4a07ef49d');
  const q=project('scores',{modules:40,classes:30,tests:10});assert.deepEqual(recipe.generate(q,{now:0}).familyScores,recipe.familyScores(recipe.traitsOf(q),recipe.generate(q,{now:0}).projectSeed,0));
});
test('The catalogue covers every value the generator draws; a failure\'s colour stays away from the inner light',()=>{
  const cat=catalog.PREVIEWS[ID];assert(cat&&cat.preview);assert.equal(catalog.FAMILIES[ID],undefined,'not a base for declarative packs');
  const hue=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;
    const x=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return (x*60+360)%360;};
  const dh=(a,b)=>{const d=Math.abs(a-b)%360;return Math.min(d,360-d);};const kinds=new Set();
  for(let seed=1;seed<=200;seed++){
    const r=recipe.generate(project(`cat-${seed}`,{modules:seed*2,classes:seed%7,tests:seed%5,cross:seed%11,deps:seed%13,groups:1+seed%9}),{family:ID,seed:seed*7919,variant:seed%3,now:0});
    for(const [p,spec] of Object.entries(cat.parameters)){if(p.startsWith('technique.')&&p!=='technique.finish')continue;const v=catalog.get(r.genome,p);
      assert(v!==undefined,`${p} missing`);assert(catalog.accepts(spec,v),`${p}=${JSON.stringify(v)}`);}
    assert.deepEqual(Object.values(r.genome.effects),cat.effects);assert.deepEqual(r.genome.ambient.unlocks,cat.unlocks);
    const P=r.genome.palette;assert(dh(hue(P.warning),hue(P.accent))>=35,`seed ${seed}: ${P.warning} against ${P.accent}`);assert(hue(P.warning)>=340||hue(P.warning)<=10);
    kinds.add(r.genome.material.kind);}
  assert.deepEqual([...kinds].sort(),['celadon','onyx','porcelain','smoke'],'every material language occurs');
  const r=recipe.generate(project('tune'),{family:ID,now:0}),spec=recipe.tunable(r);
  assert.deepEqual(Object.keys(spec).sort(),Object.keys(cat.parameters).sort());assert(!Object.keys(spec).some(k=>k.startsWith('life.')));
  const tuned=recipe.update(r,{type:'tune',values:{'laws.coupling':.9,'material.kind':'onyx'}},project('tune'),0);
  assert.deepEqual([tuned.genome.laws.coupling,tuned.genome.material.kind],[.9,'onyx']);
  assert.throws(()=>recipe.update(r,{type:'tune',values:{'laws.cohesion':1.5}},project('tune'),0),/cohesion/);
});
test('The Lawbook follows the project: coupling with cross-subsystem wiring, conductivity with imports, anisotropy with branching',async()=>{
  const mean=(f,shape)=>{let s=0;for(let k=0;k<120;k++)s+=f(recipe.generate(project(`l-${JSON.stringify(shape)}-${k}`,shape),{family:ID,now:0}).genome.laws);return s/120;};
  assert(mean(l=>l.coupling,{modules:40,cross:60})>mean(l=>l.coupling,{modules:40})+.3);
  assert(mean(l=>l.conductivity,{modules:30,deps:90})>mean(l=>l.conductivity,{modules:30})+.2);
  assert(mean(l=>l.anisotropy,{modules:30,dirs:30})>mean(l=>l.anisotropy,{modules:30,dirs:1})+.2);
  assert(mean(l=>l.cohesion,{modules:30,tests:10,dirs:1})>mean(l=>l.cohesion,{modules:30,dirs:30})+.2);
  const L=await load('genesis-laws');
  const rec=recipe.generate(project('book',{modules:20,groups:6}),{family:ID,now:0}),a=L.lawbook(rec),b=L.lawbook(rec);
  assert.deepEqual(a,b,'pure');for(const k of L.LAWS)assert(a.laws[k]>=0&&a.laws[k]<=1,k);
  // the physics moves with the laws
  const at=(k,v)=>L.lawbook({...rec,genome:{...rec.genome,laws:{...rec.genome.laws,[k]:v}}});
  assert(at('elasticity',1).ring.freq>at('elasticity',0).ring.freq);assert(at('viscosity',1).ring.bass<at('viscosity',0).ring.bass);
  assert(at('coupling',1).coupling.leak>at('coupling',0).coupling.leak);assert(at('conductivity',1).pores.size>at('conductivity',0).pores.size);
  assert(at('morphogenesis',1).expansion>at('morphogenesis',0).expansion);assert(at('cohesion',1).perWhorl<at('cohesion',0).perWhorl);
  assert(at('anisotropy',1).flatten>at('anisotropy',0).flatten,'a flat coil is a disc; a rising cone stays round');
  // the stretch to the world: symmetric, its inverse exact, the axis scaled by flatten and its normal plane kept
  const S=a.S,Si=a.Si;for(let r=0;r<3;r++)for(let c=0;c<3;c++){assert(Math.abs(S[r*3+c]-S[c*3+r])<1e-12);let x=0;for(let k=0;k<3;k++)x+=S[r*3+k]*Si[k*3+c];assert(Math.abs(x-(r===c?1:0))<1e-9);}
  const ax=L.axisOf(a),w=L.toWorld(a,ax);for(let i=0;i<3;i++)assert(Math.abs(w[i]-ax[i]*a.flatten)<1e-9);
});
test('The growth law: a chamber\'s slot depends on its rank only, consecutive chambers always meet, the lattice never reshuffles',async()=>{
  const L=await load('genesis-laws');
  for(let s=1;s<=40;s++){const r=recipe.generate(project(`g-${s}`,{modules:s*5,groups:1+s%12,cross:s%9}),{family:ID,seed:s*104729,now:0}),b=L.lawbook(r);
    for(let k=1;k<b.nRef*2+4;k++){const A=L.slotOf(b,k-1),B=L.slotOf(b,k),d=Math.hypot(B.c[0]-A.c[0],B.c[1]-A.c[1],B.c[2]-A.c[2]);
      assert(d<L.SIZE_MIN*(A.rho+B.rho)*.995,`seed ${s}: chambers ${k-1} and ${k} meet at their smallest (${d.toFixed(2)})`);
      assert(B.R>=A.R,'each chamber at least as large as the one before');}
    assert.deepEqual(L.slotOf(b,3),L.slotOf(b,3));
    assert.equal(L.latticeOf(b,L.slotOf(b,2)),L.latticeOf(b,L.slotOf(b,2)));assert(L.latticeOf(b,L.slotOf(b,2))<=6000);}
  for(let j=0;j<40;j++){const u=L.seedOf(j),l=Math.hypot(...u);assert(j===0?l===0:l>=.29&&l<=.79,`seed ${j} at ${l}`);}
});
// ---- A model that grows: three subsystems at the start, a fourth later, files arriving, a failure and its repair --------
async function grown(){
  const {createModel}=await load('model');const m=createModel();
  const nodes=[{id:'ga',type:'group'},{id:'gb',type:'group'},{id:'gc',type:'group'}];
  for(let i=0;i<9;i++)nodes.push({id:`f${i}`,type:'module',group:['ga','gb','gc'][i%3],counts:{function:2+i%3}});
  for(let i=0;i<9;i++)nodes.push({id:`s${i}`,type:'function',parent:`f${i}`});
  m.reset({nodes,edges:[{a:'f0',b:'f1',kind:'depends',cross:true},{a:'f2',b:'f0',kind:'depends',cross:true},{a:'f4',b:'f5',kind:'depends',cross:true}]},T0);
  // a fourth subsystem at +20 s, two files at +30 s, a dependency into it
  m.applyDelta({add:[{id:'gd',type:'group'},{id:'f9',type:'module',group:'gd',counts:{function:3}}],remove:[],addEdges:[],removeEdges:[]},T0+20000,T0+21000);
  m.applyDelta({add:[{id:'f10',type:'module',group:'ga',counts:{function:4}},{id:'f11',type:'module',group:'gd',counts:{function:1}}],remove:[],addEdges:[{a:'f10',b:'f9',kind:'depends',cross:true}],removeEdges:[]},T0+30000,T0+31000);
  // a failing run over f0, f3 at +40 s, its repair at +55 s
  m.cue({type:'validation.test.failed',detail:{fileIds:['f0','f3']}},T0+40000);m.cue({type:'validation.test.passed',detail:{fileIds:['f0','f3']}},T0+55000);
  return m;
}
test('The form is a pure function of the model and the time; a new chamber never moves an older one',async()=>{
  const L=await load('genesis-laws'),F=await load('genesis-form'),{prepare}=await load('terrain-layout');
  const m=await grown(),rec=recipe.generate(project('form',{groups:4}),{family:ID,now:0}),book=L.lawbook(rec),P=prepare(m);
  const before=F.chambersAt(P,book,T0+15000),after=F.chambersAt(P,book,T0+29000),late=F.chambersAt(P,book,T0+60000);
  assert.deepEqual(before.map(c=>c.id),['ga','gb','gc']);assert.deepEqual(after.map(c=>c.id),['ga','gb','gc','gd'],'the new subsystem is the fourth chamber');
  for(let k=0;k<3;k++){assert.deepEqual(before[k].c,after[k].c,'older chambers stay where they are');assert.equal(before[k].r,after[k].r);}
  assert.deepEqual(F.chambersAt(P,book,T0+29000),after,'pure');
  const bud=F.chambersAt(P,book,T0+20000+1600)[3];assert(bud.bud>0&&bud.bud<1&&bud.r<after[3].r,'a budding chamber is smaller and still moving into its slot');
  assert(late[0].n>before[0].n,'a chamber grows with its files');assert.equal(late.at(-1).aperture.length,3);assert(!late[0].aperture,'only the newest carries the aperture');
  // the walls between chambers: each radical circle lies on both spheres
  for(const p of F.pairsOf(late)){const e=[0,1,0];const u=[p.normal[1]*e[2]-p.normal[2]*e[1],p.normal[2]*e[0]-p.normal[0]*e[2],p.normal[0]*e[1]-p.normal[1]*e[0]],ul=Math.hypot(...u);
    const q=p.center.map((x,i)=>x+u[i]/ul*p.radius);for(const c of [p.a,p.b])assert(Math.abs(Math.hypot(q[0]-c.c[0],q[1]-c.c[1],q[2]-c.c[2])-c.r)<1e-6);}
  // the foam: every film lies on the bisector of its two files and inside the chamber's cube; the same each time
  const ch=late[0],films=F.filmsOf(ch,[]);assert(films.length>0);assert.deepEqual(F.filmsOf(ch,[]),films);
  for(const f of films)for(const v of f.v){const A=ch.files[f.a].seed,B=ch.files[f.b].seed,da=Math.hypot(v[0]-A[0],v[1]-A[1],v[2]-A[2]),db=Math.hypot(v[0]-B[0],v[1]-B[1],v[2]-B[2]);
    assert(Math.abs(da-db)<1e-6*ch.r+1e-9,'on the bisector');for(let i=0;i<3;i++)assert(Math.abs(v[i]-ch.c[i])<=ch.r*1.02+1e-9);}
  // cords: one per coupled pair, carrying every live dependency between them
  const th=F.threadsAt(m,late,T0+60000,{center:F.extentOf(late).center}),cords=F.cordsOf(th,late);
  assert.equal(cords.reduce((s,c)=>s+c.count,0),th.length);assert.equal(new Set(cords.map(c=>c.key)).size,cords.length);
  assert(th.some(t=>t.a==='f10'&&t.b==='f9'),'the dependency into the new chamber');
});
test('The score\'s own notes excite the chambers they name; coupling leaks a ring into a neighbour; tension detunes',async()=>{
  const L=await load('genesis-laws'),R=await load('genesis-resonance');
  const rec=recipe.generate(project('res'),{family:ID,now:0}),book=L.lawbook({...rec,genome:{...rec.genome,laws:{...rec.genome.laws,coupling:1,viscosity:.3}}});
  const chambers=[0,1,2,3].map(k=>({id:`c${k}`,degree:L.degreeOf(k),r:30-k*3}));
  const key={tonic:2,scale:[0,2,4,5,7,9,11]},barMs=2400,note=(group,midi,v=.4)=>({group,instrument:group==='perc'?'kick':group,midi,velocity:v,duration:.5});
  const bars=new Map([[10,{steps:Array.from({length:16},(_,s)=>s===0?[note('bass',38)]:s===4?[note('melody',2+12*5+7)]:[])}]]);
  const bar=b=>bars.get(b)||null,t0=10*barMs;
  const quiet=R.resonanceAt(t0-10,{bar,key,barMs,book,chambers});assert.equal(Math.max(...quiet.mono),0,'nothing before the first note');
  const a=R.resonanceAt(t0+300,{bar,key,barMs,book,chambers});
  assert(a.mono[0]>0,'the bass (D, the tonic) breathes the tonic\'s chamber');assert.equal(a.mono[1],0);
  const b=R.resonanceAt(t0+4*150+300,{bar,key,barMs,book,chambers});const k=chambers.findIndex(c=>c.degree===L.degreeOfMidi(2+12*5+7,key));
  assert(b.mode[k]>0,'the melody\'s note rings the chamber of its degree');
  const coupled=R.resonanceAt(t0+1200,{bar,key,barMs,book,chambers,couple:(i,j)=>(i===2&&j===0)||(i===0&&j===2)?1:0});
  assert(coupled.mono[2]>0,'the ring leaks through the coupling into chamber 2');
  assert.deepEqual(R.resonanceAt(t0+1200,{bar,key,barMs,book,chambers}),R.resonanceAt(t0+1200,{bar,key,barMs,book,chambers}),'pure');
  assert(R.resonanceAt(t0+300,{bar,key,barMs,book,chambers,expression:{tension:.9}}).coherence<R.resonanceAt(t0+300,{bar,key,barMs,book,chambers,expression:{tension:0,release:.6}}).coherence);
});
test('The musical clock\'s bar is the bar the performer plays (score v3), none for the classic score',async()=>{
  const {createMusical}=await load('musical'),{createLifeTimeline}=await load('life/timeline');
  const tl=createLifeTimeline(),mu=createMusical({timeline:tl,score});
  assert.equal(mu.bar(4),null,'classic score: no notes');
  mu.configure({version:3,style:'ambient',seed:77,tempo:84});
  const B=240000/84,c=mu.conducted(12);
  assert.deepEqual(mu.bar(12),score.createBar({scoreVersion:3,seed:77,chapter:1,energy:c.energy,tension:c.tension,style:'ambient',barIndex:12,section:c.role,lift:c.lift,profile:null,tempo:84}));
  assert.equal(mu.bar(12),mu.bar(12),'cached');assert.deepEqual(mu.key().scale,score.createIdentity(77).scale);
  assert(mu.bar(12).steps.flat().length>0,'it has notes');assert(B>0);
});
// ---- The world headless (as the host drives it) --------------------------------------------------------------------------
async function headless(model,{rec=null,director=null,quality=0,musicBar=null,musicKey=null}={}){
  const {THREE}=await load('core'),{createFamily}=await load('genesis'),{createDirector}=await load('director'),{createAgents}=await load('agents');
  const r=rec||recipe.generate(project('headless',{groups:4}),{family:ID,now:0}),ag=createAgents(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,16/9,.1,4000);
  const d=director||createDirector({recipe:r});
  const w=createFamily({scene,camera,model,recipe:r,speed:()=>1,name:id=>`Name ${id}`,director:d,agents:ag,pipeline:{size:[640,360]},...(musicBar?{musicBar,musicKey,musicAt:()=>({tension:.2,bar:0,phase:0})}:{})});w.rebuild();
  const frame=t=>({t,tsec:(t-T0)/1000,tview:(t-T0)/1000,dt:1/30,beat:0,barPhase:0,mood:{tempo:92},energy:0,activity:0,phase:'idle',unlocks:[],agents:[],overrides:{},quality,music:musicBar?{tension:.2}:null});
  const data=()=>{let c=null;scene.traverse(o=>{const u=o.material?.uniforms;if(!c&&u?.uC)c=Float32Array.from(u.uC.value.image.data);});return c;};
  return {w,scene,camera,director:d,frame,data,at(t){const f=frame(t);w.update(f);w.cameraGoal(f);return f;}};
}
test('The world runs headless and reads the same at a moment whether played through or sought',async()=>{
  const m=await grown(),A=await headless(m),B=await headless(await grown());
  for(let t=T0;t<=T0+62000;t+=250)A.at(t);
  B.w.onPrime(T0+62000,62);B.at(T0+62000);
  assert.deepEqual(A.data(),B.data(),'the chambers\' state is the same');
  const sa=A.w.stats(),sb=B.w.stats();for(const k of ['chambers','files','films','threads','cords','spines','pairs','gold','stress'])assert.deepEqual(sa[k],sb[k],k);
  assert.equal(sa.chambers,4);assert(sa.films>0&&sa.spines>0&&sa.cords>0);
  const g=A.w.cameraGoal(A.frame(T0+62000));for(const v of [g.distance,g.azimuth,g.elevation,g.fov,g.target.x,g.target.y,g.target.z])assert(Number.isFinite(v));
  A.w.dispose();B.w.dispose();
});
test('Failure crazes in vermilion and is never gold; a verified repair leaves gold that a seek keeps; a milestone vitrifies its chambers',async()=>{
  const m=await grown(),W=await headless(m);
  W.at(T0+30000);assert.equal(W.w.stats().stress,0);
  W.at(T0+43000);let s=W.w.stats();assert(s.stress>.9,'the failing files are stressed');assert.equal(s.gold,0,'never gold during a failure');
  W.w.effect({effect:'decohere',intent:'validation.failed',tier:2,scale:1,at:T0+43000,subject:{fileIds:['f0','f3']}},W.frame(T0+43000));
  W.at(T0+60000);s=W.w.stats();assert.equal(s.stress,0);assert(s.gold>0,'the repair (stressed, then validated) is gold');
  W.w.onPrime(T0+61000,61);W.at(T0+61000);assert(W.w.stats().gold>0,'kept after a seek: it is the model\'s own history');
  // the milestone: through the director (its lasting record), then the world's command
  const cmd=W.director.process({type:'milestone.achieved',ts:T0+56000,tier:3,magnitude:.8,evidence:'verified',subject:{fileIds:['f0']},detail:{kinds:['recovery']}});
  W.w.effect(cmd,W.frame(T0+56000));W.at(T0+62000);assert.equal(W.w.stats().vitrified,1,'f0\'s chamber is crystal');
  W.w.onPrime(T0+63000,63);W.at(T0+63000);assert.equal(W.w.stats().vitrified,1,'and stays so after a seek (the director\'s record)');
  // the words: generic phrases, generated names, counts; never an identifier
  for(const intent of catalog.EFFECT_TYPES){const d=W.w.describe({intent,subject:{fileIds:['f0','f3'],fileId:'f0',groupId:'ga'},detail:{kinds:['recovery'],chapter:2,providers:[]}},W.frame(T0+63000));
    if(!d)continue;const words=`${d.text} ${d.sub||''} ${d.banner||''} ${d.bannerSub||''}`;assert(!/\bf\d+\b|\/|\\/.test(words),`${intent}: ${words}`);}
  for(const l of W.w.subsystemLabels())assert(/^Name g[a-d]$/.test(l.text),l.text);
  W.w.dispose();
});
test('An empty project, many subsystems, every quality level, and the music\'s notes',async()=>{
  const {createModel}=await load('model'),empty=createModel();empty.reset({nodes:[],edges:[]},T0);
  const E=await headless(empty);E.at(T0+5000);assert.equal(E.w.stats().chambers,0);E.w.dispose();
  const big=createModel(),nodes=[];for(let g=0;g<60;g++){nodes.push({id:`g${g}`,type:'group'});for(let i=0;i<3;i++)nodes.push({id:`m${g}-${i}`,type:'module',group:`g${g}`,counts:{function:2}});}
  big.reset({nodes,edges:[]},T0);const Big=await headless(big);Big.at(T0+1000);assert.equal(Big.w.stats().chambers,48,'at most 48 chambers');Big.w.dispose();
  const m=await grown();for(let q=0;q<4;q++){const Q=await headless(m,{quality:q});Q.at(T0+45000);assert.equal(Q.w.stats().chambers,4);Q.w.dispose();}
  const bars=b=>({steps:Array.from({length:16},(_,s)=>s%4===0?[{group:'bass',instrument:'bass',midi:38,velocity:.4,duration:1},{group:'melody',instrument:'lead',midi:74,velocity:.3,duration:.4}]:[])});
  const M=await headless(m,{musicBar:bars,musicKey:()=>({tonic:2,scale:[0,2,4,5,7,9,11]})});M.at(T0+45000);const s=M.w.stats();
  assert(s.music.notes>0&&s.music.mono>0&&s.music.mode>0,JSON.stringify(s.music));M.w.dispose();
});
test('The player and the receiver know the preview: the host loads it and gives it the score\'s notes, /api/catalog lists it',async t=>{
  const host=fs.readFileSync(path.join(__dirname,'../public/worlds/host.js'),'utf8');
  assert.match(host,/'genesis':'\.\/genesis\.js'/);assert.match(host,/musicBar:b=>musical\.bar\(b\)/);
  assert.match(fs.readFileSync(path.join(__dirname,'../public/ui/workspaces/visual.js'),'utf8'),/id:'genesis'/);
  assert.match(fs.readFileSync(path.join(__dirname,'../public/web-demo/demo.js'),'utf8'),/'genesis':'Genesis'/);
  const svc=await startService(t,{port:0,dataDir:tempDir(t,'cr-genesis-'),quiet:true});
  const c=await (await fetch(`http://127.0.0.1:${svc.port}/api/catalog`)).json();
  assert.equal(c.previews[ID].preview,true);assert.equal(c.previews[ID].name,'Genesis (preview)');assert(c.previews[ID].parameters['laws.coupling']);
});

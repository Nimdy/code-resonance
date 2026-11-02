'use strict';
// Genesis field (docs/worlds/genesis-field.md): the simulation is authoritative, fixed-step, bounded and deterministic;
// its elementary functions are its own (so every engine reaches the same bits); the Lawbook sets its physics; a
// dependency is a supply line (a current, nutrient the dependent territory grows from, a tendon), a new subsystem a new
// territory; the score's notes set the territories they strike vibrating without reshaping the slow form; the
// comparisons are identical until their difference begins; the vault rises in its ring; the field stays alive with the
// structure frozen; the inputs carry no names; and the proofs reach the hashes reported for them.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const score=require('../public/score.js');
const load=name=>import(`../public/worlds/${name}.js`);
const INPUTS=path.join(__dirname,'..','qualification','visual','genesis-field','inputs');
const inputsOf=d=>JSON.parse(fs.readFileSync(path.join(INPUTS,`${d}.json`),'utf8'));
async function proofOf(d,options={}){
  const {createField,DT}=await load('genesis-field');const {degreeOfMidi}=await load('genesis-laws');const {createMusical}=await load('musical');
  const {createProof}=await import('../qualification/visual/genesis-field/proof.mjs');
  return createProof({createField,DT,degreeOfMidi,score,createMusical},inputsOf(d),options);
}
const rms=(a,b)=>{let d=0;for(let i=0;i<a.length;i++)d+=(a[i]-b[i])**2;return Math.sqrt(d/(a.length/3));};
// The hashes reported for the proof (Node, the browser in real time and the browser offline all reached these).
const PINNED={
  lumen:{4:'7f81b25fbdb71123',8:'e7ef412e981a4e91',12:'841e457a8df6201c',14:'eaba4c4adbe33fcb',18:'eaa7d5459b44e9b3',20:'a095c9d233f21bd5',22:'1b52c25bb4dc11a2',24:'dc9783ad69d1d1ab',26:'fac52ca42f544be8',28:'d438c0dcd51cbe48'},
  self:{4:'1fbb41dec396434e',8:'21b99a59773cd47e',12:'9fc47aecfb9b1ce7',14:'e8adb65d0fc36937',18:'63579c8877218dab'}
};
test('the elementary functions are the simulation\'s own and agree with the platform\'s to the last few bits',async()=>{
  const {dexp,dsin,dcos,dlog,dpow}=await load('genesis-field');
  const rel=(a,b)=>Math.abs(a-b)/Math.max(1e-300,Math.abs(b));
  // (what matters is that every engine computes the same bits; accuracy is to about |x| ulps, plenty for a simulation)
  for(let x=-30;x<=30;x+=.37){assert(rel(dexp(x),Math.exp(x))<1e-14,`exp ${x}`);assert(Math.abs(dsin(x)-Math.sin(x))<4e-15,`sin ${x}`);assert(Math.abs(dcos(x)-Math.cos(x))<4e-15,`cos ${x}`);}
  for(const x of [1e-9,.003,.5,1,1.7,2,9.3,1e3,1e8]){assert(Math.abs(dlog(x)-Math.log(x))<4e-15*Math.max(1,Math.abs(Math.log(x))),`log ${x}`);assert(rel(dpow(x,.75),Math.pow(x,.75))<4e-14,`pow ${x}`);}
  // the step itself uses no platform transcendental
  const src=fs.readFileSync(path.join(__dirname,'..','public','worlds','genesis-field.js'),'utf8').replace(/\/\/.*$/gm,'');
  for(const f of ['Math.exp','Math.sin','Math.cos','Math.pow','Math.log','Math.random','Date.now','performance.now','**'])assert(!src.includes(f),f);
});
test('the Lawbook sets the physics, in the direction each law names',async()=>{
  const {physicsOf}=await load('genesis-field');
  const at=(k,v)=>physicsOf({[k]:v});
  assert(at('cohesion',.9).bend>at('cohesion',.1).bend*2,'cohesion stiffens the sheet (broad folds)');
  assert(at('cohesion',.1).rim>at('cohesion',.9).rim,'little cohesion grows at the rim (frills)');
  assert(at('viscosity',.9).drag>at('viscosity',.1).drag&&at('viscosity',.9).q<at('viscosity',.1).q,'viscosity damps');
  assert(at('coupling',.9).current>at('coupling',.1).current&&at('coupling',.9).tendon>at('coupling',.1).tendon&&at('coupling',.9).crest<at('coupling',.1).crest,'coupling: stronger currents and tendons, softer crests');
  assert(at('morphogenesis',.9).reach>at('morphogenesis',.1).reach&&at('morphogenesis',.9).growth>at('morphogenesis',.1).growth,'morphogenesis grows more, sooner');
  assert(at('elasticity',.9).sound>at('elasticity',.1).sound&&at('elasticity',.9).stretch>at('elasticity',.1).stretch,'elasticity: stiffer, faster vibrations');
  assert(at('viscosity',.9).hush>at('viscosity',.1).hush,'viscosity hushes vibrations');
  assert(at('conductivity',.9).diffuse>at('conductivity',.1).diffuse,'conductivity blurs the boundaries');
  assert(Math.sign(at('anisotropy',.95).aniso)===1&&Math.sign(at('anisotropy',.05).aniso)===-1,'anisotropy: along or across the radius');
  assert(at('resonance',.9).pressure>at('resonance',.1).pressure,'resonance: the music moves more');
});
test('two runs of the same identity are bit-identical, and a different seed is not',async()=>{
  const {createField}=await load('genesis-field');
  const inp=inputsOf('self'),run=seed=>{const f=createField({laws:inp.laws,structure:inp.before,seed,R:18,G:40});for(let i=0;i<90;i++)f.advance(i===60?{bass:[{k:0,v:1}],melody:[{angle:1,v:.6}]}:null);return f.hash();};
  assert.equal(run(inp.seed),run(inp.seed));assert.notEqual(run(inp.seed),run(inp.seed+1));
});
test('Lumen: the proof reaches its reported hashes; the field organises, the first dependency starts a current and a tendon, the score moves what it strikes, and nothing leaves its bounds',async()=>{
  const p=await proofOf('lumen'),sim=p.sim,{DT}=await load('genesis-field');
  const ringOf=k=>{let s=0,w=0;for(let i=0;i<sim.N;i++)if(sim.pv[i*sim.MAXK+k]>.5){s+=Math.abs(sim.vibration[i]);w++;}return s/w;};
  // self-organisation: the noise separates into territories (most of the sheet held by one phase)
  p.advanceTo(4);let held=0;for(let i=0;i<sim.N;i++){let m=0;for(let k=0;k<sim.K();k++)m=Math.max(m,sim.pv[i*sim.MAXK+k]);if(m>.8)held++;}
  assert(held/sim.N>.7,`territories ${held/sim.N}`);
  const relief4=sim.metrics().relief;
  p.advanceTo(11.9);assert.equal(sim.tendons().length,0);let u=0;const f0=sim.flow();for(let c=0;c<f0.ux.length;c++)u=Math.max(u,Math.hypot(f0.ux[c],f0.uy[c]));assert.equal(u,0,'no current before the dependency');
  assert(sim.metrics().relief>relief4,'the sheet keeps folding');
  p.advanceTo(17.9);const T=sim.tendons();assert.equal(T.length,1);assert(T[0].len<T[0].from*.7,`the tendon draws the territories together ${T[0].len}/${T[0].from}`);
  u=0;const f1=sim.flow();for(let c=0;c<f1.ux.length;c++)u=Math.max(u,Math.hypot(f1.ux[c],f1.uy[c]));assert(u>.02,`a current runs ${u}`);
  // the dependency's supply line: nutrient in the field, and the dependent territory has taken some up
  const fl=sim.flow();assert(Math.max(...fl.nut)>.05&&Math.max(...fl.fed)>.01,'nutrient flows and feeds');
  // the music: the first bass strike of the passage (at 18 s) sets its territory vibrating within 0.25 s
  const strike=p.log.find(e=>e.kind==='bass');assert(!strike,'no note before the passage');
  p.advanceTo(18-DT);const before={};for(let k=0;k<sim.K();k++)before[k]=ringOf(k);
  p.advanceTo(18.25);const hit=p.log.find(e=>e.kind==='bass');assert(hit,'the passage opens with a bass note');
  assert(ringOf(hit.k)>.5&&ringOf(hit.k)>before[hit.k]*5,`struck territory ${before[hit.k]} -> ${ringOf(hit.k)}`);
  p.advanceTo(28);
  assert.deepEqual(p.hashes,PINNED.lumen);
  for(let i=0;i<3*sim.N;i++)assert(Number.isFinite(sim.x[i])&&Math.abs(sim.v[i])<=30.0001);
  for(let i=0;i<sim.N;i++)assert(Math.abs(sim.vibration[i])<20);
  assert(sim.metrics().extent<sim.R*2.2);
});
test('Code Resonance: a different Lawbook and structure give a different outcome; a newborn subsystem takes territory; the reported hashes',async()=>{
  const p=await proofOf('self'),sim=p.sim;
  p.advanceTo(11.9);const K0=sim.K(),m0=sim.metrics();
  const l=await proofOf('lumen');l.advanceTo(11.9);const lm=l.sim.metrics();
  assert(Math.abs(m0.extent-lm.extent)/lm.extent>.15,`extent ${m0.extent} vs ${lm.extent}`);
  assert(sim.tendons().length>=10&&l.sim.tendons().length===0);
  p.advanceTo(18);assert.equal(sim.K(),K0+1,'the recorded subsystem is born at 12 s');
  let held=0;for(let i=0;i<sim.N;i++)if(sim.pv[i*sim.MAXK+K0]>.5)held++;assert(held/sim.N>.03,`its territory ${held/sim.N}`);
  for(const c of Object.keys(PINNED.self))assert.equal(p.hashes[c],PINNED.self[c],`checkpoint ${c}`);
});
test('the comparisons: the same identity, field and score are bit-identical until the dependency (or the music) begins; then the dependency changes the shape and the music moves the matter without reshaping it',async()=>{
  const A=await proofOf('lumen'),B=await proofOf('lumen',{change:false}),C=await proofOf('lumen',{music:false});
  for(const t of [8,11.9]){A.advanceTo(t);B.advanceTo(t);C.advanceTo(t);assert.equal(A.sim.hash(),B.sim.hash());assert.equal(A.sim.hash(),C.sim.hash());}
  A.advanceTo(17.9);B.advanceTo(17.9);C.advanceTo(17.9);
  assert.notEqual(A.sim.hash(),B.sim.hash());assert.equal(A.sim.hash(),C.sim.hash(),'no music yet');
  assert(Math.max(...B.sim.flow().nut)===0,'no supply without the dependency');
  A.advanceTo(28);B.advanceTo(28);C.advanceTo(28);
  assert(rms(A.sim.x,B.sim.x)>1.5,`the dependency changes the shape ${rms(A.sim.x,B.sim.x)}`);
  const d=rms(A.sim.x,C.sim.x);assert(d>0&&d<2,`the music moves the matter but does not reshape it (${d})`);
  assert(Math.max(...C.sim.vibration.map(Math.abs))===0,'no vibration without the music');
});
test('the vault (the interior scale): the rim stays in its ring, inflation and growth raise the sheet into a vault',async()=>{
  const {createField}=await load('genesis-field');const inp=inputsOf('self');
  const f=createField({laws:inp.laws,structure:inp.idle.structure,seed:inp.seed,R:20,G:40,boundary:'vault',inflate:1.4});
  const rim=1+3*19*20,x0=f.x.slice(3*rim);for(let i=0;i<360;i++)f.advance(null);
  let top=-1e9;for(let i=0;i<f.N;i++)top=Math.max(top,f.x[3*i+1]);assert(top>f.R*.35,`height ${top}`);
  let drift=0;for(let i=rim;i<f.N;i++)drift=Math.max(drift,Math.hypot(f.x[3*i]-x0[3*(i-rim)],f.x[3*i+1]-x0[3*(i-rim)+1],f.x[3*i+2]-x0[3*(i-rim)+2]));assert(drift<1,`rim ${drift}`);
});
test('sustained life: with the recorded structure frozen and no music, the field keeps moving after minutes (its currents alternate) while it stays bounded',async()=>{
  const {createField}=await load('genesis-field');const inp=inputsOf('lumen');
  const f=createField({laws:inp.laws,structure:inp.idle.structure,seed:inp.seed,R:20,G:40});
  for(let i=0;i<120*60;i++)f.advance(null);
  const a=f.phi().slice(),m=f.flow().mapX.slice();for(let i=0;i<10*60;i++)f.advance(null);
  let dp=0;for(let i=0;i<a.length;i++)dp+=Math.abs(f.phi()[i]-a[i]);let dm=0;for(let i=0;i<m.length;i++)dm+=Math.abs(f.flow().mapX[i]-m[i]);
  assert(dm/m.length>1e-3,`the matter of the field still moves after two minutes (${dm/m.length})`);
  assert(f.metrics().extent<f.R*2.2&&Number.isFinite(f.hash().length));
});
test('the proof\'s inputs carry structure only: counts, roles and colours, never a name, a path or an identifier',()=>{
  const ALLOWED=/^(#[0-9a-f]{6}|core|interface|services|model|logic|tests|dependency|subsystem|porcelain|celadon|smoke|onyx|ambient|pulse|cinematic|chip|analogous|complementary|triadic|split|monochrome|lumen|self)$/;
  for(const f of fs.readdirSync(INPUTS)){const walk=v=>{if(typeof v==='string')assert.match(v,ALLOWED,`${f}: ${v}`);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(JSON.parse(fs.readFileSync(path.join(INPUTS,f),'utf8')));}
});

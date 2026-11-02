'use strict';
// Genesis field (the proof of the revised physics model, docs/worlds/genesis-field.md): the simulation is authoritative,
// fixed-step, bounded and deterministic; its elementary functions are its own (so every engine reaches the same bits);
// the Lawbook sets its physics; a dependency starts a current and a tendon, a new subsystem a new territory; the score's
// notes move the territories they strike; the proof's inputs carry no names; and the proof's own timeline reaches the
// state hashes reported for it (the same hashes the browser reached in real time and offline).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const score=require('../public/score.js');
const load=name=>import(`../public/worlds/${name}.js`);
const INPUTS=path.join(__dirname,'..','qualification','visual','genesis-field','inputs');
const inputsOf=d=>JSON.parse(fs.readFileSync(path.join(INPUTS,`${d}.json`),'utf8'));
async function proofOf(d){
  const {createField,DT}=await load('genesis-field');const {degreeOfMidi}=await load('genesis-laws');const {createMusical}=await load('musical');
  const {createProof}=await import('../qualification/visual/genesis-field/proof.mjs');
  return createProof({createField,DT,degreeOfMidi,score,createMusical},inputsOf(d),{});
}
// The hashes reported for the proof (Node, the browser in real time and the browser offline all reached these).
const PINNED={
  lumen:{4:'7319307a28018460',8:'2f4161332647f783',12:'f5979ea0ea944a45',14:'46af09c7a759156d',18:'0811c6bdb1af868b',20:'756f280e658013cd',22:'b2af430d41be7224',24:'aab92e9dbf6f3c4b',26:'5f14751bc1938147',28:'79b1d3a798529b64'},
  self:{4:'3b8374ac36c6a50f',8:'4cb7c98eda552429',12:'9206588bb01577e0',14:'2126a2d7264eb3c0',18:'5c3bdfeeeac8f414'}
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
  assert(at('elasticity',.9).wave>at('elasticity',.1).wave&&at('elasticity',.9).stretch>at('elasticity',.1).stretch,'elasticity: stiffer, faster ripples');
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
  const speedOf=k=>{let s=0,w=0;for(let i=0;i<sim.N;i++)if(sim.pv[i*sim.MAXK+k]>.5){s+=Math.hypot(sim.v[3*i],sim.v[3*i+1],sim.v[3*i+2]);w++;}return s/w;};
  // self-organisation: the noise separates into territories (most of the sheet held by one phase)
  p.advanceTo(4);let held=0;for(let i=0;i<sim.N;i++){let m=0;for(let k=0;k<sim.K();k++)m=Math.max(m,sim.pv[i*sim.MAXK+k]);if(m>.8)held++;}
  assert(held/sim.N>.7,`territories ${held/sim.N}`);
  const relief4=sim.metrics().relief;
  p.advanceTo(11.9);assert.equal(sim.tendons().length,0);let u=0;const f0=sim.flow();for(let c=0;c<f0.ux.length;c++)u=Math.max(u,Math.hypot(f0.ux[c],f0.uy[c]));assert.equal(u,0,'no current before the dependency');
  assert(sim.metrics().relief>relief4,'the sheet keeps folding');
  p.advanceTo(17.9);const T=sim.tendons();assert.equal(T.length,1);assert(T[0].len<T[0].from*.7,`the tendon draws the territories together ${T[0].len}/${T[0].from}`);
  u=0;const f1=sim.flow();for(let c=0;c<f1.ux.length;c++)u=Math.max(u,Math.hypot(f1.ux[c],f1.uy[c]));assert(u>.02,`a current runs ${u}`);
  // the music: the first bass strike of the passage (at 18 s) moves its territory several times faster within 0.3 s
  const strike=p.log.find(e=>e.kind==='bass');assert(!strike,'no note before the passage');
  p.advanceTo(18-DT);const before={};for(let k=0;k<sim.K();k++)before[k]=speedOf(k);
  p.advanceTo(18.3);const hit=p.log.find(e=>e.kind==='bass');assert(hit,'the passage opens with a bass note');
  assert(speedOf(hit.k)>before[hit.k]*2.5,`struck territory ${before[hit.k]} -> ${speedOf(hit.k)}`);
  p.advanceTo(28);
  assert.deepEqual(p.hashes,PINNED.lumen);
  for(let i=0;i<3*sim.N;i++)assert(Number.isFinite(sim.x[i])&&Math.abs(sim.v[i])<=30.0001);
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
test('the proof\'s inputs carry structure only: counts, roles and colours, never a name, a path or an identifier',()=>{
  const ALLOWED=/^(#[0-9a-f]{6}|core|interface|services|model|logic|tests|dependency|subsystem|porcelain|celadon|smoke|onyx|ambient|pulse|cinematic|chip|analogous|complementary|triadic|split|monochrome|lumen|self)$/;
  for(const f of fs.readdirSync(INPUTS)){const walk=v=>{if(typeof v==='string')assert.match(v,ALLOWED,`${f}: ${v}`);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(JSON.parse(fs.readFileSync(path.join(INPUTS,f),'utf8')));}
});

'use strict';
// Artist layers' signals (public/worlds/layers-signals.js) and the mapping maths (public/composition.js): what an
// artist can map is deterministic, canonical and bounded.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/composition.js');
const load=()=>import('../public/worlds/layers-signals.js');
const T0=1750000000000;
const cmd=(intent,at,extra={})=>({intent,at,tier:2,magnitude:.6,evidence:'verified',count:1,...extra});
const frame=(t,extra={})=>({t,dt:1/60,music:null,activity:0,agents:[],...extra});
const ENG=['eng.creation','eng.removal','eng.failure','eng.recovery','eng.milestone','eng.activity','eng.agents'];
test('No engineering event means no engineering response',async()=>{
  const {createSignals}=await load();const s=createSignals({commands:()=>[]});
  for(let k=0;k<120;k++){s.update(frame(T0+k*500));for(const id of ENG)assert.equal(s.get(id,k%3),0,id);}
});
test('A failure never reads as a milestone, and only verified evidence counts',async()=>{
  const {createSignals,engineeringAt}=await load();
  const failure=[cmd('validation.failed',T0)];
  const at=T0+1500;assert(engineeringAt('eng.failure',failure,at)>.3);
  for(const id of ['eng.milestone','eng.recovery','eng.creation','eng.removal'])assert.equal(engineeringAt(id,failure,at),0,id);
  // A milestone-type intent without verification (never produced by the reducer) is still never a verified milestone.
  assert.equal(engineeringAt('eng.milestone',[cmd('milestone.achieved',T0,{evidence:'observed'})],at),0);
  assert(engineeringAt('eng.milestone',[cmd('milestone.achieved',T0)],T0+3000)>.4);
  // validation.passed is not a milestone either (verified successes are their own kind).
  assert.equal(engineeringAt('eng.milestone',[cmd('validation.passed',T0)],T0+3000),0);
  // Through the frame interface too.
  const s=createSignals({commands:()=>failure});s.update(frame(at));assert(s.get('eng.failure')>.3);assert.equal(s.get('eng.milestone'),0);
});
test('Envelopes rise, hold and decay over seconds of view time',async()=>{
  const {engineeringAt,ENVELOPES}=await load();
  const list=[cmd('milestone.achieved',T0,{tier:3,magnitude:.9})],E=ENVELOPES['eng.milestone'];
  assert.equal(engineeringAt('eng.milestone',list,T0-1),0,'nothing before it happened');
  const rise=engineeringAt('eng.milestone',list,T0+E.rise*500),peak=engineeringAt('eng.milestone',list,T0+(E.rise+E.hold)*1000);
  const later=engineeringAt('eng.milestone',list,T0+(E.rise+E.hold+E.decay)*1000),gone=engineeringAt('eng.milestone',list,T0+120000);
  assert(rise>0&&rise<peak,`${rise} < ${peak}`);assert(later<peak*.6&&later>0);assert(gone<.005,String(gone));
  // At replay speed 2 the same moment of view time is twice as far in performance time.
  assert.equal(engineeringAt('eng.milestone',list,T0+2*(E.rise+E.hold)*1000,2),peak);
  // A burst (more events, larger magnitude) is stronger, but never past 1.
  const burst=[0,200,400,600].map(d=>cmd('module.created',T0+d,{magnitude:1,count:3}));
  const one=engineeringAt('eng.creation',burst.slice(0,1),T0+1000),many=engineeringAt('eng.creation',burst,T0+1000);
  assert(many>one&&many<=1);
});
test('Musical signals read the score expression: beat, bar, phrase, section and the named values',async()=>{
  const {createSignals}=await load();const s=createSignals();
  const e={pulse:.8,barPulse:.25,barInPhrase:2,phase:.5,onset:.9,transition:.3,energy:.6,tension:.7,melody:.85,rhythm:.2,release:.1,dynamics:.55,density:.4};
  s.update(frame(T0,{music:e}));
  assert.equal(s.get('music.beat'),.8);assert.equal(s.get('music.bar'),.25);assert.equal(s.get('music.phrase'),(2+.5)/4);assert.equal(s.get('music.section'),.9);
  for(const k of ['transition','energy','tension','melody','rhythm','release','dynamics','density'])assert.equal(s.get(`music.${k}`),e[k],k);
  // Pure at any performance time (the populations' fixed-step clock): the same T, the same value.
  const p=createSignals({music:T=>({...e,energy:(T-T0)/1e5})});assert.equal(p.at('music.energy',T0+5e4),.5);assert.equal(p.at('music.energy',T0+5e4),p.at('music.energy',T0+5e4));
  // No expression (no music clock yet): every musical signal reads 0.
  s.update(frame(T0));for(const id of Object.keys((await load()).MUSIC))assert.equal(s.get(id),0);
});
test('Smoothing is deterministic frame by frame and is reset by a seek',async()=>{
  const {createSignals}=await load();
  const run=()=>{const s=createSignals(),out=[];for(let k=0;k<90;k++){s.update(frame(T0+k*16.7,{music:{energy:k<30?0:1}}));out.push(s.get('music.energy',1.5));}return {s,out};};
  const a=run(),b=run();assert.deepEqual(a.out,b.out);
  assert(a.out[40]>0&&a.out[40]<1,'it follows gradually');assert(a.out[89]>a.out[40]);
  a.s.reset();a.s.update(frame(T0+9e5,{music:{energy:.2}}));assert.equal(a.s.get('music.energy',1.5),.2,'nothing carried over from before the seek');
});
test('Environmental signals: the ecosystem as shown, scale-free and bounded',async()=>{
  const {createSignals,environmentOf}=await load();
  // A minimal ecosystem: 200 entities, half gathered in one cell and moving together.
  const cap=200,nx=16,nz=16,NC=nx*nz,data=new Float32Array(5*NC),density=new Float32Array(NC);
  const eco={capacity:cap,NS:1,species:[{maxSpeed:2}],alive:new Uint8Array(cap).fill(1),sp:new Uint8Array(cap),vx:new Float32Array(cap).fill(1),vy:new Float32Array(cap),vz:new Float32Array(cap),
    field:{nx,nz,data,density}};
  density[0]=100;for(let q=1;q<=100;q++)density[q]=1;data.fill(.02,0,NC);data.fill(.01,NC,2*NC);
  const m=environmentOf(eco);
  for(const k of ['density','current','coherence','disturbance'])assert(m[k]>=0&&m[k]<=1,`${k}=${m[k]}`);
  assert.equal(m.coherence,1,'all aligned');assert.equal(m.current,.5,'half their top speed');assert(m.density>.3,'gathered');
  const s=createSignals();for(let k=0;k<60;k++)s.update(frame(T0+k*16),m);
  assert(Math.abs(s.get('env.trails')-.5)<.01,'a steady amount reads as its own typical level');
  s.update(frame(T0+1000),null);for(const id of ['env.density','env.field','env.trails'])assert.equal(s.get(id),0,'no ecosystem: no environment');
});
test('Mappings: polarity, curves and ranges stay inside the target, and geometry is never a target',()=>{
  const spec=C.specOf('light'),base={...C.layer('light').params,intensity:1};
  const at=v=>(id,s)=>v;
  const up=C.applyMappings(base,[{signal:'music.energy',target:'intensity',amount:.5,curve:'linear',smoothing:0,min:0,max:1}],at(1),spec);assert.equal(up.intensity,3);
  const down=C.applyMappings(base,[{signal:'music.energy',target:'intensity',amount:-.5,curve:'linear',smoothing:0,min:0,max:1}],at(1),spec);assert.equal(down.intensity,0,'clamped at the bottom');
  const capped=C.applyMappings(base,[{signal:'music.energy',target:'intensity',amount:1,curve:'linear',smoothing:0,min:0,max:.5}],at(1),spec);assert.equal(capped.intensity,2,'max is a fraction of the range');
  const half=v=>C.applyMappings(base,[{signal:'music.energy',target:'intensity',amount:.25,curve:v,smoothing:0,min:0,max:1}],at(.5),spec).intensity;
  assert(half('sharp')<half('linear')&&half('pulse')<half('sharp'),'sharper curves answer later');
  assert.equal(C.applyMappings(base,[],at(1),spec).intensity,1,'no mapping: the value as set');
  // Structural values (rebuilt when edited, never animated) are not targets: such a mapping is dropped.
  const n=C.normalize({layers:[{type:'fractal',mappings:[{signal:'music.beat',target:'depth',amount:1},{signal:'music.beat',target:'glow',amount:.2}]}]});
  assert.deepEqual(n.layers[0].mappings.map(m=>m.target),['glow']);
  for(const type of Object.keys(C.LAYERS))for(const t of C.targetsOf(type))assert.notEqual(t.live,false);
  // Unknown signals never become mappings.
  assert.equal(C.normalize({layers:[{type:'light',mappings:[{signal:'audio.fft',target:'intensity',amount:1}]}]}).layers[0].mappings.length,0);
});

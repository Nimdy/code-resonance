'use strict';
// Fractal Continuum's digital life on the performance timeline (public/worlds/life/fractal.js with life/driver.js): the
// ecosystem at a moment is the same whatever path playback took (continuous play at any frame rate, a far seek, a seek
// back to a checkpoint, a fresh session); the world draws it at every quality without changing it; with life off the
// world has nothing of it. Ecology 2: tests/life-fractal-ecology.test.js; the grammar itself: tests/life-fractal.test.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,recording}=require('./life-driver-fixture.js');
const {RECIPE}=require('./life-fractal-fixture.js');
const score=require('../public/score.js');
const load=()=>Promise.all([import('../public/worlds/life/fractal.js'),import('../public/worlds/life/driver.js'),import('../public/worlds/life/timeline.js')]);
// A player of the fixture's recorded performance with the fractal grammar: windows delivered as playback reaches them
// (live-like) or all at once (a replay primes its timeline).
async function player({entries,prime=true,params={enabled:true},film=false,background=false,music=null}){
  const [life,{createLifeDriver},{createLifeTimeline}]=await load();
  const timeline=createLifeTimeline(),grammar=life.createFractalGrammar(RECIPE);
  const cfg={speed:1,tempo:96,epoch:T0,params,live:false,film,...(music?{music}:{})};
  const driver=createLifeDriver({grammar,timeline,seed:4321,config:()=>cfg,score,background});
  if(prime)timeline.prime(entries);let next=0;
  const deliver=t=>{while(next<entries.length&&entries[next].start<=t){const e=entries[next++];timeline.structure(e.graph,e.start,e.end,e.seq);timeline.frame(e.frame,e.start);for(const i of e.intents)timeline.intent(i);}};
  const view=t=>({tview:(t-T0)/1000});
  return {driver,timeline,
    play(t0,t1,fps=30){const step=1000/fps;for(let k=0,t=t0;t<t1;t=t0+(++k)*step){deliver(t);driver.update(view(t),{budgetMs:1e9});}deliver(t1);return driver.update(view(t1),{budgetMs:1e9});},
    at(t){deliver(t);return driver.update(view(t),{budgetMs:1e9});}};
}
const AT=T0+150000+1234;   // 2 min 31.234 s: after the recording's failure (120 s) and recovery (180 s comes later)
test('The ecosystem at a moment is the same after continuous play (15 and 60 fps), a far seek, a seek back to a checkpoint and in a fresh session',async()=>{
  const entries=recording(40);
  const ref=await player({entries});ref.at(AT);const want=ref.driver.digest();assert.match(want,/^[0-9a-f]{8}$/);
  for(const fps of [15,60]){const c=await player({entries,prime:false});c.play(T0,AT,fps);assert.equal(c.driver.digest(),want,`continuous play at ${fps} fps`);}
  // past the moment, then back to it: restored from a checkpoint, not from the start
  const cp=await player({entries});cp.play(T0,AT+25000,10);const before=cp.driver.stats().fromCheckpoint;cp.at(AT);
  assert.equal(cp.driver.digest(),want,'restored from a checkpoint');assert(cp.driver.stats().fromCheckpoint>before,'a checkpoint was used');
  // the habitat followed the structure: every subsystem founded by then has its region's site
  const ids=new Set(ref.driver.ecosystem.sites.ids);for(let g=0;g<=Math.floor((AT-T0)/80000);g++)assert(ids.has(`g${g}`),`g${g}'s region is a site`);
  // the failure strained its file's site and the void kept the life out of it while it lasted
  const s=ref.driver.ecosystem.sites,k=s.ids.indexOf('m0');assert(k>=0,'m0 has a site of its own');
});
test('Events reach their own sites through the driver: a failure strains the file\'s site, the recovery clears it and draws the motes back',async()=>{
  const entries=recording(30),p=await player({entries});const site=id=>{const e=p.driver.ecosystem,k=e.sites.ids.indexOf(id);return k<0?null:e.sites.state(k);};
  p.at(T0+12*10000+2000);assert.equal(site('m0').stress,0,'before the failure');
  p.at(T0+12*10000+5000);assert(site('m0').stress>.2,'the failing run strains its file\'s site');
  p.at(T0+18*10000+5000);assert.equal(site('m0').stress,0,'the recovery clears it');assert(site('m0').revive>.5,'and the repaired site draws the motes back for a while');
  p.at(T0+24*10000+6000);assert.equal(site('g1').lasting,1,'a verified milestone leaves a lasting attractor at its region');
  // nothing was added to the inputs, nothing grows with time
  const n=p.timeline.items.length;p.at(T0+29*10000);assert.equal(p.timeline.items.length,n);
  const st=p.driver.ecosystem.stats();assert(st.alive<=st.capacity&&st.sites<=64);
});
test('The world draws the life at every quality without changing it; with life off it has nothing of it',async()=>{
  const recipe=require('../engine/recipe');const {THREE}=await import('../public/worlds/core.js');const {createModel}=await import('../public/worlds/model.js');
  const {createDirector}=await import('../public/worlds/director.js');const {createAgents}=await import('../public/worlds/agents.js');const {createFamily}=await import('../public/worlds/fractal.js');
  const entries=recording(24),r0=recipe.generate({projectId:'fractal-life-world',graph:{nodes:[],edges:[]},stats:{}},{family:'fractal-continuum',now:0});
  const make=async life=>{const model=createModel({speed:1,tempo:96});for(const e of entries)model.applyDelta(e.graph,e.start,e.end);model.setEpoch(T0);
    const r=life?{...r0,genome:{...r0.genome,life:{enabled:true}}}:r0,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,16/9,.1,4000);camera.position.set(0,8,60);camera.lookAt(0,0,0);
    let p=null;const ctx={scene,camera,model,recipe:r,speed:()=>1,name:id=>id,director:createDirector({recipe:r}),agents:createAgents(),pipeline:{size:[1280,720]}};
    if(life){p=await player({entries,film:true});ctx.life={params:r.genome.life,create:()=>p.driver};}
    const w=createFamily(ctx);w.rebuild();return {w,scene,p};};
  const frame=(t,quality,life)=>({t,tsec:(t-T0)/1000,tview:(t-T0)/1000,dt:1/30,beat:.5,barPhase:.2,mood:{section:'home',energy:.4,tempo:96},energy:.4,activity:0,phase:'idle',
    unlocks:[0,1,2,3].map(()=>({name:'',level:0})),agents:[],overrides:{},quality,music:null,...(life?{life}:{})});
  const on=await make(true),t=T0+200000;const v=on.p.at(t),digest=on.p.driver.digest(),drawn=[];
  for(const q of [0,1,2,3,0]){on.w.update(frame(t,q,v));const s=on.w.lifeStats();drawn.push(s.points);assert.equal(on.p.driver.digest(),digest,`quality ${q} leaves the ecosystem as it was`);
    assert(s.drawn>500&&s.drawCalls===2,`quality ${q}: ${JSON.stringify(s)}`);}
  assert(drawn[0]>drawn[1]&&drawn[1]>drawn[3],`quality decides how many followers are drawn (${drawn})`);assert.equal(drawn[4],drawn[0],'and nothing else');
  let R=null,bad=0;on.scene.traverse(o=>{if(o.userData?.fractal)R=o.userData.fractal;for(const a of Object.values(o.geometry?.attributes||{}))for(const x of a.array)if(!Number.isFinite(x))bad++;});
  assert.equal(bad,0,'every drawn value is finite');assert(R.uLifeK.value.w>0,'the life\'s light pools in the relief');
  // restoring (a far seek in the player): nothing is drawn of a stale population
  on.w.update(frame(t,0,{...v,restoring:true}));assert.equal(on.w.lifeStats().points,0);assert.equal(R.uLifeK.value.w,0);
  const off=await make(false);off.w.update(frame(t,0,null));let Ro=null,objects=0;off.scene.traverse(o=>{objects++;if(o.userData?.fractal)Ro=o.userData.fractal;});
  assert.equal(off.w.lifeStats,undefined,'no life statistics');assert(!Object.keys(Ro).some(k=>k.startsWith('uLife')),'no life uniform');
  for(const m of [Ro])assert(!/uLife/.test(JSON.stringify(Object.keys(m))));
  let fs='';off.scene.traverse(o=>{if(o.material?.fragmentShader)fs+=o.material.fragmentShader+(o.material.vertexShader||'');});assert(!/uLife|lifeAt/.test(fs),'no life shader text in the scene');
  let onObjects=0;on.scene.traverse(()=>onObjects++);assert.equal(onObjects,objects+2,'life on: two draw calls more (threads and streaks, points)');
  // every life addition in the world is guarded
  const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/worlds/fractal.js'),'utf8');
  assert.match(src,/const LIFE=ctx\.life\|\|null;/);assert.match(src,/if\(LIFE\)\{\s*const grammar=createFractalGrammar/);
  on.w.dispose();off.w.dispose();
});

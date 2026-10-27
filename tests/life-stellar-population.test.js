'use strict';
// Stellar Forge's digital life (public/worlds/life/stellar.js), its populations: every system keeps a resident
// population and the galactic centre stays a weak attractor; a verified milestone leaves a stronger attractor;
// matter stays in the disc, its lifecycles stay bounded and the state is deterministic. The habitat, capture and
// failure tests are in tests/life-stellar.test.js.
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,nodes,setup,run}=require('./life-stellar-fixture');
function within(e,k,reach){let n=0;const S=e.sites;for(let i=0;i<e.capacity;i++){if(!e.alive[i]||e.sp[i]===3)continue;if(Math.hypot(e.px[i]-S.x[k],e.pz[i]-S.z[k])<S.r[k]+reach)n++;}return n;}
test('Every system keeps a resident population; the galactic centre is a weak attractor, never the disc\'s vortex',async()=>{
  const {eco}=await setup();const e=eco();run(e,1600);const S=e.sites;
  for(let k=0;k<S.count;k++){if(Math.hypot(S.x[k],S.z[k])<2)continue;let n=0;
    for(let i=0;i<e.capacity;i++)if(e.alive[i]&&e.sp[i]===1&&Math.hypot(e.px[i]-S.x[k],e.pz[i]-S.z[k])<S.r[k]+3)n++;
    assert(n>=3,`${S.ids[k]}: ${n} fragments resident`);}
  // a project without a core subsystem has the nucleus site: it holds a small share of the matter
  const {eco:eco2,grammar}=await setup({nG:5});
  const {createModel}=await import('../public/worlds/model.js');const m=createModel({speed:1,tempo:96});
  m.reset({nodes:nodes(5).map(n=>n.type==='group'?{...n,core:false}:n),edges:[]},T0);
  const sites=grammar.habitat(m,T0+60000);assert(sites.some(s=>s.id==='#nucleus'),'the nucleus is a site');
  const f=eco2();f.setSites(sites);run(f,1600);let near=0,all=0;
  for(let i=0;i<f.capacity;i++){if(!f.alive[i]||f.sp[i]===3)continue;all++;if(Math.hypot(f.px[i],f.pz[i])<4)near++;}
  assert(near<all*.12,`matter at the galactic centre: ${near} of ${all}`);
  // the grammar prepares its per-tick tables in hooks.tick (before anything moves), not from inside the current
  const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/worlds/life/stellar.js'),'utf8');
  assert.equal(typeof grammar.ecosystem().hooks.tick,'function');assert.doesNotMatch(src,/q===0/);
});
test('A verified milestone leaves a stronger, wider attractor',async()=>{
  const {eco}=await setup();const a=eco(),b=eco();const both=n=>{run(a,n);run(b,n);};both(600);
  // a system that is not the central one
  const S=a.sites;let k=-1;for(let s=0;s<S.count;s++)if(S.kind[s]<5&&(k<0||S.w[s]<S.w[k]))k=s;
  a.influence({kind:'lasting',site:S.ids[k],amount:1});both(600);
  assert.equal(a.sites.state(k).lasting,1);
  let na=0,nb=0;for(let t=0;t<30;t++){both(40);na+=within(a,k,4.5);nb+=within(b,k,4.5);}
  assert(na>nb*1.25,`matter around the lasting attractor: ${na}, without the milestone ${nb}`);
  assert.equal(a.sites.state(k).lasting,1,'it lasts');
});
test('Matter stays in the disc and in bounds; lifecycles are bounded; the state is deterministic',async()=>{
  const {eco,life}=await setup();const e=eco(),f=eco();
  const quota=life.SHARES.map(s=>Math.floor(e.capacity*s));
  for(let round=0;round<6;round++){run(e,500);
    const per=[0,0,0,0];let alive=0;
    for(let i=0;i<e.capacity;i++){if(!e.alive[i])continue;alive++;per[e.sp[i]]++;
      assert(Number.isFinite(e.px[i]+e.py[i]+e.pz[i]+e.vx[i]+e.vy[i]+e.vz[i]),'finite');
      assert(Math.hypot(e.px[i],e.pz[i])<life.RN*1.22,`in the disc (r ${Math.hypot(e.px[i],e.pz[i]).toFixed(2)})`);
      assert(Math.abs(e.py[i])<=1.6+1e-6,`thin disc (y ${e.py[i]})`);
      assert(e.age[i]<=e.life[i]+5*20,'departs after its lifetime');}
    assert(alive<=e.capacity);per.forEach((n,s)=>assert(n<=quota[s]+1,`species ${s}: ${n} of ${quota[s]}`));}
  let respawned=0;for(let i=0;i<e.capacity;i++)if(e.gen[i]>1)respawned++;assert(respawned>e.capacity*.3,'slots are reused');
  run(f,3000);assert.equal(f.digest(),e.digest(),'same inputs, same state');
  const snap=e.snapshot();run(e,200);const d1=e.digest();e.restore(snap);run(e,200);assert.equal(e.digest(),d1,'restore gives the same future');
});

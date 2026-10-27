'use strict';
// Stellar Forge's digital life (public/worlds/life/stellar.js): the habitat is a pure function of the model and a time
// and coincides with the world's own layout (public/worlds/stellar-layout.js); systems capture matter into temporary
// orbits; a failure's disturbance blows matter out of a system and it is recaptured after the recovery; every
// arrangement has a living disc; the matter map draws lanes only from free dust. Resident populations, lasting
// attractors, bounds and determinism are in tests/life-stellar-population.test.js; the shared fixture is
// tests/life-stellar-fixture.js. Rendering is qualified in a browser (qualification/visual/lab.js).
const test=require('node:test'),assert=require('node:assert/strict');
const {T0,nodes,setup,run}=require('./life-stellar-fixture');
test('The habitat is a pure function of the model and the time, and its sites are the rendered systems',async()=>{
  const {model,layout,grammar,life,createModel}=await setup();const t=T0+60000;
  const a=grammar.habitat(model,t),b=grammar.habitat(model,t);assert.deepEqual(a,b,'same model and time: same sites');
  // the same structure in another model (the timeline's shadow model) gives the same sites
  const other=createModel({speed:1,tempo:96});other.reset({nodes:nodes(),edges:[]},T0);assert.deepEqual(grammar.habitat(other,t),a,'another model with the same structure');
  // each system's site is exactly where the world draws its star (galaxy-local, rotation removed)
  const lay=layout.blended(model,t,0),turn=layout.armTurn(lay.galR);
  const sys=a.filter(s=>s.id[0]!=='#');assert.equal(sys.length,lay.list.length);
  for(const s of sys){const p=lay.pos.get(s.id),q=life.fromEco(s.x,s.y,s.z,lay.galR,turn);
    for(let c=0;c<3;c++)assert(Math.abs(q[c]-[p.x,p.y,p.z][c])<1e-9,`${s.id} coincides with its star`);}
  // the frame is the galaxy's own: systems placed on an arm sit on ARM0 + arm/ARMS*2pi + ln(r/RN)/tan(pitch)
  const {ARM0,ARMS,TANP}=layout.cfg;const lay0=layout.layoutState(model,t).L;
  for(const s of sys){const p=lay0.pos.get(s.id);if(p.arm===undefined||p.r<.5)continue;const r=Math.hypot(s.x,s.z),th=Math.atan2(s.z,s.x);
    const want=ARM0+p.arm/ARMS*2*Math.PI+Math.log(r/life.RN)/TANP;const d=Math.atan2(Math.sin(th-want),Math.cos(th-want));assert(Math.abs(d)<1e-6,`${s.id} on its arm (${d})`);}
  // cheap enough to run after every recorded window
  const t0=performance.now();for(let k=0;k<20;k++)grammar.habitat(model,t+k*1000);assert((performance.now()-t0)/20<2,'habitat under 2 ms');
});
test('The world draws its layout from the same pure module (life off: unchanged)',async()=>{
  const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/worlds/stellar.js'),'utf8');
  assert.match(src,/const blended=\(t,depth\)=>layout\.blended\(model,t,depth\)/);
  // every life addition is guarded: no driver, resource or shader text without ctx.life
  assert.match(src,/const LIFE=ctx\.life\|\|null;/);assert.match(src,/if\(LIFE\)\{\s*const grammar=createStellarGrammar/);
});
// Entities (not the wind, same life) that stay within reach of the same system for the whole window and circle it
// (the central system is left out: the whole inner disc turns around it with the galaxy).
function resident(e,ticks,reach=3.5){const S=e.sites,home=new Map(),swept=new Map();
  const near=i=>{let best=-1;for(let k=0;k<S.count;k++){if(S.kind[k]<5&&Math.hypot(e.px[i]-S.x[k],e.pz[i]-S.z[k])<S.r[k]+reach){best=k;break;}}return best;};
  const ang=(i,k)=>Math.atan2(e.pz[i]-S.z[k],e.px[i]-S.x[k]);
  for(let i=0;i<e.capacity;i++){if(!e.alive[i]||e.sp[i]===3)continue;const k=near(i);if(k>=0){home.set(i,[k,e.gen[i],ang(i,k)]);swept.set(i,0);}}
  for(let t=0;t<ticks;t+=20){run(e,20);for(const [i,[k,g,a]] of home){if(!e.alive[i]||e.gen[i]!==g||Math.hypot(e.px[i]-S.x[k],e.pz[i]-S.z[k])>=S.r[k]+reach){home.delete(i);continue;}
    const b=ang(i,k);swept.set(i,swept.get(i)+Math.atan2(Math.sin(b-a),Math.cos(b-a)));home.get(i)[2]=b;}}
  let n=0;for(const i of home.keys())if(Math.abs(swept.get(i))>Math.PI/2)n++;return n;}
test('Systems capture matter into temporary orbits (compared with attractors off)',async()=>{
  const {eco}=await setup();const on=eco(),off=eco({attraction:0});run(on,900);run(off,900);
  const a=resident(on,600),b=resident(off,600);
  console.log(`# circling a system for 30 s: ${a} with attractors, ${b} without`);
  assert(a>2*b+15,`matter circling a system for 30 s: ${a} with attractors, ${b} without`);
  // temporary: the captured matter changes (fed fragments leave, lifecycles end), the zones are not prisons
  const before=new Set();for(let i=0;i<on.capacity;i++)if(on.alive[i]&&on.ia[i*2+1]>500)before.add(`${i}/${on.gen[i]}`);
  run(on,1200);let kept=0;for(let i=0;i<on.capacity;i++)if(on.alive[i]&&on.ia[i*2+1]>500&&before.has(`${i}/${on.gen[i]}`))kept++;
  assert(kept<before.size*.75,`captured matter turns over (${kept} of ${before.size} still captured a minute later)`);
});
// Matter (not the wind) within f times a system's ring radius.
function withinR(e,k,f){let n=0;const S=e.sites;for(let i=0;i<e.capacity;i++){if(!e.alive[i]||e.sp[i]===3)continue;if(Math.hypot(e.px[i]-S.x[k],e.pz[i]-S.z[k])<S.r[k]*f)n++;}return n;}
test('A failure blows matter out of its system into a halo; after the recovery it falls back within seconds',async()=>{
  // compared with the same ecosystem without the failure (streams passing by make the counts fluctuate)
  const {eco}=await setup();const e=eco(),c=eco();const both=n=>{run(e,n);run(c,n);};both(900);
  let k=0,best=-1;for(let s=0;s<e.sites.count;s++){if(e.sites.kind[s]>=5)continue;const n=withinR(e,s,1.6);if(n>best){best=n;k=s;}}const id=e.sites.ids[k];
  // a verified failure (the driver's strength for one: about .3 of stress)
  e.influence({kind:'disturb',site:id,amount:.5});
  // the onset's shock: within two seconds the halo is blown out of the system's ring, an emptied bubble
  both(40);const inner=x=>withinR(x,k,1.6);
  assert(inner(e)<inner(c)*.5,`blown out: ${inner(e)} within the ring's halo, ${inner(c)} without the failure`);
  assert(e.sites.state(k).shock>.3,'the onset is a shock');
  // the blown-out matter is held around the system for a while (a wider, turbulent halo, not scattered over the disc);
  // the disturbance the strain keeps emitting then drives most of it further away
  both(20);const halo=x=>withinR(x,k,3.2)-withinR(x,k,1.6);
  assert(halo(e)>halo(c)+25,`held in a halo: ${halo(e)} around the strained system, ${halo(c)} without the failure`);
  both(120);let a=0,b=0;for(let t=0;t<10;t++){both(20);a+=withinR(e,k,1.3);b+=withinR(c,k,1.3);}
  assert(a<b*.5,`kept out: ${a} near the strained system, ${b} without the failure`);
  assert(e.sites.state(k).stress>.25,'the system is strained');
  const before=withinR(e,k,1.6);e.influence({kind:'recover',site:id,amount:.5});both(70);
  const after=withinR(e,k,1.6);
  console.log(`# recovery: ${before} within 1.6 R before, ${after} three and a half seconds later`);
  assert(after>=before+10&&after>=2*before,`falls back within seconds: ${before} -> ${after}`);
  both(800);a=0;b=0;for(let t=0;t<30;t++){both(40);a+=withinR(e,k,1.6);b+=withinR(c,k,1.6);}
  assert(a>b*.6,`recaptured: ${a} after the recovery, ${b} without the failure`);
  assert(e.sites.state(k).stress<.05,'the strain is cleared');
});
test('Every arrangement has a habitat and a living disc',async()=>{
  for(const arrangement of ['spiral','ring','binary-core','cluster']){
    const {eco,grammar,model}=await setup({recipe:{projectSeed:9,genome:{geometry:{arrangement,spiralArms:3}}}});
    assert(grammar.habitat(model,T0+60000).length>=7,arrangement);const e=eco();run(e,400);
    let n=0;for(let i=0;i<e.capacity;i++)if(e.alive[i]&&Number.isFinite(e.px[i]))n++;assert(n>e.capacity*.9,`${arrangement}: ${n} alive`);}
});
test('The matter map darkens the gas only along free dust streams, never at a system\'s halo; it is a pure function of the state',async()=>{
  const {eco,life}=await setup();const e=eco();run(e,900);
  const mm=life.createMatterMap(128),N=mm.N,a=mm.build(e).slice();
  assert.deepEqual(mm.build(e),a,'the same state: the same map');
  const F0=e.field.min[0],G0=e.field.min[1],W=e.field.max[0]-F0,S=e.sites;
  // nothing (no lane, no glow) inside any system's ring halo
  for(let k=0;k<S.count;k++){const ci=(S.x[k]-F0)/W*N-.5,cj=(S.z[k]-G0)/W*N-.5,rr=S.r[k]*1.1/W*N;
    for(let j=Math.max(0,Math.floor(cj-rr));j<=Math.min(N-1,Math.ceil(cj+rr));j++)for(let i=Math.max(0,Math.floor(ci-rr));i<=Math.min(N-1,Math.ceil(ci+rr));i++){
      if(Math.hypot(i-ci,j-cj)>rr)continue;const q=j*N+i;assert.equal(a[q*4],0,`no lane in ${S.ids[k]}'s halo`);assert.equal(a[q*4+1],0,`no glow in ${S.ids[k]}'s halo`);}}
  // captured matter never feeds the lanes: with every fragment and every captured dust grain moved onto one free
  // stream, the lane channel is unchanged
  const lanes=[...a].filter((_,q)=>q%4===0).reduce((x,y)=>x+y,0);assert(lanes>0,'the free dust draws lanes');
  for(let i=0;i<e.capacity;i++)if(e.alive[i]&&(e.sp[i]===1||e.sp[i]===2)&&e.ia[i*2+1]>500){e.tx.fill(e.tx[i*e.K],i*e.K,(i+1)*e.K);}
  const b=mm.build(e);let same=true;for(let q=0;q<N*N;q++)if(b[q*4]!==a[q*4]){same=false;break;}assert(same,'fragments and motes never draw lanes');
});

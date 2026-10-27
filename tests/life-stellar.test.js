'use strict';
// Stellar Forge's digital life (public/worlds/life/stellar.js): the habitat is a pure function of the model and a time
// and coincides with the world's own layout (public/worlds/stellar-layout.js); systems capture matter into temporary
// orbits; a failure's disturbance blows matter out of a system and it is recaptured after the recovery; a verified
// milestone leaves a stronger attractor; matter stays in the disc and its lifecycles stay bounded. Rendering is
// qualified in a browser (qualification/visual/lab.js).
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>Promise.all([import('../public/worlds/model.js'),import('../public/worlds/stellar-layout.js'),import('../public/worlds/life/stellar.js'),
  import('../public/worlds/life/sim.js'),import('../public/worlds/life/driver.js')]);
const T0=1750000000000;
// A project: nG subsystems (the first one the core), each with a few modules on its hex rings.
function nodes(nG=7,per=5){const out=[];
  for(let g=0;g<nG;g++){out.push({id:`g${g}`,type:'group',order:g,q:g*3,r:-g,angle:g*.8,counts:{function:3},core:g===0});
    for(let k=0;k<per+g;k++)out.push({id:`m${g}_${k}`,type:'module',group:`g${g}`,dir:'d',q:g*3+(k%3),r:-g+Math.floor(k/3),state:'committed',counts:{function:2}});}
  return out;}
async function setup({recipe={projectSeed:42,genome:{}},nG=7}={}){
  const [{createModel},{layoutConfig,createLayout},life,{createEcosystem},{lifeScales}]=await load();
  const model=createModel({speed:1,tempo:96});model.reset({nodes:nodes(nG),edges:[]},T0);
  const layout=createLayout(layoutConfig(recipe)),grammar=life.createStellarGrammar({layout});
  const eco=(params={},seed=7)=>{const e=createEcosystem({...grammar.ecosystem(params,seed),seed,params:lifeScales(params)});e.setSites(grammar.habitat(model,T0+60000));e.populate();return e;};
  return {model,layout,grammar,life,eco,createModel,createLayout,layoutConfig};
}
const run=(e,n)=>{for(let k=0;k<n;k++)e.step();};
function within(e,k,reach){let n=0;const S=e.sites;for(let i=0;i<e.capacity;i++){if(!e.alive[i]||e.sp[i]===3)continue;if(Math.hypot(e.px[i]-S.x[k],e.pz[i]-S.z[k])<S.r[k]+reach)n++;}return n;}
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
test('A failure blows matter out of its system; after the recovery the system recaptures it',async()=>{
  // compared with the same ecosystem without the failure (streams passing by make the counts fluctuate)
  const {eco}=await setup();const e=eco(),c=eco();const both=n=>{run(e,n);run(c,n);};both(900);
  let k=0,best=-1;for(let s=0;s<e.sites.count;s++){const n=within(e,s,2.5);if(n>best){best=n;k=s;}}const id=e.sites.ids[k];
  e.influence({kind:'disturb',site:id,amount:1});both(140);
  let a=0,b=0;for(let t=0;t<10;t++){both(20);a+=within(e,k,2.5);b+=within(c,k,2.5);}
  assert(a<b*.4,`blown out: ${a} near the strained system, ${b} without the failure`);
  assert(e.sites.state(k).stress>.3,'the system is strained');
  e.influence({kind:'recover',site:id,amount:1});both(900);
  a=0;b=0;for(let t=0;t<30;t++){both(40);a+=within(e,k,2.5);b+=within(c,k,2.5);}
  assert(a>b*.6,`recaptured: ${a} after the recovery, ${b} without the failure`);
  assert(e.sites.state(k).stress<.05,'the strain is cleared');
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
  const quota=[.56,.2,.14,.1].map(s=>Math.floor(e.capacity*s));
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
test('Every arrangement has a habitat and a living disc',async()=>{
  for(const arrangement of ['spiral','ring','binary-core','cluster']){
    const {eco,grammar,model}=await setup({recipe:{projectSeed:9,genome:{geometry:{arrangement,spiralArms:3}}}});
    assert(grammar.habitat(model,T0+60000).length>=7,arrangement);const e=eco();run(e,400);
    let n=0;for(let i=0;i<e.capacity;i++)if(e.alive[i]&&Number.isFinite(e.px[i]))n++;assert(n>e.capacity*.9,`${arrangement}: ${n} alive`);}
});

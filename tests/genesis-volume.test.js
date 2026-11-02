'use strict';
// Genesis volume (docs/worlds/genesis-volume.md): the art-direction experiment's universe as a body of matter in three
// dimensions. Authoritative and deterministic like the field (its own elementary functions, bit-identical runs); its
// open space forms one connected network (what a sheet cannot); each region's chemistry follows its role and the
// Lawbook; a dependency opens a passage; the music is a pressure wave that crosses the world and dies away.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const load=name=>import(`../public/worlds/${name}.js`);
const INPUTS=path.join(__dirname,'..','qualification','visual','genesis-field','inputs');
const inputsOf=d=>JSON.parse(fs.readFileSync(path.join(INPUTS,`${d}.json`),'utf8'));
const small={nx:32,ny:24,nz:32};
// the largest connected piece of open space (6-neighbour, periodic) as a share of all open space
function connected(V,iso=.13){
  const {nx,ny,nz,NC}=V,open=new Uint8Array(NC);let total=0;for(let i=0;i<NC;i++)if(V.v[i]>iso){open[i]=1;total++;}
  const seen=new Uint8Array(NC),q=new Int32Array(NC);let best=0;
  for(let s=0;s<NC;s++){if(!open[s]||seen[s])continue;let h=0,t=0;q[t++]=s;seen[s]=1;
    while(h<t){const i=q[h++],x=i%nx,y=Math.floor(i/nx)%ny,z=Math.floor(i/(nx*ny));
      for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const j=((x+dx+nx)%nx)+((y+dy+ny)%ny)*nx+((z+dz+nz)%nz)*nx*ny;if(open[j]&&!seen[j]){seen[j]=1;q[t++]=j;}}}
    best=Math.max(best,t);}
  return {open:total/NC,share:total?best/total:0};
}
test('the volume is the volume module\'s own arithmetic: no platform transcendental or clock in it',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','public','worlds','genesis-volume.js'),'utf8').replace(/\/\/.*$/gm,'');
  for(const f of ['Math.exp','Math.sin','Math.cos','Math.pow','Math.log','Math.random','Date.now','performance.now','**'])assert(!src.includes(f),f);
});
test('two runs of the same identity are bit-identical, and a different seed is not',async()=>{
  const {createVolume}=await load('genesis-volume');const inp=inputsOf('lumen');
  const run=seed=>{const V=createVolume({laws:inp.laws,structure:inp.after,seed,...small});for(let i=0;i<120;i++)V.advance(i===60?{bass:[{k:0,v:1}]}:null);return V.hash();};
  assert.equal(run(inp.seed),run(inp.seed));assert.notEqual(run(inp.seed),run(inp.seed+1));
});
test('regions follow their roles and the Lawbook, and two projects mix different architectures',async()=>{
  const {regionLaw,REGIMES}=await load('genesis-volume');
  const core=regionLaw({k:0,role:'core',files:4},{stability:.5},7);assert.equal(core.regime,'open');
  for(const role of ['interface','logic','tests','model','services']){const r=regionLaw({k:3,role,files:4},{stability:.5,cohesion:.5},11);assert(REGIMES[r.regime],role);assert(r.speed*.2*6<=1.0001,'explicit diffusion stays stable');}
  const mix=d=>{const inp=inputsOf(d);return inp.after.subsystems.map(s=>regionLaw(s,inp.laws,inp.seed).regime).sort().join(',');};
  assert.notEqual(mix('lumen'),mix('self'));
});
test('its open space is one connected network, and a dependency opens a passage that the same world without it lacks',async()=>{
  const {createVolume}=await load('genesis-volume');const inp=inputsOf('self-dependency');
  // the proof's own grid: on a small one the passage runs through space that is open either way
  const withDep=createVolume({laws:inp.laws,structure:inp.after,seed:inp.seed}),without=createVolume({laws:inp.laws,structure:inp.before,seed:inp.seed});
  for(let i=0;i<420;i++){withDep.advance(null);without.advance(null);}
  const c=connected(withDep);assert(c.open>.3&&c.share>.9,`open ${c.open}, connected ${c.share}`);
  // along the new dependency's passage (the tube the after-structure has and the before-structure lacks) more is open
  const keys=new Set(without.tubes().map(t=>t.cells.length+':'+t.dir.join()));const T=withDep.tubes().find(t=>!keys.has(t.cells.length+':'+t.dir.join()));assert(T,'the new passage');
  // the activity that hollows matter is higher along the passage's core with the dependency than without it
  let a=0,b=0,n=0;for(let q=0;q<T.cells.length;q++)if(T.w[q]>.5){a+=withDep.v[T.cells[q]];b+=without.v[T.cells[q]];n++;}
  assert(a/n>b/n*1.05,`activity along the passage: ${(a/n).toFixed(3)} with it, ${(b/n).toFixed(3)} without`);
  let mx=0;for(const x of withDep.nut)mx=Math.max(mx,x);assert(mx>.05,`the passage carries its nutrient (${mx})`);
});
test('the music is a pressure wave: a strike rings its region, crosses the world, and dies away without changing the matter',async()=>{
  const {createVolume}=await load('genesis-volume');const inp=inputsOf('lumen');
  const A=createVolume({laws:inp.laws,structure:inp.after,seed:inp.seed,...small}),B=createVolume({laws:inp.laws,structure:inp.after,seed:inp.seed,...small});
  for(let i=0;i<120;i++){A.advance(null);B.advance(null);}
  A.advance({bass:[{k:0,v:1}]});B.advance(null);
  const far=i=>{const s=A.seats(),x=i%A.nx,z=Math.floor(i/(A.nx*A.ny));const dx=Math.abs(x-s[0]),dz=Math.abs(z-s[2]);return Math.min(dx,A.nx-dx)+Math.min(dz,A.nz-dz)>12;};
  let reach=0;for(let s=0;s<60;s++){A.advance(null);B.advance(null);for(let i=0;i<A.NC;i++)if(far(i))reach=Math.max(reach,Math.abs(A.p[i]));}
  assert(reach>.01,`the wave reaches far cells (${reach})`);
  for(let s=0;s<360;s++){A.advance(null);B.advance(null);}
  let pm=0;for(let i=0;i<A.NC;i++)pm=Math.max(pm,Math.abs(A.p[i]));assert(pm<reach*.25,`and dies away (${pm})`);
  // the pressure moves the walls in the view; the chemistry is not pushed by it: the matter is the same
  let dv=0;for(let i=0;i<A.NC;i++)dv=Math.max(dv,Math.abs(A.v[i]-B.v[i]));assert.equal(dv,0);
});

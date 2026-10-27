'use strict';
// The receiver's side of visual packs: what the player may read, approvals, the isolated frame's content policy, and
// the one cross-origin exception (the opaque-origin frame loading the public world modules).
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {sha}=require('../receiver/protocol');
const {tempDir,startService}=require('./helpers');
const packs=require('../engine/packs');
const EXAMPLES=path.join(__dirname,'../packs/examples');
async function start(t){
  const dir=tempDir(t,'cr-pack-http-');
  packs.install(path.join(EXAMPLES,'cymatic-field'),dir);packs.install(path.join(EXAMPLES,'ember-observatory'),dir);
  const svc=await startService(t,{port:0,dataDir:dir});
  const base=`http://127.0.0.1:${svc.port}`;
  // Administrative requests carry the page's origin and a control capability (POST /api/session, for the pairing key).
  const {capability}=await (await fetch(`${base}/api/session`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({pairing:svc.pairing})})).json();
  const origin={Origin:base,'X-Resonance-Capability':capability};
  const projectId=sha('pack-http');let seq=0;
  const ev=(file,content)=>({v:1,id:`ph-${++seq}-xxxxxxxx`,ts:Date.now(),kind:'document.snapshot',projectId,sessionId:'s',origin:'test',file,content,meta:{reason:'edit'}});
  await fetch(`${base}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events:Array.from({length:7},(_,i)=>ev(`src/p${i%2}/m${i}.ts`,`export function f${i}(){}`))})});
  await svc.flush(projectId);
  return {svc,dir,base,origin,projectId};
}
test('The player can list packs and read approved files only; files are inert text; approvals need the same origin, a control capability and the exact digest',async t=>{
  const {base,origin,dir}=await start(t);
  const list=await (await fetch(`${base}/api/packs`)).json();
  assert.equal(list.sdk,packs.SDK_VERSION);
  const world=list.packs.find(p=>p.id==='halcyon.cymatic-field'),look=list.packs.find(p=>p.id==='northlight.ember-observatory');
  assert.equal(world.executable,true);assert.equal(world.trusted,false);assert.equal(look.executable,false);assert.equal(look.trusted,true);
  assert(!JSON.stringify(list).includes(dir),'no location on disk');
  const file=(id,p,headers={})=>fetch(`${base}/api/packs/file?id=${id}&path=${encodeURIComponent(p)}`,{headers});
  assert.equal((await file('halcyon.cymatic-field','world.js')).status,403,'unapproved code is not handed out');
  assert.equal((await file('northlight.ember-observatory','pack.json')).status,200,'data packs need no approval');
  const trust=(headers,body)=>fetch(`${base}/api/packs/trust`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await trust({},{id:world.id,digest:world.digest,trusted:true})).status,401,'no Origin: refused');
  assert.equal((await trust({Origin:'http://evil.example'},{id:world.id,digest:world.digest,trusted:true})).status,403);
  assert.equal((await trust({Origin:base},{id:world.id,digest:world.digest,trusted:true})).status,401,'same origin without a capability: refused');
  assert.equal((await trust(origin,{id:world.id,digest:'0'.repeat(64),trusted:true})).status,400,'a different digest is not the reviewed pack');
  assert.equal((await trust(origin,{id:look.id,digest:look.digest,trusted:true})).status,400,'data packs need no approval');
  const ok=await trust(origin,{id:world.id,digest:world.digest,trusted:true});assert.equal(ok.status,200);assert.equal((await ok.json()).trusted,true);
  const code=await file('halcyon.cymatic-field','world.js');
  assert.equal(code.status,200);assert.match(code.headers.get('content-type'),/^text\/plain/);assert.equal(code.headers.get('x-content-type-options'),'nosniff');
  assert.match(code.headers.get('content-security-policy'),/sandbox/);
  assert.equal((await file('halcyon.cymatic-field','../trust.json')).status,404);assert.equal((await file('halcyon.cymatic-field','.install.json')).status,404);
  assert.equal((await file('nobody.missing','x.js')).status,404);
  // Revoking closes the files again.
  await trust(origin,{id:world.id,digest:world.digest,trusted:false});assert.equal((await file('halcyon.cymatic-field','world.js')).status,403);
});
test('The pack frame is served with a policy that allows no connection and only the public world modules',async t=>{
  const {base}=await start(t);
  const res=await fetch(`${base}/pack-frame.html`);const csp=res.headers.get('content-security-policy');
  assert.equal(res.status,200);
  for(const rule of ["default-src 'none'","connect-src 'none'","worker-src blob:","frame-src 'none'","form-action 'none'","object-src 'none'","sandbox allow-scripts","frame-ancestors "])assert(csp.includes(rule),rule);
  assert.match(csp,/script-src http:\/\/localhost:\d+\/worlds\/ http:\/\/localhost:\d+\/vendor\/ http:\/\/127\.0\.0\.1:\d+\/worlds\/ http:\/\/127\.0\.0\.1:\d+\/vendor\/ blob:;/);
  assert.match(csp,/frame-ancestors http:\/\/localhost:\d+ http:\/\/127\.0\.0\.1:\d+; sandbox allow-scripts$/);
  assert.match(res.headers.get('permissions-policy'),/camera=\(\).*microphone=\(\)/);
  assert.match(await res.text(),/\/worlds\/frame\.js/);
  // The opaque-origin frame may load public modules (CORS *), and nothing else.
  const nul={Origin:'null'};
  const mod=await fetch(`${base}/worlds/host.js`,{headers:nul});assert.equal(mod.status,200);assert.equal(mod.headers.get('access-control-allow-origin'),'*');
  assert.equal((await fetch(`${base}/vendor/three.module.min.js`,{headers:nul})).status,200);
  for(const p of ['/api/projects','/api/packs','/','/app.js','/api/packs/file?id=halcyon.cymatic-field&path=world.js'])assert.equal((await fetch(base+p,{headers:nul})).status,403,p);
  assert.equal((await fetch(`${base}/api/packs/trust`,{method:'POST',headers:{...nul,'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(`${base}/worlds/host.js`)).headers.get('access-control-allow-origin'),null,'same-origin requests get no CORS header');
});
test('Recipes: an installed world pack can be chosen; the fallback identity never stores anything',async t=>{
  const {base,origin,projectId}=await start(t);
  const url=`${base}/api/recipe?id=${projectId}`;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...origin},body:JSON.stringify({action:{type:'family',family:'halcyon.cymatic-field'}})});
  const chosen=await r.json();assert.equal(r.status,200);assert.equal(chosen.familyKind,'pack');
  const fallback=await (await fetch(`${url}&fallback=1`)).json();assert.equal(fallback.familyKind,'builtin');assert.deepEqual(fallback.unavailable,{family:'halcyon.cymatic-field'});
  assert.equal((await (await fetch(url)).json()).family,'halcyon.cymatic-field','the stored choice is unchanged');
  const bad=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...origin},body:JSON.stringify({action:{type:'pack',pack:'nobody.missing'}})});
  assert.equal(bad.status,400);
});

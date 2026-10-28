'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const proof=require('../receiver/proof');
const client=require('../extension/proof');
const {tempDir,startService}=require('./helpers');
const ROOT=path.join(__dirname,'..');
async function occupy(t,handler){
  const server=http.createServer(handler);
  t.after(()=>new Promise(r=>server.close(()=>r())));
  await new Promise((resolve,reject)=>{server.listen(0,'127.0.0.1',resolve);server.on('error',reject);});
  return server.address().port;
}
const json=(res,doc)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(doc));};
test('HMAC proof: nonce, digest length, matching and mismatch',()=>{
  const token='a'.repeat(64),n=proof.nonce();
  assert.match(n,/^[0-9a-f]{32}$/);
  assert.equal(proof.validNonce(n),true);
  assert.equal(proof.validNonce('zz'),false);
  assert.equal(proof.validNonce('ab'),false);
  const p=proof.proofOf(token,n);
  assert.match(p,/^[0-9a-f]{64}$/);
  assert.equal(proof.check(token,n,p),true);
  assert.equal(proof.check(token,n,'0'.repeat(64)),false);
  assert.equal(proof.check('b'.repeat(64),n,p),false);
  assert.equal(proof.equal(p,p),true);
  assert.equal(proof.equal(p,'0'.repeat(64)),false);
  assert.equal(proof.equal('ab','abcd'),false);
});
test('v2 proof is bound to a context label and the port; v1 is not a v2 proof',()=>{
  const token='a'.repeat(64),n=proof.nonce();
  const v2=proof.proofV2(token,4174,n);
  assert.match(v2,/^[0-9a-f]{64}$/);
  assert.equal(v2,require('node:crypto').createHmac('sha256',token).update(`cr-challenge-v2|4174|${n}`).digest('hex'));
  assert.equal(proof.proofV2(token,'4174',n),v2,'a port given as text is the same port');
  assert.notEqual(proof.proofV2(token,4175,n),v2);
  assert.notEqual(proof.proofOf(token,n),v2);
  assert.equal(proof.checkV2(token,4174,n,v2),true);
  assert.equal(proof.checkV2(token,4175,n,v2),false);
  assert.equal(proof.checkV2(token,4174,n,proof.proofOf(token,n)),false);
  assert.equal(proof.checkV2('b'.repeat(64),4174,n,v2),false);
});
test('One client implementation: the extension ships it, the receiver re-exports it, the extension never requires receiver/',()=>{
  for(const k of ['nonce','proofV2','equal','checkV2','verifyServer'])assert.equal(proof[k],client[k],k);
  assert.match(fs.readFileSync(path.join(ROOT,'scripts/package-vsix.js'),'utf8'),/const FILES=\[[^\]]*'proof\.js'/);
  for(const f of fs.readdirSync(path.join(ROOT,'extension')).filter(f=>f.endsWith('.js'))){
    const src=fs.readFileSync(path.join(ROOT,'extension',f),'utf8');
    assert(!/require\(['"]\.\.\//.test(src),`${f} requires outside extension/`);
  }
  for(const f of ['extension/outbox.js','extension/extension.js'])assert.match(fs.readFileSync(path.join(ROOT,f),'utf8'),/require\('\.\/proof'\)/,f);
  for(const f of ['scripts/hooks/claude-code.js','scripts/hooks/cursor.js','scripts/hooks/codex.js','scripts/event.js','scripts/demo.js','scripts/up.js','scripts/pair.js'])
    assert.match(fs.readFileSync(path.join(ROOT,f),'utf8'),/require\('(?:\.\.\/)+receiver\/proof'\)/,f);
});
test('The receiver answers v1 for older extensions and v2 for the port the request arrived on',async t=>{
  const dir=tempDir(t,'cr-proof-v-');
  const svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  const base=`http://127.0.0.1:${svc.port}`,n=proof.nonce();
  const v1=await (await fetch(`${base}/v1/challenge?nonce=${n}`)).json();
  assert.deepEqual(v1,{ok:true,proof:proof.proofOf(svc.token,n)});
  const v2=await (await fetch(`${base}/v1/challenge?nonce=${n}&v=2`)).json();
  assert.deepEqual(v2,{ok:true,v:2,proof:proof.proofV2(svc.token,svc.port,n)});
  assert(!JSON.stringify([v1,v2]).includes(svc.token));
  assert.equal((await fetch(`${base}/v1/challenge?nonce=${n}&v=3`)).status,400);
  assert.equal((await fetch(`${base}/v1/challenge?v=2`)).status,400);
});
test('verifyServer accepts a real receiver and refuses a garbage proof, a 404 and a dead port',async t=>{
  const dir=tempDir(t,'cr-proof-');
  const svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  assert.equal(await proof.verifyServer(svc.port,svc.token),true);
  assert.equal(await proof.verifyServer(String(svc.port),svc.token),true);
  await assert.rejects(()=>proof.verifyServer(svc.port,'f'.repeat(64)),{code:'challenge-mismatch'});
  const fake=await occupy(t,(req,res)=>{
    if(new URL(req.url,'http://127.0.0.1').pathname==='/v1/challenge'){json(res,{ok:true,v:2,proof:'0'.repeat(64)});return;}
    res.writeHead(404);res.end();
  });
  await assert.rejects(()=>proof.verifyServer(fake,'a'.repeat(64)),{code:'challenge-mismatch'});
  const missing=await occupy(t,(req,res)=>{res.writeHead(404);res.end();});
  await assert.rejects(()=>proof.verifyServer(missing,'a'.repeat(64)),{code:'challenge-refused'});
  const closed=http.createServer();
  await new Promise(r=>closed.listen(0,'127.0.0.1',r));const gone=closed.address().port;await new Promise(r=>closed.close(r));
  await assert.rejects(()=>proof.verifyServer(gone,'a'.repeat(64)),{code:'challenge-unreachable'});
  await assert.rejects(()=>proof.verifyServer(0,'a'.repeat(64)),{code:'challenge-unreachable'});
  const silent=await occupy(t,()=>{});
  await assert.rejects(()=>proof.verifyServer(silent,'a'.repeat(64),200),{code:'challenge-unreachable'});
  assert.equal(fs.existsSync(path.join(dir,'receiver-auth.json')),true);
});
test('A foreign occupant cannot pass by redirecting or relaying to a real receiver on another port, or by a v1 answer',async t=>{
  const dir=tempDir(t,'cr-proof-relay-');
  const svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  const real=`http://127.0.0.1:${svc.port}`;
  const seen=[];
  const record=req=>seen.push({url:req.url,auth:req.headers.authorization||null});
  const redirect=await occupy(t,(req,res)=>{record(req);res.writeHead(302,{Location:real+req.url});res.end();});
  const relay=await occupy(t,async(req,res)=>{record(req);const r=await fetch(real+req.url);res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());});
  // An occupant that strips v=2 gets the 0.7.1 proof, valid for the token but not bound to any port.
  const downgrade=await occupy(t,async(req,res)=>{record(req);const u=new URL(req.url,'http://127.0.0.1');u.searchParams.delete('v');
    const doc=await (await fetch(`${real}${u.pathname}${u.search}`)).json();json(res,{...doc,v:2});});
  for(const impl of [proof,client]){
    await assert.rejects(()=>impl.verifyServer(redirect,svc.token),{code:'challenge-refused'});
    await assert.rejects(()=>impl.verifyServer(relay,svc.token),{code:'challenge-mismatch'});
    await assert.rejects(()=>impl.verifyServer(downgrade,svc.token),{code:'challenge-mismatch'});
    assert.equal(await impl.verifyServer(svc.port,svc.token),true);
  }
  assert.equal(seen.length,6);
  assert(seen.every(x=>x.auth===null&&/^\/v1\/challenge\?nonce=[0-9a-f]{32}&v=2$/.test(x.url)),JSON.stringify(seen));
});

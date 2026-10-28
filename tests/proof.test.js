'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const proof=require('../receiver/proof');
const {tempDir,startService}=require('./helpers');
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
test('verifyServer accepts a real receiver and refuses a garbage proof',async t=>{
  const dir=tempDir(t,'cr-proof-');
  const svc=await startService(t,{port:0,dataDir:dir,quiet:true});
  await proof.verifyServer(svc.port,svc.token);
  await assert.rejects(()=>proof.verifyServer(svc.port,'f'.repeat(64)),{code:'challenge-mismatch'});
  const fake=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    if(u.pathname==='/v1/challenge'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,proof:'0'.repeat(64)}));return;}
    res.writeHead(404);res.end();
  });
  t.after(()=>new Promise(r=>fake.close(()=>r())));
  await new Promise((resolve,reject)=>{fake.listen(0,'127.0.0.1',resolve);fake.on('error',reject);});
  const port=fake.address().port;
  await assert.rejects(()=>proof.verifyServer(port,'a'.repeat(64)),{code:'challenge-mismatch'});
  const missing=http.createServer((req,res)=>{res.writeHead(404);res.end();});
  t.after(()=>new Promise(r=>missing.close(()=>r())));
  await new Promise((resolve,reject)=>{missing.listen(0,'127.0.0.1',resolve);missing.on('error',reject);});
  await assert.rejects(()=>proof.verifyServer(missing.address().port,'a'.repeat(64)),{code:'challenge-refused'});
  assert.equal(fs.existsSync(path.join(dir,'receiver-auth.json')),true);
});

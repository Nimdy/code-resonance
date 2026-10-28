'use strict';
// Loopback token proof: the occupant of the port must HMAC the local receiver token over a client nonce before any
// client sends Authorization. GET /v1/challenge is an oracle of HMAC-SHA256(token, nonce) on loopback; the token is a
// 256-bit random value, so that is acceptable. A process that only mimics /health cannot mint a pairing code.
const crypto=require('node:crypto');
const NONCE=/^[0-9a-f]{32}$/;
const PROOF=/^[0-9a-f]{64}$/;
function nonce(){return crypto.randomBytes(16).toString('hex');}
function validNonce(s){return typeof s==='string'&&NONCE.test(s);}
function proofOf(token,n){return crypto.createHmac('sha256',String(token)).update(String(n)).digest('hex');}
function equal(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);
}
function check(token,n,offered){return validNonce(n)&&PROOF.test(String(offered||''))&&equal(offered,proofOf(token,n));}
async function verifyServer(port,token,timeoutMs=3000){
  const n=nonce();
  let r;
  try{r=await fetch(`http://127.0.0.1:${port}/v1/challenge?nonce=${n}`,{signal:AbortSignal.timeout(timeoutMs)});}
  catch{const e=new Error(`The process on port ${port} did not answer a token challenge.`);e.code='challenge-unreachable';throw e;}
  if(!r.ok){const e=new Error(`The process on port ${port} did not prove it holds this receiver's token (HTTP ${r.status}).`);e.code='challenge-refused';throw e;}
  let body;try{body=await r.json();}catch{body=null;}
  if(!body||body.ok!==true||!check(token,n,body.proof)){
    const e=new Error(`The process on port ${port} did not prove it holds this receiver's token.`);e.code='challenge-mismatch';throw e;
  }
  return true;
}
module.exports={nonce,validNonce,proofOf,equal,check,verifyServer};

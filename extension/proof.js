'use strict';
// Loopback token proof, the client side: every program that sends the receiver's token (this extension's outbox and
// pairing link, npm run up / pair, the agent hooks, the event and demo CLIs) first asks the occupant of the port to
// return HMAC-SHA256(token, `cr-challenge-v2|<port>|<nonce>`) for the port it connected to. The receiver answers it in
// receiver/proof.js, which re-exports this file (the VSIX ships only extension/, as for filters.js). One raw http GET:
// a redirect is never followed, so a process on one port cannot send the client to a real receiver on another, and an
// answer relayed from another port names that port.
const crypto=require('node:crypto');
const http=require('node:http');
const CONTEXT='cr-challenge-v2';
const NONCE=/^[0-9a-f]{32}$/;
const PROOF=/^[0-9a-f]{64}$/;
const BODY_LIMIT=4096;
function nonce(){return crypto.randomBytes(16).toString('hex');}
function proofV2(token,port,n){return crypto.createHmac('sha256',String(token)).update(`${CONTEXT}|${Number(port)}|${n}`).digest('hex');}
function equal(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);
}
function checkV2(token,port,n,offered){return NONCE.test(String(n))&&PROOF.test(String(offered||''))&&equal(offered,proofV2(token,port,n));}
function failure(code,message){return Object.assign(new Error(message),{code});}
// Resolves true only for an occupant that proved it holds `token`; otherwise rejects with code challenge-unreachable
// (nothing answered in time), challenge-refused (any status but 200, a redirect included) or challenge-mismatch.
function verifyServer(port,token,timeoutMs=3000){
  const p=Number(port),n=nonce();
  return new Promise((resolve,reject)=>{
    const unreachable=()=>reject(failure('challenge-unreachable',`The process on port ${port} did not answer a token challenge.`));
    if(!Number.isInteger(p)||p<1||p>65535){unreachable();return;}
    const req=http.get({hostname:'127.0.0.1',port:p,path:`/v1/challenge?nonce=${n}&v=2`,timeout:timeoutMs,headers:{Accept:'application/json'}},res=>{
      let body='';res.setEncoding('utf8');
      res.on('data',c=>{body+=c;if(body.length>BODY_LIMIT)req.destroy(new Error('Challenge answer too large'));});
      res.on('error',unreachable);
      res.on('end',()=>{
        if(res.statusCode!==200){reject(failure('challenge-refused',`The process on port ${port} did not prove it holds this receiver's token (HTTP ${res.statusCode}).`));return;}
        let doc=null;try{doc=JSON.parse(body);}catch{}
        if(!doc||doc.ok!==true||doc.v!==2||!checkV2(token,p,n,doc.proof)){reject(failure('challenge-mismatch',`The process on port ${port} did not prove it holds this receiver's token.`));return;}
        resolve(true);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Challenge timeout')));
    req.on('error',unreachable);
  });
}
module.exports={CONTEXT,nonce,proofV2,equal,checkV2,verifyServer};

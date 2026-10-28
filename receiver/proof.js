'use strict';
// Loopback token proof, the receiver's side. GET /v1/challenge?nonce=<32 hex>&v=2 answers
// HMAC-SHA256(token, `cr-challenge-v2|<port>|<nonce>`) for the port the request arrived on: what every client asks for
// and checks (extension/proof.js, re-exported here so scripts and hooks share the one implementation). Without v=2 it
// answers the 0.7.1 form, HMAC-SHA256(token, nonce), for extensions installed before; no client of this version accepts
// it. Either is an oracle of an HMAC on loopback; the token is a 256-bit random value, so that is acceptable.
const crypto=require('node:crypto');
const client=require('../extension/proof');
const NONCE=/^[0-9a-f]{32}$/;
const PROOF=/^[0-9a-f]{64}$/;
function validNonce(s){return typeof s==='string'&&NONCE.test(s);}
function proofOf(token,n){return crypto.createHmac('sha256',String(token)).update(String(n)).digest('hex');}
function check(token,n,offered){return validNonce(n)&&PROOF.test(String(offered||''))&&client.equal(offered,proofOf(token,n));}
module.exports={...client,validNonce,proofOf,check};

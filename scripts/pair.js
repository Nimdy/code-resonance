#!/usr/bin/env node
'use strict';
// Prints a link that pairs one browser with the running receiver (once per browser), so it may change settings, visual
// identities, music, packs and integrations. The link carries a single-use code, valid 15 minutes, that the receiver
// exchanges for its pairing key; the key itself is never printed. Asking for a code needs the receiver's token, and the
// occupant must prove it holds that token (GET /v1/challenge) before this command sends Authorization.
//   node scripts/pair.js [--data <dir>] [--port <port>]
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const proof=require('../receiver/proof');
const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
const DATA=path.resolve(flag('data')||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
(async()=>{
  let auth=null;try{auth=JSON.parse(fs.readFileSync(path.join(DATA,'receiver-auth.json'),'utf8'));}catch{}
  if(!auth?.token){console.error(`No receiver token in ${DATA}: start the receiver once (npm start), then run this again.`);process.exitCode=1;return;}
  const port=Number(flag('port')||process.env.RESONANCE_PORT||auth.port||4174);
  try{await proof.verifyServer(port,auth.token);}
  catch(e){console.error(e.message.includes('did not answer')?`The receiver does not answer on http://127.0.0.1:${port}: start it (npm start), then run this again.`:e.message);process.exitCode=1;return;}
  let r;try{r=await fetch(`http://127.0.0.1:${port}/v1/pairing-code`,{method:'POST',headers:{Authorization:`Bearer ${auth.token}`},signal:AbortSignal.timeout(3000)});}
  catch{console.error(`The receiver does not answer on http://127.0.0.1:${port}: start it (npm start), then run this again.`);process.exitCode=1;return;}
  if(!r.ok){console.error(`The receiver refused (HTTP ${r.status}): is it a receiver from before 0.5, or another program on port ${port}?`);process.exitCode=1;return;}
  const {code}=await r.json();
  console.log(`Open this link in the browser you use for Code Resonance (it works once, within 15 minutes):\n\n  http://127.0.0.1:${port}/#pair=${code}\n`);
  if(/microsoft/i.test((()=>{try{return fs.readFileSync('/proc/version','utf8');}catch{return '';}})()))console.log(`From Windows (WSL): http://localhost:${port}/#pair=${code}\n`);
  console.log('Watching, the Stage, sound and recording need no pairing.');
})();

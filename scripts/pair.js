#!/usr/bin/env node
'use strict';
// Prints the private link that pairs a browser with the local receiver (once per browser), so it may change settings,
// visual identities, music, packs and integrations. The key is in receiver-auth.json, readable by your account only;
// anyone who has the link can change your configuration, so keep it to yourself.
//   node scripts/pair.js [--data <dir>]
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
const DATA=path.resolve(flag('data')||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
let auth=null;try{auth=JSON.parse(fs.readFileSync(path.join(DATA,'receiver-auth.json'),'utf8'));}catch{}
if(!auth?.pairing||!/^[0-9a-f]{64}$/.test(auth.pairing)){
  console.error(`No pairing key in ${path.join(DATA,'receiver-auth.json')}: start the receiver once (npm start), then run this again.`);process.exitCode=1;
}else{
  const port=Number(process.env.RESONANCE_PORT||auth.port||4174);
  console.log(`Open this private link in the browser you use for Code Resonance (once per browser):\n\n  http://127.0.0.1:${port}/#pair=${auth.pairing}\n`);
  console.log('Keep it to yourself: it lets a browser change your Code Resonance configuration. Watching, the Stage, sound and recording need no pairing.');
  if(/microsoft/i.test((()=>{try{return fs.readFileSync('/proc/version','utf8');}catch{return '';}})()))console.log(`From Windows (WSL): http://localhost:${port}/#pair=${auth.pairing}`);
}

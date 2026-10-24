#!/usr/bin/env node
'use strict';
// First-run and troubleshooting checks, read-only: Node version, the receiver (running? which port? token present and
// private?), projects received, visual packs (installed, approved, problems), and on WSL how to reach the player from
// Windows without opening the receiver to the network.
//   node scripts/doctor.js [--data <dir>] [--port <port>] [--json]
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const args=process.argv.slice(2);
const flag=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
const DATA=path.resolve(flag('data')||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
const results=[];
const report=(status,topic,message,fix='')=>results.push({status,topic,message,fix});
function wsl(){try{return /microsoft/i.test(fs.readFileSync('/proc/version','utf8'));}catch{return false;}}
(async()=>{
  const major=+process.versions.node.split('.')[0];
  report(major>=20?'ok':'problem','Node.js',`version ${process.version}`,major>=20?'':'Install Node.js 20 or later (22 is what CI uses).');
  // The receiver: the auth file records the port it last listened on.
  const authFile=path.join(DATA,'receiver-auth.json');let auth=null;
  try{auth=JSON.parse(fs.readFileSync(authFile,'utf8'));}catch{}
  const port=Number(flag('port')||process.env.RESONANCE_PORT||auth?.port||4174);
  if(!fs.existsSync(DATA))report('problem','Data directory',`${DATA} does not exist yet`,'Start the receiver once: npm start');
  else report('ok','Data directory',DATA);
  if(!auth)report('problem','Receiver token',`no ${path.basename(authFile)} in the data directory`,'Start the receiver once (npm start): it creates the token the extension and agent hooks use.');
  else{
    let mode='';if(process.platform!=='win32'){const m=fs.statSync(authFile).mode&0o777;mode=` (mode ${m.toString(8)})`;
      if(m&0o077)report('problem','Receiver token',`${authFile} is readable by other users${mode}`,`chmod 600 "${authFile}"`);}
    report('ok','Receiver token',`present${mode}; never share it, never put it in a URL`);
  }
  let health=null;
  try{const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(2000)});health=r.ok?await r.json():null;}catch{}
  if(!health)report('problem','Receiver',`nothing answers on http://127.0.0.1:${port}`,`Start it: npm start (or RESONANCE_PORT=<port> npm start). In VS Code: the CR status-bar item → Start Code Performance.`);
  else{
    report('ok','Receiver',`running: version ${health.version} on http://127.0.0.1:${port} (loopback only)`);
    try{const p=(await (await fetch(`http://127.0.0.1:${port}/api/projects`)).json()).projects||[];
      report(p.length?'ok':'note','Projects',p.length?`${p.length} received`:'none yet',p.length?'':'Open a trusted workspace in VS Code, click CR and accept local capture; or run npm run demo.');}catch{}
    try{const list=(await (await fetch(`http://127.0.0.1:${port}/api/packs`)).json()).packs||[];
      for(const k of list){const state=!k.ok?'problem':k.executable&&!k.trusted?'note':'ok';
        report(state,'Visual pack',`${k.id} ${k.version} (${k.kind}): ${!k.ok?`problem: ${(k.problems||[]).join('; ')}`:k.executable?(k.trusted?'approved':'installed, not approved'):'ready'}`,
          !k.ok?`Reinstall it: node scripts/pack.js install <its folder>`:k.executable&&!k.trusted?`Review and approve it: node scripts/pack.js approve ${k.id}, or REVIEW in the player's World DNA panel.`:'');}}catch{}
  }
  if(wsl()){
    let mode='NAT (default)';try{const ip=require('node:child_process').execFileSync('ip',['-4','-o','addr','show','eth0'],{encoding:'utf8'});if(!/inet 172\.(1[6-9]|2\d|3[01])\./.test(ip))mode='probably mirrored';}catch{}
    report('note','WSL2',`running inside WSL2 (networking: ${mode}, inferred from the address)`,
      `Keep the receiver on 127.0.0.1. From Windows open http://localhost:${port}/ : WSL2 forwards localhost by default (NAT mode, localhostForwarding) and shares it in mirrored mode. `+
      `Check from Windows PowerShell: Invoke-WebRequest http://localhost:${port}/health. If that fails, see docs/WSL.md. Never set RESONANCE_ALLOW_REMOTE=1 for this.`);
  }
  if(args.includes('--json')){console.log(JSON.stringify({data:DATA,port,results},null,2));}
  else for(const r of results)console.log(`${r.status==='ok'?'  ok  ':r.status==='note'?' note ':'  !!  '} ${r.topic}: ${r.message}${r.fix?`\n         → ${r.fix}`:''}`);
  process.exitCode=results.some(r=>r.status==='problem')?1:0;
})();

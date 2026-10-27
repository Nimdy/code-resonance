'use strict';
// Runs the interface qualification: every workspace suite (qualification/ui/workspaces/*.qual.js) and the cross-view
// acceptance suite, each in its own isolated receiver, a few at a time; prints a summary and writes
// qualification/results/ui/summary.json. Exit code 1 if any suite fails. No retries: a failure is a failure.
// Usage (from qualification/): node ui/run-all.js [--jobs 3] [--only home,visual] [--quick]
const path=require('node:path');
const fs=require('node:fs');
const cp=require('node:child_process');
const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
const JOBS=Math.max(1,Number(flag('jobs')||3)),ONLY=flag('only')?.split(','),QUICK=args.includes('--quick');
const OUT=path.join(__dirname,'..','results','ui');
const suites=[...fs.readdirSync(path.join(__dirname,'workspaces')).filter(f=>f.endsWith('.qual.js')).map(f=>({name:f.replace('.qual.js',''),file:path.join(__dirname,'workspaces',f)})),
  {name:'acceptance',file:path.join(__dirname,'acceptance.qual.js')}].filter(s=>!ONLY||ONLY.includes(s.name));
fs.mkdirSync(OUT,{recursive:true});
function run(s){return new Promise(resolve=>{const started=Date.now();let out='';
  const c=cp.spawn(process.execPath,[s.file,...(QUICK?['--quick']:[])],{cwd:path.join(__dirname,'..'),env:process.env});
  c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>out+=d);
  c.on('exit',code=>{const lines=out.split('\n'),pass=lines.filter(l=>l.startsWith('PASS')).length,fail=lines.filter(l=>l.startsWith('FAIL'));
    fs.writeFileSync(path.join(OUT,`${s.name}.log`),out);
    const r={suite:s.name,exitCode:code,pass,fail:fail.length,failures:fail.map(l=>l.slice(0,300)),seconds:Math.round((Date.now()-started)/1000)};
    console.log(`${code===0?'PASS':'FAIL'}  ${s.name}: ${pass} passed, ${fail.length} failed (${r.seconds} s)${code!==0&&!fail.length?' — exited without a FAIL line, see the log':''}`);
    for(const f of r.failures)console.log(`      ${f}`);resolve(r);});});}
(async()=>{
  const queue=suites.slice(),results=[];
  await Promise.all(Array.from({length:Math.min(JOBS,queue.length)},async()=>{while(queue.length)results.push(await run(queue.shift()));}));
  results.sort((a,b)=>a.suite.localeCompare(b.suite));
  const summary={at:new Date().toISOString(),node:process.version,quick:QUICK,suites:results,passed:results.every(r=>r.exitCode===0),checks:{pass:results.reduce((n,r)=>n+r.pass,0),fail:results.reduce((n,r)=>n+r.fail,0)}};
  fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(summary,null,2));
  console.log(`${summary.checks.pass} checks passed, ${summary.checks.fail} failed in ${results.length} suites`);
  process.exitCode=summary.passed?0:1;
})();

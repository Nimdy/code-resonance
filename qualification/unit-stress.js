'use strict';
// Repeats the unit and integration suite (the same command as `npm test`) many times, optionally while other processes
// keep every CPU core busy, and keeps the complete TAP output of every failing run. No retries: every run counts. Used to
// find timing-dependent tests (a failure seen twice under load, never captured, is what started this).
//
// node unit-stress.js [--runs 30] [--load 0] [--io 0] [--out results/unit-stress]
//   --load N   N busy processes (each spins one core) for the whole series
//   --io N     N processes writing and syncing 8 MB files without pause (disk pressure)
const path=require('node:path');
const fs=require('node:fs');
const cp=require('node:child_process');
const REPO=path.resolve(__dirname,'..');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const RUNS=+arg('runs',30),LOAD=+arg('load',0),IO=+arg('io',0);
const OUT=path.resolve(arg('out',path.join(__dirname,'results','unit-stress')));
const files=fs.readdirSync(path.join(REPO,'tests')).filter(f=>f.endsWith('.test.js')).sort().map(f=>path.join('tests',f));
function run(){
  return new Promise(resolve=>{
    const began=Date.now(),child=cp.spawn(process.execPath,['--test','--test-reporter=tap','--test-timeout=120000',...files],{cwd:REPO,env:{...process.env,FORCE_COLOR:'0'}});
    let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
    child.on('close',code=>resolve({code,ms:Date.now()-began,out}));
  });
}
// Failing tests from TAP: "not ok" lines with the names of the suites around them (indentation is nesting).
function failures(tap){
  const stack=[],found=[];
  for(const line of tap.split('\n')){
    const m=/^(\s*)(not ok|ok) \d+ - (.*?)(?: # .*)?$/.exec(line);if(!m)continue;
    const depth=m[1].length/4;stack.length=depth;stack[depth]=m[3];
    if(m[2]==='not ok')found.push(stack.slice(0,depth+1).join(' › '));
  }
  return found;
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const os=require('node:os'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'cr-stress-io-'));
  const writer=`const fs=require('fs'),b=Buffer.alloc(8<<20,7);for(let i=0;;i++){const f=require('path').join(${JSON.stringify(scratch)},process.pid+'-'+(i%4));const d=fs.openSync(f,'w');fs.writeSync(d,b);fs.fsyncSync(d);fs.closeSync(d);}`;
  const burners=[...Array.from({length:LOAD},()=>cp.spawn(process.execPath,['-e','for(;;){}'],{stdio:'ignore'})),...Array.from({length:IO},()=>cp.spawn(process.execPath,['-e',writer],{stdio:'ignore'}))];
  const cleanup=()=>{for(const b of burners)b.kill();fs.rmSync(scratch,{recursive:true,force:true});};
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{cleanup();process.exit(130);});
  const runs=[];
  try{
    for(let i=1;i<=RUNS;i++){
      const r=await run(),failed=failures(r.out),counts=Object.fromEntries(['tests','pass','fail','cancelled'].map(k=>[k,+((new RegExp(`^# ${k} (\\d+)`,'m').exec(r.out)||[])[1]||0)]));
      runs.push({run:i,exitCode:r.code,ms:r.ms,...counts,failed});
      if(r.code!==0){const f=path.join(OUT,`failure-load${LOAD}-io${IO}-run${String(i).padStart(2,'0')}.tap`);fs.writeFileSync(f,r.out);}
      console.log(`run ${i}/${RUNS} (load ${LOAD}, io ${IO}): exit ${r.code}, ${counts.pass}/${counts.tests} passed, ${(r.ms/1000).toFixed(1)} s${failed.length?` — FAILED: ${failed.join(' | ')}`:''}`);
    }
  }finally{cleanup();}
  const failedRuns=runs.filter(r=>r.exitCode!==0),byTest={};
  for(const r of failedRuns)for(const t of r.failed)byTest[t]=(byTest[t]||0)+1;
  const report={at:new Date().toISOString(),node:process.version,cpus:require('node:os').availableParallelism(),load:LOAD,io:IO,runs:RUNS,failedRuns:failedRuns.length,byTest,
    durationMs:{min:Math.min(...runs.map(r=>r.ms)),max:Math.max(...runs.map(r=>r.ms))},results:runs};
  fs.writeFileSync(path.join(OUT,`unit-stress-load${LOAD}-io${IO}.json`),JSON.stringify(report,null,2));
  console.log(`${RUNS-failedRuns.length}/${RUNS} runs passed with load ${LOAD}, io ${IO}${failedRuns.length?`; failing tests: ${JSON.stringify(byTest)}`:''}`);
  process.exitCode=failedRuns.length?1:0;
})();

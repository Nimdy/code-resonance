'use strict';
// A film renders from a temporary copy of the receiver's data (--copy). The copy holds receiver-auth.json and every
// journal, so it is removed however the process ends: normally, after an error, and on Ctrl-C, SIGTERM or SIGHUP, for
// which process.on('exit') alone never runs. On a signal `stop` (the browser and the receiver using the copy) runs
// first, for at most graceMs; a second signal meanwhile is ignored (npm run film forwards the one the terminal sent).
// No dependencies, so tests/film-copy.test.js runs it without a browser.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const SIGNALS=['SIGINT','SIGTERM','SIGHUP'];
function temporaryCopy(source,{stop=async()=>{},graceMs=5000,prefix='cr-film-'}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  const remove=()=>{try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch{}};
  process.on('exit',remove);
  let stopping=false;
  const onSignal=signal=>{
    if(stopping)return;stopping=true;
    const code=128+(os.constants.signals[signal]||1);process.exitCode=code;
    const finish=()=>{remove();process.exit(code);};
    setTimeout(finish,graceMs);
    Promise.resolve().then(stop).catch(()=>{}).finally(finish);
  };
  for(const s of SIGNALS)process.on(s,onSignal);
  try{fs.cpSync(source,dir,{recursive:true});}catch(e){remove();throw e;}
  return {dir,remove};
}
module.exports={temporaryCopy};

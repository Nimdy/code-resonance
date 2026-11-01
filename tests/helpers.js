'use strict';
// Test cleanup for receivers and their data directories. node:test runs a test's `after` hooks in the order they were
// registered and skips the rest once one throws, so "remove the directory" registered before "stop the receiver"
// raced with a receiver still writing (ENOTEMPTY), and the receiver left running kept the file alive until the 120 s
// timeout: the suite's intermittent failure. Here one hook per test stops every receiver the test started, then removes
// its directories (with retries).
const fs=require('node:fs'),fsp=require('node:fs/promises'),net=require('node:net'),os=require('node:os'),path=require('node:path');
const {createService}=require('../receiver/server');
const scopes=new WeakMap();
function scope(t){
  let s=scopes.get(t);if(s)return s;
  s={services:new Set(),dirs:[]};scopes.set(t,s);
  t.after(async()=>{
    await Promise.allSettled([...s.services].map(x=>x.stop()));
    for(const d of s.dirs)await fsp.rm(d,{recursive:true,force:true,maxRetries:5,retryDelay:50});
  });
  return s;
}
// A fresh temporary directory, removed after every receiver of the test has stopped.
function tempDir(t,prefix){const d=fs.mkdtempSync(path.join(os.tmpdir(),prefix));scope(t).dirs.push(d);return d;}
// A started receiver, stopped when the test ends (stop() may also be called earlier: it is idempotent).
async function startService(t,options){const svc=await createService(options).start();scope(t).services.add(svc);return svc;}
// A receiver created elsewhere (started later by the test), stopped when the test ends.
function track(t,svc){scope(t).services.add(svc);return svc;}
// A port for a process the test starts later, which binds it itself. A port from listen(0) is in the system's ephemeral
// range, which the connections of the other test files running at the same moment draw from, so one freed there could be
// taken before the receiver bound it (both receivers of a test then found it occupied). These come from below every
// platform's ephemeral range (Linux 32768, this WSL 44620, Windows 49152), at random, checked free, never twice in a file.
const usedPorts=new Set();
function freePort(){
  return new Promise((resolve,reject)=>{
    const attempt=n=>{
      if(n>=200)return reject(new Error('no free port between 20000 and 31999'));
      const port=20000+Math.floor(Math.random()*12000);if(usedPorts.has(port))return attempt(n+1);
      const s=net.createServer();s.once('error',()=>attempt(n+1));
      s.listen(port,'127.0.0.1',()=>s.close(()=>{usedPorts.add(port);resolve(port);}));
    };
    attempt(0);
  });
}
module.exports={tempDir,startService,track,freePort};

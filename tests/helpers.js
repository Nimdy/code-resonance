'use strict';
// Test cleanup for receivers and their data directories. node:test runs a test's `after` hooks in the order they were
// registered and skips the rest once one throws, so "remove the directory" registered before "stop the receiver"
// raced with a receiver still writing (ENOTEMPTY), and the receiver left running kept the file alive until the 120 s
// timeout: the suite's intermittent failure. Here one hook per test stops every receiver the test started, then removes
// its directories (with retries).
const fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
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
module.exports={tempDir,startService,track};

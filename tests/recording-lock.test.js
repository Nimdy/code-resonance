'use strict';
// The single-recorder lock (public/recording.js): claim() takes an exclusive Web Lock only if it is free, holds it
// until release(), and says why a window that lost the race may not record. The browser's own lock manager is what makes
// the claim atomic across windows (qualification/ui/workspaces/output.qual.js presses Record in two windows at the same
// instant); here a lock manager that follows the Web Locks rules checks the policy built on it.
const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {runInNewContext}=require('node:vm');const {join}=require('node:path');
function recordingModule(){
  const win={};runInNewContext(readFileSync(join(__dirname,'../public/recording.js'),'utf8'),{window:win,console,Promise,setTimeout},{filename:'recording.js'});
  return win.ResonanceRecording;
}
// Web Locks semantics for exclusive locks: a request with ifAvailable is granted at once if the name is free, otherwise
// its callback gets null; a granted lock is held until the callback's promise settles. Requests are processed in order.
function lockManager(){
  const held=new Map(),calls=[];
  return {calls,held,
    request(name,options,callback){calls.push({name,options:{...options}});
      return Promise.resolve().then(async()=>{
        if(held.has(name)){if(options.ifAvailable)return callback(null);throw new Error('this fake only models ifAvailable');}
        const lock={name,mode:options.mode||'exclusive'};held.set(name,lock);
        try{return await callback(lock);}finally{held.delete(name);}
      });},
    async query(){return {held:[...held.values()],pending:[]};}};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('two windows claiming at the same instant: exactly one may record, the other is told why',async()=>{
  const R=recordingModule(),locks=lockManager();
  const [a,b]=await Promise.all([R.claim(locks),R.claim(locks)]);
  assert.equal([a,b].filter(c=>c.ok).length,1);
  const lost=a.ok?b:a;
  assert.equal(lost.policy,'web-locks');
  assert.match(lost.reason,/Another window of this browser is already recording/);
  assert.match(lost.reason,/stop it there/);
  // Never a waiting request (that would start a second recording later, unasked): exclusive and only if available.
  for(const c of locks.calls){assert.equal(c.name,R.LOCK);assert.equal(c.options.ifAvailable,true);assert.equal(c.options.mode,'exclusive');}
  (a.ok?a:b).release();
});
test('the lock is held until release, then another window may record',async()=>{
  const R=recordingModule(),locks=lockManager();
  const first=await R.claim(locks);assert.equal(first.ok,true);assert.equal(first.policy,'web-locks');
  assert.equal(await R.held(locks),true);
  await tick();
  assert.equal((await R.claim(locks)).ok,false,'still held while recording');
  first.release();await tick();await tick();
  assert.equal(await R.held(locks),false);
  const next=await R.claim(locks);assert.equal(next.ok,true);
  // A second release is harmless.
  next.release();next.release();await tick();await tick();
  assert.equal(await R.held(locks),false);
});
test('release() settles once the lock is really free: the window announces its stop only then',async()=>{
  const R=recordingModule(),locks=lockManager();
  const first=await R.claim(locks);assert.equal(first.ok,true);
  await first.release();
  assert.equal(await R.held(locks),false,'free as soon as release() settled');
  const next=await R.claim(locks);assert.equal(next.ok,true,'another window takes it at once');
  await next.release();
  // Without Web Locks release() is a settled promise too, so callers can always await it.
  const c=await R.claim(undefined);assert.ok(c.release() instanceof Promise);
});
test('many windows racing, many rounds: never two holders',async()=>{
  const R=recordingModule(),locks=lockManager();
  for(let round=0;round<50;round++){
    const claims=await Promise.all(Array.from({length:5},()=>R.claim(locks)));
    assert.equal(claims.filter(c=>c.ok).length,1,`round ${round}`);
    claims.find(c=>c.ok).release();await tick();await tick();
  }
});
test('without Web Locks the windows’ announcements are all there is, and the policy says so',async()=>{
  const R=recordingModule();
  const c=await R.claim(undefined);
  assert.equal(c.ok,true);assert.equal(c.policy,'announcements');c.release();
  assert.equal(await R.held(undefined),null);
});
test('a lock manager that refuses (a sandboxed or opaque origin) does not block recording',async()=>{
  const R=recordingModule();
  const c=await R.claim({request:()=>Promise.reject(new Error('SecurityError: The request was denied.'))});
  assert.equal(c.ok,true);assert.equal(c.policy,'announcements');assert.match(c.error,/SecurityError/);
  assert.equal(await R.held({query:()=>Promise.reject(new Error('denied'))}),null);
});

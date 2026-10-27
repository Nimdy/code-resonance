'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createControl,SCOPES}=require('../receiver/control');
const ORIGINS=['http://localhost:4174','http://127.0.0.1:4174','http://[::1]:4174'];
// What a browser fetch() from the player page looks like to the receiver.
const req=({address='127.0.0.1',headers={}}={})=>({socket:{remoteAddress:address},headers:{origin:'http://127.0.0.1:4174','sec-fetch-site':'same-origin','sec-fetch-dest':'empty',...headers}});
const use=(capability,extra={})=>req({...extra,headers:{'x-resonance-capability':capability,...(extra.headers||{})}});
function clock(start=1e12){let t=start;const now=()=>t;now.advance=ms=>{t+=ms;};return now;}
test('A session is issued to a loopback, same-origin fetch and verifies on later requests',()=>{
  const control=createControl({now:clock()});
  for(const address of ['127.0.0.1','::1','::ffff:127.0.0.1']){
    const r=control.issue(req({address}),ORIGINS);
    assert.equal(r.ok,true,address);assert.match(r.capability,/^[0-9a-f]{64}$/);assert.deepEqual(r.scopes,[...SCOPES]);
    assert.equal(control.verify(use(r.capability,{address}),ORIGINS).ok,true);
  }
  // Fetch metadata is optional (older browsers, curl with an Origin): absent headers are not a refusal.
  assert.equal(control.issue({socket:{remoteAddress:'127.0.0.1'},headers:{origin:'http://localhost:4174'}},ORIGINS).ok,true);
  assert.equal(control.count(),4);
});
test('Sessions are refused to remote sockets, other or missing origins and cross-site or non-fetch requests',()=>{
  const control=createControl();
  const refused=(r,code)=>{const x=control.issue(r,ORIGINS);assert.equal(x.ok,false);assert.equal(x.status,403);assert.equal(x.code,code);assert.equal(x.capability,undefined);};
  // Headers cannot make a LAN client look local: only the socket address counts.
  refused(req({address:'192.168.1.20',headers:{'x-forwarded-for':'127.0.0.1',host:'127.0.0.1:4174'}}),'remote-refused');
  refused(req({address:'10.0.0.5'}),'remote-refused');
  refused({socket:{},headers:{origin:'http://127.0.0.1:4174'}},'remote-refused');
  refused(req({headers:{origin:undefined}}),'origin-refused');
  refused(req({headers:{origin:'http://evil.example'}}),'origin-refused');
  refused(req({headers:{origin:'null'}}),'origin-refused'); // the sandboxed pack frame
  refused(req({headers:{origin:'http://127.0.0.1:4175'}}),'origin-refused');
  for(const site of ['cross-site','same-site','none'])refused(req({headers:{'sec-fetch-site':site}}),'cross-site-refused');
  for(const dest of ['document','iframe','script'])refused(req({headers:{'sec-fetch-dest':dest}}),'cross-site-refused');
  assert.equal(control.count(),0);
});
test('Verification needs the exact live capability, the expected origin and a loopback socket',()=>{
  const control=createControl();
  const {capability}=control.issue(req(),ORIGINS);
  const denied=(r,code='capability-required')=>{const x=control.verify(r,ORIGINS);assert.equal(x.ok,false);assert.equal(x.status,401);assert.equal(x.code,code);};
  denied(req());
  denied(use(''));denied(use('nothex'));denied(use(capability.toUpperCase()));
  denied(use(capability.slice(0,-1)+(capability.at(-1)==='0'?'1':'0')));
  denied(use(capability,{address:'192.168.1.20'}));
  denied(use(capability,{headers:{origin:'http://evil.example'}}));
  denied(use(capability,{headers:{origin:undefined}}));
  assert.equal(control.verify(use(capability),ORIGINS).ok,true);
  // Another receiver's (or a restarted one's) capabilities mean nothing here.
  const other=createControl().issue(req(),ORIGINS).capability;denied(use(other));
});
test('A read (GET) may come without Origin, as browsers send same-origin GETs, but never cross-site or from another origin',()=>{
  const control=createControl();
  const {capability}=control.issue(req(),ORIGINS);
  // What Chromium sends for fetch('/api/status',{headers:{'X-Resonance-Capability':…}}) from the page: no Origin.
  const get=(headers={},address)=>({socket:{remoteAddress:address||'127.0.0.1'},headers:{'x-resonance-capability':capability,'sec-fetch-site':'same-origin','sec-fetch-dest':'empty',...headers}});
  assert.equal(control.read(get(),ORIGINS).ok,true);
  assert.equal(control.read(get({'sec-fetch-site':undefined,'sec-fetch-dest':undefined}),ORIGINS).ok,true,'no fetch metadata (older browsers)');
  assert.equal(control.read(get({origin:'http://127.0.0.1:4174'}),ORIGINS).ok,true);
  for(const headers of [{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'},{origin:'http://evil.example'},{origin:'null'},{'x-resonance-capability':'0'.repeat(64)}])
    assert.equal(control.read(get(headers),ORIGINS).ok,false,JSON.stringify(headers));
  assert.equal(control.read(get({},'192.168.1.20'),ORIGINS).ok,false,'remote socket');
  // A mutation still needs the Origin a browser always sends with a POST.
  assert.equal(control.verify(get(),ORIGINS).ok,false);
});
test('The TTL slides with each verified use; an expired capability is refused as expired',()=>{
  const now=clock(),control=createControl({ttlMs:1000,now});
  const {capability,expiresAt}=control.issue(req(),ORIGINS);
  assert.equal(expiresAt,now()+1000);
  for(let i=0;i<5;i++){now.advance(900);const r=control.verify(use(capability),ORIGINS);assert.equal(r.ok,true);assert.equal(r.expiresAt,now()+1000);}
  now.advance(1000);
  const r=control.verify(use(capability),ORIGINS);
  assert.equal(r.ok,false);assert.equal(r.status,401);assert.equal(r.code,'capability-expired');
  assert.equal(control.count(),0);
  // A failed attempt does not extend anything.
  assert.equal(control.verify(use(capability),ORIGINS).code,'capability-expired');
});
test('At most max capabilities live: expired ones go first, then the least recently used',()=>{
  const now=clock(),control=createControl({max:3,ttlMs:10000,now});
  const caps=[0,1,2].map(()=>{now.advance(1);return control.issue(req(),ORIGINS).capability;});
  assert.equal(control.verify(use(caps[0]),ORIGINS).ok,true); // caps[1] is now the least recently used
  const fourth=control.issue(req(),ORIGINS).capability;
  assert.equal(control.count(),3);
  assert.equal(control.verify(use(caps[1]),ORIGINS).code,'capability-required');
  for(const c of [caps[0],caps[2],fourth])assert.equal(control.verify(use(c),ORIGINS).ok,true);
  // An expired entry makes room before any live one is evicted.
  const short=createControl({max:2,ttlMs:100,now});
  const a=short.issue(req(),ORIGINS).capability;now.advance(50);const b=short.issue(req(),ORIGINS).capability;now.advance(60);
  short.issue(req(),ORIGINS);
  assert.equal(short.verify(use(b),ORIGINS).ok,true);assert.equal(short.verify(use(a),ORIGINS).code,'capability-required');
  // Many sessions never grow the store beyond max.
  for(let i=0;i<200;i++)control.issue(req(),ORIGINS);
  assert.equal(control.count(),3);
});

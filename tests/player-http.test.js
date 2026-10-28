'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs/promises');
const {tempDir,startService}=require('./helpers');
const {sha}=require('../receiver/protocol');
const projectId=sha('viewer-security');
test('Standalone assets, OBS mode, derived performance API and privacy boundary',async t=>{
 const directory=tempDir(t,'resonance-player-');
 const service=await startService(t,{port:0,dataDir:directory,sortIntervalMs:600000});
 const url=`http://127.0.0.1:${service.port}`;
 const requests=await Promise.all(['/', '/app.js','/music.js','/score.js','/style.css','/?overlay=1','/recording.js','/providers.js'].map(p=>fetch(url+p)));
 for(const r of requests)assert.equal(r.status,200);
 // OBS applies a Browser Source's custom CSS inline: allowed in the OBS view only; scripts stay 'self' everywhere.
 const csp=r=>r.headers.get('content-security-policy');
 assert.match(csp(requests[5]),/style-src 'self' 'unsafe-inline';/);assert.match(csp(requests[0]),/style-src 'self';/);
 for(const r of requests)assert.match(csp(r),/script-src 'self';/);
 const document=await requests[0].text(),js=await requests[1].text();
 // The Control Center: the engine's stage layer and the interface modules (served under /ui/ with the same policy).
 assert.match(document,/<title>Code Resonance<\/title>/);assert.match(document,/id="stageHost"/);assert.match(document,/src="\/ui\/main\.js"/);
 assert.match(js,/drawNebula/);assert.match(js,/ResonanceRecording/);assert.match(js,/window\.ResonancePlayer=/);
 for(const p of ['/ui/main.js','/ui/store.js','/ui/workspaces/stage.js','/ui/css/stage.css']){const r=await fetch(url+p);assert.equal(r.status,200,p);assert.match(csp(r),/script-src 'self';/);}
 assert.equal((await fetch(url+'/ui/workspaces/nope.js')).status,404);
 assert.match(await requests[6].text(),/MediaRecorder[\s\S]*captureStream/);
 const secret='DO_NOT_EXPOSE_ME_IN_THE_PUBLIC_GRAPH_OR_EXPORT';
 const evt={id:'viewer-security-01',projectId,sessionId:'case',kind:'document.snapshot',origin:'test',ts:1750000000000,
   file:'src/internal.ts',content:`export const hidden = "${secret}";`,meta:{reason:'edit'}};
 let r=await fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${service.token}`},body:JSON.stringify({events:[evt]})});
 assert.equal(r.status,202);
 r=await fetch(url+`/v1/flush?id=${projectId}`,{method:'POST',headers:{'Authorization':`Bearer ${service.token}`}});assert.equal(r.status,200);
 for(const endpoint of [`/api/project?id=${projectId}`,`/api/replay?id=${projectId}`,`/v1/performance/frames?id=${projectId}`,`/api/export?id=${projectId}`]){
   r=await fetch(url+endpoint);assert.equal(r.status,200);
   const publicView=await r.text();assert(!publicView.includes(secret));assert(!publicView.includes('src/internal.ts'));
 }
 const raw=await fs.readFile(path.join(directory,'projects',sha(projectId),'events.jsonl'),'utf8');
 assert(!raw.includes(secret));assert(raw.includes('contentHash'));
});

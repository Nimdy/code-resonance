'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs/promises');
const {runInNewContext}=require('node:vm');
const {tempDir,startService}=require('./helpers');
const {sha}=require('../receiver/protocol');
const store=require('../receiver/store');
const projectId=sha('viewer-security');
// The served engine on stand-ins for the browser: nothing is drawn, and a request never answers unless `fetch` does.
function engine(js,search,fetch=()=>new Promise(()=>{})){
  const any=new Proxy(function(){},{get:(_,k)=>k==='then'||typeof k==='symbol'?undefined:any,apply:()=>any,construct:()=>any});
  const window={ResonanceMusic:function(){return any;},ResonanceRecording:any,ResonanceScore:any};
  runInNewContext(js,{window,document:{getElementById:()=>any,body:{dataset:{},classList:any},documentElement:{dataset:{}}},location:{search,hash:'',pathname:'/'},
    URLSearchParams,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},addEventListener(){},setInterval(){},setTimeout,clearTimeout,requestAnimationFrame(){},
    queueMicrotask,fetch,console,performance,devicePixelRatio:1},{filename:'app.js'});
  return window.ResonancePlayer;
}
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
 assert.match(js,/ResonanceRecording/);assert.match(js,/window\.ResonancePlayer=/);
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
test('Nexus and Nebula, retired: an OBS bookmark or a stored choice that names one shows Monolith; three worlds are offered',async t=>{
  const service=await startService(t,{port:0,dataDir:tempDir(t,'resonance-player-'),sortIntervalMs:600000});
  const url=`http://127.0.0.1:${service.port}`,js=await (await fetch(url+'/app.js')).text();
  for(const w of ['nexus','nebula']){
    assert.equal((await fetch(`${url}/?overlay=1&sound=1&world=${w}`)).status,200);
    const P=engine(js,`?overlay=1&world=${w}`);assert.equal(P.state.world,'city',`?world=${w}`);
  }
  const P=engine(js,'?overlay=1');
  assert.deepEqual([...P.WORLDS],store.WORLDS,'the engine offers what the receiver accepts');
  for(const [w,shown] of Object.entries(store.RETIRED_WORLDS))assert.equal(P.worldOf(w),shown);
  assert.deepEqual(['living','construct','city','mars','__proto__',null].map(P.worldOf),['living','construct','city',null,null,null]);
  assert.equal(P.state.world,'living');P.setWorld('nebula');assert.equal(P.state.world,'city');P.setWorld('mars');assert.equal(P.state.world,'city');
  // The interface store on that engine: a pinned retired world resolves to Monolith from the URL, and choices a browser
  // kept before 0.5 (here Nebula) move to the receiver as Monolith, which it accepts.
  const posts=[],answer=(body,status=200)=>Promise.resolve({ok:status<400,status,json:async()=>body,headers:{get:()=>''}});
  const legacy={'code-resonance-player-v1':JSON.stringify({world:'nebula',style:'pulse'})};
  const pinned=engine(js,'?world=nexus',(u,init)=>u==='/api/session'?answer({capability:'c'}):u==='/api/settings'&&init?.method==='POST'?(posts.push(JSON.parse(init.body)),answer({...store.SETTINGS_DEFAULTS,revision:1})):answer({}));
  const saved={setInterval:globalThis.setInterval};t.after(()=>{globalThis.setInterval=saved.setInterval;});
  Object.assign(globalThis,{window:{ResonancePlayer:pinned},location:{search:'?world=nexus'},document:{documentElement:{dataset:{}}},addEventListener(){},setInterval:()=>0,
    localStorage:{getItem:k=>legacy[k]??null,setItem(){},removeItem(k){delete legacy[k];}},EventSource:class{addEventListener(){}close(){}},
    fetch:async u=>answer(u==='/api/projects'?{projects:[]}:u==='/api/settings'?{schema:'code-resonance.settings.v1',revision:0,...store.SETTINGS_DEFAULTS}:{})});
  const S=await import('../public/ui/store.js');
  await S.start();
  assert.deepEqual([S.effective().world,S.effective().sources.world],['city','url']);assert.equal(pinned.state.world,'city');
  assert.deepEqual(posts.map(b=>b.patch.stage),[{world:'city'}]);assert.equal(legacy['code-resonance-player-v1'],undefined,'moved once');
});

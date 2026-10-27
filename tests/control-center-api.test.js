'use strict';
// The Control Center's receiver API, end to end on a real receiver: control capabilities, settings / preferences /
// presets, recipe batches and previews, pack import → install → approve → remove, change notifications, capture
// evidence, status, documentation, the Claude Code hook plan/apply, and what public responses never contain.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {sha}=require('../receiver/protocol');
const {crc32}=require('../receiver/pack-import');
const {translate}=require('../scripts/hooks/claude-code');
const {EVENTS}=require('../scripts/hooks/install-claude-code');
const {tempDir,startService}=require('./helpers');
const EXAMPLES=path.join(__dirname,'../packs/examples');
const NAME='secret-project-name',FILE='src/secret-dir/hidden-file.ts';
const ADMIN=['/api/recipe','/api/recipe/preview','/api/packs/trust','/api/packs/import','/api/packs/install','/api/packs/discard','/api/packs/remove',
  '/api/settings','/api/preferences','/api/presets','/api/integrations/claude/plan','/api/integrations/claude/apply'];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// A path as it appears in text and inside JSON (where Windows backslashes are escaped).
const forms=p=>[p,JSON.stringify(p).slice(1,-1)];
// A minimal ZIP writer (stored and deflated entries) for import tests.
function zip(entries){
  const parts=[],central=[];let offset=0;
  for(const {name:n,data:d} of entries){
    const name=Buffer.from(n,'utf8'),data=Buffer.from(d),method=data.length>64?8:0,packed=method?zlib.deflateRawSync(data):data,crc=crc32(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(3<<8|20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(method,10);
    c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE((0o100644<<16)>>>0,38);c.writeUInt32LE(offset,42);
    parts.push(local,name,packed);central.push(c,name);offset+=30+name.length+packed.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,cd,end]);
}
function filesOf(dir,prefix=''){const out=[];
  const walk=rel=>{for(const d of fs.readdirSync(path.join(dir,rel),{withFileTypes:true})){const r=rel?`${rel}/${d.name}`:d.name;
    if(d.isDirectory())walk(r);else out.push({name:prefix+r,data:fs.readFileSync(path.join(dir,r))});}};
  walk('');return out;}
// A receiver with one sorted project (its private name and a file path were sent in its events).
async function start(t,{events=true}={}){
  const dir=tempDir(t,'cr-cc-api-');
  const svc=await startService(t,{port:0,dataDir:dir});
  const base=`http://127.0.0.1:${svc.port}`,projectId=sha('control-center-api');let seq=0;
  const ev=(kind,x={})=>({v:1,id:`cc-${String(++seq).padStart(6,'0')}-xxxxxxxx`,ts:Date.now(),kind,projectId,sessionId:'editor-session-1',origin:'test',...x});
  const post=async list=>{const r=await fetch(`${base}/v1/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events:list})});
    assert.equal(r.status,202,await r.text());};
  if(events){
    await post([ev('workspace.started',{name:NAME}),...Array.from({length:7},(_,i)=>ev('document.snapshot',{file:i?`src/part${i%2}/m${i}.ts`:FILE,content:`export function f${i}(){ return ${i}; }\n`,meta:{reason:'edit'}}))]);
    await svc.flush(projectId);
  }
  const paired={'Content-Type':'application/json'},pairBody=()=>JSON.stringify({pairing:svc.pairing});
  const session=async(origin=base)=>{const r=await fetch(`${base}/api/session`,{method:'POST',headers:{Origin:origin,...paired},body:pairBody()});assert.equal(r.status,200);return (await r.json()).capability;};
  const capability=await session();
  const send=(route,body,{cap=capability,headers={}}={})=>fetch(base+route,{method:'POST',
    headers:{'Content-Type':'application/json',Origin:base,...(cap?{'X-Resonance-Capability':cap}:{}),...headers},body:Buffer.isBuffer(body)||typeof body==='string'?body:JSON.stringify(body)});
  const get=async(route,headers={})=>{const r=await fetch(base+route,{headers});assert.equal(r.status,200,`${route}: ${r.status}`);return r.json();};
  return {pairBody,svc,dir,base,projectId,ev,post,session,capability,send,get};
}
// The change stream, read with fetch and a reader: every `data:` message and the `hello` event, parsed.
async function changeStream(base){
  const ac=new AbortController(),r=await fetch(`${base}/api/changes`,{signal:ac.signal});
  assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^text\/event-stream/);
  const reader=r.body.getReader(),dec=new TextDecoder(),messages=[];let buf='';
  (async()=>{try{for(;;){const {value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
    while((i=buf.indexOf('\n\n'))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);const data=/^data: (.*)$/m.exec(block)?.[1];
      if(data)messages.push({event:/^event: (.*)$/m.exec(block)?.[1]||'message',data:JSON.parse(data)});}}}catch{}})();
  async function until(pred,what,ms=15000){const t0=Date.now();for(;;){const m=messages.find(pred);if(m)return m;if(Date.now()-t0>ms)throw new Error(`no change event: ${what}`);await delay(25);}}
  return {messages,until,close:()=>ac.abort()};
}
test('Control sessions are issued only to the receiver\'s own page; every administrative route refuses without a valid capability',async t=>{
  const {base,projectId,send,capability,pairBody,svc,dir}=await start(t,{events:false});
  assert.match(capability,/^[0-9a-f]{64}$/);
  const issued=await (await fetch(`${base}/api/session`,{method:'POST',body:pairBody(),headers:{'Content-Type':'application/json',Origin:base}})).json();
  assert(issued.expiresAt>Date.now());assert.deepEqual(issued.scopes,['configure','packs','integrations']);
  assert.notEqual(issued.capability,capability,'each session is its own capability');
  const port=new URL(base).port;
  assert.equal((await fetch(`${base}/api/session`,{method:'POST',body:pairBody(),headers:{'Content-Type':'application/json',Origin:`http://localhost:${port}`}})).status,200,'the localhost origin is the same receiver');
  assert.equal((await fetch(`${base}/api/session`,{method:'POST',body:pairBody(),headers:{'Content-Type':'application/json'}})).status,403,'no Origin');
  for(const origin of ['http://evil.example',`http://127.0.0.1:${Number(port)+1}`,'null'])
    assert.equal((await fetch(`${base}/api/session`,{method:'POST',body:pairBody(),headers:{'Content-Type':'application/json',Origin:origin}})).status,403,origin);
  const cross=await fetch(`${base}/api/session`,{method:'POST',body:pairBody(),headers:{'Content-Type':'application/json',Origin:base,'Sec-Fetch-Site':'cross-site'}});
  assert.equal(cross.status,403);assert.equal((await cross.json()).code,'cross-site-refused');
  assert.equal((await fetch(`${base}/api/session`,{method:'POST',body:pairBody(),headers:{'Content-Type':'application/json',Origin:base,'Sec-Fetch-Dest':'iframe'}})).status,403,'a frame navigation');
  assert.equal((await fetch(`${base}/api/session`,{method:'POST',body:pairBody(),headers:{'Content-Type':'application/json',Origin:base,'Sec-Fetch-Site':'same-origin','Sec-Fetch-Dest':'empty'}})).status,200,'a fetch from the page');
  // Pairing: loopback and Origin are not enough (any local process can send them); the key from receiver-auth.json is.
  for(const [what,body] of [['no key',undefined],['no body',null],['a wrong key','0'.repeat(64)],['a short key',svc.pairing.slice(0,10)]]){
    const r=await fetch(`${base}/api/session`,{method:'POST',...(body===null?{headers:{Origin:base}}:{headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({pairing:body})})});
    assert.equal(r.status,403,what);assert.equal((await r.json()).code,'pairing-required',what);}
  // Links carry a single-use code instead of the key: minted for the ingestion token's holder, exchanged once for the key.
  assert.equal((await fetch(`${base}/v1/pairing-code`,{method:'POST'})).status,401,'no token, no code');
  const minted=await (await fetch(`${base}/v1/pairing-code`,{method:'POST',headers:{Authorization:`Bearer ${svc.token}`}})).json();
  assert.match(minted.code,/^[0-9a-f]{32}$/);assert(!minted.url.includes(svc.pairing));assert(minted.url.endsWith(`#pair=${minted.code}`));
  const viaCode=async code=>fetch(`${base}/api/session`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({code})});
  const exchanged=await viaCode(minted.code);assert.equal(exchanged.status,200);const ex=await exchanged.json();
  assert.equal(ex.pairing,svc.pairing,'the code is exchanged for the key, once');assert.match(ex.capability,/^[0-9a-f]{64}$/);
  assert.equal((await viaCode(minted.code)).status,403,'a code works once');
  assert.equal((await viaCode('f'.repeat(32))).status,403,'an unknown code');
  const foreign=await (await fetch(`${base}/v1/pairing-code`,{method:'POST',headers:{Authorization:`Bearer ${svc.token}`}})).json();
  assert.equal((await fetch(`${base}/api/session`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://evil.example'},body:JSON.stringify({code:foreign.code})})).status,403,'a foreign page cannot use a code');
  assert.equal((await viaCode(foreign.code)).status,200,'and the refused attempt did not consume it');
  assert.equal((await fetch(`${base}/api/session`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({pairing:'é'.repeat(64)})})).status,403,'a non-hex key is refused, not a crash');
  assert.match(svc.pairing,/^[0-9a-f]{64}$/);assert.notEqual(svc.pairing,svc.token);
  const auth=JSON.parse(fs.readFileSync(path.join(dir,'receiver-auth.json'),'utf8'));assert.equal(auth.pairing,svc.pairing);
  if(process.platform!=='win32')assert.equal(fs.statSync(path.join(dir,'receiver-auth.json')).mode&0o077,0,'the key file is private');
  for(const route of ['/api/status','/api/integrations','/api/settings','/health','/api/projects']){
    const text=await (await fetch(base+route,{headers:{'X-Resonance-Capability':issued.capability}})).text();assert(!text.includes(svc.pairing),route);}
  for(const route of ADMIN){
    const r=`${route}${route.startsWith('/api/recipe')||route==='/api/preferences'?`?id=${projectId}`:''}`;
    const none=await send(r,{},{cap:null});assert.equal(none.status,401,`${route} without a capability`);assert.equal((await none.json()).code,'capability-required');
    assert.equal((await send(r,{},{cap:'0'.repeat(64)})).status,401,`${route} with an unknown capability`);
    assert.equal((await send(r,{},{cap:'not-hex'})).status,401,`${route} with a malformed capability`);
    assert.equal((await send(r,{},{headers:{Origin:'http://evil.example'}})).status,403,`${route} from another origin, even with the capability`);
    const noOrigin=await fetch(base+r,{method:'POST',headers:{'Content-Type':'application/json','X-Resonance-Capability':capability},body:'{}'});
    assert.equal(noOrigin.status,401,`${route}: the capability alone is not enough`);
  }
  // The change stream: the page's own EventSource only. Frames and images of other sites send no Origin.
  for(const headers of [{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Dest':'iframe'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'},{'Sec-Fetch-Dest':'image'},{'Sec-Fetch-Dest':'document'}]){
    const r=await fetch(`${base}/api/changes`,{headers});assert.equal(r.status,403,JSON.stringify(headers));assert.equal((await r.json()).code,'cross-site-refused');}
  const own=new AbortController(),es=await fetch(`${base}/api/changes`,{headers:{'Sec-Fetch-Site':'same-origin','Sec-Fetch-Dest':'empty'},signal:own.signal});
  assert.equal(es.status,200);own.abort();
  // The edit route the player used before capabilities (same origin only) now needs one too.
  assert.equal((await fetch(`${base}/api/recipe?id=${projectId}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:{type:'family',family:'stellar-forge'}})})).status,401);
});
test('Settings, preferences and presets round-trip with revisions; stale and invalid writes are refused',async t=>{
  const {dir,projectId,send,get}=await start(t);
  const fresh=await get('/api/settings');
  assert.equal(fresh.schema,'code-resonance.settings.v1');assert.equal(fresh.revision,0);assert.equal(fresh.music.style,'ambient');assert.equal(fresh.stage.world,'living');
  assert(!fs.existsSync(path.join(dir,'settings.json')),'created on the first write only');
  let r=await send('/api/settings',{patch:{music:{volume:.3,style:'pulse'},stage:{captions:false}},ifRevision:0});assert.equal(r.status,200);
  const saved=await r.json();assert.equal(saved.revision,1);assert.equal(saved.music.volume,.3);assert.equal(saved.music.texture,.58,'deep merge keeps the rest');
  assert.deepEqual(await get('/api/settings'),saved);
  r=await send('/api/settings',{patch:{music:{volume:.4}},ifRevision:0});assert.equal(r.status,409);
  const stale=await r.json();assert.equal(stale.code,'stale');assert.equal(stale.current.revision,1);
  for(const [patch,key] of [[{music:{loud:1}},'music.loud'],[{music:{tempo:300}},'music.tempo'],[{stage:{world:'mars'}},'stage.world'],[{colour:'red'},'colour']]){
    r=await send('/api/settings',{patch});assert.equal(r.status,400,key);const e=await r.json();assert.equal(e.code,'invalid');assert.equal(e.key,key);}
  assert.equal((await get('/api/settings')).revision,1,'refused writes change nothing');
  // Per-project preferences (null = inherit the global setting); the project must exist.
  assert.equal((await fetch(`${new URL(r.url).origin}/api/preferences?id=${sha('nobody-here')}`)).status,404);
  assert.equal((await send(`/api/preferences?id=${sha('nobody-here')}`,{patch:{world:'nebula'}})).status,404);
  const prefs=await get(`/api/preferences?id=${projectId}`);assert.equal(prefs.revision,0);assert.equal(prefs.world,null);assert.equal(prefs.music.tempo,null);
  r=await send(`/api/preferences?id=${projectId}`,{patch:{world:'nebula',music:{tempo:100}}});assert.equal(r.status,200);assert.equal((await r.json()).revision,1);
  let listed=(await get('/api/projects')).projects.find(p=>p.id===projectId);
  const inherit={mood:null,evolution:null,melody:null,rhythm:null,atmosphere:null,harmony:null,dynamics:null,space:null,mix:null};
  assert.deepEqual(listed.preferences,{world:'nebula',music:{style:null,texture:null,tempoMode:null,tempo:100,...inherit}});
  r=await send(`/api/preferences?id=${projectId}`,{patch:{world:null},ifRevision:1});const cleared=await r.json();assert.equal(cleared.world,null);assert.equal(cleared.music.tempo,100);
  assert.equal((await send(`/api/preferences?id=${projectId}`,{patch:{world:'living'},ifRevision:1})).status,409);
  assert.equal((await send(`/api/preferences?id=${projectId}`,{patch:{world:'mars'}})).status,400);
  listed=(await get('/api/projects')).projects.find(p=>p.id===projectId);assert.equal(listed.preferences.world,null,'the summary follows the write');
  // Presets: create, rename, update, delete; validation names the field.
  r=await send('/api/presets',{action:'create',kind:'visual',name:'Night Forge',payload:{family:'stellar-forge',tuning:{'light.bloom':1.2},overrides:{intensity:1.5}}});
  assert.equal(r.status,200);let presets=await r.json();assert.equal(presets.revision,1);
  const [p]=presets.presets;assert.match(p.id,/^p-[0-9a-f]{12}$/);assert.equal(p.payload.look,null);
  r=await send('/api/presets',{action:'create',kind:'music',name:'Calm',payload:{style:'ambient',texture:.4,tempoMode:'manual',tempo:80}});assert.equal(r.status,200);
  r=await send('/api/presets',{action:'rename',id:p.id,name:'Night Forge II',ifRevision:2});presets=await r.json();assert.equal(presets.presets[0].name,'Night Forge II');
  assert.equal((await send('/api/presets',{action:'rename',id:p.id,name:'X',ifRevision:2})).status,409);
  assert.equal((await send('/api/presets',{action:'rename',id:p.id,name:'<script>'})).status,400);
  assert.equal((await send('/api/presets',{action:'create',kind:'music',name:'Loud',payload:{style:'ambient',texture:2,tempoMode:'manual',tempo:80}})).status,400);
  assert.equal((await send('/api/presets',{action:'delete',id:'p-000000000000'})).status,404);
  r=await send('/api/presets',{action:'delete',id:p.id});presets=await r.json();assert.equal(presets.presets.length,1);assert.equal(presets.presets[0].kind,'music');
  assert.deepEqual(await get('/api/presets'),presets);
  // The composed score's performance profile and mix: global, per project (null inherits) and in a preset, through the API.
  r=await send('/api/settings',{patch:{music:{evolution:.8,space:.25,mix:{perc:0}}}});assert.equal(r.status,200);
  const g=(await get('/api/settings')).music;assert.equal(g.evolution,.8);assert.equal(g.space,.25);assert.equal(g.mix.perc,0);assert.equal(g.mix.pad,1);assert.equal(g.style,'pulse');
  r=await send(`/api/preferences?id=${projectId}`,{patch:{music:{atmosphere:.9,mix:{pad:1,bass:.7,melody:1.2,counter:1,arp:1,perc:1,atmos:1.3}}}});assert.equal(r.status,200);
  const own=(await get(`/api/preferences?id=${projectId}`)).music;assert.equal(own.atmosphere,.9);assert.equal(own.mood,null);assert.equal(own.mix.melody,1.2);
  assert.equal((await send(`/api/preferences?id=${projectId}`,{patch:{music:{mix:{perc:2}}}})).status,400);
  const performance={style:'ambient',texture:.5,tempoMode:'project',tempo:92,profile:{mood:.3,evolution:.35,melody:.4,rhythm:.3,atmosphere:.7,harmony:.5,dynamics:.35,space:.75},mix:{pad:.9,bass:.7,melody:.9,counter:.8,arp:.7,perc:1,atmos:1.15}};
  r=await send('/api/presets',{action:'create',kind:'music',name:'Deep focus',payload:performance});assert.equal(r.status,200);
  assert.deepEqual((await get('/api/presets')).presets.find(x=>x.name==='Deep focus').payload,performance);
  assert.deepEqual((await get('/api/presets')).presets.find(x=>x.name==='Calm').payload,{style:'ambient',texture:.4,tempoMode:'manual',tempo:80},'a preset from before keeps its shape');
  r=await send('/api/presets',{action:'create',kind:'music',name:'Keyed',payload:{...performance,key:'D'}});assert.equal(r.status,400);assert.equal((await r.json()).key,'payload.key');
});
test('Recipe batches apply all or nothing against a revision; a preview never writes; the tunable parameters are listed',async t=>{
  const {dir,projectId,send,get}=await start(t);
  const file=path.join(dir,'projects',sha(projectId),'recipe.json');
  const first=await get(`/api/recipe?id=${projectId}`);assert(Number.isInteger(first.revision)&&first.revision>=1,'GET returns the revision');
  assert.equal((await get(`/api/recipe?id=${projectId}`)).revision,first.revision,'reading does not write again');
  let r=await send(`/api/recipe?id=${projectId}`,{actions:[{type:'family',family:'stellar-forge'},{type:'tune',values:{'light.bloom':1.25,'geometry.spiralArms':4}}],ifRevision:first.revision});
  assert.equal(r.status,200,await r.clone().text());
  const tuned=await r.json();assert.equal(tuned.revision,first.revision+1);assert.equal(tuned.family,'stellar-forge');
  assert.equal(tuned.genome.light.bloom,1.25);assert.equal(tuned.genome.geometry.spiralArms,4);assert.deepEqual(tuned.tuning.values,{'geometry.spiralArms':4,'light.bloom':1.25});
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).revision,tuned.revision,'stored with its revision');
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'overrides',intensity:.5},ifRevision:first.revision});assert.equal(r.status,409);
  const stale=await r.json();assert.equal(stale.code,'stale');assert.equal(stale.recipe.revision,tuned.revision);assert.equal(stale.recipe.genome.light.bloom,1.25);
  // All or nothing: the second action is invalid, so the first is not applied either.
  const before=fs.readFileSync(file);
  r=await send(`/api/recipe?id=${projectId}`,{actions:[{type:'overrides',intensity:.5},{type:'tune',values:{'light.nonsense':1}}]});assert.equal(r.status,400);
  assert.match((await r.json()).error,/light\.nonsense/);
  for(const body of [{actions:[]},{actions:Array.from({length:17},()=>({type:'lock',locked:true}))},{},{action:{type:'tune',values:{'light.bloom':[0,1]}}},{actions:[{type:'lock'}],ifRevision:'1'}])
    assert.equal((await send(`/api/recipe?id=${projectId}`,body)).status,400,JSON.stringify(body).slice(0,60));
  assert.deepEqual(fs.readFileSync(file),before,'refused edits write nothing');
  // A preview: the candidate, its parameters and what it needs to run; the file is untouched.
  r=await send(`/api/recipe/preview?id=${projectId}`,{actions:[{type:'tune',values:{'light.bloom':.5}}]});assert.equal(r.status,200);
  const preview=await r.json();assert.equal(preview.recipe.genome.light.bloom,.5);assert.equal(preview.recipe.revision,tuned.revision);
  assert.equal(preview.tunable['light.bloom'].group,'light');assert.deepEqual(preview.runtime,{kind:'builtin',pack:null,approved:true,available:true});
  assert.equal((await send(`/api/recipe/preview?id=${projectId}`,{actions:[{type:'tune',values:{'light.bloom':99}}]})).status,400);
  assert.deepEqual(fs.readFileSync(file),before,'a preview never writes');
  assert.equal((await get(`/api/recipe?id=${projectId}`)).genome.light.bloom,1.25);
  const tunable=await get(`/api/recipe/tunable?id=${projectId}`);
  assert.equal(tunable.revision,tuned.revision);assert.equal(tunable.tunable['geometry.spiralArms'].type,'integer');assert.equal(tunable.tunable['palette.primary'].type,'color');
  assert.equal(tunable.base['light.bloom'],tuned.tuning.base['light.bloom'],'the generated value, not the tuned one');
  assert.equal(Object.keys(tunable.base).length,Object.keys(tunable.tunable).length);
  const listed=(await get('/api/projects')).projects.find(p=>p.id===projectId);
  assert.deepEqual(listed.recipe,{family:'stellar-forge',familyName:'Stellar Forge',familyKind:'builtin',source:'user',locked:true,title:null,revision:tuned.revision});
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'tune-reset'}});const reset=await r.json();
  assert.equal(reset.tuning,null);assert.equal(reset.genome.light.bloom,tuned.tuning.base['light.bloom']);assert.equal(reset.revision,tuned.revision+1);
  assert.equal((await send(`/api/recipe?id=${sha('nobody-here')}`,{action:{type:'lock'}})).status,404);
  // ifRevision null means "no check", as on the other documents.
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'title',title:'Night Forge'},ifRevision:null});assert.equal(r.status,200);assert.equal((await r.json()).revision,reset.revision+1);
  assert.equal((await send('/api/settings',{patch:{stage:{captions:false}},ifRevision:null})).status,200);
});
test('Packs: import (ZIP and folder) into quarantine, install unapproved, approve, revoke, remove; the change stream follows every write',async t=>{
  const {svc,dir,base,projectId,send,get}=await start(t);
  const stream=await changeStream(base);t.after(()=>stream.close());
  const hello=await stream.until(m=>m.event==='hello','hello');assert.deepEqual(hello.data.revision,{settings:0,presets:0});assert(hello.data.at>0);
  // A world pack (code) as a ZIP with a top-level folder, as archivers make them.
  const archive=zip(filesOf(path.join(EXAMPLES,'cymatic-field'),'cymatic-field/'));
  let r=await send('/api/packs/import',archive,{headers:{'Content-Type':'application/zip'}});assert.equal(r.status,200,await r.clone().text());
  const report=await r.json();
  assert.equal(report.manifest.id,'halcyon.cymatic-field');assert.equal(report.executable,true);assert.deepEqual(report.errors,[]);assert.equal(report.installed,null);
  assert.equal(report.access.code,true);assert.equal(report.access.network,false);assert.match(report.digest,/^[0-9a-f]{64}$/);
  assert(!forms(dir).some(d=>JSON.stringify(report).includes(d))&&!JSON.stringify(report).includes('.quarantine'),'no location on disk');
  assert(fs.existsSync(path.join(dir,'packs','.quarantine',report.importId)));
  r=await send('/api/packs/install',{importId:report.importId,digest:'0'.repeat(64)});assert.equal(r.status,409);assert.equal((await r.json()).code,'changed');
  r=await send('/api/packs/install',{importId:report.importId,digest:report.digest});assert.equal(r.status,200);
  const installed=await r.json();assert.equal(installed.id,'halcyon.cymatic-field');assert.equal(installed.trusted,false,'never approved by installation');
  assert(!fs.existsSync(path.join(dir,'packs','.quarantine',report.importId)),'quarantine emptied');
  await stream.until(m=>m.data.type==='packs','packs after install');
  let listed=(await get('/api/packs')).packs.find(p=>p.id==='halcyon.cymatic-field');
  assert.equal(listed.trusted,false);assert.equal(listed.usedBy,0);assert.equal(listed.readme,true);
  assert(Object.keys(listed.parameters).length&&Object.keys(listed.parameters).every(k=>k.startsWith('params.')),'world parameters');
  const catalog=await get('/api/catalog');
  assert.deepEqual(Object.keys(catalog.families).sort(),['fractal-biosphere','machine-cathedral','stellar-forge']);
  assert.deepEqual(catalog.packFamilies['halcyon.cymatic-field'].parameters,listed.parameters);assert(catalog.families['stellar-forge'].parameters['geometry.spiralArms']);
  const readme=await fetch(`${base}/api/packs/readme?id=halcyon.cymatic-field`);
  assert.equal(readme.status,200);assert.match(readme.headers.get('content-type'),/^text\/plain/);assert.match(readme.headers.get('content-security-policy'),/sandbox/);
  assert.equal(await readme.text(),fs.readFileSync(path.join(EXAMPLES,'cymatic-field','README.md'),'utf8'));
  assert.equal((await fetch(`${base}/api/packs/readme?id=constructor`)).status,404);
  // A recipe that uses it counts; the stream carries the recipe write.
  r=await send(`/api/recipe?id=${projectId}`,{action:{type:'family',family:'halcyon.cymatic-field'}});const chosen=await r.json();assert.equal(r.status,200);
  await stream.until(m=>m.data.type==='recipe'&&m.data.projectId===projectId&&m.data.revision===chosen.revision,'recipe');
  assert.equal((await get('/api/packs')).packs.find(p=>p.id==='halcyon.cymatic-field').usedBy,1);
  r=await send(`/api/recipe/preview?id=${projectId}`,{actions:[{type:'lock'}]});
  assert.deepEqual((await r.json()).runtime,{kind:'world-pack',pack:'halcyon.cymatic-field',approved:false,available:true});
  // The digest binds an approval to the reviewed files: it cannot be left out (setTrust would skip the comparison).
  for(const digest of ['','0',installed.digest.toUpperCase()]){r=await send('/api/packs/trust',{id:installed.id,digest,trusted:true});assert.equal(r.status,400,JSON.stringify(digest));}
  assert.equal((await get('/api/packs')).packs.find(p=>p.id===installed.id).trusted,false);
  // Approval with the capability, then revocation.
  const before=stream.messages.length;
  r=await send('/api/packs/trust',{id:installed.id,digest:installed.digest,trusted:true});assert.equal(r.status,200);assert.equal((await r.json()).trusted,true);
  await stream.until((m,i)=>m.data.type==='packs'&&stream.messages.indexOf(m)>=before,'packs after approval');
  r=await send('/api/packs/trust',{id:installed.id,digest:installed.digest,trusted:false});assert.equal((await r.json()).trusted,false);
  // A data pack from a folder (what a browser folder picker sends).
  const folder=filesOf(path.join(EXAMPLES,'ember-observatory')).map(f=>({path:f.name,data:f.data.toString('base64')}));
  r=await send('/api/packs/import',{name:'ember-observatory',files:folder});assert.equal(r.status,200);
  const data=await r.json();assert.equal(data.executable,false);assert.deepEqual(data.errors,[]);assert.equal(data.access.code,false);
  r=await send('/api/packs/install',{importId:data.importId,digest:data.digest});assert.equal(r.status,200);assert.equal((await r.json()).trusted,true,'data packs need no approval');
  listed=(await get('/api/packs')).packs.find(p=>p.id===data.manifest.id);assert(listed.parameters.overrides&&typeof listed.parameters.overrides==='object');
  // Transport problems: 400 with a code, nothing left in quarantine; discard; an unknown import.
  r=await send('/api/packs/import',Buffer.from('not a zip at all, just bytes'),{headers:{'Content-Type':'application/zip'}});assert.equal(r.status,400);assert.equal((await r.json()).code,'invalid-archive');
  r=await send('/api/packs/import',{files:[{path:'../escape.json',data:'e30='}]});assert.equal(r.status,400);assert.equal((await r.json()).code,'unsafe-path');
  r=await send('/api/packs/import',archive,{headers:{'Content-Type':'text/plain'}});assert.equal(r.status,415);
  r=await send('/api/packs/import',archive,{headers:{'Content-Type':'application/zip'}});const again=await r.json();assert.equal(again.installed.trusted,false,'the installed version is shown');
  r=await send('/api/packs/discard',{importId:again.importId});assert.equal(r.status,200);
  assert.equal((await send('/api/packs/install',{importId:again.importId,digest:again.digest})).status,404);
  assert.deepEqual(fs.readdirSync(path.join(dir,'packs','.quarantine')),[]);
  // Removal; the recipe that names the pack is left as it is (served on the fallback while the pack is missing).
  const mark=stream.messages.length;
  r=await send('/api/packs/remove',{id:'halcyon.cymatic-field'});assert.equal(r.status,200);
  await stream.until(m=>m.data.type==='packs'&&stream.messages.indexOf(m)>=mark,'packs after removal');
  assert.equal((await get('/api/packs')).packs.some(p=>p.id==='halcyon.cymatic-field'),false);
  assert.equal((await send('/api/packs/remove',{id:'halcyon.cymatic-field'})).status,404);
  assert.equal((await send('/api/packs/remove',{id:'../trust'})).status,400);
  const recipeFile=path.join(dir,'projects',sha(projectId),'recipe.json'),kept=fs.readFileSync(recipeFile);
  assert.equal(JSON.parse(kept).family,'halcyon.cymatic-field');
  // While the pack is missing the recipe is served on a fallback; an edit of that fallback would replace the stored
  // choice for good, so only an action that leaves the pack behind applies (a preview says the same).
  const served=await get(`/api/recipe?id=${projectId}`);assert.deepEqual(served.unavailable,{family:'halcyon.cymatic-field'});
  for(const [route,actions] of [['/api/recipe',[{type:'title',title:'Renamed'}]],['/api/recipe',[{type:'tune',values:{'light.bloom':1}}]],['/api/recipe',[{type:'regenerate',keepFamily:true}]],
    ['/api/recipe',[{type:'pack',pack:null}]],['/api/recipe/preview',[{type:'lock'}]]]){
    r=await send(`${route}?id=${projectId}`,{actions});assert.equal(r.status,409,`${route} ${JSON.stringify(actions)}`);
    const e=await r.json();assert.equal(e.code,'pack-unavailable');assert.equal(e.recipe.revision,chosen.revision);}
  assert.deepEqual(fs.readFileSync(recipeFile),kept,'the stored recipe is untouched');
  r=await send(`/api/recipe/preview?id=${projectId}`,{actions:[{type:'family',family:'stellar-forge'},{type:'title',title:'Moved'}]});assert.equal(r.status,200);
  assert.deepEqual(fs.readFileSync(recipeFile),kept);
  r=await send(`/api/recipe?id=${projectId}`,{actions:[{type:'family',family:'stellar-forge'},{type:'title',title:'Moved'}]});assert.equal(r.status,200);
  const moved=await r.json();assert.equal(moved.family,'stellar-forge');assert.equal(moved.title,'Moved');assert.equal(moved.unavailable,undefined);
  assert.equal(JSON.parse(fs.readFileSync(recipeFile,'utf8')).unavailable,undefined,'the fallback flag is never stored');
  // Settings and presets writes reach the stream too.
  await send('/api/settings',{patch:{interface:{motion:'reduce'}}});
  await stream.until(m=>m.data.type==='settings'&&m.data.revision===1,'settings');
  await send('/api/presets',{action:'create',kind:'music',name:'Calm',payload:{style:'ambient',texture:.4,tempoMode:'manual',tempo:80}});
  await stream.until(m=>m.data.type==='presets'&&m.data.revision===1,'presets');
  await send(`/api/preferences?id=${projectId}`,{patch:{world:'city'}});
  await stream.until(m=>m.data.type==='preferences'&&m.data.projectId===projectId&&m.data.revision===1,'preferences');
  // A pack installed by the command line (no route involved) is noticed by the registry poll.
  const cli=stream.messages.length;
  require('../engine/packs').install(path.join(EXAMPLES,'cymatic-field'),dir);
  await stream.until(m=>m.data.type==='packs'&&stream.messages.indexOf(m)>=cli,'packs after a CLI install',12000);
  assert(!JSON.stringify(stream.messages).includes(svc.token)&&!JSON.stringify(stream.messages).includes(NAME),'change messages carry identifiers only');
});
test('Capture evidence: the extension\'s reported settings and capture state, agent hooks, and the activity stream',async t=>{
  const {svc,base,projectId,ev,post,get}=await start(t);
  const stream=await changeStream(base);t.after(()=>stream.close());
  const meta={extensionVersion:'0.5.0',remote:'',includeHidden:false,captureDocumentContents:true,captureTerminalCommands:false,capturePromptText:false,shareProjectName:true,baselineFileLimit:450,receiverPort:svc.port};
  await post([ev('workspace.started',{sessionId:'editor-session-2',name:NAME,meta}),ev('document.snapshot',{sessionId:'editor-session-2',file:FILE,content:'export const x = 1;\n',meta:{reason:'edit'}})]);
  await stream.until(m=>m.data.type==='activity'&&m.data.projectId===projectId,'activity');
  // What Claude Code's hook adapter sends (its real translation), for this project.
  const cwd=tempDir(t,'cr-cc-claude-');
  const inputs=[{hook_event_name:'SessionStart',session_id:'s1',source:'startup',cwd},{hook_event_name:'UserPromptSubmit',session_id:'s1',prompt:'secret prompt words',cwd},
    {hook_event_name:'PreToolUse',session_id:'s1',tool_name:'Edit',tool_use_id:'t1',tool_input:{file_path:path.join(cwd,FILE)},cwd},
    {hook_event_name:'PostToolUse',session_id:'s1',tool_name:'Edit',tool_use_id:'t1',tool_input:{file_path:path.join(cwd,FILE)},cwd}];
  await post(inputs.flatMap(i=>translate(i)).map(e=>({...e,projectId})));
  let doc;for(let i=0;i<200;i++){doc=await get(`/api/evidence?id=${projectId}`);if(!doc.building&&doc.agents?.['claude-code']?.events>=4)break;await delay(25);}
  assert.equal(doc.schema,'code-resonance.evidence.v1');assert.equal(doc.projectId,projectId);
  assert.equal(doc.editor.capture.state,'started');assert.equal(doc.editor.capture.sessionId,'editor-session-2');
  assert.equal(doc.editor.reported.extensionVersion,'0.5.0');assert.equal(doc.editor.reported.settings.receiverPort,svc.port);assert.equal(doc.editor.reported.settings.captureTerminalCommands,false);
  assert(doc.editor.events>=2);assert.equal(doc.agents['claude-code'].events,5,'four hook calls, five events');assert.equal(doc.agents['claude-code'].source,'claude-code-hook');
  assert.equal(doc.demonstration,false);assert.equal(doc.editor.sessionIds,undefined,'session bookkeeping stays inside the receiver');
  const text=JSON.stringify(doc);for(const secret of [NAME,'secret-dir','hidden-file','secret prompt',cwd,svc.token])assert(!text.includes(secret),secret);
  await stream.until(m=>m.data.type==='evidence'&&m.data.projectId===projectId,'evidence');
  let listed=(await get('/api/projects')).projects.find(p=>p.id===projectId);
  assert.equal(listed.name,NAME,'the private name is listed for the Control Center');
  assert.equal(listed.evidence.editor.state,'started');assert.equal(listed.evidence.editor.version,'0.5.0');assert.equal(listed.evidence.agents[0].provider,'claude-code');
  const mark=stream.messages.length;
  await post([ev('workspace.stopped',{sessionId:'editor-session-2'})]);
  await stream.until(m=>m.data.type==='evidence'&&stream.messages.indexOf(m)>=mark,'evidence after stop');
  assert.equal((await get(`/api/evidence?id=${projectId}`)).editor.capture.state,'stopped');
  assert.equal((await fetch(`${base}/api/evidence?id=${sha('nobody-here')}`)).status,404);
  assert.equal((await fetch(`${base}/api/evidence?id=../x`)).status,404);
  // Integrations: which projects each source reached (the private name expected here), the extension's settings.
  const integrations=await get('/api/integrations');
  assert.equal(integrations.vscode.latestVersion,require('../extension/package.json').version);
  assert.equal(integrations.vscode.openSettingsUri,'vscode://zerobandwidth.code-resonance/settings');
  assert(integrations.vscode.settings.some(s=>s.id==='resonance.receiverPort'&&s.type==='number'&&s.default===4174));
  assert.equal(integrations.vscode.projects.find(p=>p.projectId===projectId).name,NAME);
  assert.equal(integrations.claude.projects.find(p=>p.projectId===projectId).events,5);
  assert.deepEqual(integrations.claude.events,EVENTS);assert.equal(integrations.claude.adapter,undefined,'adapter path: capability only');
  // The demonstration (scripts/demo.js: a demo- session) sends workspace events, but no editor was involved.
  const demo=sha('control-center-demo');
  await post([ev('workspace.started',{projectId:demo,sessionId:'demo-1700000000000',name:'Demo',meta:{source:'demonstration'}}),ev('workspace.stopped',{projectId:demo,sessionId:'demo-1700000000000'})]);
  let demoDoc;for(let i=0;i<200;i++){const r=await fetch(`${base}/api/evidence?id=${demo}`);if(r.status===200){demoDoc=await r.json();if(!demoDoc.building&&demoDoc.events>=2)break;}await delay(25);}
  assert.equal(demoDoc.demonstration,true);
  assert.equal((await get('/api/integrations')).vscode.projects.some(p=>p.projectId===demo),false,'a demonstration is not a VS Code capture');
  // After a restart the document is read back (and still counts every event once).
  await svc.stop();
  const again=await startService(t,{port:0,dataDir:svc.dataDir});
  const back=await (await fetch(`http://127.0.0.1:${again.port}/api/evidence?id=${projectId}`)).json();
  assert.equal(back.agents['claude-code'].events,5);assert.equal(back.editor.capture.state,'stopped');
});
test('Status, documentation and the Control Center files; no public response carries the token, a path or the private name',async t=>{
  const {svc,dir,base,projectId,capability,get}=await start(t);
  const status=await get('/api/status');
  assert.equal(status.version,require('../package.json').version);assert.equal(status.port,svc.port);assert.equal(status.loopbackOnly,true);assert.equal(typeof status.wsl,'boolean');
  assert.equal(status.node,process.version);assert.equal(status.platform,process.platform);assert(status.uptimeMs>=0&&status.startedAt<=Date.now());
  assert.equal(typeof status.worker.lastProjectionAt,'number');assert.equal(status.worker.errors,0);assert.equal(status.projects,1);
  assert.deepEqual(status.packs,{installed:0,needApproval:0,problems:0});assert(status.capabilities>=1);
  assert.equal('dataDir' in status,false,'no data directory without a capability');
  // What the page's fetch() sends for a GET: the capability header, but no Origin (browsers omit it on same-origin GETs).
  const admin={'X-Resonance-Capability':capability,'Sec-Fetch-Site':'same-origin','Sec-Fetch-Dest':'empty'};
  assert.equal((await get('/api/status',admin)).dataDir,svc.dataDir);
  assert.equal((await get('/api/status',{...admin,Origin:base})).dataDir,svc.dataDir);
  assert.equal((await get('/api/integrations',admin)).claude.adapter,path.join(__dirname,'..','scripts','hooks','claude-code.js'));
  assert.equal('dataDir' in await get('/api/status',{...admin,'Sec-Fetch-Site':'cross-site'}),false,'never to another site');
  assert.equal('dataDir' in await get('/api/status',{...admin,'X-Resonance-Capability':'0'.repeat(64)}),false);
  // Documentation: a fixed list, inert text.
  for(const name of ['FIRST-RUN.md','packs/README.md','SECURITY.md']){
    const r=await fetch(`${base}/docs/${name}`);assert.equal(r.status,200,name);assert.equal(r.headers.get('content-type'),'text/markdown; charset=utf-8');
    assert.equal(r.headers.get('content-security-policy'),"default-src 'none'; sandbox");assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('cache-control'),'no-store');
  }
  assert.equal(await (await fetch(`${base}/docs/FIRST-RUN.md`)).text(),fs.readFileSync(path.join(__dirname,'..','docs','FIRST-RUN.md'),'utf8'));
  for(const name of ['..%2Fpackage.json','..%2F..%2Fpackage.json','%2e%2e/package.json','QUALIFICATION.md','packs%2F..%2FFIRST-RUN.md','first-run.md','packs','README.md'])
    assert.equal((await fetch(`${base}/docs/${name}`)).status,404,name);
  assert.equal((await fetch(`${base}/package.json`)).status,404);
  // The Control Center's modules are served with the page's policy.
  const ui=await fetch(`${base}/ui/main.js`);assert.equal(ui.status,200);assert.match(ui.headers.get('content-type'),/^text\/javascript/);
  assert.match(ui.headers.get('content-security-policy'),/script-src 'self'; object-src 'none'/);
  for(const p of ['/ui/missing.js','/ui/Main.js','/ui/..%2Fapp.js','/ui/workspaces%2Fstage.js','/ui/a/b/c.js','/ui/main.json',
    // Windows device names (a device, not a file, on Windows 10, whatever the extension).
    '/ui/con.js','/ui/aux.css','/ui/com1.js','/ui/lpt9/x.js','/ui/nul/con.svg','/worlds/con.js','/worlds/prn.js',
    // The world modules: /worlds/<name>.js and one known subfolder, /worlds/life/<name>.js; nothing deeper or elsewhere.
    '/worlds/life/con.js','/worlds/life/missing.js','/worlds/life/a/sim.js','/worlds/other/sim.js','/worlds/life%2Fsim.js','/worlds/life/..%2Fhost.js','/worlds/Life/sim.js'])assert.equal((await fetch(base+p)).status,404,p);
  const life=await fetch(`${base}/worlds/life/sim.js`);assert.equal(life.status,200);assert.match(life.headers.get('content-type'),/^text\/javascript/);
  // Public read routes: none carries the token, a file path sent in events, the data directory or the private name.
  const routes=['/api/status','/api/catalog','/api/packs','/api/packs/templates',`/api/evidence?id=${projectId}`,'/api/settings',`/api/preferences?id=${projectId}`,
    '/api/presets',`/api/recipe?id=${projectId}`,`/api/recipe/tunable?id=${projectId}`,'/health'];
  for(const route of routes){
    const text=await (await fetch(base+route)).text();
    for(const secret of [svc.token,'secret-dir','hidden-file',FILE,...forms(dir),NAME])assert(!text.includes(secret),`${route} contains ${secret===svc.token?'the token':secret}`);
  }
  const templates=await get('/api/packs/templates');
  assert.deepEqual(templates.templates.map(x=>x.kind),['declarative','shader','world']);assert(templates.templates[2].files.includes('world.js'));
  assert.match(templates.templates[0].command,/^npm run pack -- new <dir> --kind declarative --id <author\.name>$/);assert.equal(templates.validate,'npm run pack -- validate <dir>');
  // The private name is where the Control Center needs it.
  assert((await (await fetch(`${base}/api/projects`)).text()).includes(NAME));
  assert(!(await (await fetch(`${base}/api/projects`)).text()).includes(svc.token));
});
test('Claude Code hooks: plan and apply install, then remove, leaving the rest of the settings file untouched',async t=>{
  const {svc,dir,send}=await start(t,{events:false});
  // The plan names the folder as resolved (on Windows the temporary folder's short 8.3 name is expanded).
  const project=tempDir(t,'cr-cc-project-'),file=path.join(fs.realpathSync.native(project),'.claude','settings.local.json');
  const plan=body=>send('/api/integrations/claude/plan',body),apply=body=>send('/api/integrations/claude/apply',body);
  // No file yet: install creates it.
  let r=await plan({projectPath:project,action:'install'});assert.equal(r.status,200);let p=await r.json();
  assert.equal(p.file,file);assert.equal(p.exists,false);assert.equal(p.current,null);assert.equal(p.currentHash,'');assert.equal(p.changed,true);
  r=await apply({projectPath:project,action:'install',expectHash:''});assert.deepEqual(await r.json(),{file,written:true});
  const created=JSON.parse(fs.readFileSync(file,'utf8'));assert.deepEqual(Object.keys(created.hooks).sort(),[...EVENTS].sort());
  fs.rmSync(path.join(project,'.claude'),{recursive:true});
  // The user's own settings and hooks.
  const own={permissions:{allow:['Bash(ls)']},model:'opus',hooks:{PreToolUse:[{matcher:'Bash',hooks:[{type:'command',command:'echo mine'}]}],Notification:[{hooks:[{type:'command',command:'notify'}]}]}};
  fs.mkdirSync(path.dirname(file));const original=JSON.stringify(own,null,4);fs.writeFileSync(file,original);
  r=await plan({projectPath:project,action:'install'});p=await r.json();
  assert.equal(p.exists,true);assert.equal(p.current,original);assert.equal(p.changed,true);assert.equal(p.currentHash,crypto.createHash('sha256').update(original).digest('hex'));
  const next=JSON.parse(p.next);assert.deepEqual(next.permissions,own.permissions);assert.equal(next.model,'opus');assert.deepEqual(next.hooks.Notification,own.hooks.Notification);
  assert.equal(next.hooks.PreToolUse.length,2);assert.deepEqual(next.hooks.PreToolUse[0],own.hooks.PreToolUse[0]);
  assert.equal(fs.readFileSync(file,'utf8'),original,'a plan writes nothing');
  r=await apply({projectPath:project,action:'install',expectHash:p.currentHash});assert.equal(r.status,200);assert.equal((await r.json()).written,true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),next);
  r=await plan({projectPath:project,action:'install'});assert.equal((await r.json()).changed,false,'installing twice changes nothing');
  // A file changed after it was shown is not overwritten.
  r=await plan({projectPath:project,action:'remove'});p=await r.json();assert.equal(p.changed,true);
  fs.writeFileSync(file,JSON.stringify({...next,model:'sonnet'},null,2));
  r=await apply({projectPath:project,action:'remove',expectHash:p.currentHash});assert.equal(r.status,409);assert.equal((await r.json()).code,'changed');
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).model,'sonnet');
  fs.writeFileSync(file,JSON.stringify(next,null,2));
  r=await plan({projectPath:project,action:'remove'});p=await r.json();
  r=await apply({projectPath:project,action:'remove',expectHash:p.currentHash});assert.equal((await r.json()).written,true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),own,'removal leaves exactly the user\'s settings');
  // Only the adapter's own entries leave: a file with nothing else loses its now-empty `hooks` key.
  fs.writeFileSync(file,JSON.stringify(created));
  r=await plan({projectPath:project,action:'remove'});p=await r.json();assert.equal(p.next,'{}\n');
  // Refusals.
  fs.writeFileSync(file,'{ not json');
  r=await plan({projectPath:project,action:'install'});assert.equal(r.status,400);assert.equal((await r.json()).code,'invalid-json');
  for(const body of [{projectPath:'relative/dir',action:'install'},{projectPath:path.parse(project).root,action:'install'},{projectPath:dir,action:'install'},
    {projectPath:path.join(dir,'projects'),action:'install'},{projectPath:path.join(project,'missing'),action:'install'},{projectPath:project,action:'delete'},
    {projectPath:'/'+'x'.repeat(1100),action:'install'},{projectPath:file,action:'install'}])
    assert.equal((await plan(body)).status,400,JSON.stringify(body).slice(0,80));
  fs.mkdirSync(path.join(dir,'projects'),{recursive:true});
  assert.equal((await plan({projectPath:path.join(dir,'projects'),action:'install'})).status,400,'inside the data directory');
  // A network path is refused before it is resolved (resolving it would connect to that host).
  r=await plan({projectPath:process.platform==='win32'?'\\\\127.0.0.1\\c$\\project':'//127.0.0.1/share/project',action:'install'});
  assert.equal(r.status,400);assert.match((await r.json()).error,/network path/);
  // Links are never followed: not to the receiver's token, not into the data directory (a cloned repository may hold them).
  const linked=tempDir(t,'cr-cc-linked-'),claude=path.join(linked,'.claude'),auth=path.join(dir,'receiver-auth.json');
  const link=(target,at,type)=>{try{fs.symlinkSync(target,at,type);return true;}catch(e){if(['EPERM','EACCES'].includes(e.code))return false;throw e;}};
  // A directory link ('junction' on Windows needs no privilege).
  if(link(dir,claude,'junction')){
    for(const action of ['install','remove']){r=await plan({projectPath:linked,action});assert.equal(r.status,400,action);assert.match((await r.json()).error,/\.claude is a link/);}
    r=await apply({projectPath:linked,action:'install',expectHash:''});assert.equal(r.status,400);
    assert(!fs.existsSync(path.join(dir,'settings.local.json')),'nothing written through the link');
    // Only the link goes, never what it points to (a junction is removed as a directory on Windows).
    try{fs.unlinkSync(claude);}catch{fs.rmdirSync(claude);}
  }else t.diagnostic('directory links unavailable here: skipped');
  fs.mkdirSync(claude);
  if(link(auth,path.join(claude,'settings.local.json'),'file')){
    r=await plan({projectPath:linked,action:'install'});assert.equal(r.status,400);
    const text=await r.text();assert(!text.includes(svc.token),'the token is never shown');assert.match(text,/settings\.local\.json is a link/);
    r=await apply({projectPath:linked,action:'install',expectHash:crypto.createHash('sha256').update(fs.readFileSync(auth)).digest('hex')});assert.equal(r.status,400);
    assert(fs.lstatSync(path.join(claude,'settings.local.json')).isSymbolicLink(),'the link is not replaced');
    assert.equal(JSON.parse(fs.readFileSync(auth,'utf8')).token,svc.token);
    fs.rmSync(path.join(claude,'settings.local.json'));
  }else t.diagnostic('file links unavailable here (Windows without the privilege): skipped');
  // Not a directory, not a regular file: refused with a reason (not a receiver failure).
  fs.mkdirSync(path.join(claude,'settings.local.json'));
  assert.equal((await plan({projectPath:linked,action:'install'})).status,400,'settings.local.json is a directory');
  fs.rmSync(claude,{recursive:true});fs.writeFileSync(claude,'not a folder');
  assert.equal((await plan({projectPath:linked,action:'install'})).status,400,'.claude is a file');
});

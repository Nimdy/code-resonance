'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {sha}=require('../receiver/protocol');
const {tempDir,startService}=require('./helpers');
const highlight=require('../engine/highlight');
const film=require('../scripts/film');
const T0=1700000000000;
const I=(type,dt,extra={})=>({v:1,id:`i:${type}:${dt}`,type,ts:T0+dt,tier:2,magnitude:.5,evidence:'observed',subject:{},detail:{},...extra,type,ts:T0+dt});
const CLUSTER=[
  I('agent.state',200000,{tier:0,detail:{provider:'claude-code'}}),
  I('agent.state',210000,{tier:0,detail:{provider:'cursor'}}),
  I('agent.state',215000,{tier:0,detail:{provider:'demo (fictional)'}}),
  I('structure.created',220000,{tier:2,subject:{fileId:'src/secret/path.ts'},detail:{path:'/home/acme/secret-client'}}),
  I('validation.failed',230000,{detail:{category:'test'}}),
  I('validation.recovered',250000,{detail:{category:'test'}}),
  I('agent.collision',260000,{detail:{providers:['claude-code','cursor']}}),
  I('repository.checkpoint',270000,{})
];
const PINNED={from:T0+144000,to:T0+504000,speed:4,viewMs:90000,score:109};
test('Frozen intents pin a 90 s × 4 window at score 109; demonstration is ignored; no paths leak',()=>{
  const picked=highlight.pick(CLUSTER,T0,T0+1_200_000);
  assert.deepEqual({from:picked.from,to:picked.to,speed:picked.speed,viewMs:picked.viewMs,score:picked.score},PINNED);
  assert.deepEqual(picked.reasons,['validation.failed+recovered','agent.collision','providers>=2','structure.created','repository.checkpoint']);
  assert.deepEqual(picked.providers,['claude-code','cursor']);
  const json=JSON.stringify(picked);
  assert(!json.includes('src/secret'));assert(!json.includes('acme'));assert(!json.includes('path.ts'));
  assert(!json.includes('demo'));
});
test('A recording with nothing of tier 2 scores null; publicView pins the empty shape',()=>{
  const quiet=[I('agent.state',1000,{tier:0,detail:{provider:'claude-code'}})];
  assert.equal(highlight.pick(quiet,T0,T0+1_200_000),null);
  const empty=highlight.publicView('p-123456789012',null);
  assert.equal(empty.schema,'code-resonance.highlight.v1');
  assert.equal(empty.from,null);assert.equal(empty.to,null);assert.equal(empty.score,null);
  assert.equal('highlight' in empty,false);
  assert.deepEqual(empty.reasons,[]);assert.deepEqual(empty.providers,[]);
});
test('GET /api/highlight shares the picker, 404s a missing project, and never names a folder',async t=>{
  const dir=tempDir(t,'cr-hl-');
  const projectId=sha('highlight-http');
  const pdir=path.join(dir,'projects',sha(projectId));
  fs.mkdirSync(pdir,{recursive:true});
  fs.writeFileSync(path.join(pdir,'id'),projectId);
  const window={seq:0,start:T0,end:T0+1_200_000,intents:CLUSTER};
  fs.writeFileSync(path.join(pdir,'performance.jsonl'),JSON.stringify(window)+'\n');
  const svc=await startService(t,{port:0,dataDir:dir,sortIntervalMs:600000});
  const url=`http://127.0.0.1:${svc.port}`;
  const missing=await fetch(`${url}/api/highlight?id=${sha('no-such-project')}`);
  assert.equal(missing.status,404);
  const bad=await fetch(`${url}/api/highlight?id=nope`);
  assert.equal(bad.status,404);
  const r=await fetch(`${url}/api/highlight?id=${projectId}`);
  assert.equal(r.status,200);
  const body=await r.text();
  assert(!body.includes('secret'));assert(!body.includes('acme'));assert(!body.includes('path.ts'));
  const doc=JSON.parse(body);
  assert.equal(doc.schema,'code-resonance.highlight.v1');
  assert.equal(doc.projectId,projectId);
  assert.deepEqual({from:doc.from,to:doc.to,speed:doc.speed,viewMs:doc.viewMs,score:doc.score},PINNED);
  assert.deepEqual(doc.providers,['claude-code','cursor']);
  const again=await (await fetch(`${url}/api/highlight?id=${projectId}`)).json();
  assert.deepEqual({from:again.from,to:again.to,speed:again.speed,viewMs:again.viewMs,score:again.score},PINNED);
  fs.writeFileSync(path.join(pdir,'performance.jsonl'),JSON.stringify({seq:0,start:T0,end:T0+1_200_000,intents:[I('agent.state',1000,{tier:0,detail:{provider:'claude-code'}})]})+'\n');
  const quiet=await (await fetch(`${url}/api/highlight?id=${projectId}`)).json();
  assert.equal(quiet.from,null);assert.equal(quiet.score,null);
});
// Thirty hours of recording: a strong night at hour 1, a modest structure at hour 29.
const HOUR=3_600_000;
function thirtyHours({recent=true}={}){
  const strong=CLUSTER.map(i=>({...i,id:`old:${i.id}`,ts:i.ts+HOUR}));
  const late=recent?[I('agent.state',29*HOUR,{tier:0,detail:{provider:'claude-code'}}),I('agent.state',29*HOUR+5000,{tier:0,detail:{provider:'cursor'}}),
    I('structure.created',29*HOUR+10000,{tier:2})]:[I('agent.state',29*HOUR,{tier:0,detail:{provider:'claude-code'}})];
  return [{seq:0,start:T0,end:T0+2*HOUR,intents:strong},{seq:1,start:T0+2*HOUR,end:T0+28*HOUR,intents:[]},{seq:2,start:T0+28*HOUR,end:T0+30*HOUR,intents:late}];
}
test('Last night prefers the last 24 hours of the recording and falls back to the whole history only if nothing there scores',async()=>{
  const recent=highlight.fromWindows(thirtyHours());
  assert(recent.from>=T0+6*HOUR,'the window lies in the last 24 hours');
  assert.deepEqual(recent.reasons,['providers>=2','structure.created']);
  const whole=highlight.fromWindows(thirtyHours({recent:false}));
  assert.deepEqual({from:whole.from-HOUR,to:whole.to-HOUR,speed:whole.speed,score:whole.score},{from:PINNED.from,to:PINNED.to,speed:PINNED.speed,score:PINNED.score});
  // A recording of up to 24 hours is scored as one, exactly as before.
  const day=[{seq:0,start:T0,end:T0+1_200_000,intents:CLUSTER}];
  assert.deepEqual(highlight.fromWindows(day),highlight.pick(CLUSTER,T0,T0+1_200_000));
  for(const windows of [thirtyHours(),thirtyHours({recent:false})]){
    let start=Infinity,end=-Infinity;for(const w of windows){start=Math.min(start,w.start);end=Math.max(end,w.end);}
    const asked=[];
    const lazy=await highlight.lastNight({start,end,windowsSince:async since=>{asked.push(since);return windows.filter(w=>w.end>=since);}});
    assert.deepEqual(lazy,highlight.fromWindows(windows));
    assert.equal(asked[0],end-highlight.RECENT_MS);
    assert.equal(asked.length,lazy.from>=T0+6*HOUR?1:2,'the whole history is read only for the fallback');
  }
});
test('GET /api/highlight reads only the last 24 hours when they score, and agrees with the film\'s choice',async t=>{
  const dir=tempDir(t,'cr-hl-day-');
  const projectId=sha('highlight-day');
  const pdir=path.join(dir,'projects',sha(projectId));
  fs.mkdirSync(pdir,{recursive:true});
  fs.writeFileSync(path.join(pdir,'id'),projectId);
  const svc=await startService(t,{port:0,dataDir:dir,sortIntervalMs:600000});
  const get=async()=>(await fetch(`http://127.0.0.1:${svc.port}/api/highlight?id=${projectId}`)).json();
  const write=(windows,broken=false)=>fs.writeFileSync(path.join(pdir,'performance.jsonl'),windows.map((w,k)=>k===0&&broken?`{"seq":0,"start":${w.start},"end":${w.end},"intents":[BROKEN`:JSON.stringify(w)).join('\n')+'\n');
  const film=windows=>highlight.publicView(projectId,highlight.fromWindows(windows));
  write(thirtyHours());
  assert.deepEqual(await get(),film(thirtyHours()));
  // The oldest window cannot even be parsed: the answer is the same, because it was never read.
  write(thirtyHours(),true);
  const recent=await get();
  assert.deepEqual(recent,film(thirtyHours()));assert.deepEqual(recent.reasons,['providers>=2','structure.created']);
  write(thirtyHours({recent:false}));
  const fallback=await get();
  assert.deepEqual(fallback,film(thirtyHours({recent:false})));
  assert.equal(fallback.score,PINNED.score);
});
test('GET /api/highlight on a project with no recording returns the empty shape',async t=>{
  const dir=tempDir(t,'cr-hl-empty-');
  const projectId=sha('highlight-empty');
  const pdir=path.join(dir,'projects',sha(projectId));
  fs.mkdirSync(pdir,{recursive:true});
  fs.writeFileSync(path.join(pdir,'id'),projectId);
  const svc=await startService(t,{port:0,dataDir:dir,sortIntervalMs:600000});
  const doc=await (await fetch(`http://127.0.0.1:${svc.port}/api/highlight?id=${projectId}`)).json();
  assert.equal(doc.from,null);assert.equal('highlight' in doc,false);
});
function plantFilm(t,{title=null,intents=CLUSTER}={}){
  const dir=tempDir(t,'cr-film-');
  const projectId=sha('film-wrap');
  const pdir=path.join(dir,'projects',sha(projectId));
  fs.mkdirSync(pdir,{recursive:true});
  fs.writeFileSync(path.join(pdir,'id'),projectId);
  fs.writeFileSync(path.join(pdir,'recipe.json'),JSON.stringify({title,aliases:{}}));
  fs.writeFileSync(path.join(pdir,'performance.jsonl'),JSON.stringify({seq:0,start:T0,end:T0+1_200_000,intents})+'\n');
  return {dir,projectId};
}
const tools=(spawnCalls,logs)=>({
  exists:p=>/playwright-core$|ffmpeg-static$/.test(p),
  probe:()=>false,
  spawn:(cmd,args)=>{spawnCalls.push({cmd,args});return 0;},
  log:s=>logs.push(String(s)),
  err:s=>logs.push(String(s))
});
test('film wrapper: missing Playwright prints the ci hint; untitled refuses; --allow-untitled spawns --copy',async t=>{
  const {dir,projectId}=plantFilm(t,{title:null});
  const logs=[];
  const missing=await film.main(['--data',dir,'--project',projectId],{
    exists:()=>false,probe:()=>false,spawn:()=>{throw new Error('must not spawn');},log(){},err:s=>logs.push(String(s))});
  assert.equal(missing,1);assert.equal(logs.join('\n'),film.CI_HINT);
  logs.length=0;const calls=[];
  const untitled=await film.main(['--data',dir,'--project',projectId],tools(calls,logs));
  assert.equal(untitled,1);assert.match(logs.join('\n'),/no public title/i);assert.equal(calls.length,0);
  logs.length=0;
  const ok=await film.main(['--data',dir,'--project',projectId,'--allow-untitled'],tools(calls,logs));
  assert.equal(ok,0);assert.equal(calls.length,1);
  const args=calls[0].args;
  assert(args.includes('--copy'));assert.equal(args[args.indexOf('--labels')+1],'cinematic');
  assert.equal(args[args.indexOf('--from')+1],String(PINNED.from));
  assert.equal(args[args.indexOf('--to')+1],String(PINNED.to));
  assert.equal(args[args.indexOf('--speed')+1],'4');
  assert.equal(args[args.indexOf('--out')+1],film.DEFAULT_OUT);
  assert(args.includes(path.join('qualification','visual','film.js'))||args.some(a=>String(a).endsWith(`${path.sep}visual${path.sep}film.js`)));
  assert(!args.includes('results/visual/film.webm'));
  assert(!args.includes('--gpu'));
});
test('film wrapper passes --gpu amd when the probe says so, and omits it for --gpu off',async t=>{
  const {dir,projectId}=plantFilm(t,{title:'Night Build'});
  const calls=[];
  await film.main(['--data',dir,'--project',projectId],{...tools(calls,[]),probe:()=>true});
  assert(calls[0].args.includes('--gpu'));assert.equal(calls[0].args[calls[0].args.indexOf('--gpu')+1],'amd');
  calls.length=0;
  await film.main(['--data',dir,'--project',projectId,'--gpu','off'],{...tools(calls,[]),probe:()=>true});
  assert(!calls[0].args.includes('--gpu'));
});
test('film wrapper pins nvidia, auto, and a bare --gpu; /dev/dri alone is not a GPU',async t=>{
  const {dir,projectId}=plantFilm(t,{title:'Night Build'});
  const wrap=(extra)=>({
    existsSync(p){if(extra.existsSync){const v=extra.existsSync(p);if(v!==undefined)return v;}return fs.existsSync(p);},
    readdirSync(p,opts){if(extra.readdirSync){const v=extra.readdirSync(p,opts);if(v!==undefined)return v;}return fs.readdirSync(p,opts);},
    readFileSync:(...a)=>fs.readFileSync(...a)
  });
  const run=async(argv,fsApi,calls)=>film.main(['--data',dir,'--project',projectId,...argv],{
    exists:p=>/playwright-core$|ffmpeg-static$/.test(p),fs:fsApi,spawn:(cmd,args)=>{calls.push(args);return 0;},log(){},err(){}});
  const none=wrap({
    existsSync(p){if(p==='/dev/dxg'||p==='/sys/module/amdgpu'||p==='/sys/module/nvidia')return false;},
    readdirSync(p){if(p==='/sys/class/drm')return [];}
  });
  const nvidia=[];
  await run([],wrap({existsSync:p=>p==='/sys/module/nvidia'?true:p==='/dev/dxg'?false:p==='/sys/module/amdgpu'?false:undefined}),nvidia);
  assert.equal(nvidia[0][nvidia[0].indexOf('--gpu')+1],'nvidia');
  const dxg=[];
  await run([],wrap({existsSync:p=>p==='/dev/dxg'?true:p==='/sys/module/amdgpu'?false:p==='/sys/module/nvidia'?false:/libcuda|libnvidia-ml/.test(p)?false:undefined}),dxg);
  assert.equal(dxg[0][dxg[0].indexOf('--gpu')+1],'auto');
  const dxgCuda=[];
  await run([],wrap({existsSync:p=>p==='/dev/dxg'?true:p==='/usr/lib/wsl/lib/libcuda.so.1'?true:p==='/sys/module/amdgpu'?false:p==='/sys/module/nvidia'?false:undefined}),dxgCuda);
  assert.equal(dxgCuda[0][dxgCuda[0].indexOf('--gpu')+1],'nvidia');
  const pin=[];
  await run(['--gpu','nvidia'],none,pin);
  assert.equal(pin[0][pin[0].indexOf('--gpu')+1],'nvidia');
  const bare=[];
  await run(['--gpu'],none,bare);
  assert.equal(bare[0][bare[0].indexOf('--gpu')+1],'auto');
  const dri=[];
  await run([],wrap({existsSync:p=>p==='/dev/dri'?true:p==='/sys/module/amdgpu'?false:p==='/dev/dxg'?false:p==='/sys/module/nvidia'?false:undefined,readdirSync:p=>p==='/sys/class/drm'?[]:undefined}),dri);
  assert(!dri[0].includes('--gpu'));
  const amd=[];
  await run([],wrap({existsSync:p=>p==='/sys/module/amdgpu'?true:p==='/dev/dxg'?false:undefined}),amd);
  assert.equal(amd[0][amd[0].indexOf('--gpu')+1],'amd');
});
test('Home play does not require Playwright; product stays dependency-free; film script is wired',()=>{
  const root=path.join(__dirname,'..');
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.version,'0.7.1');
  assert.equal(pkg.scripts.film,'node scripts/film.js');
  assert.equal(pkg.dependencies,undefined);
  const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  const home=fs.readFileSync(path.join(root,'public/ui/workspaces/home.js'),'utf8');
  const renderer=fs.readFileSync(path.join(root,'qualification/visual/film.js'),'utf8');
  assert.match(app,/function playWindow/);
  const body=app.slice(app.indexOf('function playWindow'),app.indexOf('function playWindow')+900);
  assert.match(body,/\[1,4,16\]/);assert(!/speed\s*===\s*2|==\s*2/.test(body));
  assert.match(body,/music\.setClock\(perfNow/);
  assert(!/music\.setClock\(from/.test(body));
  assert.match(home,/\/api\/highlight/);assert.match(home,/playWindow/);
  assert.match(home,/a new structure/);
  assert.match(home,/nightCache=null/);
  assert.match(home,/setMode\('live'\)/);
  assert(!/playwright-core|require\(['"]playwright|from ['"]playwright/.test(app+home));
  assert.match(renderer,/includes\('--copy'\)/);
  assert.match(fs.readFileSync(path.join(root,'scripts/film.js'),'utf8'),/'--copy'/);
});

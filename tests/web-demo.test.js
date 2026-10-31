'use strict';
// The web demo (npm run site, scripts/build-site.js): the export from the public recording is complete and
// reproducible, the page loads everything relatively (GitHub Pages serves it under /code-resonance/), and the static
// mode (public/web-demo/static-api.js), run here on stand-ins for the browser, answers every request the Stage makes
// in a replay from the built files and stays inert for everything that needs a receiver. No browser: the real one is
// qualification/site/web-demo.qual.js.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {runInNewContext}=require('node:vm');
const {tempDir}=require('./helpers');
const {buildSite,keyOf,sitePage,absoluteLoads,TITLE}=require('../scripts/build-site');
const {FAMILIES,PREVIEWS}=require('../engine/recipe');
const REPO=path.join(__dirname,'..');
const ORIGIN='https://nimdy.github.io',ROOT=`${ORIGIN}/code-resonance/`;
const hashes=dir=>{const out={};const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);
  else out[path.relative(dir,f).split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}};walk(dir);return out;};
// The static mode on stand-ins for the browser: the site's files are its network; every request it makes is recorded.
function staticMode(site,{hash=''}={}){
  const requests=[],listeners={};
  const loc={href:ROOT+hash,origin:ORIGIN,pathname:'/code-resonance/',search:'',hash};
  const network=async input=>{const u=new URL(String(input));requests.push(u.href);
    if(u.origin!==ORIGIN||!u.pathname.startsWith('/code-resonance/'))return new Response('outside the site',{status:599});
    const f=path.join(site,decodeURIComponent(u.pathname.slice('/code-resonance/'.length)));
    return fs.existsSync(f)?new Response(fs.readFileSync(f,'utf8'),{status:200}):new Response('Not found',{status:404});};
  class RealEventSource{constructor(url){this.url=url;this.real=true;}}
  const window={fetch:network,EventSource:RealEventSource,Response,Headers,Request,URL,URLSearchParams,EventTarget,Event,MessageEvent,setTimeout,console,
    document:{currentScript:{src:`${ROOT}web-demo/static-api.js`},documentElement:{dataset:{}}},location:loc,
    history:{replaceState(_s,_t,url){const u=new URL(url,loc.href);Object.assign(loc,{href:u.href,pathname:u.pathname,search:u.search,hash:u.hash});}},
    addEventListener(type,f){(listeners[type]||=[]).push(f);}};
  window.window=window;
  runInNewContext(fs.readFileSync(path.join(site,'web-demo/static-api.js'),'utf8'),window,{filename:'static-api.js'});
  return {window,requests,loc,listeners,get:(url,init)=>window.fetch(url,init),post:(url,body)=>window.fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})};
}
test('web demo: the export is complete, reproducible and relative; the static mode answers the Stage and stays inert',async t=>{
  const a=path.join(tempDir(t,'cr-site-test-'),'site'),b=path.join(tempDir(t,'cr-site-test-'),'site');
  const built=await buildSite({out:a});await buildSite({out:b});
  assert.deepEqual(hashes(a),hashes(b),'the same recording builds the same site, byte for byte');
  assert(built.bytes<8*1048576,`the site stays small (${(built.bytes/1048576).toFixed(2)} MB)`);
  const m=JSON.parse(fs.readFileSync(path.join(a,'api/index.json'),'utf8')),id=m.project;
  assert.equal(m.title,TITLE);assert.equal(m.recording,'qualification/recordings/lumen-recipes');
  assert.deepEqual(Object.keys(m.recipe.families),[...FAMILIES,...PREVIEWS],'every built-in family is offered');
  assert(FAMILIES.includes(m.recipe.family),'the site opens on a flagship world');
  for(const r of Object.values(m.routes))assert(fs.existsSync(path.join(a,r.file)),r.file);
  for(const f of [m.recipe.file,...Object.values(m.recipe.families),...Object.values(m.recipe.previews)])assert(fs.existsSync(path.join(a,f)),f);
  // Only what a browser's Stage reads: no journal, no source content, no key, no description of the building machine.
  const published=Object.keys(hashes(a));
  assert(!published.some(f=>/events\.jsonl|blobs\/|receiver-auth|recipe\.json\.|state\.json/.test(f)),published.filter(f=>!/^(?:ui|worlds|vendor)\//.test(f)).join(', '));
  const status=JSON.parse(fs.readFileSync(path.join(a,m.routes['/api/status'].file),'utf8'));
  assert.equal(status.webDemo,true);for(const k of ['node','platform','wsl','port','dataDir'])assert(!(k in status),k);
  // The page: relative URLs only, the static mode before the engine, the landing after it.
  const page=fs.readFileSync(path.join(a,'index.html'),'utf8');
  assert.deepEqual([...page.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(x=>x[1]).filter(u=>u.startsWith('/')),[]);
  assert(page.indexOf('web-demo/static-api.js')<page.indexOf('score.js')&&page.indexOf('web-demo/demo.js')>page.indexOf('app.js'));
  assert.match(page,/Content-Security-Policy" content="default-src 'self'; connect-src 'self';/);
  assert.throws(()=>sitePage('<html></html>'),/no longer matches/,'a changed index.html fails the build');
  assert.deepEqual(absoluteLoads('x.js',"import('./a.js');fetch('/api/x')"),[]);assert.equal(absoluteLoads('x.js',"import('/a.js')").length,1);
  assert.equal(keyOf('/api/timeline','?limit=500&id=x&after=-1'),keyOf('/api/timeline','?after=-1&id=x&limit=500'));
  // The static mode: the Stage opens (any other route of the Control Center leads back to it).
  const s=staticMode(a,{hash:'#/home'});
  assert.equal(s.loc.hash,'#/stage');assert('webDemo' in s.window.document.documentElement.dataset);
  s.loc.hash='#/visual';s.listeners.hashchange[0]();assert.equal(s.loc.hash,'#/stage');
  // Every request the player makes for a replay (as qualification/site/web-demo.qual.js logged it), answered.
  const enc=encodeURIComponent(id);
  for(const url of ['/health','/api/projects','/api/settings','/api/presets','/api/compositions','/api/catalog','/api/status','/api/packs',
    `/api/preferences?id=${enc}`,`/api/evidence?id=${enc}`,`/api/highlight?id=${enc}`,`/api/project?id=${enc}`,`/api/recipe?id=${enc}`,
    `/api/timeline?id=${enc}&after=-1&limit=500`,`/api/timeline?id=${enc}&after=-1&limit=2000&fields=intents`,`/api/timeline?id=${enc}&after=${m.windows-1}&limit=200`]){
    const r=await s.get(url);assert.equal(r.status,200,url);await r.json();}
  const replay=await (await s.get(`/api/timeline?limit=500&after=-1&id=${enc}`)).json();
  assert.equal(replay.entries.length,m.windows);assert.equal(replay.total,m.windows);
  // The project answers 304 to its own ETag, as the receiver does (the player polls it every 3 s).
  const project=await s.get(`/api/project?id=${enc}`),etag=project.headers.get('etag');
  assert(etag);assert.equal((await s.get(`/api/project?id=${enc}`,{headers:{'If-None-Match':etag}})).status,304);
  assert.equal((await project.json()).projectId,id);
  // What was not exported answers 404 without a request; the site's files are read once.
  const before=s.requests.length;
  assert.equal((await s.get('/api/integrations')).status,404);assert.equal((await s.get(`/api/recipe/tunable?id=${enc}`)).status,404);
  await s.get('/health');assert.equal(s.requests.length,before);
  assert(s.requests.every(u=>u.startsWith(ROOT)),'every request stays under the site path');
  // POST: a control session, the world families (for this page only), and nothing that needs a receiver.
  assert.equal((await (await s.post('/api/session',{})).json()).capability,'web-demo');
  assert.equal((await (await s.get(`/api/recipe?id=${enc}`)).json()).family,m.recipe.family);
  const chosen=await (await s.post(`/api/recipe?id=${enc}`,{action:{type:'family',family:'machine-cathedral'}})).json();
  assert.equal(chosen.family,'machine-cathedral');assert.equal(chosen.title,TITLE);
  assert.equal((await (await s.get(`/api/recipe?id=${enc}`)).json()).family,'machine-cathedral');
  assert.equal(s.window.ResonanceStatic.family,'machine-cathedral');
  const labels=await (await s.post(`/api/recipe?id=${enc}`,{action:{type:'overrides',labels:'explorer'}})).json();
  assert.equal(labels.family,'machine-cathedral','an edit is not stored: the recipe shown stays as it was');
  const preview=await (await s.post(`/api/recipe/preview?id=${enc}`,{actions:[{type:'family',family:'synaptic-storm'}]})).json();
  assert.equal(preview.recipe.family,'synaptic-storm');assert(preview.tunable&&preview.runtime);
  assert.equal((await s.post(`/api/recipe/preview?id=${enc}`,{actions:[{type:'tune',values:{}}]})).status,403);
  const prefs=await s.post(`/api/preferences?id=${enc}`,{patch:{world:'construct'}});assert.equal(prefs.status,200);assert.equal((await prefs.json()).world,null);
  const refused=await s.post('/api/packs/trust',{id:'x',digest:'0'.repeat(64),trusted:true});
  assert.equal(refused.status,403);assert.equal((await refused.json()).code,'web-demo');
  // The change feed: a stand-in that opens once; other event streams are the browser's own.
  const feed=new s.window.EventSource('/api/changes');const hello=await new Promise(r=>feed.addEventListener('hello',r));
  assert.equal(JSON.parse(hello.data).type,'hello');feed.close();assert.equal(feed.readyState,2);
  assert.equal(new s.window.EventSource('https://example.org/stream').real,true);
  // Requests elsewhere are not the static mode's.
  assert.equal((await s.get('https://example.org/x')).status,599);
});

#!/usr/bin/env node
'use strict';
// npm run site: the web demo, a static copy of the player that needs no installation (GitHub Pages).
// The public recording qualification/recordings/lumen-recipes (a real session, already in this repository) is copied
// into a temporary data directory, a receiver is started on it in this process (port 0, loopback, never the default
// port), and every read-only answer the Performance Stage needs for a replay is fetched from it and written to
// <out>/api/ as files, with a manifest that maps each request (path and sorted query) to its file. The player (public/)
// is copied beside them; the page is public/index.html with relative URLs and the static mode (public/web-demo/:
// static-api.js answers /api/* from the files, demo.js is the landing). Nothing else is published: no journal, no
// content, no key; only what the Stage of any browser reads from a receiver, for this one recording.
//   node scripts/build-site.js [--out site] [--serve [--port N]]
//   --serve: after building, serve <out> at http://127.0.0.1:<port>/code-resonance/ (as GitHub Pages does) until Ctrl+C.
const fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const REPO=path.resolve(__dirname,'..');
const PUBLIC=path.join(REPO,'public');
const RECORDING=path.join(REPO,'qualification','recordings','lumen-recipes');
// The world the demo opens on (the saved identity's family).
const DEMO_FAMILY='stellar-forge';
// The recording's public title: what the Stage shows (a recipe has none until someone names it in the Visual Studio).
const TITLE='Lumen Recipes';
const MANIFEST_SCHEMA='code-resonance.web-demo.v1';
// GitHub Pages serves a project site under /<repository>/: --serve does the same, so relative URLs are what is tested.
const PREFIX='/code-resonance/';
// A request's key: its path and its query parameters in sorted order (the static mode computes the same key).
function keyOf(pathname,search=''){const q=new URLSearchParams(search);q.sort();const s=q.toString();return s?`${pathname}?${s}`:pathname;}
// A readable file name for a key, without the project id (there is one project).
function fileOf(key,id){
  const u=new URL(key,'http://x');const parts=[u.pathname.replace(/^\/(?:api\/)?/,'').replace(/\//g,'-')];
  for(const [k,v] of u.searchParams)if(!(k==='id'&&v===id))parts.push(`${k}${v}`);
  return parts.join('_').replace(/[^a-z0-9.-]+/gi,'_').replace(/^-|_$/g,'')+'.json';
}
// Root-absolute loads the browser makes itself (module imports, stylesheets, scripts): under a sub-path they would
// leave the site. Requests to /api/ and /health are answered by the static mode and never reach the network.
const ABSOLUTE_LOADS=[/\bimport\(\s*['"`]\/(?!\/)/g,/\bfrom\s*['"]\/(?!\/)/g,/\b(?:src|href)\s*=\s*["']\/(?!\/)/g,/url\(\s*['"]?\/(?!\/)/g,/[`'"]\/(?:ui|worlds|vendor)\/[^`'"\s]*\.(?:js|css)\b/g];
// The isolated pack frame (its page and its worker) is served by a receiver only; packs are not part of the web demo.
const ABSOLUTE_ALLOWED=new Set(['worlds/frame.js','worlds/remote.js']);
function absoluteLoads(rel,text){
  if(ABSOLUTE_ALLOWED.has(rel))return [];
  const found=[];for(const re of ABSOLUTE_LOADS)for(const m of text.matchAll(re)){const line=text.slice(0,m.index).split('\n').length;found.push(`${rel}:${line}: ${text.slice(m.index,m.index+60).split('\n')[0]}`);}
  return found;
}
// public/index.html with relative URLs, the static mode first (before the engine reads anything) and the landing after
// the engine. Every change is checked to apply, so a changed index.html fails the build instead of a broken site.
function sitePage(html){
  const edits=[
    [/(<meta name="color-scheme" content="dark">)/,`$1
  <meta name="description" content="Code Resonance in your browser: a real recorded software project replayed as a live audiovisual performance. Nothing is installed and nothing is sent anywhere.">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">`],
    [/<title>Code Resonance<\/title>/,'<title>Code Resonance · Web demo</title>'],
    [/(<link rel="stylesheet" href="\/style.css">)/,'$1\n  <link rel="stylesheet" href="web-demo/demo.css">'],
    [/(\n\s*)(<script src="\/score.js" defer><\/script>)/,'$1<script src="web-demo/static-api.js"></script>$1$2'],
    [/(<script src="\/app.js" defer><\/script>)/,'$1\n  <script src="web-demo/demo.js" defer></script>'],
    [/\b(src|href)="\/(?!\/)/g,'$1="']];
  for(const [re,to] of edits){if(!re.test(html))throw new Error(`public/index.html no longer matches ${re}: update scripts/build-site.js`);re.lastIndex=0;html=html.replace(re,to);}
  return html;
}
async function copyPublic(out){
  const files=[];
  async function walk(dir){
    for(const e of await fsp.readdir(path.join(PUBLIC,dir),{withFileTypes:true})){
      const rel=dir?`${dir}/${e.name}`:e.name;
      if(e.name.startsWith('.'))continue;
      if(e.isDirectory()){await walk(rel);continue;}
      if(!e.isFile()||rel==='index.html')continue;
      await fsp.mkdir(path.dirname(path.join(out,rel)),{recursive:true});await fsp.copyFile(path.join(PUBLIC,rel),path.join(out,rel));files.push(rel);
    }
  }
  await walk('');return files.sort();
}
async function until(what,fn,ms=60000){const t0=Date.now();for(;;){const v=await fn().catch(()=>null);if(v)return v;if(Date.now()-t0>ms)throw new Error(`Timed out waiting for ${what}`);await new Promise(r=>setTimeout(r,150));}}
// The answers, fetched from a receiver started in this process on a temporary copy of the recording.
async function exportApi(log){
  const {createService}=require('../receiver/server');
  const {FAMILIES,PREVIEWS}=require('../engine/recipe');
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'cr-site-'));
  let svc=null;
  try{
    await fsp.cp(path.join(RECORDING,'projects'),path.join(dir,'projects'),{recursive:true});
    const projects=fs.readdirSync(path.join(dir,'projects')).filter(n=>/^[0-9a-f]{64}$/.test(n));
    if(projects.length!==1)throw new Error(`Expected one recorded project in ${path.relative(REPO,RECORDING)}, found ${projects.length}`);
    const id=fs.readFileSync(path.join(dir,'projects',projects[0],'id'),'utf8').trim();
    // The receiver prints where it listens and its data folder (both temporary); the pairing link is not printed.
    const quietLog=console.log;console.log=(...a)=>{if(!String(a[0]).startsWith('[CODE RESONANCE]'))quietLog(...a);};
    try{svc=await createService({port:0,dataDir:dir,quiet:true}).start();}finally{console.log=quietLog;}
    const url=`http://127.0.0.1:${svc.port}`;
    const get=async p=>{const r=await fetch(url+p);if(!r.ok)throw new Error(`GET ${p}: HTTP ${r.status}`);return {text:await r.text(),etag:r.headers.get('etag')};};
    // The journal is interpreted when the receiver starts; the evidence document is built in the background.
    await fetch(url+'/v1/flush',{method:'POST',headers:{Authorization:`Bearer ${svc.token}`}});
    await until('the projection',async()=>{const r=await fetch(`${url}/api/project?id=${id}`);return r.ok;});
    await until('the evidence',async()=>{const r=await fetch(`${url}/api/evidence?id=${id}`);return r.ok&&!(await r.json()).building;});
    const capability=(await (await fetch(url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({pairing:svc.pairing})})).json()).capability;
    const post=async(p,body)=>{const r=await fetch(url+p,{method:'POST',headers:{'Content-Type':'application/json',Origin:url,'X-Resonance-Capability':capability},body:JSON.stringify(body)});
      const t=await r.text();if(!r.ok)throw new Error(`POST ${p}: HTTP ${r.status} ${t.slice(0,200)}`);return JSON.parse(t);};
    const enc=encodeURIComponent(id);
    // The identity as its author would publish it: the world it opens on and the recording's public title, given in the
    // Visual Studio's way. Generator 5 would choose Temporal Terrain for this recording; the demo keeps opening on the
    // world it has opened on since it was first published, and the other worlds are a click away.
    await get(`/api/recipe?id=${enc}`);
    await post(`/api/recipe?id=${enc}`,{actions:[{type:'family',family:DEMO_FAMILY},{type:'title',title:TITLE}]});
    const project=JSON.parse((await get(`/api/project?id=${enc}`)).text);
    // A recipe's createdAt is the moment it was generated (here: now); it is pinned to the recording's last moment, so
    // the same recording always builds the same files.
    const pin=r=>({...r,createdAt:project.updatedAt});
    const files=new Map(),routes={};
    const put=(key,text,{etag=null}={})=>{const file=`api/${fileOf(key,id)}`;if(files.has(file))throw new Error(`Two requests share ${file}`);files.set(file,text);routes[key]={file,...(etag?{etag}:{})};};
    const json=x=>JSON.stringify(x);
    for(const p of ['/health','/api/projects','/api/catalog','/api/settings','/api/presets','/api/compositions','/api/packs',
      `/api/preferences?id=${enc}`,`/api/evidence?id=${enc}`,`/api/highlight?id=${enc}`]){const r=await get(p);const u=new URL(p,url);put(keyOf(u.pathname,u.search),r.text);}
    {const r=await get(`/api/project?id=${enc}`);put(keyOf('/api/project',`?id=${enc}`),r.text,{etag:r.etag});}
    // The receiver's status, without what describes the machine that built the site (Node, platform, port, times).
    {const s=JSON.parse((await get('/api/status')).text);
      put('/api/status',json({version:s.version,sdk:s.sdk,startedAt:null,uptimeMs:0,loopbackOnly:true,worker:{lastProjectionAt:null,errors:0},projects:s.projects,packs:s.packs,capabilities:0,webDemo:true}));}
    // The timeline, page by page exactly as the player asks for it: the replay (500 windows a page), the history's
    // intents (2000 a page, live mode), and the live poll after the last window (empty: the recording has ended).
    const pages=async(query,next)=>{let after=-1;for(let guard=0;guard<10000;guard++){
      const q=`?id=${enc}&after=${after}&${query}`,r=await get(`/api/timeline${q}`),page=JSON.parse(r.text);put(keyOf('/api/timeline',q),r.text);
      const n=next(page,after);if(n===null)return page.total;after=n;}throw new Error('timeline paging did not end');};
    let seen=0;
    const total=await pages('limit=500',p=>{seen+=p.entries.length;return !p.entries.length||seen>=p.total?null:p.entries.at(-1).seq;});
    await pages('limit=2000&fields=intents',p=>!p.entries.length||p.entries.at(-1).seq>=p.total-1?null:p.entries.at(-1).seq);
    {const q=`?id=${enc}&after=${total-1}&limit=200`;put(keyOf('/api/timeline',q),(await get(`/api/timeline${q}`)).text);}
    // The worlds: the saved identity, and the same identity in each built-in family (what choosing a family in the
    // Visual Studio previews and saves). The static mode answers GET /api/recipe with the family last chosen.
    const saved=pin(JSON.parse((await get(`/api/recipe?id=${enc}`)).text));
    const recipes={},previews={};
    for(const family of [...FAMILIES,...PREVIEWS]){
      const r=await post(`/api/recipe/preview?id=${enc}`,{actions:[{type:'family',family}]});
      if(r.recipe?.family!==family)throw new Error(`The preview of ${family} answered ${r.recipe?.family}`);
      const preview={...r,recipe:pin(r.recipe)};
      recipes[family]=`api/recipe_${family}.json`;files.set(recipes[family],json(preview.recipe));
      previews[family]=`api/recipe-preview_${family}.json`;files.set(previews[family],json(preview));
    }
    files.set('api/recipe.json',json(saved));
    const manifest={schema:MANIFEST_SCHEMA,version:JSON.parse((await get('/health')).text).version,project:id,title:TITLE,
      recording:path.relative(REPO,RECORDING).split(path.sep).join('/'),
      windows:total,
      recipe:{file:'api/recipe.json',family:saved.family,families:recipes,previews,previewFamilies:[...PREVIEWS]},routes};
    files.set('api/index.json',JSON.stringify(manifest,null,1));
    log?.(`exported ${Object.keys(routes).length} GET answers and ${Object.keys(recipes).length} worlds for ${TITLE} (${total} windows)`);
    return {files,manifest};
  }finally{
    if(svc)await svc.stop();
    await fsp.rm(dir,{recursive:true,force:true});
  }
}
async function buildSite({out=path.join(REPO,'site'),log=null}={}){
  out=path.resolve(out);
  if(out===REPO||out===PUBLIC||REPO.startsWith(out+path.sep))throw new Error(`Refusing to build into ${out}`);
  const {files,manifest}=await exportApi(log);
  await fsp.rm(out,{recursive:true,force:true});await fsp.mkdir(out,{recursive:true});
  const copied=await copyPublic(out);
  const page=sitePage(await fsp.readFile(path.join(PUBLIC,'index.html'),'utf8'));
  await fsp.writeFile(path.join(out,'index.html'),page);
  for(const [rel,text] of files){await fsp.mkdir(path.dirname(path.join(out,rel)),{recursive:true});await fsp.writeFile(path.join(out,rel),text);}
  // GitHub Pages deploys the artifact as it is; .nojekyll also keeps a branch-based Pages from running Jekyll on it.
  await fsp.writeFile(path.join(out,'.nojekyll'),'');
  // Every page, script and stylesheet loads what it needs relatively, and every route has its file.
  const problems=[];
  for(const rel of [...copied,'index.html'])if(/\.(?:js|css|html)$/.test(rel))problems.push(...absoluteLoads(rel,await fsp.readFile(path.join(out,rel),'utf8')));
  for(const [key,r] of Object.entries(manifest.routes))if(!files.has(r.file))problems.push(`${key}: ${r.file} missing`);
  if(problems.length)throw new Error(`The site would not work under a sub-path:\n  ${problems.join('\n  ')}`);
  let bytes=0,count=0;
  const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else{bytes+=fs.statSync(f).size;count++;}}};walk(out);
  log?.(`site: ${count} files, ${(bytes/1048576).toFixed(2)} MB in ${path.relative(process.cwd(),out)||'.'}`);
  return {out,manifest,files:count,bytes};
}
// A static server for the built site, under the GitHub Pages sub-path (loopback; port 0 picks a free one).
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
function serve(root,{port=0,prefix=PREFIX}={}){
  root=path.resolve(root);
  const server=http.createServer(async(req,res)=>{
    const u=new URL(req.url,'http://x');
    if(u.pathname===prefix.slice(0,-1)){res.writeHead(301,{Location:prefix+u.search});res.end();return;}
    let rel=null;try{rel=u.pathname.startsWith(prefix)?decodeURIComponent(u.pathname.slice(prefix.length)):null;}catch{}
    const file=rel===null?null:path.join(root,rel.endsWith('/')||rel===''?rel+'index.html':rel);
    if(!file||!file.startsWith(root+path.sep)||req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return;}
    try{const body=await fsp.readFile(file);res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);}
    catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve({server,port:server.address().port,url:`http://127.0.0.1:${server.address().port}${prefix}`,close:()=>new Promise(r=>server.close(()=>r()))}));});
}
module.exports={buildSite,serve,keyOf,fileOf,sitePage,absoluteLoads,TITLE,PREFIX,MANIFEST_SCHEMA};
if(require.main===module){
  const args=process.argv.slice(2),flag=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
  const out=path.resolve(flag('out')||path.join(REPO,'site'));
  buildSite({out,log:m=>console.log(m)}).then(async()=>{
    if(!args.includes('--serve'))return;
    const port=Number(flag('port')||0);if(port===4174)throw new Error('Port 4174 belongs to the receiver: choose another');
    const s=await serve(out,{port});console.log(`Serving the web demo at ${s.url} (Ctrl+C stops it)`);
  }).catch(e=>{console.error(e.message||e);process.exitCode=1;});
}

'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const fss=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const readline=require('node:readline');
const {promisify}=require('node:util');
const gzip=promisify(zlib.gzip);
const {Worker}=require('node:worker_threads');
const {validateEvent,sha}=require('./protocol');
const recipes=require('../engine/recipe');
const packs=require('../engine/packs');
const VERSION=require('../package.json').version;
const PUBLIC=path.resolve(__dirname,'../public');
const FILENAMES=new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/style.css','style.css'],['/music.js','music.js'],['/score.js','score.js'],
  ['/construct.js','construct.js'],['/vendor/three.module.min.js','vendor/three.module.min.js']]);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
// The isolated frame executable visual packs run in (sandbox="allow-scripts" gives it an opaque origin): it may load only
// the public world modules and blob: URLs it creates from code the player hands it, and it can reach no network at all.
const FRAME_HTML='<!doctype html><html><head><meta charset="utf-8"><title>Code Resonance visual pack</title>'+
  '<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style></head>'+
  '<body><canvas id="world"></canvas><canvas id="overlay"></canvas><script type="module" src="/worlds/frame.js"></script></body></html>';
const FRAME_PERMISSIONS='camera=(), microphone=(), geolocation=(), display-capture=(), clipboard-read=(), clipboard-write=(), usb=(), serial=(), hid=(), bluetooth=(), payment=(), fullscreen=()';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function response(res,code,obj){res.writeHead(code,JSON_HEADERS);res.end(JSON.stringify(obj));}
function validId(id){return typeof id==='string'&&/^[a-z0-9-]{12,128}$/i.test(id);}
function tokenMatches(header,token){
  const a=Buffer.from(String(header||'')),b=Buffer.from(`Bearer ${token}`);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
// A crash mid-append can leave a final line without its newline; terminate it so the next record stays parseable.
async function terminateJournal(file){
  let fd;try{fd=await fs.open(file,'r');}catch(e){if(e.code==='ENOENT')return '';throw e;}
  try{const {size}=await fd.stat();if(!size)return '';const b=Buffer.alloc(1);await fd.read(b,0,1,size-1);return b[0]===10?'':'\n';}
  finally{await fd.close();}
}
function createService(options={}) {
  const dataDir=path.resolve(options.dataDir||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
  const intervalMs=Number(options.sortIntervalMs)||1000;
  const windowMs=Number(options.windowMs)||5000,graceMs=Number(options.graceMs??1500);
  const port=Number(options.port??process.env.RESONANCE_PORT??4174);
  const host=options.host||'127.0.0.1';
  if(!['127.0.0.1','::1','localhost'].includes(host)&&process.env.RESONANCE_ALLOW_REMOTE!=='1')throw new Error('Refusing non-loopback bind: set RESONANCE_ALLOW_REMOTE=1 explicitly');
  let server,worker,token,actualPort,closing=false;
  const flight=new Map();let cursor=0;
  const writes=new Map();const checkedJournals=new Set();
  let lastReceivedAt=0;
  // Derived views are cached in memory, fed by the worker; requests never parse checkpoint files.
  const projections=new Map();const timelines=new Map();
  const registry=packs.createRegistry(dataDir);
  const projectDir=id=>path.join(dataDir,'projects',sha(id));
  function appendEvents(projectId,events) {
    const previous=writes.get(projectId)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      const dir=projectDir(projectId);
      await fs.mkdir(dir,{recursive:true,mode:0o700});
      await fs.writeFile(path.join(dir,'id'),projectId,{mode:0o600});
      const prepared=[];
      for(const item of events){
        if(typeof item.content==='string'){
          const blobId=sha(item.content);
          const folder=path.join(dir,'blobs');await fs.mkdir(folder,{recursive:true,mode:0o700});
          const blobFile=path.join(folder,blobId+'.gz');
          try{await fs.access(blobFile);}catch{
            const compressed=await gzip(Buffer.from(item.content,'utf8'),{level:5});
            try{await fs.writeFile(blobFile,compressed,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
          }
          const {content,...rest}=item;
          prepared.push({...rest,contentHash:blobId});
        }else prepared.push(item);
      }
      // receivedAt is stamped immediately before the append and never decreases: interpretation windows derive from it.
      const receivedAt=lastReceivedAt=Math.max(lastReceivedAt,Date.now());
      const journal=path.join(dir,'events.jsonl');
      let prefix='';if(!checkedJournals.has(projectId)){prefix=await terminateJournal(journal);checkedJournals.add(projectId);}
      await fs.appendFile(journal,prefix+prepared.map(e=>JSON.stringify({...e,receivedAt})).join('\n')+'\n',{mode:0o600});
    });
    writes.set(projectId,next);
    return next;
  }
  function ask(message) {
    return new Promise((resolve,reject)=>{
      const id=++cursor;
      const timer=setTimeout(()=>{flight.delete(id);reject(new Error('Sort timeout'));},120000);
      flight.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
      worker.postMessage({...message,requestId:id});
    });
  }
  // A flush closes the open window by recording that decision in the journal, so a rebuild makes the same cut.
  async function flush(projectId) {
    if(projectId)await appendEvents(projectId,[{v:1,id:`control-${crypto.randomUUID()}`,ts:Date.now(),kind:'control.window.close',projectId}]);
    return ask({type:'flush',projectId});
  }
  async function projection(id){
    if(!validId(id))return null;
    if(projections.has(id))return projections.get(id);
    try{
      const json=await fs.readFile(path.join(projectDir(id),'public.json'),'utf8');
      const p=JSON.parse(json);if(p.projectId!==id)return null;
      const entry={json,etag:`"${sha(json).slice(0,16)}"`,summary:{id,updatedAt:p.updatedAt,events:p.stats.raw,chapter:p.performance.chapter,frames:p.timelineFrames||0,name:p.name||null}};
      projections.set(id,entry);return entry;
    }catch{return null;}
  }
  async function listProjects(){
    const base=path.join(dataDir,'projects');let dir=[];
    try{dir=await fs.readdir(base,{withFileTypes:true});}catch{return [];}
    const items=[];
    for(const entry of dir) {
      if(!entry.isDirectory()||!/^[0-9a-f]{64}$/.test(entry.name))continue;
      try{
        const id=await fs.readFile(path.join(base,entry.name,'id'),'utf8');
        if(sha(id)!==entry.name)continue;
        items.push((await projection(id))?.summary||{id,updatedAt:null,events:0,chapter:1,frames:0,name:null});
      }catch{}
    }
    return items.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  }
  // Byte index into performance.jsonl so timeline pages are read directly, never by loading the whole history.
  async function timelineIndex(id){
    if(timelines.has(id))return timelines.get(id);
    const entries=[];let offset=0;
    try{
      const rl=readline.createInterface({input:fss.createReadStream(path.join(projectDir(id),'performance.jsonl')),crlfDelay:Infinity});
      for await(const line of rl){
        const length=Buffer.byteLength(line)+1;
        const m=/^\{"seq":(\d+),"start":(\d+),"end":(\d+),/.exec(line);
        if(m)entries.push({seq:Number(m[1]),offset,length,start:Number(m[2]),end:Number(m[3])});
        offset+=length;
      }
    }catch(e){if(e.code!=='ENOENT')throw e;}
    timelines.set(id,entries);return entries;
  }
  async function readTimeline(id,after,limit){
    const index=await timelineIndex(id);
    let lo=0,hi=index.length;while(lo<hi){const mid=(lo+hi)>>1;if(index[mid].seq<=after)lo=mid+1;else hi=mid;}
    const page=index.slice(lo,lo+limit);
    if(!page.length)return {entries:[],total:index.length};
    const from=page[0].offset,to=page.at(-1).offset+page.at(-1).length;
    const fd=await fs.open(path.join(projectDir(id),'performance.jsonl'),'r');
    try{const buf=Buffer.alloc(to-from);await fd.read(buf,0,buf.length,from);
      return {entries:buf.toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)),total:index.length};}
    finally{await fd.close();}
  }
  // Visual recipe: generated from the project's traits on first request, provisional until founded, then permanent.
  const recipeLocks=new Map();
  function withRecipeLock(id,fn){const prev=recipeLocks.get(id)||Promise.resolve();const next=prev.catch(()=>{}).then(fn);recipeLocks.set(id,next);return next;}
  async function readRecipe(id){try{return JSON.parse(await fs.readFile(path.join(projectDir(id),'recipe.json'),'utf8'));}catch{return null;}}
  async function writeRecipe(id,recipe){const f=path.join(projectDir(id),'recipe.json'),tmp=`${f}.${process.pid}.tmp`;await fs.writeFile(tmp,JSON.stringify(recipe,null,1),{mode:0o600});await fs.rename(tmp,f);}
  function loadRecipe(id,entry){return withRecipeLock(id,async()=>{
    const stored=await readRecipe(id);const {recipe,changed}=recipes.resolve(stored,JSON.parse(entry.json),Date.now(),registry.snapshot());
    if(changed)await writeRecipe(id,recipe);return recipe;});}
  function editRecipe(id,entry,action){return withRecipeLock(id,async()=>{
    const project=JSON.parse(entry.json),known=registry.snapshot();const current=recipes.resolve(await readRecipe(id),project,Date.now(),known).recipe;
    const next=recipes.update(current,action,project,Date.now(),known);await writeRecipe(id,next);return next;});}
  // What the player may know about installed packs (never their location on disk).
  const publicPack=p=>({id:p.id,name:p.name,version:p.version,kind:p.kind,sdk:p.sdk,author:p.author,description:p.description,license:p.license,digest:p.digest,
    files:p.files,executable:p.executable,trusted:p.trusted,compatible:p.compatible,ok:p.ok,problems:p.problems,installedAt:p.installedAt,
    family:p.family?{id:p.family.id,name:p.family.name,effects:p.family.effects,ambient:p.family.ambient,budget:p.family.budget}:null,base:p.overlay?.base||null});
  async function readBody(req,res,limit){
    if((req.headers['content-type']||'').split(';')[0]!=='application/json'){response(res,415,{error:'Expected application/json'});return null;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit){response(res,413,{error:'Too large'});return null;}chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{response(res,400,{error:'Invalid JSON'});return null;}
  }
  async function exportProject(res,id,entry){
    const p=JSON.parse(entry.json);
    res.writeHead(200,{...JSON_HEADERS,'Content-Disposition':`attachment; filename="code-resonance-${id.slice(0,10)}.json"`});
    res.write(`{"schema":"code-resonance.export.v2","projectId":${JSON.stringify(id)},"interpretationVersion":${JSON.stringify(p.interpretationVersion)},"stats":${JSON.stringify(p.stats)},"sessions":${JSON.stringify(p.sessions)},"timeline":[`);
    let first=true;
    try{
      const rl=readline.createInterface({input:fss.createReadStream(path.join(projectDir(id),'performance.jsonl')),crlfDelay:Infinity});
      for await(const line of rl){if(!line)continue;if(!res.write((first?'':',')+line))await new Promise(r=>res.once('drain',r));first=false;}
    }catch(e){if(e.code!=='ENOENT')throw e;}
    res.end(']}');
  }
  async function handler(req,res){
    try{
      const hostHeader=(req.headers.host||'').toLowerCase();
      const allowedHost=/^(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(hostHeader);
      if(!allowedHost){response(res,403,{error:'Localhost Host header required'});return;}
      const expectedOrigins=[`http://localhost:${actualPort}`,`http://127.0.0.1:${actualPort}`,`http://[::1]:${actualPort}`];
      const u=new URL(req.url,`http://localhost:${actualPort}`);
      const pathname=u.pathname;
      const worldFile=/^\/worlds\/[a-z0-9-]+\.js$/.test(pathname)?pathname.slice(1):null;
      // The pack frame has an opaque origin ("null"): it may fetch the public world modules and three.js, nothing else.
      const frameAsset=req.method==='GET'&&req.headers.origin==='null'&&(worldFile||pathname==='/vendor/three.module.min.js');
      if(req.headers.origin&&!expectedOrigins.includes(req.headers.origin)&&!frameAsset){response(res,403,{error:'Cross-origin access forbidden'});return;}
      if(req.method==='GET'&&(FILENAMES.has(pathname)||worldFile)){
        const f=path.join(PUBLIC,worldFile||FILENAMES.get(pathname));
        if(worldFile&&!fss.existsSync(f)){response(res,404,{error:'Not found'});return;}
        const source=await fs.readFile(f);
        res.writeHead(200,{'Content-Type':MIME[path.extname(f)],'Cache-Control':'no-store',
          'Content-Security-Policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
          'X-Content-Type-Options':'nosniff',...(frameAsset?{'Access-Control-Allow-Origin':'*'}:{})});
        res.end(source);return;
      }
      if(req.method==='GET'&&pathname==='/pack-frame.html'){
        // CSP source lists cannot name IPv6 literals: the frame works when the player is opened on localhost or 127.0.0.1.
        const named=expectedOrigins.filter(o=>!o.includes('[')),scripts=named.flatMap(o=>[`${o}/worlds/`,`${o}/vendor/`]).join(' ');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
          'Permissions-Policy':FRAME_PERMISSIONS,'Cross-Origin-Resource-Policy':'same-origin',
          'Content-Security-Policy':`default-src 'none'; script-src ${scripts} blob:; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${named.join(' ')}`});
        res.end(FRAME_HTML);return;
      }
      // ---- Visual packs: installed with scripts/pack.js; the player lists them, reads approved files, records approvals.
      if(req.method==='GET'&&pathname==='/api/packs'){response(res,200,{sdk:packs.SDK_VERSION,packs:registry.list().map(publicPack)});return;}
      if(req.method==='GET'&&pathname==='/api/packs/file'){
        const p=registry.get(u.searchParams.get('id')||''),file=u.searchParams.get('path')||'';
        // Code is handed out only for approved packs, as inert text (the player passes it to the isolated frame).
        if(!p||!p.ok||(p.executable&&!p.trusted)){response(res,p?403:404,{error:p?'This pack contains code and has not been approved':'Pack not found'});return;}
        const buf=registry.read(p.id,file);if(!buf){response(res,404,{error:'File not found'});return;}
        res.writeHead(200,{'Content-Type':/\.(?:png|jpg)$/.test(file)?'application/octet-stream':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'});
        res.end(buf);return;
      }
      if(req.method==='POST'&&pathname==='/api/packs/trust'){
        // Approvals come from the player page itself (same origin), for the exact files the user reviewed (digest).
        if(!req.headers.origin||!expectedOrigins.includes(req.headers.origin)){response(res,403,{error:'Same-origin request required'});return;}
        const body=await readBody(req,res,4096);if(!body)return;
        if(typeof body.id!=='string'||typeof body.digest!=='string'||typeof body.trusted!=='boolean'){response(res,400,{error:'Expected {id, digest, trusted}'});return;}
        try{response(res,200,publicPack(packs.setTrust(body.id,dataDir,{digest:body.digest,trusted:body.trusted})));}catch(e){response(res,400,{error:e.message});}
        return;
      }
      if(req.method==='GET'&&pathname==='/health'){response(res,200,{ok:true,version:VERSION,sortIntervalMs:intervalMs,windowMs,graceMs});return;}
      if(req.method==='GET'&&pathname==='/api/projects'){response(res,200,{projects:await listProjects()});return;}
      const id=u.searchParams.get('id');
      if(req.method==='GET'&&pathname==='/api/project'){
        const entry=await projection(id);
        if(!entry){response(res,404,{error:'Project not found or not yet sorted'});return;}
        if(req.headers['if-none-match']===entry.etag){res.writeHead(304,{ETag:entry.etag,'Cache-Control':'no-cache'});res.end();return;}
        res.writeHead(200,{...JSON_HEADERS,'Cache-Control':'no-cache',ETag:entry.etag});res.end(entry.json);return;
      }
      if(req.method==='GET'&&(pathname==='/api/timeline'||pathname==='/api/replay')){
        if(!await projection(id)){response(res,404,{error:'Project not found'});return;}
        const after=Number(u.searchParams.get('after')??-1),limit=Math.max(1,Math.min(2000,Number(u.searchParams.get('limit'))||(pathname==='/api/replay'?2000:200)));
        const {entries,total}=await readTimeline(id,Number.isFinite(after)?after:-1,limit);
        // fields=intents: only each window's sequence number and intents, so a client can read a long history cheaply.
        const view=u.searchParams.get('fields')==='intents'?entries.map(x=>x.intents?.length?{seq:x.seq,intents:x.intents}:{seq:x.seq}):entries;
        response(res,200,{schema:'code-resonance.timeline.v1',projectId:id,total,entries:view});return;
      }
      if(req.method==='GET'&&pathname==='/v1/performance/frames'){
        if(!await projection(id)){response(res,404,{error:'Project not found'});return;}
        const index=await timelineIndex(id);const after=u.searchParams.get('after')||'';const last=index.at(-1)?.seq??-1;
        // Frame ids are `${projectId}:${seq+1}`.
        const version=after.startsWith(id+':')?Number(after.slice(id.length+1)):NaN;
        const from=Number.isInteger(version)&&version>=1&&version-1<=last?version-1:Math.max(-1,last-(after?40:200));
        const {entries}=await readTimeline(id,from,200);
        response(res,200,{schema:'code-resonance.performance.v1',projectId:id,frames:entries.map(x=>x.frame)});return;
      }
      if(pathname==='/api/recipe'&&(req.method==='GET'||req.method==='POST')){
        const entry=await projection(id);
        if(!entry){response(res,404,{error:'Project not found'});return;}
        if(req.method==='POST'){
          // Recipe edits come from the player page itself: same origin required (a browser always sends Origin on POST).
          if(!req.headers.origin||!expectedOrigins.includes(req.headers.origin)){response(res,403,{error:'Same-origin request required'});return;}
          if((req.headers['content-type']||'').split(';')[0]!=='application/json'){response(res,415,{error:'Expected application/json'});return;}
          let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){response(res,413,{error:'Too large'});return;}chunks.push(chunk);}
          let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{response(res,400,{error:'Invalid JSON'});return;}
          try{response(res,200,await editRecipe(id,entry,body.action));}catch(e){response(res,400,{error:e.message});}
          return;
        }
        // fallback=1: the identity without any pack (shown while a pack with code awaits approval); never stored.
        if(u.searchParams.get('fallback')==='1'){const stored=await readRecipe(id);response(res,200,recipes.resolve(stored,JSON.parse(entry.json),Date.now(),{byId:{},families:{}}).recipe);return;}
        response(res,200,await loadRecipe(id,entry));return;
      }
      if(req.method==='GET'&&pathname==='/api/export'){
        const entry=await projection(id);
        if(!entry){response(res,404,{error:'Project not found'});return;}
        await exportProject(res,id,entry);return;
      }
      if(req.method==='POST'&&(pathname==='/v1/events'||pathname==='/v1/flush'||pathname==='/v1/rebuild')) {
        if(!tokenMatches(req.headers.authorization,token)){response(res,401,{error:'Receiver token required'});return;}
        if(pathname==='/v1/flush'||pathname==='/v1/rebuild') {
          if(id&&!validId(id)){response(res,400,{error:'Invalid project'});return;}
          if(pathname==='/v1/rebuild'&&!id){response(res,400,{error:'Project id required'});return;}
          const result=pathname==='/v1/flush'?await flush(id||undefined):await ask({type:'rebuild',projectId:id});
          response(res,result.error?500:200,result);return;
        }
        if((req.headers['content-type']||'').split(';')[0]!=='application/json'){response(res,415,{error:'Expected application/json'});return;}
        let size=0;const chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>512*1024){response(res,413,{error:'Batch exceeds 512 KiB'});return;}chunks.push(chunk);}
        let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{response(res,400,{error:'Invalid JSON'});return;}
        if(!parsed||!Array.isArray(parsed.events)||parsed.events.length<1||parsed.events.length>100){response(res,400,{error:'Expected 1-100 events'});return;}
        // Valid events are kept even when a sibling in the batch is rejected; rejections are reported per event.
        const events=[],rejected=[];
        parsed.events.forEach((raw,index)=>{try{events.push(validateEvent(raw));}catch(e){rejected.push({index,id:typeof raw?.id==='string'?raw.id.slice(0,120):null,error:e.message});}});
        if(!events.length){response(res,422,{error:rejected[0]?.error||'No valid events',rejected});return;}
        const ids=[...new Set(events.map(e=>e.projectId))];
        if(ids.length!==1){response(res,422,{error:'Batch must target one project'});return;}
        await appendEvents(ids[0],events);
        response(res,202,{accepted:events.length,rejected,projectId:ids[0],status:'persisted; awaiting interpretation'});return;
      }
      response(res,404,{error:'Not found'});
    }catch(error){if(!res.headersSent)response(res,500,{error:'Receiver failure'});else res.destroy();console.error('[resonance receiver]',error);}
  }
  return {
    get dataDir(){return dataDir;},get port(){return actualPort;},get token(){return token;},
    async start(){
      await fs.mkdir(dataDir,{recursive:true,mode:0o700});
      const authFile=path.join(dataDir,'receiver-auth.json');
      try{const a=JSON.parse(await fs.readFile(authFile,'utf8'));token=String(a.token||'');if(token.length<40)throw Error('Invalid token');}
      catch{token=crypto.randomBytes(32).toString('hex');await fs.writeFile(authFile,JSON.stringify({version:1,token,port}),{mode:0o600});}
      await fs.chmod(authFile,0o600).catch(()=>{});
      worker=new Worker(path.resolve(__dirname,'../engine/worker.js'),{workerData:{dataDir,intervalMs,windowMs,graceMs}});
      worker.on('message',m=>{
        if(m.type==='log')console.warn('[sorter]',m.message);
        if(m.type==='projection'){
          projections.set(m.projectId,{json:m.json,etag:`"${sha(m.json).slice(0,16)}"`,summary:m.summary});
          if(m.reset)timelines.delete(m.projectId);
          const index=timelines.get(m.projectId);if(index)index.push(...m.appended.filter(x=>x.seq>(index.at(-1)?.seq??-1)));
        }
        if(m.type==='flushed'&&flight.has(m.requestId)){const action=flight.get(m.requestId);flight.delete(m.requestId);action.resolve(m);}
      });
      worker.on('error',e=>console.error('[sorter worker error]',e));
      server=http.createServer(handler);
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
      actualPort=server.address().port;
      // Auth hint stores port for VS Code extension, not an invitation to bind outside loopback.
      await fs.writeFile(authFile,JSON.stringify({version:1,token,port:actualPort}),{mode:0o600});
      console.log(`[CODE RESONANCE] Receiver listening: http://${host}:${actualPort}`);
      console.log(`[CODE RESONANCE] Local data: ${dataDir}`);
      return this;
    },
    flush,
    async stop(){
      if(closing)return;closing=true;
      await new Promise(resolve=>server?server.close(resolve):resolve());await Promise.allSettled([...writes.values()]);
      if(worker){await Promise.race([ask({type:'shutdown'}).catch(()=>{}),new Promise(r=>setTimeout(r,10000))]);await worker.terminate();}
    }
  };
}
if(require.main===module){
  const args=process.argv.slice(2);
  const get=k=>{const index=args.indexOf(k);return index<0?undefined:args[index+1];};
  createService({port:get('--port')?Number(get('--port')):undefined,dataDir:get('--data'),sortIntervalMs:get('--sort-ms')?Number(get('--sort-ms')):undefined}).start().catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={createService};

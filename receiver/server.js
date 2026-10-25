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
const {createControl}=require('./control');
const store=require('./store');
const {createEvidence}=require('./evidence');
const {createChanges}=require('./changes');
const {createImports}=require('./pack-import');
const recipes=require('../engine/recipe');
const packs=require('../engine/packs');
const catalog=require('../engine/catalog');
const claudeHooks=require('../scripts/hooks/install-claude-code');
const VERSION=require('../package.json').version;
const EXTENSION=require('../extension/package.json');
const REPO=path.resolve(__dirname,'..');
const PUBLIC=path.join(REPO,'public');
const FILENAMES=new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/style.css','style.css'],['/music.js','music.js'],['/score.js','score.js'],
  ['/construct.js','construct.js'],['/recording.js','recording.js'],['/vendor/three.module.min.js','vendor/three.module.min.js']]);
// The Control Center's modules: one optional folder level, lowercase names (the pattern alone keeps requests inside public/ui).
const UI_FILE=/^\/ui\/(?:[a-z0-9-]+\/)?[a-z0-9-]+\.(?:js|css|svg)$/;
// Windows opens a device for these names (with any extension, before Windows 11): never a file the receiver serves.
const DEVICE=/\/(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?=[./]|$)/;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const pageCsp=styles=>`default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src ${styles}; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'`;
// Documentation the Control Center links to, served as inert text: a fixed list, never a path taken from the request.
const DOCS=new Map([...['packs/README.md','packs/manifest.md','packs/world-api.md','packs/determinism.md','packs/performance.md','packs/security.md','packs/migration.md',
  'packs/catalogue.md','FIRST-RUN.md','OBS.md','RECORDING.md','WSL.md','ALPHA.md'].map(n=>[n,path.join(REPO,'docs',n)]),['SECURITY.md',path.join(REPO,'SECURITY.md')]]);
// The isolated frame executable visual packs run in (sandbox="allow-scripts" gives it an opaque origin): it may load only
// the public world modules and blob: URLs it creates from code the player hands it, and it can reach no network at all.
// Pack code runs in a worker the frame starts from a blob URL (worker-src blob:); the worker inherits this policy.
const FRAME_HTML='<!doctype html><html><head><meta charset="utf-8"><title>Code Resonance visual pack</title>'+
  '<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:contain}</style></head>'+
  '<body><canvas id="world"></canvas><canvas id="overlay"></canvas><script type="module" src="/worlds/frame.js"></script></body></html>';
const FRAME_PERMISSIONS='camera=(), microphone=(), geolocation=(), display-capture=(), clipboard-read=(), clipboard-write=(), usb=(), serial=(), hid=(), bluetooth=(), payment=(), fullscreen=()';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const INERT=type=>({'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'});
// Administrative (mutating) routes: a control capability (receiver/control.js) is required before anything else is read.
const ADMIN=new Set(['/api/recipe','/api/recipe/preview','/api/packs/trust','/api/packs/import','/api/packs/install','/api/packs/discard','/api/packs/remove',
  '/api/settings','/api/preferences','/api/presets','/api/integrations/claude/plan','/api/integrations/claude/apply']);
// Coded errors of the modules → HTTP status; anything uncoded is a receiver failure (500).
const STATUS={invalid:400,'invalid-json':400,'pack-unavailable':409,'invalid-archive':400,'unsafe-path':400,'too-large':400,'too-many-files':400,'not-found':404,stale:409,changed:409,'invalid-pack':422,'pending-limit':429};
const LOOPBACK_HOSTS=['127.0.0.1','::1','localhost'];
const ZIP_TYPES=['application/zip','application/x-zip-compressed','application/octet-stream'];
const IMPORT_BYTES=12*1024*1024,CONFIG_BYTES=64*1024,README_BYTES=64*1024;
const WSL=process.platform==='linux'&&(/microsoft/i.test(os.release())||!!process.env.WSL_DISTRO_NAME);
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const coded=(code,message,extra)=>Object.assign(new Error(message),{code,...extra});
function response(res,code,obj){res.writeHead(code,JSON_HEADERS);res.end(JSON.stringify(obj));}
function failure(res,e){
  const status=e.status||STATUS[e.code];if(!status)throw e;
  response(res,status,{error:e.message,code:e.code,...(e.key?{key:e.key}:{}),...(e.current?{current:e.current}:{}),...(e.recipe?{recipe:e.recipe}:{}),...(e.report?{report:e.report}:{})});
}
function validId(id){return typeof id==='string'&&/^[a-z0-9-]{12,128}$/i.test(id);}
const contentType=req=>(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
function tokenMatches(header,token){
  const a=Buffer.from(String(header||'')),b=Buffer.from(`Bearer ${token}`);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
// The auth file holds the ingestion token and the pairing key: written whole to a private temporary file and renamed, so
// it is never readable by others, not even for a moment while an older, more permissive file is replaced.
async function writeAuth(file,data){const tmp=`${file}.${process.pid}.tmp`;await fs.writeFile(tmp,JSON.stringify(data),{mode:0o600});await fs.chmod(tmp,0o600).catch(()=>{});await fs.rename(tmp,file);}
// A crash mid-append can leave a final line without its newline; terminate it so the next record stays parseable.
async function terminateJournal(file){
  let fd;try{fd=await fs.open(file,'r');}catch(e){if(e.code==='ENOENT')return '';throw e;}
  try{const {size}=await fd.stat();if(!size)return '';const b=Buffer.alloc(1);await fd.read(b,0,1,size-1);return b[0]===10?'':'\n';}
  finally{await fd.close();}
}
async function readRaw(req,res,limit,types=['application/json']){
  if(!types.includes(contentType(req))){response(res,415,{error:`Expected ${types[0]}`});return null;}
  if(Number(req.headers['content-length'])>limit){response(res,413,{error:'Too large'});return null;}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit){response(res,413,{error:'Too large'});return null;}chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function readBody(req,res,limit){
  const buf=await readRaw(req,res,limit);if(!buf)return null;
  let body;try{body=JSON.parse(buf.toString('utf8'));}catch{response(res,400,{error:'Invalid JSON'});return null;}
  if(!isPlain(body)){response(res,400,{error:'Expected a JSON object'});return null;}
  return body;
}
// What the player may know about installed packs (never their location on disk).
const publicPack=p=>({id:p.id,name:p.name,version:p.version,kind:p.kind,sdk:p.sdk,author:p.author,description:p.description,license:p.license,digest:p.digest,
  files:p.files,executable:p.executable,trusted:p.trusted,compatible:p.compatible,ok:p.ok,problems:p.problems,installedAt:p.installedAt,budget:p.budget,
  family:p.family?{id:p.family.id,name:p.family.name,effects:p.family.effects,ambient:p.family.ambient,budget:p.family.budget}:null,base:p.overlay?.base||null});
const only=(specs,prefix)=>Object.fromEntries(Object.entries(specs).filter(([k])=>k.startsWith(prefix)));
// The values a pack lets a project tune, in the shape recipes.tunable() describes them (one formatter for both).
function packParameters(p,snap){
  if(!p.ok)return {};
  if(p.kind==='world')return only(recipes.tunable({family:p.id,familyKind:'pack'},snap),'params.');
  if(p.kind==='shader')return only(recipes.tunable({family:p.overlay.base,familyKind:catalog.FAMILIES[p.overlay.base]?'builtin':'pack',pack:{id:p.id,kind:'shader'}},snap),'uniforms.');
  if(p.kind==='declarative')return {overrides:{...p.overlay.overrides}};
  return {};
}
function catalogView(snap){
  const families={},packFamilies={},looks={};
  for(const [id,f] of Object.entries(catalog.FAMILIES))families[id]={name:f.name,builtin:true,parameters:recipes.tunable({family:id}),effects:[...f.effects],unlocks:[...f.unlocks]};
  for(const p of snap.packs){
    if(!p.ok||!p.compatible)continue;
    if(p.kind==='world'&&p.family)packFamilies[p.id]={name:p.family.name,parameters:packParameters(p,snap)};
    if(p.overlay)looks[p.id]={base:p.overlay.base,kind:p.kind,uniforms:p.kind==='shader'?packParameters(p,snap):{}};
  }
  return {version:catalog.CATALOG_VERSION,families,packFamilies,looks};
}
// What a (candidate) recipe needs to run: built in, a world pack, or a shader look; approved and present or not.
function runtimeOf(r,snap){
  const id=r.familyKind==='pack'?r.family:r.pack?.id||null,p=id&&Object.hasOwn(snap.byId,id)?snap.byId[id]:null;
  return {kind:r.familyKind==='pack'?'world-pack':r.pack?.kind==='shader'?'shader':'builtin',pack:id,approved:id?!!p&&(!p.executable||p.trusted):true,available:id?!!p&&p.ok&&p.compatible:true};
}
async function filesOf(dir,rel=''){
  const out=[];
  for(const d of (await fs.readdir(path.join(dir,rel),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const r=rel?`${rel}/${d.name}`:d.name;
    if(d.isDirectory())out.push(...await filesOf(dir,r));else out.push(r);}
  return out;
}
async function templates(){
  const kinds=['declarative','shader','world'];
  return {templates:await Promise.all(kinds.map(async kind=>({kind,dir:`packs/template/${kind}`,files:await filesOf(path.join(REPO,'packs','template',kind)),
    command:`npm run pack -- new <dir> --kind ${kind} --id <author.name>`}))),validate:'npm run pack -- validate <dir>',test:'npm run pack -- test <dir> --quick'};
}
// ---- Claude Code hooks: the same entries scripts/hooks/install-claude-code.js writes, planned and applied from the
// Control Center. Removal takes out exactly the adapter's entries (and only the groups, events and `hooks` key that it
// leaves empty); every other byte of meaning in the user's file stays.
const CLAUDE_COMMAND=claudeHooks.merge({}).hooks[claudeHooks.EVENTS[0]][0].hooks[0].command;
const CLAUDE_ADAPTER=path.join(REPO,'scripts','hooks','claude-code.js');
// Accurate to scripts/hooks/claude-code.js (translate()): what leaves Claude Code, and what never does.
const CLAUDE_CAPTURED=['Session start and end, with the reason Claude Code gives (for example "startup" or "clear")',
  'Prompt submitted: its length and a fingerprint (a truncated SHA-256), not its text',
  'Tool use: the tool name, and when it finishes whether it succeeded, failed or was interrupted',
  'Bash: a command category (test, build, lint, typecheck, …) and the exit code, never the command line',
  'Files: the project-relative path a file tool (Edit, Write, MultiEdit, NotebookEdit, Read, NotebookRead) edits or reads, when it passes the same filters as the extension',
  'Subagents: start and stop, the subagent type and its id, so each subagent is a distinct voice',
  'Response completed: the length and fingerprint of the final assistant message'];
const CLAUDE_EXCLUDED=['Prompt text (unless RESONANCE_CAPTURE_PROMPT_TEXT=1 is set in the environment Claude Code runs hooks in)',
  'Assistant and subagent message text','Command lines, tool inputs and tool outputs','File contents',
  'Files outside the project, secrets (.env, keys, credentials) and excluded folders (node_modules, build output, …)'];
function unhook(settings){
  if(!isPlain(settings.hooks))return settings;
  const hooks={...settings.hooks};let touched=false;
  for(const [event,groups] of Object.entries(hooks)){
    if(!Array.isArray(groups))continue;
    const kept=[];let changed=false;
    for(const g of groups){
      if(!isPlain(g)||!Array.isArray(g.hooks)||!g.hooks.some(h=>h?.command===CLAUDE_COMMAND)){kept.push(g);continue;}
      changed=true;const rest=g.hooks.filter(h=>h?.command!==CLAUDE_COMMAND);if(rest.length)kept.push({...g,hooks:rest});
    }
    if(!changed)continue;touched=true;
    if(kept.length)hooks[event]=kept;else delete hooks[event];
  }
  if(!touched)return settings;
  const next={...settings,hooks};if(!Object.keys(hooks).length)delete next.hooks;return next;
}
async function claudePlan(dataDir,{projectPath,action}={}){
  if(action!=='install'&&action!=='remove')throw coded('invalid','action must be "install" or "remove"',{key:'action'});
  if(typeof projectPath!=='string'||!projectPath||projectPath.length>1024||!path.isAbsolute(projectPath))throw coded('invalid','projectPath must be an absolute path',{key:'projectPath'});
  // A network path (\\host\share, //host/share) would make the receiver connect to that host (on Windows, with the user's
  // credentials): local folders only.
  if(/^[\\/]{2}/.test(projectPath))throw coded('invalid','projectPath must be a local folder, not a network path',{key:'projectPath'});
  let dir;try{dir=await fs.realpath(projectPath);}catch{throw coded('invalid','projectPath does not exist',{key:'projectPath'});}
  if(!(await fs.stat(dir)).isDirectory())throw coded('invalid','projectPath is not a directory',{key:'projectPath'});
  if(path.parse(dir).root===dir)throw coded('invalid','projectPath cannot be the root of a file system',{key:'projectPath'});
  const data=await fs.realpath(dataDir).catch(()=>dataDir),rel=path.relative(data,dir);
  if(!rel||(rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)))throw coded('invalid','projectPath cannot be inside the receiver\'s data directory',{key:'projectPath'});
  const file=path.join(dir,'.claude','settings.local.json');
  // Only the project's own folder and file, never one a link points to (a cloned repository can contain links): the
  // plan would show, and apply overwrite, whatever is at the other end (the receiver's token, another settings file).
  // Windows junctions are reported as symbolic links too. Anything but a regular file (a FIFO would block) is refused.
  for(const [p,kind] of [[path.dirname(file),'directory'],[file,'file']]){
    let st=null;try{st=await fs.lstat(p);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(st&&(st.isSymbolicLink()||(kind==='directory'?!st.isDirectory():!st.isFile())))throw coded('invalid',`${kind==='file'?'.claude/settings.local.json':'.claude'} is a link or not a ${kind}: only a regular file inside the project is edited`,{key:'projectPath'});
    if(!st)break;
  }
  let buf=null;try{buf=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  const text=buf&&buf.toString('utf8');let current={};
  if(buf){try{current=JSON.parse(text);}catch{throw coded('invalid-json',`${file} is not valid JSON: fix or remove it first`);}
    if(!isPlain(current))throw coded('invalid-json',`${file} does not hold a JSON object`);}
  const next=action==='install'?claudeHooks.merge(current):unhook(current),changed=JSON.stringify(next)!==JSON.stringify(current);
  return {file,exists:!!buf,current:text,next:changed||!buf?JSON.stringify(next,null,2)+'\n':text,changed,currentHash:buf?crypto.createHash('sha256').update(buf).digest('hex'):''};
}
function createService(options={}) {
  const dataDir=path.resolve(options.dataDir||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
  const intervalMs=Number(options.sortIntervalMs)||1000;
  const windowMs=Number(options.windowMs)||5000,graceMs=Number(options.graceMs??1500);
  const port=Number(options.port??process.env.RESONANCE_PORT??4174);
  const host=options.host||'127.0.0.1';
  if(!LOOPBACK_HOSTS.includes(host)&&process.env.RESONANCE_ALLOW_REMOTE!=='1')throw new Error('Refusing non-loopback bind: set RESONANCE_ALLOW_REMOTE=1 explicitly');
  // Pairing codes: what links carry instead of the pairing key (a link can end up in a process's command line, which other
  // accounts can read on Linux). Single use, valid for minutes, kept as hashes; exchanged once for the key.
  const codes=new Map();
  function mintCode(ttlMs=15*60*1000){const t=Date.now();for(const [k,v] of codes)if(v<=t)codes.delete(k);while(codes.size>=32)codes.delete(codes.keys().next().value);
    const code=crypto.randomBytes(16).toString('hex');codes.set(sha(code),t+ttlMs);return {code,expiresAt:t+ttlMs};}
  const codeValid=code=>typeof code==='string'&&/^[0-9a-f]{32}$/.test(code)&&(codes.get(sha(code))||0)>Date.now();
  let server,worker,token,pairing=null,actualPort,closing=false,startedAt=null,packPoll=null,lastPacks=null;
  const flight=new Map();let cursor=0;
  const writes=new Map();const checkedJournals=new Set();
  let lastReceivedAt=0,lastProjectionAt=null,workerErrors=0;
  // Derived views are cached in memory, fed by the worker; requests never parse checkpoint files.
  const projections=new Map();const timelines=new Map();
  const registry=packs.createRegistry(dataDir);
  const projectDir=id=>path.join(dataDir,'projects',sha(id));
  const control=createControl(),changes=createChanges();
  const settingsDoc=store.settings(dataDir),presetsDoc=store.presets(dataDir),preferencesOf=id=>store.preferences(projectDir(id));
  const evidence=createEvidence({projectDir,onChange:projectId=>changes.emit('evidence',{projectId})});
  const imports=createImports({dataDir,registry});
  // /api/projects and /api/packs summaries, read from disk once and dropped when the receiver writes what they summarise.
  const recipeSummaries=new Map(),preferenceSummaries=new Map();let usage=null,usageEpoch=0;
  function recipesChanged(id){recipeSummaries.delete(id);usage=null;usageEpoch++;}
  function packsChanged(){usage=null;usageEpoch++;lastPacks=registry.snapshot();changes.emit('packs');}
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
      // Only what is journaled is evidence, stamped as journaled (the evidence rebuild reads the same records).
      evidence.observe(projectId,prepared,receivedAt);
      if(prepared.some(e=>!String(e.kind).startsWith('control.')))changes.throttledActivity(projectId,receivedAt);
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
  // A project exists once events for it were journaled (its directory holds its id), sorted or not.
  async function projectExists(id){
    if(!validId(id))return false;if(projections.has(id))return true;
    try{return await fs.readFile(path.join(projectDir(id),'id'),'utf8')===id;}catch{return false;}
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
  // `revision` is the receiver's, not the recipe's: it is taken off before resolve() compares stored and regenerated
  // recipes, and put back (+1) on every write.
  const recipeLocks=new Map();
  function withRecipeLock(id,fn){const prev=recipeLocks.get(id)||Promise.resolve();const next=prev.catch(()=>{}).then(fn);recipeLocks.set(id,next);return next;}
  // Recipes written before 0.5 (no revision) carry the generated information mode 'cinematic', which no interface could
  // choose then: it becomes "follow the global setting", as it is for recipes generated now.
  async function readRecipe(id){try{const r=JSON.parse(await fs.readFile(path.join(projectDir(id),'recipe.json'),'utf8'));
    if(r&&r.revision===undefined&&r.overrides?.labels==='cinematic')r.overrides={...r.overrides,labels:null};return r;}catch{return null;}}
  async function storedRecipe(id){const raw=await readRecipe(id);if(!isPlain(raw))return {stored:null,revision:0};const {revision,...stored}=raw;return {stored,revision:Number.isInteger(revision)&&revision>0?revision:0};}
  async function writeRecipe(id,recipe,revision){
    await store.writeAtomic(path.join(projectDir(id),'recipe.json'),JSON.stringify({...recipe,revision},null,1));
    recipesChanged(id);changes.emit('recipe',{projectId:id,revision});return {...recipe,revision};
  }
  function loadRecipe(id,entry){return withRecipeLock(id,async()=>{
    const {stored,revision}=await storedRecipe(id);const {recipe,changed}=recipes.resolve(stored,JSON.parse(entry.json),Date.now(),registry.snapshot());
    return changed?writeRecipe(id,recipe,revision+1):{...recipe,revision};});}
  // A candidate from the saved recipe and a list of actions (validated one after the other; all or nothing).
  // While the recipe's pack is missing it is served on a fallback (`unavailable`) and stored as it was: editing the
  // fallback would replace the stored choice and its tuning for good. Until the pack is installed again, only an action
  // that leaves the missing pack behind applies (another family, automatic, a full regenerate, another look); a batch
  // may continue with any action once one has.
  const leavesPack=(r,a)=>a?.type==='family'||a?.type==='automatic'||(a?.type==='regenerate'&&!a.keepFamily)||(a?.type==='pack'&&(a.pack!==null||!r.unavailable.family));
  async function candidate(id,entry,actions){
    const project=JSON.parse(entry.json),known=registry.snapshot(),{stored,revision}=await storedRecipe(id);
    const current=recipes.resolve(stored,project,Date.now(),known).recipe,now=Date.now();
    return {current,revision,known,next:()=>{
      if(!Array.isArray(actions)||actions.length>16)throw new Error('Invalid actions: a list of at most 16');
      return actions.reduce((r,a)=>{
        if(r.unavailable&&!leavesPack(r,a))throw coded('pack-unavailable',`The pack this recipe uses (${r.unavailable.family||r.unavailable.pack}) is not installed: install it again, or choose another family or look`,{recipe:{...current,revision}});
        return recipes.applyActions(r,[a],project,now,known);},current);}};
  }
  function editRecipe(id,entry,actions,ifRevision){return withRecipeLock(id,async()=>{
    const c=await candidate(id,entry,actions);
    if(ifRevision!==undefined&&ifRevision!==c.revision)throw coded('stale','stale',{recipe:{...c.current,revision:c.revision}});
    return writeRecipe(id,c.next(),c.revision+1);});}
  async function recipeSummary(id){
    if(recipeSummaries.has(id))return recipeSummaries.get(id);
    const {stored:r,revision}=await storedRecipe(id);
    const s=r?{family:r.family??null,familyName:r.familyName??null,familyKind:r.familyKind??null,source:r.source??null,locked:!!r.locked,title:r.title??null,revision}:null;
    recipeSummaries.set(id,s);return s;
  }
  async function preferencesSummary(id){
    if(preferenceSummaries.has(id))return preferenceSummaries.get(id);
    const d=await preferencesOf(id).read(),s=d.revision?{world:d.world,music:d.music}:null;
    preferenceSummaries.set(id,s);return s;
  }
  // How many projects' saved recipes name each pack (as their family or their look).
  async function packUsage(){
    if(usage)return usage;
    const epoch=usageEpoch,counts=new Map();
    for(const p of await listProjects()){const {stored:r}=await storedRecipe(p.id);if(!r)continue;
      for(const id of new Set([r.familyKind==='pack'?r.family:null,r.pack?.id].filter(x=>typeof x==='string')))counts.set(id,(counts.get(id)||0)+1);}
    if(epoch===usageEpoch)usage=counts;return counts;
  }
  const publicEvidence=doc=>{const {sessionIds,...editor}=doc.editor;return {...doc,editor};};
  async function status(authorized){
    const list=registry.list();
    return {version:VERSION,sdk:packs.SDK_VERSION,node:process.version,platform:process.platform,wsl:WSL,startedAt,uptimeMs:startedAt===null?0:Date.now()-startedAt,
      port:actualPort,loopbackOnly:LOOPBACK_HOSTS.includes(host),worker:{lastProjectionAt,errors:workerErrors},projects:(await listProjects()).length,
      packs:{installed:list.length,needApproval:list.filter(p=>p.ok&&p.executable&&!p.trusted).length,problems:list.filter(p=>!p.ok).length},
      capabilities:control.count(),...(authorized?{dataDir}:{})};
  }
  async function integrations(authorized){
    const vscode=[],claude=[];
    for(const p of await listProjects()){
      const doc=await evidence.get(p.id);if(!doc||doc.building)continue;
      // The demonstration (scripts/demo.js) sends workspace events too, but no editor was involved.
      if(!doc.demonstration&&(doc.editor.events||doc.editor.capture.state))vscode.push({projectId:p.id,name:p.name,editor:publicEvidence(doc).editor});
      const a=doc.agents['claude-code'];if(a)claude.push({projectId:p.id,name:p.name,lastAt:a.lastAt,events:a.events});
    }
    const settings=Object.entries(EXTENSION.contributes?.configuration?.properties||{}).map(([id,s])=>({id,type:s.type,default:s.default,description:s.description}));
    return {vscode:{projects:vscode,latestVersion:EXTENSION.version,install:{package:'npm run package:vsix',install:`code --install-extension code-resonance-${EXTENSION.version}.vsix`},
        settings,openSettingsUri:`vscode://${EXTENSION.publisher}.${EXTENSION.name}/settings`},
      claude:{projects:claude,events:[...claudeHooks.EVENTS],captured:CLAUDE_CAPTURED,excluded:CLAUDE_EXCLUDED,...(authorized?{adapter:CLAUDE_ADAPTER}:{}),
        command:'npm run hooks:claude -- /path/to/project'},
      generic:{endpoint:'POST /v1/events',cli:'node scripts/event.js --kind <kind> --root <project dir> [--provider <name>] [--tool <name>]'}};
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
      const worldFile=/^\/worlds\/[a-z0-9-]+\.js$/.test(pathname)&&!DEVICE.test(pathname)?pathname.slice(1):null;
      // The pack frame has an opaque origin ("null"): it may fetch the public world modules and three.js, nothing else.
      const frameAsset=req.method==='GET'&&req.headers.origin==='null'&&(worldFile||pathname==='/vendor/three.module.min.js');
      if(req.headers.origin&&!expectedOrigins.includes(req.headers.origin)&&!frameAsset){response(res,403,{error:'Cross-origin access forbidden'});return;}
      if(req.method==='POST'&&ADMIN.has(pathname)){const v=control.verify(req,expectedOrigins);if(!v.ok){response(res,v.status,{error:v.error,code:v.code});return;}}
      const uiFile=UI_FILE.test(pathname)&&!DEVICE.test(pathname)?pathname.slice(1):null;
      if(req.method==='GET'&&(FILENAMES.has(pathname)||worldFile||uiFile)){
        const f=path.join(PUBLIC,worldFile||uiFile||FILENAMES.get(pathname));
        if((worldFile||uiFile)&&!fss.existsSync(f)){response(res,404,{error:'Not found'});return;}
        const source=await fs.readFile(f);
        // The OBS view (?overlay=1) also allows inline styles: OBS applies a Browser Source's custom CSS (by default a
        // transparent background) as an inline style. The page renders no untrusted markup.
        const styles=pathname==='/'&&u.searchParams.has('overlay')?"'self' 'unsafe-inline'":"'self'";
        res.writeHead(200,{'Content-Type':MIME[path.extname(f)],'Cache-Control':'no-store','Content-Security-Policy':pageCsp(styles),
          'X-Content-Type-Options':'nosniff',...(frameAsset?{'Access-Control-Allow-Origin':'*'}:{})});
        res.end(source);return;
      }
      if(req.method==='GET'&&pathname==='/pack-frame.html'){
        // CSP source lists cannot name IPv6 literals: the frame works when the player is opened on localhost or 127.0.0.1.
        // `sandbox allow-scripts` in the policy too: the page has an opaque origin even if opened on its own.
        const named=expectedOrigins.filter(o=>!o.includes('[')),scripts=named.flatMap(o=>[`${o}/worlds/`,`${o}/vendor/`]).join(' ');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
          'Permissions-Policy':FRAME_PERMISSIONS,'Cross-Origin-Resource-Policy':'same-origin',
          'Content-Security-Policy':`default-src 'none'; script-src ${scripts} blob:; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src blob:; manifest-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${named.join(' ')}; sandbox allow-scripts`});
        res.end(FRAME_HTML);return;
      }
      if(req.method==='GET'&&pathname.startsWith('/docs/')){
        const f=DOCS.get(pathname.slice(6));if(!f){response(res,404,{error:'Not found'});return;}
        res.writeHead(200,INERT('text/markdown; charset=utf-8'));res.end(await fs.readFile(f));return;
      }
      // ---- Control sessions and change notifications
      if(req.method==='POST'&&pathname==='/api/session'){
        // The pairing key travels in a small JSON body; a request without one is simply not paired (refused below).
        const body=(req.headers['content-type']||'').split(';')[0]==='application/json'?await readBody(req,res,1024):{};if(!body)return;
        // A pairing code (from a link) stands for the key once: it is consumed, and the key is returned for the browser to keep.
        const viaCode=codeValid(body.code);
        const r=control.issue(req,expectedOrigins,{pairing,offered:viaCode?pairing:body.pairing});
        if(!r.ok){response(res,r.status,{error:r.error,code:r.code});return;}
        if(viaCode)codes.delete(sha(body.code));
        response(res,200,{capability:r.capability,expiresAt:r.expiresAt,scopes:r.scopes,...(viaCode?{pairing}:{})});return;
      }
      if(req.method==='GET'&&pathname==='/api/changes'){
        // An EventSource of the page itself (Fetch metadata, when sent: same-origin, destination empty). A frame or an
        // image of another site sends no Origin, so this keeps other pages from taking the 32 listener slots.
        const site=req.headers['sec-fetch-site'],dest=req.headers['sec-fetch-dest'];
        if((site!==undefined&&site!=='same-origin')||(dest!==undefined&&dest!=='empty')){response(res,403,{error:'Same-origin EventSource required',code:'cross-site-refused'});return;}
        const [s,p]=await Promise.all([settingsDoc.read(),presetsDoc.read()]);
        changes.handle(req,res,{revision:{settings:s.revision,presets:p.revision}});return;
      }
      if(req.method==='GET'&&pathname==='/api/status'){response(res,200,await status(control.read(req,expectedOrigins).ok));return;}
      if(req.method==='GET'&&pathname==='/api/catalog'){response(res,200,catalogView(registry.snapshot()));return;}
      // ---- Visual packs: installed with scripts/pack.js or imported here; the player lists them, reads approved files, records approvals.
      if(req.method==='GET'&&pathname==='/api/packs'){
        const snap=registry.snapshot(),used=await packUsage();
        response(res,200,{sdk:packs.SDK_VERSION,packs:snap.packs.map(p=>({...publicPack(p),parameters:packParameters(p,snap),usedBy:used.get(p.id)||0,readme:p.files.some(f=>f.path==='README.md')}))});return;
      }
      if(req.method==='GET'&&pathname==='/api/packs/templates'){response(res,200,await templates());return;}
      if(req.method==='GET'&&pathname==='/api/packs/readme'){
        // Any installed pack, approved or not: the README is shown as inert text, the files recorded at installation only.
        const id=u.searchParams.get('id')||'',p=/^[a-z0-9.-]{3,64}$/.test(id)?registry.get(id):null,buf=p&&p.id===id?registry.read(id,'README.md'):null;
        if(!buf){response(res,404,{error:'No README'});return;}
        res.writeHead(200,INERT('text/plain; charset=utf-8'));res.end(buf.subarray(0,README_BYTES));return;
      }
      if(req.method==='GET'&&pathname==='/api/packs/file'){
        const p=registry.get(u.searchParams.get('id')||''),file=u.searchParams.get('path')||'';
        // Code is handed out only for approved packs, as inert text (the player passes it to the isolated frame).
        if(!p||!p.ok||(p.executable&&!p.trusted)){response(res,p?403:404,{error:p?'This pack contains code and has not been approved':'Pack not found'});return;}
        const buf=registry.read(p.id,file);if(!buf){response(res,404,{error:'File not found'});return;}
        res.writeHead(200,{...INERT(/\.(?:png|jpg)$/.test(file)?'application/octet-stream':'text/plain; charset=utf-8')});
        res.end(buf);return;
      }
      if(req.method==='POST'&&pathname==='/api/packs/trust'){
        // Approvals come from the player page itself (capability), for the exact files the user reviewed (digest).
        const body=await readBody(req,res,4096);if(!body)return;
        // The digest is required: setTrust skips the comparison without one, which would approve whatever is installed now.
        if(typeof body.id!=='string'||typeof body.digest!=='string'||!/^[0-9a-f]{64}$/.test(body.digest)||typeof body.trusted!=='boolean'){response(res,400,{error:'Expected {id, digest, trusted}'});return;}
        // setTrust's own refusals are plain messages; a file system error (it would name the data path) is a receiver failure.
        let out;try{out=packs.setTrust(body.id,dataDir,{digest:body.digest,trusted:body.trusted});}catch(e){if(e.code)throw e;response(res,400,{error:e.message});return;}
        packsChanged();response(res,200,publicPack(out));return;
      }
      if(req.method==='POST'&&pathname==='/api/packs/import'){
        // Nothing of an import is trusted: receiver/pack-import.js extracts it into quarantine and reports on it.
        let report;
        if(contentType(req)==='application/json'){const body=await readBody(req,res,IMPORT_BYTES);if(!body)return;try{report=imports.fromFiles(body);}catch(e){failure(res,e);return;}}
        else{const buf=await readRaw(req,res,IMPORT_BYTES,ZIP_TYPES);if(!buf)return;try{report=imports.fromZip(buf);}catch(e){failure(res,e);return;}}
        response(res,200,report);return;
      }
      if(req.method==='POST'&&(pathname==='/api/packs/install'||pathname==='/api/packs/discard')){
        const body=await readBody(req,res,4096);if(!body)return;
        if(typeof body.importId!=='string'){response(res,400,{error:'Expected {importId}'});return;}
        if(pathname==='/api/packs/discard'){try{response(res,200,imports.discard(body.importId));}catch(e){failure(res,e);}return;}
        // Never an approval: an executable pack installed here waits for the user to approve its files.
        let out;try{out=imports.install(body.importId,body.digest);}catch(e){failure(res,e);return;}
        packsChanged();const p=registry.get(out.id);
        response(res,200,p&&p.id===out.id?{...publicPack(p),warnings:out.warnings}:out);return;
      }
      if(req.method==='POST'&&pathname==='/api/packs/remove'){
        const body=await readBody(req,res,4096);if(!body)return;
        if(typeof body.id!=='string'||!/^[a-z0-9.-]{3,64}$/.test(body.id)){response(res,400,{error:'Expected {id}'});return;}
        let out;try{out=packs.remove(body.id,dataDir);}catch(e){if(e.code)throw e;response(res,/not installed/.test(e.message)?404:400,{error:e.message});return;}
        packsChanged();response(res,200,out);return;
      }
      // ---- Global settings and presets
      if(pathname==='/api/settings'||pathname==='/api/presets'){
        const doc=pathname==='/api/settings'?settingsDoc:presetsDoc,type=pathname.slice(5);
        if(req.method==='GET'){response(res,200,await doc.read());return;}
        if(req.method==='POST'){
          const body=await readBody(req,res,CONFIG_BYTES);if(!body)return;
          let next;try{next=await doc.update(type==='settings'?{patch:body.patch,ifRevision:body.ifRevision}:{patch:body,ifRevision:body.ifRevision});}catch(e){failure(res,e);return;}
          changes.emit(type,{revision:next.revision});response(res,200,next);return;
        }
      }
      if(req.method==='GET'&&pathname==='/health'){response(res,200,{ok:true,version:VERSION,sortIntervalMs:intervalMs,windowMs,graceMs});return;}
      if(req.method==='GET'&&pathname==='/api/projects'){
        // The private project name is listed here (the Control Center's project list), never on the stage.
        const list=await listProjects();
        response(res,200,{projects:await Promise.all(list.map(async p=>({...p,recipe:await recipeSummary(p.id),preferences:await preferencesSummary(p.id),
          evidence:evidence.compact(await evidence.get(p.id))})))});return;
      }
      if(req.method==='GET'&&pathname==='/api/integrations'){response(res,200,await integrations(control.read(req,expectedOrigins).ok));return;}
      if(req.method==='POST'&&(pathname==='/api/integrations/claude/plan'||pathname==='/api/integrations/claude/apply')){
        const body=await readBody(req,res,8192);if(!body)return;
        try{
          if(pathname.endsWith('/plan')){response(res,200,await claudePlan(dataDir,body));return;}
          const plan=await claudePlan(dataDir,body);
          response(res,200,await store.withLock(plan.file,async()=>{
            // Planned again under the lock: what is written is computed from the file as it is now, and only if the user
            // saw exactly that file.
            const now=await claudePlan(dataDir,body);
            if(typeof body.expectHash!=='string'||body.expectHash!==now.currentHash)throw coded('changed','The settings file changed since it was shown; review it again');
            if(now.changed)await store.writeAtomic(now.file,now.next);
            return {file:now.file,written:now.changed};
          }));
        }catch(e){failure(res,e);}
        return;
      }
      const id=u.searchParams.get('id');
      if(req.method==='GET'&&pathname==='/api/evidence'){
        const doc=validId(id)?await evidence.get(id):null;
        if(!doc){response(res,404,{error:'Nothing received for this project'});return;}
        response(res,200,doc.building?{building:true}:publicEvidence(doc));return;
      }
      if(pathname==='/api/preferences'&&(req.method==='GET'||req.method==='POST')){
        if(!await projectExists(id)){response(res,404,{error:'Project not found'});return;}
        const doc=preferencesOf(id);
        if(req.method==='GET'){response(res,200,await doc.read());return;}
        const body=await readBody(req,res,CONFIG_BYTES);if(!body)return;
        let next;try{next=await doc.update({patch:body.patch,ifRevision:body.ifRevision});}catch(e){failure(res,e);return;}
        preferenceSummaries.delete(id);changes.emit('preferences',{projectId:id,revision:next.revision});response(res,200,next);return;
      }
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
      if((pathname==='/api/recipe'&&(req.method==='GET'||req.method==='POST'))||(pathname==='/api/recipe/preview'&&req.method==='POST')||(pathname==='/api/recipe/tunable'&&req.method==='GET')){
        const entry=await projection(id);
        if(!entry){response(res,404,{error:'Project not found'});return;}
        if(req.method==='POST'){
          // Recipe edits come from the player page itself (capability checked above): one action, or a batch of 1-16
          // applied all or nothing, optionally against the revision the editor last saw.
          const body=await readBody(req,res,CONFIG_BYTES);if(!body)return;
          const actions=Array.isArray(body.actions)?body.actions:body.action!==undefined?[body.action]:null;
          if(!actions||actions.length<1||actions.length>16){response(res,400,{error:'Expected {action} or {actions:[1-16 actions]}'});return;}
          // null means "no revision check", as for the other documents (receiver/store.js).
          if(body.ifRevision!=null&&!Number.isInteger(body.ifRevision)){response(res,400,{error:'ifRevision must be an integer',code:'invalid',key:'ifRevision'});return;}
          try{
            if(pathname==='/api/recipe'){response(res,200,await editRecipe(id,entry,actions,body.ifRevision??undefined));return;}
            // A preview is computed and returned, never stored.
            const c=await candidate(id,entry,actions),next=c.next();
            response(res,200,{recipe:{...next,revision:c.revision},tunable:recipes.tunable(next,c.known),runtime:runtimeOf(next,c.known)});
          }catch(e){if(e.code)failure(res,e);else response(res,400,{error:e.message});}
          return;
        }
        if(pathname==='/api/recipe/tunable'){const r=await loadRecipe(id,entry),known=registry.snapshot();
          response(res,200,{revision:r.revision,tunable:recipes.tunable(r,known),base:recipes.baseValues(r,known)});return;}
        // fallback=1: the identity without any pack (shown while a pack with code awaits approval); never stored.
        if(u.searchParams.get('fallback')==='1'){const {stored,revision}=await storedRecipe(id);response(res,200,{...recipes.resolve(stored,JSON.parse(entry.json),Date.now(),{byId:{},families:{}}).recipe,revision});return;}
        response(res,200,await loadRecipe(id,entry));return;
      }
      if(req.method==='GET'&&pathname==='/api/export'){
        const entry=await projection(id);
        if(!entry){response(res,404,{error:'Project not found'});return;}
        await exportProject(res,id,entry);return;
      }
      // A pairing link for whoever holds the ingestion token (npm run pair, the VS Code extension's Open Code Stage).
      if(req.method==='POST'&&pathname==='/v1/pairing-code'){
        if(!tokenMatches(req.headers.authorization,token)){response(res,401,{error:'Receiver token required'});return;}
        const c=mintCode();response(res,200,{...c,url:`http://127.0.0.1:${actualPort}/#pair=${c.code}`});return;
      }
      if(req.method==='POST'&&(pathname==='/v1/events'||pathname==='/v1/flush'||pathname==='/v1/rebuild')) {
        if(!tokenMatches(req.headers.authorization,token)){response(res,401,{error:'Receiver token required'});return;}
        if(pathname==='/v1/flush'||pathname==='/v1/rebuild') {
          if(id&&!validId(id)){response(res,400,{error:'Invalid project'});return;}
          if(pathname==='/v1/rebuild'&&!id){response(res,400,{error:'Project id required'});return;}
          const result=pathname==='/v1/flush'?await flush(id||undefined):await ask({type:'rebuild',projectId:id});
          response(res,result.error?500:200,result);return;
        }
        if(contentType(req)!=='application/json'){response(res,415,{error:'Expected application/json'});return;}
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
    get dataDir(){return dataDir;},get port(){return actualPort;},get token(){return token;},get pairing(){return pairing;},
    async start(){
      await fs.mkdir(dataDir,{recursive:true,mode:0o700});
      const authFile=path.join(dataDir,'receiver-auth.json');
      // The ingestion token (extension, agent hooks) and the pairing key (browsers that may change configuration).
      try{const a=JSON.parse(await fs.readFile(authFile,'utf8'));token=String(a.token||'');if(token.length<40)throw Error('Invalid token');
        pairing=/^[0-9a-f]{64}$/.test(a.pairing||'')?a.pairing:null;}
      catch{token=crypto.randomBytes(32).toString('hex');pairing=null;}
      pairing||=crypto.randomBytes(32).toString('hex');
      await writeAuth(authFile,{version:1,token,port,pairing});
      // Nothing waits in quarantine across runs: an import is reviewed and installed within one receiver's lifetime.
      imports.clear();
      worker=new Worker(path.resolve(__dirname,'../engine/worker.js'),{workerData:{dataDir,intervalMs,windowMs,graceMs}});
      worker.on('message',m=>{
        if(m.type==='log')console.warn('[sorter]',m.message);
        if(m.type==='projection'){
          const before=projections.get(m.projectId)?.summary;
          projections.set(m.projectId,{json:m.json,etag:`"${sha(m.json).slice(0,16)}"`,summary:m.summary});lastProjectionAt=Date.now();
          if(m.reset)timelines.delete(m.projectId);
          const index=timelines.get(m.projectId);if(index)index.push(...m.appended.filter(x=>x.seq>(index.at(-1)?.seq??-1)));
          if(!before||before.name!==m.summary.name||before.chapter!==m.summary.chapter)changes.emit('projects');
        }
        if(m.type==='flushed'){if(m.error)workerErrors++;if(flight.has(m.requestId)){const action=flight.get(m.requestId);flight.delete(m.requestId);action.resolve(m);}}
      });
      worker.on('error',e=>{workerErrors++;console.error('[sorter worker error]',e);});
      server=http.createServer(handler);
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
      actualPort=server.address().port;startedAt=Date.now();
      // Auth hint stores port for VS Code extension, not an invitation to bind outside loopback.
      await writeAuth(authFile,{version:1,token,port:actualPort,pairing});
      // Packs installed or approved from the command line reach open windows too: the registry's stamp, every 5 s.
      lastPacks=registry.snapshot();
      packPoll=setInterval(()=>{try{const s=registry.snapshot();if(s!==lastPacks){lastPacks=s;usage=null;usageEpoch++;changes.emit('packs');}}catch(e){console.warn('[resonance packs]',e.message);}},5000);packPoll.unref();
      // Installations from before capture evidence existed: each project's document is built once, in the background.
      listProjects().then(list=>{for(const p of list)if(!closing)evidence.get(p.id).catch(()=>{});}).catch(()=>{});
      console.log(`[CODE RESONANCE] Receiver listening: http://${host}:${actualPort}`);
      console.log(`[CODE RESONANCE] Local data: ${dataDir}`);
      // A link that pairs one browser (once) so it may change settings, packs and integrations: a single-use code, valid
      // 15 minutes; `npm run pair` makes a new one. The pairing key itself is never printed.
      if(options.quiet!==true)console.log(`[CODE RESONANCE] Control Center (pairs one browser; single use, 15 min): http://127.0.0.1:${actualPort}/#pair=${mintCode().code}`);
      return this;
    },
    flush,
    async stop(){
      if(closing)return;closing=true;
      clearInterval(packPoll);changes.close();imports.close();control.clear();
      // Open event streams were just ended; connections still busy get a moment, then everything is closed.
      const closed=new Promise(resolve=>server?server.close(()=>resolve()):resolve());
      if(server){setImmediate(()=>server.closeIdleConnections?.());await Promise.race([closed,new Promise(r=>setTimeout(r,2000).unref())]);server.closeAllConnections?.();}
      await closed;await Promise.allSettled([...writes.values()]);
      // After the last journal append: evidence observed so far is written out.
      await evidence.stop();
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

'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {promisify}=require('node:util');
const gzip=promisify(zlib.gzip);
const {Worker}=require('node:worker_threads');
const {validateEvent,sha}=require('./protocol');
const {publicProjection}=require('../engine/reducer');
const PUBLIC=path.resolve(__dirname,'../public');
const FILENAMES=new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/style.css','style.css'],['/music.js','music.js'],['/score.js','score.js']]);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function response(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
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
  const intervalMs=Number(options.sortIntervalMs)||10000;
  const port=Number(options.port??process.env.RESONANCE_PORT??4174);
  const host=options.host||'127.0.0.1';
  if(!['127.0.0.1','::1','localhost'].includes(host)&&process.env.RESONANCE_ALLOW_REMOTE!=='1')throw new Error('Refusing non-loopback bind: set RESONANCE_ALLOW_REMOTE=1 explicitly');
  let server,worker,token,actualPort,closing=false;
  const flight=new Map();let cursor=0;
  const writes=new Map();const checkedJournals=new Set();
  function appendEvents(projectId,events) {
    const previous=writes.get(projectId)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      const dir=path.join(dataDir,'projects',sha(projectId));
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
      const journal=path.join(dir,'events.jsonl');
      let prefix='';if(!checkedJournals.has(projectId)){prefix=await terminateJournal(journal);checkedJournals.add(projectId);}
      await fs.appendFile(journal,prefix+prepared.map(e=>JSON.stringify(e)).join('\n')+'\n',{mode:0o600});
    });
    writes.set(projectId,next);
    return next;
  }
  function flush(projectId) {
    return new Promise((resolve,reject)=>{
      const id=++cursor;
      const timer=setTimeout(()=>{flight.delete(id);reject(new Error('Sort timeout'));},30000);
      flight.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
      worker.postMessage({type:'flush',requestId:id,projectId});
    });
  }
  async function loadState(id){
    if(!validId(id))return null;
    try{
      const p=path.join(dataDir,'projects',sha(id),'state.json');
      const obj=JSON.parse(await fs.readFile(p,'utf8'));
      return obj.projectId===id?obj:null;
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
        const state=await loadState(id);
        items.push({id,updatedAt:state?.frames.at(-1)?.createdAt||null,events:state?.stats.raw||0,chapter:state?.performance.chapter||1});
      }catch{}
    }
    return items.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  }
  async function handler(req,res){
    try{
      const hostHeader=(req.headers.host||'').toLowerCase();
      const allowedHost=/^(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(hostHeader);
      if(!allowedHost){response(res,403,{error:'Localhost Host header required'});return;}
      const expectedOrigins=[`http://localhost:${actualPort}`,`http://127.0.0.1:${actualPort}`,`http://[::1]:${actualPort}`];
      if(req.headers.origin&&!expectedOrigins.includes(req.headers.origin)){response(res,403,{error:'Cross-origin access forbidden'});return;}
      const u=new URL(req.url,`http://localhost:${actualPort}`);
      const pathname=u.pathname;
      if(req.method==='GET'&&FILENAMES.has(pathname)){
        const f=path.join(PUBLIC,FILENAMES.get(pathname));
        const source=await fs.readFile(f);
        res.writeHead(200,{'Content-Type':MIME[path.extname(f)],'Cache-Control':'no-store',
          'Content-Security-Policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
          'X-Content-Type-Options':'nosniff'});
        res.end(source);return;
      }
      if(req.method==='GET'&&pathname==='/health'){response(res,200,{ok:true,version:'0.2.0',sortIntervalMs:intervalMs});return;}
      if(req.method==='GET'&&pathname==='/api/projects'){response(res,200,{projects:await listProjects()});return;}
      if(req.method==='GET'&&pathname==='/api/project'){
        const s=await loadState(u.searchParams.get('id'));
        response(res,s?200:404,s?publicProjection(s):{error:'Project not found or not yet sorted'});return;
      }
      if(req.method==='GET'&&pathname==='/api/replay'){
        const s=await loadState(u.searchParams.get('id'));
        if(!s){response(res,404,{error:'Project not found'});return;}
        response(res,200,{schema:'code-resonance.replay-graphs.v1',projectId:s.projectId,graphs:(s.replayGraphs||[]).slice(-160)});return;
      }
      if(req.method==='GET'&&pathname==='/v1/performance/frames'){
        const s=await loadState(u.searchParams.get('id'));
        if(!s){response(res,404,{error:'Project not found'});return;}
        const after=u.searchParams.get('after')||'';
        const index=after?s.frames.findIndex(f=>f.id===after):-1;
        const frames=(after&&index<0?s.frames.slice(-40):s.frames.slice(index+1)).slice(-200);
        response(res,200,{schema:'code-resonance.performance.v1',projectId:s.projectId,frames});return;
      }
      if(req.method==='GET'&&pathname==='/api/export'){
        const s=await loadState(u.searchParams.get('id'));
        if(!s){response(res,404,{error:'Project not found'});return;}
        response(res,200,{schema:'code-resonance.export.v1',projectId:s.projectId,createdAt:s.createdAt,stats:s.stats,
          sessions:Object.values(s.sessions),timeline:s.timeline,frames:s.frames});return;
      }
      if(req.method==='POST'&&(pathname==='/v1/events'||pathname==='/v1/flush')) {
        if(!tokenMatches(req.headers.authorization,token)){response(res,401,{error:'Receiver token required'});return;}
        if(pathname==='/v1/flush') {
          const id=u.searchParams.get('id');if(id&&!validId(id)){response(res,400,{error:'Invalid project'});return;}
          const result=await flush(id||undefined);response(res,result.error?500:200,result);return;
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
    }catch(error){if(!res.headersSent)response(res,500,{error:'Receiver failure'});console.error('[resonance receiver]',error);}
  }
  return {
    get dataDir(){return dataDir;},get port(){return actualPort;},get token(){return token;},
    async start(){
      await fs.mkdir(dataDir,{recursive:true,mode:0o700});
      const authFile=path.join(dataDir,'receiver-auth.json');
      try{const a=JSON.parse(await fs.readFile(authFile,'utf8'));token=String(a.token||'');if(token.length<40)throw Error('Invalid token');}
      catch{token=crypto.randomBytes(32).toString('hex');await fs.writeFile(authFile,JSON.stringify({version:1,token,port}),{mode:0o600});}
      await fs.chmod(authFile,0o600).catch(()=>{});
      worker=new Worker(path.resolve(__dirname,'../engine/worker.js'),{workerData:{dataDir,intervalMs}});
      worker.on('message',m=>{
        if(m.type==='log')console.warn('[sorter]',m.message);
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
    async stop(){if(closing)return;closing=true;await new Promise(resolve=>server?server.close(resolve):resolve());if(worker)await worker.terminate();}
  };
}
if(require.main===module){
  const args=process.argv.slice(2);
  const get=k=>{const index=args.indexOf(k);return index<0?undefined:args[index+1];};
  createService({port:get('--port')?Number(get('--port')):undefined,dataDir:get('--data'),sortIntervalMs:get('--sort-ms')?Number(get('--sort-ms')):undefined}).start().catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={createService};

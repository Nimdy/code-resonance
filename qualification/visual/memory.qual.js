'use strict';
// Renderer memory forensics: short, controlled experiments that each repeat one kind of operation, measuring every
// Chromium process the harness started (by type and pid: resident, anonymous, file-backed and shared memory, and PSS
// from /proc), the page's JS heap and DOM counters, workers, pack frames, and WebGL contexts still alive in the page.
// Each experiment ends with a forced full garbage collection (page and workers), so memory released only by the
// collector can be told apart from memory that stays.
//
// node visual/memory.qual.js [--experiments baseline,switching,recording,packs,bitmaps] [--minutes 10] [--gpu amd]
//                            [--sample 15] [--out results/memory] [--label before] [--gc-each]
// --record-size 1080p|720p|stage: the player's recording size for the recording experiments (players before the
// recording-size control record the stage).
// --wrap no-audio|no-watch|no-draw|no-download: bisection of what a recording keeps, inside the real player: its
// recorder wrapped from an init script to record without sound, without the sound watchdog (an analyser on the music's
// context per recording), without compositing frames (nothing drawn into the recording canvas), or without the download.
// --gc-each: a full collection after every operation, then a sample: the post-collection baseline per operation tells
// memory that stays (it keeps rising) from allocator high-water marks (it levels off).
// --driver lean|playwright (default lean): lean starts the headless shell itself and never enables the DevTools Network
// domain (visual/lean.js); under Playwright the renderer keeps every fetched response body for DevTools, which grows it
// with every project view the player downloads (results/memory/memory-detached-*.json). Results before 25 October 2026
// were measured under Playwright.
// --repo <dir>: serve another checkout of Code Resonance (e.g. the code before a fix), measured the same way.
// Linux only (/proc). Experiments:
//   baseline   Stellar Forge, live events every 3 s with an idle pause, music; nothing else
//   quiet      the same without events (music only)       silent  the same with events, without music
//   churn      events that rewrite 20 fixed modules (activity, constant structure; music on)
//   churn-nolabels / churn-city / churn-hidden   the same without the label overlay / in a 2D world / panels hidden
//   switching  the three built-in families and two packs in turn, every 20 s (no recording)
//   recording  Stellar Forge, record 20 s, pause 5 s, repeatedly (files deleted)
//   packs      Cymatic Field ↔ Stellar Forge every 15 s (pack frame and worker created and removed)
//   bitmaps    Cymatic Field, record 20 s, pause 5 s, repeatedly (the worker composites a bitmap per frame)
//   activity   a short soak: live events (a growing project) with music; every minute a world switch (the three
//              families and two packs in turn), then a 20 s recording with three sync markers, measured (offsets, fps)
//              before the file is deleted
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {REPO:HERE,launch,rendererOf,adminPost}=require('./harness');
const {launchLean}=require('./lean');
const media=require('./media');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const REPO=path.resolve(arg('repo',HERE)),DRIVER=arg('driver','lean');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const packs=require(path.join(REPO,'engine/packs'));
const WRAP=arg('wrap',null);
const WRAPS={'no-audio':`r.start=(o={})=>start({...o,audioStream:null,audioContext:null});`,'no-watch':`r.start=(o={})=>start({...o,audioContext:null});`,
  'no-draw':`r.frame=()=>{};`,'no-download':`const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:'))return;return click.call(this);};`};
const WRAPPER=w=>`(()=>{let real;Object.defineProperty(window,'ResonanceRecording',{configurable:true,get(){return real;},set(R){real={...R,create(){const r=R.create(),start=r.start;${WRAPS[w]}return r;}};}});})();`;
const GPU=arg('gpu',null),MINUTES=+arg('minutes',10),SAMPLE=+arg('sample',15)*1000,LABEL=arg('label','run'),GC_EACH=process.argv.includes('--gc-each'),RECORD_SIZE=arg('record-size',null);
const EXPERIMENTS=arg('experiments','baseline,switching,recording,packs,bitmaps').split(',');
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','memory')));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// WebGL contexts created in the page, tracked through weak references (a context alive here is not yet collected).
const TRACK=`(()=>{const refs=[];window.__gl={created:0,alive(){return refs.filter(r=>{const c=r.deref();return c&&!c.isContextLost();}).length;},lost(){return refs.filter(r=>{const c=r.deref();return c&&c.isContextLost();}).length;}};
const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...a){const c=orig.call(this,type,...a);
if(c&&/webgl/.test(type)&&!c.__tracked){c.__tracked=true;window.__gl.created++;refs.push(new WeakRef(c));}return c;};})();`;
// Every process started by this one, with its type and memory (MB), from /proc.
function processes(){
  const kids=new Map();
  for(const p of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const ppid=+fs.readFileSync(`/proc/${p}/stat`,'utf8').split(') ')[1].split(' ')[1];if(!kids.has(ppid))kids.set(ppid,[]);kids.get(ppid).push(+p);}catch{}}
  const list=[];const kb=(text,k)=>+((new RegExp(`^${k}:\\s+(\\d+)`,'m').exec(text)||[])[1]||0)/1024;
  const visit=pid=>{for(const k of kids.get(pid)||[]){try{
    // Chromium rewrites its process title: the arguments may sit in one space-separated field.
    const cmd=fs.readFileSync(`/proc/${k}/cmdline`,'utf8').split(/\0| /);const st=fs.readFileSync(`/proc/${k}/status`,'utf8');
    let roll='';try{roll=fs.readFileSync(`/proc/${k}/smaps_rollup`,'utf8');}catch{}
    const typeArg=cmd.find(a=>a.startsWith('--type='))?.slice(7),sub=cmd.find(a=>a.startsWith('--utility-sub-type='))?.slice(19);
    const type=typeArg?(typeArg==='utility'?`utility:${(sub||'').split('.').slice(-2,-1)[0]||sub}`:typeArg):/chrom|headless_shell/i.test(cmd[0])?'browser':'other';
    if(type!=='other')list.push({pid:k,type,rss:+kb(st,'VmRSS').toFixed(1),anon:+kb(st,'RssAnon').toFixed(1),file:+kb(st,'RssFile').toFixed(1),shmem:+kb(st,'RssShmem').toFixed(1),pss:+kb(roll,'Pss').toFixed(1)});
  }catch{}visit(k);}};
  visit(process.pid);return list;
}
const byType=list=>{const out={};for(const p of list){const t=out[p.type]??={count:0,rss:0,anon:0,shmem:0,pss:0,pids:[]};t.count++;t.rss+=p.rss;t.anon+=p.anon;t.shmem+=p.shmem;t.pss+=p.pss;t.pids.push(p.pid);}
  for(const t of Object.values(out))for(const k of ['rss','anon','shmem','pss'])t[k]=+t[k].toFixed(1);return out;};
async function workers(browserCdp){try{const {targetInfos}=await browserCdp.send('Target.getTargets');return targetInfos.filter(t=>t.type==='worker').length;}catch{return null;}}
// A full collection in the page and in every worker (workers through the browser's flattened target sessions).
async function collect(cdp,browserCdp){
  await cdp.send('HeapProfiler.collectGarbage');
  try{const {targetInfos}=await browserCdp.send('Target.getTargets');
    for(const t of targetInfos.filter(t=>t.type==='worker')){const {sessionId}=await browserCdp.send('Target.attachToTarget',{targetId:t.targetId,flatten:false});
      await browserCdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:1,method:'HeapProfiler.collectGarbage'})});await browserCdp.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}}catch{}
  await wait(3000);
}
async function sample(page,cdp,browserCdp,t0,note){
  const {metrics}=await cdp.send('Performance.getMetrics');const m=Object.fromEntries(metrics.map(x=>[x.name,x.value]));
  // ArrayBuffer backing stores and the embedder (Blink) heap are outside JSHeapUsedSize.
  let hu={};try{hu=await cdp.send('Runtime.getHeapUsage');}catch{}
  const pg=await page.evaluate(()=>({gl:window.__gl?{created:window.__gl.created,alive:window.__gl.alive(),lost:window.__gl.lost()}:null,world:window.__qual.world(),stats:window.__qual.stats(),rec:window.__qual.recording(),
    structures:window.__qual.structure?.()??null}));
  const procs=processes();
  return {t:+((Date.now()-t0)/1000).toFixed(1),note,procs:byType(procs),renderers:procs.filter(p=>p.type==='renderer').map(p=>({pid:p.pid,rss:p.rss,anon:p.anon,shmem:p.shmem,pss:p.pss})),
    heapMB:+(m.JSHeapUsedSize/1048576).toFixed(1),heapTotalMB:+(m.JSHeapTotalSize/1048576).toFixed(1),documents:m.Documents,frames:m.Frames,nodes:m.Nodes,listeners:m.JSEventListeners,
    workers:await workers(browserCdp),packFrames:pg.world.frames,gl:pg.gl,geometries:pg.stats?.geometries??null,textures:pg.stats?.textures??null,programs:pg.stats?.programs??null,
    family:pg.stats?.family??null,remote:pg.world.remote,recordingChunks:pg.rec.chunks,recordingMB:+(pg.rec.bytes/1048576).toFixed(1),
    intents:pg.stats?.intents??null,structures:pg.structures??null,
    backingStoreMB:hu.backingStorageSize!==undefined?+(hu.backingStorageSize/1048576).toFixed(1):null,embedderHeapMB:hu.embedderHeapUsedSize!==undefined?+(hu.embedderHeapUsedSize/1048576).toFixed(1):null};
}
// Least-squares slope (MB per minute) of one series over time.
const slope=(xs,ys)=>{const n=xs.length;if(n<3)return null;const mx=xs.reduce((a,b)=>a+b)/n,my=ys.reduce((a,b)=>a+b)/n;return +((xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/xs.reduce((a,x)=>a+(x-mx)**2,0))*60).toFixed(2);};
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-memory-')),recDir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-memory-rec-'));
  for(const p of ['cymatic-field','blueprint-cathedral']){const m=packs.install(path.join(REPO,'packs/examples',p),dir);packs.setTrust(m.id,dir,{trusted:true});}
  const svc=await createService({port:0,dataDir:dir}).start(),url=`http://127.0.0.1:${svc.port}`,projectId=sha('memory-forensics');
  let n=0,paused=false;const modules=[];
  const ev=(kind,x={})=>({v:1,id:`mem-${String(++n).padStart(8,'0')}`,ts:Date.now(),kind,projectId,sessionId:'mem',origin:'unknown',...x});
  const post=events=>fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events})}).catch(()=>{});
  await post([ev('workspace.started',{name:'memory-forensics'}),ev('document.snapshot',{file:'src/a.ts',content:'export function a(){ return 1; }\n',meta:{reason:'edit'}})]);await svc.flush(projectId);
  // 'grow': the project grows (a function per event, a module every seven); 'churn': 20 modules of 5 functions, then every
  // event rewrites one of them between two versions with the same functions (activity, constant structure).
  let streamMode='grow',churn=0;
  const stream=setInterval(()=>{if(paused)return;const k=n;let content,m;
    if(streamMode==='churn'){if(modules.length<20){m={name:`c${modules.length}`};modules.push(m);}else m=modules[churn++%20];const v=(m.v=(m.v||0)+1)%2;
      content=Array.from({length:5},(_,i)=>`export function part${i}(x: number){ return x ${v?'+':'-'} ${i}; }`).join('\n')+'\n';}
    else{if(k%7===0||!modules.length)modules.push({name:`m${modules.length}`,lines:[]});m=modules[k%modules.length];
      m.lines.push(`export function step${m.lines.length}(x: number){ return x + ${m.lines.length}; }`);content=m.lines.join('\n')+'\n';}
    const events=[ev('document.snapshot',{file:`src/${m.name}.ts`,content,meta:{reason:'edit'}})];
    if(k%23===0)events.push(ev('terminal.command.finished',{meta:{category:'test',exitCode:k%46===0?1:0}}));if(k%11===0)events.push(ev('agent.tool.completed',{file:`src/${m.name}.ts`,meta:{provider:'mem',agent:'agent-1',tool:'Edit'}}));
    void post(events);},3000);
  const recipe=action=>adminPost(url,`/api/recipe?id=${projectId}`,{action});
  const FAMILY={stellar:{type:'family',family:'stellar-forge'},biosphere:{type:'family',family:'fractal-biosphere'},cathedral:{type:'family',family:'machine-cathedral'},
    cymatic:{type:'family',family:'halcyon.cymatic-field'},blueprint:{type:'pack',pack:'northlight.blueprint-cathedral'}};
  const results={};
  const browser=DRIVER==='lean'?await launchLean(GPU):await launch(GPU);
  try{
    const renderer=await rendererOf(browser);const browserCdp=await browser.newBrowserCDPSession();
    for(const name of EXPERIMENTS){
      streamMode=name.startsWith('churn')?'churn':'grow';if(name.startsWith('churn')){modules.length=0;churn=0;}
      await recipe(name==='packs'||name==='bitmaps'?FAMILY.cymatic:FAMILY.stellar);
      const page=await browser.newPage({viewport:{width:1920,height:1080},acceptDownloads:true});const errors=[];
      page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
      await page.addInitScript(TRACK);if(WRAP)await page.addInitScript(WRAPPER(WRAP));
      // Bisection variants: without the label overlay, a 2D world (no WebGL), and with the side panels not laid out.
      const world=name==='churn-city'?'city':'living',labels=name==='churn-nolabels'||name==='churn-hidden'?'&labels=off':'';
      await page.goto(`${url}/?project=${projectId}&world=${world}&qual=1${labels}`);await page.waitForFunction(()=>!!window.__qual);await wait(4000);
      if(name==='churn-hidden')await page.evaluate(()=>{for(const p of document.querySelectorAll('.panel'))p.style.display='none';});
      if(name!=='silent')await page.evaluate(()=>document.getElementById('soundBtn').click());await wait(4000);
      if(RECORD_SIZE)await page.evaluate(v=>window.__qual.setRecordSize?.(v),RECORD_SIZE);
      const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('HeapProfiler.enable');
      const t0=Date.now(),series=[],syncs=[],END=t0+MINUTES*60000;let lastSample=0,ops=0,step=0;
      series.push(await sample(page,cdp,browserCdp,t0,'start'));
      const cycle=['stellar','biosphere','cathedral','cymatic','blueprint'];
      while(Date.now()<END){
        if(name==='baseline'){paused=Math.floor((Date.now()-t0)/180000)%2===1;await wait(1000);}
        else if(name==='quiet'){paused=true;await wait(1000);}
        else if(name==='silent'){paused=false;await wait(1000);}
        else if(name.startsWith('churn')){paused=false;await wait(1000);}
        else if(name==='switching'){await page.evaluate(a=>window.__qual.action(a),FAMILY[cycle[step++%cycle.length]]);ops++;await wait(20000);}
        else if(name==='packs'){await page.evaluate(a=>window.__qual.action(a),FAMILY[step++%2?'stellar':'cymatic']);ops++;await wait(15000);}
        else if(name==='activity'){const began=Date.now();
          await page.evaluate(a=>window.__qual.action(a),FAMILY[cycle[step++%cycle.length]]);ops++;await wait(15000);
          const dl=page.waitForEvent('download',{timeout:90000}).catch(()=>null);const world=await page.evaluate(()=>window.__qual.world());
          await page.evaluate(()=>window.__qual.record());const r0=Date.now();await page.evaluate(()=>window.__qual.pilot(true));let markers=0;
          for(const at of [3000,8000,13000]){await wait(Math.max(0,r0+at-Date.now()));if(await page.evaluate(()=>window.__qual.marker(300)))markers++;}
          await wait(Math.max(0,r0+20000-Date.now()));await page.evaluate(()=>window.__qual.stop());const d=await dl;
          if(d){const f=path.join(recDir,'a.webm');await d.saveAs(f);await d.delete().catch(()=>{});
            try{const a=media.analyse(f),m=media.markers(f);syncs.push({t:+((r0-t0)/1000).toFixed(0),family:world.family,look:world.look,remote:world.remote,video:a.video,fps:a.fps,
              maxIntervalAfterStartupMs:a.maxIntervalAfterStartupMs,markers,paired:m.pairs.filter(x=>x.chirp!==null).length,offsetsMs:m.pairs.map(x=>x.offsetMs),offsetRangesMs:m.pairs.map(x=>x.offsetRangeMs)});}
            catch(e){syncs.push({t:+((r0-t0)/1000).toFixed(0),error:String(e).slice(0,200)});}fs.rmSync(f,{force:true});}
          else syncs.push({t:+((r0-t0)/1000).toFixed(0),error:'no file'});
          await wait(Math.max(0,began+60000-Date.now()));}
        else if(name==='recording'||name==='bitmaps'){
          const [dl]=await Promise.all([page.waitForEvent('download',{timeout:WRAP==='no-download'?25000:60000}).catch(()=>null),(async()=>{await page.evaluate(()=>window.__qual.record());await wait(20000);await page.evaluate(()=>window.__qual.stop());})()]);
          if(dl){const f=path.join(recDir,'r.webm');await dl.saveAs(f);fs.rmSync(f,{force:true});await dl.delete().catch(()=>{});}ops++;await wait(5000);}
        const timed=['baseline','quiet','silent','activity'].includes(name)||name.startsWith('churn');
        if(GC_EACH&&(!timed||Date.now()-lastSample>=SAMPLE)){lastSample=Date.now();await collect(cdp,browserCdp);series.push(await sample(page,cdp,browserCdp,t0,`ops ${ops}, after collection`));}
        else if(Date.now()-lastSample>=SAMPLE){lastSample=Date.now();series.push(await sample(page,cdp,browserCdp,t0,`ops ${ops}`));}
      }
      paused=false;
      const before=await sample(page,cdp,browserCdp,t0,'end, before forced collection');await collect(cdp,browserCdp);
      const after=await sample(page,cdp,browserCdp,t0,'end, after forced collection');series.push(before,after);
      // Trend of the renderer processes (aggregate) and the GPU process, and what a collection gives back.
      const xs=series.slice(1,-2).map(s=>s.t),r=series.slice(1,-2).map(s=>s.procs.renderer?.rss||0),g=series.slice(1,-2).map(s=>s.procs['gpu-process']?.rss||0),h=series.slice(1,-2).map(s=>s.heapMB);
      const half=Math.floor(xs.length/2);
      // Post-collection baseline per operation (--gc-each): first and second half slopes, MB per operation.
      const post=series.filter(x=>/after collection/.test(x.note)&&x.note.startsWith('ops'));
      const perOp=(list)=>{const xs=list.map((_,i)=>i),ys=list.map(x=>x.procs.renderer?.rss||0);return xs.length>2?+(slope(xs,ys)/60).toFixed(3):null;};
      const ph=Math.floor(post.length/2);
      results[name]={minutes:MINUTES,operations:ops,renderer,errors,gcEach:GC_EACH?{rendererMBperOp:perOp(post),firstHalf:perOp(post.slice(0,ph)),secondHalf:perOp(post.slice(ph)),
        rendererAfterCollection:post.map(x=>x.procs.renderer?.rss),gpuAfterCollection:post.map(x=>x.procs['gpu-process']?.rss)}:null,
        trend:{rendererMBperMin:slope(xs,r),rendererSecondHalfMBperMin:slope(xs.slice(half),r.slice(half)),gpuMBperMin:slope(xs,g),heapMBperMin:slope(xs,h)},
        rendererMB:{start:series[0].procs.renderer?.rss,end:before.procs.renderer?.rss,afterCollection:after.procs.renderer?.rss,max:Math.max(...series.map(s=>s.procs.renderer?.rss||0))},
        gpuMB:{start:series[0].procs['gpu-process']?.rss,end:before.procs['gpu-process']?.rss,afterCollection:after.procs['gpu-process']?.rss},
        rendererProcesses:{start:series[0].procs.renderer?.count,max:Math.max(...series.map(s=>s.procs.renderer?.count||0)),end:before.procs.renderer?.count},
        glContexts:{created:before.gl?.created,aliveBefore:before.gl?.alive,aliveAfter:after.gl?.alive},workers:{end:before.workers,afterCollection:after.workers},
        sync:syncs.length?syncs:undefined,series};
      if(page.errors)errors.push(...await page.errors());
      const x=results[name];
      if(x.gcEach)console.log(`${name} (collection after each operation): renderer after collection per operation ${x.gcEach.rendererMBperOp} MB (first half ${x.gcEach.firstHalf}, second half ${x.gcEach.secondHalf}); series ${x.gcEach.rendererAfterCollection.join(' ')}`);
      console.log(`${name}: ${ops} operations in ${MINUTES} min; renderer ${x.rendererMB.start} → ${x.rendererMB.end} MB (max ${x.rendererMB.max}), after collection ${x.rendererMB.afterCollection}; trend ${x.trend.rendererMBperMin} MB/min (second half ${x.trend.rendererSecondHalfMBperMin}); GPU ${x.gpuMB.start} → ${x.gpuMB.end} → ${x.gpuMB.afterCollection}; renderer processes ${x.rendererProcesses.start}/${x.rendererProcesses.max}/${x.rendererProcesses.end}; WebGL contexts created ${x.glContexts.created}, alive ${x.glContexts.aliveBefore} → ${x.glContexts.aliveAfter} after collection; workers ${x.workers.end} → ${x.workers.afterCollection}; heap ${series[0].heapMB} → ${before.heapMB} MB; errors ${errors.length}`);
      if(x.sync){const offs=x.sync.flatMap(r=>r.offsetsMs||[]).filter(v=>v!==null),paired=x.sync.reduce((n,r)=>n+(r.paired||0),0),sched=x.sync.reduce((n,r)=>n+(r.markers||0),0);
        console.log(`${name} recordings: ${x.sync.length} (${x.sync.filter(r=>r.error).length} failed); markers paired ${paired}/${sched}; offsets ${offs.length?`${Math.min(...offs)}…${Math.max(...offs)} ms`:'none'}; fps ${x.sync.map(r=>r.fps).join(' ')}`);}
      await page.close();
    }
  }finally{clearInterval(stream);await browser.close();await svc.stop();fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(recDir,{recursive:true,force:true});}
  const file=path.join(OUT,`memory-${LABEL}${GPU?`-${GPU}`:''}.json`);
  fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),label:LABEL,driver:DRIVER,wrap:WRAP,code:REPO===HERE?'this checkout':REPO,gpu:GPU||'swiftshader',minutes:MINUTES,sampleSeconds:SAMPLE/1000,gcEach:GC_EACH,recordSize:RECORD_SIZE||'player default',experiments:results},null,1));
  console.log(`results: ${path.relative(process.cwd(),file)}`);
})().catch(e=>{console.error(e);process.exitCode=1;});

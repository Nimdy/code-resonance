'use strict';
// Recording synchronisation under controlled conditions: short recordings repeated per condition, markers v2 (a green
// flash and a 3-6 kHz chirp at the same performance time, found by colour and by a matched filter), every marker's raw
// timings kept. Offset = sound − picture, an interval bounded by the captured frames around the flash.
//
// node visual/sync.qual.js [--gpu amd] [--reps 3] [--seconds 20] [--conditions a,b,...] [--out results/sync]
// Conditions: built-in world (Stellar Forge) and an executable world pack (Cymatic Field); 720p and 1080p; adaptive
// quality and a fixed full quality; a world switch during the recording; heavy CPU load (busy processes on every core);
// the recorded performance replayed at 4×, and live mode with events arriving (as in the soak); and markers scheduled
// right after a 150 ms main-thread stall (the replay playhead advances once per animation frame: sound scheduled from a
// stale playhead was late by the stall).
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const {REPO,projectOf,launch,rendererOf,adminPost,recipeAction,playerPage,worldReady,checker}=require('./harness');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const packs=require(path.join(REPO,'engine/packs'));
const {lumen}=require('./datasets');
const media=require('./media');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const GPU=arg('gpu',null),REPS=+arg('reps',3),SECONDS=+arg('seconds',20);
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','sync')));
const STELLAR={type:'family',family:'stellar-forge'},CYMATIC={type:'family',family:'halcyon.cymatic-field'};
const ALL=[
  {key:'stellar-720p',world:STELLAR,size:'720p'},{key:'stellar-1080p',world:STELLAR,size:'1080p'},{key:'stellar-1080p-fixed',world:STELLAR,size:'1080p',quality:0},
  {key:'cymatic-720p',world:CYMATIC,size:'720p',remote:true},{key:'cymatic-1080p',world:CYMATIC,size:'1080p',remote:true},{key:'cymatic-1080p-fixed',world:CYMATIC,size:'1080p',quality:0,remote:true},
  {key:'stellar-1080p-switching',world:STELLAR,size:'1080p',switching:true},{key:'stellar-1080p-load',world:STELLAR,size:'1080p',load:true},
  {key:'stellar-1080p-live',world:STELLAR,size:'1080p',live:true},{key:'cymatic-1080p-live',world:CYMATIC,size:'1080p',remote:true,live:true},
  {key:'stellar-720p-stall',world:STELLAR,size:'720p',stall:150}];
const CONDITIONS=arg('conditions',null)?ALL.filter(c=>arg('conditions').split(',').includes(c.key)):ALL;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const {checks,check}=checker();
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cr-sync-'));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-sync-data-'));lumen(root);const data=path.join(root,'lumen');
  const m=packs.install(path.join(REPO,'packs/examples/cymatic-field'),data);packs.setTrust(m.id,data,{trusted:true});
  const svc=await createService({port:0,dataDir:data}).start(),url=`http://127.0.0.1:${svc.port}`,replayProject=projectOf(data),liveProject=sha('sync-live');
  // A live session (as in the soak), for the live-mode conditions.
  let n=0;const files=[];const ev=(kind,x={})=>({v:1,id:`sync-${String(++n).padStart(8,'0')}`,ts:Date.now(),kind,projectId:liveProject,sessionId:'sync',origin:'unknown',...x});
  const post=events=>fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events})}).catch(()=>{});
  await post([ev('workspace.started',{name:'sync-live'}),ev('document.snapshot',{file:'src/a.ts',content:'export function a(){ return 1; }\n',meta:{reason:'edit'}})]);await svc.flush(liveProject);
  const stream=setInterval(()=>{const k=n;if(k%6===0||!files.length)files.push({name:`src/m${files.length}.ts`,lines:[]});const f=files[k%files.length];f.lines.push(`export function s${f.lines.length}(x: number){ return x * ${f.lines.length}; }`);
    const events=[ev('document.snapshot',{file:f.name,content:f.lines.join('\n')+'\n',meta:{reason:'edit'}})];if(k%9===0)events.push(ev('terminal.command.finished',{meta:{category:'test',exitCode:k%18===0?1:0}}));void post(events);},3000);
  const results={};const browser=await launch(GPU);
  try{
    const renderer=await rendererOf(browser);
    for(const c of CONDITIONS){
      const project=c.live?liveProject:replayProject;
      await adminPost(svc,`/api/recipe?id=${project}`,{action:c.world});
      const query=c.quality!==undefined?`&quality=${c.quality}&adapt=0`:'';
      let page,errors=[];
      if(c.live){page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true});page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
        await page.goto(`${url}/?project=${project}&world=living&qual=1${query}`);await page.waitForFunction(()=>!!window.__qual);}
      else ({page,errors}=await playerPage(browser,svc,project,{query}));
      const burners=c.load?Array.from({length:os.availableParallelism()},()=>cp.spawn(process.execPath,['-e','for(;;){}'],{stdio:'ignore'})):[];
      try{
        await worldReady(page,{remote:!!c.remote,family:c.world.family},60000);
        if(c.live)await page.evaluate(()=>document.getElementById('soundBtn').click());
        const reps=[];
        for(let r=0;r<REPS;r++){
          if(!c.live)await page.evaluate(()=>window.__qual.replayFromStart());await wait(2500);
          const dl=page.waitForEvent('download',{timeout:120000}).catch(()=>null);
          await page.evaluate(async s=>{window.__qual.setRecordSize(s);await window.__qual.record();window.__qual.pilot(true);},c.size);
          const began=Date.now();let markers=0,next=2000;
          while(Date.now()-began<SECONDS*1000){const t=Date.now()-began;
            if(t>=next&&t<SECONDS*1000-1500){if(await page.evaluate(ms=>{const t0=performance.now();while(performance.now()-t0<ms);return window.__qual.marker(300);},c.stall||0))markers++;next+=4500;}
            if(c.switching&&t>=7000&&t<7200)await page.evaluate(()=>window.__qual.action({type:'family',family:'fractal-biosphere'}));
            if(c.switching&&t>=13000&&t<13200)await page.evaluate(()=>window.__qual.action({type:'family',family:'stellar-forge'}));
            await wait(100);}
          await page.evaluate(()=>window.__qual.stop());const d=await dl;if(!d){reps.push({error:'no file'});continue;}
          const file=path.join(tmp,`${c.key}-${r}.webm`);await d.saveAs(file);
          const a=media.analyse(file),s=media.markers(file);
          reps.push({markers,video:a.video,fps:a.fps,frameInterval:a.frameInterval,maxIntervalAfterStartupMs:a.maxIntervalAfterStartupMs,sync:s});
          fs.rmSync(file,{force:true});
        }
        const pairs=reps.flatMap(x=>x.sync?.pairs||[]),paired=pairs.filter(p=>p.chirp!==null),offs=paired.map(p=>p.offsetMs).sort((a,b)=>a-b);
        const q=p=>offs.length?offs[Math.min(offs.length-1,Math.floor(p*offs.length))]:null;
        results[c.key]={condition:c,reps,summary:{markersScheduled:reps.reduce((a,x)=>a+(x.markers||0),0),flashes:pairs.length,paired:paired.length,
          medianMs:q(.5),p5Ms:q(.05),p95Ms:q(.95),minMs:offs[0]??null,maxMs:offs.at(-1)??null,worstAbsMs:offs.length?Math.max(...offs.map(Math.abs)):null,
          fps:reps.map(x=>x.fps),widestFrameIntervalAtFlashMs:paired.length?Math.max(...paired.map(p=>p.offsetRangeMs[1]-p.offsetRangeMs[0])):null}};
        const sm=results[c.key].summary;
        console.log(`${c.key.padEnd(26)} ${sm.paired}/${sm.markersScheduled} markers paired; offset median ${sm.medianMs} ms, 5-95 % ${sm.p5Ms}…${sm.p95Ms}, range ${sm.minMs}…${sm.maxMs}; fps ${sm.fps.join('/')}; widest frame gap at a flash ${sm.widestFrameIntervalAtFlashMs} ms; errors ${errors.length}`);
        check(`${c.key}: every scheduled marker found and paired`,sm.paired===sm.markersScheduled&&sm.flashes===sm.markersScheduled,`${sm.paired}/${sm.markersScheduled}`);
      }finally{for(const b of burners)b.kill();await page.close();}
    }
    fs.writeFileSync(path.join(OUT,`sync-matrix${GPU?`-${GPU}`:''}.json`),JSON.stringify({at:new Date().toISOString(),gpu:GPU||'swiftshader',renderer,reps:REPS,seconds:SECONDS,checks,results},null,1));
  }finally{clearInterval(stream);await browser.close();await svc.stop();fs.rmSync(root,{recursive:true,force:true});fs.rmSync(tmp,{recursive:true,force:true});}
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});

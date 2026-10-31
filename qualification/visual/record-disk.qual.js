'use strict';
// Record to a file on disk against keeping the recording in memory, in the real player (Record & Broadcast) for minutes,
// measured from outside the page. Each run starts a fresh headless shell through the lean driver (no DevTools Network
// domain, which would grow the renderer by itself: lean.js) on an isolated receiver (never ~/.code-resonance), records
// for --minutes, and samples every --every seconds: what the page reports (bytes delivered, written to disk, held in
// memory), the size of the working file on disk (read from the browser's profile folder), the JS heap (Performance
// metrics) and the resident memory of the browser's processes (/proc). It then stops, times the copy into the chosen
// file, downloads that file and reads it with ffmpeg (duration, streams, the sound). The crash runs record to disk, kill
// the page (a renderer crash; a closed tab), read the working file left on disk with ffmpeg as it is, then open a new
// window and save the interrupted recording through the interface. The copy run times saving a large recording: a
// live WebM of --copy-gb gigabytes, built from the memory run's real file (its clusters repeated with later times), is
// put in the private storage as an interrupted recording and saved through the interface (indexed, copied, deleted).
// Headless Chromium shows no Save dialog: showSaveFilePicker is answered with a file of the page's private storage (a
// real FileSystemFileHandle written through the same createWritable()). Everything else is the product's own path.
//   node visual/record-disk.qual.js [--minutes 3] [--every 10] [--runs memory-720p,disk-720p,memory-vertical,disk-vertical,crash,close]
//                                   [--copy-gb 1] [--source <a recorder WebM, for the copy run alone>] [--out results/memory/memory-record-disk.json]
const path=require('node:path');
const fs=require('node:fs');
const cp=require('node:child_process');
const {launchLean}=require('./lean');
const {processMemory}=require('./harness');
const {createEnvironment}=require('../ui/environment.js');
const REPO=path.resolve(__dirname,'../..');
let ffmpeg=null;try{ffmpeg=require(path.join(REPO,'qualification/node_modules/ffmpeg-static'));}catch{}
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const MINUTES=+arg('minutes',3),EVERY=+arg('every',10),RUNS=arg('runs','memory-720p,disk-720p,memory-vertical,disk-vertical,crash,close,copy').split(','),COPY_GB=+arg('copy-gb',1);
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','memory','memory-record-disk.json')));
const WORK=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'cr-recdisk-'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const MB=n=>Math.round(n/1048576*10)/10;
const PICKER=`window.showSaveFilePicker=async o=>{const d=await navigator.storage.getDirectory();return d.getFileHandle('picked-'+o.suggestedName,{create:true});};`;
const device=to=>`try{localStorage.setItem('code-resonance-device-v1',JSON.stringify({quality:'auto',recordTo:'${to}'}));}catch{}`;
// The largest file the browser's private file storage holds now, and the folder's total (the working file grows here).
function opfsOnDisk(profile){
  const root=path.join(profile,'Default','File System');let largest=0,total=0;
  const walk=d=>{let list=[];try{list=fs.readdirSync(d,{withFileTypes:true});}catch{return;}for(const e of list){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else{const s=fs.statSync(f).size;total+=s;if(s>largest){largest=s;opfsOnDisk.last=f;}}}};
  walk(root);return {largest,total,file:opfsOnDisk.last||null};
}
function probe(file){
  const size=fs.statSync(file).size;if(!ffmpeg)return {size};
  const r=cp.spawnSync(ffmpeg,['-hide_banner','-i',file,'-af','volumedetect','-f','null','-'],{encoding:'utf8',timeout:600000});
  const err=r.stderr||'',dur=/Duration: (N\/A|(\d+):(\d+):([\d.]+))/.exec(err),video=/Stream #\S+.*Video: (\w+).*?, (\d+)x(\d+)/.exec(err),audio=/Stream #\S+.*Audio: (\w+)/.exec(err),max=/max_volume: (-?[\d.]+|-inf) dB/.exec(err);
  const time=[...err.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  const decodeErrors=err.split('\n').filter(l=>/\[(matroska|vp8|vp9|libvpx|opus|libopus)[^\]]*\].*(error|invalid|corrupt|prematurely)|Error while decoding|Invalid data found/i.test(l));
  // Seeking to the middle (a seekable file goes there through its Cues; ffmpeg can also scan a file without them).
  let seek=null;
  if(dur&&dur[1]!=='N/A'){const mid=((+dur[2])*3600+(+dur[3])*60+(+dur[4]))/2,t0=Date.now();const s=cp.spawnSync(ffmpeg,['-hide_banner','-v','error','-ss',String(mid),'-i',file,'-frames:v','1','-f','null','-'],{encoding:'utf8'});seek={at:mid,ok:s.status===0&&!s.stderr.trim(),ms:Date.now()-t0};}
  return {size,sizeMB:MB(size),duration:dur?dur[1]==='N/A'?null:(+dur[2])*3600+(+dur[3])*60+(+dur[4]):null,decodedTo:time?(+time[1])*3600+(+time[2])*60+(+time[3]):null,
    video:video?{codec:video[1],width:+video[2],height:+video[3]}:null,audio:audio?audio[1]:null,maxVolumeDb:max?(max[1]==='-inf'?null:+max[1]):null,decodeErrors:decodeErrors.slice(0,3),seek};
}
async function open(env,{to,size,bypassCSP=false}){
  const browser=await launchLean(null);
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(device(to));await page.addInitScript(PICKER);
  const s=(await page.context().newCDPSession());await s.send('Performance.enable');
  // The copy run's setup fetches its large file from a local server (the player's own policy allows only its origin).
  if(bypassCSP)await s.send('Page.setBypassCSP',{enabled:true});
  await page.goto(`${env.url}/?qual=1&project=${env.projects.sample}#/output`);
  await page.waitForFunction(()=>window.ResonancePlayer?.state.model&&window.__qual&&document.getElementById('outRecordBtn'),undefined,{timeout:60000});
  await page.waitForFunction(()=>window.ResonancePlayer.state.recording.disk.ok!==null,undefined,{timeout:30000});
  await page.evaluate(size=>window.__qual.setRecordSize(size),size);
  await page.waitForFunction(to=>window.ResonancePlayer.record.target===to,to,{timeout:10000});
  const heap=async()=>{const m=(await s.send('Performance.getMetrics')).metrics;const g=k=>m.find(x=>x.name===k)?.value||0;return {used:MB(g('JSHeapUsedSize')),total:MB(g('JSHeapTotalSize'))};};
  return {browser,page,heap,cdp:s};
}
async function sample(o,t0){
  const st=await o.page.evaluate(()=>window.ResonancePlayer.state.recording.stats);
  const mem=processMemory(),disk=opfsOnDisk(o.browser.profile);
  return {t:Math.round((Date.now()-t0)/1000),elapsedS:Math.round(st.elapsedMs/1000),frames:st.frames,deliveredMB:MB(st.bytes),writtenMB:st.written===null?null:MB(st.written),heldMB:MB(st.held||0),
    opfsFileMB:MB(disk.largest),heap:await o.heap(),rss:{renderer:mem.renderer,browser:mem.browser,gpu:mem.gpu,other:mem.other,total:mem.renderer+mem.browser+mem.gpu+mem.other}};
}
const saved=(page)=>page.evaluate(()=>{const l=window.ResonancePlayer.state.recording.last;return l&&!l.saving&&(l.file||l.kept||l.target==='memory')?l:null;});
async function fetchPicked(o,name,to){
  const dl=o.page.waitForEvent('download',{timeout:300000});
  await o.page.evaluate(async name=>{const f=await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile();const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=name;document.body.append(a);a.click();a.remove();},name);
  const d=await dl;fs.copyFileSync(await d.path(),to);await d.delete();return to;
}
async function recordRun(env,label){
  const [to,which]=label.split('-'),size=which==='vertical'?'vertical':'720p';
  const o=await open(env,{to,size});const samples=[];const out={label,target:to,size,minutes:MINUTES};
  try{
    // A collection first, so the baseline is the page at rest.
    await o.cdp.send('HeapProfiler.collectGarbage').catch(()=>{});await wait(3000);
    const base=await sample(o,Date.now());out.idle=base;
    const download=to==='memory'?o.page.waitForEvent('download',{timeout:600000}):null;
    await o.page.evaluate(()=>document.getElementById('outRecordBtn').click());
    await o.page.waitForFunction(()=>window.ResonancePlayer.state.recording.active,undefined,{timeout:120000});
    const t0=Date.now();
    while(Date.now()-t0<MINUTES*60000){await wait(EVERY*1000);const x=await sample(o,t0);samples.push(x);console.log(`${label} ${x.t}s delivered ${x.deliveredMB} MB written ${x.writtenMB} held ${x.heldMB} file ${x.opfsFileMB} MB heap ${x.heap.used} MB rss r${x.rss.renderer}/b${x.rss.browser}/g${x.rss.gpu}`);}
    const stopAt=Date.now();
    await o.page.evaluate(()=>document.getElementById('outRecordBtn').click());
    let last=null;for(let i=0;i<1200&&!(last=await saved(o.page));i++)await wait(250);
    out.saveMs=Date.now()-stopAt;out.last=last;
    const file=path.join(WORK,`${label}.webm`);
    if(to==='memory'){const d=await download;fs.copyFileSync(await d.path(),file);await d.delete();}
    else if(last?.file)await fetchPicked(o,last.file,file);
    out.file=fs.existsSync(file)?probe(file):null;
    out.workingFileAfterSave=await o.page.evaluate(async()=>{const out=[];try{const d=await (await navigator.storage.getDirectory()).getDirectoryHandle('code-resonance-recordings');for await(const [n] of d.entries())out.push(n);}catch{}return out;});
    out.errors=await o.page.errors();
    const first=samples[0],end=samples.at(-1);
    out.samples=samples;
    out.growth={minutes:(end.t-first.t)/60,fileMBPerMin:Math.round((end.deliveredMB-first.deliveredMB)/((end.t-first.t)/60)*10)/10,
      rendererMBPerMin:Math.round((end.rss.renderer-first.rss.renderer)/((end.t-first.t)/60)*10)/10,browserMBPerMin:Math.round((end.rss.browser-first.rss.browser)/((end.t-first.t)/60)*10)/10,
      totalMBPerMin:Math.round((end.rss.total-first.rss.total)/((end.t-first.t)/60)*10)/10,heapMBPerMin:Math.round((end.heap.used-first.heap.used)/((end.t-first.t)/60)*10)/10,
      fromIdle:{renderer:end.rss.renderer-base.rss.renderer,browser:end.rss.browser-base.rss.browser,gpu:end.rss.gpu-base.rss.gpu,total:end.rss.total-base.rss.total,heap:Math.round((end.heap.used-base.heap.used)*10)/10}};
    console.log(`${label}: file ${end.deliveredMB} MB; from idle renderer +${out.growth.fromIdle.renderer} MB, browser +${out.growth.fromIdle.browser} MB, total +${out.growth.fromIdle.total} MB; saved in ${out.saveMs} ms; ${JSON.stringify(out.file)}`);
  }finally{await o.browser.close();}
  return out;
}
// Record to disk, then kill the page: Page.crash (the renderer dies) or Target.closeTarget (the tab is closed).
async function crashRun(env,how){
  const o=await open(env,{to:'disk',size:'720p'});const out={label:how,how:how==='crash'?'renderer crash (Page.crash)':'tab closed (Target.closeTarget)'};
  try{
    await o.page.evaluate(()=>document.getElementById('outRecordBtn').click());
    await o.page.waitForFunction(()=>window.ResonancePlayer.state.recording.active,undefined,{timeout:120000});
    const seconds=how==='crash'?60:25,t0=Date.now();
    let before=null;while(Date.now()-t0<seconds*1000){await wait(2000);before=await o.page.evaluate(()=>window.ResonancePlayer.state.recording.stats);}
    out.before={elapsedS:Math.round(before.elapsedMs/100)/10,writtenBytes:before.written,deliveredBytes:before.bytes};
    if(how==='crash')void o.cdp.send('Page.crash').catch(()=>{});else await o.page.close();
    await wait(3000);
    // What the dead page left on disk, read as it is (a live WebM: no duration, no Cues).
    const disk=opfsOnDisk(o.browser.profile);out.leftOnDisk={bytes:disk.largest};
    if(disk.file){const raw=path.join(WORK,`${how}-raw.webm`);fs.copyFileSync(disk.file,raw);out.leftOnDisk.probe=probe(raw);}
    // A new window offers it; saving it through the interface (the Save button) makes it seekable.
    const page=await o.browser.newPage({viewport:{width:1440,height:900}});await page.addInitScript(PICKER);
    await page.goto(`${env.url}/?qual=1&project=${env.projects.sample}#/output`);
    await page.waitForFunction(()=>window.ResonancePlayer?.state.recording.kept?.length===1&&document.querySelector('[data-kept-save]'),undefined,{timeout:60000});
    out.offered=await page.evaluate(()=>window.ResonancePlayer.state.recording.kept[0]);
    await page.evaluate(()=>document.querySelector('[data-kept-save]').click());
    await page.waitForFunction(()=>{const r=window.ResonancePlayer.state.recording;return !r.kept.length&&!r.keptBusy&&r.last?.recovered;},undefined,{timeout:120000});
    const last=await page.evaluate(()=>window.ResonancePlayer.state.recording.last);out.saved={file:last.file,seekable:last.seekable,durationMs:last.durationMs,bytes:last.bytes};
    const file=path.join(WORK,`${how}-saved.webm`);await fetchPicked({page},last.file,file);out.savedProbe=probe(file);
    out.errors=await page.errors();
    console.log(`${how}: ${JSON.stringify(out.before)} → left ${out.leftOnDisk.bytes} bytes (${JSON.stringify(out.leftOnDisk.probe)}); saved ${JSON.stringify(out.savedProbe)}`);
  }finally{await o.browser.close();}
  return out;
}
// A live WebM of about `bytes` built from a real one: its header, then its clusters again and again, each with a later
// timecode (written as 4 bytes), so the result is one long recording in the recorder's own layout.
function bigWebm(source,bytes,to){
  const W=require(path.join(REPO,'public/webm.js')),src=fs.readFileSync(source),s=W.scanner();s.feed(src);const ix=s.index();
  const span=ix.clusters.at(-1).tc+2000,fd=fs.openSync(to,'w');let n=0;
  const write=b=>{fs.writeSync(fd,b);n+=b.length;};
  write(src.subarray(0,ix.clusters[0].at));
  for(let k=0;n<bytes;k++)for(const c of ix.clusters){
    const h=W.header(src,c.data),from=h&&h.id===W.ID.TIMECODE?c.data+h.len+h.size:c.data;
    write(Buffer.from([0x1f,0x43,0xb6,0x75,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xe7,0x84]));const tc=Buffer.alloc(4);tc.writeUInt32BE(c.tc+k*span);write(tc);
    write(src.subarray(from,c.end));}
  fs.closeSync(fd);return n;
}
async function copyRun(env){
  const source=arg('source',path.join(WORK,'memory-720p.webm'));if(!fs.existsSync(source))return {label:'copy',skipped:'needs the memory-720p run first (or --source <a recorder WebM>)'};
  const big=path.join(WORK,'big.webm'),size=bigWebm(source,COPY_GB*1073741824,big),out={label:'copy',bytes:size,sizeMB:MB(size)};
  const http=require('node:http'),srv=http.createServer((q,r)=>{r.writeHead(200,{'Access-Control-Allow-Origin':'*','Content-Type':'video/webm','Content-Length':size});fs.createReadStream(big).pipe(r);}).listen(0,'127.0.0.1');
  await new Promise(r=>srv.once('listening',r));
  const o=await open(env,{to:'disk',size:'720p',bypassCSP:true});
  try{
    const name=`code-resonance-copytest-${Date.now()}.webm`;
    // In the private storage as a recording a crash left (written here with a writable stream, then closed).
    const t0=Date.now();
    await o.page.evaluate(async([url,name])=>{const d=await (await navigator.storage.getDirectory()).getDirectoryHandle('code-resonance-recordings',{create:true});
      const w=await (await d.getFileHandle(name,{create:true})).createWritable();await (await fetch(url)).body.pipeTo(w);},[`http://127.0.0.1:${srv.address().port}/`,name]);
    out.putMs=Date.now()-t0;
    await o.page.evaluate(()=>window.ResonancePlayer.record.refreshKept());
    await o.page.waitForFunction(()=>document.querySelector('[data-kept-save]'),undefined,{timeout:30000});
    const t1=Date.now();
    await o.page.evaluate(()=>document.querySelector('[data-kept-save]').click());
    await o.page.waitForFunction(()=>{const r=window.ResonancePlayer.state.recording;return !r.kept.length&&!r.keptBusy&&r.last?.recovered;},undefined,{timeout:1800000});
    out.saveMs=Date.now()-t1;out.MBps=Math.round(size/1048576/(out.saveMs/1000));
    out.last=await o.page.evaluate(()=>window.ResonancePlayer.state.recording.last);
    // The saved file is now the largest file of the private storage (the working file was deleted): read it there.
    const disk=opfsOnDisk(o.browser.profile);out.savedOnDisk=disk.largest;
    if(ffmpeg&&disk.file){const r=cp.spawnSync(ffmpeg,['-hide_banner','-i',disk.file],{encoding:'utf8'});const d=/Duration: ([^,]+)/.exec(r.stderr);out.duration=d?d[1]:null;
      const mid=+(out.last.durationMs/2000).toFixed(1),t2=Date.now(),sk=cp.spawnSync(ffmpeg,['-hide_banner','-v','error','-ss',String(mid),'-i',disk.file,'-frames:v','1','-f','null','-'],{encoding:'utf8'});out.seek={at:mid,ok:sk.status===0&&!sk.stderr.trim(),ms:Date.now()-t2};}
    out.errors=await o.page.errors();
    console.log(`copy: ${out.sizeMB} MB saved through the interface in ${out.saveMs} ms (${out.MBps} MB/s, indexed then copied); ${JSON.stringify({duration:out.duration,seek:out.seek,seekable:out.last.seekable})}`);
  }finally{await o.browser.close();srv.close();fs.rmSync(big,{force:true});}
  return out;
}
(async()=>{
  const env=await createEnvironment({demo:false});
  const report={at:new Date().toISOString(),browser:'chrome-headless-shell (lean driver), SwiftShader',minutes:MINUTES,every:EVERY,runs:[]};
  try{
    for(const r of RUNS){console.log(`--- ${r}`);report.runs.push(r==='copy'?await copyRun(env):r==='crash'||r==='close'?await crashRun(env,r):await recordRun(env,r));
      fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(report,null,2));}
  }catch(e){console.error(e);report.error=String(e.stack||e);process.exitCode=1;}
  finally{fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(report,null,2));await env.stop();
    if(!process.env.CR_KEEP)fs.rmSync(WORK,{recursive:true,force:true});else console.log(`files kept in ${WORK}`);}
})();

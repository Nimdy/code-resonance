'use strict';
// Genesis field proof: the driver. Inputs from prep.js (inputs/<dataset>.json).
//
// node visual/genesis-field/run.js headless <dataset>                 the run in Node: state hashes at the checkpoints and
//                                                                    the music's measured effect (one variant at a time)
// node visual/genesis-field/run.js stills <dataset> <t,t,...> <dir>   frames at proof times (the browser, as fast as it can)
// node visual/genesis-field/run.js realtime <dataset> <dir> [--record] in real time on the audio clock: hashes, frame
//                                                                    times, CPU and GPU cost; with --record a webm
// node visual/genesis-field/run.js offline <dataset> <dir> [--fps 60]  every frame rendered, the score muxed
// node visual/genesis-field/run.js trace <dataset> <file> [--from s --to s]  per-step hashes in the browser (diagnosis)
// node visual/genesis-field/run.js bars <dataset> <file>               the passage's notes as the browser reads them
// Options: --variants '[{"change":false},{}]' (the comparisons: runs side by side, same camera), --idle (the idle
// experiment: the recording's whole structure, then only the score of inactivity; --from/--to choose the window, the
// tenth minute by default), --field '{...}' (simulation options), --look '{...}' (view options), --name <file stem>,
// --schedule '{"change":14,"music":22,"end":44}' (a longer proof timeline), --gpu amd|nvidia|auto (default amd), --size 1920x1080, --frame '{"azimuth":..}' (camera; by default framed from the
// structure's bounds over the whole window), --R rings, --debug 1|2 (the view draws the phases' tint or weights).
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),cp=require('node:child_process');
const H=require('../harness.js');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const json=(k,d)=>arg(k)?JSON.parse(arg(k)):d;
const [mode,ds='lumen']=process.argv.slice(2);
const inputsOf=d=>JSON.parse(fs.readFileSync(path.join(__dirname,'inputs',`${d}.json`),'utf8'));
const [W,Hh]=(arg('size','1920x1080')).split('x').map(Number);
const R=Number(arg('R',44)),IDLE=process.argv.includes('--idle'),VARIANTS=json('variants',[{}]),FIELD=json('field',{}),LOOK=json('look',undefined),SCHED=json('schedule',null);
async function modules(){
  const {createField,DT,FIELD_VERSION}=await import(path.join(H.REPO,'public/worlds/genesis-field.js'));
  const {degreeOfMidi}=await import(path.join(H.REPO,'public/worlds/genesis-laws.js'));
  const {createMusical}=await import(path.join(H.REPO,'public/worlds/musical.js'));
  const score=require(path.join(H.REPO,'public/score.js'));
  const proof=await import(path.join(__dirname,'proof.mjs'));
  return {deps:{createField,DT,degreeOfMidi,score,createMusical},DT,FIELD_VERSION,...proof};
}
// The window a film covers: the proof's 28 s, or the idle experiment's tenth minute.
async function windowOf(){const m=await modules();return IDLE?{from:Number(arg('from',m.IDLE.minutes*60)),to:Number(arg('to',m.IDLE.minutes*60+m.IDLE.film))}:{from:Number(arg('from',0)),to:Number(arg('to',(SCHED||m.SCHEDULE).end))};}
const schedOf=m=>SCHED||m.SCHEDULE;
async function headless(d,variant={}){
  const m=await modules(),inputs=inputsOf(d),{DT}=m;
  const p=m.createProof(m.deps,inputs,{R,idle:IDLE,field:FIELD,schedule:schedOf(m),...variant}),win=await windowOf();
  // the music's effect, measured: for every struck territory, its matter's mean vibration (displacement along the
  // normal) in the 0.25 s before a bass note and its peak in the 1.2 s after (and when the peak came)
  const speedOf=k=>{const pv=p.sim.pv,u=p.sim.vibration;let s=0,w=0;for(let i=0;i<p.sim.N;i++){const a=pv[i*p.sim.MAXK+k];if(a<.5)continue;s+=Math.abs(u[i]);w++;}return w?s/w:0;};
  const series=[];let ms=0;const steps=Math.round(win.to/DT),from=IDLE?win.from:schedOf(m).music;
  for(let s=1;s<=steps;s++){const t0=process.hrtime.bigint();p.advanceTo(s*DT);ms+=Number(process.hrtime.bigint()-t0)/1e6;
    if(s*DT>=from-1){const row={t:s*DT};for(let k=0;k<p.sim.K();k++)row[k]=speedOf(k);series.push(row);}}
  const start=IDLE?0:schedOf(m).music;
  const strikes=p.log.filter(e=>e.kind==='bass'&&e.v>=.3).map(e=>{const t=start+(e.at-p.passage.from)/1000;if(t<from)return null;
    const before=series.filter(r=>r.t>=t-.25&&r.t<t).map(r=>r[e.k]),after=series.filter(r=>r.t>=t&&r.t<t+1.2);
    let peak=0,at=0;for(const r of after)if(r[e.k]>peak){peak=r[e.k];at=r.t-t;}
    return {at:+t.toFixed(2),territory:e.k,velocity:e.v,before:+(before.reduce((a,b)=>a+b,0)/Math.max(1,before.length)).toFixed(2),peak:+peak.toFixed(2),peakAfterMs:Math.round(at*1000)};}).filter(Boolean);
  return {dataset:d,variant,idle:IDLE,fieldVersion:m.FIELD_VERSION,N:p.sim.N,K:p.sim.K(),steps:p.sim.step,passage:p.passage,hashes:p.hashes,stepMs:+(ms/p.sim.step).toFixed(3),
    events:p.log.filter(e=>e.kind!=='pad').length,strikes,metrics:p.sim.metrics()};
}
// The fixed camera: aimed at the centre of the structures' bounds over the whole window (every variant), and far enough
// to hold them in one viewport's aspect (measured on the same deterministic states in Node, before the page runs).
async function framing(d){
  const m=await modules(),win=await windowOf(),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const v of VARIANTS){const p=m.createProof(m.deps,inputsOf(d),{R,idle:IDLE,field:FIELD,schedule:schedOf(m),...v});
    for(let t=Math.max(1,win.from);t<=win.to;t+=IDLE?2:1){p.advanceTo(t);const x=p.sim.x;for(let i=0;i<p.sim.N;i++)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],x[3*i+a]);hi[a]=Math.max(hi[a],x[3*i+a]);}}}
  const c=[0,1,2].map(a=>(lo[a]+hi[a])/2),r=Math.max(hi[0]-lo[0],hi[2]-lo[2])/2,aspect=W/VARIANTS.length/Hh;
  return {target:[c[0],c[1]*.5,c[2]],distance:Math.max(r*3.55,r*1.12/(Math.tan(15*Math.PI/180)*aspect))+(hi[1]-lo[1])*.6};
}
async function withPage(d,fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-gf-'));fs.cpSync(path.join(__dirname,'..','..','results','datasets',d.replace(/-.*$/,'')),dir,{recursive:true});
  const browser=await H.launch(arg('gpu','amd'));
  try{
    const renderer=await H.rendererOf(browser);
    return await H.withService(dir,async svc=>{
      const project=H.projectOf(dir),page=await browser.newPage({viewport:{width:W,height:Hh}});const errors=[];
      page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
      await page.goto(`http://127.0.0.1:${svc.port}/?film=1&world=living&project=${project}`);await page.waitForFunction(()=>!!window.ResonanceScore&&!!window.ResonanceMusic);
      // the proof's own two modules are served on the receiver's origin (its policy allows only same-origin scripts)
      await page.route('**/__gf/*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();
        let body=fs.readFileSync(path.join(__dirname,name==='proof.mjs'?'proof.mjs':'page.js'),'utf8');
        if(name!=='proof.mjs')body=body.replaceAll('__ORIGIN__','').replaceAll('__PROOF__','/__gf/proof.mjs');
        route.fulfill({status:200,contentType:'text/javascript',body});});
      await page.evaluate(()=>import('/__gf/page.js'));
      const frame=arg('frame')?JSON.parse(arg('frame')):FIELD.boundary?undefined:await framing(d);
      const info=await page.evaluate(o=>window.__gf.init(o),{inputs:inputsOf(d),width:W,height:Hh,R,variants:VARIANTS,idle:IDLE,field:FIELD,schedule:SCHED||undefined,view:{frame,look:LOOK,debug:Number(arg('debug',0))}});
      info.browserRenderer=renderer;
      const out=await fn(page,info);if(errors.length)console.log('page errors',errors.slice(0,5));return out;
    });
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
}
const save=(file,dataUrl)=>fs.writeFileSync(file,Buffer.from(dataUrl.split(',')[1],'base64'));
const stem=()=>arg('name',`genesis-field-${ds}${IDLE?'-idle':''}`);
(async()=>{
  if(mode==='headless'){const out=[];for(const v of VARIANTS)out.push(await headless(ds,v));console.log(JSON.stringify(out.length===1?out[0]:out,null,1));return;}
  if(mode==='stills'){
    const times=(process.argv[4]||'4,8,12').split(',').map(Number),out=process.argv[5]||'.';fs.mkdirSync(out,{recursive:true});
    await withPage(ds,async(page,info)=>{console.log(JSON.stringify({N:info.N,K:info.K,renderer:info.glRenderer,passage:info.passage}));
      for(const t of times){const r=await page.evaluate(t=>window.__gf.still(t),t);save(path.join(out,`${stem()}-${String(t).padStart(5,'0')}.jpg`),r.image);
        console.log('t',t,r.hash.join(' '),r.metrics.map(m=>Object.entries(m).map(([k,v])=>k+' '+v.toFixed(2)).join(' ')).join(' | '));}
      console.log('checkpoints',JSON.stringify(await page.evaluate(()=>window.__gf.hashes())));});
    return;
  }
  if(mode==='realtime'){
    const out=process.argv[4]||'.';fs.mkdirSync(out,{recursive:true});const record=process.argv.includes('--record'),win=await windowOf();
    const res=await withPage(ds,async(page,info)=>{
      const r=await page.evaluate(o=>window.__gf.realtime(o),{record,fps:Number(arg('fps',60)),from:win.from,to:win.to});
      if(r.video){const file=path.join(out,`${stem()}-realtime.webm`),fd=fs.openSync(file,'w');let off=0;
        for(;;){const c=await page.evaluate(o=>window.__gf.chunk(o,8<<20),off);const b=Buffer.from(c.data,'base64');fs.writeSync(fd,b);off+=b.length;if(off>=c.total||!b.length)break;}
        fs.closeSync(fd);r.video.file=path.basename(file);}
      return {dataset:ds,variants:VARIANTS,idle:IDLE,field:FIELD,window:win,size:`${W}x${Hh}`,renderer:info.glRenderer,browserRenderer:info.browserRenderer,N:info.N,K:info.K,passage:info.passage,...r};
    });
    fs.writeFileSync(path.join(out,`${stem()}-realtime${record?'-recorded':''}.json`),JSON.stringify(res,null,1));
    console.log(JSON.stringify({...res,runs:res.runs.map(x=>({variant:x.variant,end:Object.values(x.hashes).at(-1)}))},null,1));return;
  }
  if(mode==='offline'){
    const out=process.argv[4]||'.',fps=Number(arg('fps',60)),win=await windowOf();fs.mkdirSync(out,{recursive:true});
    await withPage(ds,async(page,info)=>{
      const wav=await page.evaluate(([a,b])=>window.__gf.scoreWav(a,b),[win.from,win.to]);const wavFile=path.join(os.tmpdir(),`cr-gf-${ds}-${process.pid}.wav`);fs.writeFileSync(wavFile,Buffer.from(wav,'base64'));
      const file=path.join(out,`${stem()}.mp4`);
      const enc=cp.spawn(require('ffmpeg-static'),['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','-','-i',wavFile,'-map','0:v','-map','1:a','-c:v','libx264','-preset','slow','-crf','16','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest',file],{stdio:['pipe','inherit','inherit']});
      const total=Math.round((win.to-win.from)*fps);const t0=Date.now();
      if(win.from>0)await page.evaluate(t=>window.__gf.advance(t),win.from);
      for(let i=0;i<=total;i++){const img=await page.evaluate(([i,fps,f])=>window.__gf.frame(i,fps,f),[i,fps,win.from]);const b=Buffer.from(img.split(',')[1],'base64');if(!enc.stdin.write(b))await new Promise(r=>enc.stdin.once('drain',r));
        if(i%(fps*4)===0)console.log('frame',i,'/',total,((Date.now()-t0)/1000).toFixed(0)+'s');}
      enc.stdin.end();await new Promise(r=>enc.on('close',r));fs.rmSync(wavFile,{force:true});
      const hashes=await page.evaluate(()=>window.__gf.hashes());fs.writeFileSync(path.join(out,`${stem()}-offline.json`),JSON.stringify({dataset:ds,variants:VARIANTS,idle:IDLE,field:FIELD,window:win,fps,renderer:info.glRenderer,passage:info.passage,runs:hashes},null,1));
      console.log('wrote',file,JSON.stringify(hashes.map(h=>Object.values(h.hashes).at(-1))));
    });
    return;
  }
  if(mode==='bars'){const r=await withPage(ds,async page=>page.evaluate(()=>window.__gf.bars()));fs.writeFileSync(process.argv[4],JSON.stringify(r));return;}
  if(mode==='trace'){const r=await withPage(ds,async page=>page.evaluate(([a,b])=>window.__gf.trace(a,b),[Number(arg('from',1550)),Number(arg('to',1680))]));fs.writeFileSync(process.argv[4],JSON.stringify(r));return;}
  throw new Error('mode: headless | stills | realtime | offline | bars | trace');
})().catch(e=>{console.error(e);process.exitCode=1;});

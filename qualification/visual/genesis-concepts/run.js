'use strict';
// Genesis visual identity concepts: the driver. Three art-directed animatics (topology, resonance, metamorphic), each a
// scripted concept, not a simulation, drawn from Code Resonance's recorded structure and the densest 40 s of its score.
//
// node visual/genesis-concepts/run.js stills <concept> <t,t,...> <dir>   frames at film times
// node visual/genesis-concepts/run.js film <concept> <dir> [--fps 60]     every frame, the score muxed (mp4)
// node visual/genesis-concepts/run.js realtime <concept> <dir> [--record]  on the audio clock: frame times, CPU, GPU
// node visual/genesis-concepts/run.js timeline <concept> <file>           each pass's GPU time every 0.25 s (profiling)
// node visual/genesis-concepts/run.js profile|gpu <concept> <t,t,...>      passes at chosen times | a frame's GPU time
// Options: --seconds 40, --size 1920x1080, --params '{...}' (the concept's own), --gpu amd|nvidia|auto (default amd).
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),cp=require('node:child_process');
const H=require('../harness.js');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const [mode,concept]=process.argv.slice(2);
const [W,Hh]=arg('size','1920x1080').split('x').map(Number),SECONDS=Number(arg('seconds',40)),PARAMS=JSON.parse(arg('params','{}'));
const DATASET='self',INPUTS=path.join(__dirname,'..','genesis-field','inputs','self-dependency.json');
// the passage: the 40 s of the recording with the most notes (bar 634930968, 198 s into it; found by counting each bar's
// notes), just after its ninth dependency
const FROM_BAR=634930968;
const LABELS={topology:'GENESIS concept A · Impossible Topology',resonance:'GENESIS concept B · Resonant Architecture',metamorphic:'GENESIS concept C · Metamorphic Matter','metamorphic-r0':'GENESIS concept C · Metamorphic Matter · renderer C-R0'};
const label=c=>`${LABELS[c]}\nConcept animatic: scripted, not a simulation. Code Resonance's structure and score.`;
const save=(file,dataUrl)=>fs.writeFileSync(file,Buffer.from(dataUrl.split(',')[1],'base64'));
async function withPage(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-gc-'));fs.cpSync(path.join(__dirname,'..','..','results','datasets',DATASET),dir,{recursive:true});
  const browser=await H.launch(arg('gpu','amd'));
  try{
    return await H.withService(dir,async svc=>{
      const project=H.projectOf(dir),page=await browser.newPage({viewport:{width:W,height:Hh}});const errors=[];
      page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
      await page.goto(`http://127.0.0.1:${svc.port}/?film=1&world=living&project=${project}`);await page.waitForFunction(()=>!!window.ResonanceScore&&!!window.ResonanceMusic);
      // the page and the concepts are served on the receiver's origin (its policy allows only same-origin scripts)
      await page.route('**/__gc/*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();
        const body=fs.readFileSync(path.join(__dirname,name),'utf8').replaceAll('__ORIGIN__','');
        route.fulfill({status:200,contentType:'text/javascript',body});});
      await page.evaluate(()=>import('/__gc/page.js'));
      const inputs=JSON.parse(fs.readFileSync(INPUTS,'utf8'));
      const barMs=await page.evaluate(seed=>{const id=window.ResonanceScore.createIdentity(seed.seed);return 240000/(id.tempo[seed.style]||92);},inputs.music);
      const info=await page.evaluate(o=>window.__gc.init(o),{inputs,concept,width:W,height:Hh,from:FROM_BAR*barMs,seconds:SECONDS,label:label(concept),params:PARAMS});
      console.log(JSON.stringify({concept,...info,renderer:await H.rendererOf(browser)}));
      const out=await fn(page,info);if(errors.length)console.log('page errors',errors.slice(0,5));return out;
    });
  }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
}
(async()=>{
  if(!LABELS[concept])throw new Error('concept: topology | resonance | metamorphic | metamorphic-r0');
  if(mode==='stills'){
    const times=(process.argv[4]||'0').split(',').map(Number),out=process.argv[5]||'.';fs.mkdirSync(out,{recursive:true});
    await withPage(async page=>{for(const t of times)save(path.join(out,`${concept}-${String(t).padStart(5,'0')}.jpg`),await page.evaluate(t=>window.__gc.frame(t),t));});
    return;
  }
  if(mode==='gpu'){
    // the GPU time of a frame at film times (a concept's cost, for its risks; not a performance claim)
    const times=(process.argv[4]||'10').split(',').map(Number),out={};
    await withPage(async page=>{for(const t of times)out[t]=await page.evaluate(t=>window.__gc.gpu(t),t);});
    console.log(JSON.stringify({concept,size:`${W}x${Hh}`,gpuMs:out}));return;
  }
  if(mode==='profile'){
    // each pass's GPU time and the CPU's preparation at film times (a concept that supports it; --params '{"profile":true}')
    const times=(process.argv[4]||'10').split(',').map(Number),file=process.argv[5]&&!process.argv[5].startsWith('--')?process.argv[5]:null;
    const r=await withPage(async page=>page.evaluate(t=>window.__gc.profile(t),times));
    if(file)fs.writeFileSync(file,JSON.stringify(r,null,1));console.log(JSON.stringify(r.rows.map(x=>({t:x.t,gpu:x.gpu,cpu:x.cpu,inst:x.instances,calls:x.calls}))));return;
  }
  if(mode==='realtime'){
    // in real time on the audio clock, the score playing: frame times, CPU and GPU per frame, draw calls, memory; with
    // --record a webm of the canvas and the score
    const out=process.argv[4]||'.',record=process.argv.includes('--record'),name=arg('name',`genesis-concept-${concept}`);fs.mkdirSync(out,{recursive:true});
    const res=await withPage(async(page,info)=>{const r=await page.evaluate(o=>window.__gc.realtime(o),{record});
      if(r.video){const file=path.join(out,`${name}-realtime.webm`),fd=fs.openSync(file,'w');let off=0;
        for(;;){const c=await page.evaluate(o=>window.__gc.chunk(o,8<<20),off);const b=Buffer.from(c.data,'base64');fs.writeSync(fd,b);off+=b.length;if(off>=c.total||!b.length)break;}
        fs.closeSync(fd);r.video.file=path.basename(file);}
      return {concept,size:`${W}x${Hh}`,params:PARAMS,record,...r};});
    fs.writeFileSync(path.join(out,`${name}-realtime${record?'-recorded':''}.json`),JSON.stringify(res,null,1));
    console.log(JSON.stringify({fps:res.fps,frameMs:res.frameMs,cpuMs:res.cpuMs,gpuMs:res.gpuMs,drawCalls:res.drawCalls,heapMB:res.heapMB}));return;
  }
  if(mode==='timeline'){
    // each pass's GPU time and the CPU's preparation every quarter second through the film (after a warm-up)
    const file=process.argv[4];const r=await withPage(async page=>page.evaluate(()=>window.__gc.timeline(.25)));
    if(file)fs.writeFileSync(file,JSON.stringify({concept,size:`${W}x${Hh}`,params:PARAMS,...r},null,1));
    const keys=Object.keys(r.rows[0].gpu||{}),pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return +s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2);};
    const sum={};for(const k of keys){const v=r.rows.map(x=>x.gpu[k]);sum[k]={p50:pct(v,.5),p95:pct(v,.95),max:pct(v,1)};}
    const tot=r.rows.map(x=>keys.reduce((a,k)=>a+x.gpu[k],0));sum.total={p50:pct(tot,.5),p95:pct(tot,.95),max:pct(tot,1),at:r.rows[tot.indexOf(Math.max(...tot))].t};
    for(const k of Object.keys(r.rows[0].cpu||{})){const v=r.rows.map(x=>x.cpu[k]);sum['cpu.'+k]={p50:pct(v,.5),p95:pct(v,.95),max:pct(v,1)};}
    console.log(JSON.stringify(sum));return;
  }
  if(mode==='film'){
    const out=process.argv[4]||'.',fps=Number(arg('fps',60));fs.mkdirSync(out,{recursive:true});
    await withPage(async page=>{
      const wav=await page.evaluate(s=>window.__gc.scoreWav(s),SECONDS),wavFile=path.join(os.tmpdir(),`cr-gc-${concept}-${process.pid}.wav`);fs.writeFileSync(wavFile,Buffer.from(wav,'base64'));
      const file=path.join(out,`genesis-concept-${concept}.mp4`);
      const enc=cp.spawn(require('ffmpeg-static'),['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','-','-i',wavFile,'-map','0:v','-map','1:a','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest',file],{stdio:['pipe','inherit','inherit']});
      const total=Math.round(SECONDS*fps),t0=Date.now();
      for(let i=0;i<=total;i++){const b=Buffer.from((await page.evaluate(t=>window.__gc.frame(t),i/fps)).split(',')[1],'base64');if(!enc.stdin.write(b))await new Promise(r=>enc.stdin.once('drain',r));
        if(i%(fps*5)===0)console.log('frame',i,'/',total,((Date.now()-t0)/1000).toFixed(0)+'s');}
      enc.stdin.end();await new Promise(r=>enc.on('close',r));fs.rmSync(wavFile,{force:true});console.log('wrote',file);
    });
    return;
  }
  throw new Error('mode: stills | film');
})().catch(e=>{console.error(e);process.exit(1);});

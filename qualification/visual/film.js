'use strict';
// Renders a recorded performance as a film: every frame at an exact performance time (deterministic, independent of
// render speed), the music rendered offline for the same range, muxed to WebM (VP9 + Opus) with ffmpeg.
//
// node visual/film.js --data <receiver-data> --project <id> [--from ms] [--to ms] [--speed 2] [--fps 30]
//        [--style ambient] [--width 1920 --height 1080] [--out results/visual/film.webm] [--stills t1,t2,...]
//        [--world living|construct] [--recipe recipe.json | --family stellar-forge] [--tail seconds] [--labels cinematic]
//        [--note "text shown on every frame"] [--pack <dir> (install and approve a visual pack in --data first)]
//        [--look <pack id> (apply a declarative or shader pack)] [--gpu amd (render on the AMD integrated GPU, never NVIDIA)]
//        [--tune '{"life.enabled":false}' (tuned genome values, as the Visual Studio applies them)]
//        [--copy (render from a temporary copy of --data: the data directory's recipes are never changed)]
//        [--music '{"mood":.7,"space":.8,"mix":{"perc":0}}' (the composed score's performance profile; absent = as composed)]
//        [--score 2|3 (play this score instead of the one the rendered recipe asks for: comparisons only)]
// --tail keeps rendering (and the music playing) after the last recorded event: inactivity, with no events added.
// The recipe the film used is written next to it (<out>.recipe.json), so the film can be rendered again exactly; so is
// the music it was rendered with (<out>.music.json) when --music or --score chose it.
// The soundtrack plays the score the rendered recipe asks for (genome.music.score; absent = the classic v2 score, so a
// film recipe from before recipe v4 sounds exactly as it did), the same score the picture's musical clock reads.
const path=require('node:path');
const fs=require('node:fs');
const cp=require('node:child_process');
const {launch,rendererOf,adminPost}=require('./harness');
const ffmpeg=require('ffmpeg-static');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','visual','film.webm')));
const fps=Number(arg('fps',30)),speed=Number(arg('speed',1)),width=Number(arg('width',1920)),height=Number(arg('height',1080)),style=arg('style','ambient');
const world=arg('world','living'),labels=arg('labels','cinematic'),tail=Number(arg('tail',0));
const musicArg=arg('music',null),scoreArg=arg('score',null);
if(musicArg!==null){let v;try{v=JSON.parse(musicArg);}catch{throw new Error('--music must be a JSON object, e.g. \'{"mood":.7}\'');}if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('--music must be a JSON object');}
if(scoreArg!==null&&!['2','3'].includes(scoreArg))throw new Error('--score must be 2 or 3');
const {sha}=require(path.join(REPO,'receiver/protocol'));
(async()=>{
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  let dataDir=path.resolve(arg('data'));
  if(process.argv.includes('--copy')){const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'cr-film-'));fs.cpSync(dataDir,tmp,{recursive:true});dataDir=tmp;process.on('exit',()=>fs.rmSync(tmp,{recursive:true,force:true}));}
  // A pinned recipe is installed before the receiver starts, so the player loads exactly that identity.
  if(arg('recipe')){const dir=path.join(dataDir,'projects',sha(arg('project')));fs.copyFileSync(path.resolve(arg('recipe')),path.join(dir,'recipe.json'));}
  // A visual pack for this film: installed into the film's data directory and approved there (local qualification).
  if(arg('pack')){const packs=require(path.join(REPO,'engine/packs'));const r=packs.install(path.resolve(arg('pack')),dataDir);if(r.executable)packs.setTrust(r.id,dataDir,{trusted:true});console.log(`pack ${r.id} ${r.version} (${r.kind})`);}
  const svc=await createService({port:0,dataDir}).start();
  // Let interpretation catch up (e.g. a rebuild after an interpretation upgrade) without writing to the journal.
  await svc.flush();
  if(arg('look')){const r=await adminPost(svc,`/api/recipe?id=${arg('project')}`,{action:{type:'pack',pack:arg('look')}});if(!r.ok)throw new Error(`look: ${await r.text()}`);}
  if(arg('family')){const r=await adminPost(svc,`/api/recipe?id=${arg('project')}`,{action:{type:'family',family:arg('family')}});if(!r.ok)throw new Error(`family: ${await r.text()}`);}
  if(arg('tune')){const r=await adminPost(svc,`/api/recipe?id=${arg('project')}`,{action:{type:'tune',values:JSON.parse(arg('tune'))}});if(!r.ok)throw new Error(`tune: ${await r.text()}`);}
  const browser=await launch(arg('gpu',null));
  const renderer=await rendererOf(browser);console.log(`renderer ${renderer}`);
  if(arg('gpu')==='amd'&&!/AMD|Radeon/i.test(renderer)){await browser.close();throw new Error(`Requested the AMD GPU but got ${renderer}`);}
  const started=Date.now();
  try{
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const musicQuery=`${musicArg!==null?`&music=${encodeURIComponent(musicArg)}`:''}${scoreArg!==null?`&score=${scoreArg}`:''}`;
    await page.goto(`http://127.0.0.1:${svc.port}/?film=1&world=${world}&labels=${labels}&style=${style}&project=${arg('project')}${musicQuery}`);
    await page.waitForFunction(()=>!!window.__film);
    const info=await page.evaluate(([project,speed,note])=>window.__film.open({project,speed,note}),[arg('project'),speed,arg('note','')]);
    if(!info.webgl)throw new Error('WebGL unavailable; the Construct cannot render');
    if(info.recipe)fs.writeFileSync(OUT.replace(/\.webm$/,'')+'.recipe.json',JSON.stringify(info.recipe,null,1));
    console.log(`world ${info.world}${info.recipe?` · ${info.recipe.familyName} (${info.recipe.source}, variant ${info.recipe.variant})`:''}`);
    // The music the page's clock reads (the recipe's score, or --score; the --music profile): the soundtrack uses the same.
    const music={scoreVersion:info.music?.scoreVersion===3?3:2,profile:info.music?.profile||null};
    console.log(`music ${music.scoreVersion===3?'composed score (v3)':'classic score (v2)'}${music.profile?` · profile ${JSON.stringify(music.profile)}`:''}`);
    if(musicArg!==null||scoreArg!==null)fs.writeFileSync(OUT.replace(/\.webm$/,'')+'.music.json',JSON.stringify({style,...music},null,1));
    const from=Number(arg('from',info.start)),to=Math.min(Number(arg('to',info.end)),info.end)+tail*1000;
    const seconds=(to-from)/1000/speed;
    console.log(`performance ${new Date(from).toISOString()} .. ${new Date(to).toISOString()} (${((to-from)/60000).toFixed(1)} min) -> film ${seconds.toFixed(1)} s at ${speed}x`);
    // Music first: its bars give the section (and so the light) for every moment of the film. Stills skip it unless --sections.
    const stillsOnly=!!arg('stills')&&!process.argv.includes('--sections');
    const audio=stillsOnly?{bars:[],wav:''}:await page.evaluate(async({from,to,speed,style,scoreVersion,profile})=>{
      const entries=[];let after=-1;
      for(;;){const p=await (await fetch(`/api/timeline?id=${new URLSearchParams(location.search).get('project')}&after=${after}&limit=1000`)).json();entries.push(...p.entries);if(!p.entries.length||entries.length>=p.total)break;after=p.entries.at(-1).seq;}
      const quiet=new Set(['editor.change.observed','editor.newline.inserted','document.baseline.indexed','validation.diagnostics','execution.command.started','agent.tool.started']);
      const timeline=[];for(const e of entries){if(e.end<from-60000||e.start>to)continue;timeline.push({atMs:Math.max(from,e.start),frame:e.frame});
        for(const c of e.cues)if(!quiet.has(c.type))timeline.push({atMs:Math.min(Math.max(c.ts,e.start),e.end-1),cue:c});}
      const bars=[];
      // The composed score is rendered on the bar grid of the project's real identity from the first bar (as live playback
      // does); the classic score keeps the grid its films were rendered with, so they sound exactly as before.
      const projectSeed=scoreVersion===3?entries.find(e=>Number.isFinite(e.frame?.projectSeed))?.frame.projectSeed:undefined;
      const buf=await window.ResonanceMusic.renderOffline({timeline:timeline.filter(x=>x.atMs>=from-1),startMs:from,durationSec:(to-from)/1000/speed,style,speed,projectId:'film',
        onBar:b=>bars.push({at:b.perfMs,section:b.section}),scoreVersion,profile,...(Number.isFinite(projectSeed)?{projectSeed}:{})});
      const L=buf.getChannelData(0),R=buf.getChannelData(1),rate=buf.sampleRate,n=buf.length,view=new DataView(new ArrayBuffer(44+n*4));
      const w=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
      w(0,'RIFF');view.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
      view.setUint32(24,rate,true);view.setUint32(28,rate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);w(36,'data');view.setUint32(40,n*4,true);
      for(let i=0;i<n;i++){view.setInt16(44+i*4,Math.max(-1,Math.min(1,L[i]))*32767,true);view.setInt16(46+i*4,Math.max(-1,Math.min(1,R[i]))*32767,true);}
      const bytes=new Uint8Array(view.buffer);let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
      return {wav:btoa(bin),bars};
    },{from,to,speed,style,...music});
    await page.evaluate(bars=>window.__film.sections(bars),audio.bars);
    const stills=arg('stills')?arg('stills').split(',').map(Number):null;
    const frameMs=1000/fps*speed;
    if(stills){
      // Each still is preceded by a few seconds of rendering so the camera and animations are where they would be.
      for(const t of stills){
        const at=from+t;await page.evaluate(x=>window.__film.seek(x),at-6000*speed);
        let img;for(let x=at-6000*speed;x<=at;x+=frameMs)img=await page.evaluate(([x,dt])=>window.__film.frame(x,dt),[x,1/fps]);
        const file=OUT.replace(/\.webm$/,'')+`-${String(Math.round(t/1000)).padStart(5,'0')}s.jpg`;fs.writeFileSync(file,Buffer.from(img.split(',')[1],'base64'));console.log('still',file);
      }
    }else{
      const wavFile=OUT.replace(/\.webm$/,'.wav');fs.writeFileSync(wavFile,Buffer.from(audio.wav,'base64'));
      const enc=cp.spawn(ffmpeg,['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','-','-i',wavFile,
        '-c:v','libvpx-vp9','-b:v','6M','-deadline','good','-cpu-used','4','-row-mt','1','-pix_fmt','yuv420p','-c:a','libopus','-b:a','160k','-shortest',OUT],{stdio:['pipe','inherit','inherit']});
      const keyframes=(arg('keyframes')||'').split(',').filter(Boolean).map(Number);
      await page.evaluate(x=>window.__film.seek(x),from);
      const total=Math.ceil(seconds*fps);
      for(let i=0;i<=total;i++){
        const t=from+i*frameMs;
        const img=await page.evaluate(([x,dt])=>window.__film.frame(x,dt),[t,1/fps]);
        const buf=Buffer.from(img.split(',')[1],'base64');
        if(!enc.stdin.write(buf))await new Promise(r=>enc.stdin.once('drain',r));
        const second=i/fps;if(keyframes.some(k=>Math.abs(k-second)<.5/fps))fs.writeFileSync(OUT.replace(/\.webm$/,'')+`-frame-${String(Math.round(second)).padStart(4,'0')}s.jpg`,buf);
        if(i%(fps*10)===0)console.log(`frame ${i}/${total} (${(i/total*100).toFixed(0)}%) ${JSON.stringify(await page.evaluate(()=>window.__film.stats()))}`);
      }
      enc.stdin.end();await new Promise((res,rej)=>enc.on('close',c=>c===0?res():rej(new Error(`ffmpeg exit ${c}`))));
      console.log(`film ${OUT} (${(fs.statSync(OUT).size/1e6).toFixed(1)} MB, ${seconds.toFixed(1)} s) rendered in ${((Date.now()-started)/60000).toFixed(1)} min`);
    }
    if(errors.length)console.log('page errors:',errors.slice(0,5));
  }finally{await browser.close();await svc.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});

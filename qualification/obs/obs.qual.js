'use strict';
// OBS Studio qualification. Runs only in an isolated environment (a disposable CI virtual machine with OBS installed
// from its official PPA, under Xvfb, with software OpenGL): never install OBS on a working machine for this.
// A receiver with a synthetic live session; OBS started with a throw-away configuration (obs-websocket enabled, no
// authentication, bound to loopback); the player's overlay (?overlay=1&sound=1) added as a Browser Source with its audio
// controlled by OBS. Then, through obs-websocket: source screenshots (the overlay renders, is not black, and moves),
// the source's audio meters (the music reaches OBS's mixer), and a real OBS recording measured with ffmpeg (video and
// audio streams, duration, sound level, picture changing). OBS's own log gives the versions and the renderer used.
//
// xvfb-run -a -s "-screen 0 1920x1080x24" node obs/obs.qual.js [--seconds 20] [--out results/obs]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const REPO=path.resolve(__dirname,'../..');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const media=require('../visual/media');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const SECONDS=+arg('seconds',20),OUT=path.resolve(arg('out',path.join(__dirname,'..','results','obs')));
const checks=[];const check=(name,pass,detail='')=>{checks.push({name,pass:!!pass,detail:String(detail)});console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?` — ${detail}`:''}`);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const measurements={};
// obs-websocket 5 (RPC version 1): Hello → Identify → Identified; requests (op 6) and responses (op 7); events (op 5).
function connect(port){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(`ws://127.0.0.1:${port}`);const pending=new Map(),listeners=[];let id=0;
    const timer=setTimeout(()=>reject(new Error('obs-websocket did not identify')),15000);
    ws.onerror=()=>reject(new Error('obs-websocket connection failed'));
    ws.onmessage=e=>{const m=JSON.parse(e.data);
      if(m.op===0)ws.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:(1<<16)|0x7FF}}));
      else if(m.op===2){clearTimeout(timer);resolve({
        request:(requestType,requestData={},timeout=30000)=>new Promise((res,rej)=>{const requestId=String(++id);pending.set(requestId,{res,rej});ws.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}}));
          setTimeout(()=>{if(pending.delete(requestId))rej(new Error(`${requestType}: no answer in ${timeout/1000} s`));},timeout);}),
        on:f=>listeners.push(f),close:()=>ws.close()});}
      else if(m.op===7){const p=pending.get(m.d.requestId);if(!p)return;pending.delete(m.d.requestId);
        m.d.requestStatus.result?p.res(m.d.responseData||{}):p.rej(new Error(`${m.d.requestType}: ${m.d.requestStatus.code} ${m.d.requestStatus.comment||''}`));}
      else if(m.op===5)for(const f of listeners)f(m.d);};
  });
}
function obsConfig(home,port,recordings){
  const cfg=path.join(home,'obs-studio');
  // This machine has no GPU: OBS's browser renders in software (Browser Source Hardware Acceleration off), as headless
  // Chromium does. On a streaming machine with a GPU the default (on) applies.
  const general=`[General]\nFirstRun=false\nLastVersion=520093696\nEnableAutoUpdates=false\nConfirmOnExit=false\nBrowserHWAccel=false\n[BasicWindow]\nSysTrayEnabled=false\nSysTrayWhenStarted=false\n`;
  fs.mkdirSync(path.join(cfg,'basic','profiles','Qualification'),{recursive:true});fs.mkdirSync(path.join(cfg,'basic','scenes'),{recursive:true});
  // OBS up to 30 reads global.ini, 31 and later user.ini: both are written.
  for(const f of ['global.ini','user.ini'])fs.writeFileSync(path.join(cfg,f),general+`[Basic]\nProfile=Qualification\nProfileDir=Qualification\nSceneCollection=Qualification\nSceneCollectionFile=Qualification\n`);
  fs.writeFileSync(path.join(cfg,'basic','profiles','Qualification','basic.ini'),
    `[General]\nName=Qualification\n[Video]\nBaseCX=1280\nBaseCY=720\nOutputCX=1280\nOutputCY=720\nFPSType=1\nFPSInt=30\n[Audio]\nSampleRate=48000\nChannelSetup=Stereo\n`+
    `[Output]\nMode=Simple\n[SimpleOutput]\nFilePath=${recordings}\nRecFormat2=mkv\nRecFormat=mkv\nRecQuality=Stream\nRecEncoder=x264\nStreamEncoder=x264\nVBitrate=4000\nABitrate=160\n`);
  fs.writeFileSync(path.join(cfg,'basic','scenes','Qualification.json'),JSON.stringify({name:'Qualification',current_scene:'Stage',current_program_scene:'Stage',scene_order:[{name:'Stage'}],
    sources:[{id:'scene',versioned_id:'scene',name:'Stage',uuid:'00000000-0000-4000-8000-000000000001',settings:{items:[],id_counter:0},flags:0,enabled:true,mixers:0}]}));
  fs.mkdirSync(path.join(cfg,'plugin_config','obs-websocket'),{recursive:true});
  fs.writeFileSync(path.join(cfg,'plugin_config','obs-websocket','config.json'),JSON.stringify({alerts_enabled:false,auth_required:false,first_load:false,server_enabled:true,server_password:'',server_port:port}));
  return cfg;
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-obs-')),home=path.join(root,'config'),recordings=path.join(root,'recordings'),data=path.join(root,'data');
  fs.mkdirSync(recordings,{recursive:true});
  const svc=await createService({port:0,dataDir:data}).start();const url=`http://127.0.0.1:${svc.port}`,projectId=sha('obs-qualification');
  // A live session: a project growing every 3 s, with tests, an agent and commits (the music needs events).
  let n=0;const files=[];
  const ev=(kind,x={})=>({v:1,id:`obs-${String(++n).padStart(8,'0')}`,ts:Date.now(),kind,projectId,sessionId:'obs',origin:'unknown',...x});
  const post=events=>fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events})}).catch(()=>{});
  await post([ev('workspace.started',{name:'obs-qualification'})]);
  const stream=setInterval(()=>{const k=n;if(k%5===0||!files.length)files.push({name:`src/m${files.length}.ts`,lines:[]});const f=files[k%files.length];f.lines.push(`export function step${f.lines.length}(x: number){ return x + ${f.lines.length}; }`);
    const events=[ev('document.snapshot',{file:f.name,content:f.lines.join('\n')+'\n',meta:{reason:'edit'}})];
    if(k%9===0)events.push(ev('terminal.command.finished',{meta:{category:'test',exitCode:k%18===0?1:0}}));if(k%7===0)events.push(ev('agent.tool.completed',{file:f.name,meta:{provider:'obs',agent:'agent-1',tool:'Edit'}}));
    void post(events);},3000);
  const wsPort=4455+Math.floor(Math.random()*500);
  const cfg=obsConfig(home,wsPort,recordings);
  let obs=null,client=null;
  try{
    obs=cp.spawn('obs',['--disable-updater','--disable-shutdown-check','--multi','--verbose','--profile','Qualification','--collection','Qualification'],
      {env:{...process.env,XDG_CONFIG_HOME:home,QT_QPA_PLATFORM:'xcb',LIBGL_ALWAYS_SOFTWARE:'1'},stdio:['ignore','pipe','pipe']});
    let obsOut='';obs.stdout.on('data',d=>obsOut+=d);obs.stderr.on('data',d=>obsOut+=d);
    for(let i=0;i<60&&!client;i++){await wait(1000);if(obs.exitCode!==null)throw new Error(`OBS exited (${obs.exitCode}): ${obsOut.slice(-1500)}`);client=await connect(wsPort).catch(()=>null);}
    if(!client)throw new Error(`obs-websocket never answered: ${obsOut.slice(-1500)}`);
    const version=await client.request('GetVersion');measurements.version=version;
    check('OBS Studio started in an isolated environment with obs-websocket',!!version.obsVersion,`OBS ${version.obsVersion}, obs-websocket ${version.obsWebSocketVersion}, ${version.platformDescription}`);
    const scene=(await client.request('GetCurrentProgramScene')).currentProgramSceneName||(await client.request('GetCurrentProgramScene')).sceneName;
    const source='Code Resonance',overlay=`${url}/?overlay=1&sound=1&project=${projectId}&world=living`;
    await client.request('CreateInput',{sceneName:scene,inputName:source,inputKind:'browser_source',inputSettings:{url:overlay,width:1280,height:720,fps:30,fps_custom:true,reroute_audio:true,shutdown:false,restart_when_active:false},sceneItemEnabled:true});
    check('the player overlay added as a Browser Source (audio controlled by OBS)',true,overlay.replace(projectId,'<project>'));
    await wait(40000);
    // Screenshots of the source: rendering, not black, moving.
    const shots=[];
    for(let i=0;i<4;i++){const s=await client.request('GetSourceScreenshot',{sourceName:source,imageFormat:'png',imageWidth:640},90000);
      const file=path.join(OUT,`obs-source-${i}.png`);fs.writeFileSync(file,Buffer.from(s.imageData.split(',')[1],'base64'));
      const f=media.frames(file)[0];shots.push({file:path.basename(file),luma:f?.luma??null,sum:f?.sum??null});await wait(4000);}
    measurements.screenshots=shots;
    check('the overlay renders in OBS (not black) and moves',shots.every(s=>s.luma!==null&&s.luma>3)&&new Set(shots.map(s=>s.sum)).size>=3,shots.map(s=>`luma ${s.luma}`).join(', ')+`; ${new Set(shots.map(s=>s.sum)).size}/4 distinct`);
    // Audio meters for the source.
    const levels=[];client.on(e=>{if(e.eventType==='InputVolumeMeters')for(const input of e.eventData.inputs)if(input.inputName===source&&input.inputLevelsMul?.length)levels.push(Math.max(...input.inputLevelsMul.map(ch=>ch[1]??0)));});
    await wait(10000);
    const peakDb=levels.length?20*Math.log10(Math.max(...levels)+1e-9):null,active=levels.filter(v=>v>0.001).length;
    measurements.audioMeters={samples:levels.length,peakDb,activeShare:levels.length?+(active/levels.length).toFixed(3):0};
    check('the music reaches OBS\'s mixer through the Browser Source',levels.length>0&&peakDb>-50,`${levels.length} meter samples, peak ${peakDb===null?'none':peakDb.toFixed(1)} dBFS, ${Math.round(measurements.audioMeters.activeShare*100)} % above -60 dB`);
    // A real OBS recording.
    await client.request('StartRecord');await wait(SECONDS*1000);const stopped=await client.request('StopRecord');await wait(3000);
    const file=stopped.outputPath||fs.readdirSync(recordings).map(f=>path.join(recordings,f))[0];
    const a=file&&fs.existsSync(file)?media.analyse(file):null;measurements.recording=a;
    check('an OBS recording of the overlay has video and sound',a&&a.video&&a.audio&&Math.abs(a.videoDuration-SECONDS)<=3,a?`${a.container} · ${a.video?.codec} ${a.video?.width}×${a.video?.height} ${a.fps} fps · ${a.audio?.codec||'NO AUDIO'} · ${a.videoDuration} s`:'no file');
    check('the OBS recording\'s sound is the music (not silent) and its picture moves',a&&a.audioMeanDb>-55&&a.changingFrames>.3,a?`mean ${a.audioMeanDb} dBFS, longest silence ${a.longestSilenceMs} ms, ${Math.round((a.changingFrames||0)*100)} % of frames change`:'no file');
    if(a)media.still(file,SECONDS/2,path.join(OUT,'obs-recording.jpg'),960);
  }catch(e){check('OBS qualification completed',false,String(e.message||e).slice(0,1500));}
  finally{
    clearInterval(stream);client?.close();
    if(obs&&obs.exitCode===null){obs.kill('SIGTERM');await wait(3000);if(obs.exitCode===null)obs.kill('SIGKILL');}
    // OBS's own log: versions, the OpenGL renderer, CEF.
    try{const logs=path.join(cfg,'logs'),last=fs.readdirSync(logs).sort().at(-1),text=fs.readFileSync(path.join(logs,last),'utf8');
      fs.writeFileSync(path.join(OUT,'obs.log'),text);
      measurements.log={renderer:(/Loading up OpenGL on adapter (.*)/.exec(text)||[])[1]||null,opengl:(/OpenGL loaded successfully, version (.*)/.exec(text)||[])[1]||null,
        cef:(/CEF Version ([^\s]+)/.exec(text)||[])[1]||null,browserHardwareAcceleration:(/Browser Hardware Acceleration: (\w+)/.exec(text)||[])[1]||null,
        // What the overlay page logged inside OBS's browser (its console errors).
        overlayErrors:text.split('\n').filter(l=>/\[obs-browser: 'Code Resonance'\] Error/.test(l)).map(l=>l.replace(/^[\d:.]+: /,'').slice(0,240)).slice(0,20)};}catch{}
    await svc.stop();fs.rmSync(root,{recursive:true,force:true});
  }
  fs.writeFileSync(path.join(OUT,'obs-qualification.json'),JSON.stringify({at:new Date().toISOString(),environment:'isolated CI virtual machine (Xvfb, software OpenGL)',checks,measurements},null,2));
  console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);
  process.exitCode=checks.every(c=>c.pass)?0:1;
})();

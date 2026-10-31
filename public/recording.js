'use strict';
// Live recording for every world. The player draws each presented frame (the world and its labels, whoever renders
// them: the built-in worlds' canvases, or the latest bitmap an isolated visual pack's worker composited) into one
// player-owned compositor canvas; that canvas is captured with captureStream() and recorded with the music's own
// output stream (the same audio graph that plays, on the same performance clock), so picture and sound stay together
// and pack isolation is untouched. Deterministic films are a different path (qualification/visual/film.js).
(()=>{
  const TYPES=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  function supported(){
    if(!window.MediaRecorder)return {ok:false,reason:'This browser has no MediaRecorder: recording is not available here (use Chrome, Edge or OBS).'};
    if(!HTMLCanvasElement.prototype.captureStream)return {ok:false,reason:'This browser cannot capture a canvas as video: recording is not available here.'};
    const mimeType=TYPES.find(t=>MediaRecorder.isTypeSupported(t));
    return mimeType?{ok:true,mimeType}:{ok:false,reason:'This browser cannot record WebM video.'};
  }
  function create(){
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const g=canvas.getContext('2d',{alpha:false});
    let recorder=null,chunks=[],streams=[],startedAt=0,frames=0,presented=0,bytes=0,audio=false,mimeType='',finishing=null,lastDraw=0,interval=1000/30,due=0;
    // Recording to a file on disk (disk.open below): each chunk goes to the sink as it arrives, and none is kept here.
    let sink=null;
    // The recorded sound is watched while recording: a browser can stop delivering it (an audio device lost or reset)
    // while the music still plays. Then the user is told, and the result says so: never a silent file passed as good.
    let watch=null,audioLost=false,lostMs=0,onAudioLost=null,inputs=[];
    // The recorded sound is watched while recording: an audio device lost or stalled (a headset disconnected, an audio
    // server hung) stops the music's audio clock, and the browser's recorder then stalls the whole file (its WebM muxer
    // waits for sound to interleave with the picture). Lost: the recorded track ended or muted, the music's context not
    // running or its clock not advancing, or the recorded sound digitally silent for two seconds while the music is
    // audible. The player is told at once (it finishes and saves the recording): never a silent file passed as good.
    // The silence check listens to the music's output through one tap for the page's lifetime (the recording's own
    // track is a clone of the same output): the browser never released a source node created per recording, and each
    // kept about 3 MB in the renderer and the GPU process (qualification/results/memory/memory-rec-bisect-*.json).
    let tap=null;
    function tapFor(track,ctx){
      if(tap&&tap.track===track&&tap.ctx===ctx&&track.readyState==='live')return tap;
      tap=null;
      try{const src=ctx.createMediaStreamSource(new MediaStream([track])),an=ctx.createAnalyser();an.fftSize=2048;src.connect(an);tap={track,ctx,an};}catch{}
      return tap;
    }
    function watchAudio(input,output,ctx,musicLevel){
      const an=output?tapFor(output,ctx)?.an:null;
      const buf=new Float32Array(2048);let silentFor=0,lastClock=ctx.currentTime,stalledFor=0;
      const lose=()=>{lostMs+=500;if(!audioLost){audioLost=true;onAudioLost?.();}};
      const timer=setInterval(()=>{
        if(input.readyState==='ended'||input.muted||ctx.state!=='running'){lose();return;}
        if(ctx.currentTime===lastClock){stalledFor+=500;if(stalledFor>=1500){lose();return;}}else{stalledFor=0;lastClock=ctx.currentTime;}
        if(!an)return;an.getFloatTimeDomainData(buf);let e=0;for(const v of buf)e+=v*v;const rms=Math.sqrt(e/buf.length);
        if(rms<1e-6&&(musicLevel?.()||0)>.003){silentFor+=500;if(silentFor>=2000)lose();}else silentFor=0;
      },500);
      return {stop(){clearInterval(timer);}};
    }
    const even=n=>Math.max(2,Math.round(n/2)*2);
    return {
      canvas,supported,
      get active(){return !!recorder&&recorder.state==='recording';},
      // Settles with the result when the current (or last) recording has stopped, however it stopped (the user, the
      // page, a recorder error): what the single-recorder lock is released on.
      get finished(){return finishing;},
      get audio(){return audio;},get audioLost(){return audioLost;},
      // Size of the recording (even numbers, as video encoders require). Changes apply while idle only.
      resize(w,h){if(recorder)return;canvas.width=even(w);canvas.height=even(h);},
      start({audioStream=null,fps=30,bitsPerSecond=8000000,audioContext=null,musicLevel=null,audioLostListener=null,sink:to=null}={}){
        if(recorder)return {ok:false,reason:'Already recording'};
        const s=supported();if(!s.ok)return s;
        g.fillStyle='#000';g.fillRect(0,0,canvas.width,canvas.height);
        // Captured without a frame rate (a video frame each time the canvas changes); the rate is capped in frame().
        // Chromium's captureStream(fps) kept only every other frame of a canvas drawn from requestAnimationFrame, at any
        // rate: 30 of 60, but also 3 of 6 on a machine rendering 6 frames a second (a software renderer).
        const video=canvas.captureStream();interval=1000/Math.max(1,fps);due=0;
        // The recording owns clones of the music's tracks: stopping it never ends the music output itself (a second
        // recording, or the speakers, keep working).
        const outputs=audioStream?.getAudioTracks().filter(t=>t.readyState==='live')||[];
        inputs=outputs.map(t=>t.clone());audio=inputs.length>0;
        const combined=new MediaStream([...video.getVideoTracks(),...inputs]);
        streams=[video,combined];chunks=[];bytes=0;frames=0;presented=0;mimeType=s.mimeType;audioLost=false;lostMs=0;onAudioLost=audioLostListener;sink=to;
        watch=audio&&audioContext?watchAudio(inputs[0],outputs[0],audioContext,musicLevel):null;
        recorder=new MediaRecorder(combined,{mimeType,videoBitsPerSecond:bitsPerSecond,audioBitsPerSecond:160000});
        recorder.ondataavailable=e=>{if(!e.data?.size)return;bytes+=e.data.size;if(sink)sink.write(e.data);else chunks.push(e.data);};
        finishing=new Promise(resolve=>{recorder.onstop=()=>{
          const blob=sink?null:new Blob(chunks,{type:mimeType}),durationMs=performance.now()-startedAt;
          for(const st of streams)for(const t of st.getTracks())t.stop();
          watch?.stop();watch=null;inputs=[];
          const result={blob,sink,mimeType,durationMs,frames,presented,bytes:blob?blob.size:bytes,audio,audioLost,audioLostMs:lostMs,reason:recorder.stopReason||'stopped'};
          recorder=null;chunks=[];streams=[];sink=null;resolve(result);};});
        recorder.onerror=()=>{if(recorder?.state==='recording'){recorder.stopReason='recorder error';recorder.stop();}};
        recorder.start(1000);startedAt=performance.now();
        return {ok:true,mimeType,audio,width:canvas.width,height:canvas.height};
      },
      // One presented frame: draw(g, w, h) paints it. Called once per player frame while recording (counted in
      // `presented`, the player's own rate); recorded frames (`frames`) come at most
      // `fps` a second (every presented frame when the player is slower), half a 60 Hz frame of slack keeping a 60 Hz
      // player at exactly every other frame.
      frame(draw){if(!recorder||recorder.state!=='recording')return;presented++;const now=performance.now();if(now<due-8)return;due=now-due>interval?now+interval:due+interval;
        try{draw(g,canvas.width,canvas.height);frames++;lastDraw=now;}catch(e){console.error('recording frame',e);}},
      stop(reason='stopped'){if(!recorder)return Promise.resolve(null);if(recorder.state==='recording'){recorder.stopReason=reason;recorder.requestData?.();recorder.stop();}return finishing;},
      // Qualification: end the recorded audio track, as a lost audio device would.
      breakAudio(){for(const t of inputs)t.stop();},
      // `bytes`: what the recorder delivered; `written`: what is on disk (a recording to a file on disk), `held`: what
      // this page keeps in memory (a recording kept in memory until it stops).
      stats(){return {active:!!recorder,elapsedMs:recorder?performance.now()-startedAt:0,frames,presented,bytes,chunks:chunks.length,audio,audioLost,mimeType,width:canvas.width,height:canvas.height,lastFrameAgoMs:recorder?performance.now()-lastDraw:null,
        target:sink?'disk':'memory',written:sink?sink.written:null,held:sink?0:bytes};}
    };
  }
  // One recording at a time in this browser profile: an exclusive Web Lock, taken only if it is free. The browser's
  // lock manager grants it to exactly one window however close together windows ask (the windows' BroadcastChannel
  // announcements alone let two windows that press Record in the same instant both start), and releases it when the
  // holding page closes, navigates away or crashes: a lock is never left stale. Without Web Locks (an insecure context,
  // e.g. a LAN address) the announcements are all there is, and `policy` says so.
  const LOCK='code-resonance.recorder';
  const ELSEWHERE='Another window of this browser is already recording (one recording at a time): stop it there, then record here.';
  const lockManager=()=>typeof navigator!=='undefined'?navigator.locks:undefined;
  function claim(locks=lockManager()){
    const unlocked={ok:true,policy:'announcements',release:()=>Promise.resolve()};
    if(!locks?.request)return Promise.resolve(unlocked);
    return new Promise(resolve=>{
      let done=false;const settle=v=>{if(!done){done=true;resolve(v);}};
      let release;const held=new Promise(r=>{release=r;});
      // Settles once the lock manager has let the lock go (another window may then take it).
      const gone=locks.request(LOCK,{mode:'exclusive',ifAvailable:true},lock=>{
        if(!lock){settle({ok:false,policy:'web-locks',reason:ELSEWHERE});return undefined;}
        // Held until release(): the lock manager keeps it while this promise is pending. release() resolves when the
        // lock is really free, so the window can announce the end of its recording only then.
        settle({ok:true,policy:'web-locks',release:()=>{release();return gone;}});return held;
      }).then(()=>{},e=>settle({...unlocked,error:String(e?.message||e)}));
    });
  }
  // Whether some window of this browser holds the recorder lock (null: no Web Locks here).
  async function held(locks=lockManager()){
    if(!locks?.query)return null;
    try{const s=await locks.query();return (s.held||[]).some(l=>l.name===LOCK);}catch{return null;}
  }
  // ---- Record to a file on disk -----------------------------------------------------------------------------------
  // The user chooses the file when Record is pressed (the browser's Save dialog). While recording, a worker writes each
  // chunk in place to a working file in this browser's private storage for the page (recording-worker.js says why
  // there: it is the one place a page can write so that a crash keeps what was written); memory stays flat and the
  // length is bounded by disk. When the recording stops, the working file is copied into the chosen file, made seekable
  // on the way (webm.js), then deleted. If the page crashes or closes first, the working file stays: any window of this
  // browser lists it as an interrupted recording, to save or discard. Each working file is held by its own Web Lock
  // while a window records or saves it, so another window never offers it, and a crash releases it at once.
  const disk=(()=>{
    const DIR='code-resonance-recordings',FILE_LOCK='code-resonance.recording-file:',PIECE=4<<20;
    const here=typeof document!=='undefined'&&document.currentScript?.src||'';
    const workerUrl=()=>here?new URL('recording-worker.js',here).href:'recording-worker.js';
    const NO_API='This browser cannot write a recording to a file as it records (it has no File System Access API): Chrome or Edge on a computer can. Here a recording is kept in memory until you stop.';
    const INSECURE='The browser lets a page write files only on this computer’s own address (localhost or 127.0.0.1), not on a network address. Here a recording is kept in memory until you stop.';
    const message=e=>String(e?.message||e);
    // What the page itself offers (synchronous; probe() also asks a worker).
    function offered(){
      if(typeof window==='undefined'||typeof navigator==='undefined')return {ok:false,reason:NO_API};
      if(window.isSecureContext===false)return {ok:false,reason:INSECURE};
      if(typeof window.showSaveFilePicker!=='function'||typeof Worker!=='function'||!navigator.storage?.getDirectory||typeof FileSystemFileHandle==='undefined'||typeof FileSystemFileHandle.prototype.createWritable!=='function')return {ok:false,reason:NO_API};
      return {ok:true};
    }
    // Whether a worker here can write a file in place (the private file system and synchronous access handles).
    let probing=null;
    function probe(){
      const o=offered();if(!o.ok)return Promise.resolve(o);
      probing||=new Promise(resolve=>{
        let w;try{w=new Worker(workerUrl());}catch(e){resolve({ok:false,reason:`The recording worker could not start (${message(e)}). Here a recording is kept in memory until you stop.`});return;}
        const end=v=>{clearTimeout(t);w.terminate();if(!v.ok)probing=null;resolve(v);};
        const t=setTimeout(()=>end({ok:false,reason:'The recording worker did not answer. Here a recording is kept in memory until you stop.'}),15000);
        w.onmessage=e=>end(e.data?.ok?{ok:true}:{ok:false,reason:`This browser cannot write a recording in place here (${e.data?.error}). Here a recording is kept in memory until you stop.`});
        w.onerror=e=>{e.preventDefault?.();end({ok:false,reason:`The recording worker failed (${e.message||'not loaded'}). Here a recording is kept in memory until you stop.`});};
        w.postMessage({op:'probe'});});
      return probing;
    }
    // The disk space this browser lets the page use (its storage quota for this address, less what it uses).
    async function space(){try{const e=await navigator.storage.estimate();return e?.quota?{quota:e.quota,usage:e.usage||0,free:Math.max(0,e.quota-(e.usage||0))}:null;}catch{return null;}}
    // A working file's own lock, taken only if free: released by release(), by the page closing or crashing.
    function hold(name){
      if(!navigator.locks?.request)return Promise.resolve(()=>{});
      return new Promise(resolve=>{navigator.locks.request(FILE_LOCK+name,{mode:'exclusive',ifAvailable:true},lock=>{
        if(!lock){resolve(null);return undefined;}return new Promise(r=>resolve(()=>r()));}).catch(()=>resolve(null));});
    }
    async function folder(create=false){return (await navigator.storage.getDirectory()).getDirectoryHandle(DIR,{create});}
    async function remove(name){try{await (await folder()).removeEntry(name);}catch(e){if(e?.name!=='NotFoundError')throw e;}}
    // The browser's Save dialog (it needs the press of a button).
    async function choose(suggestedName){
      try{return {ok:true,handle:await window.showSaveFilePicker({suggestedName,id:'code-resonance-recording',startIn:'videos',types:[{description:'WebM video',accept:{'video/webm':['.webm']}}]})};}
      catch(e){
        if(e?.name==='AbortError')return {ok:false,cancelled:true,reason:'No file was chosen, so nothing was recorded.'};
        return {ok:false,reason:`The browser did not open its Save dialog (${message(e)}): press Record again${e?.name==='SecurityError'||e?.name==='NotAllowedError'?' (the dialog opens only when a button is pressed)':''}.`};
      }
    }
    // The working file copied into the chosen file: made seekable (webm.js) when it can be indexed, as written otherwise.
    async function copyTo(dest,file,index,progress){
      const W=window.ResonanceWebm,p=index&&W?W.plan(index):null;
      const w=await dest.createWritable();
      try{
        const read=async(at,n)=>new Uint8Array(await file.slice(at,at+n).arrayBuffer());
        let done=0;
        if(p)done=await W.copy(p,read,b=>w.write(b),{piece:PIECE,progress});
        else for(let at=0;at<file.size;at+=PIECE){const b=await read(at,Math.min(PIECE,file.size-at));await w.write(b);done+=b.length;progress?.(done,file.size);}
        await w.close();
        return {bytes:done,seekable:!!p,durationMs:p?p.durationMs:null,width:index?.width||null,height:index?.height||null,cut:p?p.cut:0};
      }catch(e){try{await w.abort();}catch{}throw e;}
    }
    // A new working file, written by a worker as the recording goes; the sink the recorder writes to.
    async function open(name){
      const release=await hold(name);
      if(!release)throw new Error('this working file is in use in another window');
      let worker;
      try{worker=new Worker(workerUrl());}catch(e){release();throw e;}
      let written=0,failure=null,onfail=null,closing=null,saving=null,opened,closed;
      const fail=why=>{if(failure)return;failure=why;onfail?.(why);};
      const ready=new Promise((res,rej)=>{opened={res,rej};});
      worker.onmessage=e=>{const m=e.data||{};
        if(m.op==='open'){if(m.ok)opened.res();else opened.rej(new Error(m.error));}
        else if(m.op==='written')written=m.bytes;
        else if(m.op==='failed'){written=m.bytes;fail(m.error);}
        else if(m.op==='closed'){written=m.bytes;closed?.(m);}};
      worker.onerror=e=>{e.preventDefault?.();const why=`the recording worker failed (${e.message||'unknown error'})`;opened.rej(new Error(why));fail(why);closed?.({bytes:written,index:null,error:why});};
      worker.postMessage({op:'open',name});
      try{await Promise.race([ready,new Promise((_,rej)=>setTimeout(()=>rej(new Error('the recording worker did not answer')),15000))]);}
      catch(e){worker.terminate();await remove(name).catch(()=>{});release();throw e;}
      const sink={name,
        get written(){return written;},get failure(){return failure;},set onfail(f){onfail=f;},
        write(blob){if(!failure&&!closing)worker.postMessage({op:'write',blob});},
        // Everything written, the file closed: {bytes, index}.
        close(){return closing||=new Promise(res=>{closed=m=>{closed=null;worker.terminate();res({bytes:m.bytes,index:m.index||null,error:m.error||null});};worker.postMessage({op:'close'});});},
        // Into the chosen file, then the working file deleted (once, however many callers ask).
        save(dest,progress){return saving||=(async()=>{
          const c=await sink.close();
          const file=await (await (await folder()).getFileHandle(name)).getFile();
          if(!file.size)throw new Error('nothing was written');
          const r=await copyTo(dest,file,c.index,progress);
          await remove(name);release();return r;})();},
        // Left in the browser (saving failed): offered as an interrupted recording.
        async keep(){await sink.close();release();},
        // Nothing to keep (the recording did not start).
        async discard(){await sink.close();await remove(name).catch(()=>{});release();}};
      return sink;
    }
    // Working files no window is writing or saving: recordings interrupted by a crash or a closed tab (or whose save
    // failed). Empty ones hold nothing and are removed.
    async function list(){
      if(typeof navigator==='undefined'||!navigator.storage?.getDirectory)return [];
      let d;try{d=await folder();}catch{return [];}
      let held=new Set();try{held=new Set(((await navigator.locks?.query?.())?.held||[]).map(l=>l.name));}catch{}
      const out=[];
      for await(const [name,h] of d.entries()){
        if(h.kind!=='file'||!/\.webm$/.test(name)||held.has(FILE_LOCK+name))continue;
        try{const f=await h.getFile();
          if(!f.size){const release=await hold(name);if(release){await remove(name).catch(()=>{});release();}continue;}
          out.push({name,bytes:f.size,lastModified:f.lastModified,startedAt:+(/-(\d{13})\.webm$/.exec(name)||[])[1]||null});}catch{}
      }
      return out.sort((a,b)=>(a.startedAt||a.lastModified)-(b.startedAt||b.lastModified));
    }
    // An interrupted recording saved into a chosen file: indexed up to its last complete block, made seekable, deleted.
    async function save(name,dest,progress){
      const release=await hold(name);if(!release)throw new Error('this recording is being written or saved in another window');
      try{
        const file=await (await (await folder()).getFileHandle(name)).getFile(),W=window.ResonanceWebm;
        let index=null;
        if(W){const s=W.scanner();for(let at=0;at<file.size;at+=PIECE)s.feed(new Uint8Array(await file.slice(at,at+PIECE).arrayBuffer()));index=s.index();}
        const r=await copyTo(dest,file,index,progress);
        await remove(name);return r;
      }finally{release();}
    }
    async function discard(name){
      const release=await hold(name);if(!release)throw new Error('this recording is being written or saved in another window');
      try{await remove(name);}finally{release();}
    }
    return {offered,probe,space,choose,open,list,save,discard,DIR,FILE_LOCK};
  })();
  window.ResonanceRecording={create,supported,claim,held,LOCK,disk};
})();

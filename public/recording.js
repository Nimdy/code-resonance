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
      start({audioStream=null,fps=30,bitsPerSecond=8000000,audioContext=null,musicLevel=null,audioLostListener=null}={}){
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
        streams=[video,combined];chunks=[];bytes=0;frames=0;presented=0;mimeType=s.mimeType;audioLost=false;lostMs=0;onAudioLost=audioLostListener;
        watch=audio&&audioContext?watchAudio(inputs[0],outputs[0],audioContext,musicLevel):null;
        recorder=new MediaRecorder(combined,{mimeType,videoBitsPerSecond:bitsPerSecond,audioBitsPerSecond:160000});
        recorder.ondataavailable=e=>{if(e.data?.size){chunks.push(e.data);bytes+=e.data.size;}};
        finishing=new Promise(resolve=>{recorder.onstop=()=>{
          const blob=new Blob(chunks,{type:mimeType}),durationMs=performance.now()-startedAt;
          for(const st of streams)for(const t of st.getTracks())t.stop();
          watch?.stop();watch=null;inputs=[];
          const result={blob,mimeType,durationMs,frames,presented,bytes:blob.size,audio,audioLost,audioLostMs:lostMs,reason:recorder.stopReason||'stopped'};
          recorder=null;chunks=[];streams=[];resolve(result);};});
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
      stats(){return {active:!!recorder,elapsedMs:recorder?performance.now()-startedAt:0,frames,presented,bytes,chunks:chunks.length,audio,audioLost,mimeType,width:canvas.width,height:canvas.height,lastFrameAgoMs:recorder?performance.now()-lastDraw:null};}
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
  window.ResonanceRecording={create,supported,claim,held,LOCK};
})();

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
    let recorder=null,chunks=[],streams=[],startedAt=0,frames=0,bytes=0,audio=false,mimeType='',finishing=null,lastDraw=0;
    const even=n=>Math.max(2,Math.round(n/2)*2);
    return {
      canvas,supported,
      get active(){return !!recorder&&recorder.state==='recording';},
      get audio(){return audio;},
      // Size of the recording (even numbers, as video encoders require). Changes apply while idle only.
      resize(w,h){if(recorder)return;canvas.width=even(w);canvas.height=even(h);},
      start({audioStream=null,fps=30,bitsPerSecond=8000000}={}){
        if(recorder)return {ok:false,reason:'Already recording'};
        const s=supported();if(!s.ok)return s;
        g.fillStyle='#000';g.fillRect(0,0,canvas.width,canvas.height);
        const video=canvas.captureStream(fps);
        // The recording owns clones of the music's tracks: stopping it never ends the music output itself (a second
        // recording, or the speakers, keep working).
        const tracks=(audioStream?.getAudioTracks().filter(t=>t.readyState==='live')||[]).map(t=>t.clone());audio=tracks.length>0;
        const combined=new MediaStream([...video.getVideoTracks(),...tracks]);
        streams=[video,combined];chunks=[];bytes=0;frames=0;mimeType=s.mimeType;
        recorder=new MediaRecorder(combined,{mimeType,videoBitsPerSecond:bitsPerSecond,audioBitsPerSecond:160000});
        recorder.ondataavailable=e=>{if(e.data?.size){chunks.push(e.data);bytes+=e.data.size;}};
        finishing=new Promise(resolve=>{recorder.onstop=()=>{
          const blob=new Blob(chunks,{type:mimeType}),durationMs=performance.now()-startedAt;
          for(const st of streams)for(const t of st.getTracks())t.stop();
          const result={blob,mimeType,durationMs,frames,bytes:blob.size,audio,reason:recorder.stopReason||'stopped'};
          recorder=null;chunks=[];streams=[];resolve(result);};});
        recorder.onerror=()=>{if(recorder?.state==='recording'){recorder.stopReason='recorder error';recorder.stop();}};
        recorder.start(1000);startedAt=performance.now();
        return {ok:true,mimeType,audio,width:canvas.width,height:canvas.height};
      },
      // One presented frame: draw(g, w, h) paints it. Called once per player frame while recording.
      frame(draw){if(!recorder||recorder.state!=='recording')return;try{draw(g,canvas.width,canvas.height);frames++;lastDraw=performance.now();}catch(e){console.error('recording frame',e);}},
      stop(reason='stopped'){if(!recorder)return Promise.resolve(null);if(recorder.state==='recording'){recorder.stopReason=reason;recorder.requestData?.();recorder.stop();}return finishing;},
      stats(){return {active:!!recorder,elapsedMs:recorder?performance.now()-startedAt:0,frames,bytes,chunks:chunks.length,audio,mimeType,width:canvas.width,height:canvas.height,lastFrameAgoMs:recorder?performance.now()-lastDraw:null};}
    };
  }
  window.ResonanceRecording={create,supported};
})();

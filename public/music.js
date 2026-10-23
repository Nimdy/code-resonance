/* Code Resonance — self-contained Web Audio sequencer, bar-quantized adaptive synthesis. */
'use strict';
(function(){
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));
  const midiHz=n=>440*Math.pow(2,(n-69)/12);
  class ResonanceMusic {
    constructor(onBar=()=>{}){
      this.ctx=null;this.output=null;this.recordNode=null;this.onBar=onBar;
      this.timer=null;this.nextTime=0;this.step=0;this.barIndex=0;this.bar=null;
      this.projectId='';this.identity={motif:[0,2,4,1],scale:'D'};
      this.requestedFrame=null;this.frame=null;
      this.options={style:'ambient',volume:.55,tempo:92,texture:.58};
      this.appliedOptions={...this.options};this.noise=null;this.enabled=false;
    }
    setProject(projectId,identity){
      if(!projectId||this.projectId===projectId)return;
      this.projectId=projectId;
      if(identity)this.identity={motif:[...identity.motif],scale:identity.scale};
      this.barIndex=0;this.step=0;this.bar=null;
    }
    setFrame(frame){if(frame)this.requestedFrame=frame;}
    setOptions(next){this.options={...this.options,...next};
      this.options.volume=clamp(this.options.volume);
      this.options.tempo=clamp(Number(this.options.tempo),58,160);
      this.options.texture=clamp(this.options.texture);
      if(this.output&&this.ctx)this.output.gain.setTargetAtTime(.26*this.options.volume,this.ctx.currentTime,.08);
    }
    async start(){
      if(this.enabled){await this.ctx.resume();return;}
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)throw Error('Web Audio is not available in this browser');
      this.ctx=new AC({latencyHint:'interactive'});
      this.output=this.ctx.createGain();this.output.gain.value=.26*this.options.volume;
      this.output.connect(this.ctx.destination);
      this.recordNode=this.ctx.createMediaStreamDestination();this.output.connect(this.recordNode);
      this.noise=this.createNoiseBuffer();
      this.nextTime=this.ctx.currentTime+.07;this.step=0;this.bar=null;this.enabled=true;
      await this.ctx.resume();this.timer=setInterval(()=>this.schedule(),45);
    }
    async stop(){
      if(!this.enabled)return;
      this.enabled=false;clearInterval(this.timer);this.timer=null;
      const active=this.ctx,master=this.output;this.ctx=null;this.output=null;this.recordNode=null;
      if(active&&master){try{master.gain.setTargetAtTime(0,active.currentTime,.06);await new Promise(r=>setTimeout(r,170));await active.close();}catch{}}
    }
    get stream(){return this.recordNode?.stream||null;}
    createNoiseBuffer(){const c=this.ctx,b=c.createBuffer(1,c.sampleRate*.25,c.sampleRate),a=b.getChannelData(0);
      let seed=23984;for(let i=0;i<a.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;a[i]=((seed/4294967296)*2-1)*(.7-.45*i/a.length);}return b;}
    oscillatorVoice({instrument,midi,velocity,duration},at){
      if(!this.ctx||!this.output)return;
      if(['hat','snare'].includes(instrument))return this.noiseVoice(instrument,velocity,at);
      const ctx=this.ctx;
      const o=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
      const style=this.appliedOptions.style;
      const waveform={ambient:{pad:'sine',lead:'sine',arp:'triangle',bass:'sine'},pulse:{pad:'triangle',lead:'sawtooth',arp:'triangle',bass:'sawtooth'},cinematic:{pad:'triangle',lead:'sine',arp:'triangle',bass:'sine'},chip:{pad:'square',lead:'square',arp:'square',bass:'triangle'}};
      o.type=waveform[style]?.[instrument]||'sine';o.frequency.setValueAtTime(instrument==='kick'?75:midiHz(midi),at);
      if(instrument==='kick')o.frequency.exponentialRampToValueAtTime(39,at+.11);
      filter.type='lowpass';filter.frequency.value=instrument==='bass'?290:instrument==='pad'?580:style==='chip'?2800:1700+this.appliedOptions.texture*3200;
      const amp=clamp(velocity,.01,1)*({pad:.25,lead:.54,arp:.32,bass:.58,kick:.49,accent:.4}[instrument]||.4);
      const attack=instrument==='pad'?.22:instrument==='lead'&&style==='cinematic'?.06:.012;
      const sustain=Math.max(.04,duration-(attack+.06));
      gain.gain.setValueAtTime(.00001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,amp),at+attack);
      gain.gain.setTargetAtTime(.00001,at+attack+sustain,Math.max(.02,style==='ambient'?.20:.065));
      o.connect(filter);filter.connect(gain);gain.connect(this.output);
      const stop=at+Math.max(.2,duration)+(instrument==='pad'?.9:.25);
      o.start(at);o.stop(stop);
      o.onended=()=>{o.disconnect();filter.disconnect();gain.disconnect();};
    }
    noiseVoice(type,velocity,at){
      const ctx=this.ctx,src=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
      src.buffer=this.noise;filter.type=type==='hat'?'highpass':'bandpass';filter.frequency.value=type==='hat'?7400:1200;
      const amount=velocity*(type==='hat'?.22:.46);
      gain.gain.setValueAtTime(Math.max(.0001,amount),at);gain.gain.exponentialRampToValueAtTime(.0001,at+(type==='hat'?.048:.13));
      src.connect(filter);filter.connect(gain);gain.connect(this.output);src.start(at);src.stop(at+.16);
      src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};
    }
    beginBar(){
      this.frame=this.requestedFrame||this.frame;
      this.appliedOptions={...this.options};
      const f=this.frame||{};
      this.bar=window.ResonanceScore.createBar({seed:f.projectSeed||window.ResonanceScore.hash(this.projectId),
        motif:f.motif||this.identity.motif,root:f.scaleRoot||this.identity.scale,
        chapter:f.chapter||1,tension:f.controls?.tension||0,energy:f.controls?.energy||0,
        style:this.appliedOptions.style,barIndex:this.barIndex++});
      this.onBar({index:this.barIndex,style:this.appliedOptions.style,chapter:this.bar.chapter});
    }
    schedule(){
      if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
      let limit=0;
      while(this.nextTime<this.ctx.currentTime+.22&&limit++<20){
        if(!this.bar||this.step===0)this.beginBar();
        const events=this.bar.steps[this.step]||[];
        for(const event of events){
          if(event.instrument==='arp'&&this.appliedOptions.texture<.26)continue;
          if(['kick','snare','hat'].includes(event.instrument)&&this.appliedOptions.texture<.15)continue;
          this.oscillatorVoice(event,this.nextTime);
        }
        this.step=(this.step+1)%16;
        const pace=clamp(this.appliedOptions.tempo+(this.frame?.controls?.energy||0)*8,58,174);
        this.nextTime+=60/(pace*4);
      }
    }
    accent(type){
      if(!this.ctx||!this.enabled)return;
      const testPass=type==='validation.test.passed',testFail=type==='validation.test.failed';
      if(!testPass&&!testFail&&!type.startsWith('agent.'))return;
      const at=this.ctx.currentTime+.04,root=this.frame?.scaleRoot||this.identity.scale;
      const midi=window.ResonanceScore.pitch(testPass?4:testFail?1:2,testPass?1:0,root);
      this.oscillatorVoice({instrument:'accent',midi,velocity:testPass?.62:testFail?.4:.15,duration:testPass?.9:.38},at);
    }
  }
  window.ResonanceMusic=ResonanceMusic;
})();

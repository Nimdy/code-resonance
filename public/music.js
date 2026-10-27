/* Code Resonance — self-contained Web Audio performer.
 * Bars come from the deterministic score (score.js) and are anchored to the shared performance clock, so live
 * playback and replay land on the same bar grid. Engineering cues are queued and quantized to that grid.
 * The same voice code renders offline (OfflineAudioContext) for analysis and export.
 */
'use strict';
(function(){
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));
  const midiHz=n=>440*Math.pow(2,(n-69)/12);
  const STEPS=16;
  const MAX_VOICES=72;
  // Role x palette patches. Sends are reverb/delay amounts; times in seconds.
  const PATCH={
    // Pads: unison voices spread across the stereo field, and a slow filter LFO so held chords keep evolving.
    pad:{ambient:{wave:'sawtooth',voices:2,detune:7,cutoff:1350,q:.6,attack:1.4,release:2.4,gain:.32,reverb:.55,delay:0,spread:.8,lfo:.07},
      pulse:{wave:'sawtooth',voices:2,detune:11,cutoff:1600,q:.8,attack:.35,release:1.2,gain:.26,reverb:.35,delay:.05,spread:.6,lfo:.11},
      cinematic:{wave:'sawtooth',voices:3,detune:6,cutoff:1800,q:.5,attack:.9,release:2.2,gain:.24,reverb:.6,delay:0,vibrato:4.6,spread:.75,lfo:.05},
      chip:{wave:'square',voices:1,detune:0,cutoff:2600,q:.3,attack:.01,release:.25,gain:.13,reverb:.15,delay:0}},
    // Bass: the octave below was mostly below what speakers reproduce; an octave above lets small speakers imply it.
    bass:{ambient:{wave:'sine',sub:.1,harm:.34,cutoff:560,attack:.03,release:.6,gain:.42,reverb:.12},pulse:{wave:'sawtooth',cutoff:520,env:900,attack:.005,release:.18,gain:.42,reverb:.05},
      cinematic:{wave:'triangle',sub:.14,harm:.18,cutoff:560,attack:.08,release:.9,gain:.46,reverb:.2},chip:{wave:'triangle',cutoff:2000,attack:.003,release:.08,gain:.42,reverb:.02}},
    arp:{ambient:{wave:'triangle',cutoff:2400,env:1800,attack:.004,decay:.35,gain:.34,reverb:.4,delay:.25},pulse:{wave:'sawtooth',cutoff:1800,env:2600,attack:.003,decay:.18,gain:.24,reverb:.25,delay:.3},
      cinematic:{wave:'triangle',cutoff:2600,env:1200,attack:.004,decay:.45,gain:.3,reverb:.45,delay:.2},chip:{wave:'square',cutoff:4000,attack:.002,decay:.12,gain:.16,reverb:.1,delay:.15}},
    lead:{ambient:{wave:'sine',blend:'triangle',cutoff:3200,attack:.06,release:.7,gain:.36,reverb:.45,delay:.25,vibrato:5.2},pulse:{wave:'sawtooth',cutoff:2400,q:2,attack:.01,release:.25,gain:.22,reverb:.25,delay:.3,glide:.03},
      cinematic:{wave:'triangle',blend:'sine',cutoff:2800,attack:.12,release:.9,gain:.34,reverb:.55,delay:.15,vibrato:4.8},chip:{wave:'square',cutoff:5000,attack:.004,release:.1,gain:.15,reverb:.1,delay:.2,vibrato:6}},
    counter:{ambient:{wave:'triangle',cutoff:1800,attack:.08,release:.6,gain:.22,reverb:.5,delay:.2},pulse:{wave:'triangle',cutoff:2200,attack:.01,release:.2,gain:.2,reverb:.3,delay:.25},
      cinematic:{wave:'sawtooth',voices:2,detune:5,cutoff:1400,attack:.3,release:1.1,gain:.16,reverb:.55,delay:0},chip:{wave:'square',cutoff:3000,attack:.003,release:.08,gain:.11,reverb:.1,delay:.1}},
    bell:{all:{fm:3.5,index:2.2,decay:2.4,gain:.3,reverb:.6,delay:.3}},
    chime:{all:{fm:2,index:1.6,decay:1.8,gain:.32,reverb:.55,delay:.35}},
    pluck:{all:{wave:'triangle',cutoff:3000,env:2000,attack:.003,decay:.3,gain:.3,reverb:.35,delay:.25}},
    agent:{all:{fm:1,index:1.2,decay:.9,gain:.26,reverb:.4,delay:.3}},
    swell:{all:{wave:'sawtooth',voices:2,detune:9,cutoff:600,attack:.9,release:1.2,gain:.18,reverb:.6,delay:0}}
  };
  const AGENT_RATIOS=[1.5,2,2.5,3,3.5,4,5,7];
  const REVERB={ambient:3.2,pulse:1.6,cinematic:3.6,chip:.9};
  // Output trims so switching palette does not change perceived loudness (from offline renders: pulse/chip ~5 dB quieter).
  const TRIM={ambient:1,pulse:1.6,cinematic:1.1,chip:1.4};
  /* Score v3's voices. v2's patches above stay exactly as they were (identities on v2 keep their sound). The v3 set is
   * voiced for the v3 score, which places pads around middle C and the bass an octave higher than v2, so the low end
   * no longer needs a shelf to tame it: warmer and darker filters, slower filter envelopes on held notes, a per-voice
   * high-pass that keeps pads and the room out of the bass, gentle saturation instead of extra low partials, delayed
   * vibrato, breath on wind-like attacks, band-limited pulse waves for chip, and every role its own character.
   * Fields: wave|voices|detune|spread|blend{wave,gain,octave}|sub|harm, cutoff|q|env|envDecay|hp, attack|decay|release|
   * sustain, vibrato{rate,depth,delay}, lfo, drive, breath, fm{ratio,index}|noise{q}, gain, reverb, delay. */
  const PATCH3={
    pad:{ambient:{wave:'sawtooth',voices:2,detune:7,spread:.85,blend:{wave:'triangle',gain:.7},cutoff:900,q:.5,env:520,envDecay:3,hp:150,attack:1.8,release:3,lfo:.06,gain:.24,reverb:.6,delay:.04},
      pulse:{wave:'sawtooth',voices:2,detune:9,spread:.6,cutoff:1150,q:.6,env:900,envDecay:.7,hp:170,attack:.22,release:1,gain:.17,reverb:.36,delay:.12},
      cinematic:{wave:'sawtooth',voices:3,detune:5,spread:.85,cutoff:1750,q:.4,env:700,envDecay:2.4,hp:130,attack:1.1,release:2.6,vibrato:{rate:4.6,depth:.0025,delay:.8},gain:.19,reverb:.66,delay:0},
      chip:{wave:'duty50',cutoff:3200,q:.3,hp:180,attack:.006,release:.25,sustain:.45,decay:.4,gain:.075,reverb:.14,delay:.06}},
    air:{all:{wave:'sine',blend:{wave:'triangle',gain:.35},cutoff:5200,hp:600,attack:2.6,release:3.4,vibrato:{rate:.31,depth:.0018,delay:0},gain:.26,reverb:.85,delay:.22},
      chip:{wave:'duty25',cutoff:5000,hp:800,attack:.9,release:1.2,gain:.06,reverb:.4,delay:.25}},
    bass:{ambient:{wave:'sine',harm:.2,drive:1.6,cutoff:720,hp:34,attack:.04,release:.9,gain:.36,reverb:.08},
      pulse:{wave:'sawtooth',cutoff:520,q:1.1,env:950,envDecay:.18,drive:2,hp:38,attack:.005,release:.16,gain:.3,reverb:.04},
      cinematic:{wave:'triangle',sub:.07,harm:.16,drive:1.3,cutoff:620,hp:36,attack:.06,release:1.1,gain:.38,reverb:.16},
      chip:{wave:'triangle',cutoff:2800,hp:40,attack:.002,release:.06,gain:.36,reverb:.02}},
    lead:{ambient:{wave:'sine',blend:{wave:'triangle',gain:.4},breath:.05,cutoff:3600,hp:220,attack:.07,release:.95,vibrato:{rate:5,depth:.003,delay:.35},gain:.26,reverb:.52,delay:.22},
      pulse:{wave:'sawtooth',blend:{wave:'square',gain:.25},cutoff:1900,q:1.4,env:1700,envDecay:.24,hp:240,attack:.005,release:.26,gain:.17,reverb:.26,delay:.3},
      cinematic:{wave:'sawtooth',voices:2,detune:4,spread:.3,cutoff:2300,q:.5,env:1100,envDecay:1.2,hp:200,attack:.16,release:1.05,vibrato:{rate:5.2,depth:.0035,delay:.4},gain:.2,reverb:.56,delay:.12},
      chip:{wave:'duty25',cutoff:6000,hp:250,attack:.003,release:.08,vibrato:{rate:6,depth:.005,delay:.16},gain:.12,reverb:.1,delay:.18}},
    bell:{all:{fm:{ratio:3.5,index:1.3},decay:3,hp:300,gain:.21,reverb:.66,delay:.3},chip:{wave:'duty12',cutoff:5000,hp:300,attack:.002,decay:.35,gain:.07,reverb:.2,delay:.2}},
    counter:{ambient:{wave:'triangle',blend:{wave:'square',gain:.12},cutoff:1300,hp:160,attack:.12,release:.75,gain:.17,reverb:.5,delay:.15},
      pulse:{wave:'triangle',cutoff:1700,hp:170,attack:.01,decay:.32,gain:.16,reverb:.3,delay:.25},
      cinematic:{wave:'sawtooth',voices:2,detune:5,spread:.3,cutoff:1050,q:.4,hp:110,attack:.32,release:1.15,vibrato:{rate:4.5,depth:.003,delay:.6},gain:.15,reverb:.56,delay:0},
      chip:{wave:'duty12',cutoff:3600,hp:200,attack:.003,release:.08,gain:.07,reverb:.1,delay:.1}},
    arp:{ambient:{wave:'triangle',blend:{wave:'sine',gain:.6,octave:1},cutoff:3000,env:1400,hp:260,attack:.004,decay:.95,gain:.24,reverb:.56,delay:.3},
      pulse:{wave:'sawtooth',cutoff:1400,q:1.8,env:2500,hp:220,attack:.003,decay:.17,gain:.17,reverb:.25,delay:.32},
      cinematic:{wave:'sawtooth',cutoff:2000,q:.7,env:1000,hp:140,attack:.004,decay:.15,gain:.17,reverb:.46,delay:.08},
      chip:{wave:'duty25',cutoff:5200,hp:250,attack:.002,decay:.1,gain:.09,reverb:.1,delay:.1}},
    glass:{all:{fm:{ratio:5,index:.9},decay:2.4,hp:500,gain:.19,reverb:.78,delay:.36}},
    harp:{all:{wave:'triangle',blend:{wave:'sine',gain:.5,octave:1},cutoff:3800,env:1300,hp:300,attack:.003,decay:1.5,gain:.2,reverb:.68,delay:.3}},
    breath:{all:{noise:{q:14},blend:{wave:'sine',gain:.25},hp:400,attack:.45,release:1.4,gain:.32,reverb:.8,delay:.2}}
  };
  const REVERB3={ambient:3.6,pulse:1.7,cinematic:3.9,chip:1.1};
  // Output trims: equal integrated loudness across palettes (offline renders); v3's arrangement breathes, so the
  // trims hold the average where v2 sat without pushing the peaks.
  const TRIM3={ambient:1,pulse:1.75,cinematic:1.15,chip:2.5};
  const PERC3=new Set(['hat','shaker','snare','kick','taiko','texture','riser','wash']);
  class ResonanceMusic {
    constructor(onBar=()=>{}){
      this.ctx=null;this.output=null;this.recordNode=null;this.onBar=onBar;
      this.timer=null;this.nextTime=0;this.step=0;this.barIndex=0;this.bar=null;
      this.projectId='';this.identity={motif:[0,2,4,1],scale:'D'};
      this.requestedFrame=null;this.frame=null;
      this.options={style:'ambient',volume:.55,tempo:92,texture:.58,tempoMode:'project',scoreVersion:2,profile:null};this.frames=[];
      this.appliedOptions={...this.options};this.enabled=false;
      this.clock=null;this.speed=1;this.accents=[];this.voices=0;this.anchored=false;
      this.energy=0;this.section='home';this.sectionIndex=0;this.milestone=false;this.barStartTime=0;
      this.analyser=null;
    }
    setProject(projectId,identity){
      if(!projectId||this.projectId===projectId)return;
      this.projectId=projectId;
      if(identity)this.identity={motif:[...identity.motif],scale:identity.scale};
      this.barIndex=0;this.step=0;this.bar=null;this.accents=[];this.anchored=false;this.section='home';this.energy=0;this.frames=[];
    }
    // Frames arrive at their window's start on the performance clock; score v3's conductor reads the ones in force at
    // each bar (the visuals and the life driver read the same frames from the recorded timeline).
    setFrame(frame,atMs){if(!frame)return;this.requestedFrame=frame;
      const t=Number.isFinite(atMs)?atMs:this.clock?this.clock():null;if(t===null)return;
      const s=window.ResonanceScore,item={t,end:Number.isFinite(frame.end)?frame.end:t,energy:+(frame.controls?.energy||0),tension:+(frame.controls?.tension||0),chapter:frame.chapter||1,milestone:s.milestoneOf?s.milestoneOf(frame):false};
      let p=this.frames.length;while(p>0&&this.frames[p-1].t>t)p--;if(this.frames[p-1]?.t===t)this.frames[p-1]=item;else this.frames.splice(p,0,item);
      if(this.frames.length>96)this.frames.splice(0,this.frames.length-96);}
    frameAt(T){const a=this.frames;let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m].t<=T)lo=m+1;else hi=m;}const f=a[lo-1];
      return !f?null:T-f.end>15000?{energy:0,tension:f.tension,milestone:false,chapter:f.chapter}:f;}
    version(){return this.appliedOptions.scoreVersion===3?3:2;}
    // The performance clock (ms) shared with the visuals: live = wall time minus interpretation delay, replay = playhead.
    setClock(fn,speed=1){this.clock=fn;this.speed=speed>0?speed:1;this.resync();}
    resync(){this.anchored=false;this.accents=[];this.frames=[];}
    setOptions(next){this.options={...this.options,...next};
      this.options.volume=clamp(this.options.volume);
      this.options.tempo=clamp(Number(this.options.tempo),58,160);
      this.options.texture=clamp(this.options.texture);
      this.options.scoreVersion=window.ResonanceScore.versionOf?window.ResonanceScore.versionOf(this.options.scoreVersion):2;
      this.options.profile=this.options.profile&&window.ResonanceScore.profileOf?window.ResonanceScore.profileOf(this.options.profile):null;
      if(this.output&&this.ctx)this.output.gain.setTargetAtTime(.5*this.options.volume,this.ctx.currentTime,.08);
    }
    seed(){return this.frame?.projectSeed||window.ResonanceScore.hash(this.projectId);}
    tempo(){
      const score=window.ResonanceScore,style=this.appliedOptions.style;
      return this.appliedOptions.tempoMode==='project'?score.createIdentity(this.seed()).tempo[style]:this.appliedOptions.tempo;
    }
    stepSeconds(){return 60/(this.tempo()*4);}
    // Builds the bus on any audio context (live or offline): voices -> dry/reverb/delay -> compressor -> limiter.
    buildGraph(ctx,destination){
      if(this.version()===3)return this.buildGraph3(ctx,destination);
      const g={ctx};
      g.output=ctx.createGain();g.output.gain.value=.5*this.options.volume;
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-20;comp.knee.value=12;comp.ratio.value=3;comp.attack.value=.012;comp.release.value=.25;
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.002;limiter.release.value=.1;
      // Dry, reverb and delay meet on one mix bus whose gain is the palette trim, then a gentle tone shaping: sub-sonic
      // rumble removed, the low end eased, a little presence and air so laptop and phone speakers carry the music.
      g.mix=ctx.createGain();g.mix.gain.value=TRIM[this.appliedOptions.style]||1;
      const eq=[['highpass',40,.7,0],['lowshelf',130,.7,-4.5],['peaking',2600,.8,2],['highshelf',7200,.7,2.5]].map(([type,f,q,gain])=>{const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;b.gain.value=gain;return b;});
      // Make-up gain after the tone shaping keeps integrated loudness where it was (the music stays quiet).
      const makeup=ctx.createGain();makeup.gain.value=1.19;
      g.mix.connect(eq[0]);for(let i=1;i<eq.length;i++)eq[i-1].connect(eq[i]);eq.at(-1).connect(makeup);makeup.connect(comp);g.eq=eq;
      g.dry=ctx.createGain();g.dry.connect(g.mix);
      g.reverb=ctx.createConvolver();g.reverb.buffer=this.impulse(ctx,REVERB[this.appliedOptions.style]||2.4);
      g.reverbIn=ctx.createGain();g.reverbIn.gain.value=.55;g.reverbIn.connect(g.reverb);g.reverb.connect(g.mix);
      // Ping-pong delay at a dotted eighth, darkened each repeat.
      const dl=ctx.createDelay(2),dr=ctx.createDelay(2),fb=ctx.createGain(),tone=ctx.createBiquadFilter(),merger=ctx.createChannelMerger(2);
      dl.delayTime.value=dr.delayTime.value=this.stepSeconds()*3;fb.gain.value=.32;tone.type='lowpass';tone.frequency.value=2600;
      g.delayIn=ctx.createGain();g.delayIn.gain.value=.4;g.delayIn.connect(dl);dl.connect(tone);tone.connect(dr);dr.connect(fb);fb.connect(dl);
      dl.connect(merger,0,0);dr.connect(merger,0,1);merger.connect(g.mix);
      comp.connect(limiter);limiter.connect(g.output);g.output.connect(destination);
      g.noise=this.noiseBuffer(ctx);g.active=[];g.delays=[dl,dr];g.style=this.appliedOptions.style;g.tempo=this.tempo();
      return g;
    }
    // v3 bus: the same chain, voiced for the v3 arrangement. The room has a pre-delay (the dry attack stays clear) and
    // its return is high-passed and softened, so reverb never thickens the bass or hisses; Space sets its size and level
    // and the echo's level and feedback.
    buildGraph3(ctx,destination){
      const g={ctx,version:3},style=this.appliedOptions.style;
      g.output=ctx.createGain();g.output.gain.value=.5*this.options.volume;
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-22;comp.knee.value=14;comp.ratio.value=2.5;comp.attack.value=.02;comp.release.value=.3;
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.002;limiter.release.value=.12;
      g.mix=ctx.createGain();g.mix.gain.value=TRIM3[style]||1.3;
      const eq=[['highpass',32,.7,0],['lowshelf',120,.7,-1.5],['peaking',300,.9,-1.8],['peaking',2900,.8,1.2],['highshelf',9500,.7,1.5]].map(([type,f,q,gain])=>{const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;b.gain.value=gain;return b;});
      const makeup=ctx.createGain();makeup.gain.value=1.1;
      g.mix.connect(eq[0]);for(let i=1;i<eq.length;i++)eq[i-1].connect(eq[i]);eq.at(-1).connect(makeup);makeup.connect(comp);g.eq=eq;
      g.dry=ctx.createGain();g.dry.connect(g.mix);
      g.reverbIn=ctx.createGain();g.pre=ctx.createDelay(.2);g.reverb=ctx.createConvolver();
      g.revHp=ctx.createBiquadFilter();g.revHp.type='highpass';g.revHp.frequency.value=190;g.revHp.Q.value=.6;
      g.revLp=ctx.createBiquadFilter();g.revLp.type='lowpass';g.revLp.frequency.value=6800;g.revLp.Q.value=.5;
      g.revOut=ctx.createGain();g.reverbIn.connect(g.pre);g.pre.connect(g.reverb);g.reverb.connect(g.revHp);g.revHp.connect(g.revLp);g.revLp.connect(g.revOut);g.revOut.connect(g.mix);
      const dl=ctx.createDelay(2),dr=ctx.createDelay(2),fb=ctx.createGain(),tone=ctx.createBiquadFilter(),merger=ctx.createChannelMerger(2);
      dl.delayTime.value=dr.delayTime.value=this.stepSeconds()*3;tone.type='lowpass';tone.frequency.value=2300;
      g.delayIn=ctx.createGain();g.delayIn.connect(dl);dl.connect(tone);tone.connect(dr);dr.connect(fb);fb.connect(dl);g.feedback=fb;
      dl.connect(merger,0,0);dr.connect(merger,0,1);merger.connect(g.mix);
      comp.connect(limiter);limiter.connect(g.output);g.output.connect(destination);
      g.noise=this.noiseBuffer(ctx);g.active=[];g.delays=[dl,dr];g.style=style;g.tempo=this.tempo();g.waves={};
      g.profileKey=JSON.stringify(this.appliedOptions.profile);this.space(g,true);return g;
    }
    // Space (profile.space): dry and intimate (0) to expansive (1). The room is re-rendered only when its length moves.
    space(g,now=false){
      const s=window.ResonanceScore.profileOf(this.appliedOptions.profile).space,ctx=g.ctx,t=ctx.currentTime;
      const set=(p,v)=>now?p.value=v:p.setTargetAtTime(v,t,.3);
      set(g.reverbIn.gain,.32+.62*s);set(g.revOut.gain,.75+.35*s);set(g.pre.delayTime,.008+.034*s);set(g.delayIn.gain,.22+.34*s);set(g.feedback.gain,.2+.18*s);
      const len=Math.round((REVERB3[g.style]||2.6)*(.6+.85*s)*4)/4;
      if(g.roomLength!==len){g.roomLength=len;g.reverb.buffer=this.impulse3(ctx,len);}
    }
    // A palette or tempo change re-sizes the room and the echo on the next bar.
    retune(g){
      if(g.version===3){g.style=this.appliedOptions.style;g.tempo=this.tempo();g.mix.gain.setTargetAtTime(TRIM3[g.style]||1.3,g.ctx.currentTime,.1);
        g.roomLength=null;this.space(g);for(const d of g.delays)d.delayTime.setTargetAtTime(this.stepSeconds()*3,g.ctx.currentTime,.05);return;}
      g.style=this.appliedOptions.style;g.tempo=this.tempo();
      g.mix.gain.setTargetAtTime(TRIM[g.style]||1,g.ctx.currentTime,.1);
      g.reverb.buffer=this.impulse(g.ctx,REVERB[g.style]||2.4);
      for(const d of g.delays)d.delayTime.setTargetAtTime(this.stepSeconds()*3,g.ctx.currentTime,.05);
    }
    impulse(ctx,seconds){
      const rate=ctx.sampleRate,len=Math.floor(rate*seconds),buf=ctx.createBuffer(2,len,rate);
      for(let c=0;c<2;c++){const d=buf.getChannelData(c);let s=0x9e3779b9^(c*7919),lp=0;
        for(let i=0;i<len;i++){s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;const white=s/4294967296*2-1;lp+=(white-lp)*(.5-.42*i/len);d[i]=lp*Math.pow(1-i/len,2.6);}}
      return buf;
    }
    // v3 room: decorrelated stereo noise with a few early reflections, an exponential tail, and air absorption (the
    // tail darkens as it decays). Seeded, so offline renders are identical.
    impulse3(ctx,seconds){
      const rate=ctx.sampleRate,len=Math.max(1,Math.floor(rate*seconds)),buf=ctx.createBuffer(2,len,rate),early=[.011,.019,.027,.041,.053];
      for(let c=0;c<2;c++){const d=buf.getChannelData(c);let s=(0x51ed27a5^(c*104729))>>>0,lp=0;
        for(let i=0;i<len;i++){s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;const white=s/4294967296*2-1,x=i/len;
          lp+=(white-lp)*(.62-.5*x);d[i]=lp*Math.exp(-5.2*x)*Math.min(1,i/(rate*.006));}
        for(const [k,e] of early.entries()){const i=Math.floor((e+(c?.003*k:0))*rate);if(i<len)d[i]+=(.5-.07*k)*(c?-1:1);}}
      return buf;
    }
    noiseBuffer(ctx){const b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),a=b.getChannelData(0);
      let seed=23984;for(let i=0;i<a.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;a[i]=(seed/4294967296)*2-1;}return b;}
    async start(){
      if(this.enabled){await this.ctx.resume();return;}
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)throw Error('Web Audio is not available in this browser');
      this.ctx=new AC({latencyHint:'playback'});
      this.appliedOptions={...this.options};
      this.graph=this.buildGraph(this.ctx,this.ctx.destination);this.output=this.graph.output;
      this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=1024;this.output.connect(this.analyser);
      this.recordNode=this.ctx.createMediaStreamDestination();this.output.connect(this.recordNode);
      this.step=0;this.bar=null;this.enabled=true;this.anchored=false;
      await this.ctx.resume();this.timer=setInterval(()=>this.schedule(),25);
    }
    async stop(){
      if(!this.enabled)return;
      this.enabled=false;clearInterval(this.timer);this.timer=null;
      const active=this.ctx,master=this.output;this.ctx=null;this.output=null;this.recordNode=null;this.graph=null;this.analyser=null;this.pilotNode=null;
      if(active&&master){try{master.gain.setTargetAtTime(0,active.currentTime,.06);await new Promise(r=>setTimeout(r,170));await active.close();}catch{}}
    }
    get stream(){return this.recordNode?.stream||null;}
    level(){if(!this.analyser)return 0;const b=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(b);let s=0;for(const v of b)s+=v*v;return Math.sqrt(s/b.length);}
    // Position on the bar grid (for audio-reactive visuals); null when not playing.
    phase(){if(!this.ctx||!this.bar)return null;const bar=STEPS*this.stepSeconds();return {barIndex:this.bar.barIndex,phase:clamp((this.ctx.currentTime-this.barStartTime)/bar),section:this.bar.section,chord:this.bar.chord,form:this.bar.form||null};}
    // Counts voices still sounding at `at` from their scheduled end times; works live and offline alike.
    voice(g,note,at){return g.version===3?this.voice3(g,note,at):this.voice2(g,note,at);}
    voice2(g,note,at){
      const ctx=g.ctx;g.active=g.active.filter(t=>t>at);if(g.active.length>=MAX_VOICES&&note.velocity<.2)return;
      const style=this.appliedOptions.style,role=note.instrument;
      if(['hat','shaker','snare','kick','taiko','texture','riser'].includes(role))return this.percussion(g,note,at);
      const p=(PATCH[role]&&(PATCH[role][style]||PATCH[role].all))||PATCH.pluck.all;
      const f=midiHz(note.midi),amp=clamp(note.velocity,0,1)*p.gain*(.6+.8*this.appliedOptions.texture);
      const out=ctx.createGain(),pan=ctx.createStereoPanner();pan.pan.value=clamp(note.pan||0,-1,1);
      out.connect(pan);pan.connect(g.dry);
      if(p.reverb){const s=ctx.createGain();s.gain.value=p.reverb;pan.connect(s);s.connect(g.reverbIn);}
      if(p.delay){const s=ctx.createGain();s.gain.value=p.delay;pan.connect(s);s.connect(g.delayIn);}
      const nodes=[out,pan];let end;
      if(p.fm){
        // FM bell/chime: inharmonic ratio gives a bell, 2:1 a softer chime; agents each get their own ratio.
        const ratio=role==='agent'?AGENT_RATIOS[(note.voice||0)%AGENT_RATIOS.length]:p.fm;
        const car=ctx.createOscillator(),mod=ctx.createOscillator(),modGain=ctx.createGain();
        car.frequency.value=f;mod.frequency.value=f*ratio;mod.connect(modGain);modGain.connect(car.frequency);car.connect(out);
        modGain.gain.setValueAtTime(f*p.index,at);modGain.gain.exponentialRampToValueAtTime(Math.max(1,f*.05),at+p.decay*.7);
        out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(Math.max(.0002,amp),at+.006);
        out.gain.exponentialRampToValueAtTime(.0001,at+p.decay);end=at+p.decay+.05;
        car.start(at);mod.start(at);car.stop(end);mod.stop(end);nodes.push(car,mod,modGain);car.onended=()=>this.release(nodes);
      }else{
        const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=p.q||.7;filter.connect(out);nodes.push(filter);
        const cutoff=(p.cutoff||2000)*(.55+.9*this.appliedOptions.texture);
        const dur=Math.max(.05,note.duration);
        const oscs=[];const count=p.voices||1;
        for(let i=0;i<count;i++){const o=ctx.createOscillator();o.type=p.wave||'sine';o.frequency.value=f;o.detune.value=count>1?(i-(count-1)/2)*(p.detune||0)*2/(count-1||1):0;
          // Unison voices each take a side; the filter and panner after them keep the stereo image.
          if(count>1&&p.spread){const sp=ctx.createStereoPanner();sp.pan.value=clamp((i/(count-1)*2-1)*p.spread,-1,1);o.connect(sp);sp.connect(filter);nodes.push(sp);}else o.connect(filter);oscs.push(o);}
        if(p.blend){const o=ctx.createOscillator(),bg=ctx.createGain();o.type=p.blend;o.frequency.value=f;bg.gain.value=.5;o.connect(bg);bg.connect(filter);oscs.push(o);nodes.push(bg);}
        if(p.sub){const o=ctx.createOscillator(),sg=ctx.createGain();o.type='sine';o.frequency.value=f/2;sg.gain.value=p.sub===true?.45:p.sub;o.connect(sg);sg.connect(out);oscs.push(o);nodes.push(sg);}
        if(p.harm){const o=ctx.createOscillator(),hg=ctx.createGain();o.type='triangle';o.frequency.value=f*2;hg.gain.value=p.harm;o.connect(hg);hg.connect(filter);oscs.push(o);nodes.push(hg);}
        if(p.vibrato){const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=p.vibrato;depth.gain.setValueAtTime(0,at);depth.gain.linearRampToValueAtTime(f*.004,at+Math.min(.6,dur));lfo.connect(depth);for(const o of oscs)depth.connect(o.frequency);oscs.push(lfo);nodes.push(depth);}
        if(p.decay){
          // Plucks: filter and amplitude fall together.
          filter.frequency.setValueAtTime(cutoff+(p.env||0),at);filter.frequency.exponentialRampToValueAtTime(Math.max(80,cutoff*.35),at+p.decay);
          out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(Math.max(.0002,amp),at+p.attack);out.gain.exponentialRampToValueAtTime(.0001,at+p.attack+p.decay);
          end=at+p.attack+p.decay+.05;
        }else{
          filter.frequency.setValueAtTime(p.env?cutoff+p.env:cutoff,at);if(p.env)filter.frequency.exponentialRampToValueAtTime(cutoff,at+.2);
          if(p.lfo&&dur>1){const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=p.lfo*(1+((note.midi*7)%5)*.08);depth.gain.value=cutoff*.28;lfo.connect(depth);depth.connect(filter.frequency);oscs.push(lfo);nodes.push(depth);}
          out.gain.setValueAtTime(0,at);out.gain.linearRampToValueAtTime(amp,at+p.attack);
          const hold=Math.max(at+p.attack,at+dur);out.gain.setValueAtTime(amp,hold);out.gain.setTargetAtTime(0,hold,p.release/4);
          end=hold+p.release*1.6;
        }
        for(const o of oscs){o.start(at);o.stop(end);}
        nodes.push(...oscs);oscs[0].onended=()=>this.release(nodes);
      }
      g.active.push(end);
    }
    release(nodes){for(const n of nodes){try{n.disconnect();}catch{}}}
    // Band-limited pulse waves (duty 50, 25, 12.5 %) for chip: the classic timbres without aliasing.
    wave(g,type){
      if(!/^duty/.test(type))return null;if(g.waves[type])return g.waves[type];
      const d=type==='duty25'?.25:type==='duty12'?.125:.5,n=40,re=new Float32Array(n),im=new Float32Array(n);
      for(let k=1;k<n;k++){const a=2/(k*Math.PI)*Math.pow(.97,k);re[k]=a*Math.sin(2*Math.PI*k*d);im[k]=a*(1-Math.cos(2*Math.PI*k*d));}
      return g.waves[type]=g.ctx.createPeriodicWave(re,im);
    }
    // Soft saturation (tanh): harmonics that let a bass speak on small speakers without more low end.
    shaper(g){if(g.shape)return g.shape;const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(1.6*x)/Math.tanh(1.6);}return g.shape=c;}
    voice3(g,note,at){
      const ctx=g.ctx;g.active=g.active.filter(t=>t>at);if(g.active.length>=MAX_VOICES&&note.velocity<.12)return;
      const style=this.appliedOptions.style,role=note.instrument;
      if(PERC3.has(role))return this.percussion3(g,note,at);
      // Engineering accents (chime, pluck, agent, swell) keep their v2 voices: the recorded events sound as before.
      const p=PATCH3[role]?(PATCH3[role][style]||PATCH3[role].all):null;
      if(!p)return this.voice2(g,note,at);
      const f=midiHz(note.midi),amp=clamp(note.velocity,0,1)*p.gain,tex=.7+.6*this.appliedOptions.texture;
      const out=ctx.createGain(),pan=ctx.createStereoPanner();pan.pan.value=clamp(note.pan||0,-1,1);
      let tail=out;const nodes=[out,pan];
      if(p.hp){const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=Math.min(p.hp,f*.9);hp.Q.value=.5;out.connect(hp);tail=hp;nodes.push(hp);}
      if(p.drive){const ws=ctx.createWaveShaper();ws.curve=this.shaper(g);ws.oversample='2x';tail.connect(ws);tail=ws;nodes.push(ws);}
      tail.connect(pan);pan.connect(g.dry);
      if(p.reverb){const s=ctx.createGain();s.gain.value=p.reverb;pan.connect(s);s.connect(g.reverbIn);nodes.push(s);}
      if(p.delay){const s=ctx.createGain();s.gain.value=p.delay;pan.connect(s);s.connect(g.delayIn);nodes.push(s);}
      const dur=Math.max(.05,note.duration),oscs=[];let end;
      const osc=(type,freq,dest,gain=1,detune=0)=>{const o=ctx.createOscillator();const w=this.wave(g,type);if(w)o.setPeriodicWave(w);else o.type=type;o.frequency.value=freq;o.detune.value=detune;
        if(gain!==1){const og=ctx.createGain();og.gain.value=gain;o.connect(og);og.connect(dest);nodes.push(og);}else o.connect(dest);oscs.push(o);return o;};
      if(p.fm){
        // FM bells: the modulation index falls faster than the tone, so the strike is bright and the decay pure.
        const car=ctx.createOscillator(),mod=ctx.createOscillator(),mg=ctx.createGain(),car2=ctx.createOscillator(),g2=ctx.createGain();
        car.frequency.value=f;mod.frequency.value=f*p.fm.ratio;car2.frequency.value=f*2.001;g2.gain.value=.12;
        mod.connect(mg);mg.connect(car.frequency);car.connect(out);car2.connect(g2);g2.connect(out);
        mg.gain.setValueAtTime(f*p.fm.index,at);mg.gain.exponentialRampToValueAtTime(Math.max(1,f*.03),at+p.decay*.45);
        out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(Math.max(.0002,amp),at+.008);out.gain.exponentialRampToValueAtTime(.0001,at+p.decay);
        end=at+p.decay+.05;for(const o of [car,mod,car2]){o.start(at);o.stop(end);}nodes.push(car,mod,mg,car2,g2);car.onended=()=>this.release(nodes);g.active.push(end);return;
      }
      const filter=ctx.createBiquadFilter();filter.type=p.noise?'bandpass':'lowpass';filter.Q.value=p.noise?p.noise.q:(p.q||.6);filter.connect(out);nodes.push(filter);
      const cutoff=(p.cutoff||2000)*tex;
      if(p.noise){const src=ctx.createBufferSource();src.buffer=g.noise;src.loop=true;src.connect(filter);filter.frequency.value=f;oscs.push(src);}
      else{const count=p.voices||1;
        for(let i=0;i<count;i++){const det=count>1?(i-(count-1)/2)*(p.detune||0)*2/(count-1):0;
          if(count>1&&p.spread){const sp=ctx.createStereoPanner();sp.pan.value=clamp((i/(count-1)*2-1)*p.spread,-1,1);sp.connect(filter);nodes.push(sp);osc(p.wave||'sine',f,sp,1,det);}
          else osc(p.wave||'sine',f,filter,1,det);}}
      if(p.blend)osc(p.blend.wave,f*Math.pow(2,p.blend.octave||0),filter,p.blend.gain);
      if(p.sub)osc('sine',f/2,out,p.sub);
      if(p.harm)osc('triangle',f*2,filter,p.harm);
      if(p.breath){const src=ctx.createBufferSource(),bp=ctx.createBiquadFilter(),bg=ctx.createGain();src.buffer=g.noise;bp.type='bandpass';bp.frequency.value=Math.min(9000,f*2.2);bp.Q.value=2.2;
        src.connect(bp);bp.connect(bg);bg.connect(out);bg.gain.setValueAtTime(p.breath*amp*6,at);bg.gain.exponentialRampToValueAtTime(.0001,at+.14);
        src.start(at,(note.midi*.017)%.8);src.stop(at+.16);nodes.push(src,bp,bg);}
      if(p.vibrato){const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=p.vibrato.rate;depth.gain.setValueAtTime(0,at);
        depth.gain.linearRampToValueAtTime(0,at+Math.min(p.vibrato.delay,dur*.5));depth.gain.linearRampToValueAtTime(f*p.vibrato.depth,at+Math.min(p.vibrato.delay+.5,dur));
        lfo.connect(depth);for(const o of oscs)if(o.frequency)depth.connect(o.frequency);oscs.push(lfo);nodes.push(depth);}
      if(p.decay&&!p.sustain){
        // Plucks: filter and level fall together.
        filter.frequency.setValueAtTime(cutoff+(p.env||0),at);filter.frequency.exponentialRampToValueAtTime(Math.max(90,cutoff*.35),at+p.decay);
        out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(Math.max(.0002,amp),at+p.attack);out.gain.exponentialRampToValueAtTime(.0001,at+p.attack+p.decay);
        end=at+p.attack+p.decay+.05;
      }else{
        // Held notes: the filter opens with the attack and settles (an envelope that breathes), an optional slow LFO keeps
        // long chords moving, and the release is a natural exponential tail.
        if(p.env){filter.frequency.setValueAtTime(cutoff*.7,at);filter.frequency.linearRampToValueAtTime(cutoff+p.env,at+Math.max(.01,p.attack));filter.frequency.setTargetAtTime(cutoff,at+p.attack,(p.envDecay||.5)/3);}
        else filter.frequency.setValueAtTime(p.noise?f:cutoff,at);
        if(p.lfo&&dur>1){const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=p.lfo*(1+((note.midi*7)%5)*.08);depth.gain.value=cutoff*.22;lfo.connect(depth);depth.connect(filter.frequency);oscs.push(lfo);nodes.push(depth);}
        const level=p.sustain?amp*p.sustain:amp;
        out.gain.setValueAtTime(0,at);out.gain.linearRampToValueAtTime(amp,at+p.attack);if(p.sustain)out.gain.setTargetAtTime(level,at+p.attack,(p.decay||.3)/3);
        const hold=Math.max(at+p.attack,at+dur);out.gain.setValueAtTime(level,hold);out.gain.setTargetAtTime(0,hold,p.release/4);
        end=hold+p.release*1.6;
      }
      for(const o of oscs){o.start(at);o.stop(end);}
      nodes.push(...oscs);oscs[0].onended=()=>this.release(nodes);
      g.active.push(end);
    }
    // v3 percussion: each style's own kit (chip a noise channel and a pitched square), softer transients, and the
    // transition gestures (a riser into a section, a wash at a return).
    percussion3(g,note,at){
      const ctx=g.ctx,style=this.appliedOptions.style,v=clamp(note.velocity,0,1)*(.75+.5*this.appliedOptions.texture),chip=style==='chip';
      const out=ctx.createGain(),pan=ctx.createStereoPanner();pan.pan.value=clamp(note.pan||0,-1,1);out.connect(pan);pan.connect(g.dry);
      const nodes=[out,pan],send=(amount)=>{const s=ctx.createGain();s.gain.value=amount;pan.connect(s);s.connect(g.reverbIn);nodes.push(s);};let end;
      const env=(peak,attack,decay)=>{out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),at+Math.max(.002,attack));out.gain.exponentialRampToValueAtTime(.0001,at+attack+decay);return at+attack+decay+.03;};
      const noise=(type,freq,q=.8)=>{const src=ctx.createBufferSource(),flt=ctx.createBiquadFilter();src.buffer=g.noise;flt.type=type;flt.frequency.value=freq;flt.Q.value=q;src.connect(flt);flt.connect(out);nodes.push(src,flt);return {src,flt};};
      const role=note.instrument;
      if(role==='kick'||role==='taiko'){
        const o=ctx.createOscillator();if(chip&&role==='kick')o.setPeriodicWave(this.wave(g,'duty50'));else o.type='sine';
        const top=role==='taiko'?92:chip?220:108,low=role==='taiko'?50:chip?58:46,decay=role==='taiko'?.85:chip?.14:.34;
        o.frequency.setValueAtTime(top,at);o.frequency.exponentialRampToValueAtTime(low,at+(role==='taiko'?.16:.09));o.connect(out);nodes.push(o);
        end=env(v*(chip?.5:.85),.003,decay);o.start(at);o.stop(end);o.onended=()=>this.release(nodes);
        if(role==='taiko'){const {src}=noise('lowpass',420,.7);src.start(at,.21);src.stop(at+.2);send(.42);}
        else if(!chip){const {src}=noise('highpass',3200,.7);src.start(at,.37);src.stop(at+.008);}
      }else{
        const shape={hat:chip?['highpass',7000,.002,.035,.2]:['highpass',9000,.001,note.duration>.08?.16:.045,.2],shaker:['bandpass',6000,.016,.07,.16],
          snare:chip?['highpass',2400,.001,.1,.3]:['bandpass',1800,.001,.14,.36],texture:['bandpass',900,note.duration*.5,note.duration*.5,.14],
          riser:['highpass',420,note.duration*.92,.08,.18],wash:['bandpass',7200,.004,Math.min(4,note.duration),.11]}[role];
        const [type,freq,attack,decay,gain]=shape,{src,flt}=noise(type,freq,type==='bandpass'?(role==='wash'?.6:1.2):.7);
        if(role==='riser'||role==='texture')flt.frequency.exponentialRampToValueAtTime(role==='riser'?6200:2400,at+attack);
        if(role==='snare'&&!chip){const body=ctx.createOscillator(),bg=ctx.createGain();body.type='triangle';body.frequency.setValueAtTime(200,at);body.frequency.exponentialRampToValueAtTime(150,at+.06);
          body.connect(bg);bg.connect(out);bg.gain.value=.5;body.start(at);body.stop(at+.12);nodes.push(body,bg);}
        end=env(v*gain,attack,decay);src.start(at,(note.midi*.013+(role==='wash'?.3:0))%.8);src.stop(end);src.onended=()=>this.release(nodes);
        if(role==='texture'||role==='riser'||role==='wash')send(.55);else if(role==='snare')send(.12);
      }
      g.active.push(end);
    }
    percussion(g,note,at){
      const ctx=g.ctx,v=clamp(note.velocity,0,1)*(.6+.8*this.appliedOptions.texture);
      const out=ctx.createGain(),pan=ctx.createStereoPanner();pan.pan.value=clamp(note.pan||0,-1,1);out.connect(pan);pan.connect(g.dry);
      const nodes=[out,pan];let end;
      if(note.instrument==='kick'||note.instrument==='taiko'){
        const o=ctx.createOscillator();o.type='sine';const top=note.instrument==='taiko'?95:120,low=note.instrument==='taiko'?52:44,decay=note.instrument==='taiko'?.7:.32;
        o.frequency.setValueAtTime(top,at);o.frequency.exponentialRampToValueAtTime(low,at+.12);
        out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(v*.9,at+.004);out.gain.exponentialRampToValueAtTime(.0001,at+decay);
        if(note.instrument==='taiko'){const s=ctx.createGain();s.gain.value=.35;pan.connect(s);s.connect(g.reverbIn);nodes.push(s);}
        o.connect(out);end=at+decay+.02;o.start(at);o.stop(end);nodes.push(o);o.onended=()=>this.release(nodes);
      }else{
        const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter();src.buffer=g.noise;src.connect(filter);filter.connect(out);nodes.push(src,filter);
        const shape={hat:['highpass',8200,.0,.05,.22],shaker:['bandpass',5200,.012,.09,.16],snare:['bandpass',1900,.0,.16,.42],texture:['bandpass',900,note.duration*.5,note.duration*.5,.16],riser:['highpass',500,note.duration*.92,.08,.2]}[note.instrument]||['highpass',6000,0,.05,.2];
        const [type,freq,attack,decay,gain]=shape;filter.type=type;filter.frequency.value=freq;filter.Q.value=type==='bandpass'?1.2:.7;
        if(note.instrument==='riser'||note.instrument==='texture')filter.frequency.exponentialRampToValueAtTime(note.instrument==='riser'?7000:2400,at+attack);
        out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(Math.max(.0002,v*gain),at+Math.max(.003,attack));out.gain.exponentialRampToValueAtTime(.0001,at+attack+decay);
        if(note.instrument==='texture'||note.instrument==='riser'){const s=ctx.createGain();s.gain.value=.5;pan.connect(s);s.connect(g.reverbIn);nodes.push(s);}
        end=at+attack+decay+.02;src.start(at,(note.midi*0.013)%0.8);src.stop(end);src.onended=()=>this.release(nodes);
      }
      g.active.push(end);
    }
    // Section and layer decisions happen on bar boundaries only, from smoothed state, so changes arrive musically.
    beginBar(){
      this.frame=this.requestedFrame||this.frame;
      this.appliedOptions={...this.options};
      const f=this.frame||{},score=window.ResonanceScore;
      if(this.graph&&(this.graph.version===3)!==(this.version()===3))this.swapGraph();
      if(this.version()===3)return this.beginBar3(f,score);
      // With no new frame for 15 s the work has gone quiet: the energy relaxes (frames are only made when events arrive).
      const stale=Number.isFinite(this.perfNow)&&Number.isFinite(f.end)&&this.perfNow-f.end>15000;
      this.energy=this.energy*.7+(stale?0:(f.controls?.energy||0))*.3;
      const tension=f.controls?.tension||0;
      if(this.barIndex%score.SECTION_BARS===0||!this.bar){
        this.sectionIndex=Math.floor(this.barIndex/score.SECTION_BARS);
        this.section=score.chooseSection({index:this.sectionIndex,tension,energy:this.energy,previous:this.section,milestone:this.milestone});
        this.milestone=false;
      }
      if(this.graph&&(this.graph.style!==this.appliedOptions.style||this.graph.tempo!==this.tempo()))this.retune(this.graph);
      this.bar=score.createBar({seed:f.projectSeed||score.hash(this.projectId),chapter:f.chapter||1,tension,energy:this.energy,
        style:this.appliedOptions.style,barIndex:this.barIndex++,section:this.section,sectionIndex:this.sectionIndex});
      this.onBar({index:this.barIndex,style:this.appliedOptions.style,chapter:this.bar.chapter,section:this.bar.section,key:this.bar.key});
    }
    // Score v3: the conductor reads the frames in force at this bar (conductAt), so the same performance gets the same
    // music whenever and however it is joined (after about eight bars of history).
    beginBar3(f,score){
      const o=this.appliedOptions,seed=this.seed(),barMs=STEPS*this.stepSeconds()*1000;
      if(this.graph&&(this.graph.style!==o.style||this.graph.tempo!==this.tempo()))this.retune(this.graph);
      if(this.graph&&JSON.stringify(o.profile)!==this.graph.profileKey){this.graph.profileKey=JSON.stringify(o.profile);this.space(this.graph);}
      // Bars are looked up at their performance time (replays at other speeds keep the score on the performance).
      const T0=Number.isFinite(this.perfNow)?this.perfNow:this.barIndex*barMs,at=b=>this.frameAt(T0+(b-this.barIndex)*barMs*this.speed);
      const c=score.conductAt({seed,barIndex:this.barIndex,profile:o.profile,frameAt:at});
      this.energy=c.energy;this.section=c.role;this.sectionIndex=Math.floor(this.barIndex/score.PASSAGE_BARS);
      this.bar=score.createBar({scoreVersion:3,seed,chapter:at(this.barIndex)?.chapter||f.chapter||1,energy:c.energy,tension:c.tension,style:o.style,
        barIndex:this.barIndex++,section:c.role,lift:c.lift,profile:o.profile,tempo:this.tempo()});
      this.onBar({index:this.barIndex,style:o.style,chapter:this.bar.chapter,section:this.bar.section,key:this.bar.key,form:this.bar.form});
    }
    // Upgrading an identity (or going back) switches the bus in place: the new one fades in on the same context and
    // master, the old one fades out with its tails, so playback and a running recording continue.
    swapGraph(){
      const old=this.graph,ctx=this.ctx;if(!ctx||!old)return;
      const next=this.buildGraph(ctx,ctx.destination);
      if(this.analyser)next.output.connect(this.analyser);if(this.recordNode)next.output.connect(this.recordNode);
      const v=.5*this.options.volume,t=ctx.currentTime;next.output.gain.setValueAtTime(0,t);next.output.gain.linearRampToValueAtTime(v,t+.8);
      old.output.gain.setTargetAtTime(0,t,.35);setTimeout(()=>{try{old.output.disconnect();}catch{}},4000);
      this.graph=next;this.output=next.output;
    }
    // Anchors the bar grid to the performance clock so the same performance time always falls on the same bar.
    // Joining mid-bar starts on the next step and voices the chord already in progress, so sound starts at once.
    anchor(){
      const stepMs=this.stepSeconds()*1000,barMs=stepMs*STEPS;
      this.step=0;this.bar=null;this.anchored=true;this.entry=true;
      if(!this.clock){this.nextTime=this.ctx.currentTime+.08;return;}
      const perf=this.clock();let bar=Math.floor(perf/barMs),step=Math.ceil((perf-bar*barMs)/stepMs);
      if(step>=STEPS){bar++;step=0;}
      this.barIndex=bar;this.step=step;
      this.nextTime=this.ctx.currentTime+Math.max(.03,(bar*barMs+step*stepMs-perf)/1000/this.speed);
    }
    playEntry(){
      const score=window.ResonanceScore,f=this.frame||{};
      if(this.version()===3){const o=this.appliedOptions,src=this.bar.steps[0].some(e=>e.group==='pad')?this.bar:score.createBar({scoreVersion:3,seed:this.seed(),chapter:this.bar.chapter,energy:this.energy,
          style:o.style,barIndex:this.bar.barIndex-1,section:this.bar.section,profile:o.profile,tempo:this.tempo()});
        const elapsed=this.nextTime-this.barStartTime+(src===this.bar?0:STEPS*this.stepSeconds());
        for(const e of src.steps[0])if(e.group==='pad'&&e.duration-elapsed>.5)this.voice(this.graph,{...e,duration:e.duration-elapsed,velocity:e.velocity*.85},this.nextTime);return;}
      const source=this.bar.steps[0].some(e=>e.instrument==='pad')?this.bar:score.createBar({seed:this.seed(),chapter:f.chapter||1,tension:f.controls?.tension||0,energy:this.energy,
        style:this.appliedOptions.style,barIndex:this.bar.barIndex-1,section:this.section,sectionIndex:this.sectionIndex});
      const elapsed=this.nextTime-this.barStartTime+(source===this.bar?0:STEPS*this.stepSeconds());
      for(const e of source.steps[0])if(e.instrument==='pad'&&e.duration-elapsed>.5)this.voice(this.graph,{...e,duration:e.duration-elapsed,velocity:e.velocity*.85},this.nextTime);
    }
    // Queue a recorded cue for its performance time; it sounds on the first grid step at or after that time.
    enqueue(cue,atMs){
      if(!this.ctx||!window.ResonanceScore.accentFigure)return;
      const when=this.clock?this.ctx.currentTime+(atMs-this.clock())/1000/this.speed:this.ctx.currentTime+.05;
      if(when<this.ctx.currentTime-1.5)return;
      this.accents.push({cue,when});if(this.accents.length>400)this.accents.splice(0,this.accents.length-400);
    }
    accentsFor(time,stepDur,barBudget){
      const due=[],keep=[];
      for(const a of this.accents)(a.when<=time+stepDur?due:keep).push(a);
      this.accents=keep;
      const figures=due.filter(a=>a.when>=time-2).map(a=>({a,notes:window.ResonanceScore.accentFigure(a.cue,{seed:this.seed(),chord:this.bar?.chord||0,style:this.appliedOptions.style})})).filter(x=>x.notes.length);
      figures.sort((x,y)=>(y.notes[0].priority||0)-(x.notes[0].priority||0));
      // Milestones (validated refactors, recovered or newly validated tests, substantial commits) lift the next section.
      for(const x of figures)if((/^(milestone\.|validation\.test\.passed)/.test(x.a.cue.type)&&x.a.cue.weight>=1)||(x.a.cue.type==='repository.commit.observed'&&x.a.cue.weight>=0.6))this.milestone=true;
      // At most two figures per step and a bar budget; lower-priority figures yield.
      return figures.slice(0,Math.min(2,barBudget.left)).map(x=>{barBudget.left--;return x.notes;});
    }
    schedule(){
      if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
      if(!this.anchored)this.anchor();
      let limit=0;
      while(this.nextTime<this.ctx.currentTime+.3&&limit++<32){
        if(!this.bar||this.step===0){this.perfNow=this.clock?this.clock()+(this.nextTime-this.ctx.currentTime)*1000*this.speed:undefined;this.beginBar();this.barStartTime=this.nextTime-this.step*this.stepSeconds();this.budget={left:6};
          if(this.entry){this.entry=false;if(this.step>0)this.playEntry();}}
        const stepDur=this.stepSeconds();
        const swing=this.step%2===1?(this.bar.swing||0)*stepDur:0;
        const v2=this.version()!==3;
        for(const event of this.bar.steps[this.step]||[]){
          // v2's texture rests (live only, as before); v3's rhythm control lives in the score, so live and offline agree.
          if(v2&&event.instrument==='arp'&&this.appliedOptions.texture<.2)continue;
          if(v2&&['kick','snare','hat','shaker','taiko'].includes(event.instrument)&&this.appliedOptions.texture<.12)continue;
          this.voice(this.graph,event,this.nextTime+swing);
        }
        for(const notes of this.accentsFor(this.nextTime,stepDur,this.budget))
          for(const n of notes)this.voice(this.graph,n,this.nextTime+n.offset*stepDur);
        this.step=(this.step+1)%STEPS;
        this.nextTime+=stepDur;
      }
    }
    // Compatibility with the v0.2 player: an immediate cue becomes a quantized accent.
    accent(type,cue){if(this.ctx&&this.enabled)this.enqueue(cue||{id:type,type,weight:1,detail:{}},this.clock?this.clock():0);}
    // Qualification only (recording synchronisation): a 2 kHz click at a performance time, mapped to the audio clock
    // exactly as cues are, so a recording's picture and sound can be compared at a known moment.
    // The marker is a 40 ms linear chirp from 3 to 6 kHz (Hann window), found by a matched filter: musical notes are not
    // mistaken for it, and its start is located to the sample.
    marker(atMs){
      if(!this.ctx||!this.output)return false;
      const when=this.clock?this.ctx.currentTime+(atMs-this.clock())/1000/this.speed:this.ctx.currentTime+.05;if(when<this.ctx.currentTime)return false;
      if(!this.chirp||this.chirp.sampleRate!==this.ctx.sampleRate){const rate=this.ctx.sampleRate,n=Math.round(rate*.04),b=this.ctx.createBuffer(1,n,rate),d=b.getChannelData(0),k=3000/.04;
        for(let i=0;i<n;i++){const t=i/rate;d[i]=.8*Math.sin(2*Math.PI*(3000*t+k*t*t/2))*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));}this.chirp=b;}
      const src=this.ctx.createBufferSource();src.buffer=this.chirp;src.connect(this.output);src.start(when);return true;
    }
    // Qualification only (recording continuity): a steady 12 kHz pilot tone at -40 dBFS into the same output, so any
    // gap in a recording's audio path shows as a gap in the pilot, whatever the music is doing.
    pilot(on){
      if(!this.ctx||!this.output)return false;
      if(this.pilotNode){try{this.pilotNode.stop();}catch{}this.pilotNode=null;}
      if(!on)return true;
      const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=12000;g.gain.value=.01;o.connect(g);g.connect(this.output);o.start();
      this.pilotNode=o;return true;
    }
    // Offline render of a recorded performance: [{atMs, frame?, cue?}] sorted by time, starting at startMs.
    // `speed` replays the performance faster than real time while the music keeps its tempo; onBar reports each bar's
    // audio time and the performance time it corresponds to (used to keep a rendered film's light in step with the score).
    static async renderOffline({timeline,startMs,durationSec,style='ambient',texture=.58,volume=.7,tempoMode='project',tempo=92,sampleRate=44100,projectId='offline',onBar,speed=1,scoreVersion=2,profile=null,projectSeed=null}){
      const ctx=new OfflineAudioContext(2,Math.ceil(durationSec*sampleRate),sampleRate);
      let t=0;
      const m=new ResonanceMusic(onBar?(info=>onBar({...info,layers:m.bar?.layers,chord:m.bar?.chord,time:t,perfMs:startMs+t*1000*speed})):undefined);m.setProject(projectId);m.setOptions({style,texture,volume,tempoMode,tempo,scoreVersion,profile});m.appliedOptions={...m.options};
      // v3: the identity's seed is known before the first frame, so the grid and durations are the live ones from bar one.
      const v3=m.version()===3;if(v3&&Number.isFinite(projectSeed))m.frame={projectSeed};m.speed=speed>0?speed:1;
      m.ctx=ctx;const g=m.buildGraph(ctx,ctx.destination);m.graph=g;
      const stepDur=m.stepSeconds(),barMs=stepDur*STEPS*1000;
      let i=0;const events=timeline.slice().sort((a,b)=>a.atMs-b.atMs);
      m.barIndex=Math.ceil(startMs/barMs);t=speed===1?(m.barIndex*barMs-startMs)/1000:0;
      while(t<durationSec){
        const perf=startMs+t*1000*speed;
        while(i<events.length&&events[i].atMs<=perf+stepDur*1000*speed){if(events[i].frame)m.setFrame(events[i].frame,events[i].atMs);if(events[i].cue)m.accents.push({cue:events[i].cue,when:Math.max(t,(events[i].atMs-startMs)/1000/speed)});i++;}
        if(m.step===0){m.perfNow=perf;m.beginBar();m.budget={left:6};}
        for(const e of m.bar.steps[m.step])m.voice(g,e,t+(m.step%2?(m.bar.swing||0)*stepDur:0));
        for(const notes of m.accentsFor(t,stepDur,m.budget))for(const n of notes)m.voice(g,n,t+n.offset*stepDur);
        m.step=(m.step+1)%STEPS;t+=stepDur;
      }
      return ctx.startRendering();
    }
  }
  window.ResonanceMusic=ResonanceMusic;
})();

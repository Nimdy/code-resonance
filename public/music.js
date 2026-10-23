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
    pad:{ambient:{wave:'sawtooth',voices:2,detune:7,cutoff:900,q:.6,attack:1.4,release:2.4,gain:.32,reverb:.55,delay:0},
      pulse:{wave:'sawtooth',voices:2,detune:11,cutoff:1500,q:.8,attack:.35,release:1.2,gain:.26,reverb:.35,delay:.05},
      cinematic:{wave:'sawtooth',voices:3,detune:6,cutoff:1700,q:.5,attack:.9,release:2.2,gain:.24,reverb:.6,delay:0,vibrato:4.6},
      chip:{wave:'square',voices:1,detune:0,cutoff:2600,q:.3,attack:.01,release:.25,gain:.13,reverb:.15,delay:0}},
    bass:{ambient:{wave:'sine',sub:true,cutoff:420,attack:.03,release:.6,gain:.55,reverb:.12},pulse:{wave:'sawtooth',cutoff:520,env:900,attack:.005,release:.18,gain:.42,reverb:.05},
      cinematic:{wave:'triangle',sub:true,cutoff:480,attack:.08,release:.9,gain:.5,reverb:.2},chip:{wave:'triangle',cutoff:2000,attack:.003,release:.08,gain:.42,reverb:.02}},
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
  class ResonanceMusic {
    constructor(onBar=()=>{}){
      this.ctx=null;this.output=null;this.recordNode=null;this.onBar=onBar;
      this.timer=null;this.nextTime=0;this.step=0;this.barIndex=0;this.bar=null;
      this.projectId='';this.identity={motif:[0,2,4,1],scale:'D'};
      this.requestedFrame=null;this.frame=null;
      this.options={style:'ambient',volume:.55,tempo:92,texture:.58,tempoMode:'project'};
      this.appliedOptions={...this.options};this.enabled=false;
      this.clock=null;this.speed=1;this.accents=[];this.voices=0;this.anchored=false;
      this.energy=0;this.section='home';this.sectionIndex=0;this.milestone=false;this.barStartTime=0;
      this.analyser=null;
    }
    setProject(projectId,identity){
      if(!projectId||this.projectId===projectId)return;
      this.projectId=projectId;
      if(identity)this.identity={motif:[...identity.motif],scale:identity.scale};
      this.barIndex=0;this.step=0;this.bar=null;this.accents=[];this.anchored=false;this.section='home';this.energy=0;
    }
    setFrame(frame){if(frame)this.requestedFrame=frame;}
    // The performance clock (ms) shared with the visuals: live = wall time minus interpretation delay, replay = playhead.
    setClock(fn,speed=1){this.clock=fn;this.speed=speed>0?speed:1;this.resync();}
    resync(){this.anchored=false;this.accents=[];}
    setOptions(next){this.options={...this.options,...next};
      this.options.volume=clamp(this.options.volume);
      this.options.tempo=clamp(Number(this.options.tempo),58,160);
      this.options.texture=clamp(this.options.texture);
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
      const g={ctx};
      g.output=ctx.createGain();g.output.gain.value=.5*this.options.volume;
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-20;comp.knee.value=12;comp.ratio.value=3;comp.attack.value=.012;comp.release.value=.25;
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.002;limiter.release.value=.1;
      g.dry=ctx.createGain();g.dry.connect(comp);
      g.reverb=ctx.createConvolver();g.reverb.buffer=this.impulse(ctx,REVERB[this.appliedOptions.style]||2.4);
      g.reverbIn=ctx.createGain();g.reverbIn.gain.value=.55;g.reverbIn.connect(g.reverb);g.reverb.connect(comp);
      // Ping-pong delay at a dotted eighth, darkened each repeat.
      const dl=ctx.createDelay(2),dr=ctx.createDelay(2),fb=ctx.createGain(),tone=ctx.createBiquadFilter(),merger=ctx.createChannelMerger(2);
      dl.delayTime.value=dr.delayTime.value=this.stepSeconds()*3;fb.gain.value=.32;tone.type='lowpass';tone.frequency.value=2600;
      g.delayIn=ctx.createGain();g.delayIn.gain.value=.4;g.delayIn.connect(dl);dl.connect(tone);tone.connect(dr);dr.connect(fb);fb.connect(dl);
      dl.connect(merger,0,0);dr.connect(merger,0,1);merger.connect(comp);
      comp.connect(limiter);limiter.connect(g.output);g.output.connect(destination);
      g.noise=this.noiseBuffer(ctx);g.voices=0;g.delays=[dl,dr];g.style=this.appliedOptions.style;g.tempo=this.tempo();
      return g;
    }
    // A palette or tempo change re-sizes the room and the echo on the next bar.
    retune(g){
      g.style=this.appliedOptions.style;g.tempo=this.tempo();
      g.reverb.buffer=this.impulse(g.ctx,REVERB[g.style]||2.4);
      for(const d of g.delays)d.delayTime.setTargetAtTime(this.stepSeconds()*3,g.ctx.currentTime,.05);
    }
    impulse(ctx,seconds){
      const rate=ctx.sampleRate,len=Math.floor(rate*seconds),buf=ctx.createBuffer(2,len,rate);
      for(let c=0;c<2;c++){const d=buf.getChannelData(c);let s=0x9e3779b9^(c*7919),lp=0;
        for(let i=0;i<len;i++){s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;const white=s/4294967296*2-1;lp+=(white-lp)*(.5-.42*i/len);d[i]=lp*Math.pow(1-i/len,2.6);}}
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
      const active=this.ctx,master=this.output;this.ctx=null;this.output=null;this.recordNode=null;this.graph=null;this.analyser=null;
      if(active&&master){try{master.gain.setTargetAtTime(0,active.currentTime,.06);await new Promise(r=>setTimeout(r,170));await active.close();}catch{}}
    }
    get stream(){return this.recordNode?.stream||null;}
    level(){if(!this.analyser)return 0;const b=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(b);let s=0;for(const v of b)s+=v*v;return Math.sqrt(s/b.length);}
    // Position on the bar grid (for audio-reactive visuals); null when not playing.
    phase(){if(!this.ctx||!this.bar)return null;const bar=STEPS*this.stepSeconds();return {barIndex:this.bar.barIndex,phase:clamp((this.ctx.currentTime-this.barStartTime)/bar),section:this.bar.section,chord:this.bar.chord};}
    voice(g,note,at){
      const ctx=g.ctx;if(g.voices>=MAX_VOICES&&note.velocity<.2)return;
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
        car.start(at);mod.start(at);car.stop(end);mod.stop(end);nodes.push(car,mod,modGain);car.onended=()=>this.release(g,nodes);
      }else{
        const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=p.q||.7;filter.connect(out);nodes.push(filter);
        const cutoff=(p.cutoff||2000)*(.55+.9*this.appliedOptions.texture);
        const dur=Math.max(.05,note.duration);
        const oscs=[];const count=p.voices||1;
        for(let i=0;i<count;i++){const o=ctx.createOscillator();o.type=p.wave||'sine';o.frequency.value=f;o.detune.value=count>1?(i-(count-1)/2)*(p.detune||0)*2/(count-1||1):0;o.connect(filter);oscs.push(o);}
        if(p.blend){const o=ctx.createOscillator(),bg=ctx.createGain();o.type=p.blend;o.frequency.value=f;bg.gain.value=.5;o.connect(bg);bg.connect(filter);oscs.push(o);nodes.push(bg);}
        if(p.sub){const o=ctx.createOscillator(),sg=ctx.createGain();o.type='sine';o.frequency.value=f/2;sg.gain.value=.45;o.connect(sg);sg.connect(out);oscs.push(o);nodes.push(sg);}
        if(p.vibrato){const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=p.vibrato;depth.gain.setValueAtTime(0,at);depth.gain.linearRampToValueAtTime(f*.004,at+Math.min(.6,dur));lfo.connect(depth);for(const o of oscs)depth.connect(o.frequency);oscs.push(lfo);nodes.push(depth);}
        if(p.decay){
          // Plucks: filter and amplitude fall together.
          filter.frequency.setValueAtTime(cutoff+(p.env||0),at);filter.frequency.exponentialRampToValueAtTime(Math.max(80,cutoff*.35),at+p.decay);
          out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(Math.max(.0002,amp),at+p.attack);out.gain.exponentialRampToValueAtTime(.0001,at+p.attack+p.decay);
          end=at+p.attack+p.decay+.05;
        }else{
          filter.frequency.setValueAtTime(p.env?cutoff+p.env:cutoff,at);if(p.env)filter.frequency.exponentialRampToValueAtTime(cutoff,at+.2);
          out.gain.setValueAtTime(0,at);out.gain.linearRampToValueAtTime(amp,at+p.attack);
          const hold=Math.max(at+p.attack,at+dur);out.gain.setValueAtTime(amp,hold);out.gain.setTargetAtTime(0,hold,p.release/4);
          end=hold+p.release*1.6;
        }
        for(const o of oscs){o.start(at);o.stop(end);}
        nodes.push(...oscs);oscs[0].onended=()=>this.release(g,nodes);
      }
      g.voices++;
    }
    release(g,nodes){g.voices=Math.max(0,g.voices-1);for(const n of nodes){try{n.disconnect();}catch{}}}
    percussion(g,note,at){
      const ctx=g.ctx,v=clamp(note.velocity,0,1)*(.6+.8*this.appliedOptions.texture);
      const out=ctx.createGain(),pan=ctx.createStereoPanner();pan.pan.value=clamp(note.pan||0,-1,1);out.connect(pan);pan.connect(g.dry);
      const nodes=[out,pan];let end;
      if(note.instrument==='kick'||note.instrument==='taiko'){
        const o=ctx.createOscillator();o.type='sine';const top=note.instrument==='taiko'?95:120,low=note.instrument==='taiko'?52:44,decay=note.instrument==='taiko'?.7:.32;
        o.frequency.setValueAtTime(top,at);o.frequency.exponentialRampToValueAtTime(low,at+.12);
        out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(v*.9,at+.004);out.gain.exponentialRampToValueAtTime(.0001,at+decay);
        if(note.instrument==='taiko'){const s=ctx.createGain();s.gain.value=.35;pan.connect(s);s.connect(g.reverbIn);nodes.push(s);}
        o.connect(out);end=at+decay+.02;o.start(at);o.stop(end);nodes.push(o);o.onended=()=>this.release(g,nodes);
      }else{
        const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter();src.buffer=g.noise;src.connect(filter);filter.connect(out);nodes.push(src,filter);
        const shape={hat:['highpass',8200,.0,.05,.22],shaker:['bandpass',5200,.012,.09,.16],snare:['bandpass',1900,.0,.16,.42],texture:['bandpass',900,note.duration*.5,note.duration*.5,.16],riser:['highpass',500,note.duration*.92,.08,.2]}[note.instrument]||['highpass',6000,0,.05,.2];
        const [type,freq,attack,decay,gain]=shape;filter.type=type;filter.frequency.value=freq;filter.Q.value=type==='bandpass'?1.2:.7;
        if(note.instrument==='riser'||note.instrument==='texture')filter.frequency.exponentialRampToValueAtTime(note.instrument==='riser'?7000:2400,at+attack);
        out.gain.setValueAtTime(.0001,at);out.gain.exponentialRampToValueAtTime(Math.max(.0002,v*gain),at+Math.max(.003,attack));out.gain.exponentialRampToValueAtTime(.0001,at+attack+decay);
        if(note.instrument==='texture'||note.instrument==='riser'){const s=ctx.createGain();s.gain.value=.5;pan.connect(s);s.connect(g.reverbIn);nodes.push(s);}
        end=at+attack+decay+.02;src.start(at,(note.midi*0.013)%0.8);src.stop(end);src.onended=()=>this.release(g,nodes);
      }
      g.voices++;
    }
    // Section and layer decisions happen on bar boundaries only, from smoothed state, so changes arrive musically.
    beginBar(){
      this.frame=this.requestedFrame||this.frame;
      this.appliedOptions={...this.options};
      const f=this.frame||{},score=window.ResonanceScore;
      this.energy=this.energy*.7+(f.controls?.energy||0)*.3;
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
      for(const x of figures)if(/^(milestone\.|validation\.test\.passed|repository\.commit)/.test(x.a.cue.type)&&x.a.cue.weight>=1)this.milestone=true;
      // At most two figures per step and a bar budget; lower-priority figures yield.
      return figures.slice(0,Math.min(2,barBudget.left)).map(x=>{barBudget.left--;return x.notes;});
    }
    schedule(){
      if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
      if(!this.anchored)this.anchor();
      let limit=0;
      while(this.nextTime<this.ctx.currentTime+.3&&limit++<32){
        if(!this.bar||this.step===0){this.beginBar();this.barStartTime=this.nextTime-this.step*this.stepSeconds();this.budget={left:6};
          if(this.entry){this.entry=false;if(this.step>0)this.playEntry();}}
        const stepDur=this.stepSeconds();
        const swing=this.step%2===1?(this.bar.swing||0)*stepDur:0;
        for(const event of this.bar.steps[this.step]||[]){
          if(event.instrument==='arp'&&this.appliedOptions.texture<.2)continue;
          if(['kick','snare','hat','shaker','taiko'].includes(event.instrument)&&this.appliedOptions.texture<.12)continue;
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
    // Offline render of a recorded performance: [{atMs, frame?, cue?}] sorted by time, starting at startMs.
    static async renderOffline({timeline,startMs,durationSec,style='ambient',texture=.58,volume=.7,sampleRate=44100,projectId='offline'}){
      const ctx=new OfflineAudioContext(2,Math.ceil(durationSec*sampleRate),sampleRate);
      const m=new ResonanceMusic();m.setProject(projectId);m.setOptions({style,texture,volume});m.appliedOptions={...m.options};
      m.ctx=ctx;const g=m.buildGraph(ctx,ctx.destination);m.graph=g;
      const stepDur=m.stepSeconds(),barMs=stepDur*STEPS*1000;
      let i=0;const events=timeline.slice().sort((a,b)=>a.atMs-b.atMs);
      m.barIndex=Math.ceil(startMs/barMs);let t=(m.barIndex*barMs-startMs)/1000;
      while(t<durationSec){
        const perf=startMs+t*1000;
        while(i<events.length&&events[i].atMs<=perf+stepDur*1000){if(events[i].frame)m.setFrame(events[i].frame);if(events[i].cue)m.accents.push({cue:events[i].cue,when:Math.max(t,(events[i].atMs-startMs)/1000)});i++;}
        if(m.step===0){m.beginBar();m.budget={left:6};}
        for(const e of m.bar.steps[m.step])m.voice(g,e,t+(m.step%2?(m.bar.swing||0)*stepDur:0));
        for(const notes of m.accentsFor(t,stepDur,m.budget))for(const n of notes)m.voice(g,n,t+n.offset*stepDur);
        m.step=(m.step+1)%STEPS;t+=stepDur;
      }
      return ctx.startRendering();
    }
  }
  window.ResonanceMusic=ResonanceMusic;
})();

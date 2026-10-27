/* Code Resonance: deterministic adaptive score. Pure JS usable in Node tests or a browser.
 *
 * A project's identity (key, mode, progressions, motif, tempo) is derived from its seed and never changes.
 * Long-term evolution (chapter) unlocks arrangement layers; current activity (energy) chooses how many of the
 * unlocked layers play; tension selects harmony. Everything is a pure function of its inputs, so a recorded
 * performance renders the same music every time.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResonanceScore=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  const SCORE_VERSION=2;
  const SCALE=[0,2,4,5,7,9,11];
  const ROOTS={'C#':49,D:50,E:52,'F#':54,G:55,A:57,B:59};
  const STYLES=new Set(['ambient','pulse','cinematic','chip']);
  const NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const MODES={ionian:[0,2,4,5,7,9,11],dorian:[0,2,3,5,7,9,10],lydian:[0,2,4,6,7,9,11],mixolydian:[0,2,4,5,7,9,10],aeolian:[0,2,3,5,7,8,10]};
  const MODE_WEIGHTS=[['ionian',3],['aeolian',3],['dorian',2],['lydian',2],['mixolydian',2]];
  const ROOT_PCS=[0,2,3,4,5,7,8,9,10];
  // Progressions are diatonic scale-degree roots (0 = tonic). Curated so any choice sounds settled.
  const HOME=[[0,4,5,3],[0,5,3,4],[5,3,0,4],[0,3,5,4],[0,2,3,4],[0,5,1,4],[0,3,0,4],[3,0,4,5],[0,4,1,3],[0,1,3,4],[5,4,3,0],[0,3,4,3],[0,5,2,3],[3,4,5,0]];
  const AWAY=[[3,4,2,5],[5,4,3,4],[1,4,0,5],[3,0,4,5],[2,5,3,4],[5,2,3,4],[1,3,4,4],[2,3,1,4]];
  const TENSION=[[5,3,4,4],[1,4,5,5],[3,3,4,4],[5,1,4,4]];
  const CADENCE=[[3,4,0,0],[1,4,0,0],[5,4,0,0]];
  const TEMPO={ambient:[72,86],pulse:[100,116],cinematic:[78,92],chip:[118,134]};
  // Motif rhythms: onsets within one 16-step bar, each with a duration in steps.
  const RHYTHMS=[[[0,3],[4,2],[6,2],[8,4],[12,4]],[[0,2],[2,2],[4,4],[10,2],[12,4]],[[0,4],[6,2],[8,2],[10,6]],[[0,3],[3,3],[6,2],[8,6],[14,2]],[[2,2],[4,2],[6,4],[12,4]],[[0,6],[6,2],[8,2],[12,4]]];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // Range limits move notes by octaves so they never leave the key.
  const fold=m=>{m=Math.round(m);while(m<25)m+=12;while(m>105)m-=12;return m;};
  function hash(value){let h=2166136261;const s=String(value);for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
  function random(seed){let x=seed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;}
  function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
  const pick=(r,list)=>list[Math.floor(r()*list.length)%list.length];
  function weighted(r,list){const total=list.reduce((a,[,w])=>a+w,0);let x=r()*total;for(const [v,w] of list){if((x-=w)<0)return v;}return list[0][0];}
  // Legacy helper kept for callers of the v1 API.
  function pitch(degree,octave=0,root='D',shift=0){
    const d=((degree%7)+7)%7,oct=Math.floor(degree/7);
    return clamp((ROOTS[root]||50)+SCALE[d]+oct*12+octave*12+shift,25,105);
  }
  const identities=new Map();
  function createIdentity(seed){
    seed=seed>>>0;
    if(identities.has(seed))return identities.get(seed);
    const r=rng(hash(`identity/${seed}`));
    const tonic=pick(r,ROOT_PCS),mode=weighted(r,MODE_WEIGHTS);
    // Motif: stepwise contour with at most one leap, beginning and ending on stable degrees.
    const rhythm=pick(r,RHYTHMS);const contour=[pick(r,[0,2,4])];
    let leapt=false;
    for(let i=1;i<rhythm.length;i++){
      let step=pick(r,[-2,-1,-1,1,1,2]);
      if(!leapt&&r()<0.25){step=pick(r,[-4,-3,3,4]);leapt=true;}
      contour.push(clamp(contour[i-1]+step,-3,7));
    }
    contour[contour.length-1]=pick(r,[0,2,4,7]);
    const answer=contour.map((d,i)=>i===contour.length-1?pick(r,[0,4]):d+(i%2?1:-1));
    const tempo={};for(const style of STYLES){const [lo,hi]=TEMPO[style];tempo[style]=lo+Math.floor(r()*(hi-lo+1));}
    const identity={seed,tonic,key:NAMES[tonic],mode,scale:MODES[mode],home:pick(r,HOME),away:pick(r,AWAY),tension:pick(r,TENSION),cadence:pick(r,CADENCE),
      motif:{rhythm,contour,answer},tempo,swing:r()<0.35?0.08:0};
    identities.set(seed,identity);if(identities.size>64)identities.delete(identities.keys().next().value);
    return identity;
  }
  // Scale degree -> MIDI note in the project's key and mode.
  function noteOf(identity,degree,octave){
    const d=((degree%7)+7)%7,oct=Math.floor(degree/7);
    return fold(48+identity.tonic+identity.scale[d]+12*(oct+octave));
  }
  function chordDegrees(chord){return [chord,chord+2,chord+4];}
  function nearestChordTone(degree,chord){
    const tones=chordDegrees(chord);let best=degree,dist=99;
    for(let o=-14;o<=14;o+=7)for(const t of tones){const c=t+o;if(Math.abs(c-degree)<dist){dist=Math.abs(c-degree);best=c;}}
    return best;
  }
  const SECTION_BARS=8;
  // The section is chosen from project state at its first bar; a stateless default is used without a conductor.
  function chooseSection({index=0,tension=0,energy=0,previous='home',milestone=false}={}){
    if(tension>=0.35)return 'tension';
    if(previous==='tension')return 'resolve';
    if(milestone)return 'lift';
    if(index%6===5&&energy<0.5)return 'breath';
    return index%4===2?'away':'home';
  }
  function progressionFor(identity,section){
    if(section==='tension')return identity.tension;
    if(section==='resolve')return identity.cadence;
    if(section==='away')return identity.away;
    return identity.home;
  }
  // Layer order: long-term chapters unlock; short-term energy selects among the unlocked layers.
  const LAYERS=[['pad',1,0],['motif',1,0],['bass',2,0],['arp',3,0.12],['lead',4,0.08],['hat',5,0.3],['counter',6,0.4],['drums',7,0.45],['texture',8,0.6]];
  function activeLayers(chapter,energy,style,section){
    const depth=clamp(Math.floor(chapter),1,12);
    let layers=LAYERS.filter(([,c,e])=>depth>=c&&energy>=e).map(([n])=>n);
    if(layers.includes('lead'))layers=layers.filter(n=>n!=='motif');
    if(style==='ambient')layers=layers.filter(n=>n!=='drums');
    if(style==='chip'&&depth>=2&&!layers.includes('hat'))layers.push('hat');
    if(section==='breath')layers=layers.filter(n=>['pad','motif','lead','bass'].includes(n));
    if(section==='lift'&&depth>=4)layers=[...new Set([...layers,'counter','arp'])];
    return layers;
  }
  // Instruments name musical roles; the synthesizer chooses each role's timbre per style.
  const INSTRUMENT={
    ambient:{pad:'pad',bass:'bass',arp:'arp',lead:'lead',motif:'bell',counter:'counter',hat:'shaker',drums:'kick',texture:'texture'},
    pulse:{pad:'pad',bass:'bass',arp:'arp',lead:'lead',motif:'bell',counter:'counter',hat:'hat',drums:'kick',texture:'texture'},
    cinematic:{pad:'pad',bass:'bass',arp:'arp',lead:'lead',motif:'bell',counter:'counter',hat:'shaker',drums:'taiko',texture:'texture'},
    chip:{pad:'pad',bass:'bass',arp:'arp',lead:'lead',motif:'bell',counter:'counter',hat:'hat',drums:'kick',texture:'texture'}
  };
  // Motif development: early chapters state the motif plainly; later ones transform it.
  const TRANSFORMS=['plain','transpose','fragment','invert','displace','retrograde','ornament','augment'];
  function developMotif(identity,phrase,bar,chapter,chord,answer){
    const base=answer?identity.motif.answer:identity.motif.contour;
    const available=TRANSFORMS.slice(0,clamp(1+chapter,2,TRANSFORMS.length));
    const t=available[hash(`${identity.seed}/develop/${phrase}/${bar}`)%available.length];
    let notes=identity.motif.rhythm.map(([step,len],i)=>({step,len,degree:base[i]}));
    if(t==='transpose')notes=notes.map(n=>({...n,degree:n.degree+chord}));
    if(t==='fragment')notes=[...notes.slice(0,3),...notes.slice(0,3).map(n=>({...n,step:n.step+8}))].filter(n=>n.step<16);
    if(t==='invert'){const pivot=notes[0].degree;notes=notes.map(n=>({...n,degree:2*pivot-n.degree}));}
    if(t==='displace')notes=notes.map(n=>({...n,step:n.step+2})).filter(n=>n.step<16);
    if(t==='retrograde'){const d=notes.map(n=>n.degree).reverse();notes=notes.map((n,i)=>({...n,degree:d[i]}));}
    if(t==='ornament')notes=notes.flatMap((n,i)=>i<notes.length-1&&n.len>=3?[{...n,len:n.len-1},{step:n.step+n.len-1,len:1,degree:n.degree+(notes[i+1].degree>n.degree?1:-1)}]:[n]);
    if(t==='augment')notes=notes.filter(n=>n.step<8).map(n=>({...n,step:n.step*2,len:Math.min(8,n.len*2)}));
    // Strong beats land on chord tones so the melody always agrees with the harmony.
    return {transform:t,notes:notes.map(n=>n.step%8===0?{...n,degree:nearestChordTone(n.degree,chord)}:n)};
  }
  function createBar({seed=0,motif,root,chapter=1,tension=0,energy=0,style='ambient',barIndex=0,section,sectionIndex,milestone=false,previousSection}={}){
    if(!STYLES.has(style))style='ambient';
    const identity=createIdentity(seed);
    const steps=Array.from({length:16},()=>[]);
    const depth=clamp(Math.floor(chapter),1,12),e=clamp(Number(energy)||0,0,1),t=clamp(Number(tension)||0,0,1);
    const sIndex=sectionIndex??Math.floor(barIndex/SECTION_BARS);
    section=section||chooseSection({index:sIndex,tension:t,energy:e,previous:previousSection,milestone});
    const progression=progressionFor(identity,section);
    const barInSection=((barIndex%SECTION_BARS)+SECTION_BARS)%SECTION_BARS;
    const chord=progression[Math.floor(barInSection/2)%4];
    const nextChord=progression[(Math.floor(barInSection/2)+1)%4];
    const inst=INSTRUMENT[style];
    const layers=activeLayers(depth,e,style,section);
    const r=rng(hash(`${seed}/${barIndex}/${style}`));
    const human=()=>0.9+r()*0.2;
    const add=(step,instrument,midi,velocity=.5,duration=.45,extra={})=>{if(step<0||step>15)return;steps[step].push({instrument,midi:fold(midi),velocity:clamp(velocity,0,1),duration:clamp(duration,.025,5),...extra});};
    const stepSec=60/((identity.tempo[style]||92)*4);
    const lift=section==='lift'?1.12:section==='breath'?0.8:1;
    // Tension colours harmony: suspended dominant and borrowed minor subdominant.
    const tones=chordDegrees(chord).map((d,i)=>{let n=noteOf(identity,d,-1);if(section==='tension'&&chord===4&&i===1)n+=1;if(section==='tension'&&chord===3&&i===1&&identity.scale[2]===4)n-=1;return n;});
    if(layers.includes('pad')&&barInSection%2===0){
      const len=16*stepSec*2*(style==='cinematic'?1.05:1);
      // Inversions keep the voices moving smoothly instead of jumping in parallel blocks.
      const inversion=hash(`${seed}/voicing/${sIndex}/${barInSection}`)%3;
      tones.forEach((n,i)=>add(0,inst.pad,n+(i<inversion?12:0),(.16+depth*.006)*lift*(i===0?1.1:1),len,{pan:[-.35,0,.35][i]}));
      if(depth>=6&&style!=='chip')add(0,inst.pad,noteOf(identity,chord+6,-1),.07*lift,len,{pan:.5});
    }
    if(layers.includes('bass')){
      const b=noteOf(identity,chord,-2);
      const pattern=style==='pulse'||style==='chip'?[0,3,6,8,11,14]:style==='cinematic'?[0,8]:[0,10];
      for(const s of pattern)add(s,inst.bass,s===14&&nextChord!==chord?noteOf(identity,nextChord,-2):b,(.3+e*.12)*human()*lift,stepSec*(style==='ambient'?8:style==='cinematic'?7:2.2));
    }
    const phrase=Math.floor(barIndex/4),call=barIndex%4===0||barIndex%4===2;
    if(layers.includes('motif')&&(barIndex%4===0||(section==='away'&&barIndex%4===2))){
      for(const n of developMotif(identity,phrase,barIndex%4,depth,chord,barIndex%4===2).notes)add(n.step,inst.motif,noteOf(identity,n.degree,1),.2*human(),stepSec*(n.len+3),{pan:.15});
    }
    if(layers.includes('lead')){
      // Call and response with breathing room: bars 1 and 3 of each four are answers or rests.
      const answerBar=barIndex%4===1&&e>0.35;
      if(call||answerBar){
        const dev=developMotif(identity,phrase,barIndex%4,depth,chord,answerBar);
        // The melody sits an octave above the pad and arpeggio so it stays the clearest line.
        const octave=section==='lift'?2:1;
        for(const n of dev.notes)add(n.step,inst.lead,noteOf(identity,n.degree,octave),(.26+e*.14)*human()*lift,stepSec*Math.max(1,n.len-.3),{pan:-.1});
        if(depth>=8&&layers.includes('texture'))for(const n of dev.notes.slice(0,3))add(n.step,inst.motif,noteOf(identity,n.degree,1),.08,stepSec*n.len,{pan:.3});
      }
    }
    if(layers.includes('arp')){
      const rate=e>0.55||style==='chip'?1:2;const shape=hash(`${seed}/arp`)%3;
      const cycle=shape===0?[0,1,2,1]:shape===1?[0,1,2,3]:[0,2,1,2];
      for(let s=0,i=0;s<16;s+=rate,i++){
        if(r()<0.12+0.2*(1-e))continue;
        const d=chordDegrees(chord).concat(chord+7)[cycle[i%4]];
        add(s,inst.arp,noteOf(identity,d,0),(.09+e*.06)*human(),stepSec*rate*1.6,{pan:(i%2?.45:-.45)*(style==='chip'?0:1)});
      }
    }
    if(layers.includes('counter')&&!call){
      const dev=developMotif(identity,phrase+101,barIndex%4,depth,chord,true);
      for(const n of dev.notes.filter((_,i)=>i%2===0))add(n.step,inst.counter,noteOf(identity,n.degree-7,1),.12*human(),stepSec*(n.len+1),{pan:.4});
    }
    if(layers.includes('hat')){
      const every=e>0.7?1:2;
      for(let s=every===1?0:2;s<16;s+=every)if(r()>0.18)add(s,inst.hat,42,(.04+e*.05)*(s%4===2?1.3:1)*human(),.04,{pan:.2});
    }
    if(layers.includes('drums')){
      if(inst.drums==='taiko'){add(0,'taiko',36,.32*lift,.4);if(barInSection%2===1)add(10,'taiko',38,.2,.3);}
      else{
        for(const s of style==='pulse'||style==='chip'?[0,4,8,12]:[0,8])add(s,'kick',36,(.26+e*.12)*lift,.12);
        for(const s of [4,12])add(s,'snare',40,(.13+e*.07)*human(),.13);
      }
    }
    if(layers.includes('texture')&&barInSection===SECTION_BARS-1)add(8,'texture',60,.07+e*.05,stepSec*8);
    return {schema:'code-resonance.bar.v1',scoreVersion:SCORE_VERSION,barIndex,style,chapter:depth,section,chord,layers,key:`${identity.key} ${identity.mode}`,steps,swing:identity.swing};
  }
  // Engineering events become short figures on the musical grid, harmonised with the current chord.
  const FIGURES={
    'symbol.created':{priority:2},'dependency.added':{priority:1},'validation.test.passed':{priority:4},'validation.test.failed':{priority:4},
    'validation.build.passed':{priority:3},'validation.build.failed':{priority:3},'milestone.refactor.validated':{priority:5},
    'repository.commit.observed':{priority:4},'agent.tool.completed':{priority:1},'agent.file.modified':{priority:2},'agent.prompt.submitted':{priority:1}
  };
  function accentFigure(cue,{seed=0,chord=0,style='ambient'}={}){
    const figure=FIGURES[cue.type];if(!figure)return [];
    const identity=createIdentity(seed);const d=cue.detail||{};
    const tones=chordDegrees(chord);const n=(deg,oct)=>noteOf(identity,deg,oct);
    const voice=Number.isInteger(d.voice)?d.voice:null;
    const agent=voice!==null?{instrument:'agent',voice,pan:[-.6,.6,-.3,.3,-.8,.8,0,-.45][voice%8]}:{};
    const out=(offset,instrument,midi,velocity,duration,extra={})=>({offset,instrument,midi:fold(midi),velocity:clamp(velocity,0,1),duration:clamp(duration,.025,5),priority:figure.priority,...extra});
    switch(cue.type){
      case 'symbol.created':{
        const big=['ui.component','api.route','class'].includes(d.symbolType);
        const octave=d.symbolType==='ui.component'?2:d.symbolType==='class'?0:1;
        if(!big)return [out(0,agent.instrument||'pluck',n(tones[hash(cue.id)%3],1),.13,.35,agent)];
        return [0,2,4].map((o,i)=>out(o,agent.instrument||'chime',n(tones[i],octave),.16-i*.02,.9,agent));
      }
      case 'dependency.added':return [out(0,'pluck',n(chord,1),.1,.3),out(2,'pluck',n(chord+4,1),.1,.5)];
      case 'validation.test.passed':case 'validation.build.passed':
        if((cue.weight||0)<0.5)return [out(0,'chime',n(tones[2],2),.07,.6)];
        return [0,2,4,7].map((deg,i)=>out(i*2,'chime',n(deg,2),.17-i*.015,1.4));
      case 'validation.test.failed':case 'validation.build.failed':return [out(0,'swell',n(chord,-1),.16,2.2),out(0,'swell',n(chord,-1)+1,.08,2.2)];
      case 'milestone.refactor.validated':return [...[4,2,0].map((deg,i)=>out(i*2,'chime',n(deg,2),.15,1.2)),out(6,'chime',n(7,2),.18,2.5),out(0,'riser',60,.1,2.5)];
      case 'repository.commit.observed':return [out(0,'riser',60,.08,2),out(8,'chime',n(0,2),.14,2),out(8,'chime',n(4,1),.1,2)];
      case 'agent.file.modified':return [out(0,'agent',n(tones[(voice||0)%3]+(voice||0)%2*7,1),.12,.5,agent)];
      case 'agent.tool.completed':case 'agent.prompt.submitted':return [out(0,'agent',n(tones[0]+7*((voice||0)%2),1),.06,.25,agent)];
      default:return [];
    }
  }
  return {createBar,createIdentity,accentFigure,chooseSection,activeLayers,hash,random,pitch,noteOf,SECTION_BARS,SCORE_VERSION,STYLES:[...STYLES]};
});

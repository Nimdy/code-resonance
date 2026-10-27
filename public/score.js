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
  /* ======================================== Score v3: long-form composition ========================================
   * v2 above is frozen: an identity created before v3 keeps that sound until it is deliberately upgraded. v3 keeps the
   * same identity (key, mode, progressions, motif, tempo) and the same engineering accents, and adds:
   *  - a form: arcs of twelve 8-bar passages, each arc a sequence of sections (statement, development, interlude,
   *    return, release) chosen per arc from the seed, so the music goes somewhere and comes back;
   *  - phrases: 4-bar antecedent/consequent periods built from the motif (stated, answered, sequenced, fragmented,
   *    inverted, augmented) with rests, a second idea per arc for developments, and cadences that close on the tonic
   *    when the music returns or releases;
   *  - voice-led harmony with constrained colour (diatonic sevenths, added ninths, a suspended fourth that resolves),
   *    a guide-tone countermelody, a bass that walks or holds a pedal;
   *  - roles (foundation, harmony, melody, counter, rhythm, percussion, atmosphere) that enter and leave at passage
   *    boundaries because the section calls for them, and dynamics that breathe over sections and phrases;
   *  - a performance profile (mood, evolution, melody, rhythm, atmosphere, harmony, dynamics, space, mix) that shapes
   *    all of this without touching the identity.
   * Everything stays a pure function of (seed, bar, style, profile, conducted state): live, replay, offline WAV and the
   * life driver agree. expression() exposes the same decisions to the visuals without generating notes. */
  const LATEST_VERSION=3,SCORE_VERSIONS=[2,3];
  const PASSAGE_BARS=8,PHRASE_BARS=4,ARC_BARS=96;
  const PROFILE={mood:.5,evolution:.5,melody:.5,rhythm:.5,atmosphere:.5,harmony:.5,dynamics:.5,space:.5};
  const GROUPS=['pad','bass','melody','counter','arp','perc','atmos'];
  function profileOf(p){
    const o={};for(const k in PROFILE){const v=Number(p?.[k]);o[k]=Number.isFinite(v)?clamp(v,0,1):PROFILE[k];}
    o.mix={};for(const g of GROUPS){const v=Number(p?.mix?.[g]);o.mix[g]=Number.isFinite(v)?clamp(v,0,1.5):1;}
    return o;
  }
  const versionOf=v=>v===3||v==='3'?3:2;
  // Forms: [role, passages] summing to one arc of twelve passages; `evo` places each between familiar (stating and
  // returning) and exploratory (developing). Evolution chooses among them per arc.
  const FORMS=[
    {name:'drift',evo:.1,plan:[['statement',3],['interlude',2],['return',3],['release',3],['interlude',1]]},
    {name:'song',evo:.35,plan:[['statement',2],['development',2],['return',2],['interlude',1],['statement',1],['release',2],['interlude',2]]},
    {name:'arch',evo:.55,plan:[['release',1],['statement',2],['development',3],['return',2],['release',2],['interlude',2]]},
    {name:'variations',evo:.75,plan:[['statement',2],['development',2],['interlude',1],['development',2],['return',2],['release',2],['interlude',1]]},
    {name:'journey',evo:.95,plan:[['statement',1],['development',3],['interlude',1],['development',2],['return',2],['release',2],['interlude',1]]}
  ];
  const forms=new Map();
  // Evolution is read in three bands so a small slider movement does not reshape the arc being played.
  function formOf(seed,arc,evolution){
    const band=evolution<.34?0:evolution<.67?1:2,key=`${seed}/${arc}/${band}`;
    if(forms.has(key))return forms.get(key);
    const e=[.2,.5,.85][band],r=rng(hash(`${seed}/form/${arc}`));
    const form=weighted(r,FORMS.map(f=>[f,Math.max(.04,1-Math.abs(f.evo-e)*1.8)]));
    forms.set(key,form);if(forms.size>256)forms.delete(forms.keys().next().value);
    return form;
  }
  // Where a bar sits in the form: arc, section (role, length, neighbours), passage, phrase.
  function planAt(seed,barIndex,evolution=.5){
    const b=Math.floor(Number(barIndex)||0),arc=Math.floor(b/ARC_BARS),inArc=b-arc*ARC_BARS,form=formOf(seed,arc,evolution);
    const p=Math.floor(inArc/PASSAGE_BARS);let start=0,i=0;
    for(;i<form.plan.length-1;i++){if(p<start+form.plan[i][1])break;start+=form.plan[i][1];}
    const [role,passages]=form.plan[i];
    const next=i+1<form.plan.length?form.plan[i+1][0]:formOf(seed,arc+1,evolution).plan[0][0];
    const prev=i>0?form.plan[i-1][0]:formOf(seed,arc-1,evolution).plan.at(-1)[0];
    const barInPassage=inArc%PASSAGE_BARS,passage=p-start;
    return {arc,form:form.name,section:arc*16+i,role,prev,next,passage,passages,barInPassage,barInSection:passage*PASSAGE_BARS+barInPassage,
      sectionBars:passages*PASSAGE_BARS,phrase:Math.floor(barInPassage/PHRASE_BARS),barInPhrase:barInPassage%PHRASE_BARS};
  }
  // The conductor, at passage boundaries: sustained trouble (tension from failures) takes the passage over and a
  // resolving passage follows it; a verified milestone lifts the next passage. Otherwise the form plays as planned.
  function conduct({seed=0,barIndex=0,profile,tension=0,previous=null,milestone=false}={}){
    const plan=planAt(seed,barIndex,profileOf(profile).evolution);
    const role=tension>=.35?'tension':previous==='tension'?'resolve':plan.role;
    return {...plan,planned:plan.role,role,lift:!!milestone&&role!=='tension'};
  }
  // A frame's verified successes (milestones, passing validations); failures never lift the music.
  const milestoneOf=f=>!!f?.milestones?.some(t=>/^milestone\./.test(t)||/^validation\.[a-z.]*passed$/.test(t));
  // The conducted state at a bar from frames the caller can look up, so the player, the offline renderer, the film and
  // the life driver all compute the same thing without sharing history: activity folded over the eight bars before
  // (the v2 .7/.3 fold, bounded), the passage's role from the tension at its start and at the previous passage's
  // start, and a lift when a verified milestone arrived during the previous passage.
  // frameAt(bar) -> {energy, tension, milestone} in force at that bar's start (the caller applies staleness), or null.
  function conductAt({seed=0,barIndex=0,profile,frameAt=()=>null}={}){
    const b=Math.floor(Number(barIndex)||0),start=b-((b%PASSAGE_BARS)+PASSAGE_BARS)%PASSAGE_BARS;
    let energy=0;for(let i=b-8;i<=b;i++)energy=energy*.7+(Number(frameAt(i)?.energy)||0)*.3;
    // Trouble in the last two bars before a boundary counts too, so a short failure is never lost between passages.
    const trouble=s=>Math.max(...[s-2,s-1,s].map(i=>Number(frameAt(i)?.tension)||0));
    let milestone=false;for(let i=start-PASSAGE_BARS;i<start&&!milestone;i++)milestone=!!frameAt(i)?.milestone;
    const c=conduct({seed,barIndex:b,profile,tension:trouble(start),previous:trouble(start-PASSAGE_BARS)>=.35?'tension':null,milestone});
    return {...c,energy,tension:Number(frameAt(b)?.tension)||0};
  }
  // Activity and the mood control together: calm keeps the arrangement sparse and soft-edged, intense adds motion.
  const effectiveEnergy=(energy,pf)=>clamp(.2+.6*(Number(energy)||0)+(pf.mood-.5)*.5,0,1);
  // How present each role is per section (0 = silent). Chapters (long-term progress) make roles available; the section
  // decides which of them the music needs now.
  const ORCH={
    statement:{pad:.8,bass:.8,melody:1,counter:0,arp:.45,perc:.5,atmos:.3},
    development:{pad:.7,bass:1,melody:.85,counter:.9,arp:.85,perc:.8,atmos:.35},
    interlude:{pad:.9,bass:.35,melody:.3,counter:0,arp:.3,perc:.15,atmos:1},
    return:{pad:.9,bass:1,melody:1,counter:.6,arp:.7,perc:.9,atmos:.5},
    release:{pad:1,bass:.45,melody:.6,counter:0,arp:0,perc:0,atmos:.8},
    tension:{pad:.85,bass:.9,melody:.6,counter:.5,arp:.6,perc:.55,atmos:.6},
    resolve:{pad:1,bass:.9,melody:1,counter:.45,arp:.4,perc:.45,atmos:.45}
  };
  const UNLOCK={pad:1,melody:1,atmos:1,bass:2,arp:3,counter:4,perc:5};
  function orchestrate(role,{chapter=1,energy=.5,profile,style='ambient',lift=false}={}){
    const o=ORCH[role]||ORCH.statement,depth=clamp(Math.floor(chapter)||1,1,12),pf=profileOf(profile),gate=.32-.3*(energy-.5),out={};
    for(const g of GROUPS){
      let v=depth>=UNLOCK[g]?o[g]:0;
      if(g==='perc')v*=(style==='ambient'?(pf.rhythm>.55?.6:0):1)*clamp(pf.rhythm*1.6,0,1.2)*(depth<6?.7:1);
      if(g==='arp')v*=clamp(.3+pf.rhythm*1.1,0,1.2);
      if(g==='atmos')v*=clamp(pf.atmosphere*1.7,0,1.3);
      if(g==='melody')v*=clamp(.55+pf.melody*.9,0,1.3);
      if(g==='counter')v*=clamp(.35+pf.evolution*.6+pf.melody*.3,0,1.2);
      if(lift&&(g==='counter'||g==='arp'||g==='melody')&&depth>=UNLOCK[g])v=Math.max(v,.75);
      v*=pf.mix[g];
      out[g]=v>=gate&&pf.mix[g]>0?clamp(v,0,1.3):0;
    }
    return out;
  }
  // Per-identity choices that v3 adds, drawn from their own stream so v2's identity is untouched.
  const identities3=new Map();
  function identity3(seed){
    seed=seed>>>0;if(identities3.has(seed))return identities3.get(seed);
    const id=createIdentity(seed),r=rng(hash(`identity3/${seed}`));
    const x={id,arp:pick(r,[[0,1,2,1],[0,1,2,3],[0,2,1,3],[2,1,0,1]]),walk:r()<.6,ninth:r()<.65,colors:[pick(r,['glass','harp','breath']),pick(r,['harp','glass','breath'])],
      groove:Math.floor(r()*3),echo:2+Math.floor(r()*2)};
    identities3.set(seed,x);if(identities3.size>64)identities3.delete(identities3.keys().next().value);
    return x;
  }
  // The second idea of an arc: the motif's rhythm reshaped and its contour mirrored, related to it but new.
  function secondary(x,arc){
    const r=rng(hash(`${x.id.seed}/secondary/${arc}`)),m=x.id.motif,rhythm=pick(r,RHYTHMS),pivot=m.contour[0];
    const degree=i=>{const src=m.contour[Math.min(m.contour.length-1,Math.round(i*(m.contour.length-1)/Math.max(1,rhythm.length-1)))];return clamp(2*pivot-src+(i===rhythm.length-1?0:pick(r,[0,0,1,-1])),-3,8);};
    return rhythm.map(([step,len],i)=>({step,len,degree:degree(i)}));
  }
  // Harmony of a passage, one chord per bar: a period whose second half closes on the tonic when the music returns or
  // releases; developments quicken the harmonic rhythm toward their end; interludes slow it down.
  function passageChords(x,plan,role,pf){
    const id=x.id,rot=(a,k)=>a.map((_,i)=>a[(i+k)%a.length]);
    const prog=role==='tension'?id.tension:role==='resolve'?id.cadence:role==='development'?(plan.passage%2?rot(id.away,2):id.away):plan.arc%2&&role==='statement'?rot(id.home,2):id.home;
    let bars=[0,0,1,1,2,2,3,3].map(i=>prog[i]);
    const closing=(role==='return'||role==='release'||role==='resolve')&&plan.passage===plan.passages-1;
    if(role==='interlude')bars=[prog[0],prog[0],prog[0],prog[0],prog[2],prog[2],prog[2],prog[2]];
    if(role==='development'&&plan.passage===plan.passages-1&&pf.harmony>.4)bars=[prog[0],prog[1],prog[2],prog[3],prog[0],prog[1],4,4];
    if(closing){bars[4]=id.cadence[0];bars[5]=4;bars[6]=bars[7]=0;}
    return {bars,closing};
  }
  // Chord colour stays inside the key: added ninths on tonic and subdominant, diatonic sevenths on the others, a
  // suspended fourth on a cadential dominant (it resolves within the bar). Chip stays mostly in plain triads.
  function colourOf(chord,{pf,style,cadential,x}){
    const h=pf.harmony;if(style==='chip'&&h<.7)return null;
    if(cadential&&chord===4&&h>.25)return 'sus4';
    if(h>.3&&(chord===0||chord===3)&&x.ninth)return 'add9';
    if(h>.45&&(chord===1||chord===2||chord===5))return 'seventh';
    if(h>.62&&(chord===4||chord===0))return 'seventh';
    return null;
  }
  function chordTones(chord,colour){
    if(colour==='sus4')return [chord,chord+3,chord+4];
    if(colour==='seventh')return [chord,chord+2,chord+4,chord+6];
    if(colour==='add9')return [chord,chord+2,chord+4,chord+8];
    return [chord,chord+2,chord+4];
  }
  // Voice leading: each chord takes the voicing nearest the one before it within a band around middle C, so voices
  // move by step instead of jumping in parallel blocks; a passage's first chord settles near the centre.
  function voiceChord(id,degrees,prev,center=62){
    const base=degrees.map(d=>noteOf(id,d,0)).sort((a,b)=>a-b);let best=null,score=Infinity;
    for(let k=0;k<base.length;k++)for(const shift of [-24,-12,0,12]){
      const v=base.map((n,i)=>n+(i<k?12:0)+shift).sort((a,b)=>a-b);
      if(v[0]<50||v.at(-1)>81)continue;
      const mean=v.reduce((a,b)=>a+b,0)/v.length;
      const s=prev?v.reduce((a,n,i)=>a+Math.abs(n-(prev[Math.min(i,prev.length-1)])),0)+Math.abs(mean-center)*.15:Math.abs(mean-center);
      if(s<score){score=s;best=v;}
    }
    return best||base;
  }
  // What the melody does in each bar of a phrase (0 = antecedent, 1 = consequent); '-' is a rest. 'open' ends a phrase
  // on a chord tone that asks for more, 'close' on the tonic, 'end' on the chord's root.
  const PHRASES={
    statement:[['plain','tail','answer','open'],['plain','-','answer','end']],
    development:[['sequence','sequence2','secondary','open'],['secondary','fragment','invert','open']],
    interlude:[['-','-','fragment','-'],['-','tail','-','-']],
    return:[['plain','tail','answer','open'],['ornament','tail','answer','close']],
    release:[['augment','-','-','close'],['-','fragment','-','-']],
    tension:[['fragment','displace','fragment2','open'],['invert','fragment','displace','open']],
    resolve:[['plain','tail','answer','open'],['plain','ornament','answer','close']]
  };
  function melodyCell(x,kind,{chord,arc}){
    const m=x.id.motif,plain=m.rhythm.map(([step,len],i)=>({step,len,degree:m.contour[i]}));
    switch(kind){
      case 'plain':return plain;
      case 'answer':return m.rhythm.map(([step,len],i)=>({step,len,degree:m.answer[i]}));
      case 'ornament':return plain.flatMap((n,i)=>i<plain.length-1&&n.len>=3?[{...n,len:n.len-1},{step:n.step+n.len-1,len:1,degree:n.degree+(plain[i+1].degree>n.degree?1:-1)}]:[n]);
      case 'sequence':return plain.map(n=>({...n,degree:n.degree+chord}));
      case 'sequence2':return plain.map(n=>({...n,degree:n.degree+chord-1}));
      case 'invert':{const p=plain[0].degree;return plain.map(n=>({...n,degree:2*p-n.degree}));}
      case 'fragment':case 'fragment2':{const up=kind==='fragment2'?2:1,head=plain.filter(n=>n.step<8).slice(0,3);
        return [...head,...head.map(n=>({...n,step:n.step+8,degree:n.degree+up}))].filter(n=>n.step<16);}
      case 'displace':return plain.map(n=>({...n,step:n.step+2})).filter(n=>n.step<16);
      case 'augment':return plain.filter(n=>n.step<8).map(n=>({...n,step:n.step*2,len:Math.min(8,n.len*2)}));
      case 'tail':{const t=plain.slice(-2);return [{step:2,len:4,degree:t[0].degree},{step:8,len:8,degree:t[1].degree}];}
      case 'secondary':return secondary(x,arc);
      case 'open':return [{step:0,len:2,degree:chord+5},{step:2,len:14,degree:chord+4}];
      case 'close':return [{step:0,len:2,degree:1},{step:2,len:14,degree:0}];
      case 'end':return [{step:0,len:16,degree:chord}];
      default:return [];
    }
  }
  // Dynamics per section role in dB: [at its start, at its end]. The dynamics control scales the contrast.
  const DYN={statement:[-2.5,-1],development:[-4.5,0],interlude:[-7,-6],return:[-.5,-1.5],release:[-3,-10],tension:[-3,-.5],resolve:[-1,-3]};
  function levelAt(role,plan,step,pf){
    const [a,b]=DYN[role]||DYN.statement,t=(plan.barInSection+step/16)/plan.sectionBars,depth=.35+1.3*pf.dynamics;
    const arch=Math.sin(Math.PI*(plan.barInPhrase+step/16)/PHRASE_BARS)*1.4*pf.dynamics;
    return Math.pow(10,((a+(b-a)*t)*depth+arch-1)/20);
  }
  // Harmonic tension of a chord function (tonic rests, dominant pulls), coloured by the section and the harmony control.
  const FUNCTION_TENSION=[.05,.5,.25,.4,.7,.3,.85];
  function barState({seed=0,barIndex=0,style='ambient',profile,section,lift=false,energy=0,chapter=1}={}){
    if(!STYLES.has(style))style='ambient';
    const pf=profileOf(profile),x=identity3(seed),plan=planAt(seed,barIndex,pf.evolution);
    const role=ORCH[section]?section:plan.role,e=effectiveEnergy(energy,pf);
    const orch=orchestrate(role,{chapter,energy:e,profile:pf,style,lift});
    const {bars,closing}=passageChords(x,plan,role,pf);
    return {pf,x,plan,role,e,orch,bars,closing,chord:bars[plan.barInPassage],lift};
  }
  // The musical expression of a moment, for the visuals and the life driver: pure, cheap, no notes generated.
  // `phase` is the position within the bar (0..1). All values are 0..1 unless named otherwise.
  function expression(opts={}){
    const s=barState(opts),{plan,role,orch,pf}=s,phase=clamp(Number(opts.phase)||0,0,.999);
    const cadential=s.bars[plan.barInPassage+1]===0&&s.chord===4;
    const tension=clamp(FUNCTION_TENSION[((s.chord%7)+7)%7]*(.6+.6*pf.harmony)+(role==='tension'?.3:0)+(cadential?.1:0)-(role==='release'?.15:0),0,1);
    const density=clamp((orch.pad*.6+orch.bass*.8+orch.melody+orch.counter*.8+orch.arp+orch.perc+orch.atmos*.6)/5.4,0,1);
    const cell=(PHRASES[role]||PHRASES.statement)[plan.phrase][plan.barInPhrase];
    const melody=orch.melody?clamp((cell==='-'?0:cell==='tail'||cell==='open'||cell==='close'||cell==='end'?.35:.85)*(.6+.5*pf.melody),0,1):0;
    const rhythm=clamp(orch.perc*.6+orch.arp*.5,0,1)*(.5+.6*pf.rhythm);
    const sectionProgress=(plan.barInSection+phase)/plan.sectionBars,last=plan.sectionBars-plan.barInSection;
    const changing=plan.next!==role;
    return {version:3,role,planned:plan.role,form:plan.form,arc:plan.arc,section:plan.section,next:plan.next,lift:!!s.lift,
      sectionProgress,passageProgress:(plan.barInPassage+phase)/PASSAGE_BARS,phrase:plan.phrase,barInPhrase:plan.barInPhrase,
      beat:Math.floor(phase*4),beatPhase:(phase*4)%1,pulse:Math.pow(1-(phase*4)%1,3),barPulse:Math.pow(1-phase,2),
      energy:s.e,tension,density,melody,rhythm,dynamics:clamp((20*Math.log10(levelAt(role,plan,phase*16,pf))+11)/11,0,1),
      transition:changing&&last<=2?clamp((2-last+phase)/2,0,1):0,onset:plan.barInSection===0&&plan.prev!==role?1-phase:0,
      release:role==='release'?.5+.5*sectionProgress:s.closing&&plan.barInPassage>=6?.6:0,chord:s.chord};
  }
  function createBarV3(opts={}){
    let {seed=0,chapter=1,style='ambient',barIndex=0,tempo}=opts;
    if(!STYLES.has(style))style='ambient';
    const s=barState({...opts,style}),{pf,x,plan,role,orch,bars,chord,closing}=s,id=x.id,e=s.e;
    const steps=Array.from({length:16},()=>[]),r=rng(hash(`${seed}/v3/${barIndex}/${style}`));
    const stepSec=60/((Number(tempo)||id.tempo[style]||92)*4),human=()=>.92+r()*.16;
    const add=(step,instrument,group,midi,velocity,duration,extra={})=>{step=Math.round(step);if(step<0||step>15||!(velocity>0))return;
      steps[step].push({instrument,group,midi:fold(midi),velocity:clamp(velocity*levelAt(role,plan,step,pf),0,1),duration:clamp(duration,.025,5),...extra});};
    const b=plan.barInPassage,nextChord=bars[b+1]??bars[0],chordStart=b===0||bars[b-1]!==chord,chordBars=bars.slice(b).findIndex(c=>c!==chord);
    const holdBars=chordBars<0?bars.length-b:chordBars,after=chordBars<0?(closing?0:null):bars[b+chordBars];
    const cadential=chord===4&&after===0;
    const colour=colourOf(chord,{pf,style,cadential,x}),tones=chordTones(chord,colour);
    const legato=style==='ambient'||style==='cinematic';
    // Pad: the voice-led chord on each chord change, held until the next; a suspended fourth resolves at mid-bar.
    let voicing=null;
    {let prev=null;for(let i=0;i<=b;i++)if(i===0||bars[i]!==bars[i-1])prev=voiceChord(id,chordTones(bars[i],colourOf(bars[i],{pf,style,cadential:false,x})),prev);voicing=prev;}
    if(orch.pad&&chordStart){
      const len=16*stepSec*holdBars*(style==='cinematic'?1.04:1),v=(.15+orch.pad*.05)*(style==='chip'?.8:1),third=noteOf(id,chord+2,0)%12;
      voicing.forEach((n,i)=>{const pan=[-.4,-.12,.12,.4][i]??0;
        // The suspended fourth: the third's voice starts a step up and falls to the third at mid-bar.
        if(colour==='sus4'&&n%12===third){add(0,'pad','pad',n+(id.scale[(chord+3)%7]-id.scale[(chord+2)%7]+12)%12,v,stepSec*8,{pan});add(8,'pad','pad',n,v*.9,len-stepSec*8,{pan});}
        else add(0,'pad','pad',n,v*(i===0?1.05:1),len,{pan});});
    }
    // Atmosphere: a high shimmer over chord changes, and sparse details from the arc's colour.
    if(orch.atmos){
      if(chordStart&&(role==='interlude'||role==='release'||role==='return'||pf.atmosphere>.6))
        for(const [d,pan] of [[chord+4,-.5],[chord+8,.5]])add(0,'air','atmos',noteOf(id,d,1),.045*orch.atmos,16*stepSec*holdBars,{pan});
      const color=x.colors[plan.arc&1],count=role==='interlude'||role==='release'?1+Math.floor(r()*(1+pf.atmosphere*2.5)):r()<pf.atmosphere*.6?1:0;
      for(let i=0;i<count;i++){const step=[2,6,10,13,4,14][(hash(`${seed}/glint/${barIndex}/${i}`))%6],d=tones[(i+barIndex)%tones.length]+(r()<.5?7:0);
        add(step,color,'atmos',noteOf(id,d,1),(.05+.04*r())*orch.atmos,stepSec*(color==='breath'?10:6),{pan:(r()*2-1)*.7});}
    }
    // Foundation: root (or the nearer chord tone, for a walking line), held in ambient and cinematic, patterned in
    // pulse and chip; interludes and releases hold a tonic pedal; an approach note leads into a chord change.
    if(orch.bass){
      const pedal=role==='interlude'||(role==='release'&&!closing);
      let deg=pedal?0:chord;
      if(!pedal&&x.walk&&pf.harmony>.4&&(role==='development'||role==='return')&&b%2===1&&chord!==0)deg=chord+2;
      const root=noteOf(id,deg,-1),v=(.3+e*.1)*(style==='cinematic'?1.05:1);
      const pattern=style==='ambient'?(chordStart||pedal&&b%2===0?[0]:[]):style==='cinematic'?(role==='development'||role==='tension'?[0,6,8,14]:[0,8])
        :style==='chip'?[0,2,4,6,8,10,12,14]:pf.rhythm<.35||role==='release'?[0,8]:[[0,3,6,8,11,14],[0,6,8,10,14],[0,2,6,8,11,14]][(x.groove+plan.arc)%3];
      for(const step of pattern){
        const octave=(style==='chip'&&step%4===2)||(style==='pulse'&&step===14&&pf.rhythm>.6)?12:0;
        const len=style==='ambient'?16*stepSec*(pedal?2:holdBars):style==='cinematic'?stepSec*(pattern.length>2?5:7.5):stepSec*(style==='chip'?1.6:2.2);
        add(step,'bass','bass',root+octave,v*human()*(step%8===0?1:.82),len);
      }
      if(!pedal&&nextChord!==chord&&pf.harmony>.3&&style!=='chip'&&b%2===1){
        const target=nextChord+(nextChord>chord?-1:1);add(14,'bass','bass',noteOf(id,target,-1),v*.7,stepSec*2);}
    }
    // Melody: the phrase plan, strong beats on chord tones, phrase endings held, rests where the plan breathes.
    const melodyKind=(()=>{let k=(PHRASES[role]||PHRASES.statement)[plan.phrase][plan.barInPhrase];
      const roll=random(hash(`${seed}/m/${barIndex}`));
      if(pf.melody<.35&&(k==='tail'||(k==='answer'&&plan.phrase===0))&&roll<.7-pf.melody)k='-';
      if(pf.melody>.7&&k==='-'&&role!=='interlude'&&role!=='release'&&roll<pf.melody-.4)k='tail';
      if((k==='plain'||k==='answer')&&!(role==='return'&&plan.phrase===0)&&roll<.1+.45*pf.evolution)k=k==='plain'?(roll<.25?'ornament':'displace'):'ornament';
      return k;})();
    let melodyNotes=[];
    if(orch.melody&&melodyKind!=='-'){
      // Cadence figures keep their leaning first note (an appoggiatura); everything else lands on chord tones on strong beats.
      const cadence=melodyKind==='open'||melodyKind==='close'||melodyKind==='end';
      melodyNotes=melodyCell(x,melodyKind,{chord,arc:plan.arc}).map(n=>!cadence&&n.step%8===0?{...n,degree:nearestChordTone(n.degree,chord)}:n);
      if(melodyKind==='close'&&chord!==0)melodyNotes=melodyNotes.map(n=>n.step>0?{...n,degree:nearestChordTone(n.degree,chord)}:n);
      const nextRest=(PHRASES[role]||PHRASES.statement)[plan.phrase][plan.barInPhrase+1]==='-';
      const instrument=role==='interlude'||role==='release'?'bell':'lead';
      const octave=s.lift?2:1,v=(instrument==='bell'?.2:.27+e*.1)*orch.melody*(.75+.4*pf.melody);
      melodyNotes.forEach((n,i)=>{
        const nextStep=i+1<melodyNotes.length?melodyNotes[i+1].step:16+(nextRest?8:0);
        const len=legato?Math.max(n.len,(nextStep-n.step)-.4):Math.max(.8,n.len-.4);
        add(n.step,instrument,'melody',noteOf(id,n.degree,octave),v*human()*(n.step%4===0?1:.88),stepSec*len,{pan:-.08});
        // Chip echo: the line repeated a dotted step later, quieter and on the other side.
        if(style==='chip'&&(role==='development'||pf.melody>.6))add(n.step+x.echo,instrument,'melody',noteOf(id,n.degree,octave),v*.32,stepSec*Math.min(len,2),{pan:.5});
        // A soft bell doubles a returning melody an octave up.
        if(role==='return'&&plan.phrase===0&&orch.atmos&&n.step%4===0)add(n.step,'bell','atmos',noteOf(id,n.degree,octave+1),v*.22,stepSec*(n.len+3),{pan:.3});
      });
    }
    // Countermelody: guide tones (thirds, sevenths) moving by step, mostly where the melody rests or holds.
    if(orch.counter){
      const guide=(()=>{let g=bars[0]+2;for(let i=1;i<=b;i++){const c=bars[i],cand=[c+2,c+4].concat(pf.harmony>.45?[c+6]:[]);let best=cand[0],d=99;
        for(const t of cand)for(const o of [-7,0,7]){const k=t+o;if(Math.abs(k-g)<d){d=Math.abs(k-g);best=k;}}g=best;}return clamp(g,-2,9);})();
      const sparse=melodyNotes.length<=2;
      const v=.13*orch.counter*(style==='cinematic'?1.15:1);
      if(sparse){add(0,'counter','counter',noteOf(id,guide,0),v*human(),stepSec*7.6,{pan:.38});add(8,'counter','counter',noteOf(id,guide+(nextChord>chord?1:-1),0),v*.9*human(),stepSec*7.6,{pan:.38});}
      else add(8,'counter','counter',noteOf(id,guide,0),v*.85*human(),stepSec*7.6,{pan:.38});
    }
    // Rhythmic support: a broken chord whose pattern and rate are each style's own.
    if(orch.arp){
      const src=voicing.concat(voicing[0]+12),cycle=x.arp,v=(.075+e*.05)*orch.arp;
      if(style==='ambient'){for(let s=0,i=0;s<16;s+=4,i++){if(random(hash(`${seed}/arp/${barIndex}/${s}`))<.45-.3*pf.rhythm)continue;add(s+(i%2?2:0),'arp','arp',src[cycle[i%4]%src.length]+12,v*human(),stepSec*6,{pan:i%2?.4:-.4});}}
      else if(style==='cinematic'){const ost=[noteOf(id,chord,0),noteOf(id,chord+4,0)];for(let s=0;s<16;s+=role==='development'||role==='tension'?1:2)add(s,'arp','arp',ost[(s>>1)%2]-12+(s%2?12:0),v*1.1*(s%4===0?1.2:.8),stepSec*.8,{pan:s%4<2?-.3:.3});}
      else if(style==='pulse'){const acc=[0,3,6,8,11,14];for(let s=0;s<16;s+=pf.rhythm>.4||role==='development'?1:2){if(random(hash(`${seed}/arp/${barIndex}/${s}`))<.1)continue;add(s,'arp','arp',src[cycle[s%4]%src.length],v*(acc.includes(s)?1.25:.75),stepSec*1.3,{pan:s%2?.4:-.4});}}
      else{for(let s=0;s<16;s++)add(s,'arp','arp',src[s%3]+12,v*.9*(s%4===0?1.2:1),stepSec*.9,{pan:0});}
    }
    // Percussion: patterns change with the section, drop out where the music breathes, and fill into a change.
    if(orch.perc){
      const p=orch.perc,fill=plan.barInSection===plan.sectionBars-1&&plan.next!==role&&(plan.next==='return'||plan.next==='development');
      if(style==='ambient'){for(const s of [2,6,10,14])if(random(hash(`${seed}/sh/${barIndex}/${s}`))<.7)add(s,'shaker','perc',42,.05*p*human(),.05,{pan:.25});}
      else if(style==='cinematic'){
        if(plan.barInSection===0&&(role==='development'||role==='return'||role==='tension'))add(0,'taiko','perc',36,.34*p,.5);
        if((role==='development'||role==='tension')&&b%2===1)add(10,'taiko','perc',38,.18*p,.35);
        if(fill)for(const s of [8,10,12,13,14,15])add(s,'taiko','perc',38,(.1+.02*(s-8))*p,.25);
      }else{
        const half=role==='interlude'||role==='release'||pf.rhythm<.3;
        const kicks=half?[0]:style==='chip'?[0,8]:role==='development'?[0,6,8,14]:[[0,8],[0,8,11],[0,10]][(x.groove+b)%3];
        for(const s of kicks)add(s,'kick','perc',36,(.24+e*.08)*p*(s===0?1:.85),.12);
        if(!half)for(const s of [4,12])add(s,'snare','perc',40,(.12+e*.05)*p*human(),.13);
        const hatEvery=pf.rhythm>.7&&!half?1:2;
        for(let s=hatEvery===1?0:2;s<16;s+=hatEvery)if(!(half&&s%4!==2)&&random(hash(`${seed}/hat/${barIndex}/${s}`))>.12)add(s,'hat','perc',42,(.035+e*.04)*p*(s%4===2?1.3:1)*human(),.04,{pan:.2});
        if(fill)for(const s of [12,13,14,15])add(s,'snare','perc',40,(.08+.03*(s-12))*p,.1);
      }
    }
    // Transitions: a swell rises into a denser section, a wash opens a return, and a release begins with a soft swell.
    if(pf.mix.atmos>0){
      if(plan.barInSection===plan.sectionBars-1&&plan.next!==role&&(plan.next==='development'||plan.next==='return'||plan.next==='statement'))add(0,'riser','atmos',60,(.08+.04*pf.dynamics)*pf.mix.atmos,stepSec*16);
      if(plan.barInSection===0&&role==='return'&&plan.prev!=='return')add(0,'wash','atmos',60,.1*pf.mix.atmos,stepSec*24);
      if(plan.barInSection===0&&role==='release'&&plan.prev!=='release')add(0,'swell','atmos',noteOf(id,0,0),.09*pf.mix.atmos,stepSec*24);
    }
    return {schema:'code-resonance.bar.v1',scoreVersion:3,barIndex,style,chapter:clamp(Math.floor(chapter)||1,1,12),section:role,chord,
      layers:GROUPS.filter(g=>orch[g]),key:`${id.key} ${id.mode}`,steps,swing:style==='ambient'?0:id.swing,
      form:{arc:plan.arc,name:plan.form,role,planned:plan.role,passage:plan.passage,passages:plan.passages,bar:plan.barInSection,next:plan.next},
      expression:expression({...opts,style,phase:0})};
  }
  const createBarV2=createBar;
  function createBarAny(opts={}){return versionOf(opts.scoreVersion)===3?createBarV3(opts):createBarV2(opts);}
  return {createBar:createBarAny,createIdentity,accentFigure,chooseSection,activeLayers,hash,random,pitch,noteOf,SECTION_BARS,SCORE_VERSION,STYLES:[...STYLES],
    LATEST_VERSION,SCORE_VERSIONS,PROFILE,GROUPS,PASSAGE_BARS,ARC_BARS,profileOf,planAt,conduct,conductAt,milestoneOf,orchestrate,expression,versionOf};
});

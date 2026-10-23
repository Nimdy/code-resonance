/* Code Resonance: deterministic score generator. Pure JS usable in Node tests or a browser. */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResonanceScore=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  const SCALE=[0,2,4,5,7,9,11];
  const ROOTS={'C#':49,D:50,E:52,'F#':54,G:55,A:57,B:59};
  const STYLES=new Set(['ambient','pulse','cinematic','chip']);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function hash(value){let h=2166136261;const s=String(value);for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
  function random(seed){let x=seed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;}
  function pitch(degree,octave=0,root='D',shift=0){
    const d=((degree%7)+7)%7,oct=Math.floor(degree/7);
    return clamp((ROOTS[root]||50)+SCALE[d]+oct*12+octave*12+shift,25,105);
  }
  function createBar({seed=0,motif=[0,2,4,1],root='D',chapter=1,tension=0,energy=0,style='ambient',barIndex=0}={}){
    if(!STYLES.has(style))style='ambient';
    const steps=Array.from({length:16},()=>[]);
    const depth=clamp(Math.floor(chapter),1,12),e=clamp(Number(energy)||0,0,1),t=clamp(Number(tension)||0,0,1);
    const stable=Array.isArray(motif)&&motif.length===4?motif.map(n=>clamp(Math.floor(Number(n)||0),0,6)):[0,2,4,1];
    const progression=[0,3,4,2],chord=progression[barIndex%4],minorShift=t>.57&&barIndex%4===3?-1:0;
    const rnd=k=>random(hash(`${seed}/${barIndex}/${style}/${k}`));
    const add=(step,instrument,midi,velocity=.5,duration=.45)=>steps[step].push({instrument,midi:Math.round(midi),velocity:clamp(velocity,0,1),duration:clamp(duration,.025,5)});
    // Harmony is an enduring memory of the project, not a random response to each keypress.
    if(style!=='chip'){
      const chordDegrees=[chord,chord+2,chord+4];
      chordDegrees.forEach((d,i)=>add(0,'pad',pitch(d,-1,root,minorShift),.16+depth*.009+(i===0?.025:0),style==='cinematic'?3.9:2.9));
    }
    const leadSteps=style==='ambient'?[0,6,10]:style==='cinematic'?[0,4,8,12]:style==='chip'?[0,2,4,6,8,10,12,14]:[0,3,6,8,11,14];
    for(const s of leadSteps){
      const hit=style==='ambient'&&rnd(s+7)<.18&&depth<3?false:true;
      if(!hit)continue;
      const degree=stable[Math.floor((barIndex*2+s/4))%4];
      const ornament=depth>=4&&rnd(s+20)>.74?2:0;
      add(s,'lead',pitch(degree+ornament,style==='chip'?1:0,root,minorShift),.29+e*.18+(s===0?.09:0),style==='ambient'?1.1:style==='cinematic'?.73:.27);
    }
    if(depth>=2){
      for(let s=0;s<16;s+=4)add(s,'bass',pitch(chord,-2,root,minorShift),.3+e*.1,.40);
    }
    if(depth>=3){
      const stride=style==='ambient'?4:2;
      for(let s=1;s<16;s+=stride){
        if(rnd(s*5)>.2)add(s,'arp',pitch(stable[(s+barIndex)%4]+(s%4===1?7:0),0,root,minorShift),.085+e*.045,.16);
      }
    }
    if(depth>=2&&style!=='ambient'){
      for(const s of [0,4,8,12])add(s,'kick',36,.23+e*.12,.1);
      if(depth>=3)for(const s of [4,12])add(s,'snare',40,.18+e*.07,.13);
      if(depth>=4||style==='chip')for(let s=0;s<16;s+=2)add(s,'hat',42,.05+e*.06,.04);
    }
    if(depth>=5&&style==='cinematic')for(const s of [2,6,10,14])add(s,'accent',pitch(chord+4,1,root),.14,.6);
    return {schema:'code-resonance.bar.v1',barIndex,style,chapter:depth,steps};
  }
  return {createBar,hash,pitch,STYLES:[...STYLES]};
});

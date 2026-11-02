// Genesis (preview): the score as excitation of matter, pure (no THREE, no rendering): tests/genesis.test.js pins it.
// Design brief: docs/worlds/genesis.md, Music.
//
// The notes are the score's own (ctx.musicBar: the bars the performer plays, musical.js), read at the performance time,
// never from the audio: muted, offline or live, a moment excites the same matter. Each voice has its own physical role:
//  - bass      -> a chamber breathes: its inner light swells and rings at the chamber's frequency (elasticity), dying
//                 away (viscosity); the chamber is the one whose resonant degree the note's degree is (genesis-laws.js
//                 degreeOf: the first chambers answer tonic and fifth), the largest of them
//  - melody    -> a standing wave on a smaller chamber's wall (its order from the note's register and the resonance law):
//                 as the line moves, the wave moves from chamber to chamber
//  - counter   -> the septum between that chamber and the next rings in concentric waves
//  - pad       -> the chord's tones colour their chambers with a slow, held glow (the harmony as which chambers resonate)
//  - arpeggio  -> the light along the threads quickens on each note
//  - percussion-> a kick is a low thump through the whole structure, hats and shakers a sparkle in the pores
// Coupling: a chamber's ring leaks into the chambers a dependency couples it to, a moment later (the coupling law's leak
// and delay). Harmonic tension (the score's expression) detunes the chambers against each other (beating, less coherence);
// a resolution brings them back into phase.
import {degreeOfMidi} from './genesis-laws.js';
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const env=(age,att,dec)=>age<0?0:(1-Math.exp(-age/att))*Math.exp(-age/dec);
// The chamber a note of degree d excites: those whose resonant degree it is (the largest for a low voice, the smallest for
// a high one); without one (fewer than seven chambers), the d-th chamber in order (so every degree has a home).
export function chamberFor(chambers,d,low){
  if(!chambers.length||d===null)return -1;let best=-1;
  for(let k=0;k<chambers.length;k++)if(chambers[k].degree===d&&(best<0||(low?chambers[k].r>chambers[best].r:chambers[k].r<chambers[best].r)))best=k;
  return best>=0?best:d%chambers.length;
}
// What the music does to each chamber at performance time t (ms). `bar(b)` the score's bar b (or null), `key` the score's
// key, `barMs` a bar's length, `speed` the replay speed (decays are view seconds), `couple(i, j)` 0..1.
export function resonanceAt(t,{bar,key,barMs,speed=1,book,chambers,expression=null,couple=()=>0}){
  const n=chambers.length,R=book.ring,out={mono:new Float32Array(n),mode:new Float32Array(n),l:new Float32Array(n).fill(R.lmin),phase:new Float32Array(n),
    tone:new Float32Array(n),pad:new Float32Array(n),arp:0,thump:0,spark:0,coherence:1,notes:0};
  if(!n||!(barMs>0))return out;
  const tension=clamp(expression?.tension??0),release=clamp(expression?.release??0);
  out.coherence=clamp(1-.85*tension+.35*release);
  const sample=(T,acc,now)=>{const b0=Math.floor(T/barMs),step=barMs/16;const latest=new Float64Array(n).fill(-Infinity);
    for(let b=b0-2;b<=b0;b++){const x=bar?bar(b):null;if(!x?.steps)continue;
      for(let s=0;s<16;s++)for(const note of x.steps[s]||[]){const at=b*barMs+s*step;if(at>T)continue;const age=(T-at)/1000/speed,v=clamp(note.velocity*2.4);
        if(now)out.notes++;
        switch(note.group){
          case 'bass':{const k=chamberFor(chambers,degreeOfMidi(note.midi,key),true);if(k<0)break;const e=v*env(age,.05,R.bass);
            // the ring: the light swells and beats at the chamber's frequency (each chamber a little detuned under tension)
            const f=R.freq*(1+(k%3-1)*.06*tension);acc.mono[k]+=e*(.62+.38*Math.cos(TAU*f*age+(1-out.coherence)*k*1.9));break;}
          case 'melody':{const k=chamberFor(chambers,degreeOfMidi(note.midi,key),false);if(k<0)break;const e=v*env(age,.03,R.melody);acc.mode[k]+=e;
            if(now&&at>latest[k]){latest[k]=at;out.l[k]=clamp(R.lmin+Math.floor((note.midi-62)/6),R.lmin,R.lmax);out.phase[k]=((b*16+s)*.618034%1)*TAU;}break;}
          case 'counter':{const k=chamberFor(chambers,degreeOfMidi(note.midi,key),false);if(k<0)break;acc.tone[k]+=v*env(age,.08,R.counter);break;}
          case 'pad':{const k=chamberFor(chambers,degreeOfMidi(note.midi,key),true);if(k<0)break;acc.pad[k]+=v*env(age,.6,6);break;}
          case 'arp':if(now)out.arp+=v*env(age,.01,.22);break;
          case 'perc':if(!now)break;if(note.instrument==='kick'||note.instrument==='taiko')out.thump+=v*env(age,.01,.35);else out.spark+=v*env(age,.005,note.instrument==='snare'?.2:.12);break;
          default:if(now&&note.group==='atmos')out.spark+=.3*v*env(age,.05,.6);
        }}}
  };
  // now, and a moment ago (what has had time to leak through the walls)
  sample(t,out,true);
  const delay=book.coupling.delay*1000*speed,past={mono:new Float32Array(n),mode:new Float32Array(n),tone:new Float32Array(n),pad:new Float32Array(n)};
  if(book.coupling.leak>0)sample(t-delay,past,false);
  for(let i=0;i<n;i++){let lm=0,lo=0;for(let j=0;j<n;j++){if(i===j)continue;const c=couple(i,j);if(c>0){lm+=c*past.mono[j];lo+=c*past.mode[j];}}
    out.mono[i]=clamp((out.mono[i]+book.coupling.leak*lm)*R.gain,0,2);out.mode[i]=clamp((out.mode[i]+book.coupling.leak*.7*lo)*R.gain,0,2);
    out.tone[i]=clamp(out.tone[i]*R.gain,0,2);out.pad[i]=clamp(out.pad[i],0,1.5);}
  out.arp=clamp(out.arp,0,2);out.thump=clamp(out.thump,0,1.5);out.spark=clamp(out.spark,0,1.5);
  return out;
}
// Without the score's notes (a classic score, or no score in this frame): the expression alone, gently (the chord's root
// chamber breathes on the bar, the melody's presence rings the newest).
export function resonanceFromExpression(t,{expression,book,chambers,key}){
  const n=chambers.length,R=book.ring,out={mono:new Float32Array(n),mode:new Float32Array(n),l:new Float32Array(n).fill(R.lmin),phase:new Float32Array(n),
    tone:new Float32Array(n),pad:new Float32Array(n),arp:0,thump:0,spark:0,coherence:1,notes:0};
  if(!n||!expression)return out;
  const k=chamberFor(chambers,Number.isInteger(expression.chord)?((expression.chord%7)+7)%7:0,true),e=clamp(expression.energy??0);
  if(k>=0)out.mono[k]=e*clamp(expression.barPulse??0)*R.gain;
  out.mode[n-1]=clamp(expression.melody??0)*.6*R.gain;out.coherence=clamp(1-.85*clamp(expression.tension??0));
  out.arp=clamp(expression.rhythm??0)*clamp(expression.pulse??0);out.thump=clamp(expression.rhythm??0)*clamp(expression.barPulse??0)*.5;
  return out;
}

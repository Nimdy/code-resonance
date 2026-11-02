// Genesis field proof: the fixed timeline of the first proof, shared by the browser page (real time and offline) and
// Node (headless), so all three reach the same states and their hashes can be compared. No imports: the caller hands
// in the simulation, the score and the musical reader (public/worlds/genesis-field.js, public/score.js, musical.js).
//
// Timeline (proof seconds):
//   0 .. change     the identity's structure just before its recorded architectural change; the sheet starts flat and
//                   organises itself under the identity's laws (no events, no music)
//   change          the recorded change is applied (a dependency between two subsystems, or a new subsystem)
//   music .. end    the score's own passage plays (bars chosen after the change, see passageOf); its notes are forces
export const SCHEDULE={change:12,music:18,end:28};
export const CHECKPOINTS=[4,8,12,14,18,20,22,24,26,28];
// The passage: the run of `bars` bars, starting within 90 s after the change, with the most notes that strike matter
// (bass, pad, melody, arpeggio; a bass note weighs most), on the score's own bar grid.
export function passageOf(musical,barMs,changeAt,bars){
  let best=null;const b0=Math.ceil(changeAt/barMs);
  for(let b=b0;b<b0+Math.floor(90000/barMs);b++){let s=0;
    for(let k=0;k<bars;k++){const x=musical.bar(b+k);if(!x)continue;for(const st of x.steps)for(const n of st)s+=n.group==='bass'?3:n.group==='pad'||n.group==='melody'?1:n.group==='arp'?.5:0;}
    if(!best||s>best.score)best={bar:b,score:s};}
  return best&&{bar:best.bar,from:best.bar*barMs,bars,score:best.score};
}
// deps: {createField, DT, degreeOfMidi, score, createMusical}
export function createProof(deps,inputs,{R=44,schedule=SCHEDULE}={}){
  const {createField,DT,degreeOfMidi}=deps;
  const id=deps.score.createIdentity(inputs.music.seed),tempo=id.tempo[inputs.music.style]||92,barMs=240000/tempo;
  const musical=deps.createMusical({timeline:{version:1,items:inputs.frames},score:deps.score});
  musical.configure({version:inputs.music.version,style:inputs.music.style,profile:inputs.music.profile,seed:inputs.music.seed,tempo});
  const key=musical.key();
  const bars=Math.ceil((schedule.end-schedule.music)*1000/barMs)+1;
  const passage=passageOf(musical,barMs,inputs.change.at,bars);
  const sim=createField({laws:inputs.laws,structure:inputs.before,seed:inputs.seed,R,tempo});
  const DEG=[0,4,2,5,3,1,6];
  // the territory a note of scale degree d strikes: those whose degree it is (subsystem order), the largest for a low
  // voice; without one, the d-th (so every degree has a home)
  const regionFor=(d,low)=>{const K=sim.K(),subs=sim.subs();let best=-1;
    for(let k=0;k<K;k++)if(DEG[k%7]===d&&(best<0||(low?subs[k].files>subs[best].files:subs[k].files<subs[best].files)))best=k;return best>=0?best:K?d%K:-1;};
  const log=[],hashes={};let applied=false;
  // the notes whose onsets fall in [T, T + DT) (performance ms), as forces
  function musicAt(T){
    const out={bass:[],kick:[],melody:[]},T1=T+DT*1000,step=barMs/16;
    for(let b=Math.floor(T/barMs)-1;b<=Math.floor(T1/barMs);b++){const x=musical.bar(b);if(!x?.steps)continue;
      for(let s=0;s<16;s++){const at=b*barMs+s*step+(s%2?(x.swing||0)*step:0);if(at<T||at>=T1)continue;
        // velocities quantised to 1/1024: score.js reaches some through a transcendental whose last bit differs between
        // JavaScript engines, and the state must not
        for(const n of x.steps[s]||[]){const v=Math.min(1,Math.round((n.velocity||.5)*1024)/1024*1.6),d=degreeOfMidi(n.midi,key);
          switch(n.group){
            case 'bass':{const k=regionFor(d,true);if(k>=0)out.bass.push({k,v});log.push({at:T,kind:'bass',k,v:+v.toFixed(2)});break;}
            case 'pad':{const k=regionFor(d,true);if(k>=0)out.bass.push({k,v:v*.45});log.push({at:T,kind:'pad',k});break;}
            case 'melody':out.melody.push({angle:2*Math.PI*(((n.midi%12)+12)%12)/12,v});log.push({at:T,kind:'melody',midi:n.midi});break;
            case 'arp':out.melody.push({angle:2*Math.PI*(((n.midi%12)+12)%12)/12+.26,v:v*.5});break;
            case 'perc':if(n.instrument==='kick'||n.instrument==='taiko'){out.kick.push(v);log.push({at:T,kind:'kick'});}break;
            default:break;
          }}}}
    return out.bass.length||out.kick.length||out.melody.length?out:null;
  }
  // advances to proof time tau (seconds): the fixed steps due by then
  function advanceTo(tau){
    while(sim.step*DT+1e-9<tau){
      const t=sim.step*DT;
      if(!applied&&t>=schedule.change){sim.setStructure(inputs.after,{at:sim.time});applied=true;log.push({at:t,kind:'change',change:inputs.change.kind});}
      const m=t>=schedule.music&&passage?musicAt(passage.from+(t-schedule.music)*1000):null;
      sim.advance(m);
      const t2=sim.step*DT;for(const c of CHECKPOINTS)if(hashes[c]===undefined&&t2>=c-1e-9)hashes[c]=sim.hash();
    }
  }
  return {sim,tempo,barMs,key,passage,schedule,advanceTo,hashes,log,musical,
    get tau(){return sim.step*DT;},
    phase(tau){return tau<schedule.change?'self-organisation':tau<schedule.music?'architectural change':'music';}};
}

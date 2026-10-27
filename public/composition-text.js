/* Code Resonance: artist compositions in plain words — what a layer is, where it is drawn and what each mapping does,
 * for the Artist Studio, the Visual Packs library and the README of an exported creation. One wording everywhere, so
 * the interface and the shared file say the same thing. Pure JS (Node or a browser); it describes, it never decides.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResonanceCompositionText=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  // The library: what each layer type makes, in one line.
  const LAYER_WORDS={
    fractal:{name:'Fractal geometry',line:'Recursive branching that grows and sways: trees, ferns, coral, lightning or spirals.'},
    particles:{name:'Particle population',line:'A small population that swarms, orbits, drifts or flocks around its anchors.'},
    ribbons:{name:'Ribbons & flow',line:'Luminous streamlines through a flow field: currents, orbits, spirals or wind.'},
    structure:{name:'Geometric structure',line:'Precise forms that turn: rings, lattices, polyhedra, orbits and arches.'},
    atmosphere:{name:'Atmospheric field',line:'Haze, aurora, gradient or nebula: a screen-space field drawn behind the world.'},
    light:{name:'Light accents',line:'Glows, pulses, flares and beacons placed on the structure.'}};
  // Where a layer is drawn: always inside the world's own image, so the finish (bloom, halation, aberration) applies.
  const DEPTH_WORDS={behind:{badge:'Behind',line:'Drawn behind the world, never in front of it'},world:{badge:'Integrated',line:'Inside the world: nearer forms hide it, it hides farther ones'},
    front:{badge:'In front',line:'Drawn over the world, never hidden by it'}};
  const ANCHOR_WORDS={center:'World centre',subsystems:'Every subsystem',largest:'One of the largest subsystems',active:'Where the work is (active region)',
    nodes:'Structural nodes',boundary:'Environment boundary',camera:'The camera (moves with the view)',point:'A fixed point you choose'};
  const BLEND_WORDS={add:'Add (light adds up)',screen:'Screen (soft light)',normal:'Normal (covers)'};
  const FINISH_WORDS={clean:'Clean',cinematic:'Cinematic',dreamlike:'Dreamlike'};
  const BASE_WORDS={'fractal-biosphere':'Fractal Biosphere','stellar-forge':'Stellar Forge','machine-cathedral':'Machine Cathedral',canvas:'Artist canvas'};
  // Signals: what they are called inside a sentence, and how they move (a pulse, an event's swell, a ramp or a level).
  const SIGNAL_WORDS={
    'music.beat':['every beat','pulse'],'music.bar':['the start of every bar','pulse'],'music.phrase':['each four-bar phrase','ramp'],
    'music.section':['each new section','pulse'],'music.transition':['the build-up to a section change','ramp'],'music.energy':['the music’s energy','level'],
    'music.tension':['the harmonic tension','level'],'music.melody':['the melody','level'],'music.rhythm':['the rhythm parts','level'],
    'music.release':['the music’s release','level'],'music.dynamics':['the music’s dynamics','level'],'music.density':['the number of parts playing','level'],
    'eng.activity':['recorded development activity','level'],'eng.creation':['new structure (files, symbols)','event'],'eng.removal':['removed structure','event'],
    'eng.failure':['a failing test or build','event'],'eng.recovery':['a fixed failure','event'],'eng.milestone':['a verified milestone','event'],
    'eng.agents':['observed agent activity','level'],
    'env.density':['how gathered the inhabitants are','level'],'env.field':['the energy in the environment','level'],'env.current':['the strength of the currents','level'],
    'env.disturbance':['local disturbance','level'],'env.coherence':['how aligned the groups move','level'],'env.trails':['the concentration of trails','level']};
  const TARGET_WORDS={opacity:'Visibility',brightness:'Brightness',scale:'Size',hue:'Colour',speed:'Motion speed',glow:'Glow',intensity:'Intensity',growth:'Growth',
    sway:'Sway',spread:'Spread',width:'Width',size:'Point size',sparkle:'Sparkle',trail:'Trails',cohesion:'Cohesion',separation:'Separation',alignment:'Alignment',
    attraction:'Attraction',lifetime:'Lifetime',length:'Ribbon length',taper:'Taper',turbulence:'Turbulence',thickness:'Thickness',rotation:'Rotation',
    wobble:'Wobble',height:'Height',noise:'Texture',falloff:'Falloff',radius:'Radius',depth:'Recursion',branching:'Branching',instances:'Instances',count:'Count',detail:'Detail',
    'camera.sway':'Camera sway','camera.zoom':'Camera distance','finish.bloom':'Bloom','finish.exposure':'Exposure'};
  const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
  const targetName=k=>TARGET_WORDS[k]||cap(String(k).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[._-]+/g,' '));
  // "Glow rises with the music's dynamics": the target, how strongly, which way, and with what.
  function mappingSentence(m){
    if(!m)return '';
    const [what,kind]=SIGNAL_WORDS[m.signal]||[String(m.signal),'level'],a=Math.abs(Number(m.amount)||0),up=(Number(m.amount)||0)>=0;
    if(!a)return `${targetName(m.target)} does not respond to ${what} yet (strength 0)`;
    const how=a<=.2?'gently ':a>.8?'dramatically ':a>.5?'strongly ':'';
    const t=targetName(m.target);
    if(m.target==='hue')return `${t} shifts ${how}${up?'forward':'back'} around the wheel with ${what}`;
    if(kind==='pulse')return `${t} ${up?'flashes up':'dips'} ${how}on ${what}`;
    if(kind==='event')return `${t} ${up?'swells':'sinks'} ${how}after ${what}`;
    if(kind==='ramp')return `${t} ${up?'builds':'fades'} ${how}through ${what}`;
    return `${t} ${up?'rises':'falls'} ${how}${up?'with':'as'} ${what}${up?'':' rises'}`;
  }
  // The response in words: how quickly it follows and over which part of the target's range.
  function responseLine(m){
    if(!m)return '';const s=Number(m.smoothing)||0,lo=Math.round((m.min??0)*100),hi=Math.round((m.max??1)*100);
    const follow=s<.15?'follows at once':s<1?'follows quickly':s<2.5?'follows smoothly':'follows slowly';
    const shape={linear:'evenly',smooth:'with a soft start and finish',sharp:'only on strong moments',pulse:'only at the peaks'}[m.curve]||'';
    return `${cap(follow)}, ${shape}${lo>0||hi<100?`, within ${lo}–${hi} % of its range`:''}`;
  }
  // The few values that say what a layer looks like (its kind of form and its main parameter).
  function layerLine(l){
    if(!l)return '';const p=l.params||{},words=LAYER_WORDS[l.type];
    const form={fractal:p.form,particles:p.behavior,ribbons:p.field,structure:p.shape,atmosphere:p.style,light:p.style}[l.type];
    const amount={fractal:p.instances?`${p.instances}×`:null,particles:p.count?`${p.count} points`:null,ribbons:p.count?`${p.count} ribbons`:null,
      structure:p.count?`${p.count}×`:null,light:p.count?`${p.count}×`:null,atmosphere:null}[l.type];
    return [words?.name||l.type,form?cap(String(form)):null,amount].filter(Boolean).join(' · ');
  }
  // The README of an exported creation: what it is, what it is made of and how it reacts. No project, path or recipe
  // identity is ever part of it (the composition passed in is the exportable one).
  function readme(c,{packId='',author='',license='',version=''}={}){
    const lines=[`# ${c.name}`,''];
    if(c.description)lines.push(c.description,'');
    lines.push(`A Code Resonance creation made in the Artist Studio${author?` by ${author}`:''}: a data-only visual pack (no code, nothing to approve).`,'',
      '| | |','|---|---|',`| Built on | ${BASE_WORDS[c.base]||c.base}${c.base==='canvas'?' (a minimal procedural canvas)':''} |`,
      `| Finish | ${c.finish?FINISH_WORDS[c.finish]:'The world’s own'} |`,`| Layers | ${c.layers.length} |`,
      ...(c.music?.style?[`| Music | ${cap(c.music.style)} profile |`]:[]),...(version?[`| Version | ${version} |`]:[]),...(license?[`| License | ${license} |`]:[]),'');
    if(c.layers.length){lines.push('## Layers','');
      for(const l of c.layers){lines.push(`- **${l.name}** — ${layerLine(l)}. ${DEPTH_WORDS[l.depth]?.line||''}; placed at: ${ANCHOR_WORDS[l.anchor?.kind]||'the centre'}.${l.enabled?'':' (Off)'}`);
        for(const m of l.mappings||[])lines.push(`  - ${mappingSentence(m)}.`);}
      lines.push('');}
    if(c.mappings?.length){lines.push('## The whole composition','');for(const m of c.mappings)lines.push(`- ${mappingSentence(m)}.`);lines.push('');}
    lines.push('## Use it','','In Code Resonance: Visual Packs → Import a pack → choose this .zip (or its folder), then Install. It appears under',
      '“Imported creations”: Use applies it to the selected project (each project keeps its own structure and engineering',
      'data); Open in Artist Studio makes an editable copy.','');
    if(packId)lines.push(`Pack id: \`${packId}\``,'');
    return lines.join('\n');
  }
  return {LAYER_WORDS,DEPTH_WORDS,ANCHOR_WORDS,BLEND_WORDS,FINISH_WORDS,BASE_WORDS,SIGNAL_WORDS,TARGET_WORDS,targetName,mappingSentence,responseLine,layerLine,readme};
});

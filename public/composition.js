/* Code Resonance: artist compositions — the data model shared by the receiver (validation), the renderer (layers)
 * and the Artist Studio (inspector). Pure JS, usable in Node or a browser, no executable content.
 *
 * A composition is a stack of procedural layers over a base (a flagship world, or the artist canvas), with a finish
 * (the cinematic look), optional world tuning (recipe paths the Visual Studio already exposes), an optional music
 * profile, and reactive mappings from deterministic signals (the score's expression, canonical engineering intents,
 * the ecosystem's state) to bounded layer parameters. Everything is an allowlisted type with clamped values; unknown
 * keys are dropped. Nothing here is ever evaluated as code.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResonanceComposition=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  const SCHEMA='code-resonance.composition.v1',VERSION=1;
  const LIMITS={layers:8,mappings:6,globalMappings:4,name:48,budget:100,tuning:48,versions:5};
  const BASES=['fractal-biosphere','stellar-forge','machine-cathedral','canvas'];
  const FINISHES=['clean','cinematic','dreamlike'];
  // Depth is where a layer is drawn: behind the world, integrated with it (depth-tested), or in front of it. All three
  // are drawn into the same HDR image, so the finish (bloom, halation, aberration) applies to them like the world.
  const DEPTHS=['behind','world','front'];
  const BLENDS=['add','screen','normal'];
  // Anchors place a layer: the world centre, the project's subsystems (one instance per subsystem, or the largest),
  // the active region (follows the work), structural nodes, the environment boundary, the camera, or a fixed point
  // (normalised -1..1 of the world's extent).
  const ANCHORS=['center','subsystems','largest','active','nodes','boundary','camera','point'];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const HEX=/^#[0-9a-f]{6}$/i;
  // Parameter spec: [key, type, min|options, max, default, group]. Types: number, int, enum, color, bool.
  const P=(key,type,a,b,d,group='appearance')=>({key,type,...(type==='enum'?{options:a}:{min:a,max:b}),default:d,group});
  const COLOR=(key,d,group='appearance')=>({key,type:'color',default:d,group});
  const LAYERS={
    fractal:{label:'Fractal geometry',cost:p=>4+Math.pow(p.branching,p.depth)*p.instances*.012,params:[
      P('form','enum',['tree','fern','coral','lightning','spiral'],0,'tree','form'),P('depth','int',2,7,5,'form'),P('branching','int',2,4,2,'form'),
      P('spread','number',0,1,.5,'form'),P('scale','number',.1,3,1,'form'),P('instances','int',1,24,5,'form'),P('growth','number',0,1,1,'form'),
      P('material','enum',['filament','crystal','vein'],0,'filament'),COLOR('color','#5ff2d6'),COLOR('tip','#c58bff'),P('width','number',.2,3,1),P('glow','number',0,3,1),
      P('sway','number',0,1,.35,'motion'),P('speed','number',0,2,.5,'motion')]},
    particles:{label:'Particle population',cost:p=>3+p.count/1000*9*(1+p.trail),params:[
      P('count','int',200,6000,1800,'form'),P('distribution','enum',['cloud','disc','shell','anchors'],0,'cloud','form'),P('spread','number',.1,3,1,'form'),
      P('size','number',.2,4,1),COLOR('color','#9fe8ff'),COLOR('colorB','#ffb6e6'),P('glow','number',0,3,1),P('sparkle','number',0,1,.3),P('trail','number',0,1,.3),
      P('behavior','enum',['swarm','orbit','drift','flock'],0,'swarm','motion'),P('cohesion','number',0,1,.5,'motion'),P('separation','number',0,1,.4,'motion'),
      P('alignment','number',0,1,.5,'motion'),P('attraction','number',-1,1,.3,'motion'),P('speed','number',0,2,.6,'motion'),P('lifetime','number',.5,20,8,'motion')]},
    ribbons:{label:'Ribbons & flow',cost:p=>2+p.count*p.length*.35,params:[
      P('count','int',4,64,18,'form'),P('length','number',.1,1,.5,'form'),P('scale','number',.2,3,1,'form'),P('field','enum',['curl','orbit','spiral','wind'],0,'curl','form'),
      P('width','number',.2,3,1),P('taper','number',0,1,.6),COLOR('color','#7fd8ff'),COLOR('colorB','#ffd27f'),P('glow','number',0,3,1.2),
      P('turbulence','number',0,1,.4,'motion'),P('speed','number',0,2,.5,'motion')]},
    structure:{label:'Geometric structure',cost:p=>2+p.count*p.detail*.4,params:[
      P('shape','enum',['rings','lattice','polyhedron','orbits','arches'],0,'rings','form'),P('count','int',1,24,4,'form'),P('radius','number',.1,3,1,'form'),
      P('detail','int',1,5,3,'form'),P('thickness','number',.1,2,.5),P('wire','bool',0,1,true),COLOR('color','#a6c8ff'),P('glow','number',0,3,.8),
      P('rotation','number',0,2,.3,'motion'),P('wobble','number',0,1,.2,'motion')]},
    atmosphere:{label:'Atmospheric field',cost:()=>6,params:[
      P('style','enum',['haze','aurora','gradient','nebula'],0,'haze','form'),P('scale','number',.2,3,1,'form'),P('height','number',0,1,.5,'form'),
      COLOR('color','#1e3a5f'),COLOR('colorB','#6b3fa0'),P('intensity','number',0,2,.6),P('noise','number',0,1,.5),P('speed','number',0,1,.2,'motion')]},
    light:{label:'Light accents',cost:p=>1+p.count*.25,params:[
      P('style','enum',['glow','pulse','flare','beacon'],0,'glow','form'),P('count','int',1,16,3,'form'),P('size','number',.1,3,1,'form'),
      COLOR('color','#ffd9a8'),P('intensity','number',0,4,1.2),P('falloff','number',0,1,.5),P('speed','number',0,2,.5,'motion')]}
  };
  // Every layer also has these; mappings may target them.
  const COMMON=[P('opacity','number',0,1,1),P('brightness','number',0,3,1),P('scale','number',.1,3,1,'form'),P('hue','number',-.5,.5,0),P('speed','number',0,2,1,'motion')];
  // Signals: all are 0..1, deterministic for a given performance (none comes from live audio analysis).
  const SIGNALS=[
    ['music.beat','Beat','A pulse on every beat of the bar'],['music.bar','Bar','A pulse at the start of every bar'],
    ['music.phrase','Phrase','Rises through each four-bar phrase'],['music.section','Section change','A swell where a new section begins'],
    ['music.transition','Transition','Builds over the bars before a section change'],['music.energy','Energy','How much the music is doing'],
    ['music.tension','Harmonic tension','High on the dominant and in tense passages, low when it resolves'],['music.melody','Melody','The melody is playing'],
    ['music.rhythm','Rhythm','Rhythmic parts are playing'],['music.release','Release','The music is resolving and settling'],
    ['music.dynamics','Dynamics','The crescendos and decrescendos'],['music.density','Density','How many parts are playing'],
    ['eng.activity','Activity','Recorded development activity'],['eng.creation','Creation','New structure (files, symbols)'],
    ['eng.removal','Removal','Structure removed'],['eng.failure','Failure','A failing test or build (canonical, never inferred)'],
    ['eng.recovery','Recovery','A failure that has been fixed'],['eng.milestone','Verified milestone','Verified milestones only'],
    ['eng.agents','Agents','Observed AI-agent activity'],
    ['env.density','Population density','How gathered the inhabitants are'],['env.field','Field energy','Energy in the environment'],
    ['env.current','Current','Strength of the currents'],['env.disturbance','Disturbance','Local disturbance (failures, stress)'],
    ['env.coherence','Coherence','How aligned the groups move'],['env.trails','Trails','Concentration of trails']
  ].map(([id,label,doc])=>({id,label,doc,group:id.split('.')[0]}));
  const SIGNAL_IDS=new Set(SIGNALS.map(s=>s.id));
  const CURVES=['linear','smooth','sharp','pulse'];
  // Composition-level targets (bounded camera motion and finish emphasis).
  const GLOBAL_TARGETS=[P('camera.sway','number',0,1,0),P('camera.zoom','number',-.3,.3,0),P('finish.bloom','number',-.5,.5,0),P('finish.exposure','number',-.3,.3,0)];
  function specOf(type){const t=LAYERS[type];if(!t)return null;const own=new Set(t.params.map(p=>p.key));return [...t.params,...COMMON.filter(p=>!own.has(p.key))];}
  function targetsOf(type){return (specOf(type)||[]).filter(p=>p.type==='number'||p.type==='int');}
  const str=(v,n)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,n):'';
  const idOf=v=>typeof v==='string'&&/^[a-z0-9-]{1,40}$/.test(v)?v:null;
  function value(spec,v){
    if(spec.type==='enum')return spec.options.includes(v)?v:spec.default;
    if(spec.type==='color')return typeof v==='string'&&HEX.test(v)?v.toLowerCase():spec.default;
    if(spec.type==='bool')return typeof v==='boolean'?v:spec.default;
    const n=Number(v);if(!Number.isFinite(n))return spec.default;
    return spec.type==='int'?Math.round(clamp(n,spec.min,spec.max)):clamp(n,spec.min,spec.max);
  }
  function anchorOf(a){
    const kind=ANCHORS.includes(a?.kind)?a.kind:'center',out={kind};
    if(kind==='point')for(const k of ['x','y','z'])out[k]=clamp(Number(a?.[k])||0,-1,1);
    if(kind==='largest')out.index=Math.round(clamp(Number(a?.index)||0,0,15));
    return out;
  }
  function mappingOf(m,targets){
    if(!SIGNAL_IDS.has(m?.signal))return null;const t=targets.find(p=>p.key===m.target);if(!t)return null;
    const lo=clamp(Number(m.min)||0,0,1),hi=clamp(Number.isFinite(Number(m.max))?Number(m.max):1,0,1);
    return {signal:m.signal,target:t.key,amount:clamp(Number(m.amount)||0,-1,1),curve:CURVES.includes(m.curve)?m.curve:'smooth',
      smoothing:clamp(Number(m.smoothing)||0,0,4),min:Math.min(lo,hi),max:Math.max(lo,hi)};
  }
  function layerOf(l,i){
    const t=LAYERS[l?.type];if(!t)return null;const spec=specOf(l.type),params={};
    for(const s of spec)params[s.key]=value(s,l.params?.[s.key]);
    const targets=targetsOf(l.type);
    return {id:idOf(l.id)||`l${i+1}`,type:l.type,name:str(l.name,LIMITS.name)||t.label,enabled:l.enabled!==false,solo:l.solo===true,
      blend:BLENDS.includes(l.blend)?l.blend:'add',depth:DEPTHS.includes(l.depth)?l.depth:'world',anchor:anchorOf(l.anchor),
      seed:Math.round(clamp(Number(l.seed)||0,0,9999)),params,
      mappings:(Array.isArray(l.mappings)?l.mappings:[]).map(m=>mappingOf(m,targets)).filter(Boolean).slice(0,LIMITS.mappings)};
  }
  const TUNING_PATH=/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9]+){1,3}$/;
  function tuningOf(t){
    const out={};if(!t||typeof t!=='object'||Array.isArray(t))return out;
    for(const [k,v] of Object.entries(t).slice(0,LIMITS.tuning)){
      if(!TUNING_PATH.test(k)||k.startsWith('technique.finish'))continue;
      if(typeof v==='number'&&Number.isFinite(v))out[k]=v;else if(typeof v==='boolean')out[k]=v;
      else if(typeof v==='string'&&v.length<=16&&/^[#A-Za-z0-9 ._-]*$/.test(v))out[k]=v;
      else if(Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x)))out[k]=v.slice();
    }
    return out;
  }
  function musicOf(m){
    if(!m||typeof m!=='object')return null;const out={};
    if(['ambient','pulse','cinematic','chip'].includes(m.style))out.style=m.style;
    if(m.profile&&typeof m.profile==='object'){const p={};for(const k of ['mood','evolution','melody','rhythm','atmosphere','harmony','dynamics','space']){const v=Number(m.profile[k]);if(Number.isFinite(v))p[k]=clamp(v,0,1);}
      if(m.profile.mix&&typeof m.profile.mix==='object'){p.mix={};for(const g of ['pad','bass','melody','counter','arp','perc','atmos']){const v=Number(m.profile.mix[g]);if(Number.isFinite(v))p.mix[g]=clamp(v,0,1.5);}}
      out.profile=p;}
    return Object.keys(out).length?out:null;
  }
  // Clamp, default and drop: the only shape any consumer ever sees. Layers beyond the count or budget are dropped
  // (the caller reports them through validate()).
  function normalize(c){
    const base=BASES.includes(c?.base)?c.base:'canvas',layers=[];let spent=0;
    for(const [i,l] of (Array.isArray(c?.layers)?c.layers:[]).slice(0,LIMITS.layers).entries()){const n=layerOf(l,i);if(!n)continue;
      const cost=costOf(n);if(spent+cost>LIMITS.budget)break;spent+=cost;layers.push(n);}
    const seen=new Set();for(const l of layers){let id=l.id,k=2;while(seen.has(id))id=`${l.id}-${k++}`;l.id=id;seen.add(id);}
    return {schema:SCHEMA,version:VERSION,id:idOf(c?.id)||null,name:str(c?.name,LIMITS.name)||'Untitled composition',
      description:str(c?.description,240),base,finish:FINISHES.includes(c?.finish)?c.finish:null,
      tuning:base==='canvas'?{}:tuningOf(c?.tuning),music:musicOf(c?.music),
      canvas:base==='canvas'?{background:value(COLOR('background','#04060c'),c?.canvas?.background),horizon:value(COLOR('horizon','#14223a'),c?.canvas?.horizon),
        orbit:value(P('orbit','number',0,1,.25),c?.canvas?.orbit),distance:value(P('distance','number',.5,2,1),c?.canvas?.distance)}:null,
      layers,mappings:(Array.isArray(c?.mappings)?c.mappings:[]).map(m=>mappingOf(m,GLOBAL_TARGETS)).filter(Boolean).slice(0,LIMITS.globalMappings)};
  }
  function costOf(layer){const t=LAYERS[layer.type];return t?Math.round(t.cost(layer.params)*10)/10:0;}
  function budgetOf(c){const n=normalize(c);const used=n.layers.reduce((a,l)=>a+(l.enabled?costOf(l):0),0);return {used:Math.round(used*10)/10,limit:LIMITS.budget,layers:n.layers.length,maxLayers:LIMITS.layers};}
  // Problems a caller should show or refuse: [{at, message}]. Normalising never throws; validation explains.
  function validate(c){
    const errors=[];
    if(!c||typeof c!=='object'||Array.isArray(c))return [{at:'',message:'A composition is an object'}];
    if(c.schema!==undefined&&c.schema!==SCHEMA)errors.push({at:'schema',message:`schema must be ${SCHEMA}`});
    if(c.base!==undefined&&!BASES.includes(c.base))errors.push({at:'base',message:`base must be one of ${BASES.join(', ')}`});
    const layers=Array.isArray(c.layers)?c.layers:[];
    if(c.layers!==undefined&&!Array.isArray(c.layers))errors.push({at:'layers',message:'layers must be a list'});
    if(layers.length>LIMITS.layers)errors.push({at:'layers',message:`at most ${LIMITS.layers} layers`});
    layers.forEach((l,i)=>{if(!LAYERS[l?.type])errors.push({at:`layers.${i}.type`,message:`unknown layer type ${String(l?.type).slice(0,24)}`});
      for(const [j,m] of (Array.isArray(l?.mappings)?l.mappings:[]).entries())if(!SIGNAL_IDS.has(m?.signal))errors.push({at:`layers.${i}.mappings.${j}`,message:`unknown signal ${String(m?.signal).slice(0,32)}`});});
    let spent=0;for(const [i,l] of layers.slice(0,LIMITS.layers).entries()){const n=layerOf(l,i);if(!n)continue;spent+=costOf(n);if(spent>LIMITS.budget){errors.push({at:`layers.${i}`,message:`over the rendering budget (${LIMITS.budget})`});break;}}
    return errors;
  }
  // A mapping's contribution in the target's own units, from a signal value (0..1) already smoothed by the caller.
  function shape(curve,x){x=clamp(x,0,1);return curve==='linear'?x:curve==='sharp'?x*x*x:curve==='pulse'?Math.pow(x,6):x*x*(3-2*x);}
  function applyMappings(params,mappings,signal,spec){
    const out={...params};
    for(const m of mappings){const s=spec.find(p=>p.key===m.target);if(!s)continue;
      const v=shape(m.curve,signal(m.signal,m.smoothing)),span=s.max-s.min,lo=s.min+m.min*span,hi=s.min+m.max*span;
      out[m.target]=clamp(out[m.target]+m.amount*v*span,lo,hi);}
    return out;
  }
  function layer(type,over={}){const spec=specOf(type),params={};for(const s of spec)params[s.key]=s.default;
    return layerOf({type,...over,params:{...params,...over.params}},0);}
  // Creator starters: complete, editable compositions that show different combinations of layers and mappings.
  const STARTERS=[
    {id:'starter-blank',name:'Blank composition',description:'The artist canvas: a quiet horizon and nothing else. Add layers from the library.',base:'canvas',finish:'cinematic',layers:[]},
    {id:'starter-bioluminescent-dream',name:'Bioluminescent Dream',description:'Organic and slow: fractal filaments over the Biosphere, drifting spores and a breathing haze.',base:'fractal-biosphere',finish:'dreamlike',
      tuning:{'palette.hue':172},music:{style:'ambient',profile:{atmosphere:.8,evolution:.45,rhythm:.25}},layers:[
      layer('fractal',{id:'filaments',name:'Mycelium filaments',depth:'world',anchor:{kind:'subsystems'},params:{form:'coral',depth:5,instances:6,color:'#3cf2c8',tip:'#b98cff',glow:1.4,sway:.5},
        mappings:[{signal:'music.dynamics',target:'glow',amount:.35,curve:'smooth',smoothing:1.5,min:0,max:1},{signal:'eng.creation',target:'growth',amount:.3,curve:'smooth',smoothing:2,min:.4,max:1}]}),
      layer('particles',{id:'spores',name:'Drifting spores',depth:'world',anchor:{kind:'center'},params:{count:2200,behavior:'drift',color:'#a8fff0',colorB:'#e6b8ff',size:.8,trail:.5,speed:.35},
        mappings:[{signal:'music.melody',target:'brightness',amount:.4,curve:'smooth',smoothing:.8,min:0,max:1}]}),
      layer('atmosphere',{id:'haze',name:'Breathing haze',depth:'behind',params:{style:'haze',color:'#0b3b3a',colorB:'#3a1f5c',intensity:.7},
        mappings:[{signal:'music.phrase',target:'intensity',amount:.25,curve:'smooth',smoothing:2,min:0,max:1}]})]},
    {id:'starter-celestial-motion',name:'Celestial Motion',description:'Orbital and luminous: rings and ribbons in orbit over the Stellar Forge, beacons that answer milestones.',base:'stellar-forge',finish:'cinematic',
      music:{style:'cinematic',profile:{evolution:.7,dynamics:.7}},layers:[
      layer('structure',{id:'orbits',name:'Orbital rings',depth:'world',anchor:{kind:'center'},params:{shape:'orbits',count:7,radius:1.6,color:'#9ec5ff',glow:.9,rotation:.25},
        mappings:[{signal:'music.tension',target:'wobble',amount:.4,curve:'smooth',smoothing:1,min:0,max:.7}]}),
      layer('ribbons',{id:'streams',name:'Orbital streams',depth:'world',anchor:{kind:'center'},params:{field:'orbit',count:28,length:.7,color:'#7fb8ff',colorB:'#ffcf8a',glow:1.4},
        mappings:[{signal:'music.energy',target:'speed',amount:.5,curve:'smooth',smoothing:1.5,min:0,max:1}]}),
      layer('light',{id:'beacons',name:'Milestone beacons',depth:'front',anchor:{kind:'largest',index:0},params:{style:'beacon',count:1,color:'#ffe2b0',intensity:1},
        mappings:[{signal:'eng.milestone',target:'intensity',amount:.8,curve:'smooth',smoothing:1,min:0,max:1}]})]},
    {id:'starter-signal-architecture',name:'Signal Architecture',description:'Precise and technical: lattices over the Machine Cathedral, signal ribbons that carry the rhythm.',base:'machine-cathedral',finish:'clean',
      music:{style:'pulse',profile:{rhythm:.65,mood:.55}},layers:[
      layer('structure',{id:'lattice',name:'Signal lattice',depth:'world',anchor:{kind:'subsystems'},params:{shape:'lattice',count:3,radius:.7,detail:3,color:'#8fd3ff',glow:.7,rotation:.1},
        mappings:[{signal:'music.beat',target:'glow',amount:.35,curve:'pulse',smoothing:0,min:0,max:1}]}),
      layer('ribbons',{id:'signals',name:'Signal paths',depth:'world',anchor:{kind:'nodes'},params:{field:'wind',count:24,length:.4,width:.6,color:'#6ff0ff',colorB:'#ffffff',glow:1.6,turbulence:.15},
        mappings:[{signal:'music.rhythm',target:'speed',amount:.6,curve:'smooth',smoothing:.4,min:0,max:1},{signal:'eng.activity',target:'brightness',amount:.4,curve:'smooth',smoothing:1,min:0,max:1}]}),
      layer('light',{id:'failure',name:'Fault lamps',depth:'front',anchor:{kind:'active'},params:{style:'pulse',count:2,color:'#ff7a5c',intensity:0},
        mappings:[{signal:'eng.failure',target:'intensity',amount:.6,curve:'smooth',smoothing:1,min:0,max:1}]})]},
    {id:'starter-abstract-resonance',name:'Abstract Resonance',description:'Mathematical and rhythmic, on the artist canvas: spirals, a flocking field and an aurora shaped by the music.',base:'canvas',finish:'dreamlike',
      canvas:{background:'#05040d',horizon:'#1b1240',orbit:.35,distance:1},music:{style:'ambient',profile:{evolution:.8,melody:.65}},layers:[
      layer('atmosphere',{id:'aurora',name:'Aurora',depth:'behind',params:{style:'aurora',color:'#1d6b8f',colorB:'#7a2fa8',intensity:.9,speed:.25},
        mappings:[{signal:'music.tension',target:'hue',amount:.25,curve:'smooth',smoothing:2,min:.3,max:.8}]}),
      layer('fractal',{id:'spirals',name:'Resonant spirals',depth:'world',anchor:{kind:'center'},params:{form:'spiral',depth:6,instances:3,scale:1.4,color:'#7ef9ff',tip:'#ff8ad8',glow:1.6},
        mappings:[{signal:'music.phrase',target:'growth',amount:.6,curve:'smooth',smoothing:.5,min:.2,max:1},{signal:'eng.activity',target:'sway',amount:.5,curve:'smooth',smoothing:1,min:0,max:1}]}),
      layer('particles',{id:'flock',name:'Resonant flock',depth:'world',anchor:{kind:'center'},params:{count:2600,behavior:'flock',distribution:'shell',color:'#bff6ff',colorB:'#ffc2f0',size:.9,trail:.4},
        mappings:[{signal:'music.energy',target:'cohesion',amount:.5,curve:'smooth',smoothing:1,min:0,max:1},{signal:'music.bar',target:'brightness',amount:.3,curve:'pulse',smoothing:0,min:0,max:1}]}),
      layer('structure',{id:'rings',name:'Harmonic rings',depth:'front',anchor:{kind:'center'},params:{shape:'rings',count:5,radius:1.2,thickness:.3,color:'#d9c2ff',glow:.6},
        mappings:[{signal:'music.dynamics',target:'scale',amount:.3,curve:'smooth',smoothing:1,min:0,max:1}]})]}
  ].map(c=>Object.freeze(normalize(c)));
  // Only non-private material is ever exported: no project, path or recipe identity, only the composition itself.
  function exportable(c){const n=normalize(c);delete n.id;return n;}
  return {SCHEMA,VERSION,LIMITS,BASES,FINISHES,DEPTHS,BLENDS,ANCHORS,LAYERS,COMMON,SIGNALS,CURVES,GLOBAL_TARGETS,STARTERS,
    specOf,targetsOf,normalize,validate,costOf,budgetOf,applyMappings,shape,layer,exportable};
});

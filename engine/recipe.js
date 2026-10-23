'use strict';
// Visual Recipe ("World DNA"): a project's persistent artistic identity.
//
// Permanent identity vs temporary state: the recipe decides what kind of universe a project is (its family, geometry
// language, palette, light, materials, atmosphere, motion, camera personality, effect and agent vocabulary). It is a
// pure function of (project seed, variant, founding traits, family) and is stored, so a project stays recognisable
// for weeks. What the project is doing right now (growing, stressed, recovering, idle) is state, read from the
// timeline at render time, and never changes the recipe.
//
// Founding: while a project is tiny its traits say little, so a generated recipe stays provisional (re-derived on
// request) until the project has FOUNDING_MODULES modules; then it is founded and never re-derived. A recipe the user
// chose or locked is permanent at once. Regenerating increments `variant` (a new seeded draw from the same traits).
//
// Data -> art mapping (documented, so a viewer can trace an identity back to the code):
//  - family affinity: hub-and-spoke dependencies and service endpoints favour Stellar Forge (bodies and orbits);
//    UI component trees and deep folder branching favour Fractal Biosphere (organisms and growth); classes, types and
//    tests favour Machine Cathedral (engineered architecture). A seeded share keeps similar projects distinct.
//  - project size sets complexity limits; dependency density sets connective atmosphere; test share sets order;
//    agent collaboration sets how prominent agent presences are.
const {sha}=require('../receiver/protocol');
const RECIPE_SCHEMA='code-resonance.recipe.v1';
const RECIPE_VERSION=1;      // generator: bump when the same inputs would produce a different genome
const RENDERER_VERSION=1;    // the world renderers this genome is written for
const FOUNDING_MODULES=6;
const FAMILIES=['stellar-forge','fractal-biosphere','machine-cathedral'];
const FAMILY_NAMES={'stellar-forge':'Stellar Forge','fractal-biosphere':'Fractal Biosphere','machine-cathedral':'Machine Cathedral'};
const round=(x,d=3)=>{const k=10**d;return Math.round(x*k)/k;};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function rng(...key){let s=parseInt(sha(key.join('/')).slice(0,8),16)>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const pick=(r,list)=>list[Math.floor(r()*list.length)%list.length];
const between=(r,a,b)=>round(a+(b-a)*r());
function weighted(r,entries){const total=entries.reduce((a,[,w])=>a+Math.max(0,w),0)||1;let x=r()*total;for(const [v,w] of entries){if((x-=Math.max(0,w))<0)return v;}return entries[0][0];}
// ---- Traits: what the project data says, from the public projection only (salted ids, no paths) --------------------
function traitsOf(project){
  const nodes=project?.graph?.nodes||[],edges=project?.graph?.edges||[];
  const modules=nodes.filter(n=>n.type==='module'),groups=nodes.filter(n=>n.type==='group');
  const kinds={};for(const m of modules)for(const [k,n] of Object.entries(m.counts||{}))kinds[k]=(kinds[k]||0)+n;
  const symbolTotal=Object.values(kinds).reduce((a,b)=>a+b,0)||0;
  const share=k=>symbolTotal?(kinds[k]||0)/symbolTotal:0;
  const langs={};for(const m of modules)if(m.lang)langs[m.lang]=(langs[m.lang]||0)+1;
  const code=['ts','tsx','js','jsx','py','go','rs'].reduce((a,k)=>a+(langs[k]||0),0)||0;
  const depends=edges.filter(e=>e.kind==='depends'),cross=depends.filter(e=>e.cross);
  const indegree=new Map();for(const e of depends)indegree.set(e.b,(indegree.get(e.b)||0)+1);
  const hub=Math.max(0,...indegree.values());
  const dirs=new Set(modules.map(m=>m.dir));
  const stats=project?.stats||{};
  const n=Math.max(1,modules.length);
  return {
    modules:modules.length,districts:groups.filter(g=>!g.test).length,symbols:symbolTotal,
    ui:round(share('ui.component')),uiModules:round(modules.filter(m=>(m.counts?.['ui.component']||0)>0).length/n),routes:round(share('api.route')),model:round(share('class')+share('interface')+share('type')),
    functions:round(share('function')+share('method')),
    languages:Object.fromEntries(Object.entries(langs).filter(([k])=>code&&['ts','tsx','js','jsx','py','go','rs'].includes(k)).map(([k,v])=>[k,round(v/code)])),
    dependencyDensity:round(depends.length/n),crossDensity:round(cross.length/n),
    hubness:round(modules.length>2?hub/(modules.length-1):0),
    branching:round(dirs.size/n),depth:round(symbolTotal/n),
    tests:round(modules.filter(m=>m.test).length/n),
    agents:Math.min(16,(project?.agents||[]).length),
    agentShare:round(stats.raw?clamp((stats.agentEvents||0)/stats.raw):0),
    validations:{passed:stats.testsPassed||0,failed:stats.testsFailed||0}
  };
}
// ---- Family affinity --------------------------------------------------------------------------------------------
function familyScores(traits,seed,variant){
  const r=rng('family',seed,variant);
  const t=traits,size=clamp(Math.log2(1+t.modules)/9);
  const raw={
    // Gravity: hubs everything orbits, endpoints radiating outward, work arriving from visiting agents, a young project.
    'stellar-forge':.9*clamp(t.hubness*2.5)+.7*clamp(t.routes*6)+1.2*t.agentShare+.45*(1-size)+.25*clamp(t.functions*1.4),
    // Growth: a large surface of UI components, folder branching, a big organism of small parts.
    'fractal-biosphere':1.2*clamp((t.uiModules-.1)*3)+.6*clamp(t.branching*2)+.3*size+.25*((t.languages.tsx||0)+(t.languages.jsx||0)),
    // Engineering: classes and types, tests holding the structure in order, subsystems coupled to each other.
    'machine-cathedral':.8*clamp(t.model*3)+.7*clamp(t.tests*4)+.5*clamp(t.crossDensity*1.6)+.25*clamp(t.depth/12)
  };
  // A seeded share: similar projects still become different universes.
  const scores={};for(const f of FAMILIES)scores[f]=round(raw[f]+.25*r());
  return scores;
}
// ---- Palette: harmonious, seeded, with temperature from the data ---------------------------------------------------
function hsl(h,s,l){h=((h%360)+360)%360;s=clamp(s);l=clamp(l);const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
  return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');}
function palette(r,family,traits){
  const scheme=weighted(r,[['analogous',3],['complementary',2],['split',2],['triad',1]]);
  const base={'stellar-forge':pick(r,[20,35,200,215,265,285,320,170]),'fractal-biosphere':pick(r,[140,165,180,190,95,300,330,50]),'machine-cathedral':pick(r,[30,40,205,220,190,15,260])}[family]+between(r,-14,14);
  const offset={analogous:[28,-30],complementary:[180,150],split:[150,210],triad:[120,240]}[scheme];
  const sat=between(r,.55,.85)*(1-.2*clamp(traits.tests*2)),deepHue=base+offset[1]*.35;
  return {scheme,hue:round(base,1),
    primary:hsl(base,sat,.58),secondary:hsl(base+offset[0],sat*.9,.55),accent:hsl(base+offset[1],clamp(sat+.1),.62),
    highlight:hsl(base+offset[0]*.5,.35,.86),deep:hsl(deepHue,.55,between(r,.035,.06)),haze:hsl(deepHue+12,.5,.16),
    warning:hsl(pick(r,[8,14,355]),.85,.58),valid:hsl(pick(r,[48,165,140]),.7,.7)};
}
// ---- Family genomes: the structural language of each universe -------------------------------------------------------
const GENOMES={
  'stellar-forge'(r,t){
    return {
      geometry:{arrangement:t.districts>=7?weighted(r,[['spiral',3],['cluster',1],['ring',1]]):weighted(r,[['ring',2],['spiral',1],['binary-core',1.5]]),
        spiralArms:pick(r,[2,2,3,4]),spiralTwist:between(r,.6,1.4),orbitSpacing:between(r,.85,1.25),orbitTilt:between(r,.02,.32),
        planetStyles:{gas:between(r,.2,.6),rock:between(r,.2,.6),ice:between(r,.05,.35)},ringChance:between(r,.15,.6),starScale:between(r,.85,1.3)},
      secondary:{corona:between(r,.5,1),loops:pick(r,[3,4,5,6]),granulation:between(r,.6,1.4),moonsAsRings:r()<.55},
      space:{spread:between(r,.9,1.25),vertical:between(r,.05,.35),coreBody:t.modules>40?'forge':'protostar'},
      atmosphere:{nebula:pick(r,['filamentary','billowing','veil']),nebulaDensity:between(r,.55,1),dustLanes:pick(r,[1,2,3]),dust:between(r,.4,1),stars:between(r,.6,1)},
      material:{plasma:between(r,.7,1.2),surfaceContrast:between(r,.6,1.2),atmosphereGlow:between(r,.4,1)},
      motion:{orbitSpeed:between(r,.6,1.3),convection:between(r,.6,1.4),breath:pick(r,[2,4,4,8]),turbulence:between(r,.4,1)},
      camera:{personality:pick(r,['orbital','drifting']),distance:between(r,.9,1.15),elevation:between(r,.28,.55),fov:pick(r,[32,36,40]),drift:between(r,.4,1)},
      agents:{form:pick(r,['comet','probe']),tail:between(r,.6,1.4)},
      effects:{'subsystem.created':'ignition','module.created':'planet-birth','structure.created':'accretion-spark','structure.removed':'ablation',
        'subsystem.connected':'flare-bridge','validation.failed':'stellar-storm','validation.passed':'aurora','validation.recovered':'calm-pulse',
        'refactor.validated':'accretion-collapse','milestone.achieved':'nova','repository.checkpoint':'gravity-wave','world.expanded':'expansion'}
    };
  },
  'fractal-biosphere'(r,t){
    const species=t.ui>.25?weighted(r,[['coral',2],['fern',2],['kelp',1],['crystal-tree',1]]):weighted(r,[['mycelial',2],['fern',1],['coral',1],['crystal-tree',1.5]]);
    return {
      geometry:{species,branchAngle:between(r,.35,.8),lengthDecay:between(r,.68,.86),curl:between(r,.05,.45),gravitropism:between(r,-.15,.6),
        taper:between(r,.55,.8),leafShape:pick(r,['blade','round','frond','petal']),leafDensity:between(r,.6,1.2)},
      secondary:{tendrils:between(r,.5,1),blossomScale:between(r,.8,1.3),veins:between(r,.4,1)},
      space:{spread:between(r,.9,1.2),canopy:between(r,.7,1.3),rootVisibility:between(r,.3,.9)},
      atmosphere:{terrain:pick(r,['abyss','forest-floor','cavern']),fog:between(r,.4,1),spores:between(r,.5,1),lightShafts:between(r,.3,1),fireflies:between(r,.3,1)},
      material:{bioluminescence:between(r,.6,1.3),translucency:between(r,.3,.8),bark:between(r,.2,.7)},
      motion:{sway:between(r,.5,1.3),current:between(r,0,6.283),flow:between(r,.6,1.4),breath:pick(r,[2,4,4,8]),turbulence:between(r,.3,.9)},
      camera:{personality:pick(r,['wandering','crane']),distance:between(r,.85,1.1),elevation:between(r,.18,.42),fov:pick(r,[34,38,42]),drift:between(r,.4,1)},
      agents:{form:pick(r,['firefly-swarm','pollinator']),swarm:pick(r,[18,24,32])},
      effects:{'subsystem.created':'sprout','module.created':'branch-growth','structure.created':'unfurl','structure.removed':'shed',
        'subsystem.connected':'mycelium-bridge','validation.failed':'blight','validation.passed':'glow-wave','validation.recovered':'regreen',
        'refactor.validated':'metamorphosis','milestone.achieved':'fractal-bloom','repository.checkpoint':'spore-release','world.expanded':'season-turn'}
    };
  },
  'machine-cathedral'(r,t){
    return {
      geometry:{architecture:pick(r,['gothic','brutalist','deco','spire']),setback:between(r,0,.35),spire:between(r,.3,1),buttress:between(r,0,1)},
      secondary:{mechanisms:between(r,.4,1),windows:between(r,.6,1.2),beacons:between(r,.4,1)},
      space:{spread:between(r,.95,1.15),streets:between(r,.8,1.2)},
      atmosphere:{weather:pick(r,['dusk-haze','night-fog','steam']),fog:between(r,.4,1),motes:between(r,.4,1),searchlights:between(r,0,1)},
      material:{stone:between(r,.3,.8),metal:between(r,.2,.7),glass:between(r,.2,.7)},
      motion:{mechanism:between(r,.6,1.3),breath:pick(r,[4,8]),turbulence:between(r,.2,.6)},
      camera:{personality:pick(r,['architectural','procession']),distance:between(r,.9,1.1),elevation:between(r,.3,.55),fov:pick(r,[30,34,38]),drift:between(r,.3,.8)},
      agents:{form:'drone'},
      effects:{'subsystem.created':'foundation','module.created':'raise','structure.created':'storey','structure.removed':'dismantle',
        'subsystem.connected':'lock-mechanism','validation.failed':'stress-fracture','validation.passed':'window-scan','validation.recovered':'restore',
        'refactor.validated':'reassemble','milestone.achieved':'illumination','repository.checkpoint':'set-in-stone','world.expanded':'district-lights'}
    };
  }
};
// Ambient layers every world keeps alive with no events, and the ones verified milestones unlock (lasting change).
const AMBIENT={
  'stellar-forge':{base:['nebula','starfield','convection','orbits','corona-loops','dust-lanes'],unlocks:['aurora-veils','plasma-currents','distant-pulsar','galactic-halo']},
  'fractal-biosphere':{base:['spores','sway','nutrient-flow','light-shafts','breathing-glow'],unlocks:['fireflies','blossom-drift','canopy-veins','bioluminescent-tide']},
  'machine-cathedral':{base:['motes','window-breath','conduit-flow','fog'],unlocks:['searchlights','mechanisms','beacons','aurora-glass']}
};
function genome(family,seed,variant,traits){
  const r=rng('genome',family,seed,variant);
  const g=GENOMES[family](r,traits);
  const size=clamp(Math.log2(1+traits.modules)/10);
  return {...g,palette:palette(rng('palette',family,seed,variant),family,traits),
    light:{exposure:between(r,.95,1.25),bloom:between(r,.7,1.25),bloomThreshold:between(r,.55,.8),contrast:between(r,.9,1.15),grain:between(r,.015,.04),vignette:between(r,.2,.45)},
    ambient:AMBIENT[family],
    music:{reactivity:between(r,.3,.9),beatPulse:between(r,.2,.7)},
    agentProminence:round(.6+.4*clamp(traits.agentShare*2+traits.agents/8)),
    limits:{detail:round(1-.55*size),maxParticles:Math.round(6000+18000*(1-size*.4)),maxLabels:pick(r,[4,5,6])}};
}
const DEFAULT_OVERRIDES={intensity:1,motion:1,atmosphere:1,labels:'cinematic'};
function generate(project,{seed,variant=0,family=null,source='generated',locked=false,traits=null,now=Date.now()}={}){
  const s=(seed??project?.performance?.identity?.seed??parseInt(sha(project?.projectId||'').slice(0,8),16))>>>0;
  const t=traits||traitsOf(project);
  const scores=familyScores(t,s,variant);
  const chosen=family&&FAMILIES.includes(family)?family:FAMILIES.slice().sort((a,b)=>scores[b]-scores[a]||a.localeCompare(b))[0];
  return {schema:RECIPE_SCHEMA,recipeVersion:RECIPE_VERSION,rendererVersion:RENDERER_VERSION,projectSeed:s,variant,
    source:family?'user':source,locked:!!locked||!!family,founded:!!family||!!locked||t.modules>=FOUNDING_MODULES,
    createdAt:now,traits:t,family:chosen,familyName:FAMILY_NAMES[chosen],familyScores:scores,genome:genome(chosen,s,variant,t),
    overrides:{...DEFAULT_OVERRIDES},aliases:{},title:null};
}
// A stored recipe is kept unless it is still provisional and unlocked; user edits never touch the genome's inputs.
function resolve(stored,project,now=Date.now()){
  if(stored&&stored.schema===RECIPE_SCHEMA&&(stored.founded||stored.locked))return {recipe:stored,changed:false};
  const next=generate(project,{seed:stored?.projectSeed,variant:stored?.variant||0,now});
  if(stored){next.overrides={...DEFAULT_OVERRIDES,...stored.overrides};next.aliases=stored.aliases||{};next.title=stored.title??null;}
  const changed=!stored||JSON.stringify({...stored,createdAt:0})!==JSON.stringify({...next,createdAt:0});
  return {recipe:changed?next:stored,changed};
}
const ALIAS=/^[\p{L}\p{N} .,'&()-]{1,40}$/u;
// User actions: choose a family, regenerate, lock, adjust overrides, name subsystems. Inputs are validated strictly.
function update(recipe,action,project,now=Date.now()){
  const keep=r=>Object.assign(r,{overrides:recipe.overrides,aliases:recipe.aliases,title:recipe.title});
  switch(action?.type){
    case 'family':if(!FAMILIES.includes(action.family))throw new Error('Unknown family');
      return keep(generate(project,{seed:recipe.projectSeed,variant:recipe.variant,family:action.family,traits:recipe.traits,now}));
    case 'regenerate':{const r=generate(project,{seed:recipe.projectSeed,variant:(recipe.variant||0)+1,traits:recipe.founded?recipe.traits:null,now});
      if(action.keepFamily)return keep(generate(project,{seed:recipe.projectSeed,variant:r.variant,family:recipe.family,traits:r.traits,now}));
      return keep(Object.assign(r,{locked:true,founded:true,source:'user'}));}
    case 'lock':return {...recipe,locked:action.locked!==false,founded:recipe.founded||action.locked!==false};
    case 'overrides':{const o={...recipe.overrides};
      for(const k of ['intensity','motion','atmosphere'])if(action[k]!==undefined){const v=Number(action[k]);if(!Number.isFinite(v))throw new Error(`Invalid ${k}`);o[k]=round(clamp(v,0,2));}
      if(action.labels!==undefined){if(!['cinematic','explorer','stream','off'].includes(action.labels))throw new Error('Invalid labels');o.labels=action.labels;}
      return {...recipe,overrides:o};}
    case 'alias':{if(typeof action.id!=='string'||!/^[a-f0-9]{14}$/.test(action.id))throw new Error('Invalid id');
      const aliases={...recipe.aliases};if(action.name===null||action.name==='')delete aliases[action.id];
      else{if(typeof action.name!=='string'||!ALIAS.test(action.name))throw new Error('Invalid name');aliases[action.id]=action.name;}
      return {...recipe,aliases};}
    case 'title':{if(action.title!==null&&(typeof action.title!=='string'||!ALIAS.test(action.title)))throw new Error('Invalid title');return {...recipe,title:action.title||null};}
    default:throw new Error('Unknown action');
  }
}
// Structural distance between two recipes, ignoring palette: how differently two worlds are built and move.
function structuralDifferences(a,b){
  const diffs=[];
  if(a.family!==b.family)diffs.push('family');
  const walk=(x,y,p)=>{for(const k of new Set([...Object.keys(x||{}),...Object.keys(y||{})])){
    if(p===''&&['palette','effects','ambient','limits'].includes(k))continue;
    const u=x?.[k],v=y?.[k];
    if(u&&typeof u==='object'&&!Array.isArray(u))walk(u,v,p+k+'.');
    else if(typeof u==='number'&&typeof v==='number'){if(Math.abs(u-v)>.08*Math.max(1,Math.abs(u),Math.abs(v)))diffs.push(p+k);}
    else if(JSON.stringify(u)!==JSON.stringify(v))diffs.push(p+k);}};
  walk(a.genome,b.genome,'');
  return diffs;
}
module.exports={RECIPE_SCHEMA,RECIPE_VERSION,RENDERER_VERSION,FAMILIES,FAMILY_NAMES,FOUNDING_MODULES,traitsOf,familyScores,generate,resolve,update,structuralDifferences};

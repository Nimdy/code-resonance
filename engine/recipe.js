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
//
// Visual packs (engine/packs.js): an installed world pack is a family the user can choose (never chosen
// automatically); its genome is drawn from the parameters its manifest declares. A declarative or shader pack is an
// overlay on its base family (parameters, palette, light, technique, effect mapping). A recipe that names a pack which
// is no longer installed is served without it (flagged `unavailable`) and kept as stored, so reinstalling restores it.
//
// Preview families (PREVIEWS, engine/catalog.js PREVIEWS): built-in worlds still being designed, chosen only explicitly
// (the Visual Studio, the render lab's --family) exactly as a pack is. They are never scored and never drawn: FAMILIES
// alone drives the family scores and their random draws, and a preview's genome and palette come from its own streams,
// so adding one changes no existing identity (tests/recipe.test.js, tests/synaptic.test.js, tests/fractal.test.js and
// tests/terrain.test.js pin that). Taking one into the automatic choice later is a new generator version with its own scoring stream.
//
// Tuning: the user may set exact values for the genome parameters the family declares (engine/catalog.js for built-in
// families, the manifest for a world pack, plus a shader look's uniforms). `tuning` records them with the generated
// value each one replaced, so a reset restores the generated genome exactly; a regenerated genome on the same family
// gets them again, a family change drops them.
const {sha}=require('../receiver/protocol');
const catalog=require('./catalog');
const Composition=require('../public/composition.js');
const RECIPE_SCHEMA='code-resonance.recipe.v1';
const RECIPE_VERSION=4;      // generator: bump when the same inputs would produce a different genome
                             // (2: Fractal Biosphere species from the data; Machine Cathedral shafts and wetness added;
                             //  3: digital life, `life`, for the built-in families, from a separate random stream so every
                             //  v2 value is unchanged;
                             //  4: the Phase 11 defaults, drawn from no random stream so every v3 value is unchanged: the
                             //  cinematic finish `technique.finish` and the musical ecology `life.ecology` where life is
                             //  generated, the composed score `music.score` everywhere)
const RENDERER_VERSION=1;    // the world renderers this genome is written for
const FOUNDING_MODULES=6;
const FAMILIES=['stellar-forge','fractal-biosphere','machine-cathedral'];
const PREVIEWS=['synaptic-storm','fractal-continuum','temporal-terrain'];
const FAMILY_NAMES={'stellar-forge':'Stellar Forge','fractal-biosphere':'Fractal Biosphere','machine-cathedral':'Machine Cathedral','synaptic-storm':'Synaptic Storm (preview)','fractal-continuum':'Fractal Continuum (preview)',
  'temporal-terrain':'Temporal Terrain (preview)'};
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
const HUES={'stellar-forge':[20,35,200,215,265,285,320,170],'fractal-biosphere':[140,165,180,190,95,300,330,50],'machine-cathedral':[30,40,205,220,190,15,260]};
const WHEEL=[0,30,60,120,180,210,240,280,320];
function palette(r,family,traits,hues=null){
  const scheme=weighted(r,[['analogous',3],['complementary',2],['split',2],['triad',1]]);
  // Built-in families draw one hue per family table (in this order) and keep their own: the draw sequence, and so every
  // existing identity, stays exactly as it was generated before packs existed.
  let base;
  if(!hues&&HUES[family]){const drawn={};for(const [f,list] of Object.entries(HUES))drawn[f]=pick(r,list);base=drawn[family];}
  else base=pick(r,hues||WHEEL);
  base+=between(r,-14,14);
  const offset={analogous:[28,-30],complementary:[180,150],split:[150,210],triad:[120,240]}[scheme];
  const sat=between(r,.55,.85)*(1-.2*clamp(traits.tests*2)),deepHue=base+offset[1]*.35;
  return {scheme,hue:round(base,1),
    primary:hsl(base,sat,.58),secondary:hsl(base+offset[0],sat*.9,.55),accent:hsl(base+offset[1],clamp(sat+.1),.62),
    highlight:hsl(base+offset[0]*.5,.35,.86),deep:hsl(deepHue,.55,between(r,.035,.06)),haze:hsl(deepHue+12,.5,.16),
    warning:hsl(pick(r,[8,14,355]),.85,.58),valid:hsl(pick(r,[48,165,140]),.7,.7)};
}
// Synaptic Storm (preview): golden somas in a navy-violet void; the membrane's hue and the somas' warmth are the
// identity's own, from its own stream.
function synapticPalette(r,family,traits){
  const scheme=weighted(r,[['complementary',3],['split',2],['analogous',1]]);
  const mem=pick(r,[226,238,250,262,274,288,204,192])+between(r,-8,8),soma=pick(r,[30,36,26,40,22,33])+between(r,-4,4);
  const sat=between(r,.5,.75)*(1-.15*clamp(traits.tests*2));
  return {scheme,hue:round(mem,1),primary:hsl(soma,.92,.58),secondary:hsl(mem,sat,.62),accent:hsl(soma+12,1,.7),highlight:hsl(soma+20,.6,.9),
    deep:hsl(mem+6,.62,between(r,.04,.065)),haze:hsl(mem+20,.5,.17),warning:hsl(pick(r,[350,6,340]),.82,.58),valid:hsl(pick(r,[160,172,186]),.66,.66)};
}
// Fractal Continuum (preview): a matte sculpted surface in a black void, lit by sites of light. The surface's hue (teal
// like the reference, or blue, jade, violet, copper, amber, rose) and whether its light contrasts with it (warm on cool,
// cool on warm) or shares its family are the identity's own, from its own stream. Failure stays red-magenta, never the
// light's colour.
function fractalPalette(r,family,traits){
  const scheme=weighted(r,[['complementary',3],['analogous',2]]);
  const hue=pick(r,[188,192,182,198,206,172,160,214,266,24,38,330])+between(r,-6,6),cool=hue>=150&&hue<=290;
  const glow=scheme==='complementary'?(cool?pick(r,[34,40,46,28]):pick(r,[186,196,176])):hue+pick(r,[-28,24,32]);
  const sat=between(r,.36,.58)*(1-.12*clamp(traits.tests*2));
  const dist=h=>{const d=Math.abs((((h-glow)%360)+360)%360);return Math.min(d,360-d);};
  const warn=[352,346,6,338].find(h=>dist(h)>=40)??322;
  return {scheme,hue:round(hue,1),primary:hsl(hue,sat,between(r,.34,.42)),secondary:hsl(hue+between(r,-24,24),sat*.9,.2),accent:hsl(glow,.88,.62),
    highlight:hsl(hue+8,.32,.84),deep:hsl(hue+10,.5,between(r,.016,.03)),haze:hsl(hue+14,.42,.12),warning:hsl(warn,.85,.58),valid:hsl(pick(r,[168,178,150,190]),.62,.7)};
}
// Temporal Terrain (preview): luminous contour lines over a dark relief under a night sky. The lines' first hue (teal,
// cyan, azure, violet, rose, amber or jade), whether the present's lamps contrast with it (warm on cool, cool on warm)
// and the rock's tint are the identity's own, from its own stream. A fault stays red to magenta, at least 40 degrees
// from the lamps' colour: never gold.
function terrainPalette(r,family,traits){
  const scheme=weighted(r,[['complementary',3],['analogous',2],['split',1]]);
  const hue=pick(r,[186,196,176,206,218,264,284,328,346,30,40,162])+between(r,-6,6),cool=hue>=150&&hue<=300;
  const lamp=cool?pick(r,[34,40,28,44]):pick(r,[190,200,182]),rock=hue+pick(r,[-18,12,24]),sky=pick(r,[222,232,246,212])+between(r,-6,6);
  const sat=between(r,.6,.82)*(1-.12*clamp(traits.tests*2));
  const dist=h=>{const d=Math.abs((((h-lamp)%360)+360)%360);return Math.min(d,360-d);};
  const warn=[356,350,8,342].find(h=>dist(h)>=40)??326;
  return {scheme,hue:round(hue,1),primary:hsl(hue,sat,.6),secondary:hsl(rock,.2,between(r,.12,.17)),accent:hsl(lamp,.92,.62),highlight:hsl(hue+6,.32,.86),
    deep:hsl(sky,.55,between(r,.018,.03)),haze:hsl(sky+8,.38,between(r,.1,.14)),warning:hsl(warn,.88,.57),valid:hsl(pick(r,[160,172,150,186]),.68,.66)};
}
const PALETTES={'synaptic-storm':synapticPalette,'fractal-continuum':fractalPalette,'temporal-terrain':terrainPalette};
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
    // Species from the data (the seed still decides between close candidates): component surfaces grow coral (polyps,
    // blossoms), folder branching grows ferns, flowing function code kelp, dense cross-subsystem dependencies a
    // mycelial network, classes, types and tests crystal trees.
    const species=weighted(r,[['mycelial',.3+.8*clamp(t.crossDensity||0)],['kelp',.3+(t.functions||0)*(1-clamp((t.model||0)*3))],['fern',.4+2*clamp(t.branching||0)],
      ['crystal-tree',.4+3*(t.model||0)+1.5*(t.tests||0)],['coral',.5+3*clamp(t.uiModules||0)]]);
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
    const g={
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
    return g;
  },
  // Preview (chosen only explicitly). Size sets how many files share a neuron, symbols per file the dendrites' reach,
  // cross-subsystem coupling how tightly clusters gather, function-heavy code how much the processes wander, the agents'
  // share of the work the spontaneous firing, tests how tightly it keeps the beat.
  'synaptic-storm'(r,t){
    const size=clamp(Math.log2(1+t.modules)/9);
    return {
      geometry:{filesPerNeuron:t.modules<40?pick(r,[3,4]):t.modules<200?pick(r,[4,5,6]):pick(r,[6,7,8]),clustering:round(between(r,.8,1.2)*(1-.2*clamp(t.crossDensity||0))),
        dendrites:round(between(r,.85,1.15)*(.85+.3*clamp((t.depth||0)/12))),branchAngle:between(r,.35,.75),curl:round(clamp(between(r,.15,.5)+.25*clamp(t.functions||0))),somaSize:between(r,.85,1.25)},
      space:{spread:between(r,.9,1.2),depth:round(between(r,.4,.85)+.15*size)},
      material:{translucency:between(r,.45,.9),glow:between(r,.85,1.3)},
      atmosphere:{particles:between(r,.6,1.1),haze:between(r,.5,1),depthOfField:between(r,.6,1.1),ghosts:round(between(r,.6,1)*(1.15-.3*size))},
      motion:{firingRate:round(between(r,.75,1.15)*(.85+.35*clamp((t.agentShare||0)*2))),conduction:between(r,.8,1.25),drift:between(r,.4,1),breath:pick(r,[2,4,4,8]),
        sync:round(clamp(between(r,.35,.75)+.25*clamp((t.tests||0)*3)))},
      camera:{personality:pick(r,['orbit','glide']),distance:between(r,.9,1.12),elevation:between(r,.16,.42),fov:pick(r,[30,34,38]),drift:between(r,.4,1)},
      agents:{form:'signal',trail:between(r,.6,1.4)},
      effects:{'subsystem.created':'neurogenesis','module.created':'sprout','structure.created':'arborize','structure.removed':'prune',
        'subsystem.connected':'axon-link','validation.failed':'misfire','validation.passed':'activation-wave','validation.recovered':'resync',
        'refactor.validated':'consolidate','milestone.achieved':'storm','repository.checkpoint':'potentiate','world.expanded':'expand'}
    };
  },
  // Preview (chosen only explicitly). The code's character picks the universe (the formula: a Mandelbulb for interface
  // and hub-centred code, a Julia bulb for function-heavy code, a Mandelbox for classes and types and coupled
  // subsystems, a kaleidoscopic crystal for tested, widely branching code), the number of subsystems the bulbs' n-fold
  // branching, coupling their twist, symbols per file how far it may unfold, the project's size how closely its sites
  // stand; the seeded share makes similar projects different universes.
  'fractal-continuum'(r,t){
    const form=weighted(r,[['bulb',1.3+1.2*clamp((t.uiModules||0)*2)+.6*clamp((t.hubness||0)*2)],['julia',.8+1.5*clamp(((t.functions||0)-.45)*3)],
      ['box',.6+1.6*clamp((t.model||0)*3)+.4*clamp(t.crossDensity||0)],['kifs',.6+1.5*clamp((t.tests||0)*4)+.4*clamp((t.branching||0)*2)]]);
    const power=Math.max(4,Math.min(10,Math.round(4+1.1*Math.log2(1+(t.districts||1))+(r()-.5)*2)));
    return {
      fractal:{form,power,twist:r()<.35?0:round(clamp(between(r,.08,.45)+.3*clamp(t.crossDensity||0))),julia:Math.floor(r()*6)%6,shape:between(r,0,1),
        detail:round(between(r,.9,1.1)*(.92+.16*clamp((t.depth||0)/10)))},
      geometry:{spacing:round(clamp(Math.sqrt(2.2/Math.max(6,t.modules||0)),.05,.6)),regions:between(r,.85,1.15),swell:between(r,.15,.4),siteSize:between(r,.85,1.2),threads:between(r,.6,1.1)},
      material:{occlusion:between(r,.85,1.2),trap:between(r,.25,.8),sheen:between(r,.2,.6),rim:between(r,.4,1),glow:between(r,.85,1.25)},
      atmosphere:{haze:between(r,.4,1),particles:between(r,.5,1.1),halo:between(r,.4,1)},
      motion:{breath:pick(r,[2,4,4,8]),drift:between(r,.4,1),shimmer:round(between(r,.55,1)*(.85+.3*clamp((t.agentShare||0)*2))),
        resonance:round(between(r,.7,1.1)*(.85+.35*clamp((t.agentShare||0)*2))),light:between(r,.3,1),sync:round(clamp(between(r,.35,.75)+.25*clamp((t.tests||0)*3)))},
      camera:{personality:weighted(r,[['orbit',3],['glide',2],['pole',form==='bulb'?3:1]]),distance:between(r,.95,1.08),elevation:between(r,.18,.55),fov:pick(r,[28,32,36]),drift:between(r,.4,1)},
      agents:{form:'signal',trail:between(r,.6,1.4)},
      effects:{'subsystem.created':'emerge','module.created':'seed','structure.created':'unfold','structure.removed':'erode',
        'subsystem.connected':'thread','validation.failed':'decohere','validation.passed':'coherence-wave','validation.recovered':'recohere',
        'refactor.validated':'refine','milestone.achieved':'bloom','repository.checkpoint':'glow','world.expanded':'deepen'}
    };
  },
  // Preview (chosen only explicitly). The project's size at generation sets how closely files stand across a range (so
  // a project of 17 files and one of 450 both fill the land), symbols per file how high the ridges rise, coupling how
  // high the ranges' plateaus, tests how finely the contours are spaced; many subsystems favour the map view.
  'temporal-terrain'(r,t){
    return {
      time:{scale:between(r,34,52),depth:between(r,54,66)},
      relief:{height:round(between(r,.85,1.15)*(.92+.16*clamp((t.depth||0)/10))),massif:round(clamp(between(r,.75,1.1)+.3*clamp(t.crossDensity||0),.3,1.8)),
        detail:between(r,.75,1.2),spacing:round(clamp(200/Math.max(8,(t.modules||0)+2*Math.max(1,t.districts||1)),.3,9))},
      contour:{interval:round(between(r,.8,1.05)*(1-.14*clamp((t.tests||0)*3))),index:pick(r,[4,5,5]),width:between(r,.95,1.25),glow:between(r,.9,1.2)},
      material:{rock:between(r,.65,1),sheen:between(r,.2,.55),cut:between(r,.85,1.2)},
      atmosphere:{mist:between(r,.55,1.05),haze:between(r,.55,1),motes:between(r,.4,1)},
      motion:{breath:pick(r,[2,4,4,8]),light:between(r,.4,1),shimmer:round(between(r,.55,1)*(.85+.3*clamp((t.agentShare||0)*2))),drift:between(r,.4,1)},
      camera:{personality:weighted(r,[['survey',3],['valley',2],['map',(t.districts||0)>=8?2:1]]),distance:between(r,.95,1.08),elevation:between(r,.3,.6),fov:pick(r,[30,34,38]),drift:between(r,.4,1)},
      agents:{form:'surveyor',trail:between(r,.6,1.4)},
      effects:{'subsystem.created':'range','module.created':'peak','structure.created':'uplift','structure.removed':'erode',
        'subsystem.connected':'road','validation.failed':'fault','validation.passed':'scan','validation.recovered':'heal',
        'refactor.validated':'terrace','milestone.achieved':'sunrise','repository.checkpoint':'survey','world.expanded':'horizon'}
    };
  }
};
// Ambient layers every world keeps alive with no events, and the ones verified milestones unlock (lasting change).
const AMBIENT={
  'stellar-forge':{base:['nebula','starfield','convection','orbits','corona-loops','dust-lanes'],unlocks:['aurora-veils','plasma-currents','distant-pulsar','galactic-halo']},
  'fractal-biosphere':{base:['spores','sway','nutrient-flow','light-shafts','breathing-glow'],unlocks:['fireflies','blossom-drift','canopy-veins','bioluminescent-tide']},
  'machine-cathedral':{base:['motes','window-breath','conduit-flow','fog'],unlocks:['searchlights','mechanisms','beacons','aurora-glass']},
  'synaptic-storm':{base:['spontaneous-firing','breathing-glow','drift','motes','bokeh'],unlocks:['glial-stars','neuromodulator-tide','myelin-sheen','deep-network']},
  'fractal-continuum':{base:['breathing','light-drift','shimmer','resonance','motes'],unlocks:['stardust','inner-light','corona','echoes']},
  'temporal-terrain':{base:['light-path','mist','shimmer','flow','motes'],unlocks:['dawn','lanterns','stars','aurora']}
};
function common(r,traits){
  const size=clamp(Math.log2(1+traits.modules)/10);
  return {light:{exposure:between(r,.95,1.25),bloom:between(r,.7,1.25),bloomThreshold:between(r,.55,.8),contrast:between(r,.9,1.15),grain:between(r,.015,.04),vignette:between(r,.2,.45)},
    music:{reactivity:between(r,.3,.9),beatPulse:between(r,.2,.7)},
    agentProminence:round(.6+.4*clamp(traits.agentShare*2+traits.agents/8)),
    limits:{detail:round(1-.55*size),maxParticles:Math.round(6000+18000*(1-size*.4)),maxLabels:pick(r,[4,5,6])}};
}
// Values added to a family after its identities were first generated: drawn from their own seeded stream, so every
// earlier value of an identity keeps exactly its draw (recipes stored before them fall back to the world's defaults).
const ADDED={
  // Machine Cathedral: moonlight shafts through the haze, and how wet (mirror-like) the obsidian floor is.
  'machine-cathedral'(r,g){g.atmosphere.shafts=between(r,.5,1.1);g.material.wetness=between(r,.3,.9);}
};
function genome(family,seed,variant,traits){
  const r=rng('genome',family,seed,variant);
  const g=GENOMES[family](r,traits);
  ADDED[family]?.(rng('genome-added',family,seed,variant),g);
  const {light,music,agentProminence,limits}=common(r,traits);
  return {...g,palette:(PALETTES[family]||palette)(rng('palette',family,seed,variant),family,traits),light,ambient:AMBIENT[family],music,agentProminence,limits};
}
// A world pack's genome: its declared parameters (seeded, optionally derived from a project trait), a palette from its
// preferred hues, and the shared light / music / limits; its effect vocabulary and ambient layers come from the manifest.
function drawParameter(r,p,traits){
  if(p.type==='enum'){return p.weights?weighted(r,p.values.map((v,i)=>[v,p.weights[i]??1])):pick(r,p.values);}
  if(p.type==='boolean')return r()<(p.p??.5);
  let x;
  if(p.from){const t=Number(traits[p.from.trait])||0,j=p.from.jitter??.15;x=clamp(clamp(t*(p.from.scale??1)+(p.from.offset??0))+(r()-.5)*2*j);}
  else x=r();
  const v=p.min+(p.max-p.min)*x;return p.type==='integer'?Math.round(v):round(v);
}
function packGenome(def,seed,variant,traits){
  const r=rng('genome',def.id,seed,variant);const params={};
  for(const [k,p] of Object.entries(def.parameters||{}).sort(([a],[b])=>a.localeCompare(b)))params[k]=drawParameter(r,p,traits);
  return {params,palette:palette(rng('palette',def.id,seed,variant),def.id,traits,def.palette?.hues),...common(r,traits),
    ambient:{base:def.ambient?.base||[],unlocks:def.ambient?.unlocks||[]},effects:{...def.effects}};
}
const setPath=(o,p,v)=>{const ks=p.split('.');let x=o;for(const k of ks.slice(0,-1)){if(!x[k]||typeof x[k]!=='object')x[k]={};x=x[k];}x[ks.at(-1)]=v;};
// Removes a path and the objects it leaves empty (a tuned path the genome did not have, e.g. technique.tint).
const unsetPath=(o,p)=>{const ks=p.split('.'),chain=[o];for(const k of ks.slice(0,-1)){const x=chain.at(-1)[k];if(!x||typeof x!=='object')return;chain.push(x);}
  delete chain.at(-1)[ks.at(-1)];for(let i=chain.length-1;i>0&&!Object.keys(chain[i]).length;i--)delete chain[i-1][ks[i-1]];};
// A declarative or shader pack over its base family: values, or [min, max] ranges drawn per project from the seed.
function applyOverlay(g,overlay,r,traits){
  const out=JSON.parse(JSON.stringify(g));
  for(const [k,v] of Object.entries(overlay.overrides||{}).sort(([a],[b])=>a.localeCompare(b))){
    const range=Array.isArray(v)&&v.length===2&&!k.startsWith('technique.');
    setPath(out,k,range?(Number.isInteger(v[0])&&Number.isInteger(v[1])&&/\.(?:spiralArms|loops|dustLanes|fov|swarm|maxLabels)$/.test(k)?Math.round(between(r,v[0],v[1])):between(r,v[0],v[1])):v);
  }
  if(overlay.effects)out.effects={...out.effects,...overlay.effects};
  if(overlay.unlocks)out.ambient={...out.ambient,unlocks:[...overlay.unlocks]};
  if(overlay.technique)out.technique={...(out.technique||{}),...overlay.technique};
  // A shader pack's own uniforms, drawn per project like a world pack's parameters.
  if(overlay.uniforms){out.uniforms={};for(const [k,p] of Object.entries(overlay.uniforms).sort(([a],[b])=>a.localeCompare(b)))out.uniforms[k]=drawParameter(r,p,traits);}
  return out;
}
// labels null: the project follows the global information mode (Settings) until one is chosen for it.
const DEFAULT_OVERRIDES={intensity:1,motion:1,atmosphere:1,labels:null};
const usable=(registry,id)=>{const p=registry?.byId?.[id];return p&&p.ok&&p.compatible?p:null;};
const packFamily=(registry,id)=>registry?.families?.[id]&&usable(registry,id)?registry.families[id]:null;
// ---- Tuning ---------------------------------------------------------------------------------------------------------
const clone=x=>x===undefined?null:JSON.parse(JSON.stringify(x));
const HEX=/^#[0-9a-f]{6}$/i;
const sorted=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));
// Every genome path the recipe can be tuned on, with its type, range and documentation; group = first path segment.
function tunable(recipe,registry=null){
  const out={};
  const add=(p,s,name)=>{out[p]={type:s.type,...(s.type==='number'||s.type==='integer'||s.type==='vec3'?{min:s.min,max:s.max}:{}),...(s.type==='enum'?{values:[...s.values]}:{}),
    doc:s.doc||s.description||name,group:p.split('.')[0]};};
  const own=catalog.FAMILIES[recipe?.family]||(Object.hasOwn(catalog.PREVIEWS,recipe?.family??'')?catalog.PREVIEWS[recipe.family]:null);
  if(own)for(const [p,s] of Object.entries(own.parameters))add(p,s,p);
  else{const world=recipe?.familyKind==='pack'?packFamily(registry,recipe.family):null;if(!world)return out;
    for(const [p,s] of Object.entries(catalog.COMMON))add(p,s,p);
    for(const [k,s] of Object.entries(world.parameters||{}))add(`params.${k}`,s,k);}
  // A shader look's uniforms (a declarative look only shifts the family's own values, already listed).
  const look=recipe?.pack?.kind==='shader'?usable(registry,recipe.pack.id)?.overlay:null;
  if(look?.base===recipe.family)for(const [k,s] of Object.entries(look.uniforms||{}))add(`uniforms.${k}`,s,k);
  return out;
}
// Exact values only: the [min, max] ranges pack authors may write are draws, not settings.
const inRange=(s,x)=>typeof x==='number'&&Number.isFinite(x)&&x>=s.min&&x<=s.max;
function exact(s,v){
  switch(s.type){
    case 'number':return inRange(s,v);
    case 'integer':return inRange(s,v)&&Number.isInteger(v);
    case 'enum':return s.values.includes(v);
    case 'boolean':return typeof v==='boolean';
    case 'color':return typeof v==='string'&&HEX.test(v);
    case 'vec3':return Array.isArray(v)&&v.length===3&&v.every(x=>inRange(s,x));
    default:return false;
  }
}
const expected=s=>s.type==='enum'?`one of ${s.values.join(', ')}`:s.type==='color'?'a #rrggbb colour':s.type==='boolean'?'true or false':s.type==='vec3'?`three numbers in [${s.min}, ${s.max}]`:`a single ${s.type} in [${s.min}, ${s.max}]`;
const canonical=(s,v)=>s.type==='color'?v.toLowerCase():clone(v);
const restore=(g,p,v)=>v===null?unsetPath(g,p):setPath(g,p,clone(v));
// The generated value of every tunable path (what a tuned path returns to).
function baseValues(recipe,registry=null){
  const t=recipe?.tuning?.family===recipe?.family?recipe.tuning:null;
  return Object.fromEntries(Object.keys(tunable(recipe,registry)).map(p=>[p,t&&Object.hasOwn(t.base,p)?t.base[p]:clone(catalog.get(recipe.genome,p))]));
}
// Validates every value first (nothing is applied when one is wrong), then applies them over a copy of the genome. A
// tuned recipe is a deliberate identity: it is locked and founded (never re-derived), its source unchanged.
function tune(recipe,values,registry){
  if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Invalid tuning: values must be an object of path: value');
  const keys=Object.keys(values).sort();if(keys.length>128)throw new Error('Invalid tuning: at most 128 values at once');
  // Nothing to tune is no change: an empty batch must not make a provisional identity permanent.
  if(!keys.length)return recipe;
  // Own keys only: "constructor" or "__proto__" are not parameters.
  const spec=tunable(recipe,registry),prior=recipe.tuning?.family===recipe.family?recipe.tuning:null;
  for(const k of keys){const v=values[k];
    if(!Object.hasOwn(spec,k)&&!(v===null&&prior&&Object.hasOwn(prior.values,k)))throw new Error(`Unknown tunable parameter "${k}"`);
    if(v!==null&&!exact(spec[k],v))throw new Error(`Invalid value for "${k}": must be ${expected(spec[k])}`);}
  const genome=clone(recipe.genome),vals={...prior?.values},base={...prior?.base};
  for(const k of keys){const v=values[k];
    if(v===null){if(Object.hasOwn(vals,k)){restore(genome,k,base[k]);delete vals[k];delete base[k];}continue;}
    if(!Object.hasOwn(base,k))base[k]=clone(catalog.get(genome,k));
    vals[k]=canonical(spec[k],v);setPath(genome,k,clone(vals[k]));}
  return {...recipe,genome,tuning:Object.keys(vals).length?{family:recipe.family,values:sorted(vals),base:sorted(base)}:null,locked:true,founded:true};
}
function untune(recipe){
  const t=recipe.tuning;if(!t)return {...recipe,tuning:null};
  const genome=clone(recipe.genome);if(t.family===recipe.family)for(const k of Object.keys(t.base))restore(genome,k,t.base[k]);
  return {...recipe,genome,tuning:null};
}
// A regenerated genome on the same family gets the tuning again (values still tunable and valid, base recomputed from
// the new draw); another family drops it. Absent stays absent, so recipes that were never tuned keep their exact shape.
function retune(next,t,registry){
  if(t===undefined)return next;
  if(!t||t.family!==next.family)return Object.assign(next,{tuning:null});
  const spec=tunable(next,registry),genome=clone(next.genome),values={},base={};
  for(const k of Object.keys(t.values||{}).sort())if(Object.hasOwn(spec,k)&&exact(spec[k],t.values[k])){base[k]=clone(catalog.get(genome,k));values[k]=canonical(spec[k],t.values[k]);setPath(genome,k,clone(values[k]));}
  return Object.assign(next,{genome,tuning:Object.keys(values).length?{family:next.family,values,base}:null});
}
// `registry` (engine/packs.js createRegistry().snapshot()) makes installed world packs choosable and overlays usable.
// `version`: the generator to draw with (resolve keeps an identity stored before v4 on v3, without the v4 values).
function generate(project,{seed,variant=0,family=null,pack=null,source='generated',locked=false,traits=null,now=Date.now(),registry=null,version=RECIPE_VERSION}={}){
  const s=(seed??project?.performance?.identity?.seed??parseInt(sha(project?.projectId||'').slice(0,8),16))>>>0;
  const t=traits||traitsOf(project);
  const scores=familyScores(t,s,variant);
  // A preview is chosen only when asked for; the scores never include it.
  const preview=PREVIEWS.includes(family);
  const world=family&&!FAMILIES.includes(family)&&!preview?packFamily(registry,family):null;
  const chosen=family&&(FAMILIES.includes(family)||preview||world)?family:FAMILIES.slice().sort((a,b)=>scores[b]-scores[a]||a.localeCompare(b))[0];
  let g=world?packGenome(world,s,variant,t):genome(chosen,s,variant,t);
  const overlay=pack?usable(registry,pack):null;
  const applied=overlay?.overlay&&overlay.overlay.base===chosen?overlay:null;
  if(applied)g=applyOverlay(g,applied.overlay,rng('pack',applied.id,s,variant),t);
  // Digital life is part of a new built-in identity (a pack's world or look is its author's: never added to it). A
  // stored identity keeps exactly what it had; the Visual Studio can turn life on for it (tuning `life.enabled`).
  const builtin=!world&&!applied&&FAMILIES.includes(chosen);
  if(builtin)g={...g,life:lifeGenome(chosen,s,variant,version)};
  // v4: the cinematic finish is a new built-in identity's lens, never a pack's (an author's world or look keeps its own
  // grade until a finish is chosen for it); the composed score is every new identity's music.
  if(version>=4){if(builtin||preview)g={...g,technique:{...g.technique,finish:'cinematic'}};g={...g,music:{...g.music,score:3}};}
  const user=!!family||!!applied;
  return {schema:RECIPE_SCHEMA,recipeVersion:version,rendererVersion:RENDERER_VERSION,projectSeed:s,variant,
    source:user?'user':source,locked:!!locked||user,founded:user||!!locked||t.modules>=FOUNDING_MODULES,
    createdAt:now,traits:t,family:chosen,familyName:world?world.name:FAMILY_NAMES[chosen],familyKind:world?'pack':'builtin',familyScores:scores,genome:g,
    pack:applied?{id:applied.id,version:applied.version,kind:applied.kind}:null,
    overrides:{...DEFAULT_OVERRIDES},aliases:{},title:null};
}
// Artist-directed defaults with a little per-project character (each world's grammar sets the behaviour itself).
function lifeGenome(family,seed,variant,version){
  const r=rng('life',family,seed,variant);
  return {enabled:true,density:between(r,.85,1),vitality:between(r,.85,1.15),collective:between(r,.85,1.2),environment:1,trails:between(r,.85,1.15),persistence:1,music:1,
    attraction:1,repulsion:1,separation:1,alignment:1,cohesion:1,current:1,diffusion:1,radius:1,...(version>=4?{ecology:2}:{})};
}
// The generator a stored identity is redrawn with: one saved before v4 keeps v3 (what it was served as before v4
// existed) and never gains a v4 value by itself; `tune` upgrades it deliberately.
const generatorOf=stored=>stored&&!(stored.recipeVersion>=4)?3:RECIPE_VERSION;
// What a stored recipe needs from the installed packs, and whether they are there.
function availability(stored,registry){
  const missing={};
  if(stored?.familyKind==='pack'&&!packFamily(registry,stored.family))missing.family=stored.family;
  if(stored?.pack&&!usable(registry,stored.pack.id))missing.pack=stored.pack.id;
  return Object.keys(missing).length?missing:null;
}
// A stored recipe is kept unless it is still provisional and unlocked; user edits never touch the genome's inputs.
// A recipe whose pack is missing is served without it and not rewritten; one whose overlay pack was updated is redrawn.
function resolve(stored,project,now=Date.now(),registry=null){
  const missing=availability(stored,registry);
  if(stored&&missing){
    // Tuning applies to the family it was made on: kept over a missing look, inactive (null) on a fallback family.
    const keep=x=>Object.assign(retune(x,stored.tuning,registry),{overrides:stored.overrides,aliases:stored.aliases||{},title:stored.title??null,...(stored.composition?{composition:stored.composition}:{}),unavailable:missing});
    const version=generatorOf(stored);
    if(missing.family)return {recipe:keep(generate(project,{seed:stored.projectSeed,variant:stored.variant||0,traits:stored.founded?stored.traits:null,now,registry,version})),changed:false};
    return {recipe:keep(generate(project,{seed:stored.projectSeed,variant:stored.variant||0,family:stored.family,traits:stored.traits,now,registry,version})),changed:false};
  }
  if(stored?.pack){const p=usable(registry,stored.pack.id);
    if(p&&p.version!==stored.pack.version){const next=retune(Object.assign(generate(project,{seed:stored.projectSeed,variant:stored.variant||0,family:stored.family,pack:p.id,traits:stored.traits,now,registry,version:generatorOf(stored)}),
      {overrides:stored.overrides,aliases:stored.aliases||{},title:stored.title??null,locked:stored.locked,source:stored.source,...(stored.composition?{composition:stored.composition}:{})}),stored.tuning,registry);return {recipe:next,changed:true};}}
  if(stored&&stored.schema===RECIPE_SCHEMA&&(stored.founded||stored.locked))return {recipe:stored,changed:false};
  const next=generate(project,{seed:stored?.projectSeed,variant:stored?.variant||0,now,registry,version:generatorOf(stored)});
  if(stored){next.overrides={...DEFAULT_OVERRIDES,...stored.overrides};next.aliases=stored.aliases||{};next.title=stored.title??null;retune(next,stored.tuning,registry);}
  const changed=!stored||JSON.stringify({...stored,createdAt:0})!==JSON.stringify({...next,createdAt:0});
  return {recipe:changed?next:stored,changed};
}
const ALIAS=/^[\p{L}\p{N} .,'&()-]{1,40}$/u;
// ---- Compositions (the Artist Studio) -------------------------------------------------------------------------------
// recipe.composition: the applied artist composition (public/composition.js, normalize()d), or absent. The world host
// draws its layers inside the family's own world, or replaces the world with the artist canvas (base 'canvas'); the
// genome stays the family's, so the project's structure and its digital life remain. Applying one switches to the
// family it is based on when that is another, tunes the world values it carries (tunable, valid ones only: anything
// else is ignored, never forced) and its finish, and makes the identity deliberate (locked and founded) as tuning does.
// What a previous composition tuned is withdrawn where it is still in force (a value changed since is the user's).
const sameValue=(a,b)=>JSON.stringify(a).toLowerCase()===JSON.stringify(b).toLowerCase();
const tunedBy=c=>c?{...c.tuning,...(c.finish?{'technique.finish':c.finish}:{})}:{};
function withdraw(r,prior,next,registry){
  const t=r.tuning;if(!prior||!t||t.family!==r.family)return r;
  const own=tunedBy(prior),stays=tunedBy(next),values={};
  for(const [k,v] of Object.entries(own))if(!Object.hasOwn(stays,k)&&Object.hasOwn(t.values,k)&&sameValue(t.values[k],v))values[k]=null;
  return Object.keys(values).length?tune(r,values,registry):r;
}
function compose(recipe,input,project,now,registry){
  const prior=recipe.composition||null;
  if(input===null){if(!prior)return recipe;const {composition:_c,unavailable:_u,...rest}=withdraw(recipe,prior,null,registry);return {...rest,locked:true,founded:true};}
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid composition: an object, or null to remove it');
  const problems=Composition.validate(input);
  if(problems.length)throw new Error(`Invalid composition: ${problems[0].at?`${problems[0].at}: `:''}${problems[0].message}`);
  const next=Composition.normalize(input);let r=recipe;
  if(FAMILIES.includes(next.base)&&next.base!==r.family)r=update(r,{type:'family',family:next.base},project,now,registry);
  // The canvas replaces a built-in world; a project on a world pack takes its own generated family under it.
  else if(next.base==='canvas'&&r.familyKind==='pack')r=update(r,{type:'automatic'},project,now,registry);
  // A shader look runs in the isolated frame, which draws no layers: the composition takes its place.
  if(r.pack?.kind==='shader')r=update(r,{type:'pack',pack:null},project,now,registry);
  r=withdraw(r,prior,next,registry);
  const spec=tunable(r,registry),values={};
  for(const [k,v] of Object.entries(tunedBy(next)))if(Object.hasOwn(spec,k)&&exact(spec[k],v))values[k]=v;
  r=tune(r,values,registry);
  // Until the catalogue lists the finish as tunable it is written as it is (the host reads genome.technique.finish).
  if(next.finish&&!Object.hasOwn(values,'technique.finish')){const genome=clone(r.genome);setPath(genome,'technique.finish',next.finish);r={...r,genome};}
  const {unavailable:_u,...out}=r;
  return {...out,composition:next,locked:true,founded:true};
}
// User actions: choose a family or a pack, regenerate, lock, adjust overrides, name subsystems, tune genome values,
// apply a composition. Inputs are validated. A regenerated genome keeps the tuning when the family stays (retune
// checks the family); `automatic` and a full `regenerate` are new identities and drop it. An applied composition
// stays with its family (a canvas composition while the family stays) and goes with the identities that drop tuning.
function update(recipe,action,project,now=Date.now(),registry=null){
  const drop=recipe.tuning===undefined?undefined:null;
  const carry=r=>{const c=recipe.composition;if(c&&(c.base===r.family||(c.base==='canvas'&&r.family===recipe.family)))r.composition=c;return r;};
  const keep=(r,tuning=recipe.tuning,withComposition=true)=>{const out=retune(Object.assign(r,{overrides:recipe.overrides,aliases:recipe.aliases,title:recipe.title}),tuning,registry);return withComposition?carry(out):out;};
  const pack=recipe.pack?.id||null;
  switch(action?.type){
    case 'family':{if(!FAMILIES.includes(action.family)&&!PREVIEWS.includes(action.family)&&!packFamily(registry,action.family))throw new Error('Unknown family');
      // A pack overlay stays when it belongs to the new family.
      const keepPack=pack&&usable(registry,pack)?.overlay?.base===action.family?pack:null;
      return keep(generate(project,{seed:recipe.projectSeed,variant:recipe.variant,family:action.family,pack:keepPack,traits:recipe.traits,now,registry}));}
    case 'pack':{
      // A look is drawn over the same identity: it keeps the identity's generator (family, regenerate and automatic are
      // new identities, drawn with the current one).
      if(action.pack===null)return keep(generate(project,{seed:recipe.projectSeed,variant:recipe.variant,family:recipe.family,traits:recipe.traits,now,registry,version:generatorOf(recipe)}));
      const p=typeof action.pack==='string'?usable(registry,action.pack):null;
      if(!p||!p.overlay)throw new Error('Unknown or unusable pack');
      // A creation (a data-only pack carrying a composition) is applied as its composition, never as an overlay: the
      // world keeps its digital life and the project its identity.
      if(p.overlay.composition)return compose(recipe,p.overlay.composition,project,now,registry);
      // Choosing a look chooses its family too.
      return keep(generate(project,{seed:recipe.projectSeed,variant:recipe.variant,family:p.overlay.base,pack:p.id,traits:recipe.traits,now,registry,version:generatorOf(recipe)}));}
    case 'regenerate':{const r=generate(project,{seed:recipe.projectSeed,variant:(recipe.variant||0)+1,traits:recipe.founded?recipe.traits:null,now,registry});
      if(action.keepFamily)return keep(generate(project,{seed:recipe.projectSeed,variant:r.variant,family:recipe.family,pack,traits:r.traits,now,registry}));
      return keep(Object.assign(r,{locked:true,founded:true,source:'user'}),drop,false);}
    case 'automatic':return keep(generate(project,{seed:recipe.projectSeed,variant:recipe.variant,traits:recipe.founded?recipe.traits:null,now,registry}),drop,false);
    case 'lock':return {...recipe,locked:action.locked!==false,founded:recipe.founded||action.locked!==false};
    case 'overrides':{const o={...recipe.overrides};
      for(const k of ['intensity','motion','atmosphere'])if(action[k]!==undefined){const v=Number(action[k]);if(!Number.isFinite(v))throw new Error(`Invalid ${k}`);o[k]=round(clamp(v,0,2));}
      if(action.labels!==undefined){if(action.labels!==null&&!['cinematic','explorer','stream','off'].includes(action.labels))throw new Error('Invalid labels');o.labels=action.labels;}
      return {...recipe,overrides:o};}
    case 'alias':{if(typeof action.id!=='string'||!/^[a-f0-9]{14}$/.test(action.id))throw new Error('Invalid id');
      const aliases={...recipe.aliases};if(action.name===null||action.name==='')delete aliases[action.id];
      else{if(typeof action.name!=='string'||!ALIAS.test(action.name))throw new Error('Invalid name');aliases[action.id]=action.name;}
      return {...recipe,aliases};}
    case 'title':{if(action.title!==null&&(typeof action.title!=='string'||!ALIAS.test(action.title)))throw new Error('Invalid title');return {...recipe,title:action.title||null};}
    case 'tune':return tune(recipe,action.values,registry);
    case 'tune-reset':return untune(recipe);
    case 'composition':return compose(recipe,action.composition,project,now,registry);
    default:throw new Error('Unknown action');
  }
}
// A batch of actions, applied in order (each validated against the result of the previous one); all or nothing.
function applyActions(recipe,actions,project,now=Date.now(),registry=null){
  if(!Array.isArray(actions)||actions.length>16)throw new Error('Invalid actions: a list of at most 16');
  return actions.reduce((r,a)=>update(r,a,project,now,registry),recipe);
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
module.exports={RECIPE_SCHEMA,RECIPE_VERSION,RENDERER_VERSION,FAMILIES,PREVIEWS,FAMILY_NAMES,FOUNDING_MODULES,traitsOf,familyScores,generate,resolve,update,applyActions,tunable,baseValues,structuralDifferences};

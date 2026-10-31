'use strict';
// Parameter catalogues of the built-in world families: every genome value a declarative visual pack may set, with its
// type and the range the renderer handles (a little wider than the generator draws; qualification/visual/catalogue.qual.js
// renders every family with all parameters at their minimum and at their maximum).
// Effect presets are the effect names each family's world implements; unlocks are its ambient layers in order.
// A test generates many recipes per family and checks every generated value lies inside its catalogue.
const CATALOG_VERSION='1.0';
// Intents worlds express as effects (public/worlds/director.js EFFECT_TYPES; a test keeps the two equal).
const EFFECT_TYPES=['subsystem.created','module.created','structure.created','structure.removed','subsystem.connected','validation.failed',
  'validation.passed','validation.recovered','refactor.validated','milestone.achieved','repository.checkpoint','world.expanded','agent.collision'];
// Polarity of each effect intent. A pack may express an intent with another effect of the same class only: a failure
// never looks like success, a removal never looks like growth.
const EFFECT_CLASS={'subsystem.created':'growth','module.created':'growth','structure.created':'growth','subsystem.connected':'growth','repository.checkpoint':'growth',
  'world.expanded':'growth','agent.collision':'growth','structure.removed':'removal','validation.failed':'failure','validation.passed':'success','validation.recovered':'success',
  'refactor.validated':'success','milestone.achieved':'success'};
const n=(min,max,doc)=>({type:'number',min,max,doc});
const i=(min,max,doc)=>({type:'integer',min,max,doc});
const e=(values,doc)=>({type:'enum',values,doc});
const b=doc=>({type:'boolean',doc});
const c=doc=>({type:'color',doc});
// Shared by every family: palette, light, music response, labels and rendering technique.
const COMMON={
  'palette.scheme':e(['analogous','complementary','split','triad'],'colour harmony (documentation only once colours are set)'),
  'palette.hue':n(0,360,'base hue (degrees)'),
  'palette.primary':c('main structure colour'),'palette.secondary':c('second structure colour'),'palette.accent':c('effects and highlights'),
  'palette.highlight':c('bright details'),'palette.deep':c('background depth'),'palette.haze':c('atmosphere'),
  'palette.warning':c('failures and strain'),'palette.valid':c('validation and success'),
  'light.exposure':n(.5,2,'overall exposure'),'light.bloom':n(0,2.5,'bloom strength'),'light.bloomThreshold':n(.3,1.2,'brightness where bloom starts'),
  'light.contrast':n(.7,1.4,'contrast'),'light.grain':n(0,.1,'film grain'),'light.vignette':n(0,.8,'vignette'),
  'music.reactivity':n(0,1,'how strongly visuals follow the music'),'music.beatPulse':n(0,1,'pulse on the beat'),
  'music.score':e([2,3],'generative score: 3 the composed score (long-form sections, phrasing, counter-melody and arrangement; the default for new identities), 2 the classic score an identity saved before it keeps until it is upgraded'),
  'agentProminence':n(0,1,'how prominent agent presences are'),'limits.maxLabels':i(0,8,'callouts on screen at once'),
  // Rendering technique, applied by the host to the world's grade (identity when absent).
  'technique.finish':e(['classic','clean','cinematic','dreamlike'],'finish: a lens and colour profile over the world\'s own grade. Classic is the grade as it was before finishes (also when absent); clean is crisp with restrained bloom and almost no fringe; cinematic (the default for new identities) rolls highlights off in AgX with a subtle optical fringe, warm halation and a gentle vignette; dreamlike is luminous, with soft diffusion, richer colour separation and an artistic fringe'),
  'technique.exposure':n(.5,2,'exposure multiplier'),'technique.bloom':n(0,3,'bloom multiplier'),'technique.contrast':n(.7,1.4,'contrast multiplier'),
  'technique.saturation':n(0,2,'saturation multiplier'),'technique.vignette':n(0,2,'vignette multiplier'),'technique.grain':n(0,3,'grain multiplier'),
  'technique.aberration':n(0,.02,'chromatic aberration: with a finish, the strength of its optical fringe (0.004 is the finish as designed, 0 turns it off); classic: the colour offset toward the edges (default 0.004)'),
  'technique.tint':{type:'vec3',min:.5,max:1.5,doc:'colour multiplier before tone mapping [r,g,b]'},
  'technique.lift':{type:'vec3',min:-.05,max:.05,doc:'shadow lift after tone mapping [r,g,b]'}
};
const FAMILIES={
  'stellar-forge':{name:'Stellar Forge',parameters:{
    'geometry.arrangement':e(['spiral','cluster','ring','binary-core'],'galaxy arrangement'),'geometry.spiralArms':i(1,6,'spiral arms'),
    'geometry.spiralTwist':n(.4,1.8,'arm twist'),'geometry.orbitSpacing':n(.7,1.5,'orbit spacing'),'geometry.orbitTilt':n(0,.5,'orbit tilt (radians)'),
    'geometry.planetStyles.gas':n(0,1,'share of gas worlds'),'geometry.planetStyles.rock':n(0,1,'share of rocky worlds'),'geometry.planetStyles.ice':n(0,1,'share of ice worlds'),
    'geometry.ringChance':n(0,1,'chance of planetary rings'),'geometry.starScale':n(.6,1.6,'star size'),
    'secondary.corona':n(0,1.5,'corona strength'),'secondary.loops':i(0,8,'coronal loops'),'secondary.granulation':n(.3,2,'stellar surface detail'),'secondary.moonsAsRings':b('symbols as ring particles instead of moons'),
    'space.spread':n(.7,1.5,'galaxy spread'),'space.vertical':n(0,.6,'vertical thickness'),'space.coreBody':e(['forge','protostar'],'galactic core'),
    'atmosphere.nebula':e(['filamentary','billowing','veil'],'nebula form'),'atmosphere.nebulaDensity':n(0,1.5,'nebula density'),'atmosphere.dustLanes':i(0,4,'dust lanes'),
    'atmosphere.dust':n(0,1.5,'dust amount'),'atmosphere.stars':n(0,1.5,'starfield density'),
    'material.plasma':n(.4,1.6,'plasma brightness'),'material.surfaceContrast':n(.3,1.6,'planet surface contrast'),'material.atmosphereGlow':n(0,1.5,'planet atmosphere glow'),
    'motion.orbitSpeed':n(.2,2,'orbit speed'),'motion.convection':n(.2,2,'stellar convection'),'motion.breath':e([2,4,8],'breathing period (bars)'),'motion.turbulence':n(0,1.5,'turbulence'),
    'camera.personality':e(['orbital','drifting'],'camera behaviour'),'camera.distance':n(.7,1.5,'distance'),'camera.elevation':n(.1,.8,'elevation'),'camera.fov':i(24,50,'field of view'),'camera.drift':n(0,1.5,'idle drift'),
    'agents.form':e(['comet','probe'],'agent form'),'agents.tail':n(.2,2,'agent tail length')},
    effects:['ignition','planet-birth','accretion-spark','ablation','flare-bridge','stellar-storm','aurora','calm-pulse','accretion-collapse','nova','gravity-wave','expansion'],
    unlocks:['aurora-veils','plasma-currents','distant-pulsar','galactic-halo']},
  'fractal-biosphere':{name:'Fractal Biosphere',parameters:{
    'geometry.species':e(['coral','fern','kelp','crystal-tree','mycelial'],'dominant organism grammar (each subsystem grows its own species from its role and data; this one takes core subsystems and close cases): coral sea fan, fern colony with pinnate fronds, kelp stipes with blades and bladders, crystal tree (ternary, faceted), mycelial cords with mushrooms'),
    'geometry.branchAngle':n(.2,1.1,'divergence angle of the recursive forks (radians)'),
    'geometry.lengthDecay':n(.6,.9,'length ratio from one branching level to the next, in the limbs and in every recursive crown (self-similarity)'),'geometry.curl':n(0,.7,'how much every axis bends and curls'),'geometry.gravitropism':n(-.4,.8,'growth toward the light (negative: weeping)'),
    'geometry.taper':n(.4,.9,'branch radius kept from base to tip'),'geometry.leafShape':e(['blade','round','frond','petal'],'deprecated: no longer drawn (leaves follow the species); accepted for older packs'),'geometry.leafDensity':n(.2,1.6,'size of leaves, pinnules and blossoms'),
    'secondary.tendrils':n(0,1.5,'brightness of the silk threads between dependent branches of one organism'),'secondary.blossomScale':n(.4,1.8,'size of the blossoms of UI components'),'secondary.veins':n(0,1.5,'glowing hyphae on the ground around the roots'),
    'space.spread':n(.7,1.5,'distance between organisms'),'space.canopy':n(.4,1.8,'organism size'),'space.rootVisibility':n(0,1,'length of the buttress roots and reach of the ground hyphae'),
    'atmosphere.terrain':e(['abyss','forest-floor','cavern'],'terrain'),'atmosphere.fog':n(0,1.5,'fog'),'atmosphere.spores':n(0,1.5,'spores'),
    'atmosphere.lightShafts':n(0,1.5,'light shafts'),'atmosphere.fireflies':n(0,1.5,'fireflies'),
    'material.bioluminescence':n(.2,2,'bioluminescence (inner light of bodies, veins and tips)'),'material.translucency':n(0,1,'leaf, frond and blade translucency'),'material.bark':n(0,1,'moss on old trunks'),
    'motion.sway':n(0,2,'sway in the current'),'motion.current':n(0,6.2832,'current direction (radians)'),'motion.flow':n(.2,2,'speed of the nutrient pulses climbing from roots to tips'),'motion.breath':e([2,4,8],'period of the light\'s slow breathing (bars)'),'motion.turbulence':n(0,1.5,'irregularity of the current'),
    'camera.personality':e(['wandering','crane'],'camera behaviour'),'camera.distance':n(.6,1.5,'distance'),'camera.elevation':n(.05,.7,'elevation'),'camera.fov':i(24,50,'field of view'),'camera.drift':n(0,1.5,'idle drift'),
    'agents.form':e(['firefly-swarm','pollinator'],'agent form'),'agents.swarm':i(8,48,'swarm size')},
    effects:['sprout','branch-growth','unfurl','shed','mycelium-bridge','blight','glow-wave','regreen','metamorphosis','fractal-bloom','spore-release','season-turn'],
    unlocks:['fireflies','blossom-drift','canopy-veins','bioluminescent-tide']},
  'machine-cathedral':{name:'Machine Cathedral',parameters:{
    'geometry.architecture':e(['gothic','brutalist','deco','spire'],'architecture: gothic (lancets, pinnacle clusters, openwork great spires, gabled naves), brutalist (light slits, stepped organ-pipe columns, ziggurat crowns), deco stepped crowns, slender needles'),'geometry.setback':n(0,.5,'how far each stage of a tower steps in (a setback every few storeys, with pinnacles at its corners)'),'geometry.spire':n(0,1.2,'spire, openwork great spire and mast height'),'geometry.buttress':n(0,1,'share of tall gothic towers with buttress piers and flying buttresses'),
    'secondary.mechanisms':n(0,1.5,'clockwork: the orrery\'s beads of light, the carillon peal climbing the great spire, the chase light along the precinct copings'),'secondary.windows':n(.2,1.6,'window light'),'secondary.beacons':n(0,1.5,'spire beacons (after the beacons unlock)'),
    'space.spread':n(.8,1.4,'city spread'),'space.streets':n(.6,1.5,'width of the dark mirror canals between precincts'),
    'atmosphere.weather':e(['dusk-haze','night-fog','steam'],'weather (haze colour, drips on the wet floor)'),'atmosphere.fog':n(0,1.5,'haze (far precincts recede) and the moonlit ground mist the towers\' bases sink into'),'atmosphere.motes':n(0,1.5,'dust in the air, glinting toward the moon'),'atmosphere.searchlights':n(0,1,'searchlights (after the searchlights unlock)'),
    'atmosphere.shafts':n(0,1.5,'crepuscular rays from the moon past the great spire (they breathe as cloud crosses the disc)'),
    'material.stone':n(0,1,'stone tone'),'material.metal':n(0,1,'brass brightness (rings, inlays)'),'material.glass':n(0,1,'stained-glass colour (rose windows, glass storeys)'),'material.wetness':n(0,1,'wet, mirror-like obsidian floor (0 honed, 1 a sheet of water)'),
    'motion.mechanism':n(0,2,'clockwork speed'),'motion.breath':e([2,4,8],'breathing period (bars)'),'motion.turbulence':n(0,1,'wind: drifting mist banks, passing cloud shadows, shimmer on the wet floor, shaft breathing'),
    'camera.personality':e(['architectural','procession'],'camera behaviour'),'camera.distance':n(.7,1.4,'distance'),'camera.elevation':n(.15,.8,'elevation (mapped to low, monumental angles)'),'camera.fov':i(24,50,'lens: lower values stand the camera farther back with a longer lens'),'camera.drift':n(0,1.5,'idle sway: the great spire slides slowly across the moon'),
    'agents.form':e(['drone'],'agent form')},
    effects:['foundation','raise','storey','dismantle','lock-mechanism','stress-fracture','window-scan','restore','reassemble','illumination','set-in-stone','district-lights'],
    unlocks:['searchlights','mechanisms','beacons','aurora-glass']}
};
// Digital life (public/worlds/life): the built-in worlds' autonomous inhabitants. Every value is a scale around 1 (0..2)
// over the world's own artist-directed behaviour, so no setting can make the simulation unstable. Off (or absent: an
// identity saved before digital life existed) renders the world exactly as before. The inhabitants are simulated: they
// never stand for agents, files or events.
const LIFE={
  'life.enabled':b('digital life: autonomous inhabitants that sense, move, gather, leave traces and react to the world and to each other (off: the world exactly as before)'),
  'life.density':n(0,1,'population: the share of the world\'s inhabitants that live (1: all of them)'),
  'life.vitality':n(.2,2,'vitality: how active they are (speed, curiosity, how often they move on)'),
  'life.collective':n(0,2,'collective behaviour: how strongly groups form, align and move the currents together'),
  'life.environment':n(0,2,'environmental influence: how strongly currents and engineering events move them'),
  'life.trails':n(0,2,'trails: how much they mark their way and follow each other\'s, and how visible the trails are'),
  'life.persistence':n(.25,2,'field memory: how long trails, energy and disturbances last'),
  'life.music':n(0,2,'music influence: 0 an independent ecology (the music changes nothing), 1 a musical ecology (sections visibly change how the inhabitants gather, roam and glow; the default), 2 an expressive ecology (unmistakable, still autonomous)'),
  'life.attraction':n(0,2,'advanced: attraction to favourable places and to other species they chase'),
  'life.repulsion':n(0,2,'advanced: avoidance of disturbed places and of species they avoid'),
  'life.separation':n(0,2,'advanced: personal space between neighbours'),
  'life.alignment':n(0,2,'advanced: matching neighbours\' headings'),
  'life.cohesion':n(0,2,'advanced: staying with the group'),
  'life.current':n(0,2,'advanced: strength of the world\'s large-scale current'),
  'life.diffusion':n(0,2,'advanced: how fast traces spread out'),
  'life.radius':n(.5,1.5,'advanced: how far an inhabitant perceives its neighbours'),
  'life.ecology':e([1,2],'ecology: 2 the musical ecology (the music shapes gatherings, migration, currents, field memory and light as conditions; the default for new identities), 1 the earlier climate (currents, turbulence and cohesion only) an identity saved before it keeps until it is upgraded')
};
for(const f of Object.values(FAMILIES))f.parameters={...f.parameters,...LIFE,...COMMON};
// The families that graduated with generator 5 (previews until then): built in like the three, scored for the automatic
// choice, and from now on a base for declarative and shader packs, so their parameters are frozen like every other
// family's (added, never removed or narrowed). Each lists the standard life.* group once its world draws an ecosystem
// (WITH_LIFE below; the grammars are public/worlds/life/<world>.js).
const GRADUATED={
  'synaptic-storm':{name:'Synaptic Storm',parameters:{
    'geometry.filesPerNeuron':i(2,10,'files per neuron: each file is one dendrite branch, a subsystem with more files becomes a cluster of neurons'),
    'geometry.clustering':n(.4,1.8,'how far the neurons of a cluster stand apart'),'geometry.dendrites':n(.5,1.6,'dendrite length'),
    'geometry.branchAngle':n(.2,1,'angle of the dendrites\' forks (radians)'),'geometry.curl':n(0,1,'how much dendrites and axons wander'),'geometry.somaSize':n(.6,1.6,'soma size'),
    'space.spread':n(.7,1.5,'distance between clusters'),'space.depth':n(.2,1.2,'depth of the network: a flat sheet of cortex (low) or a volume (high)'),
    'material.translucency':n(.2,1,'how glassy membranes are: bright rims over a dim, clear body'),'material.glow':n(.5,1.6,'inner light of the somas and the branches near them'),
    'atmosphere.particles':n(0,1.5,'motes and bokeh in the void'),'atmosphere.haze':n(0,1.5,'violet haze in the void'),'atmosphere.depthOfField':n(0,1.5,'depth of field: how soft the near and far network is'),
    'atmosphere.ghosts':n(0,1.5,'the far network: dim, out-of-focus neurons around the project\'s own (ambient, never the code)'),
    'motion.firingRate':n(.2,2,'spontaneous firing (always on the beat grid; work and recent events raise it)'),'motion.conduction':n(.5,1.8,'speed of the signals along dendrites and axons'),
    'motion.drift':n(0,1.5,'slow drift of the neurons'),'motion.breath':e([2,4,8],'breathing period of the glow (bars)'),'motion.sync':n(0,1,'how tightly spontaneous firing locks to the beat'),
    'camera.personality':e(['orbit','glide'],'camera behaviour'),'camera.distance':n(.7,1.4,'distance'),'camera.elevation':n(.05,.8,'elevation'),'camera.fov':i(24,50,'field of view'),'camera.drift':n(0,1.5,'idle drift'),
    'agents.form':e(['signal'],'agent form: a travelling signal in its provider\'s colour and shape'),'agents.trail':n(.2,2,'agent trail length')},
    effects:['neurogenesis','sprout','arborize','prune','axon-link','misfire','activation-wave','resync','consolidate','storm','potentiate','expand'],
    unlocks:['glial-stars','neuromodulator-tide','myelin-sheen','deep-network']},
  'fractal-continuum':{name:'Fractal Continuum',parameters:{
    'fractal.form':e(['bulb','julia','box','kifs'],'the universe: a Mandelbulb, a Julia bulb, a Mandelbox or a kaleidoscopic crystal (each a different recursive geometry, not a colour)'),
    'fractal.power':i(4,10,'branching: the n-fold symmetry of a bulb or a Julia bulb'),'fractal.twist':n(0,1,'twist: a bulb\'s phase, a box\'s or a crystal\'s turn per recursion'),
    'fractal.julia':i(0,5,'which Julia constant a Julia bulb grows around'),'fractal.shape':n(0,1,'shape: a box\'s or a crystal\'s scale, a bulb\'s second phase'),
    'fractal.detail':n(.7,1.3,'how far the recursion unfolds as the project grows'),
    'geometry.spacing':n(.05,.6,'angular spacing of the files\' sites on the surface (radians)'),'geometry.regions':n(.6,1.5,'how far each subsystem\'s region spreads'),
    'geometry.swell':n(0,.6,'how far a subsystem\'s region swells outward with its files'),'geometry.siteSize':n(.5,1.8,'size of the files\' sites of light'),
    'geometry.threads':n(0,1.5,'brightness of the dependency threads between sites'),
    'material.occlusion':n(.5,1.6,'ambient occlusion: how deep the crevices are shaded'),'material.trap':n(0,1,'how much the surface\'s colour follows its recursion (orbit traps)'),
    'material.sheen':n(0,1,'specular sheen of the surface'),'material.rim':n(0,1.5,'rim light along the silhouette and ridges'),'material.glow':n(.5,1.6,'light of the sites and events'),
    'atmosphere.haze':n(0,1.5,'haze in the void'),'atmosphere.particles':n(0,1.5,'dust in the void'),'atmosphere.halo':n(0,1.5,'soft halo around the form'),
    'motion.breath':e([2,4,8],'breathing period (bars)'),'motion.drift':n(0,1.5,'how far the camera drifts in toward a region while nothing happens'),'motion.shimmer':n(0,1.5,'glints on the surface, on the beat'),
    'motion.resonance':n(.2,2,'spontaneous pulses of the sites (always on the beat grid; work and recent events raise them)'),'motion.light':n(0,1.5,'how fast the key light circles'),
    'motion.sync':n(0,1,'how tightly the spontaneous pulses lock to the beat'),
    'camera.personality':e(['orbit','glide','pole'],'camera behaviour (pole: looking down the symmetry axis)'),'camera.distance':n(.7,1.4,'distance'),'camera.elevation':n(.05,1.2,'elevation'),
    'camera.fov':i(24,50,'field of view'),'camera.drift':n(0,1.5,'idle drift'),
    'agents.form':e(['signal'],'agent form: a signal in its provider\'s colour and shape'),'agents.trail':n(.2,2,'agent trail length')},
    effects:['emerge','seed','unfold','erode','thread','decohere','coherence-wave','recohere','refine','bloom','glow','deepen'],
    unlocks:['stardust','inner-light','corona','echoes']},
  'temporal-terrain':{name:'Temporal Terrain',parameters:{
    'time.scale':n(15,90,'how many seconds of the recent past the land near the front edge holds (τ): smaller, the land flows back faster'),
    'time.depth':n(35,90,'depth of the land per e-fold of age: larger, the past stays wider'),
    'relief.height':n(.4,1.8,'height of the files\' ridges'),'relief.massif':n(.3,1.8,'height of the ranges\' plateaus under their files'),
    'relief.detail':n(0,2,'fine relief from the files\' symbols'),'relief.spacing':n(.3,9,'spacing of the files across a range (world units, from the project\'s size)'),
    'contour.interval':n(.4,1.6,'height between two contour lines'),'contour.index':i(3,6,'every n-th contour line is an index line (brighter)'),
    'contour.width':n(.5,2,'contour line width (pixels at 1080 lines)'),'contour.glow':n(.4,1.8,'light of the contour lines'),
    'material.rock':n(.2,1.4,'how much light the relief takes'),'material.sheen':n(0,1,'sheen of the slopes facing the light'),'material.cut':n(0,1.8,'light of the front edge\'s cut'),
    'atmosphere.mist':n(0,1.6,'mist in the valleys'),'atmosphere.haze':n(0,1.5,'haze toward the horizon'),'atmosphere.motes':n(0,1.6,'drifting motes over the land'),
    'motion.breath':e([2,4,8],'breathing period of the light (bars)'),'motion.light':n(0,1.5,'how fast the key light travels its arc'),
    'motion.shimmer':n(0,1.5,'contour shimmer on the beat'),'motion.drift':n(0,1.5,'how far the camera drifts between vantage points while nothing happens'),
    'camera.personality':e(['survey','valley','map'],'camera behaviour (survey: oblique from the front edge; valley: low along the land; map: from high above)'),
    'camera.distance':n(.7,1.4,'distance'),'camera.elevation':n(.05,1.2,'elevation'),'camera.fov':i(24,50,'field of view'),'camera.drift':n(0,1.5,'idle drift'),
    'agents.form':e(['surveyor'],'agent form: a surveyor\'s light in its provider\'s colour and shape'),'agents.trail':n(.2,2,'agent trail length')},
    effects:['range','peak','uplift','erode','road','fault','scan','heal','terrace','sunrise','survey','horizon'],
    unlocks:['dawn','lanterns','stars','aurora']}
};
const WITH_LIFE=['fractal-continuum','temporal-terrain'];
for(const id of WITH_LIFE)GRADUATED[id].parameters={...GRADUATED[id].parameters,...LIFE};
for(const f of Object.values(GRADUATED))f.parameters={...f.parameters,...COMMON};
Object.assign(FAMILIES,GRADUATED);
// Preview families: built in but still being designed, chosen only explicitly (the Visual Studio, the render lab's
// --family), never scored, and no base for packs (their parameters may still change). None at present.
const PREVIEWS={};
const HEX=/^#[0-9a-f]{6}$/i;
// Is `value` acceptable for a parameter spec? Ranges ([min,max]) are accepted for numbers: the recipe draws inside.
function accepts(spec,value){
  switch(spec.type){
    case 'number':case 'integer':{
      const ok=x=>typeof x==='number'&&Number.isFinite(x)&&x>=spec.min&&x<=spec.max&&(spec.type==='number'||Number.isInteger(x));
      return ok(value)||(Array.isArray(value)&&value.length===2&&ok(value[0])&&ok(value[1])&&value[0]<=value[1]);}
    case 'enum':return spec.values.includes(value);
    case 'boolean':return typeof value==='boolean';
    case 'color':return typeof value==='string'&&HEX.test(value);
    case 'vec3':return Array.isArray(value)&&value.length===3&&value.every(x=>typeof x==='number'&&x>=spec.min&&x<=spec.max);
    default:return false;
  }
}
function get(obj,path){return path.split('.').reduce((o,k)=>o?.[k],obj);}
// The class of an effect preset in a family (its effects are listed in EFFECT_TYPES order).
function effectClass(family,effect){const k=FAMILIES[family]?.effects.indexOf(effect);return k>=0?EFFECT_CLASS[EFFECT_TYPES[k]]:null;}
module.exports={CATALOG_VERSION,EFFECT_TYPES,EFFECT_CLASS,FAMILIES,GRADUATED,PREVIEWS,COMMON,LIFE,accepts,get,effectClass};

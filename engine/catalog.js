'use strict';
// Parameter catalogues of the built-in world families: every genome value a declarative visual pack may set, with its
// type and the range the renderer handles (a little wider than the generator draws; qualification/visual/catalogue.qual.js
// renders every family with all parameters at their minimum and at their maximum).
// Effect presets are the effect names each family's world implements; unlocks are its ambient layers in order.
// A test generates many recipes per family and checks every generated value lies inside its catalogue.
const CATALOG_VERSION='1.0';
// Intents worlds express as effects (public/worlds/director.js EFFECT_TYPES; a test keeps the two equal).
const EFFECT_TYPES=['subsystem.created','module.created','structure.created','structure.removed','subsystem.connected','validation.failed',
  'validation.passed','validation.recovered','refactor.validated','milestone.achieved','repository.checkpoint','world.expanded'];
// Polarity of each effect intent. A pack may express an intent with another effect of the same class only: a failure
// never looks like success, a removal never looks like growth.
const EFFECT_CLASS={'subsystem.created':'growth','module.created':'growth','structure.created':'growth','subsystem.connected':'growth','repository.checkpoint':'growth',
  'world.expanded':'growth','structure.removed':'removal','validation.failed':'failure','validation.passed':'success','validation.recovered':'success',
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
  'agentProminence':n(0,1,'how prominent agent presences are'),'limits.maxLabels':i(0,8,'callouts on screen at once'),
  // Rendering technique, applied by the host to the world's grade (identity when absent).
  'technique.exposure':n(.5,2,'exposure multiplier'),'technique.bloom':n(0,3,'bloom multiplier'),'technique.contrast':n(.7,1.4,'contrast multiplier'),
  'technique.saturation':n(0,2,'saturation multiplier'),'technique.vignette':n(0,2,'vignette multiplier'),'technique.grain':n(0,3,'grain multiplier'),
  'technique.aberration':n(0,.02,'chromatic aberration at the edges (default 0.004)'),
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
    'geometry.species':e(['coral','fern','kelp','crystal-tree','mycelial'],'organism species'),'geometry.branchAngle':n(.2,1.1,'branch angle (radians)'),
    'geometry.lengthDecay':n(.6,.9,'branch length decay'),'geometry.curl':n(0,.7,'curl'),'geometry.gravitropism':n(-.4,.8,'growth towards the light'),
    'geometry.taper':n(.4,.9,'taper'),'geometry.leafShape':e(['blade','round','frond','petal'],'leaf shape'),'geometry.leafDensity':n(.2,1.6,'leaf density'),
    'secondary.tendrils':n(0,1.5,'tendrils'),'secondary.blossomScale':n(.4,1.8,'blossom size'),'secondary.veins':n(0,1.5,'ground veins'),
    'space.spread':n(.7,1.5,'forest spread'),'space.canopy':n(.4,1.8,'canopy size'),'space.rootVisibility':n(0,1,'visible roots'),
    'atmosphere.terrain':e(['abyss','forest-floor','cavern'],'terrain'),'atmosphere.fog':n(0,1.5,'fog'),'atmosphere.spores':n(0,1.5,'spores'),
    'atmosphere.lightShafts':n(0,1.5,'light shafts'),'atmosphere.fireflies':n(0,1.5,'fireflies'),
    'material.bioluminescence':n(.2,2,'bioluminescence'),'material.translucency':n(0,1,'leaf translucency'),'material.bark':n(0,1,'bark texture'),
    'motion.sway':n(0,2,'sway'),'motion.current':n(0,6.2832,'current direction (radians)'),'motion.flow':n(.2,2,'nutrient flow'),'motion.breath':e([2,4,8],'breathing period (bars)'),'motion.turbulence':n(0,1.5,'turbulence'),
    'camera.personality':e(['wandering','crane'],'camera behaviour'),'camera.distance':n(.6,1.5,'distance'),'camera.elevation':n(.05,.7,'elevation'),'camera.fov':i(24,50,'field of view'),'camera.drift':n(0,1.5,'idle drift'),
    'agents.form':e(['firefly-swarm','pollinator'],'agent form'),'agents.swarm':i(8,48,'swarm size')},
    effects:['sprout','branch-growth','unfurl','shed','mycelium-bridge','blight','glow-wave','regreen','metamorphosis','fractal-bloom','spore-release','season-turn'],
    unlocks:['fireflies','blossom-drift','canopy-veins','bioluminescent-tide']},
  'machine-cathedral':{name:'Machine Cathedral',parameters:{
    'geometry.architecture':e(['gothic','brutalist','deco','spire'],'architecture'),'geometry.setback':n(0,.5,'storey setback'),'geometry.spire':n(0,1.2,'spires'),'geometry.buttress':n(0,1,'buttresses'),
    'secondary.mechanisms':n(0,1.5,'mechanisms'),'secondary.windows':n(.2,1.6,'window light'),'secondary.beacons':n(0,1.5,'beacons'),
    'space.spread':n(.8,1.4,'city spread'),'space.streets':n(.6,1.5,'street width'),
    'atmosphere.weather':e(['dusk-haze','night-fog','steam'],'weather'),'atmosphere.fog':n(0,1.5,'fog'),'atmosphere.motes':n(0,1.5,'motes'),'atmosphere.searchlights':n(0,1,'searchlights'),
    'material.stone':n(0,1,'stone'),'material.metal':n(0,1,'metal'),'material.glass':n(0,1,'glass'),
    'motion.mechanism':n(0,2,'mechanism speed'),'motion.breath':e([2,4,8],'breathing period (bars)'),'motion.turbulence':n(0,1,'turbulence'),
    'camera.personality':e(['architectural','procession'],'camera behaviour'),'camera.distance':n(.7,1.4,'distance'),'camera.elevation':n(.15,.8,'elevation'),'camera.fov':i(24,50,'field of view'),'camera.drift':n(0,1.5,'idle drift'),
    'agents.form':e(['drone'],'agent form')},
    effects:['foundation','raise','storey','dismantle','lock-mechanism','stress-fracture','window-scan','restore','reassemble','illumination','set-in-stone','district-lights'],
    unlocks:['searchlights','mechanisms','beacons','aurora-glass']}
};
for(const f of Object.values(FAMILIES))f.parameters={...f.parameters,...COMMON};
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
module.exports={CATALOG_VERSION,EFFECT_TYPES,EFFECT_CLASS,FAMILIES,COMMON,accepts,get,effectClass};

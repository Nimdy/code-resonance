'use strict';
// The Control Center's music configuration: the composed score's profile and mix resolve key by key (URL pin › project ›
// global › default), the score version follows the recipe shown, and presets carry the whole performance.
const test=require('node:test'),assert=require('node:assert/strict');
const score=require('../public/score.js');
const store=require('../receiver/store');
const {tempDir}=require('./helpers');
const load=()=>import('../public/ui/music-profile.js');
test('The profile resolves per key and the mix as one value: URL pin › project › global › default',async()=>{
  const M=await load();
  assert.deepEqual(M.PROFILE_KEYS,Object.keys(score.PROFILE));assert.deepEqual(M.GROUPS,score.GROUPS);
  // Nothing saved: the built-in defaults, as composed.
  let {music,sources}=M.resolveMusic();
  for(const k of M.PROFILE_KEYS){assert.equal(music[k],.5);assert.equal(sources[k],'global');}
  assert.deepEqual(music.mix,{pad:1,bass:1,melody:1,counter:1,arp:1,perc:1,atmos:1});assert.equal(music.style,'ambient');assert.equal(music.volume,.55);
  const global={...store.SETTINGS_DEFAULTS.music,mood:.7,space:.2,volume:.4,mix:{...store.SETTINGS_DEFAULTS.music.mix,perc:0}};
  const project={...store.PREFERENCES_DEFAULTS.music,mood:.2,rhythm:.9,mix:{pad:1,bass:.6,melody:1.2,counter:1,arp:1,perc:1,atmos:1}};
  ({music,sources}=M.resolveMusic({global}));
  assert.equal(music.mood,.7);assert.equal(music.space,.2);assert.equal(music.rhythm,.5);assert.equal(music.mix.perc,0);assert.equal(music.volume,.4);
  // The project's own values win; null inherits; its mix replaces the global one whole (perc is back to 1).
  ({music,sources}=M.resolveMusic({global,project}));
  assert.equal(music.mood,.2);assert.equal(sources.mood,'project');assert.equal(music.space,.2);assert.equal(sources.space,'global');assert.equal(music.rhythm,.9);
  assert.deepEqual(music.mix,project.mix);assert.equal(sources.mix,'project');assert.equal(music.volume,.4,'the volume is global only');
  ({music}=M.resolveMusic({global,project:{...project,mix:null}}));assert.equal(music.mix.perc,0,'a null mix inherits the global one');
  // A URL pin (?music=) wins over both, key by key; the style pin as before.
  const pin=M.pinOf(JSON.stringify({mood:.95,mix:{melody:0},tempo:200,evolution:7}));
  assert.deepEqual(pin,{mood:.95,mix:{pad:1,bass:1,melody:0,counter:1,arp:1,perc:1,atmos:1}},'known, valid keys only');
  ({music,sources}=M.resolveMusic({pins:{style:'chip',profile:pin},global,project}));
  assert.equal(music.mood,.95);assert.equal(sources.mood,'url');assert.equal(music.rhythm,.9);assert.equal(music.mix.melody,0);assert.equal(sources.mix,'url');
  assert.equal(music.style,'chip');assert.equal(sources.style,'url');
  for(const raw of [null,'','{','[1]','"x"','{"mood":"high"}','{"mix":{"kick":1}}','x'.repeat(2000)])assert.equal(M.pinOf(raw),null,String(raw).slice(0,20));
});
test('The score version follows the recipe shown (a preview counts); the engine gets the profile with its mix',async()=>{
  const M=await load();
  const v2={genome:{music:{reactivity:.5,beatPulse:.4}}},v3={genome:{music:{reactivity:.5,beatPulse:.4,score:3}}};
  assert.equal(M.resolveMusic().music.scoreVersion,2);assert.equal(M.resolveMusic().sources.scoreVersion,'default');
  assert.equal(M.resolveMusic({recipe:v2}).music.scoreVersion,2,'a recipe from before v4 keeps the classic score');
  assert.equal(M.resolveMusic({recipe:v3}).music.scoreVersion,3);assert.equal(M.resolveMusic({recipe:v3,preview:true}).sources.scoreVersion,'preview');
  assert.equal(M.scoreOf({genome:{music:{score:2}}}),2);assert.equal(M.scoreOf({genome:{music:{score:'3'}}}),3);assert.equal(M.scoreOf(null),2);
  const {music}=M.resolveMusic({recipe:v3,global:{...store.SETTINGS_DEFAULTS.music,harmony:.8,mix:{...store.SETTINGS_DEFAULTS.music.mix,arp:0}}});
  const o=M.engineOptions(music);
  assert.deepEqual(Object.keys(o).sort(),['profile','scoreVersion','style','tempo','tempoMode','texture','volume']);
  assert.equal(o.scoreVersion,3);assert.equal(o.profile.harmony,.8);assert.equal(o.profile.mix.arp,0);
  assert.deepEqual(score.profileOf(o.profile),o.profile,'what the engine receives is already a valid score profile');
  assert.deepEqual(M.engineOptions({mood:9,mix:{x:1}}).profile,{...score.PROFILE,mix:score.profileOf(null).mix},'invalid values play as composed');
});
test('The mixer offers only the voice groups the style can sound',async()=>{
  const M=await load();
  // Ambient has no percussion unless the rhythm control asks for it (score.js orchestrate: rhythm above .55).
  assert(!M.soundingGroups(score,'ambient',{rhythm:.5}).includes('perc'));
  assert(M.soundingGroups(score,'ambient',{rhythm:.7}).includes('perc'));
  for(const style of ['pulse','cinematic','chip'])assert.deepEqual(M.soundingGroups(score,style,{}),score.GROUPS,style);
  // Still: no percussion at all in pulse; a muted group is still offered (so it can be raised again).
  assert(!M.soundingGroups(score,'pulse',{rhythm:0}).includes('perc'));
  assert(M.soundingGroups(score,'pulse',{rhythm:.5,mix:{perc:0}}).includes('perc'));
  assert(M.soundingGroups(score,'ambient',{atmosphere:0}).includes('atmos'),'atmosphere transitions follow its level alone');
});
test('store.effective() resolves the profile with its precedence and pushes it to the engine with the score version',async()=>{
  const M=await load(),pushed=[];let ps={project:'p1',recipe:{genome:{music:{score:3}}},preview:null};
  // The interface store, on a stand-in engine (window.ResonancePlayer), with a window address that pins the style and space.
  globalThis.window={ResonancePlayer:{WORLDS:['living','construct'],worldOf:()=>null,LABEL_MODES:['cinematic','explorer','stream','off'],QUALITY:['auto'],film:false,overlay:false,
    record:{active:false,setSize(){}},get state(){return ps;},on(){},setMusic:o=>pushed.push(o),setWorld(){},setLabels(){},setCaptions(){},setQuality(){},selectProject(){},api:{post:async()=>({})}}};
  globalThis.location={search:`?style=chip&music=${encodeURIComponent(JSON.stringify({space:.9}))}`};
  globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.addEventListener=()=>{};
  const S=await import('../public/ui/store.js');
  S.state.selected='p1';S.state.settings={...store.SETTINGS_DEFAULTS,music:{...store.SETTINGS_DEFAULTS.music,mood:.7,harmony:.2,texture:.4}};
  S.state.preferences.set('p1',{...store.PREFERENCES_DEFAULTS,music:{...store.PREFERENCES_DEFAULTS.music,mood:.25,mix:{...M.DEFAULT_MIX,perc:0}}});
  let e=S.effective();
  assert.equal(e.music.space,.9);assert.equal(e.sources.space,'url','the window\'s pin first');
  assert.equal(e.music.mood,.25);assert.equal(e.sources.mood,'project','then the project\'s own value');
  assert.equal(e.music.harmony,.2);assert.equal(e.sources.harmony,'global','then the global setting');
  assert.equal(e.music.melody,.5,'then the default: as composed');
  assert.equal(e.music.mix.perc,0);assert.equal(e.sources.mix,'project');
  assert.equal(e.music.style,'chip');assert.equal(e.sources.style,'url');assert.equal(e.music.texture,.4);assert.equal(e.sources.texture,'global');
  assert.equal(e.music.scoreVersion,3);assert.equal(e.sources.scoreVersion,'recipe');
  S.applyEffective({force:true});
  const o=pushed.at(-1);
  assert.equal(o.scoreVersion,3);assert.equal(o.style,'chip');
  assert.deepEqual(o.profile,{...score.PROFILE,mood:.25,harmony:.2,space:.9,mix:{...M.DEFAULT_MIX,perc:0}});
  // A preview recipe shown in this window counts here; the recipe of a project not on this stage does not.
  ps={...ps,preview:{recipe:{genome:{music:{}}}}};e=S.effective();assert.equal(e.music.scoreVersion,2);assert.equal(e.sources.scoreVersion,'preview');
  ps={project:'p2',recipe:{genome:{music:{score:3}}},preview:null};assert.equal(S.effective().music.scoreVersion,2);
  // The Music Studio's preview (flat keys, the mix whole) is heard at once; the saved values are untouched.
  ps={project:'p1',recipe:{genome:{music:{score:3}}},preview:null};
  S.previewMusic({rhythm:.8,mix:{...M.DEFAULT_MIX,arp:.3}});
  assert.equal(pushed.at(-1).profile.rhythm,.8);assert.equal(pushed.at(-1).profile.mix.arp,.3);assert.equal(pushed.at(-1).profile.mix.perc,1,'the previewed mix replaces the saved one whole');
  assert.equal(S.effective().music.rhythm,.5);
  S.previewMusic(null);assert.equal(pushed.at(-1).profile.mix.perc,0);assert.equal(pushed.at(-1).profile.rhythm,.5);
});
test('Presets carry the whole performance; a preset from before sets only what it holds; the starters are valid and distinct',async t=>{
  const M=await load(),presets=store.presets(tempDir(t,'cr-music-profile-'));
  const heard={...M.DEFAULT_MUSIC,style:'pulse',tempoMode:'manual',tempo:104,mood:.66,space:.3,mix:{...M.DEFAULT_MIX,arp:.4},volume:.9,scoreVersion:3};
  const payload=M.presetPayload(heard);
  assert.equal(payload.volume,undefined);assert.equal(payload.scoreVersion,undefined,'never the volume or the score version');
  const doc=await presets.update({patch:{action:'create',kind:'music',name:'Heard',payload}});
  assert.deepEqual(doc.presets[0].payload,payload,'the receiver accepts it as it is');
  const values=M.presetValues(payload);
  for(const k of M.MUSIC_KEYS)assert.deepEqual(values[k],heard[k],k);
  assert.deepEqual(M.presetValues({style:'chip',texture:.3,tempoMode:'manual',tempo:100}),{style:'chip',texture:.3,tempoMode:'manual',tempo:100});
  assert.equal(M.STARTERS.length,4);assert.deepEqual(M.STARTERS.map(s=>s.payload.style).sort(),['ambient','chip','cinematic','pulse']);
  for(const s of M.STARTERS){
    const r=await presets.update({patch:{action:'create',kind:'music',name:s.name,payload:s.payload}});
    assert.deepEqual(r.presets.at(-1).payload,s.payload,s.name);assert.equal(s.payload.tempoMode,'project','a starter keeps the project\'s own tempo');
  }
  // Distinct: every pair differs by a clear margin somewhere in the profile, beyond the style.
  for(const a of M.STARTERS)for(const b of M.STARTERS)if(a!==b)assert(M.PROFILE_KEYS.some(k=>Math.abs(a.payload.profile[k]-b.payload.profile[k])>=.2),`${a.name} / ${b.name}`);
});
test('One music vocabulary: the interface\'s styles and defaults are the score\'s and the receiver\'s',async()=>{
  const M=await load(),{STYLE_NAMES}=await import('../public/ui/format.js');
  assert.deepEqual(M.STYLES,score.STYLES);assert.deepEqual(Object.keys(STYLE_NAMES),score.STYLES,'every style has its name');
  assert.deepEqual(M.DEFAULT_MUSIC,store.SETTINGS_DEFAULTS.music);assert.deepEqual([M.TEMPO_MIN,M.TEMPO_MAX],[store.TEMPO_MIN,store.TEMPO_MAX]);
  for(const v of [undefined,null,2,3,'3','2',4,'x'])assert.equal(M.scoreOf({genome:{music:{score:v}}}),score.versionOf(v),String(v));
});

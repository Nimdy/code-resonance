// The composed score's performance profile as the Control Center stores, resolves and plays it: eight creative
// controls (public/score.js v3 PROFILE, .5 = as composed) and a level per voice group (GROUPS, 0 mutes, 1 = as
// composed, 1.5 lifts). They persist like the style and texture (receiver/store.js: global settings, per-project
// preferences where null inherits, presets) and are resolved with the same precedence. Pure: no DOM, no engine, so the
// rules are tested in Node (tests/music-profile.test.js), as is their agreement with the score and the receiver.
export const STYLES=['ambient','pulse','cinematic','chip'];
// The manual tempo's range, in BPM (the receiver's and the engine's).
export const TEMPO_MIN=58,TEMPO_MAX=160;
export const PROFILE_KEYS=['mood','evolution','melody','rhythm','atmosphere','harmony','dynamics','space'];
export const GROUPS=['pad','bass','melody','counter','arp','perc','atmos'];
export const AS_COMPOSED=.5;
export const DEFAULT_MIX=Object.freeze(Object.fromEntries(GROUPS.map(g=>[g,1])));
// What one scope stores (the volume is a listening level: global only, never part of a performance).
export const MUSIC_KEYS=['style','texture','tempoMode','tempo',...PROFILE_KEYS,'mix'];
export const DEFAULT_MUSIC=Object.freeze({style:'ambient',volume:.55,texture:.58,tempoMode:'project',tempo:92,...Object.fromEntries(PROFILE_KEYS.map(k=>[k,AS_COMPOSED])),mix:DEFAULT_MIX});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const unit=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const level=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1.5;
// A mix is one value: every group, a group left out as composed; null when it is not a valid mix.
export function mixOf(v){
  if(!plain(v)||Object.keys(v).some(k=>!GROUPS.includes(k)))return null;
  const o={};for(const g of GROUPS){const x=v[g]===undefined?1:v[g];if(!level(x))return null;o[g]=x;}return o;
}
export const sameMix=(a,b)=>GROUPS.every(g=>Math.abs((a?.[g]??1)-(b?.[g]??1))<1e-9);
// The score a recipe asks for: genome.music.score (recipe v4); absent means the classic v2 score (score.js versionOf).
export function scoreOf(recipe){const v=recipe?.genome?.music?.score;return v===3||v==='3'?3:2;}
// A URL pin (?music={"mood":.7,"mix":{"perc":0}}), as ?style= pins the style: known keys with valid values only.
export function pinOf(raw){
  if(typeof raw!=='string'||!raw||raw.length>1024)return null;
  let v;try{v=JSON.parse(raw);}catch{return null;}
  if(!plain(v))return null;
  const o={};for(const k of PROFILE_KEYS)if(unit(v[k]))o[k]=v[k];
  const m=v.mix===undefined?null:mixOf(v.mix);if(m)o.mix=m;
  return Object.keys(o).length?o:null;
}
// The effective music, key by key: URL pin › project preference (non-null) › global setting › built-in default. The mix
// resolves as one value. The score version is the recipe's this window shows, an unsaved preview included.
export function resolveMusic({pins={},project=null,global=null,recipe=null,preview=false}={}){
  const pm=project||{},gm={...DEFAULT_MUSIC,...(global||{})},pin=pins.profile||{},music={},sources={};
  const own=k=>pm[k]!==null&&pm[k]!==undefined;
  for(const k of MUSIC_KEYS){
    const pinned=k==='style'?pins.style:pin[k];
    music[k]=pinned??(own(k)?pm[k]:gm[k]);sources[k]=pinned!==null&&pinned!==undefined?'url':own(k)?'project':'global';
  }
  music.mix={...(mixOf(music.mix)||DEFAULT_MIX)};music.volume=gm.volume;
  music.scoreVersion=scoreOf(recipe);sources.scoreVersion=!recipe?'default':preview?'preview':'recipe';
  return {music,sources};
}
// What the engine plays (ResonanceMusic.setOptions): the profile travels as one object, with its mix.
export function engineOptions(m={}){
  const {style,texture,tempoMode,tempo,volume}=m;
  const profile=Object.fromEntries(PROFILE_KEYS.map(k=>[k,unit(m[k])?m[k]:AS_COMPOSED]));
  return {style,texture,tempoMode,tempo,volume,scoreVersion:m.scoreVersion===3?3:2,profile:{...profile,mix:{...(mixOf(m.mix)||DEFAULT_MIX)}}};
}
// The voice groups the style can sound with this profile: score.orchestrate over every section at the deepest chapter
// and the most energy the mood allows, at full level (a muted group is still a group that can be raised again).
// Atmosphere always can: its transitions (risers, washes, swells) follow its level alone.
const ROLES=['statement','development','interlude','return','release','tension','resolve'];
export function soundingGroups(score,style,profile={}){
  const p={...profile,mix:DEFAULT_MIX},mood=unit(profile?.mood)?profile.mood:AS_COMPOSED,energy=Math.min(1,Math.max(0,.8+(mood-.5)*.5));
  return GROUPS.filter(g=>g==='atmos'||ROLES.some(role=>score.orchestrate(role,{chapter:12,energy,profile:p,style})[g]>0));
}
// A music preset is the performance heard: style, tempo source, texture, profile and mix (receiver/store.js musicPayload).
export function presetPayload(m){
  return {style:m.style,texture:m.texture,tempoMode:m.tempoMode,tempo:m.tempo,profile:Object.fromEntries(PROFILE_KEYS.map(k=>[k,unit(m[k])?m[k]:AS_COMPOSED])),mix:{...(mixOf(m.mix)||DEFAULT_MIX)}};
}
// The flat values a preset sets in a scope; a preset saved before the profile existed sets only what it holds.
export function presetValues(p){
  const out={style:p.style,texture:p.texture,tempoMode:p.tempoMode,tempo:p.tempo};
  if(plain(p.profile))for(const k of PROFILE_KEYS)if(unit(p.profile[k]))out[k]=p.profile[k];
  const m=p.mix===undefined?null:mixOf(p.mix);if(m)out.mix=m;
  return out;
}
// Curated starting points (read-only built-ins, like the Visual Studio's curated looks): one considered performance per
// style. The tempo stays the project's own, and nothing here touches its key, mode or motif.
export const STARTERS=[
  {id:'starter:deep-focus',name:'Deep focus',line:'Long, warm and unhurried: few voices, a wide room, a melody that comes and goes.',
    payload:{style:'ambient',texture:.52,tempoMode:'project',tempo:92,profile:{mood:.3,evolution:.3,melody:.32,rhythm:.25,atmosphere:.72,harmony:.5,dynamics:.4,space:.78},
      mix:{pad:.9,bass:.75,melody:1,counter:.85,arp:.8,perc:1,atmos:1.15}}},
  {id:'starter:late-night-build',name:'Late-night build',line:'Steady, purposeful motion: moving arpeggios, a walking bass, a kick that stays out of the way.',
    payload:{style:'pulse',texture:.55,tempoMode:'project',tempo:92,profile:{mood:.55,evolution:.5,melody:.5,rhythm:.62,atmosphere:.35,harmony:.55,dynamics:.5,space:.38},
      mix:{pad:.8,bass:1,melody:.9,counter:1,arp:.95,perc:.75,atmos:.85}}},
  {id:'starter:opening-titles',name:'Opening titles',line:'Wide and dramatic: rich harmony, long swells, taiko at the turns and room to breathe.',
    payload:{style:'cinematic',texture:.62,tempoMode:'project',tempo:92,profile:{mood:.62,evolution:.72,melody:.7,rhythm:.5,atmosphere:.6,harmony:.75,dynamics:.82,space:.82},
      mix:{pad:1.05,bass:.9,melody:1.1,counter:1.15,arp:.85,perc:.9,atmos:1.1}}},
  {id:'starter:arcade-memory',name:'Arcade memory',line:'Bright and nimble: echoing lines, quick arpeggios and plain, singable chords.',
    payload:{style:'chip',texture:.6,tempoMode:'project',tempo:92,profile:{mood:.6,evolution:.62,melody:.75,rhythm:.58,atmosphere:.3,harmony:.5,dynamics:.5,space:.3},
      mix:{pad:.75,bass:1,melody:1.1,counter:.9,arp:.85,perc:.85,atmos:.7}}}];

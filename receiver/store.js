'use strict';
// Receiver documents: global settings, per-project preferences and presets. Each is `{schema, revision, ...}` in one
// JSON file, validated on write and on read (an invalid file reads as the defaults, with a warning: never a crash),
// written atomically (temporary file in the same directory + rename) under one promise-chain lock per file.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Score=require('../public/score.js');
const STYLES=[...Score.STYLES],TEMPO_MODES=['project','manual'],TEMPO_MIN=58,TEMPO_MAX=160;
const WORLDS=['living','construct','nexus','city','nebula'],LABELS=['cinematic','explorer','stream','off'];
const PROFILES=['720p','1080p','stage'],MOTION=['system','reduce','full'];
const PRESET_NAME=/^[\p{L}\p{N} .,'&()-]{1,40}$/u,PRESET_ID=/^p-[0-9a-f]{12}$/,PACK_REF=/^[a-z0-9.-]{1,64}$/,TUNING_PATH=/^[A-Za-z0-9_.]{1,64}$/;
const MAX_PRESETS=200,MAX_TUNING=128;
// The composed score's performance profile (public/score.js v3 PROFILE, GROUPS): eight creative controls, 0..1 with .5 as
// composed, and the level of each voice group, 0 (muted) .. 1 (as composed) .. 1.5. The styles, keys, groups and defaults
// are the score's own (copied, so nothing here can change the score's).
const PROFILE_KEYS=Object.keys(Score.PROFILE),MIX_GROUPS=[...Score.GROUPS];
const PROFILE_DEFAULTS={...Score.PROFILE},MIX_DEFAULTS=Score.profileOf(null).mix;
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
function coded(code,status,message,extra={}){return Object.assign(new Error(message),{code,status,...extra});}
const invalid=key=>coded('invalid',400,`Invalid value for ${key}`,{key});
const unknown=key=>coded('invalid',400,`Unknown key: ${key}`,{key});
// Writers of one file queue behind each other, whichever document object they come from.
const locks=new Map();
function withLock(file,fn){
  file=path.resolve(file);const prev=locks.get(file)||Promise.resolve();const next=prev.catch(()=>{}).then(fn);
  const tail=next.catch(()=>{});locks.set(file,tail);tail.then(()=>{if(locks.get(file)===tail)locks.delete(file);});
  return next;
}
// Windows refuses a rename over a file another process (an indexer, an antivirus) briefly holds open: retry a little.
async function writeAtomic(file,text){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=`${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp,text,{mode:0o600});
  for(let attempt=0;;attempt++){
    try{await fs.rename(tmp,file);break;}
    catch(e){if(attempt>=5||!['EPERM','EACCES','EBUSY'].includes(e.code)){await fs.rm(tmp,{force:true}).catch(()=>{});throw e;}await new Promise(r=>setTimeout(r,20*(attempt+1)));}
  }
  await fs.chmod(file,0o600).catch(()=>{});
}
// Values on disk laid over the defaults, known keys only (a key added by a later version reads as its default).
function overlay(template,stored){
  if(!isPlain(stored))return clone(template);
  const out={};
  for(const k of Object.keys(template))out[k]=!Object.hasOwn(stored,k)?clone(template[k]):isPlain(template[k])&&isPlain(stored[k])?overlay(template[k],stored[k]):stored[k];
  return out;
}
// Deep merge of a patch: only keys the defaults know (anything else is refused, named); `nullResets` lets null clear a
// whole section back to its defaults (preferences: null means "inherit the global setting").
function mergePatch(template,current,patch,{nullResets=false}={},prefix=''){
  if(!isPlain(patch))throw invalid(prefix.slice(0,-1)||'patch');
  const out={...current};
  for(const k of Object.keys(patch)){
    const key=prefix+k;if(!Object.hasOwn(template,k))throw unknown(key);
    if(isPlain(template[k])){
      if(patch[k]===null&&nullResets){out[k]=clone(template[k]);continue;}
      if(!isPlain(patch[k]))throw invalid(key);
      out[k]=mergePatch(template[k],isPlain(current?.[k])?current[k]:template[k],patch[k],{nullResets},key+'.');
    }else out[k]=patch[k];
  }
  return out;
}
const oneOf=(key,v,values)=>{if(!values.includes(v))throw invalid(key);return v;};
const unit=(key,v)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw invalid(key);return v;};
const integer=(key,v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw invalid(key);return v;};
const bool=(key,v)=>{if(typeof v!=='boolean')throw invalid(key);return v;};
const section=(key,v)=>{if(!isPlain(v))throw invalid(key);return v;};
const orNull=(fn,key,v,...a)=>v===null?null:fn(key,v,...a);
// A mix is one value, validated as a whole: known groups only, each 0..1.5; a group it leaves out plays as composed.
function mix(key,v){section(key,v);onlyKeys(key+'.',v,MIX_GROUPS);
  return Object.fromEntries(MIX_GROUPS.map(g=>{const x=v[g]===undefined?1:v[g];if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1.5)throw invalid(`${key}.${g}`);return [g,x];}));}
const profile=(key,m,fn)=>Object.fromEntries(PROFILE_KEYS.map(k=>[k,fn(`${key}.${k}`,m[k])]));
// createDocument(file,{schema, defaults, validate, apply?, nullResets?}): validate(data) returns the normalized data or
// throws a coded error naming the key; apply(data, patch) computes the next data (default: deep merge of known keys).
function createDocument(file,{schema,defaults,validate,apply,nullResets=false}){
  const fresh=()=>clone(typeof defaults==='function'?defaults():defaults);
  const merge=apply||((data,patch)=>mergePatch(fresh(),data,patch,{nullResets}));
  async function load(){
    let text;try{text=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return {doc:{schema,revision:0,...fresh()},broken:false};throw e;}
    let raw=null;
    try{
      raw=JSON.parse(text);
      if(!isPlain(raw)||raw.schema!==schema||!Number.isInteger(raw.revision)||raw.revision<0)throw new Error('not a '+schema+' document');
      const {schema:_s,revision,...data}=raw;
      return {doc:{schema,revision,...validate(overlay(fresh(),data))},broken:false};
    }catch(e){
      console.warn(`[resonance store] ${path.basename(file)} is invalid (${e.message}); using the defaults`);
      // Keep the revision counting upward, so a client holding an older revision sees a conflict rather than a match.
      return {doc:{schema,revision:Number.isInteger(raw?.revision)&&raw.revision>=0?raw.revision:0,...fresh()},broken:true};
    }
  }
  return {
    file,schema,
    async read(){return (await load()).doc;},
    // update({patch, ifRevision}) → the new document; errors carry code 'stale' (with .current) or 'invalid' (with .key).
    update({patch,ifRevision}={}){return withLock(file,async()=>{
      const {doc,broken}=await load();
      if(ifRevision!==undefined&&ifRevision!==null){
        if(!Number.isInteger(ifRevision))throw invalid('ifRevision');
        if(ifRevision!==doc.revision)throw coded('stale',409,'stale',{current:doc});
      }
      const {schema:_s,revision,...data}=doc;
      const next={schema,revision:revision+1,...validate(merge(data,patch))};
      // The unreadable file is set aside rather than silently overwritten: the user may want what was in it.
      if(broken)await fs.copyFile(file,`${file}.invalid`).catch(()=>{});
      await writeAtomic(file,JSON.stringify(next,null,1));
      return next;
    });}
  };
}
// ---- Global settings: <data>/settings.json
const SETTINGS_DEFAULTS={music:{style:'ambient',volume:.55,texture:.58,tempoMode:'project',tempo:92,...PROFILE_DEFAULTS,mix:{...MIX_DEFAULTS}},stage:{world:'living',labels:'cinematic',captions:true},
  recording:{profile:'720p'},interface:{motion:'system'},onboarding:{dismissed:false,migrated:false}};
function validateSettings(d){
  const m=section('music',d.music),s=section('stage',d.stage),r=section('recording',d.recording),i=section('interface',d.interface),o=section('onboarding',d.onboarding);
  return {music:{style:oneOf('music.style',m.style,STYLES),volume:unit('music.volume',m.volume),texture:unit('music.texture',m.texture),
      tempoMode:oneOf('music.tempoMode',m.tempoMode,TEMPO_MODES),tempo:integer('music.tempo',m.tempo,TEMPO_MIN,TEMPO_MAX),...profile('music',m,unit),mix:mix('music.mix',m.mix)},
    stage:{world:oneOf('stage.world',s.world,WORLDS),labels:oneOf('stage.labels',s.labels,LABELS),captions:bool('stage.captions',s.captions)},
    recording:{profile:oneOf('recording.profile',r.profile,PROFILES)},interface:{motion:oneOf('interface.motion',i.motion,MOTION)},
    onboarding:{dismissed:bool('onboarding.dismissed',o.dismissed),migrated:bool('onboarding.migrated',o.migrated)}};
}
function settings(dataDir){return createDocument(path.join(dataDir,'settings.json'),{schema:'code-resonance.settings.v1',defaults:SETTINGS_DEFAULTS,validate:validateSettings});}
// ---- Per-project preferences: <project dir>/preferences.json; null = inherit the global setting.
const PREFERENCES_DEFAULTS={world:null,music:{style:null,texture:null,tempoMode:null,tempo:null,...Object.fromEntries(PROFILE_KEYS.map(k=>[k,null])),mix:null}};
function validatePreferences(d){
  const m=section('music',d.music);
  return {world:orNull(oneOf,'world',d.world,WORLDS),music:{style:orNull(oneOf,'music.style',m.style,STYLES),texture:orNull(unit,'music.texture',m.texture),
    tempoMode:orNull(oneOf,'music.tempoMode',m.tempoMode,TEMPO_MODES),tempo:orNull(integer,'music.tempo',m.tempo,TEMPO_MIN,TEMPO_MAX),
    ...profile('music',m,(k,v)=>orNull(unit,k,v)),mix:orNull(mix,'music.mix',m.mix)}};
}
function preferences(projectDir){return createDocument(path.join(projectDir,'preferences.json'),{schema:'code-resonance.preferences.v1',defaults:PREFERENCES_DEFAULTS,validate:validatePreferences,nullResets:true});}
// ---- Presets: <data>/presets.json. Family/pack existence is checked when a preset is applied, not when it is stored.
function onlyKeys(prefix,obj,allowed){for(const k of Object.keys(obj))if(!allowed.includes(k))throw unknown(prefix+k);}
function packRef(key,v){if(v===null||v===undefined)return null;if(typeof v!=='string'||!PACK_REF.test(v))throw invalid(key);return v;}
function tuningValue(key,v){
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v==='boolean')return v;
  if(typeof v==='string'&&v.length<=16)return v;
  if(Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)))return [...v];
  throw invalid(key);
}
function visualPayload(p,key='payload'){
  section(key,p);onlyKeys(key+'.',p,['family','look','tuning','overrides']);
  const tuning=p.tuning===undefined?{}:section(key+'.tuning',p.tuning),overrides=p.overrides===undefined?{}:section(key+'.overrides',p.overrides);
  const keys=Object.keys(tuning);if(keys.length>MAX_TUNING)throw invalid(key+'.tuning');
  // "__proto__" would set the object's prototype instead of a key.
  const t={};for(const k of keys){if(!TUNING_PATH.test(k)||k==='__proto__')throw invalid(`${key}.tuning.${k.slice(0,64)}`);t[k]=tuningValue(`${key}.tuning.${k}`,tuning[k]);}
  onlyKeys(key+'.overrides.',overrides,['intensity','motion','labels']);
  const o={};
  for(const k of ['intensity','motion'])if(overrides[k]!==undefined){const v=overrides[k];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>2)throw invalid(`${key}.overrides.${k}`);o[k]=v;}
  if(overrides.labels!==undefined)o.labels=overrides.labels===null?null:oneOf(key+'.overrides.labels',overrides.labels,LABELS);
  return {family:packRef(key+'.family',p.family),look:packRef(key+'.look',p.look),tuning:t,overrides:o};
}
// A music preset is a performance: style, tempo source, texture and, since the composed score, its profile and mix
// (optional, so presets saved before keep exactly their shape). Never the key, mode or motif: those are the project's.
function musicPayload(p,key='payload'){
  section(key,p);onlyKeys(key+'.',p,['style','texture','tempoMode','tempo','profile','mix']);
  const out={style:oneOf(key+'.style',p.style,STYLES),texture:unit(key+'.texture',p.texture),tempoMode:oneOf(key+'.tempoMode',p.tempoMode,TEMPO_MODES),tempo:integer(key+'.tempo',p.tempo,TEMPO_MIN,TEMPO_MAX)};
  if(p.profile!==undefined){const f=section(key+'.profile',p.profile);onlyKeys(key+'.profile.',f,PROFILE_KEYS);out.profile=profile(key+'.profile',f,(k,v)=>v===undefined?.5:unit(k,v));}
  if(p.mix!==undefined)out.mix=mix(key+'.mix',p.mix);
  return out;
}
const payloadOf=(kind,p,key)=>kind==='visual'?visualPayload(p,key):musicPayload(p,key);
function presetName(v,key='name'){if(typeof v!=='string')throw invalid(key);const s=v.trim();if(!PRESET_NAME.test(s))throw invalid(key);return s;}
function validatePresets(d){
  if(!Array.isArray(d.presets)||d.presets.length>MAX_PRESETS)throw invalid('presets');
  const ids=new Set();
  return {presets:d.presets.map((p,i)=>{
    const at=`presets.${i}`;section(at,p);
    if(typeof p.id!=='string'||!PRESET_ID.test(p.id)||ids.has(p.id))throw invalid(at+'.id');ids.add(p.id);
    const kind=oneOf(at+'.kind',p.kind,['visual','music']);
    for(const k of ['createdAt','updatedAt'])if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0)throw invalid(`${at}.${k}`);
    return {id:p.id,kind,name:presetName(p.name,at+'.name'),createdAt:p.createdAt,updatedAt:p.updatedAt,payload:payloadOf(kind,p.payload,at+'.payload')};
  })};
}
const ACTIONS={create:['kind','name','payload'],rename:['id','name'],update:['id','payload'],delete:['id']};
function presets(dataDir,{now=Date.now,newId=()=>`p-${crypto.randomBytes(6).toString('hex')}`}={}){
  // The "patch" is one action: {action:'create', kind, name, payload} | {action:'rename', id, name} | {action:'update', id,
  // payload} | {action:'delete', id}. ifRevision may ride along in the same body.
  function apply(data,body){
    section('body',body);
    const action=body.action;if(!Object.hasOwn(ACTIONS,action))throw invalid('action');
    onlyKeys('',body,['action','ifRevision',...ACTIONS[action]]);
    const list=data.presets.map(p=>({...p})),t=now();
    if(action==='create'){
      if(list.length>=MAX_PRESETS)throw coded('invalid',400,`At most ${MAX_PRESETS} presets`,{key:'presets'});
      const kind=oneOf('kind',body.kind,['visual','music']);
      let id=newId();while(list.some(p=>p.id===id))id=newId();
      list.push({id,kind,name:presetName(body.name),createdAt:t,updatedAt:t,payload:payloadOf(kind,body.payload)});
      return {presets:list};
    }
    const index=typeof body.id==='string'?list.findIndex(p=>p.id===body.id):-1;
    if(index<0)throw coded('not-found',404,'Preset not found',{key:'id'});
    if(action==='delete')list.splice(index,1);
    else if(action==='rename')list[index]={...list[index],name:presetName(body.name),updatedAt:t};
    else list[index]={...list[index],payload:payloadOf(list[index].kind,body.payload),updatedAt:t};
    return {presets:list};
  }
  return createDocument(path.join(dataDir,'presets.json'),{schema:'code-resonance.presets.v1',defaults:{presets:[]},validate:validatePresets,apply});
}
module.exports={createDocument,settings,preferences,presets,writeAtomic,withLock,mergePatch,
  SETTINGS_DEFAULTS,PREFERENCES_DEFAULTS,STYLES,TEMPO_MODES,TEMPO_MIN,TEMPO_MAX,WORLDS,LABELS,PROFILES,MOTION,PROFILE_KEYS,MIX_GROUPS};

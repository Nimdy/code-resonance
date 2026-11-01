'use strict';
// Artist compositions: <data>/compositions.json, the authoritative copy of everything made in the Artist Studio (never
// a browser's storage). One document like the presets (receiver/store.js createDocument: revision-numbered, atomic,
// validated on read and write), holding up to 100 compositions; each keeps its last five saved versions, so a change
// never destroys the one before it. Every composition is stored normalize()d (public/composition.js): allowlisted
// layer types, signals and targets, clamped values, sanitised names. Nothing here is ever evaluated.
//
// Export: a composition becomes a data-only visual pack (declarative, SDK ^1.2, or ^1.3 over a family graduated in 0.8.1) the Visual Packs import installs
// anywhere: pack.json and a README. It carries the composition and its words only: no project, path, recipe or person
// beyond the author name the artist types.
const path=require('node:path');
const crypto=require('node:crypto');
const store=require('./store');
const Composition=require('../public/composition.js');
const Words=require('../public/composition-text.js');
const packs=require('../engine/packs');
const SCHEMA='code-resonance.compositions.v1',MAX=100,HISTORY=Composition.LIMITS.versions;
const ID=/^c-[0-9a-f]{12}$/,REF=/^[a-z0-9][a-z0-9.-]{0,63}$/;
const ORIGINS=['blank','starter','world','pack','copy','composition'];
const STARTERS=new Map(Composition.STARTERS.map(s=>[s.id,s]));
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function coded(code,status,message,extra={}){return Object.assign(new Error(message),{code,status,...extra});}
const invalid=(key,message=`Invalid value for ${key}`)=>coded('invalid',400,message,{key});
function onlyKeys(obj,allowed){for(const k of Object.keys(obj))if(!allowed.includes(k))throw coded('invalid',400,`Unknown key: ${k}`,{key:k});}
const time=(key,v)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw invalid(key);return v;};
// A composition as stored: normalised, its id the entry's (so a recipe that applies it can name it).
function canonical(c,id,key='composition'){
  if(!isPlain(c))throw invalid(key,'A composition is an object');
  const problems=Composition.validate(c);
  if(problems.length)throw invalid(problems[0].at?`${key}.${problems[0].at}`:key,`Invalid composition: ${problems[0].at?`${problems[0].at}: `:''}${problems[0].message}`);
  return {...Composition.normalize(c),id};
}
// A name as the composition model keeps it (no control characters or angle brackets, at most 48), never empty.
const nameOf=(v,key='name')=>{if(typeof v!=='string')throw invalid(key);const n=v.replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,Composition.LIMITS.name).trim();
  if(!/[\p{L}\p{N}]/u.test(n))throw invalid(key,'A name needs at least one letter or digit');return n;};
function originOf(o,key='origin'){
  if(o===undefined||o===null)return {kind:'blank',ref:null};
  if(!isPlain(o)||!ORIGINS.includes(o.kind))throw invalid(key);
  if(o.ref!==undefined&&o.ref!==null&&(typeof o.ref!=='string'||!REF.test(o.ref)))throw invalid(`${key}.ref`);
  return {kind:o.kind,ref:o.ref??null};
}
function validate(d){
  if(!Array.isArray(d.compositions)||d.compositions.length>MAX)throw invalid('compositions');
  const ids=new Set();
  return {compositions:d.compositions.map((e,i)=>{
    const at=`compositions.${i}`;if(!isPlain(e))throw invalid(at);
    if(typeof e.id!=='string'||!ID.test(e.id)||ids.has(e.id))throw invalid(`${at}.id`);ids.add(e.id);
    if(!Number.isInteger(e.version)||e.version<1)throw invalid(`${at}.version`);
    if(!Array.isArray(e.history)||e.history.length>HISTORY)throw invalid(`${at}.history`);
    return {id:e.id,version:e.version,createdAt:time(`${at}.createdAt`,e.createdAt),updatedAt:time(`${at}.updatedAt`,e.updatedAt),origin:originOf(e.origin,`${at}.origin`),
      composition:canonical(e.composition,e.id,`${at}.composition`),
      history:e.history.map((v,j)=>{if(!isPlain(v)||!Number.isInteger(v.version)||v.version<1)throw invalid(`${at}.history.${j}`);
        return {version:v.version,savedAt:time(`${at}.history.${j}.savedAt`,v.savedAt),composition:canonical(v.composition,e.id,`${at}.history.${j}.composition`)};})};
  })};
}
const ACTIONS={create:['starter','composition','name','origin','newId'],update:['id','composition','ifVersion'],rename:['id','name'],duplicate:['id','name','newId'],delete:['id'],restore:['id','version']};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// The patch is one action, as for the presets: {action:'create', starter? | composition?, name?, origin?} (neither: the
// blank canvas) | {action:'update', id, composition, ifVersion?} | {action:'rename', id, name} | {action:'duplicate', id,
// name?} | {action:'delete', id} | {action:'restore', id, version}. ifRevision may ride along (the whole document).
function compositions(dataDir,{now=Date.now,newId=()=>`c-${crypto.randomBytes(6).toString('hex')}`}={}){
  function apply(data,body){
    if(!isPlain(body))throw invalid('body');
    const action=body.action;if(!Object.hasOwn(ACTIONS,action))throw invalid('action');
    onlyKeys(body,['action','ifRevision',...ACTIONS[action]]);
    const list=data.compositions.map(e=>({...e})),t=now();
    // A new composition's id: chosen by the receiver (newId, set by the route), or generated here.
    const fresh=()=>{if(body.newId!==undefined){if(typeof body.newId!=='string'||!ID.test(body.newId))throw invalid('newId');if(list.some(e=>e.id===body.newId))throw invalid('newId','This id is taken');return body.newId;}
      let id=newId();while(list.some(e=>e.id===id))id=newId();return id;};
    const room=()=>{if(list.length>=MAX)throw coded('invalid',400,`At most ${MAX} compositions: delete one first`,{key:'compositions'});};
    if(action==='create'){
      room();
      if(body.starter!==undefined&&body.composition!==undefined)throw invalid('starter','Create from a starter or from a composition, not both');
      if(body.starter!==undefined&&!STARTERS.has(body.starter))throw invalid('starter','Unknown starter');
      const id=fresh(),source=body.composition!==undefined?body.composition:STARTERS.get(body.starter??'starter-blank');
      const composition=canonical(body.name!==undefined?{...source,name:nameOf(body.name)}:source,id);
      const origin=body.origin!==undefined?originOf(body.origin):body.starter&&body.starter!=='starter-blank'?{kind:'starter',ref:body.starter}:body.composition!==undefined?{kind:'composition',ref:null}:{kind:'blank',ref:null};
      list.push({id,version:1,createdAt:t,updatedAt:t,origin,composition,history:[]});
      return {compositions:list};
    }
    const index=typeof body.id==='string'?list.findIndex(e=>e.id===body.id):-1;
    if(index<0)throw coded('not-found',404,'Composition not found',{key:'id'});
    const e=list[index];
    // A new current version; the one it replaces goes first into the history (the oldest beyond five are let go).
    const save=composition=>{if(same(composition,e.composition))return e;
      return {...e,version:e.version+1,updatedAt:t,composition,history:[{version:e.version,savedAt:e.updatedAt,composition:e.composition},...e.history].slice(0,HISTORY)};};
    if(action==='delete')list.splice(index,1);
    else if(action==='update'){
      if(body.ifVersion!==undefined&&body.ifVersion!==null){if(!Number.isInteger(body.ifVersion))throw invalid('ifVersion');
        if(body.ifVersion!==e.version)throw coded('stale',409,'This composition was saved elsewhere since you opened it',{key:'ifVersion'});}
      list[index]=save(canonical(body.composition,e.id));
    }
    else if(action==='rename'){const name=nameOf(body.name);if(name!==e.composition.name)list[index]={...e,version:e.version+1,updatedAt:t,composition:{...e.composition,name}};}
    else if(action==='duplicate'){
      room();const id=fresh(),name=body.name!==undefined?nameOf(body.name):nameOf(`${e.composition.name.slice(0,Composition.LIMITS.name-5)} copy`);
      list.push({id,version:1,createdAt:t,updatedAt:t,origin:{kind:'copy',ref:e.id},composition:{...e.composition,id,name},history:[]});
    }
    else if(action==='restore'){
      // The version brought back becomes the current one; the one it replaces is kept in its place in the history.
      const v=Number.isInteger(body.version)?e.history.find(x=>x.version===body.version):null;if(!v)throw coded('not-found',404,'That version is no longer kept',{key:'version'});
      const rest=e.history.filter(x=>x!==v);
      list[index]=same(v.composition,e.composition)?{...e,history:rest}:{...e,version:e.version+1,updatedAt:t,composition:v.composition,history:[{version:e.version,savedAt:e.updatedAt,composition:e.composition},...rest].slice(0,HISTORY)};
    }
    return {compositions:list};
  }
  const doc=store.createDocument(path.join(dataDir,'compositions.json'),{schema:SCHEMA,defaults:{compositions:[]},validate,apply});
  return {...doc,newId};
}
// What the Control Center reads: every composition in full, its previous versions summarised (restored by number).
function view(doc){
  return {schema:doc.schema,revision:doc.revision,limit:MAX,compositions:doc.compositions.map(e=>({...e,
    history:e.history.map(v=>({version:v.version,savedAt:v.savedAt,name:v.composition.name,layers:v.composition.layers.length}))}))};
}
// ---- Export as a data-only visual pack ------------------------------------------------------------------------------
const LABEL=/^[\p{L}\p{N} .,'&()-]{1,40}$/u,LICENSE=/^[A-Za-z0-9.+-]{1,40}$/;
// The manifest's label grammar: other characters become spaces, at most 40.
const label=(s,fallback)=>{const v=String(s||'').replace(/[^\p{L}\p{N} .,'&()-]+/gu,' ').replace(/\s+/g,' ').trim().slice(0,40).trim();return LABEL.test(v)?v:fallback;};
const slug=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
function exportPack(entry,{author='',license='CC-BY-4.0',description=null}={}){
  const c=Composition.exportable(entry.composition);
  const name=label(c.name,'Untitled composition'),who=label(author,'A Code Resonance artist');
  const id=`creator.${slug(c.name)||'composition'}-${entry.id.slice(2,8)}`,version=`1.0.${Math.min(entry.version,99999)}`;
  const about=String(description??c.description??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,280);
  const declarative={base:c.base==='canvas'?'fractal-biosphere':c.base,composition:c};
  // Compositions came with SDK 1.2; a base that graduated later asks for the SDK that knows it.
  const sdk=`^1.${Math.max(2,...packs.needs({declarative}).map(([n])=>n))}`;
  const manifest={schema:'code-resonance.pack.v1',id,name,version,kind:'declarative',sdk,author:{name:who},...(about?{description:about}:{}),
    license:LICENSE.test(license)?license:'CC-BY-4.0',declarative};
  const folder=id.replace(/^creator\./,'');
  const text={'pack.json':JSON.stringify(manifest,null,2)+'\n','README.md':Words.readme(c,{packId:id,author:who,license:manifest.license,version})};
  return {id,name,version,folder,manifest,files:Object.entries(text).map(([p,s])=>({path:p,data:Buffer.from(s,'utf8').toString('base64'),size:Buffer.byteLength(s)}))};
}
module.exports={compositions,view,exportPack,SCHEMA,MAX,HISTORY};

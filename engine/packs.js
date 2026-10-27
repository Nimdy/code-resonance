'use strict';
// Visual packs (SDK 1): validation, compatibility, installation, removal and trust for the three kinds of pack.
//  - declarative: data only (parameters, palette, light, technique, effect mapping for an existing family, and since
//    SDK 1.2 an artist composition: layers and mappings from public/composition.js's allowlists). Validated against the
//    schema, the base family's catalogue and the composition model; usable at once.
//  - shader / world: contain code (GLSL, JavaScript). They are installed untrusted; the player runs them only inside the
//    isolated pack frame and only after the user approves the exact files (approval is bound to the content digest, so
//    any change to any file needs a new approval).
// Packs live in <data>/packs/<id>/ with an .install.json record; approvals in <data>/packs/trust.json (mode 0600).
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {compile}=require('./schema');
const catalog=require('./catalog');
const Composition=require('../public/composition.js');
// 1.2: declarative.composition (Artist Studio creations exported as data-only packs) and technique.finish.
const SDK_VERSION='1.2.0';
const SCHEMA=JSON.parse(fs.readFileSync(path.join(__dirname,'../packs/schema/pack.schema.json'),'utf8'));
const validateSchema=compile(SCHEMA);
const FILE=new RegExp(SCHEMA.$defs.file.pattern,'u');
const LIMITS={files:64,fileBytes:1024*1024,totalBytes:8*1024*1024};
const CODE=/\.(?:js|glsl|frag|vert)$/;
const BUILTIN=Object.keys(catalog.FAMILIES);
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
// SDK compatibility: '^1.N' runs on SDK 1.M when M >= N.
function compatible(manifest,sdk=SDK_VERSION){
  const m=/^\^(\d+)\.(\d+)$/.exec(manifest?.sdk||'');const [major,minor]=sdk.split('.').map(Number);
  if(!m)return {ok:false,reason:'missing or malformed "sdk"'};
  if(Number(m[1])!==major)return {ok:false,reason:`needs SDK ${m[1]}.x, this is ${sdk}`};
  if(Number(m[2])>minor)return {ok:false,reason:`needs SDK ${m[1]}.${m[2]} or later, this is ${sdk}`};
  return {ok:true};
}
const executable=kind=>kind==='shader'||kind==='world';
// Files a manifest refers to.
function referenced(m){
  const w=m.world||{},s=m.shader||{};
  return [w.entry,...(w.shaders||[]),...(w.textures||[]),s.background,...(s.post||[]),s.effects].filter(Boolean);
}
// The parameter catalogue a declarative or shader pack may override: a built-in family's, or an installed world
// pack's own parameters (as `params.<name>`) plus the shared palette / light / technique entries.
function catalogueOf(base,registry){
  if(catalog.FAMILIES[base])return {parameters:catalog.FAMILIES[base].parameters,effects:catalog.FAMILIES[base].effects,unlocks:catalog.FAMILIES[base].unlocks,builtin:true};
  const world=registry?.families?.[base];if(!world)return null;
  const parameters={...catalog.COMMON};
  for(const [k,p] of Object.entries(world.parameters||{}))parameters[`params.${k}`]=p.type==='enum'?{type:'enum',values:p.values}:p.type==='boolean'?{type:'boolean'}:{type:p.type,min:p.min,max:p.max};
  return {parameters,effects:[...new Set(Object.values(world.effects||{}))],unlocks:world.ambient?.unlocks||[],builtin:false,world};
}
// Ids that would name something else in the packs directory: the approval store, or (the part before the first dot) a
// Windows device name, whatever follows it.
const RESERVED_ID=/^(?:trust\.json(?:\.|$)|(?:con|prn|aux|nul|com[0-9]|lpt[0-9])\.)/;
function semantic(m,registry){
  const errors=[];const err=(at,message)=>errors.push({at,message});
  if(RESERVED_ID.test(m.id))err('/id',`"${m.id}" is reserved (it names a receiver file or a Windows device): choose another id`);
  const overrides=(at,o,cat)=>{for(const [k,v] of Object.entries(o||{})){const spec=cat.parameters[k];
    if(!spec)err(`${at}/${k}`,'is not a parameter of the base family');else if(!catalog.accepts(spec,v))err(`${at}/${k}`,`must be ${describe(spec)}`);}};
  if(m.kind==='declarative'){
    const d=m.declarative,cat=catalogueOf(d.base,registry);
    if(!cat){err('/declarative/base',`unknown family "${d.base}" (a built-in family or an installed world pack)`);return errors;}
    overrides('/declarative/overrides',d.overrides,cat);
    for(const [type,effect] of Object.entries(d.effects||{})){
      if(!cat.effects.includes(effect))err(`/declarative/effects/${type}`,`"${effect}" is not an effect of ${d.base} (${cat.effects.join(', ')})`);
      else if(cat.builtin&&catalog.effectClass(d.base,effect)!==catalog.EFFECT_CLASS[type])err(`/declarative/effects/${type}`,`"${effect}" expresses a ${catalog.effectClass(d.base,effect)} and cannot show a ${catalog.EFFECT_CLASS[type]}`);
      else if(!cat.builtin){const own=Object.entries(cat.world.effects||{}).filter(([,e])=>e===effect).map(([t])=>catalog.EFFECT_CLASS[t]);
        if(!own.includes(catalog.EFFECT_CLASS[type]))err(`/declarative/effects/${type}`,`"${effect}" cannot show a ${catalog.EFFECT_CLASS[type]}`);}
    }
    for(const u of d.unlocks||[])if(!cat.unlocks.includes(u))err('/declarative/unlocks',`"${u}" is not an ambient layer of ${d.base} (${cat.unlocks.join(', ')})`);
    // A composition stays data: allowlisted layer types and signals within the rendering budget (normalising drops
    // whatever else it holds). It is drawn on its own base; a canvas composition travels on a built-in family.
    if(d.composition!==undefined){
      for(const e of Composition.validate(d.composition))err(`/declarative/composition${e.at?`/${e.at.replace(/\./g,'/')}`:''}`,e.message);
      const base=Composition.normalize(d.composition).base;
      if(base!=='canvas'&&base!==d.base)err('/declarative/base',`must be the composition's base, "${base}"`);
      if(base==='canvas'&&!cat.builtin)err('/declarative/base','a canvas composition is carried by a built-in family');
    }
  }
  if(m.kind==='shader'){const cat=catalogueOf(m.shader.base);overrides('/shader/overrides',m.shader.overrides,cat);
    for(const [k,p] of Object.entries(m.shader.uniforms||{}))if(p.type!=='enum'&&p.type!=='boolean'&&p.min>p.max)err(`/shader/uniforms/${k}`,'min must not exceed max');}
  if(m.kind==='world'){
    const w=m.world;
    for(const [k,p] of Object.entries(w.parameters||{})){
      if((p.type==='number'||p.type==='integer')&&p.min>p.max)err(`/world/parameters/${k}`,'min must not exceed max');
      if(p.type==='enum'&&p.weights&&p.weights.length!==p.values.length)err(`/world/parameters/${k}`,'weights must match values');
    }
    // Lasting transformations must be expressed (worlds rebuild them after a seek from director.lasting()).
    for(const t of ['validation.failed','milestone.achieved'])if(!w.effects[t])err('/world/effects',`must express "${t}"`);
  }
  return errors;
}
const describe=s=>s.type==='enum'?`one of ${s.values.join(', ')}`:s.type==='color'?'a #rrggbb colour':s.type==='boolean'?'true or false':s.type==='vec3'?`three numbers in [${s.min}, ${s.max}]`:`a ${s.type} in [${s.min}, ${s.max}] (or a [min, max] range)`;
// Static checks of executable modules: one self-contained ES module, no imports (the SDK object brings everything).
function moduleProblems(file,source,exportName){
  const problems=[];
  if(/^\s*import\s[\s\S]*?from\s*['"]/m.test(source)||/^\s*import\s*['"]/m.test(source)||/\bimport\s*\(/.test(source))problems.push(`${file}: imports are not allowed (the SDK object passed in provides THREE and helpers)`);
  if(/^\s*export\s[\s\S]*?\sfrom\s*['"]/m.test(source))problems.push(`${file}: re-exports are not allowed`);
  if(!new RegExp(`export\\s+(?:async\\s+)?function\\s+${exportName}\\b|export\\s+(?:const|let)\\s+${exportName}\\b|export\\s*\\{[^}]*\\b${exportName}\\b`).test(source))problems.push(`${file}: must export ${exportName}`);
  return problems;
}
// Everything about a pack directory: manifest, files (with hashes), digest, errors and warnings. Never executes code.
function inspect(dir,registry=null){
  const errors=[],warnings=[];const out={dir,manifest:null,files:[],digest:null,errors,warnings};
  let manifest;
  try{manifest=JSON.parse(fs.readFileSync(path.join(dir,'pack.json'),'utf8'));}catch(e){errors.push({at:'pack.json',message:`cannot read: ${e.message}`});return out;}
  out.manifest=manifest;
  for(const e of validateSchema(manifest))errors.push({at:`pack.json${e.at==='/'?'':e.at}`,message:e.message});
  if(!errors.length){
    const c=compatible(manifest);if(!c.ok)errors.push({at:'pack.json/sdk',message:c.reason});
    for(const e of semantic(manifest,registry))errors.push({at:`pack.json${e.at}`,message:e.message});
  }
  // Files: every file must have an allowed name; limits on count and size; no links.
  const walk=(d,rel='')=>{for(const ent of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const r=rel?`${rel}/${ent.name}`:ent.name;
    if(ent.name.startsWith('.')){if(ent.name!=='.install.json')warnings.push(`${r}: hidden files are not installed`);continue;}
    if(ent.isSymbolicLink()){errors.push({at:r,message:'symbolic links are not allowed'});continue;}
    if(ent.isDirectory()){walk(path.join(d,ent.name),r);continue;}
    if(r==='pack.json'||r==='README.md'||r==='LICENSE'||r==='LICENSE.md'){out.files.push(file(d,ent.name,r));continue;}
    if(!FILE.test(r)){errors.push({at:r,message:'file names must be lowercase [a-z0-9_-] with an allowed extension (js, glsl, frag, vert, json, md, txt, png, jpg)'});continue;}
    out.files.push(file(d,ent.name,r));}};
  const file=(d,name,r)=>{const buf=fs.readFileSync(path.join(d,name));return {path:r,size:buf.length,sha256:sha256(buf)};};
  try{walk(dir);}catch(e){errors.push({at:'.',message:e.message});}
  if(out.files.length>LIMITS.files)errors.push({at:'.',message:`at most ${LIMITS.files} files`});
  for(const f of out.files)if(f.size>LIMITS.fileBytes)errors.push({at:f.path,message:`larger than ${LIMITS.fileBytes>>20} MB`});
  if(out.files.reduce((n,f)=>n+f.size,0)>LIMITS.totalBytes)errors.push({at:'.',message:`larger than ${LIMITS.totalBytes>>20} MB in total`});
  if(manifest&&!errors.some(e=>e.at.startsWith('pack.json'))){
    const have=new Set(out.files.map(f=>f.path));
    for(const r of referenced(manifest))if(!have.has(r))errors.push({at:r,message:'is referenced by pack.json but missing'});
    if(manifest.kind==='declarative'){for(const f of out.files)if(CODE.test(f.path))errors.push({at:f.path,message:'declarative packs contain no code (use kind "shader" or "world")'});}
    else{
      const entry=manifest.kind==='world'?[manifest.world.entry,'createWorld']:manifest.shader.effects?[manifest.shader.effects,'createEffects']:null;
      if(entry&&have.has(entry[0]))for(const p of moduleProblems(entry[0],fs.readFileSync(path.join(dir,entry[0]),'utf8'),entry[1]))errors.push({at:entry[0],message:p});
      for(const f of out.files)if(f.path.endsWith('.js')&&!referenced(manifest).includes(f.path))errors.push({at:f.path,message:'JavaScript files must be the declared entry or effects module'});
    }
  }
  out.digest=sha256(out.files.map(f=>`${f.path}\0${f.sha256}`).join('\n'));
  return out;
}
// ---- Installation ------------------------------------------------------------------------------------------------
const packsDir=dataDir=>path.join(dataDir,'packs');
const trustFile=dataDir=>path.join(packsDir(dataDir),'trust.json');
function readTrust(dataDir){try{const t=JSON.parse(fs.readFileSync(trustFile(dataDir),'utf8'));return t&&t.version===1&&t.approvals?t:{version:1,approvals:{}};}catch{return {version:1,approvals:{}};}}
function writeJson(file,obj){const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(obj,null,1),{mode:0o600});fs.renameSync(tmp,file);}
function install(src,dataDir,{registry=null,now=Date.now()}={}){
  const report=inspect(path.resolve(src),registry||createRegistry(dataDir).snapshot());
  if(report.errors.length){const e=new Error(`Pack is invalid:\n${report.errors.map(x=>`  ${x.at}: ${x.message}`).join('\n')}`);e.report=report;throw e;}
  const m=report.manifest,root=packsDir(dataDir),dest=path.join(root,m.id),stage=path.join(root,`.${m.id}.${process.pid}.staging`);
  fs.mkdirSync(root,{recursive:true,mode:0o700});fs.rmSync(stage,{recursive:true,force:true});
  for(const f of report.files){const to=path.join(stage,f.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(report.dir,f.path),to);}
  // The copy is verified against the inspected hashes before it replaces anything.
  for(const f of report.files)if(sha256(fs.readFileSync(path.join(stage,f.path)))!==f.sha256)throw new Error(`${f.path} changed during installation`);
  writeJson(path.join(stage,'.install.json'),{schema:'code-resonance.install.v1',id:m.id,version:m.version,kind:m.kind,digest:report.digest,files:report.files,installedAt:now});
  fs.rmSync(dest,{recursive:true,force:true});fs.renameSync(stage,dest);
  const trust=readTrust(dataDir),approved=trust.approvals[m.id];
  if(approved&&approved.digest!==report.digest){delete trust.approvals[m.id];writeJson(trustFile(dataDir),trust);}
  return {id:m.id,version:m.version,kind:m.kind,digest:report.digest,executable:executable(m.kind),trusted:!!approved&&approved.digest===report.digest,warnings:report.warnings};
}
function remove(id,dataDir){
  if(!/^[a-z0-9.-]{3,64}$/.test(id))throw new Error('Invalid pack id');
  const dest=path.join(packsDir(dataDir),id);if(!fs.existsSync(path.join(dest,'.install.json')))throw new Error(`Pack ${id} is not installed`);
  fs.rmSync(dest,{recursive:true,force:true});
  const trust=readTrust(dataDir);if(trust.approvals[id]){delete trust.approvals[id];writeJson(trustFile(dataDir),trust);}
  return {id,removed:true};
}
// Approve (or revoke) the exact installed files of an executable pack.
function setTrust(id,dataDir,{digest=null,trusted=true,now=Date.now()}={}){
  const entry=createRegistry(dataDir).get(id);if(!entry)throw new Error(`Pack ${id} is not installed`);
  if(!entry.executable)throw new Error(`Pack ${id} contains no code and needs no approval`);
  // A pack whose files differ from their installation record (or that fails validation) can be revoked, never approved.
  if(trusted&&!entry.ok)throw new Error(`Pack ${id} has problems and cannot be approved`);
  if(digest&&digest!==entry.digest)throw new Error('The pack changed since it was shown; review it again');
  const trust=readTrust(dataDir);
  if(trusted)trust.approvals[id]={digest:entry.digest,version:entry.version,approvedAt:now};else delete trust.approvals[id];
  fs.mkdirSync(packsDir(dataDir),{recursive:true,mode:0o700});writeJson(trustFile(dataDir),trust);
  return {...createRegistry(dataDir).get(id)};
}
// ---- Registry: installed packs as the receiver and the player see them ---------------------------------------------
// Every file of an installed pack (size and modification time), so a file changed after installation is noticed.
function signature(dir,rel=''){
  let out=[];try{for(const d of fs.readdirSync(path.join(dir,rel),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const r=rel?`${rel}/${d.name}`:d.name;
    if(d.isDirectory())out=out.concat(signature(dir,r));else{const st=fs.statSync(path.join(dir,r));out.push([r,st.size,st.mtimeMs]);}}}catch{}
  return out;
}
function createRegistry(dataDir){
  const root=packsDir(dataDir);let cache=null,stamp='';
  function scan(){
    let names=[];try{names=fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.name.startsWith('.')).map(d=>d.name).sort();}catch{}
    const records=names.map(n=>{try{const r=JSON.parse(fs.readFileSync(path.join(root,n,'.install.json'),'utf8'));return r.id===n?{n,r,m:signature(path.join(root,n))}:null;}catch{return null;}}).filter(Boolean);
    let trustStamp=0;try{trustStamp=fs.statSync(trustFile(dataDir)).mtimeMs;}catch{}
    const key=JSON.stringify([records.map(x=>[x.n,x.m]),trustStamp]);if(cache&&key===stamp)return cache;
    const trust=readTrust(dataDir);const packs=[];const families={};
    // World packs first, so declarative packs over them validate against their parameters.
    const order=records.sort((a,b)=>(a.r.kind==='world'?0:1)-(b.r.kind==='world'?0:1)||a.n.localeCompare(b.n));
    for(const {n,r} of order){
      const dir=path.join(root,n),report=inspect(dir,{families});const m=report.manifest||{};
      const problems=report.errors.map(e=>`${e.at}: ${e.message}`);
      if(report.digest!==r.digest)problems.push('installed files differ from the installation record (modified after install)');
      const exec=executable(m.kind),approved=trust.approvals[m.id];
      const entry={id:m.id||n,name:m.name||n,version:m.version||'0.0.0',kind:m.kind||'unknown',sdk:m.sdk,author:m.author||null,description:m.description||'',license:m.license||null,
        digest:report.digest,files:report.files.map(f=>({path:f.path,size:f.size,sha256:f.sha256})),executable:exec,
        trusted:exec?!!approved&&approved.digest===report.digest&&!problems.length:true,compatible:compatible(m).ok,ok:!problems.length,problems,installedAt:r.installedAt,dir,
        recorded:new Map((r.files||[]).map(f=>[f.path,f.sha256])),budget:m.world?.budget||m.shader?.budget||null};
      if(m.kind==='world'&&entry.ok){entry.family={id:m.id,name:m.world.family?.name||m.name,parameters:m.world.parameters||{},effects:m.world.effects,ambient:{base:m.world.ambient.base||[],unlocks:m.world.ambient.unlocks},palette:m.world.palette||null,budget:m.world.budget||null};families[m.id]=entry.family;}
      if(m.kind==='declarative'&&entry.ok)entry.overlay={base:m.declarative.base,overrides:m.declarative.overrides||{},effects:m.declarative.effects||{},unlocks:m.declarative.unlocks||null,technique:m.declarative.technique||null,
        ...(m.declarative.composition?{composition:Composition.exportable(m.declarative.composition)}:{})};
      if(m.kind==='shader'&&entry.ok)entry.overlay={base:m.shader.base,overrides:m.shader.overrides||{},effects:{},unlocks:null,technique:m.shader.technique||null,uniforms:m.shader.uniforms||{}};
      packs.push(entry);
    }
    cache={packs,families,byId:Object.fromEntries(packs.map(p=>[p.id,p]))};stamp=key;return cache;
  }
  return {
    snapshot:scan,list:()=>scan().packs,get:id=>Object.hasOwn(scan().byId,id)?scan().byId[id]:null,
    // A file of an installed pack: only files recorded at installation, read fresh and checked against the hash
    // recorded then (a file changed afterwards is never served).
    read(id,file){const p=Object.hasOwn(scan().byId,id)?scan().byId[id]:null;const expected=p?.recorded.get(file);if(!expected)return null;
      const buf=fs.readFileSync(path.join(p.dir,file));return sha256(buf)===expected?buf:null;}
  };
}
// The checks inspect() runs on a manifest alone (schema, compatibility, semantics): for manifests the receiver writes.
function checkManifest(m,registry=null){
  const errors=validateSchema(m).map(e=>({at:`pack.json${e.at==='/'?'':e.at}`,message:e.message}));if(errors.length)return errors;
  const c=compatible(m);if(!c.ok)errors.push({at:'pack.json/sdk',message:c.reason});
  for(const e of semantic(m,registry))errors.push({at:`pack.json${e.at}`,message:e.message});
  return errors;
}
module.exports={SDK_VERSION,SCHEMA,LIMITS,compatible,inspect,install,remove,setTrust,createRegistry,catalogueOf,executable,packsDir,checkManifest};

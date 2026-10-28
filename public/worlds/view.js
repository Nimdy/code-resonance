// The privacy-safe performance view: everything an executable visual pack can ever receive, built by explicit
// whitelists (unknown fields are dropped, so a field added to the timeline later never reaches a pack by accident).
// Identifiers must be opaque tokens (salted ids, hashes): anything that could be a path, file name, project name,
// session id or free text is removed. Intent ids, which embed client-chosen event ids, are replaced by hashes.
// Pure (no DOM), unit-tested with planted secrets (tests/pack-view.test.js).
const TOKEN=/^[A-Za-z0-9_-]{1,64}$/;
const SYMBOL_TYPES=new Set(['function','method','class','interface','type','variable','ui.component','api.route','callsite','module']);
const STATES=new Set(['draft','committed','validated','stressed']);
const LANGS=new Set(['ts','tsx','js','jsx','mjs','cjs','py','go','rs','json','css','md','html','other']);
const EDGE_KINDS=new Set(['depends','contains']);
const CATEGORIES=new Set(['structure','validation','ai','system','activity','editor','execution','repository','agent','dependency','symbol']);
const EVIDENCE=new Set(['observed','derived','inferred','verified']);
const AGENT_STATES=new Set(['connected','processing','tool','thinking','waiting','completed','disconnected']);
const ACTIVITIES=new Set(['reading','searching','editing','researching','delegating','planning','testing','building','checking','installing','versioning','formatting','running','using a tool']);
const MILESTONE_KINDS=/^[a-z]+(?:-[a-z]+)*$/;
const ATTRIBUTION=new Set(['correlated','direct']);
const SCOPE=new Set(['file','subsystem']);
const PROVIDER=/^[a-z0-9-]{1,40}$/;
const num=(x,lo=-1e15,hi=1e15)=>typeof x==='number'&&Number.isFinite(x)?Math.max(lo,Math.min(hi,x)):undefined;
const int=(x,lo,hi)=>Number.isInteger(x)?Math.max(lo,Math.min(hi,x)):undefined;
const token=x=>typeof x==='string'&&TOKEN.test(x)?x:undefined;
const tokens=(xs,max=256)=>Array.isArray(xs)?xs.map(token).filter(Boolean).slice(0,max):undefined;
const catalogId=x=>typeof x==='string'&&PROVIDER.test(x)?x:undefined;
const catalogIds=xs=>Array.isArray(xs)?xs.filter(x=>typeof x==='string'&&PROVIDER.test(x)).slice(0,8):undefined;
const seats=xs=>Array.isArray(xs)?xs.filter(x=>Number.isInteger(x)&&x>=0&&x<=7).slice(0,8):undefined;
const oneOf=(set,x)=>set.has(x)?x:undefined;
const bool=x=>typeof x==='boolean'?x:undefined;
function compact(o){for(const k of Object.keys(o))if(o[k]===undefined)delete o[k];return o;}
function counts(c){if(!c||typeof c!=='object')return {};const out={};for(const [k,v] of Object.entries(c))if(SYMBOL_TYPES.has(k)&&Number.isFinite(v))out[k]=Math.max(0,Math.min(1e6,v|0));return out;}
// An opaque, stable replacement for an id that may carry client text (two 32-bit FNV lanes, 16 hex digits).
export function opaque(s){s=String(s);let a=2166136261,b=0x811c9dc5^0x5bd1e995;
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);b^=b>>>13;}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
export function node(n){
  if(!n||typeof n!=='object'||!token(n.id))return null;
  if(n.type==='group')return compact({id:n.id,type:'group',core:bool(n.core),counts:counts(n.counts),modules:int(n.modules,0,1e6),order:int(n.order,0,1e6),
    q:int(n.q,-1e4,1e4),r:int(n.r,-1e4,1e4),angle:num(n.angle,-100,100),test:bool(n.test),tests:int(n.tests,0,1e6)});
  if(n.type==='module')return compact({id:n.id,type:'module',group:token(n.group),dir:token(n.dir),q:int(n.q,-1e4,1e4),r:int(n.r,-1e4,1e4),state:oneOf(STATES,n.state),
    test:bool(n.test),lang:LANGS.has(n.lang)?n.lang:'other',counts:counts(n.counts),weight:num(n.weight,0,1e3)});
  if(SYMBOL_TYPES.has(n.type)&&token(n.parent))return compact({id:n.id,type:n.type,parent:n.parent,slot:int(n.slot,0,1e6),weight:num(n.weight,0,1e3)});
  return null;
}
export function edge(e){
  if(!e||!token(e.a)||!token(e.b)||!EDGE_KINDS.has(e.kind))return null;
  return compact({a:e.a,b:e.b,kind:e.kind,cross:bool(e.cross)});
}
const list=(xs,f)=>Array.isArray(xs)?xs.map(f).filter(Boolean):[];
// A keyframe ({keyframe,nodes,edges}) or a delta ({add,remove,addEdges,removeEdges}).
export function graph(g){
  if(!g||typeof g!=='object')return {add:[],remove:[],addEdges:[],removeEdges:[]};
  if(g.keyframe||Array.isArray(g.nodes))return {keyframe:!!g.keyframe,nodes:list(g.nodes,node),edges:list(g.edges,edge)};
  return {add:list(g.add,node),remove:list(g.remove,token),addEdges:list(g.addEdges,edge),removeEdges:list(g.removeEdges,edge)};
}
export function cue(c){
  if(!c||typeof c!=='object'||typeof c.type!=='string'||!/^[a-z]+(?:\.[a-z]+){1,4}$/.test(c.type))return null;
  const d=c.detail||{};
  return compact({type:c.type,ts:num(c.ts,0),weight:num(c.weight,0,100),category:oneOf(CATEGORIES,c.category),confidence:num(c.confidence,0,1),
    detail:compact({fileId:token(d.fileId),fileIds:tokens(d.fileIds),symbolId:token(d.symbolId),symbolType:oneOf(SYMBOL_TYPES,d.symbolType),targetId:token(d.targetId),
      dependencyId:token(d.dependencyId),cross:bool(d.cross),voice:int(d.voice,0,64),attribution:oneOf(ATTRIBUTION,d.attribution),agentId:token(d.agentId),
      count:int(d.count,0,1e6),edits:int(d.edits,0,1e6),errors:int(d.errors,0,1e6),warnings:int(d.warnings,0,1e6),insertedNewlines:int(d.insertedNewlines,0,1e6),
      size:int(d.size,0,1e9),truncated:bool(d.truncated),internal:bool(d.internal),voices:seats(d.voices),providers:catalogIds(d.providers),provider:catalogId(d.provider)})});
}
function kinds(k){
  if(Array.isArray(k))return k.filter(x=>typeof x==='string'&&MILESTONE_KINDS.test(x)&&x.length<=40).slice(0,8);
  if(k&&typeof k==='object')return counts(k);
  return undefined;
}
export function intent(i){
  if(!i||typeof i!=='object'||typeof i.type!=='string'||!/^[a-z]+(?:\.[a-z]+){1,2}$/.test(i.type)||typeof i.id!=='string')return null;
  const s=i.subject||{},d=i.detail||{};
  return compact({v:1,id:opaque(i.id),type:i.type,ts:num(i.ts,0),ord:num(i.ord,0),tier:int(i.tier,0,4)??0,magnitude:num(i.magnitude,0,1)??0,evidence:oneOf(EVIDENCE,i.evidence)||'observed',
    subject:compact({fileId:token(s.fileId),groupId:token(s.groupId),targetId:token(s.targetId),targetGroupId:token(s.targetGroupId),agentId:token(s.agentId),
      voice:int(s.voice,0,64),fileIds:tokens(s.fileIds),provenance:oneOf(ATTRIBUTION,s.provenance)}),
    detail:compact({state:oneOf(AGENT_STATES,d.state),activity:oneOf(ACTIVITIES,d.activity),subagent:bool(d.subagent),count:int(d.count,0,1e6),kinds:kinds(d.kinds),
      chapter:int(d.chapter,0,1e4),category:typeof d.category==='string'&&/^[a-z]{1,16}$/.test(d.category)?d.category:undefined,repaired:int(d.repaired,0,1e6),
      first:bool(d.first),removedSymbols:int(d.removedSymbols,0,1e6),providers:catalogIds(d.providers),provider:catalogId(d.provider),scope:oneOf(SCOPE,d.scope)})});
}
const FAMILY_ID=/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
// Recipe fields a pack may read: its family, seed, genome (numbers, enums, colours), aggregate traits, the viewer's
// settings, and the public strings the user approved (public title, subsystem aliases).
const ALIAS=/^[\p{L}\p{N} .,'&()-]{1,40}$/u;
function plain(x,depth=0){
  if(depth>6)return undefined;
  if(typeof x==='number')return Number.isFinite(x)?x:undefined;
  if(typeof x==='boolean')return x;
  if(typeof x==='string')return x.length<=64&&/^[A-Za-z0-9 #._:-]*$/.test(x)?x:undefined;
  if(Array.isArray(x))return x.slice(0,64).map(v=>plain(v,depth+1)).filter(v=>v!==undefined);
  if(x&&typeof x==='object'){const o={};for(const [k,v] of Object.entries(x)){if(!/^[A-Za-z0-9._-]{1,48}$/.test(k))continue;const p=plain(v,depth+1);if(p!==undefined)o[k]=p;}return o;}
  return undefined;
}
export function recipe(r){
  if(!r||typeof r!=='object')return null;
  const aliases={};for(const [k,v] of Object.entries(r.aliases||{}))if(token(k)&&typeof v==='string'&&ALIAS.test(v))aliases[k]=v;
  return compact({schema:r.schema,family:FAMILY_ID.test(r.family||'')?r.family:undefined,familyName:typeof r.familyName==='string'&&ALIAS.test(r.familyName)?r.familyName:undefined,
    variant:int(r.variant,0,1e6),projectSeed:int(r.projectSeed,0,2**32),source:oneOf(new Set(['generated','user']),r.source),
    genome:plain(r.genome),traits:plain(r.traits),overrides:plain(r.overrides),pack:r.pack?plain(r.pack):undefined,aliases,
    title:typeof r.title==='string'&&ALIAS.test(r.title)?r.title:null});
}
export function mood(m){return compact({section:typeof m?.section==='string'&&/^[a-z]{1,16}$/.test(m.section)?m.section:undefined,energy:num(m?.energy,0,1),tempo:num(m?.tempo,20,300)});}
// A timeline entry for priming: only its sequence number and intents.
export function primeEntry(e){return {seq:int(e?.seq,0,1e9),intents:list(e?.intents,x=>{const v=intent(x);if(v&&x.ord===undefined&&Number.isInteger(e?.seq))v.ord=e.seq*65536+(e.intents.indexOf(x));return v;})};}

'use strict';
// Shared by the language adapter suites (tests/languages-*.test.js): symbol listings, the two invariants every adapter
// keeps (inserting lines above changes no key and no fingerprint; editing one body modifies exactly that symbol), and
// a small project run through the reducer to see which module each import resolves to.
const assert=require('node:assert/strict');
const {analyze,diff}=require('../engine/semantic');
const {newState,apply,publicProjection}=require('../engine/reducer');
const {sha}=require('../receiver/protocol');
const list=r=>r.symbols.map(s=>`${s.kind} ${s.owner?s.owner+'.':''}${s.name}`);
function invariants(file,source,{prefix,edit,modified}){
  const base=analyze(file,source);
  assert.deepEqual(diff(base,analyze(file,prefix+source)),[],`${file}: inserting lines above changes no key or fingerprint`);
  assert(base.symbols.length>0,`${file}: the fixture has structure`);
  const changed=diff(base,analyze(file,source.replace(edit[0],edit[1])));
  assert.notEqual(source.replace(edit[0],edit[1]),source,'the edit applies');
  assert.deepEqual(changed.map(c=>`${c.kind} ${c.symbol?c.symbol.name:c.import.spec}`),modified);
}
// Snapshots applied in order; edges() lists, per importing file, the project files its imports resolve to.
function project(files,{salt='lang'}={}){
  const s=newState(sha(`languages-${salt}`));s.salt=salt;let seq=0;
  for(const [file,content] of Object.entries(files))
    apply(s,{v:1,kind:'document.snapshot',id:`${salt}-${++seq}`,ts:1760000000000+seq*1000,projectId:s.projectId,sessionId:'s',origin:'test',file,content,meta:{reason:'edit'}});
  const g=publicProjection(s).graph,id=f=>sha(`${salt}:m:${f}`).slice(0,14),byId=new Map(Object.keys(files).map(f=>[id(f),f]));
  const edges=file=>g.edges.filter(e=>e.kind==='depends'&&e.a===id(file)).map(e=>byId.get(e.b)).sort();
  const node=file=>g.nodes.find(n=>n.id===id(file));
  return {state:s,graph:g,edges,node};
}
module.exports={list,invariants,project,analyze,diff};

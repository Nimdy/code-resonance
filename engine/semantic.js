'use strict';
// Structure of a source file comes from its language adapter (engine/languages); the diff is language-independent.
const languages = require('./languages');
const {importedTarget} = require('./languages/typescript');
const analyze = languages.analyze;
function diff(before,after) {
  const b=new Map(before.symbols.map(s=>[s.key,s]));
  const a=new Map(after.symbols.map(s=>[s.key,s]));
  const result=[];
  for (const [key,s] of a) {
    if (!b.has(key)) result.push({kind:'symbol.created',symbol:s});
    else if(b.get(key).fingerprint!==s.fingerprint) result.push({kind:'symbol.modified',symbol:s});
  }
  for(const [key,s] of b) if(!a.has(key)) result.push({kind:'symbol.removed',symbol:s});
  const bDeps=new Set(before.imports.map(i=>i.spec));
  for (const imp of after.imports) if(!bDeps.has(imp.spec)) result.push({kind:'dependency.added',import:imp});
  for (const imp of before.imports) if(!after.imports.some(x=>x.spec===imp.spec)) result.push({kind:'dependency.removed',import:imp});
  return result;
}
module.exports={analyze,diff,importedTarget};

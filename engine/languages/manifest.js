'use strict';
// Package manifests (package.json): no code symbols, but the package's name, so imports of a workspace package
// (`@scope/core`, `@scope/core/utils`) resolve to the folder that declares it, as monorepo tooling does.
const path=require('node:path').posix;
function analyze(file,source){
  let name=null;
  try{const json=JSON.parse(source);if(typeof json.name==='string'&&/^(?:@[\w.-]+\/)?[\w.-]{1,120}$/.test(json.name))name=json.name;}catch{}
  return {symbols:[],imports:[],errors:0,lines:source.split('\n').length,...(name?{manifest:{name,dir:path.dirname(file)}}:{})};
}
module.exports={id:'manifest',test:file=>/(?:^|\/)package\.json$/.test(file),analyze};

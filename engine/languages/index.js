'use strict';
// Language adapters turn one source file into structure: {symbols, imports, errors, lines}. Each adapter owns its
// language's parsing; nothing language-specific lives in the reducer or the renderers. A file no adapter supports
// yields no symbols (it is still a module, shown as a structure without storeys), never a guess.
//
// Adapter contract: {id, test(file) -> boolean, analyze(file, source) -> analysis}. A symbol is
// {key, kind, name, owner, fingerprint, size, line, local}; kinds are the shared vocabulary
// (class, interface, type, function, method, property, variable, ui.component, api.route, callsite).
// An import is {spec, target} where target is a project-relative path without extension (or null when external);
// adapters may add `alt` (a fallback target) and `candidate` (a path that is internal only if such a file exists).
const ADAPTERS=[require('./typescript'),require('./python')];
const EMPTY=()=>({symbols:[],imports:[],errors:0,lines:0});
function adapterFor(file){return ADAPTERS.find(a=>a.test(file))||null;}
function analyze(file,source){const a=adapterFor(file);return a?a.analyze(file,source):EMPTY();}
// A coarse, privacy-safe category of what a file is (its extension family), used for a project's language mix.
const LANGS=[['tsx',/\.tsx$/i],['ts',/\.(?:ts|mts|cts)$/i],['jsx',/\.jsx$/i],['js',/\.(?:js|mjs|cjs)$/i],['py',/\.pyi?$/i],['go',/\.go$/i],['rs',/\.rs$/i],
  ['css',/\.(?:css|scss|less)$/i],['html',/\.html?$/i],['json',/\.json$/i],['md',/\.(?:md|mdx)$/i]];
function languageOf(file){for(const [id,re] of LANGS)if(re.test(file))return id;return 'other';}
module.exports={ADAPTERS,adapterFor,analyze,languageOf};

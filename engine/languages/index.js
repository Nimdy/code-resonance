'use strict';
// Language adapters turn one source file into structure: {symbols, imports, errors, lines}. Each adapter owns its
// language's parsing; nothing language-specific lives in the reducer or the renderers. A file no adapter supports
// yields no symbols (it is still a module, shown as a structure without storeys), never a guess.
//
// Adapter contract: {id, test(file) -> boolean, analyze(file, source) -> analysis}. A symbol is
// {key, kind, name, owner, fingerprint, size, line, local}; kinds are the shared vocabulary
// (class, interface, type, function, method, property, variable, ui.component, api.route, callsite).
// An import is {spec, target} where target is a project-relative path without extension (or null when external);
// adapters may add `alt` (fallback targets, one or a list) and `candidate` (paths, one or a list, that are internal
// only if such a file exists). Without `ext` those paths resolve as JS/Python modules do (any extension, a folder's
// index or __init__ file); with `ext` (a list such as ['.rs'], or [''] when the path carries its extension) only
// path+ext matches, exactly. `dir` names package directories (Go packages, Java/Kotlin packages, C# namespaces, Swift
// modules) that resolve to one representative file there with one of `ext`. `manifest` (with `pkg`, the import's
// slash-separated path, defaulting to spec) says the import may name a package declared by a manifest of that kind.
// A manifest adapter may add `manifest: {name, dir, kind?}` (or a list of them) so such imports resolve to its folder.
const ADAPTERS=[require('./typescript'),require('./python'),require('./go'),require('./rust'),require('./java'),require('./kotlin'),
  require('./csharp'),require('./swift'),require('./cfamily'),require('./php'),require('./ruby'),require('./manifest')];
const EMPTY=()=>({symbols:[],imports:[],errors:0,lines:0});
function adapterFor(file){return ADAPTERS.find(a=>a.test(file))||null;}
function analyze(file,source){const a=adapterFor(file);return a?a.analyze(file,source):EMPTY();}
// How a manifest's packages map to project paths, by kind: a Go import path names a directory of the module; a Rust
// path names a module under the crate's src/ (the innermost that exists, else the crate root); a PSR-4 class names a
// file. `sub` is the import path after the manifest's name ('' for the name itself).
function packageTargets(m,sub){
  const base=!m.dir||m.dir==='.'?'':m.dir+'/';
  if(m.kind==='go')return {paths:[],dirs:[(base+sub).replace(/\/$/,'')],ext:['.go']};
  if(m.kind==='rust'){const segs=sub?sub.split('/'):[],root=base+'src',paths=[];
    for(let k=segs.length;k>=1;k--){const p=`${root}/${segs.slice(0,k).join('/')}`;paths.push(p,p+'/mod');}
    paths.push(root+'/lib');return {paths,dirs:[],ext:['.rs']};}
  if(m.kind==='php')return {paths:sub?[base+sub]:[],dirs:[],ext:['.php']};
  return {paths:[],dirs:[],ext:null};
}
// A coarse, privacy-safe category of what a file is (its extension family), used for a project's language mix.
// Categories are only ever added; a file keeps the category it always had.
const LANGS=[['tsx',/\.tsx$/i],['ts',/\.(?:ts|mts|cts)$/i],['jsx',/\.jsx$/i],['js',/\.(?:js|mjs|cjs)$/i],['py',/\.pyi?$/i],['go',/\.go$/i],['rs',/\.rs$/i],
  ['css',/\.(?:css|scss|less)$/i],['html',/\.html?$/i],['json',/\.json$/i],['md',/\.(?:md|mdx)$/i],
  ['java',/\.java$/i],['kt',/\.kts?$/i],['cs',/\.cs$/i],['swift',/\.swift$/i],['c',/\.[ch]$/i],['cpp',/\.(?:cc|cpp|cxx|c\+\+|hh|hpp|hxx|h\+\+|ipp|inl)$/i],
  ['php',/\.php$/i],['rb',/\.(?:rb|rake)$/i]];
function languageOf(file){for(const [id,re] of LANGS)if(re.test(file))return id;return 'other';}
module.exports={ADAPTERS,adapterFor,analyze,languageOf,packageTargets};

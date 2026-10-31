'use strict';
// C and C++ adapter (sources and headers): a dependency-free scanner over the shared lexer (engine/languages/scan.js;
// raw strings R"x(...)x", char literals and digit separators, comments). Preprocessor lines are read for #include
// only; of an #if/#else only the first branch is scanned (an #if 0 keeps its #else), so alternative signatures cannot
// unbalance the braces.
//
// Recognised: classes, structs, unions and enums (class; `typedef struct {...} Name` by its name), their members
// (methods with constructors, destructors and operators; fields as property), functions, out-of-line definitions
// (`void Foo::bar() {}` is method bar owned by Foo; the last qualifier is taken as the owner, so a namespace-qualified
// free function reads as owned by its namespace), prototypes (kept only when this file does not also define them),
// globals (variable), typedefs and `using X = ...` (type), namespaces and extern "C" blocks (transparent), templates,
// and Crow routes (`CROW_ROUTE(app, "/x")`).
// Imports: `#include "x.h"` resolves beside the including file, then in each enclosing folder and its include/;
// `#include <x/y.h>` is a candidate there and in the project's include/ and src/ (internal only if such a file exists).
// Not recognised: macro-generated definitions (an ALL_CAPS "function" is taken as a macro and skipped), K&R
// declarations, Objective-C, and the alternative branches of conditional compilation.
const path=require('node:path').posix;
const scan=require('./scan');
const DIALECT={chars:'c',cpp:true,pre:'c'};
const QUAL=/^(?:(?:static|inline|extern|constexpr|consteval|constinit|virtual|explicit|mutable|thread_local|register|volatile|_Noreturn|__inline|__inline__|__forceinline|__extension__|typename|export)\s+)+/;
const KEYWORDS=new Set(['if','for','while','switch','return','sizeof','alignof','decltype','static_assert','_Static_assert','defined','typeof','__typeof__','catch','new','delete','throw','case','do','else','__attribute__','__declspec','alignas','noexcept','requires','co_return','co_await']);
const MACRO=/^[A-Z][A-Z0-9_]+$/;
// Macro words that open a declaration without a semicolon (`_GLIBCXX_BEGIN_NAMESPACE_VERSION`, `DWORD WINAPI f()`): an
// ALL_CAPS word followed by another such word or by a declaration keyword is noise, not a type.
const NOISE=/^(?:_*[A-Z][A-Z0-9_]*[A-Z0-9_])(?:\s*\([^()]*\))?\s+(?=(?:_*[A-Z][A-Z0-9_]*[A-Z0-9_]|template|class|struct|union|enum|namespace|typedef|using|static|inline|extern|virtual|explicit|constexpr|friend|typename|const|auto|void)\b)/;
function analyze(file,source){
  if(scan.tooLarge(source))return scan.EMPTY();
  const src=scan.prepare(source,DIALECT),{code,match}=src;
  const defined=new Set(),declared=[];
  // Leading noise of a declaration: template<...>, [[attributes]], __attribute__((...)), access labels, Qt macros,
  // storage qualifiers and extern "C".
  function clean(s,e){
    let k=s;
    for(let guard=0;guard<40;guard++){
      while(k<e&&scan.space(code[k]))k++;
      const rest=code.slice(k,e);let m;
      if((m=/^template\s*</.exec(rest))){let depth=0,i=k+m[0].length-1;for(;i<e;i++){const c=code[i];if(c==='('&&match[i]>i){i=match[i];continue;}if(c==='<')depth++;else if(c==='>'&&--depth===0)break;}k=i+1;continue;}
      if(code[k]==='['&&code[k+1]==='['&&match[k]>k){k=match[k]+1;continue;}
      if((m=/^(?:__attribute__|__declspec|alignas|__asm__|_Alignas)\s*\(/.exec(rest))){const p=k+m[0].length-1;k=match[p]>p?match[p]+1:k+m[0].length;continue;}
      if((m=/^(?:(?:public|protected|private)(?:\s+(?:slots|Q_SLOTS))?|signals|Q_SIGNALS|Q_SLOTS)\s*:(?!:)/.exec(rest))){k+=m[0].length;continue;}
      if((m=/^Q_[A-Z_]+\b\s*/.exec(rest))){k+=m[0].length;if(code[k]==='('&&match[k]>k)k=match[k]+1;continue;}
      if((m=QUAL.exec(rest))){k+=m[0].length;continue;}
      if((m=NOISE.exec(rest))){k+=m[0].length;continue;}
      if((m=/^extern\s*"\s*"\s*(?!\{|\s*$)/.exec(rest))){k+=m[0].length;continue;}
      break;
    }
    return {k,text:code.slice(k,e),start:(()=>{let a=s;while(a<e&&scan.space(code[a]))a++;return a;})()};
  }
  // A function or method header in [k,e): {name, owner, at} or null.
  function func(k,e,ctx,body){
    const sig=scan.signature(src,k,e);if(!sig)return null;
    const parts=sig.name.split('::'),name=parts.at(-1),owner=parts.length>1?parts.at(-2):ctx.owner;
    if(KEYWORDS.has(name)||MACRO.test(name)&&!/^operator/.test(name))return null;
    if(/=/.test(sig.before))return null;
    const typed=/[\w>*&\]]/.test(sig.before),special=parts.length>1||name===ctx.owner||name==='~'+ctx.owner||/^operator\b/.test(name)&&!!ctx.owner;
    if(!typed&&!special)return null;
    const params=code.slice(sig.open+1,sig.close).trim();
    if(/^(?:["'0-9-]|&\s*\w)/.test(params))return null;
    const after=src.flat(sig.close+1,e).replace(/=\s*(?:0|default|delete)\s*$/,'');
    if(/=/.test(after))return null;
    if(/,/.test(after)&&!/^\s*(?:(?:const|volatile|noexcept|override|final|&&?)\s*(?:\(\s*\))?\s*)*:/.test(after))return null;
    // `Foo() : a(1), b{2} {`: a brace right after a member name is that member's initializer, not the body.
    if(body&&/^[^:]*:(?!:)/.test(after)&&/[\w>]\s*$/.test(after))return {init:true};
    return {name,owner:parts.length>1||ctx.owner?owner:'',at:sig.at+sig.name.length-name.length};
  }
  function vars(d,e,ctx){
    const flat=src.flat(d.k,e);
    let m;
    if((m=/^\s*[\w:<>\s*&]+\(\s*\*\s*([A-Za-z_]\w*)\s*\)\s*\(/.exec(code.slice(d.k,e)))){const at=d.k+m[0].lastIndexOf(m[1]);src.add(ctx.owner?'property':'variable',m[1],ctx.owner,{at,start:d.start,end:e});return;}
    if(/\(/.test(flat.split('=')[0]))return;
    scan.splitTop(flat).forEach((p,i)=>{
      // `int a = 1`, `int flag : 1` (a bit-field), `std::vector<int> v{1, 2}`, `char *names[]`: the name before them.
      const lhs=scan.blankAngles(p.text.split(/=|(?<!:):(?!:)/)[0]).replace(/\{[^}]*\}\s*$/,'').replace(/\[[^\]]*\]/g,m=>' '.repeat(m.length)),n=/([A-Za-z_]\w*)\s*$/.exec(lhs);
      if(!n||KEYWORDS.has(n[1])||i===0&&!/[a-z>*&]|\b[A-Z][a-z]/.test(lhs.slice(0,n.index))||/^(?:return|goto|break|continue|using|friend|typedef|static_assert)$/.test(lhs.trim().split(/\s+/)[0]))return;
      src.add(ctx.owner?'property':'variable',n[1],ctx.owner,{at:d.k+p.at+n.index,start:d.start,end:e});
    });
  }
  function body(from,to,ctx){
    scan.walk(src,from,to,{
      brace:(s,o,c)=>{
        if(/^\s*extern\s*"[^"]*"\s*$/.test(code.slice(s,o))){body(o+1,c,ctx);return true;}
        const d=clean(s,o),t=d.text.trim();let m;
        if(/^(?:inline\s+)?namespace\b/.test(t)){body(o+1,c,ctx);return true;}
        if((m=/^(?:typedef\s+)?(class|struct|union|enum(?:\s+(?:class|struct))?)\s*(?:[A-Z][A-Z0-9_]*\s+(?=[A-Za-z_]))?(?:alignas\s*\([^)]*\)\s*)?([A-Za-z_]\w*)?(?:\s*<[^{]*>)?(?:\s+final)?\s*(?::(?!:)[^]*)?$/.exec(t))){
          let name=m[2],at=name?d.k+d.text.indexOf(name,d.text.indexOf(m[1])+m[1].length):-1;
          if(!name&&/^typedef\b/.test(t)){const after=/^[\s*]*([A-Za-z_]\w*)/.exec(code.slice(c+1,c+200));if(after){name=after[1];at=c+1+after.index+after[0].length-name.length;}}
          if(name){src.add('class',name,ctx.owner,{at,start:d.start,end:c+1});if(!/^enum/.test(m[1]))body(o+1,c,{owner:name});}
          return true;
        }
        const f=func(d.k,o,ctx,true);
        if(f&&f.init)return false;
        if(f){const kind=f.owner?'method':'function';defined.add(`${kind}:${f.owner}.${f.name}`);src.add(kind,f.name,f.owner,{at:f.at,start:d.start,end:c+1,span:true});return true;}
        // An initializer (`= {1, 2}`, `v{1, 2}`, a lambda) continues the declaration; any other block ends it.
        if(/=/.test(src.flat(d.k,o))||/[\w>]\s+[A-Za-z_]\w*\s*$/.test(scan.blankAngles(t)))return false;
        return true;
      },
      end:(s,e)=>{
        const d=clean(s,e),t=d.text.trim();let m;if(!t)return;
        if(/^(?:using\s+namespace|friend|static_assert|_Static_assert|template\s+(?:class|struct)|(?:class|struct|union|enum(?:\s+(?:class|struct))?)\s+[\w:]+\s*(?::\s*\w+\s*)?$)\b/.test(t))return;
        if((m=/^using\s+([A-Za-z_]\w*)\s*=/.exec(t))){src.add('type',m[1],ctx.owner,{at:d.k+t.indexOf(m[1]),start:d.start,end:e});return;}
        if(/^using\b/.test(t))return;
        if(/^typedef\b/.test(t)){const flat=src.flat(d.k,e);const n=/\(\s*\*\s*([A-Za-z_]\w*)\s*\)/.exec(code.slice(d.k,e))||/([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*$/.exec(flat);
          if(n){const at=d.k+(n.input===flat?n.index:code.slice(d.k,e).indexOf(n[1],n.index));src.add('type',n[1],ctx.owner,{at,start:d.start,end:e});}return;}
        const f=func(d.k,e,ctx,false);
        if(f&&!f.init){declared.push({kind:f.owner?'method':'function',name:f.name,owner:f.owner,at:f.at,start:d.start,end:e});return;}
        if(!/\(/.test(src.flat(d.k,e).split('=')[0])||/\(\s*\*/.test(t))vars(d,e,ctx);
      }});
  }
  body(0,code.length,{owner:''});
  // Declarations count where this file has no definition of the same thing (a header, or a forward prototype).
  for(const x of declared)if(!defined.has(`${x.kind}:${x.owner}.${x.name}`)){defined.add(`${x.kind}:${x.owner}.${x.name}`);src.add(x.kind,x.name,x.owner,{at:x.at,start:x.start,end:x.end});}
  routes(src);
  return src.result(includes(file,src.directives));
}
function includes(file,directives){
  const out=[],dir=path.dirname(file)==='.'?'':path.dirname(file),self=file;
  const ancestors=[];for(let d=dir;;d=path.dirname(d)==='.'?'':path.dirname(d)){ancestors.push(d);if(!d)break;}
  for(const x of directives){
    const m=/^#\s*(?:include|include_next|import)\s*([<"])([^>"]+)[>"]/.exec(x.text);if(!m)continue;
    const inc=path.normalize(m[2]);if(inc.startsWith('../')&&m[1]==='<')continue;
    const spec=(m[1]==='"'?`"${m[2]}"`:`<${m[2]}>`).slice(0,180);
    const tries=[];
    if(m[1]==='"'){tries.push(path.normalize(path.join(dir,m[2])));for(const a of ancestors.slice(1))tries.push(path.join(a,m[2]),path.join(a,'include',m[2]));tries.push(path.join('include',m[2]));}
    else for(const a of ancestors)tries.push(path.join(a,'include',m[2]),path.join(a,m[2]),path.join(a,'src',m[2]));
    const list=[...new Set(tries.map(t=>path.normalize(t)))].filter(t=>!t.startsWith('../')&&t!==self);
    if(!list.length){out.push({spec,target:null});continue;}
    // A quoted include names a project header (internal even before that file is seen); an angle include may not.
    out.push(m[1]==='"'?{spec,target:list[0],...(list.length>1?{alt:list.slice(1)}:{}),ext:['']}:{spec,target:null,candidate:list,ext:['']});
  }
  return out;
}
function routes(src){
  const {code,match}=src,re=/\bCROW_ROUTE\s*\(/g;let m;
  while((m=re.exec(code))){const open=m.index+m[0].length-1,a=src.args(open);if(a.length<2)continue;const p=src.literalIn(a[1][0],a[1][1]);
    if(typeof p==='string'&&p.startsWith('/'))src.add('api.route',scan.routeName('ROUTE',p),src.ownerAt(m.index),{at:m.index,start:m.index,end:match[open]+1});}
}
const C_FILE=/\.(?:c|h|cc|cpp|cxx|c\+\+|hh|hpp|hxx|h\+\+|ipp|inl)$/i;
module.exports={id:'cfamily',test:file=>C_FILE.test(file),analyze};

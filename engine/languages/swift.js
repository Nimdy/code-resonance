'use strict';
// Swift adapter: a dependency-free scanner over the shared lexer (engine/languages/scan.js; "\(interpolation)" with
// nested strings, """multi-line""" and #"raw"# strings, nested comments, `backticked` names; only the first branch of
// an #if survives). Statements end at a newline, as in Swift.
//
// Recognised: classes, structs, enums and actors (class), protocols (interface) with their requirements, extensions
// (their members are owned by the extended type; the extension itself is not a new type), functions, methods,
// initializers (method `init`), stored and computed properties (property; top-level ones are variables), typealiases
// (type), and Vapor routes with literal path components (`app.get("users", ":id") { req in ... }`, `use: handler`).
// Imports: `import Module` (also @testable, `import struct Module.Type`) resolves, when the project has a Swift
// package layout, to a file of Sources/Module.
// Not recognised: enum cases, subscripts, local declarations, result-builder content, and macro expansions.
const path=require('node:path').posix;
const scan=require('./scan');
const DIALECT={swift:true,triple:true,interp:'swift',nest:true,tick:'ident',newlines:true,pre:'swift'};
const MODIFIERS=/^(?:(?:public|private|fileprivate|internal|open|package|final|static|class(?=\s+(?:func|var|let|subscript|override|final)\b)|override|mutating|nonmutating|lazy|weak|unowned(?:\([^)]*\))?|dynamic|optional|required|convenience|indirect|nonisolated|isolated|distributed|prefix|postfix|infix|consuming|borrowing)\s+)*(?:(?:private|fileprivate|internal|public|open|package)\s*\(\s*set\s*\)\s+)?/;
const NAME='(?:[A-Za-z_]\\w*|`[^`]+`)';
function analyze(file,source){
  if(scan.tooLarge(source))return scan.EMPTY();
  const src=scan.prepare(source,DIALECT),{code,text}=src,imports=[];let pending=null;
  const first=(a,b)=>{while(a<b&&scan.space(code[a]))a++;return a;};
  const realName=(at,n)=>text.slice(at,at+n.length).replace(/^`|`$/g,'');
  function decl(s,e){
    const h=scan.annotations(src,s,e,'at');const r=first(h.at,e),k=r+MODIFIERS.exec(code.slice(r,e))[0].length;
    let start=first(s,e);if(pending&&!code.slice(pending.end,s).trim())start=pending.start;
    pending=null;return {start,k,text:code.slice(k,e)};
  }
  function named(d,re){const m=re.exec(d.text);if(!m)return null;const at=d.k+m.index+m[0].length-m[m.length-1].length;return {m,at,name:realName(at,m[m.length-1])};}
  function member(d,end,ctx){
    let x;
    if((x=named(d,new RegExp(`^func\\s+(${NAME}|[^\\s(<]+)`)))){src.add(ctx.owner?'method':'function',x.name,ctx.owner,{at:x.at,start:d.start,end,span:true});return true;}
    if(/^init\b\s*[?!]?\s*(?:<[^>]*>\s*)?\(/.test(d.text)&&ctx.owner){src.add('method','init',ctx.owner,{at:d.k,start:d.start,end,span:true});return true;}
    if((x=named(d,new RegExp(`^(?:var|let)\\s+(${NAME})`)))){src.add(ctx.owner?'property':'variable',x.name,ctx.owner,{at:x.at,start:d.start,end});return true;}
    if((x=named(d,new RegExp(`^typealias\\s+(${NAME})`)))){src.add('type',x.name,ctx.owner,{at:x.at,start:d.start,end});return true;}
    return false;
  }
  function body(from,to,ctx){
    scan.walk(src,from,to,{
      brace:(s,o,c)=>{
        const d=decl(s,o);let x;
        if((x=named(d,new RegExp(`^(class|struct|enum|actor|protocol)\\s+(${NAME})`)))){
          src.add(x.m[1]==='protocol'?'interface':'class',x.name,ctx.owner,{at:x.at,start:d.start,end:c+1});body(o+1,c,{owner:x.name});return true;}
        if((x=named(d,/^extension\s+([\w.]+)/))){body(o+1,c,{owner:x.name.split('.').pop()});return true;}
        member(d,c+1,ctx);return true;
      },
      end:(s,e)=>{
        if(!code.slice(s,e).trim())return;
        const h=scan.annotations(src,s,e,'at');
        if(h.list.length&&!code.slice(h.at,e).trim()){pending=pending&&!code.slice(pending.end,s).trim()?{start:pending.start,end:e}:{start:first(s,e),end:e};return;}
        const d=decl(s,e);let x;
        if((x=/^import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([\w]+)/.exec(d.text))){imports.push(importOf(file,d.text.trim().replace(/\s+/g,' '),x[1]));return;}
        if((x=named(d,new RegExp(`^(class|struct|enum|actor|protocol)\\s+(${NAME})`)))){src.add(x.m[1]==='protocol'?'interface':'class',x.name,ctx.owner,{at:x.at,start:d.start,end:e});return;}
        member(d,e,ctx);
      }});
  }
  body(0,code.length,{owner:''});
  routes(src);
  return src.result(imports);
}
function importOf(file,spec,module){
  // A Swift package's modules are folders of Sources/ (the package root is the folder above Sources, if this file is
  // in one).
  const k=file.split('/').lastIndexOf('Sources'),root=k>=0?file.split('/').slice(0,k).join('/'):'';
  return {spec:spec.slice(0,180),target:null,dir:path.join(root,'Sources',module),ext:['.swift']};
}
// Vapor: app.get("users", ":id") { req in ... } or routes.post("x", use: handler); path components are literals.
function routes(src){
  const {code,match}=src,re=/\.(get|post|put|patch|delete)\s*\(/g;let m;
  while((m=re.exec(code))){
    const open=m.index+m[0].length-1,close=match[open];if(close<open)continue;
    const a=src.args(open),parts=[];let use=false,ok=a.length>0;
    for(const [x,y] of a){const v=src.literalIn(x,y);if(typeof v==='string'){parts.push(v.replace(/^\/+|\/+$/g,''));continue;}
      if(/^\s*use\s*:/.test(code.slice(x,y))){use=true;continue;}ok=false;break;}
    if(!ok||!parts.length)continue;
    let k=close+1;while(scan.space(code[k]))k++;if(!use&&code[k]!=='{')continue;
    const end=code[k]==='{'&&match[k]>k?match[k]+1:close+1;
    src.add('api.route',scan.routeName(m[1].toUpperCase(),'/'+parts.filter(Boolean).join('/')),src.ownerAt(m.index),{at:m.index,start:m.index,end});
  }
}
module.exports={id:'swift',test:file=>/\.swift$/i.test(file),analyze};

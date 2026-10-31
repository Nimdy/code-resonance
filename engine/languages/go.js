'use strict';
// Go adapter: a dependency-free scanner over the shared lexer (engine/languages/scan.js).
//
// Recognised: structs (class) and their fields (property, embedded fields by their type name), interfaces and their
// methods, other named types and aliases (type), functions, methods owned by their receiver type (pointer or value,
// generic receivers too), package-level var/const including grouped `var (...)`/`const (...)`/`type (...)`, and HTTP
// handlers registered with a literal path: net/http `Handle`/`HandleFunc` (Go 1.22 "GET /x" patterns, gorilla's
// `.Methods("GET")`) and gin/echo/chi/fiber style `r.GET("/x", h)` / `r.Get("/x", h)`.
// Imports: Go imports a package, which is a directory. An import path under a module declared by a go.mod in the
// project (engine/languages/manifest.js) resolves to that directory, and the reducer stands it for one file of it (the
// file named after the directory, else the first in path order, never a _test.go file). Other paths stay external.
// Not recognised: declarations inside function bodies (closures, local types), methods promoted through embedding,
// cgo, and routes whose path is not a literal.
const path=require('node:path').posix;
const scan=require('./scan');
const DIALECT={chars:'c',tick:'raw',newlines:true};
const IDS=/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)/;
const HTTP=/^(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|CONNECT|TRACE)$/;
function analyze(file,source){
  if(scan.tooLarge(source))return scan.EMPTY();
  const src=scan.prepare(source,DIALECT),{code,match}=src,imports=[];
  const first=(a,b)=>{while(a<b&&scan.space(code[a]))a++;return a;};
  const at=(a,b,re)=>{const s=first(a,b),m=re.exec(code.slice(s,b));return m?{s,m}:null;};
  function names(a,b,owner,kind,range){
    const h=at(a,b,IDS);if(!h)return;
    let off=h.s;for(const part of h.m[1].split(',')){const k=code.indexOf(part.trim(),off);off=k+part.trim().length;const name=part.trim();
      if(name!=='_')src.add(kind,name,owner,{at:k,start:range?range[0]:h.s,end:range?range[1]:b});}
  }
  // A struct body: one field per line (`A, B int`, `Name string \`json:"name"\``, embedded `*pkg.Type`).
  function struct(open,close,owner){
    scan.walk(src,open+1,close,{
      brace:(s,o,c)=>{const h=at(s,o,/^([A-Za-z_]\w*)\s+(?:\*|\[\])*(?:struct|interface)\s*$/);if(h)src.add('property',h.m[1],owner,{at:h.s,start:h.s,end:c+1});return true;},
      end:(s,e)=>{
        const h=at(s,e,/^\*?\s*(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(?:`[^`]*`|"[^"]*")?\s*$/);
        if(h){src.add('property',h.m[1],owner,{at:h.s,start:h.s,end:e});return;}
        const f=at(s,e,/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+\S/);if(f)names(s,e,owner,'property');
      }});
  }
  function iface(open,close,owner){
    scan.walk(src,open+1,close,{brace:()=>true,end:(s,e)=>{const h=at(s,e,/^([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?\(/);if(h)src.add('method',h.m[1],owner,{at:h.s,start:h.s,end:e});}});
  }
  // `Name[T any] struct {...}` and friends, after `type` or inside `type (...)`.
  function typeSpec(s,o,c){
    const h=at(s,o,/^(?:type\s+)?([A-Za-z_]\w*)\s*(?:\[[^]*\])?\s*(struct|interface)\s*$/);
    if(!h)return false;
    if(h.m[2]==='struct'){src.add('class',h.m[1],'',{at:h.s,start:h.s,end:c+1});struct(o,c,h.m[1]);}
    else{src.add('interface',h.m[1],'',{at:h.s,start:h.s,end:c+1});iface(o,c,h.m[1]);}
    return true;
  }
  function func(s,o,end){
    const h=at(s,o,/^func\b\s*/);if(!h)return false;
    let k=h.s+h.m[0].length,owner='';
    if(code[k]==='('&&match[k]>k){const r=/^\s*(?:[A-Za-z_]\w*\s+)?\*?\s*([A-Za-z_]\w*)/.exec(code.slice(k+1,match[k]));owner=r?r[1]:'';k=first(match[k]+1,o);}
    const n=/^([A-Za-z_]\w*)/.exec(code.slice(k,o));if(!n)return false;
    src.add(owner?'method':'function',n[1],owner,{at:k,start:h.s,end,span:true});return true;
  }
  function group(s,e,keyword,on){
    const h=at(s,e,new RegExp(`^${keyword}\\s*\\(`));if(!h)return false;
    const p=h.s+h.m[0].length-1;if(match[p]>p)scan.walk(src,p+1,match[p],on);return true;
  }
  const valueSpec=(s,e)=>names(s,e,'','variable',[first(s,e),e]);
  const typeLine=(s,e)=>{const h=at(s,e,/^(?:type\s+)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(?:=\s*)?\S/);if(h)src.add('type',h.m[1],'',{at:h.s,start:h.s,end:e});};
  scan.walk(src,0,code.length,{
    brace:(s,o,c)=>typeSpec(s,o,c)||func(s,o,c+1),
    end:(s,e)=>{
      const t=at(s,e,/^(package|import|type|var|const|func)\b/);if(!t)return;
      switch(t.m[1]){
        case 'import':for(const [,v] of src.stringsIn(s,e))if(v)imports.push(importOf(file,v));break;
        case 'type':if(!group(s,e,'type',{brace:(a,o,c)=>typeSpec(a,o,c),end:typeLine}))typeLine(s,e);break;
        case 'var':case 'const':if(!group(s,e,t.m[1],{brace:()=>false,end:valueSpec}))names(t.s+t.m[1].length,e,'','variable',[t.s,e]);break;
        case 'func':func(s,e,e);break;
      }
    }});
  routes(src);
  return src.result(imports);
}
function importOf(file,spec){
  const imp={spec:spec.slice(0,180),target:null};
  // GOPATH-era relative imports name a directory next to the file; module paths resolve through go.mod.
  if(spec.startsWith('./')||spec.startsWith('../')){const d=path.normalize(path.join(path.dirname(file),spec));if(!d.startsWith('../'))return {...imp,dir:d==='.'?'':d,ext:['.go']};return imp;}
  return {...imp,manifest:'go'};
}
const CALL=/\.(HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any|Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(/g;
function routes(src){
  const {code,match}=src;let m;CALL.lastIndex=0;
  while((m=CALL.exec(code))){
    const open=m.index+m[0].length-1,close=match[open];if(close<open)continue;
    // A handler argument must follow the path: `client.Get("/x")` or `q.Get("id")` are not routes.
    const a=src.args(open);if(a.length<2)continue;
    const v=a.map(x=>src.literalIn(x[0],x[1]));let method,route;
    if(m[1]==='Handle'||m[1]==='HandleFunc'){
      if(v[0]===null)continue;
      if(HTTP.test(v[0])&&v[1]!==null&&a.length>2){method=v[0];route=v[1];}
      else{const g=/^(?:([A-Z]+)\s+)?(\S*)$/.exec(v[0].trim());if(!g)continue;method=g[1]&&HTTP.test(g[1])?g[1]:'';route=g[2];}
      if(!method){const tail=/^\s*\.\s*Methods\s*\(/.exec(code.slice(close+1,close+40));const t=tail&&src.args(close+tail[0].length);
        const mv=t&&t.length===1?src.literalIn(t[0][0],t[0][1]):null;method=mv&&HTTP.test(mv)?mv:'ROUTE';}
    }else{route=v[0];method=/^(?:Any|All)$/.test(m[1])?'ROUTE':m[1].toUpperCase();}
    if(typeof route!=='string'||!route.startsWith('/'))continue;
    let s=m.index;while(s>0&&/[\w.)\]]/.test(code[s-1]))s--;
    src.add('api.route',scan.routeName(method,route),src.ownerAt(m.index),{at:m.index,start:s,end:close+1});
  }
}
module.exports={id:'go',test:file=>/\.go$/i.test(file),analyze};

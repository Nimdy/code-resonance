'use strict';
// Kotlin adapter: a dependency-free scanner over the shared lexer (engine/languages/scan.js; string templates with
// nested strings, raw strings, nested comments, `backticked names`). Statements end at a newline, as in Kotlin.
//
// Recognised: classes, data/enum/sealed/value classes and objects (class), interfaces, `fun interface` and annotation
// classes (interface), primary-constructor `val`/`var` parameters and body properties (property; top-level ones are
// variables), functions, methods (a companion object's members belong to its class), extension functions (method
// owned by the receiver type, like Go and Swift), secondary constructors, `typealias` (type), and HTTP handlers with a
// literal path: Spring annotations (as in Java) and Ktor's `get("/x") { ... }` routing DSL.
// Imports: as in Java, by package folder, except that the common root package may be omitted from the folders (the
// Kotlin convention), and a top-level function import falls back to a file of its package's folder.
// Not recognised: enum entries, local declarations, delegated members, and declarations produced by compiler plugins.
const scan=require('./scan');
const java=require('./java');
const DIALECT={chars:'c',triple:true,interp:'kotlin',nest:true,tick:'ident',newlines:true};
const MODIFIERS=/^(?:(?:public|private|protected|internal|open|final|abstract|sealed|override|lateinit|const|data|enum|inline|value|annotation|inner|suspend|tailrec|operator|infix|external|expect|actual|noinline|crossinline|vararg|fun(?=\s+interface\b))\s+)*/;
const NAME='(?:[A-Za-z_]\\w*|`[^`]+`)';
const unquote=n=>n.replace(/^`|`$/g,'');
function analyze(file,source){
  if(scan.tooLarge(source))return scan.EMPTY();
  const src=scan.prepare(source,DIALECT),{code,text}=src,imports=[];
  let pkg='',base,pending=null;const root=()=>base===undefined?(base=scan.packageRoot(file,pkg,false)):base;
  const first=(a,b)=>{while(a<b&&scan.space(code[a]))a++;return a;};
  // Annotations on lines of their own (`@GetMapping("/x")` then `fun x()`) belong to the next declaration.
  function decl(s,e){
    const h=scan.annotations(src,s,e,'at');const r=first(h.at,e),mods=MODIFIERS.exec(code.slice(r,e))[0];
    let list=h.list,start=first(s,e);if(pending&&!code.slice(pending.end,s).trim()){list=[...pending.list,...list];start=pending.start;}
    pending=null;return {start,k:r+mods.length,mods,list,text:code.slice(r+mods.length,e)};
  }
  const realName=(at,n)=>unquote(text.slice(at,at+n.length));
  function params(open,owner){
    if(code[open]!=='('||src.match[open]<open)return;
    for(const p of scan.splitTop(code.slice(open+1,src.match[open]))){
      const m=new RegExp(`^\\s*(?:@[\\w.:]+(?:\\([^)]*\\))?\\s+)*(?:(?:private|protected|internal|public|override|open|final)\\s+)*(?:val|var)\\s+(${NAME})`).exec(p.text);
      if(m){const at=open+1+p.at+m[0].length-m[1].length;src.add('property',realName(at,m[1]),owner,{at,start:open+1+p.at,end:open+1+p.at+p.text.length});}
    }
  }
  function type(d,o,c,ctx){
    const m=new RegExp(`^(class|interface|object)\\s+(${NAME})`).exec(d.text);if(!m)return null;
    const at=d.k+m[0].length-m[2].length,name=realName(at,m[2]);
    const kind=m[1]==='interface'||/\bannotation\b/.test(d.mods)?'interface':'class';
    src.add(kind,name,ctx.owner,{at,start:d.start,end:c});
    // The primary constructor: `(...)` after the name, before any `: Supertype(...)`.
    const head=scan.blankAngles(code.slice(at+m[2].length,o)),p=head.indexOf('(');
    if(p>=0&&!head.slice(0,p).includes(':'))params(at+m[2].length+p,name);
    return {name,kind,enum:/\benum\b/.test(d.mods)};
  }
  function fun(d,end,ctx){
    const t=scan.blankAngles(d.text),m=new RegExp(`^fun\\s+(?:([\\w.]+)\\s*\\??\\s*\\.\\s*)?(${NAME})\\s*\\(`).exec(t);if(!m)return false;
    const at=d.k+m.index+m[0].lastIndexOf(m[2]),name=realName(at,m[2]),receiver=m[1]?m[1].split('.').pop():'';
    const owner=receiver||ctx.owner,r=ctx.owner?java.routeOf(src,d.list,ctx.prefix||''):null;
    src.add(r?'api.route':owner?'method':'function',r||name,owner,{at,start:d.start,end,span:true});return true;
  }
  function property(d,end,ctx){
    const m=new RegExp(`^(?:val|var)\\s+(?:<[^>]*>\\s*)?(?:[\\w.]+\\s*\\??\\s*\\.\\s*)?(${NAME})`).exec(scan.blankAngles(d.text));if(!m)return false;
    const at=d.k+m[0].length-m[1].length;src.add(ctx.owner?'property':'variable',realName(at,m[1]),ctx.owner,{at,start:d.start,end});return true;
  }
  function body(from,to,ctx){
    let constants=!!ctx.enum;
    scan.walk(src,from,to,{
      brace:(s,o,c)=>{
        if(constants)return true;
        const d=decl(s,o);let t;
        if(/^companion\s+object\b/.test(d.text)){body(o+1,c,{owner:ctx.owner,prefix:ctx.prefix});return true;}
        if((t=type(d,o,c+1,ctx))){body(o+1,c,{owner:t.name,enum:t.enum,prefix:java.routePrefix(src,d.list)});return true;}
        if(fun(d,c+1,ctx))return true;
        if(/^constructor\s*\(/.test(d.text)&&ctx.owner){src.add('method','constructor',ctx.owner,{at:d.k,start:d.start,end:c+1,span:true});return true;}
        if(/^(?:val|var)\b/.test(d.text)){property(d,c+1,ctx);return true;}
        return true;
      },
      end:(s,e)=>{
        const raw=code.slice(s,e);if(!raw.trim())return;
        const h=scan.annotations(src,s,e,'at');
        if(h.list.length&&!code.slice(h.at,e).trim()){pending={start:first(s,e),end:e,list:pending&&!code.slice(pending.end,s).trim()?[...pending.list,...h.list]:h.list};return;}
        if(constants){constants=false;pending=null;return;}
        const d=decl(s,e);let m;const tx=d.text.trim();
        if((m=/^package\s+([\w.]+)/.exec(tx))){pkg=m[1];return;}
        if((m=/^import\s+([\w.]+?)(\s*\.\s*\*)?(?:\s+as\s+\w+)?$/.exec(tx))){imports.push(java.jvmImport(tx.replace(/^import\s+/,'').replace(/\s+/g,' '),m[1],{wildcard:!!m[2],member:false,base:root(),kotlin:true}));return;}
        if((m=new RegExp(`^typealias\\s+(${NAME})`).exec(tx))){const at=d.k+m[0].length-m[1].length;src.add('type',realName(at,m[1]),ctx.owner,{at,start:d.start,end:e});return;}
        if(type(d,e,e,ctx))return;
        if(fun(d,e,ctx))return;
        if(/^constructor\s*\(/.test(tx)&&ctx.owner){src.add('method','constructor',ctx.owner,{at:d.k,start:d.start,end:e});return;}
        if(/^(?:val|var)\b/.test(tx))property(d,e,ctx);
      }});
  }
  body(0,code.length,{owner:'',prefix:''});
  routes(src);
  return src.result(imports);
}
// Ktor: get("/x") { ... } (a single literal path, then the handler lambda).
function routes(src){
  const {code,match}=src,re=/(?<![\w.])(get|post|put|patch|delete|head|options)\s*\(/g;let m;
  while((m=re.exec(code))){
    const open=m.index+m[0].length-1,close=match[open];if(close<open)continue;
    const a=src.args(open);if(a.length!==1)continue;const p=src.literalIn(a[0][0],a[0][1]);
    if(typeof p!=='string'||!p.startsWith('/'))continue;
    let k=close+1;while(scan.space(code[k]))k++;if(code[k]!=='{')continue;
    src.add('api.route',scan.routeName(m[1].toUpperCase(),p),src.ownerAt(m.index),{at:m.index,start:m.index,end:(match[k]>k?match[k]:close)+1});
  }
}
module.exports={id:'kotlin',test:file=>/\.kts?$/i.test(file),analyze};

'use strict';
// PHP adapter: a dependency-free scanner over the shared lexer (engine/languages/scan.js; HTML outside <?php ... ?> is
// not code, heredoc/nowdoc and "{$interpolated}" strings, # and // comments but #[attributes]).
//
// Recognised: classes, enums and traits (class: a trait is reused implementation), interfaces, functions, methods,
// properties and promoted constructor properties (property), class constants (property), top-level constants
// (variable), and HTTP routes with a literal path: Laravel `Route::get('/x', ...)` (also match/any), Slim/Lumen
// `$app->get('/x', ...)`, and Symfony `#[Route('/x', methods: ['GET'])]` attributes (a class-level #[Route] is the
// prefix).
// Imports: `use App\Models\User;` (also grouped `use App\{A, B}`) resolves through composer.json's PSR-4 autoload
// prefixes (App\ => app/ gives app/Models/User.php); require/include of a literal path (also `__DIR__ . '/x.php'`)
// resolves beside the file. A trait `use` inside a class is not an import.
// Not recognised: dynamic definitions (closures bound at run time, magic methods' virtual members), routes built from
// variables, and annotations in docblocks (older Symfony `@Route`).
const path=require('node:path').posix;
const scan=require('./scan');
const DIALECT={php:true,hash:true,sq:true,multiline:true,interp:'php',tick:'shell'};
const MODIFIERS=/^(?:(?:public|protected|private|static|final|abstract|readonly|var)\s+)*/;
const LARAVEL=/\bRoute\s*::\s*(get|post|put|patch|delete|options|any|match)\s*\(/g,SLIM=/->\s*(get|post|put|patch|delete|options|any|map)\s*\(/g;
const slash=p=>'/'+String(p).replace(/^\/+/,'');
function analyze(file,source){
  if(scan.tooLarge(source))return scan.EMPTY();
  const src=scan.prepare(source,DIALECT),{code,match}=src,imports=[];
  const first=(a,b)=>{while(a<b&&scan.space(code[a]))a++;return a;};
  function decl(s,e){const h=scan.annotations(src,s,e,'hash');const r=first(h.at,e),mods=MODIFIERS.exec(code.slice(r,e))[0];return {start:first(s,e),k:r+mods.length,mods,list:h.list,text:code.slice(r+mods.length,e)};}
  function attrRoute(list,prefix){
    for(const a of list){if(a.name.split('\\').pop()!=='Route')continue;const p=code.indexOf('(',a.start);if(p<0||p>a.end)continue;
      const v=scan.pathArg(src,p,match[p],['path']);if(v===null)continue;
      const ms=/\bmethods\s*:\s*\[([^\]]*)\]/.exec(code.slice(p,match[p]));const list=ms?src.stringsIn(p+ms.index,p+ms.index+ms[0].length).map(x=>x[1]).filter(Boolean):[];
      return {method:list.length===1?list[0].toUpperCase():'ROUTE',path:scan.joinRoute(prefix,v)};}
    return null;
  }
  function uses(t,at){
    // use A\B\C [as D]; use A\{B, C\D}; use function A\f; use const A\X;
    const body=t.replace(/^use\s+(?:function\s+|const\s+)?/,'');const g=/^([\w\\]*)\{([^}]*)\}/.exec(body);
    const names=g?g[2].split(',').map(x=>g[1]+x.trim()):body.split(',').map(x=>x.trim());
    for(const n of names){const name=n.split(/\s+as\s+/i)[0].trim().replace(/^\\/,'');if(!/^[A-Za-z_][\w\\]*$/.test(name))continue;
      imports.push({spec:name.slice(0,180),target:null,manifest:'php',pkg:name.split('\\').join('/'),ext:['.php']});}
  }
  function requires(s,e){
    const m=/^(?:require|require_once|include|include_once)\b\s*\(?\s*(__DIR__\s*\.\s*)?(["'])/.exec(code.slice(first(s,e),e));if(!m)return false;
    const v=src.stringAt(first(s,e)+m[0].length-1);if(typeof v!=='string'||!v)return true;
    // __DIR__ . '/x.php' is beside this file; a bare relative path is searched from the include path, so the project
    // root is tried after this file's folder.
    const t=path.normalize(path.join(path.dirname(file),m[1]?v.replace(/^\/+/,''):v)),r=m[1]?null:path.normalize(v);
    const ok=x=>x&&!x.startsWith('../')&&!x.startsWith('/');
    imports.push({spec:(m[1]?'__DIR__ . ':'')+v.slice(0,160),...(ok(t)?{target:t,...(ok(r)&&r!==t?{alt:r}:{}),ext:['']}:{target:null})});return true;
  }
  function promoted(open,owner){
    if(match[open]<open)return;
    for(const p of scan.splitTop(code.slice(open+1,match[open]))){const m=/^\s*(?:#\[[^\]]*\]\s*)*(?:public|protected|private|readonly)\b[^$]*\$([A-Za-z_]\w*)/.exec(p.text);
      if(m){const at=open+1+p.at+m[0].length-m[1].length;src.add('property',m[1],owner,{at,start:open+1+p.at,end:open+1+p.at+p.text.length});}}
  }
  function body(from,to,ctx){
    scan.walk(src,from,to,{
      brace:(s,o,c)=>{
        const d=decl(s,o);let m;
        if(/^use\s/.test(d.text))return false;
        if((m=/^namespace\b/.exec(d.text))){body(o+1,c,ctx);return true;}
        if((m=/^(class|interface|trait|enum)\s+([A-Za-z_]\w*)/.exec(d.text))){
          const at=d.k+m[0].length-m[2].length;src.add(m[1]==='interface'?'interface':'class',m[2],ctx.owner,{at,start:d.start,end:c+1});
          const r=attrRoute(d.list,'');body(o+1,c,{owner:m[2],prefix:r?r.path:''});return true;}
        if((m=/^function\s+&?\s*([A-Za-z_]\w*)\s*\(/.exec(d.text))){
          const at=d.k+m[0].indexOf(m[1]),r=ctx.owner?attrRoute(d.list,ctx.prefix):null;
          src.add(r?'api.route':ctx.owner?'method':'function',r?scan.routeName(r.method,r.path):m[1],ctx.owner,{at,start:d.start,end:c+1,span:true});
          if(m[1]==='__construct'&&ctx.owner)promoted(d.k+m[0].length-1,ctx.owner);return true;}
        // An initializer (`= [ ... ]`, a closure) continues the statement; any other block ends it.
        return !/=/.test(src.flat(d.k,o).replace(/=>/g,''));
      },
      end:(s,e)=>{
        const d=decl(s,e),t=d.text.trim();let m;if(!t)return;
        if(/^namespace\b/.test(t))return;
        if(/^use\s/.test(t)){if(!ctx.owner)uses(t,d.k);return;}
        if(requires(s,e))return;
        if((m=/^function\s+&?\s*([A-Za-z_]\w*)\s*\(/.exec(t))){if(ctx.owner)src.add('method',m[1],ctx.owner,{at:d.k+t.indexOf(m[1]),start:d.start,end:e});return;}
        if((m=/^const\s+/.exec(t))){for(const p of scan.splitTop(t.slice(m[0].length))){const n=/^\s*(?:[\w\\?|]+\s+)?([A-Za-z_]\w*)\s*=/.exec(p.text);if(n)src.add(ctx.owner?'property':'variable',n[1],ctx.owner,{at:d.k+m[0].length+p.at+n[0].lastIndexOf(n[1]),start:d.start,end:e});}return;}
        if(ctx.owner&&d.mods){for(const p of scan.splitTop(t)){const n=/\$([A-Za-z_]\w*)/.exec(p.text);if(n)src.add('property',n[1],ctx.owner,{at:d.k+p.at+n.index+1,start:d.start,end:e});}}
      }});
  }
  body(0,code.length,{owner:'',prefix:''});
  routes(src);
  return src.result(imports);
}
function routes(src){
  const {code,match}=src;
  for(const re of [LARAVEL,SLIM]){
    re.lastIndex=0;let m;
    while((m=re.exec(code))){
      const open=m.index+m[0].length-1,a=src.args(open);const k=m[1]==='match'||m[1]==='map'?1:0;if(a.length<k+2)continue;
      const p=src.literalIn(a[k][0],a[k][1]);if(typeof p!=='string'||re===SLIM&&!p.startsWith('/'))continue;
      const method=k||m[1]==='any'?'ROUTE':m[1].toUpperCase();
      let s=m.index;while(s>0&&/[\w$>\-:]/.test(code[s-1]))s--;
      src.add('api.route',scan.routeName(method,slash(p)),src.ownerAt(m.index),{at:m.index,start:s,end:match[open]+1});
    }
  }
}
module.exports={id:'php',test:file=>/\.php$/i.test(file),analyze};

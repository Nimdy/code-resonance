'use strict';
// C# adapter: a dependency-free scanner over the shared lexer (engine/languages/scan.js; verbatim @"", interpolated
// $"" with holes, raw """ strings, char literals; only the first branch of an #if survives, #region lines vanish).
//
// Recognised: classes, structs and records (class; positional record parameters are properties), interfaces,
// enums (class), delegates (type), methods, constructors, operators, expression-bodied members, properties (with
// accessors or `=>`), fields and events (property), inside block or file-scoped namespaces, and HTTP handlers with a
// literal template: ASP.NET Core attributes ([HttpGet("x")], [Route("api/[controller]")] on the controller as the
// prefix, [controller]/[action] filled in) and minimal APIs (app.MapGet("/x", ...)).
// Imports: namespaces are not files. A `using` is offered as candidate folders only, by the convention that folders
// follow namespaces below the project's root namespace (inferred from this file's own namespace and folder); it
// resolves only when such a folder exists in the project.
// Not recognised: top-level statements (other than minimal-API routes), local functions, partial-class merging,
// conventional (non-attribute) MVC routes, and source-generated members.
const scan=require('./scan');
const DIALECT={chars:'c',cs:true,triple:true,pre:'c'};
const MODIFIERS=/^(?:(?:public|private|protected|internal|static|readonly|sealed|abstract|virtual|override|async|extern|unsafe|new|partial|volatile|const|required|file|ref|scoped|fixed|implicit|explicit)\s+)*/;
const KEYWORDS=new Set(['if','for','foreach','while','switch','catch','using','lock','return','new','throw','else','do','try','fixed','checked','unchecked','nameof','typeof','sizeof','default','base','this','when','where']);
const HTTP=/^Http(Get|Post|Put|Delete|Patch|Head|Options)$/;
const attr=n=>n.split('.').pop().replace(/Attribute$/,'');
function analyze(file,source){
  if(scan.tooLarge(source))return scan.EMPTY();
  const src=scan.prepare(source,DIALECT),{code,match}=src,imports=[];let namespace=null;
  const first=(a,b)=>{while(a<b&&scan.space(code[a]))a++;return a;};
  function decl(s,e){const h=scan.annotations(src,s,e,'bracket');const r=first(h.at,e),k=r+MODIFIERS.exec(code.slice(r,e))[0].length;return {start:first(s,e),k,list:h.list,text:code.slice(k,e),mods:code.slice(r,k)};}
  const template=(a)=>{const p=code.indexOf('(',a.start);return p>=0&&p<a.end?scan.pathArg(src,p,match[p],['template']):null;};
  function prefixOf(list,cls){const r=list.find(a=>attr(a.name)==='Route');const v=r?template(r):null;return v===null?'':fill(v,cls,null);}
  function fill(t,cls,action){return t.replace(/\[controller\]/gi,cls.replace(/Controller$/,'')).replace(/\[action\]/gi,action||'[action]');}
  function routeOf(list,ctx,name){
    const verb=list.find(a=>HTTP.test(attr(a.name)));if(!verb)return null;
    const own=template(verb)??(()=>{const r=list.find(a=>attr(a.name)==='Route');return r?template(r):null;})()??'';
    const p=fill(own,ctx.owner,name),full=/^~?\//.test(p)?p.replace(/^~/,''):scan.joinRoute(ctx.prefix,p);
    return scan.routeName(HTTP.exec(attr(verb.name))[1].toUpperCase(),full||'/');
  }
  function components(open,owner){
    if(match[open]<open)return;
    for(const p of scan.splitTop(code.slice(open+1,match[open]))){const n=/([A-Za-z_]\w*)\s*(?:=[^]*)?$/.exec(p.text.replace(/^\s*\[[^\]]*\]\s*/,''));
      if(n&&/\S\s+[A-Za-z_]/.test(p.text.trim()))src.add('property',n[1],owner,{at:open+1+p.at+p.text.indexOf(n[1],p.text.length-n[0].length),start:open+1+p.at,end:open+1+p.at+p.text.length});}
  }
  function type(d,o,end,ctx){
    const m=/^(class|struct|interface|enum|record(?:\s+(?:class|struct))?|delegate)\s+/.exec(d.text);if(!m)return null;
    const rest=scan.blankAngles(d.text.slice(m[0].length));
    if(m[1]==='delegate'){const sig=scan.signature(src,d.k+m[0].length,o);if(sig&&ctx.owner!==undefined)src.add('type',sig.name,ctx.owner,{at:sig.at,start:d.start,end});return {name:null};}
    const n=/^([A-Za-z_]\w*)/.exec(rest);if(!n)return null;
    const at=d.k+m[0].length,name=n[1];
    src.add(m[1]==='interface'?'interface':'class',name,ctx.owner,{at,start:d.start,end});
    if(m[1].startsWith('record')){const p=rest.indexOf('(');if(p>=0&&!rest.slice(0,p).includes(':'))components(at+p,name);}
    return {name,kind:m[1]};
  }
  function member(d,o,end,ctx,body){
    // A method, constructor or operator: a parameter list, a return type unless it is the constructor.
    const sig=scan.signature(src,d.k,o);
    if(sig&&!KEYWORDS.has(sig.name)&&!/=/.test(sig.before)&&/^\s*(?::\s*(?:base|this)\s*\([^]*|where\b[^]*|=>[^]*)?$/.test(sig.after)){
      const typed=/[\w\]?>)]/.test(scan.blankAngles(sig.before)),name=/\boperator\b/.test(sig.before)?`operator ${sig.name}`:sig.name;
      if(typed||sig.name===ctx.owner||sig.name==='~'+ctx.owner){
        const r=routeOf(d.list,ctx,sig.name);
        src.add(r?'api.route':'method',r||name,ctx.owner,{at:sig.at,start:d.start,end,span:true});return true;}
      return false;
    }
    // A property (`int X { get; set; }`, `int X => 1;`), a field or an event.
    const lhs=scan.blankAngles(d.text.split(/=>|=(?!=)/)[0]);
    if(/[()]/.test(lhs))return false;
    const parts=scan.splitTop(body?lhs:d.text.split(/=>/)[0]);
    let added=false;
    parts.forEach((p,i)=>{const t=scan.blankAngles(p.text.split(/=(?!=)/)[0]),m=/([A-Za-z_]\w*)\s*$/.exec(t);
      if(!m||m[1]==='this'||i===0&&!/[\w\]?>]\s+(?:event\s+)?$/.test(t.slice(0,m.index))&&!/^\s*event\b/.test(t))return;
      src.add('property',m[1],ctx.owner,{at:d.k+p.at+m.index,start:d.start,end});added=true;});
    return added;
  }
  function body(from,to,ctx){
    scan.walk(src,from,to,{
      brace:(s,o,c)=>{
        const d=decl(s,o);let m;
        if((m=/^namespace\s+([\w.]+)/.exec(d.text))){namespace=namespace??m[1];body(o+1,c,{...ctx});return true;}
        const t=type(d,o,c+1,ctx);
        if(t){if(t.name)body(o+1,c,{owner:t.name,prefix:prefixOf(d.list,t.name),kind:t.kind});return true;}
        // An initializer (`= new() { ... }`, a collection or a lambda) continues the statement; a body ends it.
        if(/=/.test(src.flat(d.k,o).replace(/=>/g,'')))return false;
        if(ctx.owner&&ctx.kind!=='enum')member(d,o,c+1,ctx,true);
        return true;
      },
      end:(s,e)=>{
        const d=decl(s,e),t=d.text.trim();let m;if(!t)return;
        if((m=/^namespace\s+([\w.]+)$/.exec(t))){namespace=namespace??m[1];return;}
        if((m=/^(global\s+)?using\s+(static\s+)?(?:([A-Za-z_]\w*)\s*=\s*)?([\w.]+)\s*$/.exec(t))){imports.push({spec:t.replace(/\s+/g,' ').slice(0,180),ns:m[4],stat:!!m[2]});return;}
        if(type(d,e,e,ctx))return;
        if(ctx.owner&&ctx.kind!=='enum')member(d,e,e,ctx,false);
      }});
  }
  body(0,code.length,{owner:'',prefix:''});
  minimal(src);
  // Namespaces become candidate folders once this file's own namespace and folder are known.
  const base=namespace?scan.packageRoot(file,namespace,false):null;
  return src.result(imports.map(({spec,ns,stat})=>{
    const segs=ns.split('.'),d=base?scan.packageDir(base,stat?segs.slice(0,-1):segs):null;
    return {spec,target:null,...(d!==null&&base?{dir:d,ext:['.cs']}:{})};
  }));
}
function minimal(src){
  const {code,match}=src,re=/\.Map(Get|Post|Put|Delete|Patch)\s*\(/g;let m;
  while((m=re.exec(code))){
    const open=m.index+m[0].length-1,a=src.args(open);if(a.length<2)continue;
    const p=src.literalIn(a[0][0],a[0][1]);if(typeof p!=='string')continue;
    let s=m.index;while(s>0&&/[\w.)\]]/.test(code[s-1]))s--;
    src.add('api.route',scan.routeName(m[1].toUpperCase(),p.startsWith('/')?p:'/'+p),src.ownerAt(m.index),{at:m.index,start:s,end:match[open]+1});
  }
}
module.exports={id:'csharp',test:file=>/\.cs$/i.test(file),analyze};

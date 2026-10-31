'use strict';
// Ruby adapter: a dependency-free scanner with its own lexer (Ruby's literals are not C's: heredocs, %w[]/%q()/%r{}
// with any delimiter, "#{interpolation}" holes with nested strings, regex literals told from division the way Ruby
// itself reads `split /,/`, =begin/=end blocks and __END__), feeding the shared symbol table (engine/languages/scan.js).
// Blocks are end-delimited: class/module/def/if/unless/while/until/case/begin/for/do open one (a modifier `x if y`
// does not, nor does an endless `def x = y`), `end` closes it.
//
// Recognised: classes (also `X = Struct.new(...)` / `Data.define(...)` / `Class.new(...)`), methods and singleton
// methods (`def self.x`, `class << self`) owned by their class or module, top-level functions, attr_accessor /
// attr_reader / attr_writer (property), constants (variable; property inside a class), and routes with a literal path:
// Rails config/routes.rb (`get "x", to: ...`, `post`, `match`, `root`; `namespace`/`scope` prefixes) and Sinatra
// (`get "/x" do ... end`). A module is a namespace or a mixin, not a type: it owns its methods but is not a symbol.
// Imports: require_relative resolves beside the file; require / load / autoload are candidates under lib/ and the
// project root (a gem stays external). Zeitwerk/Rails autoloading has no import statement, so it is not seen.
// Not recognised: define_method and other metaprogramming, methods added by `included` hooks, resources :x (they expand
// to several routes), and routes whose path is not a literal.
const path=require('node:path').posix;
const scan=require('./scan');
const KEYWORD_EXPECT=/^(?:if|unless|while|until|and|or|not|return|when|then|else|elsif|do|begin|case|in|yield|puts|print|p|raise|break|next|redo)$/;
function lex(source){
  const n=source.length,cuts=[],strings=[];let i=0,expect=true,lastId=false,lineStart=true;const heredocs=[];
  const cut=(a,b,t)=>{if(b>a)cuts.push(a,b,t);};
  const PAIR={'(':')','[':']','{':'}','<':'>'};
  function literal(q,open,close,holes){
    // From just after the opening delimiter to its close; bracket delimiters nest.
    const from=i,mark=cuts.length,smark=strings.length;let depth=1,plain=true;
    while(i<n){const c=source[i];
      if(c==='\\'){i+=2;continue;}
      if(holes&&c==='#'&&source[i+1]==='{'){i+=2;run('}');i++;plain=false;continue;}
      if(open!==close&&c===open){depth++;i++;continue;}
      if(c===close&&--depth===0)break;
      if(c==='\n')heredocBodies();else i++;
    }
    cuts.length=mark;strings.length=smark;const to=Math.min(i,n);cut(from,to,2);if(i<n)i++;strings.push([q,plain?source.slice(from,to):null,i]);
    expect=false;lastId=false;
  }
  function heredocBodies(){
    // At a newline: the bodies of heredocs started on this line follow, each up to its terminator line.
    i++;lineStart=true;
    while(heredocs.length){const h=heredocs.shift();const from=i;
      const re=new RegExp(`^${h.indent?'[ \\t]*':''}${h.id}[ \\t\\r]*$`,'m');re.lastIndex=0;
      const rest=source.slice(i),m=re.exec(rest);const to=m?i+m.index:n;cut(from,to,2);strings.push([h.q,null,to]);
      i=m?i+m.index+m[0].length:n;if(i<n&&source[i]==='\n')i++;}
  }
  const ambiguous=()=>lastId&&/[ \t]/.test(source[i-1]||'')&&!/[ \t=]/.test(source[i+1]||'');
  function run(stop){
    let depth=0;
    while(i<n){
      const c=source[i],start=lineStart;
      if(c==='\n'){if(heredocs.length)heredocBodies();else{i++;lineStart=true;}if(!stop&&depth===0){expect=true;lastId=false;}continue;}
      if(c===' '||c==='\t'||c==='\r'){i++;continue;}
      lineStart=false;
      if(start&&source.startsWith('=begin',i)&&/\s/.test(source[i+6]||'\n')){const e=source.indexOf('\n=end',i);const to=e<0?n:(source.indexOf('\n',e+1)<0?n:source.indexOf('\n',e+1));cut(i,to,1);i=to;continue;}
      if(start&&/^__END__\r?$/.test(source.slice(i,source.indexOf('\n',i)<0?n:source.indexOf('\n',i)))){cut(i,n,1);i=n;return;}
      if(stop){if(c==='{')depth++;else if(c==='}'){if(depth===0)return;depth--;}}
      if(c==='#'){const s=i;while(i<n&&source[i]!=='\n')i++;cut(s,i,1);continue;}
      if(c==='"'||c==='`'){const q=i;i++;literal(q,c,c,true);continue;}
      if(c==="'"){const q=i;i++;literal(q,"'","'",false);continue;}
      if(c==='$'&&/[^\w\s{]/.test(source[i+1]||'')){i+=2;expect=false;lastId=false;continue;}
      if(c===':'&&(source[i+1]==='"'||source[i+1]==="'")){i++;continue;}
      if(c==='%'&&(expect||ambiguous())){const m=/^%([qQwWiIrsx]?)([^\w\s])/.exec(source.slice(i,i+3));
        if(m){const q=i+m[0].length-1,o=m[2],cl=PAIR[o]||o;i+=m[0].length;literal(q,o,cl,!/[qwis]/.test(m[1]));continue;}}
      if(c==='/'&&(expect||ambiguous())){const q=i;i++;literal(q,'/','/',true);while(/[imxounse]/.test(source[i]||''))i++;continue;}
      if(c==='<'&&source[i+1]==='<'&&(expect||ambiguous())){const m=/^<<([~-]?)(["'`]?)([A-Za-z_]\w*)\2/.exec(source.slice(i,i+80));
        if(m&&(m[1]||m[2]||/^[A-Z_]/.test(m[3]))){heredocs.push({id:m[3],indent:!!m[1],q:i});i+=m[0].length;expect=false;lastId=false;continue;}}
      if(c==='?'&&expect){const m=/^\?(?:\\.|[^\s\\])(?!\w)/.exec(source.slice(i,i+4));if(m){cut(i+1,i+m[0].length,2);i+=m[0].length;expect=false;lastId=false;continue;}}
      if(/[A-Za-z_@]/.test(c)){const s=i;while(i<n&&/[\w@]/.test(source[i]))i++;if(/[?!]/.test(source[i]||'')&&source[i+1]!=='=')i++;
        const word=source.slice(s,i);expect=KEYWORD_EXPECT.test(word);lastId=!expect;continue;}
      if(/[0-9]/.test(c)){while(i<n&&/[\w.]/.test(source[i]))i++;expect=false;lastId=false;continue;}
      if(c===')'||c===']'||c==='}'){i++;expect=false;lastId=false;continue;}
      i++;expect=true;lastId=false;
    }
  }
  run(null);
  return {...scan.build(source,cuts),strings,directives:[]};
}
const DIALECT={lex};
const OPENER=/\b(class|module|def|if|unless|while|until|case|begin|for|do|end)\b(?![?!:])/g;
// Before these an `if`/`while`/... starts an expression or statement (`x = if y`); after a value it is a modifier.
const STARTS=/(?:^|[=(,\[{|&!?:;]|\b(?:return|then|else|do|and|or|not|in|when)|<<)\s*$/;
function analyze(file,source){
  if(scan.tooLarge(source))return scan.EMPTY();
  const src=scan.prepare(source,DIALECT),{code}=src,imports=[];
  const routesFile=/(?:^|\/)config\/routes(?:\.rb|\/.+\.rb)$/.test(file);
  // Statements: lines (and `;`), joined while brackets are open or a line ends with an operator, a comma or `\`.
  const stmts=[];{let s=0,depth=0;
    const more=k=>{const line=code.slice(code.lastIndexOf('\n',k-1)+1,k).replace(/\s+$/,'');
      if(/\|[^|]*\|$/.test(line)&&/\b(?:do|\{)\s*\|[^|]*\|$/.test(line))return false;
      if(/(?:[,\\+\-*&|^=<>.]|\band|\bor)$/.test(line))return true;
      const next=/^\s*(\S{1,2})/.exec(code.slice(k+1,k+200));return !!next&&/^(?:\.[^.]|&\.)/.test(next[1]);};
    for(let k=0;k<=code.length;k++){const c=code[k];
      if(c==='('||c==='['||c==='{')depth++;else if(c===')'||c===']'||c==='}')depth=Math.max(0,depth-1);
      else if(c===undefined||c===';'&&depth===0||c==='\n'&&depth===0&&!more(k)){if(code.slice(s,k).trim())stmts.push([s,k]);s=k+1;}}}
  const stack=[];
  const scope=()=>{for(let k=stack.length-1;k>=0;k--)if(stack[k].owner!==undefined)return stack[k];return null;};
  const inDef=()=>stack.some(x=>x.kind==='def');
  const prefix=()=>stack.filter(x=>x.prefix).map(x=>x.prefix).join('/');
  function close(at){const e=stack.pop();if(e&&e.symbol){const end=at+3,body=src.text.slice(e.start,end).replace(/\s+/g,' ').trim();e.symbol.fingerprint=require('../../receiver/protocol').sha(body).slice(0,16);e.symbol.size=Math.min(100000,body.length);}}
  for(const [s,e] of stmts){
    let a=s;while(a<e&&scan.space(code[a]))a++;
    // `private def x` / `private_class_method def self.x`: the visibility call takes the method's definition.
    const vis=/^(?:private|protected|public|private_class_method|module_function)\s+(?=def\b)/.exec(code.slice(a,e));if(vis)a+=vis[0].length;
    const t=code.slice(a,e);let m;const sc=scope(),owner=sc?sc.owner:'';
    if((m=/^class\s*<<\s*self\b/.exec(t))){stack.push({kind:'class',owner});keywords(a+m[0].length,e,false);continue;}
    if((m=/^class\s+(?:::)?((?:[A-Z]\w*::)*([A-Z]\w*))/.exec(t))){
      const sym=src.add('class',m[2],owner,{at:a+m[0].length-m[2].length,start:a,end:e});stack.push({kind:'class',owner:m[2],symbol:sym,start:a});keywords(a+m[0].length,e,false);continue;}
    if((m=/^module\s+(?:::)?(?:[A-Z]\w*::)*([A-Z]\w*)/.exec(t))){stack.push({kind:'module',owner:m[1]});keywords(a+m[0].length,e,false);continue;}
    if((m=/^def\s+(?:(self)\s*\.\s*)?([A-Za-z_]\w*[?!=]?|\[\]=?|[+\-*\/%<>=!~^&|]+)/.exec(t))){
      const endless=/^def\s+[^(=\s]+(?:\s*\([^)]*\))?\s*=(?!=|~)/.test(t);
      const sym=src.add(owner?'method':'function',m[2],owner,{at:a+m[0].length-m[2].length,start:a,end:e,local:inDef(),span:true});
      if(!endless)stack.push({kind:'def',symbol:sym,start:a});keywords(a+m[0].length,e,false);continue;}
    if(sc&&(m=/^attr_(?:accessor|reader|writer)\b\s*\(?([^)]*)/.exec(t))){for(const x of m[1].matchAll(/:([A-Za-z_]\w*)/g))src.add('property',x[1],owner,{at:a+m[0].length-m[1].length+x.index+1,start:a,end:e});}
    else if(!inDef()&&(m=/^([A-Z]\w*)\s*=(?![=~])/.exec(t))){
      const cls=/^[A-Z]\w*\s*=\s*(?:Struct\.new|Data\.define|Class\.new)\b/.test(t);src.add(cls?'class':owner?'property':'variable',m[1],owner,{at:a,start:a,end:e});}
    else if((m=/^(require_relative|require|load|autoload)\b\s*\(?\s*(?::\w+\s*,\s*)?(["'])/.exec(t))){const v=src.stringAt(a+m[0].length-1);if(typeof v==='string'&&v)imports.push(importOf(file,m[1],v));}
    route(a,e,t);
    keywords(a,e,true);
  }
  while(stack.length)close(code.length-3);
  function keywords(from,e,first){
    // Openers and `end`s in a statement, left to right; a loop's `do` belongs to the loop.
    const t=code.slice(from,e);let loop=false;OPENER.lastIndex=0;let m;
    while((m=OPENER.exec(t))){
      const w=m[1],before=t.slice(0,m.index),at=from+m.index;
      if(/\.\s*$|(?<!:):$/.test(before))continue;
      if(w==='end'){close(at);continue;}
      if(w==='class'||w==='module'||w==='def'){if(!first||m.index>0)stack.push({kind:'block'});continue;}
      if(w==='do'){if(loop){loop=false;continue;}const p=routesFile?/^(?:namespace\s+:(\w+)|scope\s+(?:path:\s*)?["']\/?([^"']*)["'])/.exec(src.text.slice(from,e).trim()):null;
        stack.push({kind:'block',prefix:p?(p[1]||p[2]||'').replace(/^\/+|\/+$/g,''):''});continue;}
      if(!STARTS.test((first?'':'x ')+before)&&!(first&&!before.trim()))continue;
      if(w==='while'||w==='until'||w==='for')loop=true;
      stack.push({kind:'block'});
    }
  }
  function route(a,e,t){
    let m;
    if(routesFile&&(m=/^(get|post|put|patch|delete|match)\b\s*\(?\s*(["'])/.exec(t))){
      const v=src.stringAt(a+m[0].length-1);if(typeof v!=='string')return;
      src.add('api.route',scan.routeName(m[1]==='match'?'ROUTE':m[1].toUpperCase(),'/'+[prefix(),v.replace(/^\/+/,'')].filter(Boolean).join('/')),'',{at:a,start:a,end:e});return;}
    if(routesFile&&/^root\b/.test(t)){src.add('api.route',scan.routeName('GET','/'+prefix()),'',{at:a,start:a,end:e});return;}
    if(!routesFile&&!inDef()&&(m=/^(get|post|put|patch|delete|options)\b\s*\(?\s*(["'])/.exec(t))&&/\bdo\b|\{/.test(t)){
      const v=src.stringAt(a+m[0].length-1);if(typeof v==='string'&&v.startsWith('/'))src.add('api.route',scan.routeName(m[1].toUpperCase(),v),'',{at:a,start:a,end:e});}
  }
  return src.result(imports);
}
function importOf(file,how,v){
  const name=v.replace(/\.rb$/,''),spec=`${how} ${v}`.slice(0,180);
  if(how==='require_relative'){const t=path.normalize(path.join(path.dirname(file),name));return t.startsWith('../')?{spec,target:null}:{spec,target:t,ext:['.rb']};}
  if(name.startsWith('/')||name.startsWith('.'))return {spec,target:null};
  return {spec,target:null,candidate:[path.join('lib',name),name,path.join('app',name)],ext:['.rb']};
}
module.exports={id:'ruby',test:file=>/\.(?:rb|rake)$/i.test(file),analyze};

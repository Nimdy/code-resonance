'use strict';
// Shared machinery for the dependency-free scanners of the brace languages (Go, Rust, Java, Kotlin, C#, Swift, C/C++,
// PHP). The lexer blanks comments and string contents without moving anything, so offsets, line numbers and bracket
// matching stay exact and a keyword or brace inside a string or comment can never start a declaration:
//   code: comments and string contents are spaces (the quotes stay), what the scanners read;
//   text: only comments are spaces, what fingerprints are taken from (an edited comment is not a changed symbol).
// String values are kept by the offset of their opening quote, so a literal route path can be read back.
// Every adapter shares the symbol table below: keys are `kind:owner.name#ordinal` and never include a line number,
// fingerprints are the declaration's own code, and the caps match the other adapters (1800 symbols, 160 KB).
const {sha}=require('../../receiver/protocol');
const MAX_BYTES=160*1024,CAP=1800;
const ID=/[A-Za-z0-9_]/;
const EMPTY=()=>({symbols:[],imports:[],errors:0,lines:0});
const tooLarge=source=>Buffer.byteLength(source,'utf8')>MAX_BYTES;
// Dialect flags: nest (nested block comments), hash ('#' line comments, not '#['), chars ('c' char literals, 'rust'
// where 'a is a lifetime), sq (single-quoted strings), tick ('raw' Go raw strings, 'shell' PHP, 'ident' quoted names),
// triple ("""), multiline ("..." may span lines), interp (string holes: 'kotlin' ${}, 'swift' \(), 'php' {$}),
// rust / cpp / cs / swift (their raw and verbatim strings), pre ('c' directives and #if branches, 'swift' #if only),
// php (HTML outside <?php ... ?>, heredocs).
function lex(source,d={}){
  const n=source.length,cuts=[],strings=[],directives=[];
  let i=0,html=!!d.php,lineStart=true;
  const cut=(a,b,t)=>{if(b>a)cuts.push(a,b,t);};
  const prevId=k=>k>0&&ID.test(source[k-1]);
  function block(){
    const s=i;i+=2;let depth=1;
    while(i<n&&depth){if(source[i]==='*'&&source[i+1]==='/'){depth--;i+=2;}else if(d.nest&&source[i]==='/'&&source[i+1]==='*'){depth++;i+=2;}else i++;}
    cut(s,i,1);
  }
  function line(){const s=i;while(i<n&&source[i]!=='\n'&&!(d.php&&source[i]==='?'&&source[i+1]==='>'))i++;cut(s,i,1);}
  // A quoted string from i (at the opening delimiter `open`) to its closing `close`; records its value unless it has holes.
  function quoted(open,close,{esc='\\',multi=d.multiline,holes=d.interp,doubled=false}={}){
    const q=i;i+=open.length;const from=i,mark=cuts.length,smark=strings.length;let literal=true;
    while(i<n){
      const c=source[i];
      if(source.startsWith(close,i)){if(doubled&&source.startsWith(close+close,i)){i+=close.length*2;continue;}break;}
      if(c==='\n'&&!multi)break;
      if(esc&&c===esc){
        if(holes==='swift'&&source[i+1]==='('){i+=2;run(')');i++;literal=false;continue;}
        i+=2;continue;
      }
      if(holes==='kotlin'&&c==='$'&&source[i+1]==='{'){i+=2;run('}');i++;literal=false;continue;}
      if(holes==='php'&&(c==='{'&&source[i+1]==='$'||c==='$'&&source[i+1]==='{')){i+=c==='{'?1:2;run('}');i++;literal=false;continue;}
      if(holes==='cs'&&c==='{'){if(source[i+1]==='{'){i+=2;continue;}i++;run('}');i++;literal=false;continue;}
      i++;
    }
    cuts.length=mark;strings.length=smark;const to=Math.min(i,n);cut(from,to,2);
    if(source.startsWith(close,i))i+=close.length;
    strings.push([q,literal?source.slice(from,to):null,i]);
  }
  function char(){
    // 'x', '\n', '\u{1F600}': a char literal; anything else (a Rust lifetime or label, a C++ digit separator) is code.
    if(d.chars==='c'){let k=i-1;while(k>=0&&/[\w.]/.test(source[k]))k--;if(/[0-9]/.test(source[k+1]||'')&&k+1<i){i++;return;}}
    let j=-1;
    if(source[i+1]==='\\'){for(let k=i+2;k<Math.min(n,i+14);k++){if(source[k]==='\n')break;if(source[k]==="'"&&k>i+2){j=k;break;}}}
    else if(source[i+1]!=='\n'&&source[i+1]!==undefined){const cp=source.codePointAt(i+1),w=cp>0xffff?2:1;if(source[i+1+w]==="'")j=i+1+w;}
    if(j<0){i++;return;}
    cut(i+1,j,2);i=j+1;
  }
  function heredoc(){
    // PHP <<<ID / <<<"ID" / <<<'ID' ... ID (the closing identifier may be indented since PHP 7.3).
    const m=/^<<<[ \t]*(["']?)([A-Za-z_]\w*)\1[ \t]*\r?\n/.exec(source.slice(i,i+80));
    if(!m){i+=3;return;}
    const q=i,from=i+m[0].length,re=new RegExp(`\\n[ \\t]*${m[2]}\\b`,'g');re.lastIndex=from-1;const e=re.exec(source);
    const to=e?e.index:n;cut(from,to,2);i=e?e.index+e[0].length:n;strings.push([q,null,i]);
  }
  // Preprocessor: directive lines are recorded and blanked (#if branches are settled after lexing, in branches()).
  function directive(){
    const s=i;
    while(i<n&&source[i]!=='\n'){if(d.pre==='c'&&source[i]==='\\'&&source[i+1]==='\n'){i+=2;continue;}if(source[i]==='\\'&&source[i+1]==='\r'&&source[i+2]==='\n'){i+=3;continue;}i++;}
    const t=source.slice(s,i).replace(/\/\*[^]*?\*\/|\/\/.*$/gm,'').trim();
    const m=/^#\s*(\w+)\s*([^]*)$/.exec(t);
    directives.push({start:s,end:i,text:t,kind:m?m[1]:'',arg:m?m[2]:''});cut(s,i,1);
  }
  const SWIFT_DIRECTIVE=/^#(?:if|elseif|else|endif|warning|error|sourceLocation)\b/;
  function run(stop){
    let depth=0;const open=stop==='}'?'{':stop===')'?'(':null;
    while(i<n){
      if(html){const j=source.indexOf('<?',i);if(j<0){cut(i,n,1);i=n;return;}const e=j+(source.startsWith('<?php',j)?5:source.startsWith('<?=',j)?3:2);cut(i,e,1);i=e;html=false;continue;}
      const c=source[i];
      if(c==='\n'){i++;lineStart=true;continue;}
      if(c===' '||c==='\t'||c==='\r'||c==='\f'){i++;continue;}
      const atStart=lineStart;lineStart=false;
      if(stop){if(c===stop&&depth===0)return;if(c===open)depth++;else if(c===stop)depth--;}
      if(c==='/'&&source[i+1]==='/'){line();continue;}
      if(c==='/'&&source[i+1]==='*'){block();continue;}
      if(c==='#'){
        if(atStart&&(d.pre==='c'||d.pre==='swift'&&SWIFT_DIRECTIVE.test(source.slice(i,i+16)))){directive();continue;}
        if(d.hash&&source[i+1]!=='['){line();continue;}
        if(d.swift&&/^#+"/.test(source.slice(i,i+8))){const h=/^#+/.exec(source.slice(i,i+8))[0];i+=h.length;const triple=source.startsWith('"""',i);
          quoted(triple?'"""':'"',(triple?'"""':'"')+h,{esc:null,multi:triple});continue;}
      }
      if(d.php&&c==='?'&&source[i+1]==='>'){html=true;cut(i,i+2,1);i+=2;continue;}
      if(d.php&&c==='<'&&source.startsWith('<<<',i)){heredoc();continue;}
      if(!prevId(i)&&ID.test(c)){
        // String prefixes: Rust r"" r#""# b"" br"" b'' c"", C++ R"(...)" u8"" L'', C# handled at @ and $.
        if(d.rust){const m=/^(?:[bc]?r(#*)")/.exec(source.slice(i,i+40));
          if(m){i+=m[0].length-1;quoted('"','"'+m[1],{esc:null,multi:true});continue;}
          if((c==='b'||c==='c')&&source[i+1]==='"'){i++;quoted('"','"');continue;}
          if(c==='b'&&source[i+1]==="'"){i++;char();continue;}}
        if(d.cpp){const m=/^(?:u8|u|U|L)?R"([^ ()\\\t\n"]{0,16})\(/.exec(source.slice(i,i+24));
          if(m){i+=m[0].length-2-m[1].length;quoted('"'+m[1]+'(',')'+m[1]+'"',{esc:null,multi:true});continue;}
          const p=/^(?:u8|u|U|L)(?=["'])/.exec(source.slice(i,i+3));if(p){i+=p[0].length;continue;}}
        while(i<n&&ID.test(source[i]))i++;continue;
      }
      if(d.cs&&(c==='@'||c==='$')){const m=/^(\$*)(@?)(\$*)("+)/.exec(source.slice(i,i+12));
        if(m&&(m[1]||m[2]||m[3])){const holes=m[1]||m[3]?'cs':null,raw=m[4].length>=3;i+=m[0].length-m[4].length;
          if(raw)quoted(m[4],m[4],{esc:null,multi:true,holes:null});
          else if(m[2])quoted('"','"',{esc:null,multi:true,doubled:true,holes});
          else quoted('"','"',{holes});continue;}}
      if(c==='"'){
        if(d.triple&&source.startsWith('"""',i)){let k=i;while(source[k]==='"')k++;const q=d.cs?source.slice(i,k):'"""';
          quoted(q,q,{esc:d.cs||d.interp==='kotlin'?null:'\\',multi:true,holes:d.cs?null:d.interp});continue;}
        quoted('"','"');continue;
      }
      if(c==="'"){if(d.sq)quoted("'","'",{multi:true,holes:null});else if(d.chars)char();else i++;continue;}
      if(c==='`'){
        if(d.tick==='raw'){quoted('`','`',{esc:null,multi:true,holes:null});continue;}
        if(d.tick==='shell'){quoted('`','`',{multi:true,holes:null});continue;}
        if(d.tick==='ident'){const e=source.indexOf('`',i+1),nl=source.indexOf('\n',i+1);if(e>i&&(nl<0||e<nl)){cut(i+1,e,3);i=e+1;continue;}}
      }
      i++;
    }
  }
  run(null);
  if(d.pre)branches(source,cuts,directives);
  return {...build(source,cuts),strings,directives};
}
// code and text from the cut list [from, to, type]...: 1 comment (blank in both), 2 string content (blank in code),
// 3 quoted name (word characters kept in code).
function build(source,cuts){
  let code='',text='',pos=0;
  for(let k=0;k<cuts.length;k+=3){
    const a=cuts[k],b=cuts[k+1],t=cuts[k+2];if(a<pos)continue;
    const keep=source.slice(pos,a),seg=source.slice(a,b),blank=seg.replace(/[^\n]/g,' ');
    code+=keep+(t===3?seg.replace(/[^\w\n]/g,'_'):blank);text+=keep+(t===1?blank:seg);pos=b;
  }
  code+=source.slice(pos);text+=source.slice(pos);
  return {code,text};
}
// Conditional compilation: every branch of an #if is kept when each one is brace-balanced (the usual case: alternative
// declarations, feature blocks); when a branch is not (`#ifdef X int f() { #else int f(int a) { #endif`), only the
// first branch is kept, so alternatives cannot unbalance the braces. An #if 0 (or false) branch is dead code: dropped.
function branches(source,cuts,directives){
  const n=source.length,mask=new Uint8Array(n);
  for(let k=0;k<cuts.length;k+=3)mask.fill(1,cuts[k],cuts[k+1]);
  const drop=[],stack=[];
  const balance=(a,b)=>{let x=0;for(let i=a;i<b;i++){if(mask[i])continue;const c=source.charCodeAt(i);if(c===123)x++;else if(c===125)x--;}return x;};
  for(const dv of directives){
    const k=dv.kind;
    if(/^if(?:n?def)?$/.test(k))stack.push({zero:k==='if'&&/^(?:0|false)\b/.test(dv.arg),parts:[{from:dv.end}]});
    else if((k==='elif'||k==='elseif'||k==='else')&&stack.length){const c=stack.at(-1);c.parts.at(-1).to=dv.start;c.parts.push({from:dv.end});}
    else if(k==='endif'&&stack.length){
      const c=stack.pop();c.parts.at(-1).to=dv.start;
      const lose=c.zero?[c.parts[0]]:c.parts.some(p=>balance(p.from,p.to)!==0)?c.parts.slice(1):[];
      for(const p of lose){drop.push(p);mask.fill(1,p.from,p.to);}
    }
  }
  if(!drop.length)return;
  // The dropped ranges become comments (blank in code and text); the parts of other cuts outside them stay as they were.
  drop.sort((x,y)=>x.from-y.from);const D=[];
  for(const p of drop){const last=D.at(-1);if(last&&p.from<=last[1])last[1]=Math.max(last[1],p.to);else D.push([p.from,p.to]);}
  const out=[];
  for(let k=0;k<cuts.length;k+=3){
    let a=cuts[k];const b=cuts[k+1],t=cuts[k+2];
    for(const [x,y] of D){if(y<=a||x>=b)continue;if(x>a)out.push([a,x,t]);a=Math.max(a,y);if(a>=b)break;}
    if(a<b)out.push([a,b,t]);
  }
  for(const [x,y] of D)out.push([x,y,1]);
  out.sort((x,y)=>x[0]-y[0]);
  cuts.length=0;for(const [a,b,t] of out)if(b>a)cuts.push(a,b,t);
}
// Partner of every bracket ({} () []), -1 when unmatched; a stray closer is ignored, an unclosed opener runs to the end.
function brackets(code){
  const n=code.length,match=new Int32Array(n).fill(-1),stack=[];
  for(let i=0;i<n;i++){
    const c=code.charCodeAt(i);
    if(c===123||c===40||c===91)stack.push(i);
    else if(c===125||c===41||c===93){
      const want=c===125?123:c===41?40:91;let k=stack.length-1;
      while(k>=0&&code.charCodeAt(stack[k])!==want&&stack.length-k<8)k--;
      if(k>=0&&code.charCodeAt(stack[k])===want){const o=stack[k];stack.length=k;match[o]=i;match[i]=o;}
    }
  }
  return match;
}
// A lexed source with everything a scanner needs: brackets, lines, string values, a symbol table and the routes.
function prepare(source,dialect){
  const {code,text,strings,directives}=(dialect.lex||lex)(source,dialect);
  const match=brackets(code),nl=[];for(let i=0;i<code.length;i++)if(code.charCodeAt(i)===10)nl.push(i);
  const lineOf=off=>{let lo=0,hi=nl.length;while(lo<hi){const mid=(lo+hi)>>1;if(nl[mid]<off)lo=mid+1;else hi=mid;}return lo+1;};
  const strAt=new Map(strings.map(x=>[x[0],x]));
  // The string literal whose opening quote is at or just after `off` (only spaces between), else undefined.
  const stringAt=off=>{let k=off;while(k<code.length&&/\s/.test(code[k]))k++;const x=strAt.get(k);return x?x[1]:undefined;};
  // The value of [a,b) when it is exactly one string literal (an argument), else null.
  const literalIn=(a,b)=>{let k=a;while(k<b&&/\s/.test(code[k]))k++;const x=strAt.get(k);return x&&typeof x[1]==='string'&&!code.slice(x[2],b).trim()?x[1]:null;};
  // The top-level arguments [start,end) of a call whose `(` is at open.
  const args=open=>{const out=[],e=match[open];if(e<open)return out;let s=open+1;
    for(let i=open+1;i<e;i++){const c=code[i];if((c==='('||c==='['||c==='{')&&match[i]>i){i=match[i];continue;}if(c===','){out.push([s,i]);s=i+1;}}
    if(code.slice(s,e).trim())out.push([s,e]);return out;};
  const stringsIn=(a,b)=>{let lo=0,hi=strings.length;while(lo<hi){const mid=(lo+hi)>>1;if(strings[mid][0]<a)lo=mid+1;else hi=mid;}
    const out=[];for(let k=lo;k<strings.length&&strings[k][0]<b;k++)out.push(strings[k]);return out;};
  // The code of [a,b) with the contents of nested brackets blanked: what is at this level only (an `=` in a parameter
  // list or an annotation argument is not an initializer).
  const flat=(a,b)=>{let out='';for(let i=a;i<b;i++){const c=code[i];if((c==='('||c==='['||c==='{')&&match[i]>i&&match[i]<b){out+=c+' '.repeat(match[i]-i-1)+code[match[i]];i=match[i];}else out+=c;}return out;};
  const close=(open,to=code.length)=>{const m=match[open];return m>open&&m<to?m:to;};
  const symbols=[],occurrences=new Map(),spans=[];
  function add(kind,name,owner,{at,start,end,local=false,span=false}){
    if(!name||symbols.length>=CAP)return null;
    const safe=String(name).slice(0,180),key=`${kind}:${owner?owner+'.':''}${safe}`;
    const ordinal=occurrences.get(key)||0;occurrences.set(key,ordinal+1);
    const body=text.slice(start,Math.min(end,text.length)).replace(/\s+/g,' ').trim();
    const s={key:`${key}#${ordinal}`,kind,name:safe,owner:owner||'',fingerprint:sha(body).slice(0,16),size:Math.min(100000,body.length),line:lineOf(at),local};
    symbols.push(s);if(span)spans.push({start,end,name:safe});return s;
  }
  // The innermost function or method a call sits in (route registrations are keyed by it, as in the TS adapter).
  const ownerAt=off=>{let best=null;for(const s of spans)if(s.start<=off&&off<s.end&&(!best||s.start>=best.start))best=s;return best?best.name:'';};
  return {source,code,text,strings,directives,match,lineOf,stringAt,literalIn,args,stringsIn,flat,close,symbols,add,ownerAt,newlines:!!dialect.newlines,
    result:imports=>({symbols,imports,errors:0,lines:source.split('\n').length})};
}
const space=c=>c===' '||c==='\t'||c==='\n'||c==='\r'||c==='\f';
// Newline languages (Go, Kotlin, Swift): a newline ends a statement unless the line ends with an operator that needs
// more, or the next line continues it (.method, ?:, &&, a lone `{`, `: Super`, `where`, `=`).
function continues(code,start,i,to){
  let p=i-1;while(p>=start&&space(code[p]))p--;
  if(p<start)return true;
  let q=i+1;while(q<to&&space(code[q]))q++;
  const prev=code[p],next=code[q]||'',next2=code.slice(q,q+2);
  if(',=+-&|:.('.includes(prev)&&!(prev==='+'&&code[p-1]==='+')&&!(prev==='-'&&code[p-1]==='-'))return true;
  if(next==='{'||next==='.'&&code[q+1]!=='.'||next==='?'&&(code[q+1]==='.'||code[q+1]===':')||next2==='&&'||next2==='||'||next2==='->')return true;
  if((next===':'&&code[q+1]!==':')||(next==='='&&code[q+1]!=='='))return true;
  return /^where\b/.test(code.slice(q,q+6));
}
// The statements of one nesting level of [from,to): on.brace(start, open, close) for a `{` (its header began at start;
// return true when the statement ends with the block), on.end(start, end) for a statement ended by `;`, by a newline
// (newline languages) or by the range's end. Parentheses and brackets are skipped whole.
function walk(src,from,to,on){
  const {code,match}=src;let start=from;
  for(let i=from;i<to;i++){
    const c=code.charCodeAt(i);
    if(c===123){const close=src.close(i,to);const reset=on.brace(start,i,close);i=close;if(reset)start=close+1;continue;}
    if(c===40||c===91){const m=match[i];if(m>i&&m<to)i=m;continue;}
    if(c===59){on.end(start,i);start=i+1;continue;}
    if(c===10&&src.newlines&&!continues(code,start,i,to)){on.end(start,i);start=i+1;}
  }
  if(start<to)on.end(start,to);
}
// Skips leading annotations or attributes from `a`: @Name(...) (Java, Kotlin, Swift), [Attr(...)] (C#), #[attr] (Rust,
// PHP), [[attr]] (C++). Returns {at: first offset after them, list: [{start, end, name}]}.
function annotations(src,a,b,style){
  const {code,match}=src;const list=[];let i=a;
  for(;;){
    while(i<b&&space(code[i]))i++;
    const s=i;
    if(style==='at'&&code[i]==='@'&&ID.test(code[i+1]||'')&&!/^@interface\b/.test(code.slice(i,i+11))){i++;while(i<b&&/[\w.:]/.test(code[i]))i++;const name=code.slice(s+1,i);let j=i;while(j<b&&space(code[j]))j++;
      if(code[j]==='('&&match[j]>j){i=match[j]+1;}list.push({start:s,end:i,name});continue;}
    if(style==='bracket'&&code[i]==='['&&match[i]>i){const e=match[i];const name=(/^\[\s*(?:\w+\s*:\s*)?([\w.]+)/.exec(code.slice(i,e))||[])[1]||'';i=e+1;list.push({start:s,end:i,name});continue;}
    if(style==='hash'&&code[i]==='#'&&(code[i+1]==='['||code[i+1]==='!'&&code[i+2]==='[')){const o=code[i+1]==='['?i+1:i+2;if(match[o]<o)break;const name=(/^\[\s*([\w:]+)/.exec(code.slice(o,match[o]))||[])[1]||'';i=match[o]+1;list.push({start:s,end:i,name});continue;}
    if(style==='cpp'&&code[i]==='['&&code[i+1]==='['&&match[i]>i){i=match[i]+1;continue;}
    break;
  }
  return {at:i,list};
}
// The path argument of an annotation or a call whose `(` is at `open`: the first positional string, or a named
// value/path/template argument. Returns null when there is no literal path.
function pathArg(src,open,close,names=['value','path','template']){
  if(open<0||src.code[open]!=='(')return null;
  const inner=src.code.slice(open+1,close);
  let m=/^\s*[\[{]?\s*(?:@)?(["'])/.exec(inner);
  if(m){const v=src.stringAt(open+1+m.index+m[0].length-1);return typeof v==='string'?v:null;}
  const re=new RegExp(`\\b(?:${names.join('|')})\\s*[=:]\\s*[\\[{]?\\s*(?:arrayOf\\s*\\(\\s*)?(["'])`);
  m=re.exec(inner);if(m){const v=src.stringAt(open+1+m.index+m[0].length-1);return typeof v==='string'?v:null;}
  return null;
}
// Splits a declaration list on top-level commas, where <> nests too (generic arguments: `Map<K, V> m, int n`).
function splitTop(text,sep=','){
  const out=[];let depth=0,s=0;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(c==='('||c==='['||c==='{'||c==='<'&&text[i+1]!=='=')depth++;
    else if(c===')'||c===']'||c==='}'||c==='>'&&text[i-1]!=='-'&&text[i-1]!=='=')depth=Math.max(0,depth-1);
    else if(c===sep&&depth===0){out.push([s,i]);s=i+1;}}
  out.push([s,text.length]);return out.map(([a,b])=>({at:a,text:text.slice(a,b)})).filter(x=>x.text.trim());
}
// Text with balanced <...> groups (generic parameters and arguments) blanked, same length.
function blankAngles(text){
  const out=text.split('');let depth=0;
  for(let i=0;i<out.length;i++){const c=text[i];
    if(c==='<'&&text[i+1]!=='<'&&text[i-1]!=='<'&&text[i+1]!=='='){depth++;out[i]=' ';continue;}
    if(c==='>'&&depth>0&&text[i-1]!=='-'&&text[i-1]!=='='){depth--;out[i]=' ';continue;}
    if(depth>0&&c!=='\n')out[i]=' ';}
  return depth?text:out.join('');
}
// Where a package's folders start: the file's folder minus the trailing folders that spell the package's last
// segments. strict (Java): the whole package must be spelled; otherwise (Kotlin, C#) a common root may be omitted, as
// their conventions allow. Returns {root, implied} (implied: the leading package segments not spelled), or null.
function packageRoot(file,pkg,strict){
  const segs=pkg?pkg.split('.').filter(Boolean):[],dir=file.includes('/')?file.slice(0,file.lastIndexOf('/')).split('/'):[];
  let k=0;while(k<segs.length&&k<dir.length&&dir[dir.length-1-k]===segs[segs.length-1-k])k++;
  if(strict?k!==segs.length:k===0&&segs.length)return null;
  return {root:dir.slice(0,dir.length-k).join('/'),implied:segs.slice(0,segs.length-k)};
}
// The directory a package (or namespace) lives in under a root found by packageRoot, or null when it is elsewhere.
function packageDir(base,segs){
  if(!base)return null;const {root,implied}=base;
  if(segs.length<implied.length||implied.some((x,i)=>segs[i]!==x))return null;
  return [root,...segs.slice(implied.length)].filter(Boolean).join('/');
}
// A function-like header in [a,b): the name before the first top-level `(`, the text before it (return type,
// modifiers) and after its `)`. Null when there is no parameter list.
function signature(src,a,b){
  const {code,match}=src;
  for(let i=a;i<b;i++){
    const c=code[i];
    if(c==='('){const e=match[i];if(e<i||e>=b)return null;
      // `operator()(...)`: the first pair is the name.
      if(/\boperator\s*$/.test(code.slice(a,i))&&!code.slice(i+1,e).trim()){i=e;continue;}
      // Generic parameters (`Get<T>(`, `Foo<int>::bar(`) are blanked, so the name and its qualifiers stay readable.
      const head=blankAngles(code.slice(a,i));
      const m=/((?:operator\s*(?:\(\s*\)|\[\s*\]|[^\s(]+)|~?[A-Za-z_$][\w$]*)(?:\s*::\s*(?:~?[A-Za-z_$][\w$]*|operator\s*(?:\(\s*\)|\[\s*\]|[^\s(]+)))*)\s*$/.exec(head);
      if(!m)return null;
      const name=m[1].replace(/\s+/g,' ').replace(/\s*::\s*/g,'::').replace(/operator\s+(?=[^\w\s])/g,'operator');
      return {name,at:a+m.index,before:head.slice(0,m.index),after:code.slice(e+1,b),open:i,close:e};}
    if(c==='['||c==='{'){const e=match[i];if(e>i&&e<b)i=e;}
  }
  return null;
}
const joinRoute=(prefix,p)=>{if(!prefix)return p||'/';if(!p)return prefix;return prefix.replace(/\/+$/,'')+'/'+p.replace(/^\/+/,'');};
const routeName=(method,p)=>`${method} ${String(p).slice(0,120)}`;
module.exports={MAX_BYTES,CAP,EMPTY,tooLarge,lex,build,brackets,prepare,walk,continues,annotations,pathArg,splitTop,blankAngles,packageRoot,packageDir,signature,joinRoute,routeName,space};

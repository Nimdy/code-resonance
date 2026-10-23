'use strict';
// Python adapter: a lightweight indentation-aware scanner (no Python runtime, no parser dependency).
//
// Recognised: classes, functions, methods, nested (local) functions, async functions, decorated HTTP handlers
// (@app.get("/x"), @router.post(...), @bp.route(...): the Flask / FastAPI / Django Ninja style), module-level
// assignments, class attributes and `self.x = ...` attributes, and imports (relative imports resolve to a project
// path; absolute dotted imports are offered as a candidate the reducer resolves only if that file exists).
// Not recognised, and reported as missing structure rather than guessed: definitions created at run time
// (type(), exec, metaprogramming), names from star imports, and syntax errors (the scanner does not validate code,
// so `errors` is always 0).
const path=require('node:path').posix;
const {sha}=require('../../receiver/protocol');
const PY_FILE=/\.pyi?$/i;
const ROUTE_DECORATOR=/^@\s*[A-Za-z_][\w.]*\.(get|post|put|patch|delete|options|head|route|api_route|websocket)\s*\(\s*(?:(?:path|rule)\s*=\s*)?[rbuf]*(['"])([^'"]*)\2/i;
const CLASS=/^class\s+([A-Za-z_]\w*)/;
const DEF=/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;
const ASSIGN=/^([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/;
const SELF_ASSIGN=/^self\.([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/;
const ANNOTATION=/^([A-Za-z_]\w*)\s*:\s*[^=]+$/;
const LAMBDA=/^[A-Za-z_]\w*\s*=\s*lambda\b/;
// Logical lines: comments removed, bracketed continuations and backslash continuations joined, string contents kept
// (truncated) on one line, so a "def" inside a docstring can never start a line.
function logicalLines(source){
  const out=[];const n=source.length;
  let i=0,line=1,buf='',depth=0,start=1,indent=0,atLineStart=true;
  const push=end=>{if(buf.trim())out.push({indent,text:buf.trim(),line:start,end});buf='';};
  while(i<n){
    if(atLineStart){
      let w=0;while(i<n&&(source[i]===' '||source[i]==='\t'||source[i]==='\f')){w+=source[i]==='\t'?8-(w%8):1;i++;}
      indent=w;start=line;atLineStart=false;continue;
    }
    const ch=source[i];
    if(ch==='#'){while(i<n&&source[i]!=='\n')i++;continue;}
    if(ch==='"'||ch==="'"){
      const triple=source.startsWith(ch+ch+ch,i),q=triple?ch+ch+ch:ch;i+=q.length;let s='';
      while(i<n&&!source.startsWith(q,i)){
        if(source[i]==='\\'){s+=source.slice(i,i+2);i+=2;continue;}
        if(source[i]==='\n'){if(!triple)break;line++;s+=' ';i++;continue;}
        s+=source[i];i++;
      }
      if(source.startsWith(q,i))i+=q.length;
      buf+=q[0]+s.slice(0,200)+q[0];continue;
    }
    if(ch==='\\'&&source[i+1]==='\n'){i+=2;line++;buf+=' ';continue;}
    if(ch==='\r'){i++;continue;}
    if(ch==='\n'){
      i++;line++;
      if(depth===0){push(line-1);atLineStart=true;}else buf+=' ';
      continue;
    }
    if(ch==='('||ch==='['||ch==='{')depth++;
    else if(ch===')'||ch===']'||ch==='}')depth=Math.max(0,depth-1);
    buf+=ch;i++;
  }
  push(line);
  return out;
}
function relativeTarget(file,dots,module){
  // `from .x import y` is relative to the file's package; each extra dot climbs one package.
  let base=path.dirname(file);for(let k=1;k<dots;k++)base=path.dirname(base);
  const joined=path.normalize(path.join(base,module.replace(/\./g,'/')));
  if(joined.startsWith('../')||joined.startsWith('/')||joined==='..')return null;
  return joined==='.'?null:joined;
}
function parseImports(file,text,imports){
  const add=(spec,target,alt=null,candidate=null)=>imports.push({spec:spec.slice(0,180),target,...(alt?{alt}:{}),...(candidate?{candidate}:{})});
  let m=/^import\s+(.+)$/.exec(text);
  if(m){for(const part of m[1].split(',')){const name=part.trim().split(/\s+as\s+/)[0].trim();if(/^[A-Za-z_][\w.]*$/.test(name))add(name,null,null,name.replace(/\./g,'/'));}return;}
  m=/^from\s+(\.*)([\w.]*)\s+import\s+(.+)$/.exec(text);
  if(!m)return;
  const dots=m[1].length,module=m[2];
  if(!dots){if(module)add(module,null,null,module.replace(/\./g,'/'));return;}
  if(module){const target=relativeTarget(file,dots,module);add(m[1]+module,target);return;}
  // `from . import a, b`: each name may be a submodule; otherwise it lives in the package's __init__.
  const pkg=relativeTarget(file,dots,'')??null;
  for(const part of m[3].replace(/[()]/g,'').split(',')){
    const name=part.trim().split(/\s+as\s+/)[0].trim();if(!/^[A-Za-z_]\w*$/.test(name))continue;
    add(m[1]+name,relativeTarget(file,dots,name),pkg);
  }
}
function analyze(file,source){
  if(Buffer.byteLength(source,'utf8')>160*1024)return {symbols:[],imports:[],errors:0,lines:0};
  const lines=logicalLines(source);
  const symbols=[],imports=[],occurrences=new Map(),cap=1800;
  // Scope stack of open blocks: {indent, kind: 'class'|'def'|'block', name, open: symbol awaiting its body}.
  const stack=[];let decorators=[];
  const close=(entry,endIndex)=>{if(entry.symbol){const body=lines.slice(entry.at,endIndex).map(l=>l.text).join(' ').replace(/\s+/g,' ');entry.symbol.fingerprint=sha(body).slice(0,16);entry.symbol.size=Math.min(100000,body.length);}};
  const add=(kind,name,line,owner,local,at)=>{
    if(!name||symbols.length>=cap)return null;
    const safe=String(name).slice(0,180),key=`${kind}:${owner?owner+'.':''}${safe}`;
    const ordinal=occurrences.get(key)||0;occurrences.set(key,ordinal+1);
    const s={key:`${key}#${ordinal}`,kind,name:safe,owner,fingerprint:sha(lines[at].text).slice(0,16),size:lines[at].text.length,line:line.line,local};
    symbols.push(s);return s;
  };
  const selfAttrs=new Set();
  for(let k=0;k<lines.length;k++){
    const l=lines[k];
    while(stack.length&&stack.at(-1).indent>=l.indent)close(stack.pop(),k);
    const scopes=stack.filter(s=>s.kind!=='block');
    const nearest=scopes.at(-1)||null,inDef=scopes.some(s=>s.kind==='def');
    const owner=nearest?nearest.name:'';
    const t=l.text;
    if(t.startsWith('@')){decorators.push(t);continue;}
    let m;
    if((m=CLASS.exec(t))){
      const s=add('class',m[1],l,owner,inDef,k);decorators=[];
      if(!/:\s*\S/.test(t.replace(/\([^)]*\)/,'')))stack.push({indent:l.indent,kind:'class',name:m[1],symbol:s,at:k});
      continue;
    }
    if((m=DEF.exec(t))){
      const route=!inDef&&decorators.map(d=>ROUTE_DECORATOR.exec(d)).find(Boolean);
      const kind=route?'api.route':nearest&&nearest.kind==='class'?'method':'function';
      const name=route?`${route[1].toUpperCase()==='API_ROUTE'?'ROUTE':route[1].toUpperCase()} ${route[3].slice(0,120)}`:m[1];
      const s=add(kind,name,l,owner,inDef,k);decorators=[];
      // A body on the same line (`def f(): return 1`) opens no block.
      const sig=t.replace(/\([^]*\)/,'()');
      if(!/:\s*\S/.test(sig.slice(sig.indexOf(')'))))stack.push({indent:l.indent,kind:'def',name:m[1],symbol:s,at:k,cls:nearest&&nearest.kind==='class'?nearest.name:null});
      continue;
    }
    decorators=[];
    if(/^(?:import|from)\s/.test(t)){parseImports(file,t,imports);continue;}
    if(nearest&&nearest.kind==='def'&&nearest.cls&&(m=SELF_ASSIGN.exec(t))){
      // Instance attributes assigned in a method belong to the class; the first assignment defines them.
      const id=`${nearest.cls}.${m[1]}`;if(!selfAttrs.has(id)){selfAttrs.add(id);add('property',m[1],l,nearest.cls,false,k);}
    }else if(!inDef&&(m=ASSIGN.exec(t))){
      const kind=nearest&&nearest.kind==='class'?'property':LAMBDA.test(t)?'function':'variable';
      add(kind,m[1],l,owner,false,k);
    }else if(nearest&&nearest.kind==='class'&&(m=ANNOTATION.exec(t))&&!/:\s*$/.test(t)){
      // Dataclass / typed-class field declarations (`name: str`).
      add('property',m[1],l,owner,false,k);
    }
    // Any other block (if/for/with/try...) is transparent: definitions inside keep the enclosing owner.
    if(/:\s*$/.test(t))stack.push({indent:l.indent,kind:'block',name:'',symbol:null,at:k});
  }
  while(stack.length)close(stack.pop(),lines.length);
  return {symbols,imports,errors:0,lines:source.split('\n').length};
}
module.exports={id:'python',test:file=>PY_FILE.test(file),analyze};

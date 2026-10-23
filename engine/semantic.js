'use strict';
// Real TypeScript compiler AST, vendored to make this local-first and offline.
const ts = require('../vendor/typescript');
const path = require('node:path').posix;
const {sha} = require('../receiver/protocol');
const TS_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
function kindFor(file) {
  if (/\.(?:tsx|jsx)$/i.test(file)) return file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.JSX;
  return /\.(?:js|mjs|cjs)$/i.test(file)?ts.ScriptKind.JS:ts.ScriptKind.TS;
}
function importedTarget(file,spec) {
  if (!spec.startsWith('.')) return null;
  const base=path.normalize(path.join(path.dirname(file),spec));
  if (base.startsWith('../') || base.startsWith('/')) return null;
  return base.replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/,'');
}
function analyze(file,source) {
  if (!TS_FILE.test(file) || Buffer.byteLength(source,'utf8')>160*1024) return {symbols:[],imports:[],errors:0};
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,kindFor(file));
  const symbols=[]; const imports=[]; const occurrences=new Map();
  const cap=1800;
  function add(type,name,node,owner='') {
    if (!name || symbols.length>=cap) return;
    const nameSafe=String(name).slice(0,180);
    const key=`${type}:${owner ? owner+'.' : ''}${nameSafe}`;
    const ordinal=occurrences.get(key)||0; occurrences.set(key,ordinal+1);
    const body=node.getText(ast).replace(/\s+/g,' ').trim();
    symbols.push({key:`${key}#${ordinal}`,kind:type,name:nameSafe,owner, fingerprint:sha(body).slice(0,16),size:Math.min(100000,body.length),line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1});
  }
  function isJsx(node) { let yes=false; function walk(n){if(yes) return; if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)||ts.isJsxFragment(n)){yes=true;return;} ts.forEachChild(n,walk);} walk(node);return yes; }
  function nameOf(node){if (!node) return ''; return ts.isIdentifier(node)?node.text:node.getText(ast).slice(0,100);}
  function walk(node,owner='') {
    if (symbols.length>=cap) return;
    if (ts.isImportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) {
      const from=node.moduleSpecifier.text;
      imports.push({spec:from.slice(0,180),target:importedTarget(file,from)});
    }
    if (ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) {
      const from=node.moduleSpecifier.text;
      imports.push({spec:from.slice(0,180),target:importedTarget(file,from)});
    }
    let nextOwner=owner;
    if (ts.isClassDeclaration(node)) { const n=nameOf(node.name)||'default';add('class',n,node,owner);nextOwner=n; }
    else if(ts.isInterfaceDeclaration(node)) {add('interface',nameOf(node.name),node,owner);nextOwner=nameOf(node.name);}
    else if(ts.isTypeAliasDeclaration(node)){add('type',nameOf(node.name),node,owner);}
    else if(ts.isFunctionDeclaration(node)) {
      const n=nameOf(node.name)||'default';
      const kind = /(?:^|\/)app\/api\/.+\/route\.[jt]sx?$/.test(file) && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(n) ? 'api.route' : (n[0]===n[0]?.toUpperCase()&&isJsx(node)?'ui.component':'function');
      add(kind,n,node,owner);nextOwner=n;
    }
    else if(ts.isMethodDeclaration(node)) {const n=nameOf(node.name);add('method',n,node,owner);nextOwner=n;}
    else if(ts.isVariableDeclaration(node)) {
      const n=nameOf(node.name);
      if(n && n.length<130 && !/^[{[]/.test(n)) {
        let kind='variable';
        if(node.initializer&&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer))) {
          if(/(?:^|\/)app\/api\/.+\/route\.[jt]sx?$/.test(file)&&/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(n)) kind='api.route';
          else kind=n[0]===n[0]?.toUpperCase()&&isJsx(node.initializer)?'ui.component':'function';
        }
        add(kind,n,node,owner);
        if(kind!=='variable') nextOwner=n;
      }
    }
    else if(ts.isCallExpression(node)) {
      // Static call site, NOT evidence that the function actually executed.
      const target=node.expression.getText(ast).slice(0,100);
      const line=ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1;
      // A location-scoped stable key; editing arguments updates its fingerprint.
      if (target && !target.includes('\n')) add('callsite',`${target}@${line}`,node,owner);
    }
    ts.forEachChild(node,child=>walk(child,nextOwner));
  }
  walk(ast);
  return {symbols,imports,errors:ast.parseDiagnostics.length};
}
function diff(before,after) {
  const b=new Map(before.symbols.map(s=>[s.key,s]));
  const a=new Map(after.symbols.map(s=>[s.key,s]));
  const result=[];
  for (const [key,s] of a) {
    if (!b.has(key)) result.push({kind:'symbol.created',symbol:s});
    else if(b.get(key).fingerprint!==s.fingerprint) result.push({kind:'symbol.modified',symbol:s});
  }
  for(const [key,s] of b) if(!a.has(key)) result.push({kind:'symbol.removed',symbol:s});
  const bDeps=new Set(before.imports.map(i=>i.spec));
  for (const imp of after.imports) if(!bDeps.has(imp.spec)) result.push({kind:'dependency.added',import:imp});
  for (const imp of before.imports) if(!after.imports.some(x=>x.spec===imp.spec)) result.push({kind:'dependency.removed',import:imp});
  return result;
}
module.exports={analyze,diff,importedTarget};

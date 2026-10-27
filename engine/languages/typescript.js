'use strict';
// TypeScript / JavaScript adapter: the real TypeScript compiler AST (vendored, so analysis is local and offline).
const ts = require('../../vendor/typescript');
const path = require('node:path').posix;
const {sha} = require('../../receiver/protocol');
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
const HTTP_METHOD=/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/;
// File-system routers: Next.js app/ and pages/api, SvelteKit +server, Remix/React Router resource routes.
const ROUTE_FILE=/(?:^|\/)(?:app\/(?:.+\/)?route|pages\/api\/.+|routes\/(?:.+\/)?\+server)\.[jt]sx?$/;
const ROUTER_CALL=/^(?:app|router|server|api|fastify|routes?)\.(get|post|put|patch|delete|options|head|all)$/i;
const COMPONENT_WRAPPER=/^(?:React\.)?(?:memo|forwardRef)$|^observer$/;
function analyze(file,source) {
  if (Buffer.byteLength(source,'utf8')>160*1024) return {symbols:[],imports:[],errors:0,lines:0};
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,kindFor(file));
  const symbols=[]; const imports=[]; const occurrences=new Map();
  const cap=1800;
  function add(type,name,node,owner='',extra={}) {
    if (!name || symbols.length>=cap) return;
    const nameSafe=String(name).slice(0,180);
    // Keys never include line numbers: inserting a line must not "create" every symbol below it.
    const key=`${type}:${owner ? owner+'.' : ''}${nameSafe}`;
    const ordinal=occurrences.get(key)||0; occurrences.set(key,ordinal+1);
    const body=node.getText(ast).replace(/\s+/g,' ').trim();
    symbols.push({key:`${key}#${ordinal}`,kind:type,name:nameSafe,owner, fingerprint:sha(body).slice(0,16),size:Math.min(100000,body.length),line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,...extra});
  }
  function addImport(spec){imports.push({spec:spec.slice(0,180),target:importedTarget(file,spec)});}
  function isJsx(node) { let yes=false; function walk(n){if(yes) return; if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)||ts.isJsxFragment(n)){yes=true;return;} ts.forEachChild(n,walk);} walk(node);return yes; }
  function nameOf(node){if (!node) return ''; return ts.isIdentifier(node)?node.text:node.getText(ast).slice(0,100);}
  const isFunctionLike=n=>ts.isFunctionDeclaration(n)||ts.isMethodDeclaration(n)||ts.isArrowFunction(n)||ts.isFunctionExpression(n)||ts.isConstructorDeclaration(n)||ts.isGetAccessorDeclaration(n)||ts.isSetAccessorDeclaration(n);
  const capitalized=n=>!!n&&n[0]===n[0].toUpperCase()&&n[0]!==n[0].toLowerCase();
  function functionKind(name,fn,nested){
    if(ROUTE_FILE.test(file)&&(HTTP_METHOD.test(name)||name==='default'||name==='handler')&&!nested) return 'api.route';
    return capitalized(name)&&isJsx(fn)?'ui.component':'function';
  }
  function walk(node,owner='',inFunction=false) {
    if (symbols.length>=cap) return;
    if ((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) addImport(node.moduleSpecifier.text);
    let nextOwner=owner;
    if (ts.isClassDeclaration(node)) { const n=nameOf(node.name)||'default';add('class',n,node,owner);nextOwner=n; }
    else if(ts.isInterfaceDeclaration(node)) {add('interface',nameOf(node.name),node,owner);nextOwner=nameOf(node.name);}
    else if(ts.isTypeAliasDeclaration(node)){add('type',nameOf(node.name),node,owner);}
    else if(ts.isFunctionDeclaration(node)) {const n=nameOf(node.name)||'default';add(functionKind(n,node,inFunction),n,node,owner,{local:inFunction});nextOwner=n;}
    else if(ts.isMethodDeclaration(node)) {const n=nameOf(node.name);add('method',n,node,owner);nextOwner=n;}
    else if(ts.isPropertyDeclaration(node)&&owner) {add('property',nameOf(node.name),node,owner);}
    else if(ts.isVariableDeclaration(node)) {
      const n=nameOf(node.name);
      if(n && n.length<130 && !/^[{[]/.test(n)) {
        let kind='variable';let init=node.initializer;
        // memo(() => <X/>), forwardRef(function X() {...}) and observer(...) still define components.
        if(init&&ts.isCallExpression(init)&&COMPONENT_WRAPPER.test(init.expression.getText(ast))&&init.arguments[0]&&(ts.isArrowFunction(init.arguments[0])||ts.isFunctionExpression(init.arguments[0])))init=init.arguments[0];
        if(init&&(ts.isArrowFunction(init)||ts.isFunctionExpression(init))) kind=functionKind(n,init,inFunction);
        add(kind,n,node,owner,{local:inFunction});
        if(kind!=='variable') nextOwner=n;
      }
    }
    else if(ts.isCallExpression(node)) {
      const target=node.expression.getText(ast).slice(0,100);
      const firstArg=node.arguments[0];
      if (node.expression.kind===ts.SyntaxKind.ImportKeyword||target==='require') { if(firstArg&&ts.isStringLiteralLike(firstArg)) addImport(firstArg.text); }
      else if (ROUTER_CALL.test(target)&&firstArg&&ts.isStringLiteralLike(firstArg)) add('api.route',`${target.split('.').pop().toUpperCase()} ${firstArg.text.slice(0,120)}`,node,owner);
      // Static call site, NOT evidence that the function actually executed. Keyed by owner + target + ordinal.
      else if (target && !target.includes('\n')) add('callsite',target,node,owner);
    }
    const childInFunction=inFunction||isFunctionLike(node);
    ts.forEachChild(node,child=>walk(child,nextOwner,childInFunction));
  }
  walk(ast);
  return {symbols,imports,errors:ast.parseDiagnostics.length,lines:source.split('\n').length};
}
module.exports={id:'typescript',test:file=>TS_FILE.test(file),analyze,importedTarget};

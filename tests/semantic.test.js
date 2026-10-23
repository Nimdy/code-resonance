'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {analyze,diff}=require('../engine/semantic');
test('AST classifier recognizes real structures and ignores fake symbols in strings',()=>{
  const file='src/App.tsx';
  const src=`import React from 'react';\nimport {helper} from './helpers';\nconst fake = 'function NotReally() {}';\nexport function App(){ const user='a'; return <h1>{helper(user)}</h1>; }\nclass Client { login(){ return 4; } }\ninterface User { id: string }`;
  const result=analyze(file,src);
  assert(result.symbols.some(s=>s.kind==='ui.component'&&s.name==='App'));
  assert(result.symbols.some(s=>s.kind==='class'&&s.name==='Client'));
  assert(result.symbols.some(s=>s.kind==='method'&&s.name==='login'));
  assert(result.symbols.some(s=>s.kind==='variable'&&s.name==='user'));
  assert(result.symbols.some(s=>s.kind==='callsite'&&s.name.includes('helper')));
  assert(!result.symbols.some(s=>s.name==='NotReally'));
  assert(result.imports.some(d=>d.spec==='./helpers'&&d.target==='src/helpers'));
  assert.equal(result.errors,0);
});
test('Next.js exported GET arrow is a route, not generic function',()=>{
  const x=analyze('app/api/users/route.ts','export const GET = async () => Response.json({ok:true});');
  assert(x.symbols.some(s=>s.kind==='api.route'&&s.name==='GET'));
});
test('AST diff identifies create / modify / remove and dependency changes',()=>{
  const a=analyze('src/lib.ts',`export function a() { return 1; }`);
  const b=analyze('src/lib.ts',`import {x} from './x'; export function a() { return 2; } export const b = 3;`);
  const changes=diff(a,b);
  assert(changes.some(x=>x.kind==='symbol.modified'&&x.symbol.name==='a'));
  assert(changes.some(x=>x.kind==='symbol.created'&&x.symbol.name==='b'));
  assert(changes.some(x=>x.kind==='dependency.added'&&x.import.spec==='./x'));
  const changes2=diff(b,a);
  assert(changes2.some(x=>x.kind==='symbol.removed'&&x.symbol.name==='b'));
});
test('Non-TypeScript files are not misclassified as TS AST',()=>{
  assert.deepEqual(analyze('README.md','function foo() {}').symbols,[]);
});

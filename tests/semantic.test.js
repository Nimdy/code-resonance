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
test('Inserting lines above code changes nothing structurally (no line-keyed churn)',()=>{
  const src=Array.from({length:6},(_,i)=>`export function handler${i}(req){\n  const user=getUser(req.id);\n  log.info('start',user);\n  return respond(transform(user));\n}`).join('\n');
  assert.deepEqual(diff(analyze('src/svc.ts',src),analyze('src/svc.ts','\n\n// note\n'+src)),[]);
  const moved=diff(analyze('src/svc.ts',src),analyze('src/svc.ts',src.replace("log.info('start',user);","log.info('start',user);\n  audit(user);")));
  assert.deepEqual(moved.filter(c=>c.kind==='symbol.created').map(c=>c.symbol.name),['audit']);
});
test('CommonJS require and dynamic import are dependencies',()=>{
  const x=analyze('src/a.js',"const fs=require('node:fs');\nconst {sha}=require('./util');\nasync function later(){ const m=await import('./lazy.js'); return m; }");
  assert.deepEqual(x.imports.map(i=>i.spec).sort(),['./lazy.js','./util','node:fs']);
  assert.equal(x.imports.find(i=>i.spec==='./util').target,'src/util');
});
test('Wrapped components, router endpoints, class properties and local scope are recognised',()=>{
  const ui=analyze('src/ui/Card.tsx','export const Card = memo(({title}) => <div>{title}</div>);\nexport const Field = React.forwardRef(function Field(props, ref) { return <input ref={ref}/>; });');
  assert(ui.symbols.some(s=>s.kind==='ui.component'&&s.name==='Card'));
  assert(ui.symbols.some(s=>s.kind==='ui.component'&&s.name==='Field'));
  const api=analyze('src/server.js',"const app=express();\napp.get('/users/:id', (req,res)=>res.json({}));\nrouter.post('/login', login);");
  assert.deepEqual(api.symbols.filter(s=>s.kind==='api.route').map(s=>s.name).sort(),['GET /users/:id','POST /login']);
  assert(analyze('pages/api/health.ts','export default function handler(req,res){res.end()}').symbols.some(s=>s.kind==='api.route'));
  const cls=analyze('src/store.ts','export const LIMIT = 5;\nexport class Store { items: string[] = []; add(x){ const next=[...this.items,x]; return next; } }');
  assert(cls.symbols.some(s=>s.kind==='property'&&s.name==='items'&&s.owner==='Store'));
  assert.equal(cls.symbols.find(s=>s.name==='LIMIT').local,false);
  assert.equal(cls.symbols.find(s=>s.name==='next').local,true);
});

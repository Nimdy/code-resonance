'use strict';
// Language adapters: each language's parsing lives behind one contract; unsupported code yields no structure, never a guess.
const test=require('node:test'),assert=require('node:assert/strict');
const {analyze,diff}=require('../engine/semantic');
const {adapterFor,languageOf}=require('../engine/languages');
const {newState,apply,publicProjection}=require('../engine/reducer');
const {sha}=require('../receiver/protocol');
const symbols=r=>r.symbols.map(s=>`${s.kind} ${s.owner?s.owner+'.':''}${s.name}${s.local?' (local)':''}`);
const PY=`"""Service module.
def not_a_function_in_a_docstring():
    pass
"""
import os, json as j
from .models import User
from . import utils
from ..core.db import session
from fastapi import APIRouter
LIMIT = 10
handler = lambda x: x
router = APIRouter()

@router.get("/users/{user_id}")
async def read_user(user_id: int) -> dict:
    def helper(v):  # def in a comment: not_real()
        return v
    return helper({"id": user_id})

@dataclass
class Config(Base,
             metaclass=Meta):
    name: str
    retries = 3
    def __init__(self, value):
        self.value = value
        self.value = 2
    @property
    def size(self): return len(self.value)

@app.route('/health', methods=['GET'])
def health():
    return 'ok'

if TYPE_CHECKING:
    def typed_only(): ...
Dynamic = type('Dynamic', (), {})
def two(a,
        b):
    s = '''def not_real(): pass'''
    return a + b
`;
test('The registry picks an adapter per language; unsupported files yield no structure',()=>{
  assert.equal(adapterFor('src/a.tsx').id,'typescript');assert.equal(adapterFor('svc/api.py').id,'python');
  assert.equal(adapterFor('main.go'),null);
  assert.deepEqual(analyze('main.go','package main\nfunc main(){}\n').symbols,[]);
  assert.deepEqual([languageOf('a.tsx'),languageOf('a.py'),languageOf('a.rs'),languageOf('a.css'),languageOf('Makefile')],['tsx','py','rs','css','other']);
});
test('Python: classes, methods, nested functions, decorated routes, fields and imports',()=>{
  const r=analyze('app/api/users.py',PY);
  assert.deepEqual(symbols(r),['variable LIMIT','function handler','variable router','api.route GET /users/{user_id}','function read_user.helper (local)',
    'class Config','property Config.name','property Config.retries','method Config.__init__','property Config.value','method Config.size',
    'api.route ROUTE /health','function typed_only','variable Dynamic','function two']);
  assert.equal(r.errors,0);
  const imports=Object.fromEntries(r.imports.map(i=>[i.spec,i]));
  assert.equal(imports['.models'].target,'app/api/models');
  assert.equal(imports['.utils'].target,'app/api/utils');assert.equal(imports['.utils'].alt,'app/api');
  assert.equal(imports['..core.db'].target,'app/core/db');
  assert.equal(imports.fastapi.target,null);assert.equal(imports.fastapi.candidate,'fastapi');
});
test('Python: no structure from strings or comments, and inserting lines changes nothing',()=>{
  const r=analyze('svc.py',PY);
  assert(!r.symbols.some(s=>/not_real|not_a_function/.test(s.name)));
  assert.deepEqual(diff(analyze('svc.py',PY),analyze('svc.py','\n\n# note\n'+PY)),[]);
  const changed=diff(analyze('svc.py',PY),analyze('svc.py',PY.replace('return a + b','return a * b')));
  assert.deepEqual(changed.map(c=>`${c.kind} ${c.symbol.name}`),['symbol.modified two']);
});
test('Python: run-time definitions are not invented (honest unsupported cases)',()=>{
  const r=analyze('meta.py',"Model = type('Model', (Base,), {'x': 1})\nexec('def ghost(): pass')\nfrom .shapes import *\n");
  assert.deepEqual(symbols(r),['variable Model']);
  assert.deepEqual(r.imports.map(i=>i.spec),['.shapes']);
});
test('Python modules connect through relative and resolvable absolute imports, including packages',()=>{
  const s=newState(sha('py-project'));s.salt='py';let seq=0;
  const snap=(file,content)=>apply(s,{v:1,kind:'document.snapshot',id:`py-${++seq}`,ts:1750000000000+seq*1000,projectId:s.projectId,sessionId:'x',origin:'test',file,content,meta:{reason:'edit'}});
  snap('shop/models/__init__.py','class Order:\n    pass\n');
  snap('shop/util.py','def money(x):\n    return x\n');
  snap('shop/api/routes.py','from ..models import Order\nimport shop.util\nimport requests\n\n@app.post("/orders")\ndef create():\n    return Order()\n');
  const g=publicProjection(s).graph;
  const mod=n=>g.nodes.find(x=>x.type==='module'&&x.lang==='py'&&g.nodes.some(y=>y.parent===x.id&&y.type===n));
  const routes=mod('api.route'),models=mod('class'),util=mod('function');
  const depends=g.edges.filter(e=>e.kind==='depends'&&e.a===routes.id).map(e=>e.b).sort();
  assert.deepEqual(depends,[models.id,util.id].sort(),'package __init__ and an existing absolute module resolve; requests stays external');
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {groupOf,dirOf,newLayout,placeModule,removeModule,hexDistance,DIRS}=require('../engine/layout');
const files=['index.ts','package.json','src/ui/App.tsx','src/ui/forms/Input.tsx','src/ui/forms/Select.tsx','src/api/users.ts','app/api/notes/route.ts',
  'src/data/store.ts','src/data/models.ts','test/store.test.mjs','src/ui/Card.tsx','src/api/auth.ts','src/ui/forms/Field.tsx','scripts/build.js'];
const place=(layout,f)=>placeModule(layout,{id:f,group:groupOf(f)==='.'?'core':groupOf(f),core:groupOf(f)==='.',dir:dirOf(f)});
test('Groups follow the architecture: first two folders under a conventional root, else the top folder',()=>{
  assert.equal(groupOf('src/ui/forms/Input.tsx'),'src/ui');assert.equal(groupOf('app/api/notes/route.ts'),'app/api');
  assert.equal(groupOf('test/a.test.mjs'),'test');assert.equal(groupOf('index.ts'),'.');assert.equal(groupOf('packages/core/src/x.ts'),'packages/core');
});
test('Placed files never move as the project grows, and the plan is deterministic',()=>{
  const a=newLayout(),seen=new Map();
  for(const f of files){place(a,f);for(const [id,pos] of seen)assert.deepEqual([a.modules[id].q,a.modules[id].r],pos,`${id} moved`);seen.set(f,[a.modules[f].q,a.modules[f].r]);}
  for(let i=0;i<200;i++)place(a,`src/gen/g${i%9}/f${i}.ts`);
  for(const [id,pos] of seen)assert.deepEqual([a.modules[id].q,a.modules[id].r],pos);
  const b=newLayout();for(const f of files)place(b,f);for(let i=0;i<200;i++)place(b,`src/gen/g${i%9}/f${i}.ts`);
  assert.deepEqual(b,a);
});
test('Districts are separated by streets; same-folder files sit together',()=>{
  const l=newLayout();for(const f of files)place(l,f);for(let i=0;i<120;i++)place(l,`src/${['ui','api','data'][i%3]}/sub${i%4}/f${i}.ts`);
  for(const m of Object.values(l.modules))for(const [dq,dr] of DIRS){const n=l.cells[`${m.q+dq},${m.r+dr}`];if(n)assert.equal(l.modules[n].group,m.group,'neighbouring cells belong to one district');}
  const ui=Object.values(l.modules).filter(m=>m.group==='src/ui');
  const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
  const pairs=(same)=>mean(ui.flatMap((a,i)=>ui.slice(i+1).filter(b=>(a.dir===b.dir)===same).map(b=>hexDistance(a.q,a.r,b.q,b.r))));
  assert(pairs(true)<pairs(false),`same folder ${pairs(true).toFixed(2)} vs different ${pairs(false).toFixed(2)}`);
  assert.equal(l.modules['index.ts'].q===0&&l.modules['index.ts'].r===0,true,'root files form the core at the centre');
});
test('Removing a file frees its cell; re-adding it returns to the same place',()=>{
  const l=newLayout();for(const f of files)place(l,f);const before={...l.modules['src/ui/Card.tsx']};
  removeModule(l,'src/ui/Card.tsx');assert.equal(l.modules['src/ui/Card.tsx'],undefined);
  place(l,'src/ui/Card.tsx');assert.deepEqual([l.modules['src/ui/Card.tsx'].q,l.modules['src/ui/Card.tsx'].r],[before.q,before.r]);
});

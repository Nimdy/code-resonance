'use strict';
// scripts/check.js (npm run check): every tracked JavaScript file under its roots is checked, each the way it is loaded.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {ROOTS,files,isModule,checkFile}=require('../scripts/check');
test('check: finds every tracked JavaScript file under its roots, so a new file needs no list to be checked',t=>{
  const git=cp.spawnSync('git',['ls-files','-z','--',...ROOTS],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
  if(git.status!==0)return t.skip('not a git checkout');
  const tracked=git.stdout.split('\0').filter(f=>/\.[cm]?js$/.test(f)&&!f.startsWith('public/vendor/')),listed=new Set(files());
  assert(tracked.length>90);
  assert.deepEqual(tracked.filter(f=>!listed.has(f)),[]);
});
test('check: the browser modules are checked as ES modules, the classic scripts and what Node requires as scripts',()=>{
  for(const f of ['public/construct.js','public/ui/main.js','public/worlds/frame.js','public/worlds/life/sim.js','packs/examples/cymatic-field/world.js','packs/template/world/world.js'])assert(isModule(f),f);
  for(const f of ['public/app.js','public/score.js','public/music.js','public/recording.js','public/composition.js','receiver/server.js','extension/extension.js','scripts/check.js'])assert(!isModule(f),f);
});
test('check: an import in a script fails as it would in the browser; a syntax error fails in either mode',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-check-')),esm=path.join(dir,'esm.js'),bad=path.join(dir,'bad.js');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(esm,'import fs from "node:fs";\nexport const x=fs;\n');fs.writeFileSync(bad,'const x=(;\n');
  assert.equal(checkFile(esm,true).status,0);
  assert.notEqual(checkFile(esm,false).status,0);
  assert.notEqual(checkFile(bad,true).status,0);
  assert.notEqual(checkFile(bad,false).status,0);
});

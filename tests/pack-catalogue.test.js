'use strict';
// docs/packs/catalogue.md is generated from engine/catalog.js and the SDK version: it must say what the generator says.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const REPO=path.join(__dirname,'..');
test('pack catalogue: docs/packs/catalogue.md is what `node scripts/pack.js catalogue` prints',()=>{
  const r=cp.spawnSync(process.execPath,[path.join(REPO,'scripts/pack.js'),'catalogue'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.stdout,fs.readFileSync(path.join(REPO,'docs/packs/catalogue.md'),'utf8'),'regenerate it: node scripts/pack.js catalogue > docs/packs/catalogue.md');
});

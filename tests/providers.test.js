'use strict';
// CAST catalog: engine (CJS) and player (ESM) tables must match; the browser never imports engine/.
const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../engine/providers');
const SEATS={'claude-code':0,cursor:1,codex:2,grok:3,qwen:4,kimi:5};
test('Engine and player catalogs match on id, seat, display and chip',async()=>{
  const pub=await import('../public/providers.js');
  const fields=p=>({id:p.id,seat:p.seat,display:p.display,chip:p.chip});
  assert.deepEqual(Object.values(engine.PROVIDERS).map(fields),Object.values(pub.PROVIDERS).map(fields));
  assert.deepEqual(Object.keys(engine.PROVIDERS),Object.keys(SEATS));
  for(const [id,seat] of Object.entries(SEATS)){
    assert.equal(engine.presence(id).seat,seat,id);
    assert.equal(pub.presence(id).seat,seat,id);
    assert.equal(engine.presence(id).display,engine.PROVIDERS[id].display);
    assert.equal(engine.presence(id).chip,engine.PROVIDERS[id].chip);
  }
  assert.deepEqual(engine.UNKNOWN_SEATS,pub.UNKNOWN_SEATS);
  assert.deepEqual(engine.UNKNOWN_SEATS,[6,7]);
  const unknown=engine.presence('unknown-vendor');
  assert.equal(unknown.unknown,true);
  assert.equal(unknown.display,'Unknown Vendor');
  assert.equal(unknown.chip,'Unknown Vendor');
  assert(engine.UNKNOWN_SEATS.includes(unknown.seat));
  assert.deepEqual(fields(unknown),fields(pub.presence('unknown-vendor')));
  assert.equal(engine.presence('claude-code').unknown,undefined);
});

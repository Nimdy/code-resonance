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
  // Public words only (labels.js): an uncatalogued id never reaches a chip or a callout, only the Control Center.
  assert.equal(unknown.display,'Agent');
  assert.equal(unknown.chip,'Agent');
  assert(engine.UNKNOWN_SEATS.includes(unknown.seat));
  assert.deepEqual(fields(unknown),fields(pub.presence('unknown-vendor')));
  for(const id of ['unknown-vendor','acme-client-portal','external-agent','unspecified',undefined,'demo (fictional)'])
    for(const cat of [engine,pub]){assert.equal(cat.presence(id).display,'Agent',String(id));assert.equal(cat.presence(id).chip,'Agent',String(id));}
  assert.equal(engine.privateName('unknown-vendor'),'Unknown Vendor');
  assert.equal(pub.privateName('unknown-vendor'),'Unknown Vendor');
  for(const id of Object.keys(SEATS))assert.equal(pub.privateName(id),pub.PROVIDERS[id].display);
  assert.equal(engine.presence('claude-code').unknown,undefined);
});
test('Object members are not providers: the catalog is looked up by own keys only',async()=>{
  const pub=await import('../public/providers.js');
  for(const cat of [engine,pub]){
    for(const id of ['constructor','__proto__','toString','hasOwnProperty','valueOf']){
      const p=cat.presence(id);
      assert.equal(typeof p,'object');assert.equal(p.id,id);assert.equal(p.unknown,true);assert(cat.UNKNOWN_SEATS.includes(p.seat),id);
      assert.equal(cat.catalogued(id),false,id);
    }
    for(const id of Object.keys(SEATS))assert.equal(cat.catalogued(id),true,id);
    assert.equal(cat.catalogued(undefined),false);assert.equal(cat.catalogued('unspecified'),false);
  }
});

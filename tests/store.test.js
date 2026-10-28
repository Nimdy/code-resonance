'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const store=require('../receiver/store');
const {tempDir}=require('./helpers');
const rejects=(p,code,key)=>assert.rejects(p,e=>{assert.equal(e.code,code);if(key!==undefined)assert.equal(e.key,key);return true;});
const leftovers=async dir=>(await fs.readdir(dir)).filter(n=>n.endsWith('.tmp'));
// Warnings about invalid files are expected in some tests; keep the output readable.
function quiet(t){const warn=console.warn,seen=[];console.warn=(...a)=>seen.push(a.join(' '));t.after(()=>{console.warn=warn;});return seen;}
test('The label modes a setting accepts are the ones the world host draws',async()=>{
  assert.deepEqual(store.LABELS,(await import('../public/worlds/labels.js')).LABEL_MODES);
});
test('Settings read as the defaults at revision 0 until the first write creates the file',async t=>{
  const dir=tempDir(t,'cr-store-'),settings=store.settings(dir);
  const doc=await settings.read();
  assert.deepEqual(doc,{schema:'code-resonance.settings.v1',revision:0,...store.SETTINGS_DEFAULTS});
  await assert.rejects(fs.access(path.join(dir,'settings.json')));
  const next=await settings.update({patch:{music:{volume:.8},stage:{labels:'off'}}});
  assert.equal(next.revision,1);assert.equal(next.music.volume,.8);assert.equal(next.music.style,'ambient');assert.equal(next.stage.labels,'off');assert.equal(next.stage.world,'living');
  assert.deepEqual(await settings.read(),next);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'settings.json'),'utf8')),next);
  assert.deepEqual(await leftovers(dir),[]);
  if(process.platform!=='win32')assert.equal((await fs.stat(path.join(dir,'settings.json'))).mode&0o777,0o600);
});
test('Settings refuse unknown keys and invalid values, naming them, and change nothing',async t=>{
  const dir=tempDir(t,'cr-store-'),settings=store.settings(dir);
  await settings.update({patch:{music:{tempo:100}}});
  await rejects(settings.update({patch:{music:{loudness:1}}}),'invalid','music.loudness');
  await rejects(settings.update({patch:{theme:'dark'}}),'invalid','theme');
  await rejects(settings.update({patch:{revision:9}}),'invalid','revision');
  await rejects(settings.update({patch:JSON.parse('{"__proto__":{"polluted":true}}')}),'invalid','__proto__');
  assert.equal(({}).polluted,undefined);
  for(const [patch,key] of [[{music:{style:'jazz'}},'music.style'],[{music:{volume:1.5}},'music.volume'],[{music:{volume:'0.5'}},'music.volume'],
    [{music:{texture:-0.1}},'music.texture'],[{music:{tempoMode:'auto'}},'music.tempoMode'],[{music:{tempo:57}},'music.tempo'],[{music:{tempo:161}},'music.tempo'],
    [{music:{tempo:92.5}},'music.tempo'],[{stage:{world:'mars'}},'stage.world'],[{stage:{labels:'none'}},'stage.labels'],[{stage:{captions:'yes'}},'stage.captions'],
    [{recording:{profile:'4k'}},'recording.profile'],[{interface:{motion:'fast'}},'interface.motion'],[{onboarding:{dismissed:1}},'onboarding.dismissed'],
    [{music:null},'music'],[{music:'loud'},'music'],[{music:{volume:null}},'music.volume']])
    await rejects(settings.update({patch}),'invalid',key);
  await rejects(settings.update({patch:'x'}),'invalid','patch');
  const doc=await settings.read();assert.equal(doc.revision,1);assert.equal(doc.music.tempo,100);
  // Boundaries are inclusive.
  const edge=await settings.update({patch:{music:{tempo:58,volume:0,texture:1},stage:{world:'city',captions:false},recording:{profile:'stage'},interface:{motion:'reduce'},onboarding:{dismissed:true,migrated:true}}});
  assert.equal(edge.revision,2);assert.equal(edge.music.tempo,58);assert.equal(edge.stage.captions,false);
});
test('A stale ifRevision is refused with the current document',async t=>{
  const dir=tempDir(t,'cr-store-'),settings=store.settings(dir);
  await settings.update({patch:{music:{tempo:120}},ifRevision:0});
  await assert.rejects(settings.update({patch:{music:{tempo:130}},ifRevision:0}),e=>{
    assert.equal(e.code,'stale');assert.equal(e.status,409);assert.equal(e.current.revision,1);assert.equal(e.current.music.tempo,120);return true;});
  await rejects(settings.update({patch:{},ifRevision:'1'}),'invalid','ifRevision');
  assert.equal((await settings.update({patch:{music:{tempo:130}},ifRevision:1})).revision,2);
  // Without ifRevision the last writer wins (no conflict check).
  assert.equal((await settings.update({patch:{music:{tempo:140}}})).revision,3);
});
test('An invalid file on disk reads as the defaults, is kept aside on the next write and never crashes',async t=>{
  const warnings=quiet(t),dir=tempDir(t,'cr-store-'),file=path.join(dir,'settings.json'),settings=store.settings(dir);
  for(const text of ['{not json','[]','{"schema":"other","revision":3}','{"schema":"code-resonance.settings.v1","revision":-1}',
    JSON.stringify({schema:'code-resonance.settings.v1',revision:4,music:{tempo:999}})]){
    await fs.writeFile(file,text);
    const doc=await settings.read();
    assert.deepEqual({...doc,revision:0},{schema:'code-resonance.settings.v1',revision:0,...store.SETTINGS_DEFAULTS},text);
  }
  assert.ok(warnings.length>=5);
  // The revision of a readable-but-invalid document keeps counting up, so older clients see a conflict.
  assert.equal((await settings.read()).revision,4);
  const next=await settings.update({patch:{stage:{world:'city'}}});
  assert.equal(next.revision,5);assert.equal(next.music.tempo,92);
  assert.match(await fs.readFile(file+'.invalid','utf8'),/999/);
  // A file from an older version lacks newer keys: they read as their defaults; unknown keys on disk are dropped.
  await fs.writeFile(file,JSON.stringify({schema:'code-resonance.settings.v1',revision:7,music:{style:'chip'},legacy:true}));
  const old=await settings.read();
  assert.equal(old.revision,7);assert.equal(old.music.style,'chip');assert.equal(old.music.tempo,92);assert.equal(old.legacy,undefined);
});
test('Concurrent updates are serialized: every one applies, revisions are consecutive, no temporary file remains',async t=>{
  const dir=tempDir(t,'cr-store-');
  // Two document objects for the same file share one lock.
  const a=store.settings(dir),b=store.settings(dir);
  const tempos=Array.from({length:30},(_,i)=>60+i);
  const results=await Promise.all(tempos.map((tempo,i)=>(i%2?a:b).update({patch:{music:{tempo}}})));
  assert.deepEqual(results.map(r=>r.revision).sort((x,y)=>x-y),tempos.map((_,i)=>i+1));
  const final=await a.read();assert.equal(final.revision,30);assert.equal(final.music.tempo,results.find(r=>r.revision===30).music.tempo);
  // Conditional writers racing on one revision: exactly one wins.
  const raced=await Promise.allSettled([1,2,3].map(n=>a.update({patch:{stage:{labels:['explorer','stream','off'][n-1]}},ifRevision:30})));
  assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
  assert.ok(raced.filter(r=>r.status==='rejected').every(r=>r.reason.code==='stale'));
  assert.deepEqual(await leftovers(dir),[]);
});
// The composed score's profile and mix in a project's preferences: all inherit (null) until the project sets them.
const INHERIT_PROFILE={mood:null,evolution:null,melody:null,rhythm:null,atmosphere:null,harmony:null,dynamics:null,space:null,mix:null};
test('Preferences: null inherits, a whole section can be cleared, the file lives in the project directory',async t=>{
  const dir=path.join(tempDir(t,'cr-store-'),'projects','abc'),prefs=store.preferences(dir);
  assert.deepEqual(await prefs.read(),{schema:'code-resonance.preferences.v1',revision:0,world:null,music:{style:null,texture:null,tempoMode:null,tempo:null,...INHERIT_PROFILE}});
  let doc=await prefs.update({patch:{world:'construct',music:{style:'pulse',tempo:120,tempoMode:'manual'}}});
  assert.deepEqual({world:doc.world,music:doc.music},{world:'construct',music:{style:'pulse',texture:null,tempoMode:'manual',tempo:120,...INHERIT_PROFILE}});
  doc=await prefs.update({patch:{world:null,music:{tempo:null}}});
  assert.equal(doc.world,null);assert.equal(doc.music.tempo,null);assert.equal(doc.music.style,'pulse');
  doc=await prefs.update({patch:{music:null}});
  assert.deepEqual(doc.music,{style:null,texture:null,tempoMode:null,tempo:null,...INHERIT_PROFILE});assert.equal(doc.revision,3);
  for(const [patch,key] of [[{world:'mars'},'world'],[{music:{volume:.5}},'music.volume'],[{music:{texture:2}},'music.texture'],[{music:{tempo:'fast'}},'music.tempo'],[{stage:{}},'stage']])
    await rejects(prefs.update({patch}),'invalid',key);
  assert.ok(JSON.parse(await fs.readFile(path.join(dir,'preferences.json'),'utf8')).revision===3);
});
test('Nexus and Nebula, retired, read as Monolith without a rewrite or a warning; a write cannot choose them',async t=>{
  const warnings=quiet(t),dir=tempDir(t,'cr-store-'),file=path.join(dir,'settings.json'),pdir=path.join(dir,'projects','abc'),pfile=path.join(pdir,'preferences.json');
  const settings=store.settings(dir),prefs=store.preferences(pdir);
  const text=JSON.stringify({schema:'code-resonance.settings.v1',revision:6,...store.SETTINGS_DEFAULTS,stage:{...store.SETTINGS_DEFAULTS.stage,world:'nebula'}});
  const ptext=JSON.stringify({schema:'code-resonance.preferences.v1',revision:2,...store.PREFERENCES_DEFAULTS,world:'nexus'});
  await fs.writeFile(file,text);await fs.mkdir(pdir,{recursive:true});await fs.writeFile(pfile,ptext);
  assert.deepEqual(store.WORLDS,['living','construct','city']);assert.deepEqual(store.RETIRED_WORLDS,{nexus:'city',nebula:'city'});
  const doc=await settings.read(),p=await prefs.read();
  assert.deepEqual([doc.revision,doc.stage.world,p.revision,p.world],[6,'city',2,'city']);
  assert.deepEqual(warnings,[],'valid documents');
  assert.equal(await fs.readFile(file,'utf8'),text);assert.equal(await fs.readFile(pfile,'utf8'),ptext,'reading never rewrites');
  for(const w of ['nexus','nebula']){await rejects(settings.update({patch:{stage:{world:w}}}),'invalid','stage.world');await rejects(prefs.update({patch:{world:w}}),'invalid','world');}
  assert.equal(await fs.readFile(pfile,'utf8'),ptext,'a refused write changes nothing');
  // The next write stores what every reader was shown.
  assert.equal((await prefs.update({patch:{music:{tempo:110}}})).world,'city');assert.equal(JSON.parse(await fs.readFile(pfile,'utf8')).world,'city');
  assert.equal((await settings.update({patch:{music:{tempo:90}}})).stage.world,'city');assert.equal(JSON.parse(await fs.readFile(file,'utf8')).stage.world,'city');
});
test('Presets: create, rename, update and delete, with exact payload validation',async t=>{
  const dir=tempDir(t,'cr-store-');let clock=1000;
  const presets=store.presets(dir,{now:()=>clock++});
  assert.deepEqual(await presets.read(),{schema:'code-resonance.presets.v1',revision:0,presets:[]});
  const visual={family:'stellar',look:'pack.cymatic-field',tuning:{'geometry.scale':1.2,'palette.primary':'#ff8800','light.on':true,'atmosphere.tint':[0.1,0.2,0.3]},overrides:{intensity:1.5,motion:0,labels:'stream'}};
  let doc=await presets.update({patch:{action:'create',kind:'visual',name:"Night & Day (v2)",payload:visual}});
  const [p]=doc.presets;
  assert.match(p.id,/^p-[0-9a-f]{12}$/);assert.equal(p.kind,'visual');assert.equal(p.name,'Night & Day (v2)');assert.deepEqual(p.payload,visual);
  assert.equal(p.createdAt,p.updatedAt);
  doc=await presets.update({patch:{action:'create',kind:'music',name:'Café calme',payload:{style:'chip',texture:.3,tempoMode:'manual',tempo:100}},ifRevision:1});
  assert.equal(doc.presets.length,2);assert.equal(doc.revision,2);
  // Missing visual fields normalise to "nothing set".
  doc=await presets.update({patch:{action:'create',kind:'visual',name:'Bare',payload:{}}});
  assert.deepEqual(doc.presets[2].payload,{family:null,look:null,tuning:{},overrides:{}});
  doc=await presets.update({patch:{action:'rename',id:p.id,name:'  Renamed  '}});
  assert.equal(doc.presets[0].name,'Renamed');assert.ok(doc.presets[0].updatedAt>doc.presets[0].createdAt);
  doc=await presets.update({patch:{action:'update',id:p.id,payload:{family:null,overrides:{labels:'off'}}}});
  assert.deepEqual(doc.presets[0].payload,{family:null,look:null,tuning:{},overrides:{labels:'off'}});
  // An update is validated against the preset's own kind.
  await rejects(presets.update({patch:{action:'update',id:doc.presets[1].id,payload:visual}}),'invalid','payload.family');
  doc=await presets.update({patch:{action:'delete',id:p.id}});
  assert.deepEqual(doc.presets.map(x=>x.name),['Café calme','Bare']);
  await rejects(presets.update({patch:{action:'delete',id:p.id}}),'not-found','id');
  await rejects(presets.update({patch:{action:'rename',id:'p-000000000000',name:'X'}}),'not-found','id');
  const bad=[
    [{action:'explode'},'action'],[{action:'create',kind:'audio',name:'X',payload:{}},'kind'],
    [{action:'create',kind:'visual',name:'',payload:{}},'name'],[{action:'create',kind:'visual',name:'x'.repeat(41),payload:{}},'name'],
    [{action:'create',kind:'visual',name:'<script>',payload:{}},'name'],[{action:'create',kind:'visual',name:'a/b',payload:{}},'name'],
    [{action:'create',kind:'visual',name:'X',payload:{},extra:1},'extra'],
    [{action:'create',kind:'visual',name:'X',payload:{family:'Stellar'}},'payload.family'],
    [{action:'create',kind:'visual',name:'X',payload:{family:'a'.repeat(65)}},'payload.family'],
    [{action:'create',kind:'visual',name:'X',payload:{look:'../x'}},'payload.look'],
    [{action:'create',kind:'visual',name:'X',payload:{genome:{}}},'payload.genome'],
    [{action:'create',kind:'visual',name:'X',payload:{tuning:{'bad path':1}}},'payload.tuning.bad path'],
    // A JSON body's "__proto__" is an own key: it must be refused, not set the prototype (or vanish).
    [{action:'create',kind:'visual',name:'X',payload:{tuning:JSON.parse('{"__proto__":1}')}},'payload.tuning.__proto__'],
    [{action:'create',kind:'visual',name:'X',payload:{tuning:{['a'.repeat(65)]:1}}},'payload.tuning.'+'a'.repeat(64)],
    [{action:'create',kind:'visual',name:'X',payload:{tuning:{'a.b':'x'.repeat(17)}}},'payload.tuning.a.b'],
    [{action:'create',kind:'visual',name:'X',payload:{tuning:{'a.b':[1,2]}}},'payload.tuning.a.b'],
    [{action:'create',kind:'visual',name:'X',payload:{tuning:{'a.b':[1,2,'3']}}},'payload.tuning.a.b'],
    [{action:'create',kind:'visual',name:'X',payload:{tuning:{'a.b':null}}},'payload.tuning.a.b'],
    [{action:'create',kind:'visual',name:'X',payload:{tuning:{'a.b':{}}}},'payload.tuning.a.b'],
    [{action:'create',kind:'visual',name:'X',payload:{tuning:Object.fromEntries(Array.from({length:129},(_,i)=>[`k${i}`,i]))}},'payload.tuning'],
    [{action:'create',kind:'visual',name:'X',payload:{overrides:{intensity:2.5}}},'payload.overrides.intensity'],
    [{action:'create',kind:'visual',name:'X',payload:{overrides:{motion:-1}}},'payload.overrides.motion'],
    [{action:'create',kind:'visual',name:'X',payload:{overrides:{labels:'loud'}}},'payload.overrides.labels'],
    [{action:'create',kind:'visual',name:'X',payload:{overrides:{speed:1}}},'payload.overrides.speed'],
    [{action:'create',kind:'music',name:'X',payload:{style:'chip',texture:.3,tempoMode:'manual'}},'payload.tempo'],
    [{action:'create',kind:'music',name:'X',payload:{style:'chip',texture:.3,tempoMode:'manual',tempo:200}},'payload.tempo'],
    [{action:'create',kind:'music',name:'X',payload:{style:'chip',texture:.3,tempoMode:'manual',tempo:100,volume:1}},'payload.volume'],
    [{action:'create',kind:'music',name:'X',payload:null},'payload']];
  for(const [patch,key] of bad)await rejects(presets.update({patch}),'invalid',key);
  assert.equal((await presets.read()).revision,6);
});
test('Presets are limited to 200 and an invalid presets file reads as empty',async t=>{
  quiet(t);const dir=tempDir(t,'cr-store-'),file=path.join(dir,'presets.json');
  const many=Array.from({length:200},(_,i)=>({id:`p-${i.toString(16).padStart(12,'0')}`,kind:'music',name:`Preset ${i}`,createdAt:1,updatedAt:1,payload:{style:'ambient',texture:.5,tempoMode:'project',tempo:92}}));
  await fs.writeFile(file,JSON.stringify({schema:'code-resonance.presets.v1',revision:9,presets:many}));
  const presets=store.presets(dir);
  assert.equal((await presets.read()).presets.length,200);
  await rejects(presets.update({patch:{action:'create',kind:'music',name:'One more',payload:many[0].payload}}),'invalid','presets');
  // Duplicate ids make the file invalid as a whole.
  await fs.writeFile(file,JSON.stringify({schema:'code-resonance.presets.v1',revision:9,presets:[many[0],many[0]]}));
  const doc=await presets.read();assert.deepEqual(doc.presets,[]);assert.equal(doc.revision,9);
});
test('The music profile and mix: saved globally, per project (null inherits) and in presets; the mix is one value',async t=>{
  const root=tempDir(t,'cr-store-'),settings=store.settings(root),prefs=store.preferences(path.join(root,'projects','abc'));
  // The receiver's lists are the score's own.
  const score=require('../public/score');
  assert.deepEqual(store.PROFILE_KEYS,Object.keys(score.PROFILE));assert.deepEqual(store.MIX_GROUPS,score.GROUPS);
  assert.deepEqual(store.SETTINGS_DEFAULTS.music.mix,score.profileOf(null).mix,'the default mix is the score\'s: everything as composed');
  for(const k of store.PROFILE_KEYS)assert.equal(store.SETTINGS_DEFAULTS.music[k],score.PROFILE[k]);
  // Global: a field patch keeps the rest; the mix merges by group and is validated whole.
  let s=await settings.update({patch:{music:{mood:.8,space:.2,mix:{perc:0,atmos:1.4}}}});
  assert.equal(s.music.mood,.8);assert.equal(s.music.space,.2);assert.equal(s.music.melody,.5);assert.equal(s.music.style,'ambient');
  assert.deepEqual(s.music.mix,{pad:1,bass:1,melody:1,counter:1,arp:1,perc:0,atmos:1.4});
  s=await settings.update({patch:{music:{mix:{bass:.6}}}});assert.deepEqual(s.music.mix,{pad:1,bass:.6,melody:1,counter:1,arp:1,perc:0,atmos:1.4});
  for(const [patch,key] of [[{music:{mood:1.2}},'music.mood'],[{music:{harmony:'rich'}},'music.harmony'],[{music:{space:null}},'music.space'],
    [{music:{mix:{perc:1.6}}},'music.mix.perc'],[{music:{mix:{perc:-.1}}},'music.mix.perc'],[{music:{mix:{drums:1}}},'music.mix.drums'],[{music:{mix:null}},'music.mix'],[{music:{mix:[1]}},'music.mix']])
    await assert.rejects(settings.update({patch}),e=>e.code==='invalid'&&e.key===key,key);
  assert.equal((await settings.read()).revision,2,'refused writes change nothing');
  // A settings file from before the profile reads with it as composed.
  await fs.writeFile(settings.file,JSON.stringify({schema:'code-resonance.settings.v1',revision:9,music:{style:'chip',volume:.4,texture:.3,tempoMode:'project',tempo:92}}));
  const old=await settings.read();assert.equal(old.revision,9);assert.equal(old.music.style,'chip');assert.equal(old.music.rhythm,.5);assert.deepEqual(old.music.mix,store.SETTINGS_DEFAULTS.music.mix);
  // Per project: each control inherits until set; the mix replaces as one value (groups left out play as composed).
  let p=await prefs.update({patch:{music:{evolution:.9,mix:{melody:1.3,perc:0}}}});
  assert.equal(p.music.evolution,.9);assert.equal(p.music.mood,null);assert.deepEqual(p.music.mix,{pad:1,bass:1,melody:1.3,counter:1,arp:1,perc:0,atmos:1});
  p=await prefs.update({patch:{music:{mix:{arp:.5}}}});assert.deepEqual(p.music.mix,{pad:1,bass:1,melody:1,counter:1,arp:.5,perc:1,atmos:1});
  p=await prefs.update({patch:{music:{evolution:null,mix:null}}});assert.equal(p.music.evolution,null);assert.equal(p.music.mix,null);
  for(const [patch,key] of [[{music:{dynamics:2}},'music.dynamics'],[{music:{mix:{lead:1}}},'music.mix.lead'],[{music:{mix:{pad:'1'}}},'music.mix.pad'],[{music:{mix:3}},'music.mix']])
    await assert.rejects(prefs.update({patch}),e=>e.code==='invalid'&&e.key===key,key);
  // Presets: a preset saved before the profile is valid and keeps its exact shape; a new one carries profile and mix.
  const presets=store.presets(root,{now:()=>5});
  const before={style:'chip',texture:.3,tempoMode:'manual',tempo:100};
  let doc=await presets.update({patch:{action:'create',kind:'music',name:'Before',payload:before}});
  assert.deepEqual(doc.presets[0].payload,before);
  const full={style:'cinematic',texture:.62,tempoMode:'project',tempo:92,profile:{mood:.6,evolution:.7,melody:.7,rhythm:.5,atmosphere:.6,harmony:.75,dynamics:.8,space:.8},mix:{pad:1,bass:.9,melody:1.1,counter:1.15,arp:.85,perc:.9,atmos:1.1}};
  doc=await presets.update({patch:{action:'create',kind:'music',name:'Opening',payload:full}});
  assert.deepEqual(doc.presets[1].payload,full);
  // A partial profile is completed as composed; the update path validates the same way.
  doc=await presets.update({patch:{action:'update',id:doc.presets[0].id,payload:{...before,profile:{rhythm:.8}}}});
  assert.deepEqual(doc.presets[0].payload.profile,{...score.PROFILE,rhythm:.8});assert.equal(doc.presets[0].payload.mix,undefined);
  for(const [payload,key] of [[{...before,profile:{tempo:1}},'payload.profile.tempo'],[{...before,profile:{mood:-1}},'payload.profile.mood'],[{...before,profile:null},'payload.profile'],
    [{...before,mix:{perc:9}},'payload.mix.perc'],[{...before,mix:{kick:0}},'payload.mix.kick'],[{...before,key:'D'},'payload.key'],[{...before,motif:[0,2]},'payload.motif']])
    await assert.rejects(presets.update({patch:{action:'create',kind:'music',name:'X',payload}}),e=>e.code==='invalid'&&e.key===key,key);
  // The file round-trips (validated on read as on write).
  assert.deepEqual((await presets.read()).presets.map(x=>x.payload),doc.presets.map(x=>x.payload));
});

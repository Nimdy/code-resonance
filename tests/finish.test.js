'use strict';
// Finishes (public/worlds/host.js FINISHES, withTechnique; public/worlds/core.js, the finished composite): Classic or
// no finish is the grade and the composite exactly as before Phase 11; a finish adds its lens and colour, scaled by the
// creator's chromatic aberration. The rendered look is judged on screen; these are the pure parts.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const catalog=require('../engine/catalog');
const load=()=>import('../public/worlds/host.js');
// withTechnique as it was before finishes (Phase 10, public/worlds/host.js), the reference for every recipe without one.
function before(THREE,g,t){
  if(!t)return g;g={...g};
  for(const [k,d] of [['exposure',1],['bloom',1],['contrast',1],['saturation',1.05],['vignette',.3],['grain',.025]])if(Number.isFinite(t[k]))g[k]=(g[k]??d)*t[k];
  if(Number.isFinite(t.aberration))g.aberration=t.aberration;
  if(Array.isArray(t.tint))g.tint=(g.tint?g.tint.clone():new THREE.Vector3(1,1,1)).multiply(new THREE.Vector3(...t.tint));
  if(Array.isArray(t.lift))g.lift=(g.lift?g.lift.clone():new THREE.Vector3()).add(new THREE.Vector3(...t.lift));
  return g;
}
const PALETTE={deep:'#0b1622',highlight:'#ffe7c4',accent:'#58d0ff'};
async function grades(){const {THREE}=await import('../public/worlds/core.js');
  return {THREE,list:[{},{tonemap:'agx',bloom:1.1,threshold:.6,exposure:1.3,contrast:1.12,saturation:.9,vignette:.45,grain:.02,streak:.05,tint:new THREE.Vector3(1.02,1,.98),lift:new THREE.Vector3(0,.001,.003),bloomTint:new THREE.Vector3(1,.95,.93)},
    {tonemap:'agx',bloom:.6,exposure:1.4,aberration:.0022,waves:[{x:.5,y:.5,r:.2,a:.4}],rays:[{x:.4,y:.6,strength:.05,color:{x:1,y:.86,z:.68}}]}]};}
test('Without a finish, or with Classic, the technique gives exactly the grade it always did',async()=>{
  const {withTechnique}=await load(),{THREE,list}=await grades();
  const techniques=[undefined,null,{},{saturation:.85},{saturation:.82,tint:[1.1,.97,.86],lift:[.012,.004,0],grain:1.4,aberration:.007,vignette:1.3},{exposure:1.15,bloom:0,aberration:0}];
  for(const g of list)for(const t of techniques){
    const now=withTechnique(g,t,PALETTE),then=before(THREE,g,t);
    assert.deepEqual(now,then,JSON.stringify(t));
    if(!t)assert.equal(now,g,'no technique: the very same object');
    // Classic is the absence of a finish, whatever else the technique holds; so is a finish this version does not know.
    for(const finish of ['classic','neon','constructor','__proto__'])if(t)assert.deepEqual(withTechnique(g,{...t,finish},PALETTE),then,`${finish} ${JSON.stringify(t)}`);
  }
  assert.equal('finish' in withTechnique(list[1],{finish:'classic'}),false,'the classic composite is drawn');
});
test('Clean, Cinematic and Dreamlike master the grade in increasing measure; the creator\'s aberration scales the lens and 0 turns it off',async()=>{
  const {withTechnique,FINISHES}=await load(),{list}=await grades();
  assert.deepEqual(['classic',...Object.keys(FINISHES)],catalog.COMMON['technique.finish'].values,'every finish of the catalogue (Classic is none)');
  const world=list[1],[clean,cinematic,dreamlike]=['clean','cinematic','dreamlike'].map(finish=>withTechnique(world,{finish},PALETTE));
  for(const g of [clean,cinematic,dreamlike]){assert.equal(g.finish,true);assert.equal(g.tonemap,'agx');for(const k of ['optical','fringe','halation','split','mist'])assert(Number.isFinite(g[k])&&g[k]>=0,k);}
  assert(clean.optical<cinematic.optical&&cinematic.optical<dreamlike.optical,'fringe: minimal, subtle, artistic');
  assert(clean.optical*1080<1,'Clean\'s fringe stays under a pixel in the corners at 1080p');
  assert(cinematic.optical*1080>1.5&&cinematic.optical*1080<4,`Cinematic's fringe is subtle: ${(cinematic.optical*1080).toFixed(1)} px in the corners at 1080p`);
  assert(clean.halation===0&&cinematic.halation>0&&dreamlike.halation>cinematic.halation,'halation: none, warm, stronger');
  assert(clean.mist===0&&cinematic.mist===0&&dreamlike.mist>0,'only Dreamlike diffuses');
  assert(clean.bloom<world.bloom&&dreamlike.bloom>world.bloom&&clean.grain<cinematic.grain&&clean.threshold>world.threshold,'Clean restrains the bloom and grain; Dreamlike is luminous');
  assert(cinematic.vignette<world.vignette,'a gentler vignette');
  // Warm halation; split toning carries hue only (no luminance shift) and leans cool in the shadows, warm in the light.
  const y=v=>v.x*.2126+v.y*.7152+v.z*.0722;
  assert(cinematic.halationTint.x>cinematic.halationTint.y&&cinematic.halationTint.y>cinematic.halationTint.z);
  assert(Math.abs(y(cinematic.splitShadow))<1e-9&&Math.abs(y(cinematic.splitHigh))<1e-9);
  assert(cinematic.splitShadow.z>cinematic.splitShadow.x&&cinematic.splitHigh.x>cinematic.splitHigh.z);
  // A grey palette still separates (the film directions); an invalid colour is never parsed.
  for(const palette of [{deep:'#202020',highlight:'#e0e0e0'},{deep:'red',highlight:'url(x)'},null]){const g=withTechnique(world,{finish:'cinematic'},palette);
    assert(g.splitShadow.length()>.04&&g.splitHigh.length()>.02,JSON.stringify(palette));}
  // The creator's strength: 0.004 is the finish as designed, 0 turns the fringe off (bloom fringe included: it is a
  // multiple of the lens's offset); a world's own lighter fringe (Stellar Forge: 0.0022) holds until one is set.
  assert.equal(withTechnique(world,{finish:'cinematic',aberration:.004}).optical,cinematic.optical);
  assert.equal(withTechnique(world,{finish:'cinematic',aberration:.008}).optical,cinematic.optical*2);
  assert.equal(withTechnique(world,{finish:'dreamlike',aberration:0}).optical,0);
  assert(Math.abs(withTechnique(list[2],{finish:'cinematic'}).optical-FINISHES.cinematic.optical*.55)<1e-12);
  // The creator's multipliers still apply on top of the finish; the world's own grade is never changed in place.
  const tuned=withTechnique(world,{finish:'cinematic',saturation:.5,tint:[1.2,1,1]});
  assert.equal(tuned.saturation,cinematic.saturation*.5);assert.equal(tuned.tint.x,world.tint.x*1.2);assert.equal(world.tint.x,1.02);assert.equal('finish' in world,false);
  // Waves, rays and flashes are the world's: a finish leaves them as they are.
  const s=withTechnique(list[2],{finish:'dreamlike'});assert.equal(s.waves,list[2].waves);assert.equal(s.rays,list[2].rays);
});
test('The classic composite is the Phase 10 shader token for token; the finished one only adds to it',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../public/worlds/core.js'),'utf8');
  const shader=src.slice(src.indexOf('const COMPOSITE=`')+17);const COMPOSITE=shader.slice(0,shader.indexOf('`;'));
  // The GLSL preprocessor's view of the source with and without FINISH defined.
  const pre=(text,defined)=>{const out=[],stack=[];for(const line of text.split('\n')){const t=line.trim();
    if(t.startsWith('#ifdef ')){const on=defined.includes(t.slice(7).trim());stack.push({on,taken:on});continue;}
    if(t==='#else'){const s=stack.at(-1);s.on=!s.taken;continue;}
    if(t==='#endif'){stack.pop();continue;}
    if(stack.every(s=>s.on))out.push(line);}
    assert.equal(stack.length,0,'balanced #ifdef / #endif');return out.join('\n');};
  const tokens=s=>s.replace(/\/\/.*$/gm,'').replace(/\s+/g,' ').trim();
  assert.equal(crypto.createHash('sha256').update(tokens(pre(COMPOSITE,[]))).digest('hex').slice(0,16),'77e67e327e7062c4');
  const finished=tokens(pre(COMPOSITE,['FINISH']));
  for(const k of ['uniform float optical,fringe,halation,split,mist','vec3 col=lens(uv,off)','vec3 tight=max(bl-wd,0.)','if(split>0.)'])assert(finished.includes(k),k);
  assert(!/[^\x09\x0a\x0d\x20-\x7e]/.test(COMPOSITE.replace(/\\`/g,'')),'plain ASCII GLSL (comments included)');
  // The finish adds no render target: the pipeline still allocates exactly the Phase 10 set.
  assert.equal((src.match(/new THREE\.WebGLRenderTarget\(/g)||[]).length,5,'scene, background, the bloom chain and the packs\' post targets');
});

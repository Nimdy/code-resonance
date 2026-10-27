#!/usr/bin/env node
'use strict';
// Visual packs from the command line (local only: nothing is downloaded or published).
//   node scripts/pack.js new <dir> --kind world|shader|declarative --id <author.name> [--name "Display Name"]
//   node scripts/pack.js validate <dir>
//   node scripts/pack.js install <dir>          copy into <data>/packs/<id> (code packs start unapproved)
//   node scripts/pack.js list
//   node scripts/pack.js approve <id> [--yes]   allow an installed shader / world pack to run (its exact files)
//   node scripts/pack.js revoke <id>
//   node scripts/pack.js remove <id>
//   node scripts/pack.js test <dir> [--gpu amd] [--quick] compatibility tests in a real browser (needs qualification/ npm ci)
//   node scripts/pack.js catalogue              print the parameter catalogue (docs/packs/catalogue.md)
// --data <dir> selects the receiver data directory (default: $RESONANCE_DATA or ~/.code-resonance).
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const readline=require('node:readline');
const cp=require('node:child_process');
const packs=require('../engine/packs');
const args=process.argv.slice(2);
const flag=k=>{const i=args.indexOf(`--${k}`);return i<0?undefined:args[i+1];};
const has=k=>args.includes(`--${k}`);
const positional=args.filter((a,i)=>!a.startsWith('--')&&!(i>0&&args[i-1].startsWith('--')&&!['--yes'].includes(args[i-1])));
const [command,target]=positional;
const DATA=path.resolve(flag('data')||process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'));
const GPU_WARNING=[
  'Code in a visual pack runs in a worker inside an isolated frame: no network access, no access to the receiver, your',
  'files, your recordings or the player; it receives only the privacy-safe performance view (salted ids, counts, timings).',
  'Browsers cannot fully sandbox GPU shaders: a hostile or buggy shader can freeze or crash the browser tab or the',
  'graphics driver, and GPU timing can leak coarse information between pages. A pack that hangs is stopped after 6 s but',
  'can keep a processor core busy a few seconds longer. Browser bugs remain possible.',
  'Approve only packs from authors you trust. Any change to any file of the pack needs a new approval.'];
function print(report){
  const m=report.manifest||{};
  console.log(`${m.id||'(no id)'} ${m.version||''} · ${m.kind||'?'} · ${report.files.length} files · digest ${report.digest?.slice(0,16)}`);
  for(const w of report.warnings)console.log(`  warning: ${w}`);
  for(const e of report.errors)console.log(`  error: ${e.at}: ${e.message}`);
}
async function confirm(question){
  if(has('yes'))return true;if(!process.stdin.isTTY)return false;
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  const answer=await new Promise(r=>rl.question(`${question} [y/N] `,r));rl.close();return /^y(es)?$/i.test(answer.trim());
}
function scaffold(dir,kind,id,name){
  const from=path.join(__dirname,'..','packs','template',kind);
  if(!fs.existsSync(from))throw new Error(`Unknown kind "${kind}" (world, shader or declarative)`);
  if(fs.existsSync(dir)&&fs.readdirSync(dir).length)throw new Error(`${dir} is not empty`);
  fs.cpSync(from,dir,{recursive:true});
  const file=path.join(dir,'pack.json'),m=JSON.parse(fs.readFileSync(file,'utf8'));
  m.id=id;if(name)m.name=name;if(m.world?.family&&name)m.world.family.name=name;
  fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');
  return m;
}
(async()=>{
  switch(command){
    case 'new':{
      if(!target||!flag('id'))throw new Error('usage: pack.js new <dir> --kind world|shader|declarative --id <author.name> [--name "Display Name"]');
      const m=scaffold(path.resolve(target),flag('kind')||'world',flag('id'),flag('name'));
      const report=packs.inspect(path.resolve(target));print(report);
      console.log(`Created ${m.kind} pack ${m.id} in ${target}. Edit it, then: node scripts/pack.js test ${target}`);
      process.exitCode=report.errors.length?1:0;return;}
    case 'validate':{if(!target)throw new Error('usage: pack.js validate <dir>');
      const report=packs.inspect(path.resolve(target),packs.createRegistry(DATA).snapshot());print(report);
      console.log(report.errors.length?'INVALID':'valid');process.exitCode=report.errors.length?1:0;return;}
    case 'install':{if(!target)throw new Error('usage: pack.js install <dir>');
      const r=packs.install(target,DATA);
      console.log(`Installed ${r.id} ${r.version} (${r.kind}) into ${path.join(packs.packsDir(DATA),r.id)}`);
      for(const w of r.warnings)console.log(`  warning: ${w}`);
      if(r.executable&&!r.trusted)console.log(`This pack contains code. It will not run until you approve it: node scripts/pack.js approve ${r.id} (or Review in the Control Center's Visual Packs).`);
      return;}
    case 'list':{
      const list=packs.createRegistry(DATA).list();
      if(!list.length){console.log(`No visual packs installed in ${packs.packsDir(DATA)}`);return;}
      for(const p of list)console.log(`${p.id.padEnd(32)} ${p.version.padEnd(8)} ${p.kind.padEnd(12)} ${p.executable?(p.trusted?'approved':'NOT APPROVED'):'data only'}${p.ok?'':'  PROBLEMS: '+p.problems.join('; ')}`);
      return;}
    case 'approve':{if(!target)throw new Error('usage: pack.js approve <id> [--yes]');
      const p=packs.createRegistry(DATA).get(target);if(!p)throw new Error(`Pack ${target} is not installed`);
      if(!p.executable){console.log(`${p.id} contains no code and needs no approval.`);return;}
      if(!p.ok)throw new Error(`${p.id} has problems and cannot be approved:\n  ${p.problems.join('\n  ')}`);
      console.log(`${p.name} ${p.version} by ${p.author?.name||'unknown author'} (${p.id})\nFiles (digest ${p.digest}):`);
      for(const f of p.files)console.log(`  ${f.path.padEnd(40)} ${String(f.size).padStart(8)} B  ${f.sha256.slice(0,16)}`);
      console.log('\n'+GPU_WARNING.join('\n')+'\n');
      if(!await confirm(`Allow ${p.id} to run?`)){console.log('Not approved.');process.exitCode=1;return;}
      packs.setTrust(p.id,DATA,{digest:p.digest,trusted:true});console.log(`Approved ${p.id} (digest ${p.digest.slice(0,16)}).`);return;}
    case 'revoke':{if(!target)throw new Error('usage: pack.js revoke <id>');packs.setTrust(target,DATA,{trusted:false});console.log(`Revoked ${target}.`);return;}
    case 'remove':{if(!target)throw new Error('usage: pack.js remove <id>');packs.remove(target,DATA);console.log(`Removed ${target}.`);return;}
    case 'test':{if(!target)throw new Error('usage: pack.js test <dir> [--gpu amd] [--quick]');
      const harness=path.join(__dirname,'..','qualification','visual','pack.qual.js');
      if(!fs.existsSync(path.join(__dirname,'..','qualification','node_modules','playwright-core')))throw new Error('Run "npm ci" in qualification/ first (it provides the headless browser driver).');
      const r=cp.spawnSync(process.execPath,[harness,path.resolve(target),...(flag('gpu')?['--gpu',flag('gpu')]:[]),...(process.argv.includes('--quick')?['--quick']:[])],{stdio:'inherit',cwd:path.join(__dirname,'..','qualification')});
      process.exitCode=r.status??1;return;}
    case 'catalogue':{
      const catalog=require('../engine/catalog');const out=[`# Parameter catalogue (SDK ${packs.SDK_VERSION}, catalogue ${catalog.CATALOG_VERSION})`,'',
        'Generated by `node scripts/pack.js catalogue` from `engine/catalog.js`: every genome parameter a declarative or shader pack may set on a',
        'built-in family, with its range (every family is rendered with all parameters at their minimum and at their maximum in','`qualification/visual/catalogue.qual.js`). Numbers also accept `[min, max]`: the recipe draws a value per project.',''];
      const fmt=s=>s.type==='enum'?s.values.map(v=>`\`${v}\``).join(', '):s.type==='color'?'`#rrggbb`':s.type==='boolean'?'true / false':s.type==='vec3'?`[r, g, b], each ${s.min} … ${s.max}`:`${s.type} ${s.min} … ${s.max}`;
      for(const [id,f] of Object.entries(catalog.FAMILIES)){
        out.push(`## ${f.name} (\`${id}\`)`,'','| Parameter | Values | What it does |','|---|---|---|');
        for(const [k,spec] of Object.entries(f.parameters))out.push(`| \`${k}\` | ${fmt(spec)} | ${spec.doc||''} |`);
        out.push('',`Effect presets (in the order of the intents they express by default): ${f.effects.map((e,i)=>`\`${e}\` (${catalog.EFFECT_TYPES[i]}, ${catalog.EFFECT_CLASS[catalog.EFFECT_TYPES[i]]})`).join(', ')}.`,'',
          `Ambient layers unlocked by verified milestones, in order: ${f.unlocks.map(u=>`\`${u}\``).join(', ')}.`,'');}
      out.push('## Effect polarity','','An intent may only be expressed by an effect of the same class: a failure never looks like success, a removal never looks like growth.','',
        '| Intent | Class |','|---|---|',...catalog.EFFECT_TYPES.map(t=>`| \`${t}\` | ${catalog.EFFECT_CLASS[t]} |`),'');
      process.stdout.write(out.join('\n'));return;}
    default:
      console.log(fs.readFileSync(__filename,'utf8').split('\n').slice(2,13).map(l=>l.replace(/^\/\/ ?/,'')).join('\n'));process.exitCode=command?1:0;
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});

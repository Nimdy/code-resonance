'use strict';
// Genesis field proof: the inputs of one identity, from a recorded dataset (visual/datasets.js), as the receiver serves
// them. Structure only: subsystems by order of birth (file counts, role), dependencies between them (file-level counts),
// the Lawbook (the genesis recipe's laws), the score's identity and the timeline frames the score is conducted from. No
// names, paths or source: subsystems and files are counted, never named.
//
// node visual/genesis-field/prep.js <dataset> [--list] [--change <index>] [--out <file>]
//   --list     the architectural changes in the recording (a new subsystem, a new dependency between subsystems)
//   --change   which of them the proof applies (default: the first dependency between two existing subsystems)
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const H=require('../harness.js');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const ds=process.argv[2]||'lumen';
const SRC=path.join(__dirname,'..','..','results','datasets',ds);
(async()=>{
  const {createModel}=await import(path.join(H.REPO,'public/worlds/model.js'));
  const V=await import(path.join(H.REPO,'public/worlds/view.js'));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-gf-prep-'));fs.cpSync(SRC,dir,{recursive:true});
  try{await H.withService(dir,async svc=>{
    const project=H.projectOf(dir),base=`http://127.0.0.1:${svc.port}`;
    await H.setFamily(svc,project,'genesis');
    const recipe=await (await fetch(`${base}/api/recipe?id=${project}`)).json();
    const entries=[];let after=-1;
    for(;;){const p=await (await fetch(`${base}/api/timeline?id=${project}&after=${after}&limit=1000`)).json();entries.push(...p.entries);if(!p.entries.length||entries.length>=p.total)break;after=p.entries.at(-1).seq;}
    // The model as the world builds it (host.js: reset, then each window's graph and cues).
    const model=createModel();model.reset({nodes:[],edges:[]},0);
    for(const e of entries){model.applyDelta(V.graph(e.graph),e.start,e.end);for(const c of e.cues||[]){const x=V.cue(c);if(x)model.cue(x,Math.min(Math.max(x.ts,e.start),e.end-1));}}
    const start=entries[0].start,end=entries.at(-1).end;
    const districts=[...model.districts.values()].map(d=>({d,born:model.districtBorn(d)})).filter(x=>Number.isFinite(x.born)).sort((a,b)=>a.born-b.born||a.d.order-b.d.order);
    const index=new Map(districts.map((x,i)=>[x.d.id,i]));
    // Structure at performance time t: subsystems alive (with their files) and the dependencies between them.
    const structureAt=t=>{
      const subs=districts.map((x,i)=>{let files=0;for(const id of x.d.members){const m=model.modules.get(id);if(m&&model.alive(m,t)&&(m.removed===null||m.removed>t))files++;}
        return {k:i,files,role:x.d.role,born:x.born};}).filter(s=>s.files>0);
      const pairs=new Map();
      for(const l of model.links.values()){if(!model.alive(l,t)||(l.removed!==null&&l.removed<=t))continue;const a=model.modules.get(l.a),b=model.modules.get(l.b);if(!a||!b||a.group===b.group)continue;
        if(!model.alive(a,t)||!model.alive(b,t))continue;
        const i=index.get(a.group),j=index.get(b.group);if(i===undefined||j===undefined)continue;const key=`${i}>${j}`;pairs.set(key,(pairs.get(key)||0)+1);}
      return {subsystems:subs,deps:[...pairs].map(([k,w])=>{const [a,b]=k.split('>').map(Number);return {a,b,w};}).sort((x,y)=>x.a-y.a||x.b-y.b)};
    };
    // Architectural changes: a subsystem's birth, a dependency between two subsystems' first file-level link.
    const changes=[];
    for(const [i,x] of districts.entries())if(x.born>start)changes.push({kind:'subsystem',at:x.born,k:i});
    const firstLink=new Map();
    for(const l of model.links.values()){const a=model.modules.get(l.a),b=model.modules.get(l.b);if(!a||!b||a.group===b.group)continue;const t=model.bornAt(l);if(!Number.isFinite(t))continue;
      const key=`${index.get(a.group)}>${index.get(b.group)}`;if(!firstLink.has(key)||firstLink.get(key)>t)firstLink.set(key,t);}
    for(const [key,t] of firstLink){if(t<=start)continue;const [a,b]=key.split('>').map(Number);
      // between two subsystems that already existed (so the change is the dependency, not a newborn's first link)
      changes.push({kind:'dependency',at:t,a,b,existing:districts[a].born<t-1000&&districts[b].born<t-1000});}
    changes.sort((x,y)=>x.at-y.at);
    if(process.argv.includes('--list')){
      console.log(`${ds}: ${entries.length} windows, ${((end-start)/1000).toFixed(0)} s, ${districts.length} subsystems, laws ${JSON.stringify(recipe.genome?.laws)}`);
      for(const [i,c] of changes.entries()){const s=structureAt(c.at+1);console.log(i,c.kind,'+'+((c.at-start)/1000).toFixed(1)+'s',c.kind==='dependency'?`${c.a}->${c.b}${c.existing?' (existing)':''}`:`subsystem ${c.k}`,`-> ${s.subsystems.length} subsystems ${s.deps.length} deps`);}
      const s=structureAt(end);console.log('end',JSON.stringify(s));return;
    }
    const pick=arg('change')!==undefined?changes[+arg('change')]:changes.find(c=>c.kind==='dependency'&&c.existing);
    if(!pick)throw new Error('no architectural change in this recording');
    // The score: its identity (the composed score's seed, style, profile) and the frames it is conducted from.
    const projectSeed=entries.find(e=>Number.isFinite(e.frame?.projectSeed))?.frame.projectSeed;
    const frames=entries.filter(e=>e.frame).map(e=>({kind:1,t:e.start,end:Number.isFinite(e.frame.end)?e.frame.end:e.end,energy:+(e.frame.controls?.energy||0),tension:+(e.frame.controls?.tension||0),chapter:e.frame.chapter||1,milestone:!!e.frame.milestone}));
    const out={dataset:ds,seed:recipe.projectSeed>>>0,variant:recipe.variant||0,laws:recipe.genome.laws,material:recipe.genome.material,palette:recipe.genome.palette||null,
      music:{version:recipe.music?.scoreVersion??3,style:recipe.music?.style||recipe.style||'ambient',profile:recipe.music?.profile||null,seed:projectSeed},
      start,end,change:{...pick,offset:pick.at-start},before:structureAt(pick.at-1),after:structureAt(pick.at+4000),
      frames:frames.filter(f=>f.end>=pick.at-120000&&f.t<=pick.at+120000),
      // the recording's end: its whole structure, and the frames of its last five minutes (the score after it is the
      // score of inactivity)
      idle:{at:end,structure:structureAt(end),frames:frames.filter(f=>f.end>=end-300000)}};
    const file=arg('out',path.join(__dirname,'inputs',`${ds}.json`));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(out,null,1));
    console.log(`${ds}: change ${pick.kind} at +${(out.change.offset/1000).toFixed(1)} s; before ${out.before.subsystems.length} subsystems/${out.before.deps.length} deps, after ${out.after.subsystems.length}/${out.after.deps.length} -> ${path.relative(process.cwd(),file)}`);
  });}finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

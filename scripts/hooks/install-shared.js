'use strict';
// What the installers added after Claude Code, Cursor and Codex share: an idempotent merge that adds exactly the
// adapter's entries, its inverse (unmerge) that takes exactly those out again, and the command line. Both keep every
// other byte of meaning in the agent's file; the command line, like the Control Center, refuses the home directory
// (its hook files are user-level and apply to every workspace).
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
// The event map: under `container` ("hooks") or, for files that are nothing but the map, the object itself.
const mapOf=(settings,container)=>container?(isPlain(settings[container])?settings[container]:{}):settings;
function withMap(settings,container,map){
  if(!container)return map;
  const next={...settings};if(Object.keys(map).length)next[container]=map;else delete next[container];return next;
}
// Claude-style groups ({matcher?, hooks:[handler]}) per event: Gemini CLI, Qwen Code, Factory Droid, Grok Build, goose.
// specs: [{event, matcher?}]; handler(spec) is the adapter's own hook object, recognised by its command.
function nested({specs,command,handler,container='hooks'}){
  const EVENTS=[...new Set(specs.map(s=>s.event))];
  const ours=h=>isPlain(h)&&h.command===command;
  const hasOurs=g=>isPlain(g)&&Array.isArray(g.hooks)&&g.hooks.some(ours);
  const matchersOf=event=>new Set(specs.filter(s=>s.event===event).map(s=>s.matcher||''));
  const entry=spec=>({...(spec.matcher?{matcher:spec.matcher}:{}),hooks:[handler(spec)]});
  // A group shared with the user's own hook keeps its place, with the user's hook only.
  function strip(groups,keep=()=>false){
    const kept=[];let changed=false;
    for(const g of groups){
      if(!hasOurs(g)||keep(g)){kept.push(g);continue;}
      changed=true;const rest=g.hooks.filter(h=>!ours(h));if(rest.length)kept.push({...g,hooks:rest});
    }
    return {kept,changed};
  }
  function merge(settings){
    const map={...mapOf(settings,container)};
    for(const spec of specs){
      const groups=Array.isArray(map[spec.event])?map[spec.event].slice():[];
      if(!groups.some(g=>hasOurs(g)&&(g.matcher||'')===(spec.matcher||'')))groups.push(entry(spec));
      map[spec.event]=groups;
    }
    // The adapter leaves events it does not install (they can deny or block) and groups under another matcher (an
    // earlier build's), wherever it finds itself.
    for(const [event,groups] of Object.entries(map)){
      if(!Array.isArray(groups))continue;
      const wanted=matchersOf(event);
      const {kept,changed}=strip(groups,g=>wanted.has(g.matcher||''));
      if(!changed)continue;
      if(kept.length)map[event]=kept;else delete map[event];
    }
    return withMap(settings,container,map);
  }
  function unmerge(settings){
    const current=mapOf(settings,container);
    if(container&&!isPlain(settings[container]))return settings;
    const map={...current};let touched=false;
    for(const [event,groups] of Object.entries(map)){
      if(!Array.isArray(groups))continue;
      const {kept,changed}=strip(groups);
      if(!changed)continue;touched=true;
      if(kept.length)map[event]=kept;else delete map[event];
    }
    return touched?withMap(settings,container,map):settings;
  }
  return {merge,unmerge,EVENTS};
}
// A flat list of handlers per event (GitHub Copilot). The command names its event (`node "<adapter>" <event>`) where the
// agent's payload does not; every command that starts with the adapter's is the adapter's.
function flat({events,commandFor,handler,container='hooks',prefix}){
  const ours=h=>isPlain(h)&&typeof h.command==='string'&&(h.command===prefix||h.command.startsWith(`${prefix} `));
  const wanted=new Set(events);
  function merge(settings){
    const map={...mapOf(settings,container)};
    for(const event of events){
      const list=Array.isArray(map[event])?map[event].slice():[];
      // Only this event's own command counts as installed; a handler of ours with another event's name is replaced.
      const kept=list.filter(h=>!ours(h)||h.command===commandFor(event));
      if(!kept.some(h=>ours(h)))kept.push(handler(event));
      map[event]=kept;
    }
    for(const [event,list] of Object.entries(map)){
      if(wanted.has(event)||!Array.isArray(list))continue;
      const kept=list.filter(h=>!ours(h));
      if(kept.length===list.length)continue;
      if(kept.length)map[event]=kept;else delete map[event];
    }
    return withMap(settings,container,map);
  }
  function unmerge(settings){
    if(!isPlain(settings[container]))return settings;
    const map={...settings[container]};let touched=false;
    for(const [event,list] of Object.entries(map)){
      if(!Array.isArray(list))continue;
      const kept=list.filter(h=>!ours(h));
      if(kept.length===list.length)continue;touched=true;
      if(kept.length)map[event]=kept;else delete map[event];
    }
    return touched?withMap(settings,container,map):settings;
  }
  return {merge,unmerge,EVENTS:[...events]};
}
const realpath=p=>{try{return fs.realpathSync.native(p);}catch{return path.resolve(p);}};
// `npm run hooks:<tool> -- <project> [--print]`: the same entries the Control Center shows before it writes them.
function cli({file,merge,base={},done}){
  const args=process.argv.slice(2);const print=args.includes('--print');
  const project=path.resolve(args.find(a=>!a.startsWith('--'))||process.cwd());
  if(realpath(project)===realpath(os.homedir()))throw new Error('Refusing your home directory: hook files there apply to every workspace. Run this with the project folder.');
  const target=path.join(project,file);
  let current=base;try{current=JSON.parse(fs.readFileSync(target,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error(`Cannot parse ${target}: ${e.message}`);}
  if(!isPlain(current))throw new Error(`${target} does not hold a JSON object`);
  const next=merge(current);
  if(print){console.log(JSON.stringify(next,null,2));return;}
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(next,null,2)+'\n');
  console.log(`Code Resonance hooks added to ${target}\n${done}`);
}
const main=options=>{try{cli(options);}catch(e){console.error(e.message);process.exitCode=1;}};
module.exports={nested,flat,main,isPlain};

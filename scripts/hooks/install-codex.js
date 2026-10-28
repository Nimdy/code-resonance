#!/usr/bin/env node
'use strict';
// Opt-in: adds the Code Resonance adapter to <project>/.codex/hooks.json (Codex may commit this file; the command is
// an absolute path on this machine — gitignore it or do not commit the adapter entry).
// `--print` shows the configuration instead of writing it. Observe-only after-hooks; nothing that can deny or block
// (PreToolUse and PermissionRequest are never installed).
const fs=require('node:fs');
const path=require('node:path');
const SPECS=[
  {event:'SessionStart'},
  {event:'SessionEnd'},
  {event:'UserPromptSubmit'},
  {event:'PostToolUse',matcher:'apply_patch|Edit|Write'},
  {event:'PostToolUse',matcher:'Bash'},
  {event:'Stop'},
  {event:'SubagentStart'},
  {event:'SubagentStop'}
];
const EVENTS=[...new Set(SPECS.map(s=>s.event))];
const adapter=path.resolve(__dirname,'codex.js');
const command=`node ${JSON.stringify(adapter)}`;
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ours=h=>h&&h.command===command;
const wanted=new Set(EVENTS);
const matchers=new Set(SPECS.filter(s=>s.matcher).map(s=>s.matcher));
const matchOf=spec=>g=>isPlain(g)&&Array.isArray(g.hooks)&&g.hooks.some(ours)&&(spec.matcher?g.matcher===spec.matcher:!g.matcher);
const entry=spec=>({...(spec.matcher?{matcher:spec.matcher}:{}),hooks:[{type:'command',command,timeout:5}]});
function stripOurs(groups){
  const kept=[];
  for(const g of groups){
    if(!isPlain(g)||!Array.isArray(g.hooks)||!g.hooks.some(ours)){kept.push(g);continue;}
    const rest=g.hooks.filter(h=>!ours(h));if(rest.length)kept.push({...g,hooks:rest});
  }
  return kept;
}
function merge(settings){
  const next={...settings,hooks:{...(settings.hooks||{})}};
  for(const spec of SPECS){
    const groups=Array.isArray(next.hooks[spec.event])?next.hooks[spec.event].slice():[];
    if(!groups.some(matchOf(spec)))groups.push(entry(spec));
    next.hooks[spec.event]=groups;
  }
  // Strip this adapter from events we do not install (PreToolUse / PermissionRequest can deny) and from a previous
  // catch-all PostToolUse group (we only want the two matchers).
  for(const [event,groups] of Object.entries(next.hooks)){
    if(!Array.isArray(groups))continue;
    if(!wanted.has(event)){
      const kept=stripOurs(groups);
      if(kept.length===groups.length)continue;
      if(kept.length)next.hooks[event]=kept;else delete next.hooks[event];
      continue;
    }
    if(event!=='PostToolUse')continue;
    const kept=[];
    for(const g of groups){
      if(!isPlain(g)||!Array.isArray(g.hooks)||!g.hooks.some(ours)||matchers.has(g.matcher)){kept.push(g);continue;}
      const rest=g.hooks.filter(h=>!ours(h));if(rest.length)kept.push({...g,hooks:rest});
    }
    if(kept.length)next.hooks[event]=kept;else delete next.hooks[event];
  }
  return next;
}
// The inverse (the Control Center's removal): exactly the adapter's entries leave, and only the groups, events and
// `hooks` key that they leave empty; every other byte of meaning in the user's file stays.
function unmerge(settings){
  if(!isPlain(settings.hooks))return settings;
  const hooks={...settings.hooks};let touched=false;
  for(const [event,groups] of Object.entries(hooks)){
    if(!Array.isArray(groups))continue;
    const kept=stripOurs(groups);
    if(kept.length===groups.length)continue;touched=true;
    if(kept.length)hooks[event]=kept;else delete hooks[event];
  }
  if(!touched)return settings;
  const next={...settings,hooks};if(!Object.keys(hooks).length)delete next.hooks;return next;
}
function main(){
  const args=process.argv.slice(2);const print=args.includes('--print');
  const project=path.resolve(args.find(a=>!a.startsWith('--'))||process.cwd());
  const file=path.join(project,'.codex','hooks.json');
  let current={};try{current=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error(`Cannot parse ${file}: ${e.message}`);}
  const next=merge(current);
  if(print){console.log(JSON.stringify(next,null,2));return;}
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(next,null,2)+'\n');
  console.log(`Code Resonance hooks added to ${file}\nStart the receiver (npm start) and Codex sessions in this trusted workspace will join the performance.`);
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={merge,unmerge,EVENTS,adapter,command};

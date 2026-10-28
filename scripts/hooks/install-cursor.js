#!/usr/bin/env node
'use strict';
// Opt-in: adds the Code Resonance adapter to <project>/.cursor/hooks.json (personal, not committed).
// `--print` shows the configuration instead of writing it. Observe-only after-hooks; nothing that can deny or block.
const fs=require('node:fs');
const path=require('node:path');
const EVENTS=['sessionStart','sessionEnd','afterFileEdit','afterShellExecution','subagentStart','subagentStop','stop'];
const adapter=path.resolve(__dirname,'cursor.js');
const command=`node ${JSON.stringify(adapter)}`;
function merge(settings){
  const next={version:1,...settings,hooks:{...(settings.hooks||{})}};
  for(const event of EVENTS){
    const list=Array.isArray(next.hooks[event])?next.hooks[event].slice():[];
    if(!list.some(h=>h&&h.command===command))list.push({command,timeout:5});
    next.hooks[event]=list;
  }
  return next;
}
// The inverse (the Control Center's removal): exactly the adapter's entries leave, and only the events and `hooks` key
// that they leave empty; every other byte of meaning in the user's file stays.
const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function unmerge(settings){
  if(!isPlain(settings.hooks))return settings;
  const hooks={...settings.hooks};let touched=false;
  for(const [event,list] of Object.entries(hooks)){
    if(!Array.isArray(list))continue;
    const kept=list.filter(h=>!(isPlain(h)&&h.command===command));
    if(kept.length===list.length)continue;touched=true;
    if(kept.length)hooks[event]=kept;else delete hooks[event];
  }
  if(!touched)return settings;
  const next={...settings,hooks};if(!Object.keys(hooks).length)delete next.hooks;return next;
}
function main(){
  const args=process.argv.slice(2);const print=args.includes('--print');
  const project=path.resolve(args.find(a=>!a.startsWith('--'))||process.cwd());
  const file=path.join(project,'.cursor','hooks.json');
  let current={};try{current=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error(`Cannot parse ${file}: ${e.message}`);}
  const next=merge(current);
  if(print){console.log(JSON.stringify(next,null,2));return;}
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(next,null,2)+'\n');
  console.log(`Code Resonance hooks added to ${file}\nStart the receiver (npm start) and Cursor sessions in this trusted workspace will join the performance.`);
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={merge,unmerge,EVENTS,adapter,command};

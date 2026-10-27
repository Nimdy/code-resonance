#!/usr/bin/env node
'use strict';
// Opt-in: adds the Code Resonance adapter to <project>/.claude/settings.local.json (personal, not committed).
// `--print` shows the configuration instead of writing it.
const fs=require('node:fs');
const path=require('node:path');
const EVENTS=['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','SubagentStart','SubagentStop','Stop'];
const adapter=path.resolve(__dirname,'claude-code.js');
const command=`node ${JSON.stringify(adapter)}`;
function merge(settings){
  const next={...settings,hooks:{...(settings.hooks||{})}};
  for(const event of EVENTS){
    const groups=Array.isArray(next.hooks[event])?next.hooks[event].slice():[];
    if(!groups.some(g=>(g.hooks||[]).some(h=>h.command===command)))groups.push({hooks:[{type:'command',command,timeout:5}]});
    next.hooks[event]=groups;
  }
  return next;
}
function main(){
  const args=process.argv.slice(2);const print=args.includes('--print');
  const project=path.resolve(args.find(a=>!a.startsWith('--'))||process.cwd());
  const file=path.join(project,'.claude','settings.local.json');
  let current={};try{current=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error(`Cannot parse ${file}: ${e.message}`);}
  const next=merge(current);
  if(print){console.log(JSON.stringify(next,null,2));return;}
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(next,null,2)+'\n');
  console.log(`Code Resonance hooks added to ${file}\nStart the receiver (npm start) and Claude Code sessions in this project will join the performance.`);
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={merge,EVENTS};

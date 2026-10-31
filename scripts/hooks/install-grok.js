#!/usr/bin/env node
'use strict';
// Opt-in: writes the Code Resonance adapter's own hook file, <project>/.grok/hooks/code-resonance.json (Grok Build reads
// every *.json there; the command is an absolute path on this machine — do not commit the file).
// `--print` shows the configuration instead of writing it. Observe-only; PreToolUse (the only blocking event) is never
// installed. Grok runs project hooks only after the folder is trusted (/hooks-trust or --trust).
const path=require('node:path');
const {nested,main}=require('./install-shared');
const adapter=path.resolve(__dirname,'grok.js');
const command=`node ${JSON.stringify(adapter)}`;
const SPECS=[{event:'SessionStart'},{event:'SessionEnd'},{event:'UserPromptSubmit'},{event:'PostToolUse'},{event:'PostToolUseFailure'},{event:'Stop'}];
// Timeouts are in seconds (Grok's default is 5).
const {merge,unmerge,EVENTS}=nested({specs:SPECS,command,handler:()=>({type:'command',command,timeout:5})});
const FILE='.grok/hooks/code-resonance.json';
const INFO={slug:'grok',name:'Grok Build',provider:'grok',file:FILE,docs:'https://docs.x.ai/build/features/hooks',
  captured:['Session start and end','Prompt submitted: that it happened (the payload’s prompt field is not documented, so nothing of the prompt is read)',
    'Tool use: the tool’s name, and whether it completed or failed','Turn completed (Stop)'],
  excluded:['Prompt and reply text','Tool inputs (their fields are not documented), command lines and tool output','File paths: the documented payload does not name them',
    'PreToolUse (it can deny; it is not installed)','Subagents (the payload gives them no documented identity)'],
  trust:'Grok Build runs a folder’s project hooks only after you trust it, with /hooks-trust or by launching with --trust.',
  commit:'This file belongs to the Code Resonance adapter alone; the command is an absolute path on this machine — do not commit it.'};
if(require.main===module)main({file:FILE,merge,done:'Start the receiver (npm start), trust the folder in Grok (/hooks-trust), and new Grok sessions there will join the performance.'});
module.exports={merge,unmerge,EVENTS,adapter,command,INFO};

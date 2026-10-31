#!/usr/bin/env node
'use strict';
// Opt-in: adds the Code Resonance adapter to <project>/.factory/hooks.json (the event map itself, no `hooks` wrapper;
// Droid suggests committing this file, but the command is an absolute path on this machine — do not commit the entries).
// `--print` shows the configuration instead of writing it. Observe-only; PreToolUse is never installed.
const path=require('node:path');
const {nested,main}=require('./install-shared');
const adapter=path.resolve(__dirname,'droid.js');
const command=`node ${JSON.stringify(adapter)}`;
const SPECS=[{event:'SessionStart'},{event:'SessionEnd'},{event:'UserPromptSubmit'},{event:'PostToolUse',matcher:'Create|Edit|ApplyPatch|Execute'},
  {event:'Stop'},{event:'SubagentStop'}];
// Timeouts are in seconds.
const {merge,unmerge,EVENTS}=nested({specs:SPECS,command,container:null,handler:()=>({type:'command',command,timeout:5})});
const FILE='.factory/hooks.json';
const INFO={slug:'droid',name:'Factory Droid',provider:'droid',file:FILE,docs:'https://docs.factory.com/reference/hooks-reference',
  captured:['Session start and end, with the source or reason Droid gives',
    'Prompt submitted: its length and a fingerprint (a truncated SHA-256), not its text',
    'Files: the project-relative path Create names, when it passes the same filters as the extension (Edit and ApplyPatch are seen as edits without a file: their arguments are not documented)',
    'Shell (Execute): a command category (test, build, lint, …), never the command line; the payload has no exit code',
    'Sub-droids: stop, by task name (two of the same task share a voice)','Response completed when Droid finishes responding'],
  excluded:['Prompt text (unless RESONANCE_CAPTURE_PROMPT_TEXT=1 is set in the environment Droid runs hooks in)','File contents, command lines, tool output and sub-droid results',
    'PreToolUse (it can deny; it is not installed)','Files outside the project, secrets (.env, keys, credentials) and excluded folders (node_modules, build output, …)'],
  trust:'Droid loads project hooks from .factory/hooks.json when it starts (it snapshots them and warns when they change outside Droid).',
  commit:'Droid suggests committing .factory/hooks.json; the adapter command is an absolute path on this machine — do not commit these entries.'};
if(require.main===module)main({file:FILE,merge,done:'Start the receiver (npm start) and new Droid sessions in this project will join the performance.'});
module.exports={merge,unmerge,EVENTS,adapter,command,INFO};

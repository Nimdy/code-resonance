#!/usr/bin/env node
'use strict';
// Opt-in: writes a hook-only project plugin, <project>/.agents/plugins/code-resonance/hooks/hooks.json (goose discovers
// it there and needs no manifest for it; the command is an absolute path on this machine — do not commit the folder).
// `--print` shows the configuration instead of writing it. Observe-only; PreToolUse is never installed.
const path=require('node:path');
const {nested,main}=require('./install-shared');
const adapter=path.resolve(__dirname,'goose.js');
const command=`node ${JSON.stringify(adapter)}`;
// goose's matchers are regular expressions ("*" would be skipped): only the tools whose inputs are documented.
const TOOLS='^(shell|write|edit)$';
const SPECS=[{event:'SessionStart'},{event:'SessionEnd'},{event:'UserPromptSubmit'},{event:'PostToolUse',matcher:TOOLS},{event:'PostToolUseFailure',matcher:TOOLS},{event:'Stop'}];
// Timeouts are in seconds.
const {merge,unmerge,EVENTS}=nested({specs:SPECS,command,handler:()=>({type:'command',command,timeout:5})});
const FILE='.agents/plugins/code-resonance/hooks/hooks.json';
const INFO={slug:'goose',name:'goose',provider:'goose',file:FILE,docs:'https://goose-docs.ai/docs/guides/context-engineering/hooks/',
  captured:['Session start and end','Prompt submitted: its length and a fingerprint (a truncated SHA-256), not its text',
    'Files: the project-relative path the write and edit tools name, when it passes the same filters as the extension',
    'Shell: a command category (test, build, lint, …), never the command line; failed when goose reports the tool failed (the payload has no exit code)',
    'Turn completed (Stop): the length and fingerprint of the final reply'],
  excluded:['Prompt text (unless RESONANCE_CAPTURE_PROMPT_TEXT=1 is set in the environment goose runs hooks in)','Reply text, file contents, edit strings, command lines and tool output',
    'PreToolUse (it can deny; it is not installed)','Files outside the project, secrets (.env, keys, credentials) and excluded folders (node_modules, build output, …)'],
  trust:'goose loads project plugins when it starts in that project; it asks for no approval, so review the file before writing it.',
  commit:'This plugin folder belongs to the Code Resonance adapter alone; the command is an absolute path on this machine — do not commit it.'};
if(require.main===module)main({file:FILE,merge,done:'Start the receiver (npm start) and new goose sessions started in this project will join the performance.'});
module.exports={merge,unmerge,EVENTS,adapter,command,INFO};

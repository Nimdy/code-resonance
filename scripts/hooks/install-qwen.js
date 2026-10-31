#!/usr/bin/env node
'use strict';
// Opt-in: adds the Code Resonance adapter to <project>/.qwen/settings.json (project settings, which may be committed;
// the command is an absolute path on this machine — do not commit the adapter entries).
// `--print` shows the configuration instead of writing it. Observe-only; PreToolUse and PermissionRequest are never
// installed. Qwen Code loads project hooks only in a trusted folder, when a session starts or /hooks is opened.
const path=require('node:path');
const {nested,main}=require('./install-shared');
const adapter=path.resolve(__dirname,'qwen.js');
const command=`node ${JSON.stringify(adapter)}`;
const TOOLS='write_file|edit|read_file|run_shell_command';
const SPECS=[{event:'SessionStart'},{event:'SessionEnd'},{event:'UserPromptSubmit'},{event:'PostToolUse',matcher:TOOLS},{event:'PostToolUseFailure',matcher:TOOLS},
  {event:'Stop'},{event:'SubagentStart'},{event:'SubagentStop'}];
// Timeouts are in seconds for command hooks.
const {merge,unmerge,EVENTS}=nested({specs:SPECS,command,handler:()=>({type:'command',command,name:'code-resonance',timeout:5})});
const FILE='.qwen/settings.json';
const INFO={slug:'qwen',name:'Qwen Code',provider:'qwen',file:FILE,docs:'https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/',
  captured:['Session start and end, with the source or reason Qwen Code gives',
    'Prompt submitted: its length and a fingerprint (a truncated SHA-256), not its text',
    'Files: the project-relative path write_file, edit or read_file names, when it passes the same filters as the extension',
    'Shell (run_shell_command): a command category (test, build, lint, …), never the command line; failed when Qwen Code reports the tool failed (the payload has no exit code)',
    'Subagents: start and stop, the subagent type and its id, so each subagent is a distinct voice',
    'Response completed: the length and fingerprint of the final assistant message'],
  excluded:['Prompt text (unless RESONANCE_CAPTURE_PROMPT_TEXT=1 is set in the environment Qwen Code runs hooks in)',
    'Assistant and subagent message text, file contents, edit strings, command lines and tool output',
    'PreToolUse and PermissionRequest (they can deny; they are not installed)',
    'Files outside the project, secrets (.env, keys, credentials) and excluded folders (node_modules, build output, …)'],
  trust:'Qwen Code loads hooks from a project’s .qwen/settings.json only when the folder is trusted, and reads them when a session starts (or /hooks is opened).',
  commit:'.qwen/settings.json may be committed; the adapter command is an absolute path on this machine — do not commit these entries.'};
if(require.main===module)main({file:FILE,merge,done:'Start the receiver (npm start) and new Qwen Code sessions in this trusted folder will join the performance.'});
module.exports={merge,unmerge,EVENTS,adapter,command,INFO};

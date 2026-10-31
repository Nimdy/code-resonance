#!/usr/bin/env node
'use strict';
// Opt-in: adds the Code Resonance adapter to <project>/.gemini/settings.json (project settings; Gemini CLI may be
// committed with this file, and the command is an absolute path on this machine — do not commit the adapter entries).
// `--print` shows the configuration instead of writing it. Observe-only; BeforeTool, BeforeModel and
// BeforeToolSelection are never installed. Gemini CLI fingerprints project hooks and asks before running a new one.
const path=require('node:path');
const {nested,main}=require('./install-shared');
const adapter=path.resolve(__dirname,'gemini.js');
const command=`node ${JSON.stringify(adapter)}`;
const SPECS=[{event:'SessionStart'},{event:'SessionEnd'},{event:'BeforeAgent'},{event:'AfterAgent'},
  {event:'AfterTool',matcher:'write_file|replace|read_file|run_shell_command'}];
// `name` lets /hooks disable it by name; the timeout is in milliseconds here.
const {merge,unmerge,EVENTS}=nested({specs:SPECS,command,handler:()=>({name:'code-resonance',type:'command',command,timeout:5000})});
const FILE='.gemini/settings.json';
const INFO={slug:'gemini',name:'Gemini CLI',provider:'gemini',file:FILE,docs:'https://geminicli.com/docs/hooks/',
  captured:['Session start and end, with the source or reason Gemini CLI gives (for example "startup" or "exit")',
    'Prompt submitted (BeforeAgent): its length and a fingerprint (a truncated SHA-256), not its text',
    'Files: the project-relative path write_file, replace or read_file names, when it passes the same filters as the extension',
    'Shell (run_shell_command): a command category (test, build, lint, …), never the command line; failed only when the tool reports an error (the payload has no exit code)',
    'Response completed (AfterAgent): the length and fingerprint of the final response'],
  excluded:['Prompt text (unless RESONANCE_CAPTURE_PROMPT_TEXT=1 is set in the environment Gemini CLI runs hooks in)','Response text, file contents, edit strings, command lines and tool output',
    'BeforeTool, BeforeModel and BeforeToolSelection (they can deny or rewrite; they are not installed)',
    'Files outside the project, secrets (.env, keys, credentials) and excluded folders (node_modules, build output, …)'],
  trust:'Gemini CLI loads project settings only in a trusted folder and asks before it runs a project hook it has not seen (it fingerprints each hook’s name and command).',
  commit:'Gemini CLI’s .gemini/settings.json may be committed; the adapter command is an absolute path on this machine — do not commit these entries.'};
if(require.main===module)main({file:FILE,merge,done:'Start the receiver (npm start); in a trusted folder, Gemini CLI asks once before it runs the new hooks.'});
module.exports={merge,unmerge,EVENTS,adapter,command,INFO};

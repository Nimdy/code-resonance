#!/usr/bin/env node
'use strict';
// Opt-in: adds the Code Resonance adapter to the inline `hooks` of <project>/.github/copilot/settings.local.json (the
// personal, typically gitignored repository settings Copilot CLI and VS Code's Copilot harness read; the cloud agent
// does not read it, and could not run a command on this machine anyway).
// `--print` shows the configuration instead of writing it. Observe-only; preToolUse and permissionRequest are never
// installed (a crashed preToolUse hook denies the tool call).
const path=require('node:path');
const {flat,main}=require('./install-shared');
const adapter=path.resolve(__dirname,'copilot.js');
const prefix=`node ${JSON.stringify(adapter)}`;
// The camelCase events (their payloads are the documented camelCase format); subagentStart is the same in both formats.
const EVENT_NAMES=['sessionStart','sessionEnd','userPromptSubmitted','postToolUse','postToolUseFailure','agentStop','subagentStart','subagentStop'];
const commandFor=event=>`${prefix} ${event}`;
const {merge,unmerge,EVENTS}=flat({events:EVENT_NAMES,commandFor,prefix,handler:event=>({type:'command',command:commandFor(event),timeoutSec:5})});
const FILE='.github/copilot/settings.local.json';
const INFO={slug:'copilot',name:'GitHub Copilot',provider:'copilot',file:FILE,docs:'https://docs.github.com/en/copilot/reference/hooks-reference',
  captured:['Session start and end, with the source or reason Copilot gives',
    'Prompt submitted: its length and a fingerprint (a truncated SHA-256), not its text',
    'Tool use: the tool (bash, create, edit, view, grep, …), and failed when Copilot reports the tool failed',
    'Shell (bash): a command category (test, build, lint, …), never the command line; the payload has no exit code',
    'Subagents: start and stop, by the subagent’s name (two of the same name share a voice)',
    'Response completed when the agent finishes its turn'],
  excluded:['Prompt text (unless RESONANCE_CAPTURE_PROMPT_TEXT=1 is set in the environment Copilot runs hooks in)',
    'File paths: the documented create and edit arguments do not name the file, so none are read',
    'Subagent replies, tool arguments, command lines and tool output','preToolUse and permissionRequest (they can deny; they are not installed)'],
  trust:'Copilot CLI loads repository hooks in a trusted folder (or with --trust-folder for one prompt-mode session); VS Code’s Copilot harness reads the same file. The cloud agent does not.',
  commit:'.github/copilot/settings.local.json is personal (typically gitignored): keep it out of commits, the adapter command is an absolute path on this machine.'};
if(require.main===module)main({file:FILE,merge,done:'Start the receiver (npm start) and new Copilot CLI or VS Code Copilot sessions in this trusted folder will join the performance.'});
module.exports={merge,unmerge,EVENTS,adapter,command:prefix,commandFor,INFO};

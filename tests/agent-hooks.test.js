'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {translate}=require('../scripts/hooks/claude-code');
const {merge,unmerge}=require('../scripts/hooks/install-claude-code');
const {translate:translateCursor}=require('../scripts/hooks/cursor');
const {merge:mergeCursor,unmerge:unmergeCursor,EVENTS:CURSOR_EVENTS,command:cursorCommand}=require('../scripts/hooks/install-cursor');
const {translate:translateCodex}=require('../scripts/hooks/codex');
const {merge:mergeCodex,unmerge:unmergeCodex,EVENTS:CODEX_EVENTS,command:codexCommand}=require('../scripts/hooks/install-codex');
const {activityOf}=require('../engine/intents');
const {vscodeFileUri,projectIdForRoot}=require('../sdk/project-id');
const {validateEvent}=require('../receiver/protocol');
test('Project identity matches VS Code Uri.file().toString() encoding',()=>{
  assert.equal(vscodeFileUri('/home/ana/my project','linux'),'file:///home/ana/my%20project');
  assert.equal(vscodeFileUri('/srv/a+b/(x)','linux'),'file:///srv/a%2Bb/%28x%29');
  assert.equal(vscodeFileUri('C:\\Users\\Ana\\app','win32'),'file:///c%3A/Users/Ana/app');
  assert.equal(projectIdForRoot('/home/ana/app','linux').length,64);
});
test('Claude Code hook payloads become privacy-preserving, valid events',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-hook-'));fs.mkdirSync(path.join(root,'.git'));
  try{
    const common={session_id:'s-123',transcript_path:'/tmp/t.jsonl',cwd:path.join(root),permission_mode:'default'};
    const prompt=translate({...common,hook_event_name:'UserPromptSubmit',prompt:'add login with password hunter2'});
    assert.equal(prompt[0].kind,'agent.prompt.submitted');assert(!JSON.stringify(prompt).includes('hunter2'));assert.equal(prompt[0].meta.length,31);
    const write=translate({...common,hook_event_name:'PostToolUse',tool_name:'Write',tool_input:{file_path:path.join(root,'src/api/stats.ts'),content:'SECRET_CONTENT'},tool_response:{filePath:'x',type:'create'}});
    assert.deepEqual(write.map(e=>e.kind),['agent.tool.completed','agent.file.modified']);
    assert.equal(write[0].file,'src/api/stats.ts');assert(!JSON.stringify(write).includes('SECRET_CONTENT'));
    // The planted secret must not be a hex string: event and project ids are random hex and would contain "abc" in
    // about 2 % of runs (that was this suite's intermittent failure).
    const bash=translate({...common,hook_event_name:'PostToolUseFailure',tool_name:'Bash',tool_input:{command:'npm test -- --token=Sekret_Token_Qx'},error:'Exit code 1\nFAIL'});
    assert.equal(bash[0].meta.category,'test');assert.equal(bash[0].meta.exitCode,1);assert(!JSON.stringify(bash).includes('Sekret_Token_Qx'));
    const ok=translate({...common,hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:'npm test'},tool_response:{stdout:'',stderr:'',interrupted:false}});
    assert.equal(ok[0].meta.exitCode,undefined);assert.equal(ok[0].meta.result,undefined);
    const okExit=translate({...common,hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:'npm test'},tool_response:{exitCode:0}});
    assert.equal(okExit[0].meta.exitCode,0);assert.equal(okExit[0].meta.result,'succeeded');
    const outside=translate({...common,hook_event_name:'PreToolUse',tool_name:'Edit',tool_input:{file_path:'/etc/passwd'}});
    assert.equal(outside[0].file,undefined);
    const sub=translate({...common,agent_id:'agent-9',agent_type:'Explore',hook_event_name:'PreToolUse',tool_name:'Read',tool_input:{}});
    assert.notEqual(sub[0].meta.agent,prompt[0].meta.agent);
    // A read names the file it looks at (so the player can show where an agent works) but is never a modification.
    const read=translate({...common,hook_event_name:'PostToolUse',tool_name:'Read',tool_input:{file_path:path.join(root,'src/ui/App.tsx')},tool_response:{}});
    assert.deepEqual(read.map(e=>e.kind),['agent.tool.completed']);assert.equal(read[0].file,'src/ui/App.tsx');
    const secret=translate({...common,hook_event_name:'PreToolUse',tool_name:'Read',tool_input:{file_path:path.join(root,'.env')}});
    assert.equal(secret[0].file,undefined);
    for(const e of [...prompt,...write,...bash,...ok,...okExit,...outside,...sub,...read,...secret])validateEvent(e);
    assert.equal(translate({...common,hook_event_name:'Notification'}).length,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Hook installer is idempotent and preserves existing settings',()=>{
  const first=merge({permissions:{allow:['Bash(ls)']},hooks:{PostToolUse:[{matcher:'Edit',hooks:[{type:'command',command:'lint'}]}]}});
  const second=merge(first);
  assert.deepEqual(second,first);
  assert.deepEqual(first.permissions,{allow:['Bash(ls)']});
  assert.equal(first.hooks.PostToolUse.length,2);
  // Removal is its inverse: the user's own settings come back exactly, and an emptied hooks key goes.
  assert.deepEqual(unmerge(first),{permissions:{allow:['Bash(ls)']},hooks:{PostToolUse:[{matcher:'Edit',hooks:[{type:'command',command:'lint'}]}]}});
  assert.deepEqual(unmerge(merge({model:'opus'})),{model:'opus'});
});
test('Cursor hook payloads become privacy-preserving, valid events',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-cursor-hook-'));fs.mkdirSync(path.join(root,'.git'));
  try{
    const secret='Sekret_Hunk_Qx',cmdSecret='Sekret_Cmd_Qx',outSecret='Sekret_Out_Qx';
    const common={conversation_id:'conv-123',generation_id:'gen-9',cwd:root,workspace_roots:[root]};
    const edit=translateCursor({...common,hook_event_name:'afterFileEdit',file_path:path.join(root,'src/api/stats.ts'),
      edits:[{old_string:'export const x = 1',new_string:`export const x = 1; // ${secret}`}]});
    assert.deepEqual(edit.map(e=>e.kind),['agent.tool.completed','agent.file.modified']);
    assert.equal(edit[0].file,'src/api/stats.ts');assert.equal(edit[0].meta.tool,'Edit');assert.equal(edit[0].meta.provider,'cursor');assert.equal(edit[0].meta.source,'cursor-hook');
    assert.equal(edit[0].sessionId,'cursor-conv-123');
    const dumped=JSON.stringify(edit);
    assert(!dumped.includes(secret));assert(!dumped.includes('old_string'));assert(!dumped.includes('new_string'));
    const shell=translateCursor({...common,hook_event_name:'afterShellExecution',command:`npm test -- --token=${cmdSecret}`,output:`FAIL ${outSecret}`,duration:400});
    assert.deepEqual(shell.map(e=>e.kind),['agent.tool.started','agent.tool.completed']);
    assert.equal(shell[0].meta.tool,'Bash');assert.equal(shell[0].meta.category,'test');assert.equal(shell[1].meta.category,'test');
    assert.equal(shell[1].ts-shell[0].ts,400);
    assert.equal(shell[1].meta.exitCode,undefined);assert.equal(shell[1].meta.result,undefined);
    const shellDump=JSON.stringify(shell);
    assert(!shellDump.includes(cmdSecret));assert(!shellDump.includes(outSecret));assert(!shellDump.includes('npm test'));
    const stop=translateCursor({...common,hook_event_name:'stop',status:'completed',loop_count:0});
    assert.equal(stop[0].kind,'agent.response.completed');
    assert.equal(translateCursor({...common,hook_event_name:'stop'}).length,0);
    const shellNull=translateCursor({...common,hook_event_name:'afterShellExecution',command:`npm test -- --token=${cmdSecret}`,output:null});
    assert.equal(shellNull[0].kind,'agent.tool.completed');assert.equal(shellNull[0].meta.category,'test');
    assert.equal(shellNull[0].meta.exitCode,undefined);assert.equal(shellNull[0].meta.result,undefined);
    const shellExit=translateCursor({...common,hook_event_name:'afterShellExecution',command:'npm test',output:null,exit_code:0});
    assert.equal(shellExit[0].meta.exitCode,0);assert.equal(shellExit[0].meta.result,'succeeded');
    const shellFail=translateCursor({...common,hook_event_name:'afterShellExecution',command:'npm test',output:null,exitCode:1});
    assert.equal(shellFail[0].meta.exitCode,1);assert.equal(shellFail[0].meta.result,'failed');
    assert(!JSON.stringify(shellNull).includes(cmdSecret));
    const sub=translateCursor({...common,hook_event_name:'subagentStart',subagent_id:'agent-9',subagent_type:'explore',task:'read secrets hunter2'});
    assert.equal(sub.length,0);
    const subStop=translateCursor({...common,hook_event_name:'subagentStop',subagent_type:'explore',status:'completed',summary:'contains hunter2'});
    assert.equal(subStop[0].kind,'agent.subagent.stopped');assert.equal(subStop[0].meta.agent,'conv-123/explore');
    assert.equal(subStop[0].meta.task,undefined);assert.equal(subStop[0].meta.summary,undefined);
    assert(!JSON.stringify(subStop).includes('hunter2'));
    const started=translateCursor({...common,hook_event_name:'sessionStart',session_id:'sess-1',composer_mode:'agent'});
    const ended=translateCursor({...common,hook_event_name:'sessionEnd',session_id:'sess-1',reason:'completed'});
    assert.equal(started[0].kind,'agent.session.started');assert.equal(ended[0].kind,'agent.session.ended');
    const secretFile=translateCursor({...common,hook_event_name:'afterFileEdit',file_path:path.join(root,'.env'),edits:[{old_string:'',new_string:secret}]});
    assert.deepEqual(secretFile.map(e=>e.kind),['agent.tool.completed']);assert.equal(secretFile[0].file,undefined);
    const outside=translateCursor({...common,hook_event_name:'afterFileEdit',file_path:'/etc/passwd',edits:[{old_string:'x',new_string:'y'}]});
    assert.equal(outside[0].file,undefined);
    for(const e of [...edit,...shell,...shellNull,...shellExit,...shellFail,...stop,...subStop,...started,...ended,...secretFile,...outside])validateEvent(e);
    assert.equal(translateCursor({...common,hook_event_name:'Notification'}).length,0);
    assert.equal(translateCursor({...common,hook_event_name:'beforeShellExecution',command:'rm -rf /'}).length,0);
    assert.equal(translateCursor({...common,hook_event_name:'beforeSubmitPrompt',prompt:'hunter2'}).length,0);
    assert.equal(translateCursor({...common,hook_event_name:'afterTabFileEdit',file_path:path.join(root,'src/a.ts'),edits:[]}).length,0);
    assert.equal(translateCursor({hook_event_name:'PostToolUse',tool_name:'Edit',tool_input:{file_path:path.join(root,'src/a.ts')},cwd:root}).length,0);
    assert.equal(translateCursor({hook_event_name:'afterFileEdit',cwd:root}).length,0);
    const all=[...edit,...shell,...shellNull,...stop,...subStop,...started,...ended];
    assert(!JSON.stringify(all).includes('deny'));assert(!JSON.stringify(all).includes('permission'));assert(!JSON.stringify(all).includes('continue'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('apply_patch is editing activity',()=>{
  assert.equal(activityOf('apply_patch'),'editing');
  assert.equal(activityOf('Edit'),'editing');
});
test('Codex hook payloads become privacy-preserving, valid events',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-codex-hook-'));fs.mkdirSync(path.join(root,'.git'));
  try{
    const secret='Sekret_Hunk_Qx',cmdSecret='Sekret_Cmd_Qx';
    const common={session_id:'sess-123',cwd:root,transcript_path:'/tmp/t.jsonl',permission_mode:'default'};
    // Secret only on hunk bodies (+/- lines), never in a JS quote that could close a template.
    const patch=['*** Begin Patch','*** Update File: src/api/stats.ts','@@','-export const x = 1','+export const x = 1; // '+secret,
      '*** Add File: src/lib/new.ts',"+export const y = '"+secret+"'",'*** Update File: .env','@@','-OLD','+'+secret,'*** End Patch'].join('\n');
    const edit=translateCodex({...common,hook_event_name:'PostToolUse',tool_name:'apply_patch',tool_use_id:'t1',
      tool_input:{command:patch}});
    assert.deepEqual(edit.map(e=>e.kind),['agent.tool.completed','agent.file.modified','agent.file.modified']);
    assert.equal(edit[0].meta.tool,'apply_patch');assert.equal(edit[0].meta.provider,'codex');assert.equal(edit[0].meta.source,'codex-hook');
    assert.equal(edit[0].sessionId,'codex-sess-123');
    assert.equal(edit[1].file,'src/api/stats.ts');assert.equal(edit[2].file,'src/lib/new.ts');
    assert(!edit.some(e=>e.file==='.env'));
    const dumped=JSON.stringify(edit);
    assert(!dumped.includes(secret));assert(!dumped.includes('export const'));assert(!dumped.includes('Begin Patch'));
    const uni=translateCodex({...common,hook_event_name:'PostToolUse',tool_name:'Edit',tool_input:
      {command:`--- a/src/api/stats.ts\n+++ b/src/api/stats.ts\n@@ -1,1 +1,1 @@\n-old\n+${secret}\n`}});
    assert.equal(uni[0].meta.tool,'apply_patch');assert.equal(uni[1].file,'src/api/stats.ts');assert(!JSON.stringify(uni).includes(secret));
    const bash=translateCodex({...common,hook_event_name:'PostToolUse',tool_name:'Bash',
      tool_input:{command:`npm test -- --token=${cmdSecret}`},tool_response:{output:`FAIL ${secret}`,metadata:{exit_code:1}}});
    assert.equal(bash.length,1);assert.equal(bash[0].kind,'agent.tool.completed');
    assert.equal(bash[0].meta.tool,'Bash');assert.equal(bash[0].meta.category,'test');assert.equal(bash[0].meta.exitCode,1);assert.equal(bash[0].meta.result,'failed');
    const bashUnknown=translateCodex({...common,hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:'npm test'},tool_response:{output:'ok'}});
    assert.equal(bashUnknown[0].meta.exitCode,undefined);assert.equal(bashUnknown[0].meta.result,undefined);
    const bashDump=JSON.stringify(bash);
    assert(!bashDump.includes(cmdSecret));assert(!bashDump.includes(secret));assert(!bashDump.includes('npm test'));
    const prompt=translateCodex({...common,hook_event_name:'UserPromptSubmit',prompt:'add login with password hunter2'});
    assert.equal(prompt[0].kind,'agent.prompt.submitted');assert(!JSON.stringify(prompt).includes('hunter2'));assert.equal(prompt[0].meta.length,31);
    const stop=translateCodex({...common,hook_event_name:'Stop',stop_hook_active:false,last_assistant_message:`contains ${secret}`});
    assert.equal(stop[0].kind,'agent.response.completed');assert(!JSON.stringify(stop).includes(secret));
    const sub=translateCodex({...common,hook_event_name:'SubagentStart',agent_id:'agent-9',agent_type:'explore'});
    assert.equal(sub[0].kind,'agent.subagent.started');assert.equal(sub[0].meta.agent,'sess-123/agent-9');
    const subStop=translateCodex({...common,hook_event_name:'SubagentStop',agent_id:'agent-9',agent_type:'explore',last_assistant_message:`${secret}`});
    assert.equal(subStop[0].kind,'agent.subagent.stopped');assert(!JSON.stringify(subStop).includes(secret));
    const started=translateCodex({...common,hook_event_name:'SessionStart',source:'startup'});
    const ended=translateCodex({...common,hook_event_name:'SessionEnd',reason:'other'});
    assert.equal(started[0].kind,'agent.session.started');assert.equal(ended[0].kind,'agent.session.ended');
    const outside=translateCodex({...common,hook_event_name:'PostToolUse',tool_name:'apply_patch',tool_input:{command:'*** Update File: /etc/passwd\n+x\n'}});
    assert.equal(outside[0].file,undefined);
    for(const e of [...edit,...uni,...bash,...bashUnknown,...prompt,...stop,...sub,...subStop,...started,...ended,...outside])validateEvent(e);
    assert.equal(translateCodex({...common,hook_event_name:'Notification'}).length,0);
    assert.equal(translateCodex({...common,hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command:'rm -rf /'}}).length,0);
    assert.equal(translateCodex({...common,hook_event_name:'PermissionRequest',tool_name:'Bash',tool_input:{command:'rm -rf /'}}).length,0);
    assert.equal(translateCodex({hook_event_name:'PostToolUse',cwd:root}).length,0);
    assert.equal(translateCodex({foo:1}).length,0);
    assert.equal(translateCodex(null).length,0);
    const all=[...edit,...uni,...bash,...prompt,...stop,...sub,...subStop,...started,...ended];
    assert(!JSON.stringify(all).includes('deny'));assert(!JSON.stringify(all).includes('permission'));assert(!JSON.stringify(all).includes('continue'));
    assert(!JSON.stringify(all).includes('"decision"'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Codex hook installer is idempotent and its unmerge is the inverse',()=>{
  const own={model:'gpt',hooks:{PostToolUse:[{matcher:'Bash',hooks:[{type:'command',command:'lint.sh'}]}],Notification:[{hooks:[{type:'command',command:'notify'}]}]}};
  const first=mergeCodex(own),second=mergeCodex(first);
  assert.deepEqual(second,first);
  assert.deepEqual(first.model,'gpt');
  assert.deepEqual(first.hooks.Notification,own.hooks.Notification);
  assert.equal(first.hooks.PostToolUse.length,3);
  assert.deepEqual(first.hooks.PostToolUse[0],own.hooks.PostToolUse[0]);
  assert.equal(first.hooks.PostToolUse[1].matcher,'apply_patch|Edit|Write');
  assert.equal(first.hooks.PostToolUse[2].matcher,'Bash');
  assert.equal(first.hooks.PostToolUse[2].hooks[0].command,codexCommand);assert.equal(first.hooks.PostToolUse[2].hooks[0].timeout,5);
  assert.equal(first.hooks.PreToolUse,undefined);
  assert.equal(first.hooks.PermissionRequest,undefined);
  assert.deepEqual(unmergeCodex(first),own);
  assert.deepEqual(unmergeCodex(mergeCodex({model:'gpt'})),{model:'gpt'});
  assert.deepEqual([...CODEX_EVENTS].sort(),['PostToolUse','SessionEnd','SessionStart','Stop','SubagentStart','SubagentStop','UserPromptSubmit'].sort());
  assert(!CODEX_EVENTS.includes('PreToolUse'));
  assert(!CODEX_EVENTS.includes('PermissionRequest'));
  const leftover=mergeCodex({hooks:{PreToolUse:[{hooks:[{type:'command',command:codexCommand,timeout:5}]},{hooks:[{type:'command',command:'allow.sh'}]}],PostToolUse:[{hooks:[{type:'command',command:codexCommand,timeout:5}]}]}});
  assert.deepEqual(leftover.hooks.PreToolUse,[{hooks:[{type:'command',command:'allow.sh'}]}]);
  assert.equal(leftover.hooks.PostToolUse.some(g=>!g.matcher&&(g.hooks||[]).some(h=>h.command===codexCommand)),false);
  assert(leftover.hooks.PostToolUse.some(g=>g.matcher==='apply_patch|Edit|Write'));
  assert.equal(mergeCodex({hooks:{PreToolUse:[{hooks:[{type:'command',command:codexCommand,timeout:5}]}]}}).hooks.PreToolUse,undefined);
});
test('Codex adapter prints nothing, exits 0, and never emits a deny',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-codex-cli-'));const data=fs.mkdtempSync(path.join(os.tmpdir(),'cr-codex-data-'));
  fs.mkdirSync(path.join(root,'.git'));
  try{
    const payload={hook_event_name:'Stop',session_id:'c1',cwd:root,stop_hook_active:false};
    const r=cp.spawnSync(process.execPath,[path.join(__dirname,'..','scripts','hooks','codex.js')],{
      input:JSON.stringify(payload),encoding:'utf8',env:{...process.env,RESONANCE_DATA:data}});
    assert.equal(r.status,0);assert.equal(r.stdout,'');
    assert(!r.stdout.includes('deny'));assert(!r.stdout.includes('"continue":false'));assert(!r.stderr.includes('deny'));
    const pre=cp.spawnSync(process.execPath,[path.join(__dirname,'..','scripts','hooks','codex.js')],{
      input:JSON.stringify({hook_event_name:'PreToolUse',session_id:'c1',cwd:root,tool_name:'Bash',tool_input:{command:'rm -rf /'}}),
      encoding:'utf8',env:{...process.env,RESONANCE_DATA:data}});
    assert.equal(pre.status,0);assert.equal(pre.stdout,'');
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(data,{recursive:true,force:true});}
});
test('Cursor hook installer is idempotent and its unmerge is the inverse',()=>{
  const own={version:1,hooks:{afterFileEdit:[{command:'format.sh'}],beforeShellExecution:[{command:'block.sh',timeout:10}]}};
  const first=mergeCursor(own),second=mergeCursor(first);
  assert.deepEqual(second,first);
  assert.deepEqual(first.hooks.beforeShellExecution,own.hooks.beforeShellExecution);
  assert.equal(first.hooks.afterFileEdit.length,2);
  assert.equal(first.hooks.afterFileEdit[0].command,'format.sh');
  assert.equal(first.hooks.afterFileEdit[1].command,cursorCommand);assert.equal(first.hooks.afterFileEdit[1].timeout,5);
  assert.equal(first.hooks.subagentStart,undefined);
  assert.deepEqual(unmergeCursor(first),own);
  assert.deepEqual(unmergeCursor(mergeCursor({version:1})),{version:1});
  assert.deepEqual([...CURSOR_EVENTS].sort(),['afterFileEdit','afterShellExecution','sessionEnd','sessionStart','stop','subagentStop'].sort());
  assert(!CURSOR_EVENTS.includes('subagentStart'));
  assert(!CURSOR_EVENTS.some(e=>/^before|preToolUse|Tab|beforeSubmitPrompt|subagentStart/i.test(e)));
  const leftover=mergeCursor({version:1,hooks:{subagentStart:[{command:cursorCommand,timeout:5},{command:'allow.sh'}],afterFileEdit:[{command:'format.sh'}]}});
  assert.deepEqual(leftover.hooks.subagentStart,[{command:'allow.sh'}]);
  assert.equal(mergeCursor({version:1,hooks:{subagentStart:[{command:cursorCommand,timeout:5}]}}).hooks.subagentStart,undefined);
});
test('Cursor adapter prints nothing, exits 0, and never emits a deny',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cr-cursor-cli-'));const data=fs.mkdtempSync(path.join(os.tmpdir(),'cr-cursor-data-'));
  fs.mkdirSync(path.join(root,'.git'));
  try{
    const payload={hook_event_name:'stop',conversation_id:'c1',status:'completed',loop_count:0,cwd:root};
    const r=cp.spawnSync(process.execPath,[path.join(__dirname,'..','scripts','hooks','cursor.js')],{
      input:JSON.stringify(payload),encoding:'utf8',env:{...process.env,RESONANCE_DATA:data}});
    assert.equal(r.status,0);assert.equal(r.stdout,'');
    assert(!r.stdout.includes('deny'));assert(!r.stdout.includes('"continue":false'));assert(!r.stderr.includes('deny'));
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(data,{recursive:true,force:true});}
});

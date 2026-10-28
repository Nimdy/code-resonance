'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {translate}=require('../scripts/hooks/claude-code');
const {merge,unmerge}=require('../scripts/hooks/install-claude-code');
const {translate:translateCursor}=require('../scripts/hooks/cursor');
const {merge:mergeCursor,unmerge:unmergeCursor,EVENTS:CURSOR_EVENTS,command:cursorCommand}=require('../scripts/hooks/install-cursor');
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
    assert.equal(ok[0].meta.exitCode,0);
    const outside=translate({...common,hook_event_name:'PreToolUse',tool_name:'Edit',tool_input:{file_path:'/etc/passwd'}});
    assert.equal(outside[0].file,undefined);
    const sub=translate({...common,agent_id:'agent-9',agent_type:'Explore',hook_event_name:'PreToolUse',tool_name:'Read',tool_input:{}});
    assert.notEqual(sub[0].meta.agent,prompt[0].meta.agent);
    // A read names the file it looks at (so the player can show where an agent works) but is never a modification.
    const read=translate({...common,hook_event_name:'PostToolUse',tool_name:'Read',tool_input:{file_path:path.join(root,'src/ui/App.tsx')},tool_response:{}});
    assert.deepEqual(read.map(e=>e.kind),['agent.tool.completed']);assert.equal(read[0].file,'src/ui/App.tsx');
    const secret=translate({...common,hook_event_name:'PreToolUse',tool_name:'Read',tool_input:{file_path:path.join(root,'.env')}});
    assert.equal(secret[0].file,undefined);
    for(const e of [...prompt,...write,...bash,...ok,...outside,...sub,...read,...secret])validateEvent(e);
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
    const shellDump=JSON.stringify(shell);
    assert(!shellDump.includes(cmdSecret));assert(!shellDump.includes(outSecret));assert(!shellDump.includes('npm test'));
    const stop=translateCursor({...common,hook_event_name:'stop',status:'completed',loop_count:0});
    assert.equal(stop[0].kind,'agent.response.completed');
    const sub=translateCursor({...common,hook_event_name:'subagentStart',subagent_id:'agent-9',subagent_type:'explore',task:'read secrets hunter2'});
    assert.equal(sub[0].kind,'agent.subagent.started');assert.notEqual(sub[0].meta.agent,edit[0].meta.agent);assert(!JSON.stringify(sub).includes('hunter2'));
    const subStop=translateCursor({...common,hook_event_name:'subagentStop',subagent_type:'explore',status:'completed',summary:'contains hunter2'});
    assert.equal(subStop[0].kind,'agent.subagent.stopped');assert(!JSON.stringify(subStop).includes('hunter2'));
    const started=translateCursor({...common,hook_event_name:'sessionStart',session_id:'sess-1',composer_mode:'agent'});
    const ended=translateCursor({...common,hook_event_name:'sessionEnd',session_id:'sess-1',reason:'completed'});
    assert.equal(started[0].kind,'agent.session.started');assert.equal(ended[0].kind,'agent.session.ended');
    const secretFile=translateCursor({...common,hook_event_name:'afterFileEdit',file_path:path.join(root,'.env'),edits:[{old_string:'',new_string:secret}]});
    assert.deepEqual(secretFile.map(e=>e.kind),['agent.tool.completed']);assert.equal(secretFile[0].file,undefined);
    const outside=translateCursor({...common,hook_event_name:'afterFileEdit',file_path:'/etc/passwd',edits:[{old_string:'x',new_string:'y'}]});
    assert.equal(outside[0].file,undefined);
    for(const e of [...edit,...shell,...stop,...sub,...subStop,...started,...ended,...secretFile,...outside])validateEvent(e);
    assert.equal(translateCursor({...common,hook_event_name:'Notification'}).length,0);
    assert.equal(translateCursor({...common,hook_event_name:'beforeShellExecution',command:'rm -rf /'}).length,0);
    assert.equal(translateCursor({...common,hook_event_name:'beforeSubmitPrompt',prompt:'hunter2'}).length,0);
    assert.equal(translateCursor({...common,hook_event_name:'afterTabFileEdit',file_path:path.join(root,'src/a.ts'),edits:[]}).length,0);
    assert.equal(translateCursor({hook_event_name:'PostToolUse',tool_name:'Edit',tool_input:{file_path:path.join(root,'src/a.ts')},cwd:root}).length,0);
    assert.equal(translateCursor({hook_event_name:'afterFileEdit',cwd:root}).length,0);
    const all=[...edit,...shell,...stop,...sub,...subStop,...started,...ended];
    assert(!JSON.stringify(all).includes('deny'));assert(!JSON.stringify(all).includes('permission'));assert(!JSON.stringify(all).includes('continue'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Cursor hook installer is idempotent and its unmerge is the inverse',()=>{
  const own={version:1,hooks:{afterFileEdit:[{command:'format.sh'}],beforeShellExecution:[{command:'block.sh',timeout:10}]}};
  const first=mergeCursor(own),second=mergeCursor(first);
  assert.deepEqual(second,first);
  assert.deepEqual(first.hooks.beforeShellExecution,own.hooks.beforeShellExecution);
  assert.equal(first.hooks.afterFileEdit.length,2);
  assert.equal(first.hooks.afterFileEdit[0].command,'format.sh');
  assert.equal(first.hooks.afterFileEdit[1].command,cursorCommand);assert.equal(first.hooks.afterFileEdit[1].timeout,5);
  assert.deepEqual(unmergeCursor(first),own);
  assert.deepEqual(unmergeCursor(mergeCursor({version:1})),{version:1});
  assert.deepEqual([...CURSOR_EVENTS].sort(),['afterFileEdit','afterShellExecution','sessionEnd','sessionStart','stop','subagentStart','subagentStop'].sort());
  assert(!CURSOR_EVENTS.some(e=>/^before|preToolUse|Tab|beforeSubmitPrompt/i.test(e)));
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

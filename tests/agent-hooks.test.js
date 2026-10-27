'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {translate}=require('../scripts/hooks/claude-code');
const {merge}=require('../scripts/hooks/install-claude-code');
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
    const bash=translate({...common,hook_event_name:'PostToolUseFailure',tool_name:'Bash',tool_input:{command:'npm test -- --token=abc'},error:'Exit code 1\nFAIL'});
    assert.equal(bash[0].meta.category,'test');assert.equal(bash[0].meta.exitCode,1);assert(!JSON.stringify(bash).includes('abc'));
    const ok=translate({...common,hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:'npm test'},tool_response:{stdout:'',stderr:'',interrupted:false}});
    assert.equal(ok[0].meta.exitCode,0);
    const outside=translate({...common,hook_event_name:'PreToolUse',tool_name:'Edit',tool_input:{file_path:'/etc/passwd'}});
    assert.equal(outside[0].file,undefined);
    const sub=translate({...common,agent_id:'agent-9',agent_type:'Explore',hook_event_name:'PreToolUse',tool_name:'Read',tool_input:{}});
    assert.notEqual(sub[0].meta.agent,prompt[0].meta.agent);
    for(const e of [...prompt,...write,...bash,...ok,...outside,...sub])validateEvent(e);
    assert.equal(translate({...common,hook_event_name:'Notification'}).length,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Hook installer is idempotent and preserves existing settings',()=>{
  const first=merge({permissions:{allow:['Bash(ls)']},hooks:{PostToolUse:[{matcher:'Edit',hooks:[{type:'command',command:'lint'}]}]}});
  const second=merge(first);
  assert.deepEqual(second,first);
  assert.deepEqual(first.permissions,{allow:['Bash(ls)']});
  assert.equal(first.hooks.PostToolUse.length,2);
});

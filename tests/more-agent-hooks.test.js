'use strict';
// The observe-only adapters after Claude Code, Cursor and Codex (Gemini CLI, Qwen Code, GitHub Copilot, Factory Droid,
// Grok Build, goose). Every fixture is in the payload shape the tool's documentation gives (the URL is in each adapter's
// header); shapes the documentation does not give must become no events.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {validateEvent}=require('../receiver/protocol');
const registry=require('../scripts/hooks/registry');
const HOOKS=path.join(__dirname,'..','scripts','hooks');
const gemini=require('../scripts/hooks/gemini'),qwen=require('../scripts/hooks/qwen'),copilot=require('../scripts/hooks/copilot');
const droid=require('../scripts/hooks/droid'),grok=require('../scripts/hooks/grok'),goose=require('../scripts/hooks/goose');
const SECRET='Sekret_Body_Qx',CMD_SECRET='Sekret_Cmd_Qx',PROMPT='add login with password hunter2';
function project(t,prefix){const root=fs.mkdtempSync(path.join(os.tmpdir(),prefix));fs.mkdirSync(path.join(root,'.git'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
const kinds=events=>events.map(e=>e.kind);
const leaks=(events,...needles)=>needles.filter(n=>JSON.stringify(events).includes(n));
function valid(events){for(const e of events)validateEvent(e);}
test('Gemini CLI payloads become privacy-preserving, valid events',t=>{
  const root=project(t,'cr-gemini-hook-');
  const common={session_id:'g-1',transcript_path:'/tmp/t.json',cwd:root,timestamp:'2026-10-30T10:00:00Z'};
  const start=gemini.translate({...common,hook_event_name:'SessionStart',source:'startup'});
  assert.deepEqual(kinds(start),['agent.session.started']);assert.equal(start[0].meta.reason,'startup');
  assert.equal(start[0].meta.provider,'gemini');assert.equal(start[0].meta.source,'gemini-hook');assert.equal(start[0].sessionId,'gemini-g-1');
  const prompt=gemini.translate({...common,hook_event_name:'BeforeAgent',prompt:PROMPT});
  assert.deepEqual(kinds(prompt),['agent.prompt.submitted']);assert.equal(prompt[0].meta.length,PROMPT.length);assert.deepEqual(leaks(prompt,'hunter2'),[]);
  const write=gemini.translate({...common,hook_event_name:'AfterTool',tool_name:'write_file',tool_input:{file_path:path.join(root,'src/api/stats.ts'),content:SECRET},
    tool_response:{llmContent:`wrote ${SECRET}`,returnDisplay:'ok'}});
  assert.deepEqual(kinds(write),['agent.tool.completed','agent.file.modified']);assert.equal(write[0].file,'src/api/stats.ts');assert.equal(write[0].meta.tool,'Write');
  assert.equal(write[0].meta.result,'succeeded');
  const replace=gemini.translate({...common,hook_event_name:'AfterTool',tool_name:'replace',tool_input:{file_path:'src/lib/x.ts',old_string:SECRET,new_string:SECRET,instruction:SECRET},tool_response:{}});
  assert.equal(replace[1].file,'src/lib/x.ts');assert.equal(replace[1].meta.tool,'Edit');
  const failed=gemini.translate({...common,hook_event_name:'AfterTool',tool_name:'replace',tool_input:{file_path:'src/lib/x.ts'},tool_response:{error:'no match'}});
  assert.deepEqual(kinds(failed),['agent.tool.completed']);assert.equal(failed[0].meta.result,'failed');assert.equal(failed[0].file,undefined);
  const read=gemini.translate({...common,hook_event_name:'AfterTool',tool_name:'read_file',tool_input:{file_path:path.join(root,'README.md')},tool_response:{}});
  assert.deepEqual(kinds(read),['agent.tool.completed']);assert.equal(read[0].file,'README.md');assert.equal(read[0].meta.tool,'Read');
  // The documented payload has no exit code: a command's outcome is unknown unless the tool reports an error.
  const shell=gemini.translate({...common,hook_event_name:'AfterTool',tool_name:'run_shell_command',tool_input:{command:`npm test -- --token=${CMD_SECRET}`,dir_path:'.'},
    tool_response:{llmContent:`FAIL ${SECRET}`,returnDisplay:'Exit Code: 1'}});
  assert.equal(shell[0].meta.tool,'Bash');assert.equal(shell[0].meta.category,'test');assert.equal(shell[0].meta.exitCode,undefined);assert.equal(shell[0].meta.result,undefined);
  const shellError=gemini.translate({...common,hook_event_name:'AfterTool',tool_name:'run_shell_command',tool_input:{command:'npm run build'},tool_response:{error:'spawn failed'}});
  assert.equal(shellError[0].meta.category,'build');assert.equal(shellError[0].meta.result,'failed');
  const stop=gemini.translate({...common,hook_event_name:'AfterAgent',prompt:PROMPT,prompt_response:`done ${SECRET}`,stop_hook_active:false});
  assert.deepEqual(kinds(stop),['agent.response.completed']);
  const end=gemini.translate({...common,hook_event_name:'SessionEnd',reason:'exit'});
  assert.deepEqual(kinds(end),['agent.session.ended']);
  const secret=gemini.translate({...common,hook_event_name:'AfterTool',tool_name:'write_file',tool_input:{file_path:path.join(root,'.env'),content:SECRET},tool_response:{}});
  const outside=gemini.translate({...common,hook_event_name:'AfterTool',tool_name:'write_file',tool_input:{file_path:'/etc/passwd'},tool_response:{}});
  assert.deepEqual(kinds(secret),['agent.tool.completed']);assert.equal(secret[0].file,undefined);assert.equal(outside[0].file,undefined);
  const all=[...start,...prompt,...write,...replace,...failed,...read,...shell,...shellError,...stop,...end,...secret,...outside];
  assert.deepEqual(leaks(all,SECRET,CMD_SECRET,'hunter2','npm test','.env'),[]);valid(all);
  // Events that can deny or rewrite, and shapes the documentation does not give: no events.
  for(const x of [{...common,hook_event_name:'BeforeTool',tool_name:'write_file',tool_input:{file_path:'a.ts'}},{...common,hook_event_name:'BeforeModel',llm_request:{}},
    {...common,hook_event_name:'Notification',notification_type:'ToolPermission',message:'x'},{...common,hook_event_name:'AfterTool',tool_name:'write_file'},
    {hook_event_name:'SessionStart',cwd:root},{...common,hook_event_name:'PostToolUse',tool_name:'write_file',tool_input:{file_path:'a.ts'}},
    {hookEventName:'SessionStart',sessionId:'x'},{...common,hook_event_name:'BeforeAgent'},null,[],'SessionStart'])assert.deepEqual(gemini.translate(x),[],JSON.stringify(x));
});
test('Qwen Code payloads become privacy-preserving, valid events',t=>{
  const root=project(t,'cr-qwen-hook-');
  const common={session_id:'q-1',transcript_path:'/tmp/t.jsonl',cwd:root,timestamp:'2026-10-30T10:00:00Z',permission_mode:'default'};
  const start=qwen.translate({...common,hook_event_name:'SessionStart',source:'startup',model:'qwen3-coder'});
  assert.equal(start[0].kind,'agent.session.started');assert.equal(start[0].meta.provider,'qwen');assert.equal(start[0].meta.reason,'startup');
  const prompt=qwen.translate({...common,hook_event_name:'UserPromptSubmit',prompt:'expanded '+PROMPT,submitted_prompt:PROMPT});
  assert.equal(prompt[0].meta.length,PROMPT.length,'the user’s own text when Qwen Code captured it');assert.deepEqual(leaks(prompt,'hunter2'),[]);
  const legacy=qwen.translate({...common,hook_event_name:'UserPromptSubmit',prompt:PROMPT});
  assert.equal(legacy[0].meta.length,PROMPT.length);
  const now=Date.now();
  const edit=qwen.translate({...common,hook_event_name:'PostToolUse',tool_name:'edit',tool_use_id:'toolu_1',tool_input:{file_path:path.join(root,'src/a.ts'),old_string:SECRET,new_string:SECRET},
    tool_response:{output:SECRET},duration_ms:1200},now);
  assert.deepEqual(kinds(edit),['agent.tool.started','agent.tool.completed','agent.file.modified']);assert.equal(edit[0].ts,now-1200);
  assert.equal(edit[2].file,'src/a.ts');assert.equal(edit[1].meta.tool,'Edit');
  const write=qwen.translate({...common,hook_event_name:'PostToolUse',tool_name:'write_file',tool_input:{file_path:'src/b.ts',content:SECRET},tool_response:{}});
  assert.deepEqual(kinds(write),['agent.tool.completed','agent.file.modified']);assert.equal(write[1].meta.tool,'Write');
  const shell=qwen.translate({...common,hook_event_name:'PostToolUse',tool_name:'run_shell_command',tool_input:{command:`npm test -- --token=${CMD_SECRET}`,directory:'.'},tool_response:{output:SECRET}});
  assert.equal(shell[0].meta.category,'test');assert.equal(shell[0].meta.exitCode,undefined);assert.equal(shell[0].meta.result,undefined);
  const failed=qwen.translate({...common,hook_event_name:'PostToolUseFailure',tool_name:'run_shell_command',tool_input:{command:'npm run lint'},error:`Command failed ${SECRET}`});
  assert.equal(failed[0].meta.result,'failed');assert.equal(failed[0].meta.category,'lint');
  const interrupted=qwen.translate({...common,hook_event_name:'PostToolUseFailure',tool_name:'edit',tool_input:{file_path:'src/a.ts'},error:'x',is_interrupt:true});
  assert.equal(interrupted[0].meta.result,'interrupted');assert.equal(interrupted[0].file,undefined);assert.equal(interrupted.length,1);
  const sub=qwen.translate({...common,hook_event_name:'SubagentStart',agent_id:'a-7',agent_type:'Explorer'});
  const subTool=qwen.translate({...common,agent_id:'a-7',hook_event_name:'PostToolUse',tool_name:'read_file',tool_input:{file_path:'README.md'},tool_response:{}});
  const subStop=qwen.translate({...common,hook_event_name:'SubagentStop',agent_id:'a-7',agent_type:'Explorer',last_assistant_message:SECRET,stop_hook_active:false});
  assert.equal(sub[0].kind,'agent.subagent.started');assert.equal(sub[0].meta.agent,'q-1/a-7');assert.equal(subTool[0].meta.agent,'q-1/a-7');assert.equal(subStop[0].kind,'agent.subagent.stopped');
  assert.notEqual(sub[0].meta.agent,start[0].meta.agent);
  const stop=qwen.translate({...common,hook_event_name:'Stop',stop_hook_active:false,last_assistant_message:`done ${SECRET}`});
  const end=qwen.translate({...common,hook_event_name:'SessionEnd',reason:'prompt_input_exit'});
  assert.equal(stop[0].kind,'agent.response.completed');assert.equal(end[0].kind,'agent.session.ended');
  const all=[...start,...prompt,...legacy,...edit,...write,...shell,...failed,...interrupted,...sub,...subTool,...subStop,...stop,...end];
  assert.deepEqual(leaks(all,SECRET,CMD_SECRET,'hunter2','npm test'),[]);valid(all);
  for(const x of [{...common,hook_event_name:'PreToolUse',tool_name:'run_shell_command',tool_input:{command:'rm -rf /'}},{...common,hook_event_name:'PermissionRequest',tool_name:'edit'},
    {...common,hook_event_name:'PostToolUse',tool_name:'edit'},{...common,hook_event_name:'UserPromptSubmit'},{hook_event_name:'Stop',cwd:root},
    {...common,hook_event_name:'AfterTool',tool_name:'edit',tool_input:{}},{event:'Stop',session_id:'x'},null])assert.deepEqual(qwen.translate(x),[],JSON.stringify(x));
});
test('GitHub Copilot payloads (camelCase, event named by the command) become privacy-preserving, valid events',t=>{
  const root=project(t,'cr-copilot-hook-');
  const common={sessionId:'c-1',timestamp:1704614400000,cwd:root};
  const start=copilot.translate({...common,source:'new'},Date.now(),['sessionStart']);
  assert.equal(start[0].kind,'agent.session.started');assert.equal(start[0].meta.provider,'copilot');assert.equal(start[0].meta.reason,'new');
  const prompt=copilot.translate({...common,prompt:PROMPT},Date.now(),['userPromptSubmitted']);
  assert.equal(prompt[0].kind,'agent.prompt.submitted');assert.equal(prompt[0].meta.length,PROMPT.length);
  // toolArgs is a JSON string in the tutorial, an object in VS Code's fixtures: both are read, for bash's command only.
  const bash=copilot.translate({...common,toolName:'bash',toolArgs:JSON.stringify({command:`npm test -- --token=${CMD_SECRET}`}),toolResult:{resultType:'success',textResultForLlm:SECRET}},Date.now(),['postToolUse']);
  assert.equal(bash[0].meta.tool,'Bash');assert.equal(bash[0].meta.category,'test');assert.equal(bash[0].meta.exitCode,undefined);assert.equal(bash[0].meta.result,undefined);
  const bashObject=copilot.translate({...common,toolName:'bash',toolArgs:{command:'npm run build'},toolResult:{resultType:'success',textResultForLlm:''}},Date.now(),['postToolUse']);
  assert.equal(bashObject[0].meta.category,'build');
  const failed=copilot.translate({...common,toolName:'bash',toolArgs:'{"command":"npm test"}',error:`exit 1 ${SECRET}`},Date.now(),['postToolUseFailure']);
  assert.equal(failed[0].meta.result,'failed');
  // create and edit: the documented arguments name no file, so none is reported (nothing guessed from toolArgs).
  const edit=copilot.translate({...common,toolName:'edit',toolArgs:{path:path.join(root,'src/a.ts'),old_str:SECRET,new_str:SECRET},toolResult:{resultType:'success',textResultForLlm:''}},Date.now(),['postToolUse']);
  assert.deepEqual(kinds(edit),['agent.tool.completed']);assert.equal(edit[0].meta.tool,'Edit');assert.equal(edit[0].file,undefined);assert.equal(edit[0].meta.result,'succeeded');
  const subStart=copilot.translate({...common,transcriptPath:'/tmp/t',agentName:'explore',agentDescription:SECRET},Date.now(),['subagentStart']);
  const subStop=copilot.translate({...common,transcriptPath:'/tmp/t',agentId:'s-9',agentType:'explore',agentName:'explore',response:SECRET,stopReason:'end_turn'},Date.now(),['subagentStop']);
  assert.equal(subStart[0].kind,'agent.subagent.started');assert.equal(subStop[0].kind,'agent.subagent.stopped');assert.equal(subStart[0].meta.agent,subStop[0].meta.agent);
  const stop=copilot.translate({...common,transcriptPath:'/tmp/t',stopReason:'end_turn',stop_hook_active:false},Date.now(),['agentStop']);
  const end=copilot.translate({...common,reason:'user_exit'},Date.now(),['sessionEnd']);
  assert.equal(stop[0].kind,'agent.response.completed');assert.equal(end[0].kind,'agent.session.ended');
  const all=[...start,...prompt,...bash,...bashObject,...failed,...edit,...subStart,...subStop,...stop,...end];
  assert.deepEqual(leaks(all,SECRET,CMD_SECRET,'hunter2','npm test','src/a.ts'),[]);valid(all);
  // No event name, a deny-capable event, the snake_case (PascalCase-registered) format: no events.
  for(const [x,argv] of [[{...common,toolName:'bash',toolArgs:'{}'},[]],[{...common,toolName:'bash',toolArgs:'{"command":"rm -rf /"}'},['preToolUse']],
    [{...common,toolName:'bash'},['permissionRequest']],[{hook_event_name:'PostToolUse',session_id:'c-1',cwd:root,tool_name:'bash',tool_input:{}},['postToolUse']],
    [{...common},['userPromptSubmitted']],[{cwd:root,source:'new'},['sessionStart']],[{...common,error:{message:'x'}},['errorOccurred']],[null,['sessionStart']]])
    assert.deepEqual(copilot.translate(x,Date.now(),argv),[],JSON.stringify([x,argv]));
});
test('Factory Droid payloads become privacy-preserving, valid events',t=>{
  const root=project(t,'cr-droid-hook-');
  const common={session_id:'d-1',transcript_path:'/tmp/s.jsonl',cwd:root,permission_mode:'off'};
  const start=droid.translate({...common,hook_event_name:'SessionStart',source:'startup'});
  assert.equal(start[0].meta.provider,'droid');assert.equal(start[0].kind,'agent.session.started');
  // The reference's example payload (a Create of file_path), as PostToolUse.
  const create=droid.translate({...common,hook_event_name:'PostToolUse',tool_name:'Create',tool_input:{file_path:path.join(root,'file.txt'),content:SECRET},tool_response:{}});
  assert.deepEqual(kinds(create),['agent.tool.completed','agent.file.modified']);assert.equal(create[1].file,'file.txt');assert.equal(create[1].meta.tool,'Write');
  // Edit's arguments are not documented: an edit without a file.
  const edit=droid.translate({...common,hook_event_name:'PostToolUse',tool_name:'Edit',tool_input:{file_path:'src/a.ts',old_str:SECRET},tool_response:{}});
  assert.deepEqual(kinds(edit),['agent.tool.completed']);assert.equal(edit[0].file,undefined);assert.equal(edit[0].meta.tool,'Edit');
  const exec=droid.translate({...common,hook_event_name:'PostToolUse',tool_name:'Execute',tool_input:{command:`npm test -- --token=${CMD_SECRET}`},tool_response:{output:SECRET}});
  assert.equal(exec[0].meta.tool,'Bash');assert.equal(exec[0].meta.category,'test');assert.equal(exec[0].meta.exitCode,undefined);
  const prompt=droid.translate({...common,hook_event_name:'UserPromptSubmit',prompt:PROMPT,has_images:false});
  assert.equal(prompt[0].meta.length,PROMPT.length);
  const sub=droid.translate({...common,hook_event_name:'SubagentStop',task_name:'review',task_result:SECRET,task_error:null,stop_hook_active:false});
  assert.equal(sub[0].kind,'agent.subagent.stopped');assert.equal(sub[0].meta.agent,'d-1/review');
  const stop=droid.translate({...common,hook_event_name:'Stop',stop_hook_active:false,tool_execution_count:3,elapsed_time:1000});
  const end=droid.translate({...common,hook_event_name:'SessionEnd',reason:'other',session_duration_ms:10,message_count:2});
  assert.equal(stop[0].kind,'agent.response.completed');assert.equal(end[0].kind,'agent.session.ended');
  const all=[...start,...create,...edit,...exec,...prompt,...sub,...stop,...end];
  assert.deepEqual(leaks(all,SECRET,CMD_SECRET,'hunter2','npm test'),[]);valid(all);
  for(const x of [{...common,hook_event_name:'PreToolUse',tool_name:'Execute',tool_input:{command:'rm -rf /'}},{...common,hook_event_name:'Notification',message:'x',notification_type:'idle_prompt'},
    {...common,hook_event_name:'PostToolUse',tool_name:'Create'},{...common,hook_event_name:'SubagentStop'},{hook_event_name:'Stop',cwd:root},null])assert.deepEqual(droid.translate(x),[],JSON.stringify(x));
});
test('Grok Build payloads (camelCase) become privacy-preserving, valid events',t=>{
  const root=project(t,'cr-grok-hook-');
  const common={sessionId:'k-1',cwd:path.join(root,'src'),workspaceRoot:root};
  const start=grok.translate({...common,hookEventName:'SessionStart'});
  assert.equal(start[0].kind,'agent.session.started');assert.equal(start[0].meta.provider,'grok');
  // toolInput's fields are not documented: the tool by name only, never a file or the input.
  const tool=grok.translate({...common,hookEventName:'PostToolUse',toolName:'edit_file',toolInput:{path:path.join(root,'src/a.ts'),content:SECRET}});
  assert.deepEqual(kinds(tool),['agent.tool.completed']);assert.equal(tool[0].meta.tool,'edit_file');assert.equal(tool[0].file,undefined);assert.equal(tool[0].meta.result,'succeeded');
  const failed=grok.translate({...common,hookEventName:'PostToolUseFailure',toolName:'run_command',toolInput:{command:`npm test ${CMD_SECRET}`}});
  assert.equal(failed[0].meta.result,'failed');assert.equal(failed[0].meta.category,undefined);
  const prompt=grok.translate({...common,hookEventName:'UserPromptSubmit',prompt:PROMPT});
  assert.equal(prompt[0].kind,'agent.prompt.submitted');assert.equal(prompt[0].meta.length,undefined,'the prompt field is not documented: not read');
  const stop=grok.translate({...common,hookEventName:'Stop'}),end=grok.translate({...common,hookEventName:'SessionEnd'});
  assert.equal(stop[0].kind,'agent.response.completed');assert.equal(end[0].kind,'agent.session.ended');
  const all=[...start,...tool,...failed,...prompt,...stop,...end];
  assert.deepEqual(leaks(all,SECRET,CMD_SECRET,'hunter2','npm test','src/a.ts'),[]);valid(all);
  // The project is the workspace root Grok reports (the payload's cwd may be a folder inside it).
  assert.equal(start[0].projectId,require('../sdk/project-id').projectIdForRoot(root));
  for(const x of [{...common,hookEventName:'PreToolUse',toolName:'run_command',toolInput:{}},{...common,hookEventName:'SubagentStart'},{...common,hookEventName:'PostToolUse'},
    {hook_event_name:'SessionStart',session_id:'k-1',cwd:root},{cwd:root,hookEventName:'Stop'},null])assert.deepEqual(grok.translate(x),[],JSON.stringify(x));
});
test('goose payloads become privacy-preserving, valid events',t=>{
  const root=project(t,'cr-goose-hook-');
  const saved=process.env.PLUGIN_ROOT;process.env.PLUGIN_ROOT=path.join(root,'.agents','plugins','code-resonance');
  t.after(()=>{if(saved===undefined)delete process.env.PLUGIN_ROOT;else process.env.PLUGIN_ROOT=saved;});
  const {projectIdForRoot}=require('../sdk/project-id');
  // Session events carry no directory: the project is the one the plugin folder is in.
  const start=goose.translate({event:'SessionStart',session_id:'abc-123'});
  assert.equal(start[0].kind,'agent.session.started');assert.equal(start[0].meta.provider,'goose');assert.equal(start[0].projectId,projectIdForRoot(root));
  const prompt=goose.translate({event:'UserPromptSubmit',session_id:'abc-123',matcher_context:PROMPT,message:PROMPT});
  assert.equal(prompt[0].meta.length,PROMPT.length);
  // The documented tool-event example, then write and edit with their documented `path`.
  const shell=goose.translate({event:'PostToolUse',session_id:'abc-123',matcher_context:'shell',tool_name:'shell',tool_input:{command:`rg TODO ${CMD_SECRET}`},working_dir:root,tool_call_id:'t1'});
  assert.equal(shell[0].meta.tool,'Bash');assert.equal(shell[0].meta.exitCode,undefined);assert.equal(shell[0].meta.result,undefined);
  const tests=goose.translate({event:'PostToolUse',session_id:'abc-123',tool_name:'shell',tool_input:{command:'npm test'},working_dir:root});
  assert.equal(tests[0].meta.category,'test');
  const write=goose.translate({event:'PostToolUse',session_id:'abc-123',tool_name:'write',tool_input:{path:path.join(root,'src/new.rs'),content:SECRET},working_dir:root});
  assert.deepEqual(kinds(write),['agent.tool.completed','agent.file.modified']);assert.equal(write[1].file,'src/new.rs');
  const edit=goose.translate({event:'PostToolUse',session_id:'abc-123',tool_name:'edit',tool_input:{path:'src/lib.rs',before:SECRET,after:SECRET},working_dir:root});
  assert.equal(edit[1].file,'src/lib.rs');assert.equal(edit[1].meta.tool,'Edit');
  const failed=goose.translate({event:'PostToolUseFailure',session_id:'abc-123',tool_name:'shell',tool_input:{command:'cargo build'},working_dir:root});
  assert.equal(failed[0].meta.result,'failed');assert.equal(failed[0].meta.category,'build');
  const stop=goose.translate({event:'Stop',session_id:'abc-123',last_assistant_message:`Done. ${SECRET}`});
  const end=goose.translate({event:'SessionEnd',session_id:'abc-123'});
  assert.equal(stop[0].kind,'agent.response.completed');assert.equal(stop[0].meta.length,`Done. ${SECRET}`.length);assert.equal(end[0].kind,'agent.session.ended');
  const env=goose.translate({event:'PostToolUse',session_id:'abc-123',tool_name:'write',tool_input:{path:path.join(root,'.env'),content:SECRET},working_dir:root});
  assert.equal(env[0].file,undefined);assert.equal(env.length,1);
  const all=[...start,...prompt,...shell,...tests,...write,...edit,...failed,...stop,...end,...env];
  assert.deepEqual(leaks(all,SECRET,CMD_SECRET,'hunter2','rg TODO'),[]);valid(all);
  for(const x of [{event:'PreToolUse',session_id:'abc-123',tool_name:'shell',tool_input:{command:'sudo rm'}},{event:'AfterFileEdit',session_id:'abc-123',matcher_context:'src/a.rs'},
    {event:'PostToolUse',session_id:'abc-123',tool_name:'write'},{event:'UserPromptSubmit',session_id:'abc-123'},{event:'Stop'},{hook_event_name:'Stop',session_id:'abc-123'},null])
    assert.deepEqual(goose.translate(x),[],JSON.stringify(x));
});
// ---- Installers: idempotent, inverse, keep the user's own hooks, never the events that can deny ----------------------
const DENY={gemini:['BeforeTool','BeforeModel','BeforeToolSelection'],qwen:['PreToolUse','PermissionRequest'],copilot:['preToolUse','permissionRequest'],
  droid:['PreToolUse'],grok:['PreToolUse'],goose:['PreToolUse']};
const flatOf=settings=>{const m=settings.hooks&&typeof settings.hooks==='object'?settings.hooks:settings;return m;};
const commandsIn=(groups)=>(groups||[]).flatMap(g=>g&&Array.isArray(g.hooks)?g.hooks.map(h=>h.command):[g?.command]);
for(const tool of registry){
  const slug=tool.INFO.slug;
  test(`${tool.INFO.name} installer is idempotent, keeps the user's own hooks, and its unmerge is the inverse`,()=>{
    const isFlat=slug==='copilot',wrap=map=>slug==='droid'?map:{hooks:map};
    const mine=isFlat?{type:'command',command:'my-own-hook.sh',timeoutSec:3}:{type:'command',command:'my-own-hook.sh'};
    const group=e=>isFlat?[mine]:[{...(e.startsWith('Post')||e==='AfterTool'||e==='postToolUse'?{matcher:'.*'}:{}),hooks:[mine]}];
    const deny=DENY[slug][0];
    const own={...(slug==='droid'?{}:{model:'kept',other:{x:1}}),...wrap({[tool.EVENTS[0]]:group(tool.EVENTS[0]),[deny]:group(deny)})};
    const first=tool.merge(own),second=tool.merge(first);
    assert.deepEqual(second,first,'idempotent');
    const map=flatOf(first);
    for(const e of tool.EVENTS)assert(commandsIn(map[e]).some(c=>c===tool.command||c.startsWith(`${tool.command} `)),`${slug}: ${e} installed`);
    for(const e of DENY[slug])assert(!commandsIn(map[e]).some(c=>String(c).startsWith(tool.command)),`${slug}: never ${e}`);
    assert(commandsIn(map[tool.EVENTS[0]]).includes('my-own-hook.sh'),'the user’s hook stays');
    assert.deepEqual(map[deny],own.hooks?.[deny]??own[deny],'the user’s hook on a deny-capable event stays as it was');
    if(slug!=='droid'){assert.equal(first.model,'kept');assert.deepEqual(first.other,{x:1});}
    assert.deepEqual(tool.unmerge(first),own,'unmerge restores the file');
    assert.deepEqual(tool.unmerge(tool.merge({})),slug==='droid'?{}:{});
    assert.deepEqual(tool.unmerge(own),own,'nothing of ours: unchanged');
    // An earlier handler of ours on an event that can deny is taken out on the next install.
    const leftover=tool.merge(wrap({[deny]:isFlat?[{type:'command',command:`${tool.command} ${deny}`},mine]:[{hooks:[{type:'command',command:tool.command},mine]}]}));
    assert(!commandsIn(flatOf(leftover)[deny]).some(c=>String(c).startsWith(tool.command)),`${slug}: leftover ${deny} handler removed`);
    assert(commandsIn(flatOf(leftover)[deny]).includes('my-own-hook.sh'));
    for(const e of tool.EVENTS)assert(!DENY[slug].includes(e));
  });
}
test('Installers write only their documented file, print with --print, and refuse the home directory',t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'cr-home-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const proj=path.join(home,'my-app');fs.mkdirSync(proj);
  const key=process.platform==='win32'?'USERPROFILE':'HOME';
  for(const tool of registry){
    const script=path.join(HOOKS,`install-${tool.INFO.slug}.js`),env={...process.env,[key]:home};
    const refused=cp.spawnSync(process.execPath,[script,home],{encoding:'utf8',env});
    assert.equal(refused.status,1,tool.INFO.slug);assert.match(refused.stderr,/home directory/);
    assert.equal(fs.existsSync(path.join(home,tool.INFO.file)),false,`${tool.INFO.slug}: nothing written in the home directory`);
    const printed=cp.spawnSync(process.execPath,[script,proj,'--print'],{encoding:'utf8',env});
    assert.equal(printed.status,0);assert.deepEqual(JSON.parse(printed.stdout),tool.merge({}));
    assert.equal(fs.existsSync(path.join(proj,tool.INFO.file)),false,'--print writes nothing');
    const wrote=cp.spawnSync(process.execPath,[script,proj],{encoding:'utf8',env});
    assert.equal(wrote.status,0,wrote.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj,tool.INFO.file),'utf8')),tool.merge({}));
    const again=cp.spawnSync(process.execPath,[script,proj],{encoding:'utf8',env});
    assert.equal(again.status,0);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj,tool.INFO.file),'utf8')),tool.merge({}),'running it twice changes nothing');
  }
});
test('The new adapters print nothing and exit 0 on documented, undocumented and malformed input',t=>{
  const root=project(t,'cr-more-cli-'),data=fs.mkdtempSync(path.join(os.tmpdir(),'cr-more-data-'));t.after(()=>fs.rmSync(data,{recursive:true,force:true}));
  const cases=[['gemini.js',[],{hook_event_name:'AfterAgent',session_id:'g',cwd:root,prompt_response:'x'}],['gemini.js',[],{hook_event_name:'BeforeTool',session_id:'g',cwd:root,tool_name:'write_file',tool_input:{}}],
    ['qwen.js',[],{hook_event_name:'Stop',session_id:'q',cwd:root}],['qwen.js',[],{hook_event_name:'PreToolUse',session_id:'q',cwd:root,tool_name:'run_shell_command',tool_input:{command:'rm -rf /'}}],
    ['copilot.js',['agentStop'],{sessionId:'c',timestamp:1,cwd:root,stopReason:'end_turn'}],['copilot.js',['preToolUse'],{sessionId:'c',timestamp:1,cwd:root,toolName:'bash',toolArgs:'{"command":"rm -rf /"}'}],
    ['droid.js',[],{hook_event_name:'Stop',session_id:'d',cwd:root}],['grok.js',[],{hookEventName:'Stop',sessionId:'k',cwd:root}],
    ['goose.js',[],{event:'Stop',session_id:'s'}],['goose.js',[],{event:'PreToolUse',session_id:'s',tool_name:'shell',tool_input:{command:'sudo x'}}]];
  for(const [file,argv,payload] of cases)for(const input of [JSON.stringify(payload),'not json','',JSON.stringify([1,2])]){
    const r=cp.spawnSync(process.execPath,[path.join(HOOKS,file),...argv],{input,encoding:'utf8',env:{...process.env,RESONANCE_DATA:data,RESONANCE_PORT:'1'}});
    assert.equal(r.status,0,`${file} ${input.slice(0,30)}`);assert.equal(r.stdout,'',`${file} prints nothing`);
    assert(!/deny|block|"decision"|permissionDecision/.test(r.stderr),file);
  }
  // The documented payloads were spooled (no receiver answered), the others produced nothing.
  const spooled=fs.readdirSync(path.join(data,'spool')).map(n=>JSON.parse(fs.readFileSync(path.join(data,'spool',n),'utf8'))).flat();
  assert.deepEqual([...new Set(spooled.map(e=>e.meta.provider))].sort(),['copilot','droid','gemini','goose','grok','qwen']);
  assert.equal(spooled.length,6);
});
test('Registry entries describe what the page shows and match their adapters',()=>{
  const {PROVIDERS}=require('../engine/providers');
  assert.deepEqual(registry.map(t=>t.INFO.slug),['gemini','qwen','copilot','droid','grok','goose']);
  for(const t of registry){
    const i=t.INFO;
    assert(Object.hasOwn(PROVIDERS,i.provider),`${i.provider} is catalogued`);
    assert.match(i.docs,/^https:\/\//);assert(i.captured.length&&i.excluded.length&&i.trust&&i.commit);
    assert(!path.isAbsolute(i.file)&&!i.file.includes('..'),i.file);
    assert.equal(t.adapter,path.join(HOOKS,`${i.slug}.js`));assert(fs.readFileSync(t.adapter,'utf8').includes(i.docs.replace(/\/$/,'').split('/').slice(2,3)[0]),`${i.slug}: the adapter cites its documentation`);
    assert(require('../package.json').scripts[`hooks:${i.slug}`]===`node scripts/hooks/install-${i.slug}.js`);
  }
});
test('The extension offers every tool the receiver can plan hooks for, with the same file',()=>{
  const {AGENTS}=require('../extension/agent-hooks');const registry=require('../scripts/hooks/registry');
  for(const t of registry){const a=AGENTS[t.INFO.slug];assert(a,`${t.INFO.slug} in the extension's menu`);assert.equal(a.file,t.INFO.file);
    assert(require('node:fs').existsSync(require('node:path').join(__dirname,'..','scripts','hooks',a.adapter)),a.adapter);}
  for(const id of ['claude','cursor','codex'])assert(AGENTS[id]);
});

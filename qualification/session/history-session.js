'use strict';
// Builds a real-code development session from a repository's history: each commit's changed source files become
// typing summaries, document snapshots and a commit, spread over a target duration. Events are written to a receiver
// journal exactly as the receiver would (validated, content in blobs, monotonic receivedAt), so the real worker
// interprets them as a live session. Timing is planned and compressed; the code changes are real.
// Usage: node session/history-session.js <repo> <out-data-dir> [commits=120] [minutes=30]
const path=require('node:path');
const fs=require('node:fs');
const cp=require('node:child_process');
const zlib=require('node:zlib');
const REPO=path.resolve(__dirname,'../..');
const {validateEvent,sha}=require(path.join(REPO,'receiver/protocol'));
const {isFileEligible}=require(path.join(REPO,'extension/filters'));
const {projectIdForRoot}=require(path.join(REPO,'sdk/project-id'));
const SOURCE=/\.(ts|tsx|js|jsx|mjs|cjs|json|css|html|md)$/;
function git(repo,args,input){return cp.execFileSync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:256*1024*1024,input});}
// Fetch many blobs in one process (works with partial clones).
function blobs(repo,specs){
  if(!specs.length)return new Map();
  const out=cp.execFileSync('git',['cat-file','--batch'],{cwd:repo,input:specs.join('\n')+'\n',maxBuffer:512*1024*1024});
  const result=new Map();let at=0;
  for(const spec of specs){
    const nl=out.indexOf(10,at);const header=out.subarray(at,nl).toString();at=nl+1;
    if(header.endsWith('missing')){continue;}
    const size=Number(header.split(' ')[2]);result.set(spec,out.subarray(at,at+size).toString('utf8'));at+=size+1;
  }
  return result;
}
function build({repo,out,commits=120,minutes=30,start=Date.UTC(2026,9,23,9,0,0)}){
  const list=git(repo,['rev-list','--reverse','--first-parent','HEAD']).trim().split('\n').slice(0,commits);
  const times=list.map(c=>Number(git(repo,['show','-s','--format=%ct',c]).trim())*1000);
  // Compress real gaps (log) and normalise to the target duration, keeping at least 6 s between commits.
  const gaps=times.map((t,i)=>i?Math.log1p(Math.max(0,t-times[i-1])/60000)+.15:0);
  const total=gaps.reduce((a,b)=>a+b,0),span=minutes*60000-60000;
  let clock=start+30000;const plan=list.map((c,i)=>{clock+=Math.max(6000,gaps[i]/total*span);return {commit:c,at:clock};});
  const root=`/workspace/${path.basename(repo)}`,projectId=projectIdForRoot(root);
  const sessionId='history-session';let seq=0,receivedAt=0;
  const events=[];
  const add=(ts,kind,fields={})=>{const e=validateEvent({v:1,id:`hist-${String(++seq).padStart(6,'0')}`,ts:Math.round(ts),kind,projectId,sessionId,origin:'unknown',...fields});
    // Delivery lag of 0.4-2.5 s, as the extension outbox produces; receivedAt never decreases.
    receivedAt=Math.max(receivedAt,Math.round(ts)+400+(seq*7919)%2100);e.receivedAt=receivedAt;events.push(e);};
  add(start,'workspace.started',{name:path.basename(repo)});add(start+500,'project.baseline',{meta:{count:0,truncated:false}});
  let previousAt=start+1000,files=0;
  for(const [i,{commit,at}] of plan.entries()){
    const changes=git(repo,['diff-tree','--no-commit-id','-r','--name-status','-M',...(i===0?['--root']:[]),commit]).trim().split('\n').filter(Boolean).map(l=>l.split('\t'));
    const touched=changes.map(([status,a,b])=>({status:status[0],from:a,file:b||a})).filter(x=>SOURCE.test(x.file)&&isFileEligible(x.file));
    const contents=blobs(repo,touched.filter(x=>x.status!=='D').map(x=>`${commit}:${x.file}`));
    const numstat=Object.fromEntries(git(repo,['diff-tree','--no-commit-id','-r','--numstat',...(i===0?['--root']:[]),commit]).trim().split('\n').filter(Boolean).map(l=>{const [a,d,f]=l.split('\t');return [f,(Number(a)||0)+(Number(d)||0)];}));
    const window=Math.max(3000,at-previousAt);
    touched.forEach((x,j)=>{
      const t=previousAt+window*(j+1)/(touched.length+1);
      if(x.status==='D'){add(t,'file.deleted',{file:x.file});return;}
      const content=contents.get(`${commit}:${x.file}`);if(content===undefined||Buffer.byteLength(content)>150*1024)return;
      const lines=numstat[x.file]||10;
      if(x.status==='A'){add(t-1500,'file.created',{file:x.file});files++;}
      // Typing that produced the change, summarised the way the extension does (counts only).
      for(let k=0;k<Math.min(6,Math.ceil(lines/25));k++)add(t-1200+k*200,'document.edits',{file:x.file,meta:{edits:Math.min(400,lines*4),insertedChars:lines*30,removedChars:lines*4,insertedLines:Math.ceil(lines/2),removedLines:Math.floor(lines/4),windowMs:1000}});
      add(t,'document.snapshot',{file:x.file,content,meta:{reason:'edit',language:path.extname(x.file).slice(1)}});
    });
    add(at,'repository.commit.observed',{meta:{commit:commit.padEnd(40,'0').slice(0,40),parent:(list[i-1]||'').padEnd(40,'0').slice(0,40)}});
    previousAt=at;
  }
  add(start+minutes*60000-1000,'workspace.stopped');
  const dir=path.join(out,'projects',sha(projectId));
  fs.mkdirSync(path.join(dir,'blobs'),{recursive:true});fs.writeFileSync(path.join(dir,'id'),projectId);
  const lines=[];
  for(const e of events){
    if(typeof e.content==='string'){const blob=sha(e.content);const f=path.join(dir,'blobs',blob+'.gz');if(!fs.existsSync(f))fs.writeFileSync(f,zlib.gzipSync(Buffer.from(e.content)));const {content,...rest}=e;lines.push({...rest,contentHash:blob});}
    else lines.push(e);
  }
  fs.writeFileSync(path.join(dir,'events.jsonl'),lines.map(l=>JSON.stringify(l)).join('\n')+'\n');
  return {projectId,commits:list.length,events:events.length,files,start,end:start+minutes*60000,firstCommit:list[0],lastCommit:list.at(-1)};
}
if(require.main===module){
  const [repo,out,commits,minutes]=process.argv.slice(2);
  console.log(JSON.stringify(build({repo:path.resolve(repo),out:path.resolve(out),commits:Number(commits)||120,minutes:Number(minutes)||30})));
}
module.exports={build};

#!/usr/bin/env node
'use strict';
// Streams a fictional three-minute development session to the local receiver in real time, so the live Stage can
// be previewed without VS Code: an app grows, a test fails and is fixed, two (fictional) agents help, a refactor is
// validated and the work is committed. `--fast` posts everything at once instead.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {sha}=require('../receiver/protocol');
const projectId=sha('CODE RESONANCE — FICTIONAL DEMO');
const authPath=path.join(process.env.RESONANCE_DATA||path.join(os.homedir(),'.code-resonance'),'receiver-auth.json');
const auth=JSON.parse(fs.readFileSync(authPath,'utf8'));
const port=Number(process.env.RESONANCE_PORT||auth.port||4174);
const fast=process.argv.includes('--fast');
const sessionId=`demo-${Date.now()}`;
const AGENT={provider:'demo (fictional)',source:'demonstration'};
// The fictional app's files as they grow.
const files={
  'src/notes/store.ts':['export interface Note { id: string; title: string; body: string }','const notes: Note[] = [];',
    'export function listNotes(): Note[] { return notes.slice(); }','export function addNote(note: Note) { notes.push(note); return note; }'],
  'src/ui/NoteCard.tsx':["import type { Note } from '../notes/store';",'export function NoteCard({ note }: { note: Note }) { return <article><h2>{note.title}</h2><p>{note.body}</p></article>; }'],
  'src/ui/NoteList.tsx':["import { listNotes } from '../notes/store';","import { NoteCard } from './NoteCard';",'export function NoteList() { return <section>{listNotes().map(n => <NoteCard note={n} />)}</section>; }'],
  'app/api/notes/route.ts':["import { listNotes, addNote } from '../../../src/notes/store';",'export async function GET() { return Response.json(listNotes()); }','export async function POST(req: Request) { return Response.json(addNote(await req.json())); }'],
  'src/ui/Editor.tsx':["import { addNote } from '../notes/store';",'export function Editor() { const save = (title: string) => addNote({ id: crypto.randomUUID(), title, body: "" }); return <form onSubmit={() => save("Untitled")} />; }'],
  'src/search/index.ts':["import { listNotes } from '../notes/store';",'export function search(q: string) { return listNotes().filter(n => n.title.includes(q)); }','export function rank(q: string) { return search(q).length; }'],
  'src/legacy/format.ts':['export function formatOld(a: string) { return a.trim(); }','export function formatOlder(a: string) { return a.toLowerCase(); }','export function formatOldest(a: string) { return a; }','export function formatAncient(a: string) { return a.toUpperCase(); }']
};
const growth=[];
for(const [file,lines] of Object.entries(files))for(let i=1;i<=lines.length;i++)growth.push({file,content:lines.slice(0,i).join('\n')+'\n'});
const script=[];let t=0;
const at=(dt,kind,fields={})=>{t+=dt;script.push({t,kind,fields});};
at(0,'workspace.started',{name:'demo-orbit-notes'});
at(1,'project.baseline',{meta:{count:0,truncated:false}});
growth.slice(0,10).forEach(g=>{at(5,'document.edits',{file:g.file,meta:{edits:40,insertedChars:180,removedChars:6,insertedLines:2,removedLines:0,windowMs:1000}});at(1.5,'document.snapshot',{file:g.file,content:g.content,meta:{reason:'edit'}});});
at(4,'terminal.command.started',{meta:{category:'test'}});at(3,'terminal.command.finished',{meta:{category:'test',exitCode:1}});
at(8,'diagnostics.updated',{file:'src/ui/NoteList.tsx',meta:{errors:2,warnings:0}});
at(10,'document.snapshot',{file:'src/ui/NoteList.tsx',content:files['src/ui/NoteList.tsx'].join('\n')+'\nexport const EMPTY = "No notes yet";\n',meta:{reason:'edit'}});
at(2,'diagnostics.updated',{file:'src/ui/NoteList.tsx',meta:{errors:0,warnings:0}});
at(5,'terminal.command.finished',{meta:{category:'test',exitCode:0}});
for(const [voice,agent,g] of [[0,'demo-agent-a',growth[10]],[1,'demo-agent-b',growth[13]],[0,'demo-agent-a',growth[14]],[1,'demo-agent-b',growth[16]]]){
  at(6,'agent.prompt.submitted',{meta:{...AGENT,agent,length:64,fingerprint:'demo-no-raw-prompt'}});
  at(3,'agent.tool.started',{file:g.file,meta:{...AGENT,agent,tool:'Edit'}});
  at(2,'agent.tool.completed',{file:g.file,meta:{...AGENT,agent,tool:'Edit',result:'succeeded'}});
  at(.5,'agent.file.modified',{file:g.file,meta:{...AGENT,agent,tool:'Edit'}});
  at(1.5,'document.snapshot',{file:g.file,content:g.content,meta:{reason:'external',source:'filesystem-watcher'}});
}
growth.slice(17).forEach(g=>{at(4,'document.edits',{file:g.file,meta:{edits:30,insertedChars:120,removedChars:2,insertedLines:1,removedLines:0,windowMs:1000}});at(1.5,'document.snapshot',{file:g.file,content:g.content,meta:{reason:'edit'}});});
at(6,'document.snapshot',{file:'src/legacy/format.ts',content:'export function formatOld(a: string) { return a.trim(); }\n',meta:{reason:'edit'}});
at(4,'terminal.command.finished',{meta:{category:'test',exitCode:0}});
at(6,'repository.commit.observed',{meta:{commit:'d'.repeat(40),parent:'c'.repeat(40)}});
at(8,'workspace.stopped');
function request(method,route,body){return new Promise((resolve,reject)=>{
  const text=body?Buffer.from(JSON.stringify(body)):null;
  const req=http.request({hostname:'127.0.0.1',port,method,path:route,headers:{...(text?{'Content-Type':'application/json','Content-Length':text.length}:{}),Authorization:`Bearer ${auth.token}`}},res=>{
    let s='';res.on('data',x=>s+=x);res.on('end',()=>res.statusCode<300?resolve(JSON.parse(s||'{}')):reject(Error(`HTTP ${res.statusCode}: ${s}`)));
  });req.on('error',reject);req.end(text||undefined);
});}
const event=(step,ts)=>({v:1,id:crypto.randomUUID(),ts,kind:step.kind,projectId,sessionId,origin:step.fields.meta?.source==='demonstration'?'hook':'unknown',...step.fields});
(async()=>{
  console.log(`Open http://127.0.0.1:${port}/?project=${projectId} and click Enable sound. Fictional session: ${Math.round(t)} s${fast?' (fast mode)':''}.`);
  if(fast){
    const base=Date.now()-t*1000;
    for(let i=0;i<script.length;i+=20)await request('POST','/v1/events',{events:script.slice(i,i+20).map(s=>event(s,Math.round(base+s.t*1000)))});
    await request('POST',`/v1/flush?id=${projectId}`);
  }else{
    const start=Date.now();
    for(const step of script){
      const wait=start+step.t*1000-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));
      await request('POST','/v1/events',{events:[event(step,Date.now())]});
      if(['terminal.command.finished','agent.prompt.submitted','repository.commit.observed'].includes(step.kind))console.log(`${String(Math.round(step.t)).padStart(3)} s  ${step.kind}${step.fields.meta?.exitCode!==undefined?` (exit ${step.fields.meta.exitCode})`:''}`);
    }
  }
  console.log(`Done: ${script.length} fictional events. The Stage plays them about 10 s behind.`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});

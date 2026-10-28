'use strict';
// npm run film renders from a temporary copy of the data directory (receiver-auth.json included): the copy goes however
// the renderer ends, a signal included, and a signal to the wrapper reaches the renderer. Real processes and signals,
// temporary directories only; no browser.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {tempDir}=require('./helpers');
const COPY=path.join(__dirname,'..','qualification','visual','film-copy.js');
const FILM=path.join(__dirname,'..','scripts','film.js');
const unix={skip:process.platform==='win32'?'POSIX signals':false};
function run(code,args=[]){
  const child=cp.spawn(process.execPath,['-e',code,...args],{stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
  const exited=new Promise(resolve=>child.on('close',(code,signal)=>resolve({code,signal,out})));
  const line=re=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error(`no ${re} in ${out}`)),15000);
    const look=()=>{const m=re.exec(out);if(m){clearTimeout(t);resolve(m);}};child.stdout.on('data',look);look();});
  return {child,exited,line};
}
function source(t){
  const dir=tempDir(t,'cr-film-src-');
  fs.writeFileSync(path.join(dir,'receiver-auth.json'),JSON.stringify({token:'a'.repeat(64)}),{mode:0o600});
  fs.mkdirSync(path.join(dir,'projects'));fs.writeFileSync(path.join(dir,'projects','journal.jsonl'),'{}\n');
  return dir;
}
const holder=(src,marker,stopMs=50)=>`const {temporaryCopy}=require(${JSON.stringify(COPY)});
const {dir}=temporaryCopy(${JSON.stringify(src)},{stop:()=>new Promise(r=>setTimeout(()=>{require('node:fs').writeFileSync(${JSON.stringify(marker)},'stopped');r();},${stopMs}))});
console.log('COPY '+dir);setInterval(()=>{},1000);`;
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143],['SIGHUP',129]]){
  test(`The copy is removed on ${signal}, after the receiver and browser are stopped`,unix,async t=>{
    const src=source(t),marker=path.join(tempDir(t,'cr-film-mark-'),'stopped');
    const p=run(holder(src,marker));
    const [,dir]=await p.line(/COPY (\S+)/);
    assert(fs.existsSync(path.join(dir,'receiver-auth.json')),'the copy holds the token file while it renders');
    p.child.kill(signal);
    const r=await p.exited;
    assert.equal(r.code,code,r.out);
    assert.equal(fs.existsSync(dir),false,'no copy of the data directory is left behind');
    assert.equal(fs.readFileSync(marker,'utf8'),'stopped');
    assert(fs.existsSync(path.join(src,'receiver-auth.json')),'the source is untouched');
  });
}
test('A second signal does not cut the stop short; a stop that hangs is bounded',unix,async t=>{
  const src=source(t);
  const p=run(`const {temporaryCopy}=require(${JSON.stringify(COPY)});
const {dir}=temporaryCopy(${JSON.stringify(src)},{stop:()=>new Promise(()=>{}),graceMs:300});console.log('COPY '+dir);setInterval(()=>{},1000);`);
  const [,dir]=await p.line(/COPY (\S+)/);
  p.child.kill('SIGINT');p.child.kill('SIGINT');
  const r=await p.exited;
  assert.equal(r.code,130,r.out);assert.equal(fs.existsSync(dir),false);
});
test('The copy is removed when the renderer fails or ends normally',async t=>{
  const src=source(t);
  for(const end of ['throw new Error("Requested the GPU but got SwiftShader")','process.exitCode=0']){
    const p=run(`const {temporaryCopy}=require(${JSON.stringify(COPY)});const {dir}=temporaryCopy(${JSON.stringify(src)});console.log('COPY '+dir);${end};`);
    const r=await p.exited;
    const dir=/COPY (\S+)/.exec(r.out)[1];
    assert.equal(fs.existsSync(dir),false,end);
  }
});
test('npm run film passes a signal on to the renderer and waits for it',unix,async t=>{
  const marker=path.join(tempDir(t,'cr-film-fwd-'),'got');
  const renderer=`process.on('SIGTERM',()=>{require('node:fs').writeFileSync(${JSON.stringify(marker)},'SIGTERM');setTimeout(()=>process.exit(143),100);});console.log('READY');setInterval(()=>{},1000);`;
  const p=run(`const {runChild}=require(${JSON.stringify(FILM)});const {spawn}=require('node:child_process');
runChild(spawn,process.execPath,['-e',${JSON.stringify(renderer)}],{stdio:['ignore','inherit','inherit']}).then(c=>{console.log('CODE '+c);process.exitCode=c;});`);
  await p.line(/READY/);
  p.child.kill('SIGTERM');
  const r=await p.exited;
  assert.equal(fs.readFileSync(marker,'utf8'),'SIGTERM');
  assert.match(r.out,/CODE 143/);assert.equal(r.code,143);
});

'use strict';
// World and pack lifecycle memory, isolated from Code Resonance: a blank page (served by the test itself) creates and
// destroys, 40 times per variant, one ingredient of a pack or world switch; a full garbage collection after each, then the
// renderer process's anonymous memory (/proc). A post-collection baseline that keeps rising means memory that stays;
// one that levels off means allocator high-water marks.
//
// node visual/memory-lifecycle.qual.js [--iterations 40] [--gpu amd] [--variants ...] [--out results/memory]
//   worker            a worker that allocates 30 MB, then is terminated
//   worker-webgl      a worker with a WebGL2 context on an OffscreenCanvas (buffers, textures, frames), terminated
//   worker-three      a worker that loads three.js and renders a 70,000-point scene, then is terminated
//   frame-three       the same inside a sandboxed iframe (the real topology), the iframe removed
//   main-three        a three.js renderer on a page canvas, disposed (renderer.dispose()), the canvas dropped
//   main-three-lost   the same with renderer.forceContextLoss() after dispose
const path=require('node:path');
const fs=require('node:fs');
const {REPO,launch,processMemory}=require('./harness');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const N=+arg('iterations',40),GPU=arg('gpu',null);
const VARIANTS=arg('variants','worker,worker-webgl,worker-three,frame-three,main-three,main-three-lost').split(',');
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','memory')));
const THREE=fs.readFileSync(path.join(REPO,'public/vendor/three.module.min.js'));
// The scene a worker or page builds: 70,000 points (Cymatic Field's sand is about 72,000) and a few meshes, 30 frames.
const SCENE=`async function scene(canvas,THREE){const r=new THREE.WebGLRenderer({canvas,antialias:true});r.setSize(1280,720,false);
  const s=new THREE.Scene(),c=new THREE.PerspectiveCamera(50,16/9,.1,100);c.position.z=5;
  const g=new THREE.BufferGeometry(),p=new Float32Array(70000*3);for(let i=0;i<p.length;i++)p[i]=Math.random()*4-2;g.setAttribute('position',new THREE.BufferAttribute(p,3));
  s.add(new THREE.Points(g,new THREE.PointsMaterial({size:.02})));for(let i=0;i<12;i++)s.add(new THREE.Mesh(new THREE.SphereGeometry(.2,32,16),new THREE.MeshStandardMaterial()));
  s.add(new THREE.AmbientLight());const rt=new THREE.WebGLRenderTarget(1280,720,{type:THREE.HalfFloatType});
  for(let f=0;f<30;f++){r.setRenderTarget(rt);r.render(s,c);r.setRenderTarget(null);r.render(s,c);await new Promise(q=>setTimeout(q,16));}
  return {r,s,g,rt};}`;
const WORKER=`self.onmessage=async e=>{const m=e.data;
  if(m.kind==='alloc'){const a=[];for(let i=0;i<30;i++)a.push(new Float32Array(262144).fill(i));postMessage('done');return;}
  if(m.kind==='webgl'){const gl=m.canvas.getContext('webgl2');const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(1<<20),gl.STATIC_DRAW);
    for(let i=0;i<8;i++){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);}
    for(let f=0;f<30;f++){gl.clearColor(f/30,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);await new Promise(q=>setTimeout(q,16));}postMessage('done');return;}
  if(m.kind==='three'){const THREE=await import(m.three);${SCENE}await scene(m.canvas,THREE);postMessage('done');}};`;
const PAGE=`<!doctype html><html><body><script>
  const WORKER=${JSON.stringify(WORKER)},THREEURL=location.origin+'/three.module.min.js',SCENESRC=${JSON.stringify(SCENE)};
  const run=(w,msg,transfer=[])=>new Promise(res=>{w.onmessage=()=>res();w.postMessage(msg,transfer);});
  window.__iter=async variant=>{
    if(variant.startsWith('worker')){const w=new Worker(URL.createObjectURL(new Blob([WORKER],{type:'text/javascript'})));
      if(variant==='worker')await run(w,{kind:'alloc'});
      else{const c=document.createElement('canvas');document.body.append(c);const off=c.transferControlToOffscreen();await run(w,{kind:variant==='worker-webgl'?'webgl':'three',canvas:off,three:THREEURL},[off]);c.remove();}
      w.terminate();return;}
    if(variant==='frame-three'){const f=document.createElement('iframe');f.setAttribute('sandbox','allow-scripts');
      f.srcdoc='<canvas></canvas><script>const W='+JSON.stringify(WORKER)+';onmessage=e=>{const w=new Worker(URL.createObjectURL(new Blob([W],{type:"text/javascript"})));const off=document.querySelector("canvas").transferControlToOffscreen();w.onmessage=()=>parent.postMessage("done","*");w.postMessage({kind:"three",canvas:off,three:e.data},[off]);};<\\/script>';
      document.body.append(f);await new Promise(r=>f.onload=r);await new Promise(res=>{const h=e=>{if(e.source===f.contentWindow){removeEventListener('message',h);res();}};addEventListener('message',h);f.contentWindow.postMessage(THREEURL,'*');});f.remove();return;}
    if(variant.startsWith('main-three')){const THREE=await import(THREEURL);const c=document.createElement('canvas');document.body.append(c);
      const scene=new Function('return '+SCENESRC)();const {r,s,g,rt}=await scene(c,THREE);
      g.dispose();rt.dispose();s.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});r.dispose();if(variant==='main-three-lost')r.forceContextLoss();c.remove();return;}
  };
<\/script></body></html>`;
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const results={};
  for(const variant of VARIANTS){
    const browser=await launch(GPU);
    try{
      const page=await browser.newPage();
      await page.route('http://lifecycle.test/**',r=>r.request().url().endsWith('/three.module.min.js')?r.fulfill({body:THREE,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}}):r.fulfill({body:PAGE,contentType:'text/html'}));
      await page.goto('http://lifecycle.test/');await page.waitForFunction(()=>!!window.__iter);
      const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.enable');
      const mem=async()=>{await cdp.send('HeapProfiler.collectGarbage');await new Promise(r=>setTimeout(r,1500));const all=processMemory();return {renderer:all.renderer};};
      const anon=()=>{const list=[];for(const p of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const cmd=fs.readFileSync(`/proc/${p}/cmdline`,'utf8');if(!/--type=renderer/.test(cmd))continue;
        // only this test's renderer: a descendant of this process
        let pid=+p,ok=false;for(let k=0;k<6&&pid>1;k++){pid=+fs.readFileSync(`/proc/${pid}/stat`,'utf8').split(') ')[1].split(' ')[1];if(pid===process.pid){ok=true;break;}}
        if(ok)list.push(+((/^RssAnon:\s+(\d+)/m.exec(fs.readFileSync(`/proc/${p}/status`,'utf8'))||[])[1]||0)/1024);}catch{}}return +list.reduce((a,b)=>a+b,0).toFixed(1);};
      await mem();const series=[anon()];
      for(let i=1;i<=N;i++){await page.evaluate(v=>window.__iter(v),variant);await mem();series.push(anon());}
      const per=(a,b)=>{const ys=series.slice(a,b),xs=ys.map((_,i)=>i),n=xs.length,mx=xs.reduce((s,v)=>s+v,0)/n,my=ys.reduce((s,v)=>s+v,0)/n;return +(xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/xs.reduce((s,x)=>s+(x-mx)**2,0)).toFixed(3);};
      const half=Math.floor(series.length/2);
      results[variant]={iterations:N,rendererAnonMB:{start:series[0],end:series.at(-1)},perIteration:{all:per(1,series.length),firstHalf:per(1,half),secondHalf:per(half,series.length)},series};
      const r=results[variant];console.log(`${variant.padEnd(16)} renderer anonymous ${r.rendererAnonMB.start} → ${r.rendererAnonMB.end} MB; per iteration ${r.perIteration.all} MB (first half ${r.perIteration.firstHalf}, second half ${r.perIteration.secondHalf})`);
    }finally{await browser.close();}
  }
  const file=path.join(OUT,`memory-lifecycle${GPU?`-${GPU}`:''}.json`);fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),gpu:GPU||'swiftshader',variants:results},null,1));
  console.log(`results: ${path.relative(process.cwd(),file)}`);
})().catch(e=>{console.error(e);process.exitCode=1;});

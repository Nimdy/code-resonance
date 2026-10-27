'use strict';
// Is event-driven renderer growth the player's or the test connection's? The same live session (events that rewrite 20
// fixed modules every 3 s, Stellar Forge, no music, natural garbage collection) in two arms:
//   detached  the browser started directly with the harness's flags, no DevTools connection at all
//   attached  the browser started by Playwright, which enables the DevTools Network domain on every page
//   detached-network  started directly, with one DevTools client that sends only Network.enable (nothing else)
// Both measured only from /proc (the renderer's anonymous memory). The player downloads the whole project view
// (/api/project) each time it changes; a DevTools Network agent keeps fetched response bodies in the renderer.
//
// node visual/memory-detached.qual.js [--minutes 10] [--gpu amd] [--arms detached,attached] [--out results/memory]
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const {chromium}=require('playwright-core');
const {REPO,launch,adminPost}=require('./harness');
const {createService}=require(path.join(REPO,'receiver/server'));
const {sha}=require(path.join(REPO,'receiver/protocol'));
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const GPU=arg('gpu',null),MINUTES=+arg('minutes',10),ARMS=arg('arms','detached,attached').split(',');
const OUT=path.resolve(arg('out',path.join(__dirname,'..','results','memory')));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// The flags Playwright passes to the headless shell (its defaults plus the harness's), without the DevTools pipe.
const FLAGS=['--disable-field-trial-config','--disable-background-networking','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows',
  '--disable-back-forward-cache','--disable-breakpad','--disable-client-side-phishing-detection','--disable-component-update','--no-default-browser-check',
  '--disable-default-apps','--disable-dev-shm-usage','--disable-extensions','--disable-hang-monitor','--disable-ipc-flooding-protection','--disable-popup-blocking',
  '--disable-renderer-backgrounding','--force-color-profile=srgb','--metrics-recording-only','--no-first-run','--password-store=basic','--use-mock-keychain',
  '--headless','--hide-scrollbars','--mute-audio','--no-sandbox','--window-size=1920,1080','--autoplay-policy=no-user-gesture-required',
  ...(GPU==='amd'?['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu']:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])];
const {PULSE_SERVER,...BASE_ENV}=process.env;
const ENV=GPU==='amd'?{...BASE_ENV,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}:BASE_ENV;
// Renderer processes descended from this one: anonymous memory (MB).
function renderers(){
  const kids=new Map();
  for(const p of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const ppid=+fs.readFileSync(`/proc/${p}/stat`,'utf8').split(') ')[1].split(' ')[1];if(!kids.has(ppid))kids.set(ppid,[]);kids.get(ppid).push(+p);}catch{}}
  const out=[];const visit=pid=>{for(const k of kids.get(pid)||[]){try{const cmd=fs.readFileSync(`/proc/${k}/cmdline`,'utf8').split(/\0| /);
    if(cmd.includes('--type=renderer')){const st=fs.readFileSync(`/proc/${k}/status`,'utf8');out.push({pid:k,anon:+((/^RssAnon:\s+(\d+)/m.exec(st)||[])[1]/1024).toFixed(1)});}}catch{}visit(k);}};
  visit(process.pid);return out;
}
const slope=(xs,ys)=>{const n=xs.length;if(n<3)return null;const mx=xs.reduce((a,b)=>a+b)/n,my=ys.reduce((a,b)=>a+b)/n;return +((xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/xs.reduce((a,x)=>a+(x-mx)**2,0))*60).toFixed(2);};
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const results={};
  for(const arm of ARMS){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-detached-')),profile=fs.mkdtempSync(path.join(os.tmpdir(),'cr-detached-profile-'));
    const svc=await createService({port:0,dataDir:dir}).start(),url=`http://127.0.0.1:${svc.port}`,projectId=sha(`memory-detached-${arm}`);
    let n=0,churn=0;const modules=[];
    const ev=(kind,x={})=>({v:1,id:`det-${String(++n).padStart(8,'0')}`,ts:Date.now(),kind,projectId,sessionId:'det',origin:'unknown',...x});
    const post=events=>fetch(url+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${svc.token}`},body:JSON.stringify({events})}).catch(()=>{});
    await post([ev('workspace.started',{name:'memory-detached'}),ev('document.snapshot',{file:'src/a.ts',content:'export function a(){ return 1; }\n',meta:{reason:'edit'}})]);await svc.flush(projectId);
    await adminPost(svc,`/api/recipe?id=${projectId}`,{action:{type:'family',family:'stellar-forge'}});
    // The memory experiment's 'churn' stream: 20 modules of 5 functions, each event rewrites one between two versions.
    const stream=setInterval(()=>{let m;if(modules.length<20){m={name:`c${modules.length}`};modules.push(m);}else m=modules[churn++%20];const v=(m.v=(m.v||0)+1)%2;
      const content=Array.from({length:5},(_,i)=>`export function part${i}(x: number){ return x ${v?'+':'-'} ${i}; }`).join('\n')+'\n';
      void post([ev('document.snapshot',{file:`src/${m.name}.ts`,content,meta:{reason:'edit'}})]);},3000);
    const page=`${url}/?project=${projectId}&world=living&qual=1`;let child=null,browser=null;
    try{
      if(arm.startsWith('detached')){child=cp.spawn(chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux64\/chrome$/,'chromium_headless_shell-$1/chrome-headless-shell-linux64/chrome-headless-shell'),
        // A debugging port nobody connects to until the measurement is over (then: what the page shows).
        [...FLAGS,`--user-data-dir=${profile}`,'--remote-debugging-port=0',page],{env:ENV,stdio:'ignore'});}
      else{browser=await launch(GPU);const p=await browser.newPage({viewport:{width:1920,height:1080}});await p.goto(page);}
      // The one-command client: the page's DevTools socket, Network.enable, then nothing but keeping it open.
      let socket=null;if(arm==='detached-network'){const port=await (async()=>{for(let i=0;i<100;i++){try{return fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{await wait(100);}}})();
        let target=null;for(let i=0;i<100&&!target;i++){target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json()).catch(()=>[])).find(t=>t.type==='page'&&t.url.includes('project='));if(!target)await wait(100);}
        socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{socket.onopen=res;socket.onerror=rej;});socket.send(JSON.stringify({id:1,method:'Network.enable'}));}
      const t0=Date.now(),series=[];
      while(Date.now()-t0<MINUTES*60000){await wait(20000);
        const r=renderers(),view=await fetch(`${url}/api/project?id=${projectId}`).then(x=>x.text()).catch(()=>'');
        series.push({t:+((Date.now()-t0)/1000).toFixed(0),anon:+r.reduce((a,x)=>a+x.anon,0).toFixed(1),renderers:r.length,events:n,projectViewKB:+(Buffer.byteLength(view)/1024).toFixed(1)});
        const s=series.at(-1);console.log(`${arm} ${s.t}s renderer anonymous ${s.anon} MB (${s.renderers} renderer) events ${s.events} project view ${s.projectViewKB} KB`);}
      socket?.close();
      // After the measurement: connect, and record what the page was running (world, frame rate) and a screenshot.
      let state=null;try{const b=browser||await chromium.connectOverCDP(`http://127.0.0.1:${fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]}`);
        const p=b.contexts().flatMap(c=>c.pages()).find(x=>x.url().includes('project='));
        state=await p.evaluate(async()=>{let frames=0;const t0=performance.now();await new Promise(r=>{const f=()=>{frames++;performance.now()-t0<2000?requestAnimationFrame(f):r();};requestAnimationFrame(f);});
          return {world:window.__qual.world(),stats:window.__qual.stats(),fps:+(frames/((performance.now()-t0)/1000)).toFixed(1),viewport:[innerWidth,innerHeight]};});
        await p.screenshot({path:path.join(OUT,`memory-detached-${arm}.jpg`),quality:70,type:'jpeg'});if(!browser)await b.close().catch(()=>{});}catch(e){state={error:String(e).slice(0,200)};}
      const xs=series.map(s=>s.t),ys=series.map(s=>s.anon),half=Math.floor(series.length/2);
      results[arm]={minutes:MINUTES,start:ys[0],end:ys.at(-1),trendMBPerMin:slope(xs,ys),secondHalfMBPerMin:slope(xs.slice(half),ys.slice(half)),projectViewKB:series.at(-1)?.projectViewKB,state,series};
      const r=results[arm];console.log(`${arm}: renderer anonymous ${r.start} → ${r.end} MB; trend ${r.trendMBPerMin} MB/min (second half ${r.secondHalfMBPerMin}); project view ${r.projectViewKB} KB; page ${JSON.stringify(state?.error?state:{world:state?.world?.selectedWorld,family:state?.world?.family,fps:state?.fps,quality:state?.stats?.quality,viewport:state?.viewport})}`);
    }finally{clearInterval(stream);if(child){child.kill('SIGTERM');await wait(1500);}if(browser)await browser.close();await svc.stop();
      fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(profile,{recursive:true,force:true});}
  }
  const file=path.join(OUT,`memory-detached${GPU?`-${GPU}`:''}.json`);fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),gpu:GPU||'swiftshader',arms:results},null,1));
  console.log(`results: ${path.relative(process.cwd(),file)}`);
})().catch(e=>{console.error(e);process.exitCode=1;});

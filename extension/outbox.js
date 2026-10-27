'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const crypto=require('node:crypto');

// The extension never awaits this class from an editor change event.
// Disk batches are written asynchronously, then acknowledged by the receiver.
// Retryable failures (offline, 5xx, auth not yet available) keep batches queued in order. A batch the receiver
// permanently rejects (4xx) is moved to rejected/ so one bad event can never stall all later capture.
const RETRYABLE=new Set([401,403,408,425,429]);
const KEEP_REJECTED=50;
class DurableOutbox {
  constructor({directory,port,authFile=path.join(os.homedir(),'.code-resonance','receiver-auth.json'),onStatus=()=>{},maxBytes=256*1024*1024}){
    this.directory=directory;this.port=port;this.authFile=authFile;this.onStatus=onStatus;this.maxBytes=maxBytes;
    this.buffer=[];this.writing=Promise.resolve();this.delivering=null;this.serial=0;this.closed=false;
    this.timer=null;this.networkTimer=null;this.queuedBytes=0;this.online=false;this.onlineWaiters=[];
  }
  get sending(){return !!this.delivering;}
  async start(){
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});
    for(const name of await fs.readdir(this.directory).catch(()=>[]))if(name.endsWith('.json'))this.queuedBytes+=(await fs.stat(path.join(this.directory,name)).catch(()=>({size:0}))).size;
    this.timer=setInterval(()=>this.persist().catch(e=>this.onStatus('disk-error',e.message)),500);
    this.networkTimer=setInterval(()=>this.deliver().catch(e=>this.onStatus('offline',e.message)),2000);
    this.timer.unref?.();this.networkTimer.unref?.();
    void this.deliver().catch(()=>{});
  }
  // Resolves after the first successful delivery, so bulk work (baseline indexing) is not queued to an absent receiver.
  whenOnline(){return this.online?Promise.resolve():new Promise(resolve=>this.onlineWaiters.push(resolve));}
  enqueue(event){
    if(this.closed) return false;
    if(this.queuedBytes>this.maxBytes&&typeof event.content==='string'){this.onStatus('queue-full',this.queuedBytes);return false;}
    this.buffer.push(event);if(this.buffer.length>=32)void this.persist();return true;
  }
  persist(){
    const next=this.buffer.splice(0);
    if(!next.length)return this.writing;
    const batches=[];let batch=[],length=0;
    for(const event of next) {
      const n=Buffer.byteLength(JSON.stringify(event),'utf8');
      if(batch.length&&(batch.length>=24||length+n>320000)){batches.push(batch);batch=[];length=0;}
      batch.push(event);length+=n;
    }
    if(batch.length)batches.push(batch);
    this.writing=this.writing.catch(()=>{}).then(async()=>{
      await fs.mkdir(this.directory,{recursive:true,mode:0o700});
      for(const events of batches){
        const name=`${String(Date.now()).padStart(14,'0')}-${String(this.serial++).padStart(7,'0')}-${crypto.randomBytes(3).toString('hex')}.json`;
        const full=path.join(this.directory,name);
        const tmp=`${full}.tmp`;
        const body=JSON.stringify({events});
        await fs.writeFile(tmp,body,{mode:0o600});await fs.rename(tmp,full);
        this.queuedBytes+=Buffer.byteLength(body);
      }
    }).catch(e=>{
      // Restore from in-memory payload on persistent write failure.
      this.buffer.unshift(...next);this.onStatus('disk-error',e.message);throw e;
    });
    return this.writing;
  }
  deliver(){
    if(this.delivering)return this.delivering;
    this.delivering=this.deliverOnce().finally(()=>{this.delivering=null;});
    return this.delivering;
  }
  async deliverOnce(){
    await this.persist();
    const auth=JSON.parse(await fs.readFile(this.authFile,'utf8'));
    if(typeof auth.token!=='string'||auth.token.length<40)throw new Error('Receiver authentication missing');
    const names=(await fs.readdir(this.directory)).filter(n=>n.endsWith('.json')).sort();
    let rejected=0;
    for(const name of names.slice(0,80)){
      const file=path.join(this.directory,name);
      const body=await fs.readFile(file);
      const result=await this.post(body,auth.token);
      if(result.statusCode>=400&&result.statusCode<500&&!RETRYABLE.has(result.statusCode)){
        await this.quarantine(name,result);rejected++;continue;
      }
      if(result.statusCode!==202)throw new Error(`Receiver returned HTTP ${result.statusCode}`);
      await fs.unlink(file);this.queuedBytes=Math.max(0,this.queuedBytes-body.length);
    }
    this.online=true;for(const resolve of this.onlineWaiters.splice(0))resolve();
    this.onStatus(rejected?'rejected':'online',rejected||names.length);
  }
  async quarantine(name,result){
    const dir=path.join(this.directory,'rejected');
    await fs.mkdir(dir,{recursive:true,mode:0o700});
    const size=(await fs.stat(path.join(this.directory,name))).size;
    await fs.rename(path.join(this.directory,name),path.join(dir,name));
    this.queuedBytes=Math.max(0,this.queuedBytes-size);
    await fs.writeFile(path.join(dir,name+'.reason'),`HTTP ${result.statusCode}: ${String(result.body).slice(0,500)}\n`,{mode:0o600});
    const kept=(await fs.readdir(dir)).filter(n=>n.endsWith('.json')).sort();
    for(const old of kept.slice(0,Math.max(0,kept.length-KEEP_REJECTED))){await fs.rm(path.join(dir,old),{force:true});await fs.rm(path.join(dir,old+'.reason'),{force:true});}
  }
  post(body,token){
    return new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port:this.port,method:'POST',path:'/v1/events',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'Content-Length':body.length},timeout:5000},res=>{
          let data='';res.on('data',c=>data+=c.toString().slice(0,1000));res.on('end',()=>resolve({statusCode:res.statusCode,body:data}));
        });
      req.on('timeout',()=>req.destroy(new Error('Receiver timeout')));
      req.on('error',reject);req.end(body);
    });
  }
  async close(){
    this.closed=true;clearInterval(this.timer);clearInterval(this.networkTimer);
    await this.persist();
    await this.delivering?.catch(()=>{});
    await this.deliver().catch(e=>this.onStatus('offline',e.message));
  }
}
module.exports={DurableOutbox};

'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const crypto=require('node:crypto');

// The extension never awaits this class from an editor change event.
// Disk batches are written asynchronously, then acknowledged by the receiver.
class DurableOutbox {
  constructor({directory,port,authFile=path.join(os.homedir(),'.code-resonance','receiver-auth.json'),onStatus=()=>{}}){
    this.directory=directory;this.port=port;this.authFile=authFile;this.onStatus=onStatus;
    this.buffer=[];this.writing=Promise.resolve();this.sending=false;this.serial=0;this.closed=false;
    this.timer=null;this.networkTimer=null;
  }
  async start(){
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});
    this.timer=setInterval(()=>this.persist().catch(e=>this.onStatus('disk-error',e.message)),500);
    this.networkTimer=setInterval(()=>this.deliver().catch(e=>this.onStatus('offline',e.message)),2000);
    this.timer.unref?.();this.networkTimer.unref?.();
    void this.deliver().catch(()=>{});
  }
  enqueue(event){if(this.closed) return false;this.buffer.push(event);if(this.buffer.length>=32)void this.persist();return true;}
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
        await fs.writeFile(tmp,JSON.stringify({events}),{mode:0o600});await fs.rename(tmp,full);
      }
    }).catch(e=>{
      // Restore from in-memory payload on persistent write failure.
      this.buffer.unshift(...next);this.onStatus('disk-error',e.message);throw e;
    });
    return this.writing;
  }
  async deliver(){
    if(this.sending)return;this.sending=true;
    try{
      await this.persist();
      const auth=JSON.parse(await fs.readFile(this.authFile,'utf8'));
      if(typeof auth.token!=='string'||auth.token.length<40)throw new Error('Receiver authentication missing');
      const names=(await fs.readdir(this.directory)).filter(n=>n.endsWith('.json')).sort();
      for(const name of names.slice(0,80)){
        const file=path.join(this.directory,name);
        const body=await fs.readFile(file);
        const result=await this.post(body,auth.token);
        if(result.statusCode!==202)throw new Error(`Receiver returned HTTP ${result.statusCode}`);
        await fs.unlink(file);
      }
      this.onStatus('online',names.length);
    }finally{this.sending=false;}
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
    await this.persist();await this.deliver().catch(e=>this.onStatus('offline',e.message));
  }
}
module.exports={DurableOutbox};

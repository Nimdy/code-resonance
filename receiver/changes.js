'use strict';
// GET /api/changes: one Server-Sent Events stream per open Control Center / player window, so a change made in one
// window (or by the CLI, or by arriving events) reaches the others without polling. Messages carry identifiers and
// revisions only; clients re-read the resource they care about.
const HEADERS={'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'keep-alive'};
// A client that stops reading is dropped before its unsent backlog grows without bound.
const MAX_BACKLOG=1024*1024;
function createChanges({max=32,heartbeatMs=25000,activityMs=1000,now=Date.now}={}){
  const clients=new Set(),activity=new Map();let heartbeat=null,closed=false;
  function drop(res){if(!clients.delete(res))return;if(!clients.size&&heartbeat){clearInterval(heartbeat);heartbeat=null;}}
  function send(res,chunk){
    if(res.writableEnded||res.destroyed){drop(res);return;}
    if(res.writableLength>MAX_BACKLOG){drop(res);res.destroy();return;}
    res.write(chunk);
  }
  function broadcast(chunk){for(const res of [...clients])send(res,chunk);}
  // hello: {revision:{settings, presets}} (the integrator reads the current revisions); `at` is added when absent.
  function handle(req,res,hello={}){
    if(closed||clients.size>=max){
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Retry-After':'5'});
      res.end(JSON.stringify({error:'Too many change listeners',code:'too-many-clients'}));return false;
    }
    res.writeHead(200,HEADERS);
    clients.add(res);
    const gone=()=>drop(res);req.on('close',gone);res.on('close',gone);res.on('error',gone);
    // retry: how long a browser's EventSource waits before reconnecting after the receiver restarts.
    res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({...hello,at:hello.at??now()})}\n\n`);
    if(!heartbeat){heartbeat=setInterval(()=>broadcast(':\n\n'),heartbeatMs);heartbeat.unref?.();}
    return true;
  }
  function emit(type,data={}){if(clients.size)broadcast(`data: ${JSON.stringify({...data,type})}\n\n`);}
  // At most one `activity` per project per second; a burst ends with one trailing message carrying its latest stamp.
  function throttledActivity(projectId,receivedAt){
    if(!clients.size||closed)return;
    const t=now(),a=activity.get(projectId)||{last:-Infinity,timer:null,pending:null};activity.set(projectId,a);
    if(!a.timer&&t-a.last>=activityMs){a.last=t;emit('activity',{projectId,receivedAt});return;}
    a.pending=receivedAt;
    if(!a.timer){a.timer=setTimeout(()=>{a.timer=null;a.last=now();const r=a.pending;a.pending=null;emit('activity',{projectId,receivedAt:r});},Math.max(0,a.last+activityMs-t));a.timer.unref?.();}
  }
  function close(){
    closed=true;if(heartbeat){clearInterval(heartbeat);heartbeat=null;}
    for(const a of activity.values())if(a.timer)clearTimeout(a.timer);activity.clear();
    for(const res of [...clients]){clients.delete(res);res.end();}
  }
  return {handle,emit,throttledActivity,count:()=>clients.size,close};
}
module.exports={createChanges};

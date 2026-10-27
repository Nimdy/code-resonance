// Observed agent presences: a pure lifecycle over recorded `agent.state` intents. A presence shows only what hooks
// reported: connected, working on a request, using a tool (with its activity category), reasoning (only when the
// provider exposed it), waiting for the next prompt, completed, disconnected. Silence never looks like work: after
// three minutes without an observation a busy agent reads "status unknown" and dims; a waiting agent goes dormant;
// a disconnected or completed agent departs, and any presence leaves after thirty minutes without an observation (a
// session that ended without telling us never lingers). Labels are categories, never prompts, file names or reasoning.
//
// A fold over intents in time order with bounded memory: each agent keeps its last ten minutes of events plus a
// summary of older ones (arrival, last state, last file). An agent that has departed leaves the fold; the last 512
// departed agents keep their number, so a session that returns after a long silence is still "Agent 3", and numbers
// are never reused. Queries are for times at or after the last recorded intent, as playback, seeks and films ask.
const UNKNOWN_MS=180000,DORMANT_MS=120000,DEPART_MS=3500,COMPLETE_MS=5000,SILENT_MS=1800000,KEEP_MS=600000,RETIRED_MAX=512;
const LABEL={connected:'connected',processing:'working on a request',thinking:'reasoning (visible)',waiting:'waiting for the next prompt',
  completed:'finished',disconnected:'disconnected',unknown:'status unknown',dormant:'idle'};
export function createAgents(){
  let s;
  function reset(){s={agents:new Map(),retired:new Map(),ordinal:0};}
  reset();
  const gone=(a,ts)=>{const e=a.events.at(-1)||a.past;if(!e)return false;
    return ts-e.ts>SILENT_MS||(e.state==='disconnected'&&ts-e.ts>DEPART_MS)||(e.state==='completed'&&ts-e.ts>COMPLETE_MS+DEPART_MS);};
  function record(intent){
    if(intent.type!=='agent.state')return;
    const sub=intent.subject||{},d=intent.detail||{};
    for(const [id,x] of s.agents)if(id!==sub.agentId&&gone(x,intent.ts)){s.agents.delete(id);s.retired.set(id,x.number);if(s.retired.size>RETIRED_MAX)s.retired.delete(s.retired.keys().next().value);}
    let a=s.agents.get(sub.agentId);
    if(!a){const back=s.retired.get(sub.agentId);if(back!==undefined)s.retired.delete(sub.agentId);
      a={id:sub.agentId,voice:sub.voice??0,provider:d.provider||'agent',number:back??++s.ordinal,subagent:!!d.subagent,events:[],first:intent.ts,past:null,home:null};s.agents.set(sub.agentId,a);}
    let i=a.events.length;while(i>0&&a.events[i-1].ts>intent.ts)i--;
    a.events.splice(i,0,{ts:intent.ts,state:d.state||'connected',activity:d.activity||null,fileId:sub.fileId||null});
    a.first=Math.min(a.first,intent.ts);
    while(a.events.length>1&&a.events[0].ts<intent.ts-KEEP_MS){const x=a.events.shift();a.past=x;if(x.fileId)a.home=x.fileId;}
  }
  // Presence at time t: {state (observed), display (with time-based fading), label, activity, fileId, home, alpha}.
  function presence(a,t){
    let e=a.past&&a.past.ts<=t?a.past:null,home=a.home;
    for(const x of a.events){if(x.ts>t)break;e=x;if(x.fileId)home=x.fileId;}
    if(!e)return null;
    const since=t-e.ts;let display=e.state,alpha=1;
    if(since>SILENT_MS)return null;
    if(e.state==='disconnected'){if(since>DEPART_MS)return null;alpha=1-since/DEPART_MS;}
    else if(e.state==='completed'){if(since>COMPLETE_MS+DEPART_MS)return null;if(since>COMPLETE_MS)alpha=1-(since-COMPLETE_MS)/DEPART_MS;}
    else if((e.state==='processing'||e.state==='tool'||e.state==='thinking')&&since>UNKNOWN_MS){display='unknown';alpha=.35;}
    else if((e.state==='waiting'||e.state==='connected')&&since>DORMANT_MS){display='dormant';alpha=.25;}
    const label=display==='tool'?(e.activity||'using a tool'):LABEL[display]||display;
    return {id:a.id,voice:a.voice,number:a.number,provider:a.provider,subagent:a.subagent,state:e.state,display,label,activity:e.activity,fileId:e.state==='tool'?e.fileId:null,
      home,since,arrived:a.first,alpha,busy:display==='processing'||display==='tool'||display==='thinking'};
  }
  function list(t){const out=[];for(const a of s.agents.values()){const p=presence(a,t);if(p)out.push(p);}return out;}
  // Recent tool activity of an agent (for tails, beams): its observed events between t-ms and t (ms <= ten minutes).
  function trail(id,t,ms){const a=s.agents.get(id);return a?a.events.filter(x=>x.ts<=t&&x.ts>t-ms):[];}
  function name(p){return `Agent ${p.number}${p.subagent?' · subagent':''}`;}
  return {record,list,presence:(id,t)=>{const a=s.agents.get(id);return a?presence(a,t):null;},trail,name,reset,
    get agents(){return s.agents;},
    snapshot(){return structuredClone(s);},restore(snap){s=structuredClone(snap);},
    stats(){let events=0;for(const a of s.agents.values())events+=a.events.length;return {agents:s.agents.size,events,numbered:s.ordinal};}};
}

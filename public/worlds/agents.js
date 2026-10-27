// Observed agent presences: a pure lifecycle over recorded `agent.state` intents. A presence shows only what hooks
// reported: connected, working on a request, using a tool (with its activity category), reasoning (only when the
// provider exposed it), waiting for the next prompt, completed, disconnected. Silence never looks like work: after
// three minutes without an observation a busy agent reads "status unknown" and dims; a waiting agent goes dormant;
// a disconnected or completed agent departs. Labels are categories, never prompts, file names or reasoning text.
const UNKNOWN_MS=180000,DORMANT_MS=120000,DEPART_MS=3500,COMPLETE_MS=5000;
const LABEL={connected:'connected',processing:'working on a request',thinking:'reasoning (visible)',waiting:'waiting for the next prompt',
  completed:'finished',disconnected:'disconnected',unknown:'status unknown',dormant:'idle'};
export function createAgents(){
  const agents=new Map();let ordinal=0;
  function record(intent){
    if(intent.type!=='agent.state')return;
    const s=intent.subject||{},d=intent.detail||{};
    let a=agents.get(s.agentId);
    if(!a){a={id:s.agentId,voice:s.voice??0,provider:d.provider||'agent',number:++ordinal,subagent:!!d.subagent,events:[]};agents.set(s.agentId,a);}
    let i=a.events.length;while(i>0&&a.events[i-1].ts>intent.ts)i--;
    a.events.splice(i,0,{ts:intent.ts,state:d.state||'connected',activity:d.activity||null,fileId:s.fileId||null});
  }
  // Presence at time t: {state (observed), display (with time-based fading), label, activity, fileId, home, alpha}.
  function presence(a,t){
    let e=null,home=null,first=null;
    for(const x of a.events){if(x.ts>t)break;e=x;if(first===null)first=x.ts;if(x.fileId)home=x.fileId;}
    if(!e)return null;
    const since=t-e.ts;let display=e.state,alpha=1;
    if(e.state==='disconnected'){if(since>DEPART_MS)return null;alpha=1-since/DEPART_MS;}
    else if(e.state==='completed'){if(since>COMPLETE_MS+DEPART_MS)return null;if(since>COMPLETE_MS)alpha=1-(since-COMPLETE_MS)/DEPART_MS;}
    else if((e.state==='processing'||e.state==='tool'||e.state==='thinking')&&since>UNKNOWN_MS){display='unknown';alpha=.35;}
    else if((e.state==='waiting'||e.state==='connected')&&since>DORMANT_MS){display='dormant';alpha=.25;}
    const label=display==='tool'?(e.activity||'using a tool'):LABEL[display]||display;
    return {id:a.id,voice:a.voice,number:a.number,provider:a.provider,subagent:a.subagent,state:e.state,display,label,activity:e.activity,fileId:e.state==='tool'?e.fileId:null,
      home,since,arrived:first,alpha,busy:display==='processing'||display==='tool'||display==='thinking'};
  }
  function list(t){const out=[];for(const a of agents.values()){const p=presence(a,t);if(p)out.push(p);}return out;}
  // Recent tool activity of an agent (for tails, beams): its observed events between t-ms and t.
  function trail(id,t,ms){const a=agents.get(id);return a?a.events.filter(x=>x.ts<=t&&x.ts>t-ms):[];}
  function name(p){return `Agent ${p.number}${p.subagent?' · subagent':''}`;}
  return {record,list,presence:(id,t)=>{const a=agents.get(id);return a?presence(a,t):null;},trail,name,agents};
}

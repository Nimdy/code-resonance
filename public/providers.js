// CAST catalog (player copy). The browser never imports engine/; tests pin this table against engine/providers.js.
'use strict';
const PROVIDERS={
  'claude-code':{id:'claude-code',display:'Claude',chip:'Claude',seat:0},
  cursor:{id:'cursor',display:'Cursor',chip:'Cursor',seat:1},
  codex:{id:'codex',display:'Codex',chip:'Codex',seat:2},
  grok:{id:'grok',display:'Grok',chip:'Grok',seat:3},
  qwen:{id:'qwen',display:'Qwen',chip:'Qwen',seat:4},
  kimi:{id:'kimi',display:'Kimi',chip:'Kimi',seat:5}
};
const UNKNOWN_SEATS=[6,7];
function hash(value){let h=2166136261;const s=String(value);for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
function titleCase(id){return String(id||'Unknown agent').replace(/(^|[-_ ])([a-z])/g,(m,s,c)=>(s?' ':'')+c.toUpperCase());}
function presence(provider){
  const id=String(provider||'unspecified').slice(0,40);
  if(PROVIDERS[id])return PROVIDERS[id];
  return {id,display:titleCase(id),chip:titleCase(id),seat:UNKNOWN_SEATS[hash(id)%2],unknown:true};
}
const api={PROVIDERS,UNKNOWN_SEATS,presence};
export {PROVIDERS,UNKNOWN_SEATS,presence};
if(typeof module==='object'&&module.exports)module.exports=api;

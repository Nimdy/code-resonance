'use strict';
// CAST catalog: stable presence (display, chip, orchestra seat) per provider id. Unknown ids hash into seats 6–7.
// display and chip are public words (Stage, OBS, films, Last night, packs): an uncatalogued id is only ever "Agent".
// privateName is for the Control Center, which may name the id the agent reported (--provider).
const PROVIDERS={
  'claude-code':{id:'claude-code',display:'Claude',chip:'Claude',seat:0},
  cursor:{id:'cursor',display:'Cursor',chip:'Cursor',seat:1},
  codex:{id:'codex',display:'Codex',chip:'Codex',seat:2},
  grok:{id:'grok',display:'Grok',chip:'Grok',seat:3},
  qwen:{id:'qwen',display:'Qwen',chip:'Qwen',seat:4},
  kimi:{id:'kimi',display:'Kimi',chip:'Kimi',seat:5}
};
const UNKNOWN_SEATS=[6,7];
const PUBLIC_NAME='Agent';
function hash(value){let h=2166136261;const s=String(value);for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
function titleCase(id){return String(id||'Unknown agent').replace(/(^|[-_ ])([a-z])/g,(m,s,c)=>(s?' ':'')+c.toUpperCase());}
function catalogued(provider){return typeof provider==='string'&&Object.hasOwn(PROVIDERS,provider);}
function presence(provider){
  const id=String(provider||'unspecified').slice(0,40);
  if(Object.hasOwn(PROVIDERS,id))return PROVIDERS[id];
  return {id,display:PUBLIC_NAME,chip:PUBLIC_NAME,seat:UNKNOWN_SEATS[hash(id)%2],unknown:true};
}
function privateName(provider){const p=presence(provider);return p.unknown?titleCase(p.id):p.display;}
module.exports={PROVIDERS,UNKNOWN_SEATS,PUBLIC_NAME,catalogued,presence,privateName};

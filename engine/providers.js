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
  kimi:{id:'kimi',display:'Kimi',chip:'Kimi',seat:5},
  // The renderers and the score have eight seats (a colour, a signal shape and a voice each; 6 and 7 also hold the
  // uncatalogued ids), so the providers below share a seat with one above: their chip, callouts and hover cards name
  // them, and the player numbers sessions per chip ("Gemini 2"), never across providers that share a seat.
  // With an observe-only hook adapter (scripts/hooks):
  gemini:{id:'gemini',display:'Gemini',chip:'Gemini',seat:5},
  copilot:{id:'copilot',display:'Copilot',chip:'Copilot',seat:6},
  droid:{id:'droid',display:'Droid',chip:'Droid',seat:7},
  goose:{id:'goose',display:'Goose',chip:'Goose',seat:3},
  // Named for scripts/event.js --provider (no adapter: their tools document no observe-only hooks this one can use):
  opencode:{id:'opencode',display:'OpenCode',chip:'OpenCode',seat:4},
  cline:{id:'cline',display:'Cline',chip:'Cline',seat:6},
  windsurf:{id:'windsurf',display:'Windsurf',chip:'Windsurf',seat:3},
  amp:{id:'amp',display:'Amp',chip:'Amp',seat:7},
  kiro:{id:'kiro',display:'Kiro',chip:'Kiro',seat:5},
  augment:{id:'augment',display:'Augment',chip:'Augment',seat:4},
  junie:{id:'junie',display:'Junie',chip:'Junie',seat:6},
  aider:{id:'aider',display:'Aider',chip:'Aider',seat:7}
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

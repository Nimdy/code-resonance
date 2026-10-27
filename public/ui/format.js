// Formatting for people: relative times, durations, sizes. Unknown stays unknown ("—"), never zero.
export function ago(ts,now=Date.now()){
  if(!Number.isFinite(ts)||ts<=0)return '—';const s=Math.round((now-ts)/1000);
  if(s<0)return 'just now';if(s<10)return 'just now';if(s<60)return `${s} s ago`;
  const m=Math.round(s/60);if(m<60)return `${m} min ago`;const h=Math.round(m/60);if(h<36)return `${h} h ago`;
  const d=Math.round(h/24);if(d<45)return `${d} days ago`;return new Date(ts).toLocaleDateString();
}
export function clockTime(ts){return Number.isFinite(ts)&&ts>0?new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';}
export function dateTime(ts){return Number.isFinite(ts)&&ts>0?new Date(ts).toLocaleString([],{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';}
export function duration(ms){
  if(!Number.isFinite(ms)||ms<0)return '—';const s=Math.round(ms/1000);
  if(s<60)return `${s} s`;const m=Math.floor(s/60);if(m<60)return `${m} min ${String(s%60).padStart(2,'0')} s`;
  const h=Math.floor(m/60);return `${h} h ${String(m%60).padStart(2,'0')} min`;
}
export function timecode(ms){if(!Number.isFinite(ms)||ms<0)ms=0;const s=Math.floor(ms/1000);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
export function bytes(n){if(!Number.isFinite(n))return '—';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`;return `${(n/1073741824).toFixed(2)} GB`;}
export function count(n,one,many=`${one}s`){return `${Number(n||0).toLocaleString()} ${Number(n)===1?one:many}`;}
// The name a person sees for a project in the Control Center: the private workspace name when the extension shared it,
// otherwise a short id. Never used on the Stage, the OBS view or in files (see publicName).
export function projectName(p){return p?.name||(p?.id?`Project ${p.id.slice(0,8)}`:'No project');}
// What the Stage may show: only the approved public title, else a generic name.
export function publicName(recipe){return recipe?.title||'Untitled performance';}
// The world the Stage draws for a living-world identity: its family, unless a composition replaces it with the artist
// canvas (as the world's own caption says, host.js labels).
export function stageWorldName(recipe){return recipe?.composition?.base==='canvas'?'Artist canvas':recipe?.familyName||'Living world';}
export const STYLE_NAMES={ambient:'Ambient',pulse:'Pulse',cinematic:'Cinematic',chip:'Chip'};
export const WORLD_NAMES={living:'Living world',construct:'The Construct',nexus:'Nexus',city:'Monolith',nebula:'Nebula'};
export const LABEL_NAMES={cinematic:'Cinematic',explorer:'Explorer',stream:'Stream',off:'Off'};
export const LABEL_DOCS={cinematic:'Titles and major moments only',explorer:'Click the world to inspect it',stream:'A lower third for streams (no private names)',off:'The world alone'};
export const QUALITY_NAMES={auto:'Auto',0:'High',1:'Medium',2:'Low',3:'Lowest'};

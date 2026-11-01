// The interface's view of the authoritative state. The receiver owns everything that persists (settings, project
// preferences, presets, recipes, packs, evidence); this store mirrors it, refreshes it when the receiver announces a
// change (GET /api/changes, server-sent events), and resolves the *effective* configuration the engine plays:
//   URL pins (OBS bookmarks: ?world= ?style= ?labels=) > project preference > global setting > built-in default.
// Session state (sound, recording, playhead) lives in the engine; device state (quality, where recordings go) in
// localStorage; previews in memory only. Nothing here is a second copy that could drift: every write goes to the
// receiver and comes back.
import {STYLES,TEMPO_MIN,TEMPO_MAX,resolveMusic,engineOptions,pinOf} from './music-profile.js';
const P=window.ResonancePlayer;
const params=new URLSearchParams(location.search);
// ?music= pins the composed score's performance profile ({"mood":.7,"mix":{"perc":0}}), as ?style= pins the style.
const pins={world:P.worldOf(params.get('world')),style:STYLES.includes(params.get('style'))?params.get('style'):null,
  labels:P.LABEL_MODES.includes(params.get('labels'))?params.get('labels'):null,quality:params.has('quality')||params.has('adapt'),captions:params.get('captions')==='0'?false:null,
  profile:pinOf(params.get('music'))};
const DEVICE_KEY='code-resonance-device-v1',UI_KEY='code-resonance-ui-v1',LEGACY_KEY='code-resonance-player-v1';
const readLocal=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')||{};}catch{return {};}};
const writeLocal=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const listeners=new Set(),dirty=new Set();let flushing=false;
function changed(...topics){for(const t of topics)dirty.add(t);if(flushing)return;flushing=true;
  queueMicrotask(()=>{flushing=false;const t=new Set(dirty);dirty.clear();for(const f of listeners){try{f(t);}catch(e){console.error(e);}}});}
// The engine's own notifications reach the same listeners (topics: receiver, model, frame, feed, position, world,
// labels, quality, sound, recording, recipe, preview, packs, notice, export, picked).
P.on(t=>{for(const x of t)dirty.add(x);changed();});
export const state={
  projects:[],projectsLoaded:false,selected:'',settings:null,presets:null,catalog:null,status:null,integrations:null,
  preferences:new Map(),evidence:new Map(),changes:'connecting',others:{recording:null},musicPreview:null,compositions:null,
  device:{quality:'auto',...readLocal(DEVICE_KEY)},ui:readLocal(UI_KEY),errors:{}
};
export function on(f){listeners.add(f);return ()=>listeners.delete(f);}
export const player=P;
// ---- Receiver access ---------------------------------------------------------------------------------------------
// A request the receiver never answered is said in words (still a TypeError, as the engine's requests are).
const offline=e=>{if(!(e instanceof TypeError))throw e;const t=new TypeError('The receiver is not answering (start it again with npm start)');t.offline=true;throw t;};
export async function get(url){const r=await fetch(url,{cache:'no-store'}).catch(offline);const data=await r.json().catch(()=>null);if(!r.ok){const e=new Error(data?.error||`HTTP ${r.status}`);e.status=r.status;e.code=data?.code;throw e;}return data;}
export async function getText(url){const r=await fetch(url,{cache:'no-store'}).catch(offline);if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text();}
export const post=(url,body,o)=>P.api.post(url,body,o);
export async function loadProjects(){
  try{const list=(await get('/api/projects')).projects||[];state.projects=list;state.projectsLoaded=true;delete state.errors.projects;
    if(!state.selected||!list.some(p=>p.id===state.selected)){const want=params.get('project')||state.ui.project;// First choice: the URL's or the last one used; otherwise the most recent real project (the fictional demo only if alone).
      const next=list.find(p=>p.id===want)?.id||list.find(p=>!p.evidence?.demonstration)?.id||list[0]?.id||'';if(next||state.selected)select(next);}
  }catch(e){state.errors.projects=e.message;}
  changed('projects');return state.projects;
}
export async function loadSettings(){try{state.settings=await get('/api/settings');delete state.errors.settings;applyEffective();applyInterface();}catch(e){state.errors.settings=e.message;}changed('settings');return state.settings;}
export async function loadPreferences(id=state.selected){if(!id)return null;try{state.preferences.set(id,await get(`/api/preferences?id=${encodeURIComponent(id)}`));if(id===state.selected)applyEffective();}catch(e){if(e.status===404)state.preferences.delete(id);}changed('preferences');return state.preferences.get(id)||null;}
export async function loadPresets(){try{state.presets=await get('/api/presets');}catch(e){state.errors.presets=e.message;}changed('presets');return state.presets;}
export async function loadCatalog(){try{state.catalog=await get('/api/catalog');}catch(e){state.errors.catalog=e.message;}changed('catalog');return state.catalog;}
export async function loadStatus(){try{state.status=await get('/api/status');delete state.errors.status;}catch(e){state.errors.status=e.message;}changed('status');return state.status;}
export async function loadEvidence(id=state.selected){if(!id)return null;try{const doc=await get(`/api/evidence?id=${encodeURIComponent(id)}`);state.evidence.set(id,doc);}catch(e){if(e.status===404)state.evidence.set(id,null);}changed('evidence');return state.evidence.get(id);}
export async function loadIntegrations(){try{state.integrations=await get('/api/integrations');}catch(e){state.errors.integrations=e.message;}changed('integrations');return state.integrations;}
// Writes: field-level patches (a window only writes the fields its user changed, so it cannot overwrite another
// window's other choices with stale values); the receiver's answer becomes the state.
export async function saveSettings(patch){const next=await post('/api/settings',{patch});state.settings=next;applyEffective();applyInterface();changed('settings');return next;}
export async function savePreferences(patch,id=state.selected){if(!id)throw new Error('No project selected');const next=await post(`/api/preferences?id=${encodeURIComponent(id)}`,{patch});state.preferences.set(id,next);if(id===state.selected)applyEffective();changed('preferences');return next;}
export async function presetAction(body){const next=await post('/api/presets',body);state.presets=next;changed('presets');return next;}
// Artist compositions (receiver compositions.json): one action per write; the answer (with `created` for a new one)
// becomes the state. A refused stale write brings the current library back with it.
export async function loadCompositions(){try{state.compositions=await get('/api/compositions');delete state.errors.compositions;}catch(e){state.errors.compositions=e.message;}changed('compositions');return state.compositions;}
export async function compositionAction(body){
  try{const {created,...next}=await post('/api/compositions',body);state.compositions=next;changed('compositions');return {...next,created};}
  catch(e){if(e.code==='stale'&&e.data?.current){state.compositions=e.data.current;changed('compositions');}throw e;}
}
export const composition=id=>state.compositions?.compositions?.find(c=>c.id===id)||null;
export function setDevice(patch){state.device={...state.device,...patch};writeLocal(DEVICE_KEY,state.device);applyEffective();changed('device');}
// This device's choices made in another window of this browser apply here too.
addEventListener('storage',e=>{if(e.key!==DEVICE_KEY)return;state.device={quality:'auto',...readLocal(DEVICE_KEY)};applyEffective();changed('device');});
// An unsaved draft in a view (a Visual Studio preview, including a classic stage tried locally) blocks recording: a
// recording shows what is saved.
export function setDraft(name){state.draft=name||null;changed('draft');}
export function setUi(patch){state.ui={...state.ui,...patch};writeLocal(UI_KEY,state.ui);}
export function select(id){
  if(id===state.selected)return;state.selected=id||'';setUi({project:state.selected});state.musicPreview=null;
  P.selectProject(state.selected);changed('selection');
  // The recipe says which score the music plays: read it whatever the stage (only the living world loads one itself).
  // A project with no recorded performance yet has no recipe to read (the receiver answers 404): nothing to ask.
  const listed=state.projects.find(p=>p.id===state.selected),performed=!listed||listed.updatedAt!==null||listed.frames>0;
  if(state.selected){void loadPreferences(state.selected);void loadEvidence(state.selected);if(performed)void P.reloadRecipe?.()?.catch(()=>null);}
  applyEffective();
}
export const project=(id=state.selected)=>state.projects.find(p=>p.id===id)||null;
// A choice made in this window replaces the URL's pin for this window (an OBS bookmark keeps its own pins).
export function unpin(key){pins[key]=key==='quality'?false:null;}
export const pinned=key=>!!pins[key];
export const preferences=(id=state.selected)=>state.preferences.get(id)||null;
// ---- Effective configuration --------------------------------------------------------------------------------------
// The music (style, tempo, texture, the composed score's profile and mix) resolves in public/ui/music-profile.js; its score
// version is the one the recipe shown in this window asks for (an unsaved Visual or Artist Studio preview included).
export function effective(id=state.selected){
  const s=state.settings||{},pref=state.preferences.get(id)||{},ps=P.state,here=id===ps.project;
  const {music,sources:ms}=resolveMusic({pins,project:pref.music,global:s.music,recipe:here?ps.preview?.recipe||ps.recipe:null,preview:here&&!!ps.preview});
  const world=pins.world||pref.world||s.stage?.world||'living';
  // The information mode belongs to the project's recipe (null there: follow the global setting).
  const recipe=here?ps.recipe:null,own=recipe?.overrides?.labels||null;
  const labels=pins.labels||(P.overlay?'stream':own||s.stage?.labels||'cinematic');
  return {music,world,labels,captions:pins.captions??(s.stage?.captions!==false),quality:state.device.quality||'auto',profile:s.recording?.profile||'720p',
    recordTo:state.device.recordTo==='disk'?'disk':'memory',
    sources:{world:pins.world?'url':pref.world?'project':'global',...ms,
      labels:pins.labels?'url':P.overlay?'obs':own?'project':'global',captions:pins.captions!==null&&pins.captions!==undefined?'url':'global'}};
}
// Only values whose effective value changed are pushed to the engine: a choice made directly on the engine (a
// qualification hook, a view's local switch) stands until the configuration it came from really changes.
let applied={};
export function applyEffective({force=false}={}){
  if(P.film)return;
  const e=effective(),music=state.musicPreview?{...e.music,...state.musicPreview}:e.music;
  const push=(k,v,fn)=>{const key=JSON.stringify(v);if(!force&&applied[k]===key)return false;applied[k]=key;fn(v);return true;};
  push('project',state.selected,()=>{applied={project:applied.project};});
  push('world',e.world,v=>P.setWorld(v));
  push('music',engineOptions(music),v=>P.setMusic(v));
  push('labels',e.labels,v=>P.setLabels(v));push('captions',e.captions,v=>P.setCaptions(v));
  if(!pins.quality)push('quality',e.quality,v=>P.setQuality(v));
  // The recording size cannot change during a recording: it is applied once the recording ends.
  if(!P.record.active)push('profile',e.profile,v=>P.record.setSize(v));
  // Where recordings go (this device's choice): also applied once a recording ends.
  if(!P.record.active)push('recordTo',e.recordTo,v=>P.record.setTarget(v));
}
function applyInterface(){const m=state.settings?.interface?.motion||'system';if(m==='system')delete document.documentElement.dataset.motion;else document.documentElement.dataset.motion=m;}
// A music preview (Music Studio): flat keys as stored (style, texture, mood, mix, …), heard from the next bar, in this
// window only, until applied or cancelled.
export function previewMusic(patch){state.musicPreview=patch?{...(state.musicPreview||{}),...patch}:null;applyEffective();changed('musicPreview');}
// ---- Change feed ----------------------------------------------------------------------------------------------------
let source=null,retry=null,fallback=null;
function connectChanges(){
  clearTimeout(retry);try{source?.close();}catch{}
  source=new EventSource('/api/changes');state.changes='connecting';changed('changes');
  source.addEventListener('hello',()=>{state.changes='open';changed('changes');clearInterval(fallback);fallback=null;
    // Anything may have changed while disconnected.
    void loadProjects();void loadSettings();void loadPresets();void loadCompositions();void P.reloadPacks();if(state.selected){void loadPreferences();void P.reloadRecipe();}});
  source.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}handleChange(m);};
  source.onerror=()=>{state.changes='closed';changed('changes');try{source.close();}catch{}
    // Without the feed, poll (the receiver may be restarting) and reconnect with backoff.
    if(!fallback)fallback=setInterval(()=>{void loadProjects();void loadStatus();},5000);
    retry=setTimeout(connectChanges,3000);};
}
const throttled=new Map();
function later(key,fn,ms=400){if(throttled.has(key))return;throttled.set(key,setTimeout(()=>{throttled.delete(key);fn();},ms));}
function handleChange(m){
  switch(m.type){
    case 'recipe':if(m.projectId===state.selected)later('recipe',()=>P.reloadRecipe().then(()=>applyEffective()),150);later('projects',loadProjects,800);break;
    case 'preferences':later(`prefs:${m.projectId}`,()=>loadPreferences(m.projectId),150);later('projects',loadProjects,800);break;
    case 'settings':later('settings',loadSettings,150);break;
    case 'presets':later('presets',loadPresets,150);break;
    case 'compositions':later('compositions',loadCompositions,150);break;
    case 'packs':later('packs',()=>{void P.reloadPacks();void loadCatalog();void loadProjects();},250);break;
    case 'projects':later('projects',loadProjects,400);break;
    case 'activity':{const p=project(m.projectId);if(p){p.evidence={...(p.evidence||{}),lastReceivedAt:m.receivedAt};changed('projects');}break;}
    case 'evidence':later(`evidence:${m.projectId}`,()=>{void loadEvidence(m.projectId);void loadProjects();},600);break;
  }
}
// ---- Other windows of this browser (a second Stage, the Control Center): one recording at a time ----------------
const windowId=Math.random().toString(36).slice(2);
const channel='BroadcastChannel' in window?new BroadcastChannel('code-resonance'):null;
const others=new Map();
function announce(){channel?.postMessage({type:'recording',from:windowId,active:P.record.active});}
if(channel){
  channel.onmessage=e=>{const m=e.data||{};if(m.from===windowId)return;
    if(m.type==='hello')announce();
    if(m.type==='recording'){if(m.active)others.set(m.from,Date.now());else others.delete(m.from);state.others.recording=others.size?[...others.keys()][0]:null;changed('others');}
    if(m.type==='bye'){others.delete(m.from);state.others.recording=others.size?[...others.keys()][0]:null;changed('others');}};
  channel.postMessage({type:'hello',from:windowId});
  addEventListener('pagehide',()=>channel.postMessage({type:'bye',from:windowId}));
  // A window that crashed never says goodbye: while another window is said to record, the recorder lock (Web Locks,
  // app.js record.heldElsewhere) is the evidence; once no window holds it, the announcement is stale and goes.
  setInterval(async()=>{if(!others.size||document.hidden)return;
    const held=await P.record.heldElsewhere?.().catch(()=>null);
    if(held===false&&others.size){others.clear();state.others.recording=null;changed('others');}},2000);
}
let wasRecording=false;
P.on(t=>{if(t.has('recording')&&P.record.active!==wasRecording){wasRecording=P.record.active;announce();if(!wasRecording)applyEffective();}if(t.has('recipe')||t.has('preview'))applyEffective();});
// ---- Start -------------------------------------------------------------------------------------------------------
export async function start({presentation=false}={}){
  await Promise.all([loadSettings(),loadProjects()]);
  connectChanges();
  if(presentation)return;
  await migrateLegacy();
  void loadPresets();void loadCatalog();void loadStatus();void loadCompositions();
  setInterval(()=>{if(!document.hidden)void loadStatus();},15000);
}
// The player before 0.5 kept its choices in this browser's storage; they move to the receiver once, so every window
// and the OBS view share them. Quality is about this machine, so it stays here (as a device setting).
async function migrateLegacy(){
  const old=readLocal(LEGACY_KEY);if(!Object.keys(old).length||!state.settings||state.settings.onboarding?.migrated)return;
  const music={};
  if(STYLES.includes(old.style))music.style=old.style;
  for(const k of ['volume','texture'])if(Number.isFinite(old[k])&&old[k]>=0&&old[k]<=1)music[k]=old[k];
  if(['project','manual'].includes(old.tempoMode))music.tempoMode=old.tempoMode;
  if(Number.isInteger(old.tempo)&&old.tempo>=TEMPO_MIN&&old.tempo<=TEMPO_MAX)music.tempo=old.tempo;
  const patch={music,onboarding:{migrated:true}};
  const world=P.worldOf(old.world);if(world)patch.stage={world};
  if(['720p','1080p','stage'].includes(old.recordSize))patch.recording={profile:old.recordSize};
  try{await saveSettings(patch);if(P.QUALITY.includes(old.quality))setDevice({quality:old.quality});try{localStorage.removeItem(LEGACY_KEY);}catch{}}catch(e){console.warn('Settings migration postponed',e.message);}
}

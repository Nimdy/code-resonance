// My creations' actions shared by the Artist Studio and Visual Packs: a composition's music made the project's, and the
// export of a saved composition as a data-only pack. The export dialog is styled by the Artist Studio's stylesheet,
// linked here, so it looks the same wherever it opens.
import {h,field,select,segmented,callout,modal,toast,styles} from './dom.js';
import {count,bytes,STYLE_NAMES} from './format.js';
import {zipStored} from './zip.js';
// A composition's music becomes the project's music preferences: only the keys this receiver keeps for a project.
export async function applyMusicOf(S,c,id=S.state.selected){
  const m=c?.music,pm=S.preferences(id)?.music;if(!m||!pm)return;
  const patch={};if(m.style&&Object.hasOwn(pm,'style'))patch.style=m.style;
  for(const [k,v] of Object.entries(m.profile||{}))if(k!=='mix'&&Object.hasOwn(pm,k))patch[k]=v;
  if(m.profile?.mix&&Object.hasOwn(pm,'mix'))patch.mix={pad:1,bass:1,melody:1,counter:1,arp:1,perc:1,atmos:1,...m.profile.mix};
  if(Object.keys(patch).length)await S.savePreferences({music:patch},id);
}
// ---- Export: the saved composition as a data-only pack (.zip), its contents inspectable before it is downloaded ------
const LICENSES=[['CC-BY-4.0','CC BY 4.0 · others may use it, crediting you'],['CC-BY-SA-4.0','CC BY-SA 4.0 · credit, and share alike'],['CC-BY-NC-4.0','CC BY-NC 4.0 · credit, no commercial use'],
  ['CC0-1.0','CC0 1.0 · public domain'],['proprietary','All rights reserved']];
export async function exportDialog({S,id}){
  const e=S.composition(id);if(!e){toast('Save the composition first.','warning');return;}
  styles('artist');
  const ui=S.state.ui||{};
  const author=h('input',{class:'input',type:'text',maxlength:40,value:ui.artistAuthor||'',placeholder:'Your name or alias','aria-label':'Author',spellcheck:'false'});
  const license=select({label:'License',value:ui.artistLicense||'CC-BY-4.0',options:LICENSES.map(([value,label])=>({value,label}))});
  const desc=h('textarea',{class:'textarea ar-desc',maxlength:280,rows:2,'aria-label':'Description'});desc.value=e.composition.description||'';
  const summary=h('div',{class:'ar-export-summary'},h('p',{class:'faint small',text:'Preparing…'}));
  let pack=null,seq=0;
  async function refresh(){
    const mine=++seq;S.setUi({artistAuthor:author.value.trim(),artistLicense:license.value});
    try{const q=new URLSearchParams({id,author:author.value.trim(),license:license.value,description:desc.value});
      const r=await S.get(`/api/compositions/export?${q}`);if(mine!==seq)return;pack=r;
      const c=r.manifest.declarative.composition,maps=c.layers.reduce((n,l)=>n+l.mappings.length,0)+c.mappings.length;
      summary.replaceChildren(
        h('dl',{class:'kv'},h('dt',{text:'Pack'}),h('dd',{class:'mono',text:`${r.id} · v${r.version}`}),h('dt',{text:'Contains'}),h('dd',{text:`${count(c.layers.length,'layer')}, ${count(maps,'mapping')}${c.finish?`, the ${W_().FINISH_WORDS[c.finish]} finish`:''}${c.music?.style?`, a ${STYLE_NAMES[c.music.style]} music profile`:''}`}),
          h('dt',{text:'Files'}),h('dd',{text:r.files.map(f=>`${f.path} (${bytes(f.size)})`).join(' · ')})),
        callout({kind:'',icon:'shield',title:'Data only',body:'No code, nothing to approve. It never contains your projects, their files or paths, their identities, or anything about this computer.'}));
    }catch(err){if(mine===seq){pack=null;summary.replaceChildren(callout({kind:'danger',icon:'warn',title:'It cannot be exported',body:err.message}));}}
  }
  let t=null;const later=()=>{clearTimeout(t);t=setTimeout(refresh,250);};
  author.addEventListener('input',later);desc.addEventListener('input',later);license.addEventListener('change',later);
  const download=()=>{if(!pack)return false;
    const bytesOf=f=>Uint8Array.from(atob(f.data),ch=>ch.charCodeAt(0));
    const zip=zipStored(pack.files.map(f=>({name:`${pack.folder}/${f.path}`,data:bytesOf(f)})));
    const url=URL.createObjectURL(new Blob([zip],{type:'application/zip'})),a=h('a',{href:url,download:`${pack.folder}.zip`});
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);
    toast(`Exported ${pack.folder}.zip: anyone can import it in Visual Packs → Import a pack.`,'ok');return true;};
  modal({title:`Export “${e.composition.name}”`,subtitle:'A data-only visual pack another Code Resonance can import (Visual Packs → Import a pack).',wide:true,
    body:h('div',{class:'ar-dialog ar-export'},h('div',{class:'ar-export-fields'},field({label:'Author',control:author,doc:'Shown with the pack. Remembered on this device.'}),field({label:'License',control:license}),field({label:'Description',control:desc})),summary),
    actions:[{label:'Inspect contents',icon:'eye',onClick:()=>{if(pack)inspectPack(pack);return false;}},{label:'Close'},{label:'Download .zip',icon:'download',kind:'primary',id:'arExportZip',onClick:download}]});
  void refresh();
}
const W_=()=>globalThis.ResonanceCompositionText||{FINISH_WORDS:{}};
function inspectPack(pack){
  const text_=f=>new TextDecoder().decode(Uint8Array.from(atob(f.data),ch=>ch.charCodeAt(0)));
  const pre=h('pre',{class:'ar-inspect-pre'});let current=pack.files[0];
  const tabs=segmented({label:'File',value:current.path,options:pack.files.map(f=>({value:f.path,label:f.path})),onChange:v=>{current=pack.files.find(f=>f.path===v);pre.textContent=text_(current);}});
  pre.textContent=text_(current);
  modal({title:'Contents of the export',subtitle:`${pack.folder}/ · exactly what the .zip holds`,wide:true,body:h('div',{class:'ar-dialog'},tabs,pre),actions:[{label:'Close'}]});
}

// A small Markdown renderer for documentation and pack READMEs. It builds DOM nodes and sets text only: nothing is
// ever parsed as HTML, so a hostile README can at most look odd. Links: http(s) open in a new tab (no opener);
// links to the bundled documentation open in the viewer; anything else is shown as plain text.
import {h,modal,button} from './dom.js';
import {getText} from './store.js';
export const DOCS={'packs/README.md':'Visual Pack SDK','packs/manifest.md':'Pack manifest','packs/world-api.md':'World API','packs/determinism.md':'Determinism',
  'packs/performance.md':'Performance budgets','packs/security.md':'Pack security','packs/migration.md':'SDK migration','packs/catalogue.md':'Parameter catalogue',
  'FIRST-RUN.md':'Getting started','OBS.md':'OBS','RECORDING.md':'Recording','WSL.md':'WSL','OPERATIONS.md':'Operations','campaign-0.7.md':'0.7.0 campaign','SECURITY.md':'Security and privacy','ARTIST-STUDIO.md':'Artist Studio','MUSIC.md':'Music'};
function inline(textValue,onDoc){
  const out=[];const re=/(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[([^\]]+)\]\(([^)\s]+)\))/g;let last=0,m;
  while((m=re.exec(textValue))){
    if(m.index>last)out.push(textValue.slice(last,m.index));
    if(m[1])out.push(h('code',{text:m[1].slice(1,-1)}));
    else if(m[2])out.push(h('strong',{text:m[2].slice(2,-2)}));
    else if(m[3])out.push(h('em',{text:m[3].slice(1,-1)}));
    else if(m[4])out.push(link(m[5],m[6],onDoc));
    last=re.lastIndex;
  }
  if(last<textValue.length)out.push(textValue.slice(last));
  return out;
}
function link(label,href,onDoc){
  // An external link always says where it goes (a README is untrusted text: its words may not match its target).
  if(/^https?:\/\//i.test(href)){let host='';try{host=new URL(href).host;}catch{return h('span',{class:'md-link',text:label});}return h('span',{class:'md-ext'},h('a',{href,target:'_blank',rel:'noopener noreferrer',title:href,text:label}),h('span',{class:'md-link-host faint',text:` (${host})`}));}
  const doc=resolveDoc(href);
  if(doc&&onDoc)return h('a',{href:'#',text:label,onClick:e=>{e.preventDefault();onDoc(doc);}});
  return h('span',{class:'md-link',text:label});
}
let base='';
function resolveDoc(href){
  const clean=href.split('#')[0];if(!clean)return null;
  const parts=(base?base.split('/').slice(0,-1):[]).concat(clean.split('/'));const stack=[];
  for(const p of parts){if(p==='..')stack.pop();else if(p&&p!=='.')stack.push(p);}
  let path=stack.join('/');if(path.startsWith('docs/'))path=path.slice(5);if(path==='../SECURITY.md')path='SECURITY.md';
  return DOCS[path]?path:null;
}
export function renderMarkdown(source,{onDoc=null,from=''}={}){
  base=from;const root=h('div',{class:'markdown'});const lines=String(source).replace(/\r\n?/g,'\n').split('\n');let i=0;
  const para=[];const flush=()=>{if(para.length){root.append(h('p',{},...inline(para.join(' '),onDoc)));para.length=0;}};
  while(i<lines.length){
    const line=lines[i];
    if(/^```/.test(line)){flush();const code=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);i++;root.append(h('pre',{},h('code',{text:code.join('\n')})));continue;}
    const head=/^(#{1,4})\s+(.*)$/.exec(line);
    if(head){flush();root.append(h(`h${Math.min(4,head[1].length+1)}`,{},...inline(head[2],onDoc)));i++;continue;}
    if(/^\s*([-*]|\d+\.)\s+/.test(line)){flush();const ordered=/^\s*\d+\./.test(line),list=h(ordered?'ol':'ul');
      while(i<lines.length&&/^\s*([-*]|\d+\.)\s+/.test(lines[i])){let item=lines[i].replace(/^\s*([-*]|\d+\.)\s+/,'');i++;
        while(i<lines.length&&/^\s{2,}\S/.test(lines[i])&&!/^\s*([-*]|\d+\.)\s+/.test(lines[i]))item+=' '+lines[i++].trim();
        list.append(h('li',{},...inline(item,onDoc)));}
      root.append(list);continue;}
    if(/^\|/.test(line)&&i+1<lines.length&&/^\|?\s*:?-{3,}/.test(lines[i+1])){flush();const cells=l=>l.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const table=h('table'),thead=h('thead',{},h('tr',{},...cells(line).map(c=>h('th',{},...inline(c,onDoc))))),tbody=h('tbody');i+=2;
      while(i<lines.length&&/^\|/.test(lines[i]))tbody.append(h('tr',{},...cells(lines[i++]).map(c=>h('td',{},...inline(c,onDoc)))));
      table.append(thead,tbody);root.append(h('div',{class:'md-table'},table));continue;}
    if(/^>\s?/.test(line)){flush();const q=[];while(i<lines.length&&/^>\s?/.test(lines[i]))q.push(lines[i++].replace(/^>\s?/,''));root.append(h('blockquote',{},...inline(q.join(' '),onDoc)));continue;}
    if(!line.trim()){flush();i++;continue;}
    para.push(line.trim());i++;
  }
  flush();return root;
}
// The documentation viewer: bundled docs (GET /docs/<name>) in a dialog, links between them followed in place.
export function openDoc(path){
  const body=h('div',{class:'doc-view'},h('p',{class:'muted',text:'Loading…'}));
  const dlg=modal({title:DOCS[path]||path,subtitle:`docs/${path}`.replace('docs/SECURITY.md','SECURITY.md'),body,wide:true,actions:[button({label:'Close',onClick:()=>dlg.close()})]});
  const show=async p=>{body.replaceChildren(h('p',{class:'muted',text:'Loading…'}));
    try{const md=await getText(`/docs/${p}`);body.replaceChildren(renderMarkdown(md,{onDoc:next=>show(next),from:p}));dlg.dialog.querySelector('h2').textContent=DOCS[p]||p;body.scrollTop=0;}
    catch(e){body.replaceChildren(h('p',{class:'danger',text:`This document could not be loaded (${e.message}).`}));}};
  void show(path);return dlg;
}

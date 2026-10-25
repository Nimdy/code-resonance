// Interface toolkit: an element builder and the controls every workspace shares. No framework: views build DOM once
// and update the few nodes that change. Text is always set as text (never parsed as markup), and styles go through
// element.style (the page's content policy refuses inline style attributes).
import {icon} from './icons.js';
export function h(tag,props,...children){
  const el=tag==='svg'||props?.ns==='svg'?document.createElementNS('http://www.w3.org/2000/svg',tag):document.createElement(tag);
  if(props)for(const [k,v] of Object.entries(props)){
    if(v===undefined||v===null||v===false||k==='ns')continue;
    if(k==='class')el.className=Array.isArray(v)?v.filter(Boolean).join(' '):v;
    else if(k==='text')el.textContent=String(v);
    else if(k==='style')Object.assign(el.style,v);
    else if(k==='dataset')Object.assign(el.dataset,v);
    else if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2).toLowerCase(),v);
    else if(k==='ref')v(el);
    else if(k in el&&!['list','form','type','role','for'].includes(k)&&typeof v!=='string')el[k]=v;
    else el.setAttribute(k==='className'?'class':k,v===true?'':String(v));
  }
  append(el,children);return el;
}
export function append(el,children){for(const c of children.flat(Infinity)){if(c===null||c===undefined||c===false)continue;el.append(c instanceof Node?c:document.createTextNode(String(c)));}return el;}
export function clear(el){el.replaceChildren();return el;}
export const text=(el,s)=>{const v=String(s??'');if(el.textContent!==v)el.textContent=v;return el;};
let uid=0;export const id=prefix=>`${prefix||'cr'}-${++uid}`;
// ---- Buttons --------------------------------------------------------------------------------------------------
export function button({label='',icon:ic=null,kind='',size='',title=null,onClick=null,disabled=false,pressed=null,id:elId=null,type='button',attrs={}}={}){
  const b=h('button',{type,class:['btn',kind,size,!label&&ic?'icon':''],title:title||(label?null:attrs['aria-label']),id:elId,disabled,...attrs},ic?icon(ic):null,label?h('span',{text:label}):null);
  if(pressed!==null)b.setAttribute('aria-pressed',String(!!pressed));
  if(onClick)b.addEventListener('click',e=>{const r=onClick(e);if(r&&typeof r.then==='function')busy(b,r);});
  return b;
}
// A button that runs an async action shows that it is working and cannot be pressed twice.
export function busy(b,promise){b.disabled=true;b.setAttribute('aria-busy','true');const done=()=>{b.disabled=false;b.removeAttribute('aria-busy');};promise.then(done,done);return promise;}
export function setLabel(b,label){const s=b.querySelector('span');if(s)text(s,label);else b.append(h('span',{text:label}));}
// ---- Fields ---------------------------------------------------------------------------------------------------
// A labelled control with an optional description, value read-out and reset-to-default.
export function field({label,doc=null,control,value=null,onReset=null,modified=false,inline=false,labelFor=null}){
  const valueEl=value!==null?h('span',{class:'field-value num'},value):null;
  const reset=onReset?button({icon:'reset',kind:'ghost',size:'sm',title:'Reset to default',onClick:onReset,attrs:{'aria-label':`Reset ${label}`,class:'btn ghost sm icon field-reset'}}):null;
  const f=h('div',{class:['field',modified?'modified':'']},
    h('div',{class:'field-head'},h(labelFor?'label':'span',{class:'field-label',for:labelFor},label),valueEl,reset),
    inline?null:control,doc?h('div',{class:'field-doc',text:doc}):null);
  if(inline)f.querySelector('.field-head').append(control);
  f.setValue=v=>{if(valueEl)text(valueEl,v);};f.setModified=m=>f.classList.toggle('modified',!!m);
  return f;
}
export function select({options,value,onChange,label=null,id:elId=null,disabled=false,title=null}){
  const s=h('select',{class:'select',id:elId,disabled,title,'aria-label':label});
  for(const o of options){const opt=h('option',{value:String(o.value),text:o.label});if(o.disabled)opt.disabled=true;s.append(opt);}
  s.value=String(value??'');if(onChange)s.addEventListener('change',()=>onChange(s.value));
  s.setOptions=list=>{const v=s.value;s.replaceChildren(...list.map(o=>{const opt=h('option',{value:String(o.value),text:o.label});if(o.disabled)opt.disabled=true;return opt;}));s.value=v;};
  return s;
}
export function toggle({checked=false,onChange,label=null,disabled=false,id:elId=null}){
  const input=h('input',{type:'checkbox',role:'switch',checked:!!checked,disabled,id:elId});
  const el=h('label',{class:'switch'},input,h('span',{class:'track'}),label?h('span',{text:label}):null);
  if(onChange)input.addEventListener('change',()=>onChange(input.checked));
  el.input=input;el.set=v=>{input.checked=!!v;};return el;
}
export function segmented({options,value,onChange,label,block=false,id:elId=null}){
  const el=h('div',{class:['segmented',block?'block':''],role:'radiogroup','aria-label':label,id:elId});
  const buttons=options.map(o=>{const b=h('button',{type:'button',role:'radio',title:o.title||null,disabled:!!o.disabled,dataset:{value:String(o.value)},text:o.label});
    b.addEventListener('click',()=>{if(String(o.value)===el.value)return;el.set(o.value);onChange?.(o.value);});
    b.addEventListener('keydown',e=>{const i=buttons.indexOf(b),k=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;if(!k)return;e.preventDefault();
      let j=i;do{j=(j+k+buttons.length)%buttons.length;}while(buttons[j].disabled&&j!==i);buttons[j].focus();buttons[j].click();});
    return b;});
  el.append(...buttons);
  el.set=v=>{el.value=String(v);for(const b of buttons){const on=b.dataset.value===el.value;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;}};
  el.set(value);return el;
}
// A bounded number: a slider plus an exact entry. Values outside [min, max] or not on the integer grid are refused.
export function slider({min,max,step=null,value,integer=false,onInput=null,onChange=null,format=v=>String(v),label='Value',id:elId=null,disabled=false,entry=true}){
  step=step??(integer?1:Math.max((max-min)/200,.001));
  const range=h('input',{type:'range',class:'range',min,max,step,value,disabled,id:elId,'aria-label':label});
  const num=entry?h('input',{class:'input num',type:'text',inputmode:'decimal',value:format(value),disabled,'aria-label':`${label} (exact value)`}):null;
  const wrap=h('div',{class:'field-row'},range,num);
  const fill=()=>{range.style.setProperty('--fill',`${((Number(range.value)-min)/((max-min)||1))*100}%`);};
  const clean=v=>{v=Number(v);if(!Number.isFinite(v))return null;if(integer)v=Math.round(v);return Math.min(max,Math.max(min,+v.toFixed(6)));};
  range.addEventListener('input',()=>{fill();const v=clean(range.value);if(num)num.value=format(v);onInput?.(v);});
  range.addEventListener('change',()=>onChange?.(clean(range.value)));
  if(num){
    num.addEventListener('change',()=>{const raw=Number(String(num.value).replace(/[^0-9.eE+-]/g,''));const ok=Number.isFinite(raw)&&raw>=min&&raw<=max&&(!integer||Number.isInteger(raw));
      num.setAttribute('aria-invalid',String(!ok));if(!ok){num.title=`Enter ${integer?'an integer':'a number'} from ${min} to ${max}`;return;}num.title='';
      range.value=String(raw);fill();onInput?.(raw);onChange?.(raw);});
    num.addEventListener('blur',()=>{if(num.getAttribute('aria-invalid')==='true'){num.value=format(clean(range.value));num.setAttribute('aria-invalid','false');}});
  }
  wrap.set=v=>{range.value=String(v);fill();if(num&&document.activeElement!==num)num.value=format(clean(v));};
  wrap.setDisabled=d=>{range.disabled=d;if(num)num.disabled=d;};
  wrap.range=range;fill();return wrap;
}
export function colorInput({value,onChange,label='Colour'}){
  const HEX=/^#[0-9a-f]{6}$/i;
  const picker=h('input',{type:'color',value:HEX.test(value)?value:'#000000','aria-label':label});
  const hex=h('input',{class:'input',type:'text',value,maxlength:7,'aria-label':`${label} (hex)`,spellcheck:'false'});
  picker.addEventListener('input',()=>{hex.value=picker.value;});
  picker.addEventListener('change',()=>{hex.value=picker.value;onChange?.(picker.value);});
  hex.addEventListener('change',()=>{const v=hex.value.trim().toLowerCase();const ok=HEX.test(v);hex.setAttribute('aria-invalid',String(!ok));if(ok){picker.value=v;onChange?.(v);}});
  const el=h('div',{class:'color-field'},picker,hex);
  el.set=v=>{if(HEX.test(v)){picker.value=v;if(document.activeElement!==hex)hex.value=v;}};return el;
}
// ---- Parameter controls generated from validated metadata (engine/catalog.js specs, pack manifests) --------------
// spec: {type:'number'|'integer'|'enum'|'boolean'|'color'|'vec3', min, max, values, doc}. onChange(value) is called
// with valid values only.
export function parameterControl(spec,value,{onInput=null,onChange,label}){
  switch(spec.type){
    case 'number':case 'integer':{const integer=spec.type==='integer',span=spec.max-spec.min,digits=integer?0:span>=20?1:span>=2?2:3;
      return slider({min:spec.min,max:spec.max,integer,value:Number(value),onInput,onChange,label,format:v=>Number(v).toFixed(digits)});}
    case 'enum':{const values=spec.values||[];
      if(values.length<=4&&values.every(v=>String(v).length<=12))return segmented({options:values.map(v=>({value:v,label:humanize(v)})),value,label,onChange:v=>onChange(values.find(x=>String(x)===String(v)))});
      return select({options:values.map(v=>({value:v,label:humanize(v)})),value,label,onChange:v=>onChange(values.find(x=>String(x)===String(v)))});}
    case 'boolean':{const t=toggle({checked:!!value,onChange,label:null});t.input.setAttribute('aria-label',label);return t;}
    case 'color':return colorInput({value,onChange,label});
    case 'vec3':{const v=Array.isArray(value)?value.slice():[1,1,1];const parts=['R','G','B'].map((c,i)=>slider({min:spec.min,max:spec.max,value:v[i],label:`${label} ${c}`,format:x=>Number(x).toFixed(3),
        onInput:x=>{v[i]=x;onInput?.(v.slice());},onChange:x=>{v[i]=x;onChange(v.slice());}}));
      const el=h('div',{class:'vec3'},...parts.map((p,i)=>h('div',{class:'field-row'},h('span',{class:'tiny faint num',text:['R','G','B'][i]}),p)));
      el.set=x=>{if(Array.isArray(x))x.forEach((n,i)=>{v[i]=n;parts[i].set(n);});};return el;}
    default:return h('span',{class:'faint small',text:'Not editable here'});
  }
}
export function humanize(v){const s=String(v).replace(/[-_.]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2');return s.charAt(0).toUpperCase()+s.slice(1);}
export function formatParam(spec,v){if(v===undefined||v===null)return '—';if(spec.type==='number')return Number(v).toFixed(spec.max-spec.min>=20?1:2);if(spec.type==='vec3')return v.map(x=>Number(x).toFixed(2)).join(' ');if(spec.type==='boolean')return v?'On':'Off';return humanize(v);}
// ---- Surfaces -------------------------------------------------------------------------------------------------
export function section({title,subtitle=null,actions=[],id:elId=null},...children){
  return h('section',{class:'section',id:elId},h('div',{class:'section-head'},h('h2',{class:'title-m',text:title}),subtitle?h('span',{class:'faint small',text:subtitle}):null,h('span',{class:'rule'}),actions.length?h('div',{class:'actions'},...actions):null),...children);
}
export function disclosure({summary,open=false,onToggle=null},...children){
  const d=h('details',{class:'disclosure',open},h('summary',{text:summary}),h('div',{class:'disclosure-body'},...children));
  if(onToggle)d.addEventListener('toggle',()=>onToggle(d.open));return d;
}
export function pill(textValue,kind='',{title=null,plain=false}={}){return h('span',{class:['pill',kind,plain?'plain':''],title,text:textValue});}
export function callout({kind='',title=null,body=null,actions=[],icon:ic='info'}){
  return h('div',{class:['callout',kind],role:kind==='danger'?'alert':null},icon(ic),h('div',{class:'callout-body'},title?h('strong',{text:title}):null,body?(body instanceof Node?body:h('div',{text:body})):null,actions.length?h('div',{class:'callout-actions'},...actions):null));
}
export function emptyState({icon:ic='spark',title,body=null,actions=[]}){
  return h('div',{class:'empty'},h('div',{class:'empty-icon'},icon(ic)),h('h3',{text:title}),body?(body instanceof Node?body:h('p',{text:body})):null,actions.length?h('div',{class:'empty-actions'},...actions):null);
}
export function kv(rows){const dl=h('dl',{class:'kv'});for(const [k,v] of rows){if(v===undefined)continue;dl.append(h('dt',{text:k}),h('dd',{},v instanceof Node?v:String(v??'—')));}return dl;}
// A command or URL the user copies (the clipboard needs a user gesture and a secure context: loopback qualifies).
export function copyable(value,{label='Copy',onCopied=null}={}){
  const code=h('code',{text:value});
  const b=button({label,icon:'copy',size:'sm',onClick:async()=>{try{await navigator.clipboard.writeText(value);setLabel(b,'Copied');onCopied?.();setTimeout(()=>setLabel(b,label),1600);}
    catch{const r=document.createRange();r.selectNodeContents(code);const s=getSelection();s.removeAllRanges();s.addRange(r);setLabel(b,'Press Ctrl+C');setTimeout(()=>setLabel(b,label),2400);}}});
  const el=h('div',{class:'copy'},code,b);el.set=v=>{value=v;text(code,v);};return el;
}
// ---- Modal dialog: focus moves in, Tab stays inside, Escape and the backdrop close it, focus returns after -------
export function modal({title,subtitle=null,body,actions=[],wide=false,onClose=null,label=null}){
  const previous=document.activeElement,titleId=id('dlg');
  const close=()=>{backdrop.remove();document.removeEventListener('keydown',onKey,true);onClose?.();if(previous?.isConnected)previous.focus();};
  const dialog=h('div',{class:['modal',wide?'wide':''],role:'dialog','aria-modal':'true','aria-labelledby':titleId,'aria-label':label},
    h('div',{class:'modal-head'},h('div',{class:'grow'},h('h2',{class:'title-l',id:titleId,text:title}),subtitle?h('div',{class:'muted small',text:subtitle}):null),
      button({icon:'close',kind:'ghost',onClick:()=>close(),attrs:{'aria-label':'Close'}})),
    h('div',{class:'modal-body'},body),actions.length?h('div',{class:'modal-foot'},...actions.map(a=>a instanceof Node?a:button({...a,onClick:async e=>{const r=await a.onClick?.(e);if(r!==false)close();}}))):null);
  const backdrop=h('div',{class:'modal-backdrop',onMousedown:e=>{if(e.target===backdrop)close();}},dialog);
  function onKey(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
    if(e.key!=='Tab')return;
    const items=[...dialog.querySelectorAll('button,select,input,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.offsetParent!==null);
    if(!items.length)return;const first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
  document.addEventListener('keydown',onKey,true);document.body.append(backdrop);
  requestAnimationFrame(()=>{(dialog.querySelector('[autofocus]')||dialog.querySelector('.modal-foot .btn')||dialog.querySelector('button'))?.focus();});
  return {close,dialog};
}
export function confirmDialog({title,body,confirm='Confirm',kind='primary',cancel='Cancel'}){
  return new Promise(resolve=>{let answered=false;
    modal({title,body:body instanceof Node?body:h('p',{class:'muted',text:body}),onClose:()=>{if(!answered)resolve(false);},
      actions:[{label:cancel,onClick:()=>{answered=true;resolve(false);}},{label:confirm,kind,onClick:()=>{answered=true;resolve(true);}}]});});
}
// ---- Popover menu anchored to a button -----------------------------------------------------------------------------
export function popover(anchor,build,{align='start',width=null}={}){
  const menu=h('div',{class:'menu',role:'menu'});if(width)menu.style.width=`${width}px`;
  // A menu never outlives its view (it may hold private names, and the Stage must not show them).
  const close=()=>{menu.remove();document.removeEventListener('mousedown',outside,true);document.removeEventListener('keydown',onKey,true);removeEventListener('hashchange',close);anchor.setAttribute('aria-expanded','false');if(anchor.isConnected)anchor.focus();};
  const outside=e=>{if(!menu.contains(e.target)&&!anchor.contains(e.target))close();};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){const items=[...menu.querySelectorAll('.menu-item:not(:disabled)')];if(!items.length)return;e.preventDefault();
      const i=items.indexOf(document.activeElement);items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}};
  append(menu,[build(close)]);document.body.append(menu);
  const r=anchor.getBoundingClientRect(),m=menu.getBoundingClientRect();
  let left=align==='end'?r.right-m.width:r.left;left=Math.max(8,Math.min(left,innerWidth-m.width-8));
  let top=r.bottom+6;if(top+m.height>innerHeight-8)top=Math.max(8,r.top-m.height-6);
  menu.style.left=`${left}px`;menu.style.top=`${top}px`;anchor.setAttribute('aria-expanded','true');
  document.addEventListener('keydown',onKey,true);addEventListener('hashchange',close);
  // The click that opened the menu must not count as a click outside it.
  setTimeout(()=>{document.addEventListener('mousedown',outside,true);(menu.querySelector('[aria-checked="true"]')||menu.querySelector('.menu-item'))?.focus();});
  return {close,menu};
}
export function menuItem({label,sub=null,icon:ic=null,checked=null,onClick,disabled=false}){
  const b=h('button',{type:'button',class:'menu-item',role:checked===null?'menuitem':'menuitemradio',disabled},ic?icon(ic):null,h('span',{class:'grow'},h('strong',{text:label}),sub?h('span',{text:sub}):null));
  if(checked!==null)b.setAttribute('aria-checked',String(!!checked));b.addEventListener('click',onClick);return b;
}
// ---- Toasts ----------------------------------------------------------------------------------------------------
let toastHost=null;
export function toast(message,kind='info',{timeout=kind==='error'?9000:5200,action=null}={}){
  if(!toastHost){toastHost=h('div',{class:'toasts',role:'status','aria-live':'polite'});document.body.append(toastHost);}
  const close=()=>t.remove();
  const t=h('div',{class:['toast',kind]},h('span',{class:'dot'}),h('div',{class:'grow',text:message}),action?button({label:action.label,size:'sm',onClick:()=>{action.onClick();close();}}):null,
    button({icon:'close',kind:'ghost',size:'sm',onClick:close,attrs:{'aria-label':'Dismiss'}}));
  toastHost.append(t);if(timeout)setTimeout(close,timeout);return close;
}
// A workspace's own stylesheet (public/ui/css/<name>.css), linked once.
export function styles(name){const href=`/ui/css/${name}.css`;if(document.querySelector(`link[href="${href}"]`))return;document.head.append(h('link',{rel:'stylesheet',href}));}
// Reduced motion: the interface setting (Settings › Motion) or, when it follows the system, the system's choice.
export function reducedMotion(){const m=document.documentElement.dataset.motion;return m==='reduce'||(m!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches);}

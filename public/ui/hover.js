// The hover card: what is under the pointer on the living world, in every view that shows the stage (the Stage, Home,
// the studios, Record & Broadcast). The world names it (its own pick and inspect); the player adds what it knows there
// at that moment (agents at work, the newest test verdict and edit, sizes: host.js peek). It is DOM over the stage, never
// drawn into it, so recordings and films never contain it, and it never shows in the OBS view (no interface there), with
// the information mode Stream or Off, while a dialog or menu is open, while the Stage rests, for touch input, or once a
// key is pressed. Names are catalog and generated names; nothing from the code (no path, no file name) reaches it.
// The rules are pure (tests/hover.test.js); mountHover wires them to the page.
import {h,text} from './dom.js';
export const PICK_MS=100,REFRESH_MS=600;
// Whether the card may show.
export function hoverAllowed({overlay=false,film=false,labels,world,running,modal=false,idle=false}){
  return !overlay&&!film&&(labels==='cinematic'||labels==='explorer')&&world==='living'&&!!running&&!modal&&!idle;}
// Picks at most once per `interval` (the first at once, the latest position at the end of the interval); an answer that
// arrives after a newer pick began, or after stop(), is dropped.
export function createPicker({pick,show,interval=PICK_MS,now=()=>performance.now(),later=(f,ms)=>setTimeout(f,ms),cancel=id=>clearTimeout(id)}){
  let last=-Infinity,timer=null,pending=null,seq=0;
  function run(){timer=null;const p=pending;pending=null;if(!p)return;last=now();const mine=++seq;
    let answer;try{answer=pick(p);}catch{answer=null;}
    Promise.resolve(answer).then(r=>{if(mine===seq)show(r,p);},()=>{if(mine===seq)show(null,p);});}
  return {
    move(p){pending=p;if(timer!==null)return;const wait=interval-(now()-last);if(wait<=0)run();else timer=later(run,wait);},
    stop(){pending=null;seq++;if(timer!==null){cancel(timer);timer=null;}},
    get busy(){return timer!==null;}};
}
// Where the card goes: beside the pointer (below right, then below left, above right, above left), inside `bounds`,
// never over the pointer, and off the stage's own controls (`avoid`) when any placement allows it.
export function placeCard(pt,box,bounds,avoid=[],gap=16){
  const cx=x=>Math.max(bounds.left,Math.min(bounds.right-box.w,x)),cy=y=>Math.max(bounds.top,Math.min(bounds.bottom-box.h,y));
  const overlap=(x,y)=>avoid.reduce((a,r)=>a+Math.max(0,Math.min(x+box.w,r.right)-Math.max(x,r.left))*Math.max(0,Math.min(y+box.h,r.bottom)-Math.max(y,r.top)),0);
  let best=null;
  for(const [x0,y0] of [[pt.x+gap,pt.y+gap],[pt.x-gap-box.w,pt.y+gap],[pt.x+gap,pt.y-gap-box.h],[pt.x-gap-box.w,pt.y-gap-box.h]]){
    const x=cx(x0),y=cy(y0),covers=pt.x>=x-4&&pt.x<=x+box.w+4&&pt.y>=y-4&&pt.y<=y+box.h+4;
    const score=(covers?1e9:0)+overlap(x,y)+(x!==x0||y!==y0?.5:0);
    if(!best||score<best.score)best={x,y,score};if(score===0)break;}
  return {left:Math.round(best.x),top:Math.round(best.y)};
}
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
// Performance time (in a replay, as of the playhead), never the wall clock.
export function since(ms){const s=Math.max(0,Math.round(ms/1000));if(s<5)return 'just now';if(s<60)return `${s} s ago`;const m=Math.round(s/60);if(m<60)return `${m} min ago`;return `${Math.round(m/60)} h ago`;}
// The card's text from a peek: the world's words, then one line per fact.
export function cardLines(hit){
  if(!hit||!(hit.text||hit.sub))return null;const lines=[];
  for(const a of hit.agents||[])lines.push({kind:'agent',color:a.color||null,text:a.working?`${a.name} · ${a.label} now`:`${a.name} · ${a.label} · ${since(a.ago)}`});
  if(hit.kind==='subsystem'&&Number.isFinite(hit.modules)){const s=hit.states||{},bits=[plural(hit.modules,'file')];if(s.validated)bits.push(`${s.validated} validated`);if(s.stressed)bits.push(`${s.stressed} failing`);lines.push({kind:'count',text:bits.join(' · ')});}
  if(hit.check)lines.push(hit.check.state==='stressed'?{kind:'fail',text:`Tests failed ${since(hit.check.ago)}`}:{kind:'pass',text:`Tests passed ${since(hit.check.ago)}`});
  if(hit.edit)lines.push({kind:'edit',text:`${hit.edit.by==='agent'?'Edited by an agent':'Edited'} ${since(hit.edit.ago)}`});
  return {title:hit.text||hit.sub,sub:hit.text?hit.sub:'',lines};
}
// The stage's own controls the card keeps clear of (the Stage's bars and cards, the views' badges and notes).
const AVOID='.stage-top,.stage-bottom,.stage-rec .pill,.stage-notice>*,.stage-empty-msg>*,.picked-card,.info-card,.stage-keys,.stage-esc-hint,.slot-badge,.callout,[data-hover-avoid]';
export function mountHover({player:P,host,chrome}){
  const title=h('strong',{class:'wh-title'}),sub=h('span',{class:'wh-sub'}),facts=h('ul',{class:'wh-facts'});
  const card=h('div',{class:'world-hover',id:'worldHover',role:'tooltip',hidden:true},title,sub,facts);
  document.body.append(card);
  let pointer=null,refresh=null,sig='',raf=0;
  // (A resting Stage wakes on the same movement, after this layer saw it: its rest is read when the answer arrives.)
  const allowed=(moving=false)=>{const s=P.state;return hoverAllowed({overlay:P.overlay,film:P.film,labels:s.labels,world:s.world,running:s.worldStatus?.running,
    modal:!!document.querySelector('.modal-backdrop,.menu'),idle:!moving&&document.body.classList.contains('stage-idle')});};
  function hide(){card.hidden=true;sig='';picker.stop();if(refresh!==null){clearInterval(refresh);refresh=null;}}
  function bounds(){
    const r=host.getBoundingClientRect(),ws=document.getElementById('workspace'),a=ws&&!document.body.classList.contains('immersive')?ws.getBoundingClientRect():null;
    const b={left:Math.max(r.left,0),top:Math.max(r.top,0),right:Math.min(r.right,innerWidth),bottom:Math.min(r.bottom,innerHeight)};
    if(a&&a.width>0){b.left=Math.max(b.left,a.left);b.top=Math.max(b.top,a.top);b.right=Math.min(b.right,a.right);b.bottom=Math.min(b.bottom,a.bottom);}
    return {left:b.left+8,top:b.top+8,right:b.right-8,bottom:b.bottom-8};}
  function place(){if(card.hidden||!pointer)return;
    const avoid=[...chrome.querySelectorAll(AVOID)].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
    const {left,top}=placeCard(pointer,{w:card.offsetWidth,h:card.offsetHeight},bounds(),avoid);Object.assign(card.style,{left:`${left}px`,top:`${top}px`});}
  const placeSoon=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;place();});};
  function show(hit){
    const L=pointer&&allowed()?cardLines(hit):null;if(!L){card.hidden=true;sig='';return;}
    const next=JSON.stringify(L);if(next!==sig){sig=next;text(title,L.title);text(sub,L.sub);sub.hidden=!L.sub;
      facts.replaceChildren(...L.lines.map(l=>{const li=h('li',{class:`wh-${l.kind}`},h('span',{class:'wh-dot'}),h('span',{text:l.text}));if(l.color)li.firstChild.style.background=l.color;return li;}));}
    card.hidden=false;place();
    // While it shows, the world keeps moving under a resting pointer (and the work goes on): ask again now and then.
    if(refresh===null)refresh=setInterval(()=>{if(pointer&&allowed())picker.move(pointer);else hide();},REFRESH_MS);}
  const picker=createPicker({pick:p=>P.peek(p.x,p.y),show});
  host.addEventListener('pointermove',e=>{if(e.pointerType==='touch'){hide();return;}pointer={x:e.clientX,y:e.clientY};if(!allowed(true)){hide();return;}picker.move(pointer);placeSoon();},{passive:true});
  host.addEventListener('pointerleave',()=>{pointer=null;hide();});
  host.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')hide();},{passive:true});
  // Keyboard use, scrolling, leaving the window: the card steps aside (it never takes focus or a key).
  addEventListener('keydown',hide,true);addEventListener('wheel',hide,{passive:true});addEventListener('blur',hide);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
  P.on(t=>{if(!card.hidden&&['labels','world','project','preview','notice'].some(k=>t.has(k))&&!allowed())hide();});
  return {hide,get element(){return card;}};
}

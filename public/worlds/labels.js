// Public text on the Stage, OBS and films. Only two kinds of words may appear: generic words chosen by Code Resonance
// (family names, event categories, catalog agent names or "Agent" for any other, generated subsystem names) and text the user explicitly approved as
// public (the recipe's public title and subsystem aliases, set through the World DNA panel or POST /api/recipe).
// The project folder name the extension shares for the player's project list is never an input here.
// Pure (no rendering), so the privacy rules are unit-tested in Node.
export const GENERIC_TITLE='Code Resonance';
export const LABEL_MODES=['cinematic','explorer','stream','off'];
const CALLOUT_MS=5200,BANNER_MS=6500,CHIP_MS=6000,TITLE_MS=9000;
// A pronounceable name derived from a salted subsystem id: memorable, stable, and it reveals nothing about the code (the
// living worlds' subsystem labels, Monolith's districts). Its hash and generator are core.js's, copied so that this module
// stays free of three.js.
const ONSET=['V','Th','M','L','S','K','R','D','N','C','Z','Er','Al','Or','El','Ar','Ly','Se','Ca','Ta','Va','Io','Hy','Ae'];
const VOWEL=['a','e','i','o','u','ae','ia','eo','y','au'];
const CODA=['l','r','n','s','th','v','d','m','','',''];
const ENDING=['ra','ris','on','el','is','ar','en','or','ia','eth','ion','yn','os','ae','ix','ara','ene','ira'];
// Re-roll anything that could read as a crude or offensive word.
const BLOCK=/anu|nus|ass|cum|tit|fag|nig|sex|pis|poo|shi|fuc|dic|coc|kik|rap|cun|vag|tw|hor|slu|wh|nazi|dam|hel/i;
function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export function generatedName(id){
  const r=rng(hash(id)^0x9e3779b9),pick=list=>list[Math.floor(r()*list.length)];
  for(let i=0;i<12;i++){const name=pick(ONSET)+pick(VOWEL)+pick(CODA)+pick(ENDING);if(!BLOCK.test(name))return name;}
  return 'Aurel';
}
// The approved public title, or null.
export function publicTitle(recipe){const t=recipe?.title;return typeof t==='string'&&t.trim()?t.trim():null;}
export function titleCard(recipe){
  const t=publicTitle(recipe),family=recipe?.familyName||'A generative world';
  return t?{text:t,sub:`${family} · a generative world from this project's code`}:{text:family,sub:'A generative world from this project\'s code'};
}
export function lowerThirdTitle(recipe){return `${publicTitle(recipe)||GENERIC_TITLE} · ${recipe?.familyName||'Living world'}`;}
// ---- Portrait frames (vertical clips, 9:16) --------------------------------------------------------------------------
// A frame taller than it is wide is a portrait. Its words are sized by its short side (the width; PORTRAIT_TEXT times the
// landscape size at 1080 wide, so they read on a phone) and kept inside the area Reels, Shorts and TikTok leave clear of
// their own interface: below the top 12 %, above the bottom 20 %, with a margin at each side (a wider one on the right,
// where their buttons are). A landscape (or square) frame keeps its rules exactly: words scaled by w/1920, the whole
// frame usable.
export const PORTRAIT_SAFE=Object.freeze({top:.12,bottom:.2,left:.06,right:.1});
export const PORTRAIT_TEXT=1.4;
export const isPortrait=(w,h)=>h>w;
export function textScale(w,h){return isPortrait(w,h)?w/1080*PORTRAIT_TEXT:w/1920;}
export function safeArea(w,h){
  if(!isPortrait(w,h))return {x0:0,y0:0,x1:w,y1:h};
  return {x0:w*PORTRAIT_SAFE.left,y0:h*PORTRAIT_SAFE.top,x1:w*(1-PORTRAIT_SAFE.right),y1:h*(1-PORTRAIT_SAFE.bottom)};
}
// Where a portrait frame's fixed words stand (px, for text drawn on a middle baseline): the title card low in the safe
// area, a caption under it, a banner just under the safe area's top, a lower third at its bottom. `maxW` is the widest a
// line may be (longer lines are drawn smaller).
export function portraitPlaces(w,h){
  const s=safeArea(w,h),k=textScale(w,h);
  return {safe:s,k,cx:(s.x0+s.x1)/2,maxW:s.x1-s.x0,
    title:{x:s.x0,y:s.y1-118*k,sub:s.y1-76*k},caption:{y:s.y1-24*k},banner:{y:s.y0+54*k,sub:s.y0+98*k},lowerThird:{y0:s.y1-150*k}};
}
// A portrait callout: its words centred over (or, without room above, under) the point, inside the safe area, at `dy`
// units from it. The words' box is {tx, ty} (left edge, first line's middle).
const calloutWidth=(text,sub)=>Math.max(String(text||'').length*9.2,(sub?String(sub).length:0)*7.6);
export function portraitCallout(p,text,sub,P,dy=-50){
  const s=P.safe,k=P.k,est=Math.min(P.maxW,calloutWidth(text,sub)*k);
  if(dy<0&&p.y+dy*k-(sub?34:14)*k-12*k<s.y0)dy=-dy;
  const ly=p.y+dy*k,ty=dy<0?ly-(sub?34:14)*k:ly+14*k;
  const tx=Math.max(s.x0,Math.min(s.x1-est,p.x-est/2));
  return {dx:0,dy,tx,ty};
}
// Keep a measured box inside the frame. Overlay drawing uses this after measureText.
export function clampBox(x,y,boxW,boxH,w,h,pad=8){
  let tx=x,ty=y;
  if(tx<pad)tx=pad;if(ty<pad)ty=pad;
  if(tx+boxW>w-pad)tx=Math.max(pad,w-pad-boxW);
  if(ty+boxH>h-pad)ty=Math.max(pad,h-pad-boxH);
  return {x:tx,y:ty};
}
// Place a chip next to an agent; flip to the left near the right edge; omit it when it still cannot fit.
export function fitChip(p,w,h,text){
  if(!p||!p.visible)return null;
  const est=Math.min(320,28+String(text||'').length*8);
  let dx=16,dy=-22;
  if(p.x+dx+est>w-16)dx=-(est+8);
  const left=p.x+Math.min(0,dx)-8,right=p.x+Math.max(dx,0)+est;
  const top=p.y+dy-14,bot=p.y+dy+14;
  if(left<8||right>w-8||top<8||bot>h-8)return null;
  return {dx,dy};
}
// The box a label item takes on screen (px), estimated from its characters as core.js draws it (fonts at 1920 wide,
// scaled by w/1920): what the placement below keeps clear. Null for items without a place of their own.
export function labelBox(it,w,h){
  if(isPortrait(w,h))return portraitBox(it,w,h);
  const k=w/1920,len=s=>String(s||'').length,sub=it.sub?len(it.sub):0;
  if(it.kind==='chip'){const tx=it.x+it.dx*k,ty=it.y+it.dy*k;return {x0:tx-8*k,y0:ty-11*k,x1:tx+(len(it.text)*7.9+22)*k,y1:ty+11*k};}
  if(it.kind==='callout'){const tx=it.x+(it.dx+24)*k,ty=it.y+it.dy*k;return {x0:tx-4*k,y0:ty-12*k,x1:tx+Math.max(len(it.text)*9.2,sub*7.6)*k,y1:ty+(sub?26:10)*k};}
  if(it.kind==='label'){const tx=it.x+14*k,ty=it.y+(it.dy||0)*k;return {x0:tx,y0:ty-10*k,x1:tx+Math.max(len(it.text)*8.4,sub*7.6)*k,y1:ty+(sub?26:10)*k};}
  if(it.kind==='banner'){const half=len(it.text)*11.5*k;return {x0:w/2-half,y0:h*.2-30*k,x1:w/2+half,y1:h*.2+(sub?56:20)*k};}
  if(it.kind==='caption'){const half=len(it.text)*7.5*k;return {x0:w/2-half,y0:h-106*k,x1:w/2+half,y1:h-70*k};}
  if(it.kind==='title')return {x0:80*k,y0:h-182*k,x1:80*k+Math.max(len(it.text)*29,sub*8)*k,y1:h-92*k};
  return null;
}
// The same in a portrait frame (portraitPlaces; words sized by textScale and never wider than the safe area).
function portraitBox(it,w,h){
  const P=portraitPlaces(w,h),k=P.k,len=s=>String(s||'').length,sub=it.sub?len(it.sub):0,s=P.safe,half=x=>Math.min(P.maxW/2,x);
  if(it.kind==='chip'){const tx=it.x+it.dx*k,ty=it.y+it.dy*k;return {x0:tx-8*k,y0:ty-11*k,x1:tx+(len(it.text)*7.9+22)*k,y1:ty+11*k};}
  if(it.kind==='callout'){if(Number.isFinite(it.tx))return {x0:it.tx-4*k,y0:it.ty-12*k,x1:it.tx+Math.min(P.maxW,calloutWidth(it.text,it.sub)*k),y1:it.ty+(sub?26:10)*k};
    const tx=it.x+(it.dx+24)*k,ty=it.y+it.dy*k;return {x0:tx-4*k,y0:ty-12*k,x1:tx+Math.max(len(it.text)*9.2,sub*7.6)*k,y1:ty+(sub?26:10)*k};}
  if(it.kind==='label'){const tx=it.x+14*k,ty=it.y+(it.dy||0)*k;return {x0:tx,y0:ty-10*k,x1:tx+Math.max(len(it.text)*8.4,sub*7.6)*k,y1:ty+(sub?26:10)*k};}
  if(it.kind==='banner'){const r=half(len(it.text)*11.5*k);return {x0:P.cx-r,y0:P.banner.y-30*k,x1:P.cx+r,y1:sub?P.banner.sub+12*k:P.banner.y+20*k};}
  if(it.kind==='caption'){const r=half(len(it.text)*7.5*k);return {x0:P.cx-r,y0:P.caption.y-18*k,x1:P.cx+r,y1:P.caption.y+18*k};}
  if(it.kind==='title')return {x0:s.x0,y0:P.title.y-32*k,x1:s.x0+Math.min(P.maxW,Math.max(len(it.text)*29,sub*8)*k),y1:P.title.sub+10*k};
  if(it.kind==='lower-third')return {x0:s.x0,y0:P.lowerThird.y0,x1:s.x1,y1:s.y1};
  return null;
}
const overlaps=(a,b,m=4)=>a.x0<b.x1+m&&b.x0<a.x1+m&&a.y0<b.y1+m&&b.y0<a.y1+m;
const inside=(b,s)=>b.x0>=s.x0&&b.x1<=s.x1&&b.y0>=s.y0&&b.y1<=s.y1;
// A chip's place next to an agent in a portrait frame: fitChip's rule inside the safe area, at the portrait size.
function fitChipIn(p,text,P){
  if(!p||!p.visible)return null;
  const k=P.k,s=P.safe,est=Math.min(320,28+String(text||'').length*8);
  let dx=16,dy=-22;
  if(p.x+(dx+est)*k>s.x1)dx=-(est+8);
  const left=p.x+(Math.min(0,dx)-8)*k,right=p.x+(Math.max(dx,0)+est)*k,top=p.y+(dy-14)*k,bot=p.y+(dy+14)*k;
  if(left<s.x0||right>s.x1||top<s.y0||bot>s.y1)return null;
  return {dx,dy};
}
// Every label item for one frame. `world` supplies describe/agentPosition/agentColor/subsystemLabels/inspect/status;
// `toScreen(position)` maps a world position to the screen ({x,y,visible}).
export function composeLabels({mode,recipe,info:i,commands,agentName,world,toScreen,size:[w,h],speed=1,origin=null,selected=null}){
  if(mode==='off'||!i)return [];
  const out=[],cut=recipe?.genome?.limits?.maxLabels||5;
  // A portrait frame places its words by its own rules (portraitPlaces); a landscape one exactly as it always did.
  const P=isPortrait(w,h)?portraitPlaces(w,h):null;
  // A portrait callout over its point (or under it), clear of every word already placed; null where none fits.
  const portraitAt=(p,base)=>{const s=P.safe;if(!(p&&p.visible&&p.x>s.x0&&p.x<s.x1&&p.y>s.y0&&p.y<s.y1))return null;const taken=out.map(x=>labelBox(x,w,h)).filter(Boolean);
    for(const dy0 of [-50,-110,-170,50,110]){const c={...base,kind:'callout',x:p.x,y:p.y,...portraitCallout(p,base.text,base.sub,P,dy0)},b=labelBox(c,w,h);if(inside(b,s)&&!taken.some(u=>overlaps(b,u)))return c;}
    return null;};
  // The title belongs to the start of the performance (replays and films), or to the moment the world opened (live).
  const sinceStart=origin===null?Infinity:(i.t-origin)/speed;
  if(sinceStart<TITLE_MS&&mode!=='stream'){const card=titleCard(recipe);out.push({kind:'title',text:card.text,sub:card.sub,alpha:Math.min(1,sinceStart/1200)*Math.min(1,(TITLE_MS-sinceStart)/1500)});}
  // Callouts for structural events and above, near what they changed; milestones also get a banner.
  let n=0;const used=[],subjects=new Set(),events=[];
  const recent=commands.filter(c=>c.at<=i.t&&(i.t-c.at)/speed<=BANNER_MS&&c.tier>=2).sort((a,b)=>b.tier-a.tier||b.at-a.at);
  for(const c of recent){
    if(n>=cut)break;const age=(i.t-c.at)/speed;
    // One callout per subject (a milestone replaces the validation it came from).
    const key=c.subject?.fileId||c.subject?.groupId||(c.subject?.fileIds||[]).join(',');if(key&&subjects.has(key))continue;if(key)subjects.add(key);
    const d=world.describe?.(c,i);if(!d)continue;
    const fade=Math.min(1,age/400)*Math.min(1,(CALLOUT_MS-age)/900);
    if(c.tier>=3&&d.banner&&age<BANNER_MS)out.push({kind:'banner',text:d.banner,sub:d.bannerSub,alpha:Math.min(1,age/600)*Math.min(1,(BANNER_MS-age)/1200)});
    if(age<CALLOUT_MS&&d.text){
      if(mode==='stream'){events.push(d.text);n++;continue;}
      const p=d.position?toScreen(d.position):null;
      if(P){
        // Over the point (or under it), clear of the words already placed; the caption where there is no room.
        const it=portraitAt(p,{text:d.text,sub:d.sub,color:d.color,alpha:fade});
        if(it)out.push(it);else if(!out.some(x=>x.kind==='caption'))out.push({kind:'caption',text:d.text,alpha:fade});
      }
      else if(p&&p.visible&&p.x>40&&p.x<w-260&&p.y>60&&p.y<h-140){
        let dy=-50;while(used.some(u=>Math.abs(u.x-p.x)<320&&Math.abs(u.y-(p.y+dy))<46)&&dy>-260)dy-=48;used.push({x:p.x,y:p.y+dy});
        out.push({kind:'callout',x:p.x,y:p.y,text:d.text,sub:d.sub,color:d.color,alpha:fade,dx:p.x>w*.6?-70:46,dy});}
      else if(!out.some(x=>x.kind==='caption'))out.push({kind:'caption',text:d.text,alpha:fade});
      n++;
    }
  }
  // Agents: a chip when an agent's activity changes (always in explorer and stream modes). A chip keeps clear of the words
  // already placed and of other chips (two agents working side by side): above its agent, below, further out, or on the
  // other side; where none of those is free it stays where it was (an agent is never left unnamed).
  const taken=out.map(it=>labelBox(it,w,h)).filter(Boolean);
  for(const a of i.agents){
    const pos=world.agentPosition?.(a.id,i);if(!pos)continue;
    const changed=(i.t-Math.max(a.arrived,i.t-a.since))/speed;
    if(mode==='cinematic'&&changed>CHIP_MS&&a.display!=='unknown')continue;
    const p=toScreen(pos);const text=`${agentName(a)} · ${a.label}`,place=P?fitChipIn(p,text,P):fitChip(p,w,h,text);if(!place)continue;
    const chip={kind:'chip',x:p.x,y:p.y,dx:place.dx,dy:place.dy,text,dot:world.agentColor?.(a)||'#fff',alpha:a.alpha*(mode==='cinematic'?Math.min(1,(CHIP_MS-changed)/900):1)};
    const flip=place.dx>0?-(Math.min(320,28+text.length*8)+8):16;
    for(const [dx,dy] of [[place.dx,place.dy],[place.dx,22],[place.dx,-56],[place.dx,56],[flip,-22],[flip,22]]){
      const b=labelBox({...chip,dx,dy},w,h);if((P?!inside(b,P.safe):b.x0<8||b.x1>w-8||b.y0<8||b.y1>h-8)||taken.some(t=>overlaps(b,t)))continue;chip.dx=dx;chip.dy=dy;break;}
    taken.push(labelBox(chip,w,h));out.push(chip);
  }
  // Subsystem names: each steps down or up from the names and words already placed, and is left out where all its places
  // are taken (the hover card still names it).
  if(mode==='explorer')for(const l of world.subsystemLabels?.(i)||[]){const p=toScreen(l.position);if(!(P?p.visible&&p.x>P.safe.x0&&p.x<P.safe.x1-60*P.k&&p.y>P.safe.y0&&p.y<P.safe.y1:p.visible&&p.x>16&&p.x<w-120&&p.y>16&&p.y<h-24))continue;
    const label={kind:'label',x:p.x,y:p.y,text:l.text,sub:l.sub,alpha:.9};
    const dy=[0,30,-30,60,-60].find(d=>{const b=labelBox({...label,dy:d},w,h);return (P?inside(b,P.safe):b.y0>=8&&b.y1<=h-8)&&!taken.some(t=>overlaps(b,t));});
    if(dy===undefined)continue;if(dy)label.dy=dy;taken.push(labelBox(label,w,h));out.push(label);}
  if(mode==='explorer'&&selected){const s=world.inspect?.(selected,i);if(s){const p=toScreen(s.position);
    if(P){const it=portraitAt(p,{text:s.text,sub:s.sub,alpha:1,color:'#fff'});if(it)out.push(it);}
    else if(p&&p.visible&&p.x>40&&p.x<w-260&&p.y>60&&p.y<h-140)out.push({kind:'callout',x:p.x,y:p.y,text:s.text,sub:s.sub,alpha:1,color:'#fff'});}}
  if(mode==='stream'){
    const busy=i.agents.filter(a=>a.busy);
    out.push({kind:'lower-third',text:lowerThirdTitle(recipe),sub:events[0]||(i.phase==='idle'?'Quiet — the world keeps moving':'Building'),
      right:busy.length?busy.map(a=>`${agentName(a)}: ${a.label}`).slice(0,2).join('   '):i.agents.length?`${i.agents.length} agent${i.agents.length>1?'s':''} present`:'',right2:world.status?.(i)||'',alpha:1});
  }
  return out;
}
// Every string of a label list (qualification: the privacy boundary covers labels too).
export function labelStrings(items){return items.flatMap(x=>[x.text,x.sub,x.right,x.right2]).filter(Boolean);}

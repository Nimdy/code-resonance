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
  const k=w/1920,len=s=>String(s||'').length,sub=it.sub?len(it.sub):0;
  if(it.kind==='chip'){const tx=it.x+it.dx*k,ty=it.y+it.dy*k;return {x0:tx-8*k,y0:ty-11*k,x1:tx+(len(it.text)*7.9+22)*k,y1:ty+11*k};}
  if(it.kind==='callout'){const tx=it.x+(it.dx+24)*k,ty=it.y+it.dy*k;return {x0:tx-4*k,y0:ty-12*k,x1:tx+Math.max(len(it.text)*9.2,sub*7.6)*k,y1:ty+(sub?26:10)*k};}
  if(it.kind==='label'){const tx=it.x+14*k,ty=it.y+(it.dy||0)*k;return {x0:tx,y0:ty-10*k,x1:tx+Math.max(len(it.text)*8.4,sub*7.6)*k,y1:ty+(sub?26:10)*k};}
  if(it.kind==='banner'){const half=len(it.text)*11.5*k;return {x0:w/2-half,y0:h*.2-30*k,x1:w/2+half,y1:h*.2+(sub?56:20)*k};}
  if(it.kind==='caption'){const half=len(it.text)*7.5*k;return {x0:w/2-half,y0:h-106*k,x1:w/2+half,y1:h-70*k};}
  if(it.kind==='title')return {x0:80*k,y0:h-182*k,x1:80*k+Math.max(len(it.text)*29,sub*8)*k,y1:h-92*k};
  return null;
}
const overlaps=(a,b,m=4)=>a.x0<b.x1+m&&b.x0<a.x1+m&&a.y0<b.y1+m&&b.y0<a.y1+m;
// Every label item for one frame. `world` supplies describe/agentPosition/agentColor/subsystemLabels/inspect/status;
// `toScreen(position)` maps a world position to the screen ({x,y,visible}).
export function composeLabels({mode,recipe,info:i,commands,agentName,world,toScreen,size:[w,h],speed=1,origin=null,selected=null}){
  if(mode==='off'||!i)return [];
  const out=[],cut=recipe?.genome?.limits?.maxLabels||5;
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
      if(p&&p.visible&&p.x>40&&p.x<w-260&&p.y>60&&p.y<h-140){
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
    const p=toScreen(pos);const text=`${agentName(a)} · ${a.label}`,place=fitChip(p,w,h,text);if(!place)continue;
    const chip={kind:'chip',x:p.x,y:p.y,dx:place.dx,dy:place.dy,text,dot:world.agentColor?.(a)||'#fff',alpha:a.alpha*(mode==='cinematic'?Math.min(1,(CHIP_MS-changed)/900):1)};
    const flip=place.dx>0?-(Math.min(320,28+text.length*8)+8):16;
    for(const [dx,dy] of [[place.dx,place.dy],[place.dx,22],[place.dx,-56],[place.dx,56],[flip,-22],[flip,22]]){
      const b=labelBox({...chip,dx,dy},w,h);if(b.x0<8||b.x1>w-8||b.y0<8||b.y1>h-8||taken.some(t=>overlaps(b,t)))continue;chip.dx=dx;chip.dy=dy;break;}
    taken.push(labelBox(chip,w,h));out.push(chip);
  }
  // Subsystem names: each steps down or up from the names and words already placed, and is left out where all its places
  // are taken (the hover card still names it).
  if(mode==='explorer')for(const l of world.subsystemLabels?.(i)||[]){const p=toScreen(l.position);if(!(p.visible&&p.x>16&&p.x<w-120&&p.y>16&&p.y<h-24))continue;
    const label={kind:'label',x:p.x,y:p.y,text:l.text,sub:l.sub,alpha:.9};
    const dy=[0,30,-30,60,-60].find(d=>{const b=labelBox({...label,dy:d},w,h);return b.y0>=8&&b.y1<=h-8&&!taken.some(t=>overlaps(b,t));});
    if(dy===undefined)continue;if(dy)label.dy=dy;taken.push(labelBox(label,w,h));out.push(label);}
  if(mode==='explorer'&&selected){const s=world.inspect?.(selected,i);if(s){const p=toScreen(s.position);if(p&&p.visible&&p.x>40&&p.x<w-260&&p.y>60&&p.y<h-140)out.push({kind:'callout',x:p.x,y:p.y,text:s.text,sub:s.sub,alpha:1,color:'#fff'});}}
  if(mode==='stream'){
    const busy=i.agents.filter(a=>a.busy);
    out.push({kind:'lower-third',text:lowerThirdTitle(recipe),sub:events[0]||(i.phase==='idle'?'Quiet — the world keeps moving':'Building'),
      right:busy.length?busy.map(a=>`${agentName(a)}: ${a.label}`).slice(0,2).join('   '):i.agents.length?`${i.agents.length} agent${i.agents.length>1?'s':''} present`:'',right2:world.status?.(i)||'',alpha:1});
  }
  return out;
}
// Every string of a label list (qualification: the privacy boundary covers labels too).
export function labelStrings(items){return items.flatMap(x=>[x.text,x.sub,x.right,x.right2]).filter(Boolean);}

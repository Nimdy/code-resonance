// Public text on the Stage, OBS and films. Only two kinds of words may appear: generic words chosen by Code Resonance
// (family names, event categories, catalog agent names, generated subsystem names) and text the user explicitly approved as
// public (the recipe's public title and subsystem aliases, set through the World DNA panel or POST /api/recipe).
// The project folder name the extension shares for the player's project list is never an input here.
// Pure (no rendering), so the privacy rules are unit-tested in Node.
export const GENERIC_TITLE='Code Resonance';
export const LABEL_MODES=['cinematic','explorer','stream','off'];
const CALLOUT_MS=5200,BANNER_MS=6500,CHIP_MS=6000,TITLE_MS=9000;
// The approved public title, or null.
export function publicTitle(recipe){const t=recipe?.title;return typeof t==='string'&&t.trim()?t.trim():null;}
export function titleCard(recipe){
  const t=publicTitle(recipe),family=recipe?.familyName||'A generative world';
  return t?{text:t,sub:`${family} · a generative world from this project's code`}:{text:family,sub:'A generative world from this project\'s code'};
}
export function lowerThirdTitle(recipe){return `${publicTitle(recipe)||GENERIC_TITLE} · ${recipe?.familyName||'Living world'}`;}
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
  // Agents: a chip when an agent's activity changes (always in explorer and stream modes).
  for(const a of i.agents){
    const pos=world.agentPosition?.(a.id,i);if(!pos)continue;
    const changed=(i.t-Math.max(a.arrived,i.t-a.since))/speed;
    if(mode==='cinematic'&&changed>CHIP_MS&&a.display!=='unknown')continue;
    const p=toScreen(pos);if(!p.visible)continue;
    out.push({kind:'chip',x:p.x,y:p.y,dx:16,dy:-22,text:`${agentName(a)} · ${a.label}`,dot:world.agentColor?.(a)||'#fff',alpha:a.alpha*(mode==='cinematic'?Math.min(1,(CHIP_MS-changed)/900):1)});
  }
  if(mode==='explorer')for(const l of world.subsystemLabels?.(i)||[]){const p=toScreen(l.position);if(p.visible)out.push({kind:'label',x:p.x,y:p.y,text:l.text,sub:l.sub,alpha:.9});}
  if(mode==='explorer'&&selected){const s=world.inspect?.(selected,i);if(s){const p=toScreen(s.position);if(p.visible)out.push({kind:'callout',x:p.x,y:p.y,text:s.text,sub:s.sub,alpha:1,color:'#fff'});}}
  if(mode==='stream'){
    const busy=i.agents.filter(a=>a.busy);
    out.push({kind:'lower-third',text:lowerThirdTitle(recipe),sub:events[0]||(i.phase==='idle'?'Quiet — the world keeps moving':'Building'),
      right:busy.length?busy.map(a=>`${agentName(a)}: ${a.label}`).slice(0,2).join('   '):i.agents.length?`${i.agents.length} agent${i.agents.length>1?'s':''} present`:'',right2:world.status?.(i)||'',alpha:1});
  }
  return out;
}
// Every string of a label list (qualification: the privacy boundary covers labels too).
export function labelStrings(items){return items.flatMap(x=>[x.text,x.sub,x.right,x.right2]).filter(Boolean);}

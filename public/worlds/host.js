// World host: runs a family world (Stellar Forge, Fractal Biosphere, Machine Cathedral) for the player with the same
// contract as the Construct (reset / applyDelta / cue / setMood / render / resize / stats), plus intents, priming after
// a seek, recipes, label modes and picking. One host per canvas; switching worlds disposes every GPU resource.
import {THREE,createPipeline,createCameraRig,createOverlay,clamp,hash,rng} from './core.js';
import {createModel} from './model.js';
import {createDirector} from './director.js';
import {createAgents} from './agents.js';
const FAMILIES={'stellar-forge':'./stellar.js','fractal-biosphere':'./biosphere.js','machine-cathedral':'./cathedral.js'};
const ONSET=['V','Th','M','L','S','K','R','D','N','C','Z','Er','Al','Or','El','Ar','Ly','Se','Ca','Ta','Va','Io','Hy','Ae'];
const VOWEL=['a','e','i','o','u','ae','ia','eo','y','au'];
const CODA=['l','r','n','s','th','v','d','m','','',''];
const ENDING=['ra','ris','on','el','is','ar','en','or','ia','eth','ion','yn','os','ae','ix','ara','ene','ira'];
// Re-roll anything that could read as a crude or offensive word.
const BLOCK=/anu|nus|ass|cum|tit|fag|nig|sex|pis|poo|shi|fuc|dic|coc|kik|rap|cun|vag|tw|hor|slu|wh|nazi|dam|hel/i;
// A pronounceable name derived from a salted subsystem id: memorable, stable, and it reveals nothing about the code.
export function generatedName(id){
  const r=rng(hash(id)^0x9e3779b9),pick=list=>list[Math.floor(r()*list.length)];
  for(let i=0;i<12;i++){const name=pick(ONSET)+pick(VOWEL)+pick(CODA)+pick(ENDING);if(!BLOCK.test(name))return name;}
  return 'Aurel';
}
export async function createWorld(canvas,{overlayCanvas=null,film=false,speed=1,recipe,labels='cinematic',project={},quality=0,adaptive=true}={}){
  if(!recipe||!FAMILIES[recipe.family])throw new Error('A visual recipe with a known family is required');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:film,powerPreference:'high-performance',alpha:false,stencil:false});
  if(!renderer.capabilities.isWebGL2)throw new Error('WebGL2 is required for the generative worlds');
  renderer.autoClear=false;renderer.setClearColor(0x000000,1);renderer.info.autoReset=false;
  const pipeline=createPipeline(renderer,{samples:4});
  const overlay=createOverlay();
  let speedK=speed,mode=labels,mood={section:'home',energy:0,tempo:92},beatPhase=0,size=[16,9],pixelRatio=1;
  // Live playback adapts when frames are slow: first no MSAA, then 75 %, then 55 % resolution. Films keep full quality.
  const LEVELS=[{samples:4,scale:1},{samples:0,scale:1},{samples:0,scale:.75},{samples:0,scale:.55}];
  let level=Math.max(0,Math.min(LEVELS.length-1,Number(quality)||0)),frameEma=1/60,slowFor=0,fastFor=0;
  function applyLevel(){pipeline.setSamples(LEVELS[level].samples);const k=LEVELS[level].scale;renderer.setPixelRatio(pixelRatio*k);renderer.setSize(size[0],size[1],false);pipeline.setSize(Math.round(size[0]*pixelRatio*k),Math.round(size[1]*pixelRatio*k));}
  function adapt(dt){if(film||!adaptive||dt<=0)return;frameEma+=(dt-frameEma)*.05;
    if(frameEma>1/28){slowFor+=dt;fastFor=0;}else if(frameEma<1/55){fastFor+=dt;slowFor=0;}else{slowFor=0;fastFor=0;}
    if(slowFor>3&&level<LEVELS.length-1){level++;slowFor=0;frameEma=1/45;applyLevel();}
    else if(fastFor>20&&level>Math.max(0,Number(quality)||0)){level--;fastFor=0;applyLevel();}}
  const camera=new THREE.PerspectiveCamera(36,16/9,.1,4000);
  const rig=createCameraRig(camera);
  const model=createModel({speed});
  const intents=[],intentIds=new Set();let director,agents,world=null,scene=null,current=null,snapCamera=true,startedAt=null,pinnedStart=null,info=null,selected=null;
  const timing={update:0,draw:0},calls={scene:0,total:0,triangles:0,points:0};
  const meta={name:project.name||null};
  function prime(upTo){
    director=createDirector({recipe:current,intensity:current.overrides?.intensity??1});agents=createAgents();
    for(const i of intents){if(i.ts>upTo)break;agents.record(i);director.process(i);}
  }
  async function load(next){
    const mod=await import(FAMILIES[next.family]);
    if(world){world.dispose();}
    if(scene)scene.traverse(o=>{o.geometry?.dispose?.();const m=o.material;if(m)(Array.isArray(m)?m:[m]).forEach(x=>{for(const v of Object.values(x.uniforms||{}))v?.value?.isTexture&&v.value.dispose();x.dispose();});});
    scene=new THREE.Scene();current=next;
    prime(info?.t??Infinity);
    world=mod.createFamily({THREE,renderer,scene,camera,model,recipe:next,get director(){return director;},get agents(){return agents;},pipeline,film,
      speed:()=>speedK,name:id=>next.aliases?.[id]||generatedName(id)});
    world.rebuild();snapCamera=true;
  }
  await load(recipe);
  function addIntent(i){if(intentIds.has(i.id))return false;intentIds.add(i.id);let k=intents.length;while(k>0&&intents[k-1].ts>i.ts)k--;intents.splice(k,0,i);
    if(intents.length>30000)for(const x of intents.splice(0,intents.length-30000))intentIds.delete(x.id);return true;}
  // ---- Labels -------------------------------------------------------------------------------------------------
  const CALLOUT_MS=5200,BANNER_MS=6500,CHIP_MS=6000;
  function labelItems(i){
    if(mode==='off')return [];
    const out=[],w=size[0],h=size[1],cut=current.genome.limits?.maxLabels||5;
    const title=current.title||meta.name;
    // The title belongs to the start of the performance (replays and films), or to the moment the world opened (live).
    const origin=pinnedStart??startedAt,sinceStart=origin===null?Infinity:(i.t-origin)/speedK;
    if(title&&sinceStart<9000&&mode!=='stream'){const a=Math.min(1,sinceStart/1200)*Math.min(1,(9000-sinceStart)/1500);out.push({kind:'title',text:title,sub:`${current.familyName} · a generative world from this project's code`,alpha:a});}
    // Callouts for structural events and above, near what they changed; milestones also get a banner.
    let n=0;const used=[],subjects=new Set();
    const recent=director.commands.filter(c=>c.at<=i.t&&(i.t-c.at)/speedK<=BANNER_MS&&c.tier>=2).sort((a,b)=>b.tier-a.tier||b.at-a.at);
    for(const c of recent){
      if(n>=cut)break;const age=(i.t-c.at)/speedK;
      // One callout per subject (a milestone replaces the validation it came from).
      const key=c.subject?.fileId||c.subject?.groupId||(c.subject?.fileIds||[]).join(',');if(key&&subjects.has(key))continue;if(key)subjects.add(key);
      const d=world.describe(c,i);if(!d)continue;
      const fade=Math.min(1,age/400)*Math.min(1,(CALLOUT_MS-age)/900);
      if(c.tier>=3&&d.banner&&age<BANNER_MS)out.push({kind:'banner',text:d.banner,sub:d.bannerSub,alpha:Math.min(1,age/600)*Math.min(1,(BANNER_MS-age)/1200)});
      if(age<CALLOUT_MS&&d.text){
        if(mode==='stream'){out.push({kind:'_event',text:d.text});n++;continue;}
        const p=d.position?overlay.project(camera,d.position,w,h):null;
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
      const changed=(i.t-Math.max(a.arrived,i.t-a.since))/speedK;
      if(mode==='cinematic'&&changed>CHIP_MS&&a.display!=='unknown')continue;
      const p=overlay.project(camera,pos,w,h);if(!p.visible)continue;
      out.push({kind:'chip',x:p.x,y:p.y,dx:16,dy:-22,text:`${agents.name(a)} · ${a.label}`,dot:world.agentColor?.(a)||'#fff',alpha:a.alpha*(mode==='cinematic'?Math.min(1,(CHIP_MS-changed)/900):1)});
    }
    if(mode==='explorer')for(const l of world.subsystemLabels?.(i)||[]){const p=overlay.project(camera,l.position,w,h);if(p.visible)out.push({kind:'label',x:p.x,y:p.y,text:l.text,sub:l.sub,alpha:.9});}
    if(mode==='explorer'&&selected){const s=world.inspect?.(selected,i);if(s){const p=overlay.project(camera,s.position,w,h);if(p.visible)out.push({kind:'callout',x:p.x,y:p.y,text:s.text,sub:s.sub,alpha:1,color:'#fff'});}}
    if(mode==='stream'){
      const events=out.filter(x=>x.kind==='_event');const busy=i.agents.filter(a=>a.busy);
      const status=world.status?.(i)||'';
      out.push({kind:'lower-third',text:`${title||'Project'} · ${current.familyName}`,sub:events[0]?.text||(i.phase==='idle'?'Quiet — the world keeps moving':'Building'),
        right:busy.length?busy.map(a=>`${agents.name(a)}: ${a.label}`).slice(0,2).join('   '):i.agents.length?`${i.agents.length} agent${i.agents.length>1?'s':''} present`:'',right2:status,alpha:1});
    }
    return out.filter(x=>x.kind!=='_event');
  }
  let lastLabels=[];
  function drawOverlay(g,w,h){if(!info)return;const items=labelItems(info);lastLabels=items;g.save();overlay.draw(g,w,h,items,w/1920);g.restore();}
  // ---- Frame ----------------------------------------------------------------------------------------------------
  function render(t,dt,{phase=0}={}){
    const began=performance.now();renderer.info.reset();adapt(dt);
    if(startedAt===null)startedAt=t;
    dt=Math.min(.1,Math.max(0,dt));
    const tsec=(t-model.epoch)/1000;
    info={t,tsec,tview:tsec/speedK,dt,beat:Math.exp(-((phase%1)*16)*.9),barPhase:phase,mood,energy:mood.energy||0,
      activity:director.activityAt(t),phase:director.phaseAt(t),unlocks:director.unlockedAt(t),agents:agents.list(t),overrides:current.overrides||{}};
    world.update(info);
    const goal=world.cameraGoal(info);rig.update(dt,goal,{snap:snapCamera,omega:goal.omega||.9});snapCamera=false;
    world.afterCamera?.(info);
    const drawn=performance.now();
    const bg=world.background?pipeline.renderBackground(world.background(info)):null;
    pipeline.render(()=>{if(bg)pipeline.drawBackdrop(bg);const before=renderer.info.render.calls;renderer.render(scene,camera);
      calls.scene=renderer.info.render.calls-before;calls.triangles=renderer.info.render.triangles;calls.points=renderer.info.render.points;},{time:info.tview,...world.grade(info)});
    calls.total=renderer.info.render.calls;
    if(overlayCanvas){const g=overlayCanvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);lastLabels=labelItems(info);overlay.draw(g,overlayCanvas.width,overlayCanvas.height,lastLabels,overlayCanvas.width/1920);}
    timing.update+=(drawn-began-timing.update)*.1;timing.draw+=(performance.now()-drawn-timing.draw)*.1;
  }
  return {
    get world(){return world;},get recipe(){return current;},
    reset(graph,t){model.reset(graph,t);world.rebuild();snapCamera=true;},
    applyDelta(delta,start,end){model.applyDelta(delta,start,end);world.onDelta?.(delta,start,end);},
    cue(c,t){model.cue(c,t);world.onCue?.(c,t);},
    intent(i,t){if(!addIntent(i))return;agents.record(i);const cmd=director.process(i);if(cmd)world.effect(cmd,info);},
    // After a seek: intents before t set the director (cooldowns, unlocks) and agent lifecycles, without effects.
    prime(entries,t){
      // Intents at or after the seek point are forgotten, so the schedule delivers them again as fresh events.
      for(let k=intents.length-1;k>=0;k--)if(intents[k].ts>=t){intentIds.delete(intents[k].id);intents.splice(k,1);}
      for(const e of entries)for(const i of e.intents||[])if(i.ts<t)addIntent(i);prime(t);
      // After a seek: no transient effect from another moment survives; lasting transformations are rebuilt from history.
      world.onPrime?.(t,(t-model.epoch)/1000);},
    setMood(m){if(m.section)mood.section=m.section;if(Number.isFinite(m.energy))mood.energy=m.energy;if(m.tempo){mood.tempo=m.tempo;model.setTempo(m.tempo);}},
    setSpeed(k){if(k>0){speedK=k;model.setSpeed(k);}},
    setEpoch(t){if(Number.isFinite(t))pinnedStart=t;const before=model.epoch;model.setEpoch(t);if(model.epoch!==before){world.rebuild();snapCamera=true;}},
    setProject(p){if(p?.name!==undefined)meta.name=p.name;},
    async setRecipe(next){if(!next||!FAMILIES[next.family])return;if(next.family===current.family&&next.variant===current.variant&&JSON.stringify(next.genome)===JSON.stringify(current.genome)){current=next;director.setIntensity(next.overrides?.intensity??1);return;}await load(next);},
    setLabels(m){if(['cinematic','explorer','stream','off'].includes(m))mode=m;},
    pick(x,y){if(!world.pick)return null;const id=world.pick(x/size[0]*2-1,-(y/size[1])*2+1,camera,info);selected=id;return id?world.inspect?.(id,info):null;},
    render,drawOverlay,
    // Every string currently on screen (qualification: the privacy boundary covers labels too).
    labels(){return lastLabels.flatMap(x=>[x.text,x.sub,x.right,x.right2]).filter(Boolean);},
    resize(w,h,dpr=1){size=[w,h];pixelRatio=dpr;applyLevel();camera.aspect=w/h;camera.updateProjectionMatrix();
      if(overlayCanvas){overlayCanvas.width=Math.round(w*dpr);overlayCanvas.height=Math.round(h*dpr);}},
    stats(){const s=world.stats?.()||{};return {family:current.family,variant:current.variant,...s,intents:intents.length,agents:info?.agents.length||0,phase:info?.phase,activity:info?+info.activity.toFixed(3):0,
      quality:level,drawCalls:calls.scene,passes:calls.total,triangles:calls.triangles,points:calls.points,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
      updateMs:+timing.update.toFixed(2),drawMs:+timing.draw.toFixed(2)};},
    dispose(){world?.dispose();pipeline.dispose();renderer.dispose();}
  };
}

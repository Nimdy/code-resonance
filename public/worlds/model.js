// The world model: what exists at a performance time, built only from the recorded timeline (graph deltas, cues,
// intents). Worlds draw it; they never invent structure. Pure (no rendering), so it runs in Node tests.
//
// Timing rules (shared by every world, as the Construct established them):
//  - a module appears early in the window that first contains it, on the music's step grid;
//  - a symbol (storey, moon, leaf) stays hidden until its own symbol.created cue, or the window's end if no cue comes;
//  - a dependency appears with its dependency.added cue (or at the window's end);
//  - material state changes (draft, committed, validated, stressed) come from validation and commit cues for exactly
//    the modules they cover, staggered, and otherwise from the next graph state at the window's end.
const STATES=new Set(['draft','committed','validated','stressed']);
export function roleOf(group){
  const c=group.counts||{},ui=c['ui.component']||0,routes=c['api.route']||0,cls=(c.class||0)+(c.interface||0),fn=(c.function||0)+(c.method||0);
  if(group.test)return 'tests';if(group.core)return 'core';
  if(ui>=Math.max(routes,cls,1)&&ui*2>=fn)return 'interface';if(routes>0&&routes>=ui)return 'services';
  if(cls>fn*.5)return 'model';return 'logic';
}
export function createModel({speed=1,tempo=92}={}){
  const districts=new Map(),modules=new Map(),symbols=new Map(),links=new Map();
  let stepMs=60000/(tempo*4),epoch=null,order=0,version=0;
  const human={fileId:null,at:-Infinity};
  const snap=t=>Math.ceil(t/(stepMs*speed))*(stepMs*speed);
  // The time origin for shaders (seconds since the first real timestamp). A replay first resets at time 0 before it
  // seeks, so only plausible timestamps may set it; otherwise float32 shader time would lose all precision.
  const touch=t=>{if(epoch===null&&Number.isFinite(t)&&t>1e11)epoch=t;version++;};
  function stateAt(m,t){let s=m.initial;for(const e of m.states){if(e.at<=t)s=e.state;else break;}return s;}
  function pushState(m,state,at){if(!STATES.has(state))return;let i=m.states.length;while(i>0&&m.states[i-1].at>at)i--;m.states.splice(i,0,{state,at});}
  function district(n,t){
    let d=districts.get(n.id);
    if(!d){d={id:n.id,core:!!n.core,order:n.order??districts.size,q:n.q??0,r:n.r??0,angle:n.angle??0,counts:{},test:false,role:'logic',created:t,members:[]};districts.set(n.id,d);}
    Object.assign(d,{counts:n.counts||d.counts,test:!!n.test,modules:n.modules,q:n.q??d.q,r:n.r??d.r,angle:n.angle??d.angle,order:n.order??d.order});
    d.role=roleOf(d);return d;
  }
  function moduleNode(n,born){
    let m=modules.get(n.id);
    if(m){Object.assign(m,{counts:n.counts||m.counts,test:!!n.test,lang:n.lang||m.lang,dir:n.dir||m.dir,q:n.q??m.q,r:n.r??m.r,weight:n.weight??m.weight});return m;}
    m={id:n.id,group:n.group,dir:n.dir,q:n.q??0,r:n.r??0,lang:n.lang||'other',test:!!n.test,counts:n.counts||{},weight:n.weight||1,
      born,removed:null,initial:n.state||'draft',states:[],order:order++,symbols:new Set(),lastHuman:-Infinity,lastAgent:-Infinity,agentVoice:null};
    modules.set(n.id,m);
    let d=districts.get(n.group);if(!d)d=district({id:n.group,order:districts.size},born);d.members.push(m.id);
    return m;
  }
  function symbolNode(n,born,dueAt=null){
    let s=symbols.get(n.id);
    if(s){s.slot=n.slot??s.slot;s.kind=n.type;if(s.removed!==null&&born!==undefined){s.removed=null;}return s;}
    const m=modules.get(n.parent);if(!m)return null;
    s={id:n.id,parent:n.parent,kind:n.type,slot:n.slot??0,weight:n.weight||1,born,dueAt,removed:null,weldAt:-Infinity};
    symbols.set(n.id,s);m.symbols.add(n.id);return s;
  }
  function linkEdge(e,born,dueAt=null){
    const key=`${e.a}>${e.b}`;let l=links.get(key);
    if(l){if(l.removed!==null&&born!==null){l.removed=null;l.born=born;}return l;}
    if(!modules.has(e.a)||!modules.has(e.b))return null;
    l={key,a:e.a,b:e.b,cross:!!e.cross,born,dueAt,removed:null};links.set(key,l);return l;
  }
  function reset(graph,t){
    districts.clear();modules.clear();symbols.clear();links.clear();order=0;touch(t);
    for(const n of graph.nodes)if(n.type==='group')district(n,-Infinity);
    for(const n of graph.nodes)if(n.type==='module')moduleNode(n,-Infinity);
    for(const n of graph.nodes)if(n.parent&&n.type!=='module')symbolNode(n,-Infinity);
    for(const e of graph.edges)if(e.kind==='depends')linkEdge(e,-Infinity);
  }
  function applyDelta(delta,start,end){
    touch(start);
    if(delta.keyframe){
      const ids=new Set(delta.nodes.map(n=>n.id));
      for(const [id,s] of symbols)if(!ids.has(id)&&s.removed===null)s.removed=start;
      for(const [id,m] of modules)if(!ids.has(id)&&m.removed===null)m.removed=start;
      const edges=new Set(delta.edges.map(e=>`${e.a}>${e.b}`));
      for(const [k,l] of links)if(!edges.has(k)&&l.removed===null)l.removed=start;
      delta={add:delta.nodes,remove:[],addEdges:delta.edges,removeEdges:[]};
    }
    const span=Math.max(1,end-start);
    for(const n of delta.add)if(n.type==='group')district(n,start);
    const mods=delta.add.filter(n=>n.type==='module');
    mods.forEach((n,i)=>{
      const existing=modules.get(n.id);
      if(existing&&existing.removed===null){existing.counts=n.counts||existing.counts;existing.lang=n.lang||existing.lang;
        // A state change without a cue (e.g. an edit making a draft) shows at the window's end.
        if(n.state&&n.state!==stateAt(existing,end)&&!existing.states.some(e=>e.at>=start))pushState(existing,n.state,end);return;}
      if(existing){existing.removed=null;if(n.state)pushState(existing,n.state,start);return;}
      moduleNode(n,snap(start+span*.15*i/Math.max(1,mods.length)));
    });
    for(const n of delta.add){
      if(!n.parent||n.type==='module'||n.type==='group')continue;
      const s=symbols.get(n.id);
      if(s){if(s.removed!==null){s.removed=null;s.born=null;s.dueAt=end;}s.slot=n.slot??s.slot;continue;}
      symbolNode(n,null,end);
    }
    for(const id of delta.remove){const s=symbols.get(id);if(s&&s.removed===null)s.removed=snap(start);const m=modules.get(id);if(m&&m.removed===null)m.removed=snap(start);}
    for(const e of delta.addEdges)if(e.kind==='depends'){const l=linkEdge(e,null,end);if(l&&l.born===null&&l.dueAt===null)l.dueAt=end;}
    for(const e of delta.removeEdges)if(e.kind==='depends'){const l=links.get(`${e.a}>${e.b}`);if(l&&l.removed===null)l.removed=snap(start);}
    for(const n of delta.add)if(n.type==='group'){const d=districts.get(n.id);if(d)d.role=roleOf(d);}
  }
  function cue(c,t){
    touch(t);
    const d=c.detail||{},m=d.fileId?modules.get(d.fileId):null,at=snap(t);
    if(m&&Number.isInteger(d.voice)&&d.attribution==='correlated'){m.lastAgent=at;m.agentVoice=d.voice;}
    switch(c.type){
      case 'symbol.created':{const s=symbols.get(d.symbolId);if(s&&s.born===null)s.born=at;break;}
      case 'symbol.modified':{const s=symbols.get(d.symbolId);if(s)s.weldAt=at;break;}
      case 'symbol.removed':{const s=symbols.get(d.symbolId);if(s&&s.removed===null)s.removed=at;break;}
      case 'dependency.added':{if(d.targetId){const l=links.get(`${d.fileId}>${d.targetId}`)||linkEdge({a:d.fileId,b:d.targetId,cross:d.cross},null);if(l&&l.born===null)l.born=at;}break;}
      case 'editor.change.observed':if(m&&!Number.isInteger(d.voice)){m.lastHuman=at;human.fileId=m.id;human.at=at;}break;
      case 'validation.test.passed':case 'validation.build.passed':(d.fileIds||[]).forEach((id,i)=>{const x=modules.get(id);if(x)pushState(x,'validated',at+i*90);});break;
      case 'validation.test.failed':case 'validation.build.failed':(d.fileIds||[]).forEach((id,i)=>{const x=modules.get(id);if(x)pushState(x,'stressed',at+i*60);});break;
      case 'repository.commit.observed':(d.fileIds||[]).forEach((id,i)=>{const x=modules.get(id);if(x&&stateAt(x,at)==='draft')pushState(x,'committed',at+i*70);});break;
      default:break;
    }
  }
  // ---- Queries -----------------------------------------------------------------------------------------------------
  const bornAt=x=>x.born??x.dueAt??Infinity;
  const alive=(x,t)=>bornAt(x)<=t&&(x.removed===null||x.removed>t-1600);
  return {
    districts,modules,symbols,links,human,reset,applyDelta,cue,stateAt,bornAt,alive,
    setTempo(bpm){if(bpm>0)stepMs=60000/(bpm*4);},setSpeed(k){if(k>0)speed=k;},
    // Replays and films pin the origin to the recording's start, so ambient motion at a performance time does not
    // depend on where playback first seeked.
    setEpoch(t){if(Number.isFinite(t)&&t>1e11&&t!==epoch){epoch=t;version++;}},
    get epoch(){return epoch??0;},get version(){return version;},get speed(){return speed;},
    // A module's district is alive from its first born module; its symbol counts by kind at time t.
    districtBorn(d){let b=Infinity;for(const id of d.members){const m=modules.get(id);if(m)b=Math.min(b,m.born);}return b;},
    symbolsAt(m,t){let n=0;for(const id of m.symbols){const s=symbols.get(id);if(s&&alive(s,t)&&s.removed===null)n++;}return n;},
    totals(t){let mods=0,syms=0,cross=0;for(const m of modules.values())if(alive(m,t)&&m.removed===null)mods++;for(const s of symbols.values())if(alive(s,t)&&s.removed===null)syms++;
      for(const l of links.values())if(l.cross&&alive(l,t)&&l.removed===null)cross++;return {modules:mods,symbols:syms,cross};}
  };
}

// Fractal Biosphere growth grammar: every organism is a recursive structure grown from real project data, the same
// rule at every scale (an axis that bends toward the light and carries smaller copies of itself), parameterised per
// species. Pure (no rendering): it returns packed instance data that biosphere.js uploads.
//
// Data -> structure (nothing here is invented progress):
//  - subsystem (district) -> an organism rooted at its persisted hex site; its species comes from its own role and
//                            data (interface: sea fan coral, tests / types: crystal tree, services and flowing function
//                            code: kelp, folder-rich code: fern, heavily cross-linked code: mycelium); the genome's
//                            species is the world's dominant one (core subsystems, close cases)
//  - folder               -> a limb (coral, crystal: a dichotomous / ternary fork), a stem (fern, kelp: a colony
//                            rising from one rhizome or holdfast), a ground cord (mycelial: a radiating hyphal network)
//  - file (module)        -> a branch in that limb's fork heap / a frond / a kelp blade / a mushroom on the cord;
//                            fork species end every file in a CROWN: a scaled copy of the organism's own branching
//                            rule (a fan of fans, shards bearing shards, hyphae of hyphae), 4-6 levels deep
//  - symbol               -> a smaller crown along its file's branch / a pinna / an extra blade / a satellite mushroom,
//                            in stable slot order; only symbols carry a point of light at their tip
// Layout is stable for appended data: positions depend only on an element's index among its siblings and on hashes of
// salted ids, so a new file or symbol adds a bud at its place and nothing else moves.
import {hash,rand,rng} from './core.js';
export const GOLDEN=2.399963229728653;
const SQRT3=Math.sqrt(3);
// Packed layouts (floats per instance); attribute names in biosphere.js.
//  segment: a.xyz ra | b.xyz rb | c1.xyz dist0 | c2.xyz dist1 | born removed dur profile | module org tipness seed
//  leaf:    p.xyz dist | d.xyz size | width shape born removed | module org seed colour
//  glow:    p.xyz dist | size kind born removed | module org seed colour
//  crown:   p.xyz scale | dir.xyz width | side.xyz dist0 | born removed dur flags | module org seed colour
export const SEG=24,LEAF=16,GLOW=12,TPL=20;
export const SHAPE={ribbon:0,pinnule:1,blossom:2,frond:3,leaf:4,petal:5,bud:6,freshRibbon:7,freshPinnule:8};
export const GLOWKIND={polyp:0,tip:1,bladder:2,spore:3,shard:4,cap:5,halo:6,seed:7,fresh:8,floret:9};
// Segment profiles: 1 dome cap (fern / kelp bladder), 2 bulb, 3 mushroom cap, 4 trunk (flares into buttresses).
export const PROFILE={cap:1,bulb:2,mushroom:3,trunk:4};
export const SPECIES_INDEX={coral:0,'crystal-tree':1,fern:2,kelp:3,mycelial:4};
// Colour selectors (palette slots in the shaders): 0 organism, 1 primary, 2 secondary, 3 accent, 4 highlight, 5 valid.
const KIND_COLOR={'ui.component':2,class:3,'api.route':5,interface:4,type:4,function:0,method:0,variable:0};
// One grammar, five parameterisations: clearly different silhouettes.
//  coral: a gorgonian sea fan (short stalk, forks near the ground, everything in one plane facing the current, wider
//         than tall); crystal: a ternary, faceted tree; fern: a colony of arching fronds; kelp: tall stipes with
//         blades streaming in the current; mycelial: cords over the ground carrying mushrooms.
export const SPECIES={
  coral:{mode:'fork',arity:2,trunk:.4,limb:1.1,branch:.9,decay:.68,angle:.7,planar:.94,curl:.35,up:.2,straight:false,thick:.6,flex:.55,crown:'fan',crownK:1.6,symK:.5},
  'crystal-tree':{mode:'fork',arity:3,trunk:.8,limb:1.2,branch:1,decay:.62,angle:.66,planar:0,curl:.12,up:.75,straight:true,thick:.7,flex:.14,crown:'shard',crownK:1.15,symK:.6},
  fern:{mode:'fern',stem:.7,frond:3.1,pinna:.85,ring:.7,droop:.42,curl:.12,up:.05,straight:false,thick:.6,flex:.8},
  kelp:{mode:'kelp',stem:3.6,spacing:.62,blade:2.5,ring:.42,curl:.18,up:.6,straight:false,thick:.55,flex:1.6},
  mycelial:{mode:'network',arity:2,cord:2.1,decay:.8,angle:.62,curl:.25,up:0,straight:false,thick:.5,flex:.12,stipe:.95,cap:.34,crown:'hypha',crownK:1.3}
};
// ---- Vectors (plain arrays; build time only) ----------------------------------------------------------------------
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const perp=d=>Math.abs(d[1])<.92?norm(cross(d,[0,1,0])):norm(cross(d,[1,0,0]));
function rot(v,k,a){const c=Math.cos(a),s=Math.sin(a),kv=cross(k,v),kd=dot(k,v)*(1-c);return [v[0]*c+kv[0]*s+k[0]*kd,v[1]*c+kv[1]*s+k[1]*kd,v[2]*c+kv[2]*s+k[2]*kd];}
// Turns d away from itself by angle a, in the plane at azimuth phi around it (fanNormal: the plane's normal to keep to).
function diverge(d,a,phi,planar=0,fanNormal=null){
  const e1=perp(d),e2=cross(d,e1);let k=norm(add(mul(e1,Math.cos(phi)),mul(e2,Math.sin(phi))));
  if(planar>0&&fanNormal){const f=sub(fanNormal,mul(d,dot(d,fanNormal)));if(Math.hypot(...f)>.05){const fk=norm(f),sgn=Math.cos(phi)>=0?1:-1;k=norm(mix(k,mul(fk,sgn),planar));}}
  return norm(rot(d,k,a));
}
// An axis: a polyline of n steps from p0 along d0, bending by the species' curl and tropism (deterministic in rr).
function axis(p0,d0,len,n,sp,rr,{up=sp.up*.16,droop=0,curl=sp.curl,flat=false,straight=sp.straight,plane=null}={}){
  const pts=[p0];let d=norm(d0),p=p0;const step=len/n;
  for(let i=0;i<n;i++){
    if(i>0){
      if(straight){if(i===(n>>1)){const k=rot(perp(d),d,rr()*6.283);d=norm(rot(d,k,(rr()-.5)*.3));}}
      else{const k=plane?plane:rot(perp(d),d,rr()*6.283);d=rot(d,k,curl*(rr()-.5)*.55);d=norm([d[0],d[1]+up-droop*(.4+i/n),d[2]]);}
      if(flat){d=norm([d[0],d[1]*.12,d[2]]);}
    }
    p=add(p,mul(d,step));if(flat&&p[1]<.02)p[1]=.02+.015*rr();pts.push(p);
  }
  return {pts,len,step,n,end:d,start:norm(d0)};
}
function at(ax,s){s=Math.max(0,Math.min(ax.len,s));const f=s/ax.step,i=Math.min(ax.n-1,Math.floor(f)),u=f-i;return {p:mix(ax.pts[i],ax.pts[i+1],u),d:norm(sub(ax.pts[i+1],ax.pts[i]))};}
const tipOf=ax=>ax.pts[ax.pts.length-1];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const secsOf=(t,epoch)=>Number.isFinite(t)?(t-epoch)/1000:(t>0?1e6:-1e5);
// ---- Crown templates ------------------------------------------------------------------------------------------------
// A crown is the species' branching rule unrolled 3-5 levels deep into one small mesh (unit size, base at the origin,
// axis +Y, its plane XY), instanced at every file's end and along it for symbols: the organism's silhouette repeated
// at the next scale down. Each rule comes in a few variants (angles and lengths jittered about +-20 % per branch), and
// an instance picks one by its seed, so no two neighbouring crowns repeat the same glyph. Terminal twigs curl and end
// in a rounded polyp bud (its rings carry a level above 1: the shaders light them).
// Vertex data: ring centre (position), ring offset and radius (aO), the branch base and its path distance (aS: the
// growth front collapses a branch onto its base), the ring's path distance, the branch's end distance, its level (0
// trunk .. 1 finest; 1.2 a bud) and a per-branch random (aP), the ring angle (aA).
//  fan:   a gorgonian branchlet: pinnate (alternate laterals along a gently curving axis, each a smaller copy, shorter
//         toward the tip so the outline is oval), its finest twigs joined into a net by short bridges
//  shard: crystals bearing crystals (three smaller shards from the sides of each, turning level by level)
//  hypha: a sympodial fork (one child nearly continues, the other turns away), the hyphal fringe of a mycelium
const CROWNS={
  fan:{depth:3,lat:[5,3,2],angle:.5,decay:.7,taper:.6,r0:.03,curl:.2,bud:2.2,net:.16},
  shard:{depth:2,angle:.55,decay:.58,taper:0,r0:.1},
  hypha:{depth:5,angle:.7,decay:.74,taper:.6,r0:.022,curl:.35,bud:2}
};
export const CROWN_VARIANTS=4;
export const CROWN_KEYS=Object.keys(CROWNS).flatMap(n=>Array.from({length:CROWN_VARIANTS},(_,v)=>`${n}:${v}`));
const crownCache=new Map();
// The recipe's length decay bends the crowns' self-similarity too (a few fixed steps, so templates are shared).
export const crownDecay=G=>{const d=G?.geometry?.lengthDecay;return Number.isFinite(d)?Math.round(clamp(d/.77,.85,1.12)*20)/20:1;};
export function buildCrown(key,lite=false,decayK=1){
  const ck=`${key}/${lite}/${decayK}`;if(crownCache.has(ck))return crownCache.get(ck);
  const [name,vs]=key.split(':'),variant=Number(vs)||0;
  const T={...CROWNS[name],decay:CROWNS[name].decay*decayK},depth=T.depth-(lite&&name!=='shard'?1:0),rr=rng(hash(`crown/${name}/${variant}`));
  const J=(k=.2)=>1+k*(rr()*2-1);
  const pos=[],aO=[],aS=[],aP=[],aA=[],index=[];let apex=null;
  const Z=[0,0,1];
  function ringFrame(t){let n=Math.abs(t[2])<.95?norm(cross(t,Z)):norm(cross(t,[1,0,0]));return [n,cross(t,n)];}
  // Rings along a polyline (radii per point), indexed into a tube.
  function tube(pts,radii,base,d0s,dEnd,level,br,rc){
    const first=pos.length/3,n=pts.length-1;
    for(let i=0;i<=n;i++){
      const t=norm(sub(pts[Math.min(n,i+1)],pts[Math.max(0,i-(i===n?1:0))])),[N,B]=ringFrame(i===n?norm(sub(pts[n],pts[n-1])):t);
      for(let k=0;k<rc;k++){const a=k/rc*6.283185307,o=add(mul(N,Math.cos(a)),mul(B,Math.sin(a)));
        pos.push(...pts[i]);aO.push(o[0],o[1],o[2],radii[i]);aS.push(base[0],base[1],base[2],d0s[0]);aP.push(d0s[i+1],dEnd,Array.isArray(level)?level[i]:level,br);aA.push(a);}}
    for(let i=0;i<n;i++)for(let k=0;k<rc;k++){const a=first+i*rc+k,b=first+i*rc+(k+1)%rc,c=a+rc,e=b+rc;index.push(a,c,b,b,c,e);}
  }
  // An axis of n steps from p along d bending by `bend` per step in the plane (or around a random axis for shards).
  function branch(p,d,len,rad,level,d0,{n=3,rc=4,bend=0,taper=T.taper,bud=0}={}){
    const pts=[p];let dd=d,q=p;
    for(let i=0;i<n;i++){if(i>0&&bend)dd=norm(rot(dd,Z,bend));q=add(q,mul(dd,len/n));pts.push(q);}
    const r1=rad*taper,radii=pts.map((_,i)=>rad+(r1-rad)*i/n),ds=[d0,...pts.map((_,i)=>d0+len*i/n)],br=rr(),lv=level/depth;
    if(bud>0){
      // A polyp bud: the twig's last ring swells and closes just beyond its end (a rounded tip; its rings carry 1.2).
      const R=Math.max(r1*1.7,rad*bud*.42),L=R*1.5,lvs=pts.map(()=>lv);pts.push(add(pts[n],mul(dd,L*.5)),add(pts[n],mul(dd,L)));radii.push(R,0);ds.push(d0+len+L*.45,d0+len+L);lvs.push(1.2,1.2);
      tube(pts,radii,p,ds,d0+len+L,lvs,br,rc);
    }else tube(pts,radii,p,ds,d0+len,lv,br,rc);
    return {pts,end:pts[n],dir:dd,dEnd:d0+len,r1};
  }
  const tips=[];
  if(name==='fan'){
    // Pinnate: alternate laterals along each axis, each a smaller copy of the axis, shorter toward its tip.
    const grow=(p,d,len,rad,level,d0,parent,lead)=>{
      const last=level>=depth,curlS=rr()<.5?-1:1,n=last?2:level<1?4:level<2?3:2,rc=level<1?5:level<2?4:3;
      const b=branch(p,d,len,rad,level,d0,{n,rc,bend:(last?.32:.06)*curlS*J(.4),bud:last?T.bud:level>=depth-1?T.bud*.8:0});
      if(lead&&last)apex=b.end;
      if(last){tips.push({p:b.end,parent,d:b.dEnd,r:b.r1});return;}
      const m=Math.max(2,T.lat[Math.min(level,T.lat.length-1)]-(lite?1:0)),s0=rr()<.5?-1:1;
      for(let k=0;k<m;k++){const f=Math.min(.94,.2+.72*(k+.5)/m+.04*(rr()-.5)),i=Math.min(n-1,Math.floor(f*n)),u=f*n-i;
        const at=mix(b.pts[i],b.pts[i+1],u),td=norm(sub(b.pts[i+1],b.pts[i])),side=(k%2?1:-1)*s0;
        const nd=norm(rot(td,Z,side*T.angle*J()*(level?1:1.08)));
        grow(at,nd,len*T.decay*(1.08-.5*f)*J(),(rad+(b.r1-rad)*f)*.72,level+1,d0+len*f,`${parent}/${k}`,false);}
      // The axis itself ends in a short sympodial fork (a stronger continuation and a weaker lateral).
      grow(b.end,norm(rot(b.dir,Z,.12*s0*J())),len*T.decay*.55*J(),b.r1,level+1,b.dEnd,`${parent}/e`,lead);
    };
    grow([0,0,0],[0,1,0],.42,T.r0,0,0,'r',true);
    // The net: neighbouring twigs of different laterals fuse by short bridges (anastomoses), as in a real sea fan.
    const used=new Set();
    tips.forEach((a,i)=>{if(used.has(i))return;let best=-1,bd=T.net;
      tips.forEach((b,j)=>{if(j===i||used.has(j))return;const pa=a.parent.split('/'),pb=b.parent.split('/');if(pa.slice(0,-1).join('/')===pb.slice(0,-1).join('/'))return;
        const d=Math.hypot(a.p[0]-b.p[0],a.p[1]-b.p[1]);if(d<bd){bd=d;best=j;}});
      if(best<0)return;used.add(i);used.add(best);const b=tips[best],dir=norm(sub(b.p,a.p)),L=Math.hypot(...sub(b.p,a.p));
      const mid=add(mix(a.p,b.p,.5),mul([-dir[1],dir[0],0],L*.12*(rr()-.5)));
      tube([a.p,mid,b.p],[a.r,a.r*.8,a.r],a.p,[a.d,a.d,a.d+L*.5,a.d+L],a.d+L,1,rr(),3);});
  }else if(name==='shard'){
    // Shards bearing shards: three smaller crystals from the sides of each, turning around the axis level by level.
    const grow=(p,d,len,rad,level,d0,lead)=>{
      const b=branch(p,d,len,rad,level,d0,{n:level<2?2:1,rc:6,taper:0});
      if(lead&&level===0)apex=b.end;
      if(level>=depth)return;
      for(let c=0;c<3;c++){const f=(.42+.2*c)*J(.1),s=add(p,mul(d,len*f)),nd=diverge(d,T.angle*J(),c*2.0944+level*1.1+rr()*.6);
        grow(s,nd,len*T.decay*(1-.12*c)*J(),rad*.58,level+1,d0+len*f,false);}
    };
    grow([0,0,0],[0,1,0],.6,T.r0,0,0,true);
  }else{
    // Hyphae: a sympodial fork in the plane; the finest level is short and ends in a glowing tip.
    const grow=(p,d,len,rad,level,d0,lead)=>{
      const last=level>=depth,curlS=rr()<.5?-1:1;
      const b=branch(p,d,len,rad,level,d0,{n:level<2?3:level<4?2:1,rc:level<2?6:level<4?4:3,bend:T.curl*.3*curlS*J(.5),bud:last?T.bud:0});
      if(lead&&last)apex=b.end;if(last)return;
      const s=rr()<.5?1:-1,dk=T.decay*(level+1>=depth?.5:1);
      grow(b.end,norm(rot(b.dir,Z,s*T.angle*.42*J())),len*dk*J(),b.r1,level+1,b.dEnd,lead);
      grow(b.end,norm(rot(b.dir,Z,-s*T.angle*1.05*J())),len*dk*.86*J(),b.r1*.92,level+1,b.dEnd,false);
    };
    grow([0,0,0],[0,1,0],.3,T.r0,0,0,true);
  }
  if(!apex)apex=[0,1,0];
  // Normalise to unit size (the farthest ring centre from the base at distance 1).
  let m=1e-6;for(let i=0;i<pos.length;i+=3)m=Math.max(m,Math.hypot(pos[i],pos[i+1],pos[i+2]));const k=1/m;let maxD=0;
  for(let i=0;i<pos.length;i++)pos[i]*=k;
  for(let i=0;i<aO.length;i+=4){aO[i+3]*=k;aS[i]*=k;aS[i+1]*=k;aS[i+2]*=k;aS[i+3]*=k;aP[i]*=k;aP[i+1]*=k;maxD=Math.max(maxD,aP[i+1]);}
  // The lateral half-width of the template (for keeping a crown inside its organism's outline).
  let hw=0;for(let i=0;i<pos.length;i+=3)hw=Math.max(hw,Math.abs(pos[i]));
  const out={pos:new Float32Array(pos),aO:new Float32Array(aO),aS:new Float32Array(aS),aP:new Float32Array(aP),aA:new Float32Array(aA),
    index:pos.length/3>65535?new Uint32Array(index):new Uint16Array(index),maxD,apex:mul(apex,k),halfWidth:hw,verts:pos.length/3};
  crownCache.set(ck,out);return out;
}
// ---- Species of a subsystem ----------------------------------------------------------------------------------------
// From the subsystem's own role and data; the world's dominant species takes the core and close cases (the seed
// decides between near-equal candidates). A pure function of the model state.
const ORDER=['coral','crystal-tree','fern','kelp','mycelial'];
export function speciesOf(d,members,cross,dominant){
  if(d.test||d.role==='tests'||d.role==='model')return 'crystal-tree';
  if(d.role==='interface')return 'coral';
  if(d.role==='services')return 'kelp';
  if(d.role==='core')return dominant;
  const c=d.counts||{},n=Math.max(1,members.length);
  const ui=c['ui.component']||0,cls=(c.class||0)+(c.interface||0)+(c.type||0),fn=(c.function||0)+(c.method||0);
  const total=Math.max(1,ui+cls+fn+(c['api.route']||0)+(c.variable||0)),dirs=new Set(members.map(m=>m.dir)).size;
  const score={mycelial:1.2*clamp((cross/n-1.5)/3),fern:n>=4?clamp((dirs-2)/5)+.6*clamp(dirs/n*2.5-.3):0,kelp:1.1*(fn/total)*clamp(n/3),
    'crystal-tree':2.6*cls/total,coral:2.6*ui/total};
  score[dominant]=(score[dominant]||0)+.3;
  let best=dominant,bs=-1;for(const k of ORDER){const s=score[k]+.25*rand(hash(`${d.id}/${k}`));if(s>bs){bs=s;best=k;}}
  return best;
}
// ---- The forest ---------------------------------------------------------------------------------------------------
// opts: {species (dominant), G (genome), epoch, quality, current (radians: the fans face it)}.
// Returns packed arrays, organisms and per-module anchors.
export function growForest(model,{species:dominant,G,epoch,quality=0,current=0}){
  const GEO=G.geometry||{},SPACE=G.space||{},SEC=G.secondary||{};
  const curlK=Number.isFinite(GEO.curl)?GEO.curl/.25:1,gravK=Number.isFinite(GEO.gravitropism)?GEO.gravitropism:.2;
  const rootK=Number.isFinite(SPACE.rootVisibility)?SPACE.rootVisibility:.6,bloomK=Number.isFinite(SEC.blossomScale)?SEC.blossomScale:1;
  const canopy=Number.isFinite(SPACE.canopy)?SPACE.canopy:1,spread=1.25*(Number.isFinite(SPACE.spread)?SPACE.spread:1);
  const angleK=(Number.isFinite(GEO.branchAngle)?GEO.branchAngle:.55)/.55,decayK=(Number.isFinite(GEO.lengthDecay)?GEO.lengthDecay:.77)/.77;
  const taper=Number.isFinite(GEO.taper)?GEO.taper:.65,leafK=Number.isFinite(GEO.leafDensity)?GEO.leafDensity:.9;
  const lite=quality>=2,cDecay=crownDecay(G);
  // Level of detail for large projects (thresholds, so it rarely changes while a project grows).
  const M=model.modules.size,big=M>200,mid=M>60,liteCrown=lite||big;
  const symCap=lite?4:big?3:mid?8:16;
  const SP=name=>{const b=SPECIES[name];return {...b,curl:b.curl*clamp(curlK,0,2.8),up:b.up+(b.mode==='network'?0:.6*(gravK-.2))};};
  const seg=[],fine=[],leaf=[],glow=[],crowns=Object.fromEntries(CROWN_KEYS.map(k=>[k,[]]));
  const orgs=[],anchors=new Map(),moduleIndex=new Map(),moduleIds=[];
  const districts=[...model.districts.values()].filter(d=>d.members.length).sort((a,b)=>a.order-b.order);
  for(const d of districts)for(const id of d.members)if(!moduleIndex.has(id)&&model.modules.has(id)){moduleIndex.set(id,moduleIds.length);moduleIds.push(id);}
  // Cross-subsystem dependencies per subsystem (living links).
  const crossOf=new Map();
  for(const l of model.links.values()){if(l.removed!==null)continue;const a=model.modules.get(l.a),b=model.modules.get(l.b);if(!a||!b||a.group===b.group)continue;
    crossOf.set(a.group,(crossOf.get(a.group)||0)+1);crossOf.set(b.group,(crossOf.get(b.group)||0)+1);}
  const curDir=[Math.cos(current),0,Math.sin(current)];
  // ---- Emitters -----------------------------------------------------------------------------------------------
  // An axis as segments (cubic Bezier through Catmull-Rom tangents): it grows from `born` over `dur` seconds.
  function emit(ax,r0,r1,o){
    const out=o.fine?fine:seg,n=ax.n,P=ax.pts;
    for(let i=0;i<n;i++){
      const a=P[i],b=P[i+1],pv=P[i-1]||sub(mul(a,2),b),nx=P[i+2]||sub(mul(b,2),a);
      const c1=add(a,mul(sub(b,pv),1/6)),c2=sub(b,mul(sub(nx,a),1/6));
      const ra=r0+(r1-r0)*i/n,rb=r0+(r1-r0)*(i+1)/n;
      out.push(a[0],a[1],a[2],ra,b[0],b[1],b[2],rb,c1[0],c1[1],c1[2],o.dist+ax.step*i,c2[0],c2[1],c2[2],o.dist+ax.step*(i+1),
        o.born+o.dur*i/n,o.removed,Math.max(.05,o.dur/n),o.profileAll||(i===n-1?(o.profile||0):0),o.module,o.org,o.tip0+(o.tip1-o.tip0)*(i+.5)/n,o.seed);
    }
  }
  const leafOut=(p,dist,dir,size,width,shape,born,removed,module,org,seed,colour)=>leaf.push(p[0],p[1],p[2],dist,dir[0],dir[1],dir[2],size,width,shape,born,removed,module,org,seed,colour||0);
  const glowOut=(p,dist,size,kind,born,removed,module,org,seed,colour)=>glow.push(p[0],p[1],p[2],dist,size,kind,born,removed,module,org,seed,colour||0);
  // A crown: a scaled copy of the species' rule; side (X) and dir (Y) span its plane.
  // baseR: the radius of the branch it continues (the crown's first ring matches it exactly).
  const crownOut=(name,p,dir,side,scale,dist,born,removed,module,org,seed,colour,baseR=0,width=1)=>{
    const key=`${name}:${Math.floor(rand(Math.floor(seed*1e9)+17)*CROWN_VARIANTS)%CROWN_VARIANTS}`;
    const C=buildCrown(key,liteCrown,cDecay),dur=Math.min(3.2,.9+scale*1.1);dir=norm(dir);side=norm(sub(side,mul(dir,dot(side,dir))));
    const rk=baseR>0?clamp(baseR/(C.aO[3]*scale),.4,6):1;
    crowns[key].push(p[0],p[1],p[2],scale,dir[0],dir[1],dir[2],width,side[0],side[1],side[2],dist,born,removed,dur,rk,module,org,seed,colour||0);
    const z=cross(side,dir),a=C.apex;return {apex:add(p,mul(add(add(mul(side,a[0]*width),mul(dir,a[1])),mul(z,a[2])),scale)),apexDist:dist+C.maxD*scale*.8,dur};
  };
  // Growth runs outward: a child starts when its parent's growth front reaches it, never before its own data exists.
  const after=(parentBorn,parentDur,frac,own)=>Math.max(own,parentBorn+parentDur*frac+.05);
  const durOf=len=>Math.min(2.4,.6+len*.3);
  // ---- Organisms ----------------------------------------------------------------------------------------------
  const hexWorld=(q,r)=>[(SQRT3*q+SQRT3/2*r)*spread,0,1.5*r*spread];
  districts.forEach(district=>{
    const h=hash(district.id),rr=rng(h);
    const members=district.members.map(id=>model.modules.get(id)).filter(Boolean).sort((a,b)=>a.order-b.order);
    if(!members.length)return;
    const name=speciesOf(district,members,crossOf.get(district.id)||0,SPECIES[dominant]?dominant:'coral'),sp=SP(name);
    const index=orgs.length;
    const born=secsOf(Math.min(...members.map(m=>m.born)),epoch);
    const modRemoved=m=>m.removed===null?1e6:secsOf(m.removed,epoch);
    // Removed when every module is gone (after its own fade).
    const orgRemoved=members.every(m=>m.removed!==null)?Math.max(...members.map(modRemoved)):1e6;
    const root=hexWorld(district.q,district.r);
    const folders=[];const byDir=new Map();for(const m of members){if(!byDir.has(m.dir)){byDir.set(m.dir,[]);folders.push(m.dir);}byDir.get(m.dir).push(m);}
    const org={id:district.id,index,root,born,removed:orgRemoved,members:members.map(m=>m.id),crown:[],height:1,radius:1,top:root,folders:folders.length,species:name,speciesIndex:SPECIES_INDEX[name],fan:null};
    const symbolsOf=m=>[...m.symbols].map(id=>model.symbols.get(id)).filter(Boolean).sort((a,b)=>a.slot-b.slot||(a.id<b.id?-1:1));
    const symBorn=(s,mb)=>{const b=model.bornAt(s);return Math.max(mb,b===Infinity?1e6:secsOf(b,epoch));};
    const symRemoved=(s,m)=>Math.min(s.removed===null?1e6:secsOf(s.removed,epoch),modRemoved(m));
    // Subtree removal: a branch that still carries living branches stays (bare) until they are gone too.
    const keep=(own,children)=>children.length?Math.max(own,...children):own;
    const base={org:index,seed:0,tip:0};
    const modIdx=m=>moduleIndex.get(m.id)??-1;
    const anchor=(m,tip,dir,dist,baseP,size)=>{anchors.set(m.id,{tip,dir,dist,base:baseP,org:index,size});};
    const crown=(p,dist,size)=>org.crown.push({p,dist,size});
    // The organism's seed: a point of light at the root while it first grows (it fades once the organism stands).
    glowOut(add(root,[0,.12,0]),0,1.1*canopy,GLOWKIND.seed,born,born+5,-1,index,rand(h+3),0);
    if(name==='coral'){
      // A gorgonian sea fan: a holdfast and a short stalk (about a tenth of its height), then one plane facing the
      // current, its outline an oval wider than tall. Every folder is a rib leaving the stalk at its own angle (a golden
      // spread: a new folder finds a gap and nothing moves) and curving upward; files leave their rib alternately; every
      // branch ends in a crown that repeats the fan's rule one scale down, fitted inside the oval; neighbouring branches
      // fuse into a net.
      const fan=norm([curDir[0]+(rand(h+4)-.5)*.5,0,curDir[2]+(rand(h+5)-.5)*.5]),inPlane=norm(cross([0,1,0],fan));org.fan=fan;
      const nF=members.length,Hf=canopy*(2.5+.32*Math.sqrt(nF))*(.9+.2*rand(h+6)),Wf=Hf*(1.25+.3*rand(h+7));
      const Lt=Math.min(sp.trunk*(.85+.3*rand(h+3))*canopy,Hf*.07),rT=.1*sp.thick*(1+.06*Math.sqrt(nF));
      const trunk=axis(root,norm(add([0,1,0],mul(inPlane,(rand(h+1)-.5)*.2))),Lt,2,sp,rr,{plane:fan,curl:0}),top=tipOf(trunk),trunkDur=durOf(Lt)*.8;
      const E={c:add(top,[0,Hf*.47,0]),a:Wf/2,b:Hf/2};
      // Distance from p along d to the oval (in the fan's plane).
      const reach=(p,d)=>{const pu=dot(sub(p,E.c),inPlane)/E.a,pv=(p[1]-E.c[1])/E.b,du=dot(d,inPlane)/E.a,dv=d[1]/E.b;
        const A=du*du+dv*dv,B=2*(pu*du+pv*dv),C=pu*pu+pv*pv-1,D=B*B-4*A*C;return D<0||A<1e-9?0:Math.max(0,(-B+Math.sqrt(D))/(2*A));};
      const planeSide=d=>norm(cross(fan,d));
      const hw=buildCrown('fan:0',liteCrown,cDecay).halfWidth||.4;
      // A crown's scale: what the branch asks for, but kept inside the oval (ahead and to both sides).
      const fit=(e,d,want)=>{const sd=planeSide(d),r=Math.min(reach(e,d)*.95,Math.min(reach(e,sd),reach(e,mul(sd,-1)))/hw*.9);return Math.max(want*.22,Math.min(want,r));};
      const folderNodes=[],ends=[];
      // Fan coordinates: a point at (rho, phi) lies on the ray from the stalk top at angle phi from the vertical, at
      // the fraction rho of the way to the oval's rim.
      const rim=phi=>{const sn=Math.sin(phi),cs=Math.cos(phi);return 2*cs/E.b/(sn*sn/(E.a*E.a)+cs*cs/(E.b*E.b));};
      const fanAt=(rho,phi)=>add(top,mul(add(mul(inPlane,Math.sin(phi)),[0,Math.cos(phi),0]),rho*rim(phi)));
      // A branch from (rho0, phi0) to (rho1, phi1): it leaves along its parent's line and turns toward its own (the
      // gorgonian habit: forks that diverge, then climb side by side toward the rim), with a slight seeded waviness.
      const fanAxis=(rho0,phi0,rho1,phi1,n,seedF)=>{const rr2=rng(seedF),pts=[];
        for(let i=0;i<=n;i++){const t=i/n,k=t<.6?(t/.6)*(t/.6)*(3-2*t/.6):1,w=i>0&&i<n?(rr2()-.5)*.035:0;pts.push(fanAt(rho0+(rho1-rho0)*t,phi0+(phi1-phi0)*k+w));}
        let len=0;for(let i=0;i<n;i++)len+=Math.hypot(...sub(pts[i+1],pts[i]));return {pts,len,step:len/n,n,end:norm(sub(pts[n],pts[n-1])),start:norm(sub(pts[1],pts[0]))};};
      // Folders: a short rib each, owning a sector of the fan (centred by a golden spread, so a new folder finds a gap
      // and nothing moves); its files form a binary heap that splits the sector in halves level by level (a dichotomous
      // fan), leaves reaching toward the rim.
      const TH=1.2*Math.min(1.15,angleK),nFold=folders.length,RIB=.06,LEAFR=.46;
      folders.forEach((dir,j)=>{const files=byDir.get(dir),fb=Math.min(...files.map(m=>secsOf(m.born,epoch))),fr=files.every(m=>m.removed!==null)?Math.max(...files.map(modRemoved)):1e6;
        const c=j===0?0:(((j*.6180339+.5)%1)-.5)*2*TH*.8,w=nFold===1?TH:j===0?TH*.62:TH*.42;
        const ax=fanAxis(0,0,RIB*(.85+.3*rand(hash(dir)^h)),c,3,hash(dir)^h),r0=rT*.8*(j===0?1:.85);
        folderNodes.push({ax,born:after(born,trunkDur,1,fb),dur:durOf(ax.len),dist:Lt,r0,r1:r0*.8,removed:fr,id:`${dir}/${h}`,files,l:c-w,r:c+w,rho:RIB,phi:c});});
      for(const F of folderNodes){
        // A crowded folder carries finer crowns (its limbs stay bold), so a large fan keeps a hierarchy.
        const nf=F.files.length,D=Math.floor(Math.log2(nf))+1;F.nodes=[];
        F.files.forEach((m,k)=>{const d=Math.floor(Math.log2(k+1)),pi=k?Math.floor((k-1)/2):-1,P=pi<0?null:F.nodes[pi];
          const l0=P?P.l:F.l,r0i=P?P.r:F.r,mid=(l0+r0i)/2,iv=k===0?[l0,r0i]:(k%2?[l0,mid]:[mid,r0i]);
          const leaf=2*k+1>=nf,rho1=leaf?LEAFR*(.92+.12*rand(hash(m.id))):RIB+(LEAFR-RIB)*Math.pow((d+1)/(D+.6),1.5),phi1=(iv[0]+iv[1])/2+(iv[1]-iv[0])*.12*(rand(hash(m.id)+3)-.5);
          const s0=P?P.ax.pts[P.ax.n]:tipOf(F.ax),rho0=P?P.rho:F.rho,phi0=P?P.phi:F.phi;
          const ax=fanAxis(rho0,phi0,Math.max(rho0+.06,rho1),phi1,4,hash(m.id)^h);const pr=P?P.r1:F.r1;
          const node={ax,born:after(P?P.born:F.born,P?P.dur:F.dur,1,secsOf(m.born,epoch)),dur:durOf(ax.len),dist:P?P.dist+P.ax.len:F.dist+F.ax.len,r0:pr*(k?.72:1),r1:pr*(k?.72:1)*.7,m,removed:modRemoved(m),
            l:iv[0],r:iv[1],rho:Math.max(rho0+.06,rho1),phi:phi1,leaf,width:(iv[1]-iv[0])};F.nodes.push(node);});
        // Subtree removal from the leaves up.
        for(let k=F.nodes.length-1;k>=0;k--){const kids=[F.nodes[2*k+1],F.nodes[2*k+2]].filter(Boolean).map(x=>x.subtree);F.nodes[k].subtree=keep(F.nodes[k].removed,kids);}
        F.subtree=keep(F.removed,F.nodes.length?[F.nodes[0].subtree]:[]);}
      // A large colony merges its rim into fewer, larger crowns (about fifty): the limbs stay legible.
      let leafNo=0;const leaves=folderNodes.reduce((a,F)=>a+F.nodes.filter(n=>n.leaf).length,0),crownStep=Math.max(1,Math.ceil(leaves/50)),crownK=Math.sqrt(crownStep);
      const trunkRemoved=Math.max(orgRemoved,folderNodes.length?Math.max(...folderNodes.map(f=>f.subtree)):orgRemoved);
      // The holdfast: a flared base and thin roots gripping the ground.
      for(let c=0;c<5;c++){const az=c*GOLDEN+rand(h+11)*6.283,dir=norm([Math.cos(az),-.05,Math.sin(az)]);
        const ax=axis(add(root,[Math.cos(az)*rT*.5,.03,Math.sin(az)*rT*.5]),dir,(.35+.4*rand(h+c))*canopy*(.45+rootK)*(1+.05*Math.sqrt(nF)),5,sp,rr,{up:0,curl:.9,straight:false,flat:true});
        emit(ax,rT*.32,.004,{...base,born,dur:trunkDur,dist:0,removed:trunkRemoved,module:-1,tip0:0,tip1:.05,seed:rand(h+c),fine:true});}
      emit(trunk,rT,rT*.8,{...base,born,dur:trunkDur,dist:0,removed:trunkRemoved,module:-1,tip0:0,tip1:.08,seed:rand(h),profileAll:PROFILE.trunk});
      for(const F of folderNodes){
        emit(F.ax,F.r0,F.r1,{...base,born:F.born,dur:F.dur,dist:F.dist,removed:F.subtree,module:-1,tip0:.08,tip1:.3,seed:rand(hash(F.id))});
        for(const n of F.nodes){const m=n.m,mi=modIdx(m),end=tipOf(n.ax),endDist=n.dist+n.ax.len;
          emit(n.ax,n.r0,n.r1,{...base,born:n.born,dur:n.dur,dist:n.dist,removed:n.subtree,module:mi,tip0:.25,tip1:.45,seed:rand(hash(m.id))});
          // The file's crown: to the rim for a leaf, a smaller spray at a fork; never wider than its own sector.
          const span=(n.rho+.3)*rim(n.phi)*n.width*crownK,want=n.leaf?(1-n.rho)*rim(n.phi)*1.08:Math.min(.6*canopy,span*.7);
          const cs2=fit(end,n.ax.end,Math.min(want,span*.75/hw+.2*canopy));
          // A crowded folder keeps its forks bare (bold limbs, lace only at the rim): hierarchy instead of a hairball.
          const bare=(!n.leaf&&F.files.length>4)||(n.leaf&&crownStep>1&&(leafNo++%crownStep)!==0);
          if(!bare)crownOut('fan',end,n.leaf?n.ax.end:norm(rot(n.ax.end,fan,(rand(hash(m.id)+5)<.5?-1:1)*.5)),planeSide(n.ax.end),cs2,endDist,n.born+n.dur*.9,n.removed,mi,index,rand(hash(m.id)+1),0,n.r1);
          crown(add(end,mul(n.ax.end,cs2*.6)),endDist+cs2*.6,cs2);ends.push({p:add(end,mul(n.ax.end,cs2*.45)),dist:endDist+cs2*.45,born:n.born+n.dur,removed:n.removed,r:n.r1,f:F});
          // Symbols: smaller crowns along the branch, alternating sides in the plane (their kind colours them).
          symbolsOf(m).slice(0,bare?0:nF>60?Math.min(2,symCap):symCap).forEach((sy,i)=>{const sb=symBorn(sy,n.born),sr=symRemoved(sy,m),frac=.3+.62*((i*.6180339+.13)%1),q=at(n.ax,n.ax.len*frac);
            const dir=norm(rot(q.d,fan,(i%2?1:-1)*(.7+.2*rand(hash(sy.id)))*angleK)),sc=fit(q.p,dir,cs2*sp.symK*(.75+.4*rand(hash(sy.id)+3)));
            crownOut('fan',q.p,dir,planeSide(dir),sc,n.dist+n.ax.len*frac,after(n.born,n.dur,frac,sb),sr,mi,index,rand(hash(sy.id)),KIND_COLOR[sy.kind]??0,(n.r0+(n.r1-n.r0)*frac)*.6);});
          // Fresh polyps: hidden at the file's end, they open (and stay) once a failing file is repaired.
          for(let k=0;k<5;k++){const a=k*GOLDEN+rand(hash(m.id)+40)*6.283,o=add(mul(planeSide(n.ax.end),Math.cos(a)*cs2*.22),mul(n.ax.end,(.15+.25*Math.abs(Math.sin(a)))*cs2));
            glowOut(add(end,o),endDist+cs2*.3,.07+.03*rand(hash(m.id)+41+k),GLOWKIND.fresh,n.born+n.dur,n.removed,mi,index,rand(hash(m.id)+44+k),5);}
          anchor(m,end,n.ax.end,endDist,n.ax.pts[0],n.ax.len);}}
      // The net at the fan's scale: a branch's crown fuses with its nearest neighbour on another rib (or far along its own).
      const used=new Set();
      ends.forEach((a,i)=>{if(used.has(i))return;let best=-1,bd=Hf*.2;
        ends.forEach((b,j)=>{if(j<=i||used.has(j))return;const d=Math.hypot(...sub(a.p,b.p));if(d<bd&&(b.f!==a.f||d>Hf*.06)){bd=d;best=j;}});
        if(best<0)return;used.add(i);used.add(best);const b=ends[best],L=Math.hypot(...sub(b.p,a.p)),d=norm(sub(b.p,a.p));
        const ax={pts:[a.p,add(mix(a.p,b.p,.5),[0,-L*.06,0]),b.p],len:L,step:L/2,n:2,end:d};
        emit(ax,Math.min(a.r,b.r)*.7,Math.min(a.r,b.r)*.7,{...base,born:Math.max(a.born,b.born)+.6,dur:1.2,dist:Math.max(a.dist,b.dist),removed:Math.min(a.removed,b.removed),module:-1,tip0:.7,tip1:.7,seed:rand(i*31+7),fine:true});});
    }else if(sp.mode==='fork'){
      // Trunk, then a heap of folders (arity-ary: folder j hangs from folder floor((j-1)/A)), then per folder a heap of
      // files; deeper elements are scaled copies (decay) diverging at the species' angle, every file ends in a crown.
      const A=sp.arity,coral=name==='coral';
      // Sea fans face the current (their plane is perpendicular to it); crystal trees have no plane.
      const fan=coral?norm([curDir[0]+(rand(h+4)-.5)*.5,0,curDir[2]+(rand(h+5)-.5)*.5]):[Math.cos(rand(h+4)*Math.PI),0,Math.sin(rand(h+4)*Math.PI)];
      const inPlane=norm(cross([0,1,0],fan));org.fan=fan;
      const lean=coral?norm(add([0,1,0],mul(inPlane,(rand(h+1)-.5)*.25))):norm([(rand(h+1)-.5)*.3,1,(rand(h+2)-.5)*.3]);
      const Lt=sp.trunk*(.85+.3*rand(h+3))*canopy,rT=.15*sp.thick;
      const trunk=axis(root,lean,Lt,coral?2:sp.straight?2:4,sp,rr,{plane:coral?fan:null});
      const trunkDur=durOf(Lt)*.8;
      const place=(parent,sib,depth,len,rad,id,ownBorn,ownRemoved)=>{
        // Children cluster on the parent's last third: the leader at its end, forks a little below.
        const frac=sib<0?1:1-.22*(sib+1)/(A+1);
        const s=parent.ax.len*frac,q=at(parent.ax,s);
        const spreadA=coral?sp.angle*angleK*(.75+.5*rand(hash(id)+7))*(sib%2?1:-1):sp.angle*angleK*(.85+.3*rand(hash(id)+7));
        const dir=sib<0?diverge(q.d,(coral?.18:.12)*angleK,rand(hash(id))*6.283,sp.planar,fan):coral?norm(rot(q.d,fan,spreadA)):diverge(q.d,spreadA,(sib+.5)*6.283/A+depth*GOLDEN+rand(hash(id)+9)*.5);
        const b=after(parent.born,parent.dur,frac,ownBorn);const ax=axis(q.p,dir,len,sp.straight?2:3,sp,rng(hash(id)^h),{plane:coral?fan:null});
        return {ax,born:b,dur:durOf(len),dist:parent.dist+s,r0:Math.min(rad,parent.r1),r1:Math.min(rad,parent.r1)*taper,removed:ownRemoved,depth,id};
      };
      const trunkNode={ax:trunk,born,dur:trunkDur,dist:0,r1:rT*.8,depth:-1};
      const folderNodes=[];
      const folderOf=dir=>{const files=byDir.get(dir);return {files,fb:Math.min(...files.map(m=>secsOf(m.born,epoch))),fr:files.every(m=>m.removed!==null)?Math.max(...files.map(modRemoved)):1e6};};
      if(coral){
        // A sea fan: every folder is a rib leaving the stalk at its own angle in the plane (a golden spread, so a new
        // folder finds a gap and nothing moves); files leave their rib alternately, spreading wider low on the fan.
        folders.forEach((dir,j)=>{const {files,fb,fr}=folderOf(dir);
          const th=j===0?0:(((j*.6180339+.5)%1)-.5)*2.1*Math.min(1.3,angleK);
          const L=sp.limb*(.75+.22*Math.sqrt(files.length))*(.9+.2*rand(hash(dir)^h))*canopy,r0=trunkNode.r1*(j===0?1:.85);
          const ax=axis(tipOf(trunk),norm(rot(trunk.end,fan,th)),L,3,sp,rng(hash(dir)^h),{plane:fan});
          folderNodes.push({ax,born:after(born,trunkDur,1,fb),dur:durOf(L),dist:Lt,r0,r1:r0*taper,removed:fr,depth:0,id:`${dir}/${h}`});});
        folders.forEach((dir,j)=>{const {files}=folderOf(dir),F=folderNodes[j],nodes=[];
          files.forEach((m,k)=>{const f=.18+.78*((k*.6180339+.31)%1),q=at(F.ax,F.ax.len*f),side=k%2?1:-1;
            const spread=(1.1-.55*f)*angleK*(.85+.3*rand(hash(m.id)+7)),dir2=norm(rot(q.d,fan,side*spread));
            const L=sp.branch*(1.15-.45*f)*(.8+.4*rand(hash(m.id)))*canopy,ax=axis(q.p,dir2,L,3,sp,rng(hash(m.id)^h),{plane:fan});
            const r0=(F.r0+(F.r1-F.r0)*f)*.72;
            const n={ax,born:after(F.born,F.dur,f,secsOf(m.born,epoch)),dur:durOf(L),dist:F.dist+F.ax.len*f,r0,r1:r0*taper,removed:modRemoved(m),m,subtree:modRemoved(m)};nodes.push(n);});
          F.subtree=keep(F.removed,nodes.map(n=>n.subtree));F.nodes=nodes;});
      }else{
      folders.forEach((dir,j)=>{
        const {files,fb,fr}=folderOf(dir);
        const parent=j===0?trunkNode:folderNodes[Math.floor((j-1)/A)],sib=j===0?-1:(j-1)%A,depth=j===0?0:parent.depth+1;
        const L=sp.limb*Math.pow(sp.decay*decayK,depth)*(.85+.3*rand(hash(dir)^h))*canopy;
        folderNodes.push(place(parent,sib,depth,L,parent.r1*(sib<0?1:.8),`${dir}/${h}`,fb,fr));
      });
      // File heaps.
      folders.forEach((dir,j)=>{
        const files=byDir.get(dir),F=folderNodes[j],nodes=[];
        files.forEach((m,k)=>{
          const parent=k===0?F:nodes[Math.floor((k-1)/A)],sib=k===0?-1:(k-1)%A,depth=(k===0?0:parent.fdepth+1);
          const L=sp.branch*Math.pow(sp.decay*decayK,depth+F.depth*.6)*(.8+.4*rand(hash(m.id)))*canopy;
          const n=place(parent,sib,F.depth+depth+1,L,parent.r1*(sib<0?1:.82),m.id,secsOf(m.born,epoch),modRemoved(m));n.fdepth=depth;n.m=m;nodes.push(n);
        });
        // Subtree removal from the leaves up (heap children have larger indices).
        for(let k=nodes.length-1;k>=0;k--){const kids=[];for(let c=1;c<=A;c++){const x=nodes[k*A+c];if(x)kids.push(x.subtree);}nodes[k].subtree=keep(nodes[k].removed,kids);}
        F.subtree=keep(F.removed,nodes.length?[nodes[0].subtree]:[]);
        F.nodes=nodes;
      });
      for(let j=folderNodes.length-1;j>=0;j--){const kids=[];for(let c=1;c<=A;c++){const x=folderNodes[j*A+c];if(x)kids.push(x.subtree);}folderNodes[j].subtree=keep(folderNodes[j].subtree,kids);}
      }
      const trunkRemoved=Math.max(orgRemoved,folderNodes.length?Math.max(...folderNodes.map(f=>f.subtree)):orgRemoved);
      // Surface roots: they leave the flared base along the ground and thin out into the hyphae.
      for(let c=0;c<5;c++){const az=c*GOLDEN+rand(h+11)*6.283,dir=norm([Math.cos(az),-.05,Math.sin(az)]);
        const ax=axis(add(root,[Math.cos(az)*rT*.5,.03,Math.sin(az)*rT*.5]),dir,(.5+.5*rand(h+c))*canopy*(.45+rootK)*(1+.06*Math.sqrt(members.length)),5,sp,rr,{up:0,curl:.9,straight:false,flat:true});
        emit(ax,rT*.32,.004,{...base,born,dur:trunkDur,dist:0,removed:trunkRemoved,module:-1,tip0:0,tip1:.05,seed:rand(h+c),fine:true});}
      emit(trunk,rT,trunkNode.r1,{...base,born,dur:trunkDur,dist:0,removed:trunkRemoved,module:-1,tip0:0,tip1:.1,seed:rand(h),profileAll:PROFILE.trunk});
      folderNodes.forEach(F=>emit(F.ax,F.r0,F.r1,{...base,born:F.born,dur:F.dur,dist:F.dist,removed:F.subtree,module:-1,tip0:.1,tip1:.2,seed:rand(hash(F.id))}));
      const planeSide=d=>coral?norm(cross(fan,d)):perp(d);
      // A sea fan's ribs end in a crown too (the fan's outline).
      if(coral)for(const F of folderNodes){const e=tipOf(F.ax),cs=(.35+F.ax.len*.9)*canopy;crownOut('fan',e,F.ax.end,planeSide(F.ax.end),cs,F.dist+F.ax.len,F.born+F.dur*.9,F.subtree,-1,index,rand(hash(F.id)+3),0,F.r1);crown(add(e,mul(F.ax.end,cs*.6)),F.dist+F.ax.len+cs*.6,cs);}
      for(const F of folderNodes)for(const n of F.nodes){
        const m=n.m,mi=modIdx(m);
        emit(n.ax,n.r0,n.r1,{...base,born:n.born,dur:n.dur,dist:n.dist,removed:n.subtree,module:mi,tip0:.25,tip1:.35,seed:rand(hash(m.id))});
        const end=tipOf(n.ax),endDist=n.dist+n.ax.len;
        // The file's crown: the organism's rule at the next scale down.
        const cs=(.35+n.ax.len*sp.crownK)*canopy;
        crownOut(sp.crown,end,n.ax.end,planeSide(n.ax.end),cs,endDist,n.born+n.dur*.9,modRemoved(m),mi,index,rand(hash(m.id)+1),0,n.r1);
        crown(add(end,mul(n.ax.end,cs*.6)),endDist+cs*.6,cs);
        // Symbols: smaller crowns along the branch, alternating sides in the plane, each with one light at its tip.
        const syms=symbolsOf(m).slice(0,symCap);
        syms.forEach((s,i)=>{
          const sb=symBorn(s,n.born),sr=symRemoved(s,m),frac=.3+.62*((i*.6180339+.13)%1),q=at(n.ax,n.ax.len*frac);
          const side=i%2?1:-1,dir=coral?norm(rot(q.d,fan,side*(.7+.2*rand(hash(s.id)))*angleK)):diverge(q.d,sp.angle*angleK,i*GOLDEN+rand(hash(s.id))*.8);
          const colour=KIND_COLOR[s.kind]??0,sc=cs*sp.symK*(.75+.4*rand(hash(s.id)+3));
          const c=crownOut(sp.crown,q.p,dir,planeSide(dir),sc,n.dist+n.ax.len*frac,after(n.born,n.dur,frac,sb),sr,mi,index,rand(hash(s.id)),colour,(n.r0+(n.r1-n.r0)*frac)*.6);
          glowOut(c.apex,c.apexDist,.1+.04*rand(hash(s.id)+5),name==='crystal-tree'?GLOWKIND.shard:GLOWKIND.tip,after(n.born,n.dur,frac,sb)+c.dur*.9,sr,mi,index,rand(hash(s.id)+6),colour);
        });
        // Fresh crystals: hidden points at the file's end that light (and stay) once a failing file is repaired.
        for(let k=0;k<4;k++){const a=k*GOLDEN+rand(hash(m.id)+40)*6.283,ps=planeSide(n.ax.end),o=add(mul(ps,Math.cos(a)*cs*.25),add(mul(n.ax.end,(.2+.3*Math.abs(Math.sin(a)))*cs),mul(cross(ps,n.ax.end),Math.sin(a)*cs*.25)));
          glowOut(add(end,o),endDist+cs*.3,.09+.04*rand(hash(m.id)+41+k),GLOWKIND.fresh,n.born+n.dur,modRemoved(m),mi,index,rand(hash(m.id)+44+k),5);}
        anchor(m,end,n.ax.end,endDist,n.ax.pts[0],n.ax.len);
      }
    }else if(sp.mode==='fern'||sp.mode==='kelp'){
      // A colony: one rhizome (fern) or holdfast (kelp), a stem per folder, files as fronds (fern: a crown at the top
      // of the stem) or blades along it (kelp), symbols as pinnae / extra blades.
      const fern=sp.mode==='fern';
      glowOut(add(root,[0,.08,0]),0,fern?.45:.6,GLOWKIND.bladder,born,orgRemoved,-1,index,rand(h),0);
      // Holdfast claws (kelp) / rhizome roots (fern): they spread over the ground.
      for(let c=0;c<(fern?5:7);c++){const dir=norm([Math.cos(c*GOLDEN+h),-.05,Math.sin(c*GOLDEN+h)]);const ax=axis(add(root,[0,.05,0]),dir,(fern?.7:.9)*canopy,3,sp,rr,{up:0,curl:.4,flat:true});
        emit(ax,.06*sp.thick+.03,.006,{...base,born,dur:1,dist:0,removed:orgRemoved,module:-1,tip0:0,tip1:.1,seed:rr(),fine:true});}
      const groups=[];folders.forEach(dir=>{const fl=byDir.get(dir);const per=fern?1e9:12;for(let c=0;c*per<fl.length;c++)groups.push({dir:c?`${dir}#${c}`:dir,files:fl.slice(c*per,(c+1)*per)});});
      groups.forEach(({dir,files},j)=>{
        const fh=hash(dir)^h,fr=rng(fh);
        const fb=Math.min(...files.map(m=>secsOf(m.born,epoch))),frm=files.every(m=>m.removed!==null)?Math.max(...files.map(modRemoved)):1e6;
        const ring=j===0?0:sp.ring*Math.sqrt(j)*canopy,az=j*GOLDEN+rand(h)*6.283;
        const p0=add(root,[Math.cos(az)*ring,0,Math.sin(az)*ring]);
        const lean=norm([Math.cos(az)*ring*.35+(fr()-.5)*.2,1,Math.sin(az)*ring*.35+(fr()-.5)*.2]);
        // Kelp stipes lengthen with the blades they carry (the top extends; blades keep their place).
        const L=fern?sp.stem*(.75+.5*rand(fh))*canopy*(j===0?1:.82):(sp.stem*(.8+.4*rand(fh))+sp.spacing*files.length)*canopy;
        const stem=axis(p0,lean,L,fern?3:Math.max(4,Math.min(12,Math.round(L/1.1))),sp,fr,{up:fern?.06:.1});
        const rS=(fern?.1:.06)*sp.thick*(fern?1:1+.15*Math.sqrt(files.length)),sDur=durOf(L)*(fern?1:1.4);
        emit(stem,rS,fern?rS*.8:rS*.55,{...base,born:Math.max(born,fb),dur:sDur,dist:0,removed:frm,module:-1,tip0:.05,tip1:fern?.2:.35,seed:rand(fh)});
        const top=tipOf(stem);
        if(fern)glowOut(top,L,.36,GLOWKIND.tip,Math.max(born,fb)+sDur,frm,-1,index,rand(fh),0);
        files.forEach((m,k)=>{
          const mh=hash(m.id),mr=rng(mh^0x7f),mb=secsOf(m.born,epoch),mrm=modRemoved(m),mi=modIdx(m),syms=symbolsOf(m).slice(0,lite?12:24);
          if(fern){
            // Frond k: older fronds arch outward and droop; the newest stand upright at the centre (fiddleheads).
            const elev=.45+.85*(1-Math.exp(-k*.1)),aziF=k*GOLDEN+rand(fh)*6.283;
            const d0=norm([Math.cos(aziF)*Math.cos(elev),Math.sin(elev),Math.sin(aziF)*Math.cos(elev)]);
            const FL=sp.frond*(.8+.4*rand(mh))*canopy*(k<3?1:.92);
            const fronds=axis(top,d0,FL,7,sp,mr,{up:.04,droop:sp.droop*(1.1-.5*Math.min(1,k/8))*.32,curl:.1});
            const b0=after(Math.max(born,fb),sDur,1,mb),dur=durOf(FL)*1.2;
            emit(fronds,.035*sp.thick+.014,.008,{...base,born:b0,dur,dist:L,removed:mrm,module:mi,tip0:.25,tip1:.6,seed:rand(mh)});
            // The blade plane: pinnae alternate left and right in it.
            const side=norm(cross(d0,[0,1,0]));
            const pinna=(frac,sideSign,len,born2,removed2,colour,module,seed2,fertile)=>{
              const q=at(fronds,FL*frac),u=norm(cross(side,q.d));const pd=norm(add(rot(q.d,u,sideSign*1.05),[0,-.05,0]));
              const ax=axis(q.p,pd,len,2,sp,mr,{up:-.02,curl:.05});const pDur=durOf(len)*.8,pb=after(b0,dur,frac,born2);
              emit(ax,.016,.006,{...base,born:pb,dur:pDur,dist:L+FL*frac,removed:removed2,module,tip0:.6,tip1:.75,seed:seed2,fine:true});
              // Pinnules: the frond's shape repeated at the next scale (and once more inside the leaf mask).
              const nP=lite?3:big?3:mid?5:7;
              for(let i=0;i<nP;i++){const f=(i+.7)/(nP+.4),qq=at(ax,len*f),sgn=i%2?1:-1,ld=norm(add(rot(qq.d,u,sgn*.95),mul(u,.15)));
                leafOut(qq.p,L+FL*frac+len*f,ld,len*.4*(1-.45*f)*leafK+.05,fertile?.42:.32,SHAPE.pinnule,pb+pDur*f,removed2,module,index,rand(seed2*997+i),colour);}
              leafOut(tipOf(ax),L+FL*frac+len,ax.end,len*.32*leafK+.05,.4,SHAPE.pinnule,pb+pDur,removed2,module,index,rand(seed2*991),colour);
              return ax;
            };
            // The frond's own form: pinnae all along it, shortening toward the tip (the same on every frond); the file's
            // symbols are its fertile pinnae (their own colour, wider, with a glowing sorus at their tip), by slot.
            const nForm=big?5:mid?9:14;
            for(let i=0;i<nForm;i++){const frac=.1+.86*(i+.5)/nForm;pinna(frac,i%2?1:-1,sp.pinna*canopy*(1.02-.8*frac)*(.55+.45*Math.min(1,frac/.22))*.85,b0,mrm,0,mi,rand(mh+31+i),false);}
            syms.forEach((s,i)=>{const frac=.14+.66*((i*.6180339+.21)%1),sb=symBorn(s,b0),sr=symRemoved(s,m),c=KIND_COLOR[s.kind]??0,len=sp.pinna*canopy*(1.15-.7*frac)*(.85+.3*rand(hash(s.id)));
              const ax=pinna(frac,i%2?-1:1,len,sb,sr,c||2,mi,rand(hash(s.id)),true);
              glowOut(tipOf(ax),L+FL*frac+len,.15,GLOWKIND.spore,after(b0,dur,frac,sb)+.6,sr,mi,index,rand(hash(s.id)+5),c||2);});
            // The fiddlehead: the frond tip curls inward on itself (a logarithmic spiral of shrinking steps).
            {let p=tipOf(fronds),d=fronds.end;const u=norm(cross(side,d));const pts=[p];let step=FL*.06;
              for(let i=0;i<6;i++){d=norm(rot(d,u,-.62));p=add(p,mul(d,step));pts.push(p);step*=.72;}
              emit({pts,n:6,step:FL*.03,len:FL*.18,end:d},.012,.004,{...base,born:b0+dur*.9,dur:.8,dist:L+FL,removed:mrm,module:mi,tip0:.75,tip1:1,seed:rand(mh+5),fine:true});}
            for(let c=0;c<3;c++){const a=c*2.0944+rand(mh+40)*6.283,dd=norm(add(fronds.end,[Math.cos(a)*.8,.2,Math.sin(a)*.8]));
              leafOut(tipOf(fronds),L+FL,dd,.3*canopy,.42,SHAPE.freshPinnule,b0+dur,mrm,mi,index,rand(mh+44+c),5);}
            const mid2=at(fronds,FL*.75);crown(mid2.p,L+FL*.75,FL);
            anchor(m,tipOf(fronds),fronds.end,L+FL,top,FL);
          }else{
            // Kelp: blade k at its own height on the stipe (alternating), a gas bladder at its base, the blade a long
            // ribbon; symbols add ribbons from the same bladder.
            const s=Math.min(L-.2,(.7+k*sp.spacing)*canopy),frac=s/L,q=at(stem,s),sgn=k%2?1:-1,az2=(k*2.6+rand(fh))+(sgn>0?0:Math.PI);
            const out=norm([Math.cos(az2),.0,Math.sin(az2)]),stalkD=norm(add(mul(out,.9),[0,.5,0]));
            const b0=after(Math.max(born,fb),sDur,frac,mb);
            const stalk=axis(q.p,stalkD,.22*canopy,1,sp,mr);emit(stalk,.022,.016,{...base,born:b0,dur:.5,dist:s,removed:mrm,module:mi,tip0:.4,tip1:.5,seed:rand(mh),fine:true});
            const bp=tipOf(stalk);
            const bl=axis(bp,[0,1,0],.13,1,sp,mr);emit(bl,.06*canopy,.06*canopy,{...base,born:b0+.4,dur:.5,dist:s+.22,removed:mrm,module:mi,tip0:.7,tip1:.8,seed:rand(mh+1),fine:true,profile:PROFILE.bulb});
            glowOut(add(bp,[0,.07,0]),s+.3,.14,GLOWKIND.bladder,b0+.6,mrm,mi,index,rand(mh+2),0);
            const bladeLen=sp.blade*(.75+.5*rand(mh))*canopy;
            leafOut(add(bp,[0,.12,0]),s+.3,norm(add(mul(out,.55),[0,1,0])),bladeLen,.11,SHAPE.ribbon,b0+.7,mrm,mi,index,rand(mh+3),0);
            syms.slice(0,lite||mid?1:3).forEach((x,i)=>{const a=az2+(i+1)*.55*(i%2?1:-1);const dd=norm([Math.cos(a)*.6,1,Math.sin(a)*.6]);
              leafOut(add(bp,[0,.1,0]),s+.3,dd,bladeLen*(.55+.3*rand(hash(x.id))),.13,SHAPE.ribbon,after(b0,.7,1,symBorn(x,b0)),symRemoved(x,m),mi,index,rand(hash(x.id)),KIND_COLOR[x.kind]??0);});
            for(let c=0;c<2;c++){const dd=norm(add(mul(out,.4+.3*c),[0,1,0]));leafOut(add(bp,[0,.12,0]),s+.3,dd,(.5+.25*c)*canopy,.12,SHAPE.freshRibbon,b0+.7,mrm,mi,index,rand(mh+44+c),5);}
            crown(bp,s+.3,bladeLen);
            anchor(m,add(bp,mul(norm(add(mul(out,.55),[0,1,0])),bladeLen*.6)),stalkD,s+.3,q.p,bladeLen);
          }
        });
        if(!fern){
          // The kelp's own form: a blade at every free node of the stipe (dimmer, no bladder), and a floating fan of
          // blades at its top; the files' blades sit at their own nodes with glowing bladders.
          const sb0=Math.max(born,fb);
          for(let j2=files.length;files.length<6;j2++){const s2=(.7+j2*sp.spacing)*canopy;if(s2>L-.3)break;const q=at(stem,s2),az3=j2*2.6+rand(fh)+(j2%2?0:Math.PI);
            const o2=[Math.cos(az3),0,Math.sin(az3)];leafOut(q.p,s2,norm(add(mul(o2,.5),[0,1,0])),sp.blade*canopy*(.55+.3*rand(fh+j2)),.12,SHAPE.ribbon,after(sb0,sDur,s2/L,sb0),frm,-1,index,rand(fh+j2*7),0);}
          const tp=tipOf(stem);
          for(let c=0;c<4;c++){const a=c*1.7+rand(fh+3)*6.283;leafOut(tp,L,norm([Math.cos(a)*.7,1,Math.sin(a)*.7]),sp.blade*canopy*(.75+.25*rand(fh+c+20)),.13,SHAPE.ribbon,sb0+sDur,frm,-1,index,rand(fh+c+40),0);}
          glowOut(tp,L,.18,GLOWKIND.bladder,sb0+sDur,frm,-1,index,rand(fh+8),0);crown(tp,L,sp.blade);}
      });
    }else{
      // Mycelial: cords radiate over the ground as a fork heap; files rise from them as mushrooms (stipe and a dome
      // cap whose underside glows), symbols as satellite mushrooms; hyphal crowns fan out over the ground.
      const A=sp.arity,cordNodes=[];
      const capR=(sp.cap*canopy);
      const rootNode={ax:{pts:[root,root],len:0,step:1,n:1,end:[1,0,0]},born,dur:.5,dist:0,depth:-1,r1:.07};
      folders.forEach((dir,j)=>{
        const files=byDir.get(dir),fb=Math.min(...files.map(m=>secsOf(m.born,epoch))),frm=files.every(m=>m.removed!==null)?Math.max(...files.map(modRemoved)):1e6;
        const parent=j<4?rootNode:cordNodes[Math.floor((j-4)/A)],sib=j<4?j:(j-4)%A,depth=parent.depth+1;
        const L=sp.cord*Math.pow(sp.decay,Math.max(0,depth))*(.8+.4*rand(hash(dir)^h))*canopy*(1+.1*Math.sqrt(files.length));
        const az=j<4?j*1.5708+rand(h)*6.283:Math.atan2(parent.ax.end[2],parent.ax.end[0])+(sib===0?-1:1)*sp.angle*angleK;
        const p0=j<4?root:tipOf(parent.ax);const d0=norm([Math.cos(az),0,Math.sin(az)]);
        const ax=axis(p0,d0,L,4,sp,rng(hash(dir)^h),{flat:true,curl:.5,up:0});
        const node={ax,born:after(parent.born,parent.dur,1,fb),dur:durOf(L),dist:parent.dist+parent.ax.len,depth,r1:.035,removed:frm};cordNodes.push(node);
        emit(ax,.075*sp.thick+.02,.035,{...base,born:node.born,dur:node.dur,dist:node.dist,removed:frm,module:-1,tip0:.2,tip1:.35,seed:rand(hash(dir))});
        // Hyphal crowns from the cord's end and middle: the network's fractal fringe, flat on the ground.
        for(const [frac,k] of [[1,0],[.5,1]]){const q=at(ax,L*frac);const hd=norm(rot([q.d[0],0,q.d[2]],[0,1,0],.9*(k?1:-1)));
          crownOut('hypha',add(q.p,[0,.02,0]),hd,norm(cross([0,1,0],hd)),sp.crownK*canopy*(k?.8:1),node.dist+L*frac,node.born+node.dur*frac,frm,-1,index,rand(hash(dir)+k),0,.03);}
        files.forEach((m,k)=>{
          const mh=hash(m.id),mr=rng(mh^0x3c),mb=secsOf(m.born,epoch),mrm=modRemoved(m),mi=modIdx(m),syms=symbolsOf(m);
          const frac=.22+.74*((k*.6180339+.07)%1),q=at(ax,L*frac);
          const off=norm(cross(q.d,[0,1,0])),side=(k%2?1:-1)*(.12+.25*rand(mh));
          const p0=add(q.p,mul(off,side));const bigM=1+.12*Math.sqrt(Math.min(40,syms.length));
          const H=sp.stipe*(.8+.8*rand(mh))*bigM*canopy,b0=after(node.born,node.dur,frac,mb);
          const st=axis(p0,norm([(rand(mh+1)-.5)*.3,1,(rand(mh+2)-.5)*.3]),H,3,sp,mr,{up:.05,curl:.3});
          const dur=durOf(H);
          emit(st,.03*bigM,.022*bigM,{...base,born:b0,dur,dist:node.dist+L*frac,removed:mrm,module:mi,tip0:.3,tip1:.55,seed:rand(mh)});
          const cr=capR*bigM*(.75+.5*rand(mh+3)),top=tipOf(st);
          const cap=axis(sub(top,[0,cr*.3,0]),norm(add(st.end,[0,2,0])),cr*1.05,1,sp,mr);
          emit(cap,cr,cr,{...base,born:b0+dur*.8,dur:.9,dist:node.dist+L*frac+H,removed:mrm,module:mi,tip0:.7,tip1:.85,seed:rand(mh+4),profile:PROFILE.mushroom});
          glowOut(sub(top,[0,cr*.2,0]),node.dist+L*frac+H,cr*1.6,GLOWKIND.cap,b0+dur,mrm,mi,index,rand(mh+5),0);
          syms.slice(0,lite?6:12).forEach((s,i)=>{
            const a=i*GOLDEN+rand(mh)*6.283,rad=.16+.07*Math.sqrt(i+1),sp0=add(p0,[Math.cos(a)*rad*canopy,0,Math.sin(a)*rad*canopy]);
            const hh=H*(.22+.18*rand(hash(s.id))),sb=after(b0,dur,.3,symBorn(s,b0)),sr=symRemoved(s,m),c=KIND_COLOR[s.kind]??0;
            const ss=axis(sp0,norm([Math.cos(a)*.25,1,Math.sin(a)*.25]),hh,1,sp,mr);emit(ss,.016,.012,{...base,born:sb,dur:.8,dist:node.dist+L*frac,removed:sr,module:mi,tip0:.5,tip1:.6,seed:rand(hash(s.id)),fine:true});
            const r2=cr*(.26+.12*rand(hash(s.id)+1));const cc=axis(sub(tipOf(ss),[0,r2*.3,0]),[0,1,0],r2*1.05,1,sp,mr);
            emit(cc,r2,r2,{...base,born:sb+.6,dur:.6,dist:node.dist+L*frac+hh,removed:sr,module:mi,tip0:.85,tip1:.9,seed:rand(hash(s.id)+2),fine:true,profile:PROFILE.mushroom,colour:c});
            glowOut(tipOf(ss),node.dist+L*frac+hh,r2*2,GLOWKIND.cap,sb+.8,sr,mi,index,rand(hash(s.id)+3),c);
          });
          for(let c=0;c<5;c++){const a=c*GOLDEN+rand(mh+40)*6.283;glowOut(add(top,[Math.cos(a)*cr*.7,-cr*.15,Math.sin(a)*cr*.7]),node.dist+L*frac+H,.06+.03*rand(mh+41+c),GLOWKIND.fresh,b0+dur,mrm,mi,index,rand(mh+44+c),5);}
          crown(add(top,[0,cr*.4,0]),node.dist+L*frac+H,cr*2.4);
          anchor(m,add(top,[0,cr*.3,0]),[0,1,0],node.dist+L*frac+H,p0,H);
        });
      });
    }
    orgs.push(org);
  });
  // Organism extents (height, radius, crown) from what was emitted (crowns by their reach).
  const ext=orgs.map(()=>({maxY:0,r:0}));
  const scanP=(o,x,y,z)=>{const e=ext[o.index];if(y>e.maxY)e.maxY=y;const r=Math.hypot(x-o.root[0],z-o.root[2]);if(r>e.r)e.r=r;};
  const scan=(arr,stride,org,ks)=>{for(let i=0;i<arr.length;i+=stride){const o=orgs[arr[i+org]];if(!o)continue;for(const k of ks)scanP(o,arr[i+k],arr[i+k+1],arr[i+k+2]);}};
  scan(seg,SEG,21,[0,4]);scan(fine,SEG,21,[0,4]);scan(leaf,LEAF,13,[0]);
  for(const arr of Object.values(crowns))for(let i=0;i<arr.length;i+=TPL){const o=orgs[arr[i+17]];if(!o)continue;const s=arr[i+3];scanP(o,arr[i]+arr[i+4]*s*.8,arr[i+1]+arr[i+5]*s*.8,arr[i+2]+arr[i+6]*s*.8);}
  for(const o of orgs){const e=ext[o.index];o.height=Math.max(.8,e.maxY);o.radius=Math.max(.8,e.r);o.crown.sort((a,b)=>b.p[1]-a.p[1]);o.top=o.crown[0]?.p||add(o.root,[0,o.height,0]);}
  // The light an organism casts into the water around it (a soft volume of its colour).
  for(const o of orgs)glowOut(add(o.root,[0,o.height*.55,0]),o.height*.55,Math.max(o.radius,o.height*.5)*2.4,GLOWKIND.halo,o.born+1,o.removed,-1,o.index,rand(hash(o.id)+77),0);
  return {seg,fine,leaf,glow,crowns,orgs,anchors,moduleIndex,moduleIds};
}

// ---- Lasting blooms ------------------------------------------------------------------------------------------------
// A verified milestone opens a phyllotactic flower: a domed disc of florets on Vogel's spiral (floret i at radius
// sqrt(i), turned by the golden angle: the spiral arms read at a glance), two whorls of translucent petals placed by the
// same angle, and at the tip of every outer petal the same spiral again at a tenth of the size. A validated refactor
// grows a crystalline star (shards bearing shards). Same packed layouts as the forest; the colour sits in the module slot
// (-2 - palette slot) and glows carry module -2 (always at full light). Opening takes about five seconds, from the
// centre outward. `lite` keeps the form with fewer elements (long histories, low quality).
export function growBloom(out,{center,up=[0,1,0],org,dist,size,kind,start,seed,lite=false}){
  const rr=rng(seed),sp=SPECIES['crystal-tree'];
  const emitB=(ax,r0,r1,born,dur,d0,tip,profile=0,c=4)=>{const n=ax.n,P=ax.pts;for(let i=0;i<n;i++){const a=P[i],b=P[i+1],pv=P[i-1]||sub(mul(a,2),b),nx=P[i+2]||sub(mul(b,2),a);
    const c1=add(a,mul(sub(b,pv),1/6)),c2=sub(b,mul(sub(nx,a),1/6));
    out.seg.push(a[0],a[1],a[2],r0+(r1-r0)*i/n,b[0],b[1],b[2],r0+(r1-r0)*(i+1)/n,c1[0],c1[1],c1[2],d0+ax.step*i,c2[0],c2[1],c2[2],d0+ax.step*(i+1),born+dur*i/n,1e6,dur/n,i===n-1?profile:0,-2-c,org,tip,rr());}};
  const glowB=(p,sz,k,born,c)=>out.glow.push(p[0],p[1],p[2],dist,sz,k,born,1e6,-2,org,rr(),c);
  const petal=(p,d,len,width,born,c)=>out.leaf.push(p[0],p[1],p[2],dist,d[0],d[1],d[2],len,width,SHAPE.petal,born,1e6,-1,org,rr(),c);
  const U=norm(up),E1=perp(U),E2=cross(U,E1);
  const disc=(c0,u,e1,e2,R,N,born0,span,sz,k0)=>{for(let i=0;i<N;i++){const f=Math.sqrt((i+.5)/N),a=i*GOLDEN,r=R*f;
    const p=add(add(c0,add(mul(e1,Math.cos(a)*r),mul(e2,Math.sin(a)*r))),mul(u,R*.28*(1-f*f)));glowB(p,sz*(1.15-.35*f),GLOWKIND.floret,born0+span*f,f<.55?4:k0);}};
  if(!kind){
    const R=size*.3;
    disc(center,U,E1,E2,R,lite?55:144,start+.3,2.4,size*.06,2);
    // Petals: an inner whorl rising like a cup, an outer whorl opening wide; both by the golden angle.
    const inner=lite?13:21,outer=lite?8:13;
    for(let i=0;i<inner;i++){const a=i*GOLDEN+rr()*.05,el=.95-.35*(i/inner),side=add(mul(E1,Math.cos(a)),mul(E2,Math.sin(a)));
      const d=norm(add(mul(U,Math.sin(el)),mul(side,Math.cos(el)))),base=add(center,mul(side,R*.85));
      petal(base,d,size*(.42+.14*(i/inner)),.36,start+.8+1.6*(i/inner),2);}
    for(let i=0;i<outer;i++){const a=i*GOLDEN+.4+rr()*.05,el=.32-.18*(i/outer),side=add(mul(E1,Math.cos(a)),mul(E2,Math.sin(a)));
      const d=norm(add(mul(U,Math.sin(el)),mul(side,Math.cos(el)))),base=add(center,mul(side,R)),len=size*(.75+.12*(i/outer));
      petal(base,d,len,.3,start+1.6+2*(i/outer),3);
      // The same spiral one scale down at the petal's tip.
      const tip=add(base,mul(d,len*.92)),t1=perp(d),t2=cross(d,t1);disc(tip,d,t1,t2,size*.055,lite?8:13,start+3+1.5*(i/outer),.8,size*.028,3);}
    for(let i=0;i<8;i++){const a=i*GOLDEN,d=norm(add(mul(U,1),add(mul(E1,Math.cos(a)*.3),mul(E2,Math.sin(a)*.3))));const ax=axis(center,d,size*(.22+.08*rr()),2,sp,rr,{up:.05,curl:.2,straight:false});
      emitB(ax,size*.01,size*.005,start+.6,1.4,dist,1,0,4);glowB(tipOf(ax),size*.05,GLOWKIND.floret,start+2,4);}
    return;
  }
  // A crystalline star: shards bearing shards (a validated refactor).
  const core=axis(sub(center,mul(U,size*.06)),U,size*.16,1,sp,rr);emitB(core,size*.08,size*.08,start,.8,dist,.9,PROFILE.bulb);
  glowB(add(center,mul(U,size*.05)),size*.5,GLOWKIND.floret,start+.3,4);
  const depth=lite?1:2;
  const grow=(p,d,len,rad,level,born,d0)=>{
    const ax=axis(p,d,len,1,sp,rr,{up:0,curl:0,straight:true});const dur=1.2+.3*level;
    emitB(ax,rad,0,born,dur,d0,Math.min(1,.75+.1*level));
    const end=tipOf(ax);glowB(end,size*(level>=depth?.09:.06),GLOWKIND.floret,born+dur,3);
    if(level>=depth)return;
    for(let c=0;c<3;c++){const from=at(ax,len*(.45+.2*c)).p;const nd=diverge(ax.end,.85,c*6.283/3+level*1.1+rr()*.3);grow(from,nd,len*.42,rad*.62,level+1,born+dur*.5,d0+len);}
  };
  for(let i=0;i<6;i++){const az=i*Math.PI/3+rr()*.25,el=i%2?.42:-.18;const d=i===0?U:norm(add(mul(U,Math.sin(el)),add(mul(E1,Math.cos(az)*Math.cos(el)),mul(E2,Math.sin(az)*Math.cos(el)))));
    grow(center,d,size,size*.03,0,start+.2+i*.12,dist);}
}

// Temporal Terrain's layout (preview): the land as pure functions of a model and a time (no rendering, no THREE). The
// world draws it; tests/terrain.test.js pins it. Design brief: docs/worlds/temporal-terrain.md.
//
//  - time      -> depth: the age a of a moment sits at depth L * ln(1 + a / tau) behind the front edge (the present)
//  - subsystem -> a range across the land, placed from the middle outward in order of birth (the first in the middle,
//                 then alternately right and left); it widens as its files arrive and pushes the ranges outside it out
//  - file      -> a ridge at its slot in its range (alternately right and left of the range's first file, at the
//                 identity's spacing), running back through time from its birth; its height from its live symbols
//  - symbols   -> the ridge's height and the amplitude of its fine relief
//  - state     -> the share of a row's span a file was stressed (a fault) or validated (a sheen)
// The land is sampled in rows of fixed moments: the present, then a pyramid of levels (24 rows every 0.5 s, 24 every
// 1 s, 24 every 2 s ...), each row filtered over its own span so a step in the structure never pops from row to row. A
// row's moment lies on its level's lattice of performance time, so its content depends only on that moment and the
// model: it is computed once and kept while it stays in its level (createLand). The rows are written into a texture of
// LANES lanes across (A: elevation, fine relief, fault, validated; B: the range's colour, crest).
import {createModel} from './model.js';
export const LANES=192,LEVELS=11,PER=24,ROWS=1+LEVELS*PER,BIN0=500,EASE=5200;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
export function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rand(seed){let t=(seed>>>0)+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
// The recipe's layout constants (times in ms, lengths in world units).
export function layoutConfig(recipe){
  const G=recipe?.genome||{},tm=G.time||{},rl=G.relief||{};
  return {seed:(recipe?.projectSeed>>>0)||1,tau:clamp(num(tm.scale,42),15,90)*1000,L:clamp(num(tm.depth,60),35,90),sp:clamp(num(rl.spacing,4),.3,9),
    height:clamp(num(rl.height,1),.4,1.8),massif:clamp(num(rl.massif,1),.3,1.8),detail:clamp(num(rl.detail,1),0,2)};
}
// ---- Time and depth -------------------------------------------------------------------------------------------------
export const depthOf=(age,c)=>c.L*Math.log1p(Math.max(0,age)/c.tau);
export const ageOf=(d,c)=>c.tau*Math.expm1(Math.max(0,d)/c.L);
// Level l: rows every levelBin(l) ms, covering ages [levelStart(l), levelStart(l + 1)); each row filtered over levelSpan(l)
// (six rows' time, at least EASE: about the same slope in depth at every age, so a birth is a slope, never a cliff).
export const levelBin=l=>BIN0*2**l;
export const levelStart=l=>PER*BIN0*(2**l-1);
export const levelSpan=l=>Math.max(EASE,6*levelBin(l));
export const MAX_AGE=levelStart(LEVELS);
// Each level's newest row at t: its index on the level's lattice (moment epoch + m * bin).
export function latticeAt(t,epoch){const out=new Array(LEVELS);for(let l=0;l<LEVELS;l++)out[l]=Math.floor((t-epoch-levelStart(l))/levelBin(l));return out;}
// The texture row of lattice index m of level l (a ring of PER rows per level; row 0 is the present).
export const rowSlot=(l,m)=>1+l*PER+(((m%PER)+PER)%PER);
// The rows in order, newest first: ordinal 0 the present, then each level's rows from its newest.
export function ordinalRow(o,lattice){if(o<=0)return 0;const l=Math.floor((o-1)/PER),k=(o-1)-l*PER;return rowSlot(l,lattice[l]-k);}
export function ordinalTime(o,t,epoch,lattice){if(o<=0)return t;const l=Math.floor((o-1)/PER),k=(o-1)-l*PER;return epoch+(lattice[l]-k)*levelBin(l);}
// Where a moment tp (ms) falls among the rows: a fractional ordinal (the shader's rowOf, in JS).
export function ordinalOf(tp,t,epoch,lattice){
  const g0=epoch+lattice[0]*BIN0;if(tp>=g0)return clamp((t-tp)/Math.max(t-g0,1e-3));
  for(let l=0;l<LEVELS;l++){const b=levelBin(l),gNew=epoch+lattice[l]*b,gOld=gNew-(PER-1)*b;
    if(tp>=gOld)return 1+l*PER+(gNew-tp)/b;
    if(l+1<LEVELS){const gN=epoch+lattice[l+1]*levelBin(l+1);if(tp>=gN)return 1+l*PER+(PER-1)+(gOld-tp)/Math.max(gOld-gN,1e-3);}}
  return ROWS-1;
}
// ---- The model's history, prepared for sampling -------------------------------------------------------------------------
const upper=(a,v)=>{let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m]<=v)lo=m+1;else hi=m;}return lo;};
// Sum of ramps over sorted event times: each event rises from 0 at its time to 1 a span D later (smoothstep).
function rampSum(a,g,D){if(!a.length)return 0;const full=upper(a,g-D),to=upper(a,g);let s=full;for(let k=full;k<to;k++)s+=smooth((g-a[k])/D);return s;}
const ramp=(g,e,D)=>e===-Infinity?1:e===Infinity?0:g<=e?0:g>=e+D?1:smooth((g-e)/D);
// The share of [g - D, g] that segments [from, to) cover.
function share(segs,g,D){let s=0;for(const [a,b] of segs){const x=Math.max(a,g-D),y=Math.min(b,g);if(y>x)s+=y-x;}return clamp(s/D);}
// Everything the land needs from a model, as sorted times per file, and the order of the ranges and their files.
export function prepare(model){
  const files=new Map(),subs=new Map();
  for(const m of model.modules.values()){
    const born=model.bornAt(m),removed=m.removed??Infinity,sb=[],sr=[];
    for(const id of m.symbols){const s=model.symbols.get(id);if(!s)continue;const b=model.bornAt(s);if(!(b<Infinity))continue;sb.push(b);if(s.removed!==null&&s.removed>b)sr.push(s.removed);}
    sb.sort((a,b)=>a-b);sr.sort((a,b)=>a-b);
    const segs=[];let cur=m.initial,from=-Infinity;for(const e of m.states){if(e.state===cur)continue;segs.push([from,e.at,cur]);cur=e.state;from=e.at;}segs.push([from,Infinity,cur]);
    const stress=segs.filter(x=>x[2]==='stressed').map(x=>[x[0],x[1]]),valid=segs.filter(x=>x[2]==='validated').map(x=>[x[0],x[1]]);
    const commits=m.states.filter(e=>e.state==='committed').map(e=>e.at);
    const ev=[born,removed,...sb,...sr,...segs.slice(1).map(x=>x[0])].filter(Number.isFinite).sort((a,b)=>a-b);
    const f={id:m.id,group:m.group,order:m.order,born,removed,sb,sr,stress,valid,commits,ev};files.set(m.id,f);
    let s=subs.get(m.group);if(!s)subs.set(m.group,s={id:m.group,order:model.districts.get(m.group)?.order??0,files:[]});s.files.push(f);
  }
  const byBirth=(a,b)=>a.born-b.born||a.order-b.order||(a.id<b.id?-1:a.id>b.id?1:0);
  const list=[...subs.values()];
  for(const s of list){s.files.sort(byBirth);s.born=s.files[0].born;s.births=s.files.map(f=>f.born).filter(x=>x>-Infinity).sort((a,b)=>a-b);s.ancient=s.files.filter(f=>f.born===-Infinity).length;
    s.files.forEach((f,j)=>{f.slot=j===0?0:j%2?(j+1)/2:-(j/2);f.sub=s;});}
  list.sort((a,b)=>a.born-b.born||a.order-b.order||(a.id<b.id?-1:a.id>b.id?1:0));list.forEach((s,i)=>{s.rank=i;s.side=i===0?0:i%2?1:-1;});
  const events=[];for(const f of files.values())for(const x of f.ev)events.push(x);events.sort((a,b)=>a-b);
  // Commits: the recorded commit cues (a replay's history keeps them, with their files or none); live, without them, the
  // files the model saw committed from a draft, gathered when they fall within 1.5 s of each other.
  const commits=(model.commitLog||[]).map(c=>({at:c.at,files:c.files.filter(id=>files.has(id))})),loose=[];
  if(!model.commitLog)for(const f of files.values())for(const at of f.commits)loose.push([at,f.id]);
  loose.sort((a,b)=>a[0]-b[0]||(a[1]<b[1]?-1:1));let cur=null;
  for(const [at,id] of loose){if(cur&&at-cur.last<1500){if(!cur.files.includes(id))cur.files.push(id);cur.last=at;}else{cur={at,last:at,files:[id]};commits.push(cur);}}
  commits.sort((a,b)=>a.at-b.at);
  return {files,subs:list,events,commits:commits.map(c=>({at:c.at,files:c.files}))};
}
// The earliest moment at which two preparations of a model differ (Infinity when they do not).
export function changedSince(a,b){
  if(!a||!b)return -Infinity;let e=Infinity;
  for(const [id,f] of b.files){const o=a.files.get(id);if(!o){e=Math.min(e,f.ev[0]??-Infinity);continue;}
    if(o.born!==f.born||o.group!==f.group||o.order!==f.order)e=Math.min(e,Math.min(o.born,f.born));
    const n=Math.min(o.ev.length,f.ev.length);let k=0;while(k<n&&o.ev[k]===f.ev[k])k++;
    if(k<o.ev.length||k<f.ev.length)e=Math.min(e,Math.min(o.ev[k]??Infinity,f.ev[k]??Infinity));}
  for(const [id,o] of a.files)if(!b.files.has(id))e=Math.min(e,o.ev[0]??-Infinity);
  return e;
}
// ---- The land at a moment ---------------------------------------------------------------------------------------------
// Each range and file at moment g (each event filtered over D): place across the land, width, ridge height, the fine
// relief's amplitude, fault and validated shares. Heights are world units.
export const RIDGE=5,MASSIF=4.2,MIN_RANGE=7,MIN_GAP=2.5;
export function rangesAt(P,g,D,cfg){
  const sp=cfg.sp,sizeK=clamp(sp/2.6,.45,1.6),out=[];let right=0,left=0;
  for(const s of P.subs){
    const nb=s.ancient+rampSum(s.births,g,D);if(nb<=1e-4)continue;
    const w=Math.max(sp*(nb+1.4),MIN_RANGE)*Math.min(1,nb),gap=Math.max(sp*1.6,MIN_GAP)*Math.min(1,nb);let c;
    if(s.side===0){c=0;right=left=w/2;}else if(s.side>0){c=right+gap+w/2;right+=gap+w;}else{c=-(left+gap+w/2);left+=gap+w;}
    let sumN=0,sumA=0;const files=[];
    for(const f of s.files){const alive=ramp(g,f.born,D)*(1-ramp(g,f.removed,D));if(alive<=1e-4)continue;
      const n=Math.max(0,rampSum(f.sb,g,D)-rampSum(f.sr,g,D));sumN+=n*alive;sumA+=alive;
      files.push({id:f.id,x:c+f.slot*sp,alive,n,h:RIDGE*cfg.height*(.32+.52*Math.log2(1+n))*sizeK*alive,detail:cfg.detail*.32*Math.log2(1+n)*alive,
        stress:share(f.stress,g,D)*alive,valid:share(f.valid,g,D)*alive});}
    out.push({id:s.id,rank:s.rank,c,w,nb,files,massif:MASSIF*cfg.massif*6*Math.tanh(Math.log2(1+sumN/6+sumA/2)/6)*clamp(.5+w/70,.55,1.25)});
  }
  return {ranges:out,left:-left,right};
}
// The lane grid for a land whose ranges reach from `left` to `right`: its centre Xc (in steps of an eighth of its
// half-width) and half-width Xh (in steps of a quarter), so it changes rarely (every row is laid out again when it does).
export function extentOf(left,right,cfg){
  const half=n=>40*1.25**Math.max(0,Math.ceil(Math.log(Math.max(1e-6,n)/40)/Math.log(1.25)-1e-9)),margin=cfg.sp*3+10;
  let Xh=half((right-left)/2+margin),Xc=0;
  for(let k=0;k<4;k++){const q=Xh/8;Xc=Math.round((left+right)/2/q)*q;const need=Math.max(right-Xc,Xc-left)+margin;if(need<=Xh)break;Xh=half(need);}
  return {Xc,Xh};
}
const GW=new Float32Array(257);for(let k=0;k<=256;k++)GW[k]=Math.exp(-.5*(k/32)**2);   // Gaussian to 8 sigma, 32 steps per sigma
const gauss=u=>{u=Math.abs(u)*32;return u>=256?0:GW[u|0];};
// One row of the land into `out` (LANES * 8 floats: A then B per lane, the texture's layout: A in lanes [0, LANES),
// B in [LANES, 2 LANES)). colorOf(rangeId, rank) gives a range's linear colour, plain the colour of the open land.
export function rowAt(P,g,D,cfg,X,out,colorOf,plain=[.2,.3,.4]){
  const W=LANES,{Xc,Xh}=X,x0=Xc-Xh,lw=2*Xh/W,{ranges}=rangesAt(P,g,D,cfg),wt=new Float32Array(W);
  out.fill(0);for(let j=0;j<W;j++){const o=(W+j)*4;out[o]=plain[0]*.03;out[o+1]=plain[1]*.03;out[o+2]=plain[2]*.03;wt[j]=.03;}
  const lane=x=>(x-x0)/lw-.5;
  for(const r of ranges){const col=colorOf(r.id,r.rank),hw=.5*r.w+.4*cfg.sp;
    // the range's plateau: a super-Gaussian under its files
    const a=Math.max(0,Math.floor(lane(r.c-2.1*hw))),b=Math.min(W-1,Math.ceil(lane(r.c+2.1*hw)));
    for(let j=a;j<=b;j++){const x=x0+(j+.5)*lw,u=Math.abs(x-r.c)/hw,k=Math.exp(-u*u*1.5);if(k<1e-4)continue;
      out[j*4]+=r.massif*k;const o=(W+j)*4,cw=k*1.5;out[o]+=col[0]*cw;out[o+1]+=col[1]*cw;out[o+2]+=col[2]*cw;wt[j]+=cw;}
    const sig=Math.max(.62*cfg.sp,1.3*lw);
    for(const f of r.files){const a2=Math.max(0,Math.floor(lane(f.x-3*sig))),b2=Math.min(W-1,Math.ceil(lane(f.x+3*sig)));
      for(let j=a2;j<=b2;j++){const x=x0+(j+.5)*lw,u=(x-f.x)/sig,k=gauss(u);if(k<1e-4)continue;const o=j*4,q=(W+j)*4;
        out[o]+=f.h*k;out[o+1]+=f.detail*k;out[o+2]=Math.max(out[o+2],f.stress*k);out[o+3]=Math.max(out[o+3],f.valid*k);
        out[q]+=col[0]*k*.5;out[q+1]+=col[1]*k*.5;out[q+2]+=col[2]*k*.5;wt[j]+=k*.5;out[q+3]=Math.min(1,out[q+3]+f.alive*gauss(u/.6));}}
  }
  for(let j=0;j<W;j++){const o=(W+j)*4,k=1/wt[j];out[o]*=k;out[o+1]*=k;out[o+2]*=k;}
  return out;
}
// ---- The land over time: the rows of the present pyramid, kept while their moment stays in their level --------------
export function createLand(cfg,{colorOf,plain}){
  const W=LANES,STRIDE=W*8,data=new Float32Array(STRIDE*ROWS),slotM=new Float64Array(ROWS).fill(NaN),slotKey=new Array(ROWS).fill('');
  let P=null,version=-1,model=null,X={Xc:0,Xh:0},lattice=new Array(LEVELS).fill(0),present='',computed=0;
  const shared=new Map();
  // The constant rows (no event inside their span) of one interval between events are identical: one is computed, the
  // others copy it (a slot remembers which interval it holds).
  function fill(slot,g,D){const row=data.subarray(slot*STRIDE,(slot+1)*STRIDE),E=P.events,k=upper(E,g),k0=upper(E,g-D);
    if(k!==k0){rowAt(P,g,D,cfg,X,row,colorOf,plain);computed++;slotKey[slot]='';return;}
    const key=`${k}|${X.Xc}|${X.Xh}`,src=shared.get(key);
    if(src!==undefined&&src!==slot&&slotKey[src]===key)row.set(data.subarray(src*STRIDE,(src+1)*STRIDE));
    else{rowAt(P,g,D,cfg,X,row,colorOf,plain);computed++;shared.set(key,slot);}
    slotKey[slot]=key;}
  const forget=s=>{slotM[s]=NaN;slotKey[s]='';};
  return {data,
    get prepared(){return P;},get extent(){return X;},get lattice(){return lattice;},get computed(){return computed;},
    // The land at t (ms) for `m` (its own epoch): returns whether any row changed.
    update(m,t,epoch){
      let changed=false;
      if(m!==model||m.version!==version){const next=prepare(m);const since=m===model?changedSince(P,next):-Infinity;model=m;version=m.version;P=next;
        if(since<Infinity){for(let s=1;s<ROWS;s++){const l=Math.floor((s-1)/PER);if(!(slotM[s]===slotM[s])||epoch+slotM[s]*levelBin(l)>=since-1)forget(s);}present='';shared.clear();}}
      const ext=rangesAt(P,t,EASE,cfg),next=extentOf(ext.left,ext.right,cfg);
      if(next.Xc!==X.Xc||next.Xh!==X.Xh){X=next;for(let s=0;s<ROWS;s++)forget(s);present='';shared.clear();}
      lattice=latticeAt(t,epoch);
      for(let l=0;l<LEVELS;l++){const b=levelBin(l),D=levelSpan(l);
        for(let k=0;k<PER;k++){const mm=lattice[l]-k,s=rowSlot(l,mm);if(slotM[s]===mm)continue;fill(s,epoch+mm*b,D);slotM[s]=mm;changed=true;}}
      // the present: again whenever an event lies inside its span or a new one passed
      const E=P.events,key=`${upper(E,t)}|${upper(E,t-EASE)}|${X.Xc}|${X.Xh}`;
      if(key!==present||upper(E,t)!==upper(E,t-EASE)){rowAt(P,t,EASE,cfg,X,data.subarray(0,STRIDE),colorOf,plain);computed++;present=key;changed=true;}
      return changed;
    },
    // A cubic B-spline sample of channel c (0-3 A, 4-7 B) at x and moment tp, as the shader samples it.
    sample(x,tp,t,epoch,c=0){
      const nu=ordinalOf(tp,t,epoch,lattice),i=Math.floor(nu),f=nu-i,lam=(x-X.Xc+X.Xh)/(2*X.Xh)*W-.5,j=Math.floor(lam),h=lam-j;
      const B=u=>[(1-u)**3/6,(3*u**3-6*u*u+4)/6,(-3*u**3+3*u*u+3*u+1)/6,u**3/6],wr=B(f),wl=B(h);let v=0;
      for(let a=0;a<4;a++){const row=ordinalRow(clamp(i-1+a,0,ROWS-1),lattice);for(let b=0;b<4;b++){const ln=clamp(j-1+b,0,W-1);
        v+=wr[a]*wl[b]*data[row*STRIDE+(c<4?ln*4+c:(W+ln)*4+c-4)];}}
      return v;
    },
    reset(){P=null;model=null;version=-1;for(let s=0;s<ROWS;s++)forget(s);present='';shared.clear();}};
}
// ---- The relief's own texture: the JS twin of terrain-glsl.js RELIEF (value noise hashed after wrapping to 1024 cells,
// in float32 steps like the shader), so what stands on the land stands on the drawn surface ------------------------------
const f32=Math.fround,fr=x=>f32(x-Math.floor(x));
function vh(ix,iy){ix=ix-1024*Math.floor(ix/1024);iy=iy-1024*Math.floor(iy/1024);let px=fr(f32(ix*f32(.1031))),py=fr(f32(iy*f32(.1030))),pz=fr(f32(ix*f32(.0973)));
  const d=f32(f32(px*f32(py+33.33))+f32(py*f32(pz+33.33))+f32(pz*f32(px+33.33)));px=f32(px+d);py=f32(py+d);pz=f32(pz+d);return fr(f32(f32(px+py)*pz))*2-1;}
function vnd(x,y){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy),dux=6*fx*(1-fx),duy=6*fy*(1-fy);
  const a=vh(ix,iy),b=vh(ix+1,iy),c=vh(ix,iy+1),d=vh(ix+1,iy+1),k=a-b-c+d;return [a+(b-a)*ux+(c-a)*uy+k*ux*uy,dux*(b-a+k*uy),duy*(c-a+k*ux)];}
// [height, d/dx, d/ddepth, meander] at x and depth z; rug: the files' fine-relief amplitude, fine: whether the finest
// octaves are drawn (the quality's octaves; things standing on the land use 0).
export function reliefAt(x,z,rug=0,fine=0,warp=0){
  const m=vnd(x/47+5.3,z/38+1.7),w=m[0]*warp,g=vnd(x/13,z/11),rg=1-Math.abs(g[0])*2,ra=.12+1.1*rug,sg=g[0]>0?-2:2;
  let h=g[0]*.16+rg*ra*.55,dx=(g[1]*.16+sg*g[1]*ra*.55)/13,dz=(g[2]*.16+sg*g[2]*ra*.55)/11;
  if(fine>0){const f=vnd(x/5.5+3.1,z/4.6+3.1),rf=1-Math.abs(f[0])*2,sf=f[0]>0?-2:2,af=rug*.42*fine;h+=rf*af;dx+=af*sf*f[1]/5.5;dz+=af*sf*f[2]/4.6;
    const f2=vnd(x/2.6+9.7,z/2.2+9.7),r2=1-Math.abs(f2[0])*2,s2=f2[0]>0?-2:2,a2=rug*.17*fine;h+=r2*a2;dx+=a2*s2*f2[1]/2.6;dz+=a2*s2*f2[2]/2.2;}
  return [h,dx,dz,w];
}
// ---- The recorded history -------------------------------------------------------------------------------------------
// A cue into the history model; a commit's files are also kept in its commit log (the land's survey lines and stakes:
// the model itself marks only files that were drafts).
export function recordCue(m,c,at){m.cue(c,at);if(c?.type==='repository.commit.observed'){(m.commitLog||(m.commitLog=[])).push({at,files:[...(c.detail?.fileIds||[])]});}}
// The model of a replay's whole recorded history up to t, as the player builds it when it plays from the start: the
// first window's structure as it stood before time (the player's reset), then every window from the first (its
// structure at its start, its cues at their own times, clamped into it). A fixed step grid (tempo 92, speed 1), so the
// land of a moment does not depend on the replay speed or the score's tempo. Null without recorded structure (live).
export function historyFrom(entries,t){
  const list=(entries||[]).filter(e=>e&&e.graph&&Number.isFinite(e.start));if(!list.length)return null;
  const m=createModel({speed:1,tempo:92}),d0=list[0].graph;
  m.reset(d0.keyframe?{nodes:d0.nodes||[],edges:d0.edges||[]}:{nodes:d0.add||[],edges:(d0.addEdges||[])},list[0].start);
  m.commitLog=[];
  for(const e of list){if(e.start>t)break;m.applyDelta(e.graph,e.start,e.end);
    const cues=(e.cues||[]).map((c,k)=>[clamp(c.ts,e.start,Math.max(e.start,e.end-1)),k,c]).filter(x=>x[0]<t).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    for(const [at,,c] of cues)recordCue(m,c,at);}
  return m;
}

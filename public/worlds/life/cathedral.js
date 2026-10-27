// Machine Cathedral: the digital life of the machine-city. Small luminous servitors run the cathedral's own network of
// routes, derived from its stone (cathedral-layout.js): along the lit copings of the precincts' kerbs, over the floor
// between towers and along the dependency channels, up shafts on the towers' own walls to galleries ringing them under
// their roofs, low over the mirror canals between precincts, and across the cables slung between precincts (the energy
// bridges). Never through a building: every route keeps clear of the towers' footprints and the naves, and the
// inhabitants only ever follow routes. On a tower they keep to its stone: a shaft climbs the plinth's face, then the
// wall, stepping in over each setback's ledge (towerProfile: the storeys as the world stacks them, turned with its
// prisms), WALL off the stone. Pure (no rendering), tested in Node (tests/life-cathedral*.test.js).
//
// Three kinds of inhabitant (the population is the ecosystem's; their behaviour is this grammar's, in its hooks):
//  - couriers   carry energy from hub to hub (each precinct's landmark tower is its hub): they choose a destination
//               (attractive: energetic, nourished, new, lastingly crowned; never a strained one), then choose each
//               next stretch at every junction: the remaining distance, the light earlier traffic left on it (a
//               travelled route is easier to follow), the disturbance on it (failures, congestion) and how many are
//               already on it (a crowded route sheds traffic to the alternatives); they deliver energy at the hub,
//               circle its foot and leave again, in waves on the machine's cycle when the music is organised;
//  - wardens    maintenance swarms, bound to a precinct: they inspect its towers (along the floor and the channels, up
//               the shaft, round the gallery under the roof, back down), gather where the energy is, follow each other
//               into short convoys; when the precinct fails they withdraw to its kerb and wait along the coping until
//               it recovers, then go back in; a new subsystem draws some of them away to explore it;
//  - sparks     signal carriers: fast, along the trunk (kerbs, canals, shafts, galleries, cables), released by the hubs
//               in waves that run round the city on the machine's cycle.
// Every courier, warden and spark keeps to the right of its lane (two-way traffic passes), queues behind the one ahead
// on the same stretch, and slows before a junction. Kerbs carry platoons: traffic joins a kerb only while its junction
// is open (a short window on the precinct's beat), and a wave runs round each coping each way, speeding and holding the
// traffic on it, so it moves in pulses with dark gaps between them. The shafts are gated: each tower lets climbers up (and down from its
// crown) in short convoys on its own phase of the machine's cycle, so a shaft pulses with small processions and the
// others queue at its foot (and give up after a while). Wardens leave a tower together, on their precinct's beat, so
// they travel in small groups. A failing precinct's shaft and galleries empty fast (its wardens drop to the kerb and
// wait there in a ring, couriers bound for it turn away); when it recovers the wardens go back in on its beat, briskly
// along the floor to its hub's foot, gather there, and climb its shaft together on a later beat (a procession).
//
// Feedback: every inhabitant lays trail where it goes (the sim's trail field) and pushes the flow field along its way;
// a crowd deposits disturbance (congestion); couriers leave energy at the hubs they reach. The world lights its copings,
// channels and cables from these fields (the routes brighten, flow and fade with their traffic), and the next choices
// read them back.
//
// Determinism: the network is a pure function of the shadow model and the time; habitat() returns it as the habitat's
// data, which the driver hands to the ecosystem with the sites and again after every restore (eco.siteData): the
// network is never looked up in a cache (a small one only saves rebuilding it). Each inhabitant's route state lives in
// the ecosystem's scratch arrays (ia: directed edge and job; fa: timer and the network tag it was placed on), so
// snapshots restore it; per-tick tables (traffic per edge, gates) are rebuilt by the tick hook from that state. Random
// choices come from the ecosystem's own stream (api.random) or, for a group's shared choice, from the seed and the beat.
import {CH,u01} from './sim.js';
import {layoutOptions,precincts,towerPlans,linkPlans,footprint,towerTop,naveOf,cableShape,solidsOf,solidDist,towerProfile,prismOf} from '../cathedral-layout.js';
export const GRAMMAR_ID='machine-cathedral',GRAMMAR_VERSION=3;
export const EDGE={kerb:0,spoke:1,channel:2,lane:3,dock:4,shaft:5,gallery:6,corridor:7,cable:8};
export const EDGE_NAMES=['kerb','spoke','channel','lane','dock','shaft','gallery','corridor','cable'];
const KIND_COST=[1,1.05,.85,1.1,1.1,1.25,1.1,1,.7];          // route cost per unit length (cables are fast)
const LANE=[.05,.06,.06,.06,.045,.025,.01,.12,.035];          // keep-right lane offset (shafts and galleries hug the wall)
const KIND_SPEED=[1,1,1,1,.55,.8,.7,1.1,1.45];
export const BOUND=56,YTOP=23;                                  // the routes and fields lie within x, z in ±BOUND
const PARK=BOUND+2.5;                                           // the reserve: inhabitants not yet awake wait out here
export const MARGIN=.14,WALL=.05,OWN=.035;                      // clearance kept from architecture; on a tower's own stone
                                                                // its shafts and galleries keep WALL off it (at least OWN)
const CYCLE=48;                                                 // the machine's dispatch cycle (ticks: 2.4 s)
export const SPECIES=['courier','warden','spark'];
const S_WARDEN=1,S_SPARK=2;
// Jobs (ia[2i+1] = job | aux << 4 | dest << 8).
export const JOB={travel:0,dwell:1,wait:2,go:3,up:4,circle:5,down:6,edge:7,patrol:8,migrate:9,linger:10};
const AUX_HOLD=8,AUX_WITHDRAWN=4;                                // aux flags: queued at a gate; withdrawn from a failure
const GATE=CYCLE*2,GATE_EVERY=6;                                 // a shaft's gate: its period and the headway (ticks)
const fnv=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
const r3=x=>Math.round(x*1000);
// ---- The navigable network -------------------------------------------------------------------------------------------
// Nodes and straight edges (3D). Per precinct: a ring along the kerb's coping; per tower: a dock ring around its foot
// (outside its footprint), a shaft up its flank, a gallery ring under its roof and one at each cable's anchor height;
// floor edges: spokes from docks to the kerb, lanes between neighbouring towers, the dependency channels; across the
// canals: corridors between the facing kerbs of neighbouring precincts; across precincts: the cables. Floor edges are
// checked against every tower's footprint and every nave, edges in the air against every tower's solid stone (body,
// plinth, buttresses and flying buttresses, columns; cathedral-layout.js solidsOf), all with MARGIN; a blocked edge is
// left out. A tower's outworks are passed outside (dock ring, the shaft's foot); above them the shaft and galleries
// hug the wall.
export function buildNetwork(model,t,o,opts={}){
  const pr=precincts(model,o),offsets=new Map(pr.map(p=>[p.d.id,p.off])),plans=towerPlans(model,o,offsets),S=o.S;
  const alive=m=>model.bornAt(m)<=t&&(m.removed===null||m.removed>t);const axisOf=new Map(pr.map(p=>[p.d.id,p.ang]));
  // Standing towers (with their height now) and obstacles.
  const towers=[],tIndex=new Map();
  plans.forEach((tp,k)=>{if(!alive(tp.m))return;const top=towerTop(model,tp,t,o);if(top<=0)return;
    const prof=towerProfile(model,tp,t,o),rf=footprint(tp,o),solids=solidsOf(tp,top,o,o.axisAz||0,axisOf.get(tp.m.group)||0,prof);tIndex.set(tp.m.id,towers.length);
    towers.push({id:tp.m.id,plan:k,x:tp.x,z:tp.z,rf,rd:(rf+MARGIN)/Math.cos(Math.PI/8)+.01,prof:prof.segs,R0:tp.R0,solids,top,great:tp.great,total:tp.total,group:tp.m.group,prec:-1,dock:[],crown:[],shaft:-1,galleries:[]});});
  const precs=[];
  for(const p of pr){const members=p.members.filter(m=>tIndex.has(m.id));if(!members.length)continue;
    const born=Math.min(...p.members.map(m=>model.bornAt(m)));const nave=born<=t?naveOf(p,o):null;
    const q={id:p.d.id,k:precs.length,cx:p.c.x,cz:p.c.z,rx:p.rx,rz:p.rz,ang:p.ang,ca:Math.cos(p.ang),sa:Math.sin(p.ang),members:p.d.members.length,towers:[],kerb:[],hub:-1,
      nave:nave?{hl:nave.len/2,hw:nave.wid/2,h:nave.wall+nave.roof+.3}:null};precs.push(q);
    for(const m of members){const tw=towers[tIndex.get(m.id)];tw.prec=q.k;q.towers.push(tIndex.get(m.id));}}
  towers.forEach(tw=>{if(tw.prec<0)tw.dead=true;});
  // Obstacle queries (towers by a coarse grid).
  const TG=4,tgrid=new Map(),cellKey=(i,j)=>i*100003+j;
  towers.forEach((tw,k)=>{if(tw.dead)return;const r=tw.rf+MARGIN;for(let i=Math.floor((tw.x-r)/TG);i<=Math.floor((tw.x+r)/TG);i++)for(let j=Math.floor((tw.z-r)/TG);j<=Math.floor((tw.z+r)/TG);j++){const c=cellKey(i,j);if(!tgrid.has(c))tgrid.set(c,[]);tgrid.get(c).push(k);}});
  const near=(x0,z0,x1,z1,f)=>{const seen=new Set();for(let i=Math.floor(Math.min(x0,x1)/TG);i<=Math.floor(Math.max(x0,x1)/TG);i++)for(let j=Math.floor(Math.min(z0,z1)/TG);j<=Math.floor(Math.max(z0,z1)/TG);j++){const l=tgrid.get(cellKey(i,j));if(l)for(const k of l)if(!seen.has(k)){seen.add(k);if(f(k))return true;}}return false;};
  const segDist2=(px,pz,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,L2=dx*dx+dz*dz;let u=L2>0?((px-ax)*dx+(pz-az)*dz)/L2:0;u=u<0?0:u>1?1:u;const ex=ax+dx*u-px,ez=az+dz*u-pz;return ex*ex+ez*ez;};
  // Segment vs nave rectangle (expanded by the margin), in the nave's frame: slab clipping.
  function naveHit(q,ax,az,bx,bz,y0,y1){const n=q.nave;if(!n||Math.min(y0,y1)>n.h)return false;
    const tx=(x,z)=>(x-q.cx)*q.ca+(z-q.cz)*q.sa,tz=(x,z)=>-(x-q.cx)*q.sa+(z-q.cz)*q.ca;
    const u0=tx(ax,az),v0=tz(ax,az),u1=tx(bx,bz),v1=tz(bx,bz),hl=n.hl+MARGIN,hw=n.hw+MARGIN;let lo=0,hi=1;
    for(const [p0,p1,h] of [[u0,u1,hl],[v0,v1,hw]]){const d=p1-p0;if(Math.abs(d)<1e-9){if(p0<-h||p0>h)return false;continue;}let a=(-h-p0)/d,b=(h-p0)/d;if(a>b){const s=a;a=b;b=s;}lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return false;}
    return true;}
  // A horizontal segment at floor or gallery level is clear of every footprint (except the towers named) and nave.
  function clear(ax,az,bx,bz,y0,y1,skipA=-1,skipB=-1){
    if(near(ax,az,bx,bz,k=>{if(k===skipA||k===skipB)return false;const tw=towers[k],r=tw.rf+MARGIN;return segDist2(tw.x,tw.z,ax,az,bx,bz)<r*r;}))return false;
    for(const q of precs)if(q.nave&&naveHit(q,ax,az,bx,bz,y0,y1))return false;
    return true;}
  // Own tower: the segment leaving a dock node must not cut back across its own footprint.
  const ownClear=(tw,ax,az,bx,bz)=>segDist2(tw.x,tw.z,ax,az,bx,bz)>=(tw.rf+MARGIN*.6)**2;
  const pointClear=(x,z,y,skip=-1)=>clear(x,z,x,z,y,y,skip);
  // A segment in the air (shafts, galleries, cables): clear of every solid of every tower near it (its own included,
  // with a slightly smaller margin) and of the naves, tested every few centimetres.
  function airClear(ax,ay,az,bx,by,bz,own=-1,skip2=-1){const L=Math.hypot(bx-ax,by-ay,bz-az),n=Math.max(1,Math.ceil(L/.07));
    if(near(ax,az,bx,bz,k=>{if(k===skip2)return false;const sl=towers[k].solids,m=k===own?OWN:MARGIN;for(let s=0;s<=n;s++){const u=s/n,x=ax+(bx-ax)*u,y=ay+(by-ay)*u,z=az+(bz-az)*u;for(const so of sl)if(solidDist(so,x,y,z)<m)return true;}return false;}))return false;
    for(const q of precs)if(q.nave&&naveHit(q,ax,az,bx,bz,ay,by))return false;return true;}
  // Nodes and edges.
  const NX=[],NY=[],NZ=[],NK=[],NP=[],NT=[],EA=[],EB=[],EK=[];
  const node=(x,y,z,kind,prec=-1,tower=-1)=>{NX.push(x);NY.push(y);NZ.push(z);NK.push(kind);NP.push(prec);NT.push(tower);return NX.length-1;};
  const edgeSet=new Map();
  const edge=(a,b,kind)=>{if(a<0||b<0||a===b)return -1;const key=a<b?a*1e7+b:b*1e7+a;if(edgeSet.has(key)){const e=edgeSet.get(key);if(kind===EDGE.channel)EK[e]=kind;return e;}EA.push(a);EB.push(b);EK.push(kind);edgeSet.set(key,EA.length-1);return EA.length-1;};
  const FLOOR=.12,kerbY=.055*S+.07,ANG=8;
  // The towers' rings (docks, shafts, galleries) are turned with their prisms: node j lies towards a vertex (a0 + j/8 of a
  // turn: on an octagon every node faces an edge of the stone, on a square every other one), so a ring hugging the wall
  // runs parallel to its faces, WALL off the stone.
  const PR=prismOf(o,o.axisAz||0),A0=PR.v0,PN=PR.n;
  const angOf=j=>A0+j/ANG*Math.PI*2;
  // The radius of node j of a ring WALL outside a prism of circumradius r (the prism's faces pushed out by WALL).
  const hugR=(r,j)=>{const k=2*Math.PI/PN;let a=angOf(j)-(A0+Math.PI/PN);a-=Math.round(a/k)*k;return (r*Math.cos(Math.PI/PN)+WALL)/Math.cos(a);};
  // Kerb rings.
  for(const q of precs){const perim=Math.PI*(3*(q.rx+q.rz)-Math.sqrt((3*q.rx+q.rz)*(q.rx+3*q.rz)));const n=Math.max(16,Math.min(96,Math.round(perim/.9)));q.perim=perim;q.pulses=Math.max(2,Math.round(perim/(opts.pulseL??6)));
    for(let j=0;j<n;j++){const a=j/n*Math.PI*2,lx=Math.cos(a)*q.rx,lz=Math.sin(a)*q.rz;const x=q.cx+lx*q.ca-lz*q.sa,z=q.cz+lx*q.sa+lz*q.ca;
      q.kerb.push(Math.abs(x)<BOUND-2&&Math.abs(z)<BOUND-2&&pointClear(x,z,kerbY)?node(x,kerbY,z,EDGE.kerb,q.k):-1);}
    for(let j=0;j<n;j++){const a=q.kerb[j],b=q.kerb[(j+1)%n];if(a>=0&&b>=0&&clear(NX[a],NZ[a],NX[b],NZ[b],kerbY,kerbY))edge(a,b,EDGE.kerb);}}
  // Towers: dock ring, shaft, galleries (crown and cable anchors).
  const cables=[];const {internal,bridges}=linkPlans(model,new Map(plans.map(tp=>[tp.m.id,tp.m.group])));
  for(const br of bridges){const a=tIndex.get(br.l.a),b=tIndex.get(br.l.b);if(a===undefined||b===undefined||!(model.bornAt(br.l)<=t)||br.l.removed!==null&&br.l.removed<=t)continue;
    const A=towers[a],B=towers[b];if(A.dead||B.dead)continue;const sh=cableShape(br,A.x,A.z,A.top,B.x,B.z,B.top);if(sh.d<A.rd+B.rd+.5)continue;
    const curve=u=>sh.ya+(sh.yb-sh.ya)*u-sh.sag*4*u*(1-u);const u0=A.rd/sh.d,u1=1-B.rd/sh.d;
    cables.push({a,b,sh,curve,u0,u1});A.galleries.push(curve(u0));B.galleries.push(curve(u1));}
  for(let k=0;k<towers.length;k++){const tw=towers[k];if(tw.dead)continue;const q=precs[tw.prec];
    for(let j=0;j<ANG;j++){const a=angOf(j),x=tw.x+Math.cos(a)*tw.rd,z=tw.z+Math.sin(a)*tw.rd;
      tw.dock.push(Math.abs(x)<BOUND-2&&Math.abs(z)<BOUND-2&&pointClear(x,z,FLOOR,k)?node(x,FLOOR,z,EDGE.dock,q.k,k):-1);}
    for(let j=0;j<ANG;j++){const a=tw.dock[j],b=tw.dock[(j+1)%ANG];if(a>=0&&b>=0&&clear(NX[a],NZ[a],NX[b],NZ[b],FLOOR,FLOOR,k))edge(a,b,EDGE.dock);}
    // The shaft runs on the stone: from the dock in along the floor to the plinth's foot, up its face, in over its top to
    // the wall, then up the wall to the crown under the roof, stepping in over each setback's ledge (and out under a
    // wider storey) so it keeps WALL off the stone at every height. On the flank farthest from the tower's outworks
    // (buttresses, columns) and, among those, facing out. Galleries (the crown, the cables' anchors) ring the wall at
    // their height; a node or stretch the outworks block is left out, and a shaft the stone blocks is not built.
    const crownY=Math.min(YTOP-.5,Math.max(.42,Math.min(tw.top*.92,tw.top-.22)));
    const levels=[...new Set(tw.galleries.filter(y=>y>FLOOR+.5&&y<crownY-.15).map(y=>+y.toFixed(4)))].sort((a,b)=>a-b);
    // Vertical runs of the wall above the plinth: storeys of nearly the same girth share one (the widest), a short one
    // joins its neighbour; each run [y0, y1] at girth r. The shaft steps between runs at h (on the ledge, or under the
    // overhang).
    const prof=tw.prof,yP=prof[0].y1,runs=[];
    for(const g of prof.slice(1)){const L=runs[runs.length-1];if(L&&Math.abs(g.r-L.r)<.035){L.r=Math.max(L.r,g.r);L.y1=g.y1;}else runs.push({y0:g.y0,y1:g.y1,r:g.r});}
    for(let again=true;again&&runs.length>1;){again=false;for(let r=0;r<runs.length;r++){const R=runs[r];if(R.y1-R.y0>=.34)continue;const o2=r>0?r-1:r+1,O=runs[o2];
      O.r=Math.max(O.r,R.r);O.y0=Math.min(O.y0,R.y0);O.y1=Math.max(O.y1,R.y1);runs.splice(r,1);again=true;break;}}
    if(!runs.length)runs.push({y0:yP,y1:tw.top,r:prof[0].r*.8});
    const steps=[];for(let r=0;r+1<runs.length;r++){const yb=runs[r].y1;steps.push(runs[r+1].r<runs[r].r?yb+WALL+.01:yb-WALL-.03);}
    const outAngles=tw.solids.filter(x=>x.angle!==undefined).map(x=>x.angle);
    const cands=[];for(let j=0;j<ANG;j++){if(tw.dock[j]<0)continue;const a=angOf(j);let cl=Math.PI;for(const b of outAngles){const d=Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));cl=Math.min(cl,d);}
      cands.push([j,Math.min(cl,Math.PI/2.5)*10+Math.cos(a)*(tw.x-q.cx)+Math.sin(a)*(tw.z-q.cz)]);}
    cands.sort((x,y)=>y[1]-x[1]||x[0]-y[0]);
    const at=(j,r,y)=>{const a=angOf(j);return [tw.x+Math.cos(a)*r,y,tw.z+Math.sin(a)*r];};
    const segOk=(P,Q)=>airClear(P[0],P[1],P[2],Q[0],Q[1],Q[2],k);
    // The shaft's path for node j: points [x, y, z] and, where a gallery rings the wall, [x, y, z, level, girth]. A step
    // in over a ledge the setback's pinnacles crowd climbs above them first.
    const path=j=>{const D=[NX[tw.dock[j]],NY[tw.dock[j]],NZ[tw.dock[j]]],rp=hugR(prof[0].r,j),y1=yP+WALL+.01,P=[];
      if(tw.rd-rp>.08)P.push(at(j,rp,FLOOR));
      P.push(at(j,rp,y1));
      let y=y1,r=0;const top=crownY,lv=[...levels,top];
      P.push(at(j,hugR(runs[0].r,j),y1));
      for(;;){let ys=r<steps.length?steps[r]:Infinity;
        if(ys<top&&runs[r+1].r<runs[r].r)for(const up of [0,.3,.55]){const y2=ys+up;if(y2>=top||segOk(at(j,hugR(runs[r].r,j),y2),at(j,hugR(runs[r+1].r,j),y2))){ys=y2;break;}}
        const yTo=Math.min(ys,top);
        for(const g of lv)if(g>y+.04&&g<=yTo+1e-9){const p=at(j,hugR(runs[r].r,j),g);p.push(g,runs[r].r);P.push(p);}
        if(ys>=top)break;
        y=ys;if(!(Math.abs(P[P.length-1][1]-y)<1e-9))P.push(at(j,hugR(runs[r].r,j),y));r++;P.push(at(j,hugR(runs[r].r,j),y));}
      return {D,P};};
    let best=-1,bestPath=null;
    for(const [j] of cands){const {D,P}=path(j);let ok=P.length>0;let prev=D;for(const p of P){if(!segOk(prev,p)){ok=false;break;}prev=p;}if(ok){best=j;bestPath=P;break;}}
    if(best<0)continue;tw.shaft=best;
    const ring=(y,r)=>{const ids=[];
      for(let j=0;j<ANG;j++){const P=at(j,hugR(r,j),y);ids.push(tw.dock[j]>=0&&airClear(P[0],P[1],P[2],P[0],P[1],P[2],k)?node(P[0],P[1],P[2],EDGE.gallery,q.k,k):-1);}
      for(let j=0;j<ANG;j++){const a=ids[j],b=ids[(j+1)%ANG];if(a>=0&&b>=0&&airClear(NX[a],NY[a],NZ[a],NX[b],NY[b],NZ[b],k))edge(a,b,EDGE.gallery);}return ids;};
    let prev=tw.dock[best],gi=0;tw.galleries=[];tw.crown=new Array(ANG).fill(-1);
    for(const p of bestPath){const lvl=p[3];
      if(lvl!==undefined){const ids=ring(lvl,p[4]);if(ids[best]<0)break;edge(prev,ids[best],EDGE.shaft);prev=ids[best];
        if(lvl===crownY)tw.crown=ids;else tw.galleries[gi++]={y:lvl,ids};continue;}
      const n=node(p[0],p[1],p[2],EDGE.shaft,q.k,k);edge(prev,n,EDGE.shaft);prev=n;}
    tw.crownY=crownY;
    tw.galleryAt=y=>{let g=null,d=Infinity;for(const x of tw.galleries)if(Math.abs(x.y-y)<d){d=Math.abs(x.y-y);g=x;}if(Math.abs(crownY-y)<d&&tw.crown.some(v=>v>=0)){g={y:crownY,ids:tw.crown};}return g;};}
  // Floor: spokes to the kerb, lanes between neighbouring towers, channels along dependencies.
  const facing=(tw,x,z)=>{let best=-1,bs=-Infinity;for(let j=0;j<ANG;j++){if(tw.dock[j]<0)continue;const a=j/ANG*Math.PI*2,s=Math.cos(a)*(x-tw.x)+Math.sin(a)*(z-tw.z);if(s>bs){bs=s;best=j;}}return best<0?-1:tw.dock[best];};
  const floorEdge=(A,ka,B,kb,kind)=>{const a=facing(A,B.x,B.z),b=facing(B,A.x,A.z);if(a<0||b<0)return -1;
    if(!ownClear(A,NX[a],NZ[a],NX[b],NZ[b])||!ownClear(B,NX[a],NZ[a],NX[b],NZ[b])||!clear(NX[a],NZ[a],NX[b],NZ[b],FLOOR,FLOOR,ka,kb))return -1;return edge(a,b,kind);};
  for(const q of precs){
    for(const k of q.towers){const tw=towers[k];if(tw.shaft<0)continue;
      const ks=q.kerb.filter(x=>x>=0).map(x=>[x,(NX[x]-tw.x)**2+(NZ[x]-tw.z)**2]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]).slice(0,4);let n=0;
      for(const [kn] of ks){if(n>=2)break;const d=facing(tw,NX[kn],NZ[kn]);if(d<0)continue;if(ownClear(tw,NX[d],NZ[d],NX[kn],NZ[kn])&&clear(NX[d],NZ[d],NX[kn],NZ[kn],FLOOR,kerbY,k)){edge(d,kn,EDGE.spoke);n++;}}
      const others=q.towers.filter(j=>j!==k&&towers[j].shaft>=0).map(j=>[j,(towers[j].x-tw.x)**2+(towers[j].z-tw.z)**2]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]).slice(0,3);
      for(const [j,d2] of others)if(d2<(3.4*S)**2)floorEdge(tw,k,towers[j],j,EDGE.lane);}}
  let channels=0;
  for(const l of internal){if(!(model.bornAt(l)<=t)||l.removed!==null&&l.removed<=t)continue;const a=tIndex.get(l.a),b=tIndex.get(l.b);if(a===undefined||b===undefined)continue;
    const A=towers[a],B=towers[b];if(A.dead||B.dead||A.prec!==B.prec||A.shaft<0||B.shaft<0)continue;if(floorEdge(A,a,B,b,EDGE.channel)>=0)channels++;}
  // Canals: corridors between the facing kerbs of neighbouring precincts, arching low over the water.
  const inEllipse=(q,x,z,s=1)=>{const dx=x-q.cx,dz=z-q.cz,u=(dx*q.ca+dz*q.sa)/(q.rx*s),v=(-dx*q.sa+dz*q.ca)/(q.rz*s);return u*u+v*v<1;};
  const pairs=new Set();let corridors=0;
  for(const q of precs){const nb=precs.filter(r=>r!==q).map(r=>[r,Math.hypot(r.cx-q.cx,r.cz-q.cz)-Math.max(r.rx,r.rz)-Math.max(q.rx,q.rz)]).sort((a,b)=>a[1]-b[1]||a[0].k-b[0].k).slice(0,3);
    for(const [r,gap] of nb){const key=Math.min(q.k,r.k)+'|'+Math.max(q.k,r.k);if(pairs.has(key)||gap>16)continue;pairs.add(key);
      let ba=-1,bb=-1,bd=Infinity;for(const a of q.kerb){if(a<0)continue;for(const b of r.kerb){if(b<0)continue;const d=(NX[a]-NX[b])**2+(NZ[a]-NZ[b])**2;if(d<bd){bd=d;ba=a;bb=b;}}}
      if(ba<0)continue;const ax=NX[ba],az=NZ[ba],bx=NX[bb],bz=NZ[bb];let ok=true;
      for(let s=1;s<20&&ok;s++){const u=s/20,x=ax+(bx-ax)*u,z=az+(bz-az)*u;for(const p of precs){if((p===q&&u<.06)||(p===r&&u>.94))continue;if(inEllipse(p,x,z,1.02)){ok=false;break;}}}
      if(!ok||!clear(ax,az,bx,bz,kerbY,kerbY))continue;
      const L=Math.sqrt(bd),mid=node((ax+bx)/2,kerbY+Math.min(.5,.06*L),(az+bz)/2,EDGE.corridor);edge(ba,mid,EDGE.corridor);edge(mid,bb,EDGE.corridor);corridors++;}}
  // Cables: from a gallery node of tower a along the slung cable to one of tower b (sampled every unit or so).
  let cableN=0;const cableList=[];
  for(const c of cables){const A=towers[c.a],B=towers[c.b];if(A.shaft<0||B.shaft<0)continue;const sh=c.sh;
    const n=Math.max(3,Math.ceil((c.u1-c.u0)*sh.d/1.1));const pts=[];for(let s=0;s<=n;s++){const u=c.u0+(c.u1-c.u0)*s/n;pts.push([A.x+(B.x-A.x)*u,c.curve(u),A.z+(B.z-A.z)*u]);}
    // Clear of every other tower (below its spire's reach) and nave.
    let ok=true;for(let s=0;s<pts.length-1&&ok;s++){const [x0,y0,z0]=pts[s],[x1,y1,z1]=pts[s+1];if(!airClear(x0,y0,z0,x1,y1,z1,c.a,c.b))ok=false;}
    // (a tower's roof above its foot is not modelled: a cable passing over a tower must clear a generous roof height)
    if(ok)for(const tw of towers){if(tw.dead||tw===A||tw===B)continue;const roof=tw.top+(tw.great?7:3);for(const [x,y,z] of pts)if(Math.hypot(x-tw.x,z-tw.z)<tw.rd&&y<roof){ok=false;break;}if(!ok)break;}
    if(!ok)continue;
    const ga=A.galleryAt(c.curve(c.u0)),gb=B.galleryAt(c.curve(c.u1));if(!ga||!gb)continue;
    // The gallery node facing the other tower whose step onto the cable is clear (the three most facing are tried).
    const pick=(tw,k,g,x,z,P)=>{const c=[];for(let j=0;j<ANG;j++){if(g.ids[j]<0)continue;const a=j/ANG*Math.PI*2;c.push([g.ids[j],Math.cos(a)*(x-tw.x)+Math.sin(a)*(z-tw.z)]);}
      c.sort((p,q)=>q[1]-p[1]||p[0]-q[0]);for(const [v] of c.slice(0,3))if(airClear(NX[v],NY[v],NZ[v],P[0],P[1],P[2],k))return v;return -1;};
    const na=pick(A,c.a,ga,B.x,B.z,pts[0]),nb=pick(B,c.b,gb,A.x,A.z,pts[pts.length-1]);if(na<0||nb<0)continue;
    let prev=na;const ids=[na];for(let s=0;s<pts.length;s++){const id=node(pts[s][0],pts[s][1],pts[s][2],EDGE.cable);edge(prev,id,EDGE.cable);prev=id;ids.push(id);}edge(prev,nb,EDGE.cable);ids.push(nb);
    cableN++;cableList.push({a:A.id,b:B.id,nodes:ids});}
  // Hubs: each precinct's landmark (or its tallest standing tower).
  for(const q of precs){let best=-1,bs=-Infinity;for(const k of q.towers){const tw=towers[k];if(tw.shaft<0)continue;const s=(tw.crown.some(v=>v>=0)?1e4:0)+tw.top+(tw.great?.5:0)+tw.total*1e-3;if(s>bs){bs=s;best=k;}}q.hub=best;}
  const hubs=precs.filter(q=>q.hub>=0).map(q=>({prec:q.k,id:q.id,tower:q.hub,x:towers[q.hub].x,z:towers[q.hub].z}));
  return finish({NX,NY,NZ,NK,NP,NT,EA,EB,EK},{towers,precs,hubs,cables:cableList,counts:{channels,corridors,cables:cableN}});
}
// Typed arrays, adjacency, lane frames, components and a spatial index of the edges.
function finish(L,meta){
  const n=L.NX.length,m=L.EA.length;
  const x=Float32Array.from(L.NX),y=Float32Array.from(L.NY),z=Float32Array.from(L.NZ),nk=Uint8Array.from(L.NK),np=Int16Array.from(L.NP),nt=Int32Array.from(L.NT);
  const ea=Int32Array.from(L.EA),eb=Int32Array.from(L.EB),ek=Uint8Array.from(L.EK),el=new Float32Array(m),ec=new Float32Array(m),emx=new Float32Array(m),emz=new Float32Array(m),pn=new Float32Array(m*3);
  const deg=new Int32Array(n+1);
  for(let e=0;e<m;e++){const a=ea[e],b=eb[e],dx=x[b]-x[a],dy=y[b]-y[a],dz=z[b]-z[a];el[e]=Math.sqrt(dx*dx+dy*dy+dz*dz);ec[e]=el[e]*KIND_COST[ek[e]];emx[e]=(x[a]+x[b])/2;emz[e]=(z[a]+z[b])/2;
    const h=Math.sqrt(dx*dx+dz*dz);
    if(ek[e]===EDGE.cable){pn[e*3+1]=1;}                                         // cables: above/below
    else if(h>1e-4){pn[e*3]=-dz/h;pn[e*3+2]=dx/h;}                              // floor: keep right
    else{const t=nt[a]>=0?meta.towers[nt[a]]:null;if(t){const rx=x[a]-t.x,rz=z[a]-t.z,r=Math.hypot(rx,rz)||1;pn[e*3]=-rz/r;pn[e*3+2]=rx/r;}else pn[e*3]=1;}   // shafts: side by side
    deg[a+1]++;deg[b+1]++;}
  for(let i=0;i<n;i++)deg[i+1]+=deg[i];
  const adj=new Int32Array(m*2),fill=new Int32Array(n);
  for(let e=0;e<m;e++){const a=ea[e],b=eb[e];adj[deg[a]+fill[a]++]=e*2;adj[deg[b]+fill[b]++]=e*2+1;}
  // Components (spawning prefers the largest).
  const comp=new Int32Array(n).fill(-1);let nc=0;const size=[];
  for(let s=0;s<n;s++){if(comp[s]>=0)continue;let c=0;const st=[s];comp[s]=nc;while(st.length){const u=st.pop();c++;for(let k=deg[u];k<deg[u+1];k++){const e=adj[k]>>1,v=ea[e]===u?eb[e]:ea[e];if(comp[v]<0){comp[v]=nc;st.push(v);}}}size.push(c);nc++;}
  let main=-1,ms=0;size.forEach((c,k)=>{if(c>ms){ms=c;main=k;}});
  // Edge grid (2 units) for relocating an inhabitant onto the nearest route.
  const G=2,grid=new Map(),key=(i,j)=>i*100003+j;
  for(let e=0;e<m;e++){const a=ea[e],b=eb[e];for(let i=Math.floor(Math.min(x[a],x[b])/G);i<=Math.floor(Math.max(x[a],x[b])/G);i++)for(let j=Math.floor(Math.min(z[a],z[b])/G);j<=Math.floor(Math.max(z[a],z[b])/G);j++){const k=key(i,j);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(e);}}
  const kinds=new Array(EDGE_NAMES.length).fill(0);for(let e=0;e<m;e++)kinds[ek[e]]++;
  return {n,m,x,y,z,nk,np,nt,ea,eb,ek,el,ec,emx,emz,pn,adjOff:deg,adj,comp,main,grid,G,gridKey:key,...meta,tables:new Map(),
    stats:{nodes:n,edges:m,kinds:Object.fromEntries(EDGE_NAMES.map((k,i)=>[k,kinds[i]])),towers:meta.towers.filter(t=>!t.dead).length,precincts:meta.precs.length,hubs:meta.hubs.length,...meta.counts}};
}
// The content key of the network (what the habitat would build): everything the build reads.
function networkKey(model,t,o){
  const pr=precincts(model,o),offsets=new Map(pr.map(p=>[p.d.id,p.off]));let s=`${o.archName}|${r3(o.S)}|${r3(o.streetK)}|${r3(o.buttressK)}|${r3(o.axisAz||0)}|`;
  for(const p of pr){const born=Math.min(...p.members.map(m=>model.bornAt(m)));s+=`P${p.d.id}:${r3(p.c.x)},${r3(p.c.z)},${r3(p.rx)},${r3(p.rz)},${r3(p.ang)},${r3(p.ex)},${r3(p.ez)},${p.members.length},${born<=t?1:0};`;}
  const plans=towerPlans(model,o,offsets);
  for(const tp of plans){const m=tp.m;if(!(model.bornAt(m)<=t&&(m.removed===null||m.removed>t)))continue;s+=`T${m.id}:${r3(tp.x)},${r3(tp.z)},${r3(tp.R0)},${tp.shown.length},${tp.carpet?1:0}${tp.great?1:0},${r3(towerTop(model,tp,t,o))},${r3(tp.sd)},${tp.shown.map(x=>model.bornAt(x)<=t&&!(x.removed!==null&&x.removed<=t)?1:0).join('')};`;}
  for(const l of model.links.values())if(model.bornAt(l)<=t&&(l.removed===null||l.removed>t))s+=`L${l.key}${l.cross?'x':''};`;
  return fnv(s).toString(36)+s.length.toString(36);
}
// ---- Shortest routes (lazily, per network) ------------------------------------------------------------------------------
// Distance (route cost) from every node to the nearest of `sources`, over edges whose kind is allowed (mask) and, if
// prec >= 0, only through that precinct's nodes.
function dijkstra(net,sources,mask,prec){
  const n=net.n,D=new Float64Array(n).fill(Infinity),heap=[],push=(d,v)=>{heap.push([d,v]);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}},
    pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let s=i;if(l<heap.length&&heap[l][0]<heap[s][0])s=l;if(r<heap.length&&heap[r][0]<heap[s][0])s=r;if(s===i)break;[heap[s],heap[i]]=[heap[i],heap[s]];i=s;}}return top;};
  for(const s of sources)if(s>=0){D[s]=0;push(0,s);}
  while(heap.length){const [d,u]=pop();if(d>D[u])continue;
    for(let k=net.adjOff[u];k<net.adjOff[u+1];k++){const e=net.adj[k]>>1;if(!(mask>>net.ek[e]&1))continue;const v=net.ea[e]===u?net.eb[e]:net.ea[e];if(prec>=0&&net.np[v]!==prec)continue;const nd=d+net.ec[e];if(nd<D[v]){D[v]=nd;push(nd,v);}}}
  return D;
}
const ALL=(1<<9)-1,TRUNK=ALL&~(1<<EDGE.channel|1<<EDGE.lane);
function table(net,name,f){let t=net.tables.get(name);if(!t){t=f();net.tables.set(name,t);}return t;}
// Couriers deliver to the gallery under the hub's roof (up its shaft); sparks to its foot.
export const hubTable=(net,h,spark)=>table(net,`h${h}${spark?'s':''}`,()=>{const tw=net.towers[net.hubs[h].tower];return dijkstra(net,spark?tw.dock:tw.crown,spark?TRUNK:ALL,-1);});
const dockTable=(net,k)=>table(net,`d${k}`,()=>dijkstra(net,net.towers[k].dock,ALL,net.towers[k].prec));
const crownTable=(net,k)=>table(net,`c${k}`,()=>dijkstra(net,net.towers[k].crown,ALL,net.towers[k].prec));
const kerbTable=(net,p)=>table(net,`k${p}`,()=>dijkstra(net,net.precs[p].kerb,ALL,p));
// ---- The grammar ---------------------------------------------------------------------------------------------------------
// opts: {genome} (the recipe's genome: layout parameters), {congestion, trailPull, gates, pulses, capacity, cacheMax}
// (tests and tuning).
export function createCathedralGrammar(opts={}){
  const o={...layoutOptions(opts.genome||{}),axisAz:Number.isFinite(opts.axisAz)?opts.axisAz:0};
  const gates=opts.gates??true,pulses=opts.pulses??true,PULSE_A=opts.pulseA??.42,PULSE_C=opts.pulseC??.62,congestion=opts.congestion??true,trailPull=opts.trailPull??4,CAP=opts.capacity??960;
  // Built networks by content key: a speed-up only (rebuilding is pure); the ecosystem never looks its network up here,
  // it gets it from the habitat's data (eco.siteData), which the driver supplies with the sites and after every restore.
  const cache=new Map(),CACHE_MAX=opts.cacheMax??8;
  let lastNet=null;
  function remember(key,net){cache.delete(key);cache.set(key,net);while(cache.size>CACHE_MAX)cache.delete(cache.keys().next().value);}
  // The machine's staff grows with the city: how many of each kind are awake on a network (the rest wait in reserve).
  function awake(net){const towers=net.stats.towers,want=Math.max(net.n?200:0,Math.min(CAP,110+20*towers+30*net.precs.length));return want/CAP;}
  function networkFor(model,t){const key=networkKey(model,t,o);let net=cache.get(key);if(!net){net=buildNetwork(model,t,o,{pulseL:opts.pulseL});net.key=key;net.tag=(fnv(key)&0xffffff)||1;net.awake=awake(net);}remember(key,net);lastNet=net;return net;}
  // Per ecosystem: the network it currently has (its site data) and per-tick tables (traffic per directed edge, strain
  // per precinct, gates), all rebuilt from the ecosystem's state by the tick hook: nothing here outlives a tick.
  const states=new WeakMap();
  function stateOf(api){let s=states.get(api);if(!s){const cap=api.capacity;s={ids:null,idsNet:null,net:null,occ:null,order:new Int32Array(cap),gap:new Float32Array(cap),prog:new Float32Array(cap),
      hubW:null,start:[],quota:[],strain:null,relUp:null,relDown:null,phase:null,beat:null,climb:null,window:GATE};
      // The species' slot ranges (as the ecosystem assigns them): the first `awake` share of each range is awake.
      let used=0;api.species.forEach((sp,k)=>{const q=k===api.NS-1?cap-used:Math.floor(cap*sp.share);s.start.push(used);s.quota.push(q);used+=q;});
      states.set(api,s);}
    const net=api.siteData&&api.siteData.tag?api.siteData:null;
    if(s.net!==net){s.net=net;
      s.occ=net?new Uint16Array(net.m*2):null;s.hubW=net?new Float32Array(net.hubs.length):null;s.strain=net?new Uint8Array(net.precs.length):null;s.stress=net?new Float32Array(net.precs.length):null;
      const nt=net?net.towers.length:0;s.relUp=new Int32Array(nt).fill(-1);s.relK=new Int32Array(net?net.n:0).fill(-1);s.relDown=new Int32Array(nt).fill(-1);s.phase=new Int32Array(nt);s.climb=new Uint8Array(nt);
      if(net){const nh=Math.max(1,net.hubs.length);
        // Each precinct's beat (its hub's turn in the wave that runs round the city) and each tower's gate phase on it.
        s.beat=net.precs.map(q=>{const h=net.hubs.findIndex(x=>x.prec===q.k);return Math.floor((h>=0?h:q.k)*CYCLE/nh);});
        net.towers.forEach((tw,k)=>{if(tw.dead||tw.prec<0)return;const q=net.precs[tw.prec],hub=q.hub>=0?net.towers[q.hub]:null;s.phase[k]=(s.beat[tw.prec]*2+k*11)%GATE;
          // Wardens climb the hub and the tall towers (a small chapel tower's shaft would run over its glazed face).
          s.climb[k]=tw.crown.some(v=>v>=0)&&(k===q.hub||tw.great||!hub||tw.top>=hub.top*.55)?1:0;});}}
    if(s.ids!==api.sites.ids||s.idsNet!==s.net){s.ids=api.sites.ids;s.idsNet=s.net;const n=s.net;
      s.hubSite=n?n.hubs.map(h=>api.sites.ids.indexOf(h.id)):null;s.precHub=n?n.precs.map(q=>n.hubs.findIndex(h=>h.prec===q.k)):null;s.precSite=n?n.precs.map(q=>api.sites.ids.indexOf(q.id)):null;}
    return s;}
  // ---- Per tick (the tick hook, before anything moves): traffic per directed edge (count, order along it), the strain
  // of each precinct, the attraction of each hub and the gates' state. -------------------------------------------------
  function newTick(api,s){
    s.gap.fill(Infinity);const net=s.net;if(!net)return;const cap=api.capacity,ia=api.ia,fa=api.fa,alive=api.alive,occ=s.occ;occ.fill(0);
    s.relUp.fill(-1);s.relDown.fill(-1);s.relK.fill(-1);
    const organise=Math.max(0,Math.min(1,(api.cond.cohesion-.6)/.65));s.window=13+Math.round(20*(1-organise));
    const prog=s.prog,order=s.order;let n=0;
    for(let i=0;i<cap;i++){if(!alive[i]||fa[i*2+1]!==net.tag)continue;const d=ia[i*2];if(d<0||d>=net.m*2)continue;occ[d]++;const e=d>>1,a=d&1?net.eb[e]:net.ea[e],b=d&1?net.ea[e]:net.eb[e];
      prog[i]=(api.px[i]-net.x[a])*(net.x[b]-net.x[a])+(api.py[i]-net.y[a])*(net.y[b]-net.y[a])+(api.pz[i]-net.z[a])*(net.z[b]-net.z[a]);prog[i]/=Math.max(1e-6,net.el[e]);order[n++]=i;}
    // Leader gaps: bucket by directed edge (counting sort), order each bucket by progress, look at the next one.
    const M=net.m*2;if(!s.start2||s.start2.length<M+1){s.start2=new Int32Array(M+1);s.slots=new Int32Array(cap);}
    const st2=s.start2,slots=s.slots;st2[0]=0;for(let d=0;d<M;d++)st2[d+1]=st2[d]+occ[d];
    for(let k=0;k<n;k++){const i=order[k],d=ia[i*2];slots[--st2[d+1]]=i;}   // st2[d+1]: now where bucket d begins
    for(let d=0;d<M;d++){const a=st2[d+1],b=a+occ[d];
      for(let k=a+1;k<b;k++){const i=slots[k];let j=k-1;while(j>=a&&(prog[slots[j]]>prog[i]||prog[slots[j]]===prog[i]&&slots[j]>i)){slots[j+1]=slots[j];j--;}slots[j+1]=i;}
      for(let k=a;k<b;k++)s.gap[slots[k]]=k+1<b?prog[slots[k+1]]-prog[slots[k]]:Infinity;}
    // Strain (a failing precinct) and the hubs: energetic, nourished, new, lastingly crowned; strained ones repel.
    const st=k=>k>=0?api.sites.state(k):null;
    // A failing precinct is strained as a whole: its strain covers it to the kerb (the corridors into it go dark and
    // repel route choices), as long as it lasts.
    net.precs.forEach((q,p)=>{const x=st(s.precSite[p]),k=x?x.stress:0;s.strain[p]=k>.2?1:0;s.stress[p]=k;if(k>.05)api.disc(CH.disturb,q.cx,q.cz,Math.max(q.rx,q.rz)*1.5,.03*k*api.params.environment);});
    net.hubs.forEach((h,k)=>{const t=net.towers[h.tower],x=st(s.hubSite[k]);const e=api.sample(CH.energy,t.x,t.z),d=api.sample(CH.disturb,t.x,t.z);
      let w=(.35+.5*Math.min(2,e))*(1+(x?x.nourish*.8+x.novelty*2.5+x.lasting*.9:0))*Math.sqrt(net.precs[h.prec].members)/(1+2.5*d);if(x)w*=1-.95*Math.min(1,x.stress*2.5);s.hubW[k]=Math.max(0,w);});
  }
  // A shaft's gate: entering a shaft upward from the tower's foot, or downward from its crown, is allowed only while the
  // tower's gate is open (a window of its cycle), one inhabitant per headway: climbers go up and down in short convoys.
  // Returns true when inhabitant i must wait at node v before taking directed edge nd.
  function gateClosed(api,s,i,v,nd){
    const net=s.net,e=nd>>1;if(!gates||net.ek[e]!==EDGE.shaft)return false;const t=net.nt[v];if(t<0)return false;const tw=net.towers[t];if(tw.dead||tw.prec<0||s.strain[tw.prec])return false;
    const w=toNode(net,nd),dy=net.y[w]-net.y[v];let rel=null,off=0;
    if(net.nk[v]===EDGE.dock&&dy>-.02)rel=s.relUp;else if(dy<-.02&&net.y[v]>=(tw.crownY??Infinity)-.01){rel=s.relDown;off=GATE>>1;}else return false;
    const ph=(api.tick+s.phase[t]+off)%GATE;
    // (wardens sent back in after a recovery go up as one long procession: a dispatch wave out of the hub's foot)
    if(off===0&&auxOf(api.ia[i*2+1])&AUX_WITHDRAWN){if(ph%3!==0||rel[t]===api.tick)return true;}
    else if(ph>=s.window||ph%GATE_EVERY!==0||rel[t]===api.tick)return true;
    rel[t]=api.tick;return false;}
  // A kerb's junctions: traffic joining a kerb from a spoke, a channel or a canal corridor merges only while the junction
  // is open (a short window on the precinct's beat, each junction a little later than the last round the ring: the
  // window travels with the kerb's pulses), one every other tick; the others queue at the junction. Joiners go on
  // together, so the kerb carries platoons with dark gaps between them.
  function kerbClosed(api,s,i,v,d,nd){
    const net=s.net;if(!pulses||net.ek[nd>>1]!==EDGE.kerb||d<0||net.ek[d>>1]===EDGE.kerb)return false;const p=net.np[v];if(p<0||s.strain[p])return false;
    const ph=(api.tick+s.beat[p]+(v*13)%CYCLE)%CYCLE;
    if(ph>=10+Math.round(8*organiseOf(api))||ph&1||s.relK[v]===api.tick)return true;
    s.relK[v]=api.tick;return false;}
  // ---- Steering --------------------------------------------------------------------------------------------------------
  const out={x:0,y:0,z:0};
  // A point on directed edge d at progress u (clamped), offset to the right of its lane.
  function lanePoint(net,d,u,side){const e=d>>1,a=d&1?net.eb[e]:net.ea[e],b=d&1?net.ea[e]:net.eb[e],L=net.el[e];const f=L>0?Math.max(0,Math.min(1,u/L)):0;
    const sgn=d&1?-1:1,w=LANE[net.ek[e]]*side*sgn;out.x=net.x[a]+(net.x[b]-net.x[a])*f+net.pn[e*3]*w;out.y=net.y[a]+(net.y[b]-net.y[a])*f+net.pn[e*3+1]*w;out.z=net.z[a]+(net.z[b]-net.z[a])*f+net.pn[e*3+2]*w;return out;}
  const toNode=(net,d)=>d&1?net.ea[d>>1]:net.eb[d>>1],fromNode=(net,d)=>d&1?net.eb[d>>1]:net.ea[d>>1];
  const pack=(job,aux,dest)=>job|(aux&15)<<4|dest<<8;
  const jobOf=v=>v&15,auxOf=v=>v>>4&15,destOf=v=>v>>8;
  // Choose a destination hub for a courier or spark at node v (weighted: attraction, nearness, reachable).
  function chooseHub(api,s,i,v,spark,salt){const net=s.net;let total=0;const W=chooseHub.w||(chooseHub.w=new Float64Array(64));const nh=Math.min(64,net.hubs.length);
    const here=net.np[v];
    for(let h=0;h<nh;h++){const D=hubTable(net,h,spark);const d=D[v];let w=Number.isFinite(d)&&net.hubs[h].prec!==here?s.hubW[h]/(1+d/18):0;W[h]=w;total+=w;}
    if(total<=0)return -1;let u=api.random(i,salt)*total;for(let h=0;h<nh;h++){u-=W[h];if(u<=0&&W[h]>0)return h;}for(let h=nh-1;h>=0;h--)if(W[h]>0)return h;return -1;}
  // Choose a tower to inspect in precinct p (energetic, unstrained), reachable from v.
  // rnd (optional): a random draw shared by a group (wardens leaving on the same beat choose the same tower).
  function chooseTower(api,s,i,v,p,salt,rnd=null){const net=s.net,q=net.precs[p];if(!q)return -1;let total=0;const W=chooseTower.w||(chooseTower.w=[]);W.length=0;
    for(const k of q.towers){const tw=net.towers[k];if(tw.shaft<0){W.push(0);continue;}const e=api.sample(CH.energy,tw.x,tw.z),d=api.sample(CH.disturb,tw.x,tw.z);const w=(.3+Math.min(2,e))*(k===q.hub?1.6:1)/(1+3*d)*(1+tw.top*.08);W.push(w);total+=w;}
    for(let tries=0;tries<3&&total>0;tries++){let u=(rnd?rnd(tries):api.random(i,salt+tries))*total,pick=-1;for(let j=0;j<W.length;j++){u-=W[j];if(u<=0&&W[j]>0){pick=j;break;}}if(pick<0)break;
      const k=q.towers[pick];if(Number.isFinite(dockTable(net,k)[v]))return k;total-=W[pick];W[pick]=0;}
    return -1;}
  // The next stretch from node v (arrived along directed edge d) for inhabitant i: weighted by the goal's remaining cost,
  // the trail (travelled routes are easier), disturbance (failures, congestion) and traffic already on it.
  function nextEdge(api,s,i,v,d,D,mask,opt={}){
    const net=s.net,cond=api.cond,back=d>=0?d^1:-1,tau=(opt.tau??1.6)*(.7+.3*cond.turb);let total=0,n=0;const C=nextEdge.c||(nextEdge.c=new Int32Array(64)),W=nextEdge.w||(nextEdge.w=new Float64Array(64));
    const deg=net.adjOff[v+1]-net.adjOff[v];
    for(let k=net.adjOff[v];k<net.adjOff[v+1]&&n<64;k++){const dd=net.adj[k],e=dd>>1;if(!(mask>>net.ek[e]&1))continue;if(dd===back&&deg>1)continue;
      const w2=dd&1?net.ea[e]:net.eb[e];if(opt.prec!==undefined&&net.np[w2]!==opt.prec&&net.np[w2]>=0)continue;
      let w=1;
      if(D){const dv=D[v],dw=D[w2];if(!Number.isFinite(dw))continue;const delta=net.ec[e]+dw-dv;w=Math.exp(-Math.max(0,delta)/tau);}
      if(opt.kinds){w*=opt.kinds[net.ek[e]]??1;}
      if(opt.up!==undefined){const dy=net.y[w2]-net.y[v];if(opt.up>0&&dy>.05)w*=opt.up;}
      if(opt.dir!==undefined&&net.ek[e]===EDGE.gallery){w*=(dd&1)===opt.dir?3:.3;}
      // The light and the disturbance a little way along it (a stretch's own light, not its junction's: the field is
      // coarser than a junction, so sampling near the node would give every way the same light).
      const fr=Math.min(1,1.8/Math.max(1e-6,net.el[e])),qx=net.x[v]+(net.x[w2]-net.x[v])*fr,qz=net.z[v]+(net.z[w2]-net.z[v])*fr;
      const tr=api.sample(CH.trail,qx,qz),di=api.sample(CH.disturb,qx,qz);
      // A lit way pulls by how much brighter it is than the others (a power of its light: around a busy hub every way is
      // lit, and a linear pull would hardly tell them apart); a disturbed one repels.
      w*=Math.pow(.2+Math.min(2,tr),trailPull)*Math.exp(-4*di);
      const cap=Math.max(1,net.el[e]/.9),o1=s.occ[dd];if(congestion)w*=Math.exp(-1.8*o1/cap*(opt.crowd??1));
      if(opt.convoy)w*=1+opt.convoy*Math.min(2,o1/cap);
      C[n]=dd;W[n]=w;total+=w;n++;}
    if(!n)return back>=0?back:-1;
    if(total<=0)return C[0];
    let u=api.random(i,11)*total;for(let k=0;k<n;k++){u-=W[k];if(u<=0)return C[k];}return C[n-1];
  }
  // Relocate inhabitant i onto the nearest route (a network change) or place it (spawned before any network).
  function nearestEdge(net,x,y,z){let best=-1,bd=Infinity;
    for(let ring=0;ring<4&&best<0;ring++){const ci=Math.floor(x/net.G),cj=Math.floor(z/net.G);
      for(let i=ci-ring;i<=ci+ring;i++)for(let j=cj-ring;j<=cj+ring;j++){if(Math.max(Math.abs(i-ci),Math.abs(j-cj))!==ring)continue;const l=net.grid.get(net.gridKey(i,j));if(!l)continue;
        for(const e of l){const a=net.ea[e],b=net.eb[e],dx=net.x[b]-net.x[a],dy=net.y[b]-net.y[a],dz=net.z[b]-net.z[a],L2=dx*dx+dy*dy+dz*dz;let u=L2>0?((x-net.x[a])*dx+(y-net.y[a])*dy+(z-net.z[a])*dz)/L2:0;u=u<0?0:u>1?1:u;
          const ex=net.x[a]+dx*u-x,ey=net.y[a]+dy*u-y,ez=net.z[a]+dz*u-z,d=ex*ex+ey*ey+ez*ez;if(d<bd-1e-12||d<=bd+1e-12&&e<best){bd=d;best=e;}}}}
    return {e:best,d:Math.sqrt(bd)};}
  function teleport(api,i,x,y,z){api.px[i]=api.qx[i]=x;api.py[i]=api.qy[i]=y;api.pz[i]=api.qz[i]=z;api.vx[i]=api.vy[i]=api.vz[i]=0;const K=api.K;for(let k=0;k<K;k++){api.tx[i*K+k]=x;api.ty[i*K+k]=y;api.tz[i*K+k]=z;}api.fade[i]=0;}
  // A starting place: couriers and sparks at a hub's foot, wardens at a tower of a precinct (weighted by its size).
  function startNode(api,net,i,k,r){
    if(!net||!net.n)return -1;
    const ok=v=>v>=0&&net.comp[v]===net.main&&net.adjOff[v+1]>net.adjOff[v];
    if(k!==S_WARDEN&&net.hubs.length){for(let t=0;t<4;t++){const h=net.hubs[Math.floor(r(20+t)*net.hubs.length)%net.hubs.length],tw=net.towers[h.tower];const v=tw.dock[Math.floor(r(30+t)*8)%8];if(ok(v))return v;}}
    let total=0;for(const q of net.precs)total+=Math.sqrt(q.members);
    for(let t=0;t<6;t++){let u=r(40+t)*total,q=net.precs[0];for(const p of net.precs){u-=Math.sqrt(p.members);if(u<=0){q=p;break;}}
      const k2=q.towers[Math.floor(r(50+t)*q.towers.length)%q.towers.length],tw=net.towers[k2];const v=r(60+t)<.18?q.kerb[Math.floor(r(70+t)*q.kerb.length)%q.kerb.length]:tw.dock[Math.floor(r(80+t)*8)%8];if(ok(v))return v;}
    for(let v=0;v<net.n;v++)if(ok(v))return v;return -1;}
  function place(api,s,i,v,fresh){const net=s.net;const k=net.adjOff[v],d=net.adj[k+Math.floor(api.random(i,3)*(net.adjOff[v+1]-k))%(net.adjOff[v+1]-k)];
    const dd=fromNode(net,d)===v?d:d^1;api.ia[i*2]=dd;api.fa[i*2+1]=net.tag;
    const sp=api.sp[i];api.ia[i*2+1]=sp===S_WARDEN?pack(JOB.linger,0,Math.max(0,net.nt[v])):pack(JOB.dwell,0,0);api.fa[i*2]=(sp===S_SPARK?.5:1.5)*api.random(i,4)*4;
    if(sp===S_WARDEN&&net.nt[v]<0){const p=net.np[v];const tw=p>=0?net.precs[p].hub:-1;api.ia[i*2+1]=pack(JOB.patrol,0,Math.max(0,tw));}
    if(fresh)teleport(api,i,net.x[v],net.y[v],net.z[v]);}
  function relocate(api,s,i){const net=s.net;
    if(api.fa[i*2+1]<=0||!net.m){const v=startNode(api,net,i,api.sp[i],n=>api.random(i,n));if(v<0)return false;place(api,s,i,v,true);return true;}
    const {e,d}=nearestEdge(net,api.px[i],api.py[i],api.pz[i]);
    if(e<0||d>.8||net.comp[net.ea[e]]!==net.main){const v=startNode(api,net,i,api.sp[i],n=>api.random(i,n+97));if(v<0)return false;place(api,s,i,v,true);return true;}
    // Keep heading the way it was going.
    const dx=net.x[net.eb[e]]-net.x[net.ea[e]],dy=net.y[net.eb[e]]-net.y[net.ea[e]],dz=net.z[net.eb[e]]-net.z[net.ea[e]];const dir=dx*api.vx[i]+dy*api.vy[i]+dz*api.vz[i]>=0?0:1;
    api.ia[i*2]=e*2+dir;api.fa[i*2+1]=net.tag;const sp=api.sp[i],v=toNode(net,e*2+dir);
    api.ia[i*2+1]=sp===S_WARDEN?pack(JOB.linger,0,Math.max(0,net.nt[v]>=0?net.nt[v]:net.np[v]>=0?net.precs[net.np[v]].hub:0)):pack(JOB.dwell,0,0);api.fa[i*2]=1+api.random(i,5)*2;
    return true;}
  // The home precinct of a warden: its target tower's.
  const precOfWarden=(net,v)=>{const t=destOf(v);return net.towers[t]?.prec??-1;};
  function arrive(api,s,i,v,d){
    // Called when inhabitant i reaches node v along d: decides its job and returns the next directed edge.
    const net=s.net,sp=api.sp[i],st=api.ia[i*2+1];let job=jobOf(st),aux=auxOf(st),dest=destOf(st);const cond=api.cond;
    const organise=Math.max(0,Math.min(1,(cond.cohesion-.6)/.65));
    if(sp!==S_WARDEN){const spark=sp===S_SPARK,mask=spark?TRUNK:ALL;
      if(job===JOB.travel){
        // Bound for a failing precinct: turn away to another hub (the corridors into it go dark).
        if(net.hubs[dest]&&s.strain[net.hubs[dest].prec]){const h=chooseHub(api,s,i,v,spark,22);if(h>=0&&h!==dest)dest=h;else{job=JOB.dwell;api.fa[i*2]=1;}}}
      if(job===JOB.travel){const D=net.hubs[dest]?hubTable(net,dest,spark):null;
        if(!D||!Number.isFinite(D[v])){job=JOB.dwell;api.fa[i*2]=.5;}
        else if(D[v]<1e-6){// Delivered: energy into the hub, then circle its foot for a while.
          const tw=net.towers[net.hubs[dest].tower];if(!spark)api.splat(CH.energy,tw.x,tw.z,.18);job=JOB.dwell;api.fa[i*2]=(spark?.6:3)+api.random(i,6)*(spark?1.2:5);}
        else{api.ia[i*2+1]=pack(job,aux,dest);return nextEdge(api,s,i,v,d,D,mask,{tau:spark?1.4:2.4,crowd:spark?.4:1});}}
      if(job===JOB.dwell||job===JOB.wait){
        if(job===JOB.dwell&&api.fa[i*2]<=0){job=api.random(i,7)<organise*.85+(spark?.35:0)?JOB.wait:-1;}
        if(job===-1){const h=chooseHub(api,s,i,v,spark,8);if(h>=0){api.ia[i*2+1]=pack(JOB.travel,0,h);return nextEdge(api,s,i,v,d,hubTable(net,h,spark),mask,{tau:spark?1.4:2.4});}job=JOB.dwell;api.fa[i*2]=1;}
        api.ia[i*2+1]=pack(job,aux,dest);
        // Circle the foot (dock ring) or wait along the kerb; never wander off.
        return nextEdge(api,s,i,v,d,null,1<<EDGE.dock|1<<EDGE.kerb|1<<EDGE.gallery,{kinds:[1,0,0,0,1,0,1,0,0],crowd:.5});}
      return nextEdge(api,s,i,v,d,null,mask);}
    // Wardens.
    const p=net.np[v]>=0?net.np[v]:precOfWarden(net,st);const q=net.precs[p];
    const strained=q&&s.precSite[p]>=0?api.sites.state(s.precSite[p]).stress>.2:false;
    if(strained&&job!==JOB.edge&&job!==JOB.patrol&&job!==JOB.migrate&&q){job=JOB.edge;aux=(aux|AUX_WITHDRAWN)&~AUX_HOLD;}
    const convoy=.6*organise+.2;
    for(let guard=0;guard<3;guard++){
      switch(job){
        case JOB.edge:{const D=kerbTable(net,p);if(!Number.isFinite(D[v])){job=JOB.go;dest=q?.hub??0;continue;}if(D[v]<1e-6){job=JOB.patrol;api.fa[i*2]=4+api.random(i,9)*6;continue;}
          api.ia[i*2+1]=pack(job,aux,dest);return nextEdge(api,s,i,v,d,D,ALL,{prec:p,tau:1.2,crowd:.3});}
        // (withdrawn wardens wait for the precinct's beat after a recovery: steer sends them back in together)
        case JOB.patrol:{if(!strained&&!(aux&AUX_WITHDRAWN)&&api.fa[i*2]<=0){const k=chooseTower(api,s,i,v,p,12);if(k>=0){job=JOB.go;dest=k;continue;}}
          api.ia[i*2+1]=pack(JOB.patrol,aux,dest);return nextEdge(api,s,i,v,d,null,1<<EDGE.kerb,{crowd:.15,convoy:.2});}
        case JOB.migrate:{const D=net.hubs[dest]?hubTable(net,dest,false):null;if(!D||!Number.isFinite(D[v])){job=JOB.linger;api.fa[i*2]=1;dest=Math.max(0,net.nt[v]);continue;}
          if(D[v]<1e-6){job=JOB.go;const k=chooseTower(api,s,i,v,net.hubs[dest].prec,13);dest=k>=0?k:net.hubs[dest].tower;continue;}
          api.ia[i*2+1]=pack(job,aux,dest);return nextEdge(api,s,i,v,d,D,ALL,{tau:1.6});}
        case JOB.go:{const tw=net.towers[dest];if(!tw||tw.prec<0){job=JOB.linger;api.fa[i*2]=0;continue;}const D=dockTable(net,dest);if(!Number.isFinite(D[v])){job=JOB.linger;api.fa[i*2]=0;continue;}
          if(D[v]<1e-6){
            // (back from a failure: they gather at the hub's foot and wait for the beat that sends them up together)
            if(aux&AUX_WITHDRAWN&&s.climb[dest]){job=JOB.linger;api.fa[i*2]=3.6+api.random(i,15);continue;}
            job=s.climb[dest]&&api.random(i,14)<.85?JOB.up:JOB.linger;aux&=~AUX_WITHDRAWN;api.fa[i*2]=2+api.random(i,15)*3;continue;}
          api.ia[i*2+1]=pack(job,aux,dest);return nextEdge(api,s,i,v,d,D,ALL,{prec:tw.prec,tau:1.4,convoy});}
        case JOB.up:{const D=crownTable(net,dest);if(!Number.isFinite(D[v])){job=JOB.linger;continue;}
          if(D[v]<1e-6){job=JOB.circle;aux=(aux&~(1|AUX_WITHDRAWN))|(api.random(i,16)<.5?0:1);api.fa[i*2]=6+api.random(i,17)*10;continue;}
          api.ia[i*2+1]=pack(job,aux,dest);return nextEdge(api,s,i,v,d,D,ALL,{prec:net.towers[dest].prec,tau:.8,crowd:.3});}
        case JOB.circle:{if(api.fa[i*2]<=0){job=JOB.down;continue;}api.splat(CH.energy,net.x[v],net.z[v],.004);
          api.ia[i*2+1]=pack(job,aux,dest);return nextEdge(api,s,i,v,d,null,1<<EDGE.gallery,{dir:aux&1,crowd:.3});}
        case JOB.down:{const D=dockTable(net,dest);if(!Number.isFinite(D[v])||D[v]<1e-6){job=JOB.linger;api.fa[i*2]=1+api.random(i,18)*2;continue;}
          api.ia[i*2+1]=pack(job,aux,dest);return nextEdge(api,s,i,v,d,D,ALL,{prec:net.towers[dest].prec,tau:.8,crowd:.3});}
        default:{// linger at a tower's foot, then choose the next tower (or go and explore a new precinct).
          if(aux&AUX_WITHDRAWN){api.ia[i*2+1]=pack(JOB.linger,aux,dest);return nextEdge(api,s,i,v,d,null,1<<EDGE.dock,{crowd:.2});}
          if(api.fa[i*2]<=0){
            let nov=-1,nv=.25;net.hubs.forEach((h,k)=>{const x=s.hubSite[k]>=0?api.sites.state(s.hubSite[k]):null;if(x&&x.novelty>nv&&h.prec!==p){nv=x.novelty;nov=k;}});
            if(nov>=0&&api.random(i,19)<.45){job=JOB.migrate;dest=nov;continue;}
            // The precinct's wardens leaving in the same beat choose the same tower: they travel as a small group.
            const wave=p>=0?Math.floor((api.tick+s.beat[p])/GATE):0;
            const k=chooseTower(api,s,i,v,p,20,p>=0?n=>u01(api.seed^0x5bd1,p,wave,n+1):null);if(k>=0&&k!==dest){job=JOB.go;dest=k;continue;}api.fa[i*2]=1;}
          api.ia[i*2+1]=pack(JOB.linger,aux,dest);return nextEdge(api,s,i,v,d,null,1<<EDGE.dock|1<<EDGE.lane|1<<EDGE.channel,{prec:p>=0?p:undefined,kinds:[1,1,1.5,1,1,0,0,0,0],crowd:.5,convoy});}
      }
    }
    api.ia[i*2+1]=pack(JOB.linger,aux,dest);return nextEdge(api,s,i,v,d,null,1<<EDGE.dock);
  }
  const SPEED=[1.05,.62,2.1];
  const organiseOf=api=>Math.max(0,Math.min(1,(api.cond.cohesion-.6)/.65));
  const isAwake=(api,s,i)=>{const k=api.sp[i];return i-s.start[k]<Math.round(s.quota[k]*s.net.awake);};
  function park(api,i){const k=i%((2*BOUND)|0),row=Math.floor(i/((2*BOUND)|0));teleport(api,i,-PARK,.4+row*1.7,-BOUND+.5+k);api.fa[i*2+1]=-1;api.ia[i*2]=-1;}
  const slowJob=j=>j===JOB.dwell||j===JOB.wait||j===JOB.linger||j===JOB.patrol;
  function speedOf(api,s,i,sp,e,job,pers,pE,aux=0){
    let v=SPEED[sp]*pers*(.75+.25*api.cond.activity)*KIND_SPEED[s.net.ek[e]];
    if(slowJob(job))v*=job===JOB.patrol?(pE>=0&&s.strain[pE]?.15:.45):.35;
    else if(job===JOB.edge)v*=1.9;   // leaving a failing tower: quickly
    else if(aux&AUX_WITHDRAWN&&(job===JOB.go||job===JOB.up))v*=1.6;   // going back in after a recovery: briskly, together
    return v;}
  function steer(api,i,f){
    const s=stateOf(api);
    const net=s.net;
    if(!net||!net.m||!isAwake(api,s,i)){if(api.fa[i*2+1]!==-1)park(api,i);f[0]=-api.vx[i]*4;f[1]=-api.vy[i]*4;f[2]=-api.vz[i]*4;return;}
    if(api.fa[i*2+1]!==net.tag&&!relocate(api,s,i)){f[0]=f[1]=f[2]=0;return;}
    const sp=api.sp[i];let d=api.ia[i*2];
    // Waiting at a hub's foot for the machine's cycle: the hubs release in turn, a wave running round the city.
    if(jobOf(api.ia[i*2+1])===JOB.wait&&d>=0){const v=toNode(net,d),h=s.precHub[net.np[v]]??0;if((api.tick+Math.floor(h*CYCLE/Math.max(1,net.hubs.length)))%CYCLE===0){
      const hd=chooseHub(api,s,i,v,sp===S_SPARK,21);if(hd>=0)api.ia[i*2+1]=pack(JOB.travel,0,hd);}}if(d<0||d>=net.m*2){relocate(api,s,i);d=api.ia[i*2];}
    if(api.fa[i*2]>0)api.fa[i*2]-=1/20;
    const x=api.px[i],y=api.py[i],z=api.pz[i];
    let e=d>>1,L=net.el[e],a=fromNode(net,d),b=toNode(net,d);
    let u=((x-net.x[a])*(net.x[b]-net.x[a])+(y-net.y[a])*(net.y[b]-net.y[a])+(z-net.z[a])*(net.z[b]-net.z[a]))/Math.max(1e-6,L);
    let st=api.ia[i*2+1],job=jobOf(st);const pE=net.np[a]>=0?net.np[a]:net.np[b];
    if(sp===S_WARDEN&&pE>=0){
      // A failing precinct: its wardens leave the towers at once (a climber turns round) and make for the kerb.
      if(s.strain[pE]&&(job===JOB.up||job===JOB.circle||job===JOB.go||job===JOB.linger||job===JOB.down)){
        api.ia[i*2+1]=st=pack(JOB.edge,(auxOf(st)|AUX_WITHDRAWN)&~AUX_HOLD,destOf(st));job=JOB.edge;
        if(net.y[b]>net.y[a]+.05){d^=1;api.ia[i*2]=d;const t=a;a=b;b=t;u=L-u;}}
      // Recovered: the withdrawn wardens go back in together, on the precinct's beat (to its hub, up its shaft).
      else if(!s.strain[pE]&&job===JOB.patrol&&(auxOf(st)&AUX_WITHDRAWN)&&(api.tick+s.beat[pE])%CYCLE===0){
        const hub=net.precs[pE].hub;api.ia[i*2+1]=st=pack(hub>=0?JOB.go:JOB.linger,hub>=0?AUX_WITHDRAWN:0,Math.max(0,hub));job=jobOf(st);}
      // Gathered at the hub's foot: up the shaft together, on a later beat (a procession once the recovery's light fades).
      else if(!s.strain[pE]&&job===JOB.linger&&(auxOf(st)&AUX_WITHDRAWN)&&api.fa[i*2]<=0&&(api.tick+s.beat[pE])%CYCLE===0){
        api.ia[i*2+1]=st=pack(JOB.up,auxOf(st),destOf(st));job=JOB.up;}}
    const pers=.85+.3*u01(api.seed,i,api.gen[i],77);
    let speed=speedOf(api,s,i,sp,e,job,pers,pE,auxOf(st));
    // (on the stone, shafts and galleries, the look-ahead is short: a turn there never cuts across a corner of the wall)
    const ek0=net.ek[e],look=ek0===EDGE.shaft||ek0===EDGE.gallery?.06+.02*Math.min(2,speed):.16+.06*Math.min(2,speed);
    // Reaching the end of the stretch: choose the next one (or wait at a closed gate).
    if(u>L-look*.9){const nd=arrive(api,s,i,b,d);
      if(nd>=0&&nd!==d){
        if(kerbClosed(api,s,i,b,d,nd)){}   // (queued at the junction: stays at the end of its stretch)
        else if(gateClosed(api,s,i,b,nd)){
          // Queued at the gate: wait (a while), then give up: a courier delivers at the foot, a warden lingers there.
          const v2=api.ia[i*2+1],aux=auxOf(v2);
          if(!(aux&AUX_HOLD)){api.ia[i*2+1]=pack(jobOf(v2),aux|AUX_HOLD,destOf(v2));api.fa[i*2]=3.5+api.random(i,23)*3;}
          else if(api.fa[i*2]<=0){const j=jobOf(v2),down=net.y[toNode(net,nd)]<net.y[b];
            if(down){api.ia[i*2+1]=pack(j,aux&~AUX_HOLD,destOf(v2));d=nd;}
            else if(sp===S_WARDEN){api.ia[i*2+1]=pack(JOB.linger,aux&~AUX_HOLD,destOf(v2));api.fa[i*2]=1+api.random(i,24)*2;}
            else{const t=net.nt[b];if(t>=0&&sp!==S_SPARK)api.splat(CH.energy,net.towers[t].x,net.towers[t].z,.12);api.ia[i*2+1]=pack(JOB.dwell,0,0);api.fa[i*2]=2+api.random(i,24)*4;}}}
        else{const v2=api.ia[i*2+1];if(auxOf(v2)&AUX_HOLD)api.ia[i*2+1]=pack(jobOf(v2),auxOf(v2)&~AUX_HOLD,destOf(v2));d=nd;}
        if(d!==api.ia[i*2]){api.ia[i*2]=d;e=d>>1;L=net.el[e];a=fromNode(net,d);b=toNode(net,d);
          u=((x-net.x[a])*(net.x[b]-net.x[a])+(y-net.y[a])*(net.y[b]-net.y[a])+(z-net.z[a])*(net.z[b]-net.z[a]))/Math.max(1e-6,L);}
        speed=speedOf(api,s,i,sp,e,jobOf(api.ia[i*2+1]),pers,pE,auxOf(api.ia[i*2+1]));}}
    // Queue behind the one ahead (closer on a shaft: climbers go in convoys); slow before a junction.
    const gap=s.gap[i],hw=net.ek[e]===EDGE.shaft?.24:.5;if(gap<hw)speed*=Math.max(.12,Math.min(1,(gap-.08)/(hw-.08)));
    const degB=net.adjOff[b+1]-net.adjOff[b];if(degB>2){const left=L-u;if(left<.6)speed*=.55+.45*Math.max(0,left)/.6;}
    // Along a kerb the traffic moves in pulses: a wave of the machine's cycle runs round the coping each way (a few per
    // ring, at about the pace of each kind of traffic) and speeds or holds whoever is on it, so the traffic bunches into
    // platoons with dark gaps between them; organised (sustained) music strengthens it, and a failing precinct has none.
    if(pulses&&net.ek[e]===EDGE.kerb&&pE>=0&&!s.strain[pE]&&!slowJob(jobOf(api.ia[i*2+1]))){const q=net.precs[pE],dx=x-q.cx,dz=z-q.cz;
      const th=Math.atan2((-dx*q.sa+dz*q.ca)/q.rz,(dx*q.ca+dz*q.sa)/q.rx);
      const c=PULSE_C,lam=q.perim/q.pulses;
      const ph=q.pulses*(d&1?-th:th)-2*Math.PI*c*api.tick/20/lam+s.beat[pE]*.37+(d&1)*1.9;
      speed*=1+(PULSE_A+.15*organiseOf(api))*Math.cos(ph);}
    const p=lanePoint(net,d,Math.max(0,u)+look,1);
    let dx=p.x-x,dy=p.y-y,dz=p.z-z;const dist=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-6;const want=Math.min(speed,dist*6);dx=dx/dist*want;dy=dy/dist*want;dz=dz/dist*want;
    const KG=10;f[0]=(dx-api.vx[i])*KG;f[1]=(dy-api.vy[i])*KG;f[2]=(dz-api.vz[i])*KG;
    // Never below the floor: a descent brakes before it.
    if(y<.1&&api.vy[i]<0)f[1]+=(.1-y)*80-api.vy[i]*12;
  }
  // ---- The grammar contract ----------------------------------------------------------------------------------------------
  return {
    id:GRAMMAR_ID,version:GRAMMAR_VERSION,
    ecosystem(params,seed){void params;void seed;
      const base={routes:1,radius:1.6,sepRadius:.08,sep:0,ali:0,coh:0,seek:0,orbit:0,curiosity:0,trail:0,avoid:0,flow:0,wander:0,wanderJitter:0,
        minSpeed:0,maxForce:34,mass:1,drag:.08,carryDeposit:0,energyDeposit:0,yMin:.04,yMax:YTOP+1,congestion:congestion?.003:0,congestionAbove:7,fade:2,respawn:[1,5],
        perceive:false};   // steered by the routes alone: no neighbour scan (queues come from the per-edge traffic table)
      return {capacity:CAP,trail:10,bounds:{min:[-BOUND-4,-.5,-BOUND-4],max:[BOUND+4,YTOP+1,BOUND+4]},
        field:{nx:96,nz:96,min:[-BOUND,-BOUND],max:[BOUND,BOUND],decay:{trail:.993,energy:.996,disturb:.99,flow:.96},diffuse:{trail:.012,energy:.06,disturb:.08,flow:.1},saturate:{trail:4,energy:3,disturb:4,flow:2},advect:.15},
        species:[{...base,name:'courier',share:.44,maxSpeed:1.6,deposit:.005,push:.05,life:[150,420]},
                 {...base,name:'warden',share:.38,maxSpeed:1.1,deposit:.0035,push:.03,life:[200,600]},
                 {...base,name:'spark',share:.18,maxSpeed:3.2,deposit:.003,push:.04,life:[60,200],respawn:[.5,3]}],
        hooks:{tick(api){newTick(api,stateOf(api));},steer,spawn(api,i,k,r,o2){const s=stateOf(api),net=s.net;const v=net&&isAwake(api,s,i)?startNode(api,net,i,k,r):-1;
          if(v<0){const kk=i%((2*BOUND)|0),row=Math.floor(i/((2*BOUND)|0));o2[0]=-PARK;o2[1]=.4+row*1.7;o2[2]=-BOUND+.5+kk;api.fa[i*2+1]=-1;api.ia[i*2]=-1;return;}
          o2[0]=net.x[v];o2[1]=net.y[v];o2[2]=net.z[v];place(api,s,i,v,false);}}};
    },
    // Sites: one per standing precinct (influences land on them: the default siteOf maps a file to its precinct); data:
    // the network the inhabitants navigate (null before the city stands), handed to the ecosystem by the driver.
    habitat(model,t){
      const net=networkFor(model,t);
      const sites=net.precs.map(q=>({id:q.id,x:q.cx,y:1,z:q.cz,r:Math.max(q.rx,q.rz)*.45,w:Math.sqrt(q.members),kind:1}));
      return {sites,data:net.n?net:null};
    },
    // The network an ecosystem's inhabitants are on (presentation and tests), or null.
    networkOf(api){return api?stateOf(api).net:lastNet;},
    // How strained the precinct of inhabitant i's stretch is (0..1; presentation: a failure's cold on its lanterns).
    strainOf(api,i){const s=stateOf(api),n=s.net,d=api.ia[i*2];if(!n||!s.stress||d<0||d>=n.m*2)return 0;const e=d>>1,p=n.np[n.ea[e]]>=0?n.np[n.ea[e]]:n.np[n.eb[e]];return p>=0?Math.min(1,s.stress[p]):0;},
    networkAt:networkFor,
    jobOf:v=>jobOf(v),destOf:v=>destOf(v),
    get cacheSize(){return cache.size;}
  };
}

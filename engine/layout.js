'use strict';
// Stable architectural site plan for the Construct, computed with the interpretation and persisted with it.
//
// The world is a hexagonal ground plan. Each architectural group (a top-level folder such as src/ui or app/api)
// is a district; files are buildings on hex cells. Rules:
//  - nothing that has been placed ever moves, so the same recorded timeline always yields the same plan;
//  - districts are separated by at least one empty cell ("streets"), so subsystems read as distinct places;
//  - files from the same folder are placed next to each other; districts grow outward from their anchor;
//  - root-level files form the core district at the centre.
const SQRT3=Math.sqrt(3);
const DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const ROOTS=new Set(['src','app','apps','lib','libs','packages','server','client','source','pages','components','web']);
const DISTRICT_RADIUS=5;
// Groups: the first two folders under a conventional root (src/ui), otherwise the top folder (test, scripts).
function groupOf(file){
  const parts=String(file).split('/');parts.pop();
  if(!parts.length)return '.';
  if(ROOTS.has(parts[0])&&parts.length>1)return parts.slice(0,2).join('/');
  return parts[0];
}
function dirOf(file){const i=String(file).lastIndexOf('/');return i<0?'.':file.slice(0,i);}
const key=(q,r)=>`${q},${r}`;
function world(q,r){return {x:SQRT3*q+SQRT3/2*r,z:1.5*r};}
function hexDistance(aq,ar,bq,br){return (Math.abs(aq-bq)+Math.abs(aq+ar-bq-br)+Math.abs(ar-br))/2;}
function ring(q,r,radius){
  if(radius===0)return [[q,r]];
  const out=[];let cq=q+DIRS[4][0]*radius,cr=r+DIRS[4][1]*radius;
  for(let side=0;side<6;side++)for(let step=0;step<radius;step++){out.push([cq,cr]);cq+=DIRS[side][0];cr+=DIRS[side][1];}
  return out;
}
function newLayout(){return {districts:{},cells:{},modules:{},order:0};}
// Hex cell nearest to a world point.
function cellAt(x,z){
  const qf=(SQRT3/3*x-z/3),rf=2/3*z;let q=Math.round(qf),r=Math.round(rf);const s=Math.round(-qf-rf);
  const dq=Math.abs(q-qf),dr=Math.abs(r-rf),ds=Math.abs(s-(-qf-rf));
  if(dq>dr&&dq>ds)q=-r-s;else if(dr>ds)r=-q-s;
  return [q,r];
}
function admissible(layout,gid,q,r,core){
  if(layout.cells[key(q,r)])return false;
  // Keep the centre for the core district.
  if(!core&&hexDistance(q,r,0,0)<3)return false;
  for(const [dq,dr] of DIRS){const other=layout.cells[key(q+dq,r+dr)];if(other&&layout.modules[other]?.group!==gid)return false;}
  return true;
}
// New districts take the middle of the widest free angle, so earlier districts keep their place.
function placeDistrict(layout,gid,core){
  if(layout.districts[gid])return layout.districts[gid];
  let angle=0,q=0,r=0;
  if(!core){
    const angles=Object.values(layout.districts).filter(d=>!d.core).map(d=>d.angle).sort((a,b)=>a-b);
    if(!angles.length)angle=Math.PI*0.75;
    else{
      let best=-1,start=0;
      for(let i=0;i<angles.length;i++){const a=angles[i],b=i+1<angles.length?angles[i+1]:angles[0]+Math.PI*2;if(b-a>best+1e-9){best=b-a;start=a;}}
      angle=(start+best/2)%(Math.PI*2);
    }
    for(let radius=DISTRICT_RADIUS;radius<200;radius++){
      [q,r]=cellAt(Math.cos(angle)*radius*SQRT3,Math.sin(angle)*radius*SQRT3);
      if(admissible(layout,gid,q,r,false))break;
    }
  }
  const d={id:gid,core,angle,q,r,order:layout.order++,dirs:{}};
  layout.districts[gid]=d;return d;
}
function placeModule(layout,{id,group,dir,core=false}){
  const existing=layout.modules[id];
  if(existing&&existing.group===group)return existing;
  if(existing)removeModule(layout,id);
  const d=placeDistrict(layout,group,core);
  // Files of the same folder gather around that folder's centre; a new folder starts next to the district.
  const siblings=(d.dirs[dir]||[]).map(m=>layout.modules[m]).filter(Boolean);
  let tq=d.q,tr=d.r;
  if(siblings.length){const c=siblings.reduce((a,m)=>{const w=world(m.q,m.r);return {x:a.x+w.x/siblings.length,z:a.z+w.z/siblings.length};},{x:0,z:0});[tq,tr]=cellAt(c.x,c.z);}
  let best=null;
  for(let radius=0;radius<80&&!best;radius++){
    for(const [q,r] of ring(tq,tr,radius)){
      if(!admissible(layout,group,q,r,core))continue;
      const score=hexDistance(q,r,tq,tr)+0.5*hexDistance(q,r,d.q,d.r);
      if(!best||score<best.score||(score===best.score&&(q<best.q||(q===best.q&&r<best.r))))best={q,r,score};
    }
    // Look one ring further so a slightly better cell (closer to the district) can still win.
    if(best&&radius>0){for(const [q,r] of ring(tq,tr,radius+1)){if(!admissible(layout,group,q,r,core))continue;const score=hexDistance(q,r,tq,tr)+0.5*hexDistance(q,r,d.q,d.r);if(score<best.score)best={q,r,score};}}
  }
  const m={id,group,dir,q:best.q,r:best.r};
  layout.modules[id]=m;layout.cells[key(m.q,m.r)]=id;(d.dirs[dir]=d.dirs[dir]||[]).push(id);
  return m;
}
function removeModule(layout,id){
  const m=layout.modules[id];if(!m)return;
  delete layout.cells[key(m.q,m.r)];delete layout.modules[id];
  const d=layout.districts[m.group];if(d&&d.dirs[m.dir])d.dirs[m.dir]=d.dirs[m.dir].filter(x=>x!==id);
}
module.exports={groupOf,dirOf,newLayout,placeModule,removeModule,world,hexDistance,DIRS};
